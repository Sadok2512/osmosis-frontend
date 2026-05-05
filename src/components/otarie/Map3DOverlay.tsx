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

    // If we're zoomed-out (whole country) or have no sites in viewport,
    // default to Paris so 3D buildings (zoom >= 13) are actually visible.
    let initialCenter: [number, number] = [center[1], center[0]];
    let initialZoom = zoom;
    const isWideView = zoom < 12;
    if (isWideView && sites.length > 0) {
      initialCenter = [sites[0].coordinates[1], sites[0].coordinates[0]];
      initialZoom = 16;
    } else if (isWideView) {
      initialCenter = [2.3522, 48.8566]; // Paris
      initialZoom = 16;
    } else {
      initialZoom = Math.max(zoom, 15);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES[styleVariant] || STYLES.street,
      center: initialCenter,
      zoom: initialZoom,
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

      // Sites/cells intentionally hidden in 3D mode — focus on 3D map only
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sites layer disabled in 3D mode

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
