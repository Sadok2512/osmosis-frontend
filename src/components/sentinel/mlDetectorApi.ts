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


// ─── Agentic engine (Phase 1: RCA) ─────────────────────────────────────
// Lives on :11003 behind /agentic-api/* — closed-loop layer over the
// :11000 LLM agents. Persists diagnostics to agentic.diagnostics.

export interface RcaDiagnostic {
  id: number;
  anomaly_id: number;
  agent_name: string;
  status: 'running' | 'completed' | 'failed';
  summary: string | null;
  suspected_cause: string | null;
  confidence: number | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

/** GET cached diagnostic (if any). Null on fresh anomalies. */
export async function getDiagnostic(anomalyId: number): Promise<RcaDiagnostic | null> {
  const url = getVpsProxyUrl('agentic', `/anomalies/${anomalyId}/diagnose`);
  const r = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!r.ok) throw new Error(`agentic /diagnose → ${r.status}`);
  const j = await r.json();
  return j.diagnostic;
}

/**
 * POST the diagnose trigger. Async-iterates text-delta chunks from the
 * SSE stream for typewriter rendering. Progress events (HTML comments)
 * are skipped — only visible markdown is yielded.
 */
export async function* streamDiagnose(
  anomalyId: number,
  opts: { force?: boolean } = {},
): AsyncGenerator<string> {
  const params: Record<string, string> = {};
  if (opts.force) params.force = 'true';
  const url = getVpsProxyUrl('agentic', `/anomalies/${anomalyId}/diagnose`, params);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
  });
  if (!resp.ok || !resp.body) throw new Error(`agentic POST /diagnose → ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data: ')) continue;
      const body = line.slice(6);
      if (body === '[DONE]') return;
      try {
        const j = JSON.parse(body);
        const delta: string = j?.choices?.[0]?.delta?.content || '';
        if (delta && !delta.startsWith('<!--')) yield delta;
      } catch { /* malformed frame */ }
    }
  }
}


// ─── Recommendations (Phase 2 — OPTIMUS) ──────────────────────────────

export interface Recommendation {
  id: number;
  diagnostic_id: number;
  cell_name: string;
  kpi_code: string;
  param_path: string | null;
  current_value: string | null;
  proposed_value: string | null;
  rationale: string | null;
  forecast_kpi_delta: number | null;
  peer_median: number | null;
  status: string;
  created_at: string | null;
}

export async function getRecommendation(diagnosticId: number): Promise<Recommendation | null> {
  const url = getVpsProxyUrl('agentic', `/diagnostics/${diagnosticId}/recommend`);
  const r = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!r.ok) throw new Error(`agentic GET /recommend → ${r.status}`);
  const j = await r.json();
  return j.recommendation;
}

/** Stream OPTIMUS reply. Same shape as streamDiagnose. */
export async function* streamRecommend(diagnosticId: number): AsyncGenerator<string> {
  const url = getVpsProxyUrl('agentic', `/diagnostics/${diagnosticId}/recommend`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
  });
  if (!resp.ok || !resp.body) throw new Error(`agentic POST /recommend → ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data: ')) continue;
      const body = line.slice(6);
      if (body === '[DONE]') return;
      try {
        const j = JSON.parse(body);
        const delta: string = j?.choices?.[0]?.delta?.content || '';
        if (delta && !delta.startsWith('<!--')) yield delta;
      } catch { /* malformed */ }
    }
  }
}

export async function listRecommendations(status?: string): Promise<{ recommendations: Recommendation[]; count: number }> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const url = getVpsProxyUrl('agentic', `/recommendations`, params);
  const r = await fetch(url, { headers: getVpsProxyHeaders() });
  if (!r.ok) throw new Error(`agentic /recommendations → ${r.status}`);
  return r.json();
}
