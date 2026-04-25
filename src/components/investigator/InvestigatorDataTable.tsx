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

type RuntimeDataPoint = DataPoint & {
  _slotId?: string;
  time?: string;
  timestamp?: string;
  date?: string;
  NE?: string;
  ne?: string;
  plaque?: string;
  plaque_name?: string;
  cell?: string;
  cell_name?: string;
  site?: string;
  site_name?: string;
  dimensionName?: string;
  dimension_name?: string;
  dimName?: string;
  dimension?: any;
  dimensions?: any;
  dims?: Array<{ key?: string; name?: string; value?: string }>;
  labels?: Record<string, string>;
  tags?: Record<string, string>;
  kpiName?: string;
  kpi_name?: string;
  metric?: string;
  metricName?: string;
  metric_name?: string;
  kpiValue?: number;
  kpi_value?: number;
  measureValue?: number;
  measure_value?: number;
};

type PivotRow = {
  time: string;
  dimensionValue: string;
  kpiValues: Record<string, number | null>;
};

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

const fmtTime = (ts: string) => (ts.length > 10 ? ts.slice(0, 16).replace('T', ' ') : ts);

const fmtVal = (v: number | null | undefined) => {
  if (v == null) return '-';
  const num = Number(v);
  if (!isFinite(num)) return '-';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  let fractionDigits = 2;
  if (abs > 0 && abs < 0.01) {
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

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeDimensionLabel(label?: string | null): string {
  if (!label) return 'NE';
  const raw = String(label).trim();
  if (!raw) return 'NE';
  const normalized = raw.toUpperCase();
  if (normalized === 'ZONE_ARCEP') return 'ZONE ARCEP';
  return normalized;
}

function getFirstDimensionEntry(item: RuntimeDataPoint) {
  if (Array.isArray(item.dimensions) && item.dimensions.length > 0) {
    return item.dimensions[0];
  }
  if (Array.isArray(item.dims) && item.dims.length > 0) {
    return item.dims[0];
  }
  return null;
}

function getDimensionValue(item: RuntimeDataPoint): string {
  const firstDimension = getFirstDimensionEntry(item);
  const directCandidates = [
    item.networkElement,
    item.splitValue,
    item.NE,
    item.ne,
    item.plaque,
    item.plaque_name,
    item.cell,
    item.cell_name,
    item.site,
    item.site_name,
    item.dimension?.NE,
    item.dimension?.ne,
    item.dimension?.plaque,
    item.dimension?.cell,
    item.dimension?.site,
    !Array.isArray(item.dimensions) ? item.dimensions?.NE : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.ne : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.plaque : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.cell : undefined,
    !Array.isArray(item.dimensions) ? item.dimensions?.site : undefined,
    firstDimension?.value,
    firstDimension?.name,
    item.labels?.NE,
    item.labels?.ne,
    item.labels?.plaque,
    item.labels?.cell,
    item.labels?.site,
    item.tags?.NE,
    item.tags?.ne,
    item.tags?.plaque,
    item.tags?.cell,
    item.tags?.site,
  ];

  for (const candidate of directCandidates) {
    if (candidate == null) continue;
    const value = String(candidate).trim();
    if (value && value !== 'undefined' && value !== 'null' && value !== '-') {
      return value;
    }
  }

  return '-';
}

function getDimensionLabel(item: RuntimeDataPoint, activeSlot?: GraphSlot | null): string {
  const firstDimension = getFirstDimensionEntry(item);
  const directLabel =
    item.dimensionName ||
    item.dimension_name ||
    item.dimName ||
    firstDimension?.key ||
    firstDimension?.name ||
    (activeSlot?.splitBy && activeSlot.splitBy !== 'None' ? activeSlot.splitBy : null);

  if (directLabel) return normalizeDimensionLabel(directLabel);

  if (item.plaque || item.plaque_name || item.dimension?.plaque || item.labels?.plaque || item.tags?.plaque) return 'PLAQUE';
  if (item.cell || item.cell_name || item.dimension?.cell || item.labels?.cell || item.tags?.cell) return 'CELL';
  if (item.site || item.site_name || item.dimension?.site || item.labels?.site || item.tags?.site) return 'SITE';
  if (item.NE || item.ne || item.dimension?.NE || item.labels?.NE || item.tags?.NE) return 'NE';
  if (item.networkElement) return 'NE';
  return 'NE';
}

function getKpiName(item: RuntimeDataPoint): string | null {
  const candidate =
    item.kpi ||
    item.kpiName ||
    item.kpi_name ||
    item.metric ||
    item.metricName ||
    item.metric_name;

  if (!candidate) return null;
  const value = cleanKpi(String(candidate).trim());
  return value || null;
}

function getKpiValue(item: RuntimeDataPoint): number | null {
  const candidate =
    item.value ??
    item.kpiValue ??
    item.kpi_value ??
    item.measureValue ??
    item.measure_value;

  if (candidate == null) return null;
  const num = Number(candidate);
  return isFinite(num) ? num : null;
}

function getTimeValue(item: RuntimeDataPoint): string | null {
  const candidate = item.time ?? item.timestamp ?? item.date;
  if (!candidate) return null;
  const value = String(candidate).trim();
  return value || null;
}

function sanitizeTableData(tsData: DataPoint[], activeSlot?: GraphSlot | null): RuntimeDataPoint[] {
  const runtimeData = tsData as RuntimeDataPoint[];
  if (!activeSlot) return runtimeData;

  const slotKeys = new Set([
    ...(activeSlot.kpiIds || []),
    ...((activeSlot as GraphSlot & { counterIds?: string[] }).counterIds || []),
  ]);

  const keyMatches = (point: RuntimeDataPoint) => {
    const pointKpi = getKpiName(point);
    return slotKeys.size === 0 || (!!pointKpi && slotKeys.has(pointKpi));
  };

  const taggedForSlot = runtimeData.filter(point => point._slotId === activeSlot.id && keyMatches(point));
  if (taggedForSlot.length > 0) return taggedForSlot;

  const untaggedMatches = runtimeData.filter(point => point._slotId == null && keyMatches(point));
  if (untaggedMatches.length > 0) return untaggedMatches;

  return runtimeData.filter(keyMatches);
}

function buildPivotTable(tsData: RuntimeDataPoint[], activeSlot?: GraphSlot | null) {
  const rowsByKey = new Map<string, PivotRow>();
  const kpiSet = new Set<string>();
  let resolvedDimensionLabel: string | null =
    activeSlot?.splitBy && activeSlot.splitBy !== 'None'
      ? normalizeDimensionLabel(activeSlot.splitBy)
      : null;

  for (const item of tsData) {
    const time = getTimeValue(item);
    const kpiName = getKpiName(item);
    const value = getKpiValue(item);
    const dimensionValue = getDimensionValue(item);

    if (!time || !kpiName) continue;

    if (!resolvedDimensionLabel) {
      resolvedDimensionLabel = getDimensionLabel(item, activeSlot);
    }

    kpiSet.add(kpiName);

    const key = `${time}__${dimensionValue}`;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        time,
        dimensionValue,
        kpiValues: {},
      });
    }

    rowsByKey.get(key)!.kpiValues[kpiName] = value;
  }

  const kpiColumns = Array.from(kpiSet);
  const rows = Array.from(rowsByKey.values())
    .sort((a, b) => {
      const timeDiff = String(b.time).localeCompare(String(a.time));
      if (timeDiff !== 0) return timeDiff;
      return a.dimensionValue.localeCompare(b.dimensionValue);
    })
    .map((row) => ({
      ...row,
      time: fmtTime(row.time),
    }));

  return {
    rows,
    kpiColumns,
    dimensionLabel: resolvedDimensionLabel || 'NE',
  };
}

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

  const tableData = useMemo(
    () => sanitizeTableData(tsData, activeSlot),
    [tsData, activeSlot]
  );

  const { rows, kpiColumns, dimensionLabel } = useMemo(
    () => buildPivotTable(tableData, activeSlot),
    [tableData, activeSlot]
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
    const header = ['TIME', dimensionLabel, ...kpiColumns].map(escapeCsv).join(',');
    const csvRows = rows.map((row) =>
      [row.time, row.dimensionValue, ...kpiColumns.map((kpi) => row.kpiValues[kpi] ?? '')]
        .map(escapeCsv)
        .join(',')
    );

    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table_data_${activeSlot?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (tableData.length === 0 || rows.length === 0) {
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
    <div className="flex-grow rounded-2xl border border-border/40 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
      <div className="px-6 py-3 bg-white border-b border-border/30">
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            Table Data
          </span>
          <span className="text-foreground/80 font-semibold">{sourceInfo.slotLabel}</span>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-muted-foreground">
            KPIs: <span className="text-foreground/70">{sourceInfo.kpiNames || '-'}</span>
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-muted-foreground">{totalRows.toLocaleString()} rows</span>
        </div>
      </div>

      <div className="h-12 border-b border-border/20 flex items-center justify-between px-6 bg-white">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Table</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">
            {dimensionLabel} x {kpiColumns.length} KPI{kpiColumns.length !== 1 ? 's' : ''}
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
              <th className="text-left py-3 px-5 font-bold text-[13px] text-emerald-600 uppercase tracking-[0.08em] whitespace-nowrap">
                TIME
              </th>
              <th className="text-left py-3 px-5 font-bold text-[13px] text-emerald-600 uppercase tracking-[0.08em] sticky left-0 bg-white z-30 whitespace-nowrap">
                {dimensionLabel}
              </th>
              {kpiColumns.map((kpi) => (
                <th
                  key={kpi}
                  className="text-right py-3 px-5 font-bold text-[13px] text-emerald-600 uppercase tracking-[0.08em] whitespace-nowrap"
                >
                  <span className="truncate max-w-[240px] inline-block align-middle" title={kpi}>{kpi}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, idx) => {
              const absIdx = startIdx + idx;

              return (
                <tr
                  key={`${row.time}-${row.dimensionValue}-${absIdx}`}
                  className="border-b border-border/15 hover:bg-muted/30 transition-colors group"
                >
                  <td className="py-3 px-5 tabular-nums text-muted-foreground/90 whitespace-nowrap text-[11px]">
                    {row.time}
                  </td>

                  <td className="py-3 px-5 sticky left-0 bg-white group-hover:bg-muted/30 transition-colors whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: stableColorForSplit(row.dimensionValue) }}
                      />
                      <span className="font-semibold text-foreground tracking-tight">{row.dimensionValue}</span>
                    </span>
                  </td>

                  {kpiColumns.map((kpi) => {
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
                      <td key={kpi} className="py-3 px-5 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-3">
                          <div className="relative h-1 w-20 rounded-full bg-muted/50 overflow-hidden">
                            {value != null && (
                              <div
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: barColor }}
                              />
                            )}
                          </div>
                          <span className="tabular-nums font-semibold text-foreground text-right min-w-[3.5rem]">
                            {fmtVal(value)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="h-10 border-t border-border/20 flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
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
