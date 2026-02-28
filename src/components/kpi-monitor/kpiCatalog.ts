import { KpiCatalogEntry } from './types';

export const KPI_CATALOG: KpiCatalogEntry[] = [
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
    numerator_counter: 'erab_setup_success', denominator_counter: 'erab_setup_attempt',
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
    kpi_id: '4', kpi_key: 'ul_tp_avg', display_name: 'UL Throughput Avg',
    description: 'Average Uplink User Throughput', techno_scope: 'both',
    unit: 'Mbps', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95'],
    is_map_supported: true,
    category: 'Throughput', color: '#8b5cf6',
  },
  {
    kpi_id: '5', kpi_key: 'latency_avg', display_name: 'Latency Avg',
    description: 'Average Round-Trip Time (P50)', techno_scope: 'both',
    unit: 'ms', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p50', 'p95', 'max'],
    is_map_supported: true, thresholds: { warning: 50, critical: 100 },
    category: 'Latency', color: '#f59e0b',
  },
  {
    kpi_id: '6', kpi_key: 'drop_rate', display_name: 'Drop Rate',
    description: 'Call / Session Drop Rate', techno_scope: 'both',
    unit: '%', value_type: 'ratio', default_agg: 'avg', allowed_aggs: ['avg', 'max'],
    numerator_counter: 'drops', denominator_counter: 'sessions_total',
    is_map_supported: true, thresholds: { warning: 2, critical: 5 },
    category: 'Retainability', color: '#ef4444',
  },
  {
    kpi_id: '7', kpi_key: 'qoe_score', display_name: 'QoE Score',
    description: 'Composite Quality of Experience Score', techno_scope: 'both',
    unit: '%', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'min', 'p50'],
    is_map_supported: true, thresholds: { warning: 70, critical: 50 },
    category: 'QoE', color: '#10b981',
  },
  {
    kpi_id: '8', kpi_key: 'traffic_dl_gb', display_name: 'DL Traffic',
    description: 'Total Downlink Traffic Volume', techno_scope: 'both',
    unit: 'GB', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg', 'max'],
    is_map_supported: true,
    category: 'Traffic', color: '#0ea5e9',
  },
  {
    kpi_id: '9', kpi_key: 'sessions_count', display_name: 'Sessions',
    description: 'Total Number of Data Sessions', techno_scope: 'both',
    unit: 'count', value_type: 'counter', default_agg: 'sum', allowed_aggs: ['sum', 'avg'],
    is_map_supported: false,
    category: 'Traffic', color: '#64748b',
  },
  {
    kpi_id: '10', kpi_key: 'tcp_retrans_rate', display_name: 'TCP Retrans Rate',
    description: 'TCP Retransmission Rate', techno_scope: 'both',
    unit: '%', value_type: 'gauge', default_agg: 'avg', allowed_aggs: ['avg', 'p95', 'max'],
    is_map_supported: true, thresholds: { warning: 5, critical: 10 },
    category: 'TCP', color: '#ec4899',
  },
];

export const KPI_CATALOG_MAP = Object.fromEntries(KPI_CATALOG.map(k => [k.kpi_key, k]));
