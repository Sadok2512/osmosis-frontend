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
        return <SitesMonitor filters={filters} onFilterChange={setFilters} onCellSelect={(id) => { setSelectedCellId(id); setActiveTab('list'); }} />;
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
        return (
          <div className="flex-1 flex overflow-hidden bg-slate-50">
            {/* Site list panel */}
            <div className="w-[420px] transition-all duration-500 border-r border-slate-200 bg-white flex flex-col overflow-hidden shadow-2xl z-20">
              <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-30">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Inventory Index</h3>
                    <p className="text-[9px] font-bold text-blue-600 uppercase mt-1">Sites Navigation</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowFilters(!showFilters)}
                      className={`p-2 rounded-xl border transition-all ${showFilters ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <Filter size={16} />
                    </button>
                    <div className="px-3 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black">{filteredSites.length}</div>
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search Site ID or Name..." value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 border border-slate-100 bg-slate-50 rounded-[1.25rem] text-[11px] font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/5 focus:bg-white transition-all" />
                </div>

                {showFilters && (
                  <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-slate-100">
                    <FilterSelect label="Vendor" value={filters.vendor} options={VENDORS} onChange={(v: any) => updateFilter('vendor', v)} />
                    <FilterSelect label="DOR" value={filters.dor} options={DORS} onChange={(v: any) => updateFilter('dor', v)} />
                    <FilterSelect label="Dept" value={filters.department} options={DEPARTMENTS} onChange={(v: any) => updateFilter('department', v)} />
                    <FilterSelect label="Plaque" value={filters.plaque} options={PLAQUES} onChange={(v: any) => updateFilter('plaque', v)} />
                  </div>
                )}
              </div>

              {/* Sites cards */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
                {filteredSites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <LayoutGrid size={48} className="mb-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">No matching sites</span>
                  </div>
                ) : filteredSites.map(site => {
                  const isExpanded = expandedSiteId === site.site_id;
                  return (
                    <div key={site.site_id} className={`group bg-white border rounded-[2rem] overflow-hidden transition-all duration-300 hover:shadow-xl ${isExpanded ? 'border-blue-400 ring-4 ring-blue-500/5' : 'border-slate-200'}`}>
                      <button onClick={() => setExpandedSiteId(isExpanded ? null : site.site_id)}
                        className={`w-full text-left p-6 flex items-center justify-between transition-colors ${isExpanded ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/30'}`}>
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${isExpanded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>
                            <MapPin size={18} />
                          </div>
                          <div className="overflow-hidden">
                            <div className="text-[13px] font-black text-slate-800 truncate tracking-tight uppercase">{site.site_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{site.site_id}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase">{site.vendor}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <div className="text-[14px] font-black tracking-tighter" style={{ color: getQoEColor(site.qoe_score_avg) }}>{site.qoe_score_avg.toFixed(1)}%</div>
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{site.cells.length} Cells</div>
                          </div>
                          <ChevronRight size={18} className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-6 pt-2 bg-slate-50/50 grid grid-cols-4 gap-2 border-t border-slate-100">
                          {site.cells.map((cell, idx) => {
                            const isCellSelected = selectedCellId === cell.cell_id;
                            return (
                              <button key={cell.cell_id} onClick={(e) => { e.stopPropagation(); setSelectedCellId(cell.cell_id); }}
                                className={`flex flex-col items-center justify-center py-4 px-1 rounded-2xl border transition-all duration-300 ${
                                  isCellSelected ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-200 hover:border-blue-300'
                                }`}>
                                <span className={`text-[8px] font-black uppercase mb-1 ${isCellSelected ? 'text-white/70' : 'text-slate-400'}`}>{cell.techno}</span>
                                <div className="w-2.5 h-2.5 rounded-full my-1.5 shadow-sm border-2 border-white"
                                  style={{ backgroundColor: isCellSelected ? 'white' : getQoEColor(cell.qoe_score_avg) }} />
                                <span className={`text-[10px] font-black tracking-tighter ${isCellSelected ? 'text-white' : 'text-slate-900'}`}>S{idx + 1}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Map placeholder */}
            <div className="flex-1 relative z-10 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <div className="text-center p-12 bg-white/80 backdrop-blur rounded-[3rem] border border-slate-200 shadow-xl max-w-lg">
                <MapPin className="w-16 h-16 text-blue-500 mx-auto mb-6 opacity-30" />
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Map View</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Interactive map with color-coded site markers by KPI. Select sites from the left panel to see cell details.
                </p>
                <p className="text-[10px] text-slate-400 mt-4 font-black uppercase tracking-widest">Simplified view • Leaflet integration available</p>
              </div>
            </div>

            {/* Cell detail panel */}
            {selectedCellId && (
              <div className="w-[400px] border-l border-slate-200 bg-white shadow-2xl z-30 overflow-y-auto p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cell Selected</div>
                    <div className="text-lg font-black text-slate-900 tracking-tight">{selectedCellId}</div>
                  </div>
                  <button onClick={() => setSelectedCellId(null)} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:bg-slate-100">✕</button>
                </div>
                <div className="space-y-4">
                  {['QoE Score', 'DMS DL 3M', 'DMS DL 8M', 'Throughput DL', 'Latency P95'].map((label, i) => (
                    <div key={label} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-500 uppercase">{label}</span>
                      <span className="text-sm font-black text-slate-800">{(60 + Math.random() * 35).toFixed(1)}{i < 3 ? '%' : i === 3 ? ' Mbps' : ' ms'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-slate-100 text-slate-900">
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
