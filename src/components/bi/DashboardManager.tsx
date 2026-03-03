import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Plus, X, Save, FolderOpen, Trash2, Clock, LayoutDashboard, Download, Upload, Copy, Globe, Lock } from 'lucide-react';
import { WidgetItem, createDefaultMapWidget } from './dashboardTypes';
import { createDefaultChart } from './biTypes';
import { createDefaultTextWidget } from './BITextWidget';
import { dashboardsApi } from '@/lib/localDb';
import { useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';

export interface SavedDashboard {
  id: string;
  name: string;
  description: string;
  isShared: boolean;
  widgets: WidgetItem[];
  updatedAt: string;
}

export const TAB_COLOR_PALETTE = [
  '', // no color (default)
  'hsl(210, 100%, 56%)',  // blue
  'hsl(160, 84%, 39%)',   // green
  'hsl(25, 95%, 53%)',    // orange
  'hsl(262, 83%, 58%)',   // purple
  'hsl(330, 81%, 60%)',   // pink
  'hsl(0, 72%, 51%)',     // red
  'hsl(187, 92%, 39%)',   // teal
  'hsl(45, 93%, 47%)',    // yellow
];

export interface OpenTab {
  id: string;
  name: string;
  description: string;
  isShared: boolean;
  widgets: WidgetItem[];
  dirty: boolean;
  color?: string;
}

function createDefaultWidgets(): WidgetItem[] {
  return [];
}

// ── DB helpers (local API) ──

async function loadAllDashboardsFromDB(): Promise<SavedDashboard[]> {
  try {
    const data = await dashboardsApi.list();
    if (!data || !Array.isArray(data)) return [];
    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isShared: row.is_shared ?? true,
      widgets: row.widgets as WidgetItem[],
      updatedAt: row.updated_at,
    }));
  } catch (e) {
    console.error('[DashboardManager] Failed to load dashboards:', e);
    return [];
  }
}

async function upsertDashboardToDB(db: SavedDashboard) {
  try {
    await dashboardsApi.upsert({
      id: db.id,
      name: db.name,
      description: db.description,
      is_shared: db.isShared,
      widgets: db.widgets,
    });
  } catch (e) {
    console.error('[DashboardManager] Failed to save dashboard:', e);
  }
}

async function deleteDashboardFromDB(id: string) {
  try {
    await dashboardsApi.remove(id);
  } catch (e) {
    console.error('[DashboardManager] Failed to delete dashboard:', e);
  }
}

export function useDashboardManager() {
  const defaultId = 'db_default';
  const [tabs, setTabs] = useState<OpenTab[]>([
    { id: defaultId, name: 'Dashboard 1', description: '', isShared: true, widgets: createDefaultWidgets(), dirty: true }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(defaultId);
  const [showList, setShowList] = useState(false);
  const [dbDashboards, setDbDashboards] = useState<SavedDashboard[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAllDashboardsFromDB().then(saved => {
      setDbDashboards(saved);
      if (saved.length > 0) {
        const openTabs = saved.map(s => ({ id: s.id, name: s.name, description: s.description, isShared: s.isShared, widgets: s.widgets, dirty: false }));
        setTabs(openTabs);
        setActiveTabId(openTabs[0].id);
      }
      // If no saved dashboards, keep the default tab
      setLoaded(true);
    });
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const savedDashboards = dbDashboards;

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const dirtyTabs = tabs.filter(t => t.dirty);
      if (dirtyTabs.length === 0) return;
      await Promise.all(
        dirtyTabs.map(tab =>
          upsertDashboardToDB({ id: tab.id, name: tab.name, description: tab.description, isShared: tab.isShared, widgets: tab.widgets, updatedAt: new Date().toISOString() })
        )
      );
      setTabs(prev => prev.map(t => t.dirty ? { ...t, dirty: false } : t));
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
    const newTab: OpenTab = { id, name: dashName, description: '', isShared: true, widgets: createDefaultWidgets(), dirty: true };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setShowList(false);
  }, [tabs.length, dbDashboards]);

  const openDashboard = useCallback((db: SavedDashboard) => {
    const existing = tabs.find(t => t.id === db.id);
    if (existing) {
      setActiveTabId(db.id);
    } else {
      setTabs(prev => [...prev, { id: db.id, name: db.name, description: db.description, isShared: db.isShared, widgets: db.widgets, dirty: false }]);
      setActiveTabId(db.id);
    }
    setShowList(false);
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const newId = `db_${Date.now()}`;
        const fallback: OpenTab = { id: newId, name: 'Dashboard 1', description: '', isShared: true, widgets: createDefaultWidgets(), dirty: true };
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
    await upsertDashboardToDB({ id: tab.id, name: tab.name, description: tab.description, isShared: tab.isShared, widgets: tab.widgets, updatedAt: new Date().toISOString() });
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
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = `${db.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(urlObj);
  }, [dbDashboards, tabs]);

  const exportAll = useCallback(() => {
    if (dbDashboards.length === 0) return;
    const json = JSON.stringify(dbDashboards, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const urlObj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = `dashboards_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(urlObj);
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
        const entry: SavedDashboard = { ...item, id: newId, name: importName, description: item.description || '', isShared: item.isShared ?? true, updatedAt: new Date().toISOString() };
        await upsertDashboardToDB(entry);
        imported.push({ id: newId, name: importName, description: entry.description, isShared: entry.isShared, widgets: entry.widgets, dirty: false });
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
    const cloned: SavedDashboard = { id: newId, name: dupName, description: source.description, isShared: source.isShared, widgets: JSON.parse(JSON.stringify(source.widgets)), updatedAt: new Date().toISOString() };
    await upsertDashboardToDB(cloned);
    const refreshed = await loadAllDashboardsFromDB();
    setDbDashboards(refreshed);
    setTabs(prev => [...prev, { id: newId, name: dupName, description: cloned.description, isShared: cloned.isShared, widgets: cloned.widgets, dirty: false }]);
    setActiveTabId(newId);
  }, [tabs, dbDashboards]);

  const updateDescription = useCallback((id: string, description: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, description, dirty: true } : t));
  }, []);

  const toggleShared = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, isShared: !t.isShared, dirty: true } : t));
  }, []);

  const setTabColor = useCallback((id: string, color: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, color, dirty: true } : t));
  }, []);

  return {
    tabs, activeTab, activeTabId, setActiveTabId,
    updateActiveWidgets, createNew, openDashboard, closeTab,
    saveCurrent, deleteDashboard, renameTab, duplicateDashboard,
    exportDashboard, exportAll, importDashboards,
    showList, setShowList, savedDashboards, loaded,
    updateDescription, toggleShared, setTabColor,
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
              className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isOpen ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'}`}
              onClick={() => onOpen(db)}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className={`w-4 h-4 shrink-0 ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isOpen ? 'text-primary' : 'text-foreground'}`}>{db.name}</p>
                </div>
                {db.isShared ? (
                  <span className="text-[9px] bg-green-500/15 text-green-600 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5" title="Partagé">
                    <Globe className="w-2.5 h-2.5" /> Public
                  </span>
                ) : (
                  <span className="text-[9px] bg-orange-500/15 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5" title="Privé">
                    <Lock className="w-2.5 h-2.5" /> Privé
                  </span>
                )}
                {isOpen && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">Open</span>}
              </div>
              {db.description && (
                <p className="text-[10px] text-muted-foreground truncate pl-6">{db.description}</p>
              )}
              <div className="flex items-center justify-between pl-6">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(db.updatedAt).toLocaleDateString()}
                </p>
                <div className="flex gap-0.5">
                  <button onClick={e => { e.stopPropagation(); onExport(db.id); }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Export">
                    <Download className="w-3 h-3" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onDuplicate(db.id); }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Dupliquer">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onDelete(db.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Supprimer">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border">
        <button onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nouveau Dashboard
        </button>
      </div>
    </div>
  );
};

// ── Tab Bar ──

interface TabBarProps {
  tabs: OpenTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCreate: () => void;
  onSetColor?: (id: string, color: string) => void;
}

export const DashboardTabBar: React.FC<TabBarProps> = ({ tabs, activeId, onSelect, onClose, onRename, onCreate, onSetColor }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const dashSettings = useDashboardSettingsStore();

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted/30 overflow-x-auto">
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        const settings = dashSettings.getSettings(tab.id, tab.name);
        const titleColor = isActive ? settings.theme.titleTextColor : undefined;
        const tabBg = isActive ? settings.theme.backgroundColor : undefined;
        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-[11px] font-medium cursor-pointer transition-all shrink-0 ${
              isActive
                ? 'bg-card border border-b-0 border-border shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            onClick={() => onSelect(tab.id)}
            style={{
              ...(tab.color ? { borderTopColor: tab.color, borderTopWidth: isActive ? 2 : 0 } : {}),
              ...(isActive && titleColor ? { color: titleColor } : isActive ? { color: 'var(--foreground)' } : {}),
              ...(isActive && tabBg ? { backgroundColor: tabBg } : {}),
            }}
          >
            {tab.color && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tab.color }} />
            )}
            {editingId === tab.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                className="w-24 bg-transparent border-b border-primary outline-none text-[11px]"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="truncate max-w-[120px]"
                onDoubleClick={e => { e.stopPropagation(); startRename(tab.id, tab.name); }}
              >
                {tab.name}
              </span>
            )}
            {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />}
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onClose(tab.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Nouveau dashboard"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
