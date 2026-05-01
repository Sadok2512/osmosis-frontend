/**
 * useDensityLOD — viewport-culled, density-driven Level-of-Detail hook for maps.
 *
 * Solves the "map hangs on dense city zoom" issue: instead of rendering every
 * site/cell in the catalog, count what's actually inside the visible viewport
 * (+ buffer), and switch between two display modes based on a count threshold:
 *
 *   - 'site' mode  : count > threshold → render compact site dots only,
 *                    cells/sectors hidden (cheap render)
 *   - 'cell' mode  : count ≤ threshold → render full cell sectors with
 *                    azimuth, ready for visual analysis
 *
 * The mode switch uses **hysteresis** to prevent flicker when the operator
 * pans along a density edge:
 *   - enter 'site' mode when count > upper (default 600)
 *   - enter 'cell' mode when count < lower (default 400)
 *   - between [lower, upper] → keep current mode
 *
 * Works with both raw Leaflet (`L.map(...)` ref) and react-leaflet
 * (`useMap()` return value) — the hook only needs the LeafletMap-shaped
 * `getBounds()` / `on(event)` interface.
 *
 * Usage (raw Leaflet, e.g. NetworkTopologyPage):
 *   const { mode, visibleItems } = useDensityLOD({
 *     map: mapRef.current,
 *     items: allSitesRef.current,
 *     getLatLng: (s) => [s.latitude, s.longitude],
 *   });
 *
 * Usage (react-leaflet, e.g. PAMapWidget):
 *   const map = useMap();
 *   const { mode, visibleItems } = useDensityLOD({ map, items, getLatLng });
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface LeafletMapShape {
  getBounds: () => {
    pad: (ratio: number) => {
      contains: (latlng: [number, number]) => boolean;
    };
    contains: (latlng: [number, number]) => boolean;
  };
  on: (evt: string, fn: () => void) => void;
  off: (evt: string, fn: () => void) => void;
}

export type LODMode = 'site' | 'cell';

export interface UseDensityLODOptions<T> {
  /** Map instance — `L.map(...)` ref or react-leaflet's `useMap()` value. Null safe. */
  map: LeafletMapShape | null;
  /** Full catalog of items (sites). Hook will filter to viewport-visible ones. */
  items: T[];
  /** Extract `[lat, lng]` from one item. */
  getLatLng: (item: T) => [number, number] | null;
  /**
   * Hysteresis bounds around the threshold the operator cares about.
   * Defaults: 500 ± 100 → enter site mode > 600, enter cell mode < 400.
   */
  upper?: number;
  /** Lower hysteresis bound. Default 400. */
  lower?: number;
  /** Viewport buffer (fraction of bounds size). Default 0.2 → 20% padding so
   *  markers near the edge don't pop in/out as the operator pans. */
  bufferPct?: number;
  /** Debounce for `moveend` / `zoomend` events (ms). Default 100. */
  debounceMs?: number;
}

export interface UseDensityLODResult<T> {
  /** 'site' = render dots only, 'cell' = render full sectors. */
  mode: LODMode;
  /** Items currently inside the viewport (+ buffer). Render only these. */
  visibleItems: T[];
  /** Total count visible in viewport (sometimes useful for the legend). */
  visibleCount: number;
}

export function useDensityLOD<T>({
  map,
  items,
  getLatLng,
  upper = 600,
  lower = 400,
  bufferPct = 0.2,
  debounceMs = 100,
}: UseDensityLODOptions<T>): UseDensityLODResult<T> {
  // Mode lives in a ref so the hysteresis works without spurious re-renders;
  // we mirror it into state only when it actually flips.
  const modeRef = useRef<LODMode>('cell');
  const [mode, setMode] = useState<LODMode>('cell');
  const [visibleItems, setVisibleItems] = useState<T[]>([]);

  // Keep callbacks stable across renders so the map listener doesn't churn.
  const itemsRef = useRef(items);
  const getLatLngRef = useRef(getLatLng);
  itemsRef.current = items;
  getLatLngRef.current = getLatLng;

  useEffect(() => {
    if (!map) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      const bounds = map.getBounds().pad(bufferPct);
      const visible: T[] = [];
      for (const item of itemsRef.current) {
        const ll = getLatLngRef.current(item);
        if (!ll) continue;
        if (bounds.contains(ll)) visible.push(item);
      }
      const count = visible.length;
      // Hysteresis: only flip mode when crossing the relevant threshold.
      let next: LODMode = modeRef.current;
      if (modeRef.current === 'cell' && count > upper) next = 'site';
      else if (modeRef.current === 'site' && count < lower) next = 'cell';
      if (next !== modeRef.current) {
        modeRef.current = next;
        setMode(next);
      }
      setVisibleItems(visible);
    };

    const handle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, debounceMs);
    };

    // Initial compute on attach.
    recompute();
    map.on('moveend', handle);
    map.on('zoomend', handle);

    return () => {
      if (timer) clearTimeout(timer);
      map.off('moveend', handle);
      map.off('zoomend', handle);
    };
  }, [map, upper, lower, bufferPct, debounceMs]);

  // Recompute when the catalog changes (new items loaded), without re-binding
  // the map listeners.
  useEffect(() => {
    if (!map) return;
    const bounds = map.getBounds().pad(bufferPct);
    const visible: T[] = [];
    for (const item of items) {
      const ll = getLatLng(item);
      if (!ll) continue;
      if (bounds.contains(ll)) visible.push(item);
    }
    const count = visible.length;
    let next: LODMode = modeRef.current;
    if (modeRef.current === 'cell' && count > upper) next = 'site';
    else if (modeRef.current === 'site' && count < lower) next = 'cell';
    if (next !== modeRef.current) {
      modeRef.current = next;
      setMode(next);
    }
    setVisibleItems(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return useMemo(
    () => ({ mode, visibleItems, visibleCount: visibleItems.length }),
    [mode, visibleItems]
  );
}
