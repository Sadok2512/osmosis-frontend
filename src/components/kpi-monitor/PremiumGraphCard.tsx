import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Download, FileSpreadsheet, RefreshCw, Maximize2,
  Copy, Trash2, MoreHorizontal, Pencil, PencilOff,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';
import { GraphCard } from './GraphPopover';

interface PremiumGraphCardProps {
  title?: string;
  badge?: string;
  granularity?: string;
  seriesCount?: number;
  lastUpdated?: string;
  children: React.ReactNode;
  className?: string;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExpand?: () => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  /** Config panel rendered above chart in edit mode (horizontal cards) */
  configPanel?: React.ReactNode;
  /** Bottom panel rendered below chart in edit mode */
  bottomPanel?: React.ReactNode;
  /** Axes popover config */
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  /** Graph popover config */
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

const PremiumGraphCard: React.FC<PremiumGraphCardProps> = ({
  title = 'KPI Time Series',
  badge,
  granularity,
  seriesCount,
  lastUpdated,
  children,
  className,
  onExportPNG,
  onExportCSV,
  onRefresh,
  onDuplicate,
  onDelete,
  onExpand,
  editMode = false,
  onToggleEditMode,
  configPanel,
  bottomPanel,
  axisConfig,
  onAxisConfigChange,
  graphConfig,
  onGraphConfigChange,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border border-border/60 bg-card',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)]',
        'hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-shadow duration-200',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 drag-handle cursor-grab">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground truncate tracking-tight">{title}</h3>
          {badge && (
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary/8 text-primary text-[10px] font-semibold uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Edit toggle */}
          {onToggleEditMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleEditMode(); }}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all',
                editMode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : cn('text-muted-foreground hover:text-foreground hover:bg-muted/60',
                      isHovered ? 'opacity-100' : 'opacity-0')
              )}
            >
              {editMode ? <PencilOff className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              <span className="hidden sm:inline">{editMode ? 'Done' : 'Edit'}</span>
            </button>
          )}

          {/* ⋯ Actions menu */}
          <div className={cn('transition-opacity duration-150', isHovered || editMode ? 'opacity-100' : 'opacity-0')}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {onExportPNG && (
                  <DropdownMenuItem onClick={onExportPNG} className="gap-2 text-xs">
                    <Download className="w-3.5 h-3.5" /> Download PNG
                  </DropdownMenuItem>
                )}
                {onExportCSV && (
                  <DropdownMenuItem onClick={onExportCSV} className="gap-2 text-xs">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                  </DropdownMenuItem>
                )}
                {onRefresh && (
                  <DropdownMenuItem onClick={onRefresh} className="gap-2 text-xs">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </DropdownMenuItem>
                )}
                {onExpand && (
                  <DropdownMenuItem onClick={onExpand} className="gap-2 text-xs">
                    <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
                  </DropdownMenuItem>
                )}
                {(onDuplicate || onDelete) && <DropdownMenuSeparator />}
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs">
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Config Panel (edit mode, above chart) ── */}
      {editMode && configPanel && (
        <div className="border-b border-border/30 bg-muted/10 animate-in fade-in slide-in-from-top-1 duration-200 overflow-x-auto">
          {configPanel}
        </div>
      )}

      {/* ── Chart area + Right Graph sidebar ── */}
      <div className="flex-1 min-h-0 flex">
        {/* Chart */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-w-0 px-2 pt-2 pb-1">
            {children}
          </div>
        </div>

        {/* Right sidebar: GRAPH config */}
        {editMode && graphConfig && onGraphConfigChange && (
          <div className="w-[220px] shrink-0 border-l border-border/40 bg-muted/20 p-3 overflow-y-auto animate-in slide-in-from-right duration-200">
            <GraphCard graphConfig={graphConfig} onGraphConfigChange={onGraphConfigChange} />
          </div>
        )}
      </div>

      {/* ── Bottom Panel ── */}
      {editMode && bottomPanel && (
        <div className="bg-card animate-in fade-in slide-in-from-bottom-1 duration-200">
          {bottomPanel}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/30">
        <div className="flex items-center gap-3">
          {granularity && (
            <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">{granularity}</span>
          )}
          {seriesCount != null && (
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {seriesCount} {seriesCount === 1 ? 'série' : 'séries'}
            </span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{lastUpdated}</span>
        )}
      </div>
    </div>
  );
};

export default PremiumGraphCard;
