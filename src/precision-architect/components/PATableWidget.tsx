import React, { useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, Loader2, TableIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { DynWidget, TableWidgetConfig, DEFAULT_TABLE_CONFIG, TableColumn } from '../types';
import { fetchTable, TableRequest, TableResponse, TableRow, MonitorFilter, useKpiCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { getApiHeaders, getApiUrl } from '@/lib/apiConfig';
import { toBackendDimension, toBackendGranularity } from '../lib/monitorDimensions';
import { buildAdvancedTimeFramePayload } from '../lib/advancedTimeFrame';

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
  // STRICT apply-only contract: backend requests are driven by the FROZEN
  // appliedTableConfig snapshot only. Live `tableConfig` is editor-only and
  // must NEVER trigger a fetch. Both per-widget Apply and global Apply write
  // the snapshot via setPages in PAToolbar / TableSettingsPanel.
  const global = usePAGlobalToolbar();
  const tCfgSource: TableWidgetConfig | undefined = w
    ? (((w.appliedRev ?? 0) > 0 || global.appliedRev > 0) ? w.appliedTableConfig : undefined)
    : undefined;
  const cfg: TableWidgetConfig | undefined = tCfgSource;
  const hasColumns = !!cfg && cfg.columns.length > 0;

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
  const gGrain = globalSnap?.grain ?? global.grain;
  const gAdvancedTimeFrame = globalSnap?.advancedTimeFrame ?? global.advancedTimeFrame;

  // Perimeter filter is required. When the widget inherits from the report
  // (no override), we look at the global toolbar filters; otherwise we look at
  // the widget's own filters. Either source must contain at least one
  // perimeter dimension (Cluster / Site / Vendor / DOR / Bande).
  const effectiveFilters = inheritsScope ? gFilters : (cfg?.data?.filters ?? []);
  const effectiveFrom = inheritsTime ? gFrom : (cfg?.data?.timeRange?.from ?? '');
  const effectiveTo = inheritsTime ? gTo : (cfg?.data?.timeRange?.to ?? '');
  const hasDateRange = !!effectiveFrom && !!effectiveTo;
  // Perimeter filter is no longer required — the widget inherits the report's
  // global scope (techno + filters) by default. Only a valid date range is needed.
  const missingRequirements = !hasDateRange;

  const request: TableRequest | null = useMemo(() => {
    if (!cfg || !hasColumns || !hasBeenApplied || missingRequirements) return null;

    const eff = {
      from: effectiveFrom,
      to: effectiveTo,
      // Périmètre techno: toujours hérité de la barre globale du rapport.
      technos: gTechnos,
      filters: effectiveFilters,
      advancedTimeFrame: inheritsTime ? gAdvancedTimeFrame : { mode: 'NONE' as const },
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
    const rawSplitBy = resolvedColumns.find(c => c.splitBy && c.splitBy !== '__none__')?.splitBy ?? null;
    let effectiveSplitBy = rawSplitBy ? toBackendDimension(rawSplitBy) : null;

    // Auto-split: when a filter dimension has multiple values and no explicit split
    // is set, auto-split by that dimension so each value gets its own row.
    // Without this, multiple plaques (e.g. NANTES, RENNES) would be aggregated
    // into a single row with concatenated values.
    if (!effectiveSplitBy) {
      for (const [dim, vals] of byDim.entries()) {
        if (vals.length > 1) {
          effectiveSplitBy = dim;
          break;
        }
      }
    }

    return {
      date_from: normalizeDate(eff.from),
      date_to: normalizeDate(eff.to),
      filters,
      kpi_keys: resolvedColumns.filter(c => c.source !== 'counter').map(c => c.kpiKey),
      split_by: effectiveSplitBy,
      // top_n intentionally omitted — backend returns full result set, no client-imposed cap.
      granularity: toBackendGranularity((inheritsTime ? gGrain : cfg.data.granularity) || '1d'),
      advancedTimeFrame: buildAdvancedTimeFramePayload(eff.advancedTimeFrame),
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
    inheritsTime,
    gGrain,
    gAdvancedTimeFrame,
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

  // Empty states — only block rendering for config issues, NOT for empty data
  const emptyReason: 'no-column' | 'not-applied' | 'missing-filter' | 'backend' | null =
    !hasColumns ? 'no-column'
    : (!hasBeenApplied) ? 'not-applied'
    : missingRequirements ? 'missing-filter'
    : (hasBeenApplied && !isFetching && backendMessage) ? 'backend'
    : null;

  const splitInUse = (() => {
    const cols = (cfg?.columns ?? []).filter(c => c.visible);
    const raw = cols.find(c => c.splitBy && c.splitBy !== '__none__')?.splitBy ?? null;
    if (raw) return toBackendDimension(raw);
    // Detect auto-split from the request (when multiple filter values trigger it)
    if (request && (request as any).split_by) return (request as any).split_by;
    return null;
  })();
  const sourceTables = (tableResp as any)?.source_tables;

  if (emptyReason) {
    const copy = emptyReason === 'no-column'
      ? { title: 'No KPI column', body: 'Open settings and add KPI columns to populate this table.' }
      : emptyReason === 'not-applied'
      ? { title: 'Configuration not applied', body: 'Click Appliquer (top toolbar or panel) to fetch table rows.' }
      : emptyReason === 'missing-filter'
      ? { title: 'Période requise', body: 'Sélectionnez une période (Du / Au) dans la barre globale du rapport ou activez Override pour ce widget.' }
      : { title: 'Backend returned no usable table data', body: backendMessage };
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
          tableResp ? (
            <div className="absolute top-2 right-2 z-10 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/95 border border-primary/30 shadow-sm backdrop-blur-sm">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">Updating…</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-card border border-primary/30 shadow-lg">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Loading data…</span>
              </div>
            </div>
          )
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
      </div>
      {isFetching && (
        tableResp ? (
          <div className="absolute top-2 right-2 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/95 border border-primary/30 shadow-sm backdrop-blur-sm">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">Updating…</span>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-card border border-primary/30 shadow-lg">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Loading data…</span>
            </div>
          </div>
        )
      )}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {(() => {
          const hasTs = rows.some(r => r.ts);
          const splitDim = splitInUse ? splitInUse.toUpperCase() : null;
          const filterContextCols = effectiveFilters
            .reduce((acc, f) => {
              const dim = toBackendDimension(f.dimension);
              if (splitDim && dim.toUpperCase() === splitDim) return acc;
              if (!acc.find(a => a.dim === dim)) acc.push({ dim, values: [f.value] });
              else acc.find(a => a.dim === dim)!.values.push(f.value);
              return acc;
            }, [] as { dim: string; values: string[] }[]);

          // ── FULL DATE RANGE: fill missing dates with "—" rows, grouped by split value ──
          if (splitInUse && hasTs && rows.length > 0) {
            const splitValues = [...new Set(rows.map(r => r.split_value || '').filter(Boolean))].sort();
            const granStr = ((inheritsTime ? gGrain : cfg?.data?.granularity) || '1d').toLowerCase();
            const isSubDaily = granStr.includes('15m') || granStr.includes('1h');
            const normalizeTsKey = (raw: string) => {
              if (!raw) return raw;
              return isSubDaily ? raw.slice(0, 16) : raw.slice(0, 10);
            };

            // Generate full date range
            const fromDate = effectiveFrom ? new Date(effectiveFrom) : null;
            const toDate = effectiveTo ? new Date(effectiveTo) : null;
            const fullDates: string[] = [];
            if (fromDate && toDate) {
              const stepMs = granStr.includes('15m') ? 15*60*1000 : granStr.includes('1h') ? 3600*1000 : 86400*1000;
              const d = new Date(fromDate);
              while (d <= toDate) {
                fullDates.push(formatLocalTimelinePoint(d, stepMs < 86400*1000));
                d.setTime(d.getTime() + stepMs);
              }
            }
            const timestamps = fullDates.length > 0 ? fullDates : [...new Set(rows.map(r => r.ts || ''))].sort();

            // Build lookup: {ts_short}_{split} → row
            const lookup = new Map<string, Record<string, any>>();
            for (const r of rows) {
              const normalizedTs = normalizeTsKey(r.ts || '');
              const key = `${normalizedTs}_${r.split_value}`;
              if (!lookup.has(key)) lookup.set(key, {});
              const entry = lookup.get(key)!;
              for (const col of visibleColumns) {
                const raw = r[col.kpiKey];
                const v = raw && typeof raw === 'object' && !Array.isArray(raw)
                  ? (raw.avg ?? raw.value ?? null) : raw;
                if (v != null) entry[col.kpiKey] = v;
              }
            }

            // Build expanded rows: all dates × all splits, grouped by split
            const expandedRows: { ts: string; split: string; values: Record<string, any> }[] = [];
            for (const sv of splitValues) {
              for (const ts of timestamps) {
                const normalizedTs = normalizeTsKey(ts);
                expandedRows.push({ ts: normalizedTs, split: sv, values: lookup.get(`${normalizedTs}_${sv}`) || {} });
              }
            }

            return (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/20">
                    <th className="text-left px-4 py-2.5">Timestamp</th>
                    <th className="text-left px-4 py-2.5">{splitInUse}</th>
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
                  {expandedRows.map((row, i) => {
                    // Add visual separator between split groups
                    const prevSplit = i > 0 ? expandedRows[i - 1].split : null;
                    const isNewGroup = prevSplit !== null && prevSplit !== row.split;
                    return (
                      <tr key={`${row.split}-${row.ts}`} className={cn(
                        'border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors',
                        i % 2 === 1 && 'bg-slate-50/30',
                        isNewGroup && 'border-t-2 border-t-primary/20',
                      )}>
                        <td className="px-4 py-2.5 font-mono text-on-surface tabular-nums whitespace-nowrap">{row.ts}</td>
                        <td className="px-4 py-2.5 font-black text-on-surface">{row.split}</td>
                        {visibleColumns.map(col => {
                          const v = row.values[col.kpiKey];
                          return (
                            <td key={col.id} className="px-4 py-2.5 text-right font-bold tabular-nums text-on-surface">
                              {v === null || v === undefined ? <span className="text-on-surface-variant/40">—</span> : formatValue(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          }

          // ── STANDARD MODE: no split or no timestamps ──
          return (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/20">
                  {hasTs && <th className="text-left px-4 py-2.5">Timestamp</th>}
                  {filterContextCols.map(fc => (
                    <th key={fc.dim} className="text-left px-4 py-2.5">{fc.dim}</th>
                  ))}
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
                {rows.length === 0 && !isFetching && (
                  <tr className="border-b border-outline-variant/10">
                    {hasTs && <td className="px-4 py-2.5 text-on-surface-variant/40">—</td>}
                    {filterContextCols.map(fc => (
                      <td key={fc.dim} className="px-4 py-2.5 text-on-surface-variant/40">—</td>
                    ))}
                    {splitInUse && <td className="px-4 py-2.5 text-on-surface-variant/40">—</td>}
                    {visibleColumns.map(col => (
                      <td key={col.id} className="px-4 py-2.5 text-right text-on-surface-variant/40">—</td>
                    ))}
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.split_value}-${i}`} className={cn('border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors', i % 2 === 1 && 'bg-slate-50/30')}>
                    {hasTs && (
                      <td className="px-4 py-2.5 font-mono text-on-surface tabular-nums whitespace-nowrap">{r.ts || '—'}</td>
                    )}
                    {filterContextCols.map(fc => (
                      <td key={fc.dim} className="px-4 py-2.5 text-on-surface">{fc.values.join(', ')}</td>
                    ))}
                    {splitInUse && (
                      <td className="px-4 py-2.5 font-black text-on-surface tabular-nums">{r.split_value || r.site_name || '—'}</td>
                    )}
                    {visibleColumns.map(col => {
                      const raw = r[col.kpiKey];
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
          );
        })()}
      </div>
    </div>
  );
};

function formatLocalTimelinePoint(date: Date, includeTime: boolean): string {
  const pad2 = (value: number) => String(value).padStart(2, '0');
  const base = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  if (!includeTime) return base;
  return `${base}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

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
          granularity,
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
    advancedTimeFrame: req.advancedTimeFrame,
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
      // Key must include timestamp so that multiple dates per split value
      // are NOT collapsed into a single row (e.g. NANTES Apr-17 + NANTES Apr-18)
      const ts = row.ts || '';
      const mergeKey = ts ? `${split}||${ts}` : split;
      const existing = bySplit.get(mergeKey) || { split_value: split, ts };
      // Backend returns {kpi_key, avg, min, max} — transform to {[kpi_key]: avg}
      // so the frontend can access r[col.kpiKey] directly.
      if (row.kpi_key && row.avg != null) {
        existing[row.kpi_key] = row.avg;
      }
      // Also keep all other fields (site_name, dor, band, vendor, etc.)
      bySplit.set(mergeKey, { ...existing, ...row, split_value: split });
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
