/**
 * BI KPI Catalog service — fetches the catalog from the backend
 * (`/api/bi-catalog`) and falls back to the static catalog declared in
 * `biTypes.ts` if the backend is unreachable.
 */
import { getApiUrl, getApiHeaders, fetchVpsWithRetry } from '@/lib/apiConfig';
import { BI_KPI_CATALOG, BIKpiDefinition } from './biTypes';

let cache: BIKpiDefinition[] | null = null;
let inflight: Promise<BIKpiDefinition[]> | null = null;

export async function fetchBIKpiCatalog(force = false): Promise<BIKpiDefinition[]> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const url = getApiUrl('bi-catalog');
      const res = await fetchVpsWithRetry(url, { headers: getApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      if (items.length === 0 || json?.unavailable) {
        console.warn('[bi-catalog] empty/unavailable, using static fallback');
        cache = BI_KPI_CATALOG;
      } else {
        const normalized: BIKpiDefinition[] = items
          .filter((it: any) => it && typeof it.key === 'string')
          .map((it: any) => ({
            key: it.key,
            display_name: it.display_name || it.key,
            category: it.category || 'Other',
            unit: it.unit ?? '',
          }));
        cache = normalized;
        console.log(`[bi-catalog] loaded ${normalized.length} KPIs from backend (source=${json?.source})`);
      }
      return cache;
    } catch (err) {
      console.error('[bi-catalog] fetch failed, using static fallback:', err);
      cache = BI_KPI_CATALOG;
      return cache;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function getCachedBIKpiCatalog(): BIKpiDefinition[] {
  return cache || BI_KPI_CATALOG;
}
