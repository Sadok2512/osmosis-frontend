import { SiteSummary, SiteDetail, CellProperties } from '../types';
import { topoApi, BboxFilters, BboxSiteDTO, qoeMapApi, QoeMapSiteData } from '@/lib/localDb';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { supabase } from '@/integrations/supabase/client';
import topoRaw from '../data/topoData';
import type { DashboardSiteFilters } from '@/components/otarie/ProgressiveFilterBuilder';

// ── Stale topo signal ──
// vps-proxy serves the last good /topo/sites or /topo/cells response from
// Deno KV when upstream is down, tagging the body with `_stale_cache: true`
// (mirrored from the X-Stale-Cache header by lib/localDb). Components
// subscribe here to render a "stale data" badge / fire a one-shot toast.
export interface TopoStaleState {
  stale: boolean;
  ageSec: number | null;
  observedAt: number;
}
let _topoStaleState: TopoStaleState = { stale: false, ageSec: null, observedAt: 0 };
const _topoStaleListeners = new Set<(s: TopoStaleState) => void>();

export function getTopoStaleState(): TopoStaleState {
  return _topoStaleState;
}

export function subscribeTopoStale(fn: (s: TopoStaleState) => void): () => void {
  _topoStaleListeners.add(fn);
  return () => { _topoStaleListeners.delete(fn); };
}

function setTopoStaleState(next: TopoStaleState) {
  _topoStaleState = next;
  for (const fn of _topoStaleListeners) {
    try { fn(next); } catch (e) { console.warn('[TopoService] stale listener threw', e); }
  }
}

function noteTopoResponse(resp: unknown): void {
  if (!resp || typeof resp !== 'object') return;
  const r = resp as Record<string, unknown>;
  const stale = r._stale_cache === true;
  if (!stale && !_topoStaleState.stale) return; // no transition
  const ageSec = typeof r._stale_age_seconds === 'number' ? (r._stale_age_seconds as number) : null;
  setTopoStaleState({ stale, ageSec, observedAt: Date.now() });
}

// All supported technologies
const ALLOWED_TECHNOS = new Set(['2G', '3G', '4G', '5G', 'LTE', 'NR', 'GSM', 'UMTS', 'WCDMA', '2g', '3g', '4g', '5g', 'lte', 'nr', 'gsm', 'umts', 'wcdma']);
function isAllowedTechno(techno: string | null | undefined): boolean {
  if (!techno) return true; // include unknowns
  return ALLOWED_TECHNOS.has(techno.trim());
}

/**
 * Defensive parser for backend band/techno arrays.
 * VPS `/api/v1/topo/sites` sometimes returns malformed CSV inside an array,
 * e.g. `bandes: ["LTE1800, LTE2600, LTE800"]` instead of 3 distinct entries.
 * Splits on commas/semicolons/pipes and trims so we always get a clean list.
 */
function parseBackendList(raw: unknown): string[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = new Set<string>();
  for (const entry of arr) {
    if (entry == null) continue;
    String(entry)
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(s => out.add(s));
  }
  return [...out];
}

/** Normalize raw techno string to canonical 2G/3G/4G/5G */
function normalizeTechnoRaw(raw: string | null | undefined): string {
  const v = String(raw || '').toUpperCase().trim();
  if (v.includes('5G') || v === 'NR') return '5G';
  if (v.includes('3G') || v === 'UMTS' || v === 'WCDMA') return '3G';
  if (v.includes('2G') || v === 'GSM') return '2G';
  return '4G';
}

function filterSitesAllTech(sites: SiteSummary[]): SiteSummary[] {
  return sites.map(site => {
    if (!site.cells || site.cells.length === 0) return site;
    const filtered = site.cells.filter(c => isAllowedTechno(c.techno));
    if (filtered.length === site.cells.length) return site;
    return { ...site, cells: filtered, cell_count: filtered.length };
  });
}

const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://localhost:3001';

// ── QoE Map cache ──
let qoeMapCache: { data: Record<string, QoeMapSiteData>; date: string | null; ts: number } | null = null;
const QOE_MAP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getQoeMapData(): Promise<Record<string, QoeMapSiteData>> {
  if (qoeMapCache && (Date.now() - qoeMapCache.ts) < QOE_MAP_CACHE_TTL) {
    return qoeMapCache.data;
  }
  try {
    const resp = await qoeMapApi.fetch('Site');
    const data = resp.sites || {};
    qoeMapCache = { data, date: resp.date, ts: Date.now() };
    console.log(`[TopoService] QoE map: ${Object.keys(data).length} sites, date=${resp.date}`);
    return data;
  } catch (err) {
    console.warn('[TopoService] QoE map fetch failed, using fallback', err);
    return {};
  }
}

export function invalidateQoeMapCache() {
  qoeMapCache = null;
}

/** Apply real QoE data to a site summary if available */
function applyQoeData(site: SiteSummary, qoeData: Record<string, QoeMapSiteData>): SiteSummary {
  // Try matching by site_name (most common in qoe_metric Dimension_2)
  const qoe = qoeData[site.site_name] || qoeData[site.site_id];
  if (!qoe) return site;

  return {
    ...site,
    qoe_score_avg: qoe.qoe_index ?? site.qoe_score_avg,
    p50_thr_dn_mbps: qoe.debit_dl ?? site.p50_thr_dn_mbps,
    p50_thr_up_mbps: qoe.debit_ul ?? site.p50_thr_up_mbps,
    dms_dl_3: qoe.dms_dl_3 ?? site.dms_dl_3,
    dms_dl_8: qoe.dms_dl_8 ?? site.dms_dl_8,
    dms_dl_30: qoe.dms_dl_30 ?? site.dms_dl_30,
    dms_ul_3: qoe.dms_ul_3 ?? site.dms_ul_3,
  };
}

// Seeded random for stable KPI values per cell
function seededRand(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

const CLUSTER_FIELDS = ['cluster', 'bcluster', 'b_cluster', 'cluster_name', 'b_cluster_name'];

function getFirstStringField(source: any, fields: string[]): string | null {
  if (!source) return null;
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function getClusterValue(source: any): string | null {
  return getFirstStringField(source, CLUSTER_FIELDS);
}

const DOR_MAP: Record<string, string> = {
  'UPR Ile-De-France': 'UPR Ile-De-France',
  'UPR Nord-Est': 'UPR Nord-Est',
  'UPR Ouest': 'UPR Ouest',
  'UPR Sud-Est': 'UPR Sud-Est',
  'UPR Sud-Ouest': 'UPR Sud-Ouest',
  'DOR IDF': 'UPR Ile-De-France',
  'DOR EST': 'UPR Nord-Est',
  'DOR OUEST': 'UPR Ouest',
};

function normalizeDorValue(dor?: string | null, region?: string | null): string {
  const candidates = [dor, region]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  const uprMatch = candidates.find((value) => value.startsWith('UPR '));
  if (uprMatch) return uprMatch;

  const mapped = candidates.find((value) => DOR_MAP[value]);
  if (mapped) return DOR_MAP[mapped];

  return candidates[0] || 'UPR Ile-De-France';
}

interface TopoRow {
  code_nidt: string;
  nom_site: string;
  region: string | null;
  longitude: number | null;
  latitude: number | null;
  nom_cellule: string;
  techno: string | null;
  bande: string | null;
  constructeur: string | null;
  azimut: number | null;
  cluster: string | null;
  hba: number | null;
  tac: number | null;
  tilt?: number | null;
  pci?: number | null;
  eci?: number | null;
  nci?: number | null;
  cid?: number | null;
  etat_cellule?: string | null;
  zone_arcep?: string | null;
  essentiel?: string | null;
  date_mes?: string | null;
  date_fn8?: string | null;
  dor?: string | null;
  lac?: number | null;
  hebergeur_leader?: string | null;
  relative_id?: number | string | null;
  plaque?: string | null;
  bcluster?: string | null;
  b_cluster?: string | null;
  cluster_name?: string | null;
  b_cluster_name?: string | null;
}

/**
 * Infer band from cell name when backend doesn't provide it.
 * Common patterns: ENB1 → B1/1800, ENB3 → B3/1800, GNB1 → NR2100, etc.
 */
/**
 * Infer band from Orange France cell naming convention.
 * The last letter before the sector digit encodes the band:
 *   4G: E=L2600, F=L1800, H=L800, V=L2100, K=L700, L=L900
 *   5G: X=NR3500, Y=NR2100, Z=NR700, W=NR1800, U=NR2600
 * Exported so localDb.ts can reuse it.
 */
export function inferBandFromCellName(cellName: string, techno: string): string {
  if (!cellName) return '';
  const upper = cellName.toUpperCase();
  const is5G = techno.toUpperCase().includes('5G') || techno.toUpperCase().includes('NR') || upper.includes('GNB');

  // ── Orange letter-code convention (last segment like _E1, _F2, _X3) ──
  const letterMatch = upper.match(/[_\-]([A-Z])(\d)$/);
  if (letterMatch) {
    const letter = letterMatch[1];
    // 5G letters
    if (is5G || 'XYZWU'.includes(letter)) {
      switch (letter) {
        case 'X': return 'NR3500';
        case 'Y': return 'NR2100';
        case 'Z': return 'NR700';
        case 'W': return 'NR1800';
        case 'U': return 'NR2600';
      }
    }
    // 4G letters
    switch (letter) {
      case 'E': return 'L2600';
      case 'F': return 'L1800';
      case 'H': return 'L800';
      case 'V': return 'L2100';
      case 'K': return 'L700';
      case 'L': return 'L900';
    }
  }

  // ── Fallback: explicit band numbers in name ──
  if (is5G) {
    if (upper.includes('3500') || upper.includes('N78')) return 'NR3500';
    if (upper.includes('2100') || /\bN1\b/.test(upper)) return 'NR2100';
    if (upper.includes('700') || upper.includes('N28')) return 'NR700';
    return 'NR3500'; // default 5G
  }

  if (upper.includes('2600')) return 'L2600';
  if (upper.includes('1800')) return 'L1800';
  if (upper.includes('2100')) return 'L2100';
  if (upper.includes('800') && !upper.includes('1800') && !upper.includes('3800')) return 'L800';
  if (upper.includes('700') && !upper.includes('2700') && !upper.includes('3700')) return 'L700';

  // Strict standalone B-code match (avoid ENB1 false positive)
  const strictBand = upper.match(/(?:^|[_\-])B(\d+)(?:$|[_\-])/);
  if (strictBand) {
    const b = strictBand[1];
    if (b === '7') return 'L2600';
    if (b === '3') return 'L1800';
    if (b === '1') return 'L2100';
    if (b === '20') return 'L800';
    if (b === '28') return 'L700';
  }

  return 'L1800'; // default 4G
}

function buildCellProperties(cellName: string, techno: string, bande: string, azimut: number, hba: number | null, extra?: Partial<TopoRow>): CellProperties {
  const base: CellProperties = {
    cell_id: cellName,
    techno,
    bande,
    azimut,
    hba,
    qoe_score_avg: 0,
    p95_rtt_ms: 0,
    traffic_up_bytes: 0,
    traffic_dn_bytes: 0,
    dms_dl_3: 0,
    dms_dl_8: 0,
    dms_dl_30: 0,
    dms_ul_3: 0,
    p50_thr_dn_mbps: 0,
    p50_thr_up_mbps: 0,
    sessions: 0,
    window_full_ratio: 0,
    retransmission_rate: 0,
    tcp_loss_rate: 0,
    out_of_order_ratio: 0,
    p25_rtt_ms: 0,
    p75_rtt_ms: 0,
  };
  if (extra) {
    const ext = base as any;
    const ex = extra as any;
    if (ex.tilt != null) ext.tilt = ex.tilt;
    if (ex.pmax != null) ext.pmax = ex.pmax;
    if (ex.dl_bandwidth != null) ext.dl_bandwidth = ex.dl_bandwidth;
    if (ex.num_tx_ant != null) ext.num_tx_ant = ex.num_tx_ant;
    if (extra.pci != null) ext.pci = extra.pci;
    if ((extra as any).psc != null) ext.psc = (extra as any).psc;
    if (extra.eci != null) ext.eci = extra.eci;
    if (extra.nci != null) ext.nci = extra.nci;
    if (extra.cid != null) ext.cid = extra.cid;
    if (extra.tac != null) ext.tac = extra.tac;
    if (extra.lac != null) ext.lac = extra.lac;
    // State fields — the SitesMonitor "Cell State" column reads them in
    // priority cell_state → etat_cellule → etat_fonctionnement →
    // cell_status → oper_state. Backend endpoints expose different
    // subsets (/topo/cells gives cell_state+cell_status+etat_cellule+
    // status; /topo/sites?include_cells gives cell_state+etat_cellule
    // only) so propagate every known alias to keep the chain resilient.
    if (ex.cell_state) ext.cell_state = ex.cell_state;
    if (ex.cell_status) ext.cell_status = ex.cell_status;
    if (ex.etat_fonctionnement) ext.etat_fonctionnement = ex.etat_fonctionnement;
    if (ex.oper_state) ext.oper_state = ex.oper_state;
    if (ex.status) ext.status = ex.status;
    if (extra.etat_cellule) ext.etat_cellule = extra.etat_cellule;
    if (extra.zone_arcep) ext.zone_arcep = extra.zone_arcep;
    if (extra.essentiel) ext.essentiel = extra.essentiel;
    if (extra.date_mes) ext.date_mes = extra.date_mes;
    if (extra.date_fn8) ext.date_fn8 = extra.date_fn8;
    if (extra.constructeur) ext.constructeur = extra.constructeur;
    if (extra.plaque) ext.cluster = extra.plaque;
    if (extra.latitude != null) ext.latitude = extra.latitude;
    if (extra.longitude != null) ext.longitude = extra.longitude;
    if (extra.hebergeur_leader) ext.hebergeur_leader = extra.hebergeur_leader;
    if (extra.relative_id != null) ext.relative_id = extra.relative_id;
    const cluster = getClusterValue(extra);
    if (cluster) ext.cluster = cluster;
    // Spatial KPIs from ref_cell_daily
    if ((extra as any).intersite_distance_m != null) ext.intersite_distance_m = (extra as any).intersite_distance_m;
    if ((extra as any).overshoot_factor != null) ext.overshoot_factor = (extra as any).overshoot_factor;
  }
  return base;
}

/**
 * Extract sector index (1-9) from cell name suffix for azimut heuristic.
 * E.g. "SITE_F1" → 1, "SITE_H2" → 2, "SITE_X3" → 3
 */
function extractSectorIndex(cellName: string): number {
  const lastChar = cellName.slice(-1);
  return /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
}

export function buildSitesFromRows(rows: TopoRow[]): SiteSummary[] {
  const siteMap = new Map<string, Array<TopoRow & Record<string, any>>>();
  let autoIdx = 0;

  rows.forEach((rawRow) => {
    const row = rawRow as TopoRow & Record<string, any>;
    const lat = Number(row.latitude ?? row.lat);
    const lng = Number(row.longitude ?? row.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const key = row.code_nidt && row.code_nidt.trim() !== ''
      ? row.code_nidt
      : (hasCoords ? `auto_${lat.toFixed(6)}_${lng.toFixed(6)}` : `orphan_${autoIdx++}`);

    if (!siteMap.has(key)) siteMap.set(key, []);
    siteMap.get(key)!.push({
      ...row,
      code_nidt: row.code_nidt || key,
      nom_site: row.nom_site || row.site_name || key,
      nom_cellule: row.nom_cellule || row.cell_name || `${key}_cell_${siteMap.get(key)!.length + 1}`,
      bande: row.bande || row.band || '',
      constructeur: row.constructeur || row.vendor || null,
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lng : null,
    });
  });

  const sites: SiteSummary[] = [];
  siteMap.forEach((siteRows, siteId) => {
    const first = siteRows[0];
    const validRows = siteRows.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    if (validRows.length === 0) return;

    const avgLat = avg(validRows.map(r => Number(r.latitude)));
    const avgLng = avg(validRows.map(r => Number(r.longitude)));

    // Detect if any row has a real azimut (non-zero, non-null)
    const hasRealAzimut = siteRows.some(r => r.azimut != null && r.azimut !== 0);

    // If no real azimut data, compute heuristic azimut per sector
    let sectorAzimutMap: Map<number, number> | null = null;
    if (!hasRealAzimut) {
      const sectorIndices = new Set<number>();
      for (const r of siteRows) {
        const cellName = r.nom_cellule || r.cell_name || '';
        sectorIndices.add(extractSectorIndex(cellName));
      }
      const numSectors = Math.max(sectorIndices.size, 1);
      const sorted = Array.from(sectorIndices).sort((a, b) => a - b);
      sectorAzimutMap = new Map();
      sorted.forEach((idx, i) => {
        sectorAzimutMap!.set(idx, Math.round((360 / numSectors) * i));
      });
    }

    // Exclude synthetic placeholder rows (emitted by listFull for sites
    // missing from the /topo/cells sample) — they carry no real cell
    // data and would render as a single fake azimut=0 sector. Sites
    // with no real rows fall back to buildSyntheticRenderCells() in
    // SitesMonitor for a proper multi-sector display until real cells
    // arrive via fetchCellsByBbox at zoom >= SITES_TO_CELLS_ZOOM.
    const cellRows = siteRows.filter(r => !(r as any)._synthetic);
    const cells = cellRows.map((r, index) => {
      const cellName = r.nom_cellule || r.cell_name || `${siteId}_cell_${index + 1}`;
      let azimut = r.azimut || 0;
      if (!hasRealAzimut && sectorAzimutMap) {
        azimut = sectorAzimutMap.get(extractSectorIndex(cellName)) ?? 0;
      }
      return buildCellProperties(
        cellName,
        normalizeTechnoRaw(r.techno || r.rat),
        r.bande || r.band || inferBandFromCellName(cellName, r.techno || '4G'),
        azimut,
        (Number.isFinite(Number(r.hba)) && Number(r.hba) > 0 ? Number(r.hba) : null),
        r,
      );
    });

    const rawVendor = first.constructeur || first.vendor;
    const vendor = rawVendor
      ? rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1)
      : 'Unknown';

    // ── Site-level metadata propagation (for synthetic sector rendering) ─
    // When cells are empty (placeholder-only sites from the listFull
    // synthetic merge), pull bandes/technos/cell counts from the placeholder
    // row so buildSyntheticRenderCells() can produce proper multi-band
    // sectors at zoom >= SITES_TO_CELLS_ZOOM. Without this, sites missing
    // from the /topo/cells alphabet sample render as plain dots forever
    // because inferSiteTechState falls through to all-false and the
    // synthetic generator emits no cells.
    const placeholderRow = (siteRows as any[]).find(r => r._synthetic) ?? first;
    const propBandes = Array.isArray(placeholderRow.bandes) ? placeholderRow.bandes : undefined;
    const propTechnos = Array.isArray(placeholderRow.technos) ? placeholderRow.technos : undefined;
    const propCellCount = Number(placeholderRow.cell_count) || 0;

    // Derive per-tech cell counts from the bandes list (3 sectors per band)
    // so inferSiteTechState's fallback path returns the right has2G..has5G.
    const SECTORS_PER_BAND = 3;
    const deriveCount = (re: RegExp): number => {
      if (!propBandes) return 0;
      return propBandes.filter((b: string) => re.test(b)).length * SECTORS_PER_BAND;
    };
    const lte_cells = deriveCount(/^(LTE|L\d|4G)/i);
    const nr_cells  = deriveCount(/^(NR|N\d|5G)/i);
    const cells_2g  = deriveCount(/^(GSM|G\d|2G)/i);
    const cells_3g  = deriveCount(/^(UMTS|U\d|WCDMA|3G)/i);

    sites.push({
      site_id: first.code_nidt || siteId,
      site_name: first.nom_site || first.site_name || first.code_nidt || siteId,
      vendor,
      dor: normalizeDorValue(first.dor, first.region),
      cluster: first.plaque || first.cluster || '',
      department: (first.plaque || first.cluster || '').replace('DEPT_', ''),
      cell_count: cells.length > 0 ? cells.length : propCellCount,
      qoe_score_avg: cells.length > 0 ? avg(cells.map(c => c.qoe_score_avg)) : 0,
      p50_thr_dn_mbps: cells.length > 0 ? avg(cells.map(c => c.p50_thr_dn_mbps)) : 0,
      p50_thr_up_mbps: cells.length > 0 ? avg(cells.map(c => c.p50_thr_up_mbps)) : 0,
      dms_dl_3: avg(cells.map(c => c.dms_dl_3)),
      dms_dl_8: avg(cells.map(c => c.dms_dl_8)),
      dms_dl_30: avg(cells.map(c => c.dms_dl_30)),
      dms_ul_3: avg(cells.map(c => c.dms_ul_3)),
      coordinates: [avgLat, avgLng] as [number, number],
      cells,
      bandes: propBandes,
      technos: propTechnos,
      lte_cells,
      nr_cells,
      cells_2g,
      cells_3g,
    });
  });

  return sites;
}

function buildSitesFromLocalTopo(): SiteSummary[] {
  const rows: TopoRow[] = topoRaw.map(r => ({
    code_nidt: r.siteId,
    nom_site: r.siteName,
    region: r.region,
    longitude: r.lng,
    latitude: r.lat,
    nom_cellule: r.cellName,
    techno: r.techno,
    bande: r.bande,
    constructeur: r.vendor,
    azimut: r.azimut,
    cluster: r.plaque || r.cluster,
    hba: r.hba,
    tac: null,
  }));
  return buildSitesFromRows(rows);
}

function normalizeFilterValue(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeBandFilterValue(value: string | null | undefined): string {
  return normalizeFilterValue(value).replace(/[_\s-]+/g, '');
}

function collectTechFilterTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectTechFilterTokens);
  return String(value ?? '')
    .split(/[,/;|]+/)
    .map(normalizeFilterValue)
    .filter(Boolean);
}

function addCanonicalTechValues(target: Set<string>, value: unknown): void {
  collectTechFilterTokens(value).forEach((token) => {
    target.add(token);
    if (token.includes('5g') || token.includes('nr')) target.add('5g');
    if ((token.includes('4g') || token.includes('lte') || /^l\d+/.test(token)) && !token.includes('nr')) target.add('4g');
    if (token.includes('3g') || token.includes('umts') || token.includes('wcdma')) target.add('3g');
    if (token.includes('2g') || token.includes('gsm')) target.add('2g');
  });
}

function hasMatchingFilterValue(
  candidates: Array<string | null | undefined>,
  selected?: string[],
): boolean {
  if (!selected || selected.length === 0) return true;

  const normalizedCandidates = candidates
    .map(normalizeFilterValue)
    .filter(Boolean);

  if (normalizedCandidates.length === 0) return false;

  return selected
    .map(normalizeFilterValue)
    .filter(Boolean)
    .some((selectedValue) => normalizedCandidates.includes(selectedValue));
}

function splitFilterValues(value?: string | null): string[] {
  if (!value || value === 'ALL') return [];
  return value
    .split(/[,/;|]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function getSiteClusterCandidates(site: SiteSummary): Array<string | null | undefined> {
  return [
    (site as any).cluster,
    (site as any).bcluster,
    (site as any).b_cluster,
    (site as any).cluster_name,
    (site as any).b_cluster_name,
    ...(site.cells || []).flatMap((cell: any) => [
      cell.cluster,
      cell.bcluster,
      cell.b_cluster,
      cell.cluster_name,
      cell.b_cluster_name,
    ]),
  ];
}

function siteMatchesTechFilter(site: SiteSummary, selected?: string[]): boolean {
  if (!selected || selected.length === 0) return true;

  const techValues = new Set<string>();
  site.cells?.forEach((cell) => {
    addCanonicalTechValues(techValues, cell.techno);
    addCanonicalTechValues(techValues, cell.bande);
  });

  addCanonicalTechValues(techValues, (site as any).techno);
  addCanonicalTechValues(techValues, (site as any).bande);
  if (Number((site as any).nr_cells || 0) > 0) techValues.add('5g');
  if (Number((site as any).lte_cells || 0) > 0) techValues.add('4g');
  if (Number((site as any).cells_3g || 0) > 0) techValues.add('3g');
  if (Number((site as any).cells_2g || 0) > 0) techValues.add('2g');

  const selectedValues = new Set<string>();
  addCanonicalTechValues(selectedValues, selected);
  return Array.from(selectedValues).some((value) => techValues.has(value));
}

function siteMatchesBandFilter(site: SiteSummary, selected?: string[]): boolean {
  if (!selected || selected.length === 0) return true;

  const siteBands = new Set<string>();
  site.cells?.forEach((cell) => {
    const normalized = normalizeBandFilterValue(cell.bande);
    if (normalized) siteBands.add(normalized);
  });

  const siteBand = normalizeBandFilterValue((site as any).bande);
  if (siteBand) siteBands.add(siteBand);

  if (siteBands.size === 0) return false;

  return selected
    .map(normalizeBandFilterValue)
    .filter(Boolean)
    .some((value) => siteBands.has(value));
}

function siteMatchesSearch(site: SiteSummary, search?: string): boolean {
  const normalizedSearch = normalizeFilterValue(search);
  if (!normalizedSearch) return true;

  const haystack = [
    site.site_id,
    site.site_name,
    site.vendor,
    site.dor,
    site.cluster,
    (site as any).zone_arcep,
    ...getSiteClusterCandidates(site),
    ...(site.cells?.map((cell) => cell.cell_id) || []),
  ]
    .map(normalizeFilterValue)
    .filter(Boolean);

  return haystack.some((value) => value.includes(normalizedSearch));
}

function filterDashboardSitesLocally(
  sites: SiteSummary[],
  siteFilters: DashboardSiteFilters | null,
  search?: string,
): SiteSummary[] {
  return sites.filter((site) => {
    if (!hasMatchingFilterValue([site.dor], siteFilters?.dor)) return false;
    if (!hasMatchingFilterValue([site.vendor], siteFilters?.vendor)) return false;
    if (!hasMatchingFilterValue([site.cluster], siteFilters?.cluster)) return false;
    if (!hasMatchingFilterValue([(site as any).zone_arcep], siteFilters?.zone_arcep)) return false;
    if (!siteMatchesTechFilter(site, siteFilters?.techno)) return false;
    if (!siteMatchesBandFilter(site, siteFilters?.bande)) return false;
    if (!siteMatchesSearch(site, search)) return false;
    return true;
  });
}

function filterSitesByBboxFilters(sites: SiteSummary[], filters?: BboxFilters): SiteSummary[] {
  if (!filters) return sites;

  const dashboardFilters = {
    dor: splitFilterValues(filters.dor),
    constructeur: splitFilterValues(filters.vendor),
    cluster: splitFilterValues(filters.cluster),
    zone_arcep: splitFilterValues(filters.zone_arcep),
    techno: splitFilterValues(filters.techno),
    bande: splitFilterValues(filters.bande),
  } as DashboardSiteFilters;

  return filterDashboardSitesLocally(sites, dashboardFilters, filters.q);
}

function getEmbeddedDashboardSites(
  siteFilters: DashboardSiteFilters | null,
  search?: string,
): SiteSummary[] {
  return filterDashboardSitesLocally(buildSitesFromLocalTopo(), siteFilters, search);
}

// Fetch all rows from Cloud topo table (paginated to bypass 1000-row limit)
async function fetchFromCloud(): Promise<TopoRow[]> {
  const PAGE_SIZE = 1000;
  const allRows: TopoRow[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('topo')
      .select('code_nidt, nom_site, region, longitude, latitude, nom_cellule, techno, bande, constructeur, azimut, plaque, hba, tac, tilt, pci, eci, nci, cid, etat_cellule, zone_arcep, essentiel, date_mes, date_fn8, dor, lac, hebergeur_leader, relative_id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...(data as TopoRow[]));
      if (data.length < PAGE_SIZE) hasMore = false;
      else offset += PAGE_SIZE;
    }
  }

  return allRows;
}

let cachedLocalSites: SiteSummary[] | null = null;

// ── Legacy full-load (kept as fallback for inventory/detail views) ──
export async function fetchTopoSites(): Promise<SiteSummary[]> {
  if (cachedLocalSites) return cachedLocalSites;

  let baseSites: SiteSummary[] | null = null;

  // 1) Try local Express/VPS server (capped at 50k to avoid OOM)
  const LEGACY_CAP = 50000;
  try {
    const json = await topoApi.listFull(LEGACY_CAP);
    noteTopoResponse(json);
    const rows: TopoRow[] = json.rows ?? [];
    const total: number = json.total ?? rows.length;
    console.log(`[TopoService] LOCAL: received ${rows.length}/${total} cells (cap=${LEGACY_CAP})`);
    if (rows.length > 0) {
      baseSites = buildSitesFromRows(rows);
      console.log(`[TopoService] LOCAL: Built ${baseSites.length} sites`);
    }
  } catch (err) {
    console.warn('[TopoService] VPS/LOCAL fetch failed, falling back to embedded data', err);
  }

  // 2a) If /topo/cells failed, try /topo/sites bbox endpoint (often works when /topo/cells times out)
  if (!baseSites || baseSites.length === 0) {
    try {
      const fullWorld = { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 };
      const resp = await topoApi.listSitesByBbox(fullWorld, undefined, 50000);
      noteTopoResponse(resp);
      if (!(resp as any)?.unavailable && Array.isArray(resp?.sites) && resp.sites.length > 0) {
        baseSites = resp.sites
          .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
          .map(s => ({
            site_id: s.code_nidt,
            site_name: s.nom_site,
            code_nidt: s.code_nidt,
            nom_site: s.nom_site,
            // The downstream pipeline (visibleSites filter, density,
            // sectors, marker rendering) reads s.coordinates[0]/[1].
            // Without this tuple the bbox fallback returns 37k+ sites
            // that ALL get dropped at the visibleSites step (INC-2026-05-03,
            // observed via [FILTER-CHAIN] log: sites=37474, visibleSites=0).
            coordinates: [s.lat, s.lng] as [number, number],
            latitude: s.lat,
            longitude: s.lng,
            lat: s.lat,
            lng: s.lng,
            region: s.region ?? null,
            dor: s.dor ?? null,
            plaque: s.plaque ?? null,
            cluster: (s as any).cluster ?? null,
            zone_arcep: s.zone_arcep ?? null,
            constructeur: s.vendor ?? null,
            vendor: s.vendor ?? null,
            cell_count: s.nb_cells ?? 0,
            cells: [],
            technos: parseBackendList((s as any).technos ?? s.techno),
            bandes: parseBackendList((s as any).bandes ?? s.bande),
          })) as any;
        console.log(`[TopoService] BBOX-SITES: Built ${baseSites.length} sites from /topo/sites`);
      }
    } catch (err) {
      console.warn('[TopoService] /topo/sites bbox fallback failed', err);
    }
  }

  // 2b) Last-resort embedded fallback
  if (!baseSites || baseSites.length === 0) {
    baseSites = buildSitesFromLocalTopo();
    console.log(`[TopoService] FALLBACK: Built ${baseSites.length} sites from embedded data`);
  }

  // 4) Merge live QoE data
  try {
    const qoeData = await getQoeMapData();
    if (Object.keys(qoeData).length > 0) {
      baseSites = baseSites.map(s => applyQoeData(s, qoeData));
      const withQoe = baseSites.filter(s => qoeData[s.site_name] || qoeData[s.site_id]).length;
      console.log(`[TopoService] Merged live QoE for ${withQoe}/${baseSites.length} sites`);
    }
  } catch (err) {
    console.warn('[TopoService] QoE merge failed', err);
  }

  cachedLocalSites = baseSites;
  return cachedLocalSites;
}

export function invalidateTopoCache() {
  cachedLocalSites = null;
}

// ── NEW: Bbox-based site fetching (Step 1 scalable approach) ──

export interface BboxQuery {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Convert server DTO to lightweight SiteSummary (no cells for circle rendering) */
function dtoToSiteSummary(dto: BboxSiteDTO): SiteSummary | null {
  const lat = Number(dto.lat);
  const lng = Number(dto.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const rawVendor = dto.vendor;
  const vendor = rawVendor
    ? rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1)
    : 'Unknown';
  const siteId = dto.code_nidt;
  // Backend cell_count is NOT filtered by band/techno — keep both raw and effective copies
  const backendCellCount = Number(dto.nb_cells) || 0;
  // Defensively split CSV-mangled bands/technos arrays from VPS
  const bandes = parseBackendList((dto as any).bandes ?? (dto as any).bands ?? (dto as any).band);
  const technos = parseBackendList((dto as any).technos ?? (dto as any).techs ?? (dto as any).techno);

  // Backend rarely provides per-tech cell counts on the bbox endpoint — derive them from
  // the `bandes` array so synthetic-cell generation can produce one mini-sector per band.
  // Each band is assumed to cover the standard 3 sectors when no explicit count is provided.
  // Fallback to `technos` array when bandes lacks legacy entries (the backend's
  // bandes field aggregates only 4G/5G bands from site_ref_daily, missing
  // UMTS/GSM that live only in ref_cell_daily). Without this, multi-tech
  // sites like LES_RICHARDIERES_A11 (3G+4G) had cells_3g=0 and rendered as
  // 4G-only on the map.
  const SECTORS_PER_BAND = 3;
  const bands5G = bandes.filter(b => /^(NR|N\d|5G)/i.test(b)).length;
  const bands4G = bandes.filter(b => /^(LTE|L\d|4G)/i.test(b)).length;
  const bands3G = bandes.filter(b => /^(UMTS|U\d|WCDMA|3G)/i.test(b)).length;
  const bands2G = bandes.filter(b => /^(GSM|G\d|2G)/i.test(b)).length;
  const technosUpper = (technos || []).map(t => String(t || '').trim().toUpperCase());
  const technosHas5G = technosUpper.some(t => t === '5G' || t === 'NR');
  const technosHas4G = technosUpper.some(t => t === '4G' || t === 'LTE');
  const technosHas3G = technosUpper.some(t => t === '3G' || t === 'UMTS' || t === 'WCDMA');
  const technosHas2G = technosUpper.some(t => t === '2G' || t === 'GSM');
  const derivedLte = bands4G > 0 ? bands4G * SECTORS_PER_BAND : (technosHas4G ? SECTORS_PER_BAND : 0);
  const derivedNr  = bands5G > 0 ? bands5G * SECTORS_PER_BAND : (technosHas5G ? SECTORS_PER_BAND : 0);
  const derived2g  = bands2G > 0 ? bands2G * SECTORS_PER_BAND : (technosHas2G ? SECTORS_PER_BAND : 0);
  const derived3g  = bands3G > 0 ? bands3G * SECTORS_PER_BAND : (technosHas3G ? SECTORS_PER_BAND : 0);

  return {
    site_id: siteId,
    site_name: dto.nom_site,
    vendor,
    dor: normalizeDorValue(dto.dor, dto.region),
    cluster: dto.plaque || dto.cluster || '',
    department: (dto.plaque || dto.cluster || '').replace('DEPT_', ''),
    cell_count: backendCellCount,
    backend_cell_count: backendCellCount,
    qoe_score_avg: 0,
    p50_thr_dn_mbps: 0,
    p50_thr_up_mbps: 0,
    dms_dl_3: 0,
    dms_dl_8: 0,
    dms_dl_30: 0,
    dms_ul_3: 0,
    coordinates: [lat, lng] as [number, number],
    cells: [], // cells loaded on-demand when zoomed in
    zone_arcep: (dto as any).zone_arcep || null,
    techno: (dto as any).techno || null,
    bande: (dto as any).bande || null,
    bandes,
    technos,
    lte_cells: dto.lte_cells || derivedLte,
    nr_cells: dto.nr_cells || derivedNr,
    cells_2g: (dto as any).cells_2g || derived2g,
    cells_3g: (dto as any).cells_3g || derived3g,
  };
}

// Simple bbox+filters cache
let bboxCache: { key: string; sites: SiteSummary[]; total: number } | null = null;

function bboxCacheKey(bbox: BboxQuery, filters?: BboxFilters): string {
  const b = `${bbox.minLng.toFixed(4)},${bbox.minLat.toFixed(4)},${bbox.maxLng.toFixed(4)},${bbox.maxLat.toFixed(4)}`;
  const f = filters ? Object.entries(filters).filter(([,v]) => v && v !== 'ALL').map(([k,v]) => `${k}=${v}`).join('&') : '';
  return `${b}|${f}`;
}

/**
 * Fetch aggregated sites by viewport bbox from the server.
 * Returns lightweight SiteSummary[] (no cells array).
 */
/** Pick a server-side fetch cap that matches what the map can actually
 *  render at the current zoom. Pulling 4000 sites just to throw 75 %
 *  away in the viewport-culling + MAX_RENDER_SITES sampling step is
 *  pure network waste. Caller passes zoom; we shrink the cap when
 *  zoomed-out and only return to the full quota at street level.
 *
 *  Limits raised on 2026-05-03 — at zoom 11-12 (city overview), Paris,
 *  Lyon and Lille routinely have >2000 sites in the visible bbox, so
 *  the previous cap was silently truncating the result. Caps are now
 *  set to "comfortable headroom" rather than "minimum sufficient":
 *    - zoom < 10 (national/regional): 1000 — coarse markers anyway
 *    - zoom 10-12 (metro/city):       5000 — covers Île-de-France in
 *                                            one bbox without truncation
 *    - zoom 13+ (street):             10000 — every site in view
 */
/**
 * Zoom-tier for `/topo/sites?bbox=…&limit=…`. Tighter at high zoom because
 * the bbox naturally shrinks (fewer sites in view). Looser at low zoom so
 * a national overview isn't silently truncated to alphabetical-first-5000.
 *
 * Backend now sorts the truncation by cell_count DESC (see topo.py /sites)
 * so even when LIMIT bites, the biggest sites always survive — these caps
 * are about network/render budget, not about "correctness of the visible set".
 */
export const SITES_TO_CELLS_ZOOM = 15;

export function bboxLimitForZoom(zoom?: number): number {
  if (zoom == null) return 5000;
  if (zoom < 8) return 10000;            // national / regional overview
  if (zoom <= 14) return 5000;           // metro / city — sites mode
  if (zoom <= 16) return 2000;           // sectoriel — cells take over
  return 500;                            // street level — few sites in view
}

export async function fetchSitesByBbox(
  bbox: BboxQuery,
  filters?: BboxFilters,
  signal?: AbortSignal,
  zoom?: number,
): Promise<{ sites: SiteSummary[]; total: number }> {
  const key = bboxCacheKey(bbox, filters);
  if (bboxCache && bboxCache.key === key) {
    return { sites: bboxCache.sites, total: bboxCache.total };
  }

  const limit = bboxLimitForZoom(zoom);
  try {
    const [resp, qoeData] = await Promise.all([
      topoApi.listSitesByBbox(bbox, filters, limit, signal),
      getQoeMapData(),
    ]);

    noteTopoResponse(resp);

    if ((resp as any)?.unavailable) {
      throw new Error((resp as any).error || 'VPS parser unavailable');
    }

    const sites = (resp.sites || [])
      .map(dtoToSiteSummary)
      .filter((site): site is SiteSummary => site !== null)
      .map(site => applyQoeData(site, qoeData));

    if (sites.length === 0 && resp.total > 0) {
      throw new Error('BBOX returned only invalid site coordinates');
    }
    // Fix: VPS BBOX sometimes returns total=0 (timeout / partial index) even when local cache has data.
    // Trigger fallback to fetchTopoSites() instead of letting the map go blank.
    if (sites.length === 0 && resp.total === 0) {
      throw new Error('BBOX returned 0 sites — falling back to local cache');
    }

    const filteredSites = filterSitesAllTech(sites);
    bboxCache = { key, sites: filteredSites, total: filteredSites.length };
    const withQoe = filteredSites.filter(s => qoeData[s.site_name] || qoeData[s.site_id]).length;
    console.log(`[TopoService] BBOX: ${filteredSites.length}/${resp.total} sites (${withQoe} with live QoE)`);
    return { sites: filteredSites, total: filteredSites.length };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[TopoService] BBOX fetch failed, falling back to full load', err);
    const allSites = await fetchTopoSites();
    // Geographic bbox filter so we don't render the whole country at city zoom
    const inBbox = allSites.filter(s => {
      const [lat, lon] = s.coordinates || [];
      return (
        typeof lat === 'number' && typeof lon === 'number' &&
        lat >= bbox.minLat && lat <= bbox.maxLat &&
        lon >= bbox.minLng && lon <= bbox.maxLng
      );
    });
    const filteredSites = filterSitesByBboxFilters(inBbox, filters);
    console.log(`[TopoService] BBOX fallback: ${filteredSites.length} local sites in bbox`);
    return { sites: filteredSites, total: filteredSites.length };
  }
}

/**
 * Fetch cell-level data for sites in bbox (for sector polygon rendering at high zoom).
 * Returns full SiteSummary[] with cells populated.
 */
export async function fetchCellsByBbox(
  bbox: BboxQuery,
  filters?: BboxFilters,
  signal?: AbortSignal,
  zoom?: number,
): Promise<SiteSummary[]> {
  // Safety clamp: cells render as per-sector polygons and only become
  // visible at zoom >= SITES_TO_CELLS_ZOOM. Calling this at lower zoom
  // would download up to 8000 cells over a country-sized bbox for nothing
  // (markers stay as site dots until the user zooms in). Refuse early —
  // caller should decide site-level rendering at low zoom.
  if (zoom != null && zoom < SITES_TO_CELLS_ZOOM) {
    console.log(
      `[TopoService] fetchCellsByBbox refused at zoom=${zoom} (< ${SITES_TO_CELLS_ZOOM}) — returning []`
    );
    return [];
  }
  console.log(
    `[TopoService] fetchCellsByBbox start zoom=${zoom} bbox=${bbox.minLng.toFixed(3)},${bbox.minLat.toFixed(3)},${bbox.maxLng.toFixed(3)},${bbox.maxLat.toFixed(3)} filters=${filters ? Object.keys(filters).join(',') : 'none'}`
  );
  // Strategy: go directly to /cells cache merge (fast & reliable).
  // /sites-with-cells endpoint consistently times out on large DOR queries — skip it entirely.
  let sitesFromEndpoint: SiteSummary[] | null = null;

  // Fallback: use /topo/cells cache merged with /topo/sites for complete cell data
  if (!sitesFromEndpoint || sitesFromEndpoint.length === 0) {
    try {
      const cellsResp = await topoApi.listCellsByBbox(bbox, filters, 8000, signal);
      noteTopoResponse(cellsResp);
      if (cellsResp.cells && cellsResp.cells.length > 0) {
        const rows = cellsResp.cells as TopoRow[];
        const builtSites = buildSitesFromRows(rows);
        const qoeData = await getQoeMapData().catch(() => ({} as Record<string, QoeMapSiteData>));
        sitesFromEndpoint = builtSites.map(site => applyQoeData(site, qoeData));
        console.log(`[TopoService] BBOX cells fallback: ${sitesFromEndpoint.length} sites, ${cellsResp.total} cells (cells-merge)`);
      }
    } catch (err2: any) {
      if (err2?.name === 'AbortError') throw err2;
      console.warn('[TopoService] Cells-merge fallback also failed', err2);
    }
  }

  if (!sitesFromEndpoint) return [];

  return filterSitesAllTech(sitesFromEndpoint);
}

export function invalidateBboxCache() {
  bboxCache = null;
}

export async function fetchTopoSiteDetail(siteId: string): Promise<SiteDetail> {
  const sites = await fetchTopoSites();
  const site = sites.find(s => s.site_id === siteId) || sites[0];
  if (!site) {
    return {
      site_id: siteId,
      site_name: 'Unknown',
      vendor: 'Unknown',
      dor: '',
      cluster: '',
      department: '',
      cell_count: 0,
      qoe_score_avg: 0,
      p50_thr_dn_mbps: 0,
      p50_thr_up_mbps: 0,
      dms_dl_3: 0,
      dms_dl_8: 0,
      dms_dl_30: 0,
      dms_ul_3: 0,
      coordinates: [46.6, 2.2] as [number, number],
      cells: [],
      traffic_dn_bytes: 0,
      traffic_up_bytes: 0,
      p95_rtt_ms: 0,
    };
  }
  return {
    ...site,
    traffic_dn_bytes: seededRand(siteId + 'vol', 1e12, 8e12),
    traffic_up_bytes: seededRand(siteId + 'volup', 1e11, 2e12),
    p95_rtt_ms: seededRand(siteId + 'rtt', 20, 150),
  };
}

// ── NEW: Dashboard-scoped site summaries via RPC ──

interface DashboardSitesCache {
  key: string;
  sites: SiteSummary[];
  ts: number;
}

let dashboardSitesCache: DashboardSitesCache | null = null;
const DASHBOARD_SITES_CACHE_TTL = 5 * 60 * 1000; // 5 min

function dashboardFilterKey(filters: DashboardSiteFilters | null, search?: string): string {
  if (!filters) return search || 'all';
  return JSON.stringify(filters) + '|' + (search || '');
}

export function invalidateDashboardSitesCache() {
  dashboardSitesCache = null;
}

export function getCachedDashboardSites(
  siteFilters: DashboardSiteFilters | null,
  search?: string,
): SiteSummary[] | null {
  const key = dashboardFilterKey(siteFilters, search);
  if (dashboardSitesCache && dashboardSitesCache.key === key && (Date.now() - dashboardSitesCache.ts) < DASHBOARD_SITES_CACHE_TTL) {
    return dashboardSitesCache.sites;
  }
  return null;
}

/**
 * Fetch site summaries for a dashboard context using server-side filtering.
 * Returns lightweight SiteSummary[] with empty cells array.
 * Tries VPS first (where data actually lives), then Supabase RPC fallback.
 */
export async function fetchDashboardSites(
  siteFilters: DashboardSiteFilters | null,
  search?: string,
  onProgressiveBatch?: (sites: SiteSummary[]) => void,
): Promise<SiteSummary[]> {
  const key = dashboardFilterKey(siteFilters, search);
  if (
    dashboardSitesCache &&
    dashboardSitesCache.key === key &&
    (Date.now() - dashboardSitesCache.ts) < DASHBOARD_SITES_CACHE_TTL &&
    dashboardSitesCache.sites.length > 0
  ) {
    return dashboardSitesCache.sites;
  }

  // Build BboxFilters from dashboard filters for VPS query
  const bboxFilters: BboxFilters = {};
  if (siteFilters?.dor?.length) bboxFilters.dor = siteFilters.dor.join(',');
  if (siteFilters?.vendor?.length) bboxFilters.vendor = siteFilters.vendor.join(',');
  if (siteFilters?.cluster?.length) bboxFilters.cluster = siteFilters.cluster.join(',');
  if (siteFilters?.zone_arcep?.length) bboxFilters.zone_arcep = siteFilters.zone_arcep.join(',');
  if (siteFilters?.techno?.length) bboxFilters.techno = siteFilters.techno.join(',');
  if (siteFilters?.bande?.length) bboxFilters.bande = siteFilters.bande.join(',');
  // 46-dim cascading bag — passed through to /topo/sites?dim_filters={JSON}
  if (siteFilters?.dim_filters && Object.keys(siteFilters.dim_filters).length > 0) {
    bboxFilters.dim_filters = siteFilters.dim_filters;
  }
  // Row-based Topology Search payload (OR/AND between filters). Goes to
  // /topo/sites?topo_search={JSON}. ANDs with dim_filters when both set.
  if (siteFilters?.topo_search && Array.isArray(siteFilters.topo_search.filters) && siteFilters.topo_search.filters.length > 0) {
    bboxFilters.topo_search = siteFilters.topo_search;
  }
  if (search) bboxFilters.q = search;

  // 1) Try VPS — progressive: show sites immediately, then enrich with QoE
  try {
    const fullWorldBbox = { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 };
    const resp = await topoApi.listSitesByBbox(fullWorldBbox, bboxFilters, 10000);

    if ((resp as any)?.unavailable) {
      throw new Error('VPS unavailable');
    }

    const rawSites: SiteSummary[] = (resp.sites || [])
      .map(dtoToSiteSummary)
      .filter((site): site is SiteSummary => site !== null);

    const filteredSites = filterSitesAllTech(rawSites);

    // Progressive: push raw sites immediately so map renders them
    if (onProgressiveBatch && filteredSites.length > 0) {
      onProgressiveBatch(filteredSites);
    }

    // Then enrich with QoE data in background
    let enrichedSites = filteredSites;
    try {
      const qoeData = await getQoeMapData();
      if (Object.keys(qoeData).length > 0) {
        enrichedSites = filteredSites.map(site => applyQoeData(site, qoeData));
      }
    } catch { /* QoE enrichment is optional */ }

    console.log(`[TopoService] Dashboard sites: ${enrichedSites.length} sites via VPS`);
    if (enrichedSites.length > 0) {
      dashboardSitesCache = { key, sites: enrichedSites, ts: Date.now() };
      return enrichedSites;
    }
    // VPS /sites returned 0 — try /cells endpoint WITHOUT filters then filter locally
    console.warn('[TopoService] VPS /sites returned 0 sites, trying /cells fallback…');
    try {
      const fullWorldBbox = { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 };
      // Don't pass bboxFilters — VPS /cells may not support them; filter locally instead
      const cellsResp = await topoApi.listCellsByBbox(fullWorldBbox, undefined, 50000);
      if (cellsResp.cells && cellsResp.cells.length > 0) {
        const rows = cellsResp.cells as TopoRow[];
        const builtSites = buildSitesFromRows(rows);
        const qoeData = await getQoeMapData().catch(() => ({} as Record<string, QoeMapSiteData>));
        const enrichedSites = builtSites.map(site => applyQoeData(site, qoeData));
        // Apply dashboard filters locally
        const filtered = filterDashboardSitesLocally(enrichedSites, siteFilters, search);
        const cellsSites = filterSitesAllTech(filtered);
        console.log(`[TopoService] Dashboard sites: ${cellsSites.length} sites via VPS /cells fallback (from ${builtSites.length} total)`);
        if (cellsSites.length > 0) {
          dashboardSitesCache = { key, sites: cellsSites, ts: Date.now() };
          onProgressiveBatch?.(cellsSites);
          return cellsSites;
        }
      }
    } catch (cellsErr) {
      console.warn('[TopoService] VPS /cells fallback also failed', cellsErr);
    }
  } catch (err) {
    console.warn('[TopoService] VPS dashboard fetch failed, trying RPC', err);
  }

  // 2) Supabase RPC fallback
  try {
    const params: Record<string, any> = {};
    if (siteFilters?.dor?.length) params.p_dor = siteFilters.dor;
    if (siteFilters?.cluster?.length) params.p_cluster = siteFilters.cluster;
    if (siteFilters?.zone_arcep?.length) params.p_zone_arcep = siteFilters.zone_arcep;
    if (siteFilters?.vendor?.length) params.p_constructeur = siteFilters.vendor;
    if (siteFilters?.techno?.length) params.p_techno = siteFilters.techno;
    if (siteFilters?.bande?.length) params.p_bande = siteFilters.bande;
    if (search) params.p_search = search;

    const { data, error } = await supabase.rpc('get_dashboard_sites', params);
    if (error) throw error;

    const qoeData = await getQoeMapData().catch(() => ({} as Record<string, QoeMapSiteData>));

    const sites: SiteSummary[] = ((data as any[]) || [])
      .filter((row: any) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
      .map((row: any) => {
        const site: SiteSummary = {
          site_id: row.code_nidt,
          site_name: row.nom_site,
          vendor: row.vendor || 'Unknown',
          dor: row.dor || '',
          cluster: row.plaque || row.cluster || '',
          department: (row.plaque || row.cluster || '').replace('DEPT_', ''),
          cell_count: Number(row.total_cells) || 0,
          qoe_score_avg: 0,
          p50_thr_dn_mbps: 0,
          p50_thr_up_mbps: 0,
          dms_dl_3: 0,
          dms_dl_8: 0,
          dms_dl_30: 0,
          dms_ul_3: 0,
          coordinates: [row.latitude, row.longitude] as [number, number],
          cells: [],
          zone_arcep: row.zone_arcep || null,
          lte_cells: Number(row.lte_cells) || 0,
          nr_cells: Number(row.nr_cells) || 0,
        };
        return applyQoeData(site, qoeData);
      });

    console.log(`[TopoService] Dashboard sites: ${sites.length} sites via RPC`);
    if (sites.length > 0) {
      dashboardSitesCache = { key, sites, ts: Date.now() };
      return sites;
    }
    // RPC returned empty — fall through to embedded fallback
  } catch (err) {
    console.warn('[TopoService] Dashboard RPC also failed', err);
  }

  const embeddedSites = getEmbeddedDashboardSites(siteFilters, search);
  console.log(`[TopoService] Dashboard sites: ${embeddedSites.length} sites via embedded fallback`);
  if (embeddedSites.length > 0) {
    dashboardSitesCache = { key, sites: embeddedSites, ts: Date.now() };
    onProgressiveBatch?.(embeddedSites);
  }
  return embeddedSites;
}

// ── NEW: On-demand cell loading per site with cache ──

const siteCellsCache = new Map<string, { cells: CellProperties[]; ts: number }>();
const SITE_CELLS_CACHE_TTL = 10 * 60 * 1000; // 10 min

export function invalidateSiteCellsCache() {
  siteCellsCache.clear();
}

function mapSiteDetailPayloadToCells(payload: any): CellProperties[] {
  const rows: any[] = Array.isArray(payload?.cells) ? payload.cells : [];
  if (rows.length === 0) return [];

  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const cellName = String(row?.cell_name || row?.nom_cellule || row?.cell_id || row?.source_cellule || '').trim();
    if (!cellName || seen.has(cellName)) return false;
    seen.add(cellName);
    return true;
  });

  const hasRealAzimut = uniqueRows.some((row) => {
    const azimut = Number(row?.azimut);
    return Number.isFinite(azimut) && azimut !== 0;
  });

  let sectorAzimutMap: Map<number, number> | null = null;
  if (!hasRealAzimut) {
    const sectorIndices = new Set<number>();
    uniqueRows.forEach((row) => {
      const cellName = String(row?.cell_name || row?.nom_cellule || row?.cell_id || '');
      sectorIndices.add(extractSectorIndex(cellName));
    });
    const sorted = Array.from(sectorIndices).sort((a, b) => a - b);
    sectorAzimutMap = new Map();
    sorted.forEach((idx, i) => {
      sectorAzimutMap!.set(idx, Math.round((360 / Math.max(sorted.length, 1)) * i));
    });
  }

  return uniqueRows.map((row) => {
    const cellName = String(row?.cell_name || row?.nom_cellule || row?.cell_id || '');
    const sectorIdx = extractSectorIndex(cellName);
    const azimutRaw = Number(row?.azimut);
    const azimut = hasRealAzimut && Number.isFinite(azimutRaw) && azimutRaw !== 0
      ? azimutRaw
      : (sectorAzimutMap?.get(sectorIdx) ?? 0);
    const techno = normalizeTechnoRaw(row?.techno || row?.technology || row?.rat);
    const bande = row?.band || row?.bande || inferBandFromCellName(cellName, techno);

    return buildCellProperties(
      cellName,
      techno,
      bande,
      azimut,
      // Keep hba null when the source row has no height — defaulting to 30
      // here masked missing DEM/topology data and made every site look like
      // it had a 30 m antenna in the Site Information panel.
      (() => { const v = Number(row?.hba ?? row?.height); return Number.isFinite(v) && v > 0 ? v : null; })(),
      {
        ...row,
        cell_name: cellName,
        nom_cellule: cellName,
        bande,
        code_nidt: row?.code_nidt || row?.id_site || payload?.code_nidt || null,
        nom_site: row?.site_name || payload?.site_name || null,
        constructeur: row?.constructeur || row?.vendor || payload?.vendor || null,
        cluster: row?.plaque || row?.cluster || payload?.plaque || payload?.cluster || null,
        zone_arcep: row?.zone_arcep || payload?.zone_arcep || null,
        dor: row?.dor || row?.dr || payload?.region || null,
        etat_cellule: row?.etat_cellule || row?.etat_fonctionnement || null,
        latitude: row?.latitude ?? payload?.latitude ?? null,
        longitude: row?.longitude ?? payload?.longitude ?? null,
        tilt: row?.tilt ?? null,
      },
    );
  });
}

/**
 * Fetch cells for a single site on demand.
 * Uses Supabase RPC get_site_cells, with local caching.
 */
export async function fetchSiteCells(siteId: string, fallbackSiteName?: string, cluster?: string): Promise<CellProperties[]> {
  const cacheKey = cluster ? `${siteId}__${cluster}` : siteId;
  const cached = siteCellsCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < SITE_CELLS_CACHE_TTL) {
    return cached.cells;
  }

  // ── 1) Try lightweight VPS /topo/cells?search=SITE_ID ──
  try {
    const params: Record<string, string> = { search: siteId, limit: '500' };
    if (cluster) params.cluster = cluster;
    const url = getVpsProxyUrl('parser', `/api/v1/topo/cells`, params);
    // Retry on 503 (edge function cold-start failures under load)
    let resp: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch(url, { headers: getVpsProxyHeaders() });
      if (resp.status !== 503) break;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    if (resp && resp.ok) {
      const data = await resp.json();
      const rows: any[] = Array.isArray(data) ? data : (data?.rows || data?.cells || []);
      const normalizedSiteId = siteId.trim().toUpperCase();
      const normalizedFallbackName = fallbackSiteName?.trim().toUpperCase() || '';

      // Filter rows belonging to this site (match by code_nidt OR site_name)
      const matchTokens = new Set([normalizedSiteId]);
      if (normalizedFallbackName) matchTokens.add(normalizedFallbackName);

      const siteRows = rows.filter((r: any) => {
        const ids = [r.code_nidt, r.site_id, r.site_name, r.nom_site]
          .filter(Boolean)
          .map((v: unknown) => String(v).trim().toUpperCase());
        return ids.some(id => matchTokens.has(id));
      });

      if (siteRows.length > 0) {
        // Deduplicate by cell_name
        const seen = new Set<string>();
        const uniqueRows = siteRows.filter((r: any) => {
          const key = r.cell_name || r.nom_cellule || '';
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Detect if any row has a real (non-zero, non-null) azimut
        const hasRealAzimut = uniqueRows.some((r: any) => (r.azimut ?? r.azimuth) != null && (r.azimut ?? r.azimuth) !== 0);

        // Compute synthetic azimuts based on sector index (fallback)
        const sectorIndices = new Set<number>();
        for (const r of uniqueRows) {
          const cellName = r.cell_name || r.nom_cellule || '';
          const lastChar = cellName.slice(-1);
          sectorIndices.add(/^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1);
        }
        const sorted = Array.from(sectorIndices).sort((a, b) => a - b);
        const sectorAzimutMap = new Map<number, number>();
        sorted.forEach((idx, i) => {
          sectorAzimutMap.set(idx, Math.round((360 / Math.max(sorted.length, 1)) * i));
        });

        const cells: CellProperties[] = uniqueRows.map((r: any) => {
          const cellName = r.cell_name || r.nom_cellule || '';
          const lastChar = cellName.slice(-1);
          const sectorIdx = /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
          // Use real azimut only if the site has real azimut data; otherwise use synthetic
          const rawAz = r.azimut ?? r.azimuth;
          const azimut = (hasRealAzimut && rawAz != null && rawAz !== 0)
            ? rawAz
            : sectorAzimutMap.get(sectorIdx) ?? 0;
          const technoRaw = r.techno || r.rat || '4G';
          const techUpper = technoRaw.toUpperCase();
          const techno = techUpper.includes('5G') || techUpper === 'NR' ? '5G'
            : techUpper.includes('3G') || techUpper === 'UMTS' || techUpper === 'WCDMA' ? '3G'
            : techUpper.includes('2G') || techUpper === 'GSM' ? '2G'
            : techUpper.includes('4G') || techUpper === 'LTE' ? '4G'
            : '4G';
          return buildCellProperties(
            cellName,
            techno,
            r.band || r.bande || inferBandFromCellName(cellName, techno),
            azimut,
            (Number.isFinite(Number(r.hba)) && Number(r.hba) > 0 ? Number(r.hba) : null),
            r,
          );
        });

        if (cells.length > 0) {
          siteCellsCache.set(cacheKey, { cells, ts: Date.now() });
          console.log(`[TopoService] Site cells (VPS/cells): ${cells.length} cells for ${siteId}`);
          return cells;
        }
      }
    }
  } catch (e) {
    console.warn('[TopoService] VPS /topo/cells failed:', e);
  }

  // ── 1b) Retry VPS /topo/cells with site_name if siteId didn't match ──
  if (fallbackSiteName && fallbackSiteName !== siteId) {
    try {
      const url = getVpsProxyUrl('parser', `/api/v1/topo/cells`, { search: fallbackSiteName, limit: '500' });
      const resp = await fetch(url, { headers: getVpsProxyHeaders() });
      if (resp && resp.ok) {
        const data = await resp.json();
        const rows: any[] = Array.isArray(data) ? data : (data?.rows || data?.cells || []);
        const normalizedName = fallbackSiteName.trim().toUpperCase();
        const siteRows = rows.filter((r: any) => {
          const name = String(r.site_name || r.nom_site || '').trim().toUpperCase();
          return name === normalizedName;
        });
        if (siteRows.length > 0) {
          const seen = new Set<string>();
          const uniqueRows = siteRows.filter((r: any) => {
            const key = r.cell_name || r.nom_cellule || '';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const hasRealAzimut = uniqueRows.some((r: any) => r.azimut != null && r.azimut !== 0);
          const sectorIndices = new Set<number>();
          for (const r of uniqueRows) {
            const cellName = r.cell_name || r.nom_cellule || '';
            const lastChar = cellName.slice(-1);
            sectorIndices.add(/^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1);
          }
          const sorted = Array.from(sectorIndices).sort((a, b) => a - b);
          const sectorAzimutMap = new Map<number, number>();
          sorted.forEach((idx, i) => {
            sectorAzimutMap.set(idx, Math.round((360 / Math.max(sorted.length, 1)) * i));
          });
          const cells: CellProperties[] = uniqueRows.map((r: any) => {
            const cellName = r.cell_name || r.nom_cellule || '';
            const lastChar = cellName.slice(-1);
            const sectorIdx = /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
            const azimut = (hasRealAzimut && r.azimut != null && r.azimut !== 0)
              ? r.azimut
              : sectorAzimutMap.get(sectorIdx) ?? 0;
            const technoRaw = r.techno || r.rat || '4G';
            const techUpper = technoRaw.toUpperCase();
            const techno = techUpper.includes('5G') || techUpper === 'NR' ? '5G'
              : techUpper.includes('3G') || techUpper === 'UMTS' || techUpper === 'WCDMA' ? '3G'
              : techUpper.includes('2G') || techUpper === 'GSM' ? '2G'
              : techUpper.includes('4G') || techUpper === 'LTE' ? '4G'
              : '4G';
            return buildCellProperties(cellName, techno, r.band || r.bande || inferBandFromCellName(cellName, techno), azimut, (Number.isFinite(Number(r.hba)) && Number(r.hba) > 0 ? Number(r.hba) : null), r);
          });
          if (cells.length > 0) {
            siteCellsCache.set(cacheKey, { cells, ts: Date.now() });
            console.log(`[TopoService] Site cells (VPS/cells by name): ${cells.length} cells for ${fallbackSiteName}`);
            return cells;
          }
        }
      }
    } catch (e) {
      console.warn('[TopoService] VPS /topo/cells by name failed:', e);
    }
  }

  // ── 2) Fallback to VPS /topo/site/:id-or-name (returns complete site payload with cells) ──
  try {
    const lookupCandidates = [siteId, fallbackSiteName]
      .map((value) => String(value || '').trim())
      .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

    for (const lookup of lookupCandidates) {
      const url = getVpsProxyUrl('parser', `/api/v1/topo/site/${encodeURIComponent(lookup)}`);
      const resp = await fetch(url, { headers: getVpsProxyHeaders() });
      if (!resp.ok) continue;

      const payload = await resp.json();
      const cells = mapSiteDetailPayloadToCells(payload);
      if (cells.length > 0) {
        siteCellsCache.set(cacheKey, { cells, ts: Date.now() });
        if (lookup !== siteId) {
          siteCellsCache.set(lookup, { cells, ts: Date.now() });
        }
        console.log(`[TopoService] Site cells (VPS/site): ${cells.length} cells for ${siteId} via ${lookup}`);
        return cells;
      }
    }
  } catch (e) {
    console.warn('[TopoService] VPS /topo/site fallback failed:', e);
  }

  // Supabase RPC fallback
  try {
    const { data, error } = await supabase.rpc('get_site_cells', { p_code_nidt: siteId });
    if (error) throw error;

    const rows = (data as any[]) || [];
    // Detect if any row has a real azimut
    const hasRealAzimut = rows.some(r => r.azimut != null && r.azimut !== 0);
    let sectorAzimutMap: Map<number, number> | null = null;
    if (!hasRealAzimut && rows.length > 0) {
      const sectorIndices = new Set<number>();
      for (const r of rows) {
        const cellName = r.nom_cellule || '';
        const lastChar = cellName.slice(-1);
        sectorIndices.add(/^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1);
      }
      const sorted = Array.from(sectorIndices).sort((a, b) => a - b);
      sectorAzimutMap = new Map();
      sorted.forEach((idx, i) => {
        sectorAzimutMap!.set(idx, Math.round((360 / Math.max(sorted.length, 1)) * i));
      });
    }

    const cells: CellProperties[] = rows.map((r: any) => {
      const cellName = r.nom_cellule || '';
      let azimut = r.azimut || 0;
      if (!hasRealAzimut && sectorAzimutMap) {
        const lastChar = cellName.slice(-1);
        const sectorIdx = /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
        azimut = sectorAzimutMap.get(sectorIdx) ?? 0;
      }
      return buildCellProperties(
        cellName,
        normalizeTechnoRaw(r.techno || r.rat),
        r.bande || inferBandFromCellName(cellName, r.techno || '4G'),
        azimut,
        (Number.isFinite(Number(r.hba)) && Number(r.hba) > 0 ? Number(r.hba) : null),
        r,
      );
    });

    siteCellsCache.set(cacheKey, { cells, ts: Date.now() });
    console.log(`[TopoService] Site cells (RPC): ${cells.length} cells for ${siteId}`);
    return cells;
  } catch (err) {
    console.warn(`[TopoService] Failed to fetch cells for ${siteId}:`, err);
    return [];
  }
}

// ── KPI cell values fetch ──
const kpiValueCache = new Map<string, { data: Map<string, number>; ts: number }>();
const KPI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch KPI values for map overlay — level-aware (cell / site / band).
 * Uses /pm/kpi/compute (ClickHouse) which always has data.
 */
export async function fetchKpiCellValues(
  kpiId: string,
  filters?: {
    vendor?: string; techno?: string; band?: string; dor?: string;
    cluster?: string; zone_arcep?: string; region?: string;
    site_name?: string;
    date_from?: string; date_to?: string;
    level?: 'cell' | 'site' | 'band';
  },
): Promise<Map<string, number>> {
  const level = filters?.level || 'cell';
  const cacheKey = `${kpiId}_${level}_${JSON.stringify(filters || {})}`;
  const cached = kpiValueCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < KPI_CACHE_TTL) return cached.data;

  // Build request for KPI Engine /monitor/query/timeseries (unified path)
  const splitByMap: Record<string, string> = { cell: 'CELL', site: 'SITE', band: 'BAND' };
  const monitorFilters: { dimension: string; op: string; values: string[] }[] = [];
  if (filters?.vendor) monitorFilters.push({ dimension: 'VENDOR', op: 'IN', values: [filters.vendor] });
  if (filters?.cluster) monitorFilters.push({ dimension: 'CLUSTER', op: 'IN', values: [filters.cluster] });
  if (filters?.dor) monitorFilters.push({ dimension: 'DOR', op: 'IN', values: [filters.dor] });
  if (filters?.band) monitorFilters.push({ dimension: 'BAND', op: 'IN', values: [filters.band] });
  if (filters?.techno) monitorFilters.push({ dimension: 'TECHNO', op: 'IN', values: [filters.techno] });
  if (filters?.site_name) {
    const sites = filters.site_name.split(',').map(s => s.trim()).filter(Boolean);
    if (sites.length > 0) monitorFilters.push({ dimension: 'SITE', op: 'IN', values: sites });
  }

  // Case-normalisation of the kpi code (2026-05-12 v7.0):
  // The precompute writes BOTH vendor formulas (Nokia M8006C* + Ericsson
  // pmErab*) into kpi_15m under the SAME canonical lowercase key
  // (`4g_lte_dcr_volte`, etc.). The engine fast_path keys on that
  // canonical, so stripping the `Nokia__&_` / `Ericsson__&_` prefix
  // here yields cross-vendor results (= what Investigator already
  // gets). Keeping the prefix narrows the result to one vendor and
  // leaves the other-vendor cells grey on the KPI Overlay map.
  //
  // The admin catalog now exposes the canonical forms directly
  // (kpi_aggregation_config rows added 2026-05-12), so the dropdown
  // shows them as first-class entries. This strip is a belt-and-
  // suspenders fallback for views saved BEFORE that catalog change
  // (which carry the vendor-prefixed `selectedKpis`).
  const normalisedKpiId = kpiId
    .replace(/^(Nokia|Ericsson|Huawei)__&_/i, '')
    .toLowerCase();

  // Granularity 2026-05-11 root-cause fix: `'total'` is NOT a key the
  // kpi-engine `_granularity_to_precomputed_table` recognises, so every
  // KPI fell through to the slow_path (raw counters in pm_15m) which
  // returns 0 for KPIs whose source counters are missing (e.g. Ericsson
  // pmRrc/pmS1 on REIMS). `'1d'` maps to the pre-computed `osmosis.kpi_1d`
  // table where shared KPIs (4g_lte_cssr_volte, 4g_lte_dcr_volte, ...) ARE
  // populated; the engine then returns 1 row per cell per day. With the
  // date range typically being 1-7 days, the front-end aggregates via
  // averaging into a single per-cell value below.
  const requestBody = {
    date_from: filters?.date_from || '',
    date_to: filters?.date_to || '',
    granularity: '1d',
    filters: monitorFilters,
    selections: [{ kpi_key: normalisedKpiId }],
    split_by: splitByMap[level] || 'CELL',
    top_n: 5000,
  };

  console.log('[KPI overlay] request via KPI Engine', { kpiId, level, body: requestBody });

  const computeUrl = getVpsProxyUrl('kpi', '/monitor/query/timeseries');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  const resp = await fetch(computeUrl, {
    method: 'POST',
    headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  if (!resp.ok) throw new Error(`KPI compute failed: ${resp.status}`);
  const json = await resp.json();

  const series: any[] = json.series || [];
  console.log('[KPI overlay] response', { kpiId, level, points: series.length, source: json.source });

  // Build value map from timeseries response
  // split_by=CELL → split_value = cell_name
  // split_by=SITE → split_value = site_name
  // split_by=BAND → split_value = band_name (need site_name too for band key)
  const valueMap = new Map<string, number>();
  const avgCounters = new Map<string, number>();

  for (const pt of series) {
    const val = pt.value;
    if (val == null || !Number.isFinite(val)) continue;

    const splitVal = (pt.split_value || '').trim();
    if (!splitVal) continue;

    if (level === 'cell') {
      // split_value = cell_name (or numeric ECI for some vendors —
      // those simply won't match by cell_name on the front-end and end
      // up grey / "No data", which is the honest behaviour).
      // Average across days when granularity='1d' returns multiple
      // points per cell over a multi-day range. Naive Map.set used to
      // keep only the last day's value; now we incremental-average.
      const existingCell = valueMap.get(splitVal);
      if (existingCell != null) {
        const count = (avgCounters.get(splitVal) || 1) + 1;
        avgCounters.set(splitVal, count);
        valueMap.set(splitVal, (existingCell * (count - 1) + val) / count);
      } else {
        valueMap.set(splitVal, val);
        avgCounters.set(splitVal, 1);
      }
      // Also store site-level average as fallback (per-cell rollup).
      const siteName = pt.site_name || splitVal.replace(/_ENB\d+.*$/, '');
      if (siteName) {
        const siteKey = `site:${siteName}`;
        const existing = valueMap.get(siteKey);
        if (existing != null) {
          const count = (avgCounters.get(siteKey) || 1) + 1;
          avgCounters.set(siteKey, count);
          valueMap.set(siteKey, (existing * (count - 1) + val) / count);
        } else {
          valueMap.set(siteKey, val);
          avgCounters.set(siteKey, 1);
        }
      }
    } else if (level === 'site') {
      // split_value = site_name
      valueMap.set(`site:${splitVal}`, val);
    } else if (level === 'band') {
      // split_value = band_name — need site context
      const siteName = pt.site_name || '';
      if (siteName) {
        valueMap.set(`band:${siteName}:${splitVal}`, val);
      }
    }
  }

  // Only cache when we got real KPI values — transient errors shouldn't persist
  if (valueMap.size > 0 && !json.error) {
    kpiValueCache.set(cacheKey, { data: valueMap, ts: Date.now() });
  }
  console.log(`[KPI overlay] ${valueMap.size} entries for ${kpiId} level=${level} (${series.length} raw points, source: ${json.source_table || 'compute'}${json.error ? `, warn: ${json.error}` : ''})`);
  return valueMap;
}

function buildKpiValueMap(data: any[]): Map<string, number> {
  const valueMap = new Map<string, number>();
  const setValue = (prefix: string, key: unknown, value: unknown) => {
    if (key == null || value == null) return;
    const normalized = String(key).trim();
    if (!normalized) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    valueMap.set(`${prefix}${normalized}`, numeric);
    valueMap.set(`${prefix}${normalized.toUpperCase()}`, numeric);
  };
  for (const row of data) {
    setValue('', row.cell_name || row.cell_id || row.nom_cellule, row.value);
    if (row.site_name && row.value != null) {
      const siteName = String(row.site_name).trim();
      const siteKey = `site:${siteName}`;
      const existing = valueMap.get(siteKey);
      if (existing != null) {
        const countKey = `count:${siteName}`;
        const count = (valueMap.get(countKey) || 1) + 1;
        valueMap.set(countKey, count);
        valueMap.set(siteKey, (existing * (count - 1) + Number(row.value)) / count);
        valueMap.set(`site:${siteName.toUpperCase()}`, valueMap.get(siteKey)!);
      } else {
        valueMap.set(siteKey, Number(row.value));
        valueMap.set(`site:${siteName.toUpperCase()}`, Number(row.value));
        valueMap.set(`count:${siteName}`, 1);
      }
    }
  }
  return valueMap;
}

// Clear KPI cache when filters change
export function clearKpiCache() {
  kpiValueCache.clear();
}


// ─── Visual Coverage cells feed ────────────────────────────────────
// 2026-05-11. The server-side /topo/visual-coverage Voronoi endpoint
// was replaced by an in-browser module (see src/coverage/). This
// service now only ships the raw cell list to the front-end module —
// the Voronoi math runs in the browser.

/** Row shape served by /api/v1/topo/cells-for-coverage. Matches the
 *  exact field names the Visual Coverage module expects (`lat`, `lon`,
 *  `azimuth`, `beamwidth`, `kpi`, ...) so the front-end can pass the
 *  array straight through with no remapping. */
export interface CoverageCell {
  id: string;
  siteId: string;
  siteName: string;
  lat: number;
  lon: number;
  azimuth: number;
  beamwidth: number;
  maxRadius: number;
  tech: string;
  band: string;
  vendor: string;
  /** KPI bucket. Server returns 'green' uniformly today (UX A.i, 2026-05-11);
   *  the front-end may override per cell after fetch when a KPI Overlay
   *  view is active — falling back to 'unknown' (No-data grey) for cells
   *  missing a value in the active KPI map. */
  kpi: 'green' | 'orange' | 'red' | 'unknown';
  /** Radio identifiers — added 2026-05-18 for the PCI Overlay (party
   *  decision). null when ref_cell_daily has no value (rare). */
  pci?: number | null;
  nci?: number | null;
  eci?: string | null;
}

export interface CoverageCellsResponse {
  cells: CoverageCell[];
  count: number;
  error?: string;
}

const _coverageCellsCache = new Map<string, { ts: number; data: CoverageCellsResponse }>();
const _COVERAGE_CELLS_TTL = 5 * 60 * 1000;  // 5 min — cell positions change rarely
const _COVERAGE_CELLS_MAX_ENTRIES = 6;

export interface CoverageCellsFilters {
  techno?: string;
  vendor?: string;
  plaque?: string;
  dor?: string;
  cluster?: string;
  band?: string;
}

function _ccCacheKey(b: BboxQuery, f: CoverageCellsFilters): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [
    r(b.minLng), r(b.minLat), r(b.maxLng), r(b.maxLat),
    `t=${f.techno || ''}`, `v=${f.vendor || ''}`,
    `p=${f.plaque || ''}`, `d=${f.dor || ''}`,
    `c=${f.cluster || ''}`, `b=${f.band || ''}`,
  ].join('|');
}

export async function fetchCellsForCoverage(
  bbox: BboxQuery,
  options?: CoverageCellsFilters & { signal?: AbortSignal },
): Promise<CoverageCellsResponse> {
  const { signal, ...filters } = options || {};
  const key = _ccCacheKey(bbox, filters);
  const cached = _coverageCellsCache.get(key);
  if (cached && (Date.now() - cached.ts) < _COVERAGE_CELLS_TTL) {
    return cached.data;
  }

  const params: Record<string, string> = {
    min_lng: String(bbox.minLng),
    max_lng: String(bbox.maxLng),
    min_lat: String(bbox.minLat),
    max_lat: String(bbox.maxLat),
  };
  for (const k of ['techno', 'vendor', 'plaque', 'dor', 'cluster', 'band'] as const) {
    const v = filters[k];
    if (v) params[k] = v;
  }

  const url = getVpsProxyUrl('parser', '/api/v1/topo/cells-for-coverage', params);
  const resp = await fetch(url, { headers: getVpsProxyHeaders(), signal });
  if (!resp.ok) {
    throw new Error(`/topo/cells-for-coverage HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as CoverageCellsResponse;
  if (_coverageCellsCache.size >= _COVERAGE_CELLS_MAX_ENTRIES) {
    const oldest = [..._coverageCellsCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _coverageCellsCache.delete(oldest[0]);
  }
  _coverageCellsCache.set(key, { ts: Date.now(), data });
  return data;
}

export function clearCoverageCellsCache() {
  _coverageCellsCache.clear();
}
