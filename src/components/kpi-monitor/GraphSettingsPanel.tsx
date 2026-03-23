import React from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, MoreHorizontal, BarChart3, GitBranch,
  TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  Download, FileSpreadsheet, RefreshCw, Copy, Trash2,
  AlertTriangle, Palette, Check, Axis3D, Settings2,
  Eye, EyeOff, Grid3X3, Calendar, Layers,
} from 'lucide-react';
import { Slider } from '../ui/slider';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

export interface WidgetThreshold {
  id: string;
  value: number;
  label: string;
  color: string;
  style: 'dashed' | 'solid' | 'dotted';
  axis?: 'left' | 'right';           // default: 'left'
  visible?: boolean;                  // default: true
}

// Per-axis side config (used for dual axis)
export interface AxisSideConfig {
  title: string;
  min: 'auto' | number;
  max: 'auto' | number;
  unit: string;
  decimals: number;
  invert: boolean;
}

export interface WidgetAxisConfig {
  // Legacy flat fields (still used, mapped to left axis)
  yTitle: string;
  yMin: 'auto' | number;
  yMax: 'auto' | number;
  yUnit: string;
  yDecimals: number;
  yInvert: boolean;
  xMode: 'date' | 'dimension' | 'kpi';
  xFormat: 'short' | 'full' | 'date' | 'datetime';
  xShowGrid: boolean;
  // Dual axis (optional — if present, overrides flat fields)
  leftAxis?: AxisSideConfig;
  rightAxis?: AxisSideConfig;
}

export interface GridConfig {
  enabled: boolean;
  opacity: number; // 0-100
  type: 'horizontal' | 'vertical' | 'both';
}

export interface CalendarConfig {
  highlightWeekends: boolean;
  weekendColor: string;
  weekendOpacity: number; // 0-100
}

export interface LevelsConfig {
  primary: string | null;
  secondary: string | null;
}

export interface WidgetGraphConfig {
  smooth: boolean;
  lineWidth: number;
  showSymbols: boolean;
  gridIntensity: 'light' | 'medium';
  showVerticalGrid: boolean;
  backgroundColor: string;
  transparentBg: boolean;
  showLegend: boolean;
  legendPosition: 'top' | 'bottom';
  grid?: GridConfig;
  calendar?: CalendarConfig;
  levels?: LevelsConfig;
}

export interface WidgetStyleConfig {
  backgroundColor: string;
  gridIntensity: 'light' | 'medium';
  smoothLine: boolean;
}

interface GraphSettingsPanelProps {
  widgetId: string;
  widgetTitle: string;
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  onRefresh?: () => void;
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
  styleConfig: WidgetStyleConfig;
  onStyleChange: (s: WidgetStyleConfig) => void;
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

const DEFAULT_AXIS: WidgetAxisConfig = {
  yTitle: '', yMin: 'auto', yMax: 'auto', yUnit: '', yDecimals: 2, yInvert: false,
  xMode: 'date', xFormat: 'short', xShowGrid: false,
};

export const DEFAULT_GRID: GridConfig = { enabled: true, opacity: 20, type: 'both' };
export const DEFAULT_CALENDAR: CalendarConfig = { highlightWeekends: true, weekendColor: '#E5E7EB', weekendOpacity: 10 };

const DEFAULT_GRAPH: WidgetGraphConfig = {
  smooth: true, lineWidth: 2.5, showSymbols: false,
  gridIntensity: 'light', showVerticalGrid: false,
  backgroundColor: 'transparent', transparentBg: true,
  showLegend: false, legendPosition: 'bottom',
  grid: { ...DEFAULT_GRID },
  calendar: { ...DEFAULT_CALENDAR },
};

/* ── Small input helper ── */
const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, className, ...props }) => (
  <div className="flex items-center justify-between gap-2 h-6">
    <span className="text-[9px] text-muted-foreground whitespace-nowrap min-w-[42px]">{label}</span>
    <input {...props} className={`px-1.5 py-0 h-5 rounded border border-border/60 bg-card text-[9px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 ${className || 'w-[60px]'}`} />
  </div>
);

const SmallSelect: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div className="flex items-center justify-between gap-2 h-6">
    <span className="text-[9px] text-muted-foreground whitespace-nowrap min-w-[42px]">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-1 py-0 h-5 rounded border border-border/60 bg-card text-[8px] text-foreground outline-none w-[70px]"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const SmallToggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between h-6">
    <span className="text-[9px] text-muted-foreground">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} className="h-3.5 w-7 data-[state=checked]:bg-primary" />
  </div>
);

const GraphSettingsPanel: React.FC<GraphSettingsPanelProps> = ({
  widgetId, widgetTitle, catalogMap, onOpenKpiSelector, onClose,
  onDuplicate, onDelete, onExportPNG, onExportCSV, onRefresh,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
  styleConfig, onStyleChange,
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
}) => {
  const store = useKpiMonitorStore();
  const axis = externalAxis || DEFAULT_AXIS;
  const graph = externalGraph || DEFAULT_GRAPH;
  const setAxis = (updates: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...updates });
  const setGraph = (updates: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...updates });
  const gridCfg = graph.grid || DEFAULT_GRID;
  const calCfg = graph.calendar || DEFAULT_CALENDAR;
  const levelsCfg = graph.levels || { primary: null, secondary: null };
  const setGridCfg = (u: Partial<GridConfig>) => setGraph({ grid: { ...gridCfg, ...u } });
  const setCalCfg = (u: Partial<CalendarConfig>) => setGraph({ calendar: { ...calCfg, ...u } });
  const setLevels = (u: Partial<LevelsConfig>) => setGraph({ levels: { ...levelsCfg, ...u } });

  const addThreshold = () => {
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="border-b border-primary/20 bg-card/90 backdrop-blur-sm animate-in slide-in-from-top-2 duration-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-primary" />
          <span className="text-[11px] font-bold text-foreground">{widgetTitle || 'Graph Settings'}</span>
          <Badge variant="outline" className="text-[7px] h-3.5 px-1">Widget</Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onExportPNG} className="gap-2 text-xs"><Download className="w-3.5 h-3.5" /> Export PNG</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV} className="gap-2 text-xs"><FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRefresh} className="gap-2 text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs"><Copy className="w-3.5 h-3.5" /> Dupliquer</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content: compact horizontal sections ── */}
      <div className="px-3 py-1.5 flex gap-2 overflow-x-auto">

        {/* ─── 1: KPI Config ─── */}
        <div className="rounded-md border border-border/60 bg-background p-2 space-y-1 min-w-[240px] flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPI Config</span>
            </div>
            <button onClick={onOpenKpiSelector}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
            ><Plus className="w-3 h-3" /> Ajouter</button>
          </div>
          {store.selectedKpis.length === 0 ? (
            <button onClick={onOpenKpiSelector}
              className="w-full py-3 rounded-md border border-dashed border-border hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[10px]"
            ><BarChart3 className="w-3.5 h-3.5" /> Sélectionner des KPIs</button>
          ) : (
            <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
              {store.selectedKpis.map(kpi => {
                const cat = catalogMap[kpi.kpi_key];
                const displayColor = kpi.color || cat?.color || '#3b82f6';
                const displayName = cat?.display_name || kpi.kpi_key;
                const graphType = kpi.graphType || 'line';
                return (
                  <div key={kpi.kpi_key} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border hover:ring-primary transition-all cursor-pointer" style={{ backgroundColor: displayColor }} />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="start">
                        <div className="grid grid-cols-5 gap-1">
                          {PRESET_COLORS.map(c => (
                            <button key={c} onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                              className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${displayColor === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>
                    <div className="flex items-center rounded border border-border bg-background overflow-hidden shrink-0">
                      <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                        className={`px-1 py-0.5 text-[8px] font-bold transition-colors ${kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>L</button>
                      <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                        className={`px-1 py-0.5 text-[8px] font-bold transition-colors ${kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>R</button>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <GitBranch className="w-2.5 h-2.5 text-muted-foreground/60" />
                      <Select value={kpi.splitOverride === null ? 'none' : kpi.splitOverride || 'none'} onValueChange={v => store.updateKpi(kpi.kpi_key, { splitOverride: v === 'none' ? null : v as SplitDimension })}>
                        <SelectTrigger className="h-5 w-[70px] text-[8px] px-1 border-border bg-background"><SelectValue placeholder="Split" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[10px]">Aucun</SelectItem>
                          {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-[10px]">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Select value={graphType} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                      <SelectTrigger className="h-5 w-[64px] text-[8px] px-1 border-border bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRAPH_TYPES.map(g => (
                          <SelectItem key={g.value} value={g.value} className="text-[10px]">
                            <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button onClick={() => store.removeKpi(kpi.kpi_key)}
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    ><X className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── 2: Axis Configuration ─── */}
        <div className="rounded-md border border-border/60 bg-background p-2 space-y-0.5 min-w-[165px]">
          <div className="flex items-center gap-1.5">
            <Axis3D className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Axes</span>
          </div>
           <div className="space-y-0.5">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Axe Y</p>
            <SmallInput label="Titre" value={axis.yTitle} onChange={e => setAxis({ yTitle: (e.target as HTMLInputElement).value })} className="w-[80px]" />
            <SmallInput label="Min" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto"
              onChange={e => { const v = (e.target as HTMLInputElement).value; setAxis({ yMin: v === '' ? 'auto' : Number(v) }); }} className="w-[50px]" type="number" />
            <SmallInput label="Max" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto"
              onChange={e => { const v = (e.target as HTMLInputElement).value; setAxis({ yMax: v === '' ? 'auto' : Number(v) }); }} className="w-[50px]" type="number" />
            <SmallSelect label="Unité" value={axis.yUnit} options={[
              { value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' },
              { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' },
            ]} onChange={v => setAxis({ yUnit: v })} />
            <SmallSelect label="Décimales" value={String(axis.yDecimals)} options={[
              { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
            ]} onChange={v => setAxis({ yDecimals: Number(v) })} />
            <SmallToggle label="Inverser" checked={axis.yInvert} onChange={v => setAxis({ yInvert: v })} />
          </div>
          <div className="space-y-0.5 pt-0.5 border-t border-border/30">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Axe X</p>
            <SmallSelect label="Format" value={axis.xFormat} options={[
              { value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' },
              { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' },
            ]} onChange={v => setAxis({ xFormat: v as any })} />
            <SmallToggle label="Grille V" checked={axis.xShowGrid} onChange={v => setAxis({ xShowGrid: v })} />
          </div>
        </div>

        {/* ─── 3: Graph Configuration ─── */}
        <div className="rounded-md border border-border/60 bg-background p-2 space-y-0.5 min-w-[150px]">
          <div className="flex items-center gap-1.5">
            <Settings2 className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Graph</span>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Ligne</p>
            <SmallToggle label="Lissage" checked={graph.smooth} onChange={v => setGraph({ smooth: v })} />
            <SmallSelect label="Épaisseur" value={String(graph.lineWidth)} options={[
              { value: '1', label: '1px' }, { value: '1.5', label: '1.5px' },
              { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' },
            ]} onChange={v => setGraph({ lineWidth: Number(v) })} />
            <SmallToggle label="Symboles" checked={graph.showSymbols} onChange={v => setGraph({ showSymbols: v })} />
          </div>
          <div className="space-y-0.5 pt-0.5 border-t border-border/30">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Grille</p>
            <SmallSelect label="Intensité" value={graph.gridIntensity} options={[
              { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
            ]} onChange={v => setGraph({ gridIntensity: v as any })} />
            <SmallToggle label="Grille V" checked={graph.showVerticalGrid} onChange={v => setGraph({ showVerticalGrid: v })} />
          </div>
          <div className="space-y-0.5 pt-0.5 border-t border-border/30">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Fond</p>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Couleur</span>
              <div className="flex items-center gap-1">
                {['transparent', '#f8fafc', '#0f172a'].map(c => (
                  <button key={c} onClick={() => setGraph({ backgroundColor: c, transparentBg: c === 'transparent' })}
                    className={`w-4 h-4 rounded border transition-all ${graph.backgroundColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                    style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                  >{c === 'transparent' && <span className="text-[6px] text-muted-foreground leading-none">T</span>}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-0.5 pt-0.5 border-t border-border/30">
            <p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Légende</p>
            <SmallToggle label="Afficher" checked={graph.showLegend} onChange={v => setGraph({ showLegend: v })} />
            {graph.showLegend && (
              <SmallSelect label="Position" value={graph.legendPosition} options={[
                { value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' },
              ]} onChange={v => setGraph({ legendPosition: v as any })} />
            )}
          </div>
        </div>

        {/* ─── 4: Grid & Calendar ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 min-w-[170px]">
          <div className="flex items-center gap-1.5">
            <Grid3X3 className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Grille</span>
          </div>
          <SmallToggle label="Afficher" checked={gridCfg.enabled} onChange={v => setGridCfg({ enabled: v })} />
          {gridCfg.enabled && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">Opacité</span>
                <div className="flex items-center gap-1.5 flex-1 max-w-[100px]">
                  <Slider min={0} max={100} step={5} value={[gridCfg.opacity]} onValueChange={([v]) => setGridCfg({ opacity: v })} className="flex-1" />
                  <span className="text-[8px] text-muted-foreground w-[28px] text-right">{gridCfg.opacity}%</span>
                </div>
              </div>
              <SmallSelect label="Type" value={gridCfg.type} options={[
                { value: 'horizontal', label: 'Horizontal' },
                { value: 'vertical', label: 'Vertical' },
                { value: 'both', label: 'Les deux' },
              ]} onChange={v => setGridCfg({ type: v as any })} />
            </div>
          )}

          <div className="pt-1.5 border-t border-border/40">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weekends</span>
            </div>
            <SmallToggle label="Highlight" checked={calCfg.highlightWeekends} onChange={v => setCalCfg({ highlightWeekends: v })} />
            {calCfg.highlightWeekends && (
              <div className="space-y-1.5 mt-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">Opacité</span>
                  <div className="flex items-center gap-1.5 flex-1 max-w-[100px]">
                    <Slider min={0} max={50} step={2} value={[calCfg.weekendOpacity]} onValueChange={([v]) => setCalCfg({ weekendOpacity: v })} className="flex-1" />
                    <span className="text-[8px] text-muted-foreground w-[28px] text-right">{calCfg.weekendOpacity}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">Couleur</span>
                  <div className="flex items-center gap-1">
                    {['#E5E7EB', '#DBEAFE', '#FEF3C7', '#D1FAE5'].map(c => (
                      <button key={c} onClick={() => setCalCfg({ weekendColor: c })}
                        className={`w-4 h-4 rounded border transition-all ${calCfg.weekendColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── 4: Levels ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 min-w-[200px]">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Levels</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Primary</span>
              <select value={levelsCfg.primary || ''} onChange={e => setLevels({ primary: e.target.value || null })}
                className="px-2 py-0.5 rounded border border-border bg-card text-[10px] text-foreground outline-none w-[100px]"
              >
                <option value="">Aucun</option>
                <option value="REGION">Région</option>
                <option value="DOR">DOR</option>
                <option value="PLAQUE">Plaque</option>
                <option value="SITE">Site</option>
                <option value="CELL">Cellule</option>
                <option value="VENDOR">Vendor</option>
                <option value="TECHNO">Techno</option>
                <option value="BAND">Bande</option>
                <option value="ARCEP">Zone ARCEP</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Secondary</span>
              <select value={levelsCfg.secondary || ''} onChange={e => setLevels({ secondary: e.target.value || null })}
                disabled={!levelsCfg.primary}
                className="px-2 py-0.5 rounded border border-border bg-card text-[10px] text-foreground outline-none w-[100px] disabled:opacity-40"
              >
                <option value="">Aucun</option>
                <option value="SITE">Site</option>
                <option value="CELL">Cellule</option>
                <option value="PLAQUE">Plaque</option>
                <option value="VENDOR">Vendor</option>
                <option value="TECHNO">Techno</option>
                <option value="BAND">Bande</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── 5: Seuils Y (Thresholds) ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 min-w-[200px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seuils Y</span>
            </div>
            <Switch checked={thresholdsEnabled} onCheckedChange={onThresholdsEnabledChange}
              className="h-3.5 w-7 data-[state=checked]:bg-primary" />
          </div>
          {thresholdsEnabled && (
            <>
              <div className="space-y-1 max-h-[80px] overflow-y-auto">
                {thresholds.map(t => (
                  <div key={t.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 group">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <input type="number" value={t.value}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))}
                      className="w-[50px] px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none" placeholder="Val" />
                    <input type="text" value={t.label}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                      className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0" placeholder="Label" />
                    <select value={t.style}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: e.target.value as any } : th))}
                      className="px-1 py-0.5 rounded border border-border bg-card text-[8px] text-foreground outline-none">
                      <option value="dashed">- -</option>
                      <option value="solid">—</option>
                    </select>
                    <button onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))}
                      className="p-0.5 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    ><X className="w-2.5 h-2.5" /></button>
                  </div>
                ))}
              </div>
              <button onClick={addThreshold}
                className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-border text-[9px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
              ><Plus className="w-3 h-3" /> Ajouter seuil</button>
            </>
          )}
        </div>

        {/* ─── Bouton Appliquer ─── */}
        <div className="flex items-center shrink-0 self-end">
          <button
            onClick={() => toast.success('Configuration graph appliquée')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
};

export default GraphSettingsPanel;
