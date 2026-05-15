export type AggregationLevel = 'vendor' | 'dor' | 'department' | 'plaque' | 'site' | 'cell' | 'traffic_type' | 'service' | 'rat' | 'date' | 'client' | 'device';

export enum KPIType {
  QOE_SCORE = 'qoe_score_avg',
  DMS_DL_3 = 'dms_dl_3',
  DMS_DL_8 = 'dms_dl_8',
  DMS_DL_30 = 'dms_dl_30',
  DMS_UL_3 = 'dms_ul_3',
  THROUGHPUT = 'p50_thr_dn_mbps',
  THROUGHPUT_UP = 'p50_thr_up_mbps',
  LATENCY = 'p95_rtt_ms',
  LOSS = 'loss_dn_sum',
  TRAFFIC = 'traffic_dn_bytes',
  SESSIONS = 'sessions',
  WINDOW_FULL = 'window_full_ratio',
  RETRANSMISSION = 'retransmission_rate',
  TCP_LOSS = 'tcp_loss_rate',
  OUT_OF_ORDER = 'out_of_order_rate'
}

export interface Milestone {
  dt: string;
  label: string;
}

export interface Filters {
  dt: string;
  kpi: KPIType;
  rat: string;
  service: string;
  plaque: string;
  vendor: string;
  dor: string;
  department: string;
  from_dt: string;
  to_dt: string;
  vol_dl_min?: number;
  vol_ul_min?: number;
  vol_sessions_min?: number;
  milestones: Milestone[];
  thresholds: Record<string, number>;
  visibility: {
    showSessions: boolean;
    showMilestones: boolean;
    showThresholds: boolean;
    showPoints: boolean;
  };
  backgroundKpi: string;
  backgroundOpacity: number;
  kpiColors: Record<string, string>;
}

export interface AnalyticsQuery {
  x_kpi: string;
  y_metrics: string[];
  color_by?: string;
  size_by?: string;
  filters: Partial<Filters>;
  aggregation: AggregationLevel;
  chart_type: 'line' | 'bar' | 'area' | 'scatter' | 'stacked_bar' | 'table';
  show_points: boolean;
}

export interface AnalyticsDataPoint {
  label: string;
  x: any;
  y: number;
  y2?: number;
  [key: string]: any;
}

export interface AnalyticsResponse {
  metadata: {
    x_label: string;
    y_labels: string[];
    unit: string;
  };
  data: AnalyticsDataPoint[];
}

export interface BIKPI {
  id: string;
  label: string;
  category: 'Quality' | 'Traffic' | 'Radio' | 'TCP' | 'Regulatory';
  unit: string;
  color: string;
}

export interface CellDetails {
  cell: {
    cell_id: string;
    techno: string;
    site_name: string;
    bande: string;
  };
  kpi: {
    qoe_score_avg: number;
    p50_thr_dn_mbps: number;
    p50_thr_up_mbps: number;
    dms_dl_3: number;
    dms_dl_8: number;
    dms_dl_30: number;
    dms_ul_3: number;
    p95_rtt_ms: number;
    loss_dn_sum: number;
    windowfull_dn_sum: number;
    dms_ul_3_pct?: number;
  };
}

export interface RCAResult {
  root_cause_class: string;
  summary: string[];
  evidence: string[];
  recommended_actions: string[];
  confidence: number;
}

export interface Alert {
  alert_id: string;
  severity: 'CRITIQUE' | 'ELEVEE' | 'MOYENNE' | 'FAIBLE';
  scope_type: string;
  scope_id: string;
  scope_name: string;
  primary_kpi: string;
  baseline: number;
  current: number;
  delta_pct: number;
  evidence_signals: Record<string, any>;
  anomaly_score: number;
  confidence: number;
  status: 'NEW' | 'ACK' | 'RESOLVED' | 'FALSE_POSITIVE' | 'IGNORE';
  rca?: RCAResult;
}

export interface TCPAnalyticsData {
  congestion_index: number;
  cards: {
    metric: KPIType;
    label: string;
    status: string;
    value: number;
    delta: number;
    impacted_sessions: number;
    total_sessions: number;
  }[];
  distributions: Record<string, any>;
  worst_cells?: { name: string; id: string; value: string; qoe_impact: string }[];
  worst_services?: { name: string; value: string; qoe_impact: string }[];
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    cell_id: string;
    site_id: string;
    site_name: string;
    techno: string;
    azimut: number;
    hba: number;
    qoe_score_avg: number;
    dms_dl_3: number;
    dms_dl_8: number;
    dms_dl_30: number;
    dms_ul_3: number;
    [key: string]: any;
  };
}

export interface MapLayersState {
  cells: boolean;
  sites: boolean;
  sectors: boolean;
  heatmap: boolean;
  hotspots: boolean;
  alerts: boolean;
  arcep: boolean;
  tgv: boolean;
  axe: boolean;
}

export interface QoEChartPayload {
  from: string;
  to: string;
  granularity: 'day' | 'hour' | 'category';
  series: any[];
  events?: { t: string; label: string; type: string }[];
}

export interface GlobalTimeSeriesPoint {
  t: string;
  qoe: number;
  throughput: number;
  throughput_ul: number;
  latency: number;
  loss: number;
  traffic: number;
  traffic_ul: number;
  sessions: number;
  dms_dl_3: number;
  dms_dl_8: number;
  dms_dl_30: number;
  dms_ul_3: number;
}

export interface GlobalDistributions {
  [key: string]: any;
}

export interface CellProperties {
  cell_id: string;
  techno: string;
  bande: string;
  azimut: number;
  hba: number;
  tilt?: number | null;
  qoe_score_avg: number;
  p95_rtt_ms: number;
  traffic_up_bytes: number;
  traffic_dn_bytes: number;
  dms_dl_3: number;
  dms_dl_8: number;
  dms_dl_30: number;
  dms_ul_3: number;
  p50_thr_dn_mbps: number;
  p50_thr_up_mbps: number;
  sessions: number;
  window_full_ratio: number;
  retransmission_rate: number;
  tcp_loss_rate: number;
  out_of_order_ratio: number;
  p25_rtt_ms: number;
  p75_rtt_ms: number;
}

export interface SiteSummary {
  site_id: string;
  site_name: string;
  vendor: string;
  dor: string;
  plaque?: string;
  department: string;
  cell_count: number;
  qoe_score_avg: number;
  p50_thr_dn_mbps: number;
  p50_thr_up_mbps: number;
  dms_dl_3: number;
  dms_dl_8: number;
  dms_dl_30: number;
  dms_ul_3: number;
  coordinates: [number, number];
  cells: CellProperties[];
  zone_arcep?: string | null;
  techno?: string | null;
  bande?: string | null;
  /** Parsed list of bands as advertised by backend (already CSV-split). */
  bandes?: string[];
  /** Parsed list of technologies as advertised by backend. */
  technos?: string[];
  /**
   * Raw cell_count from backend `/topo/sites` (NOT filtered by band/techno).
   * Use `cells.length` for filtered-aware count, fall back here only when cells aren't loaded.
   */
  backend_cell_count?: number;
  lte_cells?: number;
  nr_cells?: number;
  cells_2g?: number;
  cells_3g?: number;
  cluster?: string | null;
}

export interface SiteDetail extends SiteSummary {
  coordinates: [number, number];
  traffic_dn_bytes: number;
  traffic_up_bytes: number;
  p95_rtt_ms: number;
  cells: CellProperties[];
}

export interface TimeSeriesPoint {
  t: string;
  v: number;
  [key: string]: any;
}

export interface TCPTimeSeriesDistributionPoint {
  t: string;
  ratio: number;
  bins: { range: string; percentage: number }[];
}

export interface MobilityImpact {
  type: string;
  qoe: number;
  rtt: number;
}

export interface SubscriberExperienceData {
  total_traffic_gb: number;
  qoe_global: number;
  top_app: string;
  sessions: {
    type: string;
    cell: string;
    rtt: number;
    loss: number;
    status: string;
    diagnostic: string;
  }[];
  timeline: {
    time: string;
    event: string;
    type?: string;
    cell?: string;
    rat: string;
  }[];
}

export interface TrafficTypeStats {
  traffic_type: string;
  traffic_dn_bytes: number;
  sessions: number;
  loss_rate: number;
}

export interface DetectorConfig {
  id: string;
  name: string;
  enabled: boolean;
  features: string[];
  method: string;
  level: string;
  last_run?: string;
}

export type AppTab = 'list' | 'sites' | 'analytics' | 'bi' | 'radio' | 'traffic' | 'subscriber' | 'alerts' | 'detector' | 'odcc' | 'settings' | 'docs' | 'ai_assistant' | 'dashboard_overview' | 'rag' | 'radio_profile' | 'backend_admin' | 'topologie' | 'kpi_monitor' | 'kpi_reference2' | 'pm_dashboard' | 'parameters' | 'pulse_report' | 'agent_hub' | 'sentinel' | 'investigator' | 'ran_query' | 'topology' | 'precision_architect' | 'alarm_center' | 'ticket_management';
