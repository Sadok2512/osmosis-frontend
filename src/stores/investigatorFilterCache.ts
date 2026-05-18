/**
 * Centralized filter-value cache for the Investigator page.
 * Preloads all standard + PM dimensions once and serves from memory.
 * Values come exclusively from backend endpoints — no static fallbacks,
 * no topo overlay. If backend is unreachable, dropdowns are empty.
 */
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';

type CacheEntry = { values: string[]; labels: Record<string, string>; loading: boolean; loaded: boolean };

/** Cascading-filter context: { upstreamDim: value | values } */
export type FilterContext = Record<string, string | string[] | undefined>;

const PM_DIMS = ['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL'];

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();
let preloaded = false;
let listeners: Array<() => void> = [];

function notify() { listeners.forEach(fn => fn()); }

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

/** Build a stable cache-key suffix from a context. Empty context → "" */
function ctxSuffix(ctx?: FilterContext): string {
  if (!ctx) return '';
  const entries = Object.entries(ctx)
    .filter(([_, v]) => v !== undefined && v !== '' && v !== 'Tous' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k.toUpperCase(), Array.isArray(v) ? [...v].sort().join(',') : String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return '';
  return '|' + entries.map(([k, v]) => `${k}=${v}`).join('&');
}

function makeKey(dim: string, ctx?: FilterContext): string {
  return dim + ctxSuffix(ctx);
}

export function getFilterValues(key: string, ctx?: FilterContext): CacheEntry {
  return cache.get(makeKey(key, ctx)) || { values: [], labels: {}, loading: false, loaded: false };
}

async function fetchStandard(dim: string, ctx?: FilterContext) {
  const cacheKey = makeKey(dim, ctx);
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(cacheKey, entry);

  // Build URL — only include &context= when there are upstream filters
  const ctxParam = ctx && ctxSuffix(ctx)
    ? `&context=${encodeURIComponent(JSON.stringify(
        Object.fromEntries(Object.entries(ctx).filter(([_, v]) =>
          v !== undefined && v !== '' && v !== 'Tous' && !(Array.isArray(v) && v.length === 0)
        ))
      ))}`
    : '';

  try {
    const res = await fetchVpsWithRetry(getApiUrl(`monitor/filters/values?dimension=${dim}${ctxParam}`), { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json();
    if (d.values?.length) entry.values = d.values;
    else throw new Error('empty');
  } catch {
    // Fallback path doesn't support context — only used when primary failed entirely.
    if (!ctxParam) {
      try {
        const res2 = await fetchVpsWithRetry(getApiUrl(`pm/counters/filter-values?dimension=${dim}`), { headers: getApiHeaders() });
        const d2 = await res2.json();
        if (d2.values?.length) entry.values = d2.values;
      } catch {}
    }
  }
  entry.loading = false;
  entry.loaded = true;
  cache.set(cacheKey, { ...entry });
  notify();
}

async function fetchPm(dim: string, ctx?: FilterContext) {
  const cacheKey = makeKey(dim, ctx);
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(cacheKey, entry);
  try {
    const params = new URLSearchParams({ dimension_type: dim, limit: '200' });
    const res = await fetch(getApiUrl(`pm/counters/dimension-values?${params.toString()}`), { headers: getApiHeaders() });
    const d = res.ok ? await res.json() : { values: [], labeled_values: [] };
    if (d.values) entry.values = d.values;
    // Store label map: "PMQAP=1" → "QCI 1: Voice (GBR)"
    if (d.labeled_values) {
      for (const lv of d.labeled_values) {
        if (typeof lv === 'object' && lv.value && lv.label) {
          entry.labels[lv.value] = lv.label;
        }
      }
    }
  } catch {}
  entry.loading = false;
  entry.loaded = true;
  cache.set(cacheKey, { ...entry });
  notify();
}

async function fetchCluster(ctx?: FilterContext) {
  const cacheKey = makeKey('CLUSTER', ctx);
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(cacheKey, entry);
  try {
    const res = await fetch(getApiUrl('topo/filters'), { headers: getApiHeaders() });
    if (res.ok) {
      const d = await res.json();
      const bc = (d.filters || []).find((f: any) => f.id === 'cluster');
      if (bc?.values?.length) entry.values = bc.values;
    }
  } catch {}
  if (!entry.values.length) {
    try {
      const res2 = await fetch(getApiUrl('filters/?status=active&limit=100'), { headers: getApiHeaders() });
      if (res2.ok) {
        const d2 = await res2.json();
        entry.values = (d2.filters || []).map((f: any) => f.name).filter(Boolean);
      }
    } catch {}
  }
  entry.loading = false;
  entry.loaded = true;
  cache.set(cacheKey, { ...entry });
  notify();
}

export function ensureFilterLoaded(key: string, ctx?: FilterContext) {
  const dim = isPmDimension(key) ? key : dimToKey(key);
  const cacheKey = makeKey(dim, ctx);
  const entry = cache.get(cacheKey);
  if (entry?.loaded || entry?.loading) return;
  if (inFlight.has(cacheKey)) return;

  // PM dims and CLUSTER don't support cascading context yet
  const loader = (dim === 'CLUSTER' ? fetchCluster(ctx) : isPmDimension(dim) ? fetchPm(dim, ctx) : fetchStandard(dim, ctx))
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, loader);
}

/** Force reload a specific filter dimension (e.g., after creating a new cluster). */
export function reloadFilter(key: string, ctx?: FilterContext) {
  const dim = isPmDimension(key) ? key : dimToKey(key);
  const cacheKey = makeKey(dim, ctx);
  cache.delete(cacheKey);
  inFlight.delete(cacheKey);
  ensureFilterLoaded(key, ctx);
}

/** Preload all filter dimensions. Safe to call multiple times — only runs once. */
export function preloadAllFilters() {
  if (preloaded) return;
  preloaded = true;
  // Warm only the common top-level dimensions to avoid overloading the VPS proxy at startup.
  ['SITE', 'DOR', 'CLUSTER', 'BAND'].forEach(k => ensureFilterLoaded(k));
}

/** Map UI dimension label → cache key */
export function dimToKey(dimension: string): string {
  const map: Record<string, string> = {
    Cell: 'CELL', Site: 'SITE', Vendor: 'VENDOR', Technology: 'TECHNO', RAT: 'TECHNO',
    Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'PLAQUE', Cluster: 'CLUSTER',
    'Zone ARCEP': 'ARCEP', 'ARCEP Zone': 'ARCEP', Status: 'STATUS',
    Cluster_B: 'CLUSTER', bcluster: 'CLUSTER', CLUSTER_B: 'CLUSTER',
    // backward compat
    constructeur: 'VENDOR', Constructeur: 'VENDOR',
    techno: 'TECHNO', Techno: 'TECHNO', TECHNO: 'TECHNO',
    // SITE aliases (backend may surface SITENAME / SITE_NAME / NIDT in dimension catalog)
    SITENAME: 'SITE', SITE_NAME: 'SITE', site_name: 'SITE', sitename: 'SITE', NIDT: 'SITE',
    CELLNAME: 'CELL', CELL_NAME: 'CELL', cell_name: 'CELL',
  };
  return map[dimension] || dimension;
}

export function isPmDimension(dim: string): boolean {
  return PM_DIMS.includes(dim);
}

/** Reset cache (e.g. on logout) */
export function resetFilterCache() {
  cache.clear();
  preloaded = false;
}
