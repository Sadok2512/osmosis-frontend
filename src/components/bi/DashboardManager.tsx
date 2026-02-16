import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Plus, X, Save, FolderOpen, Trash2, Clock, LayoutDashboard, Download, Upload, Copy } from 'lucide-react';
import { WidgetItem, createDefaultMapWidget } from './dashboardTypes';
import { createDefaultChart } from './biTypes';
import { createDefaultTextWidget } from './BITextWidget';
import { supabase } from '@/integrations/supabase/client';

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

function createDefaultWidgets(): WidgetItem[] {
  return [
    {
      kind: 'text',
      config: createDefaultTextWidget('text_default'),
      layout: { x: 0, y: 0, w: 4, h: 2 },
    },
    {
      kind: 'map',
      config: createDefaultMapWidget('map_default'),
      layout: { x: 4, y: 0, w: 8, h: 5 },
    },
    {
      kind: 'chart',
      config: {
        ...createDefaultChart('chart_1'),
        title: 'QoE Index',
        yMetrics: [{ kpi: 'qoe_index', aggregation: 'AVG', axis: 'left', chartType: 'line', color: 'hsl(210, 100%, 56%)', showMovingAvg: false, smoothCurve: true }],
      },
      layout: { x: 0, y: 5, w: 6, h: 4 },
    },
    {
      kind: 'chart',
      config: {
        ...createDefaultChart('chart_2'),
        title: 'Throughput DL',
        yMetrics: [{ kpi: 'debit_dl', aggregation: 'AVG', axis: 'left', chartType: 'area', color: 'hsl(160, 84%, 39%)', showMovingAvg: false, smoothCurve: true }],
      },
      layout: { x: 6, y: 5, w: 6, h: 4 },
    },
  ];
}

// ── DB helpers ──

async function loadAllDashboardsFromDB(): Promise<SavedDashboard[]> {
  const { data, error } = await supabase
    .from('dashboards')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error || !data) {
    console.error('[DashboardManager] Failed to load dashboards:', error);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    widgets: row.widgets as WidgetItem[],
    updatedAt: row.updated_at,
  }));
}

async function upsertDashboardToDB(db: SavedDashboard) {
  const { error } = await supabase
    .from('dashboards')
    .upsert({
      id: db.id,
      name: db.name,
      widgets: db.widgets as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('[DashboardManager] Failed to save dashboard:', error);
  }
}

async function deleteDashboardFromDB(id: string) {
  const { error } = await supabase
    .from('dashboards')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[DashboardManager] Failed to delete dashboard:', error);
  }
}

export function useDashboardManager() {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [showList, setShowList] = useState(false);
  const [dbDashboards, setDbDashboards] = useState<SavedDashboard[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Initial load from DB
  useEffect(() => {
    loadAllDashboardsFromDB().then(saved => {
      setDbDashboards(saved);
      if (saved.length > 0) {
        const openTabs = saved.map(s => ({ id: s.id, name: s.name, widgets: s.widgets, dirty: false }));
        setTabs(openTabs);
        setActiveTabId(openTabs[0].id);
      } else {
        const id = `db_${Date.now()}`;
        const defaultTab: OpenTab = { id, name: 'Dashboard 1', widgets: createDefaultWidgets(), dirty: true };
        setTabs([defaultTab]);
        setActiveTabId(id);
      }
      setLoaded(true);
    });
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  const savedDashboards = dbDashboards;

  // Auto-save dirty tabs to DB
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const dirtyTabs = tabs.filter(t => t.dirty);
      if (dirtyTabs.length === 0) return;

      // Upsert all dirty tabs in parallel
      await Promise.all(
        dirtyTabs.map(tab =>
          upsertDashboardToDB({ id: tab.id, name: tab.name, widgets: tab.widgets, updatedAt: new Date().toISOString() })
        )
      );

      // Mark tabs clean
      setTabs(prev => prev.map(t => t.dirty ? { ...t, dirty: false } : t));

      // Refresh saved list
      const refreshed = await loadAllDashboardsFromDB();
      setDbDashboards(refreshed);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [tabs, loaded]);

  const updateActiveWidgets = useCallback((updater: (prev: WidgetItem[]) => WidgetItem[]) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, widgets: updater(t.widgets), dirty: true } : t));
  }, [activeTabId]);

  const createNew = useCallback((name?: string) => {
    const id = `db_${Date.now()}`;
    let dashName = name?.trim() || `Dashboard ${tabs.length + 1}`;
    const existingNames = new Set([...dbDashboards.map(d => d.name.toLowerCase()), ...tabs.map(t => t.name.toLowerCase())]);
    if (existingNames.has(dashName.toLowerCase())) {
      let counter = 2;
      const base = dashName;
      while (existingNames.has(`${base} (${counter})`.toLowerCase())) counter++;
      dashName = `${base} (${counter})`;
    }
    const newTab: OpenTab = { id, name: dashName, widgets: createDefaultWidgets(), dirty: true };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setShowList(false);
  }, [tabs.length, dbDashboards]);

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

  const saveCurrent = useCallback(async (): Promise<string | null> => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return null;
    await upsertDashboardToDB({ id: tab.id, name: tab.name, widgets: tab.widgets, updatedAt: new Date().toISOString() });
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dirty: false } : t));
    const refreshed = await loadAllDashboardsFromDB();
    setDbDashboards(refreshed);
    return tab.name;
  }, [tabs, activeTabId]);

  const deleteDashboard = useCallback(async (id: string) => {
    await deleteDashboardFromDB(id);
    const refreshed = await loadAllDashboardsFromDB();
    setDbDashboards(refreshed);
    closeTab(id);
  }, [closeTab]);

  const renameTab = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existingNames = new Set([
      ...dbDashboards.filter(d => d.id !== id).map(d => d.name.toLowerCase()),
      ...tabs.filter(t => t.id !== id).map(t => t.name.toLowerCase()),
    ]);
    if (existingNames.has(trimmed.toLowerCase())) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: trimmed, dirty: true } : t));
  }, [tabs, dbDashboards]);

  const exportDashboard = useCallback((id: string) => {
    const db = dbDashboards.find(d => d.id === id) || tabs.find(t => t.id === id);
    if (!db) return;
    const exportObj = { id: db.id, name: db.name, widgets: db.widgets, updatedAt: 'updatedAt' in db ? (db as any).updatedAt : new Date().toISOString() };
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${db.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dbDashboards, tabs]);

  const exportAll = useCallback(() => {
    if (dbDashboards.length === 0) return;
    const json = JSON.stringify(dbDashboards, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboards_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dbDashboards]);

  const importDashboards = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const items: SavedDashboard[] = Array.isArray(parsed) ? parsed : [parsed];
      const usedNames = new Set(dbDashboards.map(d => d.name.toLowerCase()));

      const imported: OpenTab[] = [];
      for (const item of items) {
        if (!item.id || !item.name || !item.widgets) continue;
        const newId = `db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        let importName = item.name;
        if (usedNames.has(importName.toLowerCase())) {
          let counter = 2;
          while (usedNames.has(`${item.name} (${counter})`.toLowerCase())) counter++;
          importName = `${item.name} (${counter})`;
        }
        usedNames.add(importName.toLowerCase());
        const entry: SavedDashboard = { ...item, id: newId, name: importName, updatedAt: new Date().toISOString() };
        await upsertDashboardToDB(entry);
        imported.push({ id: newId, name: importName, widgets: entry.widgets, dirty: false });
      }

      const refreshed = await loadAllDashboardsFromDB();
      setDbDashboards(refreshed);
      if (imported.length > 0) {
        setTabs(prev => [...prev, ...imported]);
        setActiveTabId(imported[0].id);
      }
    } catch {
      console.error('[DashboardManager] Import failed: invalid JSON');
    }
  }, [dbDashboards]);

  const duplicateDashboard = useCallback(async (id: string) => {
    const source = dbDashboards.find(d => d.id === id);
    if (!source) return;
    const newId = `db_${Date.now()}`;
    const existingNames = new Set([...dbDashboards.map(d => d.name.toLowerCase()), ...tabs.map(t => t.name.toLowerCase())]);
    let dupName = `${source.name} (copy)`;
    if (existingNames.has(dupName.toLowerCase())) {
      let counter = 2;
      while (existingNames.has(`${source.name} (copy ${counter})`.toLowerCase())) counter++;
      dupName = `${source.name} (copy ${counter})`;
    }
    const cloned: SavedDashboard = { id: newId, name: dupName, widgets: JSON.parse(JSON.stringify(source.widgets)), updatedAt: new Date().toISOString() };
    await upsertDashboardToDB(cloned);
    const refreshed = await loadAllDashboardsFromDB();
    setDbDashboards(refreshed);
    setTabs(prev => [...prev, { id: newId, name: dupName, widgets: cloned.widgets, dirty: false }]);
    setActiveTabId(newId);
  }, [tabs, dbDashboards]);

  return {
    tabs, activeTab, activeTabId, setActiveTabId,
    updateActiveWidgets, createNew, openDashboard, closeTab,
    saveCurrent, deleteDashboard, renameTab, duplicateDashboard,
    exportDashboard, exportAll, importDashboards,
    showList, setShowList, savedDashboards, loaded,
  };
}

interface DashboardListProps {
  dashboards: SavedDashboard[];
  openIds: string[];
  onOpen: (db: SavedDashboard) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onImport: (file: File) => void;
}

export const DashboardListPanel: React.FC<DashboardListProps> = ({ dashboards, openIds, onOpen, onDelete, onDuplicate, onCreate, onClose, onExport, onExportAll, onImport }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = '';
  };

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

      {/* Import/Export toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        <button onClick={handleImportClick}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-muted text-foreground text-[10px] font-medium hover:bg-muted/80 transition-colors">
          <Upload className="w-3 h-3" /> Import JSON
        </button>
        <button onClick={onExportAll} disabled={dashboards.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-muted text-foreground text-[10px] font-medium hover:bg-muted/80 transition-colors disabled:opacity-40">
          <Download className="w-3 h-3" /> Export All
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
                onClick={(e) => { e.stopPropagation(); onDuplicate(db.id); }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                title="Duplicate"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onExport(db.id); }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                title="Export JSON"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
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
      <button onClick={onCreate}
        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="New Dashboard"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
