export type Dimension = 'Cell' | 'Site' | 'DOR' | 'DR' | 'Plaque' | 'Zone ARCEP';
export type Granularity = 'Hourly' | 'Daily' | 'Weekly';
export type GraphTab = 'TimeSeries' | 'Histogram' | 'Breakdown';
export type SplitOption = 'None' | 'Vendor' | 'Technology' | 'Band' | 'DOR' | 'DR';

export type ChartType = 'line' | 'area' | 'bar' | 'scatter';

export interface GraphConfig {
  chartType: ChartType;
  smooth: boolean;
  lineWidth: number;
  showSymbols: boolean;
  showThresholds: boolean;
  showGrid: boolean;
  showArea: boolean;
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  chartType: 'line',
  smooth: true,
  lineWidth: 2.5,
  showSymbols: false,
  showThresholds: true,
  showGrid: true,
  showArea: true,
};

export interface GraphSlot {
  id: string;
  kpiIds: string[];
  /** @deprecated use kpiIds */
  kpiId?: string;
  name: string;
  config?: GraphConfig;
  filters: Record<string, string[]>;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  splitBy: SplitOption;
}

export interface Jalon {
  id: string;
  date: string;
  label: string;
  color: string;
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
  sortBy: string;
  graphLayout: 1 | 2 | 4;
  activeGraphTab: GraphTab;
  jalons: Jalon[];
}

export interface DataPoint {
  timestamp: string;
  kpi: string;
  value: number;
  splitValue?: string;
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
}

export interface KpiDefinition {
  id: string;
  label: string;
  unit: string;
  category: string;
  color: string;
  thresholds: { warning: number; critical: number };
  higherIsBetter: boolean;
}
