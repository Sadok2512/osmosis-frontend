import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Trash2, PlayCircle, FolderOpen, Radio, Info, X,
  Loader2, CheckCircle2, AlertCircle, Database, Layers, Map, Globe,
  Boxes, Upload, Signal, Wifi, Settings, ChevronRight, Eye,
  MapPin, Building2, BarChart3,
} from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

/* ────────────────────── Types ────────────────────── */

interface TopoStats {
  rows?: number;
  live_rows?: number;
  sites?: number;
  cells?: number;
  csv_path?: string | null;
  last_loaded_at?: string | null;
  importing?: boolean;
  error?: string | null;
  progress?: {
    total_lines?: number;
    inserted?: number;
    phase?: string;
    pct?: number;
  };
}

interface SiteRow {
  site_name: string;
  constructeur?: string | null;
  cell_count: number;
  technos?: string[];
  bandes?: string[];
  plaque?: string | null;
  dor?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface SiteDetail {
  site_name: string;
  cell_count: number;
  technos: string[];
  vendors: string[];
  bands?: string[];
  latitude?: number | null;
  longitude?: number | null;
  plaque?: string | null;
  region?: string | null;
  zone_arcep?: string | null;
  code_nidt?: string | null;
  classe?: string | null;
  couverture?: string | null;
  vendor?: string | null;
  hw?: {
    baseband?: string | null;
    antenna?: string | null;
    rru?: string | null;
    sw_version?: string | null;
  };
  cells: Record<string, unknown>[];
}

interface GlobalNetwork {
  total_sites: number;
  total_cells: number;
  by_techno: { techno: string; sites: number; cells: number }[];
  by_band: { band: string; cells: number }[];
  by_vendor: { vendor: string; sites: number; cells: number; cells_4g?: number; cells_5g?: number }[];
  error?: string;
}

interface MapSite {
  site_name: string;
  constructeur?: string | null;
  latitude: number;
  longitude: number;
  cell_count: number;
  technos?: string[];
  bandes?: string[];
  plaque?: string | null;
  dor?: string | null;
}

interface SiteAlarm {
  alarm_time?: string | null;
  cancel_time?: string | null;
  duration_min?: number | null;
  severity?: string | null;
  problem?: string | null;
  text?: string | null;
  status?: string | null;
  dn?: string | null;
  cell_name?: string | null;
}

interface CmChange {
  changed_at?: string | null;
  parameter?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  change_type?: string | null;
  user?: string | null;
  plan?: string | null;
  dn?: string | null;
  cell_name?: string | null;
}

interface SiteParam {
  parameter: string;
  value?: string | null;
  type?: string | null;
  mo?: string | null;
  dn?: string | null;
}

interface FilterOption {
  id: string;
  label: string;
  values: string[];
}

/* ────────────────────── Helpers ────────────────────── */

const fmt = (n: number | undefined | null): string =>
  n == null ? '—' : n.toLocaleString();

const prettyLabel = (k: string): string =>
  k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const vendorColor = (v?: string | null): string => {
  const vu = (v || '').toUpperCase();
  if (vu === 'NOKIA') return '#3b82f6';
  if (vu === 'ERICSSON') return '#10b981';
  if (vu === 'HUAWEI') return '#e11d48';
  if (vu === 'SAMSUNG') return '#8b5cf6';
  return '#718096';
};

const vendorVariant = (v?: string | null): 'default' | 'secondary' | 'outline' => {
  const vu = (v || '').toUpperCase();
  if (vu === 'NOKIA') return 'default';
  if (vu === 'ERICSSON') return 'secondary';
  return 'outline';
};

const technoClass = (t: string): string => {
  const tu = t.toUpperCase();
  if (tu === '5G' || tu === 'NR') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  if (tu === '4G' || tu === 'LTE') return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
  if (tu === '3G' || tu === 'UMTS' || tu === 'WCDMA') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  if (tu === '2G' || tu === 'GSM') return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const bandColor = (b: string): string => {
  const colors: Record<string, string> = {
    GSM900: '#ef4444', GSM1800: '#dc2626',
    UMTS900: '#f59e0b', UMTS2100: '#d97706',
    LTE700: '#10b981', LTE800: '#3b82f6', LTE1800: '#f59e0b', LTE2100: '#8b5cf6', LTE2600: '#ef4444',
    NR_700: '#06b6d4', NR_2100: '#d946ef', NR_3500: '#f97316',
  };
  return colors[b] || '#718096';
};

const severityClass = (s?: string | null): string => {
  const su = (s || '').toUpperCase();
  if (su === 'CRITICAL' || su === 'CRITIQUE') return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
  if (su === 'MAJOR' || su === 'MAJEUR') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  if (su === 'MINOR' || su === 'MINEUR') return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getApiUrl(path);
  const res = await fetch(url, { ...init, headers: { ...getApiHeaders(), ...(init?.headers || {}) } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

/* ────────────────────── Component ────────────────────── */

const NetworkTopologyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('livemap');

  /* ══════════════════ STATS + SERVICE STATUS ══════════════════ */
  const [stats, setStats] = useState<TopoStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const d = await fetchJson<TopoStats>('config/topo/stats');
      setStats(d);
      setImporting(!!d.importing);
    } catch (e) {
      console.error('[topology] loadStats', e);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (!importing) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(loadStats, 2500) as unknown as number;
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [importing, loadStats]);

  const runImport = async () => {
    try {
      await fetchJson<unknown>('control/run-now/TOPO_SERVICE', { method: 'POST' });
      toast.success('Topology import started');
      setImporting(true);
      loadStats();
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  };

  const deleteTopo = async () => {
    try {
      await fetchJson<unknown>('topo/delete', { method: 'DELETE' });
      toast.success('Topology data deleted');
      loadStats();
      setSites([]);
      setSelectedSite(null);
      setSiteDetail(null);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleteOpen(false);
    }
  };

  const uploadFile = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = getApiUrl('topo/upload-file');
      const headers = getApiHeaders();
      delete (headers as Record<string, string>)['Content-Type'];
      const res = await fetch(url, { method: 'POST', headers, body: formData });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      toast.success(`File uploaded: ${d.rows || 0} rows detected`);
      setImporting(true);
      loadStats();
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ══════════════════ FILTERS ══════════════════ */
  const [filters, setFilters] = useState<FilterOption[]>([]);

  useEffect(() => {
    fetchJson<{ filters: FilterOption[] }>('topo/filters')
      .then(d => setFilters(d.filters || []))
      .catch(() => {});
  }, []);

  const filterValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    filters.forEach(f => { map[f.id] = f.values; });
    return map;
  }, [filters]);

  /* ══════════════════ SITES SEARCH ══════════════════ */
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [technoFilter, setTechnoFilter] = useState<string>('all');
  const [plaqueFilter, setPlaqueFilter] = useState<string>('all');
  const [dorFilter, setDorFilter] = useState<string>('all');
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  const searchSites = useCallback(async () => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (query.trim()) params.set('search', query.trim());
      if (vendorFilter !== 'all') params.set('vendor', vendorFilter);
      if (technoFilter !== 'all') params.set('techno', technoFilter);
      if (plaqueFilter !== 'all') params.set('plaque', plaqueFilter);
      if (dorFilter !== 'all') params.set('dor', dorFilter);
      const d = await fetchJson<SiteRow[]>(`topo/sites?${params}`);
      setSites(d);
    } catch (e) {
      setSitesError((e as Error).message);
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, [query, vendorFilter, technoFilter, plaqueFilter, dorFilter]);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => { searchSites(); }, 300) as unknown as number;
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
  }, [searchSites]);

  /* ══════════════════ SITE DETAIL ══════════════════ */
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('info');

  // Site alarms
  const [siteAlarms, setSiteAlarms] = useState<SiteAlarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);
  // CM changes
  const [siteCmChanges, setSiteCmChanges] = useState<CmChange[]>([]);
  const [cmLoading, setCmLoading] = useState(false);
  // Site params
  const [siteParams, setSiteParams] = useState<SiteParam[]>([]);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramSearch, setParamSearch] = useState('');

  const viewSite = async (siteName: string) => {
    setSelectedSite(siteName);
    setSiteDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setDetailTab('info');
    setSiteAlarms([]);
    setSiteCmChanges([]);
    setSiteParams([]);
    try {
      const s = await fetchJson<SiteDetail>(`topo/site/${encodeURIComponent(siteName)}`);
      setSiteDetail(s);
      setTimeout(() => {
        document.getElementById('topo-site-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadSiteAlarms = useCallback(async (siteName: string) => {
    setAlarmsLoading(true);
    try {
      const d = await fetchJson<{ alarms: SiteAlarm[] }>(`topo/site-alarms?site_name=${encodeURIComponent(siteName)}&limit=50`);
      setSiteAlarms(d.alarms || []);
    } catch { setSiteAlarms([]); }
    finally { setAlarmsLoading(false); }
  }, []);

  const loadSiteCmHistory = useCallback(async (siteName: string) => {
    setCmLoading(true);
    try {
      const d = await fetchJson<{ changes: CmChange[] }>(`topo/site-cm-history?site_name=${encodeURIComponent(siteName)}&limit=50`);
      setSiteCmChanges(d.changes || []);
    } catch { setSiteCmChanges([]); }
    finally { setCmLoading(false); }
  }, []);

  const loadSiteParams = useCallback(async (siteName: string, search?: string) => {
    setParamsLoading(true);
    try {
      const params = new URLSearchParams({ site_name: siteName, limit: '50' });
      if (search) params.set('search', search);
      const d = await fetchJson<SiteParam[]>(`topo/site-params?${params}`);
      setSiteParams(Array.isArray(d) ? d : []);
    } catch { setSiteParams([]); }
    finally { setParamsLoading(false); }
  }, []);

  useEffect(() => {
    if (!selectedSite || !detailTab) return;
    if (detailTab === 'alarms') loadSiteAlarms(selectedSite);
    if (detailTab === 'cm') loadSiteCmHistory(selectedSite);
    if (detailTab === 'params') loadSiteParams(selectedSite);
  }, [detailTab, selectedSite, loadSiteAlarms, loadSiteCmHistory, loadSiteParams]);

  // Derive site-level vs cell-level fields from cells
  const cellColumns = useMemo(() => {
    if (!siteDetail?.cells?.length) return [] as string[];
    const important = ['source_cellule', 'techno', 'vendor', 'lac', 'band', 'sac_ci_eci', 'nci', 'pci', 'tac', 'sector', 'azimuth', 'tilt', 'earfcn', 'dl_earfcn', 'dl_bandwidth', 'dl_mimo_mode', 'pmax', 'admin_state', 'oper_state', 'cell_class', 'coverage'];
    const allKeys = new Set<string>();
    siteDetail.cells.forEach(c => Object.keys(c).forEach(k => allKeys.add(k)));
    // Put important columns first
    const ordered: string[] = [];
    important.forEach(k => { if (allKeys.has(k)) ordered.push(k); });
    allKeys.forEach(k => { if (!ordered.includes(k) && k !== 'site_name' && k !== 'raw_data') ordered.push(k); });
    return ordered;
  }, [siteDetail]);

  /* ══════════════════ GLOBAL NETWORK ══════════════════ */
  const [globalNet, setGlobalNet] = useState<GlobalNetwork | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  const loadGlobalNetwork = useCallback(async () => {
    setGlobalLoading(true);
    try {
      const d = await fetchJson<GlobalNetwork>('topo/global-network');
      setGlobalNet(d);
    } catch (e) {
      toast.error(`Failed to load global network: ${(e as Error).message}`);
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'network' && !globalNet) loadGlobalNetwork();
  }, [activeTab, globalNet, loadGlobalNetwork]);

  /* ══════════════════ LIVE MAP ══════════════════ */
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapVendor, setMapVendor] = useState<string>('');
  const [mapTechno, setMapTechno] = useState<string>('');
  const [mapSiteCount, setMapSiteCount] = useState(0);
  const [mapSidebar, setMapSidebar] = useState<MapSite | null>(null);
  const [mapSidebarParams, setMapSidebarParams] = useState<SiteParam[]>([]);
  const [mapParamSearch, setMapParamSearch] = useState('');
  const [mapSidebarCells, setMapSidebarCells] = useState<{ cell_name: string; band?: string; techno?: string }[]>([]);

  // Leaflet dynamic import
  const leafletReady = useRef(false);

  const ensureLeaflet = useCallback(async () => {
    if (leafletReady.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      leafletReady.current = true;
      return;
    }
    const loadCss = (href: string) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    };
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
    loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');

    const loadScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');
    leafletReady.current = true;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getL = (): any => (window as any).L;

  const loadMapSites = useCallback(async (vend: string, tech: string) => {
    if (!mapRef.current || !markersRef.current) return;
    const L = getL();
    if (!L) return;
    const params = new URLSearchParams({ limit: '5000' });
    if (vend) params.set('vendor', vend);
    if (tech) params.set('techno', tech);
    try {
      const sites = await fetchJson<MapSite[]>(`topo/map-sites?${params}`);
      markersRef.current.clearLayers();
      let count = 0;
      sites.forEach((s: MapSite) => {
        if (s.latitude && s.longitude) {
          const color = vendorColor(s.constructeur);
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:10px;height:10px;background:${color};border-radius:50%;border:2px solid rgba(255,255,255,.5)"></div>`,
            iconSize: [10, 10], iconAnchor: [5, 5],
          });
          const m = L.marker([s.latitude, s.longitude], { icon });
          m.bindTooltip(
            `<b>${s.site_name}</b><br>${s.cell_count} cells · ${s.constructeur || ''}<br>${(s.technos || []).join(', ')}`,
            { className: 'map-tooltip' }
          );
          m.on('click', () => {
            setMapSidebar(s);
            setMapSidebarParams([]);
            setMapParamSearch('');
            fetchJson<{ cell_name: string; band?: string; techno?: string }[]>(
              `topo/cells?search=${encodeURIComponent(s.site_name)}&limit=50`
            ).then(setMapSidebarCells).catch(() => setMapSidebarCells([]));
            fetchJson<SiteParam[]>(
              `topo/site-params?site_name=${encodeURIComponent(s.site_name)}&limit=30`
            ).then(d => setMapSidebarParams(Array.isArray(d) ? d : [])).catch(() => setMapSidebarParams([]));
          });
          markersRef.current.addLayer(m);
          count++;
        }
      });
      setMapSiteCount(count);
    } catch (e) { console.error('mapReload', e); }
  }, []);

  const initMap = useCallback(async () => {
    if (mapRef.current || !mapContainerRef.current) return;
    await ensureLeaflet();
    const L = getL();
    if (!L) return;
    const map = L.map(mapContainerRef.current).setView([46.6, 2.5], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO', maxZoom: 19,
    }).addTo(map);
    const markers = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true });
    map.addLayer(markers);
    mapRef.current = map;
    markersRef.current = markers;
    setMapLoaded(true);
  }, [ensureLeaflet]);

  // Init map when tab becomes active
  useEffect(() => {
    if (activeTab !== 'livemap') return;
    const timer = setTimeout(async () => {
      if (!mapRef.current) {
        await initMap();
      } else {
        mapRef.current.invalidateSize();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab, initMap]);

  // Load sites once map is ready, and when filters change
  useEffect(() => {
    if (mapLoaded) {
      loadMapSites(mapVendor, mapTechno);
    }
  }, [mapLoaded, mapVendor, mapTechno, loadMapSites]);

  const searchMapParams = useCallback(async () => {
    if (!mapSidebar) return;
    const params = new URLSearchParams({ site_name: mapSidebar.site_name, limit: '30' });
    if (mapParamSearch.trim()) params.set('search', mapParamSearch.trim());
    try {
      const d = await fetchJson<SiteParam[]>(`topo/site-params?${params}`);
      setMapSidebarParams(Array.isArray(d) ? d : []);
    } catch { setMapSidebarParams([]); }
  }, [mapSidebar, mapParamSearch]);

  /* ══════════════════ DIMENSIONS ══════════════════ */
  const [dimensions, setDimensions] = useState<{ id: string; code: string; display_name: string; csv_column: string; category: string; source: string; type: string; rat: string; is_filterable: boolean; is_aggregatable: boolean; is_active: boolean }[]>([]);
  const [dimsLoading, setDimsLoading] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [dimPreviewField, setDimPreviewField] = useState('');
  const [dimPreviewValues, setDimPreviewValues] = useState<string[]>([]);
  const [dimPreviewLoading, setDimPreviewLoading] = useState(false);

  const loadDimensions = useCallback(async () => {
    setDimsLoading(true);
    try {
      const d = await fetchJson<{ dimensions?: unknown[]; items?: unknown[] }>('dimensions');
      const items = (d.dimensions || d.items || d) as typeof dimensions;
      setDimensions(Array.isArray(items) ? items : []);
    } catch { setDimensions([]); }
    finally { setDimsLoading(false); }
  }, []);

  const loadCsvColumns = useCallback(async () => {
    try {
      const d = await fetchJson<{ columns?: string[] }>('config/topo/csv-columns');
      setCsvColumns(d.columns || []);
    } catch { setCsvColumns([]); }
  }, []);

  useEffect(() => {
    if (activeTab === 'dimensions') {
      loadDimensions();
      loadCsvColumns();
    }
  }, [activeTab, loadDimensions, loadCsvColumns]);

  const previewDimension = async (field: string) => {
    if (!field) { setDimPreviewValues([]); return; }
    setDimPreviewField(field);
    setDimPreviewLoading(true);
    try {
      const fieldMap: Record<string, string> = {
        plaque_site: 'plaque', 'Région': 'dor', nom_upr: 'dor',
        cat_arcep_code: 'zone', techno: 'techno', constructeur: 'vendor', lac: 'band',
      };
      const mapped = fieldMap[field] || field;
      const d = await fetchJson<string[]>(`topo/distinct?field=${encodeURIComponent(mapped)}`);
      setDimPreviewValues(Array.isArray(d) ? d : []);
    } catch { setDimPreviewValues([]); }
    finally { setDimPreviewLoading(false); }
  };

  /* ══════════════════ SERVICE BADGE ══════════════════ */
  const serviceBadge = useMemo(() => {
    if (!stats) return <Badge variant="outline">—</Badge>;
    if (stats.importing) return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30" variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing</Badge>;
    if (stats.error) return <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30" variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>;
    if ((stats.rows || stats.live_rows || 0) > 0) return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30" variant="outline"><CheckCircle2 className="w-3 h-3 mr-1" />Loaded</Badge>;
    return <Badge variant="outline">Empty</Badge>;
  }, [stats]);

  const progressPct = stats?.progress?.pct || 0;
  const progressPhase = stats?.progress?.phase || '';

  /* ────────────────────── RENDER ────────────────────── */
  return (
    <div className="h-full overflow-y-auto">
      {/* Map tooltip style */}
      <style>{`
        .map-tooltip { background: hsl(var(--card)) !important; color: hsl(var(--card-foreground)) !important; border: 1px solid hsl(var(--border)) !important; font-size: 11px !important; padding: 6px 10px !important; border-radius: 6px !important; }
        .marker-cluster { background: rgba(59,130,246,.3) !important; }
        .marker-cluster div { background: #3b82f6 !important; color: #fff !important; font-size: 11px !important; }
      `}</style>

      <div className="px-8 py-6 max-w-[1600px] mx-auto space-y-4">

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="CSV Rows" value={fmt(stats?.rows ?? stats?.live_rows)} icon={<Database className="w-5 h-5 text-blue-500" />} />
          <StatCard label="Sites" value={fmt(stats?.sites)} icon={<Radio className="w-5 h-5 text-emerald-500" />} />
          <StatCard label="Cells" value={fmt(stats?.cells)} icon={<Layers className="w-5 h-5 text-violet-500" />} />
          <StatCard label="Status" value="" icon={serviceBadge} />
          <StatCard
            label="Last Loaded"
            value={stats?.last_loaded_at ? new Date(stats.last_loaded_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            icon={<Info className="w-5 h-5 text-amber-500" />}
            small
          />
        </div>

        {/* Import progress */}
        {importing && stats?.progress && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {progressPhase === 'counting' ? 'Counting CSV lines...' :
                 progressPhase === 'importing' ? 'Importing rows...' :
                 progressPhase === 'swapping' ? 'Swapping tables...' :
                 progressPhase === 'enriching' ? 'Building enrichment...' :
                 progressPhase === 'indexing' ? 'Creating indexes...' :
                 progressPhase}
              </span>
              <span className="text-xs text-muted-foreground">
                {progressPhase === 'importing' && stats.progress.inserted
                  ? `${(stats.progress.inserted || 0).toLocaleString()} / ${(stats.progress.total_lines || 0).toLocaleString()} rows`
                  : `${progressPct}%`}
              </span>
            </div>
            <Progress value={progressPct} className="h-3" />
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="livemap" className="gap-1.5"><Map className="w-4 h-4" /> Live Map</TabsTrigger>
            <TabsTrigger value="sites" className="gap-1.5"><Building2 className="w-4 h-4" /> Sites & Data</TabsTrigger>
            <TabsTrigger value="network" className="gap-1.5"><Globe className="w-4 h-4" /> Global Network</TabsTrigger>
            <TabsTrigger value="dimensions" className="gap-1.5"><Boxes className="w-4 h-4" /> Dimensions</TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: Live Map ═══════ */}
          <TabsContent value="livemap" className="mt-4">
            <div className="flex" style={{ height: 'calc(100vh - 340px)', minHeight: 400 }}>
              {/* Map */}
              <div className="flex-1 relative border rounded-l-lg overflow-hidden">
                <div ref={mapContainerRef} className="w-full h-full bg-card" />
                {/* Map overlay filters */}
                <div className="absolute top-3 left-14 z-[1000] flex gap-2">
                  <select
                    value={mapVendor}
                    onChange={e => setMapVendor(e.target.value)}
                    className="h-7 text-[11px] px-2 bg-card border border-border rounded"
                  >
                    <option value="">All Vendors</option>
                    {(filterValues.constructeur || []).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <select
                    value={mapTechno}
                    onChange={e => setMapTechno(e.target.value)}
                    className="h-7 text-[11px] px-2 bg-card border border-border rounded"
                  >
                    <option value="">All</option>
                    <option value="2G">2G</option>
                    <option value="3G">3G</option>
                    <option value="4G">4G</option>
                    <option value="5G">5G</option>
                  </select>
                  <span className="text-xs bg-card px-2 py-1 rounded border border-border">
                    {mapSiteCount.toLocaleString()} sites
                  </span>
                </div>
              </div>

              {/* Sidebar */}
              {mapSidebar && (
                <div className="w-[360px] bg-card border-y border-r rounded-r-lg overflow-y-auto">
                  {/* Header */}
                  <div className="p-3 border-b flex items-center justify-between">
                    <span className="font-bold text-sm truncate">{mapSidebar.site_name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setMapSidebar(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {/* Site info */}
                  <div className="p-3 text-xs space-y-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <Badge variant={vendorVariant(mapSidebar.constructeur)} className="text-[9px]">{mapSidebar.constructeur || '—'}</Badge>
                      {(mapSidebar.technos || []).map(t => (
                        <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded border ${technoClass(t)}`}>{t}</span>
                      ))}
                    </div>
                    <div className="text-muted-foreground">{mapSidebar.cell_count} cells · {mapSidebar.plaque || ''} · {mapSidebar.dor || ''}</div>
                    <div className="text-muted-foreground">{(mapSidebar.bandes || []).slice(0, 5).join(', ')}</div>
                  </div>
                  {/* Cells */}
                  <div className="px-3 pb-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Cells</div>
                    <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                      {mapSidebarCells.length === 0
                        ? <span className="text-[10px] text-muted-foreground">No cells</span>
                        : mapSidebarCells.map((c, i) => (
                          <div key={i} className="text-[10px] flex justify-between">
                            <span>{c.cell_name}</span>
                            <span className="text-muted-foreground">{c.band || ''} <span className={`px-1 rounded border ${technoClass(c.techno || '')}`}>{c.techno || ''}</span></span>
                          </div>
                        ))}
                    </div>
                  </div>
                  {/* Parameters */}
                  <div className="px-3 pb-3 border-t pt-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">Parameters</div>
                    <div className="flex gap-1 mb-2">
                      <Input
                        value={mapParamSearch}
                        onChange={e => setMapParamSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchMapParams()}
                        placeholder="Parameter name..."
                        className="h-7 text-[11px]"
                      />
                      <Button variant="outline" size="sm" className="h-7 px-2" onClick={searchMapParams}>
                        <Search className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto space-y-0">
                      {mapSidebarParams.length === 0
                        ? <span className="text-[10px] text-muted-foreground">No parameters found</span>
                        : <>
                          <div className="text-[10px] text-muted-foreground mb-1">{mapSidebarParams.length} parameters</div>
                          {mapSidebarParams.map((p, i) => {
                            const pname = p.parameter.includes('.') ? p.parameter.split('.').slice(1).join('.') : p.parameter;
                            return (
                              <div key={i} className="text-[10px] py-0.5 border-b border-border/40 flex justify-between gap-1">
                                <span className="font-mono text-cyan-500 truncate flex-1" title={p.parameter}>{pname}</span>
                                <span className="font-semibold text-blue-500 max-w-[80px] truncate" title={p.value || ''}>{p.value ?? <span className="text-muted-foreground">NULL</span>}</span>
                              </div>
                            );
                          })}
                        </>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════ TAB: Sites & Data ═══════ */}
          <TabsContent value="sites" className="mt-4 space-y-4">

            {/* Topo Service */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-blue-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Topo Service</h2>
                </div>
                {serviceBadge}
              </div>
              {stats?.csv_path && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 border rounded-lg mb-3">
                  <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground uppercase mb-0.5">Configured Path</div>
                    <div className="font-mono text-xs font-semibold truncate">{stats.csv_path}</div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <Button size="sm" onClick={runImport} disabled={importing}>
                  {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                  Run Import
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> Upload File
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />
                <div className="flex-1" />
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete Topo
                </Button>
              </div>
            </Card>

            {/* Sites search + table */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-cyan-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Sites</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {sitesLoading ? 'Loading...' : `${sites.length} sites${query ? ' matching' : ''}`}
                </span>
              </div>

              <div className="flex gap-2 items-end mb-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Search Site</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Type site name..." className="pl-9" />
                  </div>
                </div>
                <FilterSelect label="Vendor" value={vendorFilter} onChange={setVendorFilter} options={filterValues.constructeur || []} />
                <FilterSelect label="Techno" value={technoFilter} onChange={setTechnoFilter} options={['2G', '3G', '4G', '5G']} />
                <FilterSelect label="Plaque" value={plaqueFilter} onChange={setPlaqueFilter} options={filterValues.plaque || []} />
                <FilterSelect label="DOR" value={dorFilter} onChange={setDorFilter} options={filterValues.dor || []} />
                <Button variant="outline" size="sm" onClick={searchSites} disabled={sitesLoading}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${sitesLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-center">Cells</TableHead>
                      <TableHead>Technos</TableHead>
                      <TableHead>Bands</TableHead>
                      <TableHead>Plaque</TableHead>
                      <TableHead>DOR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sitesLoading && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading...</TableCell></TableRow>
                    )}
                    {!sitesLoading && sitesError && (
                      <TableRow><TableCell colSpan={7} className="text-center text-rose-500 py-6">{sitesError}</TableCell></TableRow>
                    )}
                    {!sitesLoading && !sitesError && sites.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sites found</TableCell></TableRow>
                    )}
                    {!sitesLoading && !sitesError && sites.map(s => (
                      <TableRow
                        key={s.site_name}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedSite === s.site_name ? 'bg-primary/5' : ''}`}
                        onClick={() => viewSite(s.site_name)}
                      >
                        <TableCell className="font-semibold text-cyan-500">{s.site_name}</TableCell>
                        <TableCell><Badge variant={vendorVariant(s.constructeur)} className="text-[10px]">{s.constructeur || '—'}</Badge></TableCell>
                        <TableCell className="text-center font-semibold">{s.cell_count}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(s.technos || []).map(t => (
                              <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${technoClass(t)}`}>{t}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={(s.bandes || []).join(', ')}>
                          {(s.bandes || []).slice(0, 4).join(', ')}
                          {(s.bandes || []).length > 4 && <span className="ml-1">+{(s.bandes || []).length - 4}</span>}
                        </TableCell>
                        <TableCell className="text-xs">{s.plaque || ''}</TableCell>
                        <TableCell className="text-xs">{s.dor || ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Site detail */}
            {(selectedSite || detailLoading) && (
              <Card className="p-5" id="topo-site-detail">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">Site Detail — {selectedSite}</h2>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedSite(null); setSiteDetail(null); }}>
                    <X className="w-4 h-4 mr-1" /> Close
                  </Button>
                </div>

                {detailLoading && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading site details...
                  </div>
                )}
                {!detailLoading && detailError && (
                  <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-sm">
                    <AlertCircle className="w-4 h-4 inline mr-2" />{detailError}
                  </div>
                )}

                {!detailLoading && !detailError && siteDetail && (
                  <>
                    {/* Summary stats */}
                    <div className="grid grid-cols-5 gap-3 mb-4">
                      <StatCard label="Site" value={siteDetail.site_name} small />
                      <StatCard label="Cells" value={String(siteDetail.cell_count)} />
                      <StatCard label="Technologies" value={siteDetail.technos.join(', ') || '—'} small />
                      <StatCard label="Vendors" value={siteDetail.vendors.join(', ') || '—'} small />
                      <StatCard label="Bands" value={(siteDetail.bands || []).join(', ') || '—'} small />
                    </div>

                    {/* Detail tabs */}
                    <Tabs value={detailTab} onValueChange={setDetailTab}>
                      <TabsList>
                        <TabsTrigger value="info" className="gap-1 text-xs"><Info className="w-3.5 h-3.5" /> Info</TabsTrigger>
                        <TabsTrigger value="cells" className="gap-1 text-xs"><Signal className="w-3.5 h-3.5" /> Cells ({siteDetail.cells.length})</TabsTrigger>
                        <TabsTrigger value="params" className="gap-1 text-xs"><Settings className="w-3.5 h-3.5" /> Parameters</TabsTrigger>
                        <TabsTrigger value="alarms" className="gap-1 text-xs"><AlertCircle className="w-3.5 h-3.5" /> Alarms</TabsTrigger>
                        <TabsTrigger value="cm" className="gap-1 text-xs"><RefreshCw className="w-3.5 h-3.5" /> CM History</TabsTrigger>
                      </TabsList>

                      {/* Info tab */}
                      <TabsContent value="info" className="mt-3">
                        <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                          {[
                            ['Plaque', siteDetail.plaque],
                            ['Region', siteDetail.region],
                            ['Zone ARCEP', siteDetail.zone_arcep],
                            ['Code NIDT', siteDetail.code_nidt],
                            ['Classe', siteDetail.classe],
                            ['Couverture', siteDetail.couverture],
                            ['Vendor', siteDetail.vendor],
                            ['Latitude', siteDetail.latitude?.toFixed(6)],
                            ['Longitude', siteDetail.longitude?.toFixed(6)],
                          ].map(([label, val]) => val ? (
                            <div key={label as string} className="flex justify-between items-center py-1 border-b border-border/40">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="font-medium">{String(val)}</span>
                            </div>
                          ) : null)}
                          {siteDetail.hw && (
                            <>
                              {siteDetail.hw.baseband && (
                                <div className="flex justify-between items-center py-1 border-b border-border/40">
                                  <span className="text-muted-foreground">Baseband</span>
                                  <span className="font-medium">{siteDetail.hw.baseband}</span>
                                </div>
                              )}
                              {siteDetail.hw.antenna && (
                                <div className="flex justify-between items-center py-1 border-b border-border/40">
                                  <span className="text-muted-foreground">Antenna</span>
                                  <span className="font-medium">{siteDetail.hw.antenna}</span>
                                </div>
                              )}
                              {siteDetail.hw.rru && (
                                <div className="flex justify-between items-center py-1 border-b border-border/40">
                                  <span className="text-muted-foreground">RRU</span>
                                  <span className="font-medium">{siteDetail.hw.rru}</span>
                                </div>
                              )}
                              {siteDetail.hw.sw_version && (
                                <div className="flex justify-between items-center py-1 border-b border-border/40">
                                  <span className="text-muted-foreground">SW Version</span>
                                  <span className="font-mono font-medium">{siteDetail.hw.sw_version}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </TabsContent>

                      {/* Cells tab */}
                      <TabsContent value="cells" className="mt-3">
                        <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-card z-10">
                              <TableRow>
                                {cellColumns.map(k => (
                                  <TableHead key={k} className="text-[10px] whitespace-nowrap">{prettyLabel(k)}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {siteDetail.cells.map((c, i) => (
                                <TableRow key={i}>
                                  {cellColumns.map(k => (
                                    <TableCell key={k} className="text-xs whitespace-nowrap">{String((c as Record<string, unknown>)[k] ?? '')}</TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      {/* Parameters tab */}
                      <TabsContent value="params" className="mt-3">
                        <div className="flex gap-2 mb-3">
                          <div className="relative flex-1">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={paramSearch}
                              onChange={e => setParamSearch(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && loadSiteParams(selectedSite!, paramSearch)}
                              placeholder="Search parameters..."
                              className="pl-9"
                            />
                          </div>
                          <Button variant="outline" size="sm" onClick={() => loadSiteParams(selectedSite!, paramSearch)}>
                            <Search className="w-4 h-4" />
                          </Button>
                        </div>
                        {paramsLoading ? (
                          <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading...</div>
                        ) : siteParams.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">No parameters found</div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-card z-10">
                                <TableRow>
                                  <TableHead>Parameter</TableHead>
                                  <TableHead>Value</TableHead>
                                  <TableHead>MO</TableHead>
                                  <TableHead>DN</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {siteParams.map((p, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono text-xs text-cyan-500">{p.parameter}</TableCell>
                                    <TableCell className="text-xs font-semibold text-blue-500">{p.value ?? '—'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{p.mo || ''}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={p.dn || ''}>{p.dn || ''}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* Alarms tab */}
                      <TabsContent value="alarms" className="mt-3">
                        {alarmsLoading ? (
                          <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading...</div>
                        ) : siteAlarms.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">No alarms for this site</div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-card z-10">
                                <TableRow>
                                  <TableHead>Time</TableHead>
                                  <TableHead>Severity</TableHead>
                                  <TableHead>Problem</TableHead>
                                  <TableHead>Text</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Cell</TableHead>
                                  <TableHead>Duration</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {siteAlarms.map((a, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs whitespace-nowrap">{a.alarm_time ? new Date(a.alarm_time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</TableCell>
                                    <TableCell><span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityClass(a.severity)}`}>{a.severity || '—'}</span></TableCell>
                                    <TableCell className="text-xs max-w-[200px] truncate" title={a.problem || ''}>{a.problem || '—'}</TableCell>
                                    <TableCell className="text-xs max-w-[200px] truncate" title={a.text || ''}>{a.text || ''}</TableCell>
                                    <TableCell className="text-xs">{a.status || ''}</TableCell>
                                    <TableCell className="text-xs">{a.cell_name || ''}</TableCell>
                                    <TableCell className="text-xs">{a.duration_min != null ? `${a.duration_min}m` : ''}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* CM History tab */}
                      <TabsContent value="cm" className="mt-3">
                        {cmLoading ? (
                          <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading...</div>
                        ) : siteCmChanges.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">No CM changes for this site</div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-card z-10">
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Parameter</TableHead>
                                  <TableHead>Old Value</TableHead>
                                  <TableHead>New Value</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>User</TableHead>
                                  <TableHead>Cell</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {siteCmChanges.map((c, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs whitespace-nowrap">{c.changed_at ? new Date(c.changed_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</TableCell>
                                    <TableCell className="text-xs font-mono text-cyan-500">{c.parameter || '—'}</TableCell>
                                    <TableCell className="text-xs text-rose-400 max-w-[120px] truncate" title={c.old_value || ''}>{c.old_value || '—'}</TableCell>
                                    <TableCell className="text-xs text-emerald-400 max-w-[120px] truncate" title={c.new_value || ''}>{c.new_value || '—'}</TableCell>
                                    <TableCell className="text-xs">{c.change_type || ''}</TableCell>
                                    <TableCell className="text-xs">{c.user || ''}</TableCell>
                                    <TableCell className="text-xs">{c.cell_name || ''}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </Card>
            )}
          </TabsContent>

          {/* ═══════ TAB: Global Network ═══════ */}
          <TabsContent value="network" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-500" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Network Overview 2G / 3G / 4G / 5G</h2>
              </div>
              <Button variant="outline" size="sm" onClick={loadGlobalNetwork} disabled={globalLoading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${globalLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>

            {globalLoading && !globalNet && (
              <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Loading network data...</div>
            )}

            {globalNet && (
              <>
                {/* Top stats */}
                <div className="grid grid-cols-4 gap-3">
                  {(() => {
                    const t4g = globalNet.by_techno.find(t => t.techno === '4G' || t.techno === 'LTE');
                    const t5g = globalNet.by_techno.find(t => t.techno === '5G' || t.techno === 'NR');
                    return (
                      <>
                        <StatCard label="Sites 4G" value={fmt(t4g?.sites)} icon={<MapPin className="w-5 h-5 text-blue-500" />} />
                        <StatCard label="Sites 5G" value={fmt(t5g?.sites)} icon={<MapPin className="w-5 h-5 text-emerald-500" />} />
                        <StatCard label="Cellules 4G" value={fmt(t4g?.cells)} icon={<Signal className="w-5 h-5 text-blue-500" />} />
                        <StatCard label="Cellules 5G" value={fmt(t5g?.cells)} icon={<Signal className="w-5 h-5 text-emerald-500" />} />
                      </>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Technology distribution */}
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="w-5 h-5 text-emerald-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wide">Technology Distribution</h3>
                    </div>
                    <div className="space-y-3">
                      {globalNet.by_techno.map(t => {
                        const pct = globalNet.total_cells > 0 ? (t.cells / globalNet.total_cells * 100) : 0;
                        return (
                          <div key={t.techno}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] ${technoClass(t.techno)}`}>{t.techno}</span>
                                <span className="text-muted-foreground">{t.sites.toLocaleString()} sites</span>
                              </span>
                              <span className="font-semibold">{t.cells.toLocaleString()} cells ({pct.toFixed(1)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: t.techno === '5G' || t.techno === 'NR' ? '#10b981' : t.techno === '4G' || t.techno === 'LTE' ? '#3b82f6' : t.techno === '3G' ? '#f59e0b' : '#ef4444' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Vendor distribution */}
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="w-5 h-5 text-violet-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wide">Vendor Distribution</h3>
                    </div>
                    <div className="space-y-3">
                      {globalNet.by_vendor.map(v => {
                        const pct = globalNet.total_cells > 0 ? ((v.cells || 0) / globalNet.total_cells * 100) : 0;
                        return (
                          <div key={v.vendor}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5">
                                <Badge variant={vendorVariant(v.vendor)} className="text-[10px]">{v.vendor}</Badge>
                                <span className="text-muted-foreground">{v.sites.toLocaleString()} sites</span>
                              </span>
                              <span className="font-semibold">{(v.cells || 0).toLocaleString()} cells ({pct.toFixed(1)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: vendorColor(v.vendor) }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                {/* Band distribution */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Wifi className="w-5 h-5 text-cyan-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wide">Band Distribution</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {globalNet.by_band.map(b => (
                      <div key={b.band} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/20" title={`${b.cells.toLocaleString()} cells`}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: bandColor(b.band) }} />
                        <span className="text-xs font-semibold">{b.band}</span>
                        <span className="text-[10px] text-muted-foreground">{b.cells.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ═══════ TAB: Dimensions ═══════ */}
          <TabsContent value="dimensions" className="mt-4 space-y-4">

            {/* Dimension definitions */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-violet-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Dimension Definitions</h2>
                </div>
                <Button variant="outline" size="sm" onClick={loadDimensions} disabled={dimsLoading}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${dimsLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>

              {dimsLoading ? (
                <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading...</div>
              ) : dimensions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No dimensions defined. Import topology first to auto-detect dimensions.</div>
              ) : (
                <div className="space-y-4">
                  {/* Group by category */}
                  {Object.entries(
                    dimensions.reduce<Record<string, typeof dimensions>>((acc, d) => {
                      const cat = d.category || 'General';
                      (acc[cat] = acc[cat] || []).push(d);
                      return acc;
                    }, {})
                  ).map(([cat, dims]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{cat} ({dims.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {dims.map(d => (
                          <div key={d.code} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${d.is_active ? 'bg-muted/20' : 'bg-muted/5 opacity-50'}`}>
                            <span className="font-semibold">{d.display_name || d.code}</span>
                            {d.csv_column && <span className="text-[9px] text-muted-foreground">({d.csv_column})</span>}
                            {d.rat && d.rat !== 'ALL' && (
                              <span className={`text-[9px] px-1 rounded border ${technoClass(d.rat)}`}>{d.rat}</span>
                            )}
                            {d.is_filterable && <Badge variant="outline" className="text-[8px] h-4">Filter</Badge>}
                            {d.is_aggregatable && <Badge variant="outline" className="text-[8px] h-4">Agg</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Preview & Test */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-5 h-5 text-cyan-500" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Preview & Test</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Dimension</label>
                  <Select value={dimPreviewField} onValueChange={f => { setDimPreviewField(f); previewDimension(f); }}>
                    <SelectTrigger><SelectValue placeholder="Select dimension..." /></SelectTrigger>
                    <SelectContent>
                      {['plaque', 'dor', 'zone', 'band', 'techno', 'vendor'].map(f => (
                        <SelectItem key={f} value={f}>{prettyLabel(f)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Distinct Values</label>
                  {dimPreviewLoading ? (
                    <div className="text-sm text-muted-foreground py-2"><Loader2 className="w-3 h-3 inline animate-spin mr-1" />Loading...</div>
                  ) : dimPreviewValues.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto">
                      {dimPreviewValues.map(v => (
                        <span key={v} className="text-[10px] px-2 py-0.5 rounded border bg-muted/20">{v}</span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-2">Select a dimension to preview values...</div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Delete Topology Data
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>This will permanently delete <strong>all</strong> topology data:</div>
                <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>Rows</span><b>{fmt(stats?.rows ?? stats?.live_rows)}</b></div>
                  <div className="flex justify-between"><span>Sites</span><b>{fmt(stats?.sites)}</b></div>
                  <div className="flex justify-between"><span>Cells</span><b>{fmt(stats?.cells)}</b></div>
                </div>
                <div className="text-rose-500 text-xs font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> This action cannot be undone. You will need to re-import the topology file.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTopo} className="bg-rose-500 hover:bg-rose-600 text-white">
              Delete All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* ────────────────────── StatCard ────────────────────── */

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; small?: boolean }> = ({ label, value, icon, small }) => (
  <Card className="p-4">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1">{label}</div>
        <div className={`font-black ${small ? 'text-sm' : 'text-2xl'} truncate`} title={value}>{value}</div>
      </div>
      {icon && <div className="shrink-0">{icon}</div>}
    </div>
  </Card>
);

/* ────────────────────── FilterSelect ────────────────────── */

const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: string[] }> = ({ label, value, onChange, options }) => (
  <div className="w-[140px]">
    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default NetworkTopologyPage;
