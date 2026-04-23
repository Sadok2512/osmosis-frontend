/**
 * Local database client — routes through VPS proxy edge function.
 * Every component should import from here instead of supabase client.
 *
 * VPS Parser (:8000) endpoints:
 *   /api/v1/topo/cells, /api/v1/topo/hierarchy, /api/v1/topo/distinct, /api/v1/topo/resolve-cells
 *   /api/v1/qoe/metrics, /api/v1/qoe/dates, /api/v1/qoe/dimensions, /api/v1/qoe/summary, /api/v1/qoe/kpi-columns
 *   /api/v1/pm/nokia/...
 *   /api/v1/cm/...
 *   /api/v1/fm/...
 *   /api/v1/config/...
 */

import { supabase } from '@/integrations/supabase/client';
import { getPreferredDataSource, getVpsProxyUrl, getVpsProxyHeaders } from './apiConfig';
import { inferBandFromCellName } from '@/services/topoService';

const LOCAL_API = import.meta.env.VITE_LOCAL_API || 'http://localhost:3001';

/** Build a VPS proxy URL for Parser :8000 */
function parserUrl(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return getVpsProxyUrl('parser', `/api/v1${cleanPath}`);
}

/** Build a VPS proxy URL for KPI Engine :8001 */
function kpiUrl(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return getVpsProxyUrl('kpi', cleanPath);
}

/** Legacy url() for local Express mode only */
function localUrl(path: string) {
  const clean = path.replace(/^\/?(api\/)?/, '');
  return `${LOCAL_API}/api/${clean}`;
}

function getHeaders(): Record<string, string> {
  const source = getPreferredDataSource();
  if (source === 'vps') {
    return getVpsProxyHeaders();
  }
  return { 'Content-Type': 'application/json' };
}

function isVps(): boolean {
  return getPreferredDataSource() === 'vps';
}

function isLocalExpress(): boolean {
  return getPreferredDataSource() === 'local';
}

/** Detect if we should use local or VPS (not cloud) */
function useLocal(): boolean {
  const src = getPreferredDataSource();
  return src === 'local' || src === 'vps';
}

// Retry on transient edge-function cold-starts (BOOT_ERROR) and gateway hiccups
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

function backoffDelay(attempt: number): number {
  // Exponential backoff with jitter: ~600ms, 1.2s, 2.4s, 4s (+/- 200ms)
  const base = Math.min(600 * Math.pow(2, attempt), 4000);
  return base + Math.floor(Math.random() * 200);
}

async function fetchJson<T = any>(fetchUrl: string, init?: RequestInit): Promise<T> {
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(fetchUrl, { headers: getHeaders(), ...init });
      if (TRANSIENT_STATUSES.has(resp.status) && attempt < maxRetries) {
        const delay = backoffDelay(attempt);
        console.warn(`[localDb] ${resp.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      const msg = (err as Error).message || '';
      const isTransient = err instanceof TypeError || /\b(502|503|504|BOOT_ERROR)\b/.test(msg);
      if (attempt < maxRetries && isTransient) {
        const delay = backoffDelay(attempt);
        console.warn(`[localDb] Fetch error attempt ${attempt + 1} (${msg}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('HTTP 503 after retries');
}

async function fetchJsonSignal<T = any>(fetchUrl: string, signal?: AbortSignal): Promise<T> {
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(fetchUrl, { signal, headers: getHeaders() });
      if (TRANSIENT_STATUSES.has(resp.status) && attempt < maxRetries) {
        const delay = backoffDelay(attempt);
        console.warn(`[localDb] ${resp.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (err) {
      if (signal?.aborted) throw err;
      const msg = (err as Error).message || '';
      const isTransient = err instanceof TypeError || /\b(502|503|504|BOOT_ERROR)\b/.test(msg);
      if (attempt < maxRetries && isTransient) {
        const delay = backoffDelay(attempt);
        console.warn(`[localDb] Fetch error attempt ${attempt + 1} (${msg}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('HTTP 503 after retries');
}

// ─── Dashboards — stored on VPS PostgreSQL (RAN_OP) ───
export const dashboardsApi = {
  list: async (): Promise<any[]> => {
    try {
      const url = parserUrl('/dashboards/');
      const resp = await fetch(url, { headers: getVpsProxyHeaders() });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn('[Dashboards] VPS list failed, trying Supabase fallback', e);
      const { data } = await supabase.from('dashboards').select('*').eq('is_archived', false).order('updated_at', { ascending: false });
      return data || [];
    }
  },
  upsert: async (dashboard: { id: string; name: string; description?: string; widgets: any; is_shared?: boolean; dashboard_type?: string; visibility?: string; owner_username?: string; shared_with?: string[] }) => {
    // VPS parser endpoint frequently returns 500 on large dashboard payloads.
    // Persist directly to Supabase (source of truth); mirror to VPS as best-effort.
    const payload: Record<string, any> = {
      id: dashboard.id, name: dashboard.name, description: dashboard.description || '',
      widgets: dashboard.widgets, is_shared: dashboard.is_shared ?? true,
      updated_at: new Date().toISOString(),
    };
    if (dashboard.dashboard_type) payload.dashboard_type = dashboard.dashboard_type;
    if (dashboard.visibility) payload.visibility = dashboard.visibility;
    if (dashboard.owner_username) payload.owner_username = dashboard.owner_username;
    if (dashboard.shared_with) payload.shared_with = dashboard.shared_with;
    const { data, error } = await supabase
      .from('dashboards')
      .upsert(payload as any, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;

    // Fire-and-forget VPS mirror — silent on failure (server returns 500 on big payloads).
    try {
      const url = parserUrl('/dashboards/');
      fetch(url, {
        method: 'POST',
        headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(dashboard),
      }).catch(() => {});
    } catch { /* ignore */ }

    return data;
  },
  update: async (id: string, updates: Record<string, any>) => {
    try {
      const url = parserUrl(`/dashboards/${id}`);
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { ...getVpsProxyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn('[Dashboards] VPS update failed, trying Supabase fallback', e);
      const { data, error } = await supabase.from('dashboards').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
  },
  remove: async (id: string) => {
    try {
      const url = parserUrl(`/dashboards/${id}`);
      const resp = await fetch(url, { method: 'DELETE', headers: getVpsProxyHeaders() });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn('[Dashboards] VPS delete failed, trying Supabase fallback', e);
      const { error } = await supabase.from('dashboards').update({ is_archived: true }).eq('id', id);
      if (error) throw error;
    }
    return { ok: true };
  },
};

// ─── Map Views — always Cloud (Supabase), never VPS ───
export const mapViewsApi = {
  list: async () => {
    if (isLocalExpress()) {
      return fetchJson<any[]>(localUrl('map-views'));
    }
    const { data, error } = await supabase
      .from('map_views')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  create: async (view: { name: string; settings: any; description?: string }) => {
    if (isLocalExpress()) {
      return fetchJson(localUrl('map-views'), { method: 'POST', body: JSON.stringify(view) });
    }
    const { data, error } = await supabase
      .from('map_views')
      .insert(view)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  update: async (id: string, updates: Record<string, any>) => {
    if (isLocalExpress()) {
      return fetchJson(localUrl(`map-views/${id}`), { method: 'PUT', body: JSON.stringify(updates) });
    }
    const { data, error } = await supabase
      .from('map_views')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  remove: async (id: string) => {
    if (isLocalExpress()) {
      return fetchJson(localUrl(`map-views/${id}`), { method: 'DELETE' });
    }
    const { error } = await supabase
      .from('map_views')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  },
};

// ─── Topo — VPS Parser :8000 ───
export interface BboxSiteDTO {
  code_nidt: string;
  nom_site: string;
  lat: number;
  lng: number;
  nb_cells: number;
  vendor: string | null;
  plaque: string | null;
  dor: string | null;
  region: string | null;
  zone_arcep?: string | null;
  techno?: string | null;
  bande?: string | null;
  lte_cells?: number;
  nr_cells?: number;
  cells_2g?: number;
  cells_3g?: number;
  bcluster?: string | null;
}

export interface BboxSitesResponse {
  sites: BboxSiteDTO[];
  total: number;
}

export interface BboxCellsResponse {
  cells: any[];
  total: number;
}

export interface BboxFilters {
  dor?: string;
  vendor?: string;
  plaque?: string;
  techno?: string;
  bande?: string;
  zone_arcep?: string;
  bcluster?: string;
  q?: string;
}

function flattenTopoFieldValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flattenTopoFieldValues);
  if (value == null) return [];
  return String(value)
    .split(/[,/;|]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function inferTopoTechPresence(values: string[]): { has2G: boolean; has3G: boolean; has4G: boolean; has5G: boolean } {
  const upperValues = values.map(value => value.toUpperCase());
  const has2G = upperValues.some(value => value.includes('2G') || value.includes('GSM'));
  const has3G = upperValues.some(value => value.includes('3G') || value.includes('UMTS') || value.includes('WCDMA'));
  const has5G = upperValues.some(value => value.includes('5G') || value.includes('NR'));
  const has4G = upperValues.some(value => (value.includes('4G') || value.includes('LTE') || /^L\d+/.test(value)) && !value.includes('NR'));
  return { has2G, has3G, has4G, has5G };
}

function resolveTopoSiteTechSummary(site: any): {
  techno: string | null;
  bande: string | null;
  lteCells: number;
  nrCells: number;
  cells2g: number;
  cells3g: number;
} {
  const techValues = [
    ...flattenTopoFieldValues(site.techno),
    ...flattenTopoFieldValues(site.technos),
    ...flattenTopoFieldValues(site.rat),
    ...flattenTopoFieldValues(site.rats),
    ...flattenTopoFieldValues(site.bande),
    ...flattenTopoFieldValues(site.band),
    ...flattenTopoFieldValues(site.bands),
  ];
  const inferred = inferTopoTechPresence(techValues);

  const lteCells = Math.max(Number(site.lte_cells ?? site.nb_lte ?? site.cells_4g ?? site.nb_4g ?? 0) || 0, inferred.has4G ? 1 : 0);
  const nrCells = Math.max(Number(site.nr_cells ?? site.nb_nr ?? site.cells_5g ?? site.nb_5g ?? 0) || 0, inferred.has5G ? 1 : 0);
  const cells2g = Math.max(Number(site.cells_2g ?? site.nb_2g ?? site.nb_gsm ?? site.gsm_cells ?? 0) || 0, inferred.has2G ? 1 : 0);
  const cells3g = Math.max(Number(site.cells_3g ?? site.nb_3g ?? site.nb_umts ?? site.umts_cells ?? 0) || 0, inferred.has3G ? 1 : 0);

  const canonicalTechs = [
    cells2g > 0 ? '2G' : null,
    cells3g > 0 ? '3G' : null,
    lteCells > 0 ? '4G' : null,
    nrCells > 0 ? '5G' : null,
  ].filter(Boolean).join(', ');

  const techno = canonicalTechs || flattenTopoFieldValues(site.techno ?? site.technos ?? site.rat).join(', ') || null;
  const bande = flattenTopoFieldValues(site.bande ?? site.band ?? site.bands).join(', ') || null;

  return { techno, bande, lteCells, nrCells, cells2g, cells3g };
}

// ── Module-level cells cache (avoids re-fetching 50k cells on every zoom/pan) ──
let _cellsCache: { key: string; cells: any[]; ts: number } | null = null;
const CELLS_CACHE_TTL = 10 * 60 * 1000; // 10 min
const CHUNK_SIZE = 10000;
const MAX_CELLS_CACHE = 50000; // Cap to avoid downloading 800K+ cells
let _cellsCacheLoading = false;
let _cellsCacheVersion = 0; // increments on every chunk arrival
type CellsCacheListener = (version: number) => void;
const _cellsCacheListeners = new Set<CellsCacheListener>();

function emitCellsCacheUpdate() {
  for (const fn of _cellsCacheListeners) fn(_cellsCacheVersion);
}

/** Subscribe to cells cache updates (new chunks loaded). Returns unsubscribe fn. */
export function onCellsCacheUpdate(fn: CellsCacheListener): () => void {
  _cellsCacheListeners.add(fn);
  return () => _cellsCacheListeners.delete(fn);
}

/** Whether the cells cache is still loading chunks in the background */
export function isCellsCacheLoading(): boolean {
  return _cellsCacheLoading;
}

/** Current cells cache version (increments on each chunk) */
export function getCellsCacheVersion(): number {
  return _cellsCacheVersion;
}

/** Number of cells currently loaded into the in-memory cache */
export function getCellsCacheCount(): number {
  return _cellsCache?.cells.length || 0;
}

// Fast site→cells index, rebuilt on each cache version change
let _cellsSiteIndex: Map<string, any[]> | null = null;
let _cellsSiteIndexVersion = -1;

function ensureSiteIndex(): Map<string, any[]> {
  if (_cellsSiteIndex && _cellsSiteIndexVersion === _cellsCacheVersion) return _cellsSiteIndex;
  const idx = new Map<string, any[]>();
  if (_cellsCache) {
    for (const c of _cellsCache.cells) {
      const name = c.site_name || c.nom_site || '';
      if (!name) continue;
      let arr = idx.get(name);
      if (!arr) { arr = []; idx.set(name, arr); }
      arr.push(c);
    }
  }
  _cellsSiteIndex = idx;
  _cellsSiteIndexVersion = _cellsCacheVersion;
  return idx;
}

/** Look up cells for a given site name directly from the in-memory cache (no fetch). */
export function getCellsFromCacheForSite(siteName: string): any[] {
  if (!_cellsCache) return [];
  const key = siteName?.trim();
  if (!key) return [];
  return ensureSiteIndex().get(key) || [];
}

function cellsCacheKey(filters?: BboxFilters): string {
  if (!filters) return 'all';
  return Object.entries(filters).filter(([, v]) => v && v !== 'ALL').map(([k, v]) => `${k}=${v}`).sort().join('&') || 'all';
}

/** Build filter query string for cells endpoint */
function buildCellsQs(filters?: BboxFilters, limit = CHUNK_SIZE, offset = 0): URLSearchParams {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters?.plaque && filters.plaque !== 'ALL') qs.set('plaque', filters.plaque);
  if (filters?.dor && filters.dor !== 'ALL') qs.set('dor', filters.dor);
  // IMPORTANT: do not push techno/band filters down to /topo/cells.
  // The cells cache must stay broad, then SitesMonitor applies strict
  // dashboard band/techno filtering client-side at render time.
  if (filters?.bcluster && filters.bcluster !== 'ALL') qs.set('bcluster', filters.bcluster);
  if (filters?.q) qs.set('search', filters.q);
  return qs;
}

async function getCachedCells(filters?: BboxFilters, signal?: AbortSignal): Promise<any[]> {
  const key = cellsCacheKey(filters);
  if (_cellsCache && _cellsCache.key === key && (Date.now() - _cellsCache.ts) < CELLS_CACHE_TTL) {
    return _cellsCache.cells;
  }

  // Load first chunk quickly
  _cellsCacheLoading = true;
  emitCellsCacheUpdate();
  const qs1 = buildCellsQs(filters, CHUNK_SIZE, 0);
  const data1 = await fetchJsonSignal<any>(parserUrl(`/topo/cells?${qs1}`), signal);
  const chunk1 = Array.isArray(data1) ? data1 : (data1?.rows || data1?.cells || []);
  
  // Cache first chunk immediately so sectors can render while rest loads
  _cellsCache = { key, cells: chunk1, ts: Date.now() };
  _cellsCacheVersion++;
  emitCellsCacheUpdate();
  console.log(`[TopoApi] Cells chunk 1 cached: ${chunk1.length} cells`);

  // If first chunk is full, load remaining chunks in background
  if (chunk1.length >= CHUNK_SIZE && chunk1.length < MAX_CELLS_CACHE) {
    (async () => {
      try {
        const allCells = [...chunk1];
        let offset = CHUNK_SIZE;
        while (allCells.length < MAX_CELLS_CACHE) {
          const qs = buildCellsQs(filters, CHUNK_SIZE, offset);
          const data = await fetchJsonSignal<any>(parserUrl(`/topo/cells?${qs}`), signal);
          const chunk = Array.isArray(data) ? data : (data?.rows || data?.cells || []);
          if (chunk.length === 0) break;
          allCells.push(...chunk);
          // Update cache progressively
          if (_cellsCache?.key === key) {
            _cellsCache = { key, cells: allCells, ts: Date.now() };
          }
          _cellsCacheVersion++;
          // Notify listeners so SitesMonitor can re-merge
          emitCellsCacheUpdate();
          console.log(`[TopoApi] Cells chunk cached: +${chunk.length} → ${allCells.length} total (cap ${MAX_CELLS_CACHE})`);
          if (chunk.length < CHUNK_SIZE) break;
          offset += CHUNK_SIZE;
        }
        if (allCells.length >= MAX_CELLS_CACHE) {
          console.warn(`[TopoApi] Cells cache capped at ${MAX_CELLS_CACHE} — not downloading more`);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[TopoApi] Background cells loading failed', err);
        }
      } finally {
        _cellsCacheLoading = false;
        _cellsCacheVersion++;
        emitCellsCacheUpdate();
      }
    })();
  } else {
    _cellsCacheLoading = false;
    _cellsCacheVersion++;
    emitCellsCacheUpdate();
  }

  return chunk1;
}

export const topoApi = {
  /**
   * List cells from VPS: GET /api/v1/topo/cells
   * Note: VPS endpoint is a search endpoint with search, plaque, dor, band, techno, limit params.
   * For full list, use large limit.
   */
  list: (limit = 100000, _offset = 0) => {
    if (isLocalExpress()) {
      return fetchJson<{ rows: any[]; total: number }>(localUrl(`topo?limit=${limit}&offset=${_offset}`));
    }
    // VPS: /api/v1/topo/cells?limit=N
    const qs = new URLSearchParams({ limit: String(limit) });
    return fetchJson<any>(parserUrl(`/topo/cells?${qs}`)).then((data: any) => {
      // Normalize response to { rows, total } format
      const rows = Array.isArray(data) ? data : (data.rows || data.cells || []);
      return { rows, total: data.total ?? rows.length };
    });
  },


  /**
   * Fetch sites with their cells (for sector rendering at zoom >= 9).
   * Server-side filtering: only 4G/5G, only bbox, only matching filters.
   * NO full cell cache — pure viewport-based loading.
   */
  listSitesWithCells: async (
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    filters?: BboxFilters,
    limit = 8000,
    signal?: AbortSignal,
  ): Promise<{ sites: any[]; total: number; total_cells: number }> => {
    const qs = new URLSearchParams();
    qs.set('bbox', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    qs.set('limit', String(limit));
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'ALL') qs.set(k, v);
      });
    }

    if (isLocalExpress()) {
      return fetchJsonSignal<any>(localUrl(`topo/sites-with-cells?${qs}`), signal);
    }

    return fetchJsonSignal<any>(parserUrl(`/topo/sites-with-cells?${qs}`), signal);
  },

  listFull: async (limit = 100000) => {
    // Always use /topo/cells + /topo/sites merge (the /topo?full=1 endpoint doesn't exist)
    const cellsQs = new URLSearchParams({ limit: String(limit) });
    const sitesQs = new URLSearchParams({ bbox: '-180,-90,180,90', limit: '50000' });

    const [cellsData, sitesData] = await Promise.all([
      fetchJson<any>(parserUrl(`/topo/cells?${cellsQs}`)),
      fetchJson<any>(parserUrl(`/topo/sites?${sitesQs}`)).catch(() => []),
    ]);

    const rawCells = Array.isArray(cellsData) ? cellsData : (cellsData.rows || cellsData.cells || []);
    const rawSites = Array.isArray(sitesData?.sites) ? sitesData.sites : (Array.isArray(sitesData) ? sitesData : []);

    // Build coordinate lookup from sites
    const siteCoords = new Map<string, { lat: number; lng: number; plaque: string; dor: string; region: string }>();
    for (const s of rawSites) {
      const lat = Number(s.latitude ?? s.lat);
      const lng = Number(s.longitude ?? s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const name = s.site_name || s.nom_site || s.code_nidt;
      if (name) siteCoords.set(name, { lat, lng, plaque: s.plaque || '', dor: s.dor || s.region || '', region: s.region || '' });
    }

    // Merge: attach coordinates to each cell, auto-distribute azimuts
    const cellsBySite = new Map<string, any[]>();
    for (const c of rawCells) {
      const siteName = c.site_name || c.nom_site;
      if (!siteName || !siteCoords.has(siteName)) continue;
      if (!cellsBySite.has(siteName)) cellsBySite.set(siteName, []);
      cellsBySite.get(siteName)!.push(c);
    }

    const rows: any[] = [];
    for (const [siteName, cells] of cellsBySite) {
      const coords = siteCoords.get(siteName)!;
      const sectorGroups = new Map<number, any[]>();
      for (const c of cells) {
        const cellName = c.cell_name || c.nom_cellule || '';
        const lastChar = cellName.slice(-1);
        const sectorIdx = /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
        if (!sectorGroups.has(sectorIdx)) sectorGroups.set(sectorIdx, []);
        sectorGroups.get(sectorIdx)!.push(c);
      }
      const numSectors = Math.max(sectorGroups.size, 1);
      const sectorKeys = Array.from(sectorGroups.keys()).sort();
      for (let i = 0; i < sectorKeys.length; i++) {
        const sectorCells = sectorGroups.get(sectorKeys[i])!;
        const azimut = Math.round((360 / numSectors) * i);
        for (const c of sectorCells) {
          rows.push({
            code_nidt: siteName,
            nom_site: siteName,
            nom_cellule: c.cell_name || c.nom_cellule || `${siteName}_cell`,
            latitude: coords.lat,
            longitude: coords.lng,
            techno: c.techno || '4g',
            bande: c.band || c.bande || inferBandFromCellName(c.cell_name || c.nom_cellule || '', c.techno || '4G'),
            constructeur: c.vendor || c.constructeur || null,
            azimut,
            hba: 30,
            plaque: c.plaque || coords.plaque,
            dor: c.dor || coords.dor,
            region: coords.region,
            tac: null,
          });
        }
      }
    }

    return { rows, total: cellsData.total ?? rows.length };
  },

  count: async () => {
    if (isLocalExpress()) {
      const res = await fetchJson<{ rows: any[]; total: number }>(localUrl('topo?limit=1'));
      return res.total;
    }
    const data = await fetchJson<any>(parserUrl('/topo/cells?limit=1'));
    const rows = Array.isArray(data) ? data : (data.rows || []);
    return data.total ?? rows.length;
  },

  remove: () => {
    if (isLocalExpress()) {
      return fetchJson(localUrl('topo/clear'), { method: 'POST', body: '{}' });
    }
    return Promise.resolve({ ok: true }); // No clear on VPS
  },

  hierarchy: () => {
    if (isLocalExpress()) {
      return fetchJson<any>(localUrl('topo/hierarchy'));
    }
    return fetchJson<any>(parserUrl('/topo/hierarchy'));
  },

  distinct: (field: string) => {
    if (isLocalExpress()) {
      return fetchJson<any>(localUrl(`topo/distinct?field=${field}`));
    }
    return fetchJson<any>(parserUrl(`/topo/distinct?field=${field}`));
  },

  listSitesByBbox: async (
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    filters?: BboxFilters,
    limit = 8000,
    signal?: AbortSignal,
  ): Promise<BboxSitesResponse> => {
    const bboxQs = new URLSearchParams();
    bboxQs.set('bbox', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    bboxQs.set('limit', String(limit));
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'ALL') bboxQs.set(k, v);
      });
    }

    if (isLocalExpress()) {
      return fetchJsonSignal<BboxSitesResponse>(localUrl(`topo/sites?${bboxQs}`), signal);
    }

    const normalizeSites = (data: any): BboxSitesResponse => {
      const rawSites = Array.isArray(data?.sites) ? data.sites : (Array.isArray(data) ? data : []);
      const sites = rawSites
        .map((site: any) => {
          const techSummary = resolveTopoSiteTechSummary(site);
          return {
            code_nidt: site.code_nidt || site.site_id || site.nom_site || site.site_name,
            nom_site: site.nom_site || site.site_name || site.code_nidt || site.site_id,
            lat: Number(site.lat ?? site.latitude),
            lng: Number(site.lng ?? site.longitude),
            nb_cells: Number(site.nb_cells ?? site.cell_count ?? 0),
            vendor: (Array.isArray(site.vendors) ? site.vendors[0] : site.vendor) ?? site.constructeur ?? null,
            plaque: site.plaque ?? null,
            dor: site.dor ?? null,
            region: site.region ?? null,
            zone_arcep: site.zone_arcep ?? null,
            techno: techSummary.techno,
            bande: techSummary.bande,
            lte_cells: techSummary.lteCells,
            nr_cells: techSummary.nrCells,
            cells_2g: techSummary.cells2g,
            cells_3g: techSummary.cells3g,
            bcluster: site.bcluster ?? site.b_cluster ?? site.cluster ?? site.cluster_name ?? null,
          };
        })
        .filter((site: BboxSiteDTO) => Number.isFinite(site.lat) && Number.isFinite(site.lng));

      return { sites, total: Number(data?.total) || sites.length };
    };

    try {
      return normalizeSites(await fetchJsonSignal<any>(parserUrl(`/topo/sites?${bboxQs}`), signal));
    } catch {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (filters?.plaque && filters.plaque !== 'ALL') qs.set('plaque', filters.plaque);
      if (filters?.dor && filters.dor !== 'ALL') qs.set('dor', filters.dor);
      if (filters?.techno && filters.techno !== 'ALL') qs.set('techno', filters.techno);
      if (filters?.bande && filters.bande !== 'ALL') qs.set('band', filters.bande);
      if (filters?.bcluster && filters.bcluster !== 'ALL') qs.set('bcluster', filters.bcluster);
      if (filters?.q) qs.set('search', filters.q);

      const data = await fetchJsonSignal<any>(parserUrl(`/topo/cells?${qs}`), signal);
      const rows = Array.isArray(data) ? data : (data.rows || data.cells || []);
      const siteMap = new Map<string, BboxSiteDTO>();
      for (const row of rows) {
        const lat = Number(row.latitude ?? row.lat);
        const lng = Number(row.longitude ?? row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const key = row.code_nidt || row.site_name || row.nom_site;
        if (!key) continue;

        if (!siteMap.has(key)) {
          siteMap.set(key, {
            code_nidt: row.code_nidt || key,
            nom_site: row.nom_site || row.site_name || key,
            lat,
            lng,
            nb_cells: 0,
            vendor: row.constructeur || row.vendor || null,
            plaque: row.plaque || null,
            dor: row.dor || null,
            region: row.region || null,
            zone_arcep: row.zone_arcep || null,
            techno: null,
            bande: null,
            lte_cells: 0,
            nr_cells: 0,
            cells_2g: 0,
            cells_3g: 0,
            bcluster: row.bcluster ?? row.b_cluster ?? row.cluster ?? row.cluster_name ?? null,
          });
        }
        const entry = siteMap.get(key)!;
        entry.nb_cells += 1;
        const cellTech = String(row.techno || row.rat || '').toUpperCase();
        const nextTechValues = new Set(flattenTopoFieldValues(entry.techno));
        flattenTopoFieldValues(row.techno || row.rat).forEach(value => nextTechValues.add(value));
        entry.techno = Array.from(nextTechValues).join(', ') || entry.techno || null;

        const nextBandValues = new Set(flattenTopoFieldValues(entry.bande));
        flattenTopoFieldValues(row.bande || row.band).forEach(value => nextBandValues.add(value));
        entry.bande = Array.from(nextBandValues).join(', ') || entry.bande || null;

        if (cellTech.includes('5G') || cellTech.includes('NR')) {
          entry.nr_cells = (entry.nr_cells || 0) + 1;
        } else if (cellTech.includes('4G') || cellTech.includes('LTE')) {
          entry.lte_cells = (entry.lte_cells || 0) + 1;
        } else if (cellTech.includes('3G') || cellTech.includes('UMTS') || cellTech.includes('WCDMA')) {
          entry.cells_3g = (entry.cells_3g || 0) + 1;
        } else if (cellTech.includes('2G') || cellTech.includes('GSM')) {
          entry.cells_2g = (entry.cells_2g || 0) + 1;
        }
      }

      const sites = Array.from(siteMap.values());
      return { sites, total: sites.length };
    }
  },

  listCellsByBbox: async (
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    filters?: BboxFilters,
    limit = 8000,
    signal?: AbortSignal,
  ): Promise<BboxCellsResponse> => {
    const bboxQs = new URLSearchParams();
    bboxQs.set('bbox', `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    bboxQs.set('limit', String(limit));
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'ALL') bboxQs.set(k, v);
      });
    }

    if (isLocalExpress()) {
      return fetchJsonSignal<BboxCellsResponse>(localUrl(`topo/sites?${bboxQs}`), signal);
    }

    // VPS strategy: use cached full cells list + merge with bbox sites for coordinates
    try {
      // 1) Fetch sites in bbox (for coordinates) — this is fast, already filtered server-side
      const sitesData = await fetchJsonSignal<any>(parserUrl(`/topo/sites?${bboxQs}`), signal);
      const rawSites = Array.isArray(sitesData) ? sitesData : (sitesData?.sites || sitesData?.rows || []);
      
      const siteCoords = new Map<string, { lat: number; lng: number; plaque: string; dor: string; region: string; code_nidt: string; bcluster: string | null }>();
      for (const s of rawSites) {
        const lat = Number(s.latitude ?? s.lat);
        const lng = Number(s.longitude ?? s.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const name = s.site_name || s.nom_site || s.code_nidt;
        const code_nidt = s.code_nidt || name;
        if (name) siteCoords.set(name, {
          lat,
          lng,
          plaque: s.plaque || '',
          dor: s.dor || s.region || '',
          region: s.region || '',
          code_nidt,
          bcluster: s.bcluster ?? s.b_cluster ?? s.cluster ?? s.cluster_name ?? null,
        });
      }

      if (siteCoords.size === 0) {
        return { cells: [], total: 0 };
      }

      // 2) Get all cells from cache (or fetch once)
      const rawCells = await getCachedCells(filters, signal);

      // 3) Merge: only cells whose site is in the bbox
      const cellsBySite = new Map<string, any[]>();
      for (const c of rawCells) {
        const siteName = c.site_name || c.nom_site;
        if (!siteName || !siteCoords.has(siteName)) continue;
        if (!cellsBySite.has(siteName)) cellsBySite.set(siteName, []);
        cellsBySite.get(siteName)!.push(c);
      }

      const mergedCells: any[] = [];
      for (const [siteName, cells] of cellsBySite) {
        const coords = siteCoords.get(siteName)!;
        const sectorGroups = new Map<number, any[]>();
        for (const c of cells) {
          const cellName = c.cell_name || c.nom_cellule || '';
          const lastChar = cellName.slice(-1);
          const sectorIdx = /^[1-9]$/.test(lastChar) ? parseInt(lastChar) : 1;
          if (!sectorGroups.has(sectorIdx)) sectorGroups.set(sectorIdx, []);
          sectorGroups.get(sectorIdx)!.push(c);
        }
        const numSectors = Math.max(sectorGroups.size, 1);
        const sectorKeys = Array.from(sectorGroups.keys()).sort();

        for (let i = 0; i < sectorKeys.length; i++) {
          const sectorCells = sectorGroups.get(sectorKeys[i])!;
          const azimut = Math.round((360 / numSectors) * i);
          for (const c of sectorCells) {
            mergedCells.push({
              code_nidt: coords.code_nidt || siteName,
              nom_site: siteName,
              nom_cellule: c.cell_name || c.nom_cellule || `${siteName}_cell`,
              latitude: coords.lat,
              longitude: coords.lng,
              techno: c.techno || '4g',
              bande: c.band || c.bande || inferBandFromCellName(c.cell_name || c.nom_cellule || '', c.techno || '4G'),
              constructeur: c.vendor || c.constructeur || null,
              azimut,
              hba: 30,
              plaque: c.plaque || coords.plaque,
              dor: c.dor || coords.dor,
              region: coords.region,
              bcluster: c.bcluster ?? c.b_cluster ?? c.cluster ?? c.cluster_name ?? coords.bcluster,
              tac: null,
            });
          }
        }
      }

      console.log(`[TopoApi] BBOX cells merged: ${mergedCells.length} cells from ${cellsBySite.size} sites (cached)`);
      return { cells: mergedCells, total: mergedCells.length };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      console.warn('[TopoApi] BBOX cells merge failed', err);
      return { cells: [], total: 0 };
    }
  },

  /** Pre-warm the cells cache so sectors appear instantly on zoom-in */
  prefetchCells: async (filters?: BboxFilters): Promise<void> => {
    try {
      await getCachedCells(filters);
    } catch (err) {
      console.warn('[TopoApi] Cells prefetch failed (non-blocking)', err);
    }
  },

  /** Fetch available filter dimensions from VPS: GET /api/v1/topo/filters?dor=X&constructeur=Y */
  filters: async (contextParams?: string): Promise<{ filters: { id: string; label: string; values: string[] }[] }> => {
    const suffix = contextParams ? `?${contextParams}` : '';
    if (isLocalExpress()) {
      return fetchJson<any>(localUrl(`topo/filters${suffix}`));
    }
    return fetchJson<any>(parserUrl(`/topo/filters${suffix}`));
  },

  /** Fetch sites with dynamic filters: GET /api/v1/topo/sites?dor=X&techno=Y */
  filteredSites: async (queryParams: string): Promise<any[]> => {
    const url = queryParams
      ? parserUrl(`/topo/sites?${queryParams}`)
      : parserUrl('/topo/sites');
    const data = await fetchJson<any>(url);
    return Array.isArray(data) ? data : (data?.sites || data?.rows || []);
  },

  /** HW distribution: GET /api/v1/topo/hw-distribution */
  hwDistribution: async (filters?: { vendor?: string; plaque?: string; region?: string }): Promise<any> => {
    const qs = new URLSearchParams();
    if (filters?.vendor && filters.vendor !== 'ALL') qs.set('vendor', filters.vendor);
    if (filters?.plaque && filters.plaque !== 'ALL') qs.set('plaque', filters.plaque);
    if (filters?.region && filters.region !== 'ALL') qs.set('region', filters.region);
    const qsStr = qs.toString();
    const path = qsStr ? `/topo/hw-distribution?${qsStr}` : '/topo/hw-distribution';
    if (isLocalExpress()) {
      return fetchJson<any>(localUrl(`topo/hw-distribution${qsStr ? '?' + qsStr : ''}`));
    }
    return fetchJson<any>(parserUrl(path));
  },
};

// ─── QoE Metrics — VPS Parser :8000 at /api/v1/qoe/metrics ───
export const qoeMetricsApi = {
  query: (params: { site_id?: string; cell_ids?: string[]; limit?: number }) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams();
      if (params.site_id) qs.set('site_id', params.site_id);
      if (params.cell_ids?.length) qs.set('cell_ids', params.cell_ids.join(','));
      if (params.limit) qs.set('limit', String(params.limit));
      return fetchJson<any[]>(localUrl(`qoe-metrics?${qs}`));
    }
    // VPS: /api/v1/qoe/metrics?table=qoe_metric&dimension_value=SITE_NAME
    const qs = new URLSearchParams({ table: 'qoe_metric' });
    if (params.site_id) qs.set('dimension_value', params.site_id);
    if (params.limit) qs.set('limit', String(params.limit));
    return fetchJson<any>(parserUrl(`/qoe/metrics?${qs}`)).then((data: any) => {
      return Array.isArray(data) ? data : (data.rows || data.data || []);
    });
  },
};

// ─── RAG ───
export const ragApi = {
  list: () => {
    if (isLocalExpress()) {
      return fetchJson<{ files: any[] }>(localUrl('rag-embed'), { method: 'POST', body: JSON.stringify({ action: 'list' }) });
    }
    return fetchJson<{ files: any[] }>(localUrl('rag-embed'), { method: 'POST', body: JSON.stringify({ action: 'list' }) });
  },
  index: (filename: string, content?: string, base64?: string) =>
    fetchJson(localUrl('rag-embed'), { method: 'POST', body: JSON.stringify(base64 ? { filename, base64 } : { filename, content }) }),
  remove: (filename: string) =>
    fetchJson(localUrl('rag-embed'), { method: 'POST', body: JSON.stringify({ action: 'delete', filename }) }),
};

// ─── Dump Parameter ───
export const dumpParameterApi = {
  distinct: (col: string, extra?: Record<string, string>) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams({ distinct_col: col, ...extra });
      return fetchJson<any[]>(localUrl(`dump-parameter?${qs}`));
    }
    // VPS: use /api/v1/cm/... or /api/v1/topo/distinct
    return fetchJson<any[]>(parserUrl(`/topo/distinct?field=${col}`));
  },
  query: (filters: Record<string, string>, cols?: string, limit = 100000) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams({ limit: String(limit), ...filters });
      if (cols) qs.set('select', cols);
      return fetchJson<any[]>(localUrl(`dump-parameter?${qs}`));
    }
    // VPS: try cm endpoint
    const qs = new URLSearchParams({ limit: String(limit), ...filters });
    if (cols) qs.set('select', cols);
    return fetchJson<any[]>(parserUrl(`/cm/dump?${qs}`)).catch(() => []);
  },
  aggregate: (filters: Record<string, string>, groupBy: string, colorBy: string) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams({ group_by: groupBy, color_by: colorBy, ...filters });
      return fetchJson<any[]>(localUrl(`dump-parameter/aggregate?${qs}`));
    }
    const qs = new URLSearchParams({ group_by: groupBy, color_by: colorBy, ...filters });
    return fetchJson<any[]>(parserUrl(`/cm/dump/aggregate?${qs}`)).catch(() => []);
  },
};

// ─── Parameter Changes ───
export const parameterChangesApi = {
  list: (filters?: { site_name?: string; param_name?: string; change_type?: string; limit?: number }) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams();
      if (filters?.site_name) qs.set('site_name', filters.site_name);
      if (filters?.param_name) qs.set('param_name', filters.param_name);
      if (filters?.change_type) qs.set('change_type', filters.change_type);
      if (filters?.limit) qs.set('limit', String(filters.limit));
      return fetchJson<any[]>(localUrl(`parameter-changes?${qs}`));
    }
    // VPS: try cm/changes endpoint
    const qs = new URLSearchParams();
    if (filters?.site_name) qs.set('site_name', filters.site_name);
    if (filters?.param_name) qs.set('param_name', filters.param_name);
    if (filters?.limit) qs.set('limit', String(filters.limit));
    return fetchJson<any[]>(parserUrl(`/cm/changes?${qs}`)).catch(() => []);
  },
  create: (change: Record<string, any>) => {
    if (isLocalExpress()) {
      return fetchJson<any>(localUrl('parameter-changes'), { method: 'POST', body: JSON.stringify(change) });
    }
    return fetchJson<any>(parserUrl('/cm/changes'), { method: 'POST', body: JSON.stringify(change) }).catch(() => ({}));
  },
};

// ─── BI Query — VPS Parser uses /api/v1/qoe/metrics ───
export const biQueryApi = {
  query: async (params: {
    kpis: string[];
    aggregation?: string;
    dateStart?: string;
    dateEnd?: string;
    granularity?: string;
    groupBy?: string[];
    filters?: { dimension: string; values: string[] }[];
    topN?: number;
    xAxisType?: string;
    xAxisDimension?: string;
  }): Promise<{ rows: any[]; total: number }> => {
    if (isLocalExpress()) {
      return fetchJson<{ rows: any[]; total: number }>(localUrl('bi-query'), { method: 'POST', body: JSON.stringify(params) });
    }
    if (isVps()) {
      // VPS: use /api/v1/qoe/metrics
      const qs = new URLSearchParams({ table: 'qoe_metric', limit: '1000' });
      if (params.kpis?.length) qs.set('kpi', params.kpis[0]);
      if (params.dateStart) qs.set('date', params.dateStart);
      if (params.filters) {
        for (const f of params.filters) {
          if (f.values.length > 0 && f.dimension === 'dimension_1') {
            qs.set('dimension', f.dimension);
            qs.set('dimension_value', f.values[0]);
          }
        }
      }
      const data = await fetchJson<any>(parserUrl(`/qoe/metrics?${qs}`));
      const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
      return { rows, total: rows.length };
    }
    // Cloud fallback
    try {
      let query = supabase.from('kpi_qoe_aggregated').select('*');
      if (params.dateStart) query = query.gte('date_part', params.dateStart);
      if (params.dateEnd) query = query.lte('date_part', params.dateEnd);
      if (params.filters) {
        for (const f of params.filters) {
          if (f.values.length > 0) {
            if (f.dimension === 'dimension_1') query = query.in('dimension_1', f.values);
            else if (f.dimension === 'dimension_2') query = query.in('dimension_2', f.values);
          }
        }
      }
      query = query.order('date_part', { ascending: true }).limit(1000);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []).map((row: any) => {
        const mapped: Record<string, any> = { x: row.date_part, dimension_1: row.dimension_1, dimension_2: row.dimension_2 };
        for (const kpi of params.kpis) mapped[kpi] = row[kpi] ?? null;
        return mapped;
      });
      return { rows, total: rows.length };
    } catch (err) {
      console.warn('[BI Cloud fallback] failed:', err);
      return { rows: [], total: 0 };
    }
  },

  distinct: async (dimension: string): Promise<string[]> => {
    if (isLocalExpress()) {
      return fetchJson<string[]>(localUrl(`bi-distinct?dimension=${encodeURIComponent(dimension)}`));
    }
    if (isVps()) {
      return fetchJson<any>(parserUrl(`/qoe/dimensions?table=qoe_metric`)).then((data: any) => {
        return Array.isArray(data) ? data : (data.values || []);
      }).catch(() => []);
    }
    try {
      const { data, error } = await supabase.from('kpi_qoe_aggregated').select(dimension).limit(1000);
      if (error) throw error;
      return [...new Set((data || []).map((r: any) => r[dimension]).filter(Boolean))] as string[];
    } catch { return []; }
  },

  dateRange: async (): Promise<{ min_date: string | null; max_date: string | null }> => {
    if (isLocalExpress()) {
      return fetchJson<{ min_date: string | null; max_date: string | null }>(localUrl('bi-date-range'));
    }
    if (isVps()) {
      return fetchJson<any>(parserUrl('/qoe/dates?table=qoe_metric')).then((data: any) => {
        const dates = Array.isArray(data) ? data : (data.dates || []);
        if (dates.length === 0) return { min_date: null, max_date: null };
        dates.sort();
        return { min_date: dates[0], max_date: dates[dates.length - 1] };
      }).catch(() => ({ min_date: null, max_date: null }));
    }
    try {
      const { data: minData } = await supabase.from('kpi_qoe_aggregated').select('date_part').order('date_part', { ascending: true }).limit(1);
      const { data: maxData } = await supabase.from('kpi_qoe_aggregated').select('date_part').order('date_part', { ascending: false }).limit(1);
      return { min_date: minData?.[0]?.date_part || null, max_date: maxData?.[0]?.date_part || null };
    } catch { return { min_date: null, max_date: null }; }
  },
};

// ─── QoE Map — VPS Parser :8000 at /api/v1/qoe/metrics ───
export interface QoeMapSiteData {
  qoe_index: number | null;
  debit_dl: number | null;
  debit_ul: number | null;
  rtt_data_avg: number | null;
  rtt_setup_avg: number | null;
  dms_dl_3: number | null;
  dms_dl_8: number | null;
  dms_dl_30: number | null;
  dms_ul_3: number | null;
  sessions: number | null;
  tcp_retr_rate_dl: number | null;
  loss_dl_rate: number | null;
  session_dcr: number | null;
  wind_full_rate: number | null;
  volume_dl: number | null;
  volume_ul: number | null;
}

export interface QoeMapResponse {
  sites: Record<string, QoeMapSiteData>;
  date: string | null;
  dimension: string;
}

export const qoeMapApi = {
  fetch: (dimension?: string, date?: string) => {
    if (isLocalExpress()) {
      const qs = new URLSearchParams();
      if (dimension) qs.set('dimension', dimension);
      if (date) qs.set('date', date);
      return fetchJson<QoeMapResponse>(localUrl(`qoe-map?${qs}`));
    }
    // VPS: use /api/v1/qoe/metrics to get per-site data
    const qs = new URLSearchParams({ table: 'qoe_metric', limit: '5000' });
    if (dimension) qs.set('dimension', dimension);
    if (date) qs.set('date', date);
    return fetchJson<any>(parserUrl(`/qoe/metrics?${qs}`)).then((data: any) => {
      // Transform array of rows into { sites: {siteName: data}, date, dimension } format
      const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
      const sites: Record<string, QoeMapSiteData> = {};
      // Bug #9: Normalize site keys for reliable QoE matching
      const normKey = (v: string | null | undefined) => String(v || '').trim().toUpperCase().replace(/[_\s\-]+/g, '');
      for (const row of rows) {
        const rawKey = row.Dimension_2 || row.dimension_2 || row.site_name || row.nom_site || row.code_nidt;
        if (!rawKey) continue;
        const key = normKey(rawKey);
        // Also store under original key for backward compat
        const originalKey = String(rawKey).trim();
        const siteData: QoeMapSiteData = {
          qoe_index: row.qoe_index ?? null,
          debit_dl: row.debit_dl ?? null,
          debit_ul: row.debit_ul ?? null,
          rtt_data_avg: row.rtt_data_avg ?? null,
          rtt_setup_avg: row.rtt_setup_avg ?? null,
          dms_dl_3: row.dms_debit_dl_3 ?? row.dms_dl_3 ?? null,
          dms_dl_8: row.dms_debit_dl_8 ?? row.dms_dl_8 ?? null,
          dms_dl_30: row.dms_debit_dl_30 ?? row.dms_dl_30 ?? null,
          dms_ul_3: row.dms_debit_ul_3 ?? row.dms_ul_3 ?? null,
          sessions: row.session_nbr ?? row.sessions ?? null,
          tcp_retr_rate_dl: row.tcp_retr_rate_dl ?? null,
          loss_dl_rate: row.loss_dl_rate ?? null,
          session_dcr: row.session_dcr ?? null,
          wind_full_rate: row.wind_full_rate ?? null,
          volume_dl: row.volume_totale_dl ?? row.volume_dl ?? null,
          volume_ul: row.volume_totale_ul ?? row.volume_ul ?? null,
        };
        // Store under both normalized and original keys for matching
        sites[key] = siteData;
        if (originalKey !== key) sites[originalKey] = siteData;
      }
      return { sites, date: date || null, dimension: dimension || 'Site' } as QoeMapResponse;
    });
  },
};

// ─── Streaming (qoe-assistant) — Edge Function ───
export function streamAssistant(body: any): Promise<Response> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  return fetch(`${supabaseUrl}/functions/v1/qoe-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
}

/** Legacy helper — kept for backward compat */
export function getLocalApiUrl(path: string): string {
  if (isVps()) {
    const clean = path.replace(/^\/?(api\/)?/, '');
    return parserUrl(`/${clean}`);
  }
  return localUrl(path);
}
