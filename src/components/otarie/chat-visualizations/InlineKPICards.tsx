import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPIBlock {
  title?: string;
  cards: {
    label: string;
    value: string | number;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    delta?: string;
    status?: 'critical' | 'warning' | 'good' | 'excellent';
  }[];
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
  const { title, cards } = config;
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
