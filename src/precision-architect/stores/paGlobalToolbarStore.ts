import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  /** Vendors selected in Périmètre (e.g. ['Ericsson','Nokia']). Empty = all. */
  vendors: string[];
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
    vendors: string[];
    from: string;
    to: string;
    preset: PeriodPreset;
    grain: GrainOption;
    filters: ChartFilterChip[];
  } | null;
}

interface PAGlobalToolbarStore extends PAGlobalToolbarState {
  setTechnos: (t: TechnoId[]) => void;
  setVendors: (v: string[]) => void;
  setRange: (from: string, to: string, preset?: PeriodPreset) => void;
  setPreset: (p: PeriodPreset) => void;
  setGrain: (g: GrainOption) => void;
  setFilters: (f: ChartFilterChip[]) => void;
  apply: () => void;
}

const today = new Date();
const threeDaysAgo = new Date(today.getTime() - 3 * 86400000);
const fmt = (d: Date) => d.toISOString().slice(0, 16);

export const usePAGlobalToolbar = create<PAGlobalToolbarStore>()(
  persist(
    (set) => ({
      technos: ['2g', '3g', '4g', '5g'],
      vendors: [],
      from: fmt(threeDaysAgo),
      to: fmt(today),
      preset: '3j',
      grain: '15min',
      filters: [],
      appliedRev: 0,
      applied: null,

      setTechnos: (technos) => set({ technos }),
      setVendors: (vendors) => set({ vendors }),
      setRange: (from, to, preset = 'custom') => set({ from, to, preset }),
      setPreset: (preset) => set({ preset }),
      setGrain: (grain) => set({ grain }),
      setFilters: (filters) => set({ filters }),
      apply: () =>
        set((s) => ({
          appliedRev: s.appliedRev + 1,
          applied: {
            technos: s.technos,
            vendors: s.vendors,
            from: s.from,
            to: s.to,
            preset: s.preset,
            grain: s.grain,
            filters: s.filters,
          },
        })),
    }),
    {
      name: 'pa-global-toolbar',
      storage: createJSONStorage(() => localStorage),
      // Persist user selections so filters/period/grain survive reloads
      partialize: (s) => ({
        technos: s.technos,
        vendors: s.vendors,
        from: s.from,
        to: s.to,
        preset: s.preset,
        grain: s.grain,
        filters: s.filters,
        applied: s.applied,
        appliedRev: s.appliedRev,
      }),
    }
  )
);

/** Selector helper: returns the toolbar values that get merged into a widget config when inheriting. */
export function selectToolbarSnapshot(s: PAGlobalToolbarState) {
  const snap = s.applied;
  const baseFilters = snap?.filters ?? s.filters;
  const vendors = snap?.vendors ?? s.vendors;
  // Inject one synthetic Vendor chip per selected vendor so downstream
  // widget logic that consumes `filters` automatically applies the
  // toolbar vendor selection.
  const filters: ChartFilterChip[] = vendors.length > 0
    ? [
        ...baseFilters.filter((f) => (f.dimension || '').toLowerCase() !== 'vendor'),
        ...vendors.map((v) => ({
          id: `pa-toolbar-vendor-${v}`,
          dimension: 'Vendor',
          value: v,
        })),
      ]
    : baseFilters;
  return {
    technos: snap?.technos ?? s.technos,
    vendors,
    timeRange: {
      preset: snap?.preset ?? s.preset,
      from: snap?.from ?? s.from,
      to: snap?.to ?? s.to,
      inherit: true,
    },
    granularity: snap?.grain ?? s.grain,
    filters,
    appliedRev: s.appliedRev,
  };
}
