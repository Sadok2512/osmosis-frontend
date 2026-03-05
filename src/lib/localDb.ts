/**
 * Local database client — tries local Express first, falls back to Supabase Cloud.
 * Every component should import from here instead of supabase client.
 */

import { supabase } from '@/integrations/supabase/client';
import { getPreferredDataSource } from './apiConfig';

const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://localhost:3001';

function url(path: string) {
  return `${LOCAL_API}/api/${path.replace(/^\/?(api\/)?/, '')}`;
}

/** Detect if we should use local or cloud */
function useLocal(): boolean {
  return getPreferredDataSource() === 'local';
}

async function get<T = any>(path: string): Promise<T> {
  const resp = await fetch(url(path));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fetchWithSignal<T = any>(path: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(url(path), { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function post<T = any>(path: string, body: any): Promise<T> {
  const resp = await fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function del<T = any>(path: string): Promise<T> {
  const resp = await fetch(url(path), { method: 'DELETE' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function put<T = any>(path: string, body: any): Promise<T> {
  const resp = await fetch(url(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─── Dashboards (with Cloud fallback) ───
export const dashboardsApi = {
  list: async (): Promise<any[]> => {
    if (useLocal()) {
      return get<any[]>('dashboards');
    }
    // Cloud fallback: use Supabase dashboards table
    const { data, error } = await supabase
      .from('dashboards')
      .select('*')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  upsert: async (dashboard: { id: string; name: string; description?: string; widgets: any; is_shared?: boolean }) => {
    if (useLocal()) {
      return post('dashboards', dashboard);
    }
    const { data, error } = await supabase
      .from('dashboards')
      .upsert({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description || '',
        widgets: dashboard.widgets,
        is_shared: dashboard.is_shared ?? true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  update: async (id: string, updates: Record<string, any>) => {
    if (useLocal()) {
      return put(`dashboards/${id}`, updates);
    }
    const { data, error } = await supabase
      .from('dashboards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  remove: async (id: string) => {
    if (useLocal()) {
      return del(`dashboards/${id}`);
    }
    // Soft delete
    const { error } = await supabase
      .from('dashboards')
      .update({ is_archived: true })
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  },
};

// ─── Map Views ───
export const mapViewsApi = {
  list: () => get<any[]>('map-views'),
  create: (view: { name: string; settings: any; description?: string }) =>
    post('map-views', view),
  update: (id: string, updates: Record<string, any>) =>
    put(`map-views/${id}`, updates),
  remove: (id: string) => del(`map-views/${id}`),
};

// ─── Topo ───
export interface BboxSiteDTO {
  code_nidt: string;
  nom_site: string;
  lat: number;
  lng: number;
  nb_cells: number;
  vendor: string | null;
  plaque: string | null;
  dor: string | null;
  region: string | null;
}

export interface BboxSitesResponse {
  sites: BboxSiteDTO[];
  total: number;
}

export interface BboxCellsResponse {
  cells: any[];
  total: number;
}

export interface BboxFilters {
  dor?: string;
  vendor?: string;
  plaque?: string;
  techno?: string;
  bande?: string;
  zone_arcep?: string;
  q?: string;
}

export const topoApi = {
  list: (limit = 100000, offset = 0) =>
    get<{ rows: any[]; total: number }>(`topo?limit=${limit}&offset=${offset}`),
  listFull: (limit = 100000) =>
    get<{ rows: any[]; total: number }>(`topo?limit=${limit}&full=1`),
  count: async () => {
    const res = await get<{ rows: any[]; total: number }>('topo?limit=1');
    return res.total;
  },
  remove: () => post('topo/clear', {}),

  /** Fetch aggregated sites within a bounding box */
  listSitesByBbox: (
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    filters?: BboxFilters,
    limit = 8000,
    signal?: AbortSignal,
  ): Promise<BboxSitesResponse> => {
    const qs = new URLSearchParams();
    qs.set('bbox', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    qs.set('limit', String(limit));
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'ALL') qs.set(k, v);
      });
    }
    return fetchWithSignal<BboxSitesResponse>(`topo/sites?${qs}`, signal);
  },

  /** Fetch cell-level rows within a bounding box (for sector rendering) */
  listCellsByBbox: (
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    filters?: BboxFilters,
    limit = 8000,
    signal?: AbortSignal,
  ): Promise<BboxCellsResponse> => {
    const qs = new URLSearchParams();
    qs.set('bbox', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    qs.set('limit', String(limit));
    qs.set('include_cells', '1');
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'ALL') qs.set(k, v);
      });
    }
    return fetchWithSignal<BboxCellsResponse>(`topo/sites?${qs}`, signal);
  },
};

// ─── QoE Metrics ───
export const qoeMetricsApi = {
  query: (params: { site_id?: string; cell_ids?: string[]; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.site_id) qs.set('site_id', params.site_id);
    if (params.cell_ids?.length) qs.set('cell_ids', params.cell_ids.join(','));
    if (params.limit) qs.set('limit', String(params.limit));
    return get<any[]>(`qoe-metrics?${qs}`);
  },
};

// ─── RAG ───
export const ragApi = {
  list: () => post<{ files: any[] }>('rag-embed', { action: 'list' }),
  index: (filename: string, content?: string, base64?: string) =>
    post('rag-embed', base64 ? { filename, base64 } : { filename, content }),
  remove: (filename: string) =>
    post('rag-embed', { action: 'delete', filename }),
};

// ─── Dump Parameter ───
export const dumpParameterApi = {
  distinct: (col: string, extra?: Record<string, string>) => {
    const qs = new URLSearchParams({ distinct_col: col, ...extra });
    return get<any[]>(`dump-parameter?${qs}`);
  },
  query: (filters: Record<string, string>, cols?: string, limit = 100000) => {
    const qs = new URLSearchParams({ limit: String(limit), ...filters });
    if (cols) qs.set('select', cols);
    return get<any[]>(`dump-parameter?${qs}`);
  },
  aggregate: (filters: Record<string, string>, groupBy: string, colorBy: string) => {
    const qs = new URLSearchParams({ group_by: groupBy, color_by: colorBy, ...filters });
    return get<any[]>(`dump-parameter/aggregate?${qs}`);
  },
};

// ─── Parameter Changes ───
export const parameterChangesApi = {
  list: (filters?: { site_name?: string; param_name?: string; change_type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (filters?.site_name) qs.set('site_name', filters.site_name);
    if (filters?.param_name) qs.set('param_name', filters.param_name);
    if (filters?.change_type) qs.set('change_type', filters.change_type);
    if (filters?.limit) qs.set('limit', String(filters.limit));
    return get<any[]>(`parameter-changes?${qs}`);
  },
  create: (change: Record<string, any>) => post<any>('parameter-changes', change),
};

// ─── BI Query (always local — uses qoe_metric on local PostgreSQL, no Cloud fallback) ───
export const biQueryApi = {
  query: (params: {
    kpis: string[];
    aggregation?: string;
    dateStart?: string;
    dateEnd?: string;
    granularity?: string;
    groupBy?: string[];
    filters?: { dimension: string; values: string[] }[];
    topN?: number;
    xAxisType?: string;
    xAxisDimension?: string;
  }): Promise<{ rows: any[]; total: number }> => {
    return post<{ rows: any[]; total: number }>('bi-query', params);
  },

  distinct: (dimension: string): Promise<string[]> => {
    return get<string[]>(`bi-distinct?dimension=${encodeURIComponent(dimension)}`);
  },

  dateRange: (): Promise<{ min_date: string | null; max_date: string | null }> => {
    return get<{ min_date: string | null; max_date: string | null }>('bi-date-range');
  },
};

// ─── QoE Map (site-level QoE scores for map coloring) ───
export interface QoeMapSiteData {
  qoe_index: number | null;
  debit_dl: number | null;
  debit_ul: number | null;
  rtt_data_avg: number | null;
  rtt_setup_avg: number | null;
  dms_dl_3: number | null;
  dms_dl_8: number | null;
  dms_dl_30: number | null;
  dms_ul_3: number | null;
  sessions: number | null;
  tcp_retr_rate_dl: number | null;
  loss_dl_rate: number | null;
  session_dcr: number | null;
  wind_full_rate: number | null;
  volume_dl: number | null;
  volume_ul: number | null;
}

export interface QoeMapResponse {
  sites: Record<string, QoeMapSiteData>;
  date: string | null;
  dimension: string;
}

export const qoeMapApi = {
  fetch: (dimension?: string, date?: string) => {
    const qs = new URLSearchParams();
    if (dimension) qs.set('dimension', dimension);
    if (date) qs.set('date', date);
    return get<QoeMapResponse>(`qoe-map?${qs}`);
  },
};

// ─── Streaming (qoe-assistant) ───
export function streamAssistant(body: any): Promise<Response> {
  return fetch(url('qoe-assistant'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export { url as getLocalApiUrl };
