import React, { useEffect, useState, useRef } from 'react';
import WorstElementsTable from './WorstElementsTable';
import { fetchWorstCellsDirect, fetchCellDetails, fetchKpiDefinitions } from './investigatorApi';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import type { WorstElement, KpiDefinition } from './types';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { Info } from 'lucide-react';

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
        />
      )}
    </div>
  );
};

export default TopWorstTabContent;
