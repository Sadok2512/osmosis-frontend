import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapWidgetConfig } from './dashboardTypes';
import { fetchTopoSites } from '../../services/topoService';
import { SiteSummary } from '../../types';
import { Settings, Trash2, Map as MapIcon, Eye, EyeOff, Tag } from 'lucide-react';
import { VENDORS, DORS, PLAQUES } from '../../constants';

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

const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const dim = count >= 100 ? 44 : count >= 10 ? 38 : 32;
  return L.divIcon({
    html: `<div style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));width:${dim}px;height:${dim}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${dim > 38 ? 13 : 11}px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid hsl(var(--background));">${count}</div>`,
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
  const selectClass = "bg-muted border border-border rounded-md px-2 py-1 text-[10px] text-foreground outline-none w-full";

  const layerBtnClass = (active: boolean) =>
    `px-2 py-1 rounded text-[9px] font-bold transition-all ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card/80 text-foreground hover:bg-muted'}`;
  const techBtnClass = (active: boolean) =>
    `px-2 py-1 rounded text-[9px] font-bold transition-all ${active ? 'bg-accent text-accent-foreground shadow-sm' : 'bg-card/80 text-foreground hover:bg-muted'}`;

  return (
    <div className="h-full flex flex-col rounded-2xl border border-border shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] overflow-hidden group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)] bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 drag-handle cursor-grab active:cursor-grabbing flex-1 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <MapIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-xs font-semibold text-foreground truncate select-none">{config.title}</h3>
          <span className="text-[9px] text-muted-foreground font-mono">{filtered.length} sites · {metricLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={stopDrag}>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded-lg transition-colors ${showConfig ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10 text-muted-foreground hover:text-primary'}`}>
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-3 pb-2 space-y-1.5 border-b border-border" onMouseDown={stopDrag}>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">Metric</label>
              <select className={selectClass} value={config.metric} onChange={e => onChange({ ...config, metric: e.target.value })}>
                {MAP_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">Vendor</label>
              <select className={selectClass} value={config.vendorFilter} onChange={e => onChange({ ...config, vendorFilter: e.target.value })}>
                {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">DOR</label>
              <select className={selectClass} value={config.dorFilter} onChange={e => onChange({ ...config, dorFilter: e.target.value })}>
                {DORS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">Plaque</label>
              <select className={selectClass} value={config.plaqueFilter} onChange={e => onChange({ ...config, plaqueFilter: e.target.value })}>
                {PLAQUES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">Title</label>
              <input className={selectClass} value={config.title} onChange={e => onChange({ ...config, title: e.target.value })} />
            </div>
          </div>
          {/* Display flags */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onChange({ ...config, showSiteNames: !config.showSiteNames })}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all ${config.showSiteNames ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
              <Tag className="w-3 h-3" />
              Site Names {config.showSiteNames ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => onChange({ ...config, showMetricValues: !config.showMetricValues })}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all ${config.showMetricValues ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
              {config.showMetricValues ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Metric {config.showMetricValues ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative" onMouseDown={stopDrag}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading sites...</div>
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
                    radius={6}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1.5 }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} permanent={config.showSiteNames}>
                      <div className="text-xs font-semibold">{site.site_name}</div>
                      <div className="text-[10px]">{site.vendor} · {site.cell_count} cells</div>
                      {config.showMetricValues && (
                        <div className="text-[10px] font-bold" style={{ color }}>
                          {metricLabel}: {typeof val === 'number' ? val.toFixed(1) : val}
                        </div>
                      )}
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </MarkerClusterGroup>

            {/* Layer control — bottom right */}
            <div className="absolute bottom-2 right-2 z-[1000] flex flex-col gap-1.5">
              {/* Map layer buttons */}
              <div className="flex gap-0.5 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-0.5">
                <button className={layerBtnClass(config.mapLayer === 'light')} onClick={() => onChange({ ...config, mapLayer: 'light' })}>L</button>
                <button className={layerBtnClass(config.mapLayer === 'dark')} onClick={() => onChange({ ...config, mapLayer: 'dark' })}>D</button>
                <button className={layerBtnClass(config.mapLayer === 'satellite')} onClick={() => onChange({ ...config, mapLayer: 'satellite' })}>S</button>
              </div>
              {/* Techno filter buttons */}
              <div className="flex gap-0.5 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-0.5">
                <button className={techBtnClass(config.technoFilter === 'ALL')} onClick={() => onChange({ ...config, technoFilter: 'ALL' })}>ALL</button>
                <button className={techBtnClass(config.technoFilter === '5G')} onClick={() => onChange({ ...config, technoFilter: '5G' })}>5G</button>
                <button className={techBtnClass(config.technoFilter === '4G')} onClick={() => onChange({ ...config, technoFilter: '4G' })}>4G</button>
              </div>
            </div>

            {/* Legend — bottom left */}
            {config.showMetricValues && (
              <div className="absolute bottom-2 left-2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 text-[9px] space-y-0.5">
                <div className="font-semibold text-foreground">{metricLabel}</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /> Good</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" /> Medium</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Bad</div>
              </div>
            )}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BIMapWidget;
