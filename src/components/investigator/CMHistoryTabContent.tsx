import React from 'react';
import CMChangesCard from './CMChangesCard';
import BackendRequestLogPanel from './BackendRequestLogPanel';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { Info } from 'lucide-react';

interface Props {
  tabId: string;
  contextSnapshot?: TabContextSnapshot | null;
}

/**
 * Self-contained CM History panel for a single analysis tab.
 * Reads from contextSnapshot — NOT from global state.
 */
const CMHistoryTabContent: React.FC<Props> = ({ tabId, contextSnapshot }) => {
  const { state } = useInvestigatorStore();
  const ctx = contextSnapshot;

  const filters = ctx?.filters || state.filters;
  const cellNames = filters.Cell || filters.CELL || [];
  const siteNames = filters.Site || filters.SITE || [];
  const plaques = filters.Plaque || filters.PLAQUE || [];
  const startDate = ctx?.startDate || state.startDate;
  const endDate = ctx?.endDate || state.endDate;

  return (
    <div>
      {ctx && (
        <div className="flex items-center gap-3 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground">
          <Info className="w-3 h-3 text-primary shrink-0" />
          <span className="font-bold text-primary">Source:</span>
          <span>{ctx.sourceGraphTitle}</span>
          <span className="opacity-40">|</span>
          <span>Cells: {cellNames.join(', ') || siteNames.join(', ') || plaques.join(', ') || '—'}</span>
          <span className="opacity-40">|</span>
          <span>{startDate} → {endDate}</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <div className="min-w-0">
          <CMChangesCard cellNames={cellNames} siteNames={siteNames} plaques={plaques} dateFrom={startDate} dateTo={endDate} />
        </div>
        <BackendRequestLogPanel />
      </div>
    </div>
  );
};

export default CMHistoryTabContent;

