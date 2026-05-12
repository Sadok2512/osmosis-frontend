import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { dashboardsApi, mapViewsApi, qoeMetricsApi, topoApi } from '@/lib/localDb';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { useMapSitesStore } from "@/stores/mapSitesStore";
import { ActiveFilter, FILTER_DIMENSIONS, resolveAvailableValues } from '@/config/filterDimensions';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Tooltip, useMapEvents, Marker, Polyline, Circle } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { useFresnel } from '@/hooks/useFresnel';
import { haversineDistance, LatLng, bearing } from '@/utils/geodesicUtils';
import { is5GTech, is4GTech, is3GTech, is2GTech, getCellTechGroup, normalizeSiteKey, resolveCanonicalSiteId, stableCellKey, computeMapAggregation } from '@/utils/telecomHelpers';
import ProfileChart, { ProfileHoverData } from './radio-profile/ProfileChart';
import InfoPanel from './radio-profile/InfoPanel';
import CoverageProfile from './radio-profile/CoverageProfile';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createFilter } from '@/services/filterService';
import MapViewManager, { MapViewSettings } from './MapViewManager';

import CoverageCanvasOverlay from './CoverageCanvasOverlay';
import CoverageSimPanel from './CoverageSimPanel';
import TiltOverlay from './TiltOverlay';
import CellRfCharts from './CellRfCharts';
import BatchCoveragePanel from './BatchCoveragePanel';
import { CoverageGrid, SimulationParams, simulateCoverage, getDefaultParams, RSRP_LEGEND } from '@/services/propagationEngine';
import { SitesFilterBar } from '@/components/sites-monitor/SitesFilterBar';
import { useSitesFilters, FilterDefinition } from '@/hooks/useSitesFilters';
import { ProgressiveFilterBuilder } from './ProgressiveFilterBuilder';
import { InlineSimTab } from './SitesMonitorHelpers';
import { ViewFilterBuilder, ViewFilterCondition, conditionsToSiteFilters, siteFiltersToConditions } from '@/components/sites-monitor/ViewFilterBuilder';
import SiteChangesPanel from './SiteChangesPanel';
import { siteMatchesViewConditions, hasAnyCellLevelCondition } from '@/lib/viewFilterHelpers';
import { CreateViewModal, ViewConfig } from '@/components/sites-monitor/CreateViewModal';

// Heatmap layer component using leaflet.heat
const HeatmapLayer = ({ points, radius = 25, blur = 15, maxZoom, minOpacity = 0.4 }: {
  points: [number, number, number][];
  radius?: number;
  blur?: number;
  maxZoom?: number;
  minOpacity?: number;
}) => {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const zoom = maxZoom ?? Math.max(map.getZoom(), 10);
    const heat = (L as any).heatLayer(points, {
      radius,
      blur,
      maxZoom: zoom,
      minOpacity,
      max: 1.0,
      gradient: { 0.1: '#3498DB', 0.3: '#10b981', 0.5: '#f59e0b', 0.7: '#F39C12', 0.9: '#ef4444' },
    });
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, points, radius, blur, maxZoom, minOpacity]);
  return null;
};

// Popup content: fetches and displays ALL parameters of ALL cells of a site (parameter mode click)
const SiteAllParamsPopup: React.FC<{ siteName: string; activeParam: string | null }> = ({ siteName, activeParam }) => {
  const [rows, setRows] = useState<Array<{ parameter: string; cell_name: string | null; value: string | null; bande: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('parameter_dump')
          .select('parameter, cell_name, value, bande')
          .ilike('site_name', siteName)
          .order('cell_name', { ascending: true })
          .order('parameter', { ascending: true })
          .limit(5000);
        if (cancelled) return;
        setRows((data || []).map((r: any) => ({
          parameter: r.parameter || '',
          cell_name: r.cell_name || null,
          value: r.value ?? null,
          bande: r.bande || null,
        })));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteName]);

  // Group by cell
  const byCell = useMemo(() => {
    const m = new Map<string, typeof rows>();
    const f = filter.trim().toLowerCase();
    for (const r of rows) {
      if (f && !r.parameter.toLowerCase().includes(f) && !(r.value || '').toLowerCase().includes(f)) continue;
      const key = r.cell_name || '(site)';
      const arr = m.get(key) || [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filter]);

  return (
    <div className="text-xs min-w-[320px] max-w-[420px]">
      <div className="font-bold text-sm mb-1.5">{siteName}</div>
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filtrer paramètre / valeur…"
        className="w-full mb-2 px-2 py-1 text-[11px] border border-border/60 rounded bg-background outline-none focus:ring-1 focus:ring-primary"
      />
      {loading ? (
        <div className="text-[11px] text-muted-foreground italic py-2">Chargement de tous les paramètres…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic py-2">Aucun paramètre trouvé pour ce site.</div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2">
          {byCell.map(([cellName, params]) => (
            <div key={cellName} className="border border-border/40 rounded-md overflow-hidden">
              <div className="bg-muted/60 px-2 py-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-[11px] truncate">{cellName}</span>
                <span className="text-[9px] text-muted-foreground tabular-nums">{params.length}</span>
              </div>
              <div className="divide-y divide-border/30">
                {params.map((p, i) => {
                  const isActive = activeParam && p.parameter === activeParam;
                  return (
                    <div key={i} className={`flex items-center justify-between gap-2 px-2 py-0.5 text-[10.5px] ${isActive ? 'bg-primary/10' : ''}`}>
                      <span className={`truncate flex-1 ${isActive ? 'font-bold text-primary' : 'text-muted-foreground'}`} title={p.parameter}>{p.parameter}</span>
                      <span className={`tabular-nums shrink-0 max-w-[110px] truncate text-right ${isActive ? 'font-bold text-primary' : 'font-semibold text-foreground'}`} title={String(p.value ?? '')}>{p.value ?? '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[9px] text-muted-foreground text-right">{rows.length} paramètres • {byCell.length} cellules</div>
    </div>
  );
};
import { fetchSiteDetails } from '../../services/api';
import { getSectorNumber, getEquipmentPrefix } from '../../utils/sectorUtils';
import { normalizeCoordinates, fmtCoord } from '../../utils/coordinateHelpers';
import { getBandSizeScale, getBandRenderOrder, getCellCountScale, computeSmartAutoDensity, beamScaleToDensityFactor, getTaggedRadius, type SiteDensityInfo } from './map/sectorSizing';
import { ColorViewMode, COLOR_VIEW_LABELS, buildColorMap, getSiteDimensionValue, getColorForValue } from './map/colorByDimension';
import { TaggedLink, TaggedLinkSector, loadTaggedLinks, persistTaggedLinks, createTaggedLink, pickClosestSector, listSiteBands } from './map/taggedLinks';
import { CellNeighbor, NeighborDirection, NeighborRelationType, NEIGHBOR_COLORS, NEIGHBOR_LABELS, fetchCellNeighbors, generateMockNeighbors } from './map/neighborTypes';
import { invalidateSitesCache } from '../../services/mockData';
import { fetchSitesByBbox, fetchCellsByBbox, invalidateBboxCache, BboxQuery, fetchDashboardSites, fetchSiteCells, invalidateDashboardSitesCache, invalidateSiteCellsCache, getCachedDashboardSites, fetchKpiCellValues, clearKpiCache } from '../../services/topoService';
import VisualCoverageAdapter from './VisualCoverageAdapter';
import KpiOverlayAdapter, { type KpiOverlayView } from './KpiOverlayAdapter';
import { BboxFilters, onCellsCacheUpdate, isCellsCacheLoading, getCellsFromCacheForSite, getCellsCacheCount } from '@/lib/localDb';
import { SiteSummary, SiteDetail, Filters, CellProperties } from '../../types';
import {
  Search, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  SlidersHorizontal, ChevronRight, LayoutGrid, List, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen, Filter, X, Maximize2, Minimize2,
  ChevronDown, ChevronUp, BarChart2, Signal, Settings2,
  Crosshair, MousePointerClick, Radio, Plus, Minus, Star, Trash2, Check, Play, RotateCcw, Save, FolderOpen, MoreVertical, Archive, CheckCircle2, Tag,
  Bell, FileText, AlertTriangle, Layers, Palette, Pencil, CircleDot, Ruler, Pentagon, Target, ChevronsUpDown, Copy, Mountain, Globe, Sparkles, ScanSearch, User, Clock, Info, Flame, Eye, EyeOff
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { getQoEColor } from '../../constants';
import { vendorHex } from '@/constants/brandColors';

const getSidebarSectorKey = (cellId: string): string => `S-${getSectorNumber(cellId) || 0}`;

const getSidebarSectorNumber = (sectorKey: string): string => sectorKey.replace(/^S-/, '') || '—';

const getSidebarSectorSortValue = (sectorKey: string): number => {
  const n = Number(getSidebarSectorNumber(sectorKey));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

const getSidebarEquipmentLabel = (cells: CellProperties[]): string => {
  const equipment = Array.from(new Set(cells.map(c => getEquipmentPrefix(c.cell_id)).filter(Boolean)));
  return equipment.join(' / ');
};

interface SitesMonitorProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onCellSelect: (cellId: string) => void;
  highlightedCellIds?: string[];
  onClearHighlights?: () => void;
  onLaunchAI?: (siteName: string) => void;
  isVisible?: boolean;
}

// Zoom hysteresis: avoid oscillating between aggregated sites and cell-level rendering
const SITES_TO_CELLS_ZOOM = 15;
// Aligned with SITES_TO_CELLS_ZOOM (15) so per-cell sectors and cells
// fetch are gated by the same threshold — at zoom 13 the user sees only
// site dots + labels, no sectors.
const FULL_BEAM_DETAIL_ZOOM = 15;
const CELLS_TO_SITES_ZOOM = 12;
// Below this zoom: nothing is rendered. Above it, sites render only if visible count ≤ MAX_VISIBLE_SITES.
// MAX_VISIBLE_SITES raised 1000 → 10000 so dense urban viewports at zoom 12-14
// don't fall off the "render nothing" cliff while bboxLimitForZoom returns up
// to 5000 sites for the same zoom band. 10k Leaflet markers is comfortable on
// modern hardware; the LOD filter and density gates further trim the working set.
const SITES_VISIBLE_ZOOM = 12;
const MAX_VISIBLE_SITES = 10000;

// Band-based color mapping — default engineering palette
const DEFAULT_BAND_COLORS: Record<string, string> = {
  // GSM (2G) — red tones
  GSM900:  '#8E44AD',
  GSM1800: '#dc2626',
  // UMTS (3G) — blue tones
  UMTS900:  '#3498DB',
  UMTS2100: '#2E86C1',
  // NR (5G) — green tones
  NR3500: '#27AE60',
  NR700:  '#229954',
  NR2100: '#1E8449',
  // LTE (4G) — orange tones
  L2600:  '#F39C12',
  L2100:  '#E67E22',
  L1800:  '#D68910',
  L800:   '#F5B041',
  L700:   '#CA6F1E',
  // Group header colors
  '2G_GROUP': '#8E44AD',
  '3G_GROUP': '#3498DB',
  '5G_GROUP': '#27AE60',
  '4G_GROUP': '#F39C12',
};
// Load custom colors from localStorage
const loadCustomBandColors = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('osmosis_band_colors');
    if (saved) return { ...DEFAULT_BAND_COLORS, ...JSON.parse(saved) };
  } catch (err) { console.warn('[SitesMonitor] loadCustomBandColors failed', err); }
  return { ...DEFAULT_BAND_COLORS };
};

// Derive stroke colors (darken fill by ~20%)
const deriveStrokeColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darken = (v: number) => Math.max(0, Math.round(v * 0.75));
  return `#${darken(r).toString(16).padStart(2,'0')}${darken(g).toString(16).padStart(2,'0')}${darken(b).toString(16).padStart(2,'0')}`;
};

// Inactive/faded color for technology hierarchy mode
const FADED_COLOR = '#94a3b8';
const FRANCE_CENTER: [number, number] = [46.6, 2.2];
const FRANCE_DEFAULT_ZOOM = 7;

type TechGroup = '2G' | '3G' | '4G' | '5G';

type TopoNetworkStats = {
  sites2G: number;
  sites3G: number;
  sites4G: number;
  sites5G: number;
  cells2G: number;
  cells3G: number;
  cells4G: number;
  cells5G: number;
  bandMap2G: Record<string, number>;
  bandMap3G: Record<string, number>;
  bandMap4G: Record<string, number>;
  bandMap5G: Record<string, number>;
  vendorMap: Record<string, { '2G': number; '3G': number; '4G': number; '5G': number }>;
};

const EMPTY_TOPO_NETWORK_STATS: TopoNetworkStats = {
  sites2G: 0,
  sites3G: 0,
  sites4G: 0,
  sites5G: 0,
  cells2G: 0,
  cells3G: 0,
  cells4G: 0,
  cells5G: 0,
  bandMap2G: {},
  bandMap3G: {},
  bandMap4G: {},
  bandMap5G: {},
  vendorMap: {},
};

// is5GTech, is4GTech, getCellTechGroup are now imported from @/utils/telecomHelpers

const buildTopoNetworkStatsFromRows = (rows: any[]): TopoNetworkStats => {
  const stats: TopoNetworkStats = {
    ...EMPTY_TOPO_NETWORK_STATS,
    bandMap2G: {},
    bandMap3G: {},
    bandMap4G: {},
    bandMap5G: {},
    vendorMap: {},
  };

  const siteTechMap = new Map<string, { has2G: boolean; has3G: boolean; has4G: boolean; has5G: boolean }>();

  rows.forEach((row, index) => {
    const techno = row?.techno ?? row?.technology ?? row?.rat ?? null;
    const techGroup = getCellTechGroup(techno);
    if (!techGroup) return;

    const siteKey = String(
      row?.code_nidt ?? row?.nom_site ?? row?.site_name ?? row?.site_id ?? row?.site ?? `site-${index}`,
    );
    const rawBand = String(row?.bande ?? row?.band ?? 'Unknown');
    const band = normalizeBandKey(rawBand, techno) || rawBand;
    const vendor = String(row?.constructeur ?? row?.vendor ?? row?.vendor_name ?? 'Unknown');

    const siteEntry = siteTechMap.get(siteKey) ?? { has2G: false, has3G: false, has4G: false, has5G: false };

    if (techGroup === '5G') { stats.cells5G += 1; stats.bandMap5G[band] = (stats.bandMap5G[band] || 0) + 1; siteEntry.has5G = true; }
    else if (techGroup === '4G') { stats.cells4G += 1; stats.bandMap4G[band] = (stats.bandMap4G[band] || 0) + 1; siteEntry.has4G = true; }
    else if (techGroup === '3G') { stats.cells3G += 1; stats.bandMap3G[band] = (stats.bandMap3G[band] || 0) + 1; siteEntry.has3G = true; }
    else if (techGroup === '2G') { stats.cells2G += 1; stats.bandMap2G[band] = (stats.bandMap2G[band] || 0) + 1; siteEntry.has2G = true; }

    const normalizedVendor = (() => {
      const v = vendor.trim().toUpperCase();
      if (v.includes('ERICSSON')) return 'Ericsson';
      if (v.includes('NOKIA') || v === 'NSN') return 'Nokia';
      if (v.includes('HUAWEI')) return 'Huawei';
      if (v.includes('SAMSUNG')) return 'Samsung';
      if (v.includes('ALCATEL') || v.includes('ALU')) return 'Alcatel';
      if (v === 'UNKNOWN' || v === 'INDEFINI' || v === 'INDÉFINI' || !v) return 'Indéfini';
      return vendor.charAt(0).toUpperCase() + vendor.slice(1).toLowerCase();
    })();
    if (!stats.vendorMap[normalizedVendor]) {
      stats.vendorMap[normalizedVendor] = { '2G': 0, '3G': 0, '4G': 0, '5G': 0 };
    }
    stats.vendorMap[normalizedVendor][techGroup] += 1;

    siteTechMap.set(siteKey, siteEntry);
  });

  siteTechMap.forEach(({ has2G, has3G, has4G, has5G }) => {
    if (has2G) stats.sites2G += 1;
    if (has3G) stats.sites3G += 1;
    if (has4G) stats.sites4G += 1;
    if (has5G) stats.sites5G += 1;
  });

  return stats;
};

const normalizeBandKey = (bande: string, techno?: string): keyof typeof DEFAULT_BAND_COLORS | null => {
  if (!bande) return null;
  // Strip whitespace, underscores, dashes and MHZ suffix so "NR_700", "NR-700", "NR 700 MHz" all collapse to "NR700"
  const normalized = bande.replace(/[\s_\-]+/g, '').replace(/MHZ/gi, '').toUpperCase();
  const is5G = (techno || '').toUpperCase().includes('5G') || /(^|[^A-Z])NR\d/.test(normalized) || /^N\d+$/i.test(normalized);

  // 2G bands — check first (exact match before generic frequency checks)
  if (normalized.includes('GSM900') || (normalized.includes('900') && (techno || '').includes('2G'))) return 'GSM900' as any;
  if (normalized.includes('GSM1800') || normalized.includes('DCS1800') || (normalized.includes('1800') && (techno || '').includes('2G'))) return 'GSM1800' as any;

  // 3G bands — check before generic 2100/900
  if (normalized.includes('UMTS2100') || normalized.includes('WCDMA2100') || (normalized.includes('2100') && (techno || '').includes('3G'))) return 'UMTS2100' as any;
  if (normalized.includes('UMTS900') || normalized.includes('WCDMA900') || (normalized.includes('900') && (techno || '').includes('3G'))) return 'UMTS900' as any;

  // 5G bands — must run before 4G fallback so "NR700" isn't misclassified as "L700"
  if (normalized.includes('3500') || normalized.includes('NR3500') || normalized.includes('N78')) return 'NR3500';
  if (normalized.includes('NR2100') || normalized === 'N1') return 'NR2100';
  if (normalized.includes('NR700') || normalized === 'N28') return 'NR700';
  // 5G fallback by techno: any NR cell on 700/2100/3500 frequency
  if (is5G) {
    if (normalized.includes('700')) return 'NR700';
    if (normalized.includes('2100')) return 'NR2100';
    if (normalized.includes('3500')) return 'NR3500';
  }

  // 4G bands
  if (normalized.includes('2600') || normalized.includes('L2600') || normalized.includes('B7')) return 'L2600';
  if (normalized.includes('1800') || normalized.includes('L1800') || normalized.includes('B3')) return 'L1800';
  if (normalized.includes('2100') || normalized.includes('L2100') || normalized === 'B1') return 'L2100';
  if (normalized.includes('800') || normalized.includes('L800') || normalized.includes('B20')) return 'L800';
  if (normalized.includes('700') || normalized.includes('L700') || normalized === 'B28') return 'L700';
  if (normalized.includes('900') || normalized.includes('L900') || normalized.includes('B8')) return 'L900' as any;

  return null;
};

// These will be replaced by component-level functions that use state
// Placeholder kept for module-level usage (e.g. initial state)
const getStaticBandColor = (bande: string, techno?: string): string => {
  const key = normalizeBandKey(bande, techno);
  if (!key) return '#94a3b8';
  return DEFAULT_BAND_COLORS[key];
};

// Compute meters-per-pixel at a given latitude and zoom level
const metersPerPixel = (lat: number, zoom: number): number => {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
};

// Sector radius in meters — adaptive to zoom, density, and viewport
const getZoomAwareRadius = (
  lat: number,
  zoom: number,
  densityFactor: number = 1, // 0..1 — only used at zoom < 12
  viewportWidth: number = 1400, // CSS px
): number => {
  // Geographic-space radius in meters.
  // Zoom 13 = max VISUAL size. Beyond Z13, the meter radius shrinks
  // inversely with zoom so the beam covers the same pixel footprint.
  //
  // Because beams are geographic polygons, a fixed meter radius covers
  // 2× more pixels each zoom level. To freeze visual size at Z13:
  //   finalRadius = baseRadius(13) / 2^(zoom - 13)

  const CAP_ZOOM = 13;
  const effectiveZoom = Math.min(zoom, CAP_ZOOM);
  let baseMeters: number;
  if (effectiveZoom <= 9)  baseMeters = 150;
  else if (effectiveZoom <= 10) baseMeters = 200;
  else if (effectiveZoom <= 11) baseMeters = 240;
  else if (effectiveZoom <= 12) baseMeters = 260;
  else baseMeters = 280; // Z13 — reduced to avoid overlap in dense urban areas

  // Density scaling: ONLY at low zoom (overview mode).
  // At zoom 12+, all sites get the same radius — no per-site variation.
  if (zoom < 12) {
    const densityScale = 0.35 + 0.65 * Math.max(0, Math.min(1, densityFactor));
    baseMeters *= densityScale;
  }

  // Inverse-zoom compensation: shrink meter radius so visual size stays constant beyond Z13.
  // Apply a slight boost at high zoom for better readability:
  //   Z14 → 1.10×, Z15+ → 1.20× the Z13 visual size.
  if (zoom > CAP_ZOOM) {
    const boost = zoom === 14 ? 1.10 : 1.20;
    baseMeters = (baseMeters * boost) / Math.pow(2, zoom - CAP_ZOOM);
  }

  return Math.max(1, baseMeters);
};

const inferSiteTechState = (site: SiteSummary): { has2G: boolean; has3G: boolean; has4G: boolean; has5G: boolean } => {
  if (site.cells.length > 0) {
    const has5G = site.cells.some(cell => is5GTech(cell.techno));
    const has4G = site.cells.some(cell => is4GTech(cell.techno));
    const has3G = site.cells.some(cell => is3GTech(cell.techno));
    const has2G = site.cells.some(cell => is2GTech(cell.techno));
    return { has2G, has3G, has4G, has5G };
  }

  const nrCells = Number(site.nr_cells || 0);
  const lteCells = Number(site.lte_cells || 0);
  const cells3g = Number((site as any).cells_3g || 0);
  const cells2g = Number((site as any).cells_2g || 0);
  if (nrCells > 0 || lteCells > 0 || cells3g > 0 || cells2g > 0) {
    return { has2G: cells2g > 0, has3G: cells3g > 0, has4G: lteCells > 0, has5G: nrCells > 0 };
  }

  const fallbackTech = String(site.techno || '').toUpperCase();
  let has5G = is5GTech(fallbackTech);
  let has4G = is4GTech(fallbackTech);
  let has3G = is3GTech(fallbackTech);
  let has2G = is2GTech(fallbackTech);

  const bande = String((site as any).bande || '').toUpperCase();
  if (bande.includes('NR') || bande.includes('N78') || bande.includes('N28') || bande.includes('N1')) has5G = true;
  if (bande.includes('UMTS') || bande.includes('WCDMA')) has3G = true;
  if (bande.includes('GSM')) has2G = true;
  if (bande.includes('L') || bande.includes('B') || bande.includes('1800') || bande.includes('2600') || bande.includes('800') || bande.includes('700')) {
    if (!bande.includes('NR')) has4G = true;
  }

  if (!has2G && !has3G && !has4G && !has5G) return { has2G: false, has3G: false, has4G: false, has5G: false };

  return { has2G, has3G, has4G, has5G };
};

const siteMatchesRequestedTech = (site: SiteSummary, tech: TechGroup): boolean => {
  const { has2G, has3G, has4G, has5G } = inferSiteTechState(site);
  if (tech === '5G') return has5G;
  if (tech === '4G') return has4G;
  if (tech === '3G') return has3G;
  if (tech === '2G') return has2G;
  return false;
};

// getCellTechGroup is now imported from @/utils/telecomHelpers

const getValidSectorAzimuths = (site: SiteSummary): number[] => {
  const azimuths = new Set<number>();

  site.cells.forEach((cell) => {
    const az = Number(cell.azimut);
    if (Number.isFinite(az) && az >= 0 && az <= 360) {
      azimuths.add(az);
    }
  });

  return Array.from(azimuths).sort((a, b) => a - b);
};

// Generate sector polygon points (wedge shape)
const getSectorCoords = (
  center: [number, number],
  azimuth: number,
  radiusMeters: number = 300,
  aperture: number = 65
): [number, number][] => {
  const steps = 20;
  const startAngle = azimuth - aperture / 2;
  const endAngle = azimuth + aperture / 2;
  const points: [number, number][] = [center];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle - 90) * (Math.PI / 180);
    const dlat = (radiusMeters / 111320) * Math.cos(rad);
    const dlng = (radiusMeters / (111320 * Math.cos(center[0] * Math.PI / 180))) * Math.sin(rad);
    points.push([center[0] + dlat, center[1] + dlng]);
  }
  points.push(center);
  return points;
};

/** Helper: defensively split a possibly-CSV string ("LTE800, LTE1800") into a clean list. */
const splitMaybeCsv = (raw: unknown): string[] => {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const v of arr) {
    if (v == null) continue;
    String(v).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
  }
  return [...new Set(out)];
};

const getSiteDisplayBands = (site: SiteSummary): string[] => {
  // Prefer cells (already filtered by active dashboard band/techno filters)
  const cellBands = site.cells.length > 0
    ? [...new Set(site.cells.map(c => String(c.bande || '').trim()).filter(Boolean))]
    : [];

  if (cellBands.length > 0) return cellBands;

  // Fallback: parsed array from backend (already CSV-split by topoService)
  if (Array.isArray((site as any).bandes) && (site as any).bandes.length > 0) {
    return (site as any).bandes as string[];
  }

  // Last-resort: legacy single `bande` field (may be CSV-mangled — split defensively)
  return splitMaybeCsv((site as any).bande);
};

const getSiteDisplayTechs = (site: SiteSummary): string[] => {
  // Prefer cells (already filtered by active dashboard band/techno filters)
  const cellTechs = site.cells.length > 0
    ? [...new Set(site.cells.map(c => String(c.techno || '').trim()).filter(Boolean))]
    : [];

  if (cellTechs.length > 0) return cellTechs;

  // Backend-provided technos array (parsed)
  const backendTechs = splitMaybeCsv((site as any).technos);
  if (backendTechs.length > 0) return [...new Set(backendTechs)];

  const fallback: string[] = [];
  const siteTech = String(site.techno || '').trim();
  if (siteTech) fallback.push(siteTech);

  const { has2G, has3G, has4G, has5G } = inferSiteTechState(site);
  if (!siteTech) {
    if (has2G) fallback.push('2G');
    if (has3G) fallback.push('3G');
    if (has4G) fallback.push('4G');
    if (has5G) fallback.push('5G');
  }

  return [...new Set(fallback.filter(Boolean))];
};

const buildSyntheticRenderCells = (site: SiteSummary): CellProperties[] => {
  if (site.cells.length > 0) return site.cells;

  const azimuths = [0, 120, 240];
  const techState = inferSiteTechState(site);
  const normalizedBands = [...new Set(
    getSiteDisplayBands(site)
      .map((band) => {
        const raw = String(band || '').trim();
        if (!raw) return null;
        const inferredTech = /^(NR|N\d|5G)/i.test(raw)
          ? '5G'
          : /^(UMTS|WCDMA|3G)/i.test(raw)
            ? '3G'
            : /^(GSM|2G)/i.test(raw)
              ? '2G'
              : '4G';
        return normalizeBandKey(raw, inferredTech) || raw.toUpperCase().replace(/\s+/g, '');
      })
      .filter(Boolean)
  )] as string[];

  const bands4G = normalizedBands.filter((b) => /^L\d/.test(b));
  const bands5G = normalizedBands.filter((b) => /^NR/.test(b));
  const bands3G = normalizedBands.filter((b) => /^UMTS/.test(b));
  const bands2G = normalizedBands.filter((b) => /^GSM/.test(b));

  const synthetic: CellProperties[] = [];
  const pushCells = (
    tech: '2G' | '3G' | '4G' | '5G',
    isPresent: boolean,
    actualBands: string[],
    fallbackBands: string[],
  ) => {
    if (!isPresent) return;
    const bandsToUse = actualBands.length > 0 ? actualBands : fallbackBands;
    for (let sectorIndex = 0; sectorIndex < azimuths.length; sectorIndex++) {
      for (const band of bandsToUse) {
        synthetic.push({
          cell_id: `${site.site_id}_${tech}_S${sectorIndex + 1}_${band}`,
          techno: tech,
          bande: band,
          azimut: azimuths[sectorIndex],
          hba: 30,
          tilt: null,
          qoe_score_avg: site.qoe_score_avg ?? 0,
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
        });
      }
    }
  };

  pushCells('2G', techState.has2G || Number((site as any).cells_2g || 0) > 0, bands2G, ['GSM900']);
  pushCells('3G', techState.has3G || Number((site as any).cells_3g || 0) > 0, bands3G, ['UMTS2100']);
  pushCells('4G', techState.has4G || Number(site.lte_cells || 0) > 0, bands4G, ['L800', 'L1800', 'L2100']);
  pushCells('5G', techState.has5G || Number(site.nr_cells || 0) > 0, bands5G, ['NR3500', 'NR700']);

  return synthetic;
};

/**
 * Cell count consistent with current filters:
 * use loaded `cells.length` when available, else fall back to backend count.
 */
const getSiteDisplayCellCount = (site: SiteSummary): number => {
  if (site.cells && site.cells.length > 0) return site.cells.length;
  return site.cell_count || 0;
};

const getRenderableCellsForSite = (
  site: SiteSummary,
  mapTechnoFilter: 'ALL' | '2G' | '3G' | '4G' | '5G' | 'OFF',
  enabledTechnos: Set<TechGroup>,
  isBandEnabled: (bande?: string | null, techno?: string | null) => boolean,
  dashboardBandFilter?: string[] | null,
  dashboardTechnoFilter?: string[] | null,
) => {
  if (!site.cells?.length || mapTechnoFilter === 'OFF') return [];

  // Normalize dashboard filters (case-insensitive set lookup)
  // Expand the set to include both raw and normalized keys (LTE1800 ↔ L1800 ↔ B3).
  const dashBandsRaw = dashboardBandFilter && dashboardBandFilter.length > 0
    ? dashboardBandFilter.map(b => String(b).trim().toUpperCase())
    : null;
  const dashBands = dashBandsRaw
    ? new Set([...dashBandsRaw, ...dashBandsRaw.map(b => normalizeBandKey(b) || b)])
    : null;
  const dashTechs = dashboardTechnoFilter && dashboardTechnoFilter.length > 0
    ? new Set(dashboardTechnoFilter.map(t => String(t).trim().toUpperCase()))
    : null;

  return site.cells.filter(cell => {
    const techGroup = getCellTechGroup(cell.techno);
    if (!techGroup) return false;

    if (mapTechnoFilter === 'ALL') {
      if (!enabledTechnos.has(techGroup)) return false;
    } else if (techGroup !== mapTechnoFilter) {
      return false;
    }

    // Active dashboard band filter — strict perimeter (e.g. Rennes_L1800 → only LTE1800)
    // Normalize both sides via normalizeBandKey so VPS values like "LTE1800" match dashboard codes like "L1800".
    if (dashBands) {
      const rawCellBand = String(cell.bande || '').trim().toUpperCase();
      const normalizedCellBand = normalizeBandKey(cell.bande || '', cell.techno) || rawCellBand;
      // If the cell has no band info at all, don't drop it solely on the band check —
      // rely on the techno filter below. Otherwise, require a match (raw or normalized).
      if (rawCellBand && !dashBands.has(rawCellBand) && !dashBands.has(normalizedCellBand)) {
        return false;
      }
    }
    // Active dashboard techno filter
    if (dashTechs) {
      const cellTech = String(cell.techno || '').trim().toUpperCase();
      const groupUpper = String(techGroup).toUpperCase();
      if (!dashTechs.has(cellTech) && !dashTechs.has(groupUpper)) return false;
    }

    return isBandEnabled(cell.bande, cell.techno);
  });
};

const isCellVisibleForKpiOverlay = (
  cell: CellProperties,
  kpiTechnoFilter: '4G' | '5G',
  enabledTechnos: Set<TechGroup>,
  isBandEnabled: (bande?: string | null, techno?: string | null) => boolean,
  dashboardBandFilter?: string[] | null,
  dashboardTechnoFilter?: string[] | null,
  localTechno: string = 'ALL',
  localBande: string = 'ALL',
  kpiVendorFilter?: string | null,
  siteVendor?: string | null,
) => {
  // Auto-hide sites whose vendor doesn't match the KPI's vendor
  if (kpiVendorFilter && siteVendor && siteVendor.toLowerCase() !== kpiVendorFilter.toLowerCase()) return false;
  const techGroup = getCellTechGroup(cell.techno);
  if (!techGroup) return false;
  // No hard techno filter — show all techs that have KPI data. Vendor guard handles cross-vendor.
  if (!enabledTechnos.has(techGroup)) return false;
  if (localTechno !== 'ALL' && techGroup !== localTechno) return false;
  if (localBande !== 'ALL' && cell.bande !== localBande) return false;

  const dashBandsRaw = dashboardBandFilter && dashboardBandFilter.length > 0
    ? dashboardBandFilter.map(b => String(b).trim().toUpperCase())
    : null;
  const dashBands = dashBandsRaw
    ? new Set([...dashBandsRaw, ...dashBandsRaw.map(b => normalizeBandKey(b) || b)])
    : null;
  const dashTechs = dashboardTechnoFilter && dashboardTechnoFilter.length > 0
    ? new Set(dashboardTechnoFilter.map(t => String(t).trim().toUpperCase()))
    : null;

  if (dashBands) {
    const rawCellBand = String(cell.bande || '').trim().toUpperCase();
    const normalizedCellBand = normalizeBandKey(cell.bande || '', cell.techno) || rawCellBand;
    if (rawCellBand && !dashBands.has(rawCellBand) && !dashBands.has(normalizedCellBand)) {
      return false;
    }
  }

  if (dashTechs) {
    const cellTech = String(cell.techno || '').trim().toUpperCase();
    const groupUpper = String(techGroup).toUpperCase();
    if (!dashTechs.has(cellTech) && !dashTechs.has(groupUpper)) return false;
  }

  return isBandEnabled(cell.bande, cell.techno);
};

/** Build label text for a site based on selected label fields */
const buildSiteLabel = (site: SiteSummary, fields: Set<string>): string => {
  if (fields.size === 0) return '';

  const parts: string[] = [];
  const displayBands = getSiteDisplayBands(site);
  const displayTechs = getSiteDisplayTechs(site);

  if (fields.has('site_name') && site.site_name) {
    parts.push(site.site_name);
  }

  if (fields.has('cell_name') && site.cells.length > 0) {
    const names = site.cells.slice(0, 3).map(c => c.cell_id).filter(Boolean).join(', ');
    if (names) parts.push(names + (site.cells.length > 3 ? '…' : ''));
  }

  if (fields.has('pci') && site.cells.length > 0) {
    const pcis = [...new Set(site.cells.map(c => (c as any).pci).filter(Boolean))].slice(0, 4);
    if (pcis.length > 0) parts.push('PCI: ' + pcis.join(','));
  }

  if (fields.has('azimut') && site.cells.length > 0) {
    const azs = [...new Set(site.cells.map(c => c.azimut).filter(a => a != null))].sort((a, b) => a - b);
    if (azs.length > 0) parts.push('Az: ' + azs.join('°,') + '°');
  }

  if (fields.has('bande') && displayBands.length > 0) {
    parts.push(displayBands.join(','));
  }

  if (fields.has('techno') && displayTechs.length > 0) {
    parts.push(displayTechs.join(','));
  }

  return parts.join(' · ');
};


const FlyToSite = ({
  coords,
  onFlyStart,
  onFlyEnd,
  onDone,
}: {
  coords: [number, number] | null;
  onFlyStart?: () => void;
  onFlyEnd?: () => void;
  onDone?: () => void;
}) => {
  const map = useMap();
  const onFlyStartRef = useRef(onFlyStart);
  const onFlyEndRef = useRef(onFlyEnd);
  const onDoneRef = useRef(onDone);
  onFlyStartRef.current = onFlyStart;
  onFlyEndRef.current = onFlyEnd;
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!coords || !isFinite(coords[0]) || !isFinite(coords[1])) return;

    const currentZoom = map.getZoom();
    // Always ensure a close zoom so sectors/markers are visible after fly
    const MIN_SITE_ZOOM = 15;
    const targetZoom = Math.max(currentZoom, MIN_SITE_ZOOM);
    const currentCenter = map.getCenter();
    const dist = map.distance(currentCenter, coords);

    onFlyStartRef.current?.();

    const handler = () => {
      onFlyEndRef.current?.();
      onDoneRef.current?.();
    };

    if (dist < 300 && Math.abs(currentZoom - targetZoom) < 1) {
      // Very close — gentle pan only
      map.panTo(coords, { duration: 0.4, animate: true });
      map.once('moveend', handler);
      return () => { map.off('moveend', handler); };
    }

    if (dist < 10000 && Math.abs(currentZoom - targetZoom) < 3) {
      // Nearby — smooth pan with optional zoom adjust
      if (Math.abs(currentZoom - targetZoom) < 1) {
        map.panTo(coords, { duration: 0.6, animate: true });
      } else {
        map.flyTo(coords, targetZoom, { duration: 1.0 });
      }
      map.once('moveend', handler);
      return () => { map.off('moveend', handler); };
    }

    // Far away — instant jump to avoid Leaflet zooming out through intermediate regions
    if (dist > 100000) {
      map.setView(coords, targetZoom, { animate: false });
      setTimeout(handler, 50);
      return () => {};
    }
    const flyDuration = dist > 50000 ? 1.4 : 1.0;
    map.flyTo(coords, targetZoom, { duration: flyDuration });
    map.once('moveend', handler);

    return () => { map.off('moveend', handler); };
  }, [coords, map]);

  return null;
};

// Create custom panes for 4G/5G layering
const TechPanes: React.FC = () => {
  const map = useMap();
  // Use useLayoutEffect to create panes BEFORE first paint — ensures 5G is always on top from the start
  useLayoutEffect(() => {
    if (!map.getPane('pane2G')) {
      const p2 = map.createPane('pane2G');
      p2.style.zIndex = '300';
    }
    if (!map.getPane('pane3G')) {
      const p3 = map.createPane('pane3G');
      p3.style.zIndex = '350';
    }
    if (!map.getPane('pane4G')) {
      const p4 = map.createPane('pane4G');
      p4.style.zIndex = '400';
    }
    if (!map.getPane('pane5G')) {
      const p5 = map.createPane('pane5G');
      p5.style.zIndex = '500';
    }
    if (!map.getPane('paneParam')) {
      const pp = map.createPane('paneParam');
      pp.style.zIndex = '650';
    }
  }, [map]);
  return null;
};

// LOS MapClickHandler
const LOSMapClickHandler: React.FC<{ onMapClick: (latlng: LatLng) => void; drawing: boolean }> = ({ onMapClick, drawing }) => {
  useMapEvents({
    click(e) {
      if (drawing) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

// ── Custom Point type ──
export interface CustomMapPoint {
  id: string;
  name: string;
  type: 'custom_point';
  lat: number;
  lon: number;
  x?: number;
  y?: number;
  createdAt: string;
}

// ── Tagged Polygon type ──
export interface TaggedPolygon {
  id: string;
  name: string;
  type: 'tagged_polygon';
  /** Polygon vertices as [lat, lng] pairs */
  points: [number, number][];
  /** Cached centroid for "fly to" actions */
  center: [number, number];
  /** Pre-computed display strings (km², km) — pure presentation */
  fmtArea?: string;
  fmtPerimeter?: string;
  sitesInside?: number;
  cellsInside?: number;
  createdAt: string;
  /** When the polygon represents a radius circle, keep its geometry so we
   *  can re-render the concentric km rings + labels permanently. */
  circleCenter?: [number, number];
  circleRadiusM?: number;
}

const CUSTOM_POINTS_KEY = 'osmosis_custom_points';
const TAGGED_SITES_KEY = 'osmosis_tagged_sites';
const TAGGED_POLYGONS_KEY = 'osmosis_tagged_polygons';

function scopedStorageKey(base: string, dashboardId?: string | null): string | null {
  // When no dashboard is active (non-dashboard mode), fall back to a global scope
  // so tagging / custom points / polygons still persist.
  if (!dashboardId) return `${base}__global`;
  return `${base}__db_${dashboardId}`;
}

function loadCustomPoints(dashboardId?: string | null): CustomMapPoint[] {
  const key = scopedStorageKey(CUSTOM_POINTS_KEY, dashboardId);
  if (!key) return [];
  try {
    const saved = localStorage.getItem(key);
    const pts: CustomMapPoint[] = saved ? JSON.parse(saved) : [];
    return pts.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && (p.lat !== 0 || p.lon !== 0));
  } catch { return []; }
}

function persistCustomPoints(points: CustomMapPoint[], dashboardId?: string | null) {
  const key = scopedStorageKey(CUSTOM_POINTS_KEY, dashboardId);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(points)); } catch {}
}

function loadTaggedSitesScoped(dashboardId?: string | null): SiteSummary[] {
  const key = scopedStorageKey(TAGGED_SITES_KEY, dashboardId);
  if (!key) return [];
  try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : []; } catch { return []; }
}

function persistTaggedSitesScoped(sites: SiteSummary[], dashboardId?: string | null) {
  const key = scopedStorageKey(TAGGED_SITES_KEY, dashboardId);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(sites)); } catch {}
}

function loadTaggedPolygons(dashboardId?: string | null): TaggedPolygon[] {
  const key = scopedStorageKey(TAGGED_POLYGONS_KEY, dashboardId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const arr: TaggedPolygon[] = raw ? JSON.parse(raw) : [];
    return arr
      .filter(p => Array.isArray(p.points) && p.points.length >= 3)
      .map(p => {
        // Backfill circle metadata for legacy "Cercle …" entries saved before
        // we started persisting circleCenter/circleRadiusM, so concentric km
        // rings + labels are restored on reload.
        if (p.circleCenter && typeof p.circleRadiusM === 'number' && p.circleRadiusM > 0) return p;
        const looksLikeCircle = typeof p.name === 'string' && /^cercle\b/i.test(p.name) && p.points.length >= 24 && Array.isArray(p.center);
        if (!looksLikeCircle) return p;
        const [cLat, cLng] = p.center;
        // Mean haversine distance from center to vertices ≈ radius (meters).
        const R = 6371000;
        let sum = 0;
        for (const [lat, lng] of p.points) {
          const dLat = (lat - cLat) * Math.PI / 180;
          const dLng = (lng - cLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(cLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          sum += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
        }
        const radiusM = sum / p.points.length;
        if (!Number.isFinite(radiusM) || radiusM <= 0) return p;
        return { ...p, circleCenter: p.center, circleRadiusM: radiusM };
      });
  } catch { return []; }
}

function persistTaggedPolygons(polys: TaggedPolygon[], dashboardId?: string | null) {
  const key = scopedStorageKey(TAGGED_POLYGONS_KEY, dashboardId);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(polys)); } catch {}
}

function purgeDashboardArtifacts(dashboardId: string) {
  try {
    localStorage.removeItem(scopedStorageKey(CUSTOM_POINTS_KEY, dashboardId)!);
    localStorage.removeItem(scopedStorageKey(TAGGED_SITES_KEY, dashboardId)!);
    localStorage.removeItem(scopedStorageKey(TAGGED_POLYGONS_KEY, dashboardId)!);
    localStorage.removeItem(`osmosis_tagged_links__db_${dashboardId}`);
  } catch {}
}

/** One-shot purge of legacy global artifact keys (run once on app load). */
function purgeLegacyArtifacts() {
  const FLAG = 'osmosis_artifacts_legacy_purged_v1';
  if (localStorage.getItem(FLAG)) return;
  try {
    localStorage.removeItem(CUSTOM_POINTS_KEY);
    localStorage.removeItem(TAGGED_SITES_KEY);
    localStorage.removeItem(TAGGED_POLYGONS_KEY);
    localStorage.removeItem('osmosis_tagged_links');
    localStorage.setItem(FLAG, '1');
  } catch {}
}

// Map click handler for custom point creation
const CustomPointClickHandler: React.FC<{ active: boolean; onAdd: (lat: number, lon: number) => void }> = ({ active, onAdd }) => {
  useMapEvents({
    click(e) {
      if (active) onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const DistanceMeasureClickHandler: React.FC<{
  active: boolean;
  onPick: (latlng: LatLng) => void;
  onMouseMove?: (latlng: [number, number]) => void;
}> = ({ active, onPick, onMouseMove }) => {
  useMapEvents({
    click(e) {
      if (active) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mousemove(e) {
      if (active && onMouseMove) onMouseMove([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

const RadiusClickHandler: React.FC<{
  active: boolean;
  center: [number, number] | null;
  confirmed: boolean;
  onSetCenter: (latlng: LatLng) => void;
  onConfirm: (radiusM: number) => void;
  onPreview: (radiusM: number) => void;
}> = ({ active, center, confirmed, onSetCenter, onConfirm, onPreview }) => {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!active) return;
      if (!center || confirmed) {
        onSetCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else {
        const dist = map.distance(L.latLng(center[0], center[1]), e.latlng);
        onConfirm(dist);
      }
    },
    mousemove(e) {
      if (!active || !center || confirmed) return;
      const dist = map.distance(L.latLng(center[0], center[1]), e.latlng);
      onPreview(dist);
    },
  });
  return null;
};

const PolygonClickHandler: React.FC<{ active: boolean; closed: boolean; onPick: (latlng: LatLng) => void; onClose: () => void }> = ({ active, closed, onPick, onClose }) => {
  useMapEvents({
    click(e) {
      if (active && !closed) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    dblclick(e) {
      if (active && !closed) {
        e.originalEvent.preventDefault();
        onClose();
      }
    },
  });
  return null;
};

// Zoom-area selection handler — click+drag rectangle then fitBounds
const ZoomAreaHandler: React.FC<{
  active: boolean;
  onStart: (latlng: [number, number]) => void;
  onMove: (latlng: [number, number]) => void;
  onEnd: (bounds: L.LatLngBoundsExpression) => void;
  onCancel: () => void;
}> = ({ active, onStart, onMove, onEnd, onCancel }) => {
  const map = useMap();
  const dragging = useRef(false);
  const origin = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    container.style.cursor = 'crosshair';
    // Disable map dragging while tool is active
    map.dragging.disable();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragging.current = false;
        origin.current = null;
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      container.style.cursor = '';
      map.dragging.enable();
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, map, onCancel]);

  useMapEvents({
    mousedown(e) {
      if (!active) return;
      (e as any).originalEvent?.preventDefault?.();
      dragging.current = true;
      origin.current = [e.latlng.lat, e.latlng.lng];
      onStart([e.latlng.lat, e.latlng.lng]);
    },
    mousemove(e) {
      if (!active || !dragging.current) return;
      onMove([e.latlng.lat, e.latlng.lng]);
    },
    mouseup(e) {
      if (!active || !dragging.current || !origin.current) return;
      dragging.current = false;
      const [oLat, oLng] = origin.current;
      const eLat = e.latlng.lat;
      const eLng = e.latlng.lng;
      // Minimum drag threshold (~20px worth of degrees at current zoom)
      const minSpan = 0.001;
      if (Math.abs(eLat - oLat) < minSpan && Math.abs(eLng - oLng) < minSpan) {
        onCancel();
        return;
      }
      const sw = L.latLng(Math.min(oLat, eLat), Math.min(oLng, eLng));
      const ne = L.latLng(Math.max(oLat, eLat), Math.max(oLng, eLng));
      const bounds = L.latLngBounds(sw, ne);
      map.fitBounds(bounds, { animate: true, duration: 0.6, padding: [20, 20] });
      onEnd(bounds);
      origin.current = null;
    },
  });
  return null;
};

const losTargetIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:hsl(0,84%,60%);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Auto-fit disabled by user request — keep components as no-ops to preserve refs/props
const FitHighlightBounds = ({ coords: _coords }: { coords: [number, number][] }) => {
  return null;
};

const FitToDashboardSites: React.FC<{ sites: SiteSummary[]; fitKey: number }> = ({ sites, fitKey }) => {
  const map = useMap();
  const lastFitRef = useRef<number>(0);
  useEffect(() => {
    if (fitKey === 0 || fitKey === lastFitRef.current) return;
    if (!sites || sites.length === 0) return;
    const coords = sites
      .map(s => s.coordinates)
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (coords.length === 0) return;
    lastFitRef.current = fitKey;
    if (coords.length === 1) {
      map.flyTo(coords[0] as [number, number], 12, { duration: 0.8 });
      return;
    }
    // Compute median center to avoid outlier sites pulling the view away
    const lats = coords.map(c => c[0]).sort((a, b) => a - b);
    const lngs = coords.map(c => c[1]).sort((a, b) => a - b);
    const medLat = lats[Math.floor(lats.length / 2)];
    const medLng = lngs[Math.floor(lngs.length / 2)];
    map.setView([medLat, medLng], 12, { animate: true });
  }, [sites, fitKey, map]);
  return null;
};

const TopoFranceViewportReset = ({ enabled: _enabled, resetKey: _resetKey }: { enabled: boolean; resetKey: string }) => {
  const map = useMap();
  // Only invalidate size on mount so map renders correctly; do NOT auto-setView/zoom.
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const MapVisibilitySync = ({ active }: { active: boolean }) => {
  const map = useMap();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      map.invalidateSize();
    };

    const raf1 = requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });

    const t1 = window.setTimeout(sync, 120);
    const t2 = window.setTimeout(sync, 320);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, map]);

  return null;
};

// Custom Zoom Control — top-right, glassmorphism style
const CustomZoomControl: React.FC = () => {
  const map = useMap();
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-1">
      <button
        onClick={() => map.zoomIn()}
        className="w-9 h-9 flex items-center justify-center rounded-t-xl bg-card/90 backdrop-blur-md border border-border shadow-lg hover:bg-accent text-foreground transition-all"
        aria-label="Zoom in"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-9 h-9 flex items-center justify-center rounded-b-xl bg-card/90 backdrop-blur-md border border-border border-t-0 shadow-lg hover:bg-accent text-foreground transition-all"
        aria-label="Zoom out"
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
};
  

interface ViewportState {
  bounds: L.LatLngBounds | null;
  zoom: number;
}

const MapViewportTracker = ({ onViewportChange }: { onViewportChange: (v: ViewportState) => void }) => {
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const map = useMapEvents({
    moveend: () => {
      onViewportChangeRef.current({
        bounds: map.getBounds(),
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    onViewportChangeRef.current({
      bounds: map.getBounds(),
      zoom: map.getZoom(),
    });
  }, [map]);

  return null;
};

// Create a custom cluster icon with site count
const createClusterCustomIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count > 100 ? 40 : count > 30 ? 34 : count > 10 ? 28 : 22;
  return L.divIcon({
    html: `<div style="
      background: hsl(220 60% 30%);
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      border: 2px solid hsl(var(--background));
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: ${size > 30 ? 11 : 9}px; font-weight: 800;
      letter-spacing: -0.03em;
    ">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size, true),
  });
};

// Antenna site marker icon — clean engineering look
const createSiteIcon = (color: string) => {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20V10"/>
        <path d="M18 6l-6 4-6-4"/>
        <path d="M6 6l6-4 6 4"/>
        <circle cx="12" cy="10" r="1.5" fill="${color}" stroke="none"/>
      </svg>
    </div>`,
    className: 'site-antenna-icon',
    iconSize: L.point(18, 18),
    iconAnchor: L.point(9, 9),
  });
};

// ── Extracted settings panel component (stable identity, no remount on parent re-render) ──
const SETTINGS_MAP_STYLES = [
  { label: 'Street', value: 'street', icon: '🗺️' },
  { label: 'Satellite', value: 'satellite', icon: '🛰️' },
  { label: 'Hybrid', value: 'hybrid', icon: '🌐' },
  { label: 'Terrain', value: 'terrain', icon: '⛰️' },
];
const SETTINGS_THEME_MODES = [
  { label: 'Light', value: 'light', icon: '☀️' },
  { label: 'Dark', value: 'dark', icon: '🌙' },
];
const SETTINGS_KPI_OPTIONS = [
  { label: 'QoE Score', value: 'qoe_score_avg' },
  { label: 'DMS DL 3M', value: 'dms_dl_3' },
  { label: 'DMS DL 8M', value: 'dms_dl_8' },
  { label: 'DMS DL 30M', value: 'dms_dl_30' },
  { label: 'DMS UL 3M', value: 'dms_ul_3' },
  { label: 'Throughput DL', value: 'p50_thr_dn_mbps' },
  { label: 'Throughput UL', value: 'p50_thr_up_mbps' },
  { label: 'RTT P95', value: 'p95_rtt_ms' },
];
const SETTINGS_PALETTE = [
  { label: 'Default', value: '' },
  { label: 'Blue', value: 'hsl(210 80% 55%)' },
  { label: 'Green', value: 'hsl(150 70% 40%)' },
  { label: 'Orange', value: 'hsl(30 90% 55%)' },
  { label: 'Red', value: 'hsl(0 75% 55%)' },
  { label: 'Purple', value: 'hsl(270 70% 55%)' },
  { label: 'Teal', value: 'hsl(180 65% 40%)' },
  { label: 'Pink', value: 'hsl(330 75% 55%)' },
];
const SETTINGS_FILTER_ATTRIBUTES = [
  { label: 'Nom Site', key: 'nom_site', icon: '🏗️', freeText: true },
  { label: 'Nom Cellule', key: 'nom_cellule', icon: '📶', freeText: true },
  { label: 'PCI', key: 'pci', icon: '🔢', freeText: true },
  { label: 'Code NIDT', key: 'code_nidt', icon: '🆔', freeText: true },
  { label: 'Vendor', key: 'vendor', icon: '🏭' },
  { label: 'Bande', key: 'bande', icon: '📡' },
  { label: 'Plaque', key: 'plaque', icon: '🗺️', freeText: true },
  { label: 'Région (UR)', key: 'region', icon: '📍', freeText: true },
  { label: 'DOR', key: 'dor', icon: '🏢', freeText: true },
  { label: 'Zone ARCEP', key: 'zone_arcep', icon: '📋' },
  { label: 'État Cellule', key: 'etat_cellule', icon: '🔋' },
  { label: 'Essentiel', key: 'essentiel', icon: '⭐' },
];
const SETTINGS_ATTR_VALUES: Record<string, string[]> = {
  vendor: ['Nokia', 'Nokia_NR', 'Ericsson', 'Huawei', 'Samsung'],
  bande: ['700', '800', '1800', '2100', '2600', 'NR700', 'NR2100', 'NR3500'],
  zone_arcep: ['ZTD', 'ZMD', 'ZPD'],
  etat_cellule: ['Active', 'Inactive', 'Maintenance'],
  essentiel: ['Oui', 'Non'],
};

const QOE_FILTER_KPIS = [
  { key: 'qoe_score_avg', label: 'Score QoE', unit: '%', icon: '🎯' },
  { key: 'p50_thr_dn_mbps', label: 'Débit DL', unit: 'Mbps', icon: '⬇️' },
  { key: 'p50_thr_up_mbps', label: 'Débit UL', unit: 'Mbps', icon: '⬆️' },
  { key: 'dms_dl_3', label: 'DMS DL ≥ 3M', unit: '%', icon: '📊' },
  { key: 'dms_dl_8', label: 'DMS DL ≥ 8M', unit: '%', icon: '📊' },
  { key: 'dms_dl_30', label: 'DMS DL ≥ 30M', unit: '%', icon: '📊' },
  { key: 'dms_ul_3', label: 'DMS UL ≥ 3M', unit: '%', icon: '📊' },
  { key: 'p95_rtt_ms', label: 'Latence RTT', unit: 'ms', icon: '⏱️' },
  { key: 'sessions', label: 'Sessions', unit: '', icon: '📱' },
  { key: 'window_full_ratio', label: 'Window Full', unit: '%', icon: '🪟' },
  { key: 'retransmission_rate', label: 'Retransmission', unit: '%', icon: '🔄' },
  { key: 'tcp_loss_rate', label: 'TCP Loss', unit: '%', icon: '⚠️' },
];

const QOE_OPERATORS = [
  { key: '>', label: '>', desc: 'Supérieur à' },
  { key: '>=', label: '≥', desc: 'Supérieur ou égal' },
  { key: '<', label: '<', desc: 'Inférieur à' },
  { key: '<=', label: '≤', desc: 'Inférieur ou égal' },
  { key: '=', label: '=', desc: 'Égal à' },
];

type FilterMode = 'topo' | 'qoe';
type FilterStepType = 'idle' | 'pick_mode' | 'pick_tech' | 'pick_attr' | 'pick_value' | 'pick_kpi' | 'pick_operator' | 'pick_threshold';

interface ViewFilter {
  mode: FilterMode;
  tech?: string;
  attribute?: string;
  value?: string;
  kpi?: string;
  operator?: string;
  threshold?: number;
}

interface DashboardSettingsPanelProps {
  settings: any;
  onUpdate: (u: Record<string, any>) => void;
  onRename?: (name: string) => void;
  currentName?: string;
  dashboardId?: string;
  isShared?: boolean;
  beamVis?: number;
  onBeamVisChange?: (v: number) => void;
  onSaveDashboard?: () => void;
  onLoadDashboard?: () => void;
  isSaving?: boolean;
  onClose: () => void;
  onActivate?: () => void;
  onSetDashboards: React.Dispatch<React.SetStateAction<any[]>>;
  backendFilterDefs?: { id: string; label: string; values: string[] }[];
  onSiteFiltersChange?: (filters: DashboardSiteFilters) => void;
}

const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({ settings, onUpdate, onRename, currentName, dashboardId, isShared, beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, onClose, onActivate, onSetDashboards, backendFilterDefs, onSiteFiltersChange }) => {
  const [localName, setLocalName] = useState(currentName || '');
  const [localMapStyle, setLocalMapStyle] = useState(settings.mapStyle || settings.mapLayer || 'street');
  const [localThemeMode, setLocalThemeMode] = useState(settings.themeMode || 'light');
  const [localColor, setLocalColor] = useState(settings.color || '');
  const [localVisibility, setLocalVisibility] = useState<boolean>(isShared ?? true);
  const [localKpis, setLocalKpis] = useState<string[]>(() => {
    if (Array.isArray(settings.mapKpis)) return settings.mapKpis;
    if (settings.mapKpi) return [settings.mapKpi];
    return ['qoe_score_avg'];
  });
  const [localDataSource, setLocalDataSource] = useState<'qoe' | 'parameters'>(settings.dataSource || 'qoe');
  const [mapLabelFields, setMapLabelFields] = useState<Set<string>>(() => new Set(settings.mapLabelFields || ['site_name']));
  const [localFilters, setLocalFilters] = useState<ViewFilter[]>(() => {
    // Migrate old format filters
    const raw = settings.viewFilters || [];
    return raw.map((f: any) => f.mode ? f : { mode: 'topo' as FilterMode, tech: f.tech, attribute: f.attribute, value: f.value });
  });
  const [filterStep, setFilterStep] = useState<FilterStepType>('idle');
  const [filterDraft, setFilterDraft] = useState<Partial<ViewFilter>>({});
  const [dirty, setDirty] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState('');
  const [kpiSearch, setKpiSearch] = useState('');
  const [thresholdInput, setThresholdInput] = useState('');
  const [localSiteFilters, setLocalSiteFilters] = useState<DashboardSiteFilters>(() => settings.siteFilters || {});

  const commitFilter = (val?: string) => {
    let newFilters = localFilters;
    if (filterDraft.mode === 'topo' && filterDraft.tech && filterDraft.attribute) {
      newFilters = [...localFilters, { mode: 'topo', tech: filterDraft.tech!, attribute: filterDraft.attribute!, value: val || '' }];
    } else if (filterDraft.mode === 'qoe' && filterDraft.kpi && filterDraft.operator && thresholdInput.trim()) {
      newFilters = [...localFilters, { mode: 'qoe', kpi: filterDraft.kpi!, operator: filterDraft.operator!, threshold: parseFloat(thresholdInput) }];
    }
    setLocalFilters(newFilters);
    setDirty(true);
    // Apply immediately
    onUpdate({ mapStyle: localMapStyle, themeMode: localThemeMode, mapLayer: localMapStyle, color: localColor, mapKpi: localKpis[0], mapKpis: localKpis, dataSource: localDataSource, viewFilters: newFilters });
    resetFilterWizard();
  };

  const removeFilterAt = (idx: number) => {
    const newFilters = localFilters.filter((_, i) => i !== idx);
    setLocalFilters(newFilters);
    setDirty(true);
    // Apply immediately
    onUpdate({ mapStyle: localMapStyle, themeMode: localThemeMode, mapLayer: localMapStyle, color: localColor, mapKpi: localKpis[0], mapKpis: localKpis, dataSource: localDataSource, viewFilters: newFilters });
  };

  const resetFilterWizard = () => { setFilterStep('idle'); setFilterDraft({}); setFreeTextValue(''); setKpiSearch(''); setThresholdInput(''); };

  const toggleKpi = (val: string) => {
    setLocalKpis(prev => {
      const next = prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val];
      return next.length === 0 ? [val] : next;
    });
    setDirty(true);
  };

  const handleConfirm = async () => {
    if (onRename && localName.trim() && localName !== currentName) onRename(localName.trim());
    const isLocked = !!dashboardId;
    // Clean siteFilters
    const cleanSiteFilters: DashboardSiteFilters = {};
    for (const [k, v] of Object.entries(localSiteFilters)) {
      if (v && v.length > 0) (cleanSiteFilters as any)[k] = v;
    }
    const baseUpdate: any = { mapStyle: localMapStyle, themeMode: localThemeMode, mapLayer: localMapStyle, color: localColor, mapKpi: localKpis[0], mapKpis: localKpis, dataSource: localDataSource, viewFilters: localFilters, mapLabelFields: Array.from(mapLabelFields) };
    // Only persist siteFilters during creation (locked after dashboard exists)
    if (!isLocked) baseUpdate.siteFilters = cleanSiteFilters;
    onUpdate(baseUpdate);
    if (!isLocked && onSiteFiltersChange) onSiteFiltersChange(cleanSiteFilters);
    if (dashboardId && localVisibility !== isShared) {
      await dashboardsApi.update(dashboardId, { is_shared: localVisibility });
      onSetDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, is_shared: localVisibility } : d));
    }
    setDirty(false);
  };

  // Section header helper
  const SectionHeader = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-bold text-foreground tracking-wide leading-tight">{title}</h3>
        {subtitle && <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[6px]" onClick={(e) => { if (e.target === e.currentTarget) { handleConfirm(); onClose(); } }}>
      <div className="w-[540px] max-h-[88vh] flex flex-col bg-card border border-border/60 rounded-2xl shadow-[0_25px_60px_-12px_rgba(0,0,0,0.35)] animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-gradient-to-r from-primary/[0.03] to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center border border-primary/10">
              <Settings2 size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-[13px] font-black text-foreground tracking-tight">{dashboardId ? 'Dashboard Configuration' : 'View Configuration'}</h2>
              <p className="text-[9px] text-muted-foreground/60 font-medium">Map settings & display preferences</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/80 text-muted-foreground/50 hover:text-foreground transition-all">
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── Dashboard Name ── */}
          {onRename && currentName != null && (
            <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<FileText size={12} className="text-primary" />} title={dashboardId ? 'Dashboard Name' : 'View Name'} />
              <input
                value={localName}
                onChange={(e) => { setLocalName(e.target.value); setDirty(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleConfirm(); onClose(); } }}
                className="w-full bg-card border border-border/50 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/40"
                placeholder={dashboardId ? 'Dashboard name...' : 'View name...'}
              />
            </div>
          )}

          {/* ── Site Filters ── */}
          {backendFilterDefs && backendFilterDefs.length > 0 && (() => {
            const isLocked = !!dashboardId;
            const activeEntries = Object.entries(localSiteFilters).filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : !!v));
            const labelFor = (key: string) => key.startsWith('manual_')
              ? key.replace('manual_', '').toUpperCase()
              : (backendFilterDefs.find(d => d.id === key)?.label || key.toUpperCase());

            if (isLocked) {
              // Read-only view after dashboard creation
              return (
                <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
                  <SectionHeader
                    icon={<Filter size={12} className="text-primary" />}
                    title="Filtres appliqués"
                    subtitle="Verrouillés après création du dashboard"
                  />
                  {activeEntries.length === 0 ? (
                    <div className="px-2.5 py-3 rounded-lg bg-muted/30 border border-dashed border-border/50 text-center">
                      <p className="text-[10px] text-muted-foreground/80 italic">
                        Aucun filtre spécifique — tous les sites sont inclus.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {activeEntries.map(([key, vals]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-[10px] font-semibold text-primary border border-primary/20"
                        >
                          <span className="opacity-70 uppercase tracking-wider text-[8px]">{labelFor(key)}</span>
                          <span>{Array.isArray(vals) ? vals!.join(', ') : vals}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[9px] text-muted-foreground/60 italic">
                    🔒 Les filtres de sites sont verrouillés après la création du dashboard.
                  </p>
                </div>
              );
            }

            // Editable mode (creation only)
            return (
              <div className="p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
                <SectionHeader icon={<Filter size={12} className="text-primary" />} title="Site Filters" subtitle="Filter sites displayed on the map" />
                <div className="space-y-1">
                  {backendFilterDefs.map(dim => {
                    const rawSelected = localSiteFilters[dim.id as keyof DashboardSiteFilters];
                    const selectedValues: string[] = Array.isArray(rawSelected) ? rawSelected : [];
                    return (
                      <CreateFilterDropdown
                        key={dim.id}
                        label={dim.label}
                        values={dim.values}
                        selected={selectedValues}
                        onChange={(vals) => {
                          const updated = { ...localSiteFilters, [dim.id]: vals.length > 0 ? vals : undefined };
                          const clean: DashboardSiteFilters = {};
                          for (const [k, v] of Object.entries(updated)) { if (v && (v as string[]).length > 0) (clean as any)[k] = v; }
                          setLocalSiteFilters(updated);
                          setDirty(true);
                          if (onSiteFiltersChange) onSiteFiltersChange(clean);
                        }}
                      />
                    );
                  })}
                </div>

                {/* Free-text filters: ECI, PCI, TILT */}
                <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                  <p className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">Manual Filters</p>
                  {(['eci', 'pci', 'tilt'] as const).map(field => {
                    const key = `manual_${field}` as string;
                    const currentVal = (localSiteFilters as any)[key] || '';
                    return (
                      <div key={field} className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-10 shrink-0">{field.toUpperCase()}</label>
                        <input
                          value={currentVal}
                          onChange={(e) => {
                            const updated = { ...localSiteFilters, [key]: e.target.value || undefined };
                            setLocalSiteFilters(updated);
                            setDirty(true);
                          }}
                          placeholder={`Enter ${field.toUpperCase()} value...`}
                          className="flex-1 bg-card border border-border/50 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/40"
                        />
                        {currentVal && (
                          <button onClick={() => {
                            const updated = { ...localSiteFilters, [key]: undefined };
                            setLocalSiteFilters(updated);
                            setDirty(true);
                          }} className="p-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground">
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {activeEntries.length > 0 && (
                  <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
                    <span className="text-[8px] font-bold text-primary/70 uppercase tracking-widest">Active Filters</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeEntries.map(([key, vals]) => (
                        <span key={key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-semibold text-primary border border-primary/10">
                          {labelFor(key)}: {Array.isArray(vals) ? vals!.join(', ') : vals}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}


          {/* ── Appearance, Labels ── */}
          {<>

          {/* ── Display Mode ── */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
            <SectionHeader icon={<SlidersHorizontal size={12} className="text-primary" />} title="Display Mode" />
            <div className="grid grid-cols-3 gap-1.5">
              {SETTINGS_THEME_MODES.map(mode => {
                const isActive = localThemeMode === mode.value;
                return (
                  <button key={mode.value} onClick={() => { setLocalThemeMode(mode.value); setDirty(true); }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border ${isActive
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-card/60 border-border/30 text-muted-foreground hover:text-foreground hover:border-border'
                    }`}>
                    <span className="text-sm">{mode.icon}</span>
                    <span className="uppercase tracking-wider">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Map Labels ── */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
            <SectionHeader icon={<LayoutGrid size={12} className="text-primary" />} title="Visible Labels" subtitle="Information displayed on map markers" />
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: 'site_name', label: 'Site Name', icon: '📍' },
                { key: 'cell_name', label: 'Cell ID', icon: '📶' },
                { key: 'pci', label: 'PCI', icon: '🔢' },
                { key: 'azimut', label: 'Azimut', icon: '🧭' },
                { key: 'bande', label: 'Band', icon: '📡' },
                { key: 'rat', label: 'Technology', icon: '⚡' },
              ].map(opt => {
                const isActive = mapLabelFields.has(opt.key);
                return (
                  <button key={opt.key} onClick={() => {
                    setMapLabelFields(prev => {
                      const next = new Set(prev);
                      if (next.has(opt.key)) next.delete(opt.key); else next.add(opt.key);
                      return next;
                    });
                  }}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[9.5px] font-semibold transition-all border ${isActive
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-card/60 border-border/30 text-muted-foreground hover:text-foreground hover:border-border'
                    }`}>
                    <span className="text-xs leading-none">{opt.icon}</span>
                    <span className="truncate">{opt.label}</span>
                    {isActive && <Check size={10} className="text-primary ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Visibility (dashboard only) ── */}
          {dashboardId && <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
            <SectionHeader icon={<Network size={12} className="text-primary" />} title="Visibility" subtitle="Dashboard access control" />
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: true, label: 'Public', icon: '🌍', desc: 'Visible to team' },
                { value: false, label: 'Private', icon: '🔐', desc: 'Only you' },
              ].map(opt => {
                const isActive = localVisibility === opt.value;
                return (
                  <button key={String(opt.value)} onClick={() => { setLocalVisibility(opt.value); setDirty(true); }}
                    className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-lg text-[10px] font-bold transition-all border ${isActive
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-card/60 border-border/30 text-muted-foreground hover:text-foreground hover:border-border'
                    }`}>
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="uppercase tracking-wider">{opt.label}</span>
                    <span className="text-[8px] font-normal text-muted-foreground/60">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>}

          {/* ── Beam Visibility ── */}
          {beamVis != null && onBeamVisChange && (
            <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<Radio size={12} className="text-primary" />} title="Sector Beams" subtitle="Sector size & opacity on map" />
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-muted-foreground/50 w-5 text-right shrink-0">0</span>
                <Slider value={[beamVis ?? 75]} onValueChange={([v]) => onBeamVisChange(v)} min={0} max={100} step={5} className="flex-1" />
                <span className="text-[9px] font-mono text-primary font-bold w-7 shrink-0">{beamVis}%</span>
              </div>
            </div>
          )}



          {/* ── Filter Wizard ── */}
          {filterStep !== 'idle' && (
            <div className="space-y-2">
              {filterStep === 'pick_kpi' && (
                <div className="border border-border/40 rounded-xl bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_mode')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={11} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 bg-accent text-accent-foreground">QOE</span>
                        Step 2 — KPI
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={11} /></button>
                  </div>
                  <input type="text" value={kpiSearch} onChange={e => setKpiSearch(e.target.value)} placeholder="Search KPI..."
                    className="w-full px-3 py-1.5 rounded-lg border border-border/50 bg-background text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40" autoFocus />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {QOE_FILTER_KPIS.filter(k => !kpiSearch || k.label.toLowerCase().includes(kpiSearch.toLowerCase()) || k.key.toLowerCase().includes(kpiSearch.toLowerCase())).map(kpi => (
                      <button key={kpi.key} onClick={() => { setFilterDraft(prev => ({ ...prev, kpi: kpi.key })); setFilterStep('pick_operator'); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all group">
                        <span className="text-sm">{kpi.icon}</span>
                        <span className="flex-1 text-left">{kpi.label}</span>
                        <span className="text-[8px] font-mono text-muted-foreground/40">{kpi.unit}</span>
                        <ChevronRight size={9} className="text-muted-foreground/20 group-hover:text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterStep === 'pick_operator' && (
                <div className="border border-border/40 rounded-xl bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_kpi')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={11} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 bg-accent text-accent-foreground">QOE</span>
                        {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.label} — Operator
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={11} /></button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {QOE_OPERATORS.map(op => (
                      <button key={op.key} onClick={() => { setFilterDraft(prev => ({ ...prev, operator: op.key })); setFilterStep('pick_threshold'); }}
                        className="flex flex-col items-center gap-0.5 px-1.5 py-2.5 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                        <span className="text-[16px] font-black text-foreground group-hover:text-primary">{op.label}</span>
                        <span className="text-[7px] text-muted-foreground/50">{op.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterStep === 'pick_threshold' && (
                <div className="border border-border/40 rounded-xl bg-card p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_operator')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={11} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 bg-accent text-accent-foreground">QOE</span>
                        Threshold
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={11} /></button>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-[9px] font-bold text-foreground">{QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.label}</span>
                    <span className="text-[13px] font-black text-primary">{QOE_OPERATORS.find(o => o.key === filterDraft.operator)?.label}</span>
                    <span className="text-[9px] text-muted-foreground/50">?</span>
                  </div>
                  <div className="relative">
                    <input type="number" value={thresholdInput} onChange={e => setThresholdInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && thresholdInput.trim()) commitFilter(); }}
                      placeholder="Enter value..."
                      className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background text-[13px] font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                      autoFocus />
                    {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.unit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/50">
                        {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.unit}
                      </span>
                    )}
                  </div>
                  <button onClick={() => commitFilter()} disabled={!thresholdInput.trim() || isNaN(parseFloat(thresholdInput))}
                    className="w-full py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    Apply Filter
                  </button>
                </div>
              )}
            </div>
          )}
          </>}
        </div>

        {/* ── Sticky Footer ── */}
        <div className="shrink-0 px-5 py-3 border-t border-border/40 bg-gradient-to-r from-muted/30 to-transparent">
          <div className="flex items-center gap-2">
            <button onClick={() => { handleConfirm(); onClose(); }}
              className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${dirty
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15 hover:bg-primary/90'
                : 'bg-muted/60 text-muted-foreground/60 border border-border/30'
              }`}>
              {dirty ? 'Save' : 'Settings Saved'}
            </button>
            {dirty && (
              <button onClick={() => { setLocalMapStyle(settings.mapStyle || 'street'); setLocalThemeMode(settings.themeMode || 'light'); setLocalColor(settings.color || ''); setLocalVisibility(isShared ?? true); setDirty(false); }}
                className="px-3 py-2.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border/30 hover:border-border transition-all">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export type SiteScopeType = 'ALL' | 'DOR' | 'DR' | 'Plaque';
export interface SiteScope {
  type: SiteScopeType;
  value?: string;
}

/* ── Multi-select dropdown for dashboard creation filters ── */
const CreateFilterDropdown: React.FC<{
  label: string;
  values: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  loading?: boolean;
  errored?: boolean;
}> = ({ label, values, selected, onChange, loading, errored }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const dialog = btnRef.current?.closest('[role="dialog"]') as HTMLElement | null;
      const dr = dialog?.getBoundingClientRect();
      if (dialog && dr) {
        setPos({ top: r.bottom - dr.top + dialog.scrollTop + 4, left: r.left - dr.left + dialog.scrollLeft, width: r.width });
      } else {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false); setSearch('');
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return values;
    const q = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  if (values.length === 0) {
    return (
      <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-dashed border-border bg-muted/10 text-left">
        <span className="text-[10px] text-muted-foreground/70">
          {loading ? 'Chargement…' : errored ? 'Erreur de chargement' : 'Aucune valeur disponible'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
          open
            ? 'border-primary bg-primary/5 shadow-md'
            : selected.length > 0
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50'
        }`}
      >
        <div className="flex-1 min-w-0">
          {label && <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</span>}
          {selected.length === 0 ? (
            <span className="text-[10px] text-muted-foreground/60">Tout</span>
          ) : selected.length <= 2 ? (
            <span className="text-[10px] font-semibold text-foreground truncate block">{selected.join(', ')}</span>
          ) : (
            <span className="text-[10px] font-semibold text-foreground">{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
          <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && pos && createPortal(
        <div
          ref={ref}
          style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[9999] bg-popover rounded-lg border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden"
        >
          {values.length > 5 && (
            <div className="px-2.5 pt-2 pb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                <Search size={11} className="text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/40">
            <button onClick={() => onChange([...values])} className="text-[9px] font-semibold text-primary hover:underline">Tout sélectionner</button>
            <span className="text-muted-foreground/40">·</span>
            <button onClick={() => onChange([])} className="text-[9px] font-semibold text-destructive hover:underline">Effacer</button>
          </div>
          <div
            className="max-h-[240px] overflow-y-auto py-0.5 overscroll-contain"
            onWheel={(e) => {
              const el = e.currentTarget;
              const canScroll = el.scrollHeight > el.clientHeight;
              if (canScroll) {
                el.scrollTop += e.deltaY;
                e.stopPropagation();
              }
            }}
          >
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/50 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(val => {
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggle(val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {isSelected && <Check size={9} className="text-primary-foreground" />}
                    </div>
                    <span className="truncate font-medium">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        (btnRef.current?.closest('[role="dialog"]') as HTMLElement) || document.body
      )}
    </div>
  );
};


/** Legacy site-filter keys that map directly onto `/topo/sites` named query
 *  params. Everything outside this set goes into the `dim_filters` bag below
 *  and is sent as the `dim_filters={JSON}` parameter the backend introduced
 *  on 2026-05-07 to support the 46-dim cascading picker. */
export const LEGACY_SITE_FILTER_KEYS = [
  'dor', 'vendor', 'plaque', 'techno', 'bande', 'zone_arcep', 'saisonnier', 'cluster',
] as const;

export interface DashboardSiteFilters {
  dor?: string[];
  vendor?: string[];
  plaque?: string[];
  techno?: string[];
  bande?: string[];
  zone_arcep?: string[];
  saisonnier?: string[];
  cluster?: string[];
  /** 46-dim cascading bag, keyed by `dimension_definitions.code` (e.g.
   *  CONSTRUCTEUR, BANDE, NCI_5G). Used for any dim outside the legacy 8
   *  named keys above. Sent to the backend as `?dim_filters={JSON}`. */
  dim_filters?: Record<string, string[]>;
  /** Row-based Topology Search payload from "Nouvelle vue → Topology
   *  Search". Logic between filters is OR (default) or AND, configurable
   *  per-view. Sent as `?topo_search={JSON}` and combines AND with the
   *  rest of the dashboard's narrowing filters. */
  topo_search?: {
    logic: 'OR' | 'AND';
    filters: { field: string; operator: 'IN' | 'NOT_IN' | '=' | '!='; values: string[] }[];
  };
}

const isLegacySiteFilterKey = (k: string): boolean =>
  (LEGACY_SITE_FILTER_KEYS as readonly string[]).includes(k);

/** Merge two DashboardSiteFilters with AND logic (intersection for same keys).
 *  Handles both legacy top-level keys and the 46-dim `dim_filters` bag. */
function mergeSiteFilters(dashboardFilters: DashboardSiteFilters | null, viewFilters: DashboardSiteFilters | null): DashboardSiteFilters {
  if (!dashboardFilters || Object.keys(dashboardFilters).length === 0) return viewFilters || {};
  if (!viewFilters || Object.keys(viewFilters).length === 0) return dashboardFilters;
  const merged: DashboardSiteFilters = { ...dashboardFilters };
  const intersect = (a: string[] | undefined, b: string[]): string[] => {
    if (!a || a.length === 0) return b;
    const i = a.filter(v => b.includes(v));
    return i.length > 0 ? i : b;  // empty intersection → view wins (will show no results)
  };
  for (const [key, viewVals] of Object.entries(viewFilters)) {
    if (key === 'dim_filters') continue;  // handled below
    const arr = viewVals as string[] | undefined;
    if (!arr || arr.length === 0) continue;
    (merged as any)[key] = intersect((merged as any)[key], arr);
  }
  // Merge dim_filters bag entry-by-entry
  if (viewFilters.dim_filters) {
    const mergedBag: Record<string, string[]> = { ...(merged.dim_filters || {}) };
    for (const [code, vals] of Object.entries(viewFilters.dim_filters)) {
      if (!vals || vals.length === 0) continue;
      mergedBag[code] = intersect(mergedBag[code], vals);
    }
    if (Object.keys(mergedBag).length) merged.dim_filters = mergedBag;
  }
  // topo_search: view wins (OR semantics across two payloads is ambiguous —
  // the more specific source of truth is the view's payload, since the
  // dashboard usually carries narrowing filters and the view layers on
  // a row-builder search on top).
  if (viewFilters.topo_search && viewFilters.topo_search.filters?.length > 0) {
    merged.topo_search = viewFilters.topo_search;
  }
  return merged;
}

interface DashboardInventoryTabProps {
  onApplyView?: (settings: any) => void;
  onDashboardActiveChange?: (active: boolean, scope?: SiteScope | null, siteFilters?: DashboardSiteFilters | null) => void;
  beamVisibility?: number;
  onBeamVisChange?: (v: number) => void;
  onSaveDashboard?: (dbId: string) => void;
  onLoadDashboard?: (dbId: string) => void;
  isSaving?: boolean;
  backendFilterDefs?: FilterDefinition[];
  activeDashboardId: string | null;
  onActiveDashboardIdChange: (id: string | null) => void;
  activeViewId: string | null;
  onActiveViewIdChange: (id: string | null) => void;
  kpiOverlays?: { id: string; label: string }[];
  onRemoveKpiOverlay?: (kpiId: string) => void;
  onActivateKpiOverlay?: (kpiId: string) => void;
  activeKpiOverlayId?: string | null;
  resolveKpiLabel?: (id: string) => string;
  overlayVersion?: number;
  catalogKpisForModal?: { key: string; label: string; famille?: string; techno?: string; threshold_warning?: number | null; threshold_critical?: number | null }[];
  noDashboardMode?: boolean;
  onToggleNoDashboardMode?: () => void;
  /** Callback that hands the parent the DOM node where the drop-in
   *  Visual Coverage module mounts its vanilla panel (toggle + status
   *  pill + counters). Replaces the previous 5-prop React-controlled
   *  block on 2026-05-11. */
  onCoveragePanelMount?: (el: HTMLDivElement | null) => void;
}

const AUTO_FILTER_DASHBOARD_NAME = /^Filtre \d{2}\/\d{2}\/\d{4}$/;

const dedupeAutoFilterDashboards = (items: any[]) => {
  return items.filter((item) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    return !AUTO_FILTER_DASHBOARD_NAME.test(name);
  });
};

const DashboardInventoryTab: React.FC<DashboardInventoryTabProps> = ({ onApplyView, onDashboardActiveChange, beamVisibility: beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, backendFilterDefs, activeDashboardId, onActiveDashboardIdChange, activeViewId, onActiveViewIdChange, kpiOverlays, onRemoveKpiOverlay, onActivateKpiOverlay, activeKpiOverlayId, resolveKpiLabel, overlayVersion, catalogKpisForModal, noDashboardMode, onToggleNoDashboardMode, onCoveragePanelMount }) => {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [ldg, setLdg] = useState(true);
  const [mapViews, setMapViews] = useState<any[]>([]);
  const [showCreateView, setShowCreateView] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [newViewFilters, setNewViewFilters] = useState<DashboardSiteFilters>({});
  const [creating, setCreating] = useState(false);
  const [expandedDashboardId, setExpandedDashboardId] = useState<string | null>(null);
  const [editingDashboardId, setEditingDashboardId] = useState<string | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [showDashMenu, setShowDashMenu] = useState(false);
  const [showCreateDash, setShowCreateDash] = useState(false);
  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [allDashboards, setAllDashboards] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [creatingDash, setCreatingDash] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [dashFilterMode] = useState<'my' | 'loaded' | 'all'>('loaded');

  // Track explicitly loaded dashboard IDs in localStorage
  const LOADED_KEY = 'osmosis_loaded_dashboard_ids';
  const [loadedDashIds, setLoadedDashIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(LOADED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const addLoadedId = (id: string) => {
    setLoadedDashIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(LOADED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const removeLoadedId = (id: string) => {
    setLoadedDashIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      try { localStorage.setItem(LOADED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Get current user
  const currentUsername = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem('admin_session') || 'null');
      return session?.username || null;
    } catch { return null; }
  }, []);

  // Create filter state for dashboard creation
  const [createFilters, setCreateFilters] = useState<DashboardSiteFilters>({});

  const extractScope = (db: any): SiteScope | null => {
    const s = getDashboardSettings(db);
    return s?.siteScope || null;
  };

  const extractSiteFilters = (db: any): DashboardSiteFilters | null => {
    const s = getDashboardSettings(db);
    if (s?.siteFilters && Object.keys(s.siteFilters).length > 0) return s.siteFilters;
    // Fallback: derive filters from scope if siteFilters not explicitly saved
    const scope = s?.siteScope || null;
    if (scope && scope.type !== 'ALL' && scope.value) {
      if (scope.type === 'DOR') return { dor: [scope.value] };
      if (scope.type === 'Plaque') return { plaque: [scope.value] };
    }
    // Also check the dashboard name for DOR hints
    const name = (db.name || '').trim();
    const dorNames = ['UPR Sud-Ouest', 'UPR Ile-De-France', 'UPR Nord-Est', 'UPR Ouest', 'UPR Sud-Est'];
    for (const dor of dorNames) {
      if (name.toLowerCase().includes(dor.toLowerCase().replace('upr ', ''))) {
        return { dor: [dor] };
      }
    }
    return null;
  };

  const requestDashboardSwitch = (newId: string | null) => {
    // Only expand/collapse — do NOT activate or display sites
    setExpandedDashboardId(prev => prev === newId ? null : newId);
  };

  // Explicit activation: user clicks "Activer"
  const activateDashboard = (dbId: string) => {
    onActiveDashboardIdChange(dbId);
    onActiveViewIdChange(null);
    const db = dashboards.find(d => d.id === dbId);
    if (db && onApplyView) {
      onApplyView(getDashboardSettings(db));
    }
    if (db) {
      onDashboardActiveChange?.(true, extractScope(db), extractSiteFilters(db));
    }
  };

  const confirmSwitchWithSave = () => {
    if (expandedDashboardId && onSaveDashboard) onSaveDashboard(expandedDashboardId);
    if (pendingSwitchId) {
      activateDashboard(pendingSwitchId);
      setExpandedDashboardId(pendingSwitchId);
    }
    setShowSwitchConfirm(false);
    setPendingSwitchId(null);
  };

  const confirmSwitchWithoutSave = () => {
    if (pendingSwitchId) {
      activateDashboard(pendingSwitchId);
      setExpandedDashboardId(pendingSwitchId);
    }
    setShowSwitchConfirm(false);
    setPendingSwitchId(null);
  };

  const cancelSwitch = () => {
    setShowSwitchConfirm(false);
    setPendingSwitchId(null);
  };

  const fetchAll = async () => {
    setLdg(true);
    try {
      const dbData = await dashboardsApi.list();
      if (Array.isArray(dbData)) {
        setDashboards(dedupeAutoFilterDashboards(dbData.filter((d: any) => !d.is_archived)));
      }
    } catch (e) {
      console.warn('[SitesMonitor] fetchAll dashboards failed:', e);
    }
    try {
      const mvData = await mapViewsApi.list();
      if (Array.isArray(mvData)) setMapViews(mvData);
    } catch (e) {
      console.warn('[SitesMonitor] fetchAll mapViews failed:', e);
    }
    setLdg(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Re-fetch views when overlay version changes (KPI added/removed)
  useEffect(() => {
    if (overlayVersion === undefined || overlayVersion === 0) return;
    mapViewsApi.list().then(mvData => {
      if (Array.isArray(mvData)) setMapViews(mvData);
    }).catch(() => {});
  }, [overlayVersion]);

  // ── Filtered & sorted dashboards ──
  const filteredDashboards = useMemo(() => {
    let list = dashboards;
    if (dashFilterMode === 'my') {
      list = dashboards.filter(d => d.owner_username === currentUsername || d.id === expandedDashboardId);
    } else if (dashFilterMode === 'loaded') {
      list = dashboards.filter(d => loadedDashIds.has(d.id) || d.owner_username === currentUsername || d.id === expandedDashboardId);
    }
    // Sort: active first, then by updated_at desc
    return [...list].sort((a, b) => {
      if (a.id === expandedDashboardId) return -1;
      if (b.id === expandedDashboardId) return 1;
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });
  }, [dashboards, dashFilterMode, currentUsername, loadedDashIds, expandedDashboardId]);


  const getDashboardSettings = (db: any) => {
    const w = Array.isArray(db.widgets) ? db.widgets : [];
    const meta = w.find((wi: any) => wi?._type === 'dashboard_settings');
    return meta || { mapLayer: 'light', mapKpi: 'qoe_score_avg', color: '' };
  };

  const updateDashboardSettings = async (dbId: string, updates: Record<string, any>) => {
    const db = dashboards.find(d => d.id === dbId);
    if (!db) return;
    const w = Array.isArray(db.widgets) ? [...db.widgets] : [];
    const idx = w.findIndex((wi: any) => wi?._type === 'dashboard_settings');
    const current = idx >= 0 ? w[idx] : { _type: 'dashboard_settings', mapLayer: 'light', mapKpi: 'qoe_score_avg', color: '' };
    const updated = { ...current, ...updates };
    if (idx >= 0) w[idx] = updated; else w.push(updated);
    await dashboardsApi.update(dbId, { widgets: w });
    setDashboards(prev => prev.map(d => d.id === dbId ? { ...d, widgets: w } : d));
  };

  const renameDashboard = async (dbId: string, newName: string) => {
    if (!newName.trim()) return;
    await dashboardsApi.update(dbId, { name: newName.trim() });
    setDashboards(prev => prev.map(d => d.id === dbId ? { ...d, name: newName.trim() } : d));
  };

  // 46-dim cascading catalog from osmosis-parser /api/v1/topo/catalog/filters.
  // Loaded once on mount; chips fetch their candidate values lazily via
  // topoApi.filterValues so the picker doesn't pay a 46×DISTINCT scan up front.
  const [topoCatalog, setTopoCatalog] = useState<{ id: string; label: string; values: string[]; category?: string; rat?: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    topoApi.filterCatalog()
      .then(d => { if (!cancelled) setTopoCatalog(d.filters || []); })
      .catch(() => { /* silent — falls back to backendFilterDefs / static below */ });
    return () => { cancelled = true; };
  }, []);

  // Picker source priority: 46-dim topo catalog → backend filter defs → static fallback.
  const filterDimensions = useMemo(() => {
    if (topoCatalog.length > 0) return topoCatalog;
    if (backendFilterDefs && backendFilterDefs.length > 0) return backendFilterDefs;
    const FALLBACK_KEYS = ['dor', 'vendor', 'plaque', 'rat', 'bande', 'zone_arcep'];
    return FILTER_DIMENSIONS
      .filter(dim => FALLBACK_KEYS.includes(dim.key))
      .map(dim => {
        const vals = resolveAvailableValues(dim.key, []);
        return { id: dim.key, label: dim.label, values: vals.sort() };
      })
      .filter(d => d.values.length > 0);
  }, [topoCatalog, backendFilterDefs]);

  const toggleCreateFilterValue = (dimKey: string, val: string) => {
    setCreateFilters(prev => {
      const raw = prev[dimKey as keyof DashboardSiteFilters];
      const current: string[] = Array.isArray(raw) ? raw : [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [dimKey]: next.length > 0 ? next : undefined };
    });
  };

  const hasAnyCreateFilter = useMemo(() => {
    for (const [k, v] of Object.entries(createFilters)) {
      if (k === 'dim_filters') {
        const bag = v as Record<string, string[]> | undefined;
        if (bag && Object.values(bag).some(arr => Array.isArray(arr) && arr.length > 0)) return true;
        continue;
      }
      if (Array.isArray(v) && v.length > 0) return true;
    }
    return false;
  }, [createFilters]);

  const handleCreateDashboardWithFilters = async () => {
    if (!newDashName.trim()) return;
    setCreatingDash(true);
    const id = crypto.randomUUID();
    // Build a legacy scope for backward compat
    const finalScope: SiteScope = { type: 'ALL' };
    if (createFilters.dor && createFilters.dor.length === 1) {
      finalScope.type = 'DOR';
      finalScope.value = createFilters.dor[0];
    } else if (createFilters.plaque && createFilters.plaque.length === 1) {
      finalScope.type = 'Plaque';
      finalScope.value = createFilters.plaque[0];
    }
    // Clean filters (remove empty arrays + empty dim_filters bag)
    const cleanFilters: DashboardSiteFilters = {};
    for (const [k, v] of Object.entries(createFilters)) {
      if (k === 'dim_filters') {
        const bag = v as Record<string, string[]> | undefined;
        if (bag) {
          const cleanedBag: Record<string, string[]> = {};
          for (const [code, vals] of Object.entries(bag)) {
            if (Array.isArray(vals) && vals.length > 0) cleanedBag[code] = vals;
          }
          if (Object.keys(cleanedBag).length) cleanFilters.dim_filters = cleanedBag;
        }
        continue;
      }
      if (Array.isArray(v) && v.length > 0) (cleanFilters as any)[k] = v;
    }
    try {
      const session = JSON.parse(localStorage.getItem('admin_session') || 'null');
      await dashboardsApi.upsert({
        id,
        name: newDashName.trim(),
        description: '',
        is_shared: true,
        dashboard_type: 'map',
        widgets: [{ _type: 'dashboard_settings', mapLayer: 'light', mapKpi: 'qoe_score_avg', color: '', siteScope: finalScope, siteFilters: cleanFilters }],
        owner_username: session?.username,
      });
      setNewDashName('');
      setShowCreateDash(false);
      setCreateFilters({});
      await fetchAll();
      setExpandedDashboardId(id);
      // Auto-activate newly created dashboard
      onActiveDashboardIdChange(id);
      onDashboardActiveChange?.(true, finalScope, cleanFilters);
    } catch (err) { console.warn('[SitesMonitor] createDashboard failed', err); }
    setCreatingDash(false);
  };

  const handleCreateDashboard = async () => {
    handleCreateDashboardWithFilters();
  };

  const handleDeleteDashboard = async (dbId: string) => {
    await dashboardsApi.update(dbId, { is_archived: true });
    purgeDashboardArtifacts(dbId);
    setExpandedDashboardId(null);
    if (activeDashboardId === dbId) {
      onActiveDashboardIdChange(null);
      onDashboardActiveChange?.(false, null, null);
    }
    setDashboards(prev => prev.filter(d => d.id !== dbId));
    setShowDeleteConfirm(null);
  };

  const handlePermanentDeleteDashboard = async (dbId: string) => {
    await dashboardsApi.update(dbId, { is_archived: true });
    purgeDashboardArtifacts(dbId);
    setExpandedDashboardId(null);
    if (activeDashboardId === dbId) {
      onActiveDashboardIdChange(null);
      onDashboardActiveChange?.(false, null, null);
    }
    setDashboards(prev => prev.filter(d => d.id !== dbId));
    setShowDeleteConfirm(null);
  };

  const openLoadPicker = async () => {
    setShowLoadPicker(true);
    setLoadingAll(true);
    try {
      const dbData = await dashboardsApi.list();
      if (Array.isArray(dbData)) {
        setAllDashboards(dedupeAutoFilterDashboards(dbData.filter((d: any) => !d.is_archived)));
      }
    } catch (err) { console.warn('[SitesMonitor] loadAllDashboards failed', err); }
    setLoadingAll(false);
  };

  const loadDashboardFromPicker = (dbId: string) => {
    setShowLoadPicker(false);
    addLoadedId(dbId);
    const db = allDashboards.find(d => d.id === dbId);
    if (db) {
      // Add to local list if not already there
      setDashboards(prev => {
        if (prev.find(d => d.id === dbId)) return prev;
        return [...prev, db];
      });
      // Only expand — do NOT activate automatically
      setExpandedDashboardId(dbId);
    } else {
      setExpandedDashboardId(dbId);
    }
  };
  const handleCreateView = async (dashboardId: string) => {
    if (!newViewName.trim()) return;
    setCreating(true);
    try {
      // Build clean siteFilters from newViewFilters (preserves dim_filters bag)
      const cleanFilters: DashboardSiteFilters = {};
      for (const [k, v] of Object.entries(newViewFilters)) {
        if (k === 'dim_filters') {
          const bag = v as Record<string, string[]> | undefined;
          if (bag) {
            const cleanedBag: Record<string, string[]> = {};
            for (const [code, vals] of Object.entries(bag)) {
              if (Array.isArray(vals) && vals.length > 0) cleanedBag[code] = vals;
            }
            if (Object.keys(cleanedBag).length) cleanFilters.dim_filters = cleanedBag;
          }
          continue;
        }
        if (Array.isArray(v) && v.length > 0) (cleanFilters as any)[k] = v;
      }
      await mapViewsApi.create({
        name: newViewName.trim(),
        description: dashboardId,
        settings: { center: [43.2965, 5.3698], zoom: 6, siteFilters: cleanFilters },
      });
      setNewViewName('');
      setNewViewFilters({});
      setShowCreateView(null);
      fetchAll();
    } catch (err) { console.warn('[SitesMonitor] createView failed', err); }
    setCreating(false);
  };

  const handleCreateViewWithConditions = async (dashboardId: string, conditions: ViewFilterCondition[]) => {
    if (!newViewName.trim()) return;
    setCreating(true);
    try {
      const siteFilters = conditionsToSiteFilters(conditions);
      await mapViewsApi.create({
        name: newViewName.trim(),
        description: dashboardId,
        settings: { center: [43.2965, 5.3698], zoom: 6, siteFilters, viewConditions: conditions },
      });
      setNewViewName('');
      setNewViewFilters({});
      setShowCreateView(null);
      fetchAll();
    } catch (err) { console.warn('[SitesMonitor] createView failed', err); }
    setCreating(false);
  };

  const handleCreateViewFromModal = async (dashboardId: string, config: ViewConfig) => {
    setCreating(true);
    try {
      const settings: Record<string, any> = {
        center: [43.2965, 5.3698],
        zoom: 6,
        viewType: config.type,
      };
      if (config.type === 'kpi_overlay') {
        settings.kpiOverlayConfig = {
          technology: config.technology,
          level: config.level,
          kpis: config.kpis,
          dateFrom: config.dateFrom,
          dateTo: config.dateTo,
        };
        // Also set kpiOverlays for backward compat
        settings.kpiOverlays = (config.kpis || []).map(k => k.kpiKey);
      } else if (config.type === 'topology_search') {
        // Row-based payload (2026-05-07 spec): { logic, filters: [{field,
        // operator, values}] }. Persisted directly under
        // settings.siteFilters.topo_search so it flows into
        // /topo/sites?topo_search=… via fetchDashboardSites → BboxFilters.
        const ts = config.topoSearch;
        if (ts && ts.filters.length > 0) {
          // Best-effort viewConditions for legacy consumers that read
          // ViewFilterCondition[] (operator IN; OR-vs-AND is lost here —
          // those consumers always intersect, which is wrong for OR-mode
          // but better than nothing while we keep the apply path simple).
          settings.viewConditions = ts.filters.map(f => ({
            id: crypto.randomUUID(),
            dimension: f.field,
            operator: f.operator as any,
            values: f.values,
          }));
          settings.siteFilters = { topo_search: ts } as DashboardSiteFilters;
          settings.topoSearchConfig = ts;
        }
      } else if (config.type === 'parameter') {
        settings.paramFilters = Object.fromEntries(
          Object.entries(config.paramFilters || {}).filter(([, v]) => String(v || '').trim())
        );
      } else if (config.type === 'coverage') {
        // Visual Coverage view — flip the layer ON in the saved settings
        // so that loading the view auto-enables the Voronoi tessellation.
        // The max-radius cap is the only knob: persisted as
        // coverageMaxRadiusM so the consumer can pass it to
        // fetchVisualCoverage when applying the view.
        settings.showVisualCoverage = true;
        if (config.coverageMaxRadiusM != null) {
          settings.coverageMaxRadiusM = config.coverageMaxRadiusM;
        }
      }
      await mapViewsApi.create({
        name: config.name,
        description: dashboardId,
        settings,
      });
      setShowCreateView(null);
      fetchAll();
    } catch (err) { console.warn('[SitesMonitor] createView from modal failed', err); }
    setCreating(false);
  };

  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await mapViewsApi.remove(id);
    // Reset active view and revert to dashboard-only filters
    onActiveViewIdChange(null);
    if (onApplyView && expandedDashboardId) {
      const db = dashboards.find(d => d.id === expandedDashboardId);
      if (db) {
        const dbSettings = getDashboardSettings(db);
        onApplyView({ ...dbSettings, _viewId: null, _isDashboardOnly: true });
      }
    }
    fetchAll();
  };

  const handleUpdateViewSettings = async (viewId: string, updates: Record<string, any>) => {
    const view = mapViews.find(v => v.id === viewId);
    if (!view) return;
    const currentSettings = typeof view.settings === 'object' ? view.settings : {};
    const newSettings = { ...currentSettings, ...updates };
    const updatedView = { ...view, settings: newSettings };
    await mapViewsApi.update(viewId, { settings: newSettings });
    setMapViews(prev => prev.map(v => v.id === viewId ? { ...v, settings: newSettings } : v));
    if (onApplyView && activeViewId === viewId && expandedDashboardId) {
      const activeDashboard = dashboards.find(d => d.id === expandedDashboardId);
      const dashboardSettings = activeDashboard ? getDashboardSettings(activeDashboard) : {};
      onApplyView(getEffectiveViewSettings(updatedView, dashboardSettings));
    }
  };

  const handleRenameView = async (viewId: string, newName: string) => {
    if (!newName.trim()) return;
    await mapViewsApi.update(viewId, { name: newName.trim() });
    setMapViews(prev => prev.map(v => v.id === viewId ? { ...v, name: newName.trim() } : v));
  };

  // Resolve effective settings for a view (dashboard parent + view overrides)
  // siteFilters are MERGED with AND logic (intersection)
  const getEffectiveViewSettings = (view: any, dbSettings: any) => {
    const vs = typeof view.settings === 'object' ? view.settings : {};
    const dbSiteFilters = dbSettings.siteFilters || null;
    const viewSiteFilters = vs.siteFilters || null;
    const mergedSiteFilters = mergeSiteFilters(dbSiteFilters, viewSiteFilters);
    return {
      _viewId: view.id,
      _isDashboardOnly: false,
      mapLayer: vs.mapLayer || dbSettings.mapLayer || 'street',
      mapStyle: vs.mapStyle || dbSettings.mapStyle || vs.mapLayer || dbSettings.mapLayer || 'street',
      themeMode: vs.themeMode || dbSettings.themeMode || 'light',
      mapKpi: vs.mapKpi || dbSettings.mapKpi || 'qoe_score_avg',
      color: vs.color || dbSettings.color || '',
      center: vs.center || dbSettings.center,
      zoom: vs.zoom || dbSettings.zoom,
      siteScope: dbSettings.siteScope || null,
      siteFilters: mergedSiteFilters,
      viewFilters: vs.viewFilters || dbSettings.viewFilters || [],
      viewConditions: vs.viewConditions || [],
      mapLabelFields: vs.mapLabelFields || dbSettings.mapLabelFields,
      kpiOverlays: Array.isArray(vs.kpiOverlays) ? vs.kpiOverlays : [],
      viewType: vs.viewType || null,
      kpiOverlayConfig: vs.kpiOverlayConfig || null,
      topoSearchConfig: vs.topoSearchConfig || null,
      paramFilters: vs.paramFilters || null,
    };
  };




  if (ldg) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
      <div className="flex items-center gap-2 px-1 mb-1">
        <LayoutGrid size={13} className="text-primary" />
        <h3 className="text-[10px] font-extrabold text-foreground uppercase tracking-widest">Dashboard</h3>
        <span className="text-[9px] font-bold text-muted-foreground">{filteredDashboards.length}/{dashboards.length}</span>
        <div className="ml-auto relative">
          <button
            onClick={() => setShowDashMenu(!showDashMenu)}
            className="p-1 rounded-lg text-primary hover:bg-primary/10 transition-colors"
            title="Nouveau / Charger"
          >
            <Plus size={14} />
          </button>
          {showDashMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
              <button
                onClick={() => { setShowDashMenu(false); setShowCreateDash(!showCreateDash); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Plus size={12} className="text-primary" /> Créer nouveau
              </button>
              <button
                onClick={() => { setShowDashMenu(false); openLoadPicker(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <FolderOpen size={12} className="text-primary" /> Charger
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard filter tabs removed — only Loaded dashboards are shown */}

      {/* Create dashboard popup */}
      {showCreateDash && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) { setShowCreateDash(false); setNewDashName(''); setCreateFilters({}); } }}>
          <DialogContent className="sm:max-w-[1100px] w-[95vw] max-h-[92vh] overflow-visible p-0 gap-0 flex flex-col">
            <DialogHeader className="px-12 pt-12 pb-6 shrink-0">
              <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Plus size={28} className="text-primary" />
                Créer un Dashboard
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Définissez le nom et les filtres de sites pour votre nouveau dashboard.
              </DialogDescription>
            </DialogHeader>

            <div className="px-12 pb-12 space-y-8 flex-1 min-h-0 overflow-y-auto overflow-x-visible">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">Nom du dashboard</label>
                <input
                  autoFocus
                  value={newDashName}
                  onChange={e => setNewDashName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newDashName.trim()) { handleCreateDashboard(); } }}
                  placeholder="Nom du dashboard..."
                  className="w-full bg-muted border border-border rounded-2xl px-6 py-5 text-base font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Progressive filter builder */}
              {filterDimensions.length > 0 && (
                <ProgressiveFilterBuilder
                  dimensions={filterDimensions}
                  filters={createFilters}
                  onChange={setCreateFilters}
                />
              )}

              {/* Buttons */}
              <div className="flex gap-6">
                <button
                  onClick={() => { setShowCreateDash(false); setNewDashName(''); setCreateFilters({}); }}
                  className="flex-1 py-5 rounded-2xl border border-border text-base font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => { handleCreateDashboard(); }}
                  disabled={!newDashName.trim() || creatingDash}
                  className="flex-1 py-5 rounded-2xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-3 shadow-sm"
                >
                  {creatingDash ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
                  {hasAnyCreateFilter ? 'Créer' : 'Créer'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Load dashboard picker */}
      {showLoadPicker && (
        <div className="mb-2 px-1">
          <div className="border border-border rounded-xl bg-card p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Charger un dashboard</span>
              <button onClick={() => setShowLoadPicker(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={12} />
              </button>
            </div>
            {loadingAll ? (
              <div className="flex items-center justify-center py-4"><RefreshCw size={14} className="text-primary animate-spin" /></div>
            ) : allDashboards.length === 0 ? (
              <div className="text-center text-[10px] text-muted-foreground/60 py-3">Aucun dashboard disponible</div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {allDashboards.map(db => {
                  const isActive = db.id === activeDashboardId;
                  return (
                    <button
                      key={db.id}
                      onClick={() => loadDashboardFromPicker(db.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors border ${isActive ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-primary/5 hover:border-primary/20'}`}
                    >
                      <LayoutGrid size={12} className={isActive ? 'text-primary shrink-0' : 'text-primary/60 shrink-0'} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-[11px] font-semibold block truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>{db.name}</span>
                        <span className="text-[8px] text-muted-foreground">{new Date(db.updated_at).toLocaleDateString()}</span>
                      </div>
                      {isActive ? (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Actif
                        </span>
                      ) : (
                        <ArrowRight size={11} className="text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="mb-2 px-1">
          <div className="border border-destructive/30 rounded-xl bg-destructive/5 p-3">
            <p className="text-[11px] font-bold text-foreground mb-2">Supprimer ce dashboard ?</p>
            <p className="text-[9px] text-muted-foreground mb-3">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePermanentDeleteDashboard(showDeleteConfirm)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <Trash2 size={11} /> Supprimer
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredDashboards.length === 0 ? (
        <div className="px-3 py-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <LayoutGrid size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">
              {dashboards.length === 0 ? 'Aucun dashboard' : dashFilterMode === 'my' ? 'Aucun de vos dashboards' : 'Aucun dashboard chargé'}
            </p>
            <p className="text-[9px] text-muted-foreground mt-1">
              {dashboards.length === 0
                ? 'Créez ou chargez un dashboard pour afficher les sites sur la carte.'
                : dashFilterMode === 'my'
                  ? 'Créez un nouveau dashboard ou passez en mode "All" pour voir les dashboards partagés.'
                  : 'Chargez un dashboard partagé via le bouton "Charger".'
              }
            </p>
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => { setShowCreateDash(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus size={12} /> Créer
            </button>
            <button
              onClick={() => { openLoadPicker(); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-border text-foreground hover:bg-muted transition-colors"
            >
              <FolderOpen size={12} /> Charger
            </button>
          </div>
          <div className="pt-2 border-t border-border/50">
            <button
              onClick={() => onToggleNoDashboardMode?.()}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${
                noDashboardMode
                  ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 hover:bg-emerald-500/20'
                  : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Affiche tous les sites sans nécessiter un dashboard actif"
            >
              <Globe size={12} /> {noDashboardMode ? 'Mode sans dashboard : ON' : 'Activer mode sans dashboard'}
            </button>
            <p className="text-[9px] text-muted-foreground/70 mt-1.5 text-center px-2">
              {noDashboardMode
                ? 'Tous les sites sont affichés sur la carte.'
                : 'Affiche tous les sites du réseau sans dashboard.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredDashboards.map(db => {
            const isExpanded = expandedDashboardId === db.id;
            const isActive = activeDashboardId === db.id;
            const dbSettings = getDashboardSettings(db);
            const dbColor = dbSettings.color || '';
            const isEditingDb = editingDashboardId === db.id;
            const dbViews = mapViews.filter(v => v.description === db.id);

            return (
              <div key={db.id} className={`group rounded-xl border overflow-hidden transition-all ${isActive ? 'border-primary/50 ring-1 ring-primary/20 bg-primary/[0.03]' : isExpanded ? 'border-border bg-card' : 'border-border bg-card hover:border-border'}`}>
                {/* Dashboard row */}
                 <div
                   onClick={() => {
                     // Row click only expands/collapses. Configuration panel
                     // is opened ONLY via the Settings button (see below).
                     setExpandedDashboardId(isExpanded ? null : db.id);
                   }}
                   className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${isActive ? (isExpanded ? 'bg-primary/5' : '') : (isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20')}`}
                  style={dbColor ? { borderLeft: `3px solid ${dbColor}` } : undefined}
                >
                  <div className="shrink-0 p-0.5">
                    <ChevronDown size={12} className={`transition-transform ${isExpanded ? (isActive ? 'text-primary' : 'text-foreground') : 'text-muted-foreground -rotate-90'}`} />
                  </div>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isExpanded && !dbColor && isActive ? 'bg-primary/15' : (isExpanded && !dbColor ? 'bg-muted' : '')}`}
                    style={dbColor ? { background: dbColor + (isExpanded ? '33' : '22'), color: dbColor } : undefined}
                  >
                    <LayoutGrid size={13} className={dbColor ? '' : (isActive ? 'text-primary' : (isExpanded ? 'text-foreground' : 'text-muted-foreground'))} style={dbColor ? { color: dbColor } : undefined} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[12px] font-bold truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>{db.name}</span>
                      {isActive && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[7px] font-bold uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Actif
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[8px] text-muted-foreground mt-0.5">
                      <span>{SETTINGS_MAP_STYLES.find(l => l.value === (dbSettings.mapStyle || dbSettings.mapLayer || 'street'))?.label || 'Street'}</span>
                      {dbViews.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{dbViews.length} vue{dbViews.length > 1 ? 's' : ''}</span>
                        </>
                      )}
                    </div>
                    {/* Inline filter badges for collapsed dashboards */}
                    {!isExpanded && (() => {
                      const dbFilters = extractSiteFilters(db);
                      if (!dbFilters) return null;
                      const entries = Object.entries(dbFilters).filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : !!v));
                      if (entries.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {entries.slice(0, 3).map(([key, vals]) => (
                            <span key={key} className="px-1 py-0 rounded bg-muted text-[7px] font-semibold text-muted-foreground truncate max-w-[80px]">
                              {key.toUpperCase()}: {Array.isArray(vals) ? vals.join(', ') : String(vals)}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {isExpanded && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingDashboardId(isEditingDb ? null : db.id); }}
                        className={`p-1.5 rounded-lg transition-colors shrink-0 ${isEditingDb ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        title="Settings"
                      >
                        <Settings2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // "Fermer" — collapse without deactivating
                          setExpandedDashboardId(null);
                        }}
                        className="p-1.5 rounded-lg transition-colors shrink-0 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                        title="Fermer"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(db.id); }}
                        className="p-1.5 rounded-lg transition-colors shrink-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                        title="Supprimer"
                      >
                        <Archive size={12} />
                      </button>
                    </>
                  )}
                  {/* Collapsed dashboard: owner info */}
                  {!isExpanded && (
                    <div className="flex items-center gap-1 shrink-0">
                      {db.owner_username && db.owner_username !== currentUsername && (
                        <span className="text-[7px] text-muted-foreground truncate max-w-[50px]" title={`Owner: ${db.owner_username}`}>
                          {db.owner_username}
                        </span>
                      )}
                      {isActive && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[7px] font-bold uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Actif
                        </span>
                      )}
                    </div>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${db.is_shared ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {db.owner_username === currentUsername ? (db.is_shared ? 'Public' : 'Privé') : 'Shared'}
                  </span>
                </div>

                {/* Dashboard settings panel */}
                {isEditingDb && (
                  <DashboardSettingsPanel
                    settings={dbSettings}
                    onUpdate={async (u) => {
                      await updateDashboardSettings(db.id, u);
                      if (!onApplyView || activeDashboardId !== db.id) return;

                      const resolvedDashboardSettings = { ...dbSettings, ...u };
                      const activeView = activeViewId
                        ? mapViews.find(v => v.id === activeViewId && v.description === db.id)
                        : null;

                      if (activeView) {
                        onApplyView(getEffectiveViewSettings(activeView, resolvedDashboardSettings));
                      } else {
                        onApplyView({ ...resolvedDashboardSettings, _viewId: null, _isDashboardOnly: true });
                      }
                    }}
                    onRename={(name) => renameDashboard(db.id, name)}
                    currentName={db.name}
                    dashboardId={db.id}
                    isShared={db.is_shared}
                    beamVis={beamVis}
                    onBeamVisChange={onBeamVisChange}
                    onSaveDashboard={() => { if (onSaveDashboard) onSaveDashboard(db.id); }}
                    onLoadDashboard={() => { if (onLoadDashboard) onLoadDashboard(db.id); }}
                    isSaving={isSaving}
                    onClose={() => { setEditingDashboardId(null); setEditingViewId(null); }}
                    onActivate={() => activateDashboard(db.id)}
                    onSetDashboards={setDashboards}
                    backendFilterDefs={backendFilterDefs}
                    onSiteFiltersChange={(filters) => {
                      updateDashboardSettings(db.id, { siteFilters: filters });
                      onDashboardActiveChange?.(true, extractScope(db), filters);
                    }}
                  />
                )}

                {/* Save/Load/Close + Nested views tree */}
                {isExpanded && (
                  <div className="px-3 pt-1.5">
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <button
                        onClick={() => { if (onSaveDashboard) onSaveDashboard(db.id); }}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary"
                      >
                        {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                        <span className="uppercase tracking-wider">Save</span>
                      </button>
                      <button
                        onClick={() => {
                          if (isActive) {
                            // Eye off → hide sites by deactivating dashboard
                            onActiveDashboardIdChange(null);
                            onActiveViewIdChange(null);
                            onDashboardActiveChange?.(false, null, null);
                          } else {
                            // Eye on → activate dashboard to show its sites
                            activateDashboard(db.id);
                          }
                        }}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                          isActive
                            ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted'
                        }`}
                        title={isActive ? 'Masquer les sites sur la carte' : 'Afficher les sites sur la carte'}
                      >
                        {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                        <span className="uppercase tracking-wider">{isActive ? 'Actif' : 'Activer'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Close = deactivate (if active), collapse, AND unload from list
                          if (isActive) {
                            onActiveDashboardIdChange(null);
                            onActiveViewIdChange(null);
                            onDashboardActiveChange?.(false, null, null);
                          }
                          setEditingDashboardId(null);
                          setExpandedDashboardId(null);
                          removeLoadedId(db.id);
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted"
                      >
                        <X size={12} />
                        <span className="uppercase tracking-wider">Close</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Ajouter une vue — only for active dashboard */}
                {isExpanded && (
                  <div className="px-3 pt-1.5 pb-2">
                    <button
                      onClick={() => { setShowCreateView(db.id); setNewViewName(''); setNewViewFilters({}); }}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 text-[10px] font-bold text-primary/80 hover:text-primary transition-all"
                    >
                      <Plus size={11} />
                      Ajouter une vue
                    </button>

                    {/* Visual Coverage panel mount — the drop-in module
                        from src/coverage/ renders its toggle + status pill +
                        counters here. State lives in the module; React only
                        provides the DOM node via callback ref. */}
                    <div
                      className="mt-2"
                      ref={onCoveragePanelMount}
                    />
                  </div>
                )}
                {/* Create View Modal (2-step) */}
                <CreateViewModal
                  open={showCreateView === db.id}
                  onOpenChange={(open) => { if (!open) setShowCreateView(null); }}
                  onSave={(config) => handleCreateViewFromModal(db.id, config)}
                  saving={creating}
                  availableKpis={catalogKpisForModal}
                />

                {isExpanded && (
                  <div className="ml-5 pl-3 border-l-2 border-border/60 space-y-1 py-1.5">
                    {dbViews.length === 0 ? (
                      <div className="px-2 py-1.5 text-center text-[9px] text-muted-foreground/50">Aucune vue</div>
                    ) : (
                      dbViews.map(view => {
                        const vs = typeof view.settings === 'object' ? view.settings : {} as any;
                        const eff = getEffectiveViewSettings(view, dbSettings);
                        const viewColor = eff.color;
                        const isEditing = editingViewId === view.id;
                        const hasOwnSettings = vs.mapLayer || vs.mapKpi || vs.color;
                        const condCount = Array.isArray(vs.viewConditions) ? vs.viewConditions.length : 0;

                          const isViewActive = activeViewId === view.id;

                        return (
                          <div key={view.id} className={`rounded-lg border overflow-hidden transition-all ${isViewActive ? 'border-primary/60 ring-1 ring-primary/20 bg-primary/[0.04]' : 'border-border/60 bg-card hover:border-primary/30'}`}>
                            <div
                              className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer ${isViewActive ? 'bg-primary/5' : ''}`}
                              style={viewColor ? { borderLeft: `3px solid ${viewColor}` } : undefined}
                              onClick={() => {
                                onActiveViewIdChange(isViewActive ? null : view.id);
                                if (onApplyView) {
                                  if (isViewActive) {
                                    // Deactivate view → revert to dashboard-only filters
                                    onApplyView({ ...getDashboardSettings(dashboards.find(d => d.id === expandedDashboardId) || {}), _viewId: null, _isDashboardOnly: true });
                                  } else {
                                    onApplyView(eff);
                                  }
                                }
                              }}
                            >
                              <MapIcon size={12} className="text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {view.is_default && <Star size={8} className="text-amber-500 fill-amber-500 shrink-0" />}
                                  <span className={`text-[11px] font-semibold truncate ${isViewActive ? 'text-primary font-bold' : 'text-foreground'}`}>{view.name}</span>
                                  {isViewActive && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold uppercase">actif</span>}
                                  {hasOwnSettings && <span className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent-foreground font-bold uppercase">custom</span>}
                                  {condCount > 0 && <span className="text-[7px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold">{condCount} filtre{condCount > 1 ? 's' : ''}</span>}
                                  {vs.viewType === 'kpi_overlay' && <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold uppercase">KPI</span>}
                                  {vs.viewType === 'topology_search' && <span className="text-[7px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold uppercase">Topo</span>}
                                  {vs.viewType === 'parameter' && <span className="text-[7px] px-1 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold uppercase">Param</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[8px] text-muted-foreground mt-0.5">
                                  {vs.viewType === 'kpi_overlay' && vs.kpiOverlayConfig && (
                                    <>
                                      <span>{vs.kpiOverlayConfig.technology}</span>
                                      <span>•</span>
                                      <span>{vs.kpiOverlayConfig.level === 'site' ? 'Site' : vs.kpiOverlayConfig.level === 'cell' ? 'Cellule' : 'Bande'}</span>
                                      <span>•</span>
                                      <span>{vs.kpiOverlayConfig.kpis?.length || 0} KPI{(vs.kpiOverlayConfig.kpis?.length || 0) > 1 ? 's' : ''}</span>
                                    </>
                                  )}
                                  {vs.viewType === 'topology_search' && (
                                    <span>{Object.entries(vs.topoSearchConfig || {}).filter(([,v]: [string, any]) => v).length} critère(s)</span>
                                  )}
                                  {vs.viewType === 'parameter' && vs.paramFilters && (
                                    <span>{vs.paramFilters.parameter || 'Paramètre'}</span>
                                  )}
                                  {!vs.viewType && (
                                    <>
                                      <span>{SETTINGS_MAP_STYLES.find(l => l.value === (eff.mapStyle || eff.mapLayer))?.label || 'Street'}</span>
                                      <span>•</span>
                                      <span>{SETTINGS_KPI_OPTIONS.find(k => k.value === eff.mapKpi)?.label || 'QoE'}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingViewId(isEditing ? null : view.id); }}
                                  className={`p-1 rounded transition-colors ${isEditing ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                                  title="Settings"
                                >
                                  <Settings2 size={10} />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteView(view.id, e)}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>

                            {/* KPI Overlay badges — active view uses live props, inactive reads from persisted settings */}
                            {vs.viewType !== 'parameter' && (() => {
                              const viewOverlays = isViewActive
                                ? (kpiOverlays || [])
                                : (Array.isArray(vs.kpiOverlays) ? vs.kpiOverlays.map((id: string) => ({ id, label: resolveKpiLabel?.(id) || id })) : []);
                              if (!viewOverlays.length) return null;
                              return (
                                <div className={`border-t ${isViewActive ? 'border-emerald-500/20' : 'border-border/30'}`}>
                                  {viewOverlays.map((ov: { id: string; label: string }) => {
                                    const isActiveOverlay = isViewActive && activeKpiOverlayId === ov.id;
                                    return (
                                      <div
                                        key={ov.id}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b last:border-b-0 cursor-pointer transition-colors ${
                                          isActiveOverlay
                                            ? 'bg-primary/10 border-primary/20'
                                            : isViewActive
                                              ? 'bg-emerald-500/10 border-emerald-500/10 hover:bg-emerald-500/15'
                                              : 'bg-muted/30 border-border/20'
                                        }`}
                                        onClick={(e) => { e.stopPropagation(); if (isViewActive) onActivateKpiOverlay?.(ov.id); }}
                                      >
                                        <BarChart2 size={10} className={isActiveOverlay ? 'text-primary shrink-0' : isViewActive ? 'text-emerald-600 shrink-0' : 'text-muted-foreground shrink-0'} />
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isActiveOverlay ? 'text-primary' : isViewActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>KPI</span>
                                        <span className={`text-[9px] font-semibold truncate ${isActiveOverlay ? 'text-primary font-bold' : isViewActive ? 'text-foreground' : 'text-muted-foreground'}`}>{ov.label}</span>
                                        {isActiveOverlay && (
                                          <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold uppercase">actif</span>
                                        )}
                                        {isViewActive && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onRemoveKpiOverlay?.(ov.id); }}
                                            className="ml-auto p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            title="Supprimer ce KPI Overlay"
                                          >
                                            <X size={10} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {isEditing && (
                              <div className="border-t border-border/40">
                                {/* Filter conditions editor */}
                                <div className="px-3 py-2.5 border-b border-border/30">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Filter size={11} className="text-primary" />
                                    <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">View Filters</span>
                                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{condCount}</span>
                                  </div>
                                  <ViewFilterBuilder
                                    viewName={view.name}
                                    onViewNameChange={(name) => handleRenameView(view.id, name)}
                                    backendFilterDefs={backendFilterDefs}
                                    initialConditions={Array.isArray(vs.viewConditions) ? vs.viewConditions : siteFiltersToConditions(vs.siteFilters || {})}
                                    saving={false}
                                    onSave={async (conditions) => {
                                      const siteFilters = conditionsToSiteFilters(conditions);
                                      await handleUpdateViewSettings(view.id, { viewConditions: conditions, siteFilters });
                                      setEditingViewId(null);
                                    }}
                                    onCancel={() => setEditingViewId(null)}
                                  />
                                </div>
                                {/* Visual settings */}
                                <DashboardSettingsPanel
                                  settings={vs}
                                  onUpdate={(u) => handleUpdateViewSettings(view.id, u)}
                                  onRename={(name) => handleRenameView(view.id, name)}
                                  currentName={view.name}
                                  onClose={() => { setEditingDashboardId(null); setEditingViewId(null); }}
                                  onSetDashboards={setDashboards}
                                  backendFilterDefs={backendFilterDefs}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Confirmation dialog for switching dashboard */}
      {showSwitchConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 mx-4 max-w-sm w-full space-y-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Save size={18} className="text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Sauvegarder avant de quitter ?</h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Voulez-vous sauvegarder les modifications du dashboard actuel avant de changer ?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmSwitchWithSave}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Save size={13} />
                Sauvegarder & Quitter
              </button>
              <button
                onClick={confirmSwitchWithoutSave}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Quitter sans sauvegarder
              </button>
              <button
                onClick={cancelSwitch}
                className="w-full px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete dashboard confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 mx-4 max-w-sm w-full space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Supprimer ce dashboard ?</h3>
              <p className="text-[11px] text-muted-foreground mt-1">Cette action est irréversible.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { handleDeleteDashboard(showDeleteConfirm); setShowDeleteConfirm(null); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <Trash2 size={13} />
                Supprimer
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Extracted sub-component for Parameters tab in the right sidebar */
const SiteParametersTab: React.FC<{ siteName?: string | null }> = ({ siteName }) => {
  const [search, setSearch] = React.useState('');
  const [searchedParam, setSearchedParam] = React.useState<string | null>(null);
  const [selectedParam, setSelectedParam] = React.useState<string | null>(null);
  const [paramData, setParamData] = React.useState<{ parameter: string; cell_name: string | null; value: string | null; bande: string | null; dn: string | null }[]>([]);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  // Reset on site change
  React.useEffect(() => {
    setSearch('');
    setSearchedParam(null);
    setSelectedParam(null);
    setParamData([]);
    setHasSearched(false);
    setSuggestions([]);
  }, [siteName]);

  // Close suggestions on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Live suggestions as user types (debounced) — VPS first, Supabase fallback
  React.useEffect(() => {
    if (!siteName || !search.trim() || search.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    if (selectedParam && search === selectedParam) return; // don't re-search after selection
    const term = search.trim();
    const termLc = term.toLowerCase();
    const t = setTimeout(async () => {
      setSuggestionsLoading(true);
      let names: string[] = [];
      // 1) Try VPS parser endpoint first (live data)
      try {
        const resp = await fetch(
          getVpsProxyUrl('parser', `/api/v1/topo/site-params/${encodeURIComponent(siteName)}?search=${encodeURIComponent(term)}&limit=500`),
          { headers: getVpsProxyHeaders() },
        );
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            names = [...new Set(data.map((r: any) => r.parameter || r.param_name).filter(Boolean))] as string[];
          }
        }
      } catch { /* ignore, fallback below */ }
      // 2) Supabase fallback if VPS gave nothing
      if (names.length === 0) {
        try {
          const { data } = await supabase
            .from('parameter_dump')
            .select('parameter')
            .ilike('site_name', siteName)
            .ilike('parameter', `%${term}%`)
            .limit(500);
          names = [...new Set((data || []).map((r: any) => r.parameter).filter(Boolean))] as string[];
        } catch { /* ignore */ }
      }
      // Client-side filter: VPS sometimes ignores `search` and returns unrelated rows
      const matches = names.filter(n => n.toLowerCase().includes(termLc));
      // Rank: exact > leaf-name match > prefix > contains
      const rank = (n: string) => {
        const lc = n.toLowerCase();
        const leaf = lc.split('.').pop() || lc;
        if (lc === termLc) return 0;
        if (leaf === termLc) return 1;
        if (leaf.startsWith(termLc)) return 2;
        if (lc.startsWith(termLc)) return 3;
        if (leaf.includes(termLc)) return 4;
        return 5;
      };
      matches.sort((a, b) => {
        const r = rank(a) - rank(b);
        return r !== 0 ? r : a.localeCompare(b);
      });
      setSuggestions(matches.slice(0, 50));
      setShowSuggestions(true);
      setSuggestionsLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, siteName, selectedParam]);

  // Fetch when searchedParam changes
  React.useEffect(() => {
    if (!siteName || !searchedParam) { setParamData([]); return; }
    setDataLoading(true);
    setHasSearched(true);
    (async () => {
      let fetched = false;
      try {
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/site-params/${encodeURIComponent(siteName)}?search=${encodeURIComponent(searchedParam)}`), {
          headers: getVpsProxyHeaders(),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          setParamData(data.map((r: any) => ({
            parameter: r.parameter || r.param_name || '',
            cell_name: r.cell_name || r.nom_cellule || null,
            value: r.value ?? null,
            bande: r.bande || null,
            dn: r.dn || r.cell_dn || null,
          })));
          fetched = true;
        }
      } catch {}
      if (!fetched) {
        try {
          const { data: dbRows } = await supabase
            .from('parameter_dump')
            .select('parameter, cell_name, value, bande, dn')
            .ilike('site_name', siteName)
            .ilike('parameter', `%${searchedParam}%`)
            .limit(1000);
          if (dbRows) {
            setParamData(dbRows.map((r: any) => ({
              parameter: r.parameter || '',
              cell_name: r.cell_name || null,
              value: r.value ?? null,
              bande: r.bande || null,
              dn: r.dn || null,
            })));
          }
        } catch {}
      }
      setDataLoading(false);
    })();
  }, [siteName, searchedParam]);

  const doSearch = () => {
    const target = selectedParam || search.trim();
    if (target) {
      setSearchedParam(target);
      setShowSuggestions(false);
    }
  };

  const pickSuggestion = (p: string) => {
    setSelectedParam(p);
    setSearch(p);
    setShowSuggestions(false);
  };

  // Group results by MO (extract from DN or parameter prefix)
  const [tableFilter, setTableFilter] = React.useState('');
  const [sortCol, setSortCol] = React.useState<'mo' | 'parameter' | 'value' | 'cell'>('mo');
  const [sortAsc, setSortAsc] = React.useState(true);
  const [collapsedMOs, setCollapsedMOs] = React.useState<Set<string>>(new Set());

  // Auto-expand all MO groups whenever a new search returns results
  React.useEffect(() => {
    setCollapsedMOs(new Set());
  }, [paramData, searchedParam]);

  const tableRows = React.useMemo(() => {
    // Deduplicate identical rows. The dump can return duplicates when a row
    // has been ingested multiple times or when the backend joins extra
    // metadata. We dedupe on (parameter + dn + value + cell).
    const seen = new Set<string>();
    const unique: typeof paramData = [];
    for (const p of paramData) {
      const key = `${(p.parameter || '').toLowerCase()}|${(p.dn || '').toLowerCase()}|${p.value ?? ''}|${(p.cell_name || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    return unique.map(p => {
      // Extract MO from parameter name (e.g. "LNCEL.pMax" → "LNCEL")
      // This is the most reliable source — works for all vendors
      let mo = '—';
      if (p.parameter) {
        const dotIdx = p.parameter.indexOf('.');
        mo = dotIdx > 0 ? p.parameter.substring(0, dotIdx) : p.parameter;
      } else if (p.dn) {
        // Fallback: extract from DN
        // Nokia: PLMN-PLMN/MRBTS-x/LNBTS-x/LNCEL-x → use second-to-last segment
        if (p.dn.includes('/')) {
          const parts = p.dn.split('/');
          const seg = parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
          mo = seg.replace(/-\d+$/, '');
        } else {
          // Ericsson 3GPP: SubNetwork=...,EUtranCellFDD=xxx
          const parts = p.dn.split(',');
          const last = parts[parts.length - 1];
          const eqIdx = last.indexOf('=');
          mo = eqIdx > 0 ? last.substring(0, eqIdx) : last;
        }
      }
      // Build a compact MO instance path from the DN (e.g. MRBTS-1/LNBTS-1/LNCEL-3)
      // This gives the user the unique instance identifier even when cell_name is empty.
      let moPath = '';
      if (p.dn) {
        if (p.dn.includes('/')) {
          // Nokia style — drop the leading PLMN-PLMN if present, keep the meaningful tail
          const parts = p.dn.split('/').filter(Boolean).filter(s => !/^PLMN-PLMN$/i.test(s));
          moPath = parts.slice(-3).join('/');
        } else if (p.dn.includes(',')) {
          // Ericsson 3GPP style — keep last 2-3 RDNs
          const parts = p.dn.split(',').map(s => s.trim());
          moPath = parts.slice(-3).join(',');
        } else {
          moPath = p.dn;
        }
      }
      return { mo, moPath, parameter: p.parameter, value: p.value, cell: p.cell_name || '', bande: p.bande || '', dn: p.dn || '' };
    });
  }, [paramData]);

  const filteredRows = React.useMemo(() => {
    if (!tableFilter) return tableRows;
    const q = tableFilter.toLowerCase();
    return tableRows.filter(r =>
      r.mo.toLowerCase().includes(q) ||
      r.moPath.toLowerCase().includes(q) ||
      r.parameter.toLowerCase().includes(q) ||
      (r.value || '').toLowerCase().includes(q) ||
      r.cell.toLowerCase().includes(q)
    );
  }, [tableRows, tableFilter]);

  const sortedGrouped = React.useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const va = a[sortCol] || '';
      const vb = b[sortCol] || '';
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    // Group by MO
    const map = new Map<string, typeof sorted>();
    for (const r of sorted) {
      if (!map.has(r.mo)) map.set(r.mo, []);
      map.get(r.mo)!.push(r);
    }
    return Array.from(map.entries());
  }, [filteredRows, sortCol, sortAsc]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const toggleMO = (mo: string) => {
    setCollapsedMOs(prev => {
      const next = new Set(prev);
      if (next.has(mo)) next.delete(mo); else next.add(mo);
      return next;
    });
  };

  const copyValue = (val: string) => {
    navigator.clipboard.writeText(val);
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ChevronsUpDown className="w-2.5 h-2.5 text-muted-foreground/40" />;
    return sortAsc ? <ChevronUp className="w-2.5 h-2.5 text-primary" /> : <ChevronDown className="w-2.5 h-2.5 text-primary" />;
  };

  if (!siteName) return <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">Sélectionnez un site</div>;

  return (
    <div className="space-y-2">
      {/* Search input + button */}
      <div className="flex gap-1.5" ref={suggestionsRef}>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setSelectedParam(null);
              setShowSuggestions(true);
            }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onKeyDown={e => {
              if (e.key === 'Enter') doSearch();
              if (e.key === 'Escape') setShowSuggestions(false);
            }}
            placeholder="Tapez puis sélectionnez un paramètre..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Suggestion dropdown */}
          {showSuggestions && search.trim() && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-[280px] overflow-y-auto">
              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-3">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                </div>
              ) : suggestions.length === 0 ? (
                <div className="py-3 px-3 text-[11px] text-muted-foreground text-center">Aucun paramètre trouvé</div>
              ) : (
                suggestions.map(p => (
                  <button
                    key={p}
                    onClick={() => pickSuggestion(p)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors ${
                      selectedParam === p ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          onClick={doSearch}
          disabled={!selectedParam && !search.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          Chercher
        </button>
      </div>

      {/* Results */}
      {dataLoading ? (
        <div className="flex items-center justify-center py-8"><RefreshCw className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !hasSearched ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
          <Search size={20} className="mx-auto text-muted-foreground/40" />
          <p className="text-[11px] text-muted-foreground">Entrez un nom de paramètre et appuyez sur <strong>Chercher</strong></p>
        </div>
      ) : paramData.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">
          Aucun résultat pour « {searchedParam} » — le dump CM de ce site n'est peut-être pas encore chargé
        </div>
      ) : (
        <>
          {/* Stats + table filter */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">
              {filteredRows.length} entrée{filteredRows.length !== 1 ? 's' : ''} · {sortedGrouped.length} MO
            </span>
            <div className="relative flex-1 max-w-[200px] ml-auto">
              <Filter size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                placeholder="Filtrer…"
                className="w-full pl-6 pr-2 py-1 text-[10px] rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Hint for horizontal scroll on narrow panels */}
          <div className="text-[9px] text-muted-foreground/70 italic flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            Faites défiler horizontalement pour voir la colonne <strong className="text-foreground/80">Value</strong>
          </div>
          {/* MO-grouped table */}
          <div className="rounded-lg border border-border bg-card max-h-[calc(100vh-460px)] overflow-auto">
            <table className="text-[13px]" style={{ minWidth: '780px', width: 'max-content' }}>
              <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 shadow-sm">
                <tr className="border-b-2 border-border">
                  <th className="text-left px-4 py-2.5 font-bold text-foreground cursor-pointer select-none hover:bg-muted transition-colors min-w-[260px]" onClick={() => toggleSort('parameter')}>
                    <span className="inline-flex items-center gap-1">Parameter <SortIcon col="parameter" /></span>
                  </th>
                  <th className="text-left px-4 py-2.5 font-bold text-foreground select-none min-w-[240px]">
                    <span className="inline-flex items-center gap-1">Instance (MO path)</span>
                  </th>
                  <th className="text-left px-4 py-2.5 font-bold text-foreground cursor-pointer select-none hover:bg-muted transition-colors min-w-[140px]" onClick={() => toggleSort('cell')}>
                    <span className="inline-flex items-center gap-1">Cell <SortIcon col="cell" /></span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-bold text-foreground cursor-pointer select-none hover:bg-muted transition-colors min-w-[110px] sticky right-[44px] bg-muted/95 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]" onClick={() => toggleSort('value')}>
                    <span className="inline-flex items-center gap-1 justify-end">Value <SortIcon col="value" /></span>
                  </th>
                  <th className="w-[44px] sticky right-0 bg-muted/95" />
                </tr>
              </thead>
              <tbody>
                {sortedGrouped.map(([mo, rows]) => {
                  const isCollapsed = collapsedMOs.has(mo);
                  return (
                    <React.Fragment key={mo}>
                      {/* MO group header */}
                      <tr
                        className="bg-primary/10 hover:bg-primary/15 cursor-pointer transition-colors border-y border-primary/20"
                        onClick={() => toggleMO(mo)}
                      >
                        <td colSpan={5} className="px-4 py-2">
                          <span className="inline-flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-bold text-[12px] tracking-wider uppercase shadow-sm">
                              {mo}
                            </span>
                            <span className="text-[12px] text-muted-foreground font-medium">
                              {rows.length} parameter{rows.length > 1 ? 's' : ''}
                            </span>
                          </span>
                        </td>
                      </tr>
                      {/* Rows */}
                      {!isCollapsed && rows.map((r, i) => {
                        const isZero = r.value === '0' || r.value === '0.0';
                        const isNumeric = r.value && !isNaN(Number(r.value));
                        const numVal = isNumeric ? Number(r.value) : null;
                        const paramParts = (r.parameter || '').split('.');
                        const paramLeaf = paramParts.length > 1 ? paramParts[paramParts.length - 1] : r.parameter;
                        const paramMo = paramParts.length > 1 ? paramParts.slice(0, -1).join('.') : '';
                        return (
                          <tr key={i} className={`${i % 2 === 0 ? 'bg-background' : 'bg-muted/30'} hover:bg-accent/40 transition-colors border-b border-border/40`}>
                            <td className="px-4 py-2 align-middle">
                              <div className="flex items-center gap-2 flex-wrap">
                                {paramMo && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold text-[10px] font-mono uppercase tracking-wide border border-primary/30">
                                    {paramMo}
                                  </span>
                                )}
                                <span className="font-mono text-foreground font-semibold text-[13px]" title={r.parameter}>
                                  {tableFilter ? (
                                    <span dangerouslySetInnerHTML={{
                                      __html: paramLeaf.replace(
                                        new RegExp(`(${tableFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                        '<mark class="bg-yellow-400/50 text-foreground rounded px-0.5">$1</mark>'
                                      )
                                    }} />
                                  ) : paramLeaf}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 align-middle">
                              <span
                                className="font-mono text-[12px] text-foreground/80 hover:text-foreground hover:bg-muted px-2 py-1 rounded transition-colors cursor-help break-all leading-snug inline-block max-w-full"
                                title={r.dn || r.moPath || '—'}
                              >
                                {r.moPath || <span className="text-muted-foreground/50">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-2 align-middle text-foreground font-mono text-[12px]" title={r.cell || '—'}>
                              {r.cell || <span className="text-muted-foreground/50">—</span>}
                              {r.bande && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.bande}</span>}
                            </td>
                            <td className={`px-4 py-2 align-middle text-right font-mono font-bold text-[13px] sticky right-[44px] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)] ${
                              i % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                            } ${
                              isZero ? 'text-muted-foreground/50' :
                              numVal !== null && numVal > 100 ? 'text-primary' :
                              'text-foreground'
                            }`}>
                              {r.value || '—'}
                            </td>
                            <td className={`px-2 py-2 align-middle sticky right-0 ${i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyValue(r.value || ''); }}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy value"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const SiteConfigTab: React.FC<{ siteName?: string | null }> = ({ siteName }) => {
  const [siteConfig, setSiteConfig] = React.useState<any>(null);
  const [configLoading, setConfigLoading] = React.useState(false);
  React.useEffect(() => {
    if (!siteName) return;
    setConfigLoading(true);
    fetch(getVpsProxyUrl('parser', `/api/v1/topo/site-config/${encodeURIComponent(siteName)}`), {
      headers: getVpsProxyHeaders(),
    }).then(r => r.json()).then(d => { setSiteConfig(d); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, [siteName]);
  if (configLoading) return <div className="p-4 text-center"><RefreshCw className="w-4 h-4 animate-spin mx-auto text-primary" /></div>;
  if (!siteConfig?.found) return <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">No site configuration data</div>;
  const sc = siteConfig;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[9px] font-bold text-muted-foreground uppercase">Total Cells</div>
          <div className="text-[22px] font-black text-primary">{sc.total_cells}</div>
          <div className="text-[9px] text-muted-foreground">{sc.cells_4g} 4G · {sc.cells_5g} 5G</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[9px] font-bold text-muted-foreground uppercase">Sectors</div>
          <div className="text-[22px] font-black text-foreground">{sc.sector_count || '—'}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[9px] font-bold text-muted-foreground uppercase">Vendor</div>
          <div className="text-[14px] font-black text-foreground mt-1">{sc.vendor || '—'}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Bandes</div>
        {sc.bands_4g && (
          <div className="px-3 py-2.5 text-[11px] border-b border-border/40 flex items-start gap-2">
            <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm shrink-0 mt-0.5 bg-[#F39C12]">4G</span>
            <span className="text-foreground/80 leading-relaxed flex flex-wrap gap-1">
              {sc.bands_4g.split(',').map((b: string, i: number) => (
                <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{b.trim()}</span>
              ))}
            </span>
          </div>
        )}
        {sc.bands_5g && (
          <div className="px-3 py-2.5 text-[11px] flex items-start gap-2">
            <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm shrink-0 mt-0.5 bg-[#27AE60]">5G</span>
            <span className="text-foreground/80 leading-relaxed flex flex-wrap gap-1">
              {sc.bands_5g.split(',').map((b: string, i: number) => (
                <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{b.trim()}</span>
              ))}
            </span>
          </div>
        )}
      </div>
      {(sc.baseband_model || sc.rru_model || sc.antenna_model || sc.sw_version) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Hardware</div>
          {sc.baseband_model && (
            <div className="px-3 py-2.5 text-[11px] border-b border-border/40">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">Baseband</div>
              <div className="flex flex-wrap gap-1">
                {sc.baseband_model.split(',').map((m: string, i: number) => (
                  <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-foreground/80">{m.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {sc.antenna_model && (
            <div className="px-3 py-2.5 text-[11px] border-b border-border/40">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">Antenna</div>
              <div className="flex flex-wrap gap-1">
                {sc.antenna_model.split(',').map((m: string, i: number) => (
                  <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-foreground/80">{m.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {sc.rru_model && (
            <div className="px-3 py-2.5 text-[11px] border-b border-border/40">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1">RRU/Radio</div>
              <div className="flex flex-wrap gap-1">
                {sc.rru_model.split(',').map((m: string, i: number) => (
                  <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-foreground/80">{m.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {sc.sw_version && (
            <div className="px-3 py-2.5 text-[11px] flex justify-between">
              <span className="text-muted-foreground">SW Version</span>
              <span className="font-mono font-semibold text-foreground/80">{sc.sw_version}</span>
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Localisation</div>
        {[
          {l: 'Plaque', v: sc.plaque}, {l: 'Région', v: sc.region}, {l: 'Zone ARCEP', v: sc.zone_arcep},
          {l: 'Latitude', v: sc.latitude?.toFixed(5)}, {l: 'Longitude', v: sc.longitude?.toFixed(5)},
        ].filter(x => x.v).map((x, i) => (
          <div key={i} className={`px-3 py-2 text-[11px] border-b border-border/40 last:border-0 flex justify-between ${i%2===0?'bg-muted/10':''}`}>
            <span className="text-muted-foreground">{x.l}</span><span className="font-semibold">{x.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SitesMonitor: React.FC<SitesMonitorProps> = ({ filters, onFilterChange, onCellSelect, highlightedCellIds = [], onClearHighlights, onLaunchAI, isVisible = true }) => {
  const mapCache = useMapSitesStore();
  const [sites, setSitesRaw] = useState<SiteSummary[]>(() => {
    // Restore from cache if valid
    if (mapCache.isCacheValid() && mapCache.cachedSites.length > 0) {
      return mapCache.cachedSites as any;
    }
    return [];
  });
  // Wrap setSites to also update cache (cache update deferred to avoid setState-during-render)
  const setSites = useCallback((newSites: SiteSummary[] | ((prev: SiteSummary[]) => SiteSummary[])) => {
    setSitesRaw((prev) => {
      const resolved = typeof newSites === 'function' ? newSites(prev) : newSites;
      // Defer cache update outside React's render cycle
      if (resolved.length > 0) {
        queueMicrotask(() => mapCache.setSitesCache(resolved as any, resolved.length, null, null));
      }
      return resolved;
    });
  }, [mapCache]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const selectedSiteIdRef = useRef<string | null>(null);
  useEffect(() => { selectedSiteIdRef.current = selectedSiteId; }, [selectedSiteId]);
  const [selectedSiteSnapshot, setSelectedSiteSnapshot] = useState<SiteSummary | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'map'>('map');
  const [localSearch, setLocalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchModeSites, setSearchModeSites] = useState<SiteSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const isSearchActive = localSearch.trim().length >= 2;
  const isValidMapCoords = (coords: [number, number] | null | undefined): coords is [number, number] => (
    Array.isArray(coords) && Number.isFinite(coords[0]) && Number.isFinite(coords[1])
  );
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyTarget, setFlyTargetRaw] = useState<[number, number] | null>(null);
  const setFlyTarget = useCallback((coords: [number, number] | null) => {
    if (!coords) {
      setFlyTargetRaw(null);
      return;
    }

    if (isValidMapCoords(coords)) {
      setFlyTargetRaw(coords);
    } else {
      console.warn('[SitesMonitor] Ignored invalid flyTarget:', coords);
    }
  }, []);
  const [searchCoordMarker, setSearchCoordMarker] = useState<[number, number] | null>(null);
  const [isFlying, setIsFlying] = useState(false);
  const isFlyingRef = useRef(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showAllSites, setShowAllSites] = useState(false);
  // ── Dynamic backend filters ──
  const {
    filterDefs: backendFilterDefs,
    activeFilters: backendActiveFilters,
    availableToAdd: backendAvailableToAdd,
    addFilter: backendAddFilter,
    toggleValue: backendToggleValue,
    removeFilter: backendRemoveFilter,
    clearAll: backendClearAll,
    buildQueryParams: backendBuildQueryParams,
  } = useSitesFilters();

  const [localVendor, setLocalVendor] = useState('ALL');
  const [localDor, setLocalDor] = useState('ALL');
  const [localPlaque, setLocalPlaque] = useState('ALL');
  const [localBande, setLocalBande] = useState('ALL');
  const [localZoneArcep, setLocalZoneArcep] = useState('ALL');
  const [localTechno, setLocalTechno] = useState<'ALL' | '4G' | '5G'>('ALL');
  const [mapKpi, setMapKpi] = useState('');
  const [kpiOverlayVendor, setKpiOverlayVendor] = useState<string | null>(null);
  const [kpiOverlays, setKpiOverlays] = useState<string[]>([]);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [showKpiDropdown, setShowKpiDropdown] = useState(false);
  const [showKpiLegend, setShowKpiLegend] = useState(true);
  const [showParamLegend, setShowParamLegend] = useState(true);
  const [showKpiOverlayPanel, setShowKpiOverlayPanel] = useState(false);
  const [kpiOverlayPanelLevels, setKpiOverlayPanelLevels] = useState<Set<'green' | 'orange' | 'red' | 'gray'>>(new Set(['green', 'orange', 'red', 'gray']));
  const [kpiOverlayPanelSearch, setKpiOverlayPanelSearch] = useState('');
  const [kpiOverlayPanelSort, setKpiOverlayPanelSort] = useState<'asc' | 'desc' | 'none'>('desc');
  const [hiddenKpiLevels, setHiddenKpiLevels] = useState<Set<'green'|'orange'|'red'|'gray'>>(new Set());
  // KPI value filter: e.g., ">98", "<50", "=100", ">=95"
  const [kpiValueFilter, setKpiValueFilter] = useState<string>('');
  const kpiValueFilterFn = useMemo(() => {
    const raw = kpiValueFilter.trim();
    if (!raw) return null;
    const match = raw.match(/^([><!]=?|=)\s*(-?\d+\.?\d*)$/);
    if (!match) return null;
    const op = match[1];
    const val = parseFloat(match[2]);
    if (!Number.isFinite(val)) return null;
    return (v: number): boolean => {
      if (!Number.isFinite(v)) return false;
      switch (op) {
        case '>': return v > val;
        case '>=': return v >= val;
        case '<': return v < val;
        case '<=': return v <= val;
        case '=': return Math.abs(v - val) < 0.01;
        case '!=': return Math.abs(v - val) >= 0.01;
        default: return true;
      }
    };
  }, [kpiValueFilter]);
  // Global KPI overlay color intensity multiplier (applied to all colored cells/beams/points)
  const [kpiOverlayIntensity, setKpiOverlayIntensity] = useState<number>(() => {
    const saved = parseFloat(localStorage.getItem('osmosis_kpi_overlay_intensity') || '');
    return Number.isFinite(saved) && saved > 0 ? Math.min(1.5, Math.max(0.2, saved)) : 1;
  });
  // Global KPI overlay transparency (0 = fully transparent, 1 = fully opaque) — multiplies on top of intensity
  const [kpiOverlayTransparency, setKpiOverlayTransparency] = useState<number>(() => {
    const saved = parseFloat(localStorage.getItem('osmosis_kpi_overlay_transparency') || '');
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
  });
  const [showKpiThresholdEditor, setShowKpiThresholdEditor] = useState(false);
  const [kpiSearch, setKpiSearch] = useState('');
  const [kpiValues, setKpiValues] = useState<Map<string, number>>(new Map());
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiDataIssue, setKpiDataIssue] = useState<string | null>(null);
  // ── KPI Overlay enhancements ──
  const [kpiAnalysisLevel, setKpiAnalysisLevel] = useState<'site' | 'cell' | 'band'>('cell');
  const [kpiTechnoFilter, setKpiTechnoFilter] = useState<'4G' | '5G'>('4G');
  const [kpiDateFrom, setKpiDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [kpiDateTo, setKpiDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [kpiThresholds, setKpiThresholds] = useState<Record<string, { green: number; orange: number; invert?: boolean; colorGreen?: string; colorOrange?: string; colorRed?: string }>>(() => {
    try {
      const saved = localStorage.getItem('osmosis_kpi_thresholds');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      rrc_sr: { green: 98, orange: 95 },
      erab_sr: { green: 98, orange: 95 },
      prb_usage: { green: 70, orange: 85, invert: true },
      throughput_dl: { green: 30, orange: 10 },
      throughput_ul: { green: 5, orange: 2 },
      avg_distance: { green: 2, orange: 5, invert: true },
      overshooting: { green: 12, orange: 20, invert: true },
      volte_drop: { green: 0.5, orange: 1, invert: true },
      cqi_avg: { green: 10, orange: 7 },
    };
  });
  const [catalogThresholds, setCatalogThresholds] = useState<Record<string, { green: number; orange: number; invert?: boolean }>>({});
  const [inventorySortOrder, setInventorySortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [activeViewFilters, setActiveViewFilters] = useState<{ mode: string; kpi?: string; operator?: string; threshold?: number; tech?: string; attribute?: string; value?: string }[]>([]);
  const [activeViewConditions, setActiveViewConditions] = useState<ViewFilterCondition[]>([]);
  const [showLegend, setShowLegend] = useState(true);
  // Visual Coverage layer (2026-05-11) — disabled by default. The
  // drop-in module from src/coverage/ owns its own runtime state
  // (fetched cells, polygon layer, panel counters). React keeps only
  // the on/off bit so save-view can persist it and handleLoadView can
  // restore it. The actual mount node is held in coveragePanelNode
  // and threaded down to DashboardInventoryTab.
  const [showVisualCoverage, setShowVisualCoverage] = useState(false);
  const [coveragePanelNode, setCoveragePanelNode] = useState<HTMLDivElement | null>(null);
  // KPI Overlay layer (2026-05-11) — driven by saved views of type
  // `kpi_overlay`. State holds the active view (or null when no KPI
  // overlay view is selected). The drop-in module no longer renders
  // its own legend (panelMount=null on the adapter); the legacy
  // sectorColorMode==='kpi' floating block owns the legend UI.
  const [activeKpiOverlayView, setActiveKpiOverlayView] = useState<KpiOverlayView | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ bounds: null, zoom: mapCache.cachedZoom || FRANCE_DEFAULT_ZOOM });
  const [initialCenter] = useState<[number, number] | null>(() => {
    if (!isValidMapCoords(mapCache.cachedCenter)) return null;
    // Reject [0,0] or coords far from France
    const [lat, lng] = mapCache.cachedCenter!;
    if (Math.abs(lat) < 1 && Math.abs(lng) < 1) return null;
    if (lat < 40 || lat > 52 || lng < -6 || lng > 10) return null;
    return mapCache.cachedCenter;
  });
  const displayModeRef = useRef<'sites' | 'cells'>('sites');
  const [mapRendering, setMapRendering] = useState(false);
  const [clusteringUnlocked, setClusteringUnlocked] = useState(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'sites' | 'points' | 'heatmap'>('sites');
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'satellite' | 'street'>('light');
  
  const [showSiteLabels, setShowSiteLabels] = useState(false);
  const [mapLabelFields, setMapLabelFields] = useState<Set<string>>(() => new Set(['site_name']));
  const [showBeamSectors, setShowBeamSectors] = useState(true);
  const [activeMapTool, setActiveMapTool] = useState<'distance' | 'polygon' | 'radius' | 'profile' | 'zoomarea' | null>(null);
  const [zoomAreaOrigin, setZoomAreaOrigin] = useState<[number, number] | null>(null);
  const [zoomAreaCurrent, setZoomAreaCurrent] = useState<[number, number] | null>(null);
  const [profileTarget, setProfileTarget] = useState<[number, number] | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<{ points: any[]; analysis: any } | null>(null);
  const [distanceMeasurePoints, setDistanceMeasurePoints] = useState<[number, number][]>([]);
  const [distanceCursorPos, setDistanceCursorPos] = useState<[number, number] | null>(null);
  const [radiusCenter, setRadiusCenter] = useState<[number, number] | null>(null);
  const [radiusConfirmed, setRadiusConfirmed] = useState(false);
  const [radiusLiveMeters, setRadiusLiveMeters] = useState(0);
  const [radiusConfirmedMeters, setRadiusConfirmedMeters] = useState(0);
  const RADIUS_PRESETS = [500, 1000, 3000, 5000];
  const RADIUS_RING_COLORS = ['hsl(200,70%,55%)', 'hsl(160,60%,50%)', 'hsl(45,80%,50%)', 'hsl(350,65%,55%)', 'hsl(270,55%,55%)'];
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const [colorViewMode, setColorViewMode] = useState<ColorViewMode>('none');
  const [showColorViewDropdown, setShowColorViewDropdown] = useState(false);

  // ── Saved distance measurements ──
  interface SavedMeasurement {
    id: string;
    name: string;
    from: [number, number];
    to: [number, number];
    distanceMeters: number;
    azimuth: number;
    label: string;
    createdAt: string;
  }
  const MEAS_KEY = 'osmosis_saved_measurements';
  const loadMeasurements = (): SavedMeasurement[] => {
    try { const s = localStorage.getItem(MEAS_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  };
  const persistMeasurements = (m: SavedMeasurement[]) => {
    try { localStorage.setItem(MEAS_KEY, JSON.stringify(m)); } catch {}
  };
  const [savedMeasurements, setSavedMeasurements] = useState<SavedMeasurement[]>(loadMeasurements);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [renamingMeasurementId, setRenamingMeasurementId] = useState<string | null>(null);
  const [measurementRenameValue, setMeasurementRenameValue] = useState('');
  const measurementCounter = useRef(savedMeasurements.length + 1);

  const addSavedMeasurement = useCallback((from: [number, number], to: [number, number]) => {
    const fromLL = { lat: from[0], lng: from[1] };
    const toLL = { lat: to[0], lng: to[1] };
    const distanceMeters = haversineDistance(fromLL, toLL);
    const az = Math.round(bearing(fromLL, toLL));
    const label = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 1 : 2)} km`
      : `${Math.round(distanceMeters)} m`;
    const num = measurementCounter.current++;
    const m: SavedMeasurement = {
      id: `meas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Measure ${String(num).padStart(2, '0')}`,
      from, to, distanceMeters, azimuth: az, label,
      createdAt: new Date().toISOString(),
    };
    setSavedMeasurements(prev => {
      const next = [...prev, m];
      persistMeasurements(next);
      return next;
    });
    setSelectedMeasurementId(m.id);
    setInventoryTab('tagged');
  }, []);

  const deleteSavedMeasurement = useCallback((id: string) => {
    setSavedMeasurements(prev => {
      const next = prev.filter(m => m.id !== id);
      persistMeasurements(next);
      return next;
    });
    if (selectedMeasurementId === id) setSelectedMeasurementId(null);
  }, [selectedMeasurementId]);

  const renameSavedMeasurement = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setSavedMeasurements(prev => {
      const next = prev.map(m => m.id === id ? { ...m, name: newName.trim() } : m);
      persistMeasurements(next);
      return next;
    });
    setRenamingMeasurementId(null);
    setMeasurementRenameValue('');
  }, []);

  useEffect(() => {
    if (activeMapTool !== 'distance' && distanceMeasurePoints.length > 0) {
      setDistanceMeasurePoints([]);
      setDistanceCursorPos(null);
    }
    if (activeMapTool !== 'polygon') {
      setPolygonPoints([]);
      setPolygonClosed(false);
    }
    if (activeMapTool !== 'radius') {
      setRadiusCenter(null);
    }
    if (activeMapTool !== 'profile') {
      setProfileTarget(null);
      setProfileData(null);
    }
    if (activeMapTool !== 'zoomarea') {
      setZoomAreaOrigin(null);
      setZoomAreaCurrent(null);
    }
  }, [activeMapTool, distanceMeasurePoints.length]);

  const handleDistanceMeasureClick = useCallback((latlng: LatLng) => {
    const point: [number, number] = [latlng.lat, latlng.lng];
    setDistanceMeasurePoints(prev => {
      if (prev.length >= 2) {
        // Start new measurement
        return [point];
      }
      if (prev.length === 1) {
        // Save measurement automatically
        addSavedMeasurement(prev[0], point);
        return [...prev, point];
      }
      return [point];
    });
  }, [addSavedMeasurement]);

  const distanceMeasurement = useMemo(() => {
    if (distanceMeasurePoints.length !== 2) return null;

    const [from, to] = distanceMeasurePoints;
    const fromLL = { lat: from[0], lng: from[1] };
    const toLL = { lat: to[0], lng: to[1] };
    const distanceMeters = haversineDistance(fromLL, toLL);
    const azimuth = Math.round(bearing(fromLL, toLL));
    const label = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 1 : 2)} km`
      : `${Math.round(distanceMeters)} m`;

    return { azimuth, label };
  }, [distanceMeasurePoints]);

  const livePreviewMeasurement = useMemo(() => {
    if (distanceMeasurePoints.length !== 1 || !distanceCursorPos) return null;
    const from = distanceMeasurePoints[0];
    const fromLL = { lat: from[0], lng: from[1] };
    const toLL = { lat: distanceCursorPos[0], lng: distanceCursorPos[1] };
    const distanceMeters = haversineDistance(fromLL, toLL);
    const azimuth = Math.round(bearing(fromLL, toLL));
    const label = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 1 : 2)} km`
      : `${Math.round(distanceMeters)} m`;
    return { azimuth, label };
  }, [distanceMeasurePoints, distanceCursorPos]);

  const handleMapToolToggle = useCallback((tool: 'distance' | 'polygon' | 'radius' | 'profile' | 'zoomarea') => {
    setDistanceMeasurePoints([]);
    setRadiusCenter(null);
    setRadiusConfirmed(false);
    setRadiusLiveMeters(0);
    setRadiusConfirmedMeters(0);
    setPolygonPoints([]);
    setPolygonClosed(false);
    setProfileTarget(null);
    setProfileData(null);
    setZoomAreaOrigin(null);
    setZoomAreaCurrent(null);
    setActiveMapTool(prev => (prev === tool ? null : tool));
  }, []);

  const handleProfileClick = useCallback((latlng: LatLng) => {
    setProfileTarget([latlng.lat, latlng.lng]);
  }, []);

  const handleRadiusSetCenter = useCallback((latlng: LatLng) => {
    setRadiusCenter([latlng.lat, latlng.lng]);
    setRadiusConfirmed(false);
    setRadiusLiveMeters(0);
    setRadiusConfirmedMeters(0);
  }, []);

  const handleRadiusConfirm = useCallback((radiusM: number) => {
    setRadiusConfirmedMeters(radiusM);
    setRadiusConfirmed(true);
  }, []);

  const handleRadiusPreview = useCallback((radiusM: number) => {
    setRadiusLiveMeters(radiusM);
  }, []);

  const handleRadiusPreset = useCallback((preset: number) => {
    if (radiusCenter) {
      setRadiusConfirmedMeters(preset);
      setRadiusConfirmed(true);
    }
  }, [radiusCenter]);

  const handlePolygonClick = useCallback((latlng: LatLng) => {
    if (polygonClosed) return;
    setPolygonPoints(prev => [...prev, [latlng.lat, latlng.lng]]);
  }, [polygonClosed]);

  const handlePolygonDblClick = useCallback(() => {
    if (polygonPoints.length >= 3) {
      setPolygonClosed(true);
      // Auto-prompt user to save polygon as a cluster
      setShowClusterPrompt(true);
    }
  }, [polygonPoints.length]);

  // ── Polygon → Cluster creation flow ──
  const [showClusterPrompt, setShowClusterPrompt] = useState(false);
  const [clusterStep, setClusterStep] = useState<'ask' | 'name'>('ask');
  const [clusterName, setClusterName] = useState('');
  const [clusterDescription, setClusterDescription] = useState('');
  const [savingCluster, setSavingCluster] = useState(false);
  const [clusterSaveError, setClusterSaveError] = useState<string | null>(null);
  // Ref to filteredSites so polygonStats (declared earlier) can read latest value
  const filteredSitesRef = useRef<any[]>([]);

  // Polygon area (Shoelace formula on geodesic approx) & perimeter
  const polygonStats = useMemo(() => {
    if (!polygonClosed || polygonPoints.length < 3) return null;
    let perimeter = 0;
    for (let i = 0; i < polygonPoints.length; i++) {
      const a = polygonPoints[i];
      const b = polygonPoints[(i + 1) % polygonPoints.length];
      perimeter += haversineDistance({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    }
    // Spherical excess approximation for area
    const toRad = (d: number) => d * Math.PI / 180;
    let area = 0;
    const pts = polygonPoints.map(p => [toRad(p[0]), toRad(p[1])]);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += (pts[j][1] - pts[i][1]) * (2 + Math.sin(pts[i][0]) + Math.sin(pts[j][0]));
    }
    area = Math.abs(area * 6371000 * 6371000 / 2);

    const fmtArea = area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${Math.round(area)} m²`;
    const fmtPerimeter = perimeter >= 1000 ? `${(perimeter / 1000).toFixed(2)} km` : `${Math.round(perimeter)} m`;

    // Point-in-polygon (ray-casting) to count sites/cells inside
    const pointInPoly = (lat: number, lng: number): boolean => {
      let inside = false;
      for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const [yi, xi] = polygonPoints[i];
        const [yj, xj] = polygonPoints[j];
        const intersect = ((yi > lat) !== (yj > lat)) &&
          (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    let sitesInside = 0;
    let cellsInside = 0;
    const siteIdsInside: string[] = [];
    const siteNamesInside: string[] = [];
    for (const s of filteredSitesRef.current) {
      const [lat, lng] = s.coordinates || [];
      if (lat == null || lng == null) continue;
      if (pointInPoly(lat, lng)) {
        sitesInside++;
        cellsInside += Array.isArray(s.cells) ? s.cells.length : 0;
        if (s.site_id) siteIdsInside.push(String(s.site_id));
        if (s.site_name) siteNamesInside.push(String(s.site_name));
      }
    }

    return { area, perimeter, fmtArea, fmtPerimeter, sitesInside, cellsInside, siteIdsInside, siteNamesInside };
  }, [polygonClosed, polygonPoints]);

  // ── Auto-tag closed polygon to active dashboard ──
  // When a polygon is closed AND a dashboard is active, persist it as a
  // TaggedPolygon so it appears in the left "Tagged" sidebar and survives
  // dashboard switches. Saving as a reusable cluster (filter) is still
  // proposed via the existing dialog and remains a separate concern.
  const polygonAutoTaggedRef = useRef<string | null>(null);
  const addTaggedPolygonRef = useRef<((p: any) => any) | null>(null);
  useEffect(() => {
    if (!polygonClosed || !polygonStats) return;
    // Tag without requiring an active dashboard — falls back to default scope.
    if (!addTaggedPolygonRef.current) return;
    // Fingerprint to avoid re-tagging the same closed polygon on every
    // re-render (e.g. after sites refresh changing polygonStats).
    const fp = polygonPoints.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
    if (polygonAutoTaggedRef.current === fp) return;
    polygonAutoTaggedRef.current = fp;
    const latSum = polygonPoints.reduce((s, p) => s + p[0], 0);
    const lngSum = polygonPoints.reduce((s, p) => s + p[1], 0);
    const center: [number, number] = [latSum / polygonPoints.length, lngSum / polygonPoints.length];
    addTaggedPolygonRef.current({
      points: polygonPoints.slice() as [number, number][],
      center,
      fmtArea: polygonStats.fmtArea,
      fmtPerimeter: polygonStats.fmtPerimeter,
      sitesInside: polygonStats.sitesInside,
      cellsInside: polygonStats.cellsInside,
    });
  }, [polygonClosed, polygonStats, polygonPoints]);

  // Reset auto-tag fingerprint whenever the polygon tool clears (so a brand
  // new polygon can be tagged again).
  useEffect(() => {
    if (!polygonClosed && polygonPoints.length === 0) {
      polygonAutoTaggedRef.current = null;
    }
  }, [polygonClosed, polygonPoints.length]);

  // ── Auto-tag confirmed radius circle as a TaggedPolygon ──
  // Approximate the circle with 72 vertices and persist via addTaggedPolygon
  // so radius creations show up under "Tagged Objects" like polygons.
  const radiusAutoTaggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!radiusConfirmed || !radiusCenter || radiusConfirmedMeters <= 0) return;
    // Tag without requiring an active dashboard — falls back to default scope.
    if (!addTaggedPolygonRef.current) return;
    const fp = `${radiusCenter[0].toFixed(5)},${radiusCenter[1].toFixed(5)}@${Math.round(radiusConfirmedMeters)}`;
    if (radiusAutoTaggedRef.current === fp) return;
    radiusAutoTaggedRef.current = fp;
    const STEPS = 72;
    const [cLat, cLng] = radiusCenter;
    const points: [number, number][] = [];
    for (let i = 0; i < STEPS; i++) {
      const rad = (i / STEPS) * 2 * Math.PI;
      const dlat = (radiusConfirmedMeters / 111320) * Math.cos(rad);
      const dlng = (radiusConfirmedMeters / (111320 * Math.cos(cLat * Math.PI / 180))) * Math.sin(rad);
      points.push([cLat + dlat, cLng + dlng]);
    }
    const r = radiusConfirmedMeters;
    const fmtRadius = r >= 1000 ? `${(r / 1000).toFixed(2)} km` : `${Math.round(r)} m`;
    const area = Math.PI * r * r;
    const fmtArea = area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${Math.round(area)} m²`;
    const perimeter = 2 * Math.PI * r;
    const fmtPerimeter = perimeter >= 1000 ? `${(perimeter / 1000).toFixed(2)} km` : `${Math.round(perimeter)} m`;
    addTaggedPolygonRef.current({
      name: `Cercle ${fmtRadius}`,
      points,
      center: radiusCenter,
      fmtArea,
      fmtPerimeter,
      circleCenter: radiusCenter,
      circleRadiusM: radiusConfirmedMeters,
    });
  }, [radiusConfirmed, radiusCenter, radiusConfirmedMeters]);

  // Reset radius auto-tag fingerprint when the radius tool clears.
  useEffect(() => {
    if (!radiusCenter && !radiusConfirmed) {
      radiusAutoTaggedRef.current = null;
    }
  }, [radiusCenter, radiusConfirmed]);

  const displayMode = viewport.zoom >= SITES_TO_CELLS_ZOOM
    ? 'cells'
    : viewport.zoom <= CELLS_TO_SITES_ZOOM
      ? 'sites'
      : displayModeRef.current;

  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  const TILE_URLS: Record<typeof mapLayer, { url: string; attribution: string }> = {
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    },
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  };

  const [mapTechnoFilter, setMapTechnoFilter] = useState<'ALL' | '2G' | '3G' | '4G' | '5G' | 'OFF'>('ALL');
  const [enabledBands, setEnabledBands] = useState<Set<string>>(new Set(Object.keys(DEFAULT_BAND_COLORS)));
  const [enabledTechnos, setEnabledTechnos] = useState<Set<TechGroup>>(new Set(['2G', '3G', '5G', '4G']));
  const [showBandPanel, setShowBandPanel] = useState(true);
  const [bandPanelMode, setBandPanelMode] = useState<'tech' | 'cell'>('tech');
  const [sectorColorMode, _setSectorColorMode] = useState<'topo' | 'kpi'>('topo');
  const setSectorColorMode = useCallback((mode: 'topo' | 'kpi') => {
    console.trace(`[MODE CHANGE] sectorColorMode → ${mode}`);
    _setSectorColorMode(mode);
  }, []);
  const [topoResetCounter, setTopoResetCounter] = useState(0);
  const [bandColors, setBandColors] = useState<Record<string, string>>(loadCustomBandColors);
  const [editingColorBand, setEditingColorBand] = useState<string | null>(null);

  // ── TOPO mode: fetch global network stats from DB ──
  const [topoNetworkStats, setTopoNetworkStats] = useState<TopoNetworkStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        // Fetch from VPS /global-network API (pre-computed, instant, accurate)
        const resp = await fetch(getVpsProxyUrl('parser', '/api/v1/topo/global-network'), {
          headers: getVpsProxyHeaders(),
        });
        const stats = await resp.json();
        if (cancelled) return;

        const result: TopoNetworkStats = {
          ...EMPTY_TOPO_NETWORK_STATS,
          bandMap4G: {},
          bandMap5G: {},
          vendorMap: {},
        };

        for (const t of (stats.by_techno || [])) {
          if (t.techno === '5G' || t.techno === 'NR') {
            result.sites5G = t.sites || 0;
            result.cells5G = t.cells || 0;
          } else if (t.techno === '4G' || t.techno === 'LTE') {
            result.sites4G = t.sites || 0;
            result.cells4G = t.cells || 0;
          } else if (t.techno === '3G' || t.techno === 'UMTS' || t.techno === 'WCDMA') {
            result.sites3G = t.sites || 0;
            result.cells3G = t.cells || 0;
          } else if (t.techno === '2G' || t.techno === 'GSM') {
            result.sites2G = t.sites || 0;
            result.cells2G = t.cells || 0;
          }
        }

        for (const b of (stats.by_band || [])) {
          const rawBand = b.band || 'Unknown';
          const is5GBand = /^NR|^5G/i.test(rawBand);
          const is3GBand = /^UMTS|^WCDMA|^3G/i.test(rawBand);
          const is2GBand = /^GSM|^2G/i.test(rawBand);
          const techGroup = is5GBand ? '5G' : is3GBand ? '3G' : is2GBand ? '2G' : '4G';
          const normalizedBand = normalizeBandKey(rawBand, techGroup) || rawBand;
          if (is5GBand) result.bandMap5G[normalizedBand] = (result.bandMap5G[normalizedBand] || 0) + (b.cells || 0);
          else if (is3GBand) (result as any).bandMap3G = (result as any).bandMap3G || {}, (result as any).bandMap3G[normalizedBand] = ((result as any).bandMap3G[normalizedBand] || 0) + (b.cells || 0);
          else if (is2GBand) (result as any).bandMap2G = (result as any).bandMap2G || {}, (result as any).bandMap2G[normalizedBand] = ((result as any).bandMap2G[normalizedBand] || 0) + (b.cells || 0);
          else result.bandMap4G[normalizedBand] = (result.bandMap4G[normalizedBand] || 0) + (b.cells || 0);
        }

        for (const v of (stats.by_vendor || [])) {
          result.vendorMap[v.vendor] = { '2G': v.cells_2g || 0, '3G': v.cells_3g || 0, '4G': v.cells_4g || v.cells || 0, '5G': v.cells_5g || 0 };
        }

        // VPS returns cells but sites=0 → get site counts from DB RPC
        if (result.sites4G === 0 && result.sites5G === 0 && (result.cells4G > 0 || result.cells5G > 0)) {
          try {
            const { data: rpcResult } = await supabase.rpc('topo_inventory_stats');
            if (!cancelled && rpcResult && typeof rpcResult === 'object') {
              const r = rpcResult as Record<string, unknown>;
              result.sites4G = Number(r.sites_4g) || 0;
              result.sites5G = Number(r.sites_5g) || 0;
              // Also override cell counts if more accurate
              if (Number(r.cells_4g) > 0) result.cells4G = Number(r.cells_4g);
              if (Number(r.cells_5g) > 0) result.cells5G = Number(r.cells_5g);
            }
          } catch (rpcErr) {
            console.warn('[TOPO] topo_inventory_stats RPC failed:', rpcErr);
          }
        }

        setTopoNetworkStats(result);
      } catch (e) {
        console.error('[TOPO] Failed to fetch network stats from VPS, computing from local cells…', e);
        if (cancelled) return;
        // Fallback: compute from local topo cell cache
        try {
          const cells = await topoApi.list(50000, 0).then(d => d.rows || []);
          if (cancelled) return;
          const fallback = buildTopoNetworkStatsFromRows(cells);
          console.log('[TOPO] Fallback stats computed from', cells.length, 'local cells:', fallback);
          setTopoNetworkStats(fallback);
        } catch (e2) {
          console.error('[TOPO] Fallback stats also failed:', e2);
          setTopoNetworkStats(EMPTY_TOPO_NETWORK_STATS);
        }
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  // Dynamic color getters using state
  const getBandColor = useCallback((bande: string, techno?: string): string => {
    const key = normalizeBandKey(bande, techno);
    if (!key) {
      if (is5GTech(techno)) return bandColors['5G_GROUP'] || '#27AE60';
      if (is3GTech(techno)) return bandColors['3G_GROUP'] || '#3498DB';
      if (is2GTech(techno)) return bandColors['2G_GROUP'] || '#8E44AD';
      return bandColors['4G_GROUP'] || '#F39C12';
    }
    return bandColors[key] || DEFAULT_BAND_COLORS[key];
  }, [bandColors]);

  const getBandStrokeColor = useCallback((bande: string, techno?: string): string => {
    const key = normalizeBandKey(bande, techno);
    if (!key) {
      if (is5GTech(techno)) return deriveStrokeColor(bandColors['5G_GROUP'] || '#27AE60');
      if (is3GTech(techno)) return deriveStrokeColor(bandColors['3G_GROUP'] || '#3498DB');
      if (is2GTech(techno)) return deriveStrokeColor(bandColors['2G_GROUP'] || '#8E44AD');
      return deriveStrokeColor(bandColors['4G_GROUP'] || '#F39C12');
    }
    return deriveStrokeColor(bandColors[key] || DEFAULT_BAND_COLORS[key]);
  }, [bandColors]);

  const NR_BANDS = ['NR3500', 'NR700', 'NR2100', 'NR1800', 'NR2600', 'NR1400'];
  const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700', 'L900'];

  const updateBandColor = useCallback((band: string, color: string) => {
    setBandColors(prev => {
      const next = { ...prev, [band]: color };
      // When changing a group color, propagate to all bands in that group
      if (band === '5G_GROUP') {
        NR_BANDS.forEach(b => { next[b] = color; });
      } else if (band === '4G_GROUP') {
        LTE_BANDS.forEach(b => { next[b] = color; });
      }
      localStorage.setItem('osmosis_band_colors', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetBandColors = useCallback(() => {
    setBandColors({ ...DEFAULT_BAND_COLORS });
    localStorage.removeItem('osmosis_band_colors');
  }, []);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [loadingCellsForSite, setLoadingCellsForSite] = useState<string | null>(null);

  // Focus mode: 'global' | 'site' | 'cell'
  const [focusMode, setFocusMode] = useState<'global' | 'site' | 'cell'>('global');
  const [focusCellId, setFocusCellId] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [hiddenTechs, setHiddenTechs] = useState<Set<string>>(new Set());
  const [cellDetailTab, setCellDetailTab] = useState<'kpi' | 'topo' | 'sim' | 'config' | 'alarms' | 'cm' | 'neighbors'>('kpi');

  // Alarms and CM History
  const [siteAlarms, setSiteAlarms] = useState<any[]>([]);
  const [siteAlarmsLoading, setSiteAlarmsLoading] = useState(false);
  const [siteCmHistory, setSiteCmHistory] = useState<any[]>([]);
  const [siteCmLoading, setSiteCmLoading] = useState(false);

  // Fetch alarms when tab is selected
  useEffect(() => {
    if (cellDetailTab !== 'alarms' || !siteDetail) return;
    setSiteAlarmsLoading(true);
    fetch(getVpsProxyUrl('parser', `/api/v1/topo/site-alarms?site_name=${encodeURIComponent(siteDetail.site_name)}&limit=50`), {
      headers: getVpsProxyHeaders(),
    }).then(r => r.json()).then(d => {
      setSiteAlarms(d.alarms || []);
    }).catch(() => setSiteAlarms([]))
    .finally(() => setSiteAlarmsLoading(false));
  }, [cellDetailTab, siteDetail?.site_name]);

  // Fetch CM history when tab is selected
  useEffect(() => {
    if (cellDetailTab !== 'cm' || !siteDetail) return;
    setSiteCmLoading(true);
    fetch(getVpsProxyUrl('parser', `/api/v1/topo/site-cm-history?site_name=${encodeURIComponent(siteDetail.site_name)}&limit=50`), {
      headers: getVpsProxyHeaders(),
    }).then(r => r.json()).then(d => {
      setSiteCmHistory(d.changes || []);
    }).catch(() => setSiteCmHistory([]))
    .finally(() => setSiteCmLoading(false));
  }, [cellDetailTab, siteDetail?.site_name]);

  // LTE Cell Configuration from parameter_dump
  const [lteConfig, setLteConfig] = useState<{
    pmax: number | null;
    dlChBw: string | null;
    dlMimoMode: string | null;
    dlRsBoost: number | null;
    loading: boolean;
    cellName: string | null;
  }>({ pmax: null, dlChBw: null, dlMimoMode: null, dlRsBoost: null, loading: false, cellName: null });

  // LTE mappings
  const DL_CH_BW_TO_PRB: Record<string, number> = { '1.4': 6, '3': 15, '5': 25, '10': 50, '15': 75, '20': 100 };
  const MIMO_MODE_MAP: Record<string, string> = {
    '0': 'SingleTX', '10': 'TXDiv', '11': '4-way TXDiv',
    '30': 'Dynamic Open Loop MIMO', '40': 'Closed Loop MIMO',
    '41': 'Closed Loop MIMO (4x2)', '43': 'Closed Loop MIMO (4x4)',
  };

  const getLteConfigValues = () => {
    const bwMhz = lteConfig.dlChBw;
    const prb = bwMhz ? DL_CH_BW_TO_PRB[bwMhz] ?? null : null;
    const mimoLabel = lteConfig.dlMimoMode ? (MIMO_MODE_MAP[lteConfig.dlMimoMode] ?? `Unknown (${lteConfig.dlMimoMode})`) : null;
    let rsPower: number | null = null;
    if (lteConfig.pmax != null && prb != null && lteConfig.dlRsBoost != null) {
      rsPower = lteConfig.pmax - 10 * Math.log10(prb) + lteConfig.dlRsBoost;
    }
    return { prb, mimoLabel, rsPower, bwMhz: bwMhz ? `${bwMhz} MHz` : null };
  };
  const [inventoryTab, setInventoryTab] = useState<'sites' | 'dashboard' | 'tagged' | 'kpi'>('dashboard');

  // ── Tagged / pinned sites (scoped per dashboard) ──
  const [taggedSites, setTaggedSites] = useState<SiteSummary[]>([]);
  const [taggedDisplayMode, setTaggedDisplayMode] = useState<'all' | 'tagged-only'>('all');
  // dashboardIdRef is used inside callbacks so we always read latest activeDashboardId
  const activeDashboardIdRef = useRef<string | null>(null);
  const persistTaggedSites = useCallback((next: SiteSummary[]) => {
    setTaggedSites(next);
    persistTaggedSitesScoped(next, activeDashboardIdRef.current);
  }, []);
  const isSiteTagged = useCallback((siteId: string) => taggedSites.some(s => s.site_id === siteId), [taggedSites]);
  const toggleTagSite = useCallback((site: SiteSummary) => {
    setTaggedSites(prev => {
      const exists = prev.some(s => s.site_id === site.site_id);
      const next = exists ? prev.filter(s => s.site_id !== site.site_id) : [...prev, site];
      persistTaggedSitesScoped(next, activeDashboardIdRef.current);
      return next;
    });
  }, []);

  // ── Custom Map Points (scoped per dashboard) ──
  const [customPoints, setCustomPoints] = useState<CustomMapPoint[]>([]);
  const [pointCreationMode, setPointCreationMode] = useState(false);
  const [renamingPointId, setRenamingPointId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Transient highlight for newly created tagged objects (polygon/radius/point/link).
  const [highlightedTaggedId, setHighlightedTaggedId] = useState<string | null>(null);
  const flashHighlight = useCallback((id: string) => {
    setHighlightedTaggedId(id);
    setInventoryTab('tagged');
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-tagged-id="${id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => {
      setHighlightedTaggedId(curr => (curr === id ? null : curr));
    }, 2200);
  }, []);

  const addCustomPoint = useCallback((lat: number, lon: number) => {
    let createdId: string | null = null;
    setCustomPoints(prev => {
      const idx = prev.length + 1;
      const pt: CustomMapPoint = {
        id: `cp_${Date.now()}`,
        name: `Point ${idx}`,
        type: 'custom_point',
        lat,
        lon,
        createdAt: new Date().toISOString(),
      };
      createdId = pt.id;
      const next = [...prev, pt];
      if (activeDashboardIdRef.current) {
        persistCustomPoints(next, activeDashboardIdRef.current);
      }
      return next;
    });
    setPointCreationMode(false);
    if (createdId) flashHighlight(createdId);
  }, [flashHighlight]);

  const deleteCustomPoint = useCallback((id: string) => {
    setCustomPoints(prev => {
      const next = prev.filter(p => p.id !== id);
      persistCustomPoints(next, activeDashboardIdRef.current);
      return next;
    });
  }, []);

  const renameCustomPoint = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomPoints(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: newName.trim() } : p);
      persistCustomPoints(next, activeDashboardIdRef.current);
      return next;
    });
    setRenamingPointId(null);
    setRenameValue('');
  }, []);

  // ── Tagged Polygons (scoped per dashboard) ──
  const [taggedPolygons, setTaggedPolygons] = useState<TaggedPolygon[]>([]);
  const [renamingPolygonId, setRenamingPolygonId] = useState<string | null>(null);
  const [renamePolygonValue, setRenamePolygonValue] = useState('');


  const addTaggedPolygon = useCallback((poly: Omit<TaggedPolygon, 'id' | 'createdAt' | 'type' | 'name'> & { name?: string }) => {
    // Allow tagging even when no dashboard is active (default scope).
    let created: TaggedPolygon | null = null;
    setTaggedPolygons(prev => {
      const idx = prev.length + 1;
      const p: TaggedPolygon = {
        id: `pg_${Date.now()}`,
        name: poly.name?.trim() || `Polygone ${idx}`,
        type: 'tagged_polygon',
        points: poly.points,
        center: poly.center,
        fmtArea: poly.fmtArea,
        fmtPerimeter: poly.fmtPerimeter,
        sitesInside: poly.sitesInside,
        cellsInside: poly.cellsInside,
        circleCenter: poly.circleCenter,
        circleRadiusM: poly.circleRadiusM,
        createdAt: new Date().toISOString(),
      };
      created = p;
      const next = [...prev, p];
      persistTaggedPolygons(next, activeDashboardIdRef.current);
      return next;
    });
    if (created) flashHighlight((created as TaggedPolygon).id);
    return created;
  }, [flashHighlight]);

  const deleteTaggedPolygon = useCallback((id: string) => {
    setTaggedPolygons(prev => {
      const next = prev.filter(p => p.id !== id);
      persistTaggedPolygons(next, activeDashboardIdRef.current);
      return next;
    });
  }, []);

  const renameTaggedPolygon = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setTaggedPolygons(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: newName.trim() } : p);
      persistTaggedPolygons(next, activeDashboardIdRef.current);
      return next;
    });
    setRenamingPolygonId(null);
    setRenamePolygonValue('');
  }, []);

  // Wire ref so the polygon-close auto-tag effect can call addTaggedPolygon
  // even though that effect is declared earlier in the component body.
  useEffect(() => { addTaggedPolygonRef.current = addTaggedPolygon as any; }, [addTaggedPolygon]);

  const [taggedLinks, setTaggedLinks] = useState<TaggedLink[]>([]);
  const [linkCreationMode, setLinkCreationMode] = useState(false);
  const [linkSource, setLinkSource] = useState<{ id: string; type: 'site' | 'point'; label: string; coords: [number, number] } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  // Pending link being configured: both endpoints chosen, but the user must
  // pick a band per site-endpoint before the link is committed. The closest
  // sector is auto-derived from the target bearing.
  const [pendingLink, setPendingLink] = useState<{
    from: { id: string; type: 'site' | 'point'; label: string; coords: [number, number] };
    to: { id: string; type: 'site' | 'point'; label: string; coords: [number, number] };
    fromBand: string | null;
    toBand: string | null;
    /** manual sector overrides (cell_id), null = use auto-pick */
    fromCellOverride: string | null;
    toCellOverride: string | null;
  } | null>(null);

  const commitTaggedLink = useCallback((from: typeof linkSource, to: typeof linkSource, extra?: { fromSector?: TaggedLinkSector | null; toSector?: TaggedLinkSector | null }) => {
    if (!from || !to) return;
    if (from.id === to.id) return;
    const link = createTaggedLink(from, to, extra);
    setTaggedLinks(prev => {
      const next = [...prev, link];
      if (activeDashboardIdRef.current) {
        persistTaggedLinks(next, activeDashboardIdRef.current);
      }
      return next;
    });
    setLinkCreationMode(false);
    setLinkSource(null);
    setPendingLink(null);
    flashHighlight(link.id);
  }, [flashHighlight]);

  // Backwards-compat alias used elsewhere; opens the band/sector configurator
  // when at least one endpoint is a site, otherwise commits straight away.
  const addTaggedLink = useCallback((from: typeof linkSource, to: typeof linkSource) => {
    if (!from || !to || from.id === to.id) return;
    if (from.type === 'point' && to.type === 'point') {
      commitTaggedLink(from, to);
      return;
    }
    setPendingLink({
      from, to,
      fromBand: null, toBand: null,
      fromCellOverride: null, toCellOverride: null,
    });
  }, [commitTaggedLink]);

  const deleteTaggedLink = useCallback((linkId: string) => {
    setTaggedLinks(prev => {
      const next = prev.filter(l => l.id !== linkId);
      persistTaggedLinks(next, activeDashboardIdRef.current);
      return next;
    });
    if (selectedLinkId === linkId) setSelectedLinkId(null);
  }, [selectedLinkId]);

  const handleSelectTaggedForLink = useCallback((site: SiteSummary) => {
    const obj = { id: site.site_id, type: 'site' as const, label: site.site_name, coords: site.coordinates };
    if (!linkSource) {
      setLinkSource(obj);
    } else {
      if (linkSource.id !== obj.id) {
        addTaggedLink(linkSource, obj);
      }
    }
  }, [linkSource, addTaggedLink]);


  // ── Terrain Profile for Links ──
  const { loading: linkProfileLoading, profilePoints: linkProfilePoints, analysis: linkProfileAnalysis, error: linkProfileError, computeProfile: linkComputeProfile } = useTerrainProfile();
  const [showLinkProfile, setShowLinkProfile] = useState(false);
  const [linkProfileLabel, setLinkProfileLabel] = useState('');
  const [linkProfileHover, setLinkProfileHover] = useState<ProfileHoverData | null>(null);
  const [linkEnableCurvature, setLinkEnableCurvature] = useState(true);
  const [linkEnableFresnel, setLinkEnableFresnel] = useState(false);
  const [linkEnableClutter, setLinkEnableClutter] = useState(false);
  const [linkClutterHeight, setLinkClutterHeight] = useState(0);
  const [linkActiveCoords, setLinkActiveCoords] = useState<{ from: [number, number]; to: [number, number] } | null>(null);
  // Profile mode: 'link' = site-to-site microwave (LOS + Fresnel between two
  // antennas); 'coverage' = single-antenna ground-coverage view (sector toward
  // terrain). Default 'link' for back-compat with existing tagged-link flow.
  const [linkProfileMode, setLinkProfileMode] = useState<'link' | 'coverage'>('link');
  const activeTaggedLink = useMemo(
    () => taggedLinks.find(link => link.id === selectedLinkId) ?? null,
    [taggedLinks, selectedLinkId]
  );

  // ── Terrain Profile for Measurements ──
  const { loading: measProfileLoading, profilePoints: measProfilePoints, analysis: measProfileAnalysis, computeProfile: measProfileCompute } = useTerrainProfile();
  const [showMeasProfile, setShowMeasProfile] = useState(false);
  const [measProfileLabel, setMeasProfileLabel] = useState('');
  const [measProfileHover, setMeasProfileHover] = useState<ProfileHoverData | null>(null);
  const [measEnableCurvature, setMeasEnableCurvature] = useState(true);
  const [measEnableFresnel, setMeasEnableFresnel] = useState(false);
  const [measActiveCoords, setMeasActiveCoords] = useState<{ from: [number, number]; to: [number, number] } | null>(null);

  const measTotalDistance = useMemo(() => {
    if (!measActiveCoords) return 0;
    return haversineDistance(
      { lat: measActiveCoords.from[0], lng: measActiveCoords.from[1] },
      { lat: measActiveCoords.to[0], lng: measActiveCoords.to[1] }
    );
  }, [measActiveCoords]);

  const measFresnel = useFresnel(measProfilePoints, measProfileAnalysis, measTotalDistance, 1.8, measEnableFresnel);

  const recomputeMeasProfile = useCallback((coords: { from: [number, number]; to: [number, number] }, curvature: boolean) => {
    const fromLL = { lat: coords.from[0], lng: coords.from[1] };
    const toLL = { lat: coords.to[0], lng: coords.to[1] };
    const measBearing = Math.round(bearing(fromLL, toLL) * 10) / 10;
    measProfileCompute(
      fromLL,
      toLL,
      { hba: 1.5, mechTilt: 0, elecTilt: 0, totalTilt: 0, azimuth: measBearing, hbw: 65, vbw: 7, frontToBackRatio: 25, rxHeight: 1.5, siteAltitude: 0, antennaAMSL: 1.5 },
      curvature
    );
  }, [measProfileCompute]);

  const openMeasurementProfile = useCallback((m: SavedMeasurement) => {
    setSelectedMeasurementId(m.id);
    setMeasProfileLabel(m.name);
    setShowMeasProfile(true);
    const coords = { from: m.from, to: m.to };
    setMeasActiveCoords(coords);
    recomputeMeasProfile(coords, measEnableCurvature);
  }, [recomputeMeasProfile, measEnableCurvature]);

  const linkTotalDistance = useMemo(() => {
    if (!linkActiveCoords) return 0;
    return haversineDistance(
      { lat: linkActiveCoords.from[0], lng: linkActiveCoords.from[1] },
      { lat: linkActiveCoords.to[0], lng: linkActiveCoords.to[1] }
    );
  }, [linkActiveCoords]);

  const linkFresnel = useFresnel(linkProfilePoints, linkProfileAnalysis, linkTotalDistance, 1.8, linkEnableFresnel);

  // ── Cell Profile Tool (terrain profile from cell to clicked point) ──
  const { loading: cellProfileLoading, profilePoints: cellProfilePoints, analysis: cellProfileAnalysis, computeProfile: cellProfileCompute } = useTerrainProfile();
  const cellProfileFresnel = useFresnel(cellProfilePoints, cellProfileAnalysis, (() => {
    if (!profileTarget || !selectedSiteSnapshot) return 0;
    const coords = selectedSiteSnapshot.coordinates;
    return haversineDistance({ lat: coords[0], lng: coords[1] }, { lat: profileTarget[0], lng: profileTarget[1] });
  })(), 1.8, true);

  // Auto-compute profile when target is set
  useEffect(() => {
    if (!profileTarget || !focusCellId) return;
    const site = siteDetail || selectedSiteSnapshot;
    if (!site) return;
    const cell = site.cells.find((c: CellProperties) => c.cell_id === focusCellId);
    const coords = site.coordinates;
    const hba = cell?.hba ?? 30;
    const az = cell?.azimut ?? 0;
    cellProfileCompute(
      { lat: coords[0], lng: coords[1] },
      { lat: profileTarget[0], lng: profileTarget[1] },
      { hba, mechTilt: 0, elecTilt: 0, totalTilt: (cell as any)?.tilt ?? 0, azimuth: az, hbw: 65, vbw: 7, frontToBackRatio: 25, rxHeight: 1.5, siteAltitude: 0, antennaAMSL: hba },
      true
    );
  }, [profileTarget, focusCellId, siteDetail, selectedSiteSnapshot, cellProfileCompute]);

  const recomputeLinkProfile = useCallback((
    coords: { from: [number, number]; to: [number, number] },
    curvature: boolean,
    endpoints?: Pick<TaggedLink, 'fromType' | 'toType'>,
  ) => {
    const fromLL = { lat: coords.from[0], lng: coords.from[1] };
    const toLL = { lat: coords.to[0], lng: coords.to[1] };
    const linkBearing = Math.round(bearing(fromLL, toLL) * 10) / 10;
    const fromType = endpoints?.fromType ?? activeTaggedLink?.fromType;
    const toType = endpoints?.toType ?? activeTaggedLink?.toType;
    const txHeight = fromType === 'point' ? 2 : 30;
    const rxHeight = toType === 'point' ? 2 : 30;
    linkComputeProfile(
      fromLL,
      toLL,
      { hba: txHeight, mechTilt: 0, elecTilt: 0, totalTilt: 0, azimuth: linkBearing, hbw: 65, vbw: 7, frontToBackRatio: 25, rxHeight, siteAltitude: 0, antennaAMSL: txHeight },
      curvature
    );
  }, [linkComputeProfile, activeTaggedLink]);

  const openLinkTerrainProfile = useCallback((link: TaggedLink) => {
    setSelectedLinkId(link.id);
    setLinkProfileLabel(link.label);
    setShowLinkProfile(true);
    const coords = { from: link.fromCoords, to: link.toCoords };
    // Avoid recomputing (and clearing analysis) if reopening the same link with
    // identical coords — keeps the panel visible immediately on reopen.
    const sameCoords =
      linkActiveCoords &&
      linkActiveCoords.from[0] === coords.from[0] &&
      linkActiveCoords.from[1] === coords.from[1] &&
      linkActiveCoords.to[0] === coords.to[0] &&
      linkActiveCoords.to[1] === coords.to[1];
    setLinkActiveCoords(coords);
    if (!sameCoords || !linkProfileAnalysis) {
      recomputeLinkProfile(coords, linkEnableCurvature, link);
    }
  }, [recomputeLinkProfile, linkEnableCurvature, linkActiveCoords, linkProfileAnalysis]);

  // ── Neighbor visualization ──
  const [neighborCellId, setNeighborCellId] = useState<string | null>(null);
  const [neighborDirection, setNeighborDirection] = useState<NeighborDirection>('out');
  const [neighborData, setNeighborData] = useState<CellNeighbor[]>([]);
  const [showNeighborPanel, setShowNeighborPanel] = useState(false);
  const [neighborLoading, setNeighborLoading] = useState(false);
  const [activeDashboardId, _setActiveDashboardId] = useState<string | null>(() => {
    try { return localStorage.getItem('osmosis_active_dashboard_id') || null; } catch { return null; }
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [activeViewType, setActiveViewType] = useState<string | null>(null);
  const [kpiOverlayLocked, setKpiOverlayLocked] = useState(false);
  const setActiveDashboardId = useCallback((id: string | null) => {
    _setActiveDashboardId(id);
    // Reset active view when switching dashboard
    setActiveViewId(null);
    try {
      if (id) localStorage.setItem('osmosis_active_dashboard_id', id);
      else localStorage.removeItem('osmosis_active_dashboard_id');
    } catch (err) { console.warn('[SitesMonitor] localStorage activeDashboardId failed', err); }
  }, []);
  const [beamVisibility, setBeamVisibility] = useState<number>(() => {
    try { const v = localStorage.getItem('osmosis_beam_visibility'); return v ? Number(v) : 75; } catch { return 75; }
  });

  // ── Active Dashboard selector ──
  const [dashboardActive, setDashboardActive] = useState(false);
  // No-dashboard mode: load all sites without requiring an active dashboard
  const [noDashboardMode, setNoDashboardMode] = useState<boolean>(() => {
    try {
      // v2 key — ignore legacy '0' from previous sessions so default stays ON
      const v = localStorage.getItem('osmosis_no_dashboard_mode_v2');
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('osmosis_no_dashboard_mode_v2', noDashboardMode ? '1' : '0'); } catch {}
  }, [noDashboardMode]);

  // Only auto-switch away from the Dashboard tab when noDashboardMode is first enabled,
  // not on every click — otherwise users can never open the Dashboard tab manually.
  const prevNoDashboardModeRef = useRef(noDashboardMode);
  useEffect(() => {
    const wasOff = !prevNoDashboardModeRef.current;
    prevNoDashboardModeRef.current = noDashboardMode;
    if (wasOff && noDashboardMode && !dashboardActive && inventoryTab === 'dashboard') {
      setInventoryTab('sites');
    }
  }, [noDashboardMode, dashboardActive, inventoryTab]);
  const [activeSiteScope, setActiveSiteScope] = useState<SiteScope | null>(null);
  const [activeDashboardFilters, setActiveDashboardFilters] = useState<DashboardSiteFilters | null>(null);
  const [dashboardRefreshTick, setDashboardRefreshTick] = useState(0);
  const [dashboardFitKey, setDashboardFitKey] = useState(0);
  const initialFitDoneRef = useRef(false);
  // When user deactivates a dashboard we keep the current map view (no recenter).
  const skipNextNoDashFitRef = useRef(false);
  // activeDashboardId already declared above for tab persistence
  // Auto-fit map to sites on initial load (no dashboard active) so user lands on the data
  useEffect(() => {
    if (initialFitDoneRef.current) return;
    if (dashboardActive) return;
    if (!sites.length || sites.length > 2000) return;
    initialFitDoneRef.current = true;
    setDashboardFitKey(k => k + 1);
  }, [sites.length, dashboardActive]);
  // Do not clear the active dashboard on mount: keep current in-app selection while navigating
  const [dashboardList, setDashboardList] = useState<{ id: string; name: string; widgets: any }[]>([]);
  const [showDashboardDropdown, setShowDashboardDropdown] = useState(false);
  const [dashboardSaving, setDashboardSaving] = useState(false);
  const [dashboardSaveFlash, setDashboardSaveFlash] = useState(false);

  // ── Right settings bar (removed) ──

  // ── Parameter overlay mode ──
  const [paramMode, setParamMode] = useState(false); // true = parameter markers on map
  const [paramPanelOpen, setParamPanelOpen] = useState(false);
  const [paramAvailable, setParamAvailable] = useState<string[]>([]);
  const [paramAvailableLoading, setParamAvailableLoading] = useState(false);
  const [paramSelected, setParamSelected] = useState<string | null>(null); // pending
  const [paramConfirmed, setParamConfirmed] = useState<string | null>(null); // applied
  const [paramPoints, setParamPoints] = useState<{ id: number; cell_name: string | null; site_name: string | null; latitude: number; longitude: number; parameter: string; value: string | null; bande: string | null; vendor: string | null; dn: string | null }[]>([]);
  const [paramLoading, setParamLoading] = useState(false);
  const [paramSearch, setParamSearch] = useState('');
  const [paramHeatmapEnabled, setParamHeatmapEnabled] = useState(false); // density heatmap overlay in Parameter mode

  // Load available parameters from VPS backend, fallback to Supabase parameter_dump
  const [showParamDropdown, setShowParamDropdown] = useState(false);
  useEffect(() => {
    if ((!paramPanelOpen && !showParamDropdown && !paramMode) || paramAvailable.length > 0) return;
    (async () => {
      setParamAvailableLoading(true);
      let loaded = false;
      // Try VPS first
      try {
        const resp = await fetch(getVpsProxyUrl('parser', '/api/v1/topo/param-list?object_type=CELL&limit=500'), {
          headers: getVpsProxyHeaders(),
        });
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          // Support both string[] and {name:string}[] formats
          const names = data.map((r: any) => typeof r === 'string' ? r : r.name).filter(Boolean);
          console.log('[SitesMonitor] param-list loaded:', names.length, 'params');
          setParamAvailable(names.sort());
          loaded = true;
        }
      } catch (err) { console.warn('[SitesMonitor] paramAvailable VPS fetch failed', err); }
      // Fallback: load distinct parameters from parameter_dump table
      if (!loaded) {
        try {
          const { data: dbParams } = await supabase
            .from('parameter_dump')
            .select('parameter')
            .limit(1000);
          if (dbParams && dbParams.length > 0) {
            const unique = [...new Set(dbParams.map((r: any) => r.parameter).filter(Boolean))].sort() as string[];
            setParamAvailable(unique);
          }
        } catch (err) { console.warn('[SitesMonitor] paramAvailable DB fallback failed', err); }
      }
      setParamAvailableLoading(false);
    })();
  }, [paramPanelOpen, showParamDropdown, paramMode]);

  const paramFilteredList = useMemo(() => {
    if (!paramSearch) return paramAvailable;
    const s = paramSearch.toLowerCase();
    return paramAvailable.filter(p => p.toLowerCase().includes(s));
  }, [paramAvailable, paramSearch]);

  // Also search VPS when local list doesn't have results
  useEffect(() => {
    if (!paramSearch || paramSearch.length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/param-list`, { search: paramSearch, object_type: 'CELL', limit: '50' }), {
          headers: getVpsProxyHeaders(),
        });
        const data = await resp.json();
        if (Array.isArray(data)) {
          const newNames = data.map((r: any) => typeof r === 'string' ? r : r.name).filter(Boolean);
          setParamAvailable(prev => {
            const merged = [...new Set([...prev, ...newNames])].sort();
            return merged;
          });
        }
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [paramSearch]);

  const handleParamConfirm = useCallback(async (nextParam?: string) => {
    const targetParam = nextParam ?? paramSelected;
    if (!targetParam) return;
    setParamConfirmed(targetParam);
    setParamSelected(targetParam);
    setParamMode(true);
    setShowBeamSectors(false);
    setMapDisplayMode('points');
    setSectorColorMode('topo');
    setParamLoading(true);
    setParamPanelOpen(false);
    setShowParamDropdown(false);
    try {
      const bbox = viewport.bounds
        ? `${viewport.bounds.getWest()},${viewport.bounds.getSouth()},${viewport.bounds.getEast()},${viewport.bounds.getNorth()}`
        : '-180,-90,180,90';
      // Apply active dashboard/view filters to parameter overlay
      const filterParams = new URLSearchParams();
      filterParams.set('param', targetParam);
      filterParams.set('bbox', bbox);
      filterParams.set('limit', '10000');
      // Merge dashboard + view filters
      const df = activeDashboardFilters || {};
      if ((df as any).cluster?.length) filterParams.set('cluster', (df as any).cluster.join(','));
      if (df.vendor?.length) filterParams.set('vendor', df.vendor.join(','));
      if (df.dor?.length) filterParams.set('dor', df.dor.join(','));
      if (df.techno?.length) filterParams.set('techno', df.techno.join(','));
      const paramMapUrl = getVpsProxyUrl('parser', `/api/v1/topo/param-map?${filterParams.toString()}`);
      console.log('[SitesMonitor] param-map request:', { param: targetParam, bbox, filters: filterParams.toString(), url: paramMapUrl });
      const resp = await fetch(paramMapUrl, {
        headers: getVpsProxyHeaders(),
      });
      const data = await resp.json();
      console.log('[SitesMonitor] param-map response:', { status: resp.status, total_sites: data.total_sites, total_values: data.total_values, sites_len: data.sites?.length, error: data.error, unavailable: data.unavailable });
      if (data.sites && data.sites.length > 0) {
        const points: any[] = [];
        let id = 0;
        for (const site of data.sites) {
          for (const cell of (site.cells || [])) {
            points.push({
              id: id++,
              cell_name: cell.cell_name,
              site_name: site.site_name,
              latitude: site.latitude,
              longitude: site.longitude,
              parameter: targetParam,
              value: cell.value,
              bande: cell.bande,
              vendor: site.constructeur,
              dn: null,
            });
          }
        }
        setParamPoints(points);
      } else {
        setParamPoints([]);
      }
    } catch (err) { console.warn('[SitesMonitor] param-map fetch failed', err); setParamPoints([]); }
    setParamLoading(false);
  }, [paramSelected, viewport.bounds, activeDashboardFilters, activeSiteScope, activeViewConditions]);

  const handleParamReset = useCallback(() => {
    setParamMode(false);
    setParamConfirmed(null);
    setParamSelected(null);
    setParamPoints([]);
    setShowBeamSectors(true);
    setParamPanelOpen(false);
    setShowParamDropdown(false);
    setParamSearch('');
    setMapDisplayMode('sites');
    setShowBeamSectors(true);
  }, []);

  // Compute numeric stats for parameter values (for gradient coloring)
  const paramNumericStats = useMemo(() => {
    let min = Infinity, max = -Infinity, numCount = 0;
    for (const p of paramPoints) {
      const n = Number(p.value);
      if (Number.isFinite(n)) { if (n < min) min = n; if (n > max) max = n; numCount++; }
    }
    // Use gradient if >50% of values are numeric
    return numCount > paramPoints.length * 0.5 && min < max ? { min, max } : null;
  }, [paramPoints]);

  const paramValueColor = useCallback((val: string | null): string => {
    if (!val) return 'hsl(0, 0%, 60%)';
    // Numeric gradient: red (low) → yellow (mid) → green (high)
    if (paramNumericStats) {
      const n = Number(val);
      if (Number.isFinite(n)) {
        const t = Math.max(0, Math.min(1, (n - paramNumericStats.min) / (paramNumericStats.max - paramNumericStats.min)));
        return `hsl(${t * 140}, 78%, 48%)`;
      }
    }
    // Categorical: hash-based
    let hash = 0;
    for (let i = 0; i < val.length; i++) hash = val.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  }, [paramNumericStats]);

  const paramUniqueValues = useMemo(() => {
    return [...new Set(paramPoints.map(p => p.value || '(vide)'))].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [paramPoints]);

  // Group param points by site → one marker per site with multi-value detection
  const paramSiteMarkers = useMemo(() => {
    const siteMap = new Map<string, { site_name: string; latitude: number; longitude: number; vendor: string | null; values: Set<string>; cells: typeof paramPoints }>();
    for (const point of paramPoints) {
      const key = point.site_name || `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      const existing = siteMap.get(key);
      if (existing) {
        existing.values.add(point.value || '(vide)');
        existing.cells.push(point);
      } else {
        siteMap.set(key, {
          site_name: point.site_name || '',
          latitude: point.latitude,
          longitude: point.longitude,
          vendor: point.vendor,
          values: new Set([point.value || '(vide)']),
          cells: [point],
        });
      }
    }
    return Array.from(siteMap.values()).map((s, i) => ({
      ...s,
      id: i,
      isMultiValue: s.values.size > 1,
      singleValue: s.values.size === 1 ? [...s.values][0] : null,
      distinctValues: [...s.values].sort(),
    }));
  }, [paramPoints]);

  // Density heatmap points for Parameter overlay — one weighted point per cell coordinate.
  // Weight = number of cells at that exact lat/lon (so dense sites = hotter).
  const paramHeatPoints = useMemo<[number, number, number][]>(() => {
    if (!paramMode || paramPoints.length === 0) return [];
    const bucket = new Map<string, { lat: number; lon: number; count: number }>();
    for (const p of paramPoints) {
      if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
      // Round to 5 decimals (~1m) to merge co-located cells of the same site
      const key = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
      const existing = bucket.get(key);
      if (existing) existing.count += 1;
      else bucket.set(key, { lat: p.latitude, lon: p.longitude, count: 1 });
    }
    if (bucket.size === 0) return [];
    const maxCount = Math.max(...Array.from(bucket.values()).map(b => b.count));
    return Array.from(bucket.values()).map(b => [b.lat, b.lon, Math.max(0.15, b.count / maxCount)] as [number, number, number]);
  }, [paramMode, paramPoints]);
  // Fetch dashboards list, archive legacy auto-dashboards, auto-activate saved dashboard
  useEffect(() => {
    const fetchDashboards = async () => {
      try {
        const data = await dashboardsApi.list();
        if (!Array.isArray(data)) return;

        // Archive legacy auto-created "Filtre dd/mm/yyyy" dashboards in background
        const autoFilterRegex = /^Filtre \d{2}\/\d{2}\/\d{4}$/;
        const legacyAuto = data.filter((d: any) => autoFilterRegex.test((d.name || '').trim()) && !d.is_archived);
        if (legacyAuto.length > 0) {
          // Archive them silently — don't await to avoid blocking
          Promise.all(legacyAuto.map((d: any) => dashboardsApi.update(d.id, { is_archived: true }).catch(() => {}))).catch(() => {});
        }

        // Keep only non-auto-filter dashboards
        const cleaned = data.filter((d: any) => !autoFilterRegex.test((d.name || '').trim()) && !d.is_archived);
        setDashboardList(cleaned);

        // Restore persisted active dashboard ID for selection display, but
        // do NOT silently re-activate it. Re-activating on mount applied
        // the dashboard's siteScope + siteFilters without any user signal,
        // which surfaced as "591 sites" with no visible filter on the
        // sidebar (INC-2026-05-03 — sites visibly truncated, no
        // explanation; the dashboard from a previous session was still
        // restricting the perimeter). Match the comment intent: the ID
        // gets restored so the dropdown shows the previous selection,
        // but the user must explicitly click "Activer" to apply it.
        // (Anything that needs the previous filters in effect must be
        // recovered from localStorage explicitly, not piggy-backed on
        // dashboard restoration.)
        // Do NOT auto-activate the persisted dashboard — user must explicitly click "Activer"
      } catch (err) { console.warn('[SitesMonitor] fetchDashboards failed', err); }
    };
    fetchDashboards();
  }, []);

  const activeDashboard = dashboardList.find(d => d.id === activeDashboardId);

  const saveDashboardSettings = useCallback(async (targetDbId?: string) => {
    const dbId = targetDbId || activeDashboardId;
    if (!dbId) return;
    setDashboardSaving(true);
    const currentSettings = getCurrentMapSettings();
    let db = dashboardList.find(d => d.id === dbId);
    // If dashboard not in local list, fetch it from API
    if (!db) {
      try {
        const allData = await dashboardsApi.list();
        if (Array.isArray(allData)) {
          db = allData.find((d: any) => d.id === dbId);
          if (db) setDashboardList(prev => [...prev.filter(d => d.id !== dbId), db!]);
        }
      } catch (err) { console.warn('[SitesMonitor] saveDashboardSettings fetch failed', err); }
    }
    if (!db) { setDashboardSaving(false); return; }
    const widgets = Array.isArray(db.widgets) ? [...db.widgets] : [];
    const idx = widgets.findIndex((w: any) => w?._type === 'dashboard_settings');
    const existing = idx >= 0 ? widgets[idx] : { _type: 'dashboard_settings' };
    const updated = { ...existing, ...currentSettings, bandColors, beamVisibility };
    if (idx >= 0) widgets[idx] = updated; else widgets.push(updated);
    await dashboardsApi.update(dbId, { widgets });
    setDashboardList(prev => prev.map(d => d.id === dbId ? { ...d, widgets } : d));
    setActiveDashboardId(dbId);
    setDashboardSaving(false);
    setDashboardSaveFlash(true);
    setTimeout(() => setDashboardSaveFlash(false), 1500);
  }, [activeDashboardId, dashboardList, bandColors, beamVisibility]);

  const loadDashboardSettings = useCallback((dbId: string) => {
    const db = dashboardList.find(d => d.id === dbId);
    if (!db) return;
    const widgets = Array.isArray(db.widgets) ? db.widgets : [];
    const settings = widgets.find((w: any) => w?._type === 'dashboard_settings');
    if (settings) {
      if (settings.mapLayer) setMapLayer(settings.mapLayer);
      if (settings.mapKpi && MAP_KPIS.some(k => k.id === settings.mapKpi)) setMapKpi(settings.mapKpi);
      if (settings.mapTechnoFilter) setMapTechnoFilter(settings.mapTechnoFilter);
      if (settings.enabledBands) setEnabledBands(new Set(settings.enabledBands));
      // Guard: never overwrite an active KPI overlay with a saved 'topo' mode.
      // Only an explicit user click on the Topo button should leave KPI mode.
      if (settings.sectorColorMode && sectorColorMode !== 'kpi') setSectorColorMode(settings.sectorColorMode);
      if (settings.mapDisplayMode) {
        setMapDisplayMode((settings as any).viewType === 'parameter' ? settings.mapDisplayMode : 'sites');
      }
      if (settings.showBandPanel !== undefined) setShowBandPanel(settings.showBandPanel);
      if (settings.showLegend !== undefined) setShowLegend(settings.showLegend);
      if (settings.showRightPanel !== undefined) setShowRightPanel(settings.showRightPanel);
      if (settings.panelCollapsed !== undefined) setPanelCollapsed(settings.panelCollapsed);
      if (settings.localVendor) setLocalVendor(settings.localVendor);
      if (settings.localDor) setLocalDor(settings.localDor);
      if (settings.localPlaque) setLocalPlaque(settings.localPlaque);
      if ((settings as any).localBande) setLocalBande((settings as any).localBande);
      else if (settings.localSite) setLocalBande(settings.localSite);
      if ((settings as any).localZoneArcep) setLocalZoneArcep((settings as any).localZoneArcep);
      if ((settings as any).localTechno) setLocalTechno((settings as any).localTechno);
      if ((settings as any).showBeamSectors !== undefined) {
        setShowBeamSectors(Boolean((settings as any).showBeamSectors));
      } else if (settings.mapDisplayMode === 'sites' && settings.sectorColorMode !== 'topo') {
        setShowBeamSectors(true);
      }
      if (settings.bandColors) {
        setBandColors(settings.bandColors);
        localStorage.setItem('osmosis_band_colors', JSON.stringify(settings.bandColors));
      }
      if (settings.center && settings.center[0] > 41 && settings.center[0] < 52 && settings.center[1] > -6 && settings.center[1] < 11) setFlyTarget(settings.center);
      if (settings.beamVisibility != null) {
        setBeamVisibility(settings.beamVisibility);
        localStorage.setItem('osmosis_beam_visibility', String(settings.beamVisibility));
      }
    }
    setActiveDashboardId(dbId);
    setShowDashboardDropdown(false);
  }, [dashboardList, sectorColorMode]);

  // Coverage simulation state
  const [showCoverageSim, setShowCoverageSim] = useState(false);
  const [coverageGrid, setCoverageGrid] = useState<CoverageGrid | null>(null);
  const [coverageSimulating, setCoverageSimulating] = useState(false);
  const [coverageSite, setCoverageSite] = useState<any>(null);

  const handleLaunchCoverageSim = useCallback((site: SiteDetail | SiteSummary) => {
    setCoverageSite({
      site_name: site.site_name,
      site_id: site.site_id,
      lat: site.coordinates[0],
      lng: site.coordinates[1],
      cells: site.cells.map(c => ({
        cell_id: c.cell_id,
        techno: c.techno,
        bande: c.bande,
        azimut: c.azimut,
        hba: c.hba,
        tilt: c.tilt,
      })),
    });
    setShowCoverageSim(true);
  }, []);

  const handleCoverageSimulate = useCallback((grid: CoverageGrid) => {
    setCoverageSimulating(true);
    // Simulate async to not block UI
    setTimeout(() => {
      setCoverageGrid(grid);
      setCoverageSimulating(false);
    }, 50);
  }, []);

  const handleCoverageClear = useCallback(() => {
    setCoverageGrid(null);
  }, []);

  const [losDrawingMode, setLosDrawingMode] = useState(false);
  const [losTargetPoint, setLosTargetPoint] = useState<LatLng | null>(null);
  const [losSelectedCell, setLosSelectedCell] = useState<{ lat: number; lng: number; azimuth: number; hba: number; tilt: number; techno: string; bande: string; name: string } | null>(null);
  const [losEnableCurvature, setLosEnableCurvature] = useState(true);
  const [losEnableFresnel, setLosEnableFresnel] = useState(false);
  const [losEnableClutter, setLosEnableClutter] = useState(false);
  const [losClutterHeight, setLosClutterHeight] = useState(0);
  const [losMechTilt, setLosMechTilt] = useState(0);
  const [losElecTilt, setLosElecTilt] = useState(0);
  const [losRxHeight, setLosRxHeight] = useState(1.5);
  const [losHbw, setLosHbw] = useState(65);
  const [losVbw, setLosVbw] = useState(7);
  const [losF2b, setLosF2b] = useState(25);
  const [showLosPanel, setShowLosPanel] = useState(false);
  const [showTiltOverlay, setShowTiltOverlay] = useState(false);

  const { loading: losLoading, error: losError, profilePoints: losProfilePoints, analysis: losAnalysis, computeProfile: losComputeProfile } = useTerrainProfile();

  const losTotalDistance = losSelectedCell && losTargetPoint
    ? haversineDistance({ lat: losSelectedCell.lat, lng: losSelectedCell.lng }, losTargetPoint)
    : 0;

  const losFrequencyGHz = losSelectedCell ? (parseFloat(losSelectedCell.bande) > 0 ? parseFloat(losSelectedCell.bande) / 1000 : 1.8) : 1.8;
  const losFresnel = useFresnel(losProfilePoints, losAnalysis, losTotalDistance, losFrequencyGHz, losEnableFresnel);

  const buildLosAntennaParams = useCallback(() => {
    if (!losSelectedCell) return null;
    return {
      hba: losSelectedCell.hba,
      siteAltitude: 0, // will be set from DEM
      antennaAMSL: losSelectedCell.hba, // will be recalculated
      mechTilt: losMechTilt,
      elecTilt: losElecTilt,
      totalTilt: losMechTilt + losElecTilt,
      azimuth: losSelectedCell.azimuth,
      hbw: losHbw,
      vbw: losVbw,
      frontToBackRatio: losF2b,
      rxHeight: losRxHeight,
    };
  }, [losSelectedCell, losMechTilt, losElecTilt, losHbw, losVbw, losF2b, losRxHeight]);

  const handleLosMapClick = useCallback((latlng: LatLng) => {
    if (!losDrawingMode || !losSelectedCell) return;
    const antenna = buildLosAntennaParams();
    if (!antenna) return;
    setLosTargetPoint(latlng);
    setLosDrawingMode(false);
    setShowLosPanel(true);
    losComputeProfile(
      { lat: losSelectedCell.lat, lng: losSelectedCell.lng },
      latlng,
      antenna,
      losEnableCurvature
    );
  }, [losDrawingMode, losSelectedCell, losComputeProfile, buildLosAntennaParams, losEnableCurvature]);

  const handleStartLosDrawing = useCallback((site: SiteDetail | SiteSummary) => {
    const cell = site.cells[0];
    if (!cell) return;
    setLosSelectedCell({
      lat: site.coordinates[0],
      lng: site.coordinates[1],
      azimuth: cell.azimut ?? 0,
      hba: cell.hba ?? 30,
      tilt: cell.tilt ?? 0,
      techno: cell.techno ?? 'LTE',
      bande: cell.bande ?? '1800',
      name: site.site_name,
    });
    setLosDrawingMode(true);
    setLosTargetPoint(null);
    setShowLosPanel(false);
  }, []);

  const handleLosRecompute = useCallback(() => {
    if (!losSelectedCell || !losTargetPoint) return;
    const antenna = buildLosAntennaParams();
    if (!antenna) return;
    losComputeProfile(
      { lat: losSelectedCell.lat, lng: losSelectedCell.lng },
      losTargetPoint,
      antenna,
      losEnableCurvature
    );
  }, [losSelectedCell, losTargetPoint, losComputeProfile, buildLosAntennaParams, losEnableCurvature]);

  const handleCloseLos = useCallback(() => {
    setShowLosPanel(false);
    setLosTargetPoint(null);
    setLosDrawingMode(false);
    setLosSelectedCell(null);
  }, []);

  // ── KPI Catalog: loaded from backend /api/v1/kpi/catalog ──
  const [catalogKpis, setCatalogKpis] = useState<{ id: string; label: string; unit: string; category: string; techno?: string; vendor?: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        // 2026-05-11 v6.5.4 — switched source from /api/v1/kpi/catalog
        // (4 801 full KPI definitions, mostly without CH data) to
        // /kpi-api/kpi-tables/shared (the admin-curated list — 13
        // entries today). Per memory `feedback_kpi_admin_list_only`,
        // only admin-curated KPIs are in scope. The previous filter on
        // /^(Nokia|Ericsson|Huawei)__&_/ on the 4801 list was deleting
        // 12/13 of the curated KPIs and keeping 4725 useless ones.
        const sharedUrl = getVpsProxyUrl('kpi', '/kpi-tables/shared');
        const sharedResp = await fetch(sharedUrl, { headers: getVpsProxyHeaders() });
        if (!sharedResp.ok) throw new Error(`shared catalog fetch failed: ${sharedResp.status}`);
        const sharedJson = await sharedResp.json();
        const sharedCodes: string[] = Array.isArray(sharedJson.kpi_codes) ? sharedJson.kpi_codes : [];

        // Enrich with display metadata (label, unit, category, techno,
        // vendor, thresholds) from the legacy /api/v1/kpi/catalog. The
        // shared list only returns code strings; we join on kpi_id.
        const catalogUrl = getVpsProxyUrl('parser', '/api/v1/kpi/catalog');
        const catalogResp = await fetch(catalogUrl, { headers: getVpsProxyHeaders() });
        const catalogJson = catalogResp.ok ? await catalogResp.json() : { kpis: [] };
        const byId = new Map<string, any>();
        for (const k of catalogJson.kpis || []) byId.set(k.kpi_id, k);

        // Helper to infer techno / vendor from the kpi_code itself when
        // the catalog row is missing (codes like Nokia__&_4G_LTE_CSSR
        // pre-parse cleanly into vendor + techno).
        const inferVendor = (code: string) => {
          const m = code.match(/^(Nokia|Ericsson|Huawei)__/i);
          return m ? m[1] : '';
        };
        const inferTechno = (code: string) => {
          if (/(^|_)5G(_|$)/i.test(code)) return '5G';
          if (/(^|_)4G(_|$)/i.test(code) || /LTE/i.test(code)) return '4G';
          return 'all';
        };

        const kpis = sharedCodes.map((code) => {
          const meta = byId.get(code) || {};
          return {
            id: code,
            label: meta.label || code,
            unit: meta.unit || '',
            category: meta.category || 'OTHER',
            techno: meta.techno || inferTechno(code),
            vendor: meta.vendor || inferVendor(code),
          };
        });
        setCatalogKpis(kpis);
        console.log(`[SitesMonitor] Loaded ${kpis.length} admin-curated KPIs from /kpi-tables/shared`);

        // Auto-apply thresholds from the enriched catalog (only for the
        // curated codes).
        const thr: Record<string, { green: number; orange: number; invert?: boolean }> = {};
        for (const code of sharedCodes) {
          const meta = byId.get(code);
          if (meta && meta.threshold_green != null && meta.threshold_orange != null) {
            thr[code] = { green: meta.threshold_green, orange: meta.threshold_orange, invert: meta.invert || false };
          }
        }
        if (Object.keys(thr).length > 0) {
          setCatalogThresholds(thr);
          setKpiThresholds(prev => {
            const merged = { ...thr, ...prev };
            return merged;
          });
        }
      } catch (e) {
        console.warn('[SitesMonitor] KPI catalog fetch failed, using fallback', e);
        setCatalogKpis([
          { id: 'EUTRAN_Cell_Availability_Wo_BLU', label: 'Cell Availability', unit: '%', category: 'RF', techno: '4G', vendor: 'Nokia' },
          { id: 'CELL_UNPLAN_UNAVAIL_Time', label: 'Cell Unplanned Unavailability', unit: 's', category: 'RF', techno: '4G', vendor: 'Nokia' },
          { id: 'CSSR_END_USER_w_CN%', label: 'CSSR End User', unit: '%', category: 'RF', techno: '4G', vendor: 'Ericsson' },
          { id: 'Test_Cell_Availability', label: 'Cell Availability', unit: '%', category: 'RF', techno: '5G', vendor: 'Nokia' },
        ]);
      }
    })();
  }, []);
  const MAP_KPIS = useMemo(() => (
    catalogKpis.length > 0 ? catalogKpis : [
      { id: 'EUTRAN_Cell_Availability_Wo_BLU', label: 'Cell Availability', unit: '%', category: 'RF', techno: '4G', vendor: 'Nokia' },
      { id: 'CELL_UNPLAN_UNAVAIL_Time', label: 'Cell Unplanned Unavailability', unit: 's', category: 'RF', techno: '4G', vendor: 'Nokia' },
      { id: 'CSSR_END_USER_w_CN%', label: 'CSSR End User', unit: '%', category: 'RF', techno: '4G', vendor: 'Ericsson' },
      { id: 'Test_Cell_Availability', label: 'Cell Availability', unit: '%', category: 'RF', techno: '5G', vendor: 'Nokia' },
    ]
  ), [catalogKpis]);

  const getDefaultMapKpi = useCallback((kpis: typeof MAP_KPIS, techno = kpiTechnoFilter) => {
    const preferred = [
      'EUTRAN_Cell_Availability_Wo_BLU',
      'CELL_UNPLAN_UNAVAIL_Time',
      'Test_Cell_Availability',
      'CSSR_END_USER_w_CN%',
    ];
    const compatible = kpis.filter(k => {
      const kt = String(k.techno || 'all').toLowerCase();
      return kt === 'all' || kt === techno.toLowerCase();
    });
    return preferred.find(id => compatible.some(k => k.id === id))
      || preferred.find(id => kpis.some(k => k.id === id))
      || compatible[0]?.id
      || kpis[0]?.id
      || '';
  }, [kpiTechnoFilter]);

  useEffect(() => {
    if (!MAP_KPIS.length) return;
    // Replace legacy fallback IDs such as "cssr" with live KPI engine keys.
    const currentKpi = MAP_KPIS.find(k => k.id === mapKpi);
    const currentExists = Boolean(currentKpi);
    const currentTechno = String(currentKpi?.techno || 'all').toLowerCase();
    const currentCompatible = currentTechno === 'all' || currentTechno === kpiTechnoFilter.toLowerCase();
    if (!mapKpi || (!kpiOverlayLocked && (!currentExists || !currentCompatible))) {
      setMapKpi(getDefaultMapKpi(MAP_KPIS));
    }
  }, [MAP_KPIS, getDefaultMapKpi, kpiOverlayLocked, kpiTechnoFilter, mapKpi]);

  // Fetch KPI values when user selects a KPI and mode is 'kpi'
  // Uses in-memory cache (5min TTL) — re-selecting same KPI returns instantly without flash
  useEffect(() => {
    console.log('[KPI Overlay] Effect triggered:', { sectorColorMode, mapKpi, kpiDateFrom, kpiDateTo });
    if (sectorColorMode !== 'kpi' || !mapKpi) {
      setKpiValues(new Map());
      setKpiDataIssue(null);
      setKpiOverlayVendor(null);
      return;
    }
    let cancelled = false;
    const selectedCatalogKpi = (catalogKpis.length > 0 ? catalogKpis : MAP_KPIS).find(k => k.id === mapKpi);
    // Vendor-filter rule (2026-05-11 v6.5.5): apply vendor filter ONLY
    // when the kpi_code is explicitly vendor-scoped (e.g.
    // `Nokia__&_4G_LTE_CSSR_VoLTE`). For canonical codes
    // (`4G_LTE_CSSR_VoLTE`, `DL_VOLUME_IP_GBytes`, …) the engine should
    // aggregate cross-vendor — applying vendor=Ericsson on those killed
    // the data because the populated cells in CH are Huawei (memory
    // `project_ericsson_pm_counters_gap` — Ericsson counters missing).
    const isVendorPrefixed = /^(Nokia|Ericsson|Huawei)__/i.test(mapKpi);
    const catalogVendor = isVendorPrefixed
      ? (selectedCatalogKpi?.vendor && selectedCatalogKpi.vendor !== 'Multi-Vendor'
          ? selectedCatalogKpi.vendor
          : undefined)
      : undefined;
    const kpiVendor = catalogVendor || (localVendor !== 'ALL' ? localVendor : undefined);

    const filters: any = {
      // Keep the backend KPI fetch broad on perimeter dimensions: the map applies
      // dashboard/view perimeter client-side when deciding which cells/sectors to render.
      // BUT we DO forward the active date range — otherwise selecting a different period
      // in the topbar has no effect on the KPI values displayed on the map.
      techno: kpiTechnoFilter,
      level: kpiAnalysisLevel,
      ...(kpiVendor ? { vendor: kpiVendor } : {}),
      ...(kpiDateFrom ? { date_from: kpiDateFrom } : {}),
      ...(kpiDateTo ? { date_to: kpiDateTo } : {}),
    };

    // Only show loading spinner if this is a fresh fetch (not cached)
    // Keep existing kpiValues visible during fetch to avoid flash
    setKpiLoading(true);

    // Store the KPI vendor so the renderer can auto-hide non-matching vendor sites
    const nextVendor = kpiVendor || null;
    setKpiOverlayVendor(prev => prev === nextVendor ? prev : nextVendor);

    fetchKpiCellValues(mapKpi, filters)
      .then(data => {
        if (!cancelled) {
          setKpiValues(data);
          setHiddenKpiLevels(prev => prev.size === 0 ? prev : new Set());
          setKpiDataIssue(data.size === 0 ? `No usable KPI values returned for ${mapKpi}${kpiVendor ? ` (${kpiVendor})` : ''} on ${kpiDateFrom} to ${kpiDateTo}.` : null);
          console.log(`[KPI] Loaded ${data.size} values for ${mapKpi} (cached or fresh)`);
        }
      })
      .catch(err => {
        console.error('[KPI] Fetch failed:', err);
        if (!cancelled) {
          setKpiValues(new Map());
          setKpiDataIssue(`KPI values fetch failed for ${mapKpi}: ${err?.message || 'unknown error'}`);
        }
      })
      .finally(() => { if (!cancelled) setKpiLoading(false); });

    return () => { cancelled = true; };
  }, [MAP_KPIS, mapKpi, sectorColorMode, localVendor, kpiTechnoFilter, kpiAnalysisLevel, kpiDateFrom, kpiDateTo]);

  const getCellKpiValue = (cell: any, parentSiteName?: string): number => {
    const cellName = cell.cell_id || cell.cell_name || '';
    const siteName = parentSiteName || cell.site_name || cell.site_id || '';
    const bandName = cell.bande || cell.band || '';

    // Level-aware lookup priority
    if (kpiAnalysisLevel === 'band' && bandName && siteName) {
      const fromBand = kpiValues.get(`band:${siteName}:${bandName}`);
      if (fromBand != null) return fromBand;
    }

    if (kpiAnalysisLevel === 'site') {
      const fromSite = kpiValues.get(`site:${siteName}`);
      if (fromSite != null) return fromSite;
    }

    // Cell-level: direct lookup
    const fromKpi = kpiValues.get(cellName);
    if (fromKpi != null) return fromKpi;

    // No site-level fallback at cell level: a cell without its own KPI value
    // must be reported as "no data" (gray), otherwise every cell on a site
    // inherits the site's average and the gray bucket disappears from the map.
    // Site-level fallback is only used when explicitly working at site granularity.
    if (kpiAnalysisLevel === 'site' && siteName) {
      const fromSite = kpiValues.get(`site:${siteName}`);
      if (fromSite != null) return fromSite;
    }

    return NaN;
  };

  /** Get site-level KPI value: proper average across all visible cells */
  const getSiteKpiValue = (site: any): number => {
    // 1. Direct site key
    const siteName = site.site_name || site.site_id || '';
    const fromSite = kpiValues.get(`site:${siteName}`);
    if (fromSite != null) return fromSite;

    // 2. Aggregate from cell values
    const cells = site.cells || [];
    if (cells.length === 0) return NaN;
    const vals = cells
      .map((c: any) => {
        const cn = c.cell_id || c.cell_name || '';
        return kpiValues.get(cn);
      })
      .filter((v: any): v is number => v != null && Number.isFinite(v));
    if (vals.length === 0) return NaN;
    return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  };

  const getKpiColor = (value: number): string => {
    if (isNaN(value) || value == null) return '#6b7280'; // gray for no data
    const t = kpiThresholds[mapKpi] || { green: 80, orange: 60 };
    const cGreen = t.colorGreen || '#27AE60';
    const cOrange = t.colorOrange || '#f59e0b';
    const cRed = t.colorRed || '#8E44AD';
    if (t.invert) {
      if (value <= t.green) return cGreen;
      if (value <= t.orange) return cOrange;
      return cRed;
    }
    if (value >= t.green) return cGreen;
    if (value >= t.orange) return cOrange;
    return cRed;
  };

  const getKpiLevel = useCallback((value: number): 'green' | 'orange' | 'red' | 'gray' => {
    if (isNaN(value) || value == null) return 'gray';
    const t = kpiThresholds[mapKpi] || { green: 80, orange: 60 };
    if (t.invert) {
      if (value <= t.green) return 'green';
      if (value <= t.orange) return 'orange';
      return 'red';
    }
    if (value >= t.green) return 'green';
    if (value >= t.orange) return 'orange';
    return 'red';
  }, [kpiThresholds, mapKpi]);

  const ALL_KPI_LEVELS: ('green' | 'orange' | 'red' | 'gray')[] = ['green', 'orange', 'red', 'gray'];
  const toggleKpiLevel = useCallback((level: 'green' | 'orange' | 'red' | 'gray') => {
    // Simple per-level toggle: click once to hide that level, click again to show it.
    setHiddenKpiLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const kpiLegendScope = kpiAnalysisLevel === 'site' ? 'site' : 'cell';

  const isCellVisibleForKpiLegend = useCallback((cell: CellProperties, parentSiteName?: string) => {
    if (sectorColorMode !== 'kpi') return true;
    // Color level filter (green/orange/red toggle)
    const cellValue = getCellKpiValue(cell, parentSiteName);
    if (hiddenKpiLevels.size > 0 && hiddenKpiLevels.has(getKpiLevel(cellValue))) return false;
    // Value filter (e.g., ">98")
    if (kpiValueFilterFn) {
      if (!kpiValueFilterFn(cellValue)) return false;
    }
    return true;
  }, [sectorColorMode, hiddenKpiLevels, getKpiLevel, getCellKpiValue, kpiValueFilterFn]);

  const selectedKpiLabel = MAP_KPIS.find(k => k.id === mapKpi)?.label || 'RRC Success Rate';
  const selectedKpiUnit = MAP_KPIS.find(k => k.id === mapKpi)?.unit || '%';
  const currentThreshold = kpiThresholds[mapKpi] || { green: 80, orange: 60 };

  // Cell-level Vue condition filter: hides cells that don't match KPI/attribute conditions
  const cellMatchesViewConditions = useCallback((cell: any): boolean => {
    // Check activeViewFilters (mode/kpi/operator/threshold style)
    const kpiFilters = activeViewFilters.filter(f => f.mode === 'kpi' && f.kpi && f.operator && f.threshold != null);
    for (const f of kpiFilters) {
      const val = getCellKpiValue(cell);
      if (isNaN(val)) return false;
      const t = f.threshold!;
      switch (f.operator) {
        case '<': if (!(val < t)) return false; break;
        case '>': if (!(val > t)) return false; break;
        case '<=': if (!(val <= t)) return false; break;
        case '>=': if (!(val >= t)) return false; break;
        case '=': if (Math.abs(val - t) >= 0.01) return false; break;
      }
    }
    // Check activeViewConditions (dimension/operator/values style) for cell-level dims
    for (const cond of activeViewConditions) {
      if (cond.values.length === 0) continue;
      const dim = cond.dimension;
      // Only apply cell-level dimensions here (techno, bande, etc.)
      const cellVal = (cell as any)[dim];
      if (cellVal == null) continue;
      const normVal = String(cellVal).trim().toLowerCase();
      if (cond.operator === '=' || cond.operator === 'IN') {
        if (!cond.values.some(v => v.toLowerCase() === normVal)) return false;
      } else if (cond.operator === 'NOT_IN') {
        if (cond.values.some(v => v.toLowerCase() === normVal)) return false;
      } else {
        // Numeric comparisons
        const numVal = parseFloat(String(cellVal));
        const threshold = parseFloat(cond.values[0] ?? '');
        if (!isNaN(numVal) && !isNaN(threshold)) {
          switch (cond.operator) {
            case '>': if (!(numVal > threshold)) return false; break;
            case '>=': if (!(numVal >= threshold)) return false; break;
            case '<': if (!(numVal < threshold)) return false; break;
            case '<=': if (!(numVal <= threshold)) return false; break;
          }
        }
      }
    }
    return true;
  }, [activeViewFilters, activeViewConditions, kpiValues, mapKpi]);

  const updateThreshold = useCallback((field: 'green' | 'orange', val: number) => {
    setKpiThresholds(prev => {
      const next = { ...prev, [mapKpi]: { ...(prev[mapKpi] || { green: 80, orange: 60 }), [field]: val } };
      try { localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [mapKpi]);

  const toggleInvert = useCallback(() => {
    setKpiThresholds(prev => {
      const cur = prev[mapKpi] || { green: 80, orange: 60 };
      const next = { ...prev, [mapKpi]: { ...cur, invert: !cur.invert } };
      try { localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [mapKpi]);

  // ── Bbox-based data loading with debounce ──
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bboxTotal, setBboxTotal] = useState<number>(0);
  const [bboxLoading, setBboxLoading] = useState(false);

  // Derive current bbox filters from local filter state + backend filter bar
  const backendQueryStr = backendBuildQueryParams();
  const currentBboxFilters = useMemo((): BboxFilters => {
    const base: BboxFilters = {
      dor: localDor !== 'ALL' ? localDor : undefined,
      vendor: localVendor !== 'ALL' ? localVendor : undefined,
      plaque: localPlaque !== 'ALL' ? localPlaque : undefined,
      zone_arcep: localZoneArcep !== 'ALL' ? localZoneArcep : undefined,
      techno: localTechno !== 'ALL' ? localTechno : undefined,
      bande: localBande !== 'ALL' ? localBande : undefined,
      q: localSearch || undefined,
    };
    // Merge backend filter bar selections (override local if set)
    if (backendQueryStr) {
      const bp = new URLSearchParams(backendQueryStr);
      if (bp.get('dor')) base.dor = bp.get('dor')!;
      if (bp.get('vendor') || bp.get('constructeur')) base.vendor = (bp.get('vendor') || bp.get('constructeur'))!;
      if (bp.get('plaque')) base.plaque = bp.get('plaque')!;
      if (bp.get('zone_arcep')) base.zone_arcep = bp.get('zone_arcep')!;
      if (bp.get('techno')) base.techno = bp.get('techno')!;
      if (bp.get('bande')) base.bande = bp.get('bande')!;
      if (bp.get('cluster')) base.cluster = bp.get('cluster')!;
    }
    // Merge active dashboard filters (cluster, band, vendor from dashboard scope)
    if (dashboardActive && activeDashboardFilters) {
      const df = activeDashboardFilters;
      if ((df as any).cluster?.length && !base.cluster) base.cluster = (df as any).cluster.join(',');
      if (df.bande?.length && !base.bande) base.bande = df.bande.join(',');
      if (df.vendor?.length && !base.vendor) base.vendor = df.vendor.join(',');
      if (df.techno?.length && !base.techno) base.techno = df.techno.join(',');
      if (df.dor?.length && !base.dor) base.dor = df.dor.join(',');
      if (df.plaque?.length && !base.plaque) base.plaque = df.plaque.join(',');
    }
    return base;
  }, [localDor, localVendor, localPlaque, localZoneArcep, localTechno, localBande, localSearch, backendQueryStr, dashboardActive, activeDashboardFilters]);

  // Core bbox fetch function — ALWAYS site-only mode (never load cells at map level)
  const fetchForViewport = useCallback(async (bounds: L.LatLngBounds | null, bboxFilters: BboxFilters, zoom?: number) => {
    if (!bounds) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const bbox: BboxQuery = {
      minLng: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLng: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };

    setBboxLoading(true);

    try {
      // Always fetch site summaries only — cells are loaded on demand per site.
      // Pass zoom so the service caps the server-side fetch at what the map can
      // actually render (avoids pulling 4000 sites to display 1000).
      const { sites: newSites, total } = await fetchSitesByBbox(bbox, bboxFilters, controller.signal, viewport.zoom);

      if (controller.signal.aborted) return;

      // Preserve already loaded cells when fresh BBOX results only contain lightweight site summaries
      setSites(prev => {
        const prevById = new Map(prev.map(site => [site.site_id, site]));
        const mergedSites = (newSites || []).map(site => {
          const prevSite = prevById.get(site.site_id);
          if (!prevSite?.cells?.length || site.cells?.length) return site;
          return { ...site, cells: prevSite.cells };
        });

        // Deduplicate by site_id (VPS can return duplicate entries)
        const seen = new Set<string>();
        const deduped = mergedSites.filter(s => {
          if (seen.has(s.site_id)) return false;
          seen.add(s.site_id);
          return true;
        });

        const selectedId = selectedSiteIdRef.current;
        const selectedSite = selectedId ? prevById.get(selectedId) : null;
        if (selectedSite && !deduped.some(s => s.site_id === selectedId)) {
          return [selectedSite, ...deduped];
        }
        return deduped;
      });
      setBboxTotal(total || 0);
      setBboxLoading(false);
      setLoading(false);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('[SitesMonitor] bbox fetch failed', err);
      setBboxLoading(false);
      setLoading(false);
    }
  }, []);

  // Clear sites & cells only when leaving a dashboard-backed context and no search/no-dashboard load is active.
  useEffect(() => {
    if (!dashboardActive && !noDashboardMode && !isSearchActive) {
      if (abortRef.current) abortRef.current.abort();
      setSites([]);
      setBboxTotal(0);
      setBboxLoading(false);
      setLoading(false);
    }
  }, [dashboardActive, noDashboardMode, isSearchActive]);

  // Purge legacy global artifact storage once (pre dashboard-scoping)
  useEffect(() => { purgeLegacyArtifacts(); }, []);

  // Sync artifacts (custom points, tagged sites, tagged links) with the active dashboard.
  // No active dashboard → empty (creation is also blocked elsewhere).
  useEffect(() => {
    const dbId = dashboardActive ? activeDashboardId : null;
    activeDashboardIdRef.current = dbId;
    setCustomPoints(loadCustomPoints(dbId));
    setTaggedSites(loadTaggedSitesScoped(dbId));
    setTaggedLinks(loadTaggedLinks(dbId));
    setTaggedPolygons(loadTaggedPolygons(dbId));
    // Reset transient interaction states
    setPointCreationMode(false);
    setLinkCreationMode(false);
    setLinkSource(null);
    setSelectedLinkId(null);
  }, [dashboardActive, activeDashboardId]);

  // Debounced viewport change handler
  // IMPORTANT: when a dashboard is active, sites are exclusively loaded by the
  // dashboard scoped loader (loadDashboardScopedSites). A viewport-driven bbox
  // fetch here would race and overwrite the filtered dashboard sites with the
  // unfiltered global set (e.g. Nantes 224 sites replaced by 10 000 sites).
  const handleViewportForFetch = useCallback((v: ViewportState) => {
    if (dashboardActive) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchForViewport(v.bounds, currentBboxFilters, v.zoom);
    }, 450);
  }, [fetchForViewport, currentBboxFilters, dashboardActive]);

  // ── Debounced server-side search (independent of dashboard) ──
  const searchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const term = localSearch.trim();
    if (term.length < 2) {
      setSearchModeSites([]);
      setSearchResults([]);
      setSearchCoordMarker(null);
      return;
    }

    // ── Detect coordinate input (lat, lon) ──
    const coordMatch = term.match(/^\s*(-?\d+\.?\d*)\s*[,;\s]+\s*(-?\d+\.?\d*)\s*$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        setSearchResults([]);
        setSearchModeSites([]);
        setSearchCoordMarker([lat, lon]);
        setFlyTarget([lat, lon]);
        return;
      }
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;

      try {
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/sites`, { search: term, limit: '50' }), {
          headers: getVpsProxyHeaders(),
          signal: ctrl.signal,
        });
        const data = await resp.json();
        let siteList = Array.isArray(data) ? data : (data.sites || []);

        const shouldUseFallback = !ctrl.signal.aborted && (
          data?.unavailable === true ||
          (Array.isArray(siteList) && siteList.length === 0)
        );

        if (shouldUseFallback) {
          const { data: fallbackRows, error: fallbackError } = await supabase
            .from('topo')
            .select('nom_site, code_nidt, constructeur, dor, plaque, zone_arcep, latitude, longitude')
            .or(`nom_site.ilike.%${term}%,code_nidt.ilike.%${term}%`)
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .limit(50);

          if (fallbackError) throw fallbackError;

          siteList = (fallbackRows || []).map((row: any) => ({
            site_name: row.nom_site || row.code_nidt || '',
            nom_site: row.nom_site || '',
            code_nidt: row.code_nidt || '',
            constructeur: row.constructeur || 'Unknown',
            dor: row.dor || '',
            plaque: row.plaque || '',
            zone_arcep: row.zone_arcep || null,
            latitude: row.latitude,
            longitude: row.longitude,
          }));
        }

        setSearchResults(siteList);

        // Convert to SiteSummary for sidebar display
        const summaries: SiteSummary[] = siteList
          .filter((s: any) => {
            const lat = Number(s.latitude ?? s.lat);
            const lng = Number(s.longitude ?? s.lng);
            return Number.isFinite(lat) && Number.isFinite(lng);
          })
          .map((s: any) => {
            const siteName = s.site_name || s.nom_site || s.code_nidt || '';
            const lat = Number(s.latitude ?? s.lat);
            const lng = Number(s.longitude ?? s.lng);
            const cellCount = s.cell_count || s.nb_cells || 0;
            return {
              site_id: siteName,
              site_name: siteName,
              vendor: s.constructeur || (Array.isArray(s.vendors) ? s.vendors[0] : s.vendor) || 'Unknown',
              dor: s.dor || '',
              plaque: s.plaque || '',
              department: '',
              cell_count: Number(cellCount),
              qoe_score_avg: 0, p50_thr_dn_mbps: 0, p50_thr_up_mbps: 0,
              dms_dl_3: 0, dms_dl_8: 0, dms_dl_30: 0, dms_ul_3: 0,
              coordinates: [lat, lng] as [number, number],
              cells: [],
              zone_arcep: s.zone_arcep || null,
              lte_cells: s.lte_cells || 0,
              nr_cells: s.nr_cells || 0,
            } as SiteSummary;
          });

        setSearchModeSites(summaries);
        // Switch to the Sites tab so the search results are visible.
        // (Previously switched to Tagged, which only shows user-tagged
        // sites — search hits never appeared there.)
        if (summaries.length > 0) setInventoryTab('sites');

        // Auto-fly to first result
        if (summaries.length > 0) {
          setFlyTarget(summaries[0].coordinates);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[SitesMonitor] Debounced search failed', err);
          setSearchResults([]);
          setSearchModeSites([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, [localSearch]);

  // Dashboard-first loading: load site summaries only for the active dashboard context
  useEffect(() => {
    mountedRef.current = true;

    if (!dashboardActive) {
      if (abortRef.current) abortRef.current.abort();
      // No-dashboard mode: load all site summaries so the left inventory is always populated.
      // Map rendering remains protected by viewport culling and zoom/count gates (SITES_VISIBLE_ZOOM, MAX_VISIBLE_SITES).
      if (noDashboardMode) {
        let cancelledNoDash = false;
        setLoading(true);
        setBboxLoading(true);
        (async () => {
          try {
            // Try the full-topology loader first (most reliable: 50k cell cap, builds all sites).
            const { fetchTopoSites } = await import('../../services/topoService');
            let allSites: SiteSummary[] = [];
            try {
              allSites = await fetchTopoSites();
            } catch (e) {
              console.warn('[SitesMonitor] fetchTopoSites failed, falling back to dashboard loader', e);
            }
            if (!cancelledNoDash && allSites.length > 0) {
              setSites(allSites);
              setBboxTotal(allSites.length);
              setLoading(false);
              if (skipNextNoDashFitRef.current) {
                skipNextNoDashFitRef.current = false;
              } else {
                setDashboardFitKey(k => k + 1);
              }
              return;
            }
            // Fallback: dashboard loader with null filters
            let firstNoDashFitDone = false;
            const fallback = await fetchDashboardSites(null, undefined, (batch) => {
              if (!cancelledNoDash && batch.length > 0) {
                setSites(batch);
                setBboxTotal(batch.length);
                setLoading(false);
                if (!firstNoDashFitDone) {
                  firstNoDashFitDone = true;
                  if (skipNextNoDashFitRef.current) {
                    skipNextNoDashFitRef.current = false;
                  } else {
                    setDashboardFitKey(k => k + 1);
                  }
                }
              }
            });
            if (cancelledNoDash) return;
            const finalSites = fallback || [];
            if (finalSites.length > 0) {
              setSites(finalSites);
              setBboxTotal(finalSites.length);
            }
          } catch (err) {
            console.warn('[SitesMonitor] no-dashboard mode load failed', err);
          } finally {
            if (!cancelledNoDash) {
              setLoading(false);
              setBboxLoading(false);
            }
          }
        })();
        return () => { cancelledNoDash = true; };
      }
      // Don't clear sites if search is active — search results are separate
      setSites([]);
      setBboxTotal(0);
      setBboxLoading(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let firstBatchFitDone = false;

    const loadDashboardScopedSites = async () => {
      // Merge scope into filters if filters are empty
      let effectiveFilters = activeDashboardFilters;
      if ((!effectiveFilters || Object.keys(effectiveFilters).length === 0) && activeSiteScope && activeSiteScope.type !== 'ALL' && activeSiteScope.value) {
        if (activeSiteScope.type === 'DOR') effectiveFilters = { dor: [activeSiteScope.value] };
        else if (activeSiteScope.type === 'Plaque') effectiveFilters = { plaque: [activeSiteScope.value] };
      }

      const cachedDashboardSites = getCachedDashboardSites(effectiveFilters);
      if (cachedDashboardSites && cachedDashboardSites.length > 0) {
        setSites(cachedDashboardSites);
        setBboxTotal(cachedDashboardSites.length);
        setBboxLoading(false);
        setLoading(false);
        setDashboardFitKey(k => k + 1);
        return;
      }

      setLoading(true);
      setBboxLoading(true);

      try {
        const dashboardSites = await fetchDashboardSites(
          effectiveFilters,
          undefined,
          // Progressive callback: show sites on map immediately before QoE enrichment
          (batchSites) => {
            if (!cancelled && batchSites.length > 0) {
              setSites(batchSites);
              setBboxTotal(batchSites.length);
              setLoading(false); // map is usable now
              // Trigger fitBounds ONLY on first batch — subsequent batches must
              // not re-fit, otherwise the zoom drifts (e.g. 9 → 8) as the
              // bounding box expands while the user is already viewing the map.
              if (!firstBatchFitDone) {
                firstBatchFitDone = true;
                setDashboardFitKey(k => k + 1);
              }
            }
          },
        );

        if (cancelled) return;

        // Final enriched update (with QoE data)
        // Guard: don't overwrite existing sites with empty results
        const finalSites = dashboardSites || [];
        if (finalSites.length > 0) {
          setSites(finalSites);
          setBboxTotal(finalSites.length);
          // Do NOT increment dashboardFitKey here — fitBounds was already triggered
          // on the first batch/cache load. Re-triggering it mid-download causes
          // unwanted zoom changes while the user is navigating.
          // Only pre-warm cells cache if user is already at sector-display zoom
          // to avoid downloading 6M+ cells when the map shows only site dots.
          if (viewport.zoom >= SITES_TO_CELLS_ZOOM) {
            // Use dashboard filters (includes cluster) instead of local filters (reset to ALL)
            const cellFilters: BboxFilters = { ...currentBboxFilters };
            if (effectiveFilters) {
              if ((effectiveFilters as any).cluster?.length) cellFilters.cluster = (effectiveFilters as any).cluster.join(',');
              if (effectiveFilters.bande?.length) cellFilters.bande = effectiveFilters.bande.join(',');
              if (effectiveFilters.vendor?.length) cellFilters.vendor = effectiveFilters.vendor.join(',');
              if (effectiveFilters.techno?.length) cellFilters.techno = effectiveFilters.techno.join(',');
              if (effectiveFilters.dor?.length) cellFilters.dor = effectiveFilters.dor.join(',');
              if (effectiveFilters.plaque?.length) cellFilters.plaque = effectiveFilters.plaque.join(',');
            }
            topoApi.prefetchCells(cellFilters);
          }
        } else {
          // Only clear if we had no prior data
          setSites(prev => prev.length > 0 ? prev : []);
          setBboxTotal(prev => typeof prev === 'number' && prev > 0 ? prev : 0);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[SitesMonitor] dashboard site load failed', err);
          // Don't clear existing sites on error — keep what we have
          setSites(prev => prev.length > 0 ? prev : []);
        }
      } finally {
        if (!cancelled) {
          setBboxLoading(false);
          setLoading(false);
        }
      }
    };

    loadDashboardScopedSites();

    return () => {
      cancelled = true;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [dashboardActive, activeDashboardFilters, activeSiteScope, dashboardRefreshTick, noDashboardMode]);

  // Re-fetch when viewport changes (debounced via MapViewportTracker)
  const prevViewportRef = useRef<ViewportState>({ bounds: null, zoom: 6 });
  const viewportGuardRef = useRef(0);
  const handleViewportChange = useCallback((v: ViewportState) => {
    // Throttle: allow max one viewport update per 100ms to prevent infinite loop
    // while still allowing zoom/pan interactions
    const now = Date.now();
    if (now - viewportGuardRef.current < 100) return;
    viewportGuardRef.current = now;
    setViewport(v);
    // Cache map position (non-blocking)
    if (v.bounds) {
      const c = v.bounds.getCenter?.();
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        queueMicrotask(() => mapCache.setMapPosition([c.lat, c.lng], v.zoom));
      }
    }

    if (!dashboardActive) return;
    if (isFlyingRef.current) return;

    const prev = prevViewportRef.current;

    if (prev.bounds && v.bounds) {
      const threshold = 0.001;

      const moved =
        Math.abs(prev.bounds.getWest() - v.bounds.getWest()) > threshold ||
        Math.abs(prev.bounds.getSouth() - v.bounds.getSouth()) > threshold ||
        Math.abs(prev.bounds.getEast() - v.bounds.getEast()) > threshold ||
        Math.abs(prev.bounds.getNorth() - v.bounds.getNorth()) > threshold;

      const zoomChanged = prev.zoom !== v.zoom;

      if (!moved && !zoomChanged) return;
    }

    prevViewportRef.current = v;
  }, [dashboardActive]);

  // Auto-load cells refs (effect placed after visibleSites is defined)
  const cellLoadingRef = useRef(new Set<string>());
  const cellLoadAttemptedRef = useRef(new Set<string>());
  // Track per-site fetch attempts so we stop hammering sites that backend can't resolve
  const cellLoadAttemptCountRef = useRef(new Map<string, number>());
  const MAX_CELL_LOAD_ATTEMPTS = 2;
  const cellLoadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cellsLoadingCount, setCellsLoadingCount] = useState(0);
  const [cellsCacheLoadedCount, setCellsCacheLoadedCount] = useState(0);
  const [cellsCacheLoading, setCellsCacheLoading] = useState(false);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      const loadDetail = async () => {
        // First: check if we already have cells from a previous load
        const bboxSite = sites.find(s => s.site_id === selectedSiteId || s.site_name === selectedSiteId);
        if (bboxSite && bboxSite.cells && bboxSite.cells.length > 0) {
          const detail: SiteDetail = {
            ...bboxSite,
            traffic_dn_bytes: bboxSite.cells.reduce((sum, c) => sum + (c.traffic_dn_bytes || 0), 0),
            traffic_up_bytes: bboxSite.cells.reduce((sum, c) => sum + (c.traffic_up_bytes || 0), 0),
            p95_rtt_ms: bboxSite.cells.length > 0
              ? bboxSite.cells.reduce((sum, c) => sum + (c.p95_rtt_ms || 0), 0) / bboxSite.cells.length
              : 0,
          };
          setSiteDetail(detail);
          setDetailLoading(false);
          return;
        }
        // On-demand: fetch cells for this site only (with caching)
        if (!siteDetail || siteDetail.site_id !== selectedSiteId) {
          setDetailLoading(true);
        }
        try {
          const activeCluster = (activeDashboardFilters as any)?.cluster?.length ? (activeDashboardFilters as any).cluster.join(',') : undefined;
          const cells = await fetchSiteCells(selectedSiteId, bboxSite?.site_name || selectedSiteSnapshot?.site_name, activeCluster);
          const baseSite = bboxSite || {
            site_id: selectedSiteId,
            site_name: selectedSiteId,
            vendor: 'Unknown',
            dor: '',
            plaque: '',
            department: '',
            cell_count: cells.length,
            qoe_score_avg: 0,
            p50_thr_dn_mbps: 0,
            p50_thr_up_mbps: 0,
            dms_dl_3: 0,
            dms_dl_8: 0,
            dms_dl_30: 0,
            dms_ul_3: 0,
            coordinates: [46.6, 2.2] as [number, number],
            cells: [],
          };
          const detail: SiteDetail = {
            ...baseSite,
            cells,
            cell_count: cells.length,
            traffic_dn_bytes: cells.reduce((sum, c) => sum + (c.traffic_dn_bytes || 0), 0),
            traffic_up_bytes: cells.reduce((sum, c) => sum + (c.traffic_up_bytes || 0), 0),
            p95_rtt_ms: cells.length > 0
              ? cells.reduce((sum, c) => sum + (c.p95_rtt_ms || 0), 0) / cells.length
              : 0,
          };
          setSiteDetail(detail);
        } catch (err) {
          console.warn('[SitesMonitor] Failed to load site cells:', err);
          // Fallback: legacy full-load detail
          const data = await fetchSiteDetails(selectedSiteId);
          setSiteDetail(data);
        }
        setDetailLoading(false);
      };
      loadDetail();
    } else {
      setSiteDetail(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId]);

  useEffect(() => {
    if (focusMode !== 'site' || !selectedSiteId || !siteDetail || siteDetail.site_id !== selectedSiteId) return;
    if (expandedSectors.size > 0) return;

    const sectorKeys = Array.from(new Set(siteDetail.cells.map(c => getSidebarSectorKey(c.cell_id))));
    if (sectorKeys.length > 0) {
      setExpandedSectors(new Set([sectorKeys[0]]));
    }
  }, [focusMode, selectedSiteId, siteDetail, expandedSectors.size]);

  // Fetch LTE config from parameter_dump when a cell is focused
  useEffect(() => {
    if (!focusCellId || !siteDetail) {
      setLteConfig(prev => ({ ...prev, pmax: null, dlChBw: null, dlMimoMode: null, dlRsBoost: null, loading: false, cellName: null }));
      return;
    }
    const cell = siteDetail.cells.find(c => c.cell_id === focusCellId);
    if (!cell || !cell.cell_id) return;
    // Only fetch for LTE (4G) cells
    const techno = (cell as any).techno || '';
    if (!techno.toLowerCase().includes('lte') && !techno.includes('4G') && !techno.includes('L')) {
      setLteConfig({ pmax: null, dlChBw: null, dlMimoMode: null, dlRsBoost: null, loading: false, cellName: cell.cell_id });
      return;
    }
    const cellName = cell.cell_id;
    setLteConfig(prev => ({ ...prev, loading: true, cellName }));
    const fetchParams = async () => {
      try {
        // Fetch cell config from VPS backend (uses ref_cell_daily + param_nokia_dump)
        const siteName = siteDetail.site_name;
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/cell-config?site_name=${encodeURIComponent(siteName)}`), {
          headers: getVpsProxyHeaders(),
        });
        const result = await resp.json();
        let pmax: number | null = null, dlChBw: string | null = null, dlMimoMode: string | null = null, dlRsBoost: number | null = null;
        // Find the matching cell in the response
        const cellData = (result.cells || []).find((c: any) => c.cell_name === cellName);
        if (cellData && cellData.config) {
          const cfg = cellData.config;
          if (cfg.pMax != null) pmax = Number(cfg.pMax);
          if (cfg.dlBandwidth != null) dlChBw = String(cfg.dlBandwidth);
          if (cfg.dlMimoMode != null) dlMimoMode = String(cfg.dlMimoMode);
          if (cfg.dlRsBoost != null) dlRsBoost = Number(cfg.dlRsBoost);
        }
        setLteConfig({ pmax, dlChBw, dlMimoMode, dlRsBoost, loading: false, cellName });
      } catch (err) {
        console.error('Failed to fetch LTE config:', err);
        setLteConfig({ pmax: null, dlChBw: null, dlMimoMode: null, dlRsBoost: null, loading: false, cellName });
      }
    };
    fetchParams();
  }, [focusCellId, siteDetail]);


  const filteredSites = useMemo(() => {
    // When search is active, use search results instead of dashboard sites
    const baseSites = isSearchActive && searchModeSites.length > 0 ? searchModeSites : sites;

    // Debug: log active QOE filters
    const qoeFilters = activeViewFilters.filter(f => f.mode === 'qoe' && f.kpi && f.operator && f.threshold != null);
    if (qoeFilters.length > 0) {
      console.log('[QOE Filter] Active filters:', JSON.stringify(qoeFilters));
      console.log('[QOE Filter] Total sites before filter:', baseSites.length);
    }
    // Skip local search filter when using searchModeSites (already server-filtered)
    const searchTerm = isSearchActive && searchModeSites.length > 0 ? '' : localSearch.toLowerCase();
    // When search is active, bypass dashboard-injected local filters
    // (dor/plaque/bande/zone_arcep/techno). Otherwise a search for "lyon"
    // under the Lille_L800 dashboard returns 0 hits because the LYON
    // sites coming back from the server don't match plaque=LILLE etc.
    const bypassLocalFilters = isSearchActive && searchModeSites.length > 0;
    const filtered = baseSites.filter(s => {
      const siteName = String(s.site_name ?? '');
      const siteId = String(s.site_id ?? '');
      const siteCells = Array.isArray(s.cells) ? s.cells : [];
      const matchesSearch = !searchTerm || siteName.toLowerCase().includes(searchTerm) || siteId.toLowerCase().includes(searchTerm) || siteCells.some(c => String(c.cell_id ?? '').toLowerCase().includes(searchTerm) || String(c.techno ?? '').toLowerCase().includes(searchTerm) || String(c.bande ?? '').toLowerCase().includes(searchTerm));
      const matchesDor = bypassLocalFilters || filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesPlaque = bypassLocalFilters || filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesVendor = bypassLocalFilters || filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDep = bypassLocalFilters || filters.department === 'ALL' || s.department === filters.department;
      // When cells are empty (bbox-loaded), rely on normalized site tech inference instead of hiding valid NR/LTE sites
      const matchesRat = bypassLocalFilters || filters.rat === 'ALL' || (siteCells.length > 0
        ? siteCells.some(c => getCellTechGroup(c.techno) === filters.rat)
        : siteMatchesRequestedTech(s, filters.rat as TechGroup));
      const matchesLocalVendor = bypassLocalFilters || localVendor === 'ALL' || s.vendor === localVendor;
      const matchesLocalDor = bypassLocalFilters || localDor === 'ALL' || s.dor === localDor;
      const matchesLocalPlaque = bypassLocalFilters || localPlaque === 'ALL' || s.plaque === localPlaque;
      const matchesLocalBande = bypassLocalFilters || localBande === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => c.bande === localBande) : !(s as any).bande || (s as any).bande === localBande);
      const matchesLocalZoneArcep = bypassLocalFilters || localZoneArcep === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => (c as any).zone_arcep === localZoneArcep) : (s as any).zone_arcep === localZoneArcep);
      const matchesLocalTechno = bypassLocalFilters || localTechno === 'ALL' || (siteCells.length > 0
        ? siteCells.some(c => getCellTechGroup(c.techno) === localTechno)
        : siteMatchesRequestedTech(s, localTechno));
      
      // Apply QOE view filters
      const matchesQoeFilters = activeViewFilters
        .filter(f => f.mode === 'qoe' && f.kpi && f.operator && f.threshold != null)
        .every(f => {
          // Try site-level value first, then compute average from cells
          let val = (s as any)[f.kpi!];
          if (val == null && Array.isArray(s.cells) && s.cells.length > 0) {
            const cellVals = s.cells.map((c: any) => c[f.kpi!]).filter((v: any) => v != null);
            if (cellVals.length > 0) val = cellVals.reduce((a: number, b: number) => a + b, 0) / cellVals.length;
          }
          if (val == null) return false;
          switch (f.operator) {
            case '>': return val > f.threshold!;
            case '>=': return val >= f.threshold!;
            case '<': return val < f.threshold!;
            case '<=': return val <= f.threshold!;
            case '=': return Math.abs(val - f.threshold!) < 0.01;
            default: return true;
          }
        });

      // Apply advanced view conditions (from ViewFilterBuilder)
      const viewResult = siteMatchesViewConditions(
        s,
        siteCells,
        activeViewConditions,
        cellLoadAttemptedRef.current.has(s.site_id),
      );
      // 'pending' means cells not loaded yet — temporary pass-through
      const matchesViewConditions = viewResult === 'pending' ? true : viewResult;
      
      return matchesSearch && matchesDor && matchesPlaque && matchesVendor && matchesDep && matchesRat && matchesLocalVendor && matchesLocalDor && matchesLocalPlaque && matchesLocalBande && matchesLocalZoneArcep && matchesLocalTechno && matchesQoeFilters && matchesViewConditions;
    });
    if (qoeFilters.length > 0) {
      console.log('[QOE Filter] Sites after filter:', filtered.length);
    }
    if (inventorySortOrder === 'none') return filtered;
    return [...filtered].sort((a, b) => {
      const va = kpiValues.get(`site:${a.site_name}`) ?? kpiValues.get(`site:${a.site_id}`) ?? (a as any)[mapKpi] ?? a.qoe_score_avg ?? 0;
      const vb = kpiValues.get(`site:${b.site_name}`) ?? kpiValues.get(`site:${b.site_id}`) ?? (b as any)[mapKpi] ?? b.qoe_score_avg ?? 0;
      return inventorySortOrder === 'asc' ? va - vb : vb - va;
    });
  }, [sites, searchModeSites, isSearchActive, localSearch, filters, localVendor, localDor, localPlaque, localBande, localZoneArcep, localTechno, inventorySortOrder, mapKpi, activeViewFilters, activeViewConditions, kpiValues]);

  // Keep ref in sync so the polygon→cluster flow can count sites without ordering issues
  useEffect(() => { filteredSitesRef.current = filteredSites; }, [filteredSites]);

  // Radius analysis stats
  const radiusStats = useMemo(() => {
    if (!radiusCenter || !radiusConfirmed || radiusConfirmedMeters <= 0) return null;
    const center = { lat: radiusCenter[0], lng: radiusCenter[1] };
    let sitesInside = 0;
    let cellsInside = 0;
    for (const s of filteredSites) {
      const d = haversineDistance(center, { lat: s.coordinates[0], lng: s.coordinates[1] });
      if (d <= radiusConfirmedMeters) {
        sitesInside++;
        cellsInside += s.cells.length;
      }
    }
    return { sitesInside, cellsInside };
  }, [radiusCenter, radiusConfirmed, radiusConfirmedMeters, filteredSites]);


  const isBandEnabled = useCallback((bande: string, techno?: string) => {
    const key = normalizeBandKey(bande, techno);
    // Unknown formats stay visible instead of disappearing
    if (!key) return true;
    return enabledBands.has(key);
  }, [enabledBands]);

  const siteMatchesKpiLegend = useCallback((site: SiteSummary) => {
    if (sectorColorMode !== 'kpi' || (hiddenKpiLevels.size === 0 && !kpiValueFilterFn)) return true;
    if (kpiLegendScope === 'site') {
      const siteVal = getSiteKpiValue(site);
      if (hiddenKpiLevels.has(getKpiLevel(siteVal))) return false;
      if (kpiValueFilterFn && !kpiValueFilterFn(siteVal)) return false;
      return true;
    }
    const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
    const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
    const cells = (site.cells || []).filter(c =>
      isCellVisibleForKpiOverlay(
        c,
        kpiTechnoFilter,
        enabledTechnos,
        isBandEnabled,
        dashBand,
        dashTechno,
        localTechno,
        localBande,
        kpiOverlayVendor,
        site.vendor,
      ),
    );

    if (cells.length === 0) {
      const val = kpiValues.get(`site:${site.site_name}`) ?? kpiValues.get(`site:${site.site_id}`) ?? (site as any)[mapKpi] ?? site.qoe_score_avg ?? NaN;
      if (hiddenKpiLevels.has(getKpiLevel(val))) return false;
      if (kpiValueFilterFn && !kpiValueFilterFn(val)) return false;
      return true;
    }

    return cells.some(c => {
      const siteName = site.site_name || site.site_id || '';
      const value = getCellKpiValue(c, siteName);
      if (hiddenKpiLevels.size > 0 && hiddenKpiLevels.has(getKpiLevel(value))) return false;
      if (kpiValueFilterFn && !kpiValueFilterFn(value)) return false;
      return true;
    });
  }, [
    sectorColorMode,
    hiddenKpiLevels,
    dashboardActive,
    activeDashboardFilters,
    kpiTechnoFilter,
    enabledTechnos,
    isBandEnabled,
    localTechno,
    localBande,
    kpiOverlayVendor,
    kpiValues,
    mapKpi,
    getKpiLevel,
    getCellKpiValue,
    kpiValueFilterFn,
    kpiLegendScope,
    getSiteKpiValue,
  ]);

  const toggleBand = useCallback((band: string) => {
    setEnabledBands(prev => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  const toggleAllBands = useCallback((group: 'NR' | 'LTE' | 'UMTS' | 'GSM') => {
    const bands = group === 'NR' ? ['NR3500', 'NR700', 'NR2100', 'NR1800', 'NR2600', 'NR1400'] : group === 'LTE' ? ['L2600', 'L2100', 'L1800', 'L800', 'L700', 'L900'] : group === 'UMTS' ? ['UMTS2100', 'UMTS900'] : ['GSM900', 'GSM1800'];
    setEnabledBands(prev => {
      const next = new Set(prev);
      const allOn = bands.every(b => next.has(b));
      bands.forEach(b => allOn ? next.delete(b) : next.add(b));
      return next;
    });
  }, []);

  // All possible band keys (excluding group headers)
  const ALL_BAND_KEYS = useMemo(() => {
    const keys = new Set(Object.keys(DEFAULT_BAND_COLORS));
    keys.delete('5G_GROUP');
    keys.delete('4G_GROUP');
    return keys;
  }, []);

  // Are band filters active? (not all bands enabled)
  const isBandFilterActive = useMemo(() => {
    if (enabledBands.size >= ALL_BAND_KEYS.size) return false;
    for (const k of ALL_BAND_KEYS) {
      if (!enabledBands.has(k)) return true;
    }
    return false;
  }, [enabledBands, ALL_BAND_KEYS]);

  // Check if a site has at least one cell matching any enabled band
  const siteHasEnabledBand = useCallback((site: any): boolean => {
    // If 0 band is enabled, nothing can match → hide immediately, no pass-through.
    if (enabledBands.size === 0) return false;
    // If cells are loaded, check at cell level (strict)
    if (site.cells?.length) {
      return site.cells.some((cell: any) => isBandEnabled(cell.bande, cell.techno));
    }
    // While cells are still loading, keep the site visible.
    if (cellLoadingRef.current.has(site.site_id)) return true;
    // If loading has already been attempted and no matching cells were found, hide it.
    if (cellLoadAttemptedRef.current.has(site.site_id)) return false;
    // Not loaded yet → temporary pass-through until background fetch completes.
    return true;
  }, [isBandEnabled, enabledBands]);

  // Sites filtered by techno AND band (for map rendering only)
  const mapFilteredSites = useMemo(() => {
    if (mapTechnoFilter === 'OFF') return [];

    let result: typeof filteredSites;
    if (mapTechnoFilter === 'ALL') {
      if (enabledTechnos.size === 0) return [];
      if (enabledTechnos.size === 4) {
        result = filteredSites;
      } else {
        result = filteredSites.filter(s => {
          for (const t of enabledTechnos) {
            if (siteMatchesRequestedTech(s, t)) return true;
          }
          return false;
        });
      }
    } else {
      result = filteredSites.filter(s => siteMatchesRequestedTech(s, mapTechnoFilter as TechGroup));
    }

    // When band filter is active, hide sites with no cells matching enabled bands
    if (isBandFilterActive) {
      result = result.filter(siteHasEnabledBand);
    }

    return result;
  }, [filteredSites, mapTechnoFilter, enabledTechnos, isBandFilterActive, siteHasEnabledBand]);

  // Bands actually present in the active scope (dashboard sites). Used to
  // restrict the band-chip selector in the top bar so it never shows bands
  // that don't exist in the currently visible scope.
  const availableBandsInScope = useMemo(() => {
    const set = new Set<string>();
    const technoActive = mapTechnoFilter !== 'OFF';
    const restrictByTech = mapTechnoFilter !== 'ALL' && technoActive;
    const restrictByEnabled = mapTechnoFilter === 'ALL' && enabledTechnos.size > 0 && enabledTechnos.size < 4;
    // Active dashboard band/techno perimeter (e.g. Lille_L800 → only L800)
    const dashBandsRaw = dashboardActive && activeDashboardFilters?.bande?.length
      ? activeDashboardFilters.bande
      : null;
    const dashBandKeys = dashBandsRaw
      ? new Set(dashBandsRaw.map(b => normalizeBandKey(b, undefined) || String(b).toUpperCase().trim()).filter(Boolean) as string[])
      : null;
    const dashTechnos = dashboardActive && activeDashboardFilters?.techno?.length
      ? new Set(activeDashboardFilters.techno.map(t => String(t).toUpperCase().trim()))
      : null;
    for (const s of filteredSites) {
      if (!s.cells?.length) continue;
      for (const cell of s.cells) {
        const grp = getCellTechGroup((cell as any).techno);
        if (restrictByTech && grp !== mapTechnoFilter) continue;
        if (restrictByEnabled && !enabledTechnos.has(grp as any)) continue;
        if (dashTechnos && !dashTechnos.has(String((cell as any).techno || '').toUpperCase().trim()) && !dashTechnos.has(grp as any)) continue;
        const key = normalizeBandKey((cell as any).bande, (cell as any).techno);
        if (dashBandKeys && key && !dashBandKeys.has(key)) continue;
        if (key) set.add(key);
      }
    }
    return set;
  }, [filteredSites, mapTechnoFilter, enabledTechnos, dashboardActive, activeDashboardFilters]);

  // Dynamic filter options based on actual data
  const uniqueVendors = useMemo(() => ['ALL', ...new Set(sites.map(s => s.vendor).filter(Boolean))].sort(), [sites]);
  const uniqueDors = useMemo(() => ['ALL', ...new Set(sites.map(s => s.dor).filter(Boolean))].sort(), [sites]);
  const uniquePlaques = useMemo(() => ['ALL', ...new Set(sites.map(s => s.plaque).filter(Boolean))].sort(), [sites]);
  const uniqueZoneArceps = useMemo(() => {
    const zones = new Set<string>();
    sites.forEach(s => s.cells.forEach(c => { const z = (c as any).zone_arcep; if (z) zones.add(z); }));
    return ['ALL', ...Array.from(zones).sort()];
  }, [sites]);
  const uniqueBandes = useMemo(() => {
    const bandes = new Set<string>();
    sites.forEach(s => {
      getSiteDisplayBands(s).forEach(b => bandes.add(b));
    });
    return ['ALL', ...Array.from(bandes).sort()];
  }, [sites]);
  const effectiveSidebarBande = useMemo(() => {
    if (localBande !== 'ALL') return localBande;
    if (dashboardActive && activeDashboardFilters?.bande?.length === 1) {
      return activeDashboardFilters.bande[0];
    }
    return 'ALL';
  }, [localBande, dashboardActive, activeDashboardFilters]);

  // Sites visible in current viewport (for map rendering) — gated by zoom and count
  const MAX_CELL_RESOLUTION_SITES = 250;

  const visibleSites = useMemo(() => {
    // Zoom gate: never render sites below SITES_VISIBLE_ZOOM
    if (viewport.zoom < SITES_VISIBLE_ZOOM) return [];
    let candidates = mapFilteredSites;
    // Viewport culling
    if (viewport.bounds) {
      candidates = candidates.filter(s => {
        const lat = s.coordinates?.[0];
        const lng = s.coordinates?.[1];
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
        return viewport.bounds!.contains(L.latLng(lat, lng));
      });
    }
    // KPI legend filter: hide sites whose KPI level is toggled off.
    // A site is kept if ANY of its cells matches a visible level (avoids hiding
    // a site just because its first cell has no KPI data while another cell does).
    if (sectorColorMode === 'kpi' && hiddenKpiLevels.size > 0) {
      candidates = candidates.filter(siteMatchesKpiLegend);
    }
    // Count gate: if too many sites in viewport, render nothing — user must zoom in further
    if (candidates.length > MAX_VISIBLE_SITES) {
      console.warn(`[SitesMonitor] visibleSites guard tripped: ${candidates.length} > MAX_VISIBLE_SITES=${MAX_VISIBLE_SITES}, rendering nothing`);
      return [];
    }
    return candidates;
  }, [mapFilteredSites, viewport.bounds, viewport.zoom, sectorColorMode, hiddenKpiLevels, siteMatchesKpiLegend]);

  // [DIAG] filter-chain trace — logs once per length change to identify which filter rejects sites at mount
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[FILTER-CHAIN]', {
      sites: sites.length,
      filteredSites: filteredSites.length,
      mapFilteredSites: mapFilteredSites.length,
      visibleSites: visibleSites.length,
      enabledTechnos: [...enabledTechnos],
      mapTechnoFilter,
      isBandFilterActive,
      dashboardActive,
      activeDashboardFilters,
      localTechno,
      localBande,
      localVendor,
      localDor,
      localPlaque,
      viewportZoom: viewport.zoom,
      hasViewportBounds: !!viewport.bounds,
    });
  }, [sites.length, filteredSites.length, mapFilteredSites.length, visibleSites.length]);

  const taggedSitesInView = useMemo(() => {
    return taggedSites.filter(s => {
      const lat = s.coordinates?.[0];
      const lng = s.coordinates?.[1];
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return false;
      return !viewport.bounds || viewport.bounds.contains(L.latLng(lat, lng));
    });
  }, [taggedSites, viewport.bounds]);

  const sitesPendingCells = useMemo(() => {
    const merged = new Map<string, SiteSummary>();
    for (const site of visibleSites) merged.set(site.site_id, site);
    for (const site of taggedSitesInView) {
      if (!merged.has(site.site_id)) merged.set(site.site_id, site);
    }
    return Array.from(merged.values());
  }, [visibleSites, taggedSitesInView]);

  const hasTaggedSitesNeedingCells = useMemo(
    () => taggedSitesInView.some(site => site.cells.length === 0),
    [taggedSitesInView],
  );

  // Cell counts per KPI level (used in the legend). Computed from all
  // dashboard-filtered sites (mapFilteredSites), independent of legend toggles
  // so counts remain stable when the user hides/shows levels.
  const kpiLevelCounts = useMemo(() => {
    const counts = { green: 0, orange: 0, red: 0, gray: 0 } as Record<'green'|'orange'|'red'|'gray', number>;
    if (sectorColorMode !== 'kpi') return counts;
    // Honest-legend guard (v6.4.5, 2026-05-11): when the KPI engine
    // returned 0 values for the selected KPI/period (kpiValues empty),
    // bucket every site under "No data" (gray) instead of falling back
    // to stale per-site fields like `s[mapKpi]` or `s.qoe_score_avg`,
    // which were unrelated to the active KPI and produced a fake
    // "Critique" count when their value happened to be 0.
    const noEngineData = kpiValues.size === 0;
    if (kpiLegendScope === 'site') {
      for (const s of mapFilteredSites) {
        if (noEngineData) { counts.gray++; continue; }
        const val = getSiteKpiValue(s);
        counts[getKpiLevel(val)]++;
      }
      return counts;
    }
    const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
    const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
    for (const s of mapFilteredSites) {
      const cells = s.cells || [];
      if (cells.length === 0) {
        // Empty-cells fallback: count 1 entry per site. When the engine
        // has no data, force gray to avoid the stale-field fallback.
        const val = noEngineData
          ? NaN
          : (kpiValues.get(`site:${s.site_name}`) ?? kpiValues.get(`site:${s.site_id}`) ?? (s as any)[mapKpi] ?? s.qoe_score_avg ?? NaN);
        counts[getKpiLevel(val)]++;
      } else {
        for (const c of cells) {
          if (!isCellVisibleForKpiOverlay(c, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno, localTechno, localBande, kpiOverlayVendor, s.vendor)) continue;
          // getCellKpiValue returns NaN when kpiValues lacks the cell;
          // with the engine empty, NaN → gray. No stale fallback here.
          counts[getKpiLevel(getCellKpiValue(c, s.site_name || s.site_id || ''))]++;
        }
      }
    }
    return counts;
  }, [mapFilteredSites, sectorColorMode, kpiValues, mapKpi, getKpiLevel, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashboardActive, activeDashboardFilters, localTechno, localBande, kpiLegendScope, getSiteKpiValue]);

  const inventoryVisibleSites = useMemo(() => {
    if (sectorColorMode !== 'kpi') return filteredSites;
    return filteredSites.filter(siteMatchesKpiLegend);
  }, [filteredSites, sectorColorMode, siteMatchesKpiLegend]);

  const selectedSiteCoords = useMemo<[number, number] | null>(() => {
    // The pulse halo must be tied to a site that is actually rendered on the
    // map. If the site disappears (zoom out, filters, dashboard change), the
    // halo must disappear too — otherwise it floats orphaned over the map.
    if (!selectedSiteId) return null;
    const fromSites = sites.find(
      (site) => site.site_id === selectedSiteId || site.site_name === selectedSiteId
    );
    const coords = fromSites?.coordinates;
    if (!coords || coords.length !== 2) return null;
    const [lat, lng] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  }, [selectedSiteId, sites]);

  // Smart Auto density-adaptive beam rendering (single source of truth):
  // hexbin sites/km² → percentile rank → per-site beamScale + opacityScale.
  // The legacy global `sectorDensityFactor` (based on total visible count) has been
  // removed — it was double-shrinking beams in dense zones on top of Smart Auto.
  // Recomputed when the visible set or zoom changes.
  const siteDensityMap = useMemo<Map<string, SiteDensityInfo>>(() => {
    if (!visibleSites || visibleSites.length === 0) return new Map();
    const points = visibleSites
      .filter(s => Number.isFinite(s.coordinates?.[0]) && Number.isFinite(s.coordinates?.[1]))
      .map(s => ({ id: s.site_id, lat: s.coordinates[0], lng: s.coordinates[1] }));
    // More aggressive LOD at zoom 12-13 to reduce visual density
    const lodFactor = viewport.zoom <= 12 ? 0.6 : viewport.zoom <= 13 ? 0.8 : 1.0;
    return computeSmartAutoDensity(points, viewport.zoom, lodFactor);
  }, [visibleSites, viewport.zoom]);

  /** Per-site density factor for getZoomAwareRadius — Smart Auto only, neutral (1.0) when missing. */
  const getSiteDensityFactor = (siteId: string): number => {
    const info = siteDensityMap.get(siteId);
    if (!info) return 1; // neutral: no shrink when site is unknown to Smart Auto
    return beamScaleToDensityFactor(info.beamScale);
  };

  /** Per-site opacity multiplier (1 in sparse zones, down to 0.55 in dense zones). */
  const getSiteOpacityScale = (siteId: string): number => {
    const info = siteDensityMap.get(siteId);
    return info ? info.opacityScale : 1;
  };

  // Viewport width for responsive sector sizing
  const vpWidth = typeof window !== 'undefined' ? window.innerWidth : 1400;


  // Determine if we have cell-level view conditions that require cell data
  const hasCellLevelConditions = useMemo(
    () => hasAnyCellLevelCondition(activeViewConditions),
    [activeViewConditions],
  );

  // Clear cell cache and re-prefetch when filters change (e.g. Cluster_B adds band filter)
  const prevBboxFiltersCacheRef = useRef<string>('');
  useEffect(() => {
    const filterKey = JSON.stringify(currentBboxFilters);
    if (prevBboxFiltersCacheRef.current && prevBboxFiltersCacheRef.current !== filterKey) {
      cellLoadAttemptedRef.current.clear();
      cellLoadingRef.current.clear();
      cellLoadAttemptCountRef.current.clear();
      invalidateBboxCache();
      // Re-prefetch cells with new filters (e.g. cluster applies band/vendor)
      if (viewport.zoom >= SITES_TO_CELLS_ZOOM) {
        topoApi.prefetchCells(currentBboxFilters || undefined);
        setSites(prev => prev.map(s => ({ ...s, cells: [] })));
      }
    }
    prevBboxFiltersCacheRef.current = filterKey;
  }, [currentBboxFilters, viewport.zoom]);

  // Ensure cells are prefetched whenever the user zooms past the sector-display threshold,
  // even if the dashboard was originally loaded at a lower zoom (in which case the
  // initial prefetch was skipped). Without this, sites stay at "0 cells" forever in
  // KPI / sector view at high zoom.
  const cellsPrefetchedAtZoomRef = useRef(false);
  useEffect(() => {
    if (viewport.zoom < SITES_TO_CELLS_ZOOM) {
      cellsPrefetchedAtZoomRef.current = false;
      return;
    }
    if (cellsPrefetchedAtZoomRef.current) return;
    if (sites.length === 0) return;
    const anyHasCells = sites.some(s => (s.cells?.length || 0) > 0);
    if (anyHasCells) {
      cellsPrefetchedAtZoomRef.current = true;
      return;
    }
    const cellFilters: BboxFilters = { ...currentBboxFilters };
    if (dashboardActive && activeDashboardFilters) {
      const df: any = activeDashboardFilters;
      if (df.cluster?.length && !cellFilters.cluster) cellFilters.cluster = df.cluster.join(',');
      if (df.bande?.length && !cellFilters.bande) cellFilters.bande = df.bande.join(',');
      if (df.vendor?.length && !cellFilters.vendor) cellFilters.vendor = df.vendor.join(',');
      if (df.techno?.length && !cellFilters.techno) cellFilters.techno = df.techno.join(',');
      if (df.dor?.length && !cellFilters.dor) cellFilters.dor = df.dor.join(',');
      if (df.plaque?.length && !cellFilters.plaque) cellFilters.plaque = df.plaque.join(',');
    }
    console.info('[SitesMonitor] Late prefetch of cells (zoom up after dashboard load)');
    topoApi.prefetchCells(cellFilters);
    cellsPrefetchedAtZoomRef.current = true;
  }, [viewport.zoom, sites, currentBboxFilters, dashboardActive, activeDashboardFilters]);

  useEffect(() => {
    // Load cells whenever sector rendering or cell-level filtering needs them.
    // Gate the per-site cell fetch by SITES_TO_CELLS_ZOOM. Below that zoom
    // we only render site dots — fetching cells just to feed the renderer
    // wastes bandwidth and produces "Site cells (RPC): 0" + "Generating
    // synthetic sectors" log spam at zoom 12-14. At zoom >= 15 the regular
    // bbox cell fetch + per-site fallback take over.
    // Exceptions (tagged sites, KPI mode, band filter, cell-level conditions)
    // need cells regardless of zoom because the user explicitly chose them.
    const cellsAllowedAtZoom = viewport.zoom >= SITES_TO_CELLS_ZOOM;
    const needsCellData = sectorColorMode === 'kpi'
      || displayMode === 'cells'
      || mapDisplayMode === 'points'
      || (mapDisplayMode === 'sites' && showBeamSectors && cellsAllowedAtZoom)
      || hasCellLevelConditions
      || isBandFilterActive
      || taggedDisplayMode === 'tagged-only'
      || hasTaggedSitesNeedingCells;
    if (!needsCellData) return;
    if (!viewport.bounds) return;

    const sitesNeedingCellsRaw = sitesPendingCells.filter(
      s => s.cells.length === 0
        && !cellLoadingRef.current.has(s.site_id)
        && !cellLoadAttemptedRef.current.has(s.site_id)
        && (cellLoadAttemptCountRef.current.get(s.site_id) ?? 0) < MAX_CELL_LOAD_ATTEMPTS
    );

    if (sitesNeedingCellsRaw.length === 0) return;

    // Prioritize sites closest to viewport center so on-screen sites get sectors first
    const center = viewport.bounds!.getCenter();
    const sitesNeedingCells = [...sitesNeedingCellsRaw].sort((a, b) => {
      const da = Math.abs(a.coordinates[0] - center.lat) + Math.abs(a.coordinates[1] - center.lng);
      const db = Math.abs(b.coordinates[0] - center.lat) + Math.abs(b.coordinates[1] - center.lng);
      return da - db;
    }).slice(0, MAX_CELL_RESOLUTION_SITES);

    if (cellLoadDebounceRef.current) clearTimeout(cellLoadDebounceRef.current);
    cellLoadDebounceRef.current = setTimeout(async () => {
      // Mark all as loading and bump per-site attempt count
      sitesNeedingCells.forEach(s => {
        cellLoadingRef.current.add(s.site_id);
        const prev = cellLoadAttemptCountRef.current.get(s.site_id) ?? 0;
        cellLoadAttemptCountRef.current.set(s.site_id, prev + 1);
      });
      setCellsLoadingCount(cellLoadingRef.current.size);

      try {
        const bounds = viewport.bounds!;
        const bboxQuery: BboxQuery = {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        };
        // Single bulk call for all cells in current viewport.
        // Pass zoom so the service can refuse the call below SITES_TO_CELLS_ZOOM.
        const cellSites = await fetchCellsByBbox(bboxQuery, currentBboxFilters, undefined, viewport.zoom);

        // Build a lookup by normalized site_id AND site_name (VPS keys are not always consistent)
        const cellMap = new Map<string, any[]>();
        const registerCells = (rawKey: string | null | undefined, cells: any[]) => {
          const normalizedKey = normalizeSiteKey(rawKey);
          if (!normalizedKey || cells.length === 0) return;
          cellMap.set(normalizedKey, cells);
        };
        const resolveSiteCells = (site: { site_id?: string | null; site_name?: string | null }) => {
          return (
            cellMap.get(normalizeSiteKey(site.site_id)) ||
            cellMap.get(normalizeSiteKey(site.site_name)) ||
            null
          );
        };

        for (const cs of cellSites) {
          if (cs.cells && cs.cells.length > 0) {
            registerCells(cs.site_id, cs.cells);
            registerCells(cs.site_name, cs.cells);
          }
        }

        // Bulk BBOX fetch is intentionally capped for performance, so some visible sites
        // may still be missing their cells. Backfill only unresolved sites individually.
        const unresolvedAfterBulk = sitesNeedingCells.filter(site => !resolveSiteCells(site));
        if (unresolvedAfterBulk.length > 0) {
          const CONCURRENCY = 3;
          const DELAY_MS = 350;
          const queue = [...unresolvedAfterBulk];

          while (queue.length > 0) {
            const batch = queue.splice(0, CONCURRENCY);
            const batchResults = await Promise.all(
              batch.map(async (site) => {
                try {
                  // Try site_id first, then site_name as fallback
                  const cl = (activeDashboardFilters as any)?.cluster?.length ? (activeDashboardFilters as any).cluster.join(',') : undefined;
                  let cells = await fetchSiteCells(site.site_id, site.site_name, cl);
                  if (cells.length === 0 && site.site_name && site.site_name !== site.site_id) {
                    cells = await fetchSiteCells(site.site_name, site.site_name, cl);
                  }
                  return { site, cells };
                } catch {
                  return { site, cells: [] as any[] };
                }
              })
            );

            for (const { site, cells } of batchResults) {
              if (cells.length > 0) {
                registerCells(site.site_id, cells);
                registerCells(site.site_name, cells);
              }
            }

            // Progressive update: merge cells found so far into sites state
            setSites(prev => prev.map(s => {
              if (s.cells.length > 0) return s;
              const cells = resolveSiteCells(s);
              return cells && cells.length > 0 ? { ...s, cells } : s;
            }));
            setTaggedSites(prev => {
              let changed = false;
              const next = prev.map(s => {
                if (s.cells.length > 0) return s;
                const cells = resolveSiteCells(s);
                if (!cells || cells.length === 0) return s;
                changed = true;
                return { ...s, cells };
              });
              if (!changed) return prev;
              persistTaggedSitesScoped(next, activeDashboardIdRef.current);
              return next;
            });

            if (queue.length > 0) {
              await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
          }
        }

        // Final fallback: synthesize approximate sectors only for sites still unresolved.
        const unresolvedAfterFallback = sitesNeedingCells.filter(site => !resolveSiteCells(site));
        if (unresolvedAfterFallback.length > 0) {
          console.warn(`[SitesMonitor] Generating synthetic sectors for ${unresolvedAfterFallback.length} unresolved visible sites`);
          for (const site of unresolvedAfterFallback) {
            const lte = site.lte_cells || 0;
            const nr = site.nr_cells || 0;
            const c2g = (site as any).cells_2g || 0;
            const c3g = (site as any).cells_3g || 0;
            if (lte === 0 && nr === 0 && c2g === 0 && c3g === 0) continue;
            const syntheticCells: any[] = [];
            const azimuths = [0, 120, 240];

            // Pull the REAL band list returned by the bbox endpoint and normalize it.
            // VPS may return joined CSV strings (e.g. "LTE800, LTE1800, LTE2100, LTE2600")
            // — splitMaybeCsv already flattens those into individual entries.
            const rawBands = splitMaybeCsv((site as any).bandes ?? (site as any).bands);
            const normalizeBand = (b: string): string => {
              const v = String(b || '').trim().toUpperCase().replace(/\s+/g, '');
              // 5G / NR
              if (v.startsWith('NR') || v.startsWith('N')) return v.replace(/^NR_?/, 'NR').replace(/^N(?=\d)/, 'NR');
              // 4G / LTE
              if (v.startsWith('LTE')) return 'L' + v.slice(3);
              if (v.startsWith('L')) return v;
              // 3G / UMTS
              if (v.startsWith('UMTS')) return 'UMTS' + v.slice(4);
              // 2G / GSM
              if (v.startsWith('GSM')) return 'GSM' + v.slice(3);
              return v;
            };
            const allBands = rawBands.map(normalizeBand).filter(Boolean);
            const bands4G = allBands.filter(b => /^L\d/.test(b));
            const bands5G = allBands.filter(b => /^NR/.test(b));
            const bands3G = allBands.filter(b => /^UMTS/.test(b));
            const bands2G = allBands.filter(b => /^GSM/.test(b));

            const defaultBands4G = ['L800', 'L1800', 'L2100', 'L2600', 'L700'];
            const defaultBands5G = ['NR3500', 'NR700', 'NR2100'];
            const defaultBands3G = ['UMTS900', 'UMTS2100'];
            const defaultBands2G = ['GSM900', 'GSM1800'];

            const buildSyntheticForTech = (
              tech: '2G' | '3G' | '4G' | '5G',
              cellCount: number,
              actualBands: string[],
              defaults: string[],
            ) => {
              if (cellCount === 0) return;
              // Prefer real bandes from VPS; fall back to defaults sized by cellCount/3 sectors.
              const bandsToUse = actualBands.length > 0
                ? actualBands
                : defaults.slice(0, Math.max(1, Math.min(defaults.length, Math.round(cellCount / 3))));
              for (let s = 0; s < 3; s++) {
                for (const band of bandsToUse) {
                  syntheticCells.push({
                    cell_id: `${site.site_id}_${tech}_S${s + 1}_${band}`,
                    cell_name: `${site.site_id}_${tech}_S${s + 1}_${band}`,
                    techno: tech,
                    bande: band,
                    vendor: site.vendor || 'Unknown',
                    azimut: azimuths[s],
                    tilt: null,
                    pci: null, eci: null, nci: null, cid: null, tac: null,
                    etat_cellule: null, essentiel: null,
                    _synthetic: true,
                  });
                }
              }
            };

            buildSyntheticForTech('2G', c2g, bands2G, defaultBands2G);
            buildSyntheticForTech('3G', c3g, bands3G, defaultBands3G);
            buildSyntheticForTech('4G', lte, bands4G, defaultBands4G);
            buildSyntheticForTech('5G', nr,  bands5G, defaultBands5G);

            if (syntheticCells.length > 0) {
              registerCells(site.site_id, syntheticCells);
              registerCells(site.site_name, syntheticCells);
            }
          }
        }

        // Mark sites as attempted only if cache is fully loaded.
        // If still loading, only mark sites that DID get cells — unresolved ones
        // will be retried when new chunks arrive via the cache listener below.
        const cacheStillLoading = isCellsCacheLoading();
        sitesNeedingCells.forEach(s => {
          cellLoadingRef.current.delete(s.site_id);
          const gotCells = !!resolveSiteCells(s);
          const attempts = cellLoadAttemptCountRef.current.get(s.site_id) ?? 0;
          // Mark attempted if: we got cells, cache finished, OR we've hit the retry cap
          if (gotCells || !cacheStillLoading || attempts >= MAX_CELL_LOAD_ATTEMPTS) {
            cellLoadAttemptedRef.current.add(s.site_id);
          }
        });
        setCellsLoadingCount(cellLoadingRef.current.size);

        // Merge resolved cells into sites and sync the displayed inventory count
        // with the actual loaded cells for that site.
        setSites(prev => prev.map(s => {
          const cells = resolveSiteCells(s);
          return cells && cells.length > 0 ? { ...s, cells, cell_count: cells.length } : s;
        }));
        setTaggedSites(prev => {
          let changed = false;
          const next = prev.map(s => {
            const cells = resolveSiteCells(s);
            if (!cells || cells.length === 0) return s;
            if (s.cells.length === cells.length && s.cells.every((cell, index) => cell.cell_id === cells[index]?.cell_id)) return s;
            changed = true;
            return { ...s, cells, cell_count: cells.length };
          });
          if (!changed) return prev;
          persistTaggedSitesScoped(next, activeDashboardIdRef.current);
          return next;
        });
      } catch (err) {
        console.warn('[SitesMonitor] Bulk cell load failed', err);
        sitesNeedingCells.forEach(s => {
          cellLoadingRef.current.delete(s.site_id);
          const attempts = cellLoadAttemptCountRef.current.get(s.site_id) ?? 0;
          // Don't mark as attempted on transient error if cache still loading AND we still have retries left
          if (!isCellsCacheLoading() || attempts >= MAX_CELL_LOAD_ATTEMPTS) {
            cellLoadAttemptedRef.current.add(s.site_id);
          }
        });
        setCellsLoadingCount(cellLoadingRef.current.size);
        // Force re-render so filters re-evaluate with attempted flags
        setSites(prev => [...prev]);
      }
    }, 400);

    return () => {
      if (cellLoadDebounceRef.current) clearTimeout(cellLoadDebounceRef.current);
    };
  }, [displayMode, mapDisplayMode, sectorColorMode, showBeamSectors, sitesPendingCells, viewport.bounds, hasCellLevelConditions, isBandFilterActive, currentBboxFilters, hasTaggedSitesNeedingCells]);

  // Re-trigger cell resolution when background cache loads new chunks
  // Direct merge approach: look up cells from cache inline instead of re-running the full fetch cycle
  useEffect(() => {
    // Gate the per-site cell fetch by SITES_TO_CELLS_ZOOM. Below that zoom
    // we only render site dots — fetching cells just to feed the renderer
    // wastes bandwidth and produces "Site cells (RPC): 0" + "Generating
    // synthetic sectors" log spam at zoom 12-14. At zoom >= 15 the regular
    // bbox cell fetch + per-site fallback take over.
    // Exceptions (tagged sites, KPI mode, band filter, cell-level conditions)
    // need cells regardless of zoom because the user explicitly chose them.
    const cellsAllowedAtZoom = viewport.zoom >= SITES_TO_CELLS_ZOOM;
    const needsCellData = sectorColorMode === 'kpi'
      || displayMode === 'cells'
      || mapDisplayMode === 'points'
      || (mapDisplayMode === 'sites' && showBeamSectors && cellsAllowedAtZoom)
      || hasCellLevelConditions
      || isBandFilterActive
      || taggedDisplayMode === 'tagged-only'
      || hasTaggedSitesNeedingCells;
    if (!needsCellData) return;

    const mapCachedCellsToProperties = (cachedCells: any[]) => cachedCells.map((c: any) => {
      const cellName = c.cell_name || c.nom_cellule || '';
      const sectorIdx = getSectorNumber(cellName) || 1;
      return {
        cell_id: cellName,
        cell_name: cellName,
        techno: c.techno || '4G',
        bande: c.band || c.bande || '',
        vendor: c.vendor || c.constructeur || null,
        azimut: c.azimut ?? Math.round((360 / 3) * (sectorIdx - 1)),
        tilt: c.tilt ?? null,
        pci: c.pci ?? null,
        eci: c.eci ?? null,
        nci: c.nci ?? null,
        cid: c.cid ?? null,
        tac: c.tac ?? null,
        etat_cellule: c.etat_cellule ?? null,
        essentiel: c.essentiel ?? null,
        zone_arcep: c.zone_arcep ?? null,
        plaque: c.plaque ?? null,
        dor: c.dor ?? null,
      } as unknown as CellProperties;
    });

    const unsub = onCellsCacheUpdate(() => {
      setCellsCacheLoadedCount(getCellsCacheCount());
      setCellsCacheLoading(isCellsCacheLoading());
      setSites(prev => {
        let changed = false;
          const next = prev.map(s => {
          if (s.cells.length > 0) return s;
          // Direct lookup from the in-memory cache
          const siteName = s.site_name || s.site_id;
          const cachedCells = getCellsFromCacheForSite(siteName);
          if (cachedCells.length === 0) return s;
          changed = true;
          const cells = mapCachedCellsToProperties(cachedCells);
          cellLoadAttemptedRef.current.add(s.site_id);
            return { ...s, cells, cell_count: cells.length };
        });
        if (!changed) return prev;
        return next;
      });
      setTaggedSites(prev => {
        let changed = false;
          const next = prev.map(s => {
          if (s.cells.length > 0) return s;
          const siteName = s.site_name || s.site_id;
          const cachedCells = getCellsFromCacheForSite(siteName);
          if (cachedCells.length === 0) return s;
          changed = true;
          const cells = mapCachedCellsToProperties(cachedCells);
          cellLoadAttemptedRef.current.add(s.site_id);
            return { ...s, cells, cell_count: cells.length };
        });
        if (!changed) return prev;
        persistTaggedSitesScoped(next, activeDashboardIdRef.current);
        return next;
      });
    });

    return unsub;
  }, [displayMode, mapDisplayMode, sectorColorMode, showBeamSectors, hasCellLevelConditions, isBandFilterActive, hasTaggedSitesNeedingCells, taggedDisplayMode]);

  useEffect(() => {
    setCellsCacheLoadedCount(getCellsCacheCount());
    setCellsCacheLoading(isCellsCacheLoading());
  }, [displayMode, mapDisplayMode, showBeamSectors, hasCellLevelConditions, isBandFilterActive]);


  // ── Enrich tagged sites with cells when in tagged-only mode ──
  useEffect(() => {
    if (taggedDisplayMode !== 'tagged-only') return;
    const needCells = taggedSites.filter(s => s.cells.length === 0);
    if (needCells.length === 0) return;

    // First try to enrich from main sites array
    let enriched = false;
    const sitesMap = new Map(sites.map(s => [s.site_id, s]));
    const updated = taggedSites.map(ts => {
      if (ts.cells.length > 0) return ts;
      const mainSite = sitesMap.get(ts.site_id);
      if (mainSite && mainSite.cells.length > 0) {
        enriched = true;
        return { ...ts, cells: mainSite.cells };
      }
      // Try cache
      const cachedCells = getCellsFromCacheForSite(ts.site_name || ts.site_id);
      if (cachedCells.length > 0) {
        enriched = true;
        const cells = cachedCells.map((c: any) => {
          const cellName = c.cell_name || c.nom_cellule || '';
          const sectorIdx = getSectorNumber(cellName) || 1;
          return {
            cell_id: cellName, cell_name: cellName,
            techno: c.techno || '4G', bande: c.band || c.bande || '',
            vendor: c.vendor || c.constructeur || null,
            azimut: c.azimut ?? Math.round((360 / 3) * (sectorIdx - 1)),
            tilt: c.tilt ?? null, pci: c.pci ?? null, eci: c.eci ?? null,
            nci: c.nci ?? null, cid: c.cid ?? null, tac: c.tac ?? null,
            etat_cellule: c.etat_cellule ?? null, essentiel: c.essentiel ?? null,
            zone_arcep: c.zone_arcep ?? null, plaque: c.plaque ?? null, dor: c.dor ?? null,
          } as unknown as CellProperties;
        });
        return { ...ts, cells };
      }
      return ts;
    });
    if (enriched) {
      persistTaggedSites(updated);
      return;
    }

    // Fetch individually for remaining sites without cells
    let cancelled = false;
    (async () => {
      const stillNeed = updated.filter(s => s.cells.length === 0);
      if (stillNeed.length === 0) return;
      const results = await Promise.all(
        stillNeed.map(async s => {
          try {
            const cl = (activeDashboardFilters as any)?.cluster?.length ? (activeDashboardFilters as any).cluster.join(',') : undefined;
            let cells = await fetchSiteCells(s.site_id, s.site_name, cl);
            if (cells.length === 0 && s.site_name && s.site_name !== s.site_id) {
              cells = await fetchSiteCells(s.site_name, s.site_name, cl);
            }
            return { siteId: s.site_id, cells };
          } catch { return { siteId: s.site_id, cells: [] as any[] }; }
        })
      );
      if (cancelled) return;
      const cellMap = new Map(results.filter(r => r.cells.length > 0).map(r => [r.siteId, r.cells]));
      if (cellMap.size === 0) return;
      setTaggedSites(prev => {
        const next = prev.map(ts => {
          if (ts.cells.length > 0) return ts;
          const cells = cellMap.get(ts.site_id);
          return cells ? { ...ts, cells } : ts;
        });
        persistTaggedSitesScoped(next, activeDashboardIdRef.current);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [taggedDisplayMode, taggedSites, sites]);


  const shouldShowLabels = showSiteLabels;

  const renderSites = useMemo(() => {
    // Defensive: drop any null/undefined entries that may have slipped into sites/taggedSites
    // Also pre-filter cells by active dashboard band/techno perimeter so that
    // ALL downstream renderers (concentric markers, sectors, tech inference, inventory)
    // see only the cells matching the active dashboard (e.g. Rennes_L1800 → only LTE1800).
    const dashBandsRaw = dashboardActive && activeDashboardFilters?.bande?.length
      ? activeDashboardFilters.bande.map(b => String(b).trim().toUpperCase())
      : null;
    // Build a normalized set of dashboard bands so cell.bande in any naming convention
    // (LTE1800, L1800, B3, 1800) all map to the same canonical key.
    const dashBands = dashBandsRaw
      ? new Set([
          ...dashBandsRaw,
          ...dashBandsRaw.map(b => normalizeBandKey(b) || b),
        ])
      : null;
    const dashTechs = dashboardActive && activeDashboardFilters?.techno?.length
      ? new Set(activeDashboardFilters.techno.map(t => String(t).trim().toUpperCase()))
      : null;
    // One-shot diagnostic log to help spot mismatches
    if (dashBands && (window as any).__dashBandsLogged !== JSON.stringify([...dashBands])) {
      (window as any).__dashBandsLogged = JSON.stringify([...dashBands]);
      console.info('[SitesMonitor] Dashboard band filter active:', [...dashBands], 'techs:', dashTechs ? [...dashTechs] : null);
    }
    const projectSiteCells = (s: SiteSummary): SiteSummary | null => {
      if (!dashBands && !dashTechs) return s;
      // When cells aren't loaded yet, keep the site (cell-level filter applies once
      // background fetch completes). Without this pass-through, a freshly bbox-fetched
      // site with cells=[] would be dropped → empty map under active dashboard scope.
      if (!s.cells?.length) return s;
      const filtered = s.cells.filter(c => {
        if (dashBands) {
          const cb = String(c.bande || '').trim().toUpperCase();
          const cbNorm = normalizeBandKey(c.bande || '', c.techno) || cb;
          // STRICT: cells without band info are dropped when a dashboard band filter is active
          if (!cb && !cbNorm) return false;
          if (!dashBands.has(cb) && !dashBands.has(cbNorm)) return false;
        }
        if (dashTechs) {
          const ct = String(c.techno || '').trim().toUpperCase();
          const tg = String(getCellTechGroup(c.techno) || '').toUpperCase();
          if (!dashTechs.has(ct) && !dashTechs.has(tg)) return false;
        }
        return true;
      });
      // Drop sites that have zero matching cells under the dashboard perimeter
      if (!filtered.length) return null;
      return { ...s, cells: filtered };
    };
    const safeFilter = (arr: any[]): SiteSummary[] => (arr || [])
      .filter((s): s is SiteSummary => !!s && typeof s === 'object' && !!s.site_id)
      .map(projectSiteCells)
      .filter((s): s is SiteSummary => s !== null);
    const siteMatchesCurrentTechFilter = (site: SiteSummary) => {
      if (mapTechnoFilter === 'OFF') return false;

      if (mapTechnoFilter === 'ALL') {
        if (enabledTechnos.size === 0) return false;
        if (enabledTechnos.size === 4) return true;
        for (const t of enabledTechnos) {
          if (siteMatchesRequestedTech(site, t)) return true;
        }
        return false;
      }

      return siteMatchesRequestedTech(site, mapTechnoFilter as TechGroup);
    };

    // Tagged-only mode: show only tagged sites
    if (taggedDisplayMode === 'tagged-only') {
      const result: SiteSummary[] = [];
      for (const ts of safeFilter(taggedSites)) {
        if (!siteMatchesCurrentTechFilter(ts)) continue;
        if (localZoneArcep !== 'ALL') {
          const tsCells = ts.cells ?? [];
          const tsZoneMatch = tsCells.length > 0
            ? tsCells.some((c: any) => c.zone_arcep === localZoneArcep)
            : (ts as any).zone_arcep === localZoneArcep;
          if (!tsZoneMatch) continue;
        }
        result.push(ts);
      }
      if (selectedSiteId && selectedSiteSnapshot && siteMatchesCurrentTechFilter(selectedSiteSnapshot) && !result.some(s => s.site_id === selectedSiteId)) {
        result.unshift(selectedSiteSnapshot);
      }
      return result;
    }

    const merged = safeFilter(visibleSites);

    for (const ts of safeFilter(taggedSites)) {
      if (!siteMatchesCurrentTechFilter(ts)) continue;
      // Respect zone_arcep filter for tagged sites
      if (localZoneArcep !== 'ALL') {
        const tsCells = ts.cells ?? [];
        const tsZoneMatch = tsCells.length > 0
          ? tsCells.some((c: any) => c.zone_arcep === localZoneArcep)
          : (ts as any).zone_arcep === localZoneArcep;
        if (!tsZoneMatch) continue;
      }
      if (!merged.some(s => s.site_id === ts.site_id)) {
        merged.push(ts);
      }
    }

    if (!selectedSiteId || !selectedSiteSnapshot) return merged;
    if (!siteMatchesCurrentTechFilter(selectedSiteSnapshot)) return merged;
    if (merged.some(site => site.site_id === selectedSiteId)) return merged;
    if (viewport.bounds && !viewport.bounds.contains(L.latLng(selectedSiteSnapshot.coordinates[0], selectedSiteSnapshot.coordinates[1]))) {
      return merged;
    }

    return [selectedSiteSnapshot, ...merged];
  }, [visibleSites, selectedSiteId, selectedSiteSnapshot, viewport.bounds, taggedSites, mapTechnoFilter, enabledTechnos, localZoneArcep, taggedDisplayMode, dashboardActive, activeDashboardFilters]);

  // ── Color View Mode: build a value→color map from visible sites ──
  const colorViewColorMap = useMemo(() => {
    if (colorViewMode === 'none') return {};
    const values = renderSites.map(s => getSiteDimensionValue(s, colorViewMode));
    return buildColorMap(values);
  }, [renderSites, colorViewMode]);

  /** Get the color-by-dimension fill for a site. Returns null if colorViewMode is 'none'. */
  const getColorViewFill = useCallback((site: SiteSummary): string | null => {
    if (colorViewMode === 'none') return null;
    const val = getSiteDimensionValue(site, colorViewMode);
    return getColorForValue(val, colorViewColorMap);
  }, [colorViewMode, colorViewColorMap]);

  // At zoom 12 we enter a "beam lite" stage via mini sectors.
  // Full per-cell/per-band beam rendering only starts at zoom 13+.
  // In KPI mode: force sector rendering from zoom 13 onwards (UX
  //   2026-05-11: beams stay hidden when zoomed out so the Voronoï
  //   KPI overlay reads cleanly; from zoom 13 the operator wants to
  //   see beam directions overlaid on top of the polygons).
  // In Topo mode: sectors only if user enabled beams AND zoom >= full-detail threshold.
  const KPI_BEAM_MIN_ZOOM = 13;
  const kpiForcesSectors = sectorColorMode === 'kpi' && !paramMode && viewport.zoom >= KPI_BEAM_MIN_ZOOM;
  const showSectors = !paramMode && (
    kpiForcesSectors
    || (viewport.zoom >= FULL_BEAM_DETAIL_ZOOM && mapDisplayMode === 'sites' && showBeamSectors)
    || (taggedDisplayMode === 'tagged-only' && mapDisplayMode === 'sites')
  );

  // When entering KPI mode, ensure display settings are correct
  useEffect(() => {
    if (sectorColorMode !== 'kpi' || paramMode) return;
    setMapDisplayMode('sites');
  }, [paramMode, sectorColorMode]);

  useEffect(() => {
    if (!showSectors) return;

    let changed = false;
    for (const site of visibleSites) {
      const hasPotentialCells = (site.cell_count || 0) > 0 || (site.lte_cells || 0) > 0 || (site.nr_cells || 0) > 0;
      if (!hasPotentialCells) continue;
      if ((site.cells?.length || 0) > 0) continue;
      if (!cellLoadAttemptedRef.current.has(site.site_id)) continue;

      cellLoadAttemptedRef.current.delete(site.site_id);
      changed = true;
    }

    if (changed) {
      setSites(prev => [...prev]);
    }
  }, [showSectors, visibleSites]);

  // Filter cells to 4G/5G only for sector rendering
  const ALLOWED_TECH = new Set(['4G', '5G', 'LTE', 'NR', '4g', '5g', 'lte', 'nr']);
  const filter4G5GCells = (cells: any[]) => cells.filter(c => !c.techno || ALLOWED_TECH.has(c.techno.trim()));

  // Heatmap data points: [lat, lng, intensity]
  const heatmapPoints = useMemo((): [number, number, number][] => {
    if (mapDisplayMode !== 'heatmap') return [];
    return renderSites.map(s => {
      const val = s.cells.length > 0 ? getCellKpiValue(s.cells[0]) : (s.qoe_score_avg ?? 0);
      return [s.coordinates[0], s.coordinates[1], val / 100] as [number, number, number];
    });
  }, [renderSites, mapDisplayMode, mapKpi]);

  // Compute highlighted cell coordinates for map display
  const highlightedCellData = useMemo(() => {
    if (!highlightedCellIds.length) return [];
    const result: { cell: any; site: SiteSummary; lat: number; lng: number }[] = [];
    for (const site of sites) {
      for (let idx = 0; idx < site.cells.length; idx++) {
        const cell = site.cells[idx];
        if (highlightedCellIds.includes(cell.cell_id)) {
          const offsetDist = 0.0003;
          const rad = ((cell.azimut || idx * 120) - 90) * (Math.PI / 180);
          result.push({
            cell,
            site,
            lat: site.coordinates[0] + offsetDist * Math.cos(rad),
            lng: site.coordinates[1] + offsetDist * Math.sin(rad),
          });
        }
      }
    }
    return result;
  }, [sites, highlightedCellIds]);

  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewportChangeLegacy = useCallback((v: ViewportState) => {
    const prevZoom = viewport.zoom;
    // handleViewportChange already calls setViewport
    handleViewportChange(v);
    // Re-enable bbox-aware site fetch on pan/zoom in no-dashboard mode.
    // Previously commented out as "Don't fetch sites without an active dashboard",
    // but that meant the user only ever saw the initial /topo/cells alphabet-first
    // 5000 sites — panning to Lyon revealed an empty map because the global
    // sample didn't include Lyon's alphabet range.
    // handleViewportForFetch has its own `if (dashboardActive) return` guard
    // so it's a no-op when the dashboard loader is in charge.
    handleViewportForFetch(v);
    if (v.zoom >= 8 && !clusteringUnlocked) {
      setClusteringUnlocked(true);
    }
    // Show loading when zooming changes visible sites — but NOT during fly animation
    if (v.zoom !== prevZoom && mapFilteredSites.length > 500 && !isFlyingRef.current) {
      setMapRendering(true);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = setTimeout(() => setMapRendering(false), 600);
    }
  }, [handleViewportChange, handleViewportForFetch, dashboardActive, viewport.zoom, mapFilteredSites.length, clusteringUnlocked]);

  const updateFilter = (key: keyof Filters, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  // Map View save/load
  const getCurrentMapSettings = useCallback((): MapViewSettings => {
    const mapEl = document.querySelector('.leaflet-container') as any;
    const leafletMap = mapEl?._leaflet_map || mapEl?.['__leaflet_map'];
    let center: [number, number] = [43.2965, 5.3698];
    let zoom = 6;
    if (viewport.bounds) {
      const c = viewport.bounds.getCenter();
      center = [c.lat, c.lng];
      zoom = viewport.zoom;
    }
    return {
      center,
      zoom,
      mapLayer,
      mapKpi,
      mapTechnoFilter,
      enabledBands: Array.from(enabledBands),
      sectorColorMode,
      mapDisplayMode,
      showBandPanel,
      showLegend,
      showRightPanel,
      panelCollapsed,
      localVendor,
      localDor,
      localPlaque,
      localSite: localBande,
      localBande: localBande,
      localZoneArcep,
      localTechno,
      showBeamSectors,
      beamVisibility,
      showVisualCoverage,
    };
  }, [viewport, mapLayer, mapKpi, mapTechnoFilter, enabledBands, sectorColorMode, mapDisplayMode, showBandPanel, showLegend, showRightPanel, panelCollapsed, localVendor, localDor, localPlaque, localBande, localZoneArcep, localTechno, showBeamSectors, beamVisibility, showVisualCoverage]);

  // ─── Visual Coverage layer ───
  // The drop-in module from src/coverage/ now owns the fetch + render
  // pipeline (see VisualCoverageAdapter). React just packages the
  // current viewport bbox in the shape the adapter expects. The previous
  // direct `fetchVisualCoverage` useEffect + `visualCoverageColor` helper
  // were removed on 2026-05-11 when the server-side Voronoi endpoint
  // was deleted in favour of the client module.
  const coverageBbox = useMemo(() => {
    const b = viewport.bounds;
    if (!b) return null;
    return {
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    };
  }, [viewport.bounds]);

  const handleLoadView = useCallback((settings: MapViewSettings) => {
    setMapLayer(settings.mapLayer);
    if (MAP_KPIS.some(k => k.id === settings.mapKpi)) setMapKpi(settings.mapKpi);
    setMapTechnoFilter(settings.mapTechnoFilter as any);
    setEnabledBands(new Set(settings.enabledBands));
    // Guard: do not overwrite KPI overlay when loading a saved view in 'topo' mode.
    if (sectorColorMode !== 'kpi') setSectorColorMode(settings.sectorColorMode);
    setMapDisplayMode((settings as any).viewType === 'parameter' ? settings.mapDisplayMode : 'sites');
    setShowBandPanel(settings.showBandPanel);
    setShowLegend(settings.showLegend);
    setShowRightPanel(settings.showRightPanel);
    setPanelCollapsed(settings.panelCollapsed);
    setLocalVendor(settings.localVendor);
    setLocalDor(settings.localDor);
    setLocalPlaque(settings.localPlaque);
    setLocalBande((settings as any).localBande || settings.localSite);
    if ((settings as any).localZoneArcep) setLocalZoneArcep((settings as any).localZoneArcep);
    if ((settings as any).localTechno) setLocalTechno((settings as any).localTechno);
    if ((settings as any).showBeamSectors !== undefined) {
      setShowBeamSectors(Boolean((settings as any).showBeamSectors));
    } else if (settings.mapDisplayMode === 'sites' && settings.sectorColorMode !== 'topo') {
      setShowBeamSectors(true);
    }
    // Fly to saved center/zoom
    if (settings.center && settings.center[0] > 41 && settings.center[0] < 52 && settings.center[1] > -6 && settings.center[1] < 11) setFlyTarget(settings.center);
    if ((settings as any).beamVisibility != null) {
      setBeamVisibility((settings as any).beamVisibility);
      localStorage.setItem('osmosis_beam_visibility', String((settings as any).beamVisibility));
    }
    if ((settings as any).showVisualCoverage !== undefined) {
      setShowVisualCoverage(Boolean((settings as any).showVisualCoverage));
    }
    // KPI Overlay (Voronoï coloured by KPI value, drop-in module 2026-05-11).
    // The dashboard sidebar onApplyView path sets the SAME state via its
    // own `kpi_overlay` block; this branch handles the legacy "Views"
    // menu (handleLoadView) so both routes activate the layer.
    const kpiCfg = (settings as any).kpiOverlayConfig;
    if ((settings as any).viewType === 'kpi_overlay' && kpiCfg) {
      const kpiList: string[] = Array.isArray(kpiCfg.kpis)
        ? kpiCfg.kpis.map((k: any) => k?.kpiKey).filter((x: any): x is string => typeof x === 'string')
        : [];
      const lvl = kpiCfg.level === 'cell' ? 'Cellule' : kpiCfg.level === 'site' ? 'Site' : 'Cellule';
      if (kpiList.length > 0 && kpiCfg.dateFrom && kpiCfg.dateTo) {
        setActiveKpiOverlayView({
          name: (settings as any).name || 'KPI Overlay',
          tech: (kpiCfg.technology as '4G' | '5G') || '4G',
          level: lvl,
          period: [kpiCfg.dateFrom, kpiCfg.dateTo],
          selectedKpis: kpiList,
        });
        // 2026-05-11 second revert (v6.3.0): KPI Overlay drops the
        // VC disk+wedge hybrid and goes back to its own per-cell
        // Voronoï pavage (KpiOverlayAdapter direct buildKpiOverlay
        // path). VC must be OFF so the two layers don't compete.
        setShowVisualCoverage(false);
      }
    } else if ((settings as any).viewType && (settings as any).viewType !== 'kpi_overlay') {
      // Switching away from a KPI Overlay view ⇒ retire the layer.
      setActiveKpiOverlayView(null);
    }
  }, [sectorColorMode]);

  const siteRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll inventory to selected site whenever it changes
  useEffect(() => {
    if (!selectedSiteId) return;
    setPanelCollapsed(false);
    setInventoryTab('sites');
    const tryScroll = (attempt = 0) => {
      const el = siteRowRefs.current.get(selectedSiteId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (attempt < 5) {
        setTimeout(() => tryScroll(attempt + 1), 200);
      }
    };
    setTimeout(() => tryScroll(), 150);
  }, [selectedSiteId]);
  const toolbarScrollRef = useRef<HTMLDivElement>(null);
  const [toolbarCanScrollLeft, setToolbarCanScrollLeft] = useState(false);
  const [toolbarCanScrollRight, setToolbarCanScrollRight] = useState(false);

  const updateToolbarScrollState = useCallback(() => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    setToolbarCanScrollLeft(el.scrollLeft > 2);
    setToolbarCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    updateToolbarScrollState();
    el.addEventListener('scroll', updateToolbarScrollState, { passive: true });
    const ro = new ResizeObserver(updateToolbarScrollState);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateToolbarScrollState); ro.disconnect(); };
  }, [updateToolbarScrollState]);

  const scrollToolbar = useCallback((dir: 'left' | 'right') => {
    const el = toolbarScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -250 : 250, behavior: 'smooth' });
  }, []);

  const handleSiteClick = async (site: SiteSummary) => {
    // Disable site selection while the polygon drawing tool is active
    // (avoid stealing clicks meant to add polygon vertices)
    if (activeMapTool === 'polygon') return;
    // Toggle: clicking the already-selected site deselects it
    if (selectedSiteId === site.site_id) {
      handleBackToGlobal();
      return;
    }

    // ── Immediately fly to site & select it (don't wait for cells) ──
    setSelectedSiteSnapshot(site);
    setFlyTarget(site.coordinates);
    // Clear any stale detail from a previous site and show loading state immediately
    // (prevents the "No site details available" flash that required a second click)
    setSiteDetail(null);
    setDetailLoading(true);
    setSelectedSiteId(site.site_id);
    setFocusMode('site');
    setFocusCellId(null);
    // Auto-expand only the first sector by default (from existing cells)
    const initialSectorKeys = Array.from(new Set(site.cells.map(c => getSidebarSectorKey(c.cell_id))));
    setExpandedSectors(new Set(initialSectorKeys.length > 0 ? [initialSectorKeys[0]] : []));
    setShowRightPanel(true);
    // Ensure inventory panel is open
    setPanelCollapsed(false);

    // ── Search-driven click: tag + force zoom 15 so cells become visible ──
    // The user just typed a cell or site name in the inventory search bar
    // (now also matches cells via /topo/sites?search=…). Without this,
    // clicking the search result kept the map at the current overview zoom
    // (7-13) and only a dot rendered. Force zoom >= 15 so per-cell sectors
    // appear, and tag the site so it stays highlighted on subsequent pans.
    if (isSearchActive && site.coordinates) {
      const m = (window as any).__siteMonitorMap as L.Map | undefined;
      if (m) {
        m.flyTo(site.coordinates, Math.max(m.getZoom(), 15), { duration: 0.8 });
      }
      if (!isSiteTagged(site.site_id)) {
        toggleTagSite(site);
      }
    }

    // ── Then load all cells asynchronously ──
    let siteWithCells = site;
    if (site.site_id) {
      setLoadingCellsForSite(site.site_id);
      try {
        const cl = (activeDashboardFilters as any)?.cluster?.length ? (activeDashboardFilters as any).cluster.join(',') : undefined;
        const cells = await fetchSiteCells(site.site_id, site.site_name, cl);
        if (cells.length > 0) {
          siteWithCells = {
            ...site,
            cells,
            cell_count: cells.length,
            lte_cells: cells.filter((c: any) => is4GTech(c.techno)).length,
            nr_cells: cells.filter((c: any) => is5GTech(c.techno)).length,
          };
          // Update in searchModeSites or sites
          setSearchModeSites(prev => prev.map(s => s.site_id === siteWithCells.site_id ? siteWithCells : s));
          setSites(prev => {
            const idx = prev.findIndex(s => s.site_id === siteWithCells.site_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = siteWithCells;
              return updated;
            }
            return [...prev, siteWithCells];
          });
          // Update snapshot & sectors after cells loaded
          setSelectedSiteSnapshot(siteWithCells);
          const sectorKeys = Array.from(new Set(cells.map(c => getSidebarSectorKey(c.cell_id))));
          setExpandedSectors(new Set(sectorKeys.length > 0 ? [sectorKeys[0]] : []));
          // If cells have better coordinates, fly again
          const cellsWithCoords = cells.filter((c: any) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
          if (cellsWithCoords.length > 0) {
            const avgLat = cellsWithCoords.reduce((s: number, c: any) => s + c.latitude, 0) / cellsWithCoords.length;
            const avgLng = cellsWithCoords.reduce((s: number, c: any) => s + c.longitude, 0) / cellsWithCoords.length;
            if (Number.isFinite(avgLat) && Number.isFinite(avgLng) && (avgLat !== site.coordinates[0] || avgLng !== site.coordinates[1])) {
              setFlyTarget([avgLat, avgLng]);
            }
          }
        }
      } catch (err) {
        console.warn('[SitesMonitor] Failed to load cells on site click', err);
      } finally {
        setLoadingCellsForSite(null);
      }
    }
    // When coming from search, auto-tag the site but keep results visible
    if (isSearchActive) {
      if (!isSiteTagged(siteWithCells.site_id)) {
        toggleTagSite(siteWithCells);
      }
      setInventoryTab('tagged');
      setLocalSearch('');
      setSearchResults([]);
      setSearchModeSites([]);
    } else if (inventoryTab !== 'tagged' || !isSiteTagged(siteWithCells.site_id)) {
      setInventoryTab('sites');
    }
    // Scroll inventory to selected site with delay for DOM update
    setTimeout(() => {
      const el = siteRowRefs.current.get(siteWithCells.site_id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  };

  /** Robust cell lookup: exact match → trimmed match → case-insensitive → includes fallback */
  const resolveCellFromDetail = useCallback((detail: SiteDetail, cellId: string) => {
    if (!detail?.cells?.length || !cellId) return undefined as CellProperties | undefined;
    // 1. Exact match
    let found = detail.cells.find(c => c.cell_id === cellId);
    if (found) return found;
    // 2. Trimmed match
    const trimmed = cellId.trim();
    found = detail.cells.find(c => c.cell_id?.trim() === trimmed);
    if (found) return found;
    // 3. Case-insensitive
    const upper = trimmed.toUpperCase();
    found = detail.cells.find(c => c.cell_id?.trim().toUpperCase() === upper);
    if (found) return found;
    // 4. Check cell_name or nom_cellule on extended props
    found = detail.cells.find(c => {
      const ext = c as any;
      return (ext.cell_name?.trim().toUpperCase() === upper) ||
             (ext.nom_cellule?.trim().toUpperCase() === upper);
    });
    if (found) return found;
    // 5. Partial / includes match (last resort)
    found = detail.cells.find(c => c.cell_id?.toUpperCase().includes(upper) || upper.includes(c.cell_id?.toUpperCase()));
    return found;
  }, []);

  const handleCellClick = (cellId: string) => {
    setFocusMode('cell');
    setFocusCellId(cellId);
    onCellSelect(cellId);
    setShowRightPanel(true);
  };

  const handleBackToGlobal = () => {
    setSelectedSiteId(null);
    setSelectedSiteSnapshot(null);
    setFocusMode('global');
    setFocusCellId(null);
    setDetailFullscreen(false);
  };

  const handleBackToSite = () => {
    setFocusMode('site');
    setFocusCellId(null);
  };

  // Unified loading message — single banner below toolbar
  const loadingMessage = useMemo(() => {
    const isCellPhase = cellsLoadingCount > 0 && viewport.zoom >= SITES_TO_CELLS_ZOOM;
    if (isCellPhase) {
      return `Chargement cellules • ${cellsLoadingCount} site${cellsLoadingCount > 1 ? 's' : ''} en cours`;
    }
    if (loading || bboxLoading) {
      if (bboxLoading && bboxTotal > 0) return `Chargement sites (${bboxTotal})…`;
      return sites.length > 0 ? `Chargement… ${sites.length.toLocaleString()} sites` : 'Chargement des sites…';
    }
    return null;
  }, [loading, bboxLoading, bboxTotal, sites.length, cellsLoadingCount, viewport.zoom]);

  // Detail loading is now handled inline — no full-screen takeover

  // No early return for siteDetail — rendered as right panel inside the main view

  // Main view — full screen map with clustering
  return (
    <div className="absolute inset-0 bg-background overflow-hidden">
      {loadingMessage && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-[1100] pointer-events-none animate-fade-in">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-lg">
            <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{loadingMessage}</p>
          </div>
        </div>
      )}


      {/* FULL SCREEN MAP */}
      <MapContainer
        center={initialCenter || FRANCE_CENTER}
        zoom={FRANCE_DEFAULT_ZOOM}
        minZoom={4}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
        zoomSnap={1}
        zoomDelta={1}
        closePopupOnClick={true}
      >
        <MapVisibilitySync active={isVisible} />
        <TopoFranceViewportReset
          enabled={sectorColorMode === 'topo' && focusMode === 'global' && !selectedSiteId}
          resetKey={`${sectorColorMode}-${focusMode}-${selectedSiteId ?? 'none'}-${topoResetCounter}`}
        />
        <CustomZoomControl />
        <TileLayer
          key={mapLayer}
          url={(TILE_URLS[mapLayer] || TILE_URLS.light).url}
          attribution={(TILE_URLS[mapLayer] || TILE_URLS.light).attribution}
        />
        {/* Visual Coverage adapter — bridges the drop-in JS module
            (src/coverage/) to react-leaflet. Owns its own L.geoJSON layer,
            tooltips, panel; React just passes the bbox + enabled flag. */}
        <VisualCoverageAdapter
          enabled={showVisualCoverage}
          // Hide the VC panel ("sites calc / cells / neighbors used")
          // when a KPI Overlay view is active — VC is in mutex OFF then,
          // and an empty 0/0/0 panel just lies about what's on screen.
          // Standalone VC toggle (no KPI view) keeps its panel.
          panelMount={activeKpiOverlayView ? null : coveragePanelNode}
          bbox={coverageBbox}
          onEnabledChange={setShowVisualCoverage}
        />
        {/* KPI Overlay adapter — RE-ENABLED on 2026-05-11 (v6.3.0).
            Calls buildKpiOverlay() directly for the per-cell Voronoï
            pavage (continuous territory tessellation), then overrides
            polygon colour with the 3-tier mapping (Bon/Moyen/Critique/
            No-data) computed from kpiValues + currentThreshold. The
            previous "hybrid via VC wedges" approach was rejected by the
            user (UX feedback: "polygons must tile edge-to-edge"). */}
        <KpiOverlayAdapter
          enabled={activeKpiOverlayView != null}
          bbox={coverageBbox}
          view={activeKpiOverlayView}
          kpiValueMap={kpiValues}
          kpiThresholds={currentThreshold}
        />
        <FlyToSite coords={flyTarget} onFlyStart={() => { setIsFlying(true); isFlyingRef.current = true; }} onFlyEnd={() => { setIsFlying(false); isFlyingRef.current = false; }} onDone={() => setFlyTarget(null)} />
        <TechPanes />
        <MapViewportTracker onViewportChange={handleViewportChangeLegacy} />
        <LOSMapClickHandler onMapClick={handleLosMapClick} drawing={losDrawingMode} />
        <CustomPointClickHandler active={pointCreationMode} onAdd={addCustomPoint} />
        <DistanceMeasureClickHandler active={activeMapTool === 'distance'} onPick={handleDistanceMeasureClick} onMouseMove={(ll) => setDistanceCursorPos(ll)} />
        <RadiusClickHandler active={activeMapTool === 'radius'} center={radiusCenter} confirmed={radiusConfirmed} onSetCenter={handleRadiusSetCenter} onConfirm={handleRadiusConfirm} onPreview={handleRadiusPreview} />
        <PolygonClickHandler active={activeMapTool === 'polygon'} closed={polygonClosed} onPick={handlePolygonClick} onClose={handlePolygonDblClick} />
        <DistanceMeasureClickHandler active={activeMapTool === 'profile'} onPick={handleProfileClick} />
        <ZoomAreaHandler
          active={activeMapTool === 'zoomarea'}
          onStart={(ll) => { setZoomAreaOrigin(ll); setZoomAreaCurrent(ll); }}
          onMove={(ll) => setZoomAreaCurrent(ll)}
          onEnd={() => {
            setZoomAreaOrigin(null);
            setZoomAreaCurrent(null);
          }}
          onCancel={() => { setZoomAreaOrigin(null); setZoomAreaCurrent(null); }}
        />
        {dashboardFitKey > 0 && <FitToDashboardSites sites={sites} fitKey={dashboardFitKey} />}

        {/* ── Custom Points markers ── */}
        {customPoints.filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon) && (pt.lat !== 0 || pt.lon !== 0)).map(pt => (
          <Marker
            key={pt.id}
            position={[pt.lat, pt.lon]}
            icon={L.divIcon({
              className: '',
              html: `<div style="width:16px;height:16px;border-radius:50%;background:hsl(280,70%,55%);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent>
              <span className="text-xs font-bold">{pt.name}</span>
            </Tooltip>
          </Marker>
        ))}

        {/* ── Persisted Tagged Polygons (per active dashboard) ── */}
        {taggedPolygons.map(poly => {
          const isCircle = !!(poly.circleCenter && poly.circleRadiusM && poly.circleRadiusM > 0);
          if (isCircle) {
            const cCenter = poly.circleCenter as [number, number];
            const cRadius = poly.circleRadiusM as number;
            const totalKm = cRadius / 1000;
            const stepKm = totalKm <= 20 ? 1 : totalKm <= 50 ? 5 : totalKm <= 200 ? 10 : 25;
            const labelEveryKm = totalKm <= 10 ? 1 : totalKm <= 20 ? 2 : totalKm <= 50 ? 5 : 10;
            const rings: number[] = [];
            for (let km = stepKm; km * 1000 < cRadius; km += stepKm) rings.push(km * 1000);
            rings.push(cRadius);

            const RING_COLOR = '#0ea5e9';
            const perimeterPoint = (bearingDeg: number, distM: number): [number, number] => {
              const R = 6371000;
              const lat1 = cCenter[0] * Math.PI / 180;
              const lng1 = cCenter[1] * Math.PI / 180;
              const brng = bearingDeg * Math.PI / 180;
              const d = distM / R;
              const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
              const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
              return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
            };
            const labelBearings = totalKm > 30 ? [0, 90, 180, 270] : totalKm > 10 ? [0, 180] : [0];

            return (
              <React.Fragment key={poly.id}>
                {rings.map((r, i) => {
                  const isFinal = i === rings.length - 1;
                  return (
                    <Circle
                      key={`tagged-ring-${poly.id}-${i}`}
                      center={cCenter}
                      radius={r}
                      pane="pane5G"
                      pathOptions={{
                        color: isFinal ? 'hsl(280, 70%, 55%)' : RING_COLOR,
                        fillColor: isFinal ? 'hsl(280, 70%, 55%)' : 'transparent',
                        fillOpacity: isFinal ? 0.06 : 0,
                        weight: isFinal ? 2 : 1.2,
                        dashArray: isFinal ? '6 4' : '6 6',
                        opacity: isFinal ? 0.9 : 0.45,
                      }}
                    >
                      {isFinal && (
                        <Tooltip direction="center" opacity={0.95} sticky>
                          <div className="text-[11px] font-semibold">{poly.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {poly.fmtArea} · {poly.fmtPerimeter}
                          </div>
                        </Tooltip>
                      )}
                    </Circle>
                  );
                })}
                {rings.map((r, i) => {
                  const isFinal = i === rings.length - 1;
                  const rKm = r / 1000;
                  const showLabel = isFinal || (rKm >= stepKm && rKm % labelEveryKm === 0);
                  if (!showLabel) return null;
                  const labelText = isFinal && (rKm % 1 !== 0)
                    ? `${rKm.toFixed(2)} km`
                    : rKm >= 1 ? `${Math.round(rKm)} km` : `${Math.round(r)} m`;
                  return labelBearings.map((bearing) => {
                    const pos = perimeterPoint(bearing, r);
                    const labelIcon = L.divIcon({
                      className: '',
                      html: `<div style="
                        background: rgba(255,255,255,0.93);
                        color: ${isFinal ? 'hsl(280, 70%, 40%)' : '#0c4a6e'};
                        font-size: 10px;
                        font-weight: 700;
                        padding: 1px 6px;
                        border-radius: 4px;
                        border: 1px solid ${isFinal ? 'hsla(280, 70%, 55%, 0.5)' : 'rgba(14,165,233,0.4)'};
                        box-shadow: 0 1px 4px rgba(0,0,0,0.18);
                        white-space: nowrap;
                        pointer-events: none;
                        transform: translate(-50%, -50%);
                      ">${labelText}</div>`,
                      iconSize: [0, 0],
                      iconAnchor: [0, 0],
                    });
                    return (
                      <Marker
                        key={`tagged-ring-label-${poly.id}-${i}-${bearing}`}
                        position={pos}
                        icon={labelIcon}
                        interactive={false}
                        pane="pane5G"
                      />
                    );
                  });
                })}
              </React.Fragment>
            );
          }
          return (
            <Polygon
              key={poly.id}
              positions={poly.points}
              pathOptions={{
                color: 'hsl(280, 70%, 55%)',
                weight: 2,
                fillColor: 'hsl(280, 70%, 55%)',
                fillOpacity: 0.08,
                dashArray: '4 4',
              }}
            >
              <Tooltip direction="center" opacity={0.95} sticky>
                <div className="text-[11px] font-semibold">{poly.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {poly.fmtArea} · {poly.fmtPerimeter}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── Search coordinate marker ── */}
        {searchCoordMarker && (
          <Marker
            position={searchCoordMarker}
            icon={L.divIcon({
              className: '',
              html: `<div style="width:20px;height:20px;border-radius:50%;background:hsl(0,80%,50%);border:3px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,0.4);animation:pulse 1.5s infinite;cursor:pointer;"></div>
                     <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })}
            eventHandlers={{
              click: () => {
                addCustomPoint(searchCoordMarker[0], searchCoordMarker[1]);
                setSearchCoordMarker(null);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95} permanent>
              <span className="text-xs font-semibold">📌 Cliquez pour taguer · {searchCoordMarker[0].toFixed(4)}, {searchCoordMarker[1].toFixed(4)}</span>
            </Tooltip>
          </Marker>
        )}

        {/* ── Live preview line from A to cursor ── */}
        {activeMapTool === 'distance' && distanceMeasurePoints.length === 1 && distanceCursorPos && (
          <Polyline
            positions={[distanceMeasurePoints[0], distanceCursorPos]}
            pane="pane5G"
            pathOptions={{
              color: 'hsl(var(--primary))',
              weight: 2,
              dashArray: '6 6',
              opacity: 0.7,
            }}
          >
            {livePreviewMeasurement && (
              <Tooltip permanent direction="center" opacity={1} className="measurement-label-minimal">
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#27AE60', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {livePreviewMeasurement.label} • {livePreviewMeasurement.azimuth}°
                </span>
              </Tooltip>
            )}
          </Polyline>
        )}

        {activeMapTool === 'distance' && distanceMeasurePoints.map((point, index) => (
          <CircleMarker
            key={`distance-point-${index}-${point[0]}-${point[1]}`}
            center={point}
            radius={5}
            pane="pane5G"
            pathOptions={{
              color: '#fff',
              fillColor: '#27AE60',
              fillOpacity: 1,
              weight: 1.5,
            }}
          />
        ))}
        {activeMapTool === 'distance' && distanceMeasurePoints.length === 2 && distanceMeasurement && (
          <Polyline
            positions={distanceMeasurePoints}
            pane="pane5G"
            pathOptions={{
              color: 'hsl(var(--primary))',
              weight: 3,
              dashArray: '10 6',
              opacity: 0.95,
            }}
          >
            <Tooltip permanent direction="center" opacity={1} className="measurement-label-minimal">
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#27AE60', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {distanceMeasurement.label} • {distanceMeasurement.azimuth}°
              </span>
            </Tooltip>
          </Polyline>
        )}

        {/* ── Saved measurements on map ── */}
        {savedMeasurements.map(m => {
          const isSelected = selectedMeasurementId === m.id;
          const lineColor = isSelected ? '#0096ff' : 'hsl(var(--primary))';
          return (
          <React.Fragment key={m.id}>
            <Polyline
              positions={[m.from, m.to]}
              pane="pane5G"
              pathOptions={{
                color: lineColor,
                weight: isSelected ? 4 : 3,
                dashArray: '10 6',
                opacity: isSelected ? 1 : 0.7,
              }}
              eventHandlers={{
                click: () => {
                  setSelectedMeasurementId(m.id);
                  setInventoryTab('tagged');
                },
              }}
            >
              <Tooltip permanent direction="center" opacity={1} className="measurement-label-minimal">
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#27AE60', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {m.label} • {m.azimuth}°
                </span>
              </Tooltip>
            </Polyline>
            <CircleMarker center={m.from} radius={5} pane="pane5G" pathOptions={{ color: '#fff', fillColor: isSelected ? '#0096ff' : '#27AE60', fillOpacity: 1, weight: 1.5 }} />
            <CircleMarker center={m.to} radius={5} pane="pane5G" pathOptions={{ color: '#fff', fillColor: isSelected ? '#0096ff' : '#27AE60', fillOpacity: 1, weight: 1.5 }} />
          </React.Fragment>
          );
        })}

        {/* ── Profile tool line ── */}
        {activeMapTool === 'profile' && profileTarget && selectedSiteSnapshot && (() => {
          const siteCoords = selectedSiteSnapshot.coordinates;
          const dist = haversineDistance({ lat: siteCoords[0], lng: siteCoords[1] }, { lat: profileTarget[0], lng: profileTarget[1] });
          const fmtDist = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
          return (
            <>
              <Polyline
                positions={[siteCoords, profileTarget]}
                pathOptions={{ color: 'hsl(280, 70%, 60%)', weight: 2.5, opacity: 0.85, dashArray: '8 4' }}
              >
                <Tooltip direction="center" permanent className="profile-distance-tooltip">
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'hsl(280, 70%, 60%)', textShadow: '0 0 4px #fff, 0 0 8px #fff' }}>
                    {fmtDist}
                  </span>
                </Tooltip>
              </Polyline>
              <CircleMarker center={profileTarget} radius={5} pathOptions={{ fillColor: 'hsl(280, 70%, 60%)', fillOpacity: 1, color: '#fff', weight: 2 }} />
            </>
          );
        })()}

        {/* ── Radius tool ── */}
        {activeMapTool === 'radius' && radiusCenter && (() => {
          const currentRadius = radiusConfirmed ? radiusConfirmedMeters : radiusLiveMeters;
          const fmtRadius = currentRadius >= 1000 ? `${(currentRadius / 1000).toFixed(2)} km` : `${Math.round(currentRadius)} m`;

          // Build concentric rings at 1km intervals (adaptive step for large radii)
          const rings: number[] = [];
          if (currentRadius > 0) {
            const totalKm = currentRadius / 1000;
            let stepKm: number;
            if (totalKm <= 20) stepKm = 1;
            else if (totalKm <= 50) stepKm = 5;
            else if (totalKm <= 200) stepKm = 10;
            else stepKm = 25;

            for (let km = stepKm; km * 1000 < currentRadius; km += stepKm) {
              rings.push(km * 1000);
            }
            rings.push(currentRadius); // final ring = exact radius
          }

          // Adaptive label density
          const totalKm = currentRadius / 1000;
          const labelEveryKm = totalKm <= 10 ? 1 : totalKm <= 20 ? 2 : totalKm <= 50 ? 5 : 10;
          const stepKm = totalKm <= 20 ? 1 : totalKm <= 50 ? 5 : totalKm <= 200 ? 10 : 25;

          const RING_COLOR = '#0ea5e9';

          // Helper: compute point on perimeter at a given bearing (degrees) and distance (meters)
          const perimeterPoint = (bearingDeg: number, distM: number): [number, number] => {
            const R = 6371000;
            const lat1 = radiusCenter[0] * Math.PI / 180;
            const lng1 = radiusCenter[1] * Math.PI / 180;
            const brng = bearingDeg * Math.PI / 180;
            const d = distM / R;
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
            const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
            return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
          };

          // Label positions on perimeter: 0° = North (12h), 90° = East (3h)
          const labelBearings = totalKm > 30 ? [0, 90, 180, 270] : totalKm > 10 ? [0, 180] : [0];

          return (
            <>
              {rings.map((r, i) => {
                const isFinal = i === rings.length - 1;
                return (
                  <Circle
                    key={`radius-ring-${i}`}
                    center={radiusCenter}
                    radius={r}
                    pane="pane5G"
                    pathOptions={{
                      color: isFinal ? '#f97316' : RING_COLOR,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                      weight: isFinal ? 2.5 : 1.5,
                      dashArray: isFinal ? '12 6' : '8 6',
                      opacity: isFinal ? 1 : 0.55,
                    }}
                  />
                );
              })}

              {/* Labels placed ON the perimeter of each ring */}
              {rings.map((r, i) => {
                const isFinal = i === rings.length - 1;
                const rKm = r / 1000;
                const showLabel = isFinal || (rKm >= stepKm && rKm % labelEveryKm === 0);
                if (!showLabel) return null;
                const labelText = isFinal && (rKm % 1 !== 0)
                  ? `${rKm.toFixed(2)} km`
                  : rKm >= 1 ? `${Math.round(rKm)} km` : `${Math.round(r)} m`;

                return labelBearings.map((bearing) => {
                  const pos = perimeterPoint(bearing, r);
                  const labelIcon = L.divIcon({
                    className: '',
                    html: `<div style="
                      background: rgba(255,255,255,0.93);
                      color: ${isFinal ? '#ea580c' : '#0c4a6e'};
                      font-size: 10px;
                      font-weight: 700;
                      padding: 1px 6px;
                      border-radius: 4px;
                      border: 1px solid ${isFinal ? 'rgba(249,115,22,0.5)' : 'rgba(14,165,233,0.4)'};
                      box-shadow: 0 1px 4px rgba(0,0,0,0.18);
                      white-space: nowrap;
                      pointer-events: none;
                      transform: translate(-50%, -50%);
                    ">${labelText}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0],
                  });
                  return (
                    <Marker
                      key={`radius-label-${i}-${bearing}`}
                      position={pos}
                      icon={labelIcon}
                      interactive={false}
                      pane="pane5G"
                    />
                  );
                });
              })}

              {/* Subtle fill on the outer ring */}
              {currentRadius > 0 && (
                <Circle
                  center={radiusCenter}
                  radius={currentRadius}
                  pane="pane5G"
                  pathOptions={{
                    color: 'transparent',
                    fillColor: RING_COLOR,
                    fillOpacity: radiusConfirmed ? 0.06 : 0.04,
                    weight: 0,
                    stroke: false,
                  }}
                >
                  <Tooltip permanent direction="center" opacity={1} className="!bg-white/95 dark:!bg-zinc-900/95 !border !border-sky-400/60 dark:!border-sky-500/50 !text-zinc-800 dark:!text-zinc-100 !shadow-lg !rounded-lg !px-3 !py-1.5">
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span>📏 {fmtRadius}</span>
                      {radiusConfirmed && radiusStats && (
                        <>
                          <span className="opacity-40">•</span>
                          <span>{radiusStats.sitesInside} sites</span>
                          <span className="opacity-40">•</span>
                          <span>{radiusStats.cellsInside} cells</span>
                        </>
                      )}
                    </div>
                  </Tooltip>
                </Circle>
              )}

              <CircleMarker
                center={radiusCenter}
                radius={6}
                pane="pane5G"
                pathOptions={{
                  color: '#fff',
                  fillColor: '#f97316',
                  fillOpacity: 1,
                  weight: 2.5,
                }}
              >
                <Tooltip permanent direction="bottom" offset={[0, 10]} opacity={1} className="!bg-white/95 dark:!bg-zinc-900/95 !border !border-border/50 !text-zinc-600 dark:!text-zinc-300 !rounded-md !shadow-sm !px-2 !py-0.5">
                  <span className="text-[8px] font-mono">{radiusCenter[0].toFixed(5)}, {radiusCenter[1].toFixed(5)}</span>
                </Tooltip>
              </CircleMarker>
            </>
          );
        })()}

        {/* ── Polygon tool ── */}
        {activeMapTool === 'polygon' && polygonPoints.length >= 2 && (
          polygonClosed ? (
            <Polygon
              positions={polygonPoints}
              pane="pane5G"
              pathOptions={{
                color: 'hsl(var(--primary))',
                fillColor: 'hsl(var(--primary))',
                fillOpacity: 0.1,
                weight: 2,
              }}
            >
              {polygonStats && (
                <Tooltip permanent direction="center" opacity={1} className="!bg-card !border-border !text-foreground shadow-lg">
                  <div className="flex flex-col items-center gap-0.5 text-[9px] font-medium">
                    <span className="font-semibold">{polygonStats.fmtArea}</span>
                    <span className="text-muted-foreground">{polygonStats.fmtPerimeter}</span>
                  </div>
                </Tooltip>
              )}
            </Polygon>
          ) : (
            <Polyline
              positions={polygonPoints}
              pane="pane5G"
              pathOptions={{
                color: 'hsl(var(--primary))',
                weight: 2,
                dashArray: '8 6',
                opacity: 0.8,
              }}
            />
          )
        )}
        {/* ── Zoom Area selection rectangle ── */}
        {activeMapTool === 'zoomarea' && zoomAreaOrigin && zoomAreaCurrent && (
          <Polygon
            positions={[
              [zoomAreaOrigin[0], zoomAreaOrigin[1]],
              [zoomAreaOrigin[0], zoomAreaCurrent[1]],
              [zoomAreaCurrent[0], zoomAreaCurrent[1]],
              [zoomAreaCurrent[0], zoomAreaOrigin[1]],
            ]}
            pathOptions={{
              color: '#0096ff',
              fillColor: '#0096ff',
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '6 4',
            }}
          />
        )}
        {activeMapTool === 'polygon' && polygonPoints.map((point, index) => (
          <CircleMarker
            key={`polygon-pt-${index}`}
            center={point}
            radius={5}
            pane="pane5G"
            pathOptions={{
              color: 'hsl(var(--background))',
              fillColor: 'hsl(var(--primary))',
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}


        {paramMode && !paramLoading && paramSiteMarkers.length > 0 && (
          <FitHighlightBounds coords={paramSiteMarkers.map(p => [p.latitude, p.longitude] as [number, number])} />
        )}
        {selectedSiteCoords && (
          <Marker
            position={selectedSiteCoords}
            pane="paneParam"
            interactive={false}
            icon={L.divIcon({
              className: 'selected-site-pulse-marker',
              iconSize: [72, 72],
              iconAnchor: [36, 36],
              html: '<div class="selected-site-pulse-core"></div><div class="selected-site-pulse-ring"></div>',
            })}
          />
        )}
        {/* Parameter density heatmap overlay */}
        {paramMode && !paramLoading && paramHeatmapEnabled && paramHeatPoints.length > 0 && (
          <HeatmapLayer points={paramHeatPoints} radius={32} blur={24} minOpacity={0.35} />
        )}
        {paramMode && !paramLoading && paramSiteMarkers.map(site => {
          // Multi-value sites: pie-like split marker via SVG DivIcon
          if (site.isMultiValue) {
            const vals = site.distinctValues;
            const n = vals.length;
            const sz = 18;
            const r = sz / 2;
            const slices = vals.map((v, i) => {
              const a0 = (2 * Math.PI * i) / n - Math.PI / 2;
              const a1 = (2 * Math.PI * (i + 1)) / n - Math.PI / 2;
              const x0 = r + r * Math.cos(a0);
              const y0 = r + r * Math.sin(a0);
              const x1 = r + r * Math.cos(a1);
              const y1 = r + r * Math.sin(a1);
              const large = a1 - a0 > Math.PI ? 1 : 0;
              return `<path d="M${r},${r} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${paramValueColor(v === '(vide)' ? null : v)}" />`;
            }).join('');
            const svg = `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="white" stroke-width="2"/>${slices}<circle cx="${r}" cy="${r}" r="${r}" fill="none" stroke="white" stroke-width="1.5"/></svg>`;
            return (
              <Marker
                key={`param-site-${site.id}`}
                position={[site.latitude, site.longitude]}
                pane="paneParam"
                icon={L.divIcon({ className: '', iconSize: [sz, sz], iconAnchor: [r, r], html: svg })}
              >
                <Popup maxWidth={460} minWidth={340}>
                  <div className="text-xs space-y-1 min-w-[200px]">
                    <div className="font-bold text-sm">{site.site_name}</div>
                    <div className="flex justify-between"><span className="opacity-60">Paramètre actif</span><span className="font-semibold">{paramConfirmed}</span></div>
                    <div className="text-[10px] font-semibold text-orange-500 mt-1">Multi-valeur ({vals.length} valeurs distinctes)</div>
                    {site.cells.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: paramValueColor(c.value) }} />
                        <span className="truncate">{c.cell_name || '?'}</span>
                        <span className="ml-auto font-semibold" style={{ color: paramValueColor(c.value) }}>{c.value ?? '—'}</span>
                      </div>
                    ))}
                    {site.vendor && <div className="flex justify-between mt-1"><span className="opacity-60">Vendor</span><span>{site.vendor}</span></div>}
                    <div className="border-t border-border/40 my-2" />
                    <SiteAllParamsPopup siteName={site.site_name} activeParam={paramConfirmed} />
                  </div>
                </Popup>
              </Marker>
            );
          }
          // Single-value site: simple colored dot
          return (
            <CircleMarker
              key={`param-site-${site.id}`}
              center={[site.latitude, site.longitude]}
              radius={7}
              pane="paneParam"
              pathOptions={{
                fillColor: paramValueColor(site.singleValue === '(vide)' ? null : site.singleValue),
                fillOpacity: 0.92,
                color: 'white',
                weight: 2,
              }}
            >
              <Popup maxWidth={460} minWidth={340}>
                <div className="text-xs space-y-1 min-w-[180px]">
                  <div className="font-bold text-sm">{site.site_name}</div>
                  <div className="flex justify-between"><span className="opacity-60">Paramètre actif</span><span className="font-semibold">{paramConfirmed}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">Valeur</span><span className="font-semibold" style={{ color: paramValueColor(site.singleValue === '(vide)' ? null : site.singleValue) }}>{site.singleValue ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">Cellules</span><span>{site.cells.length}</span></div>
                  {site.vendor && <div className="flex justify-between"><span className="opacity-60">Vendor</span><span>{site.vendor}</span></div>}
                  <div className="border-t border-border/40 my-2" />
                  <SiteAllParamsPopup siteName={site.site_name} activeParam={paramConfirmed} />
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Heatmap layer */}
        {!paramMode && !paramPanelOpen && sectorColorMode !== 'topo' && mapDisplayMode === 'heatmap' && (
          <HeatmapLayer points={heatmapPoints} radius={35} blur={25} minOpacity={0.3} />
        )}

        {/* Points mode — individual cell markers (NEVER in KPI mode — KPI always uses sectors) */}
        {!paramMode && !paramPanelOpen && sectorColorMode !== 'kpi' && mapDisplayMode === 'points' && renderSites.map(site => {
          const showCellLabels = viewport.zoom >= 13;
          const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
          const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
          const baseCellsToRender = getRenderableCellsForSite(site, mapTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno).filter(cellMatchesViewConditions);
          const cellsToRender = (sectorColorMode as string) === 'kpi'
            ? baseCellsToRender.filter(cell => isCellVisibleForKpiOverlay(cell, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno, localTechno, localBande, kpiOverlayVendor, site.vendor) && isCellVisibleForKpiLegend(cell))
            : baseCellsToRender;
          return (
            <React.Fragment key={site.site_id}>
              {cellsToRender.map((cell, idx) => {
                const val = getCellKpiValue(cell, site.site_name || site.site_id);
                const colorViewOverridePoint = getColorViewFill(site);
                const techColor = is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#27AE60') : is3GTech(cell.techno) ? (bandColors['3G_GROUP'] || '#3498DB') : is2GTech(cell.techno) ? (bandColors['2G_GROUP'] || '#8E44AD') : (bandColors['4G_GROUP'] || '#F39C12');
                const color = colorViewOverridePoint || (sectorColorMode === 'topo' ? (mapTechnoFilter === 'ALL' ? techColor : getBandColor(cell.bande, cell.techno)) : getKpiColor(val));
                const isHovered = hoveredSiteId === site.site_id;
                const offsetDist = 0.0003;
                const rad = ((cell.azimut || idx * 120) - 90) * (Math.PI / 180);
                const cellLat = site.coordinates[0] + offsetDist * Math.cos(rad);
                const cellLng = site.coordinates[1] + offsetDist * Math.sin(rad);
                const cellTechGroup = getCellTechGroup(cell.techno);
                const cellPane = cellTechGroup === '5G' ? 'pane5G' : cellTechGroup === '3G' ? 'pane3G' : cellTechGroup === '2G' ? 'pane2G' : 'pane4G';
                return (
                  <CircleMarker
                    key={cell.cell_id}
                    center={[cellLat, cellLng]}
                    radius={isHovered ? 9 : showCellLabels ? 7 : 5}
                    pane={cellPane}
                    pathOptions={{
                      color: isHovered ? '#fff' : 'transparent',
                      fillColor: color,
                      fillOpacity: Math.min(1, 0.9 * ((sectorColorMode as string) === 'kpi' ? kpiOverlayIntensity * kpiOverlayTransparency : 1)),
                      weight: isHovered ? 2 : 0,
                    }}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    {showCellLabels && sectorColorMode !== 'topo' && (
                      <Tooltip direction="right" offset={[8, 0]} permanent className="cell-kpi-label">
                        <span style={{ color, fontWeight: 800, fontSize: '10px' }}>{(val ?? 0).toFixed(1)}</span>
                      </Tooltip>
                    )}
                    <Popup>
                      <div className="p-1 min-w-[180px]">
                        <div className="font-bold text-sm">{site.site_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{cell.cell_id}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{cell.techno} • {cell.bande} MHz • {cell.azimut}°</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Sites mode — Mini sectors or circle markers when full sectors not visible */}
        {!paramMode && !paramPanelOpen && mapDisplayMode === 'sites' && !showSectors && renderSites.map(site => {
          // Skip site when KPI legend filter hides all its cells (cell-level logic, not site average)
          if (sectorColorMode === 'kpi' && hiddenKpiLevels.size > 0) {
            if (!siteMatchesKpiLegend(site)) return null;
          }
          const { has2G, has3G, has4G, has5G } = inferSiteTechState(site);
          const topoColor = has5G ? (bandColors['5G_GROUP'] || '#27AE60') : has4G ? (bandColors['4G_GROUP'] || '#F39C12') : has3G ? (bandColors['3G_GROUP'] || '#3498DB') : has2G ? (bandColors['2G_GROUP'] || '#8E44AD') : (sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12'));
          // KPI coloring: use site-level KPI value when in KPI mode
          const kpiColor = sectorColorMode === 'kpi' ? getKpiColor(getSiteKpiValue(site)) : null;
          // Color view override: if a "View by Color" dimension is active, use that instead
          const colorViewOverride = getColorViewFill(site);
          const color = colorViewOverride || kpiColor || topoColor;
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          const isTagged = isSiteTagged(site.site_id);
          const shouldUseSiteDetailCells = isSelectedSite && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0;
          const siteHasRealCells = site.cells.length > 0;
          const renderSiteCellsRaw = shouldUseSiteDetailCells
            ? siteDetail.cells
            : (siteHasRealCells ? site.cells : buildSyntheticRenderCells(site));
          // siteDetail.cells is the full inventory — when a dashboard scope
          // is active (e.g. Lille_L1800 → bande=LTE1800), re-apply it so
          // the selected site doesn't leak out-of-scope cells onto the map.
          const renderSiteCells = (shouldUseSiteDetailCells && dashboardActive && activeDashboardFilters)
            ? getRenderableCellsForSite(
                { ...site, cells: renderSiteCellsRaw },
                mapTechnoFilter,
                enabledTechnos,
                isBandEnabled,
                activeDashboardFilters.bande ?? null,
                activeDashboardFilters.techno ?? null,
              )
            : renderSiteCellsRaw;
          const isSyntheticOnlySite = !shouldUseSiteDetailCells && !siteHasRealCells && renderSiteCells.length > 0;
          const renderSiteForCells = { ...site, cells: renderSiteCells };
          const showMiniSectors = (showBeamSectors && viewport.zoom >= SITES_TO_CELLS_ZOOM && renderSiteCells.length > 0 && !isIndoor)
            || (isTagged && renderSiteCells.length > 0 && !isIndoor);

          if (isIndoor) {
            const densityScale = renderSites.length > 2000 ? 0.7 : renderSites.length > 800 ? 0.8 : renderSites.length > 400 ? 0.9 : 1;
            const indoorRadius = viewport.zoom >= 10
              ? (isHovered || isSelectedSite ? 7 : 5)
              : viewport.zoom >= 8
                ? (isHovered || isSelectedSite ? 6 : Math.round(4 * densityScale))
                : (isHovered || isSelectedSite ? 5 : Math.round(3.5 * densityScale));
            return (
              <React.Fragment key={site.site_id}>
                <CircleMarker
                  center={site.coordinates}
                  radius={indoorRadius}
                  pane="pane4G"
                  pathOptions={{
                    color: isSelectedSite ? '#fff' : (isHovered ? '#fff' : 'hsl(var(--border))'),
                    fillColor: colorViewOverride || color,
                    fillOpacity: 0.85,
                    weight: isSelectedSite ? 2 : (isHovered ? 2 : 1),
                  }}
                  eventHandlers={{
                    click: () => handleSiteClick(site),
                    mouseover: () => setHoveredSiteId(site.site_id),
                    mouseout: () => setHoveredSiteId(null),
                  }}
                >
                  <Popup>
                    <div className="p-1">
                      <div className="font-bold text-sm">{site.site_name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{site.site_id} • Indoor</div>
                    </div>
                  </Popup>
                </CircleMarker>
                {shouldShowLabels && viewport.zoom >= 8 && (
                  <Marker position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
                    <Tooltip direction="bottom" offset={[0, 8]} permanent className="site-name-label-clean">
                      <span style={{ fontSize: viewport.zoom >= 12 ? '9px' : '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{buildSiteLabel(site, mapLabelFields)}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          if (showMiniSectors) {
            // At zoom 12+: uniform sizing — no per-site variation
            const isUniformZoom = viewport.zoom >= 12;
            const cellCountScale = isUniformZoom ? 1 : getCellCountScale(renderSiteCells.length);
            const siteDF = isUniformZoom ? 1 : getSiteDensityFactor(site.site_id);
            const siteOpacityScale = isUniformZoom ? 1 : getSiteOpacityScale(site.site_id);
            const miniRadius = isTagged ? getTaggedRadius(viewport.zoom) * 0.9 : getZoomAwareRadius(site.coordinates[0], viewport.zoom, siteDF, vpWidth) * 0.7 * cellCountScale;
            // PRO #2/#3: lighter fill + stronger outline for readability — dense zones get extra opacity dampening
            // Beam visibility slider acts as a global opacity multiplier (0..1.6 range so 100% = fully opaque)
            const beamOpacityMul = Math.max(0, (beamVisibility / 100) * 1.6);
            const miniOpacity = Math.min(1, (0.2 + (viewport.zoom - 9) * 0.08) * siteOpacityScale * beamOpacityMul);
            const azimuths = getValidSectorAzimuths(renderSiteForCells);
            if (azimuths.length === 0) return null;
            // ── Single source of truth: when site is selected, use freshly-loaded siteDetail.cells
            // (otherwise the bbox cache may contain stale cells from a previous fetch — e.g. NR700
            // appearing on the map while the left panel only shows L2600).
            const renderCells = renderSiteCells;
            // Build per-cell band-based mini items with size hierarchy.
            // Apply the SAME filter set as the left panel (techno + band + dashboard) so
            // map / left panel / topbar legend stay perfectly consistent.
            const miniItems: { tech: string; az: number; r: number; bandKey: string | null; cell: typeof site.cells[number] }[] = [];
            const seenMini = new Set<string>();
            for (const cell of renderCells) {
              const tech = getCellTechGroup(cell.techno);
              if (!tech) continue;
              if (sectorColorMode === 'kpi') {
                if (!isCellVisibleForKpiOverlay(cell, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashboardActive ? activeDashboardFilters?.bande ?? null : null, dashboardActive ? activeDashboardFilters?.techno ?? null : null, localTechno, localBande, kpiOverlayVendor, site.vendor)) continue;
                if (!isCellVisibleForKpiLegend(cell, site.site_name || site.site_id || '')) continue;
              } else {
                if (tech === '2G' && !enabledTechnos.has('2G')) continue;
                if (tech === '3G' && !enabledTechnos.has('3G')) continue;
                if (tech === '4G' && !enabledTechnos.has('4G')) continue;
                if (tech === '5G' && !enabledTechnos.has('5G')) continue;
                if (mapTechnoFilter === '4G' && tech !== '4G') continue;
                if (mapTechnoFilter === '5G' && tech !== '5G') continue;
                if (localTechno !== 'ALL' && tech !== localTechno) continue;
                if (localBande !== 'ALL' && cell.bande !== localBande) continue;
                if (!isBandEnabled(cell.bande, cell.techno)) continue;
                if (activeDashboardFilters?.bande?.length && !activeDashboardFilters.bande.includes(cell.bande)) continue;
                if (activeDashboardFilters?.techno?.length && !activeDashboardFilters.techno.some(t => tech === t || cell.techno === t)) continue;
              }
              const az = Number(cell.azimut);
              if (!Number.isFinite(az) || az < 0 || az > 360) continue;
              const bandKey = normalizeBandKey(cell.bande, cell.techno);
              const dedup = `${tech}_${bandKey}_${az}`;
              if (seenMini.has(dedup)) continue;
              seenMini.add(dedup);
              const bandScale = getBandSizeScale(bandKey);
              miniItems.push({ tech, az, r: miniRadius * bandScale, bandKey, cell });
            }
            // Sort: bigger first (low freq below), smaller on top
            miniItems.sort((a, b) => getBandRenderOrder(a.bandKey) - getBandRenderOrder(b.bandKey));

            // For mixed sites: cap 5G mini-sectors to 65% of 4G at same azimuth
            const hasMini4G = miniItems.some(i => i.tech === '4G');
            const hasMini5G = miniItems.some(i => i.tech === '5G');
            if (hasMini4G && hasMini5G) {
              const max4GAz = new Map<number, number>();
              for (const item of miniItems) {
                if (item.tech === '4G') {
                  const cur = max4GAz.get(item.az) || 0;
                  if (item.r > cur) max4GAz.set(item.az, item.r);
                }
              }
              for (const item of miniItems) {
                if (item.tech === '5G') {
                  const ref = max4GAz.get(item.az) || miniRadius;
                  const cap = ref * 0.65;
                  if (item.r > cap) item.r = cap;
                }
              }
            }

            const kpiVisibleCells = sectorColorMode === 'kpi'
              ? renderCells.filter(cell =>
                  isCellVisibleForKpiOverlay(
                    cell,
                    kpiTechnoFilter,
                    enabledTechnos,
                    isBandEnabled,
                    dashboardActive ? activeDashboardFilters?.bande ?? null : null,
                    dashboardActive ? activeDashboardFilters?.techno ?? null : null,
                    localTechno,
                    localBande,
                    kpiOverlayVendor,
                    site.vendor,
                  ) && isCellVisibleForKpiLegend(cell, site.site_name || site.site_id || ''),
                )
              : renderCells;

            // Fallback: if no band-specific items survived filtering, only use techno-level fallback
            // when filters are NOT actively excluding bands (otherwise we'd resurrect filtered-out cells)
            const hasActiveBandFilter = localBande !== 'ALL' || (activeDashboardFilters?.bande?.length ?? 0) > 0;
            if (miniItems.length === 0 && !hasActiveBandFilter && kpiVisibleCells.length > 0) {
              if (has4G && !has5G && enabledTechnos.has('4G')) {
                const fallbackCell = kpiVisibleCells.find(c => getCellTechGroup(c.techno) === '4G') ?? kpiVisibleCells[0];
                if (fallbackCell) azimuths.forEach(az => miniItems.push({ tech: '4G', az, r: miniRadius, bandKey: null, cell: fallbackCell }));
              } else if (has5G && !has4G && enabledTechnos.has('5G')) {
                const fallbackCell = kpiVisibleCells.find(c => getCellTechGroup(c.techno) === '5G') ?? kpiVisibleCells[0];
                if (fallbackCell) azimuths.forEach(az => miniItems.push({ tech: '5G', az, r: miniRadius, bandKey: null, cell: fallbackCell }));
              }
            }

            return (
              <React.Fragment key={site.site_id}>
                {miniItems.map(({ tech, az, r, bandKey, cell }) => {
                  const sectorCoords = getSectorCoords(site.coordinates, az, r, 60);
                  const techGroupColor = tech === '5G' ? (bandColors['5G_GROUP'] || '#27AE60')
                    : tech === '3G' ? (bandColors['3G_GROUP'] || '#3498DB')
                    : tech === '2G' ? (bandColors['2G_GROUP'] || '#8E44AD')
                    : (bandColors['4G_GROUP'] || '#F39C12');
                  const defaultTechColor = mapTechnoFilter === 'ALL'
                    ? techGroupColor
                    : (bandKey ? (bandColors[bandKey] || DEFAULT_BAND_COLORS[bandKey] || techGroupColor) : techGroupColor);
                  const kpiColor = getKpiColor(getCellKpiValue(cell, site.site_name || site.site_id));
                  const techColor = colorViewOverride || (sectorColorMode === 'kpi' ? kpiColor : defaultTechColor);
                  const techPane = tech === '5G' ? 'pane5G' : tech === '3G' ? 'pane3G' : tech === '2G' ? 'pane2G' : 'pane4G';
                  return (
                    <Polygon
                      key={`${site.site_id}_mini_${tech}_${bandKey || 'unk'}_${az}`}
                      positions={sectorCoords}
                      pane={techPane}
                      pathOptions={{
                        color: isHovered ? '#fff' : deriveStrokeColor(techColor),
                        fillColor: techColor,
                        fillOpacity: Math.min(1, (isHovered ? 0.5 : miniOpacity) * (sectorColorMode === 'kpi' ? kpiOverlayIntensity * kpiOverlayTransparency : 1)),
                        weight: isHovered ? 2 : 1.5, // PRO #3: stronger outline
                        opacity: isHovered ? 1 : 0.85,
                      }}
                      eventHandlers={{
                        click: () => handleSiteClick(site),
                        mouseover: () => setHoveredSiteId(site.site_id),
                        mouseout: () => setHoveredSiteId(null),
                      }}
                    >
                      <Popup>
                        <div className="p-1">
                          <div className="font-bold text-sm">{site.site_name}</div>
                          <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor}</div>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                })}
                {shouldShowLabels && (
                  <Marker position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
                    <Tooltip direction="bottom" offset={[0, 4]} permanent className="site-name-label-clean">
                      <span style={{ fontSize: viewport.zoom >= 12 ? '9px' : '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{buildSiteLabel(site, mapLabelFields)}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          // Density-adaptive sizing: reduce in dense regions
          const densityScale = renderSites.length > 2000 ? 0.7 : renderSites.length > 800 ? 0.8 : renderSites.length > 400 ? 0.9 : 1;
          const baseRadius = viewport.zoom >= 10
            ? (isHovered || isSelectedSite ? 7 : 5)
            : viewport.zoom >= 8
              ? (isHovered || isSelectedSite ? 6 : Math.round(4 * densityScale))
              : (isHovered || isSelectedSite ? 5 : Math.round(3.5 * densityScale));
          const isMixed = has4G && has5G;
          const radius4G = isMixed ? Math.max(baseRadius, 4) : baseRadius;
          const radius5G = isMixed ? Math.max(Math.round(baseRadius * 0.6), 2.5) : baseRadius;
          return null; // rendered in two-pass below
        })}

        {/* ── Two-pass rendering: ALL 4G circles first (bottom), then ALL 5G circles (top) ── */}
        {!paramMode && !paramPanelOpen && mapDisplayMode === 'sites' && !showSectors && (() => {
          // Collect renderable sites (non-indoor, non-miniSector)
          const circleSites = renderSites.filter(site => {
            const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
            if (isIndoor) return false;
            const isSelectedSite = selectedSiteId === site.site_id;
            const shouldUseSiteDetailCells = isSelectedSite && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0;
            const renderSiteCellsRaw = shouldUseSiteDetailCells
              ? siteDetail.cells
              : (site.cells.length > 0 ? site.cells : buildSyntheticRenderCells(site));
            const renderSiteCells = (shouldUseSiteDetailCells && dashboardActive && activeDashboardFilters)
              ? getRenderableCellsForSite(
                  { ...site, cells: renderSiteCellsRaw },
                  mapTechnoFilter,
                  enabledTechnos,
                  isBandEnabled,
                  activeDashboardFilters.bande ?? null,
                  activeDashboardFilters.techno ?? null,
                )
              : renderSiteCellsRaw;
            const isTagged = isSiteTagged(site.site_id);
            const showMini = (showBeamSectors && viewport.zoom >= SITES_TO_CELLS_ZOOM && renderSiteCells.length > 0 && !isIndoor)
              || (isTagged && renderSiteCells.length > 0 && !isIndoor);
            return !showMini;
          });

          const densityScale = circleSites.length > 2000 ? 0.7 : circleSites.length > 800 ? 0.8 : circleSites.length > 400 ? 0.9 : 1;

          const getBaseRadius = (isHov: boolean, isSel: boolean) => {
            const z = viewport.zoom;
            let base: number;
            if (z >= 15) base = 12;
            else if (z >= 14) base = 10;
            else if (z >= 13) base = 8;
            else if (z >= 12) base = 7;
            else if (z >= 11) base = 6;
            else if (z >= 10) base = 5;
            else if (z >= 9) base = 4;
            else if (z >= 8) base = 3;
            else if (z >= 7) base = 3;
            else base = 2;
            base = Math.round(base * densityScale);
            if (isHov || isSel) base = Math.round(base * 1.3);
            return Math.max(2, base);
          };

          // Concentric ring radii: outer→inner = 2G(100%) > 3G(75%) > 4G(55%) > 5G(35%)
          const RING_SCALES: Record<string, number> = { '2G': 1.0, '3G': 0.75, '4G': 0.55, '5G': 0.35 };
          const RING_OPACITY = 0.55;
          const TECH_COLORS: Record<string, string> = {
            '2G': bandColors['2G_GROUP'] || '#8E44AD',
            '3G': bandColors['3G_GROUP'] || '#3498DB',
            '4G': bandColors['4G_GROUP'] || '#F39C12',
            '5G': bandColors['5G_GROUP'] || '#27AE60',
          };
          // Render order: outermost first (2G), innermost last (5G) so center is on top
          const TECH_ORDER: ('2G' | '3G' | '4G' | '5G')[] = ['2G', '3G', '4G', '5G'];
          const TECH_PANES: Record<string, string> = { '2G': 'pane2G', '3G': 'pane3G', '4G': 'pane4G', '5G': 'pane5G' };

          const allRings: React.ReactNode[] = [];
          // Debug: log tech distribution in circleSites
          if (circleSites.length > 0 && !(window as any).__techDebugLogged) {
            const techCounts = { '2G': 0, '3G': 0, '4G': 0, '5G': 0 };
            for (const s of circleSites) {
              const st = inferSiteTechState(s);
              if (st.has2G) techCounts['2G']++;
              if (st.has3G) techCounts['3G']++;
              if (st.has4G) techCounts['4G']++;
              if (st.has5G) techCounts['5G']++;
            }
            console.log('[Concentric Debug]', { circleSites: circleSites.length, techCounts, enabledTechnos: [...enabledTechnos], mapTechnoFilter, showBeamSectors, showSectors, sectorColorMode });
            (window as any).__techDebugLogged = true;
          }

          for (const tech of TECH_ORDER) {
            if (!enabledTechnos.has(tech)) continue;
            if (mapTechnoFilter !== 'ALL' && mapTechnoFilter !== tech) continue;

            const sitesForTech = circleSites.filter(site => {
              const st = inferSiteTechState(site);
              if (tech === '2G') return st.has2G;
              if (tech === '3G') return st.has3G;
              if (tech === '4G') return st.has4G;
              if (tech === '5G') return st.has5G;
              return false;
            });

            for (const site of sitesForTech) {
              const isHov = hoveredSiteId === site.site_id;
              const isSel = selectedSiteId === site.site_id;
              const br = getBaseRadius(isHov, isSel);
              const colorOverride = getColorViewFill(site);

              // Determine which VISIBLE techs this site has (only enabled ones count for sizing)
              const st = inferSiteTechState(site);
              const siteTechs = TECH_ORDER.filter(t => {
                if (!enabledTechnos.has(t)) return false;
                if (mapTechnoFilter !== 'ALL' && mapTechnoFilter !== t) return false;
                if (t === '2G') return st.has2G;
                if (t === '3G') return st.has3G;
                if (t === '4G') return st.has4G;
                if (t === '5G') return st.has5G;
                return false;
              });

              // If single tech, use full radius; otherwise use concentric scale based on position
              let ringRadius: number;
              if (siteTechs.length <= 1) {
                ringRadius = br;
              } else {
                // Position in the site's tech stack: outermost (lowest) = largest
                const posIdx = siteTechs.indexOf(tech);
                const scaleStep = 1.0 / siteTechs.length;
                const scale = 1.0 - posIdx * scaleStep;
                ringRadius = Math.max(Math.round(br * scale), 2);
              }

              const fillColor = colorOverride || TECH_COLORS[tech];
              const strokeColor = isSel ? '#fff' : (isHov ? '#fff' : deriveStrokeColor(fillColor));

              allRings.push(
                <CircleMarker
                  key={`${tech.toLowerCase()}_${site.site_id}`}
                  center={site.coordinates}
                  radius={ringRadius}
                  pane={TECH_PANES[tech]}
                  pathOptions={{
                    color: strokeColor,
                    fillColor,
                    fillOpacity: siteTechs.length <= 1 ? 0.85 : RING_OPACITY,
                    weight: isSel ? 2.5 : (isHov ? 2 : 1),
                  }}
                  eventHandlers={{
                    click: () => handleSiteClick(site),
                    mouseover: () => setHoveredSiteId(site.site_id),
                    mouseout: () => setHoveredSiteId(null),
                  }}
                >
                  <Popup>
                    <div className="p-1">
                      <div className="font-bold text-sm">{site.site_name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor}</div>
                      <div className="text-xs mt-0.5">{siteTechs.join(' / ')}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            }
          }

          // Unknown tech fallback
          const passUnknown = (mapTechnoFilter !== 'ALL' ? [] : circleSites.filter(site => {
            const { has2G, has3G, has4G, has5G } = inferSiteTechState(site);
            return !has2G && !has3G && !has4G && !has5G;
          })).map(site => {
            const isHov = hoveredSiteId === site.site_id;
            const isSel = selectedSiteId === site.site_id;
            const br = getBaseRadius(isHov, isSel);
            const colorOverride = getColorViewFill(site);
            return (
              <CircleMarker
                key={`unk_${site.site_id}`}
                center={site.coordinates}
                radius={br}
                pane="pane4G"
                pathOptions={{
                  color: isSel ? '#fff' : (isHov ? '#fff' : deriveStrokeColor(colorOverride || (sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12')))),
                  fillColor: colorOverride || (sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12')),
                  fillOpacity: 0.85,
                  weight: isSel ? 2.5 : (isHov ? 2 : 1),
                }}
                eventHandlers={{
                  click: () => handleSiteClick(site),
                  mouseover: () => setHoveredSiteId(site.site_id),
                  mouseout: () => setHoveredSiteId(null),
                }}
              >
                <Popup>
                  <div className="p-1">
                    <div className="font-bold text-sm">{site.site_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor}</div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          });

          // Labels
          const labels = circleSites.filter(() => shouldShowLabels && viewport.zoom >= 8).map(site => (
            <Marker key={`lbl_${site.site_id}`} position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
              <Tooltip direction="bottom" offset={[0, 6]} permanent className="site-name-label-clean">
                <span style={{ fontSize: '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{buildSiteLabel(site, mapLabelFields)}</span>
              </Tooltip>
            </Marker>
          ));

          return <>{passUnknown}{allRings}{labels}</>;
        })()}

        {/* Detailed sectors (only when zoomed in, sites mode) — professional low-opacity with strokes */}
        {!paramMode && !paramPanelOpen && showSectors && renderSites.map(site => {
          // LOD filtering: skip sites in very dense areas to reduce overdraw
          const densityInfo = siteDensityMap.get(site.site_id);
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isTaggedSite = isSiteTagged(site.site_id);
          // LOD filtering: at zoom ≤ 13 hide sites in very dense areas. At zoom 14+ all sites render.
          if (viewport.zoom <= 13 && densityInfo && !densityInfo.visible && !isHovered && !isSelectedSite && !isTaggedSite) return null;
          const shouldUseSiteDetailCells = isSelectedSite && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0;
          const siteHasRealCells = site.cells.length > 0;
          const renderSiteCellsRaw = shouldUseSiteDetailCells
            ? siteDetail.cells
            : (siteHasRealCells ? site.cells : buildSyntheticRenderCells(site));
          // siteDetail.cells is the full inventory — when a dashboard scope
          // is active (e.g. Lille_L1800 → bande=LTE1800), re-apply it so
          // the selected site doesn't leak out-of-scope cells onto the map.
          const renderSiteCells = (shouldUseSiteDetailCells && dashboardActive && activeDashboardFilters)
            ? getRenderableCellsForSite(
                { ...site, cells: renderSiteCellsRaw },
                mapTechnoFilter,
                enabledTechnos,
                isBandEnabled,
                activeDashboardFilters.bande ?? null,
                activeDashboardFilters.techno ?? null,
              )
            : renderSiteCellsRaw;
          const isSyntheticOnlySite = !shouldUseSiteDetailCells && !siteHasRealCells && renderSiteCells.length > 0;
          const renderSiteForCells = { ...site, cells: renderSiteCells };
          // Cell-count density scale: sites with more cells get bigger sectors (sqrt, clamped 0.7..1.6)
          // At zoom 12+: uniform sizing (no per-site density/cellCount scaling)
          // At zoom < 12: adaptive scaling for overview decluttering
          const isUniformZoom = viewport.zoom >= 12;
          const cellCountScale = isUniformZoom ? 1 : getCellCountScale(renderSiteCells.length);
          const siteDF = isUniformZoom ? 1 : getSiteDensityFactor(site.site_id);
          const siteOpacityScale = isUniformZoom ? 1 : getSiteOpacityScale(site.site_id);
          const zoomRadius = isTaggedSite ? getTaggedRadius(viewport.zoom) : getZoomAwareRadius(site.coordinates[0], viewport.zoom, siteDF, vpWidth) * (0.5 + 0.5 * (beamVisibility / 100)) * cellCountScale;
          const baseOverlap = visibleSites.length > 200 ? 0.18 : visibleSites.length > 80 ? 0.25 : 0.35;
          const beamScale = beamVisibility / 100;
          const overlapFactor = baseOverlap + (1 - baseOverlap) * beamScale;
          const isFocusFaded = false;

          /* ── Indoor sites: circle with "I" instead of sectors (rendered at all zooms including sector zoom) ── */
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          // KPI legend filter: skip site if all its cells are hidden (cell-level logic)
          if (sectorColorMode === 'kpi' && hiddenKpiLevels.size > 0) {
            if (!siteMatchesKpiLegend(site)) return null;
          }
          if (isIndoor) {
            const { has2G, has3G, has4G, has5G } = inferSiteTechState(renderSiteForCells);
            const topoColor = has5G ? (bandColors['5G_GROUP'] || '#27AE60') : has4G ? (bandColors['4G_GROUP'] || '#F39C12') : has3G ? (bandColors['3G_GROUP'] || '#3498DB') : has2G ? (bandColors['2G_GROUP'] || '#8E44AD') : (sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12'));
            const kpiColor = getKpiColor(getSiteKpiValue(site));
            const colorViewOverrideIndoor = getColorViewFill(site);
            const color = colorViewOverrideIndoor || ((sectorColorMode as string) === 'topo' ? topoColor : kpiColor);
            const iconSize = Math.min(32, Math.max(18, (Math.min(viewport.zoom, 13) - 12) * 6 + 18));
            return (
              <Marker
                key={site.site_id}
                position={site.coordinates}
                icon={L.divIcon({
                  className: '',
                  iconSize: [iconSize, iconSize],
                  iconAnchor: [iconSize / 2, iconSize / 2],
                  html: `<div style="width:${iconSize}px;height:${iconSize}px;border-radius:50%;background:${isFocusFaded ? FADED_COLOR : color};border:2px solid ${isSelectedSite || isHovered ? '#fff' : '#555'};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);opacity:0.9;">
                    <span style="color:#fff;font-weight:900;font-size:${iconSize * 0.55}px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);">I</span>
                  </div>`,
                })}
                eventHandlers={{
                  click: () => handleSiteClick(site),
                  mouseover: () => setHoveredSiteId(site.site_id),
                  mouseout: () => setHoveredSiteId(null),
                }}
              >
                <Popup>
                  <div className="p-1">
                    <div className="font-bold text-sm">{site.site_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor} • Indoor</div>
                    <div className="text-xs mt-1">{site.cell_count} cells • {site.dor}</div>
                  </div>
                </Popup>
              </Marker>
            );
          }

          /* ── Fallback: sites with no cells still get a circle marker at sector zoom ── */
          if (renderSiteCells.length === 0) {
            const { has2G: fb2G, has3G: fb3G, has4G: fb4G, has5G: fb5G } = inferSiteTechState(site);
            const show2G = fb2G && enabledTechnos.has('2G');
            const show3G = fb3G && enabledTechnos.has('3G');
            const show4G = fb4G && enabledTechnos.has('4G');
            const show5G = fb5G && enabledTechnos.has('5G');
            if (!show2G && !show3G && !show4G && !show5G) {
              if (mapTechnoFilter !== 'ALL') return null;
            }
            const zz = Math.min(viewport.zoom, 13);
            const baseR = Math.max(2, Math.round((zz >= 13 ? 12 : zz >= 12 ? 10 : zz >= 11 ? 9 : zz >= 10 ? 7 : zz >= 9 ? 6 : zz >= 8 ? 5 : zz >= 7 ? 4 : 3) * (isHovered || isSelectedSite ? 1.4 : 1)));
            return (
              <React.Fragment key={site.site_id}>
                {show2G && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane2G"
                    fillColor={bandColors['2G_GROUP'] || '#8E44AD'}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(bandColors['2G_GROUP'] || '#8E44AD')}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                      <span className="text-[10px] font-bold">{site.site_name}</span>
                    </Tooltip>
                  </CircleMarker>
                )}
                {show3G && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane3G"
                    fillColor={bandColors['3G_GROUP'] || '#3498DB'}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(bandColors['3G_GROUP'] || '#3498DB')}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                      <span className="text-[10px] font-bold">{site.site_name}</span>
                    </Tooltip>
                  </CircleMarker>
                )}
                {show4G && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane4G"
                    fillColor={bandColors['4G_GROUP'] || '#F39C12'}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(bandColors['4G_GROUP'] || '#F39C12')}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                      <span className="text-[10px] font-bold">{site.site_name}</span>
                    </Tooltip>
                  </CircleMarker>
                )}
                {show5G && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={Math.round(baseR * 0.65)}
                    pane="pane5G"
                    fillColor={bandColors['5G_GROUP'] || '#27AE60'}
                    fillOpacity={0.9}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(bandColors['5G_GROUP'] || '#27AE60')}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                      <span className="text-[10px] font-bold">{site.site_name}</span>
                    </Tooltip>
                  </CircleMarker>
                )}
                {!show2G && !show3G && !show4G && !show5G && mapTechnoFilter === 'ALL' && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane4G"
                    fillColor={sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12')}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12'))}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                      <span className="text-[10px] font-bold">{site.site_name}</span>
                    </Tooltip>
                  </CircleMarker>
                )}
              </React.Fragment>
            );
          }

          /* ── Fallback: sites with no cells → simple KPI circle ── */
          if (renderSiteCells.length === 0) {
            const kpiVal = kpiValues.get(`site:${site.site_name}`) ?? kpiValues.get(`site:${site.site_id}`) ?? (site as any)[mapKpi] ?? site.qoe_score_avg ?? NaN;
            const colorViewOverrideFb = getColorViewFill(site);
            const { has2G, has3G, has4G, has5G } = inferSiteTechState(site);
            const topoColor = has5G ? (bandColors['5G_GROUP'] || '#27AE60') : has4G ? (bandColors['4G_GROUP'] || '#F39C12') : has3G ? (bandColors['3G_GROUP'] || '#3498DB') : has2G ? (bandColors['2G_GROUP'] || '#8E44AD') : (sectorColorMode === 'kpi' ? FADED_COLOR : (bandColors['4G_GROUP'] || '#F39C12'));
            const fbColor = colorViewOverrideFb || (sectorColorMode === 'kpi' ? getKpiColor(kpiVal) : topoColor);
            return (
              <CircleMarker
                key={site.site_id}
                center={site.coordinates}
                radius={Math.max(2, Math.round((viewport.zoom >= 14 ? 14 : viewport.zoom >= 13 ? 12 : viewport.zoom >= 12 ? 10 : viewport.zoom >= 11 ? 9 : viewport.zoom >= 10 ? 7 : viewport.zoom >= 9 ? 6 : viewport.zoom >= 8 ? 5 : viewport.zoom >= 7 ? 4 : 3) * (isHovered || isSelectedSite ? 1.4 : 1)))}
                pane="pane5G"
                pathOptions={{
                  fillColor: fbColor,
                  fillOpacity: 0.9,
                  color: isSelectedSite ? '#fff' : deriveStrokeColor(fbColor),
                  weight: isSelectedSite ? 2.5 : 1.5,
                }}
                eventHandlers={{
                  click: () => handleSiteClick(site),
                  mouseover: () => setHoveredSiteId(site.site_id),
                  mouseout: () => setHoveredSiteId(null),
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95} permanent={false}>
                  <span className="text-[10px] font-bold">{site.site_name}</span>
                </Tooltip>
              </CircleMarker>
            );
          }

          /* ── ALL mode: band-based hierarchy ── */
          if (mapTechnoFilter === 'ALL') {
            // Group cells by band+azimuth for band-based sizing
            const cellItems: { tech: string; az: number; radius: number; bandKey: string | null; cell: typeof site.cells[0] }[] = [];
            const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
            const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
            // Detect "all azimuths = 0" pattern (missing azimut data) → spread by sector number
            const allAzZero = renderSiteCells.length > 1
              && renderSiteCells.every(c => Number(c.azimut) === 0);
            for (const cell of renderSiteCells) {
              const tech = getCellTechGroup(cell.techno);
              if (!tech) continue;
              if (sectorColorMode === 'kpi') {
                if (!isCellVisibleForKpiOverlay(cell, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno, localTechno, localBande, kpiOverlayVendor, site.vendor)) continue;
                if (!isCellVisibleForKpiLegend(cell, site.site_name || site.site_id || '')) continue;
              }
              let az = Number(cell.azimut);
              if (!Number.isFinite(az) || az < 0 || az > 360 || allAzZero) {
                // Fallback: assign azimuth based on sector number (tri-sector heuristic)
                const sNum = getSectorNumber(cell.cell_id);
                const heuristicAz = [0, 0, 120, 240]; // index 0=fallback, 1=0°, 2=120°, 3=240°
                az = heuristicAz[sNum] ?? ((sNum - 1) * 120) % 360;
              }
              if (tech === '2G' && !enabledTechnos.has('2G')) continue;
              if (tech === '3G' && !enabledTechnos.has('3G')) continue;
              if (tech === '4G' && !enabledTechnos.has('4G')) continue;
              if (tech === '5G' && !enabledTechnos.has('5G')) continue;
              if (!isBandEnabled(cell.bande, cell.techno)) continue;
              const bandKey = normalizeBandKey(cell.bande, cell.techno);
              const bandScale = getBandSizeScale(bandKey);
              const radius = zoomRadius * 1.3 * bandScale;
              cellItems.push({ tech, az, radius, bandKey, cell });
            }
            const has4GItems = cellItems.some(c => c.tech === '4G');
            const has5GItems = cellItems.some(c => c.tech === '5G');
            const isMixedSite = has4GItems && has5GItems;

            // Sort: bigger sectors first (render below), smaller on top
            const renderItems = cellItems.sort((a, b) => getBandRenderOrder(a.bandKey) - getBandRenderOrder(b.bandKey));

            // Deduplicate by tech+band+az — keep one per band layer per azimuth
            const seen = new Set<string>();
            const dedupItems = renderItems.filter(item => {
              const key = `${item.tech}_${item.bandKey || 'unk'}_${item.az}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            // For mixed sites: ensure 5G sectors are always smaller than 4G at same azimuth
            if (isMixedSite) {
              // Find max 4G radius per azimuth
              const max4GByAz = new Map<number, number>();
              for (const item of dedupItems) {
                if (item.tech === '4G') {
                  const cur = max4GByAz.get(item.az) || 0;
                  if (item.radius > cur) max4GByAz.set(item.az, item.radius);
                }
              }
              // Cap 5G radius to 65% of 4G radius at same azimuth
              for (const item of dedupItems) {
                if (item.tech === '5G') {
                  const ref4G = max4GByAz.get(item.az) || (zoomRadius * 1.3);
                  const maxAllowed = ref4G * 0.65;
                  if (item.radius > maxAllowed) item.radius = maxAllowed;
                }
              }
            }

            return (
              <React.Fragment key={site.site_id}>
                {dedupItems.map(({ tech, az, radius, bandKey, cell }) => {
                  // Use correct tech group color for all technologies
                  const topoColor = tech === '5G' ? (bandColors['5G_GROUP'] || '#27AE60')
                    : tech === '3G' ? (bandColors['3G_GROUP'] || '#3498DB')
                    : tech === '2G' ? (bandColors['2G_GROUP'] || '#8E44AD')
                    : (bandColors['4G_GROUP'] || '#F39C12');
                  let kpiColor = topoColor;
                  if (sectorColorMode === 'kpi') {
                    const cellKpiValue = getCellKpiValue(cell, site.site_name || site.site_id);
                    kpiColor = getKpiColor(cellKpiValue);
                  }
                  const colorViewOverrideSector = getColorViewFill(site);
                  const fillColor = colorViewOverrideSector || (isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? topoColor : kpiColor));
                  const strokeColor = isFocusFaded ? '#cbd5e1' : deriveStrokeColor(fillColor);
                  const sectorCoords = getSectorCoords(site.coordinates, az, radius, 60);
                  const techPane = tech === '5G' ? 'pane5G' : tech === '3G' ? 'pane3G' : tech === '2G' ? 'pane2G' : 'pane4G';
                  return (
                    <Polygon
                      key={`${site.site_id}_${tech}_${bandKey || 'unk'}_${az}`}
                      positions={sectorCoords}
                      pane={techPane}
                      pathOptions={{
                        color: isHovered ? '#fff' : strokeColor,
                        fillColor,
                        // Density-adaptive: opacity drops hard in dense zones to prevent color blending
                        // In KPI mode: use sliders directly (bypass density fade) so 100% transp = fully opaque
                        fillOpacity: (sectorColorMode as string) === 'kpi' && !isFocusFaded
                          ? Math.min(1, (isHovered ? 1 : kpiOverlayIntensity) * kpiOverlayTransparency)
                          : Math.min(1, (isHovered ? 0.55 : (isFocusFaded ? 0.08 : (tech === '5G' ? 0.45 : Math.min(0.4, overlapFactor)))) * (isHovered || isFocusFaded ? 1 : siteOpacityScale) * (isHovered ? 1 : Math.max(0, (beamVisibility / 100) * 2.2))),
                        // Density-adaptive: stroke weight reduced/hidden in dense zones
                        weight: isHovered ? 2 : Math.max(0.3, 1.5 * (densityInfo?.strokeScale ?? 1)),
                        opacity: isHovered ? 1 : (isFocusFaded ? 0.25 : Math.min(0.9, 0.9 * (densityInfo?.strokeScale ?? 1))),
                      }}
                      eventHandlers={{
                        click: () => handleSiteClick(site),
                        mouseover: () => setHoveredSiteId(site.site_id),
                        mouseout: () => setHoveredSiteId(null),
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -8]} permanent={false} className="sector-tooltip">
                        <div className="px-3 py-2 min-w-[140px]">
                          <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: fillColor }}>{site.site_name}</div>
                          <div className="text-[9px] opacity-60 font-mono mt-0.5">{site.site_id}</div>
                          <div className="mt-1.5 text-[10px] space-y-0.5">
                            <div className="flex justify-between"><span className="opacity-50">Techno</span><span className="font-bold">{tech}</span></div>
                            <div className="flex justify-between"><span className="opacity-50">Band</span><span className="font-bold">{bandKey || '—'}</span></div>
                            <div className="flex justify-between"><span className="opacity-50">Azimut</span><span className="font-bold">{az}°</span></div>
                            <div className="flex justify-between"><span className="opacity-50">Radius</span><span className="font-mono font-bold">{Math.round(radius)}m</span></div>
                          </div>
                        </div>
                      </Tooltip>
                    </Polygon>
                  );
                })}
                {/* Site name label */}
                {shouldShowLabels && (
                  <Marker
                    position={site.coordinates}
                    icon={L.divIcon({
                      html: `<div style="width:6px;height:6px;"></div>`,
                      className: '',
                      iconSize: L.point(6, 6),
                      iconAnchor: L.point(3, 3),
                    })}
                    interactive={false}
                  >
                    <Tooltip direction="bottom" offset={[0, 4]} permanent className="site-name-label-clean">
                      <span style={{
                        fontSize: '8px',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        color: '#1a1a1a',
                        textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 1px 2px rgba(255,255,255,0.9)',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}>{buildSiteLabel(site, mapLabelFields)}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          /* ── 5G / 4G mode: detailed per-band sectors ── */
          // Pre-compute max 4G radius per azimuth for capping 5G
          const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
          const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
          const baseDetailCells = getRenderableCellsForSite(renderSiteForCells, mapTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno).filter(cellMatchesViewConditions);
          const detailCells = sectorColorMode === 'kpi'
            ? baseDetailCells.filter(cell => {
                const overlay = isCellVisibleForKpiOverlay(cell, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno, localTechno, localBande, kpiOverlayVendor, site.vendor);
                const legend = isCellVisibleForKpiLegend(cell, site.site_name || site.site_id || '');
                return overlay && legend;
              })
            : baseDetailCells;
          // Skip site entirely when KPI legend filter hides all its cells
          if (sectorColorMode === 'kpi' && hiddenKpiLevels.size > 0 && detailCells.length === 0) return null;
          const max4GRadiusPerAz = new Map<number, number>();
            const hasAny4G = detailCells.some(c => getCellTechGroup(c.techno) === '4G');
            const hasAny5G = detailCells.some(c => getCellTechGroup(c.techno) === '5G');
          if (hasAny4G && hasAny5G) {
            for (const c of detailCells) {
                if (getCellTechGroup(c.techno) !== '4G') continue;
              const az = Number(c.azimut);
              if (!Number.isFinite(az)) continue;
              const bk = normalizeBandKey(c.bande, c.techno);
              const r = zoomRadius * 1.3 * getBandSizeScale(bk);
              const cur = max4GRadiusPerAz.get(az) || 0;
              if (r > cur) max4GRadiusPerAz.set(az, r);
            }
          }
          return (
            <React.Fragment key={site.site_id}>
              {detailCells
                .sort((a, b) => {
                  const aKey = normalizeBandKey(a.bande, a.techno);
                  const bKey = normalizeBandKey(b.bande, b.techno);
                  return getBandRenderOrder(aKey) - getBandRenderOrder(bKey);
                })
                .map(cell => {
                const is5G = getCellTechGroup(cell.techno) === '5G';
                const bandKey = normalizeBandKey(cell.bande, cell.techno);
                const bandScale = getBandSizeScale(bandKey);
                let cellRadius = zoomRadius * 1.3 * bandScale;
                let az = Number(cell.azimut);
                if (!Number.isFinite(az) || az < 0 || az > 360) {
                  const sNum = getSectorNumber(cell.cell_id);
                  const heuristicAz = [0, 0, 120, 240];
                  az = heuristicAz[sNum] ?? ((sNum - 1) * 120) % 360;
                }
                // Cap 5G to 65% of 4G at same azimuth for mixed sites
                if (is5G && hasAny4G) {
                  const ref4G = max4GRadiusPerAz.get(az) || (zoomRadius * 1.3);
                  const cap = ref4G * 0.65;
                  if (cellRadius > cap) cellRadius = cap;
                }
                const sectorCoords = getSectorCoords(site.coordinates, az, cellRadius, 60);
                const isFaded = false; // cells already filtered by tech above
                const colorViewOverrideCell = getColorViewFill(site);
                const cellKpiValue = getCellKpiValue(cell, site.site_name || site.site_id);
                const fillColor = colorViewOverrideCell || (isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? getBandColor(cell.bande, cell.techno) : getKpiColor(cellKpiValue)));
                const strokeColor = isFocusFaded ? '#cbd5e1' : ((sectorColorMode as string) === 'topo' && !colorViewOverrideCell ? getBandStrokeColor(cell.bande, cell.techno) : deriveStrokeColor(fillColor));
                const isFocusCell = focusCellId === cell.cell_id;
                const isCellDimmed = focusMode === 'cell' && isSelectedSite && !isFocusCell;
                const baseOpacity = isFocusFaded ? 0.08 : (isFaded ? 0.08 : (isCellDimmed ? 0.15 : (is5G ? 0.45 : Math.min(0.4, overlapFactor)))); // PRO #2
                const strokeWeight = isFocusCell ? 2.5 : (isHovered ? 2 : 1.5); // PRO #3
                return (
                  <Polygon
                    key={cell.cell_id}
                    pane={is5G ? 'pane5G' : 'pane4G'}
                    positions={sectorCoords}
                    pathOptions={{
                      color: isFocusCell ? '#fff' : (isHovered ? '#fff' : strokeColor),
                      fillColor: fillColor,
                      fillOpacity: sectorColorMode === 'kpi' && !isFocusFaded && !isFaded && !isCellDimmed
                        ? Math.min(1, (isFocusCell || isHovered ? 1 : kpiOverlayIntensity) * kpiOverlayTransparency)
                        : Math.min(1, (isFocusCell ? 0.55 : (isHovered ? 0.5 : baseOpacity)) * (isFocusCell || isHovered ? 1 : siteOpacityScale) * (isFocusCell || isHovered ? 1 : Math.max(0, (beamVisibility / 100) * 2.2))),
                      weight: strokeWeight,
                      opacity: isFocusCell ? 1 : (isHovered ? 1 : (isFocusFaded ? 0.25 : (isFaded ? 0.3 : 0.9))),
                    }}
                    eventHandlers={{
                      click: () => {
                        if (isSelectedSite) {
                          handleCellClick(cell.cell_id);
                        } else {
                          handleSiteClick(site);
                        }
                      },
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} permanent={false} sticky className="sector-tooltip">
                      <div className="px-3 py-2 min-w-[150px]">
                        <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: fillColor }}>{cell.cell_id}</div>
                        <div className="text-[9px] opacity-60 font-mono mt-0.5">{site.site_name} · {site.site_id}</div>
                        <div className="mt-1.5 space-y-0.5 text-[10px]">
                          <div className="flex justify-between"><span className="opacity-50">Techno</span><span className="font-bold">{cell.techno}</span></div>
                          <div className="flex justify-between"><span className="opacity-50">Band</span><span className="font-bold">{cell.bande}</span></div>
                          <div className="flex justify-between"><span className="opacity-50">Azimut</span><span className="font-bold">{cell.azimut}°</span></div>
                          <div className="flex justify-between"><span className="opacity-50">Tilt</span><span className="font-bold">{cell.tilt ?? '—'}°</span></div>
                          <div className="flex justify-between"><span className="opacity-50">HBA</span><span className="font-bold">{cell.hba ?? '—'} m</span></div>
                        </div>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              })}
              {/* Small invisible click target + labels (no antenna icon) */}
              <Marker
                position={site.coordinates}
                icon={L.divIcon({
                  html: `<div style="width:6px;height:6px;"></div>`,
                  className: '',
                  iconSize: L.point(6, 6),
                  iconAnchor: L.point(3, 3),
                })}
                eventHandlers={{
                  click: () => handleSiteClick(site),
                  mouseover: () => setHoveredSiteId(site.site_id),
                  mouseout: () => setHoveredSiteId(null),
                }}
              >
                {shouldShowLabels && (
                  <Tooltip direction="bottom" offset={[0, 4]} permanent className="site-name-label-clean">
                    <span style={{
                      fontSize: '8px',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      color: '#1a1a1a',
                      textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 1px 2px rgba(255,255,255,0.9)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}>{buildSiteLabel(site, mapLabelFields)}</span>
                  </Tooltip>
                )}
                <Popup>
                  <div className="p-1">
                    <div className="font-bold text-sm">{site.site_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor}</div>
                    <div className="text-xs mt-1">{site.cell_count} cells • {site.dor}</div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Highlighted worst cells markers */}
        {sectorColorMode !== 'topo' && highlightedCellData.length > 0 && (
          <>
            <FitHighlightBounds coords={highlightedCellData.map(h => [h.lat, h.lng] as [number, number])} />
            {highlightedCellData.map((h, i) => {
              const val = getCellKpiValue(h.cell);
              const color = getKpiColor(val);
              return (
                <CircleMarker
                  key={`highlight-${h.cell.cell_id}`}
                  center={[h.lat, h.lng]}
                  radius={12}
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: color,
                    fillOpacity: 0.9,
                    weight: 3,
                  }}
                >
                  <Tooltip direction="right" offset={[12, 0]} permanent className="cell-kpi-label">
                    <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '11px' }}>#{i + 1} {(val ?? 0).toFixed(1)}</span>
                  </Tooltip>
                  <Popup>
                    <div className="p-1 min-w-[180px]">
                      <div className="font-bold text-sm text-red-600">⚠️ Worst #{i + 1}</div>
                      <div className="font-bold text-sm mt-1">{h.site.site_name}</div>
                      <div className="text-xs text-gray-500">{h.cell.cell_id}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{h.cell.techno} • {h.cell.bande} MHz • {h.cell.azimut}°</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs"><span>QoE</span><span className="font-bold" style={{ color: getKpiColor(h.cell.qoe_score_avg) }}>{(h.cell.qoe_score_avg ?? 0).toFixed(1)}%</span></div>
                        <div className="flex justify-between text-xs"><span>Débit DL</span><span className="font-bold">{(h.cell.p50_thr_dn_mbps ?? 0).toFixed(1)} Mbps</span></div>
                        <div className="flex justify-between text-xs"><span>RTT P95</span><span className="font-bold">{(h.cell.p95_rtt_ms ?? 0).toFixed(0)} ms</span></div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </>
        )}
        {/* LOS line + target marker */}
        {losTargetPoint && (
          <Marker position={[losTargetPoint.lat, losTargetPoint.lng]} icon={losTargetIcon} />
        )}
        {losSelectedCell && losTargetPoint && (
          <Polyline
            positions={[[losSelectedCell.lat, losSelectedCell.lng], [losTargetPoint.lat, losTargetPoint.lng]]}
            color="hsl(0,84%,60%)" weight={2} dashArray="8 4"
          />
        )}
        {/* Tagged Link polylines */}
        {taggedLinks.map(link => (
          <Polyline
            key={link.id}
            positions={[link.fromCoords, link.toCoords]}
            color={selectedLinkId === link.id ? '#3498DB' : '#6366f1'}
            weight={selectedLinkId === link.id ? 3 : 2}
            opacity={0.8}
            dashArray={selectedLinkId === link.id ? undefined : '6 4'}
            eventHandlers={{
              click: () => setSelectedLinkId(link.id),
            }}
          >
            <Tooltip direction="center" permanent={false}>
              <span className="text-xs font-bold">{link.label}</span>
            </Tooltip>
          </Polyline>
        ))}
        {/* Hover marker on link profile */}
        {linkProfileHover && showLinkProfile && (
          <CircleMarker
            center={[linkProfileHover.lat, linkProfileHover.lng]}
            radius={8}
            pathOptions={{ color: '#fff', fillColor: '#f43f5e', fillOpacity: 1, weight: 3 }}
          >
            <Tooltip direction="top" permanent>
              <span className="text-[10px] font-bold">
                {linkProfileHover.distanceKm.toFixed(2)} km — {linkProfileHover.elevationM.toFixed(0)} m
              </span>
            </Tooltip>
          </CircleMarker>
        )}
        {/* Hover marker on measurement profile */}
        {measProfileHover && showMeasProfile && (
          <CircleMarker
            center={[measProfileHover.lat, measProfileHover.lng]}
            radius={8}
            pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 3 }}
          >
            <Tooltip direction="top" permanent>
              <span className="text-[10px] font-bold">
                {measProfileHover.distanceKm.toFixed(2)} km — {measProfileHover.elevationM.toFixed(0)} m
              </span>
            </Tooltip>
          </CircleMarker>
        )}
        {/* Neighbor visualization lines */}
        {showNeighborPanel && neighborData.filter(n => n.relationDirection === neighborDirection).map((n, i) => {
          const sourceCell = siteDetail?.cells.find(c => c.cell_id === neighborCellId);
          const sourceCoords = siteDetail?.coordinates;
          if (!sourceCoords) return null;
          return (
            <Polyline
              key={`nb-${i}`}
              positions={[sourceCoords, n.targetCoords]}
              color={NEIGHBOR_COLORS[n.relationType]}
              weight={2}
              opacity={0.7}
            >
              <Tooltip direction="center" permanent={false}>
                <span className="text-xs">{n.targetCellId} ({NEIGHBOR_LABELS[n.relationType]})</span>
              </Tooltip>
            </Polyline>
          );
        })}
        {/* Coverage simulation overlay */}
        <CoverageCanvasOverlay grid={coverageGrid} opacity={0.55} visible={!!coverageGrid} />

        {/* Coverage RSRP "par Bande" popup — historically auto-opened when
            activeViewType === 'coverage'. Since 2026-05-11 the 'coverage'
            view type was repurposed for Visual Coverage (Voronoi dominance,
            no RF), so showing the RSRP simulator on activation was wrong.
            Now only opens if a simulation has actually been triggered
            (i.e. `coverageGrid` is populated). */}
        {!paramMode && !paramPanelOpen && !!coverageGrid && (
          <div className="absolute z-[1001] pointer-events-auto" style={{ bottom: 80, left: (panelCollapsed ? 56 : 400) + 16 }}>
            <div className="rounded-2xl border border-border/60 shadow-xl p-3" style={{ background: 'hsl(var(--card) / 0.92)', backdropFilter: 'blur(20px)', minWidth: 260 }}>
              <BatchCoveragePanel
                sites={renderSites}
                onSimulate={handleCoverageSimulate}
                onClear={handleCoverageClear}
                isActive={!!coverageGrid}
              />
            </div>
          </div>
        )}

        {/* Tilt visualization overlay for selected site */}
        {showTiltOverlay && selectedSiteId && (() => {
          const selectedSite = sites.find(s => s.site_id === selectedSiteId);
          return selectedSite ? <TiltOverlay site={selectedSite} visible={true} /> : null;
        })()}
      </MapContainer>

      {/* 2026-05-11 revert: the floating mount point for the drop-in
          module's gradient legend was removed. The legacy per-sector
          legend (above) is now the only KPI legend on the map. */}

      {/* Coverage simulation overlay kept in right panel only */}

      {/* ── Polygon → Cluster save dialog ── */}
      <Dialog open={showClusterPrompt} onOpenChange={(o) => {
        setShowClusterPrompt(o);
        if (!o) {
          setClusterStep('ask');
          setClusterName('');
          setClusterDescription('');
          setClusterSaveError(null);
        }
      }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {clusterStep === 'ask' ? 'Create cluster from polygon?' : 'Name your cluster'}
            </DialogTitle>
            <DialogDescription>
              {polygonStats ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                    {polygonStats.sitesInside} sites
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-semibold">
                    {polygonStats.cellsInside} cells
                  </span>
                  <span className="text-muted-foreground">{polygonStats.fmtArea}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{polygonStats.fmtPerimeter}</span>
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {clusterStep === 'ask' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Save the {polygonStats?.sitesInside ?? 0} sites enclosed by this polygon as a reusable cluster.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowClusterPrompt(false)}>
                  Not now
                </Button>
                <Button
                  onClick={() => setClusterStep('name')}
                  disabled={!polygonStats || polygonStats.sitesInside === 0}
                >
                  Yes, create cluster
                </Button>
              </div>
            </div>
          )}

          {clusterStep === 'name' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cluster-name" className="text-xs">Cluster name</Label>
                <Input
                  id="cluster-name"
                  autoFocus
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="e.g. North Paris coverage zone"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cluster-desc" className="text-xs">Description (optional)</Label>
                <Textarea
                  id="cluster-desc"
                  value={clusterDescription}
                  onChange={(e) => setClusterDescription(e.target.value)}
                  placeholder="Short description of this cluster"
                  rows={2}
                />
              </div>

              {/* Preview list (first sites) */}
              {polygonStats && polygonStats.siteNamesInside.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-2 max-h-28 overflow-y-auto text-[11px] font-mono text-muted-foreground">
                  {polygonStats.siteNamesInside.slice(0, 12).join(', ')}
                  {polygonStats.siteNamesInside.length > 12 && ` … +${polygonStats.siteNamesInside.length - 12} more`}
                </div>
              )}

              {clusterSaveError && (
                <p className="text-xs text-destructive">{clusterSaveError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowClusterPrompt(false)} disabled={savingCluster}>
                  Cancel
                </Button>
                <Button
                  disabled={!clusterName.trim() || savingCluster || !polygonStats}
                  onClick={async () => {
                    if (!polygonStats) return;
                    setSavingCluster(true);
                    setClusterSaveError(null);
                    try {
                      await createFilter({
                        name: clusterName.trim(),
                        description: clusterDescription.trim() || `Polygon cluster · ${polygonStats.sitesInside} sites · ${polygonStats.fmtArea}`,
                        status: 'active',
                        topology: [
                          { dimension: 'sites', operator: 'in', values: polygonStats.siteIdsInside.length > 0 ? polygonStats.siteIdsInside : polygonStats.siteNamesInside },
                        ],
                        parameters: [],
                        logic: 'AND',
                      });
                      setShowClusterPrompt(false);
                      setClusterStep('ask');
                      setClusterName('');
                      setClusterDescription('');
                      // Clear polygon after successful save
                      setPolygonPoints([]);
                      setPolygonClosed(false);
                      setActiveMapTool(null);
                    } catch (err: any) {
                      setClusterSaveError(err?.message || 'Failed to save cluster');
                    } finally {
                      setSavingCluster(false);
                    }
                  }}
                >
                  {savingCluster ? 'Saving…' : 'Save cluster'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* LOS Drawing mode banner */}
      {losDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-pulse pointer-events-auto">
          <MousePointerClick className="w-4 h-4" />
          Cliquez sur la carte pour définir le point cible LOS
          <button onClick={() => { setLosDrawingMode(false); }} className="ml-3 px-2 py-0.5 bg-primary-foreground/20 rounded-lg text-xs font-bold hover:bg-primary-foreground/30 transition-colors">
            Annuler
          </button>
        </div>
      )}

      {/* Point creation mode banner */}
      {pointCreationMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-violet-600 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-pulse pointer-events-auto">
          <CircleDot className="w-4 h-4" />
          Cliquez sur la carte pour placer un point
          <button onClick={() => setPointCreationMode(false)} className="ml-3 px-2 py-0.5 bg-white/20 rounded-lg text-xs font-bold hover:bg-white/30 transition-colors">
            Annuler
          </button>
        </div>
      )}


      {showLosPanel && losAnalysis && !losLoading && (
        <div
           className="absolute bottom-4 z-[1001] overflow-hidden pointer-events-auto max-h-[48%] flex flex-col animate-fade-in"
          style={{
            left: (panelCollapsed ? 56 : 400) + 16,
            right: (showRightPanel && !detailFullscreen ? 540 : 0) + 16,
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Header — translucent */}
          <div
            className="flex items-center justify-between px-6 py-3.5 shrink-0"
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(56,189,248,0.12)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  boxShadow: '0 0 16px rgba(56,189,248,0.08)',
                }}
              >
                <Radio className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-white/90 uppercase tracking-[0.12em]">Profil Radio</h3>
                <p className="text-[9px] text-white/40 font-semibold mt-0.5">
                  {losSelectedCell?.name} • {losSelectedCell?.techno} • {losSelectedCell?.bande} MHz • Az: {losSelectedCell?.azimuth}° • HBA: {losSelectedCell?.hba}m
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* RF Toggles — glass pills */}
              <div className="flex items-center gap-2.5 mr-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                  style={{
                    background: losEnableCurvature ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Switch checked={losEnableCurvature} onCheckedChange={(v) => { setLosEnableCurvature(v); }} />
                  <Label className="text-[10px] text-white/60">k=4/3</Label>
                </div>
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                  style={{
                    background: losEnableFresnel ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Switch checked={losEnableFresnel} onCheckedChange={setLosEnableFresnel} />
                  <Label className="text-[10px] text-white/60">Fresnel</Label>
                </div>
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                  style={{
                    background: losEnableClutter ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Switch checked={losEnableClutter} onCheckedChange={(v) => {
                    setLosEnableClutter(v);
                    if (!v) setLosClutterHeight(0);
                    else setLosClutterHeight(10);
                  }} />
                  <Label className="text-[10px] text-white/60">Clutter</Label>
                </div>
                {losEnableClutter && (
                  <div className="flex items-center gap-1.5">
                    <input type="range" min="0" max="30" step="1" value={losClutterHeight}
                      onChange={e => setLosClutterHeight(Number(e.target.value))}
                      className="w-14 accent-sky-400" />
                    <span className="text-[9px] font-mono text-white/50">{losClutterHeight}m</span>
                  </div>
                )}
              </div>
              <button onClick={handleLosRecompute}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Settings2 className="w-3 h-3" />
                Recalculer
              </button>
              <button onClick={() => { if (siteDetail) handleStartLosDrawing(siteDetail); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(56,189,248,0.15)',
                  border: '1px solid rgba(56,189,248,0.25)',
                  color: 'rgba(56,189,248,0.95)',
                  boxShadow: '0 0 12px rgba(56,189,248,0.08)',
                }}
              >
                <Crosshair className="w-3 h-3" />
                Nouveau
              </button>
              <button onClick={handleCloseLos}
                className="p-2 rounded-xl transition-all duration-200 hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 flex gap-5">
            {/* Chart */}
            <div className="flex-1 h-[680px] min-w-0">
              <ProfileChart
                profilePoints={losProfilePoints}
                analysis={losAnalysis}
                fresnel={losFresnel}
                showFresnel={losEnableFresnel}
                showCurvature={losEnableCurvature}
                clutterHeight={losEnableClutter ? losClutterHeight : 0}
                showTilt
                siteName={siteDetail?.site_name}
              />
            </div>
            {/* Info panel */}
            <div className="w-[300px] shrink-0 overflow-y-auto pr-1">
              <InfoPanel
                analysis={losAnalysis}
                totalDistance={losTotalDistance}
                enableCurvature={losEnableCurvature}
                fresnel={losFresnel}
              />
            </div>
          </div>
        </div>
      )}

      {/* LOS Loading indicator */}
      {losLoading && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1001] px-6 py-3.5 flex items-center gap-3 pointer-events-auto animate-fade-in"
          style={{
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
          <span className="text-xs font-bold text-white/80">Calcul du profil terrain...</span>
        </div>
      )}

      {/* ── Link Terrain Profile Panel ── */}
      {/* Stay visible whenever the user has opened a link/coverage profile.
          The chart slot below decides what to render based on mode + state
          (loading spinner, error banner, ProfileChart, or CoverageProfile)
          so the frame doesn't flash open then disappear when the elevation
          API hiccups or the analysis can't be computed. */}
      {showLinkProfile && (
        <div
          className="absolute bottom-4 z-[1001] overflow-hidden pointer-events-auto flex flex-col animate-fade-in"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            width: '78%',
            maxWidth: '1450px',
            height: 'min(620px, 70vh)',
            minHeight: '520px',
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Network size={16} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight">{linkProfileLabel}</h3>
                {(activeTaggedLink?.fromSector || activeTaggedLink?.toSector) && (
                  <p className="text-[10px] text-emerald-300/90 font-mono truncate max-w-[640px]">
                    {activeTaggedLink?.fromSector
                      ? `TX: ${activeTaggedLink.fromSector.cell_id}${activeTaggedLink.fromSector.bande ? ` (${activeTaggedLink.fromSector.bande})` : ''}${Number.isFinite(activeTaggedLink.fromSector.azimut as number) ? ` · Az ${Math.round(Number(activeTaggedLink.fromSector.azimut))}°` : ''}`
                      : 'TX: Point'}
                    {' · '}
                    {activeTaggedLink?.toSector
                      ? `RX: ${activeTaggedLink.toSector.cell_id}${activeTaggedLink.toSector.bande ? ` (${activeTaggedLink.toSector.bande})` : ''}${Number.isFinite(activeTaggedLink.toSector.azimut as number) ? ` · Az ${Math.round(Number(activeTaggedLink.toSector.azimut))}°` : ''}`
                      : 'RX: Point'}
                  </p>
                )}
                {activeTaggedLink && (() => {
                  const lb = Math.round(bearing({ lat: activeTaggedLink.fromCoords[0], lng: activeTaggedLink.fromCoords[1] }, { lat: activeTaggedLink.toCoords[0], lng: activeTaggedLink.toCoords[1] }));
                  const txAz = Number(activeTaggedLink.fromSector?.azimut);
                  const rxAz = Number(activeTaggedLink.toSector?.azimut);
                  const dAng = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
                  const txD = Number.isFinite(txAz) ? dAng(txAz, lb) : null;
                  const rxD = Number.isFinite(rxAz) ? dAng(rxAz, (lb + 180) % 360) : null;
                  const cls = (d: number) => d <= 30 ? 'text-emerald-300' : d <= 60 ? 'text-amber-300' : 'text-red-300';
                  return (
                    <p className="text-[10px] text-cyan-300/90 font-mono">
                      Bearing <span className="text-white font-bold tabular-nums">{lb}°</span>
                      {txD != null && <> · ΔAz TX <span className={`font-bold tabular-nums ${cls(txD)}`}>{txD.toFixed(1)}°</span></>}
                      {rxD != null && <> · ΔAz RX <span className={`font-bold tabular-nums ${cls(rxD)}`}>{rxD.toFixed(1)}°</span></>}
                    </p>
                  );
                })()}
                <p className="text-[10px] text-white/40">Profil terrain du lien · {linkTotalDistance > 0 ? (linkTotalDistance / 1000).toFixed(2) + ' km' : ''}</p>
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Mode toggle: site-to-site microwave (Link) vs antenna-to-ground (Coverage) */}
              <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-0.5">
                <button
                  onClick={() => setLinkProfileMode('link')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    linkProfileMode === 'link'
                      ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  Link Profile
                </button>
                <button
                  onClick={() => setLinkProfileMode('coverage')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    linkProfileMode === 'coverage'
                      ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  Coverage Profile
                </button>
              </div>
              {/* Link-mode controls (curvature/Fresnel/clutter) — hidden in Coverage mode */}
              {linkProfileMode === 'link' && (
                <>
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                    style={{
                      background: linkEnableCurvature ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Switch checked={linkEnableCurvature} onCheckedChange={(v) => {
                      setLinkEnableCurvature(v);
                      if (linkActiveCoords) recomputeLinkProfile(linkActiveCoords, v, activeTaggedLink ?? undefined);
                    }} />
                    <Label className="text-[10px] text-white/60">k=4/3</Label>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                    style={{
                      background: linkEnableFresnel ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Switch checked={linkEnableFresnel} onCheckedChange={setLinkEnableFresnel} />
                    <Label className="text-[10px] text-white/60">Fresnel</Label>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                    style={{
                      background: linkEnableClutter ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Switch checked={linkEnableClutter} onCheckedChange={(v) => {
                      setLinkEnableClutter(v);
                      if (!v) setLinkClutterHeight(0);
                      else setLinkClutterHeight(10);
                    }} />
                    <Label className="text-[10px] text-white/60">Clutter</Label>
                  </div>
                  {linkEnableClutter && (
                    <div className="flex items-center gap-1.5">
                      <input type="range" min="0" max="30" step="1" value={linkClutterHeight}
                        onChange={e => setLinkClutterHeight(Number(e.target.value))}
                        className="w-14 accent-sky-400" />
                      <span className="text-[9px] font-mono text-white/50">{linkClutterHeight}m</span>
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors" title="Détails techniques">
                        <Info size={16} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="end" className="w-[320px] p-0 border-white/10 bg-slate-900/95 backdrop-blur-xl">
                      <InfoPanel
                        analysis={linkProfileAnalysis}
                        totalDistance={linkTotalDistance}
                        enableCurvature={linkEnableCurvature}
                        fresnel={linkFresnel}
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}
              <button
                onClick={() => { setShowLinkProfile(false); setSelectedLinkId(null); setLinkProfileHover(null); setLinkActiveCoords(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {/* Content — chart fills available space; no scroll bar */}
          <div className="flex-1 overflow-hidden px-5 pb-4 min-h-0">
            {/* Chart — full width / full height */}
            <div className="h-full min-h-0 min-w-0">
              {linkProfileMode === 'link' ? (
                linkProfileLoading ? (
                  <div className="h-full flex items-center justify-center text-white/60 text-xs gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                    Calcul du profil terrain…
                  </div>
                ) : linkProfileAnalysis ? (
                  <ProfileChart
                    profilePoints={linkProfilePoints}
                    analysis={linkProfileAnalysis}
                    fresnel={linkFresnel}
                    showFresnel={linkEnableFresnel}
                    showCurvature={linkEnableCurvature}
                    clutterHeight={linkEnableClutter ? linkClutterHeight : 0}
                    onHoverPoint={setLinkProfileHover}
                    showTilt
                    remoteAntenna={{ hba: activeTaggedLink?.toType === 'point' ? 2 : 30, totalTilt: 2, vbw: 7, azimuth: 0 }}
                    siteName={linkProfileLabel}
                    txIsPoint={activeTaggedLink?.fromType === 'point'}
                    rxIsPoint={activeTaggedLink?.toType === 'point'}
                    txCellName={activeTaggedLink?.fromSector?.cell_id || undefined}
                    rxCellName={activeTaggedLink?.toSector?.cell_id || undefined}
                    txBand={(activeTaggedLink?.fromSector as any)?.bande || (activeTaggedLink?.fromSector as any)?.band || undefined}
                    rxBand={(activeTaggedLink?.toSector as any)?.bande || (activeTaggedLink?.toSector as any)?.band || undefined}
                    txAzimuth={Number.isFinite(activeTaggedLink?.fromSector?.azimut as number) ? Number(activeTaggedLink?.fromSector?.azimut) : null}
                    rxAzimuth={Number.isFinite(activeTaggedLink?.toSector?.azimut as number) ? Number(activeTaggedLink?.toSector?.azimut) : null}
                    linkBearing={activeTaggedLink ? Math.round(bearing({ lat: activeTaggedLink.fromCoords[0], lng: activeTaggedLink.fromCoords[1] }, { lat: activeTaggedLink.toCoords[0], lng: activeTaggedLink.toCoords[1] })) : null}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-xs gap-2">
                    <span className="text-red-300 font-bold">
                      {linkProfileError ? `Erreur: ${linkProfileError}` : 'Aucune donnée de terrain'}
                    </span>
                    <button
                      onClick={() => linkActiveCoords && recomputeLinkProfile(linkActiveCoords, linkEnableCurvature, activeTaggedLink ?? undefined)}
                      className="px-3 py-1 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 hover:bg-sky-500/30"
                    >
                      Réessayer
                    </button>
                    <span className="text-white/40">Vous pouvez aussi passer en mode Coverage Profile.</span>
                  </div>
                )
              ) : (
                (() => {
                  // Coverage mode: each antenna covers the ground around its OWN
                  // site. We render Site A from the currently-selected site, and,
                  // when the link references a second site, we resolve it from
                  // the loaded sites list and render its independent ground
                  // coverage. We deliberately do NOT pass any link line / LOS /
                  // Fresnel between the two — Coverage Profile is antenna-to-
                  // ground only.
                  // Prefer the user-selected sector (focusCellId) so footer values
                  // mirror the "Selected sector" panel. Fallback to first cell with azimut.
                  const cellA = (focusCellId ? siteDetail?.cells?.find(c => c.cell_id === focusCellId) : null)
                    || siteDetail?.cells?.find(c => c.azimut != null)
                    || siteDetail?.cells?.[0];
                  const rawHbaA = (cellA as any)?.hba ?? null;
                  const antennaH_A = Number(rawHbaA ?? 30) || 30;
                  const rawTiltA = (cellA as any)?.tilt ?? null;
                  const tiltA = Number(rawTiltA ?? 0);
                  const azA = Number(cellA?.azimut ?? 0);
                  const baseAmslA = linkProfileAnalysis?.effectiveTerrain?.[0] ?? 0;
                  const coverageTargetBearing = linkActiveCoords
                    ? Math.round(bearing(
                        { lat: linkActiveCoords.from[0], lng: linkActiveCoords.from[1] },
                        { lat: linkActiveCoords.to[0], lng: linkActiveCoords.to[1] },
                      ) * 10) / 10
                    : null;

                  // Try to resolve Site B from linkActiveCoords.to against the
                  // loaded site list (match by coordinates with small tolerance).
                  let siteB: any = undefined;
                  if (linkActiveCoords) {
                    const [tLat, tLng] = linkActiveCoords.to;
                    const eps = 1e-4;
                    const matchB = sites.find(s =>
                      s.coordinates &&
                      Math.abs(s.coordinates[0] - tLat) < eps &&
                      Math.abs(s.coordinates[1] - tLng) < eps
                    );
                    if (matchB) {
                      const cellB = matchB.cells?.find((c: any) => c.azimut != null) || matchB.cells?.[0];
                      const baseAmslB = linkProfileAnalysis?.effectiveTerrain?.[
                        (linkProfileAnalysis.effectiveTerrain.length - 1)
                      ] ?? 0;
                      siteB = {
                        siteName: matchB.site_name,
                        sectorName: cellB?.cell_id,
                        azimut: Number(cellB?.azimut ?? 180),
                        antennaHeight: Number((cellB as any)?.hba ?? 30) || 30,
                        mechanicalTilt: Number((cellB as any)?.tilt ?? 0),
                        electricalTilt: 0,
                        band: cellB?.bande || 'LTE1800',
                        techno: cellB?.techno || '4G',
                        siteAltitudeAmsl: baseAmslB,
                        rawTilt: (cellB as any)?.tilt ?? null,
                      };
                    }
                  }

                  return (
                    <CoverageProfile
                      siteName={siteDetail?.site_name || (linkProfileLabel || '').split('↔')[0].split('--')[0].trim() || linkProfileLabel}
                      sectorName={cellA?.cell_id}
                      azimut={azA}
                      antennaHeight={antennaH_A}
                      mechanicalTilt={tiltA}
                      electricalTilt={0}
                      band={cellA?.bande || 'LTE1800'}
                      techno={cellA?.techno || '4G'}
                      siteAltitudeAmsl={baseAmslA}
                      // Terrain is intentionally NOT passed here when siteB is
                      // present: the link terrain spans Site A → Site B and
                      // would visually re-introduce a site-to-site relationship.
                      // Each chart shows its own local ground instead.
                      terrainProfile={!siteB && linkProfilePoints && linkProfilePoints.length > 0 ? linkProfilePoints : undefined}
                      showClutter={linkEnableClutter}
                      clutterHeight={linkClutterHeight}
                      siteB={siteB}
                      onHoverPoint={setLinkProfileHover}
                      targetBearing={coverageTargetBearing}
                      rawHba={rawHbaA}
                      rawTilt={rawTiltA}
                    />
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Measurement Terrain Profile Panel ── */}
      {showMeasProfile && measProfileAnalysis && !measProfileLoading && (
        <div
          className="absolute bottom-4 z-[1001] overflow-hidden pointer-events-auto max-h-[44%] flex flex-col animate-fade-in"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            width: '62%',
            maxWidth: '1180px',
            minHeight: '380px',
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Mountain size={16} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight">{measProfileLabel}</h3>
                <p className="text-[10px] text-white/40">Profil terrain de la mesure · {measTotalDistance > 0 ? (measTotalDistance / 1000).toFixed(2) + ' km' : ''}</p>
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{
                  background: measEnableCurvature ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Switch checked={measEnableCurvature} onCheckedChange={(v) => {
                  setMeasEnableCurvature(v);
                  if (measActiveCoords) recomputeMeasProfile(measActiveCoords, v);
                }} />
                <Label className="text-[10px] text-white/60">k=4/3</Label>
              </div>
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{
                  background: measEnableFresnel ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Switch checked={measEnableFresnel} onCheckedChange={setMeasEnableFresnel} />
                <Label className="text-[10px] text-white/60">Fresnel</Label>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors" title="Détails techniques">
                    <Info size={16} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-[320px] p-0 border-white/10 bg-slate-900/95 backdrop-blur-xl">
                  <InfoPanel
                    analysis={measProfileAnalysis}
                    totalDistance={measTotalDistance}
                    enableCurvature={measEnableCurvature}
                    fresnel={measFresnel}
                  />
                </PopoverContent>
              </Popover>
              <button
                onClick={() => { setShowMeasProfile(false); setMeasProfileHover(null); setMeasActiveCoords(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {/* Content — chart fills available space; no scroll bar */}
          <div className="flex-1 overflow-hidden px-5 pb-4 min-h-0">
            {/* Chart — full width / full height */}
            <div className="h-full min-h-0 min-w-0">
              <ProfileChart
                profilePoints={measProfilePoints}
                analysis={measProfileAnalysis}
                fresnel={measFresnel}
                showFresnel={measEnableFresnel}
                showCurvature={measEnableCurvature}
                clutterHeight={0}
                onHoverPoint={setMeasProfileHover}
                showTilt={false}
                siteName={measProfileLabel}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating worst cells panel */}
      {highlightedCellData.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <div className="bg-card/95 backdrop-blur-sm border-2 border-destructive/40 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
            <span className="text-destructive font-black text-xs">⚠️ Top {highlightedCellData.length} Worst Cells</span>
            <span className="w-px h-5 bg-border" />
            <span className="text-[10px] font-bold text-muted-foreground">{selectedKpiLabel}</span>
            {onClearHighlights && (
              <button onClick={onClearHighlights} className="ml-2 px-3 py-1 rounded-lg bg-muted hover:bg-destructive/10 text-xs font-bold text-muted-foreground hover:text-destructive transition-all">
                ✕ Fermer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Map controls removed — moved into legend group below */}

      {/* Parameter mode — value legend + info badge */}
      {paramMode && (
        <>
          {/* Value legend */}
          {paramUniqueValues.length > 0 && showParamLegend && (
            <div className="absolute z-[1000] pointer-events-auto bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-xl max-h-[320px] overflow-hidden transition-all duration-300 flex flex-col" style={{ left: (panelCollapsed ? 56 : 400) + 16 + 96, bottom: 24, minWidth: 240 }}>
              {/* Prominent param header */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/40 bg-gradient-to-r from-primary/10 to-transparent">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Settings2 size={14} className="text-primary shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Paramètre</span>
                    <span className="text-[13px] font-black text-foreground leading-tight mt-1 break-all" title={paramConfirmed ?? undefined}>{paramConfirmed}</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground shrink-0 px-2 py-0.5 rounded-md bg-muted/60 self-start">{paramSiteMarkers.length} sites</span>
              </div>
              <div className="p-3 overflow-y-auto">
              {/* Numeric gradient bar */}
              {paramNumericStats && (
                <div className="mb-2 space-y-1">
                  <div className="h-3 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0,78%,48%), hsl(70,90%,55%), hsl(140,78%,45%))' }} />
                  <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                    <span>{paramNumericStats.min}</span>
                    <span>{paramNumericStats.max}</span>
                  </div>
                </div>
              )}
              {paramSiteMarkers.some(s => s.isMultiValue) && (
                <div className="flex items-center gap-2 text-[10px] mb-1 text-orange-500 font-semibold">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #ef4444)' }} />
                  <span>Multi-valeur ({paramSiteMarkers.filter(s => s.isMultiValue).length} sites)</span>
                </div>
              )}
              {/* Value list (categorical or numeric) */}
              {paramUniqueValues.length <= 30 && (
                <div className="space-y-0.5">
                  {paramUniqueValues.map(v => {
                    const count = paramSiteMarkers.filter(s => s.distinctValues.includes(v)).length;
                    return (
                      <div key={v} className="flex items-center gap-2 text-[10px]">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: paramValueColor(v === '(vide)' ? null : v) }} />
                        <span className="truncate max-w-[110px]">{v}</span>
                        <span className="ml-auto text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {paramUniqueValues.length > 30 && (
                <div className="text-[10px] text-muted-foreground italic">{paramUniqueValues.length} valeurs distinctes</div>
              )}
              </div>
            </div>
          )}
          {/* Param loading indicator */}
          {paramLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-[1001] pointer-events-none">
              <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs font-bold text-foreground">Chargement des paramètres...</span>
              </div>
            </div>
          )}
          {/* Empty state — no points with coordinates */}
          {!paramLoading && paramPoints.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-[1001] pointer-events-none">
              <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl px-6 py-4 flex flex-col items-center gap-2 shadow-xl max-w-[320px]">
                <MapPin className="w-8 h-8 text-muted-foreground/40" />
                <span className="text-xs font-bold text-foreground text-center">Aucun point avec coordonnées</span>
                <span className="text-[10px] text-muted-foreground text-center">Le paramètre « {paramConfirmed} » n'a pas d'entités avec latitude/longitude renseignées.</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tool usage hint */}
      {activeMapTool && (
        <div className="absolute bottom-14 z-[1001] pointer-events-none transition-all duration-300" style={{ left: `calc(${panelCollapsed ? 56 : 400}px + (100% - ${panelCollapsed ? 56 : 400}px - ${showRightPanel && !detailFullscreen ? 540 : 0}px) / 2)`, transform: 'translateX(-50%)' }}>
          <div className="bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-md px-3 py-1 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
            {activeMapTool === 'distance' && '📏 Cliquez 2 points pour mesurer la distance'}
            {activeMapTool === 'polygon' && (polygonClosed ? '✅ Polygone fermé — cliquez le tool pour réinitialiser' : '🔷 Cliquez pour ajouter des points, double-clic pour fermer')}
            {activeMapTool === 'radius' && (!radiusCenter ? '🎯 Cliquez pour placer le centre' : !radiusConfirmed ? '🎯 Déplacez la souris et cliquez pour fixer le rayon' : '✅ Rayon fixé — cliquez pour recommencer')}
            {activeMapTool === 'profile' && (profileTarget ? '✅ Profil calculé — cliquez ailleurs pour recalculer' : '⛰️ Cliquez sur la carte pour tracer le profil terrain')}
            {activeMapTool === 'zoomarea' && '🔍 Cliquez et glissez pour sélectionner la zone de zoom — ESC pour annuler'}
          </div>
        </div>
      )}

      {/* Floating status bar — minimal GIS style, centered on map */}
      <div className="absolute bottom-4 z-[1000] pointer-events-auto transition-all duration-300" style={{ left: `calc(${panelCollapsed ? 56 : 400}px + (100% - ${panelCollapsed ? 56 : 400}px - ${showRightPanel && !detailFullscreen ? 540 : 0}px) / 2)`, transform: 'translateX(-50%)' }}>
        <div className="bg-card/90 backdrop-blur-md border border-border/60 rounded-full shadow-lg px-6 py-3 flex items-center gap-2">
          {paramMode ? (
            <>
              <div className="flex items-center gap-2 px-3">
                <span className="text-sm font-medium text-muted-foreground">Param</span>
                <span className="text-base font-bold text-primary">{paramConfirmed}</span>
              </div>
              <span className="w-px h-6 bg-border/60" />
              <div className="flex items-center gap-2 px-3">
                <span className="text-sm font-medium text-muted-foreground">Sites</span>
                <span className="text-base font-bold text-foreground">{paramSiteMarkers.length}</span>
              </div>
              <span className="w-px h-6 bg-border/60" />
              <button
                onClick={() => setShowParamLegend(v => !v)}
                title={showParamLegend ? 'Cacher la légende paramètre' : 'Afficher la légende paramètre'}
                aria-pressed={showParamLegend}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                  showParamLegend
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Palette size={14} />
                Legend {showParamLegend ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setParamHeatmapEnabled(v => !v)}
                title={paramHeatmapEnabled ? 'Désactiver la heatmap de densité' : 'Activer la heatmap de densité du paramètre'}
                aria-pressed={paramHeatmapEnabled}
                disabled={paramHeatPoints.length === 0}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  paramHeatmapEnabled
                    ? 'bg-orange-500/15 text-orange-500 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Flame size={14} />
                Heatmap {paramHeatmapEnabled ? 'ON' : 'OFF'}
              </button>
            </>
          ) : (
            <>
              {/* Left: Info */}
              <div className="flex items-center gap-2 px-3">
                <span className="text-base font-bold text-foreground">{filteredSites.length.toLocaleString()}</span>
                <span className="text-sm font-medium text-muted-foreground">Sites</span>
              </div>
              <span className="w-px h-6 bg-border/60" />
              <div className="flex items-center gap-2 px-2">
                <span className="text-sm font-medium text-muted-foreground">Z</span>
                <span className="text-base font-bold text-foreground">{viewport.zoom}</span>
              </div>

              <span className="w-px h-6 bg-border/60 mx-1" />

              {/* Center: Toggles */}
              <button
                onClick={() => setShowSiteLabels(v => !v)}
                title="Afficher les noms de sites"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  showSiteLabels
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Noms
              </button>
              <button
                onClick={() => setShowBeamSectors(v => !v)}
                title="Afficher les faisceaux sectoriels"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                  showBeamSectors
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Beams
              </button>

              <span className="w-px h-6 bg-border/60 mx-1" />

              {/* Right: Drawing tools */}
              {([
                { key: 'distance' as const, icon: Ruler, label: 'Distance', tip: 'Cliquez 2 points pour mesurer' },
                { key: 'polygon' as const, icon: Pentagon, label: 'Polygon', tip: 'Cliquez pour tracer, double-clic pour fermer' },
                { key: 'radius' as const, icon: Target, label: 'Radius+', tip: 'Cliquez pour placer le centre multi-rayon' },
                { key: 'zoomarea' as const, icon: ScanSearch, label: 'Zoom', tip: 'Cliquez et glissez pour zoomer sur une zone' },
              ] as const).map(tool => {
                const isActive = activeMapTool === tool.key;
                return (
                  <button
                    key={tool.key}
                    onClick={() => handleMapToolToggle(tool.key)}
                    title={tool.tip}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <tool.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="hidden sm:inline">{tool.label}</span>
                  </button>
                );
              })}

              {/* Radius presets + info */}
              {activeMapTool === 'radius' && radiusCenter && (
                <>
                  <span className="w-px h-3.5 bg-border/60 mx-0.5" />
                  {RADIUS_PRESETS.map(r => (
                    <button
                      key={r}
                      onClick={() => handleRadiusPreset(r)}
                      className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-wider transition-all duration-150 ${
                        radiusConfirmed && Math.abs(radiusConfirmedMeters - r) < 1
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {r >= 1000 ? `${r / 1000}k` : r}
                    </button>
                  ))}
                  {radiusConfirmed && radiusStats && (
                    <>
                      <span className="w-px h-3.5 bg-border/60 mx-0.5" />
                      <span className="text-[8px] text-primary font-bold">{radiusStats.sitesInside}s</span>
                      <span className="text-[8px] text-muted-foreground font-medium">{radiusStats.cellsInside}c</span>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>


      {/* Floating top bar — single row with scroll, dynamically positioned between sidebars */}
      <div
        className="absolute z-[1000] pointer-events-auto transition-all duration-300"
        style={{
          top: 12,
          left: `${(panelCollapsed ? 56 : 400) + 16}px`,
          right: `${(showRightPanel && !detailFullscreen ? 540 : 0) + 16}px`,
        }}
      >
        <div
          className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl flex items-center"
          style={{ minHeight: 60, height: 60 }}
        >
          {/* Scroll-left button */}
          {toolbarCanScrollLeft && (
            <button
              onClick={() => scrollToolbar('left')}
              className="shrink-0 flex items-center justify-center w-7 h-full text-muted-foreground hover:text-foreground transition-colors border-r border-border/30"
              aria-label="Scroll left"
            >
              <ChevronLeft size={14} />
            </button>
          )}

          {/* Scrollable KPI zone */}
          <div
            ref={toolbarScrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-3 px-4 scrollbar-hide"
            style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap', scrollbarWidth: 'none', justifyContent: 'safe center' }}
          >
            {/* ── Mode indicator (read-only): KPI / Topo / Param ──
                Auto-driven by the active Dashboard + Vue. Click is disabled
                — switch modes by activating the corresponding Vue. */}
            <div
              className="flex items-center bg-muted/80 rounded-xl overflow-hidden border border-border/50 shrink-0"
              role="group"
              aria-label="Mode actif (lecture seule, piloté par la Vue active)"
              title="Le mode est déterminé automatiquement par la Vue active du Dashboard"
            >
              <div
                aria-disabled="true"
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-l-xl select-none cursor-default ${
                  sectorColorMode === 'kpi' && !paramMode && activeViewType !== 'parameter'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-muted-foreground/60'
                }`}
              >
                <BarChart2 size={11} />
                KPI
              </div>
              <div
                aria-disabled="true"
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 select-none cursor-default ${
                  sectorColorMode === 'topo' && !paramMode && activeViewType !== 'parameter'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/20'
                    : 'text-muted-foreground/60'
                }`}
              >
                <Radio size={11} />
                Topo
              </div>
              <div
                aria-disabled="true"
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-r-xl select-none cursor-default ${
                  paramMode || activeViewType === 'parameter'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                    : 'text-muted-foreground/60'
                }`}
              >
                <MapPin size={11} />
                Param
              </div>
            </div>

            {/* ── Param mode: active parameter selector (mirrors KPI dropdown) ── */}
            {(paramMode || showParamDropdown || activeViewType === 'parameter') && (
              <>
                <div className="shrink-0">
                  <button
                    ref={(el) => { (window as any).__paramDropdownBtnRef = el; }}
                    onClick={() => setShowParamDropdown(v => !v)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-600 dark:text-orange-400 transition-all hover:bg-orange-500/15"
                  >
                    <MapPin size={12} />
                    <span className="max-w-[180px] truncate">{paramConfirmed || 'Sélectionner…'}</span>
                    {paramLoading ? (
                      <span className="inline-block w-3 h-3 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                    ) : (
                      showParamDropdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                    )}
                  </button>
                </div>
                <button
                  onClick={handleParamReset}
                  className="px-2 py-1.5 rounded-lg text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent transition-all shrink-0"
                  title="Quitter le mode Paramètre"
                >
                  <X size={11} />
                </button>
              </>
            )}

            <span className="w-px h-7 bg-border/50 shrink-0" />

            {/* ── KPI mode: dropdown selector + active label ── */}
            {/* Mode KPI et Paramètre sont mutuellement exclusifs. */}
            {sectorColorMode === 'kpi' && !paramMode && (
              <>
                {/* KPI dropdown trigger */}
                <div className="relative shrink-0">
                  <button
                    ref={(el) => { (window as any).__kpiDropdownBtnRef = el; }}
                    onClick={() => setShowKpiDropdown(!showKpiDropdown)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary transition-all hover:bg-primary/15"
                  >
                    <BarChart2 size={12} />
                    <span className="max-w-[140px] truncate">{selectedKpiLabel}</span>
                    {kpiLoading ? (
                      <span className="inline-block w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      showKpiDropdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                    )}
                  </button>
                </div>

                {/* Legend ON/OFF toggle */}
                <button
                  onClick={() => setShowKpiLegend(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border shrink-0 ${
                    showKpiLegend
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/50'
                  }`}
                  title={showKpiLegend ? 'Cacher la légende KPI' : 'Afficher la légende KPI'}
                  aria-pressed={showKpiLegend}
                >
                  <Palette size={11} />
                  Legend {showKpiLegend ? 'ON' : 'OFF'}
                </button>

                {/* KPI List toggle moved to Inventory Index sidebar tabs */}

                {/* Invert toggle */}
                <button
                  onClick={toggleInvert}
                  className={`px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all shrink-0 ${
                    currentThreshold.invert
                      ? 'bg-orange-500/15 text-orange-600 border border-orange-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                  }`}
                  title="Inverser l'échelle (bas=bon)"
                >
                  <ChevronsUpDown size={11} />
                </button>

                <span className="w-px h-7 bg-border/50 shrink-0" />

                {/* Band selector in KPI mode */}
                <div className="flex items-center bg-muted/60 rounded-lg overflow-hidden border border-border/40 shrink-0">
                  {(mapTechnoFilter === 'ALL' || mapTechnoFilter === '5G'
                    ? ['NR3500', 'NR700', 'NR2100']
                    : []
                  ).concat(
                    mapTechnoFilter === 'ALL' || mapTechnoFilter === '4G'
                      ? ['L2600', 'L2100', 'L1800', 'L800', 'L700']
                      : []
                  ).filter(band => availableBandsInScope.size === 0 || availableBandsInScope.has(band)).map((band) => (
                    <button
                      key={band}
                      onClick={() => {
                        setEnabledBands(prev => {
                          const next = new Set(prev);
                          if (next.has(band)) next.delete(band);
                          else next.add(band);
                          return next;
                        });
                      }}
                      className={`px-2 py-2 text-[9px] font-bold tracking-wider transition-all ${
                        enabledBands.has(band)
                          ? 'text-primary-foreground shadow-sm'
                          : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted'
                      }`}
                      style={enabledBands.has(band) ? { backgroundColor: DEFAULT_BAND_COLORS[band] || 'hsl(var(--primary))' } : {}}
                    >
                      {band}
                    </button>
                  ))}
                </div>

                {/* Site Name toggle */}
                <button
                  onClick={() => setShowSiteLabels(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ${
                    showSiteLabels
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-muted/60 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title="Afficher/masquer les noms de sites"
                >
                  <MapPin size={11} />
                  Site Name
                </button>
              </>
            )}

            {/* ── Topo mode: inline tech filter + layer switcher + label ── */}
            {/* Keep Topo controls visible even in paramMode so the legacy toolbar (Network/Views/Color buttons) stays present. */}
            {sectorColorMode === 'topo' && (
              <>

                {/* Band selector in Topo mode */}
                {mapTechnoFilter !== 'OFF' && (
                  <div className="flex items-center bg-muted/60 rounded-lg overflow-hidden border border-border/40 shrink-0">
                    {(mapTechnoFilter === 'ALL' || mapTechnoFilter === '5G'
                      ? ['NR3500', 'NR700', 'NR2100']
                      : []
                    ).concat(
                      mapTechnoFilter === 'ALL' || mapTechnoFilter === '4G'
                        ? ['L2600', 'L2100', 'L1800', 'L800', 'L700']
                        : []
                    ).concat(
                      mapTechnoFilter === 'ALL' || mapTechnoFilter === '3G'
                        ? ['UMTS2100', 'UMTS900']
                        : []
                    ).concat(
                      mapTechnoFilter === 'ALL' || mapTechnoFilter === '2G'
                        ? ['GSM900', 'GSM1800']
                        : []
                    ).filter(band => availableBandsInScope.size === 0 || availableBandsInScope.has(band)).map((band) => (
                      <button
                        key={band}
                        onClick={() => {
                          setEnabledBands(prev => {
                            const next = new Set(prev);
                            if (next.has(band)) next.delete(band);
                            else next.add(band);
                            return next;
                          });
                        }}
                        className={`px-2 py-2 text-[9px] font-bold tracking-wider transition-all ${
                          enabledBands.has(band)
                            ? 'text-primary-foreground shadow-sm'
                            : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted'
                        }`}
                        style={enabledBands.has(band) ? { backgroundColor: DEFAULT_BAND_COLORS[band] || 'hsl(var(--primary))' } : {}}
                      >
                        {band}
                      </button>
                    ))}
                  </div>
                )}

                <span className="w-px h-7 bg-border/50 shrink-0" />

                <button
                  onClick={() => {
                    setMapLabelFields(prev => {
                      const next = new Set(prev);
                      if (next.has('site_name')) {
                        next.delete('site_name');
                      } else {
                        next.add('site_name');
                      }
                      return next;
                    });
                  }}
                  className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all rounded-lg shrink-0 flex items-center gap-1.5 ${
                    mapLabelFields.has('site_name')
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/40'
                  }`}
                >
                  <Tag size={12} />
                  Site Name
                </button>

              </>
            )}

            {/* ── Always-visible legacy controls: Network Info / Views / Couleur ──
                Sortis du bloc Topo pour rester présents quel que soit sectorColorMode
                (none / kpi / topo) et même en mode Paramètre. */}
            <span className="w-px h-7 bg-border/50 shrink-0" />

            {/* Network Info right panel toggle */}
            <button
              onClick={() => setShowRightPanel(prev => !prev)}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all rounded-lg shrink-0 flex items-center gap-1.5 ${
                showRightPanel
                  ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-sm shadow-red-500/20'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/40'
              }`}
            >
              <Signal size={12} />
              Network Info
            </button>

            <span className="w-px h-7 bg-border/50 shrink-0" />

            {/* Views / Dashboard toggle */}
            <button
              onClick={() => {
                if (inventoryTab === 'dashboard' && !panelCollapsed) {
                  setPanelCollapsed(true);
                } else {
                  setInventoryTab('dashboard');
                  setPanelCollapsed(false);
                }
              }}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all rounded-lg shrink-0 flex items-center gap-1.5 ${
                inventoryTab === 'dashboard' && !panelCollapsed
                  ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/20'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/40'
              }`}
            >
              <Layers size={12} />
              Views
            </button>

            {/* View by Color selector — button only (dropdown rendered outside overflow container) */}
            <button
              ref={(el) => { (window as any).__colorViewBtnRef = el; }}
              onClick={() => setShowColorViewDropdown(!showColorViewDropdown)}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all rounded-lg flex items-center gap-1.5 shrink-0 ${
                colorViewMode !== 'none'
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm shadow-violet-500/20'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/40'
              }`}
            >
              <Palette size={12} />
              {colorViewMode !== 'none' ? COLOR_VIEW_LABELS[colorViewMode] : 'Couleur'}
            </button>
          </div>

          {/* Scroll-right button */}
          {toolbarCanScrollRight && (
            <button
              onClick={() => scrollToolbar('right')}
              className="shrink-0 flex items-center justify-center w-7 h-full text-muted-foreground hover:text-foreground transition-colors border-l border-border/30"
              aria-label="Scroll right"
            >
              <ChevronRight size={14} />
            </button>
          )}

          {/* Right-side Views button removed per user request */}
        </div>
      </div>

      {/* ── KPI Legend + Threshold Editor (floating, bottom-right) ──
            Restored as the unique KPI legend (2026-05-11 revert): the
            drop-in module's `mountKpiLegend` is no longer rendered — the
            user prefers the legacy per-sector legend with INTENSITÉ /
            TRANSP sliders + Bon/Moyen/Mauvais thresholds. The Voronoï
            polygon layer from the KPI Overlay module still renders, just
            without its own legend block. */}
      {sectorColorMode === 'kpi' && !paramMode && showKpiLegend && (
        <div
          className="absolute z-[1001] pointer-events-auto animate-fade-in"
          style={{
            bottom: 80,
            right: showRightPanel && !detailFullscreen ? 556 : 16,
            transition: 'right 0.3s ease',
          }}
        >
          <div
            className="rounded-2xl overflow-hidden border border-border/60 shadow-xl"
            style={{
              background: 'hsl(var(--card) / 0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              minWidth: showKpiThresholdEditor ? 300 : 220,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <div className="flex items-center gap-2">
                <BarChart2 size={12} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground">{selectedKpiLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowKpiThresholdEditor(v => !v)} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="Modifier seuils">
                  <Pencil size={10} />
                </button>
                <button onClick={() => setShowKpiLegend(false)} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                  <X size={10} />
                </button>
              </div>
            </div>

            {/* ── Techno + Analysis Level ── */}
            <div className="px-3 py-2 border-b border-border/20">
              {kpiOverlayLocked ? (
                <div className="flex items-center gap-3 text-[10px]">
                  <span className={`px-2.5 py-1 rounded-lg font-black ${
                    kpiTechnoFilter === '5G'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
                  }`}>{kpiTechnoFilter}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="px-2.5 py-1 rounded-lg font-bold bg-primary/15 text-primary">
                    {kpiAnalysisLevel === 'site' ? '📍 Site' : kpiAnalysisLevel === 'cell' ? '📡 Cellule' : '📶 Bande'}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Techno selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 shrink-0">Techno</span>
                    <div className="flex gap-1 flex-1">
                      {(['4G', '5G'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setKpiTechnoFilter(t)}
                          className={`flex-1 py-1 text-[10px] font-black rounded-lg transition-all ${
                            kpiTechnoFilter === t
                              ? t === '5G'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40'
                                : 'bg-orange-500/20 text-orange-700 dark:text-orange-400 ring-1 ring-orange-500/40'
                              : 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Analysis Level selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 shrink-0">Niveau</span>
                    <div className="flex gap-1 flex-1">
                      {([
                        { key: 'site' as const, label: 'Site', icon: '📍' },
                        { key: 'cell' as const, label: 'Cellule', icon: '📡' },
                        { key: 'band' as const, label: 'Bande', icon: '📶' },
                      ]).map(lvl => (
                        <button
                          key={lvl.key}
                          onClick={() => setKpiAnalysisLevel(lvl.key)}
                          className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                            kpiAnalysisLevel === lvl.key
                              ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                              : 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
                          }`}
                        >
                          <span className="text-[8px]">{lvl.icon}</span>
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Date Range ── */}
            <div className="px-3 py-2 border-b border-border/20">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 shrink-0">Période</span>
                  <input type="date" value={kpiDateFrom} onChange={e => setKpiDateFrom(e.target.value)}
                    className="flex-1 px-1.5 py-1 text-[10px] rounded-lg border border-border/40 bg-background text-foreground" />
                  <span className="text-[9px] text-muted-foreground">→</span>
                  <input type="date" value={kpiDateTo} onChange={e => setKpiDateTo(e.target.value)}
                    className="flex-1 px-1.5 py-1 text-[10px] rounded-lg border border-border/40 bg-background text-foreground" />
                </div>
                {kpiDataIssue && (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold leading-snug text-amber-700 dark:text-amber-300">
                    {kpiDataIssue}
                  </div>
                )}
            </div>

            {/* Gradient bar visualization — click each segment to toggle that level */}
            <div className="px-3 py-1.5">
              <div className="h-2 rounded-full overflow-hidden flex" style={{ opacity: Math.min(1, kpiOverlayIntensity * kpiOverlayTransparency) }}>
                {(currentThreshold.invert
                  ? [
                      { level: 'green' as const, color: currentThreshold.colorGreen || '#27AE60' },
                      { level: 'orange' as const, color: currentThreshold.colorOrange || '#f59e0b' },
                      { level: 'red' as const, color: currentThreshold.colorRed || '#8E44AD' },
                    ]
                  : [
                      { level: 'red' as const, color: currentThreshold.colorRed || '#8E44AD' },
                      { level: 'orange' as const, color: currentThreshold.colorOrange || '#f59e0b' },
                      { level: 'green' as const, color: currentThreshold.colorGreen || '#27AE60' },
                    ]
                ).map(({ level, color }) => {
                  const hidden = hiddenKpiLevels.has(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleKpiLevel(level)}
                      title={hidden ? `Afficher ${level}` : `Masquer ${level}`}
                      className={`flex-1 h-full transition-all cursor-pointer hover:brightness-110 ${hidden ? 'opacity-25 grayscale' : ''}`}
                      style={{ background: color }}
                    />
                  );
                })}
              </div>
            </div>

            {/* KPI value filter */}
            <div className="px-3 py-1.5 border-b border-border/20">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 shrink-0">Filtre</span>
                <input
                  value={kpiValueFilter}
                  onChange={e => setKpiValueFilter(e.target.value)}
                  placeholder=">98, <50, >=95..."
                  className={`flex-1 px-2 py-1 text-[10px] font-mono rounded-lg border bg-background outline-none transition-colors ${
                    kpiValueFilter && !kpiValueFilterFn
                      ? 'border-destructive/50 text-destructive'
                      : kpiValueFilterFn
                        ? 'border-primary/50 text-primary font-bold'
                        : 'border-border/40 text-foreground'
                  }`}
                />
                {kpiValueFilter && (
                  <button onClick={() => setKpiValueFilter('')} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                    <X size={10} />
                  </button>
                )}
              </div>
              {kpiValueFilterFn && (
                <div className="text-[9px] text-primary font-semibold mt-1 ml-14">
                  Filtre actif — seules les cellules {kpiValueFilter} affichées
                </div>
              )}
            </div>

            {/* Global color intensity slider — applies uniformly to all KPI levels */}
            <div className="px-3 pb-1 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-16 shrink-0">Intensité</span>
                <Slider
                  min={20}
                  max={150}
                  step={5}
                  value={[Math.round(kpiOverlayIntensity * 100)]}
                  onValueChange={(v) => {
                    const next = Math.max(0.2, Math.min(1.5, (v[0] ?? 100) / 100));
                    setKpiOverlayIntensity(next);
                    localStorage.setItem('osmosis_kpi_overlay_intensity', String(next));
                  }}
                  className="flex-1"
                />
                <span className="text-[10px] font-bold tabular-nums text-foreground w-10 text-right">{Math.round(kpiOverlayIntensity * 100)}%</span>
              </div>
            </div>

            {/* Global transparency slider — 0% = fully transparent, 100% = fully opaque */}
            <div className="px-3 pb-2 pt-1 border-b border-border/20">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-16 shrink-0">Transp.</span>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[Math.round(kpiOverlayTransparency * 100)]}
                  onValueChange={(v) => {
                    const next = Math.max(0, Math.min(1, (v[0] ?? 100) / 100));
                    setKpiOverlayTransparency(next);
                    localStorage.setItem('osmosis_kpi_overlay_transparency', String(next));
                  }}
                  className="flex-1"
                />
                <span className="text-[10px] font-bold tabular-nums text-foreground w-10 text-right">{Math.round(kpiOverlayTransparency * 100)}%</span>
              </div>
            </div>


            {/* Legend rows — click to filter */}
            <div className="px-3 py-1.5 space-y-0.5">
              {(() => {
                const cGreen = currentThreshold.colorGreen || '#27AE60';
                const cOrange = currentThreshold.colorOrange || '#f59e0b';
                const cRed = currentThreshold.colorRed || '#8E44AD';
                const levels: { level: 'green' | 'orange' | 'red' | 'gray'; color: string; label: string; qualifier: string }[] = currentThreshold.invert
                  ? [
                      { level: 'green', color: cGreen, label: `≤ ${currentThreshold.green}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Bon' },
                      { level: 'orange', color: cOrange, label: `${currentThreshold.green} – ${currentThreshold.orange}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Moyen' },
                      { level: 'red', color: cRed, label: `> ${currentThreshold.orange}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Critique' },
                      { level: 'gray', color: '#6b7280', label: 'No data', qualifier: '' },
                    ]
                  : [
                      { level: 'green', color: cGreen, label: `≥ ${currentThreshold.green}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Bon' },
                      { level: 'orange', color: cOrange, label: `${currentThreshold.orange} – ${currentThreshold.green}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Moyen' },
                      { level: 'red', color: cRed, label: `< ${currentThreshold.orange}${selectedKpiUnit ? ` ${selectedKpiUnit}` : ''}`, qualifier: 'Critique' },
                      { level: 'gray', color: '#6b7280', label: 'No data', qualifier: '' },
                    ];
                return levels.map(({ level, color, label, qualifier }) => {
                  const hidden = hiddenKpiLevels.has(level);
                  const count = kpiLevelCounts[level] || 0;
                  return (
                    <button
                      key={level}
                      onClick={() => toggleKpiLevel(level)}
                      className={`flex items-center gap-2 w-full px-1.5 py-1 rounded-md transition-all cursor-pointer hover:bg-muted/50 ${hidden ? 'opacity-35' : ''}`}
                      title={hidden ? `Afficher ${qualifier || label} (${count} ${kpiLegendScope === 'site' ? 'sites' : 'cellules'})` : `Masquer ${qualifier || label} (${count} ${kpiLegendScope === 'site' ? 'sites' : 'cellules'})`}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0 relative" style={{ background: color }}>
                        {hidden && <X size={8} className="absolute inset-0 m-auto text-white" />}
                      </span>
                      <span className={`text-[10px] font-semibold ${level === 'gray' ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
                      <span className="text-[9px] font-bold tabular-nums text-foreground/80 ml-auto px-1.5 py-0.5 rounded-full bg-muted/60 min-w-[20px] text-center">{count}</span>
                      {qualifier && <span className="text-[9px] text-muted-foreground w-12 text-right">{qualifier}</span>}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Enhanced Threshold Editor */}
            {showKpiThresholdEditor && (
              <div className="px-3 py-2.5 border-t border-border/30 space-y-2.5">
                {/* Green threshold */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={currentThreshold.colorGreen || '#27AE60'}
                    onChange={e => {
                      const next = { ...kpiThresholds };
                      const cur = next[mapKpi] || { green: 80, orange: 60 };
                      next[mapKpi] = { ...cur, colorGreen: e.target.value };
                      setKpiThresholds(next);
                      localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next));
                    }}
                    className="w-5 h-5 rounded-full border-0 cursor-pointer shrink-0 p-0"
                    title="Couleur Bon"
                  />
                  <span className="text-[9px] font-bold text-muted-foreground w-8 shrink-0">{currentThreshold.invert ? '≤' : '≥'}</span>
                  <input
                    type="number"
                    value={currentThreshold.green}
                    onChange={e => updateThreshold('green', parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 rounded-lg border border-border/50 bg-background text-[10px] font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-16"
                    step="0.1"
                  />
                  <span className="text-[9px] font-semibold text-emerald-600">Bon</span>
                </div>
                {/* Orange threshold */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={currentThreshold.colorOrange || '#f59e0b'}
                    onChange={e => {
                      const next = { ...kpiThresholds };
                      const cur = next[mapKpi] || { green: 80, orange: 60 };
                      next[mapKpi] = { ...cur, colorOrange: e.target.value };
                      setKpiThresholds(next);
                      localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next));
                    }}
                    className="w-5 h-5 rounded-full border-0 cursor-pointer shrink-0 p-0"
                    title="Couleur Moyen"
                  />
                  <span className="text-[9px] font-bold text-muted-foreground w-8 shrink-0">{currentThreshold.invert ? '≤' : '≥'}</span>
                  <input
                    type="number"
                    value={currentThreshold.orange}
                    onChange={e => updateThreshold('orange', parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 rounded-lg border border-border/50 bg-background text-[10px] font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-16"
                    step="0.1"
                  />
                  <span className="text-[9px] font-semibold text-amber-600">Moyen</span>
                </div>
                {/* Red color picker */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={currentThreshold.colorRed || '#8E44AD'}
                    onChange={e => {
                      const next = { ...kpiThresholds };
                      const cur = next[mapKpi] || { green: 80, orange: 60 };
                      next[mapKpi] = { ...cur, colorRed: e.target.value };
                      setKpiThresholds(next);
                      localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next));
                    }}
                    className="w-5 h-5 rounded-full border-0 cursor-pointer shrink-0 p-0"
                    title="Couleur Critique"
                  />
                  <span className="text-[9px] font-bold text-muted-foreground w-8 shrink-0">{currentThreshold.invert ? '>' : '<'}</span>
                  <span className="flex-1 text-[10px] text-muted-foreground italic">Critique</span>
                  <span className="text-[9px] font-semibold text-red-500">Critique</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={toggleInvert}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all ${
                      currentThreshold.invert
                        ? 'bg-orange-500/15 text-orange-600'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ChevronsUpDown size={10} />
                    {currentThreshold.invert ? 'Inversé' : 'Normal'}
                  </button>
                  {/* Reset to catalog button */}
                  {catalogThresholds[mapKpi] && (
                    <button
                      onClick={() => {
                        const cat = catalogThresholds[mapKpi];
                        if (!cat) return;
                        const next = { ...kpiThresholds };
                        next[mapKpi] = { green: cat.green, orange: cat.orange, invert: cat.invert };
                        setKpiThresholds(next);
                        localStorage.setItem('osmosis_kpi_thresholds', JSON.stringify(next));
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                      title="Restaurer les seuils du catalogue"
                    >
                      <RotateCcw size={9} />
                      Catalogue
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showColorViewDropdown && (() => {
        const btn = (window as any).__colorViewBtnRef as HTMLElement | null;
        const rect = btn?.getBoundingClientRect();
        const top = rect ? rect.bottom + 6 : 100;
        const left = rect ? rect.left : 400;
        return (
          <>
            <div className="fixed inset-0 z-[1199]" onClick={() => setShowColorViewDropdown(false)} />
            <div
              className="fixed z-[1200] bg-card/98 backdrop-blur-xl border border-border rounded-xl shadow-2xl min-w-[180px] py-1 animate-in fade-in-0 zoom-in-95 duration-150 pointer-events-auto"
              style={{ top, left }}
            >
              <div className="px-3 py-2 border-b border-border/40">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Colorer par</span>
              </div>
              {(['none', 'vendor', 'dor', 'plaque', 'tech'] as ColorViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setColorViewMode(mode); setShowColorViewDropdown(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                    colorViewMode === mode
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-foreground hover:bg-muted font-medium'
                  }`}
                >
                  {colorViewMode === mode && <Check size={12} className="text-primary shrink-0" />}
                  {colorViewMode !== mode && <span className="w-3 shrink-0" />}
                  {COLOR_VIEW_LABELS[mode]}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      {/* KPI Overlay List Panel is now rendered inline inside the left Inventory Index sidebar (see below). */}

      {/* KPI dropdown — rendered outside overflow container */}
      {showKpiDropdown && (() => {
        const btn = (window as any).__kpiDropdownBtnRef as HTMLElement | null;
        const rect = btn?.getBoundingClientRect();
        const top = rect ? rect.bottom + 6 : 100;
        const left = rect ? rect.left : 400;
        return (
          <>
            <div className="fixed inset-0 z-[1199]" onClick={() => setShowKpiDropdown(false)} />
            <div
              className="fixed z-[1200] bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl w-[300px] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 pointer-events-auto"
              style={{ top, left }}
            >
              {/* Techno tabs */}
              <div className="flex border-b border-border/40">
                {(['4G', '5G'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => !kpiOverlayLocked && setKpiTechnoFilter(t)}
                    disabled={kpiOverlayLocked}
                    className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all ${
                      kpiTechnoFilter === t
                        ? t === '5G'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-b-2 border-emerald-500'
                          : 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-b-2 border-orange-500'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    } ${kpiOverlayLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="px-3 py-2 border-b border-border/40">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={kpiSearch}
                    onChange={e => setKpiSearch(e.target.value)}
                    placeholder="Rechercher KPI..."
                    className="w-full pl-7 pr-3 py-1.5 text-[10px] rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto py-1">
                {[...new Set(MAP_KPIS.map(k => k.category))].filter(cat => MAP_KPIS.some(k => k.category === cat)).map(cat => {
                  const filtered = MAP_KPIS.filter(k => k.category === cat && (!kpiSearch || k.label.toLowerCase().includes(kpiSearch.toLowerCase())));
                  if (filtered.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-b border-border/30">{cat}</div>
                      {filtered.map(kpi => (
                        <button
                          key={kpi.id}
                          onClick={() => {
                            setMapKpi(kpi.id); setSectorColorMode('kpi'); setShowBeamSectors(true); setMapDisplayMode('sites'); setShowKpiDropdown(false); setKpiSearch('');
                            // Add to kpiOverlays (avoid duplicates)
                            setKpiOverlays(prev => prev.includes(kpi.id) ? prev : [...prev, kpi.id]);
                            // Save kpiOverlays to active view
                            if (activeViewId) {
                              mapViewsApi.list().then(views => {
                                const view = views.find((v: any) => v.id === activeViewId);
                                if (view) {
                                  const curSettings = typeof view.settings === 'object' ? view.settings : {};
                                  const existing: string[] = Array.isArray((curSettings as any).kpiOverlays) ? (curSettings as any).kpiOverlays : [];
                                  const next = existing.includes(kpi.id) ? existing : [...existing, kpi.id];
                                  mapViewsApi.update(activeViewId, { settings: { ...curSettings, kpiOverlays: next, kpiTechno: kpiTechnoFilter, kpiAnalysisLevel } })
                                    .then(() => setOverlayVersion(v => v + 1));
                                }
                              });
                            }
                          }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all ${
                            mapKpi === kpi.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold">{kpi.label}</span>
                            {kpi.unit && <span className="text-[9px] text-muted-foreground">({kpi.unit})</span>}
                          </div>
                          {mapKpi === kpi.id && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {showParamDropdown && (() => {
        const btn = (window as any).__paramDropdownBtnRef as HTMLElement | null;
        const rect = btn?.getBoundingClientRect();
        const top = rect ? rect.bottom + 6 : 100;
        const left = rect ? rect.left : 400;
        return (
          <>
            <div className="fixed inset-0 z-[1199]" onClick={() => setShowParamDropdown(false)} />
            <div
              className="fixed z-[1200] bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl w-[320px] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 pointer-events-auto"
              style={{ top, left }}
            >
              <div className="p-2 border-b border-border/40">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={paramSearch}
                    onChange={e => setParamSearch(e.target.value)}
                    placeholder="Rechercher un paramètre..."
                    className="w-full pl-7 pr-3 py-1.5 text-[10px] rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              <div className="max-h-[360px] overflow-y-auto p-1">
                {paramAvailableLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">Chargement…</div>
                ) : paramFilteredList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Aucun paramètre</div>
                ) : paramFilteredList.slice(0, 200).map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      setParamSearch('');
                      void handleParamConfirm(p);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 text-[11px] rounded-xl transition-colors text-left ${
                      paramConfirmed === p
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{p}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}



      {/* Floating bottom-left: display mode + layer switcher */}
      {viewMode === 'map' && (
        <div className="absolute z-[1000] pointer-events-auto flex items-end gap-2 transition-all duration-300" style={{ left: (panelCollapsed ? 56 : 400) + 16, bottom: 24 }}>
          {/* Display mode: Sites / Points / Heatmap */}
          <div className="flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-lg overflow-hidden">
            {([
              { key: 'sites' as const, label: '📍' },
              { key: 'points' as const, label: '●' },
              { key: 'heatmap' as const, label: '🔥' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMapDisplayMode(key)}
                className={`w-10 h-10 flex items-center justify-center text-sm transition-all ${
                  mapDisplayMode === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={key.charAt(0).toUpperCase() + key.slice(1)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Layer switcher: L / D / S */}
          <div className="flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-lg overflow-hidden">
            {([
              { key: 'light' as const, label: 'L' },
              { key: 'dark' as const, label: 'D' },
              { key: 'street' as const, label: 'M' },
              { key: 'satellite' as const, label: 'S' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMapLayer(key)}
                className={`w-10 h-10 flex items-center justify-center text-xs font-black tracking-wider transition-all ${
                  mapLayer === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating LEFT side: techno filter + band legend */}
      {viewMode === 'map' && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto flex items-end gap-2 transition-all duration-500 ease-out" style={{ right: showRightPanel && !detailFullscreen ? 564 : 24 }}>
          {/* Techno filter: ALL / 5G / 4G — hidden when no sites */}
          {sites.length > 0 && (
            <div className="flex flex-col bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-xl overflow-hidden animate-fade-in">
              {([
                { value: 'ALL', label: 'ALL' },
                { value: '5G', label: 'NR' },
                { value: '4G', label: 'LTE' },
                { value: '3G', label: 'UMTS' },
                { value: '2G', label: 'GSM' },
                { value: 'OFF', label: 'OFF' },
              ] as const).map(({ value: tech, label }) => (
                <button
                  key={tech}
                  onClick={() => {
                    setMapTechnoFilter(tech);
                    const NR_BANDS = ['NR3500', 'NR700', 'NR2100'];
                    const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700'];
                    const UMTS_BANDS = ['UMTS2100', 'UMTS900'];
                    const GSM_BANDS = ['GSM900', 'GSM1800'];
                    if (tech === 'ALL') {
                      setEnabledBands(new Set([...NR_BANDS, ...LTE_BANDS, ...UMTS_BANDS, ...GSM_BANDS]));
                    } else if (tech === '5G') {
                      setEnabledBands(new Set(NR_BANDS));
                    } else if (tech === '4G') {
                      setEnabledBands(new Set(LTE_BANDS));
                    } else if (tech === '3G') {
                      setEnabledBands(new Set(UMTS_BANDS));
                    } else if (tech === '2G') {
                      setEnabledBands(new Set(GSM_BANDS));
                    } else {
                      setEnabledBands(new Set());
                    }
                  }}
                  className={`w-11 h-11 flex items-center justify-center text-[10px] font-black tracking-wider transition-all duration-200 ${
                    mapTechnoFilter === tech
                      ? 'bg-primary text-primary-foreground scale-110 shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Band layer toggle panel — hidden when colorViewMode is active */}
          {colorViewMode === 'none' && (
          <div className="relative">
            <button
              onClick={() => setShowBandPanel(!showBandPanel)}
              className={`w-11 h-11 flex items-center justify-center rounded-2xl shadow-xl transition-all duration-200 active:scale-95 ${
                showBandPanel
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card/95 backdrop-blur-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
              title="Band Layers"
            >
              <Signal size={16} />
            </button>
            {showBandPanel && (
              <div className="absolute right-14 bottom-0 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-xl overflow-hidden min-w-[160px] z-[500] animate-scale-in">
                {/* Mode toggle: Tech vs Cell */}
                <div className="flex items-center gap-1 px-2 pt-2 pb-1 border-b border-border/50">
                  <button
                    onClick={() => setBandPanelMode('tech')}
                    className={`flex-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                      bandPanelMode === 'tech'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    title="Vue Technologies"
                  >
                    Tech
                  </button>
                  <button
                    onClick={() => setBandPanelMode('cell')}
                    className={`flex-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                      bandPanelMode === 'cell'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    title="Vue Cellules / Bandes"
                  >
                    Cell
                  </button>
                </div>
                {bandPanelMode === 'tech' ? (
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Technologies</span>
                      <button onClick={resetBandColors} className="text-[8px] font-bold text-muted-foreground/50 hover:text-foreground" title="Reset colors">↺</button>
                    </div>
                    {([
                      { key: '5G_GROUP', tech: '5G' as const, label: '5G', defaultColor: '#27AE60' },
                      { key: '4G_GROUP', tech: '4G' as const, label: '4G', defaultColor: '#F39C12' },
                      { key: '3G_GROUP', tech: '3G' as const, label: '3G', defaultColor: '#3498DB' },
                      { key: '2G_GROUP', tech: '2G' as const, label: '2G', defaultColor: '#8E44AD' },
                    ]).map(({ key, tech, label, defaultColor }) => {
                      const enabled = enabledTechnos.has(tech);
                      const color = bandColors[key] || defaultColor;
                      return (
                        <div key={key} className="flex items-center gap-2.5 w-full group">
                          <button
                            onClick={() => {
                              setEnabledTechnos(prev => {
                                const next = new Set(prev);
                                if (next.has(tech)) next.delete(tech); else next.add(tech);
                                return next;
                              });
                            }}
                            className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                              enabled ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                            }`}
                            style={{ background: enabled ? color : 'transparent' }}
                          >
                            {enabled && <span className="text-white text-[8px] font-black">✓</span>}
                          </button>
                          <span className={`text-[11px] font-bold transition-all flex-1 cursor-pointer ${
                            enabled ? 'text-foreground' : 'text-muted-foreground line-through'
                          }`} onClick={() => {
                            setEnabledTechnos(prev => {
                              const next = new Set(prev);
                              if (next.has(tech)) next.delete(tech); else next.add(tech);
                              return next;
                            });
                          }}>{label}</span>
                          <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: color }} title={`Change ${label} color`}>
                            <input type="color" value={color} onChange={(e) => updateBandColor(key, e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── 5G or 4G mode: show detailed bands ── */
                  <>
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAllBands('NR')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['5G_GROUP'] || '#27AE60' }}>
                        5G NR
                      </button>
                    </div>
                    <button onClick={resetBandColors} className="text-[8px] font-bold text-muted-foreground/50 hover:text-foreground" title="Reset colors">↺</button>
                  </div>
                  <div className="space-y-1.5">
                    {(['NR3500', 'NR700', 'NR2100'] as const).map(band => (
                      <div key={band} className="flex items-center gap-2.5 w-full group">
                        <button
                          onClick={() => toggleBand(band)}
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? bandColors[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </button>
                        <span className={`text-[11px] font-bold transition-all flex-1 cursor-pointer ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`} onClick={() => toggleBand(band)}>{band}</span>
                        <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: bandColors[band] }} title="Change color">
                          <input
                            type="color"
                            value={bandColors[band]}
                            onChange={(e) => updateBandColor(band, e.target.value)}
                            className="opacity-0 w-0 h-0 absolute"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                {/* LTE group */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAllBands('LTE')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['4G_GROUP'] || '#F39C12' }}>
                        4G LTE
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {(['L2600', 'L2100', 'L1800', 'L800', 'L700'] as const).map(band => (
                      <div key={band} className="flex items-center gap-2.5 w-full group">
                        <button
                          onClick={() => toggleBand(band)}
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? bandColors[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </button>
                        <span className={`text-[11px] font-bold transition-all flex-1 cursor-pointer ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`} onClick={() => toggleBand(band)}>{band}</span>
                        <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: bandColors[band] }} title="Change color">
                          <input
                            type="color"
                            value={bandColors[band]}
                            onChange={(e) => updateBandColor(band, e.target.value)}
                            className="opacity-0 w-0 h-0 absolute"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                {/* UMTS group */}
                <div className="px-4 py-3 border-t border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAllBands('UMTS')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['3G_GROUP'] || '#3498DB' }}>
                        3G UMTS
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {(['UMTS2100', 'UMTS900'] as const).map(band => (
                      <div key={band} className="flex items-center gap-2.5 w-full group">
                        <button
                          onClick={() => toggleBand(band)}
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? bandColors[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </button>
                        <span className={`text-[11px] font-bold transition-all flex-1 cursor-pointer ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`} onClick={() => toggleBand(band)}>{band}</span>
                        <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: bandColors[band] }} title="Change color">
                          <input
                            type="color"
                            value={bandColors[band]}
                            onChange={(e) => updateBandColor(band, e.target.value)}
                            className="opacity-0 w-0 h-0 absolute"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                {/* GSM group */}
                <div className="px-4 py-3 border-t border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAllBands('GSM')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['2G_GROUP'] || '#8E44AD' }}>
                        2G GSM
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {(['GSM1800', 'GSM900'] as const).map(band => (
                      <div key={band} className="flex items-center gap-2.5 w-full group">
                        <button
                          onClick={() => toggleBand(band)}
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center shrink-0 ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? bandColors[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </button>
                        <span className={`text-[11px] font-bold transition-all flex-1 cursor-pointer ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`} onClick={() => toggleBand(band)}>{band}</span>
                        <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: bandColors[band] }} title="Change color">
                          <input
                            type="color"
                            value={bandColors[band]}
                            onChange={(e) => updateBandColor(band, e.target.value)}
                            className="opacity-0 w-0 h-0 absolute"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                  </>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}


      {/* ── Color View Legend — rendered outside the band panel container ── */}
      {viewMode === 'map' && colorViewMode !== 'none' && Object.keys(colorViewColorMap).length > 0 && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto" style={{ right: (showRightPanel && !detailFullscreen ? 540 : 0) + 24 }}>
          <div className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl overflow-hidden min-w-[160px] max-w-[220px]">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette size={12} className="text-primary" />
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{COLOR_VIEW_LABELS[colorViewMode]}</span>
              </div>
              <button
                onClick={() => setColorViewMode('none')}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                title="Réinitialiser"
              >
                <X size={12} />
              </button>
            </div>
            <div className="px-4 py-2.5 space-y-1.5 max-h-[200px] overflow-y-auto">
              {Object.entries(colorViewColorMap).sort(([a], [b]) => a.localeCompare(b)).map(([value, color]) => (
                <div key={value} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded shrink-0 border border-border/30" style={{ background: color }} />
                  <span className="text-[11px] font-semibold text-foreground truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ LEFT PANEL — Inventory Index ══ */}
      {viewMode === 'map' && (
        <div className={`absolute top-0 left-0 bottom-0 z-[1000] pointer-events-auto transition-all duration-300 ease-in-out ${
          panelCollapsed ? 'w-14' : 'w-[460px]'
        }`}>
          {/* Collapsed state */}
          {panelCollapsed ? (
            <div className="h-full bg-card border-r border-border flex flex-col items-center py-4 gap-3">
              <button
                onClick={() => setPanelCollapsed(false)}
                className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all relative"
                title="Open Inventory"
              >
                <ChevronRight size={18} />
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[8px] font-black rounded-full flex items-center justify-center">
                  {filteredSites.length}
                </span>
              </button>
            </div>
          ) : (
            <div className="h-full bg-card border-r border-border flex flex-col overflow-hidden">
              {/* ── Header ── */}
              <div className="px-5 pt-5 pb-3 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="text-[13px] font-extrabold text-foreground uppercase tracking-[0.15em]">Inventory Index</h2>
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mt-0.5">Sites Navigation List</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPanelMinimized(!panelMinimized)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                        panelMinimized ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                      title="Filters"
                    >
                      <Filter size={14} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">
                      {filteredSites.length}
                    </div>
                    <button
                      onClick={() => setPanelCollapsed(true)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      title="Collapse"
                    >
                      <PanelLeftClose size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Search bar ── */}
              <div className="px-5 pb-3 shrink-0 relative">
                <div className="flex items-center gap-2.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Rechercher un site..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setLocalSearch(''); setSearchResults([]); setSearchModeSites([]); }
                    }}
                    className="flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground min-w-0"
                  />
                  {searchLoading && (
                    <RefreshCw size={12} className="animate-spin text-primary shrink-0" />
                  )}
                  {localSearch && (
                    <button onClick={() => { setLocalSearch(''); setSearchResults([]); setSearchModeSites([]); }} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* KPI List panel moved below the tabs row to render as proper tab content */}

              {/* ── Tabs: Sites / Dashboard ── */}
              <div className="px-5 pb-2 shrink-0 flex items-center gap-1 bg-muted/20 border-b border-border">
                {([
                  { id: 'dashboard' as const, label: 'Dashboard', icon: <LayoutGrid size={12} /> },
                  { id: 'sites' as const, label: 'Sites', icon: <MapPin size={12} /> },
                  { id: 'tagged' as const, label: `Tagged (${taggedSites.length + taggedPolygons.length + taggedLinks.length + customPoints.length})`, icon: <Star size={12} /> },
                  ...(sectorColorMode === 'kpi' && !paramMode && mapKpi ? [{ id: 'kpi' as const, label: 'KPI List', icon: <List size={12} /> }] : []),
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setInventoryTab(tab.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      inventoryTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>

              {true && (
              <>

              {/* ── KPI List tab content (sites/cells with values + threshold filter) ── */}
              {inventoryTab === 'kpi' && sectorColorMode === 'kpi' && !paramMode && mapKpi && (() => {
                type Entry = { key: string; siteName: string; cellName?: string; band?: string; value: number; level: 'green' | 'orange' | 'red' | 'gray' };
                const entries: Entry[] = [];
                // Use full dashboard scope (filteredSites) so the KPI list stays
                // populated even when the map techno/band filter hides everything.
                const sourceSites = mapFilteredSites.length > 0 ? mapFilteredSites : filteredSites;
                const dashBand = dashboardActive ? activeDashboardFilters?.bande ?? null : null;
                const dashTechno = dashboardActive ? activeDashboardFilters?.techno ?? null : null;
                for (const site of sourceSites) {
                  const siteName = site.site_name || site.site_id || '';
                  if (kpiAnalysisLevel === 'site') {
                    const v = getSiteKpiValue(site);
                    const hasValue = v != null && !isNaN(v);
                    entries.push({
                      key: `s:${siteName}`,
                      siteName,
                      value: hasValue ? v : NaN,
                      level: hasValue ? getKpiLevel(v) : 'gray',
                    });
                  } else {
                    const cells = (site as any).cells || [];
                    if (cells.length === 0) {
                      // Fallback: site has no cell-level data → expose a site-level entry
                      // so the user still sees the site (and matches the legend count).
                      const v = getSiteKpiValue(site);
                      const hasValue = v != null && !isNaN(v);
                      entries.push({
                        key: `s:${siteName}`,
                        siteName,
                        value: hasValue ? v : NaN,
                        level: hasValue ? getKpiLevel(v) : 'gray',
                      });
                    } else {
                      for (const c of cells) {
                        // Apply the same visibility filter the legend uses, so the list
                        // and the legend always agree on which cells are counted.
                        if (!isCellVisibleForKpiOverlay(c, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashBand, dashTechno, localTechno, localBande, kpiOverlayVendor, site.vendor)) continue;
                        const cellName = c.cell_id || c.cell_name || '';
                        const v = getCellKpiValue(c, siteName);
                        const hasValue = v != null && !isNaN(v);
                        entries.push({
                          key: `c:${siteName}:${cellName}`,
                          siteName,
                          cellName,
                          band: c.bande || c.band,
                          value: hasValue ? v : NaN,
                          level: hasValue ? getKpiLevel(v) : 'gray',
                        });
                      }
                    }
                  }
                }
                const search = kpiOverlayPanelSearch.trim().toLowerCase();
                const filtered = entries.filter(e => {
                  if (!kpiOverlayPanelLevels.has(e.level)) return false;
                  if (search && !`${e.siteName} ${e.cellName || ''}`.toLowerCase().includes(search)) return false;
                  return true;
                });
                if (kpiOverlayPanelSort !== 'none') {
                  filtered.sort((a, b) => kpiOverlayPanelSort === 'asc' ? a.value - b.value : b.value - a.value);
                }
                const t = kpiThresholds[mapKpi] || { green: 80, orange: 60 };
                const cGreen = t.colorGreen || '#27AE60';
                const cOrange = t.colorOrange || '#f59e0b';
                const cRed = t.colorRed || '#8E44AD';
                const fmt = (n: number) => Number.isFinite(n) ? (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2)) : '–';
                const levelMeta: { id: 'green' | 'orange' | 'red' | 'gray'; label: string; range: string; color: string }[] = t.invert ? [
                  { id: 'green', label: 'Bon', range: `≤ ${t.green}${selectedKpiUnit}`, color: cGreen },
                  { id: 'orange', label: 'Moyen', range: `${t.green}–${t.orange}${selectedKpiUnit}`, color: cOrange },
                  { id: 'red', label: 'Critique', range: `> ${t.orange}${selectedKpiUnit}`, color: cRed },
                  { id: 'gray', label: 'No data', range: '—', color: '#6b7280' },
                ] : [
                  { id: 'green', label: 'Bon', range: `≥ ${t.green}${selectedKpiUnit}`, color: cGreen },
                  { id: 'orange', label: 'Moyen', range: `${t.orange}–${t.green}${selectedKpiUnit}`, color: cOrange },
                  { id: 'red', label: 'Critique', range: `< ${t.orange}${selectedKpiUnit}`, color: cRed },
                  { id: 'gray', label: 'No data', range: '—', color: '#6b7280' },
                ];
                const counts: Record<string, number> = { green: 0, orange: 0, red: 0, gray: 0 };
                for (const e of entries) counts[e.level]++;
                const toggleLevel = (lvl: 'green' | 'orange' | 'red' | 'gray') => {
                  setKpiOverlayPanelLevels(prev => {
                    const next = new Set(prev);
                    if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
                    return next;
                  });
                };
                return (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 animate-fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <List size={12} className="text-primary shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-foreground truncate">{selectedKpiLabel}</span>
                        <span className="text-[9px] font-bold text-muted-foreground shrink-0">({filtered.length}/{entries.length})</span>
                      </div>
                    </div>

                    {/* Threshold range filters */}
                    <div className="px-4 py-2 border-b border-border/30 shrink-0">
                      <div className="text-[8px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Filtrer par seuil</div>
                      <div className="grid grid-cols-2 gap-1">
                        {levelMeta.map(lm => {
                          const active = kpiOverlayPanelLevels.has(lm.id);
                          return (
                            <button
                              key={lm.id}
                              onClick={() => toggleLevel(lm.id)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-left transition-all ${active ? 'bg-card border-border/60' : 'opacity-40 border-border/20 hover:opacity-70'}`}
                            >
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: lm.color }} />
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[9px] font-bold text-foreground leading-tight">{lm.label}</span>
                                <span className="text-[8px] text-muted-foreground leading-tight truncate">{lm.range}</span>
                              </div>
                              <span className="text-[9px] font-black text-foreground tabular-nums">{counts[lm.id]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Search + sort */}
                    <div className="px-4 py-2 border-b border-border/30 shrink-0 flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={kpiOverlayPanelSearch}
                          onChange={(e) => setKpiOverlayPanelSearch(e.target.value)}
                          placeholder="Rechercher site/cellule…"
                          className="w-full h-7 pl-6 pr-2 rounded-md text-[10px] bg-card border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>
                      <button
                        onClick={() => setKpiOverlayPanelSort(s => s === 'desc' ? 'asc' : s === 'asc' ? 'none' : 'desc')}
                        className="h-7 px-2 rounded-md bg-card border border-border/40 text-[9px] font-bold text-foreground hover:bg-muted/60 flex items-center gap-1"
                        title="Trier par valeur"
                      >
                        <ChevronsUpDown size={10} />
                        {kpiOverlayPanelSort === 'desc' ? '↓' : kpiOverlayPanelSort === 'asc' ? '↑' : '–'}
                      </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                      {filtered.length === 0 ? (
                        <div className="px-3 py-6 text-center text-[10px] text-muted-foreground">Aucune entrée</div>
                      ) : (
                        <div className="divide-y divide-border/20">
                          {filtered.slice(0, 500).map(e => {
                            const lm = levelMeta.find(l => l.id === e.level);
                            return (
                              <button
                                key={e.key}
                                onClick={() => {
                                  const targetSite = mapFilteredSites.find(s => (s.site_name || s.site_id) === e.siteName);
                                  if (targetSite) {
                                    const lat = (targetSite as any).latitude ?? targetSite.coordinates?.[0];
                                    const lng = (targetSite as any).longitude ?? targetSite.coordinates?.[1];
                                    if (lat != null && lng != null) {
                                      const m = (window as any).__siteMonitorMap as L.Map | undefined;
                                      if (m) m.flyTo([lat, lng], Math.max(m.getZoom(), 15), { duration: 0.8 });
                                    }
                                    // Select the site → opens detail panel & highlights on map
                                    setSelectedSiteId(targetSite.site_id);
                                    setSelectedSiteSnapshot(targetSite);
                                    // If clicked entry is a specific cell, focus it
                                    if (e.cellName) {
                                      setFocusCellId(e.cellName);
                                      setFocusMode('cell');
                                    } else {
                                      setFocusMode('site');
                                    }
                                  }
                                }}
                                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-card/60 transition-colors text-left"
                              >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: lm?.color || '#6b7280' }} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-bold text-foreground truncate">
                                    {e.cellName || e.siteName}
                                  </div>
                                  {e.cellName && (
                                    <div className="text-[8px] text-muted-foreground truncate">
                                      {e.siteName}{e.band ? ` • ${e.band}` : ''}
                                    </div>
                                  )}
                                </div>
                                <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: lm?.color || 'hsl(var(--foreground))' }}>
                                  {fmt(e.value)}{selectedKpiUnit}
                                </span>
                              </button>
                            );
                          })}
                          {filtered.length > 500 && (
                            <div className="px-3 py-2 text-center text-[9px] text-muted-foreground">
                              +{filtered.length - 500} entrées masquées
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Filters row (sites tab only) ── */}
              {inventoryTab === 'sites' && panelMinimized && (
                <div className="px-5 py-3 shrink-0 grid grid-cols-2 gap-2 animate-fade-in">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Vendor</span>
                    <select value={localVendor} onChange={(e) => setLocalVendor(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">DOR</span>
                    <select value={localDor} onChange={(e) => setLocalDor(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniqueDors.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Cluster</span>
                    <select value={localPlaque} onChange={(e) => setLocalPlaque(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniquePlaques.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Bande</span>
                    <select value={effectiveSidebarBande} onChange={(e) => setLocalBande(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniqueBandes.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Zone ARCEP</span>
                    <select value={localZoneArcep} onChange={(e) => setLocalZoneArcep(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniqueZoneArceps.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Tech</span>
                    <select value={localTechno} onChange={(e) => setLocalTechno(e.target.value as any)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      <option value="ALL">ALL</option>
                      <option value="4G">4G</option>
                      <option value="5G">5G</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── Sort bar (sites tab only) ── */}
              {inventoryTab === 'sites' && (
                <div className="px-5 py-2 flex items-center justify-between shrink-0 border-b border-border/30">
                  <span className="text-[10px] text-muted-foreground font-semibold">{inventoryVisibleSites.length} sites</span>
                  <button
                    onClick={() => setInventorySortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      inventorySortOrder !== 'none'
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    {inventorySortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    <span>{inventorySortOrder === 'none' ? 'Tri' : inventorySortOrder === 'desc' ? '↓ Worst' : '↑ Best'}</span>
                    <span className="text-[9px] opacity-70">{MAP_KPIS.find(k => k.id === mapKpi)?.label?.replace(/Score |Global/g, '') || mapKpi}</span>
                  </button>
                </div>
              )}

              {/* ── Site List (sites tab) ── */}
              {inventoryTab === 'sites' && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {!dashboardActive && !noDashboardMode && !loading && !isSearchActive && searchModeSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Filter size={18} className="text-primary" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider">No Dashboard</span>
                    <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed px-4">
                      Sélectionnez ou créez un dashboard dans l'onglet Dashboard pour charger les sites.
                    </p>
                  </div>
                ) : searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <RefreshCw size={20} className="mb-3 animate-spin text-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Recherche...</span>
                  </div>
                ) : inventoryVisibleSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search size={28} className="mb-3 opacity-20" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">{isSearchActive ? 'Aucun résultat' : 'No sites found'}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const displayed = inventoryVisibleSites.slice(0, 100);
                      // Ensure selected site is always in the list even if beyond first 100
                      if (selectedSiteId && !displayed.find(s => s.site_id === selectedSiteId)) {
                        const sel = inventoryVisibleSites.find(s => s.site_id === selectedSiteId);
                        if (sel) displayed.unshift(sel);
                      }
                      return displayed;
                    })().map(site => {
                      const isSelected = selectedSiteId === site.site_id;
                      const isExpanded = isSelected;
                      const rawCells = isSelected && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0
                        ? siteDetail.cells
                        : site.cells;
                      // Apply dashboard/view filters on cells
                      const siteCells = rawCells.filter(c => {
                        const cellTech = getCellTechGroup(c.techno);
                        if (mapTechnoFilter === '4G' && cellTech !== '4G') return false;
                        if (mapTechnoFilter === '5G' && cellTech !== '5G') return false;
                        if (mapTechnoFilter === 'ALL' && cellTech && !enabledTechnos.has(cellTech)) return false;
                        if (localBande !== 'ALL' && c.bande !== localBande) return false;
                        if (localTechno !== 'ALL' && cellTech !== localTechno) return false;
                        if (activeDashboardFilters?.bande?.length && !activeDashboardFilters.bande.includes(c.bande)) return false;
                        if (activeDashboardFilters?.techno?.length && !activeDashboardFilters.techno.some(t => cellTech === t || c.techno === t)) return false;
                        if (sectorColorMode === 'kpi') {
                          if (!isCellVisibleForKpiOverlay(c, kpiTechnoFilter, enabledTechnos, isBandEnabled, dashboardActive ? activeDashboardFilters?.bande ?? null : null, dashboardActive ? activeDashboardFilters?.techno ?? null : null, localTechno, localBande, kpiOverlayVendor, site.vendor)) return false;
                          if (!isCellVisibleForKpiLegend(c, site.site_name || site.site_id || '')) return false;
                        }
                        return true;
                      }).filter((c, i, arr) => {
                        const k = String(c.cell_id ?? '') + '|' + String(c.techno ?? '') + '|' + String(c.bande ?? '');
                        return arr.findIndex(x => (String(x.cell_id ?? '') + '|' + String(x.techno ?? '') + '|' + String(x.bande ?? '')) === k) === i;
                      });
                      // Show real filtered cells when resolved; otherwise avoid stale backend totals
                      // if this site should have already loaded cell-level data for the current view.
                      const displayedCellCount = siteCells.length > 0
                        ? siteCells.length
                        : ((site.cells?.length || 0) === 0 && cellLoadAttemptedRef.current.has(site.site_id) ? 0 : Number(site.cell_count || 0));
                      // Group sidebar cards by sector number only: one S1 / S2 / S3 card, with all cells inside.
                      const sectors = new Map<string, typeof siteCells>();
                      siteCells.forEach(c => {
                        const sKey = getSidebarSectorKey(c.cell_id);
                        if (!sectors.has(sKey)) sectors.set(sKey, []);
                        sectors.get(sKey)!.push(c);
                      });
                      const sortedSec = Array.from(sectors.entries()).sort(([a], [b]) => getSidebarSectorSortValue(a) - getSidebarSectorSortValue(b));

                      return (
                        <div
                          key={site.site_id}
                          ref={(el) => { if (el) siteRowRefs.current.set(site.site_id, el); }}
                          className="rounded-2xl border-2 border-border bg-card transition-all duration-200 overflow-hidden hover:border-primary/20 hover:shadow-md"
                        >
                          {/* Site row */}
                          <button
                            onClick={() => { handleSiteClick(site); }}
                            onMouseEnter={() => setHoveredSiteId(site.site_id)}
                            onMouseLeave={() => setHoveredSiteId(null)}
                            className="w-full text-left px-4 py-3.5 flex items-center gap-3"
                          >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all bg-muted text-muted-foreground">
                              <MapPin size={18} />
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                              <h4 className="text-[13px] font-extrabold text-foreground tracking-tight uppercase truncate">{site.site_name}</h4>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 min-w-0">
                                <span className="font-mono truncate max-w-[60%]">{site.site_id}</span>
                                <span className="shrink-0">•</span>
                                <span className="uppercase font-semibold truncate shrink-0">{site.vendor}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1 ml-1">
                              {sectorColorMode !== 'topo' && (() => {
                                const siteKpiVal = kpiValues.get(`site:${site.site_name}`) ?? kpiValues.get(`site:${site.site_id}`) ?? (site as any)[mapKpi] ?? site.qoe_score_avg ?? NaN;
                                if (isNaN(siteKpiVal)) return null;
                                return (
                                <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg min-w-[48px]" style={{ background: getKpiColor(siteKpiVal), color: '#fff' }}>
                                  <span className="text-[15px] font-black tracking-tight leading-none">
                                    {siteKpiVal.toFixed(1)}
                                  </span>
                                </div>
                                );
                              })()}
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                                {displayedCellCount} cells
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleTagSite(site); }}
                                className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${isSiteTagged(site.site_id) ? 'text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-400'}`}
                                title={isSiteTagged(site.site_id) ? 'Retirer du tag' : 'Tagger ce site'}
                              >
                                <Star size={14} fill={isSiteTagged(site.site_id) ? 'currentColor' : 'none'} />
                              </button>
                              <ChevronDown size={16} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                           {/* Expanded: sector cards + cell table */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 animate-fade-in">
                              {/* Sector cards row */}
                              <div className="flex items-stretch gap-2 mb-3">
                                {sortedSec.map(([sKey, cells], idx) => {
                                  const isSectorExpanded = expandedSectors.size > 0 ? expandedSectors.has(sKey) : idx === 0;
                                   const TECH_ORDER: Record<string, number> = { '2G': 0, '3G': 1, '4G': 2, '5G': 3 };
                                   const technoGroups = [...new Set(cells.map(c => getCellTechGroup(c.techno)).filter(Boolean) as string[])]
                                     .sort((a, b) => (TECH_ORDER[a] ?? 99) - (TECH_ORDER[b] ?? 99));
                                   const technoLabel = technoGroups.length > 0 ? technoGroups.join(' / ') : '—';
                                  const secPart = getSidebarSectorNumber(sKey);
                                  const eqLabel = getSidebarEquipmentLabel(cells);
                                  return (
                                    <button
                                      key={sKey}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSectors(prev => {
                                          if (prev.has(sKey) && prev.size === 1) return prev;
                                          return new Set([sKey]);
                                        });
                                      }}
                                      className={`flex flex-col items-center justify-center px-5 py-3 rounded-2xl text-[11px] font-bold transition-all min-w-[85px] ${
                                        isSectorExpanded
                                          ? 'bg-primary text-primary-foreground shadow-lg'
                                          : 'bg-card text-foreground border border-border hover:border-primary/30 shadow-sm'
                                      }`}
                                    >
                                      <span className={`text-[10px] font-bold mb-1.5 ${isSectorExpanded ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{technoLabel}</span>
                                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                                        {(() => {
                                          const techs = new Set(cells.map(c => getCellTechGroup(c.techno)).filter(Boolean));
                                          return (
                                            <>
                                              {techs.has('2G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['2G_GROUP'] || '#8E44AD' }} title="2G" />}
                                              {techs.has('3G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['3G_GROUP'] || '#3498DB' }} title="3G" />}
                                              {techs.has('4G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['4G_GROUP'] || '#F39C12' }} title="4G" />}
                                              {techs.has('5G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['5G_GROUP'] || '#27AE60' }} title="5G" />}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      {eqLabel && <span className={`text-[8px] font-bold mb-0.5 ${isSectorExpanded ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>{eqLabel}</span>}
                                      <span className={`text-[14px] font-black ${isSectorExpanded ? 'text-primary-foreground' : 'text-foreground'}`}>S{secPart}</span>
                                      <span className={`text-[9px] mt-0.5 font-semibold ${isSectorExpanded ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{cells.length} cell{cells.length > 1 ? 's' : ''}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Techno legend — only show techs actually present on this site */}
                              {(() => {
                                const siteTechs = new Set(
                                  sortedSec.flatMap(([, cells]) =>
                                    cells.map(c => getCellTechGroup(c.techno)).filter(Boolean) as string[]
                                  )
                                );
                                const legendEntries = ([['2G', bandColors['2G_GROUP'] || '#8E44AD'],['3G', bandColors['3G_GROUP'] || '#3498DB'],['4G', bandColors['4G_GROUP'] || '#F39C12'],['5G', bandColors['5G_GROUP'] || '#27AE60']] as [string,string][])
                                  .filter(([tech]) => siteTechs.has(tech));
                                if (legendEntries.length === 0) return null;
                                return (
                                  <div className="flex items-center gap-4 mb-3 px-1 flex-wrap">
                                    {legendEntries.map(([tech, color]) => {
                                      const isHidden = hiddenTechs.has(tech);
                                      return (
                                        <button key={tech} onClick={(e) => { e.stopPropagation(); setHiddenTechs(prev => { const n = new Set(prev); if (n.has(tech)) n.delete(tech); else n.add(tech); return n; }); }} className="flex items-center gap-1.5 cursor-pointer group">
                                          <span className={`w-3 h-3 rounded-full border-2 transition-all ${isHidden ? 'opacity-30 border-muted-foreground' : 'border-transparent'}`} style={{ background: isHidden ? '#9ca3af' : color }} />
                                          <span className={`text-[10px] font-bold transition-all ${isHidden ? 'text-muted-foreground/40 line-through' : 'text-muted-foreground'}`}>{tech}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const visibleSectorEntries = expandedSectors.size > 0
                                  ? sortedSec.filter(([s]) => expandedSectors.has(s))
                                  : sortedSec.slice(0, 1);
                                const allFiltered = visibleSectorEntries.map(([sKey, cells]) => ({
                                  sKey,
                                  cells: cells.filter(c => !hiddenTechs.has(getCellTechGroup(c.techno) || '4G')),
                                })).filter(g => g.cells.length > 0);
                                if (!allFiltered.length) {
                                  return (
                                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-5 text-center text-[11px] text-muted-foreground">
                                      Aucune cellule visible — réactivez une techno ou sélectionnez un autre secteur.
                                    </div>
                                  );
                                }
                                return (
                                  <div className="space-y-3 animate-fade-in">
                                    {allFiltered.map(({ sKey, cells: sectorCells }) => {
                                      const secPart = getSidebarSectorNumber(sKey);
                                      const eqLabel = getSidebarEquipmentLabel(sectorCells);
                                      return (
                                      <div key={sKey} className="rounded-xl border border-border overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
                                          {eqLabel && <span className="text-[9px] font-bold text-muted-foreground uppercase">{eqLabel}</span>}
                                          <span className="text-[11px] font-black text-primary">S{secPart}</span>
                                          <span className="text-[9px] font-semibold text-muted-foreground">{sectorCells.length} cellule{sectorCells.length > 1 ? 's' : ''}</span>
                                        </div>
                                        <table className="w-full text-[11px]">
                                          <thead>
                                            <tr className="bg-muted/40 border-b border-border">
                                              <th className="px-3 py-1.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tech</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Band</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell State</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              const TG: Record<string, number> = { '2G': 0, '3G': 1, '4G': 2, '5G': 3 };
                                              const unique = Array.from(new Map(sectorCells.map(c => [c.cell_id, c])).values());
                                              return unique.sort((a, b) => (TG[getCellTechGroup(a.techno) || ''] ?? 99) - (TG[getCellTechGroup(b.techno) || ''] ?? 99));
                                            })().map((cell) => {
                                              const isSel = focusCellId === cell.cell_id;
                                              // Cell state fallback chain — backend now composes `cell_state`
                                              // from ref_cell_daily.cell_status with fallback to
                                              // etat_fonctionnement (so cells whose BTS isn't in the latest
                                              // dump still surface a real status). Older cached payloads
                                              // may only have etat_cellule / etat_fonctionnement / oper_state /
                                              // cell_status individually — try each in priority order.
                                              const stateRaw = String(
                                                (cell as any).cell_state
                                                  ?? (cell as any).etat_cellule
                                                  ?? (cell as any).etat_fonctionnement
                                                  ?? (cell as any).cell_status
                                                  ?? (cell as any).oper_state
                                                  ?? ''
                                              ).trim();
                                              const stateUp = stateRaw.toUpperCase();
                                              const isOk = /^(ACTIF|ACTIVE|UP|IN_?SERVICE|OPERATIONAL|ENABLED|ON|MES|UNLOCKED)/.test(stateUp);
                                              const isKo = stateUp !== '' && /(INACTIF|INACTIVE|OUT|DOWN|DISABLED|LOCKED|HS|FAULT|SUSPEND|OFF|SWITCHED_OFF)/.test(stateUp);
                                              const stateColor = isOk ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : isKo ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-muted/40 text-muted-foreground';
                                              return (
                                                <tr
                                                  key={cell.cell_id}
                                                  onClick={(e) => { e.stopPropagation(); handleCellClick(cell.cell_id); }}
                                                  className={`cursor-pointer transition-colors border-b border-border/30 last:border-b-0 ${isSel ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                                                >
                                                  <td title={cell.cell_id} className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">{cell.cell_id}</td>
                                                  <td className="px-2 py-2 text-center">
                                                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white" style={{ backgroundColor: getCellTechGroup(cell.techno) === '5G' ? (bandColors['5G_GROUP'] || '#27AE60') : getCellTechGroup(cell.techno) === '3G' ? (bandColors['3G_GROUP'] || '#3498DB') : getCellTechGroup(cell.techno) === '2G' ? (bandColors['2G_GROUP'] || '#8E44AD') : (bandColors['4G_GROUP'] || '#F39C12') }}>
                                                      {getCellTechGroup(cell.techno) || '4G'}
                                                    </span>
                                                  </td>
                                                  <td className="px-2 py-2 text-center font-semibold text-muted-foreground">{cell.bande || '—'}</td>
                                                  <td className="px-2 py-2 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${stateColor}`} title={stateRaw || 'unknown'}>
                                                      {stateRaw || '—'}
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                    })}
                                  </div>
                                );
                              })()}

                            </div>
                          )}
                        </div>
                      );
                    })}
                    {inventoryVisibleSites.length > 100 && (
                      <div className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        + {inventoryVisibleSites.length - 100} more — refine search
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* ── Tagged Sites tab ── */}
              {inventoryTab === 'tagged' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Display mode toggle */}
                <div className="px-4 pt-3 pb-2 shrink-0">
                  <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
                    {([
                      { id: 'all' as const, label: 'Display All', icon: <Globe size={11} /> },
                      { id: 'tagged-only' as const, label: 'Tagged Only', icon: <Star size={11} /> },
                    ]).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setTaggedDisplayMode(opt.id)}
                        disabled={opt.id === 'tagged-only' && taggedSites.length === 0}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                          taggedDisplayMode === opt.id
                            ? opt.id === 'tagged-only'
                              ? 'bg-yellow-500 text-white shadow-sm'
                              : 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                {/* Search results shown as candidates in Tagged tab */}
                {isSearchActive && searchModeSites.length > 0 ? (
                  <>
                    {searchLoading && (
                      <div className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
                        <RefreshCw size={12} className="animate-spin text-primary" />
                        <span className="text-[10px]">Recherche...</span>
                      </div>
                    )}
                    <div className="mb-2 px-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        {searchModeSites.length} résultat(s) — cliquez pour tagger
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {searchModeSites.map(site => {
                        const alreadyTagged = isSiteTagged(site.site_id);
                        return (
                          <button
                            key={site.site_id}
                            onClick={() => {
                              if (!alreadyTagged) toggleTagSite(site);
                              handleSiteClick(site);
                            }}
                            onMouseEnter={() => setHoveredSiteId(site.site_id)}
                            onMouseLeave={() => setHoveredSiteId(null)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                              alreadyTagged
                                ? 'border-yellow-400/40 bg-yellow-500/5'
                                : 'border-border bg-card hover:border-primary/30 hover:shadow-sm'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <MapPin size={14} className="text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[12px] font-extrabold text-foreground tracking-tight uppercase truncate">{site.site_name}</h4>
                              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5">
                                <span className="uppercase font-semibold">{site.vendor}</span>
                                {site.dor && <><span>•</span><span>{site.dor}</span></>}
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  {site.cells.length === 0 && cellsLoadingCount > 0 ? (
                                    <>
                                      <RefreshCw size={8} className="animate-spin text-primary" />
                                      <span className="text-primary animate-pulse">cells…</span>
                                    </>
                                  ) : (
                                    <>{getSiteDisplayCellCount(site)} cells</>
                                  )}
                                </span>
                              </div>
                            </div>
                            <Star size={14} className={alreadyTagged ? 'text-yellow-400' : 'text-muted-foreground/30'} fill={alreadyTagged ? 'currentColor' : 'none'} />
                          </button>
                        );
                      })}
                    </div>
                    {/* Show existing tagged sites below search results */}
                    {taggedSites.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/50">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 px-1">
                          ★ Sites taggés ({taggedSites.length})
                        </span>
                      </div>
                    )}
                  </>
                ) : taggedSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                      <Star size={18} className="text-yellow-500" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider">Aucun site taggé</span>
                    <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed px-4">
                      Recherchez un site pour le tagger et le garder visible en permanence.
                    </p>
                  </div>
                ) : null}
                {/* Always show tagged sites when not searching or after search candidates */}
                {(!isSearchActive || searchModeSites.length === 0) && taggedSites.length > 0 && (
                  <div className="space-y-2">
                    {taggedSites.map(site => {
                      const isSelected = selectedSiteId === site.site_id;
                      const isExpanded = isSelected;
                      const rawCells2 = isSelected && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0
                        ? siteDetail.cells
                        : site.cells;
                      const siteCells = rawCells2.filter(c => {
                        const cellTech = getCellTechGroup(c.techno);
                        if (mapTechnoFilter === '4G' && cellTech !== '4G') return false;
                        if (mapTechnoFilter === '5G' && cellTech !== '5G') return false;
                        if (mapTechnoFilter === 'ALL' && cellTech && !enabledTechnos.has(cellTech)) return false;
                        if (localBande !== 'ALL' && c.bande !== localBande) return false;
                        if (localTechno !== 'ALL' && cellTech !== localTechno) return false;
                        if (activeDashboardFilters?.bande?.length && !activeDashboardFilters.bande.includes(c.bande)) return false;
                        if (activeDashboardFilters?.techno?.length && !activeDashboardFilters.techno.some(t => cellTech === t || c.techno === t)) return false;
                        return true;
                      }).filter((c, i, arr) => {
                        const k = String(c.cell_id ?? '') + '|' + String(c.techno ?? '') + '|' + String(c.bande ?? '');
                        return arr.findIndex(x => (String(x.cell_id ?? '') + '|' + String(x.techno ?? '') + '|' + String(x.bande ?? '')) === k) === i;
                      });
                      // Same rule in Tagged: avoid stale backend totals once cell loading was attempted.
                      const displayedCellCount = siteCells.length > 0
                        ? siteCells.length
                        : ((site.cells?.length || 0) === 0 && cellLoadAttemptedRef.current.has(site.site_id) ? 0 : Number(site.cell_count || 0));
                      const sectors = new Map<string, typeof siteCells>();
                      siteCells.forEach(c => {
                        const sKey = getSidebarSectorKey(c.cell_id);
                        if (!sectors.has(sKey)) sectors.set(sKey, []);
                        sectors.get(sKey)!.push(c);
                      });
                      const sortedSec = Array.from(sectors.entries()).sort(([a], [b]) => getSidebarSectorSortValue(a) - getSidebarSectorSortValue(b));

                      return (
                        <div
                          key={site.site_id}
                          ref={(el) => { if (el) siteRowRefs.current.set(site.site_id, el); }}
                          className={`rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                            isSelected
                              ? 'border-primary/40 bg-card shadow-lg'
                              : 'border-border bg-card hover:border-primary/20 hover:shadow-md'
                          }`}
                        >
                          <button
                            onClick={() => { handleSiteClick(site); }}
                            onMouseEnter={() => setHoveredSiteId(site.site_id)}
                            onMouseLeave={() => setHoveredSiteId(null)}
                            className="w-full text-left px-4 py-3.5 flex items-center gap-3"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                              isSelected ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-muted text-muted-foreground'
                            }`}>
                              <MapPin size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-extrabold text-foreground tracking-tight uppercase truncate">{site.site_name}</h4>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono">{site.site_id}</span>
                                <span>•</span>
                                <span className="uppercase font-semibold">{site.vendor}</span>
                              </div>
                              {(() => {
                                const coords = normalizeCoordinates(site);
                                if (!coords) return null;
                                return (
                                  <div className="flex flex-wrap gap-x-3 gap-y-0 mt-1 text-[9px] font-mono text-muted-foreground/70">
                                    {coords.lat != null && <span>Lat: {fmtCoord(coords.lat)}</span>}
                                    {coords.lon != null && <span>Lon: {fmtCoord(coords.lon)}</span>}
                                    {coords.x != null && <span>X: {fmtCoord(coords.x, 2)}</span>}
                                    {coords.y != null && <span>Y: {fmtCoord(coords.y, 2)}</span>}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="text-right shrink-0">
                              {sectorColorMode !== 'topo' && (() => {
                                const siteKpiVal = kpiValues.get(`site:${site.site_name}`) ?? kpiValues.get(`site:${site.site_id}`) ?? (site as any)[mapKpi] ?? site.qoe_score_avg ?? NaN;
                                if (isNaN(siteKpiVal)) return null;
                                return (
                                <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg min-w-[48px]" style={{ background: getKpiColor(siteKpiVal), color: '#fff' }}>
                                  <span className="text-[15px] font-black tracking-tight leading-none">
                                    {siteKpiVal.toFixed(1)}
                                  </span>
                                </div>
                                );
                              })()}
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase mt-1">{displayedCellCount} cells</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleTagSite(site); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full transition-all text-yellow-400"
                                title="Retirer du tag"
                              >
                                <Star size={14} fill="currentColor" />
                              </button>
                              <ChevronDown size={16} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 animate-fade-in">
                              <div className="flex items-stretch gap-2 mb-3">
                                {sortedSec.map(([sKey, cells], idx) => {
                                  const isSectorExpanded = expandedSectors.size > 0 ? expandedSectors.has(sKey) : idx === 0;
                                   const TECH_ORDER: Record<string, number> = { '2G': 0, '3G': 1, '4G': 2, '5G': 3 };
                                   const technoGroups = [...new Set(cells.map(c => getCellTechGroup(c.techno)).filter(Boolean) as string[])]
                                     .sort((a, b) => (TECH_ORDER[a] ?? 99) - (TECH_ORDER[b] ?? 99));
                                   const technoLabel = technoGroups.length > 0 ? technoGroups.join(' / ') : '—';
                                  const secPart = getSidebarSectorNumber(sKey);
                                  const eqLabel = getSidebarEquipmentLabel(cells);
                                  return (
                                    <button
                                      key={sKey}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSectors(prev => {
                                          if (prev.has(sKey) && prev.size === 1) return prev;
                                          return new Set([sKey]);
                                        });
                                      }}
                                      className={`flex flex-col items-center justify-center px-5 py-3 rounded-2xl text-[11px] font-bold transition-all min-w-[85px] ${
                                        isSectorExpanded
                                          ? 'bg-primary text-primary-foreground shadow-lg'
                                          : 'bg-card text-foreground border border-border hover:border-primary/30 shadow-sm'
                                      }`}
                                    >
                                      <span className={`text-[10px] font-bold mb-1.5 ${isSectorExpanded ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{technoLabel}</span>
                                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                                        {(() => {
                                          const techs = new Set(cells.map(c => getCellTechGroup(c.techno)).filter(Boolean));
                                          return (
                                            <>
                                              {techs.has('2G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['2G_GROUP'] || '#8E44AD' }} title="2G" />}
                                              {techs.has('3G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['3G_GROUP'] || '#3498DB' }} title="3G" />}
                                              {techs.has('4G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['4G_GROUP'] || '#F39C12' }} title="4G" />}
                                              {techs.has('5G') && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: bandColors['5G_GROUP'] || '#27AE60' }} title="5G" />}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      {eqLabel && <span className={`text-[8px] font-bold mb-0.5 ${isSectorExpanded ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>{eqLabel}</span>}
                                      <span className={`text-[14px] font-black ${isSectorExpanded ? 'text-primary-foreground' : 'text-foreground'}`}>S{secPart}</span>
                                      <span className={`text-[9px] mt-0.5 font-semibold ${isSectorExpanded ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{cells.length} cell{cells.length > 1 ? 's' : ''}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {(() => {
                                const siteTechs = new Set(
                                  sortedSec.flatMap(([, cells]) =>
                                    cells.map(c => getCellTechGroup(c.techno)).filter(Boolean) as string[]
                                  )
                                );
                                const legendEntries = ([['2G', bandColors['2G_GROUP'] || '#8E44AD'],['3G', bandColors['3G_GROUP'] || '#3498DB'],['4G', bandColors['4G_GROUP'] || '#F39C12'],['5G', bandColors['5G_GROUP'] || '#27AE60']] as [string,string][])
                                  .filter(([tech]) => siteTechs.has(tech));
                                if (legendEntries.length === 0) return null;
                                return (
                                  <div className="flex items-center gap-4 mb-3 px-1 flex-wrap">
                                    {legendEntries.map(([tech, color]) => {
                                      const isHidden = hiddenTechs.has(tech);
                                      return (
                                        <button key={tech} onClick={(e) => { e.stopPropagation(); setHiddenTechs(prev => { const n = new Set(prev); if (n.has(tech)) n.delete(tech); else n.add(tech); return n; }); }} className="flex items-center gap-1.5 cursor-pointer group">
                                          <span className={`w-3 h-3 rounded-full border-2 transition-all ${isHidden ? 'opacity-30 border-muted-foreground' : 'border-transparent'}`} style={{ background: isHidden ? '#9ca3af' : color }} />
                                          <span className={`text-[10px] font-bold transition-all ${isHidden ? 'text-muted-foreground/40 line-through' : 'text-muted-foreground'}`}>{tech}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {(() => {
                                const visibleSectorEntries = expandedSectors.size > 0
                                  ? sortedSec.filter(([s]) => expandedSectors.has(s))
                                  : sortedSec.slice(0, 1);
                                const allFiltered = visibleSectorEntries.map(([sKey, cells]) => ({
                                  sKey,
                                  cells: cells.filter(c => !hiddenTechs.has(getCellTechGroup(c.techno) || '4G')),
                                })).filter(g => g.cells.length > 0);
                                if (!allFiltered.length) {
                                  return (
                                    <div className="rounded-xl border border-border bg-muted/10 px-4 py-5 text-center text-[11px] text-muted-foreground">
                                      Aucune cellule visible — réactivez une techno ou sélectionnez un autre secteur.
                                    </div>
                                  );
                                }
                                return (
                                  <div className="space-y-3 animate-fade-in">
                                    {allFiltered.map(({ sKey, cells: sectorCells }) => {
                                      const secPart = getSidebarSectorNumber(sKey);
                                      const eqLabel = getSidebarEquipmentLabel(sectorCells);
                                      return (
                                      <div key={sKey} className="rounded-xl border border-border overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
                                          {eqLabel && <span className="text-[9px] font-bold text-muted-foreground uppercase">{eqLabel}</span>}
                                          <span className="text-[11px] font-black text-primary">S{secPart}</span>
                                          <span className="text-[9px] font-semibold text-muted-foreground">{sectorCells.length} cellule{sectorCells.length > 1 ? 's' : ''}</span>
                                        </div>
                                        <table className="w-full text-[11px]">
                                          <thead>
                                            <tr className="bg-muted/40 border-b border-border">
                                              <th className="px-3 py-1.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tech</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Band</th>
                                              <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell State</th>

                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              const TG: Record<string, number> = { '2G': 0, '3G': 1, '4G': 2, '5G': 3 };
                                              const unique = Array.from(new Map(sectorCells.map(c => [c.cell_id, c])).values());
                                              return unique.sort((a, b) => (TG[getCellTechGroup(a.techno) || ''] ?? 99) - (TG[getCellTechGroup(b.techno) || ''] ?? 99));
                                            })().map((cell) => {
                                              const isSel = focusCellId === cell.cell_id;
                                              // Cell state fallback chain — backend now composes `cell_state`
                                              // from ref_cell_daily.cell_status with fallback to
                                              // etat_fonctionnement (so cells whose BTS isn't in the latest
                                              // dump still surface a real status). Older cached payloads
                                              // may only have etat_cellule / etat_fonctionnement / oper_state /
                                              // cell_status individually — try each in priority order.
                                              const stateRaw = String(
                                                (cell as any).cell_state
                                                  ?? (cell as any).etat_cellule
                                                  ?? (cell as any).etat_fonctionnement
                                                  ?? (cell as any).cell_status
                                                  ?? (cell as any).oper_state
                                                  ?? ''
                                              ).trim();
                                              const stateUp = stateRaw.toUpperCase();
                                              const isOk = /^(ACTIF|ACTIVE|UP|IN_?SERVICE|OPERATIONAL|ENABLED|ON|MES|UNLOCKED)/.test(stateUp);
                                              const isKo = stateUp !== '' && /(INACTIF|INACTIVE|OUT|DOWN|DISABLED|LOCKED|HS|FAULT|SUSPEND|OFF|SWITCHED_OFF)/.test(stateUp);
                                              const stateColor = isOk ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : isKo ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-muted/40 text-muted-foreground';

                                              return (
                                                <tr
                                                  key={cell.cell_id}
                                                  onClick={(e) => { e.stopPropagation(); handleCellClick(cell.cell_id); }}
                                                  className={`cursor-pointer transition-colors border-b border-border/30 last:border-b-0 ${isSel ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                                                >
                                                  <td title={cell.cell_id} className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">{cell.cell_id}</td>
                                                  <td className="px-2 py-2 text-center">
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ backgroundColor: getCellTechGroup(cell.techno) === '5G' ? (bandColors['5G_GROUP'] || '#27AE60') : getCellTechGroup(cell.techno) === '3G' ? (bandColors['3G_GROUP'] || '#3498DB') : getCellTechGroup(cell.techno) === '2G' ? (bandColors['2G_GROUP'] || '#8E44AD') : (bandColors['4G_GROUP'] || '#F39C12') }}>
                                                      {getCellTechGroup(cell.techno) || '4G'}
                                                    </span>
                                                  </td>
                                                  <td className="px-2 py-2 text-center font-semibold text-muted-foreground">{cell.bande || '—'}</td>
                                                  <td className="px-2 py-2 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${stateColor}`} title={stateRaw || 'unknown'}>
                                                      {stateRaw || '—'}
                                                    </span>
                                                  </td>

                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Custom Points Section ── */}
                <div className="mt-4">
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Points personnalisés ({customPoints.length})</div>

                  {customPoints.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {customPoints.map(pt => (
                        <div key={pt.id} data-tagged-id={pt.id} className={`rounded-xl border bg-card transition-all overflow-hidden ${highlightedTaggedId === pt.id ? 'border-primary ring-2 ring-primary/40 animate-pulse' : 'border-border hover:border-primary/20'}`}>
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                              <CircleDot size={14} className="text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {renamingPointId === pt.id ? (
                                <form onSubmit={(e) => { e.preventDefault(); renameCustomPoint(pt.id, renameValue); }} className="flex items-center gap-1">
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={() => renameCustomPoint(pt.id, renameValue)}
                                    className="text-[11px] font-bold bg-muted rounded px-1.5 py-0.5 w-full outline-none border border-primary/30 text-foreground"
                                  />
                                </form>
                              ) : (
                                <>
                                  <div className="text-[11px] font-bold text-foreground truncate">{pt.name}</div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5 text-[9px] font-mono text-muted-foreground/70">
                                    <span>Lat: {pt.lat.toFixed(6)}</span>
                                    <span>Lon: {pt.lon.toFixed(6)}</span>
                                    {pt.x != null && <span>X: {pt.x.toFixed(2)}</span>}
                                    {pt.y != null && <span>Y: {pt.y.toFixed(2)}</span>}
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => { setRenamingPointId(pt.id); setRenameValue(pt.name); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Renommer"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={() => setFlyTarget([pt.lat, pt.lon])}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="Centrer"
                              >
                                <Crosshair size={12} />
                              </button>
                              <button
                                onClick={() => deleteCustomPoint(pt.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                   )}
                </div>

                {/* ── Tagged Polygons Section ── */}
                <div className="mt-4">
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Polygones ({taggedPolygons.length})</div>

                  {taggedPolygons.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {taggedPolygons.map(poly => (
                        <div key={poly.id} data-tagged-id={poly.id} className={`rounded-xl border bg-card transition-all overflow-hidden ${highlightedTaggedId === poly.id ? 'border-primary ring-2 ring-primary/40 animate-pulse' : 'border-border hover:border-primary/20'}`}>
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                              <Pentagon size={14} className="text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {renamingPolygonId === poly.id ? (
                                <form onSubmit={(e) => { e.preventDefault(); renameTaggedPolygon(poly.id, renamePolygonValue); }} className="flex items-center gap-1">
                                  <input
                                    autoFocus
                                    value={renamePolygonValue}
                                    onChange={e => setRenamePolygonValue(e.target.value)}
                                    onBlur={() => renameTaggedPolygon(poly.id, renamePolygonValue)}
                                    className="text-[11px] font-bold bg-muted rounded px-1.5 py-0.5 w-full outline-none border border-primary/30 text-foreground"
                                  />
                                </form>
                              ) : (
                                <>
                                  <div className="text-[11px] font-bold text-foreground truncate">{poly.name}</div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5 text-[9px] font-mono text-muted-foreground/70">
                                    {poly.fmtArea && <span>{poly.fmtArea}</span>}
                                    {poly.fmtPerimeter && <span>{poly.fmtPerimeter}</span>}
                                    {typeof poly.sitesInside === 'number' && <span>{poly.sitesInside} sites</span>}
                                    <span>{poly.points.length} pts</span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => { setRenamingPolygonId(poly.id); setRenamePolygonValue(poly.name); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Renommer"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={() => setFlyTarget(poly.center)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="Centrer"
                              >
                                <Crosshair size={12} />
                              </button>
                              <button
                                onClick={() => deleteTaggedPolygon(poly.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Tagged Links List ── */}
                {taggedLinks.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Liens ({taggedLinks.length})</div>
                    <div className="space-y-1.5">
                      {taggedLinks.map(link => (
                        <div
                          key={link.id}
                          data-tagged-id={link.id}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            highlightedTaggedId === link.id ? 'border-primary ring-2 ring-primary/40 animate-pulse' :
                            selectedLinkId === link.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Network size={14} className="text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0 text-center">
                              <div className="text-[11px] font-bold text-foreground truncate">{link.label}</div>
                              <div className="text-[9px] text-muted-foreground">{link.fromType} ↔ {link.toType}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openLinkTerrainProfile(link)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-primary/10 text-primary transition-colors"
                                title="Profil terrain"
                              >
                                <Crosshair size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedLinkId(link.id);
                                  const midLat = (link.fromCoords[0] + link.toCoords[0]) / 2;
                                  const midLng = (link.fromCoords[1] + link.toCoords[1]) / 2;
                                  setFlyTarget([midLat, midLng]);
                                  // Also fit bounds for proper zoom
                                  setTimeout(() => {
                                    const m = (window as any).__siteMonitorMap as L.Map | undefined;
                                    if (m) {
                                      const bounds = L.latLngBounds([link.fromCoords, link.toCoords]);
                                      m.flyToBounds(bounds, { padding: [80, 80], duration: 0.8, maxZoom: 15 });
                                    }
                                  }, 50);
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                                title="Centrer sur le lien"
                              >
                                <MapPin size={12} />
                              </button>
                              <button
                                onClick={() => deleteTaggedLink(link.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Saved Measurements Section ── */}
                {savedMeasurements.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">
                      📏 Mesures ({savedMeasurements.length})
                    </div>
                    <div className="space-y-1.5">
                      {savedMeasurements.map(m => {
                        const isSelected = selectedMeasurementId === m.id;
                        return (
                          <div
                            key={m.id}
                            className={`rounded-xl border transition-all overflow-hidden cursor-pointer ${
                              isSelected ? 'border-primary/40 bg-primary/5 shadow-md' : 'border-border bg-card hover:border-primary/20'
                            }`}
                            onClick={() => {
                              setSelectedMeasurementId(isSelected ? null : m.id);
                              if (!isSelected) {
                                // Fit map to measurement
                                const midLat = (m.from[0] + m.to[0]) / 2;
                                const midLng = (m.from[1] + m.to[1]) / 2;
                                setFlyTarget([midLat, midLng]);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-primary text-primary-foreground' : 'bg-orange-500/10'
                              }`}>
                                <Ruler size={14} className={isSelected ? '' : 'text-orange-500'} />
                              </div>
                              <div className="flex-1 min-w-0">
                                {renamingMeasurementId === m.id ? (
                                  <form onSubmit={(e) => { e.preventDefault(); renameSavedMeasurement(m.id, measurementRenameValue); }} onClick={e => e.stopPropagation()}>
                                    <input
                                      autoFocus
                                      value={measurementRenameValue}
                                      onChange={e => setMeasurementRenameValue(e.target.value)}
                                      onBlur={() => renameSavedMeasurement(m.id, measurementRenameValue)}
                                      className="text-[11px] font-bold bg-muted rounded px-1.5 py-0.5 w-full outline-none border border-primary/30 text-foreground"
                                    />
                                  </form>
                                ) : (
                                  <>
                                    <div className="text-[11px] font-bold text-foreground truncate">{m.name}</div>
                                    <div className="text-[9px] text-muted-foreground mt-0.5">
                                      {m.label} • {m.azimuth}°
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => { setRenamingMeasurementId(m.id); setMeasurementRenameValue(m.name); }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Renommer"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  onClick={() => {
                                    const midLat = (m.from[0] + m.to[0]) / 2;
                                    const midLng = (m.from[1] + m.to[1]) / 2;
                                    setFlyTarget([midLat, midLng]);
                                    setSelectedMeasurementId(m.id);
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  title="Centrer"
                                >
                                  <Crosshair size={12} />
                                </button>
                                <button
                                  onClick={() => openMeasurementProfile(m)}
                                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-colors"
                                  title="Profil terrain"
                                >
                                  <Mountain size={12} />
                                </button>
                                <button
                                  onClick={() => deleteSavedMeasurement(m.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="px-3 pb-3 pt-1 border-t border-border/30 animate-fade-in">
                                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-muted-foreground">
                                  <div><span className="font-bold text-foreground">A:</span> {m.from[0].toFixed(6)}, {m.from[1].toFixed(6)}</div>
                                  <div><span className="font-bold text-foreground">B:</span> {m.to[0].toFixed(6)}, {m.to[1].toFixed(6)}</div>
                                  <div><span className="font-bold text-foreground">Distance:</span> {m.label}</div>
                                  <div><span className="font-bold text-foreground">Azimut:</span> {m.azimuth}°</div>
                                  <div className="col-span-2"><span className="font-bold text-foreground">Créé:</span> {new Date(m.createdAt).toLocaleString('fr-FR')}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>

                {/* ── Sticky bottom buttons ── */}
                <div className="shrink-0 border-t border-border bg-card px-4 py-3 space-y-2">
                  <button
                    onClick={() => setPointCreationMode(!pointCreationMode)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      pointCreationMode
                        ? 'border-violet-500 bg-violet-500/10 text-violet-600'
                        : 'border-primary/30 text-primary hover:bg-primary/10'
                    }`}
                  >
                    {pointCreationMode ? (
                      <><X size={12} /> Annuler le placement</>
                    ) : (
                      <><Plus size={12} /> Ajouter un point</>
                    )}
                  </button>

                  {!linkCreationMode ? (
                    <button
                      onClick={() => { setLinkCreationMode(true); setLinkSource(null); }}
                      disabled={(taggedSites.length + customPoints.length) < 2}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-primary/30 text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={12} />
                      Créer un lien
                    </button>
                  ) : pendingLink ? (
                    (() => {
                      const fromSite = pendingLink.from.type === 'site' ? taggedSites.find(s => s.site_id === pendingLink.from.id) : null;
                      const toSite = pendingLink.to.type === 'site' ? taggedSites.find(s => s.site_id === pendingLink.to.id) : null;
                      const fromLL: LatLng = { lat: pendingLink.from.coords[0], lng: pendingLink.from.coords[1] };
                      const toLL: LatLng = { lat: pendingLink.to.coords[0], lng: pendingLink.to.coords[1] };
                      const distM = haversineDistance(fromLL, toLL);
                      const azFromTo = bearing(fromLL, toLL);
                      const azToFrom = bearing(toLL, fromLL);
                      // Use canonical band keys (NR700, NR2100, NR3500, L800, L1800, ...) so raw bande
                      // strings like "NR_2100", "N1", "N28", "B1" still surface as the right band.
                      const canonOf = (c: any) => normalizeBandKey(String(c.bande || ''), c.techno) as string | null;
                      const listCanonBands = (cells: any[]): string[] => {
                        const set = new Set<string>();
                        for (const c of cells) {
                          const k = canonOf(c);
                          if (k) set.add(k);
                        }
                        // Sort: 5G (NR…) → 4G (L…) → 3G (UMTS…) → 2G (GSM…)
                        const order = (b: string) => b.startsWith('NR') ? 0 : b.startsWith('L') ? 1 : b.startsWith('UMTS') ? 2 : 3;
                        return Array.from(set).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
                      };
                      const fromBands = fromSite ? listCanonBands(fromSite.cells) : [];
                      const toBands = toSite ? listCanonBands(toSite.cells) : [];
                      const fromBand = pendingLink.fromBand ?? fromBands[0] ?? null;
                      const toBand = pendingLink.toBand ?? toBands[0] ?? null;
                      const fromBandCells = fromSite && fromBand ? fromSite.cells.filter(c => canonOf(c) === fromBand) : [];
                      const toBandCells = toSite && toBand ? toSite.cells.filter(c => canonOf(c) === toBand) : [];
                      const pickAuto = (cells: any[], targetAz: number) => {
                        if (!cells.length) return null;
                        let best: any = null;
                        for (const c of cells) {
                          const az = Number(c.azimut);
                          if (!Number.isFinite(az)) continue;
                          const d = Math.abs(((targetAz - az) % 360 + 540) % 360 - 180);
                          if (!best || d < best.azimuthDelta) best = { ...c, azimuthDelta: d };
                        }
                        return best;
                      };
                      const fromAuto = pickAuto(fromBandCells, azFromTo);
                      const toAuto = pickAuto(toBandCells, azToFrom);
                      const fromCell = fromSite
                        ? (pendingLink.fromCellOverride
                            ? fromBandCells.find(c => c.cell_id === pendingLink.fromCellOverride) ?? fromAuto
                            : fromAuto)
                        : null;
                      const toCell = toSite
                        ? (pendingLink.toCellOverride
                            ? toBandCells.find(c => c.cell_id === pendingLink.toCellOverride) ?? toAuto
                            : toAuto)
                        : null;
                      const ready = (!fromSite || !!fromCell) && (!toSite || !!toCell);

                      const renderSide = (
                        title: string,
                        site: typeof fromSite,
                        bands: string[],
                        band: string | null,
                        bandCells: typeof fromBandCells,
                        cell: typeof fromCell,
                        targetAz: number,
                        onPickBand: (b: string) => void,
                        onPickCell: (id: string | null) => void,
                      ) => {
                        if (!site) return null;
                        return (
                          <div className="rounded-lg border border-border/50 bg-card/60 p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-bold text-foreground uppercase tracking-wider">{title}</div>
                              <div className="text-[9px] text-muted-foreground font-mono">AZ cible: {targetAz.toFixed(1)}°</div>
                            </div>
                            <div className="text-[11px] font-semibold text-foreground truncate">🏗 {site.site_name}</div>
                            {bands.length === 0 ? (
                              <div className="text-[10px] text-destructive">Aucune bande disponible sur ce site.</div>
                            ) : (
                              <>
                                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Bandes</div>
                                <div className="flex flex-wrap gap-1">
                                  {bands.map(b => (
                                    <button
                                      key={b}
                                      onClick={() => onPickBand(b)}
                                      className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                                        b === band ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 text-foreground border-border'
                                      }`}
                                    >{b}</button>
                                  ))}
                                </div>
                              </>
                            )}
                            {band && (
                              bandCells.length === 0 ? (
                                <div className="text-[10px] text-destructive">Aucun secteur trouvé sur la bande {band}.</div>
                              ) : (
                                <>
                                  {cell && (

                                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/40 p-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
                                      <div className="col-span-2 text-[9px] font-bold uppercase tracking-wider text-emerald-600">Secteur sélectionné</div>
                                      <div><span className="text-muted-foreground">Cell:</span> <span className="font-bold text-foreground">{cell.cell_id}</span></div>
                                      <div><span className="text-muted-foreground">Techno:</span> <span className="font-bold text-foreground">{cell.techno || '—'}</span></div>
                                      <div><span className="text-muted-foreground">Bande:</span> <span className="font-bold text-foreground">{cell.bande}</span></div>
                                      <div><span className="text-muted-foreground">AZ:</span> <span className="font-bold text-foreground">{Number(cell.azimut).toFixed(0)}°</span></div>
                                      <div><span className="text-muted-foreground">Tilt:</span> <span className="font-bold text-foreground">{cell.tilt != null ? `${Number(cell.tilt).toFixed(1)}°` : '—'}</span></div>
                                      <div><span className="text-muted-foreground">HBA:</span> <span className="font-bold text-foreground">{cell.hba != null ? `${cell.hba} m` : '—'}</span></div>
                                      <div className="col-span-2"><span className="text-muted-foreground">Δ azimut cible:</span> <span className="font-bold text-emerald-600">{(cell as any).azimuthDelta != null ? `${(cell as any).azimuthDelta.toFixed(1)}°` : '—'}</span></div>
                                    </div>
                                  )}
                                </>
                              )
                            )}
                          </div>
                        );
                      };

                      return (
                        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Configuration du lien</div>
                            <div className="text-[9px] text-muted-foreground font-mono">{(distM / 1000).toFixed(2)} km</div>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {pendingLink.from.label} → {pendingLink.to.label}
                          </div>
                          {renderSide(
                            'Source',
                            fromSite,
                            fromBands,
                            fromBand,
                            fromBandCells,
                            fromCell,
                            azFromTo,
                            (b) => setPendingLink(p => p ? { ...p, fromBand: b, fromCellOverride: null } : p),
                            (id) => setPendingLink(p => p ? { ...p, fromCellOverride: id } : p),
                          )}
                          {renderSide(
                            'Destination',
                            toSite,
                            toBands,
                            toBand,
                            toBandCells,
                            toCell,
                            azToFrom,
                            (b) => setPendingLink(p => p ? { ...p, toBand: b, toCellOverride: null } : p),
                            (id) => setPendingLink(p => p ? { ...p, toCellOverride: id } : p),
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              disabled={!ready}
                              onClick={() => {
                                const fs: TaggedLinkSector | null = fromCell ? {
                                  cell_id: fromCell.cell_id, bande: fromCell.bande, techno: fromCell.techno,
                                  azimut: Number(fromCell.azimut), tilt: fromCell.tilt ?? null, hba: fromCell.hba ?? null,
                                  azimuthDelta: (fromCell as any).azimuthDelta,
                                } : null;
                                const ts: TaggedLinkSector | null = toCell ? {
                                  cell_id: toCell.cell_id, bande: toCell.bande, techno: toCell.techno,
                                  azimut: Number(toCell.azimut), tilt: toCell.tilt ?? null, hba: toCell.hba ?? null,
                                  azimuthDelta: (toCell as any).azimuthDelta,
                                } : null;
                                commitTaggedLink(pendingLink.from, pendingLink.to, { fromSector: fs, toSector: ts });
                              }}
                              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Confirmer le lien
                            </button>
                            <button
                              onClick={() => setPendingLink(null)}
                              className="px-3 py-2 rounded-lg border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors uppercase tracking-wider"
                            >
                              Retour
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                      <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Sélection du lien</div>
                      <div className="text-[10px] text-muted-foreground">
                        {!linkSource ? 'Cliquez sur un objet source' : `Source: ${linkSource.label} — cliquez sur la destination`}
                      </div>
                      {taggedSites.map(s => (
                        <button
                          key={s.site_id}
                          onClick={() => handleSelectTaggedForLink(s)}
                          disabled={linkSource?.id === s.site_id}
                          className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                            linkSource?.id === s.site_id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'
                          } disabled:opacity-50`}
                        >
                          🏗 {s.site_name}
                        </button>
                      ))}
                      {customPoints.map(pt => {
                        const ptObj = { id: pt.id, type: 'point' as const, label: pt.name, coords: [pt.lat, pt.lon] as [number, number] };
                        return (
                          <button
                            key={pt.id}
                            onClick={() => {
                              if (!linkSource) {
                                setLinkSource(ptObj);
                              } else if (linkSource.id !== pt.id) {
                                addTaggedLink(linkSource, ptObj);
                              }
                            }}
                            disabled={linkSource?.id === pt.id}
                            className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                              linkSource?.id === pt.id ? 'bg-primary text-primary-foreground' : 'bg-violet-500/10 hover:bg-violet-500/20 text-foreground'
                            } disabled:opacity-50`}
                          >
                            📌 {pt.name}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => { setLinkCreationMode(false); setLinkSource(null); setPendingLink(null); }}
                        className="w-full text-center text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* ── Dashboard tab ── */}
               <div style={{ display: inventoryTab === 'dashboard' ? 'contents' : 'none' }}>
                <DashboardInventoryTab
                  onApplyView={(settings) => {
                    // Track view activation
                    if (settings._viewId) {
                      setActiveViewId(settings._viewId);
                      setActiveViewType(settings.viewType || null);
                    } else if (settings._isDashboardOnly) {
                      setActiveViewId(null);
                      setActiveViewType(null);
                    }

                    // Restore KPI overlays from view settings
                    const overlays: string[] = Array.isArray(settings.kpiOverlays) ? settings.kpiOverlays.filter((k: string) => MAP_KPIS.some(m => m.id === k)) : [];
                    // Backward compat: single kpiOverlay
                    if (!overlays.length && settings.kpiOverlay && MAP_KPIS.some(k => k.id === settings.kpiOverlay)) {
                      overlays.push(settings.kpiOverlay);
                    }
                    // Backward compat: populate from mapKpi if overlays still empty
                    if (!overlays.length && settings.mapKpi && MAP_KPIS.some(k => k.id === settings.mapKpi)) {
                      overlays.push(settings.mapKpi);
                    }
                    setKpiOverlays(overlays);

                    // Handle new view type configs (KPI Overlay / Topology Search)
                    if (settings.viewType === 'kpi_overlay' && settings.kpiOverlayConfig) {
                      // Switching to a KPI Overlay view must turn OFF parameter mode
                      // so the top bar selector flips from PARAM → KPI.
                      if (paramMode || paramConfirmed) {
                        setParamMode(false);
                        setParamConfirmed(null);
                        setParamSelected(null);
                        setParamPoints([]);
                        setParamPanelOpen(false);
                      }
                      const cfg = settings.kpiOverlayConfig;
                      // Activate the Voronoï KPI Overlay layer (drop-in
                      // module) in parallel with the existing per-sector
                      // KPI coloring. Both consume `cfg.kpis`, so the two
                      // visualisations stay in sync.
                      const kpiList = Array.isArray(cfg.kpis)
                        ? cfg.kpis.map((k: any) => k?.kpiKey).filter((x: any): x is string => typeof x === 'string')
                        : [];
                      if (kpiList.length > 0 && cfg.dateFrom && cfg.dateTo) {
                        setActiveKpiOverlayView({
                          name: settings.name || 'KPI Overlay',
                          tech: (cfg.technology as '4G' | '5G') || '4G',
                          level: cfg.level === 'site' ? 'Site' : 'Cellule',
                          period: [cfg.dateFrom, cfg.dateTo],
                          selectedKpis: kpiList,
                        });
                        // 2026-05-11 second revert (v6.3.0): KPI Overlay
                        // owns its own per-cell Voronoï layer again; VC
                        // is shut down so the two don't paint over each
                        // other.
                        setShowVisualCoverage(false);
                      }
                      if (cfg.technology) setKpiTechnoFilter(cfg.technology);
                      if (cfg.level) setKpiAnalysisLevel(cfg.level);
                      if (cfg.dateFrom) setKpiDateFrom(cfg.dateFrom);
                      if (cfg.dateTo) setKpiDateTo(cfg.dateTo);
                      setKpiOverlayLocked(true);
                      setSectorColorMode('kpi');
                      setShowKpiLegend(true);
                      // Force-enable sector beams + sites display mode so cell-level KPI overlay
                      // becomes visible as soon as zoom permits (>= SITES_TO_CELLS_ZOOM).
                      if (cfg.level === 'cell') {
                        setShowBeamSectors(true);
                        setMapDisplayMode('sites');
                      }
                      // Apply KPI overlays from view config — accept all KPIs (catalog may still be loading)
                      const cfgOverlays = (cfg.kpis || []).map((k: any) => k.kpiKey).filter(Boolean);
                      console.log('[KPI Overlay] View activated:', { cfgOverlays, technology: cfg.technology, level: cfg.level, dateFrom: cfg.dateFrom, dateTo: cfg.dateTo });
                      if (cfgOverlays.length > 0) {
                        setKpiOverlays(cfgOverlays);
                        setMapKpi(cfgOverlays[0]);
                      }
                      // Apply custom thresholds from view config
                      const viewThresholds: Record<string, any> = {};
                      for (const kpiCfg of cfg.kpis || []) {
                        if (kpiCfg.thresholds?.length >= 2) {
                          viewThresholds[kpiCfg.kpiKey] = {
                            green: kpiCfg.thresholds[kpiCfg.thresholds.length - 1]?.min ?? 50,
                            orange: kpiCfg.thresholds[1]?.min ?? 10,
                          };
                        }
                      }
                      if (Object.keys(viewThresholds).length > 0) {
                        setKpiThresholds(prev => ({ ...prev, ...viewThresholds }));
                      }
                    } else {
                      // Switching away from kpi_overlay (or dashboard-only) ⇒
                      // retire the Voronoï KPI overlay layer. Without this,
                      // the legend keeps the last view's data and the polygons
                      // linger over the basemap until the next view loads.
                      if (settings.viewType !== 'kpi_overlay') {
                        setActiveKpiOverlayView(null);
                      }
                    }
                    if (settings.viewType === 'parameter' && settings.paramFilters) {
                      // Activate parameter mode with the view's parameter config
                      const pf = settings.paramFilters;
                      if (pf.parameter) {
                        setParamMode(true);
                        setParamConfirmed(pf.parameter);
                        setParamSelected(pf.parameter);
                        setSectorColorMode('topo');
                        setShowBeamSectors(false);
                        setMapDisplayMode('points');
                        setKpiOverlayLocked(false);
                        // Load parameter data via /topo/param-map
                        setParamLoading(true);
                        (async () => {
                          try {
                            const qs = new URLSearchParams({ param: pf.parameter, limit: '10000' });
                            if (pf.vendor) qs.set('vendor', pf.vendor);
                            if (pf.bande) qs.set('bande', pf.bande);
                            if (pf.site_name) qs.set('site_name', pf.site_name);
                            if (pf.cell_name) qs.set('cell_name', pf.cell_name);
                            if (pf.value) qs.set('value', pf.value);
                            // Also apply dashboard filters if present
                            const df = settings.siteFilters || {};
                            if (df.dor?.length) qs.set('dor', df.dor[0]);
                            if (df.vendor?.length) qs.set('vendor', df.vendor[0]);
                            if ((df as any).cluster?.length) qs.set('cluster', (df as any).cluster[0]);
                            const { getVpsProxyUrl, getVpsProxyHeaders } = await import('@/lib/apiConfig');
                            const url = getVpsProxyUrl('parser', `/api/v1/topo/param-map?${qs}`);
                            const resp = await fetch(url, { headers: getVpsProxyHeaders() });
                            const json = await resp.json();
                            const sites = json.sites || [];
                            const points: typeof paramPoints = [];
                            let id = 0;
                            for (const site of sites) {
                              for (const cell of (site.cells || [])) {
                                if (site.latitude && site.longitude) {
                                  points.push({
                                    id: id++,
                                    cell_name: cell.cell_name || null,
                                    site_name: site.site_name || null,
                                    latitude: site.latitude,
                                    longitude: site.longitude,
                                    parameter: pf.parameter,
                                    value: cell.value ?? null,
                                    bande: cell.bande || null,
                                    vendor: site.constructeur || null,
                                    dn: null,
                                  });
                                }
                              }
                            }
                            setParamPoints(points);
                          } catch (err) {
                            console.warn('[SitesMonitor] param view load failed', err);
                            setParamPoints([]);
                          } finally {
                            setParamLoading(false);
                          }
                        })();
                      }
                    } else {
                      setParamMode(false);
                      setKpiOverlayLocked(false);
                      // Restore techno and analysis level from view (legacy)
                      if (settings.kpiTechno && (settings.kpiTechno === '4G' || settings.kpiTechno === '5G')) {
                        setKpiTechnoFilter(settings.kpiTechno);
                      }
                      if (settings.kpiAnalysisLevel && ['site', 'cell', 'band'].includes(settings.kpiAnalysisLevel)) {
                        setKpiAnalysisLevel(settings.kpiAnalysisLevel);
                      }
                    }

                    if (overlays.length > 0 && settings.viewType !== 'kpi_overlay') {
                      setMapKpi(overlays[overlays.length - 1]);
                      setSectorColorMode('kpi');
                    } else if (settings._isDashboardOnly) {
                      setKpiOverlays([]);
                      setSectorColorMode('topo');
                      setKpiOverlayLocked(false);
                    }

                    if (settings.mapLayer) setMapLayer(settings.mapLayer);
                    if (settings.mapKpi && MAP_KPIS.some(k => k.id === settings.mapKpi)) setMapKpi(settings.mapKpi);
                    if (settings.center && Array.isArray(settings.center)) {
                      if (settings.center && (settings.center as [number, number])[0] > 41 && (settings.center as [number, number])[0] < 52) setFlyTarget(settings.center as [number, number]);
                    }

                    // Reset all local filters first, then apply merged siteFilters
                    setLocalDor('ALL');
                    setLocalVendor('ALL');
                    setLocalPlaque('ALL');
                    setLocalBande('ALL');
                    setLocalTechno('ALL');
                    setLocalZoneArcep('ALL');

                    // Determine new effective filters
                    const newFilters = (settings.siteFilters && Object.keys(settings.siteFilters).length > 0)
                      ? settings.siteFilters as DashboardSiteFilters
                      : null;
                    const nextScope = settings.siteScope || null;

                    // Invalidate cache & force reload when filters change
                    // Always invalidate caches on view/dashboard apply to avoid stale data
                    invalidateDashboardSitesCache();
                    invalidateBboxCache();
                    invalidateSiteCellsCache();
                    cellLoadingRef.current.clear();
                    cellLoadAttemptedRef.current.clear();

                    // Apply merged site filters (dashboard + view already merged via mergeSiteFilters)
                    setActiveSiteScope(nextScope);
                    if (newFilters) {
                      setActiveDashboardFilters(newFilters);
                      if (newFilters.dor?.length) setLocalDor(newFilters.dor[0]);
                      if (newFilters.vendor?.length) setLocalVendor(newFilters.vendor[0]);
                      if (newFilters.plaque?.length) setLocalPlaque(newFilters.plaque[0]);
                      if (newFilters.techno?.length) setLocalTechno(newFilters.techno[0] as any);
                      if (newFilters.bande?.length) setLocalBande(newFilters.bande[0]);
                      if (newFilters.zone_arcep?.length) setLocalZoneArcep(newFilters.zone_arcep[0]);
                    } else if (settings.siteScope) {
                      setActiveSiteScope(settings.siteScope);
                      setActiveDashboardFilters(null);
                      const scope = settings.siteScope as SiteScope;
                      if (scope.type === 'DOR' && scope.value) setLocalDor(scope.value);
                      else if (scope.type === 'Plaque' && scope.value) setLocalPlaque(scope.value);
                    } else if (settings._isDashboardOnly) {
                      setActiveDashboardFilters(null);
                    }

                    // Force data reload
                    setDashboardRefreshTick(t => t + 1);
                    // Apply view filters (topo + qoe)
                    if (Array.isArray(settings.viewFilters) && settings.viewFilters.length > 0) {
                      setActiveViewFilters(settings.viewFilters);
                      for (const f of settings.viewFilters) {
                        if (f.mode === 'topo') {
                          if (f.tech) {
                            const t = f.tech === '4G' ? '4G' : f.tech === '5G' ? '5G' : 'ALL';
                            setLocalTechno(t as any);
                          }
                          if ((f.attribute === 'vendor' || f.attribute === 'constructeur') && f.value) setLocalVendor(f.value);
                          if (f.attribute === 'bande' && f.value) setLocalBande(f.value);
                          if (f.attribute === 'zone_arcep' && f.value) setLocalZoneArcep(f.value);
                        }
                      }
                    } else {
                      setActiveViewFilters([]);
                    }
                    // Apply advanced view conditions
                    if (Array.isArray(settings.viewConditions) && settings.viewConditions.length > 0) {
                      setActiveViewConditions(settings.viewConditions);
                    } else {
                      setActiveViewConditions([]);
                    }
                    // Apply map label fields
                    if (Array.isArray(settings.mapLabelFields)) {
                      setMapLabelFields(new Set(settings.mapLabelFields));
                    }
                  }}
                  onDashboardActiveChange={(active, scope, siteFilters) => {
                    // Detect if the dashboard context actually changed to avoid unnecessary reloads
                    const prevFilterKey = JSON.stringify(activeDashboardFilters);
                    const newFilterKey = JSON.stringify(siteFilters || null);
                    const filtersChanged = prevFilterKey !== newFilterKey;
                    const scopeChanged = JSON.stringify(activeSiteScope) !== JSON.stringify(scope || null);
                    const wasActive = dashboardActive;

                    setDashboardActive(active);
                    // Stay on the Dashboard tab when activating from the dashboard panel
                    setActiveSiteScope(scope || null);
                    setActiveDashboardFilters(siteFilters || null);

                    // Only invalidate cache & force reload when filters/scope actually changed or going inactive→active
                    if (filtersChanged || scopeChanged || !wasActive) {
                      if (filtersChanged || scopeChanged) {
                        invalidateDashboardSitesCache();
                        invalidateBboxCache();
                      }
                      setDashboardRefreshTick(t => t + 1);
                      invalidateSiteCellsCache();
                      cellLoadingRef.current.clear();
                      cellLoadAttemptedRef.current.clear();
                      // Force map to fit to new dashboard sites — only when activating
                      if (active) setDashboardFitKey(k => k + 1);
                    }

                    setSelectedSiteId(null);
                    setSelectedSiteSnapshot(null);
                    setSiteDetail(null);
                    setExpandedSectors(new Set());
                    // Always reset local filters first, then apply dashboard-specific ones
                    setLocalDor('ALL');
                    setLocalPlaque('ALL');
                    setLocalVendor('ALL');
                    setLocalBande('ALL');
                    setLocalZoneArcep('ALL');
                    setLocalTechno('ALL');
                    // Reset active view on dashboard switch
                    setActiveViewId(null);
                    if (!active) {
                       // Keep the map populated after deactivating a dashboard:
                       // switch to "no dashboard" mode so global sites keep loading
                       // instead of clearing the map. Preserve current map view —
                       // do not recenter / fitBounds when deactivating.
                       skipNextNoDashFitRef.current = true;
                       initialFitDoneRef.current = true;
                       setNoDashboardMode(true);
                       setActiveDashboardId(null);
                    } else if (siteFilters && Object.keys(siteFilters).length > 0) {
                      // Apply multi-filters from dashboard
                      if (siteFilters.dor?.length === 1) setLocalDor(siteFilters.dor[0]);
                      else if (siteFilters.dor?.length) setLocalDor(siteFilters.dor[0]);
                      if (siteFilters.vendor?.length === 1) setLocalVendor(siteFilters.vendor[0]);
                      if (siteFilters.plaque?.length === 1) setLocalPlaque(siteFilters.plaque[0]);
                      if (siteFilters.techno?.length === 1) setLocalTechno(siteFilters.techno[0] as any);
                      if (siteFilters.bande?.length === 1) setLocalBande(siteFilters.bande[0]);
                      if (siteFilters.zone_arcep?.length === 1) setLocalZoneArcep(siteFilters.zone_arcep[0]);
                    } else if (scope) {
                      if (scope.type === 'DOR' && scope.value) setLocalDor(scope.value);
                      else if (scope.type === 'Plaque' && scope.value) setLocalPlaque(scope.value);
                    }
                  }}
                  beamVisibility={beamVisibility}
                  onBeamVisChange={(v) => { setBeamVisibility(v); localStorage.setItem('osmosis_beam_visibility', String(v)); }}
                  onSaveDashboard={(dbId) => saveDashboardSettings(dbId)}
                  onLoadDashboard={(dbId) => loadDashboardSettings(dbId)}
                  isSaving={dashboardSaving}
                  backendFilterDefs={backendFilterDefs}
                  activeDashboardId={activeDashboardId}
                  onActiveDashboardIdChange={setActiveDashboardId}
                  activeViewId={activeViewId}
                  onActiveViewIdChange={setActiveViewId}
                  kpiOverlays={kpiOverlays.map(id => {
                    const kpiDef = MAP_KPIS.find(k => k.id === id);
                    return { id, label: kpiDef?.label || id };
                  })}
                  overlayVersion={overlayVersion}
                  resolveKpiLabel={(id) => MAP_KPIS.find(k => k.id === id)?.label || id}
                  activeKpiOverlayId={mapKpi}
                  onActivateKpiOverlay={(kpiId) => { setMapKpi(kpiId); setSectorColorMode('kpi'); setShowBeamSectors(true); setMapDisplayMode('sites'); }}
                  onRemoveKpiOverlay={(kpiId) => {
                    const next = kpiOverlays.filter(k => k !== kpiId);
                    setKpiOverlays(next);
                    // If removing the active mapKpi, switch to last remaining or topo
                    if (mapKpi === kpiId) {
                      if (next.length > 0) {
                        setMapKpi(next[next.length - 1]);
                      } else {
                        setSectorColorMode('topo');
                      }
                    }
                    // Persist to view
                    if (activeViewId) {
                      mapViewsApi.list().then(views => {
                        const view = views.find((v: any) => v.id === activeViewId);
                        if (view) {
                          const curSettings = typeof view.settings === 'object' ? view.settings : {};
                          mapViewsApi.update(activeViewId, { settings: { ...curSettings, kpiOverlays: next } })
                            .then(() => setOverlayVersion(v => v + 1));
                        }
                      });
                    }
                  }}
                  catalogKpisForModal={MAP_KPIS.map(k => ({ key: k.id, label: k.label, famille: k.category, techno: k.techno || 'all', threshold_warning: null, threshold_critical: null }))}
                  noDashboardMode={noDashboardMode}
                  onToggleNoDashboardMode={() => setNoDashboardMode(v => !v)}
                  onCoveragePanelMount={setCoveragePanelNode}
                />
               </div>
              </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid/Table overlay when not in map mode */}
      {viewMode !== 'map' && (
        <div className="absolute inset-0 z-[999] bg-background overflow-y-auto pt-20 px-10 pb-32">
          {filteredSites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-muted-foreground opacity-50">
              <Search size={48} className="mb-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">No matching nodes found</span>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {filteredSites.map(site => (
                <div key={site.site_id} onClick={() => { handleSiteClick(site); setViewMode('map'); }}
                  className="group bg-card border border-border rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-2xl hover:border-primary hover:-translate-y-1 cursor-pointer">
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                      <MapPin size={24} />
                    </div>
                    <div className="text-right">
                      <div className="text-[16px] font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{(site.qoe_score_avg ?? 0).toFixed(1)}%</div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Site QoE</div>
                    </div>
                  </div>
                  <h4 className="text-[15px] font-black text-foreground tracking-tight uppercase mb-2 truncate group-hover:text-primary transition-colors">{site.site_name}</h4>
                  <div className="flex items-center gap-2 mb-8">
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{site.site_id}</span>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <span className="text-[9px] font-black text-muted-foreground uppercase">{site.vendor}</span>
                  </div>
                  <div className="pt-6 border-t border-border flex items-center justify-between">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                      {site.cells?.length === 0 && cellsLoadingCount > 0
                        ? <><RefreshCw size={10} className="animate-spin text-primary" /><span className="text-primary animate-pulse">cells…</span></>
                        : getSiteDisplayCellCount(site) > 0 ? `${getSiteDisplayCellCount(site)} CELLS` : '—'}
                    </span>
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all"><ArrowRight size={16} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-[3rem] border border-border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/50 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-10 py-6">Site Identity</th>
                    <th className="px-6 py-6 text-center">Vendor</th>
                    <th className="px-6 py-6 text-center">Cells</th>
                    <th className="px-6 py-6 text-center">QoE Score</th>
                    <th className="px-10 py-6 text-right">Drill down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSites.map(site => (
                    <tr key={site.site_id} onClick={() => { handleSiteClick(site); setViewMode('map'); }} className="group hover:bg-primary/5 transition-all cursor-pointer">
                      <td className="px-10 py-6">
                        <div className="text-[14px] font-black text-foreground uppercase tracking-tight">{site.site_name}</div>
                        <div className="text-[9px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">{site.site_id} • {site.dor}</div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span className="px-2.5 py-1 bg-sidebar text-sidebar-foreground rounded-lg text-[8px] font-black uppercase">{site.vendor}</span>
                      </td>
                      <td className="px-6 py-6 text-center font-black text-muted-foreground text-[11px]">{getSiteDisplayCellCount(site) > 0 ? getSiteDisplayCellCount(site) : '—'}</td>
                      <td className="px-6 py-6 text-center">
                        <div className="text-lg font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{(site.qoe_score_avg ?? 0).toFixed(1)}%</div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <span className="text-[10px] font-black uppercase text-muted-foreground group-hover:text-primary">View <ChevronRight size={14} className="inline" /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {showRightPanel && (
      <div className={`absolute z-[1200] bg-card border-l border-border overflow-hidden flex flex-col transition-all duration-300 ${
        detailFullscreen
          ? 'inset-0'
          : 'top-0 right-0 bottom-0 w-[540px]'
      }`}>
        {/* Breadcrumb bar */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between shrink-0 bg-muted/30">
          <div className="flex items-center gap-1.5 text-[11px]">
            <button onClick={handleBackToGlobal} className={`transition-colors ${focusMode === 'global' ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
              Global
            </button>
            {focusMode !== 'global' && siteDetail && (
              <>
                <ChevronRight size={10} className="text-muted-foreground" />
                <button onClick={handleBackToSite} className={`transition-colors truncate max-w-[160px] ${focusMode === 'site' ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                  {siteDetail.site_name}
                </button>
                {loadingCellsForSite && (
                  <span className="inline-flex items-center gap-1 ml-1.5 text-[9px] text-primary/80 font-medium animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-ping" />
                    cells…
                  </span>
                )}
              </>
            )}
            {focusMode !== 'global' && !siteDetail && loadingCellsForSite && (
              <>
                <ChevronRight size={10} className="text-muted-foreground" />
                <span className="inline-flex items-center gap-1 text-[9px] text-primary/80 font-medium animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-ping" />
                  Loading cells…
                </span>
              </>
            )}
            {focusMode === 'cell' && focusCellId && (
              <>
                <ChevronRight size={10} className="text-muted-foreground" />
                <span className="text-foreground font-semibold font-mono text-[10px] truncate max-w-[120px]">{focusCellId}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              {focusMode === 'global' ? 'NETWORK' : focusMode === 'site' ? 'SITE' : 'CELL'} LEVEL
            </span>
            <button onClick={() => setDetailFullscreen(!detailFullscreen)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors">
              {detailFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={() => { setShowRightPanel(false); setDetailFullscreen(false); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Close panel">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ========== TOPO MODE: Global Network (no KPIs) ========== */}
          {sectorColorMode === 'topo' && focusMode === 'global' && (() => {
            // Use VPS global-network stats (full network, fetched once on mount)
            const dbStats = topoNetworkStats;
            const hasDbStats = !!dbStats && (dbStats.cells2G > 0 || dbStats.cells3G > 0 || dbStats.cells4G > 0 || dbStats.cells5G > 0 || dbStats.sites4G > 0 || dbStats.sites5G > 0);
            const rawSites2G = hasDbStats ? dbStats!.sites2G : 0;
            const rawSites3G = hasDbStats ? dbStats!.sites3G : 0;
            const rawSites4G = hasDbStats ? dbStats!.sites4G : 0;
            const rawSites5G = hasDbStats ? dbStats!.sites5G : 0;
            const rawCells2G = hasDbStats ? dbStats!.cells2G : 0;
            const rawCells3G = hasDbStats ? dbStats!.cells3G : 0;
            const rawCells4G = hasDbStats ? dbStats!.cells4G : 0;
            const rawCells5G = hasDbStats ? dbStats!.cells5G : 0;
            const bandMap2G: Record<string, number> = hasDbStats ? dbStats!.bandMap2G : {};
            const bandMap3G: Record<string, number> = hasDbStats ? dbStats!.bandMap3G : {};
            const bandMap4G: Record<string, number> = hasDbStats ? dbStats!.bandMap4G : {};
            const bandMap5G: Record<string, number> = hasDbStats ? dbStats!.bandMap5G : {};

            // Apply tech filter to inventory stats
            const show2G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('2G') : mapTechnoFilter === '2G';
            const show3G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('3G') : mapTechnoFilter === '3G';
            const show4G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('4G') : mapTechnoFilter === '4G';
            const show5G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('5G') : mapTechnoFilter === '5G';
            const sites2GCount = show2G ? rawSites2G : 0;
            const sites3GCount = show3G ? rawSites3G : 0;
            const sites4GCount = show4G ? rawSites4G : 0;
            const sites5GCount = show5G ? rawSites5G : 0;
            const cells2GCount = show2G ? rawCells2G : 0;
            const cells3GCount = show3G ? rawCells3G : 0;
            const cells4GCount = show4G ? rawCells4G : 0;
            const cells5GCount = show5G ? rawCells5G : 0;
            const vendorMap: Record<string, { '2G': number; '3G': number; '4G': number; '5G': number }> = hasDbStats ? dbStats!.vendorMap : {};
            return (
              <div className="divide-y divide-border">
                {/* Header */}
                <div className="px-5 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Network size={24} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[18px] font-extrabold text-foreground leading-tight tracking-tight uppercase">Global Network</h3>
                      <p className="text-[11px] text-muted-foreground mt-1">Vue d'ensemble réseau {[show2G && '2G', show3G && '3G', show4G && '4G', show5G && '5G'].filter(Boolean).join(' / ')}</p>
                    </div>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {show4G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 4G</div>
                        <div className="text-[22px] font-black text-foreground leading-none">{sites4GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show5G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#27AE60' }}>Sites 5G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#27AE60' }}>{sites5GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show3G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#3498DB' }}>Sites 3G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#3498DB' }}>{sites3GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show2G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#8E44AD' }}>Sites 2G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#8E44AD' }}>{sites2GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show4G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 4G</div>
                        <div className="text-[22px] font-black text-foreground leading-none">{cells4GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show5G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#27AE60' }}>Cellules 5G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#27AE60' }}>{cells5GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show3G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#3498DB' }}>Cellules 3G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#3498DB' }}>{cells3GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                    {show2G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#8E44AD' }}>Cellules 2G</div>
                        <div className="text-[22px] font-black leading-none" style={{ color: '#8E44AD' }}>{cells2GCount.toLocaleString('fr-FR')}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Technology Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Technologie</h4>
                  {[
                    ...(show4G ? [{ label: 'LTE (4G)', count: cells4GCount, color: '#F39C12' }] : []),
                    ...(show5G ? [{ label: 'NR (5G)', count: cells5GCount, color: '#27AE60' }] : []),
                    ...(show3G ? [{ label: 'UMTS (3G)', count: cells3GCount, color: '#3498DB' }] : []),
                    ...(show2G ? [{ label: 'GSM (2G)', count: cells2GCount, color: '#8E44AD' }] : []),
                  ].map(t => {
                    const total = cells2GCount + cells3GCount + cells4GCount + cells5GCount || 1;
                    const pct = ((t.count / total) * 100).toFixed(1);
                    return (
                      <div key={t.label} className="flex items-center gap-2 py-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                        <span className="text-[11px] font-bold text-foreground flex-1">{t.label}</span>
                        <span className="text-[11px] font-black text-foreground">{t.count.toLocaleString('fr-FR')}</span>
                        <span className="text-[9px] text-muted-foreground w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Band Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Bandes</h4>
                  {show4G && Object.keys(bandMap4G).length > 0 && (() => {
                    const total4G = Object.values(bandMap4G).reduce((a, b) => a + b, 0) || 1;
                    const maxCount4G = Math.max(...Object.values(bandMap4G));
                    return (
                      <div className="mb-4">
                        <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#F39C12' }}>LTE (4G)</div>
                        <div className="space-y-1.5">
                          {Object.entries(bandMap4G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                            const pct = (count / total4G) * 100;
                            const barW = (count / maxCount4G) * 100;
                            return (
                              <div key={band} className="group flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '4G') }} />
                                <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: getBandColor(band, '4G'), opacity: 0.7 }} />
                                </div>
                                <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {show5G && Object.keys(bandMap5G).length > 0 && (() => {
                    const total5G = Object.values(bandMap5G).reduce((a, b) => a + b, 0) || 1;
                    const maxCount5G = Math.max(...Object.values(bandMap5G));
                    return (
                      <div className="mb-4">
                        <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#27AE60' }}>NR (5G)</div>
                        <div className="space-y-1.5">
                          {Object.entries(bandMap5G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                            const pct = (count / total5G) * 100;
                            const barW = (count / maxCount5G) * 100;
                            return (
                              <div key={band} className="group flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '5G') }} />
                                <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: getBandColor(band, '5G'), opacity: 0.7 }} />
                                </div>
                                <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {show3G && Object.keys(bandMap3G).length > 0 && (() => {
                    const total3G = Object.values(bandMap3G).reduce((a, b) => a + b, 0) || 1;
                    const maxCount3G = Math.max(...Object.values(bandMap3G));
                    return (
                      <div className="mb-4">
                        <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#3498DB' }}>UMTS (3G)</div>
                        <div className="space-y-1.5">
                          {Object.entries(bandMap3G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                            const pct = (count / total3G) * 100;
                            const barW = (count / maxCount3G) * 100;
                            return (
                              <div key={band} className="group flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#3498DB' }} />
                                <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: '#3498DB', opacity: 0.7 }} />
                                </div>
                                <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {show2G && Object.keys(bandMap2G).length > 0 && (() => {
                    const total2G = Object.values(bandMap2G).reduce((a, b) => a + b, 0) || 1;
                    const maxCount2G = Math.max(...Object.values(bandMap2G));
                    return (
                      <div className="mb-4">
                        <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#8E44AD' }}>GSM (2G)</div>
                        <div className="space-y-1.5">
                          {Object.entries(bandMap2G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                            const pct = (count / total2G) * 100;
                            const barW = (count / maxCount2G) * 100;
                            return (
                              <div key={band} className="group flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#8E44AD' }} />
                                <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: '#8E44AD', opacity: 0.7 }} />
                                </div>
                                <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Vendor Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Vendors</h4>
                  {(() => {
                    const entries = Object.entries(vendorMap)
                      .map(([v, c]) => ({
                        vendor: v,
                        total: (show2G ? c['2G'] : 0) + (show3G ? c['3G'] : 0) + (show4G ? c['4G'] : 0) + (show5G ? c['5G'] : 0),
                        c2g: show2G ? c['2G'] : 0,
                        c3g: show3G ? c['3G'] : 0,
                        c4g: show4G ? c['4G'] : 0,
                        c5g: show5G ? c['5G'] : 0,
                      }))
                      .filter(e => e.total > 0)
                      .sort((a, b) => b.total - a.total);
                    const maxTotal = Math.max(...entries.map(e => e.total), 1);
                    return entries.map(({ vendor, total, c2g, c3g, c4g, c5g }) => (
                      <div key={vendor} className="flex items-center gap-2 py-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vendorHex(vendor) }} />
                        <span className="text-[10px] font-bold text-foreground w-20 shrink-0 truncate">{vendor}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(total / maxTotal) * 100}%`, background: vendorHex(vendor), opacity: 0.7 }} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {show4G && c4g > 0 && (
                            <span className="text-[9px] tabular-nums"><span style={{ color: '#F39C12' }}>4G </span><span className="font-black text-foreground">{c4g.toLocaleString('fr-FR')}</span></span>
                          )}
                          {show5G && c5g > 0 && (
                            <span className="text-[9px] tabular-nums"><span style={{ color: '#27AE60' }}>5G </span><span className="font-black" style={{ color: '#27AE60' }}>{c5g.toLocaleString('fr-FR')}</span></span>
                          )}
                          {show3G && c3g > 0 && (
                            <span className="text-[9px] tabular-nums"><span style={{ color: '#3498DB' }}>3G </span><span className="font-black" style={{ color: '#3498DB' }}>{c3g.toLocaleString('fr-FR')}</span></span>
                          )}
                          {show2G && c2g > 0 && (
                            <span className="text-[9px] tabular-nums"><span style={{ color: '#8E44AD' }}>2G </span><span className="font-black" style={{ color: '#8E44AD' }}>{c2g.toLocaleString('fr-FR')}</span></span>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            );
          })()}

          {/* ========== GLOBAL MODE ========== */}
          {sectorColorMode !== 'topo' && focusMode === 'global' && (() => {
            const allCells = filteredSites.flatMap(s => s.cells);
            const totalCells = allCells.length;
            const totalSites = filteredSites.length;
            const avgQoE = totalSites > 0 ? filteredSites.reduce((a, s) => a + (s.qoe_score_avg || 0), 0) / totalSites : 0;
            const techs = [...new Set(allCells.map(c => c.techno))].sort();
            
            // Tech distribution
            const techStats = techs.map(tech => {
              const cells = allCells.filter(c => c.techno === tech);
              const avg = cells.length > 0 ? cells.reduce((a, c) => a + (c.qoe_score_avg || 0), 0) / cells.length : 0;
              const bands = [...new Set(cells.map(c => c.bande).filter(Boolean))].sort();
              return { tech, count: cells.length, avgQoE: avg, bands };
            });

            // Band distribution
            const bandStats = [...new Set(allCells.map(c => `${c.techno}|${c.bande}`))].map(key => {
              const [tech, band] = key.split('|');
              const cells = allCells.filter(c => c.techno === tech && c.bande === band);
              const avg = cells.length > 0 ? cells.reduce((a, c) => a + (c.qoe_score_avg || 0), 0) / cells.length : 0;
              return { tech, band, count: cells.length, avgQoE: avg };
            }).sort((a, b) => b.count - a.count);

            // Performance distribution
            const excellent = allCells.filter(c => c.qoe_score_avg >= 80).length;
            const correct = allCells.filter(c => c.qoe_score_avg >= 60 && c.qoe_score_avg < 80).length;
            const degraded = allCells.filter(c => c.qoe_score_avg >= 40 && c.qoe_score_avg < 60).length;
            const critical = allCells.filter(c => c.qoe_score_avg < 40).length;
            const perfTotal = Math.max(totalCells, 1);

            // Compute avg DMS values across all cells
            const avgDmsDl3 = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).dms_dl_3 ?? 0), 0) / totalCells : 0;
            const avgDmsDl8 = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).dms_dl_8 ?? 0), 0) / totalCells : 0;
            const avgDmsDl30 = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).dms_dl_30 ?? 0), 0) / totalCells : 0;
            const avgDmsUl3 = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).dms_ul_3 ?? 0), 0) / totalCells : 0;
            const avgDl = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).p50_thr_dn_mbps ?? 0), 0) / totalCells : 0;
            const avgUl = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).p50_thr_up_mbps ?? 0), 0) / totalCells : 0;
            const avgRtt = totalCells > 0 ? allCells.reduce((a, c) => a + ((c as any).p95_rtt_ms ?? 0), 0) / totalCells : 0;

            // Use topoNetworkStats for instant display, fallback to computed from loaded sites
            const ns = topoNetworkStats;
            const hasFastStats = ns && (ns.sites4G > 0 || ns.sites5G > 0 || ns.cells4G > 0 || ns.cells5G > 0);
            // Compute from loaded sites as fallback
            const computedStats: TopoNetworkStats = (() => {
              const s2g = new Set<string>(), s3g = new Set<string>(), s4g = new Set<string>(), s5g = new Set<string>();
              let c2g = 0, c3g = 0, c4g = 0, c5g = 0;
              const bm2g: Record<string, number> = {}, bm3g: Record<string, number> = {}, bm4g: Record<string, number> = {}, bm5g: Record<string, number> = {};
              const vm: Record<string, { '2G': number; '3G': number; '4G': number; '5G': number }> = {};
              filteredSites.forEach(site => {
                const inferredTechState = inferSiteTechState(site);
                let has2g = inferredTechState.has2G, has3g = inferredTechState.has3G, has4g = inferredTechState.has4G, has5g = inferredTechState.has5G;
                site.cells.forEach(c => {
                  const tg = getCellTechGroup(c.techno);
                  const v = (c as any).vendor || site.vendor || 'Unknown';
                  if (!vm[v]) vm[v] = { '2G': 0, '3G': 0, '4G': 0, '5G': 0 };
                  const b = c.bande || 'Unknown';
                  if (tg === '5G') { c5g++; has5g = true; bm5g[b] = (bm5g[b] || 0) + 1; vm[v]['5G']++; }
                  else if (tg === '4G') { c4g++; has4g = true; bm4g[b] = (bm4g[b] || 0) + 1; vm[v]['4G']++; }
                  else if (tg === '3G') { c3g++; has3g = true; bm3g[b] = (bm3g[b] || 0) + 1; vm[v]['3G']++; }
                  else if (tg === '2G') { c2g++; has2g = true; bm2g[b] = (bm2g[b] || 0) + 1; vm[v]['2G']++; }
                  else { c4g++; has4g = true; bm4g[b] = (bm4g[b] || 0) + 1; vm[v]['4G']++; }
                });
                if (has2g) s2g.add(site.site_id);
                if (has3g) s3g.add(site.site_id);
                if (has4g) s4g.add(site.site_id);
                if (has5g) s5g.add(site.site_id);
                if (site.cells.length === 0) {
                  if ((site.lte_cells ?? 0) > 0) { s4g.add(site.site_id); c4g += site.lte_cells ?? 0; }
                  if ((site.nr_cells ?? 0) > 0) { s5g.add(site.site_id); c5g += site.nr_cells ?? 0; }
                  if (((site as any).cells_2g ?? 0) > 0) { s2g.add(site.site_id); c2g += (site as any).cells_2g ?? 0; }
                  if (((site as any).cells_3g ?? 0) > 0) { s3g.add(site.site_id); c3g += (site as any).cells_3g ?? 0; }
                }
              });
              return { sites2G: s2g.size, sites3G: s3g.size, sites4G: s4g.size, sites5G: s5g.size, cells2G: c2g, cells3G: c3g, cells4G: c4g, cells5G: c5g, bandMap2G: bm2g, bandMap3G: bm3g, bandMap4G: bm4g, bandMap5G: bm5g, vendorMap: vm };
            })();
            const hasScopedSidebarFilters =
              localVendor !== 'ALL' ||
              localDor !== 'ALL' ||
              localPlaque !== 'ALL' ||
              localBande !== 'ALL' ||
              localZoneArcep !== 'ALL' ||
              localTechno !== 'ALL' ||
              !!(dashboardActive && activeDashboardFilters && Object.values(activeDashboardFilters).some(values => Array.isArray(values) && values.length > 0));
            const displayStats: TopoNetworkStats = hasFastStats && !hasScopedSidebarFilters
              ? {
                  ...ns!,
                  sites4G: ns!.sites4G > 0 ? ns!.sites4G : computedStats.sites4G,
                  sites5G: ns!.sites5G > 0 ? ns!.sites5G : computedStats.sites5G,
                  bandMap4G: Object.keys(ns!.bandMap4G || {}).length > 0 ? ns!.bandMap4G : computedStats.bandMap4G,
                  bandMap5G: Object.keys(ns!.bandMap5G || {}).length > 0 ? ns!.bandMap5G : computedStats.bandMap5G,
                  vendorMap: Object.keys(ns!.vendorMap || {}).length > 0 ? ns!.vendorMap : computedStats.vendorMap,
                }
              : computedStats;
            const hasAnyStats = displayStats.sites2G > 0 || displayStats.sites3G > 0 || displayStats.sites4G > 0 || displayStats.sites5G > 0 || displayStats.cells2G > 0 || displayStats.cells3G > 0 || displayStats.cells4G > 0 || displayStats.cells5G > 0;

            return (
              <div className="divide-y divide-border">
                {/* ── Header — same style as Site ── */}
                <div className="px-5 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'hsl(220 40% 13%)' }}>
                      <Network size={24} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[18px] font-extrabold text-foreground leading-tight tracking-tight uppercase">Global Network</h3>
                      <p className="text-[11px] text-muted-foreground mt-1">Vue d'ensemble réseau 4G / 5G</p>
                    </div>
                  </div>
                </div>

                {/* ── Network Summary (from DB, instant) ── */}
                {hasAnyStats && (
                  <>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-muted/40 border border-border rounded-xl p-3">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 4G</div>
                          <div className="text-[22px] font-black text-foreground leading-none">{displayStats.sites4G.toLocaleString('fr-FR')}</div>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 5G</div>
                          <div className="text-[22px] font-black text-primary leading-none">{displayStats.sites5G.toLocaleString('fr-FR')}</div>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 4G</div>
                          <div className="text-[22px] font-black text-foreground leading-none">{displayStats.cells4G.toLocaleString('fr-FR')}</div>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 5G</div>
                          <div className="text-[22px] font-black text-primary leading-none">{displayStats.cells5G.toLocaleString('fr-FR')}</div>
                        </div>
                      </div>
                    </div>

                    {/* Technology Distribution */}
                    <div className="px-5 py-4">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Technologie</h4>
                      {[
                        { label: 'LTE (4G)', count: displayStats.cells4G, color: bandColors['4G_GROUP'] || '#F39C12' },
                        { label: 'NR (5G)', count: displayStats.cells5G, color: bandColors['5G_GROUP'] || '#27AE60' },
                      ].map(t => {
                        const tot = (displayStats.cells4G + displayStats.cells5G) || 1;
                        const pct = ((t.count / tot) * 100).toFixed(1);
                        return (
                          <div key={t.label} className="flex items-center gap-2 py-1.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                            <span className="text-[11px] font-bold text-foreground flex-1">{t.label}</span>
                            <span className="text-[11px] font-black text-foreground">{t.count.toLocaleString('fr-FR')}</span>
                            <span className="text-[9px] text-muted-foreground w-12 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Band Distribution */}
                    <div className="px-5 py-4">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Bandes</h4>
                      {Object.keys(displayStats.bandMap4G).length > 0 && (() => {
                        const total4G = Object.values(displayStats.bandMap4G).reduce((a, b) => a + b, 0) || 1;
                        const maxCount4G = Math.max(...Object.values(displayStats.bandMap4G));
                        return (
                          <div className="mb-4">
                            <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: bandColors['4G_GROUP'] || '#F39C12' }}>LTE (4G)</div>
                            <div className="space-y-1.5">
                              {Object.entries(displayStats.bandMap4G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                                const pct = (count / total4G) * 100;
                                const barW = (count / maxCount4G) * 100;
                                return (
                                  <div key={band} className="group flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '4G') }} />
                                    <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: getBandColor(band, '4G'), opacity: 0.7 }} />
                                    </div>
                                    <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                    <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {Object.keys(displayStats.bandMap5G).length > 0 && (() => {
                        const total5G = Object.values(displayStats.bandMap5G).reduce((a, b) => a + b, 0) || 1;
                        const maxCount5G = Math.max(...Object.values(displayStats.bandMap5G));
                        return (
                          <div>
                            <div className="text-[9px] font-extrabold uppercase tracking-wider mb-2" style={{ color: bandColors['5G_GROUP'] || '#27AE60' }}>NR (5G)</div>
                            <div className="space-y-1.5">
                              {Object.entries(displayStats.bandMap5G).sort((a, b) => b[1] - a[1]).map(([band, count]) => {
                                const pct = (count / total5G) * 100;
                                const barW = (count / maxCount5G) * 100;
                                return (
                                  <div key={band} className="group flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '5G') }} />
                                    <span className="text-[10px] font-semibold text-foreground w-16 shrink-0">{band}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: getBandColor(band, '5G'), opacity: 0.7 }} />
                                    </div>
                                    <span className="text-[10px] font-black text-foreground w-14 text-right tabular-nums">{count.toLocaleString('fr-FR')}</span>
                                    <span className="text-[9px] font-semibold text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Vendor Distribution */}
                    {Object.keys(displayStats.vendorMap).length > 0 && (
                      <div className="px-5 py-4">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Vendors</h4>
                        {(() => {
                          const entries = Object.entries(displayStats.vendorMap)
                            .map(([v, c]) => ({ vendor: v, total: (c['2G'] || 0) + (c['3G'] || 0) + c['4G'] + c['5G'], c2g: c['2G'] || 0, c3g: c['3G'] || 0, c4g: c['4G'], c5g: c['5G'] }))
                            .filter(e => e.total > 0)
                            .sort((a, b) => b.total - a.total);
                          const maxTotal = Math.max(...entries.map(e => e.total), 1);
                          return entries.map(({ vendor, total, c2g, c3g, c4g, c5g }) => (
                            <div key={vendor} className="flex items-center gap-2 py-1.5">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vendorHex(vendor) }} />
                              <span className="text-[10px] font-bold text-foreground w-20 shrink-0 truncate">{vendor}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${(total / maxTotal) * 100}%`, background: vendorHex(vendor), opacity: 0.7 }} />
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {c2g > 0 && (
                                  <span className="text-[9px] tabular-nums"><span className="text-muted-foreground">2G </span><span className="font-black" style={{ color: '#f59e0b' }}>{c2g.toLocaleString('fr-FR')}</span></span>
                                )}
                                {c3g > 0 && (
                                  <span className="text-[9px] tabular-nums"><span className="text-muted-foreground">3G </span><span className="font-black" style={{ color: '#f97316' }}>{c3g.toLocaleString('fr-FR')}</span></span>
                                )}
                                <span className="text-[9px] tabular-nums"><span className="text-muted-foreground">4G </span><span className="font-black text-foreground">{c4g.toLocaleString('fr-FR')}</span></span>
                                <span className="text-[9px] tabular-nums"><span className="text-muted-foreground">5G </span><span className="font-black" style={{ color: '#27AE60' }}>{c5g.toLocaleString('fr-FR')}</span></span>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* RF Spatial KPI Cards — only shown at cell level */}

                {/* ── Technology Distribution ── */}
                <div className="px-5 py-5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Technology Distribution</h4>
                  <div className="space-y-4">
                    {techStats.map(ts => {
                      const techLabel: Record<string, string> = { '2G': '2G GSM', '3G': '3G UMTS', '4G': '4G LTE', '5G': '5G NR' };
                      const techColor: Record<string, string> = { '2G': 'bg-yellow-500', '3G': 'bg-orange-500', '4G': 'bg-amber-500', '5G': 'bg-primary' };
                      return (
                      <div key={ts.tech} className="flex items-start gap-3">
                        <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${techColor[ts.tech] || 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-bold text-foreground">{techLabel[ts.tech] || ts.tech}</span>
                            <span className="font-bold" style={{ color: getKpiColor(ts.avgQoE) }}>{(ts.avgQoE ?? 0).toFixed(1)}%</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {ts.count.toLocaleString('fr-FR')} cells • {ts.bands.join(' / ')}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>

                {/* ── Band Distribution Table ── */}
                <div className="px-5 py-5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Band Distribution</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                          <th className="text-left px-3 py-2 font-semibold">Band</th>
                          <th className="text-right px-3 py-2 font-semibold">Cells</th>
                          <th className="text-right px-3 py-2 font-semibold">Avg QoE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {bandStats.map((bs, i) => (
                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(bs.band, bs.tech) }} />
                                <span className="font-medium text-foreground">{bs.band}</span>
                                <span className="text-muted-foreground text-[10px]">({bs.tech})</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{bs.count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: getKpiColor(bs.avgQoE) }}>{(bs.avgQoE ?? 0).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Performance Distribution ── */}
                <div className="px-5 py-5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Performance Distribution</h4>
                  <div className="flex h-2.5 rounded-full overflow-hidden mb-4">
                    {excellent > 0 && <div className="transition-all" style={{ width: `${(excellent / perfTotal) * 100}%`, background: '#27AE60' }} />}
                    {correct > 0 && <div className="transition-all" style={{ width: `${(correct / perfTotal) * 100}%`, background: '#f59e0b' }} />}
                    {degraded > 0 && <div className="transition-all" style={{ width: `${(degraded / perfTotal) * 100}%`, background: '#F39C12' }} />}
                    {critical > 0 && <div className="transition-all" style={{ width: `${(critical / perfTotal) * 100}%`, background: '#8E44AD' }} />}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    {[
                      { label: 'Excellent', pct: ((excellent / perfTotal) * 100).toFixed(0), color: '#27AE60' },
                      { label: 'Correct', pct: ((correct / perfTotal) * 100).toFixed(0), color: '#f59e0b' },
                      { label: 'Degraded', pct: ((degraded / perfTotal) * 100).toFixed(0), color: '#F39C12' },
                      { label: 'Critical', pct: ((critical / perfTotal) * 100).toFixed(0), color: '#ef4444' },
                    ].map((p, i) => (
                      <div key={i} className="text-center">
                        <div className="font-bold text-[13px]" style={{ color: p.color }}>{p.pct}%</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">{p.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Diagnostic + Analyse RF Spatiale — only shown at cell level */}
              </div>
            );
          })()}

          {/* ========== LOADING STATE for site/cell modes ========== */}
          {(focusMode === 'site' || focusMode === 'cell') && !siteDetail && detailLoading && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Loading site details…</p>
              </div>
            </div>
          )}
          {(focusMode === 'site' || focusMode === 'cell') && !siteDetail && !detailLoading && (() => {
            // No active site → fall back to Global view automatically.
            // If a dashboard is active, the Global view already reflects its scope.
            setTimeout(() => { setFocusMode('global'); setSelectedSiteId(null); setSelectedSiteSnapshot(null); }, 0);
            return null;
          })()}

          {/* ========== SITE FOCUS MODE ========== */}
          {focusMode === 'site' && siteDetail && (() => {
            // Site detail panel: show ALL cells of the site, independent of the
            // map-level toolbar filter (mapTechnoFilter / enabledTechnos /
            // localTechno / localBande). Those filters control what's DRAWN on
            // Site detail panel cells: respect the dashboard scope when
            // a dashboard is active. Without a dashboard, show all cells.
            // Reason: when an operator builds a "lille_L800" dashboard
            // (bande=L1800), clicking a site should mirror that scope —
            // the user expects only L800 cells, not the full inventory.
            // Filters applied at cell level: bande, techno, zone_arcep.
            // (dor/vendor/plaque/cluster are site-level, already filtered
            // upstream via /topo/sites.)
            const filteredCells = (() => {
              const all = siteDetail.cells;
              if (!dashboardActive || !activeDashboardFilters) return all;
              const df = activeDashboardFilters;
              const dashBands = df.bande && df.bande.length > 0
                ? new Set(df.bande.flatMap(b => {
                    const u = String(b).trim().toUpperCase();
                    const n = normalizeBandKey(u) || u;
                    return [u, n];
                  }))
                : null;
              const dashTechs = df.techno && df.techno.length > 0
                ? new Set(df.techno.map(t => String(t).trim().toUpperCase()))
                : null;
              const dashZones = df.zone_arcep && df.zone_arcep.length > 0
                ? new Set(df.zone_arcep.map(z => String(z).trim().toUpperCase()))
                : null;
              if (!dashBands && !dashTechs && !dashZones) return all;
              return all.filter(c => {
                if (dashBands) {
                  const raw = String(c.bande || '').trim().toUpperCase();
                  const norm = normalizeBandKey(c.bande || '', c.techno) || raw;
                  if (!raw || (!dashBands.has(raw) && !dashBands.has(norm))) return false;
                }
                if (dashTechs) {
                  const tg = String(getCellTechGroup(c.techno) || '').toUpperCase();
                  const tr = String(c.techno || '').trim().toUpperCase();
                  if (!dashTechs.has(tg) && !dashTechs.has(tr)) return false;
                }
                if (dashZones) {
                  const z = String((c as any).zone_arcep || '').trim().toUpperCase();
                  if (!z || !dashZones.has(z)) return false;
                }
                return true;
              });
            })();
            // Group cells by sector number
            const sectorMap = new Map<number, typeof siteDetail.cells>();
            filteredCells.forEach(cell => {
              const sNum = getSectorNumber(cell.cell_id);
              if (!sectorMap.has(sNum)) sectorMap.set(sNum, []);
              sectorMap.get(sNum)!.push(cell);
            });
            const sortedSectors = Array.from(sectorMap.entries()).sort(([a], [b]) => a - b);

            // Get unique techs for badge (from filtered cells)
            const uniqueTechs = [...new Set(filteredCells.map((c: any) => getCellTechGroup(c.techno)).filter(Boolean))].sort();
            const techBadgeStr = uniqueTechs.join(' / ');
            const primaryBand = filteredCells[0]?.bande || '';
            const primaryTech = filteredCells[0]?.techno || '';
            const isTopoFocus = sectorColorMode === 'topo';

            return (
            <div className="space-y-0">

              {/* ══════ SITE HEADER — Modern card with status ══════ */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start gap-3.5">
                  {/* Antenna icon with tech-colored accent */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-muted to-muted/60 border border-border flex items-center justify-center">
                      <Radio size={22} className="text-primary" />
                    </div>
                    {/* Online status dot */}
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" title="Active" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-extrabold text-foreground leading-tight tracking-tight truncate" title={siteDetail.site_name}>
                      {siteDetail.site_name}
                    </h3>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{siteDetail.site_id}</p>
                    {/* Tech badges row */}
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {uniqueTechs.map(tech => {
                        const techColorMap: Record<string, string> = { '5G': '#27AE60', '4G': '#F39C12', '3G': '#3498DB', '2G': '#8E44AD' };
                        const bg = techColorMap[tech] || '#94a3b8';
                        return (
                          <span key={tech} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white uppercase tracking-wider" style={{ backgroundColor: bg }}>
                            <Signal size={8} /> {tech}
                          </span>
                        );
                      })}
                      {siteDetail.vendor && siteDetail.vendor !== 'Unknown' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border border-border text-muted-foreground bg-muted/40 uppercase tracking-wider">
                          {siteDetail.vendor}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBackToGlobal(); }}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Fermer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* ══════ OVERVIEW CARDS ══════ */}
              <div className="px-5 pb-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                    <div className="text-[18px] font-black text-foreground leading-none">{filteredCells.length}</div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Cells</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                    <div className="text-[18px] font-black text-primary leading-none">{sortedSectors.length}</div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Sectors</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                    <div className="text-[18px] font-black text-foreground leading-none">{uniqueTechs.length}</div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Techs</div>
                  </div>
                </div>
              </div>

              {/* Subtle divider */}
              <div className="mx-5 border-t border-border/40" />

              {/* ══════ SITE DETAIL TABS ══════ */}
              <div className="px-4 pt-3 pb-4 space-y-3">
                <Tabs defaultValue="design" className="w-full">
                  <TabsList className="w-full h-auto p-0.5 bg-muted/30 rounded-lg flex gap-0 border border-border">
                    <TabsTrigger value="design" className="flex-1 text-[9px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Design</TabsTrigger>
                    <TabsTrigger value="conf" className="flex-1 text-[9px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Config</TabsTrigger>
                    <TabsTrigger value="alarm" className="flex-1 text-[9px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Alarms</TabsTrigger>
                    <TabsTrigger value="cmhistory" className="flex-1 text-[9px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">CM</TabsTrigger>
                    <TabsTrigger value="params" className="flex-1 text-[9px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Params</TabsTrigger>
                  </TabsList>

                  <TabsContent value="design" className="mt-3 space-y-4">

                {/* ── Site Information Card ── */}
                <div className="space-y-1">
                  <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 px-1">
                    <MapPin size={10} /> Site Information
                  </h5>
                  <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                    {[
                      { icon: <MapPin size={11} className="text-muted-foreground" />, label: 'Coordinates', value: `${siteDetail.coordinates[0].toFixed(5)}, ${siteDetail.coordinates[1].toFixed(5)}` },
                      { icon: <Layers size={11} className="text-muted-foreground" />, label: 'Cluster', value: (siteDetail as any).cluster || siteDetail.plaque || '—' },
                      { icon: <Signal size={11} className="text-muted-foreground" />, label: 'Altitude (HBA)', value: (() => {
                        // Aggregate hba across all cells of this site rather than
                        // showing the first cell's value. Many sites have NULL
                        // height in ref_cell_daily, and previously we silently
                        // defaulted that to 30 m — making every site read "30 m
                        // AGL" regardless of reality. Now: show — when no cell
                        // has a value, the unique value when all cells agree, or
                        // a min–max range when they differ.
                        const hbas = filteredCells
                          .map(c => c.hba)
                          .filter((h): h is number => typeof h === 'number' && Number.isFinite(h) && h > 0);
                        if (hbas.length === 0) return '—';
                        const lo = Math.min(...hbas);
                        const hi = Math.max(...hbas);
                        return lo === hi ? `${lo} m AGL` : `${lo}–${hi} m AGL`;
                      })() },
                      { icon: <Globe size={11} className="text-muted-foreground" />, label: 'Zone ARCEP', value: (() => {
                        const zones = [...new Set(filteredCells.map(c => (c as any).zone_arcep).filter(Boolean))];
                        return zones.length > 0 ? zones.join(', ') : (siteDetail as any).zone_arcep || '—';
                      })() },
                      { icon: <Radio size={11} className="text-muted-foreground" />, label: 'Terrain', value: (() => {
                        const hba = filteredCells[0]?.hba ?? 30;
                        if (hba >= 40) return 'Dense Urban';
                        if (hba >= 25) return 'Urban';
                        if (hba >= 15) return 'Suburban';
                        return 'Rural';
                      })() },
                      { icon: <BarChart2 size={11} className="text-muted-foreground" />, label: 'Profile', value: (() => {
                        const hba = filteredCells[0]?.hba ?? 30;
                        const bands = [...new Set(filteredCells.map(c => c.bande))];
                        const has5G = filteredCells.some(c => getCellTechGroup(c.techno) === '5G');
                        if (has5G && hba >= 30) return 'Macro 5G/4G Co-located';
                        if (has5G) return 'Small Cell 5G + Macro 4G';
                        if (bands.length >= 4) return 'Macro Multi-Band 4G';
                        if (hba < 15) return 'Micro Cell';
                        return 'Macro 4G Standard';
                      })() },
                    ].map((p, i) => (
                      <div key={i} className={`flex items-center gap-2.5 px-3.5 py-2 text-[11px] border-b border-border/30 last:border-0 transition-colors hover:bg-muted/20 ${i % 2 === 0 ? 'bg-muted/10' : ''}`}>
                        {p.icon}
                        <span className="text-muted-foreground font-medium flex-1">{p.label}</span>
                        <span className="font-semibold text-foreground text-right">{p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Technologies & Bands ── */}
                <div className="space-y-1">
                  <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 px-1">
                    <Signal size={10} /> Technologies & Bands
                  </h5>
                  <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const bandsByTech = new Map<string, Set<string>>();
                        filteredCells.forEach(c => {
                          const tg = getCellTechGroup(c.techno);
                          if (!bandsByTech.has(tg)) bandsByTech.set(tg, new Set());
                          if (c.bande) bandsByTech.get(tg)!.add(c.bande);
                        });
                        const techColorMap: Record<string, string> = { '5G': '#27AE60', '4G': '#F39C12', '3G': '#3498DB', '2G': '#8E44AD' };
                        return Array.from(bandsByTech.entries()).sort(([a], [b]) => {
                          const order = ['5G', '4G', '3G', '2G'];
                          return order.indexOf(a) - order.indexOf(b);
                        }).flatMap(([tech, bands]) =>
                          Array.from(bands).sort().map(band => (
                            <span key={`${tech}-${band}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors hover:opacity-80" style={{ backgroundColor: `${techColorMap[tech] || '#94a3b8'}15`, color: techColorMap[tech] || '#94a3b8', border: `1px solid ${techColorMap[tech] || '#94a3b8'}30` }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: techColorMap[tech] || '#94a3b8' }} />
                              {band}
                            </span>
                          ))
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* ── SECTORS & CELLS — collapsible sector tabs ── */}
                <div className="space-y-1">
                  <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 px-1">
                    <Radio size={10} /> Sectors & Cells
                    <span className="ml-auto text-[9px] font-normal text-muted-foreground/60">{filteredCells.length} total</span>
                  </h5>
                {(() => {
                  const sectorNums = sortedSectors.map(([s]) => s);
                  const defaultSector = sectorNums[0] ?? '1';
                  return (
                    <Tabs defaultValue={String(defaultSector)} className="w-full">
                      <TabsList className="w-full h-auto p-0.5 bg-muted/20 rounded-lg flex gap-0.5 border border-border/50">
                        {sortedSectors.map(([sNum, cells]) => (
                          <TabsTrigger key={sNum} value={String(sNum)} className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all">
                            S{sNum}
                            <span className="text-[8px] font-normal ml-0.5 opacity-50">({cells.length})</span>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {sortedSectors.map(([sNum, cells]) => (
                        <TabsContent key={sNum} value={String(sNum)} className="mt-2">
                          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                            {/* Table header — BSP is the techno-specific physical
                                identifier: 2G → BCCH (often blank, no DB column),
                                3G → SC (psc), 4G/5G → PCI. Tooltip shows the meaning. */}
                            <div className="max-h-[280px] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
                              <div className="grid grid-cols-[1fr_44px_64px_40px_40px_50px_50px] gap-0.5 px-3 py-1.5 bg-muted/30 border-b border-border/50 border-l-2 border-l-transparent sticky top-0 z-10">
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Cell ID</span>
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center">Tech</span>
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center">Band</span>
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center">Az</span>
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center">Tilt</span>
                              <span
                                className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center"
                                title="BSP — Broadcast/Scrambling/Physical: 2G=BCCH, 3G=SC, 4G/5G=PCI"
                              >BSP</span>
                              <span
                                className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest text-center"
                                title="HBA — Height Above Ground Level (antenna mounting height in meters)"
                              >HBA</span>
                            </div>
                            {/* Cell rows */}
                              <div className="divide-y divide-border/20">
                              {cells.map((c) => {
                                const eTilt = (c as any).tilt as number | null;
                                const isSelected = focusCellId === c.cell_id;
                                const cellTechGroup = getCellTechGroup(c.techno);
                                const techColorMap: Record<string, string> = { '5G': '#27AE60', '4G': '#F39C12', '3G': '#3498DB', '2G': '#8E44AD' };
                                const cellTechColor = techColorMap[cellTechGroup] || '#94a3b8';
                                // BSP column — pick the right physical identifier per techno.
                                const cellAny = c as any;
                                const pci = cellAny.pci ?? null;
                                const psc = cellAny.psc ?? null;
                                const bsp =
                                  cellTechGroup === '3G' ? (psc != null ? String(psc) : '—') :
                                  (cellTechGroup === '4G' || cellTechGroup === '5G') ? (pci != null ? String(pci) : '—') :
                                  '—';
                                const bspTitle =
                                  cellTechGroup === '3G' ? `SC (Primary Scrambling Code) — ${bsp}` :
                                  cellTechGroup === '4G' ? `PCI (Physical Cell ID) — ${bsp}` :
                                  cellTechGroup === '5G' ? `PCI (Physical Cell ID) — ${bsp}` :
                                  cellTechGroup === '2G' ? 'BCCH — not stored in this dataset' :
                                  bsp;
                                return (
                                  <div
                                    key={c.cell_id}
                                    onClick={() => handleCellClick(c.cell_id)}
                                    title={c.cell_id}
                                    className={`grid grid-cols-[1fr_44px_64px_40px_40px_50px_50px] gap-0.5 px-3 py-2 items-center cursor-pointer transition-all group ${
                                      isSelected
                                        ? 'bg-primary/10 border-l-2 border-l-primary'
                                        : 'hover:bg-muted/30 border-l-2 border-l-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cellTechColor }} />
                                      <span className={`text-[10px] font-semibold truncate transition-colors ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>{c.cell_id}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-center rounded px-1 py-0.5" style={{ color: cellTechColor }}>{cellTechGroup}</span>
                                    <span className="text-[9px] text-muted-foreground text-center font-medium">{c.bande}</span>
                                    <span className="text-[9px] font-semibold text-foreground text-center tabular-nums">{c.azimut ?? '—'}°</span>
                                    <span className="text-[9px] font-semibold text-foreground text-center tabular-nums">{eTilt ?? '—'}°</span>
                                    <span
                                      className="text-[9px] font-semibold text-foreground text-center tabular-nums"
                                      title={bspTitle}
                                    >{bsp}</span>
                                    {/* HBA — antenna height (m AGL). Shows "—" when DB has
                                        no value, mirroring the Site Information panel. */}
                                    <span
                                      className="text-[9px] font-semibold text-foreground text-center tabular-nums"
                                      title={c.hba != null ? `Antenna mounted at ${c.hba} m above ground` : 'Antenna height not stored in this dataset'}
                                    >{c.hba != null ? `${c.hba} m` : '—'}</span>
                                  </div>
                                );
                              })}
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  );
                })()}
                </div>

                  </TabsContent>

                  <TabsContent value="conf" className="mt-3">
                    <SiteConfigTab siteName={siteDetail?.site_name} />
                  </TabsContent>

                  <TabsContent value="alarm" className="mt-3">
                    <div className="rounded-xl border border-border bg-card p-6 text-center">
                      <Bell size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-[11px] font-medium text-muted-foreground">No active alarms</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-1">Alarm monitoring coming soon</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="cmhistory" className="mt-3">
                    {siteDetail?.site_name ? (
                      <SiteChangesPanel siteName={siteDetail.site_name} days={90} />
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-6 text-center">
                        <FileText size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-[11px] font-medium text-muted-foreground">No CM history available</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="params" className="mt-3">
                    <SiteParametersTab siteName={siteDetail?.site_name} />
                  </TabsContent>
                </Tabs>
              </div>

              {/* ══════ AI DIAGNOSTIC — Site Level ══════ */}
              {onLaunchAI && siteDetail && (
                <div className="px-5 pb-5">
                  <div className="rounded-xl px-4 py-3.5 flex items-center gap-3 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Sparkles size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-foreground">AI Diagnostic</div>
                      <div className="text-[9px] text-muted-foreground font-medium">Root Cause Analysis</div>
                    </div>
                    <button
                      onClick={() => onLaunchAI(siteDetail.site_name)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
                    >
                      <Zap size={12} />
                      Run
                    </button>
                  </div>
                </div>
              )}

            </div>
          );
          })()}

          {/* ========== CELL FOCUS MODE ========== */}
          {focusMode === 'cell' && focusCellId && (() => {
            // Try multiple sources: siteDetail first, then selectedSiteSnapshot, then sites array
            let cell: CellProperties | undefined;
            if (siteDetail) cell = resolveCellFromDetail(siteDetail, focusCellId);
            if (!cell && selectedSiteSnapshot) cell = resolveCellFromDetail(selectedSiteSnapshot as SiteDetail, focusCellId);
            if (!cell && selectedSiteId) {
              const fromSites = sites.find(s => s.site_id === selectedSiteId);
              if (fromSites) cell = resolveCellFromDetail(fromSites as SiteDetail, focusCellId);
            }
            if (!cell) return <div className="p-4 text-muted-foreground text-[12px]">Cell not found.</div>;
            return (
              <div className="divide-y divide-border">
                {/* Cell Header — prominent */}
                <div className="px-5 py-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: cell.techno?.includes('5G') ? '#27AE60' : '#F39C12' }}>
                      <Signal size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-extrabold text-foreground leading-tight tracking-tight uppercase truncate">
                        {cell.cell_id}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px]">
                        <span className="text-muted-foreground truncate max-w-[120px]">{siteDetail.site_name}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-bold px-1.5 py-0.5 rounded text-[9px] text-white" style={{ backgroundColor: is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#27AE60') : (bandColors['4G_GROUP'] || '#F39C12') }}>{cell.techno}</span>
                        <span className="font-semibold text-foreground">{cell.bande}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">Az {cell.azimut}°</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabs: KPIs / Topologie — smart nav */}
                {(() => {
                  const cellTabs = [
                    { id: 'kpi' as const, label: 'KPIS', icon: <BarChart2 size={12} /> },
                    { id: 'topo' as const, label: 'TOPOLOGIE', icon: <Radio size={12} /> },
                    { id: 'config' as const, label: 'CONFIG', icon: <Settings2 size={12} /> },
                    { id: 'sim' as const, label: 'SIMULATION', icon: <Signal size={12} /> },
                    { id: 'alarms' as const, label: 'ALARMS', icon: <Bell size={12} /> },
                    { id: 'cm' as const, label: 'CM', icon: <FileText size={12} /> },
                    { id: 'neighbors' as const, label: 'NEIGHBORS', icon: <Network size={12} /> },
                  ];
                  const curIdx = cellTabs.findIndex(t => t.id === cellDetailTab);
                  return (
                    <div className="px-3 py-2 border-b border-border sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { if (curIdx > 0) setCellDetailTab(cellTabs[curIdx - 1].id); }}
                          disabled={curIdx <= 0}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20 disabled:cursor-default transition-colors"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
                          {cellTabs.map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setCellDetailTab(tab.id)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                                cellDetailTab === tab.id
                                  ? 'bg-primary text-primary-foreground shadow-md'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`}
                            >
                              {tab.icon}
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => { if (curIdx < cellTabs.length - 1) setCellDetailTab(cellTabs[curIdx + 1].id); }}
                          disabled={curIdx >= cellTabs.length - 1}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20 disabled:cursor-default transition-colors"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── KPI Tab — same style as Site Focus ── */}
                {cellDetailTab === 'kpi' && (
                  <>
                    {/* RF Spatial KPIs */}
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-3 gap-2">
                        {(() => {
                          const overshoot = (cell as any).overshoot_factor;
                          if (overshoot == null) return (
                            <div className="bg-muted/40 rounded-xl border border-border px-2 py-2.5 text-center">
                              <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Overshoot</div>
                              <div className="text-[14px] font-extrabold text-muted-foreground">—</div>
                            </div>
                          );
                          const pct = overshoot * 100;
                          const sev = pct > 20 ? 'red' : pct > 12 ? 'orange' : 'green';
                          const sevColor = sev === 'green' ? 'text-emerald-500' : sev === 'orange' ? 'text-orange-500' : 'text-destructive';
                          return (
                            <div className="bg-muted/40 rounded-xl border border-border px-2 py-2.5 text-center">
                              <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Overshoot</div>
                              <div className={`text-[14px] font-extrabold ${sevColor}`}>{pct.toFixed(1)}%</div>
                            </div>
                          );
                        })()}
                        <div className="bg-muted/40 rounded-xl border border-border px-2 py-2.5 text-center">
                          <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">ISD</div>
                          <div className="text-[14px] font-extrabold text-primary">
                            {(cell as any).intersite_distance_m != null ? ((cell as any).intersite_distance_m / 1000).toFixed(2) : '—'}
                            {(cell as any).intersite_distance_m != null && <span className="text-[10px] font-bold text-muted-foreground ml-0.5">km</span>}
                          </div>
                        </div>
                        <div className="bg-muted/40 rounded-xl border border-border px-2 py-2.5 text-center">
                          <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tilt</div>
                          <div className="text-[14px] font-extrabold text-foreground">
                            {(cell as any).tilt != null ? `${(cell as any).tilt}°` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Diagnostic Card — same dark style */}
                    <div className="px-5 py-4">
                      <div className="rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, hsl(220 40% 13%), hsl(220 50% 18%))' }}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(80 60% 45%)', boxShadow: '0 0 20px hsla(80, 60%, 45%, 0.3)' }}>
                          <Settings2 size={20} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-extrabold text-white uppercase tracking-wide">AI Diagnostic</div>
                          <div className="text-[10px] text-white/50 font-medium">RCA Analysis</div>
                        </div>
                        <button
                          onClick={() => { if (siteDetail && onLaunchAI) onLaunchAI(cell.cell_id); }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-white/90 transition-colors shrink-0"
                        >
                          <Zap size={13} />
                          Lancer
                        </button>
                      </div>
                    </div>

                    {/* RF Distribution Charts — RACH, PRB, Interference */}
                    <CellRfCharts siteName={siteDetail.site_name} vendor={siteDetail.vendor} techno={cell.techno} />

                  </>
                )}

                {/* ── Topologie Tab ── */}
                {cellDetailTab === 'topo' && (
                  <div className="px-5 py-4">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Radio size={13} className="text-primary" />
                      Paramètres RF & Topologie
                    </h4>
                    <div className="rounded-xl border border-border overflow-hidden bg-card">
                      {[
                        { label: 'Technologie', value: cell.techno ?? '—', highlight: true },
                        { label: 'Bande', value: cell.bande ? `${cell.bande} MHz` : '—', highlight: true },
                        { label: 'Cell ID', value: cell.cell_id, highlight: true },
                        { label: 'Azimut', value: cell.azimut != null ? `${cell.azimut}°` : '—', highlight: true },
                        { label: 'HBA', value: cell.hba != null ? `${cell.hba} m` : '—', highlight: true },
                        { label: 'E-Tilt', value: (cell as any).tilt != null ? `${(cell as any).tilt}°` : '—' },
                        { label: 'PCI', value: (cell as any).pci ?? '—' },
                        { label: 'TAC', value: (cell as any).tac ?? '—' },
                        { label: 'ECI', value: (cell as any).eci ?? '—' },
                        { label: 'NCI', value: (cell as any).nci ?? '—' },
                        { label: 'CID', value: (cell as any).cid ?? '—' },
                        { label: 'État Cellule', value: (cell as any).etat_cellule ?? '—' },
                        { label: 'Vendor', value: (cell as any).constructeur ?? siteDetail.vendor ?? '—', highlight: true },
                        { label: 'Plaque', value: (cell as any).plaque ?? '—' },
                        { label: 'Zone ARCEP', value: (cell as any).zone_arcep ?? '—' },
                        { label: 'Essentiel', value: (cell as any).essentiel ?? '—' },
                        { label: 'Date MES', value: (cell as any).date_mes ?? '—' },
                        { label: 'Date FN8', value: (cell as any).date_fn8 ?? '—' },
                        { label: 'Latitude', value: (cell as any).latitude != null ? Number((cell as any).latitude).toFixed(5) : '—' },
                        { label: 'Longitude', value: (cell as any).longitude != null ? Number((cell as any).longitude).toFixed(5) : '—' },
                      ].map((p, i) => (
                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-[12px] border-b border-border/40 last:border-0 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                          <span className="text-muted-foreground font-medium">{p.label}</span>
                          <span className={`font-mono text-[11px] font-semibold ${p.highlight && p.value !== '—' ? 'text-primary' : p.value === '—' ? 'text-muted-foreground/50' : 'text-foreground'}`}>
                            {p.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Config Tab — LTE Cell Configuration ── */}
                {cellDetailTab === 'config' && (() => {
                  const isLte = (cell.techno || '').toLowerCase().includes('lte') || (cell.techno || '').includes('4G') || (cell.techno || '').startsWith('L');
                  if (!isLte) {
                    return (
                      <div className="px-5 py-8 text-center">
                        <Settings2 size={28} className="mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-[12px] text-muted-foreground font-medium">Configuration disponible uniquement pour les cellules LTE (4G).</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Le support 5G NR sera ajouté prochainement.</p>
                      </div>
                    );
                  }
                  if (lteConfig.loading) {
                    return (
                      <div className="px-5 py-8 flex flex-col items-center gap-3">
                        <RefreshCw size={20} className="text-primary animate-spin" />
                        <p className="text-[11px] text-muted-foreground">Chargement configuration...</p>
                      </div>
                    );
                  }
                  const { prb, mimoLabel, rsPower, bwMhz } = getLteConfigValues();
                  const hasData = lteConfig.pmax != null || lteConfig.dlChBw != null;
                  if (!hasData) {
                    return (
                      <div className="px-5 py-8 text-center">
                        <Database size={28} className="mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-[12px] text-muted-foreground font-medium">Aucun paramètre trouvé pour cette cellule.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">La configuration sera disponible après enrichissement des paramètres.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="px-5 py-4">
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Settings2 size={13} className="text-primary" />
                        Configuration LTE
                      </h4>

                      {/* RS Power highlight card */}
                      {rsPower != null && (
                        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-4 text-center">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">RS Power (calculé)</div>
                          <div className="text-[28px] font-black text-primary leading-none">{rsPower.toFixed(1)} <span className="text-[13px] font-semibold">dBm</span></div>
                          <div className="text-[9px] text-muted-foreground/60 mt-2 font-mono">
                            = {lteConfig.pmax} − 10×log₁₀({prb}) + {lteConfig.dlRsBoost}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-border overflow-hidden bg-card">
                        {[
                          { label: 'Cell Name', value: lteConfig.cellName ?? cell.cell_id, highlight: true },
                          { label: 'Pmax', value: lteConfig.pmax != null ? `${lteConfig.pmax} dBm` : '—', highlight: true },
                          { label: 'DL Channel Bandwidth', value: bwMhz ?? '—', highlight: true },
                          { label: 'Nombre de PRB', value: prb != null ? `${prb} PRB` : '—', highlight: true },
                          { label: 'MIMO Configuration', value: mimoLabel ?? '—', highlight: true },
                          { label: 'DL RS Boost', value: lteConfig.dlRsBoost != null ? `${lteConfig.dlRsBoost} dB` : '—', highlight: true },
                          { label: 'RS Power', value: rsPower != null ? `${rsPower.toFixed(1)} dBm` : '—', highlight: true },
                        ].map((p, i) => (
                          <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-[12px] border-b border-border/40 last:border-0 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                            <span className="text-muted-foreground font-medium">{p.label}</span>
                            <span className={`font-mono text-[11px] font-semibold ${p.highlight && p.value !== '—' ? 'text-primary' : p.value === '—' ? 'text-muted-foreground/50' : 'text-foreground'}`}>
                              {p.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* 5G NR placeholder */}
                      <div className="mt-4 rounded-xl border border-dashed border-border/50 px-4 py-3 text-center">
                        <p className="text-[10px] text-muted-foreground/50 font-medium">🚧 5G NR Configuration — Coming Soon</p>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Simulation Tab ── */}
                {cellDetailTab === 'sim' && (() => {
                  const simTechno = (cell.techno?.includes('5G') ? '5G' : '4G') as '4G' | '5G';
                  const simDefaults = getDefaultParams(simTechno, cell.bande);
                  return (
                    <InlineSimTab
                      cell={cell}
                      siteDetail={siteDetail}
                      simDefaults={simDefaults}
                      simTechno={simTechno}
                      coverageSimulating={coverageSimulating}
                      onSimulate={(grid) => handleCoverageSimulate(grid)}
                      onClear={handleCoverageClear}
                    />
                  );
                })()}

                {/* ── Alarms Tab ── */}
                {cellDetailTab === 'alarms' && (
                  <div className="px-5 py-4">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="text-red-500">🔔</span> FM Alarms — {siteDetail?.site_name}
                    </h4>
                    {siteAlarmsLoading ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Chargement...</div>
                    ) : siteAlarms.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Aucune alarme pour ce site</div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {siteAlarms.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-border p-3 text-[11px]">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold uppercase ${a.severity === 'CRITICAL' ? 'text-red-500' : a.severity === 'MAJOR' ? 'text-orange-500' : a.severity === 'MINOR' ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                                {a.severity}
                              </span>
                              <span className="text-muted-foreground">{a.duration_min != null ? a.duration_min + ' min' : '—'}</span>
                            </div>
                            <div className="font-mono text-foreground">{a.problem || a.text || '—'}</div>
                            <div className="text-muted-foreground mt-1">{a.alarm_time ? new Date(a.alarm_time).toLocaleString('fr-FR') : '—'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── CM History Tab ── */}
                {cellDetailTab === 'cm' && (
                  <div className="px-5 py-4">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span>📝</span> CM History — {siteDetail?.site_name}
                    </h4>
                    {siteCmLoading ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Chargement...</div>
                    ) : siteCmHistory.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Aucun changement pour ce site</div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {siteCmHistory.map((c: any, i: number) => (
                          <div key={i} className="rounded-lg border border-border p-3 text-[11px]">
                            <div className="font-mono font-bold text-primary">{c.parameter}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-red-400 line-through">{c.old_value || '—'}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-green-400 font-bold">{c.new_value || '—'}</span>
                            </div>
                            <div className="text-muted-foreground mt-1">{c.changed_at ? new Date(c.changed_at).toLocaleString('fr-FR') : '—'}</div>
                            {c.user && <div className="text-muted-foreground/60">by {c.user}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Neighbors Tab ── */}
                {cellDetailTab === 'neighbors' && (() => {
                  // Fetch real neighbors from API on first access or cell change
                  if (neighborCellId !== focusCellId && !neighborLoading) {
                    setTimeout(async () => {
                      setNeighborLoading(true);
                      setNeighborCellId(focusCellId);
                      try {
                        // Fetch both directions in parallel
                        const [outRes, inRes] = await Promise.all([
                          fetchCellNeighbors(focusCellId!, 'out', 20),
                          fetchCellNeighbors(focusCellId!, 'in', 20),
                        ]);
                        const allNeighbors = [...(outRes.neighbors || []), ...(inRes.neighbors || [])];
                        if (allNeighbors.length > 0) {
                          setNeighborData(allNeighbors);
                        } else {
                          // Fallback to mock if API returns no data
                          const nearbySitesForNeighbors = sites
                            .filter(s => s.site_id !== siteDetail?.site_id && s.cells.length > 0)
                            .slice(0, 15);
                          setNeighborData(generateMockNeighbors(focusCellId!, siteDetail?.coordinates || [0, 0], nearbySitesForNeighbors));
                        }
                      } catch {
                        // API unavailable — fallback to mock
                        const nearbySitesForNeighbors = sites
                          .filter(s => s.site_id !== siteDetail?.site_id && s.cells.length > 0)
                          .slice(0, 15);
                        setNeighborData(generateMockNeighbors(focusCellId!, siteDetail?.coordinates || [0, 0], nearbySitesForNeighbors));
                      } finally {
                        setNeighborLoading(false);
                        setShowNeighborPanel(false);
                      }
                    }, 0);
                  }
                  const filtered = neighborData.filter(n => n.relationDirection === neighborDirection);
                  const countByType: Record<NeighborRelationType, number> = { intra_freq: 0, inter_freq: 0, inter_system: 0 };
                  filtered.forEach(n => { countByType[n.relationType] = (countByType[n.relationType] || 0) + 1; });
                  return (
                    <div className="px-5 py-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Network size={14} className="text-primary" />
                        <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Voisins</h4>
                        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} relations</span>
                      </div>

                      {/* Direction toggle */}
                      <div className="flex gap-2">
                        {(['out', 'in'] as NeighborDirection[]).map(dir => (
                          <button
                            key={dir}
                            onClick={() => { if (neighborDirection === dir && showNeighborPanel) { setShowNeighborPanel(false); } else { setNeighborDirection(dir); setShowNeighborPanel(true); } }}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                              neighborDirection === dir
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {dir === 'out' ? <ArrowRight size={12} /> : <ChevronLeft size={12} />}
                            {dir === 'out' ? 'Sortant' : 'Entrant'}
                          </button>
                        ))}
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-4 flex-wrap">
                        {(Object.entries(NEIGHBOR_LABELS) as [NeighborRelationType, string][]).map(([type, label]) => (
                          <div key={type} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: NEIGHBOR_COLORS[type] }} />
                            <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
                            <span className="text-[9px] text-muted-foreground/60">({countByType[type]})</span>
                          </div>
                        ))}
                      </div>

                      {/* Neighbor list */}
                      {neighborLoading ? (
                        <div className="text-center py-6 text-muted-foreground text-[11px]">Chargement des voisins...</div>
                      ) : filtered.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-[11px]">Aucun voisin {neighborDirection === 'out' ? 'sortant' : 'entrant'}</div>
                      ) : (
                        <div className="rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="bg-muted/40 border-b border-border">
                                <th className="px-3 py-1.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Type</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tech</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Band</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Dist</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">HO #</th>
                                <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">HO SR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((n, i) => (
                                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                                  <td title={`${n.targetCellId}${n.targetSiteName ? ' — ' + n.targetSiteName : ''}`} className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NEIGHBOR_COLORS[n.relationType] }} />
                                      {n.targetCellId}
                                    </div>
                                    <div className="text-[9px] text-muted-foreground font-normal">{n.targetSiteName}</div>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <span className="text-[9px] font-bold" style={{ color: NEIGHBOR_COLORS[n.relationType] }}>
                                      {n.relationType === 'intra_freq' ? 'INTRA' : n.relationType === 'inter_freq' ? 'INTER' : 'INTER-SYS'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ backgroundColor: is5GTech(n.targetTechno) ? (bandColors['5G_GROUP'] || '#27AE60') : (bandColors['4G_GROUP'] || '#F39C12') }}>
                                      {n.targetTechno === 'NR' ? '5G NR' : n.targetTechno?.includes('5G') ? '5G NR' : n.targetTechno === 'LTE' || n.targetTechno?.includes('4G') ? 'LTE' : n.targetTechno}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-center text-muted-foreground font-semibold">{n.targetBande}</td>
                                  <td className="px-2 py-2 text-center font-mono text-muted-foreground">{n.distanceKm} km</td>
                                  <td className="px-2 py-2 text-center font-mono font-bold text-foreground">{n.hoCount.toLocaleString()}</td>
                                  <td className="px-2 py-2 text-center">
                                    <span className={`font-mono font-bold ${n.hoSuccessRate >= 98 ? 'text-green-400' : n.hoSuccessRate >= 95 ? 'text-amber-400' : 'text-red-400'}`}>
                                      {n.hoSuccessRate}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="px-4 py-2.5">
                  <button
                    onClick={handleBackToSite}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ChevronLeft size={12} />
                    Back to Site
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      )}
    </div>
  );
};


export default SitesMonitor;
