import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings2, Download, FileSpreadsheet, RefreshCw, Maximize2, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PremiumGraphCardProps {
  title?: string;
  badge?: string;
  granularity?: string;
  seriesCount?: number;
  lastUpdated?: string;
  children: React.ReactNode;
  className?: string;
  onOpenSettings?: () => void;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExpand?: () => void;
}

const PremiumGraphCard: React.FC<PremiumGraphCardProps> = ({
  title = 'KPI Time Series',
  badge,
  granularity,
  seriesCount,
  lastUpdated,
  children,
  className,
  onOpenSettings,
  onExportPNG,
  onExportCSV,
  onRefresh,
  onDuplicate,
  onDelete,
  onExpand,
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 drag-handle cursor-grab">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground truncate tracking-tight">
            {title}
          </h3>
          {badge && (
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary/8 text-primary text-[10px] font-semibold uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>

        <div className={cn(
          'flex items-center gap-0.5 transition-opacity duration-150',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          {/* Settings button → opens GraphSettingsPanel */}
          {onOpenSettings && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="Graph Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* ⋯ Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onOpenSettings && (
                <>
                  <DropdownMenuItem onClick={onOpenSettings} className="gap-2 text-xs">
                    <Settings2 className="w-3.5 h-3.5" /> Graph Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
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
                  <Maximize2 className="w-3.5 h-3.5" /> Expand fullscreen
                </DropdownMenuItem>
              )}
              {(onDuplicate || onDelete) && <DropdownMenuSeparator />}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs">
                  <Copy className="w-3.5 h-3.5" /> Duplicate widget
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" /> Remove widget
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 px-2 pt-2 pb-1">
        {children}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/30">
        <div className="flex items-center gap-3">
          {granularity && (
            <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              {granularity}
            </span>
          )}
          {seriesCount != null && (
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {seriesCount} {seriesCount === 1 ? 'série' : 'séries'}
            </span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">
            {lastUpdated}
          </span>
        )}
      </div>
    </div>
  );
};

export default PremiumGraphCard;
