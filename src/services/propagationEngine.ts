/**
 * Enhanced RF Propagation Engine — COST-231 Hata + Shadow Fading + Terrain Diffraction
 * Generates realistic non-circular coverage with irregular edges.
 */

export interface SimulationParams {
  lat: number;
  lng: number;
  frequency: number;     // MHz
  txPower: number;       // dBm
  antennaHeight: number; // m (HBA)
  antennaGain: number;   // dBi
  azimuth: number;       // degrees
  beamwidth: number;     // horizontal beamwidth degrees
  tilt: number;          // electrical tilt degrees
  mechanicalTilt?: number; // mechanical tilt degrees
  rxHeight: number;      // receiver height m
  radius: number;        // simulation radius in km
  gridSize: number;      // grid resolution (points per axis)
  environment: 'urban' | 'suburban' | 'rural';
  techno: '4G' | '5G';
  bandwidth?: number;    // MHz (for NR capacity)
  cableLoss?: number;    // dB (feeder loss)
  bodyLoss?: number;     // dB (body absorption)
  shadowFading?: boolean;  // enable stochastic shadow fading
  clutterEnabled?: boolean; // enable clutter loss variation
  // Terrain data (populated by server-side SRTM)
  terrainGrid?: number[][]; // elevation grid [row][col] in meters
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

// ── Deterministic pseudo-random (seeded) for reproducible shadow fading ──
function seededRandom(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

// Box-Muller for Gaussian from uniform
function gaussianFromUniform(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// ── COST-231 Hata path loss (dB) ──
function cost231PathLoss(
  freq: number, hb: number, hm: number, d: number,
  environment: 'urban' | 'suburban' | 'rural'
): number {
  if (d <= 0) return 0;
  const f = freq;
  let ahm: number;
  if (environment === 'urban' && f >= 400) {
    ahm = 3.2 * Math.pow(Math.log10(11.75 * hm), 2) - 4.97;
  } else {
    ahm = (1.1 * Math.log10(f) - 0.7) * hm - (1.56 * Math.log10(f) - 0.8);
  }
  const C = environment === 'urban' ? 3 : 0;
  let pathLoss = 46.3 + 33.9 * Math.log10(f)
    - 13.82 * Math.log10(hb) - ahm
    + (44.9 - 6.55 * Math.log10(hb)) * Math.log10(d) + C;
  if (environment === 'suburban') {
    pathLoss -= 2 * Math.pow(Math.log10(f / 28), 2) + 5.4;
  } else if (environment === 'rural') {
    pathLoss -= 4.78 * Math.pow(Math.log10(f), 2) + 18.33 * Math.log10(f) - 40.94;
  }
  return pathLoss;
}

// ── Clutter loss by environment (dB) — adds variation ──
function clutterLoss(environment: 'urban' | 'suburban' | 'rural', randVal: number): number {
  // Base clutter + random component for irregular edges
  switch (environment) {
    case 'urban': return 3 + randVal * 8;     // 3-11 dB (buildings)
    case 'suburban': return 1 + randVal * 5;   // 1-6 dB (trees, houses)
    case 'rural': return randVal * 2;          // 0-2 dB (open)
  }
}

// ── Shadow fading (log-normal, spatially correlated) ──
function shadowFadingLoss(
  i: number, j: number, seed: number, environment: 'urban' | 'suburban' | 'rural'
): number {
  // Standard deviation by environment (3GPP TR 38.901)
  const sigma = environment === 'urban' ? 8 : environment === 'suburban' ? 6 : 4;

  // Spatial correlation: average 2x2 neighbors for smoother fading
  let sum = 0;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const u1 = seededRandom(i + di, j + dj, seed);
      const u2 = seededRandom(i + di, j + dj, seed + 12345);
      sum += gaussianFromUniform(u1, u2);
    }
  }
  return (sum / 9) * sigma; // correlated Gaussian * sigma
}

// ── Knife-edge diffraction loss (Deygout single obstacle) ──
function diffractionLoss(
  txHeight: number, rxHeight: number, distance: number,
  obstacleHeight: number, obstacleDistance: number, freqMHz: number
): number {
  if (obstacleHeight <= 0 || distance <= 0) return 0;

  const lambda = 300 / freqMHz; // wavelength in meters
  const d1 = obstacleDistance * 1000; // m
  const d2 = (distance - obstacleDistance) * 1000; // m
  if (d1 <= 0 || d2 <= 0) return 0;

  // Line of sight height at obstacle position
  const losHeight = txHeight + (rxHeight - txHeight) * (d1 / (d1 + d2));
  const h = obstacleHeight - losHeight;
  if (h <= 0) return 0; // no obstruction

  // Fresnel parameter v
  const v = h * Math.sqrt(2 * (d1 + d2) / (lambda * d1 * d2));

  // Approximate diffraction loss (ITU-R P.526)
  if (v <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

// ── Terrain diffraction from elevation grid ──
function terrainDiffractionLoss(
  terrainGrid: number[][] | undefined,
  gridSize: number,
  txI: number, txJ: number,
  ptI: number, ptJ: number,
  txHeight: number, rxHeight: number,
  distance: number, freqMHz: number
): number {
  if (!terrainGrid || distance < 0.1) return 0;

  const rows = terrainGrid.length;
  const cols = terrainGrid[0]?.length || 0;
  if (rows === 0 || cols === 0) return 0;

  // Sample terrain profile along the ray (max 20 samples)
  const steps = Math.min(20, Math.max(5, Math.floor(distance * 2)));
  let maxLoss = 0;

  const txElev = (txI >= 0 && txI < rows && txJ >= 0 && txJ < cols)
    ? terrainGrid[txI][txJ] : 0;
  const rxElev = (ptI >= 0 && ptI < rows && ptJ >= 0 && ptJ < cols)
    ? terrainGrid[ptI][ptJ] : 0;

  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const si = Math.round(txI + (ptI - txI) * t);
    const sj = Math.round(txJ + (ptJ - txJ) * t);
    if (si < 0 || si >= rows || sj < 0 || sj >= cols) continue;

    const terrainH = terrainGrid[si][sj];
    const obstH = terrainH - (txElev + (rxElev - txElev) * t); // relative to LOS
    if (obstH > 0) {
      const obstDist = distance * t;
      const loss = diffractionLoss(
        txHeight + txElev, rxHeight + rxElev,
        distance, terrainH + obstH, obstDist, freqMHz
      );
      maxLoss = Math.max(maxLoss, loss);
    }
  }

  return maxLoss;
}

// ── Antenna horizontal pattern (Gaussian) ──
function antennaHorizontalGain(bearing: number, azimuth: number, beamwidth: number): number {
  let diff = bearing - azimuth;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  const Am = 25;
  return -Math.min(12 * Math.pow(diff / beamwidth, 2), Am);
}

// ── Antenna vertical pattern ──
function antennaVerticalGain(elevAngle: number, tilt: number): number {
  const vertBW = 7;
  const diff = elevAngle - tilt;
  const SLA = 20;
  return -Math.min(12 * Math.pow(diff / vertBW, 2), SLA);
}

// ── Bearing between two points ──
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
    - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Haversine distance km ──
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Run the enhanced coverage simulation.
 */
export function simulateCoverage(params: SimulationParams): CoverageGrid {
  const {
    lat, lng, frequency, txPower, antennaHeight, antennaGain,
    azimuth, beamwidth, tilt, mechanicalTilt = 0, rxHeight, radius, gridSize,
    environment, cableLoss = 0, bodyLoss = 0,
    shadowFading: enableShadow = true,
    clutterEnabled = true,
    terrainGrid
  } = params;

  const totalTilt = tilt + mechanicalTilt;
  const latDelta = radius / 111.32;
  const lngDelta = radius / (111.32 * Math.cos(lat * Math.PI / 180));
  const bounds = {
    minLat: lat - latDelta, maxLat: lat + latDelta,
    minLng: lng - lngDelta, maxLng: lng + lngDelta,
  };

  const points: CoveragePoint[] = [];
  let minRsrp = Infinity, maxRsrp = -Infinity, sumRsrp = 0;
  const latStep = (bounds.maxLat - bounds.minLat) / gridSize;
  const lngStep = (bounds.maxLng - bounds.minLng) / gridSize;

  // Site grid position (for terrain lookup)
  const txI = Math.round((lat - bounds.minLat) / latStep);
  const txJ = Math.round((lng - bounds.minLng) / lngStep);

  // Seed for deterministic shadow fading (based on site position)
  const seed = Math.floor((lat * 1000 + lng * 1000) % 100000);

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const pLat = bounds.minLat + i * latStep;
      const pLng = bounds.minLng + j * lngStep;
      const d = distKm(lat, lng, pLat, pLng);
      if (d < 0.01 || d > radius) continue;

      // Path loss (COST-231 Hata)
      const pl = cost231PathLoss(frequency, antennaHeight, rxHeight, d, environment);

      // Antenna patterns
      const brng = bearingDeg(lat, lng, pLat, pLng);
      const hGain = antennaHorizontalGain(brng, azimuth, beamwidth);
      const heightDiff = antennaHeight - rxHeight;
      const elevAngle = Math.atan2(heightDiff, d * 1000) * 180 / Math.PI;
      const vGain = antennaVerticalGain(elevAngle, totalTilt);

      // Clutter loss (irregular edges)
      const clutterRand = seededRandom(i, j, seed + 99999);
      const clutter = clutterEnabled ? clutterLoss(environment, clutterRand) : 0;

      // Shadow fading (log-normal spatially correlated)
      const shadow = enableShadow ? shadowFadingLoss(i, j, seed, environment) : 0;

      // Terrain diffraction
      const terrainLoss = terrainDiffractionLoss(
        terrainGrid, gridSize, txI, txJ, i, j,
        antennaHeight, rxHeight, d, frequency
      );

      // RSRP = TxPower + AntennaGain + HPattern + VPattern - PathLoss - Losses
      const eirp = txPower + antennaGain + hGain + vGain;
      const totalLoss = pl + cableLoss + bodyLoss + clutter + Math.abs(shadow) + terrainLoss;
      const rsrp = eirp - totalLoss;
      const clampedRsrp = Math.max(-140, Math.min(-44, rsrp));

      points.push({ lat: pLat, lng: pLng, rsrp: clampedRsrp, distance: d });
      minRsrp = Math.min(minRsrp, clampedRsrp);
      maxRsrp = Math.max(maxRsrp, clampedRsrp);
      sumRsrp += clampedRsrp;
    }
  }

  return {
    points, bounds, params,
    stats: {
      minRsrp, maxRsrp,
      avgRsrp: points.length > 0 ? sumRsrp / points.length : 0,
      pointCount: points.length,
    },
  };
}

/** RSRP → color mapping (telecom-standard) */
export function rsrpToColor(rsrp: number, opacity = 0.6): string {
  if (rsrp >= -75) return `rgba(0, 180, 0, ${opacity})`;
  if (rsrp >= -85) return `rgba(100, 200, 0, ${opacity})`;
  if (rsrp >= -95) return `rgba(255, 200, 0, ${opacity})`;
  if (rsrp >= -105) return `rgba(255, 140, 0, ${opacity})`;
  if (rsrp >= -115) return `rgba(255, 60, 0, ${opacity})`;
  if (rsrp >= -125) return `rgba(200, 0, 0, ${opacity})`;
  return `rgba(100, 0, 0, ${opacity})`;
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
export function getDefaultParams(techno: '4G' | '5G' | '3G' | '2G', band?: string): Partial<SimulationParams> {
  const is5G = techno === '5G';
  const is3G = techno === '3G';
  const is2G = techno === '2G';
  const freq = band?.includes('3500') || band?.includes('NR3500') ? 3500
    : band?.includes('2600') ? 2600
    : band?.includes('2100') || band?.includes('NR2100') || band?.includes('UMTS2100') ? 2100
    : band?.includes('1800') || band?.includes('GSM1800') || band?.includes('DCS') ? 1800
    : band?.includes('900') || band?.includes('UMTS900') || band?.includes('GSM900') ? 900
    : band?.includes('800') ? 800
    : band?.includes('700') || band?.includes('NR700') ? 700
    : is5G ? 3500 : is3G ? 2100 : is2G ? 900 : 1800;

  return {
    frequency: freq,
    txPower: is5G ? 46 : is2G ? 43 : is3G ? 43 : 43,
    antennaGain: is5G ? 25 : is3G ? 18 : is2G ? 15 : 18,
    beamwidth: is5G && freq >= 3500 ? 90 : is2G ? 360 : 65,
    tilt: is5G ? 6 : is2G ? 0 : is3G ? 3 : 4,
    mechanicalTilt: 0,
    rxHeight: 1.5,
    radius: freq >= 3500 ? 2 : freq >= 1800 ? 5 : freq <= 900 ? 15 : 10,
    gridSize: 80,
    environment: 'urban' as const,
    techno: (is5G ? '5G' : '4G') as '4G' | '5G',
    cableLoss: is5G ? 0.5 : 2,
    bodyLoss: 3,
    shadowFading: true,
    clutterEnabled: true,
    bandwidth: is5G ? (freq >= 3500 ? 100 : 20) : is3G ? 5 : is2G ? 0.2 : 20,
  };
}
