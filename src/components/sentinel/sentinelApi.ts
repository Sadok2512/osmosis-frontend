// ── Sentinel API Service ──
// Data calls → Parser :8000 (/api/v1/sentinel/*)
// AI analysis → Agent Layer :1000 (/orchestrator/stream)

import {
  DashboardOverviewData, Anomaly, AnomalySummary,
  KPIHistoryData, KPICompareData, ClusterData, ClusterMember,
  AnomalyFilters, SentinelDimension
} from './types';
import { getApiUrl, getApiHeaders, isLocalMode, getVpsProxyUrl, getVpsProxyHeaders } from '@/lib/apiConfig';

// ── Data fetch → Parser :8000 ──
async function fetchSentinel<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    // Route through getApiUrl which handles local/VPS/cloud routing
    // sentinel/* is a parser prefix → routes to :8000
    const url = getApiUrl(`sentinel/${path}`);
    const headers = getApiHeaders();

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`Sentinel API ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── 1. Available dates ──
export async function fetchDates(): Promise<string[]> {
  const raw = await fetchSentinel<any[]>('dates');
  if (Array.isArray(raw)) return raw.map(r => r.date || r);
  return [];
}

// ── 2. Dashboard overview ──
export async function fetchOverview(date: string): Promise<DashboardOverviewData> {
  const d = await fetchSentinel<any>(`overview?date=${date}`);
  return {
    date: d?.date || date,
    total_anomalies: d?.total_anomalies ?? 0,
    critical: d?.by_severity?.critical ?? 0,
    major: d?.by_severity?.major ?? 0,
    minor: d?.by_severity?.minor ?? 0,
    anomalies_by_type: d?.by_severity ?? {},
    anomalies_by_dimension: Array.isArray(d?.by_dimension) ? d.by_dimension : [],
    top_degraded: Array.isArray(d?.top_degraded) ? d.top_degraded : [],
  };
}

// ── 3. Anomaly list ──
export async function fetchAnomalies(filters: AnomalyFilters): Promise<Anomaly[]> {
  const params = new URLSearchParams();
  params.set('date', filters.date);
  if (filters.dimension) params.set('dimension', filters.dimension);
  if (filters.severity?.length) params.set('severity', filters.severity[0]);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.per_page) params.set('per_page', String(filters.per_page));

  const raw = await fetchSentinel<any>(`anomalies?${params}`);
  const items = raw?.items || raw?.anomalies || raw?.data || (Array.isArray(raw) ? raw : []);
  return items.map((a: any) => ({
    id: a.id || `${a.kpi_code}-${a.cell_name}-${a.ts}`,
    dimension_1: a.region || a.vendor || 'N/A',
    dimension_2: a.site_name || a.cell_name || 'N/A',
    anomaly_type: a.severity === 'critical' ? 'degradation_severe' : 'degradation',
    severity: a.severity || 'minor',
    kpi_name: a.kpi_code || '',
    current_value: a.current_value,
    reference_value: a.reference_value,
    deviation_pct: a.deviation_pct,
    z_score: a.z_score,
    detector: 'z-score',
    confidence: Math.min(1, Math.abs(a.z_score || 0) / 5),
    description: `${a.kpi_code}: z-score=${a.z_score}, deviation=${a.deviation_pct}%`,
    vendor: a.vendor,
    techno: a.techno,
    band: a.band,
  }));
}

// ── 4. Anomaly summary ──
export async function fetchAnomalySummary(date: string): Promise<AnomalySummary[]> {
  const raw = await fetchSentinel<any>(`anomalies/summary?date=${date}`);
  const sev = raw?.by_severity || {};
  return Object.entries(sev).map(([severity, count]) => ({
    severity,
    count: count as number,
  })) as AnomalySummary[];
}

// ── 5. KPI history ──
export async function fetchKPIHistory(
  dimension_1: string, dimension_2: string, kpi: string, days = 15
): Promise<KPIHistoryData> {
  const raw = await fetchSentinel<any>(
    `kpi/history?kpi=${encodeURIComponent(kpi)}&dimension_2=${encodeURIComponent(dimension_2)}&days=${days}`
  );
  return {
    kpi: raw?.kpi || kpi,
    dimension_2,
    data: (raw?.points || []).map((p: any) => ({
      date: p.ts || p.date,
      value: p.value,
      is_anomaly: p.is_anomaly || false,
    })),
  };
}

// ── 6. KPI compare ──
export async function fetchKPICompare(dimension_2: string, date: string): Promise<KPICompareData> {
  const raw = await fetchSentinel<any>(
    `kpi/compare?dimension_2=${encodeURIComponent(dimension_2)}&date=${date}`
  );
  return {
    scores: {
      debit: raw?.scores?.debit ?? 0,
      latence: raw?.scores?.latence ?? 0,
      loss: raw?.scores?.loss ?? 0,
      retr: raw?.scores?.retr ?? 0,
      stabilite: raw?.scores?.stabilite ?? 0,
      drop: raw?.scores?.drop ?? 0,
      dms: raw?.scores?.dms ?? 0,
    },
    qoe_composite: raw?.qoe_composite ?? 0,
    deltas_7j: raw?.deltas_7j ?? {},
    deltas_14j: raw?.deltas_14j ?? {},
    trends: raw?.trends ?? {},
    z_scores: raw?.z_scores ?? {},
  };
}

// ── 7. Clusters ──
export async function fetchClusters(date: string, dimension: SentinelDimension = 'Cellule'): Promise<ClusterData[]> {
  const dimMap: Record<string, string> = { 'Cellule': 'cell', 'Site': 'site', 'Vendor': 'vendor', 'DOR': 'region', 'Plaque': 'plaque' };
  const raw = await fetchSentinel<any>(`clusters?date=${date}&dimension=${dimMap[dimension] || 'site'}`);
  return (raw?.clusters || []).map((c: any, i: number) => ({
    cluster_id: i,
    cluster_label: c.label || c.id || `Cluster ${i}`,
    cluster_size: c.members?.length || 0,
    centroid: {
      score_debit: c.centroid?.score_debit ?? 0,
      score_latence: c.centroid?.score_latence ?? 0,
      score_loss: c.centroid?.score_loss ?? 0,
      score_retr: c.centroid?.score_retr ?? 0,
      score_stabilite: c.centroid?.score_stabilite ?? 0,
      score_drop: c.centroid?.score_drop ?? 0,
      score_dms: c.centroid?.score_dms ?? 0,
    },
    members: (c.members || []).map((m: any) => m.element || m.name || '').filter(Boolean),
  }));
}

// ── 8. Cluster members (delegated to clusters endpoint) ──
export async function fetchClusterMembers(
  clusterId: number, date: string, dimension: SentinelDimension = 'Cellule'
): Promise<ClusterMember[]> {
  const clusters = await fetchClusters(date, dimension);
  const cluster = clusters.find(c => c.cluster_id === clusterId);
  return (cluster?.members || []).map((memberName) => ({
    dimension_2: memberName,
    qoe_index: 0,
    debit_dl: 0,
    rtt_setup_avg: 0,
    loss_dl_rate: 0,
    cluster_label: cluster?.cluster_label || `Cluster ${clusterId}`,
    centroid_distance: 0,
  }));
}

// ── 9. Dimension values ──
export async function fetchDimensionValues(
  dimension: SentinelDimension, search?: string
): Promise<string[]> {
  const dimMap: Record<string, string> = { 'Cellule': 'cell', 'Site': 'site', 'Vendor': 'vendor', 'DOR': 'region', 'Plaque': 'plaque' };
  const params = new URLSearchParams({ dimension: dimMap[dimension] || dimension.toLowerCase() });
  if (search) params.set('search', search);
  const raw = await fetchSentinel<any>(`dimensions/values?${params}`);
  return raw?.values || (Array.isArray(raw) ? raw : []);
}
