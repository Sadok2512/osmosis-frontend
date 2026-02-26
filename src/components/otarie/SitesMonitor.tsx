import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Crosshair, MousePointerClick, Radio, Plus, Minus
} from 'lucide-react';
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
const SECTOR_ZOOM_THRESHOLD = 12;

// Band-based color mapping for sector rendering
const BAND_COLORS: Record<string, string> = {
  // NR (5G) — purple tones
  NR3500: '#a855f7',  // purple-500
  NR700:  '#c084fc',  // purple-400
  NR2100: '#7c3aed',  // violet-600
  // LTE (4G) — blue tones
  L2600:  '#3b82f6',  // blue-500
  L2100:  '#60a5fa',  // blue-400
  L1800:  '#2563eb',  // blue-600
  L800:   '#93c5fd',  // blue-300
  L700:   '#1d4ed8',  // blue-700
};

const getBandColor = (bande: string): string => {
  if (!bande) return '#94a3b8'; // slate fallback
  // Normalize: "NR 3500" → "NR3500", "2100" with techno context
  const normalized = bande.replace(/\s+/g, '').toUpperCase();
  for (const [key, color] of Object.entries(BAND_COLORS)) {
    if (normalized.includes(key)) return color;
  }
  return '#94a3b8';
};

// Keep legacy techno color for modes that don't have bande info
const getTechnoColor = (techno: string): string => {
  if (techno === '5G') return '#a855f7'; // purple
  return '#3b82f6'; // blue
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
const FlyToSite = ({ coords }: { coords: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 15, { duration: 1 });
  }, [coords, map]);
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
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    },
  };

  const [mapTechnoFilter, setMapTechnoFilter] = useState<'ALL' | '5G' | '4G' | 'OFF'>('ALL');
  const [enabledBands, setEnabledBands] = useState<Set<string>>(new Set(Object.keys(BAND_COLORS)));
  const [showBandPanel, setShowBandPanel] = useState(true);
  const [sectorColorMode, setSectorColorMode] = useState<'topo' | 'kpi'>('topo');
  const [detailFullscreen, setDetailFullscreen] = useState(false);

  // LOS / Radio Profile state
  const [losDrawingMode, setLosDrawingMode] = useState(false);
  const [losTargetPoint, setLosTargetPoint] = useState<LatLng | null>(null);
  const [losSelectedCell, setLosSelectedCell] = useState<{ lat: number; lng: number; azimuth: number; hba: number; tilt: number; techno: string; bande: string; name: string } | null>(null);
  const [losEnableCurvature, setLosEnableCurvature] = useState(true);
  const [losEnableFresnel, setLosEnableFresnel] = useState(false);
  const [losEnableClutter, setLosEnableClutter] = useState(false);
  const [losClutterHeight, setLosClutterHeight] = useState(0);
  const [losTiltOverride, setLosTiltOverride] = useState(0);
  const [showLosPanel, setShowLosPanel] = useState(false);

  const { loading: losLoading, error: losError, profilePoints: losProfilePoints, analysis: losAnalysis, computeProfile: losComputeProfile } = useTerrainProfile();

  const losTotalDistance = losSelectedCell && losTargetPoint
    ? haversineDistance({ lat: losSelectedCell.lat, lng: losSelectedCell.lng }, losTargetPoint)
    : 0;

  const losFrequencyGHz = losSelectedCell ? (parseFloat(losSelectedCell.bande) > 0 ? parseFloat(losSelectedCell.bande) / 1000 : 1.8) : 1.8;
  const losFresnel = useFresnel(losProfilePoints, losAnalysis, losTotalDistance, losFrequencyGHz, losEnableFresnel);

  const handleLosMapClick = useCallback((latlng: LatLng) => {
    if (!losDrawingMode || !losSelectedCell) return;
    setLosTargetPoint(latlng);
    setLosDrawingMode(false);
    setShowLosPanel(true);
    losComputeProfile(
      { lat: losSelectedCell.lat, lng: losSelectedCell.lng },
      latlng,
      losSelectedCell.hba,
      losTiltOverride,
      losSelectedCell.azimuth,
      losEnableCurvature
    );
  }, [losDrawingMode, losSelectedCell, losComputeProfile, losTiltOverride, losEnableCurvature]);

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
    losComputeProfile(
      { lat: losSelectedCell.lat, lng: losSelectedCell.lng },
      losTargetPoint,
      losSelectedCell.hba,
      losTiltOverride,
      losSelectedCell.azimuth,
      losEnableCurvature
    );
  }, [losSelectedCell, losTargetPoint, losComputeProfile, losTiltOverride, losEnableCurvature]);

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
      if (value >= 100) return '#10b981';
      if (value >= 30) return '#f59e0b';
      return '#ef4444';
    }
    if (mapKpi === 'p50_thr_up_mbps') {
      if (value >= 20) return '#10b981';
      if (value >= 5) return '#f59e0b';
      return '#ef4444';
    }
    if (mapKpi === 'sessions') {
      if (value >= 2000) return '#10b981';
      if (value >= 500) return '#f59e0b';
      return '#ef4444';
    }
    if (value >= 80) return '#10b981';
    if (value >= 60) return '#f59e0b';
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
  const isBandEnabled = useCallback((bande: string) => {
    if (!bande) return true;
    const normalized = bande.replace(/\s+/g, '').toUpperCase();
    for (const key of enabledBands) {
      if (normalized.includes(key)) return true;
    }
    return false;
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

  const showSectors = viewport.zoom >= SECTOR_ZOOM_THRESHOLD && mapDisplayMode === 'sites';

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

  const handleSiteClick = (site: SiteSummary) => {
    setFlyTarget(site.coordinates);
    setSelectedSiteId(site.site_id);
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
        center={[43.2965, 5.3698]}
        zoom={15}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
      >
        <CustomZoomControl />
        <TileLayer
          key={mapLayer}
          url={TILE_URLS[mapLayer].url}
          attribution={TILE_URLS[mapLayer].attribution}
        />
        <FlyToSite coords={flyTarget} />
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
            : site.cells.filter(c => c.techno === mapTechnoFilter)).filter(c => isBandEnabled(c.bande));
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
          const radius = viewport.zoom >= 10 ? (isHovered ? 7 : 5) : (isHovered ? 5 : 3);
          return (
            <CircleMarker
              key={site.site_id}
              center={site.coordinates}
              radius={radius}
              pathOptions={{
                color: isHovered ? '#fff' : '#1e293b',
                fillColor: color,
                fillOpacity: 0.85,
                weight: isHovered ? 2 : 1,
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

        {/* Detailed sectors (only when zoomed in, sites mode) */}
        {showSectors && visibleSites.map(site => {
          const isHovered = hoveredSiteId === site.site_id;
          const zoomRadius = viewport.zoom >= 15 ? 900 : viewport.zoom >= 14 ? 700 : viewport.zoom >= 13 ? 550 : 400;
          return (
            <React.Fragment key={site.site_id}>
              {site.cells.filter(c => isBandEnabled(c.bande)).map(cell => {
                const sectorCoords = getSectorCoords(site.coordinates, cell.azimut, zoomRadius, 60);
                const color = sectorColorMode === 'topo' ? getBandColor(cell.bande) : getKpiColor(getCellKpiValue(cell));
                return (
                  <Polygon
                    key={cell.cell_id}
                    positions={sectorCoords}
                    pathOptions={{
                      color: isHovered ? 'rgba(255,255,255,0.6)' : color,
                      fillColor: color,
                      fillOpacity: isHovered ? 0.7 : 0.55,
                      weight: isHovered ? 2 : 1,
                      opacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} permanent={false} className="sector-tooltip">
                      <div className="px-3 py-2.5 min-w-[160px]">
                        <div className="text-[10px] font-black text-white/90 uppercase tracking-wider">{site.site_name}</div>
                        <div className="text-[9px] text-white/50 font-mono mt-0.5">{site.site_id}</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-[10px]"><span className="text-white/50">Technology</span><span className="font-bold text-white/90">{cell.techno}</span></div>
                          <div className="flex justify-between text-[10px]"><span className="text-white/50">Band</span><span className="font-bold text-white/90">{cell.bande} MHz</span></div>
                          <div className="flex justify-between text-[10px]"><span className="text-white/50">Azimuth</span><span className="font-bold text-white/90">{cell.azimut}°</span></div>
                          <div className="flex justify-between text-[10px]"><span className="text-white/50">Tilt</span><span className="font-bold text-white/90">{(cell as any).remote_electrical_tilt ?? '—'}°</span></div>
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
                  <Tooltip direction="bottom" offset={[0, 6]} permanent className="site-name-label">
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#1e293b',
                      textShadow: '0 0 4px rgba(255,255,255,0.9), 0 1px 2px rgba(255,255,255,0.8)',
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
      </MapContainer>

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
                site={{
                  name: losSelectedCell!.name,
                  techno: losSelectedCell!.techno,
                  bande: losSelectedCell!.bande,
                  azimuth: losSelectedCell!.azimuth,
                  hba: losSelectedCell!.hba,
                  tilt: losTiltOverride,
                }}
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

      {/* Floating top bar — redesigned KPI selector with grouped tabs */}
      <div className="absolute top-4 left-[420px] right-[80px] z-[1000] pointer-events-auto">
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-2">
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
                  onClick={() => setMapTechnoFilter(tech)}
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
              <div className="absolute right-12 top-0 bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => toggleAllBands('NR')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: '#a855f7' }}>
                      5G NR
                    </button>
                    <span className="text-[8px] font-bold text-muted-foreground/50">PURPLE</span>
                  </div>
                  <div className="space-y-1.5">
                    {(['NR3500', 'NR700', 'NR2100'] as const).map(band => (
                      <button
                        key={band}
                        onClick={() => toggleBand(band)}
                        className="flex items-center gap-2.5 w-full group"
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? BAND_COLORS[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </div>
                        <span className={`text-[11px] font-bold transition-all ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`}>{band}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* LTE group */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => toggleAllBands('LTE')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: '#3b82f6' }}>
                      4G LTE
                    </button>
                    <span className="text-[8px] font-bold text-muted-foreground/50">BLUE</span>
                  </div>
                  <div className="space-y-1.5">
                    {(['L2600', 'L2100', 'L1800', 'L800', 'L700'] as const).map(band => (
                      <button
                        key={band}
                        onClick={() => toggleBand(band)}
                        className="flex items-center gap-2.5 w-full group"
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                            enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                          }`}
                          style={{ background: enabledBands.has(band) ? BAND_COLORS[band] : 'transparent' }}
                        >
                          {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                        </div>
                        <span className={`text-[11px] font-bold transition-all ${
                          enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`}>{band}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {showLegend && (
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl overflow-hidden min-w-[220px]">
              <div className="flex items-center justify-between px-5 py-3">
                <button
                  onClick={() => setShowLegend(false)}
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-foreground transition-all"
                >
                  <X size={12} />
                </button>
                <div className="flex items-center gap-2.5">
                  <BarChart2 size={16} className="text-primary" />
                  <div>
                    <span className="text-[11px] font-black text-foreground uppercase tracking-widest block">Légende</span>
                    <span className="text-[8px] font-bold text-primary uppercase tracking-wider">{selectedKpiLabel}</span>
                  </div>
                </div>
              </div>
              {/* KPI thresholds */}
              <div className="px-5 pb-3 pt-1 space-y-2 border-t border-border">
                {[
                  { color: '#10b981', label: 'Excellent' },
                  { color: '#f59e0b', label: 'Correct' },
                  { color: '#f97316', label: 'Dégradé' },
                  { color: '#ef4444', label: 'Critique' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
                  </div>
                ))}
              </div>
              {/* Band colors — NR (clickable toggles) */}
              <div className="px-5 pb-2 pt-2 border-t border-border">
                <button onClick={() => toggleAllBands('NR')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: '#a855f7' }}>5G NR</button>
                <div className="mt-1.5 space-y-1.5">
                  {[
                    { band: 'NR3500', color: BAND_COLORS.NR3500 },
                    { band: 'NR700', color: BAND_COLORS.NR700 },
                    { band: 'NR2100', color: BAND_COLORS.NR2100 },
                  ].map(({ band, color }) => (
                    <button key={band} onClick={() => toggleBand(band)} className="flex items-center gap-2.5 w-full group cursor-pointer">
                      <div
                        className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                          enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                        }`}
                        style={{ background: enabledBands.has(band) ? color : 'transparent' }}
                      >
                        {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                      </div>
                      <span className={`text-[10px] font-bold transition-all ${
                        enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                      }`}>{band}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Band colors — LTE (clickable toggles) */}
              <div className="px-5 pb-4 pt-2 border-t border-border">
                <button onClick={() => toggleAllBands('LTE')} className="text-[9px] font-black uppercase tracking-widest hover:underline" style={{ color: '#3b82f6' }}>4G LTE</button>
                <div className="mt-1.5 space-y-1.5">
                  {[
                    { band: 'L2600', color: BAND_COLORS.L2600 },
                    { band: 'L2100', color: BAND_COLORS.L2100 },
                    { band: 'L1800', color: BAND_COLORS.L1800 },
                    { band: 'L800', color: BAND_COLORS.L800 },
                    { band: 'L700', color: BAND_COLORS.L700 },
                  ].map(({ band, color }) => (
                    <button key={band} onClick={() => toggleBand(band)} className="flex items-center gap-2.5 w-full group cursor-pointer">
                      <div
                        className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${
                          enabledBands.has(band) ? 'border-transparent' : 'border-muted-foreground/30 bg-transparent'
                        }`}
                        style={{ background: enabledBands.has(band) ? color : 'transparent' }}
                      >
                        {enabledBands.has(band) && <span className="text-white text-[8px] font-black">✓</span>}
                      </div>
                      <span className={`text-[10px] font-bold transition-all ${
                        enabledBands.has(band) ? 'text-foreground' : 'text-muted-foreground line-through'
                      }`}>{band}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {!showLegend && (
            <button
              onClick={() => setShowLegend(true)}
              className="w-10 h-10 bg-card/95 backdrop-blur-sm border border-border rounded-xl flex items-center justify-center shadow-lg hover:bg-muted transition-all"
            >
              <BarChart2 size={16} className="text-primary" />
            </button>
          )}
        </div>
      )}

      {/* Compact collapsible search module — replaces old Inventory Index */}
      {viewMode === 'map' && (
        <div className={`absolute top-4 left-4 z-[1000] pointer-events-auto transition-all duration-300 ease-in-out ${
          panelCollapsed ? 'w-12' : 'w-[380px]'
        }`}>
          {/* Collapsed icon-only state */}
          {panelCollapsed ? (
            <button
              onClick={() => setPanelCollapsed(false)}
              className="w-12 h-12 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all group"
              title="Open Site Search"
            >
              <Search size={18} className="group-hover:scale-110 transition-transform" />
              {/* Site count bubble */}
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-[9px] font-black rounded-full flex items-center justify-center shadow-md">
                {filteredSites.length}
              </span>
            </button>
          ) : (
            <div className="bg-card/98 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
              {/* Search header */}
              <div className="px-4 py-3 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Search Site ID or Name..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setLocalSearch(''); } }}
                    autoFocus
                    className="flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground min-w-0"
                  />
                  {localSearch && (
                    <button
                      onClick={() => setLocalSearch('')}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {/* Site count badge */}
                <button
                  onClick={() => setShowAllSites(!showAllSites)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all cursor-pointer hover:scale-110 ${
                    showAllSites ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' : 'bg-primary text-primary-foreground'
                  }`}
                  title={showAllSites ? 'Hide all sites' : 'Show all sites'}
                >
                  {filteredSites.length}
                </button>
                {/* Filter toggle */}
                <button
                  onClick={() => setPanelMinimized(!panelMinimized)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all shrink-0 ${
                    panelMinimized ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  title="Filters"
                >
                  <Filter size={14} />
                </button>
                {/* Collapse to icon */}
                <button
                  onClick={() => setPanelCollapsed(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0"
                  title="Collapse"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>

              {/* Collapsible filters row */}
              {panelMinimized && (
                <div className="px-4 pb-3 pt-1 border-t border-border grid grid-cols-2 gap-2 animate-fade-in">
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

              {/* Dynamic search results dropdown — shown when typing or showAllSites */}
              {(localSearch.length > 0 || showAllSites) && (
                <div className="border-t border-border max-h-[360px] overflow-y-auto">
                  {filteredSites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <Search size={24} className="mb-2 opacity-30" />
                      <span className="text-[11px] font-bold uppercase tracking-wider">No sites found</span>
                      <span className="text-[10px] text-muted-foreground mt-1">Try a different search term</span>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredSites.slice(0, 50).map(site => {
                        const isSelected = selectedSiteId === site.site_id;
                        return (
                          <button
                            key={site.site_id}
                            onClick={() => { handleSiteClick(site); setLocalSearch(''); setShowAllSites(false); }}
                            onMouseEnter={() => setHoveredSiteId(site.site_id)}
                            onMouseLeave={() => setHoveredSiteId(null)}
                            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all ${
                              isSelected
                                ? 'bg-primary/10 border-l-2 border-primary'
                                : 'hover:bg-muted/60 border-l-2 border-transparent'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                              <MapPin size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[12px] font-bold text-foreground tracking-tight uppercase truncate">{site.site_name}</h4>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono">{site.site_id}</span>
                                <span>•</span>
                                <span className="uppercase font-semibold">{site.vendor}</span>
                                <span>•</span>
                                <span>{site.cell_count} cells</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[14px] font-black tracking-tight" style={{ color: getQoEColor(site.qoe_score_avg) }}>
                                {site.qoe_score_avg.toFixed(1)}%
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {filteredSites.length > 50 && (
                        <div className="px-4 py-2.5 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-t border-border">
                          + {filteredSites.length - 50} more — refine search
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

      {/* RIGHT SIDE DETAIL PANEL — Analyse Détaillée */}
      {siteDetail && (
        <div className={`absolute z-[1000] bg-card/98 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
          detailFullscreen
            ? 'inset-3'
            : 'top-4 right-4 bottom-4 w-[400px]'
        }`}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-border shrink-0 flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-black text-foreground uppercase tracking-[0.12em]">Analyse Détaillée</h3>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Focus Cellule • NOC Monitoring</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetailFullscreen(!detailFullscreen)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                {detailFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => { setSelectedSiteId(null); setDetailFullscreen(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content — adaptive layout */}
          <div className={`flex-1 overflow-y-auto p-5 ${detailFullscreen ? '' : 'space-y-5'}`}>
            {detailFullscreen ? (
              /* ===== FULLSCREEN LAYOUT ===== */
              <div className="grid grid-cols-3 gap-5 h-full">
                {/* LEFT COLUMN — Site Identity + KPIs */}
                <div className="flex flex-col gap-5 overflow-y-auto pr-2">
                  {/* Site header */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-sidebar rounded-2xl flex items-center justify-center shadow-lg">
                      <Signal size={26} className="text-sidebar-primary" />
                    </div>
                    <div>
                      <h4 className="text-[18px] font-black text-foreground uppercase tracking-tight">{siteDetail.site_name}</h4>
                      <div className="flex items-center gap-2 text-[11px] mt-0.5">
                        <span className="font-mono text-muted-foreground">{siteDetail.site_id}</span>
                        <span>•</span>
                        <span className="font-bold text-primary uppercase">{siteDetail.vendor}</span>
                        <span>•</span>
                        <span className="font-bold text-muted-foreground uppercase">{siteDetail.dor}</span>
                      </div>
                    </div>
                  </div>

                  {/* QoE Score hero */}
                  <div className="bg-sidebar rounded-2xl p-5 text-center">
                    <div className="text-[9px] font-bold text-sidebar-foreground/60 uppercase tracking-widest mb-2">Score QoE Global</div>
                    <div className="text-[48px] font-black tracking-tighter leading-none" style={{ color: getQoEColor(siteDetail.qoe_score_avg ?? 0) }}>
                      {(siteDetail.qoe_score_avg ?? 0).toFixed(1)}%
                    </div>
                    <div className="w-full h-1.5 rounded-full mt-3 bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${siteDetail.qoe_score_avg ?? 0}%`, background: getQoEColor(siteDetail.qoe_score_avg ?? 0) }} />
                    </div>
                  </div>

                  {/* DMS KPIs */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'DMS DL 3M', value: siteDetail.dms_dl_3 },
                      { label: 'DMS DL 8M', value: siteDetail.dms_dl_8 },
                      { label: 'DMS DL 30M', value: siteDetail.dms_dl_30 },
                      { label: 'DMS UL 3M', value: siteDetail.dms_ul_3 },
                    ].map((kpi, i) => (
                      <div key={i} className="text-center p-3 rounded-xl border border-border bg-card">
                        <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</div>
                        <div className="text-[18px] font-black tracking-tight" style={{ color: getKpiColor(kpi.value ?? 0) }}>
                          {(kpi.value ?? 0).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Throughput & RTT row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Débit DL', value: `${(siteDetail.p50_thr_dn_mbps ?? 0).toFixed(0)}`, unit: 'Mbps', icon: <Zap size={16} className="text-primary" /> },
                      { label: 'Débit UL', value: `${(siteDetail.p50_thr_up_mbps ?? 0).toFixed(0)}`, unit: 'Mbps', icon: <Network size={16} className="text-primary" /> },
                      { label: 'RTT P95', value: `${(siteDetail.p95_rtt_ms ?? 0).toFixed(0)}`, unit: 'ms', icon: <Activity size={16} className="text-primary" /> },
                    ].map((m, i) => (
                      <div key={i} className="text-center p-3 rounded-xl border border-border bg-card">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1">{m.icon}</div>
                        <div className="text-[8px] font-bold text-muted-foreground uppercase">{m.label}</div>
                        <div className="text-[18px] font-black text-foreground tracking-tight">{m.value}<span className="text-[9px] font-bold text-muted-foreground ml-0.5">{m.unit}</span></div>
                      </div>
                    ))}
                  </div>

                  {/* AI Diagnostic card */}
                  <div className="bg-sidebar rounded-2xl p-5 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-sidebar-primary/20 rounded-xl flex items-center justify-center">
                        <Settings2 size={20} className="text-sidebar-primary" />
                      </div>
                      <div>
                        <div className="text-[13px] font-black text-sidebar-foreground uppercase tracking-tight">AI Diagnostic</div>
                        <div className="text-[9px] font-bold text-sidebar-foreground/50 uppercase tracking-wider">RCA Analysis</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { if (siteDetail && onLaunchAI) onLaunchAI(siteDetail.site_name); }}
                      className="px-5 py-2.5 bg-card text-foreground rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-2 shadow-sm">
                      <Zap size={13} />
                      Lancer
                    </button>
                  </div>

                  {/* Radio Profile LOS button */}
                  <button
                    onClick={() => { if (siteDetail) handleStartLosDrawing(siteDetail); }}
                    className="w-full bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-center justify-between hover:bg-primary/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-primary/20 rounded-xl flex items-center justify-center">
                        <Radio size={20} className="text-primary" />
                      </div>
                      <div className="text-left">
                        <div className="text-[13px] font-black text-foreground uppercase tracking-tight">Profil Radio</div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">LOS / Fresnel / Terrain</div>
                      </div>
                    </div>
                    <div className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-sm group-hover:opacity-90 transition-opacity">
                      <Crosshair size={13} />
                      Tracer
                    </div>
                  </button>
                </div>

                {/* CENTER COLUMN — KPI Evolution Graph (full height) */}
                <div className="flex flex-col gap-5 overflow-y-auto">
                  <div className="rounded-xl border border-border bg-card p-5 flex-1 flex flex-col">
                    <h5 className="text-[11px] font-black text-foreground uppercase tracking-widest flex items-center gap-2 mb-3">
                      <BarChart2 size={14} className="text-primary" />
                      Evolution Temporelle des KPIs
                    </h5>
                    <div className="flex-1 min-h-[300px]">
                      <SiteKpiChart siteDetail={siteDetail} fullHeight />
                    </div>
                  </div>

                  {/* Mini-map with site location */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden h-[200px]">
                    <MapContainer
                      center={siteDetail.coordinates}
                      zoom={14}
                      style={{ height: '100%', width: '100%' }}
                      zoomControl={false}
                      dragging={false}
                      scrollWheelZoom={false}
                    >
                      <TileLayer url={TILE_URLS[mapLayer].url} attribution="" />
                      {siteDetail.cells.map((cell: any, idx: number) => {
                        const color = getTechnoColor(cell.techno);
                        const coords = getSectorCoords(siteDetail.coordinates, cell.azimut || idx * 120, 200, 65);
                        return (
                          <Polygon
                            key={cell.cell_id}
                            positions={coords}
                            pathOptions={{ color, fillColor: color, fillOpacity: 0.4, weight: 2 }}
                          />
                        );
                      })}
                      <CircleMarker center={siteDetail.coordinates} radius={5} pathOptions={{ color: '#1e293b', fillColor: '#1e293b', fillOpacity: 1, weight: 2 }} />
                    </MapContainer>
                  </div>
                </div>

                {/* RIGHT COLUMN — Sector Inventory + Topology */}
                <div className="flex flex-col gap-5 overflow-y-auto pl-2">
                  {/* Topology info */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h5 className="text-[11px] font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                      <Database size={14} className="text-primary" />
                      Topologie
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Vendor', value: siteDetail.vendor },
                        { label: 'DOR', value: siteDetail.dor },
                        { label: 'Plaque', value: siteDetail.plaque || '—' },
                        { label: 'Department', value: siteDetail.department || '—' },
                        { label: 'Latitude', value: siteDetail.coordinates[0].toFixed(5) },
                        { label: 'Longitude', value: siteDetail.coordinates[1].toFixed(5) },
                        { label: 'Total Cells', value: `${siteDetail.cell_count}` },
                        { label: 'Technologies', value: [...new Set(siteDetail.cells.map((c: any) => c.techno))].join(' / ') },
                      ].map((item, i) => (
                        <div key={i} className="px-3 py-2 bg-muted/50 rounded-lg">
                          <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</div>
                          <div className="text-[11px] font-bold text-foreground mt-0.5">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sector Inventory */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3 flex-1">
                    <h5 className="text-[11px] font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                      <BarChart2 size={14} className="text-primary" />
                      Sector Inventory
                    </h5>
                    {(() => {
                      const { sectors, validation } = groupCellsBySector(siteDetail.cells);
                      return (
                        <div className="space-y-2">
                          {validation.status !== 'OK' && (
                            <div className={`text-[9px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl ${
                              validation.status === 'MISSING_SECTOR' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}>
                              {validation.status === 'MISSING_SECTOR'
                                ? `⚠ Missing: ${validation.missingSectors.join(', ')}`
                                : `⚠ Duplicate sector`}
                            </div>
                          )}
                          {validation.status === 'OK' && (
                            <div className="text-[9px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                              ✓ {validation.totalSectors} sectors — All OK
                            </div>
                          )}
                          {sectors.map(({ sectorNumber, cells: sectorCells }) => (
                            <div key={sectorNumber} className="rounded-xl border border-border overflow-hidden">
                              <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
                                <span className="text-[10px] font-black text-foreground uppercase tracking-wider">Sector {sectorNumber}</span>
                                <span className="text-[9px] font-bold text-muted-foreground">{sectorCells.length} cell{sectorCells.length > 1 ? 's' : ''} • {sectorCells[0]?.azimut ?? '?'}°</span>
                              </div>
                              <div className="divide-y divide-border/50">
                                {sectorCells.map(cell => (
                                  <div
                                    key={cell.cell_id}
                                    onClick={() => onCellSelect(cell.cell_id)}
                                    className="flex items-center justify-between px-3 py-2 bg-card hover:bg-primary/5 transition-all cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${cell.techno === '5G' ? 'bg-primary' : 'bg-amber-500'}`} />
                                      <div>
                                        <div className="text-[10px] font-bold text-foreground">{cell.techno} • {cell.bande}MHz</div>
                                        <div className="text-[8px] text-muted-foreground font-mono">{cell.cell_id.split('_').pop()}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-black tracking-tight" style={{ color: getQoEColor(cell.qoe_score_avg) }}>
                                        {cell.qoe_score_avg.toFixed(1)}%
                                      </span>
                                      <ArrowRight size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              /* ===== COMPACT SIDEBAR LAYOUT (original) ===== */
              <div className="space-y-5">
                {/* Site Simulation header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-sidebar rounded-2xl flex items-center justify-center shadow-lg">
                    <Signal size={26} className="text-sidebar-primary" />
                  </div>
                  <div>
                    <h4 className="text-[18px] font-black text-foreground uppercase tracking-tight leading-tight">Site Simulation</h4>
                    <div className="flex items-center gap-2 text-[11px] mt-1">
                      <span className="font-mono text-muted-foreground">{siteDetail.site_id}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-black text-primary uppercase">{siteDetail.cells[0]?.techno} {siteDetail.cells[0]?.bande}MHz</span>
                    </div>
                  </div>
                </div>

                {/* DMS KPI row */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'DMS DL 3M', value: siteDetail.cells[0]?.dms_dl_3 },
                    { label: 'DMS DL 8M', value: siteDetail.cells[0]?.dms_dl_8 },
                    { label: 'DMS DL 30M', value: siteDetail.cells[0]?.dms_dl_30 },
                    { label: 'DMS UL 3M', value: siteDetail.cells[0]?.dms_ul_3 },
                  ].map((kpi, i) => (
                    <div key={i} className="text-center p-3 rounded-xl border border-border bg-card">
                      <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{kpi.label}</div>
                      <div className="text-[16px] font-black tracking-tight" style={{ color: getKpiColor(kpi.value ?? 0) }}>
                        {(kpi.value ?? 0).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* QoE Score + Throughput */}
                <div className="grid grid-cols-4 gap-3 items-end">
                  <div className="text-center">
                    <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Score QoE Global</div>
                    <div className="text-[32px] font-black tracking-tighter leading-none" style={{ color: getQoEColor(siteDetail.qoe_score_avg ?? 0) }}>
                      {(siteDetail.qoe_score_avg ?? 0).toFixed(1)}%
                    </div>
                    <div className="w-full h-1.5 rounded-full mt-2.5" style={{ background: getQoEColor(siteDetail.qoe_score_avg ?? 0) }} />
                  </div>
                  <div className="text-center p-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                      <Zap size={16} className="text-primary" />
                    </div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase">Débit DL</div>
                    <div className="text-[18px] font-black text-foreground tracking-tight">{(siteDetail.p50_thr_dn_mbps ?? 0).toFixed(0)}<span className="text-[10px] font-bold text-muted-foreground ml-0.5">M</span></div>
                  </div>
                  <div className="text-center p-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                      <Network size={16} className="text-primary" />
                    </div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase">Débit UL</div>
                    <div className="text-[18px] font-black text-foreground tracking-tight">{(siteDetail.p50_thr_up_mbps ?? 0).toFixed(0)}<span className="text-[10px] font-bold text-muted-foreground ml-0.5">M</span></div>
                  </div>
                  <div className="text-center p-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                      <Activity size={16} className="text-primary" />
                    </div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase">RTT</div>
                    <div className="text-[18px] font-black text-foreground tracking-tight">{(siteDetail.p95_rtt_ms ?? 0).toFixed(0)}<span className="text-[10px] font-bold text-muted-foreground ml-0.5">MS</span></div>
                  </div>
                </div>

                {/* AI Diagnostic card — dark themed */}
                <div className="bg-sidebar rounded-2xl p-5 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-sidebar-primary/20 rounded-xl flex items-center justify-center">
                      <Settings2 size={20} className="text-sidebar-primary" />
                    </div>
                    <div>
                      <div className="text-[13px] font-black text-sidebar-foreground uppercase tracking-tight">AI Diagnostic</div>
                      <div className="text-[9px] font-bold text-sidebar-foreground/50 uppercase tracking-wider">RCA Analysis</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (siteDetail && onLaunchAI) onLaunchAI(siteDetail.site_name); }}
                    className="px-5 py-2.5 bg-card text-foreground rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-2 shadow-sm">
                    <Zap size={13} />
                    Lancer
                  </button>
                </div>

                {/* Radio Profile LOS button */}
                <button
                  onClick={() => { if (siteDetail) handleStartLosDrawing(siteDetail); }}
                  className="w-full bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-center justify-between hover:bg-primary/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary/20 rounded-xl flex items-center justify-center">
                      <Radio size={20} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] font-black text-foreground uppercase tracking-tight">Profil Radio</div>
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">LOS / Fresnel / Terrain</div>
                    </div>
                  </div>
                  <div className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-sm group-hover:opacity-90 transition-opacity">
                    <Crosshair size={13} />
                    Tracer
                  </div>
                </button>

                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <h5 className="text-[10px] font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                    <BarChart2 size={13} className="text-primary" />
                    Evolution Temporelle des KPIs
                  </h5>
                  <SiteKpiChart siteDetail={siteDetail} />
                </div>

                {/* Sector Inventory */}
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                    <BarChart2 size={13} className="text-primary" />
                    Sector Inventory
                  </h5>
                  {(() => {
                    const { sectors, validation } = groupCellsBySector(siteDetail.cells);
                    return (
                      <div className="space-y-3">
                        {validation.status !== 'OK' && (
                          <div className={`text-[9px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl ${
                            validation.status === 'MISSING_SECTOR' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}>
                            {validation.status === 'MISSING_SECTOR'
                              ? `⚠ Missing sector${validation.missingSectors.length > 1 ? 's' : ''}: ${validation.missingSectors.join(', ')} — Expected ${validation.totalSectors + validation.missingSectors.length} sectors`
                              : `⚠ Duplicate sector detected`}
                          </div>
                        )}
                        {validation.status === 'OK' && (
                          <div className="text-[9px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                            ✓ {validation.totalSectors} sectors — All OK
                          </div>
                        )}
                        {sectors.map(({ sectorNumber, cells: sectorCells }) => (
                          <div key={sectorNumber} className="rounded-xl border border-border overflow-hidden">
                            <div className="px-4 py-2 bg-muted/50 flex items-center justify-between">
                              <span className="text-[10px] font-black text-foreground uppercase tracking-wider">Sector {sectorNumber}</span>
                              <span className="text-[9px] font-bold text-muted-foreground">{sectorCells.length} cell{sectorCells.length > 1 ? 's' : ''} • {sectorCells[0]?.azimut ?? '?'}°</span>
                            </div>
                            <div className="divide-y divide-border/50">
                              {sectorCells.map(cell => (
                                <div
                                  key={cell.cell_id}
                                  onClick={() => onCellSelect(cell.cell_id)}
                                  className="flex items-center justify-between px-4 py-2.5 bg-card hover:bg-primary/5 transition-all cursor-pointer group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${cell.techno === '5G' ? 'bg-primary' : 'bg-amber-500'}`} />
                                    <div>
                                      <div className="text-[10px] font-bold text-foreground">{cell.techno} • {cell.bande}MHz</div>
                                      <div className="text-[8px] text-muted-foreground font-mono">{cell.cell_id.split('_').pop()}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-black tracking-tight" style={{ color: getQoEColor(cell.qoe_score_avg) }}>
                                      {cell.qoe_score_avg.toFixed(1)}%
                                    </span>
                                    <ArrowRight size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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

const KPI_SERIES = [
  { key: 'QoE', color: '#1e293b', label: 'QOE' },
  { key: 'DMS 3M', color: '#10b981', label: 'DMS 3M' },
  { key: 'DMS 8M', color: '#f59e0b', label: 'DMS 8M' },
  { key: 'DMS 30M', color: '#f97316', label: 'DMS 30M' },
  { key: 'DMS UL', color: '#ec4899', label: 'DMS UL' },
];

const SiteKpiChart = ({ siteDetail, fullHeight }: { siteDetail: any; fullHeight?: boolean }) => {
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(KPI_SERIES.map(k => k.key)));
  const data = useMemo(() => generateSiteTimeSeries(siteDetail), [siteDetail]);

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
      {/* Toggle chips */}
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
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SitesMonitor;
