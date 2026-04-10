import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InvestigationState, DataPoint, WorstElement } from '@/components/investigator/types';

/* ── Dynamic default dates: current month ── */
function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  // Default to last 30 days (past data, not future)
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

const { startDate, endDate } = defaultDateRange();

const INITIAL_STATE: InvestigationState = {
  dimension: 'Cell',
  selectedKpis: [],
  graphSlots: [],
  splitBy: 'None',
  startDate,
  endDate,
  granularity: '1d',  // default daily, user changes via toolbar
  filters: {},
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

/* ── Store interface ── */
interface InvestigatorStore {
  // ── Persisted: query / UI configuration ──
  state: InvestigationState;
  setState: (updater: InvestigationState | ((prev: InvestigationState) => InvestigationState)) => void;
  activeSlotId: string | null;
  setActiveSlotId: (id: string | null) => void;
  hasLoadedOnce: boolean;
  setHasLoadedOnce: (v: boolean) => void;

  // ── Named investigator tracking ──
  currentInvestigatorId: string | null;
  setCurrentInvestigatorId: (id: string | null) => void;
  currentInvestigatorName: string;
  setCurrentInvestigatorName: (name: string) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;

  // ── Runtime only: API results ──
  tsData: DataPoint[];
  setTsData: (d: DataPoint[]) => void;
  worstElements: WorstElement[];
  setWorstElements: (w: WorstElement[]) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;

  // ── Transient UI ──
  kpiSelectorSlot: string | null;
  setKpiSelectorSlot: (id: string | null) => void;

  // ── Helpers ──
  /** Reset investigation config back to defaults (keeps runtime data) */
  resetState: () => void;
  /** Clear fetched result data only */
  clearResults: () => void;
  /** Reset everything: config + results */
  resetAll: () => void;
}

/* ── Validate activeSlotId against current graphSlots ── */
function validateActiveSlot(activeSlotId: string | null, slots: { id: string }[]): string | null {
  if (!activeSlotId) return slots.length > 0 ? slots[0].id : null;
  if (slots.find(s => s.id === activeSlotId)) return activeSlotId;
  return slots.length > 0 ? slots[0].id : null;
}

export const useInvestigatorStore = create<InvestigatorStore>()(
  persist(
    (set, get) => ({
      // ── Persisted config ──
      state: INITIAL_STATE,
      setState: (updater) =>
        set((store) => {
          const next = typeof updater === 'function' ? updater(store.state) : updater;
          return {
            state: next,
            activeSlotId: validateActiveSlot(store.activeSlotId, next.graphSlots),
          };
        }),
      activeSlotId: null,
      setActiveSlotId: (id) =>
        set((store) => ({
          activeSlotId: validateActiveSlot(id, store.state.graphSlots),
        })),
      hasLoadedOnce: false,
      setHasLoadedOnce: (v) => set({ hasLoadedOnce: v }),

      // ── Runtime result data (NOT persisted) ──
      tsData: [],
      setTsData: (d) => set({ tsData: d }),
      worstElements: [],
      setWorstElements: (w) => set({ worstElements: w }),
      loading: false,
      setLoading: (v) => set({ loading: v }),
      error: null,
      setError: (e) => set({ error: e }),

      // ── Transient UI ──
      kpiSelectorSlot: null,
      setKpiSelectorSlot: (id) => set({ kpiSelectorSlot: id }),

      // ── Helpers ──
      resetState: () => {
        const fresh = defaultDateRange();
        set({
          state: { ...INITIAL_STATE, startDate: fresh.startDate, endDate: fresh.endDate },
          activeSlotId: null,
          hasLoadedOnce: false,
        });
      },
      clearResults: () => set({ tsData: [], worstElements: [], loading: false, error: null }),
      resetAll: () => {
        const fresh = defaultDateRange();
        set({
          state: { ...INITIAL_STATE, startDate: fresh.startDate, endDate: fresh.endDate },
          activeSlotId: null,
          hasLoadedOnce: false,
          tsData: [],
          worstElements: [],
          loading: false,
          error: null,
          kpiSelectorSlot: null,
        });
      },
    }),
    {
      name: 'investigator-store',
      version: 7,  // v7: force-clear all stale slots/KPIs/dates
      migrate: (persisted: any, version: number) => {
        if (version < 4 && persisted?.state?.graphSlots) {
          persisted.state.graphSlots = persisted.state.graphSlots.map((s: any) => ({
            ...s,
            config: undefined,
          }));
        }
        if (version < 5 && persisted?.state?.graphSlots) {
          persisted.state.graphSlots = persisted.state.graphSlots.map((s: any) => ({
            ...s,
            splitBy: 'None',
            splitBy2: 'None',
            config: s.config ? { ...s.config, splitByPerKpi: {}, splitByPerKpi2: {} } : s.config,
          }));
        }
        if (version < 7 && persisted?.state) {
          persisted.state.kpiLevel = 'CELL';
          persisted.state.selectedKpis = [];
          persisted.state.graphSlots = [];
          const now = new Date();
          const end = new Date(now);
          const start = new Date(now);
          start.setDate(start.getDate() - 30);
          const fmt = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          persisted.state.startDate = fmt(start);
          persisted.state.endDate = fmt(end);
        }
        return persisted;
      },
      partialize: (s) => ({
        // Only persist config — NOT runtime API data
        state: s.state,
        activeSlotId: s.activeSlotId,
        hasLoadedOnce: s.hasLoadedOnce,
      }),
      // Validate activeSlotId on rehydration
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        const store = rehydrated as InvestigatorStore;
        const valid = validateActiveSlot(store.activeSlotId, store.state.graphSlots);
        if (valid !== store.activeSlotId) {
          store.setActiveSlotId(valid);
        }
      },
    }
  )
);
