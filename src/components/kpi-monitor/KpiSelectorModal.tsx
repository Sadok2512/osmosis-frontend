import React, { useState, useMemo } from 'react';
import { X, Search, Check, RotateCcw, ChevronRight, BarChart3, Hash } from 'lucide-react';
import { KpiCatalogEntry } from './types';

interface KpiSelectorModalProps {
  open: boolean;
  onClose: () => void;
  catalog: KpiCatalogEntry[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Access: 'hsl(var(--primary))',
  Throughput: 'hsl(142, 70%, 45%)',
  Latency: 'hsl(45, 90%, 45%)',
  Retainability: 'hsl(0, 80%, 55%)',
  QoE: 'hsl(262, 80%, 55%)',
  Traffic: 'hsl(200, 70%, 50%)',
  TCP: 'hsl(330, 70%, 50%)',
};

const KpiSelectorModal: React.FC<KpiSelectorModalProps> = ({ open, onClose, catalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'kpi' | 'counter'>('kpi');

  // Reset state when opening
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveCategory(null);
      setSearch('');
    }
  }, [open, selectedKeys]);

  // Group by category
  const categories = useMemo(() => {
    const cats = new Map<string, KpiCatalogEntry[]>();
    for (const k of catalog) {
      const cat = k.category || 'Other';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(k);
    }
    return cats;
  }, [catalog]);

  // Separate KPIs (ratios) and Counters
  const kpis = useMemo(() => catalog.filter(k => k.value_type === 'ratio'), [catalog]);
  const counters = useMemo(() => catalog.filter(k => k.value_type !== 'ratio'), [catalog]);
  const activeList = tab === 'kpi' ? kpis : counters;

  // Filtered list
  const filteredItems = useMemo(() => {
    let items = activeList;
    if (activeCategory) {
      items = items.filter(k => k.category === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(k =>
        k.display_name.toLowerCase().includes(q) ||
        k.kpi_key.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q)
      );
    }
    return items;
  }, [activeList, activeCategory, search]);

  // Categories for active tab
  const tabCategories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const k of activeList) {
      const cat = k.category || 'Other';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    }
    return cats;
  }, [activeList]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reset = () => setSelected(new Set());

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[720px] max-w-[90vw] h-[520px] max-h-[80vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selection summary + reset */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Sélection</span>
            <span className="text-[10px] text-muted-foreground">
              {selected.size} élément(s)
            </span>
          </div>
          <button onClick={reset} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
            <RotateCcw className="w-3 h-3" /> Réinitialiser
          </button>
        </div>

        {/* Tab bar: KPI / Counters */}
        <div className="flex items-center gap-0 px-5 border-b border-border bg-card">
          <button
            onClick={() => { setTab('kpi'); setActiveCategory(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'kpi' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> KPI
          </button>
          <button
            onClick={() => { setTab('counter'); setActiveCategory(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'counter' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Hash className="w-3.5 h-3.5" /> Compteurs
          </button>
        </div>

        {/* Body: 2-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Categories */}
          <div className="w-[220px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                {tab === 'kpi' ? 'KPIs par catégorie' : 'Compteurs par catégorie'}
              </p>
              {/* All */}
              <button
                onClick={() => setActiveCategory(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeCategory === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span>Tous</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] ${activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {activeList.length}
                  </span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>
              {/* Per category */}
              {Array.from(tabCategories.entries()).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] || 'hsl(var(--muted-foreground))' }} />
                    <span>{cat}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] ${activeCategory === cat ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {count}
                    </span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
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
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredItems.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                <>
                  {/* Group header */}
                  {activeCategory && (
                    <div className="flex items-center gap-2 px-1 py-1.5 mb-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{activeCategory}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {filteredItems.map(k => {
                    const isSelected = selected.has(k.kpi_key);
                    return (
                      <button
                        key={k.kpi_key}
                        onClick={() => toggle(k.kpi_key)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all mb-0.5 ${
                          isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: k.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{k.display_name}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{k.description || k.kpi_key}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{k.techno_scope}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[400px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(key => {
              const k = catalog.find(c => c.kpi_key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: k?.color }} />
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
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KpiSelectorModal;
