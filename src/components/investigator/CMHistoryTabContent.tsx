import React from 'react';
import CMChangesCard from './CMChangesCard';
import { useInvestigatorStore } from '@/stores/investigatorStore';

/**
 * Self-contained CM History panel for a single analysis tab.
 * Uses key={tabId} in the parent to force full re-mount per tab (state isolation).
 */
const CMHistoryTabContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useInvestigatorStore();
  const cellNames = state.filters.Cell || state.filters.CELL || [];

  return (
    <CMChangesCard cellNames={cellNames} days={30} />
  );
};

export default CMHistoryTabContent;
