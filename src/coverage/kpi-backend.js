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
 * Wires the module's `fetchKpiValues` contract to the project's existing
 * batch endpoint `POST /kpi-api/kpi/compute`, which accepts a list of
 * `kpi_codes` and an optional `cell_names` whitelist and returns aggregated
 * values over a date range. The proxy `/kpi-api/*` is rewritten by
 * `server/spa-proxy.js` to `http://127.0.0.1:8001` (kpi-engine).
 *
 * Response parsing is defensive — the engine has shipped two shapes during
 * the migration: a flat `{ rows: [{cell_name, kpi_code, value}] }` and a
 * dict-of-dict `{ values: { cell: { kpi: value } } }`. We accept both.
 * Missing entries are omitted (the overlay treats them as neutral 0.5).
 *
 * @type {FetchKpiValuesFn}
 */
export async function realFetchKpiValues(request) {
  const body = {
    kpi_codes:   request.kpiNames,
    cell_names:  request.cellIds && request.cellIds.length ? request.cellIds : null,
    from_date:   request.periodStart,
    to_date:     request.periodEnd,
    aggregation: aggMap(request.aggregation),
  };

  const res = await fetch('/kpi-api/kpi/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`KPI compute failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = await res.json();

  const result = new Map();
  const ensureCell = (cellId) => {
    let m = result.get(cellId);
    if (!m) { m = new Map(); result.set(cellId, m); }
    return m;
  };

  // Shape A: { rows: [{ cell_name, kpi_code, value }, ...] }
  if (Array.isArray(json?.rows)) {
    for (const r of json.rows) {
      const cellId = r.cell_name || r.cellName || r.cellId;
      const name = r.kpi_code || r.kpiName || r.name;
      const v = Number(r.value);
      if (cellId && name && Number.isFinite(v)) ensureCell(cellId).set(name, v);
    }
    return result;
  }

  // Shape B: { values: { [cellId]: { [kpiName]: number } } }
  if (json?.values && typeof json.values === 'object') {
    for (const [cellId, kpis] of Object.entries(json.values)) {
      if (!kpis || typeof kpis !== 'object') continue;
      for (const [name, value] of Object.entries(kpis)) {
        const v = Number(value);
        if (Number.isFinite(v)) ensureCell(cellId).set(name, v);
      }
    }
    return result;
  }

  // Shape C: timeseries-style fallback { series: [{ split_value, value, kpi_code }] }
  if (Array.isArray(json?.series)) {
    for (const pt of json.series) {
      const cellId = pt.split_value || pt.cell_name;
      const name = pt.kpi_code || pt.kpiName;
      const v = Number(pt.value);
      if (cellId && name && Number.isFinite(v)) ensureCell(cellId).set(name, v);
    }
    return result;
  }

  // Unknown shape — return empty Map. The overlay will paint everything
  // neutral and the legend ticks will read 0 → 0.
  return result;
}

/**
 * Translate the module's high-level `aggregation` token ('avg'|'sum'|'max'|'last')
 * to whatever the OSMOSIS engine wants. Today the engine only accepts a
 * granularity-style key ('15MIN'|'1H'|'1D'); since we want a single scalar
 * per cell over the whole period, pass '15MIN' and let the engine roll up
 * via its built-in aggregation. (Adapt here if the engine grows a real
 * `aggregation: avg|sum|max|last` knob.)
 */
function aggMap(/* requestAgg */) {
  return '15MIN';
}
