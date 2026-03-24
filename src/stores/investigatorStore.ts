import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InvestigationState, DataPoint, WorstElement } from '@/components/investigator/types';

const INITIAL_STATE: InvestigationState = {
  dimension: 'Cell',
  selectedKpis: [],
  graphSlots: [],
  splitBy: 'None',
  startDate: '2026-01-14',
  endDate: '2026-03-14',
  granularity: 'Hourly',
  filters: {},
  topLimit: 10,
  sortBy: '',
  graphLayout: 2,
  activeGraphTab: 'TimeSeries',
  jalons: [],
};

interface InvestigatorStore {
  state: InvestigationState;
  setState: (updater: InvestigationState | ((prev: InvestigationState) => InvestigationState)) => void;
  tsData: DataPoint[];
  setTsData: (d: DataPoint[]) => void;
  worstElements: WorstElement[];
  setWorstElements: (w: WorstElement[]) => void;
  activeSlotId: string | null;
  setActiveSlotId: (id: string | null) => void;
  kpiSelectorSlot: string | null;
  setKpiSelectorSlot: (id: string | null) => void;
  hasLoadedOnce: boolean;
  setHasLoadedOnce: (v: boolean) => void;
}

export const useInvestigatorStore = create<InvestigatorStore>()(
  persist(
    (set) => ({
      state: INITIAL_STATE,
      setState: (updater) =>
        set((store) => ({
          state: typeof updater === 'function' ? updater(store.state) : updater,
        })),
      tsData: [],
      setTsData: (d) => set({ tsData: d }),
      worstElements: [],
      setWorstElements: (w) => set({ worstElements: w }),
      activeSlotId: null,
      setActiveSlotId: (id) => set({ activeSlotId: id }),
      kpiSelectorSlot: null,
      setKpiSelectorSlot: (id) => set({ kpiSelectorSlot: id }),
      hasLoadedOnce: false,
      setHasLoadedOnce: (v) => set({ hasLoadedOnce: v }),
    }),
    {
      name: 'investigator-store',
      version: 1,
      partialize: (s) => ({
        state: s.state,
        tsData: s.tsData,
        worstElements: s.worstElements,
        activeSlotId: s.activeSlotId,
        hasLoadedOnce: s.hasLoadedOnce,
      }),
    }
  )
);
