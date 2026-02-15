import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, BarChart, AreaChart, ScatterChart, PieChart,
  Line, Bar, Area, Scatter, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import { ChartConfig, CHART_COLORS, KPI_UNITS } from './biTypes';
import { generateChartData } from './mockBIData';

interface Props {
  config: ChartConfig;
}

const BIChartRenderer: React.FC<Props> = ({ config }) => {
  const data = useMemo(() => generateChartData(config), [config]);
  const hasGroups = config.groupBy.length > 0;
  const firstMetric = config.yMetrics[0];

  if (!firstMetric) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-xs">Add a metric to display</div>;
  }

  // KPI Card
  if (firstMetric.chartType === 'kpi_card') {
    const values = data.map(d => d[firstMetric.kpi]).filter(Boolean);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const unit = KPI_UNITS[firstMetric.kpi] || '';
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="text-4xl font-bold font-mono" style={{ color: firstMetric.color }}>{avg.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{firstMetric.kpi.replace(/_/g, ' ')} {unit}</span>
      </div>
    );
  }

  // Pie chart
  if (firstMetric.chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={firstMetric.kpi} nameKey="x" cx="50%" cy="50%" outerRadius="70%" label>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: 'hsl(222, 84%, 6%)', border: '1px solid hsl(217, 33%, 17%)', borderRadius: 8, fontSize: 12 }} />
          {config.advanced.showLegend && <Legend />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const thresholds = config.advanced.thresholds;

  // Multi-metric composition - determine chart wrapper by first metric
  const primaryType = firstMetric.chartType;
  const isScatter = primaryType === 'scatter';

  const chartProps = {
    data,
    margin: { top: 8, right: 16, bottom: 4, left: 0 },
  };

  const xAxisProps = {
    dataKey: 'x',
    tick: { fill: 'hsl(215, 20%, 65%)', fontSize: 10 },
    axisLine: { stroke: 'hsl(217, 33%, 17%)' },
    tickLine: false,
  };

  const yAxisBase = {
    tick: { fill: 'hsl(215, 20%, 65%)', fontSize: 10 },
    axisLine: false,
    tickLine: false,
  };

  const renderMetrics = () => {
    return config.yMetrics.map((m, i) => {
      const props = {
        key: m.kpi,
        dataKey: m.kpi,
        stroke: m.color,
        fill: m.color,
        yAxisId: m.axis,
        dot: false,
        strokeWidth: 2,
        type: m.smoothCurve ? 'monotone' as const : 'linear' as const,
        fillOpacity: 0.15,
      };

      switch (m.chartType) {
        case 'area': return <Area {...props} />;
        case 'bar': return <Bar {...props} radius={[3, 3, 0, 0]} />;
        case 'scatter': return <Scatter {...props} />;
        case 'stacked_bar': return <Bar {...props} stackId="stack" radius={[2, 2, 0, 0]} />;
        default: return <Line {...props} />;
      }
    });
  };

  const hasRight = config.yMetrics.some(m => m.axis === 'right');

  const ChartWrapper = isScatter ? ScatterChart :
    primaryType === 'bar' || primaryType === 'stacked_bar' ? BarChart :
    primaryType === 'area' ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ChartWrapper {...chartProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 14%)" />
        <XAxis {...xAxisProps} />
        <YAxis yAxisId="left" {...yAxisBase} />
        {hasRight && <YAxis yAxisId="right" orientation="right" {...yAxisBase} />}
        <Tooltip
          contentStyle={{ background: 'hsl(222, 84%, 6%)', border: '1px solid hsl(217, 33%, 17%)', borderRadius: 8, fontSize: 12, color: 'hsl(210, 40%, 98%)' }}
          labelStyle={{ color: 'hsl(215, 20%, 65%)' }}
        />
        {config.advanced.showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {thresholds.map((t, i) => (
          <ReferenceLine key={i} y={t.value} yAxisId="left" stroke={t.color} strokeDasharray="5 3" label={{ value: t.label, fill: t.color, fontSize: 10 }} />
        ))}
        {renderMetrics()}
      </ChartWrapper>
    </ResponsiveContainer>
  );
};

export default BIChartRenderer;
