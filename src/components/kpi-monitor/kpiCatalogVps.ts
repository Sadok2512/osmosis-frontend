import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import { supabase } from '@/integrations/supabase/client';
import type { KpiCatalogEntry } from './types';

function mapRawToEntry(k: any): KpiCatalogEntry {
  const techno = String(k.techno || '').toUpperCase();
  const techno_scope: KpiCatalogEntry['techno_scope'] =
    techno.includes('5G') && techno.includes('4G') ? 'both'
    : techno.includes('5G') ? '5G'
    : techno.includes('4G') || techno.includes('LTE') ? '4G'
    : 'both';

  return {
    kpi_id: String(k.kpi_key || k.kpi_code || k.id || ''),
    kpi_key: k.kpi_key || k.kpi_code || '',
    display_name: k.display_name || k.kpi_key || '',
    description: k.description || k.definition || '',
    techno_scope,
    unit: k.unit || '',
    value_type: (k.value_type as any) || 'gauge',
    default_agg: (k.default_agg as any) || 'avg',
    allowed_aggs: ['avg', 'min', 'max', 'sum'],
    numerator_counter: k.numerator || undefined,
    denominator_counter: k.denominator || undefined,
    formula_sql: k.formula_sql || undefined,
    is_map_supported: k.is_map_supported ?? false,
    thresholds:
      k.threshold_warning != null
        ? {
            warning: Number(k.threshold_warning),
            critical: k.threshold_critical != null ? Number(k.threshold_critical) : Number(k.threshold_warning) * 0.8,
          }
        : undefined,
    category: k.category || k.famille || 'Other',
    color: k.color || '#0f766e',
    vendor: k.vendor || undefined,
    techno: k.techno || undefined,
    supported_levels: Array.isArray(k.supported_levels) ? k.supported_levels : undefined,
    is_normalized: k.is_normalized ?? undefined,
    dimension_type: k.dimension_type ?? null,
    dimension_prefix: k.dimension_prefix ?? null,
  };
}

async function loadCatalogFromSupabase(): Promise<KpiCatalogEntry[]> {
  const { data, error } = await supabase.from('kpi_catalog').select('*').order('display_name');
  if (error) throw error;
  return (data || []).map(mapRawToEntry);
}

/**
 * Fetch the KPI catalog from the VPS backend (same source as the legacy
 * "Référentiel KPI Réseau" page). Falls back to Supabase `kpi_catalog`
 * if VPS is unavailable (cold-start, 502, network error) so the list
 * never disappears between refetches.
 */
export async function fetchKpiCatalogFromVps(): Promise<KpiCatalogEntry[]> {
  try {
    const url = getApiUrl('monitor/catalog/kpis');
    const res = await fetchVpsWithRetry(url, { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`VPS catalog fetch failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      const fallback = await loadCatalogFromSupabase().catch(() => [] as KpiCatalogEntry[]);
      return fallback;
    }
    return data.map(mapRawToEntry);
  } catch (err) {
    console.warn('[kpiCatalogVps] VPS unavailable, falling back to Supabase:', err);
    return loadCatalogFromSupabase();
  }
}

/**
 * Create a KPI in the VPS catalog. Reuses the same payload shape as the
 * legacy KPI catalog wizard so both reference pages stay compatible.
 */
export async function createKpiInVps(payload: Record<string, any>): Promise<any> {
  const url = getApiUrl('monitor/catalog/kpis');
  const res = await fetchVpsWithRetry(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.detail || error?.message || `VPS create failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Update a KPI in the VPS catalog. Mirrors DocumentationPage's
 * `monitorPut('catalog/kpis/:code')` flow.
 */
export async function updateKpiInVps(kpiCode: string, updates: Record<string, any>): Promise<boolean> {
  const url = getApiUrl(`monitor/catalog/kpis/${encodeURIComponent(kpiCode)}`);
  const res = await fetchVpsWithRetry(url, {
    method: 'PUT',
    headers: getApiHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`VPS update failed: ${res.status}`);
  }
  const json = await res.json().catch(() => ({}));
  return json?.status === 'updated' || json?.success === true || res.ok;
}
