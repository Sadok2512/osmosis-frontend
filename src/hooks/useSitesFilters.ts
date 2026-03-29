import { useState, useEffect, useMemo, useCallback } from 'react';
import { topoApi } from '@/lib/localDb';

export interface FilterDefinition {
  id: string;
  label: string;
  values: string[];
}

export interface ActiveFilter {
  id: string;
  label: string;
  selectedValues: string[];
}

const FALLBACK_FILTER_DEFS: FilterDefinition[] = [
  { id: 'dor', label: 'DOR', values: [] },
  { id: 'plaque', label: 'Plaque', values: [] },
  { id: 'constructeur', label: 'Constructeur', values: [] },
  { id: 'techno', label: 'Technologie', values: ['4G', '5G'] },
  { id: 'bande', label: 'Bande', values: [] },
  { id: 'zone_arcep', label: 'Zone ARCEP', values: [] },
];

export function useSitesFilters() {
  const [filterDefs, setFilterDefs] = useState<FilterDefinition[]>(FALLBACK_FILTER_DEFS);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch available filters from backend, keep fallback if unavailable
  useEffect(() => {
    setLoading(true);
    topoApi.filters()
      .then(data => {
        const defs = data.filters || [];
        if (defs.length > 0) setFilterDefs(defs);
      })
      .catch(() => { /* keep fallback */ })
      .finally(() => setLoading(false));
  }, []);

  const addFilter = useCallback((filterId: string) => {
    const def = filterDefs.find(f => f.id === filterId);
    if (!def || activeFilters.find(f => f.id === filterId)) return;
    setActiveFilters(prev => [
      ...prev,
      { id: def.id, label: def.label, selectedValues: [] },
    ]);
  }, [filterDefs, activeFilters]);

  const toggleValue = useCallback((filterId: string, value: string) => {
    setActiveFilters(prev =>
      prev.map(f => {
        if (f.id !== filterId) return f;
        const exists = f.selectedValues.includes(value);
        return {
          ...f,
          selectedValues: exists
            ? f.selectedValues.filter(v => v !== value)
            : [...f.selectedValues, value],
        };
      }),
    );
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== filterId));
  }, []);

  const clearAll = useCallback(() => setActiveFilters([]), []);

  const buildQueryParams = useCallback((): string => {
    const params = new URLSearchParams();
    activeFilters.forEach(f => {
      if (f.selectedValues.length > 0) {
        params.set(f.id, f.selectedValues.join(','));
      }
    });
    return params.toString();
  }, [activeFilters]);

  const availableToAdd = useMemo(
    () => filterDefs.filter(d => !activeFilters.find(f => f.id === d.id)),
    [filterDefs, activeFilters],
  );

  return {
    filterDefs,
    activeFilters,
    availableToAdd,
    addFilter,
    toggleValue,
    removeFilter,
    clearAll,
    buildQueryParams,
    loading,
  };
}
