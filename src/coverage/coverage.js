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
import { colorForPci } from './pci-overlay.js';

const DEFAULTS = {
  maxRadiusMeters: 1500,
  neighborLimit: 30,
  bboxPaddingMeters: 5000,
  diskSegments: 24,
  wedgeSegments: 12,
  maxVoronoiCells: 500,
  sectorBucketDegrees: 5,
  sectorOffsetMeters: 100,
  visualRadiusMeters: 10000,
  visualRadiusSegments: 32,
  minRfRadiusMeters: 180,
  maxRfRadiusMeters: 5200,
  maxRfAreaSqKm: 42,
};

// 'unknown' is the No-data tier (grey) used when every cell of a site is
// missing a KPI reading. We rank it BELOW 'green' so any real reading
// promotes the site out of "no data" — i.e. a site with 1 green + 5
// unknown cells is shown green, not grey.
const KPI_RANK = { unknown: -1, green: 0, orange: 1, red: 2 };

function techGroup(value) {
  const v = String(value || '').toUpperCase();
  if (v.includes('NR') || v.includes('5G')) return '5G';
  if (v.includes('LTE') || v.includes('4G')) return '4G';
  if (v.includes('UMTS') || v.includes('WCDMA') || v.includes('3G')) return '3G';
  if (v.includes('GSM') || v.includes('2G')) return '2G';
  return 'unknown';
}

function dominantTech(values) {
  const groups = new Set(Array.from(values || []).map(techGroup));
  for (const g of ['5G', '4G', '3G', '2G']) {
    if (groups.has(g)) return g;
  }
  return 'unknown';
}

function pciNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function colorForCellPci(cell) {
  const pci = pciNumber(cell?.pci);
  return colorForPci(pci, 'hash', `${cell?.id || ''}|${cell?.siteId || ''}|${cell?.siteName || ''}|${cell?.azimuth || ''}|${cell?.band || ''}`);
}

function representativePci(cells) {
  for (const c of cells || []) {
    const pci = pciNumber(c?.pci);
    if (pci != null) return pci;
  }
  return null;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function siteKeyOf(seed) {
  return seed.siteId || seed.siteName || seed.id || '';
}

function computeAdaptiveRfRadii(seeds, cfg) {
  const maxByArea = Math.sqrt((Number(cfg.maxRfAreaSqKm || 42) * 1_000_000) / Math.PI);
  const hardMax = Math.min(Number(cfg.maxRfRadiusMeters || 5200), maxByArea);
  const minR = Number(cfg.minRfRadiusMeters || 450);
  return seeds.map((seed, i) => {
    const distances = [];
    const key = siteKeyOf(seed);
    const sx = Number.isFinite(seed.siteX) ? seed.siteX : seed.x;
    const sy = Number.isFinite(seed.siteY) ? seed.siteY : seed.y;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const other = seeds[j];
      if (siteKeyOf(other) === key) continue;
      const ox = Number.isFinite(other.siteX) ? other.siteX : other.x;
      const oy = Number.isFinite(other.siteY) ? other.siteY : other.y;
      const d = Math.hypot(ox - sx, oy - sy);
      if (Number.isFinite(d) && d > 1) distances.push(d);
    }
    distances.sort((a, b) => a - b);
    if (distances.length === 0) return Math.min(hardMax, 2600);
    const d1 = distances[0];
    const d2 = distances[1] ?? d1;
    const d3 = distances[2] ?? d2;
    const densityDistance = (d1 * 0.58) + (d2 * 0.27) + (d3 * 0.15);
    const urbanFactor = d1 < 450 ? 0.34 : d1 < 900 ? 0.42 : d1 < 1600 ? 0.52 : 0.72;
    const nearestCap = d1 * urbanFactor;
    const densityCap = densityDistance * (d1 < 900 ? 0.30 : 0.42);
    const raw = Math.min(nearestCap, densityCap, hardMax);
    return clampNumber(raw, minR, hardMax);
  });
}

function orientedRfClip(seed, radiusMeters, cfg) {
  if (seed.isOmni) {
    return approximateDisk({ x: seed.siteX ?? seed.x, y: seed.siteY ?? seed.y }, radiusMeters, 6);
  }
  const beam = Number(seed.beamwidth);
  const realisticBeam = Number.isFinite(beam) && beam > 0
    ? clampNumber(beam * 1.75, 95, 155)
    : 120;
  const az = Number.isFinite(Number(seed.azimuth)) ? Number(seed.azimuth) : 0;
  return approximateWedge(
    { x: seed.siteX ?? seed.x, y: seed.siteY ?? seed.y },
    radiusMeters,
    az - realisticBeam / 2,
    az + realisticBeam / 2,
    cfg.wedgeSegments,
  );
}

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

  // 2026-05-19 — Cell footprint now uses the same visual model as KPI/PCI
  // overlays: one Voronoi polygon per serving sector seed, colored by PCI.
  // The old site-footprint + wedge pipeline is intentionally bypassed here
  // because operators expect this mode to render real polygon tiles, not
  // circles or site-level blobs.
  return buildCellPciPolygons(cells, cfg, t0);
}

function buildCellPciPolygons(cells, cfg, t0) {
  const validCells = (cells || []).filter((c) =>
    c != null
    && Number.isFinite(Number(c.lat))
    && Number.isFinite(Number(c.lon))
    && (c.id || c.siteId || c.siteName)
  );

  const empty = () => ({
    fc: { type: 'FeatureCollection', features: [] },
    wedgesFc: { type: 'FeatureCollection', features: [] },
    nSites: 0,
    nCells: 0,
    nNeighbors: 0,
    elapsedMs: Math.round(performance.now() - t0),
  });
  if (validCells.length === 0) return empty();

  // Match the live KPI overlay adapter, not the older JS demo helper:
  // project to flat metres, merge colocated cells by site+azimuth bucket,
  // offset each sector seed a little along azimuth, then clip the Voronoï
  // polygon by adaptive site density and sector direction. Raw lon/lat
  // seeds collapse colocated sectors into one site polygon, which is the
  // bug reported on Cell Footprint.
  const latRef = validCells.reduce((sum, c) => sum + Number(c.lat), 0) / validCells.length;
  const M_PER_DEG_LAT = 111000;
  const M_PER_DEG_LNG = 111000 * Math.cos((latRef * Math.PI) / 180);
  const seedMap = new Map();
  for (const raw of validCells) {
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    const azRaw = Number(raw.azimuth);
    const az = Number.isFinite(azRaw) ? ((azRaw % 360) + 360) % 360 : 0;
    const azBucket = Math.round(az / cfg.sectorBucketDegrees) * cfg.sectorBucketDegrees;
    const siteKey = raw.siteId || raw.siteName || raw.id || `${lat},${lon}`;
    const key = `${siteKey}|${azBucket}`;
    const rad = (az * Math.PI) / 180;
    const siteX = lon * M_PER_DEG_LNG;
    const siteY = lat * M_PER_DEG_LAT;
    const x = siteX + Math.sin(rad) * cfg.sectorOffsetMeters;
    const y = siteY + Math.cos(rad) * cfg.sectorOffsetMeters;
    const id = raw.id || `${siteKey}-${azBucket}`;
    const pci = pciNumber(raw.pci);
    const acc = seedMap.get(key);
    if (!acc) {
      seedMap.set(key, {
        ...raw,
        id,
        cellIds: [id],
        lat,
        lon,
        x,
        y,
        siteX,
        siteY,
        azimuth: az,
        beamwidth: Number(raw.beamwidth),
        pci,
      });
    } else {
      acc.cellIds.push(id);
      if (acc.pci == null && pci != null) acc.pci = pci;
      if (!acc.band && raw.band) acc.band = raw.band;
      if (!acc.tech && raw.tech) acc.tech = raw.tech;
    }
  }

  let seeds = [...seedMap.values()];
  const seedsTotal = seeds.length;
  if (seeds.length === 0) return empty();

  const siteSeedCounts = new Map();
  for (const seed of seeds) {
    const key = seed.siteId || seed.siteName || seed.id;
    siteSeedCounts.set(key, (siteSeedCounts.get(key) || 0) + 1);
  }
  seeds = seeds.map((seed) => {
    const siteKey = seed.siteId || seed.siteName || seed.id;
    const isOmni = (siteSeedCounts.get(siteKey) || 0) === 1;
    if (!isOmni) return { ...seed, isOmni: false };
    return {
      ...seed,
      isOmni: true,
      x: seed.siteX,
      y: seed.siteY,
      azimuth: 0,
      beamwidth: 360,
    };
  });

  if (seeds.length > cfg.maxVoronoiCells) {
    const centreLat = Number(cfg.mapCenter?.lat);
    const centreLon = Number(cfg.mapCenter?.lon);
    const cx = (Number.isFinite(centreLon) ? centreLon : seeds.reduce((sum, s) => sum + s.lon, 0) / seeds.length) * M_PER_DEG_LNG;
    const cy = (Number.isFinite(centreLat) ? centreLat : seeds.reduce((sum, s) => sum + s.lat, 0) / seeds.length) * M_PER_DEG_LAT;
    seeds = seeds
      .map((s) => ({ s, d: (s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, cfg.maxVoronoiCells)
      .map((entry) => entry.s);
  }

  const padM = Math.max(cfg.visualRadiusMeters * 2, 50000);
  const bbox = [
    Math.min(...seeds.map((s) => s.x)) - padM,
    Math.min(...seeds.map((s) => s.y)) - padM,
    Math.max(...seeds.map((s) => s.x)) + padM,
    Math.max(...seeds.map((s) => s.y)) + padM,
  ];
  const { polys, neighborGraph } = voronoiCells(
    seeds.map((s) => ({ x: s.x, y: s.y })),
    bbox,
    { neighborLimit: cfg.neighborLimit },
  );
  const adaptiveRadii = computeAdaptiveRfRadii(seeds, cfg);

  const features = [];
  let totalNeighbors = 0;
  seeds.forEach((cell, i) => {
    const poly = polys[i];
    if (!poly || poly.length < 3) return;

    const radius = adaptiveRadii[i] || Math.min(cfg.visualRadiusMeters, cfg.maxRfRadiusMeters);
    const diskClip = approximateDisk(
      { x: cell.siteX ?? cell.x, y: cell.siteY ?? cell.y },
      radius,
      cell.isOmni ? 6 : cfg.visualRadiusSegments,
    );
    const boundedPoly = polygonIntersection(poly, diskClip);
    const sectorClip = orientedRfClip(cell, radius, cfg);
    const clippedPoly = polygonIntersection(boundedPoly, sectorClip);
    if (!clippedPoly || clippedPoly.length < 3) return;
    const clipped = clippedPoly.map((p) => [p.x / M_PER_DEG_LNG, p.y / M_PER_DEG_LAT]);
    clipped.push(clipped[0]);

    const neighbors = neighborGraph[i] ? neighborGraph[i].size : 0;
    totalNeighbors += neighbors;
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [clipped] },
      properties: {
        cellId: cell.id,
        cellIds: cell.cellIds || [cell.id],
        siteId: cell.siteId,
        siteName: cell.siteName,
        lat: cell.lat,
        lon: cell.lon,
        azimuth: cell.azimuth,
        beamwidth: cell.beamwidth,
        shape: cell.isOmni ? 'omni_hexagon' : 'sector_voronoi',
        tech: cell.tech,
        band: cell.band,
        pci: cell.pci,
        pilotGroup: cell.pci == null ? null : cell.pci % 3,
        color: colorForCellPci(cell),
        colorSource: cell.pci == null ? 'fallback' : 'pci',
        neighbors,
        rfRadiusMeters: Math.round(radius),
        cellCount: 1,
      },
    });
  });

  return {
    fc: { type: 'FeatureCollection', features: [] },
    wedgesFc: { type: 'FeatureCollection', features },
    nSites: new Set(seeds.map((s) => s.siteId || s.siteName || s.id)).size,
    nCells: features.length,
    nNeighbors: totalNeighbors,
    seedsTotal,
    capped: seedsTotal > seeds.length,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

function buildLegacySiteCoverage(cells, cfg, t0) {
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

    // Worst KPI across site's cells (red > orange > green > unknown).
    // Start from 'unknown' so a site with every cell missing a reading
    // surfaces as No-data (grey) instead of falsely green.
    let kpi = 'unknown';
    const technos = new Set();
    for (const c of s.cells) {
      if (c.tech) technos.add(c.tech);
      const rank = KPI_RANK[c.kpi] ?? KPI_RANK.unknown;
      if (rank > (KPI_RANK[kpi] ?? KPI_RANK.unknown)) kpi = c.kpi;
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
        primaryTech: dominantTech(technos),
        pci: representativePci(s.cells),
        color: colorForPci(representativePci(s.cells), 'hash', `${s.siteId}|${s.siteName}`),
        colorSource: representativePci(s.cells) == null ? 'fallback' : 'pci',
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
          pci: pciNumber(c.pci),
          pilotGroup: pciNumber(c.pci) == null ? null : pciNumber(c.pci) % 3,
          color: colorForCellPci(c),
          colorSource: pciNumber(c.pci) == null ? 'fallback' : 'pci',
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
