import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowUp, ArrowDown, Loader2, TableIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DynWidget, TableWidgetConfig, DEFAULT_TABLE_CONFIG } from '../types';
import { useTableQuery, TableRequest, MonitorFilter } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { toBackendDimension } from '../lib/monitorDimensions';

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

  const request: TableRequest | null = useMemo(() => {
    if (!cfg || !hasColumns || !hasBeenApplied) return null;

    const eff = {
      from: inheritsTime ? gFrom : cfg.data.timeRange.from,
      to: inheritsTime ? gTo : cfg.data.timeRange.to,
      // Périmètre techno: toujours hérité de la barre globale du rapport.
      technos: gTechnos,
      filters: inheritsScope ? gFilters : cfg.data.filters,
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

    // Only send real KPI columns to /monitor/query/table.
    // PM counter columns (id prefix "cnt-") are not supported by this endpoint
    // and would cause the backend to return 0 rows. They are filtered out and
    // a toast notifies the user (once per apply).
    const kpiOnlyColumns = cfg.columns.filter(c => c.visible && !c.id.startsWith('cnt-'));
    const counterColumns = cfg.columns.filter(c => c.visible && c.id.startsWith('cnt-'));

    return {
      date_from: normalizeDate(eff.from),
      date_to: normalizeDate(eff.to),
      filters,
      kpi_keys: kpiOnlyColumns.map(c => c.kpiKey),
      top_n: cfg.topN ?? 10,
      page: 1,
      page_size: Math.max(cfg.topN ?? 10, 50),
      _rev: effectiveAppliedRev,
      _ignoredCounters: counterColumns.map(c => c.alias || c.kpiKey),
    } as TableRequest & { _rev: number; _ignoredCounters: string[] };
  }, [
    cfg,
    hasColumns,
    hasBeenApplied,
    inheritsTime,
    inheritsScope,
    gFrom,
    gTo,
    gTechnos,
    gFilters,
    effectiveAppliedRev,
  ]);

  // Notify the user once per Apply when PM counters were dropped from the payload.
  const lastWarnedRevRef = useRef<number | null>(null);
  useEffect(() => {
    if (!request) return;
    const ignored = (request as any)._ignoredCounters as string[] | undefined;
    const rev = (request as any)._rev as number;
    if (ignored && ignored.length > 0 && lastWarnedRevRef.current !== rev) {
      lastWarnedRevRef.current = rev;
      toast.warning(
        `${ignored.length} compteur(s) PM ignoré(s)`,
        {
          description:
            `L'endpoint /monitor/query/table accepte uniquement des KPIs du catalogue. ` +
            `Compteurs ignorés: ${ignored.slice(0, 3).join(', ')}${ignored.length > 3 ? '…' : ''}`,
        }
      );
    }
    console.log('[PA Table] ▶ POST /monitor/query/table', request);
  }, [request]);

  const { data: tableResp, isFetching, error } = useTableQuery(request);

  useEffect(() => {
    if (tableResp) console.log('[PA Table] ◀ response', { rows: tableResp.rows?.length ?? 0 });
    if (error) console.warn('[PA Table] ✖ error', error);
  }, [tableResp, error]);

  const visibleColumns = useMemo(
    () => (cfg?.columns ?? []).filter(c => c.visible),
    [cfg],
  );
  const hasOnlyCounters = hasColumns && (cfg?.columns ?? []).filter(c => c.visible).every(c => c.id.startsWith('cnt-'));
  const rows = tableResp?.rows ?? [];
  const backendMessage = (tableResp as any)?.meta?.error || tableResp?.info || (tableResp as any)?.meta?.info || null;

  // Empty states — match the chart's behavior
  const emptyReason: 'no-column' | 'only-counters' | 'not-applied' | 'backend' | 'no-data' | null =
    !hasColumns ? 'no-column'
    : hasOnlyCounters ? 'only-counters'
    : (!hasBeenApplied) ? 'not-applied'
    : (hasBeenApplied && !isFetching && backendMessage) ? 'backend'
    : (hasBeenApplied && !isFetching && rows.length === 0) ? 'no-data'
    : null;

  const splitInUse = (cfg?.splitBy && cfg.splitBy !== '__none__') ? cfg.splitBy : 'CELL';
  const sourceTables = (tableResp as any)?.source_tables;

  if (emptyReason) {
    const copy = emptyReason === 'no-column'
      ? { title: 'No KPI column', body: 'Open settings and add KPI columns to populate this table.' }
      : emptyReason === 'not-applied'
      ? { title: 'Configuration not applied', body: 'Click Appliquer (top toolbar or panel) to fetch table rows.' }
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
            {cfg?.splitBy ? `By ${cfg.splitBy}` : 'Aggregated'}
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
              {cfg?.splitBy && <th className="text-left px-4 py-2.5">{cfg.splitBy}</th>}
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
                {cfg?.splitBy && (
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

function formatValue(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export default PATableWidget;
