import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Filter, Plus, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ensureFilterLoaded, getFilterValues, dimToKey, isPmDimension, subscribe as subscribeCacheUpdates } from '@/stores/investigatorFilterCache';
import { getDimensionColor } from '@/components/investigator/dimensionColors';
import type { ChartFilterChip } from '../types';

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
}

const useBackendFilterValues = (dimension: string): { values: string[]; labels: Record<string, string> } => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    try { ensureFilterLoaded(dimension); } catch {}
    const unsub = subscribeCacheUpdates(() => alive && setTick(t => t + 1));
    // Trigger one re-render after mount in case cache already has it
    setTick(t => t + 1);
    return () => { alive = false; unsub(); };
  }, [dimension]);
  const key = dimToKey(dimension);
  const cached = getFilterValues(key);
  return {
    values: cached?.values ?? [],
    labels: (cached?.labels as any) ?? {},
  };
};

/* ── Add Filter Dropdown — pick one or more dimensions ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string) => void;
  filterDimensions: string[];
  loading?: boolean;
}> = ({ existingKeys, onAdd, filterDimensions, loading }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const available = filterDimensions.filter(d => !existingKeys.includes(d));
  const filtered = search
    ? available.filter(d => d.toLowerCase().includes(search.toLowerCase()))
    : available;

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
          {filtered.map(dim => {
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
                  isChecked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-background'
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
}> = ({ dim, values, onTogglePending, onRemove }) => {
  const [open, setOpen] = useState(false);
  const { values: backendValues, labels: labelMap } = useBackendFilterValues(dim);
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

const PAFilterChips: React.FC<Props> = ({ filters, onChange, filterDimensions, filtersLoading, inline }) => {
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

  const chipsAndAdd = (
    <>
      {activeDims.map(dim => {
        const vals = (grouped.get(dim) ?? []).filter(v => v !== '');
        return (
          <PADimensionChip
            key={dim}
            dim={dim}
            values={vals}
            onTogglePending={(next) => setDimensionValues(dim, next)}
            onRemove={() => removeDimension(dim)}
          />
        );
      })}

      <AddFilterDropdown
        existingKeys={activeDims}
        onAdd={addDimension}
        filterDimensions={filterDimensions}
        loading={filtersLoading}
      />

      {filters.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
        >
          <X className="w-3 h-3" />
          <span>Effacer</span>
        </button>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {chipsAndAdd}
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>Filtres</span>
      </div>
      {chipsAndAdd}
    </div>
  );
};

export default PAFilterChips;
