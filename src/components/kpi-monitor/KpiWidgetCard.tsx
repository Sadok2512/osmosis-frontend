// ── Independent KPI Widget Card with Inline Config ──────────────────
import React, { useMemo, useState, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/lib/utils';
import {
  BarChart3, Settings, Copy, Trash2, MoreHorizontal, RefreshCw,
  ChevronDown, ChevronUp, Plus, X, Pencil, Calendar, Filter,
  GitBranch, Search, Check, TrendingUp, AreaChart, Layers2,
  Loader2, Download, Maximize2, Image,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { KpiWidgetConfig } from './KpiWidgetTypes';
import type { KpiCatalogEntry, SplitDimension, Granularity } from './types';
import { useTimeseriesQuery, useSummaryQuery, fetchDimensionValues, type TimeseriesRequest, type MonitorFilter } from './api/kpiMonitorApi';
import { FILTER_DIMENSIONS, resolveAvailableValues } from '@/config/filterDimensions';
import { exportElementToPNG, exportElementToPDF } from '@/lib/exportUtils';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

const PERIOD_PRESETS = [
  { value: '24h', label: '24h', days: 1 },
  { value: '7d', label: '7j', days: 7 },
  { value: '14d', label: '14j', days: 14 },
  { value: '30d', label: '30j', days: 30 },
  { value: '90d', label: '90j', days: 90 },
] as const;

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1j' },
  { value: '1w', label: '1s' },
] as const;

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const GRAPH_TYPES = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'stacked_area', label: 'Stack', icon: Layers2 },
] as const;

interface Jalon {
  id: string;
  date: string;
  label: string;
  color: string;
}

interface Props {
  config: KpiWidgetConfig;
  catalog: KpiCatalogEntry[];
  catalogMap: Record<string, KpiCatalogEntry>;
  isSelected: boolean;
  editMode: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUpdateConfig: (updates: Partial<KpiWidgetConfig>) => void;
  jalons?: Jalon[];
}

const KpiWidgetCard: React.FC<Props> = ({
  config, catalog, catalogMap, isSelected, editMode,
  onSelect, onDuplicate, onDelete, onUpdateConfig,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(config.title);
  const [configExpanded, setConfigExpanded] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // ── API: per-widget data fetching ──
  const mergedFilters: MonitorFilter[] = useMemo(() =>
    config.filters.filter(f => f.values.length > 0).map(f => ({
      dimension: f.dimension, op: f.op, values: f.values,
    })), [config.filters]);

  const tsRequest: TimeseriesRequest | null = useMemo(() => {
    if (config.kpis.length === 0) return null;
    return {
      date_from: config.dateFrom, date_to: config.dateTo,
      granularity: config.granularity,
      filters: mergedFilters,
      selections: config.kpis.map(k => ({
        kpi_key: k.kpi_key,
        visualization: k.graphType || config.graphType || 'line',
        axis: k.axis,
      })),
      split_by: config.splitBy, top_n: config.topN,
    };
  }, [config, mergedFilters]);

  const { data: tsResponse, isLoading, refetch } = useTimeseriesQuery(tsRequest);
  const tsData = tsResponse?.series || [];

  const summaryRequest = useMemo(() => {
    if (config.kpis.length === 0) return null;
    return {
      date_from: config.dateFrom, date_to: config.dateTo,
      filters: mergedFilters,
      kpi_keys: config.kpis.map(k => k.kpi_key),
    };
  }, [config, mergedFilters]);

  const { data: summaryItems } = useSummaryQuery(summaryRequest);

  // ── ECharts ──
  const chartOption = useMemo(() => {
    if (tsData.length === 0) return null;
    const seriesMap = new Map<string, { kpiKey: string; name: string; points: Map<string, number> }>();
    for (const pt of tsData) {
      const name = pt.split_value === 'ALL' ? pt.kpi_key : `${pt.kpi_key} — ${pt.split_value}`;
      if (!seriesMap.has(name)) seriesMap.set(name, { kpiKey: pt.kpi_key, name, points: new Map() });
      seriesMap.get(name)!.points.set(pt.ts, pt.value);
    }
    const allTs = [...new Set(tsData.map(d => d.ts))].sort();
    const seriesArr = [...seriesMap.values()];

    // Weekend shading
    const weekendAreas: any[] = [];
    for (let i = 0; i < allTs.length; i++) {
      const d = new Date(allTs[i]);
      const day = d.getUTCDay();
      if (day === 0 || day === 6) {
        weekendAreas.push([
          { xAxis: allTs[i], itemStyle: { color: 'rgba(148,163,184,0.08)' } },
          { xAxis: allTs[i] },
        ]);
      }
    }
    // Merge consecutive weekends
    const merged: any[] = [];
    for (const area of weekendAreas) {
      const last = merged[merged.length - 1];
      if (last) {
        const lastIdx = allTs.indexOf(last[1].xAxis);
        const curIdx = allTs.indexOf(area[0].xAxis);
        if (curIdx === lastIdx + 1) { last[1].xAxis = area[1].xAxis; continue; }
      }
      merged.push([...area]);
    }

    return {
      animation: true,
      grid: { top: 24, right: 16, bottom: config.showLegend ? 40 : 20, left: 48 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#f8fafc', fontSize: 10 },
      },
      legend: config.showLegend ? {
        bottom: 0, left: 'center',
        textStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 9 },
        itemWidth: 10, itemHeight: 6, icon: 'circle',
      } : undefined,
      xAxis: {
        type: 'category', data: allTs,
        axisLabel: {
          fontSize: 8, color: 'hsl(var(--muted-foreground))',
          rotate: allTs.length > 20 ? 45 : 0,
          formatter: (v: string) => {
            try { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; } catch { return v; }
          },
        },
        axisLine: { lineStyle: { color: 'hsl(var(--border))' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 8, color: 'hsl(var(--muted-foreground))',
          formatter: (v: number) => {
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
            if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
            return v % 1 === 0 ? v.toString() : v.toFixed(2);
          },
        },
        splitLine: { lineStyle: { color: 'hsl(var(--border))', opacity: 0.2, type: 'dashed' } },
      },
      series: seriesArr.map((s, i) => {
        const isArea = config.graphType === 'area' || config.graphType === 'stacked_area';
        const isBar = config.graphType === 'bar';
        const color = config.kpis.find(k => k.kpi_key === s.kpiKey)?.color || COLORS[i % COLORS.length];
        return {
          name: catalogMap[s.kpiKey]?.display_name || s.name,
          type: isBar ? 'bar' : 'line',
          data: allTs.map(t => s.points.get(t) ?? null),
          smooth: config.smooth,
          color,
          lineStyle: { width: 2 },
          showSymbol: false,
          areaStyle: isArea ? { opacity: 0.12 } : undefined,
          stack: config.graphType === 'stacked_area' ? 'total' : undefined,
          barMaxWidth: 16,
          itemStyle: isBar ? { borderRadius: [3, 3, 0, 0] } : undefined,
          markArea: i === 0 && merged.length > 0 ? { silent: true, data: merged } : undefined,
        };
      }),
    };
  }, [tsData, config, catalogMap]);

  // ── Status color ──
  const statusColor = useMemo(() => {
    if (!summaryItems || summaryItems.length === 0) return 'border-border/40';
    const worst = summaryItems.reduce((w, item) => {
      if (item.threshold_state === 'critical') return 'critical';
      if (item.threshold_state === 'warning' && w !== 'critical') return 'warning';
      return w;
    }, 'normal' as string);
    if (worst === 'critical') return 'border-red-500/60';
    if (worst === 'warning') return 'border-amber-500/60';
    return 'border-emerald-500/40';
  }, [summaryItems]);

  // ── Inline config helpers ──
  const applyPreset = (days: number, preset: string) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    onUpdateConfig({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
      periodPreset: preset as any,
    });
  };

  const toggleKpi = (key: string) => {
    if (config.kpis.some(k => k.kpi_key === key)) {
      onUpdateConfig({ kpis: config.kpis.filter(k => k.kpi_key !== key) });
    } else {
      const cat = catalogMap[key];
      onUpdateConfig({
        kpis: [...config.kpis, {
          kpi_key: key, agg: (cat?.default_agg as any) || 'avg', axis: 'left', color: undefined,
        }],
      });
    }
  };

  const addFilter = (dimension: string) => {
    onUpdateConfig({
      filters: [...config.filters, { id: `f_${Date.now()}`, dimension, op: 'IN' as const, values: [] }],
    });
  };

  const removeFilter = (id: string) => {
    onUpdateConfig({ filters: config.filters.filter(f => f.id !== id) });
  };

  const commitTitle = () => {
    if (titleValue.trim()) onUpdateConfig({ title: titleValue.trim() });
    setEditingTitle(false);
  };

  const handleExportPNG = async () => {
    if (!chartRef.current) return;
    await exportElementToPNG(chartRef.current, config.title.replace(/\s+/g, '_'));
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border-2 bg-card h-full overflow-hidden',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
        'transition-all duration-200',
        statusColor,
        isSelected && 'ring-2 ring-primary shadow-lg shadow-primary/10',
      )}
      onClick={onSelect}
    >
      {/* ── Header ── */}
      <div className={cn("flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0", editMode && "drag-handle cursor-grab")}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
          {editingTitle ? (
            <input
              className="text-[11px] font-semibold text-foreground bg-transparent border-b border-primary outline-none w-full"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-[11px] font-semibold text-foreground truncate cursor-text hover:text-primary transition-colors"
              onClick={e => { e.stopPropagation(); setEditingTitle(true); setTitleValue(config.title); }}
            >
              {config.title}
            </span>
          )}

          {/* KPI count badge */}
          {config.kpis.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold shrink-0">
              {config.kpis.length} KPI{config.kpis.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0" onMouseDown={e => e.stopPropagation()}>
          {/* Toggle inline config */}
          <button
            onClick={e => { e.stopPropagation(); setConfigExpanded(!configExpanded); }}
            className={cn(
              "p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors",
              configExpanded && "bg-primary/10 text-primary"
            )}
            title="Configuration"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={e => { e.stopPropagation(); refetch(); }}
            className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={e => e.stopPropagation()} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setConfigExpanded(true); }} className="gap-2 text-xs">
                <Settings className="w-3.5 h-3.5" /> Configurer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); handleExportPNG(); }} className="gap-2 text-xs">
                <Image className="w-3.5 h-3.5" /> Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onDuplicate(); }} className="gap-2 text-xs">
                <Copy className="w-3.5 h-3.5" /> Dupliquer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onDelete(); }} className="gap-2 text-xs text-destructive focus:text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Inline Configuration Bar ── */}
      {configExpanded && (
        <div className="shrink-0 border-b border-border/30 bg-muted/20 px-3 py-2 space-y-2 overflow-y-auto max-h-[50%]" onClick={e => e.stopPropagation()}>
          {/* Row 1: Period presets + dates */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
            {PERIOD_PRESETS.map(p => (
              <button key={p.value} onClick={() => applyPreset(p.days, p.value)}
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-semibold transition-all",
                  config.periodPreset === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >{p.label}</button>
            ))}
            <span className="text-[9px] text-muted-foreground/50 mx-0.5">|</span>
            <input type="date" value={config.dateFrom}
              onChange={e => onUpdateConfig({ dateFrom: e.target.value, periodPreset: 'custom' })}
              className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-[9px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 w-[100px]"
            />
            <span className="text-[9px] text-muted-foreground">→</span>
            <input type="date" value={config.dateTo}
              onChange={e => onUpdateConfig({ dateTo: e.target.value, periodPreset: 'custom' })}
              className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-[9px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 w-[100px]"
            />
          </div>

          {/* Row 2: Granularity + Graph type + Split */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {GRANULARITIES.map(g => (
              <button key={g.value} onClick={() => onUpdateConfig({ granularity: g.value as any })}
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-semibold transition-all",
                  config.granularity === g.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
              >{g.label}</button>
            ))}
            <span className="text-[9px] text-muted-foreground/50 mx-0.5">|</span>
            {GRAPH_TYPES.map(g => (
              <button key={g.value} onClick={() => onUpdateConfig({ graphType: g.value })}
                className={cn(
                  "p-1 rounded transition-all",
                  config.graphType === g.value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={g.label}
              >
                <g.icon className="w-3 h-3" />
              </button>
            ))}
            <span className="text-[9px] text-muted-foreground/50 mx-0.5">|</span>
            <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
            <Select value={config.splitBy || 'none'} onValueChange={v => onUpdateConfig({ splitBy: v === 'none' ? null : v as SplitDimension })}>
              <SelectTrigger className="h-5 w-[90px] text-[9px] border-border/60 px-1.5 py-0">
                <SelectValue placeholder="Split" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Aucun</SelectItem>
                {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {config.splitBy && (
              <Select value={String(config.topN)} onValueChange={v => onUpdateConfig({ topN: Number(v) })}>
                <SelectTrigger className="h-5 w-[50px] text-[9px] border-border/60 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 15, 20].map(n => <SelectItem key={n} value={String(n)} className="text-xs">Top {n}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Row 3: KPI selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">KPIs:</span>
            {config.kpis.map(k => {
              const cat = catalogMap[k.kpi_key];
              return (
                <span key={k.kpi_key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold">
                  {cat?.display_name || k.kpi_key}
                  <button onClick={() => toggleKpi(k.kpi_key)} className="hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
            <KpiSelectorPopover catalog={catalog} catalogMap={catalogMap} selectedKeys={config.kpis.map(k => k.kpi_key)} onToggle={toggleKpi} />
          </div>

          {/* Row 4: Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
            {config.filters.map(f => (
              <InlineFilterChip key={f.id} filter={f} allFilters={config.filters}
                onUpdate={updates => onUpdateConfig({
                  filters: config.filters.map(ff => ff.id === f.id ? { ...ff, ...updates } : ff),
                })}
                onRemove={() => removeFilter(f.id)}
              />
            ))}
            <Select onValueChange={v => addFilter(v)}>
              <SelectTrigger className="h-5 w-auto text-[9px] border-dashed gap-0.5 px-1.5 py-0">
                <Plus className="w-2.5 h-2.5" /> Filtre
              </SelectTrigger>
              <SelectContent>
                {FILTER_DIMENSIONS.map(d => (
                  <SelectItem key={d.key} value={d.key} className="text-xs">{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── Quick info bar (when config collapsed) ── */}
      {!configExpanded && config.kpis.length > 0 && (
        <div className="shrink-0 px-3 py-1 flex items-center gap-1.5 overflow-x-auto border-b border-border/20">
          {config.kpis.slice(0, 3).map(k => {
            const cat = catalogMap[k.kpi_key];
            const state = summaryItems?.find(s => s.kpi_key === k.kpi_key)?.threshold_state;
            return (
              <span key={k.kpi_key} className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold border",
                state === 'critical' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                state === 'warning' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full",
                  state === 'critical' ? 'bg-red-500' : state === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                )} />
                {cat?.display_name || k.kpi_key}
              </span>
            );
          })}
          {config.kpis.length > 3 && <span className="text-[8px] text-muted-foreground">+{config.kpis.length - 3}</span>}
        </div>
      )}

      {/* ── Chart area ── */}
      <div ref={chartRef} className="flex-1 min-h-0 px-1 py-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
          </div>
        ) : config.kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-muted-foreground/30" />
            </div>
            <span className="text-[10px] text-muted-foreground/50">Sélectionnez un KPI</span>
            <button
              onClick={e => { e.stopPropagation(); setConfigExpanded(true); }}
              className="text-[9px] font-medium text-primary hover:underline"
            >
              + Configurer ce widget
            </button>
          </div>
        ) : chartOption ? (
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/40">Pas de données</div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border/20 shrink-0">
        <span className="text-[8px] text-muted-foreground/60 font-medium">
          {config.dateFrom} → {config.dateTo}
        </span>
        <div className="flex items-center gap-1.5">
          {config.filters.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
              {config.filters.length} filtre{config.filters.length > 1 ? 's' : ''}
            </span>
          )}
          {config.splitBy && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-medium">
              {config.splitBy}
            </span>
          )}
          <span className="text-[8px] text-muted-foreground/50 uppercase font-medium">
            {config.granularity === 'auto' ? 'Auto' : config.granularity}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ── KPI Selector Popover ── */
const KpiSelectorPopover: React.FC<{
  catalog: KpiCatalogEntry[];
  catalogMap: Record<string, KpiCatalogEntry>;
  selectedKeys: string[];
  onToggle: (key: string) => void;
}> = ({ catalog, catalogMap, selectedKeys, onToggle }) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(k => k.display_name.toLowerCase().includes(q) || k.kpi_key.toLowerCase().includes(q));
  }, [catalog, search]);

  const grouped = useMemo(() => {
    const g: Record<string, KpiCatalogEntry[]> = {};
    for (const e of filtered) {
      const c = e.category || 'Autres';
      if (!g[c]) g[c] = [];
      g[c].push(e);
    }
    return g;
  }, [filtered]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-border/60 text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
          <Plus className="w-2.5 h-2.5" /> KPI
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="w-full pl-7 pr-2 py-1 rounded border border-border/60 bg-background text-[10px] outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
          {Object.entries(grouped).map(([cat, entries]) => (
            <div key={cat}>
              <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">{cat}</div>
              {entries.map(e => {
                const sel = selectedKeys.includes(e.kpi_key);
                return (
                  <button key={e.kpi_key} onClick={() => onToggle(e.kpi_key)}
                    className={cn("w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-left transition-all",
                      sel ? "bg-primary/8 font-medium text-foreground" : "hover:bg-muted/60 text-muted-foreground"
                    )}
                  >
                    <div className={cn("w-3 h-3 rounded flex items-center justify-center shrink-0 border",
                      sel ? "bg-primary border-primary" : "border-border/80 bg-background"
                    )}>
                      {sel && <Check className="w-2 h-2 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{e.display_name}</span>
                    {e.unit && <span className="text-[8px] text-muted-foreground/50 ml-auto">{e.unit}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-[9px] text-muted-foreground/50 text-center py-3 italic">Aucun KPI trouvé</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Inline Filter Chip ── */
const InlineFilterChip: React.FC<{
  filter: { id: string; dimension: string; op: string; values: string[] };
  allFilters: any[];
  onUpdate: (updates: any) => void;
  onRemove: () => void;
}> = ({ filter, allFilters, onUpdate, onRemove }) => {
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const staticValues = useMemo(() => resolveAvailableValues(filter.dimension, allFilters), [filter.dimension, allFilters]);
  const [backendValues, setBackendValues] = React.useState<string[]>([]);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    const dimMap: Record<string, string> = {
      dor: 'DOR', constructeur: 'Vendor', plaque: 'Plaque', site: 'Site', cell: 'Cell',
      zone_arcep: 'ARCEP', techno: 'TECHNO', vendor: 'Vendor', bande: 'BAND',
    };
    fetchDimensionValues(dimMap[filter.dimension] || filter.dimension)
      .then(d => { if (d.values) setBackendValues(d.values); }).catch(() => {});
  }, [filter.dimension]);

  const values = backendValues.length > 0 ? backendValues : staticValues;
  const filtered = values.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  const toggleValue = (val: string) => {
    const next = filter.values.includes(val) ? filter.values.filter((v: string) => v !== val) : [...filter.values, val];
    onUpdate({ values: next });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[9px] font-semibold text-foreground cursor-pointer hover:bg-muted transition-colors">
          {dim?.label || filter.dimension}
          {filter.values.length > 0 && (
            <span className="px-1 rounded-full bg-primary/15 text-primary text-[8px] font-bold">{filter.values.length}</span>
          )}
          <button onClick={e => { e.stopPropagation(); onRemove(); }} className="hover:text-destructive ml-0.5">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          className="w-full px-2 py-1 rounded border border-border/60 bg-background text-[10px] outline-none mb-1.5"
        />
        <div className="max-h-[160px] overflow-y-auto space-y-0.5">
          {filtered.map(v => (
            <button key={v} onClick={() => toggleValue(v)}
              className={cn("w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-left transition-all",
                filter.values.includes(v) ? "bg-primary/8 font-medium" : "hover:bg-muted/60"
              )}
            >
              <div className={cn("w-3 h-3 rounded flex items-center justify-center shrink-0 border",
                filter.values.includes(v) ? "bg-primary border-primary" : "border-border/80 bg-background"
              )}>
                {filter.values.includes(v) && <Check className="w-2 h-2 text-primary-foreground" />}
              </div>
              <span className="truncate">{v}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default KpiWidgetCard;
