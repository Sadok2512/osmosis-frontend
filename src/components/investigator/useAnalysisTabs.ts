import { useState, useCallback } from 'react';

export interface AnalysisTabInstance {
  id: string;
  label: string;
  /** Independent context per tab */
  context: Record<string, any>;
}

export interface AnalysisTabsState {
  instances: AnalysisTabInstance[];
  activeId: string | null;
}

const makeId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function useAnalysisTabs() {
  const [sections, setSections] = useState<Record<string, AnalysisTabsState>>({});

  const getSection = useCallback((sectionKey: string): AnalysisTabsState => {
    return sections[sectionKey] || { instances: [], activeId: null };
  }, [sections]);

  /** Ensure at least one tab exists for a section; returns active id */
  const ensureTab = useCallback((sectionKey: string): string => {
    const s = sections[sectionKey];
    if (s && s.instances.length > 0 && s.activeId) return s.activeId;
    const id = makeId();
    const tab: AnalysisTabInstance = { id, label: 'Onglet 1', context: {} };
    setSections(prev => ({
      ...prev,
      [sectionKey]: { instances: [tab], activeId: id },
    }));
    return id;
  }, [sections]);

  const addTab = useCallback((sectionKey: string) => {
    setSections(prev => {
      const s = prev[sectionKey] || { instances: [], activeId: null };
      const num = s.instances.length + 1;
      const id = makeId();
      const tab: AnalysisTabInstance = { id, label: `Onglet ${num}`, context: {} };
      return { ...prev, [sectionKey]: { instances: [...s.instances, tab], activeId: id } };
    });
  }, []);

  const removeTab = useCallback((sectionKey: string, tabId: string) => {
    setSections(prev => {
      const s = prev[sectionKey];
      if (!s) return prev;
      const remaining = s.instances.filter(t => t.id !== tabId);
      if (remaining.length === 0) return { ...prev, [sectionKey]: { instances: [], activeId: null } };
      const newActive = s.activeId === tabId ? remaining[0].id : s.activeId;
      return { ...prev, [sectionKey]: { instances: remaining, activeId: newActive } };
    });
  }, []);

  const setActiveTab = useCallback((sectionKey: string, tabId: string) => {
    setSections(prev => {
      const s = prev[sectionKey];
      if (!s) return prev;
      return { ...prev, [sectionKey]: { ...s, activeId: tabId } };
    });
  }, []);

  const renameTab = useCallback((sectionKey: string, tabId: string, newLabel: string) => {
    setSections(prev => {
      const s = prev[sectionKey];
      if (!s) return prev;
      return {
        ...prev,
        [sectionKey]: {
          ...s,
          instances: s.instances.map(t => t.id === tabId ? { ...t, label: newLabel } : t),
        },
      };
    });
  }, []);

  const updateTabContext = useCallback((sectionKey: string, tabId: string, ctx: Record<string, any>) => {
    setSections(prev => {
      const s = prev[sectionKey];
      if (!s) return prev;
      return {
        ...prev,
        [sectionKey]: {
          ...s,
          instances: s.instances.map(t =>
            t.id === tabId ? { ...t, context: { ...t.context, ...ctx } } : t
          ),
        },
      };
    });
  }, []);

  return { getSection, ensureTab, addTab, removeTab, setActiveTab, renameTab, updateTabContext };
}
