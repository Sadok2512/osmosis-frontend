import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { topoApi } from '@/lib/localDb';

export const LEGACY_SITE_FILTER_KEYS = [
  'dor', 'vendor', 'plaque', 'techno', 'bande', 'zone_arcep', 'saisonnier', 'cluster',
] as const;

export interface DashboardSiteFilters {
  dor?: string[];
  vendor?: string[];
  plaque?: string[];
  techno?: string[];
  bande?: string[];
  zone_arcep?: string[];
  saisonnier?: string[];
  cluster?: string[];
  dim_filters?: Record<string, string[]>;
  topo_search?: {
    logic: 'OR' | 'AND';
    filters: { field: string; operator: 'IN' | 'NOT_IN' | '=' | '!='; values: string[] }[];
  };
}

const isLegacySiteFilterKey = (k: string): boolean =>
  (LEGACY_SITE_FILTER_KEYS as readonly string[]).includes(k);

export const ProgressiveFilterBuilder: React.FC<{
  dimensions: { id: string; label: string; values: string[]; category?: string; rat?: string }[];
  filters: DashboardSiteFilters;
  onChange: (next: DashboardSiteFilters) => void;
}> = ({ dimensions, filters, onChange }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPickerSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const getDimVals = (dimId: string): string[] | undefined => {
    if (isLegacySiteFilterKey(dimId)) return (filters as any)[dimId];
    return filters.dim_filters?.[dimId];
  };

  const activeKeys = useMemo(() => {
    const out: string[] = [];
    for (const k of Object.keys(filters)) {
      if (k === 'dim_filters' || k === 'topo_search') continue;
      const v = (filters as any)[k];
      if (Array.isArray(v)) out.push(k);
    }
    if (filters.dim_filters) {
      for (const k of Object.keys(filters.dim_filters)) out.push(k);
    }
    return out;
  }, [filters]);

  const availableDims = useMemo(
    () => dimensions.filter(d => !activeKeys.includes(d.id)),
    [dimensions, activeKeys],
  );

  const filteredAvailable = useMemo(() => {
    if (!pickerSearch.trim()) return availableDims;
    const q = pickerSearch.toLowerCase();
    return availableDims.filter(d => d.label.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  }, [availableDims, pickerSearch]);

  const addFilter = (dimId: string) => {
    if (isLegacySiteFilterKey(dimId)) {
      onChange({ ...filters, [dimId]: [] });
    } else {
      const bag = { ...(filters.dim_filters || {}), [dimId]: [] };
      onChange({ ...filters, dim_filters: bag });
    }
    setPickerOpen(false);
    setPickerSearch('');
  };

  const removeFilter = (dimId: string) => {
    if (isLegacySiteFilterKey(dimId)) {
      const next = { ...filters };
      delete (next as any)[dimId];
      onChange(next);
      return;
    }
    if (filters.dim_filters && dimId in filters.dim_filters) {
      const bag = { ...filters.dim_filters };
      delete bag[dimId];
      const next: DashboardSiteFilters = { ...filters };
      if (Object.keys(bag).length) next.dim_filters = bag;
      else delete next.dim_filters;
      onChange(next);
    }
  };

  const updateFilterValues = (dimId: string, vals: string[]) => {
    if (isLegacySiteFilterKey(dimId)) {
      onChange({ ...filters, [dimId]: vals });
      return;
    }
    const bag = { ...(filters.dim_filters || {}), [dimId]: vals };
    onChange({ ...filters, dim_filters: bag });
  };

  const clearAll = () => onChange({});

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Filtres de sites <span className="text-muted-foreground/50 font-normal normal-case">(optionnel)</span>
        </label>
        {activeKeys.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[9px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
          >
            Tout effacer
          </button>
        )}
      </div>

      {activeKeys.length > 0 && (
        <div className="space-y-2 mb-2">
          {activeKeys.map(key => {
            const dim = dimensions.find(d => d.id === key);
            if (!dim) return null;
            const selected = getDimVals(key) || [];
            return (
              <div
                key={key}
                className="group rounded-lg border border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 px-2.5 pt-2">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-wider flex-1">
                    {dim.label}
                  </span>
                  <button
                    onClick={() => removeFilter(key)}
                    className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-60 group-hover:opacity-100"
                    aria-label={`Retirer ${dim.label}`}
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="px-2.5 pb-2 pt-1">
                  <LazyDimValuesDropdown
                    dimId={dim.id}
                    selected={selected}
                    onChange={(vals) => updateFilterValues(key, vals)}
                    filters={filters}
                    initialValues={dim.values}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {availableDims.length > 0 && (
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed text-[11px] font-semibold transition-all ${
              pickerOpen
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5'
            }`}
          >
            <Plus size={12} />
            Ajouter un filtre
          </button>

          {pickerOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover rounded-lg border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden">
              {availableDims.length > 4 && (
                <div className="px-2.5 pt-2 pb-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                    <Search size={11} className="text-muted-foreground shrink-0" />
                    <input
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Rechercher un filtre..."
                      className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                      autoFocus
                    />
                  </div>
                </div>
              )}
              <div className="max-h-[220px] overflow-y-auto py-0.5">
                {filteredAvailable.length === 0 ? (
                  <p className="text-[9px] text-muted-foreground/50 text-center py-3 italic">
                    {availableDims.length === 0 ? 'Tous les filtres ajoutés' : 'Aucun résultat'}
                  </p>
                ) : (
                  filteredAvailable.map(dim => (
                    <button
                      key={dim.id}
                      onClick={() => addFilter(dim.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      <span className="font-semibold uppercase tracking-wider truncate">{dim.label}</span>
                      {dim.category && (
                        <span className="text-[8px] text-muted-foreground/60 shrink-0 normal-case">{dim.category}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeKeys.length === 0 && availableDims.length > 0 && (
        <p className="text-[9px] text-muted-foreground/60 italic mt-2 text-center">
          Aucun filtre — le dashboard inclura tous les sites
        </p>
      )}
    </div>
  );
};

const LazyDimValuesDropdown: React.FC<{
  dimId: string;
  selected: string[];
  onChange: (vals: string[]) => void;
  filters: DashboardSiteFilters;
  initialValues?: string[];
}> = ({ dimId, selected, onChange, filters, initialValues }) => {
  const [values, setValues] = useState<string[]>(initialValues && initialValues.length > 0 ? initialValues : []);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  const ctx = useMemo(() => {
    const c: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (k === dimId || k === 'dim_filters' || k === 'topo_search') continue;
      if (Array.isArray(v) && v.length > 0) c[k] = v as string[];
    }
    if (filters.dim_filters) {
      for (const [k, v] of Object.entries(filters.dim_filters)) {
        if (k === dimId) continue;
        if (Array.isArray(v) && v.length > 0) c[k] = v;
      }
    }
    return c;
  }, [filters, dimId]);

  const ctxKey = useMemo(() => {
    const entries = Object.entries(ctx)
      .map(([k, v]) => [k, [...v].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    topoApi.filterValues(dimId, ctx)
      .then(vals => {
        if (cancelled) return;
        setValues(vals);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dimId, ctxKey]);

  return <CreateFilterDropdown
    label=""
    values={values}
    selected={selected}
    onChange={onChange}
    loading={loading}
    errored={errored}
  />;
};

const CreateFilterDropdown: React.FC<{
  label: string;
  values: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  loading?: boolean;
  errored?: boolean;
}> = ({ label, values, selected, onChange, loading, errored }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const dialog = btnRef.current?.closest('[role="dialog"]') as HTMLElement | null;
      const dr = dialog?.getBoundingClientRect();
      if (dialog && dr) {
        setPos({ top: r.bottom - dr.top + dialog.scrollTop + 4, left: r.left - dr.left + dialog.scrollLeft, width: r.width });
      } else {
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false); setSearch('');
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return values;
    const q = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  if (values.length === 0) {
    return (
      <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-dashed border-border bg-muted/10 text-left">
        <span className="text-[10px] text-muted-foreground/70">
          {loading ? 'Chargement…' : errored ? 'Erreur de chargement' : 'Aucune valeur disponible'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
          open
            ? 'border-primary bg-primary/5 shadow-md'
            : selected.length > 0
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50'
        }`}
      >
        <div className="flex-1 min-w-0">
          {label && <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</span>}
          {selected.length === 0 ? (
            <span className="text-[10px] text-muted-foreground/60">Tout</span>
          ) : selected.length <= 2 ? (
            <span className="text-[10px] font-semibold text-foreground truncate block">{selected.join(', ')}</span>
          ) : (
            <span className="text-[10px] font-semibold text-foreground">{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
          <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && pos && createPortal(
        <div
          ref={ref}
          style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[9999] bg-popover rounded-lg border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden"
        >
          {values.length > 5 && (
            <div className="px-2.5 pt-2 pb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                <Search size={11} className="text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/40">
            <button onClick={() => onChange([...values])} className="text-[9px] font-semibold text-primary hover:underline">Tout sélectionner</button>
            <span className="text-muted-foreground/40">·</span>
            <button onClick={() => onChange([])} className="text-[9px] font-semibold text-destructive hover:underline">Effacer</button>
          </div>
          <div
            className="max-h-[240px] overflow-y-auto py-0.5 overscroll-contain"
            onWheel={(e) => {
              const el = e.currentTarget;
              const canScroll = el.scrollHeight > el.clientHeight;
              if (canScroll) {
                el.scrollTop += e.deltaY;
                e.stopPropagation();
              }
            }}
          >
            {filtered.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/50 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(val => {
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggle(val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {isSelected && <Check size={9} className="text-primary-foreground" />}
                    </div>
                    <span className="truncate font-medium">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        (btnRef.current?.closest('[role="dialog"]') as HTMLElement) || document.body,
      )}
    </div>
  );
};
