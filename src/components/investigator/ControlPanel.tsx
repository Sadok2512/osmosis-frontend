import React from 'react';
import { InvestigationState, Dimension, Granularity, SplitOption } from './types';
import { KPIS, KPI_MAP } from './mockData';
import { Search, Filter, Calendar, Layers, GitBranch, Play, X } from 'lucide-react';

interface Props {
  state: InvestigationState;
  setState: React.Dispatch<React.SetStateAction<InvestigationState>>;
  onApply: () => void;
}

const DIMENSIONS: Dimension[] = ['Cell', 'Site', 'DOR', 'DR', 'Plaque', 'Zone ARCEP'];
const GRANULARITIES: Granularity[] = ['Hourly', 'Daily', 'Weekly'];
const SPLITS: SplitOption[] = ['None', 'Vendor', 'Technology', 'Band', 'DOR', 'DR'];

const ControlPanel: React.FC<Props> = ({ state, setState, onApply }) => {
  const toggleKpi = (id: string) => {
    setState(prev => ({
      ...prev,
      selectedKpis: prev.selectedKpis.includes(id)
        ? prev.selectedKpis.filter(k => k !== id)
        : [...prev.selectedKpis, id],
    }));
  };

  const categories = [...new Set(KPIS.map(k => k.category))];

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-6 py-4 space-y-4">
        {/* Row 1: Dimension, Dates, Granularity, Split */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Search className="w-3 h-3" /> Dimension
            </label>
            <select
              value={state.dimension}
              onChange={e => setState(prev => ({ ...prev, dimension: e.target.value as Dimension }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
            >
              {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Start
            </label>
            <input
              type="date"
              value={state.startDate.slice(0, 10)}
              onChange={e => setState(prev => ({ ...prev, startDate: e.target.value }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> End
            </label>
            <input
              type="date"
              value={state.endDate.slice(0, 10)}
              onChange={e => setState(prev => ({ ...prev, endDate: e.target.value }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3" /> Granularity
            </label>
            <select
              value={state.granularity}
              onChange={e => setState(prev => ({ ...prev, granularity: e.target.value as Granularity }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
            >
              {GRANULARITIES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> Split By
            </label>
            <select
              value={state.splitBy}
              onChange={e => setState(prev => ({ ...prev, splitBy: e.target.value as SplitOption }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium"
            >
              {SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top N</label>
            <input
              type="number"
              value={state.topLimit}
              min={5}
              max={50}
              onChange={e => setState(prev => ({ ...prev, topLimit: Number(e.target.value) }))}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium w-16"
            />
          </div>

          <button
            onClick={onApply}
            className="flex items-center gap-2 px-5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-sm"
          >
            <Play className="w-3.5 h-3.5" /> Apply
          </button>
        </div>

        {/* Row 2: KPI Selector */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">KPIs</span>
            {state.selectedKpis.length > 0 && (
              <span className="text-[10px] font-medium text-primary">{state.selectedKpis.length} selected</span>
            )}
          </div>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold text-muted-foreground/70 uppercase w-20 shrink-0">{cat}</span>
                {KPIS.filter(k => k.category === cat).map(kpi => {
                  const isSelected = state.selectedKpis.includes(kpi.id);
                  return (
                    <button
                      key={kpi.id}
                      onClick={() => toggleKpi(kpi.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border ${
                        isSelected
                          ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                          : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: kpi.color }} />
                      {kpi.label}
                      {isSelected && <X className="w-2.5 h-2.5" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
