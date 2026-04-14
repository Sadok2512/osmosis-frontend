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
 * Sites/cells are fetched once from /api/v1/topo/sites and /api/v1/topo/cells
 * (which already carry vendor / techno metadata) and cached in-module so the
 * hook is cheap to use across components.
 */
import { useEffect, useMemo, useState } from 'react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

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

let sitesCache: TopoSite[] | null = null;
let cellsCache: TopoCell[] | null = null;
let sitesInFlight: Promise<TopoSite[]> | null = null;
let cellsInFlight: Promise<TopoCell[]> | null = null;
const listeners: Array<() => void> = [];

function notify() {
  for (const l of listeners) l();
}

async function loadSites(): Promise<TopoSite[]> {
  if (sitesCache) return sitesCache;
  if (sitesInFlight) return sitesInFlight;
  sitesInFlight = fetch(getApiUrl('topo/sites?limit=200000'), { headers: getApiHeaders() })
    .then(r => (r.ok ? r.json() : []))
    .then((data: any) => {
      const list: TopoSite[] = Array.isArray(data) ? data : [];
      sitesCache = list;
      notify();
      return list;
    })
    .catch(() => {
      sitesCache = [];
      return [];
    })
    .finally(() => {
      sitesInFlight = null;
    });
  return sitesInFlight;
}

async function loadCells(): Promise<TopoCell[]> {
  if (cellsCache) return cellsCache;
  if (cellsInFlight) return cellsInFlight;
  cellsInFlight = fetch(getApiUrl('topo/cells?limit=200000'), { headers: getApiHeaders() })
    .then(r => (r.ok ? r.json() : []))
    .then((data: any) => {
      const list: TopoCell[] = Array.isArray(data) ? data : [];
      cellsCache = list;
      notify();
      return list;
    })
    .catch(() => {
      cellsCache = [];
      return [];
    })
    .finally(() => {
      cellsInFlight = null;
    });
  return cellsInFlight;
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
 *
 * Catalog entries that don't carry a vendor or techno are treated as "unknown"
 * and excluded when the corresponding axis is constrained — we'd rather hide
 * an entry than mis-route a user.
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
    loadSites();
    loadCells();
    return () => {
      alive = false;
      const i = listeners.indexOf(sub);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, [vendorKey, technoKey]);

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
    // vendorKey/technoKey change trigger re-memo; forceUpdate covers async cache fill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorKey, technoKey, sitesCache, cellsCache]);
}
