import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartWidgetConfig, DEFAULT_CHART_CONFIG } from '../types';

interface PAEChartProps {
  variant?: 'editor' | 'presentation';
  height?: number | string;
  data?: { time: string; value: number; secondary?: number }[];
  /** New: full widget config from settings panel. When provided, supersedes legacy props. */
  config?: ChartWidgetConfig;
  /** Bumped each time the user clicks "Appliquer" / "Save" in settings. 0 (or undefined) = never applied yet. */
  appliedRev?: number;
  /** Per-metric series fetched from the backend (metricId → ordered list of {time,value}). */
  seriesByMetric?: Record<string, { time: string; value: number }[]>;
  /** Shared X axis labels (timestamps). When provided, supersedes `data`. */
  xAxisLabels?: string[];
  /** Loading flag — shown as overlay on top of any synthetic preview. */
  loading?: boolean;
  /** Legacy props (kept for compatibility). */
  primaryColor?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
}

/** Demo dataset — only used in the standalone Presentation preview, never inside live widgets. */
const PAEChart: React.FC<PAEChartProps> = ({
  variant = 'editor',
  height = '100%',
  data,
  config,
  appliedRev,
  seriesByMetric,
  xAxisLabels,
  loading = false,
  primaryColor = '#00685f',
  secondaryColor = '#6bd8cb',
  showSecondary = true,
}) => {
  const isPresentation = variant === 'presentation';

  // The chart is driven by the settings panel when a config is provided.
  const hasMetrics = !!config && config.metrics.length > 0;
  const hasBeenApplied = (appliedRev ?? 0) > 0;
  const hasBackendSeries = !!seriesByMetric && Object.values(seriesByMetric).some(s => s.length > 0);
  const hasLegacyData = Array.isArray(data) && data.length > 0;
  const hasRealData = hasBackendSeries || hasLegacyData;

  // Empty state rules — NO synthetic preview anymore (per project policy):
  //   • No metric selected → "No KPI selected"
  //   • Metrics selected but never applied → "Click Appliquer"
  //   • Applied + still loading → render an empty grid with the loading badge
  //   • Applied + backend returned nothing → "No data returned"
  const emptyReason: 'no-metric' | 'not-applied' | 'no-data' | null =
    !hasMetrics ? 'no-metric'
    : (!hasBeenApplied && !hasLegacyData) ? 'not-applied'
    : (hasBeenApplied && !loading && !hasRealData) ? 'no-data'
    : null;
  const isEmpty = emptyReason !== null;

  // Real data only — no synthetic fallback.
  const effectiveData = hasLegacyData ? data! : [];



  const option = useMemo(() => {
    const cfg = config ?? null;
    const style = cfg?.style ?? DEFAULT_CHART_CONFIG.style;
    const isDark = style.background === 'dark' || isPresentation;
    const labelColor = isDark ? 'rgba(255,255,255,0.55)' : '#565e74';
    const splitLine = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const bgColor =
      style.background === 'transparent' ? 'transparent'
      : style.background === 'dark' ? '#0f172a'
      : '#ffffff';

    // Build series from config metrics, or fall back to legacy single/dual series.
    let series: any[] = [];
    let yAxis: any[] = [];
    let legendData: string[] = [];

    if (cfg && cfg.metrics.length > 0) {
      const visible = cfg.metrics.filter(m => m.visible);
      const hasRight = visible.some(m => m.axis === 'right');
      const hasLeft = visible.some(m => m.axis === 'left' || m.axis == null);
      // Pick a representative color per axis (first metric on that side)
      const leftColor = visible.find(m => m.axis !== 'right')?.color ?? labelColor;
      const rightColor = visible.find(m => m.axis === 'right')?.color ?? labelColor;
      yAxis = [
        {
          type: 'value' as const,
          position: 'left',
          show: hasLeft,
          axisLine: { show: hasRight, lineStyle: { color: leftColor } },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 9,
            color: hasRight ? leftColor : labelColor,
            fontWeight: 700,
          },
          splitLine: style.grid ? { lineStyle: { color: splitLine, type: 'dashed' as const } } : { show: false },
        },
        ...(hasRight ? [{
          type: 'value' as const,
          position: 'right',
          axisLine: { show: true, lineStyle: { color: rightColor } },
          axisTick: { show: false },
          axisLabel: { fontSize: 9, color: rightColor, fontWeight: 700 },
          splitLine: { show: false },
        }] : []),
      ];

      series = visible.map((m, idx) => {
        const seriesType = style.chartType === 'bar' ? 'bar' : 'line';
        const wantsArea = (style.chartType === 'area' || style.fill !== 'none') && seriesType === 'line';
        const opacityRatio = Math.max(0, Math.min(100, style.opacity)) / 100;
        const areaStyle = wantsArea
          ? style.fill === 'gradient'
            ? {
                color: {
                  type: 'linear' as const,
                  x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: hexAlpha(m.color, Math.round(opacityRatio * 0xaa)) },
                    { offset: 1, color: hexAlpha(m.color, 0) },
                  ],
                },
              }
            : { color: hexAlpha(m.color, Math.round(opacityRatio * 0xff)) }
          : undefined;

        // Real backend series only — no synthetic fallback.
        const backendSeries = seriesByMetric?.[m.id];
        const seriesData = backendSeries && backendSeries.length > 0
          ? backendSeries.map(p => p.value)
          : [];

        return {
          name: m.alias || m.kpiKey,
          type: seriesType,
          smooth: style.smooth,
          showSymbol: false,
          yAxisIndex: m.axis === 'right' && hasRight ? 1 : 0,
          data: seriesData,
          lineStyle: seriesType === 'line' ? {
            color: m.color,
            width: style.lineThickness,
            type: m.lineStyle === 'dashed' ? 'dashed' as const : 'solid' as const,
          } : undefined,
          itemStyle: { color: m.color },
          areaStyle,
          emphasis: { focus: 'series' as const },
        };
      });

      legendData = visible.map(m => m.alias || m.kpiKey);
    } else {
      // No config + no metrics → render empty grid (no demo data anywhere).
      yAxis = [{
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
        splitLine: { lineStyle: { color: splitLine, type: 'dashed' as const } },
      }];
      series = [];
      legendData = [];
    }

    const legendPos = cfg?.style.legend.position ?? 'bottom';
    const legend = {
      data: legendData,
      bottom: legendPos === 'bottom' ? 0 : undefined,
      top: legendPos === 'top' ? 0 : undefined,
      right: legendPos === 'right' ? 0 : undefined,
      orient: legendPos === 'right' ? 'vertical' as const : 'horizontal' as const,
      textStyle: { fontSize: 10, color: labelColor, fontWeight: 700 as const },
      icon: 'roundRect' as const,
      itemWidth: 10, itemHeight: 6,
    };

    const hasRightAxis = (cfg?.metrics ?? []).some(m => m.visible && m.axis === 'right');
    return {
      backgroundColor: bgColor,
      grid: {
        top: legendPos === 'top' ? 36 : (isPresentation ? 24 : 16),
        right: legendPos === 'right' ? 100 : (hasRightAxis ? 48 : 16),
        bottom: legendPos === 'bottom' ? 36 : 28,
        left: 44,
      },
      legend: legendData.length > 1 ? legend : { show: false },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
        borderColor: 'rgba(0,0,0,0.06)',
        borderWidth: 1,
        textStyle: { color: isDark ? '#f8fafc' : '#0f172a', fontSize: 11, fontWeight: 600 },
        axisPointer: {
          type: 'line' as const,
          lineStyle: { color: cfg?.metrics[0]?.color ?? primaryColor, type: 'dashed' as const, width: 1 },
        },
      },
      xAxis: {
        type: 'category' as const,
        data: (xAxisLabels && xAxisLabels.length > 0) ? xAxisLabels : effectiveData.map(d => d.time),
        boundaryGap: style.chartType === 'bar',
        axisLine: { lineStyle: { color: splitLine } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
      },
      yAxis,
      series,
      animationDuration: isPresentation ? 1600 : 900,
      animationEasing: 'cubicOut' as const,
    };
  }, [effectiveData, isPresentation, primaryColor, secondaryColor, showSecondary, config, seriesByMetric, xAxisLabels]);

  if (isEmpty) {
    const copy = emptyReason === 'no-metric'
      ? { title: 'No KPI selected', body: 'Open the settings panel and add a KPI or counter from the catalog to start visualizing data.' }
      : emptyReason === 'not-applied'
      ? { title: 'Configuration not applied', body: 'Click "Appliquer" in the settings panel to fetch data from the backend.' }
      : { title: 'No data returned', body: 'The backend returned no points for this perimeter / period / filters. Try widening the period or relaxing filters.' };
    return (
      <div
        className="flex flex-col items-center justify-center w-full text-center px-6 relative"
        style={{ height }}
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-on-surface mb-1">
          {copy.title}
        </p>
        <p className="text-[11px] text-on-surface-variant max-w-[280px]">
          {copy.body}
        </p>
        {loading && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest backdrop-blur">
            Loading…
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
      />
      {loading && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest backdrop-blur">
          Loading…
        </div>
      )}
    </div>
  );
};

/** Append an alpha byte (0–255) to a #rrggbb color. */
function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  const aHex = a.toString(16).padStart(2, '0');
  return `${hex}${aHex}`;
}

export default PAEChart;
