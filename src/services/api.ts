import { 
  AnalyticsQuery, AnalyticsResponse, AnalyticsDataPoint, 
  CellDetails, QoEChartPayload, GlobalTimeSeriesPoint, 
  GlobalDistributions, SiteSummary, SiteDetail, TimeSeriesPoint,
  Filters, KPIType, TCPAnalyticsData, TCPTimeSeriesDistributionPoint,
  MobilityImpact, SubscriberExperienceData, TrafficTypeStats,
  Alert, DetectorConfig
} from '../types';

// Re-export all data functions from mockData (which uses real topo)
export {
  fetchSites,
  fetchSiteDetails,
  fetchCellTimeSeries,
  fetchGlobalTimeSeries,
  fetchDashboardSnapshot,
  fetchGlobalDistributions,
  fetchAlerts,
  fetchTCPAnalytics,
  fetchTCPTimeSeriesDistributions,
  fetchMobilityImpact,
  fetchTrafficOverview,
  fetchSubscriberProfile,
  fetchDetectorConfigs,
  fetchAnalyticsQuery,
  generateMapFeatures,
} from './mockData';

// Keep these unique mocks that aren't in mockData
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
