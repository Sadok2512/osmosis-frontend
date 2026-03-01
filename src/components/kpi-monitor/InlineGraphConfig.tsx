import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, ChevronUp, ChevronDown,
  TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  GitBranch, Axis3D, Settings2, AlertTriangle, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WidgetThreshold, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

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

/* ── Reusable micro-components ── */
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] text-muted-foreground font-medium">{children}</span>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 h-[36px]">
    <FieldLabel>{label}</FieldLabel>
    <div className="flex items-center">{children}</div>
  </div>
);

const MiniInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={`px-2.5 py-1.5 rounded-lg border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${className || 'w-[72px]'}`}
  />
);

const MiniSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`px-2 py-1.5 rounded-lg border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer ${className || 'w-[80px]'}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const SectionHeader: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-border/40">
    <Icon className="w-3.5 h-3.5 text-primary" />
    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
  </div>
);

/* ── Main Component ── */
export interface InlineGraphConfigProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  onCollapse: () => void;
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
}

const InlineGraphConfig: React.FC<InlineGraphConfigProps> = ({
  catalogMap, onOpenKpiSelector, onCollapse,
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
}) => {
  const store = useKpiMonitorStore();
  const axis = externalAxis || DEFAULT_AXIS;
  const graph = externalGraph || DEFAULT_GRAPH;
  const setAxis = (updates: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...updates });
  const setGraph = (updates: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...updates });

  const addThreshold = () => {
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="animate-in slide-in-from-top-3 duration-300 ease-out">
      <div className="mx-4 mt-3 mb-2 rounded-2xl border border-border/50 bg-muted/30 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">

        {/* ── Config Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-background/80 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-5 rounded-full bg-primary" />
            <span className="text-[13px] font-bold text-foreground tracking-tight">Edit Configuration</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { toast.success('Configuration appliquée'); onCollapse(); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Check className="w-3.5 h-3.5" /> Appliquer
            </button>
            <button
              onClick={onCollapse}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* 1️⃣ KPIs PARAMETERS — Full Width, Primary       */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="px-5 py-4 border-b border-border/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">KPIs</span>
              <span className="text-[10px] text-muted-foreground font-medium ml-1">
                {store.selectedKpis.length} selected
              </span>
            </div>
            <button
              onClick={onOpenKpiSelector}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Add KPI
            </button>
          </div>

          {store.selectedKpis.length === 0 ? (
            <button
              onClick={onOpenKpiSelector}
              className="w-full py-5 rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-primary text-[12px] font-medium"
            >
              <Plus className="w-4 h-4" /> Select KPIs to visualize
            </button>
          ) : (
            <div className="space-y-1.5">
              {/* Column headers */}
              <div className="grid grid-cols-[20px_1fr_52px_44px_80px_72px_28px] gap-2 px-3 pb-1.5 items-center">
                <span />
                <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Name</span>
                <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-center">Axis</span>
                <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-center">Split</span>
                <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-center">Type</span>
                <span />
                <span />
              </div>

              {store.selectedKpis.map(kpi => {
                const cat = catalogMap[kpi.kpi_key];
                const displayColor = kpi.color || cat?.color || '#3b82f6';
                const displayName = cat?.display_name || kpi.kpi_key;
                const graphType = kpi.graphType || 'line';
                return (
                  <div
                    key={kpi.kpi_key}
                    className="grid grid-cols-[20px_1fr_52px_44px_80px_72px_28px] gap-2 items-center px-3 py-2 rounded-xl bg-background hover:bg-muted/40 transition-colors group h-[42px]"
                  >
                    {/* Color dot */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="w-4 h-4 rounded-full shrink-0 ring-1 ring-border/60 hover:ring-primary/60 hover:scale-110 transition-all cursor-pointer shadow-sm"
                          style={{ backgroundColor: displayColor }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2.5" align="start">
                        <div className="grid grid-cols-5 gap-1.5">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                              className={`w-6 h-6 rounded-full transition-transform hover:scale-125 ${displayColor === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Name */}
                    <span className="text-[12px] font-medium text-foreground truncate">{displayName}</span>

                    {/* Axis L/R toggle */}
                    <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 overflow-hidden h-[28px]">
                      <button
                        onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                        className={`px-2 py-1 text-[10px] font-bold transition-all ${kpi.axis === 'left' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >L</button>
                      <button
                        onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                        className={`px-2 py-1 text-[10px] font-bold transition-all ${kpi.axis === 'right' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >R</button>
                    </div>

                    {/* Split icon */}
                    <div className="flex justify-center">
                      <Select
                        value={kpi.splitOverride === null ? 'none' : kpi.splitOverride || 'none'}
                        onValueChange={v => store.updateKpi(kpi.kpi_key, { splitOverride: v === 'none' ? null : v as SplitDimension })}
                      >
                        <SelectTrigger className="h-7 w-[42px] text-[9px] px-1 border-border/60 bg-muted/30 rounded-lg">
                          <GitBranch className="w-3 h-3 text-muted-foreground" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[10px]">Aucun</SelectItem>
                          {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-[10px]">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Graph type */}
                    <Select value={graphType} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                      <SelectTrigger className="h-7 w-[78px] text-[10px] px-2 border-border/60 bg-muted/30 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRAPH_TYPES.map(g => (
                          <SelectItem key={g.value} value={g.value} className="text-[11px]">
                            <div className="flex items-center gap-1.5"><g.icon className="w-3 h-3" /> {g.label}</div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Spacer */}
                    <span />

                    {/* Remove */}
                    <button
                      onClick={() => store.removeKpi(kpi.kpi_key)}
                      className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* 2️⃣ TWO COLUMNS: Axes + Graph Style              */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-b border-border/30">

          {/* ── Left: Axes Parameters ── */}
          <div className="px-5 py-4 md:border-r border-border/30">
            <SectionHeader icon={Axis3D} title="Axes Parameters" />

            {/* Y Axis */}
            <div className="mb-4">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 block">Y Axis</span>
              <div className="space-y-1">
                <FieldRow label="Min">
                  <MiniInput
                    type="number"
                    value={axis.yMin === 'auto' ? '' : String(axis.yMin)}
                    placeholder="Auto"
                    onChange={e => { const v = e.target.value; setAxis({ yMin: v === '' ? 'auto' : Number(v) }); }}
                    className="w-[64px]"
                  />
                </FieldRow>
                <FieldRow label="Max">
                  <MiniInput
                    type="number"
                    value={axis.yMax === 'auto' ? '' : String(axis.yMax)}
                    placeholder="Auto"
                    onChange={e => { const v = e.target.value; setAxis({ yMax: v === '' ? 'auto' : Number(v) }); }}
                    className="w-[64px]"
                  />
                </FieldRow>
                <FieldRow label="Unit">
                  <MiniSelect
                    value={axis.yUnit}
                    options={[
                      { value: '', label: 'Auto' }, { value: '%', label: '%' },
                      { value: 'Mbps', label: 'Mbps' }, { value: 'ms', label: 'ms' },
                      { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
                    ]}
                    onChange={v => setAxis({ yUnit: v })}
                    className="w-[80px]"
                  />
                </FieldRow>
                <FieldRow label="Decimals">
                  <MiniSelect
                    value={String(axis.yDecimals)}
                    options={[
                      { value: '0', label: '0' }, { value: '1', label: '1' },
                      { value: '2', label: '2' }, { value: '3', label: '3' },
                    ]}
                    onChange={v => setAxis({ yDecimals: Number(v) })}
                    className="w-[64px]"
                  />
                </FieldRow>
                <FieldRow label="Invert">
                  <Switch
                    checked={axis.yInvert}
                    onCheckedChange={v => setAxis({ yInvert: v })}
                    className="h-5 w-9 data-[state=checked]:bg-primary"
                  />
                </FieldRow>
              </div>
            </div>

            {/* X Axis */}
            <div>
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 block">X Axis</span>
              <div className="space-y-1">
                <FieldRow label="Format">
                  <MiniSelect
                    value={axis.xFormat}
                    options={[
                      { value: 'short', label: 'Short' }, { value: 'full', label: 'Full' },
                      { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
                    ]}
                    onChange={v => setAxis({ xFormat: v as any })}
                    className="w-[80px]"
                  />
                </FieldRow>
                <FieldRow label="Vertical grid">
                  <Switch
                    checked={axis.xShowGrid}
                    onCheckedChange={v => setAxis({ xShowGrid: v })}
                    className="h-5 w-9 data-[state=checked]:bg-primary"
                  />
                </FieldRow>
              </div>
            </div>
          </div>

          {/* ── Right: Graph Style ── */}
          <div className="px-5 py-4">
            <SectionHeader icon={Settings2} title="Graph Style" />
            <div className="space-y-1">
              <FieldRow label="Smooth">
                <Switch
                  checked={graph.smooth}
                  onCheckedChange={v => setGraph({ smooth: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
              <FieldRow label="Line thickness">
                <MiniSelect
                  value={String(graph.lineWidth)}
                  options={[
                    { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
                    { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' },
                    { value: '3', label: '3px' },
                  ]}
                  onChange={v => setGraph({ lineWidth: Number(v) })}
                  className="w-[72px]"
                />
              </FieldRow>
              <FieldRow label="Grid intensity">
                <MiniSelect
                  value={graph.gridIntensity}
                  options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }]}
                  onChange={v => setGraph({ gridIntensity: v as any })}
                  className="w-[80px]"
                />
              </FieldRow>
              <FieldRow label="Background">
                <div className="flex items-center gap-1.5">
                  {['transparent', '#f8fafc', '#0f172a'].map(c => (
                    <button
                      key={c}
                      onClick={() => setGraph({ backgroundColor: c, transparentBg: c === 'transparent' })}
                      className={`w-6 h-6 rounded-lg border-2 transition-all ${graph.backgroundColor === c ? 'border-primary ring-1 ring-primary/20 scale-110' : 'border-border/40 hover:border-border'}`}
                      style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                    >
                      {c === 'transparent' && <span className="text-[8px] text-muted-foreground font-bold">T</span>}
                    </button>
                  ))}
                </div>
              </FieldRow>
              <FieldRow label="Legend">
                <Switch
                  checked={graph.showLegend}
                  onCheckedChange={v => setGraph({ showLegend: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>

            {/* Thresholds */}
            <div className="mt-4 pt-3 border-t border-border/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Thresholds</span>
                </div>
                <Switch
                  checked={thresholdsEnabled}
                  onCheckedChange={onThresholdsEnabledChange}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </div>
              {thresholdsEnabled && (
                <div className="space-y-1.5">
                  {thresholds.map(t => (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background group">
                      <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: t.color }} />
                      <MiniInput
                        type="number"
                        value={t.value}
                        onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))}
                        className="w-[56px]"
                        placeholder="Val"
                      />
                      <MiniInput
                        type="text"
                        value={t.label}
                        onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                        className="flex-1 min-w-0"
                        placeholder="Label"
                      />
                      <MiniSelect
                        value={t.style}
                        options={[{ value: 'dashed', label: '- -' }, { value: 'solid', label: '—' }]}
                        onChange={v => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: v as any } : th))}
                        className="w-[52px]"
                      />
                      <button
                        onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))}
                        className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addThreshold}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/50 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add threshold
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InlineGraphConfig;
