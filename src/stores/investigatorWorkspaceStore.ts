import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_GRAPH_CONFIG } from '@/components/investigator/types';
import type { AdvancedTimeFrameConfig, InvestigationState, DataPoint, WorstElement, GraphSlot, Granularity } from '@/components/investigator/types';

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
  advancedTimeFrame: { mode: 'NONE' },
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function normalizeFilters(filters: unknown): Record<string, string[]> {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (typeof key === 'string' && isStringArray(value)) {
      result[key] = value;
    }
  }
  return result;
}

function normalizeAdvancedTimeFrame(value: unknown): AdvancedTimeFrameConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { mode: 'NONE' };
  const raw = value as Partial<AdvancedTimeFrameConfig>;
  const mode = raw.mode === 'BUSY_HOURS' || raw.mode === 'CUSTOM_HOURS' ? raw.mode : 'NONE';
  if (mode === 'NONE') {
    return raw.excludeWeekends ? { mode: 'NONE', excludeWeekends: true } : { mode: 'NONE' };
  }
  return {
    mode,
    profileName: typeof raw.profileName === 'string' ? raw.profileName : undefined,
    startHour: typeof raw.startHour === 'string' ? raw.startHour : undefined,
    endHour: typeof raw.endHour === 'string' ? raw.endHour : undefined,
    excludeWeekends: Boolean(raw.excludeWeekends),
  };
}

function normalizeGraphSlot(slot: unknown, index: number, stateDates: { startDate: string; endDate: string; granularity: Granularity }): GraphSlot | null {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null;

  const raw = slot as Partial<GraphSlot>;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : `slot-recovered-${Date.now()}-${index}`;
  const kpiIds = isStringArray(raw.kpiIds) ? raw.kpiIds : typeof raw.kpiId === 'string' ? [raw.kpiId] : [];
  const counterIds = isStringArray(raw.counterIds) ? raw.counterIds : undefined;
  const widgetType = raw.widgetType === 'histogram' || raw.widgetType === 'table' || raw.widgetType === 'timeseries'
    ? raw.widgetType
    : 'timeseries';

  return {
    id,
    kpiIds,
    ...(counterIds ? { counterIds } : {}),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : `Recovered ${index + 1}`,
    widgetType,
    config: {
      ...DEFAULT_GRAPH_CONFIG,
      ...(raw.config && typeof raw.config === 'object' ? raw.config : {}),
    },
    filters: normalizeFilters(raw.filters),
    startDate: typeof raw.startDate === 'string' && raw.startDate.trim() ? raw.startDate : stateDates.startDate,
    endDate: typeof raw.endDate === 'string' && raw.endDate.trim() ? raw.endDate : stateDates.endDate,
    granularity: raw.granularity || stateDates.granularity,
    splitBy: typeof raw.splitBy === 'string' && raw.splitBy.trim() ? raw.splitBy : 'None',
    ...(typeof raw.splitBy2 === 'string' && raw.splitBy2.trim() ? { splitBy2: raw.splitBy2 } : {}),
  };
}

function normalizeInvestigationState(state?: Partial<InvestigationState> | null): InvestigationState {
  const dates = defaultDateRange();
  const startDate = typeof state?.startDate === 'string' && state.startDate.trim() ? state.startDate : dates.startDate;
  const endDate = typeof state?.endDate === 'string' && state.endDate.trim() ? state.endDate : dates.endDate;
  const granularity = state?.granularity || INITIAL_STATE.granularity;
  const graphSlots = Array.isArray(state?.graphSlots)
    ? state.graphSlots
        .map((slot, index) => normalizeGraphSlot(slot, index, { startDate, endDate, granularity }))
        .filter((slot): slot is GraphSlot => Boolean(slot))
    : [];

  return {
    ...INITIAL_STATE,
    ...dates,
    ...(state || {}),
    startDate,
    endDate,
    selectedKpis: isStringArray(state?.selectedKpis) ? state.selectedKpis : [],
    graphSlots,
    filters: normalizeFilters(state?.filters),
    jalons: Array.isArray(state?.jalons) ? state.jalons : [],
    granularity,
    splitBy: typeof state?.splitBy === 'string' && state.splitBy.trim() ? state.splitBy : INITIAL_STATE.splitBy,
    kpiLevel: state?.kpiLevel || INITIAL_STATE.kpiLevel,
    advancedTimeFrame: normalizeAdvancedTimeFrame(state?.advancedTimeFrame),
  };
}

function normalizeInstance(raw: Partial<InvestigatorInstance> | null | undefined): InvestigatorInstance {
  const fresh = createFreshInstance(raw?.name || 'Untitled Investigator');
  const state = normalizeInvestigationState(raw?.state);
  const activeSlotId = raw?.activeSlotId && state.graphSlots.some(slot => slot.id === raw.activeSlotId)
    ? raw.activeSlotId
    : state.graphSlots[0]?.id || null;

  return {
    ...fresh,
    ...raw,
    instanceId: raw?.instanceId || fresh.instanceId,
    investigatorId: raw?.investigatorId ?? null,
    name: raw?.name || fresh.name,
    saveStatus: raw?.saveStatus || 'idle',
    lastSavedAt: raw?.lastSavedAt ?? null,
    hasUnsavedChanges: Boolean(raw?.hasUnsavedChanges),
    state,
    activeSlotId,
    hasLoadedOnce: Boolean(raw?.hasLoadedOnce),
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

  // Recovery
  resetWorkspace: () => void;
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
          // Deep clone state to avoid shared references between tabs
          const clonedState = structuredClone(source.state);
          const dup: InvestigatorInstance = {
            ...source,
            instanceId: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            investigatorId: null,
            name: `${source.name} (copy)`,
            saveStatus: 'idle',
            lastSavedAt: null,
            hasUnsavedChanges: true,
            state: clonedState,
            activeSlotId: source.activeSlotId,
            tsData: [...source.tsData],
            worstElements: [...source.worstElements],
          };
          set(s2 => ({
            instances: [...s2.instances, dup],
            activeInstanceId: dup.instanceId,
          }));
          return dup.instanceId;
        },

        resetWorkspace: () => {
          const fresh = createFreshInstance();
          set({ instances: [fresh], activeInstanceId: fresh.instanceId });
        },
      };
    },
    {
      name: 'investigator-workspace-v1',
      version: 1,
      merge: (persisted, current) => {
        const raw = persisted as Partial<InvestigatorWorkspaceStore> | undefined;
        const instances = Array.isArray(raw?.instances) && raw.instances.length > 0
          ? raw.instances.map(normalizeInstance)
          : current.instances;
        const activeInstanceId = raw?.activeInstanceId && instances.some(i => i.instanceId === raw.activeInstanceId)
          ? raw.activeInstanceId
          : instances[0]?.instanceId || current.activeInstanceId;

        return {
          ...current,
          ...raw,
          instances,
          activeInstanceId,
        };
      },
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
          // Persist last Apply result so charts re-appear when the user
          // navigates away and back (no auto-refetch — pure cache restore).
          tsData: Array.isArray(i.tsData) ? i.tsData : [],
          worstElements: Array.isArray(i.worstElements) ? i.worstElements : [],
          loading: false,
          error: null,
        })),
        activeInstanceId: s.activeInstanceId,
      }),
    }
  )
);
