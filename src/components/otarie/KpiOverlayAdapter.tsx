/**
 * KpiOverlayAdapter — react-leaflet bridge for the drop-in KPI Overlay
 * JS module (`src/coverage/kpi-*.js`).
 *
 * The module is imperative: `initKpiOverlay({ map, cells, fetchKpiValues,
 * panelMount, catalog })` mounts a Leaflet GeoJSON layer + a vanilla
 * legend DOM block. It accepts `cells` only at init time — there is no
 * public `setCells`/`rebuild(cells)` — so the adapter re-inits the
 * controller whenever the materially-different cell set changes (cached
 * via `fetchCellsForCoverage` so panning back doesn't pay a refetch).
 *
 * Lifecycle:
 *   bbox → fetchCellsForCoverage → cells signature → (re)init module
 *   view changes → ctl.setView(view) (no re-init, the module re-fetches
 *                                     KPI values and rebuilds the layer)
 *
 * Scope decision 2026-05-11: only `view.level === 'Cellule'` activates
 * the overlay. Other levels log a warning and skip. Lift this guard
 * when the OSMOSIS engine ships site/band aggregation.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { fetchCellsForCoverage, CoverageCell } from '@/services/topoService';
// Plain JS module — no .d.ts; `any` is intentional.
import { initKpiOverlay } from '@/coverage/kpi-overlay-layer.js';
import { realFetchKpiValues } from '@/coverage/kpi-backend.js';

export type KpiCatalogItem = {
  id: string;
  label?: string;
  unit?: string;
  category?: string;
  techno?: string;
};

export type KpiOverlayView = {
  name: string;
  tech: '4G' | '5G';
  /** Only 'Cellule' is honoured today (UX scope 2026-05-11). */
  level: 'Cellule' | 'Site';
  period: [string, string];
  selectedKpis: string[];
  aggregation?: 'avg' | 'sum' | 'max' | 'last';
};

interface Bounds { minLng: number; minLat: number; maxLng: number; maxLat: number; }

interface Props {
  enabled: boolean;
  /** DOM node for the gradient legend. The module won't render the
   *  legend without it; the layer still draws. */
  panelMount: HTMLElement | null;
  /** Bbox to fetch cells for. When this changes the adapter refetches
   *  and re-inits the controller. */
  bbox: Bounds | null;
  /** Project KPI catalog — units + direction (higher/lower = better)
   *  + group. Derived from MAP_KPIS in the parent. */
  catalogSource: KpiCatalogItem[];
  /** Active view; pass `null` to keep the overlay idle. */
  view: KpiOverlayView | null;
  onReady?: (info: { nCells: number; primaryKpi?: string; composite?: boolean; elapsedMs?: number }) => void;
  onError?: (msg: string) => void;
}

/** Heuristic mapping of KPI code → direction. The OSMOSIS catalog
 *  doesn't carry an authoritative `direction` column today, so we flip
 *  on common loss/error/availability substrings. Refine once the
 *  engine exposes the real direction. */
function inferDirection(code: string): 'higher' | 'lower' {
  return /drop|fail|latency|timeout|error|unavail|loss/i.test(code) ? 'lower' : 'higher';
}

function buildKpiCatalog(items: KpiCatalogItem[]) {
  return items.map((k) => ({
    name: k.id,
    unit: k.unit || '',
    direction: inferDirection(k.id),
    group: k.category || 'OTHER',
    tech: k.techno && k.techno !== 'all' ? [k.techno.toUpperCase()] : ['4G', '5G'],
  }));
}

const KpiOverlayAdapter: React.FC<Props> = ({
  enabled,
  panelMount,
  bbox,
  catalogSource,
  view,
  onReady,
  onError,
}) => {
  const map = useMap();
  const ctlRef = useRef<any>(null);
  const [cells, setCells] = useState<CoverageCell[]>([]);

  // Stable signature of the cells set. The module accepts `cells` only
  // at init, so we re-init when this string changes — but NOT on
  // unrelated bbox jitter (the LRU cache in fetchCellsForCoverage
  // returns the same payload for nearby pans).
  const cellsSig = useMemo(() => cells.map((c) => c.id).join('|'), [cells]);

  const catalog = useMemo(() => buildKpiCatalog(catalogSource), [catalogSource]);

  // ── fetch cells whenever bbox / enabled toggle ──
  useEffect(() => {
    if (!enabled || !bbox) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, { signal: ctrl.signal })
      .then(({ cells: c }) => setCells(c))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        onError?.(err?.message || String(err));
      });
    return () => ctrl.abort();
  }, [enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat]);

  // ── init / teardown — re-init when the materially-different cell
  //    set changes, or when map/mount node change. ──
  useEffect(() => {
    if (!map || cells.length === 0) return;
    const ctl = initKpiOverlay({
      map,
      cells,
      fetchKpiValues: realFetchKpiValues,
      panelMount: panelMount ?? undefined,
      catalog,
      defaultEnabled: enabled,
    });
    ctlRef.current = ctl;
    if (onReady) ctl.on?.('ready', (info: any) => onReady({
      nCells: info?.nCells ?? 0,
      primaryKpi: info?.primaryKpi,
      composite: info?.composite,
      elapsedMs: info?.elapsedMs,
    }));
    if (onError) ctl.on?.('error', (err: any) => onError(err?.message || String(err)));

    // If a view is already set when init completes, kick the first
    // setView immediately so the layer doesn't sit blank.
    if (view && view.level === 'Cellule' && view.selectedKpis?.length) {
      ctl.setView({
        name: view.name,
        tech: view.tech,
        level: view.level,
        period: view.period,
        selectedKpis: view.selectedKpis,
        aggregation: view.aggregation || 'avg',
      });
    }

    return () => {
      try { ctl.destroy(); } catch { /* best-effort */ }
      ctlRef.current = null;
    };
    // Re-init triggers: map / panel mount / cells signature / catalog.
    // `enabled` and `view` are driven by their own effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, panelMount, cellsSig, catalog]);

  // ── enabled toggle (React → module) ──
  useEffect(() => {
    ctlRef.current?.setEnabled?.(enabled);
  }, [enabled]);

  // ── view changes → setView (async fetch + rebuild) ──
  useEffect(() => {
    if (!enabled || !view || !ctlRef.current) return;
    if (view.level !== 'Cellule') {
      // eslint-disable-next-line no-console
      console.warn('[KpiOverlayAdapter] level !== "Cellule" — overlay skipped:', view.level);
      return;
    }
    if (!view.selectedKpis?.length) return;
    ctlRef.current.setView({
      name: view.name,
      tech: view.tech,
      level: view.level,
      period: view.period,
      selectedKpis: view.selectedKpis,
      aggregation: view.aggregation || 'avg',
    });
  }, [enabled, view?.name, view?.tech, view?.level, view?.period?.[0], view?.period?.[1], view?.selectedKpis?.join(',')]);

  return null;
};

export default KpiOverlayAdapter;
