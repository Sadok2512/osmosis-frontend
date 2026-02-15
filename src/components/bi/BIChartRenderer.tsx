import React, { useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart, ScatterChart, PieChart,
  Line, Bar, Area, Scatter, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import { ChartConfig, CHART_COLORS, KPI_UNITS } from './biTypes';
import { generateChartData } from './mockBIData';
import { useCSVData } from './CSVDataStore';

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
  const { getDataset } = useCSVData();
  const csvDataset = config.dataSource?.type === 'csv' && config.dataSource.csvDatasetId
    ? getDataset(config.dataSource.csvDatasetId) : null;

  const rawData = useMemo(() => {
    if (csvDataset && config.dataSource?.xColumn) {
      return csvDataset.rows.map(row => ({
        x: row[config.dataSource!.xColumn!],
        ...Object.fromEntries(
          (config.dataSource!.yColumns || []).map(col => [col, row[col]])
        ),
      }));
    }
    return generateChartData(config);
  }, [config, csvDataset]);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeries = useCallback((dataKey: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);
  // When using CSV, build virtual yMetrics from CSV columns
  const effectiveYMetrics = useMemo(() => {
    if (csvDataset && config.dataSource?.yColumns?.length) {
      return config.dataSource.yColumns.map((col, i) => ({
        kpi: col as any,
        aggregation: 'AVG' as const,
        axis: 'left' as const,
        chartType: (config.yMetrics[0]?.chartType || 'line') as any,
        color: CHART_COLORS[i % CHART_COLORS.length],
        showMovingAvg: false,
        smoothCurve: true,
      }));
    }
    return config.yMetrics;
  }, [csvDataset, config.dataSource?.yColumns, config.yMetrics]);

  const effectiveConfig = useMemo(() => ({
    ...config,
    yMetrics: effectiveYMetrics,
  }), [config, effectiveYMetrics]);

  // Pivot grouped data
  const { data, groupKeys } = useMemo(() => {
    const hasGroup = effectiveConfig.groupBy.length > 0 && rawData.some(d => d.group);
    if (!hasGroup) return { data: rawData, groupKeys: [] as string[] };
    
    const groups = [...new Set(rawData.map(d => d.group))] as string[];
    const byX = new Map<string, any>();
    
    for (const row of rawData) {
      if (!byX.has(row.x)) byX.set(row.x, { x: row.x });
      const point = byX.get(row.x)!;
      for (const m of effectiveYMetrics) {
        point[`${m.kpi}__${row.group}`] = row[m.kpi];
      }
    }
    
    return { data: Array.from(byX.values()), groupKeys: groups };
  }, [rawData, effectiveConfig.groupBy, effectiveYMetrics]);
  
  const firstMetric = effectiveYMetrics[0];

  if (!firstMetric) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Add a metric to display
      </div>
    );
  }

  // ── KPI Card ──
  if (firstMetric.chartType === 'kpi_card') {
    const unit = KPI_UNITS[firstMetric.kpi] || '';

    // Grouped KPI card: show each group value
    if (groupKeys.length > 0) {
      return (
        <div className="flex flex-wrap items-center justify-center h-full gap-3 px-2">
          {groupKeys.map((g, gi) => {
            const key = `${firstMetric.kpi}__${g}`;
            const values = data.map(d => d[key]).filter(Boolean) as number[];
            const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            const color = CHART_COLORS[gi % CHART_COLORS.length];
            return (
              <div key={g} className="flex flex-col items-center gap-0.5">
                <span className="text-xl font-bold font-mono tracking-tight" style={{ color }}>
                  {avg.toFixed(1)}
                </span>
                <span className="text-[9px] text-muted-foreground font-semibold truncate max-w-[80px]">{g}</span>
              </div>
            );
          })}
          <div className="w-full text-center">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
              {firstMetric.kpi.replace(/_/g, ' ')} {unit && `(${unit})`}
            </span>
          </div>
        </div>
      );
    }

    const values = data.map(d => d[firstMetric.kpi]).filter(Boolean);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
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

  // ── Heatmap ──
  if (firstMetric.chartType === 'heatmap') {
    // Build heatmap grid: X axis values × groupBy dimension values
    const hasGroup = config.groupBy.length > 0;
    const yLabels = hasGroup
      ? [...new Set(rawData.map(d => d.group).filter(Boolean))] as string[]
      : effectiveYMetrics.map(m => m.kpi.replace(/_/g, ' '));

    const xLabels = [...new Set(rawData.map(d => d.x))] as string[];

    // Build matrix of values
    const cells: { x: string; y: string; value: number }[] = [];
    let minVal = Infinity, maxVal = -Infinity;

    for (const xLabel of xLabels) {
      if (hasGroup) {
        for (const yLabel of yLabels) {
          const row = rawData.find(d => d.x === xLabel && d.group === yLabel);
          const val = row ? (row[firstMetric.kpi] ?? 0) : 0;
          cells.push({ x: xLabel, y: yLabel, value: val });
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      } else {
        for (const m of effectiveYMetrics) {
          const row = rawData.find(d => d.x === xLabel);
          const val = row ? (row[m.kpi] ?? 0) : 0;
          const yLabel = m.kpi.replace(/_/g, ' ');
          cells.push({ x: xLabel, y: yLabel, value: val });
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      }
    }

    const range = maxVal - minVal || 1;
    const getCellColor = (value: number) => {
      const t = (value - minVal) / range;
      // Blue to red gradient via HSL
      const h = (1 - t) * 220; // 220 (blue) → 0 (red)
      const s = 75 + t * 15;
      const l = 55 - t * 15;
      return `hsl(${h}, ${s}%, ${l}%)`;
    };

    const formatX = (v: string) => {
      if (v.includes('-')) {
        const parts = v.split('-');
        return `${parts[1]}-${parts[2]?.split('T')[0] || ''}`;
      }
      return v.length > 8 ? v.slice(0, 8) + '…' : v;
    };

    const cellW = Math.max(28, Math.min(60, Math.floor(600 / xLabels.length)));
    const cellH = Math.max(22, Math.min(40, Math.floor(300 / yLabels.length)));

    return (
      <div className="w-full h-full overflow-auto p-2">
        <div className="inline-block">
          {/* X-axis header */}
          <div className="flex" style={{ marginLeft: 80 }}>
            {xLabels.map(x => (
              <div key={x} className="text-[9px] text-muted-foreground text-center truncate font-medium"
                style={{ width: cellW, minWidth: cellW }}>
                {formatX(x)}
              </div>
            ))}
          </div>
          {/* Rows */}
          {yLabels.map(yLabel => (
            <div key={yLabel} className="flex items-center">
              <div className="text-[9px] text-muted-foreground truncate font-medium text-right pr-2"
                style={{ width: 80, minWidth: 80 }}>
                {yLabel}
              </div>
              {xLabels.map(xLabel => {
                const cell = cells.find(c => c.x === xLabel && c.y === yLabel);
                const val = cell?.value ?? 0;
                return (
                  <div key={`${xLabel}-${yLabel}`}
                    className="border border-background/50 rounded-[2px] flex items-center justify-center cursor-default transition-transform hover:scale-110 hover:z-10"
                    style={{
                      width: cellW, height: cellH, minWidth: cellW,
                      backgroundColor: getCellColor(val),
                    }}
                    title={`${yLabel} × ${xLabel}: ${val.toFixed(1)}`}
                  >
                    <span className="text-[8px] font-mono font-bold text-white/90 drop-shadow-sm">
                      {val.toFixed(cellW > 40 ? 1 : 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {/* Color legend */}
          <div className="flex items-center gap-2 mt-2" style={{ marginLeft: 80 }}>
            <span className="text-[9px] text-muted-foreground">{minVal.toFixed(1)}</span>
            <div className="h-2 flex-1 rounded-full" style={{
              background: 'linear-gradient(to right, hsl(220, 75%, 55%), hsl(110, 80%, 45%), hsl(40, 90%, 50%), hsl(0, 90%, 40%))',
              maxWidth: 200,
            }} />
            <span className="text-[9px] text-muted-foreground">{maxVal.toFixed(1)}</span>
          </div>
        </div>
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
  const milestones = config.advanced.milestones || [];
  const lineStyleToDash = (s: string) => s === 'dotted' ? '2 4' : s === 'dashed' ? '6 4' : '';
  const hasRight = effectiveYMetrics.some(m => m.axis === 'right');
  const isGroupedBar = effectiveYMetrics.some(m => m.chartType === 'grouped_bar');
  const groupedBarCount = effectiveYMetrics.filter(m => m.chartType === 'grouped_bar').length;

  // Use ComposedChart for maximum flexibility (mix line+bar+area)
  const useComposed = effectiveYMetrics.length > 0;

  // For single-metric line/area, add subtle background bars like the reference
  const showBackgroundBars = effectiveYMetrics.length === 1 &&
    (firstMetric.chartType === 'line' || firstMetric.chartType === 'area');

  const xTickFormatter = (value: any) => {
    if (value == null) return '';
    const str = String(value);
    // Format dates nicely
    if (str.includes('-')) {
      const parts = str.split('-');
      return `${parts[1]}-${parts[2]?.split('T')[0] || ''}`;
    }
    return str.length > 10 ? str.slice(0, 10) + '…' : str;
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
        {config.advanced.showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            content={({ payload }: any) => {
              if (!payload) return null;
              const visible = payload.filter((e: any) => !e.value?.endsWith('_bg'));
              if (!visible.length) return null;
              return (
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1">
                  {visible.map((entry: any, i: number) => {
                    const key = entry.dataKey || entry.value;
                    const isHidden = hiddenSeries.has(key);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleSeries(key)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors cursor-pointer select-none"
                        style={{ opacity: isHidden ? 0.35 : 1 }}
                      >
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: entry.color }} />
                        <span className="text-[10px] text-muted-foreground" style={{ textDecoration: isHidden ? 'line-through' : 'none' }}>
                          {entry.value?.replace(/_/g, ' ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            }}
          />
        )}

        {/* Threshold reference lines (horizontal) */}
        {thresholds.map((t, i) => (
          <ReferenceLine
            key={`thr-${i}`}
            y={t.value}
            yAxisId="left"
            stroke={t.color || 'hsl(0, 72%, 60%)'}
            strokeDasharray={lineStyleToDash(t.lineStyle || 'dashed')}
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

        {/* Milestone reference lines (vertical) */}
        {milestones.map((m, i) => {
          // Format date to match xAxis tick format
          const xValue = m.date;
          const formatted = xValue.includes('-') ? xValue.slice(5) : xValue;
          return (
            <ReferenceLine
              key={`mst-${i}`}
              x={formatted}
              yAxisId="left"
              stroke={m.color || '#8b5cf6'}
              strokeDasharray={lineStyleToDash(m.lineStyle || 'dashed')}
              strokeWidth={1.5}
              label={{
                value: `▾ ${m.label}`,
                position: 'insideTopRight',
                fill: m.color || '#8b5cf6',
                fontSize: 10,
                fontWeight: 600,
                angle: 0,
              }}
            />
          );
        })}

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
        {effectiveYMetrics.flatMap((m, i) => {
          // If groupBy is active, render one series per group value
          const seriesList = groupKeys.length > 0
            ? groupKeys.map((g, gi) => ({
                dataKey: `${m.kpi}__${g}`,
                name: `${m.kpi.replace(/_/g, ' ')} (${g})`,
                color: CHART_COLORS[(i * groupKeys.length + gi) % CHART_COLORS.length],
                seriesKey: `${m.kpi}-${i}-${g}`,
                animDelay: gi * 100,
              }))
            : [{
                dataKey: m.kpi,
                name: m.kpi.replace(/_/g, ' '),
                color: m.color,
                seriesKey: `${m.kpi}-${i}`,
                animDelay: i * 150,
              }];

          return seriesList.map(s => {
            const isHidden = hiddenSeries.has(s.dataKey);
            if (isHidden) {
              // Render invisible line to keep legend entry
              return (
                <Line key={s.seriesKey} dataKey={s.dataKey} yAxisId={m.axis}
                  stroke="transparent" dot={false} activeDot={false} name={s.name} legendType="none" />
              );
            }
            switch (m.chartType) {
              case 'bar':
                return (
                  <Bar key={s.seriesKey} dataKey={s.dataKey} yAxisId={m.axis}
                    fill={s.color} fillOpacity={0.85} radius={[4, 4, 0, 0]} name={s.name}
                    isAnimationActive animationBegin={s.animDelay} animationDuration={800} animationEasing="ease-out" />
                );
              case 'stacked_bar':
                return (
                  <Bar key={s.seriesKey} dataKey={s.dataKey} yAxisId={m.axis}
                    fill={s.color} fillOpacity={0.85} stackId="stack"
                    radius={[0, 0, 0, 0]} name={s.name}
                    isAnimationActive animationBegin={s.animDelay} animationDuration={800} animationEasing="ease-out" />
                );
              case 'grouped_bar':
                return (
                  <React.Fragment key={s.seriesKey}>
                    <defs>
                      <linearGradient id={`gbar-${s.seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <Bar dataKey={s.dataKey} yAxisId={m.axis}
                      fill={`url(#gbar-${s.seriesKey})`} stroke={s.color} strokeWidth={0.5}
                      radius={[5, 5, 0, 0]} barSize={groupedBarSize} name={s.name}
                      isAnimationActive animationBegin={s.animDelay} animationDuration={800} animationEasing="ease-out" />
                  </React.Fragment>
                );
              case 'area':
                return (
                  <React.Fragment key={s.seriesKey}>
                    <defs>
                      <linearGradient id={`grad-${s.seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Area dataKey={s.dataKey} yAxisId={m.axis} stroke={s.color} strokeWidth={2.5}
                      fill={`url(#grad-${s.seriesKey})`} type={m.smoothCurve ? 'monotone' : 'linear'}
                      dot={renderDot} activeDot={{ r: 5, fill: s.color, stroke: 'white', strokeWidth: 2 }}
                      name={s.name} />
                  </React.Fragment>
                );
              case 'scatter':
                return (
                  <Scatter key={s.seriesKey} dataKey={s.dataKey} yAxisId={m.axis}
                    fill={s.color} name={s.name} />
                );
              case 'line':
              default:
                return (
                  <React.Fragment key={s.seriesKey}>
                    <defs>
                      <linearGradient id={`linegrad-${s.seriesKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <Area dataKey={s.dataKey} yAxisId={m.axis} stroke="none"
                      fill={`url(#linegrad-${s.seriesKey})`} type={m.smoothCurve ? 'monotone' : 'linear'}
                      dot={false} activeDot={false} name={`${s.dataKey}_bg`} legendType="none" />
                    <Line dataKey={s.dataKey} yAxisId={m.axis} stroke={s.color} strokeWidth={2.5}
                      type={m.smoothCurve ? 'monotone' : 'linear'} dot={renderDot}
                      activeDot={{ r: 5, fill: s.color, stroke: 'white', strokeWidth: 2 }}
                      name={s.name} />
                  </React.Fragment>
                );
            }
          });
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default BIChartRenderer;
