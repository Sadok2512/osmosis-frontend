import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapWidgetConfig, DEFAULT_MAP_CONFIG } from '../types';
import { fetchTopoSites } from '@/services/topoService';
import type { SiteSummary } from '@/types';

interface MapSite {
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

const DEFAULT_STATUS_COLORS = {
  optimal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
} as const;

const colorFor = (status: MapSite['status'], cfg?: MapWidgetConfig) => {
  if (status === 'optimal') return cfg?.optimalColor || DEFAULT_STATUS_COLORS.optimal;
  if (status === 'warning') return cfg?.warningColor || DEFAULT_STATUS_COLORS.warning;
  return cfg?.criticalColor || DEFAULT_STATUS_COLORS.critical;
};

/** Map a SiteSummary from the topo service to the lightweight MapSite shape. */
function siteSummaryToMapSite(s: SiteSummary, warnTh = 80, critTh = 60): MapSite | null {
  const [lat, lon] = s.coordinates ?? [NaN, NaN];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const qoe = Number.isFinite(s.qoe_score_avg) ? s.qoe_score_avg : 80;
  let status: MapSite['status'] = 'optimal';
  if (qoe < critTh) status = 'critical';
  else if (qoe < warnTh) status = 'warning';

  const technoList = (s.technos && s.technos.length > 0 ? s.technos : (s.techno ? [s.techno] : [])).join(',');
  const bandeList = (s.bandes && s.bandes.length > 0 ? s.bandes : (s.bande ? [s.bande] : [])).join(',');

  return {
    name: s.site_name || s.site_id,
    lon,
    lat,
    intensity: Math.max(0, Math.min(100, Math.round(qoe))),
    status,
    vendor: s.vendor || 'Unknown',
    techno: technoList || '',
    bande: bandeList || '',
    plaque: s.plaque || '',
    dor: s.dor || '',
  };
}

interface Props {
  height?: number | string;
  config?: MapWidgetConfig;
}

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
} as const;

// ── Module-level cache so multiple map widgets share one fetch ──
let cachedMapSites: MapSite[] | null = null;
let inflight: Promise<MapSite[]> | null = null;
const cacheListeners = new Set<(sites: MapSite[]) => void>();

/** Subscribe to the shared map-sites cache. Receives current value immediately. */
export function subscribeMapSitesCache(cb: (sites: MapSite[]) => void): () => void {
  cacheListeners.add(cb);
  if (cachedMapSites) cb(cachedMapSites);
  else loadMapSites().then((s) => cb(s));
  return () => { cacheListeners.delete(cb); };
}

/** Get distinct values for a dimension from currently-loaded sites (sync). */
export function getMapSitesDistinct(dim: string): string[] {
  if (!cachedMapSites) return [];
  const key = dim.toUpperCase();
  const set = new Set<string>();
  for (const s of cachedMapSites) {
    let raw = '';
    if (key === 'VENDOR') raw = s.vendor;
    else if (key === 'TECHNO') raw = s.techno;
    else if (key === 'BANDE') raw = s.bande;
    else if (key === 'PLAQUE') raw = s.plaque;
    else if (key === 'DOR') raw = s.dor;
    else if (key === 'SITE' || key === 'CELL') raw = s.name;
    if (!raw) continue;
    if (key === 'TECHNO' || key === 'BANDE') {
      raw.split(',').map((p) => p.trim()).filter(Boolean).forEach((v) => set.add(v));
    } else {
      set.add(raw);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function loadMapSites(): Promise<MapSite[]> {
  if (cachedMapSites) return cachedMapSites;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const sites = await fetchTopoSites();
      const mapped = sites
        .map((s) => siteSummaryToMapSite(s))
        .filter((s): s is MapSite => !!s);
      cachedMapSites = mapped;
      cacheListeners.forEach((cb) => { try { cb(mapped); } catch {} });
      return mapped;
    } catch (err) {
      console.warn('[PAMapWidget] Failed to load topo sites', err);
      cachedMapSites = [];
      cacheListeners.forEach((cb) => { try { cb([]); } catch {} });
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const PAMapWidget: React.FC<Props> = ({ height = 360, config }) => {
  const cfg = config ?? DEFAULT_MAP_CONFIG;
  const isDark = cfg.theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linesLayerRef = useRef<L.LayerGroup | null>(null);

  const [sites, setSites] = useState<MapSite[]>(() => cachedMapSites ?? []);
  const [loading, setLoading] = useState<boolean>(!cachedMapSites);

  // ─── Load sites: if filters are set, fetch filtered from backend; else use cache ───
  const hasActiveFilters = cfg.filters.some(f => f.values.length > 0);
  const filterKey = JSON.stringify(cfg.filters.filter(f => f.values.length > 0));
  useEffect(() => {
    let cancelled = false;

    if (hasActiveFilters) {
      // Fetch filtered sites directly from backend
      setLoading(true);
      (async () => {
        try {
          const { getVpsProxyUrl, getVpsProxyHeaders } = await import('@/lib/apiConfig');
          const qs = new URLSearchParams({ bbox: '-180,-90,180,90', limit: '50000' });
          for (const f of cfg.filters) {
            if (f.values.length === 0) continue;
            const dim = f.dimension.toLowerCase();
            const paramMap: Record<string, string> = {
              plaque: 'plaque', dor: 'dor', vendor: 'constructeur',
              techno: 'techno', bande: 'bande', bcluster: 'bcluster',
            };
            const param = paramMap[dim] || dim;
            qs.set(param, f.values.join(','));
          }
          const url = getVpsProxyUrl('parser', `/api/v1/topo/sites?${qs}`);
          const resp = await fetch(url, { headers: getVpsProxyHeaders() });
          const json = await resp.json();
          const rawSites = Array.isArray(json?.sites) ? json.sites : (Array.isArray(json) ? json : []);
          const mapped = rawSites
            .map((s: any): MapSite | null => {
              const lat = Number(s.latitude ?? s.lat);
              const lon = Number(s.longitude ?? s.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
              return {
                name: s.site_name || s.nom_site || s.code_nidt || '',
                lat, lon,
                intensity: 80,
                status: 'optimal' as const,
                vendor: s.constructeur || s.vendor || 'Unknown',
                techno: Array.isArray(s.technos) ? s.technos.join(',') : (s.techno || ''),
                bande: Array.isArray(s.bandes) ? s.bandes.join(',') : (s.bande || ''),
                plaque: s.plaque || '',
                dor: s.dor || s.region || '',
              };
            })
            .filter((s: MapSite | null): s is MapSite => !!s);
          if (!cancelled) {
            setSites(mapped);
            setLoading(false);
          }
        } catch (err) {
          console.warn('[PAMapWidget] Filtered fetch failed', err);
          if (!cancelled) setLoading(false);
        }
      })();
    } else {
      // No filters: use shared cache
      if (cachedMapSites) {
        setSites(cachedMapSites);
        setLoading(false);
        return;
      }
      setLoading(true);
      loadMapSites().then((data) => {
        if (cancelled) return;
        setSites(data);
        setLoading(false);
      });
    }

    return () => { cancelled = true; };
  }, [filterKey, hasActiveFilters]);

  // Filter sites based on widget configuration
  const filteredSites = useMemo(() => {
    const result = sites.filter((s) => {
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
        if (!v) return false;
        // Case-insensitive matching for all dimensions
        const vLower = v.toLowerCase();
        const filterLower = f.values.map(fv => fv.toLowerCase());
        if (dim === 'TECHNO' || dim === 'BANDE') {
          const parts = v.split(',').map((p) => p.trim().toLowerCase());
          if (!parts.some((p) => filterLower.includes(p))) return false;
        } else if (!filterLower.includes(vLower)) {
          return false;
        }
      }
      return true;
    });
    // Debug: log filter matching details
    if (cfg.filters.length > 0 && result.length === 0 && sites.length > 0) {
      const sample = sites.slice(0, 3);
      for (const f of cfg.filters) {
        if (f.values.length === 0) continue;
        const dim = f.dimension.toUpperCase();
        const sampleVals = sample.map(s => {
          if (dim === 'PLAQUE') return s.plaque;
          if (dim === 'DOR') return s.dor;
          if (dim === 'VENDOR') return s.vendor;
          return '?';
        });
        console.warn(`[PAMap] Filter MISMATCH: ${f.dimension}=${JSON.stringify(f.values)} but sample site values: ${JSON.stringify(sampleVals)}`);
      }
    }
    console.log(`[PAMap] Filter: ${cfg.filters.map(f => `${f.dimension}=${f.values.join(',')}`).join(' ')} → ${result.length}/${sites.length} sites`);
    return result;
  }, [sites, cfg.filters]);

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

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    // Transparent theme: don't render any tiles, just markers over the (transparent) background.
    if (cfg.theme === 'transparent') return;

    const key = `${cfg.mapType}-${cfg.theme}` as keyof typeof TILE_PROVIDERS;
    const provider = TILE_PROVIDERS[key] ?? TILE_PROVIDERS['street-light'];

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

    const warnTh = cfg.warningThreshold ?? 80;
    const critTh = cfg.criticalThreshold ?? 60;

    filteredSites.forEach((s) => {
      // Recompute status against the (possibly updated) thresholds so threshold
      // edits in the settings panel re-color markers immediately.
      const intensity = s.intensity;
      const status: MapSite['status'] =
        intensity < critTh ? 'critical' : intensity < warnTh ? 'warning' : 'optimal';
      const color = cfg.kpiOverlay ? colorFor(status, cfg) : (cfg.defaultColor || '#10b981');
      const radius = cfg.displayMode === 'cells' ? 4 : 6;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 1.5,
        opacity: 1,
      });

      const technoLine = s.techno ? `<div style="font-size:10px;opacity:0.75">${s.techno}</div>` : '';
      marker.bindTooltip(
        `<div style="font-weight:700;font-size:11px">${s.name}</div>` +
          `<div style="font-size:10px;opacity:0.75">${s.vendor} · QoE ${s.intensity}</div>` +
          technoLine,
        { direction: 'top', offset: [0, -8], opacity: 0.95 },
      );

      if (cfg.showLabels && cfg.displayMode === 'sites' && filteredSites.length < 200) {
        // Only show permanent labels for small result sets to avoid label overlap.
        marker.bindTooltip(s.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'pa-map-label',
          opacity: 0.9,
        });
      }

      layer.addLayer(marker);

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

    // Auto-fit bounds the first time real sites arrive.
    const map = mapRef.current;
    if (map && filteredSites.length > 0) {
      const bounds = L.latLngBounds(filteredSites.map((s) => [s.lat, s.lon] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
      }
    }
  }, [filteredSites, cfg.kpiOverlay, cfg.defaultColor, cfg.displayMode, cfg.showLabels, cfg.showSectors]);

  // ─── Render inter-site lines (sample backbone overlay) ───
  useEffect(() => {
    const layer = linesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!cfg.showLines || filteredSites.length === 0) return;

    // Connect each site to its 1-nearest neighbor (cheap visual mesh).
    // Capped to 400 sites to keep rendering smooth.
    const subset = filteredSites.slice(0, 400);
    const drawnPairs = new Set<string>();

    subset.forEach((a, i) => {
      let best: { idx: number; d2: number } | null = null;
      subset.forEach((b, j) => {
        if (i === j) return;
        const dx = a.lon - b.lon;
        const dy = a.lat - b.lat;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) best = { idx: j, d2 };
      });
      if (!best) return;
      const pairKey = i < best.idx ? `${i}-${best.idx}` : `${best.idx}-${i}`;
      if (drawnPairs.has(pairKey)) return;
      drawnPairs.add(pairKey);
      const b = subset[best.idx];
      L.polyline(
        [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ],
        {
          color: cfg.defaultColor || '#10b981',
          weight: 1,
          opacity: isDark ? 0.4 : 0.3,
          dashArray: '3 5',
        },
      ).addTo(layer);
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

      {/* Debug: filter status */}
      {cfg.filters.length > 0 && (
        <div className="absolute top-2 left-2 z-[500] pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-outline-variant/30 text-[9px] font-bold text-on-surface-variant">
            {filteredSites.length}/{sites.length} sites · {cfg.filters.map(f => `${f.dimension}=${f.values.join(',') || 'all'}`).join(' ')}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className={`${isDark ? 'bg-slate-900/85 text-slate-200 border-slate-700/50' : 'bg-white/90 text-on-surface-variant border-outline-variant/30'} backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border text-[10px] font-bold`}>
            Chargement des sites…
          </div>
        </div>
      )}

      {/* Empty state (only when load complete) */}
      {!loading && filteredSites.length === 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className={`${isDark ? 'bg-slate-900/85 text-slate-200 border-slate-700/50' : 'bg-white/90 text-on-surface-variant border-outline-variant/30'} backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border text-[10px] font-bold`}>
            Aucun site ne correspond aux filtres
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
