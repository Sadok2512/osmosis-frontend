import React, { useEffect } from 'react';
import ControlPanel from './ControlPanel';
import KPIGraphs from './KPIGraphs';
import KPIHistogram from './KPIHistogram';
import KPIBreakdown from './KPIBreakdown';
import WorstElementsTable from './WorstElementsTable';
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement } from './types';
import { fetchTimeSeriesData, fetchWorstElements, fetchWorstByDOR, fetchFilterValues } from './investigatorApi';
import {
  LayoutGrid, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestigatorStore } from '@/stores/investigatorStore';

const createSlot = (index: number, kpiIds: string[] = []): GraphSlot => ({
  id: `slot-${Date.now()}-${index}`,
  kpiIds,
  name: `Graph ${index}`,
  filters: {},
  startDate: '',
  endDate: '',
  granularity: 'Hourly',
  splitBy: 'None',
});

const InvestigatorPage: React.FC = () => {
  const {
    state, setState,
    tsData, setTsData,
    worstElements, setWorstElements,
    activeSlotId, setActiveSlotId,
    kpiSelectorSlot, setKpiSelectorSlot,
    hasLoadedOnce, setHasLoadedOnce,
  } = useInvestigatorStore();

  const [isApplying, setIsApplying] = React.useState(false);
  const [worstByDOR, setWorstByDOR] = React.useState<Record<string, WorstElement[]>>({});
  const [worstFilters, setWorstFilters] = React.useState<{ dimension: string; op: string; values: string[] }[]>([]);
  const [worstFilterOptions, setWorstFilterOptions] = React.useState<Record<string, string[]>>({});
  const [isLoadingWorst, setIsLoadingWorst] = React.useState(false);

  // Load filter options on mount
  React.useEffect(() => {
    Promise.all([
      fetchFilterValues('DOR'),
      fetchFilterValues('PLAQUE'),
      fetchFilterValues('BAND'),
    ]).then(([dors, plaques, bands]) => {
      setWorstFilterOptions({ DOR: dors, PLAQUE: plaques, BAND: bands });
    });
  }, []);

  // Auto-select first slot if none selected or active was removed
  useEffect(() => {
    if (state.graphSlots.length === 0) {
      setActiveSlotId(null);
    } else if (!activeSlotId || !state.graphSlots.find(s => s.id === activeSlotId)) {
      setActiveSlotId(state.graphSlots[0].id);
    }
  }, [state.graphSlots, activeSlotId]);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const granMap: Record<string, string> = { 'Hourly': '1h', 'Daily': '1d', 'Weekly': '1w' };
      const splitValue = state.splitBy === 'None' ? undefined : state.splitBy;

      const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
      const dateFrom = state.startDate.split('T')[0] || '2026-01-01';
      const dateTo = state.endDate.split('T')[0] || '2026-03-24';

      const ts = await fetchTimeSeriesData(
        kpiIds, dateFrom, dateTo,
        granMap[state.granularity] || '1h',
        splitValue,
      );
      setTsData(ts);
      setHasLoadedOnce(true);
    } catch (e) {
      console.error('[Investigator] API error:', e);
    }
    setIsApplying(false);
  };

  const handleFindWorst = async () => {
    setIsLoadingWorst(true);
    try {
      const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
      if (!kpiIds.length) { setIsLoadingWorst(false); return; }
      const dateFrom = state.startDate.split('T')[0] || '2026-01-01';
      const dateTo = state.endDate.split('T')[0] || '2026-03-24';

      const byDOR = await fetchWorstByDOR(kpiIds, state.topLimit, dateFrom, dateTo, worstFilters);
      setWorstByDOR(byDOR);

      // Also set flat list for legacy table
      const flat = Object.values(byDOR).flat();
      setWorstElements(flat);
    } catch (e) {
      console.error('[Investigator] Worst elements error:', e);
    }
    setIsLoadingWorst(false);
  };

  const addWorstFilter = (dimension: string, value: string) => {
    setWorstFilters(prev => {
      const existing = prev.find(f => f.dimension === dimension);
      if (existing) {
        if (existing.values.includes(value)) return prev;
        return prev.map(f => f.dimension === dimension ? { ...f, values: [...f.values, value] } : f);
      }
      return [...prev, { dimension, op: 'IN', values: [value] }];
    });
  };

  const removeWorstFilter = (dimension: string, value: string) => {
    setWorstFilters(prev => {
      return prev.map(f => {
        if (f.dimension !== dimension) return f;
        const newVals = f.values.filter(v => v !== value);
        return { ...f, values: newVals };
      }).filter(f => f.values.length > 0);
    });
  };

  // Only auto-load on first mount if never loaded before
  useEffect(() => {
    if (!hasLoadedOnce) {
      handleApply();
    }
  }, []);

  const handleUpdateSlotConfig = (slotId: string, updates: Partial<GraphConfig>) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s =>
        s.id === slotId ? { ...s, config: { ...(s.config || DEFAULT_GRAPH_CONFIG), ...updates } } : s
      ),
    }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 max-w-[1600px] mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground uppercase tracking-tight">QOEBIT Investigator</h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">KPI Investigation & Root Cause Analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isApplying && (
              <div className="flex items-center gap-2 text-[10px] text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-full">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                REFRESHING...
              </div>
            )}
            <div className="flex items-center gap-1 bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <ControlPanel
        state={state}
        setState={setState}
        onApply={handleApply}
        externalSelectorSlot={kpiSelectorSlot}
        onExternalSelectorClose={() => setKpiSelectorSlot(null)}
        activeSlotId={activeSlotId}
        onSlotClick={setActiveSlotId}
      />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* KPI Graph Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <LayoutGrid className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">KPI Graph Analysis</h2>
                <p className="text-[10px] text-muted-foreground">Visual trend analysis and performance tracking</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Graph type tabs */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { key: 'TimeSeries', icon: LineChartIcon, label: 'Time Series' },
                  { key: 'Histogram', icon: BarChart3, label: 'Histogram' },
                  { key: 'Breakdown', icon: PieChart, label: 'Breakdown' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setState(prev => ({ ...prev, activeGraphTab: tab.key }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all',
                      state.activeGraphTab === tab.key
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Layout switcher */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { val: 1 as const, icon: Square, title: 'Single' },
                  { val: 2 as const, icon: Columns2, title: 'Dual' },
                  { val: 4 as const, icon: LayoutGrid, title: 'Grid' },
                ]).map(l => (
                  <button
                    key={l.val}
                    onClick={() => setState(prev => ({ ...prev, graphLayout: l.val }))}
                    title={l.title}
                    className={cn(
                      'p-1.5 rounded-md transition-all',
                      state.graphLayout === l.val
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <l.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {state.activeGraphTab === 'TimeSeries' && (
            <KPIGraphs
              jalons={state.jalons}
              graphSlots={state.graphSlots}
              data={tsData}
              layout={state.graphLayout}
              onChangeSlotKpi={(slotId, kpiId) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === slotId ? { ...s, kpiIds: kpiId ? [kpiId] : [] } : s),
              }))}
              onRemoveSlot={(slotId) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.filter(s => s.id !== slotId),
              }))}
              onAddEmptySlot={() => {
                setState(prev => {
                  const nextIndex = prev.graphSlots.length + 1;
                  return { ...prev, graphSlots: [...prev.graphSlots, createSlot(nextIndex)] };
                });
              }}
              onRenameSlot={(slotId, name) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === slotId ? { ...s, name } : s),
              }))}
              onUpdateSlotConfig={handleUpdateSlotConfig}
              onOpenKpiSelector={(slotId) => setKpiSelectorSlot(slotId)}
              activeSlotId={activeSlotId}
              onSlotClick={setActiveSlotId}
            />
          )}
          {state.activeGraphTab === 'Histogram' && (
            <KPIHistogram selectedKpis={state.graphSlots.flatMap(s => s.kpiIds)} layout={state.graphLayout} />
          )}
          {state.activeGraphTab === 'Breakdown' && (
            <KPIBreakdown selectedKpis={state.graphSlots.flatMap(s => s.kpiIds)} layout={state.graphLayout} />
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Worst Elements Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-destructive/10 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">Top 10 Worst Cells per DOR</h2>
                <p className="text-[10px] text-muted-foreground">Click Find to identify worst cells based on selected KPIs</p>
              </div>
            </div>
            <button
              onClick={handleFindWorst}
              disabled={isLoadingWorst || state.graphSlots.flatMap(s => s.kpiIds).length === 0}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-bold transition-all',
                isLoadingWorst
                  ? 'bg-primary/20 text-primary cursor-wait'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
                state.graphSlots.flatMap(s => s.kpiIds).length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isLoadingWorst ? 'Loading...' : 'Find Worst Cells'}
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            {['DOR', 'PLAQUE', 'BAND'].map(dim => (
              <div key={dim} className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-muted-foreground uppercase">{dim}</span>
                <select
                  className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px]"
                  value=""
                  onChange={e => { if (e.target.value) addWorstFilter(dim, e.target.value); }}
                >
                  <option value="">+</option>
                  {(worstFilterOptions[dim] || []).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            ))}
            {/* Active filter chips */}
            {worstFilters.flatMap(f => f.values.map(v => (
              <span
                key={`${f.dimension}-${v}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold"
              >
                {f.dimension}: {v}
                <button onClick={() => removeWorstFilter(f.dimension, v)} className="hover:text-destructive">x</button>
              </span>
            )))}
            {worstFilters.length > 0 && (
              <button
                onClick={() => setWorstFilters([])}
                className="text-[9px] text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Results grouped by DOR */}
          {Object.keys(worstByDOR).length > 0 ? (
            Object.entries(worstByDOR).map(([dor, elements]) => (
              <div key={dor} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b border-border/40">
                  <span className="text-xs font-bold text-primary">{dor}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">({elements.length} cells)</span>
                </div>
                <WorstElementsTable
                  elements={elements}
                  limit={state.topLimit}
                  onLimitChange={limit => setState(prev => ({ ...prev, topLimit: limit }))}
                  onRowClick={id => console.log(`Navigate to ${id}`)}
                />
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <WorstElementsTable
                elements={worstElements}
                limit={state.topLimit}
                onLimitChange={limit => setState(prev => ({ ...prev, topLimit: limit }))}
                onRowClick={id => console.log(`Navigate to ${id}`)}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default InvestigatorPage;
