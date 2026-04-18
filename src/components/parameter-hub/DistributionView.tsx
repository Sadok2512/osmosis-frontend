import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ParameterRow, AggregationLevel } from './parameterHubApi';
import { BarChart3 } from 'lucide-react';

interface DistributionViewProps {
  rows: ParameterRow[];
  aggregation: AggregationLevel;
}

/** Stable entity key per aggregation level. */
const groupKeyFor = (r: ParameterRow, level: AggregationLevel): string | null => {
  switch (level) {
    case 'cell':
      return r.cell_name ?? r.cell_dn ?? r.dn ?? null;
    case 'sector': {
      const c = r.cell_name ?? r.cell_dn ?? r.dn;
      if (!c) return null;
      return c.replace(/\d+$/, '') || c;
    }
    case 'band':
      return r.bande ?? null;
    case 'site':
      return r.site_name ?? null;
    case 'plaque':
      return r.plaque ?? null;
    case 'dor':
      return r.dor ?? null;
  }
};

export const DistributionView: React.FC<DistributionViewProps> = ({ rows, aggregation }) => {
  const perParameter = useMemo(() => {
    const byParam = new Map<string, ParameterRow[]>();
    for (const r of rows) {
      if (!r.parameter) continue;
      if (!byParam.has(r.parameter)) byParam.set(r.parameter, []);
      byParam.get(r.parameter)!.push(r);
    }
    return byParam;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <BarChart3 className="w-12 h-12 opacity-30 mb-3" />
        <p className="text-sm font-medium text-slate-500">No data to display</p>
        <p className="text-xs mt-1">Adjust your filters and click Apply to load values.</p>
      </div>
    );
  }

  const entries = Array.from(perParameter.entries());

  return (
    <div className={entries.length === 1 ? 'flex justify-center' : 'grid grid-cols-1 xl:grid-cols-2 gap-6'}>
      {entries.map(([param, list]) => {
        const counts = new Map<string, number>();
        for (const r of list) {
          const key = r.value ?? '(null)';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);

        const option = {
          grid: { left: 56, right: 24, top: 24, bottom: 72, containLabel: false },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(14, 124, 102, 0.06)' } },
            backgroundColor: '#ffffff',
            borderColor: 'rgba(15, 23, 42, 0.06)',
            borderWidth: 1,
            padding: [10, 14],
            textStyle: { color: '#1F2937', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' },
            extraCssText: 'box-shadow: 0 12px 32px -8px rgba(15, 23, 42, 0.18); border-radius: 10px;',
            formatter: (params: any) => {
              const p = params[0];
              return `<div style="font-weight:600;color:#0E7C66;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${p.name}</div><div style="color:#1F2937;font-size:14px;font-weight:600;">${p.value.toLocaleString()} <span style="color:#6B7280;font-weight:400;font-size:12px;">samples</span></div>`;
            },
          },
          xAxis: {
            type: 'category',
            data: sorted.map(([k]) => k),
            axisLine: { lineStyle: { color: '#E5E7EB' } },
            axisTick: { show: false },
            axisLabel: {
              rotate: sorted.length > 8 ? 35 : 0,
              fontSize: 11,
              color: '#6B7280',
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: 12,
            },
          },
          yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: '#9CA3AF',
              fontSize: 11,
              fontFamily: 'Inter, system-ui, sans-serif',
            },
            splitLine: { lineStyle: { color: '#F1F5F9', type: 'solid' } },
          },
          series: [
            {
              type: 'bar',
              data: sorted.map(([, v]) => v),
              barMaxWidth: 36,
              barCategoryGap: '32%',
              itemStyle: {
                borderRadius: [8, 8, 0, 0],
                color: {
                  type: 'linear',
                  x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: '#14B8A6' },
                    { offset: 1, color: '#0E7C66' },
                  ],
                },
                shadowColor: 'rgba(14, 124, 102, 0.18)',
                shadowBlur: 8,
                shadowOffsetY: 2,
              },
              emphasis: {
                itemStyle: {
                  color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: '#2DD4BF' },
                      { offset: 1, color: '#14B8A6' },
                    ],
                  },
                  shadowBlur: 16,
                  shadowColor: 'rgba(20, 184, 166, 0.35)',
                },
              },
              animationDuration: 700,
              animationEasing: 'cubicOut',
            },
          ],
        };

        return (
          <div
            key={param}
            className="w-full max-w-[1100px] mx-auto rounded-2xl border border-slate-200/70 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            {/* Card header */}
            <div className="px-8 pt-7 pb-2">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-base font-semibold text-slate-800 tracking-tight truncate" title={param}>
                  {param}
                </h3>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  Distribution
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                <span className="font-semibold text-slate-700">{list.length.toLocaleString()}</span> samples
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-semibold text-slate-700">{counts.size}</span> unique values
                <span className="mx-1.5 text-slate-300">·</span>
                aggregated by <span className="font-medium text-teal-700">{aggregation}</span>
              </p>
            </div>

            {/* Chart */}
            <div className="px-4 pt-4 pb-2">
              <ReactECharts option={option} style={{ height: 420 }} notMerge />
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {list.length.toLocaleString()} rows · aggregation: {aggregation}
              </span>
              <span className="text-[11px] text-slate-400">Top {Math.min(30, counts.size)} of {counts.size}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DistributionView;
