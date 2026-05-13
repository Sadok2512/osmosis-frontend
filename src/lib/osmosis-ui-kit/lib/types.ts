// OSMOSIS Agent Response Schema — TypeScript types
// Mirrors the JSON schema in prompts/generic-agent-prompt.md

export type AgentName =
  // Path A canonical agents
  | "OSMOSIS"
  | "RCAI"
  | "OPTIMUS"
  | "AEGIS"
  | "EXA"
  | "ECHO"
  // Legacy aliases (kept so old payloads still type-check)
  | "PULSE"
  | "TRACE"
  | "SENTINEL"
  | "TOPO"
  | "PARMY"
  | "ANALYTIC";

export type StatusType = "success" | "warning" | "danger" | "info" | "neutral";

export type Severity = "warning" | "danger" | "critical";

export type TrendDirection = "up" | "down" | "stable" | null;

export type VizType =
  | "stacked_bar"
  | "grouped_bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scatter"
  | "heatmap"
  | "treemap"
  | "sankey"
  | "map"
  | "radar"
  | "gauge";

export type ColumnType =
  | "text"
  | "number"
  | "link"
  | "progress_bar"
  | "badge"
  | "tag"
  | "html"
  | "sparkline"
  | "date";

export interface QueryMeta {
  duration_ms: number;
  source: string;
  confidence: number;
  version?: string;
  timestamp?: string;
}

export interface Highlight {
  label: string;
  type: StatusType;
}

export interface TLDR {
  headline: string;
  highlights: Highlight[];
}

export interface KPI {
  label: string;
  value: string | number;
  context?: string;
  ratio?: number;
  trend?: TrendDirection;
  trend_value?: string;
  sparkline?: number[] | null;
  status: StatusType;
}

export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

export interface Visualization {
  type: VizType;
  title: string;
  subtitle?: string;
  unit_toggle?: ("percent" | "absolute")[];
  x_axis: { label: string; data: string[] };
  y_axis: { label: string; unit: string };
  series: ChartSeries[];
  highlights?: string[];
}

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
}

export interface TableData {
  title: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  features?: ("sort" | "filter" | "search" | "paginate" | "export" | "row_select")[];
  default_sort?: { column: string; direction: "asc" | "desc" };
  page_size?: number;
}

export interface Anomaly {
  severity: Severity;
  entity: string;
  description: string;
  metric?: string;
  suggested_action?: string;
  drill_down_prompt?: string;
}

export interface Insight {
  // Legacy free-text insight (kept for backward compat).
  icon?: string;
  text?: string;
  metric?: string;
  category?: "trend" | "distribution" | "correlation" | "outlier";
  // Structured insight (preferred for top-N/rankings/findings).
  // When present, the kit renders items as a coloured ranking with
  // clickable drill-down chips.
  title?: string;
  subtitle?: string;
  items?: InsightItem[];
  summary?: { label: string; value: string; drill_down_prompt?: string };
}

export interface InsightItem {
  rank?: number;
  entity: string;
  metric?: { name: string; value: number | string; unit?: string };
  severity?: StatusType;
  delta_vs_baseline?: number | string;
  drill_down_prompt?: string;
}

export interface FollowUp {
  label: string;
  prompt: string;
  icon?: string;
}

export interface AgentResponse {
  agent: AgentName;
  query_meta: QueryMeta;
  tldr: TLDR;
  kpis: KPI[];
  visualizations?: Visualization[];
  table?: TableData;
  anomalies?: Anomaly[];
  insights?: Insight[];
  follow_ups?: FollowUp[];
  exports?: ("csv" | "pdf" | "json" | "xlsx")[];
}
