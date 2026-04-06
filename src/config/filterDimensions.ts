// ── Filter Dimensions Configuration ─────────────────────────────────
// Fetches real values from /api/v1/topo/filters, falls back to static refs

import { topoApi } from '@/lib/localDb';

export type FilterOp = 'IN' | 'NOT_IN' | 'EQ';

export interface DimensionDef {
  key: string;
  label: string;
  type: 'enum';
  multi: boolean;
  depends_on: string[];
  values?: string[];            // static values
  value_source?: string;        // reference path for dynamic values
}

export interface ActiveFilter {
  id: string;
  dimension: string;
  op: FilterOp;
  values: string[];
}

export interface FilterWhereClause {
  and: { dimension: string; op: FilterOp; values: string[] }[];
}

// ── Backend filter cache ──
// Maps dimension id → string[] of values from /api/v1/topo/filters
let _backendCache: Record<string, string[]> | null = null;
let _fetchPromise: Promise<void> | null = null;
let _listeners: Array<() => void> = [];

export function onFilterCacheReady(cb: () => void) {
  if (_backendCache) { cb(); return; }
  _listeners.push(cb);
}

export function getBackendFilterValues(dimId: string): string[] | null {
  return _backendCache?.[dimId] ?? null;
}

export function isFilterCacheLoaded(): boolean {
  return _backendCache !== null;
}

export function loadFilterCache(): Promise<void> {
  if (_backendCache) return Promise.resolve();
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = topoApi.filters()
    .then(resp => {
      const map: Record<string, string[]> = {};
      for (const f of resp.filters ?? []) {
        map[f.id] = f.values ?? [];
      }
      _backendCache = map;
      _listeners.forEach(cb => cb());
      _listeners = [];
    })
    .catch(err => {
      console.warn('[filterDimensions] Backend filters unavailable, using static fallback', err);
      _fetchPromise = null; // allow retry
    });
  return _fetchPromise;
}

// ── Dimension definitions ──
export const FILTER_DIMENSIONS: DimensionDef[] = [
  { key: 'dor', label: 'DOR', type: 'enum', multi: true, depends_on: [] },
  { key: 'constructeur', label: 'Constructeur', type: 'enum', multi: true, depends_on: ['dor'] },
  { key: 'plaque', label: 'Plaque', type: 'enum', multi: true, depends_on: ['dor', 'constructeur'] },
  { key: 'site', label: 'Site', type: 'enum', multi: true, depends_on: ['plaque'], value_source: 'backend' },
  { key: 'cell', label: 'Cellule', type: 'enum', multi: true, depends_on: ['site'], value_source: 'backend' },
  { key: 'zone_arcep', label: 'Zone ARCEP', type: 'enum', multi: true, depends_on: [] },
  { key: 'techno', label: 'Techno', type: 'enum', multi: true, depends_on: [] },
  { key: 'bande', label: 'Bande', type: 'enum', multi: true, depends_on: ['techno'] },
  { key: 'vendor', label: 'Vendor', type: 'enum', multi: true, depends_on: [] },
];

// ── Reference data ──

export const REF_TECHNO_BANDE: Record<string, string[]> = {
  '4g': ['LTE2100', 'LTE1800', 'LTE700', 'LTE800', 'LTE2600', 'LTE900'],
  '5g': ['NR_2100', 'NR_700', 'NR_3500', 'NR_1800', 'NR_1400', 'NR_2600'],
};

export const REF_DOR_TREE: {
  dors: string[];
  tree: Record<string, Record<string, string[]>>;
} = {
  dors: [
    'UPR Sud-Ouest',
    'UPR Ile-De-France',
    'UPR Nord-Est',
    'UPR Ouest',
    'UPR Sud-Est',
  ],
  tree: {
    'UPR Sud-Ouest': {
      ericsson: ['BORDEAUX', 'DEPT_64', 'DEPT_66', 'LITTORAL_66', 'BAYONNE', 'ANGOULEME'],
      nokia: ['PERPIGNAN', 'DEPT_64', 'TOULOUSE', 'FEMTO'],
      ransharing: ['DEPT_66', 'BORDEAUX', 'DEPT_81'],
      samsung: ['TARBES'],
    },
    'UPR Ile-De-France': {
      ericsson: ['HDS-5', 'IDFS-2', 'IDFO-2', 'P-6'],
      nokia: ['FEMTO', 'HDS-6', 'IDFS-5'],
      huawei: ['ADP-1', 'IDFO-7'],
      ransharing: ['IDFO-9', 'IDFO-1'],
    },
    'UPR Nord-Est': {
      ericsson: ['LILLE', 'REIMS', 'STRASBOURG'],
      nokia: ['FEMTO'],
      ransharing: ['Zones_Blanches_E1', 'DEPT_80'],
    },
    'UPR Ouest': {
      nokia: ['BREST', 'NANTES', 'RENNES', 'CAEN'],
      ransharing: ['AUTRES85', 'AUTRES37'],
      samsung: ['AUTRES44', 'ST_NAZAIRE'],
      alcatel: ['RENNES'],
    },
    'UPR Sud-Est': {
      nokia: ['LYON_CENTRE', 'GRENOBLE', 'NICE_CANNES'],
      ericsson: ['LYON_CENTRE', 'LEMAN'],
      ransharing: ['DPT_06', 'DPT_13', 'TOULON'],
      alcatel: ['FREJUS', 'MARSEILLE_TOP15_OUEST'],
      samsung: ['LYON_CENTRE'],
    },
  },
};

// ── Aliases for normalization ──
export const ALIASES: Record<string, string> = {
  ADP1: 'ADP-1',
  IDFO8: 'IDFO-8',
  IDFE7: 'IDFE-7',
  P5: 'P-5',
  P2: 'P-2',
  AVIGNONOUEST: 'AVIGNON-OUEST',
  AVIGNONCENTRE: 'AVIGNON-CENTRE',
  BOURGOINJALLIEU: 'BOURGOIN-JALLIEU',
  CLERMONTFERRAND: 'CLERMONT-FERRAND',
  SAINTETIENNE: 'SAINT-ETIENNE',
  SALONDEPROVENCE: 'SALON-DE-PROVENCE',
  MENTONMONACO: 'MENTON-MONACO',
  BOURGENBRESSE: 'BOURG-EN-BRESSE',
  DPT_15_42_43: 'DPT_15_43',
};

const INVALID_VALUES = new Set(['', 'undefined', 'null']);

export function normalizeValue(s: string | null | undefined): string | null {
  if (s == null) return null;
  let v = s.trim().replace(/\s+/g, ' ');
  if (INVALID_VALUES.has(v)) return null;
  return ALIASES[v] ?? v;
}

// ── Dependency resolver ──
// Uses backend cache when available, falls back to static refs
export function resolveAvailableValues(
  dimensionKey: string,
  activeFilters: ActiveFilter[]
): string[] {
  const dim = FILTER_DIMENSIONS.find(d => d.key === dimensionKey);
  if (!dim) return [];

  // If backend cache is loaded, use it directly for flat dimensions
  const backendVals = getBackendFilterValues(dimensionKey);

  const getFilterValues = (key: string): string[] | null => {
    const f = activeFilters.find(af => af.dimension === key);
    return f && f.values.length > 0 ? f.values : null;
  };

  switch (dimensionKey) {
    case 'dor':
      return backendVals ?? REF_DOR_TREE.dors;

    case 'constructeur': {
      // Backend has full list; filter by selected DOR if active
      if (backendVals) {
        const dorVals = getFilterValues('dor');
        if (!dorVals) return backendVals;
        // With DOR filter active, narrow via static tree if possible
        const constructeurs = new Set<string>();
        for (const dor of dorVals) {
          const byDor = REF_DOR_TREE.tree[dor];
          if (byDor) Object.keys(byDor).forEach(c => constructeurs.add(c));
        }
        // Return intersection with backend values (handles casing)
        const treeSet = constructeurs;
        return treeSet.size > 0
          ? backendVals.filter(v => treeSet.has(v) || treeSet.has(v.toLowerCase()))
          : backendVals;
      }
      // Static fallback
      const dorVals = getFilterValues('dor');
      const dors = dorVals || REF_DOR_TREE.dors;
      const constructeurs = new Set<string>();
      for (const dor of dors) {
        const byDor = REF_DOR_TREE.tree[dor];
        if (byDor) Object.keys(byDor).forEach(c => constructeurs.add(c));
      }
      return Array.from(constructeurs).sort();
    }

    case 'plaque': {
      if (backendVals) {
        const dorVals = getFilterValues('dor');
        const consVals = getFilterValues('constructeur');
        if (!dorVals && !consVals) return backendVals;
        // Narrow via static tree
        const dors = dorVals || REF_DOR_TREE.dors;
        const plaques = new Set<string>();
        for (const dor of dors) {
          const byDor = REF_DOR_TREE.tree[dor];
          if (!byDor) continue;
          const constructeurs = consVals || Object.keys(byDor);
          for (const cons of constructeurs) {
            const ps = byDor[cons];
            if (ps) ps.forEach(p => plaques.add(p));
          }
        }
        return plaques.size > 0
          ? backendVals.filter(v => plaques.has(v))
          : backendVals;
      }
      // Static fallback
      const dorVals = getFilterValues('dor');
      const consVals = getFilterValues('constructeur');
      const dors = dorVals || REF_DOR_TREE.dors;
      const plaques = new Set<string>();
      for (const dor of dors) {
        const byDor = REF_DOR_TREE.tree[dor];
        if (!byDor) continue;
        const constructeurs = consVals || Object.keys(byDor);
        for (const cons of constructeurs) {
          const ps = byDor[cons];
          if (ps) ps.forEach(p => plaques.add(p));
        }
      }
      return Array.from(plaques).sort();
    }

    case 'zone_arcep':
      return backendVals ?? [];

    case 'techno':
      return backendVals ?? Object.keys(REF_TECHNO_BANDE);

    case 'bande': {
      const allBands = backendVals ?? Object.values(REF_TECHNO_BANDE).flat();
      const technoVals = getFilterValues('techno');
      if (!technoVals) return allBands.sort();
      // Narrow by selected techno
      const bands = new Set<string>();
      for (const t of technoVals) {
        const bs = REF_TECHNO_BANDE[t] || REF_TECHNO_BANDE[t.toLowerCase()];
        if (bs) bs.forEach(b => bands.add(b));
      }
      return bands.size > 0 ? allBands.filter(b => bands.has(b)) : allBands;
    }

    case 'vendor':
      return backendVals ?? [];

    default:
      return backendVals ?? dim.values ?? [];
  }
}

// ── Build backend payload ──
export function buildWhereClause(filters: ActiveFilter[]): FilterWhereClause {
  return {
    and: filters
      .filter(f => f.values.length > 0)
      .map(f => ({ dimension: f.dimension, op: f.op, values: f.values })),
  };
}
