import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart, ScatterChart, Layers, Columns3, PieChart, Hash } from 'lucide-react';
import { ChartConfig, YMetricConfig, XAxisConfig, FilterConfig, BI_DIMENSIONS, BI_KPIS, CHART_COLORS, BIDimension, BIKPI, Aggregation, ChartType, Granularity, AxisSide } from './biTypes';
import { getDimensionValues } from './mockBIData';

interface Props {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  onClose: () => void;
}

const AGGREGATIONS: Aggregation[] = ['AVG', 'SUM', 'MAX', 'MIN', 'P50', 'P95'];
const GRANULARITIES: Granularity[] = ['hour', 'day', 'week', 'month'];

const CHART_TYPE_OPTIONS: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'line', icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Ligne' },
  { type: 'bar', icon: <BarChart3 className="w-3.5 h-3.5" />, label: 'Barres' },
  { type: 'area', icon: <AreaChart className="w-3.5 h-3.5" />, label: 'Aire' },
  { type: 'scatter', icon: <ScatterChart className="w-3.5 h-3.5" />, label: 'Scatter' },
  { type: 'stacked_bar', icon: <Layers className="w-3.5 h-3.5" />, label: 'Empilé' },
  { type: 'grouped_bar', icon: <Columns3 className="w-3.5 h-3.5" />, label: 'Superposé' },
  { type: 'pie', icon: <PieChart className="w-3.5 h-3.5" />, label: 'Pie' },
  { type: 'kpi_card', icon: <Hash className="w-3.5 h-3.5" />, label: 'KPI' },
];

const SectionHeader: React.FC<{ title: string; number: string; open: boolean; toggle: () => void }> = ({ title, number, open, toggle }) => (
  <button onClick={toggle} className="flex items-center gap-2 w-full py-2 text-xs font-semibold text-foreground uppercase tracking-wider">
    {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
    <span className="text-primary font-mono">{number}</span> {title}
  </button>
);

const Select: React.FC<{ value: string; options: readonly string[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className={`bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary ${className || ''}`}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const ChartConfigPanel: React.FC<Props> = ({ config, onChange, onClose }) => {
  const [sections, setSections] = useState({ x: true, y: true, filters: false, group: false, advanced: false });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  const update = (partial: Partial<ChartConfig>) => onChange({ ...config, ...partial });
  const updateX = (partial: Partial<XAxisConfig>) => update({ xAxis: { ...config.xAxis, ...partial } });

  const updateMetric = (idx: number, partial: Partial<YMetricConfig>) => {
    const metrics = [...config.yMetrics];
    metrics[idx] = { ...metrics[idx], ...partial };
    update({ yMetrics: metrics });
  };

  const addMetric = () => {
    const used = config.yMetrics.map(m => m.kpi);
    const next = BI_KPIS.find(k => !used.includes(k)) || BI_KPIS[0];
    update({
      yMetrics: [...config.yMetrics, {
        kpi: next, aggregation: 'AVG', axis: 'left',
        chartType: 'line', color: CHART_COLORS[config.yMetrics.length % CHART_COLORS.length],
        showMovingAvg: false, smoothCurve: true,
      }]
    });
  };

  const removeMetric = (idx: number) => {
    update({ yMetrics: config.yMetrics.filter((_, i) => i !== idx) });
  };

  const addFilter = () => {
    const used = config.filters.map(f => f.dimension);
    const next = BI_DIMENSIONS.find(d => !used.includes(d)) || BI_DIMENSIONS[0];
    update({ filters: [...config.filters, { dimension: next, values: [] }] });
  };

  const updateFilter = (idx: number, partial: Partial<FilterConfig>) => {
    const filters = [...config.filters];
    filters[idx] = { ...filters[idx], ...partial };
    update({ filters });
  };

  const removeFilter = (idx: number) => {
    update({ filters: config.filters.filter((_, i) => i !== idx) });
  };

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground">Chart Configuration</span>
          <input value={config.title} onChange={e => update({ title: e.target.value })}
            className="mt-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary" />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">

        {/* ── X AXIS ── */}
        <SectionHeader title="X Axis" number="1" open={sections.x} toggle={() => toggle('x')} />
        {sections.x && (
          <div className="pl-5 space-y-2 pb-3">
            <Select value={config.xAxis.type} options={['date', 'dimension', 'kpi'] as const} onChange={v => updateX({ type: v as any })} className="w-full" />
            {config.xAxis.type === 'date' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={config.xAxis.dateStart} onChange={e => updateX({ dateStart: e.target.value })}
                    className="bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
                  <input type="date" value={config.xAxis.dateEnd} onChange={e => updateX({ dateEnd: e.target.value })}
                    className="bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
                </div>
                <Select value={config.xAxis.granularity || 'day'} options={GRANULARITIES} onChange={v => updateX({ granularity: v as Granularity })} className="w-full" />
              </>
            )}
            {config.xAxis.type === 'dimension' && (
              <Select value={config.xAxis.value} options={BI_DIMENSIONS} onChange={v => updateX({ value: v })} className="w-full" />
            )}
            {config.xAxis.type === 'kpi' && (
              <Select value={config.xAxis.value} options={BI_KPIS} onChange={v => updateX({ value: v })} className="w-full" />
            )}
          </div>
        )}

        {/* ── Y AXIS ── */}
        <SectionHeader title="Y Axis (Metrics)" number="2" open={sections.y} toggle={() => toggle('y')} />
        {sections.y && (
          <div className="pl-5 space-y-3 pb-3">
            {config.yMetrics.map((m, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50 border border-border space-y-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  <Select value={m.kpi} options={BI_KPIS} onChange={v => updateMetric(i, { kpi: v as BIKPI })} className="flex-1" />
                  <button onClick={() => removeMetric(i)} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex flex-wrap gap-1">
                    {CHART_TYPE_OPTIONS.map(opt => (
                      <Tooltip key={opt.type}>
                        <TooltipTrigger asChild>
                          <button onClick={() => updateMetric(i, { chartType: opt.type })}
                            className={`p-1.5 rounded-md border transition-all ${m.chartType === opt.type ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'}`}>
                            {opt.icon}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px]">{opt.label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
                <Select value={m.axis} options={['left', 'right'] as const} onChange={v => updateMetric(i, { axis: v as AxisSide })} className="w-full" />
                <div className="flex items-center gap-3 text-[10px]">
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input type="checkbox" checked={m.smoothCurve} onChange={e => updateMetric(i, { smoothCurve: e.target.checked })} className="rounded" /> Smooth
                  </label>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input type="checkbox" checked={m.showMovingAvg} onChange={e => updateMetric(i, { showMovingAvg: e.target.checked })} className="rounded" /> MA
                  </label>
                  <input type="color" value={m.color} onChange={e => updateMetric(i, { color: e.target.value })} className="w-5 h-5 rounded cursor-pointer border-0" />
                </div>
              </div>
            ))}
            <button onClick={addMetric} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add Metric
            </button>
          </div>
        )}

        {/* ── FILTERS ── */}
        <SectionHeader title="Filters" number="3" open={sections.filters} toggle={() => toggle('filters')} />
        {sections.filters && (
          <div className="pl-5 space-y-2 pb-3">
            {config.filters.map((f, i) => (
              <div key={i} className="flex items-start gap-1">
                <div className="flex-1 space-y-1">
                  <Select value={f.dimension} options={BI_DIMENSIONS} onChange={v => updateFilter(i, { dimension: v as BIDimension, values: [] })} className="w-full" />
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {getDimensionValues(f.dimension).map(val => (
                      <button key={val} onClick={() => {
                        const vals = f.values.includes(val) ? f.values.filter(v => v !== val) : [...f.values, val];
                        updateFilter(i, { values: vals });
                      }}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${f.values.includes(val) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:border-primary/50'}`}>
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => removeFilter(i)} className="p-0.5 mt-1 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
            <button onClick={addFilter} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add Filter
            </button>
          </div>
        )}

        {/* ── GROUP BY ── */}
        <SectionHeader title="Group By" number="4" open={sections.group} toggle={() => toggle('group')} />
        {sections.group && (
          <div className="pl-5 space-y-2 pb-3">
            <Select
              value={config.groupBy[0] || ''}
              options={['', ...BI_DIMENSIONS] as any}
              onChange={v => {
                update({ groupBy: v ? [v as BIDimension] : [] });
              }} className="w-full" />
          </div>
        )}

        {/* ── ADVANCED ── */}
        <SectionHeader title="Advanced" number="5" open={sections.advanced} toggle={() => toggle('advanced')} />
        {sections.advanced && (
          <div className="pl-5 space-y-2 pb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={config.advanced.showLegend} onChange={e => update({ advanced: { ...config.advanced, showLegend: e.target.checked } })} /> Show Legend
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={config.advanced.highlightAnomalies} onChange={e => update({ advanced: { ...config.advanced, highlightAnomalies: e.target.checked } })} /> Highlight Anomalies
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={config.advanced.sortByValue} onChange={e => update({ advanced: { ...config.advanced, sortByValue: e.target.checked } })} /> Sort by Value
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Top N:</span>
              <input type="number" min={0} max={100} value={config.advanced.topN || ''} placeholder="All"
                onChange={e => update({ advanced: { ...config.advanced, topN: e.target.value ? Number(e.target.value) : null } })}
                className="w-16 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartConfigPanel;
