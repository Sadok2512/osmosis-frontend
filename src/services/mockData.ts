import {
  SiteSummary, SiteDetail, CellProperties, GlobalTimeSeriesPoint,
  Alert, TCPAnalyticsData, TCPTimeSeriesDistributionPoint,
  MobilityImpact, SubscriberExperienceData, TrafficTypeStats,
  DetectorConfig, AnalyticsResponse, AnalyticsQuery, Filters, KPIType,
  TimeSeriesPoint, GeoJSONFeature
} from '../types';
import topoRaw from '../data/topoData';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length)];

// Seeded random for stable KPI values per cell
function seededRand(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

// Build sites from real topo data
function buildSitesFromTopo(): SiteSummary[] {
  const siteMap = new Map<string, typeof topoRaw>();

  topoRaw.forEach(row => {
    if (!siteMap.has(row.siteId)) siteMap.set(row.siteId, []);
    siteMap.get(row.siteId)!.push(row);
  });

  const sites: SiteSummary[] = [];

  siteMap.forEach((rows, siteId) => {
    const first = rows[0];

    // Use average coordinates of all cells for site center
    const avgLat = rows.reduce((s, r) => s + r.lat, 0) / rows.length;
    const avgLng = rows.reduce((s, r) => s + r.lng, 0) / rows.length;

    const cells: CellProperties[] = rows.map(r => ({
      cell_id: r.cellName,
      techno: r.techno,
      bande: r.bande,
      azimut: r.azimut,
      hba: r.hba,
      qoe_score_avg: seededRand(r.cellName + 'qoe', 55, 98),
      p95_rtt_ms: seededRand(r.cellName + 'rtt', 15, 180),
      traffic_up_bytes: seededRand(r.cellName + 'traf', 1e9, 5e10),
      dms_dl_3: seededRand(r.cellName + 'dms3', 75, 99),
      dms_dl_8: seededRand(r.cellName + 'dms8', 55, 95),
      dms_dl_30: seededRand(r.cellName + 'dms30', 15, 55),
      dms_ul_3: seededRand(r.cellName + 'ul3', 65, 95),
      p50_thr_dn_mbps: seededRand(r.cellName + 'thr', 8, 120),
      sessions: Math.floor(seededRand(r.cellName + 'ses', 500, 50000)),
    }));

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    // Determine DOR from region
    const dorMap: Record<string, string> = {
      'UPR Nord-Est': 'DOR EST',
      'UPR Sud-Est': 'DOR SUD',
      'UPR Ouest': 'DOR OUEST',
      'UPR Sud-Ouest': 'DOR SUD',
    };

    sites.push({
      site_id: siteId,
      site_name: first.siteName,
      vendor: first.vendor.charAt(0).toUpperCase() + first.vendor.slice(1),
      dor: dorMap[first.region] || 'DOR IDF',
      plaque: first.plaque,
      department: first.plaque.replace('DEPT_', ''),
      cell_count: cells.length,
      qoe_score_avg: avg(cells.map(c => c.qoe_score_avg)),
      p50_thr_dn_mbps: avg(cells.map(c => c.p50_thr_dn_mbps)),
      p50_thr_up_mbps: seededRand(siteId + 'thrup', 5, 40),
      dms_dl_3: avg(cells.map(c => c.dms_dl_3)),
      dms_dl_8: avg(cells.map(c => c.dms_dl_8)),
      dms_dl_30: avg(cells.map(c => c.dms_dl_30)),
      dms_ul_3: avg(cells.map(c => c.dms_ul_3)),
      coordinates: [avgLat, avgLng] as [number, number],
      cells,
    });
  });

  return sites;
}

let cachedSites: SiteSummary[] | null = null;

function getSites(): SiteSummary[] {
  if (!cachedSites) {
    cachedSites = buildSitesFromTopo();
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
    traffic_dn_bytes: seededRand(siteId + 'vol', 1e12, 8e12),
    traffic_up_bytes: seededRand(siteId + 'volup', 1e11, 2e12),
    p95_rtt_ms: seededRand(siteId + 'rtt', 20, 150),
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
  const sites = getSites();
  const vendors = [...new Set(sites.map(s => s.vendor))];
  const technos = [...new Set(sites.flatMap(s => s.cells.map(c => c.techno)))];
  const plaques = [...new Set(sites.map(s => s.plaque))];
  return Promise.resolve({
    vendor: vendors.map(v => ({ name: v, value: sites.filter(s => s.vendor === v).length })),
    technology: technos.map(t => ({ name: t, value: sites.flatMap(s => s.cells).filter(c => c.techno === t).length })),
    region: plaques.slice(0, 5).map(p => ({ name: p, qoe: rand(70, 95) })),
  });
}

export function fetchAlerts(_filters: Filters): Promise<Alert[]> {
  const severities: Alert['severity'][] = ['CRITIQUE', 'ELEVEE', 'MOYENNE', 'FAIBLE'];
  const statuses: Alert['status'][] = ['NEW', 'ACK', 'RESOLVED', 'FALSE_POSITIVE'];
  const sites = getSites();
  return Promise.resolve(
    Array.from({ length: 12 }, (_, i) => ({
      alert_id: `ALT-${String(i + 1).padStart(3, '0')}`,
      severity: severities[i % 4],
      scope_type: pick(['CELL', 'SITE', 'REGION']),
      scope_id: sites[i % sites.length].site_id,
      scope_name: sites[i % sites.length].site_name,
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
      name: `CELL_${getSites()[i % getSites().length].site_name}_S${i + 1}`,
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
  const sites = getSites();
  return Promise.resolve({
    total_traffic_gb: rand(5, 50),
    qoe_global: rand(65, 95),
    top_app: pick(['Netflix', 'YouTube', 'TikTok', 'Instagram']),
    sessions: Array.from({ length: 6 }, (_, i) => ({
      type: pick(['Streaming', 'Gaming', 'Web', 'Social']),
      cell: `CELL_${sites[i % sites.length].site_name}_S${randInt(1, 4)}`,
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
    case 'vendor': return [...new Set(getSites().map(s => s.vendor))];
    case 'dor': return [...new Set(getSites().map(s => s.dor))];
    case 'department': return [...new Set(getSites().map(s => s.department))];
    case 'plaque': return [...new Set(getSites().map(s => s.plaque))];
    case 'traffic_type': return ['Streaming', 'Gaming', 'Web', 'Social', 'Cloud'];
    case 'rat': return ['5G', '4G', '3G', '2G'];
    default: return Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
  }
}

// Generate features for map view
export function generateMapFeatures(sites: SiteSummary[]): GeoJSONFeature[] {
  const features: GeoJSONFeature[] = [];
  sites.forEach((s) => {
    s.cells.forEach((cell) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.coordinates[1], s.coordinates[0]] // [lng, lat]
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
