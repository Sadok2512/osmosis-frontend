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
              <div className="px-4 pb-3 space-y-2">
                {/* Numerator */}
                <div className="rounded-lg bg-green-500/5 border border-green-500/15 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black bg-green-500/15 text-green-500">N</span>
                    <span className="text-[8px] font-bold text-green-600/70 uppercase tracking-wider">Numerator</span>
                  </div>
                  <code className="text-[9px] text-foreground/80 font-mono leading-relaxed break-all block">
                    {ex.numerator || '—'}
                  </code>
                  {numCounters.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {numCounters.map(c => (
                        <span key={c} className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold bg-green-500/10 text-green-600 border border-green-500/15">{c}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Denominator */}
                {ex.denominator && (
                  <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black bg-blue-500/15 text-blue-500">D</span>
                      <span className="text-[8px] font-bold text-blue-600/70 uppercase tracking-wider">Denominator</span>
                    </div>
                    <code className="text-[9px] text-foreground/80 font-mono leading-relaxed break-all block">
                      {ex.denominator}
                    </code>
                    {denCounters.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {denCounters.map(c => (
                          <span key={c} className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold bg-blue-500/10 text-blue-600 border border-blue-500/15">{c}</span>
                        ))}
                      </div>
                    )}
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
