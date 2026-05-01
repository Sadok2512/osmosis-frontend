import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { vendorBadge, techBadge } from '@/constants/brandColors';
import { X, Search, Check, RotateCcw, Star, BarChart3, ChevronDown, ChevronRight, Filter, SlidersHorizontal } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CounterDef {
  counter_name: string;
  display_name: string;
  family: string;
  vendor: string;
  techno: string;
  object_type: string;
  object_type_normalized?: string;
  dimension_type?: string | null;
  dimension_prefix?: string | null;
  is_in_kpi?: boolean;
  kpi_usage_count?: number;
  count: number;
}

interface FilterOptions {
  vendors: string[];
  families: string[];
  technos: string[];
  object_types: string[];
  dimension_types?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: CounterDef[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
  /** Default perimeter vendor(s) — pre-selected but editable */
  perimeterVendor?: string | string[];
  /** Default perimeter techno(s) — pre-selected but editable */
  perimeterTechno?: string | string[];
}

async function fetchFilterOptions(vendor?: string, techno?: string | string[]): Promise<FilterOptions> {
  try {
    const qs = new URLSearchParams();
    if (vendor) qs.set('vendor', vendor);
    const technoArr = Array.isArray(techno) ? techno : techno ? [techno] : [];
    for (const t of technoArr) if (t) qs.append('techno', t);
    const params = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(getApiUrl(`pm/counters/filter-options${params}`), { headers: getApiHeaders() });
    if (!res.ok) return { vendors: ['Ericsson', 'Huawei', 'Nokia'], families: [], technos: [], object_types: [], dimension_types: [] };
    return res.json();
  } catch { return { vendors: ['Ericsson', 'Huawei', 'Nokia'], families: [], technos: [], object_types: [], dimension_types: [] }; }
}

async function fetchFilteredCatalog(vendor?: string, techno?: string): Promise<CounterDef[]> {
  try {
    const params = new URLSearchParams();
    if (vendor) params.set('vendor', vendor);
    if (techno) params.set('techno', techno);
    params.set('limit', '5000');
    const res = await fetchVpsWithRetry(getApiUrl(`pm/counters/catalog?${params.toString()}`), { headers: getApiHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

/* ── Collapsible filter section ── */
const CollapsibleSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 opacity-50" /> : <ChevronRight className="w-3 h-3 opacity-50" />}
      </button>
      <div className={cn('overflow-hidden transition-all', open ? 'max-h-[500px] pb-2 px-2' : 'max-h-0')}>
        {children}
      </div>
    </div>
  );
};

/* ── Filter list item ── */
const FilterListItem: React.FC<{
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}> = ({ label, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between px-3 py-[5px] text-[11px] transition-all rounded-md',
      active
        ? 'bg-primary text-white font-semibold shadow-sm'
        : 'text-foreground/80 hover:bg-muted/60'
    )}
  >
    <span className="truncate">{label}</span>
    {count !== undefined && (
      <span className={cn('text-[10px] tabular-nums ml-2 shrink-0', active ? 'text-white/70' : 'text-muted-foreground/60')}>{count}</span>
    )}
  </button>
);

/* ── Category item ── */
const CategoryListItem: React.FC<{
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}> = ({ label, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between px-3 py-[5px] text-[11px] transition-all rounded-md',
      active
        ? 'bg-primary text-white font-semibold shadow-sm'
        : 'text-foreground/80 hover:bg-muted/40'
    )}
  >
    <span className="truncate pr-2">{label}</span>
    <span className={cn('text-[10px] tabular-nums shrink-0', active ? 'text-white/70' : 'text-muted-foreground/60')}>{count}</span>
  </button>
);

/* ── Badge component for counter row ── */
const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={cn(
    'inline-flex items-center justify-center text-[9px] font-semibold px-2 py-[2px] rounded-[4px] whitespace-nowrap min-w-[48px] text-center',
    className
  )}>
    {children}
  </span>
);

const CounterSelectorModal: React.FC<Props> = ({ open, onClose, catalog: initialCatalog, selectedKeys, onConfirm, perimeterVendor, perimeterTechno }) => {
  // Normalize perimeter to arrays — used as defaults, NOT locked
  const perimVendors = useMemo(() => !perimeterVendor ? [] : Array.isArray(perimeterVendor) ? perimeterVendor.filter(Boolean) : [perimeterVendor].filter(Boolean), [perimeterVendor]);
  const perimTechnos = useMemo(() => !perimeterTechno ? [] : Array.isArray(perimeterTechno) ? perimeterTechno.filter(Boolean) : [perimeterTechno].filter(Boolean), [perimeterTechno]);

  const safeCatalog = Array.isArray(initialCatalog) ? initialCatalog : [];
  const selectedKeysSignature = useMemo(
    () => [...new Set(selectedKeys)].sort().join('||'),
    [selectedKeys]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  // Vendor/Techno filters — initialized from perimeter defaults, fully editable
  const [filterVendor, setFilterVendor] = useState<string>('');
  const [filterTechno, setFilterTechno] = useState<string>('');
  const [filterDimType, setFilterDimType] = useState<string>('');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ vendors: [], families: [], technos: [], object_types: [], dimension_types: [] });
  const [catalog, setCatalog] = useState<CounterDef[]>(safeCatalog);
  const [isLoading, setIsLoading] = useState(false);

  // Multi-select vendor/techno filters — initialized from perimeter
  const [activeVendors, setActiveVendors] = useState<Set<string>>(() => new Set(
    !perimeterVendor ? [] : Array.isArray(perimeterVendor) ? perimeterVendor.filter(Boolean) : [perimeterVendor].filter(Boolean)
  ));
  const [activeTechnos, setActiveTechnos] = useState<Set<string>>(() => new Set(
    !perimeterTechno ? [] : Array.isArray(perimeterTechno) ? perimeterTechno.filter(Boolean) : [perimeterTechno].filter(Boolean)
  ));

  // Effective filters for API calls
  const effectiveVendor = activeVendors.size === 1 ? Array.from(activeVendors)[0] : '';
  const effectiveTechno = activeTechnos.size === 1 ? Array.from(activeTechnos)[0] : '';

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(selectedKeys));
  }, [open, selectedKeysSignature]);

  // Reset transient UI state on open
  useEffect(() => {
    if (!open) return;
    setActiveFamily(null);
    setSearch('');
    setShowFavOnly(false);
    setFilterDimType('');
    setFilterVendor('');
    setFilterTechno('');
    loadFavoritesDB('counter').then(favs => setFavorites(favs));
  }, [open]);

  // Sync perimeter → active filters whenever the perimeter changes
  // (also fires on open). This guarantees the modal always reflects the
  // current Investigator scope, even if the modal stays mounted.
  const perimVendorKey = perimVendors.join('|');
  const perimTechnoKey = perimTechnos.join('|');
  useEffect(() => {
    setActiveVendors(new Set(perimVendors));
    setActiveTechnos(new Set(perimTechnos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perimVendorKey, perimTechnoKey, open]);

  // Fetch catalog when vendor/techno selection changes
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setActiveFamily(null);
    const apiVendor = effectiveVendor || undefined;
    const apiTechno = effectiveTechno || undefined;
    // Pass the active perimeter technos so the backend hides dimension_types
    // that don't apply (e.g. RNC_ID outside 3G, 5QI/SLICE outside 5G).
    const apiTechnos = Array.from(activeTechnos);
    Promise.all([
      fetchFilteredCatalog(apiVendor, apiTechno),
      fetchFilterOptions(apiVendor, apiTechnos.length > 0 ? apiTechnos : apiTechno),
    ]).then(([data, opts]) => {
      let items = Array.isArray(data) ? data : [];
      // Always apply client-side vendor/techno filter for strict consistency
      if (activeVendors.size > 0) {
        const vendorSet = new Set(Array.from(activeVendors).map(v => v.toLowerCase()));
        items = items.filter(c => vendorSet.has((c.vendor || '').toLowerCase()));
      }
      if (activeTechnos.size > 0) {
        const technoSet = new Set(Array.from(activeTechnos).map(t => t.toLowerCase()));
        items = items.filter(c => technoSet.has((c.techno || '').toLowerCase()));
      }
      setCatalog(items);
      setFilterOptions(prev => ({
        ...prev,
        families: opts?.families || [],
        technos: opts?.technos || [],
        vendors: opts?.vendors || prev.vendors,
        dimension_types: opts?.dimension_types || [],
      }));
      setIsLoading(false);
    });
  }, [open, effectiveVendor, effectiveTechno, Array.from(activeVendors).sort().join(','), Array.from(activeTechnos).sort().join(',')]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveFavoritesDB(next, 'counter');
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
  const resetFilters = () => {
    setActiveVendors(new Set());
    setActiveTechnos(new Set());
    setFilterDimType('');
    setActiveFamily(null);
    setShowFavOnly(false);
  };

  const activeFilterCount = [
    activeVendors.size > 0 ? 'v' : '',
    activeTechnos.size > 0 ? 't' : '',
    filterDimType,
    showFavOnly ? 'fav' : '',
  ].filter(Boolean).length;

  /* ── Single source of truth: base dataset filtered by vendor/techno (from API) + local dim filter ── */
  const baseFiltered = useMemo(() => {
    let items = Array.isArray(catalog) ? catalog : [];
    if (showFavOnly) items = items.filter(c => favorites.includes(c.counter_name));
    if (filterDimType) items = items.filter(c => c.dimension_type === filterDimType);
    return items;
  }, [catalog, showFavOnly, favorites, filterDimType]);

  /* ── In-perimeter favorites count (intersect favs with catalog visible after vendor/techno scope) ── */
  const favsInScopeCount = useMemo(() => {
    if (!favorites.length) return 0;
    const items = Array.isArray(catalog) ? catalog : [];
    const favSet = new Set(favorites);
    let n = 0;
    for (const c of items) if (favSet.has(c.counter_name)) n++;
    return n;
  }, [catalog, favorites]);

  /* ── Categories computed from base filtered data ── */
  const familyCategories = useMemo(() => {
    const fams = new Map<string, number>();
    for (const c of baseFiltered) {
      const f = c.family || 'Other';
      fams.set(f, (fams.get(f) || 0) + 1);
    }
    return fams;
  }, [baseFiltered]);

  /* ── Final filtered list: base + family + search ── */
  const filteredCatalog = useMemo(() => {
    let items = baseFiltered;
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
  }, [baseFiltered, activeFamily, search]);

  /* ── Vendor counts from catalog (to show only vendors with data) ── */
  const vendorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const items = Array.isArray(catalog) ? catalog : [];
    for (const c of items) {
      if (c.vendor) counts.set(c.vendor, (counts.get(c.vendor) || 0) + 1);
    }
    return counts;
  }, [catalog]);

  /* ── Techno counts from catalog (to show only technos with data) ── */
  const technoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const items = Array.isArray(catalog) ? catalog : [];
    for (const c of items) {
      if (c.techno) counts.set(c.techno, (counts.get(c.techno) || 0) + 1);
    }
    return counts;
  }, [catalog]);

  /* ── Dimension type counts from catalog (not filtered by dimType itself) ── */
  const dimTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let items = Array.isArray(catalog) ? catalog : [];
    if (showFavOnly) items = items.filter(c => favorites.includes(c.counter_name));
    for (const c of items) {
      if (c.dimension_type) counts.set(c.dimension_type, (counts.get(c.dimension_type) || 0) + 1);
    }
    return counts;
  }, [catalog, showFavOnly, favorites]);

  const dimTypeOptions = useMemo(() => {
    const opts = filterOptions.dimension_types || [];
    return opts.length > 0 ? opts : Array.from(dimTypeCounts.keys()).sort();
  }, [filterOptions.dimension_types, dimTypeCounts]);

  const totalFiltered = baseFiltered.length;

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };
  // Only show vendors/technos that actually exist in the catalog data
  const vendorOptions = useMemo(() => Array.from(vendorCounts.keys()).sort(), [vendorCounts]);
  const technoOptions = useMemo(() => Array.from(technoCounts.keys()).sort(), [technoCounts]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm pl-[240px]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[1020px] max-w-[calc(100vw-280px)] h-[640px] max-h-[85vh] flex flex-col rounded-xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-primary text-white shrink-0">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4.5 h-4.5" />
            <h2 className="text-[13px] font-bold tracking-wide">Sélectionner des Counters PM</h2>
            <span className="text-[10px] opacity-60 tabular-nums">{(Array.isArray(catalog) ? catalog : []).length} disponibles</span>
            {(activeVendors.size > 0 || activeTechnos.size > 0) && (
              <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                Périmètre: {[...Array.from(activeVendors), ...Array.from(activeTechnos)].join(' · ')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Active filters summary ── */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-border/40 shrink-0 flex-wrap">
            <SlidersHorizontal className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-muted-foreground">Filtres actifs :</span>
            {activeVendors.size > 0 && Array.from(activeVendors).map(v => (
              <span key={v} className="text-[9px] px-2 py-[1px] rounded-full bg-primary/10 text-primary font-semibold">{v}</span>
            ))}
            {activeTechnos.size > 0 && Array.from(activeTechnos).map(t => (
              <span key={t} className="text-[9px] px-2 py-[1px] rounded-full bg-accent/30 text-accent-foreground font-semibold">{t}</span>
            ))}
            {filterDimType && (
              <span className="text-[9px] px-2 py-[1px] rounded-full bg-amber-500/10 text-amber-600 font-semibold">{filterDimType}</span>
            )}
            {showFavOnly && (
              <span className="text-[9px] px-2 py-[1px] rounded-full bg-amber-500/10 text-amber-600 font-semibold">★ Favoris</span>
            )}
            <button onClick={resetFilters} className="ml-auto text-[9px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
              <RotateCcw className="w-2.5 h-2.5" /> Réinitialiser
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ═══ Left Sidebar: Filters ═══ */}
          <div className="w-[190px] shrink-0 border-r border-border/60 flex flex-col bg-muted/5">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40">
              <Filter className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">Filtres</span>
              {activeFilterCount > 0 && (
                <span className="ml-auto w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">{activeFilterCount}</span>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="py-1">
                {/* Favoris */}
                <div className="px-2 pb-1">
                  <button
                    onClick={() => { setShowFavOnly(!showFavOnly); if (!showFavOnly) setActiveFamily(null); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-[5px] rounded-md text-[11px] font-medium transition-all',
                      showFavOnly ? 'bg-amber-500/15 text-amber-600 font-semibold' : 'text-foreground/70 hover:bg-muted/50'
                    )}
                  >
                    <Star className={cn('w-3 h-3', showFavOnly ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40')} />
                    <span>Favoris</span>
                    <span className={cn('ml-auto text-[10px] tabular-nums', showFavOnly ? 'text-amber-600/70' : 'text-muted-foreground/50')}>
                      {favsInScopeCount}{favsInScopeCount !== favorites.length ? `/${favorites.length}` : ''}
                    </span>
                  </button>
                </div>

                {/* Vendor (multi-select, editable) */}
                <CollapsibleSection title="Vendor">
                  <FilterListItem label="Tous" active={activeVendors.size === 0} onClick={() => setActiveVendors(new Set())} />
                  {vendorOptions.map(v => (
                    <FilterListItem
                      key={v}
                      label={v}
                      active={activeVendors.has(v)}
                      onClick={() => {
                        setActiveVendors(prev => {
                          const next = new Set(prev);
                          if (next.has(v)) next.delete(v); else next.add(v);
                          return next;
                        });
                      }}
                    />
                  ))}
                </CollapsibleSection>

                {/* Technology (multi-select, editable) */}
                <CollapsibleSection title="Technologie">
                  <FilterListItem label="Tous" active={activeTechnos.size === 0} onClick={() => setActiveTechnos(new Set())} />
                  {technoOptions.map(t => (
                    <FilterListItem
                      key={t}
                      label={t}
                      active={activeTechnos.has(t)}
                      count={technoCounts.get(t)}
                      onClick={() => {
                        setActiveTechnos(prev => {
                          const next = new Set(prev);
                          if (next.has(t)) next.delete(t); else next.add(t);
                          return next;
                        });
                      }}
                    />
                  ))}
                </CollapsibleSection>

                {/* Dimension Type */}
                {dimTypeOptions.length > 0 && (
                  <CollapsibleSection title="Dimension" defaultOpen={false}>
                    <FilterListItem label="Tous" active={filterDimType === ''} onClick={() => setFilterDimType('')} />
                    {dimTypeOptions.map(d => (
                      <FilterListItem
                        key={d}
                        label={d}
                        active={filterDimType === d}
                        count={dimTypeCounts.get(d)}
                        onClick={() => setFilterDimType(d)}
                      />
                    ))}
                  </CollapsibleSection>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ═══ Middle Sidebar: Categories ═══ */}
          <div className="w-[210px] shrink-0 border-r border-border/60 flex flex-col bg-card">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">Catégories</span>
              <span className="text-[9px] text-muted-foreground/60 tabular-nums">{familyCategories.size}</span>
            </div>

            <ScrollArea className="flex-1">
              <div className="py-1 px-1.5 space-y-[1px]">
                <CategoryListItem
                  label="Tous"
                  active={activeFamily === null && !showFavOnly}
                  count={totalFiltered}
                  onClick={() => { setActiveFamily(null); setShowFavOnly(false); }}
                />

                <div className="mx-2 my-1 border-t border-border/20" />

                {familyCategories.size === 0 && !isLoading && (
                  <div className="px-3 py-4 text-[10px] text-muted-foreground text-center">
                    Aucune catégorie pour ces filtres
                  </div>
                )}

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

            {/* Search bar */}
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un counter..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-[11px] outline-none focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
                  autoFocus
                />
              </div>
              <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">{filteredCatalog.length}</span>
            </div>

            {/* Selection bar */}
            <div className="px-3 py-1 border-b border-border/30 bg-muted/5 flex items-center justify-between shrink-0">
              <p className="text-[10px] text-muted-foreground">
                <span className="font-bold text-primary">{selected.size}</span> sélectionné(s)
                {isLoading && <span className="ml-2 animate-pulse text-muted-foreground/50">chargement...</span>}
              </p>
              {selected.size > 0 && (
                <button onClick={resetSelection} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-destructive transition-colors">
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              )}
            </div>

            {/* Column header */}
            <div className="px-3 py-1 border-b border-border/20 bg-muted/10 flex items-center gap-2 shrink-0">
              <div className="w-[22px] shrink-0" /> {/* star */}
              <div className="w-[18px] shrink-0" /> {/* checkbox */}
              <span className="flex-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 min-w-0">Counter</span>
              <div className="flex items-center shrink-0" style={{ width: '248px' }}>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 w-[58px] text-center">Dim</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 w-[60px] text-center">Vendor</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 w-[50px] text-center">Tech</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 flex-1 text-center">Type</span>
              </div>
            </div>

            {/* Items */}
            <ScrollArea className="flex-1">
              <div className="px-1.5 py-0.5">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] text-muted-foreground">Chargement des counters...</span>
                  </div>
                ) : filteredCatalog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2">
                    <Search className="w-5 h-5 text-muted-foreground/30" />
                    <span className="text-[11px] text-muted-foreground">Aucun counter trouvé pour les filtres sélectionnés</span>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} className="text-[10px] text-primary hover:underline">Réinitialiser les filtres</button>
                    )}
                  </div>
                ) : (
                  <>
                    {(filteredCatalog.length > 300 && !search ? filteredCatalog.slice(0, 300) : filteredCatalog).map(c => {
                      const isSelected = selected.has(c.counter_name);
                      const isFav = favorites.includes(c.counter_name);
                      return (
                        <div
                          key={c.counter_name}
                          className={cn(
                            'flex items-center gap-2 px-2 py-[4px] rounded-md transition-all mb-[1px] group cursor-pointer',
                            isSelected
                              ? 'bg-primary/8 border border-primary/20'
                              : 'hover:bg-muted/30 border border-transparent'
                          )}
                          onClick={() => toggle(c.counter_name)}
                        >
                          {/* Star */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(c.counter_name); }}
                            className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors w-[22px] flex items-center justify-center"
                          >
                            <Star className={cn(
                              'w-3 h-3 transition-colors',
                              isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/15 group-hover:text-muted-foreground/30'
                            )} />
                          </button>

                          {/* Checkbox */}
                          <div className={cn(
                            'w-3.5 h-3.5 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                            isSelected ? 'bg-primary border-primary' : 'border-border/60'
                          )}>
                            {isSelected && <Check className="w-2 h-2 text-white" />}
                          </div>

                          {/* Counter name + display name */}
                          <div className="flex-1 min-w-0 leading-tight">
                            <span className="text-[10.5px] font-medium text-foreground truncate block">
                              {c.display_name && c.display_name !== c.counter_name ? c.display_name : c.counter_name}
                            </span>
                            {c.display_name && c.display_name !== c.counter_name && (
                              <span className="text-[9px] text-muted-foreground/50 font-mono">{c.counter_name}</span>
                            )}
                          </div>

                          {/* Badges — fixed-width container for alignment */}
                          <div className="flex items-center shrink-0" style={{ width: '248px' }}>
                            {/* Dimension badge */}
                            <div className="w-[58px] flex justify-center">
                              {c.dimension_type ? (
                                <Badge className="bg-amber-500/10 text-amber-600">{c.dimension_type}</Badge>
                              ) : null}
                            </div>
                            {/* Vendor badge */}
                            <div className="w-[60px] flex justify-center">
                              {c.vendor ? (
                                <Badge className={cn(vendorBadge(c.vendor).bg, vendorBadge(c.vendor).text)}>
                                  {c.vendor}
                                </Badge>
                              ) : <span className="text-[9px] text-muted-foreground/30">—</span>}
                            </div>
                            {/* Tech badge */}
                            <div className="w-[50px] flex justify-center">
                              {c.techno ? (
                                <Badge className={cn(techBadge(c.techno).bg, techBadge(c.techno).text)}>{c.techno}</Badge>
                              ) : <span className="text-[9px] text-muted-foreground/30">—</span>}
                            </div>
                            {/* Family/Type badge */}
                            <div className="flex-1 flex justify-center min-w-0">
                              {c.family ? (
                                <Badge className="bg-muted text-muted-foreground truncate max-w-full">{c.family}</Badge>
                              ) : <span className="text-[9px] text-muted-foreground/30">—</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredCatalog.length > 300 && !search && (
                      <div className="text-center py-3 text-[9px] text-muted-foreground/60">
                        Affichage limité à 300 — utilisez la recherche pour affiner
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card shrink-0">
          <div className="flex flex-wrap gap-1 max-w-[500px] overflow-hidden">
            {Array.from(selected).slice(0, 5).map(key => {
              const c = catalog.find(x => x.counter_name === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-[2px] rounded-md bg-primary/10 text-primary text-[9px] font-semibold font-mono max-w-[140px] truncate">
                  {c?.display_name || key}
                  <button onClick={() => toggle(key)} className="ml-0.5 hover:text-destructive shrink-0"><X className="w-2.5 h-2.5" /></button>
                </span>
              );
            })}
            {selected.size > 5 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 5} autres</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors">
              Fermer
            </button>
            <button onClick={handleConfirm} className="px-5 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary/90 transition-colors shadow-sm">
              Ok ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterSelectorModal;
