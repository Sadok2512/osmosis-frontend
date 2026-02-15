import React from 'react';
import { Settings, Copy, Trash2, GripVertical } from 'lucide-react';
import { ChartConfig } from './biTypes';
import BIChartRenderer from './BIChartRenderer';

interface Props {
  config: ChartConfig;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const BIChartCard: React.FC<Props> = ({ config, onEdit, onDuplicate, onDelete }) => {
  return (
    <div className="h-full flex flex-col rounded-xl border border-border bg-card shadow-lg overflow-hidden group">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">{config.title}</span>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {config.yMetrics.map(m => m.kpi).join(', ')}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="Edit">
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDuplicate} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="Duplicate">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chart body */}
      <div className="flex-1 p-2 min-h-0">
        <BIChartRenderer config={config} />
      </div>
    </div>
  );
};

export default BIChartCard;
