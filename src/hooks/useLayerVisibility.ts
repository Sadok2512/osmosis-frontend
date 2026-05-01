import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayerVisibility,
  LayerThresholds,
  VisibilityChange,
  throttle,
} from "@/lib/layerVisibility";

/**
 * Minimal map shape we need. Covers Leaflet (`zoom` / `zoomend`) and
 * Mapbox GL — same surface, different default event.
 */
type MapLike = {
  getZoom: () => number;
  on: (ev: string, cb: () => void) => void;
  off: (ev: string, cb: () => void) => void;
};

export interface UseLayerVisibilityOptions<K extends string> {
  map: MapLike | null;
  thresholds: Record<K, LayerThresholds>;
  /**
   * Leaflet emits 'zoomend' (per-step). Mapbox GL emits a continuous
   * 'zoom' event. Default = 'zoomend' since q100bit uses Leaflet.
   */
  zoomEvent?: "zoom" | "zoomend";
  throttleMs?: number;
  /**
   * Side-effect callback for each flip. Use to add/remove Leaflet
   * layer groups, toggle Mapbox visibility, etc.
   */
  onChange?: (changes: VisibilityChange<K>[]) => void;
}

/**
 * React hook around LayerVisibility.
 *
 * Returns:
 *   - `visible`: a record { [layerKey]: boolean } that re-renders the
 *     component when a layer flips. Use it in JSX (legend badges,
 *     conditional <Marker>s, etc.)
 *   - `isVisible(key)`: imperative read, fresh value, safe inside
 *     event handlers without stale-closure issues.
 *
 * Side effects:
 *   - The class instance and event listener are created once per
 *     (map, thresholds, zoomEvent) tuple. Inline thresholds objects
 *     are fine — the deep-compare via JSON.stringify keeps the hook
 *     stable across re-renders with identical values.
 */
export function useLayerVisibility<K extends string>({
  map,
  thresholds,
  zoomEvent = "zoomend",
  throttleMs = 80,
  onChange,
}: UseLayerVisibilityOptions<K>) {
  // Compare thresholds by value, not reference. Lets the caller pass
  // a fresh object literal each render without rebuilding the manager.
  const thresholdsKey = useMemo(
    () => JSON.stringify(thresholds),
    [thresholds],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const visRef = useRef<LayerVisibility<K> | null>(null);

  const [visible, setVisible] = useState<Record<K, boolean>>(() => {
    const out = {} as Record<K, boolean>;
    for (const k of Object.keys(thresholds) as K[]) out[k] = false;
    return out;
  });

  useEffect(() => {
    if (!map) return;

    const vis = new LayerVisibility<K>(thresholds, map.getZoom());
    visRef.current = vis;

    // First sync against the current zoom.
    const initial = vis.resync(map.getZoom());
    if (initial.length) onChangeRef.current?.(initial);
    setVisible(snapshot(vis, thresholds));

    const handle = throttle(() => {
      const changes = vis.update(map.getZoom());
      if (!changes.length) return;
      onChangeRef.current?.(changes);
      setVisible(snapshot(vis, thresholds));
    }, throttleMs);

    map.on(zoomEvent, handle);
    return () => {
      map.off(zoomEvent, handle);
      visRef.current = null;
    };
    // thresholdsKey is the value-based dep (covers `thresholds` content).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, thresholdsKey, zoomEvent, throttleMs]);

  const isVisible = useCallback(
    (k: K) => visRef.current?.isVisible(k) ?? false,
    [],
  );

  return { visible, isVisible };
}

function snapshot<K extends string>(
  vis: LayerVisibility<K>,
  thresholds: Record<K, LayerThresholds>,
): Record<K, boolean> {
  const out = {} as Record<K, boolean>;
  for (const k of Object.keys(thresholds) as K[]) out[k] = vis.isVisible(k);
  return out;
}
