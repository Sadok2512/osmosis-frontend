import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KpiSelection, DynamicFilter, SplitDimension, KpiMonitorView, GraphType } from '../components/kpi-monitor/types';
import { normalizeKpiSelection, getDefaultSeriesColor } from '../components/kpi-monitor/normalizeConfig';
import type { WidgetLayout } from '../components/bi/dashboardTypes';

export interface Milestone {
  id: string;
  date: string;
  label: string;
  color: string;
  visible?: boolean;
}

interface KpiMonitorState {
  // KPI selections (id-based, backward compat with kpi_key)
  selectedKpis: KpiSelection[];
  addKpi: (kpi: KpiSelection) => void;
  removeKpi: (kpiKeyOrId: string) => void;
  updateKpi: (kpiKeyOrId: string, updates: Partial<KpiSelection>) => void;
  reorderKpis: (kpis: KpiSelection[]) => void;

  // Split
  splitBy: SplitDimension | null;
  setSplitBy: (s: SplitDimension | null) => void;
  topN: number;
  setTopN: (n: number) => void;
  includeOthers: boolean;
  setIncludeOthers: (b: boolean) => void;

  // View
  viewMode: KpiMonitorView;
  setViewMode: (v: KpiMonitorView) => void;

  // Dynamic filters (local to KPI Monitor)
  localFilters: DynamicFilter[];
  addFilter: (f: DynamicFilter) => void;
  removeFilter: (id: string) => void;
  updateFilter: (id: string, updates: Partial<DynamicFilter>) => void;
  clearFilters: () => void;

  // Milestones
  milestones: Milestone[];
  showMilestones: boolean;
  setShowMilestones: (v: boolean) => void;
  addMilestone: (m: Milestone) => void;
  updateMilestone: (id: string, updates: Partial<Milestone>) => void;
  removeMilestone: (id: string) => void;

  // Selected widget (single — legacy)
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;

  // Multi-select
  selectedWidgetIds: string[];
  toggleWidgetSelection: (id: string, additive?: boolean) => void;
  selectAllWidgets: (ids: string[]) => void;
  clearWidgetSelection: () => void;
  setSelectedWidgetIds: (ids: string[]) => void;

  // Active editing widget (only one at a time — Option A)
  activeEditingWidgetId: string | null;
  setActiveEditingWidgetId: (id: string | null) => void;

  // Main KPI chart layout
  mainChartLayout: WidgetLayout | null;
  setMainChartLayout: (layout: WidgetLayout | null) => void;
}

export const useKpiMonitorStore = create<KpiMonitorState>()(
  persist(
    (set) => ({
      selectedKpis: [],
      addKpi: (kpi) => set((s) => {
        const normalized = normalizeKpiSelection(kpi, s.selectedKpis.length);
        return { selectedKpis: [...s.selectedKpis, normalized] };
      }),
      removeKpi: (keyOrId) => set((s) => ({
        selectedKpis: s.selectedKpis.filter(k => k.id !== keyOrId && k.kpi_key !== keyOrId),
      })),
      updateKpi: (keyOrId, updates) => set((s) => ({
        selectedKpis: s.selectedKpis.map(k =>
          (k.id === keyOrId || k.kpi_key === keyOrId) ? { ...k, ...updates } : k
        ),
      })),
      reorderKpis: (kpis) => set({ selectedKpis: kpis }),

      splitBy: null,
      setSplitBy: (s) => set({ splitBy: s }),
      topN: 5,
      setTopN: (n) => set({ topN: n }),
      includeOthers: true,
      setIncludeOthers: (b) => set({ includeOthers: b }),

      viewMode: 'graph',
      setViewMode: (v) => set({ viewMode: v }),

      localFilters: [],
      addFilter: (f) => set((s) => ({ localFilters: [...s.localFilters, f] })),
      removeFilter: (id) => set((s) => ({ localFilters: s.localFilters.filter(f => f.id !== id) })),
      updateFilter: (id, updates) => set((s) => ({
        localFilters: s.localFilters.map(f => f.id === id ? { ...f, ...updates } : f),
      })),
      clearFilters: () => set({ localFilters: [] }),

      milestones: [],
      showMilestones: true,
      setShowMilestones: (v) => set({ showMilestones: v }),
      addMilestone: (m) => set((s) => ({ milestones: [...s.milestones, m] })),
      updateMilestone: (id, updates) => set((s) => ({
        milestones: s.milestones.map(m => m.id === id ? { ...m, ...updates } : m),
      })),
      removeMilestone: (id) => set((s) => ({ milestones: s.milestones.filter(m => m.id !== id) })),

      selectedWidgetId: null,
      setSelectedWidgetId: (id) => set({ selectedWidgetId: id }),

      selectedWidgetIds: [],
      toggleWidgetSelection: (id, additive = false) => set((s) => {
        if (additive) {
          return {
            selectedWidgetIds: s.selectedWidgetIds.includes(id)
              ? s.selectedWidgetIds.filter(x => x !== id)
              : [...s.selectedWidgetIds, id],
            selectedWidgetId: id,
          };
        }
        return { selectedWidgetIds: [id], selectedWidgetId: id };
      }),
      selectAllWidgets: (ids) => set({ selectedWidgetIds: ids, selectedWidgetId: ids[0] || null }),
      clearWidgetSelection: () => set({ selectedWidgetIds: [], selectedWidgetId: null }),
      setSelectedWidgetIds: (ids) => set({ selectedWidgetIds: ids }),

      activeEditingWidgetId: null,
      setActiveEditingWidgetId: (id) => set({ activeEditingWidgetId: id }),

      mainChartLayout: null,
      setMainChartLayout: (layout) => set({ mainChartLayout: layout }),
    }),
    {
      name: 'kpi-monitor-store',
      partialize: (state) => ({
        selectedKpis: state.selectedKpis,
        splitBy: state.splitBy,
        topN: state.topN,
        includeOthers: state.includeOthers,
        viewMode: state.viewMode,
        localFilters: state.localFilters,
        milestones: state.milestones,
        showMilestones: state.showMilestones,
        mainChartLayout: state.mainChartLayout,
      }),
    }
  )
);
