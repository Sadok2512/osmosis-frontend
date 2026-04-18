// ── Parameter Hub API — connected to parser /api/v1/dump ──
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';

export interface ParameterRow {
  parameter: string;
  value: string | null;
  site_name: string | null;
  cell_name: string | null;
  cell_dn?: string | null;
  dn: string | null;
  vendor: string | null;
  bande: string | null;
  techno?: string | null;
  plaque: string | null;
  dor: string | null;
  zone_arcep: string | null;
  enodeb_id?: number | null;
  gnodeb_id?: number | null;
  mrbts_id?: number | null;
  latitude: number | null;
  longitude: number | null;
  netact?: string | null;
  version?: string | null;
  node_id?: number | null;
  object_type?: string | null;
}

export type AggregationLevel = 'cell' | 'sector' | 'band' | 'site' | 'plaque' | 'dor';

export interface ParameterHubFilters {
  parameters: string[];
  plaque: string[];
  site: string[];
  cell: string[];
  dor: string[];
  zone_arcep: string[];
  vendor: string[];
  techno: string[];
  bande: string[];
}

export const EMPTY_FILTERS: ParameterHubFilters = {
  parameters: [],
  plaque: [],
  site: [],
  cell: [],
  dor: [],
  zone_arcep: [],
  vendor: [],
  techno: [],
  bande: [],
};

async function dumpGet<T>(path: string): Promise<T> {
  const url = getApiUrl(`dump/${path}`);
  const res = await fetchVpsWithRetry(url, { headers: getApiHeaders() }, { maxRetries: 3 });
  if (!res.ok) throw new Error(`Dump API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Distinct parameter names for the selector. */
export async function fetchAvailableParameters(): Promise<string[]> {
  return dumpGet<string[]>('params/distinct?column=parameter_raw&limit=20000');
}

/** Distinct values for a dimension column. */
export async function fetchDistinctValues(column: keyof ParameterRow): Promise<string[]> {
  // For topo-enriched dimensions, use topo/filters
  if (['bande', 'plaque', 'dor', 'zone_arcep', 'site_name', 'cell_name'].includes(column)) {
    try {
      const resp = await fetch(getApiUrl('topo/filters'), { headers: getApiHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        const filterMap: Record<string, string> = {
          bande: 'bande', plaque: 'plaque', dor: 'dor',
          zone_arcep: 'zone_arcep', site_name: 'site', cell_name: 'cell',
        };
        const filterId = filterMap[column];
        const filter = (data.filters ?? []).find((f: any) => f.id === filterId);
        return (filter?.values ?? []).filter(Boolean).sort();
      }
    } catch { /* fallback below */ }
    return [];
  }

  // For param_dump native columns
  const colMap: Record<string, string> = {
    vendor: 'vendor', parameter: 'parameter_raw',
    object_type: 'object_type_normalized',
  };
  const backendCol = colMap[column] || column;
  return dumpGet<string[]>(`params/distinct?column=${encodeURIComponent(backendCol)}&limit=5000`);
}

function buildQueryString(filters: ParameterHubFilters, limit: number, page = 1): string {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('page', String(page));
  // Multi-value: use comma-separated plural params for every dimension
  if (filters.parameters.length > 0) qs.set('parameters', filters.parameters.join(','));
  if (filters.vendor.length > 0) qs.set('vendors', filters.vendor.join(','));
  if (filters.dor.length > 0) qs.set('dor', filters.dor.join(','));
  if (filters.plaque.length > 0) qs.set('plaque', filters.plaque.join(','));
  if (filters.bande.length > 0) qs.set('bande', filters.bande.join(','));
  if (filters.zone_arcep.length > 0) qs.set('zone_arcep', filters.zone_arcep.join(','));
  if (filters.techno.length > 0) qs.set('techno', filters.techno.join(','));
  if (filters.site.length > 0) qs.set('site_name', filters.site.join(','));
  if (filters.cell.length > 0) qs.set('cell_name', filters.cell.join(','));
  return qs.toString();
}

/** Fetch enriched parameter rows matching the filters. */
export async function fetchParameterRows(
  filters: ParameterHubFilters,
  limit = 200,
): Promise<ParameterRow[]> {
  const qs = buildQueryString(filters, limit);
  const resp = await dumpGet<{ items: ParameterRow[] }>(`params/enriched?${qs}`);
  return resp.items ?? [];
}

/** Site → coords cache (lifetime of the page). */
let siteCoordsCache: Map<string, { lat: number; lng: number }> | null = null;
let siteCoordsPromise: Promise<Map<string, { lat: number; lng: number }>> | null = null;

async function loadSiteCoords(): Promise<Map<string, { lat: number; lng: number }>> {
  if (siteCoordsCache) return siteCoordsCache;
  if (siteCoordsPromise) return siteCoordsPromise;
  siteCoordsPromise = (async () => {
    const url = getApiUrl('topo/sites?bbox=-180,-90,180,90&limit=50000');
    try {
      const res = await fetchVpsWithRetry(url, { headers: getApiHeaders() }, { maxRetries: 3, timeoutMs: 45_000 });
      if (!res.ok) throw new Error(`topo/sites ${res.status}`);
      const data = await res.json();
      const rows: any[] = Array.isArray(data) ? data : (data.sites ?? data.rows ?? data.items ?? []);
      const map = new Map<string, { lat: number; lng: number }>();
      for (const r of rows) {
        const lat = Number(r.latitude ?? r.lat);
        const lng = Number(r.longitude ?? r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const key = String(r.site_name ?? r.nom_site ?? r.name ?? '').trim();
        if (key) map.set(key.toUpperCase(), { lat, lng });
        const code = String(r.code_nidt ?? '').trim();
        if (code) map.set(code.toUpperCase(), { lat, lng });
      }
      siteCoordsCache = map;
      return map;
    } catch (e) {
      console.warn('[ParameterHub] topo/sites fetch failed — map enrichment disabled', e);
      siteCoordsCache = new Map();
      return siteCoordsCache;
    }
  })();
  return siteCoordsPromise;
}

/** Fetch rows that have lat/lng for map view, enriched from topo/sites if missing. */
export async function fetchParameterMapRows(
  filters: ParameterHubFilters,
  limit = 1000,
): Promise<ParameterRow[]> {
  const [rows, coords] = await Promise.all([
    fetchParameterRows(filters, limit),
    loadSiteCoords(),
  ]);
  const enriched: ParameterRow[] = [];
  for (const r of rows) {
    let lat = r.latitude;
    let lng = r.longitude;
    if (lat == null || lng == null) {
      const key = String(r.site_name ?? '').trim().toUpperCase();
      if (key) {
        const hit = coords.get(key);
        if (hit) { lat = hit.lat; lng = hit.lng; }
      }
    }
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      enriched.push({ ...r, latitude: lat, longitude: lng });
    }
  }
  return enriched;
}
