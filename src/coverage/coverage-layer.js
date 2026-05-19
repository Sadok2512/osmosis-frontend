/**
 * coverage-layer.js — Leaflet integration for the Visual Coverage module.
 *
 * Renders TWO stacked GeoJSON layers from the result of `buildSiteCoverage`:
 *   • base layer  — translucent site footprints (disk ∩ site-Voronoi)
 *   • wedge layer — slightly more saturated sector slices on top of the
 *                   footprint, one per cell, pointing in the antenna's
 *                   azimuth direction. Tooltip lives here (cell-level).
 *
 * The two layers always toggle together. Turning Visual Coverage off
 * removes both from the map.
 *
 * Public API:
 *   const ctl = initVisualCoverage({ map, cells, ... });
 *   ctl.setEnabled(true|false)
 *   ctl.rebuild(newCells)
 *   ctl.on('ready', ({ nSites, nCells, nNeighbors, elapsedMs }) => {...})
 *   ctl.on('status', (state) => {...})  // 'Ready' | 'Loading' | 'Error'
 *   ctl.destroy()
 */

import { buildSiteCoverage } from './coverage.js';
import { mountCoveragePanel } from './coverage-panel.js';

// 2026-05-11 — palette aligned with the legacy KPI legend tiers used in
// SitesMonitor (Bon / Moyen / Critique). `red` is intentionally a violet
// here because the legacy "Critique" tier uses a violet swatch, not red.
// `unknown` is the No-data fallback (neutral grey).
const KPI_COLOR = {
  green:   '#3ddc97',
  orange:  '#e8862c',
  red:     '#9b59b6',
  unknown: '#888888',
};

const TECH_COLOR = {
  '5G': '#27AE60',
  '4G': '#F39C12',
  '3G': '#3498DB',
  '2G': '#8E44AD',
  unknown: '#64748b',
};

function techGroup(value) {
  const v = String(value || '').toUpperCase();
  if (v.includes('NR') || v.includes('5G')) return '5G';
  if (v.includes('LTE') || v.includes('4G')) return '4G';
  if (v.includes('UMTS') || v.includes('WCDMA') || v.includes('3G')) return '3G';
  if (v.includes('GSM') || v.includes('2G')) return '2G';
  return 'unknown';
}

function featureColor(f, fallbackKpi = true) {
  const p = f?.properties || {};
  const explicit = p.color;
  if (explicit) return explicit;
  const tech = techGroup(p.tech || p.primaryTech || (Array.isArray(p.technologies) ? p.technologies.join(' ') : ''));
  if (tech !== 'unknown') return TECH_COLOR[tech];
  return fallbackKpi ? (KPI_COLOR[p.kpi] || TECH_COLOR.unknown) : TECH_COLOR.unknown;
}

export function initVisualCoverage(options) {
  const {
    map,
    cells: initialCells,
    panelMount = null,
    defaultEnabled = false,
    maxRadiusMeters = 1500,
    footprintFillOpacity = 0.35,
    wedgeFillOpacity = 0.45,
    footprintBorderWidth = 0.5,
    wedgeBorderWidth = 0.8,
  } = options;

  if (!map) throw new Error('initVisualCoverage: `map` is required.');
  if (!Array.isArray(initialCells)) throw new Error('initVisualCoverage: `cells` must be an array.');

  // ── state ──
  let cells = initialCells;
  let coverageResult = null;
  let baseLayer = null;   // Leaflet GeoJSON: site footprints
  let wedgeLayer = null;  // Leaflet GeoJSON: sector wedges
  let enabled = defaultEnabled;
  let destroyed = false;
  let rebuildSeq = 0;
  const paneName = 'paneVisualCoverage';

  if (!map.getPane(paneName)) {
    const pane = map.createPane(paneName);
    // Keep Cell Footprint below the regular topology panes (2G/3G/4G/5G
    // start at z-index 300) so site markers and sector beams remain visible
    // above the PCI polygons.
    pane.style.zIndex = '250';
    pane.style.pointerEvents = 'auto';
    pane.style.mixBlendMode = 'multiply';
  }
  const listeners = { ready: [], status: [] };
  const emit = (evt, payload) => listeners[evt]?.forEach((fn) => fn(payload));

  // ── panel (optional) ──
  const panel = panelMount
    ? mountCoveragePanel(panelMount, {
        defaultEnabled,
        onToggle: (on) => setEnabled(on),
      })
    : null;

  function rebuild(newCells) {
    if (destroyed) return;
    if (newCells) cells = newCells;
    const seq = ++rebuildSeq;
    setStatus('Loading');

    // Defer one tick so the panel paints "Loading" before the (possibly
    // CPU-heavy) Voronoi compute blocks the main thread.
    setTimeout(() => {
      try {
        if (destroyed || seq !== rebuildSeq) return;
        const centre = map.getCenter();
        coverageResult = buildSiteCoverage(cells, {
          maxRadiusMeters,
          mapCenter: { lat: centre.lat, lon: centre.lng },
        });
        if (destroyed || seq !== rebuildSeq) return;

        // Tear down any previous layers cleanly before installing new ones.
        if (baseLayer)  { map.removeLayer(baseLayer);  baseLayer = null; }
        if (wedgeLayer) { map.removeLayer(wedgeLayer); wedgeLayer = null; }

        // BASE: site footprints. Lower stack, no hover binding —
        // operators interact with wedges instead.
        baseLayer = L.geoJSON(coverageResult.fc, {
          pane: paneName,
          style: (f) => {
            const color = featureColor(f, false);
            return {
              color,
              weight: footprintBorderWidth,
              opacity: 0.35,
              fillColor: color,
              fillOpacity: Math.min(footprintFillOpacity, 0.16),
            };
          },
        });

        // WEDGES: sector slices on top, more saturated. Tooltip + hover
        // emphasis live here so the operator gets cell-level info.
        wedgeLayer = L.geoJSON(coverageResult.wedgesFc, {
          pane: paneName,
          style: (f) => {
            const color = featureColor(f);
            return {
              color,
              weight: wedgeBorderWidth,
              opacity: 0.65,
              fillColor: color,
              fillOpacity: wedgeFillOpacity,
            };
          },
          onEachFeature: bindWedge,
        });

        if (enabled) {
          baseLayer.addTo(map);
          wedgeLayer.addTo(map);
        }

        if (panel) {
          panel.update({
            nSites: coverageResult.nSites,
            nCells: coverageResult.nCells,
            nNeighbors: coverageResult.nNeighbors,
            elapsedMs: coverageResult.elapsedMs,
          });
        }

        setStatus('Ready');
        emit('ready', {
          nSites: coverageResult.nSites,
          nCells: coverageResult.nCells,
          nNeighbors: coverageResult.nNeighbors,
          elapsedMs: coverageResult.elapsedMs,
        });
      } catch (err) {
        console.error('[coverage] build failed:', err);
        setStatus('Error');
      }
    }, 0);
  }

  function bindWedge(feature, layer) {
    const p = feature.properties;
    const rsrpStr = p.rsrp != null ? ` · ${p.rsrp} dBm` : '';
    const pciColor = p.color || '#888';
    const mergedRow = (p.cellCount > 1)
      ? `<div class="cov-tt-row"><span>cells merged</span><b>${p.cellCount}</b></div>`
      : '';
    const pciLabel = p.pci == null ? '—' : String(p.pci);
    const groupLabel = p.pilotGroup == null ? '—' : String(p.pilotGroup);
    layer.bindTooltip(
      `<div class="cov-tt">
        <div class="cov-tt-name">${escapeHtml(p.cellId || '')}</div>
        <div class="cov-tt-row"><span>site</span><b>${escapeHtml(p.siteName || '')}</b></div>
        <div class="cov-tt-row"><span>tech</span><b>${escapeHtml(p.tech || '—')}${p.band ? ' · ' + escapeHtml(p.band) : ''}</b></div>
        <div class="cov-tt-row"><span>PCI</span><b style="color:${pciColor}">${escapeHtml(pciLabel)} · group ${escapeHtml(groupLabel)}${rsrpStr}</b></div>
        <div class="cov-tt-row"><span>azimuth</span><b>${p.azimuth}° / ${p.beamwidth}°</b></div>
        <div class="cov-tt-row"><span>neighbors</span><b>${p.neighbors}</b></div>
        ${mergedRow}
      </div>`,
      { className: 'cov-tooltip', sticky: true, direction: 'top' },
    );

    // Subtle visual emphasis on hover — slightly thicker border and
    // bumped fill alpha. Sites underneath stay visible.
    layer.on('mouseover', (e) =>
      e.target.setStyle({ weight: wedgeBorderWidth + 1, fillOpacity: wedgeFillOpacity + 0.15 }),
    );
    layer.on('mouseout', (e) =>
      e.target.setStyle({ weight: wedgeBorderWidth, fillOpacity: wedgeFillOpacity }),
    );
  }

  function setEnabled(on) {
    if (destroyed) return;
    enabled = !!on;
    if (panel) panel.setEnabled(enabled);
    // Both layers toggle as a pair so the wedges never appear without
    // their base footprint underneath.
    if (enabled) {
      if (baseLayer  && !map.hasLayer(baseLayer))  baseLayer.addTo(map);
      if (wedgeLayer && !map.hasLayer(wedgeLayer)) wedgeLayer.addTo(map);
    } else {
      if (baseLayer  && map.hasLayer(baseLayer))  map.removeLayer(baseLayer);
      if (wedgeLayer && map.hasLayer(wedgeLayer)) map.removeLayer(wedgeLayer);
    }
  }

  function setStatus(state) {
    if (panel) panel.setStatus(state);
    emit('status', state);
  }

  const api = {
    setEnabled,
    rebuild,
    isEnabled: () => enabled,
    getResult: () => coverageResult,
    on(event, cb) {
      if (listeners[event]) listeners[event].push(cb);
      return api;
    },
    destroy() {
      destroyed = true;
      rebuildSeq++;
      if (baseLayer)  map.removeLayer(baseLayer);
      if (wedgeLayer) map.removeLayer(wedgeLayer);
      baseLayer = null;
      wedgeLayer = null;
      if (panel) panel.destroy();
    },
  };

  // Initial build (uses the cells the caller passed at construction).
  rebuild();
  return api;
}

/** Minimal HTML escape for tooltip strings — protects against
 *  injection if a site/cell name ever contains user-controlled text. */
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
