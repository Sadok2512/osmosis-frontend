import React, { useState, useMemo, useCallback } from 'react';
import { X, Search, Check, RotateCcw, Filter, Star, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { cn } from '@/lib/utils';

interface CounterDef {
  counter_name: string;
  display_name: string;
  family: string;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: CounterDef[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

const FilterSection: React.FC<{
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string;
  onChange: (v: string) => void;
  defaultOpen?: boolean;
}> = ({ label, options, selected, onChange, defaultOpen = true }) => {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', selected ? 'text-primary' : 'text-muted-foreground')}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          {selected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          <button
            onClick={() => onChange('')}
            className={cn(
              'w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium transition-all',
              !selected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <span>Tous</span>
          </button>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(selected === opt.value ? '' : opt.value)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                selected === opt.value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.count !== undefined && (
                <span className={cn('text-[8px] shrink-0', selected === opt.value ? 'text-primary/70' : 'text-muted-foreground')}>
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const CounterSelectorModal: React.FC<Props> = ({ open, onClose, catalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveFamily(null);
      setSearch('');
      setShowFavOnly(false);
      loadFavoritesDB('pm-counters').then(favs => setFavorites(favs));
    }
  }, [open, selectedKeys]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveFavoritesDB(next, 'pm-counters');
      return next;
    });
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reset = () => setSelected(new Set());

  // Filter
  const filteredCatalog = useMemo(() => {
    let items = catalog;
    if (showFavOnly) items = items.filter(c => favorites.includes(c.counter_name));
    if (activeFamily) items = items.filter(c => c.family === activeFamily);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        c.counter_name.toLowerCase().includes(q) ||
        c.display_name.toLowerCase().includes(q) ||
        c.family.toLowerCase().includes(q)
      );
    }
    return items;
  }, [catalog, activeFamily, search, showFavOnly, favorites]);

  // Families (categories) computed from filtered data
  const familyCategories = useMemo(() => {
    let items = catalog;
    if (showFavOnly) items = items.filter(c => favorites.includes(c.counter_name));
    const fams = new Map<string, number>();
    for (const c of items) {
      const f = c.family || 'Other';
      fams.set(f, (fams.get(f) || 0) + 1);
    }
    return fams;
  }, [catalog, showFavOnly, favorites]);

  const totalFiltered = Array.from(familyCategories.values()).reduce((a, b) => a + b, 0);

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[1100px] max-w-[95vw] h-[720px] max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-emerald-600 text-white">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4" />
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des Counters PM</h2>
            <span className="text-[10px] opacity-70">{catalog.length} counters{filteredCatalog.length !== catalog.length ? ` · ${filteredCatalog.length} filtrés` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold">{selected.size} sélectionné(s)</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: 3-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Filters */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Filtres</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* Favorites toggle */}
              <div className="border-b border-border/30">
                <button
                  onClick={() => setShowFavOnly(!showFavOnly)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 transition-colors',
                    showFavOnly ? 'bg-amber-500/10' : 'hover:bg-muted/30'
                  )}
                >
                  <Star className={cn('w-3.5 h-3.5', showFavOnly ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground')} />
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', showFavOnly ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                    Favoris
                  </span>
                  {favorites.length > 0 && (
                    <span className="ml-auto text-[8px] font-bold text-muted-foreground bg-muted rounded-full w-4 h-4 flex items-center justify-center">
                      {favorites.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Has Normalized Name filter */}
              <FilterSection
                label="Type"
                selected=""
                onChange={() => {}}
                options={[
                  { value: 'mapped', label: 'Avec nom normalisé', count: catalog.filter(c => c.display_name !== c.counter_name).length },
                  { value: 'raw', label: 'Compteur brut', count: catalog.filter(c => c.display_name === c.counter_name).length },
                ]}
                defaultOpen={false}
              />
            </div>

            {showFavOnly && (
              <div className="px-3 py-2 border-t border-border/40">
                <button
                  onClick={() => setShowFavOnly(false)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Effacer les filtres
                </button>
              </div>
            )}
          </div>

          {/* Middle: Families (= Categories) */}
          <div className="w-[180px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                PM Families
              </p>
              <button
                onClick={() => setActiveFamily(null)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                  activeFamily === null ? 'bg-emerald-600 text-white' : 'text-foreground hover:bg-muted'
                )}
              >
                <span>Tous</span>
                <span className={cn('text-[9px]', activeFamily === null ? 'text-white/70' : 'text-muted-foreground')}>
                  {totalFiltered}
                </span>
              </button>
              {Array.from(familyCategories.entries()).sort((a, b) => b[1] - a[1]).map(([fam, count]) => (
                <button
                  key={fam}
                  onClick={() => setActiveFamily(activeFamily === fam ? null : fam)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    activeFamily === fam ? 'bg-emerald-600 text-white' : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="truncate">{fam}</span>
                  <span className={cn('text-[9px] shrink-0 ml-1', activeFamily === fam ? 'text-white/70' : 'text-muted-foreground')}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Counter list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search */}
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un counter..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Counter items */}
            <div className="flex-1 overflow-y-auto px-3 py-1">
              {filteredCatalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <span className="text-xs text-muted-foreground">Aucun résultat</span>
                </div>
              ) : (
                <>
                  {filteredCatalog.length > 200 && !search && (
                    <div className="flex items-center justify-center py-3 mb-1 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        {filteredCatalog.length} counters — <span className="font-semibold text-foreground">tapez pour rechercher</span> ou filtrez par famille
                      </p>
                    </div>
                  )}
                  {(filteredCatalog.length > 200 && !search ? filteredCatalog.slice(0, 200) : filteredCatalog).map(c => {
                    const isSelected = selected.has(c.counter_name);
                    const isFav = favorites.includes(c.counter_name);
                    const hasNormalized = c.display_name !== c.counter_name;
                    return (
                      <div
                        key={c.counter_name}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all mb-px',
                          isSelected ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-muted border border-transparent'
                        )}
                      >
                        {/* Favorite star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(c.counter_name); }}
                          className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors"
                        >
                          <Star className={cn('w-3 h-3', isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/40 hover:text-amber-400')} />
                        </button>

                        {/* Checkbox + info */}
                        <button
                          onClick={() => toggle(c.counter_name)}
                          className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                        >
                          <div className={cn(
                            'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-border'
                          )}>
                            {isSelected && <Check className="w-2 h-2 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground truncate font-mono">
                              {c.counter_name}
                            </p>
                            {hasNormalized && (
                              <p className="text-[9px] text-muted-foreground truncate">{c.display_name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium truncate max-w-[100px]">
                              {c.family.replace('LTE_', '')}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  {filteredCatalog.length > 200 && !search && (
                    <div className="text-center py-2 text-[9px] text-muted-foreground">
                      Affichage limité à 200 — utilisez la recherche pour trouver un counter
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[600px] overflow-hidden">
            {Array.from(selected).slice(0, 8).map(key => {
              const c = catalog.find(x => x.counter_name === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] font-semibold font-mono">
                  {c?.display_name || key}
                  <button onClick={() => toggle(key)} className="ml-0.5 hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            {selected.size > 8 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 8} autres</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:opacity-90 transition-opacity">
              Ok ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterSelectorModal;
