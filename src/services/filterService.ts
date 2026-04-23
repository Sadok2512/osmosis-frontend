// ── Network Filter API Service ──
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import type { NetworkFilter } from '@/components/documentation/filterTypes';

interface FiltersResponse {
  filters: NetworkFilter[];
  total: number;
  limit: number;
  offset: number;
}

async function filterApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = getApiUrl(`filters/${path}`);
  const res = await fetch(url, {
    headers: getApiHeaders(),
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Filter API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function fetchFilters(params?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<FiltersResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return filterApi<FiltersResponse>(query ? `?${query}` : '');
}

export async function createFilter(data: {
  name: string;
  description?: string;
  status?: string;
  topology: any[];
  parameters: any[];
  logic: string;
}): Promise<NetworkFilter> {
  return filterApi<NetworkFilter>('', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFilter(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    status: string;
    permission: string;
    visibility: string;
    topology: any[];
    parameters: any[];
    logic: string;
  }>,
): Promise<NetworkFilter> {
  return filterApi<NetworkFilter>(id, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFilter(id: string): Promise<void> {
  await filterApi<any>(id, { method: 'DELETE' });
}

export async function duplicateFilter(id: string): Promise<NetworkFilter> {
  return filterApi<NetworkFilter>(`${id}/duplicate`, { method: 'POST' });
}

export interface MatchingCount {
  cells: number;
  sites: number;
  filter_id?: number;
  site_names?: string[];
}

export async function countMatching(topology: any[], parameters?: any[], includeSites = false): Promise<MatchingCount> {
  return filterApi<MatchingCount>('count', {
    method: 'POST',
    body: JSON.stringify({ topology, parameters: parameters || [], include_sites: includeSites }),
  });
}

export interface ParamSearchResult {
  parameters: string[];
}

export async function searchParameters(q: string, limit = 30): Promise<ParamSearchResult> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return filterApi<ParamSearchResult>(`param-search?${qs}`);
}

export interface ParamValuesResult {
  parameter: string;
  values: { value: string; count: number }[];
  total: number;
}

export async function getParameterValues(parameter: string): Promise<ParamValuesResult> {
  const qs = new URLSearchParams({ parameter });
  return filterApi<ParamValuesResult>(`param-values?${qs}`, { method: 'POST' });
}

export async function countFilterMatching(id: string): Promise<MatchingCount> {
  return filterApi<MatchingCount>(`${id}/count`, { method: 'POST' });
}

// ── Cluster / Saved Scope APIs ──

export interface ClusterSitesResult {
  filter_id: number;
  sites: string[];
  site_count: number;
}

export async function getClusterSites(id: string): Promise<ClusterSitesResult> {
  return filterApi<ClusterSitesResult>(`${id}/sites`);
}

export async function resolveClusterSites(id: string): Promise<ClusterSitesResult> {
  return filterApi<ClusterSitesResult>(`${id}/resolve-sites`, { method: 'POST' });
}

export async function fetchActiveClusters(): Promise<NetworkFilter[]> {
  const res = await fetchFilters({ status: 'active', limit: 100 });
  return res.filters;
}


export interface DimensionSearchResult {
  dimension: string;
  values: string[];
  total: number;
  truncated: boolean;
}

export async function searchDimensionValues(
  dimension: string,
  q: string,
  limit = 50,
): Promise<DimensionSearchResult> {
  const qs = new URLSearchParams({ dimension, q, limit: String(limit) });
  return filterApi<DimensionSearchResult>(`dimension-search?${qs}`);
}

export interface DimensionValidateResult {
  found: string[];
  not_found: string[];
}

export async function validateDimensionValues(
  dimension: string,
  values: string[],
): Promise<DimensionValidateResult> {
  const qs = new URLSearchParams({ dimension });
  return filterApi<DimensionValidateResult>(`dimension-validate?${qs}`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}
