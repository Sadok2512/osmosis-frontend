/**
 * Reusable helper to normalize and extract coordinate fields from any object.
 * Supports lat/lon (or latitude/longitude) and x/y fields.
 */

export interface NormalizedCoords {
  lat?: number;
  lon?: number;
  x?: number;
  y?: number;
}

/** Extract coordinates from an object, checking common field names */
export function normalizeCoordinates(obj: Record<string, any> | null | undefined): NormalizedCoords | null {
  if (!obj) return null;

  const lat = getNum(obj, 'lat', 'latitude') ?? (Array.isArray(obj.coordinates) ? obj.coordinates[0] : undefined);
  const lon = getNum(obj, 'lon', 'lng', 'longitude') ?? (Array.isArray(obj.coordinates) ? obj.coordinates[1] : undefined);
  const x = getNum(obj, 'x', 'coord_x', 'lambert_x');
  const y = getNum(obj, 'y', 'coord_y', 'lambert_y');

  if (lat == null && lon == null && x == null && y == null) return null;

  const result: NormalizedCoords = {};
  if (isValid(lat)) result.lat = lat;
  if (isValid(lon)) result.lon = lon;
  if (isValid(x)) result.x = x;
  if (isValid(y)) result.y = y;

  return Object.keys(result).length > 0 ? result : null;
}

function getNum(obj: Record<string, any>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function isValid(v: number | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/** Format a coordinate number to a fixed precision */
export function fmtCoord(v: number, decimals = 6): string {
  return v.toFixed(decimals);
}
