import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { dashboardsApi, mapViewsApi, qoeMetricsApi, topoApi } from '@/lib/localDb';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';
import { useMapSitesStore } from "@/stores/mapSitesStore";
import { ActiveFilter, FILTER_DIMENSIONS, resolveAvailableValues } from '@/config/filterDimensions';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Tooltip, useMapEvents, Marker, Polyline, Circle } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { useTerrainProfile } from '@/hooks/useTerrainProfile';
import { useFresnel } from '@/hooks/useFresnel';
import { haversineDistance, LatLng, bearing } from '@/utils/geodesicUtils';
import { is5GTech, is4GTech, getCellTechGroup, normalizeSiteKey, resolveCanonicalSiteId, stableCellKey, computeMapAggregation } from '@/utils/telecomHelpers';
import ProfileChart, { ProfileHoverData } from './radio-profile/ProfileChart';
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
import { InlineSimTab, SiteKpiChart } from './SitesMonitorHelpers';
import { ViewFilterBuilder, ViewFilterCondition, conditionsToSiteFilters, siteFiltersToConditions } from '@/components/sites-monitor/ViewFilterBuilder';
import SiteChangesPanel from './SiteChangesPanel';
import { siteMatchesViewConditions, hasAnyCellLevelCondition } from '@/lib/viewFilterHelpers';

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
import { normalizeCoordinates, fmtCoord } from '../../utils/coordinateHelpers';
import { getBandSizeScale, getBandRenderOrder } from './map/sectorSizing';
import { ColorViewMode, COLOR_VIEW_LABELS, buildColorMap, getSiteDimensionValue, getColorForValue } from './map/colorByDimension';
import { TaggedLink, loadTaggedLinks, persistTaggedLinks, createTaggedLink } from './map/taggedLinks';
import { CellNeighbor, NeighborDirection, NeighborRelationType, NEIGHBOR_COLORS, NEIGHBOR_LABELS, generateMockNeighbors } from './map/neighborTypes';
import { invalidateSitesCache } from '../../services/mockData';
import { fetchSitesByBbox, fetchCellsByBbox, invalidateBboxCache, BboxQuery, fetchDashboardSites, fetchSiteCells, invalidateDashboardSitesCache, invalidateSiteCellsCache, getCachedDashboardSites } from '../../services/topoService';
import { BboxFilters } from '@/lib/localDb';
import { SiteSummary, SiteDetail, Filters, CellProperties } from '../../types';
import {
  Search, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  SlidersHorizontal, ChevronRight, LayoutGrid, List, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen, Filter, X, Maximize2, Minimize2,
  ChevronDown, ChevronUp, BarChart2, Signal, Settings2,
  Crosshair, MousePointerClick, Radio, Plus, Minus, Star, Trash2, Check, Play, RotateCcw, Save, FolderOpen, MoreVertical, Archive, CheckCircle2, Tag,
  Bell, FileText, AlertTriangle, Layers, Palette, Pencil, CircleDot, Ruler, Pentagon, Target
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
  // NR (5G) — green tones
  NR3500: '#22c55e',
  NR700:  '#16a34a',
  NR2100: '#15803d',
  // LTE (4G) — orange tones
  L2600:  '#f97316',
  L2100:  '#fb923c',
  L1800:  '#ea580c',
  L800:   '#fdba74',
  L700:   '#c2410c',
  // Group header colors
  '5G_GROUP': '#22c55e',
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

// is5GTech, is4GTech, getCellTechGroup are now imported from @/utils/telecomHelpers

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

// Sector radius in meters — adaptive to zoom, density, and viewport
const getZoomAwareRadius = (
  lat: number,
  zoom: number,
  densityFactor: number = 1, // 0..1 — lower = denser area = smaller sectors
  viewportWidth: number = 1400, // CSS px
): number => {
  // Zoom-based target pixel size: compact at low zoom, larger at high zoom
  let targetPx: number;
  if (zoom <= 9) targetPx = 22;
  else if (zoom <= 10) targetPx = 28;
  else if (zoom <= 11) targetPx = 34;
  else if (zoom <= 12) targetPx = 38;
  else targetPx = 42;

  // Viewport scaling: shrink on small screens, slight grow on large
  const vpScale = Math.max(0.7, Math.min(1.1, viewportWidth / 1400));
  targetPx *= vpScale;

  // Density scaling: reduce size in crowded areas (densityFactor 0→0.5x, 1→1x)
  const densityScale = 0.5 + 0.5 * Math.max(0, Math.min(1, densityFactor));
  targetPx *= densityScale;

  const mpp = metersPerPixel(lat, zoom);
  return Math.max(30, Math.min(1200, targetPx * mpp));
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

  // Try to derive tech from techno field (may be comma-separated or contain multiple values)
  const fallbackTech = String(site.techno || '').toUpperCase();
  let has5G = is5GTech(fallbackTech);
  let has4G = is4GTech(fallbackTech);

  // Also check bande field for tech hints
  const bande = String((site as any).bande || '').toUpperCase();
  if (bande.includes('NR') || bande.includes('N78') || bande.includes('N28') || bande.includes('N1')) {
    has5G = true;
  }
  if (bande.includes('L') || bande.includes('B') || bande.includes('1800') || bande.includes('2600') || bande.includes('800') || bande.includes('700')) {
    if (!bande.includes('NR')) has4G = true;
  }

  // If no tech info at all, keep it unknown so filters can hide it correctly
  if (!has4G && !has5G) return { has4G: false, has5G: false };

  return { has4G, has5G };
};

const siteMatchesRequestedTech = (site: SiteSummary, tech: '5G' | '4G'): boolean => {
  const { has4G, has5G } = inferSiteTechState(site);
  return tech === '5G' ? has5G : has4G;
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

const getSiteDisplayBands = (site: SiteSummary): string[] => {
  const cellBands = site.cells.length > 0
    ? [...new Set(site.cells.map(c => String(c.bande || '').trim()).filter(Boolean))]
    : [];

  if (cellBands.length > 0) return cellBands;

  const siteBand = String((site as any).bande || '').trim();
  return siteBand ? [siteBand] : [];
};

const getSiteDisplayTechs = (site: SiteSummary): string[] => {
  const cellTechs = site.cells.length > 0
    ? [...new Set(site.cells.map(c => String(c.techno || '').trim()).filter(Boolean))]
    : [];

  if (cellTechs.length > 0) return cellTechs;

  const fallback: string[] = [];
  const siteTech = String(site.techno || '').trim();
  if (siteTech) fallback.push(siteTech);

  const { has4G, has5G } = inferSiteTechState(site);
  if (!siteTech) {
    if (has4G) fallback.push('4G');
    if (has5G) fallback.push('5G');
  }

  return [...new Set(fallback.filter(Boolean))];
};

const getRenderableCellsForSite = (
  site: SiteSummary,
  mapTechnoFilter: 'ALL' | '4G' | '5G' | 'OFF',
  enabledTechnos: Set<'4G' | '5G'>,
  isBandEnabled: (bande?: string | null, techno?: string | null) => boolean,
) => {
  if (!site.cells?.length || mapTechnoFilter === 'OFF') return [];

  return site.cells.filter(cell => {
    const techGroup = getCellTechGroup(cell.techno);
    if (!techGroup) return false;

    if (mapTechnoFilter === 'ALL') {
      if (!enabledTechnos.has(techGroup)) return false;
    } else if (techGroup !== mapTechnoFilter) {
      return false;
    }

    return isBandEnabled(cell.bande, cell.techno);
  });
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
    // Keep current zoom if already reasonably close; only bump if very far out
    const targetZoom = currentZoom < 10 ? 13 : currentZoom;
    const currentCenter = map.getCenter();
    const dist = map.distance(currentCenter, coords);

    onFlyStartRef.current?.();

    const handler = () => {
      onFlyEndRef.current?.();
      onDoneRef.current?.();
    };

    if (dist < 300 && Math.abs(currentZoom - targetZoom) < 1) {
      // Very close — gentle pan only
      map.panTo(coords, { duration: 0.3, animate: true });
      map.once('moveend', handler);
      return () => {
        map.off('moveend', handler);
      };
    }

    if (dist < 5000 && Math.abs(currentZoom - targetZoom) < 2) {
      // Nearby — smooth pan without zoom change
      map.panTo(coords, { duration: 0.5, animate: true });
      map.once('moveend', handler);
      return () => {
        map.off('moveend', handler);
      };
    }

    map.flyTo(coords, targetZoom, { duration: 0.7 });
    map.once('moveend', handler);

    return () => {
      map.off('moveend', handler);
    };
  }, [coords, map]);

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

const CUSTOM_POINTS_KEY = 'qoebit_custom_points';

function loadCustomPoints(): CustomMapPoint[] {
  try {
    const saved = localStorage.getItem(CUSTOM_POINTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function persistCustomPoints(points: CustomMapPoint[]) {
  try { localStorage.setItem(CUSTOM_POINTS_KEY, JSON.stringify(points)); } catch {}
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

const DistanceMeasureClickHandler: React.FC<{ active: boolean; onPick: (latlng: LatLng) => void }> = ({ active, onPick }) => {
  useMapEvents({
    click(e) {
      if (active) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
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

// Fit map to dashboard sites after loading
const FitToDashboardSites = ({ sites, fitKey }: { sites: SiteSummary[]; fitKey: number }) => {
  const map = useMap();
  const lastFitKeyRef = useRef<number>(0);
  useEffect(() => {
    if (fitKey <= 0 || fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;
    const validCoords = sites
      .filter(s => s.coordinates && Number.isFinite(s.coordinates[0]) && Number.isFinite(s.coordinates[1]) && (s.coordinates[0] !== 0 || s.coordinates[1] !== 0))
      .map(s => L.latLng(s.coordinates[0], s.coordinates[1]));
    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds.pad(0.15), { duration: 1.2, maxZoom: 13 });
    }
  }, [fitKey, sites, map]);
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
  backendFilterDefs?: { id: string; label: string; values: string[] }[];
  onSiteFiltersChange?: (filters: DashboardSiteFilters) => void;
}

const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({ settings, onUpdate, onRename, currentName, dashboardId, isShared, beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, onClose, onSetDashboards, backendFilterDefs, onSiteFiltersChange }) => {
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
    // Clean siteFilters
    const cleanSiteFilters: DashboardSiteFilters = {};
    for (const [k, v] of Object.entries(localSiteFilters)) {
      if (v && v.length > 0) (cleanSiteFilters as any)[k] = v;
    }
    onUpdate({ mapStyle: localMapStyle, themeMode: localThemeMode, mapLayer: localMapStyle, color: localColor, mapKpi: localKpis[0], mapKpis: localKpis, dataSource: localDataSource, viewFilters: localFilters, siteFilters: cleanSiteFilters, mapLabelFields: Array.from(mapLabelFields) });
    if (onSiteFiltersChange) onSiteFiltersChange(cleanSiteFilters);
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
          {backendFilterDefs && backendFilterDefs.length > 0 && (
            <div className="p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<Filter size={12} className="text-primary" />} title="Site Filters" subtitle="Filter sites displayed on the map" />
              <div className="space-y-1">
                {backendFilterDefs.map(dim => {
                  const selectedValues = localSiteFilters[dim.id as keyof DashboardSiteFilters] || [];
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

              {Object.values(localSiteFilters).some(v => v && (Array.isArray(v) ? v.length > 0 : !!v)) && (
                <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
                  <span className="text-[8px] font-bold text-primary/70 uppercase tracking-widest">Active Filters</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(localSiteFilters).filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : !!v)).map(([key, vals]) => (
                      <span key={key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-semibold text-primary border border-primary/10">
                        {key.startsWith('manual_') ? key.replace('manual_', '').toUpperCase() : (backendFilterDefs.find(d => d.id === key)?.label || key)}: {Array.isArray(vals) ? vals!.join(', ') : vals}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Map Rendering, Appearance, Labels ── */}
          {<>
          <div className="p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
            <SectionHeader icon={<MapIcon size={12} className="text-primary" />} title="Map Style" subtitle="Base layer rendering" />
            <div className="grid grid-cols-4 gap-1">
              {SETTINGS_MAP_STYLES.map(style => {
                const isActive = localMapStyle === style.value;
                return (
                  <button key={style.value} onClick={() => { setLocalMapStyle(style.value); setDirty(true); }}
                    className={`relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[8px] font-bold transition-all border ${isActive
                      ? 'bg-primary/10 text-primary border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]'
                      : 'bg-card/60 border-border/30 text-muted-foreground hover:text-foreground hover:border-border hover:bg-card'
                    }`}>
                    <span className="text-sm leading-none">{style.icon}</span>
                    <span className="uppercase tracking-wider">{style.label}</span>
                    {isActive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border border-card" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Appearance Row: Theme + Color side by side ── */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Theme Mode */}
            <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<SlidersHorizontal size={12} className="text-primary" />} title="Display Mode" />
              <div className="space-y-1.5">
                {SETTINGS_THEME_MODES.map(mode => {
                  const isActive = localThemeMode === mode.value;
                  return (
                    <button key={mode.value} onClick={() => { setLocalThemeMode(mode.value); setDirty(true); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border ${isActive
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

            {/* Theme Color */}
            <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<Crosshair size={12} className="text-primary" />} title="Accent Color" />
              <div className="grid grid-cols-4 gap-2 mt-1">
                {SETTINGS_PALETTE.map(c => {
                  const isActive = localColor === c.value;
                  return (
                    <button key={c.value || 'none'} onClick={() => { setLocalColor(c.value); setDirty(true); }}
                      className="flex items-center justify-center group" title={c.label}>
                      <div className={`w-7 h-7 rounded-full transition-all duration-150 ${isActive
                        ? 'scale-110 ring-2 ring-primary/40 ring-offset-2 ring-offset-card shadow-md'
                        : 'hover:scale-105 ring-1 ring-border/40 hover:ring-border'
                      }`} style={{ background: c.value || 'hsl(var(--muted))' }} />
                    </button>
                  );
                })}
              </div>
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
                { key: 'techno', label: 'Techno', icon: '⚡' },
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

          {/* ── Quick Actions ── */}
          {(onSaveDashboard || onLoadDashboard) && (
            <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
              <SectionHeader icon={<Save size={12} className="text-primary" />} title="Quick Actions" subtitle="Save or restore map state" />
              <div className="grid grid-cols-2 gap-1.5">
                {onSaveDashboard && (
                  <button onClick={() => onSaveDashboard()} disabled={isSaving}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border border-primary/25 bg-primary/5 text-primary hover:bg-primary/10">
                    {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                    <span className="uppercase tracking-wider">Save State</span>
                  </button>
                )}
                {onLoadDashboard && (
                  <button onClick={() => onLoadDashboard()}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                    <FolderOpen size={12} />
                    <span className="uppercase tracking-wider">Restore</span>
                  </button>
                )}
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
              {dirty ? 'Save Changes' : 'Settings Saved'}
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

/** Merge two DashboardSiteFilters with AND logic (intersection for same keys) */
function mergeSiteFilters(dashboardFilters: DashboardSiteFilters | null, viewFilters: DashboardSiteFilters | null): DashboardSiteFilters {
  if (!dashboardFilters || Object.keys(dashboardFilters).length === 0) return viewFilters || {};
  if (!viewFilters || Object.keys(viewFilters).length === 0) return dashboardFilters;
  const merged: DashboardSiteFilters = { ...dashboardFilters };
  for (const [key, viewVals] of Object.entries(viewFilters)) {
    if (!viewVals || viewVals.length === 0) continue;
    const dashVals = (merged as any)[key];
    if (dashVals && dashVals.length > 0) {
      // Intersection: keep only values present in both
      const intersection = dashVals.filter((v: string) => viewVals.includes(v));
      (merged as any)[key] = intersection.length > 0 ? intersection : viewVals; // If empty intersection, use view (will show no results)
    } else {
      (merged as any)[key] = viewVals;
    }
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
}

const AUTO_FILTER_DASHBOARD_NAME = /^Filtre \d{2}\/\d{2}\/\d{4}$/;

const dedupeAutoFilterDashboards = (items: any[]) => {
  return items.filter((item) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    return !AUTO_FILTER_DASHBOARD_NAME.test(name);
  });
};

const DashboardInventoryTab: React.FC<DashboardInventoryTabProps> = ({ onApplyView, onDashboardActiveChange, beamVisibility: beamVis, onBeamVisChange, onSaveDashboard, onLoadDashboard, isSaving, backendFilterDefs, activeDashboardId, onActiveDashboardIdChange, activeViewId, onActiveViewIdChange }) => {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [ldg, setLdg] = useState(true);
  const [mapViews, setMapViews] = useState<any[]>([]);
  const [showCreateView, setShowCreateView] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [newViewFilters, setNewViewFilters] = useState<DashboardSiteFilters>({});
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
    // Reset active view when switching dashboard
    onActiveViewIdChange(null);
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

  // Use backend filter defs for dashboard creation — fallback to static FILTER_DIMENSIONS if empty
  const filterDimensions = useMemo(() => {
    if (backendFilterDefs && backendFilterDefs.length > 0) return backendFilterDefs;
    // Fallback: build from static config
    const FALLBACK_KEYS = ['dor', 'constructeur', 'plaque', 'techno', 'bande', 'zone_arcep'];
    return FILTER_DIMENSIONS
      .filter(dim => FALLBACK_KEYS.includes(dim.key))
      .map(dim => {
        const vals = resolveAvailableValues(dim.key, []);
        return { id: dim.key, label: dim.label, values: vals.sort() };
      })
      .filter(d => d.values.length > 0);
  }, [backendFilterDefs]);

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
        dashboard_type: 'map',
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
      // Build clean siteFilters from newViewFilters
      const cleanFilters: DashboardSiteFilters = {};
      for (const [k, v] of Object.entries(newViewFilters)) {
        if (v && (v as string[]).length > 0) (cleanFilters as any)[k] = v;
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
            {/* Active filters summary */}
            {(() => {
              const db = dashboards.find(d => d.id === expandedDashboardId);
              const dbFilters = db ? extractSiteFilters(db) : null;
              const activeView = activeViewId ? mapViews.find(v => v.id === activeViewId) : null;
              const viewFilters = activeView?.settings?.siteFilters || null;
              const merged = mergeSiteFilters(dbFilters, viewFilters);
              const entries = Object.entries(merged).filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : !!v));
              if (entries.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 mt-1">
                  {entries.map(([key, vals]) => (
                    <span key={key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/10 text-[8px] font-semibold text-primary border border-primary/10">
                      {key.toUpperCase()}: {Array.isArray(vals) ? vals.join(', ') : String(vals)}
                    </span>
                  ))}
                  {activeView && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/20 text-[8px] font-semibold text-accent-foreground border border-accent/20">
                      Vue: {activeView.name}
                    </span>
                  )}
                </div>
              );
            })()}
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

              {/* Filter dimensions from backend (optional) */}
              {filterDimensions.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Filtres de sites <span className="text-muted-foreground/50 font-normal">(optionnel)</span></label>
                <p className="text-[9px] text-primary/70 italic mb-3">Sélectionnez les critères pour filtrer les sites affichés sur la carte</p>
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
              </div>
              )}

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
                    if (!isExpanded) requestDashboardSwitch(db.id);
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
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[12px] font-bold truncate ${isExpanded ? 'text-primary' : 'text-foreground'}`}>{db.name}</span>
                      {isExpanded && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[7px] font-bold uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Actif
                        </span>
                      )}
                    </div>
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
                {/* Ajouter une vue — opens dialog */}
                <div className="px-3 pt-1.5 pb-2">
                  <button
                    onClick={() => { setShowCreateView(db.id); setNewViewName(''); setNewViewFilters({}); }}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 text-[10px] font-bold text-primary/80 hover:text-primary transition-all"
                  >
                    <Plus size={11} />
                    Ajouter une vue
                  </button>
                </div>
                {/* Create View Dialog */}
                <Dialog open={showCreateView === db.id} onOpenChange={(open) => { if (!open) { setShowCreateView(null); setNewViewName(''); setNewViewFilters({}); } }}>
                  <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-sm font-black uppercase tracking-wider">View Configuration</DialogTitle>
                      <DialogDescription className="text-[10px] text-muted-foreground">Configure filters and display settings for the new view</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <ViewFilterBuilder
                        viewName={newViewName}
                        onViewNameChange={setNewViewName}
                        backendFilterDefs={backendFilterDefs}
                        initialConditions={siteFiltersToConditions(newViewFilters)}
                        saving={creating}
                        onSave={(conditions) => handleCreateViewWithConditions(db.id, conditions)}
                        onCancel={() => { setShowCreateView(null); setNewViewName(''); setNewViewFilters({}); }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>

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
                                  {isViewActive && <span className="text-[7px] px-1 py-0.5 rounded bg-primary/15 text-primary font-bold uppercase">actif</span>}
                                  {hasOwnSettings && <span className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent-foreground font-bold uppercase">custom</span>}
                                  {condCount > 0 && <span className="text-[7px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold">{condCount} filtre{condCount > 1 ? 's' : ''}</span>}
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
    </div>
  );
};

/** Extracted sub-component for Parameters tab in the right sidebar */
const SiteParametersTab: React.FC<{ siteName?: string | null }> = ({ siteName }) => {
  const [search, setSearch] = React.useState('');
  const [searchedParam, setSearchedParam] = React.useState<string | null>(null);
  const [paramData, setParamData] = React.useState<{ parameter: string; cell_name: string | null; value: string | null; bande: string | null; dn: string | null }[]>([]);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);

  // Reset on site change
  React.useEffect(() => {
    setSearch('');
    setSearchedParam(null);
    setParamData([]);
    setHasSearched(false);
  }, [siteName]);

  // Fetch when searchedParam changes
  React.useEffect(() => {
    if (!siteName || !searchedParam) { setParamData([]); return; }
    setDataLoading(true);
    setHasSearched(true);
    (async () => {
      let fetched = false;
      try {
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/site-params/${encodeURIComponent(siteName)}?parameter=${encodeURIComponent(searchedParam)}`), {
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
    if (search.trim()) setSearchedParam(search.trim());
  };

  // Group results by parameter name
  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof paramData>();
    for (const p of paramData) {
      const key = p.parameter;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [paramData]);

  if (!siteName) return <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">Sélectionnez un site</div>;

  return (
    <div className="space-y-3">
      {/* Search input + button */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
            placeholder="Nom du paramètre..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          onClick={doSearch}
          disabled={!search.trim()}
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
          Aucun résultat pour « {searchedParam} »
        </div>
      ) : (
        <>
          <div className="text-[9px] text-muted-foreground px-1">
            {paramData.length} entrée{paramData.length !== 1 ? 's' : ''} · {grouped.length} paramètre{grouped.length !== 1 ? 's' : ''}
          </div>
          <div className="max-h-[calc(100vh-480px)] overflow-y-auto space-y-1.5 pr-0.5">
            {grouped.map(([paramName, entries]) => (
              <div key={paramName} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                  <span className="text-[10px] font-black text-foreground truncate">{paramName}</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{entries.length}</span>
                </div>
                <div className="divide-y divide-border/30">
                  {entries.slice(0, 30).map((e, i) => (
                    <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-[10px]">
                      {e.cell_name && <span className="text-muted-foreground truncate max-w-[120px]" title={e.cell_name}>{e.cell_name}</span>}
                      {e.bande && <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-foreground/60 shrink-0">{e.bande}</span>}
                      <span className="ml-auto font-mono font-semibold text-foreground/90 truncate max-w-[120px] text-right" title={e.value || '—'}>{e.value || '—'}</span>
                    </div>
                  ))}
                  {entries.length > 30 && (
                    <div className="px-3 py-1 text-[9px] text-muted-foreground text-center">+{entries.length - 30} de plus</div>
                  )}
                </div>
              </div>
            ))}
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
            <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm shrink-0 mt-0.5 bg-orange-500">4G</span>
            <span className="text-foreground/80 leading-relaxed flex flex-wrap gap-1">
              {sc.bands_4g.split(',').map((b: string, i: number) => (
                <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{b.trim()}</span>
              ))}
            </span>
          </div>
        )}
        {sc.bands_5g && (
          <div className="px-3 py-2.5 text-[11px] flex items-start gap-2">
            <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm shrink-0 mt-0.5 bg-green-500">5G</span>
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

const SitesMonitor: React.FC<SitesMonitorProps> = ({ filters, onFilterChange, onCellSelect, highlightedCellIds = [], onClearHighlights, onLaunchAI }) => {
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
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
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
  const [mapKpi, setMapKpi] = useState('qoe_score_avg');
  const [showKpiDropdown, setShowKpiDropdown] = useState(false);
  const [inventorySortOrder, setInventorySortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [activeViewFilters, setActiveViewFilters] = useState<{ mode: string; kpi?: string; operator?: string; threshold?: number; tech?: string; attribute?: string; value?: string }[]>([]);
  const [activeViewConditions, setActiveViewConditions] = useState<ViewFilterCondition[]>([]);
  const [showLegend, setShowLegend] = useState(true);
  const [viewport, setViewport] = useState<ViewportState>({ bounds: null, zoom: mapCache.cachedZoom || 6 });
  const [initialCenter] = useState<[number, number] | null>(mapCache.cachedCenter);
  const displayModeRef = useRef<'sites' | 'cells'>('sites');
  const [mapRendering, setMapRendering] = useState(false);
  const [clusteringUnlocked, setClusteringUnlocked] = useState(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'sites' | 'points' | 'heatmap'>('sites');
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'satellite'>('light');
  const [showSiteLabels, setShowSiteLabels] = useState(false);
  const [mapLabelFields, setMapLabelFields] = useState<Set<string>>(() => new Set(['site_name']));
  const [showBeamSectors, setShowBeamSectors] = useState(true);
  const [activeMapTool, setActiveMapTool] = useState<'distance' | 'polygon' | 'radius' | null>(null);
  const [distanceMeasurePoints, setDistanceMeasurePoints] = useState<[number, number][]>([]);
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

  useEffect(() => {
    if (activeMapTool !== 'distance' && distanceMeasurePoints.length > 0) {
      setDistanceMeasurePoints([]);
    }
    if (activeMapTool !== 'polygon') {
      setPolygonPoints([]);
      setPolygonClosed(false);
    }
    if (activeMapTool !== 'radius') {
      setRadiusCenter(null);
    }
  }, [activeMapTool, distanceMeasurePoints.length]);

  const handleDistanceMeasureClick = useCallback((latlng: LatLng) => {
    const point: [number, number] = [latlng.lat, latlng.lng];
    setDistanceMeasurePoints(prev => (prev.length >= 2 ? [point] : [...prev, point]));
  }, []);

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

  const handleMapToolToggle = useCallback((tool: 'distance' | 'polygon' | 'radius') => {
    setDistanceMeasurePoints([]);
    setRadiusCenter(null);
    setRadiusConfirmed(false);
    setRadiusLiveMeters(0);
    setRadiusConfirmedMeters(0);
    setPolygonPoints([]);
    setPolygonClosed(false);
    setActiveMapTool(prev => (prev === tool ? null : tool));
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
    }
  }, [polygonPoints.length]);

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

    return { area, perimeter, fmtArea, fmtPerimeter, sitesInside: 0 };
  }, [polygonClosed, polygonPoints]);

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
  const [enabledTechnos, setEnabledTechnos] = useState<Set<'4G' | '5G'>>(new Set(['5G', '4G']));
  const [showBandPanel, setShowBandPanel] = useState(true);
  const [sectorColorMode, setSectorColorMode] = useState<'topo' | 'kpi'>('topo');
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
          }
        }

        for (const b of (stats.by_band || [])) {
          const band = b.band || 'Unknown';
          if (/^NR|^5G/i.test(band)) result.bandMap5G[band] = b.cells || 0;
          else result.bandMap4G[band] = b.cells || 0;
        }

        for (const v of (stats.by_vendor || [])) {
          result.vendorMap[v.vendor] = { '4G': v.cells_4g || v.cells || 0, '5G': v.cells_5g || 0 };
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
  const [loadingCellsForSite, setLoadingCellsForSite] = useState<string | null>(null);

  // Focus mode: 'global' | 'site' | 'cell'
  const [focusMode, setFocusMode] = useState<'global' | 'site' | 'cell'>('global');
  const [focusCellId, setFocusCellId] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<number>>(new Set());
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
  const [inventoryTab, setInventoryTab] = useState<'sites' | 'dashboard' | 'tagged'>('dashboard');

  // ── Tagged / pinned sites (persistent) ──
  const [taggedSites, setTaggedSites] = useState<SiteSummary[]>(() => {
    try {
      const saved = localStorage.getItem('qoebit_tagged_sites');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const persistTaggedSites = useCallback((next: SiteSummary[]) => {
    setTaggedSites(next);
    try { localStorage.setItem('qoebit_tagged_sites', JSON.stringify(next)); } catch {}
  }, []);
  const isSiteTagged = useCallback((siteId: string) => taggedSites.some(s => s.site_id === siteId), [taggedSites]);
  const toggleTagSite = useCallback((site: SiteSummary) => {
    setTaggedSites(prev => {
      const exists = prev.some(s => s.site_id === site.site_id);
      const next = exists ? prev.filter(s => s.site_id !== site.site_id) : [...prev, site];
      try { localStorage.setItem('qoebit_tagged_sites', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Custom Map Points ──
  const [customPoints, setCustomPoints] = useState<CustomMapPoint[]>(loadCustomPoints);
  const [pointCreationMode, setPointCreationMode] = useState(false);
  const [renamingPointId, setRenamingPointId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const addCustomPoint = useCallback((lat: number, lon: number) => {
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
      const next = [...prev, pt];
      persistCustomPoints(next);
      return next;
    });
    setPointCreationMode(false);
  }, []);

  const deleteCustomPoint = useCallback((id: string) => {
    setCustomPoints(prev => {
      const next = prev.filter(p => p.id !== id);
      persistCustomPoints(next);
      return next;
    });
  }, []);

  const renameCustomPoint = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomPoints(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: newName.trim() } : p);
      persistCustomPoints(next);
      return next;
    });
    setRenamingPointId(null);
    setRenameValue('');
  }, []);
  const [taggedLinks, setTaggedLinks] = useState<TaggedLink[]>(loadTaggedLinks);
  const [linkCreationMode, setLinkCreationMode] = useState(false);
  const [linkSource, setLinkSource] = useState<{ id: string; type: 'site' | 'point'; label: string; coords: [number, number] } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  const addTaggedLink = useCallback((from: typeof linkSource, to: typeof linkSource) => {
    if (!from || !to) return;
    const link = createTaggedLink(from, to);
    setTaggedLinks(prev => {
      const next = [...prev, link];
      persistTaggedLinks(next);
      return next;
    });
    setLinkCreationMode(false);
    setLinkSource(null);
  }, []);

  const deleteTaggedLink = useCallback((linkId: string) => {
    setTaggedLinks(prev => {
      const next = prev.filter(l => l.id !== linkId);
      persistTaggedLinks(next);
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
  const { loading: linkProfileLoading, profilePoints: linkProfilePoints, analysis: linkProfileAnalysis, computeProfile: linkComputeProfile } = useTerrainProfile();
  const [showLinkProfile, setShowLinkProfile] = useState(false);
  const [linkProfileLabel, setLinkProfileLabel] = useState('');
  const [linkProfileHover, setLinkProfileHover] = useState<ProfileHoverData | null>(null);
  const [linkEnableCurvature, setLinkEnableCurvature] = useState(true);
  const [linkEnableFresnel, setLinkEnableFresnel] = useState(false);
  const [linkEnableClutter, setLinkEnableClutter] = useState(false);
  const [linkClutterHeight, setLinkClutterHeight] = useState(0);
  const [linkActiveCoords, setLinkActiveCoords] = useState<{ from: [number, number]; to: [number, number] } | null>(null);

  const linkTotalDistance = useMemo(() => {
    if (!linkActiveCoords) return 0;
    return haversineDistance(
      { lat: linkActiveCoords.from[0], lng: linkActiveCoords.from[1] },
      { lat: linkActiveCoords.to[0], lng: linkActiveCoords.to[1] }
    );
  }, [linkActiveCoords]);

  const linkFresnel = useFresnel(linkProfilePoints, linkProfileAnalysis, linkTotalDistance, 1.8, linkEnableFresnel);

  const recomputeLinkProfile = useCallback((coords: { from: [number, number]; to: [number, number] }, curvature: boolean) => {
    const fromLL = { lat: coords.from[0], lng: coords.from[1] };
    const toLL = { lat: coords.to[0], lng: coords.to[1] };
    // Compute actual bearing so azimuth analysis is correct for point-to-point links
    const linkBearing = Math.round(bearing(fromLL, toLL) * 10) / 10;
    linkComputeProfile(
      fromLL,
      toLL,
      { hba: 30, mechTilt: 0, elecTilt: 0, totalTilt: 0, azimuth: linkBearing, hbw: 65, vbw: 7, frontToBackRatio: 25, rxHeight: 30, siteAltitude: 0, antennaAMSL: 30 },
      curvature
    );
  }, [linkComputeProfile]);

  const openLinkTerrainProfile = useCallback((link: TaggedLink) => {
    setSelectedLinkId(link.id);
    setLinkProfileLabel(link.label);
    setShowLinkProfile(true);
    const coords = { from: link.fromCoords, to: link.toCoords };
    setLinkActiveCoords(coords);
    recomputeLinkProfile(coords, linkEnableCurvature);
  }, [recomputeLinkProfile, linkEnableCurvature]);

  // ── Neighbor visualization ──
  const [neighborCellId, setNeighborCellId] = useState<string | null>(null);
  const [neighborDirection, setNeighborDirection] = useState<NeighborDirection>('out');
  const [neighborData, setNeighborData] = useState<CellNeighbor[]>([]);
  const [showNeighborPanel, setShowNeighborPanel] = useState(false);
  const [activeDashboardId, _setActiveDashboardId] = useState<string | null>(() => {
    try { return localStorage.getItem('qoebit_active_dashboard_id') || null; } catch { return null; }
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const setActiveDashboardId = useCallback((id: string | null) => {
    _setActiveDashboardId(id);
    // Reset active view when switching dashboard
    setActiveViewId(null);
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
  const [dashboardRefreshTick, setDashboardRefreshTick] = useState(0);
  const [dashboardFitKey, setDashboardFitKey] = useState(0);
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

  // Load available parameters from VPS backend, fallback to Supabase parameter_dump
  useEffect(() => {
    if (!paramPanelOpen || paramAvailable.length > 0) return;
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
  }, [paramPanelOpen]);

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
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/param-list?search=${encodeURIComponent(paramSearch)}&object_type=CELL&limit=50`), {
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

  const handleParamConfirm = useCallback(async () => {
    if (!paramSelected) return;
    setParamConfirmed(paramSelected);
    setParamMode(true);
    setParamLoading(true);
    setParamPanelOpen(false);
    try {
      const bbox = viewport.bounds
        ? `${viewport.bounds.getWest()},${viewport.bounds.getSouth()},${viewport.bounds.getEast()},${viewport.bounds.getNorth()}`
        : '-180,-90,180,90';
      // Parameter overlay fetches ALL matching data in viewport (no dashboard filters)
      const filterParams = new URLSearchParams();
      filterParams.set('param', paramSelected);
      filterParams.set('bbox', bbox);
      filterParams.set('limit', '10000');
      const paramMapUrl = getVpsProxyUrl('parser', `/api/v1/topo/param-map?${filterParams.toString()}`);
      console.log('[SitesMonitor] param-map request:', { param: paramSelected, bbox, filters: filterParams.toString(), url: paramMapUrl });
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
              parameter: paramSelected,
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

        // Auto-activate: restore persisted dashboard OR auto-select first available
        const persistedId = activeDashboardId;
        let targetDb: any = null;
        if (persistedId && cleaned.some((d: any) => d.id === persistedId)) {
          targetDb = cleaned.find((d: any) => d.id === persistedId);
        } else if (cleaned.length > 0) {
          // No persisted dashboard — auto-activate the first one
          targetDb = cleaned[0];
          setActiveDashboardId(targetDb.id);
        }
        if (targetDb) {
          setDashboardActive(true);
          const widgets = Array.isArray(targetDb.widgets) ? targetDb.widgets : [];
          const dashSettings = widgets.find((w: any) => w._type === 'dashboard_settings' || w.type === 'dashboard_settings' || w.dashboard_settings);
          const scope = dashSettings?.siteScope || dashSettings?.scope || dashSettings?.dashboard_settings?.scope || null;
          const siteFilters = dashSettings?.siteFilters || dashSettings?.dashboard_settings?.siteFilters || null;
          setActiveSiteScope(scope);
          setActiveDashboardFilters(siteFilters);
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

      // Preserve the currently selected site if it was added via search and isn't in the new bbox results
      setSites(prev => {
        const selectedId = selectedSiteIdRef.current;
        const selectedSite = selectedId ? prev.find(s => s.site_id === selectedId) : null;
        if (selectedSite && !(newSites || []).some(s => s.site_id === selectedId)) {
          return [selectedSite, ...(newSites || [])];
        }
        return newSites || [];
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

  // Debounced viewport change handler
  const handleViewportForFetch = useCallback((v: ViewportState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchForViewport(v.bounds, currentBboxFilters, v.zoom);
    }, 450);
  }, [fetchForViewport, currentBboxFilters]);

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
        const resp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/sites?search=${encodeURIComponent(term)}&limit=50`), {
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
        if (summaries.length > 0) setInventoryTab('tagged');

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
      // Don't clear sites if search is active — search results are separate
      setSites([]);
      setBboxTotal(0);
      setBboxLoading(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

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
          setDashboardFitKey(k => k + 1);
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
  }, [dashboardActive, activeDashboardFilters, activeSiteScope, dashboardRefreshTick]);

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
      if (c) queueMicrotask(() => mapCache.setMapPosition([c.lat, c.lng], v.zoom));
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
    const filtered = baseSites.filter(s => {
      const siteName = String(s.site_name ?? '');
      const siteId = String(s.site_id ?? '');
      const siteCells = Array.isArray(s.cells) ? s.cells : [];
      const matchesSearch = !searchTerm || siteName.toLowerCase().includes(searchTerm) || siteId.toLowerCase().includes(searchTerm) || siteCells.some(c => String(c.cell_id ?? '').toLowerCase().includes(searchTerm) || String(c.techno ?? '').toLowerCase().includes(searchTerm) || String(c.bande ?? '').toLowerCase().includes(searchTerm));
      const matchesDor = filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesPlaque = filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesVendor = filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDep = filters.department === 'ALL' || s.department === filters.department;
      // When cells are empty (bbox-loaded), rely on normalized site tech inference instead of hiding valid NR/LTE sites
      const matchesRat = filters.rat === 'ALL' || (siteCells.length > 0
        ? siteCells.some(c => getCellTechGroup(c.techno) === filters.rat)
        : siteMatchesRequestedTech(s, filters.rat as '4G' | '5G'));
      const matchesLocalVendor = localVendor === 'ALL' || s.vendor === localVendor;
      const matchesLocalDor = localDor === 'ALL' || s.dor === localDor;
      const matchesLocalPlaque = localPlaque === 'ALL' || s.plaque === localPlaque;
      const matchesLocalBande = localBande === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => c.bande === localBande) : !(s as any).bande || (s as any).bande === localBande);
      const matchesLocalZoneArcep = localZoneArcep === 'ALL' || (siteCells.length > 0 ? siteCells.some(c => (c as any).zone_arcep === localZoneArcep) : (s as any).zone_arcep === localZoneArcep);
      const matchesLocalTechno = localTechno === 'ALL' || (siteCells.length > 0
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
      const va = (a as any)[mapKpi] ?? a.qoe_score_avg ?? 0;
      const vb = (b as any)[mapKpi] ?? b.qoe_score_avg ?? 0;
      return inventorySortOrder === 'asc' ? va - vb : vb - va;
    });
  }, [sites, searchModeSites, isSearchActive, localSearch, filters, localVendor, localDor, localPlaque, localBande, localZoneArcep, localTechno, inventorySortOrder, mapKpi, activeViewFilters, activeViewConditions]);

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
      return filteredSites.filter(s => {
        if (enabledTechnos.has('5G') && siteMatchesRequestedTech(s, '5G')) return true;
        if (enabledTechnos.has('4G') && siteMatchesRequestedTech(s, '4G')) return true;
        return false;
      });
    }
    const tech = mapTechnoFilter as '5G' | '4G';
    return filteredSites.filter(s => siteMatchesRequestedTech(s, tech));
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
    sites.forEach(s => {
      getSiteDisplayBands(s).forEach(b => bandes.add(b));
    });
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

  // Density factor for adaptive sector sizing (0 = very dense, 1 = sparse)
  const sectorDensityFactor = useMemo(() => {
    const count = visibleSites.length;
    if (count > 500) return 0;
    if (count > 300) return 0.15;
    if (count > 150) return 0.3;
    if (count > 80) return 0.5;
    if (count > 30) return 0.7;
    return 1;
  }, [visibleSites.length]);

  // Viewport width for responsive sector sizing
  const vpWidth = typeof window !== 'undefined' ? window.innerWidth : 1400;


  // Determine if we have cell-level view conditions that require cell data
  const hasCellLevelConditions = useMemo(
    () => hasAnyCellLevelCondition(activeViewConditions),
    [activeViewConditions],
  );

  // Clear cell cache when filters change
  const prevBboxFiltersRef = useRef<string>('');
  useEffect(() => {
    const filterKey = JSON.stringify(currentBboxFilters);
    if (prevBboxFiltersRef.current && prevBboxFiltersRef.current !== filterKey) {
      cellLoadAttemptedRef.current.clear();
      cellLoadingRef.current.clear();
      invalidateBboxCache();
    }
    prevBboxFiltersRef.current = filterKey;
  }, [currentBboxFilters]);

  useEffect(() => {
    // Load cells when in cells display mode OR when cell-level view conditions are active
    if (displayMode !== 'cells' && !hasCellLevelConditions) return;
    if (!viewport.bounds) return;

    const sitesNeedingCells = visibleSites.filter(
      s => s.cells.length === 0 && !cellLoadingRef.current.has(s.site_id) && !cellLoadAttemptedRef.current.has(s.site_id)
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
        const cellSites = await fetchCellsByBbox(bboxQuery, currentBboxFilters);

        // Build a lookup by site_id
        const cellMap = new Map<string, any[]>();
        for (const cs of cellSites) {
          if (cs.cells && cs.cells.length > 0) {
            cellMap.set(cs.site_id, cs.cells);
          }
        }

        // Fallback: if bulk load returns nothing, load per-site but capped & throttled
        if (cellMap.size === 0 && sitesNeedingCells.length > 0) {
          const MAX_FALLBACK = 30; // Load up to 30 individual sites
          const CONCURRENCY = 5;
          const DELAY_MS = 500; // pause between batches
          const queue = sitesNeedingCells.slice(0, MAX_FALLBACK);

          while (queue.length > 0) {
            const batch = queue.splice(0, CONCURRENCY);
            const batchResults = await Promise.all(
              batch.map(async (site) => {
                try {
                  const cells = await fetchSiteCells(site.site_id);
                  return { siteId: site.site_id, cells };
                } catch {
                  return { siteId: site.site_id, cells: [] as any[] };
                }
              })
            );
            for (const r of batchResults) {
              if (r.cells.length > 0) cellMap.set(r.siteId, r.cells);
            }
            if (queue.length > 0) await new Promise(r => setTimeout(r, DELAY_MS));
          }
        }

        // Ultimate fallback: synthesize approximate sectors from site-level lte_cells/nr_cells
        // when ALL VPS cell endpoints fail (timeout / empty)
        if (cellMap.size === 0) {
          console.warn('[SitesMonitor] All cell endpoints failed — generating synthetic sectors from site metadata');
          for (const site of sitesNeedingCells) {
            const lte = site.lte_cells || 0;
            const nr = site.nr_cells || 0;
            if (lte === 0 && nr === 0) continue;
            const syntheticCells: any[] = [];
            const azimuths = [0, 120, 240]; // standard tri-sector
            // Generate 4G synthetic cells
            if (lte > 0) {
              const bandsPerSector = Math.max(1, Math.round(lte / 3));
              const defaultBands4G = ['L800', 'L1800', 'L2100', 'L2600', 'L700'];
              for (let s = 0; s < 3; s++) {
                for (let b = 0; b < bandsPerSector && b < defaultBands4G.length; b++) {
                  syntheticCells.push({
                    cell_id: `${site.site_id}_LTE_S${s + 1}_${defaultBands4G[b]}`,
                    cell_name: `${site.site_id}_LTE_S${s + 1}_${defaultBands4G[b]}`,
                    techno: '4G',
                    bande: defaultBands4G[b],
                    vendor: site.vendor || 'Unknown',
                    azimut: azimuths[s],
                    tilt: null,
                    pci: null, eci: null, nci: null, cid: null, tac: null,
                    etat_cellule: null, essentiel: null,
                    _synthetic: true,
                  });
                }
              }
            }
            // Generate 5G synthetic cells
            if (nr > 0) {
              const bandsPerSector5G = Math.max(1, Math.round(nr / 3));
              const defaultBands5G = ['NR3500', 'NR700', 'NR2100'];
              for (let s = 0; s < 3; s++) {
                for (let b = 0; b < bandsPerSector5G && b < defaultBands5G.length; b++) {
                  syntheticCells.push({
                    cell_id: `${site.site_id}_NR_S${s + 1}_${defaultBands5G[b]}`,
                    cell_name: `${site.site_id}_NR_S${s + 1}_${defaultBands5G[b]}`,
                    techno: '5G',
                    bande: defaultBands5G[b],
                    vendor: site.vendor || 'Unknown',
                    azimut: azimuths[s],
                    tilt: null,
                    pci: null, eci: null, nci: null, cid: null, tac: null,
                    etat_cellule: null, essentiel: null,
                    _synthetic: true,
                  });
                }
              }
            }
            if (syntheticCells.length > 0) {
              cellMap.set(site.site_id, syntheticCells);
            }
          }
        }

        // Mark all as attempted (whether cells found or not) and clear loading flags
        sitesNeedingCells.forEach(s => {
          cellLoadingRef.current.delete(s.site_id);
          cellLoadAttemptedRef.current.add(s.site_id);
        });

        // Merge cells into sites — keep original cell_count (don't overwrite with 4G/5G-only count)
        setSites(prev => prev.map(s => {
          const cells = cellMap.get(s.site_id);
          return cells && cells.length > 0 ? { ...s, cells } : s;
        }));
      } catch (err) {
        console.warn('[SitesMonitor] Bulk cell load failed', err);
        sitesNeedingCells.forEach(s => {
          cellLoadingRef.current.delete(s.site_id);
          cellLoadAttemptedRef.current.add(s.site_id);
        });
        // Force re-render so filters re-evaluate with attempted flags
        setSites(prev => [...prev]);
      }
    }, 400);

    return () => {
      if (cellLoadDebounceRef.current) clearTimeout(cellLoadDebounceRef.current);
    };
  }, [displayMode, visibleSites, viewport.bounds, hasCellLevelConditions, currentBboxFilters]);


  const renderSites = useMemo(() => {
    const siteMatchesCurrentTechFilter = (site: SiteSummary) => {
      if (mapTechnoFilter === 'OFF') return false;

      if (mapTechnoFilter === 'ALL') {
        if (enabledTechnos.size === 0) return false;
        if (enabledTechnos.size === 2) return true;
        return (enabledTechnos.has('5G') && siteMatchesRequestedTech(site, '5G')) || (enabledTechnos.has('4G') && siteMatchesRequestedTech(site, '4G'));
      }

      return siteMatchesRequestedTech(site, mapTechnoFilter as '5G' | '4G');
    };

    const merged = [...visibleSites];

    for (const ts of taggedSites) {
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
  }, [visibleSites, selectedSiteId, selectedSiteSnapshot, viewport.bounds, taggedSites, mapTechnoFilter, enabledTechnos, localZoneArcep]);

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
    // Don't fetch sites without an active dashboard
    // (previously this called handleViewportForFetch, loading sites via bbox even with no dashboard)
    if (v.zoom >= 8 && !clusteringUnlocked) {
      setClusteringUnlocked(true);
    }
    // Show loading when zooming changes visible sites — but NOT during fly animation
    if (v.zoom !== prevZoom && mapFilteredSites.length > 500 && !isFlyingRef.current) {
      setMapRendering(true);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = setTimeout(() => setMapRendering(false), 600);
    }
  }, [handleViewportChange, dashboardActive, viewport.zoom, mapFilteredSites.length, clusteringUnlocked]);

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

  const handleSiteClick = async (site: SiteSummary) => {
    // Toggle: clicking the already-selected site deselects it
    if (selectedSiteId === site.site_id) {
      handleBackToGlobal();
      return;
    }

    // Always load all cells for clicked site to ensure complete data
    let siteWithCells = site;
    if (site.site_name) {
      setLoadingCellsForSite(site.site_id);
      try {
        const cellResp = await fetch(getVpsProxyUrl('parser', `/api/v1/topo/sites-with-cells?q=${encodeURIComponent(site.site_name)}&limit=500`), {
          headers: getVpsProxyHeaders(),
        });
        const cellData = await cellResp.json();
        const matchSite = (cellData.sites || []).find((cs: any) => cs.site_name === site.site_name);
        if (matchSite && matchSite.cells && matchSite.cells.length > 0) {
          const cells = (matchSite.cells || []).map((c: any) => ({
            cell_id: c.nom_cellule || c.cell_name,
            cell_name: c.nom_cellule || c.cell_name || '',
            techno: c.techno || '4G',
            band: c.bande || '',
            bande: c.bande || '',
            vendor: c.constructeur || '',
            azimut: c.azimut != null ? Number(c.azimut) : null,
            tilt: c.tilt != null ? Number(c.tilt) : null,
            pci: c.pci || null,
            eci: c.eci || null,
            tac: c.tac || null,
            etat_cellule: c.etat_cellule || null,
            nci: c.nci || null,
            freq: c.freq || null,
            zone_arcep: matchSite.zone_arcep || c.zone_arcep || null,
            plaque: matchSite.plaque || c.plaque || null,
          }));
          siteWithCells = {
            ...site,
            cells,
            cell_count: cells.length || site.cell_count,
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
        }
      } catch (err) {
        console.warn('[SitesMonitor] Failed to load cells on site click', err);
      } finally {
        setLoadingCellsForSite(null);
      }
    }

    setSelectedSiteSnapshot(siteWithCells);
    setFlyTarget(siteWithCells.coordinates);
    setSelectedSiteId(siteWithCells.site_id);
    setFocusMode('site');
    setFocusCellId(null);
    // Auto-expand only the first sector by default
    const sectorNums = Array.from(new Set(siteWithCells.cells.map(c => getSectorNumber(c.cell_id)))).sort((a, b) => a - b);
    setExpandedSectors(new Set(sectorNums.length > 0 ? [sectorNums[0]] : []));
    setShowRightPanel(true);
    // Ensure inventory panel is open
    setPanelCollapsed(false);
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

  // Non-blocking loading banner — map stays interactive
  const loadingOverlay = (loading || bboxLoading) ? (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none animate-fade-in">
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-lg">
        <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {sites.length > 0
            ? `Chargement… ${sites.length.toLocaleString()} sites`
            : 'Chargement des sites…'}
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
        key={`map-${showBeamSectors ? 'beams' : 'nobeams'}-${mapDisplayMode}`}
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
        <CustomPointClickHandler active={pointCreationMode} onAdd={addCustomPoint} />
        <DistanceMeasureClickHandler active={activeMapTool === 'distance'} onPick={handleDistanceMeasureClick} />
        <RadiusClickHandler active={activeMapTool === 'radius'} center={radiusCenter} confirmed={radiusConfirmed} onSetCenter={handleRadiusSetCenter} onConfirm={handleRadiusConfirm} onPreview={handleRadiusPreview} />
        <PolygonClickHandler active={activeMapTool === 'polygon'} closed={polygonClosed} onPick={handlePolygonClick} onClose={handlePolygonDblClick} />
        {dashboardActive && dashboardFitKey > 0 && <FitToDashboardSites sites={sites} fitKey={dashboardFitKey} />}

        {/* ── Custom Points markers ── */}
        {customPoints.map(pt => (
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

        {activeMapTool === 'distance' && distanceMeasurePoints.map((point, index) => (
          <CircleMarker
            key={`distance-point-${index}-${point[0]}-${point[1]}`}
            center={point}
            radius={7}
            pane="pane5G"
            pathOptions={{
              color: 'hsl(var(--background))',
              fillColor: 'hsl(var(--primary))',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]} opacity={1}>
              <span className="text-[10px] font-semibold">{index === 0 ? 'A' : 'B'}</span>
            </Tooltip>
          </CircleMarker>
        ))}
        {activeMapTool === 'distance' && distanceMeasurePoints.length === 2 && distanceMeasurement && (
          <Polyline
            positions={distanceMeasurePoints}
            pane="pane5G"
            pathOptions={{
              color: 'hsl(var(--primary))',
              weight: 3,
              dashArray: '10 8',
              opacity: 0.95,
            }}
          >
            <Tooltip permanent direction="center" opacity={1} className="!bg-card !border-border !text-foreground shadow-lg">
              <div className="flex items-center gap-1.5 text-[10px] font-medium">
                <span className="font-semibold">{distanceMeasurement.label}</span>
                <span className="text-muted-foreground">•</span>
                <span>{distanceMeasurement.azimuth}°</span>
              </div>
            </Tooltip>
          </Polyline>
        )}

        {/* ── Radius tool ── */}
        {activeMapTool === 'radius' && radiusCenter && (() => {
          const currentRadius = radiusConfirmed ? radiusConfirmedMeters : radiusLiveMeters;
          const fmtRadius = currentRadius >= 1000 ? `${(currentRadius / 1000).toFixed(2)} km` : `${Math.round(currentRadius)} m`;
          return (
            <>
              {currentRadius > 0 && (
                <Circle
                  center={radiusCenter}
                  radius={currentRadius}
                  pane="pane5G"
                  pathOptions={{
                    color: radiusConfirmed ? 'hsl(var(--primary))' : RADIUS_RING_COLORS[0],
                    fillColor: radiusConfirmed ? 'hsl(var(--primary))' : RADIUS_RING_COLORS[0],
                    fillOpacity: radiusConfirmed ? 0.06 : 0.04,
                    weight: radiusConfirmed ? 2 : 1.5,
                    dashArray: radiusConfirmed ? undefined : '8 6',
                  }}
                >
                  <Tooltip permanent direction="center" opacity={1} className="!bg-card/95 !border-border !text-foreground shadow-lg !rounded-lg">
                    <div className="flex items-center gap-2 text-[9px] font-semibold">
                      <span>📏 {fmtRadius}</span>
                      {radiusConfirmed && radiusStats && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span>{radiusStats.sitesInside} sites</span>
                          <span className="text-muted-foreground">•</span>
                          <span>{radiusStats.cellsInside} cells</span>
                        </>
                      )}
                    </div>
                  </Tooltip>
                </Circle>
              )}
              <CircleMarker
                center={radiusCenter}
                radius={5}
                pane="pane5G"
                pathOptions={{
                  color: 'hsl(var(--background))',
                  fillColor: 'hsl(var(--primary))',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip permanent direction="bottom" offset={[0, 8]} opacity={1} className="!bg-card/90 !border-border/50 !text-foreground !rounded !shadow-sm">
                  <span className="text-[8px] font-mono text-muted-foreground">{radiusCenter[0].toFixed(5)}, {radiusCenter[1].toFixed(5)}</span>
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
        {!paramMode && !paramPanelOpen && sectorColorMode !== 'topo' && mapDisplayMode === 'heatmap' && (
          <HeatmapLayer points={heatmapPoints} radius={35} blur={25} minOpacity={0.3} />
        )}

        {/* Points mode — individual cell markers */}
        {!paramMode && !paramPanelOpen && mapDisplayMode === 'points' && renderSites.map(site => {
          const showCellLabels = viewport.zoom >= 13;
          const cellsToRender = getRenderableCellsForSite(site, mapTechnoFilter, enabledTechnos, isBandEnabled);
          return (
            <React.Fragment key={site.site_id}>
              {cellsToRender.map((cell, idx) => {
                const val = getCellKpiValue(cell);
                const colorViewOverridePoint = getColorViewFill(site);
                const color = colorViewOverridePoint || (sectorColorMode === 'topo' ? (mapTechnoFilter === 'ALL' ? (is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316')) : getBandColor(cell.bande, cell.techno)) : getKpiColor(val));
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
        {!paramMode && !paramPanelOpen && mapDisplayMode === 'sites' && !showSectors && renderSites.map(site => {
          const { has4G, has5G } = inferSiteTechState(site);
          const topoColor = has5G ? (bandColors['5G_GROUP'] || '#22c55e') : has4G ? (bandColors['4G_GROUP'] || '#f97316') : FADED_COLOR;
          // Color view override: if a "View by Color" dimension is active, use that instead
          const colorViewOverride = getColorViewFill(site);
          const color = colorViewOverride || topoColor;
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          const isTagged = isSiteTagged(site.site_id);
          const showMiniSectors = (showBeamSectors && viewport.zoom >= 8 && site.cells.length > 0 && !isIndoor) || (isTagged && site.cells.length > 0 && !isIndoor);

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
                {(showSiteLabels || viewport.zoom >= 12) && viewport.zoom >= 10 && (
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
            // Inverse zoom scaling for tagged sites: much larger at low zoom, still adaptive at high zoom
            const getTaggedRadius = (zoom: number) => {
              const BASE = 650;
              const MIN_RADIUS = 320;
              const MAX_RADIUS = 4200;
              const REF_ZOOM = 12;
              const scale = Math.pow(2, REF_ZOOM - zoom);
              return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, BASE * scale));
            };
            const miniRadius = isTagged ? getTaggedRadius(viewport.zoom) * 0.9 : getZoomAwareRadius(site.coordinates[0], viewport.zoom, sectorDensityFactor, vpWidth) * 0.7;
            const miniOpacity = Math.min(0.65, 0.25 + (viewport.zoom - 9) * 0.1);
             const azimuths = getValidSectorAzimuths(site);
             if (azimuths.length === 0) return null;
            // Build per-cell band-based mini items with size hierarchy
            const miniItems: { tech: string; az: number; r: number; bandKey: string | null }[] = [];
            const seenMini = new Set<string>();
            for (const cell of site.cells) {
              const tech = getCellTechGroup(cell.techno);
              if (!tech) continue;
              if (tech === '4G' && !enabledTechnos.has('4G')) continue;
              if (tech === '5G' && !enabledTechnos.has('5G')) continue;
              const az = Number(cell.azimut);
              if (!Number.isFinite(az) || az < 0 || az > 360) continue;
              const bandKey = normalizeBandKey(cell.bande, cell.techno);
              const dedup = `${tech}_${bandKey}_${az}`;
              if (seenMini.has(dedup)) continue;
              seenMini.add(dedup);
              const bandScale = getBandSizeScale(bandKey);
              miniItems.push({ tech, az, r: miniRadius * bandScale, bandKey });
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

            // Fallback: if no band-specific items, use all azimuths with site color
            if (miniItems.length === 0) {
              if (has4G && !has5G && enabledTechnos.has('4G')) {
                azimuths.forEach(az => miniItems.push({ tech: '4G', az, r: miniRadius, bandKey: null }));
              } else if (has5G && !has4G && enabledTechnos.has('5G')) {
                azimuths.forEach(az => miniItems.push({ tech: '5G', az, r: miniRadius, bandKey: null }));
              }
            }

            return (
              <React.Fragment key={site.site_id}>
                {miniItems.map(({ tech, az, r, bandKey }) => {
                  const sectorCoords = getSectorCoords(site.coordinates, az, r, 60);
                  const defaultTechColor = mapTechnoFilter === 'ALL'
                    ? (tech === '5G' ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316'))
                    : (bandKey ? (bandColors[bandKey] || DEFAULT_BAND_COLORS[bandKey] || (tech === '5G' ? '#22c55e' : '#f97316')) : (tech === '5G' ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316')));
                  const techColor = colorViewOverride || defaultTechColor;
                  return (
                    <Polygon
                      key={`${site.site_id}_mini_${tech}_${bandKey || 'unk'}_${az}`}
                      positions={sectorCoords}
                      pane={tech === '5G' ? 'pane5G' : 'pane4G'}
                      pathOptions={{
                        color: isHovered ? '#fff' : deriveStrokeColor(techColor),
                        fillColor: techColor,
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
                {(showSiteLabels || viewport.zoom >= 12) && (
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
            const isTagged = isSiteTagged(site.site_id);
            const showMini = (showBeamSectors && viewport.zoom >= 8 && site.cells.length > 0 && !isIndoor) || (isTagged && site.cells.length > 0 && !isIndoor);
            return !showMini;
          });

          const densityScale = circleSites.length > 2000 ? 0.7 : circleSites.length > 800 ? 0.8 : circleSites.length > 400 ? 0.9 : 1;

          const getRadius = (site: any, isHov: boolean, isSel: boolean) => {
            const br = viewport.zoom >= 10
              ? (isHov || isSel ? 7 : 5)
              : viewport.zoom >= 8
                ? (isHov || isSel ? 6 : Math.round(4 * densityScale))
                : (isHov || isSel ? 5 : Math.round(3.5 * densityScale));
            return br;
          };

          // Pass 1: 4G circles (pane4G — bottom) — skip entirely if filter is 5G-only
          const pass4G = (mapTechnoFilter === '5G' ? [] : circleSites.filter(site => {
            const { has4G } = inferSiteTechState(site);
            return has4G && enabledTechnos.has('4G');
          })).map(site => {
            const { has5G } = inferSiteTechState(site);
            const isHov = hoveredSiteId === site.site_id;
            const isSel = selectedSiteId === site.site_id;
            const isMixed = has5G;
            const br = getRadius(site, isHov, isSel);
            const r = isMixed ? Math.max(br, 4) : br;
            const colorOverride = getColorViewFill(site);
            return (
              <CircleMarker
                key={`4g_${site.site_id}`}
                center={site.coordinates}
                radius={r}
                pane="pane4G"
                pathOptions={{
                  color: isSel ? '#fff' : (isHov ? '#fff' : 'hsl(var(--border))'),
                  fillColor: colorOverride || (bandColors['4G_GROUP'] || '#f97316'),
                  fillOpacity: 0.85,
                  weight: isSel ? 2 : (isHov ? 2 : 1),
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

          // Pass 2: 5G circles (pane5G — top, always rendered AFTER 4G) — skip if filter is 4G-only
          const pass5G = (mapTechnoFilter === '4G' ? [] : circleSites.filter(site => {
            const { has5G } = inferSiteTechState(site);
            return has5G && enabledTechnos.has('5G');
          })).map(site => {
            const { has4G } = inferSiteTechState(site);
            const isHov = hoveredSiteId === site.site_id;
            const isSel = selectedSiteId === site.site_id;
            const isMixed = has4G;
            const br = getRadius(site, isHov, isSel);
            const r = isMixed ? Math.max(Math.round(br * 0.6), 2.5) : br;
            const colorOverride = getColorViewFill(site);
            return (
              <CircleMarker
                key={`5g_${site.site_id}`}
                center={site.coordinates}
                radius={r}
                pane="pane5G"
                pathOptions={{
                  color: isSel ? '#fff' : (isHov ? '#fff' : (isMixed && !colorOverride ? 'transparent' : 'hsl(var(--border))')),
                  fillColor: colorOverride || (bandColors['5G_GROUP'] || '#22c55e'),
                  fillOpacity: 0.9,
                  weight: isSel ? 2 : (isHov ? 2 : (isMixed && !colorOverride ? 0 : 1)),
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

          // Pass 3: unknown tech fallback — hide when a specific techno filter is active
          const passUnknown = (mapTechnoFilter !== 'ALL' ? [] : circleSites.filter(site => {
            const { has4G, has5G } = inferSiteTechState(site);
            return !has4G && !has5G;
          })).map(site => {
            const isHov = hoveredSiteId === site.site_id;
            const isSel = selectedSiteId === site.site_id;
            const br = getRadius(site, isHov, isSel);
            const colorOverride = getColorViewFill(site);
            return (
              <CircleMarker
                key={`unk_${site.site_id}`}
                center={site.coordinates}
                radius={br}
                pane="pane4G"
                pathOptions={{
                  color: isSel ? '#fff' : (isHov ? '#fff' : 'hsl(var(--border))'),
                  fillColor: colorOverride || FADED_COLOR,
                  fillOpacity: 0.85,
                  weight: isSel ? 2 : (isHov ? 2 : 1),
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

          // Pass 4: labels
          const labels = circleSites.filter(() => (showSiteLabels || viewport.zoom >= 12) && viewport.zoom >= 10).map(site => (
            <Marker key={`lbl_${site.site_id}`} position={site.coordinates} icon={L.divIcon({ html: '<div></div>', className: '', iconSize: L.point(1, 1), iconAnchor: L.point(0, 0) })} interactive={false}>
              <Tooltip direction="bottom" offset={[0, 6]} permanent className="site-name-label-clean">
                <span style={{ fontSize: '7px', fontWeight: 700, color: '#1a1a1a', textShadow: '0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff' }}>{buildSiteLabel(site, mapLabelFields)}</span>
              </Tooltip>
            </Marker>
          ));

          return <>{passUnknown}{pass4G}{pass5G}{labels}</>;
        })()}

        {/* Detailed sectors (only when zoomed in, sites mode) — professional low-opacity with strokes */}
        {!paramMode && !paramPanelOpen && showSectors && renderSites.map(site => {
          const isHovered = hoveredSiteId === site.site_id;
          const isSelectedSite = selectedSiteId === site.site_id;
          const isTaggedSite = isSiteTagged(site.site_id);
          // Inverse zoom scaling for tagged sites: much larger than normal, while staying adaptive
          const getTaggedRadiusDetail = (zoom: number) => {
            const BASE = 650;
            const MIN_RADIUS = 320;
            const MAX_RADIUS = 4200;
            const REF_ZOOM = 12;
            const scale = Math.pow(2, REF_ZOOM - zoom);
            return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, BASE * scale));
          };
          const zoomRadius = isTaggedSite ? getTaggedRadiusDetail(viewport.zoom) : getZoomAwareRadius(site.coordinates[0], viewport.zoom, sectorDensityFactor, vpWidth) * (0.5 + 0.5 * (beamVisibility / 100));
          const baseOverlap = visibleSites.length > 200 ? 0.18 : visibleSites.length > 80 ? 0.25 : 0.35;
          const beamScale = beamVisibility / 100;
          const overlapFactor = baseOverlap + (1 - baseOverlap) * beamScale;
          const isFocusFaded = false;

          /* ── Indoor sites: circle with "I" instead of sectors (rendered at all zooms including sector zoom) ── */
          const isIndoor = (site.site_name || '').toLowerCase().includes('indoor');
          if (isIndoor) {
            const { has4G, has5G } = inferSiteTechState(site);
            const topoColor = has5G ? (bandColors['5G_GROUP'] || '#22c55e') : has4G ? (bandColors['4G_GROUP'] || '#f97316') : FADED_COLOR;
            const kpiColor = site.cells.length > 0 ? getKpiColor(getCellKpiValue(site.cells[0])) : getKpiColor(site.qoe_score_avg ?? 0);
            const colorViewOverrideIndoor = getColorViewFill(site);
            const color = colorViewOverrideIndoor || ((sectorColorMode as string) === 'topo' ? topoColor : kpiColor);
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
            const { has4G: fb4G, has5G: fb5G } = inferSiteTechState(site);
            // Respect techno filter: skip sites that don't match
            const show4G = fb4G && enabledTechnos.has('4G');
            const show5G = fb5G && enabledTechnos.has('5G');
            if (!show4G && !show5G) {
              // If specific filter active and site doesn't match, skip entirely
              if (mapTechnoFilter !== 'ALL') return null;
            }
            const baseR = isHovered || isSelectedSite ? 7 : 5;
            const fbMixed = show4G && show5G;
            return (
              <React.Fragment key={site.site_id}>
                {show4G && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane4G"
                    fillColor={bandColors['4G_GROUP'] || '#f97316'}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(bandColors['4G_GROUP'] || '#f97316')}
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
                    radius={fbMixed ? Math.round(baseR * 0.65) : baseR}
                    pane="pane5G"
                    fillColor={bandColors['5G_GROUP'] || '#22c55e'}
                    fillOpacity={0.9}
                    weight={isSelectedSite ? 3 : (fbMixed ? 0 : 1.5)}
                    color={isSelectedSite ? '#fff' : (fbMixed ? 'transparent' : deriveStrokeColor(bandColors['5G_GROUP'] || '#22c55e'))}
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
                {!show4G && !show5G && mapTechnoFilter === 'ALL' && (
                  <CircleMarker
                    center={site.coordinates}
                    radius={baseR}
                    pane="pane4G"
                    fillColor={FADED_COLOR}
                    fillOpacity={0.85}
                    weight={isSelectedSite ? 3 : 1.5}
                    color={isSelectedSite ? '#fff' : deriveStrokeColor(FADED_COLOR)}
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

          /* ── ALL mode: band-based hierarchy ── */
          if (mapTechnoFilter === 'ALL') {
            // Group cells by band+azimuth for band-based sizing
            const cellItems: { tech: string; az: number; radius: number; bandKey: string | null; cell: typeof site.cells[0] }[] = [];
            for (const cell of site.cells) {
              const tech = getCellTechGroup(cell.techno);
              if (!tech) continue;
              let az = Number(cell.azimut);
              if (!Number.isFinite(az) || az < 0 || az > 360) {
                // Fallback: assign azimuth based on sector number (tri-sector heuristic)
                const sNum = getSectorNumber(cell.cell_id);
                const heuristicAz = [0, 0, 120, 240]; // index 0=fallback, 1=0°, 2=120°, 3=240°
                az = heuristicAz[sNum] ?? ((sNum - 1) * 120) % 360;
              }
              if (tech === '4G' && !enabledTechnos.has('4G')) continue;
              if (tech === '5G' && !enabledTechnos.has('5G')) continue;
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
                  // In ALL mode: use only tech group colors (2 colors total), not per-band colors
                  const topoColor = tech === '5G' ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316');
                  let kpiColor = topoColor;
                  if (sectorColorMode === 'kpi') {
                    kpiColor = getKpiColor(getCellKpiValue(cell));
                  }
                  const colorViewOverrideSector = getColorViewFill(site);
                  const fillColor = colorViewOverrideSector || (isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? topoColor : kpiColor));
                  const strokeColor = isFocusFaded ? '#cbd5e1' : deriveStrokeColor(fillColor);
                  const sectorCoords = getSectorCoords(site.coordinates, az, radius, 60);
                  return (
                    <Polygon
                      key={`${site.site_id}_${tech}_${bandKey || 'unk'}_${az}`}
                      positions={sectorCoords}
                      pane={tech === '5G' ? 'pane5G' : 'pane4G'}
                      pathOptions={{
                        color: isHovered ? '#fff' : strokeColor,
                        fillColor,
                        fillOpacity: isHovered ? 0.5 : (isFocusFaded ? 0.08 : (tech === '5G' ? 0.92 : overlapFactor)),
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
                {(showSiteLabels || viewport.zoom >= 12) && (
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
          const detailCells = getRenderableCellsForSite(site, mapTechnoFilter, enabledTechnos, isBandEnabled);
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
                const fillColor = colorViewOverrideCell || (isFocusFaded ? FADED_COLOR : ((sectorColorMode as string) === 'topo' ? getBandColor(cell.bande, cell.techno) : getKpiColor(getCellKpiValue(cell))));
                const strokeColor = isFocusFaded ? '#cbd5e1' : ((sectorColorMode as string) === 'topo' && !colorViewOverrideCell ? getBandStrokeColor(cell.bande, cell.techno) : deriveStrokeColor(fillColor));
                const isFocusCell = focusCellId === cell.cell_id;
                const isCellDimmed = focusMode === 'cell' && isSelectedSite && !isFocusCell;
                const baseOpacity = isFocusFaded ? 0.08 : (isFaded ? 0.08 : (isCellDimmed ? 0.15 : (is5G ? 0.92 : overlapFactor)));
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
                {(showSiteLabels || viewport.zoom >= 12) && (
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
            color={selectedLinkId === link.id ? '#3b82f6' : '#6366f1'}
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
            right: (showRightPanel && !detailFullscreen ? 450 : 0) + 16,
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
      {showLinkProfile && linkProfileAnalysis && !linkProfileLoading && (
        <div
          className="absolute bottom-4 right-4 z-[1001] overflow-hidden pointer-events-auto max-h-[50%] flex flex-col animate-fade-in"
          style={{
            left: `${(panelCollapsed ? 56 : 400) + 16}px`,
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
                <p className="text-[10px] text-white/40">Profil terrain du lien · {linkTotalDistance > 0 ? (linkTotalDistance / 1000).toFixed(2) + ' km' : ''}</p>
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{
                  background: linkEnableCurvature ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Switch checked={linkEnableCurvature} onCheckedChange={(v) => {
                  setLinkEnableCurvature(v);
                  if (linkActiveCoords) recomputeLinkProfile(linkActiveCoords, v);
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
              <button
                onClick={() => { setShowLinkProfile(false); setSelectedLinkId(null); setLinkProfileHover(null); setLinkActiveCoords(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 flex gap-5">
            {/* Chart */}
            <div className="flex-1 h-[260px] min-w-0">
              <ProfileChart
                profilePoints={linkProfilePoints}
                analysis={linkProfileAnalysis}
                fresnel={linkFresnel}
                showFresnel={linkEnableFresnel}
                showCurvature={linkEnableCurvature}
                clutterHeight={linkEnableClutter ? linkClutterHeight : 0}
                onHoverPoint={setLinkProfileHover}
                showTilt
                remoteAntenna={{ hba: 30, totalTilt: 2, vbw: 7, azimuth: 0 }}
                siteName={linkProfileLabel}
              />
            </div>
            {/* Info panel */}
            <div className="w-[300px] shrink-0 overflow-y-auto pr-1">
              <InfoPanel
                analysis={linkProfileAnalysis}
                totalDistance={linkTotalDistance}
                enableCurvature={linkEnableCurvature}
                fresnel={linkFresnel}
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

      {/* Tool usage hint */}
      {activeMapTool && (
        <div className="absolute bottom-14 z-[1001] pointer-events-none transition-all duration-300" style={{ left: `calc(${panelCollapsed ? 56 : 400}px + (100% - ${panelCollapsed ? 56 : 400}px - ${showRightPanel && !detailFullscreen ? 450 : 0}px) / 2)`, transform: 'translateX(-50%)' }}>
          <div className="bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-md px-3 py-1 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
            {activeMapTool === 'distance' && '📏 Cliquez 2 points pour mesurer la distance'}
            {activeMapTool === 'polygon' && (polygonClosed ? '✅ Polygone fermé — cliquez le tool pour réinitialiser' : '🔷 Cliquez pour ajouter des points, double-clic pour fermer')}
            {activeMapTool === 'radius' && (!radiusCenter ? '🎯 Cliquez pour placer le centre' : !radiusConfirmed ? '🎯 Déplacez la souris et cliquez pour fixer le rayon' : '✅ Rayon fixé — cliquez pour recommencer')}
          </div>
        </div>
      )}

      {/* Floating status bar — minimal GIS style, centered on map */}
      <div className="absolute bottom-4 z-[1000] pointer-events-auto transition-all duration-300" style={{ left: `calc(${panelCollapsed ? 56 : 400}px + (100% - ${panelCollapsed ? 56 : 400}px - ${showRightPanel && !detailFullscreen ? 450 : 0}px) / 2)`, transform: 'translateX(-50%)' }}>
        <div className="bg-card/90 backdrop-blur-md border border-border/60 rounded-full shadow-lg px-4 py-1.5 flex items-center gap-1">
          {paramMode ? (
            <>
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] font-medium text-muted-foreground">Param</span>
                <span className="text-xs font-bold text-primary">{paramConfirmed}</span>
              </div>
              <span className="w-px h-3.5 bg-border/60" />
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[10px] font-medium text-muted-foreground">Points</span>
                <span className="text-xs font-bold text-foreground">{paramPoints.length}</span>
              </div>
            </>
          ) : (
            <>
              {/* Left: Info */}
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-xs font-bold text-foreground">{filteredSites.length.toLocaleString()}</span>
                <span className="text-[10px] font-medium text-muted-foreground">Sites</span>
              </div>
              <span className="w-px h-3.5 bg-border/60" />
              <div className="flex items-center gap-1.5 px-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">Z</span>
                <span className="text-xs font-bold text-foreground">{viewport.zoom}</span>
              </div>

              <span className="w-px h-3.5 bg-border/60 mx-0.5" />

              {/* Center: Toggles */}
              <button
                onClick={() => setShowSiteLabels(v => !v)}
                title="Afficher les noms de sites"
                className={`px-2 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider transition-all duration-200 ${
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
                className={`px-2 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                  showBeamSectors
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Beams
              </button>

              <span className="w-px h-3.5 bg-border/60 mx-0.5" />

              {/* Right: Drawing tools */}
              {([
                { key: 'distance' as const, icon: Ruler, label: 'Distance', tip: 'Cliquez 2 points pour mesurer' },
                { key: 'polygon' as const, icon: Pentagon, label: 'Polygon', tip: 'Cliquez pour tracer, double-clic pour fermer' },
                { key: 'radius' as const, icon: Target, label: 'Radius+', tip: 'Cliquez pour placer le centre multi-rayon' },
              ] as const).map(tool => {
                const isActive = activeMapTool === tool.key;
                return (
                  <button
                    key={tool.key}
                    onClick={() => handleMapToolToggle(tool.key)}
                    title={tool.tip}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <tool.icon size={11} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="hidden sm:inline">{tool.label}</span>
                  </button>
                );
              })}

              {/* Radius info */}
              {activeMapTool === 'radius' && radiusCenter && radiusConfirmed && (
                <>
                  <span className="w-px h-3.5 bg-border/60 mx-0.5" />
                  <span className="text-[8px] text-muted-foreground font-medium">
                    {radiusConfirmedMeters >= 1000 ? `${(radiusConfirmedMeters / 1000).toFixed(2)} km` : `${Math.round(radiusConfirmedMeters)} m`}
                  </span>
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
            className="flex-1 overflow-x-auto overflow-y-hidden flex items-center justify-center gap-3 px-4 scrollbar-hide"
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
                onClick={async () => {
                  if (!paramPanelOpen && !paramMode) {
                    // Entering param mode: save active dashboard but keep filters applied
                    if (activeDashboardId) {
                      await saveDashboardSettings(activeDashboardId);
                    }
                  }
                  setParamPanelOpen(!paramPanelOpen);
                }}
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

      {/* Color View dropdown — rendered outside overflow container */}
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

      {/* Floating bottom-left: display mode + layer switcher */}
      {viewMode === 'map' && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto flex items-end gap-2 transition-all duration-300" style={{ left: (panelCollapsed ? 56 : 400) + 16, bottom: 64 }}>
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

      {/* Floating bottom-left: techno filter + band legend */}
      {viewMode === 'map' && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto flex items-end gap-2 transition-all duration-300" style={{ right: showRightPanel && !detailFullscreen ? 474 : 24 }}>
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

          {/* Band layer toggle panel — hidden when colorViewMode is active */}
          {colorViewMode === 'none' && (
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
                    {([
                      { key: '5G_GROUP', tech: '5G' as const, label: '5G', defaultColor: '#22c55e' },
                      { key: '4G_GROUP', tech: '4G' as const, label: '4G', defaultColor: '#f97316' },
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
                      <button onClick={() => toggleAllBands('NR')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: bandColors['5G_GROUP'] || '#22c55e' }}>
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
          )}
        </div>
      )}

      {/* ── Color View Legend — rendered outside the band panel container ── */}
      {viewMode === 'map' && colorViewMode !== 'none' && Object.keys(colorViewColorMap).length > 0 && (
        <div className="absolute bottom-6 z-[1000] pointer-events-auto" style={{ right: (showRightPanel && !detailFullscreen ? 450 : 0) + 24 }}>
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

              {/* ── Tabs: Sites / Dashboard ── */}
              <div className="px-5 pb-2 shrink-0 flex items-center gap-1 bg-muted/20 border-b border-border">
                {[
                  { id: 'dashboard' as const, label: 'Dashboard', icon: <LayoutGrid size={12} /> },
                  { id: 'sites' as const, label: 'Sites', icon: <MapPin size={12} /> },
                  { id: 'tagged' as const, label: `Tagged (${taggedSites.length})`, icon: <Star size={12} /> },
                ].map(tab => (
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
                {!dashboardActive && !loading && !isSearchActive && searchModeSites.length === 0 ? (
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
                ) : filteredSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search size={28} className="mb-3 opacity-20" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">{isSearchActive ? 'Aucun résultat' : 'No sites found'}</span>
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
                        return true;
                      });
                      const displayedCellCount = siteCells.length;
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
                              {sectorColorMode !== 'topo' && (
                                <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg min-w-[48px]" style={{ background: getKpiColor((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0), color: '#fff' }}>
                                  <span className="text-[15px] font-black tracking-tight leading-none">
                                    {((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0).toFixed(1)}
                                  </span>
                                </div>
                              )}
                              <div className="text-[9px] font-semibold text-muted-foreground uppercase mt-1">{displayedCellCount} cells</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
                                {sortedSec.map(([sNum, cells]) => {
                                  const isSectorExpanded = expandedSectors.has(sNum);
                                  const technos = [...new Set(cells.map(c => c.techno).filter(Boolean))].sort().reverse();
                                  const technoLabel = technos.length > 0 ? technos.join(' / ') : '—';
                                  return (
                                    <button
                                      key={sNum}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSectors(prev => {
                                          if (prev.has(sNum) && prev.size === 1) return new Set();
                                          return new Set([sNum]);
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
                                          const hasNR = cells.some(c => c.techno?.includes('5G') || c.techno === 'NR');
                                          const hasLTE = cells.some(c => !c.techno?.includes('5G') && c.techno !== 'NR');
                                          return (
                                            <>
                                              {hasNR && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: '#22c55e' }} title="5G" />}
                                              {hasLTE && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: '#f97316' }} title="4G" />}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <span className={`text-[14px] font-black ${isSectorExpanded ? 'text-primary-foreground' : 'text-foreground'}`}>S{sNum}</span>
                                      <span className={`text-[9px] mt-0.5 font-semibold ${isSectorExpanded ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{cells.length} cell{cells.length > 1 ? 's' : ''}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Techno legend */}
                              <div className="flex items-center gap-4 mb-3 px-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
                                  <span className="text-[10px] font-bold text-muted-foreground">5G</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
                                  <span className="text-[10px] font-bold text-muted-foreground">4G</span>
                                </div>
                              </div>

                              {expandedSectors.size > 0 && (() => {
                                const secCells = sortedSec.filter(([s]) => expandedSectors.has(s)).flatMap(([, cells]) => cells);
                                if (!secCells.length) return null;
                                return (
                                  <div className="rounded-xl border border-border overflow-hidden animate-fade-in">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-muted/40 border-b border-border">
                                          <th className="px-3 py-1.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tech</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Band</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Az°</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tilt°</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Hba</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Sec</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {secCells.map((cell) => {
                                          const isSel = focusCellId === cell.cell_id;
                                          const sNum = getSectorNumber(cell.cell_id);
                                          const tilt = (cell as any).tilt as number | null;
                                          const hba = (cell as any).hba as number | null;
                                          return (
                                            <tr
                                              key={cell.cell_id}
                                              onClick={(e) => { e.stopPropagation(); handleCellClick(cell.cell_id); }}
                                              className={`cursor-pointer transition-colors border-b border-border/30 last:border-b-0 ${
                                                isSel
                                                  ? 'bg-primary/10'
                                                  : 'hover:bg-muted/30'
                                              }`}
                                            >
                                              <td className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">{cell.cell_id}</td>
                                              <td className="px-2 py-2 text-center">
                                                <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white" style={{ backgroundColor: is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316') }}>
                                                  {is5GTech(cell.techno) ? '5G' : '4G'}
                                                </span>
                                              </td>
                                              <td className="px-2 py-2 text-center font-semibold text-muted-foreground">{cell.bande || '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{cell.azimut != null ? `${cell.azimut}°` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{tilt != null ? `${tilt}°` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{hba != null ? `${hba}m` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-extrabold text-primary">S{sNum}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
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

              {/* ── Tagged Sites tab ── */}
              {inventoryTab === 'tagged' && (
              <div className="flex-1 flex flex-col overflow-hidden">
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
                                <span>{site.cell_count} cells</span>
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
                      });
                      const displayedCellCount = siteCells.length;
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
                              {sectorColorMode !== 'topo' && (
                                <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg min-w-[48px]" style={{ background: getKpiColor((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0), color: '#fff' }}>
                                  <span className="text-[15px] font-black tracking-tight leading-none">
                                    {((site as any)[mapKpi] ?? site.qoe_score_avg ?? 0).toFixed(1)}
                                  </span>
                                </div>
                              )}
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
                                {sortedSec.map(([sNum, cells]) => {
                                  const isSectorExpanded = expandedSectors.has(sNum);
                                  const technos = [...new Set(cells.map(c => c.techno).filter(Boolean))].sort().reverse();
                                  const technoLabel = technos.length > 0 ? technos.join(' / ') : '—';
                                  return (
                                    <button
                                      key={sNum}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSectors(prev => {
                                          if (prev.has(sNum) && prev.size === 1) return new Set();
                                          return new Set([sNum]);
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
                                          const hasNR = cells.some(c => c.techno?.includes('5G') || c.techno === 'NR');
                                          const hasLTE = cells.some(c => !c.techno?.includes('5G') && c.techno !== 'NR');
                                          return (
                                            <>
                                              {hasNR && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: '#22c55e' }} title="5G" />}
                                              {hasLTE && <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: '#f97316' }} title="4G" />}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <span className={`text-[14px] font-black ${isSectorExpanded ? 'text-primary-foreground' : 'text-foreground'}`}>S{sNum}</span>
                                      <span className={`text-[9px] mt-0.5 font-semibold ${isSectorExpanded ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{cells.length} cell{cells.length > 1 ? 's' : ''}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-4 mb-3 px-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
                                  <span className="text-[10px] font-bold text-muted-foreground">5G</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
                                  <span className="text-[10px] font-bold text-muted-foreground">4G</span>
                                </div>
                              </div>
                              {expandedSectors.size > 0 && (() => {
                                const secCells = sortedSec.filter(([s]) => expandedSectors.has(s)).flatMap(([, cells]) => cells);
                                if (!secCells.length) return null;
                                return (
                                  <div className="rounded-xl border border-border overflow-hidden animate-fade-in">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-muted/40 border-b border-border">
                                          <th className="px-3 py-1.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Cell</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tech</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Band</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Az°</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Tilt°</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Hba</th>
                                          <th className="px-2 py-1.5 text-center font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Sec</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {secCells.map((cell) => {
                                          const isSel = focusCellId === cell.cell_id;
                                          const sNum = getSectorNumber(cell.cell_id);
                                          const tilt = (cell as any).tilt as number | null;
                                          const hba = (cell as any).hba as number | null;
                                          return (
                                            <tr
                                              key={cell.cell_id}
                                              onClick={(e) => { e.stopPropagation(); handleCellClick(cell.cell_id); }}
                                              className={`cursor-pointer transition-colors border-b border-border/30 last:border-b-0 ${
                                                isSel ? 'bg-primary/10' : 'hover:bg-muted/30'
                                              }`}
                                            >
                                              <td className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">{cell.cell_id}</td>
                                              <td className="px-2 py-2 text-center">
                                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ backgroundColor: is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316') }}>
                                                  {cell.techno || '—'}
                                                </span>
                                              </td>
                                              <td className="px-2 py-2 text-center font-semibold text-muted-foreground">{cell.bande || '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{cell.azimut != null ? `${cell.azimut}°` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{tilt != null ? `${tilt}°` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-mono">{hba != null ? `${hba}m` : '—'}</td>
                                              <td className="px-2 py-2 text-center font-extrabold text-primary">S{sNum}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
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
                        <div key={pt.id} className="rounded-xl border border-border bg-card hover:border-primary/20 transition-all overflow-hidden">
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

                {/* ── Tagged Links List ── */}
                {taggedLinks.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Liens ({taggedLinks.length})</div>
                    <div className="space-y-1.5">
                      {taggedLinks.map(link => (
                        <div
                          key={link.id}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            selectedLinkId === link.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Network size={14} className="text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
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
                                onClick={() => setSelectedLinkId(selectedLinkId === link.id ? null : link.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                                title="Sélectionner"
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
                        onClick={() => { setLinkCreationMode(false); setLinkSource(null); }}
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
                    } else if (settings._isDashboardOnly) {
                      setActiveViewId(null);
                    }

                    if (settings.mapLayer) setMapLayer(settings.mapLayer);
                    if (settings.mapKpi) setMapKpi(settings.mapKpi);
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
                      if (newFilters.constructeur?.length) setLocalVendor(newFilters.constructeur[0]);
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
                          if (f.attribute === 'constructeur' && f.value) setLocalVendor(f.value);
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
                      setSites([]);
                      setActiveDashboardId(null);
                    } else if (siteFilters && Object.keys(siteFilters).length > 0) {
                      // Apply multi-filters from dashboard
                      if (siteFilters.dor?.length === 1) setLocalDor(siteFilters.dor[0]);
                      else if (siteFilters.dor?.length) setLocalDor(siteFilters.dor[0]);
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
                  activeViewId={activeViewId}
                  onActiveViewIdChange={setActiveViewId}
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
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tight">{site.cells?.length > 0 || site.cell_count > 0 ? `${site.cell_count} CELLS` : '—'}</span>
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
                      <td className="px-6 py-6 text-center font-black text-muted-foreground text-[11px]">{site.cells?.length > 0 || site.cell_count > 0 ? site.cell_count : '—'}</td>
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
            const hasDbStats = !!dbStats && (dbStats.cells4G > 0 || dbStats.cells5G > 0 || dbStats.sites4G > 0 || dbStats.sites5G > 0);
            const rawSites4G = hasDbStats ? dbStats!.sites4G : 0;
            const rawSites5G = hasDbStats ? dbStats!.sites5G : 0;
            const rawCells4G = hasDbStats ? dbStats!.cells4G : 0;
            const rawCells5G = hasDbStats ? dbStats!.cells5G : 0;
            const bandMap4G: Record<string, number> = hasDbStats ? dbStats!.bandMap4G : {};
            const bandMap5G: Record<string, number> = hasDbStats ? dbStats!.bandMap5G : {};

            // Apply tech filter to inventory stats
            const show4G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('4G') : mapTechnoFilter === '4G';
            const show5G = mapTechnoFilter === 'ALL' ? enabledTechnos.has('5G') : mapTechnoFilter === '5G';
            const sites4GCount = show4G ? rawSites4G : 0;
            const sites5GCount = show5G ? rawSites5G : 0;
            const cells4GCount = show4G ? rawCells4G : 0;
            const cells5GCount = show5G ? rawCells5G : 0;
            const vendorMap: Record<string, { '4G': number; '5G': number }> = hasDbStats ? dbStats!.vendorMap : {};
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
                      <p className="text-[11px] text-muted-foreground mt-1">Vue d'ensemble réseau {show4G && show5G ? '4G / 5G' : show4G ? '4G' : '5G'}</p>
                    </div>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {show4G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 4G</div>
                        <div className="text-[22px] font-black text-foreground leading-none">{sites4GCount}</div>
                      </div>
                    )}
                    {show5G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sites 5G</div>
                        <div className="text-[22px] font-black text-primary leading-none">{sites5GCount}</div>
                      </div>
                    )}
                    {show4G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 4G</div>
                        <div className="text-[22px] font-black text-foreground leading-none">{cells4GCount}</div>
                      </div>
                    )}
                    {show5G && (
                      <div className="bg-muted/40 border border-border rounded-xl p-3">
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cellules 5G</div>
                        <div className="text-[22px] font-black text-primary leading-none">{cells5GCount}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Technology Distribution */}
                <div className="px-5 py-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Technologie</h4>
                  {[
                    ...(show4G ? [{ label: 'LTE (4G)', count: cells4GCount, color: bandColors['4G_GROUP'] || '#f97316' }] : []),
                    ...(show5G ? [{ label: 'NR (5G)', count: cells5GCount, color: bandColors['5G_GROUP'] || '#22c55e' }] : []),
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
                  {show4G && Object.keys(bandMap4G).length > 0 && (
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
                  {show5G && Object.keys(bandMap5G).length > 0 && (
                    <div>
                      <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: bandColors['5G_GROUP'] || '#22c55e' }}>NR (5G)</div>
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
                  {Object.entries(vendorMap).sort((a, b) => (b[1]['4G'] + b[1]['5G']) - (a[1]['4G'] + a[1]['5G'])).map(([vendor, counts]) => {
                    const v4g = show4G ? counts['4G'] : 0;
                    const v5g = show5G ? counts['5G'] : 0;
                    if (v4g === 0 && v5g === 0) return null;
                    return (
                      <div key={vendor} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-[11px] font-bold text-foreground flex-1 capitalize">{vendor}</span>
                        <div className="flex items-center gap-3">
                          {show4G && (
                            <div className="text-right">
                              <span className="text-[9px] text-muted-foreground">4G </span>
                              <span className="text-[10px] font-black text-foreground">{v4g}</span>
                            </div>
                          )}
                          {show5G && (
                            <div className="text-right">
                              <span className="text-[9px] text-muted-foreground">5G </span>
                              <span className="text-[10px] font-black text-primary">{v5g}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
              const s4g = new Set<string>();
              const s5g = new Set<string>();
              let c4g = 0, c5g = 0;
              const bm4g: Record<string, number> = {};
              const bm5g: Record<string, number> = {};
              const vm: Record<string, { '4G': number; '5G': number }> = {};
              filteredSites.forEach(site => {
                const inferredTechState = inferSiteTechState(site);
                let has4g = inferredTechState.has4G, has5g = inferredTechState.has5G;
                site.cells.forEach(c => {
                  const is5g = c.techno?.includes('5G') || c.techno === 'NR';
                  const v = (c as any).vendor || site.vendor || 'Unknown';
                  if (!vm[v]) vm[v] = { '4G': 0, '5G': 0 };
                  if (is5g) { c5g++; has5g = true; const b = c.bande || 'Unknown'; bm5g[b] = (bm5g[b] || 0) + 1; vm[v]['5G']++; }
                  else { c4g++; has4g = true; const b = c.bande || 'Unknown'; bm4g[b] = (bm4g[b] || 0) + 1; vm[v]['4G']++; }
                });
                if (has4g) s4g.add(site.site_id);
                if (has5g) s5g.add(site.site_id);
                // If no cells loaded, use lte_cells/nr_cells counts
                if (site.cells.length === 0) {
                  if ((site.lte_cells ?? 0) > 0) { s4g.add(site.site_id); c4g += site.lte_cells ?? 0; }
                  if ((site.nr_cells ?? 0) > 0) { s5g.add(site.site_id); c5g += site.nr_cells ?? 0; }
                }
              });
              return { sites4G: s4g.size, sites5G: s5g.size, cells4G: c4g, cells5G: c5g, bandMap4G: bm4g, bandMap5G: bm5g, vendorMap: vm };
            })();
            const displayStats: TopoNetworkStats = hasFastStats
              ? {
                  ...ns!,
                  sites4G: ns!.sites4G > 0 ? ns!.sites4G : computedStats.sites4G,
                  sites5G: ns!.sites5G > 0 ? ns!.sites5G : computedStats.sites5G,
                  bandMap4G: Object.keys(ns!.bandMap4G || {}).length > 0 ? ns!.bandMap4G : computedStats.bandMap4G,
                  bandMap5G: Object.keys(ns!.bandMap5G || {}).length > 0 ? ns!.bandMap5G : computedStats.bandMap5G,
                  vendorMap: Object.keys(ns!.vendorMap || {}).length > 0 ? ns!.vendorMap : computedStats.vendorMap,
                }
              : computedStats;
            const hasAnyStats = displayStats.sites4G > 0 || displayStats.sites5G > 0 || displayStats.cells4G > 0 || displayStats.cells5G > 0;

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
                        { label: 'LTE (4G)', count: displayStats.cells4G, color: bandColors['4G_GROUP'] || '#f97316' },
                        { label: 'NR (5G)', count: displayStats.cells5G, color: bandColors['5G_GROUP'] || '#22c55e' },
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
                      {Object.keys(displayStats.bandMap4G).length > 0 && (
                        <div className="mb-3">
                          <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: bandColors['4G_GROUP'] || '#f97316' }}>LTE (4G)</div>
                          {Object.entries(displayStats.bandMap4G).sort((a, b) => b[1] - a[1]).map(([band, count]) => (
                            <div key={band} className="flex items-center gap-2 py-1">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '4G') }} />
                              <span className="text-[10px] font-semibold text-foreground flex-1">{band}</span>
                              <span className="text-[10px] font-black text-muted-foreground">{count.toLocaleString('fr-FR')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {Object.keys(displayStats.bandMap5G).length > 0 && (
                        <div>
                          <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: bandColors['5G_GROUP'] || '#22c55e' }}>NR (5G)</div>
                          {Object.entries(displayStats.bandMap5G).sort((a, b) => b[1] - a[1]).map(([band, count]) => (
                            <div key={band} className="flex items-center gap-2 py-1">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getBandColor(band, '5G') }} />
                              <span className="text-[10px] font-semibold text-foreground flex-1">{band}</span>
                              <span className="text-[10px] font-black text-muted-foreground">{count.toLocaleString('fr-FR')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Vendor Distribution */}
                    {Object.keys(displayStats.vendorMap).length > 0 && (
                      <div className="px-5 py-4">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribution Constructeurs</h4>
                        {Object.entries(displayStats.vendorMap).sort((a, b) => (b[1]['4G'] + b[1]['5G']) - (a[1]['4G'] + a[1]['5G'])).map(([vendor, counts]) => (
                          <div key={vendor} className="flex items-center gap-2 py-1.5">
                            <span className="text-[11px] font-bold text-foreground flex-1">{vendor}</span>
                            <span className="text-[9px] text-muted-foreground">4G</span>
                            <span className="text-[10px] font-black text-foreground">{counts['4G']}</span>
                            <span className="text-[9px] text-muted-foreground">5G</span>
                            <span className="text-[10px] font-black text-primary">{counts['5G']}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

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

          {/* ========== LOADING STATE for site/cell modes ========== */}
          {(focusMode === 'site' || focusMode === 'cell') && !siteDetail && detailLoading && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Loading site details…</p>
              </div>
            </div>
          )}
          {(focusMode === 'site' || focusMode === 'cell') && !siteDetail && !detailLoading && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <AlertTriangle size={20} className="text-muted-foreground" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">No site details available</p>
                <button onClick={() => { setFocusMode('global'); setSelectedSiteId(null); setSelectedSiteSnapshot(null); }} className="text-[10px] text-primary hover:underline mt-1">Back to Global</button>
              </div>
            </div>
          )}

          {/* ========== SITE FOCUS MODE ========== */}
          {focusMode === 'site' && siteDetail && (() => {
            // Filter cells by active dashboard/view filters
            const filteredCells = siteDetail.cells.filter(cell => {
              const cellTech = getCellTechGroup(cell.techno);
              // Apply map techno filter (toolbar 4G/5G toggle)
              if (mapTechnoFilter === '4G' && cellTech !== '4G') return false;
              if (mapTechnoFilter === '5G' && cellTech !== '5G') return false;
              if (mapTechnoFilter === 'ALL' && cellTech && !enabledTechnos.has(cellTech)) return false;
              if (localBande !== 'ALL' && cell.bande !== localBande) return false;
              if (localTechno !== 'ALL' && cellTech !== localTechno) return false;
              if (activeDashboardFilters?.bande?.length && !activeDashboardFilters.bande.includes(cell.bande)) return false;
              if (activeDashboardFilters?.techno?.length && !activeDashboardFilters.techno.some(t => cellTech === t || cell.techno === t)) return false;
              // Apply zone_arcep filter from dashboard/view (only if cell has the field)
              if (localZoneArcep !== 'ALL' && (cell as any).zone_arcep && (cell as any).zone_arcep !== localZoneArcep) return false;
              if (activeDashboardFilters?.zone_arcep?.length && (cell as any).zone_arcep && !activeDashboardFilters.zone_arcep.includes((cell as any).zone_arcep)) return false;
              // Apply dor filter from dashboard/view (only if cell has the field)
              if (activeDashboardFilters?.dor?.length && (cell as any).dor && !activeDashboardFilters.dor.includes((cell as any).dor)) return false;
              return true;
            });
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

              {/* ── Site Detail Tabs ── */}
              <div className="px-5 py-4 space-y-3">
                <Tabs defaultValue="design" className="w-full">
                  <TabsList className="w-full h-auto p-1 bg-muted/30 rounded-lg flex gap-0.5 border border-border">
                    <TabsTrigger value="design" className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Site Design</TabsTrigger>
                    <TabsTrigger value="conf" className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Site Conf</TabsTrigger>
                    <TabsTrigger value="alarm" className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Alarm</TabsTrigger>
                    <TabsTrigger value="cmhistory" className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">CM History</TabsTrigger>
                    <TabsTrigger value="params" className="flex-1 text-[10px] font-bold py-1.5 px-1 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Parameters</TabsTrigger>
                  </TabsList>

                  <TabsContent value="design" className="mt-3 space-y-4">

                {/* Site info summary */}
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  {[
                    { label: 'Site Name', value: siteDetail.site_name },
                    { label: 'Site ID', value: siteDetail.site_id },
                    { label: 'Vendor', value: siteDetail.vendor },
                    { label: 'Coordinates', value: `${siteDetail.coordinates[0].toFixed(5)}, ${siteDetail.coordinates[1].toFixed(5)}` },
                    { label: 'Altitude (HBA)', value: filteredCells[0]?.hba != null ? `${filteredCells[0].hba} m AGL` : '—' },
                    { label: 'Total Cells', value: `${filteredCells.length}${filteredCells.length !== siteDetail.cell_count ? ` / ${siteDetail.cell_count}` : ''}` },
                    { label: 'Sectors', value: `${sortedSectors.length}` },
                    { label: 'Technologies', value: techBadgeStr },
                    { label: 'Terrain Type', value: (() => {
                      const lat = siteDetail.coordinates[0];
                      const hba = filteredCells[0]?.hba ?? 30;
                      if (hba >= 40) return 'Dense Urban';
                      if (hba >= 25) return 'Urban';
                      if (hba >= 15) return 'Suburban';
                      return 'Rural';
                    })() },
                    { label: 'Zone ARCEP', value: (() => {
                      const zones = [...new Set(filteredCells.map(c => (c as any).zone_arcep).filter(Boolean))];
                      return zones.length > 0 ? zones.join(', ') : (siteDetail as any).zone_arcep || '—';
                    })() },
                    { label: 'Profile', value: (() => {
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
                    <div key={i} className={`flex items-center justify-between px-4 py-2 text-[11px] border-b border-border/40 last:border-0 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                      <span className="text-muted-foreground font-medium">{p.label}</span>
                      <span className="font-semibold text-foreground">{p.value}</span>
                    </div>
                  ))}
                </div>


                {/* SECTORS & CELLS — tabbed */}
                {(() => {
                  const sectorNums = sortedSectors.map(([s]) => s);
                  const defaultSector = sectorNums[0] ?? '1';
                  return (
                    <div>
                      <h5 className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Radio size={12} className="text-primary" /> SECTORS & CELLS
                      </h5>
                      <Tabs defaultValue={String(defaultSector)} className="w-full">
                        <TabsList className="w-full h-auto p-1 bg-muted/30 rounded-lg flex gap-1 border border-border">
                          {sortedSectors.map(([sNum, cells]) => (
                            <TabsTrigger key={sNum} value={String(sNum)} className="flex-1 text-[11px] font-bold py-1.5 px-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                              SECTOR <span className="font-black ml-0.5">S{sNum}</span>
                              <span className="text-[9px] font-normal ml-1 opacity-60">{cells.length} cells</span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {sortedSectors.map(([sNum, cells]) => (
                          <TabsContent key={sNum} value={String(sNum)} className="mt-2">
                            <div className="rounded-lg border border-border overflow-hidden bg-card">
                              {/* Table header */}
                              <div className="grid grid-cols-[1fr_50px_70px_45px_45px] gap-1 px-3 py-2 bg-muted/40 border-b border-border">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Cell</span>
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-center">Tech</span>
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-center">Band</span>
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-center">Az°</span>
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-center">Tilt°</span>
                              </div>
                              {/* Rows */}
                              <div className="divide-y divide-border/30">
                                {cells.map((c) => {
                                  const eTilt = (c as any).tilt as number | null;
                                  return (
                                    <div key={c.cell_id} onClick={() => handleCellClick(c.cell_id)} className={`grid grid-cols-[1fr_50px_70px_45px_45px] gap-1 px-3 py-2 items-center cursor-pointer transition-colors ${focusCellId === c.cell_id ? 'bg-primary/10' : 'hover:bg-muted/20'}`}>
                                      <span className="text-[11px] font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors">{c.cell_id}</span>
                                      <span className="text-[10px] font-bold text-center" style={{ color: is5GTech(c.techno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316') }}>{c.techno}</span>
                                      <span className="text-[10px] text-muted-foreground text-center">{c.bande}</span>
                                      <span className="text-[10px] font-semibold text-foreground text-center">{c.azimut ?? '—'}°</span>
                                      <span className="text-[10px] font-semibold text-foreground text-center">{eTilt ?? '—'}°</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  );
                })()}

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
                      const has5G = siteDetail.cells.some(c => getCellTechGroup(c.techno) === '5G');
                      const has4G = siteDetail.cells.some(c => getCellTechGroup(c.techno) === '4G');
                      if (has5G && has4G) {
                        // Check if 5G tilt < 4G tilt on same sector
                        let coLocOk = true;
                        sortedSectors.forEach(([, cells]) => {
                          const t5g = cells.filter(c => getCellTechGroup(c.techno) === '5G').map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
                          const t4g = cells.filter(c => getCellTechGroup(c.techno) === '4G').map(c => (c as any).tilt as number | null).filter((t): t is number => t != null);
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
                  </TabsContent>

                  <TabsContent value="conf" className="mt-3">
                    <SiteConfigTab siteName={siteDetail?.site_name} />
                  </TabsContent>

                  <TabsContent value="alarm" className="mt-3">
                    <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">Alarms — coming soon</div>
                  </TabsContent>

                  <TabsContent value="cmhistory" className="mt-3">
                    {siteDetail?.site_name ? (
                      <SiteChangesPanel siteName={siteDetail.site_name} days={90} />
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-4 text-center text-[11px] text-muted-foreground">No CM history available</div>
                    )}
                  </TabsContent>

                  <TabsContent value="params" className="mt-3">
                    <SiteParametersTab siteName={siteDetail?.site_name} />
                  </TabsContent>
                </Tabs>
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
                let cell: CellProperties | undefined;
                if (siteDetail) cell = resolveCellFromDetail(siteDetail, focusCellId);
                if (!cell && selectedSiteSnapshot) cell = resolveCellFromDetail(selectedSiteSnapshot as SiteDetail, focusCellId);
                if (!cell && selectedSiteId) {
                  const fromSites = sites.find(s => s.site_id === selectedSiteId);
                  if (fromSites) cell = resolveCellFromDetail(fromSites as SiteDetail, focusCellId);
                }
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
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: cell.techno?.includes('5G') ? '#22c55e' : '#f97316' }}>
                      <Signal size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-extrabold text-foreground leading-tight tracking-tight uppercase truncate">
                        {cell.cell_id}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px]">
                        <span className="text-muted-foreground truncate max-w-[120px]">{siteDetail.site_name}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-bold px-1.5 py-0.5 rounded text-[9px] text-white" style={{ backgroundColor: is5GTech(cell.techno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316') }}>{cell.techno}</span>
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
                        <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
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
                  // Generate mock neighbors on first access
                  if (neighborCellId !== focusCellId) {
                    const nearbySitesForNeighbors = sites
                      .filter(s => s.site_id !== siteDetail?.site_id && s.cells.length > 0)
                      .slice(0, 15);
                    const mockNeighbors = generateMockNeighbors(
                      focusCellId!,
                      siteDetail?.coordinates || [0, 0],
                      nearbySitesForNeighbors,
                    );
                    setTimeout(() => {
                      setNeighborCellId(focusCellId);
                      setNeighborData(mockNeighbors);
                      setShowNeighborPanel(false);
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
                      {filtered.length === 0 ? (
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
                                  <td className="px-3 py-2 font-mono font-bold text-foreground truncate max-w-[140px]">
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
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ backgroundColor: is5GTech(n.targetTechno) ? (bandColors['5G_GROUP'] || '#22c55e') : (bandColors['4G_GROUP'] || '#f97316') }}>
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
