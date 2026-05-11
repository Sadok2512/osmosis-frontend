/**
 * kpi-legend.js — Side-panel legend for the KPI Overlay.
 *
 * Displays the active KPI name, the gradient bar, 5 numeric ticks (min →
 * max of the primary KPI), the unit, and the direction indicator.
 */

const HTML = `
<div class="cov-kpi-legend">
  <div class="cov-kpi-legend-title">
    <span data-cov-kpi-name>—</span>
    <span class="cov-kpi-legend-pill" data-cov-kpi-status>Ready</span>
  </div>
  <div class="cov-kpi-legend-bar" data-cov-kpi-bar></div>
  <div class="cov-kpi-legend-ticks">
    <span data-cov-kpi-t0>0</span>
    <span data-cov-kpi-t1>25</span>
    <span data-cov-kpi-t2>50</span>
    <span data-cov-kpi-t3>75</span>
    <span data-cov-kpi-t4>100</span>
  </div>
  <div class="cov-kpi-legend-meta">
    <span data-cov-kpi-unit>unit · period</span>
    <span data-cov-kpi-cells>— cells</span>
  </div>
  <div class="cov-kpi-legend-direction" data-cov-kpi-direction>▸ higher = better</div>
</div>
`;

export function mountKpiLegend(container, cfg) {
  const wrap = document.createElement('div');
  wrap.innerHTML = HTML;
  const root = wrap.firstElementChild;
  container.appendChild(root);

  if (cfg.gradientCss) {
    root.querySelector('[data-cov-kpi-bar]').style.background = cfg.gradientCss;
  }

  const $name      = root.querySelector('[data-cov-kpi-name]');
  const $status    = root.querySelector('[data-cov-kpi-status]');
  const $cells     = root.querySelector('[data-cov-kpi-cells]');
  const $unit      = root.querySelector('[data-cov-kpi-unit]');
  const $direction = root.querySelector('[data-cov-kpi-direction]');
  const $ticks = [
    root.querySelector('[data-cov-kpi-t0]'),
    root.querySelector('[data-cov-kpi-t1]'),
    root.querySelector('[data-cov-kpi-t2]'),
    root.querySelector('[data-cov-kpi-t3]'),
    root.querySelector('[data-cov-kpi-t4]'),
  ];

  return {
    setStatus(state) {
      $status.textContent = state;
      $status.className = 'cov-kpi-legend-pill' +
        (state === 'Ready' ? '' : ' cov-kpi-status-' + state.toLowerCase());
    },
    update({ kpiName, unit, direction, min, max, nCells, period, composite }) {
      $name.textContent = kpiName;
      $cells.textContent = nCells + ' cells';
      $unit.textContent = (unit || '—') + (period ? ' · ' + period[0] + ' → ' + period[1] : '');
      $direction.textContent = composite
        ? '▸ composite normalized score · higher = better'
        : (direction === 'lower' ? '▸ lower value = better' : '▸ higher value = better');

      for (let i = 0; i < 5; i++) {
        const v = min + (max - min) * (i / 4);
        $ticks[i].textContent = formatTick(v);
      }
    },
    destroy() { root.remove(); },
  };
}

function formatTick(v) {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100)  return v.toFixed(1);
  if (abs >= 1)    return v.toFixed(2);
  return v.toFixed(3);
}
