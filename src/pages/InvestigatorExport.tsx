import React, { Suspense, lazy } from 'react';
import { CSVDataProvider } from '../components/bi/CSVDataStore';

const InvestigatorPage = lazy(() => import('../components/investigator/InvestigatorPage'));

/**
 * Standalone, sidebar-less Investigator view used as the "Export" target.
 * Opened in a new tab via the EXPORT button in the Investigator header.
 *
 * Wraps the page in the same providers used by the main app shell so the
 * Investigator gets every context it expects (CSV data, theme tokens, etc.)
 * and does not enter an infinite re-render loop.
 */
const InvestigatorExport: React.FC = () => {
  return (
    <CSVDataProvider>
      <div className="flex h-screen w-screen overflow-hidden font-sans bg-background text-foreground">
        <div className="flex-1 flex flex-col overflow-hidden relative z-0">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center bg-background">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            }
          >
            <InvestigatorPage />
          </Suspense>
        </div>
      </div>
    </CSVDataProvider>
  );
};

export default InvestigatorExport;
