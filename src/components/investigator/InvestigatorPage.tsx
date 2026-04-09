import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import AnalysisTabBar from './AnalysisTabBar';
import { useAnalysisTabs, TabContextSnapshot } from './useAnalysisTabs';
import ControlPanel from './ControlPanel';
import KPIGraphs from './KPIGraphs';
import KPIHistogram from './KPIHistogram';
import KPIBreakdown from './KPIBreakdown';
import AlarmsTabContent from './AlarmsTabContent';
import NeighborsTabContent from './NeighborsTabContent';
import CMHistoryTabContent from './CMHistoryTabContent';
import CounterGraphSection from './CounterGraphSection';
import HistogramSection from './HistogramSection';
import SliceMappingSection from './SliceMappingSection';
import WorstElementsTable from './WorstElementsTable';
import TopWorstTabContent from './TopWorstTabContent';
import InvestigatorAIPanel from './InvestigatorAIPanel';
import InvestigatorDataTable from './InvestigatorDataTable';
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement, WidgetType, KpiDefinition, Granularity, normalizeGranularity } from './types';
import { fetchKpiDefinitions, fetchWorstByDOR, fetchWorstCellsDirect, fetchFilterValues, fetchCellDetails, resolveSlotContext, fetchTimeSeriesForSlot } from './investigatorApi';
import {
  Maximize2, Minimize2, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
  Settings2, Bell, Cpu, Layers, Table2, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';


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
  granularity: '' as Granularity,
  splitBy: 'None',
});

/** Build a context snapshot from a graph slot + global state */
function buildSnapshot(slot: GraphSlot, globalState: any): TabContextSnapshot {
  return {
    sourceGraphId: slot.id,
    sourceGraphTitle: slot.name,
    kpiIds: slot.kpiIds,
    filters: { ...globalState.filters, ...slot.filters },
    startDate: slot.startDate || globalState.startDate,
    endDate: slot.endDate || globalState.endDate,
    granularity: slot.granularity || globalState.granularity,
    kpiLevel: globalState.kpiLevel,
    splitBy: slot.splitBy !== 'None' ? slot.splitBy : globalState.splitBy !== 'None' ? globalState.splitBy : null,
  };
}

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
  const [analysisTab, setAnalysisTab] = React.useState<'breakdown' | 'table_data' | 'top_worst' | 'counters' | 'histograms' | 'slicing' | 'alarms' | 'neighbors' | 'cm_history' | null>(null);
  const [isGraphFullscreen, setIsGraphFullscreen] = React.useState(false);
  const analysisTabs = useAnalysisTabs();
  const [tableDataSlotId, setTableDataSlotId] = React.useState<string | null>(null);

  // Escape key exits fullscreen
  React.useEffect(() => {
    if (!isGraphFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsGraphFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isGraphFullscreen]);

  React.useEffect(() => {
    if (!isGraphFullscreen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isGraphFullscreen]);

  const [worstByDOR, setWorstByDOR] = React.useState<Record<string, WorstElement[]>>({});
  const [worstFilters, setWorstFilters] = React.useState<{ dimension: string; op: string; values: string[] }[]>([]);
  const [worstFilterOptions, setWorstFilterOptions] = React.useState<Record<string, string[]>>({});
  const [isLoadingWorst, setIsLoadingWorst] = React.useState(false);
  const [hasUnfilteredFallback, setHasUnfilteredFallback] = React.useState(false);
  const [kpiMetaMap, setKpiMetaMap] = React.useState<Map<string, KpiDefinition>>(new Map());
  const handleApplyRef = useRef<() => void>(() => {});
  const abortRef = useRef<AbortController | null>(null);

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
    (async () => {
      const dors = await fetchFilterValues('DOR');
      const plaques = await fetchFilterValues('PLAQUE');
      const bands = await fetchFilterValues('BAND');
      setWorstFilterOptions({ DOR: dors, PLAQUE: plaques, BAND: bands });
    })();
  }, []);

  // Auto-select first slot if none selected or active was removed
  useEffect(() => {
    if (state.graphSlots.length === 0) {
      setActiveSlotId(null);
    } else if (!activeSlotId || !state.graphSlots.find(s => s.id === activeSlotId)) {
      setActiveSlotId(state.graphSlots[0].id);
    }
  }, [state.graphSlots, activeSlotId]);

  // ═══ Auto-sync bottom panels to active graph ═══
  // When activeSlotId changes, auto-activate/create tabs linked to that graph
  const prevActiveSlotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSlotId || activeSlotId === prevActiveSlotRef.current) return;
    prevActiveSlotRef.current = activeSlotId;

    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    if (!slot) return;

    const snapshot = buildSnapshot(slot, state);

    // Auto-sync table data to active graph
    setTableDataSlotId(activeSlotId);

    // Auto-sync multi-tab sections
    const sections = ['top_worst', 'alarms', 'neighbors', 'cm_history'] as const;
    for (const sec of sections) {
      analysisTabs.findOrCreateForGraph(sec, activeSlotId, snapshot, slot.name);
    }
  }, [activeSlotId, state.graphSlots]);

  const hasFilters = Object.values(state.filters).some(vals => vals.length > 0);
  const hasKpis = state.graphSlots.some(s => s.kpiIds.length > 0);

  // Get active slot for context
  const activeSlot = useMemo(() => 
    state.graphSlots.find(s => s.id === activeSlotId) || null
  , [state.graphSlots, activeSlotId]);

  // Build current snapshot for active graph
  const activeSnapshot = useMemo(() => 
    activeSlot ? buildSnapshot(activeSlot, state) : null
  , [activeSlot, state]);

  const handleApply = async () => {
    if (!hasFilters) {
      setApplyError('Veuillez sélectionner au moins un filtre (Site, Cell…) avant de lancer la requête.');
      return;
    }

    const targetSlot = activeSlotId
      ? state.graphSlots.find(s => s.id === activeSlotId && s.kpiIds.length > 0)
      : null;

    if (!targetSlot) {
      setApplyError('Veuillez sélectionner un graphe actif avec au moins un KPI.');
      return;
    }

    if (import.meta.env.DEV) console.log('[Investigator] Apply → active slot only:', targetSlot.id, targetSlot.name);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setApplyError(null);
    setIsApplying(true);
    setHasUnfilteredFallback(false);

    try {
      const ctx = resolveSlotContext(targetSlot, state);
      const queryStart = Date.now();
      const result = await fetchTimeSeriesForSlot(ctx);

      if (controller.signal.aborted) return;

      const taggedData = result.data.map(d => ({ ...d, _slotId: targetSlot.id }));
      const otherData = tsData.filter((d: any) => d._slotId !== targetSlot.id);
      setTsData([...otherData, ...taggedData]);
      setHasLoadedOnce(true);

      if (taggedData.length === 0) {
        setApplyError(`Aucune donnée trouvée pour « ${targetSlot.name} ». Vérifiez la période et les filtres.`);
      }

      if (result.hasUnfilteredFallback) setHasUnfilteredFallback(true);

      if (import.meta.env.DEV) console.log(`[Investigator] Slot ${targetSlot.id}: ${taggedData.length} points in ${Date.now() - queryStart}ms`);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error('[Investigator] API error:', e);
      setApplyError('Erreur lors de la requête. Veuillez réessayer.');
    }
    setIsApplying(false);
  };
  handleApplyRef.current = handleApply;

  // Counter timeseries — tag with slotId for isolation
  const counterKey = selectedCounters.map((c: any) => c.counter_name).join(',');
  React.useEffect(() => {
    if (selectedCounters.length === 0) return;
    const slotId = activeSlotId || 'global';
    const body = {
      counter_names: selectedCounters.map((c: any) => c.counter_name),
      date_from: state.startDate.split('T')[0],
      date_to: state.endDate.split('T')[0],
      granularity: normalizeGranularity(state.granularity),
    };
    const ctrl = new AbortController();
    fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST', headers: { ...getApiHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
    }).then(r => r.ok ? r.json() : {series:[]}).then(data => {
      const counterPoints = (data.series || []).map((s: any) => ({
        timestamp: s.ts, kpi: s.counter, value: s.value, _isCounter: true, _slotId: slotId,
      }));
      // Remove old counter points for THIS slot only, preserve others
      const current = useInvestigatorStore.getState().tsData.filter((d: any) => !(d._isCounter && d._slotId === slotId));
      setTsData([...current, ...counterPoints]);
    }).catch(() => {});
    return () => ctrl.abort();
  }, [counterKey, state.startDate, state.endDate, state.granularity, activeSlotId, selectedCounters, setTsData]);

  const handleFindWorst = async () => {
    setIsLoadingWorst(true);
    try {
      const kpiIds = activeSlot?.kpiIds || state.graphSlots.flatMap(s => s.kpiIds);
      if (!kpiIds.length) { setIsLoadingWorst(false); return; }
      const dateFrom = state.startDate.split('T')[0];
      const dateTo = state.endDate.split('T')[0];

      const allFilters = [...worstFilters];
      const siteFromState = state.filters?.['Site']?.[0] || state.filters?.['SITE']?.[0];
      if (siteFromState && !allFilters.some(f => f.dimension.toUpperCase() === 'SITE')) {
        allFilters.push({ dimension: 'SITE', op: 'IN', values: [siteFromState] });
      }
      const byDOR = await fetchWorstCellsDirect(kpiIds, state.topLimit, dateFrom, dateTo, allFilters, kpiMetaMap);

      const allCells = Object.values(byDOR).flat();
      const cellNames = allCells.map(c => c.name).filter(Boolean);
      let finalByDOR = byDOR;
      try {
        const cellDetails = cellNames.length > 0 ? await fetchCellDetails(cellNames) : [];
        const detailMap: Record<string, any> = {};
        for (const d of cellDetails) detailMap[d.cell_name] = d;

        const enriched: Record<string, typeof allCells> = {};
        for (const [dor, elements] of Object.entries(byDOR)) {
          enriched[dor] = elements.map(el => {
            const detail = detailMap[el.name];
            if (detail) {
              return {
                ...el,
                vendor: detail.vendor || el.vendor,
                dor: detail.dor || el.dor || dor,
                plaque: detail.plaque || el.plaque || '',
                band: detail.band || el.band || '',
                site_name: detail.site_name || el.site_name || '',
                alarms: detail.alarms,
                latest_alarms: detail.latest_alarms,
              };
            }
            return el;
          });
        }
        finalByDOR = enriched;
        setWorstByDOR(enriched);
      } catch {
        setWorstByDOR(byDOR);
      }
      setWorstElements(Object.values(finalByDOR).flat() as WorstElement[]);
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

  const handleUpdateSlotConfig = (slotId: string, updates: Partial<GraphConfig>) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s =>
        s.id === slotId ? { ...s, config: { ...(s.config || DEFAULT_GRAPH_CONFIG), ...updates } } : s
      ),
    }));
  };

  const renderGraphSection = () => (
    <section className={cn(
      'space-y-4',
      isGraphFullscreen && 'fixed inset-0 z-[100] bg-background p-4 md:p-6 overflow-auto'
    )}>
      <div className={cn(
        'flex items-center justify-between border-b border-border/40 pb-3',
        isGraphFullscreen && 'sticky top-0 z-10 bg-background/95 backdrop-blur-sm'
      )}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Maximize2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">KPI Graph Analysis</h2>
            <p className="text-[10px] text-muted-foreground">Visual trend analysis and performance tracking</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
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

          <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
            {([
              { val: 1 as const, icon: Square, title: 'Single' },
              { val: 2 as const, icon: Columns2, title: 'Dual' },
            ]).map(l => (
              <button
                key={l.val}
                onClick={() => setState(prev => ({ ...prev, graphLayout: l.val }))}
                title={l.title}
                className={cn(
                  'p-1.5 rounded-md transition-all',
                  state.graphLayout === l.val && !isGraphFullscreen
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <l.icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <button
              onClick={() => {
                const goingFullscreen = !isGraphFullscreen;
                if (goingFullscreen && !activeSlotId && state.graphSlots.length > 0) {
                  setActiveSlotId(state.graphSlots[0].id);
                }
                setIsGraphFullscreen(goingFullscreen);
              }}
              title={isGraphFullscreen ? 'Quitter plein écran' : 'Plein écran'}
              className={cn(
                'p-1.5 rounded-md transition-all',
                isGraphFullscreen
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isGraphFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
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
          isFullscreen={isGraphFullscreen}
          onActivateTab={(tab) => setAnalysisTab(tab)}
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
                Les KPIs neighbor sont affichés dans le graphe TimeSeries ci-dessus. Utilisez le filtre "Type" pour isoler X2, HO LTE ou HO UTRAN.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Activity className="w-12 h-12 text-cyan-500/20" />
              <p className="text-sm font-semibold text-muted-foreground">
                {state.kpiLevel !== 'NEIGHBOR'
                  ? 'Passez au niveau "Neighbor" dans la barre de filtres pour analyser les relations de voisinage'
                  : 'Sélectionnez des KPIs Neighbor (NEIGH_*) et appliquez'}
              </p>
              <p className="text-[10px] text-muted-foreground max-w-md">
                Le flux de voisinage affiche les handovers entrants/sortants, les taux de succès HO et la topologie des relations entre cellules adjacentes.
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
  );

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
        onActivateTab={(tab) => setAnalysisTab(tab as any)}
      />

      {/* Main Content */}
      <main className="flex-1 px-4 md:px-[2.5%] pt-5 pb-6 space-y-6 w-full">
        {/* Error toast */}
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

        {hasUnfilteredFallback && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
            <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400">
              Certains KPIs proviennent d'un fallback non-filtré (raw PM counters). Les filtres actifs ne s'appliquent pas à ces données.
            </span>
          </div>
        )}

        {!isGraphFullscreen && renderGraphSection()}

        {/* ═══ Analysis Tabs ═══ */}
        {(() => {
          // Visibility based on active graph's config (not global some())
          const activeConfig = activeSlot?.config || DEFAULT_GRAPH_CONFIG;
          const configKeyMap: Record<string, keyof GraphConfig> = {
            table_data: 'showDataTable',
            breakdown: 'showBreakdown',
            top_worst: 'showTopWorst',
            alarms: 'showAlarms',
            neighbors: 'showNeighbors',
          };
          const allTabs = [
            { key: 'table_data' as const, icon: Table2, label: 'Table Data', color: 'text-blue-500' },
            { key: 'breakdown' as const, icon: PieChart, label: 'KPI Breakdown', color: 'text-purple-500' },
            { key: 'top_worst' as const, icon: AlertTriangle, label: 'Top Worst Cells', color: 'text-orange-500' },
            { key: 'alarms' as const, icon: Bell, label: 'Alarms', color: 'text-red-500' },
            { key: 'neighbors' as const, icon: Layers, label: 'Neighbors', color: 'text-blue-500' },
            { key: 'cm_history' as const, icon: Settings2, label: 'CM History', color: 'text-orange-500' },
          ];
          const visibleTabs = allTabs.filter(tab => {
            const cfgKey = configKeyMap[tab.key];
            if (!cfgKey) return true; // cm_history always visible
            return (activeConfig as any)[cfgKey];
          });

          if (visibleTabs.length === 0) return null;

          return (
            <div className="border-b border-border/60 sticky top-[52px] z-20 bg-background/95 backdrop-blur-sm">
              <div className="flex items-center gap-1 px-1 py-1">
                {visibleTabs.map((tab) => (
                  <button
                    key={`analysis-tab-${tab.key}`}
                    data-analysis-tab={tab.key}
                    onClick={() => {
                      const newTab = analysisTab === tab.key ? null : tab.key;
                      setAnalysisTab(newTab);
                      if (newTab && activeSlot) {
                        const snap = buildSnapshot(activeSlot, state);
                        analysisTabs.ensureTab(newTab, activeSlotId, snap);
                      }
                      if (newTab === 'top_worst' && worstElements.length === 0 && !isLoadingWorst) {
                        handleFindWorst();
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap',
                      analysisTab === tab.key
                        ? 'bg-card text-foreground shadow-sm border border-border/60'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    )}
                  >
                    <tab.icon className={cn('w-3.5 h-3.5', analysisTab === tab.key ? tab.color : '')} />
                    {tab.label}
                    {analysisTab === tab.key && (
                      <>
                        <span className={cn('w-2 h-2 rounded-full ml-1', tab.color.replace('text-', 'bg-'))} />
                        {analysisTabs.getSection(tab.key).instances.length > 0 && (
                          <span className="ml-1 text-[9px] opacity-60">
                            ({analysisTabs.getSection(tab.key).instances.length})
                          </span>
                        )}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ═══ Multi-tab bar for active section ═══ */}
        {analysisTab && analysisTab !== 'table_data' && analysisTab !== 'breakdown' && (() => {
          const sec = analysisTabs.getSection(analysisTab);
          return (
            <AnalysisTabBar
              tabs={sec.instances}
              activeId={sec.activeId}
              onSelect={(id) => analysisTabs.setActiveTab(analysisTab!, id)}
              onAdd={() => {
                const snap = activeSlot ? buildSnapshot(activeSlot, state) : null;
                analysisTabs.addTab(analysisTab!, activeSlotId, snap, activeSlot?.name);
              }}
              onRemove={(id) => {
                analysisTabs.removeTab(analysisTab!, id);
                const remaining = analysisTabs.getSection(analysisTab!).instances;
                if (remaining.length === 0) setAnalysisTab(null);
              }}
              onRename={(id, label) => analysisTabs.renameTab(analysisTab!, id, label)}
            />
          );
        })()}

        {/* ═══ Table Data: one tab per graph slot ═══ */}
        {analysisTab === 'table_data' && (() => {
          const slots = state.graphSlots;
          const effectiveSlotId = (tableDataSlotId && slots.find(s => s.id === tableDataSlotId))
            ? tableDataSlotId
            : activeSlotId || slots[0]?.id || null;
          const activeTableSlot = slots.find(s => s.id === effectiveSlotId) || null;
          const slotData = effectiveSlotId
            ? tsData.filter((d: any) => d._slotId === effectiveSlotId)
            : [];

          return (
            <>
              {slots.length > 0 && (
                <div className="flex items-center gap-1 px-1 py-1 border-b border-border/40 bg-muted/20 rounded-lg">
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      onClick={() => setTableDataSlotId(slot.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all whitespace-nowrap',
                        effectiveSlotId === slot.id
                          ? 'bg-card text-primary shadow-sm border border-primary/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <Table2 className="w-3 h-3" />
                      {slot.name}
                      <span className="text-[8px] opacity-50 ml-0.5">
                        ({slot.kpiIds.length} KPI{slot.kpiIds.length !== 1 ? 's' : ''})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {activeTableSlot && (
                <div className="flex items-center gap-3 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground">
                  <span className="font-bold text-primary">Source:</span>
                  <span>{activeTableSlot.name}</span>
                  <span className="opacity-40">|</span>
                  <span>KPIs: {activeTableSlot.kpiIds.join(', ') || '—'}</span>
                  <span className="opacity-40">|</span>
                  <span>{slotData.length} rows</span>
                </div>
              )}

              <InvestigatorDataTable
                tsData={slotData}
                activeSlot={activeTableSlot}
              />
            </>
          );
        })()}

        {/* ═══ KPI Breakdown: linked to active graph ═══ */}
        {analysisTab === 'breakdown' && activeSlot && activeSlot.kpiIds.length > 0 && (
          <section>
            <KPIBreakdown
              selectedKpis={activeSlot.kpiIds}
              layout={state.graphLayout}
              dateFrom={(activeSlot.startDate || state.startDate).split("T")[0] || "2026-01-01"}
              dateTo={(activeSlot.endDate || state.endDate).split("T")[0] || "2026-03-24"}
              granularity={activeSlot.granularity || state.granularity}
              filters={Object.entries({ ...state.filters, ...activeSlot.filters })
                .filter(([,v]) => v.length > 0)
                .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }))}
              splitBy={activeSlot.splitBy !== 'None' ? activeSlot.splitBy : state.splitBy !== 'None' ? state.splitBy : undefined}
              timeSeriesData={tsData.filter((d: any) => d._slotId === activeSlot.id)}
            />
          </section>
        )}

        {/* Top Worst – keep all instances mounted, show only active */}
        {(() => {
          const sec = analysisTabs.getSection('top_worst');
          const activeTabId = sec.activeId || sec.instances[0]?.id || null;
          return sec.instances.map(inst => (
            <div key={inst.id} style={{ display: analysisTab === 'top_worst' && inst.id === activeTabId ? undefined : 'none' }}>
              <TopWorstTabContent tabId={inst.id} contextSnapshot={inst.contextSnapshot} />
            </div>
          ));
        })()}

        {/* Alarms – keep all instances mounted */}
        {(() => {
          const sec = analysisTabs.getSection('alarms');
          const activeTabId = sec.activeId || sec.instances[0]?.id || null;
          return sec.instances.map(inst => (
            <div key={inst.id} style={{ display: analysisTab === 'alarms' && inst.id === activeTabId ? undefined : 'none' }}>
              <AlarmsTabContent tabId={inst.id} contextSnapshot={inst.contextSnapshot} />
            </div>
          ));
        })()}

        {analysisTab === 'counters' && (
          <CounterGraphSection
            dateFrom={state.startDate.split('T')[0]}
            dateTo={state.endDate.split('T')[0]}
          />
        )}

        {/* Neighbors – keep all instances mounted */}
        {(() => {
          const sec = analysisTabs.getSection('neighbors');
          const activeTabId = sec.activeId || sec.instances[0]?.id || null;
          return sec.instances.map(inst => (
            <div key={inst.id} style={{ display: analysisTab === 'neighbors' && inst.id === activeTabId ? undefined : 'none' }}>
              <NeighborsTabContent tabId={inst.id} contextSnapshot={inst.contextSnapshot} />
            </div>
          ));
        })()}

        {/* CM History – keep all instances mounted */}
        {(() => {
          const sec = analysisTabs.getSection('cm_history');
          const activeTabId = sec.activeId || sec.instances[0]?.id || null;
          return sec.instances.map(inst => (
            <div key={inst.id} style={{ display: analysisTab === 'cm_history' && inst.id === activeTabId ? undefined : 'none' }}>
              <CMHistoryTabContent tabId={inst.id} contextSnapshot={inst.contextSnapshot} />
            </div>
          ));
        })()}
      </main>
    </div>

    {isGraphFullscreen && typeof document !== 'undefined' && createPortal(renderGraphSection(), document.body)}

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
