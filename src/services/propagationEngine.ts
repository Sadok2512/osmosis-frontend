/**
 * COST-231 Hata Propagation Model — Coverage Simulation Engine
 * Computes RSRP grid from a cell site for heatmap overlay.
 */

export interface SimulationParams {
  lat: number;
  lng: number;
  frequency: number;     // MHz (e.g. 700, 1800, 2100, 3500)
  txPower: number;       // dBm (e.g. 43-46)
  antennaHeight: number; // m (HBA)
  antennaGain: number;   // dBi (e.g. 15-18)
  azimuth: number;       // degrees
  beamwidth: number;     // horizontal beamwidth degrees (e.g. 65)
  tilt: number;          // electrical tilt degrees
  rxHeight: number;      // receiver height m (default 1.5)
  radius: number;        // simulation radius in km
  gridSize: number;      // grid resolution (number of points per axis)
  environment: 'urban' | 'suburban' | 'rural';
  techno: '4G' | '5G';
}

export interface CoveragePoint {
  lat: number;
  lng: number;
  rsrp: number; // dBm
  distance: number; // km
}

export interface CoverageGrid {
  points: CoveragePoint[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  params: SimulationParams;
  stats: { minRsrp: number; maxRsrp: number; avgRsrp: number; pointCount: number };
}

// COST-231 Hata path loss model (dB)
function cost231PathLoss(
  freq: number, // MHz
  hb: number,   // base station height m
  hm: number,   // mobile height m
  d: number,    // distance km
  environment: 'urban' | 'suburban' | 'rural'
): number {
  if (d <= 0) return 0;
  
  const f = freq;
  
  // Mobile antenna height correction factor a(hm)
  let ahm: number;
  if (environment === 'urban' && f >= 400) {
    ahm = 3.2 * Math.pow(Math.log10(11.75 * hm), 2) - 4.97;
  } else {
    ahm = (1.1 * Math.log10(f) - 0.7) * hm - (1.56 * Math.log10(f) - 0.8);
  }
  
  // C: metropolitan correction
  const C = environment === 'urban' ? 3 : 0;
  
  // Basic COST-231 Hata formula
  let pathLoss = 46.3 + 33.9 * Math.log10(f) 
    - 13.82 * Math.log10(hb) 
    - ahm 
    + (44.9 - 6.55 * Math.log10(hb)) * Math.log10(d) 
    + C;
  
  // Suburban/rural correction
  if (environment === 'suburban') {
    pathLoss -= 2 * Math.pow(Math.log10(f / 28), 2) + 5.4;
  } else if (environment === 'rural') {
    pathLoss -= 4.78 * Math.pow(Math.log10(f), 2) + 18.33 * Math.log10(f) - 40.94;
  }
  
  return pathLoss;
}

// Antenna horizontal pattern (simplified Gaussian)
function antennaHorizontalGain(
  bearing: number,    // bearing from site to point (degrees)
  azimuth: number,    // antenna azimuth (degrees)
  beamwidth: number   // 3dB beamwidth (degrees)
): number {
  let diff = bearing - azimuth;
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  // Front-to-back ratio ~25dB, 3dB beamwidth pattern
  const Am = 25; // max attenuation dB
  const attenuation = Math.min(12 * Math.pow(diff / beamwidth, 2), Am);
  return -attenuation;
}

// Vertical pattern (simplified)
function antennaVerticalGain(
  elevAngle: number, // elevation angle degrees
  tilt: number       // electrical downtilt degrees
): number {
  const vertBW = 7; // typical vertical beamwidth degrees
  const diff = elevAngle - tilt;
  const SLA = 20; // side-lobe attenuation dB
  const attenuation = Math.min(12 * Math.pow(diff / vertBW, 2), SLA);
  return -attenuation;
}

// Bearing between two lat/lng points (degrees 0-360)
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) 
    - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Haversine distance in km
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Run the coverage simulation and return a grid of RSRP values.
 */
export function simulateCoverage(params: SimulationParams): CoverageGrid {
  const {
    lat, lng, frequency, txPower, antennaHeight, antennaGain,
    azimuth, beamwidth, tilt, rxHeight, radius, gridSize, environment
  } = params;
  
  // Convert radius from km to approximate lat/lng delta
  const latDelta = radius / 111.32;
  const lngDelta = radius / (111.32 * Math.cos(lat * Math.PI / 180));
  
  const bounds = {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
  
  const points: CoveragePoint[] = [];
  let minRsrp = Infinity, maxRsrp = -Infinity, sumRsrp = 0;
  
  const latStep = (bounds.maxLat - bounds.minLat) / gridSize;
  const lngStep = (bounds.maxLng - bounds.minLng) / gridSize;
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const pLat = bounds.minLat + i * latStep;
      const pLng = bounds.minLng + j * lngStep;
      
      const d = distKm(lat, lng, pLat, pLng);
      if (d < 0.01 || d > radius) continue; // skip center and out of range
      
      // Path loss
      const pl = cost231PathLoss(frequency, antennaHeight, rxHeight, d, environment);
      
      // Antenna pattern gains
      const brng = bearing(lat, lng, pLat, pLng);
      const hGain = antennaHorizontalGain(brng, azimuth, beamwidth);
      
      // Elevation angle (simplified flat earth)
      const heightDiff = antennaHeight - rxHeight;
      const elevAngle = Math.atan2(heightDiff, d * 1000) * 180 / Math.PI;
      const vGain = antennaVerticalGain(elevAngle, tilt);
      
      // EIRP = TxPower + AntennaGain + pattern
      const eirp = txPower + antennaGain + hGain + vGain;
      
      // RSRP = EIRP - PathLoss
      const rsrp = eirp - pl;
      
      // Clamp to realistic range
      const clampedRsrp = Math.max(-140, Math.min(-44, rsrp));
      
      points.push({ lat: pLat, lng: pLng, rsrp: clampedRsrp, distance: d });
      
      minRsrp = Math.min(minRsrp, clampedRsrp);
      maxRsrp = Math.max(maxRsrp, clampedRsrp);
      sumRsrp += clampedRsrp;
    }
  }
  
  return {
    points,
    bounds,
    params,
    stats: {
      minRsrp,
      maxRsrp,
      avgRsrp: points.length > 0 ? sumRsrp / points.length : 0,
      pointCount: points.length,
    },
  };
}

/**
 * RSRP → color mapping (telecom-standard colors)
 */
export function rsrpToColor(rsrp: number, opacity = 0.6): string {
  if (rsrp >= -75) return `rgba(0, 180, 0, ${opacity})`;        // Excellent — green
  if (rsrp >= -85) return `rgba(100, 200, 0, ${opacity})`;      // Very good — lime
  if (rsrp >= -95) return `rgba(255, 200, 0, ${opacity})`;      // Good — yellow
  if (rsrp >= -105) return `rgba(255, 140, 0, ${opacity})`;     // Fair — orange
  if (rsrp >= -115) return `rgba(255, 60, 0, ${opacity})`;      // Poor — red-orange
  if (rsrp >= -125) return `rgba(200, 0, 0, ${opacity})`;       // Very poor — red
  return `rgba(100, 0, 0, ${opacity})`;                          // No coverage — dark red
}

export const RSRP_LEGEND = [
  { label: '≥ -75 dBm', color: 'rgb(0, 180, 0)', quality: 'Excellent' },
  { label: '-75 to -85', color: 'rgb(100, 200, 0)', quality: 'Très bon' },
  { label: '-85 to -95', color: 'rgb(255, 200, 0)', quality: 'Bon' },
  { label: '-95 to -105', color: 'rgb(255, 140, 0)', quality: 'Moyen' },
  { label: '-105 to -115', color: 'rgb(255, 60, 0)', quality: 'Faible' },
  { label: '-115 to -125', color: 'rgb(200, 0, 0)', quality: 'Très faible' },
  { label: '< -125 dBm', color: 'rgb(100, 0, 0)', quality: 'Hors couverture' },
];

/** Default simulation parameters by technology */
export function getDefaultParams(techno: '4G' | '5G', band?: string): Partial<SimulationParams> {
  const is5G = techno === '5G';
  const freq = band?.includes('3500') || band?.includes('NR3500') ? 3500
    : band?.includes('2100') || band?.includes('NR2100') ? 2100
    : band?.includes('1800') ? 1800
    : band?.includes('800') ? 800
    : band?.includes('700') || band?.includes('NR700') ? 700
    : band?.includes('2600') ? 2600
    : is5G ? 3500 : 1800;

  return {
    frequency: freq,
    txPower: is5G ? 46 : 43,
    antennaGain: is5G ? 25 : 18,
    beamwidth: is5G && freq >= 3500 ? 90 : 65,
    tilt: is5G ? 6 : 4,
    rxHeight: 1.5,
    radius: freq >= 3500 ? 2 : freq >= 1800 ? 5 : 10,
    gridSize: 80,
    environment: 'urban' as const,
    techno,
  };
}
