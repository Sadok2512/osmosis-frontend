import React, { useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, Loader2, TableIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { DynWidget, TableWidgetConfig, DEFAULT_TABLE_CONFIG, TableColumn } from '../types';
import { fetchTable, TableRequest, TableResponse, TableRow, MonitorFilter, useKpiCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { getApiHeaders, getApiUrl } from '@/lib/apiConfig';
import { toBackendDimension, toBackendGranularity } from '../lib/monitorDimensions';

interface Props {
  height?: number | string;
  /** Widget instance — drives KPI columns, split, filters, period. */
  widget?: DynWidget;
}

/**
 * Backend-wired table widget. Mirrors the chart's data flow:
 *   – inherits the global PA toolbar (Périmètre/Date/Filters/Grain) by default
 *   – respects the apply-only execution policy (no fetch before user clicks Appliquer)
 *   – uses the last appliedTableConfig snapshot so view/edit toggles never lose data
 *   – calls /monitor/query/table with the same filter/period contract as the chart
 */
const PATableWidget: React.FC<Props> = ({ height = 360, widget: w }) => {
  const tCfgSource: TableWidgetConfig | undefined = w
    ? ((w.appliedRev ?? 0) > 0 ? (w.appliedTableConfig ?? w.tableConfig) : w.tableConfig)
    : undefined;
  const cfg: TableWidgetConfig | undefined = tCfgSource;
  const hasColumns = !!cfg && cfg.columns.length > 0;

  const global = usePAGlobalToolbar();
  const { data: kpiCatalog } = useKpiCatalog();
  const validKpiKeys = useMemo(() => {
    const arr = Array.isArray(kpiCatalog) ? kpiCatalog : [];
    return new Set(arr.map((k: any) => k.kpi_key));
  }, [kpiCatalog]);
  const inheritsTime = cfg?.data.timeRange?.inherit !== false;
  const inheritsScope = cfg?.data.inheritFromDashboard !== false;
  // SUM widget + global revs (instead of max) so that "Apply to Dashboard"
  // always produces a fresh _rev and forces inheriting widgets to refetch,
  // even when the widget's local rev is already higher than global's.
  const widgetRev = w?.appliedRev ?? 0;
  const effectiveAppliedRev = (inheritsTime || inheritsScope)
    ? widgetRev + global.appliedRev
    : widgetRev;
  const hasBeenApplied = widgetRev > 0 || global.appliedRev > 0;
  const globalSnap = global.applied;
  const gFrom = globalSnap?.from ?? global.from;
  const gTo = globalSnap?.to ?? global.to;
  const gTechnos = globalSnap?.technos ?? global.technos;
  const gFilters = globalSnap?.filters ?? global.filters;

  // Check if required perimeter filter is present (global or widget-level)
  const effectiveFilters = inheritsScope ? gFilters : (cfg?.data.filters ?? []);
  const PERIMETER_DIMS = new Set(['PLAQUE', 'SITE', 'VENDOR', 'DOR', 'BAND', 'BCLUSTER',
    'Plaque', 'Site', 'Constructeur', 'DOR', 'Bande', 'BCluster']);
  const hasPerimeterFilter = effectiveFilters.some(f => PERIMETER_DIMS.has(f.dimension) || PERIMETER_DIMS.has(toBackendDimension(f.dimension)));
  const effectiveFrom = inheritsTime ? gFrom : (cfg?.data.timeRange.from ?? '');
  const effectiveTo = inheritsTime ? gTo : (cfg?.data.timeRange.to ?? '');
  const hasDateRange = !!effectiveFrom && !!effectiveTo;
  const missingRequirements = !hasPerimeterFilter || !hasDateRange;

  const request: TableRequest | null = useMemo(() => {
    if (!cfg || !hasColumns || !hasBeenApplied || missingRequirements) return null;

    const eff = {
      from: effectiveFrom,
      to: effectiveTo,
      // Périmètre techno: toujours hérité de la barre globale du rapport.
      technos: gTechnos,
      filters: effectiveFilters,
    };

    // Normalize dimensions to backend keys (Techno → RAT, Constructeur → Vendor, …)
    const byDim = new Map<string, string[]>();
    eff.filters.forEach(f => {
      const dim = toBackendDimension(f.dimension);
      const arr = byDim.get(dim) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      byDim.set(dim, arr);
    });
    const filters: MonitorFilter[] = Array.from(byDim.entries()).map(([dimension, values]) => ({
      dimension, op: 'IN' as const, values,
    }));

    const ALL_TECHS = new Set(['2g', '3g', '4g', '5g']);
    const selected = (eff.technos || []).map(t => t.toLowerCase());
    const allSelected = selected.length >= 4 && selected.every(t => ALL_TECHS.has(t));
    if (selected.length > 0 && !allSelected) {
      filters.push({ dimension: toBackendDimension('Techno'), op: 'IN', values: selected.map(t => t.toUpperCase()) });
    }

    const normalizeDate = (raw: string): string => {
      if (!raw) return raw;
      if (/T\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
      if (/T\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
      if (!raw.includes('T')) return `${raw}T00:00:00`;
      return raw;
    };

    const visibleCols = cfg.columns.filter(c => c.visible);
    const catalogReady = validKpiKeys.size > 0;
    const resolvedColumns = visibleCols.map(col => ({
      ...col,
      source: col.source ?? (
        catalogReady
          ? (validKpiKeys.has(col.kpiKey) ? 'kpi' : 'counter')
          : (looksLikeRawCounter(col.kpiKey) ? 'counter' : undefined)
      ),
    }));

    // Split is driven exclusively by per-column state. The legacy widget-level
    // cfg.splitBy is intentionally ignored so old saved values can never resurrect
    // a split after the user chose "No split" in Edit KPI.
    const effectiveSplitBy = resolvedColumns.find(c => c.splitBy && c.splitBy !== '__none__')?.splitBy ?? null;

    return {
      date_from: normalizeDate(eff.from),
      date_to: normalizeDate(eff.to),
      filters,
      kpi_keys: resolvedColumns.filter(c => c.source !== 'counter').map(c => c.kpiKey),
      split_by: effectiveSplitBy,
      top_n: cfg.topN,
      granularity: toBackendGranularity(cfg.data.granularity || '1d'),
      columns: resolvedColumns,
      _rev: effectiveAppliedRev,
    } as TableRequest & { _rev: number; granularity: string; columns: TableColumn[]; split_by: string | null };
  }, [
    cfg,
    hasColumns,
    hasBeenApplied,
    missingRequirements,
    effectiveFrom,
    effectiveTo,
    gTechnos,
    effectiveFilters,
    effectiveAppliedRev,
    validKpiKeys,
  ]);


  useEffect(() => {
    if (request) console.log('[PA Table] table request', request);
  }, [request]);

  const { data: tableResp, isFetching, error } = usePATableQuery(request);

  useEffect(() => {
    if (tableResp) console.log('[PA Table] ◀ response', { rows: tableResp.rows?.length ?? 0 });
    if (error) console.warn('[PA Table] ✖ error', error);
  }, [tableResp, error]);

  const visibleColumns = useMemo(
    () => (cfg?.columns ?? []).filter(c => c.visible),
    [cfg],
  );
  const rows = tableResp?.rows ?? [];
  const backendMessage = (tableResp as any)?.meta?.error || tableResp?.info || (tableResp as any)?.meta?.info || null;

  // Empty states — match the chart's behavior
  const emptyReason: 'no-column' | 'not-applied' | 'missing-filter' | 'backend' | 'no-data' | null =
    !hasColumns ? 'no-column'
    : (!hasBeenApplied) ? 'not-applied'
    : missingRequirements ? 'missing-filter'
    : (hasBeenApplied && !isFetching && backendMessage) ? 'backend'
    : (hasBeenApplied && !isFetching && rows.length === 0) ? 'no-data'
    : null;

  const splitInUse = (() => {
    const cols = (cfg?.columns ?? []).filter(c => c.visible);
    const hasPerColumnSplitState = cols.some(c => 'splitBy' in c);
    const columnSplit = cols.find(c => c.splitBy && c.splitBy !== '__none__')?.splitBy ?? null;
    const legacySplit = (!hasPerColumnSplitState && cfg?.splitBy && cfg.splitBy !== '__none__') ? cfg.splitBy : null;
    return columnSplit ?? legacySplit;
  })();
  const sourceTables = (tableResp as any)?.source_tables;

  if (emptyReason) {
    const copy = emptyReason === 'no-column'
      ? { title: 'No KPI column', body: 'Open settings and add KPI columns to populate this table.' }
      : emptyReason === 'not-applied'
      ? { title: 'Configuration not applied', body: 'Click Appliquer (top toolbar or panel) to fetch table rows.' }
      : emptyReason === 'missing-filter'
      ? { title: 'Filtre de périmètre requis', body: `Ajoutez au moins un filtre (Plaque, Site, Vendor, DOR ou Bande) ${!hasDateRange ? 'et une période' : ''} avant de lancer la requête. Configurez dans la barre globale ou dans les paramètres du widget.` }
      : emptyReason === 'backend'
      ? { title: 'Backend returned no usable table data', body: backendMessage }
      : {
          title: 'No data returned',
          body: `No rows for split "${splitInUse}" on this period/filters. Try widening the date range, removing filters, or switching the split dimension.`,
        };
    return (
      <div
        style={{ height }}
        className="rounded-2xl border border-outline-variant/20 bg-white flex flex-col items-center justify-center text-center px-6 relative"
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <TableIcon className="w-5 h-5 text-primary" />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-on-surface mb-1">{copy.title}</p>
        <p className="text-[11px] text-on-surface-variant max-w-[280px]">{copy.body}</p>
        {isFetching && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-card border border-primary/30 shadow-lg">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Loading data…</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height }} className="rounded-2xl border border-outline-variant/20 bg-white overflow-hidden flex flex-col relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 bg-surface-container-low/40">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
            {splitInUse ? `By ${splitInUse}` : 'Aggregated'}
          </span>
          <span className="text-xs font-black text-on-surface">{visibleColumns.length} KPI · {rows.length} rows</span>
        </div>
        {isFetching && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/20">
              {splitInUse && <th className="text-left px-4 py-2.5">{splitInUse}</th>}
              {visibleColumns.map(col => (
                <th key={col.id} className="text-right px-4 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    {col.alias || col.kpiKey}
                    {col.unit && <span className="text-on-surface-variant/50 normal-case">({col.unit})</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.split_value}-${i}`} className={cn('border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors', i % 2 === 1 && 'bg-slate-50/30')}>
                {splitInUse && (
                  <td className="px-4 py-2.5 font-black text-on-surface tabular-nums">{r.split_value || '—'}</td>
                )}
                {visibleColumns.map(col => {
                  const raw = r[col.kpiKey];
                  // Backend may return either a scalar or an object {avg,min,max}.
                  // Pick `avg` when an aggregated bag is returned.
                  const v = raw && typeof raw === 'object' && !Array.isArray(raw)
                    ? (raw.avg ?? raw.value ?? raw.min ?? raw.max ?? null)
                    : raw;
                  return (
                    <td key={col.id} className="px-4 py-2.5 text-right font-bold tabular-nums text-on-surface">
                      {v === null || v === undefined ? <span className="text-on-surface-variant/40">—</span> : formatValue(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type PATableRequest = TableRequest & {
  _rev?: number;
  granularity?: string;
  columns?: TableColumn[];
};

function usePATableQuery(req: PATableRequest | null) {
  const key = req ? JSON.stringify(req) : 'noop';
  return useQuery({
    queryKey: ['precision-architect', 'table', key],
    enabled: !!req && (req.columns?.length ?? req.kpi_keys.length) > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { _rev, columns = [], granularity = '1d', ...basePayload } = req!;
      const visibleColumns = columns.length > 0
        ? columns
        : basePayload.kpi_keys.map(kpiKey => ({ id: kpiKey, kpiKey, visible: true }));

      const counterColumns = visibleColumns.filter(isCounterColumn);
      const kpiColumns = visibleColumns.filter(col => !isCounterColumn(col));
      const responses: TableResponse[] = [];

      if (kpiColumns.length > 0) {
        responses.push(await fetchTable({
          ...basePayload,
          kpi_keys: kpiColumns.map(col => col.kpiKey),
        }));
      }

      if (counterColumns.length > 0) {
        responses.push(await fetchCounterTable({
          ...basePayload,
          counter_names: counterColumns.map(col => col.kpiKey),
          granularity,
        }));
      }

      if (responses.length === 0) {
        return { rows: [], total: 0, page: 1, page_size: basePayload.top_n ?? 50 } as TableResponse;
      }

      return mergeTableResponses(responses, basePayload.top_n ?? 50);
    },
  });
}

function isCounterColumn(col: Pick<TableColumn, 'source' | 'kpiKey'>): boolean {
  if (col.source === 'counter') return true;
  if (col.source === 'kpi') return false;
  // Backward compatibility for saved widgets created before source metadata.
  return looksLikeRawCounter(col.kpiKey);
}

function looksLikeRawCounter(key: string): boolean {
  return /^[A-Z]\./.test(key) || /^M\d/i.test(key) || /^pm_/i.test(key);
}

async function fetchCounterTable(req: TableRequest & { counter_names: string[]; granularity: string }): Promise<TableResponse> {
  const body: Record<string, any> = {
    counter_names: req.counter_names,
    date_from: req.date_from,
    date_to: req.date_to,
    granularity: req.granularity,
  };

  applyCounterFilters(body, req.filters);

  const res = await fetch(getApiUrl('pm/counters/timeseries'), {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Counter table failed: ${res.status}${text ? ` ${text}` : ''}`);
  }

  const json = await res.json();
  const series = Array.isArray(json.series) ? json.series : Array.isArray(json.data) ? json.data : [];
  const bySplit = new Map<string, TableRow>();

  for (const point of series) {
    const counterId = point.counter_id || point.counter_name || String(point.counter || '').split('@')[0] || req.counter_names[0];
    const splitValue = point.dimension_key || point.split_value || point.split_field || 'Total';
    const value = Number(point.value ?? point.kpi_value ?? point.val);
    if (!Number.isFinite(value)) continue;
    const row = bySplit.get(splitValue) || { split_value: splitValue };
    row[counterId] = Number(row[counterId] || 0) + value;
    bySplit.set(splitValue, row);
  }

  const firstCounter = req.counter_names[0];
  const rows = Array.from(bySplit.values())
    .sort((a, b) => Number(b[firstCounter] || 0) - Number(a[firstCounter] || 0))
    .slice(0, req.top_n ?? 50);

  return {
    rows,
    total: rows.length,
    page: 1,
    page_size: req.top_n ?? 50,
    source_tables: { data: 'pm.fact_counters_15min' },
  };
}

function applyCounterFilters(body: Record<string, any>, filters: MonitorFilter[]) {
  const dimFilterValues: string[] = [];
  const structural = new Set(['SITE', 'CELL', 'VENDOR', 'TECHNO', 'TECHNOLOGY', 'RAT', 'PLAQUE', 'DOR', 'DR', 'BAND', 'ZONE_ARCEP']);

  for (const filter of filters || []) {
    const values = filter.values || [];
    if (values.length === 0) continue;
    const dim = String(filter.dimension || '').toUpperCase();
    if (dim === 'SITE') body.site_name = values.length === 1 ? values[0] : values;
    else if (dim === 'CELL') body.cell_name = values.length === 1 ? values[0] : values;
    else if (dim === 'VENDOR') body.vendor = values[0];
    else if (dim === 'PLAQUE') body.plaque = values[0];
    else if (dim === 'DOR' || dim === 'DR') body.dor = values[0];
    else if (dim === 'BAND') body.band = values[0];
    else if (dim === 'RAT' || dim === 'TECHNO' || dim === 'TECHNOLOGY') {
      const allTechs = new Set(['2G', '3G', '4G', '5G']);
      const normalized = values.map(v => String(v).toUpperCase());
      const allSelected = normalized.length >= 4 && normalized.every(v => allTechs.has(v));
      if (!allSelected) body.object_type = normalized.length === 1 ? normalized[0] : normalized;
    } else if (!structural.has(dim)) {
      dimFilterValues.push(...values);
    }
  }

  if (dimFilterValues.length > 0) body.dimension_filter = dimFilterValues;
}

function mergeTableResponses(responses: TableResponse[], topN: number): TableResponse {
  const bySplit = new Map<string, TableRow>();
  const messages: string[] = [];
  const sourceTables: Record<string, string> = {};

  for (const response of responses) {
    if (response.info) messages.push(response.info);
    if (response.meta?.error) messages.push(response.meta.error);
    if (response.meta?.info) messages.push(response.meta.info);
    Object.assign(sourceTables, response.source_tables || {});
    for (const row of response.rows || []) {
      const split = row.split_value || 'Total';
      const existing = bySplit.get(split) || { split_value: split };
      // Backend returns {kpi_key, avg, min, max} — transform to {[kpi_key]: avg}
      // so the frontend can access r[col.kpiKey] directly.
      if (row.kpi_key && row.avg != null) {
        existing[row.kpi_key] = row.avg;
      }
      // Also keep all other fields (site_name, dor, band, vendor, etc.)
      bySplit.set(split, { ...existing, ...row, split_value: split });
    }
  }

  const rows = Array.from(bySplit.values()).slice(0, topN);
  return {
    rows,
    total: rows.length,
    page: 1,
    page_size: topN,
    source_tables: sourceTables,
    meta: messages.length > 0 && rows.length === 0 ? { info: messages.join(' · ') } : undefined,
  };
}

function formatValue(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export default PATableWidget;
