import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  ChevronDown, Trash2,
  BarChart3, Axis3D, Settings2, AlertTriangle, Save,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { WidgetThreshold, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';
import { useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';
import { useDashboardManager } from '../bi/DashboardManager';

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
   SIDEBAR CONFIG PANEL — Professional BI-style collapsible sections
   (KPIs | Axes | Graph Style | Seuils Y)
   ════════════════════════════════════════════════════════════════ */
export type QuickSettingsSection = 'kpis' | 'style' | 'full' | null;

export interface ConfigPanelProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
  /** Title displayed in sidebar header */
  title?: string;
  /** Called when user clicks close (X) */
  onClose?: () => void;
  /** Called when user clicks "Enregistrer" */
  onSave?: () => void;
}

export const HorizontalConfigPanel: React.FC<ConfigPanelProps> = ({
  catalogMap, onOpenKpiSelector,
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
  title, onClose, onSave,
}) => {
  const store = useKpiMonitorStore();
  const dm = useDashboardManager();
  const dashSettings = useDashboardSettingsStore();
  const themeBg = dashSettings.getSettings(dm.activeTabId, dm.activeTab?.name).theme.backgroundColor;
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const [sections, setSections] = useState({ kpis: true, axes: true, graph: false, seuils: false });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  // Simple dirty tracking
  const [dirty, setDirty] = useState(false);
  const markDirty = () => { if (!dirty) setDirty(true); };

  // Wrap setters with dirty tracking
  const setAxisD = (u: Partial<WidgetAxisConfig>) => { setAxis(u); markDirty(); };
  const setGraphD = (u: Partial<WidgetGraphConfig>) => { setGraph(u); markDirty(); };

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

  /* ── Collapsible Section ── */
  const Section: React.FC<{
    title: string; icon: React.ReactNode; sectionKey: keyof typeof sections;
    badge?: string; children: React.ReactNode;
  }> = ({ title: sTitle, icon, sectionKey, badge, children }) => {
    const isOpen = sections[sectionKey];
    return (
      <div className="border-b border-border/30 last:border-b-0">
        <button
          onClick={() => toggle(sectionKey)}
          className="flex items-center gap-2.5 w-full px-4 py-3 text-left group transition-colors hover:bg-muted/30"
        >
          <span className="text-primary/70 group-hover:text-primary transition-colors">{icon}</span>
          <span className="text-[12px] font-semibold text-foreground flex-1 tracking-tight uppercase">{sTitle}</span>
          {badge && (
            <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums">
              {badge}
            </span>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-200', !isOpen && '-rotate-90')} />
        </button>
        <div className={cn('transition-all duration-200 ease-out', isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden')}>
          <div className="px-4 pb-4 pt-1 space-y-2">
            {children}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-[360px] shrink-0 h-full border-l border-border/40 bg-muted/10 flex flex-col overflow-hidden" style={{ backgroundColor: themeBg || undefined }}>

      {/* ─── Header ─── */}
      <div className="px-4 py-3.5 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-foreground tracking-tight">Configuration</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            {dirty ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-medium">
                <AlertCircle className="w-3 h-3" /> Non enregistré
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-medium">
                <CheckCircle2 className="w-3 h-3" /> À jour
              </span>
            )}
            {onClose && (
              <button onClick={onClose}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        {title && <p className="text-sm font-semibold text-foreground truncate pl-8">{title}</p>}
      </div>

      {/* ─── Scrollable sections ─── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">

        {/* ── 1: KPIs ── */}
        <Section title="KPIs" icon={<BarChart3 className="w-4 h-4" />} sectionKey="kpis"
          badge={store.selectedKpis.length > 0 ? String(store.selectedKpis.length) : undefined}>
          <div className="flex items-center justify-end">
            <button onClick={onOpenKpiSelector}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-semibold"
            ><Plus className="w-3 h-3" /> Ajouter KPI</button>
          </div>
          {store.selectedKpis.length === 0 ? (
            <button onClick={onOpenKpiSelector}
              className="w-full py-6 rounded-lg border border-dashed border-border/50 hover:border-primary/30 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-[11px] font-medium">Sélectionner des KPIs</span>
            </button>
          ) : (
            <div className="space-y-1">
              {store.selectedKpis.map(kpi => {
                const cat = catalogMap[kpi.kpi_key];
                const displayColor = kpi.color || cat?.color || '#3b82f6';
                const displayName = cat?.display_name || kpi.kpi_key;
                return (
                  <div key={kpi.kpi_key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/80 border border-border/30 hover:border-border/60 transition-colors group">
                    {/* Color dot */}
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

                    {/* KPI name */}
                    <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>

                    {/* L/R axis toggle */}
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

                    {/* Graph type */}
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

                    {/* Remove */}
                    <button onClick={() => { store.removeKpi(kpi.kpi_key); markDirty(); }}
                      className="p-0.5 rounded text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    ><Trash2 className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── 2: AXES ── */}
        <Section title="Axes" icon={<Axis3D className="w-4 h-4" />} sectionKey="axes">
          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Axe Y</p>
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

          <div className="pt-2.5 mt-1 border-t border-border/30">
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Axe X</p>
            <FieldRow label="Format">
              <SmallSelect value={axis.xFormat} options={[
                { value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' },
                { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
              ]} onChange={v => setAxisD({ xFormat: v as any })} className="w-[80px]" />
            </FieldRow>
            <SmallToggle label="Grille V" checked={axis.xShowGrid} onChange={v => setAxisD({ xShowGrid: v })} />
          </div>
        </Section>

        {/* ── 3: GRAPH STYLE ── */}
        <Section title="Graph Style" icon={<Settings2 className="w-4 h-4" />} sectionKey="graph">
          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Ligne</p>
          <SmallToggle label="Lissage" checked={graph.smooth} onChange={v => setGraphD({ smooth: v })} />
          <FieldRow label="Épaisseur">
            <SmallSelect value={String(graph.lineWidth)} options={[
              { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
              { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
            ]} onChange={v => setGraphD({ lineWidth: Number(v) })} className="w-[80px]" />
          </FieldRow>
          <SmallToggle label="Symboles" checked={graph.showSymbols} onChange={v => setGraphD({ showSymbols: v })} />

          <div className="pt-2 border-t border-border/30">
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Grille</p>
            <FieldRow label="Intensité">
              <SmallSelect value={graph.gridIntensity} options={[
                { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
              ]} onChange={v => setGraphD({ gridIntensity: v as any })} className="w-[80px]" />
            </FieldRow>
            <SmallToggle label="Grille V" checked={graph.showVerticalGrid} onChange={v => setGraphD({ showVerticalGrid: v })} />
          </div>

          <div className="pt-2 border-t border-border/30">
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Fond</p>
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
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Légende</p>
            <SmallToggle label="Afficher" checked={graph.showLegend} onChange={v => setGraphD({ showLegend: v })} />
            {graph.showLegend && (
              <FieldRow label="Position">
                <SmallSelect value={graph.legendPosition} options={[
                  { value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' },
                ]} onChange={v => setGraphD({ legendPosition: v as any })} className="w-[80px]" />
              </FieldRow>
            )}
          </div>
        </Section>

        {/* ── 4: SEUILS Y ── */}
        <Section title="Seuils Y" icon={<AlertTriangle className="w-4 h-4" />} sectionKey="seuils"
          badge={thresholdsEnabled ? String(thresholds.length) : undefined}>
          <SmallToggle label="Activer" checked={thresholdsEnabled} onChange={v => { onThresholdsEnabledChange(v); markDirty(); }} />
          {thresholdsEnabled && (
            <>
              {thresholds.map(t => (
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
              <button onClick={addThreshold}
                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold transition-colors">
                <Plus className="w-3 h-3" /> Ajouter seuil
              </button>
            </>
          )}
        </Section>
      </div>

      {/* ─── Sticky Footer ─── */}
      <div className="px-4 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm shrink-0">
        <button onClick={handleSave}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all shadow-sm',
            dirty
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-muted text-muted-foreground cursor-default'
          )}
          disabled={!dirty}
        >
          <Save className="w-3.5 h-3.5" /> Enregistrer
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
