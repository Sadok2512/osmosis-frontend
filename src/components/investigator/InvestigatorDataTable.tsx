import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataPoint, GraphSlot } from './types';

interface Props {
  tsData: DataPoint[];
  activeSlot?: GraphSlot | null;
  siteName?: string;
  filterContext?: Record<string, string[]>;
  forceSplitOff?: boolean;
}

type RuntimeDataPoint = DataPoint & {
  _slotId?: string;
};

const SPLIT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
  '#ec4899', '#84cc16', '#ef4444', '#6366f1', '#14b8a6',
  '#f97316', '#a855f7', '#22d3ee', '#4ade80', '#fbbf24',
  '#fb7185', '#2dd4bf', '#818cf8', '#facc15', '#34d399',
];

function stableHash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return ((hash % SPLIT_COLORS.length) + SPLIT_COLORS.length) % SPLIT_COLORS.length;
}

function stableColorForSplit(splitValue: string): string {
  return SPLIT_COLORS[stableHash(splitValue)];
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
  '#ec4899', '#84cc16', '#ef4444', '#6366f1', '#14b8a6',
];

const PAGE_SIZES = [25, 50, 100, 200];

const fmt = (ts: string) => (ts.length > 10 ? ts.slice(0, 16).replace('T', ' ') : ts);

const fmtVal = (v: number | null | undefined) => {
  if (v == null) return '—';
  const num = Number(v);
  if (!isFinite(num)) return '—';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  // Adaptive precision: keep small values visible (e.g. 0.000234 GBytes)
  // instead of rounding them to "0,00".
  let fractionDigits = 2;
  if (abs > 0 && abs < 0.01) {
    // Show enough digits to surface the first 2 significant figures
    fractionDigits = Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(abs))));
  } else if (abs < 1) {
    fractionDigits = 4;
  }
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
};

const cleanKpi = (k: string) => (k.includes('@') ? k.split('@')[0] : k);

function normalizeScopeLabel(key: string): string {
  const normalized = key.toUpperCase();
  if (normalized === 'SITE') return 'Site';
  if (normalized === 'PLAQUE') return 'Plaque';
  if (normalized === 'DOR') return 'DOR';
  if (normalized === 'DR') return 'DR';
  if (normalized === 'ZONE_ARCEP' || normalized === 'ZONE ARCEP') return 'Zone ARCEP';
  return key;
}

function getPrimaryScope(filterContext?: Record<string, string[]>, siteName?: string) {
  if (filterContext) {
    const priority = ['Plaque', 'PLAQUE', 'Site', 'SITE', 'DOR', 'DR', 'Zone ARCEP', 'ZONE_ARCEP'];

    for (const key of priority) {
      const vals = filterContext[key];
      if (vals && vals.length > 0) {
        return {
          label: normalizeScopeLabel(key),
          value: vals.join(', '),
        };
      }
    }

    for (const [key, vals] of Object.entries(filterContext)) {
      if (vals && vals.length > 0) {
        return {
          label: normalizeScopeLabel(key),
          value: vals.join(', '),
        };
      }
    }
  }

  return { label: 'Network Element', value: siteName || '—' };
}

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sanitizeTableData(tsData: DataPoint[], activeSlot?: GraphSlot | null): RuntimeDataPoint[] {
  const runtimeData = tsData as RuntimeDataPoint[];
  if (!activeSlot) return runtimeData;

  const slotKeys = new Set([
    ...(activeSlot.kpiIds || []),
    ...((activeSlot as GraphSlot & { counterIds?: string[] }).counterIds || []),
  ]);

  const keyMatches = (point: DataPoint) => slotKeys.size === 0 || slotKeys.has(cleanKpi(point.kpi));
  const taggedForSlot = runtimeData.filter(point => point._slotId === activeSlot.id && keyMatches(point));
  if (taggedForSlot.length > 0) return taggedForSlot;

  const untaggedMatches = runtimeData.filter(point => point._slotId == null && keyMatches(point));
  if (untaggedMatches.length > 0) return untaggedMatches;

  return runtimeData.filter(keyMatches);
}

function getSplitColumnLabel(activeSlot?: GraphSlot | null, tsData: RuntimeDataPoint[] = []): string {
  const rawSplit = activeSlot?.splitBy;
  if (rawSplit && rawSplit !== 'None') {
    return normalizeScopeLabel(rawSplit);
  }

  if (tsData.some(d => d.splitValue)) {
    return 'Split';
  }

  return 'Cell';
}

function buildPivotTable(
  tsData: RuntimeDataPoint[],
  siteName?: string,
  filterContext?: Record<string, string[]>,
  forceSplitOff?: boolean,
  activeSlot?: GraphSlot | null,
) {
  const scope = getPrimaryScope(filterContext, siteName);

  // Build KPI columns from the slot's selected KPIs + counters (so empty KPIs still show a column).
  // Fall back to whatever appears in tsData if no slot info available.
  const selectedKeys = activeSlot
    ? [
        ...(activeSlot.kpiIds || []),
        ...((activeSlot as GraphSlot & { counterIds?: string[] }).counterIds || []),
      ]
    : [];
  const kpiSet = new Set<string>(selectedKeys);
  tsData.forEach(d => kpiSet.add(cleanKpi(d.kpi)));
  const kpiColumns = [...kpiSet];

  const timestampSet = new Set<string>();
  const splitValueSet = new Set<string>();

  for (const d of tsData) {
    timestampSet.add(d.timestamp);
    if (!forceSplitOff) {
      splitValueSet.add(d.networkElement || d.splitValue || '');
    }
  }

  const timestamps = [...timestampSet].sort();
  const splitValues = forceSplitOff ? [''] : [...splitValueSet].sort();

  const lookup = new Map<string, { sum: number; count: number }>();
  for (const d of tsData) {
    const splitValue = forceSplitOff ? '' : (d.networkElement || d.splitValue || '');
    const kpi = cleanKpi(d.kpi);
    const key = `${d.timestamp}||${splitValue}||${kpi}`;
    const current = lookup.get(key) || { sum: 0, count: 0 };
    lookup.set(key, { sum: current.sum + d.value, count: current.count + 1 });
  }

  const rows: { timestamp: string; ne: string; splitValue: string; kpiValues: Record<string, number | null> }[] = [];

  for (const ts of timestamps) {
    for (const splitValue of splitValues) {
      const kpiValues: Record<string, number | null> = {};
      for (const kpi of kpiColumns) {
        const key = `${ts}||${splitValue}||${kpi}`;
        const aggregate = lookup.get(key);
        kpiValues[kpi] = aggregate ? aggregate.sum / aggregate.count : null;
      }

      rows.push({
        timestamp: fmt(ts),
        ne: scope.value,
        splitValue: splitValue || '—',
        kpiValues,
      });
    }
  }

  const hasSplitValues = !forceSplitOff && tsData.some(d => d.splitValue || d.networkElement);

  return {
    rows,
    kpiColumns,
    hasSplitValues,
    scopeLabel: scope.label,
    splitLabel: getSplitColumnLabel(activeSlot, tsData),
  };
}

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot, siteName, filterContext, forceSplitOff }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

  const tableData = useMemo(
    () => sanitizeTableData(tsData, activeSlot),
    [tsData, activeSlot]
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [pageSize, tableData.length, activeSlot?.id]);

  const sourceInfo = useMemo(() => {
    const kpis = [...new Set(tableData.map(d => cleanKpi(d.kpi)))];
    return {
      slotLabel: (activeSlot as GraphSlot & { label?: string } | null)?.label || activeSlot?.name || activeSlot?.id || 'Timeseries',
      kpiNames: kpis.join(', '),
      rowCount: tableData.length,
    };
  }, [tableData, activeSlot]);

  const { rows, kpiColumns, hasSplitValues, scopeLabel, splitLabel } = useMemo(
    () => buildPivotTable(tableData, siteName, filterContext, forceSplitOff, activeSlot),
    [tableData, siteName, filterContext, forceSplitOff, activeSlot]
  );

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const startIdx = safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);
  const pageRows = rows.slice(startIdx, endIdx);

  const exportCsv = () => {
    const headerCols = ['Timestamp', scopeLabel];
    if (hasSplitValues) headerCols.push(splitLabel);
    headerCols.push(...kpiColumns);
    const header = headerCols.map(escapeCsv).join(',');

    const csvRows = rows.map(r => {
      const baseCols = [r.timestamp, r.ne];
      if (hasSplitValues) baseCols.push(r.splitValue);
      const kpiVals = kpiColumns.map(k => r.kpiValues[k] ?? '');
      return [...baseCols, ...kpiVals].map(escapeCsv).join(',');
    });

    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table_data_${activeSlot?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (tableData.length === 0) {
    const hasNoKpis =
      (!activeSlot?.kpiIds || activeSlot.kpiIds.length === 0) &&
      (!(activeSlot as GraphSlot & { counterIds?: string[] })?.counterIds ||
        (activeSlot as GraphSlot & { counterIds?: string[] }).counterIds!.length === 0);

    return (
      <div className="flex-grow rounded-xl border border-border/20 bg-card shadow-sm overflow-hidden flex flex-col items-center justify-center h-48 gap-2 px-6 text-center">
        {hasNoKpis ? (
          <>
            <p className="text-xs font-semibold text-foreground">Aucun KPI ni compteur sélectionné sur ce graphe</p>
            <p className="text-[11px] text-muted-foreground">
              Ouvrez le sélecteur de KPI/compteurs sur le graphe « {activeSlot?.name || 'Timeseries'} », ajoutez au moins un élément, puis cliquez sur <span className="font-semibold text-primary">Appliquer</span>.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-foreground">Aucune donnée pour ce graphe</p>
            <p className="text-[11px] text-muted-foreground">
              Cliquez sur <span className="font-semibold text-primary">Appliquer</span> pour exécuter la requête, ou ajustez la période / les filtres.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-grow rounded-2xl border border-border/40 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
      {/* Top meta strip — light, airy */}
      <div className="px-6 py-3 bg-white border-b border-border/30">
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            Cells Inventory
          </span>
          <span className="text-foreground/80 font-semibold">{sourceInfo.slotLabel}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground">
            KPIs: <span className="text-foreground/70">{sourceInfo.kpiNames || '—'}</span>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground">{totalRows.toLocaleString()} rows</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-12 border-b border-border/20 flex items-center justify-between px-6 bg-white">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Table</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">
            {kpiColumns.length} KPI{kpiColumns.length !== 1 ? 's' : ''} × {hasSplitValues ? splitLabel : 'NE'}
          </span>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      <div className="overflow-auto flex-grow relative bg-white" style={{ maxHeight: 500 }}>
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white border-b border-border/40">
              <th className="text-left py-3 px-5 font-semibold text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em] whitespace-nowrap">
                Timestamp
              </th>

              <th className="text-left py-3 px-5 font-semibold text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em] sticky left-0 bg-white z-30 whitespace-nowrap">
                {scopeLabel}
              </th>

              {hasSplitValues && (
                <th className="text-left py-3 px-5 font-semibold text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em] whitespace-nowrap">
                  {splitLabel}
                </th>
              )}

              {kpiColumns.map((kpi) => (
                <th
                  key={kpi}
                  className="text-right py-3 px-5 font-semibold text-[10px] text-muted-foreground/80 uppercase tracking-[0.12em] whitespace-nowrap"
                >
                  <span className="truncate max-w-[200px] inline-block align-middle" title={kpi}>{kpi}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, idx) => {
              const absIdx = startIdx + idx;

              return (
                <tr
                  key={absIdx}
                  className="border-b border-border/15 hover:bg-muted/30 transition-colors group"
                >
                  <td className="py-3 px-5 tabular-nums text-muted-foreground/90 whitespace-nowrap text-[11px]">
                    {row.timestamp}
                  </td>

                  <td className="py-3 px-5 sticky left-0 bg-white group-hover:bg-muted/30 transition-colors whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: stableColorForSplit(row.ne) }}
                      />
                      <span className="font-semibold text-foreground tracking-tight">{row.ne}</span>
                    </span>
                  </td>

                  {hasSplitValues && (
                    <td className="py-3 px-5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: stableColorForSplit(row.splitValue) }}
                        />
                        <span className="font-medium text-foreground/85">{row.splitValue}</span>
                      </span>
                    </td>
                  )}

                  {kpiColumns.map((kpi) => (
                    <td
                      key={kpi}
                      className="py-3 px-5 text-right tabular-nums font-semibold text-foreground whitespace-nowrap"
                    >
                      {fmtVal(row.kpiValues[kpi] ?? null)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="h-10 border-t border-border/20 flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
          <span>
            Showing {startIdx + 1}–{endIdx} of {totalRows.toLocaleString()} rows
          </span>
          <div className="relative">
            <button
              onClick={() => setShowPageSizeMenu(!showPageSizeMenu)}
              className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
            >
              <span>Items per page: {pageSize}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPageSizeMenu && (
              <div className="absolute bottom-full mb-1 left-0 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden">
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPageSize(s);
                      setCurrentPage(0);
                      setShowPageSizeMenu(false);
                    }}
                    className={cn(
                      'block w-full text-left px-3 py-1.5 text-[10px] hover:bg-primary/10 transition-colors',
                      s === pageSize && 'bg-primary/10 text-primary font-bold',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            disabled={safePage === 0}
            onClick={() => setCurrentPage(0)}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            disabled={safePage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center px-2">
            <span className="text-[10px] font-bold bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center rounded">
              {safePage + 1}
            </span>
            <span className="text-[9px] text-muted-foreground ml-1">/ {totalPages}</span>
          </div>
          <button
            className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            disabled={safePage >= totalPages - 1}
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="p-1 hover:bg-muted rounded disabled:opacity-30 transition-colors"
            disabled={safePage >= totalPages - 1}
            onClick={() => setCurrentPage(totalPages - 1)}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestigatorDataTable;
