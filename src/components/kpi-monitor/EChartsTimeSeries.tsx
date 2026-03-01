import React, { useMemo, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { KpiTimeSeriesPoint, KpiCatalogEntry, GraphType } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import PremiumGraphCard from './PremiumGraphCard';

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
  title?: string;
  badge?: string;
  granularity?: string;
  onOpenSettings?: () => void;
  onExportPNG?: () => void;
}

/* ── Color palette (enterprise neutral + accent) ── */
const PREMIUM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

const getSeriesType = (graphType?: GraphType): string => {
  if (!graphType || graphType === 'scatter') return graphType || 'line';
  if (graphType === 'stacked_area') return 'line';
  return graphType;
};

const EChartsTimeSeries: React.FC<Props> = ({
  data, height = 460, catalogMap: externalMap,
  title, badge, granularity, onOpenSettings, onExportPNG: externalExportPNG,
}) => {
  const { selectedKpis } = useKpiMonitorStore();
  const chartRef = useRef<ReactECharts>(null);
  const catMap = externalMap || KPI_CATALOG_MAP;

  const option = useMemo(() => {
    // ── Series grouping ──
    const seriesMap = new Map<string, { ts: string; value: number }[]>();
    for (const pt of data) {
      const key = pt.split_value === 'ALL' ? pt.kpi_key : `${pt.kpi_key} — ${pt.split_value}`;
      if (!seriesMap.has(key)) seriesMap.set(key, []);
      seriesMap.get(key)!.push({ ts: pt.ts, value: pt.value });
    }
    const allTs = [...new Set(data.map(d => d.ts))].sort();

    // ── Y Axes ──
    const leftKpis = selectedKpis.filter(k => k.axis === 'left');
    const rightKpis = selectedKpis.filter(k => k.axis === 'right');
    const yAxis: any[] = [];

    const axisBase = {
      axisLabel: { fontSize: 10, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif', formatter: (v: number) => {
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
        return v % 1 === 0 ? v.toString() : v.toFixed(1);
      }},
      nameTextStyle: { fontSize: 10, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif', padding: [0, 0, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
    };

    if (leftKpis.length > 0) {
      const cat = catMap[leftKpis[0].kpi_key];
      yAxis.push({
        ...axisBase,
        type: 'value',
        name: cat?.unit || '',
        position: 'left',
        splitLine: {
          lineStyle: { color: 'rgba(0,0,0,0.06)', type: [4, 4], width: 1 },
        },
      });
    }
    if (rightKpis.length > 0) {
      const cat = catMap[rightKpis[0].kpi_key];
      yAxis.push({
        ...axisBase,
        type: 'value',
        name: cat?.unit || '',
        position: 'right',
        splitLine: { show: false },
      });
    }
    if (yAxis.length === 0) yAxis.push({ ...axisBase, type: 'value', splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: [4, 4] } } });

    // ── Series ──
    const series: any[] = [];
    let colorIdx = 0;
    for (const [name, points] of seriesMap) {
      const kpiKey = name.split(' — ')[0];
      const kpiSel = selectedKpis.find(k => k.kpi_key === kpiKey);
      const cat = catMap[kpiKey];
      const yAxisIndex = kpiSel?.axis === 'right' && yAxis.length > 1 ? 1 : 0;
      const color = kpiSel?.color || cat?.color || PREMIUM_COLORS[colorIdx % PREMIUM_COLORS.length];
      colorIdx++;

      const chartType = getSeriesType(kpiSel?.graphType);
      const isStacked = kpiSel?.graphType === 'stacked_area';

      const dataArr = allTs.map(ts => {
        const pt = points.find(p => p.ts === ts);
        return pt ? pt.value : null;
      });

      series.push({
        name,
        type: chartType === 'scatter' ? 'scatter' : chartType === 'bar' ? 'bar' : 'line',
        smooth: chartType !== 'bar' && chartType !== 'scatter' ? 0.3 : false,
        symbol: chartType === 'scatter' ? 'circle' : 'none',
        symbolSize: chartType === 'scatter' ? 6 : 0,
        yAxisIndex,
        data: dataArr,
        stack: isStacked ? 'stack' : undefined,
        lineStyle: {
          width: 2.5,
          color,
          shadowColor: `${color}30`,
          shadowBlur: 8,
          shadowOffsetY: 3,
        },
        itemStyle: { color, borderWidth: 0 },
        areaStyle: (chartType === 'area' || isStacked) ? {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}18` },
              { offset: 1, color: `${color}02` },
            ],
          },
        } : undefined,
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3 },
          itemStyle: { borderWidth: 2, borderColor: '#fff', shadowBlur: 6, shadowColor: `${color}40` },
        },
        showSymbol: false,
        connectNulls: true,
      });
    }

    // ── Threshold mark lines (only from user-configured thresholds, not auto) ──

    return {
      // ── Premium Tooltip ──
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.96)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: [14, 18],
        textStyle: { color: '#f1f5f9', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' },
        extraCssText: 'border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.24); backdrop-filter: blur(12px);',
        axisPointer: {
          type: 'line',
          lineStyle: { color: 'rgba(59,130,246,0.25)', width: 1, type: 'solid' },
          crossStyle: { color: 'rgba(59,130,246,0.15)' },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const ts = params[0].axisValueLabel || '';
          let html = `<div style="margin-bottom:8px;font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase">${ts}</div>`;
          for (const p of params) {
            if (p.value == null) continue;
            const val = typeof p.value === 'number' ? p.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : p.value;
            html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};box-shadow:0 0 6px ${p.color}60"></span>
              <span style="flex:1;color:#cbd5e1;font-size:11px">${p.seriesName}</span>
              <span style="font-weight:700;color:#f8fafc;font-size:11px;font-variant-numeric:tabular-nums">${val}</span>
            </div>`;
          }
          return html;
        },
      },
      // ── Legend (hidden — info in title & config panel) ──
      legend: { show: false },
      // ── Grid ──
      grid: {
        top: 24,
        right: rightKpis.length > 0 ? 72 : 24,
        bottom: 40,
        left: 56,
        containLabel: false,
      },
      // ── X Axis ──
      xAxis: {
        type: 'category',
        data: allTs.map(ts => {
          const d = new Date(ts);
          return d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) +
            (allTs.length > 60 ? '' : ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        }),
        axisLabel: {
          fontSize: 10,
          color: '#9ca3af',
          fontFamily: 'Inter, system-ui, sans-serif',
          rotate: allTs.length > 30 ? 35 : 0,
          margin: 12,
        },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: 'rgba(0,0,0,0.03)', type: [2, 4] },
        },
      },
      yAxis,
      series,
      // ── DataZoom (premium slider) ──
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
        {
          type: 'slider', xAxisIndex: 0, start: 0, end: 100,
          height: 16,
          bottom: 38,
          borderColor: 'transparent',
          backgroundColor: 'rgba(0,0,0,0.02)',
          fillerColor: 'rgba(59,130,246,0.12)',
          handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
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
      ],
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicInOut',
    };
  }, [data, selectedKpis, catMap]);

  const handleExportPNG = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'chart'}.png`;
    a.click();
  }, [title]);

  const totalSeries = option.series?.length || 0;
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <PremiumGraphCard
      title={title || 'KPI Time Series'}
      badge={badge}
      granularity={granularity}
      seriesCount={totalSeries}
      lastUpdated={now}
      onOpenSettings={onOpenSettings}
      onExportPNG={externalExportPNG || handleExportPNG}
    >
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
          <div className="w-full h-full flex flex-col gap-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 rounded bg-muted/40 animate-pulse" style={{ width: `${85 - i * 12}%` }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60 font-medium">
            Aucune donnée — ajustez les filtres
          </p>
        </div>
      ) : (
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: height - 80, width: '100%' }}
          opts={{ renderer: 'canvas' }}
          notMerge
        />
      )}
    </PremiumGraphCard>
  );
};

export default EChartsTimeSeries;
