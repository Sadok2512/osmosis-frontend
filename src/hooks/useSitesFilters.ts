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

export function useSitesFilters() {
  const [filterDefs, setFilterDefs] = useState<FilterDefinition[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch available filters from backend
  useEffect(() => {
    setLoading(true);
    topoApi.filters()
      .then(data => setFilterDefs(data.filters || []))
      .catch(console.error)
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
