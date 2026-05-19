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

const BASEMAP_VISIBILITY = {
  satellite: { fill: 0.36, baseFill: 0.12, edge: 0.92, halo: 0.62, lightness: 64, saturation: 72 },
  dark:      { fill: 0.34, baseFill: 0.11, edge: 0.86, halo: 0.52, lightness: 62, saturation: 68 },
  street:    { fill: 0.28, baseFill: 0.09, edge: 0.72, halo: 0.34, lightness: 58, saturation: 62 },
  light:     { fill: 0.26, baseFill: 0.08, edge: 0.66, halo: 0.26, lightness: 54, saturation: 58 },
};

const FOOTPRINT_OUTLINE = {
  satellite: 'rgba(0,0,0,0.78)',
  dark:      'rgba(0,0,0,0.72)',
  street:    'rgba(0,0,0,0.68)',
  light:     'rgba(0,0,0,0.62)',
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
      case gg: h = (bb - rr) / d + 2; break;
      default: h = (rr - gg) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function normalizedOverlayColor(color, basemapKind) {
  const rgb = hexToRgb(color);
  if (!rgb) return color || TECH_COLOR.unknown;
  const hsl = rgbToHsl(rgb);
  const visibility = BASEMAP_VISIBILITY[basemapKind] || BASEMAP_VISIBILITY.light;
  const saturation = clamp(Math.max(hsl.s, visibility.saturation), 48, 78);
  const lightness = clamp(Math.max(hsl.l, visibility.lightness), 48, 70);
  return `hsl(${Math.round(hsl.h)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
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
    basemapKind = 'light',
  } = options;
  const visibility = BASEMAP_VISIBILITY[basemapKind] || BASEMAP_VISIBILITY.light;

  if (!map) throw new Error('initVisualCoverage: `map` is required.');
  if (!Array.isArray(initialCells)) throw new Error('initVisualCoverage: `cells` must be an array.');

  // ── state ──
  let cells = initialCells;
  let coverageResult = null;
  let baseLayer = null;   // Leaflet GeoJSON: site footprints
  let haloLayer = null;   // Leaflet GeoJSON: luminous separator below wedges
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
    pane.style.mixBlendMode = 'normal';
    pane.style.filter = basemapKind === 'satellite'
      ? 'drop-shadow(0 0 2px rgba(0,0,0,0.34))'
      : 'none';
  } else {
    const pane = map.getPane(paneName);
    pane.style.mixBlendMode = 'normal';
    pane.style.filter = basemapKind === 'satellite'
      ? 'drop-shadow(0 0 2px rgba(0,0,0,0.34))'
      : 'none';
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
        if (haloLayer)  { map.removeLayer(haloLayer);  haloLayer = null; }
        if (wedgeLayer) { map.removeLayer(wedgeLayer); wedgeLayer = null; }

        // BASE: site footprints. Lower stack, no hover binding —
        // operators interact with wedges instead.
        baseLayer = L.geoJSON(coverageResult.fc, {
          pane: paneName,
          style: (f) => {
            const color = normalizedOverlayColor(featureColor(f, false), basemapKind);
            const outline = FOOTPRINT_OUTLINE[basemapKind] || FOOTPRINT_OUTLINE.light;
            return {
              color: outline,
              weight: Math.max(0.55, footprintBorderWidth),
              opacity: 0.26,
              fillColor: color,
              fillOpacity: Math.min(footprintFillOpacity, visibility.baseFill),
              lineCap: 'round',
              lineJoin: 'round',
              smoothFactor: 1.1,
            };
          },
        });

        // HALO: same visual language as KPI Overlay, but with a soft
        // dark separator so every Voronoi cell reads as a polygon.
        haloLayer = L.geoJSON(coverageResult.wedgesFc, {
          pane: paneName,
          interactive: false,
          style: (f) => {
            const color = normalizedOverlayColor(featureColor(f), basemapKind);
            const outline = FOOTPRINT_OUTLINE[basemapKind] || FOOTPRINT_OUTLINE.light;
            return {
              color: outline,
              weight: Math.max(2.4, wedgeBorderWidth + 2.1),
              opacity: Math.min(visibility.halo, 0.46),
              fillColor: color,
              fillOpacity: 0.02,
              lineCap: 'round',
              lineJoin: 'round',
              smoothFactor: 1.15,
            };
          },
        });

        // WEDGES: sector slices on top, more saturated. Tooltip + hover
        // emphasis live here so the operator gets cell-level info.
        wedgeLayer = L.geoJSON(coverageResult.wedgesFc, {
          pane: paneName,
          style: (f) => {
            const color = normalizedOverlayColor(featureColor(f), basemapKind);
            const outline = FOOTPRINT_OUTLINE[basemapKind] || FOOTPRINT_OUTLINE.light;
            return {
              color: outline,
              weight: basemapKind === 'satellite' ? Math.max(1.05, wedgeBorderWidth) : Math.max(0.85, wedgeBorderWidth),
              opacity: visibility.edge,
              fillColor: color,
              fillOpacity: Math.min(wedgeFillOpacity, visibility.fill),
              lineCap: 'round',
              lineJoin: 'round',
              smoothFactor: 1.15,
            };
          },
          onEachFeature: bindWedge,
        });

        if (enabled) {
          baseLayer.addTo(map);
          haloLayer.addTo(map);
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
      e.target.setStyle({
        weight: wedgeBorderWidth + 1.2,
        fillOpacity: Math.min(visibility.fill + 0.14, 0.52),
      }),
    );
    layer.on('mouseout', (e) =>
      e.target.setStyle({
        weight: basemapKind === 'satellite' ? Math.max(1.05, wedgeBorderWidth) : Math.max(0.85, wedgeBorderWidth),
        fillOpacity: Math.min(wedgeFillOpacity, visibility.fill),
      }),
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
      if (haloLayer  && !map.hasLayer(haloLayer))  haloLayer.addTo(map);
      if (wedgeLayer && !map.hasLayer(wedgeLayer)) wedgeLayer.addTo(map);
    } else {
      if (baseLayer  && map.hasLayer(baseLayer))  map.removeLayer(baseLayer);
      if (haloLayer  && map.hasLayer(haloLayer))  map.removeLayer(haloLayer);
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
      if (haloLayer)  map.removeLayer(haloLayer);
      if (wedgeLayer) map.removeLayer(wedgeLayer);
      baseLayer = null;
      haloLayer = null;
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
