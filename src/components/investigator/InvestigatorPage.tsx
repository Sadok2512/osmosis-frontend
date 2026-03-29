import React, { useEffect, useState } from 'react';
import ControlPanel from './ControlPanel';
import KPIGraphs from './KPIGraphs';
import KPIHistogram from './KPIHistogram';
import KPIBreakdown from './KPIBreakdown';
import CMChangesCard from './CMChangesCard';
import CounterGraphSection from './CounterGraphSection';
import WorstElementsTable from './WorstElementsTable';
import InvestigatorAIPanel from './InvestigatorAIPanel';
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement, WidgetType } from './types';
import { fetchTimeSeriesData, fetchKpiDefinitions, fetchWorstElements, fetchWorstByDOR, fetchFilterValues, fetchCellDetails } from './investigatorApi';
import {
  LayoutGrid, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
  Settings2, Bell, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestigatorStore } from '@/stores/investigatorStore';

const WIDGET_NAMES: Record<WidgetType, string> = {
  timeseries: 'Graph',
  histogram: 'Histogram',
  kpi_card: 'KPI Card',
  counter: 'Counter',
  neighbors: 'Neighbors',
};

const createSlot = (index: number, kpiIds: string[] = [], widgetType: WidgetType = 'timeseries'): GraphSlot => ({
  id: `slot-${Date.now()}-${index}`,
  kpiIds,
  name: `${WIDGET_NAMES[widgetType]} ${index}`,
  widgetType,
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
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [counterSelectorOpen, setCounterSelectorOpen] = React.useState(false);
  const [counterCatalog, setCounterCatalog] = React.useState<{counter_name:string;display_name:string;family:string;vendor:string;techno:string;object_type:string;count:number}[]>([]);
  const [selectedCounters, setSelectedCounters] = React.useState<string[]>([]);
  const [counterTsData, setCounterTsData] = React.useState<{timestamp:string;kpi:string;value:number}[]>([]);
  const [analysisTab, setAnalysisTab] = React.useState<'breakdown' | 'counters' | 'alarms' | 'cm_history'>('breakdown');
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

  // Auto-load default KPIs on first visit (no KPIs selected yet)
  useEffect(() => {
    if (state.graphSlots.length === 0 || state.graphSlots.every(s => s.kpiIds.length === 0)) {
      fetchKpiDefinitions().then(kpis => {
        if (kpis.length === 0) return;
        // Pick first 3 KPIs as defaults
        const defaultKpis = kpis.slice(0, 3).map(k => k.id);
        const slot = createSlot(1, defaultKpis);
        setState(prev => ({
          ...prev,
          graphSlots: [slot],
        }));
        setActiveSlotId(slot.id);
      }).catch(err => {
        console.warn('[Investigator] Failed to load default KPIs:', err);
      });
    }
  }, []);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const granMap: Record<string, string> = { '15min': '15min', 'Hourly': '1h', 'Daily': '1d', 'Weekly': '1w' };

      // Determine split: check global splitBy first, then per-slot configs
      let splitValue = state.splitBy === 'None' ? undefined : state.splitBy;
      if (!splitValue) {
        // Check if any slot has a per-KPI split configured
        for (const slot of state.graphSlots) {
          const perKpi = slot.config?.splitByPerKpi || {};
          const activeSplit = Object.values(perKpi).find(v => v && v !== 'None');
          if (activeSplit) {
            splitValue = activeSplit;
            break;
          }
        }
      }

      const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
      if (kpiIds.length === 0) {
        setTsData([]);
        setHasLoadedOnce(true);
        setIsApplying(false);
        return;
      }
      const dateFrom = state.startDate.split('T')[0] || '2026-01-01';
      const dateTo = state.endDate.split('T')[0] || '2026-03-24';
      const gran = granMap[state.granularity] || '1h';

      // Convert state.filters to API format
      const activeFilters = Object.entries(state.filters)
        .filter(([, vals]) => vals.length > 0)
        .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }));

      let ts = await fetchTimeSeriesData(
        kpiIds, dateFrom, dateTo, gran, splitValue,
        activeFilters.length > 0 ? activeFilters : undefined,
        state.kpiLevel, state.profileQci, state.profileArp, state.neighborType
      );

      // Fallback: if hourly returned empty, retry with daily granularity
      if (ts.length === 0 && gran === '1h') {
        console.warn('[Investigator] Hourly returned empty, retrying with daily granularity');
        ts = await fetchTimeSeriesData(
          kpiIds, dateFrom, dateTo, '1d', splitValue,
          activeFilters.length > 0 ? activeFilters : undefined,
          state.kpiLevel, state.profileQci, state.profileArp, state.neighborType
        );
      }

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

      // Enrich all cells with metadata + alarms
      const allCells = Object.values(byDOR).flat();
      const cellNames = allCells.map(c => c.name).filter(Boolean);
      const cellDetails = cellNames.length > 0 ? await fetchCellDetails(cellNames) : [];
      const detailMap: Record<string, any> = {};
      for (const d of cellDetails) {
        detailMap[d.cell_name] = d;
      }

      // Merge details into worst elements
      const enriched: Record<string, typeof allCells> = {};
      for (const [dor, elements] of Object.entries(byDOR)) {
        enriched[dor] = elements.map(el => {
          const detail = detailMap[el.name];
          if (detail) {
            return {
              ...el,
              vendor: detail.vendor || el.vendor,
              dor: detail.dor || dor,
              plaque: detail.plaque || '',
              band: detail.band || '',
              techno: detail.techno || '',
              site_name: detail.site_name || '',
              alarms: detail.alarms,
              latest_alarms: detail.latest_alarms,
            };
          }
          return { ...el, dor: dor };
        });
      }

      setWorstByDOR(enriched);
      setWorstElements(Object.values(enriched).flat());
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

  // Auto-apply when graphSlots KPIs or split config changes
  const slotSplitKey = state.graphSlots.map(s => {
    const splits = Object.values(s.config?.splitByPerKpi || {}).join(',');
    return `${s.kpiIds.join(',')}:${splits}`;
  }).join('|');

  useEffect(() => {
    const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
    if (kpiIds.length > 0) {
      handleApply();
    }
  }, [slotSplitKey, state.splitBy, state.kpiLevel, state.profileQci, state.profileArp, state.neighborType, JSON.stringify(state.filters)]);

  const handleUpdateSlotConfig = (slotId: string, updates: Partial<GraphConfig>) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s =>
        s.id === slotId ? { ...s, config: { ...(s.config || DEFAULT_GRAPH_CONFIG), ...updates } } : s
      ),
    }));
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-y-auto bg-background text-foreground">
      {/* Unified Toolbar */}
      <ControlPanel
        state={state}
        setState={setState}
        onApply={handleApply}
        externalSelectorSlot={kpiSelectorSlot}
        onExternalSelectorClose={() => setKpiSelectorSlot(null)}
        activeSlotId={activeSlotId}
        onSlotClick={setActiveSlotId}
        isApplying={isApplying}
        showAIPanel={showAIPanel}
        onToggleAIPanel={() => setShowAIPanel(!showAIPanel)}
      />

      {/* Main Content */}
      <main className="flex-1 p-5 md:px-6 md:pt-5 md:pb-6 space-y-6 max-w-[1600px] mx-auto w-full">
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
                  { key: 'TimeSeries' as const, icon: LineChartIcon, label: 'Time Series' },
                  { key: 'Histogram' as const, icon: BarChart3, label: 'Histogram' },
                  { key: 'Neighbors' as const, icon: Activity, label: 'Neighbors Flux' },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setState(prev => ({ ...prev, activeGraphTab: tab.key as any }))}
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
              onSetSlotKpiIds={(slotId, kpiIds) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === slotId ? { ...s, kpiIds } : s),
              }))}
              onRemoveSlot={(slotId) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.filter(s => s.id !== slotId),
              }))}
              onAddEmptySlot={(widgetType) => {
                setState(prev => {
                  const nextIndex = prev.graphSlots.length + 1;
                  return { ...prev, graphSlots: [...prev.graphSlots, createSlot(nextIndex, [], widgetType || 'timeseries')] };
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

          {state.activeGraphTab === 'Neighbors' && (
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Activity className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Neighbors Flux Analysis</h3>
                  <p className="text-[10px] text-muted-foreground">Analyse des relations de voisinage inter-cellules et flux de handover</p>
                </div>
              </div>

              {state.kpiLevel === 'NEIGHBOR' && tsData.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {(['X2', 'HO_LTE', 'HO_UTRAN'] as const).map(ntype => {
                      const count = tsData.filter(d => d.splitValue === ntype).length;
                      return (
                        <div
                          key={ntype}
                          onClick={() => setState(prev => ({ ...prev, neighborType: prev.neighborType === ntype ? null : ntype }))}
                          className={cn(
                            'rounded-lg border p-4 cursor-pointer transition-all',
                            state.neighborType === ntype
                              ? 'border-cyan-500/60 bg-cyan-500/10 shadow-sm'
                              : 'border-border/60 bg-card hover:border-cyan-500/30'
                          )}
                        >
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{ntype.replace('_', ' ')}</div>
                          <div className="text-lg font-bold text-foreground mt-1">{count > 0 ? count : '--'}</div>
                          <div className="text-[9px] text-muted-foreground">data points</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Les KPIs neighbor sont affiches dans le graphe TimeSeries ci-dessus. Utilisez le filtre "Type" pour isoler X2, HO LTE ou HO UTRAN.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Activity className="w-12 h-12 text-cyan-500/20" />
                  <p className="text-sm font-semibold text-muted-foreground">
                    {state.kpiLevel !== 'NEIGHBOR'
                      ? 'Passez au niveau "Neighbor" dans la barre de filtres pour analyser les relations de voisinage'
                      : 'Selectionnez des KPIs Neighbor (NEIGH_*) et appliquez'}
                  </p>
                  <p className="text-[10px] text-muted-foreground max-w-md">
                    Le flux de voisinage affiche les handovers entrants/sortants, les taux de succes HO et la topologie des relations entre cellules adjacentes.
                  </p>
                  {state.kpiLevel !== 'NEIGHBOR' && (
                    <button
                      onClick={() => setState(prev => ({ ...prev, kpiLevel: 'NEIGHBOR', activeGraphTab: 'TimeSeries' }))}
                      className="mt-2 px-4 py-2 rounded-lg bg-cyan-500/10 text-cyan-600 text-xs font-bold hover:bg-cyan-500/20 transition-colors border border-cyan-500/20"
                    >
                      Activer le niveau Neighbor
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </section>

        {/* ═══ Analysis Navigation Tabs ═══ */}
        <div className="border-b border-border/60 sticky top-[52px] z-20 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-0.5 px-1 py-1">
            {([
              { key: 'breakdown' as const, icon: PieChart, label: 'KPI Breakdown', color: 'text-purple-500', badge: undefined as number | undefined },
              { key: 'counters' as const, icon: Cpu, label: 'PM Counters', color: 'text-emerald-500', badge: undefined as number | undefined },
              { key: 'alarms' as const, icon: Bell, label: 'Alarms & Worst Cells', color: 'text-red-500', badge: worstElements.length > 0 ? worstElements.length : undefined },
              { key: 'cm_history' as const, icon: Settings2, label: 'CM History', color: 'text-orange-500', badge: undefined as number | undefined },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setAnalysisTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap',
                  analysisTab === tab.key
                    ? 'bg-card text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                <tab.icon className={cn('w-3.5 h-3.5', analysisTab === tab.key ? tab.color : '')} />
                {tab.label}
                {tab.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-destructive/15 text-destructive">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ Tab Content ═══ */}

        {/* KPI Breakdown */}
        {analysisTab === 'breakdown' && state.graphSlots.flatMap(s => s.kpiIds).length > 0 && (
          <section className="space-y-4">
            <KPIBreakdown selectedKpis={state.graphSlots.flatMap(s => s.kpiIds)} layout={state.graphLayout} dateFrom={state.startDate.split("T")[0] || "2026-01-01"} dateTo={state.endDate.split("T")[0] || "2026-03-24"} />
          </section>
        )}

        {/* PM Counters */}
        {analysisTab === 'counters' && (
          <CounterGraphSection
            dateFrom={state.startDate.split("T")[0] || "2026-01-01"}
            dateTo={state.endDate.split("T")[0] || "2026-03-24"}
          />
        )}

        {/* Alarms & Worst Cells */}
        {analysisTab === 'alarms' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-destructive/10 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">Worst Cells & Active Alarms</h2>
                  <p className="text-[10px] text-muted-foreground">Identify degraded cells with vendor, DOR, plaque & alarm details</p>
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
        )}

        {/* CM History */}
        {analysisTab === 'cm_history' && (
          <section className="space-y-4">
            {worstElements.length > 0 ? (
              <CMChangesCard cellNames={worstElements.slice(0, 10).map(el => el.name)} days={30} />
            ) : (
              <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
                <Settings2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Find worst cells first (Alarms tab), then CM changes will load for those cells</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>

      {/* AI Panel */}
      {showAIPanel && (
        <div className="w-[380px] shrink-0 border-l border-border h-full">
          <InvestigatorAIPanel onClose={() => setShowAIPanel(false)} />
        </div>
      )}
    </div>
  );
};

export default InvestigatorPage;
