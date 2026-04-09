import React from 'react';
import NeighborsSection from './NeighborsSection';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { Info } from 'lucide-react';

interface Props {
  tabId: string;
  contextSnapshot?: TabContextSnapshot | null;
}

/**
 * Self-contained Neighbors panel for a single analysis tab.
 * Reads from contextSnapshot — NOT from global state.
 */
const NeighborsTabContent: React.FC<Props> = ({ tabId, contextSnapshot }) => {
  const { state } = useInvestigatorStore();
  const ctx = contextSnapshot;

  const filters = ctx?.filters || state.filters;

  return (
    <div>
      {ctx && (
        <div className="flex items-center gap-3 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/20 rounded-lg text-[9px] text-muted-foreground">
          <Info className="w-3 h-3 text-primary shrink-0" />
          <span className="font-bold text-primary">Source:</span>
          <span>{ctx.sourceGraphTitle}</span>
          <span className="opacity-40">|</span>
          <span>Filtres: {Object.entries(ctx.filters).filter(([,v]) => v.length > 0).map(([k,v]) => `${k}: ${v.join(',')}`).join(' · ') || '—'}</span>
        </div>
      )}
      <NeighborsSection filters={filters} />
    </div>
  );
};

export default NeighborsTabContent;
