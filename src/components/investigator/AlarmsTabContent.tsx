import React from 'react';
import AlarmsSection from './AlarmsSection';
import { useInvestigatorStore } from '@/stores/investigatorStore';

/**
 * Self-contained Alarms panel for a single analysis tab.
 * Uses key={tabId} in the parent to force full re-mount per tab (state isolation).
 */
const AlarmsTabContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useInvestigatorStore();

  return (
    <AlarmsSection
      filters={state.filters}
      startDate={state.startDate}
      endDate={state.endDate}
    />
  );
};

export default AlarmsTabContent;
