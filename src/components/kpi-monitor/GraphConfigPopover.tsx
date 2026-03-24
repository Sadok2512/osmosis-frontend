import React from 'react';
import { cn } from '@/lib/utils';
import {
  Info, Layers, Calendar, Filter, SplitSquareHorizontal, BarChart3,
  TrendingUp, AreaChart, BarChart, CircleDot, Grid3X3, Palette, Settings2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { WidgetGraphConfig, GridConfig, CalendarConfig } from './GraphSettingsPanel';
import { DEFAULT_GRID, DEFAULT_CALENDAR } from './GraphSettingsPanel';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';

type ChartTypeOption = 'line' | 'area' | 'bar' | 'scatter';

const CHART_TYPES: { value: ChartTypeOption; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const BG_COLORS = [
  { value: 'transparent', label: 'None' },
  { value: '#ffffff', label: 'White' },
  { value: '#0f172a', label: 'Dark' },
  { value: '#f8fafc', label: 'Slate' },
  { value: '#f0fdf4', label: 'Green' },
  { value: '#eff6ff', label: 'Blue' },
  { value: '#fefce8', label: 'Yellow' },
];

const TITLE_COLORS = [
  '#000000', '#ffffff', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1',
];

interface Props {
  config: WidgetGraphConfig;
  onChange: (c: WidgetGraphConfig) => void;
}

const InfoField: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
    <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5 font-semibold">{label}</div>
      <div className="text-[11px] text-foreground">{children}</div>
    </div>
  </div>
);

const GraphConfigPopover: React.FC<Props> = ({ config, onChange }) => {
  const set = (updates: Partial<WidgetGraphConfig>) => onChange({ ...config, ...updates });
  const gridCfg = config.grid || DEFAULT_GRID;
  const setGrid = (u: Partial<GridConfig>) => set({ grid: { ...gridCfg, ...u } });
  const calCfg = config.calendar || DEFAULT_CALENDAR;
  const setCal = (u: Partial<CalendarConfig>) => set({ calendar: { ...calCfg, ...u } });

  // Pull widget context from stores
  const { selectedKpis, splitBy, topN, includeOthers, localFilters } = useKpiMonitorStore();
  const { dateFrom, dateTo, globalFilters } = useGlobalFilterStore();

  const activeGlobalFilters = globalFilters
    .filter(f => f.values && f.values.length > 0)
    .map(f => `${f.dimension}: ${f.values.join(', ')}`);

  const dateLabel = `${dateFrom} → ${dateTo}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 max-h-[80vh] overflow-y-auto" align="end">

        {/* ── Widget Info Section ── */}
        <div className="px-3 pt-3 pb-2 border-b border-border/40">
          <div className="flex items-center gap-1.5 mb-2">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Widget Info</span>
          </div>

          <div className="rounded-lg border border-border/30 bg-muted/10 px-2.5">
            {/* Date Range */}
            <InfoField icon={<Calendar className="w-3 h-3" />} label="Date Range">
              <span className="font-mono text-[10px]">{dateLabel}</span>
            </InfoField>

            {/* Selected KPIs */}
            <InfoField icon={<Layers className="w-3 h-3" />} label={`KPIs (${selectedKpis.length})`}>
              {selectedKpis.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {selectedKpis.map(k => (
                    <span key={k.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary font-medium">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: k.color || '#3b82f6' }} />
                     {k.label || k.kpi_key}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-[10px] italic">No KPIs selected</span>
              )}
            </InfoField>

            {/* Aggregation */}
            <InfoField icon={<BarChart3 className="w-3 h-3" />} label="Aggregation">
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selectedKpis.length > 0 ? selectedKpis.map(k => (
                  <span key={k.id} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground font-medium">
                    {k.display_name || k.kpi_key}: {k.agg || 'avg'}
                  </span>
                )) : (
                  <span className="text-muted-foreground text-[10px] italic">—</span>
                )}
              </div>
            </InfoField>

            {/* Split */}
            <InfoField icon={<SplitSquareHorizontal className="w-3 h-3" />} label="Split By">
              {splitBy ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-accent text-accent-foreground font-medium">
                  {splitBy} (Top {topN}{includeOthers ? ' + Others' : ''})
                </span>
              ) : (
                <span className="text-muted-foreground text-[10px] italic">None</span>
              )}
            </InfoField>

            {/* Filters */}
            <InfoField icon={<Filter className="w-3 h-3" />} label={`Filters (${localFilters.length + activeGlobalFilters.length})`}>
              {(localFilters.length + activeGlobalFilters.length) > 0 ? (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {activeGlobalFilters.map(f => (
                    <span key={f} className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-700 font-medium">
                      🌐 {f}
                    </span>
                  ))}
                  {localFilters.map(f => (
                    <span key={f.id} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground font-medium">
                      {f.dimension}: {Array.isArray(f.values) ? f.values.join(', ') : f.values}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-[10px] italic">No filters</span>
              )}
            </InfoField>
          </div>
        </div>

        {/* ── Chart Configuration Section ── */}
        <div className="px-3 pt-2 pb-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Chart Configuration</span>
          </div>

          {/* Chart Type */}
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-muted-foreground uppercase">Type</span>
            <div className="flex gap-1">
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => set({})}
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
              min={0.5} max={5} step={0.5}
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

          {/* ── Grid ── */}
          <div className="border-t border-border/40 pt-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Grid3X3 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-bold text-muted-foreground uppercase">Grid</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-foreground">Grid Lines</span>
              <Switch checked={gridCfg.enabled} onCheckedChange={v => setGrid({ enabled: v })} className="scale-75" />
            </div>
            {gridCfg.enabled && (
              <>
                <div className="space-y-1 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground">Opacity</span>
                    <span className="text-[9px] text-muted-foreground font-mono">{gridCfg.opacity}%</span>
                  </div>
                  <Slider
                    value={[gridCfg.opacity]}
                    onValueChange={v => setGrid({ opacity: v[0] })}
                    min={5} max={100} step={5}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-1">
                  {(['horizontal', 'vertical', 'both'] as const).map(t => (
                    <button key={t} onClick={() => setGrid({ type: t })}
                      className={cn(
                        'flex-1 px-2 py-1 rounded-md text-[9px] font-semibold border transition-all',
                        gridCfg.type === t ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                      )}
                    >{t}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Weekend ── */}
          <div className="border-t border-border/40 pt-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-bold text-muted-foreground uppercase">Weekend</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-foreground">Highlight Weekends</span>
              <Switch checked={calCfg.highlightWeekends} onCheckedChange={v => setCal({ highlightWeekends: v })} className="scale-75" />
            </div>
            {calCfg.highlightWeekends && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-foreground">Opacity</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{calCfg.weekendOpacity}%</span>
                </div>
                <Slider
                  value={[calCfg.weekendOpacity]}
                  onValueChange={v => setCal({ weekendOpacity: v[0] })}
                  min={5} max={50} step={5}
                  className="w-full"
                />
                <div className="flex gap-1 mt-1">
                  {['#94a3b8', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                    <button key={c} onClick={() => setCal({ weekendColor: c })}
                      className={cn('w-5 h-5 rounded-md border-2 transition-all', calCfg.weekendColor === c ? 'border-foreground scale-110' : 'border-transparent')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Background ── */}
          <div className="border-t border-border/40 pt-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Palette className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-bold text-muted-foreground uppercase">Appearance</span>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] font-medium text-foreground block mb-1">Background</span>
                <div className="flex gap-1 flex-wrap">
                  {BG_COLORS.map(bg => (
                    <button key={bg.value} onClick={() => set({ backgroundColor: bg.value, transparentBg: bg.value === 'transparent' })}
                      className={cn(
                        'px-2 py-1 rounded-md text-[9px] font-semibold border transition-all',
                        config.backgroundColor === bg.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                      )}
                    >{bg.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium text-foreground block mb-1">Title Color</span>
                <div className="flex gap-1 flex-wrap">
                  {TITLE_COLORS.map(c => (
                    <button key={c} onClick={() => set({ titleColor: c } as any)}
                      className={cn('w-5 h-5 rounded-md border-2 transition-all', (config as any).titleColor === c ? 'border-foreground scale-110' : 'border-transparent')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GraphConfigPopover;
