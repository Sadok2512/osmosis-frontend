/**
 * Neighbor visualization types and mock data
 */

export type NeighborRelationType = 'intra_freq' | 'inter_freq' | 'inter_system';
export type NeighborDirection = 'out' | 'in';

export interface CellNeighbor {
  targetCellId: string;
  targetSiteName: string;
  targetCoords: [number, number]; // [lat, lng]
  targetAzimut: number;
  targetTechno: string;
  targetBande: string;
  relationDirection: NeighborDirection;
  relationType: NeighborRelationType;
}

export const NEIGHBOR_COLORS: Record<NeighborRelationType, string> = {
  intra_freq: '#3b82f6',   // blue
  inter_freq: '#f59e0b',   // amber
  inter_system: '#8b5cf6', // purple
};

export const NEIGHBOR_LABELS: Record<NeighborRelationType, string> = {
  intra_freq: 'Intra-fréquence',
  inter_freq: 'Inter-fréquence',
  inter_system: 'Inter-système',
};

/**
 * Generate mock neighbors for a given cell based on nearby sites
 */
export function generateMockNeighbors(
  cellId: string,
  sourceSiteCoords: [number, number],
  nearbySites: { site_id: string; site_name: string; coordinates: [number, number]; cells: { cell_id: string; techno: string; bande: string; azimut: number }[] }[],
): CellNeighbor[] {
  const neighbors: CellNeighbor[] = [];
  const types: NeighborRelationType[] = ['intra_freq', 'inter_freq', 'inter_system'];
  
  // Pick up to 12 neighbors from nearby sites
  let count = 0;
  for (const site of nearbySites) {
    if (count >= 12) break;
    for (const cell of site.cells) {
      if (count >= 12) break;
      if (cell.cell_id === cellId) continue;
      
      // Deterministic type based on cell_id hash
      let hash = 0;
      for (let i = 0; i < cell.cell_id.length; i++) {
        hash = ((hash << 5) - hash) + cell.cell_id.charCodeAt(i);
        hash |= 0;
      }
      const typeIdx = Math.abs(hash) % 3;
      const dirIdx = Math.abs(hash >> 3) % 2;
      
      neighbors.push({
        targetCellId: cell.cell_id,
        targetSiteName: site.site_name,
        targetCoords: site.coordinates,
        targetAzimut: cell.azimut,
        targetTechno: cell.techno,
        targetBande: cell.bande,
        relationDirection: dirIdx === 0 ? 'out' : 'in',
        relationType: types[typeIdx],
      });
      count++;
    }
  }
  
  return neighbors;
}
