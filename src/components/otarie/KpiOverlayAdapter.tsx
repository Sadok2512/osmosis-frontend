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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchCellsForCoverage, CoverageCell } from '@/services/topoService';

/** Defensive cap on the number of Voronoï seeds rendered at once. The
 *  backend can return thousands of cells for a national dashboard; past
 *  this many seeds the half-plane clipper becomes the bottleneck (target
 *  <200 ms / 500 cells). When the filter exceeds the cap, we keep the
 *  500 sectors closest to the current map centre and surface the
 *  truncation in the legend. */
export const MAX_VORONOI_CELLS = 500;

/** Hard cap on the visual reach of a Voronoï polygon. The effective
 *  radius is reduced later by neighboring-site density so dense urban
 *  sectors stay compact while isolated cells cannot dominate the map. */
export const MAX_VISUAL_RADIUS_M = 5200;
/** Number of vertices used to approximate the radial clip. 32 is the
 *  default for `approximateDisk` here — visually round at typical
 *  zooms (>= 12) and cheap to clip (Sutherland–Hodgman is O(n·m)). */
const VISUAL_RADIUS_SEGMENTS = 32;
// Module is plain JS without TS types — `any` shape is intentional.
// We bypass kpi-overlay.js::buildKpiOverlay (which radially clips every
// vertex to maxRadius/cell, breaking Voronoï edges) and call the raw
// `voronoiCells` half-plane clipper instead. Bissectors then do all
// the work, polygons stay perfectly polygonal.
import { voronoiCells } from '@/coverage/voronoi.js';
// 2026-05-12 — re-use the convex primitives shipped in the drop-in
// module. Voronoï cells are clipped by adaptive site-radius and azimuth
// wedge so sparse edge cells cannot balloon while dense zones keep
// readable sectors.
import { approximateDisk, approximateWedge, polygonIntersection } from '@/coverage/geometry.js';

/** 3-tier palette aligned with the legacy KPI legend used in SitesMonitor.
 *  `unknown` is the No-data tier (basemap visible through translucent grey). */
const TIER_COLOR: Record<'green' | 'orange' | 'red' | 'unknown', string> = {
  green:   '#45d38f',
  orange:  '#ffb15f',
  red:     '#f05b76',
  unknown: '#cbd5e1',
};

type BasemapKind = 'light' | 'dark' | 'satellite' | 'street';

const KPI_BASEMAP_VISIBILITY: Record<BasemapKind, { fill: number; edge: number; halo: number }> = {
  satellite: { fill: 0.36, edge: 0.92, halo: 0.9 },
  dark:      { fill: 0.34, edge: 0.84, halo: 0.78 },
  street:    { fill: 0.28, edge: 0.72, halo: 0.64 },
  light:     { fill: 0.26, edge: 0.64, halo: 0.56 },
};

const MIN_RF_RADIUS_M = 180;
const MAX_RF_AREA_SQ_KM = 42;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seedSiteKey(seed: { siteId?: string; siteName?: string; siteX?: number; siteY?: number }): string {
  return seed.siteId || seed.siteName || `${seed.siteX ?? ''},${seed.siteY ?? ''}`;
}

function computeAdaptiveRfRadii<T extends { x: number; y: number; siteX: number; siteY: number; siteId?: string; siteName?: string }>(seeds: T[]): number[] {
  const maxByArea = Math.sqrt((MAX_RF_AREA_SQ_KM * 1_000_000) / Math.PI);
  const hardMax = Math.min(MAX_VISUAL_RADIUS_M, maxByArea);
  return seeds.map((seed, i) => {
    const distances: number[] = [];
    const key = seedSiteKey(seed);
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const other = seeds[j];
      if (seedSiteKey(other) === key) continue;
      const d = Math.hypot(other.siteX - seed.siteX, other.siteY - seed.siteY);
      if (Number.isFinite(d) && d > 1) distances.push(d);
    }
    distances.sort((a, b) => a - b);
    if (distances.length === 0) return Math.min(hardMax, 2600);
    const d1 = distances[0];
    const d2 = distances[1] ?? d1;
    const d3 = distances[2] ?? d2;
    const densityDistance = (d1 * 0.58) + (d2 * 0.27) + (d3 * 0.15);
    const urbanFactor = d1 < 450 ? 0.34 : d1 < 900 ? 0.42 : d1 < 1600 ? 0.52 : 0.72;
    return clampNumber(Math.min(d1 * urbanFactor, densityDistance * (d1 < 900 ? 0.30 : 0.42), hardMax), MIN_RF_RADIUS_M, hardMax);
  });
}

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

/** Dashboard / view scope filters used to shrink the Voronoï cell set
 *  to the operator's active perimeter. CSV-friendly (comma-separated
 *  values) — both the backend `/cells-for-coverage` query params AND
 *  the client-side defensive filter accept these. */
export interface KpiOverlayScopeFilters {
  techno?: string;
  vendor?: string;
  plaque?: string;
  dor?: string;
  cluster?: string;
  band?: string;
}

/** Stats emitted to the parent so the legend can surface "showing X of Y
 *  closest to map centre — zoom in to refine" when the dashboard filter
 *  exceeds MAX_VORONOI_CELLS. */
export interface KpiOverlayStats {
  /** Cells returned by `/cells-for-coverage` for the current bbox+scope. */
  backendCells: number;
  /** After client-side defensive scope filter (techno/vendor/band) AND
   *  the dashboard site allowlist. */
  afterFilter: number;
  /** Sectors after siteId|azimuth-bucket dedup (= number of polygon
   *  candidates before the cap). */
  seedsTotal: number;
  /** Polygons actually rendered (≤ MAX_VORONOI_CELLS). */
  rendered: number;
  /** True iff `seedsTotal > MAX_VORONOI_CELLS` and we picked the closest
   *  `MAX_VORONOI_CELLS` to the current map centre. */
  capped: boolean;
}

interface Props {
  enabled: boolean;
  basemapKind?: BasemapKind;
  bbox: Bounds | null;
  view: KpiOverlayView | null;
  /** Map<cell.id, numericValue> for the primary KPI of the view. Cells
   *  missing from this map land in tier 'unknown' (grey). */
  kpiValueMap?: Map<string, number> | null;
  kpiThresholds?: KpiThresholds | null;
  /** Active dashboard + topbar local filters (2026-05-12). Forwarded
   *  to the backend so the Voronoï polygon set matches the perimeter
   *  the operator sees in the dashboard; client-side defensive filter
   *  re-applies them after fetch in case the backend ever returns a
   *  superset. */
  scope?: KpiOverlayScopeFilters | null;
  /** Dashboard-filtered site allowlist as a comma-separated string of
   *  `site_name` (or `site_id`) values. Cells whose siteName / siteId
   *  is not in this set are dropped before Voronoï tessellation.
   *  `null` / empty = no allowlist (fall back to scope-only filtering).
   *  CSV is used over `Set<string>` so the React dep array stays stable
   *  by string identity rather than ref identity. */
  siteAllowlist?: string | null;
  /** Optional callback invoked whenever cell counts change, so the
   *  parent can render a cap-truncation notice in the legend. */
  onStats?: (s: KpiOverlayStats) => void;
  /** Legacy props kept for backward compatibility with prior wiring —
   *  ignored in the new direct-build path. */
  panelMount?: HTMLElement | null;
  catalogSource?: unknown;
}

/** CSV-aware match: empty filter = pass; otherwise UPPER compare. */
function csvMatches(filter: string | undefined, fieldValue: string | undefined): boolean {
  if (!filter) return true;
  const want = filter.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (want.length === 0) return true;
  const got = String(fieldValue ?? '').toUpperCase();
  return want.includes(got);
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

function kpiPolygonStyle(feature: any, basemapKind: BasemapKind): L.PathOptions {
  const vis = KPI_BASEMAP_VISIBILITY[basemapKind] || KPI_BASEMAP_VISIBILITY.light;
  const tier = feature?.properties?.tier || 'unknown';
  const fillColor = feature?.properties?.tierColor || TIER_COLOR.unknown;
  return {
    fillColor,
    fillOpacity: tier === 'unknown' ? Math.min(0.16, vis.fill) : vis.fill,
    color: basemapKind === 'satellite' ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.68)',
    opacity: vis.edge,
    weight: basemapKind === 'satellite' ? 0.95 : 0.65,
    lineCap: 'round',
    lineJoin: 'round',
    className: basemapKind === 'satellite' ? 'kpi-overlay-polygon kpi-overlay-polygon-satellite' : 'kpi-overlay-polygon',
  };
}

const KpiOverlayAdapter: React.FC<Props> = ({
  enabled,
  basemapKind = 'light',
  bbox,
  view,
  kpiValueMap,
  kpiThresholds,
  scope,
  siteAllowlist,
  onStats,
}) => {
  const map = useMap();
  const [cells, setCells] = useState<CoverageCell[]>([]);
  const layerRef = useRef<L.GeoJSON | null>(null);
  /** Bump on map moveend ONLY while the dashboard filter exceeds the
   *  cap, so panning re-selects the 500 closest sectors. Subscribing is
   *  conditional (see effect below) to avoid rebuilding the layer on
   *  every pan when we're under the cap. */
  const [mapCenterTick, setMapCenterTick] = useState(0);
  /** Last fetch stats — composed with the build-effect stats and emitted
   *  to the parent via onStats once a render completes. */
  const lastFetchStatsRef = useRef<{ backendCells: number; afterFilter: number }>({
    backendCells: 0,
    afterFilter: 0,
  });

  /** Parse the CSV allowlist into a Set once per change. Includes both
   *  forms because callers may use site_name or site_id interchangeably
   *  and CoverageCell carries both. */
  const allowSet = useMemo<Set<string> | null>(() => {
    if (!siteAllowlist) return null;
    const parts = siteAllowlist
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;
    return new Set(parts);
  }, [siteAllowlist]);

  // ── Fetch cells when bbox / scope filters change ──
  useEffect(() => {
    if (!enabled || !bbox) return;
    const ctrl = new AbortController();
    // Option A: backend filter (cells-for-coverage accepts plaque/dor/
    // cluster/band/techno/vendor as CSV) — shrinks the wire payload to
    // the dashboard perimeter.
    //DIAG (2026-05-12) — surface the scope actually sent to the backend
    //DIAG so we can confirm whether the parent supplies it. Remove once
    //DIAG the dashboard-filter bug is closed.
    // eslint-disable-next-line no-console
    console.log('[diag] kpi-overlay scope:', {
      techno:  scope?.techno,
      vendor:  scope?.vendor,
      plaque:  scope?.plaque,
      dor:     scope?.dor,
      cluster: scope?.cluster,
      band:    scope?.band,
      bbox,
    });
    fetchCellsForCoverage(bbox, {
      techno:  scope?.techno  || undefined,
      vendor:  scope?.vendor  || undefined,
      plaque:  scope?.plaque  || undefined,
      dor:     scope?.dor     || undefined,
      cluster: scope?.cluster || undefined,
      band:    scope?.band    || undefined,
      signal: ctrl.signal,
    })
      .then(({ cells: c }) => {
        // Option B: client-side defensive filter — re-applies the
        // scope after fetch so any subset returned by an out-of-date
        // backend (or a future bug) still honours the operator's
        // perimeter. Idempotent when the backend already filtered.
        // 2026-05-12 — also enforce the dashboard site allowlist here,
        // since `/cells-for-coverage` filters by plaque/dor/cluster/
        // techno/vendor/band but not by an arbitrary site list (e.g.
        // a Cluster_B narrowing or a saved sub-perimeter). Without
        // this step the Voronoï tessellated a superset of the 1 682
        // cells the legend was reporting, producing huge red polygons
        // that fanned out from the cluster centre.
        const filtered = c.filter((cell) =>
          csvMatches(scope?.techno, cell.tech)
          && csvMatches(scope?.vendor, cell.vendor)
          && csvMatches(scope?.band, cell.band)
          && (!allowSet || allowSet.has(cell.siteName) || allowSet.has(cell.siteId))
        );
        //DIAG (2026-05-12) — surface fetch + filter results.
        // eslint-disable-next-line no-console
        console.log('[diag] kpi-overlay fetch:', {
          backendCells: c.length,
          afterClientFilter: filtered.length,
          dropped: c.length - filtered.length,
          allowSetSize: allowSet?.size ?? null,
        });
        // eslint-disable-next-line no-console
        console.log('[diag] scope:filtered', {
          allCellsLength: c.length,
          filteredCellsLength: filtered.length,
          allowSetSize: allowSet?.size ?? null,
          scopeKeys: {
            techno:  scope?.techno  ?? null,
            vendor:  scope?.vendor  ?? null,
            plaque:  scope?.plaque  ?? null,
            dor:     scope?.dor     ?? null,
            cluster: scope?.cluster ?? null,
            band:    scope?.band    ?? null,
          },
        });
        lastFetchStatsRef.current = {
          backendCells: c.length,
          afterFilter: filtered.length,
        };
        setCells(filtered);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.warn('[KpiOverlayAdapter] cells fetch failed:', err);
      });
    return () => ctrl.abort();
  }, [
    enabled, bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat,
    scope?.techno, scope?.vendor, scope?.plaque, scope?.dor, scope?.cluster, scope?.band,
    siteAllowlist,
  ]);

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
      onStats?.({
        ...lastFetchStatsRef.current,
        seedsTotal: 0,
        rendered: 0,
        capped: false,
      });
      return;
    }

    const kpiName = view.selectedKpis[0];

    // Voronoï pavage — implemented directly (no radial clip) so the
    // bissectors form the only edges. We project (lon, lat) to flat
    // metres at the bbox-mean latitude so disks are round and bissector
    // angles are correct everywhere.
    //
    // 1) Build ONE seed per SECTOR — keyed by (siteId, azimuth-bucket
    //    at 5°). Cells that share both site AND sector (multi-band /
    //    multi-techno on the same physical antenna) collapse into one
    //    seed; the worst KPI tier across those cells wins. To get
    //    distinct polygons for sectors of the same site, we offset
    //    each seed by `SECTOR_OFFSET_M` metres along its azimuth — the
    //    bissectors between sector seeds then form a small "star" of
    //    polygons at the site, opening up toward each azimuth.
    const SECTOR_BUCKET_DEG = 5;
    const SECTOR_OFFSET_M = 100;
    type Seed = {
      x: number; y: number;
      siteX: number; siteY: number;
      siteLat: number; siteLon: number;
      cellIds: string[];
      siteName: string;
      siteId: string;
      tech: string;
      band: string;
      azimuth: number;
      beamwidth: number;
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
      const az = Number.isFinite(c.azimuth) ? ((c.azimuth % 360) + 360) % 360 : 0;
      const azBucket = Math.round(az / SECTOR_BUCKET_DEG) * SECTOR_BUCKET_DEG;
      const siteKey = c.siteId || c.siteName || c.id;
      const key = `${siteKey}|${azBucket}`;
      // Site centre in flat metres, plus a tiny offset along the
      // azimuth direction. Bearing convention: 0° = north (+y),
      // 90° = east (+x). Unit vector = (sin θ, cos θ).
      const rad = (az * Math.PI) / 180;
      const siteX = c.lon * M_PER_DEG_LNG;
      const siteY = c.lat * M_PER_DEG_LAT;
      const sx = siteX + Math.sin(rad) * SECTOR_OFFSET_M;
      const sy = siteY + Math.cos(rad) * SECTOR_OFFSET_M;
      const v = kpiValueMap?.get(c.id);
      const cellTier = valueToTier(v, kpiThresholds);
      const acc = seedMap.get(key);
      if (!acc) {
        seedMap.set(key, {
          x: sx, y: sy,
          siteX, siteY,
          siteLat: c.lat, siteLon: c.lon,
          cellIds: [c.id],
          siteName: c.siteName,
          siteId: c.siteId,
          tech: c.tech,
          band: c.band,
          azimuth: az,
          beamwidth: Number(c.beamwidth),
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
    const seedsAll = [...seedMap.values()];
    if (seedsAll.length === 0) {
      onStats?.({
        ...lastFetchStatsRef.current,
        seedsTotal: 0,
        rendered: 0,
        capped: false,
      });
      removeLayer();
      return;
    }

    // 1b) Defensive cap — if the dashboard filter produced more than
    //     MAX_VORONOI_CELLS sectors, keep the ones closest to the
    //     current map centre. Voronoï complexity is O(n²) in the
    //     half-plane clipper used here, so 500 is the upper bound where
    //     the build stays well under the 200 ms target. When capped, a
    //     legend banner asks the user to zoom in to refine.
    let seeds = seedsAll;
    let capped = false;
    if (seedsAll.length > MAX_VORONOI_CELLS) {
      const centre = map.getCenter();
      const cx = centre.lng * M_PER_DEG_LNG;
      const cy = centre.lat * M_PER_DEG_LAT;
      seeds = seedsAll
        .map((s) => ({ s, d: (s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_VORONOI_CELLS)
        .map((e) => e.s);
      capped = true;
    }
    //DIAG (2026-05-12) — surface the capping decision and reference
    //DIAG identity of the array that flows into voronoiCells. If `seeds`
    //DIAG were ever assigned back to seedsAll, the strict-equal check
    //DIAG below would flip to true and prove the cap is bypassed.
    // eslint-disable-next-line no-console
    console.log('[diag] scope:capped', {
      filteredCellsLength: cells.length,
      seedsAllLength: seedsAll.length,
      seedsAfterCapLength: seeds.length,
      cap: MAX_VORONOI_CELLS,
      capActive: capped,
      seedsRefIsSeedsAll: seeds === seedsAll,
    });

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

    //DIAG (2026-05-12) — the exact length being passed to the Voronoï
    //DIAG kernel. Anything other than `seeds.length` here would mean a
    //DIAG variable mix-up between cap-decision and tessellation.
    // eslint-disable-next-line no-console
    console.log('[diag] scope:rebuild', {
      cellsPassedToOverlay: seeds.length,
      isCapped: capped,
      bboxFlat,
      bboxWidthKm: (bboxFlat[2] - bboxFlat[0]) / 1000,
      bboxHeightKm: (bboxFlat[3] - bboxFlat[1]) / 1000,
    });

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
    //    Each Voronoï polygon is constrained by local site density and
    //    sector azimuth so dense urban footprints stay compact while
    //    sparse edge cells cannot dominate the map.
    const adaptiveRadii = computeAdaptiveRfRadii(seeds);
    const tierCounts: Record<string, number> = { green: 0, orange: 0, red: 0, unknown: 0 };
    const features: any[] = [];
    let clippedAwayCount = 0;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const poly = polys[i];
      if (!poly || poly.length < 3) continue;
      const radius = adaptiveRadii[i] || MAX_VISUAL_RADIUS_M;
      const disk = approximateDisk({ x: s.siteX, y: s.siteY }, radius, VISUAL_RADIUS_SEGMENTS);
      const bounded = polygonIntersection(poly, disk);
      const beam = Number.isFinite(s.beamwidth) && s.beamwidth > 0
        ? clampNumber(s.beamwidth * 1.75, 95, 155)
        : 120;
      const sector = approximateWedge(
        { x: s.siteX, y: s.siteY },
        radius,
        s.azimuth - beam / 2,
        s.azimuth + beam / 2,
        12,
      );
      const clipped = polygonIntersection(bounded, sector);
      if (!clipped || clipped.length < 3) {
        clippedAwayCount++;
        continue;
      }
      const ring = clipped.map((p: { x: number; y: number }) => [p.x / M_PER_DEG_LNG, p.y / M_PER_DEG_LAT] as [number, number]);
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
          siteId: s.siteId,
          siteName: s.siteName,
          tech: s.tech,
          band: s.band,
          azimuth: s.azimuth,
          tier: s.tier,
          tierColor: TIER_COLOR[s.tier],
          rawValue: s.rawValueForLegend,
          rfRadiusMeters: Math.round(radius),
          kpiName,
        },
      });
    }
    const fc = { type: 'FeatureCollection', features };
    void tierCounts; // retained for an eventual on-ready callback

    removeLayer();

    //DIAG (2026-05-12) — final feature count actually attached to the
    //DIAG map. `clippedAwayCount` = polygons that collapsed to <3 vertices
    //DIAG after adaptive radial + azimuth clipping.
    // eslint-disable-next-line no-console
    console.log('[diag] scope:result', {
      nFeatures: features.length,
      seedsLength: seeds.length,
      seedsAllLength: seedsAll.length,
      cap: MAX_VORONOI_CELLS,
      visualRadiusM: MAX_VISUAL_RADIUS_M,
      clippedAwayCount,
      tierCounts,
    });

    layerRef.current = L.geoJSON(fc as any, {
      style: (f: any) => kpiPolygonStyle(f, basemapKind),
      onEachFeature: (feature: any, layer: any) => {
        const p = feature.properties;
        const valStr = p.rawValue == null ? '—' : Number(p.rawValue).toFixed(2);
        const tierLabel = p.tier === 'unknown' ? 'No data' : p.tier.toUpperCase();
        const cellsMerged = Array.isArray(p.cellIds) ? p.cellIds.length : 1;
        layer.bindTooltip(
          `<div class="cov-tt">
            <div class="cov-tt-name">${escapeHtml(p.id)}</div>
            <div class="cov-tt-row"><span>site</span><b>${escapeHtml(p.siteName)}</b></div>
            <div class="cov-tt-row"><span>azimuth</span><b>${Math.round(p.azimuth)}°</b></div>
            <div class="cov-tt-row"><span>tech</span><b>${escapeHtml(p.tech || '—')}${p.band ? ' · ' + escapeHtml(p.band) : ''}</b></div>
            <div class="cov-tt-row"><span>${escapeHtml(p.kpiName)}</span><b>${valStr}</b></div>
            <div class="cov-tt-row"><span>tier</span><b style="color:${p.tierColor}">${tierLabel}</b></div>
            ${cellsMerged > 1 ? `<div class="cov-tt-row"><span>cells merged</span><b>${cellsMerged}</b></div>` : ''}
          </div>`,
          { className: 'cov-tooltip', sticky: true, direction: 'top' },
        );
        layer.on('mouseover', (e: any) => {
          const base = kpiPolygonStyle(feature, basemapKind);
          e.target.setStyle({
            ...base,
            weight: Number(base.weight || 0.8) + 0.9,
            fillOpacity: Math.min(Number(base.fillOpacity || 0.3) + 0.14, 0.56),
          });
        });
        layer.on('mouseout', (e: any) =>
          e.target.setStyle(kpiPolygonStyle(feature, basemapKind)),
        );
      },
    });
    layerRef.current.addTo(map);

    onStats?.({
      ...lastFetchStatsRef.current,
      seedsTotal: seedsAll.length,
      rendered: seeds.length,
      capped,
    });

    return removeLayer;
    // Re-render triggers: cells signature, view identity, thresholds,
    // kpiValueMap reference. We use stable scalars + cell count to avoid
    // infinite re-renders when the parent rebuilds equal Maps. The
    // `mapCenterTick` dep only changes while we're capped (see the
    // moveend subscription below), so pans under the cap don't rebuild.
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
    basemapKind,
    mapCenterTick,
  ]);

  // ── Map moveend subscription, conditional on being over the cap ──
  //
  // We deliberately avoid wiring this listener while seeds ≤ cap so
  // pans don't trigger Voronoï rebuilds. When over cap, a 400 ms-
  // debounced moveend bumps `mapCenterTick`, which feeds the build
  // effect dep array and re-selects the 500 closest sectors.
  const isCapped = cells.length > 0 && (() => {
    // Lightweight estimate: post-dedup count is bounded above by the
    // raw cell count, so if cells.length ≤ cap we're definitely under
    // the cap. Otherwise we always subscribe and let the build effect
    // re-evaluate the precise seed count.
    return cells.length > MAX_VORONOI_CELLS;
  })();
  useEffect(() => {
    if (!map || !enabled || !isCapped) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setMapCenterTick((v) => v + 1), 400);
    };
    map.on('moveend', onMove);
    return () => {
      if (t) clearTimeout(t);
      map.off('moveend', onMove);
    };
  }, [map, enabled, isCapped]);

  return null;
};

export default KpiOverlayAdapter;
