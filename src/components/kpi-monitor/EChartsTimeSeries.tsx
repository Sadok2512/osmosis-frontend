import React, { useMemo, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { KpiTimeSeriesPoint, KpiCatalogEntry, GraphType } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import PremiumGraphCard from './PremiumGraphCard';
import type { WidgetGraphConfig, WidgetAxisConfig, WidgetThreshold } from './GraphSettingsPanel';

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
  title?: string;
  badge?: string;
  granularity?: string;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  onExpand?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  graphConfig?: WidgetGraphConfig;
  axisConfig?: WidgetAxisConfig;
  thresholds?: WidgetThreshold[];
  thresholdsEnabled?: boolean;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  configPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

/* ── Color palette (enterprise neutral + accent) ── */
const PREMIUM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

/* Convert any CSS color to hex so we can safely append alpha hex digits */
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

/* Create rgba string with alpha (0-1) from any CSS color */
const withAlpha = (c: string, alpha: number): string => {
  const hex = toHex(c);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const getSeriesType = (graphType?: GraphType): string => {
  if (!graphType || graphType === 'scatter') return graphType || 'line';
  if (graphType === 'stacked_area') return 'line';
  return graphType;
};

const EChartsTimeSeries: React.FC<Props> = ({
  data, height = 460, catalogMap: externalMap,
  title, badge, granularity, onExportPNG: externalExportPNG,
  onExportCSV, onRefresh, onExpand, onDuplicate, onDelete,
  graphConfig: gc, axisConfig: ac, thresholds: thresholdList, thresholdsEnabled,
  editMode, onToggleEditMode, configPanel, bottomPanel,
  onAxisConfigChange, onGraphConfigChange,
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

    const yDecimals = ac?.yDecimals ?? 2;
    const axisBase = {
      axisLabel: { fontSize: 10, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif', formatter: (v: number) => {
        if (ac?.yUnit) return v.toFixed(yDecimals) + ' ' + ac.yUnit;
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
        if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
        return v % 1 === 0 ? v.toString() : v.toFixed(yDecimals);
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
        name: ac?.yTitle || cat?.unit || '',
        position: 'left',
        inverse: ac?.yInvert || false,
        min: ac?.yMin !== 'auto' && ac?.yMin !== undefined ? ac.yMin : undefined,
        max: ac?.yMax !== 'auto' && ac?.yMax !== undefined ? ac.yMax : undefined,
        splitLine: {
          lineStyle: { color: gc?.gridIntensity === 'medium' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.06)', type: [4, 4], width: 1 },
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
      const color = toHex(kpiSel?.color || cat?.color || PREMIUM_COLORS[colorIdx % PREMIUM_COLORS.length]);
      colorIdx++;

      const chartType = getSeriesType(kpiSel?.graphType);
      const isStacked = kpiSel?.graphType === 'stacked_area';

      const dataArr = allTs.map(ts => {
        const pt = points.find(p => p.ts === ts);
        return pt ? pt.value : null;
      });

      const lineW = gc?.lineWidth ?? 2.5;
      const isSmooth = gc?.smooth ?? true;
      const showSym = gc?.showSymbols ?? false;

      series.push({
        name,
        type: chartType === 'scatter' ? 'scatter' : chartType === 'bar' ? 'bar' : 'line',
        smooth: chartType !== 'bar' && chartType !== 'scatter' ? (isSmooth ? 0.3 : false) : false,
        symbol: chartType === 'scatter' ? 'circle' : showSym ? 'circle' : 'none',
        symbolSize: chartType === 'scatter' ? 6 : showSym ? 4 : 0,
        yAxisIndex,
        data: dataArr,
        stack: isStacked ? 'stack' : undefined,
        lineStyle: {
          width: lineW,
          color,
          shadowColor: withAlpha(color, 0.19),
          shadowBlur: 8,
          shadowOffsetY: 3,
        },
        itemStyle: { color, borderWidth: 0 },
        areaStyle: (chartType === 'area' || isStacked) ? {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, 0.09) },
              { offset: 1, color: withAlpha(color, 0.01) },
            ],
          },
        } : undefined,
        emphasis: {
          focus: 'series',
          lineStyle: { width: lineW + 0.5 },
          itemStyle: { borderWidth: 2, borderColor: '#fff', shadowBlur: 6, shadowColor: withAlpha(color, 0.25) },
        },
        showSymbol: showSym,
        connectNulls: true,
        // ── Threshold markLines ──
        ...(thresholdsEnabled && thresholdList && thresholdList.length > 0 && colorIdx === 1 ? {
          markLine: {
            silent: true,
            symbol: 'none',
            data: thresholdList.map(t => ({
              yAxis: t.value,
              lineStyle: { color: t.color, type: t.style, width: 1.5 },
              label: { formatter: t.label, fontSize: 9, color: t.color, position: 'insideEndTop' },
            })),
          },
        } : {}),
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
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};box-shadow:0 0 6px ${p.color}"></span>
              <span style="flex:1;color:#cbd5e1;font-size:11px">${p.seriesName}</span>
              <span style="font-weight:700;color:#f8fafc;font-size:11px;font-variant-numeric:tabular-nums">${val}</span>
            </div>`;
          }
          return html;
        },
      },
      legend: { show: gc?.showLegend ?? false, bottom: gc?.legendPosition === 'top' ? undefined : 8, top: gc?.legendPosition === 'top' ? 0 : undefined, textStyle: { fontSize: 11, color: '#64748b' }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
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
          const xFmt = ac?.xFormat || 'short';
          if (xFmt === 'date') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
          if (xFmt === 'datetime') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          if (xFmt === 'full') return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
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
          show: gc?.showVerticalGrid ?? false,
          lineStyle: { color: gc?.gridIntensity === 'medium' ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)', type: [2, 4] },
        },
      },
      yAxis,
      series,
      // ── DataZoom (inside only — no slider preview line) ──
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
      ],
      backgroundColor: gc?.backgroundColor && gc.backgroundColor !== 'transparent' && !gc.transparentBg ? gc.backgroundColor : 'transparent',
      animation: true,
      animationDuration: 600,
      animationEasing: 'cubicInOut',
    };
  }, [data, selectedKpis, catMap, gc, ac, thresholdList, thresholdsEnabled]);

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
      onExportPNG={externalExportPNG || handleExportPNG}
      onExportCSV={onExportCSV}
      onRefresh={onRefresh}
      onExpand={onExpand}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      editMode={editMode}
      onToggleEditMode={onToggleEditMode}
      configPanel={configPanel}
      bottomPanel={bottomPanel}
      axisConfig={ac}
      onAxisConfigChange={onAxisConfigChange}
      graphConfig={gc}
      onGraphConfigChange={onGraphConfigChange}
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
