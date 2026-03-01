// ── KPI Monitor Types ──────────────────────────────────────────────

export type TechnoScope = '4G' | '5G' | 'both';
export type ValueType = 'ratio' | 'counter' | 'gauge';
export type AggFunc = 'avg' | 'sum' | 'max' | 'min' | 'p95' | 'p50' | 'last';
export type Granularity = '15m' | '1h' | '1d';
export type AxisSide = 'left' | 'right';
export type SplitDimension = 'DR' | 'DOR' | 'ZONE_ARCEP' | 'BAND' | 'PLAQUE' | 'SITE' | 'CELL' | 'VENDOR' | 'TECHNO';
export type FilterOp = 'IN' | 'NOT_IN' | 'EQ';
export type KpiMonitorView = 'graph' | 'table' | 'map';

export interface KpiCatalogEntry {
  kpi_id: string;
  kpi_key: string;
  display_name: string;
  description: string;
  techno_scope: TechnoScope;
  unit: string;
  value_type: ValueType;
  default_agg: AggFunc;
  allowed_aggs: AggFunc[];
  numerator_counter?: string;
  denominator_counter?: string;
  formula_sql?: string;
  is_map_supported: boolean;
  thresholds?: { warning: number; critical: number };
  category: 'Access' | 'Throughput' | 'Latency' | 'Retainability' | 'Traffic' | 'TCP' | 'Other';
  color: string;
}

export type GraphType = 'line' | 'area' | 'bar' | 'stacked_area' | 'scatter';

export interface KpiSelection {
  kpi_key: string;
  agg: AggFunc;
  axis: AxisSide;
  color?: string;
  graphType?: GraphType;
  splitOverride?: SplitDimension | null;
  yAxisIndex?: number;
}

export interface DynamicFilter {
  id: string;
  dimension: SplitDimension | string;
  op: FilterOp;
  values: string[];
}

export interface KpiQueryRequest {
  date_from: string;
  date_to: string;
  granularity: Granularity | 'auto';
  kpis: KpiSelection[];
  filters: DynamicFilter[];
  split_by: SplitDimension | null;
  top_n: number;
  include_others: boolean;
}

export interface KpiTimeSeriesPoint {
  ts: string;
  kpi_key: string;
  split_value: string;
  value: number;
}

export interface KpiQueryResponse {
  data: KpiTimeSeriesPoint[];
  granularity_used: Granularity;
  total_series: number;
  truncated: boolean;
}

export interface KpiSummaryRow {
  split_value: string;
  kpi_key: string;
  avg: number;
  min: number;
  max: number;
  last: number;
  delta_pct: number;
}

export interface KpiMapPoint {
  id: string;
  lat: number;
  lon: number;
  value: number;
  label: string;
  meta: Record<string, any>;
}
