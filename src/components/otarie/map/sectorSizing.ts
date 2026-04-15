/**
 * Sector sizing logic — adaptive to zoom, density, and viewport.
 * Includes tagged site inverse-zoom scaling.
 */

/** Compute meters-per-pixel at a given latitude and zoom level */
export const metersPerPixel = (lat: number, zoom: number): number => {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
};

/**
 * Sector radius in meters — adaptive to zoom, density, and viewport.
 */
export const getZoomAwareRadius = (
  lat: number,
  zoom: number,
  densityFactor: number = 1,
  viewportWidth: number = 1400,
): number => {
  let targetPx: number;
  if (zoom <= 9) targetPx = 14;
  else if (zoom <= 10) targetPx = 18;
  else if (zoom <= 11) targetPx = 22;
  else if (zoom <= 12) targetPx = 26;
  else if (zoom <= 13) targetPx = 30;
  else targetPx = 34;

  // Dynamic viewport scaling — smaller screens get proportionally smaller beams
  const vpScale = Math.max(0.55, Math.min(1.0, viewportWidth / 1600));
  targetPx *= vpScale;

  const densityScale = 0.45 + 0.55 * Math.max(0, Math.min(1, densityFactor));
  targetPx *= densityScale;

  const mpp = metersPerPixel(lat, zoom);
  return Math.max(20, Math.min(800, targetPx * mpp));
};

/**
 * Tagged site radius with inverse zoom scaling.
 */
export const getTaggedRadius = (zoom: number): number => {
  const BASE = 350;
  const MIN_RADIUS = 200;
  const MAX_RADIUS = 2500;
  const REF_ZOOM = 12;
  const scale = Math.pow(2, REF_ZOOM - zoom);
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, BASE * scale));
};

/** Compute density factor from visible site count */
export const computeDensityFactor = (visibleCount: number): number => {
  if (visibleCount > 500) return 0;
  if (visibleCount > 300) return 0.15;
  if (visibleCount > 150) return 0.3;
  if (visibleCount > 80) return 0.5;
  if (visibleCount > 30) return 0.7;
  return 1;
};

/** Generate sector polygon points (wedge shape) */
export const getSectorCoords = (
  center: [number, number],
  azimuth: number,
  radiusMeters: number = 300,
  aperture: number = 65,
): [number, number][] => {
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return [];
  if (!Number.isFinite(azimuth) || !Number.isFinite(radiusMeters)) return [];

  const steps = 20;
  const startAngle = azimuth - aperture / 2;
  const endAngle = azimuth + aperture / 2;
  const points: [number, number][] = [center];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle - 90) * (Math.PI / 180);
    const dlat = (radiusMeters / 111320) * Math.cos(rad);
    const dlng = (radiusMeters / (111320 * Math.cos(center[0] * Math.PI / 180))) * Math.sin(rad);
    points.push([center[0] + dlat, center[1] + dlng]);
  }
  points.push(center);
  return points;
};

/**
 * Band frequency priority — lower frequency = higher priority (bigger sector).
 * Returns a scale factor: 1.0 = largest, down to ~0.45 = smallest.
 */
const BAND_PRIORITY: Record<string, number> = {
  // 2G bands — very small
  GSM900:   0.45,
  GSM1800:  0.40,
  // 3G bands — small-medium
  UMTS900:  0.60,
  UMTS2100: 0.52,
  // 4G bands — low freq = big
  L700:   1.0,
  L800:   0.95,
  L900:   0.90,
  L1800:  0.78,
  L2100:  0.68,
  L2600:  0.58,
  // 5G bands — low freq = big
  NR700:  1.0,
  NR2100: 0.72,
  NR3500: 0.55,
};

/** Get a radius scale factor based on band (lower freq = bigger). Falls back to 0.75. */
export const getBandSizeScale = (bandKey: string | null): number => {
  if (!bandKey) return 0.75;
  return BAND_PRIORITY[bandKey] ?? 0.75;
};

/**
 * Get band sort priority for rendering order (lower value = render first = below).
 */
export const getBandRenderOrder = (bandKey: string | null): number => {
  if (!bandKey) return 50;
  const scale = BAND_PRIORITY[bandKey] ?? 0.75;
  return Math.round((1 - scale) * 100);
};

/** Get valid sector azimuths from site cells */
export const getValidSectorAzimuths = (cells: { azimut?: number | null }[]): number[] => {
  const azimuths = new Set<number>();
  for (const cell of cells) {
    const az = Number(cell.azimut);
    if (Number.isFinite(az) && az >= 0 && az <= 360) {
      azimuths.add(az);
    }
  }
  return Array.from(azimuths).sort((a, b) => a - b);
};
