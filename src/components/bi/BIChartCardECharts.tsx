import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Download, FileSpreadsheet, RefreshCw, Maximize2,
  Minimize2, BarChart3, Settings, Copy, Trash2, GitCompareArrows,
  AlertTriangle, Image,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChartConfig, KPI_UNITS } from './biTypes';
import BIChartRendererECharts from './BIChartRendererECharts';
import { exportElementToPNG, exportElementToPDF } from '@/lib/exportUtils';
import { cn } from '@/lib/utils';

interface Props {
  config: ChartConfig;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

const BIChartCardECharts: React.FC<Props> = ({ config, onEdit, onDuplicate, onDelete }) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [animating, setAnimating] = useState<'in' | 'out' | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const fsChartRef = useRef<HTMLDivElement>(null);
  const firstMetric = config.yMetrics[0];
  const unit = firstMetric ? KPI_UNITS[firstMetric.kpi] || '' : '';
  const titleLabel = config.title || firstMetric?.kpi.replace(/_/g, ' ') || 'Chart';
  const unitLabel = unit ? `(${unit})` : '';
  const firstThreshold = config.advanced.thresholds[0];

  const openFullscreen = useCallback(() => { setAnimating('in'); setFullscreen(true); }, []);
  const closeFullscreen = useCallback(() => {
    setAnimating('out');
    setTimeout(() => { setFullscreen(false); setAnimating(null); }, 280);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, closeFullscreen]);

  const stopDrag = (e: React.MouseEvent) => { e.stopPropagation(); };

  const handleExportPNG = async (isFs: boolean) => {
    const el = isFs ? fsChartRef.current : chartRef.current;
    if (!el) return;
    await exportElementToPNG(el, titleLabel.replace(/\s+/g, '_'));
  };

  const handleExportPDF = async (isFs: boolean) => {
    const el = isFs ? fsChartRef.current : chartRef.current;
    if (!el) return;
    await exportElementToPDF(el, titleLabel.replace(/\s+/g, '_'));
  };

  const actionsMenu = (isFs: boolean) => (
    <div className="flex items-center gap-1" onMouseDown={stopDrag}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1.5 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => handleExportPNG(isFs)} className="gap-2.5 text-xs">
            <Image className="w-3.5 h-3.5" /> Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportPDF(isFs)} className="gap-2.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export PDF
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={isFs ? closeFullscreen : openFullscreen} className="gap-2.5 text-xs">
            {isFs ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isFs ? 'Exit fullscreen' : 'Expand fullscreen'}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DropdownMenuItem>
          {onEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit} className="gap-2.5 text-xs">
                <Settings className="w-3.5 h-3.5" /> Edit configuration
              </DropdownMenuItem>
            </>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate} className="gap-2.5 text-xs">
              <Copy className="w-3.5 h-3.5" /> Duplicate widget
            </DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem onClick={onDelete} className="gap-2.5 text-xs text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5" /> Remove widget
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  /* ── Header ── */
  const headerContent = (isFs: boolean) => (
    <div className={cn('flex items-center justify-between border-b border-border/40', isFs ? 'px-6 py-4' : 'px-4 py-3')}>
      <div className={cn('flex items-center gap-2 min-w-0 flex-1', !isFs && 'drag-handle cursor-grab active:cursor-grabbing')}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors shrink-0"
          title="Settings"
          onMouseDown={stopDrag}
        >
          <Settings className="w-4 h-4" />
        </button>
        <h3 className={cn('font-semibold text-foreground truncate tracking-tight', isFs ? 'text-sm' : 'text-[13px]')}
          style={config.advanced.headerTextColor ? { color: config.advanced.headerTextColor } : undefined}>
          {titleLabel} <span className="font-normal" style={{ color: config.advanced.headerTextColor || undefined }}>{unitLabel}</span>
        </h3>
        {config.description && (
          <span className="text-[11px] text-muted-foreground/60 truncate hidden sm:inline">
            {config.description}
          </span>
        )}
        {firstThreshold && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ background: `${firstThreshold.color}12`, color: firstThreshold.color }}>
            ⊙ {firstThreshold.label}: {firstThreshold.value}
          </span>
        )}
      </div>
      {actionsMenu(isFs)}
    </div>
  );

  /* ── Footer (removed) ── */

  /* ── Fullscreen overlay ── */
  const fullscreenOverlay = fullscreen ? createPortal(
    <div className={cn('fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300', animating === 'out' ? 'opacity-0' : 'opacity-100')}
      onClick={(e) => { if (e.target === e.currentTarget) closeFullscreen(); }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className={cn(
        'relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-[1600px] flex flex-col rounded-xl bg-card border border-border/60 overflow-hidden',
        'shadow-[0_8px_64px_-12px_hsl(var(--foreground)/0.15)]',
        'transition-all duration-300 ease-out',
        animating === 'in' ? 'animate-scale-in' : animating === 'out' ? 'animate-scale-out' : ''
      )} onAnimationEnd={() => { if (animating === 'in') setAnimating(null); }}>
        {headerContent(true)}
        <div ref={fsChartRef} className="flex-1 px-4 pb-4 min-h-0">
          <BIChartRendererECharts config={config} />
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className={cn(
        'h-full flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden group',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)]',
        'hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-shadow duration-200',
      )} style={{ backgroundColor: config.advanced.backgroundColor && config.advanced.backgroundColor !== 'transparent' ? config.advanced.backgroundColor : undefined }}>
        {headerContent(false)}
        <div ref={chartRef} className="flex-1 px-2 pt-1 pb-1 min-h-0">
          <BIChartRendererECharts config={config} />
        </div>
        
      </div>
      {fullscreenOverlay}
    </>
  );
};

export default BIChartCardECharts;
