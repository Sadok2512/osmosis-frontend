import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { dashboardsApi, mapViewsApi, qoeMetricsApi, topoApi } from '@/lib/localDb';
import { useMapSitesStore } from "@/stores/mapSitesStore";
import { ActiveFilter } from '@/config/filterDimensions';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Tooltip, useMapEvents, Marker, Polyline } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { useFresnel } from '@/hooks/useFresnel';
import { haversineDistance, LatLng } from '@/utils/geodesicUtils';
import ProfileChart from './radio-profile/ProfileChart';
import InfoPanel from './radio-profile/InfoPanel';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import MapViewManager, { MapViewSettings } from './MapViewManager';
import CoverageCanvasOverlay from './CoverageCanvasOverlay';
import CoverageSimPanel from './CoverageSimPanel';
import TiltOverlay from './TiltOverlay';
import { CoverageGrid, SimulationParams, simulateCoverage, getDefaultParams, RSRP_LEGEND } from '@/services/propagationEngine';
import { SitesFilterBar } from '@/components/sites-monitor/SitesFilterBar';
import { useSitesFilters, FilterDefinition } from '@/hooks/useSitesFilters';

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
      gradient: { 0.1: '#3b82f6', 0.3: '#10b981', 0.5: '#f59e0b', 0.7: '#f97316', 0.9: '#ef4444' },
    });
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, points, radius, blur, maxZoom, minOpacity]);
  return null;
};
import { fetchSiteDetails } from '../../services/api';
import { getSectorNumber, groupCellsBySector } from '../../utils/sectorUtils';
import { invalidateSitesCache } from '../../services/mockData';
import { fetchSitesByBbox, fetchCellsByBbox, invalidateBboxCache, BboxQuery, fetchDashboardSites, fetchSiteCells, invalidateDashboardSitesCache, invalidateSiteCellsCache } from '../../services/topoService';
import { BboxFilters } from '@/lib/localDb';
import { SiteSummary, SiteDetail, Filters } from '../../types';
import {
  Search, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  SlidersHorizontal, ChevronRight, LayoutGrid, List, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen, Filter, X, Maximize2, Minimize2,
  ChevronDown, ChevronUp, BarChart2, Signal, Settings2,
  Crosshair, MousePointerClick, Radio, Plus, Minus, Star, Trash2, Check, Play, RotateCcw, Save, FolderOpen, MoreVertical, Archive, CheckCircle2
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { getQoEColor } from '../../constants';

interface SitesMonitorProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onCellSelect: (cellId: string) => void;
  highlightedCellIds?: string[];
  onClearHighlights?: () => void;
  onLaunchAI?: (siteName: string) => void;
}

// Zoom hysteresis: avoid oscillating between aggregated sites and cell-level rendering
const SITES_TO_CELLS_ZOOM = 9;
const CELLS_TO_SITES_ZOOM = 7;

// Band-based color mapping — default engineering palette
const DEFAULT_BAND_COLORS: Record<string, string> = {
  // NR (5G) — muted violet tones
  NR3500: '#8b7ec8',
  NR700:  '#9f8fdb',
  NR2100: '#7565b0',
  // LTE (4G) — steel blue tones
  L2600:  '#5b8db8',
  L2100:  '#6d9ec5',
  L1800:  '#4a7da8',
  L800:   '#7eaed0',
  L700:   '#3d6d98',
  // Group header colors
  '5G_GROUP': '#a855f7',
  '4G_GROUP': '#f97316',
};
// Load custom colors from localStorage
const loadCustomBandColors = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('qoebit_band_colors');
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
const FRANCE_DEFAULT_ZOOM = 6;

type TopoNetworkStats = {
  sites4G: number;
  sites5G: number;
  cells4G: number;
  cells5G: number;
  bandMap4G: Record<string, number>;
  bandMap5G: Record<string, number>;
  vendorMap: Record<string, { '4G': number; '5G': number }>;
};

const EMPTY_TOPO_NETWORK_STATS: TopoNetworkStats = {
  sites4G: 0,
  sites5G: 0,
  cells4G: 0,
  cells5G: 0,
  bandMap4G: {},
  bandMap5G: {},
  vendorMap: {},
};

const is5GTech = (techno?: string | null) => {
  const tech = String(techno || '').toUpperCase();
  return tech.includes('5G') || tech.includes('NR');
};

const is4GTech = (techno?: string | null) => {
  const tech = String(techno || '').toUpperCase();
  return !is5GTech(tech) && (tech.includes('4G') || tech.includes('LTE'));
};

const buildTopoNetworkStatsFromRows = (rows: any[]): TopoNetworkStats => {
  const stats: TopoNetworkStats = {
    ...EMPTY_TOPO_NETWORK_STATS,
    bandMap4G: {},
    bandMap5G: {},
    vendorMap: {},
  };

  const siteTechMap = new Map<string, { has4G: boolean; has5G: boolean }>();

  rows.forEach((row, index) => {
    const techno = row?.techno ?? row?.technology ?? row?.rat ?? null;
    const is5G = is5GTech(techno);
    const is4G = is4GTech(techno);

    if (!is4G && !is5G) return;

    const siteKey = String(
      row?.code_nidt ?? row?.nom_site ?? row?.site_name ?? row?.site_id ?? row?.site ?? `site-${index}`,
    );
    const band = String(row?.bande ?? row?.band ?? 'Unknown');
    const vendor = String(row?.constructeur ?? row?.vendor ?? row?.vendor_name ?? 'Unknown');

    const siteEntry = siteTechMap.get(siteKey) ?? { has4G: false, has5G: false };

    if (is5G) {
      stats.cells5G += 1;
      stats.bandMap5G[band] = (stats.bandMap5G[band] || 0) + 1;
      siteEntry.has5G = true;
    } else {
      stats.cells4G += 1;
      stats.bandMap4G[band] = (stats.bandMap4G[band] || 0) + 1;
      siteEntry.has4G = true;
    }

    if (!stats.vendorMap[vendor]) {
      stats.vendorMap[vendor] = { '4G': 0, '5G': 0 };
    }
    if (is5G) stats.vendorMap[vendor]['5G'] += 1;
    if (is4G) stats.vendorMap[vendor]['4G'] += 1;

    siteTechMap.set(siteKey, siteEntry);
  });

  siteTechMap.forEach(({ has4G, has5G }) => {
    if (has4G) stats.sites4G += 1;
    if (has5G) stats.sites5G += 1;
  });

  return stats;
};

const normalizeBandKey = (bande: string, techno?: string): keyof typeof DEFAULT_BAND_COLORS | null => {
  if (!bande) return null;
  const normalized = bande.replace(/\s+/g, '').replace(/MHZ/gi, '').toUpperCase();
  const is5G = (techno || '').toUpperCase().includes('5G') || normalized.includes('NR') || /^N\d+$/i.test(normalized);

  if (normalized.includes('3500') || normalized.includes('NR3500') || normalized.includes('N78')) return 'NR3500';
  if (normalized.includes('2600') || normalized.includes('L2600') || normalized.includes('B7')) return 'L2600';
  if (normalized.includes('1800') || normalized.includes('L1800') || normalized.includes('B3')) return 'L1800';
  if (normalized.includes('800') || normalized.includes('L800') || normalized.includes('B20') || normalized.includes('B8')) return 'L800';

  if (normalized.includes('2100') || normalized.includes('NR2100') || normalized.includes('L2100') || normalized === 'N1' || normalized === 'B1') {
    return is5G ? 'NR2100' : 'L2100';
  }

  if (normalized.includes('700') || normalized.includes('NR700') || normalized.includes('L700') || normalized === 'N28' || normalized === 'B28') {
    return is5G ? 'NR700' : 'L700';
  }

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

// Sector radius in meters — constant ~45px visual size, calmer proportions
const getZoomAwareRadius = (lat: number, zoom: number): number => {
  const TARGET_PX = 45; // reduced from 60 for cleaner look
  const mpp = metersPerPixel(lat, zoom);
  return Math.max(40, Math.min(1500, TARGET_PX * mpp));
};

const inferSiteTechState = (site: SiteSummary) => {
  if (site.cells.length > 0) {
    const has5G = site.cells.some(cell => is5GTech(cell.techno));
    const has4G = site.cells.some(cell => is4GTech(cell.techno));
    return { has4G, has5G };
  }

  const nrCells = Number(site.nr_cells || 0);
  const lteCells = Number(site.lte_cells || 0);
  if (nrCells > 0 || lteCells > 0) {
    return { has4G: lteCells > 0, has5G: nrCells > 0 };
  }

  const fallbackTech = String(site.techno || '').toUpperCase();
  return {
    has4G: is4GTech(fallbackTech),
    has5G: is5GTech(fallbackTech),
  };
};

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

// Fly to a site when selected — progressive zoom to avoid forcing cell mode too early
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

  useEffect(() => {
    if (!coords || !isFinite(coords[0]) || !isFinite(coords[1])) return;

    const currentZoom = map.getZoom();
    const targetZoom = currentZoom < 13 ? 13 : currentZoom;
    const currentCenter = map.getCenter();
    const dist = map.distance(currentCenter, coords);

    onFlyStart?.();

    const handler = () => {
      onFlyEnd?.();
      onDone?.();
    };

    if (dist < 500 && Math.abs(currentZoom - targetZoom) < 1) {
      map.panTo(coords, { duration: 0.4, animate: true });
      map.once('moveend', handler);
      return () => {
        map.off('moveend', handler);
      };
    }

    map.flyTo(coords, targetZoom, { duration: 0.8 });
    map.once('moveend', handler);

    return () => {
      map.off('moveend', handler);
    };
  }, [coords, map, onFlyStart, onFlyEnd, onDone]);

  return null;
};

// Create custom panes for 4G/5G layering
const TechPanes: React.FC = () => {
  const map = useMap();
  // Use useLayoutEffect to create panes BEFORE first paint — ensures 5G is always on top from the start
  useLayoutEffect(() => {
    if (!map.getPane('pane4G')) {
      const p4 = map.createPane('pane4G');
      p4.style.zIndex = '400';
    }
    if (!map.getPane('pane5G')) {
      const p5 = map.createPane('pane5G');
      p5.style.zIndex = '500';
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

const losTargetIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:hsl(0,84%,60%);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Fit map bounds to highlighted cells
const FitHighlightBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds.pad(0.2), { duration: 1 });
    }
  }, [coords, map]);
  return null;
};

const TopoFranceViewportReset = ({ enabled, resetKey }: { enabled: boolean; resetKey: string }) => {
  const map = useMap();
  const lastResetKeyRef = useRef<string | null>(null);

  // Always center on France on very first mount, regardless of mode
  useEffect(() => {
    // Multiple attempts to ensure map is centered after full init
    const t1 = setTimeout(() => {
      map.invalidateSize();
      map.setView(FRANCE_CENTER, FRANCE_DEFAULT_ZOOM, { animate: false });
    }, 50);
    const t2 = setTimeout(() => {
      map.invalidateSize();
      map.setView(FRANCE_CENTER, FRANCE_DEFAULT_ZOOM, { animate: false });
    }, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled || lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    map.invalidateSize();
    map.setView(FRANCE_CENTER, FRANCE_DEFAULT_ZOOM, { animate: false });
  }, [enabled, resetKey, map]);

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
  const map = useMapEvents({
    moveend: () => {
      onViewportChange({
        bounds: map.getBounds(),
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    onViewportChange({
      bounds: map.getBounds(),
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

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
  { label: 'Constructeur', key: 'constructeur', icon: '🏭' },
  { label: 'Bande', key: 'bande', icon: '📡' },
  { label: 'Plaque', key: 'plaque', icon: '🗺️', freeText: true },
  { label: 'Région (UR)', key: 'region', icon: '📍', freeText: true },
  { label: 'DOR', key: 'dor', icon: '🏢', freeText: true },
  { label: 'Zone ARCEP', key: 'zone_arcep', icon: '📋' },
  { label: 'État Cellule', key: 'etat_cellule', icon: '🔋' },
  { label: 'Essentiel', key: 'essentiel', icon: '⭐' },
];
const SETTINGS_ATTR_VALUES: Record<string, string[]> = {
  constructeur: ['Nokia', 'Nokia_NR', 'Ericsson', 'Huawei', 'Samsung'],
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
  onSetDashboards: React.Dispatch<React.SetStateAction<any[]>>;
}

const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({ settings, onUpdate, onRename, currentName, dashboardId, isShared, beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, onClose, onSetDashboards }) => {
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
    onUpdate({ mapStyle: localMapStyle, themeMode: localThemeMode, mapLayer: localMapStyle, color: localColor, mapKpi: localKpis[0], mapKpis: localKpis, dataSource: localDataSource, viewFilters: localFilters });
    if (dashboardId && localVisibility !== isShared) {
      await dashboardsApi.update(dashboardId, { is_shared: localVisibility });
      onSetDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, is_shared: localVisibility } : d));
    }
    setDirty(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) { handleConfirm(); onClose(); } }}>
      <div className="w-[560px] max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Configuration</h2>
              <p className="text-[9px] text-muted-foreground">Paramètres du dashboard et de la carte</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Name ── */}
          {onRename && currentName != null && (
            <div className="p-4 rounded-xl border border-border bg-background">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-2">
                📝 {dashboardId ? 'Nom du Dashboard' : 'Nom de la Vue'}
              </label>
              <input
                value={localName}
                onChange={(e) => { setLocalName(e.target.value); setDirty(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleConfirm(); onClose(); } }}
                className="w-full bg-card border-2 border-border rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary transition-colors"
                placeholder={dashboardId ? 'Nom du dashboard...' : 'Nom de la vue...'}
              />
            </div>
          )}

          {/* ── Sections below only for dashboards ── */}
          {dashboardId && (<>
          {/* ── Map Style ── */}
          <div className="p-4 rounded-xl border border-border bg-background">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-3">🗺️ Style de carte</label>
            <p className="text-[9px] text-muted-foreground mb-3">Type de rendu cartographique</p>
            <div className="grid grid-cols-4 gap-2">
              {SETTINGS_MAP_STYLES.map(style => (
                <button key={style.value} onClick={() => { setLocalMapStyle(style.value); setDirty(true); }}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-[10px] font-bold transition-all border-2 ${localMapStyle === style.value ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                  <span className="text-xl">{style.icon}</span>
                  <span className="uppercase tracking-wider">{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Theme Mode ── */}
          <div className="p-4 rounded-xl border border-border bg-background">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-3">🎨 Mode d'affichage</label>
            <p className="text-[9px] text-muted-foreground mb-3">Apparence de l'interface</p>
            <div className="grid grid-cols-2 gap-3">
              {SETTINGS_THEME_MODES.map(mode => (
                <button key={mode.value} onClick={() => { setLocalThemeMode(mode.value); setDirty(true); }}
                  className={`flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-[12px] font-bold transition-all border-2 ${localThemeMode === mode.value ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                  <span className="text-lg">{mode.icon}</span>
                  <span className="uppercase tracking-wider">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Theme Color ── */}
          <div className="p-4 rounded-xl border border-border bg-background">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-3">🎯 Couleur du thème</label>
            <div className="flex gap-3 flex-wrap">
              {SETTINGS_PALETTE.map(c => (
                <button key={c.value || 'none'} onClick={() => { setLocalColor(c.value); setDirty(true); }}
                  className={`w-9 h-9 rounded-full border-[3px] transition-all ${localColor === c.value ? 'border-primary scale-110 shadow-lg ring-2 ring-primary/30' : 'border-border hover:border-primary/40 hover:scale-105'}`}
                  style={{ background: c.value || 'hsl(var(--muted))' }} title={c.label} />
              ))}
            </div>
          </div>

          {/* ── Data Source ── */}
          <div className="p-4 rounded-xl border border-border bg-background">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-3">📂 Source de données</label>
            <p className="text-[9px] text-muted-foreground mb-3">Sélectionnez le type de données à utiliser</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setLocalDataSource('qoe'); setDirty(true); }}
                className={`flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-[12px] font-bold transition-all border-2 ${localDataSource === 'qoe' ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                <span className="text-lg">📊</span><span className="uppercase tracking-wider">QoE</span>
              </button>
              <button onClick={() => { setLocalDataSource('parameters'); setDirty(true); }}
                className={`flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-[12px] font-bold transition-all border-2 ${localDataSource === 'parameters' ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                <span className="text-lg">⚙️</span><span className="uppercase tracking-wider">Parameters</span>
              </button>
            </div>
          </div>

          {/* ── QoE Indicators ── */}
          {localDataSource === 'qoe' && (
          <div className="p-4 rounded-xl border border-border bg-background">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-1">📊 Indicateurs QoE</label>
            <p className="text-[9px] text-muted-foreground mb-3">Sélectionnez un ou plusieurs indicateurs à afficher</p>
            <div className="grid grid-cols-2 gap-2">
              {SETTINGS_KPI_OPTIONS.map(kpi => {
                const isActive = localKpis.includes(kpi.value);
                return (
                  <button key={kpi.value} onClick={() => toggleKpi(kpi.value)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all border-2 ${isActive ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isActive ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                      {isActive && <Check size={10} className="text-primary-foreground" />}
                    </div>
                    {kpi.label}
                  </button>
                );
              })}
            </div>
          </div>
          )}
          </>)}

          {/* ── Dashboard Visibility ── */}
          {dashboardId && (
            <div className="p-4 rounded-xl border border-border bg-background">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-3">🔒 Visibilité du Dashboard</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setLocalVisibility(true); setDirty(true); }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-bold transition-all border-2 ${localVisibility ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                  <span>🌍</span><span className="uppercase tracking-wider">Public</span>
                </button>
                <button onClick={() => { setLocalVisibility(false); setDirty(true); }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-bold transition-all border-2 ${!localVisibility ? 'bg-primary/10 text-primary border-primary shadow-md ring-2 ring-primary/20' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
                  <span>🔐</span><span className="uppercase tracking-wider">Privé</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Beam Visibility Slider ── */}
          {dashboardId && (
            <div className="p-4 rounded-xl border border-border bg-background">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-1">📡 Visibilité des faisceaux (Beam)</label>
              <p className="text-[9px] text-muted-foreground mb-3">Contrôle l'opacité et la taille des secteurs sur la carte</p>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-muted-foreground w-6 text-right">0%</span>
                <Slider value={[beamVis ?? 75]} onValueChange={([v]) => { if (onBeamVisChange) onBeamVisChange(v); }} min={0} max={100} step={5} className="flex-1" />
                <span className="text-[9px] font-mono text-muted-foreground w-8">{beamVis ?? 75}%</span>
              </div>
              <div className="flex justify-between mt-2 text-[8px] text-muted-foreground/60">
                <span>Invisible</span><span>Max</span>
              </div>
            </div>
          )}

          {/* ── Dashboard Save/Load ── */}
          {dashboardId && (
            <div className="p-4 rounded-xl border border-border bg-background">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block mb-1">💾 Sauvegarde rapide</label>
              <p className="text-[9px] text-muted-foreground mb-3">Sauvegarder ou charger l'état complet de la carte dans ce dashboard</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { if (onSaveDashboard) onSaveDashboard(); }} disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-bold transition-all border-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary">
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  <span className="uppercase tracking-wider">Save</span>
                </button>
                <button onClick={() => { if (onLoadDashboard) onLoadDashboard(); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-bold transition-all border-2 border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted">
                  <FolderOpen size={14} /><span className="uppercase tracking-wider">Load</span>
                </button>
              </div>
            </div>
          )}

          {/* ── View Filters (only for views, not dashboards) ── */}
          {!dashboardId && (
            <div className="p-4 rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">🔍 Filtres</label>
                {localFilters.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold">{localFilters.length}</span>
                )}
              </div>
              {/* Existing filters display */}
              {localFilters.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {localFilters.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card">
                      <div className="flex items-center gap-2 text-[11px]">
                        {f.mode === 'topo' ? (
                          <>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-accent/20 text-accent-foreground">TOPO</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${f.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{f.tech}</span>
                            <span className="font-medium text-muted-foreground">{SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === f.attribute)?.label}</span>
                            <span className="text-muted-foreground/50">→</span>
                            <span className="font-semibold text-foreground">{f.value}</span>
                          </>
                        ) : (
                          <>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600">QOE</span>
                            <span className="font-medium text-muted-foreground">{QOE_FILTER_KPIS.find(k => k.key === f.kpi)?.label}</span>
                            <span className="font-bold text-foreground">{QOE_OPERATORS.find(o => o.key === f.operator)?.label}</span>
                            <span className="font-semibold text-primary">{f.threshold}{QOE_FILTER_KPIS.find(k => k.key === f.kpi)?.unit}</span>
                          </>
                        )}
                      </div>
                      <button onClick={() => removeFilterAt(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Step: idle — Add filter button */}
              {filterStep === 'idle' && (
                <button onClick={() => setFilterStep('pick_mode')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold text-primary border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 transition-all w-full justify-center">
                  <Plus size={14} /><span>Ajouter un filtre</span>
                </button>
              )}

              {/* Step 1: Choose TOPO or QOE */}
              {filterStep === 'pick_mode' && (
                <div className="border border-border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Étape 1 — Type de filtre</span>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => { setFilterDraft({ mode: 'topo' }); setFilterStep('pick_tech'); }}
                      className="group flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Network size={20} className="text-accent-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <span className="text-[12px] font-black uppercase tracking-wider text-muted-foreground group-hover:text-foreground">TOPO</span>
                      <span className="text-[9px] text-muted-foreground/70 text-center leading-tight">Filtrer par attribut réseau</span>
                    </button>
                    <button onClick={() => { setFilterDraft({ mode: 'qoe' }); setFilterStep('pick_kpi'); }}
                      className="group flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 border-border hover:border-amber-400/50 hover:bg-amber-500/5 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/15 transition-colors">
                        <Activity size={20} className="text-amber-600 group-hover:text-amber-500 transition-colors" />
                      </div>
                      <span className="text-[12px] font-black uppercase tracking-wider text-muted-foreground group-hover:text-foreground">QOE</span>
                      <span className="text-[9px] text-muted-foreground/70 text-center leading-tight">Filtrer par performance KPI</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TOPO Branch — Step 2: Pick tech */}
              {filterStep === 'pick_tech' && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_mode')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 bg-accent/20 text-accent-foreground">TOPO</span>
                        Étape 2 — Technologie
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['4G', '5G'].map(t => (
                      <button key={t} onClick={() => { setFilterDraft(prev => ({ ...prev, tech: t })); setFilterStep('pick_attr'); }}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[12px] font-bold border-2 border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
                        <span>{t === '5G' ? '🚀' : '📶'}</span><span>{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TOPO Branch — Step 3: Pick attribute */}
              {filterStep === 'pick_attr' && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_tech')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 ${filterDraft.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{filterDraft.tech}</span>
                        Étape 3 — Attribut
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  {SETTINGS_FILTER_ATTRIBUTES.map(attr => (
                    <button key={attr.key} onClick={() => { setFilterDraft(prev => ({ ...prev, attribute: attr.key })); setFilterStep('pick_value'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                      <span>{attr.icon}</span><span>{attr.label}</span>
                      <ChevronRight size={10} className="ml-auto text-muted-foreground/50" />
                    </button>
                  ))}
                </div>
              )}

              {/* TOPO Branch — Step 4: Pick value */}
              {filterStep === 'pick_value' && filterDraft.attribute && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_attr')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 ${filterDraft.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{filterDraft.tech}</span>
                        {SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.label} — Valeur
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  {SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.freeText ? (
                    <div className="flex gap-2">
                      <input type="text" value={freeTextValue} onChange={e => setFreeTextValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && freeTextValue.trim()) { commitFilter(freeTextValue.trim()); } }}
                        placeholder={`Entrer ${SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.label}...`}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                      <button onClick={() => { if (freeTextValue.trim()) commitFilter(freeTextValue.trim()); }}
                        disabled={!freeTextValue.trim()} className="px-3 py-2 rounded-lg text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-all">OK</button>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {(SETTINGS_ATTR_VALUES[filterDraft.attribute] || []).map(val => (
                        <button key={val} onClick={() => commitFilter(val)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all">
                          <span>{val}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* QOE Branch — Step 2: Pick KPI */}
              {filterStep === 'pick_kpi' && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_mode')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 bg-amber-500/15 text-amber-600">QOE</span>
                        Étape 2 — Indicateur KPI
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  <input
                    type="text"
                    value={kpiSearch}
                    onChange={e => setKpiSearch(e.target.value)}
                    placeholder="Rechercher un KPI..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {QOE_FILTER_KPIS
                      .filter(k => !kpiSearch || k.label.toLowerCase().includes(kpiSearch.toLowerCase()) || k.key.toLowerCase().includes(kpiSearch.toLowerCase()))
                      .map(kpi => (
                      <button key={kpi.key} onClick={() => { setFilterDraft(prev => ({ ...prev, kpi: kpi.key })); setFilterStep('pick_operator'); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-amber-500/5 transition-all group">
                        <span className="text-base">{kpi.icon}</span>
                        <span className="flex-1 text-left">{kpi.label}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50 group-hover:text-muted-foreground">{kpi.unit}</span>
                        <ChevronRight size={10} className="text-muted-foreground/30 group-hover:text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* QOE Branch — Step 3: Pick operator */}
              {filterStep === 'pick_operator' && (
                <div className="border border-border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_kpi')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 bg-amber-500/15 text-amber-600">QOE</span>
                        {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.label} — Opérateur
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {QOE_OPERATORS.map(op => (
                      <button key={op.key} onClick={() => { setFilterDraft(prev => ({ ...prev, operator: op.key })); setFilterStep('pick_threshold'); }}
                        className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 border-border hover:border-amber-400/50 hover:bg-amber-500/5 transition-all group">
                        <span className="text-[18px] font-black text-foreground group-hover:text-amber-600">{op.label}</span>
                        <span className="text-[8px] text-muted-foreground/60 group-hover:text-muted-foreground">{op.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* QOE Branch — Step 4: Enter threshold value */}
              {filterStep === 'pick_threshold' && (
                <div className="border border-border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_operator')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 bg-amber-500/15 text-amber-600">QOE</span>
                        Seuil
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  {/* Summary of what's being filtered */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                    <span className="text-[10px] font-bold text-foreground">{QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.label}</span>
                    <span className="text-[14px] font-black text-amber-600">{QOE_OPERATORS.find(o => o.key === filterDraft.operator)?.label}</span>
                    <span className="text-[10px] text-muted-foreground">?</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={thresholdInput}
                        onChange={e => setThresholdInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && thresholdInput.trim()) commitFilter(); }}
                        placeholder="Entrer la valeur..."
                        className="w-full px-3 py-3 rounded-xl border-2 border-border bg-background text-[14px] font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        autoFocus
                      />
                      {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.unit && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">
                          {QOE_FILTER_KPIS.find(k => k.key === filterDraft.kpi)?.unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => commitFilter()}
                    disabled={!thresholdInput.trim() || isNaN(parseFloat(thresholdInput))}
                    className="w-full py-3 rounded-xl text-[12px] font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                  >
                    ✓ Confirmer le filtre
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <div className="px-5 pb-5 pt-2">
          <button onClick={() => { handleConfirm(); onClose(); }}
            className={`w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${dirty ? 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90' : 'bg-muted text-muted-foreground border border-border'}`}>
            {dirty ? '✓ Confirmer les modifications' : '✓ Paramètres sauvegardés'}
          </button>
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
}> = ({ label, values, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return values;
    const q = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  if (values.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
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
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</span>
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

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card rounded-lg border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden">
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
          <div className="max-h-[180px] overflow-y-auto py-0.5">
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
        </div>
      )}
    </div>
  );
};


export interface DashboardSiteFilters {
  dor?: string[];
  constructeur?: string[];
  plaque?: string[];
  techno?: string[];
  bande?: string[];
  zone_arcep?: string[];
  saisonnier?: string[];
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
}

const AUTO_FILTER_DASHBOARD_NAME = /^Filtre \d{2}\/\d{2}\/\d{4}$/;

const dedupeAutoFilterDashboards = (items: any[]) => {
  return items.filter((item) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    return !AUTO_FILTER_DASHBOARD_NAME.test(name);
  });
};

const DashboardInventoryTab: React.FC<DashboardInventoryTabProps> = ({ onApplyView, onDashboardActiveChange, beamVisibility: beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, backendFilterDefs, activeDashboardId, onActiveDashboardIdChange }) => {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [ldg, setLdg] = useState(true);
  const [mapViews, setMapViews] = useState<any[]>([]);
  const [showCreateView, setShowCreateView] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [creating, setCreating] = useState(false);
  const expandedDashboardId = activeDashboardId;
  const setExpandedDashboardId = onActiveDashboardIdChange;
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
    setExpandedDashboardId(newId);
    if (newId && onApplyView) {
      const db = dashboards.find(d => d.id === newId);
      if (db) {
        onApplyView(getDashboardSettings(db));
        onDashboardActiveChange?.(true, extractScope(db), extractSiteFilters(db));
      }
    } else {
      onDashboardActiveChange?.(false, null, null);
    }
  };

  const confirmSwitchWithSave = () => {
    if (expandedDashboardId && onSaveDashboard) onSaveDashboard(expandedDashboardId);
    setExpandedDashboardId(pendingSwitchId);
    if (pendingSwitchId && onApplyView) {
      const db = dashboards.find(d => d.id === pendingSwitchId);
      if (db) {
        onDashboardActiveChange?.(true, extractScope(db), extractSiteFilters(db));
      }
    }
    setShowSwitchConfirm(false);
    setPendingSwitchId(null);
  };

  const confirmSwitchWithoutSave = () => {
    setExpandedDashboardId(pendingSwitchId);
    if (pendingSwitchId && onApplyView) {
      const db = dashboards.find(d => d.id === pendingSwitchId);
      if (db) {
        onApplyView(getDashboardSettings(db));
        onDashboardActiveChange?.(true, extractScope(db), extractSiteFilters(db));
      }
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

  // ── Dashboard settings helpers ──
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

  // Use backend filter defs for dashboard creation
  const filterDimensions = backendFilterDefs || [];

  const toggleCreateFilterValue = (dimKey: string, val: string) => {
    setCreateFilters(prev => {
      const current = prev[dimKey as keyof DashboardSiteFilters] || [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [dimKey]: next.length > 0 ? next : undefined };
    });
  };

  const hasAnyCreateFilter = useMemo(() => {
    return Object.values(createFilters).some(v => v && v.length > 0);
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
    // Clean filters (remove empty arrays)
    const cleanFilters: DashboardSiteFilters = {};
    for (const [k, v] of Object.entries(createFilters)) {
      if (v && v.length > 0) (cleanFilters as any)[k] = v;
    }
    try {
      const session = JSON.parse(localStorage.getItem('admin_session') || 'null');
      await dashboardsApi.upsert({
        id,
        name: newDashName.trim(),
        description: '',
        is_shared: true,
        widgets: [{ _type: 'dashboard_settings', mapLayer: 'light', mapKpi: 'qoe_score_avg', color: '', siteScope: finalScope, siteFilters: cleanFilters }],
        owner_username: session?.username,
      });
      setNewDashName('');
      setShowCreateDash(false);
      setCreateFilters({});
      await fetchAll();
      setExpandedDashboardId(id);
      onDashboardActiveChange?.(true, finalScope, cleanFilters);
    } catch (err) { console.warn('[SitesMonitor] createDashboard failed', err); }
    setCreatingDash(false);
  };

  const handleCreateDashboard = async () => {
    handleCreateDashboardWithFilters();
  };

  const handleDeleteDashboard = async (dbId: string) => {
    await dashboardsApi.update(dbId, { is_archived: true });
    if (expandedDashboardId === dbId) {
      setExpandedDashboardId(null);
      onDashboardActiveChange?.(false, null, null);
    }
    setDashboards(prev => prev.filter(d => d.id !== dbId));
    setShowDeleteConfirm(null);
  };

  const handlePermanentDeleteDashboard = async (dbId: string) => {
    await dashboardsApi.update(dbId, { is_archived: true });
    if (expandedDashboardId === dbId) {
      setExpandedDashboardId(null);
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
    const db = allDashboards.find(d => d.id === dbId);
    if (db) {
      // Add to local list if not already there
      setDashboards(prev => {
        if (prev.find(d => d.id === dbId)) return prev;
        return [...prev, db];
      });
      // Apply directly using the db object (don't rely on stale dashboards state)
      setExpandedDashboardId(dbId);
      if (onApplyView) {
        onApplyView(getDashboardSettings(db));
      }
      onDashboardActiveChange?.(true, extractScope(db), extractSiteFilters(db));
    } else {
      requestDashboardSwitch(dbId);
    }
  };
  const handleCreateView = async (dashboardId: string) => {
    if (!newViewName.trim()) return;
    setCreating(true);
    try {
      await mapViewsApi.create({
        name: newViewName.trim(),
        description: dashboardId,
        settings: { center: [43.2965, 5.3698], zoom: 6 },
      });
      setNewViewName('');
      setShowCreateView(null);
      fetchAll();
    } catch (err) { console.warn('[SitesMonitor] createView failed', err); }
    setCreating(false);
  };

  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await mapViewsApi.remove(id);
    fetchAll();
  };

  const handleUpdateViewSettings = async (viewId: string, updates: Record<string, any>) => {
    const view = mapViews.find(v => v.id === viewId);
    if (!view) return;
    const currentSettings = typeof view.settings === 'object' ? view.settings : {};
    const newSettings = { ...currentSettings, ...updates };
    await mapViewsApi.update(viewId, { settings: newSettings });
    setMapViews(prev => prev.map(v => v.id === viewId ? { ...v, settings: newSettings } : v));
    // Also apply filters immediately
    if (onApplyView) onApplyView(newSettings);
  };

  const handleRenameView = async (viewId: string, newName: string) => {
    if (!newName.trim()) return;
    await mapViewsApi.update(viewId, { name: newName.trim() });
    setMapViews(prev => prev.map(v => v.id === viewId ? { ...v, name: newName.trim() } : v));
  };

  // Resolve effective settings for a view (dashboard parent + view overrides)
  const getEffectiveViewSettings = (view: any, dbSettings: any) => {
    const vs = typeof view.settings === 'object' ? view.settings : {};
    return {
      mapLayer: vs.mapLayer || dbSettings.mapLayer || 'street',
      mapStyle: vs.mapStyle || dbSettings.mapStyle || vs.mapLayer || dbSettings.mapLayer || 'street',
      themeMode: vs.themeMode || dbSettings.themeMode || 'light',
      mapKpi: vs.mapKpi || dbSettings.mapKpi || 'qoe_score_avg',
      color: vs.color || dbSettings.color || '',
      center: vs.center || dbSettings.center,
      zoom: vs.zoom || dbSettings.zoom,
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
        <span className="text-[9px] font-bold text-muted-foreground">{dashboards.length}</span>
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
      {expandedDashboardId && (() => {
        const activeName = dashboards.find(d => d.id === expandedDashboardId)?.name;
        return activeName ? (
          <div className="px-2 mb-2">
            <span className="text-[11px] font-bold text-primary truncate block">{activeName}</span>
          </div>
        ) : null;
      })()}

      {/* Create dashboard popup */}
      {showCreateDash && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) { setShowCreateDash(false); setNewDashName(''); setCreateFilters({}); } }}>
          <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto p-0 gap-0" onPointerDownOutside={() => { setShowCreateDash(false); setNewDashName(''); setCreateFilters({}); }}>
            <DialogHeader className="px-6 pt-6 pb-3">
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Plus size={16} className="text-primary" />
                Créer un Dashboard
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Définissez le nom et les filtres de sites pour votre nouveau dashboard.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-6 space-y-4">
              {/* Name */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Nom du dashboard</label>
                <input
                  autoFocus
                  value={newDashName}
                  onChange={e => setNewDashName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newDashName.trim()) { handleCreateDashboard(); } }}
                  placeholder="Nom du dashboard..."
                  className="w-full bg-muted border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Filter dimensions from backend */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Filtres de sites</label>
                <p className="text-[9px] text-primary/70 italic mb-3">Sélectionnez les critères pour filtrer les sites affichés sur la carte</p>
                {filterDimensions.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground/60 text-center py-3">Chargement des filtres...</div>
                ) : (
                  <div className="space-y-2">
                    {filterDimensions.map(dim => {
                      const selectedValues = createFilters[dim.id as keyof DashboardSiteFilters] || [];
                      return (
                        <CreateFilterDropdown
                          key={dim.id}
                          label={dim.label}
                          values={dim.values}
                          selected={selectedValues}
                          onChange={(vals) => setCreateFilters(prev => ({ ...prev, [dim.id]: vals.length > 0 ? vals : undefined }))}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active filter summary */}
              {hasAnyCreateFilter && (
                <div className="border border-primary/20 rounded-xl bg-primary/5 p-3">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Filtres actifs</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {Object.entries(createFilters).filter(([, v]) => v && v.length > 0).map(([key, vals]) => (
                      <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                        {filterDimensions.find(d => d.id === key)?.label || key}: {vals!.join(', ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCreateDash(false); setNewDashName(''); setCreateFilters({}); }}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => { handleCreateDashboard(); }}
                  disabled={!newDashName.trim() || creatingDash}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  {creatingDash ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
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
                {allDashboards.map(db => (
                  <button
                    key={db.id}
                    onClick={() => loadDashboardFromPicker(db.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
                  >
                    <LayoutGrid size={12} className="text-primary/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-foreground block truncate">{db.name}</span>
                      <span className="text-[8px] text-muted-foreground">{new Date(db.updated_at).toLocaleDateString()}</span>
                    </div>
                    <ArrowRight size={11} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
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


      {dashboards.length === 0 || !expandedDashboardId ? (
        <div className="px-3 py-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <LayoutGrid size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">Aucun dashboard actif</p>
            <p className="text-[9px] text-muted-foreground mt-1">Créez ou chargez un dashboard pour afficher les sites sur la carte.</p>
          </div>
          <div className="flex gap-2 justify-center">
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
        </div>
      ) : (
        <div className="space-y-1.5">
          {dashboards.filter(db => db.id === expandedDashboardId).map(db => {
            const isExpanded = expandedDashboardId === db.id;
            const dbSettings = getDashboardSettings(db);
            const dbColor = dbSettings.color || '';
            const isEditingDb = editingDashboardId === db.id;
            const dbViews = mapViews.filter(v => v.description === db.id);

            return (
              <div key={db.id} className={`rounded-xl border overflow-hidden transition-all ${isExpanded ? 'border-primary/50 ring-1 ring-primary/20 bg-primary/[0.03]' : 'border-border bg-card'}`}>
                {/* Dashboard row */}
                <div
                  onClick={() => {
                    requestDashboardSwitch(isExpanded ? null : db.id);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${isExpanded ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                  style={dbColor ? { borderLeft: `3px solid ${dbColor}` } : undefined}
                >
                  <div className="shrink-0 p-0.5">
                    <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'text-primary' : 'text-muted-foreground -rotate-90'}`} />
                  </div>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isExpanded && !dbColor ? 'bg-primary/15' : ''}`}
                    style={dbColor ? { background: dbColor + (isExpanded ? '33' : '22'), color: dbColor } : undefined}
                  >
                    <LayoutGrid size={13} className={dbColor ? '' : (isExpanded ? 'text-primary' : 'text-primary/60')} style={dbColor ? { color: dbColor } : undefined} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[12px] font-bold truncate block ${isExpanded ? 'text-primary' : 'text-foreground'}`}>{db.name}</span>
                    <div className="flex items-center gap-2 text-[8px] text-muted-foreground mt-0.5">
                      <span>{SETTINGS_MAP_STYLES.find(l => l.value === (dbSettings.mapStyle || dbSettings.mapLayer || 'street'))?.label || 'Street'}</span>
                      <span>•</span>
                      <span>{SETTINGS_KPI_OPTIONS.find(k => k.value === (dbSettings.mapKpi || 'qoe_score_avg'))?.label || 'QoE'}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingDashboardId(isEditingDb ? null : db.id); }}
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${isEditingDb ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    title="Settings"
                  >
                    <Settings2 size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Archiver ce dashboard ?')) handleDeleteDashboard(db.id); }}
                    className="p-1.5 rounded-lg transition-colors shrink-0 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                    title="Archiver"
                  >
                    <Archive size={12} />
                  </button>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${db.is_shared ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {db.is_shared ? 'Public' : 'Privé'}
                  </span>
                </div>

                {/* Dashboard settings panel */}
                {isEditingDb && (
                  <DashboardSettingsPanel
                    settings={dbSettings}
                    onUpdate={(u) => { updateDashboardSettings(db.id, u); if (onApplyView) onApplyView(u); }}
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
                    onSetDashboards={setDashboards}
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
                        onClick={() => setShowDeleteConfirm(db.id)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-destructive/30 text-destructive/70 hover:text-destructive hover:border-destructive hover:bg-destructive/5"
                      >
                        <Trash2 size={12} />
                        <span className="uppercase tracking-wider">Delete</span>
                      </button>
                      <button
                        onClick={() => requestDashboardSwitch(null)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted"
                      >
                        <X size={12} />
                        <span className="uppercase tracking-wider">Close</span>
                      </button>
                    </div>
                  </div>
                )}
                {isExpanded && (
                  <div className="ml-5 pl-3 border-l-2 border-border/60 space-y-1 py-1.5">
                    {/* Create new view */}
                    {showCreateView === db.id ? (
                      <div className="flex items-center gap-1.5 py-1 px-1">
                        <input
                          autoFocus
                          value={newViewName}
                          onChange={e => setNewViewName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleCreateView(db.id)}
                          placeholder="Nom de la vue..."
                          className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
                        />
                        <button onClick={() => handleCreateView(db.id)} disabled={creating || !newViewName.trim()}
                          className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                          <Plus size={12} />
                        </button>
                        <button onClick={() => { setShowCreateView(null); setNewViewName(''); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCreateView(db.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Plus size={11} />
                        Ajouter une vue
                      </button>
                    )}

                    {dbViews.length === 0 ? (
                      <div className="px-2 py-1.5 text-center text-[9px] text-muted-foreground/50">Aucune vue</div>
                    ) : (
                      dbViews.map(view => {
                        const vs = typeof view.settings === 'object' ? view.settings : {} as any;
                        const eff = getEffectiveViewSettings(view, dbSettings);
                        const viewColor = eff.color;
                        const isEditing = editingViewId === view.id;
                        const hasOwnSettings = vs.mapLayer || vs.mapKpi || vs.color;

                        return (
                          <div key={view.id} className="rounded-lg border border-border/60 bg-card hover:border-primary/30 transition-all overflow-hidden">
                            <div
                              className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
                              style={viewColor ? { borderLeft: `3px solid ${viewColor}` } : undefined}
                              onClick={() => { if (onApplyView) onApplyView(eff); }}
                            >
                              <MapIcon size={12} className="text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {view.is_default && <Star size={8} className="text-amber-500 fill-amber-500 shrink-0" />}
                                  <span className="text-[11px] font-semibold text-foreground truncate">{view.name}</span>
                                  {hasOwnSettings && <span className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent-foreground font-bold uppercase">custom</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[8px] text-muted-foreground mt-0.5">
                                  <span>{SETTINGS_MAP_STYLES.find(l => l.value === (eff.mapStyle || eff.mapLayer))?.label || 'Street'}</span>
                                  <span>•</span>
                                  <span>{SETTINGS_KPI_OPTIONS.find(k => k.value === eff.mapKpi)?.label || 'QoE'}</span>
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

                            {isEditing && (
                              <DashboardSettingsPanel
                                settings={vs}
                                onUpdate={(u) => handleUpdateViewSettings(view.id, u)}
                                onRename={(name) => handleRenameView(view.id, name)}
                                currentName={view.name}
                                onClose={() => { setEditingDashboardId(null); setEditingViewId(null); }}
                                onSetDashboards={setDashboards}
                              />
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
    </div>
  );
};

const SitesMonitor: React.FC<SitesMonitorProps> = ({ filters, onFilterChange, onCellSelect, highlightedCellIds = [], onClearHighlights, onLaunchAI }) => {
  const mapCache = useMapSitesStore();
  const [sites, setSitesRaw] = useState<SiteSummary[]>(() => {
    // Restore from cache if valid
    if (mapCache.isCacheValid() && mapCache.cachedSites.length > 0) {
      return mapCache.cachedSites as any;
    }
    return [];
  });
  // Wrap setSites to also update cache
  const setSites = useCallback((newSites: SiteSummary[] | ((prev: SiteSummary[]) => SiteSummary[])) => {
    setSitesRaw((prev) => {
      const resolved = typeof newSites === 'function' ? newSites(prev) : newSites;
      // Cache in store (non-blocking)
      if (resolved.length > 0) {
        mapCache.setSitesCache(resolved as any, resolved.length, null, null);
      }
      return resolved;
    });
  }, [mapCache]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedSiteSnapshot, setSelectedSiteSnapshot] = useState<SiteSummary | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'map'>('map');
  const [localSearch, setLocalSearch] = useState('');
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
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
  const [mapKpi, setMapKpi] = useState('qoe_score_avg');
  const [showKpiDropdown, setShowKpiDropdown] = useState(false);
  const [inventorySortOrder, setInventorySortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [activeViewFilters, setActiveViewFilters] = useState<{ mode: string; kpi?: string; operator?: string; threshold?: number; tech?: string; attribute?: string; value?: string }[]>([]);
  const [showLegend, setShowLegend] = useState(true);
  const [viewport, setViewport] = useState<ViewportState>({ bounds: null, zoom: mapCache.cachedZoom || 6 });
  const [initialCenter] = useState<[number, number] | null>(mapCache.cachedCenter);
  const displayModeRef = useRef<'sites' | 'cells'>('sites');
  const [mapRendering, setMapRendering] = useState(false);
  const [clusteringUnlocked, setClusteringUnlocked] = useState(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'sites' | 'points' | 'heatmap'>('sites');
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'satellite'>('light');
  const [showSiteLabels, setShowSiteLabels] = useState(false);
  const [showBeamSectors, setShowBeamSectors] = useState(true);

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
  };

  const [mapTechnoFilter, setMapTechnoFilter] = useState<'ALL' | '5G' | '4G' | 'OFF'>('ALL');
  const [enabledBands, setEnabledBands] = useState<Set<string>>(new Set(Object.keys(DEFAULT_BAND_COLORS)));
  const [enabledTechnos, setEnabledTechnos] = useState<Set<string>>(new Set(['5G', '4G']));
  const [showBandPanel, setShowBandPanel] = useState(true);
  const [sectorColorMode, setSectorColorMode] = useState<'topo' | 'kpi'>('topo');
  const [topoResetCounter, setTopoResetCounter] = useState(0);
  const [bandColors, setBandColors] = useState<Record<string, string>>(loadCustomBandColors);
  const [editingColorBand, setEditingColorBand] = useState<string | null>(null);

  // ── TOPO mode: fetch global network stats from DB ──
  const [topoNetworkStats, setTopoNetworkStats] = useState<TopoNetworkStats | null>(null);

  useEffect(() => {
    if (sectorColorMode !== 'topo') return;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const topoRowsResponse = await topoApi.list(100000);
        const topoRows = Array.isArray(topoRowsResponse?.rows) ? topoRowsResponse.rows : [];

        if (!cancelled && topoRows.length > 0) {
          setTopoNetworkStats(buildTopoNetworkStatsFromRows(topoRows));
          return;
        }

        const { data, error } = await supabase.rpc('topo_inventory_stats');
        if (cancelled) return;
        if (error || !data) {
          setTopoNetworkStats(EMPTY_TOPO_NETWORK_STATS);
          return;
        }

        const stats = data as any;
        const fallbackStats: TopoNetworkStats = {
          ...EMPTY_TOPO_NETWORK_STATS,
          bandMap4G: {},
          bandMap5G: {},
          vendorMap: {},
        };

        // by_techno is { "4G": count, "5G": count, ... }
        if (stats.by_techno && typeof stats.by_techno === 'object') {
          Object.entries(stats.by_techno).forEach(([tech, count]: [string, any]) => {
            if (is5GTech(tech)) fallbackStats.cells5G += Number(count || 0);
            else if (is4GTech(tech)) fallbackStats.cells4G += Number(count || 0);
          });
        }

        if (stats.by_bande && typeof stats.by_bande === 'object') {
          Object.entries(stats.by_bande).forEach(([band, count]: [string, any]) => {
            const bandLabel = String(band || 'Unknown');
            if (/^N|NR|5G/i.test(bandLabel)) fallbackStats.bandMap5G[bandLabel] = Number(count || 0);
            else fallbackStats.bandMap4G[bandLabel] = Number(count || 0);
          });
        }

        if (stats.by_constructeur && typeof stats.by_constructeur === 'object') {
          Object.entries(stats.by_constructeur).forEach(([vendor, count]: [string, any]) => {
            fallbackStats.vendorMap[vendor] = { '4G': Number(count || 0), '5G': 0 };
          });
        }

        fallbackStats.sites4G = Number(stats.total_sites ?? 0);
        fallbackStats.sites5G = 0;
        setTopoNetworkStats(fallbackStats);
      } catch (e) {
        console.error('[TOPO] Failed to fetch network stats:', e);
        if (!cancelled) setTopoNetworkStats(EMPTY_TOPO_NETWORK_STATS);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, [sectorColorMode]);

  // Dynamic color getters using state
  const getBandColor = useCallback((bande: string, techno?: string): string => {
    const key = normalizeBandKey(bande, techno);
    if (!key) return '#94a3b8';
    return bandColors[key] || DEFAULT_BAND_COLORS[key];
  }, [bandColors]);

  const getBandStrokeColor = useCallback((bande: string, techno?: string): string => {
    const key = normalizeBandKey(bande, techno);
    if (!key) return '#64748b';
    return deriveStrokeColor(bandColors[key] || DEFAULT_BAND_COLORS[key]);
  }, [bandColors]);

  const NR_BANDS = ['NR3500', 'NR700', 'NR2100'];
  const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700'];

  const updateBandColor = useCallback((band: string, color: string) => {
    setBandColors(prev => {
      const next = { ...prev, [band]: color };
      // When changing a group color, propagate to all bands in that group
      if (band === '5G_GROUP') {
        NR_BANDS.forEach(b => { next[b] = color; });
      } else if (band === '4G_GROUP') {
        LTE_BANDS.forEach(b => { next[b] = color; });
      }
      localStorage.setItem('qoebit_band_colors', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetBandColors = useCallback(() => {
    setBandColors({ ...DEFAULT_BAND_COLORS });
    localStorage.removeItem('qoebit_band_colors');
  }, []);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Focus mode: 'global' | 'site' | 'cell'
  const [focusMode, setFocusMode] = useState<'global' | 'site' | 'cell'>('global');
  const [focusCellId, setFocusCellId] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<number>>(new Set());
  const [cellDetailTab, setCellDetailTab] = useState<'kpi' | 'topo' | 'sim' | 'config'>('kpi');

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
  const [inventoryTab, setInventoryTab] = useState<'sites' | 'dashboard'>('dashboard');
  const [activeDashboardId, _setActiveDashboardId] = useState<string | null>(() => {
    try { return localStorage.getItem('qoebit_active_dashboard_id') || null; } catch { return null; }
  });
  const setActiveDashboardId = useCallback((id: string | null) => {
    _setActiveDashboardId(id);
    try {
      if (id) localStorage.setItem('qoebit_active_dashboard_id', id);
      else localStorage.removeItem('qoebit_active_dashboard_id');
    } catch (err) { console.warn('[SitesMonitor] localStorage activeDashboardId failed', err); }
  }, []);
  const [beamVisibility, setBeamVisibility] = useState<number>(() => {
    try { const v = localStorage.getItem('qoebit_beam_visibility'); return v ? Number(v) : 75; } catch { return 75; }
  });

  // ── Active Dashboard selector ──
  const [dashboardActive, setDashboardActive] = useState(false);
  const [activeSiteScope, setActiveSiteScope] = useState<SiteScope | null>(null);
  const [activeDashboardFilters, setActiveDashboardFilters] = useState<DashboardSiteFilters | null>(null);
  // activeDashboardId already declared above for tab persistence
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

  // Load available parameters once panel opens
  useEffect(() => {
    if (!paramPanelOpen || paramAvailable.length > 0) return;
    (async () => {
      setParamAvailableLoading(true);
      try {
        const { data, error } = await (supabase as any).from('parameter_dump').select('parameter').limit(10000);
        if (!error && data) {
          const unique = [...new Set(data.map((r: any) => r.parameter).filter(Boolean))].sort() as string[];
          setParamAvailable(unique);
        }
      } catch (err) { console.warn('[SitesMonitor] paramAvailable fetch failed', err); }
      setParamAvailableLoading(false);
    })();
  }, [paramPanelOpen]);

  const paramFilteredList = useMemo(() => {
    if (!paramSearch) return paramAvailable;
    const s = paramSearch.toLowerCase();
    return paramAvailable.filter(p => p.toLowerCase().includes(s));
  }, [paramAvailable, paramSearch]);

  const handleParamConfirm = useCallback(async () => {
    if (!paramSelected) return;
    setParamConfirmed(paramSelected);
    setParamMode(true);
    setParamLoading(true);
    setParamPanelOpen(false);
    try {
      const { data, error } = await (supabase as any)
        .from('parameter_dump')
        .select('cell_name, site_name, latitude, longitude, parameter, value, bande, vendor, dn')
        .eq('parameter', paramSelected)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(100000);
      if (!error && data) setParamPoints(data.filter((r: any) => r.latitude && r.longitude));
      else setParamPoints([]);
    } catch { setParamPoints([]); }
    setParamLoading(false);
  }, [paramSelected]);

  const handleParamReset = useCallback(() => {
    setParamMode(false);
    setParamConfirmed(null);
    setParamSelected(null);
    setParamPoints([]);
    setParamPanelOpen(false);
  }, []);

  const paramValueColor = useCallback((val: string | null): string => {
    if (!val) return 'hsl(0, 0%, 60%)';
    let hash = 0;
    for (let i = 0; i < val.length; i++) hash = val.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  }, []);

  const paramUniqueValues = useMemo(() => {
    return [...new Set(paramPoints.map(p => p.value || '(vide)'))].sort();
  }, [paramPoints]);
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

        // Auto-restore persisted dashboard if it exists in the list
        const persistedId = activeDashboardId;
        if (persistedId && cleaned.some((d: any) => d.id === persistedId)) {
          setDashboardActive(true);
          // Extract filters from the dashboard widgets
          const db = cleaned.find((d: any) => d.id === persistedId);
          if (db) {
            const widgets = Array.isArray(db.widgets) ? db.widgets : [];
            const dashSettings = widgets.find((w: any) => w.type === 'dashboard_settings' || w.dashboard_settings);
            const scope = dashSettings?.scope || dashSettings?.dashboard_settings?.scope || null;
            const siteFilters = dashSettings?.siteFilters || dashSettings?.dashboard_settings?.siteFilters || null;
            setActiveSiteScope(scope);
            setActiveDashboardFilters(siteFilters);
          }
        }
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
      if (settings.mapKpi) setMapKpi(settings.mapKpi);
      if (settings.mapTechnoFilter) setMapTechnoFilter(settings.mapTechnoFilter);
      if (settings.enabledBands) setEnabledBands(new Set(settings.enabledBands));
      if (settings.sectorColorMode) setSectorColorMode(settings.sectorColorMode);
      if (settings.mapDisplayMode) setMapDisplayMode(settings.mapDisplayMode);
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
      if (settings.bandColors) {
        setBandColors(settings.bandColors);
        localStorage.setItem('qoebit_band_colors', JSON.stringify(settings.bandColors));
      }
      if (settings.center && settings.center[0] > 41 && settings.center[0] < 52 && settings.center[1] > -6 && settings.center[1] < 11) setFlyTarget(settings.center);
      if (settings.beamVisibility != null) {
        setBeamVisibility(settings.beamVisibility);
        localStorage.setItem('qoebit_beam_visibility', String(settings.beamVisibility));
      }
    }
    setActiveDashboardId(dbId);
    setShowDashboardDropdown(false);
  }, [dashboardList]);

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

  const MAP_KPIS = [
    { id: 'qoe_score_avg', label: 'Score QoE Global', category: 'QUALITY' },
    { id: 'dms_dl_3', label: 'DMS DL ≥ 3 Mbps', category: 'QUALITY' },
    { id: 'dms_dl_8', label: 'DMS DL ≥ 8 Mbps', category: 'QUALITY' },
    { id: 'dms_dl_30', label: 'DMS DL ≥ 30 Mbps', category: 'QUALITY' },
    { id: 'dms_ul_3', label: 'DMS UL ≥ 3 Mbps', category: 'QUALITY' },
    { id: 'p50_thr_dn_mbps', label: 'Débit DL Moyen (Mbps)', category: 'THROUGHPUT' },
    { id: 'p50_thr_up_mbps', label: 'Débit UL Moyen (Mbps)', category: 'THROUGHPUT' },
    { id: 'sessions', label: 'Nombre de Sessions', category: 'VOLUME' },
    { id: 'traffic_dn_bytes', label: 'Volume DL (bytes)', category: 'VOLUME' },
    { id: 'traffic_up_bytes', label: 'Volume UL (bytes)', category: 'VOLUME' },
    { id: 'p95_rtt_ms', label: 'RTT P95 (ms)', category: 'RTT' },
    { id: 'p75_rtt_ms', label: 'RTT P75 (ms)', category: 'RTT' },
    { id: 'p25_rtt_ms', label: 'RTT P25 (ms)', category: 'RTT' },
    { id: 'window_full_ratio', label: 'Window Full Ratio (%)', category: 'TCP' },
    { id: 'retransmission_rate', label: 'Taux Retransmission (%)', category: 'TCP' },
    { id: 'tcp_loss_rate', label: 'Taux Pertes TCP (%)', category: 'TCP' },
    { id: 'out_of_order_ratio', label: 'Out of Order Ratio (%)', category: 'TCP' },
  ];

  const getCellKpiValue = (cell: any): number => {
    return cell[mapKpi] ?? cell.qoe_score_avg ?? 0;
  };

  const getKpiColor = (value: number): string => {
    if (mapKpi === 'p50_thr_dn_mbps') {
      if (value >= 100) return '#22c55e';
      if (value >= 30) return '#f59e0b';
      return '#ef4444';
    }
    if (mapKpi === 'p50_thr_up_mbps') {
      if (value >= 20) return '#22c55e';
      if (value >= 5) return '#f59e0b';
      return '#ef4444';
    }
    if (mapKpi === 'sessions') {
      if (value >= 2000) return '#22c55e';
      if (value >= 500) return '#f59e0b';
      return '#ef4444';
    }
    if (value >= 80) return '#22c55e';
    if (value >= 60) return '#f59e0b';
    if (value >= 40) return '#f97316';
    return '#ef4444';
  };

  const selectedKpiLabel = MAP_KPIS.find(k => k.id === mapKpi)?.label || 'Score QoE Global';

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
      if (bp.get('constructeur')) base.vendor = bp.get('constructeur')!;
      if (bp.get('plaque')) base.plaque = bp.get('plaque')!;
      if (bp.get('zone_arcep')) base.zone_arcep = bp.get('zone_arcep')!;
      if (bp.get('techno')) base.techno = bp.get('techno')!;
      if (bp.get('bande')) base.bande = bp.get('bande')!;
    }
    return base;
  }, [localDor, localVendor, localPlaque, localZoneArcep, localTechno, localBande, localSearch, backendQueryStr]);

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
      // Always fetch site summaries only — cells are loaded on demand per site
      const { sites: newSites, total } = await fetchSitesByBbox(bbox, bboxFilters, controller.signal);

      if (controller.signal.aborted) return;

      setSites(newSites || []);
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

  // Debounced viewport change handler
  const handleViewportForFetch = useCallback((v: ViewportState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchForViewport(v.bounds, currentBboxFilters, v.zoom);
    }, 450);
  }, [fetchForViewport, currentBboxFilters]);

  // Dashboard-first loading: load site summaries only for the active dashboard context
  useEffect(() => {
    mountedRef.current = true;

    if (!dashboardActive) {
      if (abortRef.current) abortRef.current.abort();
      setSites([]);
      setBboxTotal(0);
      setBboxLoading(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadDashboardScopedSites = async () => {
      setLoading(true);
      setBboxLoading(true);

      try {
        const dashboardSearch = localSearch.trim() || undefined;
        const dashboardSites = await fetchDashboardSites(activeDashboardFilters, dashboardSearch);

        if (cancelled) return;

        setSites(dashboardSites || []);
        setBboxTotal((dashboardSites || []).length);
      } catch (err) {
        if (!cancelled) {
          console.warn('[SitesMonitor] dashboard site load failed', err);
          setSites([]);
          setBboxTotal(0);
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
  }, [dashboardActive, activeDashboardFilters, localSearch]);

  // Re-fetch when viewport changes (debounced via MapViewportTracker)
  const prevViewportRef = useRef<ViewportState>({ bounds: null, zoom: 6 });
  const handleViewportChange = useCallback((v: ViewportState) => {
    setViewport(v);
    // Cache map position
    if (v.bounds) {
      const c = v.bounds.getCenter?.();
      if (c) mapCache.setMapPosition([c.lat, c.lng], v.zoom);
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
  const cellLoadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const cells = await fetchSiteCells(selectedSiteId);
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

    const sectorNums = new Set(siteDetail.cells.map(c => getSectorNumber(c.cell_id)));
    if (sectorNums.size > 0) {
      const first = Math.min(...sectorNums);
      setExpandedSectors(new Set([first]));
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
        const { data, error } = await (supabase as any)
          .from('parameter_dump')
          .select('parameter, value')
          .eq('cell_name', cellName)
          .in('parameter', ['LNCEL.pMax', 'LNCEL_FDD.dlChBw', 'LNCEL_FDD.dlMimoMode', 'LNCEL_FDD.dlRsBoost']);
        if (error) throw error;
        let pmax: number | null = null, dlChBw: string | null = null, dlMimoMode: string | null = null, dlRsBoost: number | null = null;
        for (const row of (data || [])) {
          if (row.parameter === 'LNCEL.pMax') pmax = parseFloat(row.value);
          if (row.parameter === 'LNCEL_FDD.dlChBw') dlChBw = row.value;
          if (row.parameter === 'LNCEL_FDD.dlMimoMode') dlMimoMode = row.value;
          if (row.parameter === 'LNCEL_FDD.dlRsBoost') dlRsBoost = parseFloat(row.value);
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
    // Debug: log active QOE filters
    const qoeFilters = activeViewFilters.filter(f => f.mode === 'qoe' && f.kpi && f.operator && f.threshold != null);
    if (qoeFilters.length > 0) {
      console.log('[QOE Filter] Active filters:', JSON.stringify(qoeFilters));
      console.log('[QOE Filter] Total sites before filter:', sites.length);
    }
    const searchTerm = localSearch.toLowerCase();
    const filtered = sites.filter(s => {
      const siteName = String(s.site_name ?? '');
      const siteId = String(s.site_id ?? '');
      const siteCells = Array.isArray(s.cells) ? s.cells : [];
      const matchesSearch = siteName.toLowerCase().includes(searchTerm) || siteId.toLowerCase().includes(searchTerm);
      const matchesDor = filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesPlaque = filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesVendor = filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDep = filters.department === 'ALL' || s.department === filters.department;
      // When cells are empty (bbox-loaded), bypass RAT filter
      const matchesRat = filters.rat === 'ALL' || siteCells.length === 0 || siteCells.some(c => c.techno === filters.rat);
      const matchesLocalVendor = localVendor === 'ALL' || s.vendor === localVendor;
      const matchesLocalDor = localDor === 'ALL' || s.dor === localDor;
      const matchesLocalPlaque = localPlaque === 'ALL' || s.plaque === localPlaque;
      const matchesLocalBande = localBande === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => c.bande === localBande) : !(s as any).bande || (s as any).bande === localBande);
      const matchesLocalZoneArcep = localZoneArcep === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => (c as any).zone_arcep === localZoneArcep) : !(s as any).zone_arcep || (s as any).zone_arcep === localZoneArcep);
      const matchesLocalTechno = localTechno === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => c.techno === localTechno) : !(s as any).techno || (s as any).techno === localTechno);
      
      // Apply QOE view filters
      const matchesQoeFilters = activeViewFilters
        .filter(f => f.mode === 'qoe' && f.kpi && f.operator && f.threshold != null)
        .every(f => {
          // Try site-level value first, then compute average from cells
          let val = (s as any)[f.kpi!];
          if (val == null && s.cells.length > 0) {
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
      
      return matchesSearch && matchesDor && matchesPlaque && matchesVendor && matchesDep && matchesRat && matchesLocalVendor && matchesLocalDor && matchesLocalPlaque && matchesLocalBande && matchesLocalZoneArcep && matchesLocalTechno && matchesQoeFilters;
    });
    if (qoeFilters.length > 0) {
      console.log('[QOE Filter] Sites after filter:', filtered.length);
    }
    if (inventorySortOrder === 'none') return filtered;
    return [...filtered].sort((a, b) => {
      const va = (a as any)[mapKpi] ?? a.qoe_score_avg ?? 0;
      const vb = (b as any)[mapKpi] ?? b.qoe_score_avg ?? 0;
      return inventorySortOrder === 'asc' ? va - vb : vb - va;
    });
  }, [sites, localSearch, filters, localVendor, localDor, localPlaque, localBande, localZoneArcep, localTechno, inventorySortOrder, mapKpi, activeViewFilters]);

  // Check if a cell's band passes the band filter
  const isBandEnabled = useCallback((bande: string, techno?: string) => {
    const key = normalizeBandKey(bande, techno);
    // Unknown formats stay visible instead of disappearing
    if (!key) return true;
    return enabledBands.has(key);
  }, [enabledBands]);

  const toggleBand = useCallback((band: string) => {
    setEnabledBands(prev => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  const toggleAllBands = useCallback((group: 'NR' | 'LTE') => {
    const bands = group === 'NR' ? ['NR3500', 'NR700', 'NR2100'] : ['L2600', 'L2100', 'L1800', 'L800', 'L700'];
    setEnabledBands(prev => {
      const next = new Set(prev);
      const allOn = bands.every(b => next.has(b));
      bands.forEach(b => allOn ? next.delete(b) : next.add(b));
      return next;
    });
  }, []);

  // Sites filtered by techno (for map rendering only)
  const mapFilteredSites = useMemo(() => {
    if (mapTechnoFilter === 'OFF') return [];
    if (mapTechnoFilter === 'ALL') {
      if (enabledTechnos.size === 0) return [];
      if (enabledTechnos.size === 2) return filteredSites;
      // When cells are empty (bbox-loaded), keep the site visible
      return filteredSites.filter(s => s.cells.length === 0 || s.cells.some(c => {
        const tech = (c.techno || '').toUpperCase().includes('5G') ? '5G' : '4G';
        return enabledTechnos.has(tech);
      }));
    }
    return filteredSites.filter(s => s.cells.length === 0 || s.cells.some(c => c.techno === mapTechnoFilter));
  }, [filteredSites, mapTechnoFilter, enabledTechnos]);

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
    sites.forEach(s => s.cells.forEach(c => { if (c.bande) bandes.add(c.bande); }));
    return ['ALL', ...Array.from(bandes).sort()];
  }, [sites]);

  // Sites visible in current viewport (for map rendering) — with cap to prevent hangs
  const MAX_RENDER_SITES = 5000;

  const visibleSites = useMemo(() => {
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
    // If still too many, sample evenly to keep the map responsive
    if (candidates.length > MAX_RENDER_SITES) {
      const step = Math.ceil(candidates.length / MAX_RENDER_SITES);
      const sampled: typeof candidates = [];
      for (let i = 0; i < candidates.length; i += step) {
        sampled.push(candidates[i]);
      }
      return sampled;
    }
    return candidates;
  }, [mapFilteredSites, viewport.bounds]);

  // Auto-load cells for visible sites via a single bulk bbox call (avoids per-site 503s)
  useEffect(() => {
    if (displayMode !== 'cells' || !dashboardActive) return;
    if (!viewport.bounds) return;

    const sitesNeedingCells = visibleSites.filter(
      s => s.cells.length === 0 && !cellLoadingRef.current.has(s.site_id)
    );

    if (sitesNeedingCells.length === 0) return;

    if (cellLoadDebounceRef.current) clearTimeout(cellLoadDebounceRef.current);
    cellLoadDebounceRef.current = setTimeout(async () => {
      // Mark all as loading
      sitesNeedingCells.forEach(s => cellLoadingRef.current.add(s.site_id));

      try {
        const bounds = viewport.bounds!;
        const bboxQuery: BboxQuery = {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        };
        // Single bulk call for all cells in current viewport
        const cellSites = await fetchCellsByBbox(bboxQuery);

        // Build a lookup by site_id
        const cellMap = new Map<string, any[]>();
        for (const cs of cellSites) {
          if (cs.cells && cs.cells.length > 0) {
            cellMap.set(cs.site_id, cs.cells);
          }
        }

        // Clear loading flags
        sitesNeedingCells.forEach(s => cellLoadingRef.current.delete(s.site_id));

        if (cellMap.size > 0) {
          setSites(prev => prev.map(s => {
            const cells = cellMap.get(s.site_id);
            return cells && cells.length > 0 ? { ...s, cells, cell_count: cells.length } : s;
          }));
        }
      } catch (err) {
        console.warn('[SitesMonitor] Bulk cell load failed', err);
        sitesNeedingCells.forEach(s => cellLoadingRef.current.delete(s.site_id));
      }
    }, 400);

    return () => {
      if (cellLoadDebounceRef.current) clearTimeout(cellLoadDebounceRef.current);
    };
  }, [displayMode, visibleSites, dashboardActive, viewport.bounds]);


  const renderSites = useMemo(() => {
    if (!selectedSiteId || !selectedSiteSnapshot) return visibleSites;
    if (visibleSites.some(site => site.site_id === selectedSiteId)) return visibleSites;
    if (viewport.bounds && !viewport.bounds.contains(L.latLng(selectedSiteSnapshot.coordinates[0], selectedSiteSnapshot.coordinates[1]))) {
      return visibleSites;
    }
    return [selectedSiteSnapshot, ...visibleSites];
  }, [visibleSites, selectedSiteId, selectedSiteSnapshot, viewport.bounds]);

  const showSectors = displayMode === 'cells' && mapDisplayMode === 'sites' && !isFlying && showBeamSectors;
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
    if (v.zoom >= 8 && !clusteringUnlocked) {
      setClusteringUnlocked(true);
    }
    // Show loading when zooming changes visible sites — but NOT during fly animation
    if (v.zoom !== prevZoom && mapFilteredSites.length > 500 && !isFlyingRef.current) {
      setMapRendering(true);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = setTimeout(() => setMapRendering(false), 600);
    }
  }, [handleViewportChange, viewport.zoom, mapFilteredSites.length, clusteringUnlocked]);

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
      beamVisibility,
    };
  }, [viewport, mapLayer, mapKpi, mapTechnoFilter, enabledBands, sectorColorMode, mapDisplayMode, showBandPanel, showLegend, showRightPanel, panelCollapsed, localVendor, localDor, localPlaque, localBande, localZoneArcep, localTechno, beamVisibility]);

  const handleLoadView = useCallback((settings: MapViewSettings) => {
    setMapLayer(settings.mapLayer);
    setMapKpi(settings.mapKpi);
    setMapTechnoFilter(settings.mapTechnoFilter as any);
    setEnabledBands(new Set(settings.enabledBands));
    setSectorColorMode(settings.sectorColorMode);
    setMapDisplayMode(settings.mapDisplayMode);
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
    // Fly to saved center/zoom
    if (settings.center && settings.center[0] > 41 && settings.center[0] < 52 && settings.center[1] > -6 && settings.center[1] < 11) setFlyTarget(settings.center);
    if ((settings as any).beamVisibility != null) {
      setBeamVisibility((settings as any).beamVisibility);
      localStorage.setItem('qoebit_beam_visibility', String((settings as any).beamVisibility));
    }
  }, []);

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

  const handleSiteClick = (site: SiteSummary) => {
    // Toggle: clicking the already-selected site deselects it
    if (selectedSiteId === site.site_id) {
      handleBackToGlobal();
      return;
    }
    setSelectedSiteSnapshot(site);
    setFlyTarget(site.coordinates);
    setSelectedSiteId(site.site_id);
    setFocusMode('site');
    setFocusCellId(null);
    // Auto-expand only the first sector by default
    const sectorNums = Array.from(new Set(site.cells.map(c => getSectorNumber(c.cell_id)))).sort((a, b) => a - b);
    setExpandedSectors(new Set(sectorNums.length > 0 ? [sectorNums[0]] : []));
    setShowRightPanel(true);
    // Ensure inventory panel is open and on sites tab before scrolling
    setPanelCollapsed(false);
    setInventoryTab('sites');
    // Scroll inventory to selected site with delay for DOM update
    setTimeout(() => {
      const el = siteRowRefs.current.get(site.site_id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  };

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

  // Loading overlay rendered inside the map area
  const loadingOverlay = (loading || mapRendering) ? (
    <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none animate-fade-in">
      <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-card/90 backdrop-blur-md border border-border shadow-2xl">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">
          {loading ? 'Chargement des sites…' : `Rendu de ${visibleSites.length.toLocaleString()} sites…`}
        </p>
      </div>
    </div>
  ) : null;

  // Detail loading is now handled inline — no full-screen takeover

  // No early return for siteDetail — rendered as right panel inside the main view

  // Main view — full screen map with clustering
  return (
    <div className="absolute inset-0 bg-background overflow-hidden">
      {loadingOverlay}
      {/* Empty state — no dashboard, modal closed */}
      {/* Empty overlay removed — message now in sidebar */}
      {/* Bbox loading indicator */}
      {bboxLoading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1001] px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-lg flex items-center gap-2">
          <RefreshCw size={12} className="text-primary animate-spin" />
          <span className="text-[10px] font-semibold text-muted-foreground">Chargement {bboxTotal > 0 ? `(${bboxTotal} sites)` : ''}...</span>
        </div>
      )}
      {/* FULL SCREEN MAP */}
      <MapContainer
        center={initialCenter || FRANCE_CENTER}
        zoom={FRANCE_DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
        zoomSnap={1}
        zoomDelta={1}
        closePopupOnClick={true}
      >
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
        <FlyToSite coords={flyTarget} onFlyStart={() => { setIsFlying(true); isFlyingRef.current = true; }} onFlyEnd={() => { setIsFlying(false); isFlyingRef.current = false; }} onDone={() => setFlyTarget(null)} />
        <TechPanes />
        <MapViewportTracker onViewportChange={handleViewportChangeLegacy} />
        <LOSMapClickHandler onMapClick={handleLosMapClick} drawing={losDrawingMode} />



        {/* ── Parameter overlay markers ── */}
        {paramMode && !paramLoading && paramPoints.length > 0 && (
          <FitHighlightBounds coords={paramPoints.map(p => [p.latitude, p.longitude] as [number, number])} />
        )}
        {paramMode && !paramLoading && paramPoints.map(pt => (
          <CircleMarker
            key={pt.id}
            center={[pt.latitude, pt.longitude]}
            radius={6}
            pathOptions={{
              fillColor: paramValueColor(pt.value),
              fillOpacity: 0.85,
              color: 'hsl(var(--border))',
              weight: 0.5,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[180px]">
                <div className="font-bold text-sm">{pt.cell_name || pt.site_name || `#${pt.id}`}</div>
                <div className="flex justify-between"><span className="opacity-60">Paramètre</span><span className="font-semibold">{pt.parameter}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Valeur</span><span className="font-semibold" style={{ color: paramValueColor(pt.value) }}>{pt.value ?? '—'}</span></div>
                {pt.bande && <div className="flex justify-between"><span className="opacity-60">Bande</span><span>{pt.bande}</span></div>}
                {pt.vendor && <div className="flex justify-between"><span className="opacity-60">Vendor</span><span>{pt.vendor}</span></div>}
                {pt.dn && <div className="flex justify-between"><span className="opacity-60">MO</span><span className="truncate max-w-[120px]">{pt.dn}</span></div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Heatmap layer */}
        {sectorColorMode !== 'topo' && !paramMode && mapDisplayMode === 'heatmap' && (
          <HeatmapLayer points={heatmapPoints} radius={35} blur={25} minOpacity={0.3} />
        )}

        {/* Points mode — individual cell markers */}
        {!paramMode && mapDisplayMode === 'points' && renderSites.map(site => {
          const showCellLabels = viewport.zoom >= 13;
          const cellsToRender = (mapTechnoFilter === 'ALL' ? site.cells.filter(c => {
              const tech = (c.techno || '').toUpperCase().includes('5G') ? '5G' : '4G';
              return enabledTechnos.has(tech);
            })
            : site.cells.filter(c => c.techno === mapTechnoFilter)).filter(c => isBandEnabled(c.bande, c.techno));
          return (
            <React.Fragment key={site.site_id}>
              {cellsToRender.map((cell, idx) => {
                const val = getCellKpiValue(cell);
                const color = sectorColorMode === 'topo' ? getBandColor(cell.bande, cell.techno) : getKpiColor(val);
                const isHovered = hoveredSiteId === site.site_id;
                const offsetDist = 0.0003;
                const rad = ((cell.azimut || idx * 120) - 90) * (Math.PI / 180);
                const cellLat = site.coordinates[0] + offsetDist * Math.cos(rad);
                const cellLng = site.coordinates[1] + offsetDist * Math.sin(rad);
                const cellIs5G = (cell.techno || '').toUpperCase().includes('5G');
                return (
                  <CircleMarker
                    key={cell.cell_id}
                    center={[cellLat, cellLng]}
                    radius={isHovered ? 9 : showCellLabels ? 7 : 5}
                    pane={cellIs5G ? 'pane5G' : 'pane4G'}
                    pathOptions={{
                      color: isHovered ? '#fff' : 'transparent',
                      fillColor: color,
                      fillOpacity: 0.9,
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
        {!paramMode && mapDisplayMode === 'sites' && !showSectors && renderSites.map(site => {
          const kpiColor = site.cells.length > 0 ? getKpiColor(getCellKpiValue(site.cells[0])) : getKpiColor(site.qoe_score_avg ?? 0);
          const { has4G, has5G } = inferSiteTechState(site);
          const topoColor = has5G ? (bandColors['5G_GROUP'] || '#a855f7') : has4G ? (bandColors['4G_GROUP'] || '#f97316') : FADED_COLOR;
          const color = (sectorColorMode as string) === 'topo' ? topoColor : kpiColor;
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          const showMiniSectors = showBeamSectors && viewport.zoom >= 9 && site.cells.length > 0 && !isIndoor;

          if (isIndoor) {
            const iconSize = viewport.zoom >= 10 ? 20 : 14;
            return (
              <React.Fragment key={site.site_id}>
                <Marker
                  position={site.coordinates}
                  icon={L.divIcon({
                    className: '',
                    iconSize: [iconSize, iconSize],
                    iconAnchor: [iconSize / 2, iconSize / 2],
                    html: `<div style="width:${iconSize}px;height:${iconSize}px;border-radius:50%;background:${color};border:2px solid ${isSelectedSite || isHovered ? '#fff' : '#555'};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.3);"><span style="color:#fff;font-weight:900;font-size:${iconSize * 0.55}px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);">I</span></div>`,
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
                      <div className="text-xs text-muted-foreground mt-1">{site.site_id} • Indoor</div>
                    </div>
                  </Popup>
                </Marker>
                {showSiteLabels && viewport.zoom >= 10 && (
                  <Marker position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
                    <Tooltip direction="bottom" offset={[0, 8]} permanent className="site-name-label-clean">
                      <span style={{ fontSize: viewport.zoom >= 12 ? '9px' : '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{site.site_name}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          if (showMiniSectors) {
            const miniRadius = getZoomAwareRadius(site.coordinates[0], viewport.zoom) * 0.7;
            const miniOpacity = Math.min(0.65, 0.25 + (viewport.zoom - 9) * 0.1);
             const azimuths = getValidSectorAzimuths(site);
             if (azimuths.length === 0) return null;
            return (
              <React.Fragment key={site.site_id}>
                {azimuths.map(az => {
                  const sectorCoords = getSectorCoords(site.coordinates, az, miniRadius, 60);
                  return (
                    <Polygon
                      key={`${site.site_id}_mini_${az}`}
                      positions={sectorCoords}
                      pane={has5G ? 'pane5G' : 'pane4G'}
                      pathOptions={{
                        color: isHovered ? '#fff' : deriveStrokeColor(color),
                        fillColor: color,
                        fillOpacity: isHovered ? 0.5 : miniOpacity,
                        weight: isHovered ? 1.5 : 0.8,
                        opacity: isHovered ? 1 : 0.65,
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
                {showSiteLabels && (
                  <Marker position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
                    <Tooltip direction="bottom" offset={[0, 4]} permanent className="site-name-label-clean">
                      <span style={{ fontSize: viewport.zoom >= 12 ? '9px' : '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{site.site_name}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          const radius = viewport.zoom >= 10 ? (isHovered ? 7 : (isSelectedSite ? 7 : 5)) : (isHovered ? 5 : 3);
          return (
            <React.Fragment key={site.site_id}>
              <CircleMarker
                center={site.coordinates}
                radius={radius}
                pane={has5G ? 'pane5G' : 'pane4G'}
                pathOptions={{
                  color: isSelectedSite ? '#fff' : (isHovered ? '#fff' : 'hsl(var(--border))'),
                  fillColor: color,
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
                    <div className="text-xs text-muted-foreground mt-1">{site.site_id} • {site.vendor}</div>
                  </div>
                </Popup>
              </CircleMarker>
              {showSiteLabels && viewport.zoom >= 10 && (
                <Marker position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
                  <Tooltip direction="bottom" offset={[0, 6]} permanent className="site-name-label-clean">
                    <span style={{ fontSize: '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{site.site_name}</span>
                  </Tooltip>
                </Marker>
              )}
            </React.Fragment>
          );
        })}

        {/* Detailed sectors (only when zoomed in, sites mode) — professional low-opacity with strokes */}
        {!paramMode && showSectors && renderSites.map(site => {
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const zoomRadius = getZoomAwareRadius(site.coordinates[0], viewport.zoom) * (0.5 + 0.5 * (beamVisibility / 100));
          const baseOverlap = visibleSites.length > 200 ? 0.18 : visibleSites.length > 80 ? 0.25 : 0.35;
          const beamScale = beamVisibility / 100;
          const overlapFactor = baseOverlap + (1 - baseOverlap) * beamScale;
          const isFocusFaded = false;

          /* ── Indoor sites: circle with "I" instead of sectors (rendered at all zooms including sector zoom) ── */
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          if (isIndoor) {
            const { has4G, has5G } = inferSiteTechState(site);
            const topoColor = has5G ? (bandColors['5G_GROUP'] || '#a855f7') : has4G ? (bandColors['4G_GROUP'] || '#f97316') : FADED_COLOR;
            const kpiColor = site.cells.length > 0 ? getKpiColor(getCellKpiValue(site.cells[0])) : getKpiColor(site.qoe_score_avg ?? 0);
            const color = (sectorColorMode as string) === 'topo' ? topoColor : kpiColor;
            const iconSize = Math.min(32, Math.max(18, (viewport.zoom - 12) * 6 + 18));
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
          if (!site.cells || site.cells.length === 0) {
            const fallbackColor = getKpiColor(site.qoe_score_avg ?? 0);
            const radius = isHovered || isSelectedSite ? 7 : 5;
            const fallbackHas5G = site.cells?.some(c => (c.techno || '').toUpperCase().includes('5G')) || false;
            return (
              <CircleMarker
                key={site.site_id}
                center={site.coordinates}
                radius={radius}
                pane={fallbackHas5G ? 'pane5G' : 'pane4G'}
                fillColor={fallbackColor}
                fillOpacity={0.85}
                weight={isSelectedSite ? 3 : 1.5}
                color={isSelectedSite ? '#fff' : '#222'}
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

          /* ── ALL mode: technology-only (no bands), fixed radii ── */
          if (mapTechnoFilter === 'ALL') {
            // Step 1: Group cells by technology, collect unique azimuths
            const techAzimuths = new Map<string, Set<number>>();
            for (const cell of site.cells) {
              const tech = (cell.techno || '').toUpperCase().includes('5G') ? '5G' : '4G';
              const az = Number(cell.azimut);
              if (!Number.isFinite(az) || az < 0 || az > 360) continue;
              if (!techAzimuths.has(tech)) techAzimuths.set(tech, new Set());
              techAzimuths.get(tech)!.add(az);
            }
            const has4G = techAzimuths.has('4G');
            const has5G = techAzimuths.has('5G');

            // Step 2: Fixed radii (zoom-adaptive base, but constant ratio)
            const R_4G = zoomRadius * 1.2; // slightly larger than default
            const R_5G = R_4G * 0.6;       // 60% of 4G

            // Step 3: Merge all azimuths across techs for unified sectors
            const allAzimuths = new Set<number>();
            if (has4G) techAzimuths.get('4G')!.forEach(a => allAzimuths.add(a));
            if (has5G) techAzimuths.get('5G')!.forEach(a => allAzimuths.add(a));

            // Step 4: Build render list — 4G first (below), 5G second (above)
            const renderItems: { tech: string; az: number; radius: number }[] = [];
            if (has4G && enabledTechnos.has('4G')) {
              allAzimuths.forEach(az => {
                if (techAzimuths.get('4G')!.has(az)) {
                  renderItems.push({ tech: '4G', az, radius: R_4G });
                }
              });
            }
            if (has5G && enabledTechnos.has('5G')) {
              allAzimuths.forEach(az => {
                if (techAzimuths.get('5G')!.has(az)) {
                  renderItems.push({ tech: '5G', az, radius: R_5G });
                }
              });
            }

            return (
              <React.Fragment key={site.site_id}>
                {renderItems.map(({ tech, az, radius }) => {
                  const groupColorKey = tech === '5G' ? '5G_GROUP' : '4G_GROUP';
                  // In topo mode: use 5G/4G group colors; in kpi mode: use KPI-based color from representative cell
                  const topoColor = bandColors[groupColorKey] || (tech === '5G' ? '#a855f7' : '#f97316');
                  let kpiColor = topoColor;
                  if (sectorColorMode === 'kpi') {
                    const repCell = site.cells.find(c => {
                      const t = (c.techno || '').toUpperCase().includes('5G') ? '5G' : '4G';
                      return t === tech;
                    });
                    if (repCell) kpiColor = getKpiColor(getCellKpiValue(repCell));
                  }
                  const fillColor = isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? topoColor : kpiColor);
                  const strokeColor = isFocusFaded ? '#cbd5e1' : deriveStrokeColor(fillColor);
                  const sectorCoords = getSectorCoords(site.coordinates, az, radius, 60);
                  return (
                    <Polygon
                      key={`${site.site_id}_${tech}_${az}`}
                      positions={sectorCoords}
                      pane={tech === '5G' ? 'pane5G' : 'pane4G'}
                      pathOptions={{
                        color: isHovered ? '#fff' : strokeColor,
                        fillColor,
                        fillOpacity: isHovered ? 0.45 : (isFocusFaded ? 0.08 : overlapFactor),
                        weight: isHovered ? 2 : 1.2,
                        opacity: isHovered ? 1 : (isFocusFaded ? 0.25 : 0.8),
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
                            <div className="flex justify-between"><span className="opacity-50">has4G</span><span className="font-bold">{has4G ? '✓' : '✗'}</span></div>
                            <div className="flex justify-between"><span className="opacity-50">has5G</span><span className="font-bold">{has5G ? '✓' : '✗'}</span></div>
                            <div className="flex justify-between"><span className="opacity-50">R4G</span><span className="font-mono font-bold">{Math.round(R_4G)}m</span></div>
                            <div className="flex justify-between"><span className="opacity-50">R5G</span><span className="font-mono font-bold">{Math.round(R_5G)}m</span></div>
                            <div className="flex justify-between"><span className="opacity-50">Azimut</span><span className="font-bold">{az}°</span></div>
                          </div>
                        </div>
                      </Tooltip>
                    </Polygon>
                  );
                })}
                {/* Site name label */}
                {showSiteLabels && (
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
                      }}>{site.site_name}</span>
                    </Tooltip>
                  </Marker>
                )}
              </React.Fragment>
            );
          }

          /* ── 5G / 4G mode: detailed per-band sectors ── */
          return (
            <React.Fragment key={site.site_id}>
              {site.cells.filter(c => isBandEnabled(c.bande, c.techno))
                .sort((a, b) => {
                  // 4G first (below), 5G last (above)
                  const a5 = (a.techno || '').toUpperCase().includes('5G') ? 1 : 0;
                  const b5 = (b.techno || '').toUpperCase().includes('5G') ? 1 : 0;
                  return a5 - b5;
                })
                .map(cell => {
                const is5G = (cell.techno || '').toUpperCase().includes('5G');
                const cellRadius = is5G ? zoomRadius * 0.6 : zoomRadius;
                const az = Number(cell.azimut);
                if (!Number.isFinite(az) || az < 0 || az > 360) return null;
                const sectorCoords = getSectorCoords(site.coordinates, az, cellRadius, 60);
                const isFaded = (mapTechnoFilter === '5G' && !is5G) || (mapTechnoFilter === '4G' && is5G);
                const fillColor = isFaded || isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? getBandColor(cell.bande, cell.techno) : getKpiColor(getCellKpiValue(cell)));
                const strokeColor = isFaded || isFocusFaded ? '#cbd5e1' : ((sectorColorMode as string) === 'topo' ? getBandStrokeColor(cell.bande, cell.techno) : fillColor);
                const isFocusCell = focusCellId === cell.cell_id;
                const isCellDimmed = focusMode === 'cell' && isSelectedSite && !isFocusCell;
                const baseOpacity = isFocusFaded ? 0.08 : (isFaded ? 0.08 : (isCellDimmed ? 0.15 : overlapFactor));
                const strokeWeight = isFocusCell ? 2 : (isHovered ? 1.5 : 1);
                return (
                  <Polygon
                    key={cell.cell_id}
                    pane={is5G ? 'pane5G' : 'pane4G'}
                    positions={sectorCoords}
                    pathOptions={{
                      color: isFocusCell ? '#fff' : (isHovered ? '#fff' : strokeColor),
                      fillColor: fillColor,
                      fillOpacity: isFocusCell ? 0.45 : (isHovered ? 0.40 : baseOpacity),
                      weight: strokeWeight,
                      opacity: isFocusCell ? 1 : (isHovered ? 0.9 : (isFocusFaded ? 0.25 : (isFaded ? 0.3 : 0.7))),
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
                    <Tooltip direction="top" offset={[0, -8]} permanent={false} className="sector-tooltip">
                      <div className="px-3 py-2 min-w-[150px]">
                        <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: fillColor }}>{site.site_name}</div>
                        <div className="text-[9px] opacity-60 font-mono mt-0.5">{site.site_id}</div>
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
                {showSiteLabels && (
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
                    }}>{site.site_name}</span>
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
        {/* Coverage simulation overlay */}
        <CoverageCanvasOverlay grid={coverageGrid} opacity={0.55} visible={!!coverageGrid} />

        {/* Tilt visualization overlay for selected site */}
        {showTiltOverlay && selectedSiteId && (() => {
          const selectedSite = sites.find(s => s.site_id === selectedSiteId);
          return selectedSite ? <TiltOverlay site={selectedSite} visible={true} /> : null;
        })()}
      </MapContainer>

      {/* Coverage simulation overlay kept in right panel only */}

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

      {/* Floating LOS Analysis Panel — Glassmorphism */}
      {showLosPanel && losAnalysis && !losLoading && (
        <div
          className="absolute bottom-4 left-4 right-4 z-[1001] overflow-hidden pointer-events-auto max-h-[48%] flex flex-col animate-fade-in"
          style={{
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
            <div className="flex-1 h-[260px] min-w-0">
              <ProfileChart
                profilePoints={losProfilePoints}
                analysis={losAnalysis}
                fresnel={losFresnel}
                showFresnel={losEnableFresnel}
                showCurvature={losEnableCurvature}
                clutterHeight={losEnableClutter ? losClutterHeight : 0}
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
          {paramUniqueValues.length > 0 && paramUniqueValues.length <= 25 && (
            <div className="absolute bottom-16 z-[1000] pointer-events-auto bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-xl p-3.5 max-h-[240px] overflow-y-auto transition-all duration-300" style={{ left: (panelCollapsed ? 56 : 400) + 16 }}>
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">{paramConfirmed} — {paramPoints.length} pts</div>
              <div className="space-y-0.5">
                {paramUniqueValues.map(v => (
                  <div key={v} className="flex items-center gap-2 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: paramValueColor(v === '(vide)' ? null : v) }} />
                    <span className="truncate max-w-[140px]">{v}</span>
                  </div>
                ))}
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

      {/* Floating info badge — site count + zoom level */}
      <div className="absolute bottom-6 z-[1000] pointer-events-none transition-all duration-300" style={{ left: `calc(${panelCollapsed ? 56 : 400}px + (100vw - ${(panelCollapsed ? 56 : 400) + (showRightPanel && !detailFullscreen ? 450 : 0)}px) / 2)`, transform: 'translateX(-50%)' }}>
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg px-5 py-2.5 flex items-center gap-4">
          {paramMode ? (
            <>
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                ⬡ Param: {paramConfirmed}
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {paramPoints.length} points
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {filteredSites.length} sites
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                Zoom {viewport.zoom}
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: showSectors ? '#10b981' : 'hsl(var(--primary))' }}>
                {showSectors ? `${visibleSites.length} visible • Sectors` : 'Clusters'}
              </span>
              <span className="w-px h-4 bg-border" />
              {/* Toggle: site names */}
              <button
                onClick={() => setShowSiteLabels(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border ${
                  showSiteLabels
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                }`}
              >
                {showSiteLabels ? '☑' : '☐'} Noms
              </button>
              {/* Toggle: beams */}
              <button
                onClick={() => setShowBeamSectors(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border ${
                  showBeamSectors
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                }`}
              >
                {showBeamSectors ? '☑' : '☐'} Beams
              </button>
            </>
          )}
        </div>
      </div>


      {/* Floating top bar — single row with scroll, dynamically positioned between sidebars */}
      <div
        className="absolute z-[1000] pointer-events-auto transition-all duration-300"
        style={{
          top: 12,
          left: `calc(${panelCollapsed ? 56 : 400}px + (100vw - ${(panelCollapsed ? 56 : 400) + (showRightPanel && !detailFullscreen ? 450 : 0)}px) / 2)`,
          transform: 'translateX(-50%)',
          maxWidth: `min(1060px, calc(100vw - ${(panelCollapsed ? 56 : 400) + (showRightPanel && !detailFullscreen ? 450 : 0) + 32}px))`,
          width: '100%',
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
            style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap', scrollbarWidth: 'none' }}
          >
            {/* ── Unified mode selector: QoE / Topo / Parameters ── */}
            <div className="flex items-center bg-muted/80 rounded-xl overflow-hidden border border-border/50 shrink-0">
              <button
                onClick={() => { setSectorColorMode('kpi'); setParamPanelOpen(false); if (paramMode) handleParamReset(); }}
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-l-xl ${
                  sectorColorMode === 'kpi' && !paramMode && !paramPanelOpen
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Zap size={11} />
                QoE
              </button>
              <button
                onClick={() => { setSectorColorMode('topo'); setTopoResetCounter(c => c + 1); setParamPanelOpen(false); if (paramMode) handleParamReset(); setShowRightPanel(true); setFocusMode('global'); setSelectedSiteId(null); setSelectedSiteSnapshot(null); }}
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                  sectorColorMode === 'topo' && !paramMode && !paramPanelOpen
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Radio size={11} />
                Topo
              </button>
              <button
                onClick={() => { setParamPanelOpen(!paramPanelOpen); }}
                className={`px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-r-xl ${
                  paramMode || paramPanelOpen
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MapPin size={11} />
                Param
                {paramConfirmed && <span className="text-[8px] opacity-70">({paramPoints.length})</span>}
              </button>
            </div>

            <span className="w-px h-7 bg-border/50 shrink-0" />

            {/* ── QoE mode: KPI chips ── */}
            {sectorColorMode === 'kpi' && !paramMode && (
              <>
                {/* DL group */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mr-1 hidden xl:block">⬇ DL</span>
                  {MAP_KPIS.filter(k => ['qoe_score_avg', 'dms_dl_3', 'dms_dl_8', 'dms_dl_30', 'p50_thr_dn_mbps'].includes(k.id)).map(kpi => {
                    const shortLabels: Record<string, string> = {
                      'qoe_score_avg': 'QoE',
                      'dms_dl_3': '≥3',
                      'dms_dl_8': '≥8',
                      'dms_dl_30': '≥30',
                      'p50_thr_dn_mbps': 'Débit',
                    };
                    return (
                      <button
                        key={kpi.id}
                        onClick={() => { setMapKpi(kpi.id); setSectorColorMode('kpi'); }}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                          mapKpi === kpi.id
                            ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        }`}
                        title={kpi.label}
                      >
                        {shortLabels[kpi.id] || kpi.label}
                      </button>
                    );
                  })}
                </div>

                <span className="w-px h-7 bg-border/50 shrink-0" />

                {/* UL group */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mr-1 hidden xl:block">⬆ UL</span>
                  {MAP_KPIS.filter(k => ['dms_ul_3', 'p50_thr_up_mbps'].includes(k.id)).map(kpi => {
                    const shortLabels: Record<string, string> = {
                      'dms_ul_3': '≥3',
                      'p50_thr_up_mbps': 'Débit',
                    };
                    return (
                      <button
                        key={kpi.id}
                        onClick={() => { setMapKpi(kpi.id); setSectorColorMode('kpi'); }}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                          mapKpi === kpi.id
                            ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        }`}
                        title={kpi.label}
                      >
                        {shortLabels[kpi.id] || kpi.label}
                      </button>
                    );
                  })}
                </div>

                <span className="w-px h-7 bg-border/50 shrink-0" />

                {/* Plus dropdown for TCP/RTT/Volume */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowKpiDropdown(!showKpiDropdown)}
                    className={`px-3.5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 border ${
                      ['sessions', 'traffic_dn_bytes', 'traffic_up_bytes', 'p95_rtt_ms', 'p75_rtt_ms', 'p25_rtt_ms', 'window_full_ratio', 'retransmission_rate', 'tcp_loss_rate', 'out_of_order_ratio'].includes(mapKpi)
                        ? 'bg-primary text-primary-foreground border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 border-transparent'
                    }`}
                  >
                    <SlidersHorizontal size={12} />
                    Plus
                    {showKpiDropdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>
                  {showKpiDropdown && (
                    <div className="absolute top-10 right-0 w-[300px] bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden z-[1100]">
                      <div className="max-h-[400px] overflow-y-auto py-1">
                        {['RTT', 'TCP', 'VOLUME'].map(cat => (
                          <div key={cat}>
                            <div className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-b border-border/30">{cat}</div>
                            {MAP_KPIS.filter(k => k.category === cat).map(kpi => (
                              <button
                                key={kpi.id}
                                onClick={() => { setMapKpi(kpi.id); setSectorColorMode('kpi'); setShowKpiDropdown(false); }}
                                className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all ${
                                  mapKpi === kpi.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                                }`}
                              >
                                <div className="text-[11px] font-bold">{kpi.label}</div>
                                {mapKpi === kpi.id && <span className="text-xs">✓</span>}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Topo mode: inline tech filter + layer switcher + label ── */}
            {sectorColorMode === 'topo' && !paramMode && (
              <>
                {/* Tech filter: ALL / 5G / 4G / OFF */}
                <div className="flex items-center bg-muted/60 rounded-lg overflow-hidden border border-border/40 shrink-0">
                  {(['ALL', '5G', '4G', 'OFF'] as const).map((tech) => (
                    <button
                      key={tech}
                      onClick={() => {
                        setMapTechnoFilter(tech);
                        const NR_BANDS = ['NR3500', 'NR700', 'NR2100'];
                        const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700'];
                        if (tech === 'ALL') {
                          setEnabledBands(new Set([...NR_BANDS, ...LTE_BANDS]));
                        } else if (tech === '5G') {
                          setEnabledBands(new Set(NR_BANDS));
                        } else if (tech === '4G') {
                          setEnabledBands(new Set(LTE_BANDS));
                        } else {
                          setEnabledBands(new Set());
                        }
                      }}
                      className={`px-3 py-2 text-[10px] font-black tracking-wider transition-all ${
                        mapTechnoFilter === tech
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {tech}
                    </button>
                  ))}
                </div>

                <span className="w-px h-7 bg-border/50 shrink-0" />

                {/* Layer switcher: L / D / S */}
                <div className="flex items-center bg-muted/60 rounded-lg overflow-hidden border border-border/40 shrink-0">
                  {([
                    { key: 'light' as const, label: 'L' },
                    { key: 'dark' as const, label: 'D' },
                    { key: 'satellite' as const, label: 'S' },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setMapLayer(key)}
                      className={`px-3 py-2 text-[10px] font-black tracking-wider transition-all ${
                        mapLayer === key
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <span className="w-px h-7 bg-border/50 shrink-0" />

                <span className="text-[10px] font-bold text-muted-foreground shrink-0">Couleur par bande de fréquence</span>

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
              </>
            )}

            {/* ── Parameters mode: current selection ── */}
            {paramMode && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold text-foreground">{paramConfirmed}</span>
                <span className="text-[9px] text-muted-foreground">({paramPoints.length} pts)</span>
                <button
                  onClick={handleParamReset}
                  className="text-[9px] font-bold text-destructive hover:text-destructive/80 transition-colors"
                >
                  ✕ Reset
                </button>
              </div>
            )}
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

          {/* Fixed right zone — Views */}
          <div className="shrink-0 flex items-center gap-2 px-3 border-l border-border/40">
            <MapViewManager
              currentSettings={getCurrentMapSettings()}
              onLoadView={handleLoadView}
            />
          </div>
        </div>
      </div>

      {/* Parameters panel — rendered outside overflow container */}
      {paramPanelOpen && (
        <div className="absolute top-[80px] z-[1100] pointer-events-auto w-[320px] transition-all duration-300" style={{ right: (showRightPanel && !detailFullscreen ? 450 : 0) + 16 }}>
          <div className="bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-border">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Sélectionner un paramètre</div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={paramSearch}
                  onChange={e => setParamSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {paramAvailableLoading ? (
                <div className="flex items-center justify-center py-6"><RefreshCw className="w-4 h-4 animate-spin text-primary" /></div>
              ) : paramFilteredList.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Aucun paramètre</div>
              ) : paramFilteredList.map(p => (
                <button
                  key={p}
                  onClick={() => setParamSelected(p)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors ${
                    paramSelected === p ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    paramSelected === p ? 'border-primary bg-primary' : 'border-input'
                  }`}>
                    {paramSelected === p && <Check size={8} className="text-primary-foreground" />}
                  </div>
                  <span className="truncate">{p}</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-border flex items-center gap-2">
              {paramSelected && paramSelected !== paramConfirmed && (
                <span className="text-[9px] text-amber-500 font-bold uppercase mr-auto">Non appliqué</span>
              )}
              {!paramSelected && !paramConfirmed && (
                <span className="text-[9px] text-muted-foreground mr-auto">Choisir un paramètre</span>
              )}
              {paramConfirmed && paramSelected === paramConfirmed && (
                <span className="text-[9px] text-primary font-bold mr-auto truncate max-w-[120px]">✓ {paramConfirmed}</span>
              )}
              <button
                onClick={handleParamReset}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all"
              >
                Reset
              </button>
              <button
                onClick={handleParamConfirm}
                disabled={!paramSelected || paramLoading}
                className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                {paramLoading ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating bottom-right: techno filter + layer switcher + legend */}
      {viewMode === 'map' && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto flex items-end gap-2 transition-all duration-300" style={{ right: (showRightPanel && !detailFullscreen ? 450 : 0) + 24 }}>
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

          {/* Techno filter: ALL / 5G / 4G — hidden when no sites */}
          {sites.length > 0 && (
            <div className="flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-lg overflow-hidden">
              {(['ALL', '5G', '4G', 'OFF'] as const).map((tech) => (
                <button
                  key={tech}
                  onClick={() => {
                    setMapTechnoFilter(tech);
                    const NR_BANDS = ['NR3500', 'NR700', 'NR2100'];
                    const LTE_BANDS = ['L2600', 'L2100', 'L1800', 'L800', 'L700'];
                    if (tech === 'ALL') {
                      setEnabledBands(new Set([...NR_BANDS, ...LTE_BANDS]));
                    } else if (tech === '5G') {
                      setEnabledBands(new Set(NR_BANDS));
                    } else if (tech === '4G') {
                      setEnabledBands(new Set(LTE_BANDS));
                    } else {
                      setEnabledBands(new Set());
                    }
                  }}
                  className={`w-10 h-10 flex items-center justify-center text-[10px] font-black tracking-wider transition-all ${
                    mapTechnoFilter === tech
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tech}
                </button>
              ))}
            </div>
          )}

          {/* Layer switcher: L / D / S */}
          <div className="flex flex-col bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-lg overflow-hidden">
            {([
              { key: 'light' as const, label: 'L' },
              { key: 'dark' as const, label: 'D' },
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

          {/* Band layer toggle panel */}
          <div className="relative">
            <button
              onClick={() => setShowBandPanel(!showBandPanel)}
              className={`w-10 h-10 flex items-center justify-center rounded-full shadow-lg transition-all ${
                showBandPanel
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card/95 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Band Layers"
            >
              <Signal size={16} />
            </button>
            {showBandPanel && (
              <div className="absolute right-12 bottom-0 bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl overflow-hidden min-w-[160px] z-[500]">
                {mapTechnoFilter === 'ALL' ? (
                  /* ── ALL mode: show only 5G / 4G with group color pickers ── */
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Technologies</span>
                      <button onClick={resetBandColors} className="text-[8px] font-bold text-muted-foreground/50 hover:text-foreground" title="Reset colors">↺</button>
                    </div>
                    {[
                      { key: '5G_GROUP', tech: '5G', label: '5G', defaultColor: '#a855f7' },
                      { key: '4G_GROUP', tech: '4G', label: '4G', defaultColor: '#f97316' },
                    ].map(({ key, tech, label, defaultColor }) => {
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
                      <button onClick={() => toggleAllBands('NR')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['5G_GROUP'] || '#a855f7' }}>
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
                      <button onClick={() => toggleAllBands('LTE')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['4G_GROUP'] || '#f97316' }}>
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
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══ LEFT PANEL — Inventory Index ══ */}
      {viewMode === 'map' && (
        <div className={`absolute top-0 left-0 bottom-0 z-[1000] pointer-events-auto transition-all duration-300 ease-in-out ${
          panelCollapsed ? 'w-14' : 'w-[400px]'
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
              <div className="px-5 pb-3 shrink-0">
                <div className="flex items-center gap-2.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Search Site ID or Name..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setLocalSearch(''); } }}
                    className="flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground min-w-0"
                  />
                  {localSearch && (
                    <button onClick={() => setLocalSearch('')} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Tabs: Sites / Dashboard ── */}
              <div className="px-5 pb-2 shrink-0 flex items-center gap-1 bg-muted/20 border-b border-border">
                {[
                  { id: 'dashboard' as const, label: 'Dashboard', icon: <LayoutGrid size={12} /> },
                  { id: 'sites' as const, label: 'Sites', icon: <MapPin size={12} /> },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setInventoryTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all max-w-[50%] ${
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
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Plaque</span>
                    <select value={localPlaque} onChange={(e) => setLocalPlaque(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniquePlaques.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Bande</span>
                    <select value={localBande} onChange={(e) => setLocalBande(e.target.value)}
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
                  <span className="text-[10px] text-muted-foreground font-semibold">{filteredSites.length} sites</span>
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
                {!dashboardActive && !loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Filter size={18} className="text-primary" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider">No Dashboard</span>
                    <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed px-4">
                      Sélectionnez ou créez un dashboard dans l'onglet Dashboard pour charger les sites.
                    </p>
                  </div>
                ) : filteredSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search size={28} className="mb-3 opacity-20" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">No sites found</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const displayed = filteredSites.slice(0, 100);
                      // Ensure selected site is always in the list even if beyond first 100
                      if (selectedSiteId && !displayed.find(s => s.site_id === selectedSiteId)) {
                        const sel = filteredSites.find(s => s.site_id === selectedSiteId);
                        if (sel) displayed.unshift(sel);
                      }
                      return displayed;
                    })().map(site => {
                      const isSelected = selectedSiteId === site.site_id;
                      const isExpanded = isSelected;
                      const siteCells = isSelected && siteDetail?.site_id === site.site_id && siteDetail.cells.length > 0
                        ? siteDetail.cells
                        : site.cells;
                      const displayedCellCount = isSelected && siteDetail?.site_id === site.site_id
                        ? (siteDetail.cell_count ?? siteDetail.cells.length)
                        : site.cell_count;
                      // Group cells by sector
                      const sectors = new Map<number, typeof siteCells>();
                      siteCells.forEach(c => {
                        const sNum = getSectorNumber(c.cell_id);
                        if (!sectors.has(sNum)) sectors.set(sNum, []);
                        sectors.get(sNum)!.push(c);
                      });
                      const sortedSec = Array.from(sectors.entries()).sort(([a], [b]) => a - b);

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
                          {/* Site row */}
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
                            </div>
                            <div className="text-right shrink-0">
                              <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg min-w-[48px]" style={{ background: getKpiColor((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0), color: '#fff' }}>
                                <span className="text-[15px] font-black tracking-tight leading-none">
                                  {((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0).toFixed(1)}
                                </span>
                              </div>
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase mt-1">{displayedCellCount} cells</div>
                            </div>
                            <ChevronDown size={16} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Expanded sector pills */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 animate-fade-in">
                              {/* Sector pills row */}
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {sortedSec.map(([sNum, cells]) => {
                                  const techs = [...new Set(cells.map(c => c.techno))].filter(Boolean).sort((a, b) => (a.includes('5G') ? -1 : 1));
                                  const isSectorExpanded = expandedSectors.has(sNum);
                                  const hasFocusedCell = cells.some(c => c.cell_id === focusCellId);
                                  const isQoeMode = sectorColorMode === 'kpi';
                                  const sectorAvgKpi = isQoeMode ? cells.reduce((s, c) => s + getCellKpiValue(c), 0) / (cells.length || 1) : 0;
                                  const sectorKpiColor = isQoeMode ? getKpiColor(sectorAvgKpi) : '';
                                  return (
                                    <button
                                      key={sNum}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSectors(prev => {
                                          const next = new Set(prev);
                                          if (next.has(sNum)) next.delete(sNum); else next.add(sNum);
                                          return next;
                                        });
                                      }}
                                      className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border-2 transition-all min-w-[64px] ${
                                        isSectorExpanded || hasFocusedCell
                                          ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                          : 'bg-muted/40 border-border hover:border-primary/30 text-foreground'
                                      }`}
                                    >
                                      <span className={`text-[10px] font-bold uppercase ${isSectorExpanded || hasFocusedCell ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                        {isQoeMode ? MAP_KPIS.find(k => k.id === mapKpi)?.label || mapKpi : techs.join(' / ')}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        {isQoeMode ? (
                                          <div className="w-3 h-3 rounded-full" style={{ background: isSectorExpanded || hasFocusedCell ? 'white' : sectorKpiColor }} />
                                        ) : techs.map(tech => (
                                          <div key={tech} className={`w-2.5 h-2.5 rounded-full ${
                                            isSectorExpanded || hasFocusedCell
                                              ? 'bg-primary-foreground'
                                              : tech.includes('5G') ? 'bg-emerald-500' : 'bg-amber-500'
                                          }`} />
                                        ))}
                                      </div>
                                      <span className={`text-[11px] font-extrabold ${isSectorExpanded || hasFocusedCell ? 'text-primary-foreground' : 'text-foreground'}`}>
                                        S{sNum}
                                      </span>
                                      {isQoeMode && !(isSectorExpanded || hasFocusedCell) ? (
                                        <span className="text-[10px] font-black" style={{ color: sectorKpiColor }}>
                                          {(sectorAvgKpi ?? 0).toFixed(1)}
                                        </span>
                                      ) : (
                                        <span className={`text-[8px] font-semibold ${isSectorExpanded || hasFocusedCell ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                          {cells.length} cell{cells.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Expanded sector → cell list */}
                              {expandedSectors.size > 0 && (() => {
                                const secCells = sortedSec.filter(([s]) => expandedSectors.has(s)).flatMap(([, cells]) => cells);
                                if (!secCells.length) return null;
                                return (
                                  <div className="border border-border rounded-xl overflow-hidden animate-fade-in">
                                    {secCells.map((cell, idx) => {
                                      const isSel = focusCellId === cell.cell_id;
                                      return (
                                        <button
                                          key={cell.cell_id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCellClick(cell.cell_id);
                                          }}
                                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all ${
                                            idx > 0 ? 'border-t border-border/50' : ''
                                          } ${
                                            isSel
                                              ? 'bg-primary/10 border-l-[3px] border-l-primary'
                                              : 'hover:bg-muted/40 border-l-[3px] border-l-transparent'
                                          }`}
                                        >
                                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColorMode === 'kpi' ? getKpiColor(getCellKpiValue(cell)) : getBandColor(cell.bande, cell.techno) }} />
                                          <div className="flex-1 min-w-0">
                                            <div className={`text-[11px] font-mono truncate ${isSel ? 'font-bold text-foreground' : 'text-foreground'}`}>
                                              {cell.cell_id}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground">
                                              {cell.techno} • {cell.bande} MHz • Az {cell.azimut}°
                                            </div>
                                          </div>
                                          <div className="text-[12px] font-bold shrink-0" style={{ color: getKpiColor(getCellKpiValue(cell)) }}>
                                            {(getCellKpiValue(cell) ?? 0).toFixed(1)}
                                          </div>
                                        </button>
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
                    {filteredSites.length > 100 && (
                      <div className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        + {filteredSites.length - 100} more — refine search
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* ── Dashboard tab ── */}
               <div style={{ display: inventoryTab === 'dashboard' ? 'contents' : 'none' }}>
                <DashboardInventoryTab
                  onApplyView={(settings) => {
                    if (settings.mapLayer) setMapLayer(settings.mapLayer);
                    if (settings.mapKpi) setMapKpi(settings.mapKpi);
                    if (settings.center && Array.isArray(settings.center)) {
                      if (settings.center && (settings.center as [number, number])[0] > 41 && (settings.center as [number, number])[0] < 52) setFlyTarget(settings.center as [number, number]);
                    }
                    // Apply site filters from dashboard
                    if (settings.siteFilters && Object.keys(settings.siteFilters).length > 0) {
                      const sf = settings.siteFilters as DashboardSiteFilters;
                      if (sf.dor?.length) setLocalDor(sf.dor[0]);
                      if (sf.constructeur?.length) setLocalVendor(sf.constructeur[0]);
                      if (sf.plaque?.length) setLocalPlaque(sf.plaque[0]);
                      if (sf.techno?.length) setLocalTechno(sf.techno[0] as any);
                      if (sf.bande?.length) setLocalBande(sf.bande[0]);
                      if (sf.zone_arcep?.length) setLocalZoneArcep(sf.zone_arcep[0]);
                    } else if (settings.siteScope) {
                      setActiveSiteScope(settings.siteScope);
                      const scope = settings.siteScope as SiteScope;
                      if (scope.type === 'DOR' && scope.value) setLocalDor(scope.value);
                      else if (scope.type === 'Plaque' && scope.value) setLocalPlaque(scope.value);
                    }
                    // Apply view filters (topo + qoe)
                    if (Array.isArray(settings.viewFilters)) {
                      setActiveViewFilters(settings.viewFilters);
                      for (const f of settings.viewFilters) {
                        if (f.mode === 'topo') {
                          if (f.tech) {
                            const t = f.tech === '4G' ? '4G' : f.tech === '5G' ? '5G' : 'ALL';
                            setLocalTechno(t as any);
                          }
                          if (f.attribute === 'constructeur' && f.value) setLocalVendor(f.value);
                          if (f.attribute === 'bande' && f.value) setLocalBande(f.value);
                          if (f.attribute === 'zone_arcep' && f.value) setLocalZoneArcep(f.value);
                        }
                      }
                    } else {
                      setActiveViewFilters([]);
                    }
                  }}
                  onDashboardActiveChange={(active, scope, siteFilters) => {
                    setDashboardActive(active);
                    setActiveSiteScope(scope || null);
                    setActiveDashboardFilters(siteFilters || null);
                    invalidateDashboardSitesCache();
                    invalidateSiteCellsCache();
                    invalidateBboxCache();
                    cellLoadingRef.current.clear();
                    setSelectedSiteId(null);
                    setSelectedSiteSnapshot(null);
                    setSiteDetail(null);
                    setExpandedSectors(new Set());
                    if (!active) {
                      setSites([]);
                      setActiveDashboardId(null);
                      setLocalDor('ALL');
                      setLocalPlaque('ALL');
                      setLocalVendor('ALL');
                      setLocalBande('ALL');
                      setLocalZoneArcep('ALL');
                      setLocalTechno('ALL');
                    } else if (siteFilters && Object.keys(siteFilters).length > 0) {
                      // Apply multi-filters from dashboard
                      if (siteFilters.dor?.length === 1) setLocalDor(siteFilters.dor[0]);
                      else if (siteFilters.dor?.length) setLocalDor(siteFilters.dor[0]); // first for bbox
                      if (siteFilters.constructeur?.length === 1) setLocalVendor(siteFilters.constructeur[0]);
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
                  onBeamVisChange={(v) => { setBeamVisibility(v); localStorage.setItem('qoebit_beam_visibility', String(v)); }}
                  onSaveDashboard={(dbId) => saveDashboardSettings(dbId)}
                  onLoadDashboard={(dbId) => loadDashboardSettings(dbId)}
                  isSaving={dashboardSaving}
                  backendFilterDefs={backendFilterDefs}
                  activeDashboardId={activeDashboardId}
                  onActiveDashboardIdChange={setActiveDashboardId}
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
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tight">{site.cell_count} CELLS</span>
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
                      <td className="px-6 py-6 text-center font-black text-muted-foreground text-[11px]">{site.cell_count}</td>
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
      <div className={`absolute z-[1000] bg-card border-l border-border overflow-hidden flex flex-col transition-all duration-300 ${
        detailFullscreen
          ? 'inset-0'
          : 'top-0 right-0 bottom-0 w-[450px]'
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
            // Use DB stats if available, fallback to local sites
            const dbStats = topoNetworkStats;
            let sites4GCount = 0, sites5GCount = 0, cells4GCount = 0, cells5GCount = 0;
            let bandMap4G: Record<string, number> = {};
            let bandMap5G: Record<string, number> = {};
            let vendorMap: Record<string, { '4G': number; '5G': number }> = {};

            if (dbStats && (dbStats.cells4G > 0 || dbStats.cells5G > 0 || dbStats.sites4G > 0 || dbStats.sites5G > 0)) {
              sites4GCount = dbStats.sites4G;
              sites5GCount = dbStats.sites5G;
              cells4GCount = dbStats.cells4G;
              cells5GCount = dbStats.cells5G;
              bandMap4G = dbStats.bandMap4G;
              bandMap5G = dbStats.bandMap5G;
              vendorMap = dbStats.vendorMap;
            } else {
              const allCells = sites.flatMap(s => s.cells || []);
              const c4G = allCells.filter(c => { const t = (c.techno || '').toUpperCase(); return (t.includes('4G') || t.includes('LTE')) && !t.includes('5G'); });
              const c5G = allCells.filter(c => (c.techno || '').toUpperCase().includes('5G') || (c.techno || '').toUpperCase().includes('NR'));
              cells4GCount = c4G.length;
              cells5GCount = c5G.length;
              sites4GCount = new Set(sites.filter(s => (s.cells || []).some(c => { const t = (c.techno || '').toUpperCase(); return (t.includes('4G') || t.includes('LTE')) && !t.includes('5G'); })).map(s => s.site_id)).size;
              sites5GCount = new Set(sites.filter(s => (s.cells || []).some(c => (c.techno || '').toUpperCase().includes('5G'))).map(s => s.site_id)).size;
              c4G.forEach(c => { const b = c.bande || 'Unknown'; bandMap4G[b] = (bandMap4G[b] || 0) + 1; });
              c5G.forEach(c => { const b = c.bande || 'Unknown'; bandMap5G[b] = (bandMap5G[b] || 0) + 1; });
              [...c4G, ...c5G].forEach(c => {
                const v = (c as any).vendor || (c as any).constructeur || 'Unknown';
                if (!vendorMap[v]) vendorMap[v] = { '4G': 0, '5G': 0 };
                if ((c.techno || '').toUpperCase().includes('5G')) vendorMap[v]['5G']++;
                else vendorMap[v]['4G']++;
              });
            }
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
                      <p className="text-[11px] text-muted-foreground mt-1">Vue d'ensemble réseau 4G / 5G</p>
                    </div>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 4G</div>
                      <div className="text-[22px] font-black text-foreground leading-none">{sites4GCount}</div>
                    </div>
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 5G</div>
                      <div className="text-[22px] font-black text-primary leading-none">{sites5GCount}</div>
                    </div>
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 4G</div>
                      <div className="text-[22px] font-black text-foreground leading-none">{cells4GCount}</div>
                    </div>
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 5G</div>
                      <div className="text-[22px] font-black text-primary leading-none">{cells5GCount}</div>
                    </div>
                  </div>
                </div>

                {/* Technology Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Technologie</h4>
                  {[
                    { label: 'LTE (4G)', count: cells4GCount, color: 'hsl(var(--chart-2))' },
                    { label: 'NR (5G)', count: cells5GCount, color: 'hsl(var(--primary))' },
                  ].map(t => {
                    const total = cells4GCount + cells5GCount || 1;
                    const pct = ((t.count / total) * 100).toFixed(1);
                    return (
                      <div key={t.label} className="flex items-center gap-2 py-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                        <span className="text-[11px] font-bold text-foreground flex-1">{t.label}</span>
                        <span className="text-[11px] font-black text-foreground">{t.count}</span>
                        <span className="text-[9px] text-muted-foreground w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Band Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Bandes</h4>
                  {Object.keys(bandMap4G).length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: bandColors['4G_GROUP'] || '#f97316' }}>LTE (4G)</div>
                      {Object.entries(bandMap4G).sort((a, b) => b[1] - a[1]).map(([band, count]) => (
                        <div key={band} className="flex items-center gap-2 py-1">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '4G') }} />
                          <span className="text-[10px] font-semibold text-foreground flex-1">{band}</span>
                          <span className="text-[10px] font-black text-muted-foreground">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(bandMap5G).length > 0 && (
                    <div>
                      <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: bandColors['5G_GROUP'] || '#a855f7' }}>NR (5G)</div>
                      {Object.entries(bandMap5G).sort((a, b) => b[1] - a[1]).map(([band, count]) => (
                        <div key={band} className="flex items-center gap-2 py-1">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '5G') }} />
                          <span className="text-[10px] font-semibold text-foreground flex-1">{band}</span>
                          <span className="text-[10px] font-black text-muted-foreground">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vendor Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Constructeurs</h4>
                  {Object.entries(vendorMap).sort((a, b) => (b[1]['4G'] + b[1]['5G']) - (a[1]['4G'] + a[1]['5G'])).map(([vendor, counts]) => (
                    <div key={vendor} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-[11px] font-bold text-foreground flex-1 capitalize">{vendor}</span>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[9px] text-muted-foreground">4G </span>
                          <span className="text-[10px] font-black text-foreground">{counts['4G']}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-muted-foreground">5G </span>
                          <span className="text-[10px] font-black text-primary">{counts['5G']}</span>
                        </div>
                      </div>
                    </div>
                  ))}
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
                      <div className="flex items-center gap-1.5 mt-1.5 text-[12px]">
                        <span className="text-muted-foreground">{totalSites.toLocaleString('fr-FR')} sites</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-semibold text-primary">{techs.join(' / ')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── DMS Metric Cards Row ── */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-4 gap-2.5">
                    {[
                      { label: 'DMS DL 3M', value: avgDmsDl3 },
                      { label: 'DMS DL 8M', value: avgDmsDl8 },
                      { label: 'DMS DL 30M', value: avgDmsDl30 },
                      { label: 'DMS UL 3M', value: avgDmsUl3 },
                    ].map((m, i) => (
                      <div key={i} className="bg-muted/30 rounded-xl border border-border px-2.5 py-3.5 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{m.label}</div>
                        <div className="text-[17px] font-black" style={{ color: getKpiColor(m.value) }}>{(m.value ?? 0).toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── QoE + Throughput + RTT Row ── */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center">
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-tight">Score QoE<br/>Global</div>
                      <div className="text-[30px] font-black mt-1.5 leading-none" style={{ color: getKpiColor(avgQoE) }}>
                        {(avgQoE ?? 0).toFixed(1)}%
                      </div>
                      <div className="w-14 h-1 rounded-full mx-auto mt-2.5" style={{ background: getKpiColor(avgQoE) }} />
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <ChevronDown size={16} className="text-primary" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit DL</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {(avgDl ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                      </div>
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <ChevronUp size={16} className="text-primary" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit UL</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {(avgUl ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                      </div>
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                        <Zap size={16} className="text-amber-500" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">RTT</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {(avgRtt ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">MS</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Technology Distribution ── */}
                <div className="px-5 py-5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Technology Distribution</h4>
                  <div className="space-y-4">
                    {techStats.map(ts => (
                      <div key={ts.tech} className="flex items-start gap-3">
                        <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${ts.tech === '5G' ? 'bg-primary' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-bold text-foreground">{ts.tech === '5G' ? '5G NR' : '4G LTE'}</span>
                            <span className="font-bold" style={{ color: getKpiColor(ts.avgQoE) }}>{(ts.avgQoE ?? 0).toFixed(1)}%</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {ts.count.toLocaleString('fr-FR')} cells • {ts.bands.join(' / ')}
                          </div>
                        </div>
                      </div>
                    ))}
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
                    {excellent > 0 && <div className="transition-all" style={{ width: `${(excellent / perfTotal) * 100}%`, background: '#22c55e' }} />}
                    {correct > 0 && <div className="transition-all" style={{ width: `${(correct / perfTotal) * 100}%`, background: '#f59e0b' }} />}
                    {degraded > 0 && <div className="transition-all" style={{ width: `${(degraded / perfTotal) * 100}%`, background: '#f97316' }} />}
                    {critical > 0 && <div className="transition-all" style={{ width: `${(critical / perfTotal) * 100}%`, background: '#ef4444' }} />}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    {[
                      { label: 'Excellent', pct: ((excellent / perfTotal) * 100).toFixed(0), color: '#22c55e' },
                      { label: 'Correct', pct: ((correct / perfTotal) * 100).toFixed(0), color: '#f59e0b' },
                      { label: 'Degraded', pct: ((degraded / perfTotal) * 100).toFixed(0), color: '#f97316' },
                      { label: 'Critical', pct: ((critical / perfTotal) * 100).toFixed(0), color: '#ef4444' },
                    ].map((p, i) => (
                      <div key={i} className="text-center">
                        <div className="font-bold text-[13px]" style={{ color: p.color }}>{p.pct}%</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">{p.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── AI Diagnostic Card ── */}
                <div className="px-5 py-4">
                  <div className="rounded-2xl px-5 py-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, hsl(220 40% 13%), hsl(220 50% 18%))' }}>
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(80 60% 45%)', boxShadow: '0 0 24px hsla(80, 60%, 45%, 0.3)' }}>
                      <Settings2 size={22} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-extrabold text-white uppercase tracking-wide">AI Diagnostic</div>
                      <div className="text-[11px] text-white/50 font-medium mt-0.5">RCA Analysis</div>
                    </div>
                    <button
                      onClick={() => { if (onLaunchAI) onLaunchAI('global'); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-white/90 transition-colors shrink-0"
                    >
                      <Zap size={14} />
                      Lancer
                    </button>
                  </div>
                </div>

                {/* ── KPI Evolution ── */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart2 size={14} className="text-primary" />
                    <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Evolution Temporelle des KPIs</h4>
                  </div>
                  <SiteKpiChart siteDetail={{ site_name: 'Global', site_id: 'global', qoe_score_avg: avgQoE, dms_dl_3: avgDmsDl3, dms_dl_8: avgDmsDl8, dms_dl_30: avgDmsDl30, dms_ul_3: avgDmsUl3, p50_thr_dn_mbps: avgDl, p50_thr_up_mbps: avgUl, p95_rtt_ms: avgRtt, cells: [] } as any} />
                </div>
              </div>
            );
          })()}

          {/* ========== SITE FOCUS MODE ========== */}
          {focusMode === 'site' && siteDetail && (() => {
            // Group cells by sector number
            const sectorMap = new Map<number, typeof siteDetail.cells>();
            siteDetail.cells.forEach(cell => {
              const sNum = getSectorNumber(cell.cell_id);
              if (!sectorMap.has(sNum)) sectorMap.set(sNum, []);
              sectorMap.get(sNum)!.push(cell);
            });
            const sortedSectors = Array.from(sectorMap.entries()).sort(([a], [b]) => a - b);

            // Get unique techs for badge
            const uniqueTechs = [...new Set(siteDetail.cells.map((c: any) => c.techno))].filter(Boolean).sort();
            const techBadgeStr = uniqueTechs.map(t => t === '5G' ? '5G' : '4G').join(' / ');
            const primaryBand = siteDetail.cells[0]?.bande || '';
            const primaryTech = siteDetail.cells[0]?.techno || '';
            const isTopoFocus = sectorColorMode === 'topo';

            return (
            <div className="divide-y divide-border">

              {/* ── Site Header — Screenshot style ── */}
              <div className="px-5 py-6">
                <div className="flex items-center gap-4">
                  {/* Dark icon block */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'hsl(220 40% 13%)' }}>
                    <BarChart2 size={24} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[18px] font-extrabold text-foreground leading-tight tracking-tight uppercase truncate">
                      {siteDetail.site_name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[12px]">
                      <span className="font-mono text-muted-foreground">{siteDetail.site_id}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-semibold text-primary">{primaryTech} {primaryBand}MHZ</span>
                    </div>
                  </div>
                  {/* Close button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBackToGlobal(); }}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Fermer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {isTopoFocus && (
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Radio size={14} className="text-primary" />
                    <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Sectors & Cells</h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {sortedSectors.map(([sNum, cells]) => {
                      const isSectorExpanded = expandedSectors.has(sNum);
                      return (
                        <button
                          key={sNum}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSectors(prev => {
                              const next = new Set(prev);
                              if (next.has(sNum)) next.delete(sNum); else next.add(sNum);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                            isSectorExpanded
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-card text-foreground border-border hover:border-primary/30'
                          }`}
                        >
                          <span className={`text-[10px] font-black uppercase ${isSectorExpanded ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                            Sector
                          </span>
                          <span className="text-[12px] font-extrabold">S{sNum}</span>
                          <span className={`text-[10px] font-semibold ${isSectorExpanded ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {cells.length} cell{cells.length > 1 ? 's' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {expandedSectors.size > 0 && (() => {
                    const visibleCells = sortedSectors
                      .filter(([sNum]) => expandedSectors.has(sNum))
                      .flatMap(([, cells]) => cells);

                    if (!visibleCells.length) return null;

                    return (
                      <div className="rounded-xl border border-border overflow-hidden bg-card">
                        {visibleCells.map((cell, idx) => {
                          const isSelectedCell = focusCellId === cell.cell_id;
                          return (
                            <button
                              key={cell.cell_id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(cell.cell_id);
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                idx > 0 ? 'border-t border-border/50' : ''
                              } ${
                                isSelectedCell
                                  ? 'bg-primary/10 border-l-[3px] border-l-primary'
                                  : 'hover:bg-muted/30 border-l-[3px] border-l-transparent'
                              }`}
                            >
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getBandColor(cell.bande, cell.techno) }} />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-mono font-semibold text-foreground truncate">{cell.cell_id}</div>
                                <div className="text-[9px] text-muted-foreground">
                                  {cell.techno} • {cell.bande} MHz • Az {cell.azimut ?? '—'}° • Tilt {(cell as any).tilt ?? '—'}°
                                </div>
                              </div>
                              <div className="text-[10px] font-bold text-muted-foreground shrink-0">S{getSectorNumber(cell.cell_id)}</div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── DMS Metric Cards Row ── */}
              <div className="px-5 py-4">
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { label: 'DMS DL 3M', value: (siteDetail as any).dms_dl_3 ?? siteDetail.cells[0]?.dms_dl_3 ?? 0 },
                    { label: 'DMS DL 8M', value: (siteDetail as any).dms_dl_8 ?? siteDetail.cells[0]?.dms_dl_8 ?? 0 },
                    { label: 'DMS DL 30M', value: (siteDetail as any).dms_dl_30 ?? siteDetail.cells[0]?.dms_dl_30 ?? 0 },
                    { label: 'DMS UL 3M', value: (siteDetail as any).dms_ul_3 ?? siteDetail.cells[0]?.dms_ul_3 ?? 0 },
                  ].map((m, i) => (
                    <div key={i} className="bg-muted/30 rounded-xl border border-border px-2.5 py-3.5 text-center">
                      <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{m.label}</div>
                      <div className="text-[17px] font-black" style={{ color: getKpiColor(m.value) }}>{(m.value ?? 0).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── QoE + Throughput + RTT Row ── */}
              <div className="px-5 py-4">
                <div className="grid grid-cols-4 gap-2.5">
                  {/* QoE big card */}
                  <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center">
                    <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-tight">Score QoE<br/>Global</div>
                    <div className="text-[30px] font-black mt-1.5 leading-none" style={{ color: getKpiColor(siteDetail.qoe_score_avg ?? 0) }}>
                      {(siteDetail.qoe_score_avg ?? 0).toFixed(1)}%
                    </div>
                    <div className="w-14 h-1 rounded-full mx-auto mt-2.5" style={{ background: getKpiColor(siteDetail.qoe_score_avg ?? 0) }} />
                  </div>
                  {/* DL */}
                  <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <ChevronDown size={16} className="text-primary" />
                    </div>
                    <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit DL</div>
                    <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                      {(siteDetail.p50_thr_dn_mbps ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                    </div>
                  </div>
                  {/* UL */}
                  <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <ChevronUp size={16} className="text-primary" />
                    </div>
                    <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit UL</div>
                    <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                      {(siteDetail.p50_thr_up_mbps ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                    </div>
                  </div>
                  {/* RTT */}
                  <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                      <Zap size={16} className="text-amber-500" />
                    </div>
                    <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">RTT</div>
                    <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                      {(siteDetail.p95_rtt_ms ?? 0).toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">MS</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Selected Cell Detail (from left panel) ── */}
              {focusCellId && (() => {
                const cell = siteDetail.cells.find(c => c.cell_id === focusCellId);
                if (!cell) return null;
                return (
                  <div className="px-5 py-4 space-y-4">
                    {/* Cell header */}
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getBandColor(cell.bande, cell.techno) }} />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-extrabold text-foreground font-mono truncate">{cell.cell_id}</h4>
                        <div className="text-[11px] text-muted-foreground">{cell.techno} • {cell.bande} MHz • Az {cell.azimut}°</div>
                      </div>
                      <button onClick={handleBackToSite} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                        ✕
                      </button>
                    </div>

                    {/* DMS cards for this cell */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'DMS DL 3M', value: cell.dms_dl_3 ?? 0 },
                        { label: 'DMS DL 8M', value: cell.dms_dl_8 ?? 0 },
                        { label: 'DMS DL 30M', value: cell.dms_dl_30 ?? 0 },
                        { label: 'DMS UL 3M', value: cell.dms_ul_3 ?? 0 },
                      ].map((m, i) => (
                        <div key={i} className="bg-muted/40 rounded-xl border border-border px-2 py-2.5 text-center">
                          <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{m.label}</div>
                          <div className="text-[14px] font-extrabold" style={{ color: getKpiColor(m.value) }}>{(m.value ?? 0).toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>

                    {/* QoE + DL + UL + RTT */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-muted/30 rounded-xl border border-border px-2 py-3 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">QoE</div>
                        <div className="text-[22px] font-black leading-none mt-1" style={{ color: getKpiColor(cell.qoe_score_avg) }}>
                          {(cell.qoe_score_avg ?? 0).toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-xl border border-border px-2 py-3 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">DL</div>
                        <div className="text-[18px] font-black text-foreground leading-none mt-1">
                          {(cell.p50_thr_dn_mbps ?? 0).toFixed(0)}<span className="text-[10px] text-muted-foreground ml-0.5">M</span>
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-xl border border-border px-2 py-3 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">UL</div>
                        <div className="text-[18px] font-black text-foreground leading-none mt-1">
                          {(cell.p50_thr_up_mbps ?? 0).toFixed(0)}<span className="text-[10px] text-muted-foreground ml-0.5">M</span>
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-xl border border-border px-2 py-3 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">RTT</div>
                        <div className="text-[18px] font-black text-foreground leading-none mt-1">
                          {(cell.p95_rtt_ms ?? 0).toFixed(0)}<span className="text-[10px] text-muted-foreground ml-0.5">ms</span>
                        </div>
                      </div>
                    </div>

                    {/* RF Parameters */}
                    <div>
                      <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-wider mb-2">RF Parameters</h5>
                      <div className="space-y-0 border border-border rounded-lg overflow-hidden">
                        {[
                          { label: 'Technology', value: cell.techno },
                          { label: 'Band', value: `${cell.bande} MHz` },
                          { label: 'Azimuth', value: `${cell.azimut}°` },
                          { label: 'HBA', value: `${cell.hba ?? '—'} m` },
                          { label: 'E-Tilt', value: `${cell.tilt ?? '—'}°` },
                          { label: 'PCI', value: `${(cell as any).pci ?? '—'}` },
                          { label: 'Status', value: (cell as any).etat_cellule ?? 'Active' },
                          { label: 'Sessions', value: cell.sessions?.toLocaleString() ?? '—' },
                        ].map((p, i) => (
                          <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11px] ${i > 0 ? 'border-t border-border/40' : ''}`}>
                            <span className="text-muted-foreground">{p.label}</span>
                            <span className="font-medium text-foreground">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── AI Diagnostic Card — dark style ── */}
              <div className="px-5 py-4">
                <div className="rounded-2xl px-5 py-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, hsl(220 40% 13%), hsl(220 50% 18%))' }}>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(80 60% 45%)', boxShadow: '0 0 24px hsla(80, 60%, 45%, 0.3)' }}>
                    <Settings2 size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-extrabold text-white uppercase tracking-wide">AI Diagnostic</div>
                    <div className="text-[11px] text-white/50 font-medium mt-0.5">RCA Analysis</div>
                  </div>
                  <button
                    onClick={() => { if (siteDetail && onLaunchAI) onLaunchAI(siteDetail.site_name); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-white/90 transition-colors shrink-0"
                  >
                    <Zap size={14} />
                    Lancer
                  </button>
                </div>
              </div>

              {/* ── KPI Evolution ── */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 size={14} className="text-primary" />
                  <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Evolution Temporelle des KPIs</h4>
                </div>
                <SiteKpiChart siteDetail={siteDetail} />
              </div>

              {/* ── Radio Profile & Coverage Sim buttons ── */}
              <div className="px-5 py-3 space-y-2">
                <button
                  onClick={() => { if (siteDetail) handleStartLosDrawing(siteDetail); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors uppercase tracking-wider"
                >
                  <Crosshair size={14} />
                  Radio Profile
                </button>
                <button
                  onClick={() => { if (siteDetail) handleLaunchCoverageSim(siteDetail); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/5 text-[11px] font-bold text-accent-foreground hover:bg-accent/15 transition-colors uppercase tracking-wider"
                >
                  <Signal size={14} />
                  Simulation Couverture
                </button>
              </div>

              {/* ── Site Design & Topology Analysis ── */}
              <div className="px-5 py-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Radio size={14} className="text-primary" />
                  <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Site Design — Topology & Tilt Analysis</h4>
                </div>

                {/* Site info summary */}
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  {[
                    { label: 'Site Name', value: siteDetail.site_name },
                    { label: 'Site ID', value: siteDetail.site_id },
                    { label: 'Vendor', value: siteDetail.vendor },
                    { label: 'Coordinates', value: `${siteDetail.coordinates[0].toFixed(5)}, ${siteDetail.coordinates[1].toFixed(5)}` },
                    { label: 'Altitude (HBA)', value: siteDetail.cells[0]?.hba != null ? `${siteDetail.cells[0].hba} m AGL` : '—' },
                    { label: 'Total Cells', value: `${siteDetail.cell_count}` },
                    { label: 'Sectors', value: `${sortedSectors.length}` },
                    { label: 'Technologies', value: techBadgeStr },
                    { label: 'Terrain Type', value: (() => {
                      const lat = siteDetail.coordinates[0];
                      const hba = siteDetail.cells[0]?.hba ?? 30;
                      if (hba >= 40) return 'Dense Urban';
                      if (hba >= 25) return 'Urban';
                      if (hba >= 15) return 'Suburban';
                      return 'Rural';
                    })() },
                    { label: 'Profile', value: (() => {
                      const hba = siteDetail.cells[0]?.hba ?? 30;
                      const bands = [...new Set(siteDetail.cells.map(c => c.bande))];
                      const has5G = siteDetail.cells.some(c => (c.techno || '').includes('5G'));
                      if (has5G && hba >= 30) return 'Macro 5G/4G Co-located';
                      if (has5G) return 'Small Cell 5G + Macro 4G';
                      if (bands.length >= 4) return 'Macro Multi-Band 4G';
                      if (hba < 15) return 'Micro Cell';
                      return 'Macro 4G Standard';
                    })() },
                  ].map((p, i) => (
                    <div key={i} className={`flex items-center justify-between px-4 py-2 text-[11px] border-b border-border/40 last:border-0 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                      <span className="text-muted-foreground font-medium">{p.label}</span>
                      <span className="font-semibold text-foreground">{p.value}</span>
                    </div>
                  ))}
                </div>

                {/* All cells azimuth / tilt table */}
                <div>
                  <h5 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
                    All Cells — Azimuth & Tilt Overview
                  </h5>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-[9px] uppercase tracking-wider">
                          <th className="text-left px-3 py-2 font-semibold">Cell</th>
                          <th className="text-center px-2 py-2 font-semibold">Tech</th>
                          <th className="text-center px-2 py-2 font-semibold">Band</th>
                          <th className="text-center px-2 py-2 font-semibold">Az°</th>
                          <th className="text-center px-2 py-2 font-semibold">E-Tilt°</th>
                          <th className="text-center px-2 py-2 font-semibold">HBA</th>
                          <th className="text-center px-2 py-2 font-semibold">Sector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {siteDetail.cells.map((c, i) => (
                          <tr key={c.cell_id} className={`hover:bg-muted/30 transition-colors ${i % 2 === 0 ? 'bg-muted/10' : ''}`}>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-foreground truncate max-w-[120px]">{c.cell_id}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(c.techno || '').includes('5G') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {c.techno}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-center text-muted-foreground">{c.bande}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-foreground">{c.azimut ?? '—'}°</td>
                            <td className="px-2 py-1.5 text-center font-bold text-foreground">{(c as any).tilt ?? '—'}°</td>
                            <td className="px-2 py-1.5 text-center text-muted-foreground">{c.hba ?? '—'}m</td>
                            <td className="px-2 py-1.5 text-center font-bold text-primary">S{getSectorNumber(c.cell_id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sector-by-sector tilt delta analysis */}
                <div>
                  <h5 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
                    Sector Tilt Delta Analysis
                  </h5>
                  <div className="space-y-3">
                    {sortedSectors.map(([sNum, cells]) => {
                      const avgAz = cells.length > 0 ? Math.round(cells.reduce((s, c) => s + (c.azimut ?? 0), 0) / cells.length) : 0;
                      const tilts = cells.map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
                      const maxTilt = tilts.length ? Math.max(...tilts) : null;
                      const minTilt = tilts.length ? Math.min(...tilts) : null;
                      const deltaTilt = maxTilt != null && minTilt != null ? maxTilt - minTilt : null;
                      const azDeltas = cells.map(c => Math.abs((c.azimut ?? avgAz) - avgAz));
                      const maxAzDelta = azDeltas.length ? Math.max(...azDeltas) : 0;

                      return (
                        <div key={sNum} className="rounded-xl border border-border overflow-hidden bg-card">
                          {/* Sector header */}
                          <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">S{sNum}</div>
                              <span className="text-[11px] font-bold text-foreground">Sector {sNum}</span>
                              <span className="text-[10px] text-muted-foreground">• {cells.length} cell{cells.length > 1 ? 's' : ''} • Az avg {avgAz}°</span>
                            </div>
                            {deltaTilt != null && (
                              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                deltaTilt === 0 ? 'bg-emerald-500/20 text-emerald-400' :
                                deltaTilt <= 2 ? 'bg-amber-500/20 text-amber-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                ΔTilt: {deltaTilt}°
                              </div>
                            )}
                          </div>
                          {/* Cells in this sector */}
                          <div className="divide-y divide-border/40">
                            {cells.map((c, ci) => {
                              const eTilt = (c as any).tilt as number | null;
                              const refTilt = tilts.length > 0 ? tilts[0] : null;
                              const cellDelta = eTilt != null && refTilt != null && ci > 0 ? eTilt - refTilt : null;
                              return (
                                <div key={c.cell_id} className={`flex items-center gap-3 px-4 py-2 text-[11px] ${ci % 2 === 0 ? 'bg-muted/10' : ''}`}>
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(c.bande, c.techno) }} />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-mono text-[10px] text-foreground truncate block">{c.cell_id}</span>
                                    <span className="text-[9px] text-muted-foreground">{c.techno} • {c.bande}</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-center">
                                      <div className="text-[9px] text-muted-foreground">Az</div>
                                      <div className="text-[11px] font-bold text-foreground">{c.azimut ?? '—'}°</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[9px] text-muted-foreground">E-Tilt</div>
                                      <div className="text-[11px] font-bold text-foreground">{eTilt ?? '—'}°</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[9px] text-muted-foreground">HBA</div>
                                      <div className="text-[11px] font-bold text-muted-foreground">{c.hba ?? '—'}m</div>
                                    </div>
                                    {cellDelta != null && (
                                      <div className="text-center">
                                        <div className="text-[9px] text-muted-foreground">Δ</div>
                                        <div className={`text-[11px] font-bold ${
                                          cellDelta === 0 ? 'text-emerald-400' :
                                          Math.abs(cellDelta) <= 2 ? 'text-amber-400' :
                                          'text-red-400'
                                        }`}>{cellDelta > 0 ? '+' : ''}{cellDelta}°</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Sector design verdict */}
                          {maxAzDelta > 5 && (
                            <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 text-[10px] font-semibold text-amber-400">
                              ⚠ Azimuth misalignment detected: max deviation {maxAzDelta}° from sector average
                            </div>
                          )}
                          {deltaTilt != null && deltaTilt > 3 && (
                            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-[10px] font-semibold text-red-400">
                              ⚠ High tilt delta ({deltaTilt}°) between co-sector cells — check site design coherence
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Design Summary */}
                {/* ── Site Design Verification ── */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-3 bg-muted/40 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-primary" />
                    <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-widest">Site Design Verification</h5>
                  </div>
                  <div className="divide-y divide-border/40">
                    {(() => {
                      type Check = { label: string; status: 'pass' | 'warn' | 'fail'; detail: string };
                      const checks: Check[] = [];

                      // 1. Sector count check
                      const sectorCount = sortedSectors.length;
                      checks.push({
                        label: 'Sector Configuration',
                        status: sectorCount >= 2 && sectorCount <= 4 ? 'pass' : 'warn',
                        detail: `${sectorCount}-sector site with ${siteDetail.cell_count} cells`,
                      });

                      // 2. Azimuth spacing check (expect ~120° for tri-sector, ~90° for quad)
                      const sectorAzimuths = sortedSectors.map(([, cells]) => {
                        const azArr = cells.map(c => c.azimut ?? 0);
                        return Math.round(azArr.reduce((a, b) => a + b, 0) / (azArr.length || 1));
                      }).sort((a, b) => a - b);
                      if (sectorAzimuths.length >= 2) {
                        const diffs: number[] = [];
                        for (let i = 1; i < sectorAzimuths.length; i++) diffs.push(sectorAzimuths[i] - sectorAzimuths[i - 1]);
                        diffs.push(360 - sectorAzimuths[sectorAzimuths.length - 1] + sectorAzimuths[0]);
                        const idealSpacing = 360 / sectorAzimuths.length;
                        const maxDeviation = Math.max(...diffs.map(d => Math.abs(d - idealSpacing)));
                        checks.push({
                          label: 'Azimuth Spacing',
                          status: maxDeviation <= 15 ? 'pass' : maxDeviation <= 30 ? 'warn' : 'fail',
                          detail: `Ideal ${idealSpacing}° — max deviation ${Math.round(maxDeviation)}° (${sectorAzimuths.map(a => a + '°').join(', ')})`,
                        });
                      }

                      // 3. Per-sector azimuth coherence
                      sortedSectors.forEach(([sNum, cells]) => {
                        const azimuths = [...new Set(cells.map(c => c.azimut))];
                        if (azimuths.length > 1) {
                          const spread = Math.max(...azimuths.map(Number)) - Math.min(...azimuths.map(Number));
                          checks.push({
                            label: `S${sNum} Azimuth Coherence`,
                            status: spread <= 5 ? 'pass' : spread <= 10 ? 'warn' : 'fail',
                            detail: `${azimuths.length} distinct azimuths (${azimuths.join('°, ')}°) — spread ${spread}°`,
                          });
                        } else {
                          checks.push({
                            label: `S${sNum} Azimuth Coherence`,
                            status: 'pass',
                            detail: `All cells at ${azimuths[0] ?? '—'}°`,
                          });
                        }
                      });

                      // 4. Per-sector tilt delta
                      sortedSectors.forEach(([sNum, cells]) => {
                        const tilts = cells.map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
                        if (tilts.length >= 2) {
                          const delta = Math.max(...tilts) - Math.min(...tilts);
                          checks.push({
                            label: `S${sNum} Tilt Delta`,
                            status: delta === 0 ? 'pass' : delta <= 3 ? 'warn' : 'fail',
                            detail: `ΔTilt = ${delta}° (range: ${Math.min(...tilts)}°–${Math.max(...tilts)}°)`,
                          });
                        } else if (tilts.length === 1) {
                          checks.push({ label: `S${sNum} Tilt Delta`, status: 'pass', detail: `Single tilt value: ${tilts[0]}°` });
                        } else {
                          checks.push({ label: `S${sNum} Tilt Delta`, status: 'warn', detail: 'No e-tilt data available' });
                        }
                      });

                      // 5. HBA consistency
                      const hbaVals = siteDetail.cells.map(c => c.hba).filter((h): h is number => h != null);
                      if (hbaVals.length >= 2) {
                        const hbaDelta = Math.max(...hbaVals) - Math.min(...hbaVals);
                        checks.push({
                          label: 'HBA Consistency',
                          status: hbaDelta === 0 ? 'pass' : hbaDelta <= 5 ? 'warn' : 'fail',
                          detail: hbaDelta === 0 ? `All cells at ${hbaVals[0]}m` : `Range: ${Math.min(...hbaVals)}m – ${Math.max(...hbaVals)}m (Δ${hbaDelta}m)`,
                        });
                      }

                      // 6. 5G/4G co-location
                      const has5G = siteDetail.cells.some(c => (c.techno || '').includes('5G'));
                      const has4G = siteDetail.cells.some(c => !(c.techno || '').includes('5G'));
                      if (has5G && has4G) {
                        // Check if 5G tilt < 4G tilt on same sector
                        let coLocOk = true;
                        sortedSectors.forEach(([, cells]) => {
                          const t5g = cells.filter(c => (c.techno || '').includes('5G')).map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
                          const t4g = cells.filter(c => !(c.techno || '').includes('5G')).map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
                          if (t5g.length > 0 && t4g.length > 0) {
                            const avg5 = t5g.reduce((a, b) => a + b, 0) / t5g.length;
                            const avg4 = t4g.reduce((a, b) => a + b, 0) / t4g.length;
                            if (avg5 > avg4 + 2) coLocOk = false;
                          }
                        });
                        checks.push({
                          label: '5G/4G Co-location',
                          status: coLocOk ? 'pass' : 'warn',
                          detail: coLocOk ? '5G/4G tilt strategy coherent' : '5G tilt > 4G tilt on some sectors — review strategy',
                        });
                      }

                      // 7. Band diversity per sector
                      sortedSectors.forEach(([sNum, cells]) => {
                        const bands = [...new Set(cells.map(c => c.bande).filter(Boolean))];
                        checks.push({
                          label: `S${sNum} Band Diversity`,
                          status: bands.length >= 2 ? 'pass' : 'warn',
                          detail: bands.length >= 2 ? `Multi-band: ${bands.join(', ')}` : `Single band: ${bands[0] || '—'}`,
                        });
                      });

                      // 8. Cell state check
                      const inactiveCells = siteDetail.cells.filter(c => {
                        const etat = (c as any).etat_cellule;
                        return etat && etat.toLowerCase() !== 'actif' && etat.toLowerCase() !== 'active';
                      });
                      checks.push({
                        label: 'Cell State',
                        status: inactiveCells.length === 0 ? 'pass' : 'warn',
                        detail: inactiveCells.length === 0 ? `All ${siteDetail.cell_count} cells active` : `${inactiveCells.length} inactive cell(s): ${inactiveCells.map(c => c.cell_id).join(', ')}`,
                      });

                      // Overall verdict
                      const failCount = checks.filter(c => c.status === 'fail').length;
                      const warnCount = checks.filter(c => c.status === 'warn').length;
                      const passCount = checks.filter(c => c.status === 'pass').length;

                      const statusIcon = (s: Check['status']) => s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌';
                      const statusColor = (s: Check['status']) => s === 'pass' ? 'text-emerald-400' : s === 'warn' ? 'text-amber-400' : 'text-red-400';

                      return (
                        <>
                          {checks.map((ch, i) => (
                            <div key={i} className={`flex items-start gap-3 px-4 py-2.5 text-[11px] ${i % 2 === 0 ? 'bg-muted/10' : ''}`}>
                              <span className="text-[12px] mt-0.5 shrink-0">{statusIcon(ch.status)}</span>
                              <div className="min-w-0 flex-1">
                                <div className={`font-bold ${statusColor(ch.status)}`}>{ch.label}</div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">{ch.detail}</div>
                              </div>
                            </div>
                          ))}
                          {/* Overall verdict bar */}
                          <div className={`px-4 py-3 flex items-center justify-between ${
                            failCount > 0 ? 'bg-red-500/10' : warnCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                          }`}>
                            <span className={`text-[12px] font-extrabold ${
                              failCount > 0 ? 'text-red-400' : warnCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {failCount > 0 ? '❌ DESIGN ISSUES DETECTED' : warnCount > 0 ? '⚠️ DESIGN REVIEW NEEDED' : '✅ SITE DESIGN OK'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{passCount}✅ {warnCount}⚠️ {failCount}❌</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
          })()}

          {/* ========== CELL FOCUS MODE ========== */}
          {focusMode === 'cell' && focusCellId && siteDetail && (() => {
            const cell = siteDetail.cells.find(c => c.cell_id === focusCellId);
            if (!cell) return <div className="p-4 text-muted-foreground text-[12px]">Cell not found.</div>;
            return (
              <div className="divide-y divide-border">
                {/* Cell Header — prominent */}
                <div className="px-5 py-5">
                  <div className="flex items-start gap-3.5">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: getBandColor(cell.bande, cell.techno) }}>
                      <Signal size={24} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[18px] font-extrabold text-foreground leading-tight tracking-tight uppercase truncate">
                        {cell.cell_id}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 text-[12px]">
                        <span className="text-muted-foreground">{siteDetail.site_name}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-semibold text-primary">{cell.techno} {cell.bande} MHz</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">Az {cell.azimut}°</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[22px] font-black" style={{ color: getKpiColor(cell.qoe_score_avg) }}>
                        {(cell.qoe_score_avg ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase">QoE</div>
                    </div>
                  </div>
                </div>

                {/* Tabs: KPIs / Topologie */}
                <div className="px-5 py-2 flex items-center gap-1 bg-muted/30">
                  {[
                    { id: 'kpi' as const, label: 'KPIs', icon: <BarChart2 size={12} /> },
                    { id: 'topo' as const, label: 'Topologie', icon: <Radio size={12} /> },
                    { id: 'config' as const, label: 'Config', icon: <Settings2 size={12} /> },
                    { id: 'sim' as const, label: 'Simulation', icon: <Signal size={12} /> },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCellDetailTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                        cellDetailTab === tab.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── KPI Tab — same style as Site Focus ── */}
                {cellDetailTab === 'kpi' && (
                  <>
                    {/* DMS Metric Cards Row */}
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'DMS DL 3M', value: cell.dms_dl_3 ?? 0 },
                          { label: 'DMS DL 8M', value: cell.dms_dl_8 ?? 0 },
                          { label: 'DMS DL 30M', value: cell.dms_dl_30 ?? 0 },
                          { label: 'DMS UL 3M', value: cell.dms_ul_3 ?? 0 },
                        ].map((m, i) => (
                          <div key={i} className="bg-muted/40 rounded-xl border border-border px-3 py-3 text-center">
                            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{m.label}</div>
                            <div className="text-[16px] font-extrabold" style={{ color: getKpiColor(m.value) }}>{(m.value ?? 0).toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* QoE + Throughput + RTT Row — identical to site */}
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-4 gap-2">
                        {/* QoE big card */}
                        <div className="bg-muted/30 rounded-xl border border-border px-3 py-4 text-center">
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">Score QoE<br/>Global</div>
                          <div className="text-[28px] font-black mt-1 leading-none" style={{ color: getKpiColor(cell.qoe_score_avg) }}>
                            {(cell.qoe_score_avg ?? 0).toFixed(1)}%
                          </div>
                          <div className="w-12 h-1 rounded-full mx-auto mt-2" style={{ background: getKpiColor(cell.qoe_score_avg) }} />
                        </div>
                        {/* DL */}
                        <div className="bg-muted/30 rounded-xl border border-border px-3 py-4 text-center flex flex-col items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                            <ChevronDown size={14} className="text-primary" />
                          </div>
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Débit DL</div>
                          <div className="text-[22px] font-black text-foreground leading-tight mt-0.5">
                            {(cell.p50_thr_dn_mbps ?? 0).toFixed(0)}<span className="text-[11px] font-semibold text-muted-foreground ml-0.5">M</span>
                          </div>
                        </div>
                        {/* UL */}
                        <div className="bg-muted/30 rounded-xl border border-border px-3 py-4 text-center flex flex-col items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                            <ChevronUp size={14} className="text-primary" />
                          </div>
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Débit UL</div>
                          <div className="text-[22px] font-black text-foreground leading-tight mt-0.5">
                            {(cell.p50_thr_up_mbps ?? 0).toFixed(0)}<span className="text-[11px] font-semibold text-muted-foreground ml-0.5">M</span>
                          </div>
                        </div>
                        {/* RTT */}
                        <div className="bg-muted/30 rounded-xl border border-border px-3 py-4 text-center flex flex-col items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
                            <Zap size={14} className="text-amber-500" />
                          </div>
                          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">RTT</div>
                          <div className="text-[22px] font-black text-foreground leading-tight mt-0.5">
                            {(cell.p95_rtt_ms ?? 0).toFixed(0)}<span className="text-[11px] font-semibold text-muted-foreground ml-0.5">MS</span>
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

                    {/* KPI Evolution Chart */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 size={14} className="text-primary" />
                        <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider">Evolution Temporelle des KPIs</h4>
                      </div>
                      <SiteKpiChart siteDetail={{ ...siteDetail, qoe_score_avg: cell.qoe_score_avg, dms_dl_3: cell.dms_dl_3, dms_dl_8: cell.dms_dl_8, dms_dl_30: cell.dms_dl_30, dms_ul_3: cell.dms_ul_3, site_id: cell.cell_id }} />
                    </div>

                    {/* Radio Profile & Coverage Sim buttons */}
                    <div className="px-5 py-3 space-y-2">
                      <button
                        onClick={() => { if (siteDetail) handleStartLosDrawing(siteDetail); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors uppercase tracking-wider"
                      >
                        <Crosshair size={14} />
                        Radio Profile
                      </button>
                      <button
                        onClick={() => { if (siteDetail) handleLaunchCoverageSim(siteDetail); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/5 text-[11px] font-bold text-accent-foreground hover:bg-accent/15 transition-colors uppercase tracking-wider"
                      >
                        <Signal size={14} />
                        Simulation Couverture
                      </button>
                    </div>
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
                        { label: 'Constructeur', value: (cell as any).constructeur ?? siteDetail.vendor ?? '—', highlight: true },
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
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Vérifiez que la cellule existe dans parameter_dump.</p>
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

// ── Inline Simulation Tab (rendered inside cell detail panel) ──
const ENV_OPTS = [
  { value: 'urban', label: 'Urbain', icon: '🏙️' },
  { value: 'suburban', label: 'Suburbain', icon: '🏘️' },
  { value: 'rural', label: 'Rural', icon: '🌾' },
] as const;

const InlineSimTab = ({ cell, siteDetail, simDefaults, simTechno, coverageSimulating, onSimulate, onClear }: any) => {
  const [params, setParams] = React.useState<Partial<SimulationParams>>({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);
  const [simulating, setSimulating] = React.useState(false);
  const [useTerrain, setUseTerrain] = React.useState(true);
  const [selectedCellIdx, setSelectedCellIdx] = React.useState(() => {
    return siteDetail.cells.findIndex((c: any) => c.cell_id === cell.cell_id) ?? 0;
  });

  const activeCell = siteDetail.cells[selectedCellIdx] ?? cell;
  const techno = (activeCell.techno?.includes('5G') ? '5G' : '4G') as '4G' | '5G';
  const defaults = React.useMemo(() => getDefaultParams(techno, activeCell.bande), [techno, activeCell.bande]);

  const merged = React.useMemo(() => ({
    lat: siteDetail.coordinates[0],
    lng: siteDetail.coordinates[1],
    frequency: params.frequency ?? defaults.frequency ?? 1800,
    txPower: params.txPower ?? defaults.txPower ?? 43,
    antennaHeight: params.antennaHeight ?? activeCell.hba ?? defaults.antennaHeight ?? 25,
    antennaGain: params.antennaGain ?? defaults.antennaGain ?? 18,
    azimuth: params.azimuth ?? activeCell.azimut ?? defaults.azimuth ?? 0,
    beamwidth: params.beamwidth ?? defaults.beamwidth ?? 65,
    tilt: params.tilt ?? (activeCell as any).tilt ?? defaults.tilt ?? 4,
    mechanicalTilt: params.mechanicalTilt ?? defaults.mechanicalTilt ?? 0,
    rxHeight: params.rxHeight ?? defaults.rxHeight ?? 1.5,
    radius: params.radius ?? defaults.radius ?? 5,
    gridSize: params.gridSize ?? defaults.gridSize ?? 80,
    environment: params.environment ?? defaults.environment ?? 'urban',
    techno,
    cableLoss: params.cableLoss ?? defaults.cableLoss ?? 2,
    bodyLoss: params.bodyLoss ?? defaults.bodyLoss ?? 3,
    bandwidth: params.bandwidth ?? defaults.bandwidth ?? 20,
    shadowFading: params.shadowFading ?? defaults.shadowFading ?? true,
    clutterEnabled: params.clutterEnabled ?? defaults.clutterEnabled ?? true,
  }), [params, defaults, siteDetail, activeCell, techno]);

  const upd = (k: keyof SimulationParams, v: any) => setParams(p => ({ ...p, [k]: v }));

  const handleSim = async () => {
    setSimulating(true);
    try {
      let terrainGrid: number[][] | undefined;

      // Try to fetch terrain from server
      if (useTerrain) {
        try {
          const resp = await fetch('http://localhost:3001/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...merged, useTerrain: true }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.terrainGrid) {
              terrainGrid = data.terrainGrid;
            }
          }
        } catch {
          console.log('[sim] Server unavailable, running client-side only');
        }
      }

      const grid = simulateCoverage({ ...merged, terrainGrid } as SimulationParams);
      onSimulate(grid);
    } finally {
      setSimulating(false);
    }
  };

  const isRunning = simulating || coverageSimulating;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Cell selector pills */}
      {siteDetail.cells.length > 1 && (
        <div>
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Cellule</label>
          <div className="flex flex-wrap gap-1">
            {siteDetail.cells.map((c: any, idx: number) => (
              <button
                key={c.cell_id}
                onClick={() => { setSelectedCellIdx(idx); setParams({}); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  idx === selectedCellIdx
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.bande} {c.azimut}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Frequency */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Fréquence</label>
          <span className="text-[11px] font-bold text-foreground">{merged.frequency} MHz</span>
        </div>
        <Slider value={[merged.frequency]} min={400} max={6000} step={100} onValueChange={v => upd('frequency', v[0])} className="mt-1" />
      </div>

      {/* Tx Power */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Puissance TX ({techno === '5G' ? 'SSB' : 'RS'})</label>
          <span className="text-[11px] font-bold text-foreground">{merged.txPower} dBm</span>
        </div>
        <Slider value={[merged.txPower]} min={20} max={60} step={1} onValueChange={v => upd('txPower', v[0])} className="mt-1" />
      </div>

      {/* Antenna Height */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Hauteur Antenne (HBA)</label>
          <span className="text-[11px] font-bold text-foreground">{merged.antennaHeight} m</span>
        </div>
        <Slider value={[merged.antennaHeight]} min={5} max={100} step={1} onValueChange={v => upd('antennaHeight', v[0])} className="mt-1" />
      </div>

      {/* Azimuth */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Azimut</label>
          <span className="text-[11px] font-bold text-foreground">{merged.azimuth}°</span>
        </div>
        <Slider value={[merged.azimuth]} min={0} max={359} step={1} onValueChange={v => upd('azimuth', v[0])} className="mt-1" />
      </div>

      {/* Radius */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Rayon Simulation</label>
          <span className="text-[11px] font-bold text-foreground">{merged.radius} km</span>
        </div>
        <Slider value={[merged.radius]} min={0.5} max={20} step={0.5} onValueChange={v => upd('radius', v[0])} className="mt-1" />
      </div>

      {/* Bandwidth */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Bande passante</label>
          <span className="text-[11px] font-bold text-foreground">{merged.bandwidth} MHz</span>
        </div>
        <Slider value={[merged.bandwidth]} min={5} max={100} step={5} onValueChange={v => upd('bandwidth', v[0])} className="mt-1" />
      </div>

      {/* Environment */}
      <div>
        <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Environnement</label>
        <div className="flex gap-1">
          {ENV_OPTS.map(env => (
            <button
              key={env.value}
              onClick={() => upd('environment', env.value)}
              className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-bold transition-all text-center ${
                merged.environment === env.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {env.icon} {env.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles: Shadow Fading + Terrain */}
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={merged.shadowFading} onChange={e => upd('shadowFading', e.target.checked)} className="rounded" />
          Shadow Fading
        </label>
        <label className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={merged.clutterEnabled} onChange={e => upd('clutterEnabled', e.target.checked)} className="rounded" />
          Clutter
        </label>
        <label className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={useTerrain} onChange={e => setUseTerrain(e.target.checked)} className="rounded" />
          Terrain DEM
        </label>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Settings2 size={11} />
        <span>Paramètres avancés</span>
        {showAdvanced ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-border">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Gain Antenne</label>
              <span className="text-[11px] font-bold text-foreground">{merged.antennaGain} dBi</span>
            </div>
            <Slider value={[merged.antennaGain]} min={0} max={30} step={0.5} onValueChange={v => upd('antennaGain', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Ouverture H</label>
              <span className="text-[11px] font-bold text-foreground">{merged.beamwidth}°</span>
            </div>
            <Slider value={[merged.beamwidth]} min={30} max={120} step={5} onValueChange={v => upd('beamwidth', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Tilt électrique</label>
              <span className="text-[11px] font-bold text-foreground">{merged.tilt}°</span>
            </div>
            <Slider value={[merged.tilt]} min={0} max={15} step={0.5} onValueChange={v => upd('tilt', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Tilt mécanique</label>
              <span className="text-[11px] font-bold text-foreground">{merged.mechanicalTilt}°</span>
            </div>
            <Slider value={[merged.mechanicalTilt]} min={0} max={15} step={0.5} onValueChange={v => upd('mechanicalTilt', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Perte câble (feeder)</label>
              <span className="text-[11px] font-bold text-foreground">{merged.cableLoss} dB</span>
            </div>
            <Slider value={[merged.cableLoss]} min={0} max={10} step={0.5} onValueChange={v => upd('cableLoss', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Perte corps (body loss)</label>
              <span className="text-[11px] font-bold text-foreground">{merged.bodyLoss} dB</span>
            </div>
            <Slider value={[merged.bodyLoss]} min={0} max={10} step={0.5} onValueChange={v => upd('bodyLoss', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Résolution grille</label>
              <span className="text-[11px] font-bold text-foreground">{merged.gridSize}×{merged.gridSize}</span>
            </div>
            <Slider value={[merged.gridSize]} min={40} max={200} step={10} onValueChange={v => upd('gridSize', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Hauteur mobile</label>
              <span className="text-[11px] font-bold text-foreground">{merged.rxHeight} m</span>
            </div>
            <Slider value={[merged.rxHeight]} min={1} max={10} step={0.5} onValueChange={v => upd('rxHeight', v[0])} className="mt-1" />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={() => setParams({})} className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5">
          <RotateCcw size={11} /> Reset
        </button>
        <button onClick={onClear} className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5">
          <X size={11} /> Effacer
        </button>
        <button
          onClick={handleSim}
          disabled={isRunning}
          className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          {isRunning ? (
            <><Activity size={13} className="animate-spin" /> Calcul...</>
          ) : (
            <><Play size={13} /> Simuler</>
          )}
        </button>
      </div>

      {/* RSRP Legend */}
      <div className="border-t border-border pt-2">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-full hover:text-foreground transition-colors"
        >
          <Signal size={10} /> Légende RSRP
          {showLegend ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
        </button>
        {showLegend && (
          <div className="mt-2 space-y-1">
            {RSRP_LEGEND.map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[10px]">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: item.color }} />
                <span className="font-mono text-muted-foreground">{item.label}</span>
                <span className="ml-auto font-semibold text-foreground">{item.quality}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, icon, color }: any) => (
  <div className="bg-card p-6 rounded-[2rem] border border-border flex flex-col items-center justify-center shadow-sm">
    <div className={`p-3 bg-muted rounded-2xl mb-3 ${color}`}>{icon}</div>
    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">{label}</span>
    <span className="text-xl font-black text-foreground tracking-tighter">{value}</span>
  </div>
);

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none focus:border-primary transition-all shadow-sm">
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

// Generate mock time-series data for a site's KPIs (seeded from site values)
const generateSiteTimeSeries = (siteDetail: any) => {
  const days = 14;
  const baseDate = new Date('2026-02-09');
  const baseQoE = siteDetail.qoe_score_avg ?? 75;
  const baseDms3 = siteDetail.dms_dl_3 ?? 85;
  const baseDms8 = siteDetail.dms_dl_8 ?? 78;
  const baseDms30 = siteDetail.dms_dl_30 ?? 32;
  const baseDmsUl = siteDetail.dms_ul_3 ?? 70;

  const data = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const seed = Math.sin(i * 3.7 + (siteDetail.site_id?.charCodeAt(0) ?? 0)) * 0.5;
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      QoE: Math.max(0, Math.min(100, baseQoE + seed * 8 + Math.sin(i * 0.9) * 3)),
      'DMS 3M': Math.max(0, Math.min(100, baseDms3 + seed * 5 + Math.cos(i * 1.1) * 4)),
      'DMS 8M': Math.max(0, Math.min(100, baseDms8 + seed * 6 + Math.sin(i * 1.3) * 5)),
      'DMS 30M': Math.max(0, Math.min(100, baseDms30 + seed * 10 + Math.cos(i * 0.7) * 6)),
      'DMS UL': Math.max(0, Math.min(100, baseDmsUl + seed * 7 + Math.sin(i * 1.5) * 4)),
    });
  }
  return data;
};

// Fetch real QoE metrics from Cloud for a site's cells
const useCloudQoeMetrics = (siteDetail: any) => {
  const [cloudData, setCloudData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'cloud' | 'mock'>('mock');

  useEffect(() => {
    if (!siteDetail?.cells?.length) { setCloudData(null); return; }
    let cancelled = false;
    const cellIds = siteDetail.cells.map((c: any) => c.cell_id);

    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await qoeMetricsApi.query({
          site_id: siteDetail.site_id,
          cell_ids: cellIds,
          limit: 500,
        });

        if (!data || data.length === 0) {
          if (!cancelled) { setCloudData(null); setSource('mock'); }
          return;
        }

        // Group by date and average
        const byDate = new Map<string, any[]>();
        data.forEach((row: any) => {
          const d = row.dt;
          if (!byDate.has(d)) byDate.set(d, []);
          byDate.get(d)!.push(row);
        });

        const avgVal = (arr: any[], key: string) => {
          const vals = arr.map(r => r[key]).filter((v: any) => v != null);
          return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
        };

        const series = Array.from(byDate.entries()).map(([dt, rows]) => ({
          date: new Date(dt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
          QoE: avgVal(rows, 'qoe_score_avg'),
          'DMS 3M': avgVal(rows, 'dms_dl_3'),
          'DMS 8M': avgVal(rows, 'dms_dl_8'),
          'DMS 30M': avgVal(rows, 'dms_dl_30'),
          'DMS UL': avgVal(rows, 'dms_ul_3'),
          'Débit DL': avgVal(rows, 'p50_thr_dn_mbps'),
          'Débit UL': avgVal(rows, 'p50_thr_up_mbps'),
          'RTT P95': avgVal(rows, 'p95_rtt_ms'),
        }));

        if (!cancelled) { setCloudData(series); setSource('cloud'); }
      } catch {
        if (!cancelled) { setCloudData(null); setSource('mock'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [siteDetail?.site_id]);

  return { cloudData, loading, source };
};

const KPI_SERIES = [
  { key: 'QoE', color: '#60a5fa', label: 'QOE' },
  { key: 'DMS 3M', color: '#22c55e', label: 'DMS 3M' },
  { key: 'DMS 8M', color: '#f59e0b', label: 'DMS 8M' },
  { key: 'DMS 30M', color: '#f97316', label: 'DMS 30M' },
  { key: 'DMS UL', color: '#ec4899', label: 'DMS UL' },
];

const SiteKpiChart = ({ siteDetail, fullHeight }: { siteDetail: any; fullHeight?: boolean }) => {
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(KPI_SERIES.map(k => k.key)));
  const { cloudData, loading: cloudLoading, source } = useCloudQoeMetrics(siteDetail);
  const mockData = useMemo(() => generateSiteTimeSeries(siteDetail), [siteDetail]);
  const data = cloudData ?? mockData;

  const toggleSeries = (key: string) => {
    setActiveSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Source badge */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {KPI_SERIES.map(s => {
            const isActive = activeSeries.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleSeries(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'bg-muted text-muted-foreground'
                }`}
                style={isActive ? { background: s.color } : undefined}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            );
          })}
        </div>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${
          source === 'cloud' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}>
          {cloudLoading ? '⏳' : source === 'cloud' ? '☁ Cloud' : '◈ Simul'}
        </span>
      </div>
      {/* Chart */}
      <div className={fullHeight ? "flex-1 min-h-[250px]" : "h-[200px]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            <RechartsTooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
              }}
            />
            {KPI_SERIES.filter(s => activeSeries.has(s.key)).map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SitesMonitor;
