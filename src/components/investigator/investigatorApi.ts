// ── Investigator API — Data from Parser :8000, AI from Agent :1000 ──

import { getApiUrl, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders, isLocalMode } from '@/lib/apiConfig';
import { DataPoint, WorstElement, KpiDefinition } from './types';

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

// ── Fetch raw counter timeseries from Parser (fact_counters_15min) ──
async function fetchCounterTimeSeriesFallback(
  counterNames: string[],
  dateFrom: string,
  dateTo: string,
  granularity: string = '1d',
): Promise<DataPoint[]> {
  try {
    const url = getApiUrl('pm/counters/timeseries');
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.series || []).map((s: any) => ({
      timestamp: s.ts,
      kpi: s.counter,
      value: s.value,
    }));
  } catch { return []; }
}

// ── Fetch timeseries data (KPI Engine first, fallback to raw counters) ──
export async function fetchTimeSeriesData(
  kpiIds: string[],
  dateFrom: string,
  dateTo: string,
  granularity: string = '1h',
  splitBy?: string,
  filters?: { dimension: string; values: string[] }[],
  kpiLevel?: string,
  profileQci?: number | null,
  profileArp?: number | null,
  neighborType?: string | null,
): Promise<DataPoint[]> {
  const url = getApiUrl('monitor/query/timeseries');
  const allFilters = (filters || []).map(f => ({ dimension: f.dimension, op: 'IN', values: f.values }));

  // Add kpi_level filter
  if (kpiLevel && kpiLevel !== 'CELL') {
    allFilters.push({ dimension: 'KPI_LEVEL', op: 'IN', values: [kpiLevel] });
  }
  // Add profile dimension filters
  if (kpiLevel === 'PROFILE') {
    if (profileQci != null) allFilters.push({ dimension: 'QCI', op: 'IN', values: [String(profileQci)] });
    if (profileArp != null) allFilters.push({ dimension: 'ARP', op: 'IN', values: [String(profileArp)] });
  }
  // Add neighbor dimension filters
  if (kpiLevel === 'NEIGHBOR') {
    if (neighborType) allFilters.push({ dimension: 'NEIGHBOR_TYPE', op: 'IN', values: [neighborType] });
  }

  const body = {
    date_from: dateFrom,
    date_to: dateTo,
    granularity,
    selections: kpiIds.map(k => ({ kpi_key: k })),
    filters: allFilters,
    split_by: splitBy || null,
    top_n: 10,
    kpi_level: kpiLevel || 'CELL',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const kpiSeries = data.series || [];
  const noSplitRequested = !splitBy;

  const kpiResults: DataPoint[] = kpiSeries.map((s: any) => ({
    timestamp: s.ts,
    kpi: s.kpi_key,
    value: s.value,
    splitValue: noSplitRequested ? undefined : (s.split_value === 'ALL' ? undefined : s.split_value),
  }));

  // Identify which kpiIds returned no data from KPI Engine → try as raw counters
  const kpisWithData = new Set(kpiSeries.map((s: any) => s.kpi_key?.toLowerCase()));
  const missingKpis = kpiIds.filter(k => !kpisWithData.has(k.toLowerCase()));

  if (missingKpis.length > 0) {
    const counterResults = await fetchCounterTimeSeriesFallback(missingKpis, dateFrom, dateTo, granularity);
    return [...kpiResults, ...counterResults];
  }

  return kpiResults;
}

// ── Fetch worst cells using monitor/query/table with split_by=CELL ──
export async function fetchWorstElements(
  kpiIds: string[],
  limit: number = 10,
  dateFrom: string = '2026-01-01',
  dateTo: string = '2026-03-24',
  filters?: { dimension: string; op: string; values: string[] }[]
): Promise<WorstElement[]> {
  if (!kpiIds.length) return [];

  const url = getApiUrl('monitor/query/table');
  const body = {
    date_from: dateFrom,
    date_to: dateTo,
    filters: filters || [],
    kpi_keys: kpiIds,
    split_by: 'CELL',
    top_n: limit,
    page: 1,
    page_size: limit * kpiIds.length,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // Group rows by cell (split_value)
    const cellMap: Record<string, Record<string, number>> = {};
    for (const row of (data.rows || [])) {
      const cell = row.split_value;
      if (!cell || cell === 'ALL') continue;
      if (!cellMap[cell]) cellMap[cell] = {};
      cellMap[cell][row.kpi_key] = row.avg;
    }

    // Sort by first KPI ascending (worst first for success rates)
    const primaryKpi = kpiIds[0];
    const entries = Object.entries(cellMap);
    entries.sort((a, b) => (a[1][primaryKpi] ?? 999) - (b[1][primaryKpi] ?? 999));

    return entries.slice(0, limit).map(([cell, kpiValues], i) => {
      const primaryVal = kpiValues[primaryKpi] ?? 0;
      return {
        id: `worst_${i}`,
        name: cell,
        dimension: 'Cell',
        kpiValues,
        trend: 'stable' as const,
        severity: primaryVal < 90 ? 'critical' : primaryVal < 95 ? 'warning' : 'ok',
        region: '',
        vendor: '',
        technology: '',
      };
    });
  } catch (e) {
    console.error('[fetchWorstElements] Error:', e);
    return [];
  }
}

// ── Fetch worst elements grouped by DOR ──
export async function fetchWorstByDOR(
  kpiIds: string[],
  limit: number = 10,
  dateFrom: string = '2026-01-01',
  dateTo: string = '2026-03-24',
  filters?: { dimension: string; op: string; values: string[] }[]
): Promise<Record<string, WorstElement[]>> {
  if (!kpiIds.length) return {};

  // Get DOR values
  const dorUrl = getApiUrl('monitor/filters/values?dimension=DOR');
  let dors: string[] = [];
  try {
    const dorRes = await fetch(dorUrl, { headers: getApiHeaders() });
    if (dorRes.ok) {
      const dorData = await dorRes.json();
      dors = dorData.values || [];
    }
  } catch { /* fallback */ }

  if (dors.length === 0) {
    const all = await fetchWorstElements(kpiIds, limit, dateFrom, dateTo, filters);
    return { 'ALL': all };
  }

  // Fetch worst cells per DOR in parallel
  const results: Record<string, WorstElement[]> = {};
  await Promise.all(dors.map(async (dor) => {
    const dorFilter = { dimension: 'DOR', op: 'IN', values: [dor] };
    const combinedFilters = [...(filters || []), dorFilter];
    const elements = await fetchWorstElements(kpiIds, limit, dateFrom, dateTo, combinedFilters);
    if (elements.length > 0) results[dor] = elements;
  }));

  return results;
}

// ── Fetch filter values for a dimension ──
export async function fetchFilterValues(dimension: string): Promise<string[]> {
  const url = getApiUrl(`monitor/filters/values?dimension=${encodeURIComponent(dimension)}`);
  try {
    const res = await fetch(url, { headers: getApiHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.values || [];
  } catch {
    return [];
  }
}

// ── Fetch histogram data ──
export async function fetchHistogramData(
  kpiId: string,
  dateFrom: string = '2026-01-01',
  dateTo: string = '2026-03-24',
  bins: number = 20
): Promise<{ bin: number; count: number; label: string }[]> {
  const url = getApiUrl('monitor/query/table');
  const body = {
    date_from: dateFrom, date_to: dateTo, filters: [],
    kpi_keys: [kpiId], split_by: 'CELL', top_n: 200, page: 1, page_size: 200,
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
    if (!res.ok) return [];
    const data = await res.json();
    const values = (data.rows || []).map((r: any) => r.avg).filter((v: any) => v != null);
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const binWidth = range / bins;
    const histogram = Array.from({ length: bins }, (_, i) => ({
      bin: +(min + i * binWidth).toFixed(2), count: 0, label: `${(min + i * binWidth).toFixed(1)}`,
    }));
    for (const v of values) {
      const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
      histogram[idx].count++;
    }
    return histogram;
  } catch { return []; }
}

// ── Fetch breakdown by dimension ──
export async function fetchBreakdownData(
  kpiId: string,
  dateFrom: string = '2026-01-01',
  dateTo: string = '2026-03-24',
  dimension: string = 'vendor'
): Promise<{ name: string; value: number; color: string }[]> {
  const url = getApiUrl('monitor/query/timeseries');
  const body = {
    date_from: dateFrom, date_to: dateTo, granularity: '1d',
    selections: [{ kpi_key: kpiId }], filters: [], split_by: dimension.toUpperCase(), top_n: 10,
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
    if (!res.ok) return [];
    const data = await res.json();
    const groups: Record<string, number[]> = {};
    for (const s of (data.series || [])) {
      if (s.split_value === 'ALL') continue;
      if (!groups[s.split_value]) groups[s.split_value] = [];
      groups[s.split_value].push(s.value);
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#84cc16'];
    return Object.entries(groups).map(([name, values], i) => ({
      name, value: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2), color: colors[i % colors.length],
    }));
  } catch { return []; }
}

// ── AI Investigation → Agent Layer :1000 ──
export async function startInvestigation(query: string): Promise<ReadableStream | null> {
  let url: string;
  let headers: Record<string, string>;
  if (isLocalMode()) {
    url = getVpsProxyUrl('agent', '/orchestrator/stream');
    headers = { 'Content-Type': 'application/json', 'x-api-key': 'agent_secret_key' };
  } else {
    url = getVpsProxyUrl('agent', '/orchestrator/stream');
    headers = { ...getVpsProxyHeaders(), 'x-api-key': 'agent_secret_key' };
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query, session_id: crypto.randomUUID() }) });
  if (!res.ok) throw new Error(`Agent ${res.status}`);
  return res.body;
}

// ── Fetch cell details (metadata + active alarms) ──
export async function fetchCellDetails(
  cellNames: string[]
): Promise<any[]> {
  if (!cellNames.length) return [];
  const url = getApiUrl('alarms/cell-details');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ cell_names: cellNames }),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
