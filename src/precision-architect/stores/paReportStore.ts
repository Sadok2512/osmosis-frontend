import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PAPage, ViewMode } from '../types';
import { dashboardsApi } from '@/lib/localDb';

const PA_DASHBOARD_TYPE = 'precision_architect';

/** Push a single PA dashboard to the global Supabase `dashboards` table so it
 * appears in the central Dashboard list (alongside BI Studio dashboards). */
async function syncDashboardToCloud(d: PADashboard) {
  try {
    const session = JSON.parse(localStorage.getItem('admin_session') || 'null');
    await dashboardsApi.upsert({
      id: d.id,
      name: d.name || d.projectName || 'Untitled Report',
      description: 'Precision Architect report',
      // Wrap PA-specific payload so the BI list can identify and (later) re-open it
      widgets: [
        {
          _type: 'precision_architect_payload',
          projectName: d.projectName,
          pages: d.pages,
          activePageId: d.activePageId,
          updatedAt: d.updatedAt,
          visibility: d.visibility ?? 'private',
        } as any,
      ],
      is_shared: (d.visibility ?? 'private') === 'public',
      dashboard_type: PA_DASHBOARD_TYPE,
      visibility: d.visibility ?? 'private',
      owner_username: session?.username,
    });
  } catch (e) {
    console.error('[paReportStore] Failed to sync dashboard to cloud:', e);
  }
}

async function deleteDashboardFromCloud(id: string) {
  try {
    await dashboardsApi.remove(id);
  } catch (e) {
    console.error('[paReportStore] Failed to remove dashboard from cloud:', e);
  }
}

/**
 * Persists the entire Precision Architect report (project name + pages + widgets)
 * across navigations and page reloads. Without this, leaving and coming back to
 * the page lost all the user's work because state lived only in `useState`.
 *
 * Now supports multiple dashboards (a "report" = one named dashboard with its
 * own pages/widgets/theme). The store keeps a list of dashboards plus the
 * currently active one, and exposes new/save/delete/rename helpers.
 */
export type PADashboardVisibility = 'private' | 'public';

export interface PADashboard {
  id: string;
  name: string;
  projectName: string;
  pages: PAPage[];
  activePageId: string;
  updatedAt: number;
  /** Visibility tag — purely metadata in this offline-first store, surfaced in the dashboard list. */
  visibility?: PADashboardVisibility;
}

interface PAReportState {
  // ---- Active (editable) dashboard view ----
  projectName: string;
  pages: PAPage[];
  activePageId: string;
  viewMode: ViewMode;

  // ---- Multi-dashboard registry ----
  dashboards: PADashboard[];
  activeDashboardId: string;

  /** Bumped each time the user explicitly clicks "Save". Useful for UX feedback. */
  savedRev: number;
  lastSavedAt: number | null;

  setProjectName: (name: string) => void;
  setPages: (updater: PAPage[] | ((prev: PAPage[]) => PAPage[])) => void;
  setActivePageId: (id: string) => void;
  setViewMode: (m: ViewMode) => void;

  markSaved: () => void;
  resetReport: () => void;

  // ---- Dashboard management ----
  newDashboard: (name?: string) => string;
  saveActiveDashboard: () => void;
  deleteDashboard: (id: string) => void;
  switchDashboard: (id: string) => void;
  renameDashboard: (id: string, name: string) => void;
  setDashboardVisibility: (id: string, visibility: PADashboardVisibility) => void;
  /** Pull all PA dashboards from the central Supabase store and merge into local list. */
  loadDashboardsFromCloud: () => Promise<void>;
}

const INITIAL_PAGES: PAPage[] = [
  { id: 'page-1', name: 'Network Health', widgets: [], sections: [] },
];

const DEFAULT_DASHBOARD_NAME = 'Network Health · Q4 Report';

const INITIAL_DASHBOARD: PADashboard = {
  id: 'dashboard-1',
  name: DEFAULT_DASHBOARD_NAME,
  projectName: DEFAULT_DASHBOARD_NAME,
  pages: INITIAL_PAGES,
  activePageId: 'page-1',
  updatedAt: Date.now(),
  visibility: 'private',
};

export const usePAReportStore = create<PAReportState>()(
  persist(
    (set, get) => ({
      projectName: DEFAULT_DASHBOARD_NAME,
      pages: INITIAL_PAGES,
      activePageId: 'page-1',
      viewMode: 'edit',
      savedRev: 0,
      lastSavedAt: null,

      dashboards: [INITIAL_DASHBOARD],
      activeDashboardId: INITIAL_DASHBOARD.id,

      setProjectName: (projectName) => set({ projectName }),
      setPages: (updater) =>
        set((s) => ({
          pages: typeof updater === 'function' ? (updater as any)(s.pages) : updater,
        })),
      setActivePageId: (activePageId) => set({ activePageId }),
      setViewMode: (viewMode) => set({ viewMode }),
      markSaved: () => {
        get().saveActiveDashboard();
        set((s) => ({ savedRev: s.savedRev + 1, lastSavedAt: Date.now() }));
        const fresh = get().dashboards.find((d) => d.id === get().activeDashboardId);
        if (fresh) void syncDashboardToCloud(fresh);
      },
      resetReport: () =>
        set({
          projectName: DEFAULT_DASHBOARD_NAME,
          pages: INITIAL_PAGES,
          activePageId: 'page-1',
          viewMode: 'edit',
        }),

      newDashboard: (name) => {
        get().saveActiveDashboard();

        const id = `dashboard-${Date.now()}`;
        const finalName = (name && name.trim()) || `New Dashboard ${get().dashboards.length + 1}`;
        const firstPageId = `page-${Date.now()}`;
        const fresh: PADashboard = {
          id,
          name: finalName,
          projectName: finalName,
          pages: [{ id: firstPageId, name: 'Page 1', widgets: [], sections: [] }],
          activePageId: firstPageId,
          updatedAt: Date.now(),
          visibility: 'private',
        };
        set((s) => ({
          dashboards: [...s.dashboards, fresh],
          activeDashboardId: id,
          projectName: fresh.projectName,
          pages: fresh.pages,
          activePageId: fresh.activePageId,
        }));
        void syncDashboardToCloud(fresh);
        return id;
      },

      saveActiveDashboard: () =>
        set((s) => {
          const existing = s.dashboards.find((d) => d.id === s.activeDashboardId);
          // The "Save" snapshot must keep `name` (switcher label) and
          // `projectName` (header title) identical, otherwise the switcher
          // and the rendered report can drift apart.
          const snapshot: PADashboard = {
            id: s.activeDashboardId,
            name: s.projectName,
            projectName: s.projectName,
            pages: s.pages,
            activePageId: s.activePageId,
            updatedAt: Date.now(),
            visibility: existing?.visibility ?? 'private',
          };
          const dashboards = existing
            ? s.dashboards.map((d) => (d.id === s.activeDashboardId ? snapshot : d))
            : [...s.dashboards, snapshot];
          return { dashboards };
        }),

      deleteDashboard: (id) => {
        void deleteDashboardFromCloud(id);
        set((s) => {
          const remaining = s.dashboards.filter((d) => d.id !== id);
          if (remaining.length === 0) {
            const firstPageId = `page-${Date.now()}`;
            const fresh: PADashboard = {
              id: `dashboard-${Date.now()}`,
              name: DEFAULT_DASHBOARD_NAME,
              projectName: DEFAULT_DASHBOARD_NAME,
              pages: [{ id: firstPageId, name: 'Page 1', widgets: [], sections: [] }],
              activePageId: firstPageId,
              updatedAt: Date.now(),
            };
            return {
              dashboards: [fresh],
              activeDashboardId: fresh.id,
              projectName: fresh.projectName,
              pages: fresh.pages,
              activePageId: fresh.activePageId,
            };
          }
          if (id === s.activeDashboardId) {
            const next = remaining[0];
            return {
              dashboards: remaining,
              activeDashboardId: next.id,
              projectName: next.projectName,
              pages: next.pages,
              activePageId: next.activePageId,
            };
          }
          return { dashboards: remaining };
        });
      },

      switchDashboard: (id) => {
        get().saveActiveDashboard();
        const target = get().dashboards.find((d) => d.id === id);
        if (!target) return;
        set({
          activeDashboardId: target.id,
          projectName: target.projectName,
          pages: target.pages,
          activePageId: target.activePageId,
        });
      },

      renameDashboard: (id, name) => {
        // Keep `name` (switcher label) and `projectName` (rendered report header)
        // in lockstep so the user never sees two different titles for the same
        // dashboard. Previously only `name` was updated in the registry, so
        // switching away and back restored the stale `projectName`.
        set((s) => ({
          dashboards: s.dashboards.map((d) =>
            d.id === id ? { ...d, name, projectName: name, updatedAt: Date.now() } : d,
          ),
          projectName: id === s.activeDashboardId ? name : s.projectName,
        }));
        const updated = get().dashboards.find((d) => d.id === id);
        if (updated) void syncDashboardToCloud(updated);
      },

      setDashboardVisibility: (id, visibility) => {
        set((s) => ({
          dashboards: s.dashboards.map((d) =>
            d.id === id ? { ...d, visibility, updatedAt: Date.now() } : d,
          ),
        }));
        const updated = get().dashboards.find((d) => d.id === id);
        if (updated) void syncDashboardToCloud(updated);
      },

      loadDashboardsFromCloud: async () => {
        try {
          const rows = await dashboardsApi.list();
          const cloudPa: PADashboard[] = (rows || [])
            .filter((r: any) => r.dashboard_type === PA_DASHBOARD_TYPE)
            .map((r: any) => {
              const payload = Array.isArray(r.widgets)
                ? r.widgets.find((w: any) => w?._type === 'precision_architect_payload')
                : null;
              return {
                id: r.id,
                name: r.name,
                projectName: payload?.projectName || r.name,
                pages: Array.isArray(payload?.pages) && payload.pages.length > 0
                  ? payload.pages
                  : INITIAL_PAGES,
                activePageId: payload?.activePageId || 'page-1',
                updatedAt: payload?.updatedAt || new Date(r.updated_at).getTime() || Date.now(),
                visibility: (r.visibility === 'public' ? 'public' : 'private') as PADashboardVisibility,
              };
            });
          if (cloudPa.length === 0) return;
          set((s) => {
            const byId = new Map<string, PADashboard>();
            for (const d of s.dashboards) byId.set(d.id, d);
            for (const d of cloudPa) byId.set(d.id, d);
            return { dashboards: Array.from(byId.values()) };
          });
        } catch (e) {
          console.warn('[paReportStore] loadDashboardsFromCloud failed:', e);
        }
      },
    }),
    {
      name: 'precision-architect-report',
      version: 2,
      partialize: (s) => ({
        projectName: s.projectName,
        pages: s.pages,
        activePageId: s.activePageId,
        viewMode: s.viewMode,
        savedRev: s.savedRev,
        lastSavedAt: s.lastSavedAt,
        dashboards: s.dashboards,
        activeDashboardId: s.activeDashboardId,
      }),
      // CRITICAL: without a migrate function, zustand DROPS the persisted state
      // when `version` changes — which is why widgets lost their `appliedConfig`
      // and `appliedRev`, causing "Apply to Dashboard" to look broken.
      // We accept any prior shape and let the runtime re-fill missing fields
      // with safe defaults.
      migrate: (persistedState: any, fromVersion: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        // v0/v1 → v2: pages already had the right shape; nothing structural to change.
        // Keep dashboards/activeDashboardId if present, otherwise fall back to defaults.
        const next = { ...persistedState };
        if (!Array.isArray(next.dashboards) || next.dashboards.length === 0) {
          next.dashboards = [INITIAL_DASHBOARD];
        }
        if (!next.activeDashboardId) {
          next.activeDashboardId = next.dashboards[0]?.id ?? INITIAL_DASHBOARD.id;
        }
        if (!Array.isArray(next.pages) || next.pages.length === 0) {
          next.pages = INITIAL_PAGES;
        }
        if (!next.activePageId) {
          next.activePageId = next.pages[0]?.id ?? 'page-1';
        }
        return next;
      },
    },
  ),
);
