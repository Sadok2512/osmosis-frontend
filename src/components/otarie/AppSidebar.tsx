import React, { useRef, useState, useEffect, useCallback } from 'react';
// Pull the build-time version from package.json so the sidebar footer
// follows the actual release tag (was hard-coded "V6.0.0" pre-2026-05-12).
import { version as APP_VERSION } from '../../../package.json';
import {
  Calendar, Map as MapIcon, Users, Network,
  Radio, Settings, Layout, Bell,
  Database, ShieldCheck, BarChart2, ChevronLeft, ChevronRight,
  Sliders, Globe, FileText, BookOpen, Sparkles, Sun, Moon, LineChart, MapPin, LogOut,
  Search, Wand2, Radar, ChevronDown
} from 'lucide-react';
import { clearSession } from '@/services/adminAuth';
import { useNavigate } from 'react-router-dom';
import { Filters, AppTab } from '../../types';
import { dashboardsApi } from '@/lib/localDb';

interface SidebarProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isCollapsed: boolean;
  setIsCollapsed: (c: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  enabledModules: Record<string, boolean>;
}

type NavItem = { id: AppTab; label: string; icon: React.ReactNode };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard_overview', label: 'Dashboard Overview', icon: <Layout className="w-5 h-5" /> },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { id: 'list', label: 'Live Monitor Map', icon: <Globe className="w-5 h-5" /> },
      { id: 'odcc', label: 'ODCC', icon: <Radar className="w-5 h-5" /> },
    ],
  },
  {
    label: 'Network View',
    items: [
      { id: 'parameters', label: 'Network Explorer', icon: <Sliders className="w-5 h-5" /> },
      { id: 'alarm_center', label: 'Alarm Center', icon: <Bell className="w-5 h-5" /> },
      { id: 'docs', label: 'Cluster Builder', icon: <BookOpen className="w-5 h-5" /> },
    ],
  },
  {
    label: 'KPI Analysis',
    items: [
      { id: 'investigator', label: 'Investigator', icon: <Search className="w-5 h-5" /> },
      { id: 'ran_query', label: 'Rapport Builder', icon: <BarChart2 className="w-5 h-5" /> },
      { id: 'precision_architect' as AppTab, label: 'Netview', icon: <Wand2 className="w-5 h-5" /> },
    ],
  },
  {
    label: 'AI / ML',
    items: [
      { id: 'ai_assistant', label: 'OSMOSIS', icon: <Sparkles className="w-5 h-5" /> },
      { id: 'sentinel', label: 'ML Detector', icon: <Radio className="w-5 h-5" /> },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'backend_admin', label: 'Backend Admin', icon: <Database className="w-5 h-5" /> },
    ],
  },
];


const AppSidebar: React.FC<SidebarProps> = ({
  filters, setFilters, activeTab, setActiveTab, isCollapsed, setIsCollapsed, theme, setTheme, enabledModules
}) => {
  const navigate = useNavigate();
  const visibleGroups = navGroups
    .map(g => ({ ...g, items: g.items.filter(item => !enabledModules || enabledModules[item.id] !== false) }))
    .filter(g => g.items.length > 0);
  const visibleNavItems = visibleGroups.flatMap(g => g.items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map(g => [g.label, true]))
  );
  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  // Auto-open the group containing the active tab
  useEffect(() => {
    const grp = navGroups.find(g => g.items.some(i => i.id === activeTab));
    if (grp && !openGroups[grp.label]) {
      setOpenGroups(prev => ({ ...prev, [grp.label]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollTop > 4);
    setCanScrollRight(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => { checkScroll(); }, [checkScroll, visibleNavItems]);

  // Expose sidebar width as a CSS variable so the global broadcast banner can offset itself.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '70px' : '260px');
  }, [isCollapsed]);

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ top: dir * 120, behavior: 'smooth' });
  };

  return (
    <div className={`relative h-full flex flex-col z-50 transition-all duration-300 bg-sidebar border-r border-sidebar-border ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>

      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 w-6 h-6 border rounded-full flex items-center justify-center shadow-md transition-all z-50 bg-sidebar border-sidebar-border text-sidebar-foreground hover:text-sidebar-primary"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`p-6 pb-4 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}>
        <div className="w-10 h-10 bg-sidebar-accent rounded-xl flex items-center justify-center shrink-0 border border-sidebar-border">
          <Radio className="text-sidebar-primary w-5 h-5" />
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight text-sidebar-accent-foreground">OSMOSIS</h1>
            <p className="text-[11px] text-sidebar-primary font-medium">QoE Observatory</p>
          </div>
        )}
      </div>

      {canScrollLeft && (
        <button onClick={() => scrollBy(-1)} className="flex items-center justify-center py-1 text-sidebar-foreground/40 hover:text-sidebar-primary transition-colors">
          <ChevronLeft size={16} className="rotate-90" />
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'} space-y-6 scrollbar-hide pb-20 pt-4`}
        style={{ scrollBehavior: 'smooth' }}
      >
        {visibleGroups.map((group) => {
          const isOpen = isCollapsed ? true : openGroups[group.label] !== false;
          return (
          <div key={group.label} className="space-y-1">
            {!isCollapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 pb-1 group"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 group-hover:text-sidebar-primary">{group.label}</span>
                <ChevronDown size={12} className={`text-sidebar-foreground/40 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              </button>
            )}
            {isCollapsed && (
              <div className="mx-2 mb-1 h-px bg-sidebar-border/60" />
            )}
            {isOpen && group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center rounded-xl transition-all text-left group relative ${isCollapsed ? 'justify-center p-3 h-12' : 'gap-3 px-3 py-2.5 h-12'} ${
                  activeTab === item.id
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                {activeTab === item.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-sidebar-primary-foreground/60" />
                )}
                <span className={activeTab === item.id ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-primary'}>{item.icon}</span>
                {!isCollapsed && <span className="text-[13px] font-medium tracking-tight">{item.label}</span>}
              </button>
            ))}
          </div>
          );
        })}

      </div>

      {canScrollRight && (
        <button onClick={() => scrollBy(1)} className="flex items-center justify-center py-1 text-sidebar-foreground/40 hover:text-sidebar-primary transition-colors">
          <ChevronLeft size={16} className="-rotate-90" />
        </button>
      )}

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-3'}`}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:bg-sidebar-accent text-sidebar-foreground"
            title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          >
            {theme === 'dark' ? <Moon className="w-4 h-4 text-sidebar-primary" /> : <Sun className="w-4 h-4 text-amber-400" />}
            {!isCollapsed && (
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {theme === 'dark' ? 'Dark Monitor' : 'Light Mode'}
              </span>
            )}
          </button>
        </div>
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
        <button
          onClick={() => { clearSession(); navigate('/login'); }}
          className={`w-full flex items-center transition-all group ${isCollapsed ? 'justify-center' : 'gap-3 px-3 py-2 rounded-xl'} hover:bg-destructive/10 text-sidebar-foreground hover:text-destructive`}
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="text-xs font-semibold">Logout</span>}
        </button>
        {!isCollapsed && (
          <div className="flex items-center gap-2 mt-2 px-3 opacity-50">
            <div className="w-2 h-2 rounded-full bg-sidebar-primary" />
            <span className="text-[10px] font-medium text-sidebar-foreground">v{APP_VERSION} • AEVO NETWORKS</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppSidebar;
