import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { CSVDataProvider } from '../components/bi/CSVDataStore';
import AppSidebar from '../components/otarie/AppSidebar';
import DashboardOverview from '../components/otarie/DashboardOverview';

const SitesMonitor = lazy(() => import('../components/otarie/SitesMonitor'));
const GlobalDashboard = lazy(() => import('../components/otarie/GlobalDashboard'));
const AdvancedAnalytics = lazy(() => import('../components/otarie/AdvancedAnalytics'));
const RadioMobility = lazy(() => import('../components/otarie/RadioMobility'));
const AnalyticBIStudio = lazy(() => import('../components/otarie/AnalyticBIStudio'));
const SubscriberExperience = lazy(() => import('../components/otarie/SubscriberExperience'));
const DetectorConsole = lazy(() => import('../components/otarie/DetectorConsole'));
const SettingsPanel = lazy(() => import('../components/otarie/SettingsPanel'));
const DocumentationPage = lazy(() => import('../components/otarie/DocumentationPage'));
const AIAssistantPage = lazy(() => import('../components/otarie/AIAssistantPage'));
const RadioProfilePage = lazy(() => import('../components/otarie/RadioProfilePage'));
const BackendAdmin = lazy(() => import('../components/otarie/BackendAdmin'));
const TopologiePage = lazy(() => import('../components/otarie/TopologiePage'));
const ParametersPage = lazy(() => import('../components/parameter-hub/ParameterHubPage'));
const AlarmCenterPage = lazy(() => import('../components/alarm-center/AlarmCenterPage'));
const TicketManagementPage = lazy(() => import('../components/ticket-management/TicketManagementPage'));
const AgentHubPage = lazy(() => import('../components/otarie/AgentHubPage'));
const KpiReference2Page = lazy(() => import('../components/kpi-monitor/KpiReferenceWorkspace2'));
const PmDashboardPage = lazy(() => import('../components/pm-dashboard/PmDashboardPage'));
const SentinelPage = lazy(() => import('../components/sentinel/SentinelPage'));
const InvestigatorPage = lazy(() => import('../components/investigator/InvestigatorPage'));
const RanQueryModule = lazy(() => import('../components/ran-query/RanQueryModule'));
const NetworkTopologyPage = lazy(() => import('../components/otarie/NetworkTopologyPage'));
const OdccDetectorConsole = lazy(() => import('../components/odcc/OdccDetectorConsole'));
const PrecisionArchitectPage = lazy(() => import('./PrecisionArchitect'));

import { Filters, KPIType, SiteSummary, AppTab } from '../types';
import { fetchSites } from '../services/mockData';
import { useInvestigatorWorkspace } from '@/stores/investigatorWorkspaceStore';

export type SidebarTheme = 'dark' | 'grey' | 'light';
export type AccentColor = 'default' | 'orange' | 'red' | 'pink' | 'purple' | 'indigo' | 'cyan' | 'emerald' | 'amber';

class InvestigatorTabBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[InvestigatorTab] render failed', error);
  }

  private reset = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="h-full w-full flex items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="text-sm font-bold">Investigator failed to open</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            The local Investigator workspace was reset. Retry without leaving this page.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            Retry Investigator
          </button>
        </div>
      </div>
    );
  }
}

const Index: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard_overview');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarTheme, setSidebarTheme] = useState<SidebarTheme>('dark');
  const [accentColor, setAccentColor] = useState<AccentColor>('default');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [highlightedCellIds, setHighlightedCellIds] = useState<string[]>([]);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>();
  const [investigatorResetKey, setInvestigatorResetKey] = useState(0);
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('osmosis_enabled_modules');
    if (saved) return JSON.parse(saved);
    return {
      dashboard_overview: true,
      list: true,
      sites: true,
      traffic: true,
      alerts: true,
      detector: true,
      ai_assistant: true,
      radio_profile: true,
      topologie: true,
      rag: true,
      docs: true,
      backend_admin: true,
      kpi_monitor: true,
      kpi_reference2: true,
      pm_dashboard: true,
      parameters: true,
      pulse_report: true,
      sentinel: true,
      odcc: true,
      topology: true,
      ran_query: true,
      ticket_management: true,
  });

  useEffect(() => {
    localStorage.setItem('osmosis_enabled_modules', JSON.stringify(enabledModules));
  }, [enabledModules]);

  // Honour ?tab=<id> deep-link (e.g. redirect from /precision-architect)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') as AppTab | null;
      if (tab) {
        setActiveTab(tab);
        const url = new URL(window.location.href);
        url.searchParams.delete('tab');
        window.history.replaceState({}, '', url.toString());
      }
    } catch { /* noop */ }
  }, []);

  const accentStyles: Record<AccentColor, Record<string, string>> = {
    default: {},
    orange: { '--primary': '25 95% 53%', '--accent': '25 95% 53%', '--ring': '25 95% 53%', '--sidebar-primary': '25 95% 53%', '--sidebar-ring': '25 95% 53%' },
    red: { '--primary': '0 72% 51%', '--accent': '0 72% 51%', '--ring': '0 72% 51%', '--sidebar-primary': '0 72% 51%', '--sidebar-ring': '0 72% 51%' },
    pink: { '--primary': '330 81% 60%', '--accent': '330 81% 60%', '--ring': '330 81% 60%', '--sidebar-primary': '330 81% 60%', '--sidebar-ring': '330 81% 60%' },
    purple: { '--primary': '262 83% 58%', '--accent': '262 83% 58%', '--ring': '262 83% 58%', '--sidebar-primary': '262 83% 58%', '--sidebar-ring': '262 83% 58%' },
    indigo: { '--primary': '239 84% 67%', '--accent': '239 84% 67%', '--ring': '239 84% 67%', '--sidebar-primary': '239 84% 67%', '--sidebar-ring': '239 84% 67%' },
    cyan: { '--primary': '187 92% 39%', '--accent': '187 92% 39%', '--ring': '187 92% 39%', '--sidebar-primary': '187 92% 39%', '--sidebar-ring': '187 92% 39%' },
    emerald: { '--primary': '160 84% 39%', '--accent': '160 84% 39%', '--ring': '160 84% 39%', '--sidebar-primary': '160 84% 39%', '--sidebar-ring': '160 84% 39%' },
    amber: { '--primary': '38 92% 50%', '--accent': '38 92% 50%', '--ring': '38 92% 50%', '--sidebar-primary': '38 92% 50%', '--sidebar-ring': '38 92% 50%' },
  };

  const [filters, setFilters] = useState<Filters>({
    dt: '2026-02-10',
    kpi: KPIType.QOE_SCORE,
    rat: 'ALL',
    service: 'ALL',
    plaque: 'ALL',
    vendor: 'ALL',
    dor: 'ALL',
    department: 'ALL',
    from_dt: '2026-02-03',
    to_dt: '2026-02-10',
    milestones: [{ dt: '2026-02-05', label: 'Migration Core' }],
    thresholds: { qoe: 70, dms_dl_3: 80, dms_dl_8: 65, dms_dl_30: 25, latency: 150, loss: 0.1 },
    visibility: { showSessions: true, showMilestones: true, showThresholds: true, showPoints: true },
    backgroundKpi: 'sessions',
    backgroundOpacity: 0.1,
    kpiColors: { qoe: '#3b82f6', dms_dl_30: '#f97316', dms_dl_8: '#8b5cf6', dms_dl_3: '#10b981', dms_ul_3: '#ec4899', throughput: '#14b8a6', throughput_ul: '#6366f1', latency: '#f59e0b' },
  });

  useEffect(() => {
    fetchSites(filters).then(setSites).catch(console.error);
  }, [filters]);

  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      const matchesSearch = s.site_name.toLowerCase().includes(siteSearch.toLowerCase()) || s.site_id.toLowerCase().includes(siteSearch.toLowerCase());
      const matchesVendor = filters.vendor === 'ALL' || s.vendor === filters.vendor;
      const matchesDor = filters.dor === 'ALL' || s.dor === filters.dor;
      const matchesDept = filters.department === 'ALL' || s.department === filters.department;
      const matchesPlaque = filters.plaque === 'ALL' || s.plaque === filters.plaque;
      const matchesRat = filters.rat === 'ALL' || s.cells.some(c => c.techno === filters.rat);
      return matchesSearch && matchesVendor && matchesDor && matchesDept && matchesPlaque && matchesRat;
    });
  }, [sites, siteSearch, filters]);

  const sidebarClass = sidebarTheme === 'grey' ? 'sidebar-grey' : sidebarTheme === 'light' ? 'sidebar-light' : '';
  const resetInvestigatorWorkspace = () => {
    try {
      localStorage.removeItem('investigator-workspace-v1');
    } catch {
      // ignore storage failures
    }
    useInvestigatorWorkspace.getState().resetWorkspace();
    setInvestigatorResetKey(v => v + 1);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard_overview':
        return <DashboardOverview setActiveTab={setActiveTab} />;
      case 'analytics':
        return <GlobalDashboard filters={filters} onFilterChange={setFilters} />;
      case 'bi':
        return <AdvancedAnalytics filters={filters} theme={theme} />;
      case 'sites':
      case 'list':
        return null;
      case 'alerts':
        return null;
      case 'radio':
        return <RadioMobility filters={filters} />;
      case 'traffic':
        return <AnalyticBIStudio filters={filters} />;
      case 'subscriber':
        return <SubscriberExperience filters={filters} />;
      case 'detector':
        return <DetectorConsole />;
      case 'odcc':
        return <OdccDetectorConsole />;
      case 'settings':
        return <SettingsPanel sidebarTheme={sidebarTheme} setSidebarTheme={setSidebarTheme} accentColor={accentColor} setAccentColor={setAccentColor} enabledModules={enabledModules} setEnabledModules={setEnabledModules} />;
      case 'docs':
        return <DocumentationPage />;
      case 'ai_assistant':
        return <AIAssistantPage sites={sites} onShowWorstCells={(cellIds) => { setHighlightedCellIds(cellIds); setActiveTab('sites'); }} initialPrompt={aiInitialPrompt} onPromptConsumed={() => setAiInitialPrompt(undefined)} onNavigate={(tab) => setActiveTab(tab as AppTab)} />;
      case 'radio_profile':
        return <RadioProfilePage />;
      case 'backend_admin':
        return <BackendAdmin />;
      case 'topologie':
        return <TopologiePage />;
      case 'kpi_reference2':
        return <KpiReference2Page />;
      case 'pm_dashboard':
        return <PmDashboardPage />;
      case 'parameters':
        return <ParametersPage />;
      case 'alarm_center':
        return <AlarmCenterPage />;
      case 'ticket_management':
        return <TicketManagementPage />;
      case 'agent_hub':
        return <AgentHubPage onNavigate={setActiveTab} />;
      case 'sentinel':
        return <SentinelPage theme={theme} />;
      case 'investigator':
        return (
          <InvestigatorTabBoundary onReset={resetInvestigatorWorkspace}>
            <InvestigatorPage key={investigatorResetKey} />
          </InvestigatorTabBoundary>
        );
      case 'ran_query':
        return <RanQueryModule />;
      case 'topology':
        return <NetworkTopologyPage />;
      case 'precision_architect':
        return <PrecisionArchitectPage />;
      default:
        return null;
    }
  };

  const LazyFallback = () => (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <CSVDataProvider>
      <div className={`flex h-screen w-screen overflow-hidden font-sans bg-background text-foreground ${sidebarClass} ${theme === 'dark' ? 'dark' : ''}`} style={accentStyles[accentColor] as React.CSSProperties}>
        <AppSidebar
          filters={filters}
          setFilters={setFilters}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          theme={theme}
          setTheme={setTheme}
          enabledModules={enabledModules}
        />
        <div className="flex-1 flex flex-col overflow-hidden relative z-0">
          <Suspense fallback={<LazyFallback />}>
            <div style={{ display: activeTab === 'sites' || activeTab === 'list' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <SitesMonitor isVisible={activeTab === 'sites' || activeTab === 'list'} filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); }} highlightedCellIds={highlightedCellIds} onClearHighlights={() => setHighlightedCellIds([])} onLaunchAI={(siteName) => { setAiInitialPrompt(`Analyse RCA complète du site ${siteName} : identifie les problèmes de QoE, throughput, latence et propose des actions correctives.`); setActiveTab('ai_assistant'); }} />
            </div>
          </Suspense>
          {activeTab !== 'sites' && activeTab !== 'list' && (
            <Suspense fallback={<LazyFallback />}>
              {renderContent()}
            </Suspense>
          )}
        </div>
      </div>
    </CSVDataProvider>
  );
};

export default Index;
