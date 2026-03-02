import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart,
  ScatterChart, Layers, Columns3, PieChart, Hash, Paintbrush, Database, Check,
  Grid3X3, ArrowLeftRight, Calendar, Filter, GitBranch, Settings2, Palette,
  GripVertical, Zap, Target, Milestone
} from 'lucide-react';
import {
  ChartConfig, YMetricConfig, XAxisConfig, FilterConfig, ThresholdLine,
  MilestoneLine, BI_DIMENSIONS, BI_KPIS, CHART_COLORS, BIDimension, BIKPI,
  Aggregation, ChartType, Granularity, AxisSide, LineStyle, KPI_UNITS,
  USER_GROUPBY_DIMENSIONS, LOCKED_FILTERS, LOCKED_GROUPBY
} from './biTypes';
import { getDimensionValues } from './mockBIData';
import { useCSVData } from './CSVDataStore';

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
  { type: 'line', icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Ligne' },
  { type: 'bar', icon: <BarChart3 className="w-3.5 h-3.5" />, label: 'Barres' },
  { type: 'area', icon: <AreaChart className="w-3.5 h-3.5" />, label: 'Aire' },
  { type: 'scatter', icon: <ScatterChart className="w-3.5 h-3.5" />, label: 'Scatter' },
  { type: 'stacked_bar', icon: <Layers className="w-3.5 h-3.5" />, label: 'Empilé' },
  { type: 'grouped_bar', icon: <Columns3 className="w-3.5 h-3.5" />, label: 'Superposé' },
  { type: 'heatmap', icon: <Grid3X3 className="w-3.5 h-3.5" />, label: 'Heatmap' },
  { type: 'pie', icon: <PieChart className="w-3.5 h-3.5" />, label: 'Pie' },
  { type: 'kpi_card', icon: <Hash className="w-3.5 h-3.5" />, label: 'KPI' },
];

const DATE_PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

/* ─── Reusable Components ─── */

const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  toggle: () => void;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, icon, open, toggle, badge, children }) => (
  <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden transition-all duration-200 hover:border-border">
    <button
      onClick={toggle}
      className="flex items-center gap-2.5 w-full px-4 py-3 text-left group transition-colors hover:bg-muted/30"
    >
      <span className="text-primary/80 group-hover:text-primary transition-colors">{icon}</span>
      <span className="text-[13px] font-semibold text-foreground flex-1 tracking-tight">{title}</span>
      {badge && (
        <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums">
          {badge}
        </span>
      )}
      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} />
    </button>
    <div className={`transition-all duration-200 ease-out ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
      <div className="px-4 pb-4 pt-1 space-y-3">
        {children}
      </div>
    </div>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{children}</span>
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
    className={`w-full bg-background border border-border/70 rounded-lg px-3 py-2 text-[13px] text-foreground
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
  <div className="inline-flex rounded-lg bg-muted/60 p-0.5 border border-border/40">
    {options.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150 ${
          value === opt.value
            ? 'bg-background text-foreground shadow-sm border border-border/50'
            : 'text-muted-foreground hover:text-foreground'
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
    source: true, x: true, y: true, filters: false, group: false, advanced: false
  });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
  const { datasets } = useCSVData();

  const [draft, setDraft] = useState<ChartConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);

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
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    updateX({
      dateStart: start.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0],
    });
  };

  return (
    <div className="w-[340px] h-full bg-background/95 backdrop-blur-xl border-l border-border/50 flex flex-col overflow-hidden">

      {/* ─── Header ─── */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-foreground tracking-tight">Configuration</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <input
          value={draft.title}
          onChange={e => update({ title: e.target.value })}
          className="w-full bg-transparent text-base font-semibold text-foreground outline-none
            border-b-2 border-transparent focus:border-primary/40 transition-colors
            placeholder:text-muted-foreground/50 pb-1"
          placeholder="Titre du graphique…"
        />
      </div>

      {/* ─── Scrollable Sections ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-thin">

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

        {/* ── X AXIS ── */}
        <SectionCard
          title="Axe X"
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
            {draft.xAxis.type === 'kpi' && draft.yMetrics.length === 1 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        const currentXKpi = draft.xAxis.value;
                        const currentYKpi = draft.yMetrics[0].kpi;
                        updateX({ value: currentYKpi });
                        updateMetric(0, { kpi: currentXKpi as any });
                      }}
                      className="w-8 h-8 rounded-lg border border-border/60 bg-background flex items-center justify-center
                        text-muted-foreground hover:text-primary hover:border-primary/40 transition-all duration-150"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Inverser X ↔ Y</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {draft.xAxis.type === 'date' && (
            <div className="space-y-3">
              {/* Quick date presets */}
              <div className="flex gap-1.5">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyDatePreset(p.days)}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-border/50
                      bg-background text-muted-foreground hover:text-primary hover:border-primary/30
                      transition-all duration-150"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <FieldLabel>Début</FieldLabel>
                  <input
                    type="date"
                    value={draft.xAxis.dateStart}
                    onChange={e => updateX({ dateStart: e.target.value })}
                    className="w-full bg-background border border-border/70 rounded-lg px-3 py-2 text-[12px] text-foreground
                      outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Fin</FieldLabel>
                  <input
                    type="date"
                    value={draft.xAxis.dateEnd}
                    onChange={e => updateX({ dateEnd: e.target.value })}
                    className="w-full bg-background border border-border/70 rounded-lg px-3 py-2 text-[12px] text-foreground
                      outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>Granularité</FieldLabel>
                <SegmentedControl
                  options={GRANULARITIES.map(g => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))}
                  value={draft.xAxis.granularity || 'day'}
                  onChange={v => updateX({ granularity: v as Granularity })}
                />
              </div>
            </div>
          )}
          {draft.xAxis.type === 'dimension' && (
            <StyledSelect value={draft.xAxis.value} options={BI_DIMENSIONS} onChange={v => updateX({ value: v })} />
          )}
          {draft.xAxis.type === 'kpi' && (
            <StyledSelect value={draft.xAxis.value} options={BI_KPIS} onChange={v => updateX({ value: v })} />
          )}
        </SectionCard>

        {/* ── Y AXIS (METRICS) ── */}
        <SectionCard
          title="Métriques Y"
          icon={<TrendingUp className="w-4 h-4" />}
          open={sections.y}
          toggle={() => toggle('y')}
          badge={`${draft.yMetrics.length}`}
        >
          <div className="space-y-2.5">
            {draft.yMetrics.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/50 bg-background overflow-hidden transition-all duration-200 hover:border-border hover:shadow-sm"
              >
                {/* Metric header with colored accent */}
                <div className="flex items-stretch">
                  <div className="w-1 rounded-l-xl" style={{ background: m.color }} />
                  <div className="flex-1 p-3 space-y-3">
                    {/* Top row: KPI selector + aggregation + delete */}
                    <div className="flex items-center gap-2">
                      <StyledSelect
                        value={m.kpi}
                        options={BI_KPIS}
                        onChange={v => updateMetric(i, { kpi: v as BIKPI })}
                        className="flex-1 !text-[12px] font-semibold"
                      />
                      <StyledSelect
                        value={m.aggregation}
                        options={AGGREGATIONS}
                        onChange={v => updateMetric(i, { aggregation: v as Aggregation })}
                        className="!w-20 !text-[11px]"
                      />
                      <button
                        onClick={() => removeMetric(i)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center
                          text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Chart type segmented */}
                    <div>
                      <FieldLabel>Type de graphique</FieldLabel>
                      <TooltipProvider delayDuration={200}>
                        <div className="flex gap-1 mt-1.5">
                          {CHART_TYPE_OPTIONS.map(opt => (
                            <Tooltip key={opt.type}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => updateMetric(i, { chartType: opt.type })}
                                  className={`flex-1 p-1.5 rounded-lg border transition-all duration-150 ${
                                    m.chartType === opt.type
                                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                      : 'bg-muted/30 text-muted-foreground border-transparent hover:border-border hover:text-foreground'
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

                    {/* Axis + Toggles row */}
                    <div className="flex items-center justify-between">
                      <SegmentedControl
                        options={[
                          { value: 'left', label: 'Gauche' },
                          { value: 'right', label: 'Droite' },
                        ]}
                        value={m.axis}
                        onChange={v => updateMetric(i, { axis: v as AxisSide })}
                      />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={m.smoothCurve}
                            onCheckedChange={v => updateMetric(i, { smoothCurve: v })}
                            className="scale-75 origin-left"
                          />
                          <span className="text-[10px] font-medium text-muted-foreground">Smooth</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={m.showMovingAvg}
                            onCheckedChange={v => updateMetric(i, { showMovingAvg: v })}
                            className="scale-75 origin-left"
                          />
                          <span className="text-[10px] font-medium text-muted-foreground">MA</span>
                        </label>
                      </div>
                    </div>

                    {/* Color picker */}
                    <div className="flex items-center gap-2">
                      <Palette className="w-3 h-3 text-muted-foreground" />
                      <div className="flex gap-1.5 flex-wrap">
                        {SIMPLE_PALETTE.map(c => (
                          <ColorDot key={c} color={c} selected={m.color === c} onClick={() => updateMetric(i, { color: c })} size={18} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addMetric}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border/60
              text-[12px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40
              transition-all duration-200 hover:bg-primary/5"
          >
            <Plus className="w-4 h-4" />
            Ajouter une métrique
          </button>
        </SectionCard>

        {/* ── FILTERS ── */}
        <SectionCard
          title="Filtres"
          icon={<Filter className="w-4 h-4" />}
          open={sections.filters}
          toggle={() => toggle('filters')}
          badge={draft.filters.length > 0 ? `${draft.filters.length}` : undefined}
        >
          <div className="space-y-2.5">
            {/* Locked Vendor=Nokia filter */}
            {LOCKED_FILTERS.map((lf, li) => (
              <div key={`locked-${li}`} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] font-bold tracking-wide">
                    {lf.dimension}
                  </span>
                  <span className="text-[11px] text-muted-foreground">=</span>
                  <span className="text-[12px] font-semibold text-foreground">{lf.values.join(', ')}</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-muted text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">figé</span>
                </div>
              </div>
            ))}

            {/* User-added filters */}
            {draft.filters.filter(f => !LOCKED_FILTERS.some(lf => lf.dimension === f.dimension)).map((f) => {
              const realIdx = draft.filters.indexOf(f);
              return (
                <div key={realIdx} className="rounded-xl border border-border/50 bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <StyledSelect
                      value={f.dimension}
                      options={BI_DIMENSIONS.filter(d => d !== 'Vendor')}
                      onChange={v => updateFilter(realIdx, { dimension: v as BIDimension, values: [] })}
                      className="flex-1"
                    />
                    <button
                      onClick={() => removeFilter(realIdx)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center
                        text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {getDimensionValues(f.dimension).map(val => (
                      <button
                        key={val}
                        onClick={() => {
                          const vals = f.values.includes(val) ? f.values.filter(v => v !== val) : [...f.values, val];
                          updateFilter(realIdx, { values: vals });
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all duration-150 ${
                          f.values.includes(val)
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-background text-muted-foreground border-border/50 hover:border-primary/30'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addFilter}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border/60
              text-[12px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40
              transition-all duration-200 hover:bg-primary/5"
          >
            <Plus className="w-4 h-4" />
            Ajouter un filtre
          </button>
        </SectionCard>

        {/* ── AGRÉGER PAR ── */}
        <SectionCard
          title="Agréger par"
          icon={<GitBranch className="w-4 h-4" />}
          open={sections.group}
          toggle={() => toggle('group')}
          badge={`${draft.groupBy.length}`}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <FieldLabel>Agrégation</FieldLabel>
              <div className="flex flex-wrap gap-1.5 items-center">
                {/* ORF locked chip */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-[11px] font-bold text-primary">
                  ORF
                  <span className="px-1 py-0.5 rounded bg-primary/20 text-[8px] font-bold uppercase tracking-wider">figé</span>
                </span>

                {/* User-selectable dimension chips */}
                {USER_GROUPBY_DIMENSIONS.map(dim => {
                  const isActive = draft.groupBy.includes(dim);
                  return (
                    <button
                      key={dim}
                      onClick={() => {
                        const newGroupBy = isActive
                          ? draft.groupBy.filter(d => d !== dim)
                          : [...draft.groupBy, dim];
                        if (!newGroupBy.includes(LOCKED_GROUPBY)) newGroupBy.unshift(LOCKED_GROUPBY);
                        update({ groupBy: newGroupBy });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400'
                          : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {dim === 'DOR' ? 'UR' : dim}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Coloré par</FieldLabel>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button
                  onClick={() => update({ colorBy: undefined })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                    !draft.colorBy
                      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400'
                      : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
                  }`}
                >
                  Valeur
                </button>
                {USER_GROUPBY_DIMENSIONS.map(dim => (
                  <button
                    key={dim}
                    onClick={() => update({ colorBy: draft.colorBy === dim ? undefined : dim })}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all duration-150 ${
                      draft.colorBy === dim
                        ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400'
                        : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
                    }`}
                  >
                    {dim === 'DOR' ? 'UR' : dim}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Taille par</FieldLabel>
              <StyledSelect
                value={draft.sizeBy || ''}
                options={['', ...BI_KPIS] as any}
                onChange={v => update({ sizeBy: v ? v as BIKPI : undefined })}
                placeholder="Aucun"
              />
            </div>
          </div>
        </SectionCard>

        {/* ── ADVANCED ── */}
        <SectionCard
          title="Avancé"
          icon={<Settings2 className="w-4 h-4" />}
          open={sections.advanced}
          toggle={() => toggle('advanced')}
        >
          <div className="space-y-4">
            {/* Toggles */}
            <div className="space-y-3">
              {[
                { key: 'showLegend' as const, label: 'Légende' },
                { key: 'highlightAnomalies' as const, label: 'Anomalies' },
                { key: 'sortByValue' as const, label: 'Tri par valeur' },
              ].map(opt => (
                <div key={opt.key} className="flex items-center justify-between">
                  <span className="text-[12px] text-foreground font-medium">{opt.label}</span>
                  <Switch
                    checked={draft.advanced[opt.key] as boolean}
                    onCheckedChange={v => update({ advanced: { ...draft.advanced, [opt.key]: v } })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground font-medium">Top N</span>
                <input
                  type="number" min={0} max={100}
                  value={draft.advanced.topN || ''}
                  placeholder="Tous"
                  onChange={e => update({ advanced: { ...draft.advanced, topN: e.target.value ? Number(e.target.value) : null } })}
                  className="w-20 bg-background border border-border/70 rounded-lg px-3 py-1.5 text-[12px] text-foreground text-right
                    outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-border/50" />

            {/* Background color */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Paintbrush className="w-3.5 h-3.5 text-muted-foreground" />
                <FieldLabel>Couleur de fond</FieldLabel>
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

            {/* Divider */}
            <div className="h-px bg-border/50" />

            {/* Thresholds */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <FieldLabel>Seuils horizontaux</FieldLabel>
              </div>
              {draft.advanced.thresholds.map((t, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number" value={t.value}
                      onChange={e => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, value: Number(e.target.value) };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }}
                      className="w-20 bg-background border border-border/70 rounded-lg px-2.5 py-1.5 text-[12px] text-foreground
                        outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Valeur"
                    />
                    <input
                      value={t.label}
                      onChange={e => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, label: e.target.value };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }}
                      className="flex-1 bg-background border border-border/70 rounded-lg px-2.5 py-1.5 text-[12px] text-foreground
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
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
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
                onClick={() => update({ advanced: { ...draft.advanced, thresholds: [...draft.advanced.thresholds, { value: 0, label: 'Seuil', color: '#EF4444', lineStyle: 'dashed' }] } })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/60
                  text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter un seuil
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-border/50" />

            {/* Milestones */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Milestone className="w-3.5 h-3.5 text-muted-foreground" />
                <FieldLabel>Jalons verticaux</FieldLabel>
              </div>
              {(draft.advanced.milestones || []).map((m, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date" value={m.date}
                      onChange={e => {
                        const milestones = [...(draft.advanced.milestones || [])];
                        milestones[i] = { ...m, date: e.target.value };
                        update({ advanced: { ...draft.advanced, milestones } });
                      }}
                      className="flex-1 bg-background border border-border/70 rounded-lg px-2.5 py-1.5 text-[12px] text-foreground
                        outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button
                      onClick={() => update({ advanced: { ...draft.advanced, milestones: (draft.advanced.milestones || []).filter((_, j) => j !== i) } })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
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
                    className="w-full bg-background border border-border/70 rounded-lg px-2.5 py-1.5 text-[12px] text-foreground
                      outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Label du jalon"
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
                onClick={() => update({ advanced: { ...draft.advanced, milestones: [...(draft.advanced.milestones || []), { date: '2026-02-08', label: 'Jalon', color: '#8B5CF6', lineStyle: 'dashed' }] } })}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/60
                  text-[11px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter un jalon
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ─── Apply Button ─── */}
      <div className="px-4 py-3 border-t border-border/50 bg-background/80 backdrop-blur-sm">
        <button
          onClick={handleApply}
          disabled={!dirty}
          className={`w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-semibold
            tracking-wide transition-all duration-200 ${
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4" />
          {dirty ? 'Appliquer les changements' : 'Configuration à jour'}
        </button>
      </div>
    </div>
  );
};

export default ChartConfigPanel;
