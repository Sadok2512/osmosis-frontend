import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  ChevronDown, Trash2, GripVertical, Copy,
  MoreHorizontal, Eye, EyeOff, AlertTriangle,
  BarChart3, Axis3D, Settings2,
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
  xFormat: 'short', xShowGrid: false,
};

const DEFAULT_GRAPH: WidgetGraphConfig = {
  smooth: true, lineWidth: 2.5, showSymbols: false,
  gridIntensity: 'light', showVerticalGrid: false,
  backgroundColor: 'transparent', transparentBg: true,
  showLegend: false, legendPosition: 'bottom',
};

/* ── Micro helpers ── */
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 min-h-[30px]">
    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={cn(
      'h-7 px-2 rounded-md border border-border/50 bg-background text-[10px] text-foreground',
      'outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all',
      className || 'w-[70px]'
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
      'h-7 px-1.5 rounded-md border border-border/50 bg-background text-[10px] text-foreground',
      'outline-none focus:border-primary/40 cursor-pointer transition-all',
      className || 'w-[70px]'
    )}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const SmallToggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between min-h-[28px]">
    <span className="text-[10px] text-muted-foreground">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7 data-[state=checked]:bg-primary" />
  </div>
);

/* ════════════════════════════════════════════════════════════════
   HORIZONTAL CONFIG PANEL — 4 cards matching GraphSettingsPanel style
   (KPI CONFIG | AXES | GRAPH | SEUILS Y)
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
}

export const HorizontalConfigPanel: React.FC<ConfigPanelProps> = ({
  catalogMap, onOpenKpiSelector,
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
}) => {
  const store = useKpiMonitorStore();
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const [sections, setSections] = useState({ kpis: true, axeX: true, axeY: true, graph: false, seuils: false });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  const addThreshold = () => {
    onThresholdsEnabledChange(true);
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  /* ── Collapsible Section Card (BI Studio style) ── */
  const SectionCard: React.FC<{
    title: string; icon: React.ReactNode; sectionKey: keyof typeof sections;
    badge?: string; children: React.ReactNode;
  }> = ({ title, icon, sectionKey, badge, children }) => (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden transition-all duration-200 hover:border-border">
      <button
        onClick={() => toggle(sectionKey)}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left group transition-colors hover:bg-muted/30"
      >
        <span className="text-primary/80 group-hover:text-primary transition-colors">{icon}</span>
        <span className="text-[13px] font-semibold text-foreground flex-1 tracking-tight">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums">
            {badge}
          </span>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-200', !sections[sectionKey] && '-rotate-90')} />
      </button>
      <div className={cn('transition-all duration-200 ease-out', sections[sectionKey] ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden')}>
        <div className="px-4 pb-4 pt-1 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-3 space-y-2.5">

      {/* ─── 1: KPI CONFIG ─── */}
      <SectionCard title="KPI Config" icon={<BarChart3 className="w-4 h-4" />} sectionKey="kpis"
        badge={store.selectedKpis.length > 0 ? String(store.selectedKpis.length) : undefined}>
        <div className="flex items-center justify-end">
          <button onClick={onOpenKpiSelector}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-semibold"
          ><Plus className="w-3 h-3" /> Ajouter</button>
        </div>
        {store.selectedKpis.length === 0 ? (
          <button onClick={onOpenKpiSelector}
            className="w-full py-5 rounded-lg border border-dashed border-border/40 hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[11px] font-medium"
          ><BarChart3 className="w-3.5 h-3.5" /> Sélectionner des KPIs</button>
        ) : (
          <div className="space-y-1.5">
            {store.selectedKpis.map(kpi => {
              const cat = catalogMap[kpi.kpi_key];
              const displayColor = kpi.color || cat?.color || '#3b82f6';
              const displayName = cat?.display_name || kpi.kpi_key;
              return (
                <div key={kpi.kpi_key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border/30 hover:ring-primary transition-all cursor-pointer" style={{ backgroundColor: displayColor }} />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-5 gap-1.5">
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                            className={cn('w-5 h-5 rounded-full transition-transform hover:scale-125', displayColor === c && 'ring-2 ring-primary ring-offset-1')}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>
                  <Select value={kpi.graphType || 'line'} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                    <SelectTrigger className="h-6 w-[60px] text-[10px] px-1.5 border-border bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRAPH_TYPES.map(g => (
                        <SelectItem key={g.value} value={g.value} className="text-[10px]">
                          <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={kpi.agg || 'avg'} onValueChange={v => store.updateKpi(kpi.kpi_key, { agg: v as any })}>
                    <SelectTrigger className="h-6 w-[55px] text-[10px] px-1.5 border-border bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['avg', 'sum', 'max', 'min', 'p50', 'p95'].map(a => <SelectItem key={a} value={a} className="text-[10px]">{a.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => store.removeKpi(kpi.kpi_key)}
                    className="p-0.5 rounded text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  ><X className="w-3 h-3" /></button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ─── 2: AXE X ─── */}
      <SectionCard title="Axe X" icon={<Axis3D className="w-4 h-4" />} sectionKey="axeX">
        <FieldRow label="Format">
          <SmallSelect value={axis.xFormat} options={[
            { value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' },
            { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
          ]} onChange={v => setAxis({ xFormat: v as any })} className="w-[80px]" />
        </FieldRow>
        <SmallToggle label="Grille V" checked={axis.xShowGrid} onChange={v => setAxis({ xShowGrid: v })} />
      </SectionCard>

      {/* ─── 3: AXE Y ─── */}
      <SectionCard title="Axe Y" icon={<Axis3D className="w-4 h-4" />} sectionKey="axeY">
        <FieldRow label="Titre">
          <SmallInput value={axis.yTitle} onChange={e => setAxis({ yTitle: e.target.value })} placeholder="" className="w-[100px]" />
        </FieldRow>
        <FieldRow label="Min">
          <SmallInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto"
            onChange={e => setAxis({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[80px]" />
        </FieldRow>
        <FieldRow label="Max">
          <SmallInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto"
            onChange={e => setAxis({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[80px]" />
        </FieldRow>
        <FieldRow label="Unité">
          <SmallSelect value={axis.yUnit} options={[
            { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
            { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
          ]} onChange={v => setAxis({ yUnit: v })} className="w-[80px]" />
        </FieldRow>
        <FieldRow label="Décimales">
          <SmallSelect value={String(axis.yDecimals)} options={[
            { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
          ]} onChange={v => setAxis({ yDecimals: Number(v) })} className="w-[80px]" />
        </FieldRow>
        <SmallToggle label="Inverser" checked={axis.yInvert} onChange={v => setAxis({ yInvert: v })} />
      </SectionCard>

      {/* ─── 3: GRAPH ─── */}
      <SectionCard title="Graph" icon={<Settings2 className="w-4 h-4" />} sectionKey="graph">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Ligne</p>
        <SmallToggle label="Lissage" checked={graph.smooth} onChange={v => setGraph({ smooth: v })} />
        <FieldRow label="Épaisseur">
          <SmallSelect value={String(graph.lineWidth)} options={[
            { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
            { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
          ]} onChange={v => setGraph({ lineWidth: Number(v) })} className="w-[80px]" />
        </FieldRow>
        <SmallToggle label="Symboles" checked={graph.showSymbols} onChange={v => setGraph({ showSymbols: v })} />

        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Grille</p>
          <FieldRow label="Intensité">
            <SmallSelect value={graph.gridIntensity} options={[
              { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
            ]} onChange={v => setGraph({ gridIntensity: v as any })} className="w-[80px]" />
          </FieldRow>
          <SmallToggle label="Grille V" checked={graph.showVerticalGrid} onChange={v => setGraph({ showVerticalGrid: v })} />
        </div>

        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Fond</p>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">Couleur</span>
            <div className="flex gap-2">
              {['transparent', '#f8fafc', '#0f172a'].map(c => (
                <button
                  key={c}
                  onClick={() => setGraph({ backgroundColor: c, transparentBg: c === 'transparent' })}
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
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Légende</p>
          <SmallToggle label="Afficher" checked={graph.showLegend} onChange={v => setGraph({ showLegend: v })} />
          {graph.showLegend && (
            <FieldRow label="Position">
              <SmallSelect value={graph.legendPosition} options={[
                { value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' },
              ]} onChange={v => setGraph({ legendPosition: v as any })} className="w-[80px]" />
            </FieldRow>
          )}
        </div>
      </SectionCard>

      {/* ─── 4: SEUILS Y ─── */}
      <SectionCard title="Seuils Y" icon={<AlertTriangle className="w-4 h-4" />} sectionKey="seuils"
        badge={thresholdsEnabled ? String(thresholds.length) : undefined}>
        <SmallToggle label="Activer" checked={thresholdsEnabled} onChange={onThresholdsEnabledChange} />
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
                        <button key={c}
                          onClick={() => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, color: c } : th))}
                          className={cn('w-5 h-5 rounded-full', t.color === c && 'ring-2 ring-primary ring-offset-1')}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <SmallInput type="number" value={t.value}
                  onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))}
                  className="w-14" />
                <SmallInput value={t.label}
                  onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                  className="flex-1 min-w-0" />
                <SmallSelect value={t.style}
                  onChange={v => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: v as any } : th))}
                  options={[{ value: 'dashed', label: '- - -' }, { value: 'solid', label: '───' }]}
                  className="w-14" />
                <button onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))}
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
      </SectionCard>
    </div>
  );
};

/* ── Keep old named exports for backward compat ── */
export interface SeriesTableProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}
export const SeriesTable: React.FC<SeriesTableProps> = () => null; // no longer used

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
export const RightConfigPanel: React.FC<RightConfigPanelProps> = () => null; // no longer used

export const BottomFilterCards: React.FC<{
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}> = () => null; // no longer used

/* ── Legacy exports ── */
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
