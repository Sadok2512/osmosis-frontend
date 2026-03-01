import React, { useState } from 'react';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  X, Plus, TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
  Check, AlertTriangle, ChevronDown, Trash2, Info,
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
    className={`px-2 py-1 rounded border border-border/60 bg-background text-[11px] text-foreground outline-none focus:border-primary/50 transition-all ${className || 'w-16'}`}
  />
);

const MiniSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`px-1.5 py-1 rounded border border-border/60 bg-background text-[11px] text-foreground outline-none focus:border-primary/50 cursor-pointer ${className || 'w-[72px]'}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode; info?: string }> = ({ label, children, info }) => (
  <div className="flex items-center justify-between gap-2 min-h-[28px]">
    <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
      {label}
      {info && <Info className="w-3 h-3 text-muted-foreground/50" />}
    </span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const CheckboxRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; info?: string }> = ({ label, checked, onChange, info }) => (
  <label className="flex items-center gap-2 min-h-[28px] cursor-pointer group">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer" />
    <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
      {label}
      {info && <Info className="w-3 h-3 text-muted-foreground/50" />}
    </span>
  </label>
);

const SectionHeader: React.FC<{ label: string; checked?: boolean; onCheckedChange?: (v: boolean) => void; color?: string }> = ({ label, checked, onCheckedChange, color }) => (
  <div className="flex items-center gap-2 pb-1.5 mb-1 border-b border-border/30">
    {onCheckedChange !== undefined && (
      <input type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer" style={color ? { accentColor: color } : undefined} />
    )}
    <span className="text-[11px] font-bold text-foreground">{label}</span>
  </div>
);

/* ════════════════════════════════════════════════════════════════
   SERIES TABLE — blue reference style with all columns
   ════════════════════════════════════════════════════════════════ */
export type QuickSettingsSection = 'kpis' | 'style' | 'full' | null;

export interface SeriesTableProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}

export const SeriesTable: React.FC<SeriesTableProps> = ({ catalogMap, onOpenKpiSelector }) => {
  const store = useKpiMonitorStore();

  if (store.selectedKpis.length === 0) {
    return (
      <div className="px-4 py-3">
        <button
          onClick={onOpenKpiSelector}
          className="w-full py-3 rounded-lg border border-dashed border-border/50 hover:border-primary/40 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[11px] font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Sélectionner des KPIs
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground/70 text-[10px] font-medium uppercase tracking-wider">
            <th className="px-2 py-1.5 text-left w-6"></th>
            <th className="px-2 py-1.5 text-left">Style</th>
            <th className="px-2 py-1.5 text-left">Type</th>
            <th className="px-2 py-1.5 text-left">Axe Y</th>
            <th className="px-2 py-1.5 text-left">Axe X</th>
            <th className="px-2 py-1.5 text-left">Stats</th>
            <th className="px-2 py-1.5 text-left">Valeur / Légende</th>
            <th className="px-2 py-1.5 text-right w-8"></th>
          </tr>
        </thead>
        <tbody>
          {store.selectedKpis.map(kpi => {
            const cat = catalogMap[kpi.kpi_key];
            const color = kpi.color || cat?.color || '#3b82f6';
            const name = cat?.display_name || kpi.kpi_key;
            return (
              <tr key={kpi.kpi_key} className="border-b border-border/20 hover:bg-muted/20 transition-colors group">
                {/* Checkbox */}
                <td className="px-2 py-1.5">
                  <input type="checkbox" defaultChecked className="w-3.5 h-3.5 rounded border-border accent-[#14b8a6] cursor-pointer" />
                </td>
                {/* Style (color + icon) */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-4 h-4 rounded-full ring-1 ring-border/30 hover:scale-110 transition-transform" style={{ backgroundColor: color }} />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="start">
                        <div className="grid grid-cols-5 gap-1.5">
                          {PRESET_COLORS.map(c => (
                            <button key={c} onClick={() => store.updateKpi(kpi.kpi_key, { color: c })}
                              className={`w-5 h-5 rounded-full hover:scale-125 transition-transform ${color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/50" />
                  </div>
                </td>
                {/* Type */}
                <td className="px-2 py-1.5">
                  <select
                    value={kpi.graphType || 'line'}
                    onChange={e => store.updateKpi(kpi.kpi_key, { graphType: e.target.value as GraphType })}
                    className="px-1 py-0.5 rounded border border-border/40 bg-transparent text-[11px] cursor-pointer outline-none"
                  >
                    {GRAPH_TYPES.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </td>
                {/* Axe Y */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <select
                      value={kpi.axis}
                      onChange={e => store.updateKpi(kpi.kpi_key, { axis: e.target.value as any })}
                      className="px-1 py-0.5 rounded border border-border/40 bg-transparent text-[11px] cursor-pointer outline-none"
                    >
                      <option value="left">Gauche</option>
                      <option value="right">Droite</option>
                    </select>
                    <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                </td>
                {/* Axe X */}
                <td className="px-2 py-1.5">
                  <span className="text-muted-foreground/60 text-[10px]">Granularité : Jour</span>
                  <button className="ml-1 text-muted-foreground/40 hover:text-foreground"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M8 1L1 8M1 1l7 7" stroke="currentColor" strokeWidth="1.2"/></svg></button>
                </td>
                {/* Stats */}
                <td className="px-2 py-1.5">
                  <select className="px-1 py-0.5 rounded border border-border/40 bg-transparent text-[11px] cursor-pointer outline-none">
                    <option>Aucune</option>
                    <option>Médiane - 3 σ</option>
                    <option>Moyenne</option>
                    <option>Min/Max</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/40 inline ml-0.5" />
                </td>
                {/* Valeur / Légende */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: color }}>
                      {name}
                      <button onClick={() => store.removeKpi(kpi.kpi_key)} className="hover:text-white/70 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                    {(cat as any)?.techno && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500 text-white">
                        {(cat as any).techno}
                        <X className="w-2.5 h-2.5 opacity-60" />
                      </span>
                    )}
                    <button className="w-5 h-5 rounded border border-border/40 flex items-center justify-center text-muted-foreground/50 hover:border-primary/40 hover:text-primary transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                {/* Delete */}
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => store.removeKpi(kpi.kpi_key)}
                    className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Add new series */}
      <button onClick={onOpenKpiSelector}
        className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground hover:text-primary transition-colors">
        <Plus className="w-3 h-3" /> Nouvelle série
      </button>
      {/* Title */}
      <div className="px-3 pb-2">
        <label className="text-[10px] text-muted-foreground block mb-0.5">Titre</label>
        <input
          type="text"
          placeholder="Titre automatique"
          className="w-full px-2 py-1 rounded border border-border/40 bg-background text-[11px] text-foreground outline-none focus:border-primary/50"
        />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   BOTTOM FILTER CARDS — NEs + KPIs blue-style cards
   ════════════════════════════════════════════════════════════════ */
export const BottomFilterCards: React.FC<{
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
}> = ({ catalogMap, onOpenKpiSelector }) => {
  const store = useKpiMonitorStore();

  return (
    <div className="border-t border-border/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-semibold text-foreground">Filtres</span>
        <button className="w-5 h-5 rounded-full border border-border/40 flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:border-primary/40 transition-colors">
          <Plus className="w-3 h-3" />
        </button>
      </div>
      <div className="flex gap-3">
        {/* NE Card */}
        <div className="flex-1 rounded-lg overflow-hidden border border-border/30">
          <div className="bg-[#14b8a6] px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">NEs</span>
            <Trash2 className="w-3 h-3 text-white/70 hover:text-white cursor-pointer" />
          </div>
          <div className="bg-[#14b8a6]/5 px-2 py-2 min-h-[60px]">
            {store.localFilters.filter(f => f.dimension === 'site_name').map(f => (
              f.values.map((v, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-border/40 text-[10px] text-foreground mb-1 mr-1">
                  {v} <X className="w-2.5 h-2.5 text-muted-foreground cursor-pointer" />
                </span>
              ))
            ))}
            <button className="block text-[10px] text-[#14b8a6] hover:text-[#0d9488] font-medium mt-1">
              Ajouter un NE
            </button>
          </div>
        </div>
        {/* KPIs Card */}
        <div className="flex-1 rounded-lg overflow-hidden border border-border/30">
          <div className="bg-[#0ea5e9] px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">KPIS</span>
            <Trash2 className="w-3 h-3 text-white/70 hover:text-white cursor-pointer" />
          </div>
          <div className="bg-[#0ea5e9]/5 px-2 py-2 min-h-[60px]">
            {store.selectedKpis.map(kpi => {
              const cat = catalogMap[kpi.kpi_key];
              const name = cat?.display_name || kpi.kpi_key;
              return (
                <span key={kpi.kpi_key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-border/40 text-[10px] text-foreground mb-1 mr-1">
                  {name} <button onClick={() => store.removeKpi(kpi.kpi_key)}><X className="w-2.5 h-2.5 text-muted-foreground" /></button>
                </span>
              );
            })}
            <button onClick={onOpenKpiSelector} className="block text-[10px] text-[#0ea5e9] hover:text-[#0284c7] font-medium mt-1">
              Ajouter un KPI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════
   RIGHT CONFIG PANEL — Légende / Axe X / Axe Y gauche / droite / Seuils
   Matches blue reference style with checkboxes and radio buttons
   ════════════════════════════════════════════════════════════════ */
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

export const RightConfigPanel: React.FC<RightConfigPanelProps> = ({
  axisConfig: externalAxis, onAxisConfigChange,
  graphConfig: externalGraph, onGraphConfigChange,
  thresholds, onThresholdsChange, thresholdsEnabled, onThresholdsEnabledChange,
}) => {
  const axis = externalAxis || DEFAULT_AXIS;
  const setAxis = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });
  const graph = externalGraph || DEFAULT_GRAPH;
  const setGraph = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  const addThreshold = () => {
    onThresholdsChange([
      ...thresholds,
      { id: crypto.randomUUID(), value: 0, label: 'Seuil', color: THRESHOLD_COLORS[thresholds.length % THRESHOLD_COLORS.length], style: 'dashed' },
    ]);
  };

  return (
    <div className="text-[11px] divide-y divide-border/30">
      {/* ── Légende ── */}
      <div className="px-3 py-3 space-y-2">
        <span className="text-[12px] font-bold text-foreground">Légende</span>
        <div className="flex items-center gap-4 pt-1">
          {(['top', 'bottom', 'hidden'] as const).map(pos => (
            <label key={pos} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="legendPos"
                checked={pos === 'hidden' ? !graph.showLegend : (graph.showLegend && graph.legendPosition === pos)}
                onChange={() => {
                  if (pos === 'hidden') setGraph({ showLegend: false });
                  else setGraph({ showLegend: true, legendPosition: pos });
                }}
                className="w-3 h-3 accent-primary" />
              <span className="text-[11px] text-muted-foreground">{pos === 'top' ? 'Haut' : pos === 'bottom' ? 'Bas' : 'Masquée'}</span>
            </label>
          ))}
        </div>
        <CheckboxRow label="Légende Parents - Ne" checked={false} onChange={() => {}} />
        <CheckboxRow label="Inverser les axes" checked={axis.yInvert} onChange={v => setAxis({ yInvert: v })} />
        <CheckboxRow label="Activer le mode polaire" checked={false} onChange={() => {}} />
      </div>

      {/* ── Axe X ── */}
      <div className="px-3 py-3 space-y-2">
        <SectionHeader label="Axe X" checked={true} onCheckedChange={() => {}} color="#14b8a6" />
        <CheckboxRow label="Afficher les week-ends" checked={false} onChange={() => {}} info="Highlight" />
        <CheckboxRow label="Choisir le format des dates" checked={axis.xFormat !== 'short'} onChange={v => {
          if (!v) setAxis({ xFormat: 'short' });
        }} />
        {axis.xFormat !== 'short' && (
          <div className="pl-6">
            <MiniSelect value={axis.xFormat}
              options={[{ value: 'short', label: 'Court' }, { value: 'full', label: 'Complet' }, { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date+H' }]}
              onChange={v => setAxis({ xFormat: v as any })} className="w-24" />
          </div>
        )}
        <CheckboxRow label="Choisir la fréquence des intervalles" checked={false} onChange={() => {}} info="Intervals" />
        <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors pt-0.5">
          <Plus className="w-3 h-3" /> Ajouter barre verticale
        </button>
      </div>

      {/* ── Axe Y gauche ── */}
      <div className="px-3 py-3 space-y-2">
        <SectionHeader label="Axe Y gauche" checked={true} onCheckedChange={() => {}} color="#14b8a6" />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="yLeftScale" defaultChecked className="w-3 h-3 accent-primary" />
            <span className="text-[11px] text-muted-foreground">Linéaire</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="yLeftScale" className="w-3 h-3 accent-primary" />
            <span className="text-[11px] text-muted-foreground">Logarithmique</span>
          </label>
        </div>
        <FieldRow label="Libellé">
          <MiniInput value={axis.yTitle} placeholder="" onChange={e => setAxis({ yTitle: e.target.value })} className="w-24" />
        </FieldRow>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Min</span>
            <MiniInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto"
              onChange={e => setAxis({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-full" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Max</span>
            <MiniInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto"
              onChange={e => setAxis({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-full" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Nombre d'intervalles</span>
            <MiniInput type="number" placeholder="Auto" className="w-full" />
          </div>
        </div>
        {/* Add threshold */}
        <button onClick={addThreshold} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors pt-0.5">
          <Plus className="w-3 h-3" /> Ajouter seuil
        </button>
        {thresholdsEnabled && thresholds.map(t => (
          <div key={t.id} className="flex items-center gap-1.5 group pl-1">
            <button className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            <MiniInput type="number" value={t.value}
              onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, value: Number(e.target.value) } : th))} className="w-14" />
            <MiniInput value={t.label}
              onChange={e => onThresholdsChange(thresholds.map(th => th.id === t.id ? { ...th, label: e.target.value } : th))} className="flex-1 min-w-0" />
            <button onClick={() => onThresholdsChange(thresholds.filter(th => th.id !== t.id))}
              className="p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Axe Y droite ── */}
      <div className="px-3 py-3 space-y-2">
        <SectionHeader label="Axe Y droite" checked={true} onCheckedChange={() => {}} color="#14b8a6" />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="yRightScale" defaultChecked className="w-3 h-3 accent-primary" />
            <span className="text-[11px] text-muted-foreground">Linéaire</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="yRightScale" className="w-3 h-3 accent-primary" />
            <span className="text-[11px] text-muted-foreground">Logarithmique</span>
          </label>
        </div>
        <FieldRow label="Libellé">
          <MiniInput placeholder="" className="w-24" />
        </FieldRow>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Min</span>
            <MiniInput type="number" placeholder="Auto" className="w-full" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Max</span>
            <MiniInput type="number" placeholder="Auto" className="w-full" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground block mb-0.5">Nombre d'intervalles</span>
            <MiniInput type="number" placeholder="Auto" className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Legacy exports (keep backward compat) ── */
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
