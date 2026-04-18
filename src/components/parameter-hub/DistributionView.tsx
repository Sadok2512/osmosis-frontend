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
        // 1) Aggregate rows → 1 representative value per entity (mode of values within entity)
        const byEntity = new Map<string, Map<string, number>>();
        for (const r of list) {
          const ekey = groupKeyFor(r, aggregation);
          if (!ekey) continue;
          const v = r.value ?? '(null)';
          if (!byEntity.has(ekey)) byEntity.set(ekey, new Map());
          const vc = byEntity.get(ekey)!;
          vc.set(v, (vc.get(v) ?? 0) + 1);
        }
        const entityCount = byEntity.size;

        // 2) Count entities per value (each entity contributes once)
        const counts = new Map<string, number>();
        byEntity.forEach((valMap) => {
          let bestVal = '(null)';
          let bestN = -1;
          valMap.forEach((n, v) => {
            if (n > bestN) {
              bestN = n;
              bestVal = v;
            }
          });
          counts.set(bestVal, (counts.get(bestVal) ?? 0) + 1);
        });
        const allSorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        const sorted = allSorted.slice(0, 30);
        const totalCount = allSorted.reduce((s, [, n]) => s + n, 0) || 1;
        let cumul = 0;
        const tableRows = allSorted.map(([value, count], idx) => {
          const pct = (count / totalCount) * 100;
          cumul += pct;
          return { value, count, pct, cumul, rank: idx + 1 };
        });
        const topValue = tableRows[0];

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
              return `<div style="font-weight:600;color:#0E7C66;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${p.name}</div><div style="color:#1F2937;font-size:14px;font-weight:600;">${p.value.toLocaleString()} <span style="color:#6B7280;font-weight:400;font-size:12px;">${aggregation}${p.value > 1 ? 's' : ''}</span></div>`;
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
                <span className="font-semibold text-slate-700">{entityCount.toLocaleString()}</span> {aggregation}{entityCount > 1 ? 's' : ''}
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-semibold text-slate-700">{counts.size}</span> unique values
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="text-slate-400">{list.length.toLocaleString()} raw rows</span>
              </p>
            </div>

            {/* Chart */}
            <div className="px-4 pt-4 pb-2">
              <ReactECharts option={option} style={{ height: 420 }} notMerge />
            </div>

            {/* Statistics Table */}
            <div className="px-7 pt-5 pb-6 border-t border-slate-100 bg-gradient-to-b from-slate-50/40 to-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-[13px] font-semibold text-slate-800 tracking-tight">Distribution Summary</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Per-value breakdown · sorted by frequency</p>
                </div>
                {/* Summary chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="px-3 py-1.5 rounded-full bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</span>
                    <span className="ml-2 text-[12px] font-semibold text-slate-700">{totalCount.toLocaleString()}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Unique</span>
                    <span className="ml-2 text-[12px] font-semibold text-slate-700">{counts.size}</span>
                  </div>
                  {topValue && (
                    <div className="px-3 py-1.5 rounded-full bg-gradient-to-b from-teal-50 to-teal-100/60 border border-teal-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700/70">Top</span>
                      <span className="ml-2 text-[12px] font-semibold text-teal-800">{topValue.value}</span>
                      <span className="ml-1.5 text-[11px] text-teal-700/80">({topValue.pct.toFixed(1)}%)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200/70">
                      <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3 text-left w-14">Rank</th>
                        <th className="px-4 py-3 text-left">Value</th>
                        <th className="px-4 py-3 text-right w-28">Count</th>
                        <th className="px-4 py-3 text-left w-[38%]">Percentage</th>
                        <th className="px-4 py-3 text-right w-28">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => {
                        const isTop3 = r.rank <= 3;
                        const rankBg =
                          r.rank === 1
                            ? 'bg-gradient-to-b from-teal-500 to-teal-600 text-white shadow-[0_1px_2px_rgba(14,124,102,0.3)]'
                            : r.rank === 2
                            ? 'bg-teal-100 text-teal-700 border border-teal-200/70'
                            : r.rank === 3
                            ? 'bg-teal-50 text-teal-600 border border-teal-100'
                            : 'bg-slate-100 text-slate-500';
                        return (
                          <tr
                            key={r.value}
                            className="border-b border-slate-100 last:border-b-0 hover:bg-teal-50/30 transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10.5px] font-bold ${rankBg}`}>
                                {r.rank}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`font-mono ${isTop3 ? 'text-slate-800 font-semibold' : 'text-slate-600'}`}>
                                {r.value}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 font-medium">
                              {r.count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all"
                                    style={{ width: `${Math.max(2, r.pct)}%` }}
                                  />
                                </div>
                                <span className={`tabular-nums text-[11.5px] w-12 text-right ${isTop3 ? 'text-teal-700 font-semibold' : 'text-slate-500'}`}>
                                  {r.pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-400 text-[11.5px]">
                              {r.cumul.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-[11px] text-slate-400">
                  Showing {tableRows.length} of {counts.size} value{counts.size > 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-slate-400">
                  Aggregation: <span className="text-slate-600 font-medium">{aggregation}</span> · {entityCount.toLocaleString()} {aggregation}{entityCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DistributionView;
