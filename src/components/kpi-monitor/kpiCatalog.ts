import { KpiCatalogEntry } from './types';
import { supabase } from '@/integrations/supabase/client';

// ── Static fallback catalog (used when DB is empty or unreachable) ──
export const KPI_CATALOG_STATIC: KpiCatalogEntry[] = [
  { kpi_id: '1', kpi_key: 'debit_dl', display_name: 'Débit DL', description: 'Débit moyen descendant', techno_scope: 'both', unit: 'Mbps', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'max', 'p95'], is_map_supported: false, thresholds: { warning: 10, critical: 5 }, category: 'Throughput', color: '#14b8a6' },
  { kpi_id: '2', kpi_key: 'debit_ul', display_name: 'Débit UL', description: 'Débit moyen montant', techno_scope: 'both', unit: 'Mbps', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'max', 'p95'], is_map_supported: false, thresholds: { warning: 5, critical: 2 }, category: 'Throughput', color: '#06b6d4' },
  { kpi_id: '3', kpi_key: 'debit_dl_max', display_name: 'Débit DL Max', description: 'Débit max descendant', techno_scope: 'both', unit: 'Mbps', value_type: 'gauge', default_agg: 'max', allowed_aggs: ['avg', 'max'], is_map_supported: false, category: 'Throughput', color: '#10b981' },
  { kpi_id: '4', kpi_key: 'rtt_setup_avg', display_name: 'RTT Setup', description: 'Latence setup TCP', techno_scope: 'both', unit: 'ms', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95', 'max'], is_map_supported: false, thresholds: { warning: 80, critical: 150 }, category: 'Latency', color: '#f59e0b' },
  { kpi_id: '5', kpi_key: 'rtt_data_avg', display_name: 'RTT Data', description: 'Latence data TCP', techno_scope: 'both', unit: 'ms', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95', 'max'], is_map_supported: false, thresholds: { warning: 80, critical: 150 }, category: 'Latency', color: '#eab308' },
  { kpi_id: '6', kpi_key: 'volume_totale_dl', display_name: 'Volume DL', description: 'Volume total descendant', techno_scope: 'both', unit: 'GB', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg'], is_map_supported: false, category: 'Traffic', color: '#8b5cf6' },
  { kpi_id: '7', kpi_key: 'volume_totale_ul', display_name: 'Volume UL', description: 'Volume total montant', techno_scope: 'both', unit: 'GB', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg'], is_map_supported: false, category: 'Traffic', color: '#a78bfa' },
  { kpi_id: '8', kpi_key: 'volume_totale_totale', display_name: 'Volume Total', description: 'Volume total DL+UL', techno_scope: 'both', unit: 'GB', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg'], is_map_supported: false, category: 'Traffic', color: '#7c3aed' },
  { kpi_id: '9', kpi_key: 'session_nbr', display_name: 'Sessions', description: 'Nombre total de sessions', techno_scope: 'both', unit: '', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg'], is_map_supported: false, category: 'Traffic', color: '#6366f1' },
  { kpi_id: '10', kpi_key: 'session_dcr', display_name: 'Session DCR', description: 'Taux de coupure de session', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 2, critical: 5 }, category: 'Retainability', color: '#ef4444' },
  { kpi_id: '11', kpi_key: 'loss_dl_rate', display_name: 'Loss DL Rate', description: 'Taux perte paquets DL', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 1, critical: 3 }, category: 'TCP', color: '#f43f5e' },
  { kpi_id: '12', kpi_key: 'loss_ul_rate', display_name: 'Loss UL Rate', description: 'Taux perte paquets UL', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 1, critical: 3 }, category: 'TCP', color: '#fb7185' },
  { kpi_id: '13', kpi_key: 'tcp_retr_rate_dl', display_name: 'TCP Retrans DL', description: 'Retransmission TCP DL', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 3, critical: 5 }, category: 'TCP', color: '#e11d48' },
  { kpi_id: '14', kpi_key: 'tcp_retr_rate_ul', display_name: 'TCP Retrans UL', description: 'Retransmission TCP UL', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 3, critical: 5 }, category: 'TCP', color: '#be123c' },
  { kpi_id: '15', kpi_key: 'qoe_index', display_name: 'QoE Index', description: 'Index qualité expérience', techno_scope: 'both', unit: '', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'max'], is_map_supported: false, thresholds: { warning: 70, critical: 50 }, category: 'Other', color: '#3b82f6' },
  { kpi_id: '16', kpi_key: 'dms_debit_dl_3', display_name: 'DMS DL <3Mbps', description: '% sessions débit DL < 3 Mbps', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 20, critical: 40 }, category: 'Throughput', color: '#0ea5e9' },
  { kpi_id: '17', kpi_key: 'dms_debit_dl_8', display_name: 'DMS DL <8Mbps', description: '% sessions débit DL < 8 Mbps', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 30, critical: 50 }, category: 'Throughput', color: '#0284c7' },
  { kpi_id: '18', kpi_key: 'dms_debit_dl_30', display_name: 'DMS DL <30Mbps', description: '% sessions débit DL < 30 Mbps', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, category: 'Throughput', color: '#0369a1' },
  { kpi_id: '19', kpi_key: 'session_dur_moy', display_name: 'Durée Session', description: 'Durée moyenne de session', techno_scope: 'both', unit: 's', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, category: 'Traffic', color: '#8b5cf6' },
  { kpi_id: '20', kpi_key: 'out_of_order_rate', display_name: 'Out of Order Rate', description: 'Taux paquets hors séquence', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 1, critical: 3 }, category: 'TCP', color: '#dc2626' },
  { kpi_id: '21', kpi_key: 'wind_full_rate', display_name: 'Window Full Rate', description: 'Taux window full TCP', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, category: 'TCP', color: '#b91c1c' },
  { kpi_id: '22', kpi_key: 'instability_rate', display_name: 'Instability Rate', description: 'Taux instabilité réseau', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 5, critical: 10 }, category: 'Retainability', color: '#f97316' },
  { kpi_id: '23', kpi_key: 'Mauvaise_Session_Rate', display_name: 'Bad Session Rate', description: 'Taux mauvaises sessions', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 5, critical: 10 }, category: 'Retainability', color: '#ea580c' },
  { kpi_id: '24', kpi_key: 'time_rat_5g_pct', display_name: '5G Time %', description: '% du temps en 5G', techno_scope: '5G', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg'], is_map_supported: false, category: 'Other', color: '#22c55e' },
  { kpi_id: '25', kpi_key: 'time_rat_4g_pct', display_name: '4G Time %', description: '% du temps en 4G', techno_scope: '4G', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg'], is_map_supported: false, category: 'Other', color: '#16a34a' },
  { kpi_id: '26', kpi_key: 'fallback_5G_to_4G_rate', display_name: 'Fallback 5G→4G', description: 'Taux fallback 5G vers 4G', techno_scope: '5G', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'], is_map_supported: false, thresholds: { warning: 10, critical: 20 }, category: 'Retainability', color: '#d97706' },
  { kpi_id: '27', kpi_key: '5G_capable_rate', display_name: '5G Capable Rate', description: 'Taux terminaux 5G', techno_scope: 'both', unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg'], is_map_supported: false, category: 'Other', color: '#059669' },
];

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

// ── Fetch from DB with static fallback ──
export async function fetchKpiCatalogFromDB(): Promise<KpiCatalogEntry[]> {
  try {
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
  } catch (e) {
    console.warn('KPI catalog: fetch failed, using static fallback', e);
    return KPI_CATALOG_STATIC;
  }
}

// ── Compat exports (empty defaults, populated at runtime) ──
export const KPI_CATALOG: KpiCatalogEntry[] = [];
export const KPI_CATALOG_MAP: Record<string, KpiCatalogEntry> = {};

export function buildCatalogMap(catalog: KpiCatalogEntry[]): Record<string, KpiCatalogEntry> {
  return Object.fromEntries(catalog.map(k => [k.kpi_key, k]));
}
