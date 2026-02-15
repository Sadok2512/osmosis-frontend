import {
  SiteSummary, SiteDetail, CellProperties, GlobalTimeSeriesPoint,
  Alert, TCPAnalyticsData, TCPTimeSeriesDistributionPoint,
  MobilityImpact, SubscriberExperienceData, TrafficTypeStats,
  DetectorConfig, AnalyticsResponse, AnalyticsQuery, Filters, KPIType,
  TimeSeriesPoint, GeoJSONFeature
} from '../types';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length)];

const SITE_NAMES = [
  'PARIS_DEFENSE', 'PARIS_NATION', 'LYON_PARTDIEU', 'LYON_CONFLUENCE',
  'MARSEILLE_VIEUX_PORT', 'BORDEAUX_CENTRE', 'LILLE_FLANDRES',
  'TOULOUSE_CAPITOLE', 'NICE_PROMENADE', 'NANTES_COMMERCE',
  'STRASBOURG_GARE', 'MONTPELLIER_COMÉDIE', 'RENNES_REPUBLIQUE',
  'GRENOBLE_ALPEXPO', 'DIJON_TOISON', 'CLERMONT_JAUDE',
  'SAINT_ETIENNE_CHATEAUCREUX', 'TOURS_GRAMMONT', 'METZ_GARE', 'ROUEN_CENTRE'
];

const VENDORS = ['Ericsson', 'Nokia', 'Huawei'];
const DORS = ['DOR IDF', 'DOR SUD', 'DOR OUEST', 'DOR EST'];
const PLAQUES = ['PARIS', 'LYON', 'MARSEILLE', 'BORDEAUX', 'LILLE'];
const DEPARTMENTS = ['75', '33', '69', '13', '59'];
const TECHNOS = ['5G', '4G', '4G', '4G', '3G'];
const BANDS = ['700', '800', '1800', '2100', '2600', '3500'];

function generateCell(siteId: string, idx: number): CellProperties {
  const techno = pick(TECHNOS);
  return {
    cell_id: `${siteId}_S${idx + 1}`,
    techno,
    bande: techno === '5G' ? '3500' : pick(BANDS.slice(0, 5)),
    azimut: idx * (360 / 3) + randInt(-10, 10),
    hba: randInt(20, 45),
    qoe_score_avg: rand(55, 98),
    p95_rtt_ms: rand(15, 180),
    traffic_up_bytes: rand(1e9, 5e10),
    dms_dl_3: rand(75, 99),
    dms_dl_8: rand(55, 95),
    dms_dl_30: rand(15, 55),
    dms_ul_3: rand(65, 95),
    p50_thr_dn_mbps: rand(8, 120),
    sessions: randInt(500, 50000),
  };
}

function generateSite(name: string, idx: number): SiteSummary {
  const siteId = `SITE_${String(idx + 1).padStart(3, '0')}`;
  const cellCount = randInt(3, 6);
  const cells = Array.from({ length: cellCount }, (_, i) => generateCell(siteId, i));
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    site_id: siteId,
    site_name: name,
    vendor: pick(VENDORS),
    dor: pick(DORS),
    plaque: pick(PLAQUES),
    department: pick(DEPARTMENTS),
    cell_count: cellCount,
    qoe_score_avg: avg(cells.map(c => c.qoe_score_avg)),
    p50_thr_dn_mbps: avg(cells.map(c => c.p50_thr_dn_mbps)),
    p50_thr_up_mbps: rand(5, 40),
    dms_dl_3: avg(cells.map(c => c.dms_dl_3)),
    dms_dl_8: avg(cells.map(c => c.dms_dl_8)),
    dms_dl_30: avg(cells.map(c => c.dms_dl_30)),
    dms_ul_3: avg(cells.map(c => c.dms_ul_3)),
    coordinates: [48.83 + Math.random() * 0.06, 2.28 + Math.random() * 0.12] as [number, number],
    cells,
  };
}

// Cache sites so they're stable across renders
let cachedSites: SiteSummary[] | null = null;

function getSites(): SiteSummary[] {
  if (!cachedSites) {
    cachedSites = SITE_NAMES.map((name, i) => generateSite(name, i));
  }
  return cachedSites;
}

export function fetchSites(_filters: Filters): Promise<SiteSummary[]> {
  return Promise.resolve(getSites());
}

export function fetchSiteDetails(siteId: string): Promise<SiteDetail> {
  const site = getSites().find(s => s.site_id === siteId) || getSites()[0];
  return Promise.resolve({
    ...site,
    coordinates: [-0.57918 + rand(-0.05, 0.05), 44.83778 + rand(-0.05, 0.05)] as [number, number],
    traffic_dn_bytes: rand(1e12, 8e12),
    traffic_up_bytes: rand(1e11, 2e12),
    p95_rtt_ms: rand(20, 150),
  });
}

export function fetchCellTimeSeries(
  _siteOrCellId: string, _kpi: KPIType, _from?: string, _to?: string, days = 14
): Promise<TimeSeriesPoint[]> {
  const now = new Date('2026-02-10');
  return Promise.resolve(
    Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return { t: d.toISOString().slice(0, 10), v: rand(60, 95) };
    })
  );
}

export function fetchGlobalTimeSeries(_filters: Filters): Promise<GlobalTimeSeriesPoint[]> {
  const days = 14;
  const now = new Date('2026-02-10');
  return Promise.resolve(
    Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        t: d.toISOString().slice(0, 10),
        qoe: rand(72, 92),
        throughput: rand(25, 55),
        throughput_ul: rand(8, 22),
        latency: rand(25, 80),
        loss: rand(0.001, 0.05),
        traffic: rand(5e12, 12e12),
        traffic_ul: rand(1e11, 5e11),
        sessions: randInt(100000, 500000),
        dms_dl_3: rand(82, 96),
        dms_dl_8: rand(60, 85),
        dms_dl_30: rand(18, 42),
        dms_ul_3: rand(70, 90),
      };
    })
  );
}

export function fetchDashboardSnapshot(_filters: Filters): Promise<Record<string, any>> {
  return Promise.resolve({
    avg_qoe: rand(78, 90).toFixed(1),
    dms_dl_3: rand(84, 96).toFixed(1),
    dms_dl_8: rand(62, 82).toFixed(1),
    dms_dl_30: rand(20, 38).toFixed(1),
    dms_ul_3: rand(72, 88).toFixed(1),
    p50_throughput: rand(28, 52).toFixed(1),
    p50_throughput_ul: rand(10, 20).toFixed(1),
    p95_rtt: randInt(30, 75),
    total_sessions: randInt(200000, 600000),
    total_traffic_tb: rand(5, 15).toFixed(1),
  });
}

export function fetchGlobalDistributions(_filters: Filters): Promise<Record<string, any>> {
  return Promise.resolve({
    vendor: VENDORS.map(v => ({ name: v, value: randInt(20, 40) })),
    technology: ['5G', '4G', '3G'].map(t => ({ name: t, value: randInt(15, 50) })),
    region: PLAQUES.map(p => ({ name: p, qoe: rand(70, 95) })),
  });
}

export function fetchAlerts(_filters: Filters): Promise<Alert[]> {
  const severities: Alert['severity'][] = ['CRITIQUE', 'ELEVEE', 'MOYENNE', 'FAIBLE'];
  const statuses: Alert['status'][] = ['NEW', 'ACK', 'RESOLVED', 'FALSE_POSITIVE'];
  return Promise.resolve(
    Array.from({ length: 12 }, (_, i) => ({
      alert_id: `ALT-${String(i + 1).padStart(3, '0')}`,
      severity: severities[i % 4],
      scope_type: pick(['CELL', 'SITE', 'REGION']),
      scope_id: `SITE_${String(randInt(1, 20)).padStart(3, '0')}`,
      scope_name: pick(SITE_NAMES),
      primary_kpi: pick(['qoe_score_avg', 'dms_dl_8', 'p95_rtt_ms', 'loss_dn_sum']),
      baseline: rand(75, 92),
      current: rand(45, 80),
      delta_pct: -rand(5, 35),
      evidence_signals: {
        rtt_increase: `+${randInt(10, 50)}ms`,
        loss_spike: `${rand(0.01, 0.5).toFixed(2)}%`,
        session_drop: `${randInt(5, 30)}%`,
        window_full: `${rand(0.5, 5).toFixed(1)}%`,
      },
      anomaly_score: rand(0.5, 1),
      confidence: rand(0.6, 0.98),
      status: statuses[i % 4],
    }))
  );
}

export function fetchTCPAnalytics(_filters: Filters): Promise<TCPAnalyticsData> {
  return Promise.resolve({
    congestion_index: randInt(15, 45),
    cards: [
      { metric: KPIType.WINDOW_FULL, label: 'Window Full', status: rand(0, 1) > 0.5 ? 'Critical' : 'OK', value: rand(0.5, 6), delta: rand(-2, 3), impacted_sessions: randInt(1000, 10000), total_sessions: randInt(100000, 500000) },
      { metric: KPIType.RETRANSMISSION, label: 'Retransmission', status: 'OK', value: rand(0.2, 3), delta: rand(-1, 1.5), impacted_sessions: randInt(500, 5000), total_sessions: randInt(100000, 500000) },
      { metric: KPIType.TCP_LOSS, label: 'TCP Loss', status: 'Critical', value: rand(0.01, 0.4), delta: rand(-0.1, 0.2), impacted_sessions: randInt(2000, 15000), total_sessions: randInt(100000, 500000) },
      { metric: KPIType.OUT_OF_ORDER, label: 'Out of Order', status: 'OK', value: rand(0.1, 1.5), delta: rand(-0.5, 0.8), impacted_sessions: randInt(300, 3000), total_sessions: randInt(100000, 500000) },
    ],
    distributions: {},
    worst_cells: Array.from({ length: 5 }, (_, i) => ({
      name: `CELL_${pick(SITE_NAMES).split('_')[0]}_S${i + 1}`,
      id: `C${randInt(1000, 9999)}`,
      value: `${rand(1, 8).toFixed(2)}%`,
      qoe_impact: `-${rand(2, 15).toFixed(1)}%`,
    })),
    worst_services: ['Streaming', 'Gaming', 'Web', 'Social'].map(s => ({
      name: s,
      value: `${rand(0.5, 5).toFixed(2)}%`,
      qoe_impact: `-${rand(1, 10).toFixed(1)}%`,
    })),
  });
}

export function fetchTCPTimeSeriesDistributions(
  _metric: KPIType, _from: string, _to: string
): Promise<TCPTimeSeriesDistributionPoint[]> {
  const days = 14;
  const now = new Date('2026-02-10');
  const bins = ['< 0.5%', '0.5-2%', '2-5%', '> 5%'];
  return Promise.resolve(
    Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const percentages = [rand(50, 70), rand(15, 25), rand(5, 15), rand(1, 8)];
      const total = percentages.reduce((a, b) => a + b, 0);
      return {
        t: d.toISOString().slice(0, 10),
        ratio: rand(0.5, 5),
        bins: bins.map((range, j) => ({ range, percentage: (percentages[j] / total) * 100 })),
      };
    })
  );
}

export function fetchMobilityImpact(_filters: Filters): Promise<MobilityImpact[]> {
  return Promise.resolve([
    { type: 'FIXE', qoe: rand(82, 95), rtt: rand(20, 40) },
    { type: 'MOBILE', qoe: rand(60, 78), rtt: rand(50, 120) },
  ]);
}

export function fetchTrafficOverview(_filters: Filters): Promise<TrafficTypeStats[]> {
  return Promise.resolve(
    ['Streaming', 'Gaming', 'Web/HTTP', 'Social', 'Cloud'].map(type => ({
      traffic_type: type,
      traffic_dn_bytes: rand(1e12, 8e12),
      sessions: randInt(50000, 200000),
      loss_rate: rand(0.5, 8),
    }))
  );
}

export function fetchSubscriberProfile(_hash: string): Promise<SubscriberExperienceData> {
  return Promise.resolve({
    total_traffic_gb: rand(5, 50),
    qoe_global: rand(65, 95),
    top_app: pick(['Netflix', 'YouTube', 'TikTok', 'Instagram']),
    sessions: Array.from({ length: 6 }, (_, i) => ({
      type: pick(['Streaming', 'Gaming', 'Web', 'Social']),
      cell: `CELL_${pick(SITE_NAMES).split('_')[0]}_S${randInt(1, 4)}`,
      rtt: randInt(15, 250),
      loss: rand(0, 2),
      status: rand(0, 1) > 0.3 ? 'OK' : 'DEGRADED',
      diagnostic: rand(0, 1) > 0.3 ? 'Nominal' : pick(['Window Full', 'High RTT', 'Retransmission']),
    })),
    timeline: Array.from({ length: 8 }, (_, i) => ({
      time: `${8 + i * 2}:${randInt(0, 59).toString().padStart(2, '0')}`,
      event: pick(['Session Start', 'Handover', 'Session End', 'RAT Change', 'Cell Reselection']),
      type: pick(['Streaming', 'Web', 'Gaming']),
      cell: `CELL_S${randInt(1, 4)}`,
      rat: pick(['5G', '4G', '3G']),
    })),
  });
}

export function fetchDetectorConfigs(): Promise<DetectorConfig[]> {
  return Promise.resolve([
    { id: 'det-001', name: 'QoE Z-Score Detector', enabled: true, features: ['qoe_score', 'dms_dl_8', 'rtt'], method: 'Z-Score (σ=2.5)', level: 'CELL', last_run: '2026-02-10 04:00' },
    { id: 'det-002', name: 'TCP Anomaly Engine', enabled: true, features: ['window_full', 'retrans', 'loss'], method: 'MAD + IQR', level: 'SERVICE', last_run: '2026-02-10 04:00' },
    { id: 'det-003', name: 'Mobility Impact Tracker', enabled: false, features: ['handover_fail', 'rat_change'], method: 'Rule-Based', level: 'SITE', last_run: '2026-02-09 22:00' },
    { id: 'det-004', name: 'Traffic Surge Monitor', enabled: true, features: ['traffic_vol', 'sessions'], method: 'EWMA', level: 'REGION', last_run: '2026-02-10 06:00' },
  ]);
}

export function fetchAnalyticsQuery(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const labels = getLabelsForAggregation(query.aggregation);
  const data = labels.map(label => {
    const row: any = { label, x: label, y: rand(40, 95) };
    query.y_metrics.forEach(m => {
      row[m] = rand(20, 98);
    });
    return row;
  });
  return Promise.resolve({
    metadata: { x_label: query.aggregation, y_labels: query.y_metrics, unit: '%' },
    data,
  });
}

function getLabelsForAggregation(agg: string): string[] {
  switch (agg) {
    case 'date': return Array.from({ length: 14 }, (_, i) => { const d = new Date('2026-02-10'); d.setDate(d.getDate() - (13 - i)); return d.toISOString().slice(5, 10); });
    case 'vendor': return ['Ericsson', 'Nokia', 'Huawei'];
    case 'dor': return ['DOR IDF', 'DOR SUD', 'DOR OUEST', 'DOR EST'];
    case 'department': return ['75', '33', '69', '13', '59'];
    case 'plaque': return ['PARIS', 'LYON', 'MARSEILLE', 'BORDEAUX', 'LILLE'];
    case 'traffic_type': return ['Streaming', 'Gaming', 'Web', 'Social', 'Cloud'];
    case 'rat': return ['5G', '4G', '3G', '2G'];
    default: return Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
  }
}

// Generate features for map view
export function generateMapFeatures(sites: SiteSummary[]): GeoJSONFeature[] {
  const features: GeoJSONFeature[] = [];
  sites.forEach((s) => {
    s.cells.forEach((cell, idx) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [-0.57918 + (Math.random() - 0.5) * 0.1, 44.83778 + (Math.random() - 0.5) * 0.1]
        },
        properties: {
          cell_id: cell.cell_id,
          site_id: s.site_id,
          site_name: s.site_name,
          techno: cell.techno,
          azimut: cell.azimut,
          hba: cell.hba,
          qoe_score_avg: cell.qoe_score_avg,
          dms_dl_3: s.dms_dl_3,
          dms_dl_8: s.dms_dl_8,
          dms_dl_30: s.dms_dl_30,
          dms_ul_3: s.dms_ul_3
        }
      });
    });
  });
  return features;
}
