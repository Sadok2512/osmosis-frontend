/**
 * kpi-backend.js
 * ──────────────
 * Backend adapter contract. The CODER implements `fetchKpiValues` to wire
 * the real API. The KPI Overlay layer only depends on this signature, so
 * the frontend stays decoupled from how the data is fetched.
 *
 * Contract:
 *   fetchKpiValues(request) → Promise<Map<cellId, Map<kpiName, number>>>
 *
 * Where `request` contains everything the backend needs to compute the
 * values, and the returned Map gives, for each cell id, a Map from KPI
 * name to its scalar value over the requested period.
 *
 * Missing values: omit the entry (cellId → kpiName → undefined). The
 * overlay will treat a missing value as "neutral" (composite score 0.5)
 * and the tooltip will display "—".
 */

/**
 * @typedef {object} FetchKpiRequest
 * @property {string[]} cellIds           list of cell ids to fetch
 * @property {string[]} kpiNames          list of KPI names
 * @property {string}   periodStart       ISO date (YYYY-MM-DD)
 * @property {string}   periodEnd         ISO date (YYYY-MM-DD)
 * @property {string}   tech              '4G' | '5G'
 * @property {string}   [aggregation]     'avg' | 'sum' | 'max' | 'last' (default: 'avg')
 */

/**
 * @typedef {(request: FetchKpiRequest) => Promise<Map<string, Map<string, number>>>} FetchKpiValuesFn
 */

/* ============================================================================
 * MOCK ADAPTER — for development / preview / testing.
 * Replace with a real implementation that calls your backend.
 * ============================================================================ */

/** @type {FetchKpiValuesFn} */
export async function mockFetchKpiValues(request) {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 80));

  const result = new Map();
  request.cellIds.forEach((cellId) => {
    const m = new Map();
    request.kpiNames.forEach((name) => {
      // Cheap deterministic mock: hash cellId+name into a [0..1] range,
      // then map to a plausible value per KPI name.
      const seed = hashStr(cellId + '|' + name);
      const x = (seed % 1000) / 1000;
      let v;
      switch (name) {
        case 'DL_VOLUME_IP_GBytes':              v = x * 350 + 30; break;
        case 'Den_&_Ave_4G_LTE_DL_User_Thrput':  v = x * 40 + 8; break;
        case 'Flex_ERAB_ADD_INIT_SETUP_ATT':     v = x * 8000 + 800; break;
        case 'MAX_TPUT_PDCP_DL_ENB':             v = x * 150 + 20; break;
        case 'RRC_SETUP_SR':                     v = 92 + x * 8; break;
        case 'ERAB_DROP_RATE':                   v = 5 - x * 4.5; break;
        case 'CSSR_VOLTE':                       v = 95 + x * 5; break;
        case 'AVG_RSRP':                         v = -110 + x * 30; break;
        case 'AVG_SINR':                         v = x * 30 - 5; break;
        case 'HO_SR_INTRA_FREQ':                 v = 88 + x * 12; break;
        default:                                 v = x * 100;
      }
      m.set(name, v);
    });
    result.set(cellId, m);
  });
  return result;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/* ============================================================================
 * REAL ADAPTER TEMPLATE — replace the body with your actual API call.
 *
 * Example signatures to fill in (depending on your backend):
 *
 *   POST /api/kpi/query  { cellIds, kpiNames, periodStart, periodEnd, tech, aggregation }
 *     → { values: { [cellId]: { [kpiName]: number } } }
 *
 *   GET  /api/kpi/aggregated?cells=...&kpis=...&from=...&to=...&agg=avg
 *     → CSV or JSON
 *
 *   GraphQL: query KpiValues($cellIds, $kpiNames, ...) { ... }
 * ============================================================================ */

/**
 * Real adapter for the OSMOSIS KPI engine.
 *
 * 2026-05-11 v2 — `/kpi/compute` only resolves ATOMIC kpi codes
 * (`kpi/definitions` table). The UI surfaces SHARED/COMPOSITE codes
 * like `4G_LTE_CSSR_VoLTE` from `/kpi-tables/shared` which `/kpi/compute`
 * doesn't understand. The path that does is
 * `POST /monitor/query/timeseries` (proven by `fetchKpiCellValues` in
 * topoService). We fan out one timeseries call per requested KPI name
 * (Promise.all) and merge the per-cell series into the
 * `Map<cellId, Map<kpiName, number>>` the overlay module expects.
 *
 * The proxy `/kpi-api/*` is rewritten by `server/spa-proxy.js` to
 * `http://127.0.0.1:8001` (kpi-engine).
 *
 * Missing entries are omitted (the overlay treats them as neutral 0.5
 * and the tooltip shows "—").
 *
 * @type {FetchKpiValuesFn}
 */
export async function realFetchKpiValues(request) {
  const kpiNames = Array.isArray(request.kpiNames) ? request.kpiNames : [];
  if (kpiNames.length === 0) return new Map();

  // Build base filters once. Vendor / techno fall through to backend
  // defaults (no narrowing) — the module's `tech` is informational
  // (legend label) and not authoritative for the SQL filter, which
  // works on dimensions stored in CH.
  const baseFilters = [];
  // Note: cellIds is NOT used as a CELL dimension filter here because
  // the timeseries endpoint already returns split_value=cell_name for
  // ALL cells of the bbox. The overlay then matches by cell.id, so
  // we naturally get only the cells in our list (extras are dropped).

  const result = new Map();
  const ensureCell = (cellId) => {
    let m = result.get(cellId);
    if (!m) { m = new Map(); result.set(cellId, m); }
    return m;
  };

  // Fan out N timeseries calls in parallel — the engine accepts only one
  // `kpi_key` per `selections` entry effectively (split_by=CELL on
  // multi-KPI loses the kpi attribution in `pt`). Cheap to parallelise:
  // typical N is 1-3.
  await Promise.all(kpiNames.map(async (name) => {
    const body = {
      date_from:   request.periodStart,
      date_to:     request.periodEnd,
      granularity: 'total',
      filters:     baseFilters,
      selections:  [{ kpi_key: name }],
      split_by:    'CELL',
      top_n:       5000,
    };
    let json;
    try {
      const res = await fetch('/kpi-api/monitor/query/timeseries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return; // soft fail per KPI — other KPIs may succeed
      json = await res.json();
    } catch {
      return;
    }
    const series = Array.isArray(json?.series) ? json.series : [];
    for (const pt of series) {
      const cellId = pt.split_value || pt.cell_name;
      const raw = pt.value;
      const v = Number(raw);
      if (cellId && Number.isFinite(v)) ensureCell(cellId).set(name, v);
    }
  }));

  return result;
}
