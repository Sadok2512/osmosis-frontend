/**
 * Shared "Parameter Hub" chart style for the Investigator module.
 *
 * Goal: unify the look of every ECharts chart in the Investigator with the
 * clean, minimalist, premium SaaS style used in Network Explorer →
 * Parameter Hub (DistributionView). Logic and data wiring are unchanged —
 * only visual options.
 *
 * Per the user's decision: "Force teal gradient on everything" (chart strategy).
 */

const FONT = 'Inter, system-ui, sans-serif';

/** Primary palette (PA visual design). */
export const PH_COLORS = {
  primary: '#00685f',
  accent: '#6bd8cb',
  tealLight: '#14B8A6',
  tealDark: '#0E7C66',
  tealHoverLight: '#2DD4BF',
  tealHoverDark: '#14B8A6',
  shadow: 'rgba(14, 124, 102, 0.18)',
  shadowHover: 'rgba(20, 184, 166, 0.35)',
  axisLine: 'rgba(15,23,42,0.35)',
  splitLine: 'rgba(15,23,42,0.08)',
  border: 'rgba(15,23,42,0.15)',
  gridLine: 'rgba(15,23,42,0.08)',
  labelStrong: '#0f172a',
  labelMuted: '#6B7280',
  labelSubtle: '#9ca3af',
  nullPoint: 'hsl(0 72% 51%)',
  nullPointBorder: 'hsl(0 0% 100%)',
  tooltipBg: 'rgba(15,23,42,0.95)',
  tooltipBorder: 'rgba(255,255,255,0.08)',
  tooltipText: '#f8fafc',
} as const;

/** Vertical teal gradient (top → bottom) used by every bar/area in the module. */
export const phTealGradient = (
  light: string = PH_COLORS.tealLight,
  dark: string = PH_COLORS.tealDark,
) => ({
  type: 'linear' as const,
  x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [
    { offset: 0, color: light },
    { offset: 1, color: dark },
  ],
});

/** Subtle area-fill gradient used under line series. */
export const phTealAreaGradient = () => ({
  type: 'linear' as const,
  x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [
    { offset: 0, color: 'rgba(20, 184, 166, 0.22)' },
    { offset: 1, color: 'rgba(20, 184, 166, 0.02)' },
  ],
});

/** Dark tooltip (PA style — dark bg, light text). */
export const phTooltip = (overrides: Record<string, any> = {}) => ({
  trigger: 'axis' as const,
  backgroundColor: PH_COLORS.tooltipBg,
  borderColor: PH_COLORS.tooltipBorder,
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: PH_COLORS.tooltipText, fontSize: 11, fontWeight: 600, fontFamily: FONT },
  extraCssText:
    'box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45); border-radius: 10px;',
  axisPointer: {
    type: 'cross' as const,
    crossStyle: { color: 'rgba(59,130,246,0.25)' },
    lineStyle: { color: 'rgba(59,130,246,0.25)', width: 1 },
  },
  ...overrides,
});

/** X axis (PA style — visible line & ticks, compact labels). */
export const phXAxis = (overrides: Record<string, any> = {}) => ({
  axisLine: { lineStyle: { color: 'rgba(15,23,42,0.35)' } },
  axisTick: { show: true },
  axisLabel: {
    fontSize: 9,
    color: '#9ca3af',
    fontFamily: FONT,
    margin: 12,
  },
  splitLine: { show: false },
  ...overrides,
});

/** Y axis (PA style — visible axis line, dashed split lines). */
export const phYAxis = (overrides: Record<string, any> = {}) => ({
  axisLine: { show: true, lineStyle: { color: 'rgba(15,23,42,0.15)' } },
  axisTick: { show: true },
  axisLabel: {
    color: '#9ca3af',
    fontSize: 9,
    fontFamily: FONT,
  },
  splitLine: { lineStyle: { color: 'rgba(15,23,42,0.08)', type: 'dashed' as const } },
  ...overrides,
});

/** Premium bar item style: vertical teal gradient, rounded top, soft shadow. */
export const phBarItemStyle = () => ({
  borderRadius: [8, 8, 0, 0],
  color: phTealGradient(),
  shadowColor: PH_COLORS.shadow,
  shadowBlur: 8,
  shadowOffsetY: 2,
});

/** Hover (emphasis) state for bars. */
export const phBarEmphasis = () => ({
  itemStyle: {
    color: phTealGradient(PH_COLORS.tealHoverLight, PH_COLORS.tealHoverDark),
    shadowBlur: 16,
    shadowColor: PH_COLORS.shadowHover,
  },
});

/** Premium line series style. */
export const phLineStyle = (width = 2.5) => ({
  width,
  color: PH_COLORS.tealDark,
  shadowColor: PH_COLORS.shadow,
  shadowBlur: 6,
  shadowOffsetY: 2,
});

/** Smooth animation defaults. */
export const phAnimation = {
  animationDuration: 700,
  animationEasing: 'cubicOut' as const,
};
