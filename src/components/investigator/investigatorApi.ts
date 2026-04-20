// ── Investigator API — Data from Parser :8000, AI from Agent :1000 ──

import { getApiUrl, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders, isLocalMode, fetchWithTimeout, AGENT_API_KEY } from '@/lib/apiConfig';
import { DataPoint, WorstElement, KpiDefinition, GraphSlot, Granularity, normalizeGranularity } from './types';
import { worstFirstComparator, getKpiSeverity } from '@/utils/telecomHelpers';

/* ── Conditional logger: silent in production ── */
const IS_DEV = import.meta.env.DEV;
const log = (...args: unknown[]) => { if (IS_DEV) console.log(...args); };
const warn = (...args: unknown[]) => { if (IS_DEV) console.warn(...args); };

/* ── Dynamic date defaults (last 30 days) ── */
const defaultDateFrom = () => new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
const defaultDateTo = () => new Date().toISOString().split('T')[0];

/** Stable color from KPI key — deterministic hash so colors don't shift when catalog order changes */
const KPI_PALETTE = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'];
function stableKpiColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return KPI_PALETTE[Math.abs(hash) % KPI_PALETTE.length];
}

// ── Fetch KPI catalog from KPI Engine :8001 ──
export async function fetchKpiDefinitions(): Promise<KpiDefinition[]> {
  const url = getApiUrl('monitor/catalog/kpis');
  const res = await fetchWithTimeout(url, { headers: getApiHeaders() });
  if (!res.ok) return [];
  const raw = await res.json();
  const data = Array.isArray(raw) ? raw : (raw?.kpis || raw?.items || raw?.data || raw?.rows || []);
  return (data || []).slice(0, 5000).map((k: any) => ({
    id: k.kpi_key,
    label: k.display_name || k.kpi_key,
    unit: k.unit || '',
    category: k.category || 'Other',
    color: stableKpiColor(k.kpi_key || ''),
    thresholds: { warning: k.threshold_warning ?? 50, critical: k.threshold_critical ?? 20 },
    higherIsBetter: determineHigherIsBetter(k),
    orientation: k.orientation || null,
    dimension_type: k.dimension_type || null,
    dimension_prefix: k.dimension_prefix || null,
    counter_count: k.counter_count || 0,
  }));
}

/** Determine if higher values are better for a KPI based on metadata */
function determineHigherIsBetter(k: any): boolean {
  // Explicit orientation from backend
  if (k.orientation === 'higher_is_better') return true;
  if (k.orientation === 'lower_is_better') return false;

  const key = String(k.kpi_key || '').toLowerCase();
  const name = String(k.display_name || '').toLowerCase();

  // Patterns where LOWER is BETTER (higher is worse)
  const lowerIsBetterPatterns = [
    'drop', 'loss', 'fail', 'error', 'latency', 'rtt', 'delay', 'jitter',
    'retransmission', 'retr', 'reject', 'block', 'congestion', 'timeout',
    'dcr', 'cdr', 'rab_fail', 'ho_fail', 'paging_fail', 'rrc_fail',
    'outage', 'unavail', 'degrad',
  ];

  for (const pattern of lowerIsBetterPatterns) {
    if (key.includes(pattern) || name.includes(pattern)) return false;
  }

  // Default: higher is better (success rates, throughput, etc.)
  return true;
}

/** Detect if a split value represents a Network Element (Cell/Site) */
function detectNetworkElement(sv1?: string, sv2?: string, split1?: string, split2?: string): string | undefined {
  const NE_DIMS = ['CELL', 'SITE', 'NETWORK_ELEMENT', 'NE'];
  if (split1 && NE_DIMS.includes(split1.replace('PM_DIM:', '').toUpperCase()) && sv1) return sv1;
  if (split2 && NE_DIMS.includes(split2.replace('PM_DIM:', '').toUpperCase()) && sv2) return sv2;
  return undefined;
}

// ── Fetch KPI computed on-the-fly from Parser (formula applied in SQL) ──
async function fetchKpiComputeOnTheFly(
  kpiId: string,
  dateFrom: string,
  dateTo: string,
  granularity: string = '1d',
  filters?: { dimension: string; values: string[] }[],
  splitByPmDim?: string,
  splitByField?: string,
): Promise<{ data: DataPoint[]; isComputed: boolean }> {
  try {
    const url = getApiUrl('pm/kpi/compute');
    const body: any = {
      kpi_code: kpiId,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };
    // DEBUG: log full request details
    console.log('[DEBUG KpiCompute] url:', url, 'kpiId:', kpiId, 'splitByPmDim:', splitByPmDim, 'splitByField:', splitByField, 'filters:', JSON.stringify(filters));

    // Extract site/cell/dimension from filters — support multi-value.
    // Any filter whose dimension is not a structural field (SITE/CELL/VENDOR/TECH)
    // is treated as a PM dimension_filter passthrough. Values from the UI come already
    // formatted as "DIM=value" by /pm/counters/dimension-values, so no remapping is
    // needed — we just forward them straight to the compute endpoint.
    const STRUCTURAL_DIMS = new Set(['SITE', 'CELL', 'VENDOR', 'TECHNOLOGY', 'TECHNO', 'KPI_LEVEL', 'PLAQUE', 'DOR', 'DR', 'BAND', 'ZONE_ARCEP', 'ZONE ARCEP']);
    if (filters && filters.length > 0) {
      for (const f of filters) {
        const dim = (f.dimension || '').toUpperCase();
        if (dim === 'SITE' && f.values?.length) {
          body.site_name = f.values.length === 1 ? f.values[0] : f.values;
        } else if (dim === 'CELL' && f.values?.length) {
          body.cell_name = f.values.length === 1 ? f.values[0] : f.values;
        } else if (dim === 'VENDOR' && f.values?.length) {
          body.vendor = f.values[0];
        } else if ((dim === 'TECHNOLOGY' || dim === 'TECHNO') && f.values?.length) {
          // Don't send object_type when all 4 techs selected (equivalent to no filter)
          const ALL_TECHS = new Set(['2G', '3G', '4G', '5G']);
          const allSelected = f.values.length >= 4 && f.values.every(v => ALL_TECHS.has(v));
          if (!allSelected) {
            body.object_type = f.values.length === 1 ? f.values[0] : f.values;
          }
        } else if (dim === 'KPI_LEVEL') {
          /* ignore, handled by kpi engine */
        } else if (dim === 'PLAQUE' && f.values?.length) {
          body.plaque = f.values[0];
        } else if ((dim === 'DOR' || dim === 'DR') && f.values?.length) {
          body.dor = f.values[0];
        } else if (dim === 'BAND' && f.values?.length) {
          body.band = f.values[0];
        } else if (dim === 'ZONE_ARCEP' || dim === 'ZONE ARCEP') {
          /* zone arcep — skip */
        } else if (!STRUCTURAL_DIMS.has(dim) && f.values?.length) {
          // PM dimension passthrough — covers PMQAP, FLEX_*, NEIGHBOR, SLICE, 5QI,
          // RANSHARE, TRANSPORT, CA_REL, QCI_IDX, and any future dimension type.
          body.dimension_filter = f.values.length === 1 ? f.values[0] : f.values;
        }
      }
    }

    // Split by PM dimension: single query with GROUP BY dimension_key
    if (splitByPmDim && !body.dimension_filter) {
      log('[KpiCompute] Split by PM dimension:', splitByPmDim);
      try {
        // Fetch dimension labels for display
        const dimRes = await fetchWithTimeout(getApiUrl(`pm/counters/dimension-values?dimension_type=${splitByPmDim}&limit=50`), { headers: getApiHeaders() });
        const labelMap: Record<string, string> = {};
        if (dimRes.ok) {
          const dimData = await dimRes.json();
          for (const dv of (dimData.labeled_values || [])) {
            if (typeof dv === 'object') labelMap[dv.value] = dv.label;
          }
        }

        // Single request with split_by_dimension=true (+ optional double split field)
        const splitBody: any = { ...body, split_by_dimension: true };
        if (splitByField) splitBody.split_by_field = splitByField;
        console.log('[DEBUG KpiCompute] PM_DIM split request body:', JSON.stringify(splitBody, null, 2));
        const splitRes = await fetchWithTimeout(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(splitBody) });
        if (splitRes.ok) {
          const splitResult = await splitRes.json();
          if (!splitResult.error && splitResult.series?.length > 0) {
            const allData: DataPoint[] = [];
            for (const s of splitResult.series) {
              const dimKey = s.dimension_key || '';
              const dimLabel = labelMap[dimKey] || dimKey;
              const splitField = s.split_field || undefined;
              // If no dimension_key (fallback from non-dimensioned counters), use plain kpiId
              const kpiKey = dimLabel ? `${kpiId}@${dimLabel}` : kpiId;
              const dp: any = { timestamp: s.ts, kpi: kpiKey, value: s.kpi_value, splitValue: dimLabel || undefined, _isComputed: true };
              if (splitField) dp.splitValue2 = splitField;
              allData.push(dp);
            }
            if (allData.length > 0) return { data: allData, isComputed: true };
          } else {
            warn('[KpiCompute] Split by dimension returned 0 series for', kpiId, '— falling back to aggregated query');
          }
        }
      } catch (e) { warn('[KpiCompute] Split failed:', e); }
    }

    // Split by field only (Cell/Site) without PM dimension
    if (!splitByPmDim && splitByField) {
      log('[KpiCompute] Split by field only:', splitByField);
      try {
        const splitBody: any = { ...body, split_by_field: splitByField };
        console.log('[DEBUG KpiCompute] FIELD split request body:', JSON.stringify(splitBody, null, 2));
        const splitRes = await fetchWithTimeout(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(splitBody) });
        if (splitRes.ok) {
          const splitResult = await splitRes.json();
          if (!splitResult.error && splitResult.series?.length > 0) {
            const allData: DataPoint[] = [];
            for (const s of splitResult.series) {
              const fieldVal = s.split_field || s.ne_name || s.cell_name || s.site_name || '';
              const dp: DataPoint = {
                timestamp: s.ts,
                kpi: fieldVal ? `${kpiId}@${fieldVal}` : kpiId,
                value: s.kpi_value,
                splitValue: fieldVal || undefined,
                networkElement: fieldVal || undefined,
              };
              allData.push(dp);
            }
            if (allData.length > 0) return { data: allData, isComputed: true };
          } else {
            warn('[KpiCompute] Split by field returned 0 series for', kpiId);
          }
        }
      } catch (e) { warn('[KpiCompute] Field split failed:', e); }
    }

    log('[KpiCompute] Request:', kpiId, 'filters:', JSON.stringify(filters), 'body:', JSON.stringify(body));
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      warn('[KpiCompute] Failed:', res.status);
      // Try with shorter date range (reduce load)
      return { data: [], isComputed: false };
    }

    const result = await res.json();
    if (result.error) {
      warn('[KpiCompute] Error:', result.error, '— retrying with 1h granularity');
      // Retry with hourly granularity (faster query)
      if (granularity !== '1h') {
        const retryBody = { ...body, granularity: '1h' };
        try {
          const retryRes = await fetchWithTimeout(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(retryBody) });
          if (retryRes.ok) {
            const retryResult = await retryRes.json();
            if (!retryResult.error && retryResult.series?.length > 0) {
              log('[KpiCompute] Retry succeeded with 1h');
              return {
                data: retryResult.series.map((s: any) => ({ timestamp: s.ts, kpi: kpiId, value: s.kpi_value, _isComputed: true })),
                isComputed: true,
              };
            }
          }
        } catch (retryErr) { warn('[KpiCompute] Retry failed:', retryErr); }
      }
      return { data: [], isComputed: false };
    }

    const series = (result.series || []).map((s: any) => ({
      timestamp: s.ts,
      kpi: kpiId,
      value: s.kpi_value,
      _isComputed: true,
    }));

    log('[KpiCompute] Result:', kpiId, series.length, 'points, formula:', result.formula_display?.substring(0, 60));
    return { data: series, isComputed: series.length > 0 };
  } catch (e) {
    warn('[KpiCompute] Exception:', e);
    return { data: [], isComputed: false };
  }
}

// ── Fetch raw counter timeseries from Parser (fact_counters_15min) ──
// Bug #3 fix: accept and forward the same filter context as the KPI request
async function fetchCounterTimeSeriesFallback(
  counterNames: string[],
  dateFrom: string,
  dateTo: string,
  granularity: string = '1d',
  splitBy?: string,
  filters?: { dimension: string; values: string[] }[],
  splitByField?: string,
): Promise<{ data: DataPoint[]; isUnfiltered: boolean }> {
  const normalizeRawSeries = (rawSeries: any[], fallbackSplitField?: string): DataPoint[] =>
    rawSeries.map((s: any) => ({
      timestamp: s.ts || s.timestamp || s.date,
      kpi: (s.dimension_key ? s.counter_id : undefined) || s.counter_id || s.counter || s.kpi || s.counter_name || s.kpi_key || counterNames[0],
      value: s.value ?? s.kpi_value ?? s.val,
      splitValue: s.dimension_key || s.split_value || s.split_field || s[fallbackSplitField || ''] || undefined,
      splitValue2: s.split_field || s[fallbackSplitField || ''] || undefined,
      networkElement: s.split_field || s[fallbackSplitField || ''] || undefined,
      _isRawFallback: true,
    }));

  try {
    const url = getApiUrl('pm/counters/timeseries');
    const body: any = {
      counter_names: counterNames,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };

    const splitByPmDim = splitBy?.startsWith('PM_DIM:');
    if (splitByPmDim) body.split_by_dimension = true;
    if (splitByField) body.split_by_field = splitByField;

    const STRUCTURAL_DIMS = new Set(['SITE', 'CELL', 'VENDOR', 'TECHNOLOGY', 'TECHNO', 'KPI_LEVEL', 'PLAQUE', 'DOR', 'DR', 'BAND', 'ZONE_ARCEP', 'ZONE ARCEP']);
    if (filters && filters.length > 0) {
      const dimFilterValues: string[] = [];
      for (const f of filters) {
        const dim = (f.dimension || '').toUpperCase();
        if (dim === 'SITE' && f.values?.length) {
          body.site_name = f.values.length === 1 ? f.values[0] : f.values;
        } else if (dim === 'CELL' && f.values?.length) {
          body.cell_name = f.values.length === 1 ? f.values[0] : f.values;
        } else if ((dim === 'TECHNO' || dim === 'TECHNOLOGY') && f.values?.length) {
          const ALL_TECHS = new Set(['2G', '3G', '4G', '5G']);
          const allSelected = f.values.length >= 4 && f.values.every(v => ALL_TECHS.has(v));
          if (!allSelected) {
            body.object_type = f.values.length === 1 ? f.values[0] : f.values;
          }
        } else if (dim === 'VENDOR' && f.values?.length) {
          body.vendor = f.values[0];
        } else if (dim === 'KPI_LEVEL') {
          /* ignore */
        } else if (dim === 'PLAQUE' && f.values?.length) {
          body.plaque = f.values[0];
        } else if ((dim === 'DOR' || dim === 'DR') && f.values?.length) {
          body.dor = f.values[0];
        } else if (dim === 'BAND' && f.values?.length) {
          body.band = f.values[0];
        } else if (dim === 'ZONE_ARCEP' || dim === 'ZONE ARCEP') {
          /* zone arcep — skip for now */
        } else if (!STRUCTURAL_DIMS.has(dim) && f.values?.length) {
          dimFilterValues.push(...f.values);
        }
      }
      if (dimFilterValues.length > 0) body.dimension_filter = dimFilterValues;
    }

    const executeRequest = async (requestBody: any, forcedSplitField?: string) => {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(requestBody),
      });

      log('[CounterFallback] Response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        warn('[CounterFallback] Failed:', res.status, errorText);
        return { ok: false, status: res.status, errorText, rawSeries: [] as any[] };
      }

      const data = await res.json();
      log('[CounterFallback] Response keys:', Object.keys(data), 'series count:', (data.series || []).length, 'data count:', (data.data || []).length);
      const rawSeries = (data.series || data.data || data.timeseries || []).map((s: any) => ({
        ...s,
        ...(forcedSplitField && !s.split_field ? { split_field: s[forcedSplitField] || requestBody[forcedSplitField] } : {}),
      }));
      return { ok: true, status: res.status, errorText: '', rawSeries };
    };

    const fanOutField = Array.isArray(body.site_name) && body.site_name.length > 1
      ? 'site_name'
      : Array.isArray(body.cell_name) && body.cell_name.length > 1
        ? 'cell_name'
        : null;

    if (fanOutField) {
      const fanOutValues = body[fanOutField] as string[];
      log('[CounterFallback] Fan-out request on', fanOutField, fanOutValues);
      const results = await Promise.all(
        fanOutValues.map((value) =>
          executeRequest(
            { ...body, [fanOutField]: value },
            splitByField === fanOutField ? fanOutField : undefined,
          )
        )
      );
      const mergedSeries = results.flatMap((result) => result.rawSeries);
      return {
        data: normalizeRawSeries(mergedSeries, splitByField === fanOutField ? fanOutField : undefined),
        isUnfiltered: false,
      };
    }

    log('[CounterFallback] Request:', url, JSON.stringify(body));
    const result = await executeRequest(body, splitByField);
    if (!result.ok) {
      if (result.status === 400 || result.status === 422) {
        const fallbackRes = await fetchWithTimeout(url, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity }),
        });
        if (!fallbackRes.ok) return { data: [], isUnfiltered: true };
        const fallbackData = await fallbackRes.json();
        return {
          data: (fallbackData.series || []).map((s: any) => ({
            timestamp: s.ts,
            kpi: s.counter,
            value: s.value,
            _isRawFallback: true,
            _isUnfiltered: true,
          })),
          isUnfiltered: true,
        };
      }
      return { data: [], isUnfiltered: false };
    }

    return {
      data: normalizeRawSeries(result.rawSeries, splitByField),
      isUnfiltered: false,
    };
  } catch (e) {
    warn('[CounterFallback] Exception:', e);
    return { data: [], isUnfiltered: false };
  }
}

// ── Build request for a single slot (Bug #2 fix: slot-level overrides) ──
interface SlotRequestContext {
  kpiIds: string[];
  dateFrom: string;
  dateTo: string;
  granularity: string;
  splitBy?: string;
  splitBy2?: string;
  splitByPerKpi?: Record<string, string>;
  filters: { dimension: string; values: string[] }[];
  kpiLevel: string;
  profileQci?: number | null;
  profileArp?: number | null;
  neighborType?: string | null;
}


/** Resolve a slot's effective request context, with filters isolated per slot */
export function resolveSlotContext(
  slot: GraphSlot,
  globalState: {
    startDate: string;
    endDate: string;
    granularity: Granularity;
    splitBy: string;
    filters: Record<string, string[]>;
    kpiLevel: string;
    profileQci?: number | null;
    profileArp?: number | null;
    neighborType?: string | null;
  },
): SlotRequestContext {
  // Slot-level overrides (use slot values if non-empty, otherwise global)
  // Ensure empty-string slot dates don't skip the global date; trim whitespace too
  const defaultTo = new Date().toISOString().split('T')[0];
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const rawFrom = (slot.startDate && slot.startDate.trim()) || (globalState.startDate && globalState.startDate.trim()) || defaultFrom;
  const rawTo = (slot.endDate && slot.endDate.trim()) || (globalState.endDate && globalState.endDate.trim()) || defaultTo;
  const gran = normalizeGranularity(slot.granularity || globalState.granularity);
  // For fine granularity, keep full datetime; for daily/weekly, date-only is fine
  // Ensure datetime always has seconds (ClickHouse requires T00:00:00 format)
  const ensureSeconds = (dt: string) => {
    if (/T\d{2}:\d{2}$/.test(dt)) return dt + ':00';
    if (!dt.includes('T')) return dt + 'T00:00:00';
    return dt;
  };
  const dateFrom = (gran === '15min' || gran === '1h') ? ensureSeconds(rawFrom) : rawFrom.split('T')[0];
  const dateTo = (gran === '15min' || gran === '1h') ? ensureSeconds(rawTo) : rawTo.split('T')[0];

  // Split: per-KPI split takes ABSOLUTE priority, then slot-level, then global
  // Per-KPI splits are the source of truth — global splitBy should NOT override them
  // VENDOR and TECHNOLOGY are perimeter filters, never valid as split dimensions
  const PERIMETER_DIMENSIONS = ['VENDOR', 'TECHNOLOGY', 'vendor', 'technology', 'Vendor', 'Technology'];
  const isPerimeterDim = (v: string) => PERIMETER_DIMENSIONS.includes(v);

  let splitValue: string | undefined;
  const perKpi = slot.config?.splitByPerKpi || {};
  const perKpiValues = Object.values(perKpi).filter(v => v && v !== 'None');
  const hasPerKpiSplits = Object.keys(perKpi).length > 0;

  if (perKpiValues.length > 0) {
    // Use the first active per-KPI split (PM_DIM splits get priority)
    const activePmSplit = perKpiValues.find(v => v!.startsWith('PM_DIM:'));
    splitValue = activePmSplit || perKpiValues[0]!;
  } else if (slot.splitBy && slot.splitBy !== 'None' && !isPerimeterDim(slot.splitBy)) {
    splitValue = slot.splitBy;
  } else if (slot.splitBy === 'None') {
    // Slot explicitly set to "None" → no split, do NOT fall back to global
    splitValue = undefined;
  } else if (!hasPerKpiSplits && globalState.splitBy && globalState.splitBy !== 'None' && !isPerimeterDim(globalState.splitBy)) {
    // Only use global fallback if slot has NO explicit split choice and NO per-KPI splits configured
    splitValue = globalState.splitBy;
  }

  // Split 2 (cross-tabulation)
  let splitValue2: string | undefined;
  const perKpi2 = slot.config?.splitByPerKpi2 || {};
  const activeSplit2 = Object.values(perKpi2).find(v => v && v !== 'None');
  if (activeSplit2) {
    splitValue2 = activeSplit2;
  } else if (slot.splitBy2 && slot.splitBy2 !== 'None') {
    splitValue2 = slot.splitBy2;
  }

  // PM split compatibility: if the only active split is stored in split 2,
  // promote it to the primary split so PM compute can actually return series.
  if (!splitValue && splitValue2?.startsWith('PM_DIM:')) {
    splitValue = splitValue2;
    splitValue2 = undefined;
  }

  // Filters are isolated per slot; global filters are only a template for slot creation.
  const mergedFilters: Record<string, string[]> = { ...(slot.filters || {}) };
  const activeFilters = Object.entries(mergedFilters)
    .filter(([, vals]) => vals.length > 0)
    .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }));

  log('[resolveSlotContext]', { kpis: slot.kpiIds, splitBy: splitValue, splitBy2: splitValue2, filters: activeFilters });

  return {
    kpiIds: slot.kpiIds,
    dateFrom,
    dateTo,
    granularity: gran,
    splitBy: splitValue,
    splitBy2: splitValue2,
    splitByPerKpi: perKpi,
    filters: activeFilters,
    kpiLevel: globalState.kpiLevel,
    profileQci: globalState.profileQci,
    profileArp: globalState.profileArp,
    neighborType: globalState.neighborType,
  };
}

// ── Dedup cache to prevent 6x identical requests (bounded LRU, max 50 entries) ──
const CACHE_MAX = 50;
const _computeCache = new Map<string, Promise<{ data: DataPoint[]; isComputed: boolean }>>();
function cacheSet(key: string, value: Promise<{ data: DataPoint[]; isComputed: boolean }>) {
  if (_computeCache.size >= CACHE_MAX) {
    // Evict oldest entry (first key in Map insertion order)
    const oldest = _computeCache.keys().next().value;
    if (oldest !== undefined) _computeCache.delete(oldest);
  }
  _computeCache.set(key, value);
}

// ── Fetch timeseries data per-slot ──
// Strategy: call /kpi/compute FIRST (on-the-fly, always has data)
export async function fetchTimeSeriesForSlot(
  ctx: SlotRequestContext,
): Promise<{ data: DataPoint[]; hasUnfilteredFallback: boolean }> {
  if (ctx.kpiIds.length === 0) return { data: [], hasUnfilteredFallback: false };

  // Extract Network Element from filters (cell > site)
  const neFromFilters = (() => {
    for (const f of (ctx.filters || [])) {
      const dim = (f.dimension || '').toUpperCase();
      if (dim === 'CELL' && f.values?.length === 1) return f.values[0];
    }
    for (const f of (ctx.filters || [])) {
      const dim = (f.dimension || '').toUpperCase();
      if (dim === 'SITE' && f.values?.length === 1) return f.values[0];
    }
    return undefined;
  })();

  log('[fetchTimeSeriesForSlot] ctx:', { kpis: ctx.kpiIds, splitBy: ctx.splitBy, splitByPerKpi: ctx.splitByPerKpi, filters: ctx.filters, gran: ctx.granularity, dateFrom: ctx.dateFrom, dateTo: ctx.dateTo, neFromFilters });

  // Detect PM and non-PM splits
  const globalPmDimSplit = ctx.splitBy?.startsWith('PM_DIM:') ? ctx.splitBy.replace('PM_DIM:', '') : undefined;
  const hasNonPmSplit1 = ctx.splitBy && !ctx.splitBy.startsWith('PM_DIM:') && ctx.splitBy !== 'None';
  const pmDimSplit2 = ctx.splitBy2?.startsWith('PM_DIM:') ? ctx.splitBy2.replace('PM_DIM:', '') : undefined;
  const hasNonPmSplit2 = ctx.splitBy2 && !ctx.splitBy2.startsWith('PM_DIM:') && ctx.splitBy2 !== 'None';
  log('[fetchTimeSeriesForSlot] globalPmDimSplit:', globalPmDimSplit, 'hasNonPmSplit1:', hasNonPmSplit1, 'splitBy2:', ctx.splitBy2);

  // Double split: detect if one split is PM and the other is a field (cell_name, site_name).
  // Compute can handle: PM_DIM split + split_by_field (e.g. PMQAP + cell_name).
  // Cell → cell_name (Ericsson has proper cell_name after the parser fix).
  // Nokia pm_15m still has empty cell_name; those splits will show only the ENB until
  // the Nokia-specific pm_15m_enriched path is wired in.
  const FIELD_MAP: Record<string, string> = { 'Cell': 'cell_name', 'CELL': 'cell_name', 'Site': 'site_name', 'SITE': 'site_name' };
  let computeSplitByField: string | undefined;
  let computePmDim: string | undefined;

  if (globalPmDimSplit && hasNonPmSplit2) {
    // Split1=PM, Split2=Cell/Site → compute can do both
    computePmDim = globalPmDimSplit;
    computeSplitByField = FIELD_MAP[ctx.splitBy2!] || undefined;
  } else if (hasNonPmSplit1 && pmDimSplit2) {
    // Split1=Cell/Site, Split2=PM → swap for compute (PM as dimension, field as split_by_field)
    computePmDim = pmDimSplit2;
    computeSplitByField = FIELD_MAP[ctx.splitBy!] || undefined;
  } else if (globalPmDimSplit) {
    computePmDim = globalPmDimSplit;
  } else if (hasNonPmSplit1 && FIELD_MAP[ctx.splitBy!]) {
    // Split1=Cell/Site only (no PM split) → compute with split_by_field alone
    computeSplitByField = FIELD_MAP[ctx.splitBy!];
    // If Split2 is also a field-mappable dimension, store it for second field split
    if (hasNonPmSplit2 && FIELD_MAP[ctx.splitBy2!]) {
      // Both splits are field-mappable — compute can't do two field splits,
      // but we handle the primary one; KPI Engine handles Split2
    }
  }

  // Can compute handle this? Only if there's no non-PM split without a field mapping
  const canCompute = !hasNonPmSplit1 || !!computeSplitByField;
  log('[fetchTimeSeriesForSlot] computePmDim:', computePmDim, 'computeSplitByField:', computeSplitByField, 'canCompute:', canCompute);

  // Fast path: detect raw PM counters and route directly to counter fallback
  // (avoids 3-4 wasted HTTP calls through KPI compute + KPI Engine)
  // Note: Flex_ prefix is used by Nokia KPI definitions (e.g. Flex_ERAB_ADD_INIT_SETUP_ATT)
  // so we do NOT include Flex_ here — those need /kpi/compute for formula resolution
  const RAW_COUNTER_RE = /^(M\d{2,}C\d|pm[A-Z])/;
  const rawCounterIds = ctx.kpiIds.filter(id => RAW_COUNTER_RE.test(id));
  const kpiOnlyIds = ctx.kpiIds.filter(id => !RAW_COUNTER_RE.test(id));

  if (rawCounterIds.length > 0 && kpiOnlyIds.length === 0) {
    // ALL items are raw counters — skip compute + KPI Engine entirely
    log('[Investigator] Fast path: all raw counters, using counter fallback directly:', rawCounterIds);
    const fallback = await fetchCounterTimeSeriesFallback(
      rawCounterIds, ctx.dateFrom, ctx.dateTo, ctx.granularity,
      ctx.splitBy, ctx.filters, computeSplitByField,
    );
    const allData = fallback.data;
    if (neFromFilters) allData.forEach(d => { if (!d.networkElement) d.networkElement = neFromFilters; });
    return { data: allData, hasUnfilteredFallback: false };
  }

  // Step 1: Try /kpi/compute FIRST — SEQUENTIAL, one KPI at a time
  const computeResults: DataPoint[] = [];
  const computeFailed: string[] = [];

  if (canCompute) {
    for (const kpiId of ctx.kpiIds) {
      // Per-KPI PM dimension split
      const perKpiSplit = ctx.splitByPerKpi?.[kpiId];
      const perKpiSplit2 = (ctx as any).splitByPerKpi2?.[kpiId];
      const kpiPmDim = perKpiSplit?.startsWith('PM_DIM:') ? perKpiSplit.replace('PM_DIM:', '') : undefined;
      const kpiPmDim2 = perKpiSplit2?.startsWith('PM_DIM:') ? perKpiSplit2.replace('PM_DIM:', '') : undefined;
      // Per-KPI field split (Cell/Site) — when user picks Cell/Site as per-KPI split,
      // it lands in splitByPerKpi (not in slot.splitBy), so derive the field here.
      const perKpiField =
        (perKpiSplit && !perKpiSplit.startsWith('PM_DIM:') && FIELD_MAP[perKpiSplit]) ||
        (perKpiSplit2 && !perKpiSplit2.startsWith('PM_DIM:') && FIELD_MAP[perKpiSplit2]) ||
        undefined;
      const pmDimSplit = kpiPmDim || kpiPmDim2 || (perKpiSplit ? undefined : computePmDim);
      const fieldSplit = perKpiField || computeSplitByField;

      const cacheKey = `${kpiId}|${ctx.dateFrom}|${ctx.dateTo}|${ctx.granularity}|${JSON.stringify(ctx.filters)}|${pmDimSplit || ''}|${fieldSplit || ''}`;

      // Sequential: do NOT pre-create promises — execute one at a time
      let computed: { data: DataPoint[]; isComputed: boolean };
      if (_computeCache.has(cacheKey)) {
        computed = await _computeCache.get(cacheKey)!;
      } else {
        const queryStart = Date.now();
        log('[Pipeline] Step 1 PM Compute START:', kpiId);
        const promise = fetchKpiComputeOnTheFly(
          kpiId, ctx.dateFrom, ctx.dateTo, ctx.granularity, ctx.filters, pmDimSplit, computeSplitByField,
        );
        cacheSet(cacheKey, promise);
        computed = await promise;
        // Evict after settle — not while pending
        setTimeout(() => _computeCache.delete(cacheKey), 30000);
        log('[Pipeline] Step 1 PM Compute END:', kpiId, {
          duration: `${Date.now() - queryStart}ms`,
          points: computed.data.length,
          status: computed.isComputed ? 'success' : 'no_data',
        });
      }

      if (computed.isComputed) {
        computeResults.push(...computed.data);
      } else {
        computeFailed.push(kpiId);
      }
    }

    // If all KPIs computed successfully, return directly (skip KPI Engine)
    if (computeFailed.length === 0 && computeResults.length > 0) {
      log('[Investigator] All KPIs computed on-the-fly:', computeResults.length, 'points');
      // Inject NE from filters if not already set
      if (neFromFilters) computeResults.forEach(d => { if (!d.networkElement) d.networkElement = neFromFilters; });
      return { data: computeResults, hasUnfilteredFallback: false };
    }
  } else {
    // Can't compute: all KPIs must go through KPI Engine
    computeFailed.push(...ctx.kpiIds);
  }

  // Step 2: Fall back to KPI Engine for KPIs that failed compute — SEQUENTIAL
  const url = getApiUrl('monitor/query/timeseries');
  const allFilters = ctx.filters.map(f => ({ dimension: f.dimension, op: 'IN', values: f.values }));

  // Add kpi_level filter
  if (ctx.kpiLevel && ctx.kpiLevel !== 'CELL') {
    allFilters.push({ dimension: 'KPI_LEVEL', op: 'IN', values: [ctx.kpiLevel] });
  }
  if (ctx.kpiLevel === 'PROFILE') {
    if (ctx.profileQci != null) allFilters.push({ dimension: 'QCI', op: 'IN', values: [String(ctx.profileQci)] });
    if (ctx.profileArp != null) allFilters.push({ dimension: 'ARP', op: 'IN', values: [String(ctx.profileArp)] });
  }
  if (ctx.kpiLevel === 'NEIGHBOR') {
    if (ctx.neighborType) allFilters.push({ dimension: 'NEIGHBOR_TYPE', op: 'IN', values: [ctx.neighborType] });
  }

  // Strip PM_DIM: prefix for KPI Engine — it expects raw dimension names
  const engineSplitBy = ctx.splitBy?.startsWith('PM_DIM:') ? ctx.splitBy.replace('PM_DIM:', '') : (ctx.splitBy || null);
  const engineSplitBy2 = ctx.splitBy2?.startsWith('PM_DIM:') ? ctx.splitBy2.replace('PM_DIM:', '') : (ctx.splitBy2 || null);

  const body: Record<string, any> = {
    date_from: ctx.dateFrom,
    date_to: ctx.dateTo,
    granularity: ctx.granularity,
    selections: ctx.kpiIds.map(k => ({ kpi_key: k })),
    filters: allFilters,
    split_by: engineSplitBy,
    split_by_2: engineSplitBy2,
    top_n: 10,
    kpi_level: ctx.kpiLevel || 'CELL',
  };

  const kpiEngineStart = Date.now();
  log('[Pipeline] Step 2 KPI Engine START:', computeFailed, JSON.stringify(body));
  // 120s timeout: multi-KPI queries at 15min granularity can be slow on the VPS.
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  }, 120_000);

  let kpiSeries: any[] = [];
  let kpiResults: DataPoint[] = [];

  if (res.ok) {
    const data = await res.json();
    kpiSeries = data.series || [];
    log('[Pipeline] Step 2 KPI Engine END:', {
      duration: `${Date.now() - kpiEngineStart}ms`,
      points: kpiSeries.length,
      status: kpiSeries.length > 0 ? 'success' : 'no_data',
    });
    const noSplitRequested = !ctx.splitBy;
    kpiResults = kpiSeries.map((s: any) => {
      const sv1 = noSplitRequested ? undefined : (s.split_value === 'ALL' ? undefined : s.split_value);
      const sv2 = s.split_value_2 && s.split_value_2 !== 'ALL' ? s.split_value_2 : undefined;
      // Build composite kpi key for double split
      let kpiKey = s.kpi_key;
      if (sv1) kpiKey += `@${sv1}`;
      if (sv2) kpiKey += `@${sv2}`;
      // Detect network element from split values or backend fields
      const ne = detectNetworkElement(sv1, sv2, ctx.splitBy, ctx.splitBy2)
        || s.cell_name || s.network_element || s.site_name || s.ne || undefined;
      return {
        timestamp: s.ts,
        kpi: kpiKey,
        value: s.value,
        splitValue: sv1,
        splitValue2: sv2,
        networkElement: ne,
      };
    });
  } else {
    warn('[Pipeline] Step 2 KPI Engine FAILED:', res.status, {
      duration: `${Date.now() - kpiEngineStart}ms`,
      status: 'query_failed',
    });
  }

  // Merge KPI Engine results with any compute results from Step 1
  const kpisWithData = new Set(kpiSeries.map((s: any) => s.kpi_key?.toLowerCase()));
  const missingKpis = computeFailed.filter(k => !kpisWithData.has(k.toLowerCase()));
  let hasUnfilteredFallback = false;

  // If splits were requested but KPI Engine returned data without splits,
  // prefer counter fallback which can do proper PM dimension + cell splits
  const splitRequested = !!(computePmDim || computeSplitByField || (ctx.splitBy && ctx.splitBy !== 'None'));
  if (splitRequested && kpiResults.length > 0 && !kpiResults.some(d => d.splitValue)) {
    // KPI Engine returned aggregated data without splits — try counter fallback instead
    const unsplitKpis = computeFailed.filter(k => kpisWithData.has(k.toLowerCase()));
    if (unsplitKpis.length > 0) {
      log('[Investigator] KPI Engine returned data without splits, trying counter fallback for:', unsplitKpis);
      const fallback = await fetchCounterTimeSeriesFallback(
        unsplitKpis, ctx.dateFrom, ctx.dateTo, ctx.granularity,
        ctx.splitBy, ctx.filters, computeSplitByField,
      );
      if (fallback.data.length > 0 && fallback.data.some(d => d.splitValue)) {
        // Counter fallback has proper split data — use it instead of KPI Engine
        kpiResults = kpiResults.filter(d => !unsplitKpis.some(k => d.kpi.toLowerCase().startsWith(k.toLowerCase())));
        kpiResults.push(...fallback.data);
      }
    }
  }

  // Step 3: For KPIs that failed both compute AND KPI Engine, try raw counter fallback — SEQUENTIAL
  if (missingKpis.length > 0) {
    const fallbackStart = Date.now();
    log('[Pipeline] Step 3 Counter Fallback START:', missingKpis);
    const fallback = await fetchCounterTimeSeriesFallback(
      missingKpis, ctx.dateFrom, ctx.dateTo, ctx.granularity,
      ctx.splitBy, ctx.filters, computeSplitByField,
    );
    log('[Pipeline] Step 3 Counter Fallback END:', {
      duration: `${Date.now() - fallbackStart}ms`,
      points: fallback.data.length,
      status: fallback.data.length > 0 ? 'success' : 'no_counter_data',
    });
    const allData = [...computeResults, ...kpiResults, ...fallback.data];
    if (neFromFilters) allData.forEach(d => { if (!d.networkElement) d.networkElement = neFromFilters; });
    return { data: allData, hasUnfilteredFallback };
  }

  // Fix #2: Merge compute results with KPI Engine results (don't drop successful computes)
  const allData = [...computeResults, ...kpiResults];
  if (neFromFilters) allData.forEach(d => { if (!d.networkElement) d.networkElement = neFromFilters; });
  return { data: allData, hasUnfilteredFallback };
}

// ── Legacy wrapper (keeps backward compat) ──
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
  const result = await fetchTimeSeriesForSlot({
    kpiIds, dateFrom, dateTo, granularity,
    splitBy, filters: filters || [], kpiLevel: kpiLevel || 'CELL',
    profileQci, profileArp, neighborType,
  });
  return result.data;
}

// ── Fetch worst cells using monitor/query/table with split_by=CELL ──
// Bug #4 fix: use KPI metadata for severity/ranking
export async function fetchWorstElements(
  kpiIds: string[],
  limit: number = 10,
  dateFrom: string = defaultDateFrom(),
  dateTo: string = defaultDateTo(),
  filters?: { dimension: string; op: string; values: string[] }[],
  kpiMetas?: Map<string, KpiDefinition>,
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
    const res = await fetchWithTimeout(url, {
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

    // Bug #4: Sort using KPI metadata orientation
    const primaryKpi = kpiIds[0];
    const primaryMeta = kpiMetas?.get(primaryKpi);
    const higherIsBetter = primaryMeta?.higherIsBetter ?? true;

    const entries = Object.entries(cellMap);
    entries.sort((a, b) => worstFirstComparator(
      a[1][primaryKpi],
      b[1][primaryKpi],
      higherIsBetter,
    ));

    return entries.slice(0, limit).map(([cell, kpiValues], i) => {
      const primaryVal = kpiValues[primaryKpi] ?? 0;
      const severity = primaryMeta
        ? getKpiSeverity(primaryVal, {
            key: primaryKpi,
            higherIsBetter,
            warningThreshold: primaryMeta.thresholds.warning,
            criticalThreshold: primaryMeta.thresholds.critical,
          })
        : (primaryVal < 90 ? 'critical' : primaryVal < 95 ? 'warning' : 'ok');

      return {
        id: `worst_${i}`,
        name: cell,
        dimension: 'Cell',
        kpiValues,
        trend: 'stable' as const,
        severity,
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

// ── Bug #5: Fetch worst elements grouped by DOR — single grouped query ──
export async function fetchWorstByDOR(
  kpiIds: string[],
  limit: number = 10,
  dateFrom: string = defaultDateFrom(),
  dateTo: string = defaultDateTo(),
  filters?: { dimension: string; op: string; values: string[] }[],
  kpiMetas?: Map<string, KpiDefinition>,
): Promise<Record<string, WorstElement[]>> {
  if (!kpiIds.length) return {};

  // Preferred approach: single grouped query with DOR split
  const url = getApiUrl('monitor/query/table');
  const body = {
    date_from: dateFrom,
    date_to: dateTo,
    filters: filters || [],
    kpi_keys: kpiIds,
    split_by: 'CELL',
    top_n: limit * 20, // Fetch more rows to group by DOR client-side
    page: 1,
    page_size: limit * kpiIds.length * 20,
  };

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      // Group rows by cell, then by DOR
      const cellMap: Record<string, { kpiValues: Record<string, number>; dor?: string }> = {};
      for (const row of (data.rows || [])) {
        const cell = row.split_value;
        if (!cell || cell === 'ALL') continue;
        if (!cellMap[cell]) cellMap[cell] = { kpiValues: {}, dor: row.dor || row.DOR };
        cellMap[cell].kpiValues[row.kpi_key] = row.avg;
        if (row.dor || row.DOR) cellMap[cell].dor = row.dor || row.DOR;
      }

      const primaryKpi = kpiIds[0];
      const primaryMeta = kpiMetas?.get(primaryKpi);
      const higherIsBetter = primaryMeta?.higherIsBetter ?? true;

      // Group by DOR
      const byDOR: Record<string, WorstElement[]> = {};
      const entries = Object.entries(cellMap);
      entries.sort((a, b) => worstFirstComparator(
        a[1].kpiValues[primaryKpi],
        b[1].kpiValues[primaryKpi],
        higherIsBetter,
      ));

      for (const [cell, { kpiValues, dor }] of entries) {
        const dorKey = dor || 'ALL';
        if (!byDOR[dorKey]) byDOR[dorKey] = [];
        if (byDOR[dorKey].length >= limit) continue;

        const primaryVal = kpiValues[primaryKpi] ?? 0;
        const severity = primaryMeta
          ? getKpiSeverity(primaryVal, {
              key: primaryKpi,
              higherIsBetter,
              warningThreshold: primaryMeta.thresholds.warning,
              criticalThreshold: primaryMeta.thresholds.critical,
            })
          : (primaryVal < 90 ? 'critical' : primaryVal < 95 ? 'warning' : 'ok');

        byDOR[dorKey].push({
          id: `worst_${dorKey}_${byDOR[dorKey].length}`,
          name: cell,
          dimension: 'Cell',
          kpiValues,
          trend: 'stable',
          severity,
          region: '',
          vendor: '',
          technology: '',
          dor: dorKey,
        });
      }

      // If we got no DOR grouping from the backend, return as 'ALL'
      if (Object.keys(byDOR).length === 0) {
        const all = await fetchWorstElements(kpiIds, limit, dateFrom, dateTo, filters, kpiMetas);
        return { 'ALL': all };
      }

      return byDOR;
    }
  } catch (e) {
    warn('[fetchWorstByDOR] Grouped query failed, falling back', e);
  }

  // Fallback: single non-DOR query
  const all = await fetchWorstElements(kpiIds, limit, dateFrom, dateTo, filters, kpiMetas);
  return { 'ALL': all };
}

// ── Fetch worst cells directly from Parser ClickHouse (primary path) ──
export async function fetchWorstCellsDirect(
  kpiIds: string[],
  limit: number,
  dateFrom: string,
  dateTo: string,
  filters?: { dimension: string; op?: string; values: string[] }[],
  kpiMetas?: Map<string, KpiDefinition>,
): Promise<Record<string, WorstElement[]>> {
  if (!kpiIds.length) return {};

  // Extract site filter
  let siteName: string | undefined;
  if (filters) {
    for (const f of filters) {
      const dim = (f.dimension || '').toUpperCase();
      if (dim === 'SITE' && f.values?.length) siteName = f.values[0];
    }
  }

  const url = getApiUrl('pm/kpi/worst-cells');
  const body: any = {
    kpi_codes: kpiIds,
    date_from: dateFrom,
    date_to: dateTo,
    limit,
  };
  if (siteName) body.site_name = siteName;

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error || !data.cells?.length) throw new Error(data.error || 'no data');

    const primaryKpi = kpiIds[0];
    const primaryMeta = kpiMetas?.get(primaryKpi);
    const higherIsBetter = primaryMeta?.higherIsBetter ?? true;

    const elements: WorstElement[] = data.cells.map((c: any, i: number) => {
      const primaryVal = c.kpi_values?.[primaryKpi] ?? 0;
      const severity = primaryMeta
        ? getKpiSeverity(primaryVal, {
            key: primaryKpi,
            higherIsBetter,
            warningThreshold: primaryMeta.thresholds.warning,
            criticalThreshold: primaryMeta.thresholds.critical,
          })
        : c.severity || 'ok';

      return {
        id: c.id || `worst_${i}`,
        name: c.name,
        dimension: 'Cell',
        kpiValues: c.kpi_values || {},
        trend: 'stable' as const,
        severity,
        region: '',
        vendor: c.vendor || '',
        technology: c.rat || '',
        dor: c.dor || '',
        plaque: c.plaque || '',
        band: c.band || '',
        site_name: c.site_name || '',
      };
    });

    elements.sort((a, b) => worstFirstComparator(
      a.kpiValues[primaryKpi], b.kpiValues[primaryKpi], higherIsBetter,
    ));

    const byDOR: Record<string, WorstElement[]> = {};
    for (const el of elements) {
      const dorKey = el.dor || 'ALL';
      if (!byDOR[dorKey]) byDOR[dorKey] = [];
      byDOR[dorKey].push(el);
    }
    return Object.keys(byDOR).length ? byDOR : { 'ALL': elements };
  } catch (e) {
    warn('[fetchWorstCellsDirect] Failed, falling back to KPI Engine:', e);
    return fetchWorstByDOR(kpiIds, limit, dateFrom, dateTo, filters.map(f => ({ ...f, op: f.op || 'IN' })), kpiMetas);
  }
}

// ── Fetch KPIs that have data for a given filter (e.g. SITE=xxx) ──
export async function fetchKpisWithData(dimension: string, value: string): Promise<Set<string>> {
  const url = getApiUrl(`monitor/catalog/kpis-with-data?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}`);
  try {
    const res = await fetchWithTimeout(url, { headers: getApiHeaders() });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set((data || []).map((k: any) => k.kpi_key));
  } catch (e) {
    warn('[API] Exception:', e);
    return new Set();
  }
}

// ── Fetch which PM dimensions a given KPI actually has data for, optionally scoped to a site ──
// Returns the list of dimension types that have > 0 rows in ClickHouse for that KPI's counters.
// Used to grey-out / hide dimension filters that would produce empty results.
export interface KpiDimensionInfo {
  available: boolean;
  row_count: number;
  sample_values: string[];
}
export interface KpiDimensionsResponse {
  kpi_code: string;
  vendor?: string | null;
  counters: string[];
  site_name?: string | null;
  dimensions: Record<string, KpiDimensionInfo>;
  available_dimensions: string[];
  error?: string;
}

const _kpiDimCache: Map<string, { ts: number; data: KpiDimensionsResponse }> = new Map();
const KPI_DIM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min client-side cache

export async function fetchKpiDimensions(
  kpiCode: string,
  siteName?: string | null
): Promise<KpiDimensionsResponse> {
  const cacheKey = `${kpiCode}|${siteName || ''}`;
  const cached = _kpiDimCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < KPI_DIM_CACHE_TTL_MS) {
    return cached.data;
  }
  const params = new URLSearchParams({ kpi_code: kpiCode });
  if (siteName) params.set('site_name', siteName);
  const url = getApiUrl(`monitor/catalog/kpi-dimensions?${params.toString()}`);
  try {
    const res = await fetchWithTimeout(url, { headers: getApiHeaders() });
    if (!res.ok) {
      const empty: KpiDimensionsResponse = {
        kpi_code: kpiCode, counters: [], dimensions: {}, available_dimensions: [],
        error: `http_${res.status}`,
      };
      return empty;
    }
    const data = await res.json() as KpiDimensionsResponse;
    _kpiDimCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  } catch (e) {
    warn('[API] fetchKpiDimensions:', e);
    return { kpi_code: kpiCode, counters: [], dimensions: {}, available_dimensions: [], error: String(e) };
  }
}

// ── Fetch filter values for a dimension ──
export async function fetchFilterValues(dimension: string): Promise<string[]> {
  const url = getApiUrl(`monitor/filters/values?dimension=${encodeURIComponent(dimension)}`);
  try {
    const res = await fetchWithTimeout(url, { headers: getApiHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.values || [];
  } catch (e) {
    warn('[API] Exception:', e);
    return [];
  }
}

// ── Fetch histogram data ──
export async function fetchHistogramData(
  kpiId: string,
  dateFrom: string = defaultDateFrom(),
  dateTo: string = defaultDateTo(),
  bins: number = 20
): Promise<{ bin: number; count: number; label: string }[]> {
  const url = getApiUrl('monitor/query/table');
  const body = {
    date_from: dateFrom, date_to: dateTo, filters: [],
    kpi_keys: [kpiId], split_by: 'CELL', top_n: 200, page: 1, page_size: 200,
  };
  try {
    const res = await fetchWithTimeout(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
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
  } catch (e) { warn('[API] Exception:', e); return []; }
}

// ── Fetch breakdown by dimension ──
export async function fetchBreakdownData(
  kpiId: string,
  dateFrom: string = defaultDateFrom(),
  dateTo: string = defaultDateTo(),
  dimension: string = 'vendor',
  filters?: { dimension: string; values: string[] }[],
): Promise<{ name: string; value: number; color: string }[]> {
  const url = getApiUrl('monitor/query/timeseries');
  const allFilters = (filters || []).map(f => ({ dimension: f.dimension, op: 'IN', values: f.values }));
  const body = {
    date_from: dateFrom, date_to: dateTo, granularity: '1d',
    selections: [{ kpi_key: kpiId }], filters: allFilters, split_by: dimension.toUpperCase(), top_n: 10,
  };
  try {
    const res = await fetchWithTimeout(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
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
  } catch (e) { warn('[API] Exception:', e); return []; }
}

// ── AI Investigation → Agent Layer :1000 ──
export async function startInvestigation(query: string): Promise<ReadableStream | null> {
  const url = getVpsProxyUrl('agent', '/orchestrator/stream');
  const baseHeaders = isLocalMode()
    ? { 'Content-Type': 'application/json' }
    : getVpsProxyHeaders();
  const headers = { ...baseHeaders, 'x-api-key': AGENT_API_KEY };
  // Streaming — use longer timeout (120s)
  const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify({ query, session_id: crypto.randomUUID() }) }, 120_000);
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
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ cell_names: cellNames }),
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    warn('[API] Exception:', e);
    return [];
  }
}
