import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  ChevronDown, ChevronRight, Trash2, GripVertical, Copy,
  MoreHorizontal, Eye, EyeOff, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetThreshold, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';

/* ── Constants ── */
const GRAPH_TYPES: { value: GraphType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_area', label: 'Stacked', icon: Layers2 },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#22c55e',
];

const THRESHOLD_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

const AGG_OPTIONS = [
  { value: 'avg', label: 'Avg' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'p95', label: 'P95' },
  { value: 'p50', label: 'Median' },
  { value: 'last', label: 'Last' },
];

const GRAN_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

const DEFAULT_AXIS: WidgetAxisConfig = {
  yTitle: '', yMin: 'auto', yMax: 'auto', yUnit: '', yDecimals: 2, yInvert: false,
  xFormat: 'short', xShowGrid: false,
};

const DEFAULT_GRAPH: WidgetGraphConfig = {
  smooth: true, lineWidth: 2.5, showSymbols: false,
  gridIntensity: 'light', showVerticalGrid: false,
  backgroundColor: 'transparent', transparentBg: true,
  showLegend: false, legendPosition: 'bottom',
};

/* ── Micro Components ── */
const MiniSelect: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={cn(
      'h-7 px-2 rounded-md border border-border/50 bg-background text-[11px] text-foreground',
      'outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-all',
      className || 'w-[80px]'
    )}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const MiniInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className, ...props }) => (
  <div className={label ? 'space-y-1' : ''}>
    {label && <span className="text-[10px] font-medium text-muted-foreground">{label}</span>}
    <input
      {...props}
      className={cn(
        'h-7 px-2 rounded-md border border-border/50 bg-background text-[11px] text-foreground',
        'outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all',
        className || 'w-full'
      )}
    />
  </div>
);

/* Collapsible section for right panel */
const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}> = ({ title, defaultOpen = true, children, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground tracking-tight flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[9px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
};

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
    <div className="flex items-center gap-1.5">{children}</div>
  </div>
);

const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7 data-[state=checked]:bg-primary" />
  </div>
);

/* ════════════════════════════════════════════════════════════════
   1) SERIES TABLE — Professional spreadsheet-like editor
   ════════════════════════════════════════════════════════════════ */
export type QuickSettingsSection = 'kpis' | 'style' | 'full' | null;

export interface SeriesTableProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}

export const SeriesTable: React.FC<SeriesTableProps> = ({ catalogMap, onOpenKpiSelector }) => {
  const store = useKpiMonitorStore();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleVisibility = (key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (store.selectedKpis.length === 0) {
    return (
      <div className="px-4 py-4">
        <button
          onClick={onOpenKpiSelector}
          className={cn(
            'w-full py-4 rounded-lg border-2 border-dashed border-border/40',
            'hover:border-primary/30 hover:bg-primary/[0.02] transition-all',
            'flex items-center justify-center gap-2 text-muted-foreground hover:text-primary',
            'text-[12px] font-medium'
          )}
        >
          <Plus className="w-4 h-4" /> Add your first series
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div className="grid grid-cols-[32px_40px_40px_90px_72px_72px_80px_1fr_36px] items-center gap-0 px-2 py-1.5 bg-muted/30 border-b border-border/30 sticky top-0 z-10">
        <span className="text-center text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest"></span>
        <span className="text-center text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest"></span>
        <span className="text-center text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Vis</span>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest pl-1">Type</span>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Axis</span>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Gran.</span>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Agg</span>
        <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest pl-1">Series</span>
        <span></span>
      </div>

      {/* Rows */}
      {store.selectedKpis.map((kpi, idx) => {
        const cat = catalogMap[kpi.kpi_key];
        const color = kpi.color || cat?.color || PRESET_COLORS[idx % PRESET_COLORS.length];
        const name = cat?.display_name || kpi.kpi_key;
        const isHidden = hiddenSeries.has(kpi.kpi_key);
        const GraphIcon = GRAPH_TYPES.find(g => g.value === (kpi.graphType || 'line'))?.icon || TrendingUp;

        return (
          <div
            key={kpi.kpi_key}
            className={cn(
              'grid grid-cols-[32px_40px_40px_90px_72px_72px_80px_1fr_36px] items-center gap-0 px-2',
              'h-[40px] border-b border-border/15 hover:bg-muted/20 transition-colors group',
              isHidden && 'opacity-40'
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/25 group-hover:text-muted-foreground/50 cursor-grab transition-colors" />
            </div>

            {/* Color dot */}
            <div className="flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="w-4 h-4 rounded-full ring-1 ring-border/20 hover:ring-primary/40 hover:scale-110 transition-all shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2.5" align="start">
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                        className={cn(
                          'w-5 h-5 rounded-full hover:scale-125 transition-transform',
                          color === c && 'ring-2 ring-primary ring-offset-1'
                        )}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Visibility */}
            <div className="flex justify-center">
              <button onClick={() => toggleVisibility(kpi.kpi_key)} className="p-1 rounded hover:bg-muted/40 transition-colors">
                {isHidden ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground/60" />}
              </button>
            </div>

            {/* Type */}
            <div className="pl-1">
              <MiniSelect
                value={kpi.graphType || 'line'}
                onChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}
                options={GRAPH_TYPES.map(g => ({ value: g.value, label: g.label }))}
                className="w-[82px] h-6 text-[10px]"
              />
            </div>

            {/* Axis */}
            <div>
              <div className="inline-flex rounded-md border border-border/40 overflow-hidden">
                <button
                  onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-semibold transition-colors',
                    kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'
                  )}
                >L</button>
                <button
                  onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-semibold transition-colors',
                    kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'
                  )}
                >R</button>
              </div>
            </div>

            {/* Granularity */}
            <div>
              <MiniSelect
                value="auto"
                onChange={() => {}}
                options={GRAN_OPTIONS}
                className="w-[64px] h-6 text-[10px]"
              />
            </div>

            {/* Aggregation */}
            <div>
              <MiniSelect
                value={kpi.agg}
                onChange={v => store.updateKpi(kpi.kpi_key, { agg: v as any })}
                options={AGG_OPTIONS}
                className="w-[72px] h-6 text-[10px]"
              />
            </div>

            {/* Series label chip */}
            <div className="pl-1 flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium text-white max-w-[200px] truncate"
                style={{ backgroundColor: color }}
              >
                <GraphIcon className="w-3 h-3 shrink-0 opacity-70" />
                {name}
                {cat?.unit && <span className="opacity-60">({cat.unit})</span>}
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1 rounded hover:bg-muted/40 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-all">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-32 p-1" align="end">
                  <button className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-foreground hover:bg-muted/50 rounded transition-colors">
                    <Copy className="w-3 h-3" /> Duplicate
                  </button>
                  <button
                    onClick={() => store.removeKpi(kpi.kpi_key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        );
      })}

      {/* Footer: Add + Title */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/10">
        <button
          onClick={onOpenKpiSelector}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-primary hover:bg-primary/[0.06] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New series
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Title:</span>
          <input
            type="text"
            placeholder="Auto-generated title"
            className="h-7 w-48 px-2 rounded-md border border-border/40 bg-background text-[11px] text-foreground outline-none focus:border-primary/40 transition-all"
          />
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   2) RIGHT CONFIG PANEL — Accordion sections, scrollable
   ════════════════════════════════════════════════════════════════ */
export interface RightConfigPanelProps {
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
}

export const RightConfigPanel: React.FC<RightConfigPanelProps> = ({
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
}) => {
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const addThreshold = () => {
    onThresholdsEnabledChange(true);
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Threshold', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="text-[11px]">
      {/* Panel header */}
      <div className="px-3 py-2.5 border-b border-border/30 bg-muted/20">
        <span className="text-[11px] font-bold text-foreground tracking-tight">Configuration</span>
      </div>

      {/* ── Legend ── */}
      <Section title="Legend" badge={graph.showLegend ? (graph.legendPosition === 'top' ? 'Top' : 'Bottom') : 'Hidden'}>
        <div className="flex gap-1">
          {(['top', 'bottom', 'hidden'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => {
                if (pos === 'hidden') setGraph({ showLegend: false });
                else setGraph({ showLegend: true, legendPosition: pos });
              }}
              className={cn(
                'flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all',
                (pos === 'hidden' && !graph.showLegend) || (pos !== 'hidden' && graph.showLegend && graph.legendPosition === pos)
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/40'
              )}
            >
              {pos === 'top' ? 'Top' : pos === 'bottom' ? 'Bottom' : 'Hidden'}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Style ── */}
      <Section title="Style">
        <ToggleRow label="Smooth curves" checked={graph.smooth} onChange={v => setGraph({ smooth: v })} />
        <ToggleRow label="Show symbols" checked={graph.showSymbols} onChange={v => setGraph({ showSymbols: v })} />
        <FieldRow label="Line width">
          <MiniSelect
            value={String(graph.lineWidth)}
            onChange={v => setGraph({ lineWidth: Number(v) })}
            options={[
              { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
              { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
            ]}
            className="w-16 h-6 text-[10px]"
          />
        </FieldRow>
        <FieldRow label="Grid">
          <MiniSelect
            value={graph.gridIntensity}
            onChange={v => setGraph({ gridIntensity: v as any })}
            options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }]}
            className="w-20 h-6 text-[10px]"
          />
        </FieldRow>
        <ToggleRow label="Vertical grid" checked={graph.showVerticalGrid} onChange={v => setGraph({ showVerticalGrid: v })} />
      </Section>

      {/* ── X Axis ── */}
      <Section title="X Axis">
        <FieldRow label="Format">
          <MiniSelect
            value={axis.xFormat}
            onChange={v => setAxis({ xFormat: v as any })}
            options={[
              { value: 'short', label: 'Short' }, { value: 'full', label: 'Full' },
              { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+Time' },
            ]}
            className="w-24 h-6 text-[10px]"
          />
        </FieldRow>
        <ToggleRow label="Show grid" checked={axis.xShowGrid} onChange={v => setAxis({ xShowGrid: v })} />
      </Section>

      {/* ── Y Axis Left ── */}
      <Section title="Y Axis — Left">
        <FieldRow label="Label">
          <input
            value={axis.yTitle}
            onChange={e => setAxis({ yTitle: e.target.value })}
            placeholder="Auto"
            className="h-6 w-24 px-2 rounded-md border border-border/40 bg-background text-[10px] text-foreground outline-none focus:border-primary/40 transition-all"
          />
        </FieldRow>
        <FieldRow label="Scale">
          <div className="inline-flex rounded-md border border-border/40 overflow-hidden">
            <button className="px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground">Linear</button>
            <button className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors">Log</button>
          </div>
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <MiniInput label="Min" type="number" placeholder="Auto"
            value={axis.yMin === 'auto' ? '' : String(axis.yMin)}
            onChange={e => setAxis({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })}
          />
          <MiniInput label="Max" type="number" placeholder="Auto"
            value={axis.yMax === 'auto' ? '' : String(axis.yMax)}
            onChange={e => setAxis({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Unit">
            <MiniSelect
              value={axis.yUnit}
              onChange={v => setAxis({ yUnit: v })}
              options={[
                { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' },
              ]}
              className="w-16 h-6 text-[10px]"
            />
          </FieldRow>
          <FieldRow label="Decimals">
            <MiniSelect
              value={String(axis.yDecimals)}
              onChange={v => setAxis({ yDecimals: Number(v) })}
              options={[{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
              className="w-12 h-6 text-[10px]"
            />
          </FieldRow>
        </div>
        <ToggleRow label="Invert axis" checked={axis.yInvert} onChange={v => setAxis({ yInvert: v })} />
      </Section>

      {/* ── Y Axis Right ── */}
      <Section title="Y Axis — Right" defaultOpen={false}>
        <FieldRow label="Scale">
          <div className="inline-flex rounded-md border border-border/40 overflow-hidden">
            <button className="px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground">Linear</button>
            <button className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors">Log</button>
          </div>
        </FieldRow>
        <div className="grid grid-cols-2 gap-2">
          <MiniInput label="Min" type="number" placeholder="Auto" />
          <MiniInput label="Max" type="number" placeholder="Auto" />
        </div>
      </Section>

      {/* ── Thresholds ── */}
      <Section title="Thresholds" badge={thresholdsEnabled && thresholds.length > 0 ? `${thresholds.length}` : undefined}>
        <ToggleRow label="Enable thresholds" checked={thresholdsEnabled} onChange={onThresholdsEnabledChange} />
        {thresholdsEnabled && (
          <>
            {thresholds.map(t => (
              <div key={t.id} className="flex items-center gap-1.5 group">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border/30" style={{ backgroundColor: t.color }} />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="flex gap-1.5">
                      {THRESHOLD_COLORS.map(c => (
                        <button key={c} onClick={() => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, color: c } : th))}
                          className={cn('w-5 h-5 rounded-full', t.color === c && 'ring-2 ring-primary ring-offset-1')}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <input type="number" value={t.value}
                  onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))}
                  className="h-6 w-14 px-1.5 rounded-md border border-border/40 bg-background text-[10px] text-foreground outline-none"
                />
                <input value={t.label}
                  onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                  className="h-6 flex-1 min-w-0 px-1.5 rounded-md border border-border/40 bg-background text-[10px] text-foreground outline-none"
                />
                <MiniSelect
                  value={t.style}
                  onChange={v => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: v as any } : th))}
                  options={[{ value: 'dashed', label: '- - -' }, { value: 'solid', label: '───' }]}
                  className="w-14 h-6 text-[10px]"
                />
                <button onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))}
                  className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button onClick={addThreshold}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
              <Plus className="w-3 h-3" /> Add threshold
            </button>
          </>
        )}
      </Section>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   3) BOTTOM FILTER CARDS — NEs + KPIs quick-add strip
   ════════════════════════════════════════════════════════════════ */
export const BottomFilterCards: React.FC<{
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}> = ({ catalogMap, onOpenKpiSelector }) => {
  const store = useKpiMonitorStore();

  return (
    <div className="border-t border-border/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[11px] font-semibold text-foreground">Filters & Quick Add</span>
        <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
          {store.selectedKpis.length} KPIs · {store.localFilters.reduce((s, f) => s + f.values.length, 0)} filters
        </span>
      </div>
      <div className="flex gap-3">
        {/* NE Card */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border/30 bg-card">
          <div className="bg-gradient-to-r from-emerald-500/90 to-teal-500/90 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-white tracking-tight">Network Elements</span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-white/70 font-medium">
                {store.localFilters.filter(f => f.dimension === 'site_name').reduce((s, f) => s + f.values.length, 0)} selected
              </span>
            </div>
          </div>
          <div className="px-3 py-2.5 min-h-[48px] flex flex-wrap gap-1.5 items-start">
            {store.localFilters.filter(f => f.dimension === 'site_name').map(f => (
              f.values.map((v, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/30 text-[10px] text-foreground font-medium">
                  {v}
                  <button className="text-muted-foreground/50 hover:text-destructive transition-colors"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))
            ))}
            <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border/40 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-medium">
              <Plus className="w-3 h-3" /> Add NE
            </button>
          </div>
        </div>
        {/* KPIs Card */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border/30 bg-card">
          <div className="bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-white tracking-tight">KPI Catalog</span>
            <span className="text-[9px] text-white/70 font-medium">{store.selectedKpis.length} active</span>
          </div>
          <div className="px-3 py-2.5 min-h-[48px] flex flex-wrap gap-1.5 items-start">
            {store.selectedKpis.map(kpi => {
              const cat = catalogMap[kpi.kpi_key];
              const name = cat?.display_name || kpi.kpi_key;
              const color = kpi.color || cat?.color || '#3b82f6';
              return (
                <span key={kpi.kpi_key}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 text-[10px] text-foreground font-medium"
                  style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {name}
                  <button onClick={() => store.removeKpi(kpi.kpi_key)} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            <button onClick={onOpenKpiSelector}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border/40 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-medium">
              <Plus className="w-3 h-3" /> Add KPI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Legacy exports (keep backward compat) ── */
export interface InlineGraphConfigProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  onCollapse: () => void;
  activeSection: QuickSettingsSection;
  onSetActiveSection?: (s: QuickSettingsSection) => void;
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
}

const InlineGraphConfig: React.FC<InlineGraphConfigProps> = () => null;

export const AxesPopover: React.FC<{ axisConfig?: WidgetAxisConfig; onAxisConfigChange?: (c: WidgetAxisConfig) => void; children: React.ReactNode }> = ({ children }) => <>{children}</>;

export default InlineGraphConfig;
