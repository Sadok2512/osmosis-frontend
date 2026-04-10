import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataPoint, GraphSlot } from './types';

interface Props {
  tsData: DataPoint[];
  activeSlot?: GraphSlot | null;
  siteName?: string;
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
    : '—';

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot, siteName }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

  const hasSplits = useMemo(() => tsData.some((d) => d.splitValue), [tsData]);
  const hasSplit2 = useMemo(() => tsData.some((d) => d.splitValue2), [tsData]);

  // Derive split labels: prefer slot-level, then detect from per-KPI splits, then fallback
  const split1Label = useMemo(() => {
    const raw = activeSlot?.splitBy;
    if (raw && raw !== 'None') return raw.replace('PM_DIM:', '');
    // Check per-KPI splits for a PM_DIM label
    const perKpi = activeSlot?.config?.splitByPerKpi;
    if (perKpi) {
      for (const v of Object.values(perKpi)) {
        if (v && v !== 'None') return (v as string).replace('PM_DIM:', '');
      }
    }
    // Detect from data: if splitValues look like PMQAP/QCI labels
    if (tsData.some(d => d.splitValue && /^(PMQAP|QCI|5QI|ARP)/i.test(d.splitValue))) return 'PMQAP';
    return 'Split';
  }, [activeSlot, tsData]);
  const split2Label = useMemo(() => {
    const raw = activeSlot?.splitBy2 || activeSlot?.config?.splitByPerKpi2 && Object.values(activeSlot.config.splitByPerKpi2).find(v => v && v !== 'None');
    if (!raw || raw === 'None') return 'Split 2';
    const clean = (raw as string).replace('PM_DIM:', '');
    // Friendly labels for common split dimensions
    if (/^cell$/i.test(clean)) return 'Cell Name';
    if (/^site$/i.test(clean)) return 'Site Name';
    return clean;
  }, [activeSlot]);

  // ── Build rows ──
  const { rows, columns } = useMemo(() => {
    if (hasSplits) {
      const sorted = [...tsData].sort(
        (a, b) =>
          a.timestamp.localeCompare(b.timestamp) ||
          (a.splitValue || '').localeCompare(b.splitValue || ''),
      );
      const seriesKeys = [...new Set(tsData.map((d) => `${d.kpi}@${d.splitValue || ''}@${d.splitValue2 || ''}`))];
      const colorMap: Record<string, string> = {};
      seriesKeys.forEach((k, i) => {
        colorMap[k] = COLORS[i % COLORS.length];
      });

      const cols = [
        'Timestamp',
        'Network Element',
        'CELL',
        split1Label,
        ...(hasSplit2 ? [split2Label] : []),
        'KPI Metric',
        'Value',
      ];

      const builtRows = sorted.map((d) => {
        const seriesKey = `${d.kpi}@${d.splitValue || ''}@${d.splitValue2 || ''}`;
        const rawNe = d.networkElement || d.splitValue || '';
        const cellName = rawNe;
        // Clean KPI name: remove @CellName suffix
        const cleanKpi = d.kpi.includes('@') ? d.kpi.split('@')[0] : d.kpi;
        return {
          timestamp: fmt(d.timestamp),
          ne: siteName || '—',
          cell: cellName || '—',
          split1: d.splitValue || '—',
          split2: d.splitValue2 || '—',
          kpi: cleanKpi,
          value: d.value,
          color: colorMap[seriesKey] || COLORS[0],
        };
      });

      return { rows: builtRows, columns: cols };
    }

    // ── Non-split: flat rows ──
    const kpis = [...new Set(tsData.map((d) => d.kpi))];
    const timestamps = [...new Set(tsData.map((d) => d.timestamp))].sort();
    const lookup: Record<string, Record<string, number>> = {};
    kpis.forEach((k) => {
      lookup[k] = {};
    });
    tsData.forEach((p) => {
      if (lookup[p.kpi]) lookup[p.kpi][p.timestamp] = p.value;
    });
    // Clean KPI names (remove @CellName suffix)
    const cleanKpis = kpis.map(k => k.includes('@') ? k.split('@')[0] : k);
    const cols = ['Timestamp', 'Network Element', ...cleanKpis];
    const builtRows = timestamps.map((ts) => ({
      timestamp: fmt(ts),
      ne: siteName || '—',
      kpiValues: kpis.map((k) => lookup[k]?.[ts] ?? null),
    }));

    return { rows: builtRows, columns: cols };
  }, [tsData, hasSplits, hasSplit2, split1Label, split2Label, siteName]);

  // ── Pagination ──
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const startIdx = safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);
  const pageRows = rows.slice(startIdx, endIdx);

  // ── CSV export ──
  const exportCsv = () => {
    const header = columns.join(',');
    let csvRows: string[];
    if (hasSplits) {
      csvRows = (rows as any[]).map((r) => {
        const parts = [r.timestamp, r.ne, r.cell, r.kpi, r.value];
        return parts.join(',');
      });
    } else {
      csvRows = (rows as any[]).map((r) => {
        const parts = [r.timestamp, r.ne, ...(r.kpiValues || [])];
        return parts.join(',');
      });
    }
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'table_data.csv';
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
      {/* ── Toolbar ── */}
      <div className="h-10 border-b border-border/30 flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Table Data</span>
          <span className="text-[9px] text-muted-foreground font-medium">{totalRows.toLocaleString()} rows</span>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      {/* ── Table ── */}
      <div className="overflow-auto flex-grow relative" style={{ maxHeight: 500 }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/80 backdrop-blur-md border-b border-border/30">
              {/* Timestamp */}
              <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider group cursor-pointer hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  Timestamp
                  <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </th>

              {/* NE — sticky */}
              <th className="text-left py-3 px-4 font-bold text-primary uppercase tracking-wider sticky left-0 bg-muted/95 z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] group cursor-pointer hover:bg-primary/10 transition-colors">
                <div className="flex items-center gap-2">
                  Network Element
                  <ChevronDown className="w-3 h-3 transition-opacity" />
                </div>
              </th>

              {hasSplits ? (
                <>
                  <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider group cursor-pointer hover:bg-muted transition-colors">
                    <div className="flex items-center gap-2">
                      CELL
                      <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider group cursor-pointer hover:bg-muted transition-colors">
                    <div className="flex items-center gap-2">
                      KPI Metric
                      <Filter className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </th>
                  <th className="text-right py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider group cursor-pointer hover:bg-muted transition-colors">
                    <div className="flex items-center justify-end gap-2">
                      Value
                      <Filter className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </th>
                </>
              ) : (
                <>
                  {columns.slice(2).map((col, i) => (
                    <th
                      key={col}
                      className="text-right py-3 px-4 font-bold text-muted-foreground uppercase tracking-wider group cursor-pointer hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="whitespace-nowrap">{col}</span>
                      </div>
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/10">
            {pageRows.map((row: any, idx) => {
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

                  {hasSplits ? (
                    <>
                      {/* CELL */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-foreground">{row.cell}</span>
                        </span>
                      </td>
                      {/* KPI */}
                      <td className="py-2.5 px-4 text-foreground truncate max-w-[150px]" title={row.kpi}>
                        {row.kpi}
                      </td>
                      {/* Value */}
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium text-foreground whitespace-nowrap">
                        {fmtVal(row.value)}
                      </td>
                    </>
                  ) : (
                    <>
                      {(row.kpiValues || []).map((v: number | null, ki: number) => (
                        <td
                          key={ki}
                          className="py-2.5 px-4 text-right tabular-nums font-medium text-foreground whitespace-nowrap"
                        >
                          {fmtVal(v)}
                        </td>
                      ))}
                    </>
                  )}
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
