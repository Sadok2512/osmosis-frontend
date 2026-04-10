import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, SplitOption, WidgetType, normalizeGranularity } from './types';
import { buildTimeline, normalizeTimestamp, formatAxisLabel, getStepMs, smartXInterval } from './timeUtils';
import CounterSelectorModal from './CounterSelectorModal';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { KPI_MAP, KPIS } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { cn } from '@/lib/utils';
import { Settings2, TrendingUp, AreaChart, BarChart, CircleDot, X, Plus, Layers, Hash, BarChart3, GitBranch, Activity, RefreshCw, Copy, Download } from 'lucide-react';
import BreakdownChart from './BreakdownChart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { fetchFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';

const WIDGET_TYPES: { value: WidgetType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'timeseries', label: 'Timeseries', icon: TrendingUp, color: 'text-blue-500' },
  { value: 'kpi_card', label: 'KPI Card', icon: Activity, color: 'text-emerald-500' },
  { value: 'histogram', label: 'Histogram', icon: BarChart3, color: 'text-purple-500' },
  { value: 'neighbors', label: 'Neighbors Flux', icon: GitBranch, color: 'text-cyan-500' },
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

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Smooth', icon: TrendingUp },
  { value: 'line_straight', label: 'Straight', icon: TrendingUp },
  { value: 'line_points', label: 'Points', icon: CircleDot },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_bar', label: 'Stacked', icon: Layers },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const SERIES_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'];

// Extended palette for split dimension values — 20 distinct colors
const SPLIT_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4',
  '#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6',
  '#f97316','#a855f7','#22d3ee','#4ade80','#fbbf24',
  '#fb7185','#2dd4bf','#818cf8','#facc15','#34d399',
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

/** Wrapper — full replace on every update so legend stays in sync */
const SlotChart = React.forwardRef<ReactECharts, { option: any; height: number; onDataZoom?: (start: number, end: number) => void }>(({ option, height, onDataZoom }, ref) => {
  const onDataZoomRef = React.useRef(onDataZoom);
  onDataZoomRef.current = onDataZoom;
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }), []);

  return (
    <div style={{ height, position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
      <ReactECharts
        ref={ref}
        option={option}
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
    import('./investigatorApi').then(({ fetchHistogramData }) => {
      kpiIds.forEach(kpiId => {
        fetchHistogramData(kpiId).then(bins => {
          setHistData(prev => ({ ...prev, [kpiId]: bins }));
        }).catch(() => {});
      });
    });
  }, [kpiIds]);

  return (
    <div className="space-y-2">
      {kpiIds.map(kpiId => {
        const def = KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId);
        const bins = histData[kpiId] || [];
        if (bins.length === 0) return <div key={kpiId} className="text-center text-[10px] text-muted-foreground py-8">Chargement histogram...</div>;
        const option = {
          grid: { top: 30, right: 20, bottom: 36, left: 50 },
          tooltip: { trigger: 'axis' as const, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f8fafc', fontSize: 11 } },
          xAxis: { type: 'category' as const, data: bins.map((b: any) => b.label), axisLabel: { fontSize: 8, color: '#9ca3af', rotate: 30 } },
          yAxis: { type: 'value' as const, name: 'Count', axisLabel: { fontSize: 9, color: '#9ca3af' }, splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)', type: 'dashed' as const } } },
          series: [{ type: 'bar' as const, data: bins.map((b: any) => b.count), itemStyle: { color: def?.color || '#6366f1', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 30 }],
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
    const body: any = { counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity: normalizeGranularity(state.granularity), split_by_dimension: false };
    if (siteName) body.site_name = siteName;
    fetch(getApiUrl('pm/counters/timeseries'), {
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
  const timestamps = [...new Set(tsData.map(d => d.ts))].sort();
  const displayLabel = (c: string) => {
    const id = Object.entries(nameMap).find(([, name]) => name === c)?.[0];
    return id ? `${c} (${id})` : c;
  };

  // Weekend highlighting
  const weekendAreas: { xAxis: string }[][] = [];
  let inWeekend = false;
  for (let ti = 0; ti < timestamps.length; ti++) {
    const day = new Date(timestamps[ti]).getDay();
    const isWE = day === 0 || day === 6;
    if (isWE && !inWeekend) {
      weekendAreas.push([{ xAxis: timestamps[ti] }, { xAxis: timestamps[ti] }]);
      inWeekend = true;
    } else if (isWE && inWeekend) {
      weekendAreas[weekendAreas.length - 1][1] = { xAxis: timestamps[ti] };
    } else {
      inWeekend = false;
    }
  }
  const markAreaData = weekendAreas.map(([start, end]) => [{
    xAxis: start.xAxis,
    itemStyle: { color: 'rgba(148,163,184,0.12)' },
  }, { xAxis: end.xAxis }]);

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

  const legendRows = counters.length > 4 ? 78 : counters.length > 2 ? 66 : 54;
  const sliderHeight = 22;

  const option = {
    animation: false,
    backgroundColor: '#ffffff',
    grid: {
      top: 32,
      right: 28,
      bottom: legendRows + sliderHeight + 20,
      left: 62,
      containLabel: false,
    },
    dataZoom: [
      { type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const },
      {
        type: 'slider' as const,
        xAxisIndex: 0,
        height: sliderHeight,
        bottom: legendRows - 12,
        filterMode: 'none' as const,
        borderColor: 'rgba(128,128,128,0.2)',
        backgroundColor: 'rgba(128,128,128,0.06)',
        fillerColor: 'rgba(99,102,241,0.15)',
        handleSize: '120%',
        handleStyle: { color: '#6366f1', borderColor: '#6366f1', borderWidth: 1 },
        moveHandleSize: 6,
        textStyle: { fontSize: 9, color: '#a1a1aa' },
        dataBackground: {
          lineStyle: { color: 'rgba(99,102,241,0.3)' },
          areaStyle: { color: 'rgba(99,102,241,0.08)' },
        },
        selectedDataBackground: {
          lineStyle: { color: 'rgba(99,102,241,0.5)' },
          areaStyle: { color: 'rgba(99,102,241,0.15)' },
        },
        brushSelect: false,
      },
    ],
    legend: {
      show: true,
      bottom: 4,
      icon: 'roundRect',
      itemWidth: 20,
      itemHeight: 5,
      itemGap: 18,
      type: 'scroll' as any,
      pageIconSize: 12,
      textStyle: { fontSize: 11, fontWeight: 500, color: '#4b5563', padding: [0, 0, 0, 4] },
      tooltip: { show: true },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.96)',
      borderColor: 'rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: '#f1f5f9', fontSize: 11.5 },
      axisPointer: {
        type: 'line' as const,
        lineStyle: { color: 'rgba(99,102,241,0.25)', width: 1, type: 'dashed' as const },
      },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        if (items.length === 0) return '';
        const dt = new Date(items[0].axisValue);
        const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
        const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
        const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const isWE = dt.getDay() === 0 || dt.getDay() === 6;
        const weBadge = isWE ? ' <span style="background:rgba(148,163,184,0.2);padding:1px 5px;border-radius:3px;font-size:9px;color:#94a3b8">WE</span>' : '';
        const header = `<div style="font-size:10.5px;color:#94a3b8;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:5px">${dayName} ${dateStr} · ${timeStr}${weBadge}</div>`;
        const rows = items.map((p: any) => {
          const val = p.value != null ? p.value.toFixed(2) : '—';
          return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:#cbd5e1">${p.seriesName}</span><b style="color:#f1f5f9">${val}</b></div>`;
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
        color: '#6b7280',
        margin: 16,
        rotate: 0,
        interval: xInterval,
        lineHeight: 16,
      },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      axisTick: { show: true, length: 4, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: yMin,
      max: yMax,
      axisLabel: { fontSize: 10, color: '#a1a1aa', formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(1), margin: 14 },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.10)', type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: counters.map((counter, ci) => {
      const color = stableColorForCounter(counter);
      return {
        name: displayLabel(counter),
        type: 'line' as const,
        smooth: true,
        connectNulls: true,
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


interface Props {
  graphSlots: GraphSlot[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
  jalons: Jalon[];
  onChangeSlotKpi: (slotId: string, kpiId: string) => void;
  onSetSlotKpiIds: (slotId: string, kpiIds: string[]) => void;
  onSetSlotCounterIds: (slotId: string, counterIds: string[]) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddEmptySlot: (widgetType?: import('./types').WidgetType) => void;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onRenameSlot: (slotId: string, name: string) => void;
  onOpenKpiSelector: (slotId: string) => void;
  onDuplicateSlot?: (slotId: string) => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
  isFullscreen?: boolean;
  onActivateTab?: (tab: 'table_data' | 'breakdown' | 'top_worst' | 'alarms' | 'neighbors' | 'cm_history' | null) => void;
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
  link.click();
};

const KPIGraphs: React.FC<Props> = ({ graphSlots: rawSlots, data, layout, jalons, onChangeSlotKpi, onSetSlotKpiIds, onSetSlotCounterIds, onRemoveSlot, onAddEmptySlot, onUpdateSlotConfig, onRenameSlot, onOpenKpiSelector, onDuplicateSlot, activeSlotId, onSlotClick, isFullscreen, onActivateTab }) => {
  // In fullscreen mode, show only the active slot
  const graphSlots = isFullscreen && activeSlotId ? rawSlots.filter(s => s.id === activeSlotId) : rawSlots;
  const cols = isFullscreen ? 1 : layout === 1 ? 1 : 2;
  const chartHeight = isFullscreen ? Math.max(window.innerHeight - 140, 600) : layout === 1 ? 520 : layout === 4 ? 340 : 400;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [counterCatalog, setCounterCatalog] = useState<{ counter_name: string; display_name: string; family: string; vendor: string; techno: string; object_type: string; count: number }[]>([]);
  const [counterSelectorSlotId, setCounterSelectorSlotId] = useState<string | null>(null);
  const chartRefsMap = useRef<Record<string, ReactECharts | null>>({});
  // Counter data per slot: { [slotId]: { series, nameMap } }
  const [counterDataMap, setCounterDataMap] = useState<Record<string, { series: { ts: string; counter: string; value: number }[]; nameMap: Record<string, string> }>>({});

  const { state: investigatorState } = useInvestigatorStore();
  const siteName = investigatorState.filters?.['Site']?.[0] || investigatorState.filters?.['SITE']?.[0] || null;

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
    fetch(getApiUrl('pm/counters/catalog'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setCounterCatalog(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch counter timeseries for all slots that have counterIds
  useEffect(() => {
    const slotsWithCounters = graphSlots.filter(s => s.counterIds && s.counterIds.length > 0);
    if (slotsWithCounters.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const dateFrom = investigatorState.startDate?.split('T')[0] || thirtyDaysAgo;
    const dateTo = investigatorState.endDate?.split('T')[0] || today;

    slotsWithCounters.forEach(slot => {
      const cIds = slot.counterIds!;
      const body: any = { counter_names: cIds, date_from: dateFrom, date_to: dateTo, granularity: normalizeGranularity(investigatorState.granularity), split_by_dimension: false };
      if (siteName) body.site_name = siteName;
      fetch(getApiUrl('pm/counters/timeseries'), {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(body),
      })
        .then(r => r.ok ? r.json() : { series: [], meta: {} })
        .then(data => {
          setCounterDataMap(prev => ({
            ...prev,
            [slot.id]: { series: data.series || [], nameMap: data.meta?.name_map || {} },
          }));
        })
        .catch(() => {});
    });
  }, [graphSlots.map(s => (s.counterIds || []).join(',')).join('|'), investigatorState.startDate, investigatorState.endDate, investigatorState.granularity, siteName]);

  const getDef = (kpiId: string) => KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId) || null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 ${isFullscreen ? 'grid-cols-1 w-full' : cols === 1 ? 'grid-cols-1 max-w-[1400px]' : 'grid-cols-1 md:grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const kpiIds = slot.kpiIds || [];
        const counterIds = slot.counterIds || [];
        const isEmpty = kpiIds.length === 0 && counterIds.length === 0;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const isActive = activeSlotId === slot.id;
        const wType = slot.widgetType || 'timeseries';
        const wtDef = WIDGET_TYPES.find(w => w.value === wType) || WIDGET_TYPES[0];

        // Empty slot — no KPI or counter assigned yet
        if (isEmpty) {
          return (
            <div
              key={slot.id}
              onClick={() => onSlotClick?.(slot.id)}
              className={cn(
                'rounded-xl border bg-card p-4 group relative cursor-pointer transition-all duration-300 flex flex-col',
                isActive
                  ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5'
                  : 'border-border/60 hover:border-border'
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
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
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
              'rounded-xl border bg-card p-4 relative cursor-pointer transition-all duration-300',
              isActive ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border/60 hover:border-border'
            )}>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500">Histogram</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
              <HistogramWidget kpiIds={kpiIds} height={chartHeight} allKpis={allKpis} />
            </div>
          );
        }

        if (wType === 'kpi_card') {
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-xl border bg-card p-4 relative cursor-pointer transition-all duration-300',
              isActive ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border/60 hover:border-border'
            )}>
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">KPI Card</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
              <KpiCardWidget
                kpiIds={kpiIds}
                data={data.filter((d: any) => d._slotId == null || d._slotId === slot.id)}
                allKpis={allKpis}
              />
            </div>
          );
        }



        if (wType === 'neighbors') {
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-xl border bg-card p-4 relative cursor-pointer transition-all duration-300',
              isActive ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border/60 hover:border-border'
            )}>
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <GitBranch className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500">Neighbors</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center justify-center" style={{ minHeight: chartHeight - 40 }}>
                <div className="text-center space-y-2">
                  <GitBranch className="w-10 h-10 text-cyan-500/30 mx-auto" />
                  <p className="text-xs text-muted-foreground">Neighbors Flux — analyse des relations inter-cellules</p>
                  <p className="text-[10px] text-muted-foreground/60">Sélectionnez une cellule dans le tableau Worst Elements</p>
                </div>
              </div>
            </div>
          );
        }

        // Multi-KPI: build series — detect split data
        const defs = kpiIds.map((id, i) => {
          const d = getDef(id);
          return d || { id, label: id, unit: '', color: stableColorForKpi(id), thresholds: { warning: 50, critical: 20 }, higherIsBetter: false };
        });

        // Filter data to only this slot's KPIs (handle split KPI ids like "kpi@splitLabel" or "kpi@split1@split2")
        // and keep slot isolation when Apply fetched multiple slots at once.
        const slotData = data.filter((d: any) => {
          const matchesSlot = d._slotId == null || d._slotId === slot.id;
          const matchesKpi = kpiIds.includes(d.kpi) || kpiIds.some(id => d.kpi.startsWith(id + '@'));
          return matchesSlot && matchesKpi;
        });

        // Per-KPI split detection — only split if user explicitly configured it
        const splitByPerKpi = cfg.splitByPerKpi || {};
        const splitByPerKpi2 = cfg.splitByPerKpi2 || {};
        const slotSplit = slot.splitBy && slot.splitBy !== 'None';
        const slotSplit2 = slot.splitBy2 && slot.splitBy2 !== 'None';
        const hasPerKpiSplit = kpiIds.some(id => {
          const p = splitByPerKpi[id];
          return p && p !== 'None';
        });
        const hasPerKpiSplit2 = kpiIds.some(id => {
          const p = splitByPerKpi2[id];
          return p && p !== 'None';
        });
        const hasSplit = slotSplit || hasPerKpiSplit;
        const hasDoubleSplit = (slotSplit && slotSplit2) || (hasPerKpiSplit && hasPerKpiSplit2);
        const getKpiHasSplit = (kpiId: string) => {
          if (slotSplit) return true;
          const perKpi = splitByPerKpi[kpiId];
          return perKpi != null && perKpi !== 'None';
        };

        // Filter data: if no split configured, aggregate (ignore splitValue)
        const hasSplitData = hasSplit && slotData.some(d => d.splitValue && d.splitValue !== 'ALL');
        const hasDoubleSplitData = hasDoubleSplit && slotData.some(d => d.splitValue2);
        const effectiveData = hasSplitData
          ? slotData.filter(d => d.splitValue && d.splitValue !== 'ALL')
          : slotData.map(d => ({ ...d, splitValue: undefined, splitValue2: undefined }));

        // Fix #3: Use slot's effective context (dates/granularity) instead of global state
        const globalState = useInvestigatorStore.getState().state;
        const slotStartDate = (slot.startDate && slot.startDate.trim()) || globalState.startDate;
        const slotEndDate = (slot.endDate && slot.endDate.trim()) || globalState.endDate;
        const slotGranularity = normalizeGranularity(slot.granularity || globalState.granularity);
        // Normalize all data point timestamps to match granularity format
        const normalizedData = effectiveData.map(d => ({ ...d, timestamp: normalizeTimestamp(d.timestamp, slotGranularity) }));
        const matchesKpi = (dKpi: string, kpiId: string) => dKpi === kpiId || dKpi.startsWith(kpiId + '@');
        const apiTimestamps = [...new Set(kpiIds.flatMap(id => normalizedData.filter(d => matchesKpi(d.kpi, id)).map(d => d.timestamp)))].sort();

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
          const stacked = ct === 'stacked_bar';
          const sType = ct === 'scatter' ? 'scatter' : (ct === 'bar' || stacked) ? 'bar' : 'line';
          const smooth = cfg.smooth !== undefined ? cfg.smooth : (ct === 'line' || ct === 'area');
          const symbols = ct === 'line_points' || ct === 'scatter';
          const showArea = sType === 'line' && (cfg.showArea || ct === 'area');
          return { seriesType: sType, isSmooth: smooth, forceSymbols: symbols, isStacked: stacked, showArea };
        };

        let series: any[];

        if (hasSplitData) {
          series = kpiIds.flatMap((kpiId, ki) => {
            const def = defs[ki];
            const kpiHasSplit = getKpiHasSplit(kpiId);
            const kpiData = normalizedData.filter(d => matchesKpi(d.kpi, kpiId));

            if (!kpiHasSplit) {
              // Non-split KPI: single aggregated series
              const color = stableColorForKpi(kpiId);
              const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const sp = getSeriesProps(kpiId);
              return [{
                name: def.label,
                _kpiId: kpiId,
                _splitValue: undefined,
                _splitValue2: undefined,
                _networkElement: undefined,
                connectNulls: true,
                type: sp.seriesType as any,
                data: values,
                smooth: sp.isSmooth,
                symbol: (sp.forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
                symbolSize: (sp.forceSymbols || cfg.showSymbols) ? 5 : 0,
                lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: sp.isStacked ? 'total' : undefined,
                areaStyle: sp.showArea ? {
                  color: {
                    type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: `${color}20` },
                      { offset: 1, color: `${color}02` },
                    ],
                  },
                } : undefined,
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
                const color = stableColorForSplit(comboKey);
                const comboData = kpiData.filter(d => (d.splitValue || 'N/A') === sv1 && (d.splitValue2 || 'N/A') === sv2);
                const dataMap = new Map(comboData.map(d => [d.timestamp, d.value]));
                const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const seriesName = kpiIds.length > 1
                  ? `${sv1} / ${sv2}_${def.label}`
                  : `${sv1} / ${sv2}_${def.label}`;
                const ne = comboData.find(d => d.networkElement)?.networkElement;
                const sp = getSeriesProps(kpiId);
                return {
                  name: seriesName,
                  _kpiId: kpiId,
                  _splitValue: sv1,
                  _splitValue2: sv2,
                  _networkElement: ne,
                  connectNulls: true,
                  type: sp.seriesType as any,
                  data: values,
                  smooth: sp.isSmooth,
                  symbol: (sp.forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
                  symbolSize: (sp.forceSymbols || cfg.showSymbols) ? 5 : 0,
                  lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                  itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                  barMaxWidth: 20,
                  stack: sp.isStacked ? 'total' : undefined,
                  areaStyle: sp.showArea ? {
                    color: {
                      type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                      colorStops: [
                        { offset: 0, color: `${color}20` },
                        { offset: 1, color: `${color}02` },
                      ],
                    },
                  } : undefined,
                };
              });
            }

            // Single split KPI: one series per split value — stable colors per dimension value
            const splitValues = [...new Set(kpiData.map(d => d.splitValue!))].sort();
            return splitValues.map((sv) => {
              const color = stableColorForSplit(sv, kpiId);
              const svData = kpiData.filter(d => d.splitValue === sv);
              const dataMap = new Map(svData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const ne = svData.find(d => d.networkElement)?.networkElement;
              const neName = ne || sv || 'N/A';
              const seriesName = `${neName}_${def.label}`;

              const sp = getSeriesProps(kpiId);
              return {
                name: seriesName,
                _kpiId: kpiId,
                _splitValue: sv,
                _splitValue2: undefined,
                _networkElement: ne,
                connectNulls: true,
                type: sp.seriesType as any,
                data: values,
                smooth: sp.isSmooth,
                symbol: (sp.forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
                symbolSize: (sp.forceSymbols || cfg.showSymbols) ? 5 : 0,
                lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: sp.isStacked ? 'total' : undefined,
                areaStyle: sp.showArea ? {
                  color: {
                    type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: `${color}20` },
                      { offset: 1, color: `${color}02` },
                    ],
                  },
                } : undefined,
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
            return {
              name: def.label,
              _kpiId: kpiId,
              _splitValue: undefined,
              _splitValue2: undefined,
              _networkElement: undefined,
              connectNulls: true,
              type: sp.seriesType as any,
              data: values,
              smooth: sp.isSmooth,
              symbol: (sp.forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
              symbolSize: (sp.forceSymbols || cfg.showSymbols) ? 5 : 0,
              lineStyle: sp.seriesType === 'line' ? { width: cfg.lineWidth, color: def.color } : undefined,
              itemStyle: { color: def.color, borderRadius: sp.seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
              barMaxWidth: 20,
              stack: sp.isStacked ? 'total' : undefined,
              areaStyle: sp.showArea ? {
                color: {
                  type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: `${def.color}20` },
                    { offset: 1, color: `${def.color}02` },
                  ],
                },
              } : undefined,
            };
          });
        }

        // ── Merge counter series into the chart ──
        const slotCounterData = counterDataMap[slot.id];
        if (counterIds.length > 0 && slotCounterData && slotCounterData.series.length > 0) {
          const cSeries = slotCounterData.series;
          const cNameMap = slotCounterData.nameMap;
          const cCounters = [...new Set(cSeries.map(d => d.counter))];
          // Add counter timestamps to allTimestamps
          const cTimestamps = [...new Set(cSeries.map(d => d.ts))].sort();
          const tsSet = new Set(allTimestamps);
          for (const ts of cTimestamps) {
            if (!tsSet.has(ts)) { allTimestamps.push(ts); tsSet.add(ts); }
          }
          allTimestamps.sort();

          cCounters.forEach((counter) => {
            const color = stableColorForCounter(counter);
            const idFromName = Object.entries(cNameMap).find(([, name]) => name === counter)?.[0];
            const displayName = idFromName ? `${counter} (${idFromName})` : counter;
            const cDef = counterCatalog.find(c => c.counter_name === counter);
            const label = cDef?.display_name ? `${cDef.display_name} (${counter})` : displayName;

            series.push({
              name: label,
              _kpiId: `counter_${counter}`,
              connectNulls: true,
              type: 'line' as any,
              data: allTimestamps.map(ts => {
                const p = cSeries.find(d => d.ts === ts && d.counter === counter);
                return p ? p.value : null;
              }),
              smooth: true,
              symbol: 'none',
              symbolSize: 5,
              lineStyle: { width: 2.5, color, type: 'solid' as const },
              itemStyle: { color },
              areaStyle: {
                color: {
                  type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: `${color}15` },
                    { offset: 1, color: `${color}02` },
                  ],
                },
              },
              // Put counters on right Y-axis by default
              yAxisIndex: 1,
            });
          });
        }
        // Force right Y-axis if counters are present
        const hasCounterSeries = counterIds.length > 0 && slotCounterData && slotCounterData.series.length > 0;

        const markLineData = jalons.map(j => {
          // Normalize jalon date to match allTimestamps format
          const normDate = normalizeTimestamp(j.date, slotGranularity);
          // Find closest timestamp in timeline if exact match doesn't exist
          let xVal = normDate;
          if (!allTimestamps.includes(normDate) && allTimestamps.length > 0) {
            const jTime = new Date(j.date).getTime();
            let closest = allTimestamps[0];
            let closestDiff = Math.abs(new Date(closest).getTime() - jTime);
            for (const ts of allTimestamps) {
              const diff = Math.abs(new Date(ts).getTime() - jTime);
              if (diff < closestDiff) { closest = ts; closestDiff = diff; }
            }
            xVal = closest;
          }
          return {
            xAxis: xVal,
            label: {
              show: true,
              formatter: j.label,
              fontSize: 9,
              fontWeight: 'bold' as const,
              color: j.color,
              position: 'insideEndTop' as const,
            },
            lineStyle: {
              color: j.color,
              width: 2,
              type: 'dashed' as const,
            },
          };
        });

        // Weekend highlighting — build markArea data
        const weekendAreas: { xAxis: string }[][] = [];
        let inWeekend = false;
        for (let ti = 0; ti < allTimestamps.length; ti++) {
          const day = new Date(allTimestamps[ti]).getDay(); // 0=Sun, 6=Sat
          const isWE = day === 0 || day === 6;
          if (isWE && !inWeekend) {
            weekendAreas.push([{ xAxis: allTimestamps[ti] }, { xAxis: allTimestamps[ti] }]);
            inWeekend = true;
          } else if (isWE && inWeekend) {
            weekendAreas[weekendAreas.length - 1][1] = { xAxis: allTimestamps[ti] };
          } else {
            inWeekend = false;
          }
        }

        const markAreaData = weekendAreas.map(([start, end]) => [{
          xAxis: start.xAxis,
          itemStyle: { color: 'rgba(148,163,184,0.12)' },
        }, {
          xAxis: end.xAxis,
        }]);

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

        const hasRightAxis =
          Object.values(effectiveYAxisAssignments).includes(1) || !!hasCounterSeries;

        // ── Auto Y-axis calculation ──
        const computeAutoRange = (seriesArr: any[], axisIdx: number) => {
          const vals: number[] = [];

          seriesArr.forEach((s) => {
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

          return {
            min: parseFloat((rawMin - padding).toFixed(4)),
            max: parseFloat((rawMax + padding).toFixed(4)),
          };
        };

        const autoLeft = computeAutoRange(series, 0);
        const autoRight = hasRightAxis ? computeAutoRange(series, 1) : { min: undefined, max: undefined };

        // Build yAxis array (always left; optionally right)
        const yAxisLeft = {
          type: 'value' as const,
          position: 'left' as const,
          min: cfg.yAxis?.mode === 'manual' && cfg.yAxis.min != null ? cfg.yAxis.min : autoLeft.min,
          max: cfg.yAxis?.mode === 'manual' && cfg.yAxis.max != null ? cfg.yAxis.max : autoLeft.max,
          axisLabel: {
            fontSize: 10,
            color: '#a1a1aa',
            formatter: (v: number) => `${v.toFixed(1)}`,
            margin: 14,
          },
          splitLine: {
            show: cfg.showGrid,
            lineStyle: { color: 'rgba(148,163,184,0.10)', type: 'dashed' as const },
          },
          axisLine: { show: false },
          axisTick: { show: false },
        };

        const yAxisRightCfg = cfg.yAxisRight;
        const yAxisRight = {
          type: 'value' as const,
          position: 'right' as const,
          min: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.min != null ? yAxisRightCfg.min : autoRight.min,
          max: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.max != null ? yAxisRightCfg.max : autoRight.max,
          axisLabel: {
            fontSize: 10,
            color: '#a1a1aa',
            formatter: (v: number) => `${v.toFixed(1)}`,
            margin: 14,
          },
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        };

        const yAxisArr = hasRightAxis ? [yAxisLeft, yAxisRight] : [yAxisLeft];

        const getYAxisIndex = (kpiId: string) =>
          effectiveYAxisAssignments[kpiId] === 1 ? 1 : 0;

        // dataZoom slider height
        const sliderHeight = 22;
        const sliderBottomMargin = 30;
        const legendRows = series.length > 4 ? 78 : series.length > 2 ? 66 : 54;

        const option: any = {
          animation: false,
          toolbox: { show: false },
          grid: {
            top: 32,
            right: hasRightAxis ? 62 : 28,
            bottom: legendRows + sliderHeight + 20,
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
            },
            {
              type: 'slider' as const,
              xAxisIndex: 0,
              height: sliderHeight,
              bottom: legendRows - 12,
              filterMode: 'none' as const,
              start: cfg.zoomWindow?.start,
              end: cfg.zoomWindow?.end,
              borderColor: 'rgba(128,128,128,0.2)',
              backgroundColor: 'rgba(128,128,128,0.06)',
              fillerColor: 'rgba(99,102,241,0.15)',
              handleSize: '120%',
              handleStyle: { color: '#6366f1', borderColor: '#6366f1', borderWidth: 1 },
              moveHandleSize: 6,
              textStyle: { fontSize: 9, color: '#a1a1aa' },
              dataBackground: {
                lineStyle: { color: 'rgba(99,102,241,0.3)' },
                areaStyle: { color: 'rgba(99,102,241,0.08)' },
              },
              selectedDataBackground: {
                lineStyle: { color: 'rgba(99,102,241,0.5)' },
                areaStyle: { color: 'rgba(99,102,241,0.15)' },
              },
              brushSelect: false,
            },
          ],
          legend: {
            show: true,
            bottom: 4,
            icon: 'roundRect',
            itemWidth: 20,
            itemHeight: 5,
            itemGap: 14,
            type: 'plain' as any,
            textStyle: {
              fontSize: 10,
              fontWeight: 500,
              color: '#4b5563',
              padding: [0, 0, 0, 4],
            },
            tooltip: { show: true },
          },
          backgroundColor: '#ffffff',
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.96)',
            borderColor: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: [10, 14],
            textStyle: { color: '#f1f5f9', fontSize: 11.5 },
            axisPointer: {
              type: 'line' as const,
              lineStyle: { color: 'rgba(99,102,241,0.25)', width: 1, type: 'dashed' as const },
            },
            formatter: (params: any) => {
              const items = Array.isArray(params) ? params : [params];
              if (items.length === 0) return '';
              const dt = new Date(items[0].axisValue);
              const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
              const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
              const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              const isWE = dt.getDay() === 0 || dt.getDay() === 6;
              const weBadge = isWE ? ' <span style="background:rgba(148,163,184,0.2);padding:1px 5px;border-radius:3px;font-size:9px;color:#94a3b8">WE</span>' : '';
              const header = `<div style="font-size:10.5px;color:#94a3b8;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:5px">${dayName} ${dateStr} · ${timeStr}${weBadge}</div>`;

              // Group items: detect split series for total row
              // Also show split/NE details in tooltip
              const rows: string[] = [];
              let splitTotal = 0;
              let splitCount = 0;
              let splitUnit = '';
              for (const p of items) {
                const matchedDef = defs.find(d => d.label === p.seriesName || p.seriesName?.startsWith(d.label + ' — '));
                const unit = matchedDef?.unit || '';
                const val = p.value != null ? p.value.toFixed(2) : '—';
                const isSplit = p.seriesName?.includes(' — ') || p.seriesName?.includes(' / ') || (hasSplitData && items.length > 1 && !p.seriesName?.includes('('));
                if (isSplit && p.value != null) { splitTotal += p.value; splitCount++; splitUnit = unit; }
                // Find matching series metadata for NE info
                const matchedSeries = option.series?.find((s: any) => s.name === p.seriesName);
                const neInfo = matchedSeries?._networkElement ? ` <span style="font-size:9px;color:#94a3b8;background:rgba(148,163,184,0.15);padding:1px 4px;border-radius:3px;margin-left:4px">NE: ${matchedSeries._networkElement}</span>` : '';
                rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">${p.seriesName}${neInfo}</span><b style="color:#f1f5f9">${val} ${unit}</b></div>`);
              }
              // Add total row for split series
              const totalRow = splitCount > 1
                ? `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;margin-top:2px;border-top:1px solid rgba(255,255,255,0.08)"><span style="width:12px;height:3px;border-radius:2px;background:rgba(255,255,255,0.3);display:inline-block"></span><span style="flex:1;color:#94a3b8;font-weight:600">Total</span><b style="color:#f1f5f9">${splitTotal.toFixed(2)} ${splitUnit}</b></div>`
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
              color: '#6b7280',
              margin: 16,
              rotate: 0,
              interval: xInterval,
              lineHeight: 16,
            },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
            axisTick: { show: true, length: 4, lineStyle: { color: 'rgba(0,0,0,0.08)' } },
            splitLine: { show: false },
          },
          yAxis: yAxisArr,
          series: series.map((s, i) => {
            const seriesKpiId = s._kpiId || kpiIds[0];

            return {
              ...s,
              // Keep _kpiId, _splitValue, _splitValue2, _networkElement for table/tooltip
              // Counter series already have yAxisIndex set; for KPIs, use assignment logic
              yAxisIndex: s.yAxisIndex != null ? s.yAxisIndex : (hasRightAxis ? getYAxisIndex(seriesKpiId) : 0),
              lineStyle: { ...(s.lineStyle || {}), width: s.lineStyle?.width || cfg.lineWidth || 2.5 },
              emphasis: {
                focus: 'series' as const,
                blurScope: 'coordinateSystem' as const,
                lineStyle: { width: (s.lineStyle?.width || cfg.lineWidth || 2.5) + 1.5 },
              },
              ...(i === 0 ? {
                markLine: markLineData.length > 0 ? { silent: true, symbol: 'none', data: markLineData } : undefined,
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
              if (target.closest('canvas') || target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('canvas') || target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
              onSlotClick?.(slot.id);
            }}
            className={cn(
              'rounded-xl border bg-card px-6 pt-5 pb-4 group relative cursor-pointer transition-all duration-200',
              isActive
                ? 'border-primary/40 ring-1 ring-primary/15 shadow-md shadow-primary/5'
                : 'border-border/40 hover:border-border/60 hover:shadow-sm'
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <div className="flex items-center gap-1.5">
                <input
                  value={slot.name}
                  onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[160px] truncate"
                />
                {isActive && (
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Active</span>
                )}
              </div>
              <span className="ml-auto" />

              {/* Add KPI to this graph */}
              <button
                onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }}
                className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Ajouter un KPI"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Add Counter to this graph */}
              <button
                onClick={(e) => { e.stopPropagation(); setCounterSelectorSlotId(slot.id); }}
                className="p-1 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                title="Ajouter un Compteur"
              >
                <Hash className="w-3.5 h-3.5" />
              </button>


              {/* Duplicate slot */}
              {onDuplicateSlot && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicateSlot(slot.id); }}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Dupliquer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Export as PNG */}
              <button
                onClick={(e) => { e.stopPropagation(); exportChartAsPng(chartRefsMap.current[slot.id], slot.name || 'chart'); }}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Exporter PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Config popover — unified settings */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0 z-[200] overflow-hidden" align="end" side="bottom" sideOffset={4}>
                  <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Graph Settings</span>
                  </div>

                  {/* Quick actions bar at top */}
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
                      onClick={(e) => { e.stopPropagation(); exportChartAsPng(chartRefsMap.current[slot.id], slot.name || 'chart'); }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-semibold border border-border/40 text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {/* Background */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">Background</span>
                      <span className="text-[9px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 border border-border/40">White</span>
                    </div>

                    {/* Table View */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">Table View</span>
                      <Switch checked={cfg.showDataTable} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showDataTable: v }); if (!v && onActivateTab) onActivateTab(null as any); else if (v && onActivateTab) onActivateTab('table_data'); }} className="scale-[0.65]" />
                    </div>

                    {/* Top Worst Cells */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">Top Worst Cells</span>
                      <Switch checked={cfg.showTopWorst} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showTopWorst: v }); if (!v && onActivateTab) onActivateTab(null as any); else if (v && onActivateTab) onActivateTab('top_worst'); }} className="scale-[0.65]" />
                    </div>

                    {/* Alarms */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">Alarms</span>
                      <Switch checked={cfg.showAlarms} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showAlarms: v }); if (!v && onActivateTab) onActivateTab(null as any); else if (v && onActivateTab) onActivateTab('alarms'); }} className="scale-[0.65]" />
                    </div>

                    {/* Neighbors */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">Neighbors</span>
                      <Switch checked={cfg.showNeighbors} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showNeighbors: v }); if (!v && onActivateTab) onActivateTab(null as any); else if (v && onActivateTab) onActivateTab('neighbors'); }} className="scale-[0.65]" />
                    </div>

                    {/* CM History */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-foreground">CM History</span>
                      <Switch checked={cfg.showCmHistory} onCheckedChange={v => { onUpdateSlotConfig(slot.id, { showCmHistory: v }); if (!v && onActivateTab) onActivateTab(null as any); else if (v && onActivateTab) onActivateTab('cm_history'); }} className="scale-[0.65]" />
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
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-foreground whitespace-nowrap">Line Width</span>
                      <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="flex-1" />
                      <span className="text-[9px] text-muted-foreground font-mono w-8 text-right">{cfg.lineWidth}px</span>
                    </div>

                  </div>

                  {/* Footer — Apply */}
                  <div className="px-3 py-2 border-t border-border/40 bg-muted/20">
                    <button
                      onClick={(e) => {
                        // Activate corresponding bottom tab if toggle is on
                        if (cfg.showDataTable && onActivateTab) onActivateTab('table_data');
                        else if (cfg.showBreakdown && onActivateTab) onActivateTab('breakdown');
                        else if (cfg.showTopWorst && onActivateTab) onActivateTab('top_worst');
                        else if (cfg.showAlarms && onActivateTab) onActivateTab('alarms');
                        else if (cfg.showNeighbors && onActivateTab) onActivateTab('neighbors');
                        else if (cfg.showCmHistory && onActivateTab) onActivateTab('cm_history');
                        // Close the popover
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
            </div>
            <SlotChart
              ref={(el) => { chartRefsMap.current[slot.id] = el; }}
              key={`${slot.id}-${cfg.chartType}`}
              option={option}
              height={chartHeight}
              onDataZoom={(start, end) => {
                if (cfg.zoomWindow?.start === start && cfg.zoomWindow?.end === end) return;
                onUpdateSlotConfig(slot.id, { zoomWindow: { start, end } });
              }}
            />




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
      />
    </div>
  );
};

export default KPIGraphs;
