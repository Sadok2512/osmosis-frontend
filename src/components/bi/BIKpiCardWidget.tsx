import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Trash2, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiCardWidgetConfig {
  id: string;
  title: string;
  kpiKey: string;
  value: number | null;
  unit: string;
  trendPct: number | null;
  trendLabel: string;
  thresholdWarning: number | null;
  thresholdCritical: number | null;
  color: string;
}

export function createDefaultKpiCardWidget(id: string): KpiCardWidgetConfig {
  return {
    id,
    title: 'KPI Card',
    kpiKey: '',
    value: null,
    unit: '',
    trendPct: null,
    trendLabel: 'vs prev',
    thresholdWarning: null,
    thresholdCritical: null,
    color: '#3b82f6',
  };
}

interface Props {
  config: KpiCardWidgetConfig;
  onChange?: (config: KpiCardWidgetConfig) => void;
  onDelete?: () => void;
}

const BIKpiCardWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [editing, setEditing] = useState(false);

  const thresholdState =
    config.thresholdCritical != null && config.value != null && config.value <= config.thresholdCritical ? 'critical' :
    config.thresholdWarning != null && config.value != null && config.value <= config.thresholdWarning ? 'warning' :
    'normal';

  const borderColor =
    thresholdState === 'critical' ? 'border-destructive/50' :
    thresholdState === 'warning' ? 'border-yellow-500/50' :
    'border-border/40';

  const bgColor =
    thresholdState === 'critical' ? 'bg-destructive/5' :
    thresholdState === 'warning' ? 'bg-yellow-500/5' :
    'bg-card';

  const trendIcon = config.trendPct == null ? (
    <Minus className="w-3 h-3 text-muted-foreground" />
  ) : config.trendPct > 0 ? (
    <TrendingUp className="w-3 h-3 text-emerald-500" />
  ) : (
    <TrendingDown className="w-3 h-3 text-destructive" />
  );

  const trendColor = config.trendPct == null ? 'text-muted-foreground' :
    config.trendPct > 0 ? 'text-emerald-500' : 'text-destructive';

  const formattedValue = config.value != null
    ? (Math.abs(config.value) >= 1000
      ? config.value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
      : config.value.toFixed(2))
    : '—';

  if (editing && onChange) {
    return (
      <div className={cn('h-full rounded-xl border p-4 flex flex-col gap-3', borderColor, bgColor)}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Config KPI Card</span>
          <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="space-y-2 flex-1">
          <div>
            <label className="text-[10px] text-muted-foreground">Titre</label>
            <input value={config.title} onChange={e => onChange({ ...config, title: e.target.value })}
              className="w-full h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Valeur</label>
            <input type="number" value={config.value ?? ''} onChange={e => onChange({ ...config, value: e.target.value ? Number(e.target.value) : null })}
              className="w-full h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground outline-none" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Unité</label>
              <input value={config.unit} onChange={e => onChange({ ...config, unit: e.target.value })}
                className="w-full h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Trend %</label>
              <input type="number" value={config.trendPct ?? ''} onChange={e => onChange({ ...config, trendPct: e.target.value ? Number(e.target.value) : null })}
                className="w-full h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground outline-none" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'h-full rounded-xl border p-4 flex flex-col justify-between group relative transition-all',
      borderColor, bgColor,
      'hover:border-primary/30'
    )}>
      {/* Edit/Delete actions */}
      {onChange && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Settings className="w-3 h-3" />
          </button>
          {onDelete && (
            <button onClick={onDelete} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate block">
          {config.title || config.kpiKey || 'KPI'}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold text-foreground">
          {formattedValue}
        </span>
        {config.unit && (
          <span className="text-[10px] text-muted-foreground">{config.unit}</span>
        )}
      </div>

      <div className="flex items-center gap-1 mt-1">
        {trendIcon}
        <span className={cn('text-[10px] font-medium', trendColor)}>
          {config.trendPct != null ? `${config.trendPct > 0 ? '+' : ''}${config.trendPct.toFixed(1)}%` : 'N/A'}
        </span>
        <span className="text-[9px] text-muted-foreground/60 ml-auto">{config.trendLabel}</span>
      </div>
    </div>
  );
};

export default BIKpiCardWidget;
