/**
 * VisualCoverageAdapter — React/react-leaflet bridge for the drop-in
 * Visual Coverage JS module (`src/coverage/`).
 *
 * The module is imperative: `initVisualCoverage({ map, cells, panelMount,
 * ... })` mounts a Leaflet GeoJSON layer + a vanilla DOM panel. This
 * adapter:
 *
 *   1. Lives inside a `<MapContainer>` and calls `useMap()` to grab the
 *      underlying `L.Map` instance the module needs.
 *   2. Takes a `panelMount` DOM ref from the parent (where the operator
 *      wants the panel — sidebar dashboards under "Ajouter une vue").
 *   3. Refetches `/topo/cells-for-coverage` whenever the viewport bbox
 *      changes (debounced) and calls `ctl.rebuild(cells)`.
 *   4. Cleans up on unmount (`ctl.destroy()` removes the layer + panel
 *      from the DOM).
 *
 * Per project rule: do NOT modify the module files. All wiring lives
 * here so the module stays drop-in-replaceable.
 */
import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { fetchCellsForCoverage, CoverageCell } from '@/services/topoService';
// Module is plain JS without TS types — `any` is intentional; the API
// surface is small (setEnabled / rebuild / destroy / on / isEnabled).
import { initVisualCoverage } from '@/coverage/coverage-layer.js';

// Visual Coverage cap (2026-05-11). Bumped from 1500 → 10000 m so dense
// metropolitan zones (Aix/Marseille) get edge-to-edge wedge pavage via
// the adaptive-radius clipping in coverage.js; rural sites with no
// neighbour within 20 km keep a full 10 km disk.
const VC_MAX_RADIUS_METERS = 10000;

interface Bounds { minLng: number; minLat: number; maxLng: number; maxLat: number; }

/** Threshold rule that converts a numeric KPI value into a tier. With
 *  `invert: false` (higher = better):  value ≥ green → 'green', else
 *  value ≥ orange → 'orange', else 'red'. With `invert: true`
 *  (lower = better) the comparisons flip. */
export interface KpiThresholds {
  green: number;
  orange: number;
  invert?: boolean;
}

interface Props {
  enabled: boolean;
  /** DOM node where the module mounts its vanilla panel (toggle + status
   *  pill + counters). Pass `null` to skip the panel; the layer still
   *  renders on the map. */
  panelMount: HTMLElement | null;
  /** Viewport bbox. When this changes the adapter re-fetches the cells
   *  list and rebuilds the Voronoi polygons. */
  bbox: Bounds | null;
  /** Optional pre-filter forwarded to the backend query. */
  techno?: string;
  vendor?: string;
  /** Forwarded to `initVisualCoverage`. Defaults match the module's
   *  own DEFAULTS so callers don't have to think about them. */
  maxRadiusMeters?: number;
  /** Optional KPI-tier coloring (2026-05-11). When provided, the
   *  adapter post-processes the fetched cell list and replaces each
   *  `cell.kpi` with the tier derived from
   *  `kpiValueMap.get(cell.id) → thresholds`. Cells with no value land
   *  in tier `'unknown'` (grey). The wedge palette already knows about
   *  green / orange / red / unknown. */
  kpiCode?: string;
  kpiValueMap?: Map<string, number> | null;
  kpiThresholds?: KpiThresholds | null;
  /** Optional callbacks so the parent can drive a custom status UI. */
  onCellsLoaded?: (count: number) => void;
  onError?: (message: string) => void;
  /** Fired when the user clicks the module's panel toggle — lets the
   *  parent mirror the on/off state in React (needed so save-view
   *  serialises the right value). Not called for programmatic
   *  setEnabled (i.e. React-driven changes don't echo back). */
  onEnabledChange?: (enabled: boolean) => void;
}

/** Map a numeric value to a 3-tier code per the threshold rule. Returns
 *  `'unknown'` when value is null/undefined/NaN — the wedge renderer
 *  paints that with the No-data grey. */
function valueToTier(value: number | null | undefined, t: KpiThresholds | null | undefined): 'green' | 'orange' | 'red' | 'unknown' {
  if (!t || value == null || !Number.isFinite(value)) return 'unknown';
  if (t.invert) {
    if (value <= t.green)  return 'green';
    if (value <= t.orange) return 'orange';
    return 'red';
  }
  if (value >= t.green)  return 'green';
  if (value >= t.orange) return 'orange';
  return 'red';
}

const VisualCoverageAdapter: React.FC<Props> = ({
  enabled,
  panelMount,
  bbox,
  techno,
  vendor,
  maxRadiusMeters = VC_MAX_RADIUS_METERS,
  kpiCode,
  kpiValueMap,
  kpiThresholds,
  onCellsLoaded,
  onError,
  onEnabledChange,
}) => {
  const map = useMap();
  // Module controller — kept in a ref so the fetch effect can call
  // `rebuild` without retriggering the init effect on every cells update.
  const ctlRef = useRef<any>(null);
  // Track the panel mount we initialised with. The module only accepts
  // `panelMount` at init time; if it changes we tear down and re-init.
  const initialPanelMountRef = useRef<HTMLElement | null>(null);

  // ── init / teardown ──
  useEffect(() => {
    if (!map) return;
    // Start with an empty cells array — the fetch effect feeds real
    // data on the next tick. Passing `[]` is fine: `buildVoronoiCoverage`
    // returns an empty FeatureCollection and the panel reports 0 cells.
    initialPanelMountRef.current = panelMount;
    const ctl = initVisualCoverage({
      map,
      cells: [] as CoverageCell[],
      panelMount: panelMount ?? undefined,
      defaultEnabled: enabled,
      maxRadiusMeters,
    });
    ctlRef.current = ctl;
    return () => {
      try { ctl.destroy(); } catch { /* swallow — destroy is best-effort */ }
      ctlRef.current = null;
    };
    // Re-init only when the underlying map or panel mount node actually
    // changes — not when enabled flips (that's `setEnabled`) and not on
    // every bbox tick. `enabled` is read once on init via defaultEnabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, panelMount]);

  // ── enabled toggle (React → module) ──
  useEffect(() => {
    ctlRef.current?.setEnabled?.(enabled);
  }, [enabled]);

  // ── enabled toggle (module → React) ──
  // The module's panel switch flips its own state on click but doesn't
  // expose an event. We listen for native clicks on the `.cov-switch`
  // node inside the mount and read the post-click DOM state. Programmatic
  // changes via setEnabled don't trigger a real click event, so this
  // listener only sees user-driven toggles — no feedback loop.
  useEffect(() => {
    if (!panelMount || !onEnabledChange) return;
    const sw = panelMount.querySelector<HTMLElement>('.cov-switch');
    if (!sw) return;
    const handler = () => {
      // Read on the next tick — the module's own handler also runs on
      // this click and updates the class. Order is preserved by the
      // event loop so a microtask is enough.
      queueMicrotask(() => onEnabledChange(sw.classList.contains('on')));
    };
    sw.addEventListener('click', handler);
    return () => sw.removeEventListener('click', handler);
  }, [panelMount, onEnabledChange]);

  // Deterministic signature of the active KPI-tier config — used so the
  // fetch effect rebuilds the cells (with re-coloring) when the KPI
  // selection changes inside the same bbox. 4 scalars, never values
  // themselves (avoids infinite re-render if the Map is rebuilt with
  // equal contents but a new reference).
  const kpiSig = (() => {
    if (!kpiCode || !kpiValueMap || kpiValueMap.size === 0) return '';
    let min = Infinity, max = -Infinity;
    for (const v of kpiValueMap.values()) {
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return `${kpiCode}|${kpiValueMap.size}|${Number.isFinite(min) ? min : 'na'}|${Number.isFinite(max) ? max : 'na'}`;
  })();

  // ── fetch cells whenever bbox / filters / KPI signature change ──
  useEffect(() => {
    if (!enabled || !bbox || !ctlRef.current) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, { techno, vendor, signal: ctrl.signal })
      .then(({ cells }) => {
        // KPI-tier override (2026-05-11). When a kpiValueMap is provided
        // by the parent, replace `cell.kpi` per cell — 'green' / 'orange'
        // / 'red' / 'unknown'. The module's wedge renderer reads .kpi
        // and pulls the matching colour from KPI_COLOR, so no module
        // change is needed beyond the palette tweak in coverage-layer.js.
        let coloured = cells;
        if (kpiValueMap && kpiThresholds) {
          coloured = cells.map((c) => ({
            ...c,
            kpi: valueToTier(kpiValueMap.get(c.id), kpiThresholds),
          }));
        }
        //DIAG — KPI tier override visibility (2026-05-11). Logs the
        //DIAG state of the value map vs the fetched cells so we can tell
        //DIAG whether (a) the map is empty, (b) the keys don't match, or
        //DIAG (c) every cell lands in a single tier. Remove once the
        //DIAG colouring is validated.
        // eslint-disable-next-line no-console
        console.log('[diag] VC override:', {
          hasValueMap: !!kpiValueMap,
          mapSize: kpiValueMap?.size ?? 0,
          mapKeysSample: kpiValueMap ? [...kpiValueMap.keys()].slice(0, 3) : [],
          thresholds: kpiThresholds,
          sampleCellId: cells[0]?.id,
          sampleValue: kpiValueMap?.get?.(cells[0]?.id),
          sampleTier: coloured[0]?.kpi,
          tierDistribution: coloured.reduce((acc: Record<string, number>, c: any) => {
            const k = c.kpi || 'unknown';
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          totalCellsWithValue: kpiValueMap ? cells.filter(c => kpiValueMap.has(c.id)).length : 0,
          totalCellsWithoutValue: kpiValueMap ? cells.filter(c => !kpiValueMap.has(c.id)).length : cells.length,
        });
        ctlRef.current?.rebuild?.(coloured);
        onCellsLoaded?.(coloured.length);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const msg = err?.message || String(err);
        console.warn('[VisualCoverageAdapter] fetch failed:', msg);
        onError?.(msg);
      });
    return () => ctrl.abort();
  }, [enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, techno, vendor, kpiSig, kpiThresholds?.green, kpiThresholds?.orange, kpiThresholds?.invert]);

  return null; // imperative — nothing to render
};

export default VisualCoverageAdapter;
