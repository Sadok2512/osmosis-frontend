import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { CoverageGrid, SimulationParams, simulateCoverage, getDefaultParams, RSRP_LEGEND } from '@/services/propagationEngine';

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
import { fetchSites, fetchSiteDetails } from '../../services/api';
import { getSectorNumber, groupCellsBySector } from '../../utils/sectorUtils';
import { invalidateSitesCache } from '../../services/mockData';
import { SiteSummary, SiteDetail, Filters } from '../../types';
import {
  Search, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  SlidersHorizontal, ChevronRight, LayoutGrid, List, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen, Filter, X, Maximize2, Minimize2,
  ChevronDown, ChevronUp, BarChart2, Signal, Settings2,
  Crosshair, MousePointerClick, Radio, Plus, Minus, Star, Trash2, Check, Play, RotateCcw, Save, FolderOpen, MoreVertical, Archive
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { getQoEColor, VENDORS, URS, DEPARTMENTS, PLAQUES, RATS } from '../../constants';

interface SitesMonitorProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onCellSelect: (cellId: string) => void;
  highlightedCellIds?: string[];
  onClearHighlights?: () => void;
  onLaunchAI?: (siteName: string) => void;
}

// Zoom threshold: above this we show sectors, below we show clusters
const SECTOR_ZOOM_THRESHOLD = 13;

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
  } catch {}
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

// Fly to a site when selected
const FlyToSite = ({ coords, onFlyStart, onFlyEnd }: { coords: [number, number] | null; onFlyStart?: () => void; onFlyEnd?: () => void }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      onFlyStart?.();
      map.flyTo(coords, 15, { duration: 1 });
      const handler = () => { onFlyEnd?.(); };
      map.once('moveend', handler);
      return () => { map.off('moveend', handler); };
    }
  }, [coords, map]);
  return null;
};

// Create custom panes for 4G/5G layering
const TechPanes: React.FC = () => {
  const map = useMap();
  useEffect(() => {
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
      onViewportChange({ bounds: map.getBounds(), zoom: map.getZoom() });
    },
    zoomend: () => {
      onViewportChange({ bounds: map.getBounds(), zoom: map.getZoom() });
    },
  });

  // Initial viewport
  useEffect(() => {
    onViewportChange({ bounds: map.getBounds(), zoom: map.getZoom() });
  }, []);

  return null;
};

// Create a custom cluster icon
const createClusterCustomIcon = (_cluster: any) => {
  const dim = 14;
  return L.divIcon({
    html: `<div style="
      background: hsl(220 60% 30%);
      width: ${dim}px; height: ${dim}px;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      border: 2px solid hsl(var(--background));
    "></div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim, true),
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
  const [localFilters, setLocalFilters] = useState<{ tech: string; attribute: string; value: string }[]>(settings.viewFilters || []);
  const [filterStep, setFilterStep] = useState<'idle' | 'pick_tech' | 'pick_attr' | 'pick_value'>('idle');
  const [filterDraft, setFilterDraft] = useState<{ tech?: string; attribute?: string }>({});
  const [dirty, setDirty] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState('');

  const commitFilter = (val: string) => {
    if (filterDraft.tech && filterDraft.attribute) {
      setLocalFilters(prev => [...prev, { tech: filterDraft.tech!, attribute: filterDraft.attribute!, value: val }]);
      setDirty(true);
    }
    setFilterStep('idle');
    setFilterDraft({});
  };

  const removeFilterAt = (idx: number) => {
    setLocalFilters(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const resetFilterWizard = () => { setFilterStep('idle'); setFilterDraft({}); setFreeTextValue(''); };

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
      await supabase.from('dashboards').update({ is_shared: localVisibility, updated_at: new Date().toISOString() }).eq('id', dashboardId);
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
              {localFilters.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {localFilters.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${f.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{f.tech}</span>
                        <span className="font-medium text-muted-foreground">{SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === f.attribute)?.label}</span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className="font-semibold text-foreground">{f.value}</span>
                      </div>
                      <button onClick={() => removeFilterAt(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {filterStep === 'idle' && (
                <button onClick={() => setFilterStep('pick_tech')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold text-primary border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 transition-all w-full justify-center">
                  <Plus size={14} /><span>Ajouter un filtre</span>
                </button>
              )}
              {filterStep === 'pick_tech' && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Étape 1 — Choisir la technologie</span>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['4G', '5G'].map(t => (
                      <button key={t} onClick={() => { setFilterDraft({ tech: t }); setFilterStep('pick_attr'); }}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[12px] font-bold border-2 border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
                        <span>{t === '5G' ? '🚀' : '📶'}</span><span>{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filterStep === 'pick_attr' && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_tech')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 ${filterDraft.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{filterDraft.tech}</span>
                        Étape 2 — Choisir l'attribut
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
              {filterStep === 'pick_value' && filterDraft.attribute && (
                <div className="border border-border rounded-xl bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFilterStep('pick_attr')} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><ChevronRight size={12} className="rotate-180" /></button>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 ${filterDraft.tech === '5G' ? 'bg-purple-500/15 text-purple-600' : 'bg-blue-500/15 text-blue-600'}`}>{filterDraft.tech}</span>
                        {SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.label} — Choisir la valeur
                      </span>
                    </div>
                    <button onClick={resetFilterWizard} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                  </div>
                  {SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.freeText ? (
                    <div className="flex gap-2">
                      <input type="text" value={freeTextValue} onChange={e => setFreeTextValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && freeTextValue.trim()) { commitFilter(freeTextValue.trim()); setFreeTextValue(''); } }}
                        placeholder={`Entrer ${SETTINGS_FILTER_ATTRIBUTES.find(a => a.key === filterDraft.attribute)?.label}...`}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                      <button onClick={() => { if (freeTextValue.trim()) { commitFilter(freeTextValue.trim()); setFreeTextValue(''); } }}
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

interface DashboardInventoryTabProps {
  onApplyView?: (settings: any) => void;
  beamVisibility?: number;
  onBeamVisChange?: (v: number) => void;
  onSaveDashboard?: (dbId: string) => void;
  onLoadDashboard?: (dbId: string) => void;
  isSaving?: boolean;
}
const DashboardInventoryTab: React.FC<DashboardInventoryTabProps> = ({ onApplyView, beamVisibility: beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving }) => {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [ldg, setLdg] = useState(true);
  const [mapViews, setMapViews] = useState<any[]>([]);
  const [showCreateView, setShowCreateView] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedDashboardId, setExpandedDashboardId] = useState<string | null>(null);
  const [editingDashboardId, setEditingDashboardId] = useState<string | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [showDashMenu, setShowDashMenu] = useState(false);
  const [showCreateDash, setShowCreateDash] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [creatingDash, setCreatingDash] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);

  const requestDashboardSwitch = (newId: string | null) => {
    // If there's a current dashboard selected and we're switching away, ask to save
    if (expandedDashboardId && newId !== expandedDashboardId) {
      setPendingSwitchId(newId);
      setShowSwitchConfirm(true);
    } else {
      setExpandedDashboardId(newId);
      if (newId && onApplyView) {
        const db = dashboards.find(d => d.id === newId);
        if (db) onApplyView(getDashboardSettings(db));
      }
    }
  };

  const confirmSwitchWithSave = () => {
    if (expandedDashboardId && onSaveDashboard) onSaveDashboard(expandedDashboardId);
    setExpandedDashboardId(pendingSwitchId);
    if (pendingSwitchId && onApplyView) {
      const db = dashboards.find(d => d.id === pendingSwitchId);
      if (db) onApplyView(getDashboardSettings(db));
    }
    setShowSwitchConfirm(false);
    setPendingSwitchId(null);
  };

  const confirmSwitchWithoutSave = () => {
    setExpandedDashboardId(pendingSwitchId);
    if (pendingSwitchId && onApplyView) {
      const db = dashboards.find(d => d.id === pendingSwitchId);
      if (db) onApplyView(getDashboardSettings(db));
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
    const [dbRes, mvRes] = await Promise.all([
      supabase.from('dashboards').select('*').eq('is_archived', false).order('updated_at', { ascending: false }),
      supabase.from('map_views').select('*').order('updated_at', { ascending: false }),
    ]);
    if (dbRes.data) setDashboards(dbRes.data);
    if (mvRes.data) setMapViews(mvRes.data);
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
    await supabase.from('dashboards').update({ widgets: w, updated_at: new Date().toISOString() }).eq('id', dbId);
    setDashboards(prev => prev.map(d => d.id === dbId ? { ...d, widgets: w } : d));
  };

  const renameDashboard = async (dbId: string, newName: string) => {
    if (!newName.trim()) return;
    await supabase.from('dashboards').update({ name: newName.trim(), updated_at: new Date().toISOString() }).eq('id', dbId);
    setDashboards(prev => prev.map(d => d.id === dbId ? { ...d, name: newName.trim() } : d));
  };

  const handleCreateDashboard = async () => {
    if (!newDashName.trim()) return;
    setCreatingDash(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('dashboards').insert({
      id,
      name: newDashName.trim(),
      description: '',
      is_shared: true,
      widgets: [{ _type: 'dashboard_settings', mapLayer: 'light', mapKpi: 'qoe_score_avg', color: '' }],
    });
    if (!error) {
      setNewDashName('');
      setShowCreateDash(false);
      await fetchAll();
      setExpandedDashboardId(id);
    }
    setCreatingDash(false);
  };

  const handleDeleteDashboard = async (dbId: string) => {
    await supabase.from('dashboards').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('id', dbId);
    if (expandedDashboardId === dbId) setExpandedDashboardId(null);
    setDashboards(prev => prev.filter(d => d.id !== dbId));
  };

  // ── View helpers ──
  const handleCreateView = async (dashboardId: string) => {
    if (!newViewName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from('map_views').insert({
      name: newViewName.trim(),
      description: dashboardId,
      settings: { center: [43.2965, 5.3698], zoom: 6 },
    });
    if (!error) {
      setNewViewName('');
      setShowCreateView(null);
      fetchAll();
    }
    setCreating(false);
  };

  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('map_views').delete().eq('id', id);
    fetchAll();
  };

  const handleUpdateViewSettings = async (viewId: string, updates: Record<string, any>) => {
    const view = mapViews.find(v => v.id === viewId);
    if (!view) return;
    const currentSettings = typeof view.settings === 'object' ? view.settings : {};
    const newSettings = { ...currentSettings, ...updates };
    await supabase.from('map_views').update({ settings: newSettings, updated_at: new Date().toISOString() }).eq('id', viewId);
    setMapViews(prev => prev.map(v => v.id === viewId ? { ...v, settings: newSettings } : v));
  };

  const handleRenameView = async (viewId: string, newName: string) => {
    if (!newName.trim()) return;
    await supabase.from('map_views').update({ name: newName.trim(), updated_at: new Date().toISOString() }).eq('id', viewId);
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
      <div className="flex items-center gap-2 px-1 mb-2">
        <LayoutGrid size={13} className="text-primary" />
        <h3 className="text-[10px] font-extrabold text-foreground uppercase tracking-widest">Dashboards</h3>
        <span className="text-[9px] font-bold text-muted-foreground">{dashboards.length}</span>
        <button
          onClick={() => setShowCreateDash(!showCreateDash)}
          className="ml-auto p-1 rounded-lg text-primary hover:bg-primary/10 transition-colors"
          title="Nouveau dashboard"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create dashboard form */}
      {showCreateDash && (
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <input
            autoFocus
            value={newDashName}
            onChange={e => setNewDashName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateDashboard()}
            placeholder="Nom du dashboard..."
            className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
          />
          <button onClick={handleCreateDashboard} disabled={creatingDash || !newDashName.trim()}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
            {creatingDash ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => { setShowCreateDash(false); setNewDashName(''); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Dashboard selector + Save/Load actions */}
      <div className="mb-3 space-y-1.5">
        <select
          value={expandedDashboardId || ''}
          onChange={(e) => {
            const val = e.target.value || null;
            requestDashboardSwitch(val);
          }}
          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-colors"
        >
          <option value="">— Sélectionner un dashboard —</option>
          {dashboards.map(db => (
            <option key={db.id} value={db.id}>{db.name}</option>
          ))}
        </select>
        {expandedDashboardId && (
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { if (onSaveDashboard) onSaveDashboard(expandedDashboardId); }}
              disabled={isSaving}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary"
            >
              {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              <span className="uppercase tracking-wider">Save</span>
            </button>
            <button
              onClick={() => { if (onLoadDashboard) onLoadDashboard(expandedDashboardId); }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted"
            >
              <FolderOpen size={12} />
              <span className="uppercase tracking-wider">Load</span>
            </button>
            <button
              onClick={() => requestDashboardSwitch(null)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5"
            >
              <X size={12} />
              <span className="uppercase tracking-wider">Close</span>
            </button>
          </div>
        )}
      </div>

      {dashboards.length === 0 ? (
        <div className="px-3 py-3 text-center text-[10px] text-muted-foreground/60">Aucun dashboard</div>
      ) : (
        <div className="space-y-1.5">
          {dashboards.map(db => {
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
                    onUpdate={(u) => updateDashboardSettings(db.id, u)}
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

                {/* Nested views tree */}
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
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'map'>('map');
  const [localSearch, setLocalSearch] = useState('');
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [isFlying, setIsFlying] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showAllSites, setShowAllSites] = useState(false);
  const [localVendor, setLocalVendor] = useState('ALL');
  const [localDor, setLocalDor] = useState('ALL');
  const [localPlaque, setLocalPlaque] = useState('ALL');
  const [localSite, setLocalSite] = useState('ALL');
  const [mapKpi, setMapKpi] = useState('qoe_score_avg');
  const [showKpiDropdown, setShowKpiDropdown] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [viewport, setViewport] = useState<ViewportState>({ bounds: null, zoom: 6 });
  const [mapRendering, setMapRendering] = useState(false);
  const [clusteringUnlocked, setClusteringUnlocked] = useState(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'sites' | 'points' | 'heatmap'>('sites');
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'satellite'>('light');

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
  const [showBandPanel, setShowBandPanel] = useState(true);
  const [sectorColorMode, setSectorColorMode] = useState<'topo' | 'kpi'>('topo');
  const [bandColors, setBandColors] = useState<Record<string, string>>(loadCustomBandColors);
  const [editingColorBand, setEditingColorBand] = useState<string | null>(null);

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
  const [cellDetailTab, setCellDetailTab] = useState<'kpi' | 'topo' | 'sim'>('kpi');
  const [inventoryTab, setInventoryTab] = useState<'sites' | 'dashboard'>('sites');
  const [beamVisibility, setBeamVisibility] = useState<number>(() => {
    try { const v = localStorage.getItem('qoebit_beam_visibility'); return v ? Number(v) : 75; } catch { return 75; }
  });

  // ── Active Dashboard selector ──
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(() => localStorage.getItem('qoebit_active_dashboard'));
  const [dashboardList, setDashboardList] = useState<{ id: string; name: string; widgets: any }[]>([]);
  const [showDashboardDropdown, setShowDashboardDropdown] = useState(false);
  const [dashboardSaving, setDashboardSaving] = useState(false);
  const [dashboardSaveFlash, setDashboardSaveFlash] = useState(false);

  // Fetch dashboards list
  useEffect(() => {
    const fetchDashboards = async () => {
      const { data } = await supabase.from('dashboards').select('id, name, widgets').order('updated_at', { ascending: false });
      if (data) setDashboardList(data);
    };
    fetchDashboards();
  }, []);

  const activeDashboard = dashboardList.find(d => d.id === activeDashboardId);

  const saveDashboardSettings = useCallback(async (targetDbId?: string) => {
    const dbId = targetDbId || activeDashboardId;
    if (!dbId) return;
    setDashboardSaving(true);
    const currentSettings = getCurrentMapSettings();
    const db = dashboardList.find(d => d.id === dbId);
    if (!db) { setDashboardSaving(false); return; }
    const widgets = Array.isArray(db.widgets) ? [...db.widgets] : [];
    const idx = widgets.findIndex((w: any) => w?._type === 'dashboard_settings');
    const existing = idx >= 0 ? widgets[idx] : { _type: 'dashboard_settings' };
    const updated = { ...existing, ...currentSettings, bandColors, beamVisibility };
    if (idx >= 0) widgets[idx] = updated; else widgets.push(updated);
    await supabase.from('dashboards').update({ widgets, updated_at: new Date().toISOString() }).eq('id', dbId);
    setDashboardList(prev => prev.map(d => d.id === dbId ? { ...d, widgets } : d));
    setActiveDashboardId(dbId);
    localStorage.setItem('qoebit_active_dashboard', dbId);
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
      if (settings.localSite) setLocalSite(settings.localSite);
      if (settings.bandColors) {
        setBandColors(settings.bandColors);
        localStorage.setItem('qoebit_band_colors', JSON.stringify(settings.bandColors));
      }
      if (settings.center) setFlyTarget(settings.center);
      if (settings.beamVisibility != null) {
        setBeamVisibility(settings.beamVisibility);
        localStorage.setItem('qoebit_beam_visibility', String(settings.beamVisibility));
      }
    }
    setActiveDashboardId(dbId);
    localStorage.setItem('qoebit_active_dashboard', dbId);
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
        remote_electrical_tilt: (c as any).remote_electrical_tilt,
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
      tilt: 0,
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

  useEffect(() => {
    const loadSites = async () => {
      setLoading(true);
      const data = await fetchSites(filters);
      setSites(data || []);
      setLoading(false);
    };
    loadSites();
  }, [filters]);

  // Force reload when component mounts (e.g. switching from Settings after import)
  useEffect(() => {
    invalidateSitesCache();
    fetchSites(filters).then(data => setSites(data || []));
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      const loadDetail = async () => {
        setDetailLoading(true);
        const data = await fetchSiteDetails(selectedSiteId);
        setSiteDetail(data);
        setDetailLoading(false);
      };
      loadDetail();
    } else {
      setSiteDetail(null);
    }
  }, [selectedSiteId]);

  // Filter sites by search/filters (without techno filter — that only affects map rendering)
  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      const matchesSearch = s.site_name.toLowerCase().includes(localSearch.toLowerCase()) || s.site_id.toLowerCase().includes(localSearch.toLowerCase());
      const matchesDor = filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesPlaque = filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesVendor = filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDep = filters.department === 'ALL' || s.department === filters.department;
      const matchesRat = filters.rat === 'ALL' || s.cells.some(c => c.techno === filters.rat);
      const matchesLocalVendor = localVendor === 'ALL' || s.vendor === localVendor;
      const matchesLocalDor = localDor === 'ALL' || s.dor === localDor;
      const matchesLocalPlaque = localPlaque === 'ALL' || s.plaque === localPlaque;
      const matchesLocalSite = localSite === 'ALL' || s.site_name === localSite;
      return matchesSearch && matchesDor && matchesPlaque && matchesVendor && matchesDep && matchesRat && matchesLocalVendor && matchesLocalDor && matchesLocalPlaque && matchesLocalSite;
    });
  }, [sites, localSearch, filters, localVendor, localDor, localPlaque, localSite]);

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
    if (mapTechnoFilter === 'ALL') return filteredSites;
    return filteredSites.filter(s => s.cells.some(c => c.techno === mapTechnoFilter));
  }, [filteredSites, mapTechnoFilter]);

  // Dynamic filter options based on actual data
  const uniqueVendors = useMemo(() => ['ALL', ...new Set(sites.map(s => s.vendor).filter(Boolean))].sort(), [sites]);
  const uniqueDors = useMemo(() => ['ALL', ...new Set(sites.map(s => s.dor).filter(Boolean))].sort(), [sites]);
  const uniquePlaques = useMemo(() => ['ALL', ...new Set(sites.map(s => s.plaque).filter(Boolean))].sort(), [sites]);
  const uniqueSiteNames = useMemo(() => {
    const names = [...new Set(sites.map(s => s.site_name))].sort();
    return ['ALL', ...names];
  }, [sites]);

  // Sites visible in current viewport (for map rendering) — with cap to prevent hangs
  const MAX_RENDER_SITES = 5000;

  const visibleSites = useMemo(() => {
    let candidates = mapFilteredSites;
    // Viewport culling
    if (viewport.bounds) {
      candidates = candidates.filter(s => viewport.bounds!.contains(L.latLng(s.coordinates[0], s.coordinates[1])));
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

  const showSectors = viewport.zoom >= SECTOR_ZOOM_THRESHOLD && mapDisplayMode === 'sites' && !isFlying;

  // Heatmap data points: [lat, lng, intensity]
  const heatmapPoints = useMemo((): [number, number, number][] => {
    if (mapDisplayMode !== 'heatmap') return [];
    return visibleSites.map(s => {
      const val = getCellKpiValue(s.cells[0] || {});
      return [s.coordinates[0], s.coordinates[1], val / 100] as [number, number, number];
    });
  }, [mapFilteredSites, mapDisplayMode, mapKpi]);

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

  const handleViewportChange = useCallback((v: ViewportState) => {
    const prevZoom = viewport.zoom;
    setViewport(v);
    if (v.zoom >= 8 && !clusteringUnlocked) {
      setClusteringUnlocked(true);
    }
    // Show loading when zooming in or out changes visible sites
    if (v.zoom !== prevZoom && mapFilteredSites.length > 500) {
      setMapRendering(true);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = setTimeout(() => setMapRendering(false), 600);
    }
  }, [viewport.zoom, mapFilteredSites.length, clusteringUnlocked]);

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
      localSite,
      beamVisibility,
    };
  }, [viewport, mapLayer, mapKpi, mapTechnoFilter, enabledBands, sectorColorMode, mapDisplayMode, showBandPanel, showLegend, showRightPanel, panelCollapsed, localVendor, localDor, localPlaque, localSite, beamVisibility]);

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
    setLocalSite(settings.localSite);
    // Fly to saved center/zoom
    setFlyTarget(settings.center);
    if ((settings as any).beamVisibility != null) {
      setBeamVisibility((settings as any).beamVisibility);
      localStorage.setItem('qoebit_beam_visibility', String((settings as any).beamVisibility));
    }
  }, []);

  const handleSiteClick = (site: SiteSummary) => {
    setFlyTarget(site.coordinates);
    setSelectedSiteId(site.site_id);
    setFocusMode('site');
    setFocusCellId(null);
    setShowRightPanel(true);
  };

  const handleCellClick = (cellId: string) => {
    setFocusMode('cell');
    setFocusCellId(cellId);
    onCellSelect(cellId);
    setShowRightPanel(true);
  };

  const handleBackToGlobal = () => {
    setSelectedSiteId(null);
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

  if (selectedSiteId && detailLoading) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 bg-background">
      <RefreshCw className="w-12 h-12 text-primary animate-spin" />
      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Loading site detail...</p>
    </div>
  );

  // No early return for siteDetail — rendered as right panel inside the main view

  // Main view — full screen map with clustering
  return (
    <div className="absolute inset-0 bg-background overflow-hidden">
      {loadingOverlay}
      {/* FULL SCREEN MAP */}
      <MapContainer
        center={sites.length > 0 ? sites[0].coordinates : [43.2965, 5.3698]}
        zoom={sites.length > 0 ? 12 : 6}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
      >
        <CustomZoomControl />
        <TileLayer
          key={mapLayer}
          url={TILE_URLS[mapLayer].url}
          attribution={TILE_URLS[mapLayer].attribution}
        />
        <FlyToSite coords={flyTarget} onFlyStart={() => setIsFlying(true)} onFlyEnd={() => setIsFlying(false)} />
        <TechPanes />
        <MapViewportTracker onViewportChange={handleViewportChange} />
        <LOSMapClickHandler onMapClick={handleLosMapClick} drawing={losDrawingMode} />

        {/* Heatmap layer */}
        {mapDisplayMode === 'heatmap' && (
          <HeatmapLayer points={heatmapPoints} radius={35} blur={25} minOpacity={0.3} />
        )}

        {/* Points mode — individual cell markers colored by KPI threshold */}
        {mapDisplayMode === 'points' && visibleSites.map(site => {
          const showCellLabels = viewport.zoom >= 13;
          const cellsToRender = (mapTechnoFilter === 'ALL' ? site.cells
            : site.cells.filter(c => c.techno === mapTechnoFilter)).filter(c => isBandEnabled(c.bande, c.techno));
          return (
            <React.Fragment key={site.site_id}>
              {cellsToRender.map((cell, idx) => {
                const val = getCellKpiValue(cell);
                const color = getKpiColor(val);
                const isHovered = hoveredSiteId === site.site_id;
                // Offset cells slightly from site center based on azimuth
                const offsetDist = 0.0003;
                const rad = ((cell.azimut || idx * 120) - 90) * (Math.PI / 180);
                const cellLat = site.coordinates[0] + offsetDist * Math.cos(rad);
                const cellLng = site.coordinates[1] + offsetDist * Math.sin(rad);
                return (
                  <CircleMarker
                    key={cell.cell_id}
                    center={[cellLat, cellLng]}
                    radius={isHovered ? 9 : showCellLabels ? 7 : 5}
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
                    {showCellLabels && (
                      <Tooltip direction="right" offset={[8, 0]} permanent className="cell-kpi-label">
                        <span style={{ color, fontWeight: 800, fontSize: '10px' }}>{val.toFixed(1)}</span>
                      </Tooltip>
                    )}
                    <Popup>
                      <div className="p-1 min-w-[180px]">
                        <div className="font-bold text-sm">{site.site_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{cell.cell_id}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{cell.techno} • {cell.bande} MHz • {cell.azimut}°</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-xs"><span>QoE</span><span className="font-bold" style={{ color: getKpiColor(cell.qoe_score_avg) }}>{cell.qoe_score_avg.toFixed(1)}%</span></div>
                          <div className="flex justify-between text-xs"><span>DMS DL ≥3</span><span className="font-bold">{cell.dms_dl_3.toFixed(1)}%</span></div>
                          <div className="flex justify-between text-xs"><span>DMS DL ≥8</span><span className="font-bold">{cell.dms_dl_8.toFixed(1)}%</span></div>
                          <div className="flex justify-between text-xs"><span>Débit DL</span><span className="font-bold">{cell.p50_thr_dn_mbps.toFixed(1)} Mbps</span></div>
                          <div className="flex justify-between text-xs"><span>RTT P95</span><span className="font-bold">{cell.p95_rtt_ms.toFixed(0)} ms</span></div>
                          <div className="flex justify-between text-xs"><span>Sessions</span><span className="font-bold">{cell.sessions.toLocaleString()}</span></div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Sites mode — Circle markers when sectors not visible */}
        {mapDisplayMode === 'sites' && !showSectors && visibleSites.map(site => {
          const color = getKpiColor(getCellKpiValue(site.cells[0] || {}));
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isFocusFaded = focusMode !== 'global' && !isSelectedSite;
          const radius = viewport.zoom >= 10 ? (isHovered ? 7 : (isSelectedSite ? 7 : 5)) : (isHovered ? 5 : 3);
          return (
            <CircleMarker
              key={site.site_id}
              center={site.coordinates}
              radius={radius}
              pathOptions={{
                color: isSelectedSite ? '#fff' : (isHovered ? '#fff' : 'hsl(var(--border))'),
                fillColor: isFocusFaded ? FADED_COLOR : color,
                fillOpacity: isFocusFaded ? 0.25 : 0.85,
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
                  <div className="text-sm font-bold mt-2" style={{ color }}>
                    {selectedKpiLabel}: {((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0).toFixed(1)}
                  </div>
                  <div className="text-xs mt-1">{site.cell_count} cells • {site.dor}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Detailed sectors (only when zoomed in, sites mode) — professional low-opacity with strokes */}
        {showSectors && visibleSites.map(site => {
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const zoomRadius = getZoomAwareRadius(site.coordinates[0], viewport.zoom) * (0.5 + 0.5 * (beamVisibility / 100));
          const baseOverlap = visibleSites.length > 200 ? 0.18 : visibleSites.length > 80 ? 0.25 : 0.35;
          const beamScale = beamVisibility / 100;
          const overlapFactor = baseOverlap + (1 - baseOverlap) * beamScale;
          const isFocusFaded = focusMode !== 'global' && !isSelectedSite;

          /* ── ALL mode: technology-only (no bands), fixed radii ── */
          if (mapTechnoFilter === 'ALL') {
            // Step 1: Group cells by technology, collect unique azimuths
            const techAzimuths = new Map<string, Set<number>>();
            for (const cell of site.cells) {
              const tech = (cell.techno || '').toUpperCase().includes('5G') ? '5G' : '4G';
              if (!techAzimuths.has(tech)) techAzimuths.set(tech, new Set());
              techAzimuths.get(tech)!.add(cell.azimut ?? 0);
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
            if (has4G) {
              allAzimuths.forEach(az => {
                // Only draw 4G on azimuths where 4G exists
                if (techAzimuths.get('4G')!.has(az)) {
                  renderItems.push({ tech: '4G', az, radius: R_4G });
                }
              });
            }
            if (has5G) {
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
                  const fillColor = isFocusFaded ? FADED_COLOR : (bandColors[groupColorKey] || (tech === '5G' ? '#a855f7' : '#f97316'));
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
                const sectorCoords = getSectorCoords(site.coordinates, cell.azimut, cellRadius, 60);
                const isFaded = (mapTechnoFilter === '5G' && !is5G) || (mapTechnoFilter === '4G' && is5G);
                const fillColor = isFaded || isFocusFaded ? FADED_COLOR : (sectorColorMode === 'topo' ? getBandColor(cell.bande, cell.techno) : getKpiColor(getCellKpiValue(cell)));
                const strokeColor = isFaded || isFocusFaded ? '#cbd5e1' : (sectorColorMode === 'topo' ? getBandStrokeColor(cell.bande, cell.techno) : fillColor);
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
                          <div className="flex justify-between"><span className="opacity-50">Tilt</span><span className="font-bold">{(cell as any).remote_electrical_tilt ?? '—'}°</span></div>
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
                {viewport.zoom >= 15 && (
                  <Tooltip direction="bottom" offset={[0, 4]} permanent className="site-name-label-clean">
                    <span style={{
                      fontSize: viewport.zoom >= 17 ? '10px' : '8px',
                      fontWeight: 500,
                      letterSpacing: '0.03em',
                      color: '#4B5563',
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
        {highlightedCellData.length > 0 && (
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
                    <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '11px' }}>#{i + 1} {val.toFixed(1)}</span>
                  </Tooltip>
                  <Popup>
                    <div className="p-1 min-w-[180px]">
                      <div className="font-bold text-sm text-red-600">⚠️ Worst #{i + 1}</div>
                      <div className="font-bold text-sm mt-1">{h.site.site_name}</div>
                      <div className="text-xs text-gray-500">{h.cell.cell_id}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{h.cell.techno} • {h.cell.bande} MHz • {h.cell.azimut}°</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs"><span>QoE</span><span className="font-bold" style={{ color: getKpiColor(h.cell.qoe_score_avg) }}>{h.cell.qoe_score_avg.toFixed(1)}%</span></div>
                        <div className="flex justify-between text-xs"><span>Débit DL</span><span className="font-bold">{h.cell.p50_thr_dn_mbps.toFixed(1)} Mbps</span></div>
                        <div className="flex justify-between text-xs"><span>RTT P95</span><span className="font-bold">{h.cell.p95_rtt_ms.toFixed(0)} ms</span></div>
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
      </MapContainer>

      {/* Floating simulation button when site is selected */}
      {!showCoverageSim && siteDetail && focusMode !== 'global' && (
        <button
          onClick={() => handleLaunchCoverageSim(siteDetail)}
          className="absolute bottom-20 left-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all text-[11px] font-extrabold uppercase tracking-wider"
        >
          <Signal size={14} />
          Simulation Couverture
        </button>
      )}

      {/* Coverage simulation panel */}
      {showCoverageSim && (
        <CoverageSimPanel
          site={coverageSite}
          onSimulate={handleCoverageSimulate}
          onClear={handleCoverageClear}
          isSimulating={coverageSimulating}
          onClose={() => { setShowCoverageSim(false); setCoverageGrid(null); }}
        />
      )}

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

      {/* Floating info badge — site count + zoom level */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg px-5 py-2.5 flex items-center gap-4">
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
        </div>
      </div>

      {/* ── Dashboard Selector — top left floating ── */}
      {viewMode === 'map' && (
        <div className="absolute top-4 left-[416px] z-[1001] pointer-events-auto" style={{ maxWidth: 260 }}>
          <div className="relative">
            <button
              onClick={() => setShowDashboardDropdown(!showDashboardDropdown)}
              className="bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 hover:bg-muted/80 transition-all w-full"
            >
              <FolderOpen size={13} className="text-primary shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground truncate flex-1 text-left">
                {activeDashboard ? activeDashboard.name : 'No Dashboard'}
              </span>
              <ChevronDown size={12} className={`text-muted-foreground transition-transform ${showDashboardDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDashboardDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden z-[1002] max-h-[300px] overflow-y-auto">
                {/* No dashboard option */}
                <button
                  onClick={() => { setActiveDashboardId(null); localStorage.removeItem('qoebit_active_dashboard'); setShowDashboardDropdown(false); }}
                  className={`w-full px-3 py-2.5 text-left text-[10px] font-bold transition-all flex items-center gap-2 ${
                    !activeDashboardId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <X size={11} className="shrink-0" />
                  <span className="uppercase tracking-widest">Aucun</span>
                </button>
                {dashboardList.map(db => (
                  <button
                    key={db.id}
                    onClick={() => loadDashboardSettings(db.id)}
                    className={`w-full px-3 py-2.5 text-left text-[10px] font-bold transition-all flex items-center gap-2 ${
                      activeDashboardId === db.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <LayoutGrid size={11} className="shrink-0 text-primary/60" />
                    <span className="truncate flex-1">{db.name}</span>
                    {activeDashboardId === db.id && <Check size={12} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Floating top bar — redesigned KPI selector with grouped tabs */}
      <div className="absolute top-14 left-[416px] right-[466px] z-[1000] pointer-events-auto">
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-2 overflow-x-auto">
          {/* Sector color mode toggle */}
          <div className="flex items-center bg-muted/80 rounded-xl overflow-hidden border border-border/50 shrink-0">
            <button
              onClick={() => setSectorColorMode('kpi')}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-l-xl ${
                sectorColorMode === 'kpi'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap size={11} />
              QoE
            </button>
            <button
              onClick={() => setSectorColorMode('topo')}
              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-r-xl ${
                sectorColorMode === 'topo'
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md shadow-violet-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Radio size={11} />
              Topo
            </button>
          </div>

          <span className="w-px h-6 bg-border/50 shrink-0" />

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
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
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

          <span className="w-px h-6 bg-border/50 shrink-0" />

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
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
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

          <span className="w-px h-6 bg-border/50 shrink-0" />

          {/* Plus dropdown for TCP/RTT/Volume */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowKpiDropdown(!showKpiDropdown)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 border ${
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
              <div className="absolute top-10 right-0 w-[300px] bg-card/98 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden">
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

          <span className="w-px h-6 bg-border/50 shrink-0" />

          {/* Map Views Manager */}
          <MapViewManager
            currentSettings={getCurrentMapSettings()}
            onLoadView={handleLoadView}
          />
        </div>
      </div>

      {/* Floating bottom-right: techno filter + layer switcher + legend */}
      {viewMode === 'map' && (
        <div className="absolute bottom-6 right-6 z-[1000] pointer-events-auto flex items-end gap-2">
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
                      { key: '5G_GROUP', label: '5G', defaultColor: '#a855f7' },
                      { key: '4G_GROUP', label: '4G', defaultColor: '#f97316' },
                    ].map(({ key, label, defaultColor }) => (
                      <div key={key} className="flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded" style={{ background: bandColors[key] || defaultColor }} />
                        <span className="text-[11px] font-bold text-foreground flex-1">{label}</span>
                        <label className="w-5 h-5 rounded-full border border-border/50 cursor-pointer overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: bandColors[key] || defaultColor }} title={`Change ${label} color`}>
                          <input type="color" value={bandColors[key] || defaultColor} onChange={(e) => updateBandColor(key, e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                        </label>
                      </div>
                    ))}
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
                  { id: 'sites' as const, label: 'Sites', icon: <MapPin size={12} /> },
                  { id: 'dashboard' as const, label: activeDashboard ? activeDashboard.name : 'Dashboard', icon: <LayoutGrid size={12} /> },
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
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Site</span>
                    <select value={localSite} onChange={(e) => setLocalSite(e.target.value)}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                      {uniqueSiteNames.slice(0, 500).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Site List (sites tab) ── */}
              {inventoryTab === 'sites' && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {filteredSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search size={28} className="mb-3 opacity-20" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">No sites found</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSites.slice(0, 100).map(site => {
                      const isSelected = selectedSiteId === site.site_id;
                      const isExpanded = isSelected;
                      // Group cells by sector
                      const sectors = new Map<number, typeof site.cells>();
                      site.cells.forEach(c => {
                        const sNum = getSectorNumber(c.cell_id);
                        if (!sectors.has(sNum)) sectors.set(sNum, []);
                        sectors.get(sNum)!.push(c);
                      });
                      const sortedSec = Array.from(sectors.entries()).sort(([a], [b]) => a - b);

                      return (
                        <div
                          key={site.site_id}
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
                              <div className="text-[15px] font-black tracking-tight" style={{ color: getKpiColor((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0) }}>
                                {((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0).toFixed(1)}
                              </div>
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase">{site.cell_count} cells</div>
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
                                          {sectorAvgKpi.toFixed(1)}
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
                                            {getCellKpiValue(cell).toFixed(1)}
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
               {inventoryTab === 'dashboard' && (
                <DashboardInventoryTab
                  onApplyView={(settings) => {
                    if (settings.mapLayer) setMapLayer(settings.mapLayer);
                    if (settings.mapKpi) setMapKpi(settings.mapKpi);
                    if (settings.center && Array.isArray(settings.center)) {
                      setFlyTarget(settings.center as [number, number]);
                    }
                    if (settings.mapTechnoFilter) {
                      // Apply tech filter if present
                    }
                  }}
                  beamVisibility={beamVisibility}
                  onBeamVisChange={(v) => { setBeamVisibility(v); localStorage.setItem('qoebit_beam_visibility', String(v)); }}
                  onSaveDashboard={(dbId) => saveDashboardSettings(dbId)}
                  onLoadDashboard={(dbId) => loadDashboardSettings(dbId)}
                  isSaving={dashboardSaving}
                />
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
                      <div className="text-[16px] font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{site.qoe_score_avg.toFixed(1)}%</div>
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
                        <div className="text-lg font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{site.qoe_score_avg.toFixed(1)}%</div>
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

      {/* RIGHT SIDE PANEL — Professional NOC Topology Panel */}
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

          {/* ========== GLOBAL MODE ========== */}
          {focusMode === 'global' && (() => {
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
                        <div className="text-[17px] font-black" style={{ color: getKpiColor(m.value) }}>{m.value.toFixed(1)}%</div>
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
                        {avgQoE.toFixed(1)}%
                      </div>
                      <div className="w-14 h-1 rounded-full mx-auto mt-2.5" style={{ background: getKpiColor(avgQoE) }} />
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <ChevronDown size={16} className="text-primary" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit DL</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {avgDl.toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                      </div>
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <ChevronUp size={16} className="text-primary" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Débit UL</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {avgUl.toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">M</span>
                      </div>
                    </div>
                    <div className="bg-muted/20 rounded-xl border border-border px-3 py-5 text-center flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                        <Zap size={16} className="text-amber-500" />
                      </div>
                      <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">RTT</div>
                      <div className="text-[24px] font-black text-foreground leading-tight mt-0.5">
                        {avgRtt.toFixed(0)}<span className="text-[11px] font-bold text-muted-foreground ml-0.5">MS</span>
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
                            <span className="font-bold" style={{ color: getKpiColor(ts.avgQoE) }}>{ts.avgQoE.toFixed(1)}%</span>
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
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: getKpiColor(bs.avgQoE) }}>{bs.avgQoE.toFixed(1)}%</td>
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
                  {/* Warning indicator */}
                  <div className="shrink-0">
                    <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[18px] border-l-transparent border-r-transparent border-b-amber-400" />
                  </div>
                </div>
              </div>

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
                      <div className="text-[17px] font-black" style={{ color: getKpiColor(m.value) }}>{m.value.toFixed(1)}%</div>
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
                          <div className="text-[14px] font-extrabold" style={{ color: getKpiColor(m.value) }}>{m.value.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>

                    {/* QoE + DL + UL + RTT */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-muted/30 rounded-xl border border-border px-2 py-3 text-center">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">QoE</div>
                        <div className="text-[22px] font-black leading-none mt-1" style={{ color: getKpiColor(cell.qoe_score_avg) }}>
                          {cell.qoe_score_avg.toFixed(1)}%
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
                          { label: 'E-Tilt', value: `${(cell as any).remote_electrical_tilt ?? '—'}°` },
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
                            <td className="px-2 py-1.5 text-center font-bold text-foreground">{(c as any).remote_electrical_tilt ?? '—'}°</td>
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
                      const tilts = cells.map(c => (c as any).remote_electrical_tilt as number | null).filter((t): t is number => t != null);
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
                              const eTilt = (c as any).remote_electrical_tilt as number | null;
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
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-widest mb-2">Design Summary</h5>
                  <div className="space-y-1.5 text-[11px]">
                    {(() => {
                      const findings: { icon: string; text: string; color: string }[] = [];
                      // Check sector count
                      const sectorCount = sortedSectors.length;
                      findings.push({ icon: '📡', text: `${sectorCount}-sector site with ${siteDetail.cell_count} cells`, color: 'text-foreground' });
                      // Check tilt coherence per sector
                      sortedSectors.forEach(([sNum, cells]) => {
                        const tilts = cells.map(c => (c as any).remote_electrical_tilt as number | null).filter((t): t is number => t != null);
                        if (tilts.length >= 2) {
                          const delta = Math.max(...tilts) - Math.min(...tilts);
                          if (delta > 3) {
                            findings.push({ icon: '⚠', text: `S${sNum}: Tilt delta ${delta}° exceeds 3° threshold`, color: 'text-red-400' });
                          } else if (delta > 0) {
                            findings.push({ icon: '✓', text: `S${sNum}: Tilt delta ${delta}° — acceptable`, color: 'text-amber-400' });
                          } else {
                            findings.push({ icon: '✓', text: `S${sNum}: Tilt aligned (${tilts[0]}°)`, color: 'text-emerald-400' });
                          }
                        }
                      });
                      // Check if multi-band with same azimuth
                      sortedSectors.forEach(([sNum, cells]) => {
                        const azimuths = [...new Set(cells.map(c => c.azimut))];
                        if (azimuths.length > 1) {
                          findings.push({ icon: '⚠', text: `S${sNum}: Multiple azimuths detected (${azimuths.join('°, ')}°)`, color: 'text-amber-400' });
                        }
                      });
                      // 5G co-location check
                      const has5G = siteDetail.cells.some(c => (c.techno || '').includes('5G'));
                      const has4G = siteDetail.cells.some(c => !(c.techno || '').includes('5G'));
                      if (has5G && has4G) {
                        findings.push({ icon: '🔗', text: '5G/4G co-located — verify inter-tech tilt strategy', color: 'text-primary' });
                      }
                      return findings.map((f, i) => (
                        <div key={i} className={`flex items-start gap-2 ${f.color}`}>
                          <span>{f.icon}</span>
                          <span>{f.text}</span>
                        </div>
                      ));
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
                        {cell.qoe_score_avg.toFixed(1)}%
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
                            <div className="text-[16px] font-extrabold" style={{ color: getKpiColor(m.value) }}>{m.value.toFixed(1)}%</div>
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
                            {cell.qoe_score_avg.toFixed(1)}%
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
                        { label: 'E-Tilt', value: (cell as any).remote_electrical_tilt != null ? `${(cell as any).remote_electrical_tilt}°` : '—' },
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
    tilt: params.tilt ?? (activeCell as any).remote_electrical_tilt ?? defaults.tilt ?? 4,
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
        const { data, error } = await supabase
          .from('qoe_metrics')
          .select('dt, qoe_score_avg, dms_dl_3, dms_dl_8, dms_dl_30, dms_ul_3, p50_thr_dn_mbps, p50_thr_up_mbps, p95_rtt_ms, cell_id, site_id')
          .or(`site_id.eq.${siteDetail.site_id},${cellIds.map((id: string) => `cell_id.eq.${id}`).join(',')}`)
          .order('dt', { ascending: true })
          .limit(500);

        if (error || !data || data.length === 0) {
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
