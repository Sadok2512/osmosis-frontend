// Mock data for Sentinel when FastAPI backend is unreachable
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
