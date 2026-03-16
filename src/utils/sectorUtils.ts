/**
 * Sector mapping utilities for telecom cell-to-sector assignment.
 *
 * Rule: The last digit of the cell name (nom_cellule / cell_id) determines the sector number.
 * Example: CHAMBERY_COTE_ROUSSE_TDF_Y1 → Sector 1
 *          CHAMBERY_COTE_ROUSSE_TDF_T3 → Sector 3
 */

import type { CellProperties } from '@/types';

/** Extract sector number from the last character of a cell name/id */
export const getSectorNumber = (cellId: string): number => {
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
