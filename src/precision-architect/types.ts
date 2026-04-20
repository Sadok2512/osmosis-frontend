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
  /** Per-metric graph type override (line/area/bar). Falls back to global style.chartType when undefined. */
  graphType?: ChartType;
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

/**
 * Configuration for a Table widget. Mirrors the chart's data section so
 * widgets can share the global toolbar (Périmètre / Date / Filters / Grain)
 * and follow the same Apply-only execution rule.
 */
export interface TableColumn {
  id: string;
  /** KPI key (matches kpi_catalog.kpi_key). */
  kpiKey: string;
  alias?: string;
  unit?: string;
  visible: boolean;
}

export interface TableWidgetConfig {
  data: {
    inheritFromDashboard: boolean;
    technos: TechnoId[];
    filters: ChartFilterChip[];
    timeRange: {
      inherit: boolean;
      preset: PeriodPreset;
      from: string;
      to: string;
    };
    granularity: GrainOption;
  };
  columns: TableColumn[];
  /** Dimension to split rows by (e.g. CELL, SITE, PLAQUE). null = aggregate. */
  splitBy: string | null;
  /** Cap rows returned. */
  topN: number;
  /** Sort: column id (or 'split_value') + direction. */
  sortBy?: { columnId: string; direction: 'asc' | 'desc' };
}

export const DEFAULT_TABLE_CONFIG: TableWidgetConfig = {
  data: {
    inheritFromDashboard: true,
    technos: ['2g', '3g', '4g', '5g'],
    filters: [],
    timeRange: {
      inherit: true,
      preset: '3j',
      from: '2026-04-13T00:00',
      to: '2026-04-15T00:00',
    },
    granularity: '15min',
  },
  columns: [],
  splitBy: 'CELL',
  topN: 50,
};

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
  /** Last chart configuration explicitly applied by the user. Used to keep chart data stable across mode switches. */
  appliedConfig?: ChartWidgetConfig;
  /** Table-specific settings (used by `table` widget). */
  tableConfig?: TableWidgetConfig;
  /** Last table configuration explicitly applied by the user. */
  appliedTableConfig?: TableWidgetConfig;
  /** Bumped each time the user clicks "Apply" in the settings panel. Charts can watch this to refetch. */
  appliedRev?: number;
  layout: WidgetLayout;
}

export const DEFAULT_CHART_CONFIG: ChartWidgetConfig = {
  data: {
    inheritFromDashboard: true,
    technos: ['2g', '3g', '4g', '5g'],
    filters: [],
    timeRange: {
      inherit: true,
      preset: '3j',
      from: '2026-04-13T00:00',
      to: '2026-04-15T00:00',
    },
    granularity: '15min',
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
