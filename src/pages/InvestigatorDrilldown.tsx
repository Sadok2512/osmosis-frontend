import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
    } catch {
      // ignore storage failures
    }
  }

  private reload = () => {
    try {
      window.localStorage.removeItem('investigator-workspace-v1');
    } catch {
      // ignore storage failures
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="text-sm font-bold">Investigator failed to open</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            The local Investigator workspace was reset. Reload to open a clean workspace.
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            Reload Investigator
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
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <InvestigatorRouteBoundary>
        <React.Suspense fallback={
          <div className="flex h-screen items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        }>
          <InvestigatorWorkspace />
        </React.Suspense>
      </InvestigatorRouteBoundary>
    </div>
  );
};

export default InvestigatorDrilldown;
