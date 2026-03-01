import { create } from 'zustand';

export interface DashboardTheme {
  backgroundColor: string;
  titleTextColor: string;
}

export interface DashboardSettings {
  name: string;
  description: string;
  visibility: 'private' | 'public';
  technologies: string[];
  theme: DashboardTheme;
}

interface DashboardSettingsState {
  // Per-dashboard settings keyed by dashboard id
  settings: Record<string, DashboardSettings>;
  getSettings: (id: string, fallbackName?: string) => DashboardSettings;
  updateSettings: (id: string, updates: Partial<DashboardSettings>) => void;
  updateTheme: (id: string, theme: Partial<DashboardTheme>) => void;
  resetTheme: (id: string) => void;
}

const DEFAULT_THEME: DashboardTheme = {
  backgroundColor: '',
  titleTextColor: '',
};

const makeDefault = (name?: string): DashboardSettings => ({
  name: name || 'Dashboard 1',
  description: '',
  visibility: 'private',
  technologies: [],
  theme: { ...DEFAULT_THEME },
});

export const useDashboardSettingsStore = create<DashboardSettingsState>((set, get) => ({
  settings: {},

  getSettings: (id, fallbackName) => {
    const s = get().settings[id];
    if (s) return s;
    return makeDefault(fallbackName);
  },

  updateSettings: (id, updates) => set(state => {
    const current = state.settings[id] || makeDefault();
    return { settings: { ...state.settings, [id]: { ...current, ...updates } } };
  }),

  updateTheme: (id, theme) => set(state => {
    const current = state.settings[id] || makeDefault();
    return { settings: { ...state.settings, [id]: { ...current, theme: { ...current.theme, ...theme } } } };
  }),

  resetTheme: (id) => set(state => {
    const current = state.settings[id] || makeDefault();
    return { settings: { ...state.settings, [id]: { ...current, theme: { ...DEFAULT_THEME } } } };
  }),
}));
