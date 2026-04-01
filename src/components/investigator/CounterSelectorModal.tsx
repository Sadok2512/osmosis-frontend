import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Search, Check, RotateCcw, Star, BarChart3, Filter, ChevronDown } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';

interface CounterDef {
  counter_name: string;
  display_name: string;
  family: string;
  vendor: string;
  techno: string;
  object_type: string;
  count: number;
}

interface FilterOptions {
  vendors: string[];
  families: string[];
  technos: string[];
  object_types: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: CounterDef[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

const FilterDropdown: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-emerald-500/30 pr-6 cursor-pointer"
      >
        <option value="">Tous</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
    </div>
  </div>
);

async function fetchFilterOptions(vendor?: string): Promise<FilterOptions> {
  try {
    const params = vendor ? `?vendor=${encodeURIComponent(vendor)}` : '';
    const res = await fetch(getApiUrl(`pm/counters/filter-options${params}`), { headers: getApiHeaders() });
    if (!res.ok) return { vendors: ['Nokia', 'Ericsson'], families: [], technos: [], object_types: [] };
    return res.json();
  } catch { return { vendors: ['Nokia', 'Ericsson'], families: [], technos: [], object_types: [] }; }
}

async function fetchFilteredCatalog(vendor?: string, techno?: string, family?: string, search?: string): Promise<CounterDef[]> {
  try {
    const params = new URLSearchParams();
    if (vendor) params.set('vendor', vendor);
    if (techno) params.set('techno', techno);
    if (family) params.set('family', family);
    if (search) params.set('search', search);
    params.set('limit', '5000');
    const res = await fetch(getApiUrl(`pm/counters/catalog?${params.toString()}`), { headers: getApiHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

const CounterSelectorModal: React.FC<Props> = ({ open, onClose, catalog: initialCatalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  // Filter state
  const [filterVendor, setFilterVendor] = useState<string>('');
  const [filterTechno, setFilterTechno] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ vendors: [], families: [], technos: [], object_types: [] });
  const [catalog, setCatalog] = useState<CounterDef[]>(initialCatalog);
  const [isLoading, setIsLoading] = useState(false);

  const activeFilterCount = [filterVendor, filterTechno].filter(Boolean).length;

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveFamily(null);
      setSearch('');
      setShowFavOnly(false);
      loadFavoritesDB('pm-counters').then(favs => setFavorites(favs));
      fetchFilterOptions().then(setFilterOptions);
    }
  }, [open, selectedKeys]);

  // Reload catalog + families when vendor/techno changes
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setActiveFamily(null);
    Promise.all([
      fetchFilteredCatalog(filterVendor || undefined, filterTechno || undefined),
      fetchFilterOptions(filterVendor || undefined),
    ]).then(([data, opts]) => {
      setCatalog(data);
      setFilterOptions(prev => ({ ...prev, families: opts.families, technos: opts.technos }));
      setIsLoading(false);
    });
  }, [open, filterVendor, filterTechno]);

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
  const clearFilters = () => {
    setFilterVendor(''); setFilterTechno(''); setActiveFamily(null);
  };

  const filteredCatalog = useMemo(() => {
    let items = Array.isArray(catalog) ? catalog : [];
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

  const familyCategories = useMemo(() => {
    let items = Array.isArray(catalog) ? catalog : [];
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
      <div className="relative w-[820px] max-w-[92vw] h-[580px] max-h-[85vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-600 text-white">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <h2 className="text-[13px] font-bold tracking-wide">Sélectionner des Counters PM</h2>
            <span className="text-[10px] opacity-70">{catalog.length} counters</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary bar + toggle filters */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-foreground">{selected.size} sélectionné(s)</span>
            {isLoading && <span className="text-[10px] text-muted-foreground animate-pulse">chargement...</span>}
            {!isLoading && filteredCatalog.length !== catalog.length && (
              <span className="text-[10px] text-muted-foreground">{filteredCatalog.length} affiché(s)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors',
                showFilters || activeFilterCount > 0
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="w-3 h-3" />
              Filtres
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                Effacer
              </button>
            )}
            <button onClick={reset} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* Collapsible filter bar */}
        {showFilters && (
          <div className="px-4 py-2.5 border-b border-border bg-muted/10 grid grid-cols-2 gap-3">
            <FilterDropdown label="Vendor" value={filterVendor} options={filterOptions.vendors} onChange={v => { setFilterVendor(v); setFilterTechno(''); }} />
            <FilterDropdown label="Techno" value={filterTechno} options={filterOptions.technos} onChange={setFilterTechno} />
          </div>
        )}

        {/* Body: 2-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: PM Families */}
          <div className="w-[190px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                Familles
              </p>

              {/* Favorites toggle */}
              <button
                onClick={() => setShowFavOnly(!showFavOnly)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all mb-0.5',
                  showFavOnly ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Star className={cn('w-2.5 h-2.5', showFavOnly ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/50')} />
                <span>Favoris</span>
                {favorites.length > 0 && (
                  <span className="ml-auto text-[9px] text-muted-foreground">{favorites.length}</span>
                )}
              </button>

              {/* All */}
              <button
                onClick={() => setActiveFamily(null)}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all',
                  activeFamily === null && !showFavOnly ? 'bg-emerald-600 text-white' : 'text-foreground hover:bg-muted'
                )}
              >
                <span>Tous</span>
                <span className={cn('text-[9px]', activeFamily === null && !showFavOnly ? 'text-white/70' : 'text-muted-foreground')}>
                  {totalFiltered}
                </span>
              </button>

              {Array.from(familyCategories.entries()).sort((a, b) => b[1] - a[1]).map(([fam, count]) => (
                <button
                  key={fam}
                  onClick={() => setActiveFamily(activeFamily === fam ? null : fam)}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all',
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
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground animate-pulse">Chargement...</div>
              ) : filteredCatalog.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                <>
                  {filteredCatalog.length > 200 && !search && (
                    <div className="flex items-center justify-center py-2 mb-1 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        {filteredCatalog.length} counters — <span className="font-semibold text-foreground">tapez pour rechercher</span> ou filtrez
                      </p>
                    </div>
                  )}
                  {(filteredCatalog.length > 200 && !search ? filteredCatalog.slice(0, 200) : filteredCatalog).map(c => {
                    const isSelected = selected.has(c.counter_name);
                    const isFav = favorites.includes(c.counter_name);
                    return (
                      <div
                        key={c.counter_name}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1 rounded-lg transition-all mb-px',
                          isSelected ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-muted border border-transparent'
                        )}
                      >
                        {/* Favorite star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(c.counter_name); }}
                          className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors"
                        >
                          <Star className={cn('w-2.5 h-2.5', isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/40 hover:text-amber-400')} />
                        </button>

                        {/* Checkbox + name */}
                        <button
                          onClick={() => toggle(c.counter_name)}
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
                        >
                          <div className={cn(
                            'w-3 h-3 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-border'
                          )}>
                            {isSelected && <Check className="w-2 h-2 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-medium text-foreground truncate font-mono">
                              {c.counter_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {c.vendor && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">{c.vendor}</span>
                            )}
                            {c.techno && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">{c.techno}</span>
                            )}
                            {c.family && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[100px]">{c.family}</span>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  {filteredCatalog.length > 200 && !search && (
                    <div className="text-center py-2 text-[9px] text-muted-foreground">
                      Affichage limité à 200 — utilisez la recherche
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[450px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(key => {
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
            {selected.size > 6 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 6} autres</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:opacity-90 transition-opacity">
              Ok ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterSelectorModal;
