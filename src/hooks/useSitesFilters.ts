import { useState, useEffect, useMemo, useCallback } from 'react';
import { topoApi } from '@/lib/localDb';
import { getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

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

const FILTER_LABELS: Record<string, string> = {
  dor: 'DOR',
  plaque: 'Plaque',
  constructeur: 'Constructeur',
  techno: 'Technologie',
  bande: 'Bande',
  zone_arcep: 'Zone ARCEP',
};

const FILTER_KEYS = ['dor', 'plaque', 'constructeur', 'techno', 'bande', 'zone_arcep'];

export function useSitesFilters() {
  const [filterDefs, setFilterDefs] = useState<FilterDefinition[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    topoApi.filters()
      .then(data => {
        const defs = data.filters || [];
        if (defs.length > 0) {
          setFilterDefs(defs);
          setLoading(false);
          return;
        }
        return extractFiltersFromSites();
      })
      .catch(() => extractFiltersFromSites())
      .finally(() => setLoading(false));

    async function extractFiltersFromSites() {
      try {
        const url = getVpsProxyUrl('parser', '/api/v1/topo/sites?limit=50000');
        const resp = await fetch(url, { headers: getVpsProxyHeaders() });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const sites: any[] = await resp.json();
        if (!Array.isArray(sites) || sites.length === 0) {
          setFilterDefs([{ id: 'techno', label: 'Technologie', values: ['4G', '5G'] }]);
          return;
        }

        const sets: Record<string, Set<string>> = {};
        FILTER_KEYS.forEach(k => sets[k] = new Set());

        for (const s of sites) {
          if (s.dor) sets.dor.add(s.dor);
          if (s.plaque) sets.plaque.add(s.plaque);
          if (s.constructeur) sets.constructeur.add(s.constructeur);
          if (s.zone_arcep) sets.zone_arcep.add(s.zone_arcep);
          if (Array.isArray(s.technos)) s.technos.forEach((t: string) => sets.techno.add(t));
          else if (s.techno) sets.techno.add(s.techno);
          if (Array.isArray(s.bandes)) s.bandes.forEach((b: string) => sets.bande.add(b));
          else if (s.bande) sets.bande.add(s.bande);
        }

        const defs: FilterDefinition[] = FILTER_KEYS
          .filter(k => sets[k].size > 0)
          .map(k => ({
            id: k,
            label: FILTER_LABELS[k] || k,
            values: [...sets[k]].sort(),
          }));

        if (defs.length > 0) setFilterDefs(defs);
        else setFilterDefs([{ id: 'techno', label: 'Technologie', values: ['4G', '5G'] }]);
      } catch (err) {
        console.warn('[useSitesFilters] fallback extraction failed', err);
        setFilterDefs([{ id: 'techno', label: 'Technologie', values: ['4G', '5G'] }]);
      }
    }
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
