import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { KpiTimeSeriesPoint, KpiCatalogEntry } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
}

const EChartsTimeSeries: React.FC<Props> = ({ data, height = 500, catalogMap: externalMap }) => {
  const { selectedKpis } = useKpiMonitorStore();

  const catMap = externalMap || KPI_CATALOG_MAP;

  const option = useMemo(() => {
    // Group by kpi_key + split_value → one series each
    const seriesMap = new Map<string, { ts: string; value: number }[]>();
    for (const pt of data) {
      const key = pt.split_value === 'ALL' ? pt.kpi_key : `${pt.kpi_key} — ${pt.split_value}`;
      if (!seriesMap.has(key)) seriesMap.set(key, []);
      seriesMap.get(key)!.push({ ts: pt.ts, value: pt.value });
    }

    // Collect unique timestamps
    const allTs = [...new Set(data.map(d => d.ts))].sort();

    // Build Y axes
    const leftKpis = selectedKpis.filter(k => k.axis === 'left');
    const rightKpis = selectedKpis.filter(k => k.axis === 'right');
    const yAxis: any[] = [];

    if (leftKpis.length > 0) {
      const cat = catMap[leftKpis[0].kpi_key];
      yAxis.push({
        type: 'value',
        name: cat?.unit || '',
        position: 'left',
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        nameTextStyle: { fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      });
    }
    if (rightKpis.length > 0) {
      const cat = catMap[rightKpis[0].kpi_key];
      yAxis.push({
        type: 'value',
        name: cat?.unit || '',
        position: 'right',
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        nameTextStyle: { fontSize: 10, color: '#94a3b8' },
        splitLine: { show: false },
      });
    }
    if (yAxis.length === 0) yAxis.push({ type: 'value' });

    // Build series
    const series: any[] = [];
    for (const [name, points] of seriesMap) {
      const kpiKey = name.split(' — ')[0];
      const kpiSel = selectedKpis.find(k => k.kpi_key === kpiKey);
      const cat = catMap[kpiKey];
      const yAxisIndex = kpiSel?.axis === 'right' && yAxis.length > 1 ? 1 : 0;

      const dataArr = allTs.map(ts => {
        const pt = points.find(p => p.ts === ts);
        return pt ? pt.value : null;
      });

      series.push({
        name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        yAxisIndex,
        data: dataArr,
        lineStyle: { width: 2 },
        itemStyle: { color: cat?.color },
        areaStyle: seriesMap.size <= 3 ? { opacity: 0.08 } : undefined,
        emphasis: { focus: 'series' },
      });
    }

    // Threshold reference lines
    const markLines: any[] = [];
    for (const kpiSel of selectedKpis) {
      const cat = catMap[kpiSel.kpi_key];
      if (cat?.thresholds) {
        markLines.push(
          { yAxis: cat.thresholds.warning, name: `${cat.display_name} Warning`, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 } },
          { yAxis: cat.thresholds.critical, name: `${cat.display_name} Critical`, lineStyle: { color: '#ef4444', type: 'dashed', width: 1 } },
        );
      }
    }
    if (markLines.length > 0 && series.length > 0) {
      series[0].markLine = {
        silent: true,
        symbol: 'none',
        data: markLines,
        label: { fontSize: 9, position: 'insideEndTop' },
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'transparent',
        textStyle: { color: '#fff', fontSize: 11 },
        axisPointer: { type: 'cross', label: { backgroundColor: '#334155' } },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { fontSize: 10, color: '#64748b' },
        icon: 'roundRect',
      },
      grid: { top: 40, right: rightKpis.length > 0 ? 80 : 30, bottom: 50, left: 60 },
      xAxis: {
        type: 'category',
        data: allTs.map(ts => {
          const d = new Date(ts);
          return d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) +
            (allTs.length > 60 ? '' : ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        }),
        axisLabel: { fontSize: 9, color: '#94a3b8', rotate: allTs.length > 30 ? 45 : 0 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis,
      series,
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
        { type: 'slider', xAxisIndex: 0, start: 0, end: 100, height: 20, bottom: 30, handleSize: '80%',
          fillerColor: 'rgba(59,130,246,0.15)', borderColor: '#e2e8f0' },
      ],
      toolbox: {
        right: 10,
        top: 5,
        feature: {
          saveAsImage: { title: 'PNG', pixelRatio: 2 },
          dataZoom: { title: { zoom: 'Zoom', back: 'Reset' } },
          restore: { title: 'Reset' },
        },
        iconStyle: { borderColor: '#94a3b8' },
      },
    };
  }, [data, selectedKpis, catMap]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
};

export default EChartsTimeSeries;
