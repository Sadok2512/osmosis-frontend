import React from 'react';
import AlarmsSection from './AlarmsSection';
import type { TabContextSnapshot } from './useAnalysisTabs';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { Info } from 'lucide-react';

interface Props {
  tabId: string;
  contextSnapshot?: TabContextSnapshot | null;
}

/**
 * Self-contained Alarms panel for a single analysis tab.
 * Reads from contextSnapshot — NOT from global state.
 */
const AlarmsTabContent: React.FC<Props> = ({ tabId, contextSnapshot }) => {
  const { state } = useInvestigatorStore();
  const ctx = contextSnapshot;

  const filters = ctx?.filters || state.filters;
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
          <span>Filtres: {Object.entries(ctx.filters).filter(([,v]) => v.length > 0).map(([k,v]) => `${k}: ${v.join(',')}`).join(' · ') || '—'}</span>
          <span className="opacity-40">|</span>
          <span>{ctx.startDate} → {ctx.endDate}</span>
        </div>
      )}
      <AlarmsSection
        filters={filters}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
};

export default AlarmsTabContent;
