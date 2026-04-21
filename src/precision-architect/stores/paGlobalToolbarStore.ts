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
  /** Snapshot of toolbar values frozen at the last Apply click.
   *  Widgets that inherit MUST read this snapshot — never the live values —
   *  so that editing the toolbar (period, grain, filters) does NOT trigger
   *  any backend refetch until the user explicitly clicks Apply. */
  applied: {
    technos: TechnoId[];
    from: string;
    to: string;
    preset: PeriodPreset;
    grain: GrainOption;
    filters: ChartFilterChip[];
  } | null;
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
  applied: null,

  setTechnos: (technos) => set({ technos }),
  setRange: (from, to, preset = 'custom') => set({ from, to, preset }),
  setPreset: (preset) => set({ preset }),
  setGrain: (grain) => set({ grain }),
  setFilters: (filters) => set({ filters }),
  apply: () =>
    set((s) => ({
      appliedRev: s.appliedRev + 1,
      applied: {
        technos: s.technos,
        from: s.from,
        to: s.to,
        preset: s.preset,
        grain: s.grain,
        filters: s.filters,
      },
    })),
}));

/** Selector helper: returns the toolbar values that get merged into a widget config when inheriting. */
export function selectToolbarSnapshot(s: PAGlobalToolbarState) {
  const snap = s.applied;
  return {
    technos: snap?.technos ?? s.technos,
    timeRange: {
      preset: snap?.preset ?? s.preset,
      from: snap?.from ?? s.from,
      to: snap?.to ?? s.to,
      inherit: true,
    },
    granularity: snap?.grain ?? s.grain,
    filters: snap?.filters ?? s.filters,
    appliedRev: s.appliedRev,
  };
}
