import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { Plus, BarChart3, Save, FileDown, Sparkles, Pencil, EyeIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

import { useKpiCatalog, useDateRange } from './api/kpiMonitorApi';
import { buildCatalogMap } from './kpiCatalog';
import { KpiCatalogEntry } from './types';
import { KpiWidgetItem, KpiWidgetConfig, createEmptyKpiWidget, duplicateKpiWidget } from './KpiWidgetTypes';
import KpiWidgetCard from './KpiWidgetCard';
import AIFloatingModal from './AIFloatingModal';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { exportElementToPDF } from '@/lib/exportUtils';

const COLS = 12;
const ROW_HEIGHT = 80;

const KPIMonitorPage: React.FC = () => {
  const queryClient = useQueryClient();
  const dm = useDashboardManager();

  // KPI catalog from backend
  const { data: backendCatalog } = useKpiCatalog();
  const catalog: KpiCatalogEntry[] = useMemo(() => {
    if (!backendCatalog || backendCatalog.length === 0) return [];
    return backendCatalog.map((e: any): KpiCatalogEntry => ({
      kpi_id: e.kpi_key, kpi_key: e.kpi_key, display_name: e.display_name,
      description: e.description || '', techno_scope: 'both', unit: e.unit || '',
      value_type: (e.value_type as any) || 'gauge', default_agg: 'avg',
      allowed_aggs: ['avg', 'min', 'max', 'sum'], is_map_supported: false,
      thresholds: e.threshold_warning != null ? { warning: e.threshold_warning, critical: e.threshold_critical ?? e.threshold_warning * 0.8 } : undefined,
      category: e.category || 'Other', color: '#3b82f6',
      vendor: e.vendor || '', techno: e.techno || '',
      supported_levels: e.supported_levels || [], is_normalized: !!e.is_normalized,
    }));
  }, [backendCatalog]);
  const catalogMap = useMemo(() => buildCatalogMap(catalog), [catalog]);

  // Sync date range from backend
  const { data: dateRange } = useDateRange();

  // Widget state
  const [widgets, setWidgets] = useState<KpiWidgetItem[]>([]);
  const [editMode, setEditMode] = useState(true);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  
  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Sync date range into new widgets
  const getDefaultDates = useCallback(() => {
    if (dateRange?.min_date && dateRange?.max_date) {
      return {
        dateFrom: dateRange.min_date.replace(/[T ].*/, ''),
        dateTo: dateRange.max_date.replace(/[T ].*/, ''),
      };
    }
    const now = new Date();
    return {
      dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
    };
  }, [dateRange]);

  // Container width tracking
  const containerNodeRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNodeRef.current = node;
    if (node) setContainerWidth(node.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    const node = containerNodeRef.current;
    if (!node) return;
    let rafId: number;
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
    });
    ro.observe(node);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  // Widget CRUD
  const addWidget = useCallback(() => {
    const idx = widgets.length + 1;
    const newWidget = createEmptyKpiWidget(idx);
    const defaults = getDefaultDates();
    newWidget.config.dateFrom = defaults.dateFrom;
    newWidget.config.dateTo = defaults.dateTo;
    // Position below existing widgets
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    newWidget.layout.y = maxY;
    setWidgets(prev => [...prev, newWidget]);
    setSelectedWidgetId(newWidget.config.id);
  }, [widgets, getDefaultDates]);

  const deleteWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.config.id !== id));
    if (selectedWidgetId === id) setSelectedWidgetId(null);
    if (configuringWidgetId === id) setConfiguringWidgetId(null);
  }, [selectedWidgetId, configuringWidgetId]);

  const duplicateWidget = useCallback((id: string) => {
    const source = widgets.find(w => w.config.id === id);
    if (!source) return;
    const dup = duplicateKpiWidget(source);
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    dup.layout.y = maxY;
    setWidgets(prev => [...prev, dup]);
  }, [widgets]);

  const updateWidgetConfig = useCallback((id: string, updates: Partial<KpiWidgetConfig>) => {
    setWidgets(prev => prev.map(w =>
      w.config.id === id ? { ...w, config: { ...w.config, ...updates } } : w
    ));
  }, []);

  // Layout
  const layout = useMemo(() => widgets.map(w => ({
    i: w.config.id,
    x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
    minW: 4, minH: 4,
  })), [widgets]);

  const onLayoutChange = useCallback((newLayout: any[]) => {
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === w.config.id);
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  }, []);

  // Dashboard management
  const handleCreateNew = () => { setNewDashName(''); setShowNameDialog(true); };
  const confirmCreate = () => {
    if (newDashName.trim()) {
      setWidgets([]);
      setSelectedWidgetId(null);
      setConfiguringWidgetId(null);
      dm.createNew(newDashName.trim());
      setShowNameDialog(false);
    }
  };

  const handleSave = async () => {
    const name = await dm.saveCurrent();
    if (name) toast({ title: `Dashboard "${name}" sauvegardé` });
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    try {
      await exportElementToPDF(dashboardRef.current, dm.activeTab?.name?.replace(/\s+/g, '_') || 'kpi_monitor');
      toast({ title: 'PDF exporté' });
    } catch {
      toast({ title: 'Erreur export', variant: 'destructive' });
    }
  };

  const configuringWidget = configuringWidgetId ? widgets.find(w => w.config.id === configuringWidgetId) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Tab Bar */}
      <DashboardTabBar
        tabs={dm.tabs}
        activeId={dm.activeTabId}
        onSelect={dm.setActiveTabId}
        onClose={dm.closeTab}
        onRename={dm.renameTab}
        onCreate={handleCreateNew}
        onSetColor={dm.setTabColor}
      />

      {/* Top Bar */}
      <div className="sticky top-0 z-40 mx-3 mt-2 mb-1 rounded-xl border border-border/40 bg-card/95 backdrop-blur-md shadow-[0_2px_12px_hsl(var(--foreground)/0.04)]">
        <div className="flex items-center gap-3 px-5 py-2.5">
          {/* Left: Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <BarChart3 className="w-4.5 h-4.5 text-primary" />
            <h1 className="text-base font-bold text-foreground truncate max-w-[280px]">
              {dm.activeTab?.name || 'KPI Monitor'}
            </h1>
          </div>

          <div className="flex-1" />

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button onClick={addWidget}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus className="w-4 h-4" /> Ajouter Widget
            </button>

            <div className="w-px h-6 bg-border/50" />

            <button onClick={() => setEditMode(!editMode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                editMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {editMode ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><EyeIcon className="w-3.5 h-3.5" /> View</>}
            </button>

            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>

            <button onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>

            <button onClick={() => setShowAI(!showAI)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
                showAI ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> AI
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Canvas */}
      <div
        ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }}
        className="flex-1 overflow-auto p-4"
      >
        {widgets.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
            <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-12 h-12 text-primary/50" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-foreground">Dashboard vide</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Ajoutez des widgets indépendants pour monitorer vos KPIs. Chaque widget a ses propres dates, filtres et KPIs.
              </p>
            </div>
            <button onClick={addWidget}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
            >
              <Plus className="w-5 h-5" /> Créer un Widget
            </button>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={containerWidth}
            onLayoutChange={onLayoutChange}
            draggableHandle=".drag-handle"
            compactType="vertical"
            isResizable={editMode}
            isDraggable={editMode}
            margin={[16, 16]}
          >
            {widgets.map(w => (
              <div key={w.config.id}
                className={cn(
                  "transition-all duration-200 rounded-xl",
                  selectedWidgetId === w.config.id && "ring-2 ring-primary shadow-lg shadow-primary/10"
                )}
              >
                <KpiWidgetCard
                  config={w.config}
                  catalog={catalog}
                  catalogMap={catalogMap}
                  isSelected={selectedWidgetId === w.config.id}
                  editMode={editMode}
                  onSelect={() => setSelectedWidgetId(w.config.id)}
                  onDuplicate={() => duplicateWidget(w.config.id)}
                  onDelete={() => deleteWidget(w.config.id)}
                  onUpdateConfig={(updates) => updateWidgetConfig(w.config.id, updates)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Config panel removed - inline config is now inside each widget */}

      {/* AI Modal */}
      <AIFloatingModal open={showAI} onClose={() => setShowAI(false)} />

      {/* Dashboard List */}
      {dm.showList && (
        <DashboardListPanel
          dashboards={dm.savedDashboards}
          openIds={dm.tabs.map(t => t.id)}
          onOpen={dm.openDashboard}
          onDelete={dm.deleteDashboard}
          onDuplicate={dm.duplicateDashboard}
          onCreate={handleCreateNew}
          onClose={() => dm.setShowList(false)}
          onExport={dm.exportDashboard}
          onExportAll={dm.exportAll}
          onImport={dm.importDashboards}
        />
      )}

      {/* New Dashboard Dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[360px] space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Nouveau Dashboard</h3>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Nom du dashboard..."
              value={newDashName}
              onChange={e => setNewDashName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') setShowNameDialog(false); }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNameDialog(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
              <button onClick={confirmCreate} disabled={!newDashName.trim()} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KPIMonitorPage;
