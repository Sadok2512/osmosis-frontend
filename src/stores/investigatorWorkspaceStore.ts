import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InvestigationState, DataPoint, WorstElement } from '@/components/investigator/types';

/* ── Default dates ── */
function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

const INITIAL_STATE: InvestigationState = {
  dimension: 'Cell',
  selectedKpis: [],
  graphSlots: [],
  splitBy: 'None',
  ...defaultDateRange(),
  granularity: '1d',
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

export type SaveStatus = 'idle' | 'saved' | 'saving' | 'unsaved';

export interface InvestigatorInstance {
  /** Local tab instance ID (always unique) */
  instanceId: string;
  /** Persisted backend entity ID (null if never saved) */
  investigatorId: string | null;
  name: string;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;

  /* Full isolated state */
  state: InvestigationState;
  activeSlotId: string | null;
  hasLoadedOnce: boolean;

  /* Runtime data (not persisted to localStorage but kept in memory) */
  tsData: DataPoint[];
  worstElements: WorstElement[];
  loading: boolean;
  error: string | null;
}

function createFreshInstance(name = 'Untitled Investigator'): InvestigatorInstance {
  return {
    instanceId: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    investigatorId: null,
    name,
    saveStatus: 'idle',
    lastSavedAt: null,
    hasUnsavedChanges: false,
    state: { ...INITIAL_STATE, ...defaultDateRange() },
    activeSlotId: null,
    hasLoadedOnce: false,
    tsData: [],
    worstElements: [],
    loading: false,
    error: null,
  };
}

interface InvestigatorWorkspaceStore {
  instances: InvestigatorInstance[];
  activeInstanceId: string | null;

  // Selectors
  getActive: () => InvestigatorInstance | null;
  getInstance: (id: string) => InvestigatorInstance | undefined;

  // Tab management
  addNewTab: (name?: string) => string;
  closeTab: (instanceId: string) => void;
  setActiveTab: (instanceId: string) => void;
  renameTab: (instanceId: string, name: string) => void;

  // State mutation for active instance
  updateInstance: (instanceId: string, patch: Partial<InvestigatorInstance>) => void;
  updateInstanceState: (instanceId: string, updater: InvestigationState | ((prev: InvestigationState) => InvestigationState)) => void;

  // Load an investigator into a NEW tab
  loadIntoNewTab: (inv: { id: string; name: string; context: any; updated_at: string }) => string;

  // Duplicate
  duplicateTab: (instanceId: string) => string;
}

export const useInvestigatorWorkspace = create<InvestigatorWorkspaceStore>()(
  persist(
    (set, get) => {
      const initial = createFreshInstance();
      return {
        instances: [initial],
        activeInstanceId: initial.instanceId,

        getActive: () => {
          const s = get();
          return s.instances.find(i => i.instanceId === s.activeInstanceId) || null;
        },

        getInstance: (id) => get().instances.find(i => i.instanceId === id),

        addNewTab: (name?: string) => {
          const inst = createFreshInstance(name);
          set(s => ({
            instances: [...s.instances, inst],
            activeInstanceId: inst.instanceId,
          }));
          return inst.instanceId;
        },

        closeTab: (instanceId: string) => {
          set(s => {
            const remaining = s.instances.filter(i => i.instanceId !== instanceId);
            if (remaining.length === 0) {
              const fresh = createFreshInstance();
              return { instances: [fresh], activeInstanceId: fresh.instanceId };
            }
            let nextActive = s.activeInstanceId;
            if (nextActive === instanceId) {
              const idx = s.instances.findIndex(i => i.instanceId === instanceId);
              const newIdx = Math.min(idx, remaining.length - 1);
              nextActive = remaining[newIdx]?.instanceId || remaining[0]?.instanceId;
            }
            return { instances: remaining, activeInstanceId: nextActive };
          });
        },

        setActiveTab: (instanceId: string) => {
          set({ activeInstanceId: instanceId });
        },

        renameTab: (instanceId: string, name: string) => {
          set(s => ({
            instances: s.instances.map(i =>
              i.instanceId === instanceId ? { ...i, name, hasUnsavedChanges: true } : i
            ),
          }));
        },

        updateInstance: (instanceId, patch) => {
          set(s => ({
            instances: s.instances.map(i =>
              i.instanceId === instanceId ? { ...i, ...patch } : i
            ),
          }));
        },

        updateInstanceState: (instanceId, updater) => {
          set(s => ({
            instances: s.instances.map(i => {
              if (i.instanceId !== instanceId) return i;
              const next = typeof updater === 'function' ? updater(i.state) : updater;
              // Validate activeSlotId
              let slotId = i.activeSlotId;
              if (slotId && !next.graphSlots.find(gs => gs.id === slotId)) {
                slotId = next.graphSlots[0]?.id || null;
              }
              return { ...i, state: next, activeSlotId: slotId, hasUnsavedChanges: true };
            }),
          }));
        },

        loadIntoNewTab: (inv) => {
          const ctx = inv.context as any;
          const inst: InvestigatorInstance = {
            ...createFreshInstance(inv.name),
            investigatorId: inv.id,
            state: ctx?.state || { ...INITIAL_STATE, ...defaultDateRange() },
            activeSlotId: ctx?.activeSlotId || null,
            saveStatus: 'saved',
            lastSavedAt: inv.updated_at,
            hasUnsavedChanges: false,
          };
          set(s => ({
            instances: [...s.instances, inst],
            activeInstanceId: inst.instanceId,
          }));
          return inst.instanceId;
        },

        duplicateTab: (instanceId: string) => {
          const s = get();
          const source = s.instances.find(i => i.instanceId === instanceId);
          if (!source) return s.activeInstanceId || '';
          const dup: InvestigatorInstance = {
            ...source,
            instanceId: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            investigatorId: null,
            name: `${source.name} (copy)`,
            saveStatus: 'idle',
            lastSavedAt: null,
            hasUnsavedChanges: true,
            tsData: [...source.tsData],
            worstElements: [...source.worstElements],
          };
          set(s2 => ({
            instances: [...s2.instances, dup],
            activeInstanceId: dup.instanceId,
          }));
          return dup.instanceId;
        },
      };
    },
    {
      name: 'investigator-workspace-v1',
      version: 1,
      partialize: (s) => ({
        instances: s.instances.map(i => ({
          instanceId: i.instanceId,
          investigatorId: i.investigatorId,
          name: i.name,
          state: i.state,
          activeSlotId: i.activeSlotId,
          hasLoadedOnce: i.hasLoadedOnce,
          saveStatus: i.saveStatus,
          lastSavedAt: i.lastSavedAt,
          hasUnsavedChanges: i.hasUnsavedChanges,
          // Runtime data NOT persisted to localStorage
          tsData: [],
          worstElements: [],
          loading: false,
          error: null,
        })),
        activeInstanceId: s.activeInstanceId,
      }),
    }
  )
);
