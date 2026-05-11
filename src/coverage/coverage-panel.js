/**
 * coverage-panel.js — Mounts the left-panel UI block for the Visual
 * Coverage module: toggle, status pill, sites/cells/neighbors counters,
 * elapsed time.
 *
 * 2026-05-11: layout updated for the new site-footprint model. The
 * stats row now carries THREE tiles (sites, cells, neighbors) instead
 * of the previous two — the 3-column grid is set inline so the existing
 * `.cov-stat-grid` CSS (2 cols by default) keeps working for any other
 * consumer of the module.
 *
 * Returns an object with imperative methods so coverage-layer can update it.
 */

const PANEL_HTML = `
<div class="cov-panel">
  <div class="cov-panel-title">
    <span><span class="cov-idx">▸</span> visual coverage</span>
    <span class="cov-status-pill" data-cov-status>
      <span class="cov-pulse"></span><span data-cov-status-label>Ready</span>
    </span>
  </div>

  <div class="cov-row">
    <div class="cov-lbl">
      <div>Visual Coverage</div>
      <small>site footprints · sector wedges</small>
    </div>
    <div class="cov-switch" data-cov-toggle></div>
  </div>

  <div class="cov-stat-grid" style="grid-template-columns: 1fr 1fr 1fr">
    <div class="cov-stat">
      <div class="cov-stat-v" data-cov-sites>—</div>
      <div class="cov-stat-l">sites calc.</div>
    </div>
    <div class="cov-stat">
      <div class="cov-stat-v" data-cov-cells>—</div>
      <div class="cov-stat-l">cells</div>
    </div>
    <div class="cov-stat">
      <div class="cov-stat-v" data-cov-neighbors>—</div>
      <div class="cov-stat-l">neighbors used</div>
    </div>
  </div>

  <div class="cov-foot">
    updated <b data-cov-updated>—</b>
  </div>
</div>
`;

/**
 * @param {HTMLElement} container  where to inject the panel
 * @param {object}      cfg
 * @param {boolean}     cfg.defaultEnabled
 * @param {function}    cfg.onToggle  called with `enabled:boolean`
 */
export function mountCoveragePanel(container, cfg) {
  const wrap = document.createElement('div');
  wrap.innerHTML = PANEL_HTML;
  const root = wrap.firstElementChild;
  container.appendChild(root);

  const $toggle    = root.querySelector('[data-cov-toggle]');
  const $statusEl  = root.querySelector('[data-cov-status]');
  const $statusLbl = root.querySelector('[data-cov-status-label]');
  const $sites     = root.querySelector('[data-cov-sites]');
  const $cells     = root.querySelector('[data-cov-cells]');
  const $neighbors = root.querySelector('[data-cov-neighbors]');
  const $updated   = root.querySelector('[data-cov-updated]');

  if (cfg.defaultEnabled) $toggle.classList.add('on');

  $toggle.addEventListener('click', () => {
    $toggle.classList.toggle('on');
    cfg.onToggle?.($toggle.classList.contains('on'));
  });

  return {
    setEnabled(on) { $toggle.classList.toggle('on', !!on); },

    setStatus(state) {
      $statusEl.className = 'cov-status-pill' +
        (state === 'Ready' ? '' : ' cov-status-' + state.toLowerCase());
      $statusLbl.textContent = state;
    },

    update({ nSites, nCells, nNeighbors, elapsedMs }) {
      $sites.textContent = nSites;
      $cells.textContent = nCells;
      $neighbors.textContent = nNeighbors;
      $updated.textContent =
        new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }) +
        ' · ' + elapsedMs + ' ms';
    },

    destroy() { root.remove(); },
  };
}
