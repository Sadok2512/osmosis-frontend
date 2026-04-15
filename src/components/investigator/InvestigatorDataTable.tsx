import React, { useMemo, useState } from 'react';
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
}

// Same palette & hash as KPIGraphs.tsx so cell colors match the graph
const SPLIT_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4',
  '#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6',
  '#f97316','#a855f7','#22d3ee','#4ade80','#fbbf24',
  '#fb7185','#2dd4bf','#818cf8','#facc15','#34d399',
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

const fmtVal = (v: number | null | undefined) =>
  v != null
    ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

/** Clean KPI key: remove @splitValue suffix */
const cleanKpi = (k: string) => k.includes('@') ? k.split('@')[0] : k;

/**
 * Build pivot table: one row per (timestamp, networkElement, cell)
 * with separate columns for each KPI metric.
 */
function buildPivotTable(tsData: DataPoint[], siteName?: string) {
  // Discover unique KPI metrics
  const kpiSet = new Set<string>();
  tsData.forEach(d => kpiSet.add(cleanKpi(d.kpi)));
  const kpiColumns = [...kpiSet];

  // Collect all unique timestamps and network elements
  const timestampSet = new Set<string>();
  const neSet = new Set<string>();
  
  for (const d of tsData) {
    timestampSet.add(d.timestamp);
    const ne = d.networkElement || d.splitValue || siteName || '';
    neSet.add(ne);
  }

  const timestamps = [...timestampSet].sort();
  const networkElements = [...neSet].sort();

  // Build lookup: "timestamp||ne||kpi" → value
  const lookup = new Map<string, number | null>();
  for (const d of tsData) {
    const ne = d.networkElement || d.splitValue || siteName || '';
    const kpi = cleanKpi(d.kpi);
    lookup.set(`${d.timestamp}||${ne}||${kpi}`, d.value);
  }

  // Generate full cross-product: every timestamp × every NE
  const rows: { timestamp: string; ne: string; cell: string; kpiValues: Record<string, number | null> }[] = [];
  
  for (const ts of timestamps) {
    for (const ne of networkElements) {
      const kpiValues: Record<string, number | null> = {};
      for (const kpi of kpiColumns) {
        const key = `${ts}||${ne}||${kpi}`;
        kpiValues[kpi] = lookup.has(key) ? lookup.get(key)! : null;
      }
      rows.push({
        timestamp: fmt(ts),
        ne: ne || '—',
        cell: ne || '—',
        kpiValues,
      });
    }
  }

  // Determine if we have splits (cell-level data)
  const hasCells = tsData.some(d => d.splitValue || d.networkElement);

  return { rows, kpiColumns, hasCells };
}

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot, siteName }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

  // ── Source info ──
  const sourceInfo = useMemo(() => {
    const kpis = [...new Set(tsData.map(d => cleanKpi(d.kpi)))];
    return {
      slotLabel: (activeSlot as any)?.label || activeSlot?.name || activeSlot?.id || 'Timeseries',
      kpiCount: kpis.length,
      kpiNames: kpis.join(', '),
      rowCount: tsData.length,
    };
  }, [tsData, activeSlot]);

  // ── Build pivot table ──
  const { rows, kpiColumns, hasCells } = useMemo(
    () => buildPivotTable(tsData, siteName),
    [tsData, siteName]
  );

  // ── Pagination ──
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const startIdx = safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);
  const pageRows = rows.slice(startIdx, endIdx);

  // ── CSV export ──
  const exportCsv = () => {
    const headerCols = ['Timestamp', 'Network Element'];
    if (hasCells) headerCols.push('Cell');
    headerCols.push(...kpiColumns);
    const header = headerCols.join(',');

    const csvRows = rows.map(r => {
      const baseCols = [r.timestamp, r.ne];
      if (hasCells) baseCols.push(r.cell);
      const kpiVals = kpiColumns.map(k => r.kpiValues[k] ?? '');
      return [...baseCols, ...kpiVals].join(',');
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

  if (tsData.length === 0) {
    return (
      <div className="flex-grow rounded-xl border border-border/20 bg-card shadow-sm overflow-hidden flex items-center justify-center h-48">
        <p className="text-xs text-muted-foreground">Aucune donnée — cliquez sur Appliquer</p>
      </div>
    );
  }

  return (
    <div className="flex-grow rounded-xl border border-border/20 bg-card shadow-sm overflow-hidden flex flex-col">
      {/* ── Source Info Banner ── */}
      <div className="px-5 py-3 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
            📊 {sourceInfo.slotLabel}
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground font-medium">
            KPIs: <span className="text-foreground">{sourceInfo.kpiNames}</span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground font-medium">
            {totalRows} pivoted rows ({sourceInfo.rowCount} raw points)
          </span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="h-14 border-b border-border/30 flex items-center justify-between px-5 bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-foreground uppercase tracking-wider">Table Data</span>
          <span className="text-xs text-muted-foreground font-medium">{totalRows.toLocaleString()} rows</span>
          <span className="text-[9px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
            {kpiColumns.length} KPI{kpiColumns.length !== 1 ? 's' : ''} × {hasCells ? 'Cell' : 'NE'}
          </span>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
        >
          <Download className="w-5 h-5" />
          CSV
        </button>
      </div>

      {/* ── Table — Pivot Format ── */}
      <div className="overflow-auto flex-grow relative" style={{ maxHeight: 500 }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/80 backdrop-blur-md border-b border-border/30">
              {/* Timestamp */}
              <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Timestamp
              </th>

              {/* NE — sticky */}
              <th className="text-left py-3 px-4 font-bold text-primary uppercase tracking-wider sticky left-0 bg-muted/95 z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                Network Element
              </th>

              {/* Cell — only when splits exist */}
              {hasCells && (
                <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  Cell
                </th>
              )}

              {/* KPI Columns */}
              {kpiColumns.map((kpi, i) => (
                <th
                  key={kpi}
                  className="text-right py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="truncate max-w-[200px]" title={kpi}>{kpi}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/10">
            {pageRows.map((row, idx) => {
              const absIdx = startIdx + idx;
              const isOdd = absIdx % 2 !== 0;

              return (
                <tr
                  key={absIdx}
                  className={cn(
                    'hover:bg-primary/5 transition-colors group',
                    isOdd && 'bg-muted/20',
                  )}
                >
                  {/* Timestamp */}
                  <td className="py-2.5 px-4 tabular-nums text-muted-foreground whitespace-nowrap">
                    {row.timestamp}
                  </td>

                  {/* NE — sticky */}
                  <td
                    className={cn(
                      'py-2.5 px-4 font-semibold text-primary sticky left-0 transition-colors shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap',
                      isOdd ? 'bg-muted/20 group-hover:bg-primary/5' : 'bg-card group-hover:bg-primary/5',
                    )}
                  >
                    {row.ne}
                  </td>

                  {/* Cell — with color dot matching graph series */}
                  {hasCells && (
                    <td className="py-2.5 px-4 whitespace-nowrap text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
                          style={{ backgroundColor: stableColorForSplit(row.cell) }}
                        />
                        <span className="font-medium">{row.cell}</span>
                      </span>
                    </td>
                  )}

                  {/* KPI values */}
                  {kpiColumns.map((kpi) => (
                    <td
                      key={kpi}
                      className="py-2.5 px-4 text-right tabular-nums font-medium text-foreground whitespace-nowrap"
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

      {/* ── Pagination ── */}
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
