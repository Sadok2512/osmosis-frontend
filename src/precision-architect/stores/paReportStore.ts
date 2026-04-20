import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PAPage, ViewMode } from '../types';

/**
 * Persists the entire Precision Architect report (project name + pages + widgets)
 * across navigations and page reloads. Without this, leaving and coming back to
 * the page lost all the user's work because state lived only in `useState`.
 */
interface PAReportState {
  projectName: string;
  pages: PAPage[];
  activePageId: string;
  viewMode: ViewMode;
  /** Bumped each time the user explicitly clicks "Save". Useful for UX feedback. */
  savedRev: number;
  lastSavedAt: number | null;

  setProjectName: (name: string) => void;
  setPages: (updater: PAPage[] | ((prev: PAPage[]) => PAPage[])) => void;
  setActivePageId: (id: string) => void;
  setViewMode: (m: ViewMode) => void;
  markSaved: () => void;
  resetReport: () => void;
}

const INITIAL_PAGES: PAPage[] = [
  { id: 'page-1', name: 'Network Health', widgets: [], sections: [] },
];

export const usePAReportStore = create<PAReportState>()(
  persist(
    (set) => ({
      projectName: 'Network Health · Q4 Report',
      pages: INITIAL_PAGES,
      activePageId: 'page-1',
      viewMode: 'edit',
      savedRev: 0,
      lastSavedAt: null,

      setProjectName: (projectName) => set({ projectName }),
      setPages: (updater) =>
        set((s) => ({
          pages: typeof updater === 'function' ? (updater as any)(s.pages) : updater,
        })),
      setActivePageId: (activePageId) => set({ activePageId }),
      setViewMode: (viewMode) => set({ viewMode }),
      markSaved: () => set((s) => ({ savedRev: s.savedRev + 1, lastSavedAt: Date.now() })),
      resetReport: () =>
        set({
          projectName: 'Network Health · Q4 Report',
          pages: INITIAL_PAGES,
          activePageId: 'page-1',
          viewMode: 'edit',
        }),
    }),
    {
      name: 'precision-architect-report',
      version: 1,
      partialize: (s) => ({
        projectName: s.projectName,
        pages: s.pages,
        activePageId: s.activePageId,
        viewMode: s.viewMode,
        savedRev: s.savedRev,
        lastSavedAt: s.lastSavedAt,
      }),
    },
  ),
);
