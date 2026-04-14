/**
 * Centralized filter-value cache for the Investigator page.
 * Preloads all standard + PM dimensions once and serves from memory.
 * Falls back to VPS topo data when PM backend lacks certain dimensions.
 */
import { getApiUrl, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

type CacheEntry = { values: string[]; labels: Record<string, string>; loading: boolean; loaded: boolean };

const STANDARD_DIMS = ['CELL', 'SITE', 'VENDOR', 'TECHNO', 'BAND', 'DOR', 'PLAQUE', 'ARCEP'];
const PM_DIMS = ['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL'];

/** Dimensions that can be enriched from VPS topo distinct values */
const TOPO_ENRICHABLE: Record<string, string> = {
  SITE: 'site_name',
  DOR: 'dor',
  PLAQUE: 'plaque',
  VENDOR: 'constructeur',
  ARCEP: 'zone_arcep',
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();
let preloaded = false;
let listeners: Array<() => void> = [];

function notify() { listeners.forEach(fn => fn()); }

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function getFilterValues(key: string): CacheEntry {
  return cache.get(key) || { values: [], labels: {}, loading: false, loaded: false };
}

const STATIC_FALLBACKS: Record<string, string[]> = {
  VENDOR: ['Ericsson', 'Huawei', 'Nokia'],
  TECHNO: ['2G', '3G', '4G', '5G'],
  BAND: ['700', '800', '1800', '2100', '2600', '3500'],
  DOR: [],
  PLAQUE: [],
};

/** Try to enrich a dimension with values from VPS topo data */
async function enrichFromTopo(dim: string, existing: string[]): Promise<string[]> {
  const topoCol = TOPO_ENRICHABLE[dim];
  if (!topoCol) return existing;
  try {
    let topoValues: string[] = [];

    // For SITE, use /topo/sites which reliably returns site_name
    // /topo/distinct?field=site_name often returns empty
    if (dim === 'SITE') {
      const url = getVpsProxyUrl('parser', '/api/v1/topo/sites', { limit: '50000' });
      const res = await fetch(url, { headers: getVpsProxyHeaders() });
      if (!res.ok) return existing;
      const data = await res.json();
      const sites: any[] = Array.isArray(data) ? data : (data?.sites || []);
      const nameSet = new Set<string>();
      for (const s of sites) {
        const name = s.site_name || s.nom_site;
        if (typeof name === 'string' && name && !nameSet.has(name)) {
          nameSet.add(name);
          topoValues.push(name);
        }
      }
    } else {
      const url = getVpsProxyUrl('parser', '/api/v1/topo/distinct', { field: topoCol });
      const res = await fetch(url, { headers: getVpsProxyHeaders() });
      if (!res.ok) return existing;
      const data = await res.json();
      topoValues = Array.isArray(data) ? data.filter((v: any) => typeof v === 'string' && v) : [];
    }

    if (topoValues.length === 0) return existing;
    // Merge: add topo values not already present
    const existingSet = new Set(existing.map(v => v.toUpperCase()));
    const merged = [...existing];
    for (const v of topoValues) {
      if (!existingSet.has(v.toUpperCase())) {
        merged.push(v);
        existingSet.add(v.toUpperCase());
      }
    }
    return merged.sort();
  } catch {
    return existing;
  }
}

async function fetchStandard(dim: string) {
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(dim, entry);

  try {
    const res = await fetch(getApiUrl(`monitor/filters/values?dimension=${dim}`), { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json();
    if (d.values?.length) { entry.values = d.values; entry.loading = false; entry.loaded = true; cache.set(dim, { ...entry }); notify(); }
    else throw new Error('empty');
  } catch {
    try {
      const res2 = await fetch(getApiUrl(`pm/counters/filter-values?dimension=${dim}`), { headers: getApiHeaders() });
      const d2 = await res2.json();
      if (d2.values?.length) { entry.values = d2.values; entry.loading = false; entry.loaded = true; cache.set(dim, { ...entry }); notify(); }
    } catch {}
  }
  // Fallback to static values when backend is unreachable
  if (!entry.values.length && STATIC_FALLBACKS[dim]?.length) {
    entry.values = STATIC_FALLBACKS[dim];
  }
  entry.loading = false;
  entry.loaded = true;
  cache.set(dim, { ...entry });
  notify();

  // Enrich with topo data in background (adds sites/plaques from VPS that PM doesn't know)
  if (TOPO_ENRICHABLE[dim]) {
    enrichFromTopo(dim, entry.values).then(merged => {
      if (merged.length > entry.values.length) {
        entry.values = merged;
        cache.set(dim, { ...entry });
        notify();
      }
    });
  }
}

async function fetchPm(dim: string) {
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(dim, entry);
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
  cache.set(dim, { ...entry });
  notify();
}

export function ensureFilterLoaded(key: string) {
  const cacheKey = isPmDimension(key) ? key : dimToKey(key);
  const entry = cache.get(cacheKey);
  if (entry?.loaded || entry?.loading) return;
  if (inFlight.has(cacheKey)) return;

  const loader = (isPmDimension(cacheKey) ? fetchPm(cacheKey) : fetchStandard(cacheKey))
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, loader);
}

/** Preload all filter dimensions. Safe to call multiple times — only runs once. */
export function preloadAllFilters() {
  if (preloaded) return;
  preloaded = true;
  // Warm only the common top-level dimensions to avoid overloading the VPS proxy at startup.
  ['SITE', 'DOR', 'PLAQUE', 'BAND'].forEach(ensureFilterLoaded);
}

/** Map UI dimension label → cache key */
export function dimToKey(dimension: string): string {
  const map: Record<string, string> = {
    Cell: 'CELL', Site: 'SITE', Vendor: 'VENDOR', Technology: 'TECHNO',
    Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'PLAQUE', 'Zone ARCEP': 'ARCEP',
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