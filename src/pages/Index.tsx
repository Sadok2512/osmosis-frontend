import React, { useState, useEffect, useMemo } from 'react';
import { CSVDataProvider } from '../components/bi/CSVDataStore';
import AppSidebar from '../components/otarie/AppSidebar';
import GlobalDashboard from '../components/otarie/GlobalDashboard';
import SitesMonitor from '../components/otarie/SitesMonitor';
import AdvancedAnalytics from '../components/otarie/AdvancedAnalytics';
import AlertsRCA from '../components/otarie/AlertsRCA';
import RadioMobility from '../components/otarie/RadioMobility';
import AnalyticBIStudio from '../components/otarie/AnalyticBIStudio';
import SubscriberExperience from '../components/otarie/SubscriberExperience';
import DetectorConsole from '../components/otarie/DetectorConsole';
import SettingsPanel from '../components/otarie/SettingsPanel';
import DocumentationPage from '../components/otarie/DocumentationPage';
import AIAssistantPage from '../components/otarie/AIAssistantPage';
import DashboardOverview from '../components/otarie/DashboardOverview';
import RAGManager from '../components/otarie/RAGManager';
import RadioProfilePage from '../components/otarie/RadioProfilePage';
import BackendAdmin from '../components/otarie/BackendAdmin';
import TopologiePage from '../components/otarie/TopologiePage';
import ParametersPage from '../components/otarie/ParametersPage';
import PulseReportPage from '../components/otarie/PulseReportPage';
import AgentHubPage from '../components/otarie/AgentHubPage';
import KPIMonitorPage from '../components/kpi-monitor/KPIMonitorPage';
import { Filters, KPIType, SiteSummary, GeoJSONFeature, AppTab } from '../types';
import { fetchSites, generateMapFeatures } from '../services/mockData';
import { Search, MapPin, Filter, LayoutGrid, ChevronRight } from 'lucide-react';
import { getQoEColor, VENDORS, URS, DEPARTMENTS, PLAQUES } from '../constants';

export type SidebarTheme = 'dark' | 'grey' | 'light';
export type AccentColor = 'default' | 'orange' | 'red' | 'pink' | 'purple' | 'indigo' | 'cyan' | 'emerald' | 'amber';

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
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('qoebit_enabled_modules');
    if (saved) return JSON.parse(saved);
    return {
      dashboard_overview: true, list: true, sites: true, traffic: true,
      alerts: true, detector: true, ai_assistant: true, radio_profile: true,
      topologie: true, rag: true, docs: true, backend_admin: true, kpi_monitor: true, parameters: true, pulse_report: true,
    };
  });

  useEffect(() => {
    localStorage.setItem('qoebit_enabled_modules', JSON.stringify(enabledModules));
  }, [enabledModules]);

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

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const sidebarClass = sidebarTheme === 'grey' ? 'sidebar-grey' : sidebarTheme === 'light' ? 'sidebar-light' : '';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard_overview':
        return <DashboardOverview setActiveTab={setActiveTab} />;
      case 'analytics':
        return <GlobalDashboard filters={filters} onFilterChange={setFilters} />;
      case 'bi':
        return <AdvancedAnalytics filters={filters} theme={theme} />;
      case 'sites':
        return <SitesMonitor filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); }} highlightedCellIds={highlightedCellIds} onClearHighlights={() => setHighlightedCellIds([])} onLaunchAI={(siteName) => { setAiInitialPrompt(`Analyse RCA complète du site ${siteName} : identifie les problèmes de QoE, throughput, latence et propose des actions correctives.`); setActiveTab('ai_assistant'); }} />;
      case 'alerts':
        return <AlertsRCA filters={filters} />;
      case 'radio':
        return <RadioMobility filters={filters} />;
      case 'traffic':
        return <AnalyticBIStudio filters={filters} />;
      case 'subscriber':
        return <SubscriberExperience filters={filters} />;
      case 'detector':
        return <DetectorConsole />;
      case 'list':
        return <SitesMonitor filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); }} highlightedCellIds={highlightedCellIds} onClearHighlights={() => setHighlightedCellIds([])} onLaunchAI={(siteName) => { setAiInitialPrompt(`Analyse RCA complète du site ${siteName} : identifie les problèmes de QoE, throughput, latence et propose des actions correctives.`); setActiveTab('ai_assistant'); }} />;
      case 'settings':
        return <SettingsPanel sidebarTheme={sidebarTheme} setSidebarTheme={setSidebarTheme} accentColor={accentColor} setAccentColor={setAccentColor} enabledModules={enabledModules} setEnabledModules={setEnabledModules} />;
      case 'docs':
        return <DocumentationPage />;
      case 'ai_assistant':
        return <AIAssistantPage sites={sites} onShowWorstCells={(cellIds) => { setHighlightedCellIds(cellIds); setActiveTab('sites'); }} initialPrompt={aiInitialPrompt} onPromptConsumed={() => setAiInitialPrompt(undefined)} onNavigate={(tab) => setActiveTab(tab as AppTab)} />;
      case 'radio_profile':
        return <RadioProfilePage />;
      case 'rag':
        return <RAGManager />;
      case 'backend_admin':
        return <BackendAdmin />;
      case 'topologie':
        return <TopologiePage />;
      case 'kpi_monitor':
        return <KPIMonitorPage />;
      case 'parameters':
        return <ParametersPage />;
      case 'pulse_report':
        return <PulseReportPage />;
      case 'agent_hub':
        return <AgentHubPage onNavigate={setActiveTab} />;
      default:
        return null;
    }
  };

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
        {renderContent()}
      </div>
    </div>
    </CSVDataProvider>
  );
};

const FilterSelect = ({ label, value, options, onChange }: any) => (
  <div className="flex flex-col gap-2 text-left">
    <span className="text-[8px] font-black uppercase text-slate-400 tracking-[0.15em] ml-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-xl border border-slate-100 bg-white text-slate-600 text-[10px] font-black uppercase outline-none focus:border-blue-300 transition-all shadow-sm">
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

export default Index;
