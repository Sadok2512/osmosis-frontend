/**
 * KpiOverlayAdapter — per-cell Voronoï KPI overlay (3-tier coloured).
 *
 * 2026-05-11 v2 refactor: bypass `initKpiOverlay()` (which forces a
 * 5-stop gradient colouring) and call `buildKpiOverlay()` directly to
 * get just the geometry. We then override `properties.color` per
 * feature with the 3-tier mapping from `kpiThresholds` (Bon / Moyen /
 * Critique / No-data) before rendering the layer ourselves via
 * `L.geoJSON`.
 *
 * The render pipeline:
 *   1. fetchCellsForCoverage(bbox)         → CoverageCell[]
 *   2. parent supplies kpiValueMap         (Map<cellId, number>)
 *   3. buildKpiOverlay({ cells, ... })     → GeoJSON FeatureCollection
 *      (per-cell Voronoï polygons, full pavage of the bbox)
 *   4. override f.properties.tierColor     from valueToTier(value, thresholds)
 *   5. L.geoJSON(fc, { style, onEachFeature })  + addTo(map)
 *   6. cleanup map.removeLayer on view/cells/bbox change
 *
 * No module file modification. The module's `kpi-overlay.js` exports
 * `buildKpiOverlay` for exactly this framework-agnostic use case.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchCellsForCoverage, CoverageCell } from '@/services/topoService';
// Module is plain JS without TS types — `any` shape is intentional.
// We bypass kpi-overlay.js::buildKpiOverlay (which radially clips every
// vertex to maxRadius/cell, breaking Voronoï edges) and call the raw
// `voronoiCells` half-plane clipper instead. Bissectors then do all
// the work, polygons stay perfectly polygonal.
import { voronoiCells } from '@/coverage/voronoi.js';

/** 3-tier palette aligned with the legacy KPI legend used in SitesMonitor.
 *  `unknown` is the No-data tier (basemap visible through translucent grey). */
const TIER_COLOR: Record<'green' | 'orange' | 'red' | 'unknown', string> = {
  green:   '#3a8a4f',
  orange:  '#e8862c',
  red:     '#b8334a',
  unknown: '#b0b8c0',
};

export interface KpiThresholds {
  green: number;
  orange: number;
  invert?: boolean;
}

export type KpiOverlayView = {
  name: string;
  tech: '4G' | '5G';
  level: 'Cellule' | 'Site';
  period: [string, string];
  selectedKpis: string[];
  aggregation?: 'avg' | 'sum' | 'max' | 'last';
};

interface Bounds { minLng: number; minLat: number; maxLng: number; maxLat: number; }

interface Props {
  enabled: boolean;
  bbox: Bounds | null;
  view: KpiOverlayView | null;
  /** Map<cell.id, numericValue> for the primary KPI of the view. Cells
   *  missing from this map land in tier 'unknown' (grey). */
  kpiValueMap?: Map<string, number> | null;
  kpiThresholds?: KpiThresholds | null;
  /** Legacy props kept for backward compatibility with prior wiring —
   *  ignored in the new direct-build path. */
  panelMount?: HTMLElement | null;
  catalogSource?: unknown;
}

/** Map a numeric value to a tier per the threshold rule. Returns
 *  `'unknown'` for null / undefined / NaN. */
function valueToTier(
  value: number | null | undefined,
  t: KpiThresholds | null | undefined,
): 'green' | 'orange' | 'red' | 'unknown' {
  if (!t || value == null || !Number.isFinite(value)) return 'unknown';
  if (t.invert) {
    if (value <= t.green)  return 'green';
    if (value <= t.orange) return 'orange';
    return 'red';
  }
  if (value >= t.green)  return 'green';
  if (value >= t.orange) return 'orange';
  return 'red';
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const KpiOverlayAdapter: React.FC<Props> = ({
  enabled,
  bbox,
  view,
  kpiValueMap,
  kpiThresholds,
}) => {
  const map = useMap();
  const [cells, setCells] = useState<CoverageCell[]>([]);
  const layerRef = useRef<L.GeoJSON | null>(null);

  // ── Fetch cells when bbox / enabled flips ──
  useEffect(() => {
    if (!enabled || !bbox) return;
    const ctrl = new AbortController();
    fetchCellsForCoverage(bbox, { signal: ctrl.signal })
      .then(({ cells: c }) => setCells(c))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.warn('[KpiOverlayAdapter] cells fetch failed:', err);
      });
    return () => ctrl.abort();
  }, [enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat]);

  // Scope guard for the level (UX 2026-05-11: 'Cellule' only).
  const levelOk = view?.level === 'Cellule';

  // ── Build + render the Voronoï layer ──
  useEffect(() => {
    // Common teardown helper — used both when disabling and at unmount.
    const removeLayer = () => {
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch { /* ignore */ }
      }
      layerRef.current = null;
    };

    if (!map || !enabled || !view || !levelOk || cells.length === 0 || !view.selectedKpis?.length) {
      removeLayer();
      return;
    }

    const kpiName = view.selectedKpis[0];

    //DIAG — KPI Overlay grey-rendering investigation (2026-05-11 v6.3.x).
    //DIAG Log #1: kpiValueMap reaching the adapter. Expect mapSize > 0 if
    //DIAG backend slow_path returns data; sampleKey format must match
    //DIAG sampleCellId from log #2 (otherwise key-mismatch → all 'unknown').
    // eslint-disable-next-line no-console
    console.log('[diag] kpi-overlay map:', {
      kpiName,
      hasMap: !!kpiValueMap,
      mapSize: kpiValueMap?.size ?? 0,
      sampleKey: kpiValueMap ? [...kpiValueMap.keys()].slice(0, 3) : [],
      sampleValue: kpiValueMap ? [...kpiValueMap.values()].slice(0, 3) : [],
      thresholds: kpiThresholds,
    });
    //DIAG Log #2: cells fed to buildKpiOverlay. Compare sampleCellId.id
    //DIAG against sampleKey above to spot any "CELL_*" prefix vs no-prefix
    //DIAG mismatch between fetchKpiCellValues output and CoverageCell.id.
    // eslint-disable-next-line no-console
    console.log('[diag] kpi-overlay cells input:', {
      nCells: cells.length,
      sampleCellId: cells.slice(0, 3).map((c) => ({ id: c.id, lat: c.lat, siteName: c.siteName })),
    });

    // Voronoï pavage — implemented directly (no radial clip) so the
    // bissectors form the only edges. We project (lon, lat) to flat
    // metres at the bbox-mean latitude so disks are round and bissector
    // angles are correct everywhere.
    //
    // 1) Deduplicate seeds by rounded (lat, lon): multiple cells at the
    //    same physical site share coordinates and voronoiCells gives
    //    degenerate empty polygons for duplicates. We aggregate the
    //    worst KPI tier across cells of each unique seed and emit ONE
    //    polygon per seed.
    const SEED_ROUND = 1e6; // ~10 cm
    type Seed = {
      x: number; y: number;
      cellIds: string[];
      siteName: string;
      tech: string;
      band: string;
      // worst tier across cells of this seed
      tier: 'green' | 'orange' | 'red' | 'unknown';
      rawValueForLegend: number | null;
    };
    const RANK = { green: 0, orange: 1, red: 2, unknown: -1 };
    const seedMap = new Map<string, Seed>();
    const latRefRaw = cells.reduce((s, c) => s + c.lat, 0) / cells.length;
    const M_PER_DEG_LAT = 111000;
    const M_PER_DEG_LNG = 111000 * Math.cos((latRefRaw * Math.PI) / 180);
    for (const c of cells) {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
      const key = `${Math.round(c.lat * SEED_ROUND)}|${Math.round(c.lon * SEED_ROUND)}`;
      const x = c.lon * M_PER_DEG_LNG;
      const y = c.lat * M_PER_DEG_LAT;
      const v = kpiValueMap?.get(c.id);
      const cellTier = valueToTier(v, kpiThresholds);
      const acc = seedMap.get(key);
      if (!acc) {
        seedMap.set(key, {
          x, y,
          cellIds: [c.id],
          siteName: c.siteName,
          tech: c.tech,
          band: c.band,
          tier: cellTier,
          rawValueForLegend: Number.isFinite(v as number) ? (v as number) : null,
        });
      } else {
        acc.cellIds.push(c.id);
        if (RANK[cellTier] > RANK[acc.tier]) {
          acc.tier = cellTier;
          if (Number.isFinite(v as number)) acc.rawValueForLegend = v as number;
        }
      }
    }
    const seeds = [...seedMap.values()];
    if (seeds.length === 0) {
      removeLayer();
      return;
    }

    // 2) bbox in flat-metres with generous padding (50 km) so the
    //    outermost cells aren't clipped to a hard rectangle inside the
    //    viewport.
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const s of seeds) {
      if (s.x < xmin) xmin = s.x;
      if (s.y < ymin) ymin = s.y;
      if (s.x > xmax) xmax = s.x;
      if (s.y > ymax) ymax = s.y;
    }
    const pad = 50000;
    const bboxFlat: [number, number, number, number] = [xmin - pad, ymin - pad, xmax + pad, ymax + pad];

    // 3) Voronoï half-plane clipping in flat-metres. No radial clip.
    let polys: Array<Array<{ x: number; y: number }>>;
    try {
      const r = voronoiCells(seeds.map((s) => ({ x: s.x, y: s.y })), bboxFlat);
      polys = r.polys;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KpiOverlayAdapter] voronoiCells threw:', err);
      removeLayer();
      return;
    }

    // 4) Build GeoJSON FeatureCollection (project back to lon/lat).
    const tierCounts: Record<string, number> = { green: 0, orange: 0, red: 0, unknown: 0 };
    const features: any[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const poly = polys[i];
      if (!poly || poly.length < 3) continue;
      const ring = poly.map((p) => [p.x / M_PER_DEG_LNG, p.y / M_PER_DEG_LAT] as [number, number]);
      // close the ring
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push([fx, fy]);
      tierCounts[s.tier] = (tierCounts[s.tier] || 0) + 1;
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          id: s.cellIds[0],
          cellIds: s.cellIds,
          siteName: s.siteName,
          tech: s.tech,
          band: s.band,
          tier: s.tier,
          tierColor: TIER_COLOR[s.tier],
          rawValue: s.rawValueForLegend,
          kpiName,
        },
      });
    }
    const fc = { type: 'FeatureCollection', features };

    //DIAG Log #3: post-build tier distribution. If everything lands in
    //DIAG `unknown` even with mapSize > 0 → key mismatch confirmed.
    //DIAG If `nFeatures` < nCells → some cells got dropped by the
    //DIAG Voronoï radial clip (raise maxRadiusMeters).
    // eslint-disable-next-line no-console
    console.log('[diag] kpi-overlay ready:', {
      nFeatures: fc.features.length,
      nCellsInput: cells.length,
      tierDistribution: tierCounts,
      sampleProps: fc.features.slice(0, 2).map((f: any) => ({
        id: f.properties.id,
        tier: f.properties.tier,
        rawValue: f.properties.rawValue,
        tierColor: f.properties.tierColor,
      })),
    });

    removeLayer();

    layerRef.current = L.geoJSON(fc as any, {
      style: (f: any) => ({
        fillColor: f.properties.tierColor,
        fillOpacity: 0.5,
        color: 'rgba(40,40,40,0.5)',
        weight: 0.5,
      }),
      onEachFeature: (feature: any, layer: any) => {
        const p = feature.properties;
        const valStr = p.rawValue == null ? '—' : Number(p.rawValue).toFixed(2);
        const tierLabel = p.tier === 'unknown' ? 'No data' : p.tier.toUpperCase();
        layer.bindTooltip(
          `<div class="cov-tt">
            <div class="cov-tt-name">${escapeHtml(p.id)}</div>
            <div class="cov-tt-row"><span>site</span><b>${escapeHtml(p.siteName)}</b></div>
            <div class="cov-tt-row"><span>tech</span><b>${escapeHtml(p.tech || '—')}${p.band ? ' · ' + escapeHtml(p.band) : ''}</b></div>
            <div class="cov-tt-row"><span>${escapeHtml(p.kpiName)}</span><b>${valStr}</b></div>
            <div class="cov-tt-row"><span>tier</span><b style="color:${p.tierColor}">${tierLabel}</b></div>
          </div>`,
          { className: 'cov-tooltip', sticky: true, direction: 'top' },
        );
        layer.on('mouseover', (e: any) =>
          e.target.setStyle({ weight: 1.5, fillOpacity: 0.7 }),
        );
        layer.on('mouseout', (e: any) =>
          e.target.setStyle({ weight: 0.5, fillOpacity: 0.5 }),
        );
      },
    });
    layerRef.current.addTo(map);

    return removeLayer;
    // Re-render triggers: cells signature, view identity, thresholds,
    // kpiValueMap reference. We use stable scalars + cell count to avoid
    // infinite re-renders when the parent rebuilds equal Maps.
  }, [
    map,
    enabled,
    levelOk,
    cells.length,
    cells[0]?.id,
    cells[cells.length - 1]?.id,
    view?.name,
    view?.selectedKpis?.join(','),
    kpiValueMap,
    kpiValueMap?.size,
    kpiThresholds?.green,
    kpiThresholds?.orange,
    kpiThresholds?.invert,
  ]);

  return null;
};

export default KpiOverlayAdapter;
