// ── Sentinel API Service — calls FastAPI at localhost:8000 ──

import {
  DashboardOverviewData, Anomaly, AnomalySummary,
  KPIHistoryData, KPICompareData, ClusterData, ClusterMember,
  AnomalyFilters, SentinelDimension
} from './types';

const BASE = import.meta.env.VITE_SENTINEL_API_URL || 'http://localhost:1000';

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Sentinel API ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDates(): Promise<string[]> {
  const raw = await fetchJson<any>(`${BASE}/api/dates`);
  // Handle both array and wrapped object responses
  if (Array.isArray(raw)) return raw;
  if (raw?.dates && Array.isArray(raw.dates)) return raw.dates;
  return [];
}

export async function fetchOverview(date: string): Promise<DashboardOverviewData> {
  const raw = await fetchJson<any>(`${BASE}/api/dashboard/overview?date=${date}`);
  console.log('[Sentinel] fetchOverview raw:', JSON.stringify(raw).slice(0, 500));
  const d = raw?.data || raw?.overview || raw;
  // Normalize with safe defaults
  return {
    date: d?.date || date,
    total_anomalies: d?.total_anomalies ?? 0,
    critical: d?.critical ?? 0,
    major: d?.major ?? 0,
    minor: d?.minor ?? 0,
    anomalies_by_type: d?.anomalies_by_type ?? {},
    anomalies_by_dimension: Array.isArray(d?.anomalies_by_dimension) ? d.anomalies_by_dimension : [],
    top_degraded: Array.isArray(d?.top_degraded) ? d.top_degraded : [],
  };
}

export async function fetchAnomalies(filters: AnomalyFilters): Promise<Anomaly[]> {
  const params = new URLSearchParams();
  params.set('date', filters.date);
  if (filters.dimension) params.set('dimension', filters.dimension);
  if (filters.severity?.length) filters.severity.forEach(s => params.append('severity', s));
  if (filters.type?.length) filters.type.forEach(t => params.append('type', t));
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.per_page) params.set('per_page', String(filters.per_page));
  const raw = await fetchJson<any>(`${BASE}/api/anomalies?${params}`);
  console.log('[Sentinel] fetchAnomalies raw:', JSON.stringify(raw).slice(0, 500));
  if (Array.isArray(raw)) return raw;
  if (raw?.anomalies && Array.isArray(raw.anomalies)) return raw.anomalies;
  if (raw?.data && Array.isArray(raw.data)) return raw.data;
  if (raw?.items && Array.isArray(raw.items)) return raw.items;
  return [];
}

export async function fetchAnomalySummary(date: string): Promise<AnomalySummary[]> {
  const raw = await fetchJson<any>(`${BASE}/api/anomalies/summary?date=${date}`);
  if (Array.isArray(raw)) return raw;
  if (raw?.summary && Array.isArray(raw.summary)) return raw.summary;
  return [];
}

export async function fetchKPIHistory(
  dimension_1: string, dimension_2: string, kpi: string, days = 15
): Promise<KPIHistoryData> {
  return fetchJson<KPIHistoryData>(
    `${BASE}/api/kpi/history?dimension_1=${encodeURIComponent(dimension_1)}&dimension_2=${encodeURIComponent(dimension_2)}&kpi=${kpi}&days=${days}`
  );
}

export async function fetchKPICompare(dimension_2: string, date: string): Promise<KPICompareData> {
  return fetchJson<KPICompareData>(
    `${BASE}/api/kpi/compare?dimension_2=${encodeURIComponent(dimension_2)}&date=${date}`
  );
}

export async function fetchClusters(date: string, dimension: SentinelDimension = 'Cellule'): Promise<ClusterData[]> {
  const raw = await fetchJson<any>(`${BASE}/api/clusters?date=${date}&dimension=${dimension}`);
  if (Array.isArray(raw)) return raw;
  if (raw?.clusters && Array.isArray(raw.clusters)) return raw.clusters;
  return [];
}

export async function fetchClusterMembers(
  clusterId: number, date: string, dimension: SentinelDimension = 'Cellule'
): Promise<ClusterMember[]> {
  const raw = await fetchJson<any>(
    `${BASE}/api/clusters/${clusterId}/members?date=${date}&dimension=${dimension}`
  );
  if (Array.isArray(raw)) return raw;
  if (raw?.members && Array.isArray(raw.members)) return raw.members;
  return [];
}

export async function fetchDimensionValues(
  dimension: SentinelDimension, search?: string
): Promise<string[]> {
  const params = new URLSearchParams({ dimension });
  if (search) params.set('search', search);
  return fetchJson<string[]>(`${BASE}/api/dimensions/values?${params}`);
}
