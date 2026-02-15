import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart, ScatterChart, PieChart,
  Line, Bar, Area, Scatter, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import { ChartConfig, CHART_COLORS, KPI_UNITS } from './biTypes';
import { generateChartData } from './mockBIData';

interface Props {
  config: ChartConfig;
}

// Custom dot - plain function, no ref needed
const renderDot = (props: any) => {
  const { cx, cy, stroke } = props;
  if (!cx || !cy) return null;
  return (
    <circle cx={cx} cy={cy} r={3.5} fill="white" stroke={stroke} strokeWidth={2} />
  );
};

// Custom tooltip - filter out background entries
const renderTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter((e: any) => !e.name?.endsWith('_bg'));
  if (!filtered.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 min-w-[120px]">
      <p className="text-[10px] text-muted-foreground font-medium mb-1">{label}</p>
      {filtered.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color || entry.stroke }} />
            <span className="text-[10px] text-muted-foreground">{entry.name?.replace(/_/g, ' ')}</span>
          </div>
          <span className="text-xs font-semibold font-mono text-foreground">{typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}</span>
        </div>
      ))}
    </div>
  );
};

const BIChartRenderer: React.FC<Props> = ({ config }) => {
  const data = useMemo(() => generateChartData(config), [config]);
  const firstMetric = config.yMetrics[0];

  if (!firstMetric) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Add a metric to display
      </div>
    );
  }

  // ── KPI Card ──
  if (firstMetric.chartType === 'kpi_card') {
    const values = data.map(d => d[firstMetric.kpi]).filter(Boolean);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const unit = KPI_UNITS[firstMetric.kpi] || '';
    const prev = values.length > 1 ? values[values.length - 2] : avg;
    const delta = ((avg - prev) / prev * 100);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <span className="text-3xl font-bold font-mono tracking-tight" style={{ color: firstMetric.color }}>
          {avg.toFixed(1)}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {firstMetric.kpi.replace(/_/g, ' ')} {unit && `(${unit})`}
        </span>
        <span className={`text-[10px] font-mono font-semibold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
    );
  }

  // ── Pie Chart ──
  if (firstMetric.chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={firstMetric.kpi} nameKey="x" cx="50%" cy="50%" outerRadius="65%" innerRadius="35%"
            stroke="none" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={{ stroke: 'hsl(215, 20%, 75%)', strokeWidth: 1 }}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip content={renderTooltip} />
          {config.advanced.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ── Composed Chart ──
  const thresholds = config.advanced.thresholds;
  const hasRight = config.yMetrics.some(m => m.axis === 'right');
  const isGroupedBar = config.yMetrics.some(m => m.chartType === 'grouped_bar');
  const groupedBarCount = config.yMetrics.filter(m => m.chartType === 'grouped_bar').length;

  // Use ComposedChart for maximum flexibility (mix line+bar+area)
  const useComposed = config.yMetrics.length > 0;

  // For single-metric line/area, add subtle background bars like the reference
  const showBackgroundBars = config.yMetrics.length === 1 &&
    (firstMetric.chartType === 'line' || firstMetric.chartType === 'area');

  const xTickFormatter = (value: string) => {
    if (!value) return '';
    // Format dates nicely
    if (value.includes('-')) {
      const parts = value.split('-');
      return `${parts[1]}-${parts[2]?.split('T')[0] || ''}`;
    }
    return value.length > 10 ? value.slice(0, 10) + '…' : value;
  };

  // Grouped bar sizing
  const groupedBarSize = isGroupedBar && groupedBarCount > 1
    ? Math.max(8, Math.min(24, Math.floor(60 / groupedBarCount)))
    : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }} barGap={isGroupedBar ? 2 : 4} barCategoryGap={isGroupedBar ? '20%' : '10%'}>
        {/* Subtle grid */}
        <CartesianGrid
          strokeDasharray="none"
          stroke="hsl(var(--border))"
          strokeOpacity={0.4}
          vertical={false}
        />

        <XAxis
          dataKey="x"
          tickFormatter={xTickFormatter}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={false}
          dy={4}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          dx={-4}
        />
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
        )}

        <Tooltip content={renderTooltip} />
        {config.advanced.showLegend && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />}

        {/* Threshold reference lines (dashed red like reference) */}
        {thresholds.map((t, i) => (
          <ReferenceLine
            key={`thr-${i}`}
            y={t.value}
            yAxisId="left"
            stroke={t.color || 'hsl(0, 72%, 60%)'}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `⊙ ${t.label}: ${t.value}`,
              position: 'insideTopLeft',
              fill: t.color || 'hsl(0, 72%, 60%)',
              fontSize: 10,
              fontWeight: 600,
            }}
          />
        ))}

        {/* Background bars (subtle, like the reference image) */}
        {showBackgroundBars && (
          <Bar
            dataKey={firstMetric.kpi}
            yAxisId="left"
            fill="hsl(var(--muted-foreground))"
            fillOpacity={0.07}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        )}

        {/* Render each metric */}
        {config.yMetrics.map((m, i) => {
          const key = `${m.kpi}-${i}`;

          switch (m.chartType) {
            case 'bar':
              return (
                <Bar
                  key={key}
                  dataKey={m.kpi}
                  yAxisId={m.axis}
                  fill={m.color}
                  fillOpacity={0.85}
                  radius={[4, 4, 0, 0]}
                  name={m.kpi.replace(/_/g, ' ')}
                />
              );
            case 'stacked_bar':
              return (
                <Bar
                  key={key}
                  dataKey={m.kpi}
                  yAxisId={m.axis}
                  fill={m.color}
                  fillOpacity={0.85}
                  stackId="stack"
                  radius={i === config.yMetrics.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  name={m.kpi.replace(/_/g, ' ')}
                />
              );
            case 'grouped_bar': {
              const groupedIndex = config.yMetrics.filter((mm, ii) => mm.chartType === 'grouped_bar' && ii <= i).length - 1;
              return (
                <React.Fragment key={key}>
                  <defs>
                    <linearGradient id={`gbar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0.65} />
                    </linearGradient>
                  </defs>
                  <Bar
                    dataKey={m.kpi}
                    yAxisId={m.axis}
                    fill={`url(#gbar-grad-${i})`}
                    stroke={m.color}
                    strokeWidth={0.5}
                    radius={[5, 5, 0, 0]}
                    barSize={groupedBarSize}
                    name={m.kpi.replace(/_/g, ' ')}
                  />
                </React.Fragment>
              );
            }
            case 'area':
              return (
                <React.Fragment key={key}>
                  <defs>
                    <linearGradient id={`grad-${m.kpi}-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Area
                    dataKey={m.kpi}
                    yAxisId={m.axis}
                    stroke={m.color}
                    strokeWidth={2.5}
                    fill={`url(#grad-${m.kpi}-${i})`}
                    type={m.smoothCurve ? 'monotone' : 'linear'}
                    dot={renderDot}
                    activeDot={{ r: 5, fill: m.color, stroke: 'white', strokeWidth: 2 }}
                    name={m.kpi.replace(/_/g, ' ')}
                  />
                </React.Fragment>
              );
            case 'scatter':
              return (
                <Scatter
                  key={key}
                  dataKey={m.kpi}
                  yAxisId={m.axis}
                  fill={m.color}
                  name={m.kpi.replace(/_/g, ' ')}
                />
              );
            case 'line':
            default:
              return (
                <React.Fragment key={key}>
                  {/* Subtle area fill behind line */}
                  <defs>
                    <linearGradient id={`linegrad-${m.kpi}-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <Area
                    dataKey={m.kpi}
                    yAxisId={m.axis}
                    stroke="none"
                    fill={`url(#linegrad-${m.kpi}-${i})`}
                    type={m.smoothCurve ? 'monotone' : 'linear'}
                    dot={false}
                    activeDot={false}
                    name={`${m.kpi}_bg`}
                    legendType="none"
                  />
                  <Line
                    dataKey={m.kpi}
                    yAxisId={m.axis}
                    stroke={m.color}
                    strokeWidth={2.5}
                    type={m.smoothCurve ? 'monotone' : 'linear'}
                    dot={renderDot}
                    activeDot={{ r: 5, fill: m.color, stroke: 'white', strokeWidth: 2 }}
                    name={m.kpi.replace(/_/g, ' ')}
                  />
                </React.Fragment>
              );
          }
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default BIChartRenderer;
