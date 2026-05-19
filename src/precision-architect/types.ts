export type ViewMode = 'view' | 'edit' | 'presentation';

export type WidgetKind = 'chart' | 'map' | 'kpi' | 'table' | 'text' | 'image' | 'hero' | 'stat' | 'divider';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ChartGranularity = 'auto' | '5min' | '15min' | '1h' | '1d';
export type ChartType = 'line' | 'area' | 'bar' | 'stackedBar' | 'stackedArea' | 'stepLine';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
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
  /** Per-metric line thickness in px (1-4). Defaults to 2. */
  lineWidth?: number;
  /** Per-metric smoothing for line/area series. */
  smooth?: boolean;
  /** Whether to fill the area under the line. */
  fillArea?: boolean;
  /** Per-metric split dimension (CELL, SITE, PLAQUE, BANDE, …). null/undefined = aggregate (single series). */
  splitBy?: string | null;
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
  /** ISO date or display label for the X position (start). */
  date: string;
  /** Optional end date for range-style jalons (rendered as markArea). */
  endDate?: string;
  color: string;
  /** 0..1 — controls fill/line opacity. Defaults to 0.8. */
  opacity?: number;
}

export type TechnoId = '2g' | '3g' | '4g' | '5g';
export type PeriodPreset = '1j' | '3j' | '7j' | '14j' | '30j' | 'custom';
export type GrainOption = '5min' | '15min' | '30min' | '1h' | '1d';

export type AdvancedTimeFrameMode = 'NONE' | 'BUSY_HOURS' | 'CUSTOM_HOURS';

export interface AdvancedTimeFrameConfig {
  id?: string;
  profileName?: string;
  mode: AdvancedTimeFrameMode;
  startHour?: string;
  endHour?: string;
  excludeWeekends?: boolean;
}

export interface AdvancedTimeFrameProfile extends AdvancedTimeFrameConfig {
  id: string;
  profileName: string;
}

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
    /** When true, bar/area series are stacked (total contribution view). Lines stay unstacked. */
    stacked?: boolean;
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
  /** Column source. Older saved widgets may omit this; UI infers counters by key when needed. */
  source?: 'kpi' | 'counter';
  /** KPI key (matches kpi_catalog.kpi_key). */
  kpiKey: string;
  alias?: string;
  unit?: string;
  visible: boolean;
  /** Per-KPI split dimension (CELL, SITE, PLAQUE, …). null/undefined = aggregate. */
  splitBy?: string | null;
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
    granularity: '1d',
  },
  columns: [],
  // Aggregate by default — one row per KPI. The user can opt into a row split
  // (CELL, SITE, PLAQUE, …) from the table settings panel.
  splitBy: null,
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

export interface StatKpiItem {
  /** KPI key from catalog. */
  kpiKey: string;
  /** Display label override (defaults to KPI display_name). */
  label?: string;
  /** Unit override (defaults to KPI unit). */
  unit?: string;
  /** Optional per-item accent (hex). Empty = inherits widget accent. */
  accentColor?: string;
}

export interface StatWidgetConfig {
  label: string;
  value: string;
  unit: string;
  /** Legacy single-KPI key. Kept for backward compatibility; new widgets use `kpis`. */
  kpiKey?: string;
  /** Multi-KPI list. When length > 1, the card renders a responsive grid. */
  kpis?: StatKpiItem[];
  /** Backend-defined reusable reference period used for period-based KPI aggregation. */
  referencePeriodId?: string;
  /** Aggregation function: avg, sum, min, max, last */
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'last';
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
  label: '',
  value: '',
  unit: '',
  referencePeriodId: 'last_7_days',
  theme: 'dark',
  showPulse: false,
};

export type ReferencePeriodRule =
  | { type: 'relative'; value: number; unit: 'hours' | 'days' | 'weeks' | 'months'; end: 'now' }
  | { type: 'month_to_date' }
  | { type: 'previous_month' }
  | { type: 'quarter_to_date' }
  | { type: 'custom'; from: string; to: string };

export type CompareMode = 'overlay' | 'delta' | 'trend' | 'baseline';

export interface ReferencePeriod {
  id: string;
  name: string;
  rule: ReferencePeriodRule;
  description?: string;
  order?: number;
  isDefault?: boolean;
  enabled?: boolean;
  color?: string;
  createdBy?: string;
  /** Derived backend-side: 'global' | 'user'. */
  scope?: 'global' | 'user';
  /** Derived: rule.type. Backend mirrors this in the response for convenience. */
  type?: string;
  /** How this reference should be compared with the current data. */
  compareMode?: CompareMode;
}

export const DEFAULT_DIVIDER_CONFIG: DividerWidgetConfig = {
  label: '',
  style: 'gradient',
  thickness: 1,
  align: 'center',
};

/** ───── Map Widget Configuration ───── */
export type MapDisplayMode = 'sites' | 'cells';
export type MapTheme = 'light' | 'dark' | 'transparent';
export type MapType = 'street' | 'satellite';

export interface MapFilterChip {
  id: string;
  /** Dimension key: VENDOR, DOR, PLAQUE, BANDE, TECHNO, SITE, CELL */
  dimension: string;
  values: string[];
}

export interface MapWidgetConfig {
  /** Inherit perimeter/filters from the dashboard global toolbar. */
  inheritFromDashboard: boolean;
  /** Per-widget filter chips (when not inheriting, or stacked on top). */
  filters: MapFilterChip[];
  /** What to render on the map. */
  displayMode: MapDisplayMode;
  /** Map appearance. */
  theme: MapTheme;
  mapType: MapType;
  /** Layer toggles. */
  showLines: boolean;
  showSectors: boolean;
  showLabels: boolean;
  /** Optional KPI overlay + legend. */
  kpiOverlay: boolean;
  showLegend: boolean;
  /** Heatmap visual mode. */
  heatmap: boolean;
  /** Default site marker color (hex). Empty = use theme accent. */
  defaultColor?: string;
  /** KPI threshold for warning status (QoE score below this = warning). */
  warningThreshold?: number;
  /** KPI threshold for critical status (QoE score below this = critical). */
  criticalThreshold?: number;
  /** Color used for "optimal" markers when KPI overlay is on. */
  optimalColor?: string;
  /** Color used for "warning" markers when KPI overlay is on. */
  warningColor?: string;
  /** Color used for "critical" markers when KPI overlay is on. */
  criticalColor?: string;
  /** KPI key driving the per-site intensity / color. Empty = legacy mock score. */
  kpiKey?: string;
  /** Display name of the selected KPI (cached for the legend label). */
  kpiDisplayName?: string;
  /** Unit of the selected KPI (cached for the legend label). */
  kpiUnit?: string;
}

export const DEFAULT_MAP_CONFIG: MapWidgetConfig = {
  inheritFromDashboard: true,
  filters: [],
  displayMode: 'sites',
  theme: 'light',
  mapType: 'street',
  showLines: true,
  showSectors: false,
  showLabels: true,
  kpiOverlay: true,
  showLegend: true,
  heatmap: false,
  warningThreshold: 80,
  criticalThreshold: 60,
  optimalColor: '#10b981',
  warningColor: '#f59e0b',
  criticalColor: '#ef4444',
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
  /** Map widget settings. */
  mapConfig?: MapWidgetConfig;
  /** Last map configuration explicitly applied by the user. */
  appliedMapConfig?: MapWidgetConfig;
  /** Bumped each time the user clicks "Apply" in the settings panel. Charts can watch this to refetch. */
  appliedRev?: number;
  /** When true, the widget card renders with a transparent background (no card surface). */
  transparentBg?: boolean;
  /** Optional section this widget belongs to. Undefined = unassigned (renders in the top grid). */
  sectionId?: string;
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
    granularity: '1d',
  },
  metrics: [],
  style: {
    chartType: 'line',
    stacked: false,
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

export type PASectionTextStyle = 'heading' | 'subheading' | 'body' | 'quote' | 'callout';
export type PASectionFontFamily = 'sans' | 'serif' | 'mono' | 'display';
export type PASectionAlign = 'left' | 'center' | 'right';

export interface PASection {
  id: string;
  name: string;
  title: string;
  description: string;
  /** Visual style preset for the section block. */
  textStyle?: PASectionTextStyle;
  /** Font family for the title + description. */
  fontFamily?: PASectionFontFamily;
  /** Title font size in pixels. */
  titleSize?: number;
  /** Description font size in pixels. */
  descriptionSize?: number;
  /** Hex color for the title. Empty = inherit. */
  titleColor?: string;
  /** Hex color for the description. Empty = inherit. */
  descriptionColor?: string;
  /** Hex color for the section background. Empty = default surface. */
  backgroundColor?: string;
  /** Text alignment inside the section. */
  align?: PASectionAlign;
  /** Bold title. */
  bold?: boolean;
  /** Italic description. */
  italic?: boolean;
  /** Underline description. */
  underline?: boolean;
  /** Description list style. */
  listStyle?: 'none' | 'bullet' | 'numbered';
  /** Inner padding (px). */
  padding?: number;
  /** Border radius (px). */
  radius?: number;
  /** Border width (px). */
  borderWidth?: number;
  /** Border color (hex). */
  borderColor?: string;
  /** Drop shadow intensity. */
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  /** Make the section span full width (ignores page max width). */
  fullWidth?: boolean;
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
  /** Show the report name (title) in the page header (left side). */
  showReportName?: boolean;
  /** Show a photo/illustration in the page header. */
  showPhoto?: boolean;
  /** Data URL or remote URL of the header photo. */
  photoUrl?: string;
  /** Header photo position relative to the title block. */
  photoPosition?: 'left' | 'right' | 'top' | 'full';
  /** Header photo width in pixels (height is auto, max-height is capped). */
  photoSize?: number;
  /** Fine-tuned horizontal offset applied to the photo. */
  photoOffsetX?: number;
  /** Fine-tuned vertical offset applied to the photo. */
  photoOffsetY?: number;
  /** Report Info block displayed on the right side of the report header. */
  reportInfo?: {
    show: boolean;
    perimeter: boolean;
    date: boolean;
    granularity: boolean;
    filters: boolean;
  };
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
  showReportName: true,
  showPhoto: false,
  photoUrl: '',
  photoPosition: 'left',
  photoSize: 128,
  photoOffsetX: 0,
  photoOffsetY: 0,
  reportInfo: {
    show: true,
    perimeter: true,
    date: true,
    granularity: true,
    filters: true,
  },
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
