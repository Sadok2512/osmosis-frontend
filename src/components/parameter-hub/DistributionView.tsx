import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ParameterRow, AggregationLevel } from './parameterHubApi';
import { BarChart3 } from 'lucide-react';

interface DistributionViewProps {
  rows: ParameterRow[];
  aggregation: AggregationLevel;
}

const AGG_KEY: Record<AggregationLevel, keyof ParameterRow> = {
  cell: 'cell_name',
  sector: 'cell_name',
  band: 'bande',
  site: 'site_name',
  plaque: 'plaque',
  dor: 'dor',
};

export const DistributionView: React.FC<DistributionViewProps> = ({ rows, aggregation }) => {
  const { perParameter, hasNumeric } = useMemo(() => {
    const byParam = new Map<string, ParameterRow[]>();
    for (const r of rows) {
      if (!r.parameter) continue;
      if (!byParam.has(r.parameter)) byParam.set(r.parameter, []);
      byParam.get(r.parameter)!.push(r);
    }
    let numeric = false;
    for (const list of byParam.values()) {
      if (list.some((r) => r.value != null && !isNaN(Number(r.value)))) {
        numeric = true;
        break;
      }
    }
    return { perParameter: byParam, hasNumeric: numeric };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <BarChart3 className="w-10 h-10 opacity-30 mb-3" />
        <p className="text-sm font-medium">No data to display</p>
        <p className="text-xs mt-1">Adjust your filters and click Apply to load values.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from(perParameter.entries()).map(([param, list]) => {
        const counts = new Map<string, number>();
        for (const r of list) {
          const key = r.value ?? '(null)';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
        const option = {
          grid: { left: 60, right: 20, top: 30, bottom: 60 },
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: sorted.map(([k]) => k),
            axisLabel: { rotate: 30, fontSize: 10, color: 'hsl(var(--muted-foreground))' },
          },
          yAxis: {
            type: 'value',
            name: 'Count',
            nameTextStyle: { fontSize: 10, color: 'hsl(var(--muted-foreground))' },
            axisLabel: { color: 'hsl(var(--muted-foreground))', fontSize: 10 },
            splitLine: { lineStyle: { color: 'hsl(var(--border))' } },
          },
          series: [
            {
              type: 'bar',
              data: sorted.map(([, v]) => v),
              itemStyle: { color: 'hsl(var(--primary))', borderRadius: [4, 4, 0, 0] },
              barMaxWidth: 24,
            },
          ],
        };

        const subtitle = `${list.length.toLocaleString()} samples · ${counts.size} unique values · agg by ${aggregation}`;

        return (
          <div key={param} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground truncate" title={param}>
                {param}
              </h3>
              <span className="text-[11px] text-muted-foreground">{subtitle}</span>
            </div>
            <ReactECharts option={option} style={{ height: 280 }} notMerge />
          </div>
        );
      })}
    </div>
  );
};

export default DistributionView;
