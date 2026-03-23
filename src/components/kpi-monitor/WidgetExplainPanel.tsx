import React from 'react';
import { X, Info, BarChart3, Table2, Map as MapIcon, Type, Image as ImageIcon, Activity, Layers, MoveHorizontal, Calendar, Filter } from 'lucide-react';
import type { WidgetItem } from '../bi/dashboardTypes';
import type { ChartConfig } from '../bi/biTypes';

interface Props {
  widget: WidgetItem | null;
  title?: string;
  onClose: () => void;
}

const Field: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
    <div className="mt-0.5 text-muted-foreground">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  </div>
);

const kindMeta = {
  chart: { icon: BarChart3, label: 'Chart', accent: 'bg-primary/10 text-primary' },
  table: { icon: Table2, label: 'Table', accent: 'bg-secondary text-secondary-foreground' },
  map: { icon: MapIcon, label: 'Map', accent: 'bg-accent text-accent-foreground' },
  text: { icon: Type, label: 'Text', accent: 'bg-muted text-muted-foreground' },
  image: { icon: ImageIcon, label: 'Image', accent: 'bg-secondary text-secondary-foreground' },
  kpicard: { icon: Activity, label: 'KPI Card', accent: 'bg-accent text-accent-foreground' },
} as const;

const WidgetExplainPanel: React.FC<Props> = ({ widget, title, onClose }) => {
  if (!widget) return null;

  const meta = kindMeta[widget.kind];
  const Icon = meta.icon;
  const cfg = widget.config as any;
  const chartCfg = widget.kind === 'chart' ? (cfg as ChartConfig) : null;
  const filtersCount = Array.isArray(cfg.filters) ? cfg.filters.length : 0;
  const groupCount = Array.isArray(cfg.groupBy) ? cfg.groupBy.length : 0;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[360px] z-[9999] bg-card border-l border-border shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar-background">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Graph Info</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-5">
          <h4 className="text-lg font-bold text-foreground">{title || cfg.title || meta.label}</h4>
          {cfg.description ? <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p> : null}
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.accent}`}>
              {meta.label}
            </span>
            {chartCfg?.xAxis?.granularity ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                {chartCfg.xAxis.granularity}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border/30 bg-card/50 px-4">
          <Field icon={<Icon className="w-3.5 h-3.5" />} label="Widget Type" value={meta.label} />
          {widget.kind === 'chart' && chartCfg ? (
            <>
              <Field
                icon={<Layers className="w-3.5 h-3.5" />}
                label="Metrics"
                value={
                  <div className="flex flex-wrap gap-1">
                    {chartCfg.yMetrics.length > 0 ? chartCfg.yMetrics.map(m => (
                      <span key={`${m.kpi}-${m.axis}`} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        {m.kpi}
                      </span>
                    )) : <span className="text-muted-foreground text-xs">No metrics</span>}
                  </div>
                }
              />
              <Field icon={<Calendar className="w-3.5 h-3.5" />} label="Granularity" value={chartCfg.xAxis?.granularity || 'auto'} />
              <Field icon={<MoveHorizontal className="w-3.5 h-3.5" />} label="Group By" value={groupCount > 0 ? chartCfg.groupBy.join(', ') : 'None'} />
              <Field icon={<Filter className="w-3.5 h-3.5" />} label="Filters" value={filtersCount > 0 ? `${filtersCount} active` : 'None'} />
            </>
          ) : (
            <Field icon={<Layers className="w-3.5 h-3.5" />} label="Title" value={cfg.title || meta.label} />
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border/30 bg-card/50 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Capabilities</div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded-md text-[10px] bg-primary/10 text-primary font-medium">Info</span>
            {widget.kind === 'chart' && <span className="px-2 py-1 rounded-md text-[10px] bg-primary/10 text-primary font-medium">Graph</span>}
            {widget.kind === 'table' && <span className="px-2 py-1 rounded-md text-[10px] bg-secondary text-secondary-foreground font-medium">Table</span>}
            {widget.kind === 'map' && <span className="px-2 py-1 rounded-md text-[10px] bg-accent text-accent-foreground font-medium">Map</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WidgetExplainPanel;
