import React from 'react';
import KPIMonitorPage from './KPIMonitorPage';

const KpiMonitorWorkspace: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden">
        <KPIMonitorPage />
      </div>
    </div>
  );
};

export default KpiMonitorWorkspace;
