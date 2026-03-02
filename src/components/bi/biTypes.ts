import { Layout } from 'react-grid-layout';

// ── Dimensions ──
export const BI_DIMENSIONS = [
  'ORF_NETWORK', 'Vendor', 'DOR', 'Plaque', 'Site', 'Cellule', 'bande',
  '5G_capability', 'device_brand', 'os', 'client', 'RAT', 'ARCEP',
  'Application', 'Service_Provider', 'POP'
] as const;

export type BIDimension = typeof BI_DIMENSIONS[number];

// ── KPIs ──
export const BI_KPIS = [
  'volume_totale', 'debit_dl', 'debit_ul', 'dl_ul_ratio',
  'debit_dl_max', 'debit_ul_max', 'rtt_setup_avg', 'rtt_data_avg',
  'loss_dl_rate', 'loss_ul_rate',
  'tcp_retr_rate_1', 'tcp_retr_rate_3', 'tcp_retr_rate_5', 'tcp_retr_rate_10',
  'dms_dl_3', 'dms_dl_8', 'dms_dl_30', 'dms_ul_1', 'dms_ul_3', 'dms_ul_5',
  'session_nbr', 'session_dcr', 'fallback_5G_to_4G_rate', 'instability_rate',
  'time_rat_5g_%', 'bad_session_rate', 'qoe_index'
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
    type: 'mock' | 'csv';
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
  volume_totale: 'GB', debit_dl: 'Mbps', debit_ul: 'Mbps',
  dl_ul_ratio: '%', debit_dl_max: 'Mbps', debit_ul_max: 'Mbps',
  rtt_setup_avg: 'ms', rtt_data_avg: 'ms',
  loss_dl_rate: '%', loss_ul_rate: '%',
  tcp_retr_rate_1: '%', tcp_retr_rate_3: '%', tcp_retr_rate_5: '%', tcp_retr_rate_10: '%',
  dms_dl_3: '%', dms_dl_8: '%', dms_dl_30: '%',
  dms_ul_1: '%', dms_ul_3: '%', dms_ul_5: '%',
  session_nbr: '', session_dcr: '%',
  fallback_5G_to_4G_rate: '%', instability_rate: '%',
  'time_rat_5g_%': '%', bad_session_rate: '%', qoe_index: ''
};

// Dimensions the user can pick for groupBy (ORF is always locked)
export const USER_GROUPBY_DIMENSIONS: BIDimension[] = ['DOR', 'Plaque', 'Site', 'Cellule'];

// Fixed filter that cannot be removed
export const LOCKED_FILTERS: FilterConfig[] = [
  { dimension: 'Vendor', values: ['Nokia'] },
];

// Fixed groupBy dimension that cannot be removed
export const LOCKED_GROUPBY: BIDimension = 'ORF_NETWORK';

export function createDefaultChart(id: string): ChartConfig {
  return {
    id,
    title: 'New Chart',
    xAxis: {
      type: 'date',
      value: 'date',
      dateStart: '2026-02-01',
      dateEnd: '2026-02-15',
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
    filters: [...LOCKED_FILTERS],
    groupBy: [LOCKED_GROUPBY],
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
