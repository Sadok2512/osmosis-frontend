import { supabase } from '@/integrations/supabase/client';
import { getStoredSession } from './adminAuth';

const LOCAL_FAV_KEY_PREFIX = 'osmosis_kpi_favorites';

function getLocalKey(module: string) {
  return `${LOCAL_FAV_KEY_PREFIX}_${module}`;
}

/** Load favorites – from DB if logged in, else localStorage */
export async function loadFavorites(module = 'investigator'): Promise<string[]> {
  const session = getStoredSession();
  if (!session?.id) {
    try { return JSON.parse(localStorage.getItem(getLocalKey(module)) || '[]'); } catch { return []; }
  }

  const { data, error } = await supabase
    .from('user_kpi_favorites')
    .select('kpi_key')
    .eq('user_id', session.id)
    .eq('module', module);

  if (error) {
    console.warn('Failed to load favorites from DB, falling back to localStorage', error);
    try { return JSON.parse(localStorage.getItem(getLocalKey(module)) || '[]'); } catch { return []; }
  }

  return (data || []).map(r => r.kpi_key);
}

/** Save favorites – to DB if logged in, always to localStorage as cache */
export async function saveFavorites(favs: string[], module = 'investigator'): Promise<void> {
  // Always save to localStorage as cache
  localStorage.setItem(getLocalKey(module), JSON.stringify(favs));

  const session = getStoredSession();
  if (!session?.id) return;

  // Delete existing favorites for this user+module
  const { error: delError } = await supabase
    .from('user_kpi_favorites')
    .delete()
    .eq('user_id', session.id)
    .eq('module', module);

  if (delError) {
    console.warn('Failed to delete old favorites', delError);
    return;
  }

  if (favs.length === 0) return;

  // Insert new favorites
  const rows = favs.map(kpi_key => ({
    user_id: session.id,
    kpi_key,
    module,
  }));

  const { error: insError } = await supabase
    .from('user_kpi_favorites')
    .insert(rows as any);

  if (insError) {
    console.warn('Failed to save favorites to DB', insError);
  }
}

/** Toggle a single favorite */
export async function toggleFavorite(kpiKey: string, currentFavs: string[], module = 'investigator'): Promise<string[]> {
  const updated = currentFavs.includes(kpiKey)
    ? currentFavs.filter(k => k !== kpiKey)
    : [...currentFavs, kpiKey];
  await saveFavorites(updated, module);
  return updated;
}
