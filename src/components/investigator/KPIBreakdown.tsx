import React from 'react';
import ReactECharts from 'echarts-for-react';
import { KPI_MAP, generateBreakdownData } from './mockData';

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
}

const KPIBreakdown: React.FC<Props> = ({ selectedKpis, layout }) => {
  const cols = layout === 1 ? 1 : 2;

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {selectedKpis.map(kpiId => {
        const def = KPI_MAP[kpiId];
        if (!def) return null;
        const slices = generateBreakdownData(kpiId);

        const option = {
          tooltip: {
            trigger: 'item' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
            formatter: (p: any) => `<b>${p.name}</b><br/>${p.value} ${def.unit} (${p.percent}%)`,
          },
          legend: {
            bottom: 0,
            textStyle: { color: '#9ca3af', fontSize: 10 },
          },
          series: [{
            type: 'pie' as const,
            radius: ['35%', '65%'],
            center: ['50%', '45%'],
            data: slices.map(s => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
            label: { show: true, color: '#9ca3af', fontSize: 10, formatter: '{b}: {d}%' },
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
            },
          }],
        };

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: def.color }} />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">{def.label} — Breakdown</h3>
            </div>
            <ReactECharts option={option} style={{ height: layout === 1 ? 320 : 220 }} />
          </div>
        );
      })}
    </div>
  );
};

export default KPIBreakdown;
