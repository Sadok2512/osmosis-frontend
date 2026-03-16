import { SiteSummary, SiteDetail, CellProperties } from '../types';
import { topoApi, BboxFilters, BboxSiteDTO, qoeMapApi, QoeMapSiteData } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import topoRaw from '../data/topoData';

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

const DOR_MAP: Record<string, string> = {
  'UPR Nord-Est': 'DOR EST',
  'UPR Sud-Est': 'DOR SUD',
  'UPR Ouest': 'DOR OUEST',
  'UPR Sud-Ouest': 'DOR SUD',
};

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
  plaque: string | null;
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
}

function buildCellProperties(cellName: string, techno: string, bande: string, azimut: number, hba: number, extra?: Partial<TopoRow>): CellProperties {
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
    if (extra.tilt != null) ext.tilt = extra.tilt;
    if (extra.pci != null) ext.pci = extra.pci;
    if (extra.eci != null) ext.eci = extra.eci;
    if (extra.nci != null) ext.nci = extra.nci;
    if (extra.cid != null) ext.cid = extra.cid;
    if (extra.tac != null) ext.tac = extra.tac;
    if (extra.lac != null) ext.lac = extra.lac;
    if (extra.etat_cellule) ext.etat_cellule = extra.etat_cellule;
    if (extra.zone_arcep) ext.zone_arcep = extra.zone_arcep;
    if (extra.essentiel) ext.essentiel = extra.essentiel;
    if (extra.date_mes) ext.date_mes = extra.date_mes;
    if (extra.date_fn8) ext.date_fn8 = extra.date_fn8;
    if (extra.constructeur) ext.constructeur = extra.constructeur;
    if (extra.plaque) ext.plaque = extra.plaque;
    if (extra.latitude != null) ext.latitude = extra.latitude;
    if (extra.longitude != null) ext.longitude = extra.longitude;
    if (extra.hebergeur_leader) ext.hebergeur_leader = extra.hebergeur_leader;
    if (extra.relative_id != null) ext.relative_id = extra.relative_id;
  }
  return base;
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

    const cells = siteRows.map((r, index) =>
      buildCellProperties(
        r.nom_cellule || r.cell_name || `${siteId}_cell_${index + 1}`,
        (r.techno || '4G').toUpperCase().includes('5G') || (r.techno || '').toLowerCase() === '5g' ? '5G' : '4G',
        r.bande || r.band || '',
        r.azimut || 0,
        r.hba || 0,
        r,
      )
    );

    const rawVendor = first.constructeur || first.vendor;
    const vendor = rawVendor
      ? rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1)
      : 'Unknown';

    sites.push({
      site_id: first.code_nidt || siteId,
      site_name: first.nom_site || first.site_name || first.code_nidt || siteId,
      vendor,
      dor: first.dor || DOR_MAP[first.region || ''] || 'DOR IDF',
      plaque: first.plaque || '',
      department: (first.plaque || '').replace('DEPT_', ''),
      cell_count: cells.length,
      qoe_score_avg: cells.length > 0 ? avg(cells.map(c => c.qoe_score_avg)) : 0,
      p50_thr_dn_mbps: cells.length > 0 ? avg(cells.map(c => c.p50_thr_dn_mbps)) : 0,
      p50_thr_up_mbps: cells.length > 0 ? avg(cells.map(c => c.p50_thr_up_mbps)) : 0,
      dms_dl_3: avg(cells.map(c => c.dms_dl_3)),
      dms_dl_8: avg(cells.map(c => c.dms_dl_8)),
      dms_dl_30: avg(cells.map(c => c.dms_dl_30)),
      dms_ul_3: avg(cells.map(c => c.dms_ul_3)),
      coordinates: [avgLat, avgLng] as [number, number],
      cells,
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
    plaque: r.plaque,
    hba: r.hba,
    tac: null,
  }));
  return buildSitesFromRows(rows);
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
    const json = await topoApi.list(LEGACY_CAP);
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

  // 2) VPS/local may return rows without coordinates; ensure we still have usable sites
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
  return {
    site_id: siteId,
    site_name: dto.nom_site,
    vendor,
    dor: dto.dor || DOR_MAP[dto.region || ''] || 'DOR IDF',
    plaque: dto.plaque || '',
    department: (dto.plaque || '').replace('DEPT_', ''),
    cell_count: Number(dto.nb_cells) || 0,
    qoe_score_avg: 0,
    p50_thr_dn_mbps: 0,
    p50_thr_up_mbps: 0,
    dms_dl_3: 0,
    dms_dl_8: 0,
    dms_dl_30: 0,
    dms_ul_3: 0,
    coordinates: [lat, lng] as [number, number],
    cells: [], // cells loaded on-demand when zoomed in
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
export async function fetchSitesByBbox(
  bbox: BboxQuery,
  filters?: BboxFilters,
  signal?: AbortSignal,
): Promise<{ sites: SiteSummary[]; total: number }> {
  const key = bboxCacheKey(bbox, filters);
  if (bboxCache && bboxCache.key === key) {
    return { sites: bboxCache.sites, total: bboxCache.total };
  }

  try {
    const [resp, qoeData] = await Promise.all([
      topoApi.listSitesByBbox(bbox, filters, 8000, signal),
      getQoeMapData(),
    ]);

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

    bboxCache = { key, sites, total: sites.length };
    const withQoe = sites.filter(s => qoeData[s.site_name] || qoeData[s.site_id]).length;
    console.log(`[TopoService] BBOX: ${sites.length}/${resp.total} sites (${withQoe} with live QoE)`);
    return { sites, total: sites.length };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[TopoService] BBOX fetch failed, falling back to full load', err);
    const allSites = await fetchTopoSites();
    return { sites: allSites, total: allSites.length };
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
): Promise<SiteSummary[]> {
  // 1) Try local Express server
  try {
    const [resp, qoeData] = await Promise.all([
      topoApi.listCellsByBbox(bbox, filters, 8000, signal),
      getQoeMapData(),
    ]);

    if ((resp as any)?.unavailable) {
      throw new Error((resp as any).error || 'VPS parser unavailable');
    }

    const rows = (resp.cells || []) as TopoRow[];
    const sites = buildSitesFromRows(rows);
    return sites.map(s => applyQoeData(s, qoeData));
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[TopoService] BBOX cells fetch failed, falling back to Cloud', err);
  }

  // 2) Fallback: query Supabase topo table directly by bbox
  try {
    let query = supabase
      .from('topo')
      .select('code_nidt, nom_site, region, longitude, latitude, nom_cellule, techno, bande, constructeur, azimut, plaque, hba, tac, tilt, pci, eci, nci, cid, etat_cellule, zone_arcep, essentiel, date_mes, date_fn8, dor, lac, hebergeur_leader, relative_id')
      .gte('longitude', bbox.minLng)
      .lte('longitude', bbox.maxLng)
      .gte('latitude', bbox.minLat)
      .lte('latitude', bbox.maxLat);

    if (filters?.vendor && filters.vendor !== 'ALL') query = query.eq('constructeur', filters.vendor);
    if (filters?.techno && filters.techno !== 'ALL') query = query.eq('techno', filters.techno);
    if (filters?.bande && filters.bande !== 'ALL') query = query.eq('bande', filters.bande);
    if (filters?.dor && filters.dor !== 'ALL') query = query.eq('dor', filters.dor);
    if (filters?.plaque && filters.plaque !== 'ALL') query = query.eq('plaque', filters.plaque);

    // Paginate to get up to 80000 rows (cells)
    const PAGE_SIZE = 1000;
    const MAX_ROWS = 80000;
    const allRows: TopoRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && allRows.length < MAX_ROWS) {
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRows.push(...(data as TopoRow[]));
        if (data.length < PAGE_SIZE) hasMore = false;
        else offset += PAGE_SIZE;
      }
    }

    console.log(`[TopoService] CLOUD BBOX cells: ${allRows.length} rows`);
    const sites = buildSitesFromRows(allRows);
    const qoeData = await getQoeMapData().catch(() => ({} as Record<string, QoeMapSiteData>));
    return sites.map(s => applyQoeData(s, qoeData));
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[TopoService] Cloud BBOX cells fallback also failed', err);

    // 3) Last resort: use cached full sites filtered by bbox
    const allSites = await fetchTopoSites();
    return allSites.filter(s =>
      s.coordinates[1] >= bbox.minLng && s.coordinates[1] <= bbox.maxLng &&
      s.coordinates[0] >= bbox.minLat && s.coordinates[0] <= bbox.maxLat
    );
  }
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
      plaque: '',
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
