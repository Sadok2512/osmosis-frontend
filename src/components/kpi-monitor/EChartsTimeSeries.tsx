import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { KpiTimeSeriesPoint, KpiCatalogEntry } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { useKpiMonitorStore, Milestone } from '../../stores/kpiMonitorStore';
import { MoreHorizontal, Download, Image, RefreshCw, Maximize2, Minimize2, Settings, Copy, Trash2, Settings2, Percent } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { WidgetGraphConfig, WidgetAxisConfig, WidgetThreshold } from './GraphSettingsPanel';
import { getAxisSideConfig } from './normalizeConfig';
import { DEFAULT_GRID, DEFAULT_CALENDAR } from './GraphSettingsPanel';
import GraphConfigPopover from './GraphConfigPopover';
import { exportElementToPNG, exportElementToPDF } from '@/lib/exportUtils';

const PREMIUM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

interface Props {
  data: KpiTimeSeriesPoint[];
  height?: number;
  catalogMap?: Record<string, KpiCatalogEntry>;
  title?: string;
  badge?: string;
  granularity?: string;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  onExpand?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  graphConfig?: WidgetGraphConfig;
  axisConfig?: WidgetAxisConfig;
  thresholds?: WidgetThreshold[];
  thresholdsEnabled?: boolean;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  onInfo?: () => void;
  configPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

const EChartsTimeSeries: React.FC<Props> = ({
  data, height = 460, catalogMap: externalMap,
  title, badge, granularity, onExportPNG,
  onExportCSV, onRefresh, onExpand, onDuplicate, onDelete,
  graphConfig: gc, axisConfig: ac, thresholds: thresholdList, thresholdsEnabled,
  editMode, onToggleEditMode, onInfo, configPanel, bottomPanel,
  onAxisConfigChange, onGraphConfigChange,
}) => {
  const { selectedKpis, milestones: storeMilestones, showMilestones: storeShowMilestones } = useKpiMonitorStore();
  const catMap = externalMap || KPI_CATALOG_MAP;

  // Build series
  const { seriesArr, allTs } = useMemo(() => {
    const seriesMap = new Map<string, { kpiKey: string; name: string; points: Map<string, number> }>();
    for (const pt of data) {
      const name = pt.split_value === 'ALL' ? pt.kpi_key : `${pt.kpi_key} — ${pt.split_value}`;
      if (!seriesMap.has(name)) seriesMap.set(name, { kpiKey: pt.kpi_key, name, points: new Map() });
      seriesMap.get(name)!.points.set(pt.ts, pt.value);
    }
    const allTs = [...new Set(data.map(d => d.ts))].sort();
    return { seriesArr: [...seriesMap.values()], allTs };
  }, [data]);

  // Determine first KPI info for card header
  const firstKpiKey = seriesArr[0]?.kpiKey;
  const firstCat = firstKpiKey ? catMap[firstKpiKey] : null;
  const firstKpiSel = selectedKpis.find(k => k.kpi_key === firstKpiKey);
  const headerColor = firstKpiSel?.color || firstCat?.color || PREMIUM_COLORS[0];
  const headerTitle = title || firstCat?.display_name || firstKpiKey || 'KPI Time Series';
  const headerUnit = firstCat?.unit || '';

  const smooth = gc?.smooth ?? true;
  const lineWidth = gc?.lineWidth ?? 2.5;
  const showSymbols = gc?.showSymbols ?? false;
  const gridCfg = gc?.grid || DEFAULT_GRID;

  // Build ECharts option
  const option = useMemo(() => {
    if (allTs.length === 0) return {};

    // Separate left/right series
    const rightKeys = new Set(selectedKpis.filter(k => k.axis === 'right').map(k => k.kpi_key));
    const hasRight = seriesArr.some(s => rightKeys.has(s.kpiKey));

    const leftCfg = ac ? getAxisSideConfig(ac, 'left') : null;
    const rightCfg = ac ? getAxisSideConfig(ac, 'right') : null;

    // Build mark lines for thresholds
    const buildMarkLine = (kpiKey: string) => {
      if (!thresholdsEnabled || !thresholdList?.length) return undefined;
      return {
        silent: true,
        data: thresholdList.filter(t => t.visible !== false).map(t => ({
          yAxis: t.value,
          lineStyle: {
            color: t.color,
            type: t.style === 'dotted' ? 'dotted' as const : t.style === 'solid' ? 'solid' as const : 'dashed' as const,
            width: 1.5,
          },
          label: { show: false },
        })),
      };
    };

    // Build milestone mark lines (on first series only)
    const buildMilestoneMarkLine = () => {
      if (!storeShowMilestones || !storeMilestones?.length) return [];
      return storeMilestones.filter(m => m.visible !== false).map(m => ({
        xAxis: m.date,
        lineStyle: { color: m.color || '#3b82f6', type: 'dashed' as const, width: 1.5, opacity: 0.7 },
        label: {
          show: true,
          formatter: m.label,
          fontSize: 9,
          fontWeight: 600,
          color: '#fff',
          backgroundColor: m.color || '#3b82f6',
          padding: [2, 6],
          borderRadius: 4,
        },
      }));
    };

    let colorIdx = 0;
    const series = seriesArr.map((s, i) => {
      const kpiSel = selectedKpis.find(k => k.kpi_key === s.kpiKey);
      if (kpiSel?.visible === false) { colorIdx++; return null; }

      const cat = catMap[s.kpiKey];
      const color = kpiSel?.color || cat?.color || PREMIUM_COLORS[colorIdx % PREMIUM_COLORS.length];
      const chartType = kpiSel?.graphType || 'line';
      const seriesLineW = kpiSel?.lineWidth ?? lineWidth;
      const seriesSmooth = smooth;
      const seriesShowSym = kpiSel?.showMarkers ?? showSymbols;
      const seriesOpacity = kpiSel?.opacity ?? 1;
      const yAxisIndex = rightKeys.has(s.kpiKey) && hasRight ? 1 : 0;

      const values = allTs.map(ts => s.points.get(ts) ?? null);
      const isArea = chartType === 'area' || chartType === 'stacked_area';
      const isBar = chartType === 'bar';
      const isScatter = chartType === 'scatter';

      const markLineData = i === 0 ? [...(buildMarkLine(s.kpiKey)?.data || []), ...buildMilestoneMarkLine()] : (buildMarkLine(s.kpiKey)?.data || []);

      colorIdx++;
      return {
        name: s.name,
        type: isBar ? 'bar' : isScatter ? 'scatter' : 'line',
        data: values,
        smooth: isBar || isScatter ? false : seriesSmooth,
        symbol: seriesShowSym ? 'circle' : 'none',
        symbolSize: seriesShowSym ? 5 : 0,
        yAxisIndex,
        lineStyle: !isBar && !isScatter ? { width: seriesLineW, color } : undefined,
        itemStyle: {
          color,
          borderRadius: isBar ? [3, 3, 0, 0] : undefined,
          opacity: seriesOpacity,
        },
        barMaxWidth: 20,
        areaStyle: (isArea || (!isBar && !isScatter && (gc?.showLegend !== false))) && isArea ? {
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}20` },
              { offset: 1, color: `${color}02` },
            ],
          },
        } : undefined,
        markLine: markLineData.length ? { silent: true, data: markLineData } : undefined,
        stack: chartType === 'stacked_area' ? 'stack' : undefined,
      };
    }).filter(Boolean);

    const opt: any = {
      animation: true,
      grid: {
        top: 40,
        right: hasRight ? 56 : 20,
        bottom: 36,
        left: 56,
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        axisPointer: {
          type: 'cross' as const,
          crossStyle: { color: 'rgba(59,130,246,0.25)' },
          lineStyle: { color: 'rgba(59,130,246,0.25)', width: 1 },
        },
      },
      legend: {
        show: gc?.showLegend ?? true,
        bottom: 0,
        textStyle: { fontSize: 10, color: '#9ca3af' },
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category' as const,
        data: allTs,
        axisLabel: {
          formatter: (v: string) => {
            const dt = new Date(v);
            return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
          },
          fontSize: 9,
          color: '#9ca3af',
        },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: leftCfg?.title || '',
          nameTextStyle: { fontSize: 10, color: '#9ca3af' },
          min: leftCfg?.min !== 'auto' ? leftCfg?.min : undefined,
          max: leftCfg?.max !== 'auto' ? leftCfg?.max : undefined,
          inverse: leftCfg?.invert || false,
          axisLabel: {
            fontSize: 9,
            color: '#9ca3af',
            formatter: (v: number) => {
              const dec = leftCfg?.decimals ?? 2;
              const unit = leftCfg?.unit || '';
              if (unit) return v.toFixed(dec) + ' ' + unit;
              if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
              if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
              return v % 1 === 0 ? v.toString() : v.toFixed(dec);
            },
          },
          splitLine: {
            show: gridCfg.enabled,
            lineStyle: {
              color: `rgba(128,128,128,${(gridCfg.opacity ?? 20) / 100})`,
              type: 'dashed' as const,
            },
          },
        },
        ...(hasRight ? [{
          type: 'value' as const,
          name: rightCfg?.title || '',
          nameTextStyle: { fontSize: 10, color: '#9ca3af' },
          min: rightCfg?.min !== 'auto' ? rightCfg?.min : undefined,
          max: rightCfg?.max !== 'auto' ? rightCfg?.max : undefined,
          inverse: rightCfg?.invert || false,
          axisLabel: {
            fontSize: 9,
            color: '#9ca3af',
            formatter: (v: number) => {
              const dec = rightCfg?.decimals ?? 2;
              const unit = rightCfg?.unit || '';
              if (unit) return v.toFixed(dec) + ' ' + unit;
              return v.toFixed(dec);
            },
          },
          splitLine: { show: false },
        }] : []),
      ],
      series,
    };

    // Weekend shading via markArea on first series (respects calendar config)
    const calendarCfg = gc?.calendar;
    const showWeekends = calendarCfg?.highlightWeekends !== false; // default true
    if (showWeekends && series.length > 0 && allTs.length > 0) {
      const wColor = calendarCfg?.weekendColor || '#94a3b8';
      const wOpacity = (calendarCfg?.weekendOpacity ?? 10) / 100;
      const weekendAreas: any[] = [];
      for (let idx = 0; idx < allTs.length; idx++) {
        const d = new Date(allTs[idx]);
        const day = d.getUTCDay();
        if (day === 0 || day === 6) {
          weekendAreas.push([
            { xAxis: allTs[idx], itemStyle: { color: wColor.startsWith('#') ? `${wColor}${Math.round(wOpacity * 255).toString(16).padStart(2, '0')}` : `rgba(148,163,184,${wOpacity})` } },
            { xAxis: allTs[idx] },
          ]);
        }
      }
      const merged: any[] = [];
      for (const area of weekendAreas) {
        const last = merged[merged.length - 1];
        if (last) {
          const lastIdx = allTs.indexOf(last[1].xAxis);
          const curIdx = allTs.indexOf(area[0].xAxis);
          if (curIdx === lastIdx + 1) {
            last[1].xAxis = area[1].xAxis;
            continue;
          }
        }
        merged.push([...area]);
      }
      if (merged.length > 0) {
        const firstSeries = series.find((s: any) => s != null) as any;
        if (firstSeries) {
          firstSeries.markArea = {
            silent: true,
            data: merged,
          };
        }
      }
    }

    return opt;
  }, [data, seriesArr, allTs, selectedKpis, catMap, gc, ac, thresholdList, thresholdsEnabled, storeMilestones, storeShowMilestones, smooth, lineWidth, showSymbols, gridCfg]);

  const chartHeight = height - 80;
  const chartRef = useRef<HTMLDivElement>(null);
  const fsChartRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [animating, setAnimating] = useState<'in' | 'out' | null>(null);

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

  const handleExportPNG = async (isFs: boolean) => {
    const el = isFs ? fsChartRef.current : chartRef.current;
    if (!el) return;
    await exportElementToPNG(el, headerTitle.replace(/\s+/g, '_'));
  };

  const handleExportPDF = async (isFs: boolean) => {
    const el = isFs ? fsChartRef.current : chartRef.current;
    if (!el) return;
    await exportElementToPDF(el, headerTitle.replace(/\s+/g, '_'));
  };

  const stopDrag = (e: React.MouseEvent) => { e.stopPropagation(); };

  const actionsMenu = (isFs: boolean) => (
    <div className="flex items-center gap-1" onMouseDown={stopDrag}>
      {onToggleEditMode && (
        <button
          onClick={onToggleEditMode}
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors"
          title="Widget configuration"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}
      {onGraphConfigChange && gc && (
        <GraphConfigPopover config={gc} onChange={onGraphConfigChange} />
      )}
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
          {onRefresh && (
            <DropdownMenuItem onClick={onRefresh} className="gap-2.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </DropdownMenuItem>
          )}
          {onToggleEditMode && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleEditMode} className="gap-2.5 text-xs">
                <Settings className="w-3.5 h-3.5" /> Edit configuration
              </DropdownMenuItem>
            </>
          )}
          {onInfo && (
            <DropdownMenuItem onClick={onInfo} className="gap-2.5 text-xs">
              <Settings2 className="w-3.5 h-3.5" /> Explain KPI
            </DropdownMenuItem>
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

  const chartContent = (h: number) => data.length === 0 ? (
    <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: h }}>
      No data available
    </div>
  ) : (
    <ReactECharts
      option={option}
      style={{ height: h }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: headerColor }} />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">{headerTitle}</h3>
            <span className="text-[10px] text-muted-foreground font-medium">{headerUnit}</span>
          </div>
          {actionsMenu(true)}
        </div>
        <div ref={fsChartRef} className="flex-1 px-4 pb-4 min-h-0">
          {chartContent(window.innerHeight - 160)}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bgStyle = gc?.backgroundColor && gc.backgroundColor !== 'transparent' ? { backgroundColor: gc.backgroundColor } : undefined;
  const titleColor = (gc as any)?.titleColor;

  return (
    <>
      <div className="h-full flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden group shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-200" style={bgStyle}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0 flex-1 drag-handle cursor-grab active:cursor-grabbing">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: headerColor }} />
            <h3 className="text-[13px] font-semibold truncate tracking-tight" style={titleColor ? { color: titleColor } : undefined}>{headerTitle}</h3>
            <span className="text-[10px] text-muted-foreground font-medium">{headerUnit}</span>
          </div>
          {actionsMenu(false)}
        </div>
        <div ref={chartRef} className="flex-1 px-2 pt-1 pb-1 min-h-0">
          {chartContent(chartHeight)}
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
};

export default EChartsTimeSeries;
