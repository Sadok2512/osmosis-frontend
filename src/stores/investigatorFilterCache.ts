/**
 * Centralized filter-value cache for the Investigator page.
 * Preloads all standard + PM dimensions once and serves from memory.
 */
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

type CacheEntry = { values: string[]; labels: Record<string, string>; loading: boolean; loaded: boolean };

const STANDARD_DIMS = ['CELL', 'SITE', 'VENDOR', 'TECHNO', 'BAND', 'DOR', 'PLAQUE', 'ARCEP'];
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

async function fetchStandard(dim: string) {
  const entry: CacheEntry = { values: [], labels: {}, loading: true, loaded: false };
  cache.set(dim, entry);

  try {
    const res = await fetch(getApiUrl(`monitor/filters/values?dimension=${dim}`), { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json();
    if (d.values?.length) { entry.values = d.values; entry.loading = false; entry.loaded = true; cache.set(dim, { ...entry }); notify(); return; }
    throw new Error('empty');
  } catch {
    try {
      const res2 = await fetch(getApiUrl(`pm/counters/filter-values?dimension=${dim}`), { headers: getApiHeaders() });
      const d2 = await res2.json();
      if (d2.values?.length) { entry.values = d2.values; entry.loading = false; entry.loaded = true; cache.set(dim, { ...entry }); notify(); return; }
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
