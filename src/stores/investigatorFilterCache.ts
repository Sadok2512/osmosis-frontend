/**
 * Centralized filter-value cache for the Investigator page.
 * Preloads all standard + PM dimensions once and serves from memory.
 */
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

type CacheEntry = { values: string[]; loading: boolean; loaded: boolean };

const STANDARD_DIMS = ['CELL', 'SITE', 'VENDOR', 'TECHNO', 'BAND', 'DOR', 'PLAQUE', 'ARCEP'];
const PM_DIMS = ['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL'];

const cache = new Map<string, CacheEntry>();
let preloaded = false;
let listeners: Array<() => void> = [];

function notify() { listeners.forEach(fn => fn()); }

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function getFilterValues(key: string): CacheEntry {
  return cache.get(key) || { values: [], loading: false, loaded: false };
}

async function fetchStandard(dim: string) {
  const entry: CacheEntry = { values: [], loading: true, loaded: false };
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
      if (d2.values) entry.values = d2.values;
    } catch {}
  }
  entry.loading = false;
  entry.loaded = true;
  cache.set(dim, { ...entry });
  notify();
}

async function fetchPm(dim: string) {
  const entry: CacheEntry = { values: [], loading: true, loaded: false };
  cache.set(dim, entry);
  try {
    const params = new URLSearchParams({ dimension_type: dim, limit: '200' });
    const res = await fetch(getApiUrl(`pm/counters/dimension-values?${params.toString()}`), { headers: getApiHeaders() });
    const d = res.ok ? await res.json() : { values: [] };
    if (d.values) entry.values = d.values;
  } catch {}
  entry.loading = false;
  entry.loaded = true;
  cache.set(dim, { ...entry });
  notify();
}

/** Preload all filter dimensions. Safe to call multiple times — only runs once. */
export function preloadAllFilters() {
  if (preloaded) return;
  preloaded = true;
  // Fire all requests in parallel
  STANDARD_DIMS.forEach(d => fetchStandard(d));
  PM_DIMS.forEach(d => fetchPm(d));
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
