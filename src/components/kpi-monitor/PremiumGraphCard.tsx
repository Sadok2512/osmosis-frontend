import React from 'react';
import { cn } from '@/lib/utils';

interface PremiumGraphCardProps {
  title?: string;
  badge?: string;
  granularity?: string;
  seriesCount?: number;
  lastUpdated?: string;
  children: React.ReactNode;
  className?: string;
}

const PremiumGraphCard: React.FC<PremiumGraphCardProps> = ({
  title = 'KPI Time Series',
  badge,
  granularity,
  seriesCount,
  lastUpdated,
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border border-border/60 bg-card',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)]',
        'hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-shadow duration-200',
        className
      )}
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
        <span className="text-[9px] text-muted-foreground/50 italic">Cliquer pour configurer</span>
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
