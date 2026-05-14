// Phase D/E client for the new /dump/snapshot-info, /dump/cm-delta, and
// /dump/params/map-aggregate endpoints (Parameter Hub workstream
// 2026-05-14). Kept separate from parameterHubApi.ts so Lovable's
// presentation file stays pristine — this one is owned by the API
// integration side per the Lovable split contract.
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';

export interface SnapshotInfo {
  latest:            string | null;
  previous:          string | null;
  rows_total:        number | null;
  rcd_snapshot_date: string | null;
}

export interface CmDeltaRow {
  id:                  number;
  detected_at:         string;
  snapshot_time_old:   string | null;
  snapshot_time_new:   string;
  vendor:              string | null;
  rat:                 string | null;
  bts_id:              number | null;
  cell_id:             number | null;
  object_dn:           string | null;
  object_type_normalized: string | null;
  parameter_normalized: string;
  parameter_raw:       string | null;
  value_old:           string | null;
  value_new:           string | null;
  change_type:         'INSERT' | 'UPDATE' | 'DELETE';
  cell_name:           string | null;
  site_name:           string | null;
  band:                string | null;
  techno:              string | null;
  latitude:            number | null;
  longitude:           number | null;
  plaque:              string | null;
  region:              string | null;
}

export interface CmDeltaResponse {
  items: CmDeltaRow[];
  total: number;
  page:  number;
  pages: number;
}

export interface MapAggregatePoint {
  cell_name: string;
  bts_id:    number | null;
  cell_id:   number | null;
  lat:       number;
  lon:       number;
  value:     string | null;
  n:         number;
}

export interface MapAggregateResponse {
  points:    MapAggregatePoint[];
  parameter: string;
}

async function _get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = params
    ? '?' + Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = getApiUrl(`dump/${path}${qs}`);
  const r = await fetchVpsWithRetry(url, { headers: getApiHeaders() }, { maxRetries: 2, timeoutMs: 20_000 });
  if (!r.ok) throw new Error(`/dump/${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export const getSnapshotInfo = (): Promise<SnapshotInfo> => _get<SnapshotInfo>('snapshot-info');

export const listCmDelta = (filters: {
  bts_id?:     number;
  cell_id?:    number;
  cell_name?:  string;
  parameter?:  string;
  change_type?: 'INSERT' | 'UPDATE' | 'DELETE';
  vendor?:     string;
  region?:     string;
  plaque?:     string;
  since?:      string;
  until?:      string;
  page?:       number;
  limit?:      number;
} = {}): Promise<CmDeltaResponse> =>
  _get<CmDeltaResponse>('cm-delta', filters as Record<string, string | number | undefined>);

export const cmDeltaDistinct = (
  field: 'vendor' | 'region' | 'plaque' | 'parameter_normalized' | 'change_type' | 'object_type_normalized',
): Promise<{ values: string[] }> =>
  _get<{ values: string[] }>('cm-delta/distinct', { field });

export const paramsMapAggregate = (filters: {
  parameter:  string;
  vendor?:    string;
  region?:    string;
  plaque?:    string;
  rat?:       string;
  limit?:     number;
}): Promise<MapAggregateResponse> =>
  _get<MapAggregateResponse>('params/map-aggregate', filters as Record<string, string | number | undefined>);
