import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart,
  ScatterChart, Layers, Columns3, PieChart, Hash, Paintbrush, Database, Check,
  Grid3X3, Calendar, Filter, GitBranch, Settings2, Palette,
  Zap, ArrowRight, BarChart2, Clock, Eye, CircleDot, Type
} from 'lucide-react';
import {
  ChartConfig, YMetricConfig, XAxisConfig, FilterConfig,
  BI_DIMENSIONS, BI_KPIS, CHART_COLORS, BIDimension, BIKPI,
  Aggregation, ChartType, Granularity, AxisSide, LineStyle, getKpiDisplayName
} from './biTypes';
import BIKpiSelectorModal from './BIKpiSelectorModal';
import { getDimensionValues } from './mockBIData';
import { useCSVData } from './CSVDataStore';
import { biQueryApi } from '@/lib/localDb';

interface Props {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  onClose: () => void;
}

const AGGREGATIONS: Aggregation[] = ['AVG', 'SUM', 'MAX', 'MIN', 'P50', 'P95'];
const GRANULARITIES: Granularity[] = ['hour', 'day', 'week', 'month'];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

const SIMPLE_PALETTE = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#84CC16', '#E11D48',
];

const BG_PALETTE = [
  'transparent', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#0f172a', '#1e293b', '#1a1a2e', '#fef9ef', '#f0fdf4',
  '#eff6ff', '#fdf2f8',
];

const TEXT_COLOR_PALETTE = [
  '', '#0f172a', '#1e293b', '#334155', '#64748b',
  '#ffffff', '#e2e8f0', '#2563EB', '#10B981', '#EF4444',
  '#F59E0B', '#8B5CF6',
];

const CHART_TYPE_OPTIONS: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'line', icon: <TrendingUp className="w-4 h-4" />, label: 'Ligne' },
  { type: 'line_dot', icon: <CircleDot className="w-4 h-4" />, label: 'Ligne•Pt' },
  { type: 'bar', icon: <BarChart3 className="w-4 h-4" />, label: 'Barres' },
  { type: 'area', icon: <AreaChart className="w-4 h-4" />, label: 'Aire' },
  { type: 'scatter', icon: <ScatterChart className="w-4 h-4" />, label: 'Scatter' },
  { type: 'stacked_bar', icon: <Layers className="w-4 h-4" />, label: 'Empilé' },
  { type: 'grouped_bar', icon: <Columns3 className="w-4 h-4" />, label: 'Superposé' },
  { type: 'heatmap', icon: <Grid3X3 className="w-4 h-4" />, label: 'Heatmap' },
  { type: 'pie', icon: <PieChart className="w-4 h-4" />, label: 'Pie' },
  { type: 'kpi_card', icon: <Hash className="w-4 h-4" />, label: 'KPI' },
];

const DATE_PRESETS = [
  { label: '24h', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

/* ─── FilterValuePicker ─── */
const FilterValuePicker: React.FC<{
  dimension: string;
  selected: string[];
  onChange: (vals: string[]) => void;
}> = ({ dimension, selected, onChange }) => {
  const [values, setValues] = useState<string[]>(getDimensionValues(dimension));
  useEffect(() => {
    let cancelled = false;
    biQueryApi.distinct(dimension).then(res => {
      if (!cancelled && Array.isArray(res) && res.length > 0) setValues(res);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dimension]);
  return (
    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
      {values.map(val => (
        <button
          key={val}
          onClick={() => {
            const vals = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
            onChange(vals);
          }}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all duration-150 ${
            selected.includes(val)
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/40'
          }`}
        >
          {val}
        </button>
      ))}
    </div>
  );
};

/* ─── Config Card (Notion/Linear style) ─── */
const ConfigCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  summary: string;
  badge?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ icon, title, summary, badge, open, onToggle, children }) => (
  <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
    open
      ? 'border-primary/30 bg-card shadow-sm'
      : 'border-border/50 bg-card hover:bg-muted/30 hover:border-border/80'
  }`}>
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3.5 py-3 text-left group"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${
        open ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-foreground block leading-tight">{title}</span>
        <span className="text-[11px] text-muted-foreground truncate block mt-0.5 leading-tight">{summary}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] font-bold tabular-nums shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight className={`w-4 h-4 text-muted-foreground/50 transition-transform duration-200 shrink-0 ${
        open ? 'rotate-90' : ''
      }`} />
    </button>
    <div className={`transition-all duration-200 ease-out ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
      <div className="px-3.5 pb-4 pt-0.5 space-y-3 border-t border-border/30">
        {children}
      </div>
    </div>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{children}</span>
);

const StyledSelect: React.FC<{
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}> = ({ value, options, onChange, className, placeholder }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-[12px] text-foreground
      outline-none transition-all duration-150
      focus:ring-2 focus:ring-primary/20 focus:border-primary/50
      hover:border-border appearance-none cursor-pointer ${className || ''}`}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const ColorDot: React.FC<{ color: string; selected: boolean; onClick: () => void; size?: number }> = ({
  color, selected, onClick, size = 18
}) => (
  <button
    onClick={onClick}
    className={`rounded-full border-2 transition-all duration-150 hover:scale-110 ${
      selected
        ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)] scale-110'
        : 'border-transparent hover:border-primary/30'
    }`}
    style={{
      width: size, height: size,
      background: color === 'transparent'
        ? 'repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%) 50% / 8px 8px'
        : color,
    }}
    title={color === 'transparent' ? 'Transparent' : color}
  />
);

const SegmentedControl: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-lg bg-muted/50 p-0.5 border border-border/30 gap-0.5">
    {options.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
          value === opt.value
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

/* ─── Main Panel ─── */

const ChartConfigPanel: React.FC<Props> = ({ config, onChange, onClose }) => {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const toggleCard = (id: string) => setOpenCard(prev => prev === id ? null : id);
  const { datasets } = useCSVData();

  const [draft, setDraft] = useState<ChartConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);
  const [availableDateRange, setAvailableDateRange] = useState<{ min_date: string | null; max_date: string | null }>({ min_date: null, max_date: null });
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiModalTarget, setKpiModalTarget] = useState<{ type: 'metric'; index: number } | { type: 'xAxis' } | { type: 'sizeBy' } | null>(null);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<number>>(new Set());
  const toggleMetricExpand = (idx: number) => setExpandedMetrics(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-detect available date range from local DB
  useEffect(() => {
    biQueryApi.dateRange().then(range => {
      setAvailableDateRange(range);
      if (range.min_date && range.max_date) {
        const currentStart = draft.xAxis.dateStart || '';
        const currentEnd = draft.xAxis.dateEnd || '';
        const dataStart = range.min_date;
        const dataEnd = range.max_date;
        if (!currentStart || !currentEnd || currentStart === '2026-02-01' || currentEnd === '2026-02-15' ||
            currentStart > dataEnd || currentEnd < dataStart) {
          const start = new Date(dataEnd);
          start.setDate(start.getDate() - 14);
          const autoStart = start.toISOString().split('T')[0] < dataStart ? dataStart : start.toISOString().split('T')[0];
          setDraft(prev => ({
            ...prev,
            xAxis: { ...prev.xAxis, dateStart: autoStart, dateEnd: dataEnd }
          }));
          setDirty(true);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setDirty(false);
  }, [config.id]);

  const update = (partial: Partial<ChartConfig>) => {
    setDraft(prev => ({ ...prev, ...partial }));
    setDirty(true);
  };
  const updateX = (partial: Partial<XAxisConfig>) => update({ xAxis: { ...draft.xAxis, ...partial } });

  const updateMetric = (idx: number, partial: Partial<YMetricConfig>) => {
    const metrics = [...draft.yMetrics];
    metrics[idx] = { ...metrics[idx], ...partial };
    update({ yMetrics: metrics });
  };

  const addMetric = () => {
    const used = draft.yMetrics.map(m => m.kpi);
    const next = BI_KPIS.find(k => !used.includes(k)) || BI_KPIS[0];
    update({
      yMetrics: [...draft.yMetrics, {
        kpi: next, aggregation: 'AVG', axis: 'left',
        chartType: 'line', color: CHART_COLORS[draft.yMetrics.length % CHART_COLORS.length],
        showMovingAvg: false, smoothCurve: true,
      }]
    });
  };

  const removeMetric = (idx: number) => {
    update({ yMetrics: draft.yMetrics.filter((_, i) => i !== idx) });
  };

  const addFilter = () => {
    const used = draft.filters.map(f => f.dimension);
    const next = BI_DIMENSIONS.find(d => !used.includes(d)) || BI_DIMENSIONS[0];
    update({ filters: [...draft.filters, { dimension: next, values: [] }] });
  };

  const updateFilter = (idx: number, partial: Partial<FilterConfig>) => {
    const filters = [...draft.filters];
    filters[idx] = { ...filters[idx], ...partial };
    update({ filters });
  };

  const removeFilter = (idx: number) => {
    update({ filters: draft.filters.filter((_, i) => i !== idx) });
  };

  const handleApply = () => {
    onChange(draft);
    setDirty(false);
  };

  const applyDatePreset = (days: number) => {
    const endDate = availableDateRange.max_date ? new Date(availableDateRange.max_date) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    const minDate = availableDateRange.min_date;
    const startStr = minDate && startDate.toISOString().split('T')[0] < minDate ? minDate : startDate.toISOString().split('T')[0];
    updateX({
      dateStart: startStr,
      dateEnd: endDate.toISOString().split('T')[0],
    });
  };

  // Summaries for cards
  const formatDate = (d: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };
  const timeRangeSummary = `${formatDate(draft.xAxis.dateStart)} → ${formatDate(draft.xAxis.dateEnd)}`;
  const granularitySummary = (draft.xAxis.granularity || 'day').charAt(0).toUpperCase() + (draft.xAxis.granularity || 'day').slice(1);
  const dimension1Summary = draft.dimension1 || 'Toutes dimensions';
  const kpiSummary = draft.yMetrics.length === 0
    ? 'No KPI selected'
    : draft.yMetrics.map(m => getKpiDisplayName(m.kpi)).join(', ');
  const filterSummary = draft.filters.length === 0
    ? 'No active filters'
    : draft.filters.map(f => `${f.dimension}: ${f.values.length > 0 ? f.values.slice(0, 2).join(', ') : 'All'}`).join(' · ');
  const groupBySummary = draft.groupBy.length === 0 && !draft.colorBy && !draft.sizeBy
    ? 'None'
    : [draft.groupBy[0] && `Agg: ${draft.groupBy[0]}`, draft.colorBy && `Color: ${draft.colorBy}`, draft.sizeBy && `Size: ${draft.sizeBy}`].filter(Boolean).join(' · ');

  return (
    <div className="w-[360px] h-full bg-background border-l border-border/40 flex flex-col overflow-hidden">

      {/* ─── Header ─── */}
      <div className="px-5 py-4 border-b border-border/40 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={draft.title}
                onChange={e => update({ title: e.target.value })}
                className="w-full bg-transparent text-[15px] font-bold text-foreground outline-none
                  border-b border-transparent focus:border-primary/40
                  transition-all duration-200 placeholder:text-muted-foreground/40 truncate"
                placeholder="Chart title…"
              />
              <input
                value={draft.description || ''}
                onChange={e => update({ description: e.target.value })}
                className="w-full bg-transparent text-[11px] text-muted-foreground mt-0.5 leading-tight outline-none
                  border-b border-transparent focus:border-primary/20 transition-all placeholder:text-muted-foreground/40"
                placeholder="Description…"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                showAdvanced ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-muted-foreground'
              }`}
              title="Advanced Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Advanced Settings dropdown */}
        <div className={`transition-all duration-200 ease-out ${showAdvanced ? 'max-h-[400px] opacity-100 mt-4' : 'max-h-0 opacity-0 overflow-hidden'}`}>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-[12px] text-foreground font-medium">Legend</span>
                <Switch
                  checked={draft.advanced.showLegend}
                  onCheckedChange={v => update({ advanced: { ...draft.advanced, showLegend: v } })}
                />
              </div>
              {draft.advanced.showLegend && (
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-[12px] text-muted-foreground">Position</span>
                  <div className="flex gap-1">
                    {(['bottom', 'top', 'left', 'right'] as const).map(pos => (
                      <button
                        key={pos}
                        onClick={() => update({ advanced: { ...draft.advanced, legendPosition: pos } })}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-all ${
                          (draft.advanced.legendPosition || 'bottom') === pos
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="h-px bg-border/30" />
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Paintbrush className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Background</FieldLabel>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border">
                {BG_PALETTE.map(c => (
                  <ColorDot key={c} color={c} size={20}
                    selected={(draft.advanced.backgroundColor || 'transparent') === c}
                    onClick={() => update({ advanced: { ...draft.advanced, backgroundColor: c } })}
                  />
                ))}
              </div>
            </div>
            <div className="h-px bg-border/30" />
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Header Text Color</FieldLabel>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border">
                {TEXT_COLOR_PALETTE.map(c => (
                  <ColorDot key={c || 'default'} color={c || 'currentColor'} size={20}
                    selected={(draft.advanced.headerTextColor || '') === c}
                    onClick={() => update({ advanced: { ...draft.advanced, headerTextColor: c } })}
                  />
                ))}
              </div>
            </div>
            <div className="h-px bg-border/30" />
            <div className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <Grid3X3 className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[12px] text-foreground font-medium">Grid</span>
              </div>
              <Switch
                checked={draft.advanced.showGrid !== false}
                onCheckedChange={v => update({ advanced: { ...draft.advanced, showGrid: v } })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Y Axis Range</FieldLabel>
              </div>
              <div className="flex gap-1 mb-2">
                {(['auto', 'fixed'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => update({ advanced: { ...draft.advanced, yAxisMode: mode } })}
                    className={`px-3 py-1 rounded-md text-[10px] font-semibold capitalize transition-all ${
                      (draft.advanced.yAxisMode || 'auto') === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {mode === 'auto' ? 'Auto' : 'Fixe'}
                  </button>
                ))}
              </div>
              {(draft.advanced.yAxisMode || 'auto') === 'fixed' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Min</label>
                    <input
                      type="number"
                      value={draft.advanced.yAxisMin ?? ''}
                      onChange={e => update({ advanced: { ...draft.advanced, yAxisMin: e.target.value === '' ? null : Number(e.target.value) } })}
                      className="w-full px-2 py-1 rounded-md bg-muted/50 border border-border/40 text-foreground text-[11px]"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Max</label>
                    <input
                      type="number"
                      value={draft.advanced.yAxisMax ?? ''}
                      onChange={e => update({ advanced: { ...draft.advanced, yAxisMax: e.target.value === '' ? null : Number(e.target.value) } })}
                      className="w-full px-2 py-1 rounded-md bg-muted/50 border border-border/40 text-foreground text-[11px]"
                      placeholder="100"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Data / Voix toggle */}
        <div className="flex items-center gap-2 mt-3">
          <SegmentedControl
            options={[
              { value: 'data', label: 'Data' },
              { value: 'voix', label: 'Voix' },
            ]}
            value={draft.dataMode || 'data'}
            onChange={v => update({ dataMode: v as 'data' | 'voix' })}
          />
        </div>
      </div>

      {/* ─── Scrollable Cards ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 scrollbar-thin">

        {/* ── DATA SOURCE (CSV) ── */}
        {datasets.length > 0 && (
          <ConfigCard
            icon={<Database className="w-4 h-4" />}
            title="Data Source"
            summary={draft.dataSource?.type === 'csv' ? `CSV: ${draft.dataSource.csvDatasetId || '—'}` : 'Simulated data'}
            open={openCard === 'source'}
            onToggle={() => toggleCard('source')}
          >
            <div className="flex gap-2 pt-2">
              {[
                { type: 'mock' as const, label: 'Simulated', icon: <Zap className="w-3.5 h-3.5" /> },
                { type: 'csv' as const, label: 'CSV', icon: <Database className="w-3.5 h-3.5" /> },
              ].map(src => (
                <button
                  key={src.type}
                  onClick={() => update({ dataSource: { type: src.type, ...(src.type === 'csv' ? { csvDatasetId: datasets[0]?.id } : {}) } })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium border transition-all duration-150 ${
                    ((!draft.dataSource || draft.dataSource.type === 'mock') && src.type === 'mock') ||
                    (draft.dataSource?.type === 'csv' && src.type === 'csv')
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {src.icon} {src.label}
                </button>
              ))}
            </div>
            {draft.dataSource?.type === 'csv' && (() => {
              const ds = datasets.find(d => d.id === draft.dataSource?.csvDatasetId);
              if (!ds) return null;
              return (
                <div className="space-y-3 pt-1">
                  <StyledSelect
                    value={draft.dataSource.csvDatasetId || ''}
                    options={datasets.map(d => d.id)}
                    onChange={v => update({ dataSource: { ...draft.dataSource!, csvDatasetId: v } })}
                  />
                  <div className="space-y-1.5">
                    <FieldLabel>Column X</FieldLabel>
                    <StyledSelect
                      value={draft.dataSource?.xColumn || ds.columns[0]}
                      options={ds.columns}
                      onChange={v => update({ dataSource: { ...draft.dataSource!, xColumn: v } })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Columns Y</FieldLabel>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {ds.columns.filter(c => c !== (draft.dataSource?.xColumn || ds.columns[0])).map(col => {
                        const selected = draft.dataSource?.yColumns?.includes(col);
                        return (
                          <button
                            key={col}
                            onClick={() => {
                              const current = draft.dataSource?.yColumns || [];
                              const next = selected ? current.filter(c => c !== col) : [...current, col];
                              update({ dataSource: { ...draft.dataSource!, yColumns: next } });
                            }}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all duration-150 ${
                              selected
                                ? 'bg-primary/10 text-primary border-primary/30'
                                : 'bg-background text-muted-foreground border-border/50 hover:border-primary/30'
                            }`}
                          >
                            {col}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </ConfigCard>
        )}

        {/* ── X AXIS ── */}
        <ConfigCard
          icon={<ArrowRight className="w-4 h-4" />}
          title="X Axis"
          summary={draft.xAxis.type === 'dimension' ? `Dimension · ${draft.dimension1 || '—'}` : `Date · ${granularitySummary}`}
          open={openCard === 'xaxis'}
          onToggle={() => toggleCard('xaxis')}
        >
          <div className="pt-2 space-y-4">
            <SegmentedControl
              options={[
                { value: 'date', label: 'Date' },
                { value: 'dimension', label: 'Dimension' },
              ]}
              value={draft.xAxis.type || 'date'}
              onChange={v => updateX({ type: v as 'date' | 'dimension' })}
            />

            {/* Date sub-section */}
            {(draft.xAxis.type || 'date') === 'date' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <FieldLabel>Start</FieldLabel>
                      <input
                        type="date"
                        value={draft.xAxis.dateStart}
                        onChange={e => updateX({ dateStart: e.target.value })}
                        className="w-full bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                          outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                          hover:border-border transition-all duration-150"
                      />
                    </div>
                    <div className="pb-2.5">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <FieldLabel>End</FieldLabel>
                      <input
                        type="date"
                        value={draft.xAxis.dateEnd}
                        onChange={e => updateX({ dateEnd: e.target.value })}
                        className="w-full bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                          outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                          hover:border-border transition-all duration-150"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Quick Presets</FieldLabel>
                    <div className="flex gap-1.5">
                      {DATE_PRESETS.map(p => (
                        <button
                          key={p.label}
                          onClick={() => applyDatePreset(p.days)}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-border/50
                            text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5
                            transition-all duration-150"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-border/30" />
                <div className="space-y-1.5">
                  <FieldLabel>Granularity</FieldLabel>
                  <SegmentedControl
                    options={GRANULARITIES.map(g => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))}
                    value={draft.xAxis.granularity || 'day'}
                    onChange={v => updateX({ granularity: v as Granularity })}
                  />
                </div>
              </div>
            )}

            {/* Dimension sub-section */}
            {draft.xAxis.type === 'dimension' && (
              <div className="space-y-1.5">
                <FieldLabel>Dimension 1</FieldLabel>
                <select
                  value={draft.dimension1 || ''}
                  onChange={e => update({ dimension1: e.target.value as any })}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-[12px] text-foreground
                    outline-none transition-all duration-150 cursor-pointer
                    focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                    hover:border-border appearance-none"
                >
                  <option value="">Select dimension…</option>
                  {BI_DIMENSIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </ConfigCard>



        {/* ── KPI SELECTION (Y Axis) ── */}
        <ConfigCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="KPI Selection (Y Axis)"
          summary={kpiSummary}
          badge={draft.yMetrics.length}
          open={openCard === 'kpi'}
          onToggle={() => toggleCard('kpi')}
        >
          {/* Add Metrics CTA */}
          <button
            onClick={() => { setKpiModalTarget({ type: 'metric', index: -1 }); setKpiModalOpen(true); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/50 bg-muted/10
              hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 group mt-2"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center
              group-hover:bg-primary/20 transition-colors duration-200">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <span className="text-[12px] font-semibold text-foreground block">Add Metrics</span>
              <span className="text-[10px] text-muted-foreground">Select KPIs to visualize</span>
            </div>
          </button>

          {/* Metric cards */}
          <div className="space-y-2">
            {draft.yMetrics.map((m, i) => {
              const isExpanded = expandedMetrics.has(i);
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border/40 bg-card/40 overflow-hidden transition-all duration-200 hover:border-border/70"
                >
                  <div className="flex items-stretch">
                    <div className="w-1 rounded-l-xl shrink-0" style={{ background: m.color }} />
                    <div className="flex-1 px-3 py-2.5 space-y-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setKpiModalTarget({ type: 'metric', index: i }); setKpiModalOpen(true); }}
                          className="flex-1 text-left text-[12px] font-bold text-foreground truncate
                            hover:text-primary transition-colors duration-150 cursor-pointer"
                        >
                          {getKpiDisplayName(m.kpi)}
                        </button>
                        <button
                          onClick={() => toggleMetricExpand(i)}
                          className="w-6 h-6 rounded-md flex items-center justify-center
                            text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all duration-150"
                          title="Settings"
                        >
                          <Settings2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeMetric(i)}
                          className="w-6 h-6 rounded-md flex items-center justify-center
                            text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Collapsible settings */}
                      <div className={`transition-all duration-200 ease-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        <div className="space-y-4 pb-1">

                          {/* ── Visualization (Chart Type) ── */}
                          <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2.5">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <span className="text-[12px] font-bold text-foreground">Visualization</span>
                                <span className="text-[10px] text-muted-foreground ml-2">
                                  {CHART_TYPE_OPTIONS.find(o => o.type === m.chartType)?.label || 'Ligne'} chart
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {CHART_TYPE_OPTIONS.map(opt => (
                                <button
                                  key={opt.type}
                                  onClick={() => updateMetric(i, { chartType: opt.type })}
                                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-all duration-200 ${
                                    m.chartType === opt.type
                                      ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                                      : 'bg-background text-muted-foreground border-border/40 hover:border-primary/30 hover:text-foreground hover:bg-muted/30'
                                  }`}
                                >
                                  {opt.icon}
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* ── Axis + Toggles ── */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5">
                              <FieldLabel>Axis</FieldLabel>
                              <SegmentedControl
                                options={[
                                  { value: 'left', label: 'Left' },
                                  { value: 'right', label: 'Right' },
                                ]}
                                value={m.axis}
                                onChange={v => updateMetric(i, { axis: v as AxisSide })}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                <Switch
                                  checked={m.smoothCurve}
                                  onCheckedChange={v => updateMetric(i, { smoothCurve: v })}
                                  className="scale-[0.8] origin-left"
                                />
                                <span className="text-[11px] font-medium text-muted-foreground group-hover/toggle:text-foreground transition-colors">Smooth</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                <Switch
                                  checked={m.showMovingAvg}
                                  onCheckedChange={v => updateMetric(i, { showMovingAvg: v })}
                                  className="scale-[0.8] origin-left"
                                />
                                <span className="text-[11px] font-medium text-muted-foreground group-hover/toggle:text-foreground transition-colors">Moving Avg</span>
                              </label>
                            </div>
                          </div>

                          {/* ── Color palette ── */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Palette className="w-3 h-3 text-muted-foreground/60" />
                              <FieldLabel>Color</FieldLabel>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {SIMPLE_PALETTE.map(c => (
                                <ColorDot key={c} color={c} selected={m.color === c} onClick={() => updateMetric(i, { color: c })} size={18} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ConfigCard>

        {/* ── FILTERS ── */}
        <ConfigCard
          icon={<Filter className="w-4 h-4" />}
          title="Filters"
          summary={filterSummary}
          badge={draft.filters.length > 0 ? draft.filters.length : undefined}
          open={openCard === 'filters'}
          onToggle={() => toggleCard('filters')}
        >
          <div className="space-y-2.5 pt-2">
            {draft.filters.map((f, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <StyledSelect
                    value={f.dimension}
                    options={BI_DIMENSIONS}
                    onChange={v => updateFilter(i, { dimension: v as BIDimension, values: [] })}
                    className="flex-1"
                  />
                  <button
                    onClick={() => removeFilter(i)}
                    className="w-6 h-6 rounded-md flex items-center justify-center
                      text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <FilterValuePicker dimension={f.dimension} selected={f.values} onChange={vals => updateFilter(i, { values: vals })} />
              </div>
            ))}
          </div>
          <button
            onClick={addFilter}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border/50
              text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40
              transition-all duration-200 hover:bg-primary/5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Filter
          </button>
        </ConfigCard>

        {/* ── AGGREGATION ── */}
        <ConfigCard
          icon={<GitBranch className="w-4 h-4" />}
          title="Aggregation"
          summary={groupBySummary}
          open={openCard === 'group'}
          onToggle={() => toggleCard('group')}
        >
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <FieldLabel>Aggregation</FieldLabel>
              <StyledSelect
                value={draft.groupBy[0] || ''}
                options={['', ...BI_DIMENSIONS] as any}
                onChange={v => update({ groupBy: v ? [v as BIDimension] : [] })}
                placeholder="None"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Color By</FieldLabel>
              <StyledSelect
                value={draft.colorBy || ''}
                options={['', ...BI_DIMENSIONS] as any}
                onChange={v => update({ colorBy: v ? v as BIDimension : undefined })}
                placeholder="None"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Size By</FieldLabel>
              <StyledSelect
                value={draft.sizeBy || ''}
                options={['', ...BI_DIMENSIONS] as any}
                onChange={v => update({ sizeBy: v ? v as BIDimension : undefined })}
                placeholder="None"
              />
            </div>
          </div>
        </ConfigCard>


      </div>

      {/* ─── Apply Button ─── */}
      <div className="px-5 py-4 border-t border-border/40 bg-card/50">
        <button
          onClick={handleApply}
          disabled={!dirty}
          className={`w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-bold
            tracking-wide transition-all duration-200 ${
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]'
              : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4" />
          {dirty ? 'Apply Changes' : 'Up to date'}
        </button>
      </div>

      {/* KPI Selector Modal */}
      <BIKpiSelectorModal
        open={kpiModalOpen}
        onClose={() => { setKpiModalOpen(false); setKpiModalTarget(null); }}
        selectedKeys={
          kpiModalTarget?.type === 'metric'
            ? draft.yMetrics.map(m => m.kpi)
            : kpiModalTarget?.type === 'xAxis'
              ? [draft.xAxis.value].filter(Boolean)
              : kpiModalTarget?.type === 'sizeBy'
                ? []
                : []
        }
        single={kpiModalTarget?.type !== 'metric' || (kpiModalTarget?.type === 'metric' && kpiModalTarget.index >= 0)}
        onConfirm={(keys) => {
          if (!kpiModalTarget) return;
          if (kpiModalTarget.type === 'metric') {
            if (kpiModalTarget.index >= 0 && keys.length === 1) {
              const metrics = [...draft.yMetrics];
              metrics[kpiModalTarget.index] = {
                ...metrics[kpiModalTarget.index],
                kpi: keys[0] as BIKPI,
              };
              update({ yMetrics: metrics });
            } else {
              const existingMap = new Map(draft.yMetrics.map(m => [m.kpi, m]));
              const newMetrics: YMetricConfig[] = keys.map((key, idx) => {
                const existing = existingMap.get(key as BIKPI);
                if (existing) return existing;
                return {
                  kpi: key as BIKPI,
                  aggregation: 'AVG' as Aggregation,
                  axis: 'left' as AxisSide,
                  chartType: 'line' as ChartType,
                  color: CHART_COLORS[idx % CHART_COLORS.length],
                  showMovingAvg: false,
                  smoothCurve: true,
                };
              });
              update({ yMetrics: newMetrics });
            }
          } else if (kpiModalTarget.type === 'xAxis') {
            updateX({ value: keys[0] });
          } else if (kpiModalTarget.type === 'sizeBy') {
            // no-op, sizeBy now uses dimension dropdown
          }
        }}
      />
    </div>
  );
};

export default ChartConfigPanel;
