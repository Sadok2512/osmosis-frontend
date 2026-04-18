import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, useMap, LayersControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { ParameterRow } from './parameterHubApi';
import { MapPin, Layers, Flame, Circle as CircleIcon, AlertTriangle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MapViewProps {
  rows: ParameterRow[];
  parameterFocus?: string;
}

type ViewMode = 'points' | 'heatmap';

// Smooth red → yellow → green gradient (RAG inverted: low=red, high=green)
const gradientColor = (t: number): string => {
  // t in [0, 1]
  const tt = Math.max(0, Math.min(1, t));
  // 0 → red(0), 0.5 → yellow(60), 1 → green(140)
  const hue = tt * 140;
  return `hsl(${hue}, 78%, 48%)`;
};

const stringToColor = (val: string | null): string => {
  if (!val) return 'hsl(0, 0%, 60%)';
  let hash = 0;
  for (let i = 0; i < val.length; i++) hash = val.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
};

const FitBounds: React.FC<{ rows: ParameterRow[] }> = ({ rows }) => {
  const map = useMap();
  useEffect(() => {
    if (rows.length === 0) return;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    let count = 0;
    for (const r of rows) {
      const lat = r.latitude!, lng = r.longitude!;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      count++;
    }
    if (!count) return;
    map.fitBounds(
      [[minLat, minLng], [maxLat, maxLng]],
      { padding: [60, 60], maxZoom: 13 },
    );
  }, [rows, map]);
  return null;
};

// Heatmap layer rendered via leaflet.heat
const HeatLayer: React.FC<{
  points: Array<[number, number, number]>;
}> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    // @ts-expect-error leaflet.heat extends L
    const layer = L.heatLayer(points, {
      radius: 25,
      blur: 20,
      maxZoom: 14,
      minOpacity: 0.35,
      gradient: {
        0.0: 'hsl(0, 78%, 48%)',
        0.5: 'hsl(50, 90%, 55%)',
        1.0: 'hsl(140, 78%, 45%)',
      },
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
};

// Custom cluster icon — color reflects average value, size reflects count
const buildClusterIcon = (numericStats: { min: number; max: number } | null) =>
  (cluster: any) => {
    const children = cluster.getAllChildMarkers();
    const count = children.length;

    let color = 'hsl(220, 70%, 55%)';
    if (numericStats) {
      const vals = children
        .map((m: any) => m.options?.kpiValue)
        .filter((v: any) => Number.isFinite(v));
      if (vals.length) {
        const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        const t =
          numericStats.max === numericStats.min
            ? 0.5
            : (avg - numericStats.min) / (numericStats.max - numericStats.min);
        color = gradientColor(t);
      }
    }

    const size = count < 10 ? 36 : count < 100 ? 44 : count < 1000 ? 52 : 60;

    const html = `
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          inset: 0;
          background: ${color};
          opacity: 0.25;
          border-radius: 9999px;
          transform: scale(1.35);
        "></div>
        <div style="
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border: 2px solid rgba(255,255,255,0.95);
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: ${count < 100 ? 12 : 11}px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.18);
          font-family: Inter, system-ui, sans-serif;
          letter-spacing: -0.01em;
        ">${count.toLocaleString()}</div>
      </div>`;

    return L.divIcon({
      html,
      className: 'param-hub-cluster',
      iconSize: L.point(size, size, true),
    });
  };

// Normalize raw techno/band string to 2G/3G/4G/5G label
const normTechno = (raw: string | null | undefined): string => {
  if (!raw) return '—';
  const s = raw.toString().toUpperCase();
  const m = s.match(/(2G|3G|4G|5G|LTE|NR|GSM|UMTS)/);
  if (!m) return s.slice(0, 4);
  return m[1].replace('LTE', '4G').replace('NR', '5G').replace('GSM', '2G').replace('UMTS', '3G');
};

// Build a divIcon for a site marker.
// - Uniform site: solid color disc.
// - Multi-value site: conic-gradient pie split by cell value frequency.
const buildSiteIcon = (
  color: string,
  isMulti: boolean,
  size: number,
  pieSegments?: { color: string; pct: number }[],
) => {
  let bg = color;
  if (isMulti && pieSegments && pieSegments.length > 1) {
    let acc = 0;
    const stops: string[] = [];
    for (const seg of pieSegments) {
      const start = acc;
      acc += seg.pct;
      stops.push(`${seg.color} ${(start * 100).toFixed(2)}% ${(acc * 100).toFixed(2)}%`);
    }
    bg = `conic-gradient(${stops.join(',')})`;
  }
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${bg};
      border:2px solid #ffffff;
      box-shadow:0 2px 6px rgba(15,23,42,0.35),0 0 0 1px rgba(15,23,42,0.08);
      ${isMulti ? 'outline:2px dashed rgba(15,23,42,0.55);outline-offset:2px;' : ''}
    "></div>`;
  return L.divIcon({
    html,
    className: 'param-hub-site-marker',
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
  });
};

export const MapView: React.FC<MapViewProps> = ({ rows, parameterFocus }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('points');
  const [technoFilter, setTechnoFilter] = useState<Set<string>>(new Set());
  const [valueRange, setValueRange] = useState<[number, number] | null>(null);

  const focusRows = useMemo(
    () => (parameterFocus ? rows.filter((r) => r.parameter === parameterFocus) : rows),
    [rows, parameterFocus],
  );

  const numericStats = useMemo(() => {
    let min = Infinity, max = -Infinity, count = 0;
    for (const r of focusRows) {
      const n = Number(r.value);
      if (!Number.isFinite(n)) continue;
      if (n < min) min = n;
      if (n > max) max = n;
      count++;
    }
    if (count < focusRows.length * 0.5) return null;
    return { min, max };
  }, [focusRows]);

  // Reset slider when stats change
  useEffect(() => {
    if (numericStats) setValueRange([numericStats.min, numericStats.max]);
    else setValueRange(null);
  }, [numericStats?.min, numericStats?.max]);

  const availableTechnos = useMemo(() => {
    const set = new Set<string>();
    focusRows.forEach((r) => {
      const t = (r.techno ?? r.bande ?? '').toString();
      if (t) {
        // Try to extract 2G/3G/4G/5G hint from techno or band
        const m = t.match(/(2G|3G|4G|5G|LTE|NR|GSM|UMTS)/i);
        if (m) {
          const norm = m[1].toUpperCase()
            .replace('LTE', '4G').replace('NR', '5G')
            .replace('GSM', '2G').replace('UMTS', '3G');
          set.add(norm);
        }
      }
    });
    return Array.from(set).sort();
  }, [focusRows]);

  const visibleRows = useMemo(() => {
    return focusRows.filter((r) => {
      // Techno filter
      if (technoFilter.size) {
        const t = (r.techno ?? r.bande ?? '').toString().toUpperCase()
          .replace('LTE', '4G').replace('NR', '5G')
          .replace('GSM', '2G').replace('UMTS', '3G');
        const match = Array.from(technoFilter).some((tf) => t.includes(tf));
        if (!match) return false;
      }
      // Value range filter
      if (numericStats && valueRange) {
        const n = Number(r.value);
        if (Number.isFinite(n)) {
          if (n < valueRange[0] || n > valueRange[1]) return false;
        }
      }
      return true;
    });
  }, [focusRows, technoFilter, valueRange, numericStats]);

  const uniqueValues = useMemo(() => {
    if (numericStats) return [];
    return Array.from(new Set(visibleRows.map((r) => r.value ?? '(null)'))).sort().slice(0, 30);
  }, [visibleRows, numericStats]);

  // Stable color palette for categorical values (up to 30 distinct colors)
  const VALUE_PALETTE = [
    '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2',
    '#e11d48', '#4f46e5', '#059669', '#ea580c', '#7c3aed', '#0284c7',
    '#be123c', '#6d28d9', '#15803d', '#c2410c', '#7e22ce', '#0369a1',
    '#9f1239', '#5b21b6', '#166534', '#9a3412', '#6b21a8', '#075985',
    '#881337', '#4c1d95', '#14532d', '#7c2d12', '#581c87', '#0c4a6e',
  ];
  const MULTI_COLOR = '#64748b'; // slate-500 for multi-value sites

  const valueColorMap = useMemo(() => {
    const map = new Map<string, string>();
    uniqueValues.forEach((v, i) => {
      map.set(v, VALUE_PALETTE[i % VALUE_PALETTE.length]);
    });
    return map;
  }, [uniqueValues]);

  // Aggregate rows by site
  interface SitePoint {
    site_name: string;
    lat: number;
    lng: number;
    values: Set<string>;
    cells: typeof visibleRows;
    dominantValue: string;
    isMulti: boolean;
    avg: number | null;
    min: number | null;
    max: number | null;
    pieSegments: { value: string; color: string; pct: number; count: number }[];
  }

  const sitePoints = useMemo<SitePoint[]>(() => {
    const byKey = new Map<string, SitePoint>();
    for (const r of visibleRows) {
      const key = r.site_name ?? `${r.latitude},${r.longitude}`;
      if (!key) continue;
      let sp = byKey.get(key);
      if (!sp) {
        sp = {
          site_name: r.site_name ?? key,
          lat: r.latitude!,
          lng: r.longitude!,
          values: new Set(),
          cells: [],
          dominantValue: '',
          isMulti: false,
          avg: null, min: null, max: null,
          pieSegments: [],
        };
        byKey.set(key, sp);
      }
      sp.values.add(r.value ?? '(null)');
      sp.cells.push(r);
    }
    for (const sp of byKey.values()) {
      sp.isMulti = sp.values.size > 1;
      // Numeric stats
      const nums = sp.cells.map(c => Number(c.value)).filter(Number.isFinite);
      if (nums.length) {
        sp.avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        sp.min = Math.min(...nums);
        sp.max = Math.max(...nums);
      }
      // Frequency counts
      const counts = new Map<string, number>();
      for (const c of sp.cells) {
        const v = c.value ?? '(null)';
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best = '', bestN = 0;
      counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
      sp.dominantValue = best;
      // Pie segments (used for multi-value markers)
      const total = sp.cells.length || 1;
      const segs = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => {
          let segColor: string;
          if (numericStats) {
            const nv = Number(v);
            const t = Number.isFinite(nv) && numericStats.max !== numericStats.min
              ? (nv - numericStats.min) / (numericStats.max - numericStats.min)
              : 0.5;
            segColor = gradientColor(Number.isFinite(nv) ? t : 0.5);
          } else {
            segColor = valueColorMap.get(v) ?? stringToColor(v);
          }
          return { value: v, color: segColor, pct: n / total, count: n };
        });
      sp.pieSegments = segs;
    }
    return Array.from(byKey.values());
  }, [visibleRows, numericStats, valueColorMap]);

  const heatPoints = useMemo<Array<[number, number, number]>>(() => {
    if (!numericStats) {
      return visibleRows.map((r) => [r.latitude!, r.longitude!, 0.5]);
    }
    const span = numericStats.max - numericStats.min || 1;
    return visibleRows.map((r) => {
      const n = Number(r.value);
      const t = Number.isFinite(n) ? (n - numericStats.min) / span : 0.5;
      return [r.latitude!, r.longitude!, Math.max(0.1, t)];
    });
  }, [visibleRows, numericStats]);

  const toggleTechno = (t: string) => {
    setTechnoFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  if (focusRows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary" className="font-mono text-xs">0 points</Badge>
            <span className="text-xs text-muted-foreground">No geo-located rows yet</span>
          </div>
        </div>
        <div className="relative h-[68vh] bg-muted/30">
          <MapContainer
            center={[46.6, 2.3]}
            zoom={6}
            className="w-full h-full z-0"
            style={{ background: 'hsl(var(--muted))' }}
            zoomControl={false}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Light">
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                  attribution="&copy; CartoDB &copy; OSM"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Light + labels">
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution="&copy; CartoDB &copy; OSM"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution="&copy; Esri"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
          </MapContainer>

          {/* Floating empty-state hint */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <MapPin className="w-4 h-4 opacity-60" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">No geo-located data</div>
              <div className="text-xs text-muted-foreground">Apply filters with valid latitude / longitude</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="secondary" className="font-mono text-xs">
            {sitePoints.length.toLocaleString()} sites · {visibleRows.length.toLocaleString()} cells
          </Badge>
          {parameterFocus && (
            <span className="text-foreground font-medium tracking-tight">
              {parameterFocus}
            </span>
          )}
          {numericStats && (
            <span className="text-xs text-muted-foreground">
              range {numericStats.min.toFixed(2)} → {numericStats.max.toFixed(2)}
            </span>
          )}
        </div>

        {/* View mode toggle */}
        <div className="inline-flex items-center rounded-lg border border-border bg-background p-0.5 shadow-sm">
          <Button
            variant={viewMode === 'points' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setViewMode('points')}
          >
            <CircleIcon className="w-3 h-3" />
            Points
          </Button>
          <Button
            variant={viewMode === 'heatmap' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setViewMode('heatmap')}
          >
            <Flame className="w-3 h-3" />
            Heatmap
          </Button>
        </div>
      </div>

      {/* Map area */}
      <div className="relative h-[68vh] bg-muted/30">
        <MapContainer
          center={[46.6, 2.3]}
          zoom={6}
          className="w-full h-full z-0"
          style={{ background: 'hsl(var(--muted))' }}
          zoomControl={false}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Light">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                attribution="&copy; CartoDB &copy; OSM"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Light + labels">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="&copy; CartoDB &copy; OSM"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="&copy; Esri"
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          <FitBounds rows={visibleRows} />

          {viewMode === 'heatmap' ? (
            <HeatLayer points={heatPoints} />
          ) : (
            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={50}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              iconCreateFunction={buildClusterIcon(numericStats)}
            >
              {sitePoints.map((sp, i) => {
                let color: string;
                if (numericStats) {
                  // Numeric: average of all cells at this site
                  const vals = sp.cells.map(c => Number(c.value)).filter(Number.isFinite);
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : numericStats.min;
                  const t = numericStats.max === numericStats.min
                    ? 0.5
                    : (avg - numericStats.min) / (numericStats.max - numericStats.min);
                  color = gradientColor(t);
                } else if (sp.isMulti) {
                  color = MULTI_COLOR;
                } else {
                  color = valueColorMap.get(sp.dominantValue) ?? stringToColor(sp.dominantValue);
                }
                const radius = sp.isMulti ? 8 : 6;
                return (
                  <CircleMarker
                    key={`site-${sp.site_name}-${i}`}
                    center={[sp.lat, sp.lng]}
                    radius={radius}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: 0.9,
                      color: sp.isMulti ? '#ffffff' : 'rgba(255,255,255,0.9)',
                      weight: sp.isMulti ? 2 : 1.2,
                      dashArray: sp.isMulti ? '3 2' : undefined,
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1.5 min-w-[220px]">
                        <div className="font-bold text-sm pb-1 border-b border-border/50">
                          {sp.site_name}
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Cells</span>
                          <span className="font-semibold">{sp.cells.length}</span>
                        </div>
                        {sp.isMulti ? (
                          <>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Values</span>
                              <span className="font-bold text-amber-600">{sp.values.size} different</span>
                            </div>
                            <div className="pt-1 border-t border-border/30 space-y-0.5">
                              {sp.cells.map((c, ci) => {
                                const cv = c.value ?? '(null)';
                                const cc = valueColorMap.get(cv) ?? stringToColor(cv);
                                return (
                                  <div key={ci} className="flex justify-between gap-2 text-[11px]">
                                    <span className="truncate max-w-[120px] text-muted-foreground">{c.cell_name ?? c.bande ?? `cell-${ci}`}</span>
                                    <span className="font-bold px-1 rounded" style={{ color: cc, background: `${cc}15` }}>{cv}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Value</span>
                            <span className="font-bold px-1.5 rounded" style={{ color, background: `${color}15` }}>
                              {sp.dominantValue}
                            </span>
                          </div>
                        )}
                        {sp.cells[0]?.vendor && (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Vendor</span>
                            <span>{sp.cells[0].vendor}</span>
                          </div>
                        )}
                        {sp.cells[0]?.plaque && (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Plaque</span>
                            <span>{sp.cells[0].plaque}</span>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MarkerClusterGroup>
          )}
        </MapContainer>

        {/* Floating filter panel — top left */}
        {(availableTechnos.length > 0 || numericStats) && (
          <div className="absolute top-4 left-4 z-[1000] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-lg p-4 w-[280px] space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              Map filters
            </div>

            {numericStats && valueRange && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Value range</span>
                  <span className="font-mono text-foreground">
                    {valueRange[0].toFixed(1)} – {valueRange[1].toFixed(1)}
                  </span>
                </div>
                <Slider
                  min={numericStats.min}
                  max={numericStats.max}
                  step={(numericStats.max - numericStats.min) / 100 || 1}
                  value={valueRange}
                  onValueChange={(v) => setValueRange([v[0], v[1]] as [number, number])}
                  className="py-1"
                />
              </div>
            )}

            {availableTechnos.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium">Technology</div>
                <div className="flex flex-wrap gap-1.5">
                  {availableTechnos.map((t) => {
                    const active = technoFilter.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTechno(t)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                  {technoFilter.size > 0 && (
                    <button
                      onClick={() => setTechnoFilter(new Set())}
                      className="px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend — bottom left */}
        {numericStats ? (
          <div className="absolute bottom-5 left-5 z-[1000] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-lg p-4 min-w-[260px]">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {parameterFocus ?? 'Parameter'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {viewMode === 'heatmap' ? 'Density' : 'Gradient'}
              </div>
            </div>
            <div
              className="h-2.5 w-full rounded-full"
              style={{
                background:
                  'linear-gradient(to right, hsl(0,78%,48%) 0%, hsl(50,90%,55%) 50%, hsl(140,78%,45%) 100%)',
              }}
            />
            <div className="flex justify-between text-[11px] mt-1.5 font-mono">
              <span className="text-foreground font-semibold">{numericStats.min.toFixed(2)}</span>
              <span className="text-muted-foreground">
                {((numericStats.min + numericStats.max) / 2).toFixed(2)}
              </span>
              <span className="text-foreground font-semibold">{numericStats.max.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] mt-0.5 text-muted-foreground">
              <span>Critical</span>
              <span>Optimal</span>
            </div>
          </div>
        ) : (
          uniqueValues.length > 0 && uniqueValues.length <= 30 && viewMode === 'points' && (
            <div className="absolute bottom-5 left-5 z-[1000] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-lg p-3 max-h-[320px] overflow-y-auto min-w-[200px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Values ({uniqueValues.length})
              </div>
              <div className="space-y-1">
                {uniqueValues.map((v) => (
                  <div key={v} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-3 h-3 rounded-full shrink-0 border border-white/60 shadow-sm"
                      style={{ backgroundColor: valueColorMap.get(v) ?? stringToColor(v === '(null)' ? null : v) }}
                    />
                    <span className="truncate max-w-[160px] text-foreground">{v}</span>
                  </div>
                ))}
                {/* Multi-values indicator */}
                <div className="flex items-center gap-2 text-xs pt-1 mt-1 border-t border-border/30">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border-2 border-white shadow-sm"
                    style={{ backgroundColor: MULTI_COLOR, borderStyle: 'dashed' }}
                  />
                  <span className="truncate max-w-[160px] text-muted-foreground italic">Multi-values</span>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default MapView;
