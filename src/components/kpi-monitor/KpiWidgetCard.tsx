// ── Independent KPI Widget Card ──────────────────────────────────────
import React, { useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/lib/utils';
import {
  BarChart3, Settings, Copy, Trash2, MoreHorizontal, RefreshCw,
  Download, Maximize2, ChevronDown, Plus, X, Pencil,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { KpiWidgetConfig } from './KpiWidgetTypes';
import type { KpiCatalogEntry } from './types';
import { useTimeseriesQuery, useSummaryQuery, type TimeseriesRequest, type MonitorFilter } from './api/kpiMonitorApi';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

interface Props {
  config: KpiWidgetConfig;
  catalogMap: Record<string, KpiCatalogEntry>;
  isSelected: boolean;
  editMode: boolean;
  onSelect: () => void;
  onConfigure: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUpdateConfig: (updates: Partial<KpiWidgetConfig>) => void;
}

const KpiWidgetCard: React.FC<Props> = ({
  config, catalogMap, isSelected, editMode,
  onSelect, onConfigure, onDuplicate, onDelete, onUpdateConfig,
}) => {
  const queryClient = useQueryClient();
  const [isHovered, setIsHovered] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(config.title);

  // Build filters for API
  const mergedFilters: MonitorFilter[] = useMemo(() =>
    config.filters.filter(f => f.values.length > 0).map(f => ({
      dimension: f.dimension, op: f.op, values: f.values,
    })), [config.filters]);

  // Timeseries request (per-widget, independent)
  const tsRequest: TimeseriesRequest | null = useMemo(() => {
    if (config.kpis.length === 0) return null;
    return {
      date_from: config.dateFrom,
      date_to: config.dateTo,
      granularity: config.granularity,
      filters: mergedFilters,
      selections: config.kpis.map(k => ({
        kpi_key: k.kpi_key,
        visualization: k.graphType || config.graphType || 'line',
        axis: k.axis,
      })),
      split_by: config.splitBy,
      top_n: config.topN,
    };
  }, [config]);

  const { data: tsResponse, isLoading } = useTimeseriesQuery(tsRequest);
  const tsData = tsResponse?.series || [];

  // Summary request (per-widget)
  const summaryRequest = useMemo(() => {
    if (config.kpis.length === 0) return null;
    return {
      date_from: config.dateFrom,
      date_to: config.dateTo,
      filters: mergedFilters,
      kpi_keys: config.kpis.map(k => k.kpi_key),
    };
  }, [config]);

  const { data: summaryItems } = useSummaryQuery(summaryRequest);

  // ECharts option
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

    return {
      animation: true,
      grid: { top: 30, right: 16, bottom: config.showLegend ? 50 : 24, left: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
        textStyle: { color: 'hsl(var(--foreground))', fontSize: 11 },
      },
      legend: config.showLegend ? {
        bottom: 0, left: 'center',
        textStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 10 },
        itemWidth: 12, itemHeight: 8,
      } : undefined,
      xAxis: {
        type: 'category',
        data: allTs,
        axisLabel: { fontSize: 9, color: 'hsl(var(--muted-foreground))', rotate: allTs.length > 20 ? 45 : 0,
          formatter: (v: string) => { try { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; } catch { return v; } },
        },
        axisLine: { lineStyle: { color: 'hsl(var(--border))' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 9, color: 'hsl(var(--muted-foreground))' },
        splitLine: { lineStyle: { color: 'hsl(var(--border))', opacity: 0.3 } },
      },
      series: seriesArr.map((s, i) => ({
        name: catalogMap[s.kpiKey]?.display_name || s.name,
        type: config.graphType === 'area' || config.graphType === 'stacked_area' ? 'line' : config.graphType === 'bar' ? 'bar' : 'line',
        data: allTs.map(t => s.points.get(t) ?? null),
        smooth: config.smooth,
        color: config.kpis.find(k => k.kpi_key === s.kpiKey)?.color || COLORS[i % COLORS.length],
        lineStyle: { width: 2 },
        showSymbol: false,
        areaStyle: (config.graphType === 'area' || config.graphType === 'stacked_area') ? { opacity: 0.15 } : undefined,
        stack: config.graphType === 'stacked_area' ? 'total' : undefined,
      })),
    };
  }, [tsData, config, catalogMap]);

  // KPI status color
  const statusColor = useMemo(() => {
    if (!summaryItems || summaryItems.length === 0) return 'border-border/40';
    const worstState = summaryItems.reduce((worst, item) => {
      if (item.threshold_state === 'critical') return 'critical';
      if (item.threshold_state === 'warning' && worst !== 'critical') return 'warning';
      return worst;
    }, 'normal' as string);
    if (worstState === 'critical') return 'border-red-500/60';
    if (worstState === 'warning') return 'border-amber-500/60';
    return 'border-emerald-500/40';
  }, [summaryItems]);

  const kpiSummary = config.kpis.map(k => catalogMap[k.kpi_key]?.display_name || k.kpi_key).join(', ') || 'Aucun KPI';

  const commitTitle = () => {
    if (titleValue.trim()) onUpdateConfig({ title: titleValue.trim() });
    setEditingTitle(false);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border-2 bg-card h-full',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
        'transition-all duration-200',
        statusColor,
        isSelected && 'ring-2 ring-primary shadow-lg shadow-primary/10',
      )}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between px-3 py-2 border-b border-border/30", editMode && "drag-handle cursor-grab")}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
          {editingTitle ? (
            <input
              className="text-[12px] font-semibold text-foreground bg-transparent border-b border-primary outline-none w-full"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-[12px] font-semibold text-foreground truncate cursor-text hover:text-primary transition-colors"
              onClick={e => { e.stopPropagation(); setEditingTitle(true); setTitleValue(config.title); }}
            >
              {config.title}
            </span>
          )}
        </div>

        <div className={cn('flex items-center gap-0.5 transition-opacity', isHovered ? 'opacity-100' : 'opacity-0')}
          onMouseDown={e => e.stopPropagation()}
        >
          <button onClick={e => { e.stopPropagation(); onConfigure(); }}
            className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Configure"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={e => e.stopPropagation()} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onConfigure(); }} className="gap-2 text-xs">
                <Settings className="w-3.5 h-3.5" /> Configurer
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

      {/* KPI Summary badges */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b border-border/20">
        {config.kpis.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/50 italic">Aucun KPI sélectionné</span>
        ) : config.kpis.slice(0, 3).map(k => {
          const cat = catalogMap[k.kpi_key];
          const state = summaryItems?.find(s => s.kpi_key === k.kpi_key)?.threshold_state;
          return (
            <span key={k.kpi_key} className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border",
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
        {config.kpis.length > 3 && (
          <span className="text-[9px] text-muted-foreground font-medium">+{config.kpis.length - 3}</span>
        )}
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-1 py-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Chargement...</span>
            </div>
          </div>
        ) : config.kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <span className="text-[11px] text-muted-foreground/50">Cliquez ⚙️ pour configurer</span>
            <button
              onClick={e => { e.stopPropagation(); onConfigure(); }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              + Ajouter des KPIs
            </button>
          </div>
        ) : chartOption ? (
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">Pas de données</div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/20">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/60 font-medium">
            {config.dateFrom} → {config.dateTo}
          </span>
          {config.splitBy && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-medium">
              Split: {config.splitBy}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {config.filters.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
              {config.filters.length} filtre{config.filters.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground/50 uppercase font-medium">
            {config.granularity === 'auto' ? 'Auto' : config.granularity}
          </span>
        </div>
      </div>
    </div>
  );
};

export default KpiWidgetCard;
