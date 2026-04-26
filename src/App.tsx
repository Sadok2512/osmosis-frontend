import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CrashRepro from "@/components/shared/CrashRepro";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const UserLogin = lazy(() => import("./pages/UserLogin"));
const InvestigatorDrilldown = lazy(() => import("./pages/InvestigatorDrilldown"));
const InvestigatorExport = lazy(() => import("./pages/InvestigatorExport"));
const PrecisionArchitect = lazy(() => import("./pages/PrecisionArchitect"));

// Single, app-wide QueryClient. We persist its cache to localStorage so chart
// data survives navigation away from Precision Architect (and even full page
// reloads) — without this, every widget fired a fresh /monitor/query call on
// remount and the user saw a "Loading…" wave each time they came back.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache stays "fresh" for 10 minutes — no auto refetch on mount/focus.
      staleTime: 10 * 60 * 1000,
      // Garbage-collect after 24h so persisted entries can survive a full day
      // of light usage (sufficient to bridge most navigation scenarios).
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'lovable-query-cache-v1',
  // Throttle writes so we don't spam localStorage on every cache update.
  throttleTime: 1000,
});

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      // Only persist successful, non-empty responses; skip in-flight queries.
      dehydrateOptions: {
        shouldDehydrateQuery: (q) =>
          q.state.status === 'success' && q.state.data !== undefined,
      },
      buster: 'v1',
    }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <CrashRepro />
      <BrowserRouter>
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>}>
          <Routes>
            <Route path="/login" element={<UserLogin />} />
            <Route path="/" element={<Index />} />
            <Route path="/investigator" element={<InvestigatorDrilldown />} />
            <Route path="/precision-architect" element={<PrecisionArchitect />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminPanel />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
