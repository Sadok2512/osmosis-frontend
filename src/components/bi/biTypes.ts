import { Layout } from 'react-grid-layout';

// ── Dimensions (match qoe_metric Dimension_1 / Dimension_2 values) ──
export const BI_DIMENSIONS = [
  'RAT', 'AS', 'Application', 'OS', 'Device_brand', 'TAC', 'POP',
  'ORF', 'Vendor', 'Bande', 'ARCEP', 'DOR', 'Plaque', 'Site', 'Cellule',
] as const;

export type BIDimension = typeof BI_DIMENSIONS[number];

// ── KPI Categories (exact qoe_metric mapping) ──
export interface BIKpiDefinition {
  key: string;
  display_name: string;
  category: string;
  unit: string;
}

export const BI_KPI_CATEGORIES = [
  'Volume', 'Débit', 'Latence', 'TCP Session KPI',
  'Radio Access Tech', 'QOE Index', 'User Capabilité',
] as const;

export type BIKpiCategory = typeof BI_KPI_CATEGORIES[number];

export const BI_KPI_CATALOG: BIKpiDefinition[] = [
  // ── Volume ──
  { key: 'volume_totale_dl', display_name: 'Volume DL', category: 'Volume', unit: 'GB' },
  { key: 'volume_totale_ul', display_name: 'Volume UL', category: 'Volume', unit: 'GB' },
  { key: 'volume_totale_totale', display_name: 'Volume Total', category: 'Volume', unit: 'GB' },
  // ── Débit ──
  { key: 'debit_ul', display_name: 'Débit UL', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_dl', display_name: 'Débit DL', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_ul_vol5', display_name: 'Débit UL Vol5', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_dl_vol5', display_name: 'Débit DL Vol5', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_ul_vol10', display_name: 'Débit UL Vol10', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_dl_vol10', display_name: 'Débit DL Vol10', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_debit_dl_30', display_name: 'DMS DL 30', category: 'Débit', unit: '%' },
  { key: 'dms_debit_dl_8', display_name: 'DMS DL 8', category: 'Débit', unit: '%' },
  { key: 'dms_debit_dl_3', display_name: 'DMS DL 3', category: 'Débit', unit: '%' },
  { key: 'dms_30_dl_vol5', display_name: 'DMS 30 DL Vol5', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_8_dl_vol5', display_name: 'DMS 8 DL Vol5', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_3_dl_vol5', display_name: 'DMS 3 DL Vol5', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_30_dl_vol10', display_name: 'DMS 30 DL Vol10', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_8_dl_vol10', display_name: 'DMS 8 DL Vol10', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_3_dl_vol10', display_name: 'DMS 3 DL Vol10', category: 'Débit', unit: 'Mbps' },
  { key: 'dms_debit_ul_5', display_name: 'DMS UL 5', category: 'Débit', unit: '%' },
  { key: 'dms_debit_ul_3', display_name: 'DMS UL 3', category: 'Débit', unit: '%' },
  { key: 'dms_debit_ul_1', display_name: 'DMS UL 1', category: 'Débit', unit: '%' },
  { key: 'debit_ul_max', display_name: 'Débit UL Max', category: 'Débit', unit: 'Mbps' },
  { key: 'debit_dl_max', display_name: 'Débit DL Max', category: 'Débit', unit: 'Mbps' },
  // ── Latence ──
  { key: 'rtt_setup_avg', display_name: 'RTT Setup Avg', category: 'Latence', unit: 'ms' },
  { key: 'rtt_data_avg', display_name: 'RTT Data Avg', category: 'Latence', unit: 'ms' },
  { key: 'rtt_setup_0_40000', display_name: 'RTT Setup < 40', category: 'Latence', unit: '%' },
  { key: 'rtt_setup_40000_80000', display_name: 'RTT Setup 40-80', category: 'Latence', unit: '%' },
  { key: 'rtt_setup_80000_150000', display_name: 'RTT Setup 80-150', category: 'Latence', unit: '%' },
  { key: 'rtt_setup_150000_300000', display_name: 'RTT Setup 150-300', category: 'Latence', unit: '%' },
  { key: 'rtt_setup_300000_inf', display_name: 'RTT Setup > 300', category: 'Latence', unit: '%' },
  { key: 'rtt_data_0_40000', display_name: 'RTT Data < 40', category: 'Latence', unit: '%' },
  { key: 'rtt_data_40000_80000', display_name: 'RTT Data 40-80', category: 'Latence', unit: '%' },
  { key: 'rtt_data_80000_150000', display_name: 'RTT Data 80-150', category: 'Latence', unit: '%' },
  { key: 'rtt_data_150000_300000', display_name: 'RTT Data 150-300', category: 'Latence', unit: '%' },
  { key: 'rtt_data_300000_inf', display_name: 'RTT Data > 300', category: 'Latence', unit: '%' },
  // ── TCP Session KPI ──
  { key: 'loss_dl_rate', display_name: 'Loss DL Rate', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_ul_rate', display_name: 'Loss UL Rate', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_ul_0_0.01', display_name: 'Loss UL 0-1%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_ul_0.01_0.03', display_name: 'Loss UL 1-3%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_ul_0.03_0.05', display_name: 'Loss UL 3-5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_ul_0.05_inf', display_name: 'Loss UL > 5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_dl_0_0.01', display_name: 'Loss DL 0-1%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_dl_0.01_0.03', display_name: 'Loss DL 1-3%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_dl_0.03_0.05', display_name: 'Loss DL 3-5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'loss_dl_0.05_inf', display_name: 'Loss DL > 5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'tcp_retr_rate_ul', display_name: 'TCP Retr Rate UL', category: 'TCP Session KPI', unit: '%' },
  { key: 'tcp_retr_rate_dl', display_name: 'TCP Retr Rate DL', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_dl_0_0.01', display_name: 'Retr DL 0-1%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_dl_0.01_0.03', display_name: 'Retr DL 1-3%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_dl_0.03_0.05', display_name: 'Retr DL 3-5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_dl_0.05_inf', display_name: 'Retr DL > 5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_ul_0_0.01', display_name: 'Retr UL 0-1%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_ul_0.01_0.03', display_name: 'Retr UL 1-3%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_ul_0.03_0.05', display_name: 'Retr UL 3-5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'retr_ul_0.05_inf', display_name: 'Retr UL > 5%', category: 'TCP Session KPI', unit: '%' },
  { key: 'session_wifi_nbr', display_name: 'Sessions WiFi', category: 'TCP Session KPI', unit: '' },
  { key: 'session_3g2g_nbr', display_name: 'Sessions 3G/2G', category: 'TCP Session KPI', unit: '' },
  { key: 'session_4g_nbr', display_name: 'Sessions 4G', category: 'TCP Session KPI', unit: '' },
  { key: 'session_5g_nbr', display_name: 'Sessions 5G', category: 'TCP Session KPI', unit: '' },
  { key: 'session_nbr', display_name: 'Sessions Total', category: 'TCP Session KPI', unit: '' },
  { key: 'session_dur_moy', display_name: 'Durée Moy Session', category: 'TCP Session KPI', unit: 's' },
  { key: 'session_dcr', display_name: 'Session DCR', category: 'TCP Session KPI', unit: '%' },
  { key: 'out_of_order_nbr', display_name: 'Out of Order Nbr', category: 'TCP Session KPI', unit: '' },
  { key: 'out_of_order_rate', display_name: 'Out of Order Rate', category: 'TCP Session KPI', unit: '%' },
  { key: 'wind_full_nbr', display_name: 'Window Full Nbr', category: 'TCP Session KPI', unit: '' },
  { key: 'wind_full_rate', display_name: 'Window Full Rate', category: 'TCP Session KPI', unit: '%' },
  // ── Radio Access Tech ──
  { key: 'fallback_5G_to_4G_rate', display_name: 'Fallback 5G→4G Rate', category: 'Radio Access Tech', unit: '%' },
  { key: 'fallback_4G_to_3G2G_rate', display_name: 'Fallback 4G→3G/2G Rate', category: 'Radio Access Tech', unit: '%' },
  { key: 'instability_rate', display_name: 'Instability Rate', category: 'Radio Access Tech', unit: '%' },
  { key: 'time_rat_5g_pct', display_name: 'Time RAT 5G %', category: 'Radio Access Tech', unit: '%' },
  { key: 'time_rat_4g_pct', display_name: 'Time RAT 4G %', category: 'Radio Access Tech', unit: '%' },
  { key: 'time_rat_3g2g_pct', display_name: 'Time RAT 3G/2G %', category: 'Radio Access Tech', unit: '%' },
  { key: 'time_rat_wifi_pct', display_name: 'Time RAT WiFi %', category: 'Radio Access Tech', unit: '%' },
  // ── QOE Index ──
  { key: 'Mauvaise_Session_Rate', display_name: 'Mauvaise Session Rate', category: 'QOE Index', unit: '%' },
  { key: 'Mauvaise_Session_nbr', display_name: 'Mauvaise Session Nbr', category: 'QOE Index', unit: '' },
  { key: 'qoe_index', display_name: 'QoE Index', category: 'QOE Index', unit: '' },
  // ── User Capabilité ──
  { key: '5G_capable_rate', display_name: '5G Capable Rate', category: 'User Capabilité', unit: '%' },
  { key: '5gue_attached_4G_rate', display_name: '5G UE Attached 4G Rate', category: 'User Capabilité', unit: '%' },
];

// Derived flat list for backward compat
export const BI_KPIS = BI_KPI_CATALOG.map(k => k.key) as unknown as readonly string[];

export type BIKPI = string;

export type Aggregation = 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'P50' | 'P95';
export type ChartType = 'line' | 'line_dot' | 'bar' | 'area' | 'scatter' | 'stacked_bar' | 'grouped_bar' | 'heatmap' | 'pie' | 'kpi_card';
export type Granularity = 'hour' | 'day' | 'week' | 'month';
export type AxisSide = 'left' | 'right';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface YMetricConfig {
  kpi: BIKPI;
  aggregation: Aggregation;
  axis: AxisSide;
  chartType: ChartType;
  color: string;
  showMovingAvg: boolean;
  smoothCurve: boolean;
  dimension1?: string; // e.g. 'Site', 'Vendor', 'DOR', etc.
}

export interface XAxisConfig {
  type: 'date' | 'dimension' | 'kpi';
  value: string; // dimension name or kpi name
  dateStart?: string;
  dateEnd?: string;
  granularity?: Granularity;
}

export interface FilterConfig {
  dimension: BIDimension;
  values: string[];
}

export interface ThresholdLine {
  value: number;
  label: string;
  color: string;
  lineStyle: LineStyle;
}

export interface MilestoneLine {
  date: string;
  label: string;
  color: string;
  lineStyle: LineStyle;
}

export interface ChartConfig {
  id: string;
  title: string;
  description?: string;
  xAxis: XAxisConfig;
  yMetrics: YMetricConfig[];
  filters: FilterConfig[];
  groupBy: BIDimension[];
  colorBy?: BIDimension;
  sizeBy?: BIDimension;
  dataSource?: {
    type: 'mock' | 'csv' | 'local';
    csvDatasetId?: string;
    xColumn?: string;
    yColumns?: string[];
  };
  dimension1?: BIDimension;
  dataMode?: 'data' | 'voix';
  advanced: {
    thresholds: ThresholdLine[];
    milestones: MilestoneLine[];
    highlightAnomalies: boolean;
    sortByValue: boolean;
    topN: number | null;
    showLegend: boolean;
    backgroundColor: string;
  };
}

export interface DashboardChart {
  config: ChartConfig;
  layout: { x: number; y: number; w: number; h: number };
}

export interface Dashboard {
  id: string;
  name: string;
  charts: DashboardChart[];
  createdAt: string;
  updatedAt: string;
}

// Chart color palette
export const CHART_COLORS = [
  'hsl(210, 100%, 56%)', 'hsl(160, 84%, 39%)', 'hsl(25, 95%, 53%)',
  'hsl(262, 83%, 58%)', 'hsl(330, 81%, 60%)', 'hsl(187, 92%, 39%)',
  'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(239, 84%, 67%)',
  'hsl(142, 71%, 45%)', 'hsl(45, 93%, 47%)', 'hsl(199, 89%, 48%)'
];

// Auto-derive KPI_UNITS from catalog
export const KPI_UNITS: Record<string, string> = Object.fromEntries(
  BI_KPI_CATALOG.map(k => [k.key, k.unit])
);

/** Look up display name for a KPI key */
export function getKpiDisplayName(key: string): string {
  return BI_KPI_CATALOG.find(k => k.key === key)?.display_name || key;
}

export function createDefaultChart(id: string): ChartConfig {
  // Use last 30 days by default (will be auto-adjusted by ChartConfigPanel if data range is known)
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    id,
    title: 'New Chart',
    xAxis: {
      type: 'date',
      value: 'date',
      dateStart: start.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0],
      granularity: 'day',
    },
    yMetrics: [{
      kpi: 'qoe_index',
      aggregation: 'AVG',
      axis: 'left',
      chartType: 'line',
      color: CHART_COLORS[0],
      showMovingAvg: false,
      smoothCurve: true,
    }],
    filters: [],
    groupBy: [],
    dataSource: { type: 'local' },
    advanced: {
      thresholds: [],
      milestones: [],
      highlightAnomalies: false,
      sortByValue: false,
      topN: null,
      showLegend: true,
      backgroundColor: 'transparent',
    },
  };
}
