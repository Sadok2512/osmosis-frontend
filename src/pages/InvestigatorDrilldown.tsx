import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, Layout, Globe, Sliders, Radar, ShieldCheck, Radio,
  Search, BarChart2, BookOpen, Database, Wand2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useInvestigatorWorkspace } from '@/stores/investigatorWorkspaceStore';
import type { InvestigationState, Granularity } from '@/components/investigator/types';
import { normalizeGranularity } from '@/components/investigator/types';

const InvestigatorWorkspace = React.lazy(() => import('@/components/investigator/InvestigatorPage'));

class InvestigatorRouteBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[InvestigatorRoute] render failed', error);
    try {
      window.localStorage.removeItem('investigator-workspace-v1');
      useInvestigatorWorkspace.getState().resetWorkspace();
    } catch {
      // ignore storage failures
    }
  }

  private reset = () => {
    try {
      window.localStorage.removeItem('investigator-workspace-v1');
      useInvestigatorWorkspace.getState().resetWorkspace();
    } catch {
      // ignore storage failures
    }
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="text-sm font-bold">Investigator failed to open</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            The local Investigator workspace was reset. Retry to open a clean workspace.
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

function defaultDateRange() {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

/**
 * Standalone page mounted at /investigator?cell=...&kpis=...
 * Reads URL query params, creates a prefilled workspace instance, and auto-triggers apply.
 */
const InvestigatorDrilldown: React.FC = () => {
  const [searchParams] = useSearchParams();
  const ws = useInvestigatorWorkspace();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const cell = searchParams.get('cell');
    const exportKey = searchParams.get('exportKey');
    const kpisRaw = searchParams.get('kpis');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const grain = searchParams.get('grain');
    const site = searchParams.get('site');
    const vendor = searchParams.get('vendor');
    const technology = searchParams.get('technology');
    const dor = searchParams.get('dor');
    const plaque = searchParams.get('plaque');
    const band = searchParams.get('band');

    if (exportKey) {
      try {
        const raw = window.localStorage.getItem(exportKey);
        if (raw) {
          window.localStorage.removeItem(exportKey);
          const payload = JSON.parse(raw) as {
            state?: InvestigationState;
            activeSlotId?: string | null;
          };
          if (payload.state) {
            const newId = ws.addNewTab('Export: Investigator');
            ws.updateInstanceState(newId, payload.state);
            ws.updateInstance(newId, {
              activeSlotId: payload.activeSlotId || payload.state.graphSlots?.[0]?.id || null,
              hasLoadedOnce: false,
              hasUnsavedChanges: false,
            });
            return;
          }
        }
      } catch (err) {
        console.error('[InvestigatorDrilldown] export hydrate failed', err);
      }
    }

    if (!cell) return;

    const kpis = kpisRaw ? kpisRaw.split(',').filter(Boolean) : [];
    const dates = defaultDateRange();

    // Build filters
    const filters: Record<string, string[]> = {};
    filters['Cell'] = [cell];
    if (site) filters['Site'] = [site];
    if (vendor) filters['Vendor'] = [vendor];
    if (technology) filters['Technologie'] = [technology];
    if (dor) filters['DOR'] = [dor];
    if (plaque) filters['Plaque'] = [plaque];
    if (band) filters['Band'] = [band];

    // Also parse generic filter params (filter_KEY=val1,val2)
    searchParams.forEach((val, key) => {
      if (key.startsWith('filter_')) {
        const dim = key.replace('filter_', '');
        filters[dim] = val.split(',').filter(Boolean);
      }
    });

    const granularity: Granularity = grain ? normalizeGranularity(grain) : '1d';

    // Create a graph slot with the KPIs
    const slotId = `slot-drill-${Date.now()}`;
    const graphSlots = kpis.length > 0 ? [{
      id: slotId,
      kpiIds: kpis,
      name: `Drill: ${cell}`,
      widgetType: 'timeseries' as const,
      config: {
        chartType: 'line' as const,
        smooth: true,
        lineWidth: 2.5,
        showSymbols: true,
        showThresholds: true,
        showAverage: false,
        showGrid: true,
        showArea: false,
        showDataTable: true,
        showBreakdown: false,
        showTopWorst: false,
        showAlarms: false,
        showNeighbors: false,
        showCmHistory: false,
      },
      filters: {},
      startDate: startDate || dates.startDate,
      endDate: endDate || dates.endDate,
      granularity,
      splitBy: 'None' as const,
    }] : [];

    const state: InvestigationState = {
      dimension: 'Cell',
      selectedKpis: kpis,
      graphSlots,
      splitBy: 'None',
      startDate: startDate || dates.startDate,
      endDate: endDate || dates.endDate,
      granularity,
      filters,
      topLimit: 10,
      sortBy: null,
      graphLayout: 2,
      activeGraphTab: 'TimeSeries',
      jalons: [],
      kpiLevel: 'CELL',
      profileQci: null,
      profileArp: null,
      neighborType: null,
    };

    // Close all existing instances and create one prefilled
    // We use loadIntoNewTab pattern but manually create the instance
    const instanceId = `inv-drill-${Date.now()}`;
    ws.updateInstance?.(instanceId, {}); // no-op, just to be safe

    // Add a new fresh instance then immediately update it with our state
    const newId = ws.addNewTab(`Drill: ${cell}`);
    ws.updateInstanceState(newId, state);
    ws.updateInstance(newId, {
      activeSlotId: slotId,
      hasLoadedOnce: false,
      hasUnsavedChanges: false,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden">
      <DrilldownSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <InvestigatorRouteBoundary>
          <React.Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          }>
            <InvestigatorWorkspace />
          </React.Suspense>
        </InvestigatorRouteBoundary>
      </div>
    </div>
  );
};

const DRILL_NAV: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'ai_assistant', label: 'OSMOSIS', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'dashboard_overview', label: 'Dashboard Overview', icon: <Layout className="w-5 h-5" /> },
  { id: 'list', label: 'Live Monitor Map', icon: <Globe className="w-5 h-5" /> },
  { id: 'parameters', label: 'Network Explorer', icon: <Sliders className="w-5 h-5" /> },
  { id: 'odcc', label: 'ODCC', icon: <Radar className="w-5 h-5" /> },
  { id: 'detector', label: 'Detector Console', icon: <ShieldCheck className="w-5 h-5" /> },
  { id: 'sentinel', label: 'ML Detector', icon: <Radio className="w-5 h-5" /> },
  { id: 'investigator', label: 'Investigator', icon: <Search className="w-5 h-5" /> },
  { id: 'ran_query', label: 'Rapport Builder', icon: <BarChart2 className="w-5 h-5" /> },
  { id: 'docs', label: 'Network References', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'backend_admin', label: 'Backend Admin', icon: <Database className="w-5 h-5" /> },
  { id: 'precision_architect', label: 'NetVision', icon: <Wand2 className="w-5 h-5" /> },
];

const DrilldownSidebar: React.FC = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const activeId = 'investigator';

  const go = (id: string) => {
    if (id === 'investigator') return; // already here
    navigate(`/?tab=${id}`);
  };

  return (
    <div className={`relative h-full flex flex-col z-50 transition-all duration-300 bg-sidebar border-r border-sidebar-border ${collapsed ? 'w-[70px]' : 'w-[240px]'}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-10 w-6 h-6 border rounded-full flex items-center justify-center shadow-md transition-all z-50 bg-sidebar border-sidebar-border text-sidebar-foreground hover:text-sidebar-primary"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`p-6 pb-4 flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3'}`}>
        <div className="w-10 h-10 bg-sidebar-accent rounded-xl flex items-center justify-center shrink-0 border border-sidebar-border">
          <Radio className="text-sidebar-primary w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight text-sidebar-accent-foreground">OSMOSIS</h1>
            <p className="text-[11px] text-sidebar-primary font-medium">Investigator</p>
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'} pb-6 pt-2 space-y-1 scrollbar-hide`}>
        {DRILL_NAV.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`w-full flex items-center rounded-xl transition-all text-left group relative ${collapsed ? 'justify-center p-3 h-12' : 'gap-3 px-3 py-2.5 h-12'} ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className={isActive ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-primary'}>{item.icon}</span>
              {!collapsed && <span className="text-[13px] font-medium tracking-tight">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InvestigatorDrilldown;
