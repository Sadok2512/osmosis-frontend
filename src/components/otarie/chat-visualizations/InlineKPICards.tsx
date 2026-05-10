import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPIBlock {
  // ── "cards" mode (default): grid of KPI tiles ──
  title?: string;
  cards?: {
    label: string;
    value: string | number;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    delta?: string;
    status?: 'critical' | 'warning' | 'good' | 'excellent';
  }[];
  // ── "worst_cells_table" mode: ranked table from /monitor/query/worst-cells ──
  type?: 'worst_cells' | string;
  rows?: {
    rank?: number;
    dim_value?: string;
    site_name?: string;
    plaque?: string;
    vendor?: string;
    techno?: string;
    value?: number | null;
    samples?: number;
  }[];
  kpi_code?: string;
  direction?: 'lower_better' | 'higher_better';
  ranking?: 'worst' | 'best';
  level?: string;
}

const statusColors: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/5',
  warning: 'border-yellow-500/40 bg-yellow-500/5',
  good: 'border-green-500/40 bg-green-500/5',
  excellent: 'border-emerald-500/40 bg-emerald-500/5',
};

const statusTextColors: Record<string, string> = {
  critical: 'text-red-500',
  warning: 'text-yellow-600',
  good: 'text-green-600',
  excellent: 'text-emerald-600',
};

const TrendIcon: React.FC<{ trend?: string }> = ({ trend }) => {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-green-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

const InlineKPICards: React.FC<{ config: KPIBlock }> = ({ config }) => {
  const { title, cards, type, rows } = config || {};

  // ── worst_cells table mode ──
  if (type === 'worst_cells' && rows?.length) {
    const fmt = (v: number | null | undefined) =>
      v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
    return (
      <div className="my-4">
        {title && (
          <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full" />
            {title}
          </h4>
        )}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold w-8">#</th>
                <th className="px-2 py-1.5 text-left font-semibold">Cellule / Site</th>
                <th className="px-2 py-1.5 text-left font-semibold">Plaque</th>
                <th className="px-2 py-1.5 text-left font-semibold">Vendor</th>
                <th className="px-2 py-1.5 text-right font-semibold">Valeur</th>
                <th className="px-2 py-1.5 text-right font-semibold">Samples</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{r.rank ?? i + 1}</td>
                  <td className="px-2 py-1.5 font-mono text-foreground">{r.dim_value || '—'}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.plaque || '—'}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.vendor || '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold">{fmt(r.value)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.samples ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!cards?.length) return null;

  return (
    <div className="my-4">
      {title && (
        <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full" />
          {title}
        </h4>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cards.map((card, i) => {
          const st = card.status || 'good';
          return (
            <div key={i} className={`rounded-xl border-2 p-3 ${statusColors[st] || 'border-border bg-card/50'}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{card.label}</div>
              <div className={`text-lg font-bold ${statusTextColors[st] || 'text-foreground'}`}>
                {card.value}{card.unit && <span className="text-xs ml-0.5 font-normal">{card.unit}</span>}
              </div>
              {(card.trend || card.delta) && (
                <div className="flex items-center gap-1 mt-1">
                  <TrendIcon trend={card.trend} />
                  {card.delta && <span className="text-[10px] text-muted-foreground">{card.delta}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InlineKPICards;
