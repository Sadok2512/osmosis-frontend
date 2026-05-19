/**
 * pci-overlay.js
 * ──────────────
 * Build the Voronoï coverage polygons + color them by PCI (Physical Cell
 * Identifier). Companion of kpi-overlay.js — same geometry pipeline,
 * different value & color logic.
 *
 * Decision : docs/decisions party 2026-05-18 (Winston/Amelia/Sally/John).
 *   - Default coloring : PCI mod 3 (pilot group — what RAN engineers
 *     watch first when chasing PCS/SSS confusion).
 *   - Optional mode 'hash-stable' for full PCI plan drill-down.
 *   - Band filter REQUIRED — PCI is meaningful per band only.
 *
 * Input :
 *   - cells: Array<Cell>  (lat, lon, id, pci, band, ...)
 *   - view : { band: string, colorMode?: 'mod3' | 'hash' }
 *
 * Output: GeoJSON FeatureCollection where each feature carries :
 *   - all cell metadata
 *   - pci, band, pilotGroup (= pci % 3)
 *   - color: rgb(...) string ready for fillColor
 */

import { voronoiCells } from './voronoi.js';

const DEFAULTS = {
  maxRadiusMeters: 5000,
  bboxPaddingDegrees: 0.05,
  /** 'mod3' | 'hash'  — default is mod3 (Sally's UX call) */
  colorMode: 'mod3',
};

// Pilot group palette — soft RF-planning colors. Kept intentionally pastel:
// the Leaflet layer controls transparency, so these hues tint the basemap
// instead of masking it.
const MOD3_COLORS = {
  0: 'rgb(244, 137, 122)',  // soft coral
  1: 'rgb(103, 174, 232)',  // soft RF blue
  2: 'rgb(246, 209, 107)',  // soft amber
};

// Hash-stable HSL color from PCI value. Golden-angle hue rotation gives
// max separation between consecutive PCIs (same as d3-scale rainbow).
function hashStableColor(pci) {
  if (pci == null || !Number.isFinite(pci)) return 'rgb(203, 213, 225)';
  const hue = (pci * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 72%)`;
}

function stableHash(value) {
  const s = String(value == null ? '' : value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fallbackColor(seed) {
  const hue = stableHash(seed) % 360;
  return `hsl(${hue}, 68%, 76%)`;
}

function colorForPci(pci, mode, fallbackSeed = '') {
  if (pci == null || !Number.isFinite(pci)) return fallbackColor(fallbackSeed);
  if (mode === 'hash') return hashStableColor(pci);
  // default mod3
  return MOD3_COLORS[pci % 3] || fallbackColor(fallbackSeed);
}

export function buildPciOverlay({ cells, view, options = {} }) {
  const cfg = { ...DEFAULTS, ...options };
  const t0 = performance.now();

  if (!Array.isArray(cells) || cells.length === 0) {
    return { fc: { type: 'FeatureCollection', features: [] }, nCells: 0, elapsedMs: 0 };
  }
  if (!view || !view.band) {
    throw new Error('buildPciOverlay: view.band is required (PCI is band-scoped).');
  }

  // 1) Filter by selected band BEFORE Voronoï — different bands have
  //    independent PCI plans, mixing them produces a meaningless map.
  const bandUpper = String(view.band).toUpperCase();
  const filtered = cells.filter((c) => {
    if (!c || c.lat == null || c.lon == null) return false;
    const cellBand = String(c.band || '').toUpperCase();
    return cellBand === bandUpper;
  });

  if (filtered.length === 0) {
    return { fc: { type: 'FeatureCollection', features: [] }, nCells: 0, elapsedMs: 0, band: view.band };
  }

  // 2) Voronoï on SECTOR seeds, not raw site coordinates. Cells on the same
  //    physical site share lat/lon, so a raw Voronoï collapses visually to
  //    one site polygon. Offset each sector a few metres along its azimuth;
  //    bissectors then create one RF polygon per serving sector.
  const AZ_BUCKET_DEG = 5;
  const SECTOR_OFFSET_M = 120;
  const latRef = filtered.reduce((sum, c) => sum + Number(c.lat || 0), 0) / filtered.length;
  const M_PER_DEG_LAT = 111000;
  const M_PER_DEG_LNG = 111000 * Math.cos((latRef * Math.PI) / 180);
  const seedMap = new Map();
  for (const c of filtered) {
    const azRaw = Number(c.azimuth);
    const az = Number.isFinite(azRaw) ? ((azRaw % 360) + 360) % 360 : 0;
    const azBucket = Math.round(az / AZ_BUCKET_DEG) * AZ_BUCKET_DEG;
    const siteKey = c.siteId || c.siteName || c.id;
    const key = `${siteKey}|${bandUpper}|${azBucket}`;
    const rad = (az * Math.PI) / 180;
    const x = c.lon * M_PER_DEG_LNG + Math.sin(rad) * SECTOR_OFFSET_M;
    const y = c.lat * M_PER_DEG_LAT + Math.cos(rad) * SECTOR_OFFSET_M;
    const pci = typeof c.pci === 'number' ? c.pci : (c.pci != null ? Number(c.pci) : null);
    const acc = seedMap.get(key);
    if (!acc) {
      seedMap.set(key, { ...c, x, y, azimuth: az, cellIds: [c.id], pci });
    } else {
      acc.cellIds.push(c.id);
      if (!Number.isFinite(acc.pci) && Number.isFinite(pci)) acc.pci = pci;
    }
  }
  const seeds = [...seedMap.values()];
  const padM = Math.max(cfg.maxRadiusMeters * 2, 50000);
  const bbox = [
    Math.min(...seeds.map((s) => s.x)) - padM,
    Math.min(...seeds.map((s) => s.y)) - padM,
    Math.max(...seeds.map((s) => s.x)) + padM,
    Math.max(...seeds.map((s) => s.y)) + padM,
  ];
  const { polys } = voronoiCells(seeds, bbox);

  const mode = (view.colorMode === 'hash') ? 'hash' : 'mod3';

  // 3) Build features — same shape as KPI overlay (close ring + radial clip)
  const features = [];
  seeds.forEach((cell, i) => {
    const poly = polys[i];
    if (!poly || poly.length === 0) return;

    const validPci = Number.isFinite(cell.pci) ? cell.pci : null;
    const pilotGroup = validPci != null ? validPci % 3 : null;

    // Radial clip — bound the Voronoï cell to a max radius around its
    // seed (default 5km via maxRadiusMeters). Same logic as kpi-overlay.js
    // to keep coverage bubbles physically plausible. Without it, isolated
    // cells get giant wedges that reach the bbox edges.
    const Rm = cell.maxRadius ?? cfg.maxRadiusMeters;
    const clipped = poly.map((p) => {
      const dx = p.x - cell.x;
      const dy = p.y - cell.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= Rm) return [p.x / M_PER_DEG_LNG, p.y / M_PER_DEG_LAT];
      const f = Rm / d;
      return [(cell.x + dx * f) / M_PER_DEG_LNG, (cell.y + dy * f) / M_PER_DEG_LAT];
    });
    if (clipped.length === 0) return;
    clipped.push(clipped[0]); // close ring — REQUIRED by GeoJSON Polygon spec

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [clipped] },
      properties: {
        id:        cell.id,
        cellIds:   cell.cellIds || [cell.id],
        siteId:    cell.siteId,
        siteName:  cell.siteName,
        lat:       cell.lat,
        lon:       cell.lon,
        tech:      cell.tech,
        band:      cell.band || view.band,
        azimuth:   cell.azimuth,
        beamwidth: cell.beamwidth,
        pci:       validPci,
        pilotGroup,
        color:     colorForPci(validPci, mode, `${cell.id}|${cell.siteId}|${cell.azimuth}|${cell.band}`),
        colorSource: validPci == null ? 'fallback' : 'pci',
      },
    });
  });

  return {
    fc: { type: 'FeatureCollection', features },
    nCells: features.length,
    band: view.band,
    colorMode: mode,
    elapsedMs: performance.now() - t0,
  };
}

// Expose helpers so the legend/tooltip can stay in sync with the color logic.
export const PCI_PALETTE = MOD3_COLORS;
export { colorForPci, hashStableColor, fallbackColor };
