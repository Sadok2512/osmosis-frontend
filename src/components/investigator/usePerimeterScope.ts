/**
 * Perimeter scope hook for the Investigator.
 *
 * Reads the current Vendor / Technology filters from the Investigator state
 * and derives:
 *   - vendorSet / technoSet           : active perimeter selections (uppercased)
 *   - hasScope                        : true if any vendor or techno is selected
 *   - siteAllowed / cellAllowed       : Sets of site/cell names whose metadata
 *                                       matches the perimeter. `null` means
 *                                       "no scope active → every value allowed".
 *   - matchKpi / matchCounter         : predicate helpers for catalog entries
 *                                       that carry `vendor` and `techno` fields.
 *
 * Sites/cells are fetched from VPS /topo/sites and /topo/cells with vendor/techno
 * filters to keep the response small and fast. Results are cached per filter key.
 */
import { useEffect, useMemo, useState } from 'react';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

export type TopoSite = {
  site_name: string;
  constructeur?: string | null;
  vendors?: string[] | null;
  technos?: string[] | null;
};

export type TopoCell = {
  cell_name: string;
  site_name?: string | null;
  vendor?: string | null;
  techno?: string | null;
};

// Keyed caches — one per vendor+techno combination
const sitesCacheMap = new Map<string, TopoSite[]>();
const cellsCacheMap = new Map<string, TopoCell[]>();
const inFlightSites = new Map<string, Promise<TopoSite[]>>();
const inFlightCells = new Map<string, Promise<TopoCell[]>>();
const listeners: Array<() => void> = [];

function notify() {
  for (const l of listeners) l();
}

function buildCacheKey(vendors: string[], technos: string[]): string {
  return `v=${vendors.sort().join(',')}&t=${technos.sort().join(',')}`;
}

async function loadSites(vendors: string[], technos: string[]): Promise<TopoSite[]> {
  const key = buildCacheKey(vendors, technos);
  if (sitesCacheMap.has(key)) return sitesCacheMap.get(key)!;
  if (inFlightSites.has(key)) return inFlightSites.get(key)!;

  // Build query with vendor/techno filters for smaller response
  const extra: Record<string, string> = { limit: '50000' };
  if (vendors.length === 1) extra.constructeur = vendors[0];
  if (vendors.length > 1) extra.constructeur = vendors.join(',');

  const url = getVpsProxyUrl('parser', '/api/v1/topo/sites', extra);
  const headers = getVpsProxyHeaders();

  const p = fetch(url, { headers })
    .then(r => (r.ok ? r.json() : []))
    .then((data: any) => {
      const list: TopoSite[] = Array.isArray(data) ? data : (data?.sites || []);
      sitesCacheMap.set(key, list);
      notify();
      return list;
    })
    .catch(() => {
      sitesCacheMap.set(key, []);
      notify();
      return [] as TopoSite[];
    })
    .finally(() => {
      inFlightSites.delete(key);
    });
  inFlightSites.set(key, p);
  return p;
}

async function loadCells(vendors: string[], technos: string[]): Promise<TopoCell[]> {
  const key = buildCacheKey(vendors, technos);
  if (cellsCacheMap.has(key)) return cellsCacheMap.get(key)!;
  if (inFlightCells.has(key)) return inFlightCells.get(key)!;

  const extra: Record<string, string> = { limit: '50000' };
  if (vendors.length === 1) extra.constructeur = vendors[0];
  if (vendors.length > 1) extra.constructeur = vendors.join(',');
  if (technos.length > 0) extra.techno = technos.join(',');

  const url = getVpsProxyUrl('parser', '/api/v1/topo/cells', extra);
  const headers = getVpsProxyHeaders();

  const p = fetch(url, { headers })
    .then(r => (r.ok ? r.json() : []))
    .then((data: any) => {
      const raw = Array.isArray(data) ? data : (data?.rows || data?.cells || []);
      const list: TopoCell[] = raw.map((c: any) => ({
        cell_name: c.nom_cellule || c.cell_name || '',
        site_name: c.nom_site || c.site_name || null,
        vendor: c.constructeur || c.vendor || null,
        techno: c.techno || null,
      }));
      cellsCacheMap.set(key, list);
      notify();
      return list;
    })
    .catch(() => {
      cellsCacheMap.set(key, []);
      notify();
      return [] as TopoCell[];
    })
    .finally(() => {
      inFlightCells.delete(key);
    });
  inFlightCells.set(key, p);
  return p;
}

export type PerimeterScope = {
  vendorSet: Set<string>;
  technoSet: Set<string>;
  hasScope: boolean;
  siteAllowed: Set<string> | null;
  cellAllowed: Set<string> | null;
  matchKpi: (item: { vendor?: string | null; techno?: string | null }) => boolean;
  matchCounter: (item: { vendor?: string | null; techno?: string | null }) => boolean;
};

const EMPTY_SCOPE: PerimeterScope = {
  vendorSet: new Set(),
  technoSet: new Set(),
  hasScope: false,
  siteAllowed: null,
  cellAllowed: null,
  matchKpi: () => true,
  matchCounter: () => true,
};

const normalize = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '');

/**
 * Build a vendor/techno match predicate. Rules:
 *  - If no perimeter is selected → always true.
 *  - If only vendor is selected   → item vendor must be in the set.
 *  - If only techno is selected   → item techno must be in the set.
 *  - If both are selected         → both must match.
 */
function buildMatcher(vendorSet: Set<string>, technoSet: Set<string>) {
  if (vendorSet.size === 0 && technoSet.size === 0) return () => true;
  return (item: { vendor?: string | null; techno?: string | null }) => {
    if (vendorSet.size > 0) {
      const v = normalize(item.vendor);
      if (!v || !vendorSet.has(v)) return false;
    }
    if (technoSet.size > 0) {
      const t = normalize(item.techno);
      if (!t || !technoSet.has(t)) return false;
    }
    return true;
  };
}

/**
 * usePerimeterScope — derives a PerimeterScope from the Investigator filter
 * object (the same shape stored in InvestigatorPage state: `filters[dim] = values[]`).
 */
export function usePerimeterScope(filters: Record<string, string[] | undefined>): PerimeterScope {
  const vendorSelected = filters['Vendor'] || [];
  const technoSelected = filters['Technology'] || [];
  const vendorKey = vendorSelected.slice().sort().join('|');
  const technoKey = technoSelected.slice().sort().join('|');

  const [, forceUpdate] = useState(0);

  // Lazy-load topology metadata only when a perimeter is actually in use.
  useEffect(() => {
    if (vendorSelected.length === 0 && technoSelected.length === 0) return;
    let alive = true;
    const sub = () => { if (alive) forceUpdate(n => n + 1); };
    listeners.push(sub);
    loadSites(vendorSelected, technoSelected);
    loadCells(vendorSelected, technoSelected);
    return () => {
      alive = false;
      const i = listeners.indexOf(sub);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, [vendorKey, technoKey]);

  const cacheKey = buildCacheKey(vendorSelected, technoSelected);
  const sitesCache = sitesCacheMap.get(cacheKey) || null;
  const cellsCache = cellsCacheMap.get(cacheKey) || null;

  return useMemo<PerimeterScope>(() => {
    const vendorSet = new Set(vendorSelected.map(normalize).filter(Boolean));
    const technoSet = new Set(technoSelected.map(normalize).filter(Boolean));
    const hasScope = vendorSet.size > 0 || technoSet.size > 0;
    if (!hasScope) return EMPTY_SCOPE;

    const matchVendor = (candidates: string[]) => {
      if (vendorSet.size === 0) return true;
      return candidates.some(c => vendorSet.has(normalize(c)));
    };
    const matchTechno = (candidates: string[]) => {
      if (technoSet.size === 0) return true;
      return candidates.some(c => technoSet.has(normalize(c)));
    };

    let siteAllowed: Set<string> | null = null;
    if (sitesCache && sitesCache.length > 0) {
      siteAllowed = new Set();
      for (const s of sitesCache) {
        const vList = [
          ...(s.vendors || []),
          ...(s.constructeur ? [s.constructeur] : []),
        ];
        const tList = s.technos || [];
        if (matchVendor(vList) && matchTechno(tList)) {
          siteAllowed.add(s.site_name);
        }
      }
    }

    let cellAllowed: Set<string> | null = null;
    if (cellsCache && cellsCache.length > 0) {
      cellAllowed = new Set();
      for (const c of cellsCache) {
        if (vendorSet.size > 0 && (!c.vendor || !vendorSet.has(normalize(c.vendor)))) continue;
        if (technoSet.size > 0 && (!c.techno || !technoSet.has(normalize(c.techno)))) continue;
        cellAllowed.add(c.cell_name);
      }
    }

    const matcher = buildMatcher(vendorSet, technoSet);
    return {
      vendorSet,
      technoSet,
      hasScope,
      siteAllowed,
      cellAllowed,
      matchKpi: matcher,
      matchCounter: matcher,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorKey, technoKey, sitesCache, cellsCache]);
}