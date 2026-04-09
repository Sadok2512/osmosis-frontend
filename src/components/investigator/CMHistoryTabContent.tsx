import React from 'react';
import CMChangesCard from './CMChangesCard';
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
  const startDate = ctx?.startDate || state.startDate;
  const endDate = ctx?.endDate || state.endDate;

  // Compute days from period
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  const days = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1);

  return (
    <div>
      {ctx && (
        <div className="flex items-center gap-3 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground">
          <Info className="w-3 h-3 text-primary shrink-0" />
          <span className="font-bold text-primary">Source:</span>
          <span>{ctx.sourceGraphTitle}</span>
          <span className="opacity-40">|</span>
          <span>Cells: {cellNames.join(', ') || '—'}</span>
          <span className="opacity-40">|</span>
          <span>{ctx.startDate} → {ctx.endDate}</span>
        </div>
      )}
      <CMChangesCard cellNames={cellNames} days={days} />
    </div>
  );
};

export default CMHistoryTabContent;
