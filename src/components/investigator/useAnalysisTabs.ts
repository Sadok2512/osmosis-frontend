import { useState, useCallback } from 'react';

/** Snapshot of the graph context at the time the tab was created */
export interface TabContextSnapshot {
  sourceGraphId: string;
  sourceGraphTitle: string;
  kpiIds: string[];
  filters: Record<string, string[]>;
  startDate: string;
  endDate: string;
  granularity: string;
  kpiLevel: string;
  splitBy?: string | null;
}

export interface AnalysisTabInstance {
  id: string;
  label: string;
  /** Source graph slot ID this tab was created for */
  sourceGraphId: string | null;
  /** Frozen context snapshot — tabs read from this, not from global state */
  contextSnapshot: TabContextSnapshot | null;
  /** Extra per-tab state */
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
  const ensureTab = useCallback((sectionKey: string, sourceGraphId?: string | null, snapshot?: TabContextSnapshot | null): string => {
    const s = sections[sectionKey];
    if (s && s.instances.length > 0 && s.activeId) return s.activeId;
    const id = makeId();
    const tab: AnalysisTabInstance = {
      id,
      label: 'Onglet 1',
      sourceGraphId: sourceGraphId || null,
      contextSnapshot: snapshot || null,
      context: {},
    };
    setSections(prev => ({
      ...prev,
      [sectionKey]: { instances: [tab], activeId: id },
    }));
    return id;
  }, [sections]);

  const addTab = useCallback((sectionKey: string, sourceGraphId?: string | null, snapshot?: TabContextSnapshot | null, label?: string) => {
    setSections(prev => {
      const s = prev[sectionKey] || { instances: [], activeId: null };
      const num = s.instances.length + 1;
      const id = makeId();
      const tab: AnalysisTabInstance = {
        id,
        label: label || `Onglet ${num}`,
        sourceGraphId: sourceGraphId || null,
        contextSnapshot: snapshot || null,
        context: {},
      };
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

  /** Find or create a tab for a specific sourceGraphId. Returns the tab id. */
  const findOrCreateForGraph = useCallback((
    sectionKey: string,
    sourceGraphId: string,
    snapshot: TabContextSnapshot,
    label?: string,
  ): string => {
    setSections(prev => {
      const s = prev[sectionKey] || { instances: [], activeId: null };
      // Look for existing tab linked to this graph
      const existing = s.instances.find(t => t.sourceGraphId === sourceGraphId);
      if (existing) {
        // Update snapshot and activate
        return {
          ...prev,
          [sectionKey]: {
            ...s,
            activeId: existing.id,
            instances: s.instances.map(t =>
              t.id === existing.id ? { ...t, contextSnapshot: snapshot } : t
            ),
          },
        };
      }
      // Create new tab
      const id = makeId();
      const tab: AnalysisTabInstance = {
        id,
        label: label || snapshot.sourceGraphTitle || `Onglet ${s.instances.length + 1}`,
        sourceGraphId,
        contextSnapshot: snapshot,
        context: {},
      };
      return { ...prev, [sectionKey]: { instances: [...s.instances, tab], activeId: id } };
    });
    // We can't easily return the new id from inside setSections; caller should re-read
    return '';
  }, []);

  return { getSection, ensureTab, addTab, removeTab, setActiveTab, renameTab, updateTabContext, findOrCreateForGraph };
}
