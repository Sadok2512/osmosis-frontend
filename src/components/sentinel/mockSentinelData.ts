// Mock data for Sentinel NOC Dashboard
import type { DashboardOverviewData, Anomaly, ClusterData } from './types';

export const MOCK_OVERVIEW: DashboardOverviewData = {
  date: '2025-12-02',
  total_anomalies: 247,
  critical: 18,
  major: 73,
  minor: 156,
  anomalies_by_type: {
    degradation_soudaine: 62,
    tendance_anormale: 89,
    outlier_vs_peers: 54,
    correlation_croisee: 42,
  },
  anomalies_by_dimension: [
    { dimension: 'Cellule', count: 112 },
    { dimension: 'Site', count: 48 },
    { dimension: 'Bande', count: 31 },
    { dimension: 'DOR', count: 22 },
    { dimension: 'Plaque', count: 18 },
    { dimension: 'Vendor', count: 16 },
  ],
  top_degraded: [
    { dimension_1: 'Cellule', dimension_2: 'PAR_LTE_B3_001', severity: 'critical', qoe_index: 32.1, debit_dl: 4.2, main_issue: 'Débit DL effondré' },
    { dimension_1: 'Cellule', dimension_2: 'LYO_NR_B78_012', severity: 'critical', qoe_index: 38.5, debit_dl: 8.7, main_issue: 'Latence élevée + pertes' },
    { dimension_1: 'Site', dimension_2: 'MARSEILLE_SUD_04', severity: 'critical', qoe_index: 41.2, debit_dl: 12.3, main_issue: 'Session DCR élevé' },
    { dimension_1: 'Cellule', dimension_2: 'TLS_LTE_B1_007', severity: 'major', qoe_index: 48.9, debit_dl: 15.1, main_issue: 'Retransmission TCP' },
    { dimension_1: 'Bande', dimension_2: 'B28', severity: 'major', qoe_index: 52.3, debit_dl: 11.8, main_issue: 'Instabilité RAT' },
    { dimension_1: 'Cellule', dimension_2: 'BDX_NR_B1_003', severity: 'major', qoe_index: 55.7, debit_dl: 18.4, main_issue: 'Fallback 5G→4G' },
    { dimension_1: 'DOR', dimension_2: 'DOR_IDF_EST', severity: 'major', qoe_index: 58.1, debit_dl: 22.6, main_issue: 'QoE composite bas' },
    { dimension_1: 'Cellule', dimension_2: 'NTE_LTE_B7_019', severity: 'minor', qoe_index: 62.4, debit_dl: 25.3, main_issue: 'Out of order élevé' },
    { dimension_1: 'Plaque', dimension_2: 'PLAQUE_SUD', severity: 'minor', qoe_index: 65.8, debit_dl: 28.9, main_issue: 'Volume DL faible' },
    { dimension_1: 'Cellule', dimension_2: 'STR_LTE_B3_005', severity: 'minor', qoe_index: 68.2, debit_dl: 31.1, main_issue: 'Wind full rate élevé' },
  ],
};

// Extended ML insights data for the NOC dashboard
export interface MLInsightRow {
  entity: string;
  technology: 'LTE' | 'NR';
  dimension: string;
  severity: 'critical' | 'major' | 'minor';
  qoe_index: number;
  dl_throughput: number;
  problem: string;
  ml_confidence: number;
  anomaly_score: number;
  root_cause: string;
}

export const MOCK_ML_INSIGHTS: MLInsightRow[] = [
  { entity: 'PAR_LTE_B3_001', technology: 'LTE', dimension: 'Cell', severity: 'critical', qoe_index: 32.1, dl_throughput: 4.2, problem: 'DL Throughput collapse', ml_confidence: 0.97, anomaly_score: 9.4, root_cause: 'Hardware degradation' },
  { entity: 'LYO_NR_B78_012', technology: 'NR', dimension: 'Cell', severity: 'critical', qoe_index: 38.5, dl_throughput: 8.7, problem: 'High latency + packet loss', ml_confidence: 0.94, anomaly_score: 8.8, root_cause: 'Backhaul congestion' },
  { entity: 'MARSEILLE_SUD_04', technology: 'LTE', dimension: 'Site', severity: 'critical', qoe_index: 41.2, dl_throughput: 12.3, problem: 'Session DCR spike', ml_confidence: 0.91, anomaly_score: 8.2, root_cause: 'Power supply instability' },
  { entity: 'TLS_LTE_B1_007', technology: 'LTE', dimension: 'Cell', severity: 'major', qoe_index: 48.9, dl_throughput: 15.1, problem: 'TCP retransmission', ml_confidence: 0.88, anomaly_score: 7.1, root_cause: 'Interference B1/B3' },
  { entity: 'BDX_NR_B1_003', technology: 'NR', dimension: 'Cell', severity: 'major', qoe_index: 55.7, dl_throughput: 18.4, problem: '5G→4G Fallback', ml_confidence: 0.85, anomaly_score: 6.5, root_cause: 'Coverage gap NR' },
  { entity: 'NTE_LTE_B7_019', technology: 'LTE', dimension: 'Cell', severity: 'minor', qoe_index: 62.4, dl_throughput: 25.3, problem: 'Out of order packets', ml_confidence: 0.82, anomaly_score: 5.3, root_cause: 'Path asymmetry' },
  { entity: 'STR_NR_N78_002', technology: 'NR', dimension: 'Cell', severity: 'major', qoe_index: 50.2, dl_throughput: 14.8, problem: 'Beam failure rate', ml_confidence: 0.87, anomaly_score: 6.9, root_cause: 'Antenna tilt drift' },
  { entity: 'REN_LTE_B28_004', technology: 'LTE', dimension: 'Cell', severity: 'minor', qoe_index: 64.1, dl_throughput: 22.7, problem: 'RAT instability', ml_confidence: 0.79, anomaly_score: 4.8, root_cause: 'Neighbor config' },
];

// QoE score data for gauge
export const MOCK_QOE_SCORE = 71.4;
export const MOCK_QOE_YESTERDAY = 73.8;

// Trend deltas (vs yesterday)
export const MOCK_DELTAS = {
  total_anomalies: +12,
  critical: +3,
  major: -2,
  minor: +11,
};

// Heatmap region data for the map
export interface RegionHeatData {
  name: string;
  lat: number;
  lng: number;
  anomalyCount: number;
  severity: 'critical' | 'major' | 'minor' | 'ok';
  qoe: number;
}

export const MOCK_REGION_HEAT: RegionHeatData[] = [
  { name: 'Île-de-France', lat: 48.8566, lng: 2.3522, anomalyCount: 42, severity: 'critical', qoe: 58.3 },
  { name: 'Auvergne-Rhône-Alpes', lat: 45.764, lng: 4.8357, anomalyCount: 28, severity: 'major', qoe: 65.1 },
  { name: 'Provence-Alpes-Côte d\'Azur', lat: 43.2965, lng: 5.3698, anomalyCount: 31, severity: 'critical', qoe: 55.7 },
  { name: 'Occitanie', lat: 43.6047, lng: 1.4442, anomalyCount: 19, severity: 'major', qoe: 68.4 },
  { name: 'Nouvelle-Aquitaine', lat: 44.8378, lng: -0.5792, anomalyCount: 15, severity: 'minor', qoe: 72.9 },
  { name: 'Grand Est', lat: 48.5734, lng: 7.7521, anomalyCount: 12, severity: 'minor', qoe: 74.2 },
  { name: 'Hauts-de-France', lat: 50.6292, lng: 3.0573, anomalyCount: 22, severity: 'major', qoe: 63.8 },
  { name: 'Bretagne', lat: 48.1173, lng: -1.6778, anomalyCount: 8, severity: 'ok', qoe: 79.1 },
  { name: 'Normandie', lat: 49.1829, lng: -0.3707, anomalyCount: 10, severity: 'minor', qoe: 75.6 },
  { name: 'Pays de la Loire', lat: 47.2184, lng: -1.5536, anomalyCount: 7, severity: 'ok', qoe: 80.3 },
  { name: 'Centre-Val de Loire', lat: 47.3941, lng: 1.6933, anomalyCount: 9, severity: 'minor', qoe: 76.4 },
  { name: 'Bourgogne-Franche-Comté', lat: 47.3220, lng: 5.0415, anomalyCount: 6, severity: 'ok', qoe: 81.2 },
];

export const MOCK_ANOMALIES: Anomaly[] = [
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'PAR_LTE_B3_001', anomaly_type: 'degradation_soudaine', severity: 'critical', kpi_name: 'debit_dl', current_value: 4.2, reference_value: 45.8, deviation_pct: -90.8, detector: 'D1', confidence: 0.97, description: 'Chute brutale du débit DL' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'LYO_NR_B78_012', anomaly_type: 'correlation_croisee', severity: 'critical', kpi_name: 'rtt_setup_avg', current_value: 285000, reference_value: 42000, deviation_pct: 578.6, detector: 'D4', confidence: 0.94, description: 'Corrélation latence-pertes détectée' },
  { date_part: '2025-12-02', dimension_1: 'Site', dimension_2: 'MARSEILLE_SUD_04', anomaly_type: 'tendance_anormale', severity: 'critical', kpi_name: 'session_dcr', current_value: 8.2, reference_value: 1.1, deviation_pct: 645.5, detector: 'D2', confidence: 0.91, description: 'Tendance DCR en hausse continue' },
  { date_part: '2025-12-02', dimension_1: 'Cellule', dimension_2: 'TLS_LTE_B1_007', anomaly_type: 'outlier_vs_peers', severity: 'major', kpi_name: 'tcp_retr_rate_dl', current_value: 0.12, reference_value: 0.02, deviation_pct: 500.0, detector: 'D3', confidence: 0.88, description: 'Retransmission très supérieure aux pairs' },
  { date_part: '2025-12-02', dimension_1: 'Bande', dimension_2: 'B28', anomaly_type: 'tendance_anormale', severity: 'major', kpi_name: 'instability_rate', current_value: 0.34, reference_value: 0.08, deviation_pct: 325.0, detector: 'D2', confidence: 0.85, description: 'Instabilité RAT croissante sur B28' },
];

export const MOCK_CLUSTERS: ClusterData[] = [
  { cluster_id: 0, cluster_label: 'performant', cluster_size: 342, members: ['PAR_LTE_B1_001', 'PAR_LTE_B3_002'], centroid: { score_debit: 85, score_latence: 90, score_loss: 92, score_retr: 88, score_stabilite: 91, score_drop: 94, score_dms: 87 } },
  { cluster_id: 1, cluster_label: 'moyen', cluster_size: 218, members: ['LYO_LTE_B7_003', 'TLS_NR_B1_004'], centroid: { score_debit: 62, score_latence: 68, score_loss: 71, score_retr: 65, score_stabilite: 60, score_drop: 73, score_dms: 64 } },
  { cluster_id: 2, cluster_label: 'degrade', cluster_size: 87, members: ['NTE_LTE_B3_005', 'BDX_LTE_B1_006'], centroid: { score_debit: 38, score_latence: 42, score_loss: 45, score_retr: 35, score_stabilite: 40, score_drop: 48, score_dms: 37 } },
  { cluster_id: 3, cluster_label: 'critique', cluster_size: 23, members: ['PAR_LTE_B3_001', 'LYO_NR_B78_012'], centroid: { score_debit: 15, score_latence: 20, score_loss: 22, score_retr: 18, score_stabilite: 12, score_drop: 25, score_dms: 16 } },
];
