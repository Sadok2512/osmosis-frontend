import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, BarChart3, AreaChart, ScatterChart, Layers, Columns3, PieChart, Hash, Paintbrush, Database, Check, Grid3X3 } from 'lucide-react';
import { ChartConfig, YMetricConfig, XAxisConfig, FilterConfig, ThresholdLine, MilestoneLine, BI_DIMENSIONS, BI_KPIS, CHART_COLORS, BIDimension, BIKPI, Aggregation, ChartType, Granularity, AxisSide, LineStyle } from './biTypes';
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
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#e11d48',
];

const BG_PALETTE = [
  'transparent', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#0f172a', '#1e293b', '#1a1a2e', '#fef9ef', '#f0fdf4',
  '#eff6ff', '#fdf2f8',
];

const ColorSwatch: React.FC<{ color: string; selected: boolean; onClick: () => void; size?: 'sm' | 'md' }> = ({ color, selected, onClick, size = 'sm' }) => (
  <button
    onClick={onClick}
    className={`rounded-md border-2 transition-all ${selected ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:border-primary/40'}`}
    style={{
      width: size === 'sm' ? 18 : 22,
      height: size === 'sm' ? 18 : 22,
      background: color === 'transparent'
        ? 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)'
        : color,
      backgroundSize: color === 'transparent' ? '8px 8px' : undefined,
      backgroundPosition: color === 'transparent' ? '0 0, 4px 4px' : undefined,
    }}
    title={color === 'transparent' ? 'Transparent' : color}
  />
);

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
  const [sections, setSections] = useState({ source: true, x: true, y: true, filters: false, group: false, advanced: false });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
  const { datasets } = useCSVData();

  // Draft state — changes are buffered until Apply is clicked
  const [draft, setDraft] = useState<ChartConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);

  // Reset draft when external config changes (e.g. switching charts)
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

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground">Chart Configuration</span>
          <input value={draft.title} onChange={e => update({ title: e.target.value })}
            className="mt-1 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary" />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">

        {/* ── DATA SOURCE ── */}
        {datasets.length > 0 && (<>
          <SectionHeader title="Data Source" number="0" open={sections.source} toggle={() => toggle('source')} />
          {sections.source && (
            <div className="pl-5 space-y-2 pb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => update({ dataSource: { type: 'mock' } })}
                  className={`flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${
                    (!draft.dataSource || draft.dataSource.type === 'mock')
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  <Database className="w-3 h-3" /> Simulé
                </button>
                <button
                  onClick={() => update({ dataSource: { type: 'csv', csvDatasetId: datasets[0]?.id } })}
                  className={`flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${
                    draft.dataSource?.type === 'csv'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  <Database className="w-3 h-3" /> CSV
                </button>
              </div>
              {draft.dataSource?.type === 'csv' && (
                <div className="space-y-2">
                  <select
                    value={draft.dataSource.csvDatasetId || ''}
                    onChange={e => update({ dataSource: { ...draft.dataSource!, csvDatasetId: e.target.value } })}
                    className="w-full bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    {datasets.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.filename} ({ds.rows.length}r)</option>
                    ))}
                  </select>
                  {(() => {
                    const ds = datasets.find(d => d.id === draft.dataSource?.csvDatasetId);
                    if (!ds) return null;
                    return (
                      <>
                        <div>
                          <span className="text-[10px] text-muted-foreground font-medium">Colonne X</span>
                          <select
                            value={draft.dataSource?.xColumn || ds.columns[0]}
                            onChange={e => update({ dataSource: { ...draft.dataSource!, xColumn: e.target.value } })}
                            className="w-full bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary mt-1"
                          >
                            {ds.columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground font-medium">Colonnes Y (métriques)</span>
                          <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
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
                                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                    selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:border-primary/50'
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
            </div>
          )}
        </>)}

        {/* ── X AXIS ── */}
        <SectionHeader title="X Axis" number="1" open={sections.x} toggle={() => toggle('x')} />
        {sections.x && (
          <div className="pl-5 space-y-2 pb-3">
            <Select value={draft.xAxis.type} options={['date', 'dimension', 'kpi'] as const} onChange={v => updateX({ type: v as any })} className="w-full" />
            {draft.xAxis.type === 'date' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={draft.xAxis.dateStart} onChange={e => updateX({ dateStart: e.target.value })}
                    className="bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
                  <input type="date" value={draft.xAxis.dateEnd} onChange={e => updateX({ dateEnd: e.target.value })}
                    className="bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
                </div>
                <Select value={draft.xAxis.granularity || 'day'} options={GRANULARITIES} onChange={v => updateX({ granularity: v as Granularity })} className="w-full" />
              </>
            )}
            {draft.xAxis.type === 'dimension' && (
              <Select value={draft.xAxis.value} options={BI_DIMENSIONS} onChange={v => updateX({ value: v })} className="w-full" />
            )}
            {draft.xAxis.type === 'kpi' && (
              <Select value={draft.xAxis.value} options={BI_KPIS} onChange={v => updateX({ value: v })} className="w-full" />
            )}
          </div>
        )}

        {/* ── Y AXIS ── */}
        <SectionHeader title="Y Axis (Metrics)" number="2" open={sections.y} toggle={() => toggle('y')} />
        {sections.y && (
          <div className="pl-5 space-y-3 pb-3">
            {draft.yMetrics.map((m, i) => (
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
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {SIMPLE_PALETTE.map(c => (
                    <ColorSwatch key={c} color={c} selected={m.color === c} onClick={() => updateMetric(i, { color: c })} />
                  ))}
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
            {draft.filters.map((f, i) => (
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
              value={draft.groupBy[0] || ''}
              options={['', ...BI_DIMENSIONS] as any}
              onChange={v => {
                update({ groupBy: v ? [v as BIDimension] : [] });
              }} className="w-full" />
          </div>
        )}

        {/* ── ADVANCED ── */}
        <SectionHeader title="Advanced" number="5" open={sections.advanced} toggle={() => toggle('advanced')} />
        {sections.advanced && (
          <div className="pl-5 space-y-3 pb-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.advanced.showLegend} onChange={e => update({ advanced: { ...draft.advanced, showLegend: e.target.checked } })} /> Show Legend
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.advanced.highlightAnomalies} onChange={e => update({ advanced: { ...draft.advanced, highlightAnomalies: e.target.checked } })} /> Highlight Anomalies
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.advanced.sortByValue} onChange={e => update({ advanced: { ...draft.advanced, sortByValue: e.target.checked } })} /> Sort by Value
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Top N:</span>
              <input type="number" min={0} max={100} value={draft.advanced.topN || ''} placeholder="All"
                onChange={e => update({ advanced: { ...draft.advanced, topN: e.target.value ? Number(e.target.value) : null } })}
                className="w-16 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground" />
            </div>

            {/* ── BACKGROUND COLOR ── */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Paintbrush className="w-3 h-3" /> Couleur de fond
              </span>
              <div className="flex flex-wrap gap-1">
                {BG_PALETTE.map(c => (
                  <ColorSwatch key={c} color={c} size="md" selected={(draft.advanced.backgroundColor || 'transparent') === c} onClick={() => update({ advanced: { ...draft.advanced, backgroundColor: c } })} />
                ))}
              </div>
            </div>

            {/* ── THRESHOLDS ── */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Seuils (horizontaux)</span>
              {draft.advanced.thresholds.map((t, i) => (
                <div key={i} className="p-2 rounded-lg bg-muted/50 border border-border space-y-1.5">
                  <div className="flex items-center gap-1">
                    <input type="number" value={t.value} onChange={e => {
                      const thresholds = [...draft.advanced.thresholds];
                      thresholds[i] = { ...t, value: Number(e.target.value) };
                      update({ advanced: { ...draft.advanced, thresholds } });
                    }} className="w-16 bg-muted border border-border rounded px-1.5 py-1 text-xs text-foreground" placeholder="Valeur" />
                    <input value={t.label} onChange={e => {
                      const thresholds = [...draft.advanced.thresholds];
                      thresholds[i] = { ...t, label: e.target.value };
                      update({ advanced: { ...draft.advanced, thresholds } });
                    }} className="flex-1 bg-muted border border-border rounded px-1.5 py-1 text-xs text-foreground" placeholder="Label" />
                    <button onClick={() => {
                      update({ advanced: { ...draft.advanced, thresholds: draft.advanced.thresholds.filter((_, j) => j !== i) } });
                    }} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={t.lineStyle} options={LINE_STYLES} onChange={v => {
                      const thresholds = [...draft.advanced.thresholds];
                      thresholds[i] = { ...t, lineStyle: v as LineStyle };
                      update({ advanced: { ...draft.advanced, thresholds } });
                    }} className="flex-1" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SIMPLE_PALETTE.map(c => (
                      <ColorSwatch key={c} color={c} selected={t.color === c} onClick={() => {
                        const thresholds = [...draft.advanced.thresholds];
                        thresholds[i] = { ...t, color: c };
                        update({ advanced: { ...draft.advanced, thresholds } });
                      }} />
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => {
                update({ advanced: { ...draft.advanced, thresholds: [...draft.advanced.thresholds, { value: 0, label: 'Seuil', color: '#ef4444', lineStyle: 'dashed' }] } });
              }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Ajouter un seuil
              </button>
            </div>

            {/* ── MILESTONES ── */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Jalons (verticaux)</span>
              {(draft.advanced.milestones || []).map((m, i) => (
                <div key={i} className="p-2 rounded-lg bg-muted/50 border border-border space-y-1.5">
                  <div className="flex items-center gap-1">
                    <input type="date" value={m.date} onChange={e => {
                      const milestones = [...(draft.advanced.milestones || [])];
                      milestones[i] = { ...m, date: e.target.value };
                      update({ advanced: { ...draft.advanced, milestones } });
                    }} className="flex-1 bg-muted border border-border rounded px-1.5 py-1 text-xs text-foreground" />
                    <button onClick={() => {
                      update({ advanced: { ...draft.advanced, milestones: (draft.advanced.milestones || []).filter((_, j) => j !== i) } });
                    }} className="p-0.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <input value={m.label} onChange={e => {
                    const milestones = [...(draft.advanced.milestones || [])];
                    milestones[i] = { ...m, label: e.target.value };
                    update({ advanced: { ...draft.advanced, milestones } });
                  }} className="w-full bg-muted border border-border rounded px-1.5 py-1 text-xs text-foreground" placeholder="Label du jalon" />
                  <div className="flex items-center gap-2">
                    <Select value={m.lineStyle} options={LINE_STYLES} onChange={v => {
                      const milestones = [...(draft.advanced.milestones || [])];
                      milestones[i] = { ...m, lineStyle: v as LineStyle };
                      update({ advanced: { ...draft.advanced, milestones } });
                    }} className="flex-1" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SIMPLE_PALETTE.map(c => (
                      <ColorSwatch key={c} color={c} selected={m.color === c} onClick={() => {
                        const milestones = [...(draft.advanced.milestones || [])];
                        milestones[i] = { ...m, color: c };
                        update({ advanced: { ...draft.advanced, milestones } });
                      }} />
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => {
                update({ advanced: { ...draft.advanced, milestones: [...(draft.advanced.milestones || []), { date: '2026-02-08', label: 'Jalon', color: '#8b5cf6', lineStyle: 'dashed' }] } });
              }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Ajouter un jalon
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Apply Button — sticky bottom */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <button
          onClick={handleApply}
          disabled={!dirty}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4" />
          {dirty ? 'Appliquer' : 'À jour'}
        </button>
      </div>
    </div>
  );
};

export default ChartConfigPanel;
