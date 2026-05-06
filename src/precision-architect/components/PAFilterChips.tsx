import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Filter, Plus, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ensureFilterLoaded, getFilterValues, dimToKey, isPmDimension, subscribe as subscribeCacheUpdates, type FilterContext } from '@/stores/investigatorFilterCache';
import { getDimensionColor } from '@/components/investigator/dimensionColors';
import type { ChartFilterChip } from '../types';

// Map UI dimension label → backend dim code used in cascading context.
// Mirrors the mapping in investigator/ControlPanel.tsx so PA and
// Investigator hit the same /monitor/filters/values WHERE clauses.
const dimToBackendCode = (dim: string): string => {
  const m: Record<string, string> = {
    Cell: 'CELL', Site: 'SITE', Vendor: 'VENDOR', Technology: 'TECHNO', RAT: 'TECHNO',
    Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'PLAQUE', Cluster: 'PLAQUE', Cluster_B: 'CLUSTER',
    constructeur: 'VENDOR', Constructeur: 'VENDOR', techno: 'TECHNO', Techno: 'TECHNO',
  };
  return m[dim] || dim.toUpperCase();
};

// Build a cascading-filter context from the active selection map,
// excluding the chip's own dimension. Returns undefined when no
// upstream filter is active so the cache key collapses to baseline.
const buildCascadeContext = (active: Map<string, string[]>, selfDim: string): FilterContext | undefined => {
  const ctx: FilterContext = {};
  for (const [k, v] of active.entries()) {
    if (k === selfDim) continue;
    if (!v || !v.length) continue;
    const code = dimToBackendCode(k);
    if (!code || code === dimToBackendCode(selfDim)) continue;
    ctx[code] = v;
  }
  return Object.keys(ctx).length ? ctx : undefined;
};

/**
 * PrecisionArchitect — Filter chips row.
 * Mirrors the Investigator design: one chip per dimension with multi-value popover
 * powered by the shared backend filter cache. Each unique value is stored as a
 * separate `ChartFilterChip` row in `config.data.filters`.
 */

interface Props {
  filters: ChartFilterChip[];
  onChange: (next: ChartFilterChip[]) => void;
  filterDimensions: string[];
  filtersLoading?: boolean;
  /** When true, render compactly without the outer "Filtres" label & padding row — for inline use in the scope toolbar. */
  inline?: boolean;
  /** Render only the active chips (no "Ajouter filtre" button). */
  chipsOnly?: boolean;
  /** Render only the "Ajouter filtre" button (no chips). */
  addOnly?: boolean;
  /** display_name → category (template section). When provided, the
   *  AddFilterDropdown groups dimensions under sticky section headers. */
  filterCategories?: Record<string, string>;
  /** display_name → rat ('4G'|'5G'|'3G'|'2G'|'ALL'). Drives techno-aware
   *  hiding: if `activeTechnos` doesn't include a dim's rat, it's hidden. */
  filterRats?: Record<string, string>;
  /** Currently selected technos (e.g. from the Périmètre popover). */
  activeTechnos?: string[];
}

const useBackendFilterValues = (dimension: string, ctx?: FilterContext): { values: string[]; labels: Record<string, string> } => {
  const key = isPmDimension(dimension) ? dimension : dimToKey(dimension);
  const ctxStr = useMemo(() => {
    if (!ctx) return '';
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(ctx)
          .filter(([_, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
          .sort(([a], [b]) => a.localeCompare(b))
      )
    );
  }, [ctx]);

  const [result, setResult] = useState<{ values: string[]; labels: Record<string, string> }>(() => {
    const e = getFilterValues(key, ctx);
    return { values: e.values, labels: e.labels || {} };
  });

  useEffect(() => {
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

/* ── Add Filter Dropdown — pick one or more dimensions ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string) => void;
  filterDimensions: string[];
  loading?: boolean;
  /** display_name → category (template section). Drives section headers. */
  filterCategories?: Record<string, string>;
  /** display_name → rat ('4G'|'5G'|'3G'|'2G'|'ALL'). Hides tech-specific
   *  dimensions when the user has not selected the matching techno. */
  filterRats?: Record<string, string>;
  /** Currently active technos (from caller). Empty → show every dim. */
  activeTechnos?: string[];
}> = ({ existingKeys, onAdd, filterDimensions, loading, filterCategories, filterRats, activeTechnos }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  // Techno-aware: hide tech-specific dimensions when the user did not
  // select the matching techno. ALL/unset rats stay visible. Empty
  // technoSet → operator hasn't picked yet → show every dim.
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
    ? available.filter(d => d.toLowerCase().includes(search.toLowerCase()))
    : available;

  // Group by category (template section: COMMON / RF PARAMETERS / 4G / 5G / 3G / 2G / OPERATIONS).
  // Falls back to "Other" when the metadata is absent.
  const grouped = useMemo(() => {
    if (!filterCategories) return null;
    const cats: Record<string, string[]> = {};
    const order: string[] = [];
    for (const d of filtered) {
      const cat = filterCategories[d] || 'Other';
      if (!cats[cat]) { cats[cat] = []; order.push(cat); }
      cats[cat].push(d);
    }
    return order.map(cat => ({ category: cat, items: cats[cat] }));
  }, [filtered, filterCategories]);

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
        <button className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-dashed border-outline-variant/60 text-[11px] font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
          <Plus className="w-3 h-3" />
          <span>Ajouter filtre</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 rounded-xl border border-border/60 shadow-xl bg-card z-[10000]" align="start" sideOffset={6}>
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

        {selected.length > 0 && (
          <div className="px-4 py-1.5 text-[10px] font-semibold text-primary border-b border-border/20">
            {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
          </div>
        )}

        <div className="max-h-[260px] overflow-y-auto py-1">
          {loading && (
            <div className="px-4 py-6 text-[10px] text-muted-foreground text-center">Chargement…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-6 text-[10px] text-muted-foreground text-center">
              {available.length === 0 ? 'Tous les filtres sont déjà ajoutés' : 'Aucun résultat'}
            </div>
          )}
          {!loading && filtered.length > 0 && (grouped ? (
            // Grouped by template section — sticky headers
            grouped.map(({ category, items }) => (
              <div key={category}>
                <div className="px-4 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 bg-muted/20 sticky top-0 z-10">
                  {category}
                </div>
                {items.map(dim => {
                  const isPm = isPmDimension(dim);
                  const isChecked = selected.includes(dim);
                  return (
                    <button
                      key={dim}
                      onClick={() => toggle(dim)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-xs font-medium transition-all flex items-center gap-3',
                        isChecked ? 'text-primary' : 'text-foreground',
                        'hover:bg-muted/40'
                      )}
                    >
                      <span className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                        isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background'
                      )}>
                        {isChecked && <Check className="w-3 h-3" />}
                      </span>
                      <span className={cn('flex-1', isChecked && 'font-bold')}>{dim}</span>
                      {isPm && (
                        <span className="text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700">PM</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            filtered.map(dim => {
              const isPm = isPmDimension(dim);
              const isChecked = selected.includes(dim);
              return (
                <button
                  key={dim}
                  onClick={() => toggle(dim)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-xs font-medium transition-all flex items-center gap-3',
                    isChecked ? 'text-primary' : 'text-foreground',
                    'hover:bg-muted/40'
                  )}
                >
                  <span className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background'
                  )}>
                    {isChecked && <Check className="w-3 h-3" />}
                  </span>
                  <span className={cn('flex-1', isChecked && 'font-bold')}>{dim}</span>
                  {isPm && (
                    <span className="text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700">PM</span>
                  )}
                </button>
              );
            })
          ))}
        </div>

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
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all',
              selected.length > 0
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            <Check className="w-3 h-3" /> Confirm
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Filter Chip — multi-value popover for one dimension ── */
const PADimensionChip: React.FC<{
  dim: string;
  values: string[];
  onTogglePending: (vals: string[]) => void;
  onRemove: () => void;
  /** Cascading context: upstream filters that should narrow the candidate values. */
  cascadeContext?: FilterContext;
}> = ({ dim, values, onTogglePending, onRemove, cascadeContext }) => {
  const [open, setOpen] = useState(false);
  const { values: backendValues, labels: labelMap } = useBackendFilterValues(dim, cascadeContext);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string[]>([]);

  useEffect(() => {
    if (open) setPending([...values]);
  }, [open]);

  const filtered = search
    ? backendValues.filter(v => {
        const q = search.toLowerCase();
        return v.toLowerCase().includes(q) || (labelMap[v] || '').toLowerCase().includes(q);
      })
    : backendValues;

  const togglePending = (val: string) => {
    setPending(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const handleConfirm = () => {
    onTogglePending(pending);
    setOpen(false);
    setSearch('');
  };

  const displayText =
    values.length === 0 ? 'Tous'
    : values.length === 1 ? (labelMap[values[0]] || values[0])
    : `${values.length} sélectionnés`;

  const color = getDimensionColor(dim);

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={(v) => { if (!v) setSearch(''); setOpen(v); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-l-full text-[11px] font-bold border border-r-0 transition-all cursor-pointer',
              values.length > 0
                ? `${color.bgActive} ${color.textActive} ${color.textDark} ${color.border}`
                : `${color.bg} ${color.text} ${color.border}`
            )}
          >
            <span className="opacity-70 font-normal">{dim}:</span>
            <span className="font-bold truncate max-w-[140px]">{displayText}</span>
            <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 rounded-xl shadow-xl border border-border/60 overflow-hidden z-[10000]" align="start" sideOffset={4}>
          <div className="px-3 py-2.5 border-b border-border/30 bg-muted/30">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sélectionner — {dim}</h4>
          </div>

          <div className="p-2.5">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-7 pr-3 py-2 rounded-full border border-border/50 bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-all"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[240px] overflow-y-auto px-1.5 pb-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-[10px] text-muted-foreground text-center">
                {backendValues.length === 0 ? 'Aucune valeur disponible' : 'Aucun résultat'}
              </div>
            )}
            {filtered.slice(0, 200).map(val => {
              const isChecked = pending.includes(val);
              return (
                <button
                  key={val}
                  onClick={() => togglePending(val)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2',
                    isChecked ? 'text-primary bg-primary/5' : 'text-foreground hover:bg-muted/40'
                  )}
                >
                  <span className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                    isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background'
                  )}>
                    {isChecked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 truncate">{labelMap[val] || val}</span>
                </button>
              );
            })}
            {filtered.length > 200 && (
              <div className="px-3 py-2 text-[9px] text-muted-foreground text-center italic">
                +{filtered.length - 200} résultats — affinez la recherche
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
            <button
              onClick={() => setPending([])}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Check className="w-3 h-3" /> Appliquer
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={onRemove}
        className={cn(
          'h-7 w-7 inline-flex items-center justify-center rounded-r-full border border-l-0 transition-colors',
          color.border,
          'bg-white hover:bg-error/10 text-on-surface-variant hover:text-error'
        )}
        aria-label={`Remove ${dim} filter`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const PAFilterChips: React.FC<Props> = ({ filters, onChange, filterDimensions, filtersLoading, inline, chipsOnly, addOnly, filterCategories, filterRats, activeTechnos }) => {
  // Group flat ChartFilterChip[] → dimension → values
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    filters.forEach(f => {
      const arr = map.get(f.dimension) ?? [];
      if (!arr.includes(f.value)) arr.push(f.value);
      map.set(f.dimension, arr);
    });
    return map;
  }, [filters]);

  const activeDims = Array.from(grouped.keys());

  const addDimension = (dim: string) => {
    if (grouped.has(dim)) return;
    onChange([...filters, { id: `f-${Date.now()}-${dim}`, dimension: dim, value: '' }]);
  };

  const setDimensionValues = (dim: string, vals: string[]) => {
    const others = filters.filter(f => f.dimension !== dim);
    if (vals.length === 0) {
      onChange([...others, { id: `f-${Date.now()}-${dim}`, dimension: dim, value: '' }]);
    } else {
      const next = vals.map((v, i) => ({ id: `f-${Date.now()}-${dim}-${i}`, dimension: dim, value: v }));
      onChange([...others, ...next]);
    }
  };

  const removeDimension = (dim: string) => {
    onChange(filters.filter(f => f.dimension !== dim));
  };

  const clearAll = () => onChange([]);

  // Pre-compute the active selection map (dim → values) — used both for
  // chip rendering and for cascadeContext per chip.
  const activeMap = useMemo(() => {
    const m = new Map<string, string[]>();
    grouped.forEach((vals, dim) => {
      const filtered = vals.filter(v => v !== '');
      if (filtered.length) m.set(dim, filtered);
    });
    // Merge externally-supplied technos so cascadeContext narrows by them too.
    if (activeTechnos && activeTechnos.length) {
      m.set('Technology', activeTechnos);
    }
    return m;
  }, [grouped, activeTechnos]);

  const chipsNode = activeDims.map(dim => {
    const vals = (grouped.get(dim) ?? []).filter(v => v !== '');
    return (
      <PADimensionChip
        key={dim}
        dim={dim}
        values={vals}
        onTogglePending={(next) => setDimensionValues(dim, next)}
        onRemove={() => removeDimension(dim)}
        cascadeContext={buildCascadeContext(activeMap, dim)}
      />
    );
  });

  const addNode = (
    <AddFilterDropdown
      existingKeys={activeDims}
      onAdd={addDimension}
      filterDimensions={filterDimensions}
      loading={filtersLoading}
      filterCategories={filterCategories}
      filterRats={filterRats}
      activeTechnos={activeTechnos}
    />
  );

  const clearNode = filters.length > 0 && (
    <button
      type="button"
      onClick={clearAll}
      className="flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
    >
      <X className="w-3 h-3" />
      <span>Effacer</span>
    </button>
  );

  // Sub-mode: only chips (active filters), without the add button
  if (chipsOnly) {
    if (activeDims.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {chipsNode}
        {clearNode}
      </div>
    );
  }

  // Sub-mode: only the "Ajouter filtre" button
  if (addOnly) {
    return <div className="flex items-center">{addNode}</div>;
  }

  if (inline) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {chipsNode}
        {addNode}
        {clearNode}
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>Filtres</span>
      </div>
      {chipsNode}
      {addNode}
      {clearNode}
    </div>
  );
};

export default PAFilterChips;
