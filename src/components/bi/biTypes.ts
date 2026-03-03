import { Layout } from 'react-grid-layout';

// ── Dimensions (match qoe_metric Dimension_1 / Dimension_2 values) ──
export const BI_DIMENSIONS = [
  'RAT', 'AS', 'Application', 'OS', 'Device_brand', 'TAC', 'POP',
  'ORF', 'Vendor', 'Bande', 'ARCEP', 'DOR', 'Plaque', 'Site', 'Cellule',
] as const;

export type BIDimension = typeof BI_DIMENSIONS[number];

// ── KPIs (ALL qoe_metric numeric columns) ──
export const BI_KPIS = [
  // ── Volume ──
  'volume_totale_dl', 'volume_totale_ul', 'volume_totale_totale',
  // ── Débit ──
  'debit_dl', 'debit_ul', 'debit_dl_max', 'debit_ul_max',
  'debit_dl_vol5', 'debit_ul_vol5', 'debit_dl_vol10', 'debit_ul_vol10',
  // ── RTT Moyens ──
  'rtt_setup_avg', 'rtt_data_avg',
  // ── RTT Setup Distribution ──
  'rtt_setup_0_40000', 'rtt_setup_40000_80000', 'rtt_setup_80000_150000',
  'rtt_setup_150000_300000', 'rtt_setup_300000_inf',
  // ── RTT Data Distribution ──
  'rtt_data_0_40000', 'rtt_data_40000_80000', 'rtt_data_80000_150000',
  'rtt_data_150000_300000', 'rtt_data_300000_inf',
  // ── DMS DL ──
  'dms_debit_dl_3', 'dms_debit_dl_8', 'dms_debit_dl_30',
  'dms_3_dl_vol5', 'dms_8_dl_vol5', 'dms_30_dl_vol5',
  'dms_3_dl_vol10', 'dms_8_dl_vol10', 'dms_30_dl_vol10',
  // ── DMS UL ──
  'dms_debit_ul_1', 'dms_debit_ul_3', 'dms_debit_ul_5',
  // ── Loss ──
  'loss_dl_rate', 'loss_ul_rate',
  'loss_dl_0_0.01', 'loss_dl_0.01_0.03', 'loss_dl_0.03_0.05', 'loss_dl_0.05_inf',
  'loss_ul_0_0.01', 'loss_ul_0.01_0.03', 'loss_ul_0.03_0.05', 'loss_ul_0.05_inf',
  // ── TCP Retransmission ──
  'tcp_retr_rate_dl', 'tcp_retr_rate_ul',
  'retr_dl_0_0.01', 'retr_dl_0.01_0.03', 'retr_dl_0.03_0.05', 'retr_dl_0.05_inf',
  'retr_ul_0_0.01', 'retr_ul_0.01_0.03', 'retr_ul_0.03_0.05', 'retr_ul_0.05_inf',
  // ── Sessions ──
  'session_nbr', 'session_dcr', 'session_dur_moy',
  'session_wifi_nbr', 'session_3g2g_nbr', 'session_4g_nbr', 'session_5g_nbr',
  // ── Qualité / Stabilité ──
  'out_of_order_nbr', 'out_of_order_rate',
  'wind_full_nbr', 'wind_full_rate',
  'Mauvaise_Session_nbr', 'Mauvaise_Session_Rate',
  'fallback_5G_to_4G_rate', 'fallback_4G_to_3G2G_rate', 'instability_rate',
  // ── RAT Distribution ──
  'time_rat_5g_pct', 'time_rat_4g_pct', 'time_rat_3g2g_pct', 'time_rat_wifi_pct',
  // ── QoE ──
  'qoe_index',
  '5G_capable_rate', '5gue_attached_4G_rate',
] as const;

export type BIKPI = typeof BI_KPIS[number];

export type Aggregation = 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'P50' | 'P95';
export type ChartType = 'line' | 'bar' | 'area' | 'scatter' | 'stacked_bar' | 'grouped_bar' | 'heatmap' | 'pie' | 'kpi_card';
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
  xAxis: XAxisConfig;
  yMetrics: YMetricConfig[];
  filters: FilterConfig[];
  groupBy: BIDimension[];
  colorBy?: BIDimension;
  sizeBy?: BIKPI;
  dataSource?: {
    type: 'mock' | 'csv' | 'local';
    csvDatasetId?: string;
    xColumn?: string;
    yColumns?: string[];
  };
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

export const KPI_UNITS: Record<string, string> = {
  // Volume
  volume_totale_dl: 'GB', volume_totale_ul: 'GB', volume_totale_totale: 'GB',
  // Débit
  debit_dl: 'Mbps', debit_ul: 'Mbps', debit_dl_max: 'Mbps', debit_ul_max: 'Mbps',
  debit_dl_vol5: 'Mbps', debit_ul_vol5: 'Mbps', debit_dl_vol10: 'Mbps', debit_ul_vol10: 'Mbps',
  // RTT
  rtt_setup_avg: 'ms', rtt_data_avg: 'ms',
  rtt_setup_0_40000: '%', rtt_setup_40000_80000: '%', rtt_setup_80000_150000: '%',
  rtt_setup_150000_300000: '%', rtt_setup_300000_inf: '%',
  rtt_data_0_40000: '%', rtt_data_40000_80000: '%', rtt_data_80000_150000: '%',
  rtt_data_150000_300000: '%', rtt_data_300000_inf: '%',
  // DMS
  dms_debit_dl_3: '%', dms_debit_dl_8: '%', dms_debit_dl_30: '%',
  dms_3_dl_vol5: 'Mbps', dms_8_dl_vol5: 'Mbps', dms_30_dl_vol5: 'Mbps',
  dms_3_dl_vol10: 'Mbps', dms_8_dl_vol10: 'Mbps', dms_30_dl_vol10: 'Mbps',
  dms_debit_ul_1: '%', dms_debit_ul_3: '%', dms_debit_ul_5: '%',
  // Loss
  loss_dl_rate: '%', loss_ul_rate: '%',
  'loss_dl_0_0.01': '%', 'loss_dl_0.01_0.03': '%', 'loss_dl_0.03_0.05': '%', 'loss_dl_0.05_inf': '%',
  'loss_ul_0_0.01': '%', 'loss_ul_0.01_0.03': '%', 'loss_ul_0.03_0.05': '%', 'loss_ul_0.05_inf': '%',
  // TCP Retransmission
  tcp_retr_rate_dl: '%', tcp_retr_rate_ul: '%',
  'retr_dl_0_0.01': '%', 'retr_dl_0.01_0.03': '%', 'retr_dl_0.03_0.05': '%', 'retr_dl_0.05_inf': '%',
  'retr_ul_0_0.01': '%', 'retr_ul_0.01_0.03': '%', 'retr_ul_0.03_0.05': '%', 'retr_ul_0.05_inf': '%',
  // Sessions
  session_nbr: '', session_dcr: '%', session_dur_moy: 's',
  session_wifi_nbr: '', session_3g2g_nbr: '', session_4g_nbr: '', session_5g_nbr: '',
  // Qualité
  out_of_order_nbr: '', out_of_order_rate: '%',
  wind_full_nbr: '', wind_full_rate: '%',
  Mauvaise_Session_nbr: '', Mauvaise_Session_Rate: '%',
  fallback_5G_to_4G_rate: '%', fallback_4G_to_3G2G_rate: '%', instability_rate: '%',
  // RAT
  time_rat_5g_pct: '%', time_rat_4g_pct: '%', time_rat_3g2g_pct: '%', time_rat_wifi_pct: '%',
  // QoE
  qoe_index: '',
  '5G_capable_rate': '%', '5gue_attached_4G_rate': '%',
};

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
