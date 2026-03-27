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
 * @param lat - Latitude of site
 * @param zoom - Current map zoom
 * @param densityFactor - 0..1 — lower = denser area = smaller sectors
 * @param viewportWidth - CSS px width of viewport
 */
export const getZoomAwareRadius = (
  lat: number,
  zoom: number,
  densityFactor: number = 1,
  viewportWidth: number = 1400,
): number => {
  let targetPx: number;
  if (zoom <= 9) targetPx = 22;
  else if (zoom <= 10) targetPx = 28;
  else if (zoom <= 11) targetPx = 34;
  else if (zoom <= 12) targetPx = 38;
  else targetPx = 42;

  // Viewport scaling
  const vpScale = Math.max(0.7, Math.min(1.1, viewportWidth / 1400));
  targetPx *= vpScale;

  // Density scaling: reduce size in crowded areas
  const densityScale = 0.5 + 0.5 * Math.max(0, Math.min(1, densityFactor));
  targetPx *= densityScale;

  const mpp = metersPerPixel(lat, zoom);
  return Math.max(30, Math.min(1200, targetPx * mpp));
};

/**
 * Tagged site radius with inverse zoom scaling:
 * larger at low zoom, normal at high zoom.
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
