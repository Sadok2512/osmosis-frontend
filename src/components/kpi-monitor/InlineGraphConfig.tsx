import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  Check, AlertTriangle, SlidersHorizontal, Settings2, Axis3D,
} from 'lucide-react';
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

/* ── Micro-components ── */
const MiniInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={`px-2 py-1 rounded-md border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 transition-all ${className || 'w-16'}`}
  />
);

const MiniSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`px-1.5 py-1 rounded-md border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer ${className || 'w-[72px]'}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 min-h-[28px]">
    <span className="text-[10px] text-muted-foreground font-medium shrink-0">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

/* ════════════════════════════════════════════════════
   AXES POPOVER — attached to header button
   ════════════════════════════════════════════════════ */
export const AxesPopover: React.FC<{
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  children: React.ReactNode; // trigger button
}> = ({ axisConfig: externalAxis, onAxisConfigChange, children }) => {
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const [tab, setTab] = useState<'y' | 'x'>('y');

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end" sideOffset={8}>
        <div className="flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-border/40">
            {(['y', 'x'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === t
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'y' ? 'Y Axis' : 'X Axis'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-3 space-y-1">
            {tab === 'y' ? (
              <>
                <FieldRow label="Title">
                  <MiniInput value={axis.yTitle} placeholder="Auto" onChange={e => setAxis({ yTitle: e.target.value })} className="w-24" />
                </FieldRow>
                <FieldRow label="Min">
                  <MiniInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto" onChange={e => { const v = e.target.value; setAxis({ yMin: v === '' ? 'auto' : Number(v) }); }} className="w-16" />
                </FieldRow>
                <FieldRow label="Max">
                  <MiniInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto" onChange={e => { const v = e.target.value; setAxis({ yMax: v === '' ? 'auto' : Number(v) }); }} className="w-16" />
                </FieldRow>
                <FieldRow label="Unit">
                  <MiniSelect
                    value={axis.yUnit}
                    options={[{ value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' }, { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' }]}
                    onChange={v => setAxis({ yUnit: v })}
                    className="w-[68px]"
                  />
                </FieldRow>
                <FieldRow label="Decimals">
                  <MiniSelect
                    value={String(axis.yDecimals)}
                    options={[{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
                    onChange={v => setAxis({ yDecimals: Number(v) })}
                    className="w-14"
                  />
                </FieldRow>
                <FieldRow label="Invert">
                  <Switch checked={axis.yInvert} onCheckedChange={v => setAxis({ yInvert: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
                </FieldRow>
              </>
            ) : (
              <>
                <FieldRow label="Format">
                  <MiniSelect
                    value={axis.xFormat}
                    options={[{ value: 'short', label: 'Short' }, { value: 'full', label: 'Full' }, { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' }]}
                    onChange={v => setAxis({ xFormat: v as any })}
                    className="w-[72px]"
                  />
                </FieldRow>
                <FieldRow label="Grid V">
                  <Switch checked={axis.xShowGrid} onCheckedChange={v => setAxis({ xShowGrid: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
                </FieldRow>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ════════════════════════════════════════════════════
   QUICK SETTINGS BAR — compact inline under header
   ════════════════════════════════════════════════════ */
export type QuickSettingsSection = 'kpis' | 'style' | null;

export interface InlineGraphConfigProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  onCollapse: () => void;
  activeSection: QuickSettingsSection;
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
  catalogMap, onOpenKpiSelector, onCollapse, activeSection,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
}) => {
  const store = useKpiMonitorStore();
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const addThreshold = () => {
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Threshold', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  if (!activeSection) return null;

  return (
    <div className="border-b border-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="px-3 py-2.5">

        {/* ── KPIs Section ── */}
        {activeSection === 'kpis' && (
          <div className="space-y-1.5">
            {store.selectedKpis.length === 0 ? (
              <button
                onClick={onOpenKpiSelector}
                className="w-full py-3 rounded-lg border border-dashed border-border/50 hover:border-primary/40 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[11px] font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Select KPIs
              </button>
            ) : (
              <>
                {store.selectedKpis.map(kpi => {
                  const cat = catalogMap[kpi.kpi_key];
                  const color = kpi.color || cat?.color || '#3b82f6';
                  const name = cat?.display_name || kpi.kpi_key;
                  return (
                    <div key={kpi.kpi_key} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors group">
                      {/* Color dot */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border/30 hover:scale-110 transition-transform" style={{ backgroundColor: color }} />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="grid grid-cols-5 gap-1.5">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                                className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Name */}
                      <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">{name}</span>

                      {/* Axis L/R */}
                      <div className="flex rounded-md border border-border/40 overflow-hidden shrink-0">
                        {(['left', 'right'] as const).map(side => (
                          <button
                            key={side}
                            onClick={() => store.updateKpi(kpi.kpi_key, { axis: side })}
                            className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${kpi.axis === side ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                          >{side === 'left' ? 'L' : 'R'}</button>
                        ))}
                      </div>

                      {/* Graph type */}
                      <Select value={kpi.graphType || 'line'} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                        <SelectTrigger className="h-5 w-14 text-[9px] px-1 border-border/40 bg-background rounded-md shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRAPH_TYPES.map(g => (
                            <SelectItem key={g.value} value={g.value} className="text-[10px]">
                              <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Remove */}
                      <button onClick={() => store.removeKpi(kpi.kpi_key)} className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                <button onClick={onOpenKpiSelector} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus className="w-3 h-3" /> Add KPI
                </button>
              </>
            )}

            {/* Thresholds mini-section */}
            <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-border/20">
              <AlertTriangle className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[10px] font-medium text-muted-foreground flex-1">Thresholds</span>
              <Switch checked={thresholdsEnabled} onCheckedChange={onThresholdsEnabledChange} className="h-4 w-8 data-[state=checked]:bg-primary" />
            </div>
            {thresholdsEnabled && (
              <div className="space-y-1 pl-5">
                {thresholds.map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 group">
                    <button className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <MiniInput type="number" value={t.value} onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))} className="w-12" />
                    <MiniInput value={t.label} onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))} className="flex-1 min-w-0" />
                    <button onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))} className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                <button onClick={addThreshold} className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1">
                  <Plus className="w-2.5 h-2.5" /> Add
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Style Section ── */}
        {activeSection === 'style' && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Smooth</span>
              <Switch checked={graph.smooth} onCheckedChange={v => setGraph({ smooth: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Symbols</span>
              <Switch checked={graph.showSymbols} onCheckedChange={v => setGraph({ showSymbols: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Legend</span>
              <Switch checked={graph.showLegend} onCheckedChange={v => setGraph({ showLegend: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Grid V</span>
              <Switch checked={graph.showVerticalGrid || false} onCheckedChange={v => setGraph({ showVerticalGrid: v })} className="h-4 w-8 data-[state=checked]:bg-primary" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Line</span>
              <MiniSelect
                value={String(graph.lineWidth)}
                options={[{ value: '1', label: '1px' }, { value: '1.5', label: '1.5' }, { value: '2', label: '2px' }, { value: '2.5', label: '2.5' }, { value: '3', label: '3px' }]}
                onChange={v => setGraph({ lineWidth: Number(v) })}
                className="w-14"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium">Grid</span>
              <MiniSelect
                value={graph.gridIntensity}
                options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }]}
                onChange={v => setGraph({ gridIntensity: v as any })}
                className="w-[68px]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">Bg</span>
              {['transparent', '#f8fafc', '#0f172a'].map(c => (
                <button
                  key={c}
                  onClick={() => setGraph({ backgroundColor: c, transparentBg: c === 'transparent' })}
                  className={`w-5 h-5 rounded-md border transition-all ${graph.backgroundColor === c ? 'border-primary ring-1 ring-primary/20 scale-110' : 'border-border/40 hover:border-border'}`}
                  style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                >
                  {c === 'transparent' && <span className="text-[7px] text-muted-foreground font-bold">T</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InlineGraphConfig;
