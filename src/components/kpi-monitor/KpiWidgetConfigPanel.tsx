// ── Per-Widget Configuration Panel ──────────────────────────────────
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  X, Calendar, Filter, GitBranch, BarChart3, Plus, Trash2, Check,
  ChevronDown, Search, TrendingUp, AreaChart, BarChart, Layers2,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { KpiWidgetConfig } from './KpiWidgetTypes';
import type { KpiCatalogEntry, SplitDimension, Granularity } from './types';
import {
  FILTER_DIMENSIONS,
  resolveAvailableValues,
} from '@/config/filterDimensions';
import { fetchDimensionValues } from './api/kpiMonitorApi';

const PERIOD_PRESETS = [
  { value: '24h', label: '24h', days: 1 },
  { value: '7d', label: '7 jours', days: 7 },
  { value: '14d', label: '14 jours', days: 14 },
  { value: '30d', label: '30 jours', days: 30 },
  { value: '90d', label: '90 jours', days: 90 },
] as const;

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '15m', label: '15min' },
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
] as const;

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const GRAPH_TYPES = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_area', label: 'Stacked', icon: Layers2 },
] as const;

interface Props {
  config: KpiWidgetConfig;
  catalog: KpiCatalogEntry[];
  catalogMap: Record<string, KpiCatalogEntry>;
  onUpdate: (updates: Partial<KpiWidgetConfig>) => void;
  onClose: () => void;
}

const KpiWidgetConfigPanel: React.FC<Props> = ({ config, catalog, catalogMap, onUpdate, onClose }) => {
  const [kpiSearch, setKpiSearch] = useState('');

  const filteredCatalog = useMemo(() => {
    if (!kpiSearch) return catalog;
    const q = kpiSearch.toLowerCase();
    return catalog.filter(k =>
      k.display_name.toLowerCase().includes(q) || k.kpi_key.toLowerCase().includes(q) || k.category?.toLowerCase().includes(q)
    );
  }, [catalog, kpiSearch]);

  const selectedKpiKeys = config.kpis.map(k => k.kpi_key);

  const toggleKpi = (key: string) => {
    if (selectedKpiKeys.includes(key)) {
      onUpdate({ kpis: config.kpis.filter(k => k.kpi_key !== key) });
    } else {
      const cat = catalogMap[key];
      onUpdate({
        kpis: [...config.kpis, {
          kpi_key: key,
          agg: (cat?.default_agg as any) || 'avg',
          axis: 'left',
          color: undefined,
        }],
      });
    }
  };

  const applyPreset = (days: number, preset: string) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    onUpdate({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
      periodPreset: preset as any,
    });
  };

  const addFilter = (dimension: string) => {
    const newFilter = {
      id: `f_${Date.now()}`,
      dimension,
      op: 'IN' as const,
      values: [],
    };
    onUpdate({ filters: [...config.filters, newFilter] });
  };

  const removeFilter = (id: string) => {
    onUpdate({ filters: config.filters.filter(f => f.id !== id) });
  };

  // Group catalog by category
  const groupedCatalog = useMemo(() => {
    const groups: Record<string, KpiCatalogEntry[]> = {};
    for (const entry of filteredCatalog) {
      const cat = entry.category || 'Autres';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [filteredCatalog]);

  const panel = (
    <div className="fixed inset-y-0 right-0 z-50 w-[380px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">{config.title}</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Date Range ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Période</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {PERIOD_PRESETS.map(p => (
              <button key={p.value}
                onClick={() => applyPreset(p.days, p.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all",
                  config.periodPreset === p.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >{p.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={config.dateFrom}
              onChange={e => onUpdate({ dateFrom: e.target.value, periodPreset: 'custom' })}
              className="flex-1 bg-background border border-border/60 rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
            <span className="text-[10px] text-muted-foreground">→</span>
            <input type="date" value={config.dateTo}
              onChange={e => onUpdate({ dateTo: e.target.value, periodPreset: 'custom' })}
              className="flex-1 bg-background border border-border/60 rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* ── Granularity ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Granularité</span>
          <div className="flex gap-1">
            {GRANULARITIES.map(g => (
              <button key={g.value}
                onClick={() => onUpdate({ granularity: g.value as any })}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all flex-1",
                  config.granularity === g.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >{g.label}</button>
            ))}
          </div>
        </div>

        {/* ── KPI Selection ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">KPIs</span>
            <span className="text-[10px] text-primary font-semibold">{config.kpis.length} sélectionné{config.kpis.length > 1 ? 's' : ''}</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input value={kpiSearch} onChange={e => setKpiSearch(e.target.value)} placeholder="Rechercher KPI..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border/60 bg-background text-[11px] outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-border/40 bg-muted/10 p-1">
            {Object.entries(groupedCatalog).map(([category, entries]) => (
              <div key={category}>
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">{category}</div>
                {entries.map(entry => {
                  const selected = selectedKpiKeys.includes(entry.kpi_key);
                  return (
                    <button key={entry.kpi_key} onClick={() => toggleKpi(entry.kpi_key)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-left transition-all",
                        selected ? "bg-primary/8 text-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground"
                      )}
                    >
                      <div className={cn(
                        "w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all",
                        selected ? "bg-primary border-primary" : "border-border/80 bg-background"
                      )}>
                        {selected && <Check className="w-2 h-2 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{entry.display_name}</span>
                      {entry.unit && <span className="text-[9px] text-muted-foreground/50 ml-auto shrink-0">{entry.unit}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredCatalog.length === 0 && (
              <p className="text-[10px] text-muted-foreground/50 text-center py-4 italic">Aucun KPI trouvé</p>
            )}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filtres</span>
            </div>
            <Select onValueChange={v => addFilter(v)}>
              <SelectTrigger className="h-6 w-auto text-[10px] border-dashed gap-1 px-2">
                <Plus className="w-3 h-3" /> Ajouter
              </SelectTrigger>
              <SelectContent>
                {FILTER_DIMENSIONS.map(d => (
                  <SelectItem key={d.key} value={d.key} className="text-xs">{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {config.filters.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50 italic">Aucun filtre actif</p>
          ) : (
            <div className="space-y-1.5">
              {config.filters.map(f => (
                <FilterRow key={f.id} filter={f} allFilters={config.filters}
                  onUpdate={(updates) => onUpdate({
                    filters: config.filters.map(ff => ff.id === f.id ? { ...ff, ...updates } : ff),
                  })}
                  onRemove={() => removeFilter(f.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Split By (Dimensions) ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dimensions</span>
          </div>
          <Select value={config.splitBy || 'none'} onValueChange={v => onUpdate({ splitBy: v === 'none' ? null : v as SplitDimension })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Pas de split" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Pas de split</SelectItem>
              {SPLIT_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.splitBy && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Top N</span>
              <Select value={String(config.topN)} onValueChange={v => onUpdate({ topN: Number(v) })}>
                <SelectTrigger className="h-6 w-16 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 15, 20].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Graph Type ── */}
        <div className="px-4 py-3 border-b border-border/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Type de graphique</span>
          <div className="flex gap-1">
            {GRAPH_TYPES.map(g => (
              <button key={g.value}
                onClick={() => onUpdate({ graphType: g.value })}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all flex-1 justify-center",
                  config.graphType === g.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <g.icon className="w-3 h-3" /> {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Display Options ── */}
        <div className="px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Options</span>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-foreground">Légende</span>
              <Switch checked={config.showLegend} onCheckedChange={v => onUpdate({ showLegend: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-foreground">Courbes lisses</span>
              <Switch checked={config.smooth} onCheckedChange={v => onUpdate({ smooth: v })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      {panel}
    </>,
    document.body
  );
};

/* ── Filter Row sub-component ── */
const FilterRow: React.FC<{
  filter: { id: string; dimension: string; op: string; values: string[] };
  allFilters: any[];
  onUpdate: (updates: any) => void;
  onRemove: () => void;
}> = ({ filter, allFilters, onUpdate, onRemove }) => {
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const staticValues = useMemo(() => resolveAvailableValues(filter.dimension, allFilters), [filter.dimension, allFilters]);
  const [backendValues, setBackendValues] = React.useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    const dimMap: Record<string, string> = {
      dor: 'DOR', constructeur: 'Vendor', plaque: 'Plaque', site: 'Site', cell: 'Cell',
      zone_arcep: 'ARCEP', techno: 'TECHNO', vendor: 'Vendor', bande: 'BAND',
    };
    const dimKey = dimMap[filter.dimension] || filter.dimension;
    fetchDimensionValues(dimKey).then(d => { if (d.values) setBackendValues(d.values); }).catch(() => {});
  }, [filter.dimension]);

  const values = backendValues.length > 0 ? backendValues : staticValues;
  const filtered = values.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  const toggleValue = (val: string) => {
    const next = filter.values.includes(val) ? filter.values.filter((v: string) => v !== val) : [...filter.values, val];
    onUpdate({ values: next });
  };

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <ChevronDown className={cn("w-3 h-3 transition-transform", !expanded && "-rotate-90")} />
          {dim?.label || filter.dimension}
          {filter.values.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">{filter.values.length}</span>
          )}
        </button>
        <button onClick={onRemove} className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="w-full px-2 py-1 rounded border border-border/60 bg-background text-[10px] outline-none"
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.map(val => {
              const sel = filter.values.includes(val);
              return (
                <button key={val} onClick={() => toggleValue(val)}
                  className={cn("w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] text-left",
                    sel ? "bg-primary/8 font-medium" : "hover:bg-muted/60 text-muted-foreground"
                  )}
                >
                  <div className={cn("w-3 h-3 rounded border flex items-center justify-center",
                    sel ? "bg-primary border-primary" : "border-border bg-background"
                  )}>
                    {sel && <Check className="w-2 h-2 text-primary-foreground" />}
                  </div>
                  <span className="truncate">{val}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default KpiWidgetConfigPanel;
