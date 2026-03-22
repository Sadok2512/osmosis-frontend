import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, AlertCircle } from 'lucide-react';
import type { SummaryItem } from './api/kpiMonitorApi';

interface Props {
  items: SummaryItem[];
  loading?: boolean;
  onKpiClick?: (kpiKey: string) => void;
}

const SummaryTilesRow: React.FC<Props> = ({ items, loading, onKpiClick }) => {
  if (loading) {
    return (
      <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="min-w-[180px] h-[88px] rounded-xl bg-card/50 border border-border/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
      {items.map(item => {
        const borderColor =
          item.threshold_state === 'critical' ? 'border-red-500/50' :
          item.threshold_state === 'warning' ? 'border-amber-500/50' :
          'border-border/30';

        const bgColor =
          item.threshold_state === 'critical' ? 'bg-red-500/5' :
          item.threshold_state === 'warning' ? 'bg-amber-500/5' :
          'bg-card/60';

        const trendIcon = item.trend_pct == null ? (
          <Minus className="w-3 h-3 text-muted-foreground" />
        ) : item.trend_pct > 0 ? (
          <TrendingUp className="w-3 h-3 text-emerald-400" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400" />
        );

        const trendColor = item.trend_pct == null ? 'text-muted-foreground' :
          item.trend_pct > 0 ? 'text-emerald-400' : 'text-red-400';

        const formattedValue = item.value != null
          ? (Math.abs(item.value) >= 1000
            ? item.value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
            : item.value.toFixed(2))
          : '—';

        return (
          <div
            key={item.kpi_key}
            onClick={() => onKpiClick?.(item.kpi_key)}
            className={`min-w-[180px] flex-shrink-0 rounded-xl ${bgColor} border ${borderColor} px-4 py-3 cursor-pointer hover:border-primary/40 transition-all group`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                {item.display_name}
              </span>
              {item.threshold_state === 'critical' && <AlertCircle className="w-3 h-3 text-red-500" />}
              {item.threshold_state === 'warning' && <AlertTriangle className="w-3 h-3 text-amber-500" />}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                {formattedValue}
              </span>
              {item.unit && (
                <span className="text-[10px] text-muted-foreground">{item.unit}</span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {trendIcon}
              <span className={`text-[10px] font-medium ${trendColor}`}>
                {item.trend_pct != null ? `${item.trend_pct > 0 ? '+' : ''}${item.trend_pct.toFixed(1)}%` : 'N/A'}
              </span>
              <span className="text-[9px] text-muted-foreground/60 ml-auto">vs prev</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SummaryTilesRow;
