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

const STORAGE_KEY = 'qoebit_tagged_links';

export function loadTaggedLinks(): TaggedLink[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function persistTaggedLinks(links: TaggedLink[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {}
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
