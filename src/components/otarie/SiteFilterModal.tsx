import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, RotateCcw, Check, Filter, ChevronDown, Search, Sparkles } from 'lucide-react';
import { FILTER_DIMENSIONS, resolveAvailableValues, ActiveFilter } from '@/config/filterDimensions';
import { useFilterCache } from '@/hooks/useFilterCache';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface DashboardSiteFilters {
  dor?: string[];
  constructeur?: string[];
  plaque?: string[];
  techno?: string[];
  bande?: string[];
  zone_arcep?: string[];
  saisonnier?: string[];
  vendor?: string[];
  dr?: string[];
}

interface SiteFilterModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (filters: DashboardSiteFilters) => void;
  initialFilters?: DashboardSiteFilters;
}

/* ── Filter group card with chips ── */
const FilterGroupCard: React.FC<{
  label: string;
  values: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  globalSearch: string;
  initiallyExpanded?: boolean;
}> = ({ label, values, selected, onChange, globalSearch, initiallyExpanded = true }) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [localSearch, setLocalSearch] = useState('');

  const filtered = useMemo(() => {
    const q = (localSearch || globalSearch).trim().toLowerCase();
    if (!q) return values;
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, localSearch, globalSearch]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const selectAllVisible = () => {
    const merged = Array.from(new Set([...selected, ...filtered]));
    onChange(merged);
  };

  const clearGroup = () => onChange([]);

  if (values.length === 0) return null;

  // Auto-expand when there's a global search match
  const hasGlobalMatch = globalSearch.trim() && filtered.length > 0;
  const isExpanded = expanded || hasGlobalMatch;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-bold text-foreground uppercase tracking-wider">{label}</span>
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {values.length}
          </span>
          {selected.length > 0 && (
            <span className="text-[10px] font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-full">
              {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={cn('text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
        />
      </button>

      {/* Body */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {/* Local search + actions (only if many values) */}
          {values.length > 8 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  placeholder={`Rechercher dans ${label.toLowerCase()}…`}
                  className="h-8 pl-7 text-[11px]"
                />
              </div>
              <button
                onClick={selectAllVisible}
                className="text-[10px] font-semibold text-primary hover:underline whitespace-nowrap"
              >
                Tout
              </button>
              {selected.length > 0 && (
                <button
                  onClick={clearGroup}
                  className="text-[10px] font-semibold text-destructive hover:underline whitespace-nowrap"
                >
                  Effacer
                </button>
              )}
            </div>
          )}

          {/* Chip grid */}
          {filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic text-center py-3">
              Aucun résultat
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filtered.map(val => {
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggle(val)}
                    className={cn(
                      'group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-150 border',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90 hover:shadow-md'
                        : 'bg-muted/40 text-foreground border-transparent hover:bg-muted hover:border-primary/30',
                    )}
                  >
                    {isSelected && (
                      <Check size={10} className="shrink-0 animate-in zoom-in-50 duration-150" />
                    )}
                    <span className="truncate max-w-[180px]">{val}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SiteFilterModal: React.FC<SiteFilterModalProps> = ({ open, onClose, onApply, initialFilters }) => {
  const [filters, setFilters] = useState<DashboardSiteFilters>(initialFilters || {});
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilters(initialFilters || {});
      setGlobalSearch('');
      setActiveCategory(null);
    }
  }, [open, initialFilters]);

  const activeFilters = useMemo((): ActiveFilter[] => {
    return Object.entries(filters)
      .filter(([, vals]) => vals && vals.length > 0)
      .map(([key, vals]) => ({ id: key, dimension: key, op: 'IN' as const, values: vals! }));
  }, [filters]);

  useFilterCache(activeFilters);

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

  // Quick category chips (top dimensions)
  const QUICK_CATEGORIES = ['vendor', 'dor', 'plaque', 'site', 'techno', 'bande'];

  // Build dimensions with values, optionally filtered by quick category
  const visibleDimensions = useMemo(() => {
    return FILTER_DIMENSIONS
      .map(dim => ({
        dim,
        availableValues: resolveAvailableValues(dim.key, activeFilters),
      }))
      .filter(({ dim, availableValues }) => {
        if (availableValues.length === 0) return false;
        if (activeCategory && dim.key !== activeCategory) return false;
        return true;
      });
  }, [activeFilters, activeCategory]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl mx-4 bg-card rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-gradient-to-r from-primary/5 via-card to-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Filter size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                Filtres de Sites
                <Sparkles size={12} className="text-primary" />
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sélectionnez les critères pour affiner votre analyse réseau
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sticky search/filter bar */}
        <div className="px-6 py-3 border-b border-border shrink-0 bg-card/80 backdrop-blur-sm space-y-3">
          {/* Global search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Rechercher dans toutes les valeurs de filtres…"
              className="h-10 pl-9 text-[12px] bg-muted/30 border-border/60 focus-visible:bg-card"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Quick category chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border',
                activeCategory === null
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground',
              )}
            >
              Tous
            </button>
            {QUICK_CATEGORIES.map(cat => {
              const dim = FILTER_DIMENSIONS.find(d => d.key === cat);
              if (!dim) return null;
              const count = filters[cat as keyof DashboardSiteFilters]?.length || 0;
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? null : cat)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : count > 0
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground',
                  )}
                >
                  {dim.label}
                  {count > 0 && (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-extrabold',
                      isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-3">
              <span className="text-[10px] font-semibold text-muted-foreground">
                <span className="text-primary font-bold">{totalSelected}</span> sélectionné{totalSelected > 1 ? 's' : ''}
              </span>
              {totalSelected > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-[10px] font-semibold text-destructive hover:underline"
                >
                  Tout effacer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-muted/20">
          {visibleDimensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Search size={18} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Aucun filtre disponible</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Essayez de modifier votre recherche ou catégorie
              </p>
            </div>
          ) : (
            visibleDimensions.map(({ dim, availableValues }) => (
              <FilterGroupCard
                key={dim.key}
                label={dim.label}
                values={availableValues}
                selected={filters[dim.key as keyof DashboardSiteFilters] || []}
                onChange={(vals) => setDimValues(dim.key, vals)}
                globalSearch={globalSearch}
                initiallyExpanded={availableValues.length <= 12 || (filters[dim.key as keyof DashboardSiteFilters]?.length ?? 0) > 0}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-card">
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors"
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>
          <div className="flex items-center gap-3">
            {totalSelected > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-bold text-primary">
                  {totalSelected} filtre{totalSelected > 1 ? 's' : ''} actif{totalSelected > 1 ? 's' : ''}
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/85 text-primary-foreground text-[11px] font-bold uppercase tracking-wider hover:shadow-lg hover:shadow-primary/30 transition-all shadow-md"
            >
              <Check size={13} /> Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteFilterModal;
