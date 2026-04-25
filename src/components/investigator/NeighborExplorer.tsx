/**
 * NeighborExplorer — Investigator tab for exploring neighbor relations.
 * Filters: vendor, techno, site, relation type. Split by target band.
 * Graph + CSV export.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Search, Download, Loader2, ArrowRightLeft, Filter, ChevronDown, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { MultiSelectPopover } from '@/components/parameter-hub/MultiSelectPopover';

interface NeighborEntry {
  source_cell: string;
  source_site: string;
  source_band: string;
  source_techno: string;
  relation_type: string;
  neighbor_key: string;
  target_earfcn: number | null;
  target_pci: number | null;
  target_eci: number | null;
  target_band: string;
  vendor: string;
  rat: string;
}

interface ExploreResult {
  total: number;
  neighbors: NeighborEntry[];
  grouped: Record<string, NeighborEntry[]> | null;
  stats: {
    by_band: { band: string; count: number }[];
    by_type: { type: string; count: number }[];
  };
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  INTER_FREQ: '#f59e0b',
  NR_INTER_FREQ: '#3b82f6',
  NR_RELATION: '#10b981',
  INTRA_FREQ: '#8b5cf6',
  INTER_SYSTEM: '#ef4444',
};

// ── Filter dimensions definition ────────────────────────────────
type FilterKey = 'vendor' | 'rat' | 'site' | 'plaque' | 'dor' | 'type';

interface FilterDef {
  key: FilterKey;
  label: string;
  param: string;
  multi: boolean;
  staticOptions?: string[];
  freeText?: boolean; // allow typed entries (Site)
}

const FILTER_DEFS: FilterDef[] = [
  { key: 'vendor', label: 'Vendor', param: 'vendor', multi: true, staticOptions: ['Nokia', 'Ericsson'] },
  { key: 'rat', label: 'Technology', param: 'rat', multi: true, staticOptions: ['LTE', 'NR'] },
  { key: 'site', label: 'Site', param: 'site_name', multi: true, freeText: true },
  { key: 'plaque', label: 'Plaque', param: 'plaque', multi: true },
  { key: 'dor', label: 'DOR', param: 'dor', multi: true },
  { key: 'type', label: 'Type', param: 'relation_type', multi: true, staticOptions: ['INTER_FREQ', 'NR_INTER_FREQ', 'NR_RELATION', 'INTRA_FREQ'] },
];

const FILTER_LABEL_MAP: Record<FilterKey, string> = FILTER_DEFS.reduce((acc, f) => {
  acc[f.key] = f.label; return acc;
}, {} as Record<FilterKey, string>);

const NeighborExplorer: React.FC = () => {
  const state = useInvestigatorStore(s => s.state);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    vendor: ['Nokia'],
    rat: [],
    site: [],
    plaque: [],
    dor: [],
    type: [],
  });
  const [activeKeys, setActiveKeys] = useState<FilterKey[]>(['vendor', 'rat', 'site', 'plaque', 'dor', 'type']);
  const [splitBy, setSplitBy] = useState<'all' | 'target_band'>('all');
  const [data, setData] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [plaqueOpts, setPlaqueOpts] = useState<string[]>([]);
  const [dorOpts, setDorOpts] = useState<string[]>([]);
  const [siteSearch, setSiteSearch] = useState(''); // freeText input draft

  // Load Plaque / DOR values from backend topo catalog
  useEffect(() => {
    let aborted = false;
    fetch(getApiUrl('topo/filters'), { headers: getApiHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (aborted || !d) return;
        const items = Array.isArray(d) ? d : (d.filters || d.data || []);
        const map: Record<string, string[]> = {};
        for (const f of items) {
          if (f && f.id) map[f.id] = Array.isArray(f.values) ? f.values : [];
        }
        setPlaqueOpts((map.plaque ?? map.cluster ?? []).filter(Boolean).sort());
        setDorOpts((map.dor ?? []).filter(Boolean).sort());
      })
      .catch(err => console.warn('[NeighborExplorer] topo filters load failed', err));
    return () => { aborted = true; };
  }, []);

  const optionsFor = useCallback((key: FilterKey): string[] => {
    const def = FILTER_DEFS.find(f => f.key === key);
    if (def?.staticOptions) return def.staticOptions;
    if (key === 'plaque') return plaqueOpts;
    if (key === 'dor') return dorOpts;
    return [];
  }, [plaqueOpts, dorOpts]);

  const setFilterValues = (key: FilterKey, vals: string[]) => {
    setFilters(prev => ({ ...prev, [key]: vals }));
  };

  const addFilter = (key: FilterKey) => {
    setActiveKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  };

  const removeFilter = (key: FilterKey) => {
    setActiveKeys(prev => prev.filter(k => k !== key));
    setFilters(prev => ({ ...prev, [key]: [] }));
  };

  const clearAllFilters = () => {
    setFilters({ vendor: [], rat: [], site: [], plaque: [], dor: [], type: [] });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      for (const def of FILTER_DEFS) {
        const vals = filters[def.key];
        if (vals && vals.length) params.set(def.param, vals.join(','));
      }
      params.set('split_by', splitBy);

      const res = await fetch(getApiUrl(`neighbors/list/explore?${params}`), { headers: getApiHeaders() });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.warn('[NeighborExplorer] fetch error:', e);
    }
    setLoading(false);
  }, [filters, splitBy]);

  // Chart options
  const chartOption = useMemo(() => {
    if (!data?.stats) return null;

    if (splitBy === 'target_band' && data.stats.by_band.length > 0) {
      return {
        title: { text: 'Neighbors by Target Band', textStyle: { fontSize: 12, fontWeight: 700 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.stats.by_band.map(b => b.band), axisLabel: { fontSize: 9, rotate: 30 } },
        yAxis: { type: 'value', name: 'Count', axisLabel: { fontSize: 9 } },
        series: [{ type: 'bar', data: data.stats.by_band.map(b => b.count), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } }],
        grid: { top: 40, right: 16, bottom: 60, left: 50 },
      };
    }

    if (data.stats.by_type.length > 0) {
      return {
        title: { text: 'Neighbors by Relation Type', textStyle: { fontSize: 12, fontWeight: 700 } },
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: data.stats.by_type.map(t => ({
            name: t.type,
            value: t.count,
            itemStyle: { color: TYPE_COLORS[t.type] || '#6b7280' },
          })),
          label: { fontSize: 10 },
        }],
      };
    }
    return null;
  }, [data, splitBy]);

  // Filtered neighbors for table
  const filtered = useMemo(() => {
    const list = data?.neighbors || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(n =>
      n.source_cell.toLowerCase().includes(q) ||
      n.source_site.toLowerCase().includes(q) ||
      n.target_band.toLowerCase().includes(q) ||
      n.relation_type.toLowerCase().includes(q)
    );
  }, [data, search]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = ['Source Cell', 'Source Site', 'Source Band', 'Relation Type', 'Target Band', 'Target EARFCN', 'Target PCI', 'Target ECI', 'Vendor', 'RAT'];
    const rows = filtered.map(n => [n.source_cell, n.source_site, n.source_band, n.relation_type, n.target_band, n.target_earfcn ?? '', n.target_pci ?? '', n.target_eci ?? '', n.vendor, n.rat]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const tag = (filters.vendor.join('-') || 'all') + '_' + (filters.site[0] || 'all');
    a.download = `neighbors_${tag}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 p-4">
      {/* Filters — chip-based, Investigator-style */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <div className="flex items-center gap-1 mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Filter size={11} /> Filtres
        </div>

        {activeKeys.map(key => {
          const def = FILTER_DEFS.find(f => f.key === key)!;
          const vals = filters[key];
          const opts = optionsFor(key);
          const count = vals.length;
          const display = count === 0 ? 'Tous' : count === 1 ? vals[0] : `${count} sélectionnés`;

          // Free-text site filter: combobox with typed entries
          if (def.freeText) {
            return (
              <FilterChip
                key={key}
                label={def.label}
                display={display}
                hasValue={count > 0}
                onRemove={() => removeFilter(key)}
                popoverContent={
                  <div className="p-3 w-[280px] space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{def.label}</div>
                    <div className="flex gap-1">
                      <input
                        value={siteSearch}
                        onChange={e => setSiteSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && siteSearch.trim()) {
                            const v = siteSearch.trim();
                            if (!vals.includes(v)) setFilterValues(key, [...vals, v]);
                            setSiteSearch('');
                          }
                        }}
                        placeholder="Tape un site puis Entrée…"
                        className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = siteSearch.trim();
                          if (v && !vals.includes(v)) setFilterValues(key, [...vals, v]);
                          setSiteSearch('');
                        }}
                        className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                    {vals.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                        {vals.map(v => (
                          <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                            {v}
                            <button onClick={() => setFilterValues(key, vals.filter(x => x !== v))}>
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => setFilterValues(key, [])}
                          className="text-[9px] text-muted-foreground hover:text-destructive ml-auto"
                        >
                          Effacer
                        </button>
                      </div>
                    )}
                  </div>
                }
              />
            );
          }

          // Standard multi-select chip
          return (
            <MultiSelectPopover
              key={key}
              title={def.label}
              options={opts}
              selected={vals}
              onConfirm={(next) => setFilterValues(key, next)}
              emptyHint={`Aucune valeur pour ${def.label}`}
              trigger={
                <button
                  type="button"
                  className={`group inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold transition-colors ${
                    count > 0
                      ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                      : 'bg-muted/30 border-border text-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="opacity-70">{def.label}:</span>
                  <span className="truncate max-w-[120px]">{display}</span>
                  <ChevronDown size={10} className="opacity-50" />
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); removeFilter(key); }}
                    className="ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                  >
                    <X size={10} />
                  </span>
                </button>
              }
            />
          );
        })}

        {/* + Ajouter filtre */}
        <AddFilterDropdown
          existingKeys={activeKeys}
          onAdd={addFilter}
        />

        {/* Effacer filtres */}
        {activeKeys.some(k => filters[k].length > 0) && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-destructive transition-colors ml-1"
          >
            <X className="w-2.5 h-2.5" /> Effacer filtres
          </button>
        )}

        {/* Split By + Search button on the right */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold uppercase text-muted-foreground">Split</span>
            <select
              value={splitBy}
              onChange={e => setSplitBy(e.target.value as any)}
              className="px-2 py-1 rounded-lg border border-border bg-background text-[10px] font-semibold"
            >
              <option value="all">All</option>
              <option value="target_band">Target Band</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Rechercher
          </button>
        </div>
      </div>

// ── FilterChip: chip with custom popover content (used by free-text Site) ──
const FilterChip: React.FC<{
  label: string;
  display: string;
  hasValue: boolean;
  onRemove: () => void;
  popoverContent: React.ReactNode;
}> = ({ label, display, hasValue, onRemove, popoverContent }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold transition-colors ${
            hasValue
              ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
              : 'bg-muted/30 border-border text-foreground hover:bg-muted/50'
          }`}
        >
          <span className="opacity-70">{label}:</span>
          <span className="truncate max-w-[120px]">{display}</span>
          <ChevronDown size={10} className="opacity-50" />
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive cursor-pointer"
          >
            <X size={10} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl border border-border/60 shadow-xl bg-card" align="start" sideOffset={6}>
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
};

// ── AddFilterDropdown: pick a hidden dimension to add ──
const AddFilterDropdown: React.FC<{
  existingKeys: FilterKey[];
  onAdd: (key: FilterKey) => void;
}> = ({ existingKeys, onAdd }) => {
  const [open, setOpen] = useState(false);
  const available = FILTER_DEFS.filter(f => !existingKeys.includes(f.key));
  if (available.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors">
          <Plus className="w-3 h-3" /> Ajouter filtre
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1 rounded-xl border border-border/60 shadow-xl bg-card" align="start" sideOffset={6}>
        <div className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Dimensions
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {available.map(def => (
            <button
              key={def.key}
              onClick={() => { onAdd(def.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold text-foreground hover:bg-muted/50 text-left"
            >
              <Filter size={11} className="opacity-50" />
              {def.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

      {/* Stats */}
      {data && (
        <div className="flex items-center gap-4 text-xs">
          <span className="font-bold text-foreground">{data.total} relations</span>
          {data.stats.by_type.map(t => (
            <span key={t.type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] || '#6b7280' }} />
              <span className="text-muted-foreground">{t.type}: <strong className="text-foreground">{t.count}</strong></span>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartOption && (
        <div className="rounded-xl border border-border bg-card p-2">
          <ReactECharts option={chartOption} style={{ height: 250 }} opts={{ renderer: 'canvas' }} />
        </div>
      )}

      {/* Table */}
      {data && data.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter..."
                className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-48"
              />
              <span className="text-[10px] text-muted-foreground">{filtered.length} / {data.total}</span>
            </div>
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground">
              <Download size={12} /> CSV
            </button>
          </div>
          <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Cell</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Site</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Source Band</th>
                  <th className="px-2 py-1.5 text-center font-bold text-muted-foreground">Type</th>
                  <th className="px-2 py-1.5 text-left font-bold text-muted-foreground">Target Band</th>
                  <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">EARFCN</th>
                  <th className="px-2 py-1.5 text-right font-bold text-muted-foreground">PCI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.slice(0, 200).map((n, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-2 py-1 font-mono font-semibold text-foreground truncate max-w-[160px]">{n.source_cell}</td>
                    <td className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{n.source_site}</td>
                    <td className="px-2 py-1 font-semibold">{n.source_band}</td>
                    <td className="px-2 py-1 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white" style={{ backgroundColor: TYPE_COLORS[n.relation_type] || '#6b7280' }}>
                        {n.relation_type}
                      </span>
                    </td>
                    <td className="px-2 py-1 font-semibold text-primary">{n.target_band || '—'}</td>
                    <td className="px-2 py-1 text-right font-mono">{n.target_earfcn ?? '—'}</td>
                    <td className="px-2 py-1 text-right font-mono">{n.target_pci ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <ArrowRightLeft size={32} className="mx-auto mb-3 opacity-30" />
          <p>Select filters and click <strong>Rechercher</strong> to explore neighbor relations</p>
        </div>
      )}
    </div>
  );
};

export default NeighborExplorer;
