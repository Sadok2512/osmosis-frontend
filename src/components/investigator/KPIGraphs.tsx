import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG, ChartType, Jalon } from './types';
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

const SERIES_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'];

interface Props {
  graphSlots: GraphSlot[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
  jalons: Jalon[];
  onChangeSlotKpi: (slotId: string, kpiId: string) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddEmptySlot: () => void;
  onUpdateSlotConfig: (slotId: string, config: Partial<GraphConfig>) => void;
  onRenameSlot: (slotId: string, name: string) => void;
  onOpenKpiSelector: (slotId: string) => void;
  activeSlotId?: string | null;
  onSlotClick?: (slotId: string) => void;
}

const KPIGraphs: React.FC<Props> = ({ graphSlots, data, layout, jalons, onChangeSlotKpi, onRemoveSlot, onAddEmptySlot, onUpdateSlotConfig, onRenameSlot, onOpenKpiSelector, activeSlotId, onSlotClick }) => {
  const cols = layout === 1 ? 1 : 2;
  const chartHeight = layout === 1 ? 480 : layout === 4 ? 300 : 360;
  const [allKpis, setAllKpis] = useState<KpiDefinition[]>(KPIS);

  useEffect(() => {
    fetchKpiDefinitions().then(k => { if (k.length > 0) setAllKpis(k); }).catch(() => {});
  }, []);

  const getDef = (kpiId: string) => KPI_MAP[kpiId] || allKpis.find(k => k.id === kpiId) || null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {graphSlots.map(slot => {
        const kpiIds = slot.kpiIds || [];
        const isEmpty = kpiIds.length === 0;
        const cfg: GraphConfig = slot.config || DEFAULT_GRAPH_CONFIG;
        const isActive = activeSlotId === slot.id;

        // Empty slot — no KPI assigned yet
        if (isEmpty) {
          return (
            <div
              key={slot.id}
              onClick={() => onSlotClick?.(slot.id)}
              className={cn(
                'rounded-xl border bg-card p-4 group relative cursor-pointer transition-all duration-300 flex flex-col',
                isActive
                  ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5'
                  : 'border-border/60 hover:border-border'
              )}
            >
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <input
                  value={slot.name}
                  onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-bold text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[140px] truncate"
                />
                <span className="ml-auto" />
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ minHeight: chartHeight - 40 }}>
                <div className="text-muted-foreground/40">
                  <BarChart className="w-8 h-8" />
                </div>
                <p className="text-[10px] text-muted-foreground">Aucun KPI sélectionné</p>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }}
                  className="px-3 py-1 rounded-md text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  Choisir un KPI
                </button>
              </div>
            </div>
          );
        }

        // Multi-KPI: build series — detect split data
        const defs = kpiIds.map((id, i) => {
          const d = getDef(id);
          return d || { id, label: id, unit: '', color: SERIES_COLORS[i % SERIES_COLORS.length], thresholds: { warning: 50, critical: 20 }, higherIsBetter: false };
        });

        // Check if data contains split values
        const hasSplit = data.some(d => d.splitValue && d.splitValue !== 'ALL');

        // Collect all unique timestamps across all KPIs
        const allTimestamps = [...new Set(kpiIds.flatMap(id => data.filter(d => d.kpi === id).map(d => d.timestamp)))].sort();

        const seriesType = cfg.chartType === 'scatter' ? 'scatter' : cfg.chartType === 'bar' ? 'bar' : 'line';

        let series: any[];

        if (hasSplit) {
          // Build one series per kpiId × splitValue combination
          let colorIdx = 0;
          series = kpiIds.flatMap((kpiId, ki) => {
            const def = defs[ki];
            const kpiData = data.filter(d => d.kpi === kpiId && d.splitValue);
            const splitValues = [...new Set(kpiData.map(d => d.splitValue!))];

            return splitValues.map(sv => {
              const color = SERIES_COLORS[colorIdx++ % SERIES_COLORS.length];
              const svData = kpiData.filter(d => d.splitValue === sv);
              const dataMap = new Map(svData.map(d => [d.timestamp, d.value]));
              const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);
              const seriesName = kpiIds.length > 1 ? `${def.label} — ${sv}` : sv;

              return {
                name: seriesName,
                type: seriesType as any,
                data: values,
                smooth: cfg.smooth,
                symbol: cfg.showSymbols ? 'circle' : 'none',
                symbolSize: cfg.showSymbols ? 5 : 0,
                lineStyle: seriesType === 'line' ? { width: cfg.lineWidth, color } : undefined,
                itemStyle: { color, borderRadius: seriesType === 'bar' ? [3, 3, 0, 0] : undefined },
                barMaxWidth: 20,
                areaStyle: (seriesType === 'line' && (cfg.showArea || cfg.chartType === 'area')) ? {
                  color: {
                    type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: `${color}20` },
                      { offset: 1, color: `${color}02` },
                    ],
                  },
                } : undefined,
              };
            });
          });
        } else {
          // No split — one series per KPI (original logic)
          series = kpiIds.map((kpiId, i) => {
            const def = defs[i];
            const kpiData = data.filter(d => d.kpi === kpiId);
            const dataMap = new Map(kpiData.map(d => [d.timestamp, d.value]));
            const values = allTimestamps.map(ts => dataMap.get(ts) ?? null);

            return {
              name: def.label,
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
            };
          });
        }

        // Build markLine data for jalons
        const markLineData = jalons
          .filter(j => allTimestamps.includes(j.date) || true) // show all jalons
          .map(j => ({
            xAxis: j.date,
            label: {
              show: true,
              formatter: j.label,
              fontSize: 9,
              fontWeight: 'bold' as const,
              color: j.color,
              position: 'insideEndTop' as const,
            },
            lineStyle: {
              color: j.color,
              width: 2,
              type: 'dashed' as const,
            },
          }));

        // Weekend highlighting — build markArea data
        const weekendAreas: { xAxis: string }[][] = [];
        let inWeekend = false;
        for (let ti = 0; ti < allTimestamps.length; ti++) {
          const day = new Date(allTimestamps[ti]).getDay(); // 0=Sun, 6=Sat
          const isWE = day === 0 || day === 6;
          if (isWE && !inWeekend) {
            weekendAreas.push([{ xAxis: allTimestamps[ti] }, { xAxis: allTimestamps[ti] }]);
            inWeekend = true;
          } else if (isWE && inWeekend) {
            weekendAreas[weekendAreas.length - 1][1] = { xAxis: allTimestamps[ti] };
          } else {
            inWeekend = false;
          }
        }

        const markAreaData = weekendAreas.map(([start, end]) => [{
          xAxis: start.xAxis,
          itemStyle: { color: 'rgba(148,163,184,0.045)' },
        }, {
          xAxis: end.xAxis,
        }]);

        // Smart x-axis interval: keep labels horizontal, show ~10-14 ticks max
        const totalPts = allTimestamps.length;
        const xInterval = totalPts > 90 ? Math.floor(totalPts / 10) : totalPts > 40 ? Math.floor(totalPts / 12) : totalPts > 20 ? Math.floor(totalPts / 10) : 0;

        const option = {
          animation: true,
          grid: {
            top: 36,
            right: 28,
            bottom: series.length > 4 ? 72 : series.length > 2 ? 60 : 50,
            left: 60,
            containLabel: false,
          },
          legend: {
            show: true,
            bottom: 2,
            icon: 'roundRect',
            itemWidth: 18,
            itemHeight: 5,
            itemGap: 24,
            type: 'scroll' as any,
            pageIconSize: 12,
            textStyle: {
              fontSize: 12,
              fontWeight: 500,
              color: '#4b5563',
              padding: [0, 0, 0, 4],
              overflow: 'truncate',
              width: 160,
            },
          },
          tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(15,23,42,0.96)',
            borderColor: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: [10, 14],
            textStyle: { color: '#f1f5f9', fontSize: 11.5 },
            axisPointer: {
              type: 'line' as const,
              lineStyle: { color: 'rgba(99,102,241,0.3)', width: 1, type: 'dashed' as const },
            },
            formatter: (params: any) => {
              const items = Array.isArray(params) ? params : [params];
              if (items.length === 0) return '';
              const dt = new Date(items[0].axisValue);
              const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
              const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
              const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              const isWE = dt.getDay() === 0 || dt.getDay() === 6;
              const weBadge = isWE ? ' <span style="background:rgba(148,163,184,0.2);padding:1px 5px;border-radius:3px;font-size:9px;color:#94a3b8">WE</span>' : '';
              const header = `<div style="font-size:10.5px;color:#94a3b8;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:5px">${dayName} ${dateStr} · ${timeStr}${weBadge}</div>`;
              const rows = items.map((p: any) => {
                const def = defs.find(d => d.label === p.seriesName) || defs[0];
                const val = p.value != null ? p.value.toFixed(2) : '—';
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0"><span style="width:12px;height:3px;border-radius:2px;background:${p.color};display:inline-block"></span><span style="flex:1;color:#cbd5e1">${p.seriesName}</span><b style="color:#f1f5f9">${val} ${def.unit}</b></div>`;
              }).join('');
              return header + rows;
            },
          },
          xAxis: {
            type: 'category' as const,
            data: allTimestamps,
            axisLabel: {
              formatter: (v: string) => {
                const d = new Date(v);
                return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
              },
              fontSize: 10.5,
              color: '#9ca3af',
              margin: 14,
              rotate: 0,
              interval: xInterval,
            },
            axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
            axisTick: { show: false },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value' as const,
            min: cfg.yAxis?.mode === 'manual' && cfg.yAxis.min != null ? cfg.yAxis.min : undefined,
            max: cfg.yAxis?.mode === 'manual' && cfg.yAxis.max != null ? cfg.yAxis.max : undefined,
            axisLabel: { fontSize: 10, color: '#9ca3af', formatter: (v: number) => `${v.toFixed(1)}`, margin: 14 },
            splitLine: {
              show: cfg.showGrid,
              lineStyle: { color: 'rgba(128,128,128,0.06)', type: 'dashed' as const },
            },
            axisLine: { show: false },
            axisTick: { show: false },
          },
          series: series.map((s, i) => ({
            ...s,
            lineStyle: { ...(s.lineStyle || {}), width: s.lineStyle?.width || cfg.lineWidth || 2.5 },
            emphasis: {
              focus: 'series' as const,
              blurScope: 'coordinateSystem' as const,
              lineStyle: { width: (s.lineStyle?.width || cfg.lineWidth || 2.5) + 1.5 },
            },
            ...(i === 0 ? {
              markLine: markLineData.length > 0 ? { silent: true, symbol: 'none', data: markLineData } : undefined,
              markArea: markAreaData.length > 0 ? { silent: true, data: markAreaData } : undefined,
            } : {}),
          })),
        };

        const primaryDef = defs[0];

        return (
          <div
            key={slot.id}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return;
              onSlotClick?.(slot.id);
            }}
            className={cn(
              'rounded-xl border bg-card px-6 pt-5 pb-4 group relative cursor-pointer transition-all duration-300',
              isActive
                ? 'border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/5'
                : 'border-border/40 hover:border-border/70 hover:shadow-sm'
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <div className="flex items-center gap-1.5">
                {/* Show color dots for each KPI */}
                {defs.map((d, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: d.color }} />
                ))}
                <input
                  value={slot.name}
                  onChange={(e) => onRenameSlot(slot.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none max-w-[160px] truncate ml-1"
                />
              </div>
              <span className="ml-auto" />

              {/* Add KPI to this graph */}
              <button
                onClick={(e) => { e.stopPropagation(); onOpenKpiSelector(slot.id); }}
                className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Ajouter un KPI"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveSlot(slot.id); }}
                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Supprimer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Config popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md border border-border/60 bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-3 space-y-3 z-50" align="end" side="bottom">
                  {/* KPIs list */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">KPIs ({kpiIds.length})</span>
                    {defs.map((d, i) => (
                      <div key={kpiIds[i]} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-[10px] font-medium text-foreground truncate max-w-[150px]">{d.label}</span>
                        </div>
                        <button
                          onClick={() => onChangeSlotKpi(slot.id, kpiIds[i])}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 w-full mt-1"
                      onClick={() => onOpenKpiSelector(slot.id)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Ajouter KPI
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

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Smooth Curve</span>
                    <Switch checked={cfg.smooth} onCheckedChange={v => onUpdateSlotConfig(slot.id, { smooth: v })} className="scale-75" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground">Line Width</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{cfg.lineWidth}px</span>
                    </div>
                    <Slider value={[cfg.lineWidth]} onValueChange={v => onUpdateSlotConfig(slot.id, { lineWidth: v[0] })} min={0.5} max={5} step={0.5} className="w-full" />
                  </div>
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
                </PopoverContent>
              </Popover>
            </div>
            <ReactECharts option={option} style={{ height: chartHeight }} />
          </div>
        );
      })}
      </div>
      {/* Small Add button */}
      {graphSlots.length < 4 && (
        <button
          onClick={() => onAddEmptySlot()}
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
