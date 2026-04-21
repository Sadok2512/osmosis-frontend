/**
 * Tagged Links — model and persistence for links between tagged objects
 */

export interface TaggedLink {
  id: string;
  fromId: string;
  toId: string;
  fromType: 'site' | 'point';
  toType: 'site' | 'point';
  fromLabel: string;
  toLabel: string;
  fromCoords: [number, number]; // [lat, lng]
  toCoords: [number, number];
  label: string;
  createdAt: string;
}

const STORAGE_KEY = 'osmosis_tagged_links';

function scopedKey(dashboardId?: string | null): string | null {
  if (!dashboardId) return null;
  return `${STORAGE_KEY}__db_${dashboardId}`;
}

export function loadTaggedLinks(dashboardId?: string | null): TaggedLink[] {
  const key = scopedKey(dashboardId);
  if (!key) return [];
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function persistTaggedLinks(links: TaggedLink[], dashboardId?: string | null): void {
  const key = scopedKey(dashboardId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(links));
  } catch {}
}

export function purgeTaggedLinks(dashboardId: string): void {
  try { localStorage.removeItem(`${STORAGE_KEY}__db_${dashboardId}`); } catch {}
}

/** Remove the legacy global key (pre dashboard-scoping). */
export function purgeLegacyTaggedLinks(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function createTaggedLink(
  from: { id: string; type: 'site' | 'point'; label: string; coords: [number, number] },
  to: { id: string; type: 'site' | 'point'; label: string; coords: [number, number] },
): TaggedLink {
  return {
    id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromId: from.id,
    toId: to.id,
    fromType: from.type,
    toType: to.type,
    fromLabel: from.label,
    toLabel: to.label,
    fromCoords: from.coords,
    toCoords: to.coords,
    label: `${from.label} ↔ ${to.label}`,
    createdAt: new Date().toISOString(),
  };
}
