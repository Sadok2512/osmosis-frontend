import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot, Hash,
  ChevronDown, ChevronRight, Trash2,
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
  const [axeOpen, setAxeOpen] = useState(true);
  const [graphOpen, setGraphOpen] = useState(false);
  const [seuilOpen, setSeuilOpen] = useState(false);

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
                  const cat = catalogMap[kpi.kpi_key];
                  const displayColor = kpi.color || cat?.color || '#3b82f6';
                  const displayName = cat?.display_name || kpi.kpi_key;
                  return (
                    <div key={kpi.kpi_key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/80 border border-border/30 hover:border-border/60 transition-colors group">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border/30 hover:ring-primary/50 transition-all cursor-pointer" style={{ backgroundColor: displayColor }} />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="grid grid-cols-5 gap-1.5">
                            {PRESET_COLORS.map(c => (
                              <button key={c} onClick={() => { store.updateKpi(kpi.kpi_key, { color: c }); markDirty(); }}
                                className={cn('w-5 h-5 rounded-full transition-transform hover:scale-125', displayColor === c && 'ring-2 ring-primary ring-offset-1')}
                                style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>
                      <button
                        onClick={() => { store.updateKpi(kpi.kpi_key, { yAxisIndex: (kpi.yAxisIndex || 0) === 0 ? 1 : 0 }); markDirty(); }}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors',
                          (kpi.yAxisIndex || 0) === 0
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-secondary/10 text-secondary-foreground border-border/40'
                        )}
                      >
                        {(kpi.yAxisIndex || 0) === 0 ? 'L' : 'R'}
                      </button>
                      <Select value={kpi.graphType || 'line'} onValueChange={v => { store.updateKpi(kpi.kpi_key, { graphType: v as GraphType }); markDirty(); }}>
                        <SelectTrigger className="h-6 w-[58px] text-[10px] px-1.5 border-border/40 bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GRAPH_TYPES.map(g => (
                            <SelectItem key={g.value} value={g.value} className="text-[10px]">
                              <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => { store.removeKpi(kpi.kpi_key); markDirty(); }}
                        className="p-0.5 rounded text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      ><Trash2 className="w-3 h-3" /></button>
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

        {/* ── AXES ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <button onClick={() => setAxeOpen(!axeOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
            {axeOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Axis3D className="w-3.5 h-3.5" /> Axes
          </button>
          {axeOpen && (<>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Axe Y</p>
            <FieldRow label="Titre">
              <SmallInput value={axis.yTitle} onChange={e => setAxisD({ yTitle: e.target.value })} placeholder="Auto" className="w-[100px]" />
            </FieldRow>
            <FieldRow label="Min">
              <SmallInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto"
                onChange={e => setAxisD({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[80px]" />
            </FieldRow>
            <FieldRow label="Max">
              <SmallInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto"
                onChange={e => setAxisD({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[80px]" />
            </FieldRow>
            <FieldRow label="Unité">
              <SmallSelect value={axis.yUnit} options={[
                { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
                { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
              ]} onChange={v => setAxisD({ yUnit: v })} className="w-[80px]" />
            </FieldRow>
            <FieldRow label="Décimales">
              <SmallSelect value={String(axis.yDecimals)} options={[
                { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
              ]} onChange={v => setAxisD({ yDecimals: Number(v) })} className="w-[80px]" />
            </FieldRow>
            <SmallToggle label="Inverser" checked={axis.yInvert} onChange={v => setAxisD({ yInvert: v })} />

            {/* Axe X removed — date controlled from top bar */}
          </>)}
        </div>

        {/* ── GRAPH STYLE ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <button onClick={() => setGraphOpen(!graphOpen)} className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
            {graphOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Settings2 className="w-3.5 h-3.5" /> Affichage
          </button>
          {graphOpen && (<>
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Ligne</p>
            <SmallToggle label="Lissage" checked={graph.smooth} onChange={v => setGraphD({ smooth: v })} />
            <FieldRow label="Épaisseur">
              <SmallSelect value={String(graph.lineWidth)} options={[
                { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
                { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
              ]} onChange={v => setGraphD({ lineWidth: Number(v) })} className="w-[80px]" />
            </FieldRow>
            <SmallToggle label="Symboles" checked={graph.showSymbols} onChange={v => setGraphD({ showSymbols: v })} />

            <div className="pt-2 border-t border-border/30">
              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Grille</p>
              <FieldRow label="Intensité">
                <SmallSelect value={graph.gridIntensity} options={[
                  { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
                ]} onChange={v => setGraphD({ gridIntensity: v as any })} className="w-[80px]" />
              </FieldRow>
              <SmallToggle label="Grille V" checked={graph.showVerticalGrid} onChange={v => setGraphD({ showVerticalGrid: v })} />
            </div>

            <div className="pt-2 border-t border-border/30">
              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Fond</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">Couleur</span>
                <div className="flex gap-2">
                  {['transparent', '#f8fafc', '#0f172a'].map(c => (
                    <button key={c}
                      onClick={() => setGraphD({ backgroundColor: c, transparentBg: c === 'transparent' })}
                      className={cn(
                        'w-7 h-7 rounded-lg border-2 transition-all',
                        (graph.backgroundColor === c || (c === 'transparent' && graph.transparentBg))
                          ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]' : 'border-border/40'
                      )}
                      style={{ backgroundColor: c === 'transparent' ? undefined : c }}
                    >
                      {c === 'transparent' && <span className="text-[8px] text-muted-foreground">T</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border/30">
              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Légende</p>
              <SmallToggle label="Afficher" checked={graph.showLegend} onChange={v => setGraphD({ showLegend: v })} />
              {graph.showLegend && (
                <FieldRow label="Position">
                  <SmallSelect value={graph.legendPosition} options={[
                    { value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' },
                  ]} onChange={v => setGraphD({ legendPosition: v as any })} className="w-[80px]" />
                </FieldRow>
              )}
            </div>
          </>)}
        </div>

        {/* ── SEUILS Y ── */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setSeuilOpen(!seuilOpen)} className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 hover:text-foreground transition-colors">
              {seuilOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <AlertTriangle className="w-3.5 h-3.5" /> Seuils Y
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
                    options={[{ value: 'dashed', label: '- - -' }, { value: 'solid', label: '───' }]}
                    className="w-14" />
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
          {!seuilOpen && !thresholdsEnabled && (
            <div className="text-[10px] text-muted-foreground italic text-center">Seuils désactivés</div>
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
