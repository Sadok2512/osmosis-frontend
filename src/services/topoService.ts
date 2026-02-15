import { supabase } from '@/integrations/supabase/client';
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
    dms_dl_3: seededRand(cellName + 'dms3', 75, 99),
    dms_dl_8: seededRand(cellName + 'dms8', 55, 95),
    dms_dl_30: seededRand(cellName + 'dms30', 15, 55),
    dms_ul_3: seededRand(cellName + 'ul3', 65, 95),
    p50_thr_dn_mbps: seededRand(cellName + 'thr', 8, 120),
    sessions: Math.floor(seededRand(cellName + 'ses', 500, 50000)),
  };
}

function buildSitesFromRows(rows: TopoRow[]): SiteSummary[] {
  const siteMap = new Map<string, TopoRow[]>();
  rows.forEach(row => {
    if (!siteMap.has(row.code_nidt)) siteMap.set(row.code_nidt, []);
    siteMap.get(row.code_nidt)!.push(row);
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
  // Try DB first (only check once per session, then cache)
  if (!dbChecked) {
    dbChecked = true;
    try {
      // Check count first
      const { count } = await supabase.from('topo').select('id', { count: 'exact', head: true });
      if (count && count > 0) {
        // Fetch all rows (paginated if needed)
        const allRows: TopoRow[] = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('topo')
            .select('code_nidt, nom_site, region, longitude, latitude, nom_cellule, techno, bande, constructeur, azimut, plaque, hba, tac')
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allRows.push(...(data as TopoRow[]));
            from += pageSize;
            if (data.length < pageSize) hasMore = false;
          }
        }
        if (allRows.length > 0) {
          cachedDbSites = buildSitesFromRows(allRows);
          console.log(`[TopoService] Loaded ${allRows.length} cells → ${cachedDbSites.length} sites from database`);
          return cachedDbSites;
        }
      }
    } catch (err) {
      console.warn('[TopoService] DB fetch failed, using local fallback', err);
    }
  }

  if (cachedDbSites) return cachedDbSites;

  // Fallback to local
  if (!cachedLocalSites) {
    cachedLocalSites = buildSitesFromLocalTopo();
    console.log(`[TopoService] Using local topo: ${cachedLocalSites.length} sites`);
  }
  return cachedLocalSites;
}

export function invalidateTopoCache() {
  cachedDbSites = null;
  cachedLocalSites = null;
  dbChecked = false;
}

export async function fetchTopoSiteDetail(siteId: string): Promise<SiteDetail> {
  const sites = await fetchTopoSites();
  const site = sites.find(s => s.site_id === siteId) || sites[0];
  return {
    ...site,
    traffic_dn_bytes: seededRand(siteId + 'vol', 1e12, 8e12),
    traffic_up_bytes: seededRand(siteId + 'volup', 1e11, 2e12),
    p95_rtt_ms: seededRand(siteId + 'rtt', 20, 150),
  };
}
