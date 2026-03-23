import React, { useState, useMemo } from 'react';
import { X, Search, Check, RotateCcw, Filter, ChevronDown, Hash } from 'lucide-react';
import type { CounterCatalogEntry } from './api/kpiMonitorApi';

interface CounterSelectorModalProps {
  open: boolean;
  onClose: () => void;
  counters: CounterCatalogEntry[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
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
        className="w-full appearance-none bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 pr-6 cursor-pointer"
      >
        <option value="">Tous</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
    </div>
  </div>
);

const CounterSelectorModal: React.FC<CounterSelectorModalProps> = ({ open, onClose, counters, selectedIds, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [filterVendor, setFilterVendor] = useState('');
  const [filterTechno, setFilterTechno] = useState('');
  const [filterFamily, setFilterFamily] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedIds));
      setActiveFamily(null);
      setSearch('');
      setFilterVendor('');
      setFilterTechno('');
      setFilterFamily('');
    }
  }, [open, selectedIds]);

  const filterOptions = useMemo(() => {
    const vendors = new Set<string>();
    const technos = new Set<string>();
    const families = new Set<string>();
    for (const c of counters) {
      if (c.vendor) vendors.add(c.vendor);
      if (c.techno) technos.add(c.techno);
      if (c.family) families.add(c.family);
    }
    return {
      vendors: Array.from(vendors).sort(),
      technos: Array.from(technos).sort(),
      families: Array.from(families).sort(),
    };
  }, [counters]);

  const activeFilterCount = [filterVendor, filterTechno, filterFamily].filter(Boolean).length;

  const filteredCounters = useMemo(() => {
    let items = counters;
    if (filterVendor) items = items.filter(c => c.vendor === filterVendor);
    if (filterTechno) items = items.filter(c => c.techno === filterTechno);
    if (filterFamily) items = items.filter(c => c.family === filterFamily);
    if (activeFamily) items = items.filter(c => c.family === activeFamily);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c => c.counter_name.toLowerCase().includes(q) || c.counter_id.toLowerCase().includes(q));
    }
    return items;
  }, [counters, filterVendor, filterTechno, filterFamily, activeFamily, search]);

  const familyCounts = useMemo(() => {
    let items = counters;
    if (filterVendor) items = items.filter(c => c.vendor === filterVendor);
    if (filterTechno) items = items.filter(c => c.techno === filterTechno);
    if (filterFamily) items = items.filter(c => c.family === filterFamily);
    const cats = new Map<string, number>();
    for (const c of items) {
      const f = c.family || 'Other';
      cats.set(f, (cats.get(f) || 0) + 1);
    }
    return cats;
  }, [counters, filterVendor, filterTechno, filterFamily]);

  const totalFiltered = Array.from(familyCounts.values()).reduce((a, b) => a + b, 0);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => setSelected(new Set());
  const clearFilters = () => {
    setFilterVendor(''); setFilterTechno(''); setFilterFamily(''); setActiveFamily(null);
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
        <div className="flex items-center justify-between px-5 py-3 bg-emerald-600 text-white">
          <div className="flex items-center gap-3">
            <Hash className="w-4 h-4" />
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des Compteurs</h2>
            <span className="text-[10px] opacity-70">{counters.length} disponibles</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary + filters */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground">{selected.size} sélectionné(s)</span>
            <span className="text-[10px] text-muted-foreground">
              {filteredCounters.length !== counters.length && `${filteredCounters.length} affiché(s)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
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

        {/* Filter bar */}
        {showFilters && (
          <div className="px-5 py-3 border-b border-border bg-muted/10 grid grid-cols-3 gap-3">
            <FilterDropdown label="Vendor" value={filterVendor} options={filterOptions.vendors} onChange={setFilterVendor} />
            <FilterDropdown label="Techno" value={filterTechno} options={filterOptions.technos} onChange={setFilterTechno} />
            <FilterDropdown label="Family" value={filterFamily} options={filterOptions.families} onChange={setFilterFamily} />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Families */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Familles</p>
              <button
                onClick={() => setActiveFamily(null)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeFamily === null ? 'bg-emerald-600 text-white' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span>Tous</span>
                <span className={`text-[9px] ${activeFamily === null ? 'text-white/70' : 'text-muted-foreground'}`}>{totalFiltered}</span>
              </button>
              {Array.from(familyCounts.entries()).sort((a, b) => b[1] - a[1]).map(([fam, count]) => (
                <button
                  key={fam}
                  onClick={() => setActiveFamily(activeFamily === fam ? null : fam)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    activeFamily === fam ? 'bg-emerald-600 text-white' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="truncate">{fam}</span>
                  <span className={`text-[9px] shrink-0 ml-1 ${activeFamily === fam ? 'text-white/70' : 'text-muted-foreground'}`}>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Counter list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un compteur..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-1">
              {filteredCounters.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                <>
                {filteredCounters.length > 200 && !search && (
                  <div className="flex items-center justify-center py-3 mb-1 rounded-lg bg-muted/30 border border-border/30">
                    <p className="text-[10px] text-muted-foreground">
                      {filteredCounters.length} compteurs — <span className="font-semibold text-foreground">tapez pour rechercher</span> ou filtrez
                    </p>
                  </div>
                )}
                {(filteredCounters.length > 200 && !search ? filteredCounters.slice(0, 200) : filteredCounters).map(c => {
                  const isSelected = selected.has(c.counter_id);
                  return (
                    <button
                      key={c.counter_id}
                      onClick={() => toggle(c.counter_id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all mb-px ${
                        isSelected ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-2 h-2 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground font-mono truncate">{c.counter_name}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.vendor && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">{c.vendor}</span>
                        )}
                        {c.techno && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">{c.techno}</span>
                        )}
                        {c.family && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[100px]">{c.family}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredCounters.length > 200 && !search && (
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[450px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(id => {
              const c = counters.find(x => x.counter_id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] font-semibold font-mono">
                  {c?.counter_name || id}
                  <button onClick={() => toggle(id)} className="ml-0.5 hover:text-destructive">
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
