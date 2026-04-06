import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import {
  FILTER_DIMENSIONS,
  resolveAvailableValues,
  isSearchDimension,
  searchDimensionValues,
  ActiveFilter,
  FilterOp,
} from '@/config/filterDimensions';
import { useFilterCache } from '@/hooks/useFilterCache';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Filter, RotateCcw, Search, Check, ChevronDown, Loader2 } from 'lucide-react';

// ── Search-based Filter Chip (for site/cell — live autocomplete) ──
const SearchFilterChip: React.FC<{
  filter: ActiveFilter;
  allFilters: ActiveFilter[];
}> = ({ filter, allFilters }) => {
  const { removeGlobalFilter, updateGlobalFilter, setGlobalFilterValues } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find((d) => d.key === filter.dimension);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchDimensionValues(filter.dimension, q, allFilters)
        .then(vals => setSuggestions(vals))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 300);
  }, [filter.dimension, allFilters]);

  useEffect(() => { doSearch(search); }, [search, doSearch]);

  const toggleValue = (val: string) => {
    const next = filter.values.includes(val)
      ? filter.values.filter((v) => v !== val)
      : [...filter.values, val];
    setGlobalFilterValues(filter.id, next);
  };

  const deselectAll = () => setGlobalFilterValues(filter.id, []);

  const label = dim?.label || filter.dimension;
  const valueLabel =
    filter.values.length === 0
      ? 'Tous'
      : filter.values.length <= 2
      ? filter.values.join(', ')
      : `${filter.values.length} sélectionnés`;

  // Merge suggestions + already selected values for display
  const displayList = useMemo(() => {
    const set = new Set([...filter.values, ...suggestions]);
    return Array.from(set).sort();
  }, [filter.values, suggestions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="group flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted/80 transition-all text-xs font-medium shadow-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground/60 font-normal">{filter.op}</span>
          <span className="text-foreground font-semibold max-w-[180px] truncate">
            {valueLabel}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
          <button
            onClick={(e) => { e.stopPropagation(); removeGlobalFilter(filter.id); }}
            className="ml-1 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 space-y-2">
          {/* Operator selector */}
          <div className="flex items-center gap-1">
            {(['IN', 'NOT_IN', 'EQ'] as FilterOp[]).map((op) => (
              <button
                key={op}
                onClick={() => updateGlobalFilter(filter.id, { op })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  filter.op === op
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {op.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tapez 2+ lettres pour rechercher..."
              className="w-full pl-7 pr-7 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
            {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          </div>

          {/* Selected count + clear */}
          <div className="flex items-center gap-2">
            {filter.values.length > 0 && (
              <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:underline font-medium">
                Désélectionner ({filter.values.length})
              </button>
            )}
          </div>

          {/* Results list */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
            {search.length < 2 && filter.values.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">Tapez au moins 2 caractères</p>
            ) : displayList.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">{loading ? 'Recherche...' : 'Aucun résultat'}</p>
            ) : (
              displayList.map((val) => {
                const selected = filter.values.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggleValue(val)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${
                      selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selected ? 'bg-primary border-primary' : 'border-border'
                      }`}
                    >
                      {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Enum Filter Chip (for DOR, Plaque, Band, etc.) ──
const EnumFilterChip: React.FC<{
  filter: ActiveFilter;
  allFilters: ActiveFilter[];
}> = ({ filter, allFilters }) => {
  const { removeGlobalFilter, updateGlobalFilter, setGlobalFilterValues } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find((d) => d.key === filter.dimension);
  const availableValues = useMemo(
    () => resolveAvailableValues(filter.dimension, allFilters),
    [filter.dimension, allFilters]
  );
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = availableValues.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  const toggleValue = (val: string) => {
    const next = filter.values.includes(val)
      ? filter.values.filter((v) => v !== val)
      : [...filter.values, val];
    setGlobalFilterValues(filter.id, next);
  };

  const selectAll = () => setGlobalFilterValues(filter.id, [...availableValues]);
  const deselectAll = () => setGlobalFilterValues(filter.id, []);

  const label = dim?.label || filter.dimension;
  const valueLabel =
    filter.values.length === 0
      ? 'Tous'
      : filter.values.length <= 2
      ? filter.values.join(', ')
      : `${filter.values.length} sélectionnés`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="group flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted/80 transition-all text-xs font-medium shadow-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground/60 font-normal">{filter.op}</span>
          <span className="text-foreground font-semibold max-w-[180px] truncate">
            {valueLabel}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeGlobalFilter(filter.id);
            }}
            className="ml-1 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 space-y-2">
          {/* Operator selector */}
          <div className="flex items-center gap-1">
            {(['IN', 'NOT_IN', 'EQ'] as FilterOp[]).map((op) => (
              <button
                key={op}
                onClick={() => updateGlobalFilter(filter.id, { op })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  filter.op === op
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {op.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
          </div>

          {/* Select all / deselect */}
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-[10px] text-primary hover:underline font-medium">
              Tout sélectionner
            </button>
            <span className="text-muted-foreground/30">&bull;</span>
            <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:underline font-medium">
              Désélectionner
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {filter.values.length}/{availableValues.length}
            </span>
          </div>

          {/* Value list */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">Aucun résultat</p>
            ) : (
              filtered.map((val) => {
                const selected = filter.values.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggleValue(val)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${
                      selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selected ? 'bg-primary border-primary' : 'border-border'
                      }`}
                    >
                      {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{val}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Filter Chip Router ──
const FilterChip: React.FC<{
  filter: ActiveFilter;
  allFilters: ActiveFilter[];
}> = (props) => {
  return isSearchDimension(props.filter.dimension)
    ? <SearchFilterChip {...props} />
    : <EnumFilterChip {...props} />;
};

// ── Add Filter Button ──
const AddFilterButton: React.FC = () => {
  const { addGlobalFilter } = useGlobalFilterStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-medium border-dashed">
          <Plus className="w-3.5 h-3.5" /> Filtre
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Choisir une dimension
        </p>
        {FILTER_DIMENSIONS.map((dim) => (
          <button
            key={dim.key}
            onClick={() => {
              addGlobalFilter(dim.key);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors flex items-center gap-2"
          >
            <span className="font-medium text-foreground">{dim.label}</span>
            {dim.depends_on.length > 0 && (
              <span className="text-[9px] text-muted-foreground/60">
                &larr; {dim.depends_on.join(', ')}
              </span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

// ── Main Filter Bar ──
const GlobalFilterBar: React.FC = () => {
  const { globalFilters, clearGlobalFilters, crossFilter, setCrossFilter } = useGlobalFilterStore();
  useFilterCache(globalFilters); // loads base cache + context-filtered values when parent filters change

  const hasActiveFilters = globalFilters.some((f) => f.values.length > 0) || crossFilter !== null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/60 min-h-[36px] flex-wrap">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Filtres</span>
      </div>

      {/* Active filter chips */}
      {globalFilters.map((f) => (
        <FilterChip key={f.id} filter={f} allFilters={globalFilters} />
      ))}

      {/* Cross-filter chip */}
      {crossFilter && (
        <Badge
          variant="outline"
          className="gap-1 text-xs font-medium cursor-pointer"
          onClick={() => setCrossFilter(null)}
        >
          {crossFilter.dimension}: {crossFilter.value}
          <X className="w-3 h-3" />
        </Badge>
      )}

      <AddFilterButton />

      {hasActiveFilters && (
        <button
          onClick={clearGlobalFilters}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors font-medium"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      )}

      {/* Summary */}
      {globalFilters.filter((f) => f.values.length > 0).length > 0 && (
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {globalFilters.filter((f) => f.values.length > 0).length} filtre(s) actifs &bull; AND
        </span>
      )}
    </div>
  );
};

export default GlobalFilterBar;
