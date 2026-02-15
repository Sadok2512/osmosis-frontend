import React, { useState, useEffect, useMemo } from 'react';
import AppSidebar from '../components/otarie/AppSidebar';
import GlobalDashboard from '../components/otarie/GlobalDashboard';
import SitesMonitor from '../components/otarie/SitesMonitor';
import AdvancedAnalytics from '../components/otarie/AdvancedAnalytics';
import AlertsRCA from '../components/otarie/AlertsRCA';
import RadioMobility from '../components/otarie/RadioMobility';
import TrafficTypes from '../components/otarie/TrafficTypes';
import SubscriberExperience from '../components/otarie/SubscriberExperience';
import DetectorConsole from '../components/otarie/DetectorConsole';
import SettingsPanel from '../components/otarie/SettingsPanel';
import { Filters, KPIType, SiteSummary, GeoJSONFeature, AppTab } from '../types';
import { fetchSites, generateMapFeatures } from '../services/mockData';
import { Search, MapPin, Filter, LayoutGrid, ChevronRight } from 'lucide-react';
import { getQoEColor, VENDORS, DORS, DEPARTMENTS, PLAQUES } from '../constants';

const Index: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('analytics');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  const renderContent = () => {
    switch (activeTab) {
      case 'analytics':
        return <GlobalDashboard filters={filters} onFilterChange={setFilters} />;
      case 'bi':
        return <AdvancedAnalytics filters={filters} theme={theme} />;
      case 'sites':
        return <SitesMonitor filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); }} />;
      case 'alerts':
        return <AlertsRCA filters={filters} />;
      case 'radio':
        return <RadioMobility filters={filters} />;
      case 'traffic':
        return <TrafficTypes filters={filters} />;
      case 'subscriber':
        return <SubscriberExperience filters={filters} />;
      case 'detector':
        return <DetectorConsole />;
      case 'list':
        return <SitesMonitor filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); }} />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-background text-foreground">
      <AppSidebar
        filters={filters}
        setFilters={setFilters}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        theme={theme}
        setTheme={setTheme}
      />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {renderContent()}
      </div>
    </div>
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
