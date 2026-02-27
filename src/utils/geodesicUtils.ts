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

export interface AntennaParams {
  hba: number;            // Height Above Ground Level (AGL) in meters
  siteAltitude: number;   // Ground altitude at site (DEM) in meters AMSL
  antennaAMSL: number;    // Antenna altitude AMSL = siteAltitude + hba
  mechTilt: number;       // Mechanical tilt (deg, positive = downtilt)
  elecTilt: number;       // Electrical tilt (deg, positive = downtilt)
  totalTilt: number;      // mechTilt + elecTilt
  azimuth: number;        // Antenna azimuth (deg)
  hbw: number;            // Horizontal beamwidth (deg), e.g. 65
  vbw: number;            // Vertical beamwidth (deg), e.g. 7
  frontToBackRatio: number; // Front-to-back ratio (dB), e.g. 25
  rxHeight: number;       // Receiver / UE height (m), default 1.5
}

export interface LOSAnalysis {
  beamAltitudes: number[]; // beam altitude at each point (AMSL)
  effectiveTerrain: number[]; // terrain + earth curvature correction (AMSL)
  rxAltitudes: number[];  // terrain + rxHeight at each point
  isLOS: boolean;
  obstructionIndex: number | null;
  obstructionDistance: number | null;
  obstructionAltitude: number | null;
  clearanceMin: number; // minimum clearance in meters
  maxTerrainAlt: number; // max terrain altitude along segment
  segmentAzimuth: number;
  deltaAzimuth: number; // |segment azimuth - antenna azimuth| normalized 0..180
  azimuthSector: AzimuthSector;
  patternLossH: number; // horizontal pattern loss at target azimuth (dB)
  patternLossV: number; // vertical pattern loss at target (dB)
  patternLossTotal: number; // total pattern loss (dB)
  antennaParams: AntennaParams;
}

export interface FresnelAnalysis {
  fresnelRadii: number[]; // F1 radius at each sample point (m)
  fresnelUpperBound: number[]; // beam + F1 radius
  fresnelLowerBound: number[]; // beam - F1 radius
  maxIntrusionPercent: number; // max % of F1 intruded by terrain
  intrusionIndex: number | null; // index of max intrusion
  isClearFresnel: boolean; // true if intrusion < 40%
}

// ─── Antenna Pattern Functions ────────────────────────────

/**
 * Horizontal pattern attenuation (3GPP TS 38.901 / simplified)
 * A_H(φ) = -min(12 * (φ / φ_3dB)^2, A_m)
 * where φ_3dB = HBW/2, A_m = front-to-back ratio
 * Returns loss in dB (positive value = loss)
 */
export function horizontalPatternLoss(deltaAzimuthDeg: number, hbw: number, frontToBackRatio: number): number {
  const phi3dB = hbw / 2;
  if (phi3dB <= 0) return 0;
  const ratio = deltaAzimuthDeg / phi3dB;
  return Math.min(12 * ratio * ratio, frontToBackRatio);
}

/**
 * Vertical pattern attenuation (3GPP TS 38.901 / simplified)
 * A_V(θ) = -min(12 * ((θ - θ_tilt) / θ_3dB)^2, SLA_v)
 * where θ_3dB = VBW/2, SLA_v = 30 dB (side lobe attenuation)
 * θ = vertical angle from antenna to point, θ_tilt = total tilt
 * Returns loss in dB (positive value = loss)
 */
export function verticalPatternLoss(verticalAngleDeg: number, totalTiltDeg: number, vbw: number, slaV: number = 30): number {
  const theta3dB = vbw / 2;
  if (theta3dB <= 0) return 0;
  const delta = verticalAngleDeg - totalTiltDeg;
  const ratio = delta / theta3dB;
  return Math.min(12 * ratio * ratio, slaV);
}

/**
 * Combined antenna pattern loss (3GPP)
 * A(φ,θ) = -min(-(A_H + A_V), A_m)
 * Returns total pattern loss in dB
 */
export function combinedPatternLoss(hLoss: number, vLoss: number, frontToBackRatio: number): number {
  return Math.min(hLoss + vLoss, frontToBackRatio);
}

/**
 * Calculate vertical angle from antenna to a target point
 * verticalAngle = atan2(antennaAMSL - targetAMSL, distance) in degrees
 * Positive = downtilt direction
 */
export function verticalAngleToPoint(antennaAMSL: number, targetAMSL: number, distance: number): number {
  if (distance <= 0) return 0;
  return Math.atan2(antennaAMSL - targetAMSL, distance) * RAD2DEG;
}

// ─── Fresnel ──────────────────────────────────────────────

/**
 * First Fresnel zone radius at distance d from one end
 */
export function fresnelRadius(distance: number, totalDistance: number, frequencyGHz: number): number {
  if (distance <= 0 || distance >= totalDistance || frequencyGHz <= 0) return 0;
  const lambda = 0.3 / frequencyGHz;
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

// ─── Geodesic Primitives ──────────────────────────────────

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

// ─── RF Altitude & Curvature ──────────────────────────────

/**
 * LOS line altitude at distance d (straight line from antenna AMSL to target AMSL)
 */
export function losLineAltitude(antennaAMSL: number, targetAMSL: number, distance: number, totalDistance: number): number {
  if (totalDistance <= 0) return antennaAMSL;
  const t = distance / totalDistance;
  return antennaAMSL + t * (targetAMSL - antennaAMSL);
}

/**
 * Beam altitude at distance d from antenna using tilt angle
 * zBeam(d) = antennaAMSL - d * tan(tiltDeg)
 */
export function beamAltitude(antennaAMSL: number, distance: number, tiltDeg: number): number {
  return antennaAMSL - distance * Math.tan(tiltDeg * DEG2RAD);
}

/**
 * Earth curvature correction at distance d with k-factor
 */
export function earthCurvatureCorrection(distance: number, kFactor: number = 4 / 3): number {
  const Reff = kFactor * R_EARTH;
  return (distance * distance) / (2 * Reff);
}

// ─── Full LOS Analysis ───────────────────────────────────

/**
 * Perform full LOS analysis with antenna pattern
 */
export function analyzeLOS(
  profilePoints: ProfilePoint[],
  antenna: AntennaParams,
  targetPoint: LatLng,
  startPoint: LatLng,
  enableCurvature: boolean = true,
  kFactor: number = 4 / 3
): LOSAnalysis {
  if (profilePoints.length === 0) {
    return {
      beamAltitudes: [],
      effectiveTerrain: [],
      rxAltitudes: [],
      isLOS: true,
      obstructionIndex: null,
      obstructionDistance: null,
      obstructionAltitude: null,
      clearanceMin: Infinity,
      maxTerrainAlt: 0,
      segmentAzimuth: 0,
      deltaAzimuth: 0,
      azimuthSector: 'in-sector' as AzimuthSector,
      patternLossH: 0,
      patternLossV: 0,
      patternLossTotal: 0,
      antennaParams: antenna,
    };
  }

  const antennaAMSL = antenna.antennaAMSL;
  const totalDist = profilePoints[profilePoints.length - 1].distance;
  
  // Target point: last profile point elevation + rxHeight
  const lastElev = profilePoints[profilePoints.length - 1].elevation;
  const targetAMSL = lastElev + antenna.rxHeight;

  const beamAlts: number[] = [];
  const effectiveTerrain: number[] = [];
  const rxAlts: number[] = [];

  let minClearance = Infinity;
  let firstObstructionIdx: number | null = null;
  let maxTerrainAlt = -Infinity;

  for (let i = 0; i < profilePoints.length; i++) {
    const d = profilePoints[i].distance;
    
    // LOS line from antenna AMSL to target (last point elevation + rxHeight)
    const beam = losLineAltitude(antennaAMSL, targetAMSL, d, totalDist);
    beamAlts.push(beam);

    const curvCorr = enableCurvature ? earthCurvatureCorrection(d, kFactor) : 0;
    const effTerrain = profilePoints[i].elevation + curvCorr;
    effectiveTerrain.push(effTerrain);

    // Rx altitude at each point = terrain + rxHeight
    rxAlts.push(profilePoints[i].elevation + antenna.rxHeight);

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

  // Azimuth analysis
  const segAzimuth = bearing(startPoint, targetPoint);
  let dAz = Math.abs(segAzimuth - antenna.azimuth);
  if (dAz > 180) dAz = 360 - dAz;

  const azSector: AzimuthSector = dAz <= 30 ? 'in-sector' : dAz <= 60 ? 'edge-sector' : 'outside-sector';

  // Antenna pattern losses
  const hLoss = horizontalPatternLoss(dAz, antenna.hbw, antenna.frontToBackRatio);
  
  // Vertical angle to target
  const vAngle = verticalAngleToPoint(antennaAMSL, targetAMSL, totalDist);
  const vLoss = verticalPatternLoss(vAngle, antenna.totalTilt, antenna.vbw);
  const totalPatternLoss = combinedPatternLoss(hLoss, vLoss, antenna.frontToBackRatio);

  return {
    beamAltitudes: beamAlts,
    effectiveTerrain,
    rxAltitudes: rxAlts,
    isLOS: firstObstructionIdx === null,
    obstructionIndex: firstObstructionIdx,
    obstructionDistance: firstObstructionIdx !== null ? profilePoints[firstObstructionIdx].distance : null,
    obstructionAltitude: firstObstructionIdx !== null ? effectiveTerrain[firstObstructionIdx] : null,
    clearanceMin: minClearance,
    maxTerrainAlt: Math.round(maxTerrainAlt * 10) / 10,
    segmentAzimuth: Math.round(segAzimuth * 10) / 10,
    deltaAzimuth: Math.round(dAz * 10) / 10,
    azimuthSector: azSector,
    patternLossH: Math.round(hLoss * 10) / 10,
    patternLossV: Math.round(vLoss * 10) / 10,
    patternLossTotal: Math.round(totalPatternLoss * 10) / 10,
    antennaParams: antenna,
  };
}
