import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart,
  ScatterChart, Layers, Columns3, PieChart, Hash, Paintbrush, Database, Check,
  Grid3X3, ArrowLeftRight, Calendar, Filter, GitBranch, Settings2, Palette,
  GripVertical, Zap, Target, Milestone, ArrowRight, BarChart2
} from 'lucide-react';
import {
  ChartConfig, YMetricConfig, XAxisConfig, FilterConfig, ThresholdLine,
  MilestoneLine, BI_DIMENSIONS, BI_KPIS, CHART_COLORS, BIDimension, BIKPI,
  Aggregation, ChartType, Granularity, AxisSide, LineStyle, KPI_UNITS, getKpiDisplayName
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

const CHART_TYPE_OPTIONS: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'line', icon: <TrendingUp className="w-4 h-4" />, label: 'Ligne' },
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
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
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

/* ─── Section Header (category label) ─── */
const SectionCategory: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-1 pt-2 pb-1">
    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">{children}</span>
  </div>
);

/* ─── Section Card ─── */
const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  toggle: () => void;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, icon, open, toggle, badge, children }) => (
  <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden transition-all duration-200 hover:border-border/70">
    <button
      onClick={toggle}
      className="flex items-center gap-2.5 w-full px-4 py-3.5 text-left group transition-colors hover:bg-muted/20"
    >
      <span className="text-primary/70 group-hover:text-primary transition-colors">{icon}</span>
      <span className="text-[13px] font-semibold text-foreground flex-1 tracking-tight">{title}</span>
      {badge && (
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tabular-nums min-w-[22px] text-center">
          {badge}
        </span>
      )}
      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} />
    </button>
    <div className={`transition-all duration-200 ease-out ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
      <div className="px-4 pb-5 pt-1 space-y-4">
        {children}
      </div>
    </div>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">{children}</span>
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
    className={`w-full bg-background border border-border/60 rounded-lg px-3 py-2.5 text-[13px] text-foreground
      outline-none transition-all duration-150
      focus:ring-2 focus:ring-primary/20 focus:border-primary/50
      hover:border-border appearance-none cursor-pointer ${className || ''}`}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const ColorDot: React.FC<{ color: string; selected: boolean; onClick: () => void; size?: number }> = ({
  color, selected, onClick, size = 20
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
  <div className="inline-flex rounded-lg bg-muted/50 p-1 border border-border/30 gap-0.5">
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
  const [sections, setSections] = useState({
    source: false, x: true, y: true, filters: false, group: false, advanced: false
  });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
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

  return (
    <div className="w-[360px] h-full bg-background border-l border-border/40 flex flex-col overflow-hidden">

      {/* ─── Header with inline date range ─── */}
      <div className="px-5 py-4 border-b border-border/40 bg-card/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={draft.title}
                onChange={e => update({ title: e.target.value })}
                className="w-full bg-transparent text-sm font-bold text-foreground outline-none
                  border-b border-transparent focus:border-primary/40
                  transition-all duration-200 placeholder:text-muted-foreground/40 truncate"
                placeholder="Titre du graphique…"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">Configure chart settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Inline date range always visible */}
        {draft.xAxis.type === 'date' && (
          <div className="space-y-2.5">
            <div className="flex items-end gap-1.5">
              <div className="flex-1 space-y-1">
                <FieldLabel>Start</FieldLabel>
                <input
                  type="date"
                  value={draft.xAxis.dateStart}
                  onChange={e => updateX({ dateStart: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[11px] text-foreground
                    outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                    hover:border-border transition-all duration-150"
                />
              </div>
              <div className="pb-2">
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
              <div className="flex-1 space-y-1">
                <FieldLabel>End</FieldLabel>
                <input
                  type="date"
                  value={draft.xAxis.dateEnd}
                  onChange={e => updateX({ dateEnd: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[11px] text-foreground
                    outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                    hover:border-border transition-all duration-150"
                />
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel>Granularity</FieldLabel>
              <SegmentedControl
                options={GRANULARITIES.map(g => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))}
                value={draft.xAxis.granularity || 'day'}
                onChange={v => updateX({ granularity: v as Granularity })}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── Scrollable Sections ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-thin">

        {/* ═══ DATA ═══ */}
        <SectionCategory>Data</SectionCategory>

        {/* ── DATA SOURCE ── */}
        {datasets.length > 0 && (
          <SectionCard
            title="Source de données"
            icon={<Database className="w-4 h-4" />}
            open={sections.source}
            toggle={() => toggle('source')}
          >
            <div className="flex gap-2">
              {[
                { type: 'mock' as const, label: 'Simulé', icon: <Zap className="w-3.5 h-3.5" /> },
                { type: 'csv' as const, label: 'CSV', icon: <Database className="w-3.5 h-3.5" /> },
              ].map(src => (
                <button
                  key={src.type}
                  onClick={() => update({ dataSource: { type: src.type, ...(src.type === 'csv' ? { csvDatasetId: datasets[0]?.id } : {}) } })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium border transition-all duration-150 ${
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
            {draft.dataSource?.type === 'csv' && (
              <div className="space-y-3 pt-1">
                <StyledSelect
                  value={draft.dataSource.csvDatasetId || ''}
                  options={datasets.map(ds => ds.id)}
                  onChange={v => update({ dataSource: { ...draft.dataSource!, csvDatasetId: v } })}
                />
                {(() => {
                  const ds = datasets.find(d => d.id === draft.dataSource?.csvDatasetId);
                  if (!ds) return null;
                  return (
                    <>
                      <div className="space-y-1.5">
                        <FieldLabel>Colonne X</FieldLabel>
                        <StyledSelect
                          value={draft.dataSource?.xColumn || ds.columns[0]}
                          options={ds.columns}
                          onChange={v => update({ dataSource: { ...draft.dataSource!, xColumn: v } })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Colonnes Y</FieldLabel>
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
                    </>
                  );
                })()}
              </div>
            )}
          </SectionCard>
        )}

        {/* Date Range moved to header — X-axis type selector kept here for non-date modes */}
        {draft.xAxis.type !== 'date' && (
          <SectionCard
            title="X Axis"
            icon={<Calendar className="w-4 h-4" />}
            open={sections.x}
            toggle={() => toggle('x')}
          >
            <div className="flex items-center gap-2">
              <SegmentedControl
                options={[
                  { value: 'date', label: 'Date' },
                  { value: 'dimension', label: 'Dimension' },
                  { value: 'kpi', label: 'KPI' },
                ]}
                value={draft.xAxis.type}
                onChange={v => updateX({ type: v as any })}
              />
            </div>
            {draft.xAxis.type === 'dimension' && (
              <StyledSelect value={draft.xAxis.value} options={BI_DIMENSIONS} onChange={v => updateX({ value: v })} />
            )}
            {draft.xAxis.type === 'kpi' && (
              <button
                onClick={() => { setKpiModalTarget({ type: 'xAxis' }); setKpiModalOpen(true); }}
                className="w-full text-left bg-background border border-border/60 rounded-lg px-3 py-2.5 text-[13px] text-foreground hover:border-primary/40 transition-all"
              >
                {getKpiDisplayName(draft.xAxis.value) || 'Sélectionner un KPI…'}
              </button>
            )}
          </SectionCard>
        )}

        {/* ═══ METRICS ═══ */}
        <SectionCategory>Metrics</SectionCategory>

        {/* ── Y AXIS (METRICS) ── */}
        <SectionCard
          title="KPI Selection"
          icon={<TrendingUp className="w-4 h-4" />}
          open={sections.y}
          toggle={() => toggle('y')}
          badge={`${draft.yMetrics.length}`}
        >
          {/* Add Metrics CTA */}
          <button
            onClick={() => { setKpiModalTarget({ type: 'metric', index: -1 }); setKpiModalOpen(true); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/20
              hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center
              group-hover:bg-primary/20 transition-colors duration-200">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <span className="text-[13px] font-semibold text-foreground block">Add Metrics</span>
              <span className="text-[11px] text-muted-foreground">Select KPIs to visualize</span>
            </div>
          </button>

          {/* Metric cards */}
          <div className="space-y-3">
            {draft.yMetrics.map((m, i) => {
              const isExpanded = expandedMetrics.has(i);
              return (
              <div
                key={i}
                className="rounded-xl border border-border/40 bg-card/40 overflow-hidden transition-all duration-200 hover:border-border/70 hover:shadow-sm"
              >
                {/* Metric header with colored accent */}
                <div className="flex items-stretch">
                  <div className="w-1 rounded-l-xl shrink-0" style={{ background: m.color }} />
                  <div className="flex-1 px-3 py-2.5 space-y-0">
                    {/* Top row: KPI name + expand toggle + delete */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setKpiModalTarget({ type: 'metric', index: i }); setKpiModalOpen(true); }}
                        className="flex-1 text-left text-[13px] font-bold text-foreground truncate
                          hover:text-primary transition-colors duration-150 cursor-pointer"
                      >
                        {getKpiDisplayName(m.kpi)}
                      </button>
                      <button
                        onClick={() => toggleMetricExpand(i)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center
                          text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all duration-150"
                        title="Settings"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeMetric(i)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center
                          text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Collapsible settings */}
                    <div className={`transition-all duration-200 ease-out ${isExpanded ? 'max-h-[600px] opacity-100 mt-3' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                      <div className="space-y-3 pb-1">
                        {/* Chart Type */}
                        <div className="space-y-1.5">
                          <FieldLabel>Chart Type</FieldLabel>
                          <TooltipProvider delayDuration={200}>
                            <div className="grid grid-cols-9 gap-1">
                              {CHART_TYPE_OPTIONS.map(opt => (
                                <Tooltip key={opt.type}>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => updateMetric(i, { chartType: opt.type })}
                                      className={`aspect-square flex items-center justify-center rounded-lg border transition-all duration-200 ${
                                        m.chartType === opt.type
                                          ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 scale-105'
                                          : 'bg-muted/20 text-muted-foreground border-transparent hover:border-border/60 hover:text-foreground hover:bg-muted/40'
                                      }`}
                                    >
                                      {opt.icon}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-[11px]">{opt.label}</TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        </div>

                        {/* Axis + Toggles */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
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
                          <div className="space-y-1.5">
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

                        {/* Color picker */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Palette className="w-3 h-3 text-muted-foreground/60" />
                            <FieldLabel>Color</FieldLabel>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
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
        </SectionCard>

        {/* ═══ VISUALIZATION ═══ */}
        <SectionCategory>Filters & Groups</SectionCategory>

        {/* ── FILTERS ── */}
        <SectionCard
          title="Filters"
          icon={<Filter className="w-4 h-4" />}
          open={sections.filters}
          toggle={() => toggle('filters')}
          badge={draft.filters.length > 0 ? `${draft.filters.length}` : undefined}
        >
          <div className="space-y-3">
            {draft.filters.map((f, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <StyledSelect
                    value={f.dimension}
                    options={BI_DIMENSIONS}
                    onChange={v => updateFilter(i, { dimension: v as BIDimension, values: [] })}
                    className="flex-1"
                  />
                  <button
                    onClick={() => removeFilter(i)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center
                      text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <FilterValuePicker dimension={f.dimension} selected={f.values} onChange={vals => updateFilter(i, { values: vals })} />
              </div>
            ))}
          </div>

          <button
            onClick={addFilter}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border/50
              text-[12px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40
              transition-all duration-200 hover:bg-primary/5"
          >
            <Plus className="w-4 h-4" />
            Add Filter
          </button>
        </SectionCard>

        {/* ── GROUP BY / SCATTER ── */}
        <SectionCard
          title="Group By / Scatter"
          icon={<GitBranch className="w-4 h-4" />}
          open={sections.group}
          toggle={() => toggle('group')}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Group By</FieldLabel>
              <StyledSelect
                value={draft.groupBy[0] || ''}
                options={['', ...BI_DIMENSIONS] as any}
                onChange={v => update({ groupBy: v ? [v as BIDimension] : [] })}
                placeholder="None"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Color By</FieldLabel>
              <StyledSelect
                value={draft.colorBy || ''}
                options={['', ...BI_DIMENSIONS] as any}
                onChange={v => update({ colorBy: v ? v as BIDimension : undefined })}
                placeholder="None"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Size By</FieldLabel>
              <button
                onClick={() => { setKpiModalTarget({ type: 'sizeBy' }); setKpiModalOpen(true); }}
                className="w-full text-left bg-background border border-border/60 rounded-lg px-3 py-2.5 text-[13px] text-foreground hover:border-primary/40 transition-all"
              >
                {draft.sizeBy ? getKpiDisplayName(draft.sizeBy) : 'None'}
              </button>
            </div>
          </div>
        </SectionCard>

        {/* ═══ ADVANCED ═══ */}
        <SectionCategory>Advanced</SectionCategory>

        <SectionCard
          title="Advanced Settings"
          icon={<Settings2 className="w-4 h-4" />}
          open={sections.advanced}
          toggle={() => toggle('advanced')}
        >
          <div className="space-y-5">
            {/* Toggles */}
            <div className="space-y-3">
              {[
                { key: 'showLegend' as const, label: 'Legend' },
                { key: 'highlightAnomalies' as const, label: 'Anomalies' },
                { key: 'sortByValue' as const, label: 'Sort by value' },
              ].map(opt => (
                <div key={opt.key} className="flex items-center justify-between py-1">
                  <span className="text-[12px] text-foreground font-medium">{opt.label}</span>
                  <Switch
                    checked={draft.advanced[opt.key] as boolean}
                    onCheckedChange={v => update({ advanced: { ...draft.advanced, [opt.key]: v } })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-foreground font-medium">Top N</span>
                <input
                  type="number" min={0} max={100}
                  value={draft.advanced.topN || ''}
                  placeholder="All"
                  onChange={e => update({ advanced: { ...draft.advanced, topN: e.target.value ? Number(e.target.value) : null } })}
                  className="w-20 bg-background border border-border/60 rounded-lg px-3 py-1.5 text-[12px] text-foreground text-right
                    outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                />
              </div>
            </div>

            <div className="h-px bg-border/30" />

            {/* Background color */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Paintbrush className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Background</FieldLabel>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BG_PALETTE.map(c => (
                  <ColorDot
                    key={c} color={c} size={22}
                    selected={(draft.advanced.backgroundColor || 'transparent') === c}
                    onClick={() => update({ advanced: { ...draft.advanced, backgroundColor: c } })}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-border/30" />

            {/* Thresholds */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Thresholds</FieldLabel>
              </div>
              {draft.advanced.thresholds.map((t, i) => (
                <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number" value={t.value}
                      onChange={e => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, value: Number(e.target.value) };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }}
                      className="w-20 bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                        outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Value"
                    />
                    <input
                      value={t.label}
                      onChange={e => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, label: e.target.value };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }}
                      className="flex-1 bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                        outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Label"
                    />
                    <StyledSelect
                      value={t.lineStyle}
                      options={LINE_STYLES}
                      onChange={v => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, lineStyle: v as LineStyle };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }}
                      className="!w-20"
                    />
                    <button
                      onClick={() => update({ advanced: { ...draft.advanced, thresholds: draft.advanced.thresholds.filter((_, j) => j !== i) } })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {SIMPLE_PALETTE.map(c => (
                      <ColorDot key={c} color={c} size={16} selected={t.color === c} onClick={() => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, color: c };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }} />
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => update({ advanced: { ...draft.advanced, thresholds: [...draft.advanced.thresholds, { value: 0, label: 'Threshold', color: '#EF4444', lineStyle: 'dashed' }] } })}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-border/50
                  text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover:bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Threshold
              </button>
            </div>

            <div className="h-px bg-border/30" />

            {/* Milestones */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Milestone className="w-3.5 h-3.5 text-muted-foreground/60" />
                <FieldLabel>Milestones</FieldLabel>
              </div>
              {(draft.advanced.milestones || []).map((m, i) => (
                <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="date" value={m.date}
                      onChange={e => {
                        const milestones = [...(draft.advanced.milestones || [])];
                        milestones[i] = { ...m, date: e.target.value };
                        update({ advanced: { ...draft.advanced, milestones } });
                      }}
                      className="flex-1 bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                        outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button
                      onClick={() => update({ advanced: { ...draft.advanced, milestones: (draft.advanced.milestones || []).filter((_, j) => j !== i) } })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={m.label}
                    onChange={e => {
                      const milestones = [...(draft.advanced.milestones || [])];
                      milestones[i] = { ...m, label: e.target.value };
                      update({ advanced: { ...draft.advanced, milestones } });
                    }}
                    className="w-full bg-background border border-border/60 rounded-lg px-2.5 py-2 text-[12px] text-foreground
                      outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Milestone label"
                  />
                  <div className="flex items-center gap-2">
                    <StyledSelect
                      value={m.lineStyle}
                      options={LINE_STYLES}
                      onChange={v => {
                        const milestones = [...(draft.advanced.milestones || [])];
                        milestones[i] = { ...m, lineStyle: v as LineStyle };
                        update({ advanced: { ...draft.advanced, milestones } });
                      }}
                      className="!w-24"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {SIMPLE_PALETTE.map(c => (
                      <ColorDot key={c} color={c} size={16} selected={m.color === c} onClick={() => {
                        const milestones = [...(draft.advanced.milestones || [])];
                        milestones[i] = { ...m, color: c };
                        update({ advanced: { ...draft.advanced, milestones } });
                      }} />
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => update({ advanced: { ...draft.advanced, milestones: [...(draft.advanced.milestones || []), { date: '2026-02-08', label: 'Milestone', color: '#8B5CF6', lineStyle: 'dashed' }] } })}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-border/50
                  text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover:bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Milestone
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ─── Apply Button ─── */}
      <div className="px-5 py-4 border-t border-border/40 bg-card/50">
        <button
          onClick={handleApply}
          disabled={!dirty}
          className={`w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-[13px] font-bold
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
                ? [draft.sizeBy].filter((v): v is string => !!v)
                : []
        }
        single={kpiModalTarget?.type !== 'metric' || (kpiModalTarget?.type === 'metric' && kpiModalTarget.index >= 0)}
        onConfirm={(keys) => {
          if (!kpiModalTarget) return;
          if (kpiModalTarget.type === 'metric') {
            if (kpiModalTarget.index >= 0 && keys.length === 1) {
              // Replace single metric at index
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
            update({ sizeBy: keys[0] as BIKPI });
          }
        }}
      />
    </div>
  );
};

export default ChartConfigPanel;
