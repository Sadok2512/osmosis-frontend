import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Search, ArrowUpRight, ArrowDownLeft, Radio, MapPin, RotateCcw, Waypoints } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';

interface NeighborRelation {
  source_cell: string;
  target_cell: string;
  target_site?: string;
  relation_type: 'intra_freq' | 'inter_freq' | 'inter_system';
  direction: 'outgoing' | 'incoming';
  ho_count?: number;
  ho_success_rate?: number;
  target_lat?: number;
  target_lon?: number;
  target_techno?: string;
  target_band?: string;
}

interface Props {
  filters: Record<string, string[]>;
}

/** Map backend neighbor response to frontend interface */
function mapNeighbor(r: any, fallbackSource: string): NeighborRelation {
  return {
    source_cell: r.source_cell || fallbackSource,
    target_cell: r.targetCellId || r.target_cell || '',
    target_site: r.targetSiteName || r.target_site || '',
    relation_type: r.relationType || r.relation_type || 'inter_system',
    direction: (r.relationDirection || r.direction || 'outgoing') === 'out' ? 'outgoing' : (r.relationDirection || r.direction || 'outgoing'),
    ho_count: r.hoCount ?? r.ho_count ?? 0,
    ho_success_rate: r.hoSuccessRate ?? r.ho_success_rate,
    target_techno: r.targetTechno || r.target_techno || '',
    target_band: r.targetBande || r.target_band || '',
    target_lat: r.targetCoords?.[0] ?? r.target_lat,
    target_lon: r.targetCoords?.[1] ?? r.target_lon,
  };
}

const RELATION_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  intra_freq:   { bg: 'bg-blue-500/10', text: 'text-blue-600', dot: 'bg-blue-500', label: 'Intra-Freq' },
  inter_freq:   { bg: 'bg-amber-500/10', text: 'text-amber-600', dot: 'bg-amber-500', label: 'Inter-Freq' },
  inter_system: { bg: 'bg-purple-500/10', text: 'text-purple-600', dot: 'bg-purple-500', label: 'Inter-System' },
};

function hoSeverity(rate?: number): string {
  if (rate == null) return 'text-muted-foreground';
  if (rate >= 98) return 'text-emerald-600';
  if (rate >= 95) return 'text-amber-500';
  return 'text-red-500';
}

const NeighborsSection: React.FC<Props> = ({ filters }) => {
  const [neighbors, setNeighbors] = useState<NeighborRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const cellIds = useMemo(() => {
    return filters.Cell || filters.CELL || [];
  }, [filters]);

  const siteIds = useMemo(() => {
    return filters.Site || filters.SITE || [];
  }, [filters]);

  const hasFilter = cellIds.length > 0 || siteIds.length > 0;

  useEffect(() => {
    if (!hasFilter) {
      setNeighbors([]);
      return;
    }
    const controller = new AbortController();
    const fetchNeighbors = async () => {
      setLoading(true);
      setError(null);
      try {
        const allResults: NeighborRelation[] = [];

        // Fetch neighbors for cells or sites — both directions
        const lookupIds = cellIds.length > 0 ? cellIds.slice(0, 5) : siteIds.slice(0, 3);
        for (const id of lookupIds) {
          for (const dir of ['out', 'in'] as const) {
            if (controller.signal.aborted) break;
            const res = await fetch(getApiUrl(`neighbors/${encodeURIComponent(id)}?direction=${dir}&limit=100`), {
              headers: getApiHeaders(), signal: controller.signal,
            });
            if (!res.ok) continue;
            const data = await res.json();
            const rawRels = Array.isArray(data) ? data : data.neighbors || data.relations || [];
            allResults.push(...rawRels.map((r: any) => mapNeighbor(r, id)));
          }
        }

        if (controller.signal.aborted) return;
        setNeighbors(allResults);
        if (allResults.length === 0) setError('Aucune relation de voisinage trouvée');
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.warn('[Neighbors] Fetch failed:', err.message);
        setError(err.message);
        setNeighbors([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchNeighbors();
    return () => controller.abort();
  }, [cellIds, siteIds, hasFilter]);

  const filtered = useMemo(() => {
    let items = neighbors;
    if (dirFilter !== 'all') items = items.filter(n => n.direction === dirFilter);
    if (typeFilter) items = items.filter(n => n.relation_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(n =>
        n.source_cell.toLowerCase().includes(q) ||
        n.target_cell.toLowerCase().includes(q) ||
        (n.target_site || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [neighbors, dirFilter, typeFilter, search]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of neighbors) c[n.relation_type] = (c[n.relation_type] || 0) + 1;
    return c;
  }, [neighbors]);

  const outCount = neighbors.filter(n => n.direction === 'outgoing').length;
  const inCount = neighbors.filter(n => n.direction === 'incoming').length;

  if (!hasFilter) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-12 text-center">
        <Waypoints className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
        <p className="text-xs text-muted-foreground">Sélectionnez un site ou une cellule dans les filtres pour afficher les relations de voisinage.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-3">
          <Waypoints className="w-4 h-4 text-blue-500" />
          <span className="text-[12px] font-bold text-foreground tracking-wide">Voisines (Neighbors)</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{neighbors.length} relations</span>
          {cellIds.length > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-semibold">
              {cellIds.length} cellule{cellIds.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {error && <span className="text-[9px] text-amber-500 font-medium">Mode démo</span>}
      </div>

      {/* Type + direction filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/5 flex-wrap">
        {Object.entries(RELATION_COLORS).map(([type, cfg]) => {
          const count = typeCounts[type] || 0;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border',
                typeFilter === type
                  ? `${cfg.bg} ${cfg.text} border-current/20`
                  : 'border-transparent hover:bg-muted/40 text-muted-foreground'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
              {cfg.label}
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        {/* Direction filter */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5">
          {([
            { key: 'all' as const, label: 'Tous', icon: ArrowRightLeft },
            { key: 'outgoing' as const, label: `Sortantes (${outCount})`, icon: ArrowUpRight },
            { key: 'incoming' as const, label: `Entrantes (${inCount})`, icon: ArrowDownLeft },
          ]).map(d => (
            <button
              key={d.key}
              onClick={() => setDirFilter(d.key)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold transition-colors',
                dirFilter === d.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <d.icon className="w-2.5 h-2.5" />
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/20">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une cellule, site..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-[11px] outline-none focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[500px] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
            <tr className="border-b border-border/30">
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[80px]">Type</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[50px]">Dir</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px]">Source</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px]">Cible</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[80px]">Site Cible</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[60px]">Techno</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[60px]">Band</th>
              <th className="text-right px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[60px]">HO #</th>
              <th className="text-right px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[60px]">HO SR%</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] text-muted-foreground">Chargement des voisines...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Waypoints className="w-6 h-6 text-muted-foreground/20" />
                    <span className="text-[11px] text-muted-foreground">Aucune relation trouvée</span>
                    {(typeFilter || search) && (
                      <button
                        onClick={() => { setTypeFilter(''); setSearch(''); }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Réinitialiser
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((rel, idx) => {
                const cfg = RELATION_COLORS[rel.relation_type] || RELATION_COLORS.intra_freq;
                return (
                  <tr key={idx} className="border-b border-border/10 transition-colors hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold', cfg.bg, cfg.text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {rel.direction === 'outgoing' ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-amber-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground font-mono text-[10px]">
                      <span className="flex items-center gap-1"><Radio className="w-2.5 h-2.5 text-muted-foreground/40" />{rel.source_cell}</span>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground font-mono text-[10px]">
                      <span className="flex items-center gap-1"><Radio className="w-2.5 h-2.5 text-muted-foreground/40" />{rel.target_cell}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {rel.target_site ? (
                        <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-muted-foreground/40" />{rel.target_site}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {rel.target_techno ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-semibold">{rel.target_techno}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {rel.target_band ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-semibold">{rel.target_band}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                      {rel.ho_count != null ? rel.ho_count.toLocaleString() : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-bold', hoSeverity(rel.ho_success_rate))}>
                      {rel.ho_success_rate != null ? `${rel.ho_success_rate.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function generateMockNeighbors(cellIds: string[]): NeighborRelation[] {
  const result: NeighborRelation[] = [];
  const bands = ['L800', 'L1800', 'L2100', 'NR3500', 'NR700'];
  const technos = ['4G', '4G', '4G', '5G', '5G'];
  const types: NeighborRelation['relation_type'][] = ['intra_freq', 'inter_freq', 'inter_system'];

  for (const src of cellIds.slice(0, 3)) {
    const srcSite = src.replace(/_[^_]+_\d+$/, '');
    for (let i = 0; i < 8; i++) {
      const bandIdx = i % bands.length;
      const targetSite = `SITE_${String.fromCharCode(65 + i)}_${Math.floor(Math.random() * 20 + 1).toString().padStart(2, '0')}`;
      result.push({
        source_cell: src,
        target_cell: `${targetSite}_${bands[bandIdx]}_${(i % 3) + 1}`,
        target_site: targetSite,
        relation_type: types[i % 3],
        direction: i < 5 ? 'outgoing' : 'incoming',
        ho_count: Math.floor(Math.random() * 5000 + 100),
        ho_success_rate: Math.random() * 8 + 92,
        target_techno: technos[bandIdx],
        target_band: bands[bandIdx],
      });
    }
  }
  return result;
}

export default NeighborsSection;
