// ── Sentinel API Service — calls FastAPI at localhost:8000 ──

import {
  DashboardOverviewData, Anomaly, AnomalySummary,
  KPIHistoryData, KPICompareData, ClusterData, ClusterMember,
  AnomalyFilters, SentinelDimension
} from './types';

const BASE = import.meta.env.VITE_SENTINEL_API_URL || 'http://localhost:3000';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sentinel API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchDates(): Promise<string[]> {
  return fetchJson<string[]>(`${BASE}/api/dates`);
}

export async function fetchOverview(date: string): Promise<DashboardOverviewData> {
  return fetchJson<DashboardOverviewData>(`${BASE}/api/dashboard/overview?date=${date}`);
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
  return fetchJson<Anomaly[]>(`${BASE}/api/anomalies?${params}`);
}

export async function fetchAnomalySummary(date: string): Promise<AnomalySummary[]> {
  return fetchJson<AnomalySummary[]>(`${BASE}/api/anomalies/summary?date=${date}`);
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
  return fetchJson<ClusterData[]>(`${BASE}/api/clusters?date=${date}&dimension=${dimension}`);
}

export async function fetchClusterMembers(
  clusterId: number, date: string, dimension: SentinelDimension = 'Cellule'
): Promise<ClusterMember[]> {
  return fetchJson<ClusterMember[]>(
    `${BASE}/api/clusters/${clusterId}/members?date=${date}&dimension=${dimension}`
  );
}

export async function fetchDimensionValues(
  dimension: SentinelDimension, search?: string
): Promise<string[]> {
  const params = new URLSearchParams({ dimension });
  if (search) params.set('search', search);
  return fetchJson<string[]>(`${BASE}/api/dimensions/values?${params}`);
}
