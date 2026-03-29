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
  distanceKm: number;       // distance between source and target in km
  hoCount: number;           // Number of handovers
  hoSuccessRate: number;     // Handover success rate (%)
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

/** Haversine distance in km */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Generate mock neighbors for a given cell based on nearby sites.
 * Now generates more neighbors (up to 20), includes distance, HO count, HO SR,
 * and ensures a mix of LTE and NR technos.
 */
export function generateMockNeighbors(
  cellId: string,
  sourceSiteCoords: [number, number],
  nearbySites: { site_id: string; site_name: string; coordinates: [number, number]; cells: { cell_id: string; techno: string; bande: string; azimut: number }[] }[],
): CellNeighbor[] {
  const neighbors: CellNeighbor[] = [];
  const types: NeighborRelationType[] = ['intra_freq', 'inter_freq', 'inter_system'];
  
  // Pick up to 20 neighbors from nearby sites
  let count = 0;
  for (const site of nearbySites) {
    if (count >= 20) break;
    for (const cell of site.cells) {
      if (count >= 20) break;
      if (cell.cell_id === cellId) continue;
      
      // Deterministic hash based on cell_id
      let hash = 0;
      for (let i = 0; i < cell.cell_id.length; i++) {
        hash = ((hash << 5) - hash) + cell.cell_id.charCodeAt(i);
        hash |= 0;
      }
      const typeIdx = Math.abs(hash) % 3;
      const dirIdx = Math.abs(hash >> 3) % 2;
      
      const dist = haversineKm(sourceSiteCoords, site.coordinates);
      
      // Mock HO count: 50–2000 depending on hash
      const hoCount = 50 + Math.abs(hash >> 5) % 1950;
      // Mock HO success rate: 85–100%
      const hoSR = 85 + (Math.abs(hash >> 8) % 1500) / 100;
      
      neighbors.push({
        targetCellId: cell.cell_id,
        targetSiteName: site.site_name,
        targetCoords: site.coordinates,
        targetAzimut: cell.azimut,
        targetTechno: cell.techno,
        targetBande: cell.bande,
        relationDirection: dirIdx === 0 ? 'out' : 'in',
        relationType: types[typeIdx],
        distanceKm: Math.round(dist * 100) / 100,
        hoCount,
        hoSuccessRate: Math.round(hoSR * 10) / 10,
      });
      count++;
    }
  }
  
  return neighbors;
}
