import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  ChevronDown, Trash2, GripVertical, Copy,
  MoreHorizontal, Eye, EyeOff, AlertTriangle,
  BarChart3, Axis3D, Settings2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { WidgetThreshold, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

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

/* ── Collapsible Section wrapper ── */
const SidebarSection: React.FC<{
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-2.5 hover:bg-muted/40 transition-colors group">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
        </div>
        <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-5 pb-4 space-y-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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

  const addThreshold = () => {
    onThresholdsEnabledChange(true);
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="py-2 divide-y divide-border/30">

      {/* ─── 1: KPI CONFIG ─── */}
      <SidebarSection icon={BarChart3} title="KPI Config">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground">Séries actives</span>
          <button onClick={onOpenKpiSelector}
            className="flex items-center gap-0.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
          ><Plus className="w-3 h-3" /> Ajouter</button>
        </div>
        {store.selectedKpis.length === 0 ? (
          <button onClick={onOpenKpiSelector}
            className="w-full py-4 rounded-lg border border-dashed border-border/40 hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[10px] font-medium"
          ><BarChart3 className="w-3.5 h-3.5" /> Sélectionner des KPIs</button>
        ) : (
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {store.selectedKpis.map(kpi => {
              const cat = catalogMap[kpi.kpi_key];
              const displayColor = kpi.color || cat?.color || '#3b82f6';
              const displayName = cat?.display_name || kpi.kpi_key;
              return (
                <div key={kpi.kpi_key} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border/30 hover:ring-primary transition-all cursor-pointer" style={{ backgroundColor: displayColor }} />
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
                  <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>
                  {/* L / R axis toggle */}
                  <div className="flex items-center rounded border border-border/40 bg-background overflow-hidden shrink-0">
                    <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                      className={cn('px-1 py-0.5 text-[8px] font-bold transition-colors', kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>L</button>
                    <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                      className={cn('px-1 py-0.5 text-[8px] font-bold transition-colors', kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>R</button>
                  </div>
                  {/* Split */}
                  <Select value={kpi.splitOverride === null ? 'none' : kpi.splitOverride || 'none'} onValueChange={v => store.updateKpi(kpi.kpi_key, { splitOverride: v === 'none' ? null : v as SplitDimension })}>
                    <SelectTrigger className="h-5 w-[64px] text-[8px] px-1 border-border bg-background"><SelectValue placeholder="Split" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-[10px]">Aucun</SelectItem>
                      {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-[10px]">{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Graph type */}
                  <Select value={kpi.graphType || 'line'} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                    <SelectTrigger className="h-5 w-[60px] text-[8px] px-1 border-border bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRAPH_TYPES.map(g => (
                        <SelectItem key={g.value} value={g.value} className="text-[10px]">
                          <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                        </SelectItem>
                      ))}
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
      </SidebarSection>

      {/* ─── 2: AXES ─── */}
      <SidebarSection icon={Axis3D} title="Axes">
        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Axe Y</p>
        <FieldRow label="Titre">
          <SmallInput value={axis.yTitle} onChange={e => setAxis({ yTitle: e.target.value })} placeholder="" className="w-[90px]" />
        </FieldRow>
        <FieldRow label="Min">
          <SmallInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto"
            onChange={e => setAxis({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[70px]" />
        </FieldRow>
        <FieldRow label="Max">
          <SmallInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto"
            onChange={e => setAxis({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[70px]" />
        </FieldRow>
        <FieldRow label="Unité">
          <SmallSelect value={axis.yUnit} options={[
            { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
            { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
          ]} onChange={v => setAxis({ yUnit: v })} />
        </FieldRow>
        <FieldRow label="Décimales">
          <SmallSelect value={String(axis.yDecimals)} options={[
            { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
          ]} onChange={v => setAxis({ yDecimals: Number(v) })} />
        </FieldRow>
        <SmallToggle label="Inverser" checked={axis.yInvert} onChange={v => setAxis({ yInvert: v })} />
        <div className="pt-2 border-t border-border/30">
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">Axe X</p>
          <FieldRow label="Format">
            <SmallSelect value={axis.xFormat} options={[
              { value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' },
              { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
            ]} onChange={v => setAxis({ xFormat: v as any })} />
          </FieldRow>
          <SmallToggle label="Grille V" checked={axis.xShowGrid} onChange={v => setAxis({ xShowGrid: v })} />
        </div>
      </SidebarSection>

      {/* ─── 3: GRAPH ─── */}
      <SidebarSection icon={Settings2} title="Graph Style">
        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Ligne</p>
        <SmallToggle label="Lissage" checked={graph.smooth} onChange={v => setGraph({ smooth: v })} />
        <FieldRow label="Épaisseur">
          <SmallSelect value={String(graph.lineWidth)} options={[
            { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
            { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
          ]} onChange={v => setGraph({ lineWidth: Number(v) })} />
        </FieldRow>
        <SmallToggle label="Symboles" checked={graph.showSymbols} onChange={v => setGraph({ showSymbols: v })} />
        <div className="pt-2 border-t border-border/30">
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">Grille</p>
          <FieldRow label="Intensité">
            <SmallSelect value={graph.gridIntensity} options={[
              { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
            ]} onChange={v => setGraph({ gridIntensity: v as any })} />
          </FieldRow>
          <SmallToggle label="Grille V" checked={graph.showVerticalGrid} onChange={v => setGraph({ showVerticalGrid: v })} />
        </div>
        <div className="pt-2 border-t border-border/30">
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">Fond</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Couleur</span>
            <div className="flex gap-1.5">
              {['transparent', '#f8fafc', '#0f172a'].map(c => (
                <button
                  key={c}
                  onClick={() => setGraph({ backgroundColor: c, transparentBg: c === 'transparent' })}
                  className={cn(
                    'w-6 h-6 rounded-md border transition-all',
                    (graph.backgroundColor === c || (c === 'transparent' && graph.transparentBg))
                      ? 'border-primary ring-1 ring-primary/30' : 'border-border/40'
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
          <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">Légende</p>
          <SmallToggle label="Afficher" checked={graph.showLegend} onChange={v => setGraph({ showLegend: v })} />
          {graph.showLegend && (
            <FieldRow label="Position">
              <SmallSelect value={graph.legendPosition} options={[
                { value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' },
              ]} onChange={v => setGraph({ legendPosition: v as any })} />
            </FieldRow>
          )}
        </div>
      </SidebarSection>

      {/* ─── 4: SEUILS Y ─── */}
      <SidebarSection icon={AlertTriangle} title="Seuils Y" defaultOpen={false}>
        <SmallToggle label="Activer" checked={thresholdsEnabled} onChange={onThresholdsEnabledChange} />
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
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold transition-colors">
              <Plus className="w-3 h-3" /> Ajouter seuil
            </button>
          </>
        )}
      </SidebarSection>
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
