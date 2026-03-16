import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/qoebit/LoginPage';
import DashboardPage from '@/pages/qoebit/DashboardPage';
import TopologyPage from '@/pages/qoebit/TopologyPage';
import AlarmsPage from '@/pages/qoebit/AlarmsPage';
import CmHistoryPage from '@/pages/qoebit/CmHistoryPage';
import PmCountersPage from '@/pages/qoebit/PmCountersPage';
import NeighborsPage from '@/pages/qoebit/NeighborsPage';
import KpiMonitorPage from '@/pages/qoebit/KpiMonitorPage';
import AnomaliesPage from '@/pages/qoebit/AnomaliesPage';
import AssistantPage from '@/pages/qoebit/AssistantPage';
import ConfigPage from '@/pages/qoebit/ConfigPage';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="topology" element={<TopologyPage />} />
                <Route path="alarms" element={<AlarmsPage />} />
                <Route path="cm-history" element={<CmHistoryPage />} />
                <Route path="pm-counters" element={<PmCountersPage />} />
                <Route path="neighbors" element={<NeighborsPage />} />
                <Route path="kpis" element={<KpiMonitorPage />} />
                <Route path="anomalies" element={<AnomaliesPage />} />
                <Route path="assistant" element={<AssistantPage />} />
                <Route path="config" element={<ConfigPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
