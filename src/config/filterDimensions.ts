// ── Filter Dimensions Configuration ─────────────────────────────────
// Generated from the optimized JSON specification v1.0

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

// ── Dimension definitions ──
export const FILTER_DIMENSIONS: DimensionDef[] = [
  { key: 'dor', label: 'DOR', type: 'enum', multi: true, depends_on: [] },
  { key: 'constructeur', label: 'Constructeur', type: 'enum', multi: true, depends_on: ['dor'] },
  { key: 'plaque', label: 'Plaque', type: 'enum', multi: true, depends_on: ['dor', 'constructeur'] },
  { key: 'zone_arcep', label: 'Zone ARCEP', type: 'enum', multi: true, depends_on: [], values: ['top15', 'rural', 'Intermidiare', 'AXE', 'TGV'] },
  { key: 'techno', label: 'Techno', type: 'enum', multi: true, depends_on: [], values: ['4g', '5g'] },
  { key: 'bande', label: 'Bande', type: 'enum', multi: true, depends_on: ['techno'] },
  { key: 'saisonnier', label: 'Saisonnier', type: 'enum', multi: true, depends_on: [], values: ['Essentiel', 'Hiver', 'Eté', 'Sites stratégiques'] },
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
// Given the current active filters, resolve available values for a dimension
export function resolveAvailableValues(
  dimensionKey: string,
  activeFilters: ActiveFilter[]
): string[] {
  const dim = FILTER_DIMENSIONS.find(d => d.key === dimensionKey);
  if (!dim) return [];

  // Static values with no dependencies
  if (dim.values && dim.depends_on.length === 0) {
    return dim.values;
  }

  const getFilterValues = (key: string): string[] | null => {
    const f = activeFilters.find(af => af.dimension === key);
    return f && f.values.length > 0 ? f.values : null;
  };

  switch (dimensionKey) {
    case 'dor':
      return REF_DOR_TREE.dors;

    case 'constructeur': {
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

    case 'bande': {
      const technoVals = getFilterValues('techno');
      const technos = technoVals || Object.keys(REF_TECHNO_BANDE);
      const bands = new Set<string>();
      for (const t of technos) {
        const bs = REF_TECHNO_BANDE[t];
        if (bs) bs.forEach(b => bands.add(b));
      }
      return Array.from(bands).sort();
    }

    default:
      return dim.values || [];
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
