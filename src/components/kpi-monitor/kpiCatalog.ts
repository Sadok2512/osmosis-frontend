import { KpiCatalogEntry } from './types';
import { supabase } from '@/integrations/supabase/client';

// ── Map famille → category ──
const FAMILLE_TO_CATEGORY: Record<string, KpiCatalogEntry['category']> = {
  ACCESSIBILITY: 'Access', RETAINABILITY: 'Retainability', MOBILITY: 'Access',
  THROUGHPUT: 'Throughput', TRAFFIC: 'Traffic', Corporate: 'Other',
  CAPACITY: 'Traffic', AVAILABILITY: 'Access', INTERFERENCE: 'TCP',
};

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
    thresholds: row.threshold_warning ? { warning: row.threshold_warning, critical: row.threshold_critical || row.threshold_warning * 0.8 } : undefined,
    category: FAMILLE_TO_CATEGORY[row.famille] || 'Other',
    color: row.color || '#64748b',
  };
}

// ── Fetch from DB (no fallback) ──
export async function fetchKpiCatalogFromDB(): Promise<KpiCatalogEntry[]> {
  const { data, error } = await supabase
    .from('kpi_catalog')
    .select('*')
    .order('famille', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('KPI catalog fetch error:', error.message);
    return [];
  }

  return (data || []).map(dbRowToCatalog);
}

// ── Compat exports (empty defaults, populated at runtime) ──
export const KPI_CATALOG: KpiCatalogEntry[] = [];
export const KPI_CATALOG_MAP: Record<string, KpiCatalogEntry> = {};

export function buildCatalogMap(catalog: KpiCatalogEntry[]): Record<string, KpiCatalogEntry> {
  return Object.fromEntries(catalog.map(k => [k.kpi_key, k]));
}
