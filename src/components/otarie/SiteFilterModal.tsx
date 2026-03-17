import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw, Check, Filter, ChevronDown, Target, MinusCircle, Plus, Eraser } from 'lucide-react';
import { FILTER_DIMENSIONS, resolveAvailableValues, ActiveFilter } from '@/config/filterDimensions';
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

type DropdownAction = 'select_only' | 'exclude' | 'add' | 'clear';

/* ── Split button with dropdown ── */
const SplitFilterChip: React.FC<{
  label: string;
  active: boolean;
  dimKey: string;
  allValues: string[];
  onToggle: () => void;
  onAction: (action: DropdownAction, val: string) => void;
}> = ({ label, active, dimKey, allValues, onToggle, onAction }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div ref={chipRef} className="relative shrink-0">
      <div
        className={cn(
          'flex items-stretch rounded-full border transition-all',
          active
            ? 'bg-primary border-primary shadow-md'
            : 'bg-muted/40 border-border hover:border-primary/30'
        )}
      >
        {/* Main label area */}
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors rounded-l-full',
            active
              ? 'text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {active && <Check size={10} className="shrink-0" />}
          {label}
        </button>

        {/* Divider */}
        <div className={cn('w-px my-1.5', active ? 'bg-primary-foreground/25' : 'bg-border')} />

        {/* Dropdown arrow */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className={cn(
            'flex items-center justify-center px-1.5 rounded-r-full transition-colors',
            active
              ? 'text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/80'
              : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
          )}
        >
          <ChevronDown size={11} className={cn('transition-transform', menuOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] bg-card rounded-xl border border-border shadow-xl py-1 animate-in fade-in-0 zoom-in-95 duration-150">
          <button
            onClick={() => { onAction('select_only', label); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Target size={12} className="text-primary shrink-0" />
            Sélectionner uniquement
          </button>
          <button
            onClick={() => { onAction('add', label); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Plus size={12} className="text-primary shrink-0" />
            Ajouter à la sélection
          </button>
          <button
            onClick={() => { onAction('exclude', label); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <MinusCircle size={12} className="shrink-0" />
            Exclure
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { onAction('clear', label); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Eraser size={12} className="shrink-0" />
            Effacer le groupe
          </button>
        </div>
      )}
    </div>
  );
};

/* ── Scrollable split-button row ── */
const ScrollableSplitRow: React.FC<{
  dimKey: string;
  values: string[];
  selected: string[];
  onToggle: (val: string) => void;
  onAction: (action: DropdownAction, val: string) => void;
}> = ({ dimKey, values, selected, onToggle, onAction }) => {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === 'left' ? -180 : 180, behavior: 'smooth' });
  };

  if (values.length === 0) return <p className="text-[10px] text-muted-foreground/50 italic px-3 py-2">Aucune valeur disponible</p>;

  return (
    <div className="relative flex items-center group">
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-card/95 border border-border shadow-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
        style={{ transform: 'translateX(-30%)' }}
      >
        <ChevronLeft size={14} />
      </button>

      <div
        ref={ref}
        className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none scroll-smooth"
      >
        {values.map(val => (
          <SplitFilterChip
            key={val}
            label={val}
            active={selected.includes(val)}
            dimKey={dimKey}
            allValues={values}
            onToggle={() => onToggle(val)}
            onAction={(action) => onAction(action, val)}
          />
        ))}
      </div>

      <button
        onClick={() => scroll('right')}
        className="absolute right-0 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-card/95 border border-border shadow-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
        style={{ transform: 'translateX(30%)' }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

const SiteFilterModal: React.FC<SiteFilterModalProps> = ({ open, onClose, onApply, initialFilters }) => {
  const [filters, setFilters] = useState<DashboardSiteFilters>(initialFilters || {});

  const activeFilters = useMemo((): ActiveFilter[] => {
    return Object.entries(filters)
      .filter(([, vals]) => vals && vals.length > 0)
      .map(([key, vals]) => ({ id: key, dimension: key, op: 'IN' as const, values: vals! }));
  }, [filters]);

  const toggleValue = useCallback((dimKey: string, val: string) => {
    setFilters(prev => {
      const current = prev[dimKey as keyof DashboardSiteFilters] || [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [dimKey]: next.length > 0 ? next : undefined };
    });
  }, []);

  const handleAction = useCallback((dimKey: string, action: DropdownAction, val: string, allValues: string[]) => {
    setFilters(prev => {
      const copy = { ...prev };
      switch (action) {
        case 'select_only':
          (copy as any)[dimKey] = [val];
          break;
        case 'add': {
          const cur = copy[dimKey as keyof DashboardSiteFilters] || [];
          if (!cur.includes(val)) (copy as any)[dimKey] = [...cur, val];
          break;
        }
        case 'exclude': {
          const all = allValues.filter(v => v !== val);
          (copy as any)[dimKey] = all.length > 0 ? all : undefined;
          break;
        }
        case 'clear':
          (copy as any)[dimKey] = undefined;
          break;
      }
      return copy;
    });
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-card rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Filter size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Filtres de Sites</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sélectionnez les critères pour filtrer les sites affichés sur la carte</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {FILTER_DIMENSIONS.map(dim => {
            const availableValues = resolveAvailableValues(dim.key, activeFilters);
            const selectedValues = filters[dim.key as keyof DashboardSiteFilters] || [];
            if (availableValues.length === 0 && !dim.values) return null;

            return (
              <div key={dim.key} className="border border-border rounded-xl bg-muted/20 overflow-visible">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
                  <span className="text-xs font-bold text-foreground tracking-wide">{dim.label}</span>
                  {selectedValues.length > 0 && (
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, [dim.key]: undefined }))}
                      className="flex items-center gap-1 text-[10px] text-destructive font-semibold hover:underline transition-colors"
                    >
                      <X size={10} /> {selectedValues.length} sélectionné{selectedValues.length > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
                <ScrollableSplitRow
                  dimKey={dim.key}
                  values={availableValues}
                  selected={selectedValues}
                  onToggle={(val) => toggleValue(dim.key, val)}
                  onAction={(action, val) => handleAction(dim.key, action, val, availableValues)}
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/30">
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors"
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>

          <div className="flex items-center gap-3">
            {totalSelected > 0 && (
              <span className="text-[10px] font-semibold text-primary">
                {totalSelected} filtre{totalSelected > 1 ? 's' : ''} actif{totalSelected > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors shadow-lg"
            >
              <Check size={13} /> Appliquer les filtres
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteFilterModal;
