import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Trash2, PlayCircle, FolderOpen, Radio, Info, X, Filter, Check, Plus,
  Loader2, CheckCircle2, AlertCircle, Database, Layers, Map, Globe,
  Boxes, Upload, Signal, Wifi, Settings, ChevronRight, ChevronDown, Eye,
  MapPin, Building2, BarChart3,
} from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { topoApi } from '@/lib/localDb';
import { ProgressiveFilterBuilder, type DashboardSiteFilters } from '@/components/otarie/ProgressiveFilterBuilder';
import { cn } from '@/lib/utils';
import { LayerVisibility, throttle } from '@/lib/layerVisibility';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip as LTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchCellNeighbors } from './map/neighborTypes';

/* Destination point given start, bearing (deg) and distance (m) */
const destPoint = (lat: number, lng: number, bearingDeg: number, distM: number): [number, number] => {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const d = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
};

const TECH_COLOR: Record<string, string> = {
  '2G': '#8E44AD', '3G': '#3498DB', '4G': '#F39C12', '5G': '#27AE60',
};

/* Auto-fit bounds for sites map */
const SitesFitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  React.useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
    } else {
      map.fitBounds(points as [number, number][], { padding: [30, 30], maxZoom: 12 });
    }
  }, [points, map]);
  return null;
};

/* Fly to selected site coordinates */
const SitesFlyTo: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap();
  React.useEffect(() => {
    if (!target) return;
    map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.8 });
  }, [target, map]);
  return null;
};

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

const SITE_SEARCH_LIMIT = '500';

/* ────────────────────── Helpers ────────────────────── */

const fmt = (n: number | undefined | null): string =>
  n == null ? '—' : n.toLocaleString();

const prettyLabel = (k: string): string =>
  k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const joinFilterValues = (values: string[]): string =>
  values.map(v => v.trim()).filter(Boolean).join(',');

const networkFilterCount = (...groups: string[][]): number =>
  groups.reduce((total, group) => total + group.length, 0);

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
  '5G': { bg: 'bg-[#27AE60]/15', text: 'text-[#27AE60]', border: 'border-[#27AE60]/30', hex: '#27AE60' },
  '4G': { bg: 'bg-[#F39C12]/15', text: 'text-[#F39C12]', border: 'border-[#F39C12]/30', hex: '#F39C12' },
  '3G': { bg: 'bg-[#3498DB]/15', text: 'text-[#3498DB]', border: 'border-[#3498DB]/30', hex: '#3498DB' },
  '2G': { bg: 'bg-[#8E44AD]/15', text: 'text-[#8E44AD]', border: 'border-[#8E44AD]/30', hex: '#8E44AD' },
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
  const [activeTab, setActiveTab] = useState('network');
  // Lazy-mount tabs: only render the JSX of tabs that have been visited at least once
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['network']));
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);


  /* ══════════════════ STATS + SERVICE STATUS ══════════════════ */
  const [stats, setStats] = useState<TopoStats | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const pollRef = useRef<number | null>(null);
  const previousImportingRef = useRef(false);

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

  // Cascade-aware loader: when called with current selections, /topo/filters
  // returns each dim's values restricted by the OTHER active filters.
  // E.g. picking VENDOR=Nokia narrows the PLAQUE dropdown to Nokia-bearing
  // plaques; adding PLAQUE narrows further. Backend was extended in
  // osmosis_backend commit 5e7478a (May 2026).
  const loadFilters = useCallback(async (ctx?: { vendor?: string[]; techno?: string[]; plaque?: string[]; dor?: string[] }) => {
    const qs = new URLSearchParams();
    if (ctx?.vendor?.length) qs.set('vendor', ctx.vendor.join(','));
    if (ctx?.techno?.length) qs.set('rat',    ctx.techno.join(','));   // techno → rat (backend name)
    if (ctx?.plaque?.length) qs.set('cluster',ctx.plaque.join(','));   // plaque → cluster (backend alias)
    if (ctx?.dor?.length)    qs.set('dor',    ctx.dor.join(','));
    const path = qs.toString() ? `topo/filters?${qs}` : 'topo/filters';
    try {
      const d = await fetchJson<{ filters: FilterOption[] }>(path);
      setFilters(d.filters || []);
    } catch {
      setFilters([]);
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const wasImporting = previousImportingRef.current;
    if (wasImporting && !importing) {
      loadFilters();
      searchSitesRef.current?.();
    }
    previousImportingRef.current = importing;
  }, [importing, loadFilters]);

  const runImport = async () => {
    try {
      await fetchJson<unknown>('control/run-now/TOPO_SERVICE', { method: 'POST' });
      toast.success('Topology import started');
      setImporting(true);
      loadStats();
      loadFilters();
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  };

  const deleteTopo = async () => {
    try {
      await fetchJson<unknown>('topo/delete', { method: 'DELETE' });
      toast.success('Topology data deleted');
      loadStats();
      loadFilters();
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
      loadFilters();
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ══════════════════ FILTERS ══════════════════ */
  const [filters, setFilters] = useState<FilterOption[]>([]);

  const filterValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    filters.forEach(f => { map[f.id] = f.values; });
    return map;
  }, [filters]);

  /* ── 46-dim cascading picker (Live Map) ──
   * Catalog from /api/v1/topo/catalog/filters; values lazy-loaded per chip
   * via /api/v1/topo/filters/values?dimension=&context= so cascading works.
   * Selected dims land in extraFilters.dim_filters and are sent to
   * /topo/sites?dim_filters={JSON} (backend extension 2026-05-07).
   */
  const [topoCatalog, setTopoCatalog] = useState<{ id: string; label: string; values: string[]; category?: string; rat?: string }[]>([]);
  const [extraFilters, setExtraFilters] = useState<DashboardSiteFilters>({});
  useEffect(() => {
    let cancelled = false;
    topoApi.filterCatalog()
      .then(d => { if (!cancelled) setTopoCatalog(d.filters || []); })
      .catch(err => console.warn('[topology] filterCatalog failed', err));
    return () => { cancelled = true; };
  }, []);
  // Stable string for downstream effect deps — extraFilters identity changes
  // on each onChange even when the values are the same; JSON normalizes that.
  const dimFiltersKey = useMemo(() => JSON.stringify(extraFilters.dim_filters || {}), [extraFilters.dim_filters]);

  /* ══════════════════ SITES SEARCH ══════════════════ */
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [technoFilter, setTechnoFilter] = useState<string[]>([]);
  const [plaqueFilter, setPlaqueFilter] = useState<string[]>([]);
  const [dorFilter, setDorFilter] = useState<string[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const searchRequestRef = useRef(0);
  const searchSitesRef = useRef<(() => Promise<void>) | null>(null);
  const siteFilterCount = networkFilterCount(vendorFilter, technoFilter, plaqueFilter, dorFilter);
  const clearSiteFilters = () => {
    setQuery('');
    setVendorFilter([]);
    setTechnoFilter([]);
    setPlaqueFilter([]);
    setDorFilter([]);
  };

  // Cascade refetch: any time the user changes one of the four filters,
  // refetch /topo/filters with the OTHER three as context so each
  // dropdown is restricted to compatible values. Backend self-excludes
  // each dim, so a checked filter still appears in its own dropdown.
  useEffect(() => {
    if (siteFilterCount === 0) {
      loadFilters();
      return;
    }
    loadFilters({
      vendor: vendorFilter,
      techno: technoFilter,
      plaque: plaqueFilter,
      dor:    dorFilter,
    });
  }, [vendorFilter, technoFilter, plaqueFilter, dorFilter, siteFilterCount, loadFilters]);

  const searchSites = useCallback(async () => {
    const requestId = ++searchRequestRef.current;
    setSitesLoading(true);
    setSitesError(null);
    try {
      const params = new URLSearchParams({ limit: SITE_SEARCH_LIMIT });
      if (query.trim()) params.set('search', query.trim());
      if (vendorFilter.length) params.set('vendor', joinFilterValues(vendorFilter));
      if (technoFilter.length) params.set('techno', joinFilterValues(technoFilter));
      if (plaqueFilter.length) params.set('plaque', joinFilterValues(plaqueFilter));
      if (dorFilter.length) params.set('dor', joinFilterValues(dorFilter));
      // 46-dim picker selections — JSON-encoded into the dim_filters param.
      const cleanedDimBag: Record<string, string[]> = {};
      if (extraFilters.dim_filters) {
        for (const [k, v] of Object.entries(extraFilters.dim_filters)) {
          if (Array.isArray(v) && v.length > 0) cleanedDimBag[k] = v;
        }
      }
      // Picker chips that ended up writing to legacy top-level keys (e.g. via
      // ProgressiveFilterBuilder routing for 'dor', 'vendor', 'plaque', 'techno',
      // 'bande', 'zone_arcep', 'cluster') would already be in extraFilters as
      // top-level arrays — fold them into URL params alongside the legacy chips.
      const legacyMap: Record<string, string | undefined> = {
        dor: extraFilters.dor?.length ? extraFilters.dor.join(',') : undefined,
        vendor: extraFilters.vendor?.length ? extraFilters.vendor.join(',') : undefined,
        plaque: extraFilters.plaque?.length ? extraFilters.plaque.join(',') : undefined,
        techno: extraFilters.techno?.length ? extraFilters.techno.join(',') : undefined,
        bande: extraFilters.bande?.length ? extraFilters.bande.join(',') : undefined,
        zone_arcep: extraFilters.zone_arcep?.length ? extraFilters.zone_arcep.join(',') : undefined,
        cluster: extraFilters.cluster?.length ? extraFilters.cluster.join(',') : undefined,
      };
      for (const [k, v] of Object.entries(legacyMap)) {
        if (v && !params.has(k)) params.set(k, v);
      }
      if (Object.keys(cleanedDimBag).length) {
        params.set('dim_filters', JSON.stringify(cleanedDimBag));
      }
      const d = await fetchJson<SiteRow[] | { sites?: SiteRow[]; rows?: SiteRow[] }>(`topo/sites?${params}`);
      if (requestId !== searchRequestRef.current) return;
      const rows = Array.isArray(d) ? d : (d.sites || d.rows || []);
      setSites(rows);
    } catch (e) {
      if (requestId !== searchRequestRef.current) return;
      setSitesError((e as Error).message);
      setSites([]);
    } finally {
      if (requestId === searchRequestRef.current) {
        setSitesLoading(false);
      }
    }
  }, [query, vendorFilter, technoFilter, plaqueFilter, dorFilter, extraFilters, dimFiltersKey]);

  useEffect(() => {
    searchSitesRef.current = searchSites;
  }, [searchSites]);

  useEffect(() => {
    if (activeTab !== 'sites') return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => { searchSites(); }, 300) as unknown as number;
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
  }, [searchSites, activeTab]);

  /* ══════════════════ SITE DETAIL ══════════════════ */
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [enabledTechs, setEnabledTechs] = useState<Set<string>>(new Set(['2G', '3G', '4G', '5G']));
  const toggleTech = useCallback((t: string) => {
    setEnabledTechs(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);
  const normTech = useCallback((raw: string): string => {
    const u = (raw || '').toUpperCase();
    if (u.includes('5G') || u.includes('NR')) return '5G';
    if (u.includes('4G') || u.includes('LTE')) return '4G';
    if (u.includes('3G') || u.includes('UMTS') || u.includes('WCDMA')) return '3G';
    if (u.includes('2G') || u.includes('GSM')) return '2G';
    return u || '4G';
  }, []);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('info');

  // Neighbor sites (green dots) — fetched from Live Map Monitor neighbors API
  const [neighborSites, setNeighborSites] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const neighborFetchRef = useRef(0);
  useEffect(() => {
    if (!selectedSite || !siteDetail?.cells?.length) { setNeighborSites([]); return; }
    const reqId = ++neighborFetchRef.current;
    const cells = siteDetail.cells.slice(0, 20); // cap to avoid hammering API
    (async () => {
      const acc: Record<string, { name: string; lat: number; lng: number }> = {};
      await Promise.all(cells.map(async (c: any) => {
        const cellId = c.cell_id || c.cellId || c.id;
        if (!cellId) return;
        try {
          const res = await fetchCellNeighbors(String(cellId), 'out', 20);
          (res.neighbors || []).forEach(n => {
            if (!n.targetSiteName || n.targetSiteName === selectedSite) return;
            const [lat, lng] = n.targetCoords || [0, 0];
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
            if (!acc.has(n.targetSiteName)) acc.set(n.targetSiteName, { name: n.targetSiteName, lat, lng });
          });
        } catch { /* ignore per-cell failures */ }
      }));
      if (reqId === neighborFetchRef.current) setNeighborSites(Array.from(acc.values()));
    })();
  }, [selectedSite, siteDetail]);


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
  const detailRequestRef = useRef(0);
  const alarmsRequestRef = useRef(0);
  const cmRequestRef = useRef(0);
  const paramsRequestRef = useRef(0);

  const viewSite = async (siteName: string) => {
    const requestId = ++detailRequestRef.current;
    setSelectedSite(siteName);
    setSiteDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setDetailTab('info');
    setSiteAlarms([]);
    setSiteCmChanges([]);
    setSiteParams([]);
    try {
      const apiUrl = getApiUrl(`topo/site/${encodeURIComponent(siteName)}`);
      console.log('[NetworkTopology] viewSite fetching:', apiUrl);
      const raw = await fetchJson<Partial<SiteDetail> & Record<string, unknown>>(`topo/site/${encodeURIComponent(siteName)}`);
      console.log('[NetworkTopology] viewSite raw response keys:', Object.keys(raw || {}), 'cell_count:', (raw as any)?.cell_count, 'cells.length:', Array.isArray((raw as any)?.cells) ? (raw as any).cells.length : 'not-array');
      if (requestId !== detailRequestRef.current) return;
      // Defensive normalisation — some proxy paths drop top-level fields and
      // returned only { site_name }, which made the panel show
      // "Cells undefined / Technologies — / Cells (0)" while the backend
      // actually had cell_count: 24, technos: [2G,3G,4G], vendors, bands.
      // Fill missing aggregates from the cells array so the UI degrades
      // gracefully instead of looking broken.
      const cells = Array.isArray(raw.cells) ? (raw.cells as Record<string, unknown>[]) : [];
      const derive = (key: string) => Array.from(new Set(
        cells.map(c => String((c as any)[key] || '').trim()).filter(Boolean)
      )).sort();
      const s: SiteDetail = {
        site_name: (raw.site_name as string) || siteName,
        cell_count: (raw.cell_count as number) ?? cells.length ?? 0,
        technos: Array.isArray(raw.technos) && (raw.technos as string[]).length
          ? (raw.technos as string[])
          : derive('techno'),
        vendors: Array.isArray(raw.vendors) && (raw.vendors as string[]).length
          ? (raw.vendors as string[])
          : derive('vendor'),
        bands: Array.isArray(raw.bands) && (raw.bands as string[]).length
          ? (raw.bands as string[])
          : derive('band'),
        latitude: raw.latitude as number | null | undefined,
        longitude: raw.longitude as number | null | undefined,
        plaque: raw.plaque as string | null | undefined,
        region: raw.region as string | null | undefined,
        zone_arcep: raw.zone_arcep as string | null | undefined,
        code_nidt: raw.code_nidt as string | null | undefined,
        classe: raw.classe as string | null | undefined,
        couverture: raw.couverture as string | null | undefined,
        vendor: raw.vendor as string | null | undefined,
        hw: raw.hw as SiteDetail['hw'],
        cells,
      };
      setSiteDetail(s);
      setTimeout(() => {
        document.getElementById('topo-site-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e) {
      if (requestId !== detailRequestRef.current) return;
      setDetailError((e as Error).message);
    } finally {
      if (requestId === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  };

  const loadSiteAlarms = useCallback(async (siteName: string) => {
    const requestId = ++alarmsRequestRef.current;
    setAlarmsLoading(true);
    try {
      const d = await fetchJson<{ alarms: SiteAlarm[] }>(`topo/site-alarms?site_name=${encodeURIComponent(siteName)}&limit=50`);
      if (requestId !== alarmsRequestRef.current || selectedSite !== siteName) return;
      setSiteAlarms(d.alarms || []);
    } catch {
      if (requestId !== alarmsRequestRef.current || selectedSite !== siteName) return;
      setSiteAlarms([]);
    }
    finally {
      if (requestId === alarmsRequestRef.current) setAlarmsLoading(false);
    }
  }, [selectedSite]);

  const loadSiteCmHistory = useCallback(async (siteName: string) => {
    const requestId = ++cmRequestRef.current;
    setCmLoading(true);
    try {
      const d = await fetchJson<{ changes: CmChange[] }>(`topo/site-cm-history?site_name=${encodeURIComponent(siteName)}&limit=50`);
      if (requestId !== cmRequestRef.current || selectedSite !== siteName) return;
      setSiteCmChanges(d.changes || []);
    } catch {
      if (requestId !== cmRequestRef.current || selectedSite !== siteName) return;
      setSiteCmChanges([]);
    }
    finally {
      if (requestId === cmRequestRef.current) setCmLoading(false);
    }
  }, [selectedSite]);

  const loadSiteParams = useCallback(async (siteName: string, search?: string) => {
    const requestId = ++paramsRequestRef.current;
    setParamsLoading(true);
    try {
      const params = new URLSearchParams({ site_name: siteName, limit: '50' });
      if (search) params.set('search', search);
      const d = await fetchJson<SiteParam[]>(`topo/site-params?${params}`);
      if (requestId !== paramsRequestRef.current || selectedSite !== siteName) return;
      setSiteParams(Array.isArray(d) ? d : []);
    } catch {
      if (requestId !== paramsRequestRef.current || selectedSite !== siteName) return;
      setSiteParams([]);
    }
    finally {
      if (requestId === paramsRequestRef.current) setParamsLoading(false);
    }
  }, [selectedSite]);

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
  const [mapVendor, setMapVendor] = useState<string[]>([]);
  const [mapTechno, setMapTechno] = useState<string[]>([]);
  const [mapSiteCount, setMapSiteCount] = useState(0);
  // Display cap — only render markers when site count <= maxSites, unless
  // the user clicks "Force display" to bypass. Persisted across reloads.
  const [maxSites, setMaxSites] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('liveMap.maxSites') || '1000', 10);
    return Number.isFinite(v) && v > 0 ? v : 1000;
  });
  const [forceDisplay, setForceDisplay] = useState(false);
  // Hysteresis decision lifted to React state so a separate effect can
  // combine it with the count cap before deciding attach/detach.
  const [sitesHysteresisVisible, setSitesHysteresisVisible] = useState(false);
  const [mapSidebar, setMapSidebar] = useState<MapSite | null>(null);
  const [mapSidebarParams, setMapSidebarParams] = useState<SiteParam[]>([]);
  const [mapParamSearch, setMapParamSearch] = useState('');
  const [mapSidebarCells, setMapSidebarCells] = useState<{ cell_name: string; band?: string; techno?: string }[]>([]);
  const mapFilterCount = networkFilterCount(mapVendor, mapTechno);
  const clearMapFilters = () => {
    setMapVendor([]);
    setMapTechno([]);
  };

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
  const loadSitesRef = useRef<(v: string[], t: string[]) => void>();
  loadSitesRef.current = async (vend: string[], tech: string[]) => {
    if (!mapRef.current || !markersRef.current) return;
    const L = getL();
    if (!L) return;
    const qp = new URLSearchParams({ limit: '5000' });
    if (vend.length) qp.set('vendor', joinFilterValues(vend));
    if (tech.length) qp.set('techno', joinFilterValues(tech));
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
      const map = L.map(mapContainerRef.current).setView([46.6, 2.5], 7);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', maxZoom: 19,
      }).addTo(map);
      const markers = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true });
      // NOTE: deliberately NOT adding `markers` to the map yet — the
      // hysteresis controller below decides when to attach/detach it
      // based on the zoom level. This is what hides the cluster bubbles
      // at low zoom (z<=9) where they used to clutter France-wide view.
      mapRef.current = map;
      markersRef.current = markers;

      // ── Hysteresis-driven visibility (sites only, cells handled
      //    elsewhere). Pushes the boolean to React state so a separate
      //    effect can AND it with the count cap.
      //      sites: showAt=11, hideAt=9   band ]9, 11[
      const vis = new LayerVisibility<'sites'>(
        { sites: { showAt: 11, hideAt: 9 } },
        map.getZoom(),
      );
      setSitesHysteresisVisible(vis.isVisible('sites'));
      const onZoomEnd = throttle(() => {
        const changes = vis.update(map.getZoom());
        for (const c of changes) {
          if (c.layer === 'sites') setSitesHysteresisVisible(c.visible);
        }
      }, 80);
      map.on('zoomend', onZoomEnd);

      // Load sites immediately so the data is in RAM by the time the
      // user crosses zoom 11 — avoids a backend roundtrip mid-zoom.
      if (loadSitesRef.current) loadSitesRef.current([], []);
    })();
  }, []);

  // Reload when vendor/techno filters change
  useEffect(() => {
    if (mapRef.current && markersRef.current && loadSitesRef.current) {
      loadSitesRef.current(mapVendor, mapTechno);
    }
  }, [mapVendor, mapTechno]);

  // Combine hysteresis + count cap to decide whether to attach the
  // markerClusterGroup to the map. Re-runs on every state change.
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;
    const withinCap = forceDisplay || mapSiteCount <= maxSites;
    const shouldAttach = sitesHysteresisVisible && withinCap;
    const isAttached = map.hasLayer(markers);
    if (shouldAttach && !isAttached) markers.addTo(map);
    else if (!shouldAttach && isAttached) map.removeLayer(markers);
  }, [sitesHysteresisVisible, mapSiteCount, maxSites, forceDisplay]);

  // Persist maxSites preference across reloads.
  useEffect(() => {
    localStorage.setItem('liveMap.maxSites', String(maxSites));
  }, [maxSites]);

  // Reset force-display whenever the user re-applies a filter so the
  // override doesn't leak across different result sets.
  useEffect(() => { setForceDisplay(false); }, [mapVendor, mapTechno]);

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

      <div className="px-4 py-6 w-full space-y-4">

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
            {visitedTabs.has('livemap') && (
            <div className="flex" style={{ height: 'calc(100vh - 340px)', minHeight: 400 }}>
              {/* Map */}
              <div className="flex-1 relative border rounded-l-lg overflow-hidden">
                <div ref={mapCallbackRef} className="w-full h-full bg-card" />

                {/* Display cap controls (top-right corner) */}
                <div className="absolute top-3 right-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Max sites</label>
                  <input
                    type="number"
                    min={100}
                    max={50000}
                    step={100}
                    value={maxSites}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v > 0) setMaxSites(v);
                    }}
                    className="w-20 text-[11px] font-mono bg-background border border-border rounded px-2 py-1"
                  />
                </div>

                {/* Cap-exceeded overlay */}
                {sitesHysteresisVisible && mapSiteCount > maxSites && !forceDisplay && (
                  <div className="absolute top-16 right-3 z-[1000] bg-card/95 backdrop-blur-md border border-destructive/30 rounded-xl px-4 py-3 shadow-lg max-w-[260px]">
                    <p className="text-[11px] text-foreground font-semibold mb-1">
                      {mapSiteCount.toLocaleString()} sites &gt; {maxSites.toLocaleString()} max
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                      Affinez les filtres ou augmentez la limite ci-dessus.
                    </p>
                    <button
                      onClick={() => setForceDisplay(true)}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Forcer l'affichage
                    </button>
                  </div>
                )}
                <Filter2
                  variant="overlay"
                  title="Filter2"
                  subtitle="Live map"
                  filters={[
                    {
                      label: 'Vendors',
                      value: mapVendor,
                      onChange: setMapVendor,
                      options: filterValues.constructeur || filterValues.vendor || [],
                    },
                    {
                      label: 'Techno',
                      value: mapTechno,
                      onChange: setMapTechno,
                      options: (filterValues.rat && filterValues.rat.length ? filterValues.rat : ['2G', '3G', '4G', '5G']),
                    },
                  ]}
                  activeCount={mapFilterCount}
                  resultLabel={`${mapSiteCount.toLocaleString()} sites`}
                  onClear={clearMapFilters}
                />
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
            )}
          </TabsContent>

          {/* ═══════ TAB: Sites & Data ═══════ */}
          <TabsContent value="sites" className="mt-4 space-y-4">
            {visitedTabs.has('sites') && (<>

            {/* Topo Service section removed */}
            <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />

            {/* Sites search + table */}
            <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 340px)' }}>
              {/* Sites table */}
              <Card className="flex-1 min-w-0 overflow-hidden border-outline-variant/20 bg-white shadow-sm">
              <Filter2
                variant="panel"
                title="Filter2"
                subtitle="Network preference filters"
                query={query}
                onQueryChange={setQuery}
                queryPlaceholder="Search site..."
                filters={[
                  {
                    label: 'Vendor',
                    value: vendorFilter,
                    onChange: setVendorFilter,
                    options: filterValues.vendor || filterValues.constructeur || [],
                  },
                  {
                    label: 'Techno',
                    value: technoFilter,
                    onChange: setTechnoFilter,
                    options: (filterValues.rat && filterValues.rat.length ? filterValues.rat : ['2G', '3G', '4G', '5G']),
                  },
                  {
                    label: 'Plaque',
                    value: plaqueFilter,
                    onChange: setPlaqueFilter,
                    options: filterValues.plaque || filterValues.cluster || [],
                  },
                  {
                    label: 'DOR',
                    value: dorFilter,
                    onChange: setDorFilter,
                    options: filterValues.dor || [],
                  },
                ]}
                activeCount={siteFilterCount + (query.trim() ? 1 : 0)}
                resultLabel={sitesLoading ? 'Loading...' : `${sites.length} sites`}
                loading={sitesLoading}
                onClear={clearSiteFilters}
                onRefresh={searchSites}
              />


              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
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

              {/* Map alongside table */}
              <Card className="w-[40%] min-w-[320px] overflow-hidden border-outline-variant/20 bg-white shadow-sm p-0">
                {(() => {
                  const mapPts = sites
                    .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
                    .map(s => ({ name: s.site_name, lat: s.latitude as number, lng: s.longitude as number, selected: s.site_name === selectedSite }));
                  const bounds: [number, number][] = mapPts.map(p => [p.lat, p.lng]);
                  const center: [number, number] = bounds[0] || [46.6, 2.3];
                  const selectedPt = mapPts.find(p => p.selected);
                  const flyTarget: [number, number] | null =
                    selectedPt ? [selectedPt.lat, selectedPt.lng]
                    : (siteDetail && typeof siteDetail.latitude === 'number' && typeof siteDetail.longitude === 'number'
                        ? [siteDetail.latitude, siteDetail.longitude] : null);
                  return (
                    <div className="w-full h-full" style={{ minHeight: 'calc(100vh - 340px)', background: '#eef3f9' }}>
                      <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%', minHeight: 'calc(100vh - 340px)' }} scrollWheelZoom>
                        <TileLayer
                          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                          maxZoom={19}
                          subdomains="abcd"
                        />
                        {!selectedSite && <SitesFitBounds points={bounds} />}
                        <SitesFlyTo target={flyTarget} />
                        {mapPts.map(p => (
                          <CircleMarker
                            key={p.name}
                            center={[p.lat, p.lng]}
                            radius={p.selected ? 9 : 6}
                            pathOptions={{
                              color: '#fff',
                              weight: 2,
                              fillColor: p.selected ? '#06b6d4' : '#10b981',
                              fillOpacity: 0.9,
                            }}
                            eventHandlers={{ click: () => viewSite(p.name) }}
                          >
                            <LTooltip direction="top" offset={[0, -6]} className="!text-[10px] !font-semibold">
                              {p.name}
                            </LTooltip>
                          </CircleMarker>
                        ))}

                        {/* Beams + permanent label for the SELECTED site only */}
                        {flyTarget && selectedSite && (() => {
                          const [sLat, sLng] = flyTarget;
                          const cells = (siteDetail?.cells || []) as Record<string, unknown>[];
                          const beams = cells
                            .map(c => {
                              const azRaw = c.azimuth ?? c.azimut ?? c.az;
                              const az = typeof azRaw === 'string' ? parseFloat(azRaw) : (azRaw as number);
                              if (!Number.isFinite(az)) return null;
                              const tech = normTech(String(c.techno || c.rat || ''));
                              if (!enabledTechs.has(tech)) return null;
                              return { az: az as number, tech };
                            })
                            .filter(Boolean) as { az: number; tech: string }[];
                          // Dedupe by az+tech
                          const seen = new Set<string>();
                          const unique = beams.filter(b => {
                            const k = `${Math.round(b.az)}-${b.tech}`;
                            if (seen.has(k)) return false;
                            seen.add(k); return true;
                          });
                          // Tech ring order: 2G outermost → 5G innermost (concentric)
                          const TECH_ORDER = ['2G', '3G', '4G', '5G'];
                          const HALF_ANGLE = 32; // degrees
                          const STEPS = 14;
                          const BASE_LEN = 220;
                          const STEP_LEN = 55;
                          const buildWedge = (az: number, lenM: number): [number, number][] => {
                            const pts: [number, number][] = [[sLat, sLng]];
                            for (let k = 0; k <= STEPS; k++) {
                              const a = az - HALF_ANGLE + (2 * HALF_ANGLE * k) / STEPS;
                              pts.push(destPoint(sLat, sLng, a, lenM));
                            }
                            return pts;
                          };
                          return (
                            <>
                              {unique.map((b, i) => {
                                const color = TECH_COLOR[b.tech] || '#F39C12';
                                const ringIdx = TECH_ORDER.indexOf(b.tech);
                                const len = BASE_LEN + (ringIdx >= 0 ? (TECH_ORDER.length - 1 - ringIdx) * STEP_LEN : 0);
                                return (
                                  <Polygon
                                    key={`beam-${i}`}
                                    positions={buildWedge(b.az, len)}
                                    pathOptions={{
                                      color: '#fff',
                                      weight: 1,
                                      opacity: 0.9,
                                      fillColor: color,
                                      fillOpacity: 0.78,
                                    }}
                                  />
                                );
                              })}
                              {/* Permanent name label on the selected site */}
                              <CircleMarker
                                center={[sLat, sLng]}
                                radius={1}
                                pathOptions={{ opacity: 0, fillOpacity: 0 }}
                              >
                                <LTooltip
                                  direction="top"
                                  offset={[0, -10]}
                                  permanent
                                  className="!text-[11px] !font-bold !bg-card !border-border !shadow-md !px-2 !py-1"
                                >
                                  {selectedSite}
                                </LTooltip>
                              </CircleMarker>
                            </>
                          );
                        })()}
                      </MapContainer>
                    </div>
                  );
                })()}
              </Card>
            </div>


            {/* Site detail */}
            {(selectedSite || detailLoading) && (
              <Card className="p-5" id="topo-site-detail">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">Site Detail — {selectedSite}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Techno</span>
                    {(['2G', '3G', '4G', '5G'] as const).map(t => {
                      const active = enabledTechs.has(t);
                      const colors: Record<string, string> = {
                        '2G': '#8E44AD', '3G': '#3498DB', '4G': '#F39C12', '5G': '#27AE60',
                      };
                      return (
                        <button
                          key={t}
                          onClick={() => toggleTech(t)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all ${active ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground opacity-50 hover:opacity-75'}`}
                          style={active ? { backgroundColor: colors[t], borderColor: colors[t] } : undefined}
                        >
                          {t}
                        </button>
                      );
                    })}
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
                        {(() => {
                          const filteredCells = siteDetail.cells.filter(c => {
                            const tech = normTech(String((c as Record<string, unknown>).techno || (c as Record<string, unknown>).rat || ''));
                            return enabledTechs.has(tech);
                          });
                          return (
                            <>
                              <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs text-muted-foreground">
                                  Showing <span className="font-bold text-foreground">{filteredCells.length}</span> of {siteDetail.cells.length} cells
                                </span>
                              </div>
                              <div className="border rounded-lg overflow-auto max-h-[70vh]">
                                <Table>
                                  <TableHeader className="sticky top-0 bg-card z-10">
                                    <TableRow>
                                      {cellColumns.map(k => (
                                        <TableHead key={k} className="text-[10px] whitespace-nowrap">{prettyLabel(k)}</TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredCells.map((c, i) => (
                                      <TableRow key={i}>
                                        {cellColumns.map(k => (
                                          <TableCell key={k} className="text-xs whitespace-nowrap py-1.5">{String((c as Record<string, unknown>)[k] ?? '')}</TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </>
                          );
                        })()}
                      </TabsContent>

                    </Tabs>
                  </>
                )}
              </Card>
            )}
            </>)}
          </TabsContent>

          {/* ═══════ TAB: Global Network ═══════ */}
          <TabsContent value="network" className="mt-4 space-y-4">
            {visitedTabs.has('network') && (<>
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

            {globalNet?.error && (globalNet.total_cells === 0) && (
              <Card className="p-6 border-rose-200 bg-rose-50/40">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-rose-700 mb-1">Backend query timeout</div>
                    <div className="text-xs text-rose-600/90 mb-3">
                      The aggregation query on <code className="px-1 py-0.5 bg-rose-100 rounded text-[11px]">ref_cell_daily</code> exceeded the database timeout. Distributions cannot be computed right now.
                    </div>
                    <details className="text-[11px] text-rose-500/80 mb-3">
                      <summary className="cursor-pointer hover:text-rose-700">Technical details</summary>
                      <pre className="mt-2 p-2 bg-white/60 rounded border border-rose-200 overflow-x-auto whitespace-pre-wrap">{globalNet.error}</pre>
                    </details>
                    <Button size="sm" variant="outline" onClick={loadGlobalNetwork} disabled={globalLoading} className="border-rose-300 text-rose-700 hover:bg-rose-100">
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${globalLoading ? 'animate-spin' : ''}`} /> Retry
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {globalNet && globalNet.total_cells > 0 && (
              <>
                {/* Top stats */}
                <div className="grid grid-cols-4 gap-3">
                  {(() => {
                    const byTechno = globalNet.by_techno ?? [];
                    const t4g = byTechno.find(t => t.techno === '4G' || t.techno === 'LTE');
                    const t5g = byTechno.find(t => t.techno === '5G' || t.techno === 'NR');
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

                {/* Band distribution — grouped by technology with contextual % */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-5 h-5 text-cyan-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wide">Band Distribution</h3>
                      <span className="text-[10px] text-muted-foreground font-medium ml-1">% within technology</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {globalNet.by_band.length} bands · {globalNet.total_cells.toLocaleString()} total cells
                    </span>
                  </div>

                  {(() => {
                    const bandTech = (band: string): '5G' | '4G' | '3G' | '2G' => {
                      const b = band.toUpperCase();
                      if (b.startsWith('NR') || b.includes('5G')) return '5G';
                      if (b.startsWith('LTE') || b.includes('4G')) return '4G';
                      if (b.startsWith('UMTS') || b.startsWith('WCDMA') || b.includes('3G')) return '3G';
                      return '2G';
                    };
                    const techMeta: Record<string, { label: string; icon: string; gradient: string; barFrom: string; barTo: string; ring: string; chip: string }> = {
                      '5G': { label: '5G (NR)', icon: '📡', gradient: 'from-emerald-50 to-emerald-100/40', barFrom: 'from-emerald-400', barTo: 'to-emerald-600', ring: 'border-emerald-200/60', chip: 'bg-emerald-500/10 text-emerald-700' },
                      '4G': { label: '4G (LTE)', icon: '📶', gradient: 'from-orange-50 to-orange-100/40', barFrom: 'from-orange-400', barTo: 'to-orange-600', ring: 'border-orange-200/60', chip: 'bg-orange-500/10 text-orange-700' },
                      '3G': { label: '3G (UMTS)', icon: '📡', gradient: 'from-sky-50 to-sky-100/40', barFrom: 'from-sky-400', barTo: 'to-sky-600', ring: 'border-sky-200/60', chip: 'bg-sky-500/10 text-sky-700' },
                      '2G': { label: '2G (GSM)', icon: '☎️', gradient: 'from-violet-50 to-violet-100/40', barFrom: 'from-violet-400', barTo: 'to-violet-600', ring: 'border-violet-200/60', chip: 'bg-violet-500/10 text-violet-700' },
                    };

                    const groups: Record<string, { band: string; cells: number }[]> = { '5G': [], '4G': [], '3G': [], '2G': [] };
                    globalNet.by_band.forEach(b => groups[bandTech(b.band)].push(b));
                    Object.values(groups).forEach(arr => arr.sort((a, b) => b.cells - a.cells));
                    const order: ('5G' | '4G' | '3G' | '2G')[] = ['5G', '4G', '3G', '2G'];

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {order.filter(t => groups[t].length > 0).map(tech => {
                          const meta = techMeta[tech];
                          const bands = groups[tech];
                          const totalTech = bands.reduce((s, b) => s + b.cells, 0);
                          return (
                            <div key={tech} className={`rounded-xl border ${meta.ring} bg-gradient-to-br ${meta.gradient} p-4`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{meta.icon}</span>
                                  <span className="text-[13px] font-bold text-slate-800">{meta.label}</span>
                                </div>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.chip}`}>
                                  {totalTech.toLocaleString()} cells · {bands.length} band{bands.length > 1 ? 's' : ''}
                                </span>
                              </div>

                              <div className="space-y-2.5">
                                {bands.map((b, idx) => {
                                  const pct = totalTech > 0 ? (b.cells / totalTech) * 100 : 0;
                                  const isTop = idx === 0 && bands.length > 1;
                                  return (
                                    <div key={b.band} className="bg-white/70 backdrop-blur rounded-lg px-3 py-2 border border-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full" style={{ background: bandColor(b.band) }} />
                                          <span className={`text-[12px] font-semibold ${isTop ? 'text-slate-900' : 'text-slate-700'}`}>{b.band}</span>
                                          {isTop && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${meta.chip}`}>TOP</span>}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px]">
                                          <span className="tabular-nums text-slate-500 font-medium">{b.cells.toLocaleString()}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="tabular-nums font-bold text-slate-800 w-10 text-right">{pct.toFixed(1)}%</span>
                                        </div>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full bg-gradient-to-r ${meta.barFrom} ${meta.barTo} transition-all`}
                                          style={{ width: `${Math.max(2, pct)}%` }}
                                        />
                                      </div>
                                      <div className="text-[9.5px] text-slate-400 mt-1 text-right">% of {tech}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Card>
              </>
            )}
            </>)}
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

const StatCard = React.forwardRef<
  HTMLDivElement,
  { label: string; value: string; icon?: React.ReactNode; small?: boolean }
>(({ label, value, icon, small }, ref) => (
  <Card ref={ref} className="p-4">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1">{label}</div>
        <div className={`font-black ${small ? 'text-sm' : 'text-2xl'} truncate`} title={value}>{value}</div>
      </div>
      {icon && <div className="shrink-0">{icon}</div>}
    </div>
  </Card>
));
StatCard.displayName = 'StatCard';

/* ────────────────────── Filter2 ────────────────────── */

type Filter2Item = {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
};

const Filter2: React.FC<{
  title: string;
  subtitle: string;
  filters: Filter2Item[];
  activeCount: number;
  resultLabel: string;
  variant?: 'panel' | 'overlay';
  query?: string;
  onQueryChange?: (value: string) => void;
  queryPlaceholder?: string;
  loading?: boolean;
  onClear?: () => void;
  onRefresh?: () => void;
}> = ({
  title,
  subtitle,
  filters,
  activeCount,
  resultLabel,
  variant = 'panel',
  query,
  onQueryChange,
  queryPlaceholder = 'Search...',
  loading = false,
  onClear,
  onRefresh,
}) => {
  const hasQuery = typeof query === 'string' && !!query.trim();
  const hasActiveFilters = activeCount > 0;
  const isOverlay = variant === 'overlay';
  const [addedFilters, setAddedFilters] = useState<Set<string>>(new Set());
  const visibleFilters = filters.filter(f => f.value.length > 0 || addedFilters.has(f.label));
  const remainingFilters = filters.filter(f => f.value.length === 0 && !addedFilters.has(f.label));

  return (
    <div
      className={cn(
        isOverlay
          ? 'absolute left-14 top-3 z-[1000] max-w-[calc(100%-5rem)] rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur'
          : 'border-b border-outline-variant/10 bg-white'
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          isOverlay ? 'gap-y-2' : 'border-b border-outline-variant/10 px-5 py-3'
        )}
      >
        <div className="flex min-w-0 items-center gap-2 pr-1">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600">
            <Filter className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black uppercase tracking-wide text-on-surface">{title}</h2>
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
              <Check className="h-3 w-3" />
              {activeCount} active
            </span>
          )}
          <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-2.5 text-[11px] font-black text-slate-700">
            {resultLabel}
          </span>
        </div>
      </div>

      <div className={cn('flex flex-wrap items-center gap-2 gap-y-2', isOverlay ? 'pt-2' : 'px-5 py-3')}>
        {typeof query === 'string' && onQueryChange && (
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant" />
            <Input
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder={queryPlaceholder}
              className="h-9 rounded-full border-outline-variant/30 bg-white pl-9 pr-3 text-xs font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-emerald-500/20"
            />
          </div>
        )}

        {visibleFilters.map(filter => (
          <MultiFilterSelect
            key={filter.label}
            label={filter.label}
            value={filter.value}
            onChange={(v) => {
              filter.onChange(v);
              if (v.length === 0) {
                setAddedFilters(prev => {
                  const n = new Set(prev);
                  n.delete(filter.label);
                  return n;
                });
              }
            }}
            options={filter.options}
            compact={isOverlay}
          />
        ))}

        {remainingFilters.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-dashed border-emerald-300 bg-white px-3 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50',
                  isOverlay ? 'h-8' : 'h-9'
                )}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter filtre
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 p-1">
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Dimensions
              </div>
              {remainingFilters.map(f => (
                <button
                  key={f.label}
                  onClick={() => setAddedFilters(prev => new Set(prev).add(f.label))}
                  className="w-full text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {f.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {(hasActiveFilters || hasQuery) && onClear && (
          <button
            type="button"
            onClick={() => { onClear(); setAddedFilters(new Set()); }}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant/30 bg-white text-[11px] font-black text-on-surface-variant shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600',
              isOverlay ? 'h-8 w-8 px-0' : 'h-9 px-3'
            )}
            title="Clear Filter2"
          >
            <X className="h-3.5 w-3.5" />
            {!isOverlay && <span>Clear</span>}
          </button>
        )}

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 rounded-full border-outline-variant/30 bg-white px-3 text-[11px] font-black shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
};

/* ────────────────────── MultiFilterSelect ────────────────────── */

const MultiFilterSelect: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  compact?: boolean;
}> = ({ label, value, onChange, options, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalizedOptions = useMemo(
    () => Array.from(new Set((options || []).filter(Boolean))).sort(),
    [options]
  );
  const visibleOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(v => v.toLowerCase().includes(q));
  }, [normalizedOptions, search]);

  const toggle = (item: string) => {
    onChange(value.includes(item) ? value.filter(v => v !== item) : [...value, item]);
  };

  const summary = value.length === 0
    ? 'Tous'
    : value.length === 1
      ? value[0]
      : `${value.length} sélectionnés`;

  return (
    <div className={compact ? 'w-[150px]' : 'w-auto'}>
      <label className="sr-only">{label}</label>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border bg-white text-left text-[11px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all',
              compact ? 'h-7 px-2.5' : 'h-9 px-3',
              value.length > 0
                ? 'border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                : 'border-outline-variant/30 text-on-surface hover:border-primary hover:text-primary'
            )}
            title={value.length ? value.join(', ') : `All ${label}`}
          >
            <span className="text-on-surface-variant uppercase tracking-wide font-black">{label}</span>
            <span className={cn('truncate', compact ? 'max-w-[70px]' : 'max-w-[120px]')}>{summary}</span>
            {value.length > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-cyan-100 px-1.5 text-[10px] font-black text-cyan-700">
                {value.length}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] rounded-xl border border-border/60 bg-card p-0 shadow-xl z-[1100]" sideOffset={6}>
          <div className="px-4 pt-3 pb-2 border-b border-border/40">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Sélectionner — {label}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-lg border border-border/50 bg-muted/20 py-2 pl-8 pr-3 text-xs outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>
          </div>

          {value.length > 0 && (
            <div className="px-4 py-1.5 text-[10px] font-semibold text-primary border-b border-border/20">
              {value.length} sélectionné{value.length > 1 ? 's' : ''}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border/30 bg-muted/20 px-4 py-2">
            <button
              type="button"
              className="text-[10px] font-bold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={visibleOptions.length === 0}
              onClick={() => onChange(Array.from(new Set([...value, ...visibleOptions])))}
            >
              Select visible
            </button>
            <button
              type="button"
              className="text-[10px] font-bold text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              Reset
            </button>
          </div>

          <div className="max-h-[260px] overflow-y-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-[10px] text-muted-foreground">Aucune valeur</div>
            ) : visibleOptions.map(item => {
              const checked = value.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggle(item)}
                  className={cn(
                    'w-full px-4 py-2.5 text-left text-xs font-medium transition-all flex items-center gap-3 hover:bg-muted/40',
                    checked ? 'text-primary' : 'text-foreground'
                  )}
                >
                  <span className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/60 bg-background'
                  )}>
                    {checked && <Check className="w-3 h-3" />}
                  </span>
                  <span className={cn('flex-1 truncate', checked && 'font-bold')}>{item}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default NetworkTopologyPage;
