import { SiteSummary, SiteDetail, CellProperties } from '../types';
import { supabase } from '@/integrations/supabase/client';
import topoRaw from '../data/topoData';

const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://localhost:3001';

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
}

function buildCellProperties(cellName: string, techno: string, bande: string, azimut: number, hba: number): CellProperties {
  return {
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
}

function buildSitesFromRows(rows: TopoRow[]): SiteSummary[] {
  const siteMap = new Map<string, TopoRow[]>();
  let autoIdx = 0;
  rows.forEach(row => {
    // When code_nidt is empty, treat each unique lat/lng pair as a distinct site
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
        r.hba || 0
      )
    );

    const vendor = first.constructeur
      ? first.constructeur.charAt(0).toUpperCase() + first.constructeur.slice(1)
      : 'Unknown';

    sites.push({
      site_id: siteId,
      site_name: first.nom_site,
      vendor,
      dor: DOR_MAP[first.region || ''] || 'DOR IDF',
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

let cachedLocalSites: SiteSummary[] | null = null;

export async function fetchTopoSites(): Promise<SiteSummary[]> {
  if (cachedLocalSites) return cachedLocalSites;

  // 1) Try local Express server
  try {
    const resp = await fetch(`${LOCAL_API}/api/topo?limit=100000`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const rows: TopoRow[] = json.rows ?? [];
    const total: number = json.total ?? rows.length;
    console.log(`[TopoService] LOCAL: received ${rows.length}/${total} cells`);
    if (rows.length > 0) {
      cachedLocalSites = buildSitesFromRows(rows);
      console.log(`[TopoService] LOCAL: Built ${cachedLocalSites.length} sites`);
      return cachedLocalSites;
    }
  } catch (err) {
    console.warn('[TopoService] LOCAL fetch failed, trying Cloud…', err);
  }

  // 2) Try Lovable Cloud (Supabase topo table)
  try {
    const PAGE_SIZE = 10000;
    let allRows: TopoRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < 100000) {
      const { data, error } = await supabase
        .from('topo')
        .select('*')
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        const mapped: TopoRow[] = data.map((r: any) => ({
          code_nidt: r.code_nidt,
          nom_site: r.nom_site,
          region: r.region,
          longitude: r.longitude,
          latitude: r.latitude,
          nom_cellule: r.nom_cellule,
          techno: r.techno,
          bande: r.bande,
          constructeur: r.constructeur,
          azimut: r.azimut,
          plaque: r.plaque,
          hba: r.hba,
          tac: r.tac,
        }));
        allRows = allRows.concat(mapped);
        offset += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }

    if (allRows.length > 0) {
      console.log(`[TopoService] CLOUD: received ${allRows.length} cells`);
      cachedLocalSites = buildSitesFromRows(allRows);
      console.log(`[TopoService] CLOUD: Built ${cachedLocalSites.length} sites`);
      return cachedLocalSites;
    }
  } catch (err) {
    console.warn('[TopoService] CLOUD fetch failed, falling back to embedded data', err);
  }

  // 3) Fallback to embedded static data
  cachedLocalSites = buildSitesFromLocalTopo();
  console.log(`[TopoService] FALLBACK: Built ${cachedLocalSites.length} sites from embedded data`);
  return cachedLocalSites;
}

export function invalidateTopoCache() {
  cachedLocalSites = null;
}

export async function fetchTopoSiteDetail(siteId: string): Promise<SiteDetail> {
  const sites = await fetchTopoSites();
  const site = sites.find(s => s.site_id === siteId) || sites[0];
  if (!site) {
    // Return a safe fallback when no sites exist
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
