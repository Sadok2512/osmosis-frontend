import { lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";


const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const UserLogin = lazy(() => import("./pages/UserLogin"));
const InvestigatorDrilldown = lazy(() => import("./pages/InvestigatorDrilldown"));
const PrecisionArchitect = lazy(() => import("./pages/PrecisionArchitect"));

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[App] render failed", error);
  }

  private recover = () => {
    try {
      if (window.location.pathname.startsWith("/investigator")) {
        window.localStorage.removeItem("investigator-workspace-v1");
      }
    } catch {
      // ignore storage failures
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="text-sm font-bold">Application failed to open</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            A local browser state or cached route failed during rendering. Reload to recover the page.
          </p>
          <button
            type="button"
            onClick={this.recover}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            Reload
          </button>
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
