import { KPIType, BIKPI } from '../types';

export const BI_KPIS: BIKPI[] = [
  { id: 'qoe_score_avg', label: 'QoE Score', category: 'Quality', unit: '%', color: '#3b82f6' },
  { id: 'dms_dl_3', label: 'DMS DL 3M', category: 'Regulatory', unit: '%', color: '#10b981' },
  { id: 'dms_dl_8', label: 'DMS DL 8M', category: 'Regulatory', unit: '%', color: '#8b5cf6' },
  { id: 'dms_dl_30', label: 'DMS DL 30M', category: 'Regulatory', unit: '%', color: '#f97316' },
  { id: 'p50_thr_dn_mbps', label: 'Throughput DL (p50)', category: 'Traffic', unit: 'Mbps', color: '#14b8a6' },
  { id: 'p50_thr_up_mbps', label: 'Throughput UL (p50)', category: 'Traffic', unit: 'Mbps', color: '#6366f1' },
  { id: 'p95_rtt_ms', label: 'RTT (p95)', category: 'Radio', unit: 'ms', color: '#f59e0b' },
  { id: 'window_full_ratio', label: 'Window Full Ratio', category: 'TCP', unit: '%', color: '#ef4444' },
  { id: 'retransmission_rate', label: 'Retransmission Rate', category: 'TCP', unit: '%', color: '#ec4899' },
  { id: 'sessions', label: 'Total Sessions', category: 'Traffic', unit: '', color: '#64748b' },
  { id: 'traffic_dn_bytes', label: 'Volume DL', category: 'Traffic', unit: 'GB', color: '#1e293b' },
  { id: 'tcp_loss_rate', label: 'TCP Loss Rate', category: 'TCP', unit: '%', color: '#7f1d1d' },
];

export const BI_AGGREGATIONS = [
  { id: 'date', label: 'Date (Temporel)' },
  { id: 'vendor', label: 'Vendor (Constructeur)' },
  { id: 'ur', label: 'UR (Unité Régionale)' },
  { id: 'department', label: 'Department' },
  { id: 'plaque', label: 'Plaque Régionale' },
  { id: 'traffic_type', label: 'Traffic Type' },
  { id: 'client', label: 'Client (Subscriber)' },
  { id: 'device', label: 'Device Model' },
  { id: 'site', label: 'Site (ID)' },
  { id: 'rat', label: 'Technology (RAT)' }
];

export const KPI_LABELS: Record<string, string> = {
  [KPIType.QOE_SCORE]: 'Score QoE Global',
  [KPIType.DMS_DL_30]: 'DMS DL 30 Mbps',
  [KPIType.DMS_DL_8]: 'DMS DL 8 Mbps',
  [KPIType.DMS_DL_3]: 'DMS DL 3 Mbps',
  [KPIType.DMS_UL_3]: 'DMS UL 3 Mbps',
  [KPIType.THROUGHPUT]: 'Débit DL P50',
  [KPIType.THROUGHPUT_UP]: 'Débit UL P50',
  [KPIType.LATENCY]: 'Latence P95',
  [KPIType.LOSS]: 'Pertes Radio',
  [KPIType.TRAFFIC]: 'Volume Trafic',
  [KPIType.SESSIONS]: 'Total Sessions',
  [KPIType.WINDOW_FULL]: 'Ratio Window Full',
  [KPIType.RETRANSMISSION]: 'Taux Retransmission',
  [KPIType.TCP_LOSS]: 'Taux Pertes TCP',
  [KPIType.OUT_OF_ORDER]: 'Out of Order Ratio'
};

export const PLAQUES = ['ALL', 'LITTORAL_DUNKERQUE', 'Zones_Blanches_A1', 'DEPT_57', 'DEPT_62', 'FREJUS', 'AUTRES41', 'BAYONNE'];
export const SERVICES = ['ALL', 'Streaming', 'Gaming', 'Web', 'Social'];
export const RATS = ['ALL', '5G', '4G', '3G', '2G'];
export const DEPARTMENTS = ['ALL', 'LITTORAL_DUNKERQUE', 'Zones_Blanches_A1', '57', '62', 'FREJUS', 'AUTRES41', 'BAYONNE'];
export const VENDORS = ['ALL', 'Ericsson', 'Nokia'];
export const URS = ['ALL'];

export const getQoEColor = (qoe: number) => {
  if (qoe >= 85) return '#10b981';
  if (qoe >= 70) return '#f59e0b';
  if (qoe >= 50) return '#f97316';
  return '#ef4444';
};

export const getMetricColor = (kpi: KPIType, value: number, techno?: string) => {
  if (kpi === KPIType.QOE_SCORE) return getQoEColor(value);
  return '#3b82f6';
};
