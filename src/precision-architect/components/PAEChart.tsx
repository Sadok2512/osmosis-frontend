import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartWidgetConfig, DEFAULT_CHART_CONFIG } from '../types';

interface PAEChartProps {
  variant?: 'editor' | 'presentation';
  height?: number | string;
  data?: { time: string; value: number; secondary?: number }[];
  /** New: full widget config from settings panel. When provided, supersedes legacy props. */
  config?: ChartWidgetConfig;
  /** Legacy props (kept for compatibility). */
  primaryColor?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
}

const defaultData = Array.from({ length: 24 }, (_, i) => {
  const base = 320 + Math.sin(i / 3) * 60 + Math.cos(i / 2) * 30;
  return {
    time: `${String(i).padStart(2, '0')}:00`,
    value: Math.round(base + Math.random() * 40),
    secondary: Math.round(base * 0.65 + Math.random() * 25),
  };
});

const PAEChart: React.FC<PAEChartProps> = ({
  variant = 'editor',
  height = '100%',
  data = defaultData,
  config,
  primaryColor = '#00685f',
  secondaryColor = '#6bd8cb',
  showSecondary = true,
}) => {
  const isPresentation = variant === 'presentation';

  // Empty state: no config, or config with no metrics → show placeholder instead of demo data.
  const isEmpty = !config || !config.metrics || config.metrics.length === 0;

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
      yAxis = [
        {
          type: 'value' as const,
          position: 'left',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
          splitLine: style.grid ? { lineStyle: { color: splitLine, type: 'dashed' as const } } : { show: false },
        },
        ...(hasRight ? [{
          type: 'value' as const,
          position: 'right',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
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

        // Vary data per metric so multiple lines are visually distinct.
        const seriesData = data.map((d, di) => {
          const v = m.axis === 'right' ? (d.secondary ?? d.value * 0.65) : d.value;
          // Add a small per-metric offset so additional metrics don't fully overlap.
          return Math.round(v * (1 - idx * 0.12) + (idx * 8));
        });

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
      // Legacy fallback (no config provided).
      yAxis = [{
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: labelColor, fontWeight: 700 },
        splitLine: { lineStyle: { color: splitLine, type: 'dashed' as const } },
      }];
      series = [
        {
          name: 'Throughput',
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.value),
          lineStyle: {
            color: primaryColor,
            width: isPresentation ? 3 : 2.5,
          },
          itemStyle: { color: primaryColor },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${primaryColor}55` },
                { offset: 1, color: `${primaryColor}00` },
              ],
            },
          },
        },
        ...(showSecondary ? [{
          name: 'Baseline',
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.secondary ?? 0),
          lineStyle: { color: secondaryColor, width: 1.5, type: 'dashed' as const },
          itemStyle: { color: secondaryColor },
        }] : []),
      ];
      legendData = showSecondary ? ['Throughput', 'Baseline'] : ['Throughput'];
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

    return {
      backgroundColor: bgColor,
      grid: {
        top: legendPos === 'top' ? 36 : (isPresentation ? 24 : 16),
        right: legendPos === 'right' ? 100 : 16,
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
        data: data.map(d => d.time),
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
  }, [data, isPresentation, primaryColor, secondaryColor, showSecondary, config]);

  if (isEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center w-full text-center px-6"
        style={{ height }}
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-on-surface mb-1">No KPI selected</p>
        <p className="text-[11px] text-on-surface-variant max-w-[240px]">
          Open the settings panel and add a KPI from the catalog to start visualizing data.
        </p>
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
};

/** Append an alpha byte (0–255) to a #rrggbb color. */
function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  const aHex = a.toString(16).padStart(2, '0');
  return `${hex}${aHex}`;
}

export default PAEChart;
