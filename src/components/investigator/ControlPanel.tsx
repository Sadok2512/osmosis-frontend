import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { InvestigationState, Dimension, SplitOption, Granularity, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType } from './types';
import { KPIS as FALLBACK_KPIS, KPI_MAP } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { Filter, Calendar as CalendarIcon, X, Plus, ChevronDown, Check, TrendingUp, AreaChart, BarChart, CircleDot, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { fetchKpiCatalogFromDB } from '@/components/kpi-monitor/kpiCatalog';

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

interface Props {
  state: InvestigationState;
  setState: React.Dispatch<React.SetStateAction<InvestigationState>>;
  onApply: () => void;
  externalSelectorSlot?: string | null;
  onExternalSelectorClose?: () => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
}

const SPLITS: SplitOption[] = ['None', 'Vendor', 'Technology', 'Band', 'DOR', 'DR'];
const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
];
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'Hourly', label: 'Horaire' },
  { value: 'Daily', label: 'Jour' },
  { value: 'Weekly', label: 'Semaine' },
];
const FILTER_DIMENSIONS = ['Site', 'Vendor', 'Technology', 'Band', 'DOR', 'DR', 'Plaque', 'Zone ARCEP'];

// Filter values fetched from backend
const useBackendFilterValues = (dimension: string): string[] => {
  const [values, setValues] = React.useState<string[]>([]);
  React.useEffect(() => {
    const dimMap: Record<string, string> = { Site: 'Site', Vendor: 'Vendor', Technology: 'TECHNO', Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'Plaque', 'Zone ARCEP': 'ARCEP' };
    const key = dimMap[dimension] || dimension;
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      fetch(getApiUrl(`monitor/filters/values?dimension=${key}`), { headers: getApiHeaders() })
        .then(r => r.json())
        .then(d => { if (d.values) setValues(d.values); })
        .catch(() => {});
    });
  }, [dimension]);
  return values;
};

/* ── KPI Multi-Select Dropdown (loads from backend) ── */
const KpiDropdown: React.FC<{ selected: string[]; onChange: (ids: string[]) => void }> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchKpiDefinitions().then(setKpis).catch(() => setKpis(FALLBACK_KPIS));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(k => k !== id) : [...selected, id]);
  };

  const filtered = search
    ? kpis.filter(k => k.label.toLowerCase().includes(search.toLowerCase()) || k.id.toLowerCase().includes(search.toLowerCase()))
    : kpis;
  const categories = [...new Set(filtered.map(k => k.category))].sort();

  const displayText = selected.length === 0
    ? 'Select KPIs...'
    : `${selected.length} KPI(s) sélectionnés`;

  return (
    <div ref={ref} className="relative flex-1 min-w-[280px]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:border-primary/40 transition-colors"
      >
        <span className="truncate text-left">{displayText}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl max-h-[400px] overflow-hidden p-2 flex flex-col">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un KPI..."
            className="w-full px-2 py-1.5 mb-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30"
            autoFocus
          />
          <div className="overflow-y-auto flex-1">
            {kpis.length === 0 && <div className="text-[10px] text-muted-foreground p-2 animate-pulse">Chargement KPIs...</div>}
            {categories.map(cat => {
              const catKpis = filtered.filter(k => k.category === cat);
              if (catKpis.length === 0) return null;
              return (
                <div key={cat} className="mb-2 last:mb-0">
                  <div className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider px-2 py-1">{cat} ({catKpis.length})</div>
                  {catKpis.slice(0, 50).map(kpi => {
                    const isSelected = selected.includes(kpi.id);
                    return (
                      <button key={kpi.id} onClick={() => toggle(kpi.id)}
                        className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                          isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50')}>
                        <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                          isSelected ? 'bg-primary border-primary' : 'border-border')}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{kpi.label}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{kpi.unit}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Add Filter Dropdown ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string, val: string) => void;
}> = ({ existingKeys, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSelectedDim(null); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setSelectedDim(null); }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Filter className="w-3 h-3" /> Add Filter
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl min-w-[180px] p-1.5">
          {!selectedDim ? (
            FILTER_DIMENSIONS.map(dim => (
              <button
                key={dim}
                onClick={() => setSelectedDim(dim)}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {dim}
              </button>
            ))
          ) : (
            <FilterValuesList dim={selectedDim} onSelect={(val) => { onAdd(selectedDim, val); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
          )}
        </div>
      )}
    </div>
  );
};

/* ── Filter Values (from backend) ── */
const FilterValuesList: React.FC<{ dim: string; onSelect: (val: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const values = useBackendFilterValues(dim);
  return (
    <>
      <button onClick={onBack} className="w-full text-left px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground">
        ← {dim}
      </button>
      <div className="border-t border-border/40 mt-1 pt-1 max-h-[200px] overflow-y-auto">
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
        ) : (
          values.map(val => (
            <button key={val} onClick={() => onSelect(val)}
              className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
              {val}
            </button>
          ))
        )}
      </div>
    </>
  );
};

/* ── Main Control Panel ── */
const ControlPanel: React.FC<Props> = ({ state, setState, onApply, externalSelectorSlot, onExternalSelectorClose, activeSlotId, onSlotClick }) => {
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>([]);
  const [kpiDefs, setKpiDefs] = useState<KpiDefinition[]>(FALLBACK_KPIS);
  const [selectorOpen, setSelectorOpen] = useState<string | null>(null);

  // Open selector when triggered externally from graph widget
  useEffect(() => {
    if (externalSelectorSlot) setSelectorOpen(externalSelectorSlot);
  }, [externalSelectorSlot]);

  const handleSelectorClose = () => {
    setSelectorOpen(null);
    onExternalSelectorClose?.();
  };

  useEffect(() => {
    fetchKpiCatalogFromDB().then(c => { if (c.length > 0) setCatalog(c); }).catch(() => {});
    fetchKpiDefinitions().then(k => { if (k.length > 0) setKpiDefs(k); }).catch(() => {});
  }, []);

  const applyPeriod = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setState(prev => ({
      ...prev,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    }));
  };

  const startDate = state.startDate ? new Date(state.startDate) : undefined;
  const endDate = state.endDate ? new Date(state.endDate) : undefined;

  const addFilter = (dim: string, val: string) => {
    setState(prev => {
      const existing = prev.filters[dim] || [];
      if (existing.includes(val)) return prev;
      return { ...prev, filters: { ...prev.filters, [dim]: [...existing, val] } };
    });
  };

  const removeFilter = (dim: string, val: string) => {
    setState(prev => {
      const existing = (prev.filters[dim] || []).filter(v => v !== val);
      const newFilters = { ...prev.filters };
      if (existing.length === 0) delete newFilters[dim];
      else newFilters[dim] = existing;
      return { ...prev, filters: newFilters };
    });
  };

  const filterChips = Object.entries(state.filters).flatMap(([dim, vals]) =>
    vals.map(val => ({ dim, val }))
  );

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm">
      {/* Row 1: Main controls */}
      <div className="max-w-[1600px] mx-auto px-6 py-2.5">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Date Start */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Début</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[130px] justify-start text-left text-xs font-medium h-[32px]',
                    !startDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => d && setState(prev => ({ ...prev, startDate: format(d, 'yyyy-MM-dd') }))}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date End */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Fin</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[130px] justify-start text-left text-xs font-medium h-[32px]',
                    !endDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) => d && setState(prev => ({ ...prev, endDate: format(d, 'yyyy-MM-dd') }))}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-border/60 shrink-0" />

          {/* Period shortcuts */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Période</span>
            <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPeriod(p.days)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-card transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-border/60 shrink-0" />

          {/* Granularity */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Granularité</span>
            <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
              {GRANULARITIES.map(g => (
                <button
                  key={g.value}
                  onClick={() => setState(prev => ({ ...prev, granularity: g.value }))}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                    state.granularity === g.value
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-border/60 shrink-0" />

          {/* Split By */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Split By</span>
            <select
              value={state.splitBy}
              onChange={e => setState(prev => ({ ...prev, splitBy: e.target.value as SplitOption }))}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium w-[100px] h-[32px]"
            >
              {SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Apply */}
          <button
            onClick={onApply}
            className="shrink-0 ml-auto px-6 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-sm h-[32px]"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Row 2: KPI slots with config popovers */}
      <div className="max-w-[1600px] mx-auto px-6 pb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">KPIs:</span>
          {state.graphSlots.filter(slot => slot.kpiId && slot.id === activeSlotId).map((slot) => {
            const catalogEntry = catalog.find(k => k.kpi_key === slot.kpiId);
            const defEntry = kpiDefs.find(k => k.id === slot.kpiId);
            const kpiName = catalogEntry?.display_name || defEntry?.label || slot.kpiId || 'Aucun KPI';
            const name = kpiName;
            const color = catalogEntry?.color || defEntry?.color || '#6366f1';
            const cfg = slot.config || DEFAULT_GRAPH_CONFIG;
            const setSlotConfig = (updates: Partial<GraphConfig>) => {
              setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s =>
                  s.id === slot.id ? { ...s, config: { ...cfg, ...updates } } : s
                ),
              }));
            };
            return (
              <Popover key={slot.id}>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => {
                      onSlotClick?.(slot.id);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all duration-300',
                      activeSlotId === slot.id
                        ? 'bg-primary/20 text-primary border-primary/40 ring-2 ring-primary/20 shadow-sm'
                        : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[140px]">{name}</span>
                    <Settings2 className="w-3 h-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-3 space-y-3" align="start">
                  {/* KPI Name & Change */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs font-bold text-foreground truncate max-w-[130px]">{name}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setSelectorOpen(slot.id)}
                    >
                      Change KPI
                    </Button>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Chart Type */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Chart Type</span>
                    <div className="flex gap-1">
                      {CHART_TYPES.map(ct => (
                        <button
                          key={ct.value}
                          onClick={() => setSlotConfig({ chartType: ct.value })}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                            cfg.chartType === ct.value
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                          )}
                        >
                          <ct.icon className="w-3 h-3" />
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Smooth */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Smooth Curve</span>
                    <Switch checked={cfg.smooth} onCheckedChange={v => setSlotConfig({ smooth: v })} className="scale-75" />
                  </div>

                  {/* Line Width */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground">Line Width</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{cfg.lineWidth}px</span>
                    </div>
                    <Slider value={[cfg.lineWidth]} onValueChange={v => setSlotConfig({ lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="w-full" />
                  </div>

                  {/* Toggles */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Show Markers</span>
                    <Switch checked={cfg.showSymbols} onCheckedChange={v => setSlotConfig({ showSymbols: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Area Fill</span>
                    <Switch checked={cfg.showArea} onCheckedChange={v => setSlotConfig({ showArea: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Thresholds</span>
                    <Switch checked={cfg.showThresholds} onCheckedChange={v => setSlotConfig({ showThresholds: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
                    <Switch checked={cfg.showGrid} onCheckedChange={v => setSlotConfig({ showGrid: v })} className="scale-75" />
                  </div>

                  {/* Split By */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split By</span>
                    <select
                      value={slot.splitBy || 'None'}
                      onChange={e => setState(prev => ({
                        ...prev,
                        graphSlots: prev.graphSlots.map(s =>
                          s.id === slot.id ? { ...s, splitBy: e.target.value as SplitOption } : s
                        ),
                      }))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-[10px] font-medium"
                    >
                      {SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Clear KPI (keep slot) */}
                  <button
                    onClick={() => setState(prev => ({
                      ...prev,
                      graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, kpiId: '' } : s),
                    }))}
                    className="w-full text-[10px] font-semibold text-orange-600 hover:bg-orange-500/10 py-1.5 rounded-md transition-colors"
                  >
                    Retirer le KPI
                  </button>
                  {/* Remove slot entirely */}
                  {true && (
                    <button
                      onClick={() => setState(prev => ({ ...prev, graphSlots: prev.graphSlots.filter(s => s.id !== slot.id) }))}
                      className="w-full text-[10px] font-semibold text-destructive hover:bg-destructive/10 py-1.5 rounded-md transition-colors"
                    >
                      Supprimer le graphique
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            );
          })}
          {state.graphSlots.length < 4 && (
            <button
              onClick={() => {
                const activeSlot = activeSlotId ? state.graphSlots.find(s => s.id === activeSlotId) : null;
                if (activeSlot && !activeSlot.kpiId) {
                  setSelectorOpen(activeSlot.id);
                } else {
                  setSelectorOpen('new');
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add KPI
            </button>
          )}
        </div>
      </div>

      {/* Row 3: Filter chips */}
      <div className="max-w-[1600px] mx-auto px-6 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Filter className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Filters:</span>
          </div>

          {filterChips.map(({ dim, val }) => (
            <span
              key={`${dim}-${val}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
            >
              <span className="text-muted-foreground">{dim}:</span>
              <span className="font-bold">{val}</span>
              <button
                onClick={() => removeFilter(dim, val)}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

          <AddFilterDropdown
            existingKeys={Object.keys(state.filters)}
            onAdd={addFilter}
          />
        </div>
      </div>

      {/* KPI Selector Modal - rendered via portal to escape stacking context */}
      {createPortal(
        <KpiSelectorModal
          open={!!selectorOpen}
          onClose={handleSelectorClose}
          catalog={catalog}
          selectedKeys={selectorOpen && selectorOpen !== 'new'
            ? (() => {
                const currentKpiId = state.graphSlots.find(s => s.id === selectorOpen)?.kpiId;
                return currentKpiId ? [currentKpiId] : [];
              })()
            : []}
          onConfirm={(keys) => {
            const validKeys = keys.filter(Boolean);
            if (validKeys.length === 0) return;
            if (selectorOpen === 'new') {
              const newId = `slot-${Date.now()}`;
              setState(prev => {
                const nextIndex = prev.graphSlots.length + 1;
                const newSlot: GraphSlot = {
                  id: newId,
                  kpiId: validKeys[0],
                  name: `Graph ${nextIndex}`,
                  filters: {},
                  startDate: '',
                  endDate: '',
                  granularity: 'Hourly',
                  splitBy: 'None',
                };
                return { ...prev, graphSlots: [...prev.graphSlots, newSlot] };
              });
              onSlotClick?.(newId);
            } else if (selectorOpen) {
              setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === selectorOpen ? { ...s, kpiId: validKeys[0] } : s),
              }));
              onSlotClick?.(selectorOpen);
            }
            handleSelectorClose();
          }}
        />,
        document.body
      )}
    </div>
  );
};

export default ControlPanel;
