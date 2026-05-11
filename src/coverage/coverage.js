/**
 * coverage.js — Site-footprint visual coverage builder.
 *
 * Replaces the previous per-cell Voronoi tessellation that paved the
 * entire territory edge-to-edge (2026-05-11 refactor). Now each SITE
 * gets an isolated footprint (disk ∩ site-Voronoi) with one wedge per
 * sector on top, so the rendered map looks like islands of coverage
 * with visible empty space between distant sites — matching real RAN
 * tooling.
 *
 * Geometry pipeline (all in flat metres via equirectangular projection
 * around the bbox-mean latitude):
 *   1. Group cells by siteId.
 *   2. Voronoi over site centres (one seed per site, no azimuth bias).
 *   3. For each site:
 *        footprint = disk(site, maxRadius) ∩ voronoi-cell(site)
 *      For each cell in site:
 *        wedge = approximateWedge(site, cell.maxRadius, az ± bw/2)
 *        wedge = wedge ∩ footprint
 *
 * Site KPI = worst KPI across its cells (red > orange > green).
 */

import { voronoiCells } from './voronoi.js';
import {
  approximateDisk,
  approximateWedge,
  polygonIntersection,
} from './geometry.js';

const DEFAULTS = {
  maxRadiusMeters: 1500,
  neighborLimit: 30,
  bboxPaddingMeters: 5000,
  diskSegments: 24,
  wedgeSegments: 12,
};

const KPI_RANK = { green: 0, orange: 1, red: 2 };

//#region wedge-dedup
// Multiple cells per site can share the same azimuth (different techs/bands
// at the same physical antenna). Drawing all of them stacks identical
// wedges and saturates alpha to 1.0, killing the "daisy" pattern. Collapse
// cells into one representative per unique (site, azimuth bucket) and
// aggregate metadata (worst-case KPI, tech/band lists) for the tooltip.
const AZ_BUCKET = 5; // degrees — two cells within 5° of azimuth = same sector

function dedupSiteCells(cells) {
  const buckets = new Map();
  for (const c of cells) {
    const az = Number(c.azimuth);
    if (!Number.isFinite(az)) continue;
    const key = Math.round(az / AZ_BUCKET) * AZ_BUCKET;
    if (!buckets.has(key)) {
      buckets.set(key, {
        ...c,
        _mergedCount: 1,
        _techs: new Set(c.tech ? [c.tech] : []),
        _bands: new Set(c.band ? [c.band] : []),
        _worstKpi: c.kpi,
      });
    } else {
      const acc = buckets.get(key);
      acc._mergedCount++;
      if (c.tech) acc._techs.add(c.tech);
      if (c.band) acc._bands.add(c.band);
      if ((KPI_RANK[c.kpi] ?? 0) > (KPI_RANK[acc._worstKpi] ?? 0)) {
        acc._worstKpi = c.kpi;
      }
    }
  }
  return [...buckets.values()].map((c) => ({
    ...c,
    kpi:  c._worstKpi,
    tech: [...c._techs].sort().join(' + ') || c.tech,
    band: [...c._bands].sort().join(' + ') || c.band,
    cellCount: c._mergedCount,
  }));
}
//#endregion wedge-dedup

/**
 * @typedef {Object} Cell
 * @property {string} id
 * @property {string} siteId
 * @property {string} siteName
 * @property {number} lat
 * @property {number} lon
 * @property {number} azimuth   degrees, 0=N, clockwise
 * @property {number} beamwidth degrees
 * @property {number} [maxRadius] metres; per-cell override
 * @property {string} [tech]
 * @property {string} [band]
 * @property {'green'|'orange'|'red'} [kpi]
 * @property {number} [rsrp]
 */

/**
 * Build the site-coverage GeoJSON pair.
 *
 * @param {Cell[]} cells
 * @param {Partial<typeof DEFAULTS>} [opts]
 * @returns {{
 *   fc: GeoJSON.FeatureCollection,
 *   wedgesFc: GeoJSON.FeatureCollection,
 *   nSites: number,
 *   nCells: number,
 *   nNeighbors: number,
 *   elapsedMs: number,
 * }}
 */
export function buildSiteCoverage(cells, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const t0 = performance.now();

  // ── 1. Group cells by site ──
  const siteMap = new Map();
  for (const c of cells || []) {
    if (c == null || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const key = c.siteId || c.siteName || c.id;
    if (!key) continue;
    let s = siteMap.get(key);
    if (!s) {
      s = {
        siteId: c.siteId || key,
        siteName: c.siteName || key,
        lat: c.lat,
        lon: c.lon,
        cells: [],
      };
      siteMap.set(key, s);
    }
    s.cells.push(c);
  }
  const sites = Array.from(siteMap.values());

  const empty = () => ({
    fc: { type: 'FeatureCollection', features: [] },
    wedgesFc: { type: 'FeatureCollection', features: [] },
    nSites: 0,
    nCells: cells?.length || 0,
    nNeighbors: 0,
    elapsedMs: Math.round(performance.now() - t0),
  });
  if (sites.length === 0) return empty();

  // ── 2. Flat-metre projection (equirectangular at mean lat) ──
  const latRef = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
  const M_PER_DEG_LAT = 111000;
  const M_PER_DEG_LNG = 111000 * Math.cos((latRef * Math.PI) / 180);
  for (const s of sites) {
    s.x = s.lon * M_PER_DEG_LNG;
    s.y = s.lat * M_PER_DEG_LAT;
  }

  // bbox for the site-level Voronoi. Padding well past max radius so the
  // outermost disks aren't clipped by an artificial bounding box.
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const s of sites) {
    if (s.x < xmin) xmin = s.x;
    if (s.y < ymin) ymin = s.y;
    if (s.x > xmax) xmax = s.x;
    if (s.y > ymax) ymax = s.y;
  }
  const pad = Math.max(cfg.bboxPaddingMeters, cfg.maxRadiusMeters * 4);
  const bbox = [xmin - pad, ymin - pad, xmax + pad, ymax + pad];

  // ── 3. Voronoi over site centres ──
  const { polys, neighborGraph } = voronoiCells(
    sites.map((s) => ({ x: s.x, y: s.y })),
    bbox,
    { neighborLimit: cfg.neighborLimit },
  );

  //#region adaptive-radius
  // 2026-05-11. Hard-coded backend cell.maxRadius (2500 m) produced
  // footprints far larger than the actual cell coverage in suburban/
  // rural zones (sites ~3-5 km apart yielded wedges that overlapped
  // the basemap edge-to-edge). Instead of trusting the backend value
  // or `cfg.maxRadiusMeters` alone, compute an adaptive cap per site
  // from the nearest-neighbour distance: half of that distance is the
  // largest disk that can fit without crossing into the neighbour.
  // Clamped to [MIN_R, cfg.maxRadiusMeters] so dense urban sites stay
  // legible and isolated sites still get a sensible default.
  const NEIGHBOR_FRAC = 0.5;
  const MIN_R = 200;
  const adaptiveR = new Array(sites.length);
  for (let i = 0; i < sites.length; i++) {
    let nearest2 = Infinity;
    for (let j = 0; j < sites.length; j++) {
      if (i === j) continue;
      const dx = sites[j].x - sites[i].x;
      const dy = sites[j].y - sites[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearest2) nearest2 = d2;
    }
    const nearest = Number.isFinite(nearest2) ? Math.sqrt(nearest2) : Infinity;
    // Cap at cfg.maxRadiusMeters when the nearest neighbour is far
    // away (rural / isolated). Floor at MIN_R so urban-dense sites
    // don't shrink to a point.
    const r = Math.min(cfg.maxRadiusMeters, Math.max(MIN_R, nearest * NEIGHBOR_FRAC));
    adaptiveR[i] = r;
  }
  //#endregion adaptive-radius

  // ── 4. Footprints + wedges ──
  const siteFeatures = [];
  const wedgeFeatures = [];
  let totalNeighbors = 0;
  let totalCellsRendered = 0;

  const toLngLatRing = (poly) => {
    const ring = poly.map((p) => [p.x / M_PER_DEG_LNG, p.y / M_PER_DEG_LAT]);
    if (ring.length > 0) {
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push([fx, fy]);
    }
    return ring;
  };

  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const vPoly = polys[i];
    if (!vPoly || vPoly.length < 3) continue;

    // Per-site disk radius — adaptive (half-distance to nearest site,
    // clamped). The previous "max across cells" rule was thrown away
    // on 2026-05-11 because the backend hard-codes 2500 m on every
    // cell which silently dominated the global cfg cap and produced
    // gigantic footprints in semi-rural zones.
    const R = adaptiveR[i];

    // footprint = disk ∩ site-Voronoi.
    const disk = approximateDisk({ x: s.x, y: s.y }, R, cfg.diskSegments);
    const footprint = polygonIntersection(disk, vPoly);
    if (!footprint || footprint.length < 3) continue;

    // Worst KPI across site's cells (red > orange > green).
    let kpi = 'green';
    const technos = new Set();
    for (const c of s.cells) {
      if (c.tech) technos.add(c.tech);
      const rank = KPI_RANK[c.kpi] ?? 0;
      if (rank > (KPI_RANK[kpi] ?? 0)) kpi = c.kpi;
    }

    const nNeighbors = neighborGraph[i] ? neighborGraph[i].size : 0;
    totalNeighbors += nNeighbors;

    siteFeatures.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [toLngLatRing(footprint)] },
      properties: {
        siteId: s.siteId,
        siteName: s.siteName,
        kpi,
        nCells: s.cells.length,
        nNeighbors,
        technologies: Array.from(technos),
      },
    });

    // ── Wedges ──
    // Dedup by (siteId, azimuth bucket): a single physical sector often
    // appears N times in the cell list (once per techno × band). Drawing
    // identical wedges stacks alpha to 1.0 and hides the daisy pattern.
    // The dedup helper merges tech/band/KPI metadata into one rep.
    for (const c of dedupSiteCells(s.cells)) {
      const az = Number(c.azimuth);
      const bw = Number(c.beamwidth);
      if (!Number.isFinite(az) || !Number.isFinite(bw) || bw <= 0) continue;
      // Skip omni-ish wedges (≥ 180°) — they'd collapse to the disk,
      // which is already the base footprint. Drawing them on top would
      // just hide the sector geometry the operator came here for.
      if (bw >= 180) continue;
      // Wedge radius cannot exceed the site footprint cap (R) — if the
      // backend hands us a larger per-cell maxRadius the disk would
      // stick past the footprint and look broken after the intersection.
      const cellRadius = Number.isFinite(c.maxRadius) ? Math.min(c.maxRadius, R) : R;
      const wedge = approximateWedge(
        { x: s.x, y: s.y },
        cellRadius,
        az - bw / 2,
        az + bw / 2,
        cfg.wedgeSegments,
      );
      const clipped = polygonIntersection(wedge, footprint);
      if (!clipped || clipped.length < 3) continue;
      totalCellsRendered++;
      wedgeFeatures.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [toLngLatRing(clipped)] },
        properties: {
          cellId: c.id,
          siteId: s.siteId,
          siteName: s.siteName,
          kpi: c.kpi || kpi,
          azimuth: az,
          beamwidth: bw,
          tech: c.tech,
          band: c.band,
          rsrp: c.rsrp,
          neighbors: nNeighbors,
          cellCount: c.cellCount ?? 1,
        },
      });
    }
  }

  return {
    fc: { type: 'FeatureCollection', features: siteFeatures },
    wedgesFc: { type: 'FeatureCollection', features: wedgeFeatures },
    nSites: siteFeatures.length,
    nCells: totalCellsRendered,
    nNeighbors: totalNeighbors,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
