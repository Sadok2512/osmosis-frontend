import { useCallback, useEffect, useState } from 'react';
import {
  type FavoriteKind,
  loadFavorites,
  toggleFavorite as toggleFavoriteService,
  _internal,
} from '@/services/favoritesService';

const { LS_KEY } = _internal;

/**
 * Reactive access to the global KPI / counter favorites list.
 *
 * `kind = 'kpi'` (default) reads/writes the shared KPI favorites; `'counter'`
 * targets PM counter favorites. Any component using this hook stays in sync
 * with every other component on the page (and across tabs) via storage events.
 */
export function useKpiFavorites(kind: FavoriteKind = 'kpi') {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load (DB + legacy union, cached to localStorage by the service).
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadFavorites(kind)
      .then(favs => { if (!cancelled) setFavorites(favs); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [kind]);

  // Cross-tab + cross-component sync: listen for storage events on the
  // canonical localStorage key and refresh local state.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY[kind]) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : [];
        setFavorites(Array.isArray(next) ? next.filter((s: unknown): s is string => typeof s === 'string') : []);
      } catch { /* ignore parse errors */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [kind]);

  const toggle = useCallback(async (key: string) => {
    setFavorites(prev => {
      // Optimistic update so the UI flips immediately.
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      // Persist + sync (fire-and-forget; service handles errors).
      void toggleFavoriteService(key, prev, kind);
      // Notify other hook instances on this same tab (storage event only fires
      // in *other* tabs by default).
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: LS_KEY[kind], newValue: JSON.stringify(next),
        }));
      } catch { /* ignore */ }
      return next;
    });
  }, [kind]);

  const isFavorite = useCallback(
    (key: string) => favorites.includes(key),
    [favorites],
  );

  return { favorites, toggle, isFavorite, isLoading };
}
