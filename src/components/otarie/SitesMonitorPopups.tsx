import React, { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '@/integrations/supabase/client';

export const HeatmapLayer = ({ points, radius = 25, blur = 15, maxZoom, minOpacity = 0.4 }: {
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
      gradient: { 0.1: '#3498DB', 0.3: '#10b981', 0.5: '#f59e0b', 0.7: '#F39C12', 0.9: '#ef4444' },
    });
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, points, radius, blur, maxZoom, minOpacity]);
  return null;
};

export const SiteAllParamsPopup: React.FC<{ siteName: string; activeParam: string | null }> = ({ siteName, activeParam }) => {
  const [rows, setRows] = useState<Array<{ parameter: string; cell_name: string | null; value: string | null; bande: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('parameter_dump')
          .select('parameter, cell_name, value, bande')
          .ilike('site_name', siteName)
          .order('cell_name', { ascending: true })
          .order('parameter', { ascending: true })
          .limit(5000);
        if (cancelled) return;
        setRows((data || []).map((row: any) => ({
          parameter: row.parameter || '',
          cell_name: row.cell_name || null,
          value: row.value ?? null,
          bande: row.bande || null,
        })));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteName]);

  const byCell = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    const needle = filter.trim().toLowerCase();
    for (const row of rows) {
      if (needle && !row.parameter.toLowerCase().includes(needle) && !(row.value || '').toLowerCase().includes(needle)) continue;
      const key = row.cell_name || '(site)';
      const values = grouped.get(key) || [];
      values.push(row);
      grouped.set(key, values);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filter]);

  return (
    <div className="text-xs min-w-[320px] max-w-[420px]">
      <div className="font-bold text-sm mb-1.5">{siteName}</div>
      <input
        type="text"
        value={filter}
        onChange={event => setFilter(event.target.value)}
        placeholder="Filtrer paramètre / valeur…"
        className="w-full mb-2 px-2 py-1 text-[11px] border border-border/60 rounded bg-background outline-none focus:ring-1 focus:ring-primary"
      />
      {loading ? (
        <div className="text-[11px] text-muted-foreground italic py-2">Chargement de tous les paramètres…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic py-2">Aucun paramètre trouvé pour ce site.</div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2">
          {byCell.map(([cellName, params]) => (
            <div key={cellName} className="border border-border/40 rounded-md overflow-hidden">
              <div className="bg-muted/60 px-2 py-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-[11px] truncate">{cellName}</span>
                <span className="text-[9px] text-muted-foreground tabular-nums">{params.length}</span>
              </div>
              <div className="divide-y divide-border/30">
                {params.map((param, index) => {
                  const isActive = activeParam && param.parameter === activeParam;
                  return (
                    <div key={index} className={`flex items-center justify-between gap-2 px-2 py-0.5 text-[10.5px] ${isActive ? 'bg-primary/10' : ''}`}>
                      <span className={`truncate flex-1 ${isActive ? 'font-bold text-primary' : 'text-muted-foreground'}`} title={param.parameter}>{param.parameter}</span>
                      <span className={`tabular-nums shrink-0 max-w-[110px] truncate text-right ${isActive ? 'font-bold text-primary' : 'font-semibold text-foreground'}`} title={String(param.value ?? '')}>{param.value ?? '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[9px] text-muted-foreground text-right">{rows.length} paramètres • {byCell.length} cellules</div>
    </div>
  );
};
