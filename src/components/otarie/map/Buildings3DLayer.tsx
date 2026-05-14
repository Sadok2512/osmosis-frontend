import { useEffect, useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

const OSMB_SRC = 'https://cdn.osmbuildings.org/classic/0.2.2b/OSMBuildings-Leaflet.js';
const OSMB_DATA = 'https://{s}.data.osmbuildings.org/0.2/anonymous/tile/{z}/{x}/{y}.json';
const MIN_ZOOM = 16;

let loaderPromise: Promise<any> | null = null;
function loadOSMB(): Promise<any> {
  if ((window as any).OSMBuildings) return Promise.resolve((window as any).OSMBuildings);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OSMB_SRC;
    s.async = true;
    s.onload = () => resolve((window as any).OSMBuildings);
    s.onerror = () => { loaderPromise = null; reject(new Error('OSMBuildings load failed')); };
    document.head.appendChild(s);
  });
  return loaderPromise;
}

/**
 * 3D buildings overlay (OSMBuildings) — auto-enabled at zoom >= 16.
 * Removes itself below threshold to keep perf clean.
 */
export default function Buildings3DLayer({ enabled = true }: { enabled?: boolean }) {
  const map = useMap();
  const layerRef = useRef<any>(null);
  const [zoom, setZoom] = useState<number>(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  useEffect(() => {
    let cancelled = false;
    const shouldShow = enabled && zoom >= MIN_ZOOM;

    if (!shouldShow) {
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      return;
    }

    if (layerRef.current) return;

    loadOSMB().then((OSMB) => {
      if (cancelled || !OSMB) return;
      try {
        const osmb = new OSMB(map).load(OSMB_DATA);
        layerRef.current = osmb;
      } catch (e) {
        console.warn('[Buildings3D] init failed', e);
      }
    }).catch((e) => console.warn('[Buildings3D]', e));

    return () => { cancelled = true; };
  }, [enabled, zoom, map]);

  useEffect(() => () => {
    if (layerRef.current) {
      try { map.removeLayer(layerRef.current); } catch {}
      layerRef.current = null;
    }
  }, [map]);

  return null;
}
