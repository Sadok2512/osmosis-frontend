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
// Monitor endpoints route through VPS proxy → KPI Engine (:8001)

async function monitorGet<T>(path: string): Promise<T> {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[monitorGet] ${path} → ${res.status}`, body);
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function monitorPost<T>(path: string, body: any): Promise<T> {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── API functions ──

export const fetchKpiCatalog = () => monitorGet<MonitorKpiCatalogEntry[]>('catalog/kpis');
export const fetchFilterCatalog = () => monitorGet<MonitorFilterDef[]>('catalog/filters');
export const fetchFilterValues = (dimensions: string[], filters?: MonitorFilter[]) =>
  monitorPost<Record<string, string[]>>('filters/values', { dimensions, filters });
export const fetchTimeseries = (req: TimeseriesRequest) =>
  monitorPost<TimeseriesResponse>('query/timeseries', req);
export const fetchTable = (req: TableRequest) =>
  monitorPost<TableResponse>('query/table', req);
export const fetchSummary = (req: SummaryRequest) =>
  monitorPost<SummaryItem[]>('query/summary', req);
export const fetchExplain = (kpiKey: string) =>
  monitorGet<ExplainResponse>(`explain/kpi/${kpiKey}`);

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

export function useFilterCatalog() {
  return useQuery({
    queryKey: ['monitor', 'catalog', 'filters'],
    queryFn: fetchFilterCatalog,
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
    queryFn: () => fetchTimeseries(req!),
    enabled: !!req && req.selections.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useTableQuery(req: TableRequest | null) {
  return useQuery({
    queryKey: ['monitor', 'table', req],
    queryFn: () => fetchTable(req!),
    enabled: !!req && req.kpi_keys.length > 0,
    staleTime: 30 * 1000,
  });
}

export function useSummaryQuery(req: SummaryRequest | null) {
  return useQuery({
    queryKey: ['monitor', 'summary', req],
    queryFn: () => fetchSummary(req!),
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
