/**
 * Tagged Links — model and persistence for links between tagged objects
 */

export interface TaggedLinkSector {
  cell_id: string;
  bande: string;
  techno?: string;
  azimut: number;
  tilt?: number | null;
  hba?: number | null;
  /** Angular delta between target bearing and sector azimuth, in degrees [0..180]. */
  azimuthDelta?: number;
}

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
  /** Optional auto-picked sector metadata when the endpoint is a site. */
  fromSector?: TaggedLinkSector | null;
  toSector?: TaggedLinkSector | null;
}

const STORAGE_KEY = 'osmosis_tagged_links';

function scopedKey(_dashboardId?: string | null): string {
  // Tagged links are now fully decoupled from the active dashboard:
  // a single global scope keeps them visible across dashboard switches.
  return `${STORAGE_KEY}__global`;
}

export function loadTaggedLinks(dashboardId?: string | null): TaggedLink[] {
  const key = scopedKey(dashboardId);
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function persistTaggedLinks(links: TaggedLink[], dashboardId?: string | null): void {
  const key = scopedKey(dashboardId);
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
  extra?: { fromSector?: TaggedLinkSector | null; toSector?: TaggedLinkSector | null },
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
    fromSector: extra?.fromSector ?? null,
    toSector: extra?.toSector ?? null,
  };
}

/** Smallest signed-circular distance between two azimuths, in degrees [0..180]. */
export function azimuthDelta(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
}

/**
 * From a site's cells, pick the sector with the smallest angular difference
 * between its azimuth and the target bearing. Optionally restrict to a band.
 */
export function pickClosestSector<C extends {
  cell_id: string;
  bande: string;
  techno?: string;
  azimut: number;
  tilt?: number | null;
  hba?: number | null;
}>(
  cells: C[],
  targetBearing: number,
  band?: string | null,
): (C & { azimuthDelta: number }) | null {
  const pool = (band
    ? cells.filter(c => String(c.bande || '').trim() === String(band).trim())
    : cells
  ).filter(c => Number.isFinite(c.azimut as number));
  if (!pool.length) return null;
  let best: (C & { azimuthDelta: number }) | null = null;
  for (const c of pool) {
    const d = azimuthDelta(targetBearing, Number(c.azimut));
    if (!best || d < best.azimuthDelta) best = { ...c, azimuthDelta: d } as any;
  }
  return best;
}

/** List unique non-empty bands present on a site's cells. */
export function listSiteBands<C extends { bande: string }>(cells: C[]): string[] {
  const set = new Set<string>();
  for (const c of cells) {
    const b = String(c.bande || '').trim();
    if (b) set.add(b);
  }
  return Array.from(set).sort();
}
