import React, { useEffect, useState, useRef, useCallback } from 'react';
import WorstElementsTable from './WorstElementsTable';
import { fetchWorstCellsDirect, fetchCellDetails, fetchKpiDefinitions } from './investigatorApi';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { useInvestigatorWorkspace } from '@/stores/investigatorWorkspaceStore';
import type { WorstElement, KpiDefinition, Granularity, InvestigationState } from './types';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  tabId: string;
  contextSnapshot?: TabContextSnapshot | null;
}

/**
 * Self-contained Top Worst Cells panel for a single analysis tab.
 * Reads from contextSnapshot (frozen at tab creation) — NOT from global state.
 */
const TopWorstTabContent: React.FC<Props> = ({ tabId, contextSnapshot }) => {
  const { state } = useInvestigatorStore();
  const ws = useInvestigatorWorkspace();
  const [elements, setElements] = useState<WorstElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = contextSnapshot;
  const limit = ctx?.kpiIds?.length ? 50 : 10;
  const kpiMetaRef = useRef<Map<string, KpiDefinition>>(new Map());
  const fetchedRef = useRef(false);

  useEffect(() => {
    fetchKpiDefinitions().then(kpis => {
      const m = new Map<string, KpiDefinition>();
      for (const k of kpis) m.set(k.id, k);
      kpiMetaRef.current = m;
    });
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const kpiIds = ctx?.kpiIds || state.graphSlots.flatMap(s => s.kpiIds);
    if (!kpiIds.length) {
      setError('Aucun KPI sélectionné.');
      return;
    }

    const dateFrom = (ctx?.startDate || state.startDate).split('T')[0];
    const dateTo = (ctx?.endDate || state.endDate).split('T')[0];
    const rawFilters = ctx?.filters || state.filters;
    const filters = Object.entries(rawFilters)
      .filter(([, v]) => v.length > 0)
      .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), op: 'IN', values: vals }));

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const byDOR = await fetchWorstCellsDirect(kpiIds, limit, dateFrom, dateTo, filters, kpiMetaRef.current);
        const allCells = Object.values(byDOR).flat();

        let finalCells = allCells;
        try {
          const cellNames = allCells.map(c => c.name).filter(Boolean);
          const details = cellNames.length > 0 ? await fetchCellDetails(cellNames) : [];
          const detailMap: Record<string, any> = {};
          for (const d of details) detailMap[d.cell_name] = d;
          finalCells = allCells.map(el => {
            const detail = detailMap[el.name];
            return detail ? {
              ...el,
              vendor: detail.vendor || el.vendor,
              dor: detail.dor || el.dor,
              plaque: detail.plaque || el.plaque || '',
              band: detail.band || el.band || '',
              site_name: detail.site_name || el.site_name || '',
              alarms: detail.alarms,
              latest_alarms: detail.latest_alarms,
            } : el;
          });
        } catch { /* enrichment is best-effort */ }

        setElements(finalCells as WorstElement[]);
        if (finalCells.length === 0) setError('Aucune cellule dégradée trouvée.');
      } catch (e) {
        console.error('[TopWorstTab] Error:', e);
        setError('Erreur lors du calcul des pires cellules.');
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { setState: setGlobalState } = useInvestigatorStore();

  /** Open a new workspace tab prefilled with the clicked cell's context */
  const handleDrillDown = useCallback((cellName: string, el: WorstElement) => {
    const kpiIds = ctx?.kpiIds || state.graphSlots.flatMap(s => s.kpiIds);
    if (!kpiIds.length) {
      toast.warning('Aucun KPI actif pour le drill-down.');
      return;
    }

    const startDate = (ctx?.startDate || state.startDate).split('T')[0];
    const endDate = (ctx?.endDate || state.endDate).split('T')[0];
    const granularity = (ctx?.granularity || state.granularity) as Granularity;
    const parentSplitBy = ctx?.splitBy || state.splitBy || 'None';

    // Build filters: cell + context from the element
    const filters: Record<string, string[]> = {};
    filters['Cell'] = [cellName];
    if (el.site_name) filters['Site'] = [el.site_name];
    if (el.vendor) filters['Vendor'] = [el.vendor];
    if (el.dor) filters['DOR'] = [el.dor];
    if (el.band) filters['Band'] = [el.band];
    if (el.plaque) filters['Plaque'] = [el.plaque];
    if (el.technology || el.techno) filters['Technologie'] = [el.technology || el.techno || ''];

    // Merge existing context filters (except Cell which we override)
    const existingFilters = ctx?.filters || state.filters;
    for (const [dim, vals] of Object.entries(existingFilters)) {
      if (dim !== 'Cell' && vals.length > 0 && !filters[dim]) {
        filters[dim] = [...vals];
      }
    }

    // Create graph slot
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
          showDataTable: true,
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

    // Create a new workspace tab with prefilled state
    const newTabId = ws.addNewTab(`Drill: ${cellName}`);
    ws.updateInstanceState(newTabId, drillState);
    ws.updateInstance(newTabId, {
      activeSlotId: slotId,
      hasLoadedOnce: false,
      hasUnsavedChanges: false,
    });

    toast.success(`Drill-down ouvert: ${cellName}`);
  }, [ctx, state, ws]);

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
          onLimitChange={() => {}}
          onRowClick={(id) => {
            setGlobalState(prev => ({ ...prev, filters: { ...prev.filters, Cell: [id] } }));
          }}
          drilldownContext={{
            kpiIds: ctx?.kpiIds || state.graphSlots.flatMap(s => s.kpiIds),
            startDate: ctx?.startDate || state.startDate,
            endDate: ctx?.endDate || state.endDate,
            granularity: ctx?.granularity || state.granularity,
            filters: ctx?.filters || state.filters,
          }}
          onDrillDown={handleDrillDown}
        />
      )}
    </div>
  );
};

export default TopWorstTabContent;
