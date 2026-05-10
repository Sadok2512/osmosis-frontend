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

async function dumpGet<T>(path: string, opts?: { timeoutMs?: number; maxRetries?: number }): Promise<T> {
  const url = getApiUrl(`dump/${path}`);
  const res = await fetchVpsWithRetry(
    url,
    { headers: getApiHeaders() },
    { maxRetries: opts?.maxRetries ?? 3, timeoutMs: opts?.timeoutMs ?? 30_000 },
  );
  if (!res.ok) throw new Error(`Dump API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Distinct parameter names for the selector.
 *  The full catalog is heavy, so the picker loads an initial slice and then
 *  queries the backend by search text for the rest of the ~8700 parameters. */
const PARAMS_CACHE_KEY = 'osmosis.paramHub.distinctParams.v3';
const PARAMS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
let _paramsMemCache: string[] | null = null;
let _paramsInflight: Promise<string[]> | null = null;
const _paramsSearchCache = new Map<string, string[]>();
const _paramsSearchInflight = new Map<string, Promise<string[]>>();

function normalizeStringList(payload: unknown): string[] {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : Array.isArray((payload as any)?.items)
        ? (payload as any).items
        : Array.isArray((payload as any)?.rows)
          ? (payload as any).rows
          : [];
  return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
}

export async function fetchAvailableParameters(force = false, search = ''): Promise<string[]> {
  const query = search.trim();
  if (query.length >= 2) {
    const cacheKey = query.toLowerCase();
    if (!force && _paramsSearchCache.has(cacheKey)) return _paramsSearchCache.get(cacheKey)!;
    if (_paramsSearchInflight.has(cacheKey)) return _paramsSearchInflight.get(cacheKey)!;

    const promise = dumpGet<unknown>(
      `params/distinct?column=parameter_raw&limit=10000&search=${encodeURIComponent(query)}`,
      { timeoutMs: 60_000, maxRetries: 2 },
    ).then((payload) => {
      const sorted = normalizeStringList(payload).sort((a, b) => a.localeCompare(b));
      _paramsSearchCache.set(cacheKey, sorted);
      return sorted;
    }).finally(() => { _paramsSearchInflight.delete(cacheKey); });

    _paramsSearchInflight.set(cacheKey, promise);
    return promise;
  }

  if (!force && _paramsMemCache && _paramsMemCache.length > 0) return _paramsMemCache;

  // sessionStorage warm cache (survives soft reloads within a tab)
  if (!force && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(PARAMS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; data: string[] };
        if (parsed?.data?.length && Date.now() - parsed.ts < PARAMS_CACHE_TTL_MS) {
          _paramsMemCache = parsed.data;
          return _paramsMemCache;
        }
      }
    } catch { /* ignore */ }
  }

  if (_paramsInflight) return _paramsInflight;

  _paramsInflight = (async () => {
    // Backend currently times out for limit >= 500 on this endpoint.
    // We bootstrap with a small slice; the search path (>=2 chars) covers the rest.
    const list = await dumpGet<unknown>(
      'params/distinct?column=parameter_raw&limit=300',
      { timeoutMs: 30_000, maxRetries: 2 },
    );
    const sorted = normalizeStringList(list).sort((a, b) => a.localeCompare(b));
    _paramsMemCache = sorted;
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(PARAMS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: sorted }));
      } catch { /* quota — ignore */ }
    }
    return sorted;
  })().finally(() => { _paramsInflight = null; });

  return _paramsInflight;
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

function buildQueryString(
  filters: ParameterHubFilters,
  limit: number,
  page = 1,
  parameterOverride?: string,
): string {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('page', String(page));
  // Backend OR-filter only supports a SINGLE parameter per request:
  // sending CSV or repeated values silently keeps only the last one.
  // We fan out one call per parameter (see fetchParameterRows below).
  const param = parameterOverride ?? filters.parameters[0];
  if (param) qs.set('parameters', param);
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

/** Orange France band-letter convention applied to the prefix preceding the
 *  trailing sector digit of a cell name. Used to backfill `bande` when the
 *  backend does not enrich it (so band aggregation works). */
const BAND_LETTER_MAP: Record<string, string> = {
  // 4G
  E: 'L2600', F: 'L1800', H: 'L800', V: 'L2100', K: 'L700', L: 'L900',
  // 5G
  X: 'NR3500', Y: 'NR2100', Z: 'NR700', W: 'NR1800', U: 'NR2600',
};

function inferBandFromCell(cellName?: string | null): string | null {
  if (!cellName) return null;
  const name = String(cellName).toUpperCase();
  // 2G / 3G explicit prefixes
  if (/GSM\s*1800|DCS/.test(name)) return 'GSM1800';
  if (/GSM\s*900|GSM/.test(name)) return 'GSM900';
  if (/UMTS\s*2100|U21/.test(name)) return 'UMTS2100';
  if (/UMTS\s*900|U09/.test(name)) return 'UMTS900';
  // Orange convention: <letter><sector-digit> at the end
  const m = name.match(/([A-Z])(\d)(?!.*\d)/);
  if (m && BAND_LETTER_MAP[m[1]]) return BAND_LETTER_MAP[m[1]];
  return null;
}

function enrichBande(rows: ParameterRow[]): ParameterRow[] {
  return rows.map((r) => {
    if (r.bande && r.bande.trim()) return r;
    const inferred = inferBandFromCell(r.cell_name ?? r.cell_dn ?? r.dn);
    return inferred ? { ...r, bande: inferred } : r;
  });
}

/** Fetch enriched parameter rows. Fans out one request per selected parameter
 *  because the backend OR-filter currently keeps only the last value sent. */
export async function fetchParameterRows(
  filters: ParameterHubFilters,
  limit = 200,
): Promise<ParameterRow[]> {
  const params = filters.parameters.length > 0 ? filters.parameters : [undefined];
  const perParamLimit = Math.max(50, Math.ceil(limit / Math.max(1, params.length)));
  const results = await Promise.all(
    params.map(async (p) => {
      const qs = buildQueryString(filters, perParamLimit, 1, p);
      try {
        const resp = await dumpGet<{ items: ParameterRow[] }>(`params/enriched?${qs}`);
        return resp.items ?? [];
      } catch (e) {
        console.warn('[ParameterHub] fetch failed for parameter', p, e);
        return [];
      }
    }),
  );
  return enrichBande(results.flat());
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
