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
import React, { useEffect, useRef, useState } from 'react';
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
  plaque?: string;
  dor?: string;
  cluster?: string;
  band?: string;
  /** Optional PCI allow-list. Undefined/null means all PCI values; empty
   *  array intentionally renders no PCI footprint polygons. */
  selectedPciKeys?: string[] | null;
  /** Forwarded to `initVisualCoverage`. Defaults match the module's
   *  own DEFAULTS so callers don't have to think about them. */
  maxRadiusMeters?: number;
  /** Optional callbacks so the parent can drive a custom status UI. */
  onCellsLoaded?: (count: number) => void;
  onCellsChanged?: (cells: CoverageCell[]) => void;
  onError?: (message: string) => void;
  /** Fired when the user clicks the module's panel toggle — lets the
   *  parent mirror the on/off state in React (needed so save-view
   *  serialises the right value). Not called for programmatic
   *  setEnabled (i.e. React-driven changes don't echo back). */
  onEnabledChange?: (enabled: boolean) => void;
}

const VisualCoverageAdapter: React.FC<Props> = ({
  enabled,
  panelMount,
  bbox,
  techno,
  vendor,
  plaque,
  dor,
  cluster,
  band,
  selectedPciKeys,
  maxRadiusMeters = VC_MAX_RADIUS_METERS,
  onCellsLoaded,
  onCellsChanged,
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
  // 2026-05-19 — Cache the last fetched cells so a re-init triggered by
  // the opacity slider can immediately rebuild with real data instead of
  // waiting for the next bbox change (otherwise polygons disappear until
  // the user pans the map).
  const lastCellsRef = useRef<CoverageCell[]>([]);
  const selectedPciKey = selectedPciKeys == null ? '__all__' : selectedPciKeys.slice().sort().join('|');

  const filterCellsByPci = React.useCallback((cells: CoverageCell[]): CoverageCell[] => {
    if (selectedPciKeys == null) return cells;
    const allowed = new Set(selectedPciKeys);
    if (allowed.size === 0) return [];
    return cells.filter((cell) => {
      const key = cell.pci == null ? 'none' : `pci:${cell.pci}`;
      return allowed.has(key);
    });
  }, [selectedPciKey]);

  // Polygon fill opacity — driven by the "Visibilité des polygones" slider
  // in View Configuration (Cell Footprint). Persisted in localStorage and
  // updated via a window event so the slider can live anywhere in the tree.
  const [polygonOpacity, setPolygonOpacity] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('osmosis_coverage_polygon_opacity');
      const n = raw ? parseFloat(raw) : NaN;
      return Number.isFinite(n) && n >= 0.05 && n <= 1 ? n : 0.45;
    } catch { return 0.45; }
  });
  useEffect(() => {
    const onChange = (e: Event) => {
      const v = (e as CustomEvent<number>).detail;
      if (typeof v === 'number' && v >= 0.05 && v <= 1) setPolygonOpacity(v);
    };
    window.addEventListener('osmosis:coverage-opacity-change', onChange);
    return () => window.removeEventListener('osmosis:coverage-opacity-change', onChange);
  }, []);

  // ── init / teardown ──
  useEffect(() => {
    if (!map) return;
    initialPanelMountRef.current = panelMount;
    const ctl = initVisualCoverage({
      map,
      cells: [] as CoverageCell[],
      panelMount: panelMount ?? undefined,
      defaultEnabled: enabled,
      maxRadiusMeters,
      // Footprint slightly lighter than wedges to keep visual hierarchy.
      footprintFillOpacity: Math.max(0.05, polygonOpacity * 0.78),
      wedgeFillOpacity: polygonOpacity,
    });
    ctlRef.current = ctl;
    // If we already have cells in cache (re-init after slider change),
    // rebuild immediately so polygons stay on screen.
    if (lastCellsRef.current.length > 0) {
      try { ctl.rebuild(lastCellsRef.current); } catch { /* best-effort */ }
    }
    return () => {
      try { ctl.destroy(); } catch { /* swallow — destroy is best-effort */ }
      ctlRef.current = null;
    };
    // Re-init when opacity changes so the new fillOpacity options take effect
    // (the JS module reads opacity at init time, not per-rebuild).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, panelMount, polygonOpacity]);

  // ── enabled toggle (React → module) ──
  useEffect(() => {
    ctlRef.current?.setEnabled?.(enabled);
  }, [enabled]);

  // PCI filtering is local-only: reuse the last fetched cells and rebuild
  // the polygons without touching the topology/site caches or refetching.
  useEffect(() => {
    if (!ctlRef.current) return;
    const filtered = filterCellsByPci(lastCellsRef.current);
    ctlRef.current.rebuild?.(filtered);
    onCellsLoaded?.(filtered.length);
  }, [filterCellsByPci, onCellsLoaded]);

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

  // ── fetch cells whenever bbox / filters change ──
  useEffect(() => {
    if (!enabled || !bbox || !ctlRef.current) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, {
      techno,
      vendor,
      plaque,
      dor,
      cluster,
      band,
      signal: ctrl.signal,
    })
      .then(({ cells }) => {
        lastCellsRef.current = cells;
        const filtered = filterCellsByPci(cells);
        ctlRef.current?.rebuild?.(filtered);
        onCellsLoaded?.(filtered.length);
        onCellsChanged?.(cells);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const msg = err?.message || String(err);
        console.warn('[VisualCoverageAdapter] fetch failed:', msg);
        onError?.(msg);
      });
    return () => ctrl.abort();
  }, [enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, techno, vendor, plaque, dor, cluster, band]);

  return null; // imperative — nothing to render
};

export default VisualCoverageAdapter;
