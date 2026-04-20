import { create } from 'zustand';
import type {
  TechnoId,
  PeriodPreset,
  GrainOption,
  ChartFilterChip,
} from '../types';

/**
 * Single source of truth for the Precision Architect REPORT-LEVEL toolbar
 * (top of EditorView). Widgets inherit these values by default; they can
 * still override them locally via the per-widget "Time & Filters" panel.
 */
export interface PAGlobalToolbarState {
  technos: TechnoId[];
  from: string; // ISO YYYY-MM-DDTHH:mm
  to: string;
  preset: PeriodPreset;
  grain: GrainOption;
  filters: ChartFilterChip[];
  /** Bumped each time the user clicks "Appliquer" on the top toolbar. */
  appliedRev: number;
}

interface PAGlobalToolbarStore extends PAGlobalToolbarState {
  setTechnos: (t: TechnoId[]) => void;
  setRange: (from: string, to: string, preset?: PeriodPreset) => void;
  setPreset: (p: PeriodPreset) => void;
  setGrain: (g: GrainOption) => void;
  setFilters: (f: ChartFilterChip[]) => void;
  apply: () => void;
}

const today = new Date();
const threeDaysAgo = new Date(today.getTime() - 3 * 86400000);
const fmt = (d: Date) => d.toISOString().slice(0, 16);

export const usePAGlobalToolbar = create<PAGlobalToolbarStore>((set) => ({
  technos: ['2g', '3g', '4g', '5g'],
  from: fmt(threeDaysAgo),
  to: fmt(today),
  preset: '3j',
  grain: '15min',
  filters: [],
  appliedRev: 0,

  setTechnos: (technos) => set({ technos }),
  setRange: (from, to, preset = 'custom') => set({ from, to, preset }),
  setPreset: (preset) => set({ preset }),
  setGrain: (grain) => set({ grain }),
  setFilters: (filters) => set({ filters }),
  apply: () => set((s) => ({ appliedRev: s.appliedRev + 1 })),
}));

/** Selector helper: returns the toolbar values that get merged into a widget config when inheriting. */
export function selectToolbarSnapshot(s: PAGlobalToolbarState) {
  return {
    technos: s.technos,
    timeRange: { preset: s.preset, from: s.from, to: s.to, inherit: true },
    granularity: s.grain,
    filters: s.filters,
    appliedRev: s.appliedRev,
  };
}
