import React from 'react';
import { Info, Calendar, Layers, BarChart3, SplitSquareHorizontal, Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';

const Field: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
    <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5 font-semibold">{label}</div>
      <div className="text-[11px] text-foreground">{children}</div>
    </div>
  </div>
);

const WidgetInfoPopover: React.FC = () => {
  const { selectedKpis, splitBy, topN, includeOthers, localFilters } = useKpiMonitorStore();
  const { dateFrom, dateTo, globalFilters } = useGlobalFilterStore();

  const activeGlobalFilters = globalFilters
    .filter(f => f.values && f.values.length > 0)
    .map(f => `${f.dimension}: ${f.values.join(', ')}`);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors"
          title="Widget Info"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3 max-h-[60vh] overflow-y-auto" align="end">
        <div className="flex items-center gap-1.5 mb-2">
          <Info className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Widget Info</span>
        </div>

        <div className="rounded-lg border border-border/30 bg-muted/10 px-2.5">
          {/* Date Range */}
          <Field icon={<Calendar className="w-3 h-3" />} label="Date Range">
            <span className="font-mono text-[10px]">{dateFrom} → {dateTo}</span>
          </Field>

          {/* KPIs */}
          <Field icon={<Layers className="w-3 h-3" />} label={`KPIs (${selectedKpis.length})`}>
            {selectedKpis.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selectedKpis.map(k => (
                  <span key={k.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary font-medium">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: k.color || 'hsl(var(--primary))' }} />
                    {k.label || k.kpi_key}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-[10px] italic">No KPIs selected</span>
            )}
          </Field>

          {/* Aggregation */}
          <Field icon={<BarChart3 className="w-3 h-3" />} label="Aggregation">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {selectedKpis.length > 0 ? selectedKpis.map(k => (
                <span key={k.id} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground font-medium">
                  {k.label || k.kpi_key}: {k.agg || 'avg'}
                </span>
              )) : (
                <span className="text-muted-foreground text-[10px] italic">—</span>
              )}
            </div>
          </Field>

          {/* Split */}
          <Field icon={<SplitSquareHorizontal className="w-3 h-3" />} label="Split By">
            {splitBy ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-accent text-accent-foreground font-medium">
                {splitBy} (Top {topN}{includeOthers ? ' + Others' : ''})
              </span>
            ) : (
              <span className="text-muted-foreground text-[10px] italic">None</span>
            )}
          </Field>

          {/* Filters */}
          <Field icon={<Filter className="w-3 h-3" />} label={`Filters (${localFilters.length + activeGlobalFilters.length})`}>
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
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default WidgetInfoPopover;
