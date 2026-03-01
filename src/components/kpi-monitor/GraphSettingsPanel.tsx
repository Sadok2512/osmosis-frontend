import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, Pencil, MoreHorizontal, BarChart3, GitBranch,
  TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  Download, FileSpreadsheet, RefreshCw, Copy, Trash2,
  AlertTriangle, Palette, Grid3X3, Check,
} from 'lucide-react';
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
  style: 'dashed' | 'solid';
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
  // Threshold & style state managed externally (per widget)
  thresholds: WidgetThreshold[];
  onThresholdsChange: (t: WidgetThreshold[]) => void;
  thresholdsEnabled: boolean;
  onThresholdsEnabledChange: (v: boolean) => void;
  styleConfig: WidgetStyleConfig;
  onStyleChange: (s: WidgetStyleConfig) => void;
}

const GraphSettingsPanel: React.FC<GraphSettingsPanelProps> = ({
  widgetId, widgetTitle, catalogMap, onOpenKpiSelector, onClose,
  onDuplicate, onDelete, onExportPNG, onExportCSV, onRefresh,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
  styleConfig, onStyleChange,
}) => {
  const store = useKpiMonitorStore();

  const addThreshold = () => {
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="border-b border-primary/30 bg-card/80 backdrop-blur-sm animate-in slide-in-from-top-2 duration-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-primary" />
          <span className="text-[11px] font-bold text-foreground">
            {widgetTitle || 'Graph Settings'}
          </span>
          <Badge variant="outline" className="text-[8px] h-4 px-1.5">Widget</Badge>
        </div>
        <div className="flex items-center gap-1">
          {/* Actions ⋯ */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onExportPNG} className="gap-2 text-xs">
                <Download className="w-3.5 h-3.5" /> Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV} className="gap-2 text-xs">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRefresh} className="gap-2 text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs">
                <Copy className="w-3.5 h-3.5" /> Dupliquer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content: 4 sections side by side ── */}
      <div className="px-4 py-2.5 flex gap-3 overflow-x-auto">
        {/* ─── Section 1: KPI Config ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 min-w-[280px] flex-1">
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
                    {/* Color */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border hover:ring-primary transition-all cursor-pointer"
                          style={{ backgroundColor: displayColor }} />
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
                    {/* Name */}
                    <span className="text-[10px] font-medium text-foreground truncate flex-1 min-w-0">{displayName}</span>
                    {/* Axis */}
                    <div className="flex items-center rounded border border-border bg-background overflow-hidden shrink-0">
                      <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'left' })}
                        className={`px-1 py-0.5 text-[8px] font-bold transition-colors ${kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >L</button>
                      <button onClick={() => store.updateKpi(kpi.kpi_key, { axis: 'right' })}
                        className={`px-1 py-0.5 text-[8px] font-bold transition-colors ${kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >R</button>
                    </div>
                    {/* Split */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <GitBranch className="w-2.5 h-2.5 text-muted-foreground/60" />
                      <Select value={kpi.splitOverride === null ? 'none' : kpi.splitOverride || 'none'} onValueChange={v => store.updateKpi(kpi.kpi_key, { splitOverride: v === 'none' ? null : v as SplitDimension })}>
                        <SelectTrigger className="h-5 w-[70px] text-[8px] px-1 border-border bg-background">
                          <SelectValue placeholder="Split" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[10px]">Aucun</SelectItem>
                          {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-[10px]">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Graph type */}
                    <Select value={graphType} onValueChange={v => store.updateKpi(kpi.kpi_key, { graphType: v as GraphType })}>
                      <SelectTrigger className="h-5 w-[64px] text-[8px] px-1 border-border bg-background">
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
                    <button onClick={() => store.removeKpi(kpi.kpi_key)}
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    ><X className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Section 2: Seuils Y (Thresholds) ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 min-w-[220px]">
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
                      className="w-[50px] px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none"
                      placeholder="Val"
                    />
                    <input type="text" value={t.label}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))}
                      className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0"
                      placeholder="Label"
                    />
                    <select value={t.style}
                      onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, style: e.target.value as any } : th))}
                      className="px-1 py-0.5 rounded border border-border bg-card text-[8px] text-foreground outline-none"
                    >
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

        {/* ─── Section 3: Style ─── */}
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-2 min-w-[160px]">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Style</span>
          </div>
          <div className="space-y-1.5">
            {/* Background */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Background</span>
              <div className="flex items-center gap-1">
                {['transparent', '#f8fafc', '#0f172a'].map(c => (
                  <button key={c} onClick={() => onStyleChange({ ...styleConfig, backgroundColor: c })}
                    className={`w-5 h-5 rounded border transition-all ${
                      styleConfig.backgroundColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'
                    }`}
                    style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                  >{c === 'transparent' && <span className="text-[7px] text-muted-foreground leading-none">T</span>}</button>
                ))}
              </div>
            </div>
            {/* Grid */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Grille</span>
              <div className="flex items-center rounded border border-border bg-muted/30 overflow-hidden">
                <button onClick={() => onStyleChange({ ...styleConfig, gridIntensity: 'light' })}
                  className={`px-2 py-0.5 text-[8px] font-bold transition-colors ${
                    styleConfig.gridIntensity === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >Light</button>
                <button onClick={() => onStyleChange({ ...styleConfig, gridIntensity: 'medium' })}
                  className={`px-2 py-0.5 text-[8px] font-bold transition-colors ${
                    styleConfig.gridIntensity === 'medium' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >Medium</button>
              </div>
            </div>
            {/* Smooth */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground">Lissage</span>
              <Switch checked={styleConfig.smoothLine} onCheckedChange={v => onStyleChange({ ...styleConfig, smoothLine: v })}
                className="h-3.5 w-7 data-[state=checked]:bg-primary" />
            </div>
          </div>
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
