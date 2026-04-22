import React, { useState, useCallback, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { BarChart3, TrendingUp, Layers, PieChart as PieIcon, Palette, Paintbrush, Download } from 'lucide-react';

export interface ChartBlock {
  type: 'line' | 'bar' | 'area' | 'scatter' | 'stacked_bar' | 'pie';
  title?: string;
  xKey: string;
  yKeys: string[];
  data: Record<string, any>[];
  colors?: string[];
}

type ChartType = 'line' | 'bar' | 'stacked_bar' | 'pie';

const COLOR_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Telecom', colors: ['hsl(210, 90%, 55%)', 'hsl(145, 70%, 50%)', 'hsl(25, 92%, 58%)', 'hsl(350, 78%, 55%)', 'hsl(270, 65%, 60%)', 'hsl(50, 88%, 55%)'] },
  { name: 'Bleu Nuit', colors: ['hsl(215, 85%, 60%)', 'hsl(200, 78%, 55%)', 'hsl(225, 72%, 65%)', 'hsl(190, 68%, 52%)', 'hsl(235, 60%, 58%)', 'hsl(180, 62%, 52%)'] },
  { name: 'Émeraude', colors: ['hsl(160, 72%, 48%)', 'hsl(145, 68%, 55%)', 'hsl(170, 62%, 45%)', 'hsl(130, 58%, 52%)', 'hsl(175, 55%, 55%)', 'hsl(140, 50%, 58%)'] },
  { name: 'Sunset', colors: ['hsl(10, 88%, 58%)', 'hsl(30, 92%, 55%)', 'hsl(50, 90%, 55%)', 'hsl(0, 78%, 52%)', 'hsl(340, 72%, 55%)', 'hsl(20, 82%, 62%)'] },
  { name: 'Multi', colors: ['hsl(215, 85%, 60%)', 'hsl(145, 70%, 50%)', 'hsl(25, 92%, 58%)', 'hsl(280, 65%, 60%)', 'hsl(350, 78%, 55%)', 'hsl(50, 88%, 55%)'] },
  { name: 'Graphite', colors: ['hsl(210, 18%, 50%)', 'hsl(210, 22%, 58%)', 'hsl(200, 28%, 65%)', 'hsl(210, 14%, 55%)', 'hsl(220, 18%, 62%)', 'hsl(195, 22%, 52%)'] },
];

const RAINBOW_PALETTE = [
  'hsl(215, 85%, 55%)', 'hsl(145, 65%, 42%)', 'hsl(25, 92%, 55%)', 'hsl(280, 60%, 55%)',
  'hsl(350, 75%, 52%)', 'hsl(50, 85%, 50%)', 'hsl(174, 70%, 40%)', 'hsl(330, 65%, 50%)',
  'hsl(200, 75%, 48%)', 'hsl(60, 75%, 42%)', 'hsl(310, 55%, 55%)', 'hsl(15, 85%, 50%)',
];

const CHART_TYPES: { key: ChartType; icon: React.ElementType; label: string }[] = [
  { key: 'bar', icon: BarChart3, label: 'Barres' },
  { key: 'line', icon: TrendingUp, label: 'Ligne' },
  { key: 'stacked_bar', icon: Layers, label: 'Empilé' },
  { key: 'pie', icon: PieIcon, label: 'Camembert' },
];

const formatAxisValue = (v: any): string => {
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};
const formatValue = formatAxisValue;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border/60 rounded-lg shadow-xl p-3 min-w-[160px]">
      <p className="text-[11px] font-semibold text-foreground mb-1.5 border-b border-border/40 pb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ background: entry.color }} />
            <span className="text-[10px] text-muted-foreground">{entry.name || entry.dataKey}</span>
          </div>
          <span className="text-[11px] font-bold text-foreground tabular-nums">{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const InlineChart: React.FC<{ config: ChartBlock }> = ({ config }) => {
  const { title, xKey, yKeys, data, colors } = config;

  const initialType: ChartType =
    config.type === 'area' || config.type === 'scatter' ? 'line' :
    (config.type as ChartType) || 'bar';

  const [chartType, setChartType] = useState<ChartType>(initialType);
  const [paletteIdx, setPaletteIdx] = useState<number>(
    colors ? -1 : 0 // default to Telecom
  );
  const [showPalette, setShowPalette] = useState(false);
  const [colorByX, setColorByX] = useState(false);

  const palette = paletteIdx >= 0 ? COLOR_PALETTES[paletteIdx].colors : (colors || COLOR_PALETTES[0].colors);

  const togglePalette = useCallback(() => setShowPalette(p => !p), []);

  // Compute max for nice axis domain
  const maxVal = useMemo(() => {
    let m = 0;
    data.forEach(row => yKeys.forEach(k => { if (Number(row[k]) > m) m = Number(row[k]); }));
    return m;
  }, [data, yKeys]);

  if (!data?.length || !yKeys?.length) return null;

  const pieData = chartType === 'pie'
    ? data.map((row, i) => ({
        name: String(row[xKey] || `Item ${i}`),
        value: yKeys.reduce((sum, k) => sum + (Number(row[k]) || 0), 0),
        fill: palette[i % palette.length],
      }))
    : [];

  const commonProps = { data, margin: { top: 28, right: 24, left: 12, bottom: 16 } };

  const axisTick = { fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 600 } as const;
  const axisLineStyle = { stroke: 'hsl(var(--border))', strokeWidth: 1 } as const;

  const renderChart = () => {
    switch (chartType) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={85}
              innerRadius={35}
              paddingAngle={2}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ strokeWidth: 1, stroke: 'hsl(var(--muted-foreground))' }}
              style={{ fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} stroke="hsl(var(--background))" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              formatter={(value: string) => <span className="text-foreground font-medium">{value}</span>}
            />
          </PieChart>
        );

      case 'stacked_bar':
        return (
          <BarChart {...commonProps} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickMargin={8} interval={0} />
            <YAxis tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickFormatter={formatValue} tickMargin={6} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(v: string) => <span className="text-foreground font-medium">{v}</span>} />
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                fill={palette[i % palette.length]}
                radius={i === yKeys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickMargin={8} interval={0} />
            <YAxis tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickFormatter={formatValue} tickMargin={6} width={48} domain={[0, Math.ceil(maxVal * 1.15)]} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))', opacity: 0.15, radius: 4 }} />
            {!colorByX && yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(v: string) => <span className="text-foreground font-medium">{v}</span>} />}
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={palette[i % palette.length]} radius={[6, 6, 0, 0]} maxBarSize={56}>
                {colorByX && data.map((_, di) => (
                  <Cell key={di} fill={RAINBOW_PALETTE[di % RAINBOW_PALETTE.length]} />
                ))}
                <LabelList
                  dataKey={key}
                  position="top"
                  offset={10}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fill: colorByX ? 'hsl(var(--foreground))' : palette[i % palette.length],
                    textShadow: '0 1px 2px hsl(var(--background))',
                  }}
                  formatter={formatValue}
                />
              </Bar>
            ))}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
            <XAxis dataKey={xKey} tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickMargin={8} interval={0} />
            <YAxis tick={axisTick} axisLine={axisLineStyle} tickLine={axisLineStyle} tickFormatter={formatValue} tickMargin={6} width={48} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(v: string) => <span className="text-foreground font-medium">{v}</span>} />
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={palette[i % palette.length]}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <div className="my-4 rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/80 p-4 shadow-md backdrop-blur-sm">
      {/* Header with title + toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {title ? (
          <h4 className="text-xs font-bold text-foreground flex items-center gap-2 tracking-wide">
            <span className="w-1 h-4 rounded-full" style={{ background: palette[0] }} />
            {title}
          </h4>
        ) : <span />}

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 relative border border-border/30">
          {CHART_TYPES.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setChartType(key)}
              title={label}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                chartType === key
                  ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon size={13} />
            </button>
          ))}

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <button
            onClick={() => setColorByX(p => !p)}
            title="Couleur par catégorie"
            className={`p-1.5 rounded-md transition-all duration-200 ${
              colorByX
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Paintbrush size={13} />
          </button>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <button
            onClick={togglePalette}
            title="Changer les couleurs"
            className={`p-1.5 rounded-md transition-all duration-200 ${
              showPalette
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Palette size={13} />
          </button>

          {/* Palette dropdown */}
          {showPalette && (
            <div className="absolute top-full right-0 mt-1.5 bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl shadow-xl p-2 z-50 min-w-[150px]">
              {COLOR_PALETTES.map((p, idx) => (
                <button
                  key={p.name}
                  onClick={() => { setPaletteIdx(idx); setShowPalette(false); }}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    paletteIdx === idx
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'text-popover-foreground hover:bg-accent/60'
                  }`}
                >
                  <div className="flex gap-0.5">
                    {p.colors.slice(0, 4).map((c, ci) => (
                      <span key={ci} className="w-3.5 h-3.5 rounded-full border border-background shadow-sm" style={{ background: c }} />
                    ))}
                  </div>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

export default InlineChart;
