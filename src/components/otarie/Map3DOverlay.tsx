import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface SitePoint {
  site_id: string;
  site_name?: string;
  coordinates: [number, number]; // [lat, lng]
  color?: string;
}

interface Map3DOverlayProps {
  sites: SitePoint[];
  center: [number, number]; // [lat, lng]
  zoom: number;
  styleVariant?: 'light' | 'dark' | 'street' | 'satellite';
  onClose: () => void;
}

const STYLES: Record<string, any> = {
  street: 'https://tiles.openfreemap.org/styles/liberty',
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  satellite: {
    version: 8,
    sources: {
      sat: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri',
      },
    },
    layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
  },
};

export default function Map3DOverlay({ sites, center, zoom, styleVariant = 'street', onClose }: Map3DOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES[styleVariant] || STYLES.street,
      center: [center[1], center[0]],
      zoom: Math.max(zoom, 14),
      pitch: 60,
      bearing: -20,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      // Add 3D buildings layer if vector source present
      const layers = map.getStyle().layers || [];
      const labelLayer = layers.find((l: any) => l.type === 'symbol' && l.layout?.['text-field']);
      const sources = map.getStyle().sources || {};
      const vectorSource = Object.keys(sources).find(
        (k) => (sources as any)[k].type === 'vector',
      );
      if (vectorSource) {
        try {
          map.addLayer(
            {
              id: '3d-buildings',
              source: vectorSource,
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 13,
              paint: {
                'fill-extrusion-color': '#aaa',
                'fill-extrusion-height': [
                  'coalesce',
                  ['get', 'render_height'],
                  ['get', 'height'],
                  ['*', ['coalesce', ['get', 'levels'], ['get', 'building:levels'], 3], 3],
                ],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                'fill-extrusion-opacity': 0.85,
              },
            },
            labelLayer?.id,
          );
        } catch (e) {
          console.warn('[Map3D] 3D buildings layer failed', e);
        }
      }

      // Add sites as circles
      const features = sites.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.site_id, name: s.site_name || s.site_id, color: s.color || '#F39C12' },
        geometry: { type: 'Point' as const, coordinates: [s.coordinates[1], s.coordinates[0]] },
      }));
      map.addSource('sites', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'sites-circles',
        type: 'circle',
        source: 'sites',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      map.on('click', 'sites-circles', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<div style="font-weight:600">${(f.properties as any).name}</div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'sites-circles', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'sites-circles', () => (map.getCanvas().style.cursor = ''));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update sites on change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('sites') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: sites.map((s) => ({
          type: 'Feature',
          properties: { id: s.site_id, name: s.site_name || s.site_id, color: s.color || '#F39C12' },
          geometry: { type: 'Point', coordinates: [s.coordinates[1], s.coordinates[0]] },
        })),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [sites]);

  return (
    <div className="absolute inset-0 z-[1100]">
      <div ref={containerRef} className="absolute inset-0" />
      <button
        onClick={onClose}
        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-md bg-card/95 backdrop-blur border border-border text-sm font-semibold shadow-lg hover:bg-muted"
      >
        ← Quitter 3D
      </button>
      <div className="absolute bottom-3 left-3 z-10 px-2 py-1 rounded bg-card/80 backdrop-blur border border-border text-[10px] text-muted-foreground">
        Vue 3D · clic-droit + glisser pour pivoter
      </div>
    </div>
  );
}
