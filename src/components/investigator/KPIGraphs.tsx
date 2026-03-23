import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint } from './types';
import { KPI_MAP } from './mockData';

interface Props {
  selectedKpis: string[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
}

const KPIGraphs: React.FC<Props> = ({ selectedKpis, data, layout }) => {
  const cols = layout === 1 ? 1 : layout === 2 ? 2 : 2;

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {selectedKpis.map(kpiId => {
        const def = KPI_MAP[kpiId];
        if (!def) return null;
        const kpiData = data.filter(d => d.kpi === kpiId);
        const timestamps = kpiData.map(d => d.timestamp);
        const values = kpiData.map(d => d.value);

        const option = {
          animation: true,
          grid: { top: 40, right: 20, bottom: 36, left: 56 },
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
            formatter: (params: any) => {
              const p = params[0];
              const dt = new Date(p.axisValue);
              return `<div style="font-size:10px;color:#94a3b8;margin-bottom:4px">${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${def.color}"></span><b>${p.value.toFixed(2)} ${def.unit}</b></div>`;
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
            splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)', type: 'dashed' as const } },
          },
          series: [{
            type: 'line' as const,
            data: values,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 2.5, color: def.color },
            areaStyle: {
              color: {
                type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${def.color}20` },
                  { offset: 1, color: `${def.color}02` },
                ],
              },
            },
            markLine: {
              silent: true,
              data: [
                { yAxis: def.thresholds.warning, lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1 }, label: { show: false } },
                { yAxis: def.thresholds.critical, lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 }, label: { show: false } },
              ],
            },
          }],
        };

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: def.color }} />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">{def.label}</h3>
              <span className="text-[10px] text-muted-foreground font-medium ml-auto">{def.unit}</span>
            </div>
            <ReactECharts option={option} style={{ height: layout === 1 ? 360 : 240 }} />
          </div>
        );
      })}
    </div>
  );
};

export default KPIGraphs;
