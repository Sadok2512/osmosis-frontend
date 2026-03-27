import { create } from 'zustand';

interface SiteSummaryCache {
  site_id: string;
  site_name: string;
  coordinates: [number, number];
  cell_count: number;
  technos: string[];
  bandes: string[];
  vendors: string[];
  constructeur?: string;
  plaque?: string;
  dor?: string;
  region?: string;
  zone_arcep?: string;
  cells?: any[];
}

interface ViewportCache {
  bounds: any;
  zoom: number;
}

interface MapSitesState {
  // Cached sites data
  cachedSites: SiteSummaryCache[];
  cachedTotal: number;
  cachedViewport: ViewportCache | null;
  cachedFilters: Record<string, string> | null;
  cachedAt: number | null;

  // Active dashboard
  cachedDashboardId: string | null;
  cachedDashboardActive: boolean;

  // Map position
  cachedCenter: [number, number] | null;
  cachedZoom: number | null;

  // Actions
  setSitesCache: (sites: SiteSummaryCache[], total: number, viewport: ViewportCache | null, filters: Record<string, string> | null) => void;
  setDashboardCache: (id: string | null, active: boolean) => void;
  setMapPosition: (center: [number, number], zoom: number) => void;
  clearCache: () => void;
  isCacheValid: () => boolean;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useMapSitesStore = create<MapSitesState>((set, get) => ({
  cachedSites: [],
  cachedTotal: 0,
  cachedViewport: null,
  cachedFilters: null,
  cachedAt: null,
  cachedDashboardId: null,
  cachedDashboardActive: false,
  cachedCenter: null,
  cachedZoom: null,

  setSitesCache: (sites, total, viewport, filters) => set({
    cachedSites: sites,
    cachedTotal: total,
    cachedViewport: viewport,
    cachedFilters: filters,
    cachedAt: Date.now(),
  }),

  setDashboardCache: (id, active) => set({
    cachedDashboardId: id,
    cachedDashboardActive: active,
  }),

  setMapPosition: (center, zoom) => set({
    cachedCenter: center,
    cachedZoom: zoom,
  }),

  clearCache: () => set({
    cachedSites: [],
    cachedTotal: 0,
    cachedViewport: null,
    cachedFilters: null,
    cachedAt: null,
    cachedDashboardId: null,
    cachedDashboardActive: false,
    cachedCenter: null,
    cachedZoom: null,
  }),

  isCacheValid: (dashboardId?: string | null) => {
    const { cachedAt, cachedDashboardId } = get();
    if (!cachedAt) return false;
    if (dashboardId !== undefined && dashboardId !== cachedDashboardId) return false;
    return (Date.now() - cachedAt) < CACHE_TTL;
  },
}));
