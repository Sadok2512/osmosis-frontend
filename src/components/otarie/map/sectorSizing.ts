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
  // Adaptive target pixel size — capped at high zoom to avoid carpet/oversize effect.
  // At high zoom (>=16) we shrink target px so sectors stop growing visually and
  // switch to a tighter "engineering" rendering mode.
  let targetPx: number;
  if (zoom <= 9) targetPx = 7;
  else if (zoom <= 11) targetPx = 10;
  else if (zoom <= 12) targetPx = 12;
  else if (zoom <= 13) targetPx = 13;
  else if (zoom <= 14) targetPx = 18;
  else if (zoom <= 15) targetPx = 22;
  else if (zoom <= 16) targetPx = 20; // start tightening
  else if (zoom <= 17) targetPx = 17; // compact
  else if (zoom <= 18) targetPx = 14; // engineering precision mode
  else targetPx = 12;                 // very high zoom — tight directional arcs

  // Dynamic viewport scaling — smaller screens get proportionally smaller beams
  const vpScale = Math.max(0.55, Math.min(1.0, viewportWidth / 1600));
  targetPx *= vpScale;

  // Density shrinking — softer floor so beams stay visible in dense urban zones.
  const densityScale = 0.55 + 0.45 * Math.max(0, Math.min(1, densityFactor));
  targetPx *= densityScale;

  const mpp = metersPerPixel(lat, zoom);

  // Hard cap on absolute radius (meters) — decreases at high zoom so polygons
  // never expand into a screen-covering blob.
  let maxRadiusMeters = 420;
  if (zoom >= 18) maxRadiusMeters = 90;
  else if (zoom >= 17) maxRadiusMeters = 140;
  else if (zoom >= 16) maxRadiusMeters = 200;
  else if (zoom >= 15) maxRadiusMeters = 280;

  // Floor in meters — relaxed at high zoom so the 20 m min doesn't inflate
  // sectors past the targetPx ceiling.
  const minRadiusMeters = zoom >= 16 ? 8 : zoom >= 15 ? 12 : 20;

  return Math.max(minRadiusMeters, Math.min(maxRadiusMeters, targetPx * mpp));
};

/**
 * Tagged site radius with inverse zoom scaling.
 */
export const getTaggedRadius = (zoom: number): number => {
  // Tagged site emphasis multiplier (kept existing growth behavior, then +1.5x).
  const BOOST = 1.5;
  const BASE = 700 * BOOST;
  const MIN_RADIUS = 400 * BOOST;
  const MAX_RADIUS = 5000 * BOOST;
  const REF_ZOOM = 12;
  const scale = Math.pow(2, REF_ZOOM - zoom);
  const raw = BASE * scale;
  // At high zoom, cap the tagged ring so it stays visually prominent but not
  // screen-covering. This keeps tagged identification clear without making the
  // overlay dominate the map.
  let highZoomCap = MAX_RADIUS;
  if (zoom >= 18) highZoomCap = 120 * BOOST;
  else if (zoom >= 17) highZoomCap = 180 * BOOST;
  else if (zoom >= 16) highZoomCap = 260 * BOOST;
  else if (zoom >= 15) highZoomCap = 380 * BOOST;
  return Math.max(MIN_RADIUS * (zoom >= 15 ? 0 : 1) + (zoom >= 15 ? 60 * BOOST : 0),
    Math.min(highZoomCap, Math.min(MAX_RADIUS, raw)));
};

/** Compute density factor from visible site count — aggressive shrink in dense zones */
export const computeDensityFactor = (visibleCount: number): number => {
  if (visibleCount > 400) return 0;
  if (visibleCount > 200) return 0.1;
  if (visibleCount > 100) return 0.2;
  if (visibleCount > 60) return 0.4;
  if (visibleCount > 25) return 0.65;
  return 1;
};

// ───────────────────────────────────────────────────────────────────────────────
// Smart Auto: density-adaptive beam rendering (hexbin sites/km² + percentile)
// ───────────────────────────────────────────────────────────────────────────────

export interface SitePoint {
  id: string;
  lat: number;
  lng: number;
}

export interface SiteDensityInfo {
  /** Local density in sites/km² (raw) */
  density: number;
  /** Percentile rank in [0, 1] across the visible set */
  percentile: number;
  /** Final beam scale ∈ [0.40, 1.15] */
  beamScale: number;
  /** Adaptive opacity multiplier ∈ [0.15, 0.85] (lower in dense zones) */
  opacityScale: number;
  /** Stroke scale ∈ [0.2, 1.0] (reduced/hidden in dense zones) */
  strokeScale: number;
  /** Whether this site should be rendered (LOD filtering) */
  visible: boolean;
  /** Rendering priority (0=low, 1=high) — for importance-based filtering */
  priority: number;
}

/** Pick a hex cell size (in km) appropriate for the current zoom level. */
const hexSizeKmForZoom = (zoom: number): number => {
  if (zoom <= 6) return 50;
  if (zoom <= 8) return 20;
  if (zoom <= 10) return 8;
  if (zoom <= 11) return 4;
  if (zoom <= 12) return 2;
  if (zoom <= 13) return 1;
  if (zoom <= 14) return 0.5;
  return 0.25;
};

/**
 * Hexbin-based local density: sites/km² for each input site.
 * Uses an axial hex grid (flat-top) sized proportionally to current zoom.
 * Returns a Map keyed by site id with full SiteDensityInfo (density, percentile,
 * beamScale, opacityScale).
 *
 * Formula (Smart Auto):
 *   beamScale   = clamp(1.20 - 0.55 * sqrt(percentile), 0.65, 1.20)
 *   opacityScale = clamp(1.00 - 0.45 * percentile,       0.55, 1.00)
 */
export const computeSmartAutoDensity = (
  sites: SitePoint[],
  zoom: number,
  /** LOD aggressiveness: 1.0 = default, >1 = more aggressive filtering */
  lodFactor: number = 1.0,
): Map<string, SiteDensityInfo> => {
  const result = new Map<string, SiteDensityInfo>();
  if (!sites || sites.length === 0) return result;

  const hexKm = hexSizeKmForZoom(zoom);
  // Hex area (flat-top, edge length = hexKm/2 → height = hexKm)
  // Approximation: area ≈ (3√3/2) * a²  with a = hexKm/2  →  ~0.6495 * hexKm²
  const hexAreaKm2 = (3 * Math.sqrt(3) / 2) * Math.pow(hexKm / 2, 2);

  // Convert lat/lng → planar km via equirectangular projection around mean lat.
  const meanLat = sites.reduce((s, p) => s + p.lat, 0) / sites.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const KM_PER_DEG_LAT = 111.32;
  const toXY = (lat: number, lng: number): [number, number] => [
    lng * KM_PER_DEG_LAT * cosLat,
    lat * KM_PER_DEG_LAT,
  ];

  // Axial hex bin assignment (pointy-top), size = hexKm/2
  const size = hexKm / 2;
  const binOf = (x: number, y: number): string => {
    // pointy-top axial coords
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;
    // round to nearest hex
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - (-q - r));
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return `${rq},${rr}`;
  };

  const counts = new Map<string, number>();
  const siteBin = new Map<string, string>();
  for (const s of sites) {
    const [x, y] = toXY(s.lat, s.lng);
    const key = binOf(x, y);
    siteBin.set(s.id, key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Compute density per site (sites/km²) and the sorted distribution for percentile rank.
  const densities: number[] = [];
  const siteDensity = new Map<string, number>();
  for (const s of sites) {
    const key = siteBin.get(s.id)!;
    const d = (counts.get(key) ?? 1) / hexAreaKm2;
    siteDensity.set(s.id, d);
    densities.push(d);
  }
  densities.sort((a, b) => a - b);

  const percentileOf = (d: number): number => {
    // binary search for first index where densities[i] >= d → fraction strictly below
    let lo = 0;
    let hi = densities.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (densities[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return densities.length <= 1 ? 0 : lo / (densities.length - 1);
  };

  // Assign a stable hash-based priority to each site for consistent LOD filtering
  const hashPriority = (id: string): number => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000) / 1000;
  };

  for (const s of sites) {
    const density = siteDensity.get(s.id) ?? 0;
    const p = percentileOf(density);

    // Size: aggressive shrink in dense zones
    const beamScale = Math.max(0.40, Math.min(1.15, 1.15 - 0.70 * Math.sqrt(p)));

    // Opacity: strong fade in dense zones (prevents color blending)
    const opacityScale = Math.max(0.15, Math.min(0.85, 0.85 - 0.65 * p));

    // Stroke: reduce/hide outlines in dense zones (reduces visual noise)
    const strokeScale = Math.max(0.2, Math.min(1.0, 1.0 - 0.70 * p));

    // LOD filtering: in very dense areas, only render a subset
    // lodFactor > 1 makes filtering more aggressive (used at zoom 12-13)
    const priority = hashPriority(s.id);
    let visible = true;
    const lf = lodFactor;
    if (p > 0.95) visible = priority < 0.08 * lf;
    else if (p > 0.90) visible = priority < 0.20 * lf;
    else if (p > 0.85) visible = priority < 0.40 * lf;
    else if (p > 0.80) visible = priority < 0.60 * lf;
    else if (p > 0.70 && lf > 1) visible = priority < 0.80 * lf;

    result.set(s.id, { density, percentile: p, beamScale, opacityScale, strokeScale, visible, priority });
  }

  return result;
};

/**
 * Convert a Smart Auto beamScale (∈ [0.80, 1.20]) into the legacy
 * `densityFactor` parameter expected by getZoomAwareRadius (∈ [0, 1]).
 *
 * getZoomAwareRadius applies: targetPx *= 0.55 + 0.45 * densityFactor
 * We want the resulting overall multiplier on radius to equal beamScale,
 * relative to the baseline densityFactor = 1 (i.e. multiplier 1.0).
 *
 *   0.55 + 0.45 * df = beamScale  →  df = (beamScale - 0.55) / 0.45
 */
export const beamScaleToDensityFactor = (beamScale: number): number => {
  const df = (beamScale - 0.55) / 0.45;
  return Math.max(0, Math.min(1, df));
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
  // 2G bands — biggest beams (widest coverage, low frequency)
  GSM900:   1.30,
  GSM1800:  1.15,
  // 3G bands — large beams
  UMTS900:  1.10,
  UMTS2100: 0.95,
  // 4G bands — medium beams
  L700:   0.90,
  L800:   0.85,
  L900:   0.80,
  L1800:  0.70,
  L2100:  0.62,
  L2600:  0.55,
  // 5G bands — smallest beams (high frequency, narrow coverage)
  NR700:  0.75,
  NR2100: 0.55,
  NR3500: 0.42,
};

/** Get a radius scale factor based on band (lower freq = bigger). Falls back to 0.75. */
export const getBandSizeScale = (bandKey: string | null): number => {
  if (!bandKey) return 0.75;
  return BAND_PRIORITY[bandKey] ?? 0.75;
};

/**
 * Cell-count density scale: sites with more cells get bigger sectors.
 * Uses sqrt scaling to prevent visual explosion on dense sites, clamped to [0.7, 1.6].
 *
 *   scale = clamp( sqrt(cellCount / REF) , MIN, MAX )
 *
 * REF = 6 cells (typical tri-sector tri-tech site) → scale ≈ 1.0
 * 1 cell  → 0.70 (clamped) | 6 cells → 1.00 | 12 cells → 1.41 | 24+ cells → 1.60
 */
export const getCellCountScale = (cellCount: number): number => {
  if (!Number.isFinite(cellCount) || cellCount <= 0) return 0.7;
  const REF = 6;
  const MIN = 0.7;
  const MAX = 1.6;
  const raw = Math.sqrt(cellCount / REF);
  return Math.max(MIN, Math.min(MAX, raw));
};
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
