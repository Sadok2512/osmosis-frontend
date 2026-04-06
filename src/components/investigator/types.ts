export type Dimension = 'Cell' | 'Site' | 'DOR' | 'DR' | 'Plaque' | 'Zone ARCEP';
export type Granularity = '15min' | '1h' | '1d' | '1w';

export function normalizeGranularity(g: string): Granularity {
  switch (g) {
    case '15min': case '15MIN': return '15min';
    case '1h': case 'Hourly': case 'hourly': case '1H': return '1h';
    case '1w': case 'Weekly': case 'weekly': case '1W': return '1w';
    case '1d': case 'Daily': case 'daily': default: return '1d';
  }
}
export type GraphTab = 'TimeSeries' | 'Histogram' | 'Breakdown' | 'Neighbors';
export type SplitOption = string;  // Dynamic from backend: 'None' | 'SITE' | 'CELL' | 'DOR' | 'PLAQUE' | 'VENDOR' | 'TECHNO' | 'BAND' | 'ZONE_ARCEP' | ...
export type KpiLevel = 'CELL' | 'PROFILE' | 'NEIGHBOR';

export type ChartType = 'line' | 'line_straight' | 'line_points' | 'area' | 'bar' | 'stacked_bar' | 'scatter';
export type WidgetType = 'timeseries' | 'histogram' | 'kpi_card' | 'neighbors';

export interface YAxisConfig {
  mode: 'auto' | 'manual';
  min?: number;
  max?: number;
}

export interface GraphConfig {
  chartType: ChartType;
  smooth: boolean;
  lineWidth: number;
  showSymbols: boolean;
  showThresholds: boolean;
  showGrid: boolean;
  showArea: boolean;
  showDataTable: boolean;
  showBreakdown: boolean;
  yAxis?: YAxisConfig;
  yAxisRight?: YAxisConfig;
  /** Maps kpiId → 0 (left) or 1 (right). Default is 0. */
  yAxisAssignments?: Record<string, number>;
  /** Maps kpiId → split dimension (e.g. 'BAND'). Missing or 'None' means no split. */
  splitByPerKpi?: Record<string, string>;
  /** Maps kpiId → second split dimension for cross-tabulation. */
  splitByPerKpi2?: Record<string, string>;
  /** Maps kpiId → chart type override. Missing means use slot-level chartType. */
  chartTypePerKpi?: Record<string, ChartType>;
  /** Persisted dataZoom window for the slot chart. */
  zoomWindow?: {
    start?: number;
    end?: number;
  };
  /** Temporary UI state for settings popover. */
  __activeYTab?: 'L' | 'R';
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  chartType: 'line',
  smooth: true,
  lineWidth: 2.5,
  showSymbols: true,
  showThresholds: true,
  showGrid: true,
  showArea: false,
  showDataTable: false,
  showBreakdown: false,
};

export interface GraphSlot {
  id: string;
  kpiIds: string[];
  /** PM counter IDs to overlay on the same timeseries chart */
  counterIds?: string[];
  /** @deprecated use kpiIds */
  kpiId?: string;
  name: string;
  widgetType?: WidgetType;
  config?: GraphConfig;
  filters: Record<string, string[]>;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  splitBy: SplitOption;
  splitBy2?: SplitOption;
}

export type JalonVisibility = 'all' | 'personal' | 'team';

export interface Jalon {
  id: string;
  date: string;
  endDate?: string;
  label: string;
  color: string;
  opacity?: number;
  visibility?: JalonVisibility;
}

export interface InvestigationState {
  dimension: Dimension;
  selectedKpis: string[];
  graphSlots: GraphSlot[];
  splitBy: SplitOption;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  filters: Record<string, string[]>;
  topLimit: number;
  sortBy: string | null;
  graphLayout: 1 | 2 | 4;
  activeGraphTab: GraphTab;
  jalons: Jalon[];
  // Profile & Neighbor dimension filters
  kpiLevel: KpiLevel;
  profileQci?: number | null;
  profileArp?: number | null;
  neighborType?: string | null;  // 'X2' | 'HO_LTE' | 'HO_UTRAN'
}

export interface DataPoint {
  timestamp: string;
  kpi: string;
  value: number;
  splitValue?: string;
}

export interface CellAlarms {
  total: number;
  critical: number;
  major: number;
  minor: number;
  warning: number;
}

export interface AlarmDetail {
  severity: string;
  text: string;
  time: string | null;
}

export interface WorstElement {
  id: string;
  name: string;
  dimension: string;
  kpiValues: Record<string, number>;
  trend: 'up' | 'down' | 'stable';
  severity: 'critical' | 'warning' | 'ok';
  region?: string;
  vendor?: string;
  technology?: string;
  dor?: string;
  plaque?: string;
  band?: string;
  techno?: string;
  site_name?: string;
  alarms?: CellAlarms;
  latest_alarms?: AlarmDetail[];
}

export interface KpiDefinition {
  id: string;
  label: string;
  unit: string;
  category: string;
  color: string;
  thresholds: { warning: number; critical: number };
  higherIsBetter: boolean;
  dimension_type?: string | null;
  dimension_prefix?: string | null;
  counter_count?: number;
}
