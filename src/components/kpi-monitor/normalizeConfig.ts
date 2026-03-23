// ── Config Normalizer — Backward Compatibility Layer ──────────────
// Ensures old saved configs work with new chart builder features.
// All new fields are optional with sensible defaults.

import type { KpiSelection, AxisSide, AggFunc, GraphType, LineStyle } from './types';
import type { WidgetAxisConfig, WidgetThreshold, WidgetGraphConfig, AxisSideConfig } from './GraphSettingsPanel';

// ── Default values ──

const DEFAULT_AXIS_SIDE: AxisSideConfig = {
  title: '',
  min: 'auto',
  max: 'auto',
  unit: '',
  decimals: 2,
  invert: false,
};

const DEFAULT_SERIES_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#22c55e',
];

export function getDefaultSeriesColor(index: number): string {
  return DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length];
}

// ── Normalize a single KPI selection ──

export function normalizeKpiSelection(raw: Partial<KpiSelection>, index: number = 0): KpiSelection {
  return {
    id: raw.id || crypto.randomUUID(),
    kpi_key: raw.kpi_key || '',
    agg: raw.agg || 'avg',
    axis: raw.axis || 'left',
    color: raw.color || getDefaultSeriesColor(index),
    graphType: raw.graphType || 'line',
    splitOverride: raw.splitOverride ?? null,
    yAxisIndex: raw.yAxisIndex ?? (raw.axis === 'right' ? 1 : 0),
    label: raw.label,
    lineWidth: raw.lineWidth,
    lineStyle: raw.lineStyle || 'solid',
    showMarkers: raw.showMarkers,
    opacity: raw.opacity ?? 1,
    visible: raw.visible ?? true,
    order: raw.order ?? index,
  };
}

// ── Normalize axis config (flat legacy → dual axis) ──

export function normalizeAxisConfig(raw?: Partial<WidgetAxisConfig>): WidgetAxisConfig {
  if (!raw) {
    return {
      yTitle: '', yMin: 'auto', yMax: 'auto', yUnit: '', yDecimals: 2, yInvert: false,
      xMode: 'date', xFormat: 'short', xShowGrid: false,
      leftAxis: { ...DEFAULT_AXIS_SIDE },
      rightAxis: { ...DEFAULT_AXIS_SIDE },
    };
  }

  // If leftAxis already exists, it's a new-format config
  const leftAxis: AxisSideConfig = raw.leftAxis || {
    title: raw.yTitle || '',
    min: raw.yMin ?? 'auto',
    max: raw.yMax ?? 'auto',
    unit: raw.yUnit || '',
    decimals: raw.yDecimals ?? 2,
    invert: raw.yInvert ?? false,
  };

  const rightAxis: AxisSideConfig = raw.rightAxis || { ...DEFAULT_AXIS_SIDE };

  return {
    yTitle: raw.yTitle || leftAxis.title,
    yMin: raw.yMin ?? leftAxis.min,
    yMax: raw.yMax ?? leftAxis.max,
    yUnit: raw.yUnit || leftAxis.unit,
    yDecimals: raw.yDecimals ?? leftAxis.decimals,
    yInvert: raw.yInvert ?? leftAxis.invert,
    xMode: raw.xMode || 'date',
    xFormat: raw.xFormat || 'short',
    xShowGrid: raw.xShowGrid ?? false,
    leftAxis,
    rightAxis,
  };
}

// ── Normalize threshold (add axis field) ──

export function normalizeThreshold(raw: Partial<WidgetThreshold>): WidgetThreshold {
  return {
    id: raw.id || crypto.randomUUID(),
    value: raw.value ?? 0,
    label: raw.label || '',
    color: raw.color || '#ef4444',
    style: raw.style || 'dashed',
    axis: raw.axis || 'left',
    visible: raw.visible ?? true,
  };
}

// ── Normalize graph config ──

export function normalizeGraphConfig(raw?: Partial<WidgetGraphConfig>): WidgetGraphConfig {
  return {
    smooth: raw?.smooth ?? false,
    lineWidth: raw?.lineWidth ?? 2,
    showSymbols: raw?.showSymbols ?? false,
    gridIntensity: raw?.gridIntensity || 'light',
    showVerticalGrid: raw?.showVerticalGrid ?? false,
    backgroundColor: raw?.backgroundColor || 'transparent',
    transparentBg: raw?.transparentBg ?? true,
    showLegend: raw?.showLegend ?? true,
    legendPosition: raw?.legendPosition || 'top',
    grid: {
      enabled: raw?.grid?.enabled ?? true,
      opacity: raw?.grid?.opacity ?? 20,
      type: raw?.grid?.type || 'both',
    },
    calendar: {
      highlightWeekends: raw?.calendar?.highlightWeekends ?? true,
      weekendColor: raw?.calendar?.weekendColor || '#E5E7EB',
      weekendOpacity: raw?.calendar?.weekendOpacity ?? 10,
    },
    levels: {
      primary: raw?.levels?.primary ?? null,
      secondary: raw?.levels?.secondary ?? null,
    },
  };
}

// ── Normalize full chart config (for save/load) ──

export interface NormalizedChartConfig {
  series: KpiSelection[];
  axisConfig: WidgetAxisConfig;
  graphConfig: WidgetGraphConfig;
  thresholds: WidgetThreshold[];
  milestones: Array<{
    id: string;
    date: string;
    label: string;
    color: string;
    visible?: boolean;
  }>;
}

export function normalizeChartConfig(raw: any): NormalizedChartConfig {
  const series = (raw?.series || raw?.selectedKpis || []).map(
    (s: any, i: number) => normalizeKpiSelection(s, i)
  );

  return {
    series,
    axisConfig: normalizeAxisConfig(raw?.axisConfig),
    graphConfig: normalizeGraphConfig(raw?.graphConfig),
    thresholds: (raw?.thresholds || []).map(normalizeThreshold),
    milestones: (raw?.milestones || []).map((m: any) => ({
      id: m.id || crypto.randomUUID(),
      date: m.date || m.timestamp || '',
      label: m.label || '',
      color: m.color || '#3b82f6',
      visible: m.visible ?? true,
    })),
  };
}

// ── Helper: get effective axis config for a side ──

export function getAxisSideConfig(axisConfig: WidgetAxisConfig, side: AxisSide): AxisSideConfig {
  if (side === 'right' && axisConfig.rightAxis) return axisConfig.rightAxis;
  if (side === 'left' && axisConfig.leftAxis) return axisConfig.leftAxis;
  // Fallback: use flat legacy fields for left
  return {
    title: axisConfig.yTitle || '',
    min: axisConfig.yMin ?? 'auto',
    max: axisConfig.yMax ?? 'auto',
    unit: axisConfig.yUnit || '',
    decimals: axisConfig.yDecimals ?? 2,
    invert: axisConfig.yInvert ?? false,
  };
}
