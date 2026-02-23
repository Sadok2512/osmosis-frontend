import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Tooltip, useMapEvents, Marker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

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
import { invalidateSitesCache } from '../../services/mockData';
import { SiteSummary, SiteDetail, Filters } from '../../types';
import {
  Search, RefreshCw, ChevronLeft, MapPin,
  Zap, Network, Database, Activity, ArrowRight,
  SlidersHorizontal, ChevronRight, LayoutGrid, List, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen, Filter, X, Maximize2, Minimize2,
  ChevronDown, ChevronUp, BarChart2
} from 'lucide-react';
import { getQoEColor, VENDORS, DORS, DEPARTMENTS, PLAQUES, RATS } from '../../constants';

interface SitesMonitorProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onCellSelect: (cellId: string) => void;
  highlightedCellIds?: string[];
  onClearHighlights?: () => void;
}

// Zoom threshold: above this we show sectors, below we show clusters
const SECTOR_ZOOM_THRESHOLD = 13;

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

// Track map viewport (bounds + zoom)
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
const createClusterCustomIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  let size = 'small';
  let dim = 36;
  if (count >= 100) { size = 'large'; dim = 50; }
  else if (count >= 10) { size = 'medium'; dim = 42; }

  return L.divIcon({
    html: `<div style="
      background: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      width: ${dim}px; height: ${dim}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: ${dim > 42 ? 14 : 12}px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 3px solid hsl(var(--background));
    ">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim, true),
  });
};

// Lightweight site marker icon
const createSiteIcon = (color: string) => {
  return L.divIcon({
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:${color};border:2px solid #1e293b;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    className: 'site-dot-icon',
    iconSize: L.point(12, 12),
    iconAnchor: L.point(6, 6),
  });
};

const SitesMonitor: React.FC<SitesMonitorProps> = ({ filters, onFilterChange, onCellSelect, highlightedCellIds = [], onClearHighlights }) => {
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
  const [localVendor, setLocalVendor] = useState('ALL');
  const [localDor, setLocalDor] = useState('ALL');
  const [localPlaque, setLocalPlaque] = useState('ALL');
  const [localSite, setLocalSite] = useState('ALL');
  const [mapKpi, setMapKpi] = useState('qoe_score_avg');
  const [showKpiDropdown, setShowKpiDropdown] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [viewport, setViewport] = useState<ViewportState>({ bounds: null, zoom: 6 });
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

  const [mapTechnoFilter, setMapTechnoFilter] = useState<'ALL' | '5G' | '4G' | 'NONE'>('ALL');

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

  // Sites filtered by techno (for map rendering only)
  const mapFilteredSites = useMemo(() => {
    if (mapTechnoFilter === 'NONE') return [];
    if (mapTechnoFilter === 'ALL') return filteredSites;
    return filteredSites.filter(s => s.cells.some(c => c.techno === mapTechnoFilter));
  }, [filteredSites, mapTechnoFilter]);

  // Unique site names for site filter dropdown
  const uniqueSiteNames = useMemo(() => {
    const names = [...new Set(sites.map(s => s.site_name))].sort();
    return ['ALL', ...names];
  }, [sites]);

  // Sites visible in current viewport (for map rendering)
  const visibleSites = useMemo(() => {
    if (!viewport.bounds) return mapFilteredSites;
    return mapFilteredSites.filter(s => viewport.bounds!.contains(L.latLng(s.coordinates[0], s.coordinates[1])));
  }, [mapFilteredSites, viewport.bounds]);

  const showSectors = viewport.zoom >= SECTOR_ZOOM_THRESHOLD && mapDisplayMode === 'sites';

  // Heatmap data points: [lat, lng, intensity]
  const heatmapPoints = useMemo((): [number, number, number][] => {
    if (mapDisplayMode !== 'heatmap') return [];
    return mapFilteredSites.map(s => {
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

  const handleViewportChange = useCallback((v: ViewportState) => {
    setViewport(v);
  }, []);

  const updateFilter = (key: keyof Filters, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleSiteClick = (site: SiteSummary) => {
    setFlyTarget(site.coordinates);
    setSelectedSiteId(site.site_id);
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-3 bg-background">
      <RefreshCw className="w-10 h-10 text-primary animate-spin" />
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Loading sites...</p>
    </div>
  );

  if (selectedSiteId && detailLoading) return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 bg-background">
      <RefreshCw className="w-12 h-12 text-primary animate-spin" />
      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Loading site detail...</p>
    </div>
  );

  // Drill-down view
  if (siteDetail) {
    return (
      <div className="flex-1 flex flex-col bg-background overflow-hidden h-full">
        <div className="px-10 py-6 border-b border-border flex items-center justify-between bg-card z-20 shadow-sm shrink-0">
          <div className="flex items-center gap-8">
            <button onClick={() => setSelectedSiteId(null)} className="w-12 h-12 bg-sidebar text-sidebar-foreground rounded-[1.25rem] flex items-center justify-center hover:opacity-90 transition-all shadow-lg">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase">{siteDetail.site_name}</h2>
                <div className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-black uppercase tracking-widest">{siteDetail.vendor}</div>
              </div>
              <div className="flex items-center gap-2.5 mt-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <MapPin className="w-3.5 h-3.5" />
                <span>{siteDetail.site_id} • {siteDetail.dor} • {siteDetail.plaque}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">QoE Site Avg</div>
            <div className="text-3xl font-black tracking-tighter" style={{ color: getQoEColor(siteDetail.qoe_score_avg) }}>{siteDetail.qoe_score_avg.toFixed(1)}%</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat label="Cells" value={siteDetail.cell_count.toString()} icon={<Network size={16} />} color="text-primary" />
            <MiniStat label="Thr. DL" value={`${siteDetail.p50_thr_dn_mbps.toFixed(1)}M`} icon={<Zap size={16} />} color="text-emerald-600" />
            <MiniStat label="Vol DL" value={`${(siteDetail.traffic_dn_bytes / 1e12).toFixed(1)}T`} icon={<Database size={16} />} color="text-purple-600" />
            <MiniStat label="Latence" value={`${siteDetail.p95_rtt_ms.toFixed(0)}ms`} icon={<Activity size={16} />} color="text-amber-600" />
          </div>

          <div className="rounded-[2rem] overflow-hidden border border-border shadow-sm h-[250px]">
            <MapContainer center={siteDetail.coordinates} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' />
              {/* Sector wedges */}
              {siteDetail.cells.map(cell => {
                const sectorCoords = getSectorCoords(siteDetail.coordinates, cell.azimut, 200, 65);
                const color = getKpiColor(getCellKpiValue(cell));
                return (
                  <Polygon
                    key={`sector-${cell.cell_id}`}
                    positions={sectorCoords}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.3,
                      weight: 2,
                    }}
                  >
                    <Tooltip direction="center" permanent className="cell-kpi-label">
                      <span style={{ color, fontWeight: 800, fontSize: '9px' }}>{cell.azimut}° {cell.techno}</span>
                    </Tooltip>
                  </Polygon>
                );
              })}
              {/* Center dot */}
              <CircleMarker center={siteDetail.coordinates} radius={6} pathOptions={{ color: '#1e293b', fillColor: getQoEColor(siteDetail.qoe_score_avg), fillOpacity: 1, weight: 2 }}>
                <Popup><strong>{siteDetail.site_name}</strong></Popup>
              </CircleMarker>
            </MapContainer>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-[11px] font-black text-foreground uppercase tracking-widest">Cell Inventory</h4>
              <span className="text-[9px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded">{siteDetail.cells.length} sectors</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {siteDetail.cells.map(cell => (
                <div key={cell.cell_id} onClick={() => onCellSelect(cell.cell_id)}
                  className="bg-card p-6 rounded-[2.5rem] border border-border shadow-sm hover:border-primary transition-all cursor-pointer group hover:shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[11px] font-black text-muted-foreground tracking-widest">{cell.cell_id.split('_').pop()}</div>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black text-white ${cell.techno === '5G' ? 'bg-purple-600' : 'bg-primary'}`}>{cell.techno}</div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[15px] font-black text-foreground tracking-tighter">QoE: {cell.qoe_score_avg.toFixed(1)}%</div>
                      <div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-widest">{cell.bande} MHz • {cell.azimut}°</div>
                    </div>
                    <div className="p-3 bg-muted rounded-xl text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-all"><ArrowRight size={18} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main view — full screen map with clustering
  return (
    <div className="absolute inset-0 bg-background overflow-hidden">
      {/* FULL SCREEN MAP */}
      <MapContainer
        center={[43.2965, 5.3698]}
        zoom={15}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
          key={mapLayer}
          url={TILE_URLS[mapLayer].url}
          attribution={TILE_URLS[mapLayer].attribution}
        />
        <FlyToSite coords={flyTarget} />
        <MapViewportTracker onViewportChange={handleViewportChange} />

        {/* Heatmap layer */}
        {mapDisplayMode === 'heatmap' && (
          <HeatmapLayer points={heatmapPoints} radius={35} blur={25} minOpacity={0.3} />
        )}

        {/* Points mode — individual cell markers colored by KPI threshold */}
        {mapDisplayMode === 'points' && mapFilteredSites.map(site => {
          const showCellLabels = viewport.zoom >= 13;
          const cellsToRender = mapTechnoFilter === 'ALL' ? site.cells
            : site.cells.filter(c => c.techno === mapTechnoFilter);
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

        {/* Sites mode — Clustered markers (shown below sector zoom) */}
        {mapDisplayMode === 'sites' && !showSectors && (
          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterCustomIcon}
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            zoomToBoundsOnClick
            disableClusteringAtZoom={SECTOR_ZOOM_THRESHOLD}
          >
            {mapFilteredSites.map(site => {
              const color = getKpiColor(getCellKpiValue(site.cells[0] || {}));
              return (
                <Marker
                  key={site.site_id}
                  position={site.coordinates}
                  icon={createSiteIcon(color)}
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
                        {selectedKpiLabel}: {(site as any)[mapKpi]?.toFixed?.(1) ?? site.qoe_score_avg.toFixed(1)}
                      </div>
                      <div className="text-xs mt-1">{site.cell_count} cells • {site.dor}</div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* Detailed sectors (only when zoomed in, sites mode) */}
        {showSectors && visibleSites.map(site => {
          const isHovered = hoveredSiteId === site.site_id;
          return (
            <React.Fragment key={site.site_id}>
              {site.cells.map(cell => {
                const sectorCoords = getSectorCoords(site.coordinates, cell.azimut, 350, 65);
                const kpiVal = getCellKpiValue(cell);
                const color = getKpiColor(kpiVal);
                return (
                  <Polygon
                    key={cell.cell_id}
                    positions={sectorCoords}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: isHovered ? 0.35 : 0.2,
                      weight: isHovered ? 2 : 1,
                      dashArray: '6 4',
                    }}
                    eventHandlers={{
                      click: () => handleSiteClick(site),
                      mouseover: () => setHoveredSiteId(site.site_id),
                      mouseout: () => setHoveredSiteId(null),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} permanent={false}>
                      <div className="text-center">
                        <div className="font-bold text-xs">{cell.azimut}° {cell.techno}</div>
                        <div className="text-[10px]">{cell.bande} MHz</div>
                        <div className="font-bold text-xs" style={{ color }}>{selectedKpiLabel}: {kpiVal.toFixed(1)}</div>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              })}
              <CircleMarker
                center={site.coordinates}
                radius={isHovered ? 7 : 5}
                pathOptions={{
                  color: '#1e293b',
                  fillColor: getKpiColor(getCellKpiValue(site.cells[0] || {})),
                  fillOpacity: 1,
                  weight: 2,
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
                    <div className="text-sm font-bold mt-2" style={{ color: getKpiColor(getCellKpiValue(site.cells[0] || {})) }}>
                      {selectedKpiLabel}: {(site as any)[mapKpi]?.toFixed?.(1) ?? site.qoe_score_avg.toFixed(1)}
                    </div>
                    <div className="text-xs mt-1">{site.cell_count} cells • {site.dor}</div>
                  </div>
                </Popup>
              </CircleMarker>
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
      </MapContainer>

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

      {/* Floating top bar — KPI selector + controls */}
      <div className="absolute top-4 right-4 z-[1000] flex items-start gap-3 pointer-events-none">
        <div className="pointer-events-auto relative">
          <button
            onClick={() => setShowKpiDropdown(!showKpiDropdown)}
            className="flex items-center gap-3 px-5 py-3 bg-sidebar text-sidebar-foreground rounded-xl shadow-xl hover:opacity-90 transition-all"
          >
            <Zap size={16} className="text-sidebar-primary" />
            <span className="text-[12px] font-bold uppercase tracking-wider">{selectedKpiLabel}</span>
            {showKpiDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showKpiDropdown && (
            <div className="absolute top-14 right-0 w-[320px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" placeholder="Search KPIs..." className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground" />
                </div>
              </div>
              <div className="max-h-[350px] overflow-y-auto py-1">
                {MAP_KPIS.map(kpi => (
                  <button
                    key={kpi.id}
                    onClick={() => { setMapKpi(kpi.id); setShowKpiDropdown(false); }}
                    className={`w-full text-left px-5 py-3.5 flex items-center justify-between transition-all ${
                      mapKpi === kpi.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-tight">{kpi.label}</div>
                      <div className={`text-[9px] font-semibold uppercase tracking-widest mt-0.5 ${mapKpi === kpi.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{kpi.category}</div>
                    </div>
                    {mapKpi === kpi.id && <span className="text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="pointer-events-auto w-10 h-10 bg-card border border-border rounded-xl flex items-center justify-center text-foreground shadow-lg hover:bg-muted transition-all">
          <BarChart2 size={18} />
        </button>
        <button className="pointer-events-auto w-10 h-10 bg-card border border-border rounded-xl flex items-center justify-center text-foreground shadow-lg hover:bg-muted transition-all">
          <Maximize2 size={18} />
        </button>
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
              {(['ALL', '5G', '4G'] as const).map((tech) => (
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

          {/* Legend */}
          <div className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="w-full px-5 py-3 flex items-center justify-between gap-6 hover:bg-muted/50 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <BarChart2 size={16} className="text-primary" />
                <span className="text-[11px] font-black text-foreground uppercase tracking-widest">Légende</span>
              </div>
              {showLegend ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
            </button>
            {showLegend && (
              <div className="px-5 pb-4 pt-1 space-y-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#10b981' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#10b981' }}>Excellent</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">≥ 80%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>Correct</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">60–80%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#ef4444' }}>Critique</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">{'< 60%'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating side panel with search, filters & site list */}
      {showSidePanel && viewMode === 'map' && (
        <div className={`absolute top-4 left-4 ${panelCollapsed ? '' : 'bottom-4'} w-[340px] z-[1000] bg-card/98 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col`}>
          {/* Search bar */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search Site ID or Name..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground min-w-0"
              />
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0"
                title={panelCollapsed ? 'Afficher la liste' : 'Masquer la liste'}
              >
                {panelCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>
          {!panelCollapsed && (
            <>
              {/* Collapsible filters */}
              <div className="shrink-0 border-b border-border">
                <button
                  onClick={() => setPanelMinimized(!panelMinimized)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Filter size={13} className="text-primary" />
                    <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Filtres</span>
                  </div>
                  {panelMinimized ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
                </button>
                {!panelMinimized && (
                  <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Vendor</span>
                      <select value={localVendor} onChange={(e) => setLocalVendor(e.target.value)}
                        className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                        {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">DOR</span>
                      <select value={localDor} onChange={(e) => setLocalDor(e.target.value)}
                        className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                        {DORS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Plaque</span>
                      <select value={localPlaque} onChange={(e) => setLocalPlaque(e.target.value)}
                        className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary transition-all">
                        {PLAQUES.map(p => <option key={p} value={p}>{p}</option>)}
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
              </div>

              {/* Site list */}
              <div className="flex-1 overflow-y-auto">
                {filteredSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search size={28} className="mb-3 opacity-30" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">No sites found</span>
                  </div>
                ) : filteredSites.slice(0, 200).map(site => (
                  <div
                    key={site.site_id}
                    onClick={() => handleSiteClick(site)}
                    onMouseEnter={() => setHoveredSiteId(site.site_id)}
                    onMouseLeave={() => setHoveredSiteId(null)}
                    className={`px-4 py-3 border-b border-border/50 cursor-pointer transition-all hover:bg-primary/5 ${
                      hoveredSiteId === site.site_id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-[12px] font-bold text-foreground tracking-tight uppercase">{site.site_name}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{site.site_id}</span>
                          <span className="uppercase">{site.vendor}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-black tracking-tight" style={{ color: getQoEColor(site.qoe_score_avg) }}>
                          {site.qoe_score_avg.toFixed(1)}%
                        </span>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
                {filteredSites.length > 200 && (
                  <div className="px-4 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    + {filteredSites.length - 200} more — zoom or filter to narrow
                  </div>
                )}
              </div>
            </>
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

export default SitesMonitor;
