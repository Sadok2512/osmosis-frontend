import { KpiCatalogEntry } from './types';
import { supabase } from '@/integrations/supabase/client';

const FAMILLE_TO_CATEGORY: Record<string, KpiCatalogEntry['category']> = {
  ACCESSIBILITY: 'Access',
  RETAINABILITY: 'Retainability',
  MOBILITY: 'Access',
  THROUGHPUT: 'Throughput',
  TRAFFIC: 'Traffic',
  Corporate: 'Other',
  CAPACITY: 'Traffic',
  AVAILABILITY: 'Access',
  INTERFERENCE: 'TCP',
};

const PAGE_SIZE = 1000;

function dbRowToCatalog(row: any): KpiCatalogEntry {
  return {
    kpi_id: String(row.id),
    kpi_key: row.kpi_key,
    display_name: row.display_name,
    description: row.definition || '',
    techno_scope: row.techno?.includes('5G') ? '5G' : row.techno?.includes('4G') ? '4G' : 'both',
    unit: row.unit || '',
    value_type: (row.value_type as any) || 'gauge',
    default_agg: (row.default_agg as any) || 'avg',
    allowed_aggs: ['avg', 'min', 'max', 'sum'],
    numerator_counter: row.numerator || undefined,
    denominator_counter: row.denominator || undefined,
    formula_sql: row.formula_sql || undefined,
    is_map_supported: row.is_map_supported ?? false,
    thresholds:
      row.threshold_warning != null
        ? {
            warning: row.threshold_warning,
            critical: row.threshold_critical ?? row.threshold_warning * 0.8,
          }
        : undefined,
    category: FAMILLE_TO_CATEGORY[row.famille] || 'Other',
    famille: row.famille || undefined,
    color: row.color || '#64748b',
    vendor: row.vendor || undefined,
    techno: row.techno || undefined,
    supported_levels: Array.isArray(row.supported_levels) ? row.supported_levels : undefined,
    is_normalized: row.is_normalized ?? undefined,
    dimension_type: row.dimension_type ?? null,
    dimension_prefix: row.dimension_prefix ?? null,
    // 2026-05-09 — preserve canonical name + raw formulas. The
    // RanQueryModule falls back to this Supabase loader when the
    // VPS catalog is unreachable; without these fields the selector
    // reverts to verbose Vendor__&_* names and an empty formula
    // popover.
    kpi_code_normalized: row.kpi_code_normalized ?? undefined,
    numerator: row.numerator ?? row.numerateur ?? undefined,
    denominator: row.denominator ?? row.denominateur ?? undefined,
  };
}

export async function fetchKpiCatalogFromDB(): Promise<KpiCatalogEntry[]> {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('kpi_catalog')
      .select('*')
      .order('famille', { ascending: true })
      .order('display_name', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('[kpi_catalog] Supabase error:', error.message);
      return [];
    }

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows.map(dbRowToCatalog);
}

export const KPI_CATALOG: KpiCatalogEntry[] = [];
export const KPI_CATALOG_MAP: Record<string, KpiCatalogEntry> = {};
export const KPI_CATALOG_STATIC: KpiCatalogEntry[] = [];

export function buildCatalogMap(catalog: KpiCatalogEntry[]): Record<string, KpiCatalogEntry> {
  return Object.fromEntries(catalog.map(k => [k.kpi_key, k]));
}
