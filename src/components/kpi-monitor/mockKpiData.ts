import { KpiQueryRequest, KpiQueryResponse } from './types';

/**
 * Returns empty response — no more mock KPI time series.
 * The KPI Monitor will show "Aucune donnée" until connected to a real data source.
 */
export function generateMockTimeSeries(req: KpiQueryRequest): KpiQueryResponse {
  const gran = req.granularity === 'auto' ? '1d' : req.granularity;
  return { data: [], granularity_used: gran, total_series: 0, truncated: false };
}

export function generateMockSummary(_req: KpiQueryRequest): any[] {
  return [];
}
