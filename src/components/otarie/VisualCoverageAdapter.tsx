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
  /** Forwarded to `initVisualCoverage`. Defaults match the module's
   *  own DEFAULTS so callers don't have to think about them. */
  maxRadiusMeters?: number;
  /** Optional callbacks so the parent can drive a custom status UI. */
  onCellsLoaded?: (count: number) => void;
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
  maxRadiusMeters = VC_MAX_RADIUS_METERS,
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

  // ── fetch cells whenever bbox / filters change ──
  useEffect(() => {
    if (!enabled || !bbox || !ctlRef.current) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, { techno, vendor, signal: ctrl.signal })
      .then(({ cells }) => {
        ctlRef.current?.rebuild?.(cells);
        onCellsLoaded?.(cells.length);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const msg = err?.message || String(err);
        console.warn('[VisualCoverageAdapter] fetch failed:', msg);
        onError?.(msg);
      });
    return () => ctrl.abort();
  }, [enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, techno, vendor]);

  return null; // imperative — nothing to render
};

export default VisualCoverageAdapter;
