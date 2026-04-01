import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Search, Check, RotateCcw, Star, BarChart3, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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

async function fetchFilterOptions(vendor?: string): Promise<FilterOptions> {
  try {
    const params = vendor ? `?vendor=${encodeURIComponent(vendor)}` : '';
    const res = await fetch(getApiUrl(`pm/counters/filter-options${params}`), { headers: getApiHeaders() });
    if (!res.ok) return { vendors: ['Nokia', 'Ericsson'], families: [], technos: [], object_types: [] };
    return res.json();
  } catch { return { vendors: ['Nokia', 'Ericsson'], families: [], technos: [], object_types: [] }; }
}

async function fetchFilteredCatalog(vendor?: string, techno?: string): Promise<CounterDef[]> {
  try {
    const params = new URLSearchParams();
    if (vendor) params.set('vendor', vendor);
    if (techno) params.set('techno', techno);
    params.set('limit', '5000');
    const res = await fetch(getApiUrl(`pm/counters/catalog?${params.toString()}`), { headers: getApiHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

/* ── Collapsible filter section (left sidebar) ── */
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && <div className="pb-2 px-2">{children}</div>}
    </div>
  );
};

/* ── Filter list item (left sidebar) ── */
const FilterListItem: React.FC<{
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}> = ({ label, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between px-3 py-[6px] text-[12px] transition-all rounded-[4px]',
      active
        ? 'bg-emerald-600 text-white font-semibold'
        : 'text-foreground/80 hover:bg-muted/50'
    )}
  >
    <span>{label}</span>
    {count !== undefined && (
      <span className={cn('text-[11px] tabular-nums', active ? 'text-white/75' : 'text-muted-foreground')}>{count}</span>
    )}
  </button>
);

/* ── Category item (middle sidebar) ── */
const CategoryListItem: React.FC<{
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}> = ({ label, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between px-4 py-[7px] text-[12px] transition-all rounded-[4px]',
      active
        ? 'bg-emerald-600 text-white font-semibold'
        : 'text-foreground hover:bg-muted/40'
    )}
  >
    <span className="truncate pr-2">{label}</span>
    <span className={cn('text-[11px] tabular-nums shrink-0', active ? 'text-white/75' : 'text-muted-foreground')}>{count}</span>
  </button>
);

const CounterSelectorModal: React.FC<Props> = ({ open, onClose, catalog: initialCatalog, selectedKeys, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  const [filterVendor, setFilterVendor] = useState<string>('');
  const [filterTechno, setFilterTechno] = useState<string>('');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ vendors: [], families: [], technos: [], object_types: [] });
  const [catalog, setCatalog] = useState<CounterDef[]>(initialCatalog);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedKeys));
      setActiveFamily(null);
      setSearch('');
      setShowFavOnly(false);
      setFilterVendor('');
      setFilterTechno('');
      loadFavoritesDB('pm-counters').then(favs => setFavorites(favs));
      fetchFilterOptions().then(setFilterOptions);
    }
  }, [open, selectedKeys]);

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

  const resetSelection = () => setSelected(new Set());

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

  const technoCounts = useMemo(() => {
    const items = Array.isArray(catalog) ? catalog : [];
    const counts = new Map<string, number>();
    for (const c of items) {
      if (c.techno) counts.set(c.techno, (counts.get(c.techno) || 0) + 1);
    }
    return counts;
  }, [catalog]);

  const totalFiltered = Array.from(familyCategories.values()).reduce((a, b) => a + b, 0);

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  const vendorOptions = filterOptions.vendors.length > 0 ? filterOptions.vendors : ['Ericsson', 'Nokia'];
  const technoOptions = filterOptions.technos.length > 0 ? filterOptions.technos : ['4G', '5G', 'LTE', 'NR', 'SRAN'];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[1100px] max-w-[95vw] h-[720px] max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4" />
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des Counters PM</h2>
            <span className="text-[10px] opacity-70">{catalog.length} counters{filteredCatalog.length !== catalog.length ? ` · ${filteredCatalog.length} filtrés` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold">{selected.size} sélectionné(s)</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══ Left Sidebar: Filters ═══ */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-hidden">

            {/* Header row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">Filtres</span>
            </div>

            <ScrollArea className="flex-1">

              {/* Favoris */}
              <div className="border-b border-border/30 py-2 px-2">
                <button
                  onClick={() => { setShowFavOnly(!showFavOnly); if (!showFavOnly) setActiveFamily(null); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-[6px] rounded-[4px] text-[12px] font-medium transition-all',
                    showFavOnly ? 'bg-emerald-600 text-white' : 'text-foreground/80 hover:bg-muted/50'
                  )}
                >
                  <Star className={cn('w-3.5 h-3.5', showFavOnly ? 'fill-white text-white' : 'text-muted-foreground/50')} />
                  <span>FAVORIS</span>
                  <span className={cn('ml-auto text-[11px] tabular-nums', showFavOnly ? 'text-white/75' : 'text-muted-foreground')}>
                    {favorites.length}
                  </span>
                </button>
              </div>

              {/* Vendor */}
              <CollapsibleSection title="Vendor">
                <FilterListItem label="Tous" active={filterVendor === ''} onClick={() => { setFilterVendor(''); setFilterTechno(''); }} />
                {vendorOptions.map(v => (
                  <FilterListItem key={v} label={v} active={filterVendor === v} onClick={() => { setFilterVendor(v); setFilterTechno(''); }} />
                ))}
              </CollapsibleSection>

              {/* Technology */}
              <CollapsibleSection title="Technology">
                <FilterListItem label="Tous" active={filterTechno === ''} onClick={() => setFilterTechno('')} />
                {technoOptions.map(t => (
                  <FilterListItem
                    key={t}
                    label={t}
                    active={filterTechno === t}
                    count={technoCounts.get(t)}
                    onClick={() => setFilterTechno(t)}
                  />
                ))}
              </CollapsibleSection>

            </ScrollArea>
          </div>

          {/* ═══ Middle Sidebar: Categories ═══ */}
          <div className="w-[230px] shrink-0 border-r border-border flex flex-col bg-card">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">Catégories</span>
            </div>

            <ScrollArea className="flex-1">
              <div className="py-1.5 px-1.5 space-y-[2px]">
                {/* Tous */}
                <CategoryListItem
                  label="Tous"
                  active={activeFamily === null && !showFavOnly}
                  count={totalFiltered}
                  onClick={() => { setActiveFamily(null); setShowFavOnly(false); }}
                />

                <div className="mx-2 my-1 border-t border-border/30" />

                {/* Family list */}
                {Array.from(familyCategories.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([fam, count]) => (
                    <CategoryListItem
                      key={fam}
                      label={fam}
                      active={activeFamily === fam}
                      count={count}
                      onClick={() => { setActiveFamily(activeFamily === fam ? null : fam); setShowFavOnly(false); }}
                    />
                  ))}
              </div>
            </ScrollArea>
          </div>

          {/* ═══ Right Panel: Counter List ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Search */}
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un counter..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-[12px] outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all"
                  autoFocus
                />
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{filteredCatalog.length} counters</span>
            </div>

            {/* Info bar */}
            <div className="px-4 py-1.5 border-b border-border/40 bg-muted/10 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">{selected.size}</span> sélectionné(s)
                {isLoading && <span className="ml-2 animate-pulse">chargement...</span>}
                {!isLoading && filteredCatalog.length > 200 && !search && (
                  <span className="ml-2">— tapez pour rechercher ou filtrez</span>
                )}
              </p>
              {selected.size > 0 && (
                <button onClick={resetSelection} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {/* Items */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-1">
                {isLoading ? (
                  <div className="flex items-center justify-center h-40 text-xs text-muted-foreground animate-pulse">Chargement...</div>
                ) : filteredCatalog.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Aucun résultat</div>
                ) : (
                  <>
                    {(filteredCatalog.length > 200 && !search ? filteredCatalog.slice(0, 200) : filteredCatalog).map(c => {
                      const isSelected = selected.has(c.counter_name);
                      const isFav = favorites.includes(c.counter_name);
                      return (
                        <div
                          key={c.counter_name}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-[6px] rounded-lg transition-all mb-[2px] group',
                            isSelected
                              ? 'bg-emerald-500/10 border border-emerald-500/25'
                              : 'hover:bg-muted/40 border border-transparent'
                          )}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(c.counter_name); }}
                            className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors"
                          >
                            <Star className={cn(
                              'w-3.5 h-3.5 transition-colors',
                              isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/20 group-hover:text-muted-foreground/40'
                            )} />
                          </button>

                          <button onClick={() => toggle(c.counter_name)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                            <div className={cn(
                              'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-border/70'
                            )}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className="flex-1 text-[11px] font-medium text-foreground truncate font-mono">{c.counter_name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {c.vendor && (
                                <span className={cn(
                                  'text-[9px] px-1.5 py-[2px] rounded font-medium',
                                  c.vendor === 'Ericsson' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'
                                )}>{c.vendor}</span>
                              )}
                              {c.techno && (
                                <span className="text-[9px] px-1.5 py-[2px] rounded bg-purple-500/10 text-purple-500 font-medium">{c.techno}</span>
                              )}
                              {c.family && (
                                <span className="text-[9px] px-1.5 py-[2px] rounded bg-muted text-muted-foreground truncate max-w-[120px]">{c.family}</span>
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                    {filteredCatalog.length > 200 && !search && (
                      <div className="text-center py-3 text-[10px] text-muted-foreground">
                        Affichage limité à 200 — utilisez la recherche
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
          <div className="flex flex-wrap gap-1.5 max-w-[550px] overflow-hidden">
            {Array.from(selected).slice(0, 6).map(key => {
              const c = catalog.find(x => x.counter_name === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold font-mono">
                  {c?.display_name || key}
                  <button onClick={() => toggle(key)} className="ml-0.5 hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                </span>
              );
            })}
            {selected.size > 6 && <span className="text-[10px] text-muted-foreground self-center">+{selected.size - 6} autres</span>}
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors">
              Ok ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterSelectorModal;
