import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartConfig, CHART_COLORS, KPI_UNITS } from './biTypes';
import { generateChartData, getKPIBase } from './mockBIData';
import { useCSVData } from './CSVDataStore';
import { biQueryApi } from '@/lib/localDb';

/* Convert any CSS color to hex, then create rgba with alpha */
const _hexCache = new Map<string, string>();
const toHex = (c: string): string => {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (_hexCache.has(c)) return _hexCache.get(c)!;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return '#64748b';
    ctx.fillStyle = '#000000';
    ctx.fillStyle = c;
    const hex = ctx.fillStyle;
    _hexCache.set(c, hex);
    return hex;
  } catch { return '#64748b'; }
};
const withAlpha = (c: string, alpha: number): string => {
  const hex = toHex(c);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

interface Props {
  config: ChartConfig;
}

/* ── Premium tooltip formatter ── */
const premiumTooltipFormatter = (params: any) => {
  if (!Array.isArray(params) || params.length === 0) return '';
  const ts = params[0].axisValueLabel || params[0].name || '';
  let html = `<div style="margin-bottom:8px;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase">${ts}</div>`;
  for (const p of params) {
    if (p.value == null) continue;
    const val = typeof p.value === 'number' ? p.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : p.value;
    html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};box-shadow:0 0 6px ${p.color}"></span>
      <span style="flex:1;color:#cbd5e1;font-size:11px">${p.seriesName}</span>
      <span style="font-weight:700;color:#f8fafc;font-size:11px;font-variant-numeric:tabular-nums">${val}</span>
    </div>`;
  }
  return html;
};

/* ── Premium ECharts defaults ── */
const PREMIUM_TOOLTIP = {
  trigger: 'axis' as const,
  backgroundColor: 'rgba(15,23,42,0.96)',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  padding: [14, 18],
  textStyle: { color: '#f1f5f9', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' },
  extraCssText: 'border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.24); backdrop-filter: blur(12px);',
  axisPointer: {
    type: 'line' as const,
    lineStyle: { color: 'rgba(59,130,246,0.2)', width: 1, type: 'solid' as const },
  },
  formatter: premiumTooltipFormatter,
};

const PREMIUM_LEGEND = {
  type: 'scroll' as const,
  bottom: 8,
  textStyle: { fontSize: 11, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' },
  icon: 'circle',
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 16,
  inactiveColor: '#d1d5db',
};

const PREMIUM_DATAZOOM = (legendBottom: number) => [
  { type: 'inside' as const, xAxisIndex: 0, start: 0, end: 100, zoomOnMouseWheel: true },
  {
    type: 'slider' as const, xAxisIndex: 0, start: 0, end: 100,
    height: 14,
    bottom: legendBottom,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.02)',
    fillerColor: 'rgba(59,130,246,0.12)',
    handleSize: '80%',
    handleStyle: { color: '#94a3b8', borderColor: '#94a3b8', shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.1)' },
    dataBackground: {
      lineStyle: { color: 'rgba(59,130,246,0.2)', width: 1 },
      areaStyle: { color: 'rgba(59,130,246,0.05)' },
    },
    selectedDataBackground: {
      lineStyle: { color: '#3b82f6', width: 1 },
      areaStyle: { color: 'rgba(59,130,246,0.1)' },
    },
    textStyle: { fontSize: 9, color: '#9ca3af' },
    brushSelect: false,
  },
];

const PREMIUM_YAXIS_BASE = {
  axisLabel: { fontSize: 10, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif' },
  nameTextStyle: { fontSize: 10, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif' },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: [4, 4] as any, width: 1 } },
};

const BIChartRendererECharts: React.FC<Props> = ({ config }) => {
  const { getDataset } = useCSVData();
  const csvDataset = config.dataSource?.type === 'csv' && config.dataSource.csvDatasetId
    ? getDataset(config.dataSource.csvDatasetId) : null;

  // Live data from local qoe_metric
  const [liveData, setLiveData] = useState<any[] | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [effectiveDates, setEffectiveDates] = useState<{ start: string; end: string } | null>(null);

  const isLocal = config.dataSource?.type === 'local' || !config.dataSource?.type;

  // Auto-detect actual data date range and adjust if config dates are out of range
  useEffect(() => {
    if (!isLocal) return;
    biQueryApi.dateRange().then(range => {
      if (range.min_date && range.max_date) {
        const cfgStart = config.xAxis.dateStart || '';
        const cfgEnd = config.xAxis.dateEnd || '';
        // If config dates are outside data range, auto-adjust to last 14 days of available data
        if (!cfgStart || !cfgEnd || cfgStart > range.max_date || cfgEnd < range.min_date) {
          const end = new Date(range.max_date);
          const start = new Date(end);
          start.setDate(start.getDate() - 14);
          const autoStart = start.toISOString().split('T')[0] < range.min_date ? range.min_date : start.toISOString().split('T')[0];
          setEffectiveDates({ start: autoStart, end: range.max_date });
        } else {
          setEffectiveDates({ start: cfgStart, end: cfgEnd });
        }
      } else {
        setEffectiveDates({ start: config.xAxis.dateStart || '', end: config.xAxis.dateEnd || '' });
      }
    }).catch(() => {
      setEffectiveDates({ start: config.xAxis.dateStart || '', end: config.xAxis.dateEnd || '' });
    });
  }, [isLocal, config.xAxis.dateStart, config.xAxis.dateEnd]);

  useEffect(() => {
    if (!isLocal || !effectiveDates) { setLiveData(null); setLiveError(null); return; }
    let cancelled = false;
    setLiveLoading(true);
    setLiveError(null);
    biQueryApi.query({
      kpis: config.yMetrics.map(m => m.kpi),
      aggregation: config.yMetrics[0]?.aggregation || 'AVG',
      dateStart: effectiveDates.start,
      dateEnd: effectiveDates.end,
      granularity: config.xAxis.granularity,
      groupBy: config.groupBy.length > 0 ? [...config.groupBy] : undefined,
      filters: config.filters.filter(f => f.values.length > 0).map(f => ({
        dimension: f.dimension,
        values: [...f.values],
      })),
      xAxisType: config.xAxis.type,
      xAxisDimension: config.xAxis.type === 'dimension' ? config.xAxis.value : undefined,
      topN: config.advanced.topN || undefined,
    }).then(res => {
      if (!cancelled) setLiveData(res.rows || []);
    }).catch(err => {
      console.warn('[BI] Live query failed:', err.message);
      if (!cancelled) {
        setLiveData(null);
        setLiveError(err.message);
      }
    }).finally(() => {
      if (!cancelled) setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, [
    isLocal,
    effectiveDates?.start, effectiveDates?.end,
    JSON.stringify(config.yMetrics.map(m => m.kpi)),
    config.yMetrics[0]?.aggregation,
    config.xAxis.type, config.xAxis.value,
    config.xAxis.granularity,
    JSON.stringify(config.groupBy),
    JSON.stringify(config.filters),
    config.advanced.topN,
  ]);

  const rawData = useMemo(() => {
    // Priority: live data > CSV > mock
    if (isLocal && liveData && liveData.length > 0) {
      return liveData;
    }
    if (csvDataset && config.dataSource?.xColumn) {
      return csvDataset.rows.map(row => ({
        x: row[config.dataSource!.xColumn!],
        ...Object.fromEntries(
          (config.dataSource!.yColumns || []).map(col => [col, row[col]])
        ),
      }));
    }
    return generateChartData(config);
  }, [config, csvDataset, liveData, isLocal]);



  const effectiveYMetrics = useMemo(() => {
    if (csvDataset && config.dataSource?.yColumns?.length) {
      return config.dataSource.yColumns.map((col, i) => ({
        kpi: col as any,
        aggregation: 'AVG' as const,
        axis: 'left' as const,
        chartType: (config.yMetrics[0]?.chartType || 'line') as any,
        color: CHART_COLORS[i % CHART_COLORS.length],
        showMovingAvg: false,
        smoothCurve: true,
      }));
    }
    // Filter out hidden metrics
    return config.yMetrics.filter(m => m.visible !== false);
  }, [csvDataset, config.dataSource?.yColumns, config.yMetrics]);

  const firstMetric = effectiveYMetrics[0];

  const hasGroup = config.groupBy.length > 0 && rawData.some(d => d.group);
  const groupKeys = hasGroup ? [...new Set(rawData.map(d => d.group))] as string[] : [];

  const { data: pivotedData, xLabels } = useMemo(() => {
    const xSet = [...new Set(rawData.map(d => d.x))] as string[];
    if (!hasGroup) return { data: rawData, xLabels: xSet };

    const byX = new Map<string, any>();
    for (const row of rawData) {
      if (!byX.has(row.x)) byX.set(row.x, { x: row.x });
      const point = byX.get(row.x)!;
      for (const m of effectiveYMetrics) {
        point[`${m.kpi}__${row.group}`] = row[m.kpi];
      }
    }
    return { data: Array.from(byX.values()), xLabels: xSet };
  }, [rawData, hasGroup, effectiveYMetrics]);

  if (!firstMetric) {
    return (
      <div className="relative flex items-center justify-center h-full text-muted-foreground text-xs overflow-hidden">
        {/* Default grid background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <pattern id="bi-grid" width="60" height="40" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4,4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bi-grid)" />
        </svg>
        <span className="relative z-10">Add a metric to display</span>
      </div>
    );
  }

  if (isLocal && liveLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-[10px] font-medium">Chargement…</span>
      </div>
    );
  }

  if (rawData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <span className="text-2xl">📊</span>
        <span className="text-xs font-medium">Aucune donnée</span>
        <span className="text-[10px] opacity-70">
          {liveError
            ? `Serveur local indisponible: ${liveError}`
            : 'Vérifiez la plage de dates ou les filtres'}
        </span>
      </div>
    );
  }

  // ── KPI Card ──
  if (firstMetric.chartType === 'kpi_card') {
    const unit = KPI_UNITS[firstMetric.kpi] || '';
    const values = rawData.map(d => d[firstMetric.kpi]).filter(Boolean);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const prev = values.length > 1 ? values[values.length - 2] : avg;
    const delta = ((avg - prev) / prev * 100);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <span className="text-3xl font-bold font-mono tracking-tight" style={{ color: firstMetric.color }}>
          {avg.toFixed(1)}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {firstMetric.kpi.replace(/_/g, ' ')} {unit && `(${unit})`}
        </span>
        <span className={`text-[10px] font-mono font-semibold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
    );
  }

  // ── Pie Chart ──
  if (firstMetric.chartType === 'pie') {
    const pieData = pivotedData.map((d, i) => ({
      name: d.x,
      value: d[firstMetric.kpi],
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
    }));

    const option = {
      tooltip: { ...PREMIUM_TOOLTIP, trigger: 'item' as const, formatter: undefined },
      legend: config.advanced.showLegend ? {
        ...PREMIUM_LEGEND,
        ...((config.advanced.legendPosition || 'bottom') === 'top' ? { top: 0, bottom: undefined } : {}),
        ...((config.advanced.legendPosition || 'bottom') === 'left' ? { left: 0, top: 'middle', bottom: undefined, orient: 'vertical' as const } : {}),
        ...((config.advanced.legendPosition || 'bottom') === 'right' ? { right: 0, top: 'middle', bottom: undefined, orient: 'vertical' as const } : {}),
      } : undefined,
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        data: pieData,
        label: { fontSize: 10, formatter: '{b}: {d}%', color: '#e2e8f0' },
        labelLine: { lineStyle: { color: '#64748b' } },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    };

    return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />;
  }

  // ── Heatmap ──
  if (firstMetric.chartType === 'heatmap') {
    const yLabels = hasGroup ? groupKeys : effectiveYMetrics.map(m => m.kpi.replace(/_/g, ' '));
    const heatData: [number, number, number][] = [];
    let minVal = Infinity, maxVal = -Infinity;

    xLabels.forEach((xLabel, xi) => {
      if (hasGroup) {
        groupKeys.forEach((g, yi) => {
          const row = rawData.find(d => d.x === xLabel && d.group === g);
          const val = row ? (row[firstMetric.kpi] ?? 0) : 0;
          heatData.push([xi, yi, val]);
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        });
      } else {
        effectiveYMetrics.forEach((m, yi) => {
          const row = rawData.find(d => d.x === xLabel);
          const val = row ? (row[m.kpi] ?? 0) : 0;
          heatData.push([xi, yi, val]);
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        });
      }
    });

    const option = {
      tooltip: { ...PREMIUM_TOOLTIP, trigger: 'item' as const, position: 'top' as const, formatter: undefined },
      grid: { top: 10, right: 10, bottom: 40, left: 80 },
      xAxis: {
        type: 'category' as const,
        data: xLabels.map(x => x.includes('-') ? x.slice(5) : x),
        axisLabel: { fontSize: 9, color: '#9ca3af', rotate: xLabels.length > 10 ? 45 : 0 },
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category' as const,
        data: yLabels,
        axisLabel: { fontSize: 9, color: '#9ca3af' },
        splitArea: { show: true },
      },
      visualMap: {
        min: minVal, max: maxVal,
        calculable: true, orient: 'horizontal' as const,
        left: 'center', bottom: 0,
        textStyle: { fontSize: 9, color: '#9ca3af' },
        inRange: { color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'] },
      },
      series: [{
        type: 'heatmap',
        data: heatData,
        label: { show: true, fontSize: 9, color: '#fff' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };

    return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />;
  }

  // ── Build premium series for line/bar/area/scatter ──
  const hasRight = effectiveYMetrics.some(m => m.axis === 'right');

  const buildSeries = () => {
    const series: any[] = [];

    for (let i = 0; i < effectiveYMetrics.length; i++) {
      const m = effectiveYMetrics[i];
      const seriesList = groupKeys.length > 0
        ? groupKeys.map((g, gi) => ({
            dataKey: `${m.kpi}__${g}`,
            name: `${m.kpi.replace(/_/g, ' ')} (${g})`,
            color: CHART_COLORS[(i * groupKeys.length + gi) % CHART_COLORS.length],
          }))
        : [{
            dataKey: m.kpi,
            name: m.kpi.replace(/_/g, ' '),
            color: m.color,
          }];

      for (const s of seriesList) {
        const values = pivotedData.map(d => d[s.dataKey] ?? null);
        const yAxisIndex = m.axis === 'right' && hasRight ? 1 : 0;

        const baseSeries: any = {
          name: s.name,
          yAxisIndex,
          data: values,
          itemStyle: { color: s.color, borderWidth: 0 },
          emphasis: {
            focus: 'series',
            lineStyle: { width: 3 },
            itemStyle: { borderWidth: 2, borderColor: '#fff', shadowBlur: 6, shadowColor: withAlpha(s.color, 0.25) },
          },
        };

        switch (m.chartType) {
          case 'bar':
            series.push({
              ...baseSeries, type: 'bar', barMaxWidth: 28,
              itemStyle: { ...baseSeries.itemStyle, borderRadius: [4, 4, 0, 0] },
            });
            break;
          case 'stacked_bar':
            series.push({ ...baseSeries, type: 'bar', stack: 'stack', barMaxWidth: 28 });
            break;
          case 'grouped_bar':
            series.push({
              ...baseSeries, type: 'bar', barMaxWidth: 22,
              itemStyle: { ...baseSeries.itemStyle, borderRadius: [4, 4, 0, 0] },
            });
            break;
          case 'area':
            series.push({
              ...baseSeries,
              type: 'line',
              smooth: m.smoothCurve ? 0.3 : false,
              symbol: 'none',
              showSymbol: false,
              lineStyle: { width: 2.5, color: s.color, shadowColor: withAlpha(s.color, 0.2), shadowBlur: 8, shadowOffsetY: 3 },
              itemStyle: { color: s.color, borderWidth: 0 },
              areaStyle: {
                opacity: 1,
                origin: 'auto',
                color: {
                  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: withAlpha(s.color, 0.55) },
                    { offset: 1, color: withAlpha(s.color, 0.05) },
                  ],
                },
              },
            });
            break;
          case 'scatter':
            series.push({ ...baseSeries, type: 'scatter', symbolSize: 7 });
            break;
          case 'line_dot':
            series.push({
              ...baseSeries, type: 'line', smooth: m.smoothCurve ? 0.3 : false,
              symbol: 'circle', showSymbol: true, symbolSize: 6,
              lineStyle: { width: 2.5, color: s.color, shadowColor: withAlpha(s.color, 0.15), shadowBlur: 8, shadowOffsetY: 3 },
              itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 2 },
              areaStyle: {
                color: {
                  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: withAlpha(s.color, 0.04) },
                    { offset: 1, color: withAlpha(s.color, 0) },
                  ],
                },
              },
            });
            break;
          case 'line':
          default:
            series.push({
              ...baseSeries, type: 'line', smooth: m.smoothCurve ? 0.3 : false,
              symbol: 'none', showSymbol: false,
              lineStyle: { width: 2.5, color: s.color, shadowColor: withAlpha(s.color, 0.15), shadowBlur: 8, shadowOffsetY: 3 },
            });
            break;
        }
      }
    }

    // Weekend shading via markArea on first series
    const weekendAreas: any[] = [];
    if (config.xAxis.type === 'date') {
      const formattedLabels = xLabels.map(formatX);
      for (let idx = 0; idx < xLabels.length; idx++) {
        const d = new Date(xLabels[idx]);
        const day = d.getUTCDay();
        if (day === 0 || day === 6) {
          weekendAreas.push([
            { xAxis: formattedLabels[idx], itemStyle: { color: 'rgba(148,163,184,0.07)' } },
            { xAxis: formattedLabels[idx] },
          ]);
        }
      }
      // Merge consecutive weekend days into single bands
      const merged: any[] = [];
      for (const area of weekendAreas) {
        const last = merged[merged.length - 1];
        if (last) {
          const lastIdx = formattedLabels.indexOf(last[1].xAxis);
          const curIdx = formattedLabels.indexOf(area[0].xAxis);
          if (curIdx === lastIdx + 1) {
            last[1].xAxis = area[1].xAxis;
            continue;
          }
        }
        merged.push([...area]);
      }
      if (merged.length > 0 && series.length > 0) {
        series[0].markArea = {
          silent: true,
          data: merged,
        };
      }
    }

    // Threshold & milestone mark lines
    const markLineData: any[] = [];
    for (const t of config.advanced.thresholds) {
      markLineData.push({
        yAxis: t.value,
        name: `⊙ ${t.label}: ${t.value}`,
        lineStyle: { color: t.color || '#ef4444', type: t.lineStyle === 'dotted' ? [2, 4] : t.lineStyle === 'dashed' ? [6, 4] : 'solid', width: 1.5, opacity: 0.7 },
        label: { fontSize: 9, fontWeight: 600, position: 'insideEndTop', formatter: `⊙ ${t.label}: ${t.value}` },
      });
    }
    for (const m of (config.advanced.milestones || [])) {
      markLineData.push({
        xAxis: m.date.includes('-') ? m.date.slice(5) : m.date,
        name: `▾ ${m.label}`,
        lineStyle: { color: m.color || '#8b5cf6', type: [6, 4], width: 1.5, opacity: 0.7 },
        label: { fontSize: 9, fontWeight: 600, position: 'insideEndTop', formatter: `▾ ${m.label}` },
      });
    }
    if (markLineData.length > 0 && series.length > 0) {
      series[0].markLine = { silent: true, symbol: 'none', data: markLineData };
    }

    return series;
  };

  const formatX = (v: string) => {
    if (v?.includes('-')) {
      const parts = v.split('-');
      return `${parts[1]}-${parts[2]?.split('T')[0] || ''}`;
    }
    return v?.length > 10 ? v.slice(0, 10) + '…' : v;
  };

  const yAxisMode = config.advanced.yAxisMode || 'auto';
  const showGrid = config.advanced.showGrid !== false;

  // Validate a (min, max) pair. If invalid (min >= max), ignore both.
  const validRange = (mn: number | null | undefined, mx: number | null | undefined) => {
    const minOk = mn != null && Number.isFinite(mn);
    const maxOk = mx != null && Number.isFinite(mx);
    if (minOk && maxOk && (mn as number) >= (mx as number)) return {};
    return {
      ...(minOk ? { min: mn as number } : {}),
      ...(maxOk ? { max: mx as number } : {}),
    };
  };

  const leftRange = yAxisMode === 'fixed'
    ? validRange(config.advanced.yAxisMin, config.advanced.yAxisMax)
    : {};
  // Right axis: fall back to left bounds if right-specific values are not set,
  // so users who only set "Min/Max" still get expected behavior on single-axis charts.
  const rightRange = yAxisMode === 'fixed'
    ? validRange(
        config.advanced.yAxisMinRight ?? config.advanced.yAxisMin,
        config.advanced.yAxisMaxRight ?? config.advanced.yAxisMax,
      )
    : {};

  const yAxis: any[] = [{
    ...PREMIUM_YAXIS_BASE, type: 'value', ...leftRange,
    scale: yAxisMode === 'auto',
    splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: [4, 4] as any, width: 1 }, show: showGrid },
  }];
  if (hasRight) {
    yAxis.push({
      ...PREMIUM_YAXIS_BASE,
      type: 'value',
      position: 'right',
      scale: yAxisMode === 'auto',
      splitLine: { show: false },
      ...rightRange,
    });
  }

  const showLegend = config.advanced.showLegend;
  const legendPos = config.advanced.legendPosition || 'bottom';
  const legendBottom = showLegend && legendPos === 'bottom' ? 28 : 8;

  const legendConfig = showLegend ? {
    ...PREMIUM_LEGEND,
    ...(legendPos === 'top' ? { top: 0, bottom: undefined } : {}),
    ...(legendPos === 'left' ? { left: 0, top: 'middle', bottom: undefined, orient: 'vertical' as const } : {}),
    ...(legendPos === 'right' ? { right: 0, top: 'middle', bottom: undefined, orient: 'vertical' as const } : {}),
  } : undefined;

  const option = {
    tooltip: PREMIUM_TOOLTIP,
    legend: legendConfig,
    grid: {
      top: showLegend && legendPos === 'top' ? 40 : 24,
      right: (hasRight ? 64 : 24) + (showLegend && legendPos === 'right' ? 100 : 0),
      bottom: showLegend && legendPos === 'bottom' ? 58 : 38,
      left: 52 + (showLegend && legendPos === 'left' ? 100 : 0),
    },
    xAxis: {
      type: 'category' as const,
      data: xLabels.map(formatX),
      axisLabel: {
        fontSize: 10, color: '#9ca3af',
        fontFamily: 'Inter, system-ui, sans-serif',
        rotate: xLabels.length > 15 ? 35 : 0,
        margin: 12,
      },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      axisTick: { show: false },
      splitLine: { show: showGrid, lineStyle: { color: 'rgba(0,0,0,0.03)', type: [2, 4] as any } },
    },
    yAxis,
    series: buildSeries(),
    dataZoom: PREMIUM_DATAZOOM(legendBottom),
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicInOut',
  };

  // Key forces a full chart re-init when axis bounds, mode or chart types change
  // so the pixel mapping is recomputed and no stale white space remains at the top.
  const chartTypesKey = effectiveYMetrics.map(m => `${m.kpi}:${m.chartType}:${m.axis}`).join(',');
  const yAxisKey = `${yAxisMode}|${config.advanced.yAxisMin ?? ''}|${config.advanced.yAxisMax ?? ''}|${config.advanced.yAxisMinRight ?? ''}|${config.advanced.yAxisMaxRight ?? ''}|${hasRight ? 'R' : 'L'}|${chartTypesKey}`;

  return (
    <ReactECharts
      key={yAxisKey}
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate={false}
    />
  );
};

export default BIChartRendererECharts;
