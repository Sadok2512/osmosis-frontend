import { create } from 'zustand';
import { Granularity } from '../components/kpi-monitor/types';

interface GlobalFilterState {
  dateFrom: string;
  dateTo: string;
  granularity: Granularity | 'auto';
  setDateRange: (from: string, to: string) => void;
  setGranularity: (g: Granularity | 'auto') => void;
}

const today = new Date();
const weekAgo = new Date(today.getTime() - 7 * 86400000);

export const useGlobalFilterStore = create<GlobalFilterState>((set) => ({
  dateFrom: weekAgo.toISOString().slice(0, 10),
  dateTo: today.toISOString().slice(0, 10),
  granularity: 'auto',
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  setGranularity: (g) => set({ granularity: g }),
}));
