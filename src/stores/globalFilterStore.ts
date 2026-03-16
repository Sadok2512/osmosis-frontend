import { create } from 'zustand';
import { Granularity } from '../components/kpi-monitor/types';
import { ActiveFilter, FilterOp } from '../config/filterDimensions';

interface GlobalFilterState {
  // Date range
  dateFrom: string;
  dateTo: string;
  granularity: Granularity | 'auto';
  setDateRange: (from: string, to: string) => void;
  setGranularity: (g: Granularity | 'auto') => void;

  // Dynamic global filters (chips)
  globalFilters: ActiveFilter[];
  addGlobalFilter: (dimension: string, op?: FilterOp) => void;
  removeGlobalFilter: (id: string) => void;
  updateGlobalFilter: (id: string, updates: Partial<ActiveFilter>) => void;
  setGlobalFilterValues: (id: string, values: string[]) => void;
  clearGlobalFilters: () => void;

  // Cross-filter (from chart click drill-down)
  crossFilter: { dimension: string; value: string } | null;
  setCrossFilter: (cf: { dimension: string; value: string } | null) => void;
}

const today = new Date();
const weekAgo = new Date(today.getTime() - 7 * 86400000);

export const useGlobalFilterStore = create<GlobalFilterState>((set) => ({
  dateFrom: weekAgo.toISOString().slice(0, 10),
  dateTo: today.toISOString().slice(0, 10),
  granularity: 'auto',
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  setGranularity: (g) => set({ granularity: g }),

  globalFilters: [],
  addGlobalFilter: (dimension, op = 'IN') =>
    set((s) => ({
      globalFilters: [...s.globalFilters, { id: crypto.randomUUID(), dimension, op, values: [] }],
    })),
  removeGlobalFilter: (id) =>
    set((s) => ({ globalFilters: s.globalFilters.filter((f) => f.id !== id) })),
  updateGlobalFilter: (id, updates) =>
    set((s) => ({
      globalFilters: s.globalFilters.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),
  setGlobalFilterValues: (id, values) =>
    set((s) => ({
      globalFilters: s.globalFilters.map((f) => (f.id === id ? { ...f, values } : f)),
    })),
  clearGlobalFilters: () => set({ globalFilters: [], crossFilter: null }),

  crossFilter: null,
  setCrossFilter: (cf) => set({ crossFilter: cf }),
}));
