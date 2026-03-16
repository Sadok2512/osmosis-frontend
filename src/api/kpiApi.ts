import { request } from '@/api/httpClient';
import type {
  AnomalyItem,
  AnomalySummaryResponse,
  CellKpiSeriesResponse,
  Cluster,
  ComputeKpiResponse,
  KpiDefinitionsResponse,
  PaginatedResponse,
  PlaqueKpiResponse,
  SiteKpiResponse,
  TopDegradedItem,
} from '@/api/types';

export const kpiApi = {
  getCellKpiSeries: (cellName: string, params?: Record<string, unknown>) =>
    request<CellKpiSeriesResponse>('kpi', `kpi/cell/${encodeURIComponent(cellName)}`, { params }),
  getSiteKpis: (siteName: string, params?: Record<string, unknown>) =>
    request<SiteKpiResponse>('kpi', `kpi/site/${encodeURIComponent(siteName)}`, { params }),
  getPlaqueKpis: (plaqueName: string, params?: Record<string, unknown>) =>
    request<PlaqueKpiResponse>('kpi', `kpi/plaque/${encodeURIComponent(plaqueName)}`, { params }),
  computeLiveKpis: (body: { kpi_codes: string[]; cell_names: string[]; from_date: string; to_date: string; aggregation: string }) =>
    request<ComputeKpiResponse>('kpi', 'kpi/compute', { method: 'POST', body: JSON.stringify(body) }),
  getDefinitions: (params?: Record<string, unknown>) => request<KpiDefinitionsResponse>('kpi', 'kpi/definitions', { params }),
  getAnomalies: (params?: Record<string, unknown>) => request<PaginatedResponse<AnomalyItem>>('kpi', 'anomalies', { params }),
  getAnomalySummary: (params?: Record<string, unknown>) => request<AnomalySummaryResponse>('kpi', 'anomalies/summary', { params }),
  getTopDegraded: (params?: Record<string, unknown>) => request<TopDegradedItem[]>('kpi', 'anomalies/top-degraded', { params }),
  getClusters: () => request<Cluster[]>('kpi', 'clusters'),
  createCluster: (body: { cluster_name: string; cluster_type: string }) =>
    request<Cluster>('kpi', 'clusters', { method: 'POST', body: JSON.stringify(body) }),
  uploadClusterMembers: (clusterId: string | number, file: File, memberType: 'CELL' | 'SITE') => {
    const form = new FormData();
    form.append('file', file);
    form.append('member_type', memberType);
    return request<{ inserted: number; not_found: number; total_valid: number }>('kpi', `clusters/${clusterId}/upload`, {
      method: 'POST',
      body: form,
    });
  },
};
