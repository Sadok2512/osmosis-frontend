export type MapToolType = 'none' | 'point' | 'link' | 'distance' | 'rings' | 'polygon';

export interface DistanceMeasurement {
  pointA: [number, number] | null;
  pointB: [number, number] | null;
}

export interface ConcentricRingsData {
  center: [number, number] | null;
  radii: number[]; // in meters
}

export interface PolygonZoneData {
  points: [number, number][];
}

export const DEFAULT_RING_RADII = [1000, 2000, 3000, 5000]; // meters

export const RING_PRESETS: { label: string; radii: number[] }[] = [
  { label: '1-2-3-5 km', radii: [1000, 2000, 3000, 5000] },
  { label: '0.5-1-2 km', radii: [500, 1000, 2000] },
  { label: '1-3-5-10 km', radii: [1000, 3000, 5000, 10000] },
];
