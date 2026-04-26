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
import {
  buildPivotTable,
  formatInvestigatorValue,
  sanitizeTableData,
  TABLE_ACCENT_BG_CLASS,
  TABLE_ACCENT_BORDER_CLASS,
  TABLE_ACCENT_TEXT_CLASS,
} from './tableDisplayUtils';

interface Props {
  tsData: DataPoint[];
  activeSlot?: GraphSlot | null;
  siteName?: string;
  filterContext?: Record<string, string[]>;
  forceSplitOff?: boolean;
  backendRefreshKey?: number;
  investigatorState?: {
    startDate: string;
    endDate: string;
    granularity: string;
    splitBy: string;
    filters: Record<string, string[]>;
    kpiLevel: string;
    profileQci?: number | null;
    profileArp?: number | null;
    neighborType?: string | null;
  };
}

const PAGE_SIZES = [25, 50, 100, 200];

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

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot, filterContext, investigatorState }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

  const tableData = useMemo(
    () => sanitizeTableData(tsData, activeSlot),
    [tsData, activeSlot]
  );

  const { rows, kpiColumns, columns } = useMemo(
    () => buildPivotTable(tableData, activeSlot, filterContext, investigatorState),
    [tableData, activeSlot, filterContext, investigatorState]
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [pageSize, rows.length, activeSlot?.id]);

  const sourceInfo = useMemo(() => {
    const kpis = kpiColumns.join(', ');
    return {
      slotLabel: (activeSlot as GraphSlot & { label?: string } | null)?.label || activeSlot?.name || activeSlot?.id || 'Timeseries',
      kpiNames: kpis,
      rowCount: rows.length,
    };
  }, [kpiColumns, rows.length, activeSlot]);

  const kpiRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const kpi of kpiColumns) {
      let min = Infinity;
      let max = -Infinity;
      for (const row of rows) {
        const value = row.kpiValues[kpi];
        if (value == null || !isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      ranges[kpi] = {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 0,
      };
    }
    return ranges;
  }, [rows, kpiColumns]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const startIdx = safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);
  const pageRows = rows.slice(startIdx, endIdx);

  const exportCsv = () => {
    const header = columns.map((column) => escapeCsv(column.label)).join(',');
    const csvRows = rows.map((row) =>
      columns.map((column) => {
        if (column.key === 'time') return row.time;
        if (column.kind === 'kpi') return row.values[column.key] ?? '';
        return row.values[column.key] ?? '';
      })
        .map(escapeCsv)
        .join(',')
    );

    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table_data_${activeSlot?.name || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (rows.length === 0) {
    const hasNoKpis =
      (!activeSlot?.kpiIds || activeSlot.kpiIds.length === 0) &&
      (!(activeSlot as GraphSlot & { counterIds?: string[] })?.counterIds ||
        (activeSlot as GraphSlot & { counterIds?: string[] }).counterIds!.length === 0);

    return (
      <div className="flex-grow rounded-xl border border-border/20 bg-card shadow-sm overflow-hidden flex flex-col items-center justify-center h-48 gap-2 px-6 text-center">
        {hasNoKpis ? (
          <>
            <p className="text-xs font-semibold text-foreground">Aucun KPI ni compteur selectionne sur ce graphe</p>
            <p className="text-[11px] text-muted-foreground">
              Ouvrez le selecteur de KPI/compteurs sur le graphe "{activeSlot?.name || 'Timeseries'}", ajoutez au moins un element, puis cliquez sur <span className="font-semibold text-primary">Appliquer</span>.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-foreground">Aucune donnee exploitable pour ce graphe</p>
            <p className="text-[11px] text-muted-foreground">
              Cliquez sur <span className="font-semibold text-primary">Appliquer</span> pour executer la requete, ou ajustez la periode / les filtres.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-grow rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-24px_rgba(20,116,108,0.28)] overflow-hidden flex flex-col">
      <div className="px-6 py-3.5 bg-gradient-to-r from-white via-[#14746C]/[0.025] to-white border-b border-slate-200/80">
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Table Data
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-foreground/90 font-semibold shadow-sm">
            {sourceInfo.slotLabel}
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-muted-foreground">
            KPIs: <span className="text-foreground/70 font-medium">{sourceInfo.kpiNames || '-'}</span>
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-muted-foreground">{totalRows.toLocaleString()} rows</span>
        </div>
      </div>

      <div className="min-h-12 border-b border-slate-200/70 flex items-center justify-between px-6 py-2.5 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Layout</span>
          <span className={cn('text-[10px] px-2.5 py-1 rounded-full font-semibold border', TABLE_ACCENT_BG_CLASS, TABLE_ACCENT_TEXT_CLASS, TABLE_ACCENT_BORDER_CLASS)}>
            {columns.filter((column) => column.kind === 'filter' || column.kind === 'split' || column.kind === 'dimension').length || 1} dimension{columns.filter((column) => column.kind === 'filter' || column.kind === 'split' || column.kind === 'dimension').length > 1 ? 's' : ''} x {kpiColumns.length} KPI{kpiColumns.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors border border-slate-200/80"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      <div className="overflow-auto flex-grow relative bg-white" style={{ maxHeight: 500 }}>
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50/95 backdrop-blur border-b border-slate-200/80">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'py-3 px-5 font-bold text-[12px] uppercase tracking-[0.12em] whitespace-nowrap',
                    column.kind === 'time' ? 'text-left text-slate-500' : '',
                    column.kind === 'kpi' ? `text-right ${TABLE_ACCENT_TEXT_CLASS}` : '',
                    (column.kind === 'filter' || column.kind === 'split' || column.kind === 'dimension') ? `text-left ${TABLE_ACCENT_TEXT_CLASS}` : '',
                  )}
                >
                  <span className="truncate max-w-[240px] inline-block align-middle" title={column.label}>{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, idx) => {
              const absIdx = startIdx + idx;

              return (
                <tr
                  key={`${row.rawTime}-${absIdx}`}
                  className={cn(
                    'border-b border-slate-100/90 transition-colors group',
                    absIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/35',
                    'hover:bg-[#14746C]/[0.045]',
                  )}
                >
                  {columns.map((column) => {
                    if (column.key === 'time') {
                      return (
                        <td key={column.key} className="py-3.5 px-5 tabular-nums text-slate-500 whitespace-nowrap text-[11px] font-medium">
                          {row.time}
                        </td>
                      );
                    }

                    if (column.kind === 'kpi') {
                      const kpi = column.label;
                      const value = row.kpiValues[kpi];
                      const range = kpiRanges[kpi];
                      let pct = 0;
                      if (value != null && isFinite(value) && range && range.max > range.min) {
                        pct = Math.max(4, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100));
                      } else if (value != null && isFinite(value) && range && range.max === range.min && value !== 0) {
                        pct = 100;
                      }
                      const barColor = stableColorForSplit(kpi);

                      return (
                        <td key={column.key} className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            <div className="relative h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                              {value != null && (
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                                />
                              )}
                            </div>
                            <span className="tabular-nums font-semibold text-slate-900 text-right min-w-[4.5rem]">
                              {formatInvestigatorValue(value)}
                            </span>
                          </div>
                        </td>
                      );
                    }

                    const displayValue = String(row.values[column.key] ?? '—');
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'py-3.5 px-5 whitespace-nowrap transition-colors',
                          TABLE_ACCENT_BG_CLASS,
                          TABLE_ACCENT_BORDER_CLASS,
                          'group-hover:bg-[#14746C]/12',
                        )}
                      >
                        <span className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]', TABLE_ACCENT_BORDER_CLASS, TABLE_ACCENT_BG_CLASS)}>
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: stableColorForSplit(displayValue) }}
                          />
                          <span className={cn('font-semibold tracking-tight', TABLE_ACCENT_TEXT_CLASS)}>
                            {displayValue}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-h-10 border-t border-slate-200/80 flex items-center justify-between px-4 py-2 bg-slate-50/70">
        <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.16em]">
          <span>
            Showing {startIdx + 1}-{endIdx} of {totalRows.toLocaleString()} rows
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
                {PAGE_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(0);
                      setShowPageSizeMenu(false);
                    }}
                    className={cn(
                      'block w-full text-left px-3 py-1.5 text-[10px] hover:bg-primary/10 transition-colors',
                      size === pageSize && 'bg-primary/10 text-primary font-bold',
                    )}
                  >
                    {size}
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
            onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
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
            onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
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
