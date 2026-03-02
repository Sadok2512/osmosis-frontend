import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, Check, Loader2, MapPin, ChevronDown, X } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface ParamPoint {
  id: number;
  cell_name: string | null;
  site_name: string | null;
  latitude: number;
  longitude: number;
  parameter: string;
  value: string | null;
  bande: string | null;
  techno?: string | null;
  vendor: string | null;
  dn: string | null;
}

/* ── value → color helper ── */
const stringToColor = (val: string | null): string => {
  if (!val) return 'hsl(0, 0%, 60%)';
  let hash = 0;
  for (let i = 0; i < val.length; i++) hash = val.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
};

/* ── Map auto-fit ── */
const FitBounds: React.FC<{ points: ParamPoint[] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
};

const ParametersPage: React.FC = () => {
  /* ── state ── */
  const [availableParams, setAvailableParams] = useState<string[]>([]);
  const [paramsLoading, setParamsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedParam, setSelectedParam] = useState<string | null>(null);
  const [confirmedParam, setConfirmedParam] = useState<string | null>(null);
  const [points, setPoints] = useState<ParamPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── load available parameters ── */
  useEffect(() => {
    (async () => {
      setParamsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('parameter_dump')
          .select('parameter')
          .limit(10000);
        if (error) throw error;
        const unique = [...new Set((data || []).map((r: any) => r.parameter).filter(Boolean))].sort() as string[];
        setAvailableParams(unique);
      } catch (e) { console.error(e); }
      setParamsLoading(false);
    })();
  }, []);

  /* ── close dropdown on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── filtered params for search ── */
  const filteredParams = useMemo(() => {
    if (!search) return availableParams;
    const s = search.toLowerCase();
    return availableParams.filter(p => p.toLowerCase().includes(s));
  }, [availableParams, search]);

  /* ── confirm & load data ── */
  const handleConfirm = useCallback(async () => {
    if (!selectedParam) return;
    setConfirmedParam(selectedParam);
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('parameter_dump')
        .select('id, cell_name, site_name, latitude, longitude, parameter, value, bande, vendor, dn')
        .eq('parameter', selectedParam)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(5000);
      if (error) throw error;
      setPoints((data || []).filter((r: any) => r.latitude && r.longitude) as ParamPoint[]);
    } catch (e) { console.error(e); setPoints([]); }
    setLoading(false);
  }, [selectedParam]);

  /* ── unique values for legend ── */
  const uniqueValues = useMemo(() => {
    return [...new Set(points.map(p => p.value || '(vide)'))].sort();
  }, [points]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header bar ── */}
      <div className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground tracking-tight">Parameters Map</h1>
          </div>

          {/* ── Searchable single-select dropdown ── */}
          <div ref={dropdownRef} className="relative min-w-[280px]">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-input bg-background hover:bg-accent/50 transition-colors"
            >
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className={`flex-1 text-left truncate ${selectedParam ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {selectedParam || 'Sélectionner un paramètre...'}
              </span>
              {selectedParam && (
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedParam(null); }} />
              )}
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-[320px] flex flex-col">
                <div className="p-2 border-b border-border">
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                  {paramsLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : filteredParams.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">Aucun paramètre trouvé</div>
                  ) : filteredParams.map(p => (
                    <button
                      key={p}
                      onClick={() => { setSelectedParam(p); setDropdownOpen(false); setSearch(''); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md transition-colors ${
                        selectedParam === p ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selectedParam === p ? 'border-primary bg-primary' : 'border-input'
                      }`}>
                        {selectedParam === p && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Confirm button ── */}
          <button
            onClick={handleConfirm}
            disabled={!selectedParam || loading}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirm
          </button>

          {confirmedParam && (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{confirmedParam}</span> — {points.length} points
            </span>
          )}
        </div>
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 relative">
        {!confirmedParam ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MapPin className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">Sélectionnez un paramètre puis cliquez Confirm pour afficher les points sur la carte.</p>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <MapContainer
              center={[46.6, 2.3]}
              zoom={6}
              className="w-full h-full z-0"
              style={{ background: 'hsl(var(--background))' }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                attribution="&copy; CartoDB"
              />
              <FitBounds points={points} />
              {points.map(pt => (
                <CircleMarker
                  key={pt.id}
                  center={[pt.latitude, pt.longitude]}
                  radius={5}
                  pathOptions={{
                    fillColor: stringToColor(pt.value),
                    fillOpacity: 0.85,
                    color: 'hsl(var(--border))',
                    weight: 0.5,
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[180px]">
                      <div className="font-bold text-sm">{pt.cell_name || pt.site_name || `#${pt.id}`}</div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Paramètre</span><span className="font-semibold">{pt.parameter}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Valeur</span><span className="font-semibold" style={{ color: stringToColor(pt.value) }}>{pt.value ?? '—'}</span></div>
                      {pt.bande && <div className="flex justify-between"><span className="text-muted-foreground">Bande</span><span>{pt.bande}</span></div>}
                      {pt.vendor && <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span>{pt.vendor}</span></div>}
                      {pt.dn && <div className="flex justify-between"><span className="text-muted-foreground">MO (DN)</span><span className="truncate max-w-[120px]">{pt.dn}</span></div>}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* ── Value legend ── */}
            {uniqueValues.length > 0 && uniqueValues.length <= 20 && (
              <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 max-h-[240px] overflow-y-auto">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Valeurs ({uniqueValues.length})</div>
                <div className="space-y-1">
                  {uniqueValues.map(v => (
                    <div key={v} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stringToColor(v === '(vide)' ? null : v) }} />
                      <span className="truncate max-w-[140px]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ParametersPage;
