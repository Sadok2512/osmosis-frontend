import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ReactGridLayout as GridLayout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Plus, BarChart3, Save, FileDown, Sparkles, Pencil, EyeIcon,
  Activity, Filter, Calendar as CalendarIcon, X, Flag,
  Square, Columns2, LayoutGrid, LineChart as LineChartIcon,
  Table2, MapPin, ChevronDown, MoreHorizontal, Globe, Lock,
  Type, Image as ImageIcon, Gauge, Settings, GitBranch, Check,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useKpiCatalog, useDateRange, fetchDimensionValues } from './api/kpiMonitorApi';
import { buildCatalogMap } from './kpiCatalog';
import { KpiCatalogEntry, SplitDimension } from './types';
import { KpiWidgetItem, KpiWidgetConfig, createEmptyKpiWidget, duplicateKpiWidget } from './KpiWidgetTypes';
import KpiWidgetCard from './KpiWidgetCard';
import AIFloatingModal from './AIFloatingModal';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { exportElementToPDF } from '@/lib/exportUtils';

const COLS = 12;
const ROW_HEIGHT = 80;

type ViewMode = 'graph' | 'table' | 'map';

const PERIODS = [
  { label: 'Période...', value: '' },
  { label: '24h', value: '24h', days: 1 },
  { label: '7 jours', value: '7d', days: 7 },
  { label: '14 jours', value: '14d', days: 14 },
  { label: '30 jours', value: '30d', days: 30 },
  { label: '90 jours', value: '90d', days: 90 },
];

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
];

const SPLIT_OPTIONS: { value: SplitDimension | 'none'; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const TOP_N_OPTIONS = [3, 5, 10, 15, 20];

const FILTER_DIMENSIONS_LIST = ['CELL', 'SITE', 'VENDOR', 'TECHNO', 'BAND', 'DOR', 'DR', 'PLAQUE', 'ZONE_ARCEP'];

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

interface Jalon {
  id: string;
  date: string;
  label: string;
  color: string;
}

const JALON_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/* ── Jalon Form ── */
const JalonForm: React.FC<{ onAdd: (j: Jalon) => void }> = ({ onAdd }) => {
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(JALON_COLORS[0]);

  const handleAdd = () => {
    if (!date || !label) return;
    onAdd({ id: `jalon-${Date.now()}`, date, label, color });
    setDate('');
    setLabel('');
  };

  return (
    <div className="space-y-2">
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom du jalon..."
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
      <div className="flex items-center gap-1.5">
        {JALON_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={cn('w-5 h-5 rounded-full border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
            style={{ backgroundColor: c }} />
        ))}
        <Button size="sm" className="h-6 text-[10px] px-3 ml-auto" onClick={handleAdd} disabled={!date || !label}>
          <Plus className="w-3 h-3 mr-1" /> Ajouter
        </Button>
      </div>
    </div>
  );
};

/* ── Add Filter Dropdown ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string, val: string) => void;
}> = ({ existingKeys, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedDim(null); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
          <Filter className="w-3 h-3" /> + Filtre
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[180px] p-1.5" align="start" sideOffset={4}>
        {!selectedDim ? (
          FILTER_DIMENSIONS_LIST.map(dim => (
            <button key={dim} onClick={() => setSelectedDim(dim)}
              className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
              {dim}
            </button>
          ))
        ) : (
          <FilterValuesList dim={selectedDim} onSelect={(val) => { onAdd(selectedDim, val); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
        )}
      </PopoverContent>
    </Popover>
  );
};

const FilterValuesList: React.FC<{ dim: string; onSelect: (val: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    const dimMap: Record<string, string> = { Site: 'Site', Vendor: 'Vendor', Technology: 'TECHNO', Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'Plaque', 'Zone ARCEP': 'ARCEP' };
    fetchDimensionValues(dimMap[dim] || dim).then(d => { if (d.values) setValues(d.values); }).catch(() => {});
  }, [dim]);

  return (
    <>
      <button onClick={onBack} className="w-full text-left px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground">← {dim}</button>
      <div className="border-t border-border/40 mt-1 pt-1 max-h-[200px] overflow-y-auto">
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
        ) : values.map(val => (
          <button key={val} onClick={() => onSelect(val)}
            className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">{val}</button>
        ))}
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   RIGHT SIDEBAR — Investigator-Style Widget Config Panel
   ═══════════════════════════════════════════════════════════════════ */

const SIDEBAR_CHART_TYPES = [
  { value: 'line', label: 'Line', icon: LineChartIcon },
  { value: 'area', label: 'Area', icon: BarChart3 },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'stacked_area', label: 'Stack', icon: BarChart3 },
] as const;

const WidgetSidebarPanel: React.FC<{
  widget: KpiWidgetItem;
  catalog: KpiCatalogEntry[];
  catalogMap: Record<string, KpiCatalogEntry>;
  onUpdate: (updates: Partial<KpiWidgetConfig>) => void;
  onClose: () => void;
}> = ({ widget, catalog, catalogMap, onUpdate, onClose }) => {
  const config = widget.config;
  const [showKpiSelector, setShowKpiSelector] = useState(false);
  const [kpiSearch, setKpiSearch] = useState('');

  const filteredCatalog = useMemo(() => {
    if (!kpiSearch) return catalog;
    const q = kpiSearch.toLowerCase();
    return catalog.filter(k =>
      k.display_name.toLowerCase().includes(q) || k.kpi_key.toLowerCase().includes(q)
    );
  }, [catalog, kpiSearch]);

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, KpiCatalogEntry[]> = {};
    for (const entry of filteredCatalog) {
      const cat = entry.category || 'Autres';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [filteredCatalog]);

  const toggleKpi = (key: string) => {
    if (config.kpis.some(k => k.kpi_key === key)) {
      onUpdate({ kpis: config.kpis.filter(k => k.kpi_key !== key) });
    } else {
      const cat = catalogMap[key];
      const color = COLORS[(config.kpis.length) % COLORS.length];
      onUpdate({
        kpis: [...config.kpis, {
          kpi_key: key, agg: (cat?.default_agg as any) || 'avg', axis: 'left', color,
        }],
      });
    }
  };

  const removeKpi = (key: string) => {
    onUpdate({ kpis: config.kpis.filter(k => k.kpi_key !== key) });
  };

  const displayTitle = config.kpis.length > 0
    ? config.kpis.map(k => catalogMap[k.kpi_key]?.display_name || k.kpi_key).join(' / ')
    : config.title;

  // Y-Axis active tab state
  const [activeYTab, setActiveYTab] = useState<'L' | 'R'>('L');

  return (
    <div className="w-[300px] border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
          <Settings className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground leading-tight truncate">{displayTitle}</p>
          <p className="text-[9px] text-muted-foreground">Configuration du widget</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* KPIs Section */}
        <div className="px-3 py-2.5 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">KPIs</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold ml-auto">{config.kpis.length}</span>
          </div>

          <button
            onClick={() => setShowKpiSelector(!showKpiSelector)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-primary/30 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 transition-all mb-2"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-primary">Sélectionner des KPIs</span>
          </button>

          {showKpiSelector && (
            <div className="mb-2 rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
              <div className="p-1.5">
                <input value={kpiSearch} onChange={e => setKpiSearch(e.target.value)} placeholder="Rechercher KPI..."
                  className="w-full px-2 py-1 rounded-md border border-border/60 bg-background text-[10px] outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="max-h-40 overflow-y-auto px-1 pb-1">
                {Object.entries(groupedCatalog).map(([category, entries]) => (
                  <div key={category}>
                    <div className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">{category}</div>
                    {entries.map(entry => {
                      const selected = config.kpis.some(k => k.kpi_key === entry.kpi_key);
                      return (
                        <button key={entry.kpi_key} onClick={() => toggleKpi(entry.kpi_key)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px] text-left transition-all",
                            selected ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground"
                          )}
                        >
                          <div className={cn(
                            "w-3 h-3 rounded flex items-center justify-center shrink-0 border transition-all",
                            selected ? "bg-primary border-primary" : "border-border/80 bg-background"
                          )}>
                            {selected && <Check className="w-2 h-2 text-primary-foreground" />}
                          </div>
                          <span className="truncate">{entry.display_name}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected KPIs list */}
          <div className="space-y-0.5">
            {config.kpis.map((k, i) => {
              const entry = catalogMap[k.kpi_key];
              const color = k.color || COLORS[i % COLORS.length];
              return (
                <div key={k.kpi_key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group/kpi">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-medium text-foreground truncate flex-1">{entry?.display_name || k.kpi_key}</span>
                  <button onClick={() => removeKpi(k.kpi_key)} className="p-0.5 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover/kpi:opacity-100 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Graph Settings (Investigator-style) ── */}
        <div className="px-3 py-2.5 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
            <Settings className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Graphique</span>
          </div>

          {/* Chart Type — compact icon row */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40">
            {SIDEBAR_CHART_TYPES.map(ct => (
              <button key={ct.value}
                onClick={() => onUpdate({ graphType: ct.value })}
                className={cn('flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[9px] font-semibold transition-all',
                  config.graphType === ct.value
                    ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                title={ct.label}
              >
                <ct.icon className="w-3 h-3" />
                <span className="hidden sm:inline">{ct.label}</span>
              </button>
            ))}
          </div>

          {/* Toggles — 2-column grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {([
              { label: 'Smooth', key: 'smooth' },
              { label: 'Markers', key: 'showSymbols' },
              { label: 'Area Fill', key: 'showArea' },
              { label: 'Thresholds', key: 'showThresholds' },
              { label: 'Average', key: 'showAverage' },
              { label: 'Grid', key: 'showGrid' },
              { label: 'Legend', key: 'showLegend' },
            ] as const).map(toggle => (
              <div key={toggle.key} className="flex items-center justify-between py-0.5">
                <span className="text-[9px] text-foreground">{toggle.label}</span>
                <Switch
                  checked={Boolean((config as any)[toggle.key])}
                  onCheckedChange={v => onUpdate({ [toggle.key]: v })}
                  className="scale-[0.6]"
                />
              </div>
            ))}
          </div>

          {/* Line Width — inline */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-foreground shrink-0">Width</span>
            <Slider
              value={[config.lineWidth]}
              onValueChange={v => onUpdate({ lineWidth: v[0] })}
              min={0.5} max={5} step={0.5}
              className="flex-1"
            />
            <span className="text-[8px] text-muted-foreground font-mono w-6 text-right">{config.lineWidth}px</span>
          </div>

          {/* Y-Axis — compact */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Axe Y</span>
            <div className="flex gap-0 rounded-md border border-border/40 bg-muted/50 p-0.5">
              {(['L', 'R'] as const).map(side => (
                <button key={side}
                  onClick={() => setActiveYTab(side)}
                  className={cn('h-5 min-w-6 rounded-[4px] px-1.5 text-[8px] font-bold transition-all',
                    activeYTab === side
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >{side}</button>
              ))}
            </div>
            {(() => {
              const isRight = activeYTab === 'R';
              const axisCfg = isRight ? config.yAxisRight : config.yAxis;
              const axisKey = isRight ? 'yAxisRight' : 'yAxis';
              return (
                <div className="flex gap-0.5 flex-1">
                  {(['auto', 'manual'] as const).map(mode => (
                    <button key={mode} onClick={() => onUpdate({ [axisKey]: { ...axisCfg, mode } })}
                      className={cn('flex-1 px-1.5 py-0.5 rounded text-[8px] font-semibold transition-all',
                        (axisCfg?.mode || 'auto') === mode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}
                    >{mode === 'auto' ? 'Auto' : 'Manuel'}</button>
                  ))}
                </div>
              );
            })()}
          </div>
          {(() => {
            const isRight = activeYTab === 'R';
            const axisCfg = isRight ? config.yAxisRight : config.yAxis;
            const axisKey = isRight ? 'yAxisRight' : 'yAxis';
            if (axisCfg?.mode !== 'manual') return null;
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <span className="text-[8px] text-muted-foreground">Min</span>
                  <input type="number" value={axisCfg?.min ?? ''} onChange={e => onUpdate({ [axisKey]: { ...axisCfg, mode: 'manual', min: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-mono" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[8px] text-muted-foreground">Max</span>
                  <input type="number" value={axisCfg?.max ?? ''} onChange={e => onUpdate({ [axisKey]: { ...axisCfg, mode: 'manual', max: e.target.value === '' ? undefined : Number(e.target.value) } })} placeholder="Auto" className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-mono" />
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Filters Section ── */}
        <div className="px-3 py-2.5 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Filtres</span>
            </div>
            <Select onValueChange={v => {
              onUpdate({ filters: [...config.filters, { id: `f_${Date.now()}`, dimension: v, op: 'IN' as const, values: [] }] });
            }}>
              <SelectTrigger className="h-5 w-auto text-[9px] border-dashed gap-0.5 px-1.5 py-0">
                <Plus className="w-2.5 h-2.5" /> Ajouter
              </SelectTrigger>
              <SelectContent>
                {FILTER_DIMENSIONS_LIST.map(d => (
                  <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {config.filters.length === 0 ? (
            <p className="text-[9px] text-muted-foreground/50 italic">Aucun filtre actif</p>
          ) : (
            <div className="space-y-0.5">
              {config.filters.map(f => (
                <div key={f.id} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 text-[9px]">
                  <span className="font-semibold text-foreground">{f.dimension}</span>
                  {f.values.length > 0 && <span className="text-muted-foreground">({f.values.length})</span>}
                  <button onClick={() => onUpdate({ filters: config.filters.filter(ff => ff.id !== f.id) })} className="ml-auto text-muted-foreground hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Split By Section ── */}
        <div className="px-3 py-2.5 border-b border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Split By</span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={config.splitBy || 'none'} onValueChange={v => onUpdate({ splitBy: v === 'none' ? null : v as SplitDimension })}>
              <SelectTrigger className="h-7 flex-1 text-[10px]">
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Aucun</SelectItem>
                {FILTER_DIMENSIONS_LIST.map(d => (
                  <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.splitBy && (
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-muted-foreground">Top</span>
                <input
                  type="number"
                  value={config.topN}
                  onChange={e => onUpdate({ topN: Math.max(1, Number(e.target.value) || 5) })}
                  className="w-10 px-1 py-0.5 rounded border border-border bg-background text-foreground text-[9px] font-mono text-center"
                  min={1}
                  max={50}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Per-KPI Settings ── */}
        {config.kpis.length > 0 && (
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Per-KPI</span>
            </div>
            <div className="space-y-1.5">
              {config.kpis.map((k, i) => {
                const entry = catalogMap[k.kpi_key];
                const color = k.color || COLORS[i % COLORS.length];
                const yIdx = config.yAxisAssignments?.[k.kpi_key] ?? 0;
                return (
                  <div key={k.kpi_key} className="rounded-lg border border-border/30 bg-muted/10 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[9px] font-semibold text-foreground truncate flex-1">{entry?.display_name || k.kpi_key}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-muted-foreground shrink-0">Axe:</span>
                      {(['L', 'R'] as const).map((side, sideIdx) => (
                        <button key={side}
                          onClick={() => onUpdate({
                            yAxisAssignments: { ...(config.yAxisAssignments || {}), [k.kpi_key]: sideIdx }
                          })}
                          className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold transition-all',
                            yIdx === sideIdx ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                          )}
                        >{side}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/40 flex items-center gap-2 text-[9px] text-muted-foreground">
        <Save className="w-3 h-3" />
        <span>À jour</span>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
const KPIMonitorPage: React.FC = () => {
  const queryClient = useQueryClient();
  const dm = useDashboardManager();

  // KPI catalog
  const { data: backendCatalog } = useKpiCatalog();
  const catalog: KpiCatalogEntry[] = useMemo(() => {
    const arr = Array.isArray(backendCatalog) ? backendCatalog : (backendCatalog as any)?.items ?? [];
    if (!arr || arr.length === 0) return [];
    return arr.map((e: any): KpiCatalogEntry => ({
      kpi_id: e.kpi_key, kpi_key: e.kpi_key, display_name: e.display_name,
      description: e.description || '', techno_scope: 'both', unit: e.unit || '',
      value_type: (e.value_type as any) || 'gauge', default_agg: 'avg',
      allowed_aggs: ['avg', 'min', 'max', 'sum'], is_map_supported: false,
      thresholds: e.threshold_warning != null ? { warning: e.threshold_warning, critical: e.threshold_critical ?? e.threshold_warning * 0.8 } : undefined,
      category: e.category || 'Other', color: '#3b82f6',
      vendor: e.vendor || '', techno: e.techno || '',
      supported_levels: e.supported_levels || [], is_normalized: !!e.is_normalized,
    }));
  }, [backendCatalog]);
  const catalogMap = useMemo(() => buildCatalogMap(catalog), [catalog]);

  // Date range from backend
  const { data: dateRange } = useDateRange();

  // Widget state
  const [widgets, setWidgets] = useState<KpiWidgetItem[]>([]);
  const [editMode, setEditMode] = useState(true);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');

  // Dashboard description & visibility
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  // Global controls
  const [globalDateFrom, setGlobalDateFrom] = useState('');
  const [globalDateTo, setGlobalDateTo] = useState('');
  const [globalGranularity, setGlobalGranularity] = useState('auto');
  const [globalPeriod, setGlobalPeriod] = useState('');
  const [globalSplitBy, setGlobalSplitBy] = useState<SplitDimension | 'none'>('none');
  const [globalTopN, setGlobalTopN] = useState(5);

  // Global filters
  const [globalFilters, setGlobalFilters] = useState<Record<string, string[]>>({});

  // Jalons
  const [jalons, setJalons] = useState<Jalon[]>([]);

  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Sync date range
  useEffect(() => {
    if (dateRange?.min_date && dateRange?.max_date && !globalDateFrom) {
      setGlobalDateFrom(dateRange.min_date.replace(/[T ].*/, ''));
      setGlobalDateTo(dateRange.max_date.replace(/[T ].*/, ''));
    }
  }, [dateRange, globalDateFrom]);

  const getDefaultDates = useCallback(() => {
    if (globalDateFrom && globalDateTo) return { dateFrom: globalDateFrom, dateTo: globalDateTo };
    if (dateRange?.min_date && dateRange?.max_date) {
      return { dateFrom: dateRange.min_date.replace(/[T ].*/, ''), dateTo: dateRange.max_date.replace(/[T ].*/, '') };
    }
    const now = new Date();
    return { dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
  }, [dateRange, globalDateFrom, globalDateTo]);

  // Container width
  const containerNodeRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNodeRef.current = node;
    if (node) setContainerWidth(node.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    const node = containerNodeRef.current;
    if (!node) return;
    let rafId: number;
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
    });
    ro.observe(node);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  // Widget CRUD
  const addWidget = useCallback((type?: string) => {
    const idx = widgets.length + 1;
    const newWidget = createEmptyKpiWidget(idx);
    const defaults = getDefaultDates();
    newWidget.config.dateFrom = defaults.dateFrom;
    newWidget.config.dateTo = defaults.dateTo;
    newWidget.config.granularity = globalGranularity as any;
    if (globalSplitBy !== 'none') {
      newWidget.config.splitBy = globalSplitBy as SplitDimension;
      newWidget.config.topN = globalTopN;
    }
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    newWidget.layout.y = maxY;
    // Set title based on type
    if (type === 'map') newWidget.config.title = `Map ${idx}`;
    else if (type === 'table') newWidget.config.title = `Table ${idx}`;
    else newWidget.config.title = `Graph ${idx}`;
    setWidgets(prev => [...prev, newWidget]);
    setSelectedWidgetId(newWidget.config.id);
  }, [widgets, getDefaultDates, globalGranularity, globalSplitBy, globalTopN]);

  const deleteWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.config.id !== id));
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  }, [selectedWidgetId]);

  const duplicateWidget = useCallback((id: string) => {
    const source = widgets.find(w => w.config.id === id);
    if (!source) return;
    const dup = duplicateKpiWidget(source);
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    dup.layout.y = maxY;
    setWidgets(prev => [...prev, dup]);
  }, [widgets]);

  const updateWidgetConfig = useCallback((id: string, updates: Partial<KpiWidgetConfig>) => {
    setWidgets(prev => prev.map(w =>
      w.config.id === id ? { ...w, config: { ...w.config, ...updates } } : w
    ));
  }, []);

  // Layout
  const layout = useMemo(() => widgets
    .filter(w => w.layout && typeof w.layout.x === 'number')
    .map(w => ({
      i: w.config.id,
      x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
      minW: 4, minH: 4,
    })), [widgets]);

  const onLayoutChange = useCallback((newLayout: any[]) => {
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === w.config.id);
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  }, []);

  // Period shortcut
  const applyPeriod = (value: string) => {
    const period = PERIODS.find(p => p.value === value);
    if (!period || !('days' in period)) return;
    setGlobalPeriod(value);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - period.days!);
    setGlobalDateFrom(format(start, 'yyyy-MM-dd'));
    setGlobalDateTo(format(end, 'yyyy-MM-dd'));
  };

  // Apply global settings to all widgets
  const handleApplyGlobal = () => {
    setWidgets(prev => prev.map(w => ({
      ...w,
      config: {
        ...w.config,
        dateFrom: globalDateFrom || w.config.dateFrom,
        dateTo: globalDateTo || w.config.dateTo,
        granularity: globalGranularity as any,
        ...(globalSplitBy !== 'none' ? { splitBy: globalSplitBy as SplitDimension, topN: globalTopN } : {}),
      },
    })));
    toast({ title: 'Configuration appliquée à tous les widgets' });
  };

  // Global filter management
  const addGlobalFilter = (dim: string, val: string) => {
    setGlobalFilters(prev => {
      const existing = prev[dim] || [];
      if (existing.includes(val)) return prev;
      return { ...prev, [dim]: [...existing, val] };
    });
  };

  const removeGlobalFilter = (dim: string, val: string) => {
    setGlobalFilters(prev => {
      const existing = (prev[dim] || []).filter(v => v !== val);
      const next = { ...prev };
      if (existing.length === 0) delete next[dim];
      else next[dim] = existing;
      return next;
    });
  };

  const globalFilterChips = Object.entries(globalFilters).flatMap(([dim, vals]) =>
    vals.map(val => ({ dim, val }))
  );

  // Convert globalFilters (Record<string, string[]>) to MonitorFilter[] for widget props
  const globalFiltersAsMonitor: import('./api/kpiMonitorApi').MonitorFilter[] = useMemo(() =>
    Object.entries(globalFilters)
      .filter(([, vals]) => vals.length > 0)
      .map(([dim, vals]) => ({ dimension: dim, op: 'IN' as const, values: vals })),
    [globalFilters]
  );

  // Dashboard management
  const handleCreateNew = () => { setNewDashName(''); setShowNameDialog(true); };
  const confirmCreate = () => {
    if (newDashName.trim()) {
      setWidgets([]);
      setSelectedWidgetId(null);
      dm.createNew(newDashName.trim());
      setShowNameDialog(false);
    }
  };

  const handleSave = async () => {
    const name = await dm.saveCurrent();
    if (name) toast({ title: `Dashboard "${name}" sauvegardé` });
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    try {
      await exportElementToPDF(dashboardRef.current, dm.activeTab?.name?.replace(/\s+/g, '_') || 'kpi_monitor');
      toast({ title: 'PDF exporté' });
    } catch {
      toast({ title: 'Erreur export', variant: 'destructive' });
    }
  };

  const startDate = globalDateFrom ? new Date(globalDateFrom) : undefined;
  const endDate = globalDateTo ? new Date(globalDateTo) : undefined;

  const selectedWidget = widgets.find(w => w.config.id === selectedWidgetId);

  // Compute main content width based on sidebar
  const showSidebar = selectedWidget != null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background text-foreground">
      {/* Tab Bar */}
      <DashboardTabBar
        tabs={dm.tabs}
        activeId={dm.activeTabId}
        onSelect={dm.setActiveTabId}
        onClose={dm.closeTab}
        onRename={dm.renameTab}
        onCreate={handleCreateNew}
        onSetColor={dm.setTabColor}
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        {/* Left: Dashboard info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground">
                {dm.activeTab?.name || 'Network'}
              </h1>
              <button className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description..."
                className="text-[11px] text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/40 w-[140px]"
              />
              <button
                onClick={() => setVisibility(v => v === 'public' ? 'private' : 'public')}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all",
                  visibility === 'public'
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/50 text-muted-foreground border-border/40"
                )}
              >
                {visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {visibility === 'public' ? 'Public' : 'Private'}
              </button>
            </div>
          </div>
        </div>

        {/* Center: Widget type buttons */}
        <div className="flex items-center gap-1">
          {[
            { type: 'chart', icon: Plus, label: 'Chart', prefix: <Plus className="w-3.5 h-3.5" /> },
            { type: 'map', icon: MapPin, label: 'Map' },
            { type: 'table', icon: Table2, label: 'Table' },
            { type: 'kpi', icon: Gauge, label: 'KPI' },
            { type: 'txt', icon: Type, label: 'Txt' },
            { type: 'img', icon: ImageIcon, label: 'Img' },
          ].map(btn => (
            <button
              key={btn.type}
              onClick={() => addWidget(btn.type)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              {btn.type === 'chart' ? <Plus className="w-3.5 h-3.5" /> : <btn.icon className="w-3.5 h-3.5" />}
              {btn.label}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <button onClick={() => setEditMode(!editMode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              !editMode ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <EyeIcon className="w-3.5 h-3.5" /> View
          </button>

          <button onClick={() => setShowAI(!showAI)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              showAI ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> AI
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleSave} className="gap-2 text-xs">
                <Save className="w-3.5 h-3.5" /> Sauvegarder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => dm.setShowList(true)} className="gap-2 text-xs">
                <LayoutGrid className="w-3.5 h-3.5" /> Gérer dashboards
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Toolbar (labeled sections with dropdowns) ── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-2.5">
          <div className="flex items-center gap-6 flex-wrap">
            {/* PLAGE DE DATES */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Plage de dates</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[130px] justify-start text-left text-xs font-medium h-[32px]', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setGlobalDateFrom(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[130px] justify-start text-left text-xs font-medium h-[32px]', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => d && setGlobalDateTo(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="h-8 w-px bg-border/60 shrink-0" />

            {/* PÉRIODE & GRANULARITÉ */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Période & Granularité</span>
              </div>
              <Select value={globalPeriod} onValueChange={applyPeriod}>
                <SelectTrigger className="h-[32px] w-[110px] text-xs">
                  <SelectValue placeholder="Période..." />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.filter(p => p.value).map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={globalGranularity} onValueChange={setGlobalGranularity}>
                <SelectTrigger className="h-[32px] w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANULARITIES.map(g => (
                    <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-8 w-px bg-border/60 shrink-0" />

            {/* SPLIT */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Split</span>
              </div>
              <Select value={globalSplitBy} onValueChange={v => setGlobalSplitBy(v as any)}>
                <SelectTrigger className="h-[32px] w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPLIT_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(globalTopN)} onValueChange={v => setGlobalTopN(Number(v))}>
                <SelectTrigger className="h-[32px] w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOP_N_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)} className="text-xs">Top {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-8 w-px bg-border/60 shrink-0" />

            {/* FILTRES */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Filtres</span>
              </div>
              <AddFilterDropdown existingKeys={Object.keys(globalFilters)} onAdd={addGlobalFilter} />
            </div>

            {/* APPLY BUTTON */}
            <button onClick={handleApplyGlobal}
              className="shrink-0 ml-auto flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity shadow-sm h-[32px]">
              <Check className="w-3.5 h-3.5" /> Appliquer
            </button>
          </div>
        </div>

        {/* ── Gradient separator ── */}
        <div className="mx-6 my-0.5">
          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>

        {/* Filter chips row */}
        {globalFilterChips.length > 0 && (
          <div className="max-w-[1600px] mx-auto px-6 pb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mr-1">Filtres actifs</span>
              {globalFilterChips.map(({ dim, val }) => (
                <span key={`${dim}-${val}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-primary/8 text-primary border border-primary/15 shadow-[0_1px_2px_hsl(var(--primary)/0.06)]">
                  <span className="text-muted-foreground">{dim}:</span>
                  <span className="font-bold">{val}</span>
                  <button onClick={() => removeGlobalFilter(dim, val)} className="ml-0.5 hover:text-destructive transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content + Sidebar ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main canvas */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 space-y-4">
            {/* ── Canvas ── */}
            <div ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }}>
              {widgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                  <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-12 h-12 text-primary/50" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-foreground">Dashboard vide</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Ajoutez des widgets pour monitorer vos KPIs. Utilisez les boutons + Chart, Map, Table ci-dessus.
                    </p>
                  </div>
                  <button onClick={() => addWidget('chart')}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
                    <Plus className="w-5 h-5" /> Créer un Widget
                  </button>
                </div>
              ) : viewMode === 'graph' ? (
                <GridLayout
                  className="layout"
                  layout={layout}
                  cols={COLS}
                  rowHeight={ROW_HEIGHT}
                  width={containerWidth}
                  onLayoutChange={onLayoutChange}
                  draggableHandle=".drag-handle"
                  compactType="vertical"
                  isResizable={editMode}
                  isDraggable={editMode}
                  margin={[16, 16]}
                >
                  {widgets.map(w => (
                    <div key={w.config.id}
                      className={cn(
                        "transition-all duration-200 rounded-xl",
                        selectedWidgetId === w.config.id && "ring-2 ring-primary shadow-lg shadow-primary/10"
                      )}
                    >
                      <KpiWidgetCard
                        config={w.config}
                        catalog={catalog}
                        catalogMap={catalogMap}
                        isSelected={selectedWidgetId === w.config.id}
                        editMode={editMode}
                        onSelect={() => setSelectedWidgetId(selectedWidgetId === w.config.id ? null : w.config.id)}
                        onDuplicate={() => duplicateWidget(w.config.id)}
                        onDelete={() => deleteWidget(w.config.id)}
                        onUpdateConfig={(updates) => updateWidgetConfig(w.config.id, updates)}
                        jalons={jalons}
                        parentFilters={globalFiltersAsMonitor}
                      />
                    </div>
                  ))}
                </GridLayout>
              ) : viewMode === 'table' ? (
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Table2 className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase">Table View</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez un widget et ouvrez sa configuration pour accéder aux données tabulaires.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase">Map View</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Vue cartographique disponible pour les KPIs supportant le mode map.
                  </p>
                </div>
              )}
            </div>

            {/* Add more button below grid */}
            {widgets.length > 0 && editMode && viewMode === 'graph' && (
              <button onClick={() => addWidget('chart')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all">
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            )}
          </div>
        </main>

        {/* Right Sidebar */}
        {showSidebar && selectedWidget && (
          <WidgetSidebarPanel
            widget={selectedWidget}
            catalog={catalog}
            catalogMap={catalogMap}
            onUpdate={(updates) => updateWidgetConfig(selectedWidget.config.id, updates)}
            onClose={() => setSelectedWidgetId(null)}
          />
        )}
      </div>

      {/* AI Modal */}
      <AIFloatingModal open={showAI} onClose={() => setShowAI(false)} />

      {/* Dashboard List */}
      {dm.showList && (
        <DashboardListPanel
          dashboards={dm.savedDashboards}
          openIds={dm.tabs.map(t => t.id)}
          onOpen={dm.openDashboard}
          onDelete={dm.deleteDashboard}
          onDuplicate={dm.duplicateDashboard}
          onCreate={handleCreateNew}
          onClose={() => dm.setShowList(false)}
          onExport={dm.exportDashboard}
          onExportAll={dm.exportAll}
          onImport={dm.importDashboards}
        />
      )}

      {/* New Dashboard Dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-[360px] shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-foreground">Nouveau Dashboard</h3>
            <input value={newDashName} onChange={e => setNewDashName(e.target.value)} placeholder="Nom du dashboard..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNameDialog(false)}>Annuler</Button>
              <Button size="sm" onClick={confirmCreate} disabled={!newDashName.trim()}>Créer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KPIMonitorPage;
