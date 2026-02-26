import { supabase } from '@/integrations/supabase/client';
import { isLocalMode, getApiUrl } from '@/lib/apiConfig';
import { SiteSummary, SiteDetail, CellProperties } from '../types';
import topoRaw from '../data/topoData';

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

// Cache
let cachedDbSites: SiteSummary[] | null = null;
let cachedLocalSites: SiteSummary[] | null = null;
let dbChecked = false;

export async function fetchTopoSites(): Promise<SiteSummary[]> {
  // Local-only mode: only fetch from local Express server
  if (isLocalMode()) {
    if (cachedLocalSites) return cachedLocalSites;
    try {
      const resp = await fetch(getApiUrl('topo') + '?limit=100000');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      // Support both old format (array) and new format ({ rows, total })
      const rows = Array.isArray(json) ? json : (json.rows || []);
      const total = json.total || rows.length;
      if (rows.length > 0) {
        cachedLocalSites = buildSitesFromRows(rows as TopoRow[]);
        console.log(`[TopoService] LOCAL: Loaded ${rows.length}/${total} cells → ${cachedLocalSites.length} sites`);
        return cachedLocalSites;
      }
      console.log('[TopoService] LOCAL: topo table empty');
      return [];
    } catch (err) {
      console.warn('[TopoService] LOCAL fetch failed', err);
      return [];
    }
  }

  // Cloud mode — parallel paginated fetch for large tables
  if (!dbChecked) {
    dbChecked = true;
    try {
      const allRows: TopoRow[] = [];
      const pageSize = 1000;
      const maxRows = 100000;

      const { count, error: countError } = await supabase
        .from('topo')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      const totalRows = Math.min(count || 0, maxRows);
      console.log(`[TopoService] CLOUD: Total rows = ${count}, fetching up to ${totalRows}`);

      if (totalRows === 0) {
        console.log('[TopoService] CLOUD: topo table empty');
      } else {
        const pages: { from: number; to: number }[] = [];
        for (let i = 0; i < totalRows; i += pageSize) {
          pages.push({ from: i, to: Math.min(i + pageSize - 1, totalRows - 1) });
        }

        const batchSize = 10;
        for (let b = 0; b < pages.length; b += batchSize) {
          const batch = pages.slice(b, b + batchSize);
          const results = await Promise.all(
            batch.map(({ from, to }) =>
              supabase
                .from('topo')
                .select('code_nidt, nom_site, region, longitude, latitude, nom_cellule, techno, bande, constructeur, azimut, plaque, hba, tac')
                .range(from, to)
            )
          );
          for (const { data, error } of results) {
            if (error) throw error;
            if (data) allRows.push(...(data as TopoRow[]));
          }
          console.log(`[TopoService] CLOUD: Fetched ${allRows.length}/${totalRows} rows...`);
        }

        if (allRows.length > 0) {
          cachedDbSites = buildSitesFromRows(allRows);
          console.log(`[TopoService] CLOUD: Loaded ${allRows.length} cells → ${cachedDbSites.length} sites`);
          return cachedDbSites;
        }
      }
    } catch (err) {
      console.warn('[TopoService] Cloud DB fetch failed', err);
    }
  }

  if (cachedDbSites) return cachedDbSites;

  console.log('[TopoService] No topo data available');
  return [];
}

export function invalidateTopoCache() {
  cachedDbSites = null;
  cachedLocalSites = null;
  dbChecked = false;
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
