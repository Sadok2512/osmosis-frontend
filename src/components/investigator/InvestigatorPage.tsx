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
import InvestigatorSaveLoadBar from './InvestigatorSaveLoadBar';
import InvestigatorTabBar from './InvestigatorTabBar';
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement, WidgetType, KpiDefinition, Granularity, normalizeGranularity } from './types';
import { fetchKpiDefinitions, fetchWorstByDOR, fetchWorstCellsDirect, fetchFilterValues, fetchCellDetails, resolveSlotContext, fetchTimeSeriesForSlot } from './investigatorApi';
import {
  Maximize2, Minimize2, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
  Settings2, Bell, Cpu, Layers, Table2, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestigatorWorkspace, type InvestigatorInstance } from '@/stores/investigatorWorkspaceStore';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import type { SavedInvestigator } from '@/services/investigatorService';
import { toast } from 'sonner';


const WIDGET_NAMES: Record<WidgetType, string> = {
  timeseries: 'Timeseries',
  histogram: 'Histogram',
  kpi_card: 'KPI Card',
  neighbors: 'Neighbors',
};

const createSlot = (index: number, kpiIds: string[] = [], widgetType: WidgetType = 'timeseries', initialFilters: Record<string, string[]> = {}): GraphSlot => ({
  id: `slot-${Date.now()}-${index}`,
  kpiIds,
  name: `${WIDGET_NAMES[widgetType]} ${index}`,
  widgetType,
  config: {
    ...DEFAULT_GRAPH_CONFIG,
    ...(widgetType === 'timeseries' ? { showDataTable: true } : {}),
  },
  filters: { ...initialFilters },
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

function isSectionEnabled(slot: GraphSlot | null | undefined, flag: keyof GraphConfig): boolean {
  if (!slot) return false;
  if (flag === 'showDataTable' && (slot.widgetType || 'timeseries') === 'timeseries') {
    return slot.config?.showDataTable ?? true;
  }
  return Boolean((slot.config as any)?.[flag] ?? (DEFAULT_GRAPH_CONFIG as any)[flag]);
}

/* ═══════════════════════════════════════════════════════════
   InvestigatorWorkspace — multi-tab wrapper
   ═══════════════════════════════════════════════════════════ */
const InvestigatorWorkspace: React.FC = () => {
  const { instances, activeInstanceId, addNewTab, closeTab, setActiveTab, renameTab, duplicateTab, loadIntoNewTab } = useInvestigatorWorkspace();

  const handleCloseTab = (id: string) => {
    const inst = instances.find(i => i.instanceId === id);
    if (inst?.hasUnsavedChanges) {
      if (!window.confirm(`"${inst.name}" has unsaved changes. Close anyway?`)) return;
    }
    closeTab(id);
  };

  const handleCloseOthers = (id: string) => {
    const toClose = instances.filter(i => i.instanceId !== id);
    const hasUnsaved = toClose.some(i => i.hasUnsavedChanges);
    if (hasUnsaved && !window.confirm('Some tabs have unsaved changes. Close them anyway?')) return;
    toClose.forEach(i => closeTab(i.instanceId));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Render all instances, show only active via CSS for instant switching */}
      {instances.map(inst => (
        <div
          key={inst.instanceId}
          className="flex-1 overflow-hidden"
          style={{ display: inst.instanceId === activeInstanceId ? 'flex' : 'none' }}
        >
          <InvestigatorPageInstance
            instanceId={inst.instanceId}
            tabBar={
              <InvestigatorTabBar
                instances={instances}
                activeInstanceId={activeInstanceId}
                onActivate={setActiveTab}
                onAdd={() => addNewTab()}
                onClose={handleCloseTab}
                onRename={renameTab}
                onDuplicate={duplicateTab}
                onCloseOthers={handleCloseOthers}
              />
            }
          />
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   InvestigatorPageInstance — one investigator (fully isolated)
   ═══════════════════════════════════════════════════════════ */
const InvestigatorPageInstance: React.FC<{ instanceId: string; tabBar: React.ReactNode }> = ({ instanceId, tabBar }) => {
  const ws = useInvestigatorWorkspace();
  const inst = ws.instances.find(i => i.instanceId === instanceId);

  const state = inst?.state ?? {
    dimension: 'Cell' as const, selectedKpis: [], graphSlots: [], splitBy: 'None',
    startDate: '', endDate: '', granularity: '1d' as const, filters: {}, topLimit: 10,
    sortBy: null, graphLayout: 2 as const, activeGraphTab: 'TimeSeries' as const, jalons: [],
    kpiLevel: 'CELL' as const, profileQci: null, profileArp: null, neighborType: null,
  };
  const tsData = inst?.tsData ?? [];
  const activeSlotId = inst?.activeSlotId ?? null;
  const worstElements = inst?.worstElements ?? [];

  // Helper to update state
  const setState = useCallback((updater: any) => {
    ws.updateInstanceState(instanceId, updater);
  }, [instanceId]);

  const setTsData = useCallback((d: any) => ws.updateInstance(instanceId, { tsData: d }), [instanceId]);
  const setWorstElements = useCallback((w: any) => ws.updateInstance(instanceId, { worstElements: w }), [instanceId]);
  const setActiveSlotId = useCallback((id: string | null) => {
    ws.updateInstance(instanceId, { activeSlotId: id });
  }, [instanceId]);
  const setHasLoadedOnce = useCallback((v: boolean) => ws.updateInstance(instanceId, { hasLoadedOnce: v }), [instanceId]);
  const setHasUnsavedChanges = useCallback((v: boolean) => ws.updateInstance(instanceId, { hasUnsavedChanges: v }), [instanceId]);
  const setCurrentInvestigatorId = useCallback((id: string | null) => ws.updateInstance(instanceId, { investigatorId: id }), [instanceId]);
  const setCurrentInvestigatorName = useCallback((name: string) => {
    ws.renameTab(instanceId, name);
  }, [instanceId]);

  const [isApplying, setIsApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedCounters, setSelectedCountersRaw] = React.useState<any[]>([]);
  /** Wrap setSelectedCounters to also sync counterIds to the active (or auto-created) slot */
  const setSelectedCounters = useCallback((counters: any[]) => {
    setSelectedCountersRaw(counters);
    const counterNames = counters.map((c: any) => c.counter_name).filter(Boolean);
    setState(prev => {
      let slots = [...prev.graphSlots];
      const currentActive = activeSlotId;
      // Find the target slot — active slot, or first slot, or create a new one
      let targetIdx = slots.findIndex(s => s.id === currentActive);
      if (targetIdx < 0 && slots.length > 0) targetIdx = 0;
      if (targetIdx < 0) {
        // No slots exist — create one with current global filters
        const newSlot = createSlot(1, [], 'timeseries', prev.filters);
        newSlot.counterIds = counterNames;
        slots = [newSlot];
        // Also set this new slot as active
        setTimeout(() => setActiveSlotId(newSlot.id), 0);
      } else {
        slots = slots.map((s, i) =>
          i === targetIdx ? { ...s, counterIds: counterNames } : s
        );
        if (!currentActive && slots[targetIdx]) {
          setTimeout(() => setActiveSlotId(slots[targetIdx].id), 0);
        }
      }
      return { ...prev, graphSlots: slots };
    });
  }, [activeSlotId, setActiveSlotId]);
  type AnalysisTabKey = 'breakdown' | 'table_data' | 'top_worst' | 'counters' | 'histograms' | 'slicing' | 'alarms' | 'neighbors' | 'cm_history';
  /** Global analysis tab — persists when switching between graph slots */
  const [analysisTab, setAnalysisTabRaw] = React.useState<AnalysisTabKey | null>(null);
  const setAnalysisTab = React.useCallback((tab: AnalysisTabKey | null) => {
    setAnalysisTabRaw(tab);
  }, []);
  const [isGraphFullscreen, setIsGraphFullscreen] = React.useState(false);
  const analysisTabs = useAnalysisTabs();
  const [tableDataSlotId, setTableDataSlotId] = React.useState<string | null>(null);
  const [kpiSelectorSlot, setKpiSelectorSlot] = React.useState<string | null>(null);

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
    let cancelled = false;
    (async () => {
      const dors = await fetchFilterValues('DOR');
      if (cancelled) return;
      const plaques = await fetchFilterValues('PLAQUE');
      if (cancelled) return;
      const bands = await fetchFilterValues('BAND');
      if (cancelled) return;
      setWorstFilterOptions({ DOR: dors, PLAQUE: plaques, BAND: bands });
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-select first slot if none selected or active was removed
  useEffect(() => {
    if (state.graphSlots.length === 0) {
      if (activeSlotId !== null) setActiveSlotId(null);
    } else if (!activeSlotId || !state.graphSlots.find(s => s.id === activeSlotId)) {
      setActiveSlotId(state.graphSlots[0].id);
    }
  }, [state.graphSlots, activeSlotId]);

  // ═══ Auto-sync bottom panels to active graph ═══
  const prevActiveSlotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSlotId || activeSlotId === prevActiveSlotRef.current) return;
    prevActiveSlotRef.current = activeSlotId;

    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    if (!slot) return;

    const cfg = slot.config || DEFAULT_GRAPH_CONFIG;
    const snapshot = buildSnapshot(slot, state);

    setTableDataSlotId(activeSlotId);

    // Only create/sync tabs for sections that are enabled on the NEW active slot
    const sectionFlagMap: Record<string, keyof GraphConfig> = {
      top_worst: 'showTopWorst',
      alarms: 'showAlarms',
      neighbors: 'showNeighbors',
      cm_history: 'showCmHistory',
    };
    for (const [sec, flag] of Object.entries(sectionFlagMap)) {
      if ((cfg as any)[flag]) {
        analysisTabs.findOrCreateForGraph(sec, activeSlotId, snapshot, slot.name);
      }
    }

    // Note: we do NOT auto-close the analysis tab when switching slots.
    // The tab bar already filters visible tabs by the active slot's flags,
    // and perSlotAnalysisTab keeps each slot's state independent.
  }, [activeSlotId, state.graphSlots]);

  // Check if the active slot (or global fallback) has filters
  const hasFilters = (() => {
    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    const filters = slot?.filters && Object.keys(slot.filters).length > 0 ? slot.filters : state.filters;
    return Object.values(filters).some(vals => vals.length > 0);
  })();
  const hasKpis = state.graphSlots.some(s => s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0);

  const activeSlot = useMemo(() => 
    state.graphSlots.find(s => s.id === activeSlotId) || null
  , [state.graphSlots, activeSlotId]);

  const activeSnapshot = useMemo(() => 
    activeSlot ? buildSnapshot(activeSlot, state) : null
  , [activeSlot, state]);

  const fetchCounterSeriesForSlot = useCallback(async (
    counterNames: string[],
    slotId: string,
    options?: { throwOnError?: boolean }
  ) => {
    if (counterNames.length === 0) return 0;

    // Find the slot to check its split config
    const slot = state.graphSlots.find(s => s.id === slotId);
    const splitPerKpi = slot?.config?.splitByPerKpi || {};
    const counterSplitVal = counterNames.map(cn => splitPerKpi[cn]).find(v => v && v !== 'None');
    const hasSplit = !!counterSplitVal;

    const body: Record<string, any> = {
      counter_names: counterNames,
      date_from: state.startDate.split('T')[0],
      date_to: state.endDate.split('T')[0],
      granularity: normalizeGranularity(state.granularity),
      split_by_dimension: hasSplit,
    };

    if (hasSplit) {
      const splitUpper = counterSplitVal!.toUpperCase();
      if (splitUpper !== 'CELL' && splitUpper !== 'SITE') {
        body.split_by_field = counterSplitVal;
      }
    }

    for (const [dim, vals] of Object.entries(state.filters || {})) {
      if (vals && vals.length > 0) {
        const key = dim.toLowerCase().replace(/\s+/g, '_');
        // Keep site filter even for CELL split so we only get cells of selected site(s)
        body[key] = vals;
      }
    }

    const response = await fetch(getApiUrl('pm/counters/timeseries'), {
      method: 'POST',
      headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (options?.throwOnError) {
        throw new Error(`Counter request failed with status ${response.status}`);
      }
      return 0;
    }

    const data = await response.json();
    const counterPoints = (data.series || []).map((s: any) => {
      // API may return counter as "L.CELL.AVAIL.DUR@SplitValue" with counter_id as clean name
      const rawCounter = s.counter || s.counter_name || counterNames[0];
      const cleanCounter = s.counter_id || (rawCounter.includes('@') ? rawCounter.split('@')[0] : rawCounter);
      const splitVal = s.dimension_key || s.cell || s.cell_name || s.site || s.site_name || s.split_value || 
        (rawCounter.includes('@') ? rawCounter.split('@').slice(1).join('@') : '');
      return {
        timestamp: s.ts,
        kpi: splitVal ? `${cleanCounter}@${splitVal}` : cleanCounter,
        value: s.value,
        splitValue: splitVal || undefined,
        networkElement: splitVal || undefined,
        _isCounter: true,
        _slotId: slotId,
      };
    });

    const current = useInvestigatorWorkspace.getState().getInstance(instanceId);
    if (!current) return counterPoints.length;

    const filtered = current.tsData.filter((d: any) => !(d._isCounter && d._slotId === slotId));
    ws.updateInstance(instanceId, {
      tsData: [...filtered, ...counterPoints],
      hasLoadedOnce: counterPoints.length > 0 || current.hasLoadedOnce,
    });

    return counterPoints.length;
  }, [instanceId, state.endDate, state.filters, state.granularity, state.graphSlots, state.startDate, ws]);

  const fetchSelectedCounterSeries = useCallback(async (options?: { throwOnError?: boolean }) => {
    const slotId = activeSlotId || state.graphSlots[0]?.id || 'global';
    return fetchCounterSeriesForSlot(
      selectedCounters.map((c: any) => c.counter_name),
      slotId,
      options,
    );
  }, [activeSlotId, fetchCounterSeriesForSlot, selectedCounters, state.graphSlots]);

  const handleApply = async () => {
    if (!hasFilters) {
      setApplyError('Veuillez sélectionner au moins un filtre (Site, Cell…) avant de lancer la requête.');
      return;
    }

    const targetSlot = activeSlotId
      ? state.graphSlots.find(s => s.id === activeSlotId && (s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0))
      : state.graphSlots.find(s => s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0) || null;

    if (!targetSlot && selectedCounters.length === 0) {
      setApplyError('Veuillez sélectionner un graphe actif avec au moins un KPI ou Counter.');
      return;
    }

    if (!targetSlot && selectedCounters.length > 0) {
      setApplyError(null);
      setIsApplying(true);
      try {
        const pointCount = await fetchSelectedCounterSeries({ throwOnError: true });
        if (pointCount === 0) {
          setApplyError('Aucune donnée trouvée pour les Counters sélectionnés. Vérifiez la période, le grain et les filtres.');
        }
      } catch (e) {
        console.error('[Investigator] Counter apply error:', e);
        setApplyError('Erreur lors de la requête Counter. Veuillez réessayer.');
      } finally {
        setIsApplying(false);
      }
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setApplyError(null);
    setIsApplying(true);
    setHasUnfilteredFallback(false);

    try {
      const slotCounterIds = targetSlot.counterIds || [];
      // Use only the slot's own counterIds — do NOT merge global selectedCounters
      // to avoid cross-slot contamination
      const allCounterNames = [...new Set(slotCounterIds)];
      const hasSlotKpis = targetSlot.kpiIds.length > 0;
      const ctx = resolveSlotContext(targetSlot, state);

      const [result, counterPointCount] = await Promise.all([
        hasSlotKpis ? fetchTimeSeriesForSlot(ctx) : Promise.resolve({ data: [], hasUnfilteredFallback: false }),
        allCounterNames.length > 0 ? fetchCounterSeriesForSlot(allCounterNames, targetSlot.id) : Promise.resolve(0),
      ]);

      if (controller.signal.aborted) return;

      const taggedData = result.data.map(d => ({ ...d, _slotId: targetSlot.id }));
      const current = useInvestigatorWorkspace.getState().getInstance(instanceId);
      const currentTsData = current?.tsData ?? tsData;
      const otherData = currentTsData.filter((d: any) => d._slotId !== targetSlot.id || d._isCounter);
      setTsData([...otherData.filter((d: any) => !(d._slotId === targetSlot.id && !d._isCounter)), ...taggedData]);
      setHasLoadedOnce(true);

      if (taggedData.length === 0 && counterPointCount === 0) {
        setApplyError(`Aucune donnée trouvée pour « ${targetSlot.name} ». Vérifiez la période et les filtres.`);
      }

      if (result.hasUnfilteredFallback) setHasUnfilteredFallback(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error('[Investigator] API error:', e);
      setApplyError('Erreur lors de la requête. Veuillez réessayer.');
    } finally {
      if (!controller.signal.aborted) setIsApplying(false);
    }
  };

  // ═══ Auto-apply for drill-down instances (name starts with "Drill:") ═══
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (!inst) return;
    if (!inst.name.startsWith('Drill:')) return;
    if (inst.hasLoadedOnce) return;
    if (!hasFilters || !hasKpis) return;
    autoAppliedRef.current = true;
    // Delay slightly to let state settle
    const timer = setTimeout(() => handleApply(), 300);
    return () => clearTimeout(timer);
  }, [inst?.name, hasFilters, hasKpis, inst?.hasLoadedOnce]);

  // Counter timeseries
  const counterKey = selectedCounters.map((c: any) => c.counter_name).join(',');
  const filterKey = JSON.stringify(state.filters);
  const fetchSelectedCounterSeriesRef = useRef(fetchSelectedCounterSeries);
  fetchSelectedCounterSeriesRef.current = fetchSelectedCounterSeries;

  React.useEffect(() => {
    if (selectedCounters.length === 0) return;
    fetchSelectedCounterSeriesRef.current().catch(() => {});
  }, [counterKey, filterKey, state.startDate, state.endDate, state.granularity, activeSlotId]);

  const handleFindWorst = async () => {
    setIsLoadingWorst(true);
    try {
      const kpiIds = activeSlot?.kpiIds ?? [];
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
      graphSlots: prev.graphSlots.map(s => {
        const baseConfig = {
          ...DEFAULT_GRAPH_CONFIG,
          ...((s.widgetType || 'timeseries') === 'timeseries' ? { showDataTable: true } : {}),
          ...(s.config || {}),
        };
        return s.id === slotId ? { ...s, config: { ...baseConfig, ...updates } } : s;
      }),
    }));
  };

  // ═══ Save / Load handlers ═══
  const handleGetContext = useCallback(() => ({
    state,
    activeSlotId,
  }), [state, activeSlotId]);

  const handleLoadInvestigator = useCallback((inv: SavedInvestigator) => {
    // Load into a NEW tab instead of replacing current
    ws.loadIntoNewTab(inv);
    toast.success(`Investigator "${inv.name}" loaded in new tab`);
  }, []);

  const handleNewInvestigator = useCallback(() => {
    ws.addNewTab();
  }, []);

  const renderGraphSection = () => (
    <section className={cn(
      'space-y-4',
      isGraphFullscreen && 'fixed inset-0 z-[100] bg-background p-4 md:p-6 overflow-auto'
    )}>
      <div className={cn(
        'flex flex-col gap-2 border-b border-border/40 pb-3',
        isGraphFullscreen && 'sticky top-0 z-10 bg-background/95 backdrop-blur-sm'
      )}>
        {/* Multi-investigator tab bar — local to this module header */}
        {tabBar}

        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <InvestigatorSaveLoadBar
            investigatorId={inst?.investigatorId ?? null}
            investigatorName={inst?.name ?? 'Untitled'}
            onNameChange={setCurrentInvestigatorName}
            getContext={handleGetContext}
            onLoad={handleLoadInvestigator}
            onNewInvestigator={handleNewInvestigator}
            onIdChange={(id) => setCurrentInvestigatorId(id)}
            hasUnsavedChanges={inst?.hasUnsavedChanges ?? false}
            onMarkSaved={() => setHasUnsavedChanges(false)}
          />
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
      </div>

      {state.activeGraphTab === 'TimeSeries' && (
        <KPIGraphs
          jalons={state.jalons}
          graphSlots={state.graphSlots}
          data={tsData}
          investigatorState={state}
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
              return { ...prev, graphSlots: [...prev.graphSlots, createSlot(nextIndex, [], widgetType || 'timeseries', prev.filters)] };
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
            const dup = {
              ...source,
              id: `slot-${Date.now()}-dup`,
              name: `${source.name} (copie)`,
              config: source.config
                ? {
                    ...source.config,
                    yAxisAssignments: { ...(source.config.yAxisAssignments || {}) },
                    splitByPerKpi: { ...(source.config.splitByPerKpi || {}) },
                    splitByPerKpi2: { ...(source.config.splitByPerKpi2 || {}) },
                    chartTypePerKpi: { ...(source.config.chartTypePerKpi || {}) },
                    zoomWindow: source.config.zoomWindow ? { ...source.config.zoomWindow } : undefined,
                  }
                : undefined,
              filters: { ...(source.filters || {}) },
              kpiIds: [...(source.kpiIds || [])],
              counterIds: [...(source.counterIds || [])],
            };
            return { ...prev, graphSlots: [...prev.graphSlots, dup] };
          })}
          activeSlotId={activeSlotId}
          onSlotClick={(id) => {
            setActiveSlotId(id);
          }}
          isFullscreen={isGraphFullscreen}
          onActivateTab={(tab) => setAnalysisTab(tab)}
        />
      )}

      {state.activeGraphTab === 'Histogram' && (
        <KPIHistogram selectedKpis={activeSlot?.kpiIds ?? []} layout={state.graphLayout} />
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
        onActivateTab={(tab) => {
          setAnalysisTab(tab as any);
          if (tab && activeSlot) {
            const snap = buildSnapshot(activeSlot, state);
            analysisTabs.ensureTab(tab as any, activeSlotId, snap);
          }
        }}
      />

      {/* Main Content — two stable zones */}
      <main className="flex-1 px-4 md:px-[2.5%] pt-5 pb-6 w-full flex flex-col" style={{ minHeight: 0 }}>

        {/* ═══ Alerts Zone (fixed height when present) ═══ */}
        <div className="shrink-0 space-y-2 mb-4">
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
        </div>

        {/* ═══ ZONE 1: Stable Graph Area ═══ */}
        <div className="shrink-0">
          {!isGraphFullscreen && renderGraphSection()}
        </div>

        {/* ═══ ZONE 2: Stable Analysis Area — always mounted, stable height ═══ */}
        <div className="shrink-0 mt-6" style={{ minHeight: 360 }}>

          {/* Analysis Tab Bar — always visible when there are enabled tabs */}
          {(() => {
            const activeConfig = activeSlot
              ? {
                  ...DEFAULT_GRAPH_CONFIG,
                  ...(activeSlot.config || {}),
                  showDataTable: isSectionEnabled(activeSlot, 'showDataTable'),
                }
              : DEFAULT_GRAPH_CONFIG;
            const configKeyMap: Record<string, keyof GraphConfig> = {
              table_data: 'showDataTable',
              breakdown: 'showBreakdown',
              top_worst: 'showTopWorst',
              alarms: 'showAlarms',
              neighbors: 'showNeighbors',
              cm_history: 'showCmHistory',
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
              if (!cfgKey) return true;
              return (activeConfig as any)[cfgKey];
            });

            if (visibleTabs.length === 0) return null;

            return (
              <div className="border-b border-border/60 sticky top-[52px] z-20 bg-background/95 backdrop-blur-sm mb-4">
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

          {/* Multi-tab sub-bar for sections with instances — always mounted */}
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

          {/* ═══ Analysis Panel Content — all panels stay mounted, visibility via CSS ═══ */}
          <div className="relative">

            {/* Table Data — only render for slots with showDataTable === true */}
            <div style={{ display: analysisTab === 'table_data' ? undefined : 'none' }}>
              {(() => {
                // Only slots that explicitly opted in
                const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showDataTable);
                if (enabledSlots.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">
                      Aucun graphe n'a activé « Data Table ». Activez-le dans les réglages d'un graphe.
                    </div>
                  );
                }
                // Pick effective slot: prefer tableDataSlotId if it's among enabled slots
                const effectiveSlotId = (tableDataSlotId && enabledSlots.find(s => s.id === tableDataSlotId))
                  ? tableDataSlotId
                  : (activeSlotId && enabledSlots.find(s => s.id === activeSlotId))
                    ? activeSlotId
                    : enabledSlots[0]?.id || null;
                const activeTableSlot = enabledSlots.find(s => s.id === effectiveSlotId) || null;
                // Filter data by slot AND only include KPIs/counters configured in that slot
                const slotKpiIds = new Set(activeTableSlot?.kpiIds || []);
                const slotCounterIds = new Set(activeTableSlot?.counterIds || []);
                const slotData = effectiveSlotId
                  ? tsData.filter((d: any) => {
                      if (d._slotId !== effectiveSlotId) return false;
                      if (d._isCounter) {
                        const baseCounter = d.kpi.includes('@') ? d.kpi.split('@')[0] : d.kpi;
                        return slotCounterIds.size === 0 || slotCounterIds.has(baseCounter);
                      }
                      // If slot has configured KPIs, only include matching data
                      if (slotKpiIds.size > 0) {
                        const baseKpi = d.kpi.includes('@') ? d.kpi.split('@')[0] : d.kpi;
                        return slotKpiIds.has(baseKpi);
                      }
                      return true;
                    })
                  : [];

                return (
                  <>
                    {/* Only show slot picker if multiple slots have table enabled */}
                    {enabledSlots.length > 1 && (
                      <div className="flex items-center gap-1 px-1 py-1 border-b border-border/40 bg-muted/20 rounded-lg mb-2">
                        {enabledSlots.map((slot) => (
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
                      <div className="flex items-center gap-3 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground mb-2">
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
                      siteName={state.filters?.['Site']?.[0] || state.filters?.['SITE']?.[0] || undefined}
                    />
                  </>
                );
              })()}
            </div>

            {/* KPI Breakdown — only for slots with showBreakdown === true */}
            <div style={{ display: analysisTab === 'breakdown' ? undefined : 'none' }}>
              {(() => {
                const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showBreakdown && s.kpiIds.length > 0);
                if (enabledSlots.length === 0) {
                  return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « KPI Breakdown ».</div>;
                }
                const slot = (activeSlot && enabledSlots.find(s => s.id === activeSlot.id)) || enabledSlots[0];
                return (
                  <section>
                    <KPIBreakdown
                      selectedKpis={slot.kpiIds}
                      layout={state.graphLayout}
                      dateFrom={(slot.startDate || state.startDate).split("T")[0] || "2026-01-01"}
                      dateTo={(slot.endDate || state.endDate).split("T")[0] || "2026-03-24"}
                      granularity={slot.granularity || state.granularity}
                      filters={Object.entries({ ...state.filters, ...slot.filters })
                        .filter(([,v]) => v.length > 0)
                        .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }))}
                      splitBy={slot.splitBy !== 'None' ? slot.splitBy : state.splitBy !== 'None' ? state.splitBy : undefined}
                      splitByPerKpi={slot.config?.splitByPerKpi}
                      timeSeriesData={tsData.filter((d: any) => d._slotId === slot.id)}
                    />
                  </section>
                );
              })()}
            </div>

            {/* Top Worst — only for slots with showTopWorst === true */}
            {(() => {
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showTopWorst);
              if (enabledSlots.length === 0 && analysisTab === 'top_worst') {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « Top Worst Cells ».</div>;
              }
              const sec = analysisTabs.getSection('top_worst');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              return sec.instances
                .filter(inst2 => {
                  // Only show tabs linked to slots that have showTopWorst enabled
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .map(inst2 => (
                  <div key={inst2.id} style={{ display: analysisTab === 'top_worst' && inst2.id === activeTabId ? undefined : 'none' }}>
                    <TopWorstTabContent tabId={inst2.id} contextSnapshot={inst2.contextSnapshot} />
                  </div>
                ));
            })()}

            {/* Alarms — only for slots with showAlarms === true */}
            {(() => {
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showAlarms);
              if (enabledSlots.length === 0 && analysisTab === 'alarms') {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « Alarms ».</div>;
              }
              const sec = analysisTabs.getSection('alarms');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              return sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .map(inst2 => (
                  <div key={inst2.id} style={{ display: analysisTab === 'alarms' && inst2.id === activeTabId ? undefined : 'none' }}>
                    <AlarmsTabContent tabId={inst2.id} contextSnapshot={inst2.contextSnapshot} />
                  </div>
                ));
            })()}

            {/* Counters */}
            <div style={{ display: analysisTab === 'counters' ? undefined : 'none' }}>
              <CounterGraphSection
                dateFrom={state.startDate.split('T')[0]}
                dateTo={state.endDate.split('T')[0]}
              />
            </div>

            {/* Neighbors — only for slots with showNeighbors === true */}
            {(() => {
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showNeighbors);
              if (enabledSlots.length === 0 && analysisTab === 'neighbors') {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « Neighbors ».</div>;
              }
              const sec = analysisTabs.getSection('neighbors');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              return sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .map(inst2 => (
                  <div key={inst2.id} style={{ display: analysisTab === 'neighbors' && inst2.id === activeTabId ? undefined : 'none' }}>
                    <NeighborsTabContent tabId={inst2.id} contextSnapshot={inst2.contextSnapshot} />
                  </div>
                ));
            })()}

            {/* CM History — only for slots with showCmHistory === true */}
            {(() => {
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showCmHistory);
              if (enabledSlots.length === 0 && analysisTab === 'cm_history') {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « CM History ».</div>;
              }
              const sec = analysisTabs.getSection('cm_history');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              return sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .map(inst2 => (
                  <div key={inst2.id} style={{ display: analysisTab === 'cm_history' && inst2.id === activeTabId ? undefined : 'none' }}>
                    <CMHistoryTabContent tabId={inst2.id} contextSnapshot={inst2.contextSnapshot} />
                  </div>
                ));
            })()}

          </div>
        </div>
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

export default InvestigatorWorkspace;
