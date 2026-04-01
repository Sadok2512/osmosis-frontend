import { SiteSummary, SiteDetail, CellProperties } from '../types';
import { topoApi, BboxFilters, BboxSiteDTO, qoeMapApi, QoeMapSiteData } from '@/lib/localDb';
import { supabase } from '@/integrations/supabase/client';
import topoRaw from '../data/topoData';
import { DashboardSiteFilters } from '@/components/otarie/SitesMonitor';

// Only 4G (LTE) and 5G (NR) — ignore 2G/3G
const ALLOWED_TECHNOS = new Set(['4G', '5G', 'LTE', 'NR', '4g', '5g', 'lte', 'nr']);
function is4Gor5G(techno: string | null | undefined): boolean {
  if (!techno) return true; // include unknowns
  return ALLOWED_TECHNOS.has(techno.trim());
}
function filterSites4G5G(sites: SiteSummary[]): SiteSummary[] {
  return sites.map(site => {
    if (!site.cells || site.cells.length === 0) return site;
    const filtered = site.cells.filter(c => is4Gor5G(c.techno));
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

/**
 * Infer band from cell name when backend doesn't provide it.
 * Common patterns: ENB1 → B1/1800, ENB3 → B3/1800, GNB1 → NR2100, etc.
 */
function inferBandFromCellName(cellName: string, techno: string): string {
  if (!cellName) return '';
  const upper = cellName.toUpperCase();
  const is5G = techno.toUpperCase().includes('5G') || techno.toUpperCase().includes('NR') || upper.includes('GNB');

  // Try to extract band indicator from cell name patterns like _ENB1_, _GNB1_, _B28_, _N78_
  const enbMatch = upper.match(/ENB(\d+)/);
  const gnbMatch = upper.match(/GNB(\d+)/);
  const bandNumMatch = upper.match(/[_\-]B(\d+)[_\-]/);
  const nrBandMatch = upper.match(/[_\-]N(\d+)[_\-]/);

  if (gnbMatch || is5G) {
    // 5G cell
    if (upper.includes('3500') || upper.includes('N78')) return 'NR3500';
    if (upper.includes('2100') || upper.includes('N1')) return 'NR2100';
    if (upper.includes('700') || upper.includes('N28')) return 'NR700';
    if (nrBandMatch) {
      const n = nrBandMatch[1];
      if (n === '78') return 'NR3500';
      if (n === '1') return 'NR2100';
      if (n === '28') return 'NR700';
    }
    return 'NR3500'; // default 5G band
  }

  // 4G cell
  if (upper.includes('2600') || upper.includes('B7')) return 'L2600';
  if (upper.includes('1800') || upper.includes('B3')) return 'L1800';
  if (upper.includes('2100') || upper.includes('B1')) return 'L2100';
  if (upper.includes('800') || upper.includes('B20')) return 'L800';
  if (upper.includes('700') || upper.includes('B28')) return 'L700';
  if (bandNumMatch) {
    const b = bandNumMatch[1];
    if (b === '7') return 'L2600';
    if (b === '3') return 'L1800';
    if (b === '1') return 'L2100';
    if (b === '20') return 'L800';
    if (b === '28') return 'L700';
  }
  return 'L1800'; // default 4G band
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

    const cells = siteRows.map((r, index) => {
      const cellName = r.nom_cellule || r.cell_name || `${siteId}_cell_${index + 1}`;
      let azimut = r.azimut || 0;
      if (!hasRealAzimut && sectorAzimutMap) {
        azimut = sectorAzimutMap.get(extractSectorIndex(cellName)) ?? 0;
      }
      return buildCellProperties(
        cellName,
        (r.techno || '4G').toUpperCase().includes('5G') || (r.techno || '').toLowerCase() === '5g' ? '5G' : '4G',
        r.bande || r.band || inferBandFromCellName(cellName, r.techno || '4G'),
        azimut,
        r.hba || 30,
        r,
      );
    });

    const rawVendor = first.constructeur || first.vendor;
    const vendor = rawVendor
      ? rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1)
      : 'Unknown';

    sites.push({
      site_id: first.code_nidt || siteId,
      site_name: first.nom_site || first.site_name || first.code_nidt || siteId,
      vendor,
      dor: normalizeDorValue(first.dor, first.region),
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
    const json = await topoApi.listFull(LEGACY_CAP);
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
    dor: normalizeDorValue(dto.dor, dto.region),
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
    zone_arcep: (dto as any).zone_arcep || null,
    techno: (dto as any).techno || null,
    bande: (dto as any).bande || null,
    lte_cells: dto.lte_cells || 0,
    nr_cells: dto.nr_cells || 0,
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

    const filtered4G5G = filterSites4G5G(sites);
    bboxCache = { key, sites: filtered4G5G, total: filtered4G5G.length };
    const withQoe = filtered4G5G.filter(s => qoeData[s.site_name] || qoeData[s.site_id]).length;
    console.log(`[TopoService] BBOX: ${filtered4G5G.length}/${resp.total} sites (${withQoe} with live QoE)`);
    return { sites: filtered4G5G, total: filtered4G5G.length };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn('[TopoService] BBOX fetch failed (VPS only, no fallback)', err);
    return { sites: [], total: 0 };
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
  // Strategy: try /sites-with-cells first, then fall back to /cells merge
  let sitesFromEndpoint: SiteSummary[] | null = null;

  try {
    const resp = await topoApi.listSitesWithCells(bbox, filters, 8000, signal);

    if ((resp as any)?.unavailable) {
      throw new Error('VPS parser unavailable');
    }

    const qoeData = await getQoeMapData().catch(() => ({} as Record<string, QoeMapSiteData>));
    sitesFromEndpoint = (resp.sites || [])
      .filter((s: any) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((s: any) => {
        const canonicalSiteId = String(s.code_nidt || s.site_id || s.site_name || '').trim();
        const displaySiteName = String(s.nom_site || s.site_name || canonicalSiteId).trim();
        const cells = (s.cells || []).map((c: any) => {
          const rawTechno = c.techno || '4G';
          const rawBande = c.bande || '';
          const effectiveBande = rawBande || inferBandFromCellName(c.nom_cellule || c.cell_id || '', rawTechno);
          return {
            cell_id: c.nom_cellule || c.cell_id,
            cell_name: c.nom_cellule || c.cell_id || '',
            techno: rawTechno,
            bande: effectiveBande,
          vendor: c.constructeur || '',
          azimut: c.azimut != null ? Number(c.azimut) : null,
          tilt: c.tilt != null ? Number(c.tilt) : null,
          pci: c.pci || null,
          eci: c.eci || null,
          nci: c.nci || null,
          cid: c.cid || null,
          tac: c.tac || null,
          etat_cellule: c.etat_cellule || null,
          essentiel: c.essentiel || null,
          date_mes: c.date_mes || null,
          date_fn8: c.date_fn8 || null,
          classe_cellule: c.classe_cellule || null,
          couverture: c.couverture || null,
          freq: c.freq || null,
          secteur: c.secteur || null,
          code_nidt: c.code_nidt || canonicalSiteId || null,
          hebergeur_leader: c.hebergeur_leader || null,
          saisonnalite: c.saisonnalite || null,
          type_5g: c.type_5g || null,
          hba: c.hba || null,
          latitude: c.lat_raw || null,
          longitude: c.lng_raw || null,
          zone_arcep: s.zone_arcep || null,
          plaque: s.plaque || c.plaque || null,
        };
        });
        const site: SiteSummary = {
          site_id: canonicalSiteId,
          site_name: displaySiteName,
          vendor: s.constructeur || cells[0]?.vendor || 'Unknown',
          dor: s.dor || '',
          plaque: s.plaque || '',
          department: (s.plaque || '').replace('DEPT_', ''),
          cell_count: cells.length,
          qoe_score_avg: 0,
          p50_thr_dn_mbps: 0,
          p50_thr_up_mbps: 0,
          dms_dl_3: 0,
          dms_dl_8: 0,
          dms_dl_30: 0,
          dms_ul_3: 0,
          coordinates: [Number(s.latitude), Number(s.longitude)] as [number, number],
          cells,
          zone_arcep: s.zone_arcep || null,
          lte_cells: cells.filter((c: any) => c.techno === '4G' || c.techno === 'LTE').length,
          nr_cells: cells.filter((c: any) => c.techno === '5G' || c.techno === 'NR').length,
        };
        return applyQoeData(site, qoeData);
      });

    console.log(`[TopoService] BBOX cells: ${sitesFromEndpoint.length} sites, ${resp.total_cells || 0} cells (server-side, 4G/5G only)`);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[TopoService] Server-side cells fetch failed, trying cells-merge fallback', err);
  }

  // No fallback — VPS only

  if (!sitesFromEndpoint) return [];

  return filterSites4G5G(sitesFromEndpoint);
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
  if (siteFilters?.constructeur?.length) bboxFilters.vendor = siteFilters.constructeur.join(',');
  if (siteFilters?.plaque?.length) bboxFilters.plaque = siteFilters.plaque.join(',');
  if (siteFilters?.zone_arcep?.length) bboxFilters.zone_arcep = siteFilters.zone_arcep.join(',');
  if (siteFilters?.techno?.length) bboxFilters.techno = siteFilters.techno.join(',');
  if (siteFilters?.bande?.length) bboxFilters.bande = siteFilters.bande.join(',');
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

    const filteredSites = filterSites4G5G(rawSites);

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
    }
    return enrichedSites;
  } catch (err) {
    console.warn('[TopoService] VPS dashboard fetch failed, trying RPC', err);
  }

  // 2) Supabase RPC fallback
  try {
    const params: Record<string, any> = {};
    if (siteFilters?.dor?.length) params.p_dor = siteFilters.dor;
    if (siteFilters?.plaque?.length) params.p_plaque = siteFilters.plaque;
    if (siteFilters?.zone_arcep?.length) params.p_zone_arcep = siteFilters.zone_arcep;
    if (siteFilters?.constructeur?.length) params.p_constructeur = siteFilters.constructeur;
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
          plaque: row.plaque || '',
          department: (row.plaque || '').replace('DEPT_', ''),
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
    }
    return sites;
  } catch (err) {
    console.warn('[TopoService] Dashboard RPC also failed', err);
    return [];
  }
}

// ── NEW: On-demand cell loading per site with cache ──

const siteCellsCache = new Map<string, { cells: CellProperties[]; ts: number }>();
const SITE_CELLS_CACHE_TTL = 10 * 60 * 1000; // 10 min

export function invalidateSiteCellsCache() {
  siteCellsCache.clear();
}

/**
 * Fetch cells for a single site on demand.
 * Uses Supabase RPC get_site_cells, with local caching.
 */
export async function fetchSiteCells(siteId: string): Promise<CellProperties[]> {
  const cached = siteCellsCache.get(siteId);
  if (cached && (Date.now() - cached.ts) < SITE_CELLS_CACHE_TTL) {
    return cached.cells;
  }

  try {
    // Try VPS first
    const bboxFilters: BboxFilters = {};
    // Use /sites-with-cells for complete cell data
    const vpsResp = await topoApi.listSitesWithCells(
      { minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 },
      { ...bboxFilters, q: siteId },
      1000,
    ).then(r => {
      // Convert to cells format expected by downstream code
      const allCells: any[] = [];
      for (const s of (r.sites || [])) {
        const canonicalSiteId = String(s.code_nidt || s.site_id || s.site_name || '').trim();
        const displaySiteName = String(s.nom_site || s.site_name || canonicalSiteId).trim();
        for (const c of (s.cells || [])) {
          allCells.push({
            ...c,
            code_nidt: c.code_nidt || canonicalSiteId,
            nom_site: displaySiteName,
            site_name: displaySiteName,
            site_id: canonicalSiteId,
            nom_cellule: c.nom_cellule,
            latitude: s.latitude,
            longitude: s.longitude,
          });
        }
      }
      return { cells: allCells, total: allCells.length };
    }).catch(() => null);

    if (vpsResp && vpsResp.cells && vpsResp.cells.length > 0) {
      const normalizedSiteId = siteId.trim().toUpperCase();
      const matchingRows = vpsResp.cells.filter((cell: any) => {
        const identities = [cell.code_nidt, cell.site_id, cell.site_name, cell.nom_site]
          .filter(Boolean)
          .map((value: unknown) => String(value).trim().toUpperCase());
        return identities.includes(normalizedSiteId);
      });

      const sourceRows = matchingRows.length > 0 ? matchingRows : vpsResp.cells;
      const sites = buildSitesFromRows(sourceRows as TopoRow[]);
      const matchedSite = sites.find(site => {
        const identities = [site.site_id, site.site_name]
          .filter(Boolean)
          .map(value => String(value).trim().toUpperCase());
        return identities.includes(normalizedSiteId);
      });

      if (matchedSite && matchedSite.cells.length > 0) {
        siteCellsCache.set(siteId, { cells: matchedSite.cells, ts: Date.now() });
        console.log(`[TopoService] Site cells (VPS): ${matchedSite.cells.length} cells for ${siteId}`);
        return matchedSite.cells;
      }
    }
  } catch {}

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
        (r.techno || '4G').toUpperCase().includes('5G') || (r.techno || '').toLowerCase() === '5g' ? '5G' : '4G',
        r.bande || inferBandFromCellName(cellName, r.techno || '4G'),
        azimut,
        r.hba || 30,
        r,
      );
    });

    siteCellsCache.set(siteId, { cells, ts: Date.now() });
    console.log(`[TopoService] Site cells (RPC): ${cells.length} cells for ${siteId}`);
    return cells;
  } catch (err) {
    console.warn(`[TopoService] Failed to fetch cells for ${siteId}:`, err);
    return [];
  }
}
