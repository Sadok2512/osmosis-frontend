import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl, { Map, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SiteSummary } from '@/types';

type LngLat = [number, number];

interface MapLibre3DViewProps {
  sites: SiteSummary[];
  center: LngLat;
  zoom: number;
  onSiteClick?: (id: string) => void;
  onViewportChange?: (center: LngLat, zoom: number) => void;
}

const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const TECH_COLORS: Record<'2G' | '3G' | '4G' | '5G', string> = {
  '2G': '#8E44AD',
  '3G': '#3498DB',
  '4G': '#F39C12',
  '5G': '#27AE60',
};

const dominantTech = (site: SiteSummary): keyof typeof TECH_COLORS => {
  const raw = [
    ...(site.technos || []),
    site.techno || '',
    ...(site.cells || []).map((cell) => cell.techno || ''),
  ].join(' ').toUpperCase();

  if (raw.includes('5G') || raw.includes('NR')) return '5G';
  if (raw.includes('4G') || raw.includes('LTE')) return '4G';
  if (raw.includes('3G') || raw.includes('UMTS') || raw.includes('WCDMA')) return '3G';
  return '2G';
};

const validLngLat = (center: LngLat): boolean =>
  Number.isFinite(center[0]) && Number.isFinite(center[1]);

const MapLibre3DView: React.FC<MapLibre3DViewProps> = ({
  sites,
  center,
  zoom,
  onSiteClick,
  onViewportChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSiteClickRef = useRef(onSiteClick);

  onViewportChangeRef.current = onViewportChange;
  onSiteClickRef.current = onSiteClick;

  const safeCenter = useMemo<LngLat>(() => (
    validLngLat(center) ? center : [2.2137, 46.2276]
  ), [center]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_LIBERTY_STYLE,
      center: safeCenter,
      zoom: Number.isFinite(zoom) ? zoom : 7,
      pitch: 45,
      bearing: 0,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      const layers = map.getStyle().layers || [];
      const firstSymbol = layers.find((layer) => layer.type === 'symbol')?.id;
      if (!map.getLayer('osmosis-3d-buildings') && map.getSource('openmaptiles')) {
        map.addLayer(
          {
            id: 'osmosis-3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': 'hsl(215, 18%, 72%)',
              'fill-extrusion-opacity': 0.62,
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 3],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            },
          },
          firstSymbol,
        );
      }
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      onViewportChangeRef.current?.([c.lng, c.lat], map.getZoom());
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !validLngLat(safeCenter)) return;
    map.jumpTo({ center: safeCenter, zoom: Number.isFinite(zoom) ? zoom : map.getZoom(), pitch: 45, bearing: 0 });
    setTimeout(() => map.resize(), 0);
  }, [safeCenter, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    sites.forEach((site) => {
      const [lat, lng] = site.coordinates || [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const tech = dominantTech(site);
      const marker = new maplibregl.Marker({ color: TECH_COLORS[tech] })
        .setLngLat([lng, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16 }).setHTML(
            `<strong>${site.site_name || site.site_id}</strong><br/>${tech} · ${site.cell_count ?? site.cells?.length ?? 0} cells`,
          ),
        );

      marker.getElement().style.cursor = 'pointer';
      marker.getElement().addEventListener('click', () => onSiteClickRef.current?.(site.site_id));
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [sites]);

  return (
    <div className="absolute inset-0 bg-background">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
        3D View · Sites only
      </div>
    </div>
  );
};

export default MapLibre3DView;
