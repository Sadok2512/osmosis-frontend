import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  X, Search, Check, RotateCcw, ChevronRight, ChevronDown, Star, Clock,
  ArrowUpDown, Info,
} from 'lucide-react';
import { KpiCatalogEntry } from './types';
import { useKpiPreferences } from './useKpiPreferences';

// ── Types ──
type SortMode = 'recent' | 'alpha' | 'category';

interface KpiSelectorModalProps {
  open: boolean;
  onClose: () => void;
  catalog: KpiCatalogEntry[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

// ── Highlight matched text ──
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ── Filter checkbox group ──
const FilterSection: React.FC<{
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}> = ({ title, options, selected, onToggle }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (options.length === 0) return null;
  return (
    <div className="mb-3">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 w-full text-left px-2 py-1">
        <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
        {selected.size > 0 && (
          <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{selected.size}</span>
        )}
      </button>
      {!collapsed && (
        <div className="pl-2 pr-1 space-y-0.5 max-h-[120px] overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-colors ${
                selected.has(opt) ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                selected.has(opt) ? 'bg-primary border-primary' : 'border-border'
              }`}>
                {selected.has(opt) && <Check className="w-2 h-2 text-primary-foreground" />}
              </div>
              <span className="truncate">{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── KPI Preview tooltip ──
const KpiPreview: React.FC<{ kpi: KpiCatalogEntry; position: { top: number; left: number } }> = ({ kpi, position }) => (
  <div
    className="fixed z-[10000] w-[280px] p-3 rounded-xl bg-popover border border-border shadow-xl pointer-events-none"
    style={{ top: position.top, left: position.left }}
  >
    <p className="text-xs font-bold text-foreground mb-1">{kpi.display_name}</p>
    <p className="text-[10px] text-muted-foreground mb-2 line-clamp-3">{kpi.description || 'Pas de description'}</p>
    <div className="grid grid-cols-2 gap-1.5 text-[9px]">
      <div><span className="text-muted-foreground">Clé:</span> <span className="font-mono text-foreground">{kpi.kpi_key}</span></div>
      <div><span className="text-muted-foreground">Unité:</span> <span className="text-foreground">{kpi.unit || '–'}</span></div>
      {kpi.formula_sql && <div className="col-span-2"><span className="text-muted-foreground">Formule:</span> <span className="font-mono text-foreground truncate">{kpi.formula_sql}</span></div>}
      {kpi.vendor && <div><span className="text-muted-foreground">Vendor:</span> <span className="text-foreground">{kpi.vendor}</span></div>}
      {kpi.techno && <div><span className="text-muted-foreground">Techno:</span> <span className="text-foreground">{kpi.techno}</span></div>}
      {kpi.thresholds && (
        <div className="col-span-2">
          <span className="text-muted-foreground">Seuils:</span>{' '}
          <span className="text-yellow-500">⚠ {kpi.thresholds.warning}</span>{' '}
          <span className="text-destructive">🔴 {kpi.thresholds.critical}</span>
        </div>
      )}
    </div>
  </div>
);

// ── Main component ──
const KpiSelectorModal: React.FC<KpiSelectorModalProps> = ({ open, onClose, catalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [previewKpi, setPreviewKpi] = useState<{ kpi: KpiCatalogEntry; pos: { top: number; left: number } } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Multi-select filters
  const [filterVendors, setFilterVendors] = useState<Set<string>>(new Set());
  const [filterTechnos, setFilterTechnos] = useState<Set<string>>(new Set());
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set()); // 'normalized', 'vendor-specific'
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());

  const { recent, favorites, addRecent, toggleFavorite, isFavorite } = useKpiPreferences();

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveCategory(null);
      setSearch('');
      setFilterVendors(new Set());
      setFilterTechnos(new Set());
      setFilterTypes(new Set());
      setFilterLevels(new Set());
      setPreviewKpi(null);
    }
  }, [open, selectedKeys]);

  // Extract unique filter values
  const filterOptions = useMemo(() => {
    const vendors = new Set<string>();
    const technos = new Set<string>();
    const levels = new Set<string>();
    for (const k of catalog) {
      if (k.vendor) vendors.add(k.vendor);
      if (k.techno) technos.add(k.techno);
      if (k.supported_levels) k.supported_levels.forEach(l => l.trim() && levels.add(l.trim()));
    }
    return {
      vendors: Array.from(vendors).sort(),
      technos: Array.from(technos).sort(),
      levels: Array.from(levels).sort(),
      types: ['Normalisé', 'Vendor-specific'],
    };
  }, [catalog]);

  const toggleSet = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });
  }, []);

  const activeFilterCount = filterVendors.size + filterTechnos.size + filterTypes.size + filterLevels.size;

  const clearAllFilters = useCallback(() => {
    setFilterVendors(new Set());
    setFilterTechnos(new Set());
    setFilterTypes(new Set());
    setFilterLevels(new Set());
    setActiveCategory(null);
  }, []);

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    let items = catalog;
    if (filterVendors.size) items = items.filter(k => k.vendor && filterVendors.has(k.vendor));
    if (filterTechnos.size) items = items.filter(k => k.techno && filterTechnos.has(k.techno));
    if (filterTypes.has('Normalisé') && !filterTypes.has('Vendor-specific')) items = items.filter(k => k.is_normalized);
    if (filterTypes.has('Vendor-specific') && !filterTypes.has('Normalisé')) items = items.filter(k => !k.is_normalized);
    if (filterLevels.size) items = items.filter(k => k.supported_levels?.some(l => filterLevels.has(l)));
    if (activeCategory) items = items.filter(k => k.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(k =>
        k.display_name.toLowerCase().includes(q) ||
        k.kpi_key.toLowerCase().includes(q) ||
        (k.description || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [catalog, filterVendors, filterTechnos, filterTypes, filterLevels, activeCategory, search]);

  // Sort
  const sortedCatalog = useMemo(() => {
    const items = [...filteredCatalog];
    switch (sortMode) {
      case 'alpha':
        return items.sort((a, b) => a.display_name.localeCompare(b.display_name));
      case 'category':
        return items.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.display_name.localeCompare(b.display_name));
      case 'recent': {
        // Favorites first, then recent, then rest
        return items.sort((a, b) => {
          const aFav = isFavorite(a.kpi_key) ? 0 : 1;
          const bFav = isFavorite(b.kpi_key) ? 0 : 1;
          if (aFav !== bFav) return aFav - bFav;
          const aRecent = recent.indexOf(a.kpi_key);
          const bRecent = recent.indexOf(b.kpi_key);
          const aR = aRecent === -1 ? 999 : aRecent;
          const bR = bRecent === -1 ? 999 : bRecent;
          if (aR !== bR) return aR - bR;
          return a.display_name.localeCompare(b.display_name);
        });
      }
      default: return items;
    }
  }, [filteredCatalog, sortMode, recent, isFavorite]);

  // Categories from filtered (without category filter)
  const tabCategories = useMemo(() => {
    let items = catalog;
    if (filterVendors.size) items = items.filter(k => k.vendor && filterVendors.has(k.vendor));
    if (filterTechnos.size) items = items.filter(k => k.techno && filterTechnos.has(k.techno));
    if (filterTypes.has('Normalisé') && !filterTypes.has('Vendor-specific')) items = items.filter(k => k.is_normalized);
    if (filterTypes.has('Vendor-specific') && !filterTypes.has('Normalisé')) items = items.filter(k => !k.is_normalized);
    if (filterLevels.size) items = items.filter(k => k.supported_levels?.some(l => filterLevels.has(l)));
    const cats = new Map<string, number>();
    for (const k of items) cats.set(k.category || 'Other', (cats.get(k.category || 'Other') || 0) + 1);
    return cats;
  }, [catalog, filterVendors, filterTechnos, filterTypes, filterLevels]);

  const totalFiltered = Array.from(tabCategories.values()).reduce((a, b) => a + b, 0);

  // Recently used KPIs from catalog
  const recentKpis = useMemo(() => {
    if (!search && !activeCategory && activeFilterCount === 0) {
      return recent.map(k => catalog.find(c => c.kpi_key === k)).filter(Boolean).slice(0, 8) as KpiCatalogEntry[];
    }
    return [];
  }, [recent, catalog, search, activeCategory, activeFilterCount]);

  // Favorite KPIs from catalog
  const favoriteKpis = useMemo(() => {
    if (!search && !activeCategory && activeFilterCount === 0) {
      return catalog.filter(k => isFavorite(k.kpi_key));
    }
    return [];
  }, [catalog, isFavorite, search, activeCategory, activeFilterCount]);

  const toggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const keys = Array.from(selected);
    addRecent(keys);
    onConfirm(keys);
    onClose();
  }, [selected, addRecent, onConfirm, onClose]);

  const handleHover = useCallback((kpi: KpiCatalogEntry, e: React.MouseEvent) => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPreviewKpi({ kpi, pos: { top: rect.top, left: rect.right + 8 } });
    }, 400);
  }, []);

  const handleHoverEnd = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setPreviewKpi(null);
  }, []);

  if (!open) return null;

  const displayItems = sortedCatalog.length > 300 && !search ? sortedCatalog.slice(0, 300) : sortedCatalog;

  // ── Render KPI row ──
  const renderKpiRow = (k: KpiCatalogEntry, showFavStar = true) => {
    const isSelected = selected.has(k.kpi_key);
    const fav = isFavorite(k.kpi_key);
    return (
      <div
        key={k.kpi_key}
        className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-all mb-0.5 cursor-pointer ${
          isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/60 border border-transparent'
        }`}
        onClick={() => toggle(k.kpi_key)}
        onMouseEnter={(e) => handleHover(k, e)}
        onMouseLeave={handleHoverEnd}
      >
        {/* Checkbox */}
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-border'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
        </div>

        {/* Favorite star */}
        {showFavStar && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(k.kpi_key); }}
            className={`shrink-0 transition-colors ${fav ? 'text-yellow-500' : 'text-transparent group-hover:text-muted-foreground/40'}`}
          >
            <Star className="w-3 h-3" fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground truncate">
            <Highlight text={k.display_name} query={search} />
          </p>
          <p className="text-[9px] text-muted-foreground truncate">
            <Highlight text={k.description || k.kpi_key} query={search} />
          </p>
        </div>

        {/* Metadata badges */}
        <div className="flex items-center gap-1 shrink-0">
          {k.vendor && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">{k.vendor}</span>}
          {k.techno && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">{k.techno}</span>}
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
        </div>

        {/* Info icon */}
        <Info className="w-3 h-3 text-transparent group-hover:text-muted-foreground/50 shrink-0 transition-colors" />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[920px] max-w-[94vw] h-[640px] max-h-[88vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
            <span className="text-[10px] opacity-70">
              {catalog.length} KPIs
              {filteredCatalog.length !== catalog.length && ` · ${filteredCatalog.length} filtrés`}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Subheader: selection count + sort + reset ── */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground">{selected.size} sélectionné(s)</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors underline">
                Effacer filtres ({activeFilterCount})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sort selector */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[10px]">
              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="bg-transparent text-foreground outline-none cursor-pointer text-[10px] font-medium"
              >
                <option value="recent">Récents & Favoris</option>
                <option value="alpha">Alphabétique</option>
                <option value="category">Par catégorie</option>
              </select>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* ── Body: 3-panel ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left sidebar: Filters */}
          <div className="w-[190px] shrink-0 border-r border-border bg-muted/10 overflow-y-auto">
            <div className="p-2">
              {/* Categories */}
              <div className="mb-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Catégories</p>
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    activeCategory === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span>Tous</span>
                  <span className={`text-[9px] ${activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{totalFiltered}</span>
                </button>
                {Array.from(tabCategories.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{cat}</span>
                    <span className={`text-[9px] shrink-0 ml-1 ${activeCategory === cat ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{count}</span>
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-px bg-border mb-3" />

              {/* Filter sections */}
              <FilterSection
                title="Type"
                options={filterOptions.types}
                selected={filterTypes}
                onToggle={(v) => toggleSet(setFilterTypes, v)}
              />
              <FilterSection
                title="Vendor"
                options={filterOptions.vendors}
                selected={filterVendors}
                onToggle={(v) => toggleSet(setFilterVendors, v)}
              />
              <FilterSection
                title="Technologie"
                options={filterOptions.technos}
                selected={filterTechnos}
                onToggle={(v) => toggleSet(setFilterTechnos, v)}
              />
              <FilterSection
                title="Niveau"
                options={filterOptions.levels}
                selected={filterLevels}
                onToggle={(v) => toggleSet(setFilterLevels, v)}
              />
            </div>
          </div>

          {/* Right: KPI list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search */}
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un KPI (nom, clé, description)..."
                  className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                  autoFocus
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* KPI items */}
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {/* Favorites section */}
              {favoriteKpis.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <Star className="w-3 h-3 text-yellow-500" fill="currentColor" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-600">Favoris</span>
                  </div>
                  {favoriteKpis.map(k => renderKpiRow(k, true))}
                  <div className="h-px bg-border/50 my-2 mx-2" />
                </div>
              )}

              {/* Recently used section */}
              {recentKpis.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Utilisés récemment</span>
                  </div>
                  {recentKpis.map(k => renderKpiRow(k, true))}
                  <div className="h-px bg-border/50 my-2 mx-2" />
                </div>
              )}

              {/* All KPIs */}
              {sortedCatalog.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                <>
                  {sortedCatalog.length > 300 && !search && (
                    <div className="flex items-center justify-center py-2 mb-1 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        {sortedCatalog.length} KPIs — <span className="font-semibold text-foreground">tapez pour rechercher</span>
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {activeCategory || 'Tous les KPIs'} ({displayItems.length}{sortedCatalog.length > 300 && !search ? `/${sortedCatalog.length}` : ''})
                    </span>
                  </div>
                  {displayItems.map(k => renderKpiRow(k))}
                  {sortedCatalog.length > 300 && !search && (
                    <div className="text-center py-2 text-[9px] text-muted-foreground">
                      Affichage limité à 300 — utilisez la recherche
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[500px] overflow-hidden">
            {Array.from(selected).slice(0, 8).map(key => {
              const k = catalog.find(c => c.kpi_key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
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
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
              Ok ({selected.size})
            </button>
          </div>
        </div>

        {/* Preview tooltip */}
        {previewKpi && <KpiPreview kpi={previewKpi.kpi} position={previewKpi.pos} />}
      </div>
    </div>
  );
};

export default KpiSelectorModal;
