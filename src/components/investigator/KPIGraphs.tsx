import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon, SplitOption, WidgetType } from './types';
import CounterSelectorModal from './CounterSelectorModal';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { KPI_MAP, KPIS } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { cn } from '@/lib/utils';
import { Settings2, TrendingUp, AreaChart, BarChart, CircleDot, X, Plus, Layers, Hash, BarChart3, GitBranch, Activity, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { fetchFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';

const WIDGET_TYPES: { value: WidgetType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'timeseries', label: 'Graph', icon: TrendingUp, color: 'text-blue-500' },
  { value: 'kpi_card', label: 'KPI Card', icon: Activity, color: 'text-emerald-500' },
  { value: 'counter', label: 'Counter', icon: Hash, color: 'text-amber-500' },
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

/** Wrapper — full replace on every update so legend stays in sync */
const SlotChart: React.FC<{ option: any; height: number }> = ({ option, height }) => {
  return (
    <ReactECharts
      option={option}
      notMerge={true}
      lazyUpdate={false}
      style={{ height }}
    />
  );
};
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
        const points = data.filter(d => d.kpi === kpiId);
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
  const [tsData, setTsData] = React.useState<{ ts: string; counter: string; value: number }[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (counterNames.length === 0) { setTsData([]); return; }
    setLoading(true);
    const dateFrom = state.startDate?.split('T')[0] || '2026-01-01';
    const dateTo = state.endDate?.split('T')[0] || '2026-03-24';
    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ counter_names: counterNames, date_from: dateFrom, date_to: dateTo, granularity: '1d', split_by_dimension: false }),
    })
      .then(r => r.ok ? r.json() : { series: [] })
      .then(data => { setTsData(data.series || []); setLoading(false); })
      .catch(() => { setTsData([]); setLoading(false); });
  }, [counterNames.join(','), state.startDate, state.endDate]);

  if (loading) return <div className="flex items-center justify-center text-muted-foreground text-[10px] gap-1.5" style={{ height }}><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...</div>;
  if (tsData.length === 0) return <div className="flex items-center justify-center text-muted-foreground text-[10px]" style={{ height }}>No data available</div>;

  const counters = [...new Set(tsData.map(d => d.counter))];
  const timestamps = [...new Set(tsData.map(d => d.ts))].sort();

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f8fafc', fontSize: 10 },
    },
    legend: { bottom: 0, textStyle: { color: '#9ca3af', fontSize: 9 }, data: counters },
    grid: { left: 60, right: 20, top: 10, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: timestamps.map(t => t.slice(0, 10)),
      axisLabel: { color: '#6b7280', fontSize: 9 },
      axisLine: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#6b7280', fontSize: 9, formatter: (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toString() },
      splitLine: { lineStyle: { color: 'rgba(55,65,81,0.3)' } },
    },
    series: counters.map((counter, i) => ({
      name: counter,
      type: 'line' as const,
      smooth: true,
      data: timestamps.map(ts => { const p = tsData.find(d => d.ts === ts && d.counter === counter); return p ? p.value : 0; }),
      lineStyle: { width: 2, color: SERIES_COLORS[i % SERIES_COLORS.length] },
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      symbolSize: 4,
      areaStyle: {
        color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: SERIES_COLORS[i % SERIES_COLORS.length] + '25' },
          { offset: 1, color: SERIES_COLORS[i % SERIES_COLORS.length] + '05' },
        ]},
      },
    })),
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
  onRemoveSlot: (slotId: string) => void;
  onAddEmptySlot: (widgetType?: import('./types').WidgetType) => void;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onRenameSlot: (slotId: string, name: string) => void;
  onOpenKpiSelector: (slotId: string) => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
}

const KPIGraphs: React.FC<Props> = ({ graphSlots, data, layout, jalons, onChangeSlotKpi, onSetSlotKpiIds, onRemoveSlot, onAddEmptySlot, onUpdateSlotConfig, onRenameSlot, onOpenKpiSelector, activeSlotId, onSlotClick }) => {
  const cols = layout === 1 ? 1 : layout === 4 ? 2 : 2;
  const chartHeight = layout === 1 ? 520 : layout === 4 ? 340 : 400;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);
  const [splitOptions, setSplitOptions] = useState<{ key: string; label: string }[]>([]);
  const [counterCatalog, setCounterCatalog] = useState<{ counter_name: string; display_name: string; family: string; vendor: string; techno: string; object_type: string; count: number }[]>([]);
  const [counterSelectorSlotId, setCounterSelectorSlotId] = useState<string | null>(null);

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
      .then(setCounterCatalog)
      .catch(() => {});
  }, []);

  const getDef = (kpiId: string) => KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId) || null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1 max-w-[1400px]' : 'grid-cols-1 md:grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const kpiIds = slot.kpiIds || [];
        const isEmpty = kpiIds.length === 0;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const isActive = activeSlotId === slot.id;
        const wType = slot.widgetType || 'timeseries';
        const wtDef = WIDGET_TYPES.find(w => w.value === wType) || WIDGET_TYPES[0];

        // Empty slot — no KPI assigned yet
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
                  {wType === 'counter' ? 'Aucun compteur sélectionné' : 'Aucun KPI sélectionné'}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); wType === 'counter' ? setCounterSelectorSlotId(slot.id) : onOpenKpiSelector(slot.id); }}
                  className="px-3 py-1 rounded-md text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  {wType === 'counter' ? 'Choisir un Compteur' : 'Choisir un KPI'}
                </button>
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
              <KpiCardWidget kpiIds={kpiIds} data={data} allKpis={allKpis} />
            </div>
          );
        }

        if (wType === 'counter') {
          return (
            <div key={slot.id} onClick={() => onSlotClick?.(slot.id)} className={cn(
              'rounded-xl border bg-card p-4 relative cursor-pointer transition-all duration-300',
              isActive ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border/60 hover:border-border'
            )}>
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <Hash className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-foreground">{slot.name}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Counter</span>
                <span className="ml-auto" />
                <button onClick={(e) => { e.stopPropagation(); setCounterSelectorSlotId(slot.id); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Ajouter compteurs"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {kpiIds.map((cId, i) => {
                    const cDef = counterCatalog.find(c => c.counter_name === cId);
                    return (
                      <span key={cId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border border-border/50 bg-muted/30">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                        {cDef?.display_name || cId}
                      </span>
                    );
                  })}
                </div>
                <CounterTimeseriesWidget counterNames={kpiIds} height={chartHeight - 60} />
              </div>
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
          return d || { id, label: id, unit: '', color: SERIES_COLORS[i % SERIES_COLORS.length], thresholds: { warning: 50, critical: 20 }, higherIsBetter: false };
        });

        // Filter data to only this slot's KPIs
        const slotData = data.filter(d => kpiIds.includes(d.kpi));

        // Per-KPI split detection — only split if user explicitly configured it
        const splitByPerKpi = cfg.splitByPerKpi || {};
        const slotSplit = slot.splitBy && slot.splitBy !== 'None';
        const hasPerKpiSplit = kpiIds.some(id => {
          const p = splitByPerKpi[id];
          return p && p !== 'None';
        });
        const hasSplit = slotSplit || hasPerKpiSplit;
        const getKpiHasSplit = (kpiId: string) => {
          if (slotSplit) return true;
          const perKpi = splitByPerKpi[kpiId];
          return perKpi != null && perKpi !== 'None';
        };

        // Filter data: if no split configured, aggregate (ignore splitValue)
        const effectiveData = hasSplit
          ? slotData.filter(d => d.splitValue && d.splitValue !== 'ALL')
          : slotData.map(d => ({ ...d, splitValue: undefined }));

        // Build full timeline from requested date range so X axis always shows the complete period
        const state = useInvestigatorStore.getState().state;
        // Normalize timestamps: daily → YYYY-MM-DD, hourly → YYYY-MM-DDTHH:MM:SS
        const gran = state.granularity;
        const normTs = (ts: string): string => {
          if (!ts) return ts;
          if (gran === 'Daily' || gran === 'Weekly') return ts.slice(0, 10);
          return ts.slice(0, 19);
        };
        // Normalize all data point timestamps
        const normalizedData = effectiveData.map(d => ({ ...d, timestamp: normTs(d.timestamp) }));
        const apiTimestamps = [...new Set(kpiIds.flatMap(id => normalizedData.filter(d => d.kpi === id).map(d => d.timestamp)))].sort();

        const generateFullTimeline = (from: string, to: string, gran: string): string[] => {
          const start = new Date(from);
          const end = new Date(to);
          if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return apiTimestamps;

          const points: string[] = [];
          const stepMs =
            gran === '15min' ? 15 * 60 * 1000 :
            gran === '1h' || gran === 'hourly' ? 60 * 60 * 1000 :
            gran === '1d' || gran === 'daily' ? 24 * 60 * 60 * 1000 :
            gran === '1w' || gran === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
            24 * 60 * 60 * 1000;

          const maxPoints = 2000; // safety cap
          let cur = start.getTime();
          const endMs = end.getTime();
          while (cur <= endMs && points.length < maxPoints) {
            const d = new Date(cur);
            // Format to match API timestamps (YYYY-MM-DD or ISO)
            if (stepMs >= 24 * 60 * 60 * 1000) {
              points.push(d.toISOString().slice(0, 10));
            } else {
              points.push(d.toISOString().slice(0, 19));
            }
            cur += stepMs;
          }
          return points;
        };

        const fullTimeline = generateFullTimeline(state.startDate, state.endDate, state.granularity);
        // Merge: use full timeline as base, add any API timestamps not already included
        const timelineSet = new Set(fullTimeline);
        for (const ts of apiTimestamps) {
          if (!timelineSet.has(ts)) fullTimeline.push(ts);
        }
        const allTimestamps = fullTimeline.sort();

        const isStacked = cfg.chartType === 'stacked_bar';
        const seriesType = cfg.chartType === 'scatter' ? 'scatter' : (cfg.chartType === 'bar' || isStacked) ? 'bar' : 'line';
        const isSmooth = cfg.chartType === 'line' || cfg.chartType === 'area'; // straight/points = not smooth
        const forceSymbols = cfg.chartType === 'line_points' || cfg.chartType === 'scatter';

        let series: any[];

        if (hasSplit) {
          let colorIdx = 0;
          series = kpiIds.flatMap((kpiId, ki) => {
            const def = defs[ki];
            const kpiHasSplit = getKpiHasSplit(kpiId);
            const kpiData = normalizedData.filter(d => d.kpi === kpiId);

            if (!kpiHasSplit) {
              // Non-split KPI: single aggregated series
              const color = SERIES_COLORS[colorIdx++ % SERIES_COLORS.length];
              const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              return [{
                name: def.label,
                _kpiId: kpiId,
                type: seriesType as any,
                data: values,
                smooth: isSmooth,
                symbol: (forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
                symbolSize: (forceSymbols || cfg.showSymbols) ? 5 : 0,
                lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: isStacked ? 'total' : undefined,
                areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
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

            // Split KPI: one series per split value
            const splitValues = [...new Set(kpiData.map(d => d.splitValue!))];
            return splitValues.map(sv => {
              const color = SERIES_COLORS[colorIdx++ % SERIES_COLORS.length];
              const svData = kpiData.filter(d => d.splitValue === sv);
              const dataMap = new Map(svData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const seriesName = kpiIds.length > 1 ? `${def.label} — ${sv}` : sv;

              return {
                name: seriesName,
                _kpiId: kpiId,
                type: seriesType as any,
                data: values,
                smooth: isSmooth,
                symbol: (forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
                symbolSize: (forceSymbols || cfg.showSymbols) ? 5 : 0,
                lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                stack: isStacked ? 'total' : undefined,
                areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
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
            const kpiData = normalizedData.filter(d => d.kpi === kpiId);
            const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
            const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);

            return {
              name: def.label,
              _kpiId: kpiId,
              type: seriesType as any,
              data: values,
              smooth: isSmooth,
              symbol: (forceSymbols || cfg.showSymbols) ? 'circle' : 'none',
              symbolSize: (forceSymbols || cfg.showSymbols) ? 5 : 0,
              lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color: def.color } : undefined,
              itemStyle: { color: def.color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
              barMaxWidth: 20,
              stack: isStacked ? 'total' : undefined,
              areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
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

        // Build markLine data for jalons
        const markLineData = jalons
          .filter(j => allTimestamps.includes(j.date) || true) // show all jalons
          .map(j => ({
            xAxis: j.date,
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
          }));

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
          itemStyle: { color: 'rgba(148,163,184,0.035)' },
        }, {
          xAxis: end.xAxis,
        }]);

        // Smart x-axis interval: keep labels horizontal, show ~8-12 ticks max
        const totalPts = allTimestamps.length;
        const xInterval = totalPts > 90 ? Math.floor(totalPts / 8) : totalPts > 40 ? Math.floor(totalPts / 10) : totalPts > 20 ? Math.floor(totalPts / 8) : 0;

        // Determine if we need a right Y-axis
        const yAxisAssignments = cfg.yAxisAssignments || {};
        const hasRightAxis = Object.values(yAxisAssignments).includes(1);

        // Build yAxis array (always left; optionally right)
        const yAxisLeft = {
          type: 'value' as const,
          position: 'left' as const,
          min: cfg.yAxis?.mode === 'manual' && cfg.yAxis.min != null ? cfg.yAxis.min : undefined,
          max: cfg.yAxis?.mode === 'manual' && cfg.yAxis.max != null ? cfg.yAxis.max : undefined,
          axisLabel: { fontSize: 10, color: '#a1a1aa', formatter: (v: number) => `${v.toFixed(1)}`, margin: 14 },
          splitLine: {
            show: cfg.showGrid,
            lineStyle: { color: 'rgba(128,128,128,0.05)', type: 'dashed' as const },
          },
          axisLine: { show: false },
          axisTick: { show: false },
        };
        const yAxisRightCfg = cfg.yAxisRight;
        const yAxisRight = {
          type: 'value' as const,
          position: 'right' as const,
          min: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.min != null ? yAxisRightCfg.min : undefined,
          max: yAxisRightCfg?.mode === 'manual' && yAxisRightCfg.max != null ? yAxisRightCfg.max : undefined,
          axisLabel: { fontSize: 10, color: '#a1a1aa', formatter: (v: number) => `${v.toFixed(1)}`, margin: 14 },
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        };
        const yAxisArr = hasRightAxis ? [yAxisLeft, yAxisRight] : [yAxisLeft];

        // Assign yAxisIndex to each series based on its KPI
        const getYAxisIndex = (kpiId: string) => yAxisAssignments[kpiId] === 1 ? 1 : 0;

        const option = {
          animation: false,
          grid: {
            top: 32,
            right: hasRightAxis ? 62 : 28,
            bottom: series.length > 4 ? 78 : series.length > 2 ? 66 : 54,
            left: 62,
            containLabel: false,
          },
          legend: {
            show: true,
            bottom: 4,
            icon: 'roundRect',
            itemWidth: 20,
            itemHeight: 5,
            itemGap: 18,
            type: 'scroll' as any,
            pageIconSize: 12,
            textStyle: {
              fontSize: 11,
              fontWeight: 500,
              color: '#4b5563',
              padding: [0, 0, 0, 4],
            },
            formatter: (name: string) => {
              // Show a distinguishable short name: last meaningful segment(s)
              const parts = name.split('_').filter(Boolean);
              if (parts.length <= 3 || name.length <= 28) return name;
              // Keep last 3 segments for uniqueness
              const tail = parts.slice(-3).join('_');
              return tail.length > 30 ? tail.slice(0, 28) + '…' : tail;
            },
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
                const def = defs.find(d => d.label === p.seriesName) || defs[0];
                const val = p.value != null ? p.value.toFixed(2) : '—';
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:#cbd5e1">${p.seriesName}</span><b style="color:#f1f5f9">${val} ${def.unit}</b></div>`;
              }).join('');
              return header + rows;
            },
          },
          xAxis: {
            type: 'category' as const,
            data: allTimestamps,
            axisLabel: {
              formatter: (v: string) => {
                const d = new Date(v);
                // Detect single-day: if first and last timestamp are same day
                const first = new Date(allTimestamps[0]);
                const last = new Date(allTimestamps[allTimestamps.length - 1]);
                const sameDay = first.toDateString() === last.toDateString();
                const spanDays = (last.getTime() - first.getTime()) / 86400000;
                if (sameDay || spanDays <= 1) {
                  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                } else if (spanDays <= 7) {
                  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }) + '\n' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                } else {
                  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                }
              },
              fontSize: 10.5,
              color: '#a1a1aa',
              margin: 14,
              rotate: 0,
              interval: xInterval,
            },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
            axisTick: { show: false },
            splitLine: { show: false },
          },
          yAxis: yAxisArr,
          series: series.map((s, i) => {
            const seriesKpiId = s._kpiId || kpiIds[0];

            return {
              ...s,
              _kpiId: undefined, // don't pass internal prop to ECharts
              yAxisIndex: hasRightAxis ? getYAxisIndex(seriesKpiId) : 0,
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
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
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
                {/* Show color dots for each KPI */}
                {defs.map((d, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: d.color }} />
                ))}
                <input
                  value={slot.name}
                  onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[160px] truncate ml-1"
                />
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

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Config popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-3 space-y-3 z-50" align="end" side="bottom">
                  {/* KPIs list */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">KPIs ({kpiIds.length})</span>
                    {defs.map((d, i) => (
                      <div key={kpiIds[i]} className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-[10px] font-medium text-foreground truncate max-w-[100px]">{d.label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* L/R Y-axis toggle */}
                          <div className="flex items-center bg-muted/50 rounded border border-border/40 overflow-hidden">
                            <button
                              onClick={() => onUpdateSlotConfig(slot.id, { yAxisAssignments: { ...cfg.yAxisAssignments, [kpiIds[i]]: 0 } })}
                              className={cn(
                                'px-1.5 py-0.5 text-[8px] font-bold transition-colors',
                                (cfg.yAxisAssignments?.[kpiIds[i]] || 0) === 0
                                  ? 'bg-primary/20 text-primary'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                              title="Left Y-axis"
                            >L</button>
                            <button
                              onClick={() => onUpdateSlotConfig(slot.id, { yAxisAssignments: { ...cfg.yAxisAssignments, [kpiIds[i]]: 1 } })}
                              className={cn(
                                'px-1.5 py-0.5 text-[8px] font-bold transition-colors',
                                cfg.yAxisAssignments?.[kpiIds[i]] === 1
                                  ? 'bg-primary/20 text-primary'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                              title="Right Y-axis"
                            >R</button>
                          </div>
                          <button
                            onClick={() => onChangeSlotKpi(slot.id, kpiIds[i])}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 w-full mt-1"
                      onClick={() => onOpenKpiSelector(slot.id)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Ajouter KPI
                    </Button>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Chart Type */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Chart Type</span>
                    <div className="flex gap-1">
                      {CHART_TYPES.map(ct => (
                        <button
                          key={ct.value}
                          onClick={() => onUpdateSlotConfig(slot.id, { chartType: ct.value })}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                            cfg.chartType === ct.value
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                          )}
                        >
                          <ct.icon className="w-3 h-3" />
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Smooth Curve</span>
                    <Switch checked={cfg.smooth} onCheckedChange={v => onUpdateSlotConfig(slot.id, { smooth: v })} className="scale-75" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground">Line Width</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{cfg.lineWidth}px</span>
                    </div>
                    <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="w-full" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Show Markers</span>
                    <Switch checked={cfg.showSymbols} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showSymbols: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Area Fill</span>
                    <Switch checked={cfg.showArea} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showArea: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Thresholds</span>
                    <Switch checked={cfg.showThresholds} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showThresholds: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
                    <Switch checked={cfg.showGrid} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showGrid: v })} className="scale-75" />
                  </div>

                  {/* Y-Axis Settings with L/R selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Axe Y</span>
                      <div className="flex items-center bg-muted/50 rounded border border-border/40 overflow-hidden">
                        {(['L', 'R'] as const).map(side => {
                          const isActiveAxis = (cfg as any).__activeYTab === side || (!(cfg as any).__activeYTab && side === 'L');
                          return (
                            <button
                              key={side}
                              onClick={() => onUpdateSlotConfig(slot.id, { __activeYTab: side } as any)}
                              className={cn(
                                'px-2.5 py-0.5 text-[9px] font-bold transition-colors',
                                isActiveAxis ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                              )}
                            >{side}</button>
                          );
                        })}
                      </div>
                    </div>
                    {(() => {
                      const isRight = (cfg as any).__activeYTab === 'R';
                      const axisCfg = isRight ? cfg.yAxisRight : cfg.yAxis;
                      const axisKey = isRight ? 'yAxisRight' : 'yAxis';
                      return (
                        <>
                          <div className="flex gap-1">
                            {(['auto', 'manual'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => onUpdateSlotConfig(slot.id, { [axisKey]: { ...axisCfg, mode } })}
                                className={cn(
                                  'flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                                  (axisCfg?.mode || 'auto') === mode
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                                )}
                              >{mode === 'auto' ? 'Auto' : 'Manuel'}</button>
                            ))}
                          </div>
                          {axisCfg?.mode === 'manual' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-muted-foreground">Min</span>
                                <input type="number" value={axisCfg?.min ?? ''} onChange={e => onUpdateSlotConfig(slot.id, { [axisKey]: { ...axisCfg, mode: 'manual', min: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-mono" />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-muted-foreground">Max</span>
                                <input type="number" value={axisCfg?.max ?? ''} onChange={e => onUpdateSlotConfig(slot.id, { [axisKey]: { ...axisCfg, mode: 'manual', max: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-mono" />
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Split By — single for all KPIs */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split By</span>
                    <select
                      value={(() => {
                        const vals = Object.values(cfg.splitByPerKpi || {}).filter(v => v && v !== 'None');
                        return vals.length > 0 ? vals[0] : 'None';
                      })()}
                      onChange={e => {
                        const val = e.target.value;
                        const allSplits: Record<string, string> = {};
                        kpiIds.forEach(kid => { allSplits[kid] = val; });
                        onUpdateSlotConfig(slot.id, { splitByPerKpi: allSplits });
                      }}
                      className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-medium"
                    >
                      <option value="None">Aucun</option>
                      {splitOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>

                  <div className="h-px bg-border/60" />

                  <button
                    onClick={(e) => {
                      (e.target as HTMLElement).closest('[data-radix-popper-content-wrapper]')?.dispatchEvent(
                        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                      );
                    }}
                    className="w-full text-[10px] font-semibold text-primary hover:bg-primary/10 py-1.5 rounded-md transition-colors"
                  >
                    Appliquer
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            <SlotChart option={option} height={chartHeight} />
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
        selectedKeys={counterSelectorSlotId ? (graphSlots.find(s => s.id === counterSelectorSlotId)?.kpiIds || []) : []}
        onConfirm={(keys) => {
          if (counterSelectorSlotId) {
            onSetSlotKpiIds(counterSelectorSlotId, keys);
          }
          setCounterSelectorSlotId(null);
        }}
      />
    </div>
  );
};

export default KPIGraphs;
