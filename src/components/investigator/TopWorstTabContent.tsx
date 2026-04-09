import React, { useEffect, useState, useRef } from 'react';
import WorstElementsTable from './WorstElementsTable';
import { fetchWorstCellsDirect, fetchCellDetails, fetchKpiDefinitions } from './investigatorApi';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import type { WorstElement, KpiDefinition } from './types';

/**
 * Self-contained Top Worst Cells panel for a single analysis tab.
 * Each instance manages its own loading / data / error state (full isolation).
 * Fetches automatically on mount (lazy: only when this tab becomes active).
 */
const TopWorstTabContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useInvestigatorStore();
  const [elements, setElements] = useState<WorstElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(state.topLimit);
  const kpiMetaRef = useRef<Map<string, KpiDefinition>>(new Map());
  const fetchedRef = useRef(false);

  // Load KPI metadata once
  useEffect(() => {
    fetchKpiDefinitions().then(kpis => {
      const m = new Map<string, KpiDefinition>();
      for (const k of kpis) m.set(k.id, k);
      kpiMetaRef.current = m;
    });
  }, []);

  // Auto-fetch on mount (lazy loading: only when tab is rendered = active)
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const kpiIds = state.graphSlots.flatMap(s => s.kpiIds);
    if (!kpiIds.length) {
      setError('Aucun KPI sélectionné.');
      return;
    }

    const dateFrom = state.startDate.split('T')[0];
    const dateTo = state.endDate.split('T')[0];
    const filters = Object.entries(state.filters)
      .filter(([, v]) => v.length > 0)
      .map(([dim, vals]) => ({ dimension: dim.toUpperCase(), op: 'IN', values: vals }));

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const byDOR = await fetchWorstCellsDirect(kpiIds, limit, dateFrom, dateTo, filters, kpiMetaRef.current);
        const allCells = Object.values(byDOR).flat();

        // Enrich with cell details (alarms, vendor, etc.)
        const cellNames = allCells.map(c => c.name).filter(Boolean);
        let finalCells = allCells;
        try {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        Computing worst cells...
      </div>
    );
  }

  if (error && elements.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <WorstElementsTable
      elements={elements}
      limit={limit}
      onLimitChange={setLimit}
      onRowClick={(id) => {
        setGlobalState(prev => ({ ...prev, filters: { ...prev.filters, Cell: [id] } }));
      }}
    />
  );
};

export default TopWorstTabContent;
