import React, { Suspense, lazy } from 'react';

const InvestigatorPage = lazy(() => import('../components/investigator/InvestigatorPage'));

/**
 * Standalone, sidebar-less Investigator view used as the "Export" target.
 * Opened in a new tab via the EXPORT button in the Investigator header.
 */
const InvestigatorExport: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        }
      >
        <InvestigatorPage />
      </Suspense>
    </div>
  );
};

export default InvestigatorExport;
