import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { X, Search, Check, RotateCcw, ChevronRight, BarChart3, Filter, ChevronDown, Star, ChevronUp, Info } from 'lucide-react';
import { loadFavorites as loadFavoritesDB, saveFavorites as saveFavoritesDB } from '@/services/favoritesService';
import { KpiCatalogEntry, AxisSide } from './types';
import { cn } from '@/lib/utils';
import { vendorBadge, techBadge } from '@/constants/brandColors';

interface KpiSelectorModalProps {
  open: boolean;
  onClose: () => void;
  catalog: KpiCatalogEntry[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
  /** Optional: receive axis assignment per KPI key */
  axisAssignments?: Record<string, AxisSide>;
  onAxisAssignmentsChange?: (assignments: Record<string, AxisSide>) => void;
}

// ── Favorites persistence ──
// Favorites are now loaded from DB via favoritesService

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
          {selected && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          <button
            onClick={() => onChange('')}
            className={cn(
              'w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium transition-all',
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
                'w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                selected === opt.value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.count !== undefined && (
                <span className={cn('text-[8px] shrink-0', selected === opt.value ? 'text-primary/70' : 'text-muted-foreground')}>
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

const DIMENSION_LABELS: Record<string, string> = {
  PMQAP: 'QCI Profile',
  FLEX: 'Flex QoS',
  NEIGHBOR: 'Neighbor',
  CA_REL: 'CA Relation',
  RANSHARE: 'RAN Sharing',
  SLICE: 'Slice (NSSAI)',
  '5QI': '5QI (NR)',
  TRANSPORT: 'Transport',
};

const KpiSelectorModal: React.FC<KpiSelectorModalProps> = ({ open, onClose, catalog, selectedKeys, onConfirm, axisAssignments: extAxisAssignments, onAxisAssignmentsChange }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys));
  const [axisMap, setAxisMap] = useState<Record<string, AxisSide>>({});
  const axisMapRef = useRef<Record<string, AxisSide>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);

  // Filter states
  const [filterVendor, setFilterVendor] = useState('');
  const [filterTechno, setFilterTechno] = useState('');
  const [filterNormalized, setFilterNormalized] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterDimension, setFilterDimension] = useState('');
  // View mode: when true, group catalog rows that share kpi_code_normalized
  // into a single selectable entry covering every vendor variant.
  // Default ON since 2026-05-09 — backend writes the canonical name as
  // kpi_code (verbose Vendor__&_* deprecated), so the operator should
  // see the canonical KPI by default. Toggle off to inspect per-vendor.
  const [groupMode, setGroupMode] = useState(true);
  // When grouped, default OFF (show single-vendor canonical KPIs too,
  // not just multivendor groups). Operator can opt-in to multivendor-only.
  const [multivendorOnly, setMultivendorOnly] = useState(false);
  // Per-row info popover: which canonical kpi_key has its formulas
  // drawer open. Null = none open. Click "ⓘ" toggles.
  const [infoOpenKey, setInfoOpenKey] = useState<string | null>(null);

  React.useEffect(() => {
    axisMapRef.current = axisMap;
  }, [axisMap]);

  // Snapshot props on open transition only — re-running on every selectedKeys
  // / extAxisAssignments reference change wipes the user's in-modal selection
  // and triggers a max-depth update loop when the parent re-renders.
  const wasOpenRef = useRef(false);
  const selectedKeysRef = useRef(selectedKeys);
  const extAxisAssignmentsRef = useRef(extAxisAssignments);
  selectedKeysRef.current = selectedKeys;
  extAxisAssignmentsRef.current = extAxisAssignments;
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setSelected(new Set(selectedKeysRef.current));
      setActiveCategory(null);
      setSearch('');
      setFilterVendor('');
      setFilterTechno('');
      setFilterNormalized('');
      setFilterLevel('');
      setFilterDimension('');
      setShowFavOnly(false);
      const nextAxisMap = extAxisAssignmentsRef.current || {};
      axisMapRef.current = nextAxisMap;
      setAxisMap(nextAxisMap);
      loadFavoritesDB('kpi-monitor').then(favs => setFavorites(favs));
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
    }
  }, [open]);

  const toggleAxis = useCallback((key: string) => {
    setAxisMap(prev => {
      const current = prev[key] || 'left';
      const next = { ...prev, [key]: (current === 'left' ? 'right' : 'left') as AxisSide };
      axisMapRef.current = next;
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

  // Deduplicate catalog by logical KPI key to avoid one click selecting multiple visible rows
  const uniqueCatalog = useMemo(() => {
    const byKey = new Map<string, KpiCatalogEntry>();
    for (const item of catalog) {
      if (!byKey.has(item.kpi_key)) {
        byKey.set(item.kpi_key, item);
      }
    }
    return Array.from(byKey.values());
  }, [catalog]);

  // Extract filter values, cascading through every OTHER active filter
  // (faceted search: each dropdown only shows values that survive the
  // current selection on the other filters, so selecting 4G hides
  // BCCH/RNC from Level/Dimension instead of leaving stale 2G/3G entries).
  const filterOptions = useMemo(() => {
    const filterExcept = (skip: string) => {
      let items = uniqueCatalog;
      if (showFavOnly) items = items.filter(k => favorites.includes(k.kpi_key));
      if (filterVendor    && skip !== 'vendor')    items = items.filter(k => k.vendor === filterVendor);
      if (filterTechno    && skip !== 'techno')    items = items.filter(k => k.techno === filterTechno);
      if (filterNormalized === 'normalized'      && skip !== 'normalized') items = items.filter(k => k.is_normalized);
      if (filterNormalized === 'vendor-specific' && skip !== 'normalized') items = items.filter(k => !k.is_normalized);
      if (filterLevel     && skip !== 'level')     items = items.filter(k => k.supported_levels?.includes(filterLevel));
      if (filterDimension && skip !== 'dimension') items = items.filter(k => (k as any).dimension_type === filterDimension);
      return items;
    };

    const tally = <K extends string | undefined>(items: any[], pick: (k: any) => K | K[] | null | undefined) => {
      const m = new Map<string, number>();
      for (const k of items) {
        const v = pick(k);
        const list = Array.isArray(v) ? v : v ? [v] : [];
        for (const x of list) {
          const t = String(x || '').trim();
          if (t) m.set(t, (m.get(t) || 0) + 1);
        }
      }
      return m;
    };

    const vendors    = tally(filterExcept('vendor'),    k => k.vendor);
    const technos    = tally(filterExcept('techno'),    k => k.techno);
    const levels     = tally(filterExcept('level'),     k => k.supported_levels);
    const dimensions = tally(filterExcept('dimension'), k => (k as any).dimension_type);
    const normItems  = filterExcept('normalized');
    const normalizedCount     = normItems.filter(k => k.is_normalized).length;
    const vendorSpecificCount = normItems.filter(k => !k.is_normalized).length;

    return {
      vendors:    Array.from(vendors.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      technos:    Array.from(technos.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      levels:     Array.from(levels.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c })),
      dimensions,
      normalizedCount,
      vendorSpecificCount,
    };
  }, [uniqueCatalog, filterVendor, filterTechno, filterNormalized, filterLevel, filterDimension, showFavOnly, favorites]);

  const activeFilterCount = [filterVendor, filterTechno, filterNormalized, filterLevel, filterDimension].filter(Boolean).length;

  // Apply all filters
  const filteredCatalog = useMemo(() => {
    let items = uniqueCatalog;

    if (showFavOnly) items = items.filter(k => favorites.includes(k.kpi_key));
    if (filterVendor) items = items.filter(k => k.vendor === filterVendor);
    if (filterTechno) items = items.filter(k => k.techno === filterTechno);
    if (filterNormalized === 'normalized') items = items.filter(k => k.is_normalized);
    if (filterNormalized === 'vendor-specific') items = items.filter(k => !k.is_normalized);
    if (filterLevel) items = items.filter(k => k.supported_levels?.includes(filterLevel));
    if (filterDimension) items = items.filter(k => (k as any).dimension_type === filterDimension);
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
  }, [uniqueCatalog, filterVendor, filterTechno, filterNormalized, filterLevel, filterDimension, activeCategory, search, showFavOnly, favorites]);

  // When groupMode is on, collapse rows that share kpi_code_normalized
  // into a single virtual entry. Each virtual entry exposes _variants
  // so the selection / rendering layer can fan out to the underlying
  // vendor-specific kpi_keys without touching upstream consumers.
  const displayCatalog = useMemo(() => {
    if (!groupMode) return filteredCatalog;
    const groups = new Map<string, KpiCatalogEntry[]>();
    const standalone: KpiCatalogEntry[] = [];
    for (const k of filteredCatalog) {
      const norm = ((k as any).kpi_code_normalized || '').trim();
      if (!norm) { standalone.push(k); continue; }
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push(k);
    }
    const merged: any[] = [];
    for (const [norm, variants] of groups.entries()) {
      const head = variants[0];
      const vendors = Array.from(new Set(variants.map(v => v.vendor).filter(Boolean)));
      const technos = Array.from(new Set(variants.map(v => v.techno).filter(Boolean)));
      if (multivendorOnly && vendors.length < 2) continue;
      merged.push({
        ...head,
        kpi_key: norm,
        display_name: norm,
        description: variants.length > 1
          ? `${variants.length} vendor variants — ${vendors.join(', ')}`
          : (head.description || ''),
        vendor: vendors.length === 1 ? vendors[0] : vendors.join('+'),
        techno: technos.length === 1 ? technos[0] : technos[0] || '',
        is_normalized: true,
        _variants: variants,
        _variant_keys: variants.map(v => v.kpi_key),
      });
    }
    // When multivendorOnly is on, single-vendor and unnormalized rows are
    // hidden so the user only sees the canonical groups that truly cover
    // multiple vendors. Otherwise standalone rows keep their identity.
    const tail = multivendorOnly ? [] : standalone;
    return [...merged.sort((a, b) => a.display_name.localeCompare(b.display_name)), ...tail];
  }, [filteredCatalog, groupMode, multivendorOnly]);

  // Categories computed from filtered catalog
  const tabCategories = useMemo(() => {
    let items = uniqueCatalog;
    if (showFavOnly) items = items.filter(k => favorites.includes(k.kpi_key));
    if (filterVendor) items = items.filter(k => k.vendor === filterVendor);
    if (filterTechno) items = items.filter(k => k.techno === filterTechno);
    if (filterNormalized === 'normalized') items = items.filter(k => k.is_normalized);
    if (filterNormalized === 'vendor-specific') items = items.filter(k => !k.is_normalized);
    if (filterLevel) items = items.filter(k => k.supported_levels?.includes(filterLevel));
    if (filterDimension) items = items.filter(k => (k as any).dimension_type === filterDimension);

    const cats = new Map<string, number>();
    for (const k of items) {
      const cat = k.category || 'Other';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    }
    return cats;
  }, [uniqueCatalog, filterVendor, filterTechno, filterNormalized, filterLevel, filterDimension, showFavOnly, favorites]);

  const totalFiltered = Array.from(tabCategories.values()).reduce((a, b) => a + b, 0);

  // 2026-05-09 — when a multivendor canonical row is toggled in groupMode,
  // we now select the CANONICAL key only (e.g. `4g_lte_dcr_volte`) instead
  // of fanning out to the verbose variants (`Ericsson__&_*`, `Nokia__&_*`).
  // Backend resolver (osmosis-parser kpi-engine SCHEMA_DECISIONS.md) accepts
  // canonical names via OR-lookup on (kpi_code, kpi_code_normalized) and
  // picks the right vendor formula per cell at compute time. Sending one
  // chip lets the operator overlay Ericsson + Nokia on a single graph.
  // variantKeys is kept in the signature for back-compat callers but is
  // ignored — the deselect path uses both the canonical key AND the
  // legacy variant keys so a previously-selected variant gets cleared.
  const toggle = (key: string, variantKeys?: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      const isOn = next.has(key)
        || (variantKeys && variantKeys.length > 0 && variantKeys.every(k => next.has(k)));
      if (isOn) {
        next.delete(key);
        // Also clear any legacy verbose variants that may still be in
        // the set (selection persisted from before the canonical fix).
        if (variantKeys) variantKeys.forEach(k => next.delete(k));
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const reset = () => setSelected(new Set());
  const clearFilters = () => {
    setFilterVendor(''); setFilterTechno(''); setFilterNormalized('');
    setFilterLevel(''); setFilterDimension(''); setActiveCategory(null); setShowFavOnly(false);
  };

  const handleConfirm = () => {
    onAxisAssignmentsChange?.(axisMapRef.current);
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[1100px] max-w-[95vw] h-[720px] max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4" />
            <h2 className="text-sm font-bold tracking-wide">Sélectionner des KPIs</h2>
            <span className="text-[10px] opacity-70">{catalog.length} KPIs{filteredCatalog.length !== catalog.length ? ` · ${filteredCatalog.length} filtrés` : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold">{selected.size} sélectionné(s)</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-primary-foreground/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: 3-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Filters */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-hidden">
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

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* Favorites toggle */}
              <div className="border-b border-border/30">
                <button
                  onClick={() => setShowFavOnly(!showFavOnly)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 transition-colors',
                    showFavOnly ? 'bg-amber-500/10' : 'hover:bg-muted/30'
                  )}
                >
                  <Star className={cn('w-3.5 h-3.5', showFavOnly ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground')} />
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', showFavOnly ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                    Favoris
                  </span>
                  {favorites.length > 0 && (() => {
                    const favSet = new Set(favorites);
                    const inScope = uniqueCatalog.reduce((n, k) => n + (favSet.has(k.kpi_key) ? 1 : 0), 0);
                    const label = inScope !== favorites.length ? `${inScope}/${favorites.length}` : `${favorites.length}`;
                    return (
                      <span
                        className="ml-auto text-[8px] font-bold text-muted-foreground bg-muted rounded-full px-1.5 h-4 min-w-4 flex items-center justify-center"
                        title={inScope !== favorites.length ? `${inScope} dans le périmètre · ${favorites.length - inScope} hors périmètre` : 'Favoris'}
                      >
                        {label}
                      </span>
                    );
                  })()}
                </button>
              </div>

              {/* KPI Type */}
              <FilterSection
                label="Type"
                selected={filterNormalized}
                onChange={setFilterNormalized}
                options={[
                  { value: 'normalized', label: 'Normalisé', count: filterOptions.normalizedCount },
                  { value: 'vendor-specific', label: 'Vendor-Specific', count: filterOptions.vendorSpecificCount },
                ]}
              />

              {/* Vendor */}
              <FilterSection
                label="Vendor"
                selected={filterVendor}
                onChange={setFilterVendor}
                options={filterOptions.vendors}
              />

              {/* Technology */}
              <FilterSection
                label="Technology"
                selected={filterTechno}
                onChange={setFilterTechno}
                options={filterOptions.technos}
              />

              {/* Level */}
              {filterOptions.levels.length > 0 && (
                <FilterSection
                  label="Level"
                  selected={filterLevel}
                  onChange={setFilterLevel}
                  options={filterOptions.levels}
                  defaultOpen={false}
                />
              )}

              {filterOptions.dimensions.size > 0 && (
                <FilterSection
                  label="Dimension"
                  selected={filterDimension}
                  onChange={setFilterDimension}
                  options={Array.from(filterOptions.dimensions.entries()).sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ value: v, label: DIMENSION_LABELS[v] || v, count: c }))}
                  defaultOpen={false}
                />
              )}
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <div className="px-3 py-2 border-t border-border/40">
                <button
                  onClick={clearFilters}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Effacer les filtres
                </button>
              </div>
            )}
          </div>

          {/* Middle: Categories */}
          <div className="w-[180px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                Catégories
              </p>
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                  activeCategory === null ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                )}
              >
                <span>Tous</span>
                <span className={cn('text-[9px]', activeCategory === null ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {totalFiltered}
                </span>
              </button>
              {Array.from(tabCategories.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <span className={cn('text-[9px] shrink-0 ml-1', activeCategory === cat ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: KPI list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search + group-by-normalized toggle */}
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher par nom ou KPI Code…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setGroupMode(g => !g)}
                className={cn(
                  'shrink-0 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-all',
                  groupMode
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted'
                )}
                title="Group rows that share kpi_code_normalized into a single multivendor entry"
              >
                🔗 {groupMode ? 'Grouped' : 'Group by normalized'}
              </button>
              {groupMode && (
                <label
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-background text-[10px] font-medium text-muted-foreground cursor-pointer hover:bg-muted"
                  title="Hide groups that cover only one vendor"
                >
                  <input
                    type="checkbox"
                    checked={multivendorOnly}
                    onChange={e => setMultivendorOnly(e.target.checked)}
                    className="w-3 h-3"
                  />
                  <span>Multivendor only</span>
                </label>
              )}
            </div>

            {/* KPI items */}
            <div className="flex-1 overflow-y-auto px-3 py-1">
              {displayCatalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <span className="text-xs text-muted-foreground">Aucun résultat</span>
                  {(activeFilterCount > 0 || showFavOnly) && (
                    <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">Effacer les filtres</button>
                  )}
                </div>
              ) : (
                <>
                  {displayCatalog.length > 200 && !search && (
                    <div className="flex items-center justify-center py-3 mb-1 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        {displayCatalog.length} {groupMode ? 'groups' : 'KPIs'} — <span className="font-semibold text-foreground">tapez pour rechercher</span> ou filtrez par catégorie/vendor
                      </p>
                    </div>
                  )}
                  {(displayCatalog.length > 200 && !search ? displayCatalog.slice(0, 200) : displayCatalog).map((k: any) => {
                    const variantKeys: string[] | undefined = k._variant_keys;
                    const isGroup = !!(variantKeys && variantKeys.length > 1);
                    // 2026-05-09 — selection is now keyed by canonical
                    // name (k.kpi_key in groupMode IS the canonical), so
                    // both group and standalone rows check the same set.
                    // Variant-keys check kept as a fallback for sessions
                    // whose `selected` set still has legacy verbose
                    // entries from before the canonical migration.
                    const isSelected = selected.has(k.kpi_key)
                      || (isGroup && variantKeys!.length > 0 && variantKeys!.every(vk => selected.has(vk)));
                    const isFav = favorites.includes(k.kpi_key);
                    // Variants list when grouped — used by the Info popover
                    // to show the per-vendor formula. When NOT grouped, the
                    // current row IS the variant; we wrap it as a single-
                    // element list so the popover code stays uniform.
                    const variantsForInfo: any[] = isGroup
                      ? (k._variants || [])
                      : [k];
                    const infoOpen = infoOpenKey === k.kpi_key;
                    return (
                      <React.Fragment key={k.kpi_key}>
                      <div
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all mb-px',
                          isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
                        )}
                      >
                        {/* Favorite star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(k.kpi_key); }}
                          className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors"
                          title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        >
                          <Star className={cn('w-3 h-3', isFav ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/40 hover:text-amber-400')} />
                        </button>
                        {/* Info ⓘ — opens the formula drawer below the row.
                            Sibling of the select-button so clicking it does
                            not toggle KPI selection. Disabled when no
                            formula data is available (legacy catalog rows). */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setInfoOpenKey(infoOpen ? null : k.kpi_key); }}
                          className={cn(
                            'shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors',
                            infoOpen && 'bg-primary/10'
                          )}
                          title={infoOpen ? 'Masquer la formule' : 'Voir la formule'}
                        >
                          <Info className={cn('w-3 h-3', infoOpen ? 'text-primary' : 'text-muted-foreground/60 hover:text-primary')} />
                        </button>

                        {/* Select checkbox + info */}
                        <button
                          onClick={() => toggle(k.kpi_key, variantKeys)}
                          className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                        >
                          <div className={cn(
                            'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            isSelected ? 'bg-primary border-primary' : 'border-border'
                          )}>
                            {isSelected && <Check className="w-2 h-2 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isGroup && <span className="text-[10px]" title="Multivendor group">🔗</span>}
                              <p className="text-[11px] font-medium text-foreground truncate">{k.display_name}</p>
                              <span
                                className={cn(
                                  'text-[8px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 border',
                                  isGroup
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                )}
                                title={isGroup ? `Group: covers ${variantKeys!.length} kpi_codes` : `KPI Code: ${k.kpi_key}`}
                              >
                                {isGroup ? `${variantKeys!.length}× variants` : k.kpi_key}
                              </span>
                            </div>
                            {k.description && (
                              <p className="text-[9px] text-muted-foreground truncate">{k.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(k as any).dimension_type && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">{DIMENSION_LABELS[(k as any).dimension_type] || (k as any).dimension_type}</span>
                            )}
                            {k.vendor && (() => {
                              const vb = vendorBadge(k.vendor);
                              return <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold', vb.bg, vb.text)}>{k.vendor}</span>;
                            })()}
                            {k.techno && (() => {
                              const tb = techBadge(k.techno);
                              return <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold', tb.bg, tb.text)}>{k.techno}</span>;
                            })()}
                            <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">{k.unit || '–'}</span>
                          </div>
                        </button>

                        {/* L/R axis toggle — only when selected */}
                        {isSelected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAxis(k.kpi_key); }}
                            className={cn(
                              'shrink-0 w-6 h-5 rounded text-[8px] font-black tracking-tight flex items-center justify-center border transition-all',
                              (axisMap[k.kpi_key] || 'left') === 'left'
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-accent/50 border-accent text-accent-foreground'
                            )}
                            title={(axisMap[k.kpi_key] || 'left') === 'left' ? 'Axe gauche — cliquer pour passer à droite' : 'Axe droit — cliquer pour passer à gauche'}
                          >
                            {(axisMap[k.kpi_key] || 'left') === 'left' ? 'L' : 'R'}
                          </button>
                        )}
                      </div>
                      {/* Formula drawer — one block per vendor variant.
                          For multivendor canonical KPIs this shows BOTH
                          the Ericsson and Nokia formulas side-by-side so
                          the operator can compare the underlying counters.
                          Numerator / denominator come from
                          kpi.kpi_definition.numerateur / denominateur (FR
                          column names preserved by the catalog mapper). */}
                      {infoOpen && (
                        <div className="ml-7 mb-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60">
                          <div className="text-[9px] font-semibold text-muted-foreground mb-1.5">
                            Formule{variantsForInfo.length > 1 ? 's' : ''} ({variantsForInfo.length} variant{variantsForInfo.length > 1 ? 's' : ''})
                          </div>
                          <div className="space-y-2">
                            {variantsForInfo.map((v: any, idx: number) => {
                              const num = v.numerator || v.numerateur || '—';
                              const den = v.denominator || v.denominateur || '1';
                              const denShown = String(den).trim() && String(den).trim() !== '1' && String(den).trim() !== '1.0';
                              const vb = vendorBadge(v.vendor || '');
                              return (
                                <div key={`${v.kpi_key || k.kpi_key}-${idx}`} className="text-[10px]">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    {v.vendor && (
                                      <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold', vb.bg, vb.text)}>{v.vendor}</span>
                                    )}
                                    <span className="font-mono text-[9px] text-muted-foreground">{v.kpi_key || k.kpi_key}</span>
                                  </div>
                                  <div className="font-mono text-[10px] text-foreground bg-background/60 rounded px-2 py-1 break-all">
                                    <span className="text-emerald-500/90">num:</span> {num}
                                  </div>
                                  {denShown && (
                                    <div className="font-mono text-[10px] text-foreground bg-background/60 rounded px-2 py-1 mt-0.5 break-all">
                                      <span className="text-amber-500/90">den:</span> {den}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {filteredCatalog.length > 200 && !search && (
                    <div className="text-center py-2 text-[9px] text-muted-foreground">
                      Affichage limité à 200 — utilisez la recherche pour trouver un KPI spécifique
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card">
          <div className="flex flex-wrap gap-1 max-w-[600px] overflow-hidden">
            {Array.from(selected).slice(0, 8).map(key => {
              const k = catalog.find(c => c.kpi_key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-semibold" title={key}>
                  <span className={cn(
                    'w-3 h-3 rounded text-[7px] font-black flex items-center justify-center',
                    (axisMap[key] || 'left') === 'left' ? 'bg-primary/20' : 'bg-accent/50'
                  )}>
                    {(axisMap[key] || 'left') === 'left' ? 'L' : 'R'}
                  </span>
                  <span className="font-mono">{key}</span>
                  <button onClick={() => toggle(key)} className="ml-0.5 hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            {selected.size > 8 && <span className="text-[9px] text-muted-foreground self-center">+{selected.size - 8} autres</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
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
