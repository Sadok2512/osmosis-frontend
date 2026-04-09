import React from 'react';
import NeighborsSection from './NeighborsSection';
import { useInvestigatorStore } from '@/stores/investigatorStore';

/**
 * Self-contained Neighbors panel for a single analysis tab.
 * Uses key={tabId} in the parent to force full re-mount per tab (state isolation).
 */
const NeighborsTabContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useInvestigatorStore();

  return (
    <NeighborsSection filters={state.filters} />
  );
};

export default NeighborsTabContent;
