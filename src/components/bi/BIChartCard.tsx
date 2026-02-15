import React, { useState } from 'react';
import { Settings, Copy, Trash2, Maximize2, Minimize2, BarChart3 } from 'lucide-react';
import { ChartConfig, KPI_UNITS } from './biTypes';
import BIChartRenderer from './BIChartRenderer';

interface Props {
  config: ChartConfig;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const BIChartCard: React.FC<Props> = ({ config, onEdit, onDuplicate, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const firstMetric = config.yMetrics[0];
  const unit = firstMetric ? KPI_UNITS[firstMetric.kpi] || '' : '';

  const titleLabel = config.title || firstMetric?.kpi.replace(/_/g, ' ') || 'Chart';
  const unitLabel = unit ? `(${unit})` : '';

  // Threshold badge
  const firstThreshold = config.advanced.thresholds[0];

  return (
    <div className={`h-full flex flex-col rounded-2xl bg-card border border-border shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] overflow-hidden group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)] ${expanded ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground truncate leading-tight">
              {titleLabel} {unitLabel}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Expand toggle */}
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={expanded ? 'Minimize' : 'Expand'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {/* Actions on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit">
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Duplicate">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Threshold badge */}
      {firstThreshold && (
        <div className="px-4 -mt-1 mb-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ background: `${firstThreshold.color}15`, color: firstThreshold.color }}>
            ⊙ {firstThreshold.label}: {firstThreshold.value}
          </span>
        </div>
      )}

      {/* Chart body */}
      <div className="flex-1 px-2 pb-3 min-h-0">
        <BIChartRenderer config={config} />
      </div>
    </div>
  );
};

export default BIChartCard;
