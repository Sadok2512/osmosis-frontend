import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { X, RotateCcw, Check, Filter, ChevronDown, Search } from 'lucide-react';
import { FILTER_DIMENSIONS, resolveAvailableValues, ActiveFilter } from '@/config/filterDimensions';
import { useFilterCache } from '@/hooks/useFilterCache';
import { cn } from '@/lib/utils';

export interface DashboardSiteFilters {
  dor?: string[];
  constructeur?: string[];
  plaque?: string[];
  techno?: string[];
  bande?: string[];
  zone_arcep?: string[];
  saisonnier?: string[];
}

interface SiteFilterModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (filters: DashboardSiteFilters) => void;
  initialFilters?: DashboardSiteFilters;
}

/* ── Multi-select dropdown ── */
const MultiSelectDropdown: React.FC<{
  label: string;
  values: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}> = ({ label, values, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return values;
    const q = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const selectAll = () => onChange([...values]);
  const clearAll = () => onChange([]);

  if (values.length === 0) return null;

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-all',
          open
            ? 'border-primary bg-primary/5 shadow-md'
            : selected.length > 0
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50'
        )}
      >
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">{label}</span>
          {selected.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/60">Tout</span>
          ) : selected.length <= 2 ? (
            <span className="text-[11px] font-semibold text-foreground truncate block">{selected.join(', ')}</span>
          ) : (
            <span className="text-[11px] font-semibold text-foreground">{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selected.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-card rounded-xl border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden">
          {/* Search */}
          {values.length > 5 && (
            <div className="px-3 pt-2.5 pb-1.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Select all / Clear */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/40">
            <button onClick={selectAll} className="text-[10px] font-semibold text-primary hover:underline">Tout sélectionner</button>
            <span className="text-muted-foreground/40">·</span>
            <button onClick={clearAll} className="text-[10px] font-semibold text-destructive hover:underline">Effacer</button>
          </div>

          {/* Options */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center py-3 italic">Aucun résultat</p>
            ) : (
              filtered.map(val => {
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggle(val)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors',
                      isSelected
                        ? 'bg-primary/5 text-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-border'
                    )}>
                      {isSelected && <Check size={10} className="text-primary-foreground" />}
                    </div>
                    <span className="truncate">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SiteFilterModal: React.FC<SiteFilterModalProps> = ({ open, onClose, onApply, initialFilters }) => {
  useFilterCache(); // triggers fetch + re-render when backend filters are loaded
  const [filters, setFilters] = useState<DashboardSiteFilters>(initialFilters || {});

  const activeFilters = useMemo((): ActiveFilter[] => {
    return Object.entries(filters)
      .filter(([, vals]) => vals && vals.length > 0)
      .map(([key, vals]) => ({ id: key, dimension: key, op: 'IN' as const, values: vals! }));
  }, [filters]);

  const setDimValues = useCallback((dimKey: string, vals: string[]) => {
    setFilters(prev => ({ ...prev, [dimKey]: vals.length > 0 ? vals : undefined }));
  }, []);

  const resetFilters = () => setFilters({});

  const totalSelected = useMemo(() => {
    return Object.values(filters).reduce((sum, v) => sum + (v?.length || 0), 0);
  }, [filters]);

  const handleApply = () => {
    const clean: DashboardSiteFilters = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v && v.length > 0) (clean as any)[k] = v;
    }
    onApply(clean);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl mx-4 bg-card rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Filter size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Filtres de Sites</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sélectionnez les critères pour filtrer les sites</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {FILTER_DIMENSIONS.map(dim => {
            const availableValues = resolveAvailableValues(dim.key, activeFilters);
            const selectedValues = filters[dim.key as keyof DashboardSiteFilters] || [];
            if (availableValues.length === 0 && !dim.values) return null;

            return (
              <MultiSelectDropdown
                key={dim.key}
                label={dim.label}
                values={availableValues}
                selected={selectedValues}
                onChange={(vals) => setDimValues(dim.key, vals)}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/30">
          <button onClick={resetFilters} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors">
            <RotateCcw size={12} /> Réinitialiser
          </button>
          <div className="flex items-center gap-3">
            {totalSelected > 0 && (
              <span className="text-[10px] font-semibold text-primary">{totalSelected} filtre{totalSelected > 1 ? 's' : ''}</span>
            )}
            <button onClick={handleApply} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors shadow-lg">
              <Check size={13} /> Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteFilterModal;
