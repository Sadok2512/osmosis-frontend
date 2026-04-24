/**
 * PA Chart Style helpers — exposes the look-and-feel of Precision Architect's
 * PAEChart so the Investigator (KPIGraphs + CounterGraphSection) can render
 * with the same premium chart language: centered plain legend with full
 * labels, per-series tooltip with axis tag + unit suffix, colored axes when
 * dual-axis is active, dashed split lines, gradient area fills, jalons
 * (markLine / markArea) and threshold horizontal lines.
 *
 * This is purely a styling layer — it does not change data wiring.
 */

const FONT = 'Inter, system-ui, sans-serif';

export const PA_PALETTE = [
  '#14746C', '#F59E0B', '#EF4444', '#6bd8cb', '#8b5cf6',
  '#3b82f6', '#10b981', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#d946ef', '#0ea5e9',
  '#eab308', '#a855f7', '#f43f5e', '#22c55e', '#0891b2',
];

const LABEL_COLOR = '#1e293b';
const AXIS_LINE = 'rgba(15,23,42,0.35)';
const SPLIT_LINE = 'rgba(15,23,42,0.08)';

/** Friendly-name shortener: replaces underscores with spaces, no truncation. */
export function paShortenLabel(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/[_]+/g, ' ');
}

/** Append an alpha byte (0–255) to a #rrggbb color. */
export function paHexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  const aHex = a.toString(16).padStart(2, '0');
  return `${hex}${aHex}`;
}

/** PA-style gradient area fill for a single color. */
export function paAreaGradient(color: string, opacityRatio = 0.66) {
  return {
    type: 'linear' as const,
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: paHexAlpha(color, Math.round(opacityRatio * 0xaa)) },
      { offset: 1, color: paHexAlpha(color, 0) },
    ],
  };
}

/**
 * PA-style **centered** legend with full labels, plain mode (no pagination,
 * lines wrap below the chart instead).
 */
export function paLegend(opts: {
  show: boolean;
  data: string[];
  position?: 'bottom' | 'right';
}) {
  const { show, data, position = 'bottom' } = opts;
  return {
    show,
    type: 'plain' as const,
    data,
    bottom: position === 'bottom' ? 4 : undefined,
    top: position === 'right' ? ('middle' as const) : undefined,
    right: position === 'right' ? 8 : undefined,
    left: position === 'right' ? undefined : ('center' as const),
    width: position === 'right' ? 180 : '94%',
    orient: position === 'right' ? ('vertical' as const) : ('horizontal' as const),
    align: 'left' as const,
    textStyle: {
      fontSize: 11,
      color: LABEL_COLOR,
      fontWeight: 600 as const,
      lineHeight: 16,
      fontFamily: FONT,
      padding: [0, 0, 0, 3] as [number, number, number, number],
    },
    icon: 'roundRect' as const,
    itemWidth: 14,
    itemHeight: 8,
    itemGap: 12,
    padding: [2, 4, 2, 4] as [number, number, number, number],
    formatter: (name: string) => paShortenLabel(name),
    tooltip: { show: true, formatter: (params: any) => params.name },
    selectedMode: true as const,
  };
}

/**
 * Estimate how many vertical rows the centered legend will need. Used to
 * size grid.bottom so the last legend row is never clipped.
 */
export function paEstimateLegendRows(labels: string[], availableWidth = 600): number {
  const ICON_WIDTH = 14;
  const ICON_TEXT_GAP = 5;
  const ITEM_GAP = 12;
  const CHAR_WIDTH = 6.6;
  const perItemWidth = (label: string) =>
    ICON_WIDTH + ICON_TEXT_GAP + Math.max(20, label.length * CHAR_WIDTH) + ITEM_GAP;

  let used = 0;
  let rows = 1;
  for (const name of labels) {
    const w = perItemWidth(paShortenLabel(name));
    if (used + w > availableWidth && used > 0) {
      rows += 1;
      used = w;
    } else {
      used += w;
    }
  }
  return rows;
}

/** PA-style tooltip with per-series unit + axis tag (L/R). */
export function paTooltip(opts: {
  unitByName?: Map<string, string>;
  axisByName?: Map<string, 'L' | 'R'>;
}) {
  const { unitByName, axisByName } = opts;
  return {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    padding: [8, 12],
    extraCssText: 'box-shadow: 0 12px 32px -8px rgba(15,23,42,0.18); border-radius: 8px;',
    textStyle: { color: '#0f172a', fontSize: 11, fontWeight: 600, fontFamily: FONT },
    axisPointer: {
      type: 'line' as const,
      lineStyle: { color: PA_PALETTE[0], type: 'dashed' as const, width: 1 },
    },
    formatter: (params: any) => {
      const arr = Array.isArray(params) ? params : [params];
      if (arr.length === 0) return '';
      const fmt = (v: any) => {
        if (v == null || Number.isNaN(v)) return '–';
        const n = Number(v);
        const abs = Math.abs(n);
        if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
        return abs >= 100 ? n.toFixed(0) : n.toFixed(2);
      };
      const header = `<div style="font-weight:700;margin-bottom:4px;color:#0f172a">${arr[0]?.axisValueLabel ?? arr[0]?.name ?? ''}</div>`;
      const rows = arr.map((p: any) => {
        const u = unitByName?.get(p.seriesName) ?? '';
        const ax = axisByName?.get(p.seriesName);
        const axisTag = ax ? `<span style="opacity:0.4;font-size:9px;margin-left:2px">[${ax}]</span>` : '';
        return `<div style="display:flex;align-items:center;gap:6px;line-height:18px">
          <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.color}"></span>
          <span style="flex:1;color:#334155">${p.seriesName}</span>
          <span style="font-weight:700;color:#0f172a">${fmt(p.value)}${u ? ' ' + u : ''}${axisTag}</span>
        </div>`;
      }).join('');
      return header + rows;
    },
  };
}

/**
 * PA-style Y axis — colored when dual-axis is active so users immediately
 * know which series belongs to which side. Uses dashed split lines and
 * displays the unit as the axis name.
 */
export function paYAxis(opts: {
  position: 'left' | 'right';
  unit?: string;
  color?: string;
  isDualAxis: boolean;
  showGrid?: boolean;
  min?: number;
  max?: number;
}) {
  const { position, unit, color, isDualAxis, showGrid = true, min, max } = opts;
  const tinted = isDualAxis && color ? color : LABEL_COLOR;
  return {
    type: 'value' as const,
    position,
    name: unit || undefined,
    nameTextStyle: { color: tinted, fontSize: 10, fontWeight: 600 },
    nameGap: 8,
    scale: true,
    min,
    max,
    axisLine: { show: true, lineStyle: { color: isDualAxis && color ? color : AXIS_LINE, width: 1 } },
    axisTick: { show: true, lineStyle: { color: isDualAxis && color ? color : AXIS_LINE } },
    axisLabel: {
      fontSize: 11,
      color: tinted,
      fontWeight: 600,
      fontFamily: FONT,
      margin: 8,
    },
    splitLine: showGrid && position === 'left'
      ? { lineStyle: { color: SPLIT_LINE, type: 'dashed' as const } }
      : { show: false },
  };
}

/** PA-style X axis. */
export function paXAxis(opts: { data: any[]; boundaryGap?: boolean; formatter?: (v: any) => string; interval?: number | 'auto' }) {
  const { data, boundaryGap = false, formatter, interval } = opts;
  return {
    type: 'category' as const,
    data,
    boundaryGap,
    axisLine: { show: true, lineStyle: { color: AXIS_LINE, width: 1 } },
    axisTick: { show: true, lineStyle: { color: AXIS_LINE } },
    axisLabel: {
      fontSize: 11,
      color: LABEL_COLOR,
      fontWeight: 600,
      fontFamily: FONT,
      margin: 10,
      ...(formatter ? { formatter } : {}),
      ...(interval != null ? { interval } : {}),
    },
    splitLine: { show: false },
  };
}

/** Compute a sensible grid for a PA-style chart. */
export function paGrid(opts: {
  legendRows: number;
  legendPos?: 'bottom' | 'right';
  hasRightAxis?: boolean;
  hasBarSeries?: boolean;
  showLegend: boolean;
}) {
  const { legendRows, legendPos = 'bottom', hasRightAxis = false, hasBarSeries = false, showLegend } = opts;
  const ROW_HEIGHT = 22;
  const legendBlock = legendPos === 'bottom' && showLegend ? legendRows * ROW_HEIGHT + 12 : 0;
  return {
    top: 16,
    right: legendPos === 'right' && showLegend ? 210 : (hasRightAxis ? 56 : 20),
    bottom: legendPos === 'bottom' && showLegend ? legendBlock + 32 : 32,
    left: hasBarSeries ? 32 : 12,
    containLabel: true,
  };
}

/** PA-style line/area series factory (single source of truth for visual props). */
export function paLineSeries(opts: {
  name: string;
  color: string;
  data: (number | null)[];
  smooth?: boolean;
  lineWidth?: number;
  lineType?: 'solid' | 'dashed' | 'dotted';
  showArea?: boolean;
  yAxisIndex?: 0 | 1;
  showSymbol?: boolean;
  step?: 'start' | 'middle' | 'end' | false;
  stack?: string;
  z?: number;
}) {
  const {
    name, color, data, smooth = true, lineWidth = 2.5, lineType = 'solid',
    showArea = true, yAxisIndex = 0, showSymbol = false, step = false, stack, z,
  } = opts;
  return {
    name,
    type: 'line' as const,
    smooth: step ? false : smooth,
    step: step || false,
    connectNulls: true,
    showSymbol,
    symbol: showSymbol ? 'circle' : 'none',
    symbolSize: showSymbol ? 5 : 0,
    yAxisIndex,
    data,
    z: z ?? 2,
    stack,
    lineStyle: { color, width: lineWidth, type: lineType },
    itemStyle: { color, borderRadius: 0 },
    areaStyle: showArea ? { color: paAreaGradient(color) } : undefined,
    emphasis: { focus: 'series' as const, lineStyle: { width: lineWidth + 1 } },
  };
}

/** PA-style bar series factory. */
export function paBarSeries(opts: {
  name: string;
  color: string;
  data: (number | null)[];
  yAxisIndex?: 0 | 1;
  stack?: string;
  z?: number;
}) {
  const { name, color, data, yAxisIndex = 0, stack, z } = opts;
  return {
    name,
    type: 'bar' as const,
    yAxisIndex,
    data,
    stack,
    barGap: '10%',
    barCategoryGap: '35%',
    barMaxWidth: 28,
    barMinHeight: 4,
    z: z ?? (yAxisIndex === 1 ? 3 : 2),
    itemStyle: { color, borderRadius: [3, 3, 0, 0] as [number, number, number, number] },
    emphasis: { focus: 'series' as const },
  };
}

/**
 * Build PA-style markLine + markArea data for jalons (vertical lines /
 * highlighted ranges) and horizontal threshold lines. Returns an object
 * `{ markLineData, markAreaData }` ready to attach to the first series.
 */
export interface PAJalon {
  id: string;
  label: string;
  date: string;
  endDate?: string;
  color: string;
  opacity?: number;
}
export interface PAThreshold {
  label: string;
  value: number;
  color: string;
  axis?: 'left' | 'right';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export function paBuildMarks(opts: {
  jalons?: PAJalon[];
  thresholds?: PAThreshold[];
  hasRightAxis?: boolean;
}) {
  const { jalons = [], thresholds = [], hasRightAxis = false } = opts;
  const lineTypeFor = (ls?: string): 'solid' | 'dashed' | 'dotted' =>
    ls === 'dashed' ? 'dashed' : ls === 'dotted' ? 'dotted' : 'solid';

  const hexAlphaJ = (hex: string, alpha: number) => {
    const c = hex.replace('#', '');
    const f = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const r = parseInt(f.slice(0, 2), 16);
    const g = parseInt(f.slice(2, 4), 16);
    const b = parseInt(f.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const thresholdLines = thresholds.map((t) => ({
    name: t.label,
    yAxis: t.value,
    yAxisIndex: t.axis === 'right' && hasRightAxis ? 1 : 0,
    lineStyle: { color: t.color, width: 2, type: lineTypeFor(t.lineStyle) },
    label: {
      show: true, position: 'insideEndTop' as const,
      formatter: t.label, color: t.color, fontWeight: 700, fontSize: 10,
      backgroundColor: 'rgba(255,255,255,0.85)', padding: [2, 4], borderRadius: 3,
    },
  }));

  const pointJalons = jalons.filter((j) => !j.endDate || j.endDate === j.date);
  const rangeJalons = jalons.filter((j) => j.endDate && j.endDate !== j.date);

  const jalonLines = pointJalons.map((j) => ({
    name: j.label,
    xAxis: j.date,
    lineStyle: {
      color: j.color,
      width: 1.5,
      type: 'dashed' as const,
      opacity: j.opacity ?? 0.8,
    },
    label: {
      show: true, position: 'insideEndTop' as const,
      formatter: j.label, color: j.color, fontWeight: 700, fontSize: 10,
      backgroundColor: 'rgba(255,255,255,0.85)', padding: [2, 4], borderRadius: 3,
    },
  }));

  const markAreaData = rangeJalons.map((j) => ([
    {
      name: j.label,
      xAxis: j.date,
      itemStyle: {
        color: hexAlphaJ(j.color, (j.opacity ?? 0.8) * 0.25),
        borderColor: j.color,
        borderWidth: 1,
        borderType: 'dashed' as const,
      },
      label: {
        show: true,
        position: 'insideTop' as const,
        formatter: j.label,
        color: j.color,
        fontWeight: 700,
        fontSize: 10,
        backgroundColor: 'rgba(255,255,255,0.85)',
        padding: [2, 4],
        borderRadius: 3,
      },
    },
    { xAxis: j.endDate! },
  ]));

  return {
    markLineData: [...thresholdLines, ...jalonLines],
    markAreaData,
  };
}
