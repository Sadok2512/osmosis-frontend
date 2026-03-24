import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  LineChart, Plus, X, Settings2, Calendar as CalendarIcon,
  Filter, ChevronDown, Check, Table2, TrendingUp, AreaChart,
  BarChart, CircleDot, LayoutGrid, Square, Columns2, Search,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import { fetchKpiCatalogFromDB } from '@/components/kpi-monitor/kpiCatalog';
import {
  fetchTimeseries, fetchTable, fetchSummary,
  type TimeseriesRequest, type TimeseriesPoint,
  type TableRequest, type TableRow, type SummaryItem,
  type MonitorFilter,
} from '@/components/kpi-monitor/api/kpiMonitorApi';

// ── Types ──
type ChartType = 'line' | 'area' | 'bar' | 'scatter';
type ViewMode = 'charts' | 'table' | 'both';

interface SlotConfig {
  chartType: ChartType;
  smooth: boolean;
  lineWidth: number;
  showMarkers: boolean;
  showArea: boolean;
  showThresholds: boolean;
  showGrid: boolean;
}

const DEFAULT_CONFIG: SlotConfig = {
  chartType: 'line',
  smooth: true,
  lineWidth: 2,
  showMarkers: false,
  showArea: true,
  showThresholds: true,
  showGrid: true,
};

interface GraphSlot {
  id: string;
  kpiKey: string;
  config: SlotConfig;
}

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
];

const GRANULARITIES = [
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
];

const FILTER_DIMENSIONS = ['Vendor', 'TECHNO', 'BAND', 'DOR', 'Plaque', 'ARCEP'];

// ── Helper: fetch filter values ──
const useDimensionValues = (dimension: string) => {
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      fetch(getApiUrl(`monitor/filters/values?dimension=${dimension}`), { headers: getApiHeaders() })
        .then(r => r.json())
        .then(d => { if (d.values) setValues(d.values); })
        .catch(() => {});
    });
  }, [dimension]);
  return values;
};

// ── Main Component ──
const KpiMonitorBisPage: React.FC = () => {
  // State
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>([]);
  const [slots, setSlots] = useState<GraphSlot[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return format(d, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [granularity, setGranularity] = useState('1d');
  const [filters, setFilters] = useState<MonitorFilter[]>([]);
  const [splitBy, setSplitBy] = useState<string | null>(null);
  const [layout, setLayout] = useState<1 | 2 | 4>(2);
  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [selectorOpen, setSelectorOpen] = useState<string | null>(null);

  // Data
  const [seriesData, setSeriesData] = useState<TimeseriesPoint[]>([]);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter management
  const [filterDim, setFilterDim] = useState<string | null>(null);

  // Load catalog
  useEffect(() => {
    fetchKpiCatalogFromDB().then(c => { if (c.length > 0) setCatalog(c); }).catch(() => {});
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (slots.length === 0) return;
    setLoading(true);
    const kpiKeys = slots.map(s => s.kpiKey);
    try {
      const [tsRes, tableRes, summaryRes] = await Promise.allSettled([
        fetchTimeseries({
          date_from: dateFrom,
          date_to: dateTo,
          granularity,
          filters,
          selections: kpiKeys.map(k => ({ kpi_key: k })),
          split_by: splitBy,
          top_n: 10,
        }),
        fetchTable({
          date_from: dateFrom,
          date_to: dateTo,
          filters,
          kpi_keys: kpiKeys,
          split_by: splitBy || 'DOR',
          top_n: 20,
        }),
        fetchSummary({
          date_from: dateFrom,
          date_to: dateTo,
          filters,
          kpi_keys: kpiKeys,
        }),
      ]);
      if (tsRes.status === 'fulfilled') setSeriesData(tsRes.value.series);
      if (tableRes.status === 'fulfilled') setTableData(tableRes.value.rows);
      if (summaryRes.status === 'fulfilled') setSummaryData(summaryRes.value);
    } catch (e) {
      console.error('[KPI Monitor BIS] Fetch error:', e);
    }
    setLoading(false);
  }, [slots, dateFrom, dateTo, granularity, filters, splitBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyPeriod = (days: number) => {
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate() - days);
    setDateFrom(format(start, 'yyyy-MM-dd'));
    setDateTo(format(end, 'yyyy-MM-dd'));
  };

  const addFilter = (dim: string, val: string) => {
    setFilters(prev => {
      const existing = prev.find(f => f.dimension === dim);
      if (existing) {
        if (existing.values.includes(val)) return prev;
        return prev.map(f => f.dimension === dim ? { ...f, values: [...f.values, val] } : f);
      }
      return [...prev, { dimension: dim, op: 'IN' as const, values: [val] }];
    });
    setFilterDim(null);
  };

  const removeFilterValue = (dim: string, val: string) => {
    setFilters(prev => prev.map(f => f.dimension === dim ? { ...f, values: f.values.filter(v => v !== val) } : f).filter(f => f.values.length > 0));
  };

  const getKpiInfo = (key: string) => catalog.find(k => k.kpi_key === key);

  const startDateObj = dateFrom ? new Date(dateFrom) : undefined;
  const endDateObj = dateTo ? new Date(dateTo) : undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{
      '--bis-bg': '#F8F9FA',
      '--bis-card': '#FFFFFF',
      '--bis-border': '#E2E8F0',
      '--bis-fg': '#1A1A1A',
      '--bis-muted': '#64748B',
      '--bis-primary': '#000000',
      '--bis-accent': '#F1F5F9',
    } as React.CSSProperties}>

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--bis-border)', background: 'var(--bis-card)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--bis-primary)' }}>
            <LineChart className="w-4 h-4" style={{ color: 'var(--bis-card)' }} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight font-serif italic" style={{ color: 'var(--bis-fg)' }}>KPI Monitor</h1>
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--bis-muted)' }}>Performance Analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="flex items-center gap-2 text-[10px] font-mono px-3 py-1 rounded-full" style={{ background: 'var(--bis-accent)', color: 'var(--bis-muted)' }}>
              <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--bis-muted)', borderTopColor: 'transparent' }} />
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="border-b" style={{ borderColor: 'var(--bis-border)', background: 'var(--bis-card)' }}>
        {/* Row 1: Time controls */}
        <div className="px-6 py-2 flex items-center gap-4 flex-wrap">
          {/* Date From */}
          <div className="flex items-center gap-1.5">
            <span className="col-header" style={{ color: 'var(--bis-muted)' }}>From</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono" style={{ borderColor: 'var(--bis-border)', color: 'var(--bis-fg)', background: 'var(--bis-card)' }}>
                  <CalendarIcon className="w-3.5 h-3.5" style={{ color: 'var(--bis-muted)' }} />
                  {dateFrom ? format(new Date(dateFrom), 'dd/MM/yyyy') : '—'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDateObj} onSelect={d => d && setDateFrom(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="flex items-center gap-1.5">
            <span className="col-header" style={{ color: 'var(--bis-muted)' }}>To</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono" style={{ borderColor: 'var(--bis-border)', color: 'var(--bis-fg)', background: 'var(--bis-card)' }}>
                  <CalendarIcon className="w-3.5 h-3.5" style={{ color: 'var(--bis-muted)' }} />
                  {dateTo ? format(new Date(dateTo), 'dd/MM/yyyy') : '—'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDateObj} onSelect={d => d && setDateTo(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ background: 'var(--bis-border)' }} />

          {/* Period shortcuts */}
          <div className="flex items-center gap-0.5 p-0.5 rounded border" style={{ borderColor: 'var(--bis-border)' }}>
            {PERIODS.map(p => (
              <button key={p.label} onClick={() => applyPeriod(p.days)} className="px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-tight hover:bg-black hover:text-white transition-all" style={{ color: 'var(--bis-muted)' }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ background: 'var(--bis-border)' }} />

          {/* Granularity */}
          <div className="flex items-center gap-1.5">
            <span className="col-header" style={{ color: 'var(--bis-muted)' }}>Gran.</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded border" style={{ borderColor: 'var(--bis-border)' }}>
              {GRANULARITIES.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  className={cn('px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-tight transition-all',
                    granularity === g.value ? 'bg-black text-white' : ''
                  )}
                  style={granularity !== g.value ? { color: 'var(--bis-muted)' } : {}}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ background: 'var(--bis-border)' }} />

          {/* View mode */}
          <div className="flex items-center gap-0.5 p-0.5 rounded border" style={{ borderColor: 'var(--bis-border)' }}>
            {([
              { val: 'charts' as ViewMode, icon: LineChart, label: 'Charts' },
              { val: 'table' as ViewMode, icon: Table2, label: 'Table' },
              { val: 'both' as ViewMode, icon: LayoutGrid, label: 'Both' },
            ]).map(v => (
              <button
                key={v.val}
                onClick={() => setViewMode(v.val)}
                className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold transition-all',
                  viewMode === v.val ? 'bg-black text-white' : ''
                )}
                style={viewMode !== v.val ? { color: 'var(--bis-muted)' } : {}}
              >
                <v.icon className="w-3 h-3" />
                {v.label}
              </button>
            ))}
          </div>

          {/* Layout */}
          {viewMode !== 'table' && (
            <>
              <div className="h-5 w-px" style={{ background: 'var(--bis-border)' }} />
              <div className="flex items-center gap-0.5 p-0.5 rounded border" style={{ borderColor: 'var(--bis-border)' }}>
                {([
                  { val: 1 as const, icon: Square },
                  { val: 2 as const, icon: Columns2 },
                  { val: 4 as const, icon: LayoutGrid },
                ]).map(l => (
                  <button
                    key={l.val}
                    onClick={() => setLayout(l.val)}
                    className={cn('p-1.5 rounded transition-all', layout === l.val ? 'bg-black text-white' : '')}
                    style={layout !== l.val ? { color: 'var(--bis-muted)' } : {}}
                  >
                    <l.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Apply */}
          <button
            onClick={fetchData}
            className="ml-auto px-5 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all hover:opacity-80"
            style={{ background: 'var(--bis-primary)', color: 'var(--bis-card)' }}
          >
            Apply
          </button>
        </div>

        {/* Row 2: KPI slots */}
        <div className="px-6 pb-1.5 flex items-center gap-2 flex-wrap">
          <span className="col-header" style={{ color: 'var(--bis-muted)' }}>KPIs</span>
          {slots.map(slot => {
            const info = getKpiInfo(slot.kpiKey);
            const name = info?.display_name || slot.kpiKey;
            const color = info?.color || '#000';
            return (
              <Popover key={slot.id}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-bold transition-all hover:bg-black hover:text-white group" style={{ borderColor: 'var(--bis-border)', color: 'var(--bis-fg)' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[140px]">{name}</span>
                    <Settings2 className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-3 space-y-3" align="start" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs font-bold truncate max-w-[120px]" style={{ color: 'var(--bis-fg)' }}>{name}</span>
                    </div>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setSelectorOpen(slot.id)}>
                      Change
                    </Button>
                  </div>
                  <div className="h-px" style={{ background: 'var(--bis-border)' }} />
                  {/* Chart Type */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--bis-muted)' }}>Type</span>
                    <div className="flex gap-1">
                      {CHART_TYPES.map(ct => (
                        <button key={ct.value} onClick={() => updateSlotConfig(slot.id, { chartType: ct.value })}
                          className={cn('flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono font-bold transition-all',
                            slot.config.chartType === ct.value ? 'bg-black text-white border-black' : ''
                          )}
                          style={slot.config.chartType !== ct.value ? { borderColor: 'var(--bis-border)', color: 'var(--bis-muted)' } : {}}
                        >
                          <ct.icon className="w-3 h-3" /> {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Toggles */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Smooth</span>
                    <Switch checked={slot.config.smooth} onCheckedChange={v => updateSlotConfig(slot.id, { smooth: v })} className="scale-75" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Line Width</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--bis-muted)' }}>{slot.config.lineWidth}px</span>
                    </div>
                    <Slider value={[slot.config.lineWidth]} onValueChange={v => updateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Markers</span>
                    <Switch checked={slot.config.showMarkers} onCheckedChange={v => updateSlotConfig(slot.id, { showMarkers: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Area</span>
                    <Switch checked={slot.config.showArea} onCheckedChange={v => updateSlotConfig(slot.id, { showArea: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Thresholds</span>
                    <Switch checked={slot.config.showThresholds} onCheckedChange={v => updateSlotConfig(slot.id, { showThresholds: v })} className="scale-75" />
                  </div>
                  <div className="h-px" style={{ background: 'var(--bis-border)' }} />
                  {slots.length > 1 && (
                    <button onClick={() => setSlots(prev => prev.filter(s => s.id !== slot.id))}
                      className="w-full text-[10px] font-mono font-bold py-1.5 rounded transition-colors text-destructive hover:bg-destructive/10">
                      Remove
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            );
          })}
          {slots.length < 4 && (
            <button onClick={() => setSelectorOpen('new')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-dashed text-[10px] font-mono font-bold transition-all hover:bg-black hover:text-white hover:border-black"
              style={{ borderColor: 'var(--bis-muted)', color: 'var(--bis-muted)' }}
            >
              <Plus className="w-3 h-3" /> Add KPI
            </button>
          )}
        </div>

        {/* Row 3: Filters */}
        <div className="px-6 pb-2 flex items-center gap-2 flex-wrap">
          <Filter className="w-3 h-3" style={{ color: 'var(--bis-muted)' }} />
          <span className="col-header" style={{ color: 'var(--bis-muted)' }}>Filters</span>
          {filters.flatMap(f => f.values.map(v => (
            <span key={`${f.dimension}-${v}`} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border" style={{ borderColor: 'var(--bis-border)', color: 'var(--bis-fg)' }}>
              <span style={{ color: 'var(--bis-muted)' }}>{f.dimension}:</span>
              <span className="font-bold">{v}</span>
              <button onClick={() => removeFilterValue(f.dimension, v)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
            </span>
          )))}
          <FilterAdder existingDims={filters.map(f => f.dimension)} onAdd={addFilter} />
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ background: 'var(--bis-bg)' }}>
        {/* Summary tiles */}
        {summaryData.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {summaryData.map(item => (
              <div key={item.kpi_key} className="p-3 rounded border" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
                <div className="col-header mb-1" style={{ color: 'var(--bis-muted)' }}>{item.display_name}</div>
                <div className="flex items-end gap-2">
                  <span className="text-lg font-mono font-bold tracking-tight" style={{ color: 'var(--bis-fg)' }}>
                    {item.value != null ? item.value.toFixed(2) : '—'}
                  </span>
                  <span className="text-[9px] font-mono mb-0.5" style={{ color: 'var(--bis-muted)' }}>{item.unit}</span>
                </div>
                {item.trend_pct != null && (
                  <div className={cn('flex items-center gap-0.5 text-[10px] font-mono mt-1',
                    item.trend_pct > 0 ? 'text-green-600' : item.trend_pct < 0 ? 'text-red-500' : ''
                  )} style={item.trend_pct === 0 ? { color: 'var(--bis-muted)' } : {}}>
                    {item.trend_pct > 0 ? <ArrowUpRight className="w-3 h-3" /> : item.trend_pct < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {Math.abs(item.trend_pct).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {viewMode !== 'table' && slots.length > 0 && (
          <div className={cn('grid gap-4', layout === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {slots.map(slot => (
              <ChartWidget key={slot.id} slot={slot} data={seriesData} catalog={catalog} chartHeight={layout === 1 ? 400 : layout === 4 ? 200 : 280} onOpenSelector={() => setSelectorOpen(slot.id)} onUpdateConfig={(u) => updateSlotConfig(slot.id, u)} onRemove={() => setSlots(prev => prev.filter(s => s.id !== slot.id))} canRemove={slots.length > 1} />
            ))}
          </div>
        )}

        {/* Table */}
        {viewMode !== 'charts' && tableData.length > 0 && (
          <div className="rounded border overflow-hidden" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--bis-border)' }}>
                  <th className="text-left px-4 py-2 col-header" style={{ color: 'var(--bis-muted)' }}>Entity</th>
                  {slots.map(s => {
                    const info = getKpiInfo(s.kpiKey);
                    return <th key={s.id} className="text-right px-4 py-2 col-header" style={{ color: 'var(--bis-muted)' }}>{info?.display_name || s.kpiKey}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 20).map((row, i) => (
                  <tr key={i} className="data-row" style={{ gridTemplateColumns: `1fr ${slots.map(() => '1fr').join(' ')}` }}>
                    <td className="px-4 py-2 font-bold" style={{ color: 'var(--bis-fg)' }}>{row.split_value}</td>
                    {slots.map(s => (
                      <td key={s.id} className="text-right px-4 py-2 data-value" style={{ color: 'var(--bis-fg)' }}>
                        {row[s.kpiKey] != null ? Number(row[s.kpiKey]).toFixed(2) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {slots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LineChart className="w-12 h-12" style={{ color: 'var(--bis-border)' }} />
            <div className="text-center">
              <p className="text-sm font-serif italic" style={{ color: 'var(--bis-muted)' }}>No KPIs selected</p>
              <p className="text-[11px] font-mono mt-1" style={{ color: 'var(--bis-muted)' }}>Click "Add KPI" to start</p>
            </div>
            <button onClick={() => setSelectorOpen('new')}
              className="px-5 py-2 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all hover:opacity-80"
              style={{ background: 'var(--bis-primary)', color: 'var(--bis-card)' }}
            >
              Add KPI
            </button>
          </div>
        )}
      </div>

      {/* KPI Selector Modal */}
      {createPortal(
        <KpiSelectorModal
          open={!!selectorOpen}
          onClose={() => setSelectorOpen(null)}
          catalog={catalog}
          selectedKeys={selectorOpen && selectorOpen !== 'new' ? [slots.find(s => s.id === selectorOpen)?.kpiKey || ''] : []}
          onConfirm={(keys) => {
            if (keys.length === 0) return;
            if (selectorOpen === 'new') {
              const newSlot: GraphSlot = { id: `slot-${Date.now()}`, kpiKey: keys[0], config: { ...DEFAULT_CONFIG } };
              setSlots(prev => [...prev, newSlot]);
            } else if (selectorOpen) {
              setSlots(prev => prev.map(s => s.id === selectorOpen ? { ...s, kpiKey: keys[0] } : s));
            }
            setSelectorOpen(null);
          }}
        />,
        document.body
      )}
    </div>
  );

  function updateSlotConfig(slotId: string, updates: Partial<SlotConfig>) {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, config: { ...s.config, ...updates } } : s));
  }
};

// ── Chart Widget ──
const ChartWidget: React.FC<{
  slot: GraphSlot;
  data: TimeseriesPoint[];
  catalog: KpiCatalogEntry[];
  chartHeight: number;
  onOpenSelector: () => void;
  onUpdateConfig: (u: Partial<SlotConfig>) => void;
  onRemove: () => void;
  canRemove: boolean;
}> = ({ slot, data, catalog, chartHeight, onOpenSelector, onUpdateConfig, onRemove, canRemove }) => {
  const info = catalog.find(k => k.kpi_key === slot.kpiKey);
  const name = info?.display_name || slot.kpiKey;
  const color = info?.color || '#000';
  const cfg = slot.config;

  const kpiData = data.filter(d => d.kpi_key === slot.kpiKey);
  const timestamps = [...new Set(kpiData.map(d => d.ts))].sort();
  const values = timestamps.map(ts => {
    const point = kpiData.find(d => d.ts === ts);
    return point?.value ?? null;
  });

  const seriesType = cfg.chartType === 'scatter' ? 'scatter' : cfg.chartType === 'bar' ? 'bar' : 'line';

  const option = {
    animation: true,
    grid: { top: 32, right: 16, bottom: 28, left: 48 },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#0f172a',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        return `<div style="font-size:10px;opacity:0.6;margin-bottom:2px;font-family:monospace">${new Date(p.axisValue).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
          <div><b style="font-family:monospace">${p.value?.toFixed(2)} ${info?.unit || ''}</b></div>`;
      },
    },
    xAxis: {
      type: 'category' as const,
      data: timestamps,
      axisLabel: { formatter: (v: string) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' },
      splitLine: { show: cfg.showGrid, lineStyle: { color: '#f1f5f9', type: 'dashed' as const } },
    },
    series: [{
      type: seriesType as any,
      data: values,
      smooth: cfg.smooth,
      symbol: cfg.showMarkers ? 'circle' : 'none',
      symbolSize: cfg.showMarkers ? 4 : 0,
      lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
      itemStyle: { color, borderRadius: seriesType === 'bar' ? [2, 2, 0, 0] : undefined },
      barMaxWidth: 16,
      areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
        color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}15` }, { offset: 1, color: `${color}02` }] },
      } : undefined,
      markLine: cfg.showThresholds && info?.thresholds ? {
        silent: true,
        data: [
          { yAxis: info.thresholds.warning, lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1 }, label: { show: false } },
          { yAxis: info.thresholds.critical, lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 }, label: { show: false } },
        ],
      } : undefined,
    }],
  };

  return (
    <div className="rounded border p-4" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold font-serif italic truncate" style={{ color: 'var(--bis-fg)' }}>{name}</span>
        <span className="text-[9px] font-mono ml-auto mr-1" style={{ color: 'var(--bis-muted)' }}>{info?.unit}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: 'var(--bis-muted)' }}>
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-3 space-y-3 z-50" align="end" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-serif italic" style={{ color: 'var(--bis-fg)' }}>{name}</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onOpenSelector}>Change</Button>
            </div>
            <div className="h-px" style={{ background: 'var(--bis-border)' }} />
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--bis-muted)' }}>Type</span>
              <div className="flex gap-1">
                {CHART_TYPES.map(ct => (
                  <button key={ct.value} onClick={() => onUpdateConfig({ chartType: ct.value })}
                    className={cn('flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono font-bold transition-all',
                      cfg.chartType === ct.value ? 'bg-black text-white border-black' : ''
                    )}
                    style={cfg.chartType !== ct.value ? { borderColor: 'var(--bis-border)', color: 'var(--bis-muted)' } : {}}
                  >
                    <ct.icon className="w-3 h-3" /> {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Smooth</span>
              <Switch checked={cfg.smooth} onCheckedChange={v => onUpdateConfig({ smooth: v })} className="scale-75" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Width</span>
                <span className="text-[9px] font-mono" style={{ color: 'var(--bis-muted)' }}>{cfg.lineWidth}px</span>
              </div>
              <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateConfig({ lineWidth: v[0] })} min={0.5} max={5} step={0.5} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Area</span>
              <Switch checked={cfg.showArea} onCheckedChange={v => onUpdateConfig({ showArea: v })} className="scale-75" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: 'var(--bis-fg)' }}>Thresholds</span>
              <Switch checked={cfg.showThresholds} onCheckedChange={v => onUpdateConfig({ showThresholds: v })} className="scale-75" />
            </div>
            {canRemove && (
              <>
                <div className="h-px" style={{ background: 'var(--bis-border)' }} />
                <button onClick={onRemove} className="w-full text-[10px] font-mono font-bold py-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors">Remove</button>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <ReactECharts option={option} style={{ height: chartHeight }} />
    </div>
  );
};

// ── Filter Adder ──
const FilterAdder: React.FC<{ existingDims: string[]; onAdd: (dim: string, val: string) => void }> = ({ existingDims, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-[10px] font-mono font-bold transition-all hover:text-black" style={{ color: 'var(--bis-muted)' }}>
          <Plus className="w-3 h-3" /> Filter
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start" style={{ background: 'var(--bis-card)', borderColor: 'var(--bis-border)' }}>
        {!selectedDim ? (
          <div className="space-y-0.5">
            {FILTER_DIMENSIONS.map(dim => (
              <button key={dim} onClick={() => setSelectedDim(dim)}
                className="w-full text-left px-3 py-1.5 rounded text-xs font-mono transition-all hover:bg-black hover:text-white"
                style={{ color: 'var(--bis-fg)' }}
              >
                {dim}
              </button>
            ))}
          </div>
        ) : (
          <FilterValues dim={selectedDim} onSelect={(v) => { onAdd(selectedDim, v); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
        )}
      </PopoverContent>
    </Popover>
  );
};

const FilterValues: React.FC<{ dim: string; onSelect: (v: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const values = useDimensionValues(dim);
  return (
    <div>
      <button onClick={onBack} className="text-[10px] font-mono px-2 py-1 hover:underline" style={{ color: 'var(--bis-muted)' }}>← {dim}</button>
      <div className="border-t mt-1 pt-1 max-h-[200px] overflow-y-auto" style={{ borderColor: 'var(--bis-border)' }}>
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] font-mono animate-pulse" style={{ color: 'var(--bis-muted)' }}>Loading...</div>
        ) : values.map(v => (
          <button key={v} onClick={() => onSelect(v)}
            className="w-full text-left px-3 py-1.5 rounded text-xs font-mono transition-all hover:bg-black hover:text-white"
            style={{ color: 'var(--bis-fg)' }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
};

export default KpiMonitorBisPage;
