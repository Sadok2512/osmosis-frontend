// ── Sentinel Anomaly Detection Types ──

export type SentinelSeverity = 'critical' | 'major' | 'minor';
export type AnomalyType = 'degradation_soudaine' | 'tendance_anormale' | 'outlier_vs_peers' | 'correlation_croisee';
export type TrendValue = 'stable' | 'degradation_continue' | 'degradation_recente' | 'amelioration_continue' | 'amelioration_recente';
export type DetectorLabel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type SentinelDimension = 'Cellule' | 'Site' | 'Bande' | 'Vendor' | 'ARCEP' | 'DOR' | 'Plaque' | 'RAT' | 'Application' | 'POP' | 'ORF';

export interface DashboardOverviewData {
  date: string;
  total_anomalies: number;
  critical: number;
  major: number;
  minor: number;
  top_degraded: TopDegraded[];
  anomalies_by_type: Record<AnomalyType, number>;
  anomalies_by_dimension: { dimension: string; count: number }[];
}

export interface TopDegraded {
  dimension_1: string;
  dimension_2: string;
  severity: SentinelSeverity;
  qoe_index: number;
  debit_dl: number;
  main_issue: string;
}

export interface Anomaly {
  date_part: string;
  dimension_1: string;
  dimension_2: string;
  anomaly_type: AnomalyType;
  severity: SentinelSeverity;
  kpi_name: string;
  current_value: number;
  reference_value: number;
  deviation_pct: number;
  detector: DetectorLabel;
  confidence: number;
  description: string;
}

export interface AnomalySummary {
  severity: SentinelSeverity;
  dimension: string;
  type: AnomalyType;
  count: number;
}

export interface KPIHistoryPoint {
  date: string;
  value: number;
  is_anomaly: boolean;
}

export interface KPIHistoryData {
  dimension_2: string;
  kpi: string;
  data: KPIHistoryPoint[];
}

export interface KPICompareData {
  scores: {
    debit: number;
    latence: number;
    loss: number;
    retr: number;
    stabilite: number;
    drop: number;
    dms: number;
  };
  qoe_composite: number;
  deltas_7j: Record<string, number>;
  deltas_14j: Record<string, number>;
  trends: Record<string, TrendValue>;
  z_scores: Record<string, number>;
}

export interface ClusterData {
  cluster_id: number;
  cluster_label: string;
  cluster_size: number;
  members: string[];
  centroid: {
    score_debit: number;
    score_latence: number;
    score_loss: number;
    score_retr: number;
    score_stabilite: number;
    score_drop: number;
    score_dms: number;
  };
}

export interface ClusterMember {
  dimension_2: string;
  qoe_index: number;
  debit_dl: number;
  rtt_setup_avg: number;
  loss_dl_rate: number;
  cluster_label: string;
  centroid_distance: number;
}

export interface AnomalyFilters {
  date: string;
  dimension?: SentinelDimension;
  severity?: SentinelSeverity[];
  type?: AnomalyType[];
  search?: string;
  page?: number;
  per_page?: number;
}

export interface HeatmapCell {
  dimension: string;
  category: string;
  count: number;
}

// Severity config
export const SEVERITY_CONFIG: Record<SentinelSeverity, { color: string; label: string; bg: string }> = {
  critical: { color: 'hsl(0, 72%, 51%)', label: 'Critique', bg: 'hsl(0, 72%, 51% / 0.15)' },
  major: { color: 'hsl(38, 92%, 50%)', label: 'Majeure', bg: 'hsl(38, 92%, 50% / 0.15)' },
  minor: { color: 'hsl(217, 91%, 60%)', label: 'Mineure', bg: 'hsl(217, 91%, 60% / 0.15)' },
};

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  degradation_soudaine: 'Dégradation soudaine',
  tendance_anormale: 'Tendance anormale',
  outlier_vs_peers: 'Outlier vs pairs',
  correlation_croisee: 'Corrélation croisée',
};

export const DETECTOR_LABELS: Record<DetectorLabel, string> = {
  D1: 'Seuils dynamiques',
  D2: 'Analyse tendance',
  D3: 'Isolation Forest',
  D4: 'Corrélation multi-KPI',
  D5: 'Clustering',
};

export const TREND_LABELS: Record<TrendValue, { label: string; icon: '↗' | '↘' | '→' | '↑' | '↓'; color: string }> = {
  stable: { label: 'Stable', icon: '→', color: 'hsl(142, 71%, 45%)' },
  degradation_continue: { label: 'Dégradation continue', icon: '↓', color: 'hsl(0, 72%, 51%)' },
  degradation_recente: { label: 'Dégradation récente', icon: '↘', color: 'hsl(38, 92%, 50%)' },
  amelioration_continue: { label: 'Amélioration continue', icon: '↑', color: 'hsl(142, 71%, 45%)' },
  amelioration_recente: { label: 'Amélioration récente', icon: '↗', color: 'hsl(142, 71%, 45%)' },
};

export const CLUSTER_COLORS: Record<string, string> = {
  performant: 'hsl(142, 71%, 45%)',
  moyen: 'hsl(217, 91%, 60%)',
  degrade: 'hsl(38, 92%, 50%)',
  critique: 'hsl(0, 72%, 51%)',
  atypique: 'hsl(258, 90%, 66%)',
};
