import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, RefreshCw, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAnomalies } from '../sentinelApi';
import { fetchTopoSites } from '@/services/topoService';
import type { Anomaly } from '../types';
import type { SiteSummary } from '@/types';

interface Props {
  date: string;
  apiConnected: boolean;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  major: '#f59e0b',
  minor: '#3b82f6',
};

interface MapPoint {
  key: string;
  lat: number;
  lng: number;
  site: string;
  count: number;
  critical: number;
  major: number;
  minor: number;
  worst: 'critical' | 'major' | 'minor';
  anomalies: Anomaly[];
}

const FitToPoints: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
    }
  }, [points.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const SentinelLiveMap: React.FC<Props> = ({ date, apiConnected }) => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<number | null>(null);

  // Load site catalog once for coordinates
  useEffect(() => {
    let cancelled = false;
    fetchTopoSites()
      .then(s => { if (!cancelled) setSites(s); })
      .catch(() => { /* keep empty; map will just show no points */ });
    return () => { cancelled = true; };
  }, []);

  const load = async () => {
    if (!date) return;
    setLoading(true);
    try {
      const items = await fetchAnomalies({ date, page: 1, per_page: 500 });
      setAnomalies(items);
      setLastRefresh(new Date());
    } catch {
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(load, 30000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, date]);

  // Index sites by name for coordinate lookup
  const siteIndex = useMemo(() => {
    const map = new Map<string, SiteSummary>();
    for (const s of sites) {
      if (s.site_name) map.set(s.site_name.toLowerCase(), s);
      if (s.site_id) map.set(s.site_id.toLowerCase(), s);
    }
    return map;
  }, [sites]);

  const points = useMemo<MapPoint[]>(() => {
    const grouped = new Map<string, MapPoint>();
    for (const a of anomalies) {
      const siteName = a.dimension_2 || '';
      const lookup = siteIndex.get(siteName.toLowerCase());
      if (!lookup || !Array.isArray(lookup.coordinates)) continue;
      const [lat, lng] = lookup.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = lookup.site_id || siteName;
      const cur = grouped.get(key) || {
        key, lat, lng, site: lookup.site_name || siteName,
        count: 0, critical: 0, major: 0, minor: 0, worst: 'minor' as const, anomalies: [],
      };
      cur.count++;
      cur.anomalies.push(a);
      if (a.severity === 'critical') cur.critical++;
      else if (a.severity === 'major') cur.major++;
      else cur.minor++;
      cur.worst = cur.critical > 0 ? 'critical' : cur.major > 0 ? 'major' : 'minor';
      grouped.set(key, cur);
    }
    return Array.from(grouped.values());
  }, [anomalies, siteIndex]);

  const bounds = useMemo<[number, number][]>(
    () => points.map(p => [p.lat, p.lng] as [number, number]),
    [points],
  );

  const totals = useMemo(() => {
    return points.reduce(
      (acc, p) => {
        acc.critical += p.critical;
        acc.major += p.major;
        acc.minor += p.minor;
        return acc;
      },
      { critical: 0, major: 0, minor: 0 },
    );
  }, [points]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-sm ring-1 ring-slate-900/5">
        <div className="flex items-center gap-2 text-[12px] text-slate-700 font-semibold">
          <MapPin className="w-4 h-4 text-sky-600" />
          Live Map · {date}
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" /> Critical · {totals.critical}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Major · {totals.major}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Minor · {totals.minor}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{points.length} sites impactés</span>
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="accent-sky-600"
          />
          Auto-refresh 30s
        </label>
        <button
          onClick={load}
          disabled={loading}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white',
            'bg-gradient-to-r from-sky-500 to-indigo-600 shadow-sm hover:-translate-y-px transition-all',
            loading && 'opacity-60 cursor-not-allowed',
          )}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Rafraîchir
        </button>
        {lastRefresh && (
          <span className="text-[10px] text-slate-400">
            Mis à jour {lastRefresh.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-[480px] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        {!apiConnected && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] flex items-center gap-1.5 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5" /> Backend hors ligne — carte en lecture seule
          </div>
        )}
        <MapContainer
            center={[46.6, 2.3]}
            zoom={6}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap, &copy; CARTO'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FitToPoints points={bounds} />
            {points.map(p => {
              const color = SEVERITY_COLOR[p.worst];
              const radius = Math.min(22, 6 + Math.sqrt(p.count) * 3);
              return (
                <CircleMarker
                  key={p.key}
                  center={[p.lat, p.lng]}
                  radius={radius}
                  pathOptions={{
                    color: '#fff',
                    weight: 2,
                    fillColor: color,
                    fillOpacity: 0.8,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]} className="!text-[10px]">
                    <div className="font-bold">{p.site}</div>
                    <div>{p.count} anomalie{p.count > 1 ? 's' : ''}</div>
                    <div className="text-[9px] text-slate-500">
                      C:{p.critical} · M:{p.major} · m:{p.minor}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default SentinelLiveMap;
