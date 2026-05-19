import { VPS_ENDPOINTS, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import type { DetectorPayload, DimensionOption, KpiOption } from './detectorBuilderTypes';

export interface KpiTableOption {
  id: number;
  table_name: string;
  label: string;
  granularity: string;
}

const FALLBACK_KPI_TABLES: KpiTableOption[] = [
  { id: 1, table_name: 'kpi_15m', label: '15 min', granularity: '15m' },
  { id: 5, table_name: 'kpi_1h',  label: '1 hour', granularity: '1h'  },
  { id: 2, table_name: 'kpi_1d',  label: '1 day',  granularity: '1d'  },
  { id: 6, table_name: 'kpi_1s',  label: '1W',     granularity: '1w'  },
  { id: 17, table_name: 'kpi_bh', label: 'BH',     granularity: 'bh'  },
];

// ml-engine catalog endpoints live at :11002/api/v1/ml/*. URL resolution
// depends on where the browser runs:
//   - On the VPS / *.qoebit.net : same-origin /ml-api (nginx → :11002)
//   - On Lovable preview / random host : Supabase edge function vps-proxy
// `getVpsProxyUrl('ml', ...)` already encodes that switch — keep one source
// of truth instead of poking VPS_ENDPOINTS.ml directly (which falls through
// to the SPA index.html in environments where no /ml-api proxy exists,
// the original cause of the "Backend ODCC error: ... 500" toasts).
function mlUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return getVpsProxyUrl('ml', clean);
}

function mlHeaders(): Record<string, string> {
  // When mlUrl picked the edge-function path the call needs the Supabase
  // apikey + Authorization. When mlUrl picked the direct path the header
  // is harmless (FastAPI ignores it). Detect the edge route by URL shape.
  return getVpsProxyHeaders(getApiHeaders());
}

interface MlUnavailableResponse {
  unavailable?: boolean;
  service?: string;
  error?: string;
}

function isUnavailableFallback(value: unknown): value is MlUnavailableResponse {
  return !!(value && typeof value === 'object'
    && (value as MlUnavailableResponse).unavailable === true);
}

const FALLBACK_KPIS: KpiOption[] = [
  { key: 'AVAILABILITY', label: 'AVAILABILITY' },
  { key: 'NEW_KPI', label: 'NEW_KPI' },
];

const FALLBACK_DIMENSIONS: DimensionOption[] = [
  { key: 'PLAQUE', label: 'Plaque', multiSelect: true, searchable: true },
  { key: 'SITE', label: 'Site', multiSelect: true, searchable: true },
  { key: 'CELL', label: 'Cell', multiSelect: true, searchable: true },
  { key: 'DOR', label: 'DOR', multiSelect: true, searchable: true },
  { key: 'ZONE_ARCEP', label: 'Zone ARCEP', multiSelect: true, searchable: true },
  { key: 'VENDOR', label: 'Vendor', multiSelect: true, searchable: true },
  { key: 'BAND', label: 'Band', multiSelect: true, searchable: true },
];

type JsonObject = Record<string, unknown>;

async function parseJsonSafe<T>(response: Response, url: string, method: string): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  // Backend sometimes returns an HTML error page (e.g. <!doctype html>) when
  // the route isn't deployed. Treat that as "no data" instead of crashing the
  // JSON parser so callers fall back to placeholders gracefully.
  if (!trimmed) return undefined as unknown as T;
  if (trimmed.startsWith('<')) {
    throw new Error(`${method} ${url} returned non-JSON (likely HTML error page)`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${method} ${url} returned malformed JSON`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, { headers: mlHeaders() });
  if (!response.ok) throw new Error(`GET ${url} failed (${response.status})`);
  const parsed = await parseJsonSafe<T>(response, url, 'GET');
  // vps-proxy returns 200 with { unavailable:true, error:'...' } when the
  // upstream service is down. Bubble that as a soft error so callers can
  // pick the empty-state fallback instead of leaking an error toast.
  if (isUnavailableFallback(parsed)) {
    throw new Error(`GET ${url} unavailable: ${parsed.error || 'upstream offline'}`);
  }
  return parsed;
}

async function sendJson<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, {
    method,
    headers: mlHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} failed (${response.status})`);
  const parsed = await parseJsonSafe<T>(response, url, method);
  if (isUnavailableFallback(parsed)) {
    throw new Error(`${method} ${url} unavailable: ${parsed.error || 'upstream offline'}`);
  }
  return parsed;
}

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const object = value as JsonObject;
    for (const key of ['items', 'kpis', 'data', 'results', 'dimensions', 'values', 'holidays']) {
      if (Array.isArray(object[key])) return object[key] as unknown[];
    }
  }
  return [];
};

export function normalizeKpis(raw: unknown, opts?: { allowFallback?: boolean }): KpiOption[] {
  const items = asArray(raw)
    .map((item): KpiOption | null => {
      if (typeof item === 'string') return { key: item, label: item };
      if (!item || typeof item !== 'object') return null;
      const object = item as JsonObject;
      const key = String(object.key ?? object.kpi_key ?? object.code ?? object.name ?? object.id ?? '').trim();
      if (!key) return null;
      return {
        key,
        label: String(object.label ?? object.display_name ?? object.name ?? key),
        unit: object.unit ? String(object.unit) : undefined,
      };
    })
    .filter((item): item is KpiOption => Boolean(item));
  if (items.length) return items;
  // Fallback placeholders only when the unfiltered catalog is empty (truly
  // unreachable backend). When the caller asked for a table-specific list
  // and the registry returned 0 rows, `[]` is the honest answer — surfacing
  // fake "AVAILABILITY" / "NEW_KPI" would misrepresent the data state.
  return opts?.allowFallback === false ? [] : FALLBACK_KPIS;
}

export function normalizeDimensions(raw: unknown): DimensionOption[] {
  const items = asArray(raw)
    .map((item): DimensionOption | null => {
      if (typeof item === 'string') return { key: item, label: item, multiSelect: true, searchable: true };
      if (!item || typeof item !== 'object') return null;
      const object = item as JsonObject;
      const key = String(object.key ?? object.dimension_key ?? object.code ?? object.name ?? object.id ?? '').trim();
      if (!key) return null;
      return {
        key,
        label: String(object.label ?? object.display_name ?? object.name ?? key),
        multiSelect: object.multiSelect === undefined ? true : Boolean(object.multiSelect),
        searchable: object.searchable === undefined ? true : Boolean(object.searchable),
      };
    })
    .filter((item): item is DimensionOption => Boolean(item));
  return items.length ? items : FALLBACK_DIMENSIONS;
}

export function normalizeValues(raw: unknown): string[] {
  return asArray(raw)
    .map(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (!item || typeof item !== 'object') return '';
      const object = item as JsonObject;
      return String(object.value ?? object.code ?? object.name ?? object.label ?? '').trim();
    })
    .filter(Boolean);
}

export async function fetchKpiTables(): Promise<KpiTableOption[]> {
  try {
    const raw = await getJson<{ items?: KpiTableOption[] }>('kpi-tables');
    const items = Array.isArray(raw.items) ? raw.items : [];
    return items.length ? items : FALLBACK_KPI_TABLES;
  } catch (error) {
    console.warn('[ODCC] KPI table catalog unavailable, using fallback placeholders', error);
    return FALLBACK_KPI_TABLES;
  }
}

export async function fetchDetectorKpis(table?: string): Promise<KpiOption[]> {
  const path = table ? `kpis?table=${encodeURIComponent(table)}` : 'kpis';
  try {
    // For table-filtered requests, an empty backend response is truthful
    // (no KPIs precomputed in that table). Disable the fake-placeholder
    // fallback so the UI can render an honest empty state.
    return normalizeKpis(await getJson<unknown>(path), { allowFallback: !table });
  } catch (error) {
    console.warn('[ODCC] KPI catalog unavailable, using fallback placeholders', error);
    return table ? [] : FALLBACK_KPIS;
  }
}

export async function fetchDetectorDimensions(): Promise<DimensionOption[]> {
  try {
    return normalizeDimensions(await getJson<unknown>('dimensions'));
  } catch (error) {
    console.warn('[ODCC] Dimension catalog unavailable, using fallback placeholders', error);
    return FALLBACK_DIMENSIONS;
  }
}

export async function fetchDetectorDimensionValues(dimension: string): Promise<string[]> {
  if (!dimension) return [];
  try {
    return normalizeValues(await getJson<unknown>(`dimensions/${encodeURIComponent(dimension)}/values`));
  } catch (error) {
    console.warn(`[ODCC] Values unavailable for ${dimension}`, error);
    return [];
  }
}

export interface ScopeCounts {
  sites: number;
  cells: number;
  filters_applied: number;
}

export async function fetchScopeCounts(
  filters: Array<{ dimension: string; values: string[] }>,
): Promise<ScopeCounts | null> {
  // Skip the call entirely when nothing's narrowed — empty-set count is a
  // full-table scan (slow) and the UX doesn't need the "all network" total.
  const nonEmpty = filters.filter(f => f.dimension && f.values && f.values.length > 0);
  if (nonEmpty.length === 0) return null;
  try {
    return await sendJson<ScopeCounts>('scope-counts', 'POST', { filters: nonEmpty });
  } catch (error) {
    console.warn('[ODCC] Scope counts unavailable', error);
    return null;
  }
}

export async function fetchDetectorHolidays(): Promise<string[]> {
  try {
    return normalizeValues(await getJson<unknown>('holidays'));
  } catch (error) {
    console.warn('[ODCC] Holiday API unavailable; holidays toggle remains as integration point', error);
    return [];
  }
}

// Backend ml-engine — renamed /profiles → /detectors on 2026-05-19
// (single owner: ml-engine/api/detectors.py). Response envelope is
// { detectors: [...], total, page, limit } with ne_count + last_fired_at
// + scope_level surfaced in each row.
const DETECTORS_PATH = 'detectors';

export async function createDetectorPayload(payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>(DETECTORS_PATH, 'POST', payload);
}

export async function updateDetectorPayload(detectorId: string, payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>(`${DETECTORS_PATH}/${encodeURIComponent(detectorId)}`, 'PUT', payload);
}

export interface MlDetectorRow {
  id: number;
  name: string;
  is_active: boolean;
  /** Renamed contract (2026-05-19): added on the LIST payload. */
  scope_level: string | null;
  kpi_table_id?: number;
  kpi_table?: { table_id: number; table_name: string; level: string; period: string } | null;
  kpi_codes?: string[];
  dimensions?: string[];
  /** LIST payload returns the counts directly so the table doesn't
   *  need to render-and-count from the full arrays. */
  kpi_count?: number;
  dimension_count?: number;
  /** Materialized column refreshed on detector create/update — # cells
   *  matched by the scope filter (NULL if topo unavailable, render "—"). */
  ne_count: number | null;
  /** MAX(detected_at) from kpi.ml_anomalies for this detector. NULL when
   *  the detector has never fired — render "—" in the UI. */
  last_fired_at: string | null;
  last_run_at: string | null;
  /** "running" while a Celery task holds the running-key in Redis, else "idle". */
  running_status?: 'running' | 'idle';
  created_at: string | null;
  updated_at: string | null;
  /** DETAIL-only fields — present on GET /detectors/{id}, absent on LIST. */
  delta_7_enabled?: boolean;
  delta_14_enabled?: boolean;
  trend_threshold?: number;
  z_threshold?: number;
  run_time?: string;
  retention_days?: number;
  dimension_values?: Record<string, string[]>;
  holidays_excluded?: boolean;
  notes?: string | null;
  extra_config?: Record<string, unknown>;
}

export interface MlAnomalyRow {
  id: number;
  detector_id: number;
  run_id?: number | null;
  period_start: string;
  scope_level?: string | null;
  cell_name: string | null;
  kpi_code: string;
  dimension_key: string | null;
  value: number | null;
  delta_7: number | null;
  delta_14: number | null;
  z_score: number | null;
  trend_pct: number | null;
  severity: string;
  detected_at: string;
  /** Backend-computed honest score (Mary's formula, NULL when ingredients
   *  missing). Labelled "Force du signal" in UI — never "Confidence". */
  evidence_score?: number | null;
  detection_method?: 'criteria' | 'zscore' | 'legacy' | null;
  /** Persistent acknowledgment status from kpi.v_ml_anomaly_current_status. */
  ack_status?: 'open' | 'acknowledged' | 'resolved' | 'ignored' | 'reopened' | null;
  ack_user?: string | null;
  ack_at?: string | null;
}

export type AnomalyAckStatus = 'acknowledged' | 'resolved' | 'ignored' | 'reopened';

export async function setAnomalyStatus(
  anomalyId: number | string,
  status: AnomalyAckStatus,
  opts?: { userEmail?: string; notes?: string },
): Promise<{ anomaly_id: number; status: string; user: string | null; at: string | null }> {
  return sendJson(`anomalies/${encodeURIComponent(String(anomalyId))}/ack`, 'POST', {
    status,
    user_email: opts?.userEmail,
    notes:      opts?.notes,
  });
}

export interface MlRunProgress {
  id: number;
  detector_id: number;
  task_id: string | null;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress_pct: number;
  current_step: string | null;
  total_cells: number | null;
  processed_cells: number;
  anomalies_count: number;
  started_at: string | null;
  finished_at: string | null;
  error_text: string | null;
}

export async function getRunProgress(runId: number): Promise<MlRunProgress> {
  return getJson<MlRunProgress>(`profiles/runs/${runId}/progress`);
}

export async function stopDetectorRun(detectorId: number | string, taskId: string): Promise<unknown> {
  return sendJson(
    `profiles/${encodeURIComponent(String(detectorId))}/stop?task_id=${encodeURIComponent(taskId)}`,
    'POST',
    {},
  );
}

export interface MlRunResponse {
  queued: boolean;
  task_id: string;
  /** New 2026-05-13 — run row id from kpi.ml_detector_runs, used for
   *  GET /profiles/runs/{run_id}/progress polling and Stop. */
  run_id?: number;
  detector_id?: number;
  profile_id?: number;
}

export interface DetectorSaveMeta {
  id?: string | number;
  name: string;
  description?: string;
  enabled: boolean;
  scheduleFrequency?: string;
  scopeLevel?: string;
  detectionMode?: string;
  lookbackWindow?: string;
  retentionDays?: number;
}

export function toMlDetectorPayload(payload: DetectorPayload, meta: DetectorSaveMeta): Record<string, unknown> {
  const kpiCodes = payload.criteria.conditions
    .filter(condition => condition.type === 'kpi' && condition.field)
    .map(condition => condition.field);
  const criteriaDimensions = payload.criteria.conditions
    .filter(condition => condition.type === 'dimension' && condition.field)
    .map(condition => condition.field);
  const scopeDimensions = payload.scopeFilters.map(filter => filter.dimension).filter(Boolean);
  const dimensions = Array.from(new Set([...scopeDimensions, ...criteriaDimensions]));
  const dimensionValues = payload.scopeFilters.reduce<Record<string, string[]>>((acc, filter) => {
    if (filter.dimension) acc[filter.dimension] = filter.values;
    return acc;
  }, {});

  return {
    name: meta.name,
    kpi_table_id: payload.kpiTableId ?? 1,
    kpi_codes: Array.from(new Set(kpiCodes)),
    dimensions,
    dimension_values: dimensionValues,
    delta_7_enabled: true,
    delta_14_enabled: true,
    trend_threshold: 5,
    z_threshold: 2,
    run_time: meta.scheduleFrequency === 'daily' ? '02:00' : '00:00',
    retention_days: meta.retentionDays ?? 90,
    is_active: meta.enabled,
    holidays_excluded: payload.time.excludeHolidays,
    notes: meta.description || null,
    extra_config: {
      odcc_payload: payload,
      description: meta.description || '',
      schedule_frequency: meta.scheduleFrequency || null,
      scope_level: meta.scopeLevel || null,
      detection_mode: meta.detectionMode || null,
      lookback_window: meta.lookbackWindow || null,
      time: payload.time,
      criteria: payload.criteria,
    },
  };
}

// Soft-fail patterns: 4xx/5xx HTTP, non-JSON responses, or the
// vps-proxy "unavailable" envelope. Anything matching = render empty state.
const SOFT_FAIL_RE = /non-JSON|malformed JSON|unavailable|failed \(4\d\d\)|failed \(5\d\d\)/;

export async function listDetectorPayloads(): Promise<{ items: MlDetectorRow[]; total: number; error?: string }> {
  try {
    // Post-rename envelope: { detectors, total, page, limit }. Tolerate
    // the legacy { profiles | items } shapes during transition deploys.
    const raw = await getJson<{ detectors?: MlDetectorRow[]; profiles?: MlDetectorRow[]; items?: MlDetectorRow[]; total?: number; count?: number }>(DETECTORS_PATH);
    return {
      items: raw.detectors ?? raw.profiles ?? raw.items ?? [],
      total: raw.total ?? raw.count ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (SOFT_FAIL_RE.test(message)) {
      console.warn('[odcc] listDetectorPayloads fallback:', message);
      return { items: [], total: 0, error: 'backend_unavailable' };
    }
    throw err;
  }
}

export async function createDetectorPayloadForBackend(payload: DetectorPayload, meta: DetectorSaveMeta): Promise<MlDetectorRow> {
  return sendJson<MlDetectorRow>(DETECTORS_PATH, 'POST', toMlDetectorPayload(payload, meta));
}

export async function updateDetectorPayloadForBackend(detectorId: string | number, payload: DetectorPayload, meta: DetectorSaveMeta): Promise<MlDetectorRow> {
  return sendJson<MlDetectorRow>(`${DETECTORS_PATH}/${encodeURIComponent(String(detectorId))}`, 'PUT', toMlDetectorPayload(payload, meta));
}

export async function deleteDetectorPayload(detectorId: string | number): Promise<unknown> {
  return sendJson<unknown>(`${DETECTORS_PATH}/${encodeURIComponent(String(detectorId))}`, 'DELETE', {});
}

export async function runDetectorNow(detectorId: string | number): Promise<MlRunResponse> {
  return sendJson<MlRunResponse>(`${DETECTORS_PATH}/${encodeURIComponent(String(detectorId))}/run-now`, 'POST', {});
}

export async function listDetectorAnomalies(opts: {
  detectorId?: string | number;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: MlAnomalyRow[]; total: number; page: number; pages: number; error?: string }> {
  const params = new URLSearchParams();
  if (opts.detectorId !== undefined) params.set('profile_id', String(opts.detectorId));
  if (opts.severity) params.set('severity', opts.severity);
  if (opts.dateFrom) params.set('date_from', opts.dateFrom);
  if (opts.dateTo) params.set('date_to', opts.dateTo);
  params.set('page', String(opts.page ?? 1));
  params.set('limit', String(opts.limit ?? 100));
  const page = opts.page ?? 1;
  try {
    return await getJson<{ items: MlAnomalyRow[]; total: number; page: number; pages: number; error?: string }>(`anomalies?${params.toString()}`);
  } catch (err) {
    // Soft fail on transport / proxy / migration gaps so the console
    // renders an empty state instead of crashing with a red toast.
    const message = err instanceof Error ? err.message : String(err);
    if (SOFT_FAIL_RE.test(message)) {
      console.warn('[odcc] listDetectorAnomalies fallback:', message);
      return { items: [], total: 0, page, pages: 0, error: 'backend_unavailable' };
    }
    throw err;
  }
}
