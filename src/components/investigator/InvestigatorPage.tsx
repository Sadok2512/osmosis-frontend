import React, { useEffect, useState, useRef } from 'react';
import ControlPanel from './ControlPanel';
import KPIGraphs from './KPIGraphs';
import KPIHistogram from './KPIHistogram';
import KPIBreakdown from './KPIBreakdown';
import CMChangesCard from './CMChangesCard';
import CounterGraphSection from './CounterGraphSection';
import HistogramSection from './HistogramSection';
import SliceMappingSection from './SliceMappingSection';
import WorstElementsTable from './WorstElementsTable';
import InvestigatorAIPanel from './InvestigatorAIPanel';
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement, WidgetType, KpiDefinition, Granularity, normalizeGranularity } from './types';
import { fetchKpiDefinitions, fetchWorstByDOR, fetchFilterValues, fetchCellDetails, resolveSlotContext, fetchTimeSeriesForSlot } from './investigatorApi';
import {
  LayoutGrid, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
  Settings2, Bell, Cpu, Layers, Table2, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { preloadAllFilters } from '@/stores/investigatorFilterCache';


const WIDGET_NAMES: Record<WidgetType, string> = {
  timeseries: 'Timeseries',
  histogram: 'Histogram',
  kpi_card: 'KPI Card',
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
  granularity: '' as Granularity,  // empty = use global granularity from toolbar
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
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedCounters, setSelectedCounters] = React.useState<any[]>([]);
  const [analysisTab, setAnalysisTab] = React.useState<'breakdown' | 'table_data' | 'counters' | 'histograms' | 'slicing' | 'alarms' | 'cm_history'>('breakdown');
  const [worstByDOR, setWorstByDOR] = React.useState<Record<string, WorstElement[]>>({});
  const [worstFilters, setWorstFilters] = React.useState<{ dimension: string; op: string; values: string[] }[]>([]);
  const [worstFilterOptions, setWorstFilterOptions] = React.useState<Record<string, string[]>>({});
  const [isLoadingWorst, setIsLoadingWorst] = React.useState(false);
  const [hasUnfilteredFallback, setHasUnfilteredFallback] = React.useState(false);
  const [kpiMetaMap, setKpiMetaMap] = React.useState<Map<string, KpiDefinition>>(new Map());
  const handleApplyRef = useRef<() => void>(() => {});

  // Load KPI metadata for severity/ranking
  React.useEffect(() => {
    fetchKpiDefinitions().then(kpis => {
      const map = new Map<string, KpiDefinition>();
      for (const k of kpis) map.set(k.id, k);
      setKpiMetaMap(map);
    });
  }, []);

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

  const hasFilters = Object.values(state.filters).some(vals => vals.length > 0);
  const hasKpis = state.graphSlots.some(s => s.kpiIds.length > 0);

  // No auto-refresh: queries only run on explicit "Appliquer" click

  const handleApply = async () => {
    // Require at least one dimension filter (Site, Cell, etc.)
    if (!hasFilters) return;

    // Require at least one KPI in a graph slot
    const slotsWithKpis = state.graphSlots.filter(s => s.kpiIds.length > 0);
    if (slotsWithKpis.length === 0) {
      setApplyError('Veuillez ajouter au moins un KPI dans un graphe avant de lancer la requête.');
      return;
    }

    setApplyError(null);
    setIsApplying(true);
    setTsData([]);  // Clear old data before fetching new
    setHasUnfilteredFallback(false);
    try {

      // Bug #1 + #2: Issue separate requests per slot (respects per-slot splits, filters, dates)
      // Group slots by their effective split dimension to minimize requests
      const slotContexts = slotsWithKpis.map(slot => ({
        slot,
        ctx: resolveSlotContext(slot, state),
      }));

      console.log('[Investigator] Slots:', slotContexts.map(s => ({
        kpis: s.ctx.kpiIds, dateFrom: s.ctx.dateFrom, dateTo: s.ctx.dateTo,
        gran: s.ctx.granularity, filters: s.ctx.filters,
      })));

      const results = await Promise.all(
        slotContexts.map(async ({ ctx }) => {
          console.log('[Investigator] Fetching slot:', ctx.kpiIds, 'from', ctx.dateFrom, 'to', ctx.dateTo, 'gran', ctx.granularity);
          const result = await fetchTimeSeriesForSlot(ctx);
          console.log('[Investigator] Result:', result.data.length, 'points');
          return result;
        })
      );

      // Merge all results
      const allData = results.flatMap(r => r.data);
      console.log('[Investigator] Total data points:', allData.length);
      const anyUnfiltered = results.some(r => r.hasUnfilteredFallback);
      setHasUnfilteredFallback(anyUnfiltered);
      setTsData(allData);
      setHasLoadedOnce(true);
    } catch (e) {
      console.error('[Investigator] API error:', e);
    }
    setIsApplying(false);
  };
  handleApplyRef.current = handleApply;

  // Fetch counter timeseries when counters are selected
  React.useEffect(() => {
    if (selectedCounters.length === 0) return;
    const body = {
      counter_names: selectedCounters.map((c: any) => c.counter_name),
      date_from: state.startDate.split('T')[0] || '2026-03-24',
      date_to: state.endDate.split('T')[0] || '2026-03-31',
      granularity: normalizeGranularity(state.granularity),
    };
    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST', headers: { ...getApiHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.ok ? r.json() : {series:[]}).then(data => {
      const counterPoints = (data.series || []).map((s: any) => ({
        timestamp: s.ts, kpi: s.counter, value: s.value,
      }));
      const current = useInvestigatorStore.getState().tsData;
      setTsData([...current, ...counterPoints]);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCounters.map((c:any) => c.counter_name).join(','), state.startDate, state.endDate, state.granularity]);

  const handleFindWorst = async () => {
    setIsLoadingWorst(true);
    try {
      const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
      if (!kpiIds.length) { setIsLoadingWorst(false); return; }
      const dateFrom = state.startDate.split('T')[0] || '2026-01-01';
      const dateTo = state.endDate.split('T')[0] || '2026-03-24';

      // Bug #5: Single grouped query instead of N+1
      const byDOR = await fetchWorstByDOR(kpiIds, state.topLimit, dateFrom, dateTo, worstFilters, kpiMetaMap);

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

  // Manual apply only — user must click "Appliquer" to load data

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
        selectedCounters={selectedCounters}
        onSelectedCountersChange={setSelectedCounters}
      />

      {/* Main Content */}
      <main className="flex-1 p-5 md:px-6 md:pt-5 md:pb-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Error toast when no KPIs selected */}
        {applyError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 flex-1">
              {applyError}
            </span>
            <button onClick={() => setApplyError(null)} className="text-red-600 hover:text-red-800 dark:hover:text-red-300">
              <span className="text-xs font-bold">✕</span>
            </button>
          </div>
        )}

        {/* Bug #3: Warning when fallback data is unfiltered */}
        {hasUnfilteredFallback && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
            <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400">
              Certains KPIs proviennent d'un fallback non-filtré (raw PM counters). Les filtres actifs ne s'appliquent pas à ces données.
            </span>
          </div>
        )}

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
              onSetSlotCounterIds={(slotId, cIds) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === slotId ? { ...s, counterIds: cIds } : s),
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
              onDuplicateSlot={(slotId) => setState(prev => {
                const source = prev.graphSlots.find(s => s.id === slotId);
                if (!source) return prev;
                const dup = { ...source, id: `slot-${Date.now()}-dup`, name: `${source.name} (copie)`, config: source.config ? { ...source.config } : undefined };
                return { ...prev, graphSlots: [...prev.graphSlots, dup] };
              })}
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
              { key: 'breakdown' as const, icon: PieChart, label: 'KPI Breakdown', color: 'text-purple-500' },
              { key: 'table_data' as const, icon: Table2, label: 'Table Data', color: 'text-blue-500' },
              { key: 'counters' as const, icon: Cpu, label: 'PM Counters', color: 'text-emerald-500' },
              { key: 'histograms' as const, icon: BarChart3, label: 'Histogrammes', color: 'text-cyan-500' },
              { key: 'slicing' as const, icon: Layers, label: 'QoS / Slicing', color: 'text-purple-500' },
              { key: 'alarms' as const, icon: Bell, label: 'Alarms & Worst Cells', color: 'text-red-500' },
              { key: 'cm_history' as const, icon: Settings2, label: 'CM History', color: 'text-orange-500' },
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
              </button>
            ))}
          </div>
        </div>

        {/* ═══ Tab Content ═══ */}

        {/* KPI Breakdown */}
        {analysisTab === 'breakdown' && state.graphSlots.flatMap(s => s.kpiIds).length > 0 && (
          <section className="space-y-4">
            <KPIBreakdown selectedKpis={state.graphSlots.flatMap(s => s.kpiIds)} layout={state.graphLayout} dateFrom={state.startDate.split("T")[0] || "2026-01-01"} dateTo={state.endDate.split("T")[0] || "2026-03-24"} filters={Object.entries(state.filters).filter(([,v]) => v.length > 0).map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }))} splitBy={state.splitBy !== 'None' ? state.splitBy : undefined} />
          </section>
        )}

        {/* PM Counters */}
        {analysisTab === 'counters' && selectedCounters.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Utilisez "Add Counter" dans la toolbar ci-dessus pour ajouter des compteurs PM au graphe.</p>
          </div>
        )}
        {analysisTab === 'counters' && selectedCounters.length > 0 && (
          <CounterGraphSection
            dateFrom={state.startDate.split("T")[0] || "2026-01-01"}
            dateTo={state.endDate.split("T")[0] || "2026-03-24"}
          />
        )}

        {analysisTab === 'table_data' && (
          <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-2">
              <Table2 className="w-4 h-4 text-blue-500" />
              <span className="text-[11px] font-bold text-foreground">Table Data</span>
              <span className="text-[9px] text-muted-foreground ml-auto">{tsData.length} points</span>
              {tsData.length > 0 && (
                <button
                  onClick={() => {
                    const kpis = [...new Set(tsData.map(d => d.kpi))];
                    const timestamps = [...new Set(tsData.map(d => d.timestamp))].sort();
                    const lookup: Record<string, Record<string, number>> = {};
                    kpis.forEach(k => { lookup[k] = {}; });
                    tsData.forEach(p => { if (lookup[p.kpi]) lookup[p.kpi][p.timestamp] = p.value; });
                    const header = ['Timestamp', ...kpis].join(',');
                    const rows = timestamps.map(t => {
                      const vals = kpis.map(k => lookup[k]?.[t] ?? '');
                      return [t.length > 10 ? t.slice(0, 16).replace('T', ' ') : t, ...vals].join(',');
                    });
                    const csv = [header, ...rows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'table_data.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
            <div className="overflow-auto" style={{ maxHeight: 500 }}>
              {tsData.length > 0 ? (() => {
                const kpis = [...new Set(tsData.map(d => d.kpi))];
                const timestamps = [...new Set(tsData.map(d => d.timestamp))].sort();
                const lookup: Record<string, Record<string, number>> = {};
                kpis.forEach(k => { lookup[k] = {}; });
                tsData.forEach(p => { if (lookup[p.kpi]) lookup[p.kpi][p.timestamp] = p.value; });
                const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#ef4444','#6366f1','#14b8a6'];

                return (
                  <table className="w-full border-collapse text-[10px] font-mono">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/70 backdrop-blur-sm">
                        <th className="px-2.5 py-2 text-left font-bold text-muted-foreground border-b-2 border-r border-border/40 whitespace-nowrap min-w-[100px]">
                          Timestamp
                        </th>
                        {kpis.map((k, i) => (
                          <th key={k} className="px-2.5 py-2 text-right font-bold text-muted-foreground border-b-2 border-r border-border/40 last:border-r-0 whitespace-nowrap min-w-[80px]">
                            <div className="flex items-center justify-end gap-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <span className="truncate max-w-[120px]">{k}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timestamps.map((ts, ti) => (
                        <tr
                          key={ti}
                          className={cn(
                            'border-b border-border/20 hover:bg-primary/5 transition-colors',
                            ti % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                          )}
                        >
                          <td className="px-2.5 py-1.5 text-foreground/80 border-r border-border/20 whitespace-nowrap font-medium">
                            {ts.length > 10 ? ts.slice(0, 16).replace('T', ' ') : ts}
                          </td>
                          {kpis.map((k, ki) => {
                            const val = lookup[k]?.[ts];
                            return (
                              <td key={ki} className="px-2.5 py-1.5 text-right text-foreground border-r border-border/20 last:border-r-0 whitespace-nowrap tabular-nums">
                                {val != null ? Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })() : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-[10px]">
                  Aucune donnée — cliquez sur Appliquer
                </div>
              )}
            </div>
          </div>
        )}

        {!['breakdown', 'table_data'].includes(analysisTab) && (
          <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-12 text-center">
            <p className="text-xs text-muted-foreground">Section « {analysisTab} » — à venir</p>
          </div>
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
