// ── Independent KPI Widget Types ─────────────────────────────────────
import type { KpiSelection, SplitDimension, DynamicFilter, Granularity } from './types';

export interface YAxisWidgetConfig {
  mode: 'auto' | 'manual';
  min?: number;
  max?: number;
}

export interface KpiWidgetConfig {
  id: string;
  title: string;
  // Per-widget date range
  dateFrom: string;
  dateTo: string;
  // Period preset (for quick selection)
  periodPreset: '24h' | '7d' | '14d' | '30d' | '90d' | 'custom';
  // Granularity
  granularity: Granularity | 'auto';
  // KPI selections (independent per widget)
  kpis: KpiSelection[];
  // Filters (independent per widget)
  filters: DynamicFilter[];
  // Split dimension
  splitBy: SplitDimension | null;
  topN: number;
  // Visual config
  graphType: 'line' | 'area' | 'bar' | 'stacked_area';
  showLegend: boolean;
  smooth: boolean;
  // Advanced graph settings (Investigator-style)
  showSymbols: boolean;
  showArea: boolean;
  showThresholds: boolean;
  showAverage: boolean;
  showGrid: boolean;
  lineWidth: number;
  yAxis?: YAxisWidgetConfig;
  yAxisRight?: YAxisWidgetConfig;
  /** Maps kpi_key → 0 (left) or 1 (right). Default 0. */
  yAxisAssignments?: Record<string, number>;
  /** Maps kpi_key → chart type override */
  chartTypePerKpi?: Record<string, string>;
  // Status
  isLoading?: boolean;
  lastRefreshed?: string;
  // Color accent for the widget border
  accentColor?: string;
}

export interface KpiWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KpiWidgetItem {
  config: KpiWidgetConfig;
  layout: KpiWidgetLayout;
}

let widgetCounter = 0;

export function createEmptyKpiWidget(index?: number): KpiWidgetItem {
  widgetCounter++;
  const idx = index ?? widgetCounter;
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  return {
    config: {
      id: `kpi_widget_${Date.now()}_${idx}`,
      title: `Widget ${idx}`,
      dateFrom,
      dateTo,
      periodPreset: '7d',
      granularity: '1d',
      kpis: [],
      filters: [],
      splitBy: null,
      topN: 5,
      graphType: 'line',
      showLegend: true,
      smooth: true,
      showSymbols: false,
      showArea: false,
      showThresholds: true,
      showAverage: false,
      showGrid: true,
      lineWidth: 2,
    },
    layout: {
      x: 0,
      y: 0,
      w: 6,
      h: 5,
    },
  };
}

export function duplicateKpiWidget(source: KpiWidgetItem): KpiWidgetItem {
  widgetCounter++;
  return {
    config: {
      ...JSON.parse(JSON.stringify(source.config)),
      id: `kpi_widget_${Date.now()}_${widgetCounter}`,
      title: `${source.config.title} (copy)`,
    },
    layout: { ...source.layout, y: source.layout.y + source.layout.h },
  };
}
