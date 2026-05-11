/**
 * kpi-overlay-layer.js — Leaflet integration for KPI Overlay.
 *
 * Public API:
 *   const ctl = initKpiOverlay({
 *     map,
 *     cells,                      // your cell list
 *     fetchKpiValues,             // FetchKpiValuesFn (mock or real)
 *     panelMount: panelEl,        // where to mount the side legend
 *     catalog,                    // optional override
 *   });
 *
 *   ctl.setView({                 // activate a KPI Overlay view
 *     name:'Throughput 4G',
 *     tech:'4G',
 *     level:'Cellule',
 *     period:['2026-05-04','2026-05-11'],
 *     selectedKpis:['Den_&_Ave_4G_LTE_DL_User_Thrput'],
 *   });
 *
 *   ctl.setEnabled(true|false);
 *   ctl.on('ready', info => {...});
 *   ctl.destroy();
 */

import { buildKpiOverlay } from './kpi-overlay.js';
import { DEFAULT_CATALOG, findKpi, gradientCss } from './kpi-catalog.js';
import { mountKpiLegend } from './kpi-legend.js';

export function initKpiOverlay(options) {
  const {
    map,
    cells: initialCells,
    fetchKpiValues,
    panelMount = null,
    catalog = DEFAULT_CATALOG,
    fillOpacity = 0.55,
    borderOpacity = 0.4,
    borderWidth = 0.5,
    defaultEnabled = true,
  } = options;

  if (!map) throw new Error('initKpiOverlay: `map` is required.');
  if (!Array.isArray(initialCells)) throw new Error('`cells` must be an array.');
  if (typeof fetchKpiValues !== 'function') throw new Error('`fetchKpiValues` must be a function.');

  let cells = initialCells;
  let currentView = null;
  let result = null;
  let geoLayer = null;
  let enabled = defaultEnabled;

  const listeners = { ready: [], status: [], error: [] };
  const emit = (e, p) => listeners[e]?.forEach((fn) => fn(p));

  const legend = panelMount
    ? mountKpiLegend(panelMount, { gradientCss: gradientCss() })
    : null;

  function styleFor(properties) {
    return {
      color: 'rgba(40,40,40,' + borderOpacity + ')',
      weight: borderWidth,
      fillColor: properties.color || '#888',
      fillOpacity,
    };
  }

  function bindFeature(feature, layer) {
    const p = feature.properties;
    const kpiRows = Object.entries(p.kpiValues).map(([name, v]) => {
      const short = name.length > 22 ? name.slice(0, 22) + '…' : name;
      const raw = v.raw == null ? '—' : v.raw.toFixed(2) + ' ' + v.unit;
      return `<div class="cov-tt-row"><span>${short}</span><b>${raw}</b></div>`;
    }).join('');

    layer.bindTooltip(`
      <div class="cov-tt">
        <div class="cov-tt-name">${p.id}</div>
        <div class="cov-tt-row"><span>site</span><b>${p.siteName}</b></div>
        <div class="cov-tt-row"><span>tech</span><b>${p.tech}${p.band ? ' · ' + p.band : ''}</b></div>
        <div class="cov-tt-divider"></div>
        <div class="cov-tt-row"><span>composite score</span><b>${(p.compositeScore * 100).toFixed(1)} / 100</b></div>
        <div class="cov-tt-kpi-block">${kpiRows}</div>
      </div>
    `, { className: 'cov-tooltip', sticky: true, direction: 'top' });

    layer.on('mouseover', (e) => e.target.setStyle({
      weight: borderWidth + 1.5,
      fillOpacity: Math.min(fillOpacity + 0.25, 0.9),
    }));
    layer.on('mouseout', (e) => e.target.setStyle(styleFor(feature.properties)));
  }

  async function setView(newView) {
    if (!newView || !newView.selectedKpis || newView.selectedKpis.length === 0) {
      throw new Error('setView: view must define selectedKpis');
    }
    currentView = newView;
    setStatus('Loading');

    try {
      // 1) Fetch KPI values from backend (coder-provided)
      const kpiValues = await fetchKpiValues({
        cellIds: cells.map((c) => c.id),
        kpiNames: newView.selectedKpis,
        periodStart: newView.period[0],
        periodEnd:   newView.period[1],
        tech:        newView.tech,
        aggregation: newView.aggregation || 'avg',
      });

      // 2) Build overlay GeoJSON
      result = buildKpiOverlay({ cells, kpiValues, view: newView, options: { catalog } });

      // 3) Render
      if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
      geoLayer = L.geoJSON(result.fc, {
        style: (f) => styleFor(f.properties),
        onEachFeature: bindFeature,
      });
      if (enabled) geoLayer.addTo(map);

      // 4) Update legend
      if (legend) {
        const k = findKpi(catalog, result.primaryKpi);
        legend.update({
          composite:    result.composite,
          kpiName:      result.composite ? `COMPOSITE (${newView.selectedKpis.length} KPIs)` : result.primaryKpi,
          unit:         k?.unit || '',
          direction:    k?.direction || 'higher',
          min:          result.primaryMin,
          max:          result.primaryMax,
          nCells:       result.nCells,
          period:       newView.period,
        });
      }

      setStatus('Ready');
      emit('ready', result);
    } catch (err) {
      console.error('[kpi-overlay] error:', err);
      setStatus('Error');
      emit('error', err);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!geoLayer) return;
    if (enabled) geoLayer.addTo(map);
    else map.removeLayer(geoLayer);
  }

  function setStatus(state) {
    if (legend) legend.setStatus(state);
    emit('status', state);
  }

  const api = {
    setView,
    setEnabled,
    isEnabled: () => enabled,
    getResult: () => result,
    getCurrentView: () => currentView,
    on(event, cb) {
      if (listeners[event]) listeners[event].push(cb);
      return api;
    },
    destroy() {
      if (geoLayer) map.removeLayer(geoLayer);
      geoLayer = null;
      if (legend) legend.destroy();
    },
  };

  return api;
}
