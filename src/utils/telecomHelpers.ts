/**
 * Shared helpers for OSMOSIS — tech normalization, site/cell key resolution, map aggregation.
 * Single source of truth; import these everywhere instead of inline logic.
 */

// ── Technology normalization ──

/** Normalize any raw technology string to '4G' or '5G'. Defaults to '4G' if unrecognizable. */
export function normalizeTech(raw: string | null | undefined): '4G' | '5G' {
  const v = String(raw || '').trim().toUpperCase();
  if (v.includes('NR') || v.includes('5G')) return '5G';
  if (v.includes('LTE') || v.includes('4G')) return '4G';
  return '4G';
}

/** Returns true if the technology string represents 5G/NR */
export function is5GTech(techno?: string | null): boolean {
  const tech = String(techno || '').toUpperCase();
  return tech.includes('5G') || tech.includes('NR');
}

/** Returns true if the technology string represents 4G/LTE (and is NOT 5G) */
export function is4GTech(techno?: string | null): boolean {
  const tech = String(techno || '').toUpperCase();
  return !is5GTech(tech) && (tech.includes('4G') || tech.includes('LTE'));
}

/** Strict tech group classification — returns null for unknown tech */
export function getCellTechGroup(techno?: string | null): '4G' | '5G' | null {
  if (is5GTech(techno)) return '5G';
  if (is4GTech(techno)) return '4G';
  return null;
}

// ── Site identity normalization ──

/** Normalize a site key (name or id) for reliable matching (trim, uppercase, collapse separators) */
export function normalizeSiteKey(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[_\s\-]+/g, '');
}

/** Resolve the canonical site identifier from a row, preferring stable backend IDs */
export function resolveCanonicalSiteId(row: any): string {
  return String(
    row.code_nidt ||
    row.site_id ||
    row.site_code ||
    row.site_name ||
    'UNKNOWN_SITE'
  ).trim().toUpperCase();
}

// ── Cell deduplication ──

/** Generate a stable unique key for a cell to deduplicate across fetches */
export function stableCellKey(siteId: string, cell: any): string {
  const cellName = cell.cell_name || cell.cell_id || cell.name || '';
  const sector = cell.sector ?? cell.azimut ?? '';
  const techno = cell.techno || cell.technology || '';
  const band = cell.bande || cell.band || '';
  return `${siteId}::${cellName}::${sector}::${techno}::${band}`;
}

// ── Map aggregation ──

export interface MapAggregation {
  uniqueSiteCount: number;
  uniqueCellCount: number;
  unique4GCellCount: number;
  unique5GCellCount: number;
  serverTotal?: number;
  displayedTotal: number;
}

/** Compute deduplicated map aggregation from a list of sites */
export function computeMapAggregation(
  sites: any[],
  serverTotal?: number,
): MapAggregation {
  const siteSet = new Set<string>();
  const cellSet = new Set<string>();
  let count4G = 0;
  let count5G = 0;

  for (const site of sites) {
    const canonId = resolveCanonicalSiteId(site);
    siteSet.add(canonId);

    if (site.cells && Array.isArray(site.cells)) {
      for (const cell of site.cells) {
        const key = stableCellKey(canonId, cell);
        if (!cellSet.has(key)) {
          cellSet.add(key);
          const tech = getCellTechGroup(cell.techno);
          if (tech === '4G') count4G++;
          else if (tech === '5G') count5G++;
        }
      }
    }
  }

  return {
    uniqueSiteCount: siteSet.size,
    uniqueCellCount: cellSet.size,
    unique4GCellCount: count4G,
    unique5GCellCount: count5G,
    serverTotal,
    displayedTotal: siteSet.size,
  };
}

// ── KPI metadata helpers ──

export interface KpiMeta {
  key: string;
  higherIsBetter: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
}

/**
 * Determine severity for a KPI value given metadata.
 * - If higherIsBetter: lower values are worse → critical < warning
 * - If !higherIsBetter (drop rate, loss, latency): higher values are worse → critical > warning
 */
export function getKpiSeverity(
  value: number,
  meta: KpiMeta,
): 'critical' | 'warning' | 'ok' {
  const { higherIsBetter, warningThreshold, criticalThreshold } = meta;

  if (warningThreshold == null || criticalThreshold == null) return 'ok';

  if (higherIsBetter) {
    // E.g. success rate: 100% is good, 90% is warning, 80% is critical
    if (value <= criticalThreshold) return 'critical';
    if (value <= warningThreshold) return 'warning';
    return 'ok';
  } else {
    // E.g. drop rate: 0% is good, 2% is warning, 5% is critical
    if (value >= criticalThreshold) return 'critical';
    if (value >= warningThreshold) return 'warning';
    return 'ok';
  }
}

/**
 * Sort comparator for "worst first" ranking that respects KPI orientation.
 * Returns negative if `a` is worse than `b`.
 */
export function worstFirstComparator(
  aVal: number | undefined,
  bVal: number | undefined,
  higherIsBetter: boolean,
): number {
  const a = aVal ?? (higherIsBetter ? Infinity : -Infinity);
  const b = bVal ?? (higherIsBetter ? Infinity : -Infinity);
  if (higherIsBetter) {
    // Lower is worse → sort ascending
    return a - b;
  } else {
    // Higher is worse → sort descending
    return b - a;
  }
}
