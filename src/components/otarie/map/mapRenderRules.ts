/**
 * Centralized zoom thresholds and rendering rules for the map.
 * Avoids duplicated zoom logic across the codebase.
 */

// ── Zoom thresholds ──
/** Zoom level at which we switch FROM sites TO cells/sectors */
export const SITES_TO_CELLS_ZOOM = 9;
/** Zoom level at which we switch FROM cells/sectors back TO sites */
export const CELLS_TO_SITES_ZOOM = 7;
/** Zoom level at which mini-sectors appear */
export const MINI_SECTOR_ZOOM = 7;
/** Zoom level at which site name labels appear automatically */
export const AUTO_LABEL_ZOOM = 14;

// ── France defaults ──
export const FRANCE_CENTER: [number, number] = [46.6, 2.2];
export const FRANCE_DEFAULT_ZOOM = 6;

// ── Rendering caps ──
export const MAX_RENDER_SITES = 5000;

/** Allowed 4G/5G technology strings for sector filtering */
export const ALLOWED_TECH_SET = new Set(['4G', '5G', 'LTE', 'NR', '4g', '5g', 'lte', 'nr']);

/** Determine if a techno string represents 5G */
export const is5GTech = (techno?: string | null): boolean => {
  const tech = String(techno || '').toUpperCase();
  return tech.includes('5G') || tech.includes('NR');
};

/** Determine if a techno string represents 4G */
export const is4GTech = (techno?: string | null): boolean => {
  const tech = String(techno || '').toUpperCase();
  return !is5GTech(tech) && (tech.includes('4G') || tech.includes('LTE'));
};

/** Filter cells to only 4G/5G */
export const filter4G5GCells = (cells: any[]): any[] =>
  cells.filter(c => !c.techno || ALLOWED_TECH_SET.has(String(c.techno).trim()));

/** Determine display mode based on current zoom with hysteresis */
export const resolveDisplayMode = (
  zoom: number,
  previousMode: 'sites' | 'cells',
): 'sites' | 'cells' => {
  if (zoom >= SITES_TO_CELLS_ZOOM) return 'cells';
  if (zoom <= CELLS_TO_SITES_ZOOM) return 'sites';
  return previousMode;
};
