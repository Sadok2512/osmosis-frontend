import React from 'react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { Settings2, ArrowRight, Clock, User, RefreshCw, ChevronDown, ChevronRight, MapPin, Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CMChange {
  cell_name: string;
  site_name: string;
  changed_at: string | null;
  parameter_name: string;
  old_value: string;
  new_value: string;
  change_type: string;
  mo: string | null;
  change_origin: string;
  netact_user: string;
}

interface Props {
  cellNames: string[];
  siteNames?: string[];
  plaques?: string[];
  dateFrom?: string;
  dateTo?: string;
  days?: number;
}

async function fetchCmChanges(params: { cell_names?: string[]; site_names?: string[]; plaques?: string[]; date_from?: string; date_to?: string; days?: number; limit: number }): Promise<CMChange[]> {
  if (!params.cell_names?.length && !params.site_names?.length && !params.plaques?.length) return [];
  const url = getApiUrl('cm/cell-changes');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

const ACTION_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  create:  { badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30', dot: 'bg-emerald-500', label: 'CREATE' },
  update:  { badge: 'bg-blue-500/15 text-blue-500 border-blue-500/30',           dot: 'bg-blue-500',    label: 'MODIFY' },
  delete:  { badge: 'bg-red-500/15 text-red-500 border-red-500/30',               dot: 'bg-red-500',     label: 'DELETE' },
};

const isRecent = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  return !isNaN(d) && Date.now() - d < 60 * 60 * 1000; // < 1h
};

const CMChangesCard: React.FC<Props> = ({ cellNames, siteNames = [], plaques = [], dateFrom, dateTo, days = 30 }) => {
  const [changes, setChanges] = React.useState<CMChange[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [search, setSearch] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState<'all' | 'create' | 'update' | 'delete'>('all');

  const load = async () => {
    setLoading(true);
    const data = await fetchCmChanges({
      cell_names: cellNames.length > 0 ? cellNames : undefined,
      site_names: siteNames.length > 0 ? siteNames : undefined,
      plaques: plaques.length > 0 ? plaques : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      days: (!dateFrom && !dateTo) ? days : undefined,
      limit: 50,
    });
    setChanges(data);
    setLoading(false);
    setLoaded(true);
  };

  React.useEffect(() => {
    const hasFilter = cellNames.length > 0 || siteNames.length > 0 || plaques.length > 0;
    if (hasFilter && !loaded) load();
  }, [cellNames.join(','), siteNames.join(','), plaques.join(',')]);

  // Filter
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (Array.isArray(changes) ? changes : []).filter(c => {
      if (actionFilter !== 'all' && c.change_type !== actionFilter) return false;
      if (!q) return true;
      return (
        c.parameter_name?.toLowerCase().includes(q) ||
        c.cell_name?.toLowerCase().includes(q) ||
        c.site_name?.toLowerCase().includes(q) ||
        c.mo?.toLowerCase().includes(q)
      );
    });
  }, [changes, search, actionFilter]);

  // Group by site
  const grouped = React.useMemo(() => {
    const acc: Record<string, CMChange[]> = {};
    for (const c of filtered) {
      const key = c.site_name || c.cell_name || '—';
      (acc[key] ||= []).push(c);
    }
    // Sort each group by date desc
    Object.values(acc).forEach(arr => arr.sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || '')));
    return acc;
  }, [filtered]);

  const siteEntries = Object.entries(grouped);
  // Default: first site expanded
  React.useEffect(() => {
    if (siteEntries.length > 0 && Object.keys(collapsed).length === 0) {
      const init: Record<string, boolean> = {};
      siteEntries.forEach(([s], i) => { init[s] = i !== 0; });
      setCollapsed(init);
    }
  }, [siteEntries.length]);

  const toggleSite = (s: string) => setCollapsed(prev => ({ ...prev, [s]: !prev[s] }));
  const expandAll = () => setCollapsed(Object.fromEntries(siteEntries.map(([s]) => [s, false])));
  const collapseAll = () => setCollapsed(Object.fromEntries(siteEntries.map(([s]) => [s, true])));

  const totalCount = changes.length;
  const filteredCount = filtered.length;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">CM Parameter Changes</h3>
            <p className="text-[10px] text-muted-foreground">
              {dateFrom && dateTo ? `${dateFrom.slice(0,10)} → ${dateTo.slice(0,10)}` : `Last ${days} days`}
              {filteredCount !== totalCount && totalCount > 0 && ` • ${filteredCount} filtered`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
              {totalCount} change{totalCount !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Filters bar */}
      {totalCount > 0 && (
        <div className="px-4 py-2.5 border-b border-border/40 bg-background flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search parameter, cell, site..."
              className="w-full h-7 pl-7 pr-2 text-[11px] rounded-md bg-muted/40 border border-border/40 focus:border-primary/40 focus:outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5 border border-border/40">
            {(['all', 'update', 'create', 'delete'] as const).map(a => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors',
                  actionFilter === a
                    ? a === 'all' ? 'bg-foreground text-background'
                      : a === 'update' ? 'bg-blue-500 text-white'
                      : a === 'create' ? 'bg-emerald-500 text-white'
                      : 'bg-red-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {a === 'update' ? 'Modify' : a}
              </button>
            ))}
          </div>
          {siteEntries.length > 1 && (
            <div className="flex items-center gap-1 text-[10px]">
              <button onClick={expandAll} className="px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60">Expand all</button>
              <span className="text-border">|</span>
              <button onClick={collapseAll} className="px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60">Collapse all</button>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      {loading && !loaded ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading CM changes...
        </div>
      ) : totalCount === 0 ? (
        <div className="px-4 py-10 text-center">
          <Settings2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No parameter changes detected</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Range: {dateFrom && dateTo ? `${dateFrom.slice(0,10)} → ${dateTo.slice(0,10)}` : `Last ${days} days`}</p>
        </div>
      ) : filteredCount === 0 ? (
        <div className="px-4 py-8 text-center">
          <Filter className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No changes match current filters</p>
        </div>
      ) : (
        <div className="p-3 space-y-2.5 max-h-[600px] overflow-y-auto">
          {siteEntries.map(([site, siteChanges]) => {
            const isCollapsed = collapsed[site];
            const lastChange = siteChanges[0]?.changed_at;
            return (
              <div key={site} className="rounded-lg border border-border/50 bg-muted/10 overflow-hidden hover:border-border transition-colors">
                {/* Site header */}
                <button
                  onClick={() => toggleSite(site)}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate">{site}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                      {siteChanges.length}
                    </span>
                  </div>
                  {lastChange && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      {lastChange.slice(0, 10)}
                    </span>
                  )}
                </button>

                {/* Site changes */}
                {!isCollapsed && (
                  <div className="border-t border-border/40 bg-background/40">
                    {siteChanges.map((c, i) => {
                      const style = ACTION_STYLES[c.change_type] || ACTION_STYLES.update;
                      const recent = isRecent(c.changed_at);
                      return (
                        <div
                          key={i}
                          className={cn(
                            'group relative px-3 py-2 flex items-start gap-2.5 hover:bg-muted/30 transition-colors',
                            i > 0 && 'border-t border-border/20',
                            recent && 'bg-amber-500/5'
                          )}
                        >
                          {/* Timeline dot */}
                          <div className="flex flex-col items-center pt-0.5 shrink-0">
                            <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                          </div>

                          {/* Action badge */}
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 mt-0.5',
                            style.badge
                          )}>
                            {style.label}
                          </span>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-bold text-foreground font-mono">{c.parameter_name}</span>
                              {c.mo && (
                                <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-mono">{c.mo}</span>
                              )}
                              {c.cell_name && c.cell_name !== c.site_name && (
                                <span className="text-[9px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{c.cell_name}</span>
                              )}
                              {recent && (
                                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">NEW</span>
                              )}
                            </div>
                            {c.change_type === 'update' && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px] max-w-[140px] truncate" title={c.old_value || '∅'}>{c.old_value || '∅'}</span>
                                <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[9px] max-w-[140px] truncate" title={c.new_value || '∅'}>{c.new_value || '∅'}</span>
                              </div>
                            )}
                          </div>

                          {/* Right meta */}
                          <div className="flex flex-col items-end gap-0.5 shrink-0 text-[9px] text-muted-foreground">
                            {c.changed_at && (
                              <span className="flex items-center gap-1 font-mono">
                                <Clock className="w-2.5 h-2.5" />
                                {c.changed_at.slice(11, 16) || c.changed_at.slice(0, 10)}
                              </span>
                            )}
                            {c.netact_user && (
                              <span className="flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                {c.netact_user}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CMChangesCard;
