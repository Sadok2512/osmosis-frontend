// ── KPI Monitor API Layer ────────────────────────────────────────────
import { useQuery, useMutation } from '@tanstack/react-query';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

// ── Types ──

export interface MonitorKpiCatalogEntry {
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  value_type: string;
  formula_type: string;
  default_chart_type: string;
  default_axis: 'left' | 'right';
  threshold_warning: number | null;
  threshold_critical: number | null;
  supported_levels: string[];
  supports_split: boolean;
  supports_table: boolean;
  source_column: string;
  source_table: string;
  is_active: boolean;
  is_normalized?: boolean;
  is_vendor_specific?: boolean;
  techno?: string;
  vendor?: string;
  dimension_type?: string | null;
  nom_bdd?: string;
  normalized_kpi_group?: string;
}

export interface MonitorFilterDef {
  dimension_key: string;
  display_name: string;
  multi_select: boolean;
  searchable: boolean;
  depends_on: string[];
  is_active: boolean;
}

export interface MonitorFilter {
  dimension: string;
  op: 'IN' | 'NOT_IN' | 'EQ';
  values: string[];
}

export interface TimeseriesSelection {
  kpi_key: string;
  visualization?: string;
  axis?: 'left' | 'right';
}

export interface TimeseriesRequest {
  date_from: string;
  date_to: string;
  granularity: string;
  filters: MonitorFilter[];
  selections: TimeseriesSelection[];
  split_by: string | null;
  top_n: number;
}

export interface TimeseriesPoint {
  ts: string;
  kpi_key: string;
  split_value: string;
  value: number;
}

export interface TimeseriesResponse {
  series: TimeseriesPoint[];
  meta: { granularity_applied: string; total_series: number };
}

export interface TableRequest {
  date_from: string;
  date_to: string;
  filters: MonitorFilter[];
  kpi_keys: string[];
  split_by: string | null;
  top_n?: number;
  page?: number;
  page_size?: number;
}

export interface TableRow {
  split_value: string;
  [kpiKey: string]: any;
}

export interface TableResponse {
  rows: TableRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface SummaryRequest {
  date_from: string;
  date_to: string;
  filters: MonitorFilter[];
  kpi_keys: string[];
}

export interface SummaryItem {
  kpi_key: string;
  display_name: string;
  unit: string;
  value: number | null;
  min: number | null;
  max: number | null;
  trend_pct: number | null;
  threshold_state: 'normal' | 'warning' | 'critical';
}

export interface ExplainResponse {
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  value_type: string;
  formula_type: string;
  source_table: string;
  source_column: string;
  supported_levels: string[];
  supports_split: boolean;
  supports_table: boolean;
  threshold_warning: number | null;
  threshold_critical: number | null;
  default_chart_type: string;
  default_axis: string;
}

// ── Fetch helpers ──
// Monitor endpoints → Parser :8000/api/v1/monitor/* (proxied to KPI Engine)

async function monitorGet<T>(path: string): Promise<T> {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[monitorGet] ${path} → ${res.status}`, body);
    throw new Error(`API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  // vps-proxy returns {unavailable: true, items: [], ...} when VPS is down
  if (data && typeof data === 'object' && data.unavailable) {
    console.warn(`[monitorGet] ${path} → VPS unavailable`);
    throw new Error(`VPS unavailable for ${path}`);
  }
  return data;
}

async function monitorPost<T>(path: string, body: any): Promise<T> {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data && typeof data === 'object' && data.unavailable) {
    console.warn(`[monitorPost] ${path} → VPS unavailable`);
    throw new Error(`VPS unavailable for ${path}`);
  }
  return data;
}

// ── API functions ──

export interface CounterCatalogEntry {
  counter_id: string;
  counter_name: string;
  family: string;
  techno: string;
  vendor: string;
  is_active: boolean;
}

export interface DateRangeResponse {
  min_date: string | null;
  max_date: string | null;
  day_count: number;
}

export interface FilterValuesResponse {
  dimension: string;
  values: string[];
}

export const fetchKpiCatalog = () => monitorGet<MonitorKpiCatalogEntry[]>('catalog/kpis');
export const fetchCounterCatalog = () => monitorGet<CounterCatalogEntry[]>('catalog/counters');
export const fetchFilterCatalog = () => monitorGet<MonitorFilterDef[]>('catalog/filters');
export const fetchDateRange = () => monitorGet<DateRangeResponse>('date-range');
export const fetchDimensionValues = (dimension: string) =>
  monitorGet<FilterValuesResponse>(`filters/values?dimension=${encodeURIComponent(dimension)}`);
export const fetchFilterValues = (dimensions: string[], filters?: MonitorFilter[]) =>
  monitorPost<Record<string, string[]>>('filters/values', { dimensions, filters });
export const fetchTimeseries = (req: TimeseriesRequest) =>
  monitorPost<TimeseriesResponse>('query/timeseries', req);
export const fetchTable = (req: TableRequest) =>
  monitorPost<TableResponse>('query/table', req);

// ── CSV full-data download helpers ──

export async function downloadTableCsv(req: TableRequest): Promise<void> {
  const url = getApiUrl('monitor/query/table/csv');
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kpi_table_${req.date_from}_${req.date_to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export async function downloadTimeseriesCsv(req: TimeseriesRequest): Promise<void> {
  const url = getApiUrl('monitor/query/timeseries/csv');
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kpi_timeseries_${req.date_from}_${req.date_to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
export const fetchSummary = (req: SummaryRequest) =>
  monitorPost<SummaryItem[]>('query/summary', req);
/**
 * Fetch KPI explain (formula + counters).
 * Tries the KPI Engine monitor endpoint first, then falls back to the Parser
 * endpoint when the monitor returns an empty/null formula. Some KPIs (e.g.
 * EN-DC_SETUP_SuccessSR) only have their definition in the parser catalog.
 */
export const fetchExplain = async (kpiKey: string): Promise<ExplainResponse> => {
  let monitorResp: any = null;
  try {
    monitorResp = await monitorGet<ExplainResponse>(`explain/kpi/${kpiKey}`);
    const hasFormula =
      monitorResp &&
      ((monitorResp.numerator && String(monitorResp.numerator).trim()) ||
        (monitorResp.denominator && String(monitorResp.denominator).trim()) ||
        (monitorResp.formula && String(monitorResp.formula).trim()) ||
        (Array.isArray(monitorResp.counters) && monitorResp.counters.length > 0));
    if (hasFormula) return monitorResp;
  } catch {
    /* fall through to parser */
  }

  // Fallback: parser /api/v1/pm/kpi/explain/<key>
  try {
    const url = getApiUrl(`pm/kpi/explain/${encodeURIComponent(kpiKey)}`);
    const res = await fetch(url, { headers: getApiHeaders() });
    if (res.ok) {
      const data: any = await res.json();
      if (data && !data.unavailable) {
        // Normalize parser shape into ExplainResponse-compatible object
        return {
          ...(monitorResp || {}),
          ...data,
          kpi_key: data.kpi_key || kpiKey,
          display_name: data.display_name || monitorResp?.display_name || kpiKey,
          numerator: data.numerator ?? monitorResp?.numerator ?? '',
          denominator: data.denominator ?? monitorResp?.denominator ?? '',
          formula_type: data.formula_type ?? monitorResp?.formula_type ?? '',
          unit: data.unit ?? monitorResp?.unit ?? '',
          counters: data.counters ?? monitorResp?.counters ?? [],
        } as ExplainResponse;
      }
    }
  } catch (e) {
    console.warn(`[fetchExplain] Parser fallback failed for ${kpiKey}:`, e);
  }

  // Return whatever monitor gave us (possibly empty) so UI shows something
  return (monitorResp || { kpi_key: kpiKey, display_name: kpiKey }) as ExplainResponse;
};

// ── React Query Hooks ──

export function useKpiCatalog() {
  return useQuery({
    queryKey: ['monitor', 'catalog', 'kpis'],
    queryFn: async () => {
      try {
        return await fetchKpiCatalog();
      } catch (err) {
        console.warn('[useKpiCatalog] Backend unavailable, returning empty:', err);
        return [] as MonitorKpiCatalogEntry[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCounterCatalog() {
  return useQuery({
    queryKey: ['monitor', 'catalog', 'counters'],
    queryFn: async () => {
      try {
        return await fetchCounterCatalog();
      } catch (err) {
        console.warn('[useCounterCatalog] Backend unavailable:', err);
        return [] as CounterCatalogEntry[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useFilterCatalog() {
  return useQuery({
    queryKey: ['monitor', 'catalog', 'filters'],
    queryFn: fetchFilterCatalog,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDateRange() {
  return useQuery({
    queryKey: ['monitor', 'date-range'],
    queryFn: async () => {
      try {
        return await fetchDateRange();
      } catch {
        return { min_date: null, max_date: null, day_count: 0 } as DateRangeResponse;
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useDimensionValues(dimension: string | null) {
  return useQuery({
    queryKey: ['monitor', 'dimension-values', dimension],
    queryFn: () => fetchDimensionValues(dimension!),
    enabled: !!dimension,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFilterValues(dimensions: string[], filters?: MonitorFilter[]) {
  return useQuery({
    queryKey: ['monitor', 'filterValues', dimensions, filters],
    queryFn: () => fetchFilterValues(dimensions, filters),
    enabled: dimensions.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTimeseriesQuery(req: TimeseriesRequest | null) {
  return useQuery({
    queryKey: ['monitor', 'timeseries', req],
    queryFn: async () => {
      try {
        return await fetchTimeseries(req!);
      } catch (err) {
        console.warn('[useTimeseriesQuery] Backend unavailable:', err);
        return { series: [], meta: { granularity_applied: req?.granularity || '1d', total_series: 0 } } as TimeseriesResponse;
      }
    },
    enabled: !!req && req.selections.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useTableQuery(req: TableRequest | null) {
  return useQuery({
    queryKey: ['monitor', 'table', req],
    queryFn: async () => {
      try {
        return await fetchTable(req!);
      } catch (err) {
        console.warn('[useTableQuery] Backend unavailable:', err);
        return { rows: [], total: 0, page: 1, page_size: 50 } as TableResponse;
      }
    },
    enabled: !!req && req.kpi_keys.length > 0,
    staleTime: 30 * 1000,
  });
}

export function useSummaryQuery(req: SummaryRequest | null) {
  return useQuery({
    queryKey: ['monitor', 'summary', req],
    queryFn: async () => {
      try {
        return await fetchSummary(req!);
      } catch (err) {
        console.warn('[useSummaryQuery] Backend unavailable:', err);
        return [] as SummaryItem[];
      }
    },
    enabled: !!req && req.kpi_keys.length > 0,
    staleTime: 30 * 1000,
  });
}

export function useKpiExplain(kpiKey: string | null) {
  return useQuery({
    queryKey: ['monitor', 'explain', kpiKey],
    queryFn: () => fetchExplain(kpiKey!),
    enabled: !!kpiKey,
    staleTime: 10 * 60 * 1000,
  });
}
