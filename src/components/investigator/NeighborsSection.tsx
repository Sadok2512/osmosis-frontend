import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Search, ArrowUpRight, ArrowDownLeft, Radio, MapPin, RotateCcw, Waypoints, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
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

const RELATION_COLORS: Record<string, { bg: string; text: string; dot: string; label: string; ring: string }> = {
  intra_freq:   { bg: 'bg-blue-500/8', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', label: 'Intra-Freq', ring: 'ring-blue-500/20' },
  inter_freq:   { bg: 'bg-amber-500/8', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', label: 'Inter-Freq', ring: 'ring-amber-500/20' },
  inter_system: { bg: 'bg-purple-500/8', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500', label: 'Inter-System', ring: 'ring-purple-500/20' },
};

function hoSeverity(rate?: number): { text: string; bg: string } {
  if (rate == null) return { text: 'text-muted-foreground', bg: '' };
  if (rate >= 98) return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/8' };
  if (rate >= 95) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/8' };
  return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/8' };
}

type SortKey = 'type' | 'direction' | 'source' | 'target' | 'site' | 'techno' | 'band' | 'ho_count' | 'ho_sr';
type SortDir = 'asc' | 'desc';

const NeighborsSection: React.FC<Props> = ({ filters }) => {
  const [neighbors, setNeighbors] = useState<NeighborRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const cellIds = useMemo(() => filters.Cell || filters.CELL || [], [filters]);
  const siteIds = useMemo(() => filters.Site || filters.SITE || [], [filters]);
  const hasFilter = cellIds.length > 0 || siteIds.length > 0;

  useEffect(() => {
    if (!hasFilter) { setNeighbors([]); return; }
    const controller = new AbortController();
    const fetchNeighbors = async () => {
      setLoading(true); setError(null);
      try {
        const allResults: NeighborRelation[] = [];
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
        setError(err.message); setNeighbors([]);
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
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => {
        let av: any, bv: any;
        switch (sortKey) {
          case 'type': av = a.relation_type; bv = b.relation_type; break;
          case 'direction': av = a.direction; bv = b.direction; break;
          case 'source': av = a.source_cell; bv = b.source_cell; break;
          case 'target': av = a.target_cell; bv = b.target_cell; break;
          case 'site': av = a.target_site || ''; bv = b.target_site || ''; break;
          case 'techno': av = a.target_techno || ''; bv = b.target_techno || ''; break;
          case 'band': av = a.target_band || ''; bv = b.target_band || ''; break;
          case 'ho_count': return ((a.ho_count ?? -1) - (b.ho_count ?? -1)) * dir;
          case 'ho_sr': return ((a.ho_success_rate ?? -1) - (b.ho_success_rate ?? -1)) * dir;
          default: return 0;
        }
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return items;
  }, [neighbors, dirFilter, typeFilter, search, sortKey, sortDir]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of neighbors) c[n.relation_type] = (c[n.relation_type] || 0) + 1;
    return c;
  }, [neighbors]);

  const outCount = neighbors.filter(n => n.direction === 'outgoing').length;
  const inCount = neighbors.filter(n => n.direction === 'incoming').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key); setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-2.5 h-2.5 text-muted-foreground/30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-2.5 h-2.5 text-primary" />
      : <ChevronDown className="w-2.5 h-2.5 text-primary" />;
  };

  if (!hasFilter) {
    return (
      <div className="rounded-xl border border-dashed border-border/30 bg-muted/5 p-16 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted/30 mb-4">
          <Waypoints className="w-6 h-6 text-muted-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground/60 max-w-[280px] mx-auto leading-relaxed">
          Sélectionnez un site ou une cellule dans les filtres pour afficher les relations de voisinage.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden shadow-sm">

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-muted/20 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10">
              <Waypoints className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-foreground tracking-wide">Neighbors</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground font-medium tabular-nums">
                  {neighbors.length} relations
                </span>
              </div>
              {cellIds.length > 0 && (
                <span className="text-[9px] text-muted-foreground/60">
                  {cellIds.length} cellule{cellIds.length > 1 ? 's' : ''} sélectionnée{cellIds.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Summary pills */}
          <div className="flex items-center gap-1.5">
            {Object.entries(RELATION_COLORS).map(([type, cfg]) => {
              const count = typeCounts[type] || 0;
              if (count === 0 && neighbors.length > 0) return null;
              return (
                <div key={type} className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-semibold',
                  cfg.bg, cfg.text
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                  <span className="hidden sm:inline">{cfg.label}</span>
                  <span className="tabular-nums font-bold">{count}</span>
                </div>
              );
            })}
            {error && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">Demo</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-4 py-2.5 border-b border-border/20 bg-muted/5">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher cellule, site..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border/40 bg-background text-[10px] outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Type filter chips */}
          <div className="flex items-center gap-1">
            {Object.entries(RELATION_COLORS).map(([type, cfg]) => {
              const count = typeCounts[type] || 0;
              const active = typeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(active ? '' : type)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all border',
                    active
                      ? `${cfg.bg} ${cfg.text} border-current/15 ring-1 ${cfg.ring}`
                      : 'border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', active ? cfg.dot : 'bg-muted-foreground/20')} />
                  {cfg.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Direction segmented control */}
          <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/20">
            {([
              { key: 'all' as const, label: 'Tous', icon: ArrowRightLeft, count: neighbors.length },
              { key: 'outgoing' as const, label: 'Out', icon: ArrowUpRight, count: outCount },
              { key: 'incoming' as const, label: 'In', icon: ArrowDownLeft, count: inCount },
            ]).map(d => (
              <button
                key={d.key}
                onClick={() => setDirFilter(d.key)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-semibold transition-all',
                  dirFilter === d.key
                    ? 'bg-card text-foreground shadow-sm border border-border/30'
                    : 'text-muted-foreground/60 hover:text-muted-foreground border border-transparent'
                )}
              >
                <d.icon className="w-2.5 h-2.5" />
                {d.label}
                <span className="tabular-nums opacity-60">{d.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/50 backdrop-blur-md border-b border-border/30">
              {([
                { key: 'type' as SortKey, label: 'Type', align: 'left', w: 'w-[90px]' },
                { key: 'direction' as SortKey, label: 'Dir', align: 'left', w: 'w-[44px]' },
                { key: 'source' as SortKey, label: 'Source Cell', align: 'left', w: '' },
                { key: 'target' as SortKey, label: 'Target Cell', align: 'left', w: '' },
                { key: 'site' as SortKey, label: 'Target Site', align: 'left', w: 'w-[100px]' },
                { key: 'techno' as SortKey, label: 'Tech', align: 'left', w: 'w-[52px]' },
                { key: 'band' as SortKey, label: 'Band', align: 'left', w: 'w-[60px]' },
                { key: 'ho_count' as SortKey, label: 'HO Count', align: 'right', w: 'w-[72px]' },
                { key: 'ho_sr' as SortKey, label: 'HO SR%', align: 'right', w: 'w-[68px]' },
              ]).map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'px-3 py-2 font-bold uppercase tracking-wider text-[8px] cursor-pointer select-none transition-colors hover:text-foreground',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.w,
                    sortKey === col.key ? 'text-foreground' : 'text-muted-foreground/60'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-[10px] text-muted-foreground/60">Chargement des voisines...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
                      <Waypoints className="w-5 h-5 text-muted-foreground/20" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">Aucune relation trouvée</span>
                    {(typeFilter || search) && (
                      <button
                        onClick={() => { setTypeFilter(''); setSearch(''); }}
                        className="text-[9px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((rel, idx) => {
                const cfg = RELATION_COLORS[rel.relation_type] || RELATION_COLORS.intra_freq;
                const sr = hoSeverity(rel.ho_success_rate);
                return (
                  <tr
                    key={idx}
                    className={cn(
                      'transition-colors hover:bg-muted/15 group',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/[0.03]'
                    )}
                  >
                    {/* Type */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[8px] font-bold ring-1',
                        cfg.bg, cfg.text, cfg.ring
                      )}>
                        <span className={cn('w-[5px] h-[5px] rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Direction */}
                    <td className="px-3 py-2.5">
                      <div className={cn(
                        'inline-flex items-center justify-center w-5 h-5 rounded-md',
                        rel.direction === 'outgoing' ? 'bg-blue-500/8' : 'bg-amber-500/8'
                      )}>
                        {rel.direction === 'outgoing' ? (
                          <ArrowUpRight className="w-3 h-3 text-blue-500" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-foreground">
                        <Radio className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{rel.source_cell}</span>
                      </span>
                    </td>

                    {/* Target */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-foreground">
                        <Radio className="w-2.5 h-2.5 text-primary/30 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{rel.target_cell}</span>
                      </span>
                    </td>

                    {/* Site */}
                    <td className="px-3 py-2.5">
                      {rel.target_site ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[10px]">
                          <MapPin className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" />
                          <span className="truncate max-w-[90px]">{rel.target_site}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* Techno */}
                    <td className="px-3 py-2.5">
                      {rel.target_techno ? (
                        <span className="text-[8px] px-1.5 py-[2px] rounded bg-muted/60 font-bold text-foreground/70 tracking-wide">
                          {rel.target_techno}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* Band */}
                    <td className="px-3 py-2.5">
                      {rel.target_band ? (
                        <span className="text-[8px] px-1.5 py-[2px] rounded bg-muted/60 font-bold text-foreground/70 tracking-wide">
                          {rel.target_band}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* HO Count */}
                    <td className="px-3 py-2.5 text-right">
                      {rel.ho_count != null ? (
                        <span className="tabular-nums font-semibold text-foreground/80 text-[10px]">
                          {rel.ho_count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* HO SR% */}
                    <td className="px-3 py-2.5 text-right">
                      {rel.ho_success_rate != null ? (
                        <span className={cn(
                          'inline-flex items-center justify-end tabular-nums font-bold text-[10px] px-1.5 py-[1px] rounded',
                          sr.text, sr.bg
                        )}>
                          {rel.ho_success_rate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      {!loading && filtered.length > 0 && (
        <div className="px-4 py-2 border-t border-border/20 bg-muted/5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/50">
              {filtered.length} / {neighbors.length} relations affichées
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[8px] text-muted-foreground/40">
                <ArrowUpRight className="w-2.5 h-2.5" /> {outCount} out
              </span>
              <span className="flex items-center gap-1 text-[8px] text-muted-foreground/40">
                <ArrowDownLeft className="w-2.5 h-2.5" /> {inCount} in
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeighborsSection;
