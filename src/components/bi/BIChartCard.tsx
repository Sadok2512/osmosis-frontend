import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [fullscreen, setFullscreen] = useState(false);
  const [animating, setAnimating] = useState<'in' | 'out' | null>(null);
  const firstMetric = config.yMetrics[0];
  const unit = firstMetric ? KPI_UNITS[firstMetric.kpi] || '' : '';
  const titleLabel = config.title || firstMetric?.kpi.replace(/_/g, ' ') || 'Chart';
  const unitLabel = unit ? `(${unit})` : '';
  const firstThreshold = config.advanced.thresholds[0];

  const openFullscreen = useCallback(() => {
    setAnimating('in');
    setFullscreen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setAnimating('out');
    setTimeout(() => {
      setFullscreen(false);
      setAnimating(null);
    }, 280);
  }, []);

  // ESC to close
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, closeFullscreen]);

  const stopDrag = (e: React.MouseEvent) => { e.stopPropagation(); };

  const headerContent = (isFs: boolean) => (
    <div className={`flex items-center justify-between ${isFs ? 'px-6 py-4' : 'px-4 py-3'}`}>
      {/* Left: drag handle area */}
      <div className={`flex items-center gap-2 min-w-0 flex-1 ${!isFs ? 'drag-handle cursor-grab active:cursor-grabbing' : ''}`}>
        <div className={`${isFs ? 'w-8 h-8' : 'w-6 h-6'} rounded-md bg-primary/10 flex items-center justify-center shrink-0`}>
          <BarChart3 className={`${isFs ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-primary`} />
        </div>
        <div className="min-w-0">
          <h3 className={`${isFs ? 'text-sm' : 'text-xs'} font-semibold text-foreground truncate leading-tight select-none`}>
            {titleLabel} {unitLabel}
          </h3>
        </div>
      </div>
      {/* Right: buttons - NOT inside drag handle */}
      <div className="flex items-center gap-0.5 shrink-0" onMouseDown={stopDrag}>
        <button onClick={isFs ? closeFullscreen : openFullscreen}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={isFs ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <div className={`flex items-center gap-0.5 ${isFs ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit">
            <Settings className={`${isFs ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          </button>
          <button onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Duplicate">
            <Copy className={`${isFs ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
            <Trash2 className={`${isFs ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          </button>
        </div>
      </div>
    </div>
  );

  const thresholdBadge = (isFs: boolean) => firstThreshold ? (
    <div className={`${isFs ? 'px-6' : 'px-4'} -mt-1 mb-1`}>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
        style={{ background: `${firstThreshold.color}15`, color: firstThreshold.color }}>
        ⊙ {firstThreshold.label}: {firstThreshold.value}
      </span>
    </div>
  ) : null;

  // Fullscreen overlay via portal
  const fullscreenOverlay = fullscreen ? createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300 ${animating === 'out' ? 'opacity-0' : 'opacity-100'}`}
      onClick={(e) => { if (e.target === e.currentTarget) closeFullscreen(); }}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-background/80 backdrop-blur-md transition-opacity duration-300 ${animating === 'out' ? 'opacity-0' : 'opacity-100'}`} />

      {/* Card */}
      <div className={`relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-[1600px] flex flex-col rounded-2xl bg-card border border-border shadow-[0_8px_64px_-12px_hsl(var(--foreground)/0.2)] overflow-hidden transition-all duration-300 ease-out ${animating === 'in' ? 'animate-scale-in' : animating === 'out' ? 'animate-scale-out' : ''}`}
        onAnimationEnd={() => { if (animating === 'in') setAnimating(null); }}
      >
        {headerContent(true)}
        {thresholdBadge(true)}
        <div className="flex-1 px-4 pb-4 min-h-0">
          <BIChartRenderer config={config} />
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className="h-full flex flex-col rounded-2xl bg-card border border-border shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] overflow-hidden group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)]">
        {headerContent(false)}
        {thresholdBadge(false)}
        <div className="flex-1 px-2 pb-3 min-h-0">
          <BIChartRenderer config={config} />
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
};

export default BIChartCard;
