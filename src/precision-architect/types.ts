export type ViewMode = 'view' | 'edit' | 'presentation';

export type WidgetKind = 'chart' | 'map' | 'kpi' | 'table' | 'text' | 'image';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ChartGranularity = 'auto' | '5min' | '15min' | '1h' | '1d';
export type ChartType = 'line' | 'area' | 'bar';
export type LineStyle = 'solid' | 'dashed';
export type AxisSide = 'left' | 'right';
export type LegendPosition = 'top' | 'bottom' | 'right';
export type FillStyle = 'none' | 'gradient' | 'solid';
export type BackgroundStyle = 'transparent' | 'light' | 'dark';

export interface ChartMetric {
  id: string;
  kpiKey: string;
  alias?: string;
  unit?: string;
  axis: AxisSide;
  color: string;
  lineStyle: LineStyle;
  visible: boolean;
}

export interface ChartThreshold {
  id: string;
  label: string;
  value: number;
  axis: AxisSide;
  color: string;
  lineStyle: LineStyle;
}

export interface ChartJalon {
  id: string;
  label: string;
  /** ISO date or display label for the X position */
  date: string;
  color: string;
}

export type TechnoId = '2g' | '3g' | '4g' | '5g';
export type PeriodPreset = '1j' | '3j' | '7j' | '14j' | '30j' | 'custom';
export type GrainOption = '5min' | '15min' | '30min' | '1h' | '1d';

export interface ChartFilterChip {
  id: string;
  dimension: string;
  value: string;
}

export interface ChartWidgetConfig {
  data: {
    inheritFromDashboard: boolean;
    /** Selected technologies (Périmètre). */
    technos: TechnoId[];
    /** Custom dimension filter chips. */
    filters: ChartFilterChip[];
    timeRange: {
      inherit: boolean;
      preset: PeriodPreset;
      from: string; // ISO YYYY-MM-DDTHH:mm
      to: string;
    };
    granularity: GrainOption;
  };
  metrics: ChartMetric[];
  style: {
    chartType: ChartType;
    lineThickness: number;
    smooth: boolean;
    fill: FillStyle;
    opacity: number;
    background: BackgroundStyle;
    grid: boolean;
    legend: { position: LegendPosition; showValues: boolean };
  };
  jalons?: ChartJalon[];
  thresholds?: ChartThreshold[];
}

export interface DynWidget {
  id: string;
  kind: WidgetKind;
  title?: string;
  /** Free-form rich text body (used by `text` widget). */
  body?: string;
  /** Image source URL (used by `image` widget). */
  imageUrl?: string;
  /** Optional caption for `image` widget. */
  caption?: string;
  /** Chart-specific settings (used by `chart` widget). */
  config?: ChartWidgetConfig;
  layout: WidgetLayout;
}

export const DEFAULT_CHART_CONFIG: ChartWidgetConfig = {
  data: {
    inheritFromDashboard: true,
    filters: {},
    timeRange: { inherit: true, preset: '24h' },
    granularity: 'auto',
  },
  metrics: [],
  style: {
    chartType: 'line',
    lineThickness: 2,
    smooth: true,
    fill: 'gradient',
    opacity: 60,
    background: 'transparent',
    grid: true,
    legend: { position: 'bottom', showValues: false },
  },
  jalons: [],
  thresholds: [],
};

export interface PASection {
  id: string;
  name: string;
  title: string;
  description: string;
}

export interface PAPage {
  id: string;
  name: string;
  widgets: DynWidget[];
  sections: PASection[];
}

export interface KPI {
  label: string;
  value: string;
  unit?: string;
  trend?: string;
  status: 'optimal' | 'warning' | 'critical';
  color: string;
}

export interface NodeData {
  id: string;
  load: number;
  throughput: string;
  health: 'optimal' | 'warning' | 'critical';
}

export interface MetricPoint {
  time: string;
  value: number;
  secondary?: number;
}
