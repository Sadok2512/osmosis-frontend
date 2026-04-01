import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { InvestigationState, Dimension, SplitOption, Granularity, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, KpiLevel } from './types';
import { KPIS as FALLBACK_KPIS, KPI_MAP } from './mockData';
import { fetchKpiDefinitions, fetchKpisWithData } from './investigatorApi';
import type { KpiDefinition } from './types';
import { Filter, Calendar as CalendarIcon, X, Plus, ChevronDown, Check, TrendingUp, AreaChart, BarChart, CircleDot, Settings2, Flag, Layers, Fingerprint, GitBranch, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { fetchKpiCatalog, fetchFilterCatalog, type MonitorFilterDef } from '@/components/kpi-monitor/api/kpiMonitorApi';

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_bar', label: 'Stacked', icon: Layers },
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
  isApplying?: boolean;
  showAIPanel?: boolean;
  onToggleAIPanel?: () => void;
}

const SPLITS_FALLBACK: SplitOption[] = ['None', 'Site', 'Cell', 'Plaque', 'DOR', 'Vendor', 'Technology', 'Band', 'Zone ARCEP'];
const FILTER_DIMS_FALLBACK = ['Cell', 'Site', 'Vendor', 'Technology', 'Band', 'DOR', 'DR', 'Plaque', 'Zone ARCEP'];
const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
];
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: '15min', label: '15 min' },
  { value: 'Hourly', label: 'Horaire' },
  { value: 'Daily', label: 'Jour' },
  { value: 'Weekly', label: 'Semaine' },
];
// FILTER_DIMENSIONS now loaded from backend (see filterDimensions state)

// PM dimension types that use /counters/dimension-values API
const PM_DIMENSION_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', 'TRANSPORT', 'CA_REL']);
const PM_DIMENSION_LABELS: Record<string, string> = {
  PMQAP: 'QCI Profile (PMQAP)',
  FLEX: 'Flex QoS (QCI)',
  NEIGHBOR: 'Neighbor Cell',
  CA_REL: 'CA Relation',
  RANSHARE: 'RAN Sharing (PLMN)',
  SLICE: 'Network Slice (NSSAI)',
  TRANSPORT: 'Transport Link',
};

// Filter values fetched from backend (KPI Engine first, fallback to Parser PM counters)
const useBackendFilterValues = (dimension: string): string[] => {
  const [values, setValues] = React.useState<string[]>([]);
  React.useEffect(() => {
    // PM dimension types → use /counters/dimension-values
    if (PM_DIMENSION_TYPES.has(dimension)) {
      import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
        fetch(getApiUrl(`pm/counters/dimension-values?dimension_type=${dimension}&limit=100`), { headers: getApiHeaders() })
          .then(r => r.ok ? r.json() : { values: [] })
          .then(d => { if (d.values) setValues(d.values); })
          .catch(() => {});
      });
      return;
    }
    const dimMap: Record<string, string> = { Cell: 'CELL', Site: 'SITE', Vendor: 'VENDOR', Technology: 'TECHNO', Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'PLAQUE', 'Zone ARCEP': 'ARCEP' };
    const key = dimMap[dimension] || dimension;
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      // Try KPI Engine first
      fetch(getApiUrl(`monitor/filters/values?dimension=${key}`), { headers: getApiHeaders() })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
        .then(d => {
          if (d.values && d.values.length > 0) { setValues(d.values); return; }
          throw new Error('empty');
        })
        .catch(() => {
          // Fallback: read from Parser fact_counters_15min
          fetch(getApiUrl(`pm/counters/filter-values?dimension=${key}`), { headers: getApiHeaders() })
            .then(r => r.json())
            .then(d => { if (d.values) setValues(d.values); })
            .catch(() => {});
        });
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

/* ── Add Filter Dropdown (uses Radix Popover to portal above graphs) ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string, val: string) => void;
  filterDimensions: string[];
}> = ({ existingKeys: _existingKeys, onAdd, filterDimensions }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedDim(null); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
          <Filter className="w-3 h-3" /> Add Filter
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[180px] p-1.5" align="start" sideOffset={4}>
        {!selectedDim ? (
          filterDimensions.map(dim => {
            const isPm = PM_DIMENSION_TYPES.has(dim);
            const label = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;
            return (
              <button
                key={dim}
                onClick={() => setSelectedDim(dim)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isPm ? "text-amber-600 hover:bg-amber-500/10" : "text-foreground hover:bg-muted/50"
                )}
              >
                {label}
                {isPm && <span className="ml-1 text-[8px] text-amber-500/70">PM</span>}
              </button>
            );
          })
        ) : (
          <FilterValuesList dim={selectedDim} onSelect={(val) => { onAdd(selectedDim, val); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ── Filter Values (from backend) with search & paste ── */
const FilterValuesList: React.FC<{ dim: string; onSelect: (val: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const values = useBackendFilterValues(dim);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted) return;
    // Support pasting multiple values separated by newline, comma, or semicolon
    const items = pasted.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (items.length > 1) {
      e.preventDefault();
      items.forEach(item => {
        const match = values.find(v => v.toLowerCase() === item.toLowerCase());
        if (match) onSelect(match);
      });
      return;
    }
  };

  const filtered = search
    ? values.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : values;

  return (
    <>
      <button onClick={onBack} className="w-full text-left px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground">
        ← {dim}
      </button>
      <input
        ref={inputRef}
        value={search}
        onChange={e => setSearch(e.target.value)}
        onPaste={handlePaste}
        placeholder="Rechercher ou coller..."
        className="w-full px-3 py-1.5 border-b border-border/40 bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
      />
      <div className="border-t border-border/40 mt-0 pt-1 max-h-[200px] overflow-y-auto">
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground">Aucun résultat pour "{search}"</div>
        ) : (
          filtered.slice(0, 100).map(val => (
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

const JALON_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/* ── Jalon Form ── */
const JalonForm: React.FC<{ onAdd: (j: Jalon) => void }> = ({ onAdd }) => {
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(JALON_COLORS[0]);

  const handleAdd = () => {
    if (!date || !label) return;
    onAdd({ id: `jalon-${Date.now()}`, date, label, color });
    setDate('');
    setLabel('');
  };

  return (
    <div className="space-y-2">
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
      />
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Nom du jalon..."
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
      />
      <div className="flex items-center gap-1.5">
        {JALON_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn('w-5 h-5 rounded-full border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
            style={{ backgroundColor: c }}
          />
        ))}
        <Button size="sm" className="h-6 text-[10px] px-3 ml-auto" onClick={handleAdd} disabled={!date || !label}>
          <Plus className="w-3 h-3 mr-1" /> Ajouter
        </Button>
      </div>
    </div>
  );
};

/* ── Main Control Panel ── */
const ControlPanel: React.FC<Props> = ({ state, setState, onApply, externalSelectorSlot, onExternalSelectorClose, activeSlotId, onSlotClick, isApplying, showAIPanel, onToggleAIPanel }) => {
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>([]);
  const [kpiDefs, setKpiDefs] = useState<KpiDefinition[]>(FALLBACK_KPIS);
  const [selectorOpen, setSelectorOpen] = useState<string | null>(null);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [filterDimensions, setFilterDimensions] = useState<string[]>(FILTER_DIMS_FALLBACK);
  const [kpisWithData, setKpisWithData] = useState<Set<string> | null>(null);
  const [pmDimValues, setPmDimValues] = useState<string[]>([]);
  const [pmDimLoading, setPmDimLoading] = useState(false);

  // Load split and filter dimensions from backend catalog
  useEffect(() => {
    fetchFilterCatalog().then(filters => {
      if (filters && filters.length > 0) {
        // Split-by: only aggregatable dimensions
        const splits = filters
          .filter((f: any) => f.is_active !== false && f.is_aggregatable)
          .map((f: any) => ({ key: f.dimension_key, label: f.display_name }));
        if (splits.length > 0) setSplitOptions(splits);
        else setSplitOptions(SPLITS_FALLBACK.filter(s => s !== 'None').map(s => ({ key: s, label: s })));

        // Filter dimensions: only filterable
        const dims = filters
          .filter((f: any) => f.is_active !== false && f.is_filterable)
          .map((f: any) => f.display_name);
        if (dims.length > 0) setFilterDimensions(dims);
      }
    }).catch(() => {
      setSplitOptions(SPLITS_FALLBACK.filter(s => s !== 'None').map(s => ({ key: s, label: s })));
    });
  }, []);

  // Open selector when triggered externally from graph widget
  useEffect(() => {
    if (externalSelectorSlot) setSelectorOpen(externalSelectorSlot);
  }, [externalSelectorSlot]);

  const handleSelectorClose = () => {
    setSelectorOpen(null);
    onExternalSelectorClose?.();
  };

  useEffect(() => {
    fetchKpiCatalog().then(data => {
      if (data && data.length > 0) {
        const mapped = data.map((k: any) => ({
          kpi_id: k.kpi_key, kpi_key: k.kpi_key, display_name: k.display_name || k.kpi_key,
          description: k.description || '', techno_scope: 'both' as const, unit: k.unit || '',
          value_type: (k.value_type || 'gauge') as any, default_agg: 'avg' as const, allowed_aggs: ['avg' as const],
          is_map_supported: false, category: k.category || 'Other', color: '#3b82f6',
          vendor: k.vendor || '', techno: k.techno || '',
          dimension_type: k.dimension_type || null,
          dimension_prefix: k.dimension_prefix || null,
          counter_count: k.counter_count || 0,
        }));
        setCatalog(mapped);
      }
    }).catch(() => {});
    fetchKpiDefinitions().then(k => { if (k.length > 0) setKpiDefs(k); }).catch(() => {});
  }, []);

  // Load PM dimension values based on selected KPIs' dimension types
  const primaryKpiDimType = useMemo(() => {
    if (activePmDimensions.size === 0) return null;
    return Array.from(activePmDimensions)[0];
  }, [activePmDimensions]);

  useEffect(() => {
    setPmDimValues([]);
    if (!primaryKpiDimType) return;
    setPmDimLoading(true);
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      fetch(getApiUrl(`pm/counters/dimension-values?dimension_type=${primaryKpiDimType}&limit=50`), { headers: getApiHeaders() })
        .then(r => r.ok ? r.json() : { values: [] })
        .then(d => { setPmDimValues(d.values || []); setPmDimLoading(false); })
        .catch(() => setPmDimLoading(false));
    });
  }, [primaryKpiDimType]);

  // Load KPIs with data when Site/Cell filter is active
  useEffect(() => {
    const siteVals = state.filters['Site'] || [];
    const cellVals = state.filters['Cell'] || [];
    if (siteVals.length === 1) {
      fetchKpisWithData('SITE', siteVals[0]).then(setKpisWithData);
    } else if (cellVals.length === 1) {
      fetchKpisWithData('CELL', cellVals[0]).then(setKpisWithData);
    } else {
      setKpisWithData(null);
    }
  }, [state.filters]);

  // Detect PM dimension types from selected KPIs → add to filter dimensions
  const activePmDimensions = useMemo(() => {
    const dims = new Set<string>();
    for (const slot of state.graphSlots) {
      for (const kpiId of slot.kpiIds) {
        const def = kpiDefs.find(k => k.id === kpiId);
        if (def?.dimension_type && PM_DIMENSION_TYPES.has(def.dimension_type)) {
          dims.add(def.dimension_type);
        }
      }
    }
    return dims;
  }, [state.graphSlots, kpiDefs]);

  // Merge PM dimensions into filter dimensions (after standard ones)
  const allFilterDimensions = useMemo(() => {
    const base = [...filterDimensions];
    for (const dt of activePmDimensions) {
      const label = PM_DIMENSION_LABELS[dt] || dt;
      if (!base.includes(label) && !base.includes(dt)) base.push(dt);
    }
    return base;
  }, [filterDimensions, activePmDimensions]);

  // Sort catalog: KPIs with data first
  const sortedCatalog = useMemo(() => {
    if (!kpisWithData || kpisWithData.size === 0) return catalog;
    return [...catalog].sort((a, b) => {
      const aHas = kpisWithData.has(a.kpi_key) ? 0 : 1;
      const bHas = kpisWithData.has(b.kpi_key) ? 0 : 1;
      return aHas - bHas;
    });
  }, [catalog, kpisWithData]);

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

  // Parse dates as local (add T12:00 to avoid UTC midnight timezone shift)
  const startDate = state.startDate ? new Date(state.startDate + 'T12:00:00') : undefined;
  const endDate = state.endDate ? new Date(state.endDate + 'T12:00:00') : undefined;

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
    <div className="sticky top-0 z-30">
      {/* ═══ LAYER 1: HEADER — Branding ═══ */}
      <div className="bg-card border-b border-border/60">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Settings2 className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-foreground tracking-tight">QOEBIT Investigator</h1>
              <p className="text-[10px] text-muted-foreground font-medium tracking-wide">KPI Investigation & Root Cause Analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-green-600 px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/15">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Live</span>
            </div>
            <button onClick={onToggleAIPanel}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                showAIPanel ? 'bg-cyan-600 text-white shadow-md' : 'bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 border border-cyan-500/20')}>
              <Sparkles className="w-3.5 h-3.5" />
              TRACE AI
            </button>
          </div>
        </div>
      </div>

      {/* ═══ LAYER 2: TOOLBAR — Actions & Date Controls ═══ */}
      <div className="bg-secondary/50 border-b border-border/50">
        <div className="max-w-[1600px] mx-auto px-6 py-2">
          <div className="flex items-center gap-3">
            {/* Date range */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('h-8 w-[120px] justify-start text-left text-[11px] font-medium rounded-lg bg-card', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setState(prev => ({ ...prev, startDate: format(d, 'yyyy-MM-dd') }))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-[10px] text-muted-foreground font-medium">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('h-8 w-[120px] justify-start text-left text-[11px] font-medium rounded-lg bg-card', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => d && setState(prev => ({ ...prev, endDate: format(d, 'yyyy-MM-dd') }))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Period shortcuts */}
            <div className="flex items-center bg-card p-0.5 rounded-lg border border-border/40 shrink-0">
              {PERIODS.map(p => (
                <button key={p.label} onClick={() => applyPeriod(p.days)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  {p.label}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Granularity */}
            <div className="flex items-center bg-card p-0.5 rounded-lg border border-border/40 shrink-0">
              {GRANULARITIES.map(g => (
                <button key={g.value} onClick={() => setState(prev => ({ ...prev, granularity: g.value }))}
                  className={cn('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
                    state.granularity === g.value ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {g.label}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Jalons */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-[11px] gap-1.5 px-3 rounded-lg bg-card">
                  <Flag className="w-3 h-3 text-muted-foreground" />
                  Jalons{state.jalons.length > 0 && <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">{state.jalons.length}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-3 space-y-2" align="start">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Ajouter un jalon</div>
                <JalonForm onAdd={(j) => setState(prev => ({ ...prev, jalons: [...prev.jalons, j] }))} />
                {state.jalons.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-border/40">
                    {state.jalons.map(j => (
                      <div key={j.id} className="flex items-center gap-2 text-[10px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: j.color }} />
                        <span className="font-medium text-foreground truncate flex-1">{j.label}</span>
                        <span className="text-muted-foreground">{j.date}</span>
                        <button onClick={() => setState(prev => ({ ...prev, jalons: prev.jalons.filter(jj => jj.id !== j.id) }))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Jalon chips inline */}
            {state.jalons.map(j => (
              <span key={j.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border border-border/30 bg-card text-foreground">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: j.color }} />
                {j.label}
                <button onClick={() => setState(prev => ({ ...prev, jalons: prev.jalons.filter(jj => jj.id !== j.id) }))} className="hover:text-destructive ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Apply button */}
            <Button
              onClick={onApply}
              size="sm"
              disabled={!Object.values(state.filters).some(v => v.length > 0) || isApplying}
              className="h-8 px-6 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isApplying ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Chargement...</span>
                </div>
              ) : !Object.values(state.filters).some(v => v.length > 0)
                ? 'Ajouter un filtre'
                : state.graphSlots.some(s => s.kpiIds.length > 0)
                  ? 'Appliquer'
                  : 'Appliquer (ajoutez des KPIs)'}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ LAYER 3: KPI / FILTERS — Niveau, KPIs, Filters ═══ */}
      <div className="bg-card border-b border-border/40">
        <div className="max-w-[1600px] mx-auto px-6 py-3 space-y-2.5">
          {/* Row A: KPI Level + Profile/Neighbor filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Niveau</span>
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { value: 'CELL' as KpiLevel, label: 'Cell', icon: BarChart },
                  { value: 'PROFILE' as KpiLevel, label: 'Profile (QCI)', icon: Fingerprint },
                  { value: 'NEIGHBOR' as KpiLevel, label: 'Neighbor', icon: GitBranch },
                ]).map(lvl => (
                  <button
                    key={lvl.value}
                    onClick={() => setState(prev => ({ ...prev, kpiLevel: lvl.value, profileQci: null, profileArp: null, neighborType: null }))}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all',
                      state.kpiLevel === lvl.value
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <lvl.icon className="w-3 h-3" />
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Profile filters */}
            {state.kpiLevel === 'PROFILE' && (
              <>
                <div className="h-5 w-px bg-border/60 shrink-0" />
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">QCI</span>
                  <select
                    value={state.profileQci ?? ''}
                    onChange={e => setState(prev => ({ ...prev, profileQci: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="h-7 px-2 rounded-lg border border-border bg-background text-foreground text-[10px] font-medium min-w-[70px]"
                  >
                    <option value="">Tous</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(q => (
                      <option key={q} value={q}>QCI {q}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ARP</span>
                  <select
                    value={state.profileArp ?? ''}
                    onChange={e => setState(prev => ({ ...prev, profileArp: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="h-7 px-2 rounded-lg border border-border bg-background text-foreground text-[10px] font-medium min-w-[70px]"
                  >
                    <option value="">Tous</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(a => (
                      <option key={a} value={a}>ARP {a}</option>
                    ))}
                  </select>
                </div>
                {(state.profileQci != null || state.profileArp != null) && (
                  <div className="flex items-center gap-1">
                    {state.profileQci != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/10 text-violet-600 border border-violet-500/20">
                        QCI: {state.profileQci}
                        <button onClick={() => setState(prev => ({ ...prev, profileQci: null }))} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    )}
                    {state.profileArp != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-500/10 text-violet-600 border border-violet-500/20">
                        ARP: {state.profileArp}
                        <button onClick={() => setState(prev => ({ ...prev, profileArp: null }))} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Neighbor filters */}
            {state.kpiLevel === 'NEIGHBOR' && (
              <>
                <div className="h-5 w-px bg-border/60 shrink-0" />
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type</span>
                  <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                    {([
                      { value: null, label: 'Tous' },
                      { value: 'X2', label: 'X2' },
                      { value: 'HO_LTE', label: 'HO LTE' },
                      { value: 'HO_UTRAN', label: 'HO UTRAN' },
                    ] as { value: string | null; label: string }[]).map(nt => (
                      <button
                        key={nt.label}
                        onClick={() => setState(prev => ({ ...prev, neighborType: nt.value }))}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                          state.neighborType === nt.value
                            ? 'bg-card text-cyan-600 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {nt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Row B: Filters (above KPIs) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Filter className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Filtre par dimension</span>
            </div>
            {filterChips.map(({ dim, val }) => {
              const isPm = PM_DIMENSION_TYPES.has(dim);
              const chipLabel = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;
              return (
                <span key={`${dim}-${val}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border",
                    isPm
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                      : "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                  )}>
                  <span className="text-muted-foreground">{chipLabel}:</span>
                  <span className="font-bold">{val}</span>
                  <button onClick={() => removeFilter(dim, val)} className="ml-0.5 hover:text-destructive transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            <AddFilterDropdown existingKeys={Object.keys(state.filters)} onAdd={addFilter} filterDimensions={allFilterDimensions} />
          </div>

          {/* Row C: KPI chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">KPIs</span>
            {state.graphSlots.filter(slot => slot.kpiIds.length > 0 && slot.id === activeSlotId).flatMap((slot) => {
              const cfg = slot.config || DEFAULT_GRAPH_CONFIG;
              const setSlotConfig = (updates: Partial<GraphConfig>) => {
                setState(prev => ({
                  ...prev,
                  graphSlots: prev.graphSlots.map(s =>
                    s.id === slot.id ? { ...s, config: { ...cfg, ...updates } } : s
                  ),
                }));
              };
              return slot.kpiIds.map((kpiIdItem) => {
                const catalogEntry = catalog.find(k => k.kpi_key === kpiIdItem);
                const defEntry = kpiDefs.find(k => k.id === kpiIdItem);
                const name = catalogEntry?.display_name || defEntry?.label || kpiIdItem;
                const color = catalogEntry?.color || defEntry?.color || '#6366f1';
                const splitVal = cfg.splitByPerKpi?.[kpiIdItem];
                const hasSplit = splitVal && splitVal !== 'None';
                const splitLabel = hasSplit ? splitOptions.find(s => s.key === splitVal)?.label || splitVal : null;
                const kpiDimType = defEntry?.dimension_type;
                return (
                  <Popover key={`${slot.id}-${kpiIdItem}`}>
                    <PopoverTrigger asChild>
                      <button
                        onClick={() => onSlotClick?.(slot.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all duration-200',
                          'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15'
                        )}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate max-w-[140px]">{name}</span>
                        {kpiDimType && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/25">
                            {kpiDimType}
                          </span>
                        )}
                        {splitLabel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-accent text-accent-foreground border border-accent/60">
                            ÷ {splitLabel}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setState(prev => ({
                              ...prev,
                              graphSlots: prev.graphSlots.map(s =>
                                s.id === slot.id ? { ...s, kpiIds: s.kpiIds.filter(k => k !== kpiIdItem) } : s
                              ),
                            }));
                          }}
                          className="ml-0.5 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-bold text-foreground truncate max-w-[130px]">{name}</span>
                        </div>
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
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-foreground">Smooth Curve</span>
                        <Switch checked={cfg.smooth} onCheckedChange={v => setSlotConfig({ smooth: v })} className="scale-75" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-foreground">Line Width</span>
                          <span className="text-[9px] text-muted-foreground font-mono">{cfg.lineWidth}px</span>
                        </div>
                        <Slider value={[cfg.lineWidth]} onValueChange={v => setSlotConfig({ lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="w-full" />
                      </div>
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
                      {/* Y-Axis */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Axe Y</span>
                          <div className="flex items-center bg-muted/50 rounded border border-border/40 overflow-hidden">
                            {(['L', 'R'] as const).map(side => {
                              const isActiveAxis = (cfg as any).__activeYTab === side || (!(cfg as any).__activeYTab && side === 'L');
                              return (
                                <button key={side} onClick={() => setSlotConfig({ __activeYTab: side } as any)}
                                  className={cn('px-2.5 py-0.5 text-[9px] font-bold transition-colors',
                                    isActiveAxis ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground')}
                                >{side}</button>
                              );
                            })}
                          </div>
                        </div>
                        {(() => {
                          const isRight = (cfg as any).__activeYTab === 'R';
                          const axisCfg = isRight ? cfg.yAxisRight : cfg.yAxis;
                          const axisKey = isRight ? 'yAxisRight' : 'yAxis';
                          return (
                            <>
                              <div className="flex gap-1">
                                {(['auto', 'manual'] as const).map(mode => (
                                  <button key={mode} onClick={() => setSlotConfig({ [axisKey]: { ...axisCfg, mode } })}
                                    className={cn('flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                                      (axisCfg?.mode || 'auto') === mode ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground hover:bg-muted/50')}
                                  >{mode === 'auto' ? 'Auto' : 'Manuel'}</button>
                                ))}
                              </div>
                              {axisCfg?.mode === 'manual' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] text-muted-foreground">Min</span>
                                    <input type="number" value={axisCfg?.min ?? ''} onChange={e => setSlotConfig({ [axisKey]: { ...axisCfg, mode: 'manual', min: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-mono" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] text-muted-foreground">Max</span>
                                    <input type="number" value={axisCfg?.max ?? ''} onChange={e => setSlotConfig({ [axisKey]: { ...axisCfg, mode: 'manual', max: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-mono" />
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {/* Split By */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split By</span>
                        <select
                          value={(() => {
                            const vals = Object.values(cfg.splitByPerKpi || {}).filter(v => v && v !== 'None');
                            return vals.length > 0 ? vals[0] : 'None';
                          })()}
                          onChange={e => {
                            const val = e.target.value;
                            const allSplits: Record<string, string> = {};
                            slot.kpiIds.forEach(kid => { allSplits[kid] = val; });
                            setState(prev => ({
                              ...prev,
                              graphSlots: prev.graphSlots.map(s =>
                                s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: allSplits } } : s
                              ),
                            }));
                          }}
                          className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-medium"
                        >
                          <option value="None">Aucun</option>
                          {splitOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="h-px bg-border/60" />
                      <button
                        onClick={(e) => {
                          (e.target as HTMLElement).closest('[data-radix-popper-content-wrapper]')?.dispatchEvent(
                            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                          );
                        }}
                        className="w-full text-[10px] font-semibold text-primary hover:bg-primary/10 py-1.5 rounded-md transition-colors"
                      >
                        Appliquer
                      </button>
                    </PopoverContent>
                  </Popover>
                );
              });
            })}
            <button
              onClick={() => setSelectorOpen(activeSlotId || 'new')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add KPI
            </button>
          </div>

          {/* Row D: Dimension (only when selected KPIs have dimensions) */}
          {primaryKpiDimType && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  {PM_DIMENSION_LABELS[primaryKpiDimType] || primaryKpiDimType}
                </span>
              </div>
              <select
                value={state.filters[primaryKpiDimType]?.[0] || ''}
                onChange={e => {
                  const val = e.target.value;
                  const dimKey = primaryKpiDimType!;
                  setState(prev => {
                    const newFilters = { ...prev.filters };
                    if (val) newFilters[dimKey] = [val];
                    else delete newFilters[dimKey];
                    return { ...prev, filters: newFilters };
                  });
                }}
                className="h-7 px-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-foreground text-[10px] font-medium min-w-[160px]"
              >
                <option value="">Toutes les dimensions</option>
                {pmDimValues.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {pmDimLoading && <span className="text-[9px] text-muted-foreground animate-pulse">chargement...</span>}
              {state.filters[primaryKpiDimType]?.[0] && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  {state.filters[primaryKpiDimType][0]}
                  <button onClick={() => setState(prev => {
                    const nf = { ...prev.filters };
                    delete nf[primaryKpiDimType!];
                    return { ...prev, filters: nf };
                  })} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
            </div>
          )}

        </div>
      </div>

      {/* KPI Selector Modal - rendered via portal to escape stacking context */}
      {createPortal(
        <KpiSelectorModal
          open={!!selectorOpen}
          onClose={handleSelectorClose}
          catalog={sortedCatalog}
          
          selectedKeys={selectorOpen && selectorOpen !== 'new'
            ? (state.graphSlots.find(s => s.id === selectorOpen)?.kpiIds || [])
            : []}
          axisAssignments={(() => {
            if (!selectorOpen || selectorOpen === 'new') return {};
            const slot = state.graphSlots.find(s => s.id === selectorOpen);
            if (!slot?.config?.yAxisAssignments) return {};
            const result: Record<string, 'left' | 'right'> = {};
            for (const [k, v] of Object.entries(slot.config.yAxisAssignments)) {
              result[k] = v === 1 ? 'right' : 'left';
            }
            return result;
          })()}
          onAxisAssignmentsChange={(assignments) => {
            if (!selectorOpen || selectorOpen === 'new') return;
            const numericAssignments: Record<string, number> = {};
            for (const [k, v] of Object.entries(assignments)) {
              numericAssignments[k] = v === 'right' ? 1 : 0;
            }
            setState(prev => ({
              ...prev,
              graphSlots: prev.graphSlots.map(s =>
                s.id === selectorOpen
                  ? { ...s, config: { ...(s.config || DEFAULT_GRAPH_CONFIG), yAxisAssignments: numericAssignments } }
                  : s
              ),
            }));
          }}
          onConfirm={(keys) => {
            const validKeys = keys.filter(Boolean);
            if (validKeys.length === 0) return;
            if (selectorOpen === 'new') {
              const newId = `slot-${Date.now()}`;
              setState(prev => {
                const nextIndex = prev.graphSlots.length + 1;
                const newSlot: GraphSlot = {
                  id: newId,
                  kpiIds: validKeys,
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
                graphSlots: prev.graphSlots.map(s => {
                  if (s.id !== selectorOpen) return s;
                  const merged = [...new Set([...s.kpiIds, ...validKeys])];
                  return { ...s, kpiIds: merged, splitBy: 'None' };
                }),
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
