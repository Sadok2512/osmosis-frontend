/**
 * Zoom-driven layer visibility with hysteresis.
 *
 * Keeps a layer visible/hidden across a buffer band so small zoom
 * jitter doesn't toggle the layer on every event:
 *
 *   show:  invisible → visible    when zoom >= showAt
 *   hide:  visible   → invisible  when zoom <= hideAt
 *
 * Inside the band ]hideAt ; showAt[ the previous state is preserved.
 * That's the whole point — no flicker on pinch / wheel jitter.
 *
 * Pure logic, framework-agnostic. The React hook in
 * src/hooks/useLayerVisibility.ts wraps this for Leaflet maps.
 */

export type LayerThresholds = { showAt: number; hideAt: number };

export interface VisibilityChange<K extends string> {
  layer: K;
  visible: boolean;
}

export class LayerVisibility<K extends string> {
  private state = new Map<K, boolean>();
  private readonly thresholds: Map<K, LayerThresholds>;

  constructor(thresholds: Record<K, LayerThresholds>, initialZoom?: number) {
    this.thresholds = new Map(
      Object.entries(thresholds) as [K, LayerThresholds][],
    );
    for (const [k, t] of this.thresholds) {
      if (t.showAt <= t.hideAt) {
        throw new Error(
          `[LayerVisibility] '${k}': showAt (${t.showAt}) must be > hideAt (${t.hideAt}) — that's what gives the hysteresis band`,
        );
      }
      this.state.set(k, initialZoom != null && initialZoom >= t.showAt);
    }
  }

  /**
   * Feed a new zoom value. Returns ONLY the layers that flipped.
   * Caller applies them to the map. Inside the buffer band, returns [].
   */
  update(zoom: number): VisibilityChange<K>[] {
    const changes: VisibilityChange<K>[] = [];
    for (const [layer, t] of this.thresholds) {
      const wasVisible = this.state.get(layer) ?? false;
      let nowVisible = wasVisible;
      if (!wasVisible && zoom >= t.showAt) nowVisible = true;
      else if (wasVisible && zoom <= t.hideAt) nowVisible = false;
      if (nowVisible !== wasVisible) {
        this.state.set(layer, nowVisible);
        changes.push({ layer, visible: nowVisible });
      }
    }
    return changes;
  }

  isVisible(layer: K): boolean {
    return this.state.get(layer) ?? false;
  }

  /** Force re-evaluation against zoom (e.g. after a layer reload). */
  resync(zoom: number): VisibilityChange<K>[] {
    const changes: VisibilityChange<K>[] = [];
    for (const [layer, t] of this.thresholds) {
      const target =
        zoom >= t.showAt
          ? true
          : zoom <= t.hideAt
          ? false
          : this.state.get(layer) ?? false;
      const prev = this.state.get(layer) ?? false;
      if (target !== prev) {
        this.state.set(layer, target);
        changes.push({ layer, visible: target });
      }
    }
    return changes;
  }
}

/**
 * Leading + trailing throttle. The trailing call ensures the very last
 * zoom value during a pinch gesture is not lost.
 */
export function throttle<F extends (...a: unknown[]) => void>(
  fn: F,
  ms = 80,
): F {
  let last = 0;
  let pending: unknown[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = (a: unknown[]) => {
    last = Date.now();
    fn(...(a as Parameters<F>));
  };
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fire(args);
    } else {
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) {
            fire(pending);
            pending = null;
          }
        }, remaining);
      }
    }
  }) as F;
}
