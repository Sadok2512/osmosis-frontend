/**
 * Sector mapping utilities for telecom cell-to-sector assignment.
 *
 * Rule: The last digit of the cell name (nom_cellule / cell_id) determines the sector number.
 * Example: CHAMBERY_COTE_ROUSSE_TDF_Y1 → Sector 1
 *          CHAMBERY_COTE_ROUSSE_TDF_T3 → Sector 3
 */

import type { CellProperties } from '@/types';

/** Extract sector number from cell name/id.
 * Tries multiple conventions:
 * 1. Explicit _S{n}_ pattern (e.g. SITE_LTE_S2_L800 → 2)
 * 2. Letter+digit before band suffix (e.g. SITE_TDF_Y1 → 1, SITE_F3 → 3)
 * 3. Last digit fallback
 */
export const getSectorNumber = (cellId: string): number => {
  // 1. Look for explicit _S{digit}_ or _S{digit} at end
  const sMatch = cellId.match(/_S(\d)(?:_|$)/i);
  if (sMatch) return parseInt(sMatch[1], 10);

  // 2. Letter+digit pattern: find the LAST occurrence of a letter followed by a single digit
  //    that represents the sector (e.g. Y1, T3, F2, ENB1_E2 → picks E2 not B1)
  const allMatches = [...cellId.matchAll(/[A-Za-z](\d)(?:_|$)/g)];
  if (allMatches.length > 0) {
    const lastMatch = allMatches[allMatches.length - 1];
    return parseInt(lastMatch[1], 10);
  }

  // 3. Fallback: last digit
  const lastChar = cellId.slice(-1);
  const n = parseInt(lastChar, 10);
  return isNaN(n) ? 0 : n;
};

export interface SectorGroup {
  sectorNumber: number;
  cells: CellProperties[];
}

export interface SectorValidation {
  status: 'OK' | 'MISSING_SECTOR' | 'DUPLICATE_SECTOR';
  missingSectors: number[];
  duplicates: { sectorNumber: number; count: number }[];
  totalSectors: number;
}

/** Group cells by sector number and validate */
export const groupCellsBySector = (cells: CellProperties[]): {
  sectors: SectorGroup[];
  validation: SectorValidation;
} => {
  const sectorMap = new Map<number, CellProperties[]>();

  for (const cell of cells) {
    const sn = getSectorNumber(cell.cell_id);
    if (!sectorMap.has(sn)) sectorMap.set(sn, []);
    sectorMap.get(sn)!.push(cell);
  }

  // Build sorted sector groups
  const sectors: SectorGroup[] = Array.from(sectorMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sectorNumber, cells]) => ({ sectorNumber, cells }));

  // Validation
  const sectorNumbers = Array.from(sectorMap.keys()).sort((a, b) => a - b);
  const maxSector = sectorNumbers.length > 0 ? Math.max(...sectorNumbers) : 0;

  // Check for missing sectors (1..N)
  const missingSectors: number[] = [];
  for (let i = 1; i <= maxSector; i++) {
    if (!sectorMap.has(i)) missingSectors.push(i);
  }

  // Check for duplicate sector numbers (same sector number appearing in multiple cells with same band)
  const duplicates: { sectorNumber: number; count: number }[] = [];
  for (const [sn, group] of sectorMap.entries()) {
    const bands = group.map(c => c.bande);
    const uniqueBands = new Set(bands);
    if (bands.length > uniqueBands.size) {
      duplicates.push({ sectorNumber: sn, count: bands.length - uniqueBands.size });
    }
  }

  const status: SectorValidation['status'] =
    duplicates.length > 0 ? 'DUPLICATE_SECTOR' :
    missingSectors.length > 0 ? 'MISSING_SECTOR' : 'OK';

  return {
    sectors,
    validation: {
      status,
      missingSectors,
      duplicates,
      totalSectors: sectorNumbers.length,
    },
  };
};
