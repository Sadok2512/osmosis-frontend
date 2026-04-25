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
import NeighborExplorer from './NeighborExplorer';
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
import { GraphSlot, DEFAULT_GRAPH_CONFIG, GraphConfig, WorstElement, WidgetType, KpiDefinition, Granularity, normalizeGranularity, InvestigationState } from './types';
import { fetchKpiDefinitions, fetchWorstByDOR, fetchWorstCellsDirect, fetchFilterValues, fetchCellDetails, resolveSlotContext, fetchTimeSeriesForSlot } from './investigatorApi';
import {
  Maximize2, Minimize2, AlertTriangle, Activity, Square, Columns2, Columns3,
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
  table: 'Table',
};

type SlotTemporalTemplate = Pick<InvestigationState, 'startDate' | 'endDate' | 'granularity'>;

const createSlot = (
  index: number,
  kpiIds: string[] = [],
  widgetType: WidgetType = 'timeseries',
  initialFilters: Record<string, string[]> = {},
  temporalTemplate?: Partial<SlotTemporalTemplate>,
): GraphSlot => ({
  id: `slot-${Date.now()}-${index}`,
  kpiIds,
  name: `${WIDGET_NAMES[widgetType]} ${index}`,
  widgetType,
  config: {
    ...DEFAULT_GRAPH_CONFIG,
    // Respect DEFAULT_GRAPH_CONFIG (tableData/alarms/neighbors are OFF by default).
  },
  filters: { ...initialFilters },
  startDate: temporalTemplate?.startDate || '',
  endDate: temporalTemplate?.endDate || '',
  granularity: (temporalTemplate?.granularity || '1d') as Granularity,
  splitBy: 'None',
});

/** Build a context snapshot from a graph slot + global state */
function buildSnapshot(slot: GraphSlot, globalState: any): TabContextSnapshot {
  return {
    sourceGraphId: slot.id,
    sourceGraphTitle: slot.name,
    kpiIds: slot.kpiIds,
    counterIds: slot.counterIds || [],
    filters: { ...(slot.filters || {}) },
    startDate: slot.startDate || globalState.startDate,
    endDate: slot.endDate || globalState.endDate,
    granularity: slot.granularity || globalState.granularity,
    kpiLevel: globalState.kpiLevel,
    splitBy: slot.splitBy !== 'None' ? slot.splitBy : globalState.splitBy !== 'None' ? globalState.splitBy : null,
  };
}

function isSectionEnabled(slot: GraphSlot | null | undefined, flag: keyof GraphConfig): boolean {
  if (!slot) return false;
  // Single source of truth: a section is visible only if its toggle is explicitly true.
  // Missing/undefined => fall back to DEFAULT_GRAPH_CONFIG which is OFF for tableData/alarms/neighbors.
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
    sortBy: null, graphLayout: 2 as const, activeGraphTab: 'TimeSeries' as const, jalons: [], showJalons: true,
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
  const [selectedCounterCatalog, setSelectedCounterCatalog] = React.useState<any[]>([]);

  const mergeCounterCatalog = useCallback((current: any[], incoming: any[]) => {
    const byName = new Map<string, any>();
    [...current, ...incoming].forEach((counter) => {
      const name = counter?.counter_name;
      if (name) byName.set(name, counter);
    });
    return Array.from(byName.values());
  }, []);

  const selectedCounters = useMemo(() => {
    const activeCounterNames = state.graphSlots.find((slot) => slot.id === activeSlotId)?.counterIds || [];
    if (activeCounterNames.length === 0) return [];

    return activeCounterNames.map((counterName) => {
      return selectedCounterCatalog.find((counter) => counter?.counter_name === counterName) || { counter_name: counterName };
    });
  }, [activeSlotId, selectedCounterCatalog, state.graphSlots]);

  /** Wrap setSelectedCounters to also sync counterIds to the active (or auto-created) slot */
  const setSelectedCounters = useCallback((counters: any[]) => {
    setSelectedCounterCatalog((prev) => mergeCounterCatalog(prev, counters));
    const counterNames = counters.map((c: any) => c.counter_name).filter(Boolean);
    setState((prev) => {
      let slots = [...prev.graphSlots];
      const currentActive = activeSlotId;
      let targetIdx = slots.findIndex((s) => s.id === currentActive);

      if (targetIdx < 0 && slots.length > 0) targetIdx = 0;

      if (targetIdx < 0) {
        const newSlot = createSlot(1, [], 'timeseries', {}, {
          startDate: prev.startDate,
          endDate: prev.endDate,
          granularity: prev.granularity,
        });
        newSlot.counterIds = counterNames;
        slots = [newSlot];
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
  }, [activeSlotId, mergeCounterCatalog, setActiveSlotId, setState]);
  type AnalysisTabKey = 'breakdown' | 'table_data' | 'top_worst' | 'counters' | 'histograms' | 'slicing' | 'alarms' | 'neighbors' | 'cm_history';
  /** Per-slot active analysis tab — each graph remembers its own selected tab during the session. */
  const [perSlotAnalysisTab, setPerSlotAnalysisTab] = React.useState<Record<string, AnalysisTabKey | null>>({});
  const analysisTab: AnalysisTabKey | null = activeSlotId ? (perSlotAnalysisTab[activeSlotId] ?? null) : null;
  const setAnalysisTab = React.useCallback((tab: AnalysisTabKey | null) => {
    if (!activeSlotId) return;
    setPerSlotAnalysisTab(prev => ({ ...prev, [activeSlotId]: tab }));
  }, [activeSlotId]);
  const [isGraphFullscreen, setIsGraphFullscreen] = React.useState(false);
  const analysisTabs = useAnalysisTabs();
  const [tableDataSlotId, setTableDataSlotId] = React.useState<string | null>(null);
  const [tableDataRefreshBySlot, setTableDataRefreshBySlot] = React.useState<Record<string, number>>({});
  const [kpiSelectorSlot, setKpiSelectorSlot] = React.useState<string | null>(null);

  useEffect(() => {
    const needsBackfill = state.graphSlots.some(
      (slot) => !slot.startDate?.trim() || !slot.endDate?.trim() || !slot.granularity,
    );
    if (!needsBackfill) return;

    setState((prev) => {
      let changed = false;
      const graphSlots = prev.graphSlots.map((slot) => {
        const nextStartDate = slot.startDate?.trim() || prev.startDate || '';
        const nextEndDate = slot.endDate?.trim() || prev.endDate || '';
        const nextGranularity = slot.granularity || prev.granularity || '1d';
        if (
          nextStartDate === slot.startDate &&
          nextEndDate === slot.endDate &&
          nextGranularity === slot.granularity
        ) {
          return slot;
        }
        changed = true;
        return {
          ...slot,
          startDate: nextStartDate,
          endDate: nextEndDate,
          granularity: nextGranularity as Granularity,
        };
      });

      return changed ? { ...prev, graphSlots } : prev;
    });
  }, [setState, state.graphSlots]);

  // If the currently selected analysis tab points to a section that is now OFF
  // on the active slot, clear it so the empty/disabled panel never shows.
  React.useEffect(() => {
    if (!activeSlotId || !analysisTab) return;
    const slot = state.graphSlots.find(s => s.id === activeSlotId);
    if (!slot) return;
    const flagMap: Record<string, keyof GraphConfig> = {
      table_data: 'showDataTable',
      breakdown: 'showBreakdown',
      top_worst: 'showTopWorst',
      alarms: 'showAlarms',
      neighbors: 'showNeighbors',
      cm_history: 'showCmHistory',
    };
    const flag = flagMap[analysisTab];
    if (!flag) return;
    const enabled = Boolean((slot.config || DEFAULT_GRAPH_CONFIG)[flag]);
    if (!enabled) setAnalysisTab(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlotId, analysisTab, state.graphSlots]);

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
    const filters = activeSlotId ? (slot?.filters || {}) : state.filters;
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

    const slot = state.graphSlots.find((s) => s.id === slotId);
    const ctx = slot
      ? resolveSlotContext(slot, state)
      : {
          dateFrom: state.startDate.split('T')[0],
          dateTo: state.endDate.split('T')[0],
          granularity: normalizeGranularity(state.granularity),
          filters: Object.entries(state.filters)
            .filter(([, vals]) => vals.length > 0)
            .map(([dimension, values]) => ({ dimension: dimension.toUpperCase(), values })),
        };

    const splitPerKpi = slot?.config?.splitByPerKpi || {};
    const counterSplitVal = counterNames.map((cn) => splitPerKpi[cn]).find((v) => v && v !== 'None')
      || slot?.splitBy || state.splitBy || undefined;
    const FIELD_MAP: Record<string, string> = {
      Cell: 'cell_name',
      CELL: 'cell_name',
      Site: 'site_name',
      SITE: 'site_name',
    };
    const STRUCTURAL_DIMS = new Set(['SITE', 'CELL', 'VENDOR', 'TECHNOLOGY', 'TECHNO', 'KPI_LEVEL', 'PLAQUE', 'DOR', 'DR', 'BAND', 'BANDE', 'ZONE_ARCEP', 'ZONE ARCEP']);

    const body: Record<string, any> = {
      counter_names: counterNames,
      date_from: ctx.dateFrom,
      date_to: ctx.dateTo,
      granularity: normalizeGranularity(ctx.granularity),
    };

    if (counterSplitVal && counterSplitVal !== 'None') {
      const normalizedSplit = counterSplitVal.startsWith('PM_DIM:')
        ? counterSplitVal.replace('PM_DIM:', '')
        : counterSplitVal;

      if (FIELD_MAP[normalizedSplit]) {
        body.split_by_field = FIELD_MAP[normalizedSplit];
      } else {
        body.split_by_dimension = true;
      }
    }

    const dimensionFilterValues: string[] = [];
    for (const filter of ctx.filters || []) {
      const dim = (filter.dimension || '').toUpperCase();
      const values = filter.values || [];
      if (values.length === 0) continue;

      if (dim === 'SITE') {
        body.site_name = values.length === 1 ? values[0] : values;
      } else if (dim === 'CELL') {
        body.cell_name = values.length === 1 ? values[0] : values;
      } else if (dim === 'VENDOR') {
        body.vendor = values.length === 1 ? values[0] : values;
      } else if (dim === 'TECHNOLOGY' || dim === 'TECHNO') {
        const ALL_TECHS = new Set(['2G', '3G', '4G', '5G']);
        const allSelected = values.length >= 4 && values.every(v => ALL_TECHS.has(v));
        if (!allSelected) {
          body.object_type = values.length === 1 ? values[0] : values;
        }
      } else if (dim === 'PLAQUE') {
        body.plaque = values.length === 1 ? values[0] : values;
      } else if (dim === 'DOR') {
        body.dor = values.length === 1 ? values[0] : values;
      } else if (dim === 'DR') {
        body.dr = values.length === 1 ? values[0] : values;
      } else if (dim === 'BAND' || dim === 'BANDE') {
        body.band = values.length === 1 ? values[0] : values;
      } else if (dim === 'ZONE_ARCEP' || dim === 'ZONE ARCEP') {
        body.zone_arcep = values.length === 1 ? values[0] : values;
      } else if (!STRUCTURAL_DIMS.has(dim)) {
        dimensionFilterValues.push(...values);
      }
    }

    if (dimensionFilterValues.length > 0) {
      body.dimension_filter = dimensionFilterValues.length === 1 ? dimensionFilterValues[0] : dimensionFilterValues;
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
    const rawSeries = data.series || data.data || data.timeseries || data.results || [];
    const topologyCells = data?.meta?.topology_cells;
    const counterPoints = rawSeries.map((s: any) => {
      const rawCounter = s.counter || s.counter_name || counterNames[0];
      const cleanCounter = s.counter_id || (rawCounter.includes('@') ? rawCounter.split('@')[0] : rawCounter);
      const splitVal = s.dimension_key || s.split_field || s.cell || s.cell_name || s.site || s.site_name || s.split_value ||
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
    if (!current) {
      (fetchCounterSeriesForSlot as any)._lastTopologyCells = topologyCells;
      return counterPoints.length;
    }

    const filtered = current.tsData.filter((d: any) => d._slotId != null && !(d._isCounter && d._slotId === slotId));
    ws.updateInstance(instanceId, {
      tsData: [...filtered, ...counterPoints],
      hasLoadedOnce: counterPoints.length > 0 || current.hasLoadedOnce,
    });

    (fetchCounterSeriesForSlot as any)._lastTopologyCells = topologyCells;
    return counterPoints.length;
  }, [instanceId, state, ws]);

  const activeCounterNames = useMemo(() => activeSlot?.counterIds || [], [activeSlot]);

  const fetchSelectedCounterSeries = useCallback(async (options?: { throwOnError?: boolean }) => {
    const slotId = activeSlotId || state.graphSlots[0]?.id || 'global';
    return fetchCounterSeriesForSlot(activeCounterNames, slotId, options);
  }, [activeCounterNames, activeSlotId, fetchCounterSeriesForSlot, state.graphSlots]);

  const handleApply = async () => {
    console.log('[Investigator] handleApply called', { hasFilters, activeSlotId, graphSlots: state.graphSlots.length, granularity: state.granularity });
    if (!hasFilters) {
      console.log('[Investigator] handleApply: no filters, aborting');
      setApplyError('Veuillez sélectionner au moins un filtre (Site, Cell…) avant de lancer la requête.');
      return;
    }

    const targetSlot = activeSlotId
      ? state.graphSlots.find(s => s.id === activeSlotId && (s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0))
      : state.graphSlots.find(s => s.kpiIds.length > 0 || (s.counterIds?.length ?? 0) > 0) || null;

    console.log('[Investigator] handleApply: targetSlot=', targetSlot?.id, 'kpis=', targetSlot?.kpiIds, 'counters=', targetSlot?.counterIds, 'selectedCounters=', selectedCounters.length);

    if (!targetSlot && selectedCounters.length === 0) {
      console.log('[Investigator] handleApply: no targetSlot and no selectedCounters');
      setApplyError('Veuillez sélectionner un graphe actif avec au moins un KPI ou Counter.');
      return;
    }

    if (!targetSlot && selectedCounters.length > 0) {
      setApplyError(null);
      setIsApplying(true);
      try {
        const pointCount = await fetchSelectedCounterSeries({ throwOnError: true });
        if (pointCount === 0) {
          const topo = (fetchCounterSeriesForSlot as any)._lastTopologyCells;
          if (topo === 0) {
            setApplyError('Aucune cellule ne correspond aux filtres (Vendor / Plaque / Techno). Vérifiez la cohérence du périmètre.');
          } else {
            setApplyError('Aucune donnée trouvée pour les Counters sélectionnés. Vérifiez la période, le grain et les filtres.');
          }
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
      const otherData = currentTsData.filter((d: any) => d._slotId != null && (d._slotId !== targetSlot.id || d._isCounter));
      setTsData([...otherData, ...taggedData]);
      setTableDataRefreshBySlot(prev => ({ ...prev, [targetSlot.id]: (prev[targetSlot.id] || 0) + 1 }));
      setAnalysisTab('table_data');
      setTableDataSlotId(targetSlot.id);
      setHasLoadedOnce(true);

      if (taggedData.length === 0 && counterPointCount === 0) {
        const topo = (fetchCounterSeriesForSlot as any)._lastTopologyCells;
        if (topo === 0) {
          setApplyError(`Aucune cellule ne correspond aux filtres pour « ${targetSlot.name} » (Vendor / Plaque / Techno incohérents). Ajustez le périmètre.`);
        } else {
          setApplyError(`Aucune donnée trouvée pour « ${targetSlot.name} ». Vérifiez la période et les filtres.`);
        }
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
    const timer = setTimeout(() => handleApply(), 300);
    return () => clearTimeout(timer);
  }, [inst?.name, hasFilters, hasKpis, inst?.hasLoadedOnce]);

  // Counter timeseries
  const counterKey = activeCounterNames.join(',');
  const filterKey = JSON.stringify(activeSlotId ? (activeSlot?.filters || {}) : state.filters);
  const fetchSelectedCounterSeriesRef = useRef(fetchSelectedCounterSeries);
  fetchSelectedCounterSeriesRef.current = fetchSelectedCounterSeries;

  // Counter series are fetched only via handleApply — NO auto-fetch

  const handleFindWorst = async () => {
    setIsLoadingWorst(true);
    try {
      const kpiIds = activeSlot?.kpiIds ?? [];
      if (!kpiIds.length) { setIsLoadingWorst(false); return; }
      const dateFrom = state.startDate.split('T')[0];
      const dateTo = state.endDate.split('T')[0];

      const allFilters = [...worstFilters];
      const slotFilters = activeSlotId ? (activeSlot?.filters || {}) : state.filters;
      const siteFromState = slotFilters?.['Site']?.[0] || slotFilters?.['SITE']?.[0];
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

  const handleUpdateSlotConfig = (slotId: string, updates: Partial<GraphConfig> & { granularity?: string }) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s => {
        if (s.id !== slotId) return s;
        // Granularity is a slot-level field, not a config field
        const slotUpdates: any = {};
        const configUpdates = { ...updates };
        if ('granularity' in configUpdates) {
          slotUpdates.granularity = configUpdates.granularity;
          delete configUpdates.granularity;
        }
        const baseConfig = {
          ...DEFAULT_GRAPH_CONFIG,
          ...(s.config || {}),
        };
        return { ...s, ...slotUpdates, config: { ...baseConfig, ...configUpdates } };
      }),
    }));

    if (updates.showDataTable === true) {
      setTableDataSlotId(slotId);
    } else if (updates.showDataTable === false && tableDataSlotId === slotId) {
      setTableDataSlotId(null);
    }
  };

  useEffect(() => {
    if (!analysisTab || !activeSlot) return;
    const flagMap: Record<AnalysisTabKey, keyof GraphConfig | null> = {
      table_data: 'showDataTable',
      breakdown: 'showBreakdown',
      top_worst: 'showTopWorst',
      counters: null,
      histograms: null,
      slicing: null,
      alarms: 'showAlarms',
      neighbors: 'showNeighbors',
      cm_history: 'showCmHistory',
    };
    const flag = flagMap[analysisTab];
    if (flag && !isSectionEnabled(activeSlot, flag)) {
      setAnalysisTab(null);
    }
  }, [analysisTab, activeSlot, setAnalysisTab]);

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
      'space-y-5',
      isGraphFullscreen && 'fixed inset-0 z-[100] bg-white p-4 md:p-6 overflow-auto'
    )}>
      <div className={cn(
        'flex flex-col gap-2 border-b border-slate-200/70 pb-4',
        isGraphFullscreen && 'sticky top-0 z-10 bg-white/95 backdrop-blur-sm'
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
              { val: 3 as const, icon: Columns3, title: 'Triple' },
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
              // Inherit perimeter / period / granularity / split from active slot, fallback to global state
              const source = prev.graphSlots.find(s => s.id === activeSlotId) || null;
              const inheritedFilters: Record<string, string[]> = source?.filters && Object.keys(source.filters).length > 0
                ? Object.fromEntries(Object.entries(source.filters).map(([k, v]) => [k, [...(v as string[])]]))
                : Object.fromEntries(Object.entries(prev.filters || {}).map(([k, v]) => [k, [...(v as string[])]]));
              const inheritedStart = source?.startDate || prev.startDate || '';
              const inheritedEnd = source?.endDate || prev.endDate || '';
              const inheritedGran = (source?.granularity || prev.granularity || '1d') as Granularity;
              const inheritedSplit = source?.splitBy && source.splitBy !== 'None'
                ? source.splitBy
                : (prev.splitBy && prev.splitBy !== 'None' ? prev.splitBy : 'None');
              const newSlot = createSlot(nextIndex, [], widgetType || 'timeseries', inheritedFilters, {
                startDate: inheritedStart,
                endDate: inheritedEnd,
                granularity: inheritedGran,
              });
              newSlot.splitBy = inheritedSplit;
              return { ...prev, graphSlots: [...prev.graphSlots, newSlot] };
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
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)' }}>
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
      {/* Pure white canvas — Precision Architect inspired */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-white text-slate-900">

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

      {/* Main Content — two stable zones, generous breathing room */}
      <main className="flex-1 px-5 md:px-[3%] pt-7 pb-9 w-full flex flex-col" style={{ minHeight: 0 }}>

        {/* ═══ Alerts Zone — softer surfaces ═══ */}
        <div className="shrink-0 space-y-2.5 mb-5">
          {applyError && (
            <div
              className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/[0.04] px-4 py-3 flex items-center gap-2.5"
              style={{ boxShadow: '0 1px 2px rgba(239,68,68,0.05)' }}
            >
              <AlertTriangle className="w-4 h-4 text-[#ef4444] shrink-0" />
              <span className="text-[11px] font-semibold text-[#b91c1c] flex-1">
                {applyError}
              </span>
              <button onClick={() => setApplyError(null)} className="text-[#ef4444] hover:text-[#b91c1c] transition-colors">
                <span className="text-xs font-bold">✕</span>
              </button>
            </div>
          )}

          {hasUnfilteredFallback && (
            <div
              className="rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/[0.05] px-4 py-3 flex items-center gap-2.5"
              style={{ boxShadow: '0 1px 2px rgba(245,158,11,0.05)' }}
            >
              <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0" />
              <span className="text-[11px] font-semibold text-[#92400e]">
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
        <div className="shrink-0 mt-8" style={{ minHeight: 360 }}>

          {/* Analysis Tab Bar — Precision Architect-style segmented bar */}
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
            // PA palette: green primary, orange accent, red alert
            const allTabs = [
              { key: 'table_data' as const, icon: Table2, label: 'Table Data', color: '#14746C' },
              { key: 'breakdown' as const, icon: PieChart, label: 'KPI Breakdown', color: '#14746C' },
              { key: 'top_worst' as const, icon: AlertTriangle, label: 'Top Worst Cells', color: '#F59E0B' },
              { key: 'alarms' as const, icon: Bell, label: 'Alarms', color: '#EF4444' },
              // Neighbors moved to Network Explorer
              { key: 'cm_history' as const, icon: Settings2, label: 'CM History', color: '#F59E0B' },
            ];
            // All tabs stay visible (clean design). Disabled ones are dimmed
            // and their content area shows a placeholder instead of data.
            return (
              <div className="sticky top-[52px] z-20 bg-white/95 backdrop-blur-sm mb-5 border-b border-slate-200/70">
                <div className="flex items-center gap-1.5 px-1 py-2 overflow-x-auto">
                  {!activeSlot && (
                    <span className="px-3 py-2 text-[10px] text-slate-400 italic">
                      Sélectionnez un graphe pour voir ses sections d'analyse
                    </span>
                  )}
                  {activeSlot && allTabs.map((tab) => {
                    const cfgKey = configKeyMap[tab.key];
                    const enabled = cfgKey ? Boolean((activeConfig as any)[cfgKey]) : true;
                    const isActive = analysisTab === tab.key;
                    return (
                      <button
                        key={`analysis-tab-${tab.key}`}
                        data-analysis-tab={tab.key}
                        onClick={() => {
                          const newTab = isActive ? null : tab.key;
                          setAnalysisTab(newTab);
                          if (newTab && enabled && activeSlot) {
                            const snap = buildSnapshot(activeSlot, state);
                            analysisTabs.ensureTab(newTab, activeSlotId, snap);
                          }
                          if (newTab === 'top_worst' && enabled && worstElements.length === 0 && !isLoadingWorst) {
                            handleFindWorst();
                          }
                        }}
                        title={enabled ? tab.label : `${tab.label} — désactivé. Activez le toggle dans les réglages du graphe.`}
                        className={cn(
                          'relative flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all duration-150 whitespace-nowrap border',
                          isActive
                            ? 'bg-white text-slate-900 border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-4px_rgba(15,23,42,0.08)]'
                            : enabled
                              ? 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                              : 'border-transparent text-slate-300 hover:text-slate-500 hover:bg-slate-50/50'
                        )}
                        style={isActive ? { boxShadow: `inset 0 -2px 0 0 ${tab.color}, 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px -4px rgba(15,23,42,0.08)` } : undefined}
                      >
                        <tab.icon
                          className={cn('w-3.5 h-3.5 transition-colors', !enabled && !isActive && 'opacity-50')}
                          style={isActive ? { color: tab.color } : undefined}
                        />
                        <span className={cn(!enabled && !isActive && 'opacity-60')}>{tab.label}</span>
                        {tab.key === 'table_data' && enabled && (
                          <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-primary/10 text-primary border border-primary/25 uppercase tracking-wider">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            Actif
                          </span>
                        )}
                        {!enabled && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-400 border border-slate-200 uppercase tracking-wider">
                            Off
                          </span>
                        )}
                        {isActive && enabled && analysisTabs.getSection(tab.key).instances.length > 0 && (
                          <span className="ml-1 text-[9px] text-slate-400">
                            ({analysisTabs.getSection(tab.key).instances.length})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Multi-tab sub-bar for sections with instances — always mounted.
              Top Worst / Alarms / CM History are bound strictly to the active graph,
              so we hide the per-graph tab bar for them. */}
          {analysisTab
            && analysisTab !== 'table_data'
            && analysisTab !== 'breakdown'
            && analysisTab !== 'top_worst'
            && analysisTab !== 'alarms'
            && analysisTab !== 'cm_history'
            && (() => {
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
          {/* Disabled sections are hidden from the tab bar entirely, so no inline disabled message is needed. */}

          <div className="relative animate-in fade-in duration-200" key={`panel-${activeSlotId ?? 'none'}-${analysisTab ?? 'none'}`}>

            {/* Table Data — render only if the ACTIVE slot has the toggle on */}
            <div style={{ display: analysisTab === 'table_data' ? undefined : 'none' }}>
              {(() => {
                // Strict gating on the active slot's toggle (single source of truth).
                if (!activeSlot || !isSectionEnabled(activeSlot, 'showDataTable')) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                      <span>« Table Data » est désactivé pour ce graphe.</span>
                      <span className="text-[10px] opacity-70">Activez-le dans les réglages du graphe (icône ⚙️) pour voir les données.</span>
                    </div>
                  );
                }
                const enabledSlots = state.graphSlots.filter(s => isSectionEnabled(s, 'showDataTable'));
                if (enabledSlots.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">
                      Aucun graphe n'a activé « Data Table ». Activez-le dans les réglages d'un graphe.
                    </div>
                  );
                }
                const hasSlotTags = tsData.some((d: any) => d._slotId);
                const baseKey = (k: string | undefined | null) => (k && k.includes('@') ? k.split('@')[0] : (k || ''));
                // Per-slot data: prefer _slotId tag match, fall back to KPI/counter key match
                // for points without a _slotId (legacy / counter-only fetches).
                const getSlotData = (slot: GraphSlot | null) => {
                  if (!slot) return [] as any[];

                  const slotKpiIds = slot.kpiIds || [];
                  const slotCounterIds = new Set((slot as any).counterIds || []);
                  const hasConfiguredKeys = slotKpiIds.length > 0 || slotCounterIds.size > 0;
                  const matchesSlotConfig = (d: any) => {
                    if (!hasConfiguredKeys) return true;
                    const key = typeof d?.kpi === 'string' ? d.kpi : '';
                    if (slotCounterIds.has(baseKey(key))) return true;
                    return slotKpiIds.some((id) => key === id || key.startsWith(`${id}@`));
                  };

                  if (hasSlotTags) {
                    // Strict slot tag match first
                    const tagged = tsData.filter((d: any) => d._slotId === slot.id && matchesSlotConfig(d));
                    if (tagged.length > 0) return tagged;
                    // If the slot has tagged data but the key matcher is too strict
                    // (legacy aliases / backend naming drift), still show that slot's data.
                    const taggedAny = tsData.filter((d: any) => d._slotId === slot.id);
                    if (taggedAny.length > 0) return taggedAny;
                    // Fallback: untagged points that match this slot's KPIs/counters
                    const untagged = tsData.filter((d: any) => d._slotId == null && matchesSlotConfig(d));
                    if (untagged.length > 0) return untagged;
                    // Last resort: any data matching KPI keys regardless of slot tag
                    const anyMatch = tsData.filter((d: any) => matchesSlotConfig(d));
                    if (anyMatch.length > 0) return anyMatch;
                    return [] as any[];
                  }
                  // No slot tags in dataset → pure KPI/counter key match
                  return tsData.filter((d: any) => matchesSlotConfig(d));
                };

                const slotDataById = new Map(enabledSlots.map((slot) => [slot.id, getSlotData(slot)]));
                // STRICT: active table slot follows the currently selected graph (activeSlotId)
                // when it has Table Data enabled. Otherwise the user can switch via the picker.
                // STRICT: table follows the currently selected graph (activeSlotId).
                // The per-section picker (tableDataSlotId) is only used when the active
                // graph does NOT have Table Data enabled, allowing the user to pick a
                // different enabled slot without changing the selected graph.
                const activeIsEnabled = !!activeSlotId && enabledSlots.some(s => s.id === activeSlotId);
                const effectiveSlotId =
                  (activeIsEnabled ? activeSlotId : null)
                  || (tableDataSlotId && enabledSlots.some(s => s.id === tableDataSlotId) ? tableDataSlotId : null)
                  || enabledSlots[0]?.id
                  || null;
                const activeTableSlot = enabledSlots.find(s => s.id === effectiveSlotId) || null;
                const slotData = activeTableSlot ? slotDataById.get(activeTableSlot.id) || [] : [];

                return (
                  <>
                    {/* Slot picker — only shown if the active graph itself doesn't
                        have Table Data enabled (so the user can pick another enabled
                        slot to inspect). When the active graph is enabled, we only
                        show its data — no other tabs. */}
                    {!activeIsEnabled && enabledSlots.length > 1 && (
                      <div className="flex items-center gap-1 mb-2 border-b border-border/30 px-1">
                        {enabledSlots.map(s => {
                          const isActive = s.id === effectiveSlotId;
                          const rows = (slotDataById.get(s.id) || []).length;
                          return (
                            <button
                              key={s.id}
                              onClick={() => {
                                setActiveSlotId(s.id);
                                setTableDataSlotId(s.id);
                              }}
                              className={cn(
                                'px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors -mb-px',
                                isActive
                                  ? 'border-primary text-primary'
                                  : 'border-transparent text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {s.name}
                              <span className="ml-1.5 text-[9px] opacity-60">({rows})</span>
                            </button>
                          );
                        })}
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
                      key={activeTableSlot?.id || 'none'}
                      tsData={slotData}
                      activeSlot={activeTableSlot}
                      siteName={((activeTableSlot?.filters?.['Site'] || activeTableSlot?.filters?.['SITE'] || (!activeTableSlot ? state.filters?.['Site'] || state.filters?.['SITE'] : []) || [])[0]) || undefined}
                      filterContext={activeTableSlot ? { ...(activeTableSlot.filters || {}) } : { ...(state.filters || {}) }}
                      forceSplitOff={
                        (!activeTableSlot?.splitBy || activeTableSlot.splitBy === 'None') &&
                        !slotData.some((d: any) => d.networkElement || d.splitValue)
                      }
                      backendRefreshKey={activeTableSlot ? (tableDataRefreshBySlot[activeTableSlot.id] || 0) : 0}
                      investigatorState={state}
                    />
                  </>
                );
              })()}
            </div>

            {/* KPI Breakdown — strictly tied to the currently active graph slot */}
            <div style={{ display: analysisTab === 'breakdown' ? undefined : 'none' }}>
              {(() => {
                // 1. No active graph selected
                if (!activeSlot) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                      <span>Aucun graphe sélectionné.</span>
                      <span className="text-[10px] opacity-70">Sélectionnez un graphe pour voir son KPI Breakdown.</span>
                    </div>
                  );
                }
                // 2. Section disabled on the active graph
                const isEnabled = (activeSlot.config || DEFAULT_GRAPH_CONFIG).showBreakdown;
                if (!isEnabled) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                      <span>« KPI Breakdown » est désactivé pour ce graphe.</span>
                      <span className="text-[10px] opacity-70">Activez-le dans les réglages du graphe (icône ⚙️) pour voir les données.</span>
                    </div>
                  );
                }
                // 3. No KPI on the active graph
                if (!activeSlot.kpiIds || activeSlot.kpiIds.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">
                      Aucun KPI sélectionné sur ce graphe.
                    </div>
                  );
                }
                // 4. Render breakdown for the active slot's KPIs only.
                //    `key` forces a fresh mount when the active graph changes,
                //    so internal state (formula cache, fetched series) is reset.
                return (
                  <section>
                    <KPIBreakdown
                      key={activeSlot.id}
                      selectedKpis={activeSlot.kpiIds}
                      layout={state.graphLayout}
                      dateFrom={activeSnapshot?.startDate || activeSlot.startDate || state.startDate}
                      dateTo={activeSnapshot?.endDate || activeSlot.endDate || state.endDate}
                      granularity={activeSnapshot?.granularity || activeSlot.granularity || state.granularity}
                      filters={Object.entries(activeSlot.filters || {})
                        .filter(([,v]) => v.length > 0)
                        .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), values: vals }))}
                      splitBy={activeSnapshot?.splitBy || undefined}
                      splitByPerKpi={activeSlot.config?.splitByPerKpi}
                      timeSeriesData={tsData.filter((d: any) => d._slotId === activeSlot.id)}
                      jalons={state.jalons}
                    />
                  </section>
                );
              })()}
            </div>

            {/* Top Worst — only mount when the tab is actually active */}
            {analysisTab === 'top_worst' && (() => {
              if (!activeSlot || !(activeSlot.config || DEFAULT_GRAPH_CONFIG).showTopWorst) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                    <span>« Top Worst Cells » est désactivé pour ce graphe.</span>
                    <span className="text-[10px] opacity-70">Activez-le dans les réglages du graphe (icône ⚙️) pour voir les données.</span>
                  </div>
                );
              }
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showTopWorst);
              if (enabledSlots.length === 0) {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « Top Worst Cells ».</div>;
              }
              const sec = analysisTabs.getSection('top_worst');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              const activeInstance = sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .find(inst2 => inst2.id === activeTabId);

              return activeInstance ? (
                <TopWorstTabContent
                  key={activeInstance.id}
                  instanceId={instanceId}
                  tabId={activeInstance.id}
                  contextSnapshot={activeInstance.contextSnapshot}
                />
              ) : null;
            })()}

            {/* Alarms — only mount when the tab is actually active */}
            {analysisTab === 'alarms' && (() => {
              if (!activeSlot || !(activeSlot.config || DEFAULT_GRAPH_CONFIG).showAlarms) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                    <span>« Alarms » est désactivé pour ce graphe.</span>
                    <span className="text-[10px] opacity-70">Activez-le dans les réglages du graphe (icône ⚙️) pour voir les données.</span>
                  </div>
                );
              }
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showAlarms);
              if (enabledSlots.length === 0) {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « Alarms ».</div>;
              }
              const sec = analysisTabs.getSection('alarms');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              const activeInstance = sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .find(inst2 => inst2.id === activeTabId);

              return activeInstance ? (
                <AlarmsTabContent key={activeInstance.id} tabId={activeInstance.id} contextSnapshot={activeInstance.contextSnapshot} />
              ) : null;
            })()}

            {/* Counters */}
            <div style={{ display: analysisTab === 'counters' ? undefined : 'none' }}>
              <CounterGraphSection
                dateFrom={state.startDate.split('T')[0]}
                dateTo={state.endDate.split('T')[0]}
              />
            </div>

            {/* Neighbors — only mount when the tab is actually active */}
            {/* Neighbors moved to Network Explorer */}

            {/* CM History — only mount when the tab is actually active */}
            {analysisTab === 'cm_history' && (() => {
              if (!activeSlot || !(activeSlot.config || DEFAULT_GRAPH_CONFIG).showCmHistory) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-[11px] gap-1">
                    <span>« CM History » est désactivé pour ce graphe.</span>
                    <span className="text-[10px] opacity-70">Activez-le dans les réglages du graphe (icône ⚙️) pour voir les données.</span>
                  </div>
                );
              }
              const enabledSlots = state.graphSlots.filter(s => (s.config || DEFAULT_GRAPH_CONFIG).showCmHistory);
              if (enabledSlots.length === 0) {
                return <div className="flex items-center justify-center py-12 text-muted-foreground text-[11px]">Aucun graphe n'a activé « CM History ».</div>;
              }
              const sec = analysisTabs.getSection('cm_history');
              const activeTabId = sec.activeId || sec.instances[0]?.id || null;
              const activeInstance = sec.instances
                .filter(inst2 => {
                  if (!inst2.sourceGraphId) return true;
                  return enabledSlots.some(s => s.id === inst2.sourceGraphId);
                })
                .find(inst2 => inst2.id === activeTabId);

              return activeInstance ? (
                <CMHistoryTabContent key={activeInstance.id} tabId={activeInstance.id} contextSnapshot={activeInstance.contextSnapshot} />
              ) : null;
            })()}

          </div>
        </div>
      </main>
    </div>

    {isGraphFullscreen && typeof document !== 'undefined' && createPortal(renderGraphSection(), document.body)}

      {/* AI Panel */}
      {showAIPanel && (
        <div className="w-[380px] shrink-0 border-l border-slate-200/70 h-full bg-white">
          <InvestigatorAIPanel onClose={() => setShowAIPanel(false)} />
        </div>
      )}
    </div>
  );
};

export default InvestigatorWorkspace;
