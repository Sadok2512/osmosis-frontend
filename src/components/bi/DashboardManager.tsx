import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Plus, X, Save, FolderOpen, Trash2, Clock, LayoutDashboard, Download, Upload, Copy, Globe, Lock } from 'lucide-react';
import { WidgetItem, createDefaultMapWidget } from './dashboardTypes';
import { createDefaultChart } from './biTypes';
import { createDefaultTextWidget } from './BITextWidget';
import { supabase } from '@/integrations/supabase/client';

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
    description: row.description || '',
    isShared: row.is_shared ?? true,
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
      description: db.description,
      is_shared: db.isShared,
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
        const openTabs = saved.map(s => ({ id: s.id, name: s.name, description: s.description, isShared: s.isShared, widgets: s.widgets, dirty: false }));
        setTabs(openTabs);
        setActiveTabId(openTabs[0].id);
      } else {
        const id = `db_${Date.now()}`;
        const defaultTab: OpenTab = { id, name: 'Dashboard 1', description: '', isShared: true, widgets: createDefaultWidgets(), dirty: true };
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
          upsertDashboardToDB({ id: tab.id, name: tab.name, description: tab.description, isShared: tab.isShared, widgets: tab.widgets, updatedAt: new Date().toISOString() })
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
                <div className="flex items-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); onDuplicate(db.id); }}
                    className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Duplicate">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onExport(db.id); }}
                    className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Export JSON">
                    <Download className="w-3 h-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(db.id); }}
                    className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" title="Supprimer">
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
  onSetColor?: (id: string, color: string) => void;
}

export const DashboardTabBar: React.FC<TabBarProps> = ({ tabs, activeId, onSelect, onClose, onRename, onCreate, onSetColor }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);

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
    <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/30 border-b border-border overflow-x-auto scrollbar-none">
      {tabs.map(tab => {
        const tabColor = tab.color || '';
        const isActive = tab.id === activeId;
        const colorStyle: React.CSSProperties = tabColor ? {
          borderLeft: `3px solid ${tabColor}`,
          backgroundColor: isActive ? `color-mix(in srgb, ${tabColor} 8%, transparent)` : undefined,
        } : {};

        return (
          <div key={tab.id} className="relative shrink-0">
            <div
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg cursor-pointer text-sm font-medium transition-all max-w-[220px] group ${
                isActive
                  ? 'bg-card text-foreground border border-b-0 border-border shadow-sm -mb-px'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              }`}
              style={colorStyle}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => startRename(tab)}
              onContextMenu={(e) => { e.preventDefault(); setColorPickerId(colorPickerId === tab.id ? null : tab.id); }}
            >
              {tabColor ? (
                <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: tabColor }} />
              ) : (
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              )}
              {editingId === tab.id ? (
                <input
                  className="w-24 bg-transparent border-b border-primary outline-none text-sm"
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
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Color picker popover */}
            {colorPickerId === tab.id && (
              <div
                className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 flex gap-1 flex-wrap w-[148px]"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[10px] text-muted-foreground w-full mb-1">Couleur de l'onglet</p>
                {TAB_COLOR_PALETTE.map((c, i) => (
                  <button
                    key={i}
                    className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 ${
                      (tab.color || '') === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{
                      backgroundColor: c || 'transparent',
                      backgroundImage: !c ? 'linear-gradient(135deg, transparent 45%, hsl(0 72% 51%) 45%, hsl(0 72% 51%) 55%, transparent 55%)' : undefined,
                    }}
                    title={c || 'Aucune couleur'}
                    onClick={() => { onSetColor?.(tab.id, c); setColorPickerId(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button onClick={onCreate}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="New Dashboard"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
