// ── Single source of truth for UI ↔ backend dimension mapping ──
//
// The Precision Architect UI exposes labels like "Techno", "Constructeur",
// "Région", "Cellule"… but the monitor backend expects specific dimension
// keys (RAT, Vendor, DOR, Cellule, …). Mismatches between UI and backend
// caused filters to silently match nothing → "No data returned".
//
// All payload builders (chart + table + filter cache) MUST go through
// `toBackendDimension()` instead of doing `.toUpperCase()` blindly.

const UI_TO_BACKEND: Record<string, string> = {
  // Techno / RAT family
  Technology: 'RAT',
  TECHNOLOGY: 'RAT',
  RAT: 'RAT',
  rat: 'RAT',
  Techno: 'RAT',       // backward compat
  techno: 'RAT',       // backward compat
  TECHNO: 'RAT',       // backward compat

  // Vendor family
  Vendor: 'VENDOR',
  vendor: 'VENDOR',
  VENDOR: 'VENDOR',
  Constructeur: 'VENDOR',   // backward compat
  constructeur: 'VENDOR',   // backward compat
  CONSTRUCTEUR: 'VENDOR',   // backward compat

  // DOR / Region
  Région: 'DOR',
  Region: 'DOR',
  REGION: 'DOR',
  DR: 'DOR',
  DOR: 'DOR',

  // Cell / Site / Cluster / Bande / ARCEP
  // Backend KPI Engine expects UPPERCASE English keys (CELL, SITE, CLUSTER, BAND, ZONE_ARCEP, ...).
  // Sending French labels like "Cellule" / "Bande" silently returns rows: [].
  Cellule: 'CELL',
  CELLULE: 'CELL',
  Cell: 'CELL',
  CELL: 'CELL',
  Site: 'SITE',
  SITE: 'SITE',
  Plaque: 'CLUSTER',
  PLAQUE: 'CLUSTER',
  Cluster: 'CLUSTER',
  CLUSTER: 'CLUSTER',
  Bande: 'BAND',
  BANDE: 'BAND',
  Band: 'BAND',
  BAND: 'BAND',
  ARCEP: 'ZONE_ARCEP',
  'Zone ARCEP': 'ZONE_ARCEP',
  ZONE_ARCEP: 'ZONE_ARCEP',
  Cluster_B: 'CLUSTER',
  CLUSTER_B: 'CLUSTER',
};

function normalizeDimensionAlias(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NORMALIZED_UI_TO_BACKEND = Object.fromEntries(
  Object.entries(UI_TO_BACKEND).map(([key, mapped]) => [normalizeDimensionAlias(key), mapped]),
);

/**
 * Map any UI dimension label / cache key to the dimension string the
 * monitor backend expects in MonitorFilter.dimension.
 *
 * Unknown dimensions pass through unchanged (no `.toUpperCase()` — that
 * was the original bug).
 */
export function toBackendDimension(uiDim: string): string {
  if (!uiDim) return uiDim;
  const trimmed = uiDim.replace(/\s+/g, ' ').trim();
  return UI_TO_BACKEND[trimmed] ?? NORMALIZED_UI_TO_BACKEND[normalizeDimensionAlias(trimmed)] ?? trimmed;
}

/**
 * Map a UI granularity ("15min", "30min", "1h", "1d", "auto") to the
 * format the backend understands. The backend recognizes 5m / 15m / 1h
 * and falls back to daily otherwise — sending "15min" silently degraded
 * the result to a daily aggregation.
 */
export function toBackendGranularity(uiGrain: string): string {
  switch (uiGrain) {
    case 'auto':
      return '1h';
    case '5min':
    case '5m':
      return '5m';
    case '15min':
    case '15m':
    case '30min': // backend has no 30m → use 15m as the closest finer grain
      return '15m';
    case '1h':
      return '1h';
    case '1d':
      return '1d';
    default:
      return uiGrain || '1h';
  }
}
