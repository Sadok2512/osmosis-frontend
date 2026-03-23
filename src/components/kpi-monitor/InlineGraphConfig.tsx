import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot, Hash,
  ChevronDown, ChevronRight, Trash2, Filter, GitBranch,
  BarChart3, Axis3D, Settings2, AlertTriangle, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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

/* ── Micro UI helpers ── */
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 min-h-[32px]">
    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={cn(
      'h-7 px-2 rounded-md border border-border/50 bg-background text-[11px] text-foreground',
      'outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all',
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
      'h-7 px-1.5 rounded-md border border-border/50 bg-background text-[11px] text-foreground',
      'outline-none focus:border-primary/40 cursor-pointer transition-all appearance-none',
      className || 'w-[72px]'
    )}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const SmallToggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between min-h-[30px]">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7 data-[state=checked]:bg-primary" />
  </div>
);

/* ════════════════════════════════════════════════════════════════
   SIDEBAR CONFIG PANEL — Redesigned to match Table config style
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

  const [kpiOpen, setKpiOpen] = useState(true);
  const [axeOpen, setAxeOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [seuilOpen, setSeuilOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
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

  return (
    <div className="w-[360px] shrink-0 h-full border-l border-border/40 bg-background flex flex-col overflow-hidden">

      {/* ─── Header ─── */}
      <div className="px-5 py-4 border-b border-border/40 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[15px] font-bold text-foreground block truncate">
                {title || 'Configuration'}
              </span>
              <span className="text-[11px] text-muted-foreground">Chart</span>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/60 text-muted-foreground" title="Fermer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">

        {/* ── KPIs SÉLECTIONNÉS ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <button onClick={() => setKpiOpen(!kpiOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
            {kpiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <BarChart3 className="w-3.5 h-3.5" /> KPIs sélectionnés
            <span className="ml-auto text-[9px] font-medium text-muted-foreground">{store.selectedKpis.length}</span>
          </button>
          {kpiOpen && (<>
            <button
              onClick={onOpenKpiSelector}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-semibold text-primary">Sélectionner des KPIs</div>
                  <div className="text-[9px] text-muted-foreground">{store.selectedKpis.length} KPI(s) actif(s)</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {store.selectedKpis.length > 0 && (
              <div className="space-y-1">
                {store.selectedKpis.map(kpi => {
                  const kpiId = kpi.id || kpi.kpi_key;
                  const cat = catalogMap[kpi.kpi_key];
                  const displayColor = kpi.color || cat?.color || '#3b82f6';
                  const displayName = kpi.label || cat?.display_name || kpi.kpi_key;
                  const isExpanded = expandedKpi === kpiId;
                  const updateThis = (u: Record<string, any>) => { store.updateKpi(kpiId, u); markDirty(); };
                  return (
                    <div key={kpiId} className="rounded-lg bg-background/80 border border-border/30 hover:border-border/60 transition-colors">
                      {/* Compact row */}
                      <div className="flex items-center gap-2 px-2.5 py-2 group">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border/30 hover:ring-primary/50 transition-all cursor-pointer" style={{ backgroundColor: displayColor }} />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="start">
                            <div className="grid grid-cols-5 gap-1.5">
                              {PRESET_COLORS.map(c => (
                                <button key={c} onClick={() => updateThis({ color: c })}
                                  className={cn('w-5 h-5 rounded-full transition-transform hover:scale-125', displayColor === c && 'ring-2 ring-primary ring-offset-1')}
                                  style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button onClick={() => setExpandedKpi(isExpanded ? null : kpiId)} className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0 text-left hover:text-primary transition-colors">
                          {displayName}
                        </button>
                        {/* Split per-KPI */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <GitBranch className="w-2.5 h-2.5 text-muted-foreground/50" />
                          <SmallSelect
                            value={kpi.splitOverride || ''}
                            options={[
                              { value: '', label: 'Aucun' },
                              ...SPLIT_OPTIONS.map(s => ({ value: s.value, label: s.label })),
                            ]}
                            onChange={v => updateThis({ splitOverride: v || null })}
                            className="w-[80px]"
                          />
                        </div>
                        {/* Axis toggle L/R */}
                        <button
                          onClick={() => updateThis({ axis: kpi.axis === 'left' ? 'right' : 'left', yAxisIndex: kpi.axis === 'left' ? 1 : 0 })}
                          className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors',
                            kpi.axis === 'left' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                          )}
                        >{kpi.axis === 'left' ? 'L' : 'R'}</button>
                        {/* Graph type */}
                        <Select value={kpi.graphType || 'line'} onValueChange={v => updateThis({ graphType: v as GraphType })}>
                          <SelectTrigger className="h-6 w-[58px] text-[10px] px-1.5 border-border/40 bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {GRAPH_TYPES.map(g => (
                              <SelectItem key={g.value} value={g.value} className="text-[10px]">
                                <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button onClick={() => { store.removeKpi(kpiId); markDirty(); }}
                          className="p-0.5 rounded text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>
                      {/* Expanded per-series config */}
                      {isExpanded && (
                        <div className="px-3 pb-2.5 pt-1 border-t border-border/20 space-y-2">
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
          </>)}
        </div>

        {/* ── COMPTEURS SÉLECTIONNÉS ── */}
        {onOpenCounterSelector && (
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" /> Compteurs
              <span className="ml-auto text-[9px] font-medium text-muted-foreground">{selectedCounterCount || 0}</span>
            </div>
            <button
              onClick={onOpenCounterSelector}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-semibold text-emerald-600">Sélectionner des Compteurs</div>
                  <div className="text-[9px] text-muted-foreground">{selectedCounterCount || 0} compteur(s) actif(s)</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-500/60 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* ── AXES (Dual) ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <button onClick={() => setAxeOpen(!axeOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
            {axeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Axis3D className="w-3.5 h-3.5" /> Axes
          </button>
          {axeOpen && (<>
            {/* Left Y-Axis */}
            <p className="text-[9px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" /> Axe Y Gauche (L)
            </p>
            <FieldRow label="Titre">
              <SmallInput value={axis.leftAxis?.title || axis.yTitle} onChange={e => setAxisD({ yTitle: e.target.value, leftAxis: { ...(axis.leftAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), title: e.target.value } })} placeholder="Auto" className="w-[100px]" />
            </FieldRow>
            <FieldRow label="Min">
              <SmallInput type="number" value={(axis.leftAxis?.min ?? axis.yMin) === 'auto' ? '' : String(axis.leftAxis?.min ?? axis.yMin)} placeholder="Auto"
                onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ yMin: v, leftAxis: { ...(axis.leftAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), min: v } }); }} className="w-[80px]" />
            </FieldRow>
            <FieldRow label="Max">
              <SmallInput type="number" value={(axis.leftAxis?.max ?? axis.yMax) === 'auto' ? '' : String(axis.leftAxis?.max ?? axis.yMax)} placeholder="Auto"
                onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ yMax: v, leftAxis: { ...(axis.leftAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), max: v } }); }} className="w-[80px]" />
            </FieldRow>
            <FieldRow label="Unité">
              <SmallSelect value={axis.leftAxis?.unit || axis.yUnit} options={[
                { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
              ]} onChange={v => setAxisD({ yUnit: v, leftAxis: { ...(axis.leftAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), unit: v } })} className="w-[80px]" />
            </FieldRow>

            {/* Right Y-Axis */}
            {store.selectedKpis.some(k => k.axis === 'right') && (<>
              <div className="h-px bg-border/40 my-1" />
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400" /> Axe Y Droite (R)
              </p>
              <FieldRow label="Titre">
                <SmallInput value={axis.rightAxis?.title || ''} onChange={e => setAxisD({ rightAxis: { ...(axis.rightAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), title: e.target.value } })} placeholder="Auto" className="w-[100px]" />
              </FieldRow>
              <FieldRow label="Min">
                <SmallInput type="number" value={axis.rightAxis?.min === 'auto' || !axis.rightAxis ? '' : String(axis.rightAxis.min)} placeholder="Auto"
                  onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ rightAxis: { ...(axis.rightAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), min: v } }); }} className="w-[80px]" />
              </FieldRow>
              <FieldRow label="Max">
                <SmallInput type="number" value={axis.rightAxis?.max === 'auto' || !axis.rightAxis ? '' : String(axis.rightAxis.max)} placeholder="Auto"
                  onChange={e => { const v = e.target.value === '' ? 'auto' as const : Number(e.target.value); setAxisD({ rightAxis: { ...(axis.rightAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), max: v } }); }} className="w-[80px]" />
              </FieldRow>
              <FieldRow label="Unité">
                <SmallSelect value={axis.rightAxis?.unit || ''} options={[
                  { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                  { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
                ]} onChange={v => setAxisD({ rightAxis: { ...(axis.rightAxis || { title:'',min:'auto',max:'auto',unit:'',decimals:2,invert:false }), unit: v } })} className="w-[80px]" />
              </FieldRow>
            </>)}

            {/* Axe X removed — date controlled from top bar */}

            {/* ── SEUILS Y (inside Axes) ── */}
            <div className="h-px bg-border/40 my-1" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button onClick={() => setSeuilOpen(!seuilOpen)} className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
                  {seuilOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <AlertTriangle className="w-3 h-3" /> Seuils Y
                  {thresholdsEnabled && thresholds.length > 0 && (
                    <span className="ml-1 text-[9px] font-medium text-muted-foreground">{thresholds.length}</span>
                  )}
                </button>
                <button onClick={addThreshold}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
              {seuilOpen && (
                <div className="space-y-2">
                  <SmallToggle label="Activer" checked={thresholdsEnabled} onChange={v => { onThresholdsEnabledChange(v); markDirty(); }} />
                  {thresholdsEnabled && thresholds.map(t => (
                    <div key={t.id} className="flex items-center gap-1.5 group">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border/30" style={{ backgroundColor: t.color }} />
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
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {thresholdsEnabled && thresholds.length === 0 && (
                    <div className="text-[10px] text-muted-foreground italic py-2 text-center">Aucun seuil configuré</div>
                  )}
                </div>
              )}
            </div>
          </>)}
        </div>

        {/* ── FILTERS ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <button onClick={() => setMilestoneOpen(!milestoneOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
            {milestoneOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Filter className="w-3.5 h-3.5" />
            Filtres
            <span className="ml-auto text-[9px] font-medium text-muted-foreground">{store.localFilters.length}</span>
          </button>
          {milestoneOpen && (
            <div className="space-y-2">
              {store.localFilters.map(f => (
                <div key={f.id} className="flex items-center gap-1.5 group">
                  <span className="text-[9px] font-medium text-foreground truncate min-w-[50px]">{f.dimension}</span>
                  <span className="text-[8px] text-muted-foreground">{f.op || '='}</span>
                  <span className="text-[9px] text-primary truncate flex-1 min-w-0">{f.values?.join(', ') || '—'}</span>
                  <button onClick={() => store.removeFilter(f.id)}
                    className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {store.localFilters.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic py-2 text-center">Aucun filtre actif</div>
              )}
              <button
                onClick={() => store.addFilter({ id: crypto.randomUUID(), dimension: 'DR', op: 'IN', values: [] })}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                <Plus className="w-3 h-3" /> Ajouter un filtre
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ─── Footer ─── */}
      <div className="px-5 py-4 border-t border-border/40 bg-card/50">
        <button onClick={handleSave}
          disabled={!dirty}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all',
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md'
              : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
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
