import React from 'react';
import ReactECharts from 'echarts-for-react';
import { KPI_MAP } from './mockData';
import { fetchHistogramData } from './investigatorApi';

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 4;
}

const KPIHistogram: React.FC<Props> = ({ selectedKpis, layout }) => {
  const cols = layout === 1 ? 1 : 2;
  const [histData, setHistData] = React.useState<Record<string, any[]>>({});

  React.useEffect(() => {
    selectedKpis.forEach(kpiId => {
      fetchHistogramData(kpiId).then(bins => {
        setHistData(prev => ({ ...prev, [kpiId]: bins }));
      }).catch(() => {});
    });
  }, [selectedKpis]);

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {selectedKpis.filter(Boolean).map(kpiId => {
        const def = KPI_MAP[kpiId] || { id: kpiId, label: kpiId, unit: '', color: '#6366f1', thresholds: { warning: 50, critical: 20 }, higherIsBetter: false };
        const bins = histData[kpiId] || [];
        if (bins.length === 0) return null;

        const option = {
          grid: { top: 30, right: 20, bottom: 36, left: 50 },
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
          },
          xAxis: {
            type: 'category' as const,
            data: bins.map(b => b.label),
            axisLabel: { fontSize: 8, color: '#9ca3af', rotate: 30 },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
          },
          yAxis: {
            type: 'value' as const,
            name: 'Count',
            nameTextStyle: { fontSize: 9, color: '#9ca3af' },
            axisLabel: { fontSize: 9, color: '#9ca3af' },
            splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)', type: 'dashed' as const } },
          },
          series: [{
            type: 'bar' as const,
            data: bins.map(b => b.count),
            itemStyle: { color: def.color, borderRadius: [3, 3, 0, 0] },
            barMaxWidth: 30,
          }],
        };

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: def.color }} />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">{def.label} — Distribution</h3>
            </div>
            <ReactECharts option={option} style={{ height: layout === 1 ? 320 : 220 }} />
          </div>
        );
      })}
    </div>
  );
};

export default KPIHistogram;
