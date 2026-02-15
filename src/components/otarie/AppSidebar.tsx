import React from 'react';
import {
  Calendar, Map as MapIcon, Users, Network,
  Radio, Settings, Layout, Bell,
  Database, Activity, ShieldCheck, BarChart2, ChevronLeft, ChevronRight,
  Sun, Moon, Sliders, Globe
} from 'lucide-react';
import { Filters, AppTab } from '../../types';

interface SidebarProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isCollapsed: boolean;
  setIsCollapsed: (c: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const navItems: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'analytics', label: 'Dashboard Overview', icon: <Activity className="w-4 h-4" /> },
  { id: 'list', label: 'Live Monitor Map', icon: <Globe className="w-4 h-4" /> },
  { id: 'sites', label: 'Network Topology', icon: <MapIcon className="w-4 h-4" /> },
  { id: 'bi', label: 'Analytic BI Studio', icon: <Database className="w-4 h-4" /> },
  { id: 'alerts', label: 'Alerts & RCA Monitor', icon: <Bell className="w-4 h-4" /> },
  { id: 'radio', label: 'Radio Mobility', icon: <Network className="w-4 h-4" /> },
  { id: 'traffic', label: 'Traffic Analysis', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'subscriber', label: 'Subscriber View', icon: <Users className="w-4 h-4" /> },
  { id: 'detector', label: 'Detector Console', icon: <ShieldCheck className="w-4 h-4" /> },
];

const AppSidebar: React.FC<SidebarProps> = ({
  filters, setFilters, activeTab, setActiveTab, isCollapsed, setIsCollapsed, theme, setTheme
}) => {
  const handleChange = (key: keyof Filters, value: any) => {
    setFilters({ ...filters, [key]: value });
  };

  return (
    <div className={`relative h-full flex flex-col z-50 shadow-2xl transition-all duration-300 border-r ${
      theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#020617] border-white/5'
    } ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>

      {/* COLLAPSE TOGGLE */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute -right-3 top-10 w-6 h-6 border rounded-full flex items-center justify-center shadow-md transition-all z-50 ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-400 hover:text-blue-600' : 'bg-slate-900 border-white/10 text-slate-500 hover:text-blue-400'
        }`}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* BRANDING */}
      <div className={`p-8 pb-4 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}>
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
          <Radio className="text-white w-4 h-4" />
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h1 className={`text-lg font-black tracking-tighter ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>OTARIE</h1>
            <p className="text-[7px] text-slate-400 uppercase tracking-widest font-bold opacity-70">QoE Observatory</p>
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-3' : 'px-4'} space-y-7 scrollbar-hide pb-20 pt-4`}>

        {/* THEME TOGGLE */}
        {!isCollapsed && (
          <div className={`mx-2 p-1 rounded-xl flex items-center gap-1 border transition-colors ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/5'
          }`}>
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-tighter transition-all ${
                theme === 'light' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Sun size={12} /> Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-tighter transition-all ${
                theme === 'dark' ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Moon size={12} /> Dark
            </button>
          </div>
        )}

        {/* NAVIGATION */}
        <section>
          {!isCollapsed && (
            <div className={`flex items-center gap-2 mb-3 px-2 border-b pb-2 ${theme === 'light' ? 'text-slate-400 border-slate-50' : 'text-slate-600 border-white/5'}`}>
              <Layout className="w-2.5 h-2.5" />
              <h3 className="text-[8px] font-bold uppercase tracking-widest">Main Modules</h3>
            </div>
          )}
          <div className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center rounded-xl transition-all text-left group ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'} ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : theme === 'light' ? 'text-slate-500 hover:bg-slate-50 hover:text-blue-600' : 'text-slate-500 hover:bg-white/5 hover:text-blue-400'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className={activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-blue-600'}>{item.icon}</span>
                {!isCollapsed && <span className="text-[11px] font-bold tracking-tighter">{item.label}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* TIME SCOPE */}
        {!isCollapsed && (
          <section>
            <div className={`flex items-center gap-2 mb-3 px-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>
              <Calendar className="w-2.5 h-2.5" />
              <h3 className="text-[8px] font-bold uppercase tracking-widest">Global Date</h3>
            </div>
            <div className="px-2">
              <input
                type="date"
                value={filters.dt}
                onChange={(e) => handleChange('dt', e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/20 appearance-none cursor-pointer tracking-tighter transition-colors ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              />
            </div>
          </section>
        )}
      </div>

      {/* FOOTER */}
      <div className={`p-6 border-t bg-transparent ${theme === 'light' ? 'border-slate-100' : 'border-white/5'} ${isCollapsed ? 'items-center px-0' : ''}`}>
        <button className={`w-full flex items-center transition-all group mb-4 ${isCollapsed ? 'justify-center' : 'gap-3 px-2 py-2 hover:bg-blue-600/10 rounded-xl'}`}>
          <Settings className={`w-4 h-4 transition-transform group-hover:rotate-45 ${theme === 'light' ? 'text-slate-400 group-hover:text-blue-600' : 'text-slate-600 group-hover:text-blue-400'}`} />
          {!isCollapsed && (
            <div className="text-left">
              <span className={`text-[11px] font-black uppercase tracking-tight block ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>Settings</span>
              <span className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Platform Config</span>
            </div>
          )}
        </button>
        {!isCollapsed && (
          <div className="flex items-center justify-between opacity-30 mt-2 px-2">
            <span className={`text-[8px] font-bold uppercase tracking-tighter ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>V1.4 • 2026</span>
            <Sliders className="w-2.5 h-2.5 text-slate-500" />
          </div>
        )}
      </div>
    </div>
  );
};

export default AppSidebar;
