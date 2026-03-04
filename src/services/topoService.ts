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
    qoe_score_avg: seededRand(cellName + 'qoe', 55, 98),
    p95_rtt_ms: seededRand(cellName + 'rtt', 15, 180),
    traffic_up_bytes: seededRand(cellName + 'traf', 1e9, 5e10),
    traffic_dn_bytes: seededRand(cellName + 'trafd', 5e9, 1e11),
    dms_dl_3: seededRand(cellName + 'dms3', 75, 99),
    dms_dl_8: seededRand(cellName + 'dms8', 55, 95),
    dms_dl_30: seededRand(cellName + 'dms30', 15, 55),
    dms_ul_3: seededRand(cellName + 'ul3', 65, 95),
    p50_thr_dn_mbps: seededRand(cellName + 'thr', 8, 120),
    p50_thr_up_mbps: seededRand(cellName + 'thrup', 2, 40),
    sessions: Math.floor(seededRand(cellName + 'ses', 500, 50000)),
    window_full_ratio: seededRand(cellName + 'wfr', 20, 95),
    retransmission_rate: seededRand(cellName + 'retr', 0.5, 15),
    tcp_loss_rate: seededRand(cellName + 'tcpl', 0.1, 8),
    out_of_order_ratio: seededRand(cellName + 'ooo', 0.05, 5),
    p25_rtt_ms: seededRand(cellName + 'rtt25', 5, 60),
    p75_rtt_ms: seededRand(cellName + 'rtt75', 30, 120),
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
  const siteMap = new Map<string, TopoRow[]>();
  let autoIdx = 0;
  rows.forEach(row => {
    const key = row.code_nidt && row.code_nidt.trim() !== ''
      ? row.code_nidt
      : (row.latitude != null && row.longitude != null
          ? `auto_${row.latitude.toFixed(6)}_${row.longitude.toFixed(6)}`
          : `orphan_${autoIdx++}`);
    if (!siteMap.has(key)) siteMap.set(key, []);
    siteMap.get(key)!.push(row);
  });

  const sites: SiteSummary[] = [];
  siteMap.forEach((siteRows, siteId) => {
    const first = siteRows[0];
    const validRows = siteRows.filter(r => r.latitude != null && r.longitude != null);
    if (validRows.length === 0) return;

    const avgLat = avg(validRows.map(r => r.latitude!));
    const avgLng = avg(validRows.map(r => r.longitude!));

    const cells = siteRows.map(r =>
      buildCellProperties(
        r.nom_cellule,
        (r.techno || '4G').toUpperCase().includes('5G') || (r.techno || '').toLowerCase() === '5g' ? '5G' : '4G',
        r.bande || '',
        r.azimut || 0,
        r.hba || 0,
        r
      )
    );

    const vendor = first.constructeur
      ? first.constructeur.charAt(0).toUpperCase() + first.constructeur.slice(1)
      : 'Unknown';

    sites.push({
      site_id: siteId,
      site_name: first.nom_site,
      vendor,
      dor: first.dor || DOR_MAP[first.region || ''] || 'DOR IDF',
      plaque: first.plaque || '',
      department: (first.plaque || '').replace('DEPT_', ''),
      cell_count: cells.length,
      qoe_score_avg: avg(cells.map(c => c.qoe_score_avg)),
      p50_thr_dn_mbps: avg(cells.map(c => c.p50_thr_dn_mbps)),
      p50_thr_up_mbps: seededRand(siteId + 'thrup', 5, 40),
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

  // 1) Try local Express server
  try {
    const json = await topoApi.list(100000);
    const rows: TopoRow[] = json.rows ?? [];
    const total: number = json.total ?? rows.length;
    console.log(`[TopoService] LOCAL: received ${rows.length}/${total} cells`);
    if (rows.length > 0) {
      baseSites = buildSitesFromRows(rows);
      console.log(`[TopoService] LOCAL: Built ${baseSites.length} sites`);
    }
  } catch (err) {
    console.warn('[TopoService] LOCAL fetch failed, trying Cloud...', err);
  }

  // 2) Try Cloud (Supabase) topo table
  if (!baseSites) {
    try {
      const cloudRows = await fetchFromCloud();
      if (cloudRows.length > 0) {
        baseSites = buildSitesFromRows(cloudRows);
        console.log(`[TopoService] CLOUD: Built ${baseSites.length} sites from ${cloudRows.length} cells`);
      }
    } catch (err) {
      console.warn('[TopoService] CLOUD fetch failed, falling back to embedded data', err);
    }
  }

  // 3) Fallback to embedded static data
  if (!baseSites) {
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
function dtoToSiteSummary(dto: BboxSiteDTO): SiteSummary {
  const vendor = dto.vendor
    ? dto.vendor.charAt(0).toUpperCase() + dto.vendor.slice(1)
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
    qoe_score_avg: seededRand(siteId + 'qoe', 55, 98),
    p50_thr_dn_mbps: seededRand(siteId + 'thr', 8, 120),
    p50_thr_up_mbps: seededRand(siteId + 'thrup', 5, 40),
    dms_dl_3: seededRand(siteId + 'dms3', 75, 99),
    dms_dl_8: seededRand(siteId + 'dms8', 55, 95),
    dms_dl_30: seededRand(siteId + 'dms30', 15, 55),
    dms_ul_3: seededRand(siteId + 'ul3', 65, 95),
    coordinates: [Number(dto.lat), Number(dto.lng)] as [number, number],
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
    const sites = (resp.sites || []).map(dto => {
      const site = dtoToSiteSummary(dto);
      return applyQoeData(site, qoeData);
    });
    bboxCache = { key, sites, total: resp.total };
    const withQoe = sites.filter(s => qoeData[s.site_name] || qoeData[s.site_id]).length;
    console.log(`[TopoService] BBOX: ${sites.length}/${resp.total} sites (${withQoe} with live QoE)`);
    return { sites, total: resp.total };
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
