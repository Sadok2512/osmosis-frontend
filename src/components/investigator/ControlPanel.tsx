import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { InvestigationState, Dimension, SplitOption, Granularity, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, KpiLevel } from './types';
import { formatDateTime } from './timeUtils';
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
import CounterSelectorModal from './CounterSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { fetchKpiCatalog, fetchFilterCatalog, type MonitorFilterDef } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

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
  selectedCounters?: any[];
  onSelectedCountersChange?: (counters: any[]) => void;
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
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
];
// FILTER_DIMENSIONS now loaded from backend (see filterDimensions state)

// PM dimension types that use /counters/dimension-values API
const PM_DIMENSION_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);
const PM_DIMENSION_LABELS: Record<string, string> = {
  PMQAP: 'QCI Profile (PMQAP)',
  FLEX: 'Flex QoS (QCI)',
  NEIGHBOR: 'Neighbor Cell',
  CA_REL: 'CA Relation',
  RANSHARE: 'RAN Sharing (PLMN)',
  SLICE: 'Network Slice (NSSAI)',
  '5QI': '5QI Slice (NR)',
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

/* ── Add Filter Dropdown — Step 1: pick dimension (hides already-added) ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string) => void;
  filterDimensions: string[];
}> = ({ existingKeys, onAdd, filterDimensions }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const available = filterDimensions.filter(d => !existingKeys.includes(d));
  const filtered = search
    ? available.filter(d => {
        const label = PM_DIMENSION_TYPES.has(d) ? (PM_DIMENSION_LABELS[d] || d) : d;
        return label.toLowerCase().includes(search.toLowerCase());
      })
    : available;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors">
          <Plus className="w-3 h-3" /> Ajouter filtre
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[200px] p-1.5" align="start" sideOffset={4}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher dimension..."
          className="w-full px-3 py-1.5 mb-1 border-b border-border/40 bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          autoFocus
        />
        <div className="max-h-[240px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              {available.length === 0 ? 'Tous les filtres sont déjà ajoutés' : 'Aucun résultat'}
            </div>
          )}
          {filtered.map(dim => {
            const isPm = PM_DIMENSION_TYPES.has(dim);
            const label = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;
            return (
              <button
                key={dim}
                onClick={() => { onAdd(dim); setOpen(false); setSearch(''); }}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isPm ? "text-amber-600 hover:bg-amber-500/10" : "text-foreground hover:bg-muted/50"
                )}
              >
                {label}
                {isPm && <span className="ml-1 text-[8px] text-amber-500/70">PM</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Filter Chip — Step 2: multi-select values for one dimension ── */
const FilterChip: React.FC<{
  dim: string;
  values: string[];
  onToggleValue: (val: string) => void;
  onClear: () => void;
  onRemove: () => void;
}> = ({ dim, values, onToggleValue, onClear, onRemove }) => {
  const [open, setOpen] = useState(false);
  const backendValues = useBackendFilterValues(dim);
  const [search, setSearch] = useState('');
  const isPm = PM_DIMENSION_TYPES.has(dim);
  const label = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;

  const filtered = search
    ? backendValues.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : backendValues;

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted) return;
    const items = pasted.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (items.length > 1) {
      e.preventDefault();
      items.forEach(item => {
        const match = backendValues.find(v => v.toLowerCase() === item.toLowerCase());
        if (match && !values.includes(match)) onToggleValue(match);
      });
    }
  };

  const displayText = values.length === 0
    ? 'Tous'
    : values.length === 1
      ? values[0]
      : `${values.length} sélectionnés`;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-l-lg text-[10px] font-semibold border border-r-0 transition-all cursor-pointer",
              isPm
                ? values.length > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" : "bg-amber-500/5 text-amber-600 border-amber-500/20"
                : values.length > 0 ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" : "bg-muted/50 text-muted-foreground border-border/40"
            )}
          >
            <span className="text-muted-foreground font-normal">{label}:</span>
            <span className="font-bold truncate max-w-[120px]">{displayText}</span>
            <ChevronDown className={cn("w-3 h-3 opacity-50 transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start" sideOffset={4}>
          <div className="p-2 border-b border-border/40">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onPaste={handlePaste}
              placeholder={`Rechercher ${label}...`}
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
              autoFocus
            />
          </div>
          {values.length > 0 && (
            <div className="px-2 py-1.5 border-b border-border/40 flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground font-medium">{values.length} sélectionné(s)</span>
              <button onClick={onClear} className="text-[9px] text-muted-foreground hover:text-destructive font-medium">
                Tout effacer
              </button>
            </div>
          )}
          <div className="max-h-[220px] overflow-y-auto p-1">
            {backendValues.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">Aucun résultat pour "{search}"</div>
            ) : (
              filtered.slice(0, 100).map(val => {
                const isSelected = values.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => onToggleValue(val)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                      isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      isSelected ? "bg-primary border-primary" : "border-border"
                    )}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={onRemove}
        className="h-[30px] px-1.5 rounded-r-lg border border-l-0 border-border/40 bg-secondary/50 hover:bg-destructive hover:text-destructive-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
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
const ControlPanel: React.FC<Props> = ({ state, setState, onApply, externalSelectorSlot, onExternalSelectorClose, activeSlotId, onSlotClick, isApplying, showAIPanel, onToggleAIPanel, selectedCounters: externalSelectedCounters, onSelectedCountersChange }) => {
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>([]);
  const [kpiDefs, setKpiDefs] = useState<KpiDefinition[]>(FALLBACK_KPIS);
  const [selectorOpen, setSelectorOpen] = useState<string | null>(null);
  const [counterSelectorOpen, setCounterSelectorOpen] = useState(false);
  const [counterCatalog, setCounterCatalog] = useState<any[]>([]);
  const selectedCounters = externalSelectedCounters || [];
  const setSelectedCounters = (counters: any[]) => onSelectedCountersChange?.(counters);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [filterDimensions, setFilterDimensions] = useState<string[]>(FILTER_DIMS_FALLBACK);
  const [kpisWithData, setKpisWithData] = useState<Set<string> | null>(null);
  const [pmDimValues, setPmDimValues] = useState<{ value: string; label: string }[]>([]);
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
      const items = Array.isArray(data) ? data : (data as any)?.kpis || (data as any)?.items || [];
      if (items.length > 0) {
        const mapped = items.map((k: any) => ({
          kpi_id: k.kpi_key, kpi_key: k.kpi_key, display_name: k.display_name || k.kpi_key,
          description: k.description || '', techno_scope: 'both' as const, unit: k.unit || '',
          value_type: (k.value_type || 'gauge') as any, default_agg: 'avg' as const, allowed_aggs: ['avg' as const],
          is_map_supported: false, category: k.category || 'Other', color: '#3b82f6',
          vendor: k.vendor || '', techno: k.techno || '',
          is_normalized: k.is_normalized ?? false,
          dimension_type: k.dimension_type || null,
          dimension_prefix: k.dimension_prefix || null,
          counter_count: k.counter_count || 0,
          supported_levels: k.supported_levels || [],
        }));
        setCatalog(mapped);
      }
    }).catch(() => {});
    fetchKpiDefinitions().then(k => { if (k.length > 0) setKpiDefs(k); }).catch(() => {});
  }, []);

  // Load counter catalog for counter selector
  useEffect(() => {
    fetch(getApiUrl('pm/counters/catalog?limit=5000'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : []).then(setCounterCatalog).catch(() => {});
  }, []);

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

  // Load PM dimension values based on selected KPIs' dimension types
  const primaryKpiDimType = useMemo(() => {
    if (activePmDimensions.size === 0) return null;
    return Array.from(activePmDimensions)[0];
  }, [activePmDimensions]);

  // Auto-add/remove PM dimension filters when KPIs with dimension_type are selected/deselected
  const prevPmDimsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevPmDimsRef.current;
    const current = activePmDimensions;
    // Auto-add newly appeared PM dimensions
    for (const dim of current) {
      if (!prev.has(dim) && !state.filters[dim]) {
        setState(s => ({ ...s, filters: { ...s.filters, [dim]: [] } }));
      }
    }
    // Auto-remove PM dimensions that are no longer active (KPIs removed)
    for (const dim of prev) {
      if (!current.has(dim) && PM_DIMENSION_TYPES.has(dim)) {
        setState(s => {
          const nf = { ...s.filters };
          delete nf[dim];
          return { ...s, filters: nf };
        });
      }
    }
    prevPmDimsRef.current = new Set(current);
  }, [activePmDimensions]);

  useEffect(() => {
    setPmDimValues([]);
    if (!primaryKpiDimType) return;
    setPmDimLoading(true);
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      fetch(getApiUrl(`pm/counters/dimension-values?dimension_type=${primaryKpiDimType}&limit=50`), { headers: getApiHeaders() })
        .then(r => r.ok ? r.json() : { labeled_values: [] })
        .then(d => { setPmDimValues(d.labeled_values || (d.values || []).map((v: string) => ({ value: v, label: v }))); setPmDimLoading(false); })
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

  // (activePmDimensions already declared above)

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
      startDate: formatDateTime(start),
      endDate: formatDateTime(end),
    }));
  };

  // Parse dates as local (add T12:00 to avoid UTC midnight timezone shift)
  // Guard against invalid/corrupt persisted values
  const parseSafeDate = (raw: string | undefined | null): Date | undefined => {
    if (!raw || !raw.trim()) return undefined;
    const dateOnly = raw.split('T')[0]; // strip any existing time part
    const d = new Date(dateOnly + 'T12:00:00');
    return isNaN(d.getTime()) ? undefined : d;
  };
  const startDate = parseSafeDate(state.startDate);
  const endDate = parseSafeDate(state.endDate);

  const addFilterDimension = (dim: string) => {
    setState(prev => {
      if (prev.filters[dim]) return prev; // already exists
      return { ...prev, filters: { ...prev.filters, [dim]: [] } };
    });
  };

  const toggleFilterValue = (dim: string, val: string) => {
    setState(prev => {
      const existing = prev.filters[dim] || [];
      const newVals = existing.includes(val)
        ? existing.filter(v => v !== val)
        : [...existing, val];
      return { ...prev, filters: { ...prev.filters, [dim]: newVals } };
    });
  };

  const clearFilterValues = (dim: string) => {
    setState(prev => ({ ...prev, filters: { ...prev.filters, [dim]: [] } }));
  };

  const removeFilterDimension = (dim: string) => {
    setState(prev => {
      const newFilters = { ...prev.filters };
      delete newFilters[dim];
      return { ...prev, filters: newFilters };
    });
  };

  const activeFilterDims = Object.keys(state.filters);

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
                  <Calendar
                    mode="single"
                    selected={startDate}
                    defaultMonth={startDate || new Date()}
                    today={undefined}
                    onSelect={(d) => d && setState(prev => {
                      const nextStart = format(d, 'yyyy-MM-dd');
                      const nextEnd = prev.endDate && prev.endDate < nextStart ? nextStart : prev.endDate;
                      return { ...prev, startDate: nextStart, endDate: nextEnd };
                    })}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
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
                  <Calendar
                    mode="single"
                    selected={endDate}
                    defaultMonth={endDate || startDate || new Date()}
                    disabled={(date) => !!startDate && date < startDate}
                    onSelect={(d) => d && setState(prev => ({ ...prev, endDate: format(d, 'yyyy-MM-dd') }))}
                    today={undefined}
                    modifiers={startDate ? { rangeStart: startDate } : undefined}
                    modifiersStyles={{ rangeStart: { border: '2px solid hsl(var(--primary))', borderRadius: '6px', fontWeight: 700 } }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
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

          {/* Row B: Filters — 2-step: add dimension, then select values */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-muted-foreground shrink-0">
              <Filter className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Filtres</span>
            </div>
            {activeFilterDims.map(dim => (
              <FilterChip
                key={dim}
                dim={dim}
                values={state.filters[dim] || []}
                onToggleValue={(val) => toggleFilterValue(dim, val)}
                onClear={() => clearFilterValues(dim)}
                onRemove={() => removeFilterDimension(dim)}
              />
            ))}
            <AddFilterDropdown existingKeys={activeFilterDims} onAdd={addFilterDimension} filterDimensions={allFilterDimensions} />
            {activeFilterDims.length > 0 && (
              <button
                onClick={() => setState(prev => ({ ...prev, filters: {} }))}
                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <X className="w-2.5 h-2.5" /> Tout effacer
              </button>
            )}
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
                            if (val === 'None') {
                              setState(prev => ({
                                ...prev,
                                graphSlots: prev.graphSlots.map(s =>
                                  s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: {} } } : s
                                ),
                              }));
                            } else {
                              const allSplits: Record<string, string> = {};
                              slot.kpiIds.forEach(kid => { allSplits[kid] = val; });
                              setState(prev => ({
                                ...prev,
                                graphSlots: prev.graphSlots.map(s =>
                                  s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: allSplits } } : s
                                ),
                              }));
                            }
                          }}
                          className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-medium"
                        >
                          <option value="None">Aucun</option>
                          {splitOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          {activePmDimensions.size > 0 && (
                            <optgroup label="── PM Dimensions ──">
                              {Array.from(activePmDimensions).map(d => (
                                <option key={`pm_${d}`} value={`PM_DIM:${d}`}>{PM_DIMENSION_LABELS[d] || d}</option>
                              ))}
                            </optgroup>
                          )}
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

            {/* Counter chips */}
            {selectedCounters.map((c: any, i: number) => (
              <span key={c.counter_name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full" style={{backgroundColor: ['#10b981','#06b6d4','#f59e0b','#8b5cf6','#ec4899'][i%5]}} />
                {c.display_name || c.counter_name}
                {c.dimension_type && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600">{c.dimension_type}</span>}
                <button onClick={() => setSelectedCounters(selectedCounters.filter((x: any) => x.counter_name !== c.counter_name))} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}

            <button onClick={() => setCounterSelectorOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-500 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 transition-colors">
              <Plus className="w-3 h-3" /> Add Counter
            </button>
          </div>


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
                  granularity: '' as Granularity,
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
                  const cleanConfig = s.config ? { ...s.config, splitByPerKpi: {} } : s.config;
                  return { ...s, kpiIds: merged, splitBy: 'None', config: cleanConfig };
                }),
              }));
              onSlotClick?.(selectorOpen);
            }
            handleSelectorClose();
          }}
        />,
        document.body
      )}

      {/* Counter Selector Modal */}
      <CounterSelectorModal
        open={counterSelectorOpen}
        onClose={() => setCounterSelectorOpen(false)}
        catalog={counterCatalog}
        selectedKeys={selectedCounters.map((c: any) => c.counter_name)}
        onConfirm={(keys: string[]) => {
          const resolved = keys.map(k => counterCatalog.find((c: any) => c.counter_name === k)).filter(Boolean);
          setSelectedCounters(resolved);
        }}
      />
    </div>
  );
};

export default ControlPanel;
