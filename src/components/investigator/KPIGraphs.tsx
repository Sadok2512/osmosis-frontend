import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType } from './types';
import { KPI_MAP, KPIS } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { cn } from '@/lib/utils';
import { Settings2, TrendingUp, AreaChart, BarChart, CircleDot, X, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

interface Props {
  graphSlots: GraphSlot[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
  onChangeSlotKpi: (slotId: string, kpiId: string) => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onOpenKpiSelector: (slotId: string) => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
}

const KPIGraphs: React.FC<Props> = ({ graphSlots, data, layout, onChangeSlotKpi, onRemoveSlot, onUpdateSlotConfig, onOpenKpiSelector, activeSlotId, onSlotClick }) => {
  const cols = layout === 1 ? 1 : 2;
  const chartHeight = layout === 1 ? 400 : layout === 4 ? 220 : 280;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);

  useEffect(() => {
    fetchKpiDefinitions().then(k => { if (k.length > 0) setAllKpis(k); }).catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const def = KPI_MAP[slot.kpiId] || allKpis.find(k => k.id === slot.kpiId);
        if (!def) return null;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const kpiData = data.filter(d => d.kpi === slot.kpiId);
        const timestamps = kpiData.map(d => d.timestamp);
        const values = kpiData.map(d => d.value);

        const seriesType = cfg.chartType === 'scatter' ? 'scatter' : cfg.chartType === 'bar' ? 'bar' : 'line';

        const option = {
          animation: true,
          grid: { top: 40, right: 20, bottom: 36, left: 56 },
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f8fafc', fontSize: 11 },
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              if (!p) return '';
              const dt = new Date(p.axisValue);
              return `<div style="font-size:10px;color:#94a3b8;margin-bottom:4px">${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${def.color}"></span><b>${p.value?.toFixed(2)} ${def.unit}</b></div>`;
            },
          },
          xAxis: {
            type: 'category' as const,
            data: timestamps,
            axisLabel: {
              formatter: (v: string) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
              fontSize: 9,
              color: '#9ca3af',
            },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
            axisTick: { show: false },
          },
          yAxis: {
            type: 'value' as const,
            axisLabel: { fontSize: 9, color: '#9ca3af', formatter: (v: number) => `${v.toFixed(1)}` },
            splitLine: {
              show: cfg.showGrid,
              lineStyle: { color: 'rgba(128,128,128,0.12)', type: 'dashed' as const },
            },
          },
          series: [{
            type: seriesType as any,
            data: values,
            smooth: cfg.smooth,
            symbol: cfg.showSymbols ? 'circle' : 'none',
            symbolSize: cfg.showSymbols ? 5 : 0,
            lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color: def.color } : undefined,
            itemStyle: { color: def.color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
            barMaxWidth: 20,
            areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
              color: {
                type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${def.color}20` },
                  { offset: 1, color: `${def.color}02` },
                ],
              },
            } : undefined,
            markLine: cfg.showThresholds ? {
              silent: true,
              data: [
                { yAxis: def.thresholds.warning, lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1 }, label: { show: false } },
                { yAxis: def.thresholds.critical, lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 }, label: { show: false } },
              ],
            } : undefined,
          }],
        };

        const isActive = activeSlotId === slot.id;
        return (
          <div
            key={slot.id}
            onClick={(e) => {
              // Don't select when clicking inside popovers or buttons
              const target = e.target as HTMLElement;
              if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
              onSlotClick?.(slot.id);
            }}
            className={cn(
              'rounded-xl border bg-card p-4 group relative cursor-pointer transition-all duration-300',
              isActive
                ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5'
                : 'border-border/60 hover:border-border'
            )}
          >
            {/* Header with config popover */}
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: def.color }} />
                <span className="text-xs font-bold text-foreground truncate max-w-[200px]">{def.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium ml-auto mr-1">{def.unit}</span>

              {/* Remove button */}
              {graphSlots.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Config popover on the widget */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-3 space-y-3 z-50" align="end" side="bottom">
                  {/* KPI Name & Change */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: def.color }} />
                      <span className="text-xs font-bold text-foreground truncate max-w-[130px]">{def.label}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => onOpenKpiSelector(slot.id)}
                    >
                      Change KPI
                    </Button>
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Chart Type */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Chart Type</span>
                    <div className="flex gap-1">
                      {CHART_TYPES.map(ct => (
                        <button
                          key={ct.value}
                          onClick={() => onUpdateSlotConfig(slot.id, { chartType: ct.value })}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                            cfg.chartType === ct.value
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                          )}
                        >
                          <ct.icon className="w-3 h-3" />
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Smooth */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Smooth Curve</span>
                    <Switch checked={cfg.smooth} onCheckedChange={v => onUpdateSlotConfig(slot.id, { smooth: v })} className="scale-75" />
                  </div>

                  {/* Line Width */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground">Line Width</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{cfg.lineWidth}px</span>
                    </div>
                    <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="w-full" />
                  </div>

                  {/* Toggles */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Show Markers</span>
                    <Switch checked={cfg.showSymbols} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showSymbols: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Area Fill</span>
                    <Switch checked={cfg.showArea} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showArea: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Thresholds</span>
                    <Switch checked={cfg.showThresholds} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showThresholds: v })} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
                    <Switch checked={cfg.showGrid} onCheckedChange={v => onUpdateSlotConfig(slot.id, { showGrid: v })} className="scale-75" />
                  </div>

                  <div className="h-px bg-border/60" />

                  {/* Remove */}
                  {graphSlots.length > 1 && (
                    <button
                      onClick={() => onRemoveSlot(slot.id)}
                      className="w-full text-[10px] font-semibold text-destructive hover:bg-destructive/10 py-1.5 rounded-md transition-colors"
                    >
                      Remove this KPI
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <ReactECharts option={option} style={{ height: chartHeight }} />
          </div>
        );
      })}
      {/* Small Add button */}
      {graphSlots.length < 4 && (
        <button
          onClick={() => onOpenKpiSelector('new')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      )}
    </div>
  );
};

export default KPIGraphs;
