// API client for ml-engine (port 11002 on Back100, proxied at /ml-api).
// Mirrors the AI Agent / Sentinel API patterns: thin wrapper, no caching.
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

export interface MlProfile {
  id: number;
  name: string;
  kpi_table_id: number;
  kpi_table?: { table_id: number; level: string; period: string; table_name: string } | null;
  kpi_codes: string[];
  dimensions: string[];
  kpi_count: number;
  dimension_count: number;
  delta_7_enabled: boolean;
  delta_14_enabled: boolean;
  trend_threshold: number;
  z_threshold: number;
  run_time: string;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
}

export interface MlAnomaly {
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

export interface AnomaliesResponse {
  items: MlAnomaly[];
  total: number;
  page: number;
  pages: number;
  error?: string;
}

export interface RunNowResponse {
  queued: boolean;
  task_id: string;
  profile_id: number;
}


async function _get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = getVpsProxyUrl('ml', path, params);
  try {
    const r = await fetch(url, { headers: getVpsProxyHeaders() });
    if (!r.ok) {
      console.warn(`[ml-engine] ${path} → ${r.status} (returning empty fallback)`);
      return {} as T;
    }
    return r.json() as Promise<T>;
  } catch (e) {
    console.warn(`[ml-engine] ${path} unreachable:`, e);
    return {} as T;
  }
}

async function _post<T>(path: string): Promise<T> {
  const url = getVpsProxyUrl('ml', path);
  try {
    const r = await fetch(url, { method: 'POST', headers: getVpsProxyHeaders() });
    if (!r.ok) {
      console.warn(`[ml-engine] POST ${path} → ${r.status}`);
      return {} as T;
    }
    return r.json() as Promise<T>;
  } catch (e) {
    console.warn(`[ml-engine] POST ${path} unreachable:`, e);
    return {} as T;
  }
}


export async function listProfiles(): Promise<{ profiles: MlProfile[]; count: number }> {
  const r = await _get<{ profiles?: MlProfile[]; count?: number }>('/profiles');
  return { profiles: r?.profiles ?? [], count: r?.count ?? 0 };
}

export async function listAnomalies(opts: {
  profile_id?: number;
  severity?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
} = {}): Promise<AnomaliesResponse> {
  const params: Record<string, string> = {};
  if (opts.profile_id !== undefined) params.profile_id = String(opts.profile_id);
  if (opts.severity) params.severity = opts.severity;
  if (opts.date_from) params.date_from = opts.date_from;
  if (opts.date_to) params.date_to = opts.date_to;
  if (opts.page) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  const r = await _get<Partial<AnomaliesResponse>>('/anomalies', params);
  return {
    items: r?.items ?? [],
    total: r?.total ?? 0,
    page: r?.page ?? (opts.page ?? 1),
    pages: r?.pages ?? 0,
    error: r?.error,
  };
}

export async function runProfileNow(profileId: number): Promise<RunNowResponse> {
  return _post<RunNowResponse>(`/profiles/${profileId}/run-now`);
}
