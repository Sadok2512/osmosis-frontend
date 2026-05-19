/**
 * pci-overlay-layer.js — Leaflet integration for PCI Overlay.
 *
 * Pattern miroir de kpi-overlay-layer.js. Différences :
 *   - pas de fetch externe : la donnée pci/band est embarquée dans la
 *     liste de cells passée au mount (CoverageCell.pci, .band).
 *   - mutex avec KPI Overlay côté SitesMonitor (radio button) — ce
 *     layer ne sait pas qu'un autre est actif, c'est l'orchestration
 *     côté React qui gère.
 *
 * API publique :
 *   const ctl = initPciOverlay({
 *     map,
 *     cells,
 *     panelMount: el,
 *     fillOpacity, borderOpacity, defaultEnabled
 *   });
 *
 *   ctl.setView({ band: 'LTE1800', colorMode: 'mod3' });
 *   ctl.setEnabled(true|false);
 *   ctl.setCells(newCells);  // re-render when scope changes
 *   ctl.on('ready', info => …);
 *   ctl.destroy();
 */

import { buildPciOverlay, PCI_PALETTE } from './pci-overlay.js';

export function initPciOverlay(options) {
  const {
    map,
    cells: initialCells,
    panelMount = null,
    fillOpacity = 0.22,
    borderOpacity = 0.22,
    borderWidth = 0.35,
    defaultEnabled = false,
    onBandChange = null,     // (band: string) => void
    onColorModeChange = null,// (mode: 'mod3'|'hash') => void
    onEnabledChange = null,  // (flag: bool) => void
  } = options;

  if (!map) throw new Error('initPciOverlay: `map` is required.');
  if (!Array.isArray(initialCells)) throw new Error('`cells` must be an array.');

  let cells = initialCells;
  let currentView = null;   // { band, colorMode }
  let result = null;
  let geoLayer = null;
  let enabled = defaultEnabled;
  const paneName = 'panePciOverlay';

  if (!map.getPane(paneName)) {
    const pane = map.createPane(paneName);
    pane.style.zIndex = '660';
    pane.style.pointerEvents = 'auto';
    pane.style.mixBlendMode = 'multiply';
  }

  const listeners = { ready: [], status: [], error: [] };
  const emit = (e, p) => listeners[e]?.forEach((fn) => fn(p));

  // Compute distinct bands present in the loaded cells (for the pill UI).
  function availableBands() {
    const counts = new Map();
    for (const c of cells) {
      const b = (c.band || '').trim();
      if (!b) continue;
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])  // most frequent first
      .map(([band, n]) => ({ band, n }));
  }

  // Interactive panel : on/off + band pills + colorMode toggle + legend.
  // Mounted only when panelMount is provided.
  let panelEl = null;
  if (panelMount) {
    panelEl = document.createElement('div');
    panelEl.className = 'pci-overlay-panel';
    panelEl.style.cssText = 'font-size:11px;line-height:1.4;padding:10px;color:#cbd5e1;border-top:1px solid #1e293b;background:#0f172a';
    panelMount.appendChild(panelEl);
    // Initial paint so the operator sees the controls even before
    // toggling ON.
    setTimeout(() => renderPanel(), 0);
  }

  function renderPanel() {
    if (!panelEl) return;

    const bands = availableBands();
    const selectedBand = currentView?.band || '';
    const selectedMode = currentView?.colorMode || 'mod3';

    // ── Header (title + on/off switch) ──
    const headerHtml = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:10px">PCI Overlay</span>
        <span style="flex:1"></span>
        <button class="pci-switch" style="
          font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
          padding:3px 10px;border-radius:999px;border:1px solid ${enabled ? '#60a5fa' : '#334155'};
          background:${enabled ? 'rgba(96,165,250,.2)' : 'transparent'};
          color:${enabled ? '#60a5fa' : '#94a3b8'};cursor:pointer">
          ${enabled ? 'ON' : 'OFF'}
        </button>
      </div>
    `;

    // ── Band pills (one per distinct band present in the loaded cells) ──
    const bandPillsHtml = bands.length === 0
      ? '<div style="font-size:10px;color:#94a3b8;font-style:italic">No bands in scope — adjust filter or zoom</div>'
      : `
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Band</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          ${bands.map(({ band, n }) => `
            <button class="pci-band-pill" data-band="${escapeHtml(band)}" style="
              font-size:10px;padding:3px 8px;border-radius:999px;cursor:pointer;
              border:1px solid ${band === selectedBand ? '#60a5fa' : '#334155'};
              background:${band === selectedBand ? 'rgba(96,165,250,.18)' : 'transparent'};
              color:${band === selectedBand ? '#60a5fa' : '#cbd5e1'};font-weight:600">
              ${escapeHtml(band)}<span style="color:#64748b">·${n}</span>
            </button>
          `).join('')}
        </div>
      `;

    // ── ColorMode toggle (Mod 3 / Plan complet) ──
    const colorModeHtml = `
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Coloration</div>
      <div style="display:inline-flex;border:1px solid #334155;border-radius:6px;overflow:hidden;margin-bottom:8px">
        <button class="pci-mode" data-mode="mod3" style="
          font-size:10px;padding:3px 10px;cursor:pointer;border:none;
          background:${selectedMode === 'mod3' ? 'rgba(96,165,250,.18)' : 'transparent'};
          color:${selectedMode === 'mod3' ? '#60a5fa' : '#94a3b8'};font-weight:700">Mod 3</button>
        <button class="pci-mode" data-mode="hash" style="
          font-size:10px;padding:3px 10px;cursor:pointer;border:none;border-left:1px solid #334155;
          background:${selectedMode === 'hash' ? 'rgba(96,165,250,.18)' : 'transparent'};
          color:${selectedMode === 'hash' ? '#60a5fa' : '#94a3b8'};font-weight:700">Plan complet</button>
      </div>
    `;

    // ── Status + legend (depends on state) ──
    let legendHtml = '';
    if (!enabled) {
      legendHtml = '<div style="font-size:10px;color:#94a3b8;font-style:italic">PCI Overlay désactivé — clic ON pour activer.</div>';
    } else if (!selectedBand) {
      legendHtml = '<div style="font-size:10px;color:#fbbf24;font-style:italic">Sélectionnez une bande pour afficher le plan PCI.</div>';
    } else if (selectedMode === 'mod3') {
      legendHtml = `
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">
          Groupes pilote (PCI mod 3) · ${result ? result.nCells : 0} cells
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px">
            <span style="display:inline-block;width:11px;height:11px;background:${PCI_PALETTE[0]};border-radius:2px"></span>Group 0
          </span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px">
            <span style="display:inline-block;width:11px;height:11px;background:${PCI_PALETTE[1]};border-radius:2px"></span>Group 1
          </span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px">
            <span style="display:inline-block;width:11px;height:11px;background:${PCI_PALETTE[2]};border-radius:2px"></span>Group 2
          </span>
        </div>
      `;
    } else {
      legendHtml = `
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">
          Plan PCI · hash-stable · ${result ? result.nCells : 0} cells
        </div>
      `;
    }

    panelEl.innerHTML = headerHtml + bandPillsHtml + colorModeHtml + legendHtml;

    // ── Wire interactions ──
    const swBtn = panelEl.querySelector('.pci-switch');
    if (swBtn) {
      swBtn.addEventListener('click', () => {
        enabled = !enabled;
        rebuild();
        if (onEnabledChange) onEnabledChange(enabled);
      });
    }
    panelEl.querySelectorAll('.pci-band-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const band = btn.getAttribute('data-band');
        currentView = { ...(currentView || {}), band, colorMode: currentView?.colorMode || 'mod3' };
        rebuild();
        if (onBandChange) onBandChange(band);
      });
    });
    panelEl.querySelectorAll('.pci-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        currentView = { ...(currentView || {}), colorMode: mode };
        rebuild();
        if (onColorModeChange) onColorModeChange(mode);
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function styleFor(properties) {
    const hasPci = properties.pci != null && Number.isFinite(Number(properties.pci));
    return {
      fillColor: properties.color,
      fillOpacity: hasPci ? fillOpacity : 0.08,
      color: 'rgba(71, 85, 105, 0.38)',
      weight: borderWidth,
      opacity: borderOpacity,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.2,
    };
  }

  function rebuild() {
    if (!enabled || !currentView || !currentView.band) {
      if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
      result = null;
      renderPanel();
      return;
    }

    try {
      result = buildPciOverlay({ cells, view: currentView });
    } catch (err) {
      emit('error', err);
      // eslint-disable-next-line no-console
      console.error('[pci-overlay]', err);
      result = { fc: { type: 'FeatureCollection', features: [] }, nCells: 0 };
    }

    if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }

    geoLayer = L.geoJSON(result.fc, {
      pane: paneName,
      style: (feature) => styleFor(feature.properties),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties;
        const groupTxt = p.pilotGroup != null ? `Group ${p.pilotGroup}` : '—';
        lyr.bindTooltip(
          `<b>${escapeHtml(p.siteName || p.id)}</b><br>
           PCI: <b>${p.pci != null ? p.pci : '—'}</b> · ${groupTxt}<br>
           Band: ${escapeHtml(p.band || '—')}`,
          { sticky: true, direction: 'top' },
        );
        lyr.on('mouseover', (e) =>
          e.target.setStyle({ weight: 0.8, fillOpacity: 0.34, opacity: 0.36 }),
        );
        lyr.on('mouseout', (e) =>
          e.target.setStyle(styleFor(p)),
        );
      },
    });
    geoLayer.addTo(map);
    if (geoLayer.bringToFront) geoLayer.bringToFront();

    renderPanel();
    emit('ready', { nCells: result.nCells, band: currentView.band });
  }

  // ── Public API ─────────────────────────────────────────────────────

  function setView(view) {
    currentView = view ? { ...view } : null;
    rebuild();
  }
  function setEnabled(flag) {
    enabled = !!flag;
    rebuild();
  }
  function setCells(newCells) {
    cells = Array.isArray(newCells) ? newCells : [];
    // Re-render panel because available band pills depend on cells.
    renderPanel();
    rebuild();
  }
  function on(event, fn) {
    if (listeners[event]) listeners[event].push(fn);
  }
  function destroy() {
    if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
    if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    cells = [];
    currentView = null;
    result = null;
  }

  return { setView, setEnabled, setCells, on, destroy };
}
