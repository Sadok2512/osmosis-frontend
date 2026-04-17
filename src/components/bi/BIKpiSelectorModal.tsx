import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Check, RotateCcw, ChevronRight, Loader2 } from 'lucide-react';
import { BI_KPI_CATALOG, BI_KPI_CATEGORIES, BIKpiDefinition } from './biTypes';
import { fetchBIKpiCatalog, getCachedBIKpiCatalog } from './biCatalogService';

const CATEGORY_COLORS: Record<string, string> = {
  Volume: 'hsl(210, 80%, 55%)',
  Débit: 'hsl(142, 70%, 45%)',
  Latence: 'hsl(45, 90%, 50%)',
  'TCP Session KPI': 'hsl(330, 70%, 50%)',
  'Radio Access Tech': 'hsl(200, 70%, 50%)',
  'QOE Index': 'hsl(0, 80%, 55%)',
  'User Capabilité': 'hsl(262, 60%, 55%)',
};

interface Props {
  open: boolean;
  onClose: () => void;
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
  /** If true, single-select mode */
  single?: boolean;
  availableKeys?: string[];
}

const BIKpiSelectorModal: React.FC<Props> = ({ open, onClose, selectedKeys, onConfirm, single, availableKeys }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<BIKpiDefinition[]>(() => getCachedBIKpiCatalog());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBIKpiCatalog()
      .then(items => { if (!cancelled) setCatalog(items); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Erreur de chargement'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const scopedCatalog = useMemo(() => {
    if (!availableKeys || availableKeys.length === 0) return catalog;
    const allowed = new Set(availableKeys);
    return catalog.filter(k => allowed.has(k.key));
  }, [availableKeys, catalog]);

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveCategory(null);
      setSearch('');
    }
  }, [open, selectedKeys]);

  const dynamicCategories = useMemo(() => {
    const cats = new Set<string>(BI_KPI_CATEGORIES as readonly string[]);
    catalog.forEach(k => cats.add(k.category));
    return Array.from(cats);
  }, [catalog]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of scopedCatalog) {
      counts.set(k.category, (counts.get(k.category) || 0) + 1);
    }
    return counts;
  }, [scopedCatalog]);

  const filteredItems = useMemo(() => {
    let items = scopedCatalog;
    if (activeCategory) items = items.filter(k => k.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(k =>
        k.display_name.toLowerCase().includes(q) ||
        k.key.toLowerCase().includes(q) ||
        k.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [activeCategory, scopedCatalog, search]);

  const toggle = (key: string) => {
    if (single) {
      setSelected(new Set([key]));
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[720px] max-w-[90vw] h-[540px] max-h-[80vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin opacity-80" />}
            {!loading && error && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-primary-foreground/90" title={error}>
                catalogue local
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selection count + reset */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Sélection</span>
            <span className="text-[10px] text-muted-foreground">{selected.size} élément(s)</span>
          </div>
          <button onClick={() => setSelected(new Set())} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
            <RotateCcw className="w-3 h-3" /> Réinitialiser
          </button>
        </div>

        {/* Body: 2-panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: categories */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                KPIs par catégorie
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
                      {scopedCatalog.length}
                  </span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>
              {dynamicCategories.map(cat => (
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
                      {categoryCounts.get(cat) || 0}
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

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredItems.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Aucun résultat</div>
              ) : (
                filteredItems.map(k => {
                  const isSelected = selected.has(k.key);
                  return (
                    <button
                      key={k.key}
                      onClick={() => toggle(k.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all mb-0.5 ${
                        isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[k.category] }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{k.display_name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{k.key}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{k.category}</span>
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
          <div className="flex flex-wrap gap-1 max-w-[400px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(key => {
              const k = BI_KPI_CATALOG.find(c => c.key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[k?.category || ''] }} />
                  {k?.display_name || key}
                  <button onClick={(e) => { e.stopPropagation(); toggle(key); }} className="ml-0.5 hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            {selected.size > 6 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 6}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BIKpiSelectorModal;
