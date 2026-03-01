import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Settings2, Download, FileSpreadsheet, RefreshCw, Maximize2,
  Copy, Trash2, MoreHorizontal, Pencil, PencilOff,
  BarChart3, Palette, Axis3D, ChevronDown, LayoutGrid,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { QuickSettingsSection } from './InlineGraphConfig';

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
  /** New compact edit mode */
  editMode?: boolean;
  onToggleEditMode?: () => void;
  activeSection?: QuickSettingsSection;
  onSetActiveSection?: (s: QuickSettingsSection) => void;
  /** Inline quick settings bar */
  configPanel?: React.ReactNode;
  /** Axes popover (rendered as wrapper around Axes button) */
  axesPopover?: React.ReactNode;
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
  activeSection,
  onSetActiveSection,
  configPanel,
  axesPopover,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const SectionButton: React.FC<{
    section: QuickSettingsSection;
    icon: React.ElementType;
    label: string;
  }> = ({ section, icon: Icon, label }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSetActiveSection?.(activeSection === section ? null : section);
      }}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all',
        activeSection === section
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

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
        {/* Left: title + badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground truncate tracking-tight">{title}</h3>
          {badge && (
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary/8 text-primary text-[10px] font-semibold uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>

        {/* Right: controls */}
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

          {/* Section buttons — only in edit mode */}
          {editMode && onSetActiveSection && (
            <>
              <div className="w-px h-4 bg-border/40 mx-1" />
              <SectionButton section="kpis" icon={BarChart3} label="KPIs" />
              <SectionButton section="style" icon={Palette} label="Style" />
              {axesPopover}
              <div className="w-px h-4 bg-border/40 mx-0.5" />
              <SectionButton section="full" icon={LayoutGrid} label="Full" />
            </>
          )}

          {/* ⋯ Actions menu — always visible on hover */}
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

      {/* ── Quick Settings Bar (compact, pushes chart down) ── */}
      {editMode && configPanel}

      {/* ── Chart Body ── */}
      <div className="flex-1 min-h-0 px-2 pt-2 pb-1">
        {children}
      </div>

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
