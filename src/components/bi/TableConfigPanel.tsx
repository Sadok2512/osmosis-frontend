import React, { useState, useMemo } from 'react';
import { X, Table2, Filter, Calendar, LayoutGrid, Check, Search, ChevronDown, ChevronRight, RotateCcw, Plus, Settings2 } from 'lucide-react';
import { BI_KPI_CATALOG, BI_KPI_CATEGORIES, BI_DIMENSIONS, BIDimension, BIKPI, getKpiDisplayName } from './biTypes';
import { getDimensionValues } from './mockBIData';
import { TableWidgetConfig, TableFilter, TableGranularity } from './BITableWidget';

const GRANULARITIES: { key: TableGranularity; label: string }[] = [
  { key: 'hour', label: 'Heure' },
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Volume': 'bg-blue-500',
  'Débit': 'bg-emerald-500',
  'Latence': 'bg-amber-500',
  'TCP Session KPI': 'bg-rose-500',
  'Radio Access Tech': 'bg-sky-500',
  'QOE Index': 'bg-red-500',
  'User Capabilité': 'bg-purple-500',
};

interface Props {
  config: TableWidgetConfig;
  onChange: (config: TableWidgetConfig) => void;
  onClose: () => void;
}

/* ─── Inline KPI Selector (split layout like graph) ─── */
const KpiSelectorSection: React.FC<{
  selected: BIKPI[];
  onConfirm: (kpis: BIKPI[]) => void;
  onClose?: () => void;
}> = ({ selected, onConfirm, onClose }) => {
  const [draft, setDraft] = useState<BIKPI[]>(selected);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  React.useEffect(() => { setDraft(selected); }, [selected]);

  const isDirty = JSON.stringify(draft.slice().sort()) !== JSON.stringify(selected.slice().sort());

  const toggle = (key: string) => {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filteredKpis = BI_KPI_CATALOG.filter(k => {
    const matchSearch = !search || k.display_name.toLowerCase().includes(search.toLowerCase()) || k.key.toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCategory || k.category === activeCategory;
    return matchSearch && matchCat;
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    BI_KPI_CATALOG.forEach(k => { counts[k.category] = (counts[k.category] || 0) + 1; });
    return counts;
  }, []);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-foreground">Sélection</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">{draft.length} élément(s)</span>
        </div>
        <button onClick={() => setDraft([])} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <RotateCcw className="w-3 h-3" /> Réinitialiser
        </button>
      </div>

      {/* Split layout: categories sidebar + KPI list */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left sidebar: categories ── */}
        <div className="w-[120px] shrink-0 border-r border-border/40 overflow-y-auto bg-muted/10">
          <div className="px-2 pt-2 pb-1">
            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest px-1">KPIs par catégorie</span>
          </div>
          {/* All */}
          <button
            onClick={() => setActiveCategory(null)}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-left transition-colors ${
              !activeCategory ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/40'
            }`}
          >
            <span className="text-[10px] font-semibold truncate">Tous</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                !activeCategory ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>{BI_KPI_CATALOG.length}</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </div>
          </button>
          {BI_KPI_CATEGORIES.map(cat => {
            const isActive = activeCategory === cat;
            const catColor = CATEGORY_COLORS[cat] || 'bg-muted-foreground';
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-left transition-colors ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${catColor}`} />
                  <span className="text-[10px] font-medium truncate">{cat}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>{categoryCounts[cat] || 0}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel: search + KPI list ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Search */}
          <div className="px-3 py-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                placeholder="Rechercher un KPI..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* KPI list */}
          <div className="flex-1 overflow-y-auto">
            {filteredKpis.map(kpi => {
              const isSelected = draft.includes(kpi.key);
              const catColor = CATEGORY_COLORS[kpi.category] || 'bg-muted-foreground';
              return (
                <button key={kpi.key} onClick={() => toggle(kpi.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all border-b border-border/20 ${
                    isSelected ? 'bg-primary/8 ring-1 ring-primary/20' : 'hover:bg-muted/30'
                  }`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected ? 'bg-primary border-primary shadow-sm' : 'border-border/60'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${catColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-foreground truncate">{kpi.display_name}</div>
                    <div className="text-[9px] text-muted-foreground">{kpi.key}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {kpi.unit && <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{kpi.unit}</span>}
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{kpi.category}</span>
                  </div>
                </button>
              );
            })}
            {filteredKpis.length === 0 && (
              <div className="text-[11px] text-muted-foreground text-center py-8 italic">Aucun KPI trouvé</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: selected tags + actions */}
      <div className="border-t border-border/40 bg-muted/10">
        {draft.length > 0 && (
          <div className="px-3 py-2 max-h-[60px] overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {draft.map(key => {
                const kpi = BI_KPI_CATALOG.find(k => k.key === key);
                const catColor = kpi ? (CATEGORY_COLORS[kpi.category] || 'bg-muted-foreground') : 'bg-muted-foreground';
                return (
                  <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
                    <div className={`w-1.5 h-1.5 rounded-full ${catColor}`} />
                    {kpi?.display_name || key}
                    <button onClick={() => toggle(key)} className="hover:text-destructive ml-0.5"><X className="w-2.5 h-2.5" /></button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border/30">
          <button
            onClick={() => { setDraft(selected); onClose?.(); }}
            className="flex-1 py-2 rounded-lg text-[11px] font-semibold border border-border text-foreground hover:bg-muted/40 transition-colors"
          >
            Fermer
          </button>
          <button
            disabled={!isDirty}
            onClick={() => onConfirm(draft)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${
              isDirty
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Filter Row ─── */
const FilterRow: React.FC<{
  filter: TableFilter;
  onChange: (f: TableFilter) => void;
  onRemove: () => void;
}> = ({ filter, onChange, onRemove }) => {
  const dimValues = getDimensionValues(filter.dimension);
  const [open, setOpen] = useState(false);

  const toggleValue = (v: string) => {
    const values = filter.values.includes(v) ? filter.values.filter(x => x !== v) : [...filter.values, v];
    onChange({ ...filter, values });
  };

  return (
    <div className="flex items-center gap-2 bg-muted/20 rounded-lg px-2 py-1.5 border border-border/50">
      <select
        value={filter.dimension}
        onChange={e => onChange({ ...filter, dimension: e.target.value as BIDimension, values: [] })}
        className="text-[10px] bg-transparent border-none outline-none text-foreground font-semibold w-20"
      >
        {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <div className="relative flex-1">
        <button onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full px-2 py-0.5 text-[10px] bg-background border border-border rounded text-foreground">
          <span className="truncate">{filter.values.length ? `${filter.values.length} selected` : 'Select...'}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg max-h-[150px] overflow-auto p-1.5">
            {dimValues.map(v => (
              <label key={v} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] hover:bg-muted/40 rounded cursor-pointer">
                <input type="checkbox" checked={filter.values.includes(v)} onChange={() => toggleValue(v)} className="rounded w-3 h-3" />
                <span className="text-foreground">{v}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <button onClick={onRemove} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

/* ─── Main Panel ─── */
const TableConfigPanel: React.FC<Props> = ({ config, onChange, onClose }) => {
  const [showKpiSelector, setShowKpiSelector] = useState(false);

  const addFilter = () => {
    const used = (config.filters || []).map(f => f.dimension);
    const next = BI_DIMENSIONS.find(d => !used.includes(d)) || BI_DIMENSIONS[0];
    onChange({ ...config, filters: [...(config.filters || []), { dimension: next, values: [] }] });
  };

  const filters = config.filters || [];
  const selectedKpis = config.kpis || [];

  return (
    <>
      <div className="w-[360px] h-full bg-background border-l border-border/40 flex flex-col overflow-hidden">

        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-border/40 bg-card/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Table2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={config.title}
                  onChange={e => onChange({ ...config, title: e.target.value })}
                  className="w-full bg-transparent text-[15px] font-bold text-foreground outline-none border-b border-transparent focus:border-primary/40 transition-all placeholder:text-muted-foreground/40 truncate"
                  placeholder="Table title…"
                />
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/60 text-muted-foreground" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── KPI SELECTION BUTTON ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> KPIs sélectionnés
            </label>
            <button
              onClick={() => setShowKpiSelector(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-semibold text-primary">Sélectionner des KPIs</div>
                  <div className="text-[9px] text-muted-foreground">{selectedKpis.length} KPI(s) actif(s)</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
            </button>
            {selectedKpis.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selectedKpis.map(key => {
                  const kpi = BI_KPI_CATALOG.find(k => k.key === key);
                  const catColor = kpi ? (CATEGORY_COLORS[kpi.category] || 'bg-muted-foreground') : 'bg-muted-foreground';
                  return (
                    <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
                      <div className={`w-1.5 h-1.5 rounded-full ${catColor}`} />
                      {kpi?.display_name || key}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── X AXIS ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> Axe X
            </label>
            <div className="flex gap-1">
              <button onClick={() => onChange({ ...config, xAxisType: 'date' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  config.xAxisType === 'date' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}>
                <Calendar className="w-3.5 h-3.5" /> Date
              </button>
              <button onClick={() => onChange({ ...config, xAxisType: 'dimension' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  (config.xAxisType || 'dimension') === 'dimension' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}>
                <LayoutGrid className="w-3.5 h-3.5" /> Dimension
              </button>
            </div>
            {config.xAxisType === 'date' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground mb-0.5 block">Début</label>
                    <input type="date" value={config.dateFrom || ''} onChange={e => onChange({ ...config, dateFrom: e.target.value })}
                      className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none w-full focus:ring-1 focus:ring-primary" />
                  </div>
                  <span className="text-muted-foreground mt-3">→</span>
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground mb-0.5 block">Fin</label>
                    <input type="date" value={config.dateTo || ''} onChange={e => onChange({ ...config, dateTo: e.target.value })}
                      className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none w-full focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              </div>
            ) : (
              <select value={config.dimension} onChange={e => onChange({ ...config, dimension: e.target.value as BIDimension })}
                className="text-[11px] bg-background border border-border rounded-lg px-2.5 py-2 text-foreground outline-none w-full focus:ring-1 focus:ring-primary">
                {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {/* ── FILTERS ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Filtres
              </label>
              <button onClick={addFilter}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold">
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {filters.map((f, i) => (
                <FilterRow key={i} filter={f}
                  onChange={nf => {
                    const newFilters = [...filters];
                    newFilters[i] = nf;
                    onChange({ ...config, filters: newFilters });
                  }}
                  onRemove={() => onChange({ ...config, filters: filters.filter((_, j) => j !== i) })}
                />
              ))}
              {filters.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic py-2 text-center">Aucun filtre appliqué</div>
              )}
            </div>
          </div>

          {/* ── DISPLAY ── */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> Affichage
            </label>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-[11px] text-foreground cursor-pointer">
                <span>Lignes alternées</span>
                <input type="checkbox" checked={config.striped} onChange={e => onChange({ ...config, striped: e.target.checked })} className="rounded w-3.5 h-3.5 accent-primary" />
              </label>
              <label className="flex items-center justify-between text-[11px] text-foreground cursor-pointer">
                <span>Mode compact</span>
                <input type="checkbox" checked={config.compact} onChange={e => onChange({ ...config, compact: e.target.checked })} className="rounded w-3.5 h-3.5 accent-primary" />
              </label>
              <label className="flex items-center justify-between text-[11px] text-foreground cursor-pointer">
                <span>En-tête visible</span>
                <input type="checkbox" checked={config.showHeader} onChange={e => onChange({ ...config, showHeader: e.target.checked })} className="rounded w-3.5 h-3.5 accent-primary" />
              </label>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Taille police</label>
                <input type="range" min={8} max={16} value={config.fontSize} onChange={e => onChange({ ...config, fontSize: +e.target.value })}
                  className="w-full accent-primary" />
                <div className="text-[9px] text-muted-foreground text-right">{config.fontSize}px</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI Selector Overlay ─── */}
      {showKpiSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[600px] max-w-[95vw] h-[80vh] max-h-[700px] bg-background rounded-2xl shadow-2xl border border-border/40 flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="px-5 py-3.5 bg-primary text-primary-foreground flex items-center justify-between shrink-0">
              <h2 className="text-[14px] font-bold">Sélectionner des KPIs</h2>
              <button onClick={() => setShowKpiSelector(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary-foreground/20">
                <X className="w-4 h-4" />
              </button>
            </div>
            <KpiSelectorSection
              selected={config.kpis || []}
              onConfirm={kpis => {
                onChange({ ...config, kpis });
                setShowKpiSelector(false);
              }}
              onClose={() => setShowKpiSelector(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default TableConfigPanel;
