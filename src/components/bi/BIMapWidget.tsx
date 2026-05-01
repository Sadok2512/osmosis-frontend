import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents, useMap, Polygon } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapWidgetConfig, MapDisplayMode } from './dashboardTypes';
import { fetchTopoSites } from '../../services/topoService';
import { SiteSummary } from '../../types';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import {
  Settings, Trash2, Map as MapIcon, Eye, EyeOff, Tag, Layers, Radio, X,
  Flame, Navigation, Bookmark, BookmarkPlus, ZoomIn
} from 'lucide-react';
import { REF_DOR_TREE, REF_TECHNO_BANDE } from '../../config/filterDimensions';
import { useLayerVisibility } from '@/hooks/useLayerVisibility';

// ── Tile layers ──
const TILE_URLS: Record<string, { url: string; attribution: string }> = {
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '© OSM © CARTO' },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© OSM © CARTO' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
};

// ── Metrics for QoE mode ──
const MAP_METRICS = [
  { id: 'qoe_score_avg', label: 'QoE Score', unit: '%' },
  { id: 'dms_dl_3', label: 'DMS DL ≥ 3M', unit: '%' },
  { id: 'dms_dl_8', label: 'DMS DL ≥ 8M', unit: '%' },
  { id: 'dms_dl_30', label: 'DMS DL ≥ 30M', unit: '%' },
  { id: 'dms_ul_3', label: 'DMS UL ≥ 3M', unit: '%' },
  { id: 'p50_thr_dn_mbps', label: 'Débit DL', unit: 'Mbps' },
  { id: 'p50_thr_up_mbps', label: 'Débit UL', unit: 'Mbps' },
  { id: 'sessions', label: 'Sessions', unit: '' },
];

const ZONE_ARCEP_VALUES = ['ALL', 'top15', 'rural', 'Intermidiare', 'AXE', 'TGV'];

// ── Derive vendor/DOR/plaque lists ──
const ALL_VENDORS = (() => {
  const set = new Set<string>();
  Object.values(REF_DOR_TREE.tree).forEach(byDor => Object.keys(byDor).forEach(v => set.add(v)));
  return ['ALL', ...Array.from(set).sort()];
})();
const ALL_DORS = ['ALL', ...REF_DOR_TREE.dors];

function getAvailablePlaques(dorFilter: string, vendorFilter: string): string[] {
  const dors = dorFilter !== 'ALL' ? [dorFilter] : REF_DOR_TREE.dors;
  const plaques = new Set<string>();
  for (const dor of dors) {
    const byDor = REF_DOR_TREE.tree[dor];
    if (!byDor) continue;
    const vendors = vendorFilter !== 'ALL' ? [vendorFilter] : Object.keys(byDor);
    for (const v of vendors) byDor[v]?.forEach(p => plaques.add(p));
  }
  return ['ALL', ...Array.from(plaques).sort()];
}

function getAvailableBandes(technoFilter: string): string[] {
  const technos = technoFilter !== 'ALL' && technoFilter !== 'NONE' ? [technoFilter.toLowerCase()] : Object.keys(REF_TECHNO_BANDE);
  const bands = new Set<string>();
  for (const t of technos) REF_TECHNO_BANDE[t]?.forEach(b => bands.add(b));
  return ['ALL', ...Array.from(bands).sort()];
}

// ── Color helpers ──
const getMetricColor = (value: number, metric: string): string => {
  if (metric.includes('thr_dn')) return value >= 100 ? '#10b981' : value >= 30 ? '#f59e0b' : '#ef4444';
  if (metric.includes('thr_up')) return value >= 20 ? '#10b981' : value >= 5 ? '#f59e0b' : '#ef4444';
  if (metric === 'sessions') return value >= 2000 ? '#10b981' : value >= 500 ? '#f59e0b' : '#ef4444';
  return value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
};
const getTopoColor = (site: SiteSummary): string => site.cells.some(c => c.techno === '5G') ? '#a855f7' : '#f59e0b';

// ── Cluster icon ──
const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const dim = count > 100 ? 20 : count > 10 ? 16 : 14;
  return L.divIcon({
    html: `<div style="background:hsl(220 60% 30%);width:${dim}px;height:${dim}px;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid hsl(var(--background));display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:700">${count > 10 ? count : ''}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim, true),
  });
};

// ── Map event sync ──
const MapSync: React.FC<{ onChange: (c: [number, number], z: number) => void }> = ({ onChange }) => {
  useMapEvents({ moveend: (e) => { const m = e.target; onChange([m.getCenter().lat, m.getCenter().lng], m.getZoom()); } });
  return null;
};

// ── Lift the Leaflet map instance up to the parent so the
//    useLayerVisibility hook can subscribe to zoom events.
const MapInstanceCapture: React.FC<{ onMap: (map: L.Map | null) => void }> = ({ onMap }) => {
  const map = useMap();
  useEffect(() => {
    onMap(map);
    return () => onMap(null);
  }, [map, onMap]);
  return null;
};

// ── Heatmap layer (uses leaflet.heat if available) ──
const HeatmapLayer: React.FC<{ points: [number, number, number][]; visible: boolean }> = ({ points, visible }) => {
  const map = useMap();
  const heatRef = useRef<any>(null);

  useEffect(() => {
    if (!visible || points.length === 0) {
      if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
      return;
    }
    try {
      const heat = (L as any).heatLayer(points, { radius: 25, blur: 15, maxZoom: 17, max: 1.0, gradient: { 0.2: '#3b82f6', 0.4: '#06b6d4', 0.6: '#10b981', 0.8: '#f59e0b', 1.0: '#ef4444' } });
      if (heatRef.current) map.removeLayer(heatRef.current);
      heat.addTo(map);
      heatRef.current = heat;
    } catch { /* leaflet.heat not loaded */ }
    return () => { if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; } };
  }, [map, points, visible]);

  return null;
};

// ── Cell sector polygon ──
const CellSector: React.FC<{ lat: number; lng: number; azimuth: number; color: string; radius?: number }> = ({ lat, lng, azimuth, color, radius = 0.003 }) => {
  const halfBeam = 30;
  const points: [number, number][] = [[lat, lng]];
  for (let a = azimuth - halfBeam; a <= azimuth + halfBeam; a += 5) {
    const rad = (a * Math.PI) / 180;
    points.push([lat + radius * Math.cos(rad), lng + radius * Math.sin(rad)]);
  }
  points.push([lat, lng]);
  return <Polygon positions={points} pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 1, opacity: 0.5 }} />;
};

interface Props {
  config: MapWidgetConfig;
  onChange: (cfg: MapWidgetConfig) => void;
  onDelete: () => void;
}

const DISPLAY_MODES: { id: MapDisplayMode; label: string }[] = [
  { id: 'topo', label: 'Topo' },
  { id: 'qoe', label: 'QoE' },
  { id: 'parameter', label: 'Parameter' },
];

const BIMapWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  // (forceDisplay state removed — site count cap was lifted, every loaded site is rendered)
  const [showConfig, setShowConfig] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showSectors, setShowSectors] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteSummary | null>(null);
  const [mapZoom, setMapZoom] = useState(config.zoom || 6);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Hysteresis-driven layer visibility — keeps sites and cells from
  // flickering when the user lingers on the zoom boundary. Bands match
  // the spec: sites in 8..10, cells in 10..12.
  const { visible: layerVisible } = useLayerVisibility({
    map: mapInstance,
    thresholds: {
      sites: { showAt: 10, hideAt: 8 },
      cells: { showAt: 12, hideAt: 10 },
    },
    zoomEvent: 'zoomend',
  });

  // Connect to KPI Monitor store for filters
  const globalFilter = useGlobalFilterStore();
  const kpiStore = useKpiMonitorStore();

  const handleLoadSites = useCallback(() => {
    if (loading) return;
    setLoading(true);
    fetchTopoSites().then(s => { setSites(s); setLoading(false); setSitesLoaded(true); });
  }, [loading]);

  const hasActiveFilter = config.vendorFilter !== 'ALL' || config.dorFilter !== 'ALL' || config.plaqueFilter !== 'ALL' || config.zoneArcepFilter !== 'ALL' || config.bandeFilter !== 'ALL';

  useEffect(() => {
    if (hasActiveFilter && !sitesLoaded && !loading) handleLoadSites();
  }, [hasActiveFilter, sitesLoaded, loading, handleLoadSites]);

  // Auto-load on mount if no sites
  useEffect(() => {
    if (!sitesLoaded && !loading) handleLoadSites();
  }, []); // eslint-disable-line

  const availablePlaques = useMemo(() => getAvailablePlaques(config.dorFilter, config.vendorFilter), [config.dorFilter, config.vendorFilter]);
  const availableBandes = useMemo(() => getAvailableBandes(config.technoFilter), [config.technoFilter]);

  // Also filter by global KPI monitor filters if active
  const filtered = useMemo(() => {
    if (config.technoFilter === 'NONE') return [];
    return sites.filter(s => {
      if (config.vendorFilter !== 'ALL' && s.vendor !== config.vendorFilter) return false;
      if (config.dorFilter !== 'ALL' && s.dor !== config.dorFilter) return false;
      if (config.plaqueFilter !== 'ALL' && s.plaque !== config.plaqueFilter) return false;
      if (config.zoneArcepFilter !== 'ALL' && (s as any).zone_arcep !== config.zoneArcepFilter) return false;
      if (config.bandeFilter !== 'ALL' && !s.cells.some(c => (c as any).bande === config.bandeFilter)) return false;
      if (config.technoFilter !== 'ALL' && !s.cells.some(c => c.techno === config.technoFilter)) return false;
      // Sync with global filter store (DOR/region)
      const gfDor = globalFilter.globalFilters.find(f => f.dimension === 'dor' && f.values.length > 0);
      if (gfDor && !gfDor.values.includes(s.dor || '')) return false;
      return true;
    });
  }, [sites, config, globalFilter.globalFilters]);

  // Cap removed — render every loaded site regardless of filter / count.
  // Zoom hysteresis (layerVisible.sites) and Leaflet's MarkerClusterGroup
  // are the only guards left.
  const shouldRenderSites = sitesLoaded;
  const metricLabel = MAP_METRICS.find(m => m.id === config.metric)?.label || config.metric;
  const getSiteValue = (s: SiteSummary): number => (s as any)[config.metric] ?? s.qoe_score_avg;
  const getSiteColor = (site: SiteSummary): string => {
    if (config.displayMode === 'topo') return getTopoColor(site);
    return getMetricColor(getSiteValue(site), config.metric);
  };

  // Heatmap data
  const heatmapPoints = useMemo<[number, number, number][]>(() => {
    if (!showHeatmap || !shouldRenderSites) return [];
    return filtered.map(s => {
      const val = getSiteValue(s);
      const norm = Math.min(1, Math.max(0, val / 100));
      return [s.coordinates[0], s.coordinates[1], norm];
    });
  }, [filtered, showHeatmap, shouldRenderSites, config.metric]);

  const handleMapSync = useCallback((c: [number, number], z: number) => {
    setMapZoom(z);
  }, []);

  const stopDrag = (e: React.MouseEvent) => e.stopPropagation();
  const selectClass = "bg-background/60 border border-border/50 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none w-full focus:ring-1 focus:ring-primary/30 transition-all backdrop-blur-sm";
  const layerBtn = (active: boolean) => `px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'}`;
  const techBtn = (active: boolean, color?: string) => `px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all ${active ? (color === '5G' ? 'bg-purple-500 text-white' : color === '4G' ? 'bg-blue-500 text-white' : 'bg-primary text-primary-foreground') : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'}`;
  const toggleBtn = (active: boolean) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${active ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' : 'bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/60'}`;

  return (
    <div className="h-full flex flex-col rounded-2xl border border-border/60 shadow-lg overflow-hidden group transition-all bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-card to-card/80">
        <div className="flex items-center gap-2.5 drag-handle cursor-grab active:cursor-grabbing flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <MapIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-foreground truncate select-none leading-tight">{config.title}</h3>
            <span className="text-[10px] text-muted-foreground font-mono">{sitesLoaded ? `${filtered.length} sites` : 'Loading...'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={stopDrag}>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded-lg transition-all ${showConfig ? 'bg-primary/15 text-primary' : 'hover:bg-muted text-muted-foreground'}`}>
            {showConfig ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-4 py-3 space-y-3 border-b border-border/40 bg-muted/20 max-h-[300px] overflow-y-auto" onMouseDown={stopDrag}>
          {/* Display + Metric */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Display</label>
              <select className={selectClass} value={config.displayMode} onChange={e => onChange({ ...config, displayMode: e.target.value as MapDisplayMode })}>
                {DISPLAY_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {config.displayMode === 'qoe' && (
              <div className="space-y-1">
                <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Metric</label>
                <select className={selectClass} value={config.metric} onChange={e => onChange({ ...config, metric: e.target.value })}>
                  {MAP_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Vendor</label>
              <select className={selectClass} value={config.vendorFilter} onChange={e => onChange({ ...config, vendorFilter: e.target.value, plaqueFilter: 'ALL' })}>{ALL_VENDORS.map(v => <option key={v} value={v}>{v}</option>)}</select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">DOR</label>
              <select className={selectClass} value={config.dorFilter} onChange={e => onChange({ ...config, dorFilter: e.target.value, plaqueFilter: 'ALL' })}>{ALL_DORS.map(d => <option key={d} value={d}>{d}</option>)}</select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Plaque</label>
              <select className={selectClass} value={config.plaqueFilter} onChange={e => onChange({ ...config, plaqueFilter: e.target.value })}>{availablePlaques.map(p => <option key={p} value={p}>{p}</option>)}</select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Zone ARCEP</label>
              <select className={selectClass} value={config.zoneArcepFilter} onChange={e => onChange({ ...config, zoneArcepFilter: e.target.value })}>{ZONE_ARCEP_VALUES.map(z => <option key={z} value={z}>{z}</option>)}</select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Bande</label>
              <select className={selectClass} value={config.bandeFilter} onChange={e => onChange({ ...config, bandeFilter: e.target.value })}>{availableBandes.map(b => <option key={b} value={b}>{b}</option>)}</select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Title</label>
              <input className={selectClass} value={config.title} onChange={e => onChange({ ...config, title: e.target.value })} />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => onChange({ ...config, showSiteNames: !config.showSiteNames })} className={toggleBtn(config.showSiteNames)}>
              <Tag className="w-3 h-3" /> Names
            </button>
            <button onClick={() => onChange({ ...config, showMetricValues: !config.showMetricValues })} className={toggleBtn(config.showMetricValues)}>
              <Eye className="w-3 h-3" /> Values
            </button>
            <button onClick={() => setShowHeatmap(!showHeatmap)} className={toggleBtn(showHeatmap)}>
              <Flame className="w-3 h-3" /> Heatmap
            </button>
            <button onClick={() => setShowSectors(!showSectors)} className={toggleBtn(showSectors)}>
              <Navigation className="w-3 h-3" /> Sectors
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative" onMouseDown={stopDrag}>
        {loading && !sitesLoaded ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
              <MapIcon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium">Chargement des sites...</span>
          </div>
        ) : (
          <MapContainer center={config.center} zoom={config.zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer key={config.mapLayer} url={TILE_URLS[config.mapLayer].url} attribution={TILE_URLS[config.mapLayer].attribution} />
            <MapSync onChange={handleMapSync} />
            <MapInstanceCapture onMap={setMapInstance} />

            {/* Heatmap overlay */}
            <HeatmapLayer points={heatmapPoints} visible={showHeatmap} />

            {/* Site markers — gated by hysteresis so they don't flicker
                between zoom 9 and 10. Filters / count cap still apply. */}
            {shouldRenderSites && layerVisible.sites && (
              <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon} maxClusterRadius={50} showCoverageOnHover={false} zoomToBoundsOnClick>
                {filtered.map(site => {
                  const color = getSiteColor(site);
                  const val = getSiteValue(site);
                  return (
                    <CircleMarker
                      key={site.site_id}
                      center={site.coordinates}
                      radius={selectedSite?.site_id === site.site_id ? 10 : 7}
                      pathOptions={{ color: selectedSite?.site_id === site.site_id ? '#fff' : 'white', fillColor: color, fillOpacity: 0.9, weight: selectedSite?.site_id === site.site_id ? 3 : 2 }}
                      eventHandlers={{ click: () => setSelectedSite(selectedSite?.site_id === site.site_id ? null : site) }}
                    >
                      <Tooltip key={`tt-${config.showSiteNames}`} direction="top" offset={[0, -10]} permanent={config.showSiteNames}>
                        <div style={{ fontFamily: 'Inter, sans-serif' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{site.site_name}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>{site.vendor} · {site.cell_count} cells</div>
                          {config.displayMode === 'qoe' && config.showMetricValues && (
                            <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                              {metricLabel}: {typeof val === 'number' ? val.toFixed(1) : val}
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MarkerClusterGroup>
            )}

            {/* Cell sectors — was gated `mapZoom >= 14` (binary, flickered
                at the boundary). Now uses hysteresis (showAt=12, hideAt=10). */}
            {showSectors && layerVisible.cells && filtered.map(site =>
              site.cells.map((cell, ci) => (
                <CellSector
                  key={`${site.site_id}-${ci}`}
                  lat={site.coordinates[0]}
                  lng={site.coordinates[1]}
                  azimuth={(cell as any).azimut || ci * 120}
                  color={cell.techno === '5G' ? '#a855f7' : '#3b82f6'}
                />
              ))
            )}

            {/* Layer control */}
            <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
              <div className="flex gap-0.5 bg-card/95 backdrop-blur-md border border-border/40 rounded-xl p-1 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-muted-foreground self-center ml-1 mr-0.5" />
                <button className={layerBtn(config.mapLayer === 'light')} onClick={() => onChange({ ...config, mapLayer: 'light' })}>L</button>
                <button className={layerBtn(config.mapLayer === 'dark')} onClick={() => onChange({ ...config, mapLayer: 'dark' })}>D</button>
                <button className={layerBtn(config.mapLayer === 'satellite')} onClick={() => onChange({ ...config, mapLayer: 'satellite' })}>S</button>
              </div>
              <div className="flex gap-0.5 bg-card/95 backdrop-blur-md border border-border/40 rounded-xl p-1 shadow-lg">
                <Radio className="w-3.5 h-3.5 text-muted-foreground self-center ml-1 mr-0.5" />
                <button className={techBtn(config.technoFilter === 'ALL', 'ALL')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === 'ALL' ? 'NONE' : 'ALL', bandeFilter: 'ALL' })}>ALL</button>
                <button className={techBtn(config.technoFilter === '5G', '5G')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === '5G' ? 'NONE' : '5G', bandeFilter: 'ALL' })}>5G</button>
                <button className={techBtn(config.technoFilter === '4G', '4G')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === '4G' ? 'NONE' : '4G', bandeFilter: 'ALL' })}>4G</button>
              </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-3 py-2 shadow-lg">
              {config.displayMode === 'qoe' ? (
                <>
                  <div className="text-[10px] font-semibold text-foreground mb-1.5 tracking-wide">{metricLabel}</div>
                  <div className="space-y-1">
                    {[['#10b981', 'Good'], ['#f59e0b', 'Medium'], ['#ef4444', 'Bad']].map(([c, l]) => (
                      <div key={l} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                        <span className="text-[10px] text-foreground/80 font-medium">{l}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] font-semibold text-foreground mb-1.5 tracking-wide">Technologie</div>
                  <div className="space-y-1">
                    {[['#a855f7', '5G'], ['#f59e0b', '4G']].map(([c, l]) => (
                      <div key={l} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                        <span className="text-[10px] text-foreground/80 font-medium">{l}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Site count + zoom info */}
            <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-3 py-1.5 shadow-lg">
              <span className="text-[11px] font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {shouldRenderSites ? filtered.length : 0}
              </span>
              <span className="text-[10px] text-muted-foreground ml-1.5">/ {filtered.length} sites · z{mapZoom}</span>
            </div>

            {/* Selected site detail panel */}
            {selectedSite && (
              <div className="absolute top-3 right-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-4 py-3 shadow-lg w-[240px]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[12px] font-bold text-foreground truncate">{selectedSite.site_name}</h4>
                  <button onClick={() => setSelectedSite(null)} className="p-0.5 rounded hover:bg-muted"><X className="w-3 h-3" /></button>
                </div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span className="font-semibold">{selectedSite.vendor}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cells</span><span className="font-semibold">{selectedSite.cell_count}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">DOR</span><span className="font-semibold">{selectedSite.dor || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Plaque</span><span className="font-semibold">{selectedSite.plaque || '—'}</span></div>
                  {config.displayMode === 'qoe' && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{metricLabel}</span><span className="font-bold" style={{ color: getSiteColor(selectedSite) }}>{getSiteValue(selectedSite)?.toFixed(1)}</span></div>
                  )}
                  <div className="pt-1 border-t border-border/30 mt-1">
                    <div className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Cells</div>
                    {selectedSite.cells.slice(0, 6).map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 py-0.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.techno === '5G' ? '#a855f7' : '#3b82f6' }} />
                        <span className="text-[9px] text-foreground truncate">{c.cell_id}</span>
                        <span className="text-[8px] text-muted-foreground ml-auto">{c.techno}</span>
                      </div>
                    ))}
                    {selectedSite.cells.length > 6 && <span className="text-[9px] text-muted-foreground">+{selectedSite.cells.length - 6} more</span>}
                  </div>
                </div>
              </div>
            )}

            {/* "Too many sites" overlay removed — the 2000-site cap that
                triggered it is gone. Clustering at any zoom level keeps
                rendering reasonable. */}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BIMapWidget;
