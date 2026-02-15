import React from 'react';
import {
  Calendar, Map as MapIcon, Users, Network,
  Radio, Settings, Layout, Bell,
  Database, Activity, ShieldCheck, BarChart2, ChevronLeft, ChevronRight,
  Sliders, Globe, FileText, BookOpen, Sparkles
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
  { id: 'list', label: 'Live Monitor Map', icon: <Globe className="w-5 h-5" /> },
  { id: 'sites', label: 'Network Topology', icon: <Network className="w-5 h-5" /> },
  { id: 'traffic', label: 'Analytic BI Studio', icon: <BarChart2 className="w-5 h-5" /> },
  { id: 'alerts', label: 'Alerts & RCA Monitor', icon: <Bell className="w-5 h-5" /> },
  { id: 'radio', label: 'Radio Mobility', icon: <Radio className="w-5 h-5" /> },
  { id: 'ai_assistant', label: 'QOEBIT', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'docs', label: 'Documentation', icon: <BookOpen className="w-5 h-5" /> },
];

const AppSidebar: React.FC<SidebarProps> = ({
  filters, setFilters, activeTab, setActiveTab, isCollapsed, setIsCollapsed, theme, setTheme
}) => {
  return (
    <div className={`relative h-full flex flex-col z-50 transition-all duration-300 bg-sidebar border-r border-sidebar-border ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>

      {/* COLLAPSE TOGGLE */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 w-6 h-6 border rounded-full flex items-center justify-center shadow-md transition-all z-50 bg-sidebar border-sidebar-border text-sidebar-foreground hover:text-sidebar-primary"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* BRANDING */}
      <div className={`p-6 pb-4 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}>
        <div className="w-10 h-10 bg-sidebar-accent rounded-xl flex items-center justify-center shrink-0 border border-sidebar-border">
          <Radio className="text-sidebar-primary w-5 h-5" />
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight text-sidebar-accent-foreground">OTARIE</h1>
            <p className="text-[11px] text-sidebar-primary font-medium">QoE Observatory</p>
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'} space-y-6 scrollbar-hide pb-20 pt-4`}>

        {/* SECTION LABEL */}
        {!isCollapsed && (
          <div className="px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Main Modules</span>
          </div>
        )}

        {/* NAVIGATION */}
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center rounded-xl transition-all text-left group ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'} ${
                activeTab === item.id
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span className={activeTab === item.id ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-primary'}>{item.icon}</span>
              {!isCollapsed && <span className="text-[13px] font-medium tracking-tight">{item.label}</span>}
            </button>
          ))}
        </div>

      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center transition-all group ${isCollapsed ? 'justify-center' : 'gap-3 px-3 py-2.5 rounded-xl'} ${
            activeTab === 'settings' ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg' : 'hover:bg-sidebar-accent'
          }`}
        >
          <Settings className={`w-5 h-5 transition-transform group-hover:rotate-45 ${activeTab === 'settings' ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-primary'}`} />
          {!isCollapsed && (
            <div className="text-left">
              <span className={`text-xs font-semibold block ${activeTab === 'settings' ? 'text-sidebar-primary-foreground' : 'text-sidebar-accent-foreground'}`}>Settings</span>
              <span className={`text-[10px] font-normal ${activeTab === 'settings' ? 'text-sidebar-primary-foreground/70' : 'text-sidebar-foreground/60'}`}>Platform Config</span>
            </div>
          )}
        </button>
        {!isCollapsed && (
          <div className="flex items-center gap-2 mt-4 px-3 opacity-50">
            <div className="w-2 h-2 rounded-full bg-sidebar-primary" />
            <span className="text-[10px] font-medium text-sidebar-foreground">V1.0 Beta • Orange France</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppSidebar;
