// ── View Filter Helpers ─────────────────────────────────────
// Shared constants and functions for cell-level / site-level filtering

import type { ViewFilterCondition } from '@/components/sites-monitor/ViewFilterBuilder';

// ── Cell-level dimension keys ──
export const CELL_LEVEL_DIMS = new Set([
  'eci', 'pci', 'nci', 'cid', 'tac',
  'nom_cellule', 'bande', 'techno',
  'azimut', 'tilt', 'hba',
  'etat_cellule', 'essentiel',
  'earfcn', 'nrarfcn',
]);

// ── Numeric dimension keys (strict exact match only) ──
export const NUMERIC_DIMS = new Set([
  'eci', 'pci', 'nci', 'cid', 'tac',
  'azimut', 'tilt', 'hba',
  'earfcn', 'nrarfcn',
]);

// ── Site-level dimension keys ──
export const SITE_LEVEL_DIMS = new Set([
  'site_name', 'code_nidt', 'dor', 'plaque',
  'constructeur', 'zone_arcep', 'region', 'vendor',
]);

/** Normalize a value for comparison: trim, lowercase */
function norm(v: string | number | null | undefined): string {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

/** Exact value match — used for numeric dims */
export function valueMatchesExact(
  cellValue: string | number | null | undefined,
  selectedValues: string[],
): boolean {
  const n = norm(cellValue);
  if (!n) return false;
  return selectedValues.some(sv => norm(sv) === n);
}

/** Flexible match — used for text dims (exact OR contains) */
function valueMatchesFlex(
  value: string | number | null | undefined,
  selectedValues: string[],
): boolean {
  const n = norm(value);
  if (!n) return false;
  return selectedValues.some(sv => {
    const s = norm(sv);
    return n === s || n.includes(s) || s.includes(n);
  });
}

/** Check if a single value matches a condition's values using the right strategy */
function valMatchesCond(
  value: string | number | null | undefined,
  condValues: string[],
  dimKey: string,
  operator: string,
): boolean {
  if (operator === 'NOT_IN') {
    const n = norm(value);
    if (!n) return true; // empty doesn't match NOT_IN → passes
    return !condValues.some(cv => norm(cv) === n);
  }
  if (operator === '=' || operator === 'IN') {
    if (NUMERIC_DIMS.has(dimKey)) {
      return valueMatchesExact(value, condValues);
    }
    return valueMatchesFlex(value, condValues);
  }
  // Numeric comparison operators
  const numVal = parseFloat(String(value ?? ''));
  const threshold = parseFloat(condValues[0] ?? '');
  if (isNaN(numVal) || isNaN(threshold)) return false;
  switch (operator) {
    case '>': return numVal > threshold;
    case '>=': return numVal >= threshold;
    case '<': return numVal < threshold;
    case '<=': return numVal <= threshold;
    default: return true;
  }
}

/** Get a dimension value from a site object */
function getSiteValue(site: any, dimKey: string): string {
  if (dimKey === 'site_name') return String(site.site_name ?? '');
  if (dimKey === 'code_nidt') return String(site.code_nidt ?? site.site_id ?? '');
  return String(site[dimKey] ?? '');
}

/** Get a dimension value from a cell object */
function getCellValue(cell: any, dimKey: string): string | number | null {
  return cell[dimKey] ?? null;
}

/**
 * Evaluate whether a site matches ALL view conditions.
 *
 * Key logic:
 * - Site-level conditions are checked against site properties.
 * - Cell-level conditions require that at least ONE cell matches ALL cell-level conditions simultaneously.
 * - If cells are not yet loaded and cell-level conditions exist, return `'pending'`.
 */
export function siteMatchesViewConditions(
  site: any,
  cells: any[],
  conditions: ViewFilterCondition[],
  cellsAttempted: boolean,
): boolean | 'pending' {
  if (conditions.length === 0) return true;

  const siteConds: ViewFilterCondition[] = [];
  const cellConds: ViewFilterCondition[] = [];

  for (const cond of conditions) {
    if (cond.values.length === 0) continue; // skip empty conditions
    if (CELL_LEVEL_DIMS.has(cond.dimension)) {
      cellConds.push(cond);
    } else {
      siteConds.push(cond);
    }
  }

  // 1. Check site-level conditions first
  for (const cond of siteConds) {
    const siteVal = getSiteValue(site, cond.dimension);
    if (!valMatchesCond(siteVal, cond.values, cond.dimension, cond.operator)) {
      return false;
    }
  }

  // 2. If no cell-level conditions, site passes
  if (cellConds.length === 0) return true;

  // 3. Cell-level conditions
  if (cells.length === 0) {
    // No cells loaded yet
    if (cellsAttempted) return false; // attempted but empty → exclude
    return 'pending'; // not attempted → temporary pass-through
  }

  // 4. At least ONE cell must match ALL cell-level conditions
  return cells.some(cell => {
    return cellConds.every(cond => {
      const cellVal = getCellValue(cell, cond.dimension);
      // For site-level dims that also appear in cells, also check site val
      return valMatchesCond(cellVal, cond.values, cond.dimension, cond.operator);
    });
  });
}

/** Check if any conditions target cell-level dimensions */
export function hasAnyCellLevelCondition(conditions: ViewFilterCondition[]): boolean {
  return conditions.some(c => CELL_LEVEL_DIMS.has(c.dimension) && c.values.length > 0);
}
