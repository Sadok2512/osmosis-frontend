import React, { useState, useMemo } from 'react';
import { X, Search, Check, RotateCcw, ChevronRight, BarChart3, Filter, ChevronDown } from 'lucide-react';
import { KpiCatalogEntry } from './types';

interface KpiSelectorModalProps {
  open: boolean;
  onClose: () => void;
  catalog: KpiCatalogEntry[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

// ── Filter dropdown component ──
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
        className="w-full appearance-none bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 pr-6 cursor-pointer"
      >
        <option value="">Tous</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
    </div>
  </div>
);

const KpiSelectorModal: React.FC<KpiSelectorModalProps> = ({ open, onClose, catalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Filter states
  const [filterVendor, setFilterVendor] = useState('');
  const [filterTechno, setFilterTechno] = useState('');
  const [filterNormalized, setFilterNormalized] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterFamily, setFilterFamily] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Reset state when opening
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveCategory(null);
      setSearch('');
      setFilterVendor('');
      setFilterTechno('');
      setFilterNormalized('');
      setFilterLevel('');
      setFilterFamily('');
    }
  }, [open, selectedKeys]);

  // Extract unique filter values from catalog
  const filterOptions = useMemo(() => {
    const vendors = new Set<string>();
    const technos = new Set<string>();
    const families = new Set<string>();
    const levels = new Set<string>();

    for (const k of catalog) {
      if (k.vendor) vendors.add(k.vendor);
      if (k.techno) technos.add(k.techno);
      if (k.category) families.add(k.category);
      if (k.supported_levels) {
        for (const l of k.supported_levels) {
          if (l.trim()) levels.add(l.trim());
        }
      }
    }

    return {
      vendors: Array.from(vendors).sort(),
      technos: Array.from(technos).sort(),
      families: Array.from(families).sort(),
      levels: Array.from(levels).sort(),
    };
  }, [catalog]);

  const activeFilterCount = [filterVendor, filterTechno, filterNormalized, filterLevel, filterFamily].filter(Boolean).length;

  // Apply all filters
  const filteredCatalog = useMemo(() => {
    let items = catalog;

    if (filterVendor) items = items.filter(k => k.vendor === filterVendor);
    if (filterTechno) items = items.filter(k => k.techno === filterTechno);
    if (filterNormalized === 'normalized') items = items.filter(k => k.is_normalized);
    if (filterNormalized === 'vendor-specific') items = items.filter(k => !k.is_normalized);
    if (filterLevel) items = items.filter(k => k.supported_levels?.includes(filterLevel));
    if (filterFamily) items = items.filter(k => k.category === filterFamily);
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
  }, [catalog, filterVendor, filterTechno, filterNormalized, filterLevel, filterFamily, activeCategory, search]);

  // Categories computed from filtered catalog (without category filter applied)
  const tabCategories = useMemo(() => {
    let items = catalog;
    if (filterVendor) items = items.filter(k => k.vendor === filterVendor);
    if (filterTechno) items = items.filter(k => k.techno === filterTechno);
    if (filterNormalized === 'normalized') items = items.filter(k => k.is_normalized);
    if (filterNormalized === 'vendor-specific') items = items.filter(k => !k.is_normalized);
    if (filterLevel) items = items.filter(k => k.supported_levels?.includes(filterLevel));
    if (filterFamily) items = items.filter(k => k.category === filterFamily);

    const cats = new Map<string, number>();
    for (const k of items) {
      const cat = k.category || 'Other';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    }
    return cats;
  }, [catalog, filterVendor, filterTechno, filterNormalized, filterLevel, filterFamily]);

  const totalFiltered = Array.from(tabCategories.values()).reduce((a, b) => a + b, 0);

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
    setFilterVendor(''); setFilterTechno(''); setFilterNormalized('');
    setFilterLevel(''); setFilterFamily(''); setActiveCategory(null);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[820px] max-w-[92vw] h-[600px] max-h-[85vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
            <span className="text-[10px] opacity-70">{catalog.length} disponibles</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selection summary + filter toggle + reset */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground">{selected.size} sélectionné(s)</span>
            <span className="text-[10px] text-muted-foreground">
              {filteredCatalog.length !== catalog.length && `${filteredCatalog.length} affiché(s)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Filter className="w-3 h-3" />
              Filtres
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
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

        {/* Filter bar (collapsible) */}
        {showFilters && (
          <div className="px-5 py-3 border-b border-border bg-muted/10 grid grid-cols-5 gap-3">
            <FilterDropdown label="Vendor" value={filterVendor} options={filterOptions.vendors} onChange={setFilterVendor} />
            <FilterDropdown label="Techno" value={filterTechno} options={filterOptions.technos} onChange={setFilterTechno} />
            <FilterDropdown
              label="Type"
              value={filterNormalized}
              options={['vendor-specific', 'normalized']}
              onChange={setFilterNormalized}
            />
            <FilterDropdown label="Level" value={filterLevel} options={filterOptions.levels} onChange={setFilterLevel} />
            <FilterDropdown label="Family" value={filterFamily} options={filterOptions.families} onChange={setFilterFamily} />
          </div>
        )}

        {/* Body: 2-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Categories */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                Catégories
              </p>
              <button
                onClick={() => setActiveCategory(null)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeCategory === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span>Tous</span>
                <span className={`text-[9px] ${activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {totalFiltered}
                </span>
              </button>
              {Array.from(tabCategories.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className={`text-[9px] shrink-0 ml-1 ${activeCategory === cat ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {count}
                  </span>
                </button>
              ))}
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
                  placeholder="Rechercher un KPI..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>
            </div>

            {/* KPI items */}
            <div className="flex-1 overflow-y-auto px-3 py-1">
              {filteredCatalog.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                filteredCatalog.map(k => {
                  const isSelected = selected.has(k.kpi_key);
                  return (
                    <button
                      key={k.kpi_key}
                      onClick={() => toggle(k.kpi_key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all mb-px ${
                        isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-2 h-2 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate">{k.display_name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{k.description || k.kpi_key}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {k.vendor && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">{k.vendor}</span>
                        )}
                        {k.techno && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">{k.techno}</span>
                        )}
                        <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[450px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(key => {
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
            {selected.size > 6 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 6} autres</span>}
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
      </div>
    </div>
  );
};

export default KpiSelectorModal;
