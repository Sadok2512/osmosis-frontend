import { VPS_ENDPOINTS, getApiHeaders } from '@/lib/apiConfig';
import type { DetectorPayload, DimensionOption, KpiOption } from './detectorBuilderTypes';

// ml-engine catalog endpoints live at :11002/api/v1/ml/*, exposed via the
// spa-proxy under /ml-api/* (apiConfig.VPS_ENDPOINTS.ml). All ODCC requests
// go straight there — bypass the kpi-engine fallback used elsewhere.
const ML_BASE = `${VPS_ENDPOINTS.ml}`;
function mlUrl(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${ML_BASE}/${clean}`;
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

async function getJson<T>(path: string): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, { headers: getApiHeaders() });
  if (!response.ok) throw new Error(`GET ${url} failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function sendJson<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, {
    method,
    headers: getApiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} failed (${response.status})`);
  return response.json() as Promise<T>;
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

export function normalizeKpis(raw: unknown): KpiOption[] {
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
  return items.length ? items : FALLBACK_KPIS;
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

export async function fetchDetectorKpis(): Promise<KpiOption[]> {
  try {
    return normalizeKpis(await getJson<unknown>('kpis'));
  } catch (error) {
    console.warn('[ODCC] KPI catalog unavailable, using fallback placeholders', error);
    return FALLBACK_KPIS;
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

export async function fetchDetectorHolidays(): Promise<string[]> {
  try {
    return normalizeValues(await getJson<unknown>('holidays'));
  } catch (error) {
    console.warn('[ODCC] Holiday API unavailable; holidays toggle remains as integration point', error);
    return [];
  }
}

export async function createDetectorPayload(payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>('detectors', 'POST', payload);
}

export async function updateDetectorPayload(detectorId: string, payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>(`detectors/${encodeURIComponent(detectorId)}`, 'PUT', payload);
}

export interface MlDetectorRow {
  id: number;
  name: string;
  kpi_table_id: number;
  kpi_codes: string[];
  dimensions: string[];
  delta_7_enabled: boolean;
  delta_14_enabled: boolean;
  trend_threshold: number;
  z_threshold: number;
  run_time: string;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  dimension_values: Record<string, string[]>;
  holidays_excluded: boolean;
  notes: string | null;
  extra_config: Record<string, unknown>;
}

export interface MlAnomalyRow {
  id: number;
  detector_id: number;
  period_start: string;
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
}

export interface MlRunResponse {
  queued: boolean;
  task_id: string;
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

export async function listDetectorPayloads(): Promise<{ items: MlDetectorRow[]; total: number }> {
  const raw = await getJson<{ items?: MlDetectorRow[]; total?: number; profiles?: MlDetectorRow[]; count?: number }>('detectors');
  return {
    items: raw.items ?? raw.profiles ?? [],
    total: raw.total ?? raw.count ?? 0,
  };
}

export async function createDetectorPayloadForBackend(payload: DetectorPayload, meta: DetectorSaveMeta): Promise<MlDetectorRow> {
  return sendJson<MlDetectorRow>('detectors', 'POST', toMlDetectorPayload(payload, meta));
}

export async function updateDetectorPayloadForBackend(detectorId: string | number, payload: DetectorPayload, meta: DetectorSaveMeta): Promise<MlDetectorRow> {
  return sendJson<MlDetectorRow>(`detectors/${encodeURIComponent(String(detectorId))}`, 'PUT', toMlDetectorPayload(payload, meta));
}

export async function deleteDetectorPayload(detectorId: string | number): Promise<unknown> {
  return sendJson<unknown>(`detectors/${encodeURIComponent(String(detectorId))}`, 'DELETE', {});
}

export async function runDetectorNow(detectorId: string | number): Promise<MlRunResponse> {
  return sendJson<MlRunResponse>(`detectors/${encodeURIComponent(String(detectorId))}/run-now`, 'POST', {});
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
  return getJson<{ items: MlAnomalyRow[]; total: number; page: number; pages: number; error?: string }>(`anomalies?${params.toString()}`);
}
