import React from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  GitBranch, Check, BarChart3, SlidersHorizontal, AlertTriangle, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WidgetThreshold, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';

const GRAPH_TYPES: { value: GraphType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_area', label: 'Stacked', icon: Layers2 },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
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
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 min-h-[32px]">
    <span className="text-[11px] text-muted-foreground font-medium">{children ? label : ''}</span>
    <div className="flex items-center">{children}</div>
  </div>
);

const MiniInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={`px-2.5 py-1 rounded-lg border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${className || 'w-[72px]'}`}
  />
);

const MiniSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`px-2 py-1 rounded-lg border border-border/60 bg-background text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer ${className || 'w-[80px]'}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const CardSection: React.FC<{
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, children, headerRight, className }) => (
  <div className={`rounded-2xl border border-border/50 bg-card shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col ${className || ''}`}>
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {headerRight}
    </div>
    <div className="px-4 py-3 flex-1">{children}</div>
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
    <div className="animate-in fade-in slide-in-from-top-2 duration-200 ease-out">
      <div className="px-4 pt-4 pb-3">
        {/* ═══ 4-column grid: KPI CONFIG | AXES | GRAPH | SEUILS Y ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

          {/* ── 1. KPI CONFIG ── */}
          <CardSection
            icon={BarChart3}
            title="KPI Config"
            headerRight={
              <button
                onClick={onOpenKpiSelector}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            }
          >
            {store.selectedKpis.length === 0 ? (
              <button
                onClick={onOpenKpiSelector}
                className="w-full py-6 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-primary text-[11px] font-medium"
              >
                <BarChart3 className="w-4 h-4" /> Sélectionner des KPIs
              </button>
            ) : (
              <div className="space-y-1">
                {store.selectedKpis.map(kpi => {
                  const cat = catalogMap[kpi.kpi_key];
                  const displayColor = kpi.color || cat?.color || '#3b82f6';
                  const displayName = cat?.display_name || kpi.kpi_key;
                  const graphType = kpi.graphType || 'line';
                  return (
                    <div key={kpi.kpi_key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group">
                      {/* Color dot */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border/40 hover:scale-110 transition-all cursor-pointer"
                            style={{ backgroundColor: displayColor }}
                          />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="grid grid-cols-5 gap-1.5">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                                className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${displayColor === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Name */}
                      <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>

                      {/* Axis L/R */}
                      <div className="flex items-center rounded-md border border-border/50 overflow-hidden shrink-0">
                        <button
                          onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                          className={`px-1.5 py-0.5 text-[9px] font-bold transition-all ${kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >L</button>
                        <button
                          onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                          className={`px-1.5 py-0.5 text-[9px] font-bold transition-all ${kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >R</button>
                      </div>

                      {/* Graph type */}
                      <Select value={graphType} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                        <SelectTrigger className="h-6 w-[62px] text-[9px] px-1.5 border-border/50 bg-background rounded-md shrink-0">
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
                      <button
                        onClick={() => store.removeKpi(kpi.kpi_key)}
                        className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardSection>

          {/* ── 2. AXES ── */}
          <CardSection icon={SlidersHorizontal} title="Axes">
            <div className="space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Axe Y</span>
              <FieldRow label="Titre">
                <MiniInput
                  value={axis.yTitle}
                  placeholder=""
                  onChange={e => setAxis({ yTitle: e.target.value })}
                  className="w-[80px]"
                />
              </FieldRow>
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
              <FieldRow label="Unité">
                <MiniSelect
                  value={axis.yUnit}
                  options={[
                    { value: '', label: 'Auto' }, { value: '%', label: '%' },
                    { value: 'Mbps', label: 'Mbps' }, { value: 'ms', label: 'ms' },
                    { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
                  ]}
                  onChange={v => setAxis({ yUnit: v })}
                  className="w-[72px]"
                />
              </FieldRow>
              <FieldRow label="Décimales">
                <MiniSelect
                  value={String(axis.yDecimals)}
                  options={[
                    { value: '0', label: '0' }, { value: '1', label: '1' },
                    { value: '2', label: '2' }, { value: '3', label: '3' },
                  ]}
                  onChange={v => setAxis({ yDecimals: Number(v) })}
                  className="w-[56px]"
                />
              </FieldRow>
              <FieldRow label="Inverser">
                <Switch
                  checked={axis.yInvert}
                  onCheckedChange={v => setAxis({ yInvert: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Axe X</span>
              <FieldRow label="Format">
                <MiniSelect
                  value={axis.xFormat}
                  options={[
                    { value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' },
                    { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
                  ]}
                  onChange={v => setAxis({ xFormat: v as any })}
                  className="w-[72px]"
                />
              </FieldRow>
              <FieldRow label="Grille V">
                <Switch
                  checked={axis.xShowGrid}
                  onCheckedChange={v => setAxis({ xShowGrid: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>
          </CardSection>

          {/* ── 3. GRAPH ── */}
          <CardSection icon={Settings2} title="Graph">
            <div className="space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Ligne</span>
              <FieldRow label="Lissage">
                <Switch
                  checked={graph.smooth}
                  onCheckedChange={v => setGraph({ smooth: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
              <FieldRow label="Épaisseur">
                <MiniSelect
                  value={String(graph.lineWidth)}
                  options={[
                    { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
                    { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' },
                    { value: '3', label: '3px' },
                  ]}
                  onChange={v => setGraph({ lineWidth: Number(v) })}
                  className="w-[64px]"
                />
              </FieldRow>
              <FieldRow label="Symboles">
                <Switch
                  checked={graph.showSymbols}
                  onCheckedChange={v => setGraph({ showSymbols: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Grille</span>
              <FieldRow label="Intensité">
                <MiniSelect
                  value={graph.gridIntensity}
                  options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }]}
                  onChange={v => setGraph({ gridIntensity: v as any })}
                  className="w-[72px]"
                />
              </FieldRow>
              <FieldRow label="Grille V">
                <Switch
                  checked={graph.showVerticalGrid || false}
                  onCheckedChange={v => setGraph({ showVerticalGrid: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Fond</span>
              <FieldRow label="Couleur">
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
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 space-y-0.5">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Légende</span>
              <FieldRow label="Afficher">
                <Switch
                  checked={graph.showLegend}
                  onCheckedChange={v => setGraph({ showLegend: v })}
                  className="h-5 w-9 data-[state=checked]:bg-primary"
                />
              </FieldRow>
            </div>
          </CardSection>

          {/* ── 4. SEUILS Y ── */}
          <CardSection
            icon={AlertTriangle}
            title="Seuils Y"
            headerRight={
              <Switch
                checked={thresholdsEnabled}
                onCheckedChange={onThresholdsEnabledChange}
                className="h-5 w-9 data-[state=checked]:bg-primary"
              />
            }
          >
            {thresholdsEnabled ? (
              <div className="space-y-1.5">
                {thresholds.map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/40 group">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-3 h-3 rounded-full shrink-0 cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: t.color }} />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="start">
                        <div className="flex gap-1.5">
                          {THRESHOLD_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, color: c } : th))}
                              className={`w-5 h-5 rounded-full ${t.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <MiniInput
                      type="number"
                      value={t.value}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))}
                      className="w-[48px]"
                    />
                    <MiniInput
                      type="text"
                      value={t.label}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                      className="flex-1 min-w-0"
                    />
                    <MiniSelect
                      value={t.style}
                      options={[{ value: 'dashed', label: '- -' }, { value: 'solid', label: '—' }]}
                      onChange={v => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: v as any } : th))}
                      className="w-[46px]"
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
                  className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-border/40 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                >
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/50 text-center py-4">Activer les seuils pour configurer</p>
            )}
          </CardSection>
        </div>

        {/* ── Appliquer button ── */}
        <div className="flex justify-end mt-3">
          <button
            onClick={() => { toast.success('Configuration appliquée'); onCollapse(); }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Check className="w-4 h-4" /> Appliquer
          </button>
        </div>
      </div>
    </div>
  );
};

export default InlineGraphConfig;
