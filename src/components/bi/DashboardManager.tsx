import React, { useState, useCallback, useMemo } from 'react';
import { Plus, X, Save, FolderOpen, Trash2, Clock, LayoutDashboard } from 'lucide-react';
import { WidgetItem } from './dashboardTypes';
import { createDefaultChart } from './biTypes';

export interface SavedDashboard {
  id: string;
  name: string;
  widgets: WidgetItem[];
  updatedAt: string;
}

export interface OpenTab {
  id: string;
  name: string;
  widgets: WidgetItem[];
  dirty: boolean;
}

const LS_KEY = 'bi_dashboards_v3';

function loadAllDashboards(): SavedDashboard[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveAllDashboards(dashboards: SavedDashboard[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(dashboards));
}

function createDefaultWidgets(): WidgetItem[] {
  return [
    {
      kind: 'chart',
      config: {
        ...createDefaultChart('chart_1'),
        title: 'QoE Index',
        yMetrics: [{ kpi: 'qoe_index', aggregation: 'AVG', axis: 'left', chartType: 'line', color: 'hsl(210, 100%, 56%)', showMovingAvg: false, smoothCurve: true }],
      },
      layout: { x: 0, y: 0, w: 6, h: 4 },
    },
    {
      kind: 'chart',
      config: {
        ...createDefaultChart('chart_2'),
        title: 'Throughput DL',
        yMetrics: [{ kpi: 'debit_dl', aggregation: 'AVG', axis: 'left', chartType: 'area', color: 'hsl(160, 84%, 39%)', showMovingAvg: false, smoothCurve: true }],
      },
      layout: { x: 6, y: 0, w: 6, h: 4 },
    },
  ];
}

export function useDashboardManager() {
  const [tabs, setTabs] = useState<OpenTab[]>(() => {
    const saved = loadAllDashboards();
    if (saved.length > 0) {
      const first = saved[0];
      return [{ id: first.id, name: first.name, widgets: first.widgets, dirty: false }];
    }
    const id = `db_${Date.now()}`;
    return [{ id, name: 'Dashboard 1', widgets: createDefaultWidgets(), dirty: true }];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '');
  const [showList, setShowList] = useState(false);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  const savedDashboards = useMemo(() => loadAllDashboards(), [tabs]); // reload on tab changes

  const updateActiveWidgets = useCallback((updater: (prev: WidgetItem[]) => WidgetItem[]) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, widgets: updater(t.widgets), dirty: true } : t));
  }, [activeTabId]);

  const createNew = useCallback((name?: string) => {
    const id = `db_${Date.now()}`;
    const dashName = name?.trim() || `Dashboard ${tabs.length + 1}`;
    const newTab: OpenTab = { id, name: dashName, widgets: createDefaultWidgets(), dirty: true };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setShowList(false);
  }, [tabs.length]);

  const openDashboard = useCallback((db: SavedDashboard) => {
    const existing = tabs.find(t => t.id === db.id);
    if (existing) {
      setActiveTabId(db.id);
    } else {
      setTabs(prev => [...prev, { id: db.id, name: db.name, widgets: db.widgets, dirty: false }]);
      setActiveTabId(db.id);
    }
    setShowList(false);
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const newId = `db_${Date.now()}`;
        const fallback: OpenTab = { id: newId, name: 'Dashboard 1', widgets: createDefaultWidgets(), dirty: true };
        setActiveTabId(newId);
        return [fallback];
      }
      if (activeTabId === id) setActiveTabId(next[0].id);
      return next;
    });
  }, [activeTabId]);

  const saveCurrent = useCallback((): string | null => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return null;
    const all = loadAllDashboards();
    const idx = all.findIndex(d => d.id === tab.id);
    const entry: SavedDashboard = { id: tab.id, name: tab.name, widgets: tab.widgets, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    saveAllDashboards(all);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dirty: false } : t));
    return tab.name;
  }, [tabs, activeTabId]);

  const deleteDashboard = useCallback((id: string) => {
    const all = loadAllDashboards().filter(d => d.id !== id);
    saveAllDashboards(all);
    closeTab(id);
  }, [closeTab]);

  const renameTab = useCallback((id: string, name: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name, dirty: true } : t));
  }, []);

  return {
    tabs, activeTab, activeTabId, setActiveTabId,
    updateActiveWidgets, createNew, openDashboard, closeTab,
    saveCurrent, deleteDashboard, renameTab,
    showList, setShowList, savedDashboards,
  };
}

interface DashboardListProps {
  dashboards: SavedDashboard[];
  openIds: string[];
  onOpen: (db: SavedDashboard) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export const DashboardListPanel: React.FC<DashboardListProps> = ({ dashboards, openIds, onOpen, onDelete, onCreate, onClose }) => {
  return (
    <div className="w-72 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Dashboards</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dashboards.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No saved dashboards yet</p>
        )}
        {dashboards.map(db => {
          const isOpen = openIds.includes(db.id);
          return (
            <div key={db.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${isOpen ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'}`}
              onClick={() => onOpen(db)}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${isOpen ? 'text-primary' : 'text-foreground'}`}>{db.name}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(db.updatedAt).toLocaleDateString()}
                </p>
              </div>
              {isOpen && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">Open</span>}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(db.id); }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border">
        <button onClick={onCreate}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-3.5 h-3.5" /> New Dashboard
        </button>
      </div>
    </div>
  );
};

interface TabBarProps {
  tabs: OpenTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCreate: () => void;
}

export const DashboardTabBar: React.FC<TabBarProps> = ({ tabs, activeId, onSelect, onClose, onRename, onCreate }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startRename = (tab: OpenTab) => {
    setEditingId(tab.id);
    setEditName(tab.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-muted/30 border-b border-border overflow-x-auto scrollbar-none">
      {tabs.map(tab => (
        <div key={tab.id}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg cursor-pointer text-xs font-medium transition-all shrink-0 max-w-[180px] group ${
            tab.id === activeId
              ? 'bg-card text-foreground border border-b-0 border-border shadow-sm -mb-px'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          }`}
          onClick={() => onSelect(tab.id)}
          onDoubleClick={() => startRename(tab)}
        >
          <LayoutDashboard className="w-3 h-3 shrink-0" />
          {editingId === tab.id ? (
            <input
              className="w-20 bg-transparent border-b border-primary outline-none text-xs"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{tab.name}</span>
          )}
          {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Unsaved" />}
          {tabs.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onCreate}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="New Dashboard"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
