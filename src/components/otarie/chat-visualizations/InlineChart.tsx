import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { BarChart3, TrendingUp, Layers, PieChart as PieIcon, Palette } from 'lucide-react';

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
  { name: 'Bleu', colors: ['hsl(221, 83%, 53%)', 'hsl(221, 83%, 40%)', 'hsl(221, 83%, 65%)', 'hsl(221, 60%, 75%)', 'hsl(221, 50%, 30%)', 'hsl(200, 70%, 50%)'] },
  { name: 'Vert', colors: ['hsl(142, 70%, 45%)', 'hsl(142, 70%, 32%)', 'hsl(142, 70%, 58%)', 'hsl(160, 60%, 40%)', 'hsl(120, 50%, 35%)', 'hsl(170, 60%, 50%)'] },
  { name: 'Orange', colors: ['hsl(25, 90%, 55%)', 'hsl(25, 90%, 42%)', 'hsl(35, 90%, 55%)', 'hsl(15, 80%, 50%)', 'hsl(40, 85%, 48%)', 'hsl(10, 75%, 45%)'] },
  { name: 'Violet', colors: ['hsl(280, 65%, 55%)', 'hsl(260, 65%, 50%)', 'hsl(300, 60%, 55%)', 'hsl(270, 50%, 65%)', 'hsl(250, 55%, 45%)', 'hsl(290, 60%, 45%)'] },
  { name: 'Multi', colors: ['hsl(221, 83%, 53%)', 'hsl(142, 70%, 45%)', 'hsl(25, 90%, 55%)', 'hsl(280, 65%, 55%)', 'hsl(0, 80%, 55%)', 'hsl(45, 90%, 48%)'] },
  { name: 'Teal', colors: ['hsl(174, 70%, 40%)', 'hsl(174, 70%, 30%)', 'hsl(185, 60%, 45%)', 'hsl(165, 55%, 50%)', 'hsl(190, 65%, 35%)', 'hsl(180, 50%, 55%)'] },
];

const CHART_TYPES: { key: ChartType; icon: React.ElementType; label: string }[] = [
  { key: 'bar', icon: BarChart3, label: 'Barres' },
  { key: 'line', icon: TrendingUp, label: 'Ligne' },
  { key: 'stacked_bar', icon: Layers, label: 'Empilé' },
  { key: 'pie', icon: PieIcon, label: 'Camembert' },
];

const formatValue = (v: number) => {
  if (typeof v !== 'number') return v;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? v : v.toFixed(1);
};

const InlineChart: React.FC<{ config: ChartBlock }> = ({ config }) => {
  const { title, xKey, yKeys, data, colors } = config;

  const initialType: ChartType =
    config.type === 'area' || config.type === 'scatter' ? 'line' :
    (config.type as ChartType) || 'bar';

  const [chartType, setChartType] = useState<ChartType>(initialType);
  const [paletteIdx, setPaletteIdx] = useState<number>(
    colors ? -1 : 4 // default to Multi
  );
  const [showPalette, setShowPalette] = useState(false);

  const palette = paletteIdx >= 0 ? COLOR_PALETTES[paletteIdx].colors : (colors || COLOR_PALETTES[4].colors);

  const togglePalette = useCallback(() => setShowPalette(p => !p), []);

  if (!data?.length || !yKeys?.length) return null;

  // Prepare pie data (aggregate all yKeys)
  const pieData = chartType === 'pie'
    ? yKeys.map((key, i) => ({
        name: key,
        value: data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0),
        fill: palette[i % palette.length],
      }))
    : [];

  const commonProps = { data, margin: { top: 20, right: 20, left: 0, bottom: 5 } };

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
              outerRadius={80}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ strokeWidth: 1, stroke: 'hsl(var(--foreground))' }}
              style={{ fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        );

      case 'stacked_bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="stack" fill={palette[i % palette.length]} radius={i === yKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={palette[i % palette.length]} radius={[4, 4, 0, 0]}>
                <LabelList dataKey={key} position="top" offset={8} style={{ fontSize: 9, fontWeight: 700, fill: palette[i % palette.length] }} formatter={formatValue} />
              </Bar>
            ))}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {yKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={palette[i % palette.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <div className="my-4 rounded-xl border border-border bg-card/50 p-4 shadow-sm">
      {/* Header with title + toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {title ? (
          <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full" />
            {title}
          </h4>
        ) : <span />}

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 relative">
          {CHART_TYPES.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setChartType(key)}
              title={label}
              className={`p-1.5 rounded-md transition-all ${
                chartType === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon size={13} />
            </button>
          ))}

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Color palette button */}
          <button
            onClick={togglePalette}
            title="Changer les couleurs"
            className={`p-1.5 rounded-md transition-all ${
              showPalette
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Palette size={13} />
          </button>

          {/* Palette dropdown */}
          {showPalette && (
            <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg p-2 z-50 min-w-[140px]">
              {COLOR_PALETTES.map((p, idx) => (
                <button
                  key={p.name}
                  onClick={() => { setPaletteIdx(idx); setShowPalette(false); }}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    paletteIdx === idx
                      ? 'bg-accent text-accent-foreground'
                      : 'text-popover-foreground hover:bg-accent/50'
                  }`}
                >
                  <div className="flex gap-0.5">
                    {p.colors.slice(0, 4).map((c, ci) => (
                      <span key={ci} className="w-3 h-3 rounded-full border border-border/50" style={{ background: c }} />
                    ))}
                  </div>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

export default InlineChart;
