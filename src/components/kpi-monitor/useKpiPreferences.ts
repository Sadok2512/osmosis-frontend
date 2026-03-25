import { useState, useCallback, useEffect } from 'react';

const RECENT_KEY = 'kpi_selector_recent';
const FAVORITES_KEY = 'kpi_selector_favorites';
const MAX_RECENT = 10;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function useKpiPreferences() {
  const [recent, setRecent] = useState<string[]>(() => readJson(RECENT_KEY, []));
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readJson<string[]>(FAVORITES_KEY, [])));

  // Persist recent
  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }, [recent]);

  // Persist favorites
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const addRecent = useCallback((keys: string[]) => {
    setRecent(prev => {
      const next = [...keys, ...prev.filter(k => !keys.includes(k))].slice(0, MAX_RECENT);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const isFavorite = useCallback((key: string) => favorites.has(key), [favorites]);

  return { recent, favorites, addRecent, toggleFavorite, isFavorite };
}
