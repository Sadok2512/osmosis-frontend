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
  if (vu === 'NOKIA' || vu === 'NSN') return '#1e40af';
  if (vu === 'ERICSSON') return '#60a5fa';
  if (vu === 'HUAWEI') return '#dc2626';
  if (vu === 'SAMSUNG') return '#7c3aed';
  return '#718096';
};

const vendorVariant = (v?: string | null): 'default' | 'secondary' | 'outline' => {
  const vu = (v || '').toUpperCase();
  if (vu === 'NOKIA' || vu === 'NSN') return 'default';
  if (vu === 'ERICSSON') return 'secondary';
  return 'outline';
};

const TECH_COLOR_MAP: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  '5G': { bg: 'bg-green-500/15', text: 'text-green-500', border: 'border-green-500/30', hex: '#27AE60' },
  '4G': { bg: 'bg-orange-500/15', text: 'text-orange-500', border: 'border-orange-500/30', hex: '#F39C12' },
  '3G': { bg: 'bg-blue-500/15', text: 'text-blue-500', border: 'border-blue-500/30', hex: '#3498DB' },
  '2G': { bg: 'bg-purple-500/15', text: 'text-purple-500', border: 'border-purple-500/30', hex: '#8E44AD' },
};

const technoClass = (t: string): string => {
  const tu = t.toUpperCase();
  if (tu === '5G' || tu === 'NR') return `${TECH_COLOR_MAP['5G'].bg} ${TECH_COLOR_MAP['5G'].text} ${TECH_COLOR_MAP['5G'].border}`;
  if (tu === '4G' || tu === 'LTE') return `${TECH_COLOR_MAP['4G'].bg} ${TECH_COLOR_MAP['4G'].text} ${TECH_COLOR_MAP['4G'].border}`;
  if (tu === '3G' || tu === 'UMTS' || tu === 'WCDMA') return `${TECH_COLOR_MAP['3G'].bg} ${TECH_COLOR_MAP['3G'].text} ${TECH_COLOR_MAP['3G'].border}`;
  if (tu === '2G' || tu === 'GSM') return `${TECH_COLOR_MAP['2G'].bg} ${TECH_COLOR_MAP['2G'].text} ${TECH_COLOR_MAP['2G'].border}`;
  return 'bg-muted text-muted-foreground border-border';
};

const bandColor = (b: string): string => {
  const colors: Record<string, string> = {
    GSM900: '#8E44AD', GSM1800: '#7D3C98',
    UMTS900: '#3498DB', UMTS2100: '#2E86C1',
    LTE700: '#CA6F1E', LTE800: '#F5B041', LTE1800: '#D68910', LTE2100: '#E67E22', LTE2600: '#F39C12',
    NR_700: '#229954', NR_2100: '#1E8449', NR_3500: '#27AE60',
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const neighborLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlightLayerRef = useRef<any>(null);
  const allSitesRef = useRef<MapSite[]>([]);
  const mapInitializing = useRef(false);
  const [mapVendor, setMapVendor] = useState<string>('');
  const [mapTechno, setMapTechno] = useState<string>('');
  const [mapSiteCount, setMapSiteCount] = useState(0);
  const [mapSidebar, setMapSidebar] = useState<MapSite | null>(null);
  const [mapSidebarParams, setMapSidebarParams] = useState<SiteParam[]>([]);
  const [mapParamSearch, setMapParamSearch] = useState('');
  const [mapSidebarCells, setMapSidebarCells] = useState<{ cell_name: string; band?: string; techno?: string }[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getL = (): any => (window as any).L;

  const TECH_RING_COLORS: Record<string, string> = {
    '5G': '#27AE60', '4G': '#F39C12', '3G': '#3498DB', '2G': '#8E44AD',
  };
  const TECH_ORDER = ['2G', '3G', '4G', '5G'] as const;
  const normTechFn = (t: string): string => {
    const u = t.toUpperCase();
    if (u.includes('NR') || u.includes('5G')) return '5G';
    if (u.includes('LTE') || u.includes('4G') || /^L\d/.test(u)) return '4G';
    if (u.includes('UMTS') || u.includes('WCDMA') || u.includes('3G')) return '3G';
    if (u.includes('GSM') || u.includes('2G')) return '2G';
    return '4G';
  };

  const buildSiteIcon = (s: MapSite, selected = false) => {
    const L = getL(); if (!L) return null;
    const techSet = new Set<string>();
    (s.technos || []).forEach(t => techSet.add(normTechFn(t)));
    (s.bandes || []).forEach(b => techSet.add(normTechFn(b)));
    if (techSet.size === 0) techSet.add('4G');
    const presentTechs = TECH_ORDER.filter(t => techSet.has(t));
    const baseSize = selected ? 28 : 22;
    const rings = presentTechs.length;
    const svgSize = baseSize + (rings - 1) * 6;
    const center = svgSize / 2;
    let svgParts = '';
    if (selected) {
      svgParts += `<circle cx="${center}" cy="${center}" r="${svgSize / 2}" fill="none" stroke="#3498DB" stroke-width="3" stroke-opacity="0.9"/>`;
    }
    presentTechs.forEach((tech, i) => {
      const radius = (baseSize / 2) - (i * 3) - 1;
      const color = TECH_RING_COLORS[tech] || '#F39C12';
      svgParts += `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1.2" stroke-opacity="0.85"/>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">${svgParts}</svg>`;
    return { icon: L.divIcon({ className: '', html: svg, iconSize: [svgSize, svgSize], iconAnchor: [svgSize / 2, svgSize / 2] }), presentTechs };
  };

  /** Haversine distance in km */
  const haversineKm = (a: [number, number], b: [number, number]): number => {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * sinLng * sinLng;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /** Show selected site + neighbors on the map */
  const showSiteWithNeighbors = (site: MapSite) => {
    const L = getL();
    if (!L || !mapRef.current) return;

    // Clear previous neighbor/highlight layers
    if (neighborLayerRef.current) { mapRef.current.removeLayer(neighborLayerRef.current); }
    if (highlightLayerRef.current) { mapRef.current.removeLayer(highlightLayerRef.current); }

    const neighborGroup = L.layerGroup();
    const highlightGroup = L.layerGroup();

    const siteCoords: [number, number] = [site.latitude, site.longitude];

    // Draw selected site marker (larger, with selection ring)
    const iconData = buildSiteIcon(site, true);
    if (iconData) {
      const marker = L.marker(siteCoords, { icon: iconData.icon, zIndexOffset: 1000 });
      marker.bindTooltip(`<b>${site.site_name}</b> (selected)`, { className: 'map-tooltip', permanent: false });
      highlightGroup.addLayer(marker);
    }

    // Find nearest neighbors from loaded sites
    const allSites = allSitesRef.current;
    const nearby = allSites
      .filter(s => s.site_name !== site.site_name && s.latitude && s.longitude)
      .map(s => ({
        ...s,
        dist: haversineKm(siteCoords, [s.latitude, s.longitude]),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 15);

    // Draw neighbor sites and connection lines
    const RELATION_COLORS = ['#3498DB', '#f59e0b', '#8b5cf6'];
    nearby.forEach((ns, idx) => {
      const nCoords: [number, number] = [ns.latitude, ns.longitude];
      const nIconData = buildSiteIcon(ns, false);
      if (nIconData) {
        const nMarker = L.marker(nCoords, { icon: nIconData.icon });
        nMarker.bindTooltip(
          `<b>${ns.site_name}</b><br>${ns.cell_count} cells · ${ns.dist.toFixed(1)} km`,
          { className: 'map-tooltip' }
        );
        nMarker.on('click', () => {
          setMapSidebar(ns);
          setMapSidebarParams([]);
          setMapParamSearch('');
          fetchJson<{ cell_name: string; band?: string; techno?: string }[]>(
            `topo/cells?search=${encodeURIComponent(ns.site_name)}&limit=50`
          ).then(setMapSidebarCells).catch(() => setMapSidebarCells([]));
        });
        neighborGroup.addLayer(nMarker);
      }
      // Draw line
      const color = RELATION_COLORS[idx % 3];
      const line = L.polyline([siteCoords, nCoords], {
        color,
        weight: 2,
        opacity: 0.6,
        dashArray: '6 4',
      });
      line.bindTooltip(`${ns.site_name} · ${ns.dist.toFixed(1)} km`, { sticky: true, className: 'map-tooltip' });
      neighborGroup.addLayer(line);
    });

    neighborLayerRef.current = neighborGroup;
    highlightLayerRef.current = highlightGroup;
    neighborGroup.addTo(mapRef.current);
    highlightGroup.addTo(mapRef.current);

    // Zoom to fit selected site + neighbors
    const allPoints = [siteCoords, ...nearby.map(n => [n.latitude, n.longitude] as [number, number])];
    if (allPoints.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 12 });
    } else {
      mapRef.current.setView(siteCoords, 12);
    }
  };

  // Mutable ref for loadSites so callback ref can call latest version
  const loadSitesRef = useRef<(v: string, t: string) => void>();
  loadSitesRef.current = async (vend: string, tech: string) => {
    if (!mapRef.current || !markersRef.current) return;
    const L = getL();
    if (!L) return;
    const qp = new URLSearchParams({ limit: '5000' });
    if (vend) qp.set('vendor', vend);
    if (tech) qp.set('techno', tech);
    try {
      const sites = await fetchJson<MapSite[]>(`topo/map-sites?${qp}`);
      allSitesRef.current = sites;
      markersRef.current.clearLayers();
      // Clear neighbor layers on fresh load
      if (neighborLayerRef.current) { mapRef.current.removeLayer(neighborLayerRef.current); neighborLayerRef.current = null; }
      if (highlightLayerRef.current) { mapRef.current.removeLayer(highlightLayerRef.current); highlightLayerRef.current = null; }
      let count = 0;

      sites.forEach((s: MapSite) => {
        if (s.latitude && s.longitude) {
          const iconData = buildSiteIcon(s, false);
          if (!iconData) return;
          const { icon, presentTechs } = iconData;
          const m = L.marker([s.latitude, s.longitude], { icon });
          m.bindTooltip(
            `<b>${s.site_name}</b><br>${s.cell_count} cells · ${s.constructeur || ''}<br>${presentTechs.join(' / ')}`,
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
            // Show site with neighbors
            showSiteWithNeighbors(s);
          });
          markersRef.current.addLayer(m);
          count++;
        }
      });
      setMapSiteCount(count);
    } catch (e) { console.error('[map] loadSites error', e); }
  };

  // Callback ref: fires when React mounts/unmounts the map div
  const mapCallbackRef = useCallback((node: HTMLDivElement | null) => {
    mapContainerRef.current = node;

    // Cleanup on unmount: destroy old map so we can re-init on remount
    if (!node) {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch { /* ignore */ }
        mapRef.current = null;
        markersRef.current = null;
        neighborLayerRef.current = null;
        highlightLayerRef.current = null;
        mapInitializing.current = false;
      }
      return;
    }

    if (mapRef.current || mapInitializing.current) return;
    mapInitializing.current = true;

    (async () => {
      // Load Leaflet CSS
      const loadCss = (href: string) => {
        if (!document.querySelector(`link[href="${href}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet'; link.href = href;
          document.head.appendChild(link);
        }
      };
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
      loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');

      // Load Leaflet JS sequentially
      const loadScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          const poll = () => { if (getL()) resolve(); else setTimeout(poll, 50); };
          poll(); return;
        }
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(); s.onerror = reject;
        document.head.appendChild(s);
      });
      try {
        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');
      } catch (e) { console.error('[map] Script load failed', e); return; }

      const L = getL();
      if (!L) { console.error('[map] L not available'); return; }

      // Check node is still mounted
      if (!mapContainerRef.current) { mapInitializing.current = false; return; }

      // Init map on the actual DOM node
      const map = L.map(mapContainerRef.current).setView([46.6, 2.5], 6);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', maxZoom: 19,
      }).addTo(map);
      const markers = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true });
      map.addLayer(markers);
      mapRef.current = map;
      markersRef.current = markers;

      // Load sites immediately
      if (loadSitesRef.current) loadSitesRef.current('', '');
    })();
  }, []);

  // Reload when vendor/techno filters change
  useEffect(() => {
    if (mapRef.current && markersRef.current && loadSitesRef.current) {
      loadSitesRef.current(mapVendor, mapTechno);
    }
  }, [mapVendor, mapTechno]);

  // Invalidate size when switching back to livemap tab
  useEffect(() => {
    if (activeTab === 'livemap' && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 150);
    }
  }, [activeTab]);

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
        .marker-cluster div { background: #3498DB !important; color: #fff !important; font-size: 11px !important; }
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="network" className="gap-1.5"><Globe className="w-4 h-4" /> Global Network</TabsTrigger>
            <TabsTrigger value="sites" className="gap-1.5"><Building2 className="w-4 h-4" /> Sites & Data</TabsTrigger>
            <TabsTrigger value="livemap" className="gap-1.5"><Map className="w-4 h-4" /> Live Map</TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: Live Map ═══════ */}
          <TabsContent value="livemap" className="mt-4">
            <div className="flex" style={{ height: 'calc(100vh - 340px)', minHeight: 400 }}>
              {/* Map */}
              <div className="flex-1 relative border rounded-l-lg overflow-hidden">
                <div ref={mapCallbackRef} className="w-full h-full bg-card" />
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
                <div className="w-[380px] bg-card border-l border-border/60 overflow-y-auto shadow-lg flex flex-col">

                  {/* ── Header ── */}
                  <div className="p-4 pb-3 border-b border-border/40">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Radio className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm truncate leading-tight">{mapSidebar.site_name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-muted-foreground font-medium">Live</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 rounded-lg" onClick={() => {
                          setMapSidebar(null);
                          if (neighborLayerRef.current && mapRef.current) { mapRef.current.removeLayer(neighborLayerRef.current); neighborLayerRef.current = null; }
                          if (highlightLayerRef.current && mapRef.current) { mapRef.current.removeLayer(highlightLayerRef.current); highlightLayerRef.current = null; }
                          mapRef.current?.setView([46.6, 2.5], 6);
                        }}>
                          <Globe className="w-3 h-3 mr-1" /> All Sites
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => setMapSidebar(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Tech + Vendor badges */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-border bg-muted/40">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {mapSidebar.constructeur || '—'}
                      </span>
                      {(() => {
                        const ts = new Set<string>();
                        (mapSidebar.technos || []).forEach(t => ts.add(normTechFn(t)));
                        (mapSidebar.bandes || []).forEach(b => ts.add(normTechFn(b)));
                        return TECH_ORDER.filter(t => ts.has(t)).map(t => {
                          const tc = TECH_COLOR_MAP[t] || TECH_COLOR_MAP['4G'];
                          return (
                            <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${tc.bg} ${tc.text} ${tc.border}`}>{t}</span>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* ── Overview Stats ── */}
                  <div className="p-4 pb-3 border-b border-border/40">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                        <div className="text-lg font-black leading-none">{mapSidebar.cell_count}</div>
                        <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Cells</div>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                        <div className="text-lg font-black leading-none">{(mapSidebar.bandes || []).length}</div>
                        <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Bands</div>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                        <div className="text-lg font-black leading-none">
                          {(() => {
                            const ts = new Set<string>();
                            (mapSidebar.technos || []).forEach(t => ts.add(normTechFn(t)));
                            return ts.size;
                          })()}
                        </div>
                        <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Techs</div>
                      </div>
                    </div>
                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-2.5 text-[10px] text-muted-foreground">
                      {mapSidebar.plaque && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{mapSidebar.plaque}</span>}
                      {mapSidebar.dor && <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{mapSidebar.dor}</span>}
                    </div>
                  </div>

                  {/* ── Bands / Frequencies ── */}
                  {(mapSidebar.bandes || []).length > 0 && (
                    <div className="p-4 pb-3 border-b border-border/40">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5" /> Bands & Frequencies
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(mapSidebar.bandes || []).map((b, i) => {
                          const nt = normTechFn(b);
                          const tc = TECH_COLOR_MAP[nt] || TECH_COLOR_MAP['4G'];
                          return (
                            <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${tc.bg} ${tc.text} ${tc.border}`}>
                              {b}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Cells List ── */}
                  <div className="p-4 pb-3 border-b border-border/40">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Signal className="w-3.5 h-3.5" /> Cells ({mapSidebarCells.length})</span>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto space-y-0.5 scrollbar-thin">
                      {mapSidebarCells.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                          <Signal className="w-5 h-5 mb-1.5 opacity-40" />
                          <span className="text-[10px]">No cells loaded</span>
                        </div>
                      ) : mapSidebarCells.map((c, i) => {
                        const nt = normTechFn(c.techno || '');
                        const tc = TECH_COLOR_MAP[nt] || TECH_COLOR_MAP['4G'];
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors group text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tc.hex }} />
                              <span className="font-medium truncate">{c.cell_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {c.band && <span className="text-[9px] text-muted-foreground">{c.band}</span>}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tc.bg} ${tc.text} ${tc.border}`}>{c.techno || ''}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Parameters ── */}
                  <div className="p-4 flex-1 min-h-0 flex flex-col">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5" /> Parameters
                    </div>
                    <div className="flex gap-1.5 mb-2.5">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={mapParamSearch}
                          onChange={e => setMapParamSearch(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && searchMapParams()}
                          placeholder="Search parameter name..."
                          className="h-8 text-[11px] pl-8 rounded-lg"
                        />
                      </div>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={searchMapParams}>
                        <Search className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[300px] scrollbar-thin">
                      {mapSidebarParams.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                          <Settings className="w-6 h-6 mb-2 opacity-30" />
                          <span className="text-[11px] font-medium">No parameters found</span>
                          <span className="text-[10px] mt-0.5 opacity-60">Search for a parameter name above</span>
                        </div>
                      ) : (
                        <>
                          <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">{mapSidebarParams.length} result{mapSidebarParams.length > 1 ? 's' : ''}</div>
                          <div className="space-y-0">
                            {mapSidebarParams.map((p, i) => {
                              const pname = p.parameter.includes('.') ? p.parameter.split('.').slice(1).join('.') : p.parameter;
                              return (
                                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors text-[11px] border-b border-border/30 last:border-0">
                                  <span className="font-mono text-primary truncate flex-1 mr-2" title={p.parameter}>{pname}</span>
                                  <span className="font-semibold text-foreground max-w-[100px] truncate shrink-0" title={p.value || ''}>{p.value ?? <span className="text-muted-foreground italic">NULL</span>}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
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
                                style={{ width: `${pct}%`, background: t.techno === '5G' || t.techno === 'NR' ? '#27AE60' : t.techno === '4G' || t.techno === 'LTE' ? '#F39C12' : t.techno === '3G' ? '#3498DB' : '#8E44AD' }} />
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
