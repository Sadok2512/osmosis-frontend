import React from 'react';
import { cn } from '@/lib/utils';
import { Settings2, TrendingUp, AreaChart, BarChart, CircleDot, Layers2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { WidgetGraphConfig, GridConfig } from './GraphSettingsPanel';
import { DEFAULT_GRID } from './GraphSettingsPanel';

type ChartTypeOption = 'line' | 'area' | 'bar' | 'scatter';

const CHART_TYPES: { value: ChartTypeOption; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

interface Props {
  config: WidgetGraphConfig;
  onChange: (c: WidgetGraphConfig) => void;
}

const GraphConfigPopover: React.FC<Props> = ({ config, onChange }) => {
  const set = (updates: Partial<WidgetGraphConfig>) => onChange({ ...config, ...updates });
  const gridCfg = config.grid || DEFAULT_GRID;
  const setGrid = (u: Partial<GridConfig>) => set({ grid: { ...gridCfg, ...u } });

  // Derive a "chart type" from config for the selector
  // We show area fill as separate toggle, so type is always 'line'|'bar'|'scatter'
  const showArea = config.transparentBg === false || gridCfg.enabled;

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
                onClick={() => {
                  // We don't have a direct chartType in WidgetGraphConfig,
                  // but we can signal via conventions
                  set({});
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border',
                  ct.value === 'line'
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

        {/* Show Legend */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Show Legend</span>
          <Switch checked={config.showLegend} onCheckedChange={v => set({ showLegend: v })} className="scale-75" />
        </div>

        {/* Grid Lines */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
          <Switch checked={gridCfg.enabled} onCheckedChange={v => setGrid({ enabled: v })} className="scale-75" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GraphConfigPopover;
