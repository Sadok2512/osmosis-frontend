// ── Investigator API — Data from Parser :8000, AI from Agent :1000 ──

import { getApiUrl, getApiHeaders, getVpsProxyUrl, getVpsProxyHeaders, isLocalMode } from '@/lib/apiConfig';
import { DataPoint, WorstElement, KpiDefinition, GraphSlot, Granularity } from './types';
import { worstFirstComparator, getKpiSeverity } from '@/utils/telecomHelpers';

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

// ── Fetch KPI computed on-the-fly from Parser (formula applied in SQL) ──
async function fetchKpiComputeOnTheFly(
  kpiId: string,
  dateFrom: string,
  dateTo: string,
  granularity: string = '1d',
  filters?: { dimension: string; values: string[] }[],
  splitByPmDim?: string,
): Promise<{ data: DataPoint[]; isComputed: boolean }> {
  try {
    const url = getApiUrl('pm/kpi/compute');
    const body: any = {
      kpi_code: kpiId,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };

    // Extract site/cell/dimension from filters
    const PM_DIM_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);
    if (filters && filters.length > 0) {
      for (const f of filters) {
        const dim = (f.dimension || '').toUpperCase();
        if (dim === 'SITE' && f.values?.length) body.site_name = f.values[0];
        else if (dim === 'CELL' && f.values?.length) body.cell_name = f.values[0];
        else if (PM_DIM_TYPES.has(dim) && f.values?.length) body.dimension_filter = f.values[0];
        // KPI Engine profile QCI → translate to PMQAP dimension
        else if (dim === 'QCI' && f.values?.length) body.dimension_filter = `PMQAP=${f.values[0]}`;
        else if (dim === 'KPI_LEVEL') { /* ignore, handled by kpi engine */ }
      }
    }

    // Split by PM dimension: call compute for each dimension value
    if (splitByPmDim && !body.dimension_filter) {
      console.log('[KpiCompute] Split by PM dimension:', splitByPmDim);
      try {
        const dimRes = await fetch(getApiUrl(`pm/counters/dimension-values?dimension_type=${splitByPmDim}&limit=20`), { headers: getApiHeaders() });
        if (dimRes.ok) {
          const dimData = await dimRes.json();
          const dimValues = (dimData.labeled_values || dimData.values || []).slice(0, 10);
          const allData: DataPoint[] = [];
          for (const dv of dimValues) {
            const dimVal = typeof dv === 'string' ? dv : dv.value;
            const dimLabel = typeof dv === 'string' ? dv : dv.label;
            const splitBody = { ...body, dimension_filter: dimVal };
            const splitRes = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(splitBody) });
            if (splitRes.ok) {
              const splitResult = await splitRes.json();
              if (!splitResult.error) {
                for (const s of (splitResult.series || [])) {
                  allData.push({ timestamp: s.ts, kpi: `${kpiId}@${dimLabel}`, value: s.kpi_value, splitValue: dimLabel, _isComputed: true } as any);
                }
              }
            }
          }
          if (allData.length > 0) return { data: allData, isComputed: true };
        }
      } catch (e) { console.warn('[KpiCompute] Split failed:', e); }
    }

    console.log('[KpiCompute] Request:', kpiId, 'filters:', JSON.stringify(filters), 'body:', JSON.stringify(body));
    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[KpiCompute] Failed:', res.status);
      // Try with shorter date range (reduce load)
      return { data: [], isComputed: false };
    }

    const result = await res.json();
    if (result.error) {
      console.warn('[KpiCompute] Error:', result.error, '— retrying with 1h granularity');
      // Retry with hourly granularity (faster query)
      if (granularity !== '1h') {
        const retryBody = { ...body, granularity: '1h' };
        try {
          const retryRes = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(retryBody) });
          if (retryRes.ok) {
            const retryResult = await retryRes.json();
            if (!retryResult.error && retryResult.series?.length > 0) {
              console.log('[KpiCompute] Retry succeeded with 1h');
              return {
                data: retryResult.series.map((s: any) => ({ timestamp: s.ts, kpi: kpiId, value: s.kpi_value, _isComputed: true })),
                isComputed: true,
              };
            }
          }
        } catch {}
      }
      return { data: [], isComputed: false };
    }

    const series = (result.series || []).map((s: any) => ({
      timestamp: s.ts,
      kpi: kpiId,
      value: s.kpi_value,
      _isComputed: true,
    }));

    console.log('[KpiCompute] Result:', kpiId, series.length, 'points, formula:', result.formula_display?.substring(0, 60));
    return { data: series, isComputed: series.length > 0 };
  } catch (e) {
    console.warn('[KpiCompute] Exception:', e);
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
): Promise<{ data: DataPoint[]; isUnfiltered: boolean }> {
  try {
    const url = getApiUrl('pm/counters/timeseries');
    const body: any = {
      counter_names: counterNames,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    };

    // Translate dimension filters to Parser format
    if (splitBy && splitBy !== 'None') body.split_by_dimension = true;
    const PM_DIM_TYPES = new Set(['PMQAP', 'FLEX', 'NEIGHBOR', 'RANSHARE', 'SLICE', '5QI', 'TRANSPORT', 'CA_REL']);
    if (filters && filters.length > 0) {
      const dimFilterValues: string[] = [];
      for (const f of filters) {
        const dim = (f.dimension || '').toUpperCase();
        if (dim === 'SITE' && f.values?.length) body.site_name = f.values[0];
        else if (dim === 'CELL' && f.values?.length) body.cell_name = f.values[0];
        else if (dim === 'TECHNO' && f.values?.length) body.object_type = f.values[0];
        else if (PM_DIM_TYPES.has(dim) && f.values?.length) {
          // PM dimension filter → pass as dimension_filter array
          dimFilterValues.push(...f.values);
        }
      }
      if (dimFilterValues.length > 0) body.dimension_filter = dimFilterValues;
    }
    console.log('[CounterFallback] Request:', url, JSON.stringify(body));

    const res = await fetch(url, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    });

    console.log('[CounterFallback] Response status:', res.status);
    if (!res.ok) {
      console.warn('[CounterFallback] Failed:', res.status, await res.text().catch(() => ''));
      // If endpoint doesn't support filters, retry without and mark as unfiltered
      if (res.status === 400 || res.status === 422) {
        const fallbackRes = await fetch(url, {
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

    const data = await res.json();
    return {
      data: (data.series || []).map((s: any) => ({
        timestamp: s.ts,
        kpi: s.counter,
        value: s.value,
        _isRawFallback: true,
      })),
      isUnfiltered: false,
    };
  } catch {
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
  filters: { dimension: string; values: string[] }[];
  kpiLevel: string;
  profileQci?: number | null;
  profileArp?: number | null;
  neighborType?: string | null;
}

const GRAN_MAP: Record<string, string> = {
  '15min': '15min',
  'Hourly': '1h',
  'Daily': '1d',
  'Weekly': '1w',
};

/** Resolve a slot's effective request context, using slot overrides with global fallback */
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
  const rawFrom = (slot.startDate && slot.startDate.trim()) || (globalState.startDate && globalState.startDate.trim()) || '2026-03-22';
  const rawTo = (slot.endDate && slot.endDate.trim()) || (globalState.endDate && globalState.endDate.trim()) || '2026-03-22';
  const dateFrom = rawFrom.split('T')[0];
  const dateTo = rawTo.split('T')[0];
  const gran = GRAN_MAP[slot.granularity || globalState.granularity] || '1h';

  // Split: use slot-level splitBy, fall back to per-KPI split, then global
  let splitValue: string | undefined;
  if (slot.splitBy && slot.splitBy !== 'None') {
    splitValue = slot.splitBy;
  } else {
    // Check per-KPI split config
    const perKpi = slot.config?.splitByPerKpi || {};
    const activeSplit = Object.values(perKpi).find(v => v && v !== 'None');
    if (activeSplit) {
      splitValue = activeSplit;
    } else if (globalState.splitBy && globalState.splitBy !== 'None') {
      splitValue = globalState.splitBy;
    }
  }

  // Merge slot filters with global filters (slot overrides global for same dimension)
  const mergedFilters: Record<string, string[]> = { ...globalState.filters };
  if (slot.filters) {
    for (const [dim, vals] of Object.entries(slot.filters)) {
      if (vals.length > 0) mergedFilters[dim] = vals;
    }
  }
  const activeFilters = Object.entries(mergedFilters)
    .filter(([, vals]) => vals.length > 0)
    .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }));

  return {
    kpiIds: slot.kpiIds,
    dateFrom,
    dateTo,
    granularity: gran,
    splitBy: splitValue,
    filters: activeFilters,
    kpiLevel: globalState.kpiLevel,
    profileQci: globalState.profileQci,
    profileArp: globalState.profileArp,
    neighborType: globalState.neighborType,
  };
}

// ── Dedup cache to prevent 6x identical requests ──
const _computeCache = new Map<string, Promise<{ data: DataPoint[]; isComputed: boolean }>>();

// ── Fetch timeseries data per-slot ──
// Strategy: call /kpi/compute FIRST (on-the-fly, always has data)
export async function fetchTimeSeriesForSlot(
  ctx: SlotRequestContext,
): Promise<{ data: DataPoint[]; hasUnfilteredFallback: boolean }> {
  if (ctx.kpiIds.length === 0) return { data: [], hasUnfilteredFallback: false };

  // Detect PM dimension split
  const pmDimSplit = ctx.splitBy?.startsWith('PM_DIM:') ? ctx.splitBy.replace('PM_DIM:', '') : undefined;

  // Step 1: Try /kpi/compute FIRST for all KPIs (deduplicated)
  const computeResults: DataPoint[] = [];
  const computeFailed: string[] = [];

  for (const kpiId of ctx.kpiIds) {
    const cacheKey = `${kpiId}|${ctx.dateFrom}|${ctx.dateTo}|${ctx.granularity}|${JSON.stringify(ctx.filters)}|${pmDimSplit || ''}`;

    if (!_computeCache.has(cacheKey)) {
      _computeCache.set(cacheKey, fetchKpiComputeOnTheFly(
        kpiId, ctx.dateFrom, ctx.dateTo, ctx.granularity, ctx.filters, pmDimSplit,
      ));
      // Clear cache after 30s
      setTimeout(() => _computeCache.delete(cacheKey), 30000);
    }

    const computed = await _computeCache.get(cacheKey)!;
    if (computed.isComputed) {
      computeResults.push(...computed.data);
    } else {
      computeFailed.push(kpiId);
    }
  }

  // If all KPIs computed successfully, return directly (skip KPI Engine)
  if (computeFailed.length === 0 && computeResults.length > 0) {
    console.log('[Investigator] All KPIs computed on-the-fly:', computeResults.length, 'points');
    return { data: computeResults, hasUnfilteredFallback: false };
  }

  // Step 2: Fall back to KPI Engine for KPIs that failed compute
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

  const body = {
    date_from: ctx.dateFrom,
    date_to: ctx.dateTo,
    granularity: ctx.granularity,
    selections: ctx.kpiIds.map(k => ({ kpi_key: k })),
    filters: allFilters,
    split_by: ctx.splitBy || null,
    top_n: 10,
    kpi_level: ctx.kpiLevel || 'CELL',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });

  let kpiSeries: any[] = [];
  let kpiResults: DataPoint[] = [];

  if (res.ok) {
    const data = await res.json();
    kpiSeries = data.series || [];
    const noSplitRequested = !ctx.splitBy;
    kpiResults = kpiSeries.map((s: any) => ({
      timestamp: s.ts,
      kpi: s.kpi_key,
      value: s.value,
      splitValue: noSplitRequested ? undefined : (s.split_value === 'ALL' ? undefined : s.split_value),
    }));
  } else {
    console.warn('[Investigator] KPI Engine failed:', res.status, '— falling back to /kpi/compute');
  }

  // Merge KPI Engine results with any compute results from Step 1
  const kpisWithData = new Set(kpiSeries.map((s: any) => s.kpi_key?.toLowerCase()));
  const missingKpis = computeFailed.filter(k => !kpisWithData.has(k.toLowerCase()));
  let hasUnfilteredFallback = false;

  // For KPIs that failed both compute AND KPI Engine, try raw counter fallback
  if (missingKpis.length > 0) {
    const fallback = await fetchCounterTimeSeriesFallback(
      missingKpis, ctx.dateFrom, ctx.dateTo, ctx.granularity,
      ctx.splitBy, ctx.filters,
    );
    hasUnfilteredFallback = fallback.isUnfiltered;
    return { data: [...computeResults, ...kpiResults, ...fallback.data], hasUnfilteredFallback };
  }

  return { data: kpiResults, hasUnfilteredFallback };
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
  dateFrom: string = '2026-03-01',
  dateTo: string = '2026-03-31',
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
  dateFrom: string = '2026-03-01',
  dateTo: string = '2026-03-31',
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
    const res = await fetch(url, {
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
    console.warn('[fetchWorstByDOR] Grouped query failed, falling back', e);
  }

  // Fallback: single non-DOR query
  const all = await fetchWorstElements(kpiIds, limit, dateFrom, dateTo, filters, kpiMetas);
  return { 'ALL': all };
}

// ── Fetch KPIs that have data for a given filter (e.g. SITE=xxx) ──
export async function fetchKpisWithData(dimension: string, value: string): Promise<Set<string>> {
  const url = getApiUrl(`monitor/catalog/kpis-with-data?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}`);
  try {
    const res = await fetch(url, { headers: getApiHeaders() });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set((data || []).map((k: any) => k.kpi_key));
  } catch {
    return new Set();
  }
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
  dateFrom: string = '2026-03-01',
  dateTo: string = '2026-03-31',
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
  dateFrom: string = '2026-03-01',
  dateTo: string = '2026-03-31',
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
