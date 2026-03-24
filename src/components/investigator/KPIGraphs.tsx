import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG } from './types';
import { KPI_MAP, KPIS } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { cn } from '@/lib/utils';

/* ── Main Component ── */
interface Props {
  graphSlots: GraphSlot[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
  onChangeSlotKpi: (slotId: string, kpiId: string) => void;
  onRemoveSlot: (slotId: string) => void;
}

const KPIGraphs: React.FC<Props> = ({ graphSlots, data, layout, onChangeSlotKpi, onRemoveSlot }) => {
  const cols = layout === 1 ? 1 : 2;
  const chartHeight = layout === 1 ? 400 : layout === 4 ? 220 : 280;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);

  useEffect(() => {
    fetchKpiDefinitions().then(k => { if (k.length > 0) setAllKpis(k); }).catch(() => {});
  }, []);

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const def = KPI_MAP[slot.kpiId] || allKpis.find(k => k.id === slot.kpiId);
        if (!def) return null;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const kpiData = data.filter(d => d.kpi === slot.kpiId);
        const timestamps = kpiData.map(d => d.timestamp);
        const values = kpiData.map(d => d.value);

        const seriesType = cfg.chartType === 'scatter' ? 'scatter' : cfg.chartType === 'bar' ? 'bar' : 'line';

        const option = {
          animation: true,
          grid: { top: 40, right: 20, bottom: 36, left: 56 },
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              if (!p) return '';
              const dt = new Date(p.axisValue);
              return `<div style="font-size:10px;color:#94a3b8;margin-bottom:4px">${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${def.color}"></span><b>${p.value?.toFixed(2)} ${def.unit}</b></div>`;
            },
          },
          xAxis: {
            type: 'category' as const,
            data: timestamps,
            axisLabel: {
              formatter: (v: string) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
              fontSize: 9,
              color: '#9ca3af',
            },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
            axisTick: { show: false },
          },
          yAxis: {
            type: 'value' as const,
            axisLabel: { fontSize: 9, color: '#9ca3af', formatter: (v: number) => `${v.toFixed(1)}` },
            splitLine: {
              show: cfg.showGrid,
              lineStyle: { color: 'rgba(128,128,128,0.12)', type: 'dashed' as const },
            },
          },
          series: [{
            type: seriesType as any,
            data: values,
            smooth: cfg.smooth,
            symbol: cfg.showSymbols ? 'circle' : 'none',
            symbolSize: cfg.showSymbols ? 5 : 0,
            lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color: def.color } : undefined,
            itemStyle: { color: def.color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
            barMaxWidth: 20,
            areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
              color: {
                type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${def.color}20` },
                  { offset: 1, color: `${def.color}02` },
                ],
              },
            } : undefined,
            markLine: cfg.showThresholds ? {
              silent: true,
              data: [
                { yAxis: def.thresholds.warning, lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1 }, label: { show: false } },
                { yAxis: def.thresholds.critical, lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 }, label: { show: false } },
              ],
            } : undefined,
          }],
        };

        return (
          <div key={slot.id} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: def.color }} />
                <span className="text-xs font-bold text-foreground truncate max-w-[200px]">{def.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium ml-auto">{def.unit}</span>
            </div>
            <ReactECharts option={option} style={{ height: chartHeight }} />
          </div>
        );
      })}
    </div>
  );
};

export default KPIGraphs;
