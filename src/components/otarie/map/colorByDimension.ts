/**
 * "View by Color" — deterministic color palette for any dimension.
 * Maps arbitrary string values → stable hex colors.
 */

export type ColorViewMode = 'none' | 'vendor' | 'dor' | 'plaque' | 'tech';

export const COLOR_VIEW_LABELS: Record<ColorViewMode, string> = {
  none: 'Par défaut',
  vendor: 'Constructeur',
  dor: 'DOR',
  plaque: 'Plaque',
  tech: 'Technologie',
};

// Deterministic palette — enough contrast for up to ~20 values
const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#10b981',
  '#e11d48', '#0ea5e9', '#a855f7', '#84cc16', '#06b6d4',
  '#d946ef', '#eab308', '#64748b', '#78716c', '#0284c7',
];

const FALLBACK_COLOR = '#94a3b8'; // muted gray for unknown

/** Stable hash → palette index */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Build a value→color map for all unique values of a dimension */
export function buildColorMap(values: string[]): Record<string, string> {
  const sorted = [...new Set(values)].sort();
  const map: Record<string, string> = {};
  sorted.forEach((v, i) => {
    map[v] = i < PALETTE.length ? PALETTE[i] : PALETTE[hashStr(v) % PALETTE.length];
  });
  return map;
}

/** Extract dimension value from a site object */
export function getSiteDimensionValue(
  site: { vendor?: string; dor?: string; plaque?: string; cells?: any[]; technos?: string[] },
  mode: ColorViewMode
): string {
  switch (mode) {
    case 'vendor':
      return site.vendor || 'Inconnu';
    case 'dor':
      return site.dor || 'Inconnu';
    case 'plaque':
      return site.plaque || 'Inconnu';
    case 'tech': {
      const technos = site.technos || [];
      const cells = site.cells || [];
      const has5G = technos.some((t: string) => t?.toUpperCase().includes('5G') || t?.toUpperCase().startsWith('NR'))
        || cells.some((c: any) => c.techno?.toUpperCase().includes('5G') || c.techno?.toUpperCase().startsWith('NR'));
      const has4G = technos.some((t: string) => t?.toUpperCase().includes('4G') || t?.toUpperCase().startsWith('LTE'))
        || cells.some((c: any) => c.techno?.toUpperCase().includes('4G') || c.techno?.toUpperCase().startsWith('LTE'));
      if (has5G && has4G) return 'Mixte 4G+5G';
      if (has5G) return '5G';
      if (has4G) return '4G';
      return 'Inconnu';
    }
    default:
      return 'Inconnu';
  }
}

/** Get color for a specific dimension value using a pre-built color map */
export function getColorForValue(value: string, colorMap: Record<string, string>): string {
  return colorMap[value] || FALLBACK_COLOR;
}
