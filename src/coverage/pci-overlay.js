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

// Pilot group palette — 3 saturated, color-blind-safe primaries.
// (Avoiding pure red/green pair which gives the worst deuteranopia hit.)
const MOD3_COLORS = {
  0: 'rgb(220, 70, 60)',    // warm red
  1: 'rgb(80, 160, 230)',   // sky blue
  2: 'rgb(245, 195, 60)',   // amber yellow
};

// Hash-stable HSL color from PCI value. Golden-angle hue rotation gives
// max separation between consecutive PCIs (same as d3-scale rainbow).
function hashStableColor(pci) {
  if (pci == null || !Number.isFinite(pci)) return 'rgb(160,160,160)';
  const hue = (pci * 137.508) % 360;
  // Saturation/lightness tuned for the dark map base : 65% / 55% gives
  // visible polygons without burning the eyes at high cell density.
  return `hsl(${hue.toFixed(1)}, 65%, 55%)`;
}

function colorForPci(pci, mode) {
  if (pci == null || !Number.isFinite(pci)) return 'rgb(140,140,140)';
  if (mode === 'hash') return hashStableColor(pci);
  // default mod3
  return MOD3_COLORS[pci % 3] || 'rgb(140,140,140)';
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

  // 2) Voronoï on filtered set (every band gets its own tessellation)
  const seeds = filtered.map((c) => ({ x: c.lon, y: c.lat }));
  const lats = filtered.map((c) => c.lat);
  const lons = filtered.map((c) => c.lon);
  const pad = cfg.bboxPaddingDegrees;
  const bbox = [
    Math.min(...lons) - pad,
    Math.min(...lats) - pad,
    Math.max(...lons) + pad,
    Math.max(...lats) + pad,
  ];
  const { polys } = voronoiCells(seeds, bbox);

  const mode = (view.colorMode === 'hash') ? 'hash' : 'mod3';

  // 3) Build features
  const features = filtered.map((cell, i) => {
    const poly = polys[i];
    if (!poly) return null;
    const pci = typeof cell.pci === 'number' ? cell.pci : (cell.pci != null ? Number(cell.pci) : null);
    const validPci = Number.isFinite(pci) ? pci : null;
    const pilotGroup = validPci != null ? validPci % 3 : null;
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [poly] },
      properties: {
        ...cell,
        pci: validPci,
        pilotGroup,
        color: colorForPci(validPci, mode),
        band: cell.band || view.band,
      },
    };
  }).filter(Boolean);

  return {
    fc: { type: 'FeatureCollection', features },
    nCells: filtered.length,
    band: view.band,
    colorMode: mode,
    elapsedMs: performance.now() - t0,
  };
}

// Expose helpers so the legend/tooltip can stay in sync with the color logic.
export const PCI_PALETTE = MOD3_COLORS;
export { colorForPci, hashStableColor };
