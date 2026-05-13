import { VPS_ENDPOINTS, getApiHeaders } from '@/lib/apiConfig';
import type { DetectorPayload, DimensionOption, KpiOption } from './detectorBuilderTypes';

// ml-engine catalog endpoints live at :11002/api/v1/ml/*, exposed via the
// spa-proxy under /ml-api/* (apiConfig.VPS_ENDPOINTS.ml). All ODCC requests
// go straight there — bypass the kpi-engine fallback used elsewhere.
const ML_BASE = `${VPS_ENDPOINTS.ml}`;
function mlUrl(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${ML_BASE}/${clean}`;
}

const FALLBACK_KPIS: KpiOption[] = [
  { key: 'AVAILABILITY', label: 'AVAILABILITY' },
  { key: 'NEW_KPI', label: 'NEW_KPI' },
];

const FALLBACK_DIMENSIONS: DimensionOption[] = [
  { key: 'PLAQUE', label: 'Plaque', multiSelect: true, searchable: true },
  { key: 'SITE', label: 'Site', multiSelect: true, searchable: true },
  { key: 'CELL', label: 'Cell', multiSelect: true, searchable: true },
  { key: 'DOR', label: 'DOR', multiSelect: true, searchable: true },
  { key: 'ZONE_ARCEP', label: 'Zone ARCEP', multiSelect: true, searchable: true },
  { key: 'VENDOR', label: 'Vendor', multiSelect: true, searchable: true },
  { key: 'BAND', label: 'Band', multiSelect: true, searchable: true },
];

type JsonObject = Record<string, unknown>;

async function getJson<T>(path: string): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, { headers: getApiHeaders() });
  if (!response.ok) throw new Error(`GET ${url} failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function sendJson<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const url = mlUrl(path);
  const response = await fetch(url, {
    method,
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} failed (${response.status})`);
  return response.json() as Promise<T>;
}

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const object = value as JsonObject;
    for (const key of ['items', 'kpis', 'data', 'results', 'dimensions', 'values', 'holidays']) {
      if (Array.isArray(object[key])) return object[key] as unknown[];
    }
  }
  return [];
};

export function normalizeKpis(raw: unknown): KpiOption[] {
  const items = asArray(raw)
    .map((item): KpiOption | null => {
      if (typeof item === 'string') return { key: item, label: item };
      if (!item || typeof item !== 'object') return null;
      const object = item as JsonObject;
      const key = String(object.key ?? object.kpi_key ?? object.code ?? object.name ?? object.id ?? '').trim();
      if (!key) return null;
      return {
        key,
        label: String(object.label ?? object.display_name ?? object.name ?? key),
        unit: object.unit ? String(object.unit) : undefined,
      };
    })
    .filter((item): item is KpiOption => Boolean(item));
  return items.length ? items : FALLBACK_KPIS;
}

export function normalizeDimensions(raw: unknown): DimensionOption[] {
  const items = asArray(raw)
    .map((item): DimensionOption | null => {
      if (typeof item === 'string') return { key: item, label: item, multiSelect: true, searchable: true };
      if (!item || typeof item !== 'object') return null;
      const object = item as JsonObject;
      const key = String(object.key ?? object.dimension_key ?? object.code ?? object.name ?? object.id ?? '').trim();
      if (!key) return null;
      return {
        key,
        label: String(object.label ?? object.display_name ?? object.name ?? key),
        multiSelect: object.multiSelect === undefined ? true : Boolean(object.multiSelect),
        searchable: object.searchable === undefined ? true : Boolean(object.searchable),
      };
    })
    .filter((item): item is DimensionOption => Boolean(item));
  return items.length ? items : FALLBACK_DIMENSIONS;
}

export function normalizeValues(raw: unknown): string[] {
  return asArray(raw)
    .map(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (!item || typeof item !== 'object') return '';
      const object = item as JsonObject;
      return String(object.value ?? object.code ?? object.name ?? object.label ?? '').trim();
    })
    .filter(Boolean);
}

export async function fetchDetectorKpis(): Promise<KpiOption[]> {
  try {
    return normalizeKpis(await getJson<unknown>('kpis'));
  } catch (error) {
    console.warn('[ODCC] KPI catalog unavailable, using fallback placeholders', error);
    return FALLBACK_KPIS;
  }
}

export async function fetchDetectorDimensions(): Promise<DimensionOption[]> {
  try {
    return normalizeDimensions(await getJson<unknown>('dimensions'));
  } catch (error) {
    console.warn('[ODCC] Dimension catalog unavailable, using fallback placeholders', error);
    return FALLBACK_DIMENSIONS;
  }
}

export async function fetchDetectorDimensionValues(dimension: string): Promise<string[]> {
  if (!dimension) return [];
  try {
    return normalizeValues(await getJson<unknown>(`dimensions/${encodeURIComponent(dimension)}/values`));
  } catch (error) {
    console.warn(`[ODCC] Values unavailable for ${dimension}`, error);
    return [];
  }
}

export async function fetchDetectorHolidays(): Promise<string[]> {
  try {
    return normalizeValues(await getJson<unknown>('holidays'));
  } catch (error) {
    console.warn('[ODCC] Holiday API unavailable; holidays toggle remains as integration point', error);
    return [];
  }
}

export async function createDetectorPayload(payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>('detectors', 'POST', payload);
}

export async function updateDetectorPayload(detectorId: string, payload: DetectorPayload): Promise<unknown> {
  return sendJson<unknown>(`detectors/${encodeURIComponent(detectorId)}`, 'PUT', payload);
}
