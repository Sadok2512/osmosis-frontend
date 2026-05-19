import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, SplitOption, WidgetType, normalizeGranularity, InvestigationState } from './types';
import { buildTimeline, normalizeTimestamp, formatAxisLabel, getStepMs, smartXInterval, buildWeekendMarkAreas } from './timeUtils';
import { generateTimeSlots, mergeTimeSlots } from '@/lib/timeSlots';
import CounterSelectorModal from './CounterSelectorModal';
import { getApiUrl, getApiHeaders, fetchVpsWithRetry, logBackendRequest } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { KPI_MAP, KPIS } from './mockData';
import { fetchHistogramData, fetchKpiDefinitions, resolveSlotContext } from './investigatorApi';
import type { KpiDefinition } from './types';
import { buildPivotTable, formatInvestigatorValue, sanitizeTableData, TABLE_ACCENT_BG_CLASS, TABLE_ACCENT_TEXT_CLASS } from './tableDisplayUtils';
import { cn } from '@/lib/utils';
import { Settings2, TrendingUp, AreaChart, BarChart, CircleDot, X, Plus, Layers, Hash, BarChart3, GitBranch, Activity, RefreshCw, Copy, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Paintbrush, Eye } from 'lucide-react';
import BackendRequestDialog from './BackendRequestDialog';
import BreakdownChart from './BreakdownChart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { fetchFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { PH_COLORS, phTooltip, phXAxis, phYAxis, phBarItemStyle, phBarEmphasis, phAnimation } from './paramHubChartStyle';
import {
  PA_PALETTE,
  paLegend,
  paEstimateLegendRows,
  paTooltip,
  paXAxis,
  paYAxis,
  paShortenLabel,
} from './paChartStyle';

const WIDGET_TYPES: { value: WidgetType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'timeseries', label: 'Timeseries', icon: TrendingUp, color: 'text-blue-500' },
  { value: 'table', label: 'Table', icon: Hash, color: 'text-amber-500' },
  { value: 'text', label: 'Texte (séparateur)', icon: Type, color: 'text-emerald-500' },
];

const AddWidgetMenu: React.FC<{ onAdd: (type: WidgetType) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all">
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-1.5" sideOffset={6}>
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">Type de widget</p>
        {WIDGET_TYPES.map(wt => (
          <button
            key={wt.value}
            onClick={() => { onAdd(wt.value); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <wt.icon className={cn('w-3.5 h-3.5', wt.color)} />
            {wt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

/** Per-slot button that opens the backend-request dialog filtered by this slot. */
const SlotRequestButton: React.FC<{ slot: GraphSlot }> = ({ slot }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Voir la requête VPS (URL · payload · réponse)"
        className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <BackendRequestDialog
        open={open}
        onOpenChange={setOpen}
        title={slot.name}
      />
    </>
  );
};

/** Reusable graph settings popover for all slot types */
const SlotSettingsPopover: React.FC<{
  slot: GraphSlot;
  cfg: GraphConfig;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onDuplicateSlot?: (slotId: string) => void;
  onActivateTab?: (tab: any) => void;
  chartRef?: ReactECharts | null;
  hasTableData?: boolean;
}> = ({ slot, cfg, onUpdateSlotConfig, onDuplicateSlot, onActivateTab, chartRef, hasTableData = true }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        onClick={(e) => e.stopPropagation()}
        className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
      >
        <Settings2 className="w-4 h-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-[320px] p-0 z-[200] overflow-hidden max-h-[80vh] overflow-y-auto" align="end" side="bottom" sideOffset={4}>
      <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Graph Settings</span>
      </div>

      {/* Quick actions bar */}
      <div className="px-3 py-2 flex gap-2 border-b border-border/40">
        {onDuplicateSlot && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicateSlot(slot.id); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-semibold border border-border/40 text-foreground hover:bg-muted/50 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); exportChartAsPng(chartRef ?? null, slot.name || 'chart'); }}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-semibold border border-border/40 text-foreground hover:bg-muted/50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Chart Type and Granularity removed from Graph Settings:
            - Chart type is configured per-KPI (chartTypePerKpi).
            - Granularity is configured globally / per-slot via the toolbar. */}


        {/* Background */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">Background</span>
          <div className="flex gap-1">
            {(['transparent', 'light', 'dark'] as const).map(bg => (
              <button
                key={bg}
                onClick={(e) => { e.stopPropagation(); onUpdateSlotConfig(slot.id, { background: bg }); }}
                className={cn(
                  'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors capitalize',
                  (cfg.background ?? 'transparent') === bg
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                )}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Legend Position */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">Legend</span>
          <div className="flex gap-1">
            {(['bottom', 'right', 'hidden'] as const).map(pos => (
              <button
                key={pos}
                onClick={(e) => { e.stopPropagation(); onUpdateSlotConfig(slot.id, { legendPosition: pos }); }}
                className={cn(
                  'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors capitalize',
                  (cfg.legendPosition ?? 'bottom') === pos
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                )}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Fill Style — only relevant when area is enabled */}
        <div className={cn('flex items-center justify-between', !cfg.showArea && cfg.chartType !== 'area' && 'opacity-40')}>
          <span className="text-[10px] text-foreground">Fill Style</span>
          <div className="flex gap-1">
            {(['none', 'gradient', 'solid'] as const).map(fs => (
              <button
                key={fs}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!cfg.showArea && cfg.chartType !== 'area') return;
                  onUpdateSlotConfig(slot.id, { fillStyle: fs });
                }}
                disabled={!cfg.showArea && cfg.chartType !== 'area'}
                className={cn(
                  'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors capitalize',
                  (cfg.fillStyle ?? 'gradient') === fs
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                )}
              >
                {fs}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Table View — toggle is always enabled; (no data) hint is shown when the
            chart has no series yet, but the user can still pre-activate it so the
            table appears automatically after Apply. */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground" title={!hasTableData ? 'Activez puis cliquez Appliquer pour charger les données' : undefined}>
            Table View {!hasTableData && <span className="text-muted-foreground">(no data yet)</span>}
          </span>
          <Switch
            checked={cfg.showDataTable}
            onCheckedChange={v => {
              onUpdateSlotConfig(slot.id, { showDataTable: v });
              if (!v && onActivateTab) onActivateTab(null);
              else if (v && onActivateTab) onActivateTab('table_data');
            }}
            className="scale-[0.65]"
          />
        </div>

        {/* Top Worst Cells */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">Top Worst Cells</span>
          <Switch checked={cfg.showTopWorst} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showTopWorst: v }); if (!v && onActivateTab) onActivateTab(null); else if (v && onActivateTab) onActivateTab('top_worst'); }} className="scale-[0.65]" />
        </div>

        {/* Alarms */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">Alarms</span>
          <Switch checked={cfg.showAlarms} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showAlarms: v }); if (!v && onActivateTab) onActivateTab(null); else if (v && onActivateTab) onActivateTab('alarms'); }} className="scale-[0.65]" />
        </div>

        {/* Neighbors */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">Neighbors</span>
          <Switch checked={cfg.showNeighbors} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showNeighbors: v }); if (!v && onActivateTab) onActivateTab(null); else if (v && onActivateTab) onActivateTab('neighbors'); }} className="scale-[0.65]" />
        </div>

        {/* CM History */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-foreground">CM History</span>
          <Switch checked={cfg.showCmHistory} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showCmHistory: v }); if (!v && onActivateTab) onActivateTab(null); else if (v && onActivateTab) onActivateTab('cm_history'); }} className="scale-[0.65]" />
        </div>

        <div className="h-px bg-border/40" />

        {/* Chart Style */}
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Chart Style</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground">Smooth</span>
            <Switch checked={cfg.smooth} onCheckedChange={v => onUpdateSlotConfig(slot.id, { smooth: v })} className="scale-[0.65]" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground">Markers</span>
            <Switch checked={cfg.showSymbols} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showSymbols: v })} className="scale-[0.65]" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground">Area Fill</span>
            <Switch checked={cfg.showArea} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showArea: v })} className="scale-[0.65]" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground">Grid Lines</span>
            <Switch checked={cfg.showGrid} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showGrid: v })} className="scale-[0.65]" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground" title="Surligne les samedi/dimanche sur le graphique">Week-ends</span>
            <Switch checked={cfg.showWeekend !== false} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showWeekend: v })} className="scale-[0.65]" />
          </div>
        </div>
        {cfg.showGrid && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-foreground whitespace-nowrap">Grid Opacity</span>
            <Slider
              value={[cfg.gridOpacity ?? 50]}
              onValueChange={v => onUpdateSlotConfig(slot.id, { gridOpacity: v[0] })}
              min={0} max={100} step={5}
              className="flex-1"
            />
            <span className="text-[9px] text-muted-foreground font-mono w-8 text-right">{cfg.gridOpacity ?? 50}%</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-foreground whitespace-nowrap">Line Width</span>
          <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="flex-1" />
          <span className="text-[9px] text-muted-foreground font-mono w-8 text-right">{cfg.lineWidth}px</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/40 bg-muted/20">
        <button
          onClick={(e) => {
            if (cfg.showDataTable && onActivateTab) onActivateTab('table_data');
            else if (cfg.showBreakdown && onActivateTab) onActivateTab('breakdown');
            else if (cfg.showTopWorst && onActivateTab) onActivateTab('top_worst');
            else if (cfg.showAlarms && onActivateTab) onActivateTab('alarms');
            else if (cfg.showNeighbors && onActivateTab) onActivateTab('neighbors');
            else if (cfg.showCmHistory && onActivateTab) onActivateTab('cm_history');
            (e.target as HTMLElement).closest('[data-radix-popper-content-wrapper]')?.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
          }}
          className="w-full text-[10px] font-bold text-primary-foreground bg-primary hover:bg-primary/90 py-1.5 rounded-md transition-colors"
        >
          Appliquer
        </button>
      </div>
    </PopoverContent>
  </Popover>
);


const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Smooth', icon: TrendingUp },
  { value: 'line_straight', label: 'Straight', icon: TrendingUp },
  { value: 'line_points', label: 'Points', icon: CircleDot },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'stacked_area', label: 'Stacked Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_bar', label: 'Stacked', icon: Layers },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

// PA diverse palette for Investigator series — Precision Architect tokens
const SERIES_COLORS = [
  '#14746C', '#F59E0B', '#EF4444', '#6bd8cb', '#8b5cf6',
  '#3b82f6', '#10b981', '#ec4899', '#06b6d4', '#84cc16',
];

// Extended diverse palette for split dimension values — 20 distinct colors
const SPLIT_COLORS = [
  '#14746C', '#F59E0B', '#EF4444', '#6bd8cb', '#8b5cf6',
  '#3b82f6', '#10b981', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#d946ef', '#0ea5e9',
  '#eab308', '#a855f7', '#f43f5e', '#22c55e', '#0891b2',
];

/** Deterministic hash for any string key */
function stableHash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return ((hash % SPLIT_COLORS.length) + SPLIT_COLORS.length) % SPLIT_COLORS.length;
}

/** Stable color for a KPI — uses a simple hash so color doesn't shift when KPIs are added/removed */
function stableColorForKpi(kpiId: string): string {
  return SERIES_COLORS[stableHash(kpiId) % SERIES_COLORS.length];
}

/** Stable color for a split dimension value — same value ALWAYS gets same color across all graphs */
function stableColorForSplit(splitValue: string, kpiId?: string): string {
  // Color is based ONLY on the split value so the same dimension value
  // (e.g., "PMQAP=9") always gets the same color regardless of which KPI or graph
  return SPLIT_COLORS[stableHash(splitValue)];
}

/** Stable color for a raw counter */
function stableColorForCounter(counterName: string): string {
  // Offset hash to avoid collision with KPI colors
  return SPLIT_COLORS[(stableHash('CTR_' + counterName)) % SPLIT_COLORS.length];
}

/**
 * Per-slot color allocator: ensures NO two series in the same chart share
 * the same color. Tries the hash-based "stable" color first, then falls back
 * to the next free color in the extended palette (cycling if necessary).
 */
function makeSlotColorAllocator() {
  const used = new Set<string>();
  const assigned = new Map<string, string>();
  const palette = SPLIT_COLORS;
  // Precision Architect ordered defaults: 1st = green, 2nd = orange, 3rd = red
  const ORDERED_DEFAULTS = ['#14746C', '#F59E0B', '#EF4444'];
  let kpiOrder = 0;
  let splitOrder = 0;
  let counterOrder = 0;

  const pick = (key: string, preferred: string): string => {
    if (assigned.has(key)) return assigned.get(key)!;
    let chosen = preferred;
    if (used.has(chosen)) {
      const startIdx = Math.max(0, palette.indexOf(preferred));
      for (let off = 1; off <= palette.length; off++) {
        const candidate = palette[(startIdx + off) % palette.length];
        if (!used.has(candidate)) { chosen = candidate; break; }
      }
      if (used.has(chosen)) chosen = preferred;
    }
    used.add(chosen);
    assigned.set(key, chosen);
    return chosen;
  };

  return {
    forKpi: (kpiId: string) => {
      const cacheKey = `kpi:${kpiId}`;
      if (assigned.has(cacheKey)) return assigned.get(cacheKey)!;
      // First KPIs in the slot follow the PA ordered palette (green → orange → red)
      const preferred = kpiOrder < ORDERED_DEFAULTS.length
        ? ORDERED_DEFAULTS[kpiOrder]
        : stableColorForKpi(kpiId);
      kpiOrder += 1;
      return pick(cacheKey, preferred);
    },
    forSplit: (splitValue: string, kpiId?: string) => {
      const cacheKey = `split:${kpiId || ''}:${splitValue}`;
      if (assigned.has(cacheKey)) return assigned.get(cacheKey)!;
      // Split values (e.g. NANTES, RENNES, Plaque values) follow the PA ordered
      // palette in order of appearance: green → orange → red, then the rest of
      // the diverse palette. This avoids the random blue/pink default users
      // were seeing for the first two split groups.
      const preferred = splitOrder < ORDERED_DEFAULTS.length
        ? ORDERED_DEFAULTS[splitOrder]
        : stableColorForSplit(splitValue, kpiId);
      splitOrder += 1;
      return pick(cacheKey, preferred);
    },
    forCounter: (counterName: string) => {
      const cacheKey = `ctr:${counterName}`;
      if (assigned.has(cacheKey)) return assigned.get(cacheKey)!;
      const preferred = counterOrder < ORDERED_DEFAULTS.length
        ? ORDERED_DEFAULTS[counterOrder]
        : stableColorForCounter(counterName);
      counterOrder += 1;
      return pick(cacheKey, preferred);
    },
  };
}

/** Wrapper — full replace on every update so legend stays in sync */
const SlotChart = React.forwardRef<ReactECharts, { option: any; height: number; onDataZoom?: (start: number, end: number) => void; onChartClick?: () => void }>(({ option, height, onDataZoom, onChartClick }, ref) => {
  const onDataZoomRef = React.useRef(onDataZoom);
  onDataZoomRef.current = onDataZoom;
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist user legend toggles across option rebuilds. Without this, every
  // re-render (notMerge=true wipes state) brings hidden series back to life
  // so the user feels the legend "doesn't disable anything".
  const legendSelectedRef = React.useRef<Record<string, boolean>>({});
  const [legendVersion, setLegendVersion] = React.useState(0);

  const onEvents = React.useMemo(() => ({
    datazoom: (params: any) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!onDataZoomRef.current) return;
        const start = params.start ?? params.batch?.[0]?.start;
        const end = params.end ?? params.batch?.[0]?.end;
        if (start != null && end != null) {
          onDataZoomRef.current(start, end);
        }
      }, 300);
    },
    legendselectchanged: (params: any) => {
      // ECharts emits the FULL selected map on every toggle.
      legendSelectedRef.current = { ...(params?.selected || {}) };
      // Force a re-render so the merged option below picks up the new state.
      setLegendVersion((v) => v + 1);
    },
  }), []);

  // Merge persisted legend selection into the incoming option. We only keep
  // entries for series that still exist in the current option to avoid
  // resurrecting stale toggles for removed KPIs.
  const mergedOption = React.useMemo(() => {
    const seriesNames: string[] = Array.isArray(option?.series)
      ? option.series.map((s: any) => s?.name).filter((n: any) => typeof n === 'string')
      : [];
    if (seriesNames.length === 0) return option;
    const persisted = legendSelectedRef.current;
    const filtered: Record<string, boolean> = {};
    for (const name of seriesNames) {
      if (Object.prototype.hasOwnProperty.call(persisted, name)) {
        filtered[name] = persisted[name];
      }
    }
    if (Object.keys(filtered).length === 0) return option;
    return {
      ...option,
      legend: Array.isArray(option?.legend)
        ? option.legend.map((l: any) => ({ ...l, selected: { ...(l?.selected || {}), ...filtered } }))
        : { ...(option?.legend || {}), selected: { ...(option?.legend?.selected || {}), ...filtered } },
    };
    // legendVersion is intentionally part of the dependency list so a toggle
    // re-runs the merge even when the parent didn't rebuild `option`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, legendVersion]);

  return (
    <div style={{ height, position: 'relative' }} onMouseDown={e => e.stopPropagation()} onClick={() => onChartClick?.()}>
      <ReactECharts
        ref={ref}
        option={mergedOption}
        notMerge={true}
        lazyUpdate={false}
        onEvents={onEvents}
        style={{ height: '100%' }}
      />
    </div>
  );
});
/** Inline Histogram widget for a slot */
const HistogramWidget: React.FC<{ kpiIds: string[]; height: number; allKpis: KpiDefinition[] }> = ({ kpiIds, height, allKpis }) => {
  const [histData, setHistData] = React.useState<Record<string, any[]>>({});
  React.useEffect(() => {
    kpiIds.forEach(kpiId => {
      fetchHistogramData(kpiId).then(bins => {
        setHistData(prev => ({ ...prev, [kpiId]: bins }));
      }).catch(() => {});
    });
  }, [kpiIds]);

  return (
    <div className="space-y-2">
      {kpiIds.map(kpiId => {
        const def = KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId);
        const bins = histData[kpiId] || [];
        if (bins.length === 0) return <div key={kpiId} className="text-center text-[10px] text-muted-foreground py-8">Chargement histogram...</div>;
        const option = {
          ...phAnimation,
          grid: { top: 24, right: 20, bottom: 48, left: 56, containLabel: false },
          tooltip: phTooltip(),
          xAxis: { type: 'category' as const, data: bins.map((b: any) => b.label), ...phXAxis({ axisLabel: { fontSize: 10, color: PH_COLORS.labelMuted, rotate: 30, margin: 12 } }) },
          yAxis: { type: 'value' as const, name: 'Count', nameTextStyle: { fontSize: 10, color: PH_COLORS.labelSubtle }, ...phYAxis() },
          series: [{ type: 'bar' as const, data: bins.map((b: any) => b.count), itemStyle: phBarItemStyle(), emphasis: phBarEmphasis(), barMaxWidth: 32, barCategoryGap: '32%' }],
        };
        return <ReactECharts key={kpiId} option={option} style={{ height: height - 40 }} />;
      })}
    </div>
  );
};

/** Inline KPI card widget */
const KpiCardWidget: React.FC<{ kpiIds: string[]; data: DataPoint[]; allKpis: KpiDefinition[] }> = ({ kpiIds, data, allKpis }) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      {kpiIds.map(kpiId => {
        const def = KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId);
        // Fix #4: Match both plain and split keys (e.g. kpiId@dimLabel)
        const points = data.filter(d => d.kpi === kpiId || d.kpi.startsWith(kpiId + '@'));
        const lastVal = points.length > 0 ? points[points.length - 1].value : null;
        const prevVal = points.length > 1 ? points[points.length - 2].value : null;
        const delta = lastVal !== null && prevVal !== null && prevVal !== 0 ? ((lastVal - prevVal) / prevVal * 100) : null;
        return (
          <div key={kpiId} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: def?.color || '#6366f1' }} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">{def?.label || kpiId}</span>
            </div>
            <div className="text-lg font-black text-foreground">
              {lastVal !== null ? lastVal.toFixed(2) : '—'}
              <span className="text-[10px] font-normal text-muted-foreground ml-1">{def?.unit || ''}</span>
            </div>
            {delta !== null && (
              <span className={cn('text-[10px] font-bold', delta >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const formatTableWidgetValue = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const num = Number(value);
  if (num === 0) return '0';
  const abs = Math.abs(num);
  const maximumFractionDigits = abs > 0 && abs < 0.01 ? 8 : abs < 1 ? 4 : 2;
  return num.toLocaleString('fr-FR', { maximumFractionDigits });
};

const getTableWidgetRows = (slot: GraphSlot, data: DataPoint[]) => {
  const keys = [...(slot.kpiIds || []), ...((slot.counterIds || []) as string[])];
  const matchesKey = (kpi: string) => keys.length === 0 || keys.some(key => kpi === key || kpi.startsWith(`${key}@`));

  return data
    .filter((d: any) => d._slotId === slot.id && matchesKey(d.kpi || ''))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 80);
};

const getPivotTableWidgetData = (slot: GraphSlot, data: DataPoint[]) => {
  const sanitized = sanitizeTableData(data, slot);
  const normalizeSplitKey = (value?: string | null) =>
    String(value || '').replace(/^PM_DIM:/i, '').trim().toUpperCase();
  const splitUsesPlaque = [
    normalizeSplitKey(slot.splitBy),
    ...Object.values(slot.config?.splitByPerKpi || {}).map(normalizeSplitKey),
  ].includes('PLAQUE');
  const expectedSplitValues = splitUsesPlaque
    ? (slot.filters?.PLAQUE || slot.filters?.Plaque || [])
    : [];
  const pivot = buildPivotTable(sanitized, slot, slot.filters || {}, { expectedSplitValues });
  return {
    columns: pivot.columns,
    rows: pivot.rows,
  };
};

/* Paginated inline pivot-table widget — shows ALL rows across pages */
const PAGE_SIZES_INLINE = [25, 50, 100, 200];
const PivotTableWidgetBody: React.FC<{
  columns: ReturnType<typeof buildPivotTable>['columns'];
  rows: ReturnType<typeof buildPivotTable>['rows'];
  maxHeight: number;
}> = ({ columns, rows, maxHeight }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  useEffect(() => { setCurrentPage(0); }, [pageSize, rows.length]);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const startIdx = safePage * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);
  const FOOTER_H = 36;
  return (
    <div className="flex flex-col" style={{ maxHeight }}>
      <div className="overflow-auto rounded-xl border border-slate-200/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] flex-1 min-h-0" style={{ maxHeight: maxHeight - FOOTER_H }}>
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="border-b border-slate-200/80">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-3 py-2.5 font-bold uppercase tracking-[0.12em] text-[10px]',
                    column.kind === 'time' ? 'text-left text-slate-500' : '',
                    column.kind === 'kpi' ? `text-right ${TABLE_ACCENT_TEXT_CLASS}` : '',
                    (column.kind === 'filter' || column.kind === 'split' || column.kind === 'dimension') ? `text-left ${TABLE_ACCENT_TEXT_CLASS}` : '',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => (
              <tr key={`${row.rawTime}-${startIdx + idx}`} className={cn('border-b border-slate-100/90 hover:bg-[#14746C]/[0.045]', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/35')}>
                {columns.map((column) => {
                  if (column.key === 'time') {
                    return (
                      <td key={column.key} className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-500 font-medium">
                        {row.time}
                      </td>
                    );
                  }
                  if (column.kind === 'kpi') {
                    return (
                      <td key={column.key} className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                        {formatInvestigatorValue((row.values[column.key] as number | null | undefined) ?? null)}
                      </td>
                    );
                  }
                  return (
                    <td key={column.key} className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold border shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]', TABLE_ACCENT_BG_CLASS, TABLE_ACCENT_TEXT_CLASS, 'border-[#14746C]/15')}>
                        {String(row.values[column.key] ?? '—')}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination footer */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 mt-2 text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span>{totalRows.toLocaleString('fr-FR')} lignes</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#14746C]/40"
          >
            {PAGE_SIZES_INLINE.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button disabled={safePage === 0} onClick={() => setCurrentPage(0)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsLeft className="w-3 h-3" /></button>
          <button disabled={safePage === 0} onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="w-3 h-3" /></button>
          <span className="px-2 tabular-nums font-medium text-foreground">{safePage + 1} / {totalPages}</span>
          <button disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-3 h-3" /></button>
          <button disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsRight className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
};

/** Inline Counter Timeseries widget — fetches and renders PM counter data */
const CounterTimeseriesWidget: React.FC<{ counterNames: string[]; height: number }> = ({ counterNames, height }) => {
  const { state } = useInvestigatorStore();
  const [tsData, setTsData] = React.useState<{ ts: string; counter: string; counter_id?: string; value: number }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [nameMap, setNameMap] = React.useState<Record<string, string>>({});

  // Extract site filter from global filters (Record<string, string[]>)
  const siteName = state.filters?.['Site']?.[0] || state.filters?.['SITE']?.[0] || null;

  React.useEffect(() => {
    if (counterNames.length === 0) { setTsData([]); return; }
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const dateFrom = state.startDate?.split('T')[0] || thirtyDaysAgo;
    const dateTo = state.endDate?.split('T')[0] || today;
    // 2026-05-09: pass kpi/counter names through unchanged. Backend
    // catalog accepts BOTH verbose `Ericsson__&_X` AND canonical
    // `x_lowercase` via OR-lookup — see osmosis-parser commit 51048e3.
    // Stripping to TitleCase produced names matching nothing.
    const body: any = {
      counter_names: counterNames || [],
      date_from: dateFrom,
      date_to: dateTo,
      granularity: normalizeGranularity(state.granularity),
      split_by_dimension: false,
      advancedTimeFrame: state.advancedTimeFrame || { mode: 'NONE' },
    };
    if (siteName) body.site_name = siteName;
    const ctsUrl = getApiUrl('pm/counters/timeseries');
    logBackendRequest('Counter Timeseries (KPIGraphs)', 'POST', ctsUrl, body);
    fetch(ctsUrl, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then(r => r.ok ? r.json() : { series: [], meta: {} })
      .then(data => {
        setTsData(data.series || []);
        if (data.meta?.name_map) setNameMap(data.meta.name_map);
        setLoading(false);
      })
      .catch(() => { setTsData([]); setLoading(false); });
  }, [counterNames.join(','), state.startDate, state.endDate, state.granularity, siteName]);

  if (loading) return <div className="flex items-center justify-center text-muted-foreground text-[10px] gap-1.5" style={{ height }}><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  if (tsData.length === 0) return <div className="flex items-center justify-center text-muted-foreground text-[10px]" style={{ height }}>No data available</div>;

  const counters = [...new Set(tsData.map(d => d.counter))];
  const dataTs = [...new Set(tsData.map(d => d.ts))].sort();
  const dateFrom = state.startDate?.split('T')[0];
  const dateTo = state.endDate?.split('T')[0];
  const timestamps = dateFrom && dateTo
    ? mergeTimeSlots(generateTimeSlots(dateFrom, dateTo, normalizeGranularity(state.granularity)), dataTs)
    : dataTs;
  const displayLabel = (c: string) => {
    const id = Object.entries(nameMap).find(([, name]) => name === c)?.[0];
    return id ? `${c} (${id})` : c;
  };

  // Weekend highlighting (granularity-aware)
  const markAreaData = buildWeekendMarkAreas(timestamps, normalizeGranularity(state.granularity));

  // Auto Y-axis range
  const allVals = tsData.map(d => d.value).filter(v => v != null && !isNaN(v));
  const rawMin = allVals.length ? Math.min(...allVals) : 0;
  const rawMax = allVals.length ? Math.max(...allVals) : 100;
  const range = rawMax - rawMin;
  const padding = range === 0 ? Math.abs(rawMax || 1) * 0.02 : range * 0.1;
  const yMin = parseFloat((rawMin - padding).toFixed(4));
  const yMax = parseFloat((rawMax + padding).toFixed(4));

  // Smart x-axis interval
  const xInterval = smartXInterval(timestamps.length);

  // Estimate legend rows from number of counter series (avg ~5 items per row at typical width)
  const legendItemsCount = Array.isArray(counters) ? counters.length : 0;
  const legendRows = Math.min(4, Math.max(1, Math.ceil(legendItemsCount / 5)));
  const legendHeight = 22 + (legendRows - 1) * 20; // ~22px first row + 20px per extra
  const sliderHeight = 22;
  // Spacing system: separator above legend, breathing room around slider.
  const LEGEND_TOP_GAP = 20;   // space between slider and legend (separator sits here)
  const LEGEND_BOTTOM_PAD = 8; // space below legend

  const option = {
    animation: false,
    backgroundColor: '#ffffff',
    grid: {
      top: 16,
      right: 28,
      bottom: legendHeight + sliderHeight + LEGEND_TOP_GAP + LEGEND_BOTTOM_PAD + 8,
      left: 62,
      containLabel: false,
    },
    dataZoom: [
      { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
      {
        type: 'slider' as const,
        xAxisIndex: 0,
        height: sliderHeight,
        bottom: legendHeight + LEGEND_TOP_GAP + LEGEND_BOTTOM_PAD,
        filterMode: 'none' as const,
        borderColor: 'rgba(14,124,102,0.18)',
        backgroundColor: 'rgba(14,124,102,0.04)',
        fillerColor: 'rgba(20,184,166,0.18)',
        handleSize: '120%',
        handleStyle: { color: PH_COLORS.tealDark, borderColor: PH_COLORS.tealDark, borderWidth: 1 },
        moveHandleSize: 6,
        textStyle: { fontSize: 9, color: PH_COLORS.labelSubtle },
        dataBackground: {
          lineStyle: { color: 'rgba(14,124,102,0.3)' },
          areaStyle: { color: 'rgba(14,124,102,0.08)' },
        },
        selectedDataBackground: {
          lineStyle: { color: 'rgba(14,124,102,0.5)' },
          areaStyle: { color: 'rgba(20,184,166,0.18)' },
        },
        brushSelect: false,
      },
    ],
    // Subtle separator line between chart/slider area and legend (Grafana-style).
    graphic: [
      {
        type: 'line' as const,
        left: 'center',
        bottom: legendHeight + LEGEND_BOTTOM_PAD + 4,
        z: 0,
        shape: { x1: 0, y1: 0, x2: 10000, y2: 0 },
        style: { stroke: 'rgba(15, 23, 42, 0.06)', lineWidth: 1 },
        silent: true,
      },
    ],
    legend: {
      show: true,
      bottom: LEGEND_BOTTOM_PAD,
      left: 12,
      right: 12,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 4,
      itemGap: 18,
      type: 'scroll' as const,
      pageButtonItemGap: 4,
      pageButtonGap: 8,
      pageIconSize: 10,
      pageIconColor: PH_COLORS.tealDark,
      pageIconInactiveColor: '#cbd5e1',
      pageTextStyle: { fontSize: 9, color: PH_COLORS.labelMuted },
      align: 'left' as const,
      textStyle: { fontSize: 11, fontWeight: 500, color: '#4b5563', padding: [0, 4, 0, 4], fontFamily: 'Inter, system-ui, sans-serif' },
      tooltip: { show: true },
    },
    tooltip: {
      ...phTooltip(),
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        if (items.length === 0) return '';
        const dt = new Date(items[0].axisValue);
        const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
        const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
        const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const isWE = dt.getDay() === 0 || dt.getDay() === 6;
        const weBadge = isWE ? ` <span style="background:rgba(14,124,102,0.1);padding:1px 5px;border-radius:3px;font-size:9px;color:${PH_COLORS.tealDark}">WE</span>` : '';
        const header = `<div style="font-size:11px;font-weight:600;color:${PH_COLORS.tealDark};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid ${PH_COLORS.splitLine};padding-bottom:5px">${dayName} ${dateStr} · ${timeStr}${weBadge}</div>`;
        const rows = items.map((p: any) => {
          const val = p.value != null ? p.value.toFixed(2) : '—';
          return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:${PH_COLORS.labelMuted};font-size:12px">${p.seriesName}</span><b style="color:${PH_COLORS.labelStrong}">${val}</b></div>`;
        }).join('');
        return header + rows;
      },
    },
    xAxis: {
      type: 'category' as const,
      data: timestamps,
      axisLabel: {
        formatter: (v: string) => formatAxisLabel(v, state.granularity),
        fontSize: 11,
        color: PH_COLORS.labelMuted,
        fontFamily: 'Inter, system-ui, sans-serif',
        margin: 14,
        rotate: 0,
        interval: xInterval,
        lineHeight: 16,
      },
      axisLine: { lineStyle: { color: 'rgba(15,23,42,0.35)' } },
      axisTick: { show: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: yMin,
      max: yMax,
      axisLabel: { fontSize: 9, color: '#9ca3af', fontFamily: 'Inter, system-ui, sans-serif', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(1), margin: 12 },
      splitLine: { show: true, lineStyle: { color: 'rgba(15,23,42,0.08)', type: 'dashed' as const } },
      axisLine: { show: true, lineStyle: { color: 'rgba(15,23,42,0.15)' } },
      axisTick: { show: true },
    },
    series: counters.map((counter, ci) => {
      const color = stableColorForCounter(counter);
      return {
        name: displayLabel(counter),
        type: 'line' as const,
        smooth: true,
        connectNulls: false,
        data: timestamps.map(ts => { const p = tsData.find(d => d.ts === ts && d.counter === counter); return p ? p.value : null; }),
        lineStyle: { width: 2.5, color },
        itemStyle: { color },
        symbol: 'none',
        symbolSize: 5,
        emphasis: {
          focus: 'series' as const,
          blurScope: 'coordinateSystem' as const,
          lineStyle: { width: 4 },
        },
        areaStyle: {
          color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: color + '20' },
            { offset: 1, color: color + '02' },
          ]},
        },
        ...(ci === 0 ? {
          markArea: markAreaData.length > 0 ? { silent: true, data: markAreaData } : undefined,
        } : {}),
      };
    }),
  };

  return <ReactECharts option={option} notMerge style={{ height }} />;
};


const TEXT_COLORS = ['#0f172a', '#475569', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#ffffff'];
const BG_COLORS = ['', '#ffffff', '#f8fafc', '#fef2f2', '#fff7ed', '#fefce8', '#f0fdf4', '#eff6ff', '#f5f3ff', '#fdf2f8', '#ecfeff', '#0f172a'];

const InvestigatorTextWidget: React.FC<{
  slot: GraphSlot;
  isActive: boolean;
  onClick: () => void;
  onChangeText: (content: string) => void;
  onChangeStyle: (style: NonNullable<GraphSlot['textStyle']>) => void;
  onRemove: () => void;
}> = ({ slot, isActive, onClick, onChangeText, onChangeStyle, onRemove }) => {
  const [showTextColors, setShowTextColors] = useState(false);
  const [showBgColors, setShowBgColors] = useState(false);
  const style = slot.textStyle || {};
  const fontSize = style.fontSize ?? 16;
  const fontWeight = style.fontWeight ?? 'semibold';
  const fontStyle = style.fontStyle ?? 'normal';
  const textAlign = style.textAlign ?? 'left';
  const color = style.color ?? '';
  const bgColor = style.bgColor ?? '';
  const update = (patch: Partial<NonNullable<GraphSlot['textStyle']>>) => onChangeStyle({ ...style, ...patch });

  return (
    <div
      onClick={onClick}
      className={cn(
        'col-span-full rounded-xl border px-4 py-2.5 group relative cursor-pointer transition-all duration-200 flex items-start gap-2',
        isActive ? 'border-emerald-300 ring-2 ring-emerald-200/50' : 'border-slate-200 hover:border-slate-300'
      )}
      style={bgColor ? { backgroundColor: bgColor } : { background: 'linear-gradient(to right, rgba(236,253,245,0.4), white, rgba(236,253,245,0.4))' }}
    >
      <Type className="w-4 h-4 text-emerald-500 shrink-0 mt-1.5" />
      <textarea
        value={slot.textContent ?? ''}
        placeholder="Saisir un texte / titre de section…"
        onChange={(e) => onChangeText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        rows={1}
        className="flex-1 bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/60 placeholder:font-normal leading-relaxed py-1"
        style={{
          fontSize,
          fontWeight: fontWeight === 'bold' ? 700 : fontWeight === 'semibold' ? 600 : 400,
          fontStyle,
          textAlign,
          color: color || undefined,
          minHeight: '1.75rem',
        }}
        onInput={(e) => {
          const ta = e.currentTarget;
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        }}
      />
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-white/95 backdrop-blur rounded-lg border border-border/60 px-1 py-0.5 shrink-0 shadow-sm"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => update({ fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' })}
          className={cn('p-1 rounded hover:bg-muted transition-colors', fontWeight === 'bold' ? 'text-primary' : 'text-muted-foreground')}
          title="Gras"
        >
          <Bold className="w-3 h-3" />
        </button>
        <button
          onClick={() => update({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={cn('p-1 rounded hover:bg-muted transition-colors', fontStyle === 'italic' ? 'text-primary' : 'text-muted-foreground')}
          title="Italique"
        >
          <Italic className="w-3 h-3" />
        </button>
        <div className="w-px h-3 bg-border mx-0.5" />
        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
          return (
            <button
              key={align}
              onClick={() => update({ textAlign: align })}
              className={cn('p-1 rounded hover:bg-muted transition-colors', textAlign === align ? 'text-primary' : 'text-muted-foreground')}
              title={`Aligner ${align}`}
            >
              <Icon className="w-3 h-3" />
            </button>
          );
        })}
        <div className="w-px h-3 bg-border mx-0.5" />
        <select
          value={fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] text-foreground w-12 outline-none"
          title="Taille"
        >
          {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
        {/* Text color */}
        <div className="relative">
          <button
            onClick={() => { setShowTextColors((v) => !v); setShowBgColors(false); }}
            className="w-5 h-5 rounded-full border-2 border-border shadow-sm hover:shadow-md transition-shadow ml-0.5"
            style={{ backgroundColor: color || '#0f172a' }}
            title="Couleur du texte"
          />
          {showTextColors && (
            <div className="absolute top-7 right-0 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-2.5 z-[9999]" onMouseLeave={() => setShowTextColors(false)}>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Texte</span>
              <div className="flex gap-1.5 flex-wrap max-w-[140px]">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { update({ color: c }); setShowTextColors(false); }}
                    className={cn('w-5 h-5 rounded-full border transition-all hover:scale-125', color === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border/40')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Background color */}
        <div className="relative">
          <button
            onClick={() => { setShowBgColors((v) => !v); setShowTextColors(false); }}
            className="w-5 h-5 rounded-full border-2 border-dashed border-border hover:shadow-md transition-shadow flex items-center justify-center"
            style={{ backgroundColor: bgColor || undefined }}
            title="Couleur de fond"
          >
            {!bgColor && <Paintbrush className="w-2.5 h-2.5 text-muted-foreground" />}
          </button>
          {showBgColors && (
            <div className="absolute top-7 right-0 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-2.5 z-[9999]" onMouseLeave={() => setShowBgColors(false)}>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Fond</span>
              <div className="flex flex-wrap gap-1.5 max-w-[140px]">
                {BG_COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { update({ bgColor: c }); setShowBgColors(false); }}
                    className={cn('w-5 h-5 rounded-full border transition-all hover:scale-125', bgColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border/40')}
                    style={{
                      backgroundColor: c || 'transparent',
                      backgroundImage: !c ? 'linear-gradient(135deg, hsl(var(--muted)) 50%, hsl(var(--destructive)/0.3) 50%)' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="w-px h-3 bg-border mx-0.5" />
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Supprimer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};


interface Props {
  graphSlots: GraphSlot[];
  data: DataPoint[];
  investigatorState: InvestigationState;
  applyVersion?: number;
  layout: 1 | 2 | 3 | 4;
  jalons: Jalon[];
  onChangeSlotKpi: (slotId: string, kpiId: string) => void;
  onSetSlotKpiIds: (slotId: string, kpiIds: string[]) => void;
  onSetSlotCounterIds: (slotId: string, counterIds: string[]) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddEmptySlot: (widgetType?: import('./types').WidgetType) => void;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onRenameSlot: (slotId: string, name: string) => void;
  onSetSlotText?: (slotId: string, content: string) => void;
  onSetSlotTextStyle?: (slotId: string, style: NonNullable<GraphSlot['textStyle']>) => void;
  onOpenKpiSelector: (slotId: string) => void;
  onDuplicateSlot?: (slotId: string) => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
  isFullscreen?: boolean;
  onActivateTab?: (tab: 'table_data' | 'breakdown' | 'top_worst' | 'alarms' | 'neighbors' | 'cm_history' | null) => void;
  isApplying?: boolean;
}

/** Export an ECharts instance to PNG and trigger download */
const exportChartAsPng = (chartRef: ReactECharts | null, filename: string) => {
  if (!chartRef) return;
  const instance = chartRef.getEchartsInstance();
  if (!instance) return;
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const KPIGraphs: React.FC<Props> = ({ graphSlots: rawSlots, data, investigatorState, applyVersion = 0, layout, jalons, onChangeSlotKpi, onSetSlotKpiIds, onSetSlotCounterIds, onRemoveSlot, onAddEmptySlot, onUpdateSlotConfig, onRenameSlot, onSetSlotText, onSetSlotTextStyle, onOpenKpiSelector, onDuplicateSlot, activeSlotId, onSlotClick, isFullscreen, onActivateTab, isApplying }) => {
  // In fullscreen mode, show only the active slot
  const graphSlots = isFullscreen && activeSlotId ? rawSlots.filter(s => s.id === activeSlotId) : rawSlots;
  const cols = isFullscreen ? 1 : layout === 1 ? 1 : layout === 3 ? 3 : 2;
  const chartHeight = isFullscreen ? 700 : layout === 1 ? 520 : layout === 4 ? 340 : layout === 3 ? 360 : 400;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [counterCatalog, setCounterCatalog] = useState<{ counter_name: string; display_name: string; family: string; vendor: string; techno: string; object_type: string; count: number }[]>([]);
  const [counterSelectorSlotId, setCounterSelectorSlotId] = useState<string | null>(null);
  const chartRefsMap = useRef<Record<string, ReactECharts | null>>({});
  // Committed render params — only updated when fetch succeeds, so axis + data swap atomically
  const committedParamsRef = useRef<Record<string, { startDate: string; endDate: string; granularity: string }>>({});
  // Per-slot fetching state for loading overlay
  const [fetchingSlots, setFetchingSlots] = useState<Record<string, boolean>>({});
  // Counter data per slot: { [slotId]: { series, nameMap } }
  const [counterDataMap, setCounterDataMap] = useState<Record<string, { series: { ts: string; counter: string; counter_id?: string; value: number; dimension_key?: string }[]; nameMap: Record<string, string> }>>({});

  const slotsCounterKey = useMemo(() => graphSlots.map((slot) => JSON.stringify({
    id: slot.id,
    counterIds: slot.counterIds || [],
    splitByPerKpi: slot.config?.splitByPerKpi || {},
  })).join('|'), [graphSlots]);

  useEffect(() => {
    fetchKpiDefinitions().then(k => { if (k.length > 0) setAllKpis(k); }).catch(() => {});
    fetchFilterCatalog().then(filters => {
      if (filters?.length) {
        const opts = filters
          .filter((f: any) => f.is_active !== false)
          .map((f: any) => ({ key: f.dimension_key, label: f.display_name }));
        setSplitOptions(opts);
      }
    }).catch(() => {
      setSplitOptions(['Site', 'Cell', 'Plaque', 'DOR', 'Vendor', 'Technology', 'Band', 'Zone ARCEP'].map(s => ({ key: s, label: s })));
    });
    // Load counter catalog
    fetchVpsWithRetry(getApiUrl('pm/counters/catalog'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setCounterCatalog(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch counter timeseries for all slots that have counterIds
  useEffect(() => {
    if (applyVersion === 0) return;
    const slotsWithCounters = graphSlots.filter(s => s.counterIds && s.counterIds.length > 0);
    if (slotsWithCounters.length === 0) return;

    const controller = new AbortController();

    slotsWithCounters.forEach(slot => {
      const cIds = slot.counterIds!;
      const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
      const slotContext = resolveSlotContext(slot, {
        startDate: investigatorState.startDate,
        endDate: investigatorState.endDate,
        granularity: investigatorState.granularity,
        splitBy: investigatorState.splitBy,
        filters: investigatorState.filters,
        kpiLevel: investigatorState.kpiLevel,
        profileQci: investigatorState.profileQci,
        profileArp: investigatorState.profileArp,
        neighborType: investigatorState.neighborType,
        advancedTimeFrame: investigatorState.advancedTimeFrame,
      });

      // Check if any counter in this slot has a split configured
      const splitPerKpi = cfg.splitByPerKpi || {};
      const counterSplitVal = cIds.map(cid => splitPerKpi[cid]).find(v => v && v !== 'None');
      const hasSplit = !!counterSplitVal;

      // 2026-05-09: pass counter_names through unchanged. Backend
      // resolver (osmosis-parser commit 51048e3) accepts BOTH verbose
      // `Ericsson__&_X` AND canonical `x_lowercase`. Stripping to
      // TitleCase produced names matching nothing.
      const body: any = {
        counter_names: cIds || [],
        date_from: slotContext.dateFrom,
        date_to: slotContext.dateTo,
        granularity: slotContext.granularity,
        split_by_dimension: hasSplit,
        advancedTimeFrame: slotContext.advancedTimeFrame || { mode: 'NONE' },
      };

      for (const filter of slotContext.filters) {
        const dim = (filter.dimension || '').toUpperCase();
        if (!filter.values?.length) continue;

        if (dim === 'SITE') {
          body.site_name = filter.values.length === 1 ? filter.values[0] : filter.values;
        } else if (dim === 'CELL') {
          body.cell_name = filter.values.length === 1 ? filter.values[0] : filter.values;
        } else if (dim === 'VENDOR') {
          // 2026-05-09: backend stores Ericsson/Nokia in TitleCase.
          // UPPERCASE matched 0 rows. Capitalize defensively.
          const v = String(filter.values[0]);
          body.vendor = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
        } else if (dim === 'TECHNOLOGY' || dim === 'TECHNO') {
          const ALL_TECHS = new Set(['2G', '3G', '4G', '5G']);
          const allSelected = filter.values.length >= 4 && filter.values.every(v => ALL_TECHS.has(v));
          if (!allSelected) {
            body.object_type = filter.values.length === 1 ? filter.values[0] : filter.values;
          }
        }
      }

      if (hasSplit) {
        const splitUpper = counterSplitVal!.toUpperCase();
        // Map split dimension to the backend field
        if (splitUpper === 'CELL') {
          body.split_by_field = 'cell_name';
        } else if (splitUpper === 'SITE') {
          body.split_by_field = 'site_name';
        } else {
          body.split_by_field = counterSplitVal;
        }
      }

      setFetchingSlots(prev => ({ ...prev, [slot.id]: true }));

      const slotCtsUrl = getApiUrl('pm/counters/timeseries');
      logBackendRequest(`Counter Timeseries (slot ${slot.id})`, 'POST', slotCtsUrl, body);
      fetch(slotCtsUrl, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : { series: [], meta: {} })
        .then(data => {
          if (controller.signal.aborted) {
            // Clear spinner even when aborted to avoid stuck loading overlay
            setFetchingSlots(prev => ({ ...prev, [slot.id]: false }));
            return;
          }
          // Commit render params atomically with data
          committedParamsRef.current[slot.id] = {
            startDate: slotContext.dateFrom,
            endDate: slotContext.dateTo,
            granularity: slotContext.granularity,
          };
          setCounterDataMap(prev => ({
            ...prev,
            [slot.id]: { series: data.series || [], nameMap: data.meta?.name_map || {} },
          }));
          setFetchingSlots(prev => ({ ...prev, [slot.id]: false }));
        })
        .catch(() => {
          // Always clear, regardless of abort state
          setFetchingSlots(prev => ({ ...prev, [slot.id]: false }));
        });
    });

    return () => controller.abort();
  }, [applyVersion, slotsCounterKey]);
  // Counter fetches are intentionally gated by explicit Apply actions.
  // Editing dates / granularity / filters must not issue backend requests until confirmed.

  // Commit render params when KPI data arrives from parent (handleApply)
  useEffect(() => {
    if (data.length === 0) return;
    for (const slot of graphSlots) {
      const slotHasData = data.some((d: any) => d._slotId === slot.id);
      if (slotHasData) {
        const ctx = resolveSlotContext(slot, {
          startDate: investigatorState.startDate,
          endDate: investigatorState.endDate,
          granularity: investigatorState.granularity,
          splitBy: investigatorState.splitBy,
          filters: investigatorState.filters,
          kpiLevel: investigatorState.kpiLevel,
          advancedTimeFrame: investigatorState.advancedTimeFrame,
        });
        committedParamsRef.current[slot.id] = {
          startDate: ctx.dateFrom,
          endDate: ctx.dateTo,
          granularity: ctx.granularity,
        };
      }
    }
  }, [data]);

  const getDef = (kpiId: string) => KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId) || null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 ${isFullscreen ? 'grid-cols-1 w-full' : cols === 1 ? 'grid-cols-1 max-w-[1400px]' : cols === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const kpiIds = slot.kpiIds || [];
        const counterIds = slot.counterIds || [];
        const isEmpty = kpiIds.length === 0 && counterIds.length === 0;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const isActive = activeSlotId === slot.id;
        const wType = slot.widgetType || 'timeseries';
        const wtDef = WIDGET_TYPES.find(w => w.value === wType) || WIDGET_TYPES[0];

        // Text widget — full row, editable text acting as a separator/heading
        if (wType === 'text') {
          return (
            <InvestigatorTextWidget
              key={slot.id}
              slot={slot}
              isActive={isActive}
              onClick={() => onSlotClick?.(slot.id)}
              onChangeText={(content) => onSetSlotText?.(slot.id, content)}
              onChangeStyle={(s) => onSetSlotTextStyle?.(slot.id, s)}
              onRemove={() => onRemoveSlot(slot.id)}
            />
          );
        }

        // Empty slot — no KPI or counter assigned yet
        if (isEmpty) {
          return (
            <div
              key={slot.id}
              onClick={() => onSlotClick?.(slot.id)}
              className={cn(
                'rounded-2xl border bg-white p-5 group relative cursor-pointer transition-all duration-300 flex flex-col',
                isActive
                  ? 'border-[#14746C]/40 ring-2 ring-[#14746C]/15 shadow-[0_2px_4px_rgba(20,116,108,0.06),0_12px_28px_-12px_rgba(20,116,108,0.18)]'
                  : 'border-slate-200/70 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.06)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_8px_20px_-8px_rgba(15,23,42,0.08)]'
              )}
            >
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <wtDef.icon className={cn('w-3.5 h-3.5', wtDef.color)} />
                <input
                  value={slot.name}
                  onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-bold text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[140px] truncate"
                />
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{wtDef.label}</span>
                <span className="ml-auto" />
                {isActive && (
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Active</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <SlotRequestButton slot={slot} />
                <SlotSettingsPopover slot={slot} cfg={cfg} onUpdateSlotConfig={onUpdateSlotConfig} onDuplicateSlot={onDuplicateSlot} onActivateTab={onActivateTab} hasTableData={false} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ minHeight: chartHeight - 40 }}>
                <div className="text-muted-foreground/40">
                  <wtDef.icon className="w-8 h-8" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Aucun KPI / Compteur sélectionné
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }}
                    className="px-3 py-1 rounded-md text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                  >
                    + KPI
                  </button>
                  {wType === 'timeseries' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCounterSelectorSlotId(slot.id); }}
                      className="px-3 py-1 rounded-md text-[10px] font-semibold text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                    >
                      + Counter
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // ── Non-timeseries widget types: render specialized content ──
        if (wType === 'histogram') {
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-2xl border bg-white p-5 relative cursor-pointer transition-all duration-300',
              isActive
                ? 'border-[#14746C]/40 ring-2 ring-[#14746C]/15 shadow-[0_2px_4px_rgba(20,116,108,0.06),0_12px_28px_-12px_rgba(20,116,108,0.18)]'
                : 'border-slate-200/70 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.06)]'
            )}>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500">Histogram</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                <SlotRequestButton slot={slot} />
                <SlotSettingsPopover slot={slot} cfg={cfg} onUpdateSlotConfig={onUpdateSlotConfig} onDuplicateSlot={onDuplicateSlot} onActivateTab={onActivateTab} />
              </div>
              <HistogramWidget kpiIds={kpiIds} height={chartHeight} allKpis={allKpis} />
            </div>
          );
        }

        if (wType === 'table') {
          const tableData = getPivotTableWidgetData(slot, data);
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-2xl border bg-white p-5 relative cursor-pointer transition-all duration-300',
              isActive
                ? 'border-[#14746C]/40 ring-2 ring-[#14746C]/15 shadow-[0_2px_4px_rgba(20,116,108,0.06),0_12px_28px_-12px_rgba(20,116,108,0.18)]'
                : 'border-slate-200/70 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_6px_rgba(15,23,42,0.06)]'
            )}>
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <Hash className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Table</span>
                <span className="ml-auto" />
                {isActive && (
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Active</span>
                )}
                <button onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Ajouter KPI"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                <SlotRequestButton slot={slot} />
                <SlotSettingsPopover slot={slot} cfg={cfg} onUpdateSlotConfig={onUpdateSlotConfig} onDuplicateSlot={onDuplicateSlot} onActivateTab={onActivateTab} />
              </div>
              {(fetchingSlots[slot.id] || (isApplying && slot.id === activeSlotId)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70 rounded-2xl backdrop-blur-[2px] animate-in fade-in duration-150">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Chargement…</span>
                </div>
              )}
              {tableData.rows.length > 0 ? (
                <PivotTableWidgetBody columns={tableData.columns} rows={tableData.rows} maxHeight={chartHeight - 44} />
              ) : (
                <div className="flex items-center justify-center" style={{ minHeight: chartHeight - 40 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onActivateTab?.('table_data'); }}
                    className="text-center space-y-2 group"
                  >
                    <Hash className="w-10 h-10 text-amber-500/40 mx-auto group-hover:text-amber-500/70 transition-colors" />
                    <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Voir les données tabulaires</p>
                    <p className="text-[10px] text-muted-foreground/60">{kpiIds.length} KPI{kpiIds.length > 1 ? 's' : ''} sélectionné{kpiIds.length > 1 ? 's' : ''}</p>
                  </button>
                </div>
              )}
            </div>
          );
        }

        if ((wType as string) === 'table_legacy') {
          const tableRows = getTableWidgetRows(slot, data);
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-2xl border bg-white p-5 relative cursor-pointer transition-all duration-300',
              isActive
                ? 'border-[#14746C]/40 ring-2 ring-[#14746C]/15 shadow-[0_2px_4px_rgba(20,116,108,0.06),0_12px_28px_-12px_rgba(20,116,108,0.18)]'
                : 'border-slate-200/70 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.06)]'
            )}>
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <Hash className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Table</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Ajouter KPI"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                <SlotRequestButton slot={slot} />
                <SlotSettingsPopover slot={slot} cfg={cfg} onUpdateSlotConfig={onUpdateSlotConfig} onDuplicateSlot={onDuplicateSlot} onActivateTab={onActivateTab} />
              </div>
              {tableRows.length > 0 ? (
                <div className="overflow-auto rounded-lg border border-border/40" style={{ maxHeight: chartHeight - 44 }}>
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b border-border/50">
                        <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                        <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider">KPI</th>
                        <th className="text-left px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider">NE</th>
                        <th className="text-right px-3 py-2 font-bold text-muted-foreground uppercase tracking-wider">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, idx) => (
                        <tr key={`${row.timestamp}-${row.kpi}-${idx}`} className="border-b border-border/30 hover:bg-muted/30">
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{String(row.timestamp).slice(0, 16).replace('T', ' ')}</td>
                          <td className="px-3 py-2 max-w-[180px] truncate font-semibold text-foreground" title={row.kpi}>{row.kpi}</td>
                          <td className="px-3 py-2 max-w-[140px] truncate text-muted-foreground" title={row.networkElement || row.splitValue || ''}>{row.networkElement || row.splitValue || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{formatTableWidgetValue(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
              <div className="flex items-center justify-center" style={{ minHeight: chartHeight - 40 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onActivateTab?.('table_data'); }}
                  className="text-center space-y-2 group"
                >
                  <Hash className="w-10 h-10 text-amber-500/40 mx-auto group-hover:text-amber-500/70 transition-colors" />
                  <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Voir les données tabulaires</p>
                  <p className="text-[10px] text-muted-foreground/60">{kpiIds.length} KPI{kpiIds.length > 1 ? 's' : ''} sélectionné{kpiIds.length > 1 ? 's' : ''}</p>
                </button>
              </div>
              )}
            </div>
          );
        }

        // Multi-KPI: build series — detect split data
        // Per-slot color allocator: ensures every series in this chart gets a unique color
        const colorAlloc = makeSlotColorAllocator();
        const defs = kpiIds.map((id, i) => {
          const d = getDef(id);
          const baseColor = d?.color || stableColorForKpi(id);
          const uniqueColor = colorAlloc.forKpi(id);
          return d
            ? { ...d, color: uniqueColor }
            : { id, label: id, unit: '', color: uniqueColor, thresholds: { warning: 50, critical: 20 }, higherIsBetter: false };
        });

        // Filter data to only this slot's KPIs (handle split KPI ids like "kpi@splitLabel" or "kpi@split1@split2")
        // and keep slot isolation when Apply fetched multiple slots at once.
        const slotData = data.filter((d: any) => {
          const matchesSlot = d._slotId === slot.id;
          const matchesKpi = kpiIds.includes(d.kpi) || kpiIds.some(id => d.kpi.startsWith(id + '@'));
          if (d._isCounter && matchesSlot) return true;
          return matchesSlot && matchesKpi;
        });

        // Per-KPI split detection — explicit config OR auto-detected from data
        const splitByPerKpi = cfg.splitByPerKpi || {};
        const splitByPerKpi2 = cfg.splitByPerKpi2 || {};
        const globalSplitBy = investigatorState.splitBy;
        const slotSplit = (slot.splitBy && slot.splitBy !== 'None') || (globalSplitBy && globalSplitBy !== 'None');
        const slotSplit2 = slot.splitBy2 && slot.splitBy2 !== 'None';
        const hasPerKpiSplit = kpiIds.some(id => {
          const p = splitByPerKpi[id];
          return p && p !== 'None';
        });
        const hasPerKpiSplit2 = kpiIds.some(id => {
          const p = splitByPerKpi2[id];
          return p && p !== 'None';
        });
        // Auto-detect: if backend returned per-dimension data points (splitValue set),
        // honor them as separate series even when the user didn't explicitly configure splitBy.
        // This keeps the chart consistent with the table view.
        const dataCarriesSplit = slotData.some(d => d.splitValue && d.splitValue !== 'ALL');
        const dataCarriesSplit2 = slotData.some(d => d.splitValue2 && d.splitValue2 !== 'ALL');
        const hasSplit = slotSplit || hasPerKpiSplit || dataCarriesSplit;
        const hasDoubleSplit = (slotSplit && slotSplit2) || (hasPerKpiSplit && hasPerKpiSplit2) || dataCarriesSplit2;
        const getKpiHasSplit = (kpiId: string) => {
          if (slotSplit) return true;
          const perKpi = splitByPerKpi[kpiId];
          if (perKpi != null && perKpi !== 'None') return true;
          // Auto-honor backend-provided split for this KPI
          return slotData.some(d => matchesKpi(d.kpi, kpiId) && d.splitValue && d.splitValue !== 'ALL');
        };

        // Filter data: if no split configured AND no split data present, aggregate (ignore splitValue)
        const hasSplitData = hasSplit && dataCarriesSplit;
        const hasDoubleSplitData = hasDoubleSplit && slotData.some(d => d.splitValue2);
        const effectiveData = hasSplitData
          ? slotData.filter(d => d.splitValue && d.splitValue !== 'ALL')
          : slotData.map(d => ({ ...d, splitValue: undefined, splitValue2: undefined }));

        // Use committed params (from last successful fetch) so axis + data update atomically.
        // Falls back to live state only on first render (before any fetch has committed).
        const committed = committedParamsRef.current[slot.id];
        const slotStartDate = committed?.startDate ?? ((slot.startDate && slot.startDate.trim()) || investigatorState.startDate);
        const slotEndDate = committed?.endDate ?? ((slot.endDate && slot.endDate.trim()) || investigatorState.endDate);
        const slotGranularity = normalizeGranularity(committed?.granularity ?? (slot.granularity || investigatorState.granularity));
        // Normalize all data point timestamps to match granularity format
        const normalizedData = effectiveData.map(d => ({ ...d, timestamp: normalizeTimestamp(d.timestamp, slotGranularity) }));
        const matchesKpi = (dKpi: string, kpiId: string) => dKpi === kpiId || dKpi.startsWith(kpiId + '@');
        // Include counter timestamps from tsData too
        const counterDataFromTs = normalizedData.filter((d: any) => d._isCounter);
        const kpiTimestamps = kpiIds.flatMap(id => normalizedData.filter(d => !d._isCounter && matchesKpi(d.kpi, id)).map(d => d.timestamp));
        const counterTimestamps = counterDataFromTs.map(d => d.timestamp);
        const apiTimestamps = [...new Set([...kpiTimestamps, ...counterTimestamps])].sort();

        const fullTimeline = buildTimeline(slotStartDate, slotEndDate, slotGranularity);
        // If buildTimeline returned empty (invalid dates), fall back to API timestamps
        if (fullTimeline.length === 0) fullTimeline.push(...apiTimestamps);
        // Merge: use full timeline as base, add any API timestamps not already included
        const timelineSet = new Set(fullTimeline);
        for (const ts of apiTimestamps) {
          if (!timelineSet.has(ts)) fullTimeline.push(ts);
        }
        // Trim timeline to last real data point — no empty space on the right
        const lastDataTs = apiTimestamps.length ? apiTimestamps[apiTimestamps.length - 1] : null;
        let allTimestamps = fullTimeline.sort();
        if (lastDataTs) {
          allTimestamps = allTimestamps.filter(ts => ts <= lastDataTs);
        }

        // Per-KPI chart type helpers
        const getKpiChartType = (kpiId: string): ChartType => cfg.chartTypePerKpi?.[kpiId] || cfg.chartType;
        const getSeriesProps = (kpiId: string) => {
          const ct = getKpiChartType(kpiId);
          const stacked = ct === 'stacked_bar' || ct === 'stacked_area';
          const sType = ct === 'scatter' ? 'scatter' : (ct === 'bar' || ct === 'stacked_bar') ? 'bar' : 'line';
          const smooth = cfg.smooth !== undefined ? cfg.smooth : (ct === 'line' || ct === 'area' || ct === 'stacked_area');
          const symbols = ct === 'line_points' || ct === 'scatter';
          const showArea = sType === 'line' && (cfg.showArea || ct === 'area' || ct === 'stacked_area');
          const isModernArea = ct === 'stacked_area' || ct === 'area';
          return { seriesType: sType, isSmooth: smooth, forceSymbols: symbols, isStacked: stacked, showArea, isModernArea };
        };
        // Grafana / Datadog-inspired gradient fill + soft glow for area & stacked area
        const buildModernAreaStyle = (color: string, modern: boolean) => modern ? ({
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}B3` },
              { offset: 0.55, color: `${color}4D` },
              { offset: 1, color: `${color}05` },
            ],
          },
          shadowBlur: 14,
          shadowColor: `${color}55`,
          opacity: 0.95,
          origin: 'start' as const,
        }) : ({
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}66` },
              { offset: 1, color: `${color}08` },
            ],
          },
        });
        const buildModernLineStyle = (color: string, width: number, modern: boolean) => modern ? ({
          width: Math.max(width, 2),
          color,
          shadowBlur: 8,
          shadowColor: `${color}99`,
          shadowOffsetY: 1,
          cap: 'round' as const,
          join: 'round' as const,
        }) : ({ width, color });
        // Force markers on when a line series has ≤ 1 real value, otherwise a
        // lone point is invisible (no segment to draw between two nulls).
        const hasSinglePoint = (vals: (number | null)[]) =>
          vals.filter(v => v != null && !Number.isNaN(v as number)).length <= 1;

        const buildNullPointSeries = (baseSeries: any, values: (number | null)[], axisIndex = 0) => {
          const nullIndexes = values.reduce<number[]>((acc, v, idx) => {
            if (v == null || Number.isNaN(v as number)) acc.push(idx);
            return acc;
          }, []);
          if (nullIndexes.length === 0) return null;
          return {
            name: `${baseSeries.name} · NULL`,
            _kpiId: baseSeries._kpiId,
            _isNullSeries: true,
            _nullCount: nullIndexes.length,
            _baseSeriesName: baseSeries.name,
            type: 'scatter' as const,
            xAxisIndex: 0,
            data: values.map((v) => (v == null || Number.isNaN(v as number)) ? 0 : null),
            symbol: 'circle' as const,
            symbolSize: 10,
            itemStyle: {
              color: PH_COLORS.nullPoint,
              borderColor: PH_COLORS.nullPointBorder,
              borderWidth: 1.5,
              opacity: 0.95,
              shadowBlur: 4,
              shadowColor: 'rgba(220,38,38,0.45)',
            },
            emphasis: { scale: 1.5 },
            yAxisIndex: axisIndex,
            z: 20,
            zlevel: 1,
            silent: false,
            tooltip: { show: true },
          };
        };

        let series: any[];

        if (hasSplitData) {
          series = kpiIds.flatMap((kpiId, ki) => {
            const def = defs[ki];
            const kpiHasSplit = getKpiHasSplit(kpiId);
            const kpiData = normalizedData.filter(d => matchesKpi(d.kpi, kpiId));

            if (!kpiHasSplit) {
              // Non-split KPI: single aggregated series
              const color = colorAlloc.forKpi(kpiId);
              const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const sp = getSeriesProps(kpiId);
              const forceMarkers = sp.forceSymbols || cfg.showSymbols || hasSinglePoint(values);
              return [{
                name: def.label,
                _kpiId: kpiId,
                _splitValue: undefined,
                _splitValue2: undefined,
                _networkElement: undefined,
                connectNulls: false,
                type: sp.seriesType as any,
                data: values,
                smooth: sp.isSmooth,
                symbol: forceMarkers ? 'circle' : 'none',
                symbolSize: forceMarkers ? 5 : 0,
                lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: sp.isStacked ? 'total' : undefined,
                areaStyle: sp.showArea ? buildModernAreaStyle(color, sp.isModernArea) : undefined,
              }];
            }

            // Detect double split data for this KPI
            const hasDouble = kpiData.some(d => d.splitValue2);

            if (hasDouble) {
              // Double split: one series per (splitValue, splitValue2) combination
              const combos = new Map<string, { sv1: string; sv2: string }>();
              for (const d of kpiData) {
                const sv1 = d.splitValue || 'N/A';
                const sv2 = d.splitValue2 || 'N/A';
                const key = `${sv1}@${sv2}`;
                if (!combos.has(key)) combos.set(key, { sv1, sv2 });
              }
              return Array.from(combos.entries()).map(([comboKey, { sv1, sv2 }]) => {
                const color = colorAlloc.forSplit(comboKey, kpiId);
                const comboData = kpiData.filter(d => (d.splitValue || 'N/A') === sv1 && (d.splitValue2 || 'N/A') === sv2);
                const dataMap = new Map(comboData.map(d => [d.timestamp, d.value]));
                const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const seriesName = kpiIds.length > 1
                  ? `${sv1} / ${sv2}_${def.label}`
                  : `${sv1} / ${sv2}_${def.label}`;
                const ne = comboData.find(d => d.networkElement)?.networkElement;
                const sp = getSeriesProps(kpiId);
                const forceMarkers = sp.forceSymbols || cfg.showSymbols || hasSinglePoint(values);
                return {
                  name: seriesName,
                  _kpiId: kpiId,
                  _splitValue: sv1,
                  _splitValue2: sv2,
                  _networkElement: ne,
                  connectNulls: false,
                  type: sp.seriesType as any,
                  data: values,
                  smooth: sp.isSmooth,
                  symbol: forceMarkers ? 'circle' : 'none',
                  symbolSize: forceMarkers ? 5 : 0,
                  lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                  itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                  barMaxWidth: 20,
                  stack: sp.isStacked ? 'total' : undefined,
                  areaStyle: sp.showArea ? buildModernAreaStyle(color, sp.isModernArea) : undefined,
                };
              });
            }

            // Single split KPI: one series per split value — stable colors per dimension value
            const splitValues = [...new Set(kpiData.map(d => d.splitValue!))].sort();
            return splitValues.map((sv) => {
              const color = colorAlloc.forSplit(sv, kpiId);
              const svData = kpiData.filter(d => d.splitValue === sv);
              const dataMap = new Map(svData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const ne = svData.find(d => d.networkElement)?.networkElement;
              const neName = ne || sv || 'N/A';
              const seriesName = `${neName}_${def.label}`;

              const sp = getSeriesProps(kpiId);
              const forceMarkers = sp.forceSymbols || cfg.showSymbols || hasSinglePoint(values);
              return {
                name: seriesName,
                _kpiId: kpiId,
                _splitValue: sv,
                _splitValue2: undefined,
                _networkElement: ne,
                connectNulls: false,
                type: sp.seriesType as any,
                data: values,
                smooth: sp.isSmooth,
                symbol: forceMarkers ? 'circle' : 'none',
                symbolSize: forceMarkers ? 5 : 0,
                lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: sp.isStacked ? 'total' : undefined,
                areaStyle: sp.showArea ? buildModernAreaStyle(color, sp.isModernArea) : undefined,
              };
            });
          });
        } else {
          // No split — one series per KPI (original logic)
          series = kpiIds.map((kpiId, i) => {
            const def = defs[i];
            const kpiData = normalizedData.filter(d => matchesKpi(d.kpi, kpiId));
            const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
            const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);

            const sp = getSeriesProps(kpiId);
            const forceMarkers = sp.forceSymbols || cfg.showSymbols || hasSinglePoint(values);
            return {
              name: def.label,
              _kpiId: kpiId,
              _splitValue: undefined,
              _splitValue2: undefined,
              _networkElement: undefined,
              connectNulls: false,
              type: sp.seriesType as any,
              data: values,
              smooth: sp.isSmooth,
              symbol: forceMarkers ? 'circle' : 'none',
              symbolSize: forceMarkers ? 5 : 0,
              lineStyle: sp.seriesType === 'line' ? buildModernLineStyle(def.color, cfg.lineWidth, sp.isModernArea && sp.showArea) : undefined,
              itemStyle: { color: def.color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
              barMaxWidth: 20,
              stack: sp.isStacked ? 'total' : undefined,
              areaStyle: sp.showArea ? buildModernAreaStyle(def.color, sp.isModernArea) : undefined,
            };
          });
        }

        // ── Merge counter series into the chart ──
        const slotCounterData = counterDataMap[slot.id];
        if (counterIds.length > 0 && slotCounterData && slotCounterData.series.length > 0) {
          const cSeries = slotCounterData.series;
          const cNameMap = slotCounterData.nameMap;
          // Add counter timestamps to allTimestamps
          const cTimestamps = [...new Set(cSeries.map(d => d.ts))].sort();
          const tsSet = new Set(allTimestamps);
          for (const ts of cTimestamps) {
            if (!tsSet.has(ts)) { allTimestamps.push(ts); tsSet.add(ts); }
          }
          allTimestamps.sort();

          // Build unique series: backend returns split data with counter="name@dimKey"
          // and dimension_key="dimKey", so unique counters already cover splits.
          const cCounters = [...new Set(cSeries.map(d => d.counter))];
          cCounters.forEach((counter) => {
            // For split series like "L.CELL.AVAIL.DUR@CELL_K1_L8", extract base + dim
            const sample = cSeries.find(d => d.counter === counter);
            const dimKey = sample?.dimension_key || '';
            const baseCounter = sample?.counter_id || counter.split('@')[0];
            const cDef = counterCatalog.find(c => c.counter_name === baseCounter);
            const baseName = cDef?.display_name || cNameMap[baseCounter] || baseCounter;
            const label = dimKey ? `${baseName} [${dimKey}]` : (cDef?.display_name ? `${baseName} (${baseCounter})` : (cNameMap[baseCounter] ? `${cNameMap[baseCounter]} (${baseCounter})` : counter));
            const color = colorAlloc.forCounter(counter);

            const counterData = allTimestamps.map(ts => {
              const p = cSeries.find(d => d.ts === ts && d.counter === counter);
              return p ? p.value : null;
            });
            const forceMarkers = cfg.showSymbols || hasSinglePoint(counterData);

            const sp = getSeriesProps(baseCounter);
            const fm = sp.forceSymbols || forceMarkers;
            series.push({
              name: label,
              _kpiId: `counter_${counter}`,
              _isCounter: true,
              connectNulls: false,
              type: sp.seriesType as any,
              data: counterData,
              smooth: sp.isSmooth,
              symbol: fm ? 'circle' : 'none',
              symbolSize: fm ? 5 : 0,
              lineStyle: sp.seriesType === 'line'
                ? buildModernLineStyle(color, cfg.lineWidth || 2.5, sp.isModernArea && sp.showArea)
                : undefined,
              itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
              barMaxWidth: 20,
              stack: sp.isStacked ? 'total_counters' : undefined,
              areaStyle: sp.showArea ? buildModernAreaStyle(color, sp.isModernArea) : undefined,
              // yAxisIndex will be set later based on hasRightAxis
              yAxisIndex: 1,
            });
          });
        }
        // Force right Y-axis if counters are present
        let hasCounterSeries = counterIds.length > 0 && slotCounterData && slotCounterData.series.length > 0;

        // ── Also render counters from tsData (selectedCounters flow) ──
        if (counterDataFromTs.length > 0) {
          const tsCounterNames = [...new Set(counterDataFromTs.map((d: any) => d.kpi))];
          // Avoid duplicating if already rendered via counterIds flow
          const alreadyRendered = new Set<string>();
          if (counterIds.length > 0 && slotCounterData) {
            for (const d of slotCounterData.series) {
              alreadyRendered.add(d.counter);
              // Also mark the base name (without split suffix) as rendered
              const base = d.counter_id || d.counter.split('@')[0];
              alreadyRendered.add(base);
            }
          }
          // Also skip counters already in series array
          for (const s of series) {
            if ((s as any)._isCounter && (s as any)._kpiId) {
              alreadyRendered.add((s as any)._kpiId.replace('counter_', ''));
            }
          }
          for (const counterName of tsCounterNames) {
            if (alreadyRendered.has(counterName)) continue;
            const baseCounter = counterName.includes('@') ? counterName.split('@')[0] : counterName;
            if (alreadyRendered.has(baseCounter)) continue;
            const splitLabel = counterName.includes('@') ? counterName.split('@').slice(1).join('@') : '';
            const color = splitLabel ? colorAlloc.forSplit(splitLabel, baseCounter) : colorAlloc.forCounter(baseCounter);
            const counterPoints = counterDataFromTs.filter((d: any) => d.kpi === counterName);
            const counterData = allTimestamps.map(ts => {
              const p = counterPoints.find((d: any) => d.timestamp === ts);
              return p ? p.value : null;
            });
            const displayName = splitLabel ? `${baseCounter} [${splitLabel}]` : counterName;
            const forceMarkers = cfg.showSymbols || counterData.filter(v => v != null).length <= 2;
            const sp = getSeriesProps(baseCounter);
            series.push({
              name: displayName,
              _kpiId: `counter_${counterName}`,
              _isCounter: true,
              _splitValue: splitLabel || undefined,
              connectNulls: false,
              type: sp.seriesType as any,
              data: counterData,
              smooth: sp.isSmooth,
              symbol: forceMarkers || sp.forceSymbols ? 'circle' : 'none',
              symbolSize: forceMarkers || sp.forceSymbols ? 6 : 0,
              lineStyle: sp.seriesType === 'line'
                ? buildModernLineStyle(color, cfg.lineWidth || 2.5, sp.isModernArea && sp.showArea)
                : undefined,
              itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
              barMaxWidth: 20,
              stack: sp.isStacked ? 'total_counters' : undefined,
              areaStyle: sp.showArea ? buildModernAreaStyle(color, sp.isModernArea) : undefined,
              yAxisIndex: series.length > 1 ? 1 : 0,
            });
            hasCounterSeries = true;
          }
        }

        // ── Jalons rendering ──
        // - Single date  → vertical markLine
        // - Date range   → markArea band + 2 boundary markLines
        // Edge cases: ignore if start > end; clip is handled implicitly by chart
        const showJalons = investigatorState.showJalons !== false;
        const visibleJalons = showJalons ? jalons : [];

        const snapToTimeline = (iso: string): string => {
          const norm = normalizeTimestamp(iso, slotGranularity);
          if (allTimestamps.includes(norm) || allTimestamps.length === 0) return norm;
          const t = new Date(iso).getTime();
          let closest = allTimestamps[0];
          let closestDiff = Math.abs(new Date(closest).getTime() - t);
          for (const ts of allTimestamps) {
            const diff = Math.abs(new Date(ts).getTime() - t);
            if (diff < closestDiff) { closest = ts; closestDiff = diff; }
          }
          return closest;
        };

        const jalonMarkLineData: any[] = [];
        const jalonMarkAreaData: any[][] = [];

        for (const j of visibleJalons) {
          const hasRange = !!j.endDate && j.endDate !== j.date;
          if (hasRange) {
            // Edge case: invalid order
            if (new Date(j.endDate!).getTime() < new Date(j.date).getTime()) continue;
            const xStart = snapToTimeline(j.date);
            const xEnd = snapToTimeline(j.endDate!);
            const opacity = j.opacity ?? 0.15;
            // Shaded band
            jalonMarkAreaData.push([
              {
                xAxis: xStart,
                name: j.label,
                itemStyle: {
                  color: j.color,
                  opacity: Math.min(0.25, Math.max(0.08, opacity * 0.25)),
                  borderColor: j.color,
                  borderWidth: 0,
                },
                label: {
                  show: true,
                  position: 'insideTop' as const,
                  formatter: j.label,
                  fontSize: 9,
                  fontWeight: 'bold' as const,
                  color: j.color,
                  distance: 4,
                },
              },
              { xAxis: xEnd },
            ]);
            // Boundary lines
            jalonMarkLineData.push({
              xAxis: xStart,
              label: { show: false },
              lineStyle: { color: j.color, width: 1.2, type: 'solid' as const, opacity: 0.7 },
            });
            jalonMarkLineData.push({
              xAxis: xEnd,
              label: { show: false },
              lineStyle: { color: j.color, width: 1.2, type: 'solid' as const, opacity: 0.7 },
            });
          } else {
            // Single date → vertical dashed line with label
            jalonMarkLineData.push({
              xAxis: snapToTimeline(j.date),
              label: {
                show: true,
                formatter: j.label,
                fontSize: 9,
                fontWeight: 'bold' as const,
                color: j.color,
                position: 'insideEndTop' as const,
              },
              lineStyle: { color: j.color, width: 2, type: 'dashed' as const },
            });
          }
        }

        const markLineData = jalonMarkLineData;

        // Weekend highlighting — granularity-aware (skip weekly+, single-day for daily,
        // contiguous bands for sub-daily). Honors per-slot showWeekend toggle (default ON).
        const weekendMarkAreaData = (cfg.showWeekend !== false)
          ? buildWeekendMarkAreas(allTimestamps, slotGranularity)
          : [];

        // Combine weekend + jalon areas (jalons rendered above weekends)
        const markAreaData = [...weekendMarkAreaData, ...jalonMarkAreaData];

        // Smart x-axis interval
        const xInterval = smartXInterval(allTimestamps.length);

        // Determine if we need a right Y-axis
        const yAxisAssignments = cfg.yAxisAssignments || {};

        // Fallback behavior:
        // - if counters exist => keep counters on right axis
        // - if no explicit KPI assignment and there are 2+ KPIs => put first KPI on left, second on right
        const effectiveYAxisAssignments: Record<string, 0 | 1> =
          Object.keys(yAxisAssignments).length > 0
            ? (yAxisAssignments as Record<string, 0 | 1>)
            : kpiIds.reduce((acc, kpiId, index) => {
                acc[kpiId] = index === 1 ? 1 : 0;
                return acc;
              }, {} as Record<string, 0 | 1>);

        // Only show right axis when KPIs are explicitly assigned to it,
        // or when we have BOTH KPI series and counter series (different scales)
        const hasExplicitRight = Object.values(effectiveYAxisAssignments).includes(1);
        const hasKpiSeries = series.some((s: any) => !s._isCounter && !s._isNullSeries);
        const hasRightAxis = hasExplicitRight || (!!hasCounterSeries && hasKpiSeries);

        const baseSeries = series;
        series = baseSeries.flatMap((s: any) => {
          const seriesKpiId = s._kpiId || kpiIds[0];
          const assignedAxis = hasRightAxis
            ? (effectiveYAxisAssignments[seriesKpiId] === 1 ? 1 : (s.yAxisIndex != null ? s.yAxisIndex : 0))
            : 0;
          return [s];
        });

        // ── Auto Y-axis calculation ──
        const computeAutoRange = (seriesArr: any[], axisIdx: number) => {
          const vals: number[] = [];

          seriesArr.forEach((s) => {
            if (s._isNullSeries) return;
            // Explicit axis on the series itself (used by counters)
            if (s.yAxisIndex != null) {
              if (s.yAxisIndex !== axisIdx) return;
            } else {
              const sKpiId = s._kpiId || kpiIds[0];
              const assignedAxis = hasRightAxis
                ? (effectiveYAxisAssignments[sKpiId] === 1 ? 1 : 0)
                : 0;

              if (assignedAxis !== axisIdx) return;
            }

            (s.data || []).forEach((v: any) => {
              if (typeof v === 'number' && !Number.isNaN(v)) {
                vals.push(v);
              }
            });
          });

          if (vals.length === 0) return { min: undefined, max: undefined };

          const rawMin = Math.min(...vals);
          const rawMax = Math.max(...vals);
          const range = rawMax - rawMin;
          const padding = range === 0 ? Math.abs(rawMax || 1) * 0.02 : range * 0.1;

          // KPIs/counters are inherently non-negative — clamp min to 0 when all values ≥ 0
          const paddedMin = rawMin - padding;
          const safeMin = rawMin >= 0 ? Math.max(0, paddedMin) : paddedMin;

          return {
            min: parseFloat(safeMin.toFixed(4)),
            max: parseFloat((rawMax + padding).toFixed(4)),
          };
        };

        const autoLeft = computeAutoRange(series, 0);
        const autoRight = hasRightAxis ? computeAutoRange(series, 1) : { min: undefined, max: undefined };

        series = series.map((s: any) => {
          if (!s._isNullSeries) return s;
          const range = s.yAxisIndex === 1 ? autoRight : autoLeft;
          const minV = typeof range.min === 'number' ? range.min : 0;
          const maxV = typeof range.max === 'number' ? range.max : (minV + 1);
          // Lift baseline ~3% above axis floor so markers are not clipped by the x-axis line
          const baseline = minV + (maxV - minV) * 0.03;
          return { ...s, data: (s.data || []).map((v: any) => v == null ? null : baseline) };
        });

        // Determine which axis owns the grid: prefer left, fall back to right
        // when no series live on the left (otherwise grid lines disappear when
        // the user moves every KPI to the right axis).
        const leftHasData = autoLeft.min != null && autoLeft.max != null;
        const gridOwnerIsRight = hasRightAxis && !leftHasData;

        const buildSplitLine = (active: boolean) => {
          if (!active) return { show: false };
          const baseAlpha = 0.08;
          const maxAlpha = 0.5;
          const op = Math.max(0, Math.min(100, cfg.gridOpacity ?? 50));
          const alpha = baseAlpha + (maxAlpha - baseAlpha) * op / 100;
          // Default to true so empty/loading charts still display the grid.
          const show = cfg.showGrid !== false;
          return {
            show,
            lineStyle: { color: `rgba(15,23,42,${alpha.toFixed(3)})`, type: 'dashed' as const },
          };
        };

        // Build yAxis array (always left; optionally right)
        // Fallback range for empty/loading charts so grid still renders.
        const fallbackMin = 0;
        const fallbackMax = 1;
        const yAxisLeft = {
          type: 'value' as const,
          position: 'left' as const,
          min: cfg.yAxis?.mode === 'manual' && cfg.yAxis.min != null ? cfg.yAxis.min : (autoLeft.min ?? fallbackMin),
          max: cfg.yAxis?.mode === 'manual' && cfg.yAxis.max != null ? cfg.yAxis.max : (autoLeft.max ?? fallbackMax),
          axisLabel: {
            fontSize: 10,
            color: '#a1a1aa',
            formatter: (v: number) => `${v.toFixed(1)}`,
            margin: 14,
          },
          splitLine: buildSplitLine(!gridOwnerIsRight),
          axisLine: { show: true, lineStyle: { color: 'rgba(15,23,42,0.15)' } },
          axisTick: { show: true },
        };

        const yAxisRightCfg = cfg.yAxisRight;
        const yAxisRight = {
          type: 'value' as const,
          position: 'right' as const,
          min: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.min != null ? yAxisRightCfg.min : autoRight.min,
          max: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.max != null ? yAxisRightCfg.max : autoRight.max,
          axisLabel: {
            fontSize: 9,
            color: '#9ca3af',
            formatter: (v: number) => `${v.toFixed(1)}`,
            margin: 14,
          },
          splitLine: buildSplitLine(gridOwnerIsRight),
          axisLine: { show: true, lineStyle: { color: 'rgba(15,23,42,0.15)' } },
          axisTick: { show: true },
        };

        const yAxisArr = hasRightAxis ? [yAxisLeft, yAxisRight] : [yAxisLeft];

        const getYAxisIndex = (kpiId: string) =>
          effectiveYAxisAssignments[kpiId] === 1 ? 1 : 0;

        // dataZoom slider height
        const sliderHeight = 22;
        const sliderBottomMargin = 30;
        // Legend: cap at 2 rows and let ECharts paginate the rest with arrows.
        // This guarantees the chart area is never crushed by long legends.
        const legendItemsCount = Array.isArray(series) ? series.length : 0;
        const MAX_LEGEND_ROWS = 2;
        const legendRows = Math.min(MAX_LEGEND_ROWS, Math.max(1, Math.ceil(legendItemsCount / 5)));
        const legendHeight = 22 + (legendRows - 1) * 20;
        // Spacing system between slider and legend (Grafana / Datadog inspired).
        const LEGEND_TOP_GAP = 20;
        const LEGEND_BOTTOM_PAD = 8;

        const option: any = {
          animation: false,
          toolbox: { show: false },
          grid: {
            top: 16,
            right: hasRightAxis ? 62 : 28,
            bottom: legendHeight + sliderHeight + LEGEND_TOP_GAP + LEGEND_BOTTOM_PAD + 8,
            left: 62,
            containLabel: false,
          },
          dataZoom: [
            {
              type: 'inside' as const,
              xAxisIndex: 0,
              filterMode: 'none' as const,
              start: cfg.zoomWindow?.start,
              end: cfg.zoomWindow?.end,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: false,
              moveOnMouseMove: true,
            },
            {
              type: 'slider' as const,
              xAxisIndex: 0,
              height: sliderHeight,
              bottom: legendHeight + LEGEND_TOP_GAP + LEGEND_BOTTOM_PAD,
              filterMode: 'none' as const,
              start: cfg.zoomWindow?.start,
              end: cfg.zoomWindow?.end,
              borderColor: 'rgba(14,124,102,0.18)',
              backgroundColor: 'rgba(14,124,102,0.04)',
              fillerColor: 'rgba(20,184,166,0.18)',
              handleSize: '120%',
              handleStyle: { color: PH_COLORS.tealDark, borderColor: PH_COLORS.tealDark, borderWidth: 1 },
              moveHandleSize: 6,
              textStyle: { fontSize: 9, color: PH_COLORS.labelSubtle },
              dataBackground: {
                lineStyle: { color: 'rgba(14,124,102,0.3)' },
                areaStyle: { color: 'rgba(14,124,102,0.08)' },
              },
              selectedDataBackground: {
                lineStyle: { color: 'rgba(14,124,102,0.5)' },
                areaStyle: { color: 'rgba(20,184,166,0.18)' },
              },
              brushSelect: false,
            },
          ],
          // Subtle separator line between chart/slider and legend.
          graphic: [
            {
              type: 'line' as const,
              left: 'center',
              bottom: legendHeight + LEGEND_BOTTOM_PAD + 4,
              z: 0,
              shape: { x1: 0, y1: 0, x2: 10000, y2: 0 },
              style: { stroke: 'rgba(15, 23, 42, 0.06)', lineWidth: 1 },
              silent: true,
            },
          ],
          legend: {
            show: true,
            data: series.filter((s: any) => !s._isNullSeries).map((s: any) => s.name),
            bottom: LEGEND_BOTTOM_PAD,
            left: 12,
            right: 12,
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 4,
            itemGap: 18,
            // Scroll legend: paginates with arrows when items overflow,
            // never overlaps the chart area.
            type: 'scroll' as const,
            pageButtonItemGap: 4,
            pageButtonGap: 8,
            pageIconSize: 10,
            pageIconColor: PH_COLORS.tealDark,
            pageIconInactiveColor: '#cbd5e1',
            pageTextStyle: { fontSize: 9, color: PH_COLORS.labelMuted },
            align: 'left' as const,
            textStyle: {
              fontSize: 11,
              fontWeight: 500,
              color: PH_COLORS.labelMuted,
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: [0, 4, 0, 4],
            },
            tooltip: { show: true },
          },
          backgroundColor: '#ffffff',
          tooltip: {
            ...phTooltip(),
            formatter: (params: any) => {
              const items = Array.isArray(params) ? params : [params];
              if (items.length === 0) return '';
              const dt = new Date(items[0].axisValue);
              const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
              const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
              const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              const isWE = dt.getDay() === 0 || dt.getDay() === 6;
              const weBadge = isWE ? ` <span style="background:rgba(14,124,102,0.1);padding:1px 5px;border-radius:3px;font-size:9px;color:${PH_COLORS.tealDark}">WE</span>` : '';
              const header = `<div style="font-size:11px;font-weight:600;color:${PH_COLORS.tealDark};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid ${PH_COLORS.splitLine};padding-bottom:5px">${dayName} ${dateStr} · ${timeStr}${weBadge}</div>`;

              // Group items: detect split series for total row
              // Also show split/NE details in tooltip
              const rows: string[] = [];
              let splitTotal = 0;
              let splitCount = 0;
              let splitUnit = '';
              for (const p of items) {
                if ((p as any).seriesName?.endsWith(' · NULL')) {
                  continue;
                }
                const matchedDef = defs.find(d => d.label === p.seriesName || p.seriesName?.startsWith(d.label + ' — '));
                const unit = matchedDef?.unit || '';
                if (p.value == null) continue;
                const val = p.value.toFixed(2);
                const isSplit = p.seriesName?.includes(' — ') || p.seriesName?.includes(' / ') || (hasSplitData && items.length > 1 && !p.seriesName?.includes('('));
                if (isSplit && p.value != null) { splitTotal += p.value; splitCount++; splitUnit = unit; }
                // Find matching series metadata for NE info
                const matchedSeries = option.series?.find((s: any) => s.name === p.seriesName);
                const neInfo = matchedSeries?._networkElement ? ` <span style="font-size:9px;color:${PH_COLORS.labelSubtle};background:${PH_COLORS.splitLine};padding:1px 4px;border-radius:3px;margin-left:4px">NE: ${matchedSeries._networkElement}</span>` : '';
                rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:${PH_COLORS.labelMuted};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">${p.seriesName}${neInfo}</span><b style="color:${PH_COLORS.labelStrong}">${val} ${unit}</b></div>`);
              }
              // Add total row for split series
              const totalRow = splitCount > 1
                ? `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;margin-top:2px;border-top:1px solid ${PH_COLORS.splitLine}"><span style="width:12px;height:3px;border-radius:2px;background:${PH_COLORS.tealDark};display:inline-block"></span><span style="flex:1;color:${PH_COLORS.labelMuted};font-weight:600">Total</span><b style="color:${PH_COLORS.labelStrong}">${splitTotal.toFixed(2)} ${splitUnit}</b></div>`
                : '';
              return header + rows.join('') + totalRow;
            },
          },
          xAxis: {
            type: 'category' as const,
            data: allTimestamps,
            axisLabel: {
              formatter: (v: string) => formatAxisLabel(v, slotGranularity),
              fontSize: 11,
              color: PH_COLORS.labelMuted,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: 14,
              rotate: 0,
              interval: xInterval,
              lineHeight: 16,
            },
            axisLine: { lineStyle: { color: PH_COLORS.axisLine } },
            axisTick: { show: false },
            splitLine: { show: false },
          },
          yAxis: yAxisArr,
          series: series.map((s, i) => {
            const seriesKpiId = s._kpiId || kpiIds[0];

            // Build average markLine for this series if showAverage is enabled
            const avgMarkLine = cfg.showAverage ? (() => {
              const nums = (s.data as (number | null | undefined)[]).filter((v): v is number => v != null && typeof v === 'number' && isFinite(v));
              if (nums.length === 0 || s._isNullSeries) return undefined;
              const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
              return {
                yAxis: avg,
                label: { formatter: `Avg: ${avg.toFixed(2)}`, fontSize: 9, color: s.itemStyle?.color || '#888' },
                lineStyle: { type: 'dashed' as const, color: s.itemStyle?.color || '#888', width: 1.5 },
              };
            })() : undefined;

            // Build threshold markLines (warning + critical) for this series
            const thresholdMarkLines: any[] = [];
            if (cfg.showThresholds && !s._isNullSeries) {
              const def = getDef(seriesKpiId);
              if (def?.thresholds) {
                if (def.thresholds.warning != null) {
                  thresholdMarkLines.push({
                    yAxis: def.thresholds.warning,
                    label: { formatter: `⚠ ${def.thresholds.warning}`, fontSize: 8, color: '#f59e0b', position: 'insideEndTop' },
                    lineStyle: { type: 'dashed' as const, color: '#f59e0b', width: 1.2 },
                  });
                }
                if (def.thresholds.critical != null) {
                  thresholdMarkLines.push({
                    yAxis: def.thresholds.critical,
                    label: { formatter: `🔴 ${def.thresholds.critical}`, fontSize: 8, color: '#ef4444', position: 'insideEndTop' },
                    lineStyle: { type: 'dashed' as const, color: '#ef4444', width: 1.2 },
                  });
                }
              }
            }

            // Merge jalon markLines (only on first series) with per-series average + threshold markLines
            const combinedMarkLineData = [
              ...(i === 0 ? markLineData : []),
              ...(avgMarkLine ? [avgMarkLine] : []),
              ...thresholdMarkLines,
            ];

            // ── Axis resolution ──
            // Explicit user assignment (from L/R toggle) ALWAYS wins, even when
            // the series was created with a pre-baked yAxisIndex (counters / split series).
            // Falls back to the series' own hint, then to left (0).
            const userAssigned = effectiveYAxisAssignments[seriesKpiId];
            const resolvedAxisIdx = hasRightAxis
              ? (userAssigned != null ? userAssigned : (s.yAxisIndex != null ? s.yAxisIndex : 0))
              : 0;
            const isNullSeries = !!s._isNullSeries;

            return {
              ...s,
              yAxisIndex: resolvedAxisIdx,
              legendHoverLink: !isNullSeries,
              lineStyle: isNullSeries ? s.lineStyle : { ...(s.lineStyle || {}), width: s.lineStyle?.width || cfg.lineWidth || 2.5 },
              emphasis: isNullSeries ? s.emphasis : {
                focus: 'series' as const,
                blurScope: 'coordinateSystem' as const,
                lineStyle: { width: (s.lineStyle?.width || cfg.lineWidth || 2.5) + 1.5 },
              },
              markLine: combinedMarkLineData.length > 0 ? { silent: true, symbol: 'none', data: combinedMarkLineData } : undefined,
              ...(i === 0 ? {
                markArea: markAreaData.length > 0 ? { silent: true, data: markAreaData } : undefined,
              } : {}),
            };
          }),
        };

        const primaryDef = defs[0];

        return (
          <div
            key={slot.id}
            onMouseDown={(e) => {
              // Only activate slot on direct click on the card chrome, not on chart canvas
              const target = e.target as HTMLElement;
              if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
              onSlotClick?.(slot.id);
            }}
            className={cn(
              'rounded-2xl border bg-white px-6 pt-5 pb-4 group relative cursor-pointer transition-all duration-200',
              isActive
                ? 'border-[#14746C]/40 ring-1 ring-[#14746C]/15 shadow-[0_2px_4px_rgba(20,116,108,0.06),0_12px_28px_-12px_rgba(20,116,108,0.18)]'
                : 'border-slate-200/70 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.06)]'
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <input
                value={slot.name}
                onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-[13px] font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[160px] truncate"
              />
              <span className="ml-auto" />
              {isActive && (
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Active</span>
              )}




              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <SlotRequestButton slot={slot} />
              <SlotSettingsPopover slot={slot} cfg={cfg} onUpdateSlotConfig={onUpdateSlotConfig} onDuplicateSlot={onDuplicateSlot} onActivateTab={onActivateTab} chartRef={chartRefsMap.current[slot.id]} hasTableData={(series || []).some((s: any) => Array.isArray(s.data) && s.data.some((v: any) => v != null && (typeof v !== 'number' || isFinite(v))))} />
            </div>
            <div className="relative">
              {(fetchingSlots[slot.id] || (isApplying && slot.id === activeSlotId)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70 rounded-lg backdrop-blur-[2px] animate-in fade-in duration-150">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Chargement…</span>
                </div>
              )}
              <SlotChart
                ref={(el) => { chartRefsMap.current[slot.id] = el; }}
                key={`${slot.id}-${cfg.chartType}`}
                option={option}
                height={chartHeight}
                onDataZoom={(start, end) => {
                  if (cfg.zoomWindow?.start === start && cfg.zoomWindow?.end === end) return;
                  onUpdateSlotConfig(slot.id, { zoomWindow: { start, end } });
                }}
                onChartClick={() => onSlotClick?.(slot.id)}
              />
            </div>




          </div>
        );
      })}
      </div>
      {/* Widget type add menu */}
      {graphSlots.length < 8 && (
        <AddWidgetMenu onAdd={onAddEmptySlot} />
      )}

      {/* Counter Selector Modal */}
      <CounterSelectorModal
        open={!!counterSelectorSlotId}
        onClose={() => setCounterSelectorSlotId(null)}
        catalog={counterCatalog}
        selectedKeys={counterSelectorSlotId ? (graphSlots.find(s => s.id === counterSelectorSlotId)?.counterIds || []) : []}
        onConfirm={(keys) => {
          if (counterSelectorSlotId) {
            onSetSlotCounterIds(counterSelectorSlotId, keys);
          }
          setCounterSelectorSlotId(null);
        }}
        perimeterVendor={investigatorState?.filters?.['Vendor'] || []}
        perimeterTechno={investigatorState?.filters?.['Technology'] || []}
      />
    </div>
  );
};

export default KPIGraphs;
