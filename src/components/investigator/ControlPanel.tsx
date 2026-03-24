import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { InvestigationState, Dimension, SplitOption, Granularity } from './types';
import { KPIS as FALLBACK_KPIS, KPI_MAP } from './mockData';
import { fetchKpiDefinitions } from './investigatorApi';
import type { KpiDefinition } from './types';
import { Filter, Calendar as CalendarIcon, X, Plus, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';

interface Props {
  state: InvestigationState;
  setState: React.Dispatch<React.SetStateAction<InvestigationState>>;
  onApply: () => void;
}

const SPLITS: SplitOption[] = ['None', 'Vendor', 'Technology', 'Band', 'DOR', 'DR'];
const TIME_RANGES = ['Last 24h', 'Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'Custom'];
const FILTER_DIMENSIONS = ['Site', 'Vendor', 'Technology', 'Band', 'DOR', 'DR', 'Plaque', 'Zone ARCEP'];

// Filter values fetched from backend
const useBackendFilterValues = (dimension: string): string[] => {
  const [values, setValues] = React.useState<string[]>([]);
  React.useEffect(() => {
    const dimMap: Record<string, string> = { Site: 'Site', Vendor: 'Vendor', Technology: 'TECHNO', Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'Plaque', 'Zone ARCEP': 'ARCEP' };
    const key = dimMap[dimension] || dimension;
    import('@/lib/apiConfig').then(({ getApiUrl, getApiHeaders }) => {
      fetch(getApiUrl(`monitor/filters/values?dimension=${key}`), { headers: getApiHeaders() })
        .then(r => r.json())
        .then(d => { if (d.values) setValues(d.values); })
        .catch(() => {});
    });
  }, [dimension]);
  return values;
};

/* ── KPI Multi-Select Dropdown (loads from backend) ── */
const KpiDropdown: React.FC<{ selected: string[]; onChange: (ids: string[]) => void }> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchKpiDefinitions().then(setKpis).catch(() => setKpis(FALLBACK_KPIS));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(k => k !== id) : [...selected, id]);
  };

  const filtered = search
    ? kpis.filter(k => k.label.toLowerCase().includes(search.toLowerCase()) || k.id.toLowerCase().includes(search.toLowerCase()))
    : kpis;
  const categories = [...new Set(filtered.map(k => k.category))].sort();

  const displayText = selected.length === 0
    ? 'Select KPIs...'
    : `${selected.length} KPI(s) sélectionnés`;

  return (
    <div ref={ref} className="relative flex-1 min-w-[280px]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:border-primary/40 transition-colors"
      >
        <span className="truncate text-left">{displayText}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl max-h-[400px] overflow-hidden p-2 flex flex-col">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un KPI..."
            className="w-full px-2 py-1.5 mb-2 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30"
            autoFocus
          />
          <div className="overflow-y-auto flex-1">
            {kpis.length === 0 && <div className="text-[10px] text-muted-foreground p-2 animate-pulse">Chargement KPIs...</div>}
            {categories.map(cat => {
              const catKpis = filtered.filter(k => k.category === cat);
              if (catKpis.length === 0) return null;
              return (
                <div key={cat} className="mb-2 last:mb-0">
                  <div className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider px-2 py-1">{cat} ({catKpis.length})</div>
                  {catKpis.slice(0, 50).map(kpi => {
                    const isSelected = selected.includes(kpi.id);
                    return (
                      <button key={kpi.id} onClick={() => toggle(kpi.id)}
                        className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                          isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50')}>
                        <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                          isSelected ? 'bg-primary border-primary' : 'border-border')}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{kpi.label}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{kpi.unit}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Add Filter Dropdown ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string, val: string) => void;
}> = ({ existingKeys, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSelectedDim(null); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setSelectedDim(null); }}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Filter className="w-3 h-3" /> Add Filter
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl min-w-[180px] p-1.5">
          {!selectedDim ? (
            FILTER_DIMENSIONS.map(dim => (
              <button
                key={dim}
                onClick={() => setSelectedDim(dim)}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {dim}
              </button>
            ))
          ) : (
            <FilterValuesList dim={selectedDim} onSelect={(val) => { onAdd(selectedDim, val); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
          )}
        </div>
      )}
    </div>
  );
};

/* ── Filter Values (from backend) ── */
const FilterValuesList: React.FC<{ dim: string; onSelect: (val: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const values = useBackendFilterValues(dim);
  return (
    <>
      <button onClick={onBack} className="w-full text-left px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground">
        ← {dim}
      </button>
      <div className="border-t border-border/40 mt-1 pt-1 max-h-[200px] overflow-y-auto">
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
        ) : (
          values.map(val => (
            <button key={val} onClick={() => onSelect(val)}
              className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
              {val}
            </button>
          ))
        )}
      </div>
    </>
  );
};

/* ── Main Control Panel ── */
const ControlPanel: React.FC<Props> = ({ state, setState, onApply }) => {
  const [timeRange, setTimeRange] = useState('Last 7 Days');

  const addFilter = (dim: string, val: string) => {
    setState(prev => {
      const existing = prev.filters[dim] || [];
      if (existing.includes(val)) return prev;
      return { ...prev, filters: { ...prev.filters, [dim]: [...existing, val] } };
    });
  };

  const removeFilter = (dim: string, val: string) => {
    setState(prev => {
      const existing = (prev.filters[dim] || []).filter(v => v !== val);
      const newFilters = { ...prev.filters };
      if (existing.length === 0) delete newFilters[dim];
      else newFilters[dim] = existing;
      return { ...prev, filters: newFilters };
    });
  };

  const filterChips = Object.entries(state.filters).flatMap(([dim, vals]) =>
    vals.map(val => ({ dim, val }))
  );

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm">
      {/* Row 1: Main controls */}
      <div className="max-w-[1600px] mx-auto px-6 py-3">
        <div className="flex items-end gap-3">
          {/* KPIs */}
          <div className="space-y-1 flex-1 min-w-0">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              KPIs ({state.selectedKpis.length})
            </label>
            <KpiDropdown
              selected={state.selectedKpis}
              onChange={ids => setState(prev => ({ ...prev, selectedKpis: ids }))}
            />
          </div>

          {/* Split By */}
          <div className="space-y-1 shrink-0">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Split By</label>
            <select
              value={state.splitBy}
              onChange={e => setState(prev => ({ ...prev, splitBy: e.target.value as SplitOption }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs font-medium w-[110px]"
            >
              {SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Time Range */}
          <div className="space-y-1 shrink-0">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time Range</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={timeRange}
                onChange={e => setTimeRange(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs font-medium w-[140px] appearance-none"
              >
                {TIME_RANGES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Apply */}
          <button
            onClick={onApply}
            className="shrink-0 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-sm"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Row 2: Filter chips */}
      <div className="max-w-[1600px] mx-auto px-6 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Filter className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Filters:</span>
          </div>

          {filterChips.map(({ dim, val }) => (
            <span
              key={`${dim}-${val}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
            >
              <span className="text-muted-foreground">{dim}:</span>
              <span className="font-bold">{val}</span>
              <button
                onClick={() => removeFilter(dim, val)}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

          <AddFilterDropdown
            existingKeys={Object.keys(state.filters)}
            onAdd={addFilter}
          />
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
