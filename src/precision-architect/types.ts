export type ViewMode = 'view' | 'edit' | 'presentation';

export type WidgetKind = 'chart' | 'map' | 'kpi' | 'table' | 'text' | 'image' | 'hero' | 'stat' | 'divider';

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

/** Configuration for the new manually-edited "premium" widgets. */
export type HeroAlign = 'left' | 'center' | 'right';
export type HeroSize = 'sm' | 'md' | 'lg' | 'xl';
export type StatTheme = 'dark' | 'light' | 'glass';

export interface HeroWidgetConfig {
  title: string;
  subtitle: string;
  align: HeroAlign;
  size: HeroSize;
  /** Hex color for the title text. Empty = inherit. */
  titleColor?: string;
  /** Hex color for the subtitle text. Empty = inherit. */
  subtitleColor?: string;
  /** Optional eyebrow label above the title (small uppercase). */
  eyebrow?: string;
}

export interface StatWidgetConfig {
  label: string;
  value: string;
  unit: string;
  /** Optional accent color (hex). Empty = primary token. */
  accentColor?: string;
  theme: StatTheme;
  /** Pulse dot in the top-right (e.g. live indicator). */
  showPulse: boolean;
}

export interface DividerWidgetConfig {
  label?: string;
  /** Style of the divider line. */
  style: 'solid' | 'dashed' | 'dotted' | 'gradient';
  /** Hex color. Empty = primary token. */
  color?: string;
  thickness: number;
  align: HeroAlign;
}

export const DEFAULT_HERO_CONFIG: HeroWidgetConfig = {
  title: 'Global Throughput',
  subtitle: 'Real-time aggregate data flow across all nodes, monitored with millisecond precision.',
  align: 'left',
  size: 'lg',
  eyebrow: '',
};

export const DEFAULT_STAT_CONFIG: StatWidgetConfig = {
  label: 'Peak Rate',
  value: '1.42',
  unit: 'Tb/s',
  theme: 'dark',
  showPulse: false,
};

export const DEFAULT_DIVIDER_CONFIG: DividerWidgetConfig = {
  label: '',
  style: 'gradient',
  thickness: 1,
  align: 'center',
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
  /** Hero widget settings. */
  heroConfig?: HeroWidgetConfig;
  /** Stat card widget settings. */
  statConfig?: StatWidgetConfig;
  /** Divider widget settings. */
  dividerConfig?: DividerWidgetConfig;
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

/** Dashboard-level theme applied to the canvas background and widget accents. */
export interface DashboardTheme {
  /** Background style for the dashboard canvas. */
  background: 'light' | 'dark' | 'gradient';
  /** Accent color (hex) used by Hero/Stat widgets when no explicit color is set. */
  accentColor: string;
  /** Page-level title shown above the grid. */
  pageTitle: string;
  /** Page-level subtitle shown under the title. */
  pageSubtitle: string;
  /** Show or hide the page title block. */
  showPageHeader: boolean;
  /** Optional explicit hex for the canvas background. Overrides `background` preset. */
  backgroundColor?: string;
  /** Hex color for body text. */
  textColor?: string;
  /** Hex color for cards/widget surfaces. */
  cardColor?: string;
  /** Hex color for the page title. */
  titleColor?: string;
  /** Page width mode: fixed (max-w-7xl) or full. */
  pageWidth?: 'fixed' | 'full';
  /** Page padding in pixels. */
  pagePadding?: number;
  /** Spacing between grid widgets in pixels. */
  spacing?: number;
  /** Border radius for cards in pixels. */
  borderRadius?: number;
  /** Header alignment for the page title block. */
  headerAlign?: 'left' | 'center' | 'right';
  /** Operator name shown in the page header. */
  operatorName?: string;
  /** Optional logo URL shown in the page header. */
  logoUrl?: string;
  /** Show the operator/logo header block. */
  showLogo?: boolean;
  /** Show the report date in the page header. */
  showDate?: boolean;
}

export const DEFAULT_DASHBOARD_THEME: DashboardTheme = {
  background: 'light',
  accentColor: '#00685f',
  pageTitle: '',
  pageSubtitle: '',
  showPageHeader: false,
  pageWidth: 'fixed',
  pagePadding: 32,
  spacing: 16,
  borderRadius: 16,
  headerAlign: 'left',
  showLogo: true,
  showDate: true,
};

export interface PAPage {
  id: string;
  name: string;
  widgets: DynWidget[];
  sections: PASection[];
  /** Optional theme override per page. Falls back to DEFAULT_DASHBOARD_THEME. */
  theme?: DashboardTheme;
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
