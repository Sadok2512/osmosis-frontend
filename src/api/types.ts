export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
};

export type ServiceStatus = {
  service_name: string;
  status: string;
  last_run_at?: string | null;
  files_today?: number;
  errors_today?: number;
};

export type ControlStatus = {
  server: {
    cpu_percent: number;
    ram_percent: number;
    disk_percent: number;
  };
  services: ServiceStatus[];
  platform_running: boolean;
};

export type CellInfo = {
  cell_name: string;
  lncel_id?: string | number | null;
  mrbts_id?: string | number | null;
  site_name?: string | null;
  plaque?: string | null;
  dor?: string | null;
  band?: string | null;
  techno?: string | null;
};

export type ResolveCellsResponse = {
  cells: CellInfo[];
  not_found: string[];
  total: number;
};

export type AlarmItem = {
  id: string | number;
  alarm_time: string;
  site_name?: string | null;
  alarm_severity?: string | null;
  alarm_type?: string | null;
  specific_problem?: string | null;
  alarm_status?: string | null;
  duration_min?: number | null;
  bande?: string | null;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pages?: number;
};

export type CmHistoryItem = {
  id: string | number;
  changed_at: string;
  site_name?: string | null;
  dn?: string | null;
  parameter_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  change_type?: string | null;
  bande?: string | null;
  netact_user?: string | null;
};

export type PmStats = {
  total_rows: number;
  sites: number;
  cells: number;
  distinct_counters: number;
  date_from?: string | null;
  date_to?: string | null;
};

export type PmCounterItem = {
  end_time: string;
  mrbts_id?: string | number | null;
  lnbts_id?: string | number | null;
  lncel_id?: string | number | null;
  obj_type?: string | null;
  counter_name?: string | null;
  counter_value?: number | string | null;
  meas_info_id?: string | null;
};

export type CounterListItem = {
  counter_name: string;
  meas_info_id?: string | null;
  cnt?: number;
  total?: number;
};

export type PmKpiSummary = {
  file_date: string;
  mrbts_id?: string | number | null;
  lncel_id?: string | number | null;
  rrc_setup_att?: number | null;
  rrc_setup_succ?: number | null;
  erab_setup_att?: number | null;
  erab_setup_succ?: number | null;
  dl_volume?: number | null;
  ul_volume?: number | null;
};

export type NeighborHoItem = {
  end_time: string;
  mrbts_id?: string | number | null;
  src_lncel_id?: string | number | null;
  target_eci?: string | number | null;
  target_mcc?: string | number | null;
  target_mnc?: string | number | null;
  ho_prep_att_out?: number | null;
  ho_exec_succ_out?: number | null;
  ho_prep_att_in?: number | null;
  ho_exec_succ_in?: number | null;
  ho_ping_pong?: number | null;
  ho_sr_out?: number | null;
  ho_sr_in?: number | null;
};

export type NeighborHoStats = {
  total_rows: number;
  src_cells: number;
  target_cells: number;
  total_ho_att: number;
  total_ho_succ: number;
  global_ho_sr: number;
  date_from?: string | null;
  date_to?: string | null;
};

export type TopFailingHo = {
  src_lncel_id: string | number;
  target_eci: string | number;
  total_att: number;
  total_succ: number;
  ho_sr: number;
  ping_pong?: number | null;
};

export type KpiSeriesPoint = {
  period_start: string;
  kpi_value: number | null;
  is_anomaly?: boolean;
  z_score?: number | null;
};

export type CellKpiSeriesResponse = {
  cell_name: string;
  kpi_code: string;
  period: string;
  data: KpiSeriesPoint[];
};

export type AggregatedKpiPoint = {
  period_start: string;
  kpi_code: string;
  kpi_value: number | null;
  cells_count?: number;
  sites_count?: number;
};

export type SiteKpiResponse = {
  site_name: string;
  data: AggregatedKpiPoint[];
};

export type PlaqueKpiResponse = {
  plaque: string;
  data: AggregatedKpiPoint[];
};

export type ComputeKpiResult = {
  cell_name: string;
  kpi_code: string;
  kpi_value: number | null;
  numerator?: number | null;
  denominator?: number | null;
};

export type ComputeKpiResponse = {
  status: string;
  results: ComputeKpiResult[];
};

export type KpiDefinition = {
  kpi_code: string;
  famille?: string | null;
  nom_ihm?: string | null;
  unites?: string | null;
  techno?: string | null;
  status?: string | null;
};

export type KpiDefinitionsResponse = {
  total: number;
  items: KpiDefinition[];
};

export type AnomalyItem = {
  detected_at: string;
  cell_name: string;
  site_name?: string | null;
  plaque?: string | null;
  kpi_code: string;
  kpi_value?: number | null;
  delta_pct?: number | null;
  z_score?: number | null;
  severity?: string | null;
  method?: string | null;
};

export type AnomaliesSummaryItem = {
  kpi_code: string;
  severity: string;
  method: string;
  count: number;
  avg_delta_pct?: number | null;
};

export type AnomalySummaryResponse = {
  summary: AnomaliesSummaryItem[];
};

export type TopDegradedItem = {
  cell_name: string;
  site_name?: string | null;
  plaque?: string | null;
  kpi_code: string;
  anomaly_count: number;
  avg_delta_pct?: number | null;
  critical_count?: number | null;
};

export type Cluster = {
  id: string | number;
  cluster_name: string;
  cluster_type?: string | null;
  member_count?: number | null;
  is_active?: boolean;
};

export type ChatSession = {
  session_id: string;
  created_at: string;
  title?: string | null;
  total_messages?: number;
};

export type TimelineEvent = {
  event_time: string;
  event_type: string;
  title: string;
  severity?: string | null;
};

export type Recommendation = {
  action: string;
  parameter?: string | null;
  site?: string | null;
  priority?: string | null;
};

export type ChatMessageResponse = {
  session_id: string;
  message: string;
  inv_id?: string;
  intent?: string;
  confidence?: number;
  agents_used?: string[];
  timeline?: TimelineEvent[];
  recommendations?: Recommendation[];
  agent_summaries?: Record<string, string>;
};

export type InvestigationResponse = {
  investigation: Record<string, unknown>;
  findings: Array<Record<string, unknown>>;
  timeline: TimelineEvent[];
};

export type MemoryCellResponse = {
  profile?: Record<string, unknown>;
  patterns?: unknown[];
  history?: unknown[];
  correlations?: unknown[];
};

export type MemoryProblemCell = {
  cell_name: string;
  site_name?: string | null;
  total_investigations?: number;
  last_issue_type?: string | null;
};

export type MemoryStats = {
  total_sessions: number;
  total_investigations: number;
  known_patterns: number;
  problem_cells: number;
};

export type OperatorConfig = {
  id?: string | number;
  name: string;
  country: string;
  vendors?: Array<{ id: string | number; vendor: string; paths?: Array<{ domain: string; folder_path: string }> }>;
};

export type DatabaseConfig = {
  host: string;
  port: number;
  db_name: string;
  username: string;
};

export type ScheduleConfig = {
  id: string | number;
  service_name: string;
  run_time: string;
  is_active: boolean;
  retention_days?: number | null;
};
