import React from 'react';
import ReactECharts from 'echarts-for-react';
import { KPI_MAP } from './mockData';
import { fetchHistogramData } from './investigatorApi';
import {
  PH_COLORS,
  phTooltip,
  phXAxis,
  phYAxis,
  phBarItemStyle,
  phBarEmphasis,
  phAnimation,
} from './paramHubChartStyle';

interface Props {
  selectedKpis: string[];
  layout: 1 | 2 | 3 | 4;
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
          ...phAnimation,
          grid: { top: 24, right: 20, bottom: 56, left: 56, containLabel: false },
          tooltip: phTooltip(),
          xAxis: {
            type: 'category' as const,
            data: bins.map(b => b.label),
            ...phXAxis({ axisLabel: { fontSize: 11, color: PH_COLORS.labelMuted, rotate: 30, margin: 12 } }),
          },
          yAxis: {
            type: 'value' as const,
            name: 'Count',
            nameTextStyle: { fontSize: 10, color: PH_COLORS.labelSubtle },
            ...phYAxis(),
          },
          series: [{
            type: 'bar' as const,
            data: bins.map(b => b.count),
            itemStyle: phBarItemStyle(),
            emphasis: phBarEmphasis(),
            barMaxWidth: 36,
            barCategoryGap: '32%',
          }],
        };

        return (
          <div
            key={kpiId}
            className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="px-6 pt-5 pb-2 flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight truncate">{def.label}</h3>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                Distribution
              </span>
            </div>
            <div className="px-3 pb-3">
              <ReactECharts option={option} style={{ height: layout === 1 ? 320 : 220 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KPIHistogram;
