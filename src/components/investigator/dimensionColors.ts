/**
 * Centralized dimension color mapping for the Investigator UI.
 * Each dimension has a unique, fixed color used consistently across
 * KPI chips, dimension chips, split badges, and graph legends.
 */

export interface DimensionColor {
  bg: string;       // e.g. 'bg-amber-500/15'
  text: string;     // e.g. 'text-amber-600'
  textDark: string; // e.g. 'dark:text-amber-400'
  border: string;   // e.g. 'border-amber-500/20'
  bgActive: string; // When filter has values
  textActive: string;
  /** Raw hex for inline style (graph legends) */
  hex: string;
}

const DIMENSION_COLOR_PALETTE: Record<string, DimensionColor> = {
  // ── PM Dimensions ──
  PMQAP: {
    bg: 'bg-amber-500/15', text: 'text-amber-600', textDark: 'dark:text-amber-400',
    border: 'border-amber-500/20', bgActive: 'bg-amber-500/15', textActive: 'text-amber-700',
    hex: '#f59e0b',
  },
  FLEX: {
    bg: 'bg-violet-500/15', text: 'text-violet-600', textDark: 'dark:text-violet-400',
    border: 'border-violet-500/20', bgActive: 'bg-violet-500/15', textActive: 'text-violet-700',
    hex: '#8b5cf6',
  },
  NEIGHBOR: {
    bg: 'bg-rose-500/15', text: 'text-rose-600', textDark: 'dark:text-rose-400',
    border: 'border-rose-500/20', bgActive: 'bg-rose-500/15', textActive: 'text-rose-700',
    hex: '#f43f5e',
  },
  RANSHARE: {
    bg: 'bg-cyan-500/15', text: 'text-cyan-600', textDark: 'dark:text-cyan-400',
    border: 'border-cyan-500/20', bgActive: 'bg-cyan-500/15', textActive: 'text-cyan-700',
    hex: '#06b6d4',
  },
  SLICE: {
    bg: 'bg-indigo-500/15', text: 'text-indigo-600', textDark: 'dark:text-indigo-400',
    border: 'border-indigo-500/20', bgActive: 'bg-indigo-500/15', textActive: 'text-indigo-700',
    hex: '#6366f1',
  },
  '5QI': {
    bg: 'bg-pink-500/15', text: 'text-pink-600', textDark: 'dark:text-pink-400',
    border: 'border-pink-500/20', bgActive: 'bg-pink-500/15', textActive: 'text-pink-700',
    hex: '#ec4899',
  },
  TRANSPORT: {
    bg: 'bg-lime-500/15', text: 'text-lime-600', textDark: 'dark:text-lime-400',
    border: 'border-lime-500/20', bgActive: 'bg-lime-500/15', textActive: 'text-lime-700',
    hex: '#84cc16',
  },
  CA_REL: {
    bg: 'bg-orange-500/15', text: 'text-orange-600', textDark: 'dark:text-orange-400',
    border: 'border-orange-500/20', bgActive: 'bg-orange-500/15', textActive: 'text-orange-700',
    hex: '#f97316',
  },

  // ── Standard Dimensions ──
  Site: {
    bg: 'bg-emerald-500/15', text: 'text-emerald-600', textDark: 'dark:text-emerald-400',
    border: 'border-emerald-500/20', bgActive: 'bg-emerald-500/15', textActive: 'text-emerald-700',
    hex: '#10b981',
  },
  Cell: {
    bg: 'bg-sky-500/15', text: 'text-sky-600', textDark: 'dark:text-sky-400',
    border: 'border-sky-500/20', bgActive: 'bg-sky-500/15', textActive: 'text-sky-700',
    hex: '#0ea5e9',
  },
  CELL: {
    bg: 'bg-sky-500/15', text: 'text-sky-600', textDark: 'dark:text-sky-400',
    border: 'border-sky-500/20', bgActive: 'bg-sky-500/15', textActive: 'text-sky-700',
    hex: '#0ea5e9',
  },
  SITE: {
    bg: 'bg-emerald-500/15', text: 'text-emerald-600', textDark: 'dark:text-emerald-400',
    border: 'border-emerald-500/20', bgActive: 'bg-emerald-500/15', textActive: 'text-emerald-700',
    hex: '#10b981',
  },
  Vendor: {
    bg: 'bg-blue-500/15', text: 'text-blue-600', textDark: 'dark:text-blue-400',
    border: 'border-blue-500/20', bgActive: 'bg-blue-500/15', textActive: 'text-blue-700',
    hex: '#3b82f6',
  },
  VENDOR: {
    bg: 'bg-blue-500/15', text: 'text-blue-600', textDark: 'dark:text-blue-400',
    border: 'border-blue-500/20', bgActive: 'bg-blue-500/15', textActive: 'text-blue-700',
    hex: '#3b82f6',
  },
  Technology: {
    bg: 'bg-purple-500/15', text: 'text-purple-600', textDark: 'dark:text-purple-400',
    border: 'border-purple-500/20', bgActive: 'bg-purple-500/15', textActive: 'text-purple-700',
    hex: '#a855f7',
  },
  TECHNO: {
    bg: 'bg-purple-500/15', text: 'text-purple-600', textDark: 'dark:text-purple-400',
    border: 'border-purple-500/20', bgActive: 'bg-purple-500/15', textActive: 'text-purple-700',
    hex: '#a855f7',
  },
  Band: {
    bg: 'bg-teal-500/15', text: 'text-teal-600', textDark: 'dark:text-teal-400',
    border: 'border-teal-500/20', bgActive: 'bg-teal-500/15', textActive: 'text-teal-700',
    hex: '#14b8a6',
  },
  BAND: {
    bg: 'bg-teal-500/15', text: 'text-teal-600', textDark: 'dark:text-teal-400',
    border: 'border-teal-500/20', bgActive: 'bg-teal-500/15', textActive: 'text-teal-700',
    hex: '#14b8a6',
  },
  DOR: {
    bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600', textDark: 'dark:text-fuchsia-400',
    border: 'border-fuchsia-500/20', bgActive: 'bg-fuchsia-500/15', textActive: 'text-fuchsia-700',
    hex: '#d946ef',
  },
  Plaque: {
    bg: 'bg-yellow-500/15', text: 'text-yellow-600', textDark: 'dark:text-yellow-400',
    border: 'border-yellow-500/20', bgActive: 'bg-yellow-500/15', textActive: 'text-yellow-700',
    hex: '#eab308',
  },
  PLAQUE: {
    bg: 'bg-yellow-500/15', text: 'text-yellow-600', textDark: 'dark:text-yellow-400',
    border: 'border-yellow-500/20', bgActive: 'bg-yellow-500/15', textActive: 'text-yellow-700',
    hex: '#eab308',
  },
  'Zone ARCEP': {
    bg: 'bg-red-500/15', text: 'text-red-600', textDark: 'dark:text-red-400',
    border: 'border-red-500/20', bgActive: 'bg-red-500/15', textActive: 'text-red-700',
    hex: '#ef4444',
  },
  ARCEP: {
    bg: 'bg-red-500/15', text: 'text-red-600', textDark: 'dark:text-red-400',
    border: 'border-red-500/20', bgActive: 'bg-red-500/15', textActive: 'text-red-700',
    hex: '#ef4444',
  },
};

/** Fallback for unknown dimensions */
const DEFAULT_COLOR: DimensionColor = {
  bg: 'bg-slate-500/15', text: 'text-slate-600', textDark: 'dark:text-slate-400',
  border: 'border-slate-500/20', bgActive: 'bg-slate-500/15', textActive: 'text-slate-700',
  hex: '#64748b',
};

/**
 * Get a consistent color for a dimension key.
 * Handles PM_DIM: prefix (e.g. "PM_DIM:PMQAP" → PMQAP).
 */
export function getDimensionColor(dimKey: string): DimensionColor {
  // Strip PM_DIM: prefix
  const normalized = dimKey.startsWith('PM_DIM:') ? dimKey.slice(7) : dimKey;
  return DIMENSION_COLOR_PALETTE[normalized] || DEFAULT_COLOR;
}

/** Check if a dimension is a PM type */
export function isPmDimension(dim: string): boolean {
  const pm = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);
  const normalized = dim.startsWith('PM_DIM:') ? dim.slice(7) : dim;
  return pm.has(normalized);
}
