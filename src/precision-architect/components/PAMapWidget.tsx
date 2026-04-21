import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapWidgetConfig, DEFAULT_MAP_CONFIG } from '../types';

interface Site {
  name: string;
  lon: number;
  lat: number;
  intensity: number; // 0-100
  status: 'optimal' | 'warning' | 'critical';
  vendor: string;
  techno: string;
  bande: string;
  plaque: string;
  dor: string;
}

// Mock data removed — map renders only real data when wired to a backend source.
const FRANCE_SITES: Site[] = [];

const colorFor = (status: Site['status']) =>
  status === 'optimal' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

interface Props {
  height?: number | string;
  config?: MapWidgetConfig;
}

// Tile providers
const TILE_PROVIDERS = {
  'street-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  'street-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  'satellite-light': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    subdomains: '',
    maxZoom: 19,
  },
  'satellite-dark': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    subdomains: '',
    maxZoom: 19,
  },
};

const PAMapWidget: React.FC<Props> = ({ height = 360, config }) => {
  const cfg = config ?? DEFAULT_MAP_CONFIG;
  const isDark = cfg.theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linesLayerRef = useRef<L.LayerGroup | null>(null);

  // Filter sites based on widget configuration
  const filteredSites = useMemo(() => {
    return FRANCE_SITES.filter((s) => {
      for (const f of cfg.filters) {
        if (f.values.length === 0) continue;
        const dim = f.dimension.toUpperCase();
        let v: string | undefined;
        if (dim === 'VENDOR') v = s.vendor;
        else if (dim === 'TECHNO') v = s.techno;
        else if (dim === 'BANDE') v = s.bande;
        else if (dim === 'PLAQUE') v = s.plaque;
        else if (dim === 'DOR') v = s.dor;
        else if (dim === 'SITE') v = s.name;
        else if (dim === 'CELL') v = s.name;
        if (!v || !f.values.includes(v)) return false;
      }
      return true;
    });
  }, [cfg.filters]);

  // ─── Initialise map (once) ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [46.8, 2.5], // France
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    linesLayerRef.current = L.layerGroup().addTo(map);

    // Force size recalculation after mount
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
      linesLayerRef.current = null;
    };
  }, []);

  // ─── Update tile layer when theme/mapType changes ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const key = `${cfg.mapType}-${cfg.theme}` as keyof typeof TILE_PROVIDERS;
    const provider = TILE_PROVIDERS[key] ?? TILE_PROVIDERS['street-light'];

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileOpts: L.TileLayerOptions = {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    };
    if (provider.subdomains) tileOpts.subdomains = provider.subdomains;

    tileLayerRef.current = L.tileLayer(provider.url, tileOpts).addTo(map);
  }, [cfg.mapType, cfg.theme]);

  // ─── Render markers when sites/config change ───
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    filteredSites.forEach((s) => {
      const color = cfg.kpiOverlay ? colorFor(s.status) : (cfg.defaultColor || '#10b981');
      const radius = cfg.displayMode === 'cells' ? 4 : 6;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 1.5,
        opacity: 1,
      });

      marker.bindTooltip(
        `<div style="font-weight:700;font-size:11px">${s.name}</div><div style="font-size:10px;opacity:0.75">Load: ${s.intensity}%</div>`,
        { direction: 'top', offset: [0, -8], opacity: 0.95 },
      );

      if (cfg.showLabels && cfg.displayMode === 'sites') {
        marker.bindTooltip(s.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'pa-map-label',
          opacity: 0.9,
        });
      }

      layer.addLayer(marker);

      // Sector ripples (visual hint only)
      if (cfg.showSectors) {
        [0, 120, 240].forEach((angle) => {
          const r = 0.06;
          const rad = (angle * Math.PI) / 180;
          L.circleMarker(
            [s.lat + r * Math.sin(rad), s.lon + r * Math.cos(rad)],
            {
              radius: 3,
              color,
              fillColor: color,
              fillOpacity: 0.35,
              weight: 0,
            },
          ).addTo(layer);
        });
      }
    });
  }, [filteredSites, cfg.kpiOverlay, cfg.defaultColor, cfg.displayMode, cfg.showLabels, cfg.showSectors]);

  // ─── Render lines when enabled ───
  useEffect(() => {
    const layer = linesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!cfg.showLines) return;

    const known = new Set(filteredSites.map((s) => s.name));
    const allLinks: { from: [number, number]; to: [number, number] }[] = [
      { from: [48.8566, 2.3522], to: [45.7640, 4.8357] },
      { from: [48.8566, 2.3522], to: [47.2184, -1.5536] },
      { from: [45.7640, 4.8357], to: [43.2965, 5.3698] },
      { from: [45.7640, 4.8357], to: [43.6108, 3.8767] },
      { from: [48.8566, 2.3522], to: [50.6292, 3.0573] },
      { from: [48.8566, 2.3522], to: [48.5734, 7.7521] },
      { from: [43.6047, 1.4442], to: [44.8378, -0.5792] },
    ];

    const sitesByCoord = new Map(FRANCE_SITES.map((s) => [`${s.lat.toFixed(4)},${s.lon.toFixed(4)}`, s.name]));
    const visible = allLinks.filter((l) => {
      const fromName = sitesByCoord.get(`${l.from[0].toFixed(4)},${l.from[1].toFixed(4)}`);
      const toName = sitesByCoord.get(`${l.to[0].toFixed(4)},${l.to[1].toFixed(4)}`);
      return (!fromName || known.has(fromName)) && (!toName || known.has(toName));
    });

    visible.forEach((l) => {
      L.polyline([l.from, l.to], {
        color: cfg.defaultColor || '#10b981',
        weight: 1.2,
        opacity: isDark ? 0.5 : 0.4,
        dashArray: '4 6',
      }).addTo(layer);
    });
  }, [cfg.showLines, cfg.defaultColor, filteredSites, isDark]);

  // ─── Invalidate size when container resizes ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [height]);

  return (
    <div
      style={{ width: '100%', height, position: 'relative' }}
      className={`rounded-2xl overflow-hidden border ${isDark ? 'border-slate-700/50' : 'border-outline-variant/20'}`}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Empty data overlay */}
      {filteredSites.length === 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className={`${isDark ? 'bg-slate-900/85 text-slate-200 border-slate-700/50' : 'bg-white/90 text-on-surface-variant border-outline-variant/30'} backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border text-[10px] font-bold`}>
            Aucune donnée — connectez une source ou ajustez les filtres
          </div>
        </div>
      )}

      {/* Legend */}
      {cfg.showLegend && cfg.kpiOverlay && (
        <div className={`absolute top-3 left-3 z-[500] ${isDark ? 'bg-slate-900/85 border-slate-700/50' : 'bg-white/90 border-outline-variant/20'} backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border`}>
          <div className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-on-surface-variant/60'} mb-1`}>
            {cfg.displayMode === 'sites' ? 'Sites' : 'Cells'} · {filteredSites.length}
          </div>
          <div className={`flex items-center gap-3 text-[10px] font-bold ${isDark ? 'text-slate-200' : ''}`}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Optimal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Warning</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Critical</span>
          </div>
        </div>
      )}

      {/* Map type chip */}
      <div className={`absolute top-3 right-3 z-[500] ${isDark ? 'bg-slate-900/85 text-slate-200 border-slate-700/50' : 'bg-white/90 text-on-surface-variant border-outline-variant/20'} backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border text-[9px] font-black uppercase tracking-widest`}>
        {cfg.mapType} · {cfg.theme}
      </div>
    </div>
  );
};

export default PAMapWidget;
