import { KpiCatalogEntry } from './types';
import { supabase } from '@/integrations/supabase/client';

// ── Static fallback catalog (used when DB is empty) ──
export const KPI_CATALOG_STATIC: KpiCatalogEntry[] = [
  {
    kpi_id: '1', kpi_key: 'rrc_setup_sr', display_name: 'RRC Setup SR',
    description: 'RRC Connection Setup Success Rate', techno_scope: 'both',
    unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'max', 'p95'],
    numerator_counter: 'rrc_setup_success', denominator_counter: 'rrc_setup_attempt',
    is_map_supported: true, thresholds: { warning: 95, critical: 90 },
    category: 'Access', color: '#3b82f6',
  },
  {
    kpi_id: '2', kpi_key: 'erab_setup_sr', display_name: 'E-RAB Setup SR',
    description: 'E-RAB Establishment Success Rate', techno_scope: '4G',
    unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'max'],
    is_map_supported: true, thresholds: { warning: 96, critical: 92 },
    category: 'Access', color: '#6366f1',
  },
  {
    kpi_id: '3', kpi_key: 'dl_tp_avg', display_name: 'DL Throughput Avg',
    description: 'Average Downlink User Throughput', techno_scope: 'both',
    unit: 'Mbps', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95', 'max'],
    is_map_supported: true, thresholds: { warning: 15, critical: 5 },
    category: 'Throughput', color: '#14b8a6',
  },
  {
    kpi_id: '4', kpi_key: 'latency_avg', display_name: 'Latency Avg',
    description: 'Average Round-Trip Time', techno_scope: 'both',
    unit: 'ms', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95', 'max'],
    is_map_supported: true, thresholds: { warning: 50, critical: 100 },
    category: 'Latency', color: '#f59e0b',
  },
  {
    kpi_id: '5', kpi_key: 'drop_rate', display_name: 'Drop Rate',
    description: 'Call / Session Drop Rate', techno_scope: 'both',
    unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'],
    is_map_supported: true, thresholds: { warning: 2, critical: 5 },
    category: 'Retainability', color: '#ef4444',
  },
];

// ── Map famille → category ──
const FAMILLE_TO_CATEGORY: Record<string, KpiCatalogEntry['category']> = {
  ACCESSIBILITY: 'Access', RETAINABILITY: 'Retainability', MOBILITY: 'Access',
  THROUGHPUT: 'Throughput', TRAFFIC: 'Traffic', Corporate: 'QoE',
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
    category: FAMILLE_TO_CATEGORY[row.famille] || 'QoE',
    color: row.color || '#64748b',
  };
}

// ── Fetch from DB ──
export async function fetchKpiCatalogFromDB(): Promise<KpiCatalogEntry[]> {
  const { data, error } = await supabase
    .from('kpi_catalog')
    .select('*')
    .order('famille', { ascending: true })
    .order('display_name', { ascending: true });

  if (error || !data || data.length === 0) {
    console.warn('KPI catalog: falling back to static catalog', error?.message);
    return KPI_CATALOG_STATIC;
  }

  return data.map(dbRowToCatalog);
}

// ── Compat exports ──
export const KPI_CATALOG = KPI_CATALOG_STATIC;
export const KPI_CATALOG_MAP = Object.fromEntries(KPI_CATALOG_STATIC.map(k => [k.kpi_key, k]));

export function buildCatalogMap(catalog: KpiCatalogEntry[]): Record<string, KpiCatalogEntry> {
  return Object.fromEntries(catalog.map(k => [k.kpi_key, k]));
}
