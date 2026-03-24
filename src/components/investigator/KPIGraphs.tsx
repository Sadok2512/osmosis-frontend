import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { DataPoint } from './types';
import { KPI_MAP } from './mockData';
import {
  Settings2, TrendingUp, AreaChart, BarChart, CircleDot,
  Eye, EyeOff, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

type ChartType = 'line' | 'area' | 'bar' | 'scatter';

interface GraphConfig {
  chartType: ChartType;
  smooth: boolean;
  lineWidth: number;
  showSymbols: boolean;
  showThresholds: boolean;
  showGrid: boolean;
  showArea: boolean;
}

const DEFAULT_CONFIG: GraphConfig = {
  chartType: 'line',
  smooth: true,
  lineWidth: 2.5,
  showSymbols: false,
  showThresholds: true,
  showGrid: true,
  showArea: true,
};

const CHART_TYPES: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

/* ── Settings Popover ── */
const GraphSettingsPopover: React.FC<{ config: GraphConfig; onChange: (c: GraphConfig) => void }> = ({ config, onChange }) => {
  const set = (updates: Partial<GraphConfig>) => onChange({ ...config, ...updates });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-3 space-y-3" align="end">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Graph Config</div>

        {/* Chart Type */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-muted-foreground uppercase">Type</span>
          <div className="flex gap-1">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => set({ chartType: ct.value })}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                  config.chartType === ct.value
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
          <Switch checked={config.smooth} onCheckedChange={v => set({ smooth: v })} className="scale-75" />
        </div>

        {/* Line Width */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground">Line Width</span>
            <span className="text-[9px] text-muted-foreground font-mono">{config.lineWidth}px</span>
          </div>
          <Slider
            value={[config.lineWidth]}
            onValueChange={v => set({ lineWidth: v[0] })}
            min={0.5}
            max={5}
            step={0.5}
            className="w-full"
          />
        </div>

        {/* Show Symbols */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Show Markers</span>
          <Switch checked={config.showSymbols} onCheckedChange={v => set({ showSymbols: v })} className="scale-75" />
        </div>

        {/* Show Area */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Area Fill</span>
          <Switch checked={config.showArea} onCheckedChange={v => set({ showArea: v })} className="scale-75" />
        </div>

        {/* Show Thresholds */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Thresholds</span>
          <Switch checked={config.showThresholds} onCheckedChange={v => set({ showThresholds: v })} className="scale-75" />
        </div>

        {/* Show Grid */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
          <Switch checked={config.showGrid} onCheckedChange={v => set({ showGrid: v })} className="scale-75" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Main Component ── */
interface Props {
  selectedKpis: string[];
  data: DataPoint[];
  layout: 1 | 2 | 4;
}

const KPIGraphs: React.FC<Props> = ({ selectedKpis, data, layout }) => {
  // Layout=1: all KPIs in ONE combined chart. Layout=2: 2 columns. Layout=4: 2x2 grid.
  const cols = layout === 1 ? 1 : 2;
  const chartHeight = layout === 1 ? 400 : layout === 4 ? 220 : 280;
  const [configs, setConfigs] = useState<Record<string, GraphConfig>>({});

  const getConfig = (kpiId: string): GraphConfig => configs[kpiId] || DEFAULT_CONFIG;
  const setConfig = (kpiId: string, cfg: GraphConfig) => setConfigs(prev => ({ ...prev, [kpiId]: cfg }));

  return (
    <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {selectedKpis.map(kpiId => {
        const def = KPI_MAP[kpiId];
        if (!def) return null;
        const cfg = getConfig(kpiId);
        const kpiData = data.filter(d => d.kpi === kpiId);
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

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: def.color }} />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">{def.label}</h3>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] text-muted-foreground font-medium">{def.unit}</span>
                <GraphSettingsPopover config={cfg} onChange={c => setConfig(kpiId, c)} />
              </div>
            </div>
            <ReactECharts option={option} style={{ height: chartHeight }} />
          </div>
        );
      })}
    </div>
  );
};

export default KPIGraphs;
