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
  { key: 'dr', label: 'DR', type: 'enum', multi: true, depends_on: ['dor'] },
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

// ── Contextual filter cache ──
// When parent filters change, we fetch narrowed values from backend
// Key = serialized context params, Value = { dimId → values[] }
const _contextCache = new Map<string, Record<string, string[]>>();
const _contextPending = new Map<string, Promise<void>>();

function buildContextKey(activeFilters: ActiveFilter[]): string {
  const relevant = activeFilters
    .filter(f => f.values.length > 0 && ['dor', 'constructeur', 'techno', 'bande'].includes(f.dimension))
    .sort((a, b) => a.dimension.localeCompare(b.dimension));
  if (relevant.length === 0) return '';
  return relevant.map(f => `${f.dimension}=${f.values.join(',')}`).join('&');
}

/**
 * Trigger a contextual fetch for filtered values.
 * Call this from React components — it returns true when data is ready.
 */
export function loadContextFilters(activeFilters: ActiveFilter[]): boolean {
  const key = buildContextKey(activeFilters);
  if (key === '') return true; // no context → use base cache
  if (_contextCache.has(key)) return true;
  if (!_contextPending.has(key)) {
    const promise = topoApi.filters(key)
      .then(resp => {
        const map: Record<string, string[]> = {};
        for (const f of resp.filters ?? []) {
          map[f.id] = f.values ?? [];
        }
        _contextCache.set(key, map);
      })
      .catch(err => {
        console.warn('[filterDimensions] Context filter fetch failed', err);
      })
      .finally(() => _contextPending.delete(key));
    _contextPending.set(key, promise);
  }
  return false;
}

function getContextValues(dimensionKey: string, activeFilters: ActiveFilter[]): string[] | null {
  const key = buildContextKey(activeFilters);
  if (key === '') return null; // no context
  return _contextCache.get(key)?.[dimensionKey] ?? null;
}

// ── Dependency resolver ──
// Uses contextual backend cache > base backend cache > static refs
export function resolveAvailableValues(
  dimensionKey: string,
  activeFilters: ActiveFilter[]
): string[] {
  const dim = FILTER_DIMENSIONS.find(d => d.key === dimensionKey);
  if (!dim) return [];

  const baseVals = getBackendFilterValues(dimensionKey);
  const contextVals = getContextValues(dimensionKey, activeFilters);

  // For dimensions with parent context, prefer contextual values
  const backendVals = contextVals ?? baseVals;

  switch (dimensionKey) {
    case 'dor':
      return backendVals ?? REF_DOR_TREE.dors;

    case 'constructeur':
      return backendVals ?? Array.from(
        new Set(Object.values(REF_DOR_TREE.tree).flatMap(byDor => Object.keys(byDor)))
      ).sort();

    case 'plaque':
      return backendVals ?? Array.from(
        new Set(Object.values(REF_DOR_TREE.tree).flatMap(byDor =>
          Object.values(byDor).flat()
        ))
      ).sort();

    case 'zone_arcep':
      return backendVals ?? [];

    case 'techno':
      return backendVals ?? Object.keys(REF_TECHNO_BANDE);

    case 'bande':
      return backendVals ?? Object.values(REF_TECHNO_BANDE).flat().sort();

    case 'vendor':
      return backendVals ?? [];

    default:
      return backendVals ?? dim.values ?? [];
  }
}

// ── Search-based dimension helpers (site, cell) ──
// These dimensions have too many values for a static dropdown.
// They use /topo/sites?search=X and /topo/cells?search=X with context filters.

export function isSearchDimension(key: string): boolean {
  return key === 'site' || key === 'cell';
}

export async function searchDimensionValues(
  dimensionKey: string,
  search: string,
  contextFilters: ActiveFilter[],
): Promise<string[]> {
  if (!search || search.length < 2) return [];
  const qs = new URLSearchParams();
  qs.set('search', search);
  qs.set('limit', '50');
  // Pass parent filters as context
  for (const f of contextFilters) {
    if (f.values.length > 0 && f.dimension !== dimensionKey) {
      qs.set(f.dimension, f.values.join(','));
    }
  }

  if (dimensionKey === 'site') {
    const rows = await topoApi.filteredSites(qs.toString());
    return (Array.isArray(rows) ? rows : []).map((r: any) => r.site_name).filter(Boolean);
  }
  if (dimensionKey === 'cell') {
    const rows = await topoApi.filteredSites(qs.toString());
    return (Array.isArray(rows) ? rows : [])
      .flatMap((r: any) => r.cell_name ? [r.cell_name] : [])
      .filter(Boolean);
  }
  return [];
}

// ── Build backend payload ──
export function buildWhereClause(filters: ActiveFilter[]): FilterWhereClause {
  return {
    and: filters
      .filter(f => f.values.length > 0)
      .map(f => ({ dimension: f.dimension, op: f.op, values: f.values })),
  };
}
