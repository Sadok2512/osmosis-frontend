import React, { useEffect, useState, useCallback, useMemo } from 'react';
import WorstElementsTable from './WorstElementsTable';
import { fetchWorstCellsDirect, fetchCellDetails, fetchKpiDefinitions } from './investigatorApi';
import { useInvestigatorWorkspace } from '@/stores/investigatorWorkspaceStore';
import type { WorstElement, KpiDefinition, Granularity, InvestigationState } from './types';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  instanceId: string;
  tabId: string;
  contextSnapshot?: TabContextSnapshot | null;
}

/**
 * Self-contained Top Worst Cells panel for a single analysis tab.
 * Reads from a frozen context snapshot when present, otherwise falls back to the current workspace instance.
 */
const TopWorstTabContent: React.FC<Props> = ({ instanceId, tabId: _tabId, contextSnapshot }) => {
  const instance = useInvestigatorWorkspace(state => state.getInstance(instanceId));
  const updateInstance = useInvestigatorWorkspace(state => state.updateInstance);
  const updateInstanceState = useInvestigatorWorkspace(state => state.updateInstanceState);
  const addNewTab = useInvestigatorWorkspace(state => state.addNewTab);
  const workspaceState = instance?.state;
  const [elements, setElements] = useState<WorstElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [kpiMetaMap, setKpiMetaMap] = useState<Map<string, KpiDefinition>>(new Map());
  const ctx = contextSnapshot;

  const fallbackKpiIds = useMemo(() => {
    if (!workspaceState) return [] as string[];
    return workspaceState.graphSlots.flatMap(s => [...(s.kpiIds || []), ...(s.counterIds || [])]);
  }, [workspaceState]);

  const effectiveKpiIds = useMemo(() => {
    const ctxCounterIds = ctx?.counterIds || [];
    if (ctx?.kpiIds?.length) return ctx.kpiIds;
    if (ctxCounterIds.length) return ctxCounterIds;
    return fallbackKpiIds;
  }, [ctx, fallbackKpiIds]);

  useEffect(() => {
    let cancelled = false;
    fetchKpiDefinitions().then(kpis => {
      if (cancelled) return;
      const map = new Map<string, KpiDefinition>();
      for (const k of kpis) map.set(k.id, k);
      setKpiMetaMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (effectiveKpiIds.length === 0) {
      setElements([]);
      setError('Aucun KPI ni compteur sélectionné.');
      setLoading(false);
      return;
    }

    const sourceState = workspaceState;
    if (!ctx && !sourceState) {
      setElements([]);
      setError('Contexte Investigator introuvable.');
      setLoading(false);
      return;
    }

    const dateFrom = (ctx?.startDate || sourceState?.startDate || '').split('T')[0];
    const dateTo = (ctx?.endDate || sourceState?.endDate || '').split('T')[0];
    const rawFilters = ctx?.filters || sourceState?.filters || {};
    const filters = Object.entries(rawFilters)
      .filter(([, values]) => values.length > 0)
      .map(([dimension, values]) => ({ dimension: dimension.toUpperCase(), op: 'IN', values }));

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const byDOR = await fetchWorstCellsDirect(effectiveKpiIds, limit, dateFrom, dateTo, filters, kpiMetaMap);
        if (cancelled) return;

        const allCells = Object.values(byDOR).flat();
        let finalCells = allCells;

        try {
          const cellNames = allCells.map(c => c.name).filter(Boolean);
          const details = cellNames.length > 0 ? await fetchCellDetails(cellNames) : [];
          if (cancelled) return;

          const detailMap: Record<string, any> = {};
          for (const detail of details) detailMap[detail.cell_name] = detail;
          finalCells = allCells.map(element => {
            const detail = detailMap[element.name];
            return detail ? {
              ...element,
              vendor: detail.vendor || element.vendor,
              dor: detail.dor || element.dor,
              plaque: detail.plaque || element.plaque || '',
              band: detail.band || element.band || '',
              site_name: detail.site_name || element.site_name || '',
              alarms: detail.alarms,
              latest_alarms: detail.latest_alarms,
            } : element;
          });
        } catch {
          // Enrichment is best-effort.
        }

        if (cancelled) return;
        setElements(finalCells as WorstElement[]);
        setError(finalCells.length === 0 ? 'Aucune cellule dégradée trouvée.' : null);
        updateInstance(instanceId, { worstElements: finalCells as WorstElement[] });
      } catch (e) {
        if (cancelled) return;
        console.error('[TopWorstTab] Error:', e);
        setElements([]);
        setError('Erreur lors du calcul des pires cellules.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx, effectiveKpiIds, instanceId, kpiMetaMap, limit, workspaceState, updateInstance]);

  /** Open a new workspace tab prefilled with the clicked cell's context */
  const handleDrillDown = useCallback((cellName: string, element: WorstElement) => {
    const sourceState = workspaceState;
    const kpiIds = effectiveKpiIds;
    if (!kpiIds.length) {
      toast.warning('Aucun KPI ni compteur actif pour le drill-down.');
      return;
    }

    const startDate = (ctx?.startDate || sourceState?.startDate || '').split('T')[0];
    const endDate = (ctx?.endDate || sourceState?.endDate || '').split('T')[0];
    const granularity = (ctx?.granularity || sourceState?.granularity || '1d') as Granularity;
    const parentSplitBy = ctx?.splitBy || sourceState?.splitBy || 'None';

    const filters: Record<string, string[]> = {
      Cell: [cellName],
    };
    if (element.site_name) filters.Site = [element.site_name];
    if (element.vendor) filters.Vendor = [element.vendor];
    if (element.dor) filters.DOR = [element.dor];
    if (element.band) filters.Band = [element.band];
    if (element.plaque) filters.Plaque = [element.plaque];
    if (element.technology || element.techno) filters.Technology = [element.technology || element.techno || ''];

    const existingFilters = ctx?.filters || sourceState?.filters || {};
    for (const [dimension, values] of Object.entries(existingFilters)) {
      if (dimension !== 'Cell' && values.length > 0 && !filters[dimension]) {
        filters[dimension] = [...values];
      }
    }

    const slotId = `slot-drill-${Date.now()}`;
    const drillState: InvestigationState = {
      dimension: 'Cell',
      selectedKpis: kpiIds,
      graphSlots: [{
        id: slotId,
        kpiIds,
        name: `Drill: ${cellName}`,
        widgetType: 'timeseries',
        config: {
          chartType: 'line',
          smooth: true,
          lineWidth: 2.5,
          showSymbols: true,
          showThresholds: true,
          showAverage: false,
          showGrid: true,
          showArea: false,
          showDataTable: false,
          showBreakdown: false,
          showTopWorst: false,
          showAlarms: false,
          showNeighbors: false,
          showCmHistory: false,
        },
        filters: {},
        startDate,
        endDate,
        granularity,
        splitBy: parentSplitBy,
      }],
      splitBy: parentSplitBy,
      startDate,
      endDate,
      granularity,
      filters,
      topLimit: 10,
      sortBy: null,
      graphLayout: 2,
      activeGraphTab: 'TimeSeries',
      jalons: [],
      kpiLevel: 'CELL',
      profileQci: null,
      profileArp: null,
      neighborType: null,
    };

    const newTabId = addNewTab(`Drill: ${cellName}`);
    updateInstanceState(newTabId, drillState);
    updateInstance(newTabId, {
      activeSlotId: slotId,
      hasLoadedOnce: false,
      hasUnsavedChanges: false,
    });

    toast.success(`Drill-down ouvert: ${cellName}`);
  }, [addNewTab, ctx, effectiveKpiIds, updateInstance, updateInstanceState, workspaceState]);

  const handleRowClick = useCallback((cellName: string) => {
    updateInstanceState(instanceId, prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        Cell: [cellName],
      },
    }));
    toast.info(`Filtre Cell appliqué: ${cellName}`);
  }, [instanceId, updateInstanceState]);

  return (
    <div>
      {ctx && (
        <div className="flex items-center gap-3 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground">
          <Info className="w-3 h-3 text-primary shrink-0" />
          <span className="font-bold text-primary">Source:</span>
          <span>{ctx.sourceGraphTitle}</span>
          <span className="opacity-40">|</span>
          <span>KPIs: {ctx.kpiIds.join(', ') || '—'}</span>
          <span className="opacity-40">|</span>
          <span>{ctx.startDate} → {ctx.endDate}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Computing worst cells...
        </div>
      ) : error && elements.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <WorstElementsTable
          elements={elements}
          limit={limit}
          onLimitChange={setLimit}
          onRowClick={handleRowClick}
          drilldownContext={{
            kpiIds: effectiveKpiIds,
            startDate: ctx?.startDate || workspaceState?.startDate || '',
            endDate: ctx?.endDate || workspaceState?.endDate || '',
            granularity: ctx?.granularity || workspaceState?.granularity || '1d',
            filters: ctx?.filters || workspaceState?.filters || {},
          }}
          onDrillDown={handleDrillDown}
        />
      )}
    </div>
  );
};

export default TopWorstTabContent;
