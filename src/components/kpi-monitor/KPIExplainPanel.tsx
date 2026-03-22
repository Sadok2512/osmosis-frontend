import React from 'react';
import { X, Info, Database, Layers, BarChart3, Target, SplitSquareHorizontal } from 'lucide-react';
import { useKpiExplain, type ExplainResponse } from './api/kpiMonitorApi';

interface Props {
  kpiKey: string | null;
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

const KPIExplainPanel: React.FC<Props> = ({ kpiKey, onClose }) => {
  const { data, isLoading, error } = useKpiExplain(kpiKey);

  if (!kpiKey) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[360px] z-50 bg-card border-l border-border shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar-background">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">KPI Explainability</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
            Erreur: {(error as Error).message}
          </div>
        )}

        {data && (
          <div>
            {/* KPI Identity */}
            <div className="mb-5">
              <h4 className="text-lg font-bold text-foreground">{data.display_name}</h4>
              <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                  {data.category}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                  {data.value_type}
                </span>
                {data.unit && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                    {data.unit}
                  </span>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="rounded-xl border border-border/30 bg-card/50 px-4">
              <Field
                icon={<Database className="w-3.5 h-3.5" />}
                label="Source Table"
                value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{data.source_table}</code>}
              />
              <Field
                icon={<Database className="w-3.5 h-3.5" />}
                label="Source Column"
                value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{data.source_column}</code>}
              />
              <Field
                icon={<Layers className="w-3.5 h-3.5" />}
                label="Formula Type"
                value={data.formula_type}
              />
              <Field
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label="Default Chart"
                value={`${data.default_chart_type} (${data.default_axis} axis)`}
              />
              <Field
                icon={<SplitSquareHorizontal className="w-3.5 h-3.5" />}
                label="Supported Levels"
                value={
                  <div className="flex flex-wrap gap-1">
                    {data.supported_levels.map(l => (
                      <span key={l} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                }
              />
              <Field
                icon={<Target className="w-3.5 h-3.5" />}
                label="Thresholds"
                value={
                  data.threshold_warning != null ? (
                    <div className="flex gap-3">
                      <span className="text-amber-400 text-xs">⚠ {data.threshold_warning}{data.unit}</span>
                      <span className="text-red-400 text-xs">✕ {data.threshold_critical}{data.unit}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Non défini</span>
                  )
                }
              />
            </div>

            {/* Capabilities */}
            <div className="mt-4 rounded-xl border border-border/30 bg-card/50 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Capabilities</div>
              <div className="flex gap-2">
                {data.supports_split && (
                  <span className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 font-medium">Split</span>
                )}
                {data.supports_table && (
                  <span className="px-2 py-1 rounded-md text-[10px] bg-blue-500/10 text-blue-400 font-medium">Table</span>
                )}
                <span className="px-2 py-1 rounded-md text-[10px] bg-violet-500/10 text-violet-400 font-medium">Graph</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KPIExplainPanel;
