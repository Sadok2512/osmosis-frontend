import React from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList
} from 'recharts';

export interface ChartBlock {
  type: 'line' | 'bar' | 'area' | 'scatter';
  title?: string;
  xKey: string;
  yKeys: string[];
  data: Record<string, any>[];
  colors?: string[];
}

const DEFAULT_COLORS = [
  'hsl(221, 83%, 53%)', 'hsl(142, 70%, 45%)', 'hsl(25, 90%, 55%)',
  'hsl(280, 65%, 55%)', 'hsl(0, 80%, 55%)', 'hsl(45, 90%, 48%)',
];

const InlineChart: React.FC<{ config: ChartBlock }> = ({ config }) => {
  const { type, title, xKey, yKeys, data, colors } = config;
  const palette = colors || DEFAULT_COLORS;

  if (!data?.length || !yKeys?.length) return null;

  const renderChart = () => {
    const commonProps = { data, margin: { top: 5, right: 20, left: 0, bottom: 5 } };

    switch (type) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} formatter={(value: number, name: string) => [`${value} cellules`, name]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={palette[i % palette.length]} radius={[4, 4, 0, 0]}>
                <LabelList dataKey={key} position="top" offset={8} style={{ fontSize: 10, fontWeight: 700, fill: palette[i % palette.length] }} formatter={(v: number) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : Number.isInteger(v) ? v : v.toFixed(1)) : v} />
              </Bar>
            ))}
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {yKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={palette[i % palette.length]} fill={palette[i % palette.length]} fillOpacity={0.15} />
            ))}
          </AreaChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} name={xKey} />
            <YAxis dataKey={yKeys[0]} tick={{ fontSize: 10 }} name={yKeys[0]} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Scatter name={yKeys[0]} data={data} fill={palette[0]}>
              {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Scatter>
          </ScatterChart>
        );
      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
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
      {title && (
        <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full" />
          {title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={220}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

export default InlineChart;
