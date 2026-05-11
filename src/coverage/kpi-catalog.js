/**
 * kpi-catalog.js
 * ──────────────
 * Catalog of supported KPIs with their unit and "direction":
 *   - 'higher' → bigger value is better (e.g. throughput, RSRP)
 *   - 'lower'  → smaller value is better (e.g. drop rate, latency)
 *
 * The direction inverts the gradient: a "lower-is-better" KPI with a small
 * value will color green, not red.
 *
 * NOTE FOR THE INTEGRATOR: this catalog is the FRONT-END representation.
 * You can either:
 *   (a) hardcode it from your data engineering team's KPI definitions, or
 *   (b) fetch it from the backend at app startup and override DEFAULT_CATALOG.
 *
 * The KPI Overlay module uses it for: legend labels, units, direction-aware
 * normalization, and gradient inversion.
 */

export const DEFAULT_CATALOG = [
  // THROUGHPUT
  { name: 'Den_&_Ave_4G_LTE_DL_User_Thrput', unit: 'Mbps',  direction: 'higher', group: 'THROUGHPUT', tech: ['4G'] },
  { name: 'MAX_TPUT_PDCP_DL_ENB',            unit: 'Mbps',  direction: 'higher', group: 'THROUGHPUT', tech: ['4G','5G'] },
  { name: 'DL_VOLUME_IP_GBytes',             unit: 'GB',    direction: 'higher', group: 'TRAFFIC',    tech: ['4G','5G'] },

  // ACCESS / RETENTION
  { name: 'RRC_SETUP_SR',                    unit: '%',     direction: 'higher', group: 'ACCESS',     tech: ['4G','5G'] },
  { name: 'Flex_ERAB_ADD_INIT_SETUP_ATT',    unit: 'count', direction: 'higher', group: 'ACCESS',     tech: ['4G']     },
  { name: 'ERAB_DROP_RATE',                  unit: '%',     direction: 'lower',  group: 'RETENTION',  tech: ['4G']     },

  // COVERAGE
  { name: 'AVG_RSRP',                        unit: 'dBm',   direction: 'higher', group: 'COVERAGE',   tech: ['4G','5G'] },
  { name: 'AVG_SINR',                        unit: 'dB',    direction: 'higher', group: 'COVERAGE',   tech: ['4G','5G'] },

  // VOICE
  { name: 'CSSR_VOLTE',                      unit: '%',     direction: 'higher', group: 'VOICE',      tech: ['4G']     },

  // MOBILITY
  { name: 'HO_SR_INTRA_FREQ',                unit: '%',     direction: 'higher', group: 'MOBILITY',   tech: ['4G','5G'] },
];

export function findKpi(catalog, name) {
  return catalog.find(k => k.name === name) || null;
}

/* ============================================================================
 * COLOR GRADIENT
 *   - 5-stop palette: red → orange → yellow → light green → green
 *   - colorFromScore(t in [0..1]) where 1 = best (green), 0 = worst (red)
 * ============================================================================ */

export const GRADIENT_STOPS = [
  { t: 0.0,  color: [217,  76,  90] }, // red
  { t: 0.25, color: [241, 149,  63] }, // orange
  { t: 0.5,  color: [245, 208,  80] }, // yellow
  { t: 0.75, color: [168, 220, 106] }, // light green
  { t: 1.0,  color: [ 58, 138,  79] }, // green
];

export function colorFromScore(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const s0 = GRADIENT_STOPS[i];
    const s1 = GRADIENT_STOPS[i + 1];
    if (t >= s0.t && t <= s1.t) {
      const f = (t - s0.t) / (s1.t - s0.t);
      const r = Math.round(s0.color[0] + (s1.color[0] - s0.color[0]) * f);
      const g = Math.round(s0.color[1] + (s1.color[1] - s0.color[1]) * f);
      const b = Math.round(s0.color[2] + (s1.color[2] - s0.color[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(128,128,128)';
}

export function gradientCss() {
  return 'linear-gradient(90deg,' +
    GRADIENT_STOPS.map(s => `rgb(${s.color.join(',')}) ${Math.round(s.t * 100)}%`).join(',') +
    ')';
}
