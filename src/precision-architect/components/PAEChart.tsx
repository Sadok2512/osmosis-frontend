import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Loader2 } from 'lucide-react';
import { ChartWidgetConfig, DEFAULT_CHART_CONFIG, ChartType } from '../types';

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
  const hasMetrics = !!config && config.metrics.some((metric) => metric.visible !== false);
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
    const labelColor = isDark ? 'rgba(255,255,255,0.85)' : '#1e293b';
    const axisLineColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)';
    const splitLine = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    const bgColor =
      style.background === 'transparent' ? 'transparent'
      : style.background === 'dark' ? '#0f172a'
      : '#ffffff';

    // Build series from config metrics, or fall back to legacy single/dual series.
    let series: any[] = [];
    let yAxis: any[] = [];
    let legendData: string[] = [];

    if (cfg && cfg.metrics.length > 0) {
      const visible = cfg.metrics.filter(m => m.visible !== false);
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
          axisLine: { show: true, lineStyle: { color: hasRight ? leftColor : axisLineColor, width: 1 } },
          axisTick: { show: true, lineStyle: { color: axisLineColor } },
          axisLabel: {
            fontSize: 11,
            color: hasRight ? leftColor : labelColor,
            fontWeight: 600,
            margin: 8,
          },
          splitLine: style.grid ? { lineStyle: { color: splitLine, type: 'dashed' as const } } : { show: false },
        },
        ...(hasRight ? [{
          type: 'value' as const,
          position: 'right',
          axisLine: { show: true, lineStyle: { color: rightColor, width: 1 } },
          axisTick: { show: true, lineStyle: { color: rightColor } },
          axisLabel: { fontSize: 11, color: rightColor, fontWeight: 600, margin: 8 },
          splitLine: { show: false },
        }] : []),
      ];

      // ── PER-SERIES CHART TYPE & STACKING ──────────────────────────────
      // Each metric carries its own graphType. The global style.chartType is
      // only used as a *default* for metrics that don't override it — it never
      // forces stacking on the whole chart.
      //
      // Rules (per product spec):
      //   • Never force stacked=true globally.
      //   • Stack ONLY series whose per-metric graphType is stackedBar/stackedArea.
      //   • Stack groups share: same axis + same unit + same seriesType.
      //   • If a stack group ends up with a single series → render as a normal
      //     (non-stacked) bar/area to avoid the "lone stack" visual glitch.
      //   • Pure lines never stack.
      const resolveType = (m: any): ChartType => (m.graphType ?? style.chartType) as ChartType;

      // Pre-compute stack group sizes so single-member groups can fall back.
      const stackGroupCount = new Map<string, number>();
      visible.forEach((m) => {
        const t = resolveType(m);
        if (t !== 'stackedBar' && t !== 'stackedArea') return;
        const kind = t === 'stackedBar' ? 'bar' : 'area';
        const axis = m.axis === 'right' ? 'r' : 'l';
        const unit = (m.unit ?? '').trim().toLowerCase() || '__nounit__';
        const key = `${kind}|${axis}|${unit}`;
        stackGroupCount.set(key, (stackGroupCount.get(key) ?? 0) + 1);
      });

      series = visible.map((m, idx) => {
        const metricType = resolveType(m);
        const isBar = metricType === 'bar' || metricType === 'stackedBar';
        const isStep = metricType === 'stepLine';
        const isStackedAreaMetric = metricType === 'stackedArea';
        const isStackedBarMetric = metricType === 'stackedBar';
        const seriesType = isBar ? 'bar' : 'line';
        const wantsArea = seriesType === 'line' && (
          (m as any).fillArea === true ||
          metricType === 'area' ||
          isStackedAreaMetric
        );

        // Per-series stack id — only set when this metric explicitly opts in
        // AND there is at least one other compatible series in the same group.
        let stackId: string | undefined;
        if (isStackedBarMetric || isStackedAreaMetric) {
          const kind = isStackedBarMetric ? 'bar' : 'area';
          const axis = m.axis === 'right' ? 'r' : 'l';
          const unit = (m.unit ?? '').trim().toLowerCase() || '__nounit__';
          const key = `${kind}|${axis}|${unit}`;
          if ((stackGroupCount.get(key) ?? 0) > 1) {
            stackId = `pa-stack-${key}`;
          }
          // else → fallback to non-stacked (single-series stack is meaningless)
        }
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

        const lineType =
          m.lineStyle === 'dashed' ? 'dashed' as const :
          m.lineStyle === 'dotted' ? 'dotted' as const :
          'solid' as const;

        return {
          name: m.alias || m.kpiKey,
          type: seriesType,
          stack: stackId,
          // Step lines render as horizontal-then-vertical stairs (state changes).
          step: isStep ? ('end' as const) : false,
          // Smoothing is meaningless on step lines and on bars.
          smooth: isStep || isBar ? false : ((m as any).smooth ?? style.smooth),
          showSymbol: false,
          // Treat null/undefined safely so stacked series don't break on missing slots.
          connectNulls: seriesType === 'line',
          yAxisIndex: m.axis === 'right' && hasRight ? 1 : 0,
          data: seriesData,
          // Bars: keep series adjacent (barGap 0) so they read as a single
          // grouped cluster per X-tick. Wide category gap leaves breathing
          // room between dates. barMinHeight ensures right-axis bars with
          // tiny values stay visible against dominant left-axis bars.
          ...(isBar ? {
            barGap: '0%',
            barCategoryGap: '40%',
            barMaxWidth: 22,
            barMinHeight: 3,
          } : {}),
          // Z-order: right-axis series render on top so tiny bars aren't hidden.
          z: m.axis === 'right' ? 3 : 2,
          lineStyle: seriesType === 'line' ? {
            color: m.color,
            width: (m as any).lineWidth ?? style.lineThickness,
            type: lineType,
          } : undefined,
          itemStyle: { color: m.color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : 0 },
          areaStyle,
          emphasis: { focus: 'series' as const },
        };
      });

      legendData = visible.map(m => m.alias || m.kpiKey);
    } else {
      // No config + no metrics → render empty grid (no demo data anywhere).
      yAxis = [{
        type: 'value' as const,
        axisLine: { show: true, lineStyle: { color: axisLineColor, width: 1 } },
        axisTick: { show: true, lineStyle: { color: axisLineColor } },
        axisLabel: { fontSize: 11, color: labelColor, fontWeight: 600, margin: 8 },
        splitLine: { lineStyle: { color: splitLine, type: 'dashed' as const } },
      }];
      series = [];
      legendData = [];
    }

    // Legend placement: per user preference the legend always renders below
    // the graph unless explicitly pinned to the right side.
    const rawLegendPos = cfg?.style.legend.position ?? 'bottom';
    const legendPos: 'bottom' | 'right' = rawLegendPos === 'right' ? 'right' : 'bottom';
    const showLegend = legendData.length > 1;

    // Friendly-name shortener: collapses long technical names (e.g.
    // "ERABs_all_setup_add_SR - LTE1800") into a compact, readable label.
    // Keep the original full name as the legend `name` (so series binding
    // works) but display a shortened version through `formatter`. The full
    // name is shown on hover via the legend tooltip.
    const shortenLabel = (raw: string): string => {
      if (!raw) return '';
      const s = raw.trim();
      const bandMatch = s.match(/(LTE\d{3,4}|NR\d{3,4}|UMTS\d{3,4}|GSM\d{3,4}|2G|3G|4G|5G)\s*$/i);
      const band = bandMatch ? bandMatch[0].toUpperCase() : '';
      let head = band ? s.slice(0, s.length - bandMatch![0].length) : s;
      head = head.replace(/[\s\-_]+$/g, '').replace(/[_]+/g, ' ').trim();
      const MAX_HEAD = 24;
      if (head.length > MAX_HEAD) head = head.slice(0, MAX_HEAD - 1) + '…';
      return band ? (head ? `${head} · ${band}` : band) : head;
    };

    // Estimate space needed when legend is at the bottom. Since we now use
    // `type: 'plain'` (no pagination), we must reserve enough vertical room
    // to fit ALL items wrapped over multiple rows.
    //
    // Rows per item depends on the *displayed* (shortened) label width:
    //   • short labels (<14 chars) → ~3 per row
    //   • medium (14-22 chars) → ~2 per row
    //   • long (>22 chars) → 1 per row
    // This prevents the legend from overlapping the X-axis when series names
    // are long (e.g. "DL VOLUME IP GBytes · LTE2100").
    const avgDisplayLen = legendData.length > 0
      ? legendData.reduce((s, n) => s + shortenLabel(n).length, 0) / legendData.length
      : 0;
    const itemsPerRow = avgDisplayLen > 22 ? 1 : avgDisplayLen > 14 ? 2 : 3;
    const legendRows = Math.max(1, Math.ceil(legendData.length / itemsPerRow));
    const legendBlockSize = legendPos === 'right'
      ? Math.min(legendData.length * 24 + 12, 480)
      : Math.max(34, Math.min(legendRows * 26 + 16, 260));

    const legend = {
      show: showLegend,
      // Plain mode → all items rendered, automatic wrapping, no pagination.
      type: 'plain' as const,
      data: legendData,
      bottom: legendPos === 'bottom' ? 6 : undefined,
      top: legendPos === 'right' ? ('middle' as const) : undefined,
      right: legendPos === 'right' ? 8 : 12,
      left: legendPos === 'right' ? undefined : 12,
      width: legendPos === 'right' ? 180 : '94%',
      orient: legendPos === 'right' ? ('vertical' as const) : ('horizontal' as const),
      align: 'left' as const,
      textStyle: {
        fontSize: 12,
        color: labelColor,
        fontWeight: 600 as const,
        lineHeight: 18,
        padding: [0, 0, 0, 4] as [number, number, number, number],
      },
      icon: 'roundRect' as const,
      itemWidth: 16,
      itemHeight: 10,
      itemGap: 18,
      padding: [4, 6, 4, 6] as [number, number, number, number],
      formatter: (name: string) => shortenLabel(name),
      tooltip: { show: true, formatter: (params: any) => params.name },
      selectedMode: true as const,
    };

    const hasRightAxis = (cfg?.metrics ?? []).some(m => m.visible !== false && m.axis === 'right');
    // When at least one series renders as bars, give the chart extra left padding
    // so the first bar does not collide with (or hide) the Y axis line/labels.
    const hasBarSeries = (cfg?.metrics ?? []).some((m) => {
      if (m.visible === false) return false;
      const t = (m as any).graphType ?? style.chartType;
      return t === 'bar' || t === 'stackedBar';
    }) || style.chartType === 'bar';
    return {
      backgroundColor: bgColor,
      grid: {
        top: isPresentation ? 32 : 28,
        // Initial right padding — will be auto-tuned post-render based on the
        // measured right-axis label width (see useLayoutEffect below).
        right: legendPos === 'right' && showLegend ? 210 : (hasRightAxis ? 64 : 24),
        bottom: legendPos === 'bottom' && showLegend ? legendBlockSize + 16 : 48,
        left: hasBarSeries ? 36 : 16,
        containLabel: true,
      },
      legend,
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
        axisLine: { show: true, lineStyle: { color: axisLineColor, width: 1 } },
        axisTick: { show: true, lineStyle: { color: axisLineColor } },
        axisLabel: { fontSize: 11, color: labelColor, fontWeight: 600, margin: 10 },
      },
      yAxis,
      series,
      animationDuration: isPresentation ? 1600 : 900,
      animationEasing: 'cubicOut' as const,
    };
  }, [effectiveData, isPresentation, primaryColor, secondaryColor, showSecondary, config, seriesByMetric, xAxisLabels, config?.style.stacked]);

  // Container ref + ResizeObserver — guarantees ECharts re-lays-out as soon as
  // the widget card has its real width (fixes right-axis clipping on first paint
  // in viewer/presentation mode where layout settles after mount).
  const chartRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Safe resolver for the underlying ECharts instance.
   * `react-echarts` (v3+) exposes `getEchartsInstance()`, but older builds /
   * forwarded refs may instead expose `echartsElement`, an internal `_chart`,
   * or already be the instance itself. We try each path so `.resize()` always
   * has a valid target.
   */
  const getInst = (): any | null => {
    const r: any = chartRef.current;
    if (!r) return null;
    if (typeof r.getEchartsInstance === 'function') return r.getEchartsInstance();
    if (r.echartsElement && typeof r.echartsElement.resize === 'function') return r.echartsElement;
    if (r.ele && typeof r.ele.resize === 'function') return r.ele;
    if (r._chart && typeof r._chart.resize === 'function') return r._chart;
    if (typeof r.resize === 'function') return r;
    return null;
  };

  const safeResize = () => {
    try { getInst()?.resize(); } catch { /* swallow — chart not ready yet */ }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => safeResize());
    ro.observe(el);
    const raf = requestAnimationFrame(safeResize);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [isEmpty]);

  // Auto-tune grid.right based on the measured right Y-axis label width.
  // Runs after each paint so labels like "0.0035" or "1,234,567" never get clipped.
  useEffect(() => {
    if (isEmpty) return;
    const inst = getInst();
    if (!inst) return;

    const measure = () => {
      const dom: HTMLElement | undefined = inst.getDom?.();
      if (!dom) return;
      // ECharts renders Y-axis labels as <text> nodes inside the SVG/canvas wrapper.
      // For canvas renderer we instead inspect the option's yAxis label width via
      // the model — but the simplest robust approach is to render to canvas and
      // read back computed label widths from echarts internals.
      const opt: any = inst.getOption?.();
      const yAxes: any[] = opt?.yAxis ?? [];
      const rightAxisIdx = yAxes.findIndex((a: any) => a.position === 'right');
      if (rightAxisIdx === -1) return;

      // Use a hidden canvas to measure the widest label text.
      const axisModel = inst.getModel?.()?.getComponent?.('yAxis', rightAxisIdx);
      const ticks = axisModel?.axis?.scale?.getTicks?.() ?? [];
      const formatter = yAxes[rightAxisIdx]?.axisLabel?.formatter;
      const fontSize = yAxes[rightAxisIdx]?.axisLabel?.fontSize ?? 9;
      const fontWeight = yAxes[rightAxisIdx]?.axisLabel?.fontWeight ?? 700;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = `${fontWeight} ${fontSize}px sans-serif`;

      let maxWidth = 0;
      ticks.forEach((t: any) => {
        const raw = t.value ?? t;
        const text = typeof formatter === 'function' ? formatter(raw) : String(raw);
        const w = ctx.measureText(String(text)).width;
        if (w > maxWidth) maxWidth = w;
      });

      // Padding = label width + tick spacing + small breathing room.
      const desired = Math.ceil(maxWidth) + 14;
      const currentRight = (opt?.grid?.[0]?.right) ?? 0;
      const target = Math.max(20, desired);
      // Only patch if the difference is significant to avoid render loops.
      if (typeof currentRight === 'number' && Math.abs(currentRight - target) >= 4) {
        inst.setOption({ grid: [{ right: target }] }, false, true);
      }
    };

    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [option, isEmpty]);


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
        {loading && <LoadingOverlay />}
      </div>
    );
  }


  return (
    <div ref={containerRef} style={{ height, width: '100%', position: 'relative' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
      />
      {loading && <LoadingOverlay />}
    </div>
  );
};

/** Centered loading overlay with spinner — clearly visible during backend fetch. */
const LoadingOverlay: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 pointer-events-none">
    <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-card border border-primary/30 shadow-lg">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
        Loading data…
      </span>
    </div>
  </div>
);

/** Append an alpha byte (0–255) to a #rrggbb color. */
function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  const aHex = a.toString(16).padStart(2, '0');
  return `${hex}${aHex}`;
}

export default PAEChart;
