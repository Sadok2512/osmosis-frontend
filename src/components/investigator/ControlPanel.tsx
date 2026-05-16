import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getDimensionColor } from './dimensionColors';
import { VENDOR_HSL, TECH_HSL, vendorHsl, techHsl } from '@/constants/brandColors';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { InvestigationState, Dimension, SplitOption, Granularity, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, JalonVisibility, KpiLevel, AdvancedTimeFrameConfig, AdvancedTimeFrameMode, AdvancedTimeFrameProfile } from './types';
import { formatDateTime } from './timeUtils';
import { KPIS as FALLBACK_KPIS, KPI_MAP } from './mockData';
import { fetchKpiDefinitions, fetchKpisWithData, fetchKpiDimensions, type KpiDimensionsResponse } from './investigatorApi';
import { usePerimeterScope, type PerimeterScope } from './usePerimeterScope';
import type { KpiDefinition } from './types';
import { Filter, Calendar as CalendarIcon, X, Plus, ChevronDown, Check, TrendingUp, AreaChart, BarChart, CircleDot, Settings2, Flag, Layers, Fingerprint, GitBranch, Sparkles, Edit2, Eye, EyeOff, ExternalLink, Clock3, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import DateRangePopover from '@/precision-architect/components/DateRangePopover';
import CounterSelectorModal from './CounterSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { fetchKpiCatalog, fetchFilterCatalog, type MonitorFilterDef } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';

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
  onActivateTab?: (tab: string | null) => void;
}

const SPLITS_FALLBACK: SplitOption[] = ['None', 'Site', 'Cell', 'Cluster_B', 'DOR', 'Vendor', 'Technology', 'Band', 'Zone ARCEP'];
const FILTER_DIMS_FALLBACK = ['Site', 'Cell', 'Vendor', 'Technology', 'Cluster_B'];
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
const ADVANCED_TIMEFRAME_STORAGE_KEY = 'osmosis_investigator_advanced_timeframe_profiles_v1';
const NONE_TIMEFRAME: AdvancedTimeFrameConfig = { mode: 'NONE' };
const ADVANCED_TIMEFRAME_MODES: { value: AdvancedTimeFrameMode; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'BUSY_HOURS', label: 'Busy Hours' },
  { value: 'CUSTOM_HOURS', label: 'Custom Hours' },
];

const normalizeTimeFrame = (value?: AdvancedTimeFrameConfig | null): AdvancedTimeFrameConfig => {
  if (!value || value.mode === 'NONE') {
    return value?.excludeWeekends ? { mode: 'NONE', excludeWeekends: true } : { mode: 'NONE' };
  }
  return {
    mode: value.mode,
    profileName: value.profileName,
    startHour: value.startHour || (value.mode === 'BUSY_HOURS' ? '08:00' : '09:00'),
    endHour: value.endHour || (value.mode === 'BUSY_HOURS' ? '20:00' : '18:00'),
    excludeWeekends: Boolean(value.excludeWeekends),
  };
};

const isAdvancedTimeFrameActive = (value?: AdvancedTimeFrameConfig | null) => {
  const tf = normalizeTimeFrame(value);
  return tf.mode !== 'NONE' || Boolean(tf.excludeWeekends);
};

const formatAdvancedTimeFrame = (value?: AdvancedTimeFrameConfig | null) => {
  const tf = normalizeTimeFrame(value);
  if (tf.mode === 'NONE') {
    return tf.excludeWeekends ? 'Advanced TimeFrame: None, Weekends excluded' : 'Advanced TimeFrame: None';
  }
  const modeLabel = tf.mode === 'BUSY_HOURS' ? 'Busy Hours' : 'Custom Hours';
  const name = tf.profileName || modeLabel;
  return `Advanced TimeFrame: ${name} ${tf.startHour}-${tf.endHour}${tf.excludeWeekends ? ', Weekends excluded' : ''}`;
};

const validateAdvancedTimeFrame = (value: AdvancedTimeFrameConfig, profiles: AdvancedTimeFrameProfile[], editingId?: string | null, requireName = true): string | null => {
  const tf = normalizeTimeFrame(value);
  const name = (tf.profileName || '').trim();
  if (requireName && !name) return 'Profile name is required.';
  if (name && profiles.some(p => p.profileName.trim().toLowerCase() === name.toLowerCase() && p.id !== editingId)) {
    return 'Profile name must be unique.';
  }
  if (tf.mode !== 'NONE') {
    if (!tf.startHour || !/^\d{2}:\d{2}$/.test(tf.startHour)) return 'Start hour is required in HH:mm format.';
    if (!tf.endHour || !/^\d{2}:\d{2}$/.test(tf.endHour)) return 'End hour is required in HH:mm format.';
    if (tf.endHour <= tf.startHour) return 'End hour must be after start hour.';
  }
  return null;
};
// Dimensions already handled by the Scope (Périmètre) popover — hide from filter row
const SCOPE_DIMENSIONS = new Set(['Vendor', 'Technology']);


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

// Filter values fetched from backend — now uses centralized cache
import { ensureFilterLoaded, getFilterValues, dimToKey, isPmDimension, subscribe as subscribeCacheUpdates, type FilterContext } from '@/stores/investigatorFilterCache';

/**
 * Map a UI dimension label to the backend dim code used in cascading
 * context. Mirrors the legacy dim_map on the server (PLAQUE/SITE/CELL…)
 * so the WHERE clause resolves on every source.
 */
const dimToBackendCode = (dim: string): string => {
  const m: Record<string, string> = {
    Cell: 'CELL', Site: 'SITE', Vendor: 'VENDOR', Technology: 'TECHNO', RAT: 'TECHNO',
    Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'PLAQUE', Cluster: 'PLAQUE', Cluster_B: 'CLUSTER',
    constructeur: 'VENDOR', Constructeur: 'VENDOR', techno: 'TECHNO', Techno: 'TECHNO',
  };
  return m[dim] || dim.toUpperCase();
};

/**
 * Build a stable cascading context from the active filters, excluding `selfDim`.
 * Empty (no upstream constraints) → returns undefined so the cache key collapses
 * to the unfiltered baseline.
 */
const buildCascadeContext = (active: Record<string, string[]>, selfDim: string): FilterContext | undefined => {
  const ctx: FilterContext = {};
  for (const [k, v] of Object.entries(active)) {
    if (k === selfDim) continue;
    if (!v || !v.length) continue;
    const code = dimToBackendCode(k);
    if (!code || code === dimToBackendCode(selfDim)) continue;
    ctx[code] = v;
  }
  return Object.keys(ctx).length ? ctx : undefined;
};

const useBackendFilterValues = (dimension: string, ctx?: FilterContext): { values: string[]; labels: Record<string, string> } => {
  const key = isPmDimension(dimension) ? dimension : dimToKey(dimension);
  // Stable string of the context for dependency tracking
  const ctxStr = React.useMemo(() => {
    if (!ctx) return '';
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(ctx)
          .filter(([_, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
          .sort(([a], [b]) => a.localeCompare(b))
      )
    );
  }, [ctx]);

  const [result, setResult] = React.useState<{ values: string[]; labels: Record<string, string> }>(() => {
    const e = getFilterValues(key, ctx);
    return { values: e.values, labels: e.labels || {} };
  });

  React.useEffect(() => {
    ensureFilterLoaded(key, ctx);
    const unsub = subscribeCacheUpdates(() => {
      const entry = getFilterValues(key, ctx);
      if (entry.loaded) setResult({ values: entry.values, labels: entry.labels || {} });
    });
    const entry = getFilterValues(key, ctx);
    if (entry.loaded) setResult({ values: entry.values, labels: entry.labels || {} });
    return unsub;
  }, [key, ctxStr]);

  return result;
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
  filterCategories?: Record<string, string>;
  filterRats?: Record<string, string>;
  activeTechnos?: string[];
}> = ({ existingKeys, onAdd, filterDimensions, filterCategories, filterRats, activeTechnos }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  // Hide tech-specific dimensions when user has not selected the matching
  // techno. e.g., if activeTechnos=['4G'], the 3G/UMTS dimensions (RNCID,
  // UTRAN-CI, …) and 5G/NR dimensions (NCI, PCI NR, …) are hidden. ALL
  // and unspecified rats stay visible. If the operator hasn't picked a
  // techno yet, every dimension is visible (operator decides).
  const technoSet = new Set((activeTechnos ?? []).map(t => t.toUpperCase()));
  const technoActive = technoSet.size > 0;

  const matchTechno = (d: string): boolean => {
    if (!technoActive) return true;
    const rat = filterRats?.[d];
    if (!rat || rat === 'ALL') return true;
    return technoSet.has(rat.toUpperCase());
  };

  const available = filterDimensions
    .filter(d => !existingKeys.includes(d))
    .filter(matchTechno);
  const filtered = search
    ? available.filter(d => {
        const label = PM_DIMENSION_TYPES.has(d) ? (PM_DIMENSION_LABELS[d] || d) : d;
        return label.toLowerCase().includes(search.toLowerCase());
      })
    : available;

  // Group by category (from backend dimension_definitions.category). Falls
  // back to "Other" when the metadata is absent (e.g. probe-fallback path).
  // Category order mirrors what the operator expects: Geographic /
  // Identifiers / Radio / Admin / general — derived from the data, not
  // hardcoded; uses the order of first appearance in `filtered`.
  const grouped = (() => {
    const cats: Record<string, string[]> = {};
    const order: string[] = [];
    for (const d of filtered) {
      const cat = filterCategories?.[d] || 'Other';
      if (!cats[cat]) {
        cats[cat] = [];
        order.push(cat);
      }
      cats[cat].push(d);
    }
    return order.map(cat => ({ category: cat, items: cats[cat] }));
  })();

  const toggle = (dim: string) => {
    setSelected(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);
  };

  const handleConfirm = () => {
    selected.forEach(dim => onAdd(dim));
    setSelected([]);
    setSearch('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(''); setSelected([]); } }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors">
          <Plus className="w-3 h-3" /> Ajouter filtre
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 rounded-xl border border-border/60 shadow-xl bg-card" align="start" sideOffset={6}>
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-border/40">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Sélectionner — Dimensions
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-border/50 bg-muted/20 text-xs outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Selection count */}
        {selected.length > 0 && (
          <div className="px-4 py-1.5 text-[10px] font-semibold text-primary border-b border-border/20">
            {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
          </div>
        )}

        {/* List grouped by category (driven by backend
            dimension_definitions.category — see osmosis-parser
            app/api/v1/endpoints/dimensions.py). The operator now sees
            Geographic / Identifiers / Radio / Admin headers instead of
            a flat 48-item list. */}
        <div className="max-h-[260px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-[10px] text-muted-foreground text-center">
              {available.length === 0 ? 'Tous les filtres sont déjà ajoutés' : 'Aucun résultat'}
            </div>
          )}
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <div className="px-4 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 bg-muted/20 sticky top-0 z-10">
                {category}
              </div>
              {items.map(dim => {
            const isPm = PM_DIMENSION_TYPES.has(dim);
            const label = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;
            const isChecked = selected.includes(dim);
            return (
              <button
                key={dim}
                onClick={() => toggle(dim)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-xs font-medium transition-all flex items-center gap-3",
                  isChecked ? "text-primary" : "text-foreground",
                  "hover:bg-muted/40"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  isChecked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background"
                )}>
                  {isChecked && <Check className="w-3 h-3" />}
                </span>
                <span className={cn("flex-1", isChecked && "font-bold")}>{label}</span>
                {isPm && (
                  <span className={cn("text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded", getDimensionColor(dim).bg, getDimensionColor(dim).text, getDimensionColor(dim).textDark)}>PM</span>
                )}
              </button>
            );
          })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/20 rounded-b-xl">
          <button
            onClick={() => setSelected([])}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all",
              selected.length > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Check className="w-3 h-3" /> Confirm
          </button>
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
  siteFilter?: string;
  /** Perimeter-derived allow-set. When provided, backendValues are intersected with it. */
  scopeAllowed?: Set<string> | null;
  /** Cascading context: upstream filters that should narrow the candidate values. */
  cascadeContext?: FilterContext;
}> = ({ dim, values, onToggleValue, onClear, onRemove, siteFilter, scopeAllowed, cascadeContext }) => {
  const [open, setOpen] = useState(false);
  const { values: backendValues, labels: labelMap } = useBackendFilterValues(dim, cascadeContext);
  const [search, setSearch] = useState('');
  const [pendingValues, setPendingValues] = useState<string[]>([]);
  const [liveSearchResults, setLiveSearchResults] = useState<string[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const liveSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPm = PM_DIMENSION_TYPES.has(dim);
  const label = isPm ? (PM_DIMENSION_LABELS[dim] || dim) : dim;
  const isSearchableDim = dim === 'Site' || dim === 'Cell';

  // Helper: display label for a value (e.g. "PMQAP=9" → "QCI 9: Default Bearer")
  const displayLabel = (val: string) => labelMap[val] || val;

  // Sync pending with actual values when opening
  useEffect(() => {
    if (open) setPendingValues([...values]);
  }, [open]);

  // Apply perimeter scope: when the scope provides an allow-set, keep only values
  // that are part of it (e.g. SITE list restricted to Ericsson+4G). `null` means
  // no scope is active so we pass backendValues through unchanged.
  // If the intersection is empty but scopeAllowed has entries (e.g. Huawei Tunisia
  // sites exist in topo but not yet in PM filter-values), fall back to scopeAllowed.
  const scopedValues = useMemo(() => {
    if (!scopeAllowed || scopeAllowed.size === 0) return backendValues;
    const intersected = backendValues.filter(v => scopeAllowed.has(v));
    if (intersected.length > 0) return intersected;
    return Array.from(scopeAllowed).sort();
  }, [backendValues, scopeAllowed]);

  const filtered = search
    ? scopedValues.filter(v => {
        const q = search.toLowerCase();
        return v.toLowerCase().includes(q) || (labelMap[v] || '').toLowerCase().includes(q);
      })
    : scopedValues;

  // Live VPS search for Site/Cell when local results are empty
  useEffect(() => {
    if (!isSearchableDim || !search || search.length < 2 || filtered.length > 0) {
      setLiveSearchResults([]);
      setLiveSearching(false);
      return;
    }
    if (liveSearchTimer.current) clearTimeout(liveSearchTimer.current);
    liveSearchTimer.current = setTimeout(async () => {
      setLiveSearching(true);
      try {
        const endpoint = dim === 'Site' ? '/api/v1/topo/sites' : '/api/v1/topo/cells';
        const { getVpsProxyUrl, getVpsProxyHeaders } = await import('@/lib/apiConfig');
        const url = getVpsProxyUrl('parser', endpoint, { search, limit: '50' });
        const res = await fetch(url, { headers: getVpsProxyHeaders() });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.sites || data?.cells || []);
          const names = list
            .map((s: any) => s.site_name || s.nom_site || s.cell_name || s.nom_cellule || '')
            .filter(Boolean);
          // Deduplicate
          setLiveSearchResults([...new Set<string>(names)].sort());
        }
      } catch { /* silent */ }
      setLiveSearching(false);
    }, 400);
    return () => { if (liveSearchTimer.current) clearTimeout(liveSearchTimer.current); };
  }, [search, filtered.length, isSearchableDim, dim]);

  // Merge local filtered + live results (live results fill the gap when local is empty)
  const displayValues = filtered.length > 0 ? filtered : liveSearchResults;

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted) return;
    const items = pasted.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (items.length > 1) {
      e.preventDefault();
      const next = [...pendingValues];
      items.forEach(item => {
        const match = scopedValues.find(v => v.toLowerCase() === item.toLowerCase());
        if (match && !next.includes(match)) next.push(match);
      });
      setPendingValues(next);
    }
  };

  const togglePending = (val: string) => {
    setPendingValues(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const handleConfirm = () => {
    // Apply pending selections
    const toAdd = pendingValues.filter(v => !values.includes(v));
    const toRemove = values.filter(v => !pendingValues.includes(v));
    toRemove.forEach(v => onToggleValue(v));
    toAdd.forEach(v => onToggleValue(v));
    setOpen(false);
    setSearch('');
  };

  const handleReset = () => {
    setPendingValues([]);
  };

  const displayText = values.length === 0
    ? 'Tous'
    : values.length === 1
      ? displayLabel(values[0])
      : `${values.length} sélectionnés`;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={(v) => { if (!v) { setSearch(''); } setOpen(v); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-l-lg text-[10px] font-semibold border border-r-0 transition-all cursor-pointer",
              values.length > 0
                ? `${getDimensionColor(dim).bgActive} ${getDimensionColor(dim).textActive} ${getDimensionColor(dim).textDark} ${getDimensionColor(dim).border}`
                : `${getDimensionColor(dim).bg} ${getDimensionColor(dim).text} ${getDimensionColor(dim).border}`
            )}
          >
            <span className="text-muted-foreground font-normal">{label}:</span>
            <span className="font-bold truncate max-w-[120px]">{displayText}</span>
            <ChevronDown className={cn("w-3 h-3 opacity-50 transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 rounded-xl shadow-xl border border-border/60 overflow-hidden" align="start" sideOffset={4}>
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border/30 bg-muted/30">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Sélectionner — {label}
            </h4>
          </div>

          {/* Search */}
          <div className="p-2.5">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onPaste={handlePaste}
                placeholder="Rechercher..."
                className="w-full pl-7 pr-3 py-2 rounded-full border border-border/50 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-all"
                autoFocus
              />
            </div>
          </div>

          {/* Selection count */}
          {pendingValues.length > 0 && (
            <div className="px-3 pb-1.5 flex items-center justify-between">
              <span className="text-[9px] text-primary font-semibold">{pendingValues.length} sélectionné(s)</span>
            </div>
          )}

          {/* Values list */}
          <div className="max-h-[240px] overflow-y-auto px-2 pb-1">
            {backendValues.length === 0 && !liveSearching && liveSearchResults.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-muted-foreground animate-pulse text-center">Chargement...</div>
            ) : liveSearching ? (
              <div className="px-3 py-4 text-[10px] text-muted-foreground animate-pulse text-center">Recherche VPS...</div>
            ) : displayValues.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-muted-foreground text-center">Aucun résultat pour "{search}"</div>
            ) : (
              <>
                {filtered.length === 0 && liveSearchResults.length > 0 && (
                  <div className="px-3 py-1 text-[9px] text-primary font-semibold mb-1">🔍 Résultats VPS</div>
                )}
                {displayValues.slice(0, 100).map(val => {
                  const isSelected = pendingValues.includes(val);
                  return (
                    <button
                      key={val}
                      onClick={() => togglePending(val)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all",
                        isSelected ? "bg-primary/8 text-primary" : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                        isSelected ? "bg-primary border-primary" : "border-border/60"
                      )}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{displayLabel(val)}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer with Reset / Confirm */}
          <div className="px-3 py-2.5 border-t border-border/30 bg-muted/20 flex items-center justify-between gap-2">
            <span className="text-[9px] text-muted-foreground">
              {displayValues.length > 100 ? `${displayValues.length} éléments` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Confirm
              </button>
            </div>
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
const VISIBILITY_OPTIONS: { value: JalonVisibility; label: string }[] = [
  { value: 'all', label: 'Tout le monde' },
  { value: 'team', label: 'Équipe' },
  { value: 'personal', label: 'Personnel' },
];

/* ── Jalons Manager Popup ──
 * Form draft state is lifted out of this component (via props) so closing the
 * popover (e.g. by clicking outside) preserves the user's in-progress entry.
 */
type JalonDraft = {
  showForm: boolean;
  label: string;
  startDate: string;
  endDate: string;
  color: string;
  opacity: number;
  visibility: JalonVisibility;
  endDateTouched: boolean;
};

const EMPTY_JALON_DRAFT: JalonDraft = {
  showForm: false,
  label: '',
  startDate: '',
  endDate: '',
  color: JALON_COLORS[0],
  opacity: 80,
  visibility: 'all',
  endDateTouched: false,
};

const JalonsManagerPopup: React.FC<{
  jalons: Jalon[];
  onUpdate: (jalons: Jalon[]) => void;
  draft: JalonDraft;
  setDraft: React.Dispatch<React.SetStateAction<JalonDraft>>;
}> = ({ jalons, onUpdate, draft, setDraft }) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  const { showForm, label, startDate, endDate, color, opacity, visibility, endDateTouched } = draft;
  const setShowForm = (v: boolean) => setDraft(d => ({ ...d, showForm: v }));
  const setLabel = (v: string) => setDraft(d => ({ ...d, label: v }));
  const setStartDate = (v: string) => setDraft(d => ({ ...d, startDate: v }));
  const setEndDate = (v: string) => setDraft(d => ({ ...d, endDate: v }));
  const setColor = (v: string) => setDraft(d => ({ ...d, color: v }));
  const setOpacity = (v: number) => setDraft(d => ({ ...d, opacity: v }));
  const setVisibility = (v: JalonVisibility) => setDraft(d => ({ ...d, visibility: v }));
  const setEndDateTouched = (v: boolean) => setDraft(d => ({ ...d, endDateTouched: v }));

  useEffect(() => {
    if (!endDateTouched && startDate && !endDate) {
      setDraft(d => ({ ...d, endDate: startDate }));
    }
  }, [startDate, endDateTouched, endDate, setDraft]);

  const resetForm = () => setDraft({ ...EMPTY_JALON_DRAFT });

  const handleAdd = () => {
    if (!startDate) {
      toast.error('Veuillez sélectionner une date de début pour le jalon.');
      return;
    }
    const finalLabel = label.trim() || `Jalon ${jalons.length + 1}`;
    const newJ: Jalon = {
      id: `jalon-${Date.now()}`,
      date: startDate,
      endDate: endDate || startDate,
      label: finalLabel,
      color,
      opacity: opacity / 100,
      visibility,
    };
    onUpdate([...jalons, newJ]);
    resetForm();
  };

  const updateJalon = (id: string, patch: Partial<Jalon>) => {
    onUpdate(jalons.map(j => j.id === id ? { ...j, ...patch } : j));
  };

  const removeJalon = (id: string) => {
    onUpdate(jalons.filter(j => j.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const fmtDt = (dt: string) => dt?.replace('T', ' ').slice(0, 16) || '';

  return (
    <div className="space-y-2">
      {/* List of existing jalons */}
      {jalons.length > 0 && (
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {jalons.map(j => {
            const isEditing = editingId === j.id;
            return (
              <div key={j.id} className={cn("rounded-lg border transition-all", isEditing ? "border-primary/40 bg-primary/5 p-2" : "border-border/30 bg-card p-1.5")}>
                {isEditing ? (
                  /* ── Inline edit form ── */
                  <div className="space-y-1.5">
                    <input value={j.label} onChange={e => updateJalon(j.id, { label: e.target.value })}
                      className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
                    <div className="flex justify-center">
                      <DateRangePopover
                        from={j.date}
                        to={j.endDate || j.date}
                        onChange={(from, to) => updateJalon(j.id, { date: from, endDate: to })}
                        showTime
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-muted-foreground uppercase shrink-0">Opacité</span>
                      <Slider value={[Math.round((j.opacity ?? 0.8) * 100)]} min={10} max={100} step={5}
                        onValueChange={([v]) => updateJalon(j.id, { opacity: v / 100 })}
                        className="flex-1" />
                      <span className="text-[9px] text-muted-foreground w-6 text-right">{Math.round((j.opacity ?? 0.8) * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {JALON_COLORS.map(c => (
                        <button key={c} onClick={() => updateJalon(j.id, { color: c })}
                          className={cn('w-4 h-4 rounded-full border-2 transition-all', j.color === c ? 'border-foreground scale-110' : 'border-transparent')}
                          style={{ backgroundColor: c }} />
                      ))}
                      <Button size="sm" variant="ghost" className="h-5 text-[9px] px-2 ml-auto" onClick={() => setEditingId(null)}>
                        <Check className="w-3 h-3 mr-0.5" /> OK
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Compact row ── */
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: j.color, opacity: j.opacity ?? 0.8 }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium text-foreground truncate block">{j.label}</span>
                      <span className="text-[8px] text-muted-foreground">{fmtDt(j.date)}{j.endDate && j.endDate !== j.date ? ` → ${fmtDt(j.endDate)}` : ''}</span>
                    </div>
                    <button onClick={() => setEditingId(j.id)} className="text-muted-foreground hover:text-primary shrink-0"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => removeJalon(j.id)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {jalons.length === 0 && !showForm && (
        <div className="text-[10px] text-muted-foreground/50 text-center py-3 italic">Aucun jalon créé</div>
      )}

      {/* Add new form */}
      {showForm ? (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2 space-y-1.5">
          <div className="text-[9px] font-bold text-primary uppercase tracking-wider">Nouveau jalon</div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom du jalon..."
            className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
          <div className="flex justify-center">
            <DateRangePopover
              from={startDate}
              to={endDate || startDate}
              onChange={(from, to) => {
                setStartDate(from);
                setEndDate(to);
                setEndDateTouched(true);
              }}
              showTime
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-muted-foreground uppercase shrink-0">Opacité</span>
            <Slider value={[opacity]} min={10} max={100} step={5} onValueChange={([v]) => setOpacity(v)} className="flex-1" />
            <span className="text-[9px] text-muted-foreground w-6 text-right">{opacity}%</span>
          </div>
          <div className="flex items-center gap-1">
            {JALON_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={cn('w-4 h-4 rounded-full border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
                style={{ backgroundColor: c }} />
            ))}
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-5 text-[9px] px-2" onClick={() => { resetForm(); }}>Effacer</Button>
              <Button
                size="sm"
                className="h-5 text-[9px] px-2"
                onClick={handleAdd}
                disabled={!startDate}
                title={!startDate ? 'Sélectionnez une date de début' : 'Ajouter le jalon'}
              >
                <Plus className="w-3 h-3 mr-0.5" /> Ajouter
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors">
          <Plus className="w-3 h-3" /> Ajouter un jalon
        </button>
      )}
    </div>
  );
};

/* ── Quick Scope Filter Popover (Vendor + Tech in one button) ── */
const VENDOR_COLORS = VENDOR_HSL;
const TECH_COLORS = TECH_HSL;

const ScopeFilterPopover: React.FC<{
  filters: Record<string, string[]>;
  onToggle: (dim: string, val: string) => void;
  onClear: (dim: string) => void;
}> = ({ filters, onToggle, onClear }) => {
  const { values: vendorValues } = useBackendFilterValues('Vendor');
  const { values: techValues } = useBackendFilterValues('Technology');
  const vendorSelected = filters['Vendor'] || [];
  const techSelected = filters['Technology'] || [];
  const totalActive = vendorSelected.length + techSelected.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 text-[11px] gap-1.5 px-3 rounded-lg bg-card max-w-[300px]">
          <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
          {totalActive === 0 ? (
            <span>Périmètre</span>
          ) : (
            <span className="flex items-center gap-1 truncate">
              <span className="shrink-0">Périmètre</span>
              {vendorSelected.map(v => (
                <span key={v} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: vendorHsl(v) }}>
                  {v}
                </span>
              ))}
              {techSelected.map(v => (
                <span key={v} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: TECH_COLORS[v.toUpperCase()] || 'hsl(var(--primary))' }}>
                  {v}
                </span>
              ))}
            </span>
          )}
          {totalActive > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold shrink-0">{totalActive}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="px-4 pt-4 pb-2">
          <div className="text-sm font-semibold text-foreground">Filtres de périmètre</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sélectionnez les critères pour affiner l'analyse</p>
        </div>
        <div className="px-4 pb-4 space-y-4">
          {/* Vendor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vendor</span>
              {vendorSelected.length > 0 && (
                <button onClick={() => onClear('Vendor')} className="text-[9px] text-muted-foreground hover:text-destructive transition-colors">Effacer</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vendorValues.map(val => {
                const isActive = vendorSelected.includes(val);
                const accent = vendorHsl(val);
                return (
                  <button
                    key={val}
                    onClick={() => onToggle('Vendor', val)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
                      isActive
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-foreground border-border bg-card hover:bg-accent/50'
                    )}
                    style={isActive ? { backgroundColor: accent, borderColor: accent } : undefined}
                  >
                    {val}
                  </button>
                );
              })}
              {vendorValues.length === 0 && <span className="text-[10px] text-muted-foreground italic">Chargement...</span>}
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Technology */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Technologie</span>
              {techSelected.length > 0 && (
                <button onClick={() => onClear('Technology')} className="text-[9px] text-muted-foreground hover:text-destructive transition-colors">Effacer</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {techValues.map(val => {
                const isActive = techSelected.includes(val);
                const accent = techHsl(val);
                return (
                  <button
                    key={val}
                    onClick={() => onToggle('Technology', val)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
                      isActive
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-foreground border-border bg-card hover:bg-accent/50'
                    )}
                    style={isActive ? { backgroundColor: accent, borderColor: accent } : undefined}
                  >
                    {val}
                  </button>
                );
              })}
              {techValues.length === 0 && <span className="text-[10px] text-muted-foreground italic">Chargement...</span>}
            </div>
          </div>
        </div>

        {/* Active summary */}
        {totalActive > 0 && (
          <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-1.5 flex-wrap">
              {vendorSelected.map(v => (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: vendorHsl(v) }}>
                  {v}
                  <button onClick={() => onToggle('Vendor', v)} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
              {techSelected.map(v => (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: TECH_COLORS[v.toUpperCase()] || 'hsl(var(--primary))' }}>
                  {v}
                  <button onClick={() => onToggle('Technology', v)} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
            <button
              onClick={() => { onClear('Vendor'); onClear('Technology'); }}
              className="text-[9px] text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
            >
              Tout effacer
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ── Main Control Panel ── */
const ControlPanel: React.FC<Props> = ({ state, setState, onApply, externalSelectorSlot, onExternalSelectorClose, activeSlotId, onSlotClick, isApplying, showAIPanel, onToggleAIPanel, selectedCounters: externalSelectedCounters, onSelectedCountersChange, onActivateTab }) => {
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>([]);
  const [kpiDefs, setKpiDefs] = useState<KpiDefinition[]>(FALLBACK_KPIS);
  const [selectorOpen, setSelectorOpen] = useState<string | null>(null);
  const [counterSelectorOpen, setCounterSelectorOpen] = useState(false);
  const [counterCatalog, setCounterCatalog] = useState<any[]>([]);
  const selectedCounters = externalSelectedCounters || [];
  const setSelectedCounters = (counters: any[]) => onSelectedCountersChange?.(counters);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [filterDimensions, setFilterDimensions] = useState<string[]>(FILTER_DIMS_FALLBACK);
  // Map display_name → category, populated from /api/v1/dimensions
  // (dimension_definitions.category). Drives the section headers in the
  // AddFilterDropdown so the operator sees template-section groups instead
  // of a flat list.
  const [filterCategories, setFilterCategories] = useState<Record<string, string>>({});
  // Map display_name → rat (4G / 5G / 3G / 2G / ALL). Drives techno-aware
  // hiding in the picker: if the user did not select a given techno,
  // dimensions whose rat is technology-specific are hidden. ALL stays.
  const [filterRats, setFilterRats] = useState<Record<string, string>>({});
  const [kpisWithData, setKpisWithData] = useState<Set<string> | null>(null);
  const [pmDimValues, setPmDimValues] = useState<{ value: string; label: string }[]>([]);
  const [pmDimLoading, setPmDimLoading] = useState(false);
  // Real data-driven map: kpi_code → { dimensions, available_dimensions } fetched from CH probe.
  const [kpiDimData, setKpiDimData] = useState<Map<string, KpiDimensionsResponse>>(new Map());
  // Jalon form draft — lifted here so it survives popover open/close (outside-click preserves entry)
  const [jalonDraft, setJalonDraft] = useState<JalonDraft>({ ...EMPTY_JALON_DRAFT });
  const [openKpiSplitPopoverId, setOpenKpiSplitPopoverId] = useState<string | null>(null);
  const [kpiSplitDrafts, setKpiSplitDrafts] = useState<Record<string, string>>({});

  // Load split and filter dimensions from backend catalog
  useEffect(() => {
    fetchFilterCatalog().then(filters => {
      if (filters && filters.length > 0) {
        // Split-by: only aggregatable dimensions
        const splits = filters
          .filter((f: any) => f.is_active !== false && f.is_aggregatable)
          .map((f: any) => ({ key: f.dimension_key, label: f.display_name }));
        // Always include Cluster_B as a split option (user's saved cluster).
        // Removed the legacy 'CLUSTER' virtual dimension — it duplicated
        // PLAQUE confusingly. Cluster_B = explicit named selection.
        if (!splits.find(s => s.key === 'CLUSTER_B')) splits.push({ key: 'CLUSTER_B', label: 'Cluster_B' });
        if (splits.length > 0) setSplitOptions(splits);
        else setSplitOptions(SPLITS_FALLBACK.filter(s => s !== 'None').map(s => ({ key: s, label: s })));

        // Filter dimensions: only filterable. Keep category for grouped UI.
        const filterableEntries = filters
          .filter((f: any) => f.is_active !== false && f.is_filterable);
        const dims = filterableEntries.map((f: any) => f.display_name);
        const cats: Record<string, string> = {};
        const rats: Record<string, string> = {};
        for (const f of filterableEntries) {
          if (f.display_name && f.category) cats[f.display_name] = f.category;
          if (f.display_name && f.rat) rats[f.display_name] = f.rat;
        }
        // Always include Cluster_B (the user's saved/customized cluster
        // from network_filters). The legacy "Cluster" virtual dimension was
        // removed because it duplicated PLAQUE semantically while pointing
        // at a different data source — operator confusion. Cluster_B is
        // unambiguous: a named selection of cells the user created.
        if (!dims.includes('Cluster_B')) {
          dims.push('Cluster_B');
          cats['Cluster_B'] = 'Operations';
        }
        if (dims.length > 0) {
          setFilterDimensions(dims);
          setFilterCategories(cats);
          setFilterRats(rats);
        }
      } else {
        throw new Error('empty catalog');
      }
    }).catch(() => {
      setSplitOptions(SPLITS_FALLBACK.filter(s => s !== 'None').map(s => ({ key: s, label: s })));
      // Fallback: probe Parser for available filter dimensions
      const dimProbes = [
        { key: 'Site', param: 'SITE' },
        { key: 'Cell', param: 'CELL' },
        { key: 'Vendor', param: 'VENDOR' },
        { key: 'Technology', param: 'TECHNO' },
        { key: 'Band', param: 'BAND' },
        { key: 'DOR', param: 'DOR' },
        { key: 'Cluster_B', param: 'CLUSTER_B' },
        { key: 'Zone ARCEP', param: 'ARCEP' },
      ];
      Promise.allSettled(
        dimProbes.map(d =>
          fetchVpsWithRetry(getApiUrl(`pm/counters/filter-values?dimension=${d.param}&limit=1`), { headers: getApiHeaders() })
            .then(r => r.ok ? r.json() : { values: [] })
            .then(data => ({ key: d.key, hasData: (data.values?.length || 0) > 0 }))
        )
      ).then(results => {
        const available = results
          .filter(r => r.status === 'fulfilled' && (r as any).value.hasData)
          .map(r => (r as any).value.key as string);
        // Cluster_B is always available (resolved from saved network_filters,
        // not PM). The legacy 'Cluster' virtual dim was removed.
        if (!available.includes('Cluster_B')) available.push('Cluster_B');
        if (available.length > 0) setFilterDimensions(available);
      });
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
    let alive = true;
    const mapCatalog = (data: any) => {
      const items = Array.isArray(data) ? data : (data as any)?.kpis || (data as any)?.items || [];
      if (items.length > 0 && alive) {
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
          // 2026-05-09 — preserve canonical name + raw formulas so the
          // Investigator's KpiSelectorModal groups multivendor variants
          // under kpi_code_normalized AND populates the formula popover.
          // Without these the modal falls back to verbose Vendor__&_*
          // names even though groupMode is on by default.
          kpi_code_normalized: k.kpi_code_normalized || '',
          numerator: k.numerator ?? k.numerateur ?? '',
          denominator: k.denominator ?? k.denominateur ?? '',
        }));
        setCatalog(mapped);
      }
    };
    const load = (attempt: number) => {
      fetchKpiCatalog().then(mapCatalog).catch(err => {
        console.error(`[ControlPanel] fetchKpiCatalog failed (attempt ${attempt}):`, err);
        if (attempt < 3 && alive) setTimeout(() => load(attempt + 1), 2000 * attempt);
      });
    };
    load(1);
    fetchKpiDefinitions().then(k => { if (k.length > 0 && alive) setKpiDefs(k); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Load counter catalog for counter selector
  useEffect(() => {
    fetchVpsWithRetry(getApiUrl('pm/counters/catalog?limit=25000'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : []).then(d => setCounterCatalog(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Sync selectedCounters from active slot's counterIds when switching slots
  useEffect(() => {
    if (!counterCatalog.length) return;
    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    const slotCounterIds = slot?.counterIds || [];
    const currentNames = selectedCounters.map((c: any) => c.counter_name).sort().join(',');
    const slotNames = [...slotCounterIds].sort().join(',');
    if (currentNames !== slotNames) {
      const resolved = slotCounterIds.map(k => counterCatalog.find((c: any) => c.counter_name === k)).filter(Boolean);
      setSelectedCounters(resolved);
    }
  }, [activeSlotId, counterCatalog]);

  // Whenever the set of selected KPIs (or the Site filter) changes, ask the backend
  // which dimensions actually have rows in ClickHouse for those KPI's counters.
  // Result: only dimensions with > 0 rows are exposed in the filter row.
  const selectedKpiIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const slot of state.graphSlots) ids.push(...slot.kpiIds);
    return Array.from(new Set(ids)).sort().join(',');
  }, [state.graphSlots]);

  // ── Per-slot filter isolation (moved early — consumed by hooks below) ──
  const effectiveFilters = useMemo(() => {
    if (!activeSlotId) return state.filters;
    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    return slot?.filters || {};
  }, [activeSlotId, state.graphSlots, state.filters]);

  const siteFilterForProbe = (effectiveFilters['Site'] || [])[0] || null;

  // KPI dimension probe — only triggered by handleApply via refreshKpiDimensions()
  // No auto-fetch on KPI selection or filter change.
  const refreshKpiDimensions = useCallback(() => {
    const kpiIds = selectedKpiIdsKey ? selectedKpiIdsKey.split(',').filter(Boolean) : [];
    if (kpiIds.length === 0) { setKpiDimData(new Map()); return; }
    Promise.all(kpiIds.map(id => fetchKpiDimensions(id, siteFilterForProbe))).then(results => {
      const next = new Map<string, KpiDimensionsResponse>();
      for (const r of results) {
        if (r && r.kpi_code) next.set(r.kpi_code, r);
      }
      setKpiDimData(next);
    });
  }, [selectedKpiIdsKey, siteFilterForProbe]);

  // Detect PM dimension types that ACTUALLY have data for the current selection.
  // Priority: backend CH probe (kpiDimData) → KPI definition metadata → counter catalog fallback.
  const activePmDimensions = useMemo(() => {
    const dims = new Set<string>();
    const hasKpis = state.graphSlots.some(s => s.kpiIds.length > 0);

    // 1) Primary source: data-driven probe via /monitor/catalog/kpi-dimensions
    if (kpiDimData.size > 0) {
      for (const [, info] of kpiDimData) {
        for (const d of info.available_dimensions || []) {
          if (PM_DIMENSION_TYPES.has(d)) dims.add(d);
        }
      }
      // Union of available dims across all selected KPIs — if any KPI has PMQAP, expose it.
      return dims;
    }

    // 2) Fallback: catalog metadata (can be wrong, used only while probe is loading)
    for (const slot of state.graphSlots) {
      for (const kpiId of slot.kpiIds) {
        const def = kpiDefs.find(k => k.id === kpiId);
        if (def?.dimension_type && PM_DIMENSION_TYPES.has(def.dimension_type)) {
          dims.add(def.dimension_type);
        }
      }
    }
    for (const c of selectedCounters) {
      if (c.dimension_type && PM_DIMENSION_TYPES.has(c.dimension_type)) {
        dims.add(c.dimension_type);
      }
    }
    if (dims.size === 0 && hasKpis && counterCatalog.length > 0) {
      for (const c of counterCatalog) {
        if (c.dimension_type && PM_DIMENSION_TYPES.has(c.dimension_type)) {
          dims.add(c.dimension_type);
        }
      }
    }
    return dims;
  }, [state.graphSlots, kpiDefs, selectedCounters, counterCatalog, kpiDimData]);

  // Per-KPI available-dimensions map, derived from the backend probe. Used to grey-out
  // dimensions that a particular KPI doesn't support.
  const kpiAvailableDimsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [kpi_code, info] of kpiDimData) {
      m.set(kpi_code, new Set(info.available_dimensions || []));
    }
    return m;
  }, [kpiDimData]);

  // Per-KPI dimension type map: kpi_id → dimension_type (or null).
  // Catalog (DB) is authoritative for dimension_type and is checked FIRST,
  // because legacy kpiDefs (FALLBACK_KPIS) often lacks the dimension_type field.
  const kpiDimensionMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const entry of catalog) {
      if (entry.dimension_type && PM_DIMENSION_TYPES.has(entry.dimension_type)) {
        m.set(entry.kpi_key, entry.dimension_type);
      }
    }
    for (const def of kpiDefs) {
      if (m.has(def.id)) continue;
      const dt = (def as any).dimension_type;
      m.set(def.id, (dt && PM_DIMENSION_TYPES.has(dt)) ? dt : null);
    }
    return m;
  }, [kpiDefs, catalog]);

  // Load PM dimension values based on selected KPIs' dimension types
  const primaryKpiDimType = useMemo(() => {
    if (activePmDimensions.size === 0) return null;
    return Array.from(activePmDimensions)[0];
  }, [activePmDimensions]);

  // Auto-remove PM dimension filters when KPIs are deselected (no auto-add — user must add manually)
  const prevPmDimsRef = useRef<Set<string>>(new Set());
  const pendingAxisRef = useRef<Record<string, 'left' | 'right'> | null>(null);
  useEffect(() => {
    const prev = prevPmDimsRef.current;
    const current = activePmDimensions;
    // Auto-remove PM dimensions that are no longer active (KPIs removed)
    for (const dim of prev) {
      if (!current.has(dim) && PM_DIMENSION_TYPES.has(dim)) {
        setState(s => {
          const nextGlobalFilters = { ...s.filters };
          delete nextGlobalFilters[dim];

          return {
            ...s,
            filters: nextGlobalFilters,
            graphSlots: s.graphSlots.map(slot => {
              if (!slot.filters?.[dim]) return slot;
              const nextSlotFilters = { ...slot.filters };
              delete nextSlotFilters[dim];
              return { ...slot, filters: nextSlotFilters };
            }),
          };
        });
      }
    }
    prevPmDimsRef.current = new Set(current);
  }, [activePmDimensions]);

  const currentSiteFilter = (effectiveFilters['Site'] || [])[0] || '';
  // PM dimension values and KPIs-with-data are refreshed only via Apply — no auto-fetch.

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

  // ── Perimeter scope ────────────────────────────────────────────────────
  // Vendor / Technology selected via the "Périmètre" popover drive client-side
  // filtering of the KPI catalog, counter catalog, Site list and Cell list.
  // See ./usePerimeterScope for the full derivation.
  const perimeter: PerimeterScope = usePerimeterScope(effectiveFilters);

  // KPI catalog filtered by perimeter. If the selected vendor has dedicated KPIs,
  // show only those. If no KPIs exist for that vendor (e.g. Huawei), show all KPIs
  // (they may still be applicable via universal formulas).
  const perimeterFilteredCatalog = useMemo(() => {
    if (!perimeter.hasScope) return catalog;
    const filtered = catalog.filter((entry: any) => perimeter.matchKpi({ vendor: entry.vendor, techno: entry.techno }));
    console.log(`[Perimeter KPI] catalog=${catalog.length} filtered=${filtered.length} vendorSet=${[...perimeter.vendorSet]} technoSet=${[...perimeter.technoSet]}`);
    // Fallback: if vendor filter yields 0 KPIs, the vendor has no dedicated KPIs
    // → show all KPIs (filter only by techno if set)
    if (filtered.length === 0 && perimeter.vendorSet.size > 0) {
      if (perimeter.technoSet.size > 0) {
        // Vendor has no dedicated KPIs — filter by techno only
        const techFiltered = catalog.filter((entry: any) =>
          perimeter.matchKpi({ vendor: null, techno: entry.techno })
        );
        console.log(`[Perimeter KPI] fallback techno-only: ${techFiltered.length}`);
        return techFiltered;
      }
      console.log(`[Perimeter KPI] fallback all: ${catalog.length}`);
      return catalog;
    }
    return filtered;
  }, [catalog, perimeter]);

  // Counter catalog filtered by perimeter — consumed by CounterSelectorModal
  // and by the dimension auto-detection logic that scans counter metadata.
  const perimeterFilteredCounters = useMemo(() => {
    if (!perimeter.hasScope) return counterCatalog;
    return counterCatalog.filter((c: any) => perimeter.matchCounter({ vendor: c.vendor, techno: c.techno }));
  }, [counterCatalog, perimeter]);

  // Sort catalog: KPIs with data first — now applied on top of the perimeter filter.
  const sortedCatalog = useMemo(() => {
    if (!kpisWithData || kpisWithData.size === 0) return perimeterFilteredCatalog;
    return [...perimeterFilteredCatalog].sort((a, b) => {
      const aHas = kpisWithData.has(a.kpi_key) ? 0 : 1;
      const bHas = kpisWithData.has(b.kpi_key) ? 0 : 1;
      return aHas - bHas;
    });
  }, [perimeterFilteredCatalog, kpisWithData]);

  const activeSlot = useMemo(
    () => state.graphSlots.find(s => s.id === activeSlotId) || null,
    [activeSlotId, state.graphSlots],
  );

  const currentStartDateRaw = (activeSlot?.startDate && activeSlot.startDate.trim()) || state.startDate;
  const currentEndDateRaw = (activeSlot?.endDate && activeSlot.endDate.trim()) || state.endDate;
  const currentGranularity = activeSlot?.granularity || state.granularity;
  const [granularityOpen, setGranularityOpen] = useState(false);
  const activeTimeFrame = normalizeTimeFrame(state.advancedTimeFrame);
  const [timeFrameOpen, setTimeFrameOpen] = useState(false);
  const [timeFrameProfiles, setTimeFrameProfiles] = useState<AdvancedTimeFrameProfile[]>(() => {
    try {
      const raw = window.localStorage.getItem(ADVANCED_TIMEFRAME_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((p: AdvancedTimeFrameProfile) => ({
        ...normalizeTimeFrame(p),
        id: p.id || crypto.randomUUID(),
        profileName: p.profileName,
      })).filter((p: AdvancedTimeFrameProfile) => p.profileName && p.mode !== 'NONE') : [];
    } catch {
      return [];
    }
  });
  const [timeFrameDraft, setTimeFrameDraft] = useState<AdvancedTimeFrameConfig>(activeTimeFrame);
  const [editingTimeFrameId, setEditingTimeFrameId] = useState<string | null>(null);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(ADVANCED_TIMEFRAME_STORAGE_KEY, JSON.stringify(timeFrameProfiles));
  }, [timeFrameProfiles]);

  useEffect(() => {
    if (!timeFrameOpen) {
      setTimeFrameDraft(activeTimeFrame);
      setEditingTimeFrameId(null);
      setTimeFrameError(null);
    }
  }, [activeTimeFrame, timeFrameOpen]);

  const applyAdvancedTimeFrame = (next: AdvancedTimeFrameConfig) => {
    const normalized = normalizeTimeFrame(next);
    if (normalized.mode !== 'NONE') {
      const validation = validateAdvancedTimeFrame(normalized, timeFrameProfiles, editingTimeFrameId, false);
      if (validation) {
        setTimeFrameError(validation);
        return;
      }
    }
    setState(prev => ({ ...prev, advancedTimeFrame: normalized }));
    setTimeFrameDraft(normalized);
    setTimeFrameOpen(false);
    setTimeFrameError(null);
  };

  const saveAdvancedTimeFrameProfile = () => {
    const normalized = normalizeTimeFrame(timeFrameDraft);
    const validation = validateAdvancedTimeFrame(normalized, timeFrameProfiles, editingTimeFrameId);
    if (validation) {
      setTimeFrameError(validation);
      return;
    }
    if (normalized.mode === 'NONE') {
      setTimeFrameError('None is a system option and cannot be saved.');
      return;
    }
    const profile: AdvancedTimeFrameProfile = {
      ...normalized,
      id: editingTimeFrameId || crypto.randomUUID(),
      profileName: normalized.profileName!.trim(),
    };
    setTimeFrameProfiles(prev => editingTimeFrameId ? prev.map(p => p.id === editingTimeFrameId ? profile : p) : [...prev, profile]);
    setState(prev => ({ ...prev, advancedTimeFrame: profile }));
    setEditingTimeFrameId(profile.id);
    setTimeFrameError(null);
    toast.success('Advanced TimeFrame profile saved.');
  };

  const selectAdvancedTimeFrameProfile = (profile: AdvancedTimeFrameProfile) => {
    setEditingTimeFrameId(profile.id);
    setTimeFrameDraft(profile);
    setState(prev => ({ ...prev, advancedTimeFrame: profile }));
    setTimeFrameError(null);
  };

  const deleteAdvancedTimeFrameProfile = (profile: AdvancedTimeFrameProfile) => {
    setTimeFrameProfiles(prev => prev.filter(p => p.id !== profile.id));
    if (activeTimeFrame.profileName === profile.profileName) {
      setState(prev => ({ ...prev, advancedTimeFrame: NONE_TIMEFRAME }));
      setTimeFrameDraft(NONE_TIMEFRAME);
      setEditingTimeFrameId(null);
    }
  };

  const updateTemporalContext = (
    nextStart: string,
    nextEnd: string,
    nextGranularity: Granularity = currentGranularity,
  ) => (prev: any) => {
    if (!activeSlotId) {
      return {
        ...prev,
        startDate: nextStart,
        endDate: nextEnd,
        granularity: nextGranularity,
      };
    }

    return {
      ...prev,
      graphSlots: (prev.graphSlots || []).map((s: any) => (
        s.id === activeSlotId
          ? { ...s, startDate: nextStart, endDate: nextEnd, granularity: nextGranularity }
          : s
      )),
    };
  };

  const applyPeriod = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const ns = formatDateTime(start);
    const ne = formatDateTime(end);
    setState(updateTemporalContext(ns, ne));
  };

  // Parse dates as local (add T12:00 to avoid UTC midnight timezone shift)
  // Guard against invalid/corrupt persisted values
  const parseSafeDate = (raw: string | undefined | null): Date | undefined => {
    if (!raw || !raw.trim()) return undefined;
    const dateOnly = raw.split('T')[0]; // strip any existing time part
    const d = new Date(dateOnly + 'T12:00:00');
    return isNaN(d.getTime()) ? undefined : d;
  };
  const parseTime = (raw: string | undefined | null): string => {
    if (!raw) return '00:00';
    const tPart = raw.split('T')[1];
    if (!tPart) return '00:00';
    return tPart.slice(0, 5) || '00:00';
  };
  const startDate = parseSafeDate(currentStartDateRaw);
  const endDate = parseSafeDate(currentEndDateRaw);
  const startTime = parseTime(currentStartDateRaw);
  const endTime = parseTime(currentEndDateRaw);
  const showTimePickers = currentGranularity === '15min' || currentGranularity === '1h';

  const setStartTime = (time: string) => {
    /* setState(prev => {
      const dateOnly = (prev.startDate || '').split('T')[0];
      const fullStart = `${dateOnly}T${time}`;
      // If same day and new start > end time → push end to start
      const endDateOnly = (prev.endDate || '').split('T')[0];
      let nextEnd = prev.endDate;
      if (endDateOnly === dateOnly && prev.endDate && fullStart > prev.endDate) {
        nextEnd = fullStart;
        toast.info("Heure de fin ajustée pour rester ≥ début");
      }
      return propagateDatesToSlots(fullStart, nextEnd)(prev);
    });
  };
  const setEndTime = (time: string) => {
    setState(prev => {
      const dateOnly = (prev.endDate || '').split('T')[0];
      const fullEnd = `${dateOnly}T${time}`;
      const startDateOnly = (prev.startDate || '').split('T')[0];
      // Block end < start when same day
      if (startDateOnly === dateOnly && prev.startDate && fullEnd < prev.startDate) {
        toast.error("L'heure de fin doit être ≥ à l'heure de début");
        return prev;
      }
      return propagateDatesToSlots(prev.startDate, fullEnd)(prev);
    }); */
    const dateOnly = (currentStartDateRaw || '').split('T')[0];
    const fullStart = `${dateOnly}T${time}`;
    const endDateOnly = (currentEndDateRaw || '').split('T')[0];
    let nextEnd = currentEndDateRaw;
    if (endDateOnly === dateOnly && currentEndDateRaw && fullStart > currentEndDateRaw) {
      nextEnd = fullStart;
      toast.info("Heure de fin ajustée pour rester ≥ début");
    }
    setState(updateTemporalContext(fullStart, nextEnd));
  };
  const setEndTime = (time: string) => {
    const dateOnly = (currentEndDateRaw || '').split('T')[0];
    const fullEnd = `${dateOnly}T${time}`;
    const startDateOnly = (currentStartDateRaw || '').split('T')[0];
    if (startDateOnly === dateOnly && currentStartDateRaw && fullEnd < currentStartDateRaw) {
      toast.error("L'heure de fin doit être ≥ à l'heure de début");
      return;
    }
    setState(updateTemporalContext(currentStartDateRaw, fullEnd));
  };

  // Guarded apply: ensures end ≥ start before triggering backend fetch
  const handleApplyGuarded = useCallback(() => {
    const s = currentStartDateRaw;
    const e = currentEndDateRaw;
    if (s && e && e < s) {
      toast.error("La date de fin doit être supérieure ou égale à la date de début.");
      return;
    }
    onApply();
  }, [currentStartDateRaw, currentEndDateRaw, onApply]);

  const getKpiSplitDraftKey = useCallback((slotId: string, kpiId: string) => `${slotId}::${kpiId}`, []);

  const primeKpiSplitDraft = useCallback((slotId: string, kpiId: string, cfg: GraphConfig) => {
    const key = getKpiSplitDraftKey(slotId, kpiId);
    const currentValue = cfg.splitByPerKpi?.[kpiId] || 'None';
    setKpiSplitDrafts(prev => prev[key] === currentValue ? prev : { ...prev, [key]: currentValue });
  }, [getKpiSplitDraftKey]);

  const applyKpiSplitDraft = useCallback((slotId: string, kpiId: string, splitValue: string) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s => {
        if (s.id !== slotId) return s;
        const prevCfg = s.config || DEFAULT_GRAPH_CONFIG;
        const nextPerKpi = { ...(prevCfg.splitByPerKpi || {}) };
        const nextPerKpi2 = { ...(prevCfg.splitByPerKpi2 || {}) };

        s.kpiIds.forEach(id => {
          delete nextPerKpi[id];
          delete nextPerKpi2[id];
        });

        if (splitValue && splitValue !== 'None') {
          nextPerKpi[kpiId] = splitValue;
        }

        return {
          ...s,
          splitBy: 'None',
          splitBy2: 'None',
          config: {
            ...prevCfg,
            splitByPerKpi: nextPerKpi,
            splitByPerKpi2: nextPerKpi2,
          },
        };
      }),
    }));
  }, [setState]);

  // (effectiveFilters memo is declared earlier, before siteFilterForProbe)

  /** Helper: update filters on the active slot (or global if no slot) */
  const updateFilters = (updater: (filters: Record<string, string[]>) => Record<string, string[]>) => {
    setState(prev => {
      if (!activeSlotId) {
        // No active slot — update global filters (template for new slots)
        return { ...prev, filters: updater(prev.filters) };
      }
      // Update the active slot's filters
      return {
        ...prev,
        graphSlots: prev.graphSlots.map(s => {
          if (s.id !== activeSlotId) return s;
          return { ...s, filters: updater({ ...(s.filters || {}) }) };
        }),
      };
    });
  };

  const addFilterDimension = (dim: string) => {
    updateFilters(filters => {
      if (filters[dim]) return filters;
      return { ...filters, [dim]: [] };
    });
  };

  const toggleFilterValue = (dim: string, val: string) => {
    updateFilters(filters => {
      const existing = filters[dim] || [];
      const newVals = existing.includes(val)
        ? existing.filter(v => v !== val)
        : [...existing, val];
      return { ...filters, [dim]: newVals };
    });
  };

  const clearFilterValues = (dim: string) => {
    updateFilters(filters => ({ ...filters, [dim]: [] }));
  };

  const removeFilterDimension = (dim: string) => {
    updateFilters(filters => {
      const newFilters = { ...filters };
      delete newFilters[dim];
      return newFilters;
    });
  };

  const activeFilterDims = Object.keys(effectiveFilters);
  const openStandaloneExport = () => {
    try {
      const exportKey = `investigator-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = {
        version: 1,
        createdAt: Date.now(),
        activeSlotId,
        state,
      };
      window.localStorage.setItem(exportKey, JSON.stringify(payload));
      const url = `${window.location.origin}/investigator?standalone=1&exportKey=${encodeURIComponent(exportKey)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[Investigator] standalone export failed', err);
      toast.error("Impossible d'ouvrir l'export Investigator");
    }
  };

  return (
    <div className="sticky top-0 z-30" style={{ zoom: 1 }}>
      {/* ═══ LAYER 1: HEADER — Branding ═══ */}
      <div className="bg-card border-b border-border/60">
        <div className="w-[95%] mx-auto px-4 2xl:px-6 h-15 2xl:h-[4.375rem] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Settings2 className="w-5.5 h-5.5 text-primary" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm 2xl:text-base font-bold text-foreground tracking-tight">OSMOSIS Investigator</h1>
              <p className="text-[11px] 2xl:text-xs text-muted-foreground font-medium tracking-wide">KPI Investigation & Root Cause Analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openStandaloneExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
              title="Ouvrir uniquement l'Investigator en plein écran (sans sidebar) dans un nouvel onglet"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              EXPORT
            </button>
          </div>
        </div>
      </div>

      {/* ═══ LAYER 2: TOOLBAR — Actions & Date Controls ═══ */}
      <div className="bg-secondary/50 border-b border-border/50">
        <div className="w-[95%] mx-auto px-4 2xl:px-6 py-1.5 2xl:py-2">
          <div className="flex items-center gap-2 2xl:gap-3 flex-wrap">
            {/* Scope filter (Vendor + Tech) — first position */}
            <ScopeFilterPopover
              filters={effectiveFilters}
              onToggle={(dim, val) => toggleFilterValue(dim, val)}
              onClear={(dim) => clearFilterValues(dim)}
            />

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Date range — single popover */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    {/* Start display */}
                    <div className="flex items-center h-7 2xl:h-8 rounded-lg border border-border bg-card overflow-hidden">
                      <button className={cn('flex items-center gap-1.5 px-2 2xl:px-2.5 h-full text-[10px] 2xl:text-[11px] font-medium hover:bg-accent/50 transition-colors', !startDate && 'text-muted-foreground')}>
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
                      </button>
                      {showTimePickers && (
                        <>
                          <div className="w-px h-4 bg-border shrink-0" />
                          <input
                            type="time"
                            value={startTime}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="h-full w-[70px] px-1.5 text-[11px] font-medium bg-transparent text-foreground border-none outline-none focus:bg-accent/30 transition-colors [&::-webkit-calendar-picker-indicator]:hidden"
                          />
                        </>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-semibold select-none">–</span>
                    {/* End display */}
                    <div className="flex items-center h-7 2xl:h-8 rounded-lg border border-border bg-card overflow-hidden">
                      <button className={cn('flex items-center gap-1.5 px-2 2xl:px-2.5 h-full text-[10px] 2xl:text-[11px] font-medium hover:bg-accent/50 transition-colors', !endDate && 'text-muted-foreground')}>
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
                      </button>
                      {showTimePickers && (
                        <>
                          <div className="w-px h-4 bg-border shrink-0" />
                          <input
                            type="time"
                            value={endTime}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="h-full w-[70px] px-1.5 text-[11px] font-medium bg-transparent text-foreground border-none outline-none focus:bg-accent/30 transition-colors [&::-webkit-calendar-picker-indicator]:hidden"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 origin-top-left scale-[0.75]" align="start">
                  <div className="flex gap-0 divide-x divide-border">
                    {/* Start calendar */}
                    <div className="flex flex-col">
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Début</div>
                      <Calendar
                        mode="single"
                        selected={startDate}
                        defaultMonth={startDate || new Date()}
                        today={undefined}
                        onSelect={(d) => d && setState(prev => {
                          const nextStart = format(d, 'yyyy-MM-dd');
                          const timePart = parseTime(currentStartDateRaw);
                          const fullStart = showTimePickers ? `${nextStart}T${timePart}` : nextStart;
                          const prevEndOnly = currentEndDateRaw ? currentEndDateRaw.split('T')[0] : '';
                          const endTimePart = parseTime(currentEndDateRaw);
                          const keepEnd = prevEndOnly && prevEndOnly >= nextStart;
                          const newEnd = keepEnd
                            ? (showTimePickers ? `${prevEndOnly}T${endTimePart}` : prevEndOnly)
                            : fullStart;
                          return updateTemporalContext(fullStart, newEnd)(prev);
                        })}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </div>
                    {/* End calendar */}
                    <div className="flex flex-col">
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fin</div>
                      <Calendar
                        mode="single"
                        selected={endDate}
                        defaultMonth={endDate || startDate || new Date()}
                        disabled={(date) => !!startDate && date < startDate}
                        onSelect={(d) => d && setState(prev => {
                          const nextEnd = format(d, 'yyyy-MM-dd');
                          const timePart = parseTime(currentEndDateRaw);
                          const fullEnd = showTimePickers ? `${nextEnd}T${timePart}` : nextEnd;
                          return updateTemporalContext(currentStartDateRaw, fullEnd)(prev);
                        })}
                        today={undefined}
                        modifiers={startDate ? { rangeStart: startDate } : undefined}
                        modifiersStyles={{ rangeStart: { border: '2px solid hsl(var(--primary))', borderRadius: '6px', fontWeight: 700 } }}
                        className="p-3 pointer-events-auto"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Period shortcuts — compact dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-7 2xl:h-8 text-[10px] 2xl:text-[11px] gap-1 2xl:gap-1.5 px-2 2xl:px-3 rounded-lg bg-card shrink-0">
                  <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                  Période
                  {currentStartDateRaw && currentEndDateRaw && (() => {
                    const diffDays = Math.round((new Date(currentEndDateRaw.split('T')[0]).getTime() - new Date(currentStartDateRaw.split('T')[0]).getTime()) / 86400000) + 1;
                    const match = PERIODS.find(p => p.days === diffDays);
                    return match ? (
                      <span className="font-bold text-primary">{match.label}</span>
                    ) : (
                      <span className="font-bold text-primary">{diffDays}j</span>
                    );
                  })()}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[140px] p-1" align="start">
                {PERIODS.map(p => (
                  <button key={p.label} onClick={() => applyPeriod(p.days)}
                    className="w-full text-left px-3 py-2 rounded-md text-[11px] font-semibold text-foreground hover:bg-muted/60 transition-all">
                    {p.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Granularity — compact dropdown */}
            <Popover open={granularityOpen} onOpenChange={setGranularityOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-7 2xl:h-8 text-[10px] 2xl:text-[11px] gap-1 2xl:gap-1.5 px-2 2xl:px-3 rounded-lg bg-card shrink-0">
                  <span className="text-muted-foreground">Grain:</span>
                  <span className="font-bold text-primary">{GRANULARITIES.find(g => g.value === currentGranularity)?.label || currentGranularity}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[160px] p-1" align="start">
                {GRANULARITIES.map(g => {
                  const isActive = currentGranularity === g.value;
                  return (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => {
                        setState(updateTemporalContext(currentStartDateRaw, currentEndDateRaw, g.value));
                        setGranularityOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-[11px] font-semibold transition-all flex items-center justify-between',
                        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/60'
                      )}
                    >
                      <span>{g.label}</span>
                      {isActive && <Check className="w-3 h-3 ml-2 shrink-0" />}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />

            {/* Advanced TimeFrame */}
            <Popover open={timeFrameOpen} onOpenChange={setTimeFrameOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-7 2xl:h-8 max-w-[360px] text-[10px] 2xl:text-[11px] gap-1.5 px-2 2xl:px-3 rounded-lg bg-card shrink-0",
                    isAdvancedTimeFrameActive(activeTimeFrame) && "border-primary/50 bg-primary/10 text-primary shadow-sm"
                  )}
                  title={formatAdvancedTimeFrame(activeTimeFrame)}
                >
                  <Clock3 className="w-3.5 h-3.5" />
                  <span className="truncate">{formatAdvancedTimeFrame(activeTimeFrame)}</span>
                  {isAdvancedTimeFrameActive(activeTimeFrame) && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setState(prev => ({ ...prev, advancedTimeFrame: NONE_TIMEFRAME }));
                      }}
                      className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                      title="Clear advanced timeframe"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[390px] p-3 rounded-xl" align="start">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Advanced TimeFrame</div>
                    <div className="text-[11px] text-muted-foreground">Filters data inside the selected date range.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => {
                      setState(prev => ({ ...prev, advancedTimeFrame: NONE_TIMEFRAME }));
                      setTimeFrameDraft(NONE_TIMEFRAME);
                      setEditingTimeFrameId(null);
                      setTimeFrameError(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Existing profiles</label>
                    <div className="mt-1 max-h-[120px] overflow-y-auto rounded-lg border border-border/60 bg-muted/15 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTimeFrameId(null);
                          setTimeFrameDraft(NONE_TIMEFRAME);
                          setState(prev => ({ ...prev, advancedTimeFrame: NONE_TIMEFRAME }));
                        }}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold",
                          activeTimeFrame.mode === 'NONE' && !activeTimeFrame.excludeWeekends ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                        )}
                      >
                        None <span className="text-[9px] text-muted-foreground">system</span>
                      </button>
                      {timeFrameProfiles.map(profile => (
                        <div key={profile.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => selectAdvancedTimeFrameProfile(profile)}
                            className={cn(
                              "min-w-0 flex-1 text-left rounded-md px-2 py-1.5 text-[11px] font-semibold hover:bg-muted/60",
                              activeTimeFrame.profileName === profile.profileName && "bg-primary/10 text-primary"
                            )}
                          >
                            <span className="block truncate">{profile.profileName}</span>
                            <span className="block truncate text-[9px] text-muted-foreground">
                              {profile.mode === 'BUSY_HOURS' ? 'Busy Hours' : 'Custom Hours'} {profile.startHour}-{profile.endHour}{profile.excludeWeekends ? ' · no weekends' : ''}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAdvancedTimeFrameProfile(profile)}
                            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                            title="Delete profile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profile name</label>
                      <input
                        value={timeFrameDraft.profileName || ''}
                        onChange={(e) => setTimeFrameDraft(prev => ({ ...prev, profileName: e.target.value }))}
                        placeholder="Business Hours"
                        className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mode</label>
                      <select
                        value={timeFrameDraft.mode}
                        onChange={(e) => {
                          const mode = e.target.value as AdvancedTimeFrameMode;
                          setTimeFrameDraft(prev => normalizeTimeFrame({
                            ...prev,
                            mode,
                            startHour: mode === 'BUSY_HOURS' ? '08:00' : mode === 'CUSTOM_HOURS' ? (prev.startHour || '09:00') : undefined,
                            endHour: mode === 'BUSY_HOURS' ? '20:00' : mode === 'CUSTOM_HOURS' ? (prev.endHour || '18:00') : undefined,
                          }));
                        }}
                        className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {ADVANCED_TIMEFRAME_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                      </select>
                    </div>
                    <label className="mt-6 flex items-center gap-2 text-[11px] font-semibold text-foreground">
                      <Switch
                        checked={Boolean(timeFrameDraft.excludeWeekends)}
                        onCheckedChange={(checked) => setTimeFrameDraft(prev => ({ ...prev, excludeWeekends: checked }))}
                      />
                      Exclude weekends
                    </label>
                    {timeFrameDraft.mode !== 'NONE' && (
                      <>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start hour</label>
                          <input
                            type="time"
                            value={timeFrameDraft.startHour || ''}
                            onChange={(e) => setTimeFrameDraft(prev => ({ ...prev, startHour: e.target.value }))}
                            className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">End hour</label>
                          <input
                            type="time"
                            value={timeFrameDraft.endHour || ''}
                            onChange={(e) => setTimeFrameDraft(prev => ({ ...prev, endHour: e.target.value }))}
                            className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {timeFrameError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive">
                      {timeFrameError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={saveAdvancedTimeFrameProfile}>
                      <Save className="w-3.5 h-3.5 mr-1.5" /> Save profile
                    </Button>
                    <Button size="sm" className="h-8 text-[11px]" onClick={() => applyAdvancedTimeFrame(timeFrameDraft)}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Separator */}
            <div className="h-6 w-px bg-border/60 shrink-0" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-7 2xl:h-8 text-[10px] 2xl:text-[11px] gap-1 2xl:gap-1.5 px-2 2xl:px-3 rounded-lg bg-card">
                  <Flag className="w-3.5 h-3.5" fill={state.jalons.length > 0 ? state.jalons[0].color : 'hsl(var(--muted-foreground))'} style={{ color: state.jalons.length > 0 ? state.jalons[0].color : 'hsl(var(--muted-foreground))' }} />
                  Jalons
                  {state.jalons.length > 0 && <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">{state.jalons.length}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-3" align="start">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gestion des jalons</div>
                  {state.jalons.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setState(prev => ({ ...prev, showJalons: prev.showJalons === false ? true : false }))}
                      title={state.showJalons === false ? 'Afficher les jalons' : 'Masquer les jalons'}
                      className={cn(
                        "h-6 px-1.5 rounded-md",
                        state.showJalons === false && "opacity-60"
                      )}
                    >
                      {state.showJalons === false
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                        : <Eye className="w-3.5 h-3.5 text-primary" />}
                    </Button>
                  )}
                </div>
                <JalonsManagerPopup
                  jalons={state.jalons}
                  onUpdate={(jalons) => setState(prev => ({ ...prev, jalons }))}
                  draft={jalonDraft}
                  setDraft={setJalonDraft}
                />
              </PopoverContent>
            </Popover>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Apply button */}
            <Button
              onClick={handleApplyGuarded}
              size="sm"
              disabled={!Object.values(effectiveFilters).some(v => v.length > 0) || isApplying}
              className={cn(
                "h-7 2xl:h-8 px-4 2xl:px-6 text-[10px] 2xl:text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all",
                isApplying && "animate-pulse"
              )}
            >
              {isApplying ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Chargement...</span>
                </div>
              ) : !Object.values(effectiveFilters).some(v => v.length > 0)
                ? 'Ajouter un filtre'
                : (state.graphSlots.some(s => s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0) || selectedCounters.length > 0)
                  ? 'Appliquer'
                  : 'Appliquer (ajoutez des KPIs)'}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ LAYER 3: FILTERS / KPIs / DIMENSIONS — 3 distinct rows ═══ */}
      <div className="bg-card border-b border-border/40">
        <div className="w-[95%] mx-auto px-4 2xl:px-6 py-2 2xl:py-2.5 space-y-2">

          {/* ── ROW 1: Standard Filters (non-PM dimensions, excluding dims already shown as split badges) ── */}
          {(() => {
            // Collect dimensions already used as splits in the active slot's KPIs
            const activeSlot = state.graphSlots.find(s => s.id === activeSlotId);
            const activeSplitDims = new Set<string>();
            if (activeSlot?.config) {
              const cfg = activeSlot.config;
              for (const kpiId of activeSlot.kpiIds) {
                const s1 = cfg.splitByPerKpi?.[kpiId];
                if (s1 && s1 !== 'None') activeSplitDims.add(s1);
                const s2 = cfg.splitByPerKpi2?.[kpiId];
                if (s2 && s2 !== 'None') activeSplitDims.add(s2);
              }
            }
            // Also add the global splitBy
            if (activeSlot?.splitBy && activeSlot.splitBy !== 'None') activeSplitDims.add(activeSlot.splitBy);
            
            const visibleFilterDims = activeFilterDims.filter(dim => 
              !PM_DIMENSION_TYPES.has(dim) && !SCOPE_DIMENSIONS.has(dim) && !activeSplitDims.has(dim)
            );
            return (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-muted-foreground shrink-0">
              <Filter className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Filtres</span>
            </div>
            {visibleFilterDims.map(dim => (
              <FilterChip
                key={dim}
                dim={dim}
                values={effectiveFilters[dim] || []}
                onToggleValue={(val) => toggleFilterValue(dim, val)}
                onClear={() => clearFilterValues(dim)}
                onRemove={() => removeFilterDimension(dim)}
                siteFilter={(effectiveFilters['Site'] || [])[0]}
                cascadeContext={buildCascadeContext(effectiveFilters, dim)}
                scopeAllowed={
                  dim === 'Site' ? perimeter.siteAllowed
                  : dim === 'Cell' ? perimeter.cellAllowed
                  : dim === 'Cluster' ? perimeter.plaqueAllowed
                  : dim === 'DOR' || dim === 'DR' ? perimeter.dorAllowed
                  : dim === 'Band' ? perimeter.bandAllowed
                  : null
                }
              />
            ))}
            <AddFilterDropdown
              existingKeys={activeFilterDims}
              onAdd={addFilterDimension}
              filterDimensions={allFilterDimensions.filter(d => !PM_DIMENSION_TYPES.has(d) && !SCOPE_DIMENSIONS.has(d))}
              filterCategories={filterCategories}
              filterRats={filterRats}
              activeTechnos={effectiveFilters['Technology'] || effectiveFilters['TECHNO'] || []}
            />
            {visibleFilterDims.length > 0 && (
              <button
                onClick={() => {
                  updateFilters(filters => {
                    const nextFilters = { ...filters };
                    visibleFilterDims.forEach(d => delete nextFilters[d]);
                    return nextFilters;
                  });
                }}
                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <X className="w-2.5 h-2.5" /> Effacer filtres
              </button>
            )}
          </div>
            );
          })()}

          {/* ── ROW 2: KPIs + Counters ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 shrink-0">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">KPIs</span>
            </div>
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
                const popoverId = `${slot.id}::${kpiIdItem}`;
                const splitVal = cfg.splitByPerKpi?.[kpiIdItem];
                const hasSplit = splitVal && splitVal !== 'None';
                const isPmSplit = hasSplit && splitVal.startsWith('PM_DIM:');
                const splitLabel = hasSplit ? (isPmSplit ? splitVal : (splitOptions.find(s => s.key === splitVal)?.label || splitVal)) : null;
                const draftSplitValue = kpiSplitDrafts[popoverId] ?? splitVal ?? 'None';
                return (
                  <React.Fragment key={`${slot.id}-${kpiIdItem}`}>
                    <Popover
                      open={openKpiSplitPopoverId === popoverId}
                      onOpenChange={(open) => {
                        if (open) {
                          primeKpiSplitDraft(slot.id, kpiIdItem, cfg);
                          setOpenKpiSplitPopoverId(popoverId);
                        } else if (openKpiSplitPopoverId === popoverId) {
                          setOpenKpiSplitPopoverId(null);
                        }
                      }}
                    >
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
                          {(() => {
                            const kpiDim = kpiDimensionMap.get(kpiIdItem);
                            if (!kpiDim) return null;
                            const dc = getDimensionColor(kpiDim);
                            const label = PM_DIMENSION_LABELS[kpiDim] || kpiDim;
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border",
                                  dc.bg, dc.text, dc.textDark, dc.border
                                )}
                                title={`Dimension: ${label}`}
                              >
                                {kpiDim}
                              </span>
                            );
                          })()}
                          {hasSplit && (() => {
                            const dc = getDimensionColor(splitVal);
                            return (
                              <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border", dc.bg, dc.text, dc.textDark, dc.border)}>
                                <GitBranch className="w-2.5 h-2.5" />
                                {splitLabel}
                              </span>
                            );
                          })()}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setState(prev => ({
                                ...prev,
                                graphSlots: prev.graphSlots.map(s => {
                                  if (s.id !== slot.id) return s;
                                  const nextKpiIds = s.kpiIds.filter(k => k !== kpiIdItem);
                                  const prevCfg = s.config || DEFAULT_GRAPH_CONFIG;
                                  // Drop the removed KPI from yAxisAssignments
                                  const { [kpiIdItem]: _removed, ...remainingAssign } = prevCfg.yAxisAssignments || {};
                                  // Determine which axes still have KPIs/counters assigned
                                  const usedAxes = new Set<number>();
                                  for (const kid of nextKpiIds) {
                                    usedAxes.add(remainingAssign[kid] === 1 ? 1 : 0);
                                  }
                                  for (const [key, val] of Object.entries(remainingAssign)) {
                                    if (key.startsWith('counter_')) usedAxes.add(val === 1 ? 1 : 0);
                                  }
                                  // Reset Y axis side(s) with no remaining series back to auto
                                  const nextYAxis = usedAxes.has(0) ? prevCfg.yAxis : { mode: 'auto' as const };
                                  const nextYAxisRight = usedAxes.has(1) ? prevCfg.yAxisRight : { mode: 'auto' as const };
                                  // Also drop per-KPI overrides for the removed KPI
                                  const { [kpiIdItem]: _s1, ...splitByPerKpi } = prevCfg.splitByPerKpi || {};
                                  const { [kpiIdItem]: _s2, ...splitByPerKpi2 } = prevCfg.splitByPerKpi2 || {};
                                  const { [kpiIdItem]: _ct, ...chartTypePerKpi } = prevCfg.chartTypePerKpi || {};
                                  return {
                                    ...s,
                                    kpiIds: nextKpiIds,
                                    config: {
                                      ...prevCfg,
                                      yAxisAssignments: remainingAssign,
                                      yAxis: nextYAxis,
                                      yAxisRight: nextYAxisRight,
                                      splitByPerKpi,
                                      splitByPerKpi2,
                                      chartTypePerKpi,
                                    },
                                  };
                                }),
                              }));
                            }}
                            className="ml-0.5 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-2.5 space-y-2" align="start">
                      {/* Header + Breakdown */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[11px] font-bold text-foreground truncate">{name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-muted-foreground">Breakdown</span>
                          <Switch checked={cfg.showBreakdown} onCheckedChange={v => {
                            setSlotConfig({ showBreakdown: v });
                            if (onActivateTab) { v ? onActivateTab('breakdown') : onActivateTab(null); }
                          }} className="scale-[0.65]" />
                        </div>
                      </div>
                      {/* Chart Type — compact icon row */}
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40">
                        {CHART_TYPES.map(ct => (
                          <button key={ct.value}
                            onClick={() => setSlotConfig({ chartTypePerKpi: { ...(cfg.chartTypePerKpi || {}), [kpiIdItem]: ct.value } })}
                            className={cn('flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[9px] font-semibold transition-all',
                              (cfg.chartTypePerKpi?.[kpiIdItem] || cfg.chartType) === ct.value
                                ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            )}
                            title={ct.label}
                          >
                            <ct.icon className="w-3 h-3" />
                            <span className="hidden sm:inline">{ct.label}</span>
                          </button>
                        ))}
                      </div>
                      {/* Toggles — 2-column grid */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {([
                          { label: 'Smooth', checked: cfg.smooth, onChange: (v: boolean) => setSlotConfig({ smooth: v }) },
                          { label: 'Markers', checked: cfg.showSymbols, onChange: (v: boolean) => setSlotConfig({ showSymbols: v }) },
                          { label: 'Area Fill', checked: cfg.showArea, onChange: (v: boolean) => setSlotConfig({ showArea: v }) },
                          { label: 'Thresholds', checked: cfg.showThresholds, onChange: (v: boolean) => setSlotConfig({ showThresholds: v }) },
                          { label: 'Average', checked: cfg.showAverage ?? false, onChange: (v: boolean) => setSlotConfig({ showAverage: v }) },
                        ] as const).map(toggle => (
                          <div key={toggle.label} className="flex items-center justify-between py-0.5">
                            <span className="text-[9px] text-foreground">{toggle.label}</span>
                            <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} className="scale-[0.6]" />
                          </div>
                        ))}
                      </div>
                      {/* Line Width — inline */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-foreground shrink-0">Width</span>
                        <Slider value={[cfg.lineWidth]} onValueChange={v => setSlotConfig({ lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="flex-1" />
                        <span className="text-[8px] text-muted-foreground font-mono w-6 text-right">{cfg.lineWidth}px</span>
                      </div>
                      {/* Y-Axis — compact: assigns this KPI to L or R axis */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Axe Y</span>
                        <ToggleGroup type="single" value={cfg.yAxisAssignments?.[kpiIdItem] === 1 ? 'R' : 'L'}
                          onValueChange={(value) => {
                            if (!value) return;
                            const axisVal = value === 'R' ? 1 : 0;
                            setSlotConfig({
                              yAxisAssignments: { ...(cfg.yAxisAssignments || {}), [kpiIdItem]: axisVal },
                              __activeYTab: value as any,
                            } as any);
                          }}
                          className="gap-0 rounded-md border border-border/40 bg-muted/50 p-0.5"
                        >
                          {(['L', 'R'] as const).map(side => (
                            <ToggleGroupItem key={side} value={side} size="sm"
                              className="h-5 min-w-6 rounded-[4px] border-0 px-1.5 text-[8px] font-bold text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
                            >{side}</ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        {(() => {
                          const isRight = cfg.yAxisAssignments?.[kpiIdItem] === 1;
                          const axisCfg = isRight ? cfg.yAxisRight : cfg.yAxis;
                          const axisKey = isRight ? 'yAxisRight' : 'yAxis';
                          return (
                            <div className="flex gap-0.5 flex-1">
                              {(['auto', 'manual'] as const).map(mode => (
                                <button key={mode} onClick={() => setSlotConfig({ [axisKey]: { ...axisCfg, mode } })}
                                  className={cn('flex-1 px-1.5 py-0.5 rounded text-[8px] font-semibold transition-all',
                                    (axisCfg?.mode || 'auto') === mode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}
                                >{mode === 'auto' ? 'Auto' : 'Manuel'}</button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      {(() => {
                        const isRight = cfg.yAxisAssignments?.[kpiIdItem] === 1;
                        const axisCfg = isRight ? cfg.yAxisRight : cfg.yAxis;
                        const axisKey = isRight ? 'yAxisRight' : 'yAxis';
                        if (axisCfg?.mode !== 'manual') return null;
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <span className="text-[8px] text-muted-foreground">Min</span>
                              <input type="number" value={axisCfg?.min ?? ''} onChange={e => setSlotConfig({ [axisKey]: { ...axisCfg, mode: 'manual', min: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-mono" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] text-muted-foreground">Max</span>
                              <input type="number" value={axisCfg?.max ?? ''} onChange={e => setSlotConfig({ [axisKey]: { ...axisCfg, mode: 'manual', max: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-mono" />
                            </div>
                          </div>
                        );
                      })()}
                      {/* Split */}
                      {(() => {
                        const activeKpiSplit = slot.kpiIds.map(id => cfg.splitByPerKpi?.[id]).find(v => v && v !== 'None') || null;
                        const hasSplit1Active = true;
                        const hasSplit2Active = false;
                        const hasSplitOptions = splitOptions.length > 0 || activePmDimensions.size > 0;
                        // Data-driven per-KPI dimension list (from CH probe). Falls back to catalog metadata.
                        const probedDims = kpiAvailableDimsMap.get(kpiIdItem);
                        const relevantPmDims = probedDims
                          ? Array.from(probedDims).filter(d => PM_DIMENSION_TYPES.has(d))
                          : ((): string[] => {
                              const thisKpiDim = kpiDimensionMap.get(kpiIdItem);
                              return thisKpiDim ? [thisKpiDim] : Array.from(activePmDimensions);
                            })();
                        const buildSplits = (val: string) => {
                          const allSplits: Record<string, string> = {};
                          // Apply selected split to ALL KPIs AND counters in the slot.
                          slot.kpiIds.forEach(kid => {
                            allSplits[kid] = val;
                          });
                          (selectedCounters || []).forEach((c: any) => {
                            allSplits[c.counter_name] = val;
                          });
                          return allSplits;
                        };
                        return (
                          <>
                            {hasSplit1Active ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Split</span>
                                  <span className={cn('text-[8px] font-bold uppercase tracking-wider', activeKpiSplit === splitVal && hasSplit ? 'text-primary' : 'text-muted-foreground')}>
                                    {activeKpiSplit === splitVal && hasSplit ? 'Actif sur ce KPI' : activeKpiSplit ? 'Actif sur un autre KPI' : 'Aucun split actif'}
                                  </span>
                                </div>
                                <select value={draftSplitValue}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setKpiSplitDrafts(prev => ({ ...prev, [popoverId]: val }));
                                  }}
                                  className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-medium"
                                >
                                  <option value="None">Aucun</option>
                                  {splitOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                  {relevantPmDims.length > 0 && <optgroup label="PM Dimensions">{relevantPmDims.map(d => <option key={`pm_${d}`} value={`PM_DIM:${d}`}>{PM_DIMENSION_LABELS[d] || d}</option>)}</optgroup>}
                                </select>
                              </div>
                            ) : hasSplitOptions ? (
                              <button onClick={() => {
                                const firstKey = splitOptions[0]?.key || (relevantPmDims.length > 0 ? `PM_DIM:${relevantPmDims[0]}` : 'None');
                                if (firstKey === 'None') return;
                                setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: buildSplits(firstKey) } } : s) }));
                              }} className="w-full text-[9px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 py-1 rounded-md transition-colors border border-dashed border-border">+ Ajouter Split</button>
                            ) : null}
                            {hasSplit1Active && hasSplit2Active ? (
                              <div className="space-y-0.5">
                                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Split 2</span>
                                <select value={Object.values(cfg.splitByPerKpi2 || {}).find(v => v && v !== 'None') || 'None'}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'None') setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: 'None', config: { ...cfg, splitByPerKpi2: {} } } : s) }));
                                    else {
                                      const allSplits2: Record<string, string> = {};
                                      slot.kpiIds.forEach(kid => { allSplits2[kid] = val; });
                                      (selectedCounters || []).forEach((c: any) => { allSplits2[c.counter_name] = val; });
                                      setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: val, config: { ...cfg, splitByPerKpi2: allSplits2 } } : s) }));
                                    }
                                  }}
                                  className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-medium"
                                >
                                  <option value="None">Aucun</option>
                                  {splitOptions.filter(s => s.key !== (Object.values(cfg.splitByPerKpi || {}).find(v => v && v !== 'None'))).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                  {relevantPmDims.length > 0 && <optgroup label="PM Dimensions">{relevantPmDims.map(d => <option key={`pm2_${d}`} value={`PM_DIM:${d}`}>{PM_DIMENSION_LABELS[d] || d}</option>)}</optgroup>}
                                </select>
                              </div>
                            ) : false ? (
                              <button onClick={() => {
                                const split1Val = Object.values(cfg.splitByPerKpi || {}).find(v => v && v !== 'None');
                                const available = splitOptions.filter(s => s.key !== split1Val);
                                const firstKey = available[0]?.key || (relevantPmDims.length > 0 ? `PM_DIM:${relevantPmDims[0]}` : 'None');
                                if (firstKey === 'None') return;
                                const allSplits2: Record<string, string> = {};
                                slot.kpiIds.forEach(kid => { allSplits2[kid] = firstKey; });
                                setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: firstKey, config: { ...cfg, splitByPerKpi2: allSplits2 } } : s) }));
                              }} className="w-full text-[9px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 py-1 rounded-md transition-colors border border-dashed border-border">+ Ajouter Split 2</button>
                            ) : null}
                            {/* Apply button inside split popover */}
                            {hasSplit1Active && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  applyKpiSplitDraft(slot.id, kpiIdItem, draftSplitValue);
                                  setOpenKpiSplitPopoverId(null);
                                }}
                                className="w-full mt-2 h-7 text-[10px] font-bold uppercase tracking-wider"
                              >
                                Appliquer
                              </Button>
                            )}
                          </>
                        );
                      })()}
                    </PopoverContent>
                    </Popover>
                    {/* Split chip — only for non-PM splits (PM splits are already shown as badge on the KPI chip) */}
                    {hasSplit && !isPmSplit && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                        + {splitLabel}
                        <button
                          onClick={() => {
                            applyKpiSplitDraft(slot.id, kpiIdItem, 'None');
                          }}
                          className="hover:text-destructive ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </React.Fragment>
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

            {/* Separator before counters */}
            {selectedCounters.length > 0 && <div className="h-4 w-px bg-border/60 shrink-0 mx-1" />}

            {/* Counter chips — with popover settings like KPI chips */}
            {selectedCounters.map((c: any, i: number) => {
              const counterColor = ['#10b981','#06b6d4','#f59e0b','#8b5cf6','#ec4899'][i%5];
              const slot = state.graphSlots.find(s => s.id === activeSlotId);
              const cfg: GraphConfig = slot?.config || DEFAULT_GRAPH_CONFIG;
              const setSlotConfig = (patch: Partial<GraphConfig>) => {
                if (!slot) return;
                setState(prev => ({
                  ...prev,
                  graphSlots: prev.graphSlots.map(s =>
                    s.id === slot.id ? { ...s, config: { ...cfg, ...patch } } : s
                  ),
                }));
              };
              const counterSplitVal = cfg.splitByPerKpi?.[c.counter_name] || null;
              const hasCounterSplit = counterSplitVal && counterSplitVal !== 'None';
              const isCounterPmSplit = hasCounterSplit && counterSplitVal.startsWith('PM_DIM:');
              const counterSplitLabel = hasCounterSplit ? (isCounterPmSplit ? counterSplitVal : (splitOptions.find(s => s.key === counterSplitVal)?.label || counterSplitVal)) : null;
              const counterSplitVal2 = cfg.splitByPerKpi2?.[c.counter_name] || null;
              const hasCounterSplit2 = counterSplitVal2 && counterSplitVal2 !== 'None';
              const isCounterPmSplit2 = hasCounterSplit2 && counterSplitVal2.startsWith('PM_DIM:');
              const counterSplitLabel2 = hasCounterSplit2 ? (isCounterPmSplit2 ? counterSplitVal2 : (splitOptions.find(s => s.key === counterSplitVal2)?.label || counterSplitVal2)) : null;
              return (
                <Popover key={c.counter_name}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/15 transition-all">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: counterColor }} />
                      <span className="truncate max-w-[140px]">{c.display_name || c.counter_name}</span>
                      {hasCounterSplit && (() => {
                        const dc = getDimensionColor(counterSplitVal);
                        return (
                          <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border", dc.bg, dc.text, dc.textDark, dc.border)}>
                            <GitBranch className="w-2.5 h-2.5" />
                            {counterSplitLabel}
                          </span>
                        );
                      })()}
                      {hasCounterSplit2 && (() => {
                        const dc2 = getDimensionColor(counterSplitVal2);
                        return (
                          <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border", dc2.bg, dc2.text, dc2.textDark, dc2.border)}>
                            <GitBranch className="w-2.5 h-2.5" />
                            {counterSplitLabel2}
                          </span>
                        );
                      })()}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedCounters(selectedCounters.filter((x: any) => x.counter_name !== c.counter_name)); }}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2.5 space-y-2" align="start">
                    {/* Header */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: counterColor }} />
                      <span className="text-[11px] font-bold text-foreground truncate">{c.display_name || c.counter_name}</span>
                      {c.family && <span className="text-[8px] text-muted-foreground ml-auto truncate">{c.family}</span>}
                    </div>
                    {/* Chart Type — compact icon row */}
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40">
                      {CHART_TYPES.map(ct => (
                        <button key={ct.value}
                          onClick={() => setSlotConfig({ chartTypePerKpi: { ...(cfg.chartTypePerKpi || {}), [c.counter_name]: ct.value } })}
                          className={cn('flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[9px] font-semibold transition-all',
                            (cfg.chartTypePerKpi?.[c.counter_name] || cfg.chartType) === ct.value
                              ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          )}
                          title={ct.label}
                        >
                          <ct.icon className="w-3 h-3" />
                          <span className="hidden sm:inline">{ct.label}</span>
                        </button>
                      ))}
                    </div>
                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {([
                        { label: 'Smooth', checked: cfg.smooth, onChange: (v: boolean) => setSlotConfig({ smooth: v }) },
                        { label: 'Markers', checked: cfg.showSymbols, onChange: (v: boolean) => setSlotConfig({ showSymbols: v }) },
                        { label: 'Area Fill', checked: cfg.showArea, onChange: (v: boolean) => setSlotConfig({ showArea: v }) },
                      ] as const).map(toggle => (
                        <div key={toggle.label} className="flex items-center justify-between py-0.5">
                          <span className="text-[9px] text-foreground">{toggle.label}</span>
                          <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} className="scale-[0.6]" />
                        </div>
                      ))}
                    </div>
                    {/* Line Width */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-foreground shrink-0">Width</span>
                      <Slider value={[cfg.lineWidth]} onValueChange={v => setSlotConfig({ lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="flex-1" />
                      <span className="text-[8px] text-muted-foreground font-mono w-6 text-right">{cfg.lineWidth}px</span>
                    </div>
                    {/* Y-Axis assignment — keyed by counter series id (counter_<name>) to match KPIGraphs */}
                    {(() => {
                      const counterKey = `counter_${c.counter_name}`;
                      const current = cfg.yAxisAssignments?.[counterKey];
                      // Default counters to right axis (1) when unset
                      const sideValue = current === 0 ? 'L' : 'R';
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Axe Y</span>
                          <ToggleGroup type="single" value={sideValue}
                            onValueChange={(value) => {
                              if (!value) return;
                              const axisVal = value === 'R' ? 1 : 0;
                              setSlotConfig({ yAxisAssignments: { ...(cfg.yAxisAssignments || {}), [counterKey]: axisVal } });
                            }}
                            className="gap-0 rounded-md border border-border/40 bg-muted/50 p-0.5"
                          >
                            {(['L', 'R'] as const).map(side => (
                              <ToggleGroupItem key={side} value={side} size="sm"
                                className="h-5 min-w-6 rounded-[4px] border-0 px-1.5 text-[8px] font-bold text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
                              >{side}</ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      );
                    })()}
                    {/* Split — same as KPI popover */}
                    {(() => {
                      const hasSplit1Active = Object.values(cfg.splitByPerKpi || {}).some(v => v && v !== 'None');
                      const hasSplit2Active = Object.values(cfg.splitByPerKpi2 || {}).some(v => v && v !== 'None');
                      const hasSplitOptions = splitOptions.length > 0;
                      const buildCounterSplits = (val: string) => {
                        const allSplits: Record<string, string> = { ...(cfg.splitByPerKpi || {}) };
                        // Only apply split to THIS counter
                        allSplits[c.counter_name] = val;
                        return allSplits;
                      };
                      return (
                        <>
                          {hasSplit1Active ? (
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Split 1</span>
                              <select value={cfg.splitByPerKpi?.[c.counter_name] || Object.values(cfg.splitByPerKpi || {}).find(v => v && v !== 'None') || 'None'}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === 'None') setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: {}, splitByPerKpi2: {} } } : s) }));
                                  else setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: buildCounterSplits(val) } } : s) }));
                                }}
                                className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-medium"
                              >
                                <option value="None">Aucun</option>
                                {splitOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                            </div>
                          ) : hasSplitOptions ? (
                            <button onClick={() => {
                              const firstKey = splitOptions[0]?.key || 'None';
                              if (firstKey === 'None') return;
                              setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy: 'None', config: { ...cfg, splitByPerKpi: buildCounterSplits(firstKey) } } : s) }));
                            }} className="w-full text-[9px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 py-1 rounded-md transition-colors border border-dashed border-border">+ Ajouter Split</button>
                          ) : null}
                          {hasSplit1Active && hasSplit2Active ? (
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Split 2</span>
                              <select value={cfg.splitByPerKpi2?.[c.counter_name] || Object.values(cfg.splitByPerKpi2 || {}).find(v => v && v !== 'None') || 'None'}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === 'None') setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: 'None', config: { ...cfg, splitByPerKpi2: {} } } : s) }));
                                  else {
                                    const allSplits2: Record<string, string> = { ...(cfg.splitByPerKpi2 || {}) };
                                    allSplits2[c.counter_name] = val;
                                    setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: val, config: { ...cfg, splitByPerKpi2: allSplits2 } } : s) }));
                                  }
                                }}
                                className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-medium"
                              >
                                <option value="None">Aucun</option>
                                {splitOptions.filter(s => s.key !== (Object.values(cfg.splitByPerKpi || {}).find(v => v && v !== 'None'))).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                            </div>
                          ) : hasSplit1Active && hasSplitOptions ? (
                            <button onClick={() => {
                              const split1Val = Object.values(cfg.splitByPerKpi || {}).find(v => v && v !== 'None');
                              const available = splitOptions.filter(s => s.key !== split1Val);
                              const firstKey = available[0]?.key || 'None';
                              if (firstKey === 'None') return;
                              const allSplits2: Record<string, string> = { ...(cfg.splitByPerKpi2 || {}) };
                              allSplits2[c.counter_name] = firstKey;
                              selectedCounters.forEach((sc: any) => { allSplits2[sc.counter_name] = firstKey; });
                              setState(prev => ({ ...prev, graphSlots: prev.graphSlots.map(s => s.id === slot.id ? { ...s, splitBy2: firstKey, config: { ...cfg, splitByPerKpi2: allSplits2 } } : s) }));
                            }} className="w-full text-[9px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 py-1 rounded-md transition-colors border border-dashed border-border">+ Ajouter Split 2</button>
                          ) : null}
                          {hasSplit1Active && (
                            <Button
                              size="sm"
                              onClick={() => { handleApplyGuarded(); }}
                              disabled={isApplying}
                              className="w-full mt-2 h-7 text-[10px] font-bold uppercase tracking-wider"
                            >
                              {isApplying ? 'Chargement…' : 'Appliquer'}
                            </Button>
                          )}
                        </>
                      );
                    })()}
                    {/* Counter info */}
                    <div className="pt-1 border-t border-border/40 space-y-0.5">
                      <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                        <span className="font-mono">{c.counter_name}</span>
                      </div>
                      {c.techno && <span className="text-[8px] text-muted-foreground">{c.vendor} · {c.techno}</span>}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}

            <button onClick={() => setCounterSelectorOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-500 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 transition-colors">
              <Plus className="w-3 h-3" /> Add Counter
            </button>
          </div>

          {/* ── ROW 3: PM Dimension Levels (PMQAP, FLEX, etc.) — only when active slot has relevant KPIs ── */}
          {(() => {
            const aSlot = state.graphSlots.find(s => s.id === activeSlotId);
            if (!aSlot || aSlot.kpiIds.length === 0) return null;
            // Check if any KPI in the active slot requires a PM dimension
            const slotPmDims = new Set<string>();
            for (const kpiId of aSlot.kpiIds) {
              const def = kpiDefs.find(k => k.id === kpiId);
              if (def?.dimension_type && PM_DIMENSION_TYPES.has(def.dimension_type)) {
                slotPmDims.add(def.dimension_type);
              }
            }
            // Also check counters assigned to this slot
            for (const cId of (aSlot.counterIds || [])) {
              const cDef = counterCatalog.find(c => c.counter_name === cId);
              if (cDef?.dimension_type && PM_DIMENSION_TYPES.has(cDef.dimension_type)) {
                slotPmDims.add(cDef.dimension_type);
              }
            }
            // Also check selected counters (global)
            for (const c of selectedCounters) {
              if (c.dimension_type && PM_DIMENSION_TYPES.has(c.dimension_type)) {
                slotPmDims.add(c.dimension_type);
              }
            }
            // Show the row if any PM dimension is detected from KPIs/counters
            if (slotPmDims.size === 0) return null;

            // Auto-add detected PM dims to activeFilterDims if not already present
            const pmDimsInFilters = activeFilterDims.filter(dim => PM_DIMENSION_TYPES.has(dim));
            const missingPmDims = Array.from(slotPmDims).filter(d => !activeFilterDims.includes(d));

            return (
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <div className="flex items-center gap-1 shrink-0">
                  <Layers className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Dimensions</span>
                </div>
                {/* Existing PM dimension filter chips */}
                {pmDimsInFilters.map(dim => (
                  <FilterChip
                    key={dim}
                    dim={dim}
                    values={effectiveFilters[dim] || []}
                    onToggleValue={(val) => toggleFilterValue(dim, val)}
                    onClear={() => clearFilterValues(dim)}
                    onRemove={() => removeFilterDimension(dim)}
                    cascadeContext={buildCascadeContext(effectiveFilters, dim)}
                  />
                ))}
                {/* Quick-add buttons for detected PM dims not yet added as filters */}
                {missingPmDims.map(dim => (
                  <button
                    key={dim}
                    onClick={() => addFilterDimension(dim)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-amber-600 hover:bg-amber-500/10 border border-dashed border-amber-500/30 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {PM_DIMENSION_LABELS[dim] || dim}
                  </button>
                ))}
                {/* Add more PM dimensions manually */}
                {allFilterDimensions.filter(d => PM_DIMENSION_TYPES.has(d) && !activeFilterDims.includes(d) && !slotPmDims.has(d)).length > 0 && (
                  <AddFilterDropdown
                    existingKeys={activeFilterDims}
                    onAdd={addFilterDimension}
                    filterDimensions={allFilterDimensions.filter(d => PM_DIMENSION_TYPES.has(d))}
                    filterCategories={filterCategories}
                    filterRats={filterRats}
                    activeTechnos={effectiveFilters['Technology'] || effectiveFilters['TECHNO'] || []}
                  />
                )}
              </div>
            );
          })()}

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
            pendingAxisRef.current = assignments;
          }}
          onConfirm={(keys) => {
            const validKeys = keys.filter(Boolean);
            if (validKeys.length === 0) return;
            // Convert pending axis assignments to numeric format
            const axisAssign: Record<string, number> = {};
            if (pendingAxisRef.current) {
              for (const [k, v] of Object.entries(pendingAxisRef.current)) {
                axisAssign[k] = v === 'right' ? 1 : 0;
              }
            }
            const hasAxisConfig = Object.keys(axisAssign).length > 0;
            if (selectorOpen === 'new') {
              const newId = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              setState(prev => {
                const nextIndex = prev.graphSlots.length + 1;
                const newSlot: GraphSlot = {
                  id: newId,
                  kpiIds: validKeys,
                  name: `Graph ${nextIndex}`,
                  filters: {},
                  startDate: prev.startDate || '',
                  endDate: prev.endDate || '',
                  granularity: (prev.granularity || '1d') as Granularity,
                  splitBy: 'None',
                  ...(hasAxisConfig ? { config: { ...DEFAULT_GRAPH_CONFIG, yAxisAssignments: axisAssign } } : {}),
                };
                return { ...prev, graphSlots: [...prev.graphSlots, newSlot] };
              });
              onSlotClick?.(newId);
            } else if (selectorOpen) {
              setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => {
                  if (s.id !== selectorOpen) return s;
                  const merged = validKeys;
                  const cleanConfig = { ...(s.config || DEFAULT_GRAPH_CONFIG), splitByPerKpi: {}, yAxisAssignments: { ...(s.config?.yAxisAssignments || {}), ...axisAssign } };
                  return { ...s, kpiIds: merged, splitBy: 'None', config: cleanConfig };
                }),
              }));
              onSlotClick?.(selectorOpen);
            }
            pendingAxisRef.current = null;
            handleSelectorClose();
          }}
        />,
        document.body
      )}

      {/* Counter Selector Modal */}
      <CounterSelectorModal
        open={counterSelectorOpen}
        onClose={() => setCounterSelectorOpen(false)}
        catalog={perimeterFilteredCounters}
        selectedKeys={selectedCounters.map((c: any) => c.counter_name)}
        onConfirm={(keys: string[]) => {
          const resolved = keys.map(k => counterCatalog.find((c: any) => c.counter_name === k)).filter(Boolean);
          setSelectedCounters(resolved);
        }}
        perimeterVendor={effectiveFilters['Vendor'] || []}
        perimeterTechno={effectiveFilters['Technology'] || []}
      />
    </div>
  );
};

export default ControlPanel;
