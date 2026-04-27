import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the supabase module so loadFavorites/saveFavorites stay pure-localStorage
// during tests (the service early-returns when there's no logged-in session).
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('./adminAuth', () => ({ getStoredSession: () => null }));

import { loadFavorites, saveFavorites, toggleFavorite, _internal } from './favoritesService';

const { LS_KEY, LEGACY_LS_PREFIX, resolveKind } = _internal;

describe('favoritesService — global, kind-scoped', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('resolves legacy module strings to the right kind', () => {
    expect(resolveKind('kpi')).toBe('kpi');
    expect(resolveKind('counter')).toBe('counter');
    expect(resolveKind('investigator')).toBe('kpi');
    expect(resolveKind('kpi-monitor')).toBe('kpi');
    expect(resolveKind('pm-counters')).toBe('counter');
    expect(resolveKind('counter-monitor')).toBe('counter');
    expect(resolveKind(undefined)).toBe('kpi');
  });

  it('reads the v2 canonical localStorage key', async () => {
    window.localStorage.setItem(LS_KEY.kpi, JSON.stringify(['K1', 'K2']));
    const favs = await loadFavorites('kpi');
    expect(favs.sort()).toEqual(['K1', 'K2']);
  });

  it('unions legacy per-module entries with the canonical list on load', async () => {
    window.localStorage.setItem(LS_KEY.kpi, JSON.stringify(['SHARED']));
    window.localStorage.setItem(`${LEGACY_LS_PREFIX}investigator`, JSON.stringify(['INV1', 'SHARED']));
    window.localStorage.setItem(`${LEGACY_LS_PREFIX}kpi-monitor`, JSON.stringify(['KM1']));

    const favs = await loadFavorites('kpi');
    expect(favs.sort()).toEqual(['INV1', 'KM1', 'SHARED']);
  });

  it('keeps KPI and counter namespaces separate', async () => {
    window.localStorage.setItem(`${LEGACY_LS_PREFIX}investigator`, JSON.stringify(['KPI_K1']));
    window.localStorage.setItem(`${LEGACY_LS_PREFIX}pm-counters`, JSON.stringify(['M8005C0']));

    const kpis = await loadFavorites('kpi');
    const counters = await loadFavorites('counter');
    expect(kpis).toEqual(['KPI_K1']);
    expect(counters).toEqual(['M8005C0']);
  });

  it('saveFavorites writes to the canonical v2 key for the resolved kind', async () => {
    await saveFavorites(['A', 'B'], 'kpi-monitor');
    expect(JSON.parse(window.localStorage.getItem(LS_KEY.kpi)!)).toEqual(['A', 'B']);

    await saveFavorites(['M1'], 'pm-counters');
    expect(JSON.parse(window.localStorage.getItem(LS_KEY.counter)!)).toEqual(['M1']);
  });

  it('toggleFavorite adds when missing and removes when present', async () => {
    let favs: string[] = [];
    favs = await toggleFavorite('K1', favs, 'kpi');
    expect(favs).toEqual(['K1']);
    favs = await toggleFavorite('K2', favs, 'kpi');
    expect(favs.sort()).toEqual(['K1', 'K2']);
    favs = await toggleFavorite('K1', favs, 'kpi');
    expect(favs).toEqual(['K2']);
  });

  it('refreshes local cache so the union persists after migration', async () => {
    window.localStorage.setItem(`${LEGACY_LS_PREFIX}investigator`, JSON.stringify(['LEGACY1']));
    await loadFavorites('kpi');
    // After load, the v2 key should now contain the union.
    expect(JSON.parse(window.localStorage.getItem(LS_KEY.kpi)!)).toEqual(['LEGACY1']);
  });
});
