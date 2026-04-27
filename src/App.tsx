import { lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useInvestigatorWorkspace } from "@/stores/investigatorWorkspaceStore";


const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const UserLogin = lazy(() => import("./pages/UserLogin"));
const InvestigatorDrilldown = lazy(() => import("./pages/InvestigatorDrilldown"));
const PrecisionArchitect = lazy(() => import("./pages/PrecisionArchitect"));

type AppErrorState = { hasError: boolean; error?: Error; info?: string };

// localStorage keys this app persists. Reset clears all of them so a stale
// shape from an older code path doesn't keep crashing the page.
const APP_LOCAL_STORAGE_KEYS = [
  "investigator-workspace-v1",
  "osmosis_ran_query_reports_v1",
  "osmosis_data_source",
  "pa-global-toolbar-store",
  "pa-report-store",
];

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorState> {
  state: AppErrorState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    console.error("[App] render failed", error, info);
    this.setState({ info: info?.componentStack });
  }

  private recover = () => {
    try {
      for (const key of APP_LOCAL_STORAGE_KEYS) {
        try { window.localStorage.removeItem(key); } catch { /* ignore */ }
      }
      // Clear any *zustand* persist keys we may have missed (suffix-based heuristic).
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (!k) continue;
          if (k.startsWith("osmosis_") || k.startsWith("pa-") || k.endsWith("-store")) {
            window.localStorage.removeItem(k);
          }
        }
      } catch { /* ignore */ }
      try { useInvestigatorWorkspace.getState().resetWorkspace(); } catch { /* ignore */ }
    } catch {
      // ignore storage failures
    }
    this.setState({ hasError: false, error: undefined, info: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const errMsg = this.state.error?.message || String(this.state.error || "Unknown error");
    const stack = this.state.error?.stack || "";

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="text-sm font-bold">Application failed to open</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            A local browser state or cached route failed during rendering. Reset local state and retry without navigation.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-destructive whitespace-pre-wrap break-words">
            {errMsg}
          </pre>
          {stack && (
            <details className="mt-2 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Stack</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{stack}</pre>
            </details>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.recover}
              className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              Reset & retry
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              className="rounded-md border border-border px-3 py-2 text-xs font-bold"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
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
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
