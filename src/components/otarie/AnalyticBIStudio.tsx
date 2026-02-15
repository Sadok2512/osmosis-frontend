import React, { useState, useCallback, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus, Save, FolderOpen, Sparkles, LayoutGrid, Type, Map as MapIcon, FileSpreadsheet, FileDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportElementToPDF } from '@/lib/exportUtils';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Filters } from '../../types';
import { ChartConfig, createDefaultChart } from '../bi/biTypes';
import { WidgetItem, MapWidgetConfig, createDefaultMapWidget } from '../bi/dashboardTypes';
import BIChartCard from '../bi/BIChartCard';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import BIMapWidget from '../bi/BIMapWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import AIAssistantPanel from '../bi/AIAssistantPanel';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { CSVDataProvider, CSVUploadButton, CSVDataPanel, useCSVData } from '../bi/CSVDataStore';

const COLS = 12;
const ROW_HEIGHT = 80;

const AnalyticBIStudioInner: React.FC<{ filters: Filters }> = ({ filters }) => {
  const dm = useDashboardManager();
  const { datasets } = useCSVData();
  const widgets = dm.activeTab?.widgets || [];
  const setWidgets = dm.updateActiveWidgets;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [showCSVPanel, setShowCSVPanel] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const handleExportDashboardPDF = async () => {
    if (!dashboardRef.current) return;
    try {
      await exportElementToPDF(dashboardRef.current, dm.activeTab?.name?.replace(/\s+/g, '_') || 'dashboard');
      toast({ title: 'PDF exporté', description: 'Le dashboard a été exporté en PDF.' });
    } catch {
      toast({ title: 'Erreur', description: "Export PDF échoué.", variant: 'destructive' });
    }
  };

  const handleCreateNew = () => {
    setNewDashName('');
    setShowNameDialog(true);
  };

  const confirmCreate = () => {
    if (newDashName.trim()) {
      dm.createNew(newDashName.trim());
      setShowNameDialog(false);
    }
  };

  const handleSave = () => {
    const name = dm.saveCurrent();
    if (name) {
      toast({ title: `Dashboard "${name}" saved`, description: 'Your dashboard has been saved successfully.' });
    }
  };

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const getId = (w: WidgetItem) => w.config.id;

  const layout = widgets.map(w => ({
    i: getId(w),
    x: w.layout.x, y: w.layout.y,
    w: w.layout.w, h: w.layout.h,
    minW: w.kind === 'text' ? 2 : w.kind === 'map' ? 4 : 3,
    minH: w.kind === 'text' ? 1 : w.kind === 'map' ? 3 : 2,
  }));

  const onLayoutChange = (newLayout: any[]) => {
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === getId(w));
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  const getMaxY = () => widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);

  const addChart = () => {
    const id = `chart_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'chart', config: createDefaultChart(id), layout: { x: 0, y: getMaxY(), w: 6, h: 4 } }]);
  };

  const addText = () => {
    const id = `text_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'text', config: createDefaultTextWidget(id), layout: { x: 0, y: getMaxY(), w: 4, h: 2 } }]);
  };

  const addMap = () => {
    const id = `map_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'map', config: createDefaultMapWidget(id), layout: { x: 0, y: getMaxY(), w: 6, h: 5 } }]);
  };

  const duplicateWidget = (id: string) => {
    const source = widgets.find(w => getId(w) === id);
    if (!source) return;
    const newId = `${source.kind}_${Date.now()}`;
    if (source.kind === 'chart') {
      setWidgets(prev => [...prev, {
        kind: 'chart',
        config: { ...source.config, id: newId, title: source.config.title + ' (copy)' },
        layout: { ...source.layout, y: getMaxY() },
      }]);
    } else if (source.kind === 'map') {
      setWidgets(prev => [...prev, {
        kind: 'map',
        config: { ...(source.config as MapWidgetConfig), id: newId, title: (source.config as MapWidgetConfig).title + ' (copy)' },
        layout: { ...source.layout, y: getMaxY() },
      }]);
    } else {
      setWidgets(prev => [...prev, {
        kind: 'text',
        config: { ...(source.config as TextWidgetConfig), id: newId },
        layout: { ...source.layout, y: getMaxY() },
      }]);
    }
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => getId(w) !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateChartConfig = (id: string, config: ChartConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'chart' ? { ...w, config } : w));
  };

  const updateTextConfig = (id: string, config: TextWidgetConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'text' ? { ...w, config } : w));
  };

  const updateMapConfig = (id: string, config: MapWidgetConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'map' ? { ...w, config } : w));
  };

  const editingChart = widgets.find(w => getId(w) === editingId && w.kind === 'chart');
  const chartCount = widgets.filter(w => w.kind === 'chart').length;
  const textCount = widgets.filter(w => w.kind === 'text').length;
  const mapCount = widgets.filter(w => w.kind === 'map').length;

  const widgetCountLabel = [
    `${chartCount} chart(s)`,
    textCount > 0 ? `${textCount} text(s)` : '',
    mapCount > 0 ? `${mapCount} map(s)` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <DashboardTabBar
          tabs={dm.tabs}
          activeId={dm.activeTabId}
          onSelect={dm.setActiveTabId}
          onClose={dm.closeTab}
          onRename={dm.renameTab}
          onCreate={handleCreateNew}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{dm.activeTab?.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-2">{widgetCountLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={addChart} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3 h-3" /> Chart
            </button>
            <button onClick={addMap} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <MapIcon className="w-3 h-3" /> Map
            </button>
            <button onClick={addText} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              <Type className="w-3 h-3" /> Text
            </button>
            <button onClick={handleExportDashboardPDF} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs hover:bg-muted/80">
              <FileDown className="w-3 h-3" /> PDF
            </button>
            <button onClick={handleSave} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs hover:bg-muted/80">
              <Save className="w-3 h-3" /> Save
            </button>
            <button onClick={() => dm.setShowList(!dm.showList)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${dm.showList ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
              <FolderOpen className="w-3 h-3" /> Load
            </button>
            <button onClick={() => { setShowAI(!showAI); setEditingId(null); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${showAI ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
              <Sparkles className="w-3 h-3" /> AI
            </button>
            <CSVUploadButton />
            <button onClick={() => { setShowCSVPanel(!showCSVPanel); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${showCSVPanel ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
              <FileSpreadsheet className="w-3 h-3" /> Data
              {datasets.length > 0 && <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">{datasets.length}</span>}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }} className="flex-1 overflow-auto p-4">
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Click <strong>Chart</strong>, <strong>Map</strong> or <strong>Text</strong> to start</p>
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
              isResizable
              isDraggable
              margin={[12, 12]}
            >
              {widgets.map(w => (
                <div key={getId(w)}>
                  {w.kind === 'chart' ? (
                    <BIChartCard
                      config={w.config as ChartConfig}
                      onEdit={() => { setEditingId(getId(w)); setShowAI(false); }}
                      onDuplicate={() => duplicateWidget(getId(w))}
                      onDelete={() => deleteWidget(getId(w))}
                    />
                  ) : w.kind === 'map' ? (
                    <BIMapWidget
                      config={w.config as MapWidgetConfig}
                      onChange={cfg => updateMapConfig(getId(w), cfg)}
                      onDelete={() => deleteWidget(getId(w))}
                    />
                  ) : (
                    <BITextWidget
                      config={w.config as TextWidgetConfig}
                      onChange={cfg => updateTextConfig(getId(w), cfg)}
                      onDelete={() => deleteWidget(getId(w))}
                    />
                  )}
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      {/* Side panels */}
      {editingChart && editingChart.kind === 'chart' && (
        <ChartConfigPanel
          config={editingChart.config as ChartConfig}
          onChange={cfg => updateChartConfig(getId(editingChart), cfg)}
          onClose={() => setEditingId(null)}
        />
      )}
      {showAI && (
        <AIAssistantPanel
          charts={widgets.filter(w => w.kind === 'chart').map(w => w.config as ChartConfig)}
          onClose={() => setShowAI(false)}
          onApplySuggestion={() => {}}
        />
      )}
      {dm.showList && (
        <DashboardListPanel
          dashboards={dm.savedDashboards}
          openIds={dm.tabs.map(t => t.id)}
          onOpen={dm.openDashboard}
          onDelete={dm.deleteDashboard}
          onCreate={handleCreateNew}
          onClose={() => dm.setShowList(false)}
          onExport={dm.exportDashboard}
          onExportAll={dm.exportAll}
          onImport={dm.importDashboards}
        />
      )}
      {showCSVPanel && (
        <CSVDataPanel onClose={() => setShowCSVPanel(false)} />
      )}
      {/* Name dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[360px] space-y-4">
            <h3 className="text-sm font-semibold text-foreground">New Dashboard</h3>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              placeholder="Dashboard name..."
              value={newDashName}
              onChange={e => setNewDashName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') setShowNameDialog(false); }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNameDialog(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={confirmCreate} disabled={!newDashName.trim()} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AnalyticBIStudio: React.FC<{ filters: Filters }> = ({ filters }) => (
  <AnalyticBIStudioInner filters={filters} />
);

export default AnalyticBIStudio;
