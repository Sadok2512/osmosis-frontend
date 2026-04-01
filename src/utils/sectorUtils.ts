/**
 * Sector mapping utilities for telecom cell-to-sector assignment.
 *
 * Priority:
 *   1. Use the backend-provided `secteur` field if present.
 *   2. Group by azimuth (cells sharing the same azimuth belong to the same sector).
 *   3. Fallback: last digit of the cell name.
 */

import type { CellProperties } from '@/types';

/** Extract sector number from the last character of a cell name/id */
export const getSectorNumberFromName = (cellId: string): number => {
  const lastChar = cellId.slice(-1);
  const n = parseInt(lastChar, 10);
  return isNaN(n) ? 0 : n;
};

/**
 * Determine sector number for a single cell.
 * Prefers `secteur` field, then azimuth-based mapping, then last-digit fallback.
 */
export const getSectorNumber = (
  cellId: string,
  cell?: { secteur?: number | string | null; azimut?: number | null },
  azimuthToSector?: Map<number, number>,
): number => {
  // 1. Backend-provided sector
  if (cell?.secteur != null && cell.secteur !== '') {
    const n = typeof cell.secteur === 'number' ? cell.secteur : parseInt(String(cell.secteur), 10);
    if (!isNaN(n) && n > 0) return n;
  }
  // 2. Azimuth-based mapping (if caller provides lookup)
  if (azimuthToSector && cell?.azimut != null) {
    const mapped = azimuthToSector.get(cell.azimut);
    if (mapped != null) return mapped;
  }
  // 3. Last digit fallback
  return getSectorNumberFromName(cellId);
};

/**
 * Build a azimuth → sector number mapping from a list of cells.
 * Unique azimuths are sorted and assigned sector numbers 1, 2, 3…
 */
export const buildAzimuthSectorMap = (cells: Array<{ azimut?: number | null }>): Map<number, number> => {
  const uniqueAz = [...new Set(
    cells
      .map(c => c.azimut)
      .filter((a): a is number => a != null && Number.isFinite(a))
  )].sort((a, b) => a - b);
  const map = new Map<number, number>();
  uniqueAz.forEach((az, i) => map.set(az, i + 1));
  return map;
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
  const azMap = buildAzimuthSectorMap(cells);
  const sectorMap = new Map<number, CellProperties[]>();

  for (const cell of cells) {
    const sn = getSectorNumber(cell.cell_id, cell as any, azMap);
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

  const missingSectors: number[] = [];
  for (let i = 1; i <= maxSector; i++) {
    if (!sectorMap.has(i)) missingSectors.push(i);
  }

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
