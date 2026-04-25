import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { resolveSlotContext } from './investigatorApi';
import { normalizeGranularity } from './types';
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

const InvestigatorDataTable: React.FC<Props> = ({ tsData, activeSlot, siteName, filterContext, forceSplitOff, backendRefreshKey = 0, investigatorState }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);
  const [backendRows, setBackendRows] = useState<any[]>([]);
  const [backendTotal, setBackendTotal] = useState(0);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendPage, setBackendPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);
  const lastBackendRefreshRef = useRef(0);

  // Fetch from KPI Engine /monitor/query/table when slot has KPIs and investigatorState is available
  const kpiIds = activeSlot?.kpiIds || [];
  const hasKpis = kpiIds.length > 0;
  // Only send split_by when the user has explicitly chosen one on the slot.
  // If forceSplitOff is true OR the slot's splitBy is 'None'/empty, omit it from the request.
  const rawSplit = activeSlot?.splitBy;
  const splitBy = !forceSplitOff && rawSplit && rawSplit !== 'None' ? rawSplit : null;

  // Stabilize KPI deps; backend table refresh is driven by Apply, not by live pending filters.
  const kpiIdsKey = kpiIds.join(',');

  useEffect(() => {
    if (!hasKpis || !investigatorState || !activeSlot) {
      setBackendRows([]);
      setBackendTotal(0);
      setBackendLoading(false);
      return;
    }

    const isNewRefresh = lastBackendRefreshRef.current !== backendRefreshKey;
    if (isNewRefresh) {
      lastBackendRefreshRef.current = backendRefreshKey;
      if (backendPage !== 1) {
        setBackendPage(1);
        return;
      }
    }

    // Abort any in-flight request before starting a new one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBackendLoading(true);

    const ctx = resolveSlotContext(activeSlot, {
      startDate: investigatorState.startDate,
      endDate: investigatorState.endDate,
      granularity: investigatorState.granularity as any,
      splitBy: investigatorState.splitBy,
      filters: investigatorState.filters,
      kpiLevel: investigatorState.kpiLevel,
      profileQci: investigatorState.profileQci,
      profileArp: investigatorState.profileArp,
      neighborType: investigatorState.neighborType,
    });

    const filters = ctx.filters.map(f => ({ dimension: f.dimension, op: 'IN', values: f.values }));

    const body: Record<string, any> = {
      kpi_keys: kpiIds,
      filters,
      date_from: ctx.dateFrom,
      date_to: ctx.dateTo,
      granularity: ctx.granularity,
      page: backendPage,
      page_size: pageSize,
    };
    if (splitBy) body.split_by = splitBy;

    fetch(getApiUrl('monitor/query/table'), {
      method: 'POST',
      headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : { rows: [], total: 0 })
      .then(data => {
        // Only commit results if THIS controller is still the active one
        if (abortRef.current !== controller) return;
        setBackendRows(Array.isArray(data?.rows) ? data.rows : []);
        setBackendTotal(typeof data?.total === 'number' ? data.total : (data?.rows?.length ?? 0));
        setBackendLoading(false);
      })
      .catch((err) => {
        // Silently ignore aborts; only clear loading on real errors
        if (err?.name === 'AbortError') return;
        if (abortRef.current === controller) {
          setBackendLoading(false);
        }
      });

    // Do NOT abort on cleanup — let the request finish so React StrictMode
    // double-mount or fast re-renders don't cancel a perfectly valid query.
    // The next effect run will abort via abortRef.current.abort() above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id, kpiIdsKey, backendRefreshKey, splitBy, backendPage, pageSize, investigatorState?.startDate, investigatorState?.endDate, investigatorState?.granularity]);

  // Use backend data when available, fall back to tsData pivot
  const useBackend = hasKpis && investigatorState && backendRows.length > 0;

  const tableData = useMemo(
    () => sanitizeTableData(tsData, activeSlot),
    [tsData, activeSlot]
  );

  useEffect(() => {
    setCurrentPage(0);
    setBackendPage(1);
  }, [pageSize, activeSlot?.id]);

  const sourceInfo = useMemo(() => {
    const kpis = [...new Set(tableData.map(d => cleanKpi(d.kpi)))];
    return {
      slotLabel: (activeSlot as GraphSlot & { label?: string } | null)?.label || activeSlot?.name || activeSlot?.id || 'Timeseries',
      kpiNames: kpis.join(', '),
      rowCount: tableData.length,
    };
  }, [tableData, activeSlot]);

  // Robust dimension-value extractor: walk every common field name a backend
  // might use (NE, plaque, cell, site, dimension, dimensions, labels, tags…).
  const getDimensionValue = (item: any): string => {
    if (!item) return '';
    const direct =
      item.NE ??
      item.ne ??
      item.plaque ??
      item.plaque_name ??
      item.cell ??
      item.cell_name ??
      item.site ??
      item.site_name ??
      item.dimension?.NE ??
      item.dimension?.plaque ??
      item.dimension?.cell ??
      item.dimensions?.NE ??
      item.dimensions?.plaque ??
      item.dimensions?.cell ??
      item.dimensions?.[0]?.value ??
      item.dimensions?.[0]?.name ??
      item.labels?.NE ??
      item.labels?.plaque ??
      item.tags?.NE ??
      item.tags?.plaque ??
      '';
    return direct ? String(direct) : '';
  };

  // Backend table mode: build rows/columns from backend response
  const backendTableData = useMemo(() => {
    if (!useBackend) return null;
    const kpiCols = [...new Set(backendRows.map(r => r.kpi_key))];
    const timestamps = [...new Set(backendRows.map(r => r.ts))].sort();

    // Fix: KPI Engine puts timestamp as split_value when no split_by — detect and clean.
    // Always prefer a real dimension value over a "—" fallback.
    const cleanSplit = (r: any) => {
      const sv = r.split_value;
      if (sv && sv !== r.ts && sv !== fmt(r.ts)) return String(sv);
      // Fall through to other dimension fields
      return getDimensionValue(r);
    };

    const cleanedRows = backendRows.map(r => ({ ...r, _cleanSplit: cleanSplit(r) }));
    const splitValuesClean = [...new Set(cleanedRows.map(r => r._cleanSplit))].sort();

    const lookup = new Map<string, number>();
    for (const r of cleanedRows) {
      const key = `${r.ts}||${r._cleanSplit}||${r.kpi_key}`;
      lookup.set(key, r.avg ?? r.value ?? null);
    }

    const rows: { timestamp: string; splitValue: string; site_name: string; dor: string; band: string; vendor: string; kpiValues: Record<string, number | null> }[] = [];
    for (const ts of timestamps) {
      for (const sv of splitValuesClean) {
        const kpiValues: Record<string, number | null> = {};
        for (const kpi of kpiCols) {
          kpiValues[kpi] = lookup.get(`${ts}||${sv}||${kpi}`) ?? null;
        }
        const sample = cleanedRows.find(r => r.ts === ts && r._cleanSplit === sv);
        const resolvedDim =
          sv ||
          getDimensionValue(sample) ||
          (sample?.site_name && sample.site_name !== sample.ts ? sample.site_name : '') ||
          '—';
        rows.push({
          timestamp: fmt(ts),
          splitValue: resolvedDim,
          site_name: resolvedDim,
          dor: sample?.dor || '',
          band: sample?.band || '',
          vendor: sample?.vendor || '',
          kpiValues,
        });
      }
    }
    return { rows, kpiCols };
  }, [useBackend, backendRows]);

  // Fallback: client-side pivot from tsData
  const { rows, kpiColumns, hasSplitValues, scopeLabel, splitLabel } = useMemo(
    () => buildPivotTable(tableData, siteName, filterContext, forceSplitOff, activeSlot),
    [tableData, siteName, filterContext, forceSplitOff, activeSlot]
  );

  // Choose data source
  const displayRows = backendTableData?.rows || rows;
  const displayKpiCols = backendTableData?.kpiCols || kpiColumns;
  const displayHasSplit = backendTableData ? true : hasSplitValues;

  // Wide-format generic KPI mapping: KPI1, KPI2, ... -> cleaned real name (no "@SITE" suffix)
  const kpiMapping = useMemo(
    () => displayKpiCols.map((real, i) => ({ generic: `KPI${i + 1}`, real: cleanKpi(real), raw: real })),
    [displayKpiCols],
  );

  // Build the dynamic ordered dimension columns:
  // [Time?] + [Dimension1, Dimension2, ...] + [KPI1..KPIN]
  // Time is always present here (rows are timestamped).
  // Dimensions order:
  //   - Backend mode: splitBy (if any) -> DOR -> Band -> Vendor (only if any row has a value)
  //   - Client mode: scopeLabel + (split column if hasSplitValues)
  type DimCol = { key: string; label: string; get: (row: any) => string };
  const dimensionCols: DimCol[] = useMemo(() => {
    const cols: DimCol[] = [];
    if (useBackend) {
      if (splitBy) {
        cols.push({
          key: 'split',
          label: normalizeScopeLabel(splitBy),
          get: (r) => r.splitValue || '—',
        });
      }
      const hasAny = (k: 'dor' | 'band' | 'vendor') =>
        displayRows.some((r: any) => r[k] && String(r[k]).trim() !== '');
      if (hasAny('dor')) cols.push({ key: 'dor', label: 'DOR', get: (r) => r.dor || '—' });
      if (hasAny('band')) cols.push({ key: 'band', label: 'Band', get: (r) => r.band || '—' });
      if (hasAny('vendor')) cols.push({ key: 'vendor', label: 'Vendor', get: (r) => r.vendor || '—' });
      // Fallback: always show at least one Network Element column so the user
      // can identify which entity each row refers to (e.g. global/aggregated view).
      if (cols.length === 0) {
        const scope = getPrimaryScope(filterContext, siteName);
        cols.push({
          key: 'ne',
          label: scope.label || 'NE',
          get: (r) => r.site_name || r.splitValue || scope.value || '—',
        });
      }
    } else {
      // Client-side fallback
      cols.push({ key: 'ne', label: scopeLabel || 'NE', get: (r) => r.ne || '—' });
      if (hasSplitValues) {
        cols.push({ key: 'splitValue', label: splitLabel, get: (r) => r.splitValue || '—' });
      }
    }
    return cols;
  }, [useBackend, splitBy, displayRows, scopeLabel, hasSplitValues, splitLabel, filterContext, siteName]);

  // Per-KPI min/max for inline progress bars
  const kpiRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const kpi of displayKpiCols) {
      let min = Infinity, max = -Infinity;
      for (const r of displayRows) {
        const v = r.kpiValues[kpi];
        if (v == null || !isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ranges[kpi] = { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 };
    }
    return ranges;
  }, [displayRows, displayKpiCols]);

  const totalRows = useBackend ? backendTotal : displayRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = useBackend ? backendPage - 1 : Math.min(currentPage, totalPages - 1);
  const startIdx = useBackend ? 0 : safePage * pageSize;
  const endIdx = useBackend ? displayRows.length : Math.min(startIdx + pageSize, displayRows.length);
  const pageRows = useBackend ? displayRows : displayRows.slice(startIdx, endIdx);

  const exportCsv = () => {
    const headerCols = ['Time', ...dimensionCols.map(d => d.label), ...kpiMapping.map(k => k.generic)];
    const header = headerCols.map(escapeCsv).join(',');

    const csvRows = displayRows.map((r: any) => {
      const baseCols = [r.timestamp, ...dimensionCols.map(d => d.get(r))];
      const kpiVals = kpiMapping.map(({ raw }) => {
        const v = r.kpiValues[raw];
        return v == null ? '—' : v;
      });
      return [...baseCols, ...kpiVals].map(escapeCsv).join(',');
    });

    // Append KPI mapping legend at the end of the CSV for traceability
    const mappingLines = ['', '# KPI Mapping', ...kpiMapping.map(k => `${k.generic},${escapeCsv(k.real)}`)];

    const csv = [header, ...csvRows, ...mappingLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table_data_${activeSlot?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (backendLoading && !useBackend) {
    return (
      <div className="flex-grow rounded-xl border border-border/20 bg-card shadow-sm overflow-hidden flex flex-col items-center justify-center h-48 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">Chargement des données...</p>
      </div>
    );
  }

  if (tableData.length === 0 && !useBackend && !backendLoading) {
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

  // Brand colors per design spec
  const BRAND_GREEN = '#14746C';
  const ROW_BORDER = '#E5E7EB';
  const TRACK_GREY = '#F1F2F4';

  return (
    <div
      className="flex-grow rounded-xl bg-white overflow-hidden flex flex-col"
      style={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        border: `1px solid ${ROW_BORDER}`,
      }}
    >
      {/* Info bar — subtle bordered container */}
      <div
        className="px-6 py-3 bg-white flex items-center justify-between gap-4"
        style={{ borderBottom: `1px solid ${ROW_BORDER}` }}
      >
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: BRAND_GREEN, backgroundColor: `${BRAND_GREEN}10` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BRAND_GREEN }} />
            Source
          </span>
          <span className="text-foreground font-semibold">{sourceInfo.slotLabel}</span>
          <span className="w-px h-4 bg-[#E5E7EB]" />
          <span className="text-muted-foreground text-[11px]">
            KPI: <span className="text-foreground/80 font-medium">{sourceInfo.kpiNames || '—'}</span>
          </span>
          <span className="w-px h-4 bg-[#E5E7EB]" />
          <span className="text-muted-foreground text-[11px]">
            <span className="text-foreground font-semibold">{totalRows.toLocaleString()}</span> rows
          </span>
          <span className="w-px h-4 bg-[#E5E7EB]" />
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#F8F9FA] text-muted-foreground font-medium">
            {kpiMapping.length} KPI{kpiMapping.length !== 1 ? 's' : ''} × {dimensionCols.length} dim{dimensionCols.length !== 1 ? 's' : ''}
          </span>
          {useBackend && (
            <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">
              KPI Engine
            </span>
          )}
          {backendLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          style={{ border: `1px solid ${ROW_BORDER}` }}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* KPI Mapping legend — generic KPIn -> real KPI name */}
      {kpiMapping.length > 0 && (
        <div
          className="px-6 py-2 bg-[#FAFBFC] flex items-center gap-2 flex-wrap"
          style={{ borderBottom: `1px solid ${ROW_BORDER}` }}
        >
          <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            KPI Mapping
          </span>
          {kpiMapping.map(({ generic, real }) => (
            <span
              key={generic}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
              style={{ backgroundColor: `${BRAND_GREEN}10`, color: BRAND_GREEN }}
              title={real}
            >
              <span className="font-bold">{generic}</span>
              <span className="text-foreground/60">=</span>
              <span className="text-foreground/80 truncate max-w-[200px]">{real}</span>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-auto flex-grow relative bg-white" style={{ maxHeight: 500 }}>
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white" style={{ borderBottom: `1.5px solid ${ROW_BORDER}` }}>
              {/* Time column — always first */}
              <th className="text-left py-2 px-4 font-semibold text-[11px] text-foreground/70 uppercase tracking-[0.08em] whitespace-nowrap">
                Time
              </th>

              {/* Dynamic dimension columns — first one is sticky/frozen */}
              {dimensionCols.map((dim, i) => (
                <th
                  key={dim.key}
                  className={cn(
                    'text-left py-2 px-4 font-semibold text-[11px] text-foreground/70 uppercase tracking-[0.08em] whitespace-nowrap',
                    i === 0 && 'sticky left-0 bg-white z-30',
                  )}
                >
                  {dim.label}
                </th>
              ))}

              {/* Generic KPI columns: KPI1, KPI2, ... — full name on hover */}
              {kpiMapping.map(({ generic, real }) => (
                <th
                  key={generic}
                  className="text-right py-2 px-4 font-semibold text-[11px] text-foreground/70 uppercase tracking-[0.08em] whitespace-nowrap cursor-help"
                  title={real}
                >
                  {generic}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row: any, idx) => {
              const absIdx = startIdx + idx;

              const isOdd = absIdx % 2 === 1;
              const rowBg = isOdd ? '#FAFBFC' : '#FFFFFF';
              return (
                <tr
                  key={absIdx}
                  className="group transition-colors hover:bg-[#F0FAF8]"
                  style={{ borderBottom: `1px solid ${ROW_BORDER}`, backgroundColor: rowBg }}
                >
                  {/* Time */}
                  <td className="py-2 px-4 tabular-nums text-muted-foreground whitespace-nowrap text-[11.5px]">
                    {row.timestamp}
                  </td>

                  {/* Dimensions — first one is sticky/frozen */}
                  {dimensionCols.map((dim, i) => {
                    const value = dim.get(row);
                    const isFirst = i === 0;
                    return (
                      <td
                        key={dim.key}
                        className={cn(
                          'py-2 px-4 whitespace-nowrap',
                          isFirst
                            ? 'sticky left-0 z-10 group-hover:bg-[#F0FAF8] transition-colors'
                            : 'text-[11.5px] text-foreground/80',
                        )}
                        style={isFirst ? { backgroundColor: rowBg } : undefined}
                        title={value}
                      >
                        {isFirst ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: stableColorForSplit(value || '') }}
                            />
                            <span className="font-semibold text-foreground tracking-tight">{value}</span>
                          </span>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}

                  {/* Generic KPI values — lookup uses raw key, tooltip shows clean name */}
                  {kpiMapping.map(({ generic, real, raw }) => {
                    const val = row.kpiValues[raw];
                    const range = kpiRanges[raw];
                    let pct = 0;
                    if (val != null && isFinite(val) && range && range.max > range.min) {
                      pct = Math.max(4, Math.min(100, ((val - range.min) / (range.max - range.min)) * 100));
                    } else if (val != null && isFinite(val) && range && range.max === range.min && val !== 0) {
                      pct = 100;
                    }
                    return (
                      <td
                        key={generic}
                        className="py-2 px-4 whitespace-nowrap"
                        title={`${generic} = ${real}`}
                      >
                        <div className="flex items-center justify-end gap-3">
                          <div
                            className="relative h-1.5 w-20 rounded-full overflow-hidden"
                            style={{ backgroundColor: TRACK_GREY }}
                          >
                            {val != null && (
                              <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: BRAND_GREEN }}
                              />
                            )}
                          </div>
                          <span className="tabular-nums font-semibold text-foreground text-right min-w-[4rem] text-[12.5px]">
                            {fmtVal(val ?? null)}
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

      {/* Pagination — clean, right-aligned */}
      <div
        className="h-12 flex items-center justify-between px-6 bg-white"
        style={{ borderTop: `1px solid ${ROW_BORDER}` }}
      >
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>
            Showing <span className="font-semibold text-foreground">{startIdx + 1}–{endIdx}</span> of{' '}
            <span className="font-semibold text-foreground">{totalRows.toLocaleString()}</span>
          </span>
          <div className="relative">
            <button
              onClick={() => setShowPageSizeMenu(!showPageSizeMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[#F8F9FA] transition-colors"
              style={{ border: `1px solid ${ROW_BORDER}` }}
            >
              <span>Items per page: <span className="font-semibold text-foreground">{pageSize}</span></span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPageSizeMenu && (
              <div
                className="absolute bottom-full mb-1 left-0 bg-white rounded-md shadow-lg z-50 overflow-hidden"
                style={{ border: `1px solid ${ROW_BORDER}` }}
              >
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPageSize(s);
                      setCurrentPage(0);
                      setShowPageSizeMenu(false);
                    }}
                    className={cn(
                      'block w-full text-left px-4 py-1.5 text-[11px] hover:bg-[#F0FAF8] transition-colors',
                      s === pageSize && 'font-semibold',
                    )}
                    style={s === pageSize ? { color: BRAND_GREEN, backgroundColor: `${BRAND_GREEN}10` } : undefined}
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
            className="p-1.5 rounded-md hover:bg-[#F8F9FA] disabled:opacity-30 transition-colors"
            disabled={safePage === 0}
            onClick={() => { if (useBackend) setBackendPage(1); else setCurrentPage(0); }}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded-md hover:bg-[#F8F9FA] disabled:opacity-30 transition-colors"
            disabled={safePage === 0}
            onClick={() => { if (useBackend) setBackendPage(p => Math.max(1, p - 1)); else setCurrentPage((p) => Math.max(0, p - 1)); }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page chips around current */}
          <div className="flex items-center gap-1 px-1">
            {(() => {
              const chips: number[] = [];
              const window = 1;
              const start = Math.max(0, safePage - window);
              const end = Math.min(totalPages - 1, safePage + window);
              for (let i = start; i <= end; i++) chips.push(i);
              return chips.map((p) => (
                <button
                  key={p}
                  onClick={() => { if (useBackend) setBackendPage(p + 1); else setCurrentPage(p); }}
                  className={cn(
                    'min-w-[28px] h-7 px-2 rounded-md text-[11px] font-semibold transition-colors',
                    p === safePage ? 'text-white' : 'text-foreground hover:bg-[#F8F9FA]',
                  )}
                  style={p === safePage ? { backgroundColor: BRAND_GREEN } : undefined}
                >
                  {p + 1}
                </button>
              ));
            })()}
            <span className="text-[10px] text-muted-foreground ml-1">/ {totalPages}</span>
          </div>

          <button
            className="p-1.5 rounded-md hover:bg-[#F8F9FA] disabled:opacity-30 transition-colors"
            disabled={safePage >= totalPages - 1}
            onClick={() => { if (useBackend) setBackendPage(p => Math.min(totalPages, p + 1)); else setCurrentPage((p) => Math.min(totalPages - 1, p + 1)); }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded-md hover:bg-[#F8F9FA] disabled:opacity-30 transition-colors"
            disabled={safePage >= totalPages - 1}
            onClick={() => { if (useBackend) setBackendPage(totalPages); else setCurrentPage(totalPages - 1); }}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestigatorDataTable;
// wide-format table v1777073504
