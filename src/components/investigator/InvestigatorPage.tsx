import React, { useState, useEffect } from 'react';
import ControlPanel from './ControlPanel';
import KPIGraphs from './KPIGraphs';
import KPIHistogram from './KPIHistogram';
import KPIBreakdown from './KPIBreakdown';
import WorstElementsTable from './WorstElementsTable';
import { InvestigationState, DataPoint, WorstElement, GraphSlot, GraphConfig, DEFAULT_GRAPH_CONFIG } from './types';
import { fetchTimeSeriesData, fetchWorstElements, fetchKpiDefinitions } from './investigatorApi';
import { KPIS as FALLBACK_KPIS } from './mockData';
import {
  LayoutGrid, AlertTriangle, Activity, Square, Columns2,
  BarChart3, PieChart, LineChart as LineChartIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const createSlot = (index: number, kpiId = ''): GraphSlot => ({
  id: `slot-${Date.now()}-${index}`,
  kpiId,
  name: `Graph ${index}`,
  filters: {},
  startDate: '',
  endDate: '',
  granularity: 'Hourly',
  splitBy: 'None',
});

const INITIAL_STATE: InvestigationState = {
  dimension: 'Cell',
  selectedKpis: [],
  graphSlots: [createSlot(1)],
  splitBy: 'None',
  startDate: new Date().toISOString(),
  endDate: new Date().toISOString(),
  granularity: 'Hourly',
  filters: {},
  topLimit: 10,
  sortBy: '',
  graphLayout: 2,
  activeGraphTab: 'TimeSeries',
};

const InvestigatorPage: React.FC = () => {
  const [state, setState] = useState<InvestigationState>(INITIAL_STATE);
  const [tsData, setTsData] = useState<DataPoint[]>([]);
  const [worstElements, setWorstElements] = useState<WorstElement[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [kpiSelectorSlot, setKpiSelectorSlot] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  // Auto-select first slot if none selected or active was removed
  useEffect(() => {
    if (state.graphSlots.length === 0) {
      setActiveSlotId(null);
    } else if (!activeSlotId || !state.graphSlots.find(s => s.id === activeSlotId)) {
      setActiveSlotId(state.graphSlots[0].id);
    }
  }, [state.graphSlots, activeSlotId]);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const granMap: Record<string, string> = { 'Hourly': '1h', 'Daily': '1d', 'Weekly': '1w' };
      const splitMap: Record<string, string> = { 'None': '', 'Vendor': 'Vendor', 'Technology': 'TECHNO', 'Band': 'BAND', 'DOR': 'DOR', 'DR': 'DOR' };

      const kpiIds = state.graphSlots.map(s => s.kpiId);
      const [ts, worst] = await Promise.all([
        fetchTimeSeriesData(
          kpiIds,
          state.startDate.split('T')[0] || '2026-01-14',
          state.endDate.split('T')[0] || '2026-03-14',
          granMap[state.granularity] || '1h',
          splitMap[state.splitBy] || undefined,
        ),
        fetchWorstElements(
          kpiIds[0] || 'dcr',
          state.topLimit,
          state.endDate.split('T')[0] || undefined,
          state.dimension === 'Cell' ? 'cell' : 'site',
        ),
      ]);
      setTsData(ts);
      setWorstElements(worst);
    } catch (e) {
      console.error('[Investigator] API error, using fallback:', e);
    }
    setIsApplying(false);
  };

  useEffect(() => {
    fetchKpiDefinitions().then(kpis => {
      if (kpis.length > 0) {
        const ids = kpis.slice(0, 2).map(k => k.id);
        setState(prev => ({
          ...prev,
          selectedKpis: ids,
          graphSlots: ids.map((id, i) => createSlot(i + 1, id)),
          startDate: '2026-01-14',
          endDate: '2026-03-14',
        }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { handleApply(); }, []);

  const handleUpdateSlotConfig = (slotId: string, updates: Partial<GraphConfig>) => {
    setState(prev => ({
      ...prev,
      graphSlots: prev.graphSlots.map(s =>
        s.id === slotId ? { ...s, config: { ...(s.config || DEFAULT_GRAPH_CONFIG), ...updates } } : s
      ),
    }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground uppercase tracking-tight">QOEBIT Investigator</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">KPI Investigation & Root Cause Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isApplying && (
            <div className="flex items-center gap-2 text-[10px] text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-full">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              REFRESHING...
            </div>
          )}
          <div className="flex items-center gap-1 bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <ControlPanel
        state={state}
        setState={setState}
        onApply={handleApply}
        externalSelectorSlot={kpiSelectorSlot}
        onExternalSelectorClose={() => setKpiSelectorSlot(null)}
        activeSlotId={activeSlotId}
        onSlotClick={setActiveSlotId}
      />

      {/* Main Content */}
      <main className="flex-1 p-6 space-y-8">
        {/* KPI Graph Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <LayoutGrid className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">KPI Graph Analysis</h2>
                <p className="text-[10px] text-muted-foreground">Visual trend analysis and performance tracking</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Graph type tabs */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { key: 'TimeSeries', icon: LineChartIcon, label: 'Time Series' },
                  { key: 'Histogram', icon: BarChart3, label: 'Histogram' },
                  { key: 'Breakdown', icon: PieChart, label: 'Breakdown' },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setState(prev => ({ ...prev, activeGraphTab: tab.key }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all',
                      state.activeGraphTab === tab.key
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Layout switcher */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { val: 1 as const, icon: Square, title: 'Single' },
                  { val: 2 as const, icon: Columns2, title: 'Dual' },
                  { val: 4 as const, icon: LayoutGrid, title: 'Grid' },
                ]).map(l => (
                  <button
                    key={l.val}
                    onClick={() => setState(prev => ({ ...prev, graphLayout: l.val }))}
                    title={l.title}
                    className={cn(
                      'p-1.5 rounded-md transition-all',
                      state.graphLayout === l.val
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <l.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {state.activeGraphTab === 'TimeSeries' && (
            <KPIGraphs
              graphSlots={state.graphSlots}
              data={tsData}
              layout={state.graphLayout}
              onChangeSlotKpi={(slotId, kpiId) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.map(s => s.id === slotId ? { ...s, kpiId } : s),
              }))}
              onRemoveSlot={(slotId) => setState(prev => ({
                ...prev,
                graphSlots: prev.graphSlots.filter(s => s.id !== slotId),
              }))}
              onAddEmptySlot={() => {
                const newSlot: GraphSlot = { id: `slot-${Date.now()}`, kpiId: '' };
                setState(prev => ({ ...prev, graphSlots: [...prev.graphSlots, newSlot] }));
              }}
              onUpdateSlotConfig={handleUpdateSlotConfig}
              onOpenKpiSelector={(slotId) => setKpiSelectorSlot(slotId)}
              activeSlotId={activeSlotId}
              onSlotClick={setActiveSlotId}
            />
          )}
          {state.activeGraphTab === 'Histogram' && (
            <KPIHistogram selectedKpis={state.graphSlots.map(s => s.kpiId)} layout={state.graphLayout} />
          )}
          {state.activeGraphTab === 'Breakdown' && (
            <KPIBreakdown selectedKpis={state.graphSlots.map(s => s.kpiId)} layout={state.graphLayout} />
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Worst Elements Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border/40 pb-3">
            <div className="p-1.5 bg-destructive/10 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">Worst Elements Analysis</h2>
              <p className="text-[10px] text-muted-foreground">Identify and investigate problematic cells and sites</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <WorstElementsTable
              elements={worstElements}
              limit={state.topLimit}
              onLimitChange={limit => setState(prev => ({ ...prev, topLimit: limit }))}
              onRowClick={id => console.log(`Navigate to ${id}`)}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default InvestigatorPage;
