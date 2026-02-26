import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapWidgetConfig } from './dashboardTypes';
import { fetchTopoSites } from '../../services/topoService';
import { SiteSummary } from '../../types';
import { Settings, Trash2, Map as MapIcon, Eye, EyeOff, Tag, Layers, Radio, X } from 'lucide-react';
import { VENDORS, URS, PLAQUES } from '../../constants';

const TILE_URLS: Record<string, { url: string; attribution: string }> = {
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '© OSM © CARTO' },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© OSM © CARTO' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
};

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

const getMetricColor = (value: number, metric: string): string => {
  if (metric.includes('thr_dn')) { return value >= 100 ? '#10b981' : value >= 30 ? '#f59e0b' : '#ef4444'; }
  if (metric.includes('thr_up')) { return value >= 20 ? '#10b981' : value >= 5 ? '#f59e0b' : '#ef4444'; }
  if (metric === 'sessions') { return value >= 2000 ? '#10b981' : value >= 500 ? '#f59e0b' : '#ef4444'; }
  return value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
};

const createClusterIcon = (_cluster: any) => {
  const dim = 14;
  return L.divIcon({
    html: `<div style="
      background: hsl(220 60% 30%);
      width:${dim}px;height:${dim}px;border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      border:2px solid hsl(var(--background));
    "></div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim, true),
  });
};

const MapSync: React.FC<{ onChange: (c: [number, number], z: number) => void }> = ({ onChange }) => {
  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const c = map.getCenter();
      onChange([c.lat, c.lng], map.getZoom());
    },
  });
  return null;
};

interface Props {
  config: MapWidgetConfig;
  onChange: (cfg: MapWidgetConfig) => void;
  onDelete: () => void;
}

const BIMapWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    fetchTopoSites().then(s => { setSites(s); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (config.technoFilter === 'NONE') return [];
    return sites.filter(s => {
      if (config.vendorFilter !== 'ALL' && s.vendor !== config.vendorFilter) return false;
      if (config.dorFilter !== 'ALL' && s.dor !== config.dorFilter) return false;
      if (config.plaqueFilter !== 'ALL' && s.plaque !== config.plaqueFilter) return false;
      if (config.technoFilter !== 'ALL' && !s.cells.some(c => c.techno === config.technoFilter)) return false;
      return true;
    });
  }, [sites, config.vendorFilter, config.dorFilter, config.plaqueFilter, config.technoFilter]);

  const metricLabel = MAP_METRICS.find(m => m.id === config.metric)?.label || config.metric;
  const getSiteValue = (s: SiteSummary): number => (s as any)[config.metric] ?? s.qoe_score_avg;

  const handleMapSync = useCallback(() => {}, []);
  const stopDrag = (e: React.MouseEvent) => e.stopPropagation();

  const selectClass = "bg-background/60 border border-border/50 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none w-full focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all backdrop-blur-sm";

  const layerBtn = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all duration-200 ${
      active
        ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.3)]'
        : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'
    }`;
  const techBtn = (active: boolean, color?: string) =>
    `px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all duration-200 ${
      active
        ? color === '5G' ? 'bg-purple-500 text-white shadow-[0_2px_8px_rgba(168,85,247,0.35)]'
          : color === '4G' ? 'bg-blue-500 text-white shadow-[0_2px_8px_rgba(59,130,246,0.35)]'
          : 'bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.3)]'
        : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'
    }`;

  return (
    <div className="h-full flex flex-col rounded-2xl border border-border/60 shadow-[0_4px_24px_-8px_hsl(var(--foreground)/0.08)] overflow-hidden group transition-all duration-300 hover:shadow-[0_8px_40px_-10px_hsl(var(--foreground)/0.12)] bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-card to-card/80">
        <div className="flex items-center gap-2.5 drag-handle cursor-grab active:cursor-grabbing flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 shadow-sm">
            <MapIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-foreground truncate select-none leading-tight">{config.title}</h3>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">{filtered.length} sites · {metricLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onMouseDown={stopDrag}>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded-lg transition-all duration-200 ${showConfig ? 'bg-primary/15 text-primary shadow-sm' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}>
            {showConfig ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-200">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Config panel — glassmorphism */}
      {showConfig && (
        <div className="px-4 py-3 space-y-3 border-b border-border/40 bg-muted/20 backdrop-blur-sm" onMouseDown={stopDrag}>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Metric</label>
              <select className={selectClass} value={config.metric} onChange={e => onChange({ ...config, metric: e.target.value })}>
                {MAP_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Vendor</label>
              <select className={selectClass} value={config.vendorFilter} onChange={e => onChange({ ...config, vendorFilter: e.target.value })}>
                {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">UR</label>
              <select className={selectClass} value={config.dorFilter} onChange={e => onChange({ ...config, dorFilter: e.target.value })}>
                {URS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Plaque</label>
              <select className={selectClass} value={config.plaqueFilter} onChange={e => onChange({ ...config, plaqueFilter: e.target.value })}>
                {PLAQUES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Title</label>
              <input className={selectClass} value={config.title} onChange={e => onChange({ ...config, title: e.target.value })} />
            </div>
          </div>

          {/* Display toggles */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => onChange({ ...config, showSiteNames: !config.showSiteNames })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ${
                config.showSiteNames
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/60'
              }`}
            >
              <Tag className="w-3 h-3" />
              Site Names
              <span className={`w-1.5 h-1.5 rounded-full ${config.showSiteNames ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
            </button>
            <button
              onClick={() => onChange({ ...config, showMetricValues: !config.showMetricValues })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ${
                config.showMetricValues
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/60'
              }`}
            >
              {config.showMetricValues ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Metric
              <span className={`w-1.5 h-1.5 rounded-full ${config.showMetricValues ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative" onMouseDown={stopDrag}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
              <MapIcon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium">Loading sites...</span>
          </div>
        ) : (
          <MapContainer
            center={config.center}
            zoom={config.zoom}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              key={config.mapLayer}
              url={TILE_URLS[config.mapLayer].url}
              attribution={TILE_URLS[config.mapLayer].attribution}
            />
            <MapSync onChange={handleMapSync} />
            <MarkerClusterGroup
              chunkedLoading
              iconCreateFunction={createClusterIcon}
              maxClusterRadius={50}
              showCoverageOnHover={false}
              zoomToBoundsOnClick
            >
              {filtered.map(site => {
                const val = getSiteValue(site);
                const color = getMetricColor(val, config.metric);
                return (
                  <CircleMarker
                    key={site.site_id}
                    center={site.coordinates}
                    radius={7}
                    pathOptions={{
                      color: 'white',
                      fillColor: color,
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Tooltip key={`tt-${config.showSiteNames}`} direction="top" offset={[0, -10]} permanent={config.showSiteNames}>
                      <div style={{ fontFamily: 'Inter, sans-serif' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{site.site_name}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{site.vendor} · {site.cell_count} cells</div>
                        {config.showMetricValues && (
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

            {/* Layer control — bottom right, floating pills */}
            <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
              {/* Map base layer */}
              <div className="flex gap-0.5 bg-card/95 backdrop-blur-md border border-border/40 rounded-xl p-1 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-muted-foreground self-center ml-1 mr-0.5" />
                <button className={layerBtn(config.mapLayer === 'light')} onClick={() => onChange({ ...config, mapLayer: 'light' })}>L</button>
                <button className={layerBtn(config.mapLayer === 'dark')} onClick={() => onChange({ ...config, mapLayer: 'dark' })}>D</button>
                <button className={layerBtn(config.mapLayer === 'satellite')} onClick={() => onChange({ ...config, mapLayer: 'satellite' })}>S</button>
              </div>
              {/* Techno filter */}
              <div className="flex gap-0.5 bg-card/95 backdrop-blur-md border border-border/40 rounded-xl p-1 shadow-lg">
                <Radio className="w-3.5 h-3.5 text-muted-foreground self-center ml-1 mr-0.5" />
                <button className={techBtn(config.technoFilter === 'ALL', 'ALL')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === 'ALL' ? 'NONE' : 'ALL' })}>ALL</button>
                <button className={techBtn(config.technoFilter === '5G', '5G')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === '5G' ? 'NONE' : '5G' })}>5G</button>
                <button className={techBtn(config.technoFilter === '4G', '4G')} onClick={() => onChange({ ...config, technoFilter: config.technoFilter === '4G' ? 'NONE' : '4G' })}>4G</button>
              </div>
            </div>

            {/* Legend — bottom left, refined glassmorphism */}
            {config.showMetricValues && (
              <div className="absolute bottom-3 left-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-3 py-2 shadow-lg">
                <div className="text-[10px] font-semibold text-foreground mb-1.5 tracking-wide">{metricLabel}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.4)]" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} />
                    <span className="text-[10px] text-foreground/80 font-medium">Good</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shadow-[0_0_6px_rgba(245,158,11,0.4)]" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} />
                    <span className="text-[10px] text-foreground/80 font-medium">Medium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.4)]" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }} />
                    <span className="text-[10px] text-foreground/80 font-medium">Bad</span>
                  </div>
                </div>
              </div>
            )}

            {/* Site count badge — top left */}
            <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl px-3 py-1.5 shadow-lg">
              <span className="text-[11px] font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {filtered.length}
              </span>
              <span className="text-[10px] text-muted-foreground ml-1.5">sites</span>
            </div>
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BIMapWidget;
