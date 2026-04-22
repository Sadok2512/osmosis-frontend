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
  meta?: { error?: string; info?: string };
  info?: string;
  source_tables?: Record<string, string>;
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
  display_name?: string;
  family: string;
  techno: string;
  vendor: string;
  is_active: boolean;
  dimension_type?: string;
  is_in_kpi?: boolean;
  kpi_usage_count?: number;
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

export interface CatalogFiltersResponse {
  families: string[];
  technos: string[];
  vendors: string[];
  units: string[];
}

export const fetchKpiCatalog = () => monitorGet<MonitorKpiCatalogEntry[]>('catalog/kpis');
export const fetchCounterCatalog = () => monitorGet<CounterCatalogEntry[]>('catalog/counters');
export const fetchFilterCatalog = () => monitorGet<MonitorFilterDef[]>('catalog/filters');
export async function fetchCatalogFilterOptions(): Promise<CatalogFiltersResponse> {
  // Routes directly to KPI Engine :8001/catalog/filters (not /monitor/catalog/filters)
  const url = getApiUrl('catalog/filters');
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}
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

const EMPTY_CATALOG_FILTERS: CatalogFiltersResponse = { families: [], technos: [], vendors: [], units: [] };

export function useCatalogFilters() {
  return useQuery({
    queryKey: ['catalog', 'filter-options'],
    queryFn: async () => {
      try {
        return await fetchCatalogFilterOptions();
      } catch (err) {
        console.warn('[useCatalogFilters] Backend unavailable:', err);
        return EMPTY_CATALOG_FILTERS;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
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

// Keep one toast per error message per ~10s to avoid spam.
const _lastToastAt = new Map<string, number>();
function _toastBackendError(scope: string, err: unknown) {
  try {
    const msg = (err as any)?.message || String(err);
    const k = `${scope}:${msg}`;
    const now = Date.now();
    const prev = _lastToastAt.get(k) || 0;
    if (now - prev < 10_000) return;
    _lastToastAt.set(k, now);
    // Lazy import to avoid coupling this API module to UI at load time.
    import('sonner').then(({ toast }) => {
      toast.error(`Backend error (${scope})`, {
        description: msg.length > 200 ? msg.slice(0, 200) + '…' : msg,
      });
    }).catch(() => { /* noop */ });
  } catch { /* noop */ }
}

/** Transient ClickHouse errors that should be retried with backoff. */
const TRANSIENT_BACKEND_ERRORS = [
  'Simultaneous queries on single connection detected',
  'Unexpected EOF while reading bytes',
  'connection reset',
  'BOOT_ERROR',
  // ClickHouse native protocol drops the socket under concurrent load.
  // Surfaces as either the ClickHouse "Code: 210" message or the raw
  // Python OSError("[Errno 9] Bad file descriptor").
  'Bad file descriptor',
  'Code: 210',
  'Errno 9',
  'Broken pipe',
  'ECONNRESET',
  'EPIPE',
  // Cloudflare / VPS proxy hiccups
  '502',
  '503',
  '504',
  'Bad Gateway',
  'Gateway Timeout',
  'Service Unavailable',
];

function isTransientBackendError(msg: unknown): boolean {
  if (!msg || typeof msg !== 'string') return false;
  return TRANSIENT_BACKEND_ERRORS.some((needle) => msg.includes(needle));
}

/** Sleep helper used to add jitter between retries. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tiny client-side concurrency limiter for /query/timeseries calls.
 * The backend ClickHouse driver crashes under heavy parallelism
 * ("Simultaneous queries on single connection", "Bad file descriptor").
 * We cap to MAX_PARALLEL in-flight requests and stagger releases with a
 * small jitter so dashboards with 10+ widgets don't blast the backend
 * all at once on "Apply to Dashboard".
 */
const MAX_PARALLEL_TIMESERIES = 2;
let _inFlight = 0;
const _waiters: Array<() => void> = [];

async function _acquireSlot(): Promise<void> {
  if (_inFlight < MAX_PARALLEL_TIMESERIES) {
    _inFlight++;
    return;
  }
  await new Promise<void>((resolve) => _waiters.push(resolve));
  _inFlight++;
}

function _releaseSlot(): void {
  _inFlight = Math.max(0, _inFlight - 1);
  const next = _waiters.shift();
  if (next) {
    // Stagger release with a tiny jitter to avoid two queries firing on
    // the exact same tick (which is what triggers the ClickHouse race).
    setTimeout(next, 60 + Math.floor(Math.random() * 90));
  }
}

export function useTimeseriesQuery(req: (TimeseriesRequest & { _rev?: number }) | null) {
  // Stable key: serialize the request so identical payloads don't refetch
  // on every render (e.g., after a widget resize / drag / unrelated state change).
  // Callers can include a `_rev` cache-buster to force a refetch on demand
  // (e.g., when the user clicks "Apply" with unchanged toolbar values).
  const key = req ? JSON.stringify(req) : 'noop';
  return useQuery({
    queryKey: ['monitor', 'timeseries', key],
    queryFn: async () => {
      // Strip the cache-buster before sending to the backend.
      const { _rev, ...payload } = req!;

      // CRITICAL: ClickHouse can return 200 OK with `{series:[], error:'...'}`
      // when widgets fire in parallel ("Simultaneous queries on single connection
      // detected", "Code: 210. Bad file descriptor", "[Errno 9]") or when the
      // connection drops mid-stream ("Unexpected EOF"). We treat those as
      // transient and retry up to 5 times with exponential backoff + jitter
      // so that "Apply to Dashboard" actually populates every widget — even
      // when 10+ charts hit the backend at once.
      const MAX_ATTEMPTS = 5;
      let lastResp: TimeseriesResponse | null = null;

      // Acquire a concurrency slot BEFORE we start (and release it after the
      // last attempt) so multiple widgets serialize themselves on the client.
      await _acquireSlot();
      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            const resp = await fetchTimeseries(payload as TimeseriesRequest);
            const respErr = (resp as any)?.error ?? (resp as any)?.meta?.error;
            if (respErr && isTransientBackendError(respErr)) {
              lastResp = resp;
              // Backoff: 500ms, 1s, 2s, 4s, then give up. Jitter avoids waves.
              const wait = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
              console.warn(`[useTimeseriesQuery] Transient backend error (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${respErr} — retrying in ${wait}ms`);
              await sleep(wait);
              continue;
            }
            // Normalize: copy top-level `error` into `meta.error` so widgets
            // can render it consistently.
            if (respErr && !(resp as any)?.meta?.error) {
              (resp as any).meta = { ...(resp as any).meta, error: respErr };
            }
            return resp;
          } catch (err) {
            const msg = (err as any)?.message || String(err);
            if (isTransientBackendError(msg) && attempt < MAX_ATTEMPTS - 1) {
              const wait = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
              console.warn(`[useTimeseriesQuery] Transient throw (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${msg} — retrying in ${wait}ms`);
              await sleep(wait);
              continue;
            }
            // Surface the real backend error in meta.error so widgets can
            // distinguish "no data for this perimeter" from "backend failed".
            console.warn('[useTimeseriesQuery] Backend error:', err);
            _toastBackendError('timeseries', err);
            return {
              series: [],
              meta: {
                granularity_applied: req?.granularity || '1d',
                total_series: 0,
                error: msg,
              },
            } as unknown as TimeseriesResponse;
          }
        }
        // All retries exhausted — return the last (errored) response so the
        // widget can show a meaningful message instead of looking "empty".
        return lastResp ?? ({
          series: [],
          meta: {
            granularity_applied: req?.granularity || '1d',
            total_series: 0,
            error: 'Backend transient error after retries',
          },
        } as unknown as TimeseriesResponse);
      } finally {
        _releaseSlot();
      }
    },
    enabled: !!req && req.selections.length > 0,
    staleTime: 5 * 60 * 1000,        // 5 min — avoid silent refetches
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function useTableQuery(req: TableRequest | null) {
  // Stable key: serialize the request so identical payloads don't refetch
  // on every render (e.g., after a widget resize / drag / unrelated state change).
  const key = req ? JSON.stringify(req) : 'noop';
  return useQuery({
    queryKey: ['monitor', 'table', key],
    queryFn: async () => {
      try {
        // Strip UI-only fields (_rev, _ignoredCounters, _unknownKpis) before POST.
        const { _rev, _ignoredCounters, _unknownKpis, ...payload } =
          req! as TableRequest & { _rev?: number; _ignoredCounters?: string[]; _unknownKpis?: string[] };
        return await fetchTable(payload as TableRequest);
      } catch (err) {
        console.warn('[useTableQuery] Backend error:', err);
        _toastBackendError('table', err);
        // Attach error in a non-typed `meta` field so callers can detect it.
        return {
          rows: [],
          total: 0,
          page: 1,
          page_size: 50,
          meta: { error: (err as any)?.message || String(err) },
        } as unknown as TableResponse;
      }
    },
    enabled: !!req && req.kpi_keys.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
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
