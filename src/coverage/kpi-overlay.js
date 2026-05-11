/**
 * kpi-overlay.js
 * ──────────────
 * Build the Voronoi coverage + color polygons by KPI value (composite).
 *
 * Inputs (from caller):
 *   - cells:     Array<Cell>                      (lat, lon, id, ...)
 *   - kpiValues: Map<cellId, Map<kpiName, number>>  raw values from backend
 *   - view:      { selectedKpis: string[], period: [start,end], ... }
 *   - catalog:   KPI catalog (see kpi-catalog.js)
 *
 * Output: GeoJSON FeatureCollection where each feature's `properties` carries:
 *   - all cell metadata
 *   - kpiValues   : { [kpiName]: { raw, normalized, unit, direction } }
 *   - compositeScore : number in [0..1], 1 = best
 *   - color       : rgb(...) string ready for fillColor
 *   - primaryKpi  : the first KPI of the view (used for the main legend)
 *   - primaryValue: raw value of primaryKpi
 *   - primaryUnit : unit string of primaryKpi
 *
 * The composite score is the unweighted mean of normalized [0..1] values,
 * with direction inversion for "lower-is-better" KPIs. You can swap the
 * combinator (e.g. weighted mean, min, max) by overriding cfg.combine.
 */

import { voronoiCells } from './voronoi.js';
import { findKpi, colorFromScore, DEFAULT_CATALOG } from './kpi-catalog.js';

const DEFAULTS = {
  maxRadiusMeters: 5000,
  bboxPaddingDegrees: 0.05,
  catalog: DEFAULT_CATALOG,
  /**
   * combine(normalizedValues) → composite score in [0..1].
   * Default: arithmetic mean.
   */
  combine: (values) => values.reduce((a, b) => a + b, 0) / values.length,
};

export function buildKpiOverlay({ cells, kpiValues, view, options = {} }) {
  const cfg = { ...DEFAULTS, ...options };
  const catalog = cfg.catalog;
  const t0 = performance.now();

  if (!cells.length) {
    return { fc: { type: 'FeatureCollection', features: [] }, nCells: 0, elapsedMs: 0 };
  }
  if (!view.selectedKpis || view.selectedKpis.length === 0) {
    throw new Error('buildKpiOverlay: view.selectedKpis must contain at least one KPI');
  }

  // 1) Voronoi between cells
  const seeds = cells.map((c) => ({ x: c.lon, y: c.lat }));
  const lats = cells.map((c) => c.lat);
  const lons = cells.map((c) => c.lon);
  const pad = cfg.bboxPaddingDegrees;
  const bbox = [
    Math.min(...lons) - pad,
    Math.min(...lats) - pad,
    Math.max(...lons) + pad,
    Math.max(...lats) + pad,
  ];
  const { polys } = voronoiCells(seeds, bbox);

  // 2) Pull raw values per cell × KPI; collect global min/max per KPI for normalization
  const perKpi = view.selectedKpis.map((kpiName) => {
    const kpiDef = findKpi(catalog, kpiName) || { unit: '', direction: 'higher' };
    const raws = [];
    cells.forEach((cell) => {
      const r = kpiValues?.get?.(cell.id)?.get?.(kpiName);
      raws.push(typeof r === 'number' && isFinite(r) ? r : null);
    });
    const finite = raws.filter((x) => x != null);
    const mn = finite.length ? Math.min(...finite) : 0;
    const mx = finite.length ? Math.max(...finite) : 1;
    const range = mx - mn || 1;
    return { name: kpiName, def: kpiDef, raws, mn, mx, range };
  });

  // 3) Per-cell aggregation
  const features = [];
  let primaryMin = Infinity;
  let primaryMax = -Infinity;
  const primaryKpiName = view.selectedKpis[0];

  cells.forEach((cell, i) => {
    const poly = polys[i];
    if (!poly || poly.length === 0) return;

    // Normalize each KPI's value for this cell into [0..1] where 1 = best
    const cellKpis = {};
    const normalizedScores = [];
    perKpi.forEach((k) => {
      const raw = k.raws[i];
      let norm = 0.5; // neutral when missing
      if (raw != null) {
        norm = (raw - k.mn) / k.range;            // 0..1, 1 = max raw value
        if (k.def.direction === 'lower') norm = 1 - norm;
      }
      cellKpis[k.name] = {
        raw,
        normalized: norm,
        unit: k.def.unit,
        direction: k.def.direction,
      };
      normalizedScores.push(norm);
    });

    const compositeScore = cfg.combine(normalizedScores);
    const color = colorFromScore(compositeScore);

    // primary KPI stats for the legend
    const primaryRaw = cellKpis[primaryKpiName]?.raw;
    if (typeof primaryRaw === 'number') {
      primaryMin = Math.min(primaryMin, primaryRaw);
      primaryMax = Math.max(primaryMax, primaryRaw);
    }

    // Radial clip safety bound
    const Rdeg = (cell.maxRadius ?? cfg.maxRadiusMeters) / 1000 / 111;
    const clipped = poly.map((p) => {
      const dLat = p.y - cell.lat;
      const dLon = p.x - cell.lon;
      const d = Math.sqrt(dLat * dLat + dLon * dLon);
      if (d <= Rdeg) return [p.x, p.y];
      const f = Rdeg / d;
      return [cell.lon + dLon * f, cell.lat + dLat * f];
    });
    if (clipped.length > 0) clipped.push(clipped[0]); // close ring

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [clipped] },
      properties: {
        id:        cell.id,
        siteId:    cell.siteId,
        siteName:  cell.siteName,
        lat:       cell.lat,
        lon:       cell.lon,
        tech:      cell.tech,
        band:      cell.band,
        azimuth:   cell.azimuth,
        beamwidth: cell.beamwidth,

        // KPI overlay payload
        kpiValues:      cellKpis,
        compositeScore,
        color,
        primaryKpi:     primaryKpiName,
        primaryValue:   primaryRaw ?? null,
        primaryUnit:    cellKpis[primaryKpiName]?.unit ?? '',
      },
    });
  });

  return {
    fc: { type: 'FeatureCollection', features },
    nCells: features.length,
    primaryKpi:    primaryKpiName,
    primaryMin:    Number.isFinite(primaryMin) ? primaryMin : 0,
    primaryMax:    Number.isFinite(primaryMax) ? primaryMax : 0,
    composite:     view.selectedKpis.length > 1,
    elapsedMs:     Math.round(performance.now() - t0),
    perKpiStats:   perKpi.map(({ name, mn, mx, def }) => ({
      name, min: mn, max: mx, unit: def.unit, direction: def.direction,
    })),
  };
}
