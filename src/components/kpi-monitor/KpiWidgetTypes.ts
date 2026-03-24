// ── Independent KPI Widget Types ─────────────────────────────────────
import type { KpiSelection, SplitDimension, DynamicFilter, Granularity } from './types';

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
      granularity: 'auto',
      kpis: [],
      filters: [],
      splitBy: null,
      topN: 5,
      graphType: 'line',
      showLegend: true,
      smooth: true,
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
