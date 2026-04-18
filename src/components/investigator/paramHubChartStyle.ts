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

/** Primary teal palette (matches Parameter Hub DistributionView). */
export const PH_COLORS = {
  tealLight: '#14B8A6',
  tealDark: '#0E7C66',
  tealHoverLight: '#2DD4BF',
  tealHoverDark: '#14B8A6',
  shadow: 'rgba(14, 124, 102, 0.18)',
  shadowHover: 'rgba(20, 184, 166, 0.35)',
  axisLine: '#E5E7EB',
  splitLine: '#F1F5F9',
  labelStrong: '#1F2937',
  labelMuted: '#6B7280',
  labelSubtle: '#9CA3AF',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(15, 23, 42, 0.06)',
  accent: '#0E7C66',
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

/** Premium light tooltip (white, soft shadow, teal accent header). */
export const phTooltip = (overrides: Record<string, any> = {}) => ({
  trigger: 'axis' as const,
  backgroundColor: PH_COLORS.tooltipBg,
  borderColor: PH_COLORS.tooltipBorder,
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: PH_COLORS.labelStrong, fontSize: 12, fontFamily: FONT },
  extraCssText:
    'box-shadow: 0 12px 32px -8px rgba(15, 23, 42, 0.18); border-radius: 10px;',
  axisPointer: {
    type: 'line' as const,
    lineStyle: { color: 'rgba(14, 124, 102, 0.25)', width: 1, type: 'dashed' as const },
    shadowStyle: { color: 'rgba(14, 124, 102, 0.06)' },
  },
  ...overrides,
});

/** Minimalist X axis (light line, no ticks, refined typography). */
export const phXAxis = (overrides: Record<string, any> = {}) => ({
  axisLine: { lineStyle: { color: PH_COLORS.axisLine } },
  axisTick: { show: false },
  axisLabel: {
    fontSize: 11,
    color: PH_COLORS.labelMuted,
    fontFamily: FONT,
    margin: 12,
  },
  splitLine: { show: false },
  ...overrides,
});

/** Minimalist Y axis (no axis line, soft horizontal split lines). */
export const phYAxis = (overrides: Record<string, any> = {}) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: {
    color: PH_COLORS.labelSubtle,
    fontSize: 11,
    fontFamily: FONT,
  },
  splitLine: { lineStyle: { color: PH_COLORS.splitLine, type: 'solid' as const } },
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
