import { create } from 'zustand';
import { KpiSelection, DynamicFilter, SplitDimension, KpiMonitorView, GraphType } from '../components/kpi-monitor/types';

interface KpiMonitorState {
  // KPI selections
  selectedKpis: KpiSelection[];
  addKpi: (kpi: KpiSelection) => void;
  removeKpi: (kpiKey: string) => void;
  updateKpi: (kpiKey: string, updates: Partial<KpiSelection>) => void;

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
}

export const useKpiMonitorStore = create<KpiMonitorState>((set) => ({
  selectedKpis: [{ kpi_key: 'rrc_setup_sr', agg: 'avg', axis: 'left' }],
  addKpi: (kpi) => set((s) => ({ selectedKpis: [...s.selectedKpis, kpi] })),
  removeKpi: (key) => set((s) => ({ selectedKpis: s.selectedKpis.filter(k => k.kpi_key !== key) })),
  updateKpi: (key, updates) => set((s) => ({
    selectedKpis: s.selectedKpis.map(k => k.kpi_key === key ? { ...k, ...updates } : k),
  })),

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
}));
