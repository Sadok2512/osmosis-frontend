// ── Investigator API — Data from Parser :8000, AI from Agent :1000 ──

import { getApiUrl, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders, isLocalMode } from '@/lib/apiConfig';
import { DataPoint, WorstElement, KpiDefinition } from './types';

// ── Data calls → Parser :8000 (/api/v1/sentinel/*) ──
async function fetchData<T>(path: string): Promise<T> {
  const url = getApiUrl(`sentinel/${path}`);
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Fetch KPI catalog from KPI Engine :8001 ──
export async function fetchKpiDefinitions(): Promise<KpiDefinition[]> {
  const url = getApiUrl('monitor/catalog/kpis');
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).slice(0, 200).map((k: any, i: number) => ({
    id: k.kpi_key,
    label: k.display_name || k.kpi_key,
    unit: k.unit || '',
    category: k.category || 'Other',
    color: ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'][i % 10],
    thresholds: { warning: k.threshold_warning ?? 50, critical: k.threshold_critical ?? 20 },
    higherIsBetter: k.unit === '%' && !k.kpi_key.includes('drop') && !k.kpi_key.includes('loss') && !k.kpi_key.includes('dcr'),
  }));
}

// ── Fetch timeseries data ──
export async function fetchTimeSeriesData(
  kpiIds: string[],
  dateFrom: string,
  dateTo: string,
  granularity: string = '1h',
  splitBy?: string,
  filters?: { dimension: string; values: string[] }[]
): Promise<DataPoint[]> {
  const url = getApiUrl('monitor/query/timeseries');
  const body = {
    date_from: dateFrom,
    date_to: dateTo,
    granularity,
    selections: kpiIds.map(k => ({ kpi_key: k })),
    filters: (filters || []).map(f => ({ dimension: f.dimension, op: 'IN', values: f.values })),
    split_by: splitBy || null,
    top_n: 10,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.series || []).map((s: any) => ({
    timestamp: s.ts,
    kpi: s.kpi_key,
    value: s.value,
    splitValue: s.split_value === 'ALL' ? undefined : s.split_value,
  }));
}

// ── Fetch worst elements (top degraded) ──
export async function fetchWorstElements(
  kpiId: string,
  limit: number = 10,
  date?: string,
  dimension: string = 'site'
): Promise<WorstElement[]> {
  const params = new URLSearchParams({ dimension });
  if (date) params.set('date', date);

  const data = await fetchData<any>(`overview?${params}`);
  const items = data?.top_degraded || [];

  return items.slice(0, limit).map((item: any, i: number) => ({
    id: `elem_${i}`,
    name: item.cell_name || item.site_name || `Element ${i}`,
    dimension: item.site_name ? 'Site' : 'Cell',
    kpiValues: { [item.kpi_code]: item.kpi_value },
    trend: (item.z_score || 0) > 0 ? 'up' : 'down',
    severity: item.z_score && Math.abs(item.z_score) > 3 ? 'critical' : Math.abs(item.z_score) > 2 ? 'warning' : 'ok',
    region: item.region || '',
    vendor: item.vendor || '',
    technology: item.techno || '',
  }));
}

// ── Fetch histogram data ──
export async function fetchHistogramData(
  kpiId: string,
  date?: string,
  bins: number = 20
): Promise<{ bin: number; count: number; label: string }[]> {
  const params = new URLSearchParams({ kpi: kpiId });
  if (date) params.set('date', date);

  const data = await fetchData<any>(`kpi/compare?${params}`);
  const items = data?.items || [];

  if (items.length === 0) return [];

  // Build histogram from values
  const values = items.map((i: any) => i.current_value).filter((v: any) => v != null);
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binWidth = range / bins;

  const histogram = Array.from({ length: bins }, (_, i) => ({
    bin: +(min + i * binWidth).toFixed(2),
    count: 0,
    label: `${(min + i * binWidth).toFixed(1)}`,
  }));

  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
    histogram[idx].count++;
  }

  return histogram;
}

// ── Fetch breakdown by dimension ──
export async function fetchBreakdownData(
  kpiId: string,
  date?: string,
  dimension: string = 'vendor'
): Promise<{ name: string; value: number; color: string }[]> {
  const url = getApiUrl('monitor/query/timeseries');
  const body = {
    date_from: date || '2026-01-14',
    date_to: date || '2026-03-14',
    granularity: '1d',
    selections: [{ kpi_key: kpiId }],
    filters: [],
    split_by: dimension.toUpperCase(),
    top_n: 10,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();

  // Group by split_value and compute avg
  const groups: Record<string, number[]> = {};
  for (const s of (data.series || [])) {
    if (s.split_value === 'ALL') continue;
    if (!groups[s.split_value]) groups[s.split_value] = [];
    groups[s.split_value].push(s.value);
  }

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#84cc16'];
  return Object.entries(groups).map(([name, values], i) => ({
    name,
    value: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
    color: colors[i % colors.length],
  }));
}

// ── AI Investigation → Agent Layer :1000 ──
export async function startInvestigation(query: string): Promise<ReadableStream | null> {
  let url: string;
  let headers: Record<string, string>;

  if (isLocalMode()) {
    url = 'http://localhost:1000/orchestrator/stream';
    headers = { 'Content-Type': 'application/json', 'x-api-key': 'agent_secret_key' };
  } else {
    url = getVpsProxyUrl('agent', '/orchestrator/stream');
    headers = { ...getVpsProxyHeaders(), 'x-api-key': 'agent_secret_key' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, session_id: crypto.randomUUID() }),
  });

  if (!res.ok) throw new Error(`Agent ${res.status}`);
  return res.body;
}
