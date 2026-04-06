import { useState, useEffect } from 'react';
import { loadFilterCache, isFilterCacheLoaded, onFilterCacheReady } from '@/config/filterDimensions';

/**
 * Triggers backend filter cache load and re-renders when ready.
 * Safe to call from multiple components — only one fetch is made.
 */
export function useFilterCache(): boolean {
  const [ready, setReady] = useState(isFilterCacheLoaded());

  useEffect(() => {
    if (ready) return;
    loadFilterCache();
    onFilterCacheReady(() => setReady(true));
  }, [ready]);

  return ready;
}
