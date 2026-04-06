import { useState, useEffect } from 'react';
import {
  loadFilterCache,
  isFilterCacheLoaded,
  onFilterCacheReady,
  loadContextFilters,
  ActiveFilter,
} from '@/config/filterDimensions';

/**
 * Triggers backend filter cache load and re-renders when ready.
 * Safe to call from multiple components — only one fetch is made.
 *
 * When activeFilters are provided, also triggers a contextual fetch
 * (e.g. ?dor=X&constructeur=Y) so child dimensions show narrowed values.
 */
export function useFilterCache(activeFilters?: ActiveFilter[]): boolean {
  const [ready, setReady] = useState(isFilterCacheLoaded());
  const [, setTick] = useState(0);

  // Load base cache
  useEffect(() => {
    if (ready) return;
    loadFilterCache();
    onFilterCacheReady(() => setReady(true));
  }, [ready]);

  // Load context-filtered values when parent filters change
  useEffect(() => {
    if (!activeFilters || activeFilters.length === 0) return;
    const isReady = loadContextFilters(activeFilters);
    if (!isReady) {
      // Re-render after a short delay to pick up the fetched values
      const timer = setTimeout(() => setTick(t => t + 1), 500);
      return () => clearTimeout(timer);
    }
  }, [activeFilters]);

  return ready;
}
