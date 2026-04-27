import { supabase } from '@/integrations/supabase/client';
import { getStoredSession } from './adminAuth';

/**
 * Favorites are split by *kind* (KPIs vs PM counters) so the two name-spaces
 * never collide, but each kind is **global** across the app — favoriting a KPI
 * inside the Investigator or KPI Monitor or Rapport Builder all writes to the
 * same `osmosis_kpi_favorites_v2` list.
 *
 * Legacy callers used to pass arbitrary "module" names (`investigator`,
 * `kpi-monitor`, `pm-counters`, `counter-monitor`). For backward compatibility
 * we still accept those strings — they're transparently mapped to the right
 * kind, and existing per-module entries (DB rows + localStorage keys) are
 * unioned in on every load so users keep their picks during the migration.
 */

export type FavoriteKind = 'kpi' | 'counter';

const LS_KEY: Record<FavoriteKind, string> = {
  kpi: 'osmosis_kpi_favorites_v2',
  counter: 'osmosis_counter_favorites_v2',
};

/** Legacy localStorage key prefix (per-module). */
const LEGACY_LS_PREFIX = 'osmosis_kpi_favorites_';

/** Legacy module strings that referenced PM counters, not KPIs. */
const COUNTER_MODULES = new Set(['pm-counters', 'counter-monitor']);

/** Resolve a legacy module string (or new kind) to its canonical kind. */
function resolveKind(input: string | FavoriteKind | undefined): FavoriteKind {
  if (input === 'counter' || input === 'kpi') return input;
  if (input && COUNTER_MODULES.has(input)) return 'counter';
  return 'kpi';
}

function legacyKeysForKind(kind: FavoriteKind): string[] {
  // Walk localStorage for entries created under the old per-module scheme.
  const out: string[] = [];
  if (typeof window === 'undefined') return out;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(LEGACY_LS_PREFIX) || k === LS_KEY.kpi || k === LS_KEY.counter) continue;
      const suffix = k.slice(LEGACY_LS_PREFIX.length);
      if (resolveKind(suffix) === kind) out.push(k);
    }
  } catch {
    // ignore storage failures
  }
  return out;
}

function readLocal(kind: FavoriteKind): string[] {
  const out = new Set<string>();
  // v2 canonical
  try {
    const raw = window.localStorage.getItem(LS_KEY[kind]);
    if (raw) JSON.parse(raw).forEach((s: unknown) => typeof s === 'string' && out.add(s));
  } catch { /* ignore */ }
  // Union legacy per-module entries
  for (const lk of legacyKeysForKind(kind)) {
    try {
      const raw = window.localStorage.getItem(lk);
      if (raw) JSON.parse(raw).forEach((s: unknown) => typeof s === 'string' && out.add(s));
    } catch { /* ignore */ }
  }
  return [...out];
}

function writeLocal(kind: FavoriteKind, favs: string[]) {
  try {
    window.localStorage.setItem(LS_KEY[kind], JSON.stringify(favs));
  } catch { /* ignore */ }
}

/** Load favorites — from DB (unioned across legacy modules) if logged in, else localStorage. */
export async function loadFavorites(kindOrModule: FavoriteKind | string = 'kpi'): Promise<string[]> {
  const kind = resolveKind(kindOrModule);
  const local = readLocal(kind);

  const session = getStoredSession();
  if (!session?.id) {
    // Persist the union of v2 + legacy keys so subsequent loads are warm and
    // the migration sticks even before the user logs in.
    writeLocal(kind, local);
    return local;
  }

  // DB: read every module that resolves to this kind so legacy rows still surface.
  const modulesForKind: string[] = kind === 'counter'
    ? ['counter', ...COUNTER_MODULES]
    : ['kpi', 'investigator', 'kpi-monitor'];

  const { data, error } = await supabase
    .from('user_kpi_favorites')
    .select('kpi_key, module')
    .eq('user_id', session.id)
    .in('module', modulesForKind);

  if (error) {
    console.warn('[favorites] DB read failed, using localStorage', error);
    return local;
  }

  const merged = new Set<string>(local);
  (data || []).forEach((r: { kpi_key: string }) => merged.add(r.kpi_key));
  const out = [...merged];
  // Refresh local cache so subsequent loads are warm and the legacy union is preserved.
  writeLocal(kind, out);
  return out;
}

/** Save favorites — to DB (canonical module key) if logged in, always to localStorage. */
export async function saveFavorites(
  favs: string[],
  kindOrModule: FavoriteKind | string = 'kpi',
): Promise<void> {
  const kind = resolveKind(kindOrModule);
  writeLocal(kind, favs);

  const session = getStoredSession();
  if (!session?.id) return;

  const { error: delError } = await supabase
    .from('user_kpi_favorites')
    .delete()
    .eq('user_id', session.id)
    .eq('module', kind);

  if (delError) {
    console.warn('[favorites] DB delete failed', delError);
    return;
  }

  if (favs.length === 0) return;

  const rows = favs.map(kpi_key => ({ user_id: session.id, kpi_key, module: kind }));
  const { error: insError } = await supabase.from('user_kpi_favorites').insert(rows as any);
  if (insError) {
    console.warn('[favorites] DB insert failed', insError);
  }
}

/** Toggle a single favorite (returns the new list). */
export async function toggleFavorite(
  key: string,
  currentFavs: string[],
  kindOrModule: FavoriteKind | string = 'kpi',
): Promise<string[]> {
  const updated = currentFavs.includes(key)
    ? currentFavs.filter(k => k !== key)
    : [...currentFavs, key];
  await saveFavorites(updated, kindOrModule);
  return updated;
}

// ── Test helpers (only exported for unit tests) ────────────────────────────

/** @internal */
export const _internal = { resolveKind, legacyKeysForKind, readLocal, LS_KEY, LEGACY_LS_PREFIX };
