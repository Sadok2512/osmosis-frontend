import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartConfig, CHART_COLORS, KPI_UNITS } from './biTypes';
import { generateChartData, getKPIBase } from './mockBIData';
import { useCSVData } from './CSVDataStore';

interface Props {
  config: ChartConfig;
}

const BIChartRendererECharts: React.FC<Props> = ({ config }) => {
  const { getDataset } = useCSVData();
  const csvDataset = config.dataSource?.type === 'csv' && config.dataSource.csvDatasetId
    ? getDataset(config.dataSource.csvDatasetId) : null;

  const rawData = useMemo(() => {
    if (csvDataset && config.dataSource?.xColumn) {
      return csvDataset.rows.map(row => ({
        x: row[config.dataSource!.xColumn!],
        ...Object.fromEntries(
          (config.dataSource!.yColumns || []).map(col => [col, row[col]])
        ),
      }));
    }
    return generateChartData(config);
  }, [config, csvDataset]);

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
    return config.yMetrics;
  }, [csvDataset, config.dataSource?.yColumns, config.yMetrics]);

  const firstMetric = effectiveYMetrics[0];

  // Pivot grouped data
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
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Add a metric to display
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
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'transparent',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      legend: config.advanced.showLegend ? {
        type: 'scroll', bottom: 0,
        textStyle: { fontSize: 10, color: '#64748b' },
      } : undefined,
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        data: pieData,
        label: { fontSize: 10, formatter: '{b}: {d}%' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    };

    return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />;
  }

  // ── Heatmap ──
  if (firstMetric.chartType === 'heatmap') {
    const yLabels = hasGroup
      ? groupKeys
      : effectiveYMetrics.map(m => m.kpi.replace(/_/g, ' '));

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
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'transparent',
        textStyle: { color: '#fff', fontSize: 11 },
      },
      grid: { top: 10, right: 10, bottom: 40, left: 80 },
      xAxis: {
        type: 'category',
        data: xLabels.map(x => x.includes('-') ? x.slice(5) : x),
        axisLabel: { fontSize: 9, color: '#94a3b8', rotate: xLabels.length > 10 ? 45 : 0 },
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        axisLabel: { fontSize: 9, color: '#94a3b8' },
        splitArea: { show: true },
      },
      visualMap: {
        min: minVal, max: maxVal,
        calculable: true, orient: 'horizontal',
        left: 'center', bottom: 0,
        textStyle: { fontSize: 9, color: '#94a3b8' },
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

  // ── Build ECharts option for line/bar/area/scatter/stacked_bar/grouped_bar ──
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
          itemStyle: { color: s.color },
          emphasis: { focus: 'series' },
        };

        switch (m.chartType) {
          case 'bar':
            series.push({ ...baseSeries, type: 'bar', barMaxWidth: 30, itemStyle: { ...baseSeries.itemStyle, borderRadius: [4, 4, 0, 0] } });
            break;
          case 'stacked_bar':
            series.push({ ...baseSeries, type: 'bar', stack: 'stack', barMaxWidth: 30 });
            break;
          case 'grouped_bar':
            series.push({ ...baseSeries, type: 'bar', barMaxWidth: 24, itemStyle: { ...baseSeries.itemStyle, borderRadius: [5, 5, 0, 0] } });
            break;
          case 'area':
            series.push({
              ...baseSeries, type: 'line', smooth: m.smoothCurve,
              symbol: 'circle', symbolSize: 4, lineStyle: { width: 2.5 },
              areaStyle: { opacity: 0.15 },
            });
            break;
          case 'scatter':
            series.push({ ...baseSeries, type: 'scatter', symbolSize: 8 });
            break;
          case 'line':
          default:
            series.push({
              ...baseSeries, type: 'line', smooth: m.smoothCurve,
              symbol: 'circle', symbolSize: 4, lineStyle: { width: 2.5 },
              areaStyle: { opacity: 0.06 },
            });
            break;
        }
      }
    }

    // Threshold markLines on first series
    const thresholds = config.advanced.thresholds;
    const milestones = config.advanced.milestones || [];
    const markLineData: any[] = [];

    for (const t of thresholds) {
      markLineData.push({
        yAxis: t.value,
        name: `⊙ ${t.label}: ${t.value}`,
        lineStyle: { color: t.color || '#ef4444', type: t.lineStyle === 'dotted' ? 'dotted' : t.lineStyle === 'dashed' ? 'dashed' : 'solid', width: 1.5 },
        label: { fontSize: 9, position: 'insideEndTop', formatter: `⊙ ${t.label}: ${t.value}` },
      });
    }

    for (const m of milestones) {
      markLineData.push({
        xAxis: m.date.includes('-') ? m.date.slice(5) : m.date,
        name: `▾ ${m.label}`,
        lineStyle: { color: m.color || '#8b5cf6', type: m.lineStyle === 'dotted' ? 'dotted' : 'dashed', width: 1.5 },
        label: { fontSize: 9, position: 'insideEndTop', formatter: `▾ ${m.label}` },
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

  const yAxis: any[] = [{
    type: 'value',
    axisLabel: { fontSize: 10, color: '#94a3b8' },
    splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
  }];

  if (hasRight) {
    yAxis.push({
      type: 'value',
      position: 'right',
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    });
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 11 },
      axisPointer: { type: 'cross', label: { backgroundColor: '#334155' } },
    },
    legend: config.advanced.showLegend ? {
      type: 'scroll', bottom: 0,
      textStyle: { fontSize: 10, color: '#64748b' },
      icon: 'roundRect',
    } : undefined,
    grid: {
      top: 30, right: hasRight ? 60 : 20, bottom: config.advanced.showLegend ? 50 : 30, left: 50,
    },
    xAxis: {
      type: 'category',
      data: xLabels.map(formatX),
      axisLabel: { fontSize: 9, color: '#94a3b8', rotate: xLabels.length > 15 ? 45 : 0 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis,
    series: buildSeries(),
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
      { type: 'slider', xAxisIndex: 0, start: 0, end: 100, height: 18, bottom: config.advanced.showLegend ? 28 : 8,
        handleSize: '80%', fillerColor: 'rgba(59,130,246,0.15)', borderColor: '#e2e8f0' },
    ],
    toolbox: {
      right: 10, top: 0,
      feature: {
        saveAsImage: { title: 'PNG', pixelRatio: 2 },
        dataZoom: { title: { zoom: 'Zoom', back: 'Reset' } },
        restore: { title: 'Reset' },
      },
      iconStyle: { borderColor: '#94a3b8' },
    },
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
};

export default BIChartRendererECharts;
