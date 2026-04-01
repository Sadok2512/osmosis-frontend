import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Search, Check, RotateCcw, ChevronRight, BarChart3, Filter, ChevronDown, Star, ChevronUp } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { KpiCatalogEntry, AxisSide } from './types';
import { cn } from '@/lib/utils';

interface KpiSelectorModalProps {
  open: boolean;
  onClose: () => void;
  catalog: KpiCatalogEntry[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
  axisAssignments?: Record<string, AxisSide>;
  onAxisAssignmentsChange?: (assignments: Record<string, AxisSide>) => void;
}

// ── Filter section component ──
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
              'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
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
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
                selected === opt.value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.count !== undefined && (
                <span className={cn('text-[8px] shrink-0 tabular-nums', selected === opt.value ? 'text-primary/70' : 'text-muted-foreground')}>
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

const KpiSelectorModal: React.FC<KpiSelectorModalProps> = ({ open, onClose, catalog, selectedKeys, onConfirm, axisAssignments: extAxisAssignments, onAxisAssignmentsChange }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [axisMap, setAxisMap] = useState<Record<string, AxisSide>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  const [filterVendor, setFilterVendor] = useState('');
  const [filterTechno, setFilterTechno] = useState('');
  const [filterNormalized, setFilterNormalized] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveCategory(null);
      setSearch('');
      setFilterVendor('');
      setFilterTechno('');
      setFilterNormalized('');
      setFilterLevel('');
      setShowFavOnly(false);
      setAxisMap(extAxisAssignments || {});
      loadFavoritesDB('kpi-monitor').then(favs => setFavorites(favs));
    }
  }, [open, selectedKeys, extAxisAssignments]);

  const toggleAxis = useCallback((key: string) => {
    setAxisMap(prev => {
      const current = prev[key] || 'left';
      const next = { ...prev, [key]: (current === 'left' ? 'right' : 'left') as AxisSide };
      onAxisAssignmentsChange?.(next);
      return next;
    });
  }, [onAxisAssignmentsChange]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveFavoritesDB(next, 'kpi-monitor');
      return next;
    });
  }, []);

  // Extract unique filter values from catalog
  const filterOptions = useMemo(() => {
    const vendors = new Map<string, number>();
    const technos = new Map<string, number>();
    const levels = new Map<string, number>();

    for (const k of catalog) {
      if (k.vendor) vendors.set(k.vendor, (vendors.get(k.vendor) || 0) + 1);
      if (k.techno) technos.set(k.techno, (technos.get(k.techno) || 0) + 1);
      if (k.supported_levels) {
        for (const l of k.supported_levels) {
          if (l.trim()) levels.set(l.trim(), (levels.get(l.trim()) || 0) + 1);
        }
      }
    }

    const normalizedCount = catalog.filter(k => k.is_normalized).length;
    const vendorSpecificCount = catalog.filter(k => !k.is_normalized).length;

    return {
      vendors: Array.from(vendors.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      technos: Array.from(technos.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      levels: Array.from(levels.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      normalizedCount,
      vendorSpecificCount,
    };
  }, [catalog]);

  const activeFilterCount = [filterVendor, filterTechno, filterNormalized, filterLevel, showFavOnly ? 'fav' : ''].filter(Boolean).length;

  // ── SINGLE SOURCE OF TRUTH: base filtered (filters only, no category, no search) ──
  const baseFiltered = useMemo(() => {
    let items = catalog;
    if (showFavOnly) items = items.filter(k => favorites.includes(k.kpi_key));
    if (filterVendor) items = items.filter(k => k.vendor === filterVendor);
    if (filterTechno) items = items.filter(k => k.techno === filterTechno);
    if (filterNormalized === 'normalized') items = items.filter(k => k.is_normalized);
    if (filterNormalized === 'vendor-specific') items = items.filter(k => !k.is_normalized);
    if (filterLevel) items = items.filter(k => k.supported_levels?.includes(filterLevel));
    return items;
  }, [catalog, filterVendor, filterTechno, filterNormalized, filterLevel, showFavOnly, favorites]);

  // Categories derived from baseFiltered
  const tabCategories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const k of baseFiltered) {
      const cat = k.category || 'Other';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    }
    return cats;
  }, [baseFiltered]);

  const totalFiltered = baseFiltered.length;

  // Final filtered list = baseFiltered + category + search
  const filteredCatalog = useMemo(() => {
    let items = baseFiltered;
    if (activeCategory) items = items.filter(k => k.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(k =>
        k.display_name.toLowerCase().includes(q) ||
        k.kpi_key.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q)
      );
    }
    return items;
  }, [baseFiltered, activeCategory, search]);

  // Reset activeCategory if it no longer exists in filtered set
  useEffect(() => {
    if (activeCategory && !tabCategories.has(activeCategory)) {
      setActiveCategory(null);
    }
  }, [tabCategories, activeCategory]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const reset = () => setSelected(new Set());
  const clearFilters = () => {
    setFilterVendor(''); setFilterTechno(''); setFilterNormalized('');
    setFilterLevel(''); setActiveCategory(null); setShowFavOnly(false);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onAxisAssignmentsChange?.(axisMap);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm pl-[240px]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[1060px] max-w-[calc(100vw-280px)] h-[640px] max-h-[85vh] flex flex-col rounded-xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-primary text-primary-foreground shrink-0">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4" />
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
            <span className="text-[10px] opacity-70 tabular-nums">{totalFiltered} KPIs{filteredCatalog.length !== totalFiltered ? ` · ${filteredCatalog.length} affichés` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tabular-nums">{selected.size} sélectionné(s)</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Active filters summary ── */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30 shrink-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Filtres :</span>
            <div className="flex flex-wrap gap-1">
              {showFavOnly && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[9px] font-medium"><Star className="w-2.5 h-2.5 fill-amber-500" />Favoris</span>}
              {filterVendor && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-medium">{filterVendor}</span>}
              {filterTechno && <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-medium">{filterTechno}</span>}
              {filterNormalized && <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 text-[9px] font-medium">{filterNormalized === 'normalized' ? 'Normalisé' : 'Vendor-Specific'}</span>}
              {filterLevel && <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[9px] font-medium">{filterLevel}</span>}
            </div>
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-[9px] font-medium text-destructive hover:underline">
              <RotateCcw className="w-2.5 h-2.5" /> Effacer
            </button>
          </div>
        )}

        {/* ── Body: 3-panel layout ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left Sidebar: Filters */}
          <div className="w-[190px] shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Filtres</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center ml-auto">
                    {activeFilterCount}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Favorites toggle */}
              <div className="border-b border-border/30">
                <button
                  onClick={() => setShowFavOnly(!showFavOnly)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 transition-colors',
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

              <FilterSection label="Type" selected={filterNormalized} onChange={setFilterNormalized} options={[
                { value: 'normalized', label: 'Normalisé', count: filterOptions.normalizedCount },
                { value: 'vendor-specific', label: 'Vendor-Specific', count: filterOptions.vendorSpecificCount },
              ]} />
              <FilterSection label="Vendor" selected={filterVendor} onChange={setFilterVendor} options={filterOptions.vendors} />
              <FilterSection label="Technology" selected={filterTechno} onChange={setFilterTechno} options={filterOptions.technos} />
              {filterOptions.levels.length > 0 && (
                <FilterSection label="Level" selected={filterLevel} onChange={setFilterLevel} options={filterOptions.levels} defaultOpen={false} />
              )}
            </div>

            {activeFilterCount > 0 && (
              <div className="px-3 py-2 border-t border-border/40 shrink-0">
                <button onClick={clearFilters} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Effacer les filtres
                </button>
              </div>
            )}
          </div>

          {/* Middle: Categories */}
          <div className="w-[180px] shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Catégories</p>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-0.5',
                  activeCategory === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                )}
              >
                <span>Tous</span>
                <div className="flex items-center gap-1">
                  <span className={cn('text-[9px] tabular-nums', activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {totalFiltered}
                  </span>
                  <ChevronRight className="w-3 h-3 opacity-50" />
                </div>
              </button>
              {Array.from(tabCategories.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-0.5',
                    activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <div className="flex items-center gap-1">
                    <span className={cn('text-[9px] shrink-0 tabular-nums', activeCategory === cat ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {count}
                    </span>
                    <ChevronRight className="w-3 h-3 opacity-50" />
                  </div>
                </button>
              ))}
              {tabCategories.size === 0 && (
                <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground">Aucune catégorie</div>
              )}
            </div>
          </div>

          {/* Right: KPI list */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Search */}
            <div className="px-3 py-2 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`${filteredCatalog.length} KPIs — rechercher…`}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* KPI items */}
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {filteredCatalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <span className="text-xs text-muted-foreground">Aucun KPI trouvé pour les filtres sélectionnés</span>
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">Effacer les filtres</button>
                  )}
                </div>
              ) : (
                <>
                  {filteredCatalog.length > 200 && !search && (
                    <div className="flex items-center justify-center py-2 mb-1 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        {filteredCatalog.length} KPIs — <span className="font-semibold text-foreground">tapez pour rechercher</span> ou filtrez par catégorie
                      </p>
                    </div>
                  )}
                  {(filteredCatalog.length > 200 && !search ? filteredCatalog.slice(0, 200) : filteredCatalog).map(k => {
                    const isSelected = selected.has(k.kpi_key);
                    const isFav = favorites.includes(k.kpi_key);
                    return (
                      <div
                        key={k.kpi_key}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all mb-px group',
                          isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/60 border border-transparent'
                        )}
                      >
                        {/* Favorite star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(k.kpi_key); }}
                          className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors"
                        >
                          <Star className={cn('w-3 h-3', isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30 group-hover:text-amber-400/60')} />
                        </button>

                        {/* Select checkbox + info */}
                        <button
                          onClick={() => toggle(k.kpi_key)}
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
                        >
                          <div className={cn(
                            'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            isSelected ? 'bg-primary border-primary' : 'border-border'
                          )}>
                            {isSelected && <Check className="w-2 h-2 text-primary-foreground" />}
                          </div>

                          {/* Name + description */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground truncate">{k.display_name}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{k.description || k.kpi_key}</p>
                          </div>

                          {/* Badges — fixed-width for alignment */}
                          <div className="flex items-center shrink-0" style={{ width: '200px' }}>
                            <div className="w-[60px] flex justify-center">
                              {k.vendor && (
                                <span className={cn(
                                  'text-[8px] px-1.5 py-0.5 rounded font-medium truncate max-w-[56px]',
                                  k.vendor === 'Ericsson' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'
                                )}>{k.vendor}</span>
                              )}
                            </div>
                            <div className="w-[48px] flex justify-center">
                              {k.techno && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">{k.techno}</span>
                              )}
                            </div>
                            <div className="w-[44px] flex justify-center">
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
                            </div>
                            <div className="w-[48px] flex justify-center">
                              {k.category && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground truncate max-w-[46px]">{k.category}</span>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* L/R axis toggle */}
                        {isSelected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAxis(k.kpi_key); }}
                            className={cn(
                              'shrink-0 w-6 h-5 rounded text-[8px] font-black flex items-center justify-center border transition-all',
                              (axisMap[k.kpi_key] || 'left') === 'left'
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-accent/50 border-accent text-accent-foreground'
                            )}
                            title={(axisMap[k.kpi_key] || 'left') === 'left' ? 'Axe gauche' : 'Axe droit'}
                          >
                            {(axisMap[k.kpi_key] || 'left') === 'left' ? 'L' : 'R'}
                          </button>
                        )}
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

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card shrink-0">
          <div className="flex flex-wrap gap-1 max-w-[550px] overflow-hidden">
            {Array.from(selected).slice(0, 8).map(key => {
              const k = catalog.find(c => c.kpi_key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
                  <span className={cn(
                    'w-3 h-3 rounded text-[7px] font-black flex items-center justify-center',
                    (axisMap[key] || 'left') === 'left' ? 'bg-primary/20' : 'bg-accent/50'
                  )}>
                    {(axisMap[key] || 'left') === 'left' ? 'L' : 'R'}
                  </span>
                  {k?.display_name || key}
                  <button onClick={() => toggle(key)} className="ml-0.5 hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            {selected.size > 8 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 8} autres</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity tabular-nums">
              Ok ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KpiSelectorModal;
