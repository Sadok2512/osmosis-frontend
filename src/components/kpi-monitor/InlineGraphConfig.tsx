import React, { useState } from 'react';
import { Input } from '../ui/input';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot, Hash,
  ChevronDown, ChevronRight, Trash2, Filter, GitBranch,
  BarChart3, Axis3D, Settings2, AlertTriangle, Save, Grid3X3, Calendar,
  Eye, EyeOff, Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
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

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const DEFAULT_AXIS: WidgetAxisConfig = {
  yTitle: '', yMin: 'auto', yMax: 'auto', yUnit: '', yDecimals: 2, yInvert: false,
  xMode: 'date', xFormat: 'short', xShowGrid: false,
};

const DEFAULT_GRAPH: WidgetGraphConfig = {
  smooth: true, lineWidth: 2.5, showSymbols: false,
  gridIntensity: 'light', showVerticalGrid: false,
  backgroundColor: 'transparent', transparentBg: true,
  showLegend: false, legendPosition: 'bottom',
};

/* ── Micro UI helpers (redesigned) ── */
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-border/10 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex items-center gap-1.5">{children}</div>
  </div>
);

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={cn(
      'h-7 px-2.5 rounded-md border border-border/40 bg-muted/30 text-[11px] text-foreground',
      'outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:bg-background transition-all',
      className || 'w-[72px]'
    )}
  />
);

const SmallSelect: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={cn(
      'h-7 px-2 rounded-md border border-border/40 bg-muted/30 text-[11px] text-foreground',
      'outline-none focus:border-primary/50 cursor-pointer transition-all appearance-none',
      className || 'w-[72px]'
    )}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const SmallToggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-[11px] text-foreground/80">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7 data-[state=checked]:bg-primary" />
  </div>
);

/* ── Section Card wrapper ── */
const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: string | number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, badge, open, onToggle, children, action }) => (
  <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors"
    >
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-[11px] font-semibold text-foreground tracking-wide uppercase flex-1 text-left">{title}</span>
      {badge !== undefined && (
        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/10 text-primary min-w-[20px] text-center">
          {badge}
        </span>
      )}
      {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
      {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
    {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
  </div>
);

/* ── Pill/Badge helper ── */
const AxisBadge: React.FC<{ side: 'left' | 'right'; onClick: () => void }> = ({ side, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide transition-colors',
      side === 'left'
        ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
        : 'bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20'
    )}
  >
    {side === 'left' ? 'L' : 'R'}
  </button>
);

/* ════════════════════════════════════════════════════════════════
   SIDEBAR CONFIG PANEL — Redesigned: KPI Explainability style
   ════════════════════════════════════════════════════════════════ */
export type QuickSettingsSection = 'kpis' | 'style' | 'full' | null;

export interface ConfigPanelProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  onOpenCounterSelector?: () => void;
  selectedCounterCount?: number;
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
  title?: string;
  onClose?: () => void;
  onSave?: () => void;
}

export const HorizontalConfigPanel: React.FC<ConfigPanelProps> = ({
  catalogMap, onOpenKpiSelector, onOpenCounterSelector, selectedCounterCount,
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
  title, onClose, onSave,
}) => {
  const store = useKpiMonitorStore();
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const gridCfg = graph.grid || { enabled: true, opacity: 20, type: 'both' as const };
  const calCfg = graph.calendar || { highlightWeekends: true, weekendColor: '#E5E7EB', weekendOpacity: 10 };
  const setGridCfg = (u: Partial<typeof gridCfg>) => setGraphD({ grid: { ...gridCfg, ...u } });
  const setCalCfg = (u: Partial<typeof calCfg>) => setGraphD({ calendar: { ...calCfg, ...u } });

  const [kpiOpen, setKpiOpen] = useState(true);
  const [counterOpen, setCounterOpen] = useState(false);
  const [axeOpen, setAxeOpen] = useState(false);
  const [gridCalOpen, setGridCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const markDirty = () => { if (!dirty) setDirty(true); };

  const setAxisD = (u: Partial<WidgetAxisConfig>) => { setAxis(u); markDirty(); };
  const setGraphD = (u: Partial<WidgetGraphConfig>) => { setGraph(u); markDirty(); };

  const prevKpiCount = React.useRef(store.selectedKpis.length);
  const prevThresholdCount = React.useRef(thresholds.length);
  const prevThresholdsEnabled = React.useRef(thresholdsEnabled);
  React.useEffect(() => {
    if (
      store.selectedKpis.length !== prevKpiCount.current ||
      thresholds.length !== prevThresholdCount.current ||
      thresholdsEnabled !== prevThresholdsEnabled.current
    ) {
      markDirty();
    }
    prevKpiCount.current = store.selectedKpis.length;
    prevThresholdCount.current = thresholds.length;
    prevThresholdsEnabled.current = thresholdsEnabled;
  }, [store.selectedKpis.length, thresholds.length, thresholdsEnabled]);

  const addThreshold = () => {
    onThresholdsEnabledChange(true);
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
    markDirty();
  };

  const handleSave = () => {
    setDirty(false);
    onSave?.();
  };

  /* helper to build axis default */
  const axDef = (existing: any) => existing || { title: '', min: 'auto', max: 'auto', unit: '', decimals: 2, invert: false };

  return (
    <div className="w-[380px] shrink-0 h-full border-l border-border/30 bg-card flex flex-col overflow-hidden shadow-lg">

      {/* ─── Header (Explainability style) ─── */}
      <div className="px-5 py-4 border-b border-border/20 bg-sidebar-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-left group/title">
                    <h3 className="text-sm font-semibold text-foreground leading-tight group-hover/title:underline group-hover/title:decoration-primary/40 transition-all cursor-pointer">
                      {(graph as any).customTitle || title || 'Graph Settings'}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Click to edit appearance</p>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-3 space-y-3" align="start">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Widget Appearance</div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Title</span>
                    <Input
                      value={(graph as any).customTitle || ''}
                      placeholder={title || 'Graph title'}
                      onChange={e => setGraphD({ customTitle: e.target.value || undefined } as any)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Title Color</span>
                    <div className="flex gap-1 flex-wrap">
                      {['#000000','#ffffff','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#6366f1'].map(c => (
                        <button key={c} onClick={() => setGraphD({ titleColor: c } as any)}
                          className={cn('w-5 h-5 rounded-md border-2 transition-all', (graph as any).titleColor === c ? 'border-foreground scale-110' : 'border-border/40')}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      {(graph as any).titleColor && (
                        <button onClick={() => setGraphD({ titleColor: undefined } as any)}
                          className="px-1.5 py-0.5 rounded-md text-[9px] text-muted-foreground border border-border/40 hover:bg-muted/50">Reset</button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Background</span>
                    <div className="flex gap-1 flex-wrap">
                      {['transparent','#ffffff','#0f172a','#f8fafc','#f0fdf4','#eff6ff','#fefce8','#fdf2f8'].map(c => (
                        <button key={c} onClick={() => setGraphD({ backgroundColor: c, transparentBg: c === 'transparent' })}
                          className={cn(
                            'w-5 h-5 rounded-md border-2 transition-all',
                            (graph.backgroundColor || 'transparent') === c ? 'border-foreground scale-110' : 'border-border/40',
                            c === 'transparent' && 'bg-[repeating-conic-gradient(#ddd_0_25%,transparent_0_50%)] bg-[length:8px_8px]'
                          )}
                          style={c !== 'transparent' ? { backgroundColor: c } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Scrollable content ─── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">

          {/* ── KPIs SÉLECTIONNÉS ── */}
          <SectionCard
            icon={<BarChart3 className="w-4 h-4" />}
            title="KPIs sélectionnés"
            badge={store.selectedKpis.length}
            open={kpiOpen}
            onToggle={() => setKpiOpen(!kpiOpen)}
          >
            {/* Add KPI button */}
            <button
              onClick={onOpenKpiSelector}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <Plus className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="text-left">
                <span className="text-[11px] font-medium text-primary">Sélectionner des KPIs</span>
                <span className="text-[9px] text-muted-foreground block">{store.selectedKpis.length} actif(s)</span>
              </div>
            </button>

            {/* KPI rows */}
            {store.selectedKpis.length > 0 && (
              <div className="space-y-1.5 mt-1">
                {store.selectedKpis.map(kpi => {
                  const kpiId = kpi.id || kpi.kpi_key;
                  const cat = catalogMap[kpi.kpi_key];
                  const displayColor = kpi.color || cat?.color || '#3b82f6';
                  const displayName = kpi.label || cat?.display_name || kpi.kpi_key;
                  const isExpanded = expandedKpi === kpiId;
                  const updateThis = (u: Record<string, any>) => { store.updateKpi(kpiId, u); markDirty(); };

                  return (
                    <div key={kpiId} className="rounded-lg border border-border/20 bg-background/60 hover:bg-background transition-colors">
                      {/* Compact row */}
                      <div className="flex items-center gap-2 px-3 py-2.5 group">
                        {/* Color dot */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background hover:scale-110 transition-transform cursor-pointer"
                              style={{ backgroundColor: displayColor }}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3" align="start">
                            <div className="grid grid-cols-5 gap-2">
                              {PRESET_COLORS.map(c => (
                                <button key={c} onClick={() => updateThis({ color: c })}
                                  className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', displayColor === c && 'ring-2 ring-primary ring-offset-2')}
                                  style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Name */}
                        <button
                          onClick={() => setExpandedKpi(isExpanded ? null : kpiId)}
                          className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0 text-left hover:text-primary transition-colors"
                        >
                          {displayName}
                        </button>

                        {/* Split per-KPI */}
                        <div className="flex items-center gap-1 shrink-0">
                          <GitBranch className="w-3 h-3 text-muted-foreground/40" />
                          <SmallSelect
                            value={kpi.splitOverride || ''}
                            options={[{ value: '', label: '—' }, ...SPLIT_OPTIONS]}
                            onChange={v => updateThis({ splitOverride: v || null })}
                            className="w-[72px]"
                          />
                        </div>

                        {/* Axis badge */}
                        <AxisBadge
                          side={kpi.axis === 'left' ? 'left' : 'right'}
                          onClick={() => updateThis({ axis: kpi.axis === 'left' ? 'right' : 'left', yAxisIndex: kpi.axis === 'left' ? 1 : 0 })}
                        />

                        {/* Graph type */}
                        <Select value={kpi.graphType || 'line'} onValueChange={v => updateThis({ graphType: v as GraphType })}>
                          <SelectTrigger className="h-6 w-[60px] text-[10px] px-1.5 border-border/30 bg-muted/30 rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" className="z-[9999]">
                            {GRAPH_TYPES.map(g => (
                              <SelectItem key={g.value} value={g.value} className="text-[10px]">
                                <div className="flex items-center gap-1.5"><g.icon className="w-3 h-3" /> {g.label}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Delete */}
                        <button onClick={() => { store.removeKpi(kpiId); markDirty(); }}
                          className="p-1 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>

                      {/* Expanded per-series config */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/10 space-y-1">
                          <FieldRow label="Style">
                            <SmallSelect value={kpi.lineStyle || 'solid'} options={[
                              { value: 'solid', label: '── Solid' }, { value: 'dashed', label: '- - Dashed' }, { value: 'dotted', label: '··· Dotted' },
                            ]} onChange={v => updateThis({ lineStyle: v })} className="w-[90px]" />
                          </FieldRow>
                          <FieldRow label="Épaisseur">
                            <SmallInput type="number" value={String(kpi.lineWidth ?? 2.5)} onChange={e => updateThis({ lineWidth: Number(e.target.value) || 2.5 })} className="w-[60px]" />
                          </FieldRow>
                          <FieldRow label="Opacité">
                            <SmallInput type="number" value={String(kpi.opacity ?? 1)} min="0" max="1" step="0.1" onChange={e => updateThis({ opacity: Number(e.target.value) })} className="w-[60px]" />
                          </FieldRow>
                          <SmallToggle label="Marqueurs" checked={kpi.showMarkers ?? false} onChange={v => updateThis({ showMarkers: v })} />
                          <SmallToggle label="Visible" checked={kpi.visible ?? true} onChange={v => updateThis({ visible: v })} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ── COMPTEURS ── */}
          {onOpenCounterSelector && (
            <SectionCard
              icon={<Hash className="w-4 h-4" />}
              title="Compteurs"
              badge={selectedCounterCount || 0}
              open={counterOpen}
              onToggle={() => setCounterOpen(!counterOpen)}
            >
              <button
                onClick={onOpenCounterSelector}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
              >
                <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="text-left">
                  <span className="text-[11px] font-medium text-emerald-600">Sélectionner des Compteurs</span>
                  <span className="text-[9px] text-muted-foreground block">{selectedCounterCount || 0} actif(s)</span>
                </div>
              </button>
            </SectionCard>
          )}

          {/* ── AXES ── */}
          <SectionCard
            icon={<Axis3D className="w-4 h-4" />}
            title="Axes"
            open={axeOpen}
            onToggle={() => setAxeOpen(!axeOpen)}
            action={
              <button onClick={e => { e.stopPropagation(); addThreshold(); }}
                className="flex items-center gap-1 text-[9px] text-primary hover:text-primary/80 font-medium px-1.5 py-0.5 rounded-md hover:bg-primary/10 transition-colors">
                <AlertTriangle className="w-3 h-3" /> + Seuil
              </button>
            }
          >
            {/* Left Y-Axis */}
            <div className="rounded-lg border border-border/20 bg-background/40 p-3 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Axe Y Gauche (L)</span>
              </div>
              <FieldRow label="Titre">
                <SmallInput value={axis.leftAxis?.title || axis.yTitle} onChange={e => setAxisD({ yTitle: e.target.value, leftAxis: { ...axDef(axis.leftAxis), title: e.target.value } })} placeholder="Auto" className="w-[100px]" />
              </FieldRow>
              <FieldRow label="Min">
                <SmallInput type="number" value={(axis.leftAxis?.min ?? axis.yMin) === 'auto' ? '' : String(axis.leftAxis?.min ?? axis.yMin)} placeholder="Auto"
                  onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ yMin: v, leftAxis: { ...axDef(axis.leftAxis), min: v } }); }} className="w-[80px]" />
              </FieldRow>
              <FieldRow label="Max">
                <SmallInput type="number" value={(axis.leftAxis?.max ?? axis.yMax) === 'auto' ? '' : String(axis.leftAxis?.max ?? axis.yMax)} placeholder="Auto"
                  onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ yMax: v, leftAxis: { ...axDef(axis.leftAxis), max: v } }); }} className="w-[80px]" />
              </FieldRow>
              <FieldRow label="Unité">
                <SmallSelect value={axis.leftAxis?.unit || axis.yUnit} options={[
                  { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                  { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
                ]} onChange={v => setAxisD({ yUnit: v, leftAxis: { ...axDef(axis.leftAxis), unit: v } })} className="w-[80px]" />
              </FieldRow>
            </div>

            {/* Right Y-Axis */}
            {store.selectedKpis.some(k => k.axis === 'right') && (
              <div className="rounded-lg border border-border/20 bg-background/40 p-3 space-y-1 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Axe Y Droite (R)</span>
                </div>
                <FieldRow label="Titre">
                  <SmallInput value={axis.rightAxis?.title || ''} onChange={e => setAxisD({ rightAxis: { ...axDef(axis.rightAxis), title: e.target.value } })} placeholder="Auto" className="w-[100px]" />
                </FieldRow>
                <FieldRow label="Min">
                  <SmallInput type="number" value={axis.rightAxis?.min === 'auto' || !axis.rightAxis ? '' : String(axis.rightAxis.min)} placeholder="Auto"
                    onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ rightAxis: { ...axDef(axis.rightAxis), min: v } }); }} className="w-[80px]" />
                </FieldRow>
                <FieldRow label="Max">
                  <SmallInput type="number" value={axis.rightAxis?.max === 'auto' || !axis.rightAxis ? '' : String(axis.rightAxis.max)} placeholder="Auto"
                    onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ rightAxis: { ...axDef(axis.rightAxis), max: v } }); }} className="w-[80px]" />
                </FieldRow>
                <FieldRow label="Unité">
                  <SmallSelect value={axis.rightAxis?.unit || ''} options={[
                    { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                    { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
                  ]} onChange={v => setAxisD({ rightAxis: { ...axDef(axis.rightAxis), unit: v } })} className="w-[80px]" />
                </FieldRow>
              </div>
            )}

            {/* Thresholds */}
            {thresholds.length > 0 && (
              <div className="rounded-lg border border-border/20 bg-background/40 p-3 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Seuils
                  </span>
                  <Switch checked={thresholdsEnabled} onCheckedChange={v => { onThresholdsEnabledChange(v); markDirty(); }} className="h-4 w-7 data-[state=checked]:bg-primary" />
                </div>
                {thresholdsEnabled && thresholds.map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 group py-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border/30 hover:ring-2 transition-all" style={{ backgroundColor: t.color }} />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="start">
                        <div className="flex gap-1.5">
                          {THRESHOLD_COLORS.map(c => (
                            <button key={c}
                              onClick={() => { onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, color: c } : th)); markDirty(); }}
                              className={cn('w-5 h-5 rounded-full', t.color === c && 'ring-2 ring-primary ring-offset-1')}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <SmallInput type="number" value={t.value}
                      onChange={e => { onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th)); markDirty(); }}
                      className="w-14" />
                    <SmallInput value={t.label}
                      onChange={e => { onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th)); markDirty(); }}
                      className="flex-1 min-w-0" />
                    <SmallSelect value={t.style}
                      onChange={v => { onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: v as any } : th)); markDirty(); }}
                      options={[{ value: 'dashed', label: '- -' }, { value: 'solid', label: '──' }, { value: 'dotted', label: '···' }]}
                      className="w-12" />
                    <SmallSelect value={t.axis || 'left'}
                      onChange={v => { onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, axis: v as any } : th)); markDirty(); }}
                      options={[{ value: 'left', label: 'L' }, { value: 'right', label: 'R' }]}
                      className="w-10" />
                    <button onClick={() => { onThresholdsChange(thresholds.filter(th => th.id !== t.id)); markDirty(); }}
                      className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {thresholdsEnabled && thresholds.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic text-center py-2">Aucun seuil configuré</p>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── GRILLE & WEEKENDS ── */}
          <SectionCard
            icon={<Grid3X3 className="w-4 h-4" />}
            title="Grille & Weekends"
            open={gridCalOpen}
            onToggle={() => setGridCalOpen(!gridCalOpen)}
          >
            {/* Grid */}
            <div className="rounded-lg border border-border/20 bg-background/40 p-3 space-y-1">
              <SmallToggle label="Afficher la grille" checked={gridCfg.enabled} onChange={v => setGridCfg({ enabled: v })} />
              {gridCfg.enabled && (
                <>
                  <FieldRow label="Opacité">
                    <div className="flex items-center gap-2">
                      <Slider min={0} max={100} step={5} value={[gridCfg.opacity]} onValueChange={([v]) => setGridCfg({ opacity: v })} className="w-[80px]" />
                      <span className="text-[9px] text-muted-foreground w-[28px] text-right">{gridCfg.opacity}%</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Type">
                    <SmallSelect value={gridCfg.type} options={[
                      { value: 'horizontal', label: 'Horizontal' },
                      { value: 'vertical', label: 'Vertical' },
                      { value: 'both', label: 'Les deux' },
                    ]} onChange={v => setGridCfg({ type: v as any })} className="w-[90px]" />
                  </FieldRow>
                </>
              )}
            </div>

            {/* Weekends */}
            <div className="rounded-lg border border-border/20 bg-background/40 p-3 space-y-1 mt-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-foreground/80">Weekends</span>
              </div>
              <SmallToggle label="Highlight weekends" checked={calCfg.highlightWeekends} onChange={v => setCalCfg({ highlightWeekends: v })} />
              {calCfg.highlightWeekends && (
                <>
                  <FieldRow label="Opacité">
                    <div className="flex items-center gap-2">
                      <Slider min={0} max={50} step={2} value={[calCfg.weekendOpacity]} onValueChange={([v]) => setCalCfg({ weekendOpacity: v })} className="w-[80px]" />
                      <span className="text-[9px] text-muted-foreground w-[28px] text-right">{calCfg.weekendOpacity}%</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Couleur">
                    <div className="flex items-center gap-1.5">
                      {['#E5E7EB', '#DBEAFE', '#FEF3C7', '#D1FAE5'].map(c => (
                        <button type="button" key={c}
                          onClick={(e) => { e.stopPropagation(); setCalCfg({ weekendColor: c }); }}
                          className={cn('w-6 h-6 rounded-md border-2 transition-all cursor-pointer', calCfg.weekendColor === c ? 'ring-2 ring-primary ring-offset-1 border-primary' : 'border-border/40 hover:border-border')}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </FieldRow>
                </>
              )}
            </div>
          </SectionCard>

          {/* ── FILTRES ── */}
          <SectionCard
            icon={<Filter className="w-4 h-4" />}
            title="Filtres"
            badge={store.localFilters.length}
            open={filterOpen}
            onToggle={() => setFilterOpen(!filterOpen)}
          >
            {store.localFilters.map(f => (
              <div key={f.id} className="flex items-center gap-2 group py-1.5 border-b border-border/10 last:border-0">
                <span className="text-[10px] font-medium text-foreground truncate min-w-[50px]">{f.dimension}</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-muted text-muted-foreground">{f.op || '='}</span>
                <span className="text-[10px] text-primary truncate flex-1 min-w-0">{f.values?.join(', ') || '—'}</span>
                <button onClick={() => store.removeFilter(f.id)}
                  className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {store.localFilters.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic text-center py-3">Aucun filtre actif</p>
            )}
            <button
              onClick={() => store.addFilter({ id: crypto.randomUUID(), dimension: 'DR', op: 'IN', values: [] })}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors mt-1"
            >
              <Plus className="w-3 h-3" /> Ajouter un filtre
            </button>
          </SectionCard>

        </div>
      </ScrollArea>

      {/* ─── Sticky Footer ─── */}
      <div className="px-5 py-4 border-t border-border/20 bg-sidebar-background">
        <button onClick={handleSave}
          disabled={!dirty}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold transition-all',
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20'
              : 'bg-muted/40 text-muted-foreground cursor-not-allowed'
          )}
        >
          <Save className="w-3.5 h-3.5" /> {dirty ? 'Enregistrer' : 'À jour'}
        </button>
      </div>
    </div>
  );
};

/* ── Legacy exports for backward compat ── */
export interface SeriesTableProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}
export const SeriesTable: React.FC<SeriesTableProps> = () => null;

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
export const RightConfigPanel: React.FC<RightConfigPanelProps> = () => null;

export const BottomFilterCards: React.FC<{
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}> = () => null;

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
