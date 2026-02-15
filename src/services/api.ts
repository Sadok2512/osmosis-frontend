
import { 
  AnalyticsQuery, AnalyticsResponse, AnalyticsDataPoint, 
  CellDetails, QoEChartPayload, GlobalTimeSeriesPoint, 
  GlobalDistributions, SiteSummary, SiteDetail, TimeSeriesPoint,
  Filters, KPIType, TCPAnalyticsData, TCPTimeSeriesDistributionPoint,
  MobilityImpact, SubscriberExperienceData, TrafficTypeStats,
  Alert, DetectorConfig
} from '../types';

export const fetchAnalyticsQuery = async (query: AnalyticsQuery): Promise<AnalyticsResponse> => {
  await new Promise(r => setTimeout(r, 800)); 
  const data: AnalyticsDataPoint[] = [];
  const count = query.aggregation === 'date' ? 14 : 8;
  for (let i = 0; i < count; i++) {
    let label = "";
    if (query.aggregation === 'date') {
      const d = new Date();
      d.setDate(d.getDate() - (count - i));
      label = d.toISOString().split('T')[0];
    } else {
      label = `${query.aggregation.toUpperCase()}_${i + 1}`;
    }
    data.push({
      label,
      x: label,
      y: 40 + Math.random() * 50,
      // Fix: use y_metrics length to determine if y2 (secondary metric) should be mocked
      y2: query.y_metrics.length > 1 ? 10 + Math.random() * 30 : undefined,
      count: 1000 + Math.floor(Math.random() * 5000)
    });
  }
  return {
    // Fix: metadata should use y_labels array as per types.ts, removing non-existent y_kpi and y2_kpi
    metadata: { x_label: query.x_kpi, y_labels: query.y_metrics, unit: "%" },
    data
  };
};

// Fix: Add fetchCellDetails mock
export const fetchCellDetails = async (cellId: string, dt: string): Promise<CellDetails> => {
  return {
    cell: { cell_id: cellId, techno: '5G', site_name: 'Site Simulation', bande: '3500MHz' },
    kpi: {
      qoe_score_avg: 75 + Math.random() * 20,
      p50_thr_dn_mbps: 150 + Math.random() * 100,
      p50_thr_up_mbps: 20 + Math.random() * 30,
      dms_dl_3: 98, dms_dl_8: 92, dms_dl_30: 45, dms_ul_3: 88,
      p95_rtt_ms: 35 + Math.random() * 15,
      loss_dn_sum: 0.05, windowfull_dn_sum: 1.2
    }
  };
};

// Fix: Add fetchQoEChartData mock
export const fetchQoEChartData = async (cellId: string, start: string, end: string, gran: string): Promise<QoEChartPayload> => {
  const series = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - (count - i));
    series.push({
      t: d.toISOString().split('T')[0],
      qoe_score: 70 + Math.random() * 25,
      throughput_mbps: 100 + Math.random() * 100,
      throughput_up_mbps: 10 + Math.random() * 20,
      p95_rtt_ms: 30 + Math.random() * 20,
      sessions: 1000 + Math.random() * 500
    });
  }
  return { from: start, to: end, granularity: 'day', series };
};

// Fix: Add fetchGlobalTimeSeries mock
export const fetchGlobalTimeSeries = async (filters: Filters): Promise<GlobalTimeSeriesPoint[]> => {
  const ts = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (14 - i));
    ts.push({
      t: d.toISOString().split('T')[0],
      qoe: 78 + Math.random() * 10,
      throughput: 120 + Math.random() * 40,
      throughput_ul: 15 + Math.random() * 5,
      latency: 40 + Math.random() * 10,
      loss: 0.01 + Math.random() * 0.02,
      traffic: 500 + Math.random() * 200,
      traffic_ul: 50 + Math.random() * 20,
      sessions: 5000 + Math.random() * 2000,
      dms_dl_3: 95, dms_dl_8: 85, dms_dl_30: 30, dms_ul_3: 80
    });
  }
  return ts;
};

// Fix: Add fetchDashboardSnapshot mock
export const fetchDashboardSnapshot = async (filters: Filters) => {
  return {
    avg_qoe: 82.5, dms_dl_30: 28, dms_dl_8: 88, dms_dl_3: 97,
    dms_ul_3: 82, p50_throughput: 145, p50_throughput_ul: 18, p95_rtt: 38
  };
};

// Fix: Add fetchGlobalDistributions mock
export const fetchGlobalDistributions = async (filters: Filters): Promise<GlobalDistributions> => {
  return {};
};

// Fix: Add fetchSites mock
export const fetchSites = async (filters: Filters): Promise<SiteSummary[]> => {
  const sites = [];
  const parisCoords: [number, number][] = [
    [48.8566, 2.3522], [48.8606, 2.3376], [48.8738, 2.2950], [48.8530, 2.3499],
    [48.8462, 2.3464], [48.8649, 2.3800], [48.8700, 2.3200], [48.8400, 2.3100],
    [48.8800, 2.3600], [48.8350, 2.3700], [48.8550, 2.2800], [48.8650, 2.3000]
  ];
  const vendors = ['Ericsson', 'Nokia', 'Huawei', 'Ericsson', 'Nokia', 'Ericsson', 'Huawei', 'Nokia', 'Ericsson', 'Nokia', 'Huawei', 'Ericsson'];
  const dors = ['DOR IDF', 'DOR IDF', 'DOR SUD', 'DOR IDF', 'DOR NORD', 'DOR IDF', 'DOR SUD', 'DOR NORD', 'DOR IDF', 'DOR SUD', 'DOR NORD', 'DOR IDF'];
  for (let i = 0; i < 12; i++) {
    sites.push({
      site_id: `SITE_${i}`, site_name: `Site ${['Montparnasse','Opéra','Étoile','Bastille','Nation','Belleville','Ternes','Vaugirard','Buttes-Chaumont','Bercy','Auteuil','Pigalle'][i]}`,
      vendor: vendors[i], dor: dors[i], plaque: 'PARIS', department: '75', cell_count: 3,
      qoe_score_avg: 70 + Math.random() * 20, p50_thr_dn_mbps: 120, p50_thr_up_mbps: 15,
      dms_dl_3: 98, dms_dl_8: 90, dms_dl_30: 40, dms_ul_3: 85,
      coordinates: parisCoords[i],
      cells: [
        { cell_id: `SITE_${i}_1`, techno: '5G', bande: '3500', azimut: 0, hba: 30, qoe_score_avg: 88, p95_rtt_ms: 30, traffic_up_bytes: 5e9, dms_dl_3: 99, dms_dl_8: 95, dms_dl_30: 55, dms_ul_3: 92, p50_thr_dn_mbps: 200, sessions: 2000 },
        { cell_id: `SITE_${i}_2`, techno: '4G', bande: '2600', azimut: 120, hba: 30, qoe_score_avg: 82, p95_rtt_ms: 45, traffic_up_bytes: 3e9, dms_dl_3: 98, dms_dl_8: 92, dms_dl_30: 45, dms_ul_3: 88, p50_thr_dn_mbps: 100, sessions: 1500 },
        { cell_id: `SITE_${i}_3`, techno: '4G', bande: '1800', azimut: 240, hba: 30, qoe_score_avg: 80, p95_rtt_ms: 48, traffic_up_bytes: 2e9, dms_dl_3: 97, dms_dl_8: 90, dms_dl_30: 40, dms_ul_3: 85, p50_thr_dn_mbps: 80, sessions: 1200 }
      ]
    });
  }
  return sites;
};

// Fix: Add fetchSiteDetails mock
export const fetchSiteDetails = async (siteId: string): Promise<SiteDetail> => {
  return {
    site_id: siteId, site_name: 'Site Detail Name', vendor: 'Ericsson',
    dor: 'DOR IDF', plaque: 'PARIS', department: '75', cell_count: 3,
    qoe_score_avg: 85, p50_thr_dn_mbps: 140, p50_thr_up_mbps: 20,
    dms_dl_3: 99, dms_dl_8: 95, dms_dl_30: 50, dms_ul_3: 90,
    coordinates: [2.3522, 48.8566], traffic_dn_bytes: 1.2e12, traffic_up_bytes: 0.1e12, p95_rtt_ms: 38,
    cells: [
      { cell_id: `${siteId}_1`, techno: '5G', bande: '3500', azimut: 0, hba: 30, qoe_score_avg: 88, p95_rtt_ms: 30, traffic_up_bytes: 5e9, dms_dl_3: 99, dms_dl_8: 95, dms_dl_30: 55, dms_ul_3: 92, p50_thr_dn_mbps: 200, sessions: 2000 },
      { cell_id: `${siteId}_2`, techno: '4G', bande: '2600', azimut: 120, hba: 30, qoe_score_avg: 82, p95_rtt_ms: 45, traffic_up_bytes: 3e9, dms_dl_3: 98, dms_dl_8: 92, dms_dl_30: 45, dms_ul_3: 88, p50_thr_dn_mbps: 100, sessions: 1500 },
      { cell_id: `${siteId}_3`, techno: '4G', bande: '1800', azimut: 240, hba: 30, qoe_score_avg: 80, p95_rtt_ms: 48, traffic_up_bytes: 2e9, dms_dl_3: 97, dms_dl_8: 90, dms_dl_30: 40, dms_ul_3: 85, p50_thr_dn_mbps: 80, sessions: 1200 }
    ]
  };
};

// Fix: Add fetchCellTimeSeries mock
export const fetchCellTimeSeries = async (id: string, kpi: KPIType, start?: string, end?: string, count: number = 14): Promise<TimeSeriesPoint[]> => {
  const ts = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (count - i));
    ts.push({ t: d.toISOString().split('T')[0], v: 70 + Math.random() * 20 });
  }
  return ts;
};

// Fix: Add fetchTCPAnalytics mock
export const fetchTCPAnalytics = async (filters: Filters): Promise<TCPAnalyticsData> => {
  return {
    congestion_index: 45,
    cards: [
      { metric: KPIType.WINDOW_FULL, label: 'Window Full', status: 'Nominal', value: 0.8, delta: -5, impacted_sessions: 450, total_sessions: 50000 },
      { metric: KPIType.RETRANSMISSION, label: 'Retransmission', status: 'Nominal', value: 0.4, delta: +2, impacted_sessions: 200, total_sessions: 50000 },
      { metric: KPIType.TCP_LOSS, label: 'TCP Loss', status: 'Warning', value: 0.05, delta: +10, impacted_sessions: 1200, total_sessions: 50000 },
      { metric: KPIType.OUT_OF_ORDER, label: 'Out of Order', status: 'Nominal', value: 0.1, delta: -1, impacted_sessions: 100, total_sessions: 50000 }
    ],
    distributions: {}
  };
};

// Fix: Add fetchTCPTimeSeriesDistributions mock
export const fetchTCPTimeSeriesDistributions = async (kpi: KPIType, start: string, end: string): Promise<TCPTimeSeriesDistributionPoint[]> => {
  const ts = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i));
    ts.push({
      t: d.toISOString().split('T')[0],
      ratio: Math.random() * 2,
      bins: [
        { range: '0-0.1%', percentage: 80 },
        { range: '0.1-0.5%', percentage: 15 },
        { range: '0.5-1%', percentage: 4 },
        { range: '>1%', percentage: 1 }
      ]
    });
  }
  return ts;
};

// Fix: Add fetchMobilityImpact mock
export const fetchMobilityImpact = async (filters: Filters): Promise<MobilityImpact[]> => {
  return [
    { type: 'FIXE', qoe: 85, rtt: 32 },
    { type: 'MOBILE', qoe: 72, rtt: 58 }
  ];
};

// Fix: Add fetchSubscriberProfile mock
export const fetchSubscriberProfile = async (hash: string): Promise<SubscriberExperienceData> => {
  return {
    total_traffic_gb: 45.2, qoe_global: 81, top_app: 'Netflix',
    sessions: [{ type: 'Streaming', cell: 'CELL_1', rtt: 45, loss: 0.01, status: 'OK', diagnostic: 'Nominal' }],
    timeline: [{ time: '10:00', event: 'Session Start', rat: '5G' }]
  };
};

// Fix: Add fetchTrafficOverview mock
export const fetchTrafficOverview = async (filters: Filters): Promise<TrafficTypeStats[]> => {
  return [
    { traffic_type: 'Streaming', traffic_dn_bytes: 5e12, sessions: 10000, loss_rate: 2 },
    { traffic_type: 'Web', traffic_dn_bytes: 1e12, sessions: 25000, loss_rate: 1 },
    { traffic_type: 'Gaming', traffic_dn_bytes: 0.5e12, sessions: 5000, loss_rate: 8 }
  ];
};

// Fix: Add fetchAlerts mock
export const fetchAlerts = async (filters: Filters): Promise<Alert[]> => {
  return [
    { 
      alert_id: 'ALT_001', severity: 'CRITIQUE', scope_type: 'CELL', scope_id: 'C_123', scope_name: 'Cell Name',
      primary_kpi: 'QoE', baseline: 85, current: 62, delta_pct: -27, evidence_signals: {},
      anomaly_score: 8.5, confidence: 0.92, status: 'NEW'
    }
  ];
};

// Fix: Add fetchDetectorConfigs mock
export const fetchDetectorConfigs = async (): Promise<DetectorConfig[]> => {
  return [{ id: 'D_01', name: 'TCP Congestion', enabled: true, features: ['RTT', 'Loss'], method: 'Z-Score', level: 'CELL' }];
};
