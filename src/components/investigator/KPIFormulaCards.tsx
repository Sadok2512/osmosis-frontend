import React from 'react';
import { fetchExplain } from '../kpi-monitor/api/kpiMonitorApi';
import { Calculator, Cpu, Layers, Table2, Tag, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiExplain {
  kpi_key: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  formula_type: string;
  numerator: string;
  denominator: string;
  techno: string;
  vendor: string;
  source_column: string;
}

interface Props {
  selectedKpis: string[];
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#ef4444','#84cc16','#6366f1','#14b8a6'];

const extractCounters = (formula: string): string[] => {
  if (!formula) return [];
  const matches = formula.match(/`([^`]+)`/g) || [];
  return [...new Set(matches.map(m => m.replace(/`/g, '')))];
};

const KPIFormulaCards: React.FC<Props> = ({ selectedKpis }) => {
  const [explains, setExplains] = React.useState<Record<string, KpiExplain>>({});

  React.useEffect(() => {
    selectedKpis.forEach(kpiId => {
      if (explains[kpiId]) return;
      fetchExplain(kpiId).then((data: any) => {
        setExplains(prev => ({ ...prev, [kpiId]: data }));
      }).catch(() => {});
    });
  }, [selectedKpis]);

  if (selectedKpis.length === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {selectedKpis.filter(Boolean).map((kpiId, idx) => {
        const ex = explains[kpiId];
        const color = COLORS[idx % COLORS.length];
        const numCounters = ex ? extractCounters(ex.numerator) : [];
        const denCounters = ex ? extractCounters(ex.denominator) : [];
        const totalCounters = numCounters.length + denCounters.length;

        return (
          <div key={kpiId} className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {/* KPI Header */}
            <div className="px-4 py-3 flex items-start gap-3" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: color + '15' }}>
                <Calculator className="w-4.5 h-4.5" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-foreground truncate">{ex?.display_name || kpiId}</h3>
                  {ex && (
                    <>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                        {ex.formula_type}
                      </span>
                      {ex.unit && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-muted text-muted-foreground shrink-0">
                          {ex.unit}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {ex?.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ex.description}</p>
                )}
                {/* Meta tags */}
                {ex && (
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" /> {ex.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Zap className="w-2.5 h-2.5" /> {ex.techno}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Cpu className="w-2.5 h-2.5" /> {ex.vendor}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Layers className="w-2.5 h-2.5" /> {totalCounters} counters
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Formula */}
            {ex && (ex.numerator || ex.denominator) && (
              <div className="px-4 pb-4 space-y-3">
                {/* Numerator */}
                <div className="rounded-xl border border-emerald-500/20 overflow-hidden bg-card">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
                    <span className="text-xs font-bold tracking-[0.15em] text-emerald-700 dark:text-emerald-400 uppercase">
                      Numerator
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-card border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                      {numCounters.length} {numCounters.length > 1 ? 'Counters' : 'Counter'}
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {numCounters.length > 0 ? (
                      numCounters.map((c) => (
                        <div key={c} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
                          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <Table2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono font-semibold text-foreground truncate">{c}</div>
                            <div className="text-[10px] text-muted-foreground">PM counter</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <code className="text-[10px] text-muted-foreground font-mono block px-2 py-1">
                        {ex.numerator || '—'}
                      </code>
                    )}
                  </div>
                </div>

                {/* Denominator */}
                {ex.denominator && (
                  <div className="rounded-xl border border-blue-500/20 overflow-hidden bg-card">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
                      <span className="text-xs font-bold tracking-[0.15em] text-blue-700 dark:text-blue-400 uppercase">
                        Denominator
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-card border border-blue-500/30 text-blue-700 dark:text-blue-400">
                        {denCounters.length} {denCounters.length > 1 ? 'Counters' : 'Counter'}
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {denCounters.length > 0 ? (
                        denCounters.map((c) => (
                          <div key={c} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
                            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                              <Table2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-mono font-semibold text-foreground truncate">{c}</div>
                              <div className="text-[10px] text-muted-foreground">PM counter</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <code className="text-[10px] text-muted-foreground font-mono block px-2 py-1">
                          {ex.denominator}
                        </code>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Loading state */}
            {!ex && (
              <div className="px-4 pb-3">
                <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default KPIFormulaCards;
