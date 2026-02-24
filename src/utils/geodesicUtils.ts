/**
 * Geodesic utilities for terrain & radio profile calculations
 */

const R_EARTH = 6371000; // meters
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ProfilePoint {
  lat: number;
  lng: number;
  distance: number; // cumulative distance in meters
  elevation: number; // terrain elevation in meters
}

export type AzimuthSector = 'in-sector' | 'edge-sector' | 'outside-sector';

export interface LOSAnalysis {
  beamAltitudes: number[]; // beam altitude at each point
  effectiveTerrain: number[]; // terrain + earth curvature correction
  isLOS: boolean;
  obstructionIndex: number | null;
  obstructionDistance: number | null;
  obstructionAltitude: number | null;
  clearanceMin: number; // minimum clearance in meters
  maxTerrainAlt: number; // max terrain altitude along segment
  segmentAzimuth: number;
  deltaAzimuth: number; // |segment azimuth - antenna azimuth| normalized 0..180
  azimuthSector: AzimuthSector;
}

export interface FresnelAnalysis {
  fresnelRadii: number[]; // F1 radius at each sample point (m)
  fresnelUpperBound: number[]; // beam + F1 radius
  fresnelLowerBound: number[]; // beam - F1 radius
  maxIntrusionPercent: number; // max % of F1 intruded by terrain
  intrusionIndex: number | null; // index of max intrusion
  isClearFresnel: boolean; // true if intrusion < 40%
}

/**
 * First Fresnel zone radius at distance d from one end
 * F1(d) = sqrt( (λ * d1 * d2) / D )
 * where d1 = d, d2 = D - d, D = total distance, λ = c / f
 */
export function fresnelRadius(distance: number, totalDistance: number, frequencyGHz: number): number {
  if (distance <= 0 || distance >= totalDistance || frequencyGHz <= 0) return 0;
  const lambda = 0.3 / frequencyGHz; // wavelength in meters
  const d1 = distance;
  const d2 = totalDistance - distance;
  return Math.sqrt((lambda * d1 * d2) / totalDistance);
}

/**
 * Compute Fresnel zone analysis along the profile
 */
export function analyzeFresnelZone(
  profilePoints: ProfilePoint[],
  beamAltitudes: number[],
  effectiveTerrain: number[],
  totalDistance: number,
  frequencyGHz: number,
): FresnelAnalysis {
  const radii: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  let maxIntrusion = 0;
  let intrusionIdx: number | null = null;

  for (let i = 0; i < profilePoints.length; i++) {
    const d = profilePoints[i].distance;
    const r = fresnelRadius(d, totalDistance, frequencyGHz);
    radii.push(r);
    upper.push(beamAltitudes[i] + r);
    lower.push(beamAltitudes[i] - r);

    if (r > 0) {
      const terrainIntrusion = effectiveTerrain[i] - (beamAltitudes[i] - r);
      if (terrainIntrusion > 0) {
        const percent = (terrainIntrusion / (2 * r)) * 100;
        if (percent > maxIntrusion) {
          maxIntrusion = percent;
          intrusionIdx = i;
        }
      }
    }
  }

  return {
    fresnelRadii: radii,
    fresnelUpperBound: upper,
    fresnelLowerBound: lower,
    maxIntrusionPercent: Math.round(maxIntrusion * 10) / 10,
    intrusionIndex: intrusionIdx,
    isClearFresnel: maxIntrusion < 40,
  };
}

/**
 * Haversine distance between two points in meters
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * sinLng * sinLng;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/**
 * Calculate bearing (azimuth) from point A to point B in degrees [0..360)
 */
export function bearing(a: LatLng, b: LatLng): number {
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const lat1 = a.lat * DEG2RAD;
  const lat2 = b.lat * DEG2RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

/**
 * Interpolate N points along geodesic between start and end
 */
export function interpolatePoints(start: LatLng, end: LatLng, n: number): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push({
      lat: start.lat + t * (end.lat - start.lat),
      lng: start.lng + t * (end.lng - start.lng),
    });
  }
  return points;
}

/**
 * Calculate beam/LOS altitude at distance d from antenna
 * zBeam(d) = zAnt - d * tan(tiltDeg)
 */
export function beamAltitude(antennaAlt: number, distance: number, tiltDeg: number): number {
  return antennaAlt - distance * Math.tan(tiltDeg * DEG2RAD);
}

/**
 * Earth curvature correction at distance d with k-factor
 * deltaCurv(d) = d² / (2 * k * R_earth)
 */
export function earthCurvatureCorrection(distance: number, kFactor: number = 4 / 3): number {
  const Reff = kFactor * R_EARTH;
  return (distance * distance) / (2 * Reff);
}

/**
 * Perform full LOS analysis
 */
export function analyzeLOS(
  profilePoints: ProfilePoint[],
  antennaHBA: number,
  antennaTilt: number,
  antennaAzimuth: number,
  targetPoint: LatLng,
  startPoint: LatLng,
  enableCurvature: boolean = true,
  kFactor: number = 4 / 3
): LOSAnalysis {
  if (profilePoints.length === 0) {
    return {
      beamAltitudes: [],
      effectiveTerrain: [],
      isLOS: true,
      obstructionIndex: null,
      obstructionDistance: null,
      obstructionAltitude: null,
      clearanceMin: Infinity,
      maxTerrainAlt: 0,
      segmentAzimuth: 0,
      deltaAzimuth: 0,
      azimuthSector: 'in-sector' as AzimuthSector,
    };
  }

  const startElevation = profilePoints[0].elevation;
  const antennaAlt = startElevation + antennaHBA;

  const beamAlts: number[] = [];
  const effectiveTerrain: number[] = [];

  let minClearance = Infinity;
  let firstObstructionIdx: number | null = null;
  let maxTerrainAlt = -Infinity;

  for (let i = 0; i < profilePoints.length; i++) {
    const d = profilePoints[i].distance;
    const beam = beamAltitude(antennaAlt, d, antennaTilt);
    beamAlts.push(beam);

    const curvCorr = enableCurvature ? earthCurvatureCorrection(d, kFactor) : 0;
    const effTerrain = profilePoints[i].elevation + curvCorr;
    effectiveTerrain.push(effTerrain);

    if (profilePoints[i].elevation > maxTerrainAlt) {
      maxTerrainAlt = profilePoints[i].elevation;
    }

    const clearance = beam - effTerrain;
    if (clearance < minClearance) {
      minClearance = clearance;
    }
    if (clearance < 0 && firstObstructionIdx === null && i > 0) {
      firstObstructionIdx = i;
    }
  }

  const segAzimuth = bearing(startPoint, targetPoint);
  let dAz = Math.abs(segAzimuth - antennaAzimuth);
  if (dAz > 180) dAz = 360 - dAz;

  const azSector: AzimuthSector = dAz <= 30 ? 'in-sector' : dAz <= 60 ? 'edge-sector' : 'outside-sector';

  return {
    beamAltitudes: beamAlts,
    effectiveTerrain,
    isLOS: firstObstructionIdx === null,
    obstructionIndex: firstObstructionIdx,
    obstructionDistance: firstObstructionIdx !== null ? profilePoints[firstObstructionIdx].distance : null,
    obstructionAltitude: firstObstructionIdx !== null ? effectiveTerrain[firstObstructionIdx] : null,
    clearanceMin: minClearance,
    maxTerrainAlt: Math.round(maxTerrainAlt * 10) / 10,
    segmentAzimuth: Math.round(segAzimuth * 10) / 10,
    deltaAzimuth: Math.round(dAz * 10) / 10,
    azimuthSector: azSector,
  };
}
