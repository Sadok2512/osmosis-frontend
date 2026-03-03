import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus, Save, FolderOpen, Sparkles, LayoutGrid, Type, Map as MapIcon, FileSpreadsheet, FileDown, ImageIcon, Eye, Table2, Copy, MoreHorizontal, Globe, Lock, Grid3X3, Move, Settings } from 'lucide-react';
import FreeLayoutCanvas from '../bi/FreeLayoutCanvas';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportElementToPDF, PDFHeaderOptions } from '@/lib/exportUtils';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Filters } from '../../types';
import { ChartConfig, createDefaultChart } from '../bi/biTypes';
import { WidgetItem, MapWidgetConfig, createDefaultMapWidget, LayoutMode } from '../bi/dashboardTypes';
import BIChartCard from '../bi/BIChartCardECharts';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import BIImageWidget, { ImageWidgetConfig, createDefaultImageWidget } from '../bi/BIImageWidget';
import BIMapWidget from '../bi/BIMapWidget';
import BITableWidget, { TableWidgetConfig, createDefaultTableWidget } from '../bi/BITableWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import AIAssistantPanel from '../bi/AIAssistantPanel';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { CSVDataProvider, CSVUploadButton, CSVDataPanel, useCSVData } from '../bi/CSVDataStore';
import DashboardSettingsPopup from '../kpi-monitor/DashboardSettingsPopup';
import { useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';

const COLS = 12;
const ROW_HEIGHT = 80;

/* ── Print Preview Modal ── */
const PrintPreviewModal: React.FC<{
  dashboardName: string;
  logoDataUrl?: string;
  dashboardRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onExport: () => void;
}> = ({ dashboardName, logoDataUrl, dashboardRef, onClose, onExport }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      if (!dashboardRef.current) return;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      if (!cancelled) {
        setPreviewUrl(canvas.toDataURL('image/png'));
        setLoading(false);
      }
    };
    generate();
    return () => { cancelled = true; };
  }, [dashboardRef]);

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[calc(100vw-80px)] max-w-[1200px] h-[calc(100vh-80px)] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Simulated PDF Header */}
        <div className="bg-slate-900 px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {logoDataUrl && (
              <img src={logoDataUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-white/10" />
            )}
            <div>
              <h2 className="text-white font-bold text-lg">{dashboardName}</h2>
              <p className="text-slate-400 text-xs">{dateStr}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-slate-300 text-sm font-semibold">PSN TEAM</span>
          </div>
        </div>
        <div className="h-0.5 bg-blue-500" />

        {/* Preview content */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-slate-500 animate-pulse font-semibold">Génération de l'aperçu...</div>
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Dashboard preview" className="w-full rounded-lg shadow-md" />
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors font-medium">
            Fermer
          </button>
          <button onClick={() => { onExport(); onClose(); }}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
            <FileDown className="w-3.5 h-3.5" /> Exporter PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const AnalyticBIStudioInner: React.FC<{ filters: Filters }> = ({ filters }) => {
  const dm = useDashboardManager();
  const dashSettingsStore = useDashboardSettingsStore();
  const { datasets } = useCSVData();
  const widgets = dm.activeTab?.widgets || [];
  const setWidgets = dm.updateActiveWidgets;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [showCSVPanel, setShowCSVPanel] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [showSettings, setShowSettings] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const handleExportDashboardPDF = async () => {
    if (!dashboardRef.current) return;
    try {
      // Find first image widget to use as logo
      const imageWidget = widgets.find(w => w.kind === 'image');
      const logoDataUrl = imageWidget ? (imageWidget.config as ImageWidgetConfig).src : undefined;

      const headerOptions: PDFHeaderOptions = {
        dashboardName: dm.activeTab?.name || 'Dashboard',
        logoDataUrl: logoDataUrl || undefined,
        userName: 'PSN TEAM',
      };

      await exportElementToPDF(dashboardRef.current, dm.activeTab?.name?.replace(/\s+/g, '_') || 'dashboard', headerOptions);
      toast({ title: 'PDF exporté', description: 'Le dashboard a été exporté en PDF avec header.' });
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

  const handleSave = async () => {
    const name = await dm.saveCurrent();
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

  const getId = (w: WidgetItem) => w?.config?.id ?? 'unknown';

  const validWidgets = widgets.filter(w => w?.config?.id && w?.layout);

  const layout = validWidgets.map(w => ({
    i: getId(w),
    x: w.layout.x, y: w.layout.y,
    w: w.layout.w, h: w.layout.h,
    minW: w.kind === 'text' ? 2 : w.kind === 'map' ? 4 : w.kind === 'image' ? 2 : w.kind === 'table' ? 4 : 3,
    minH: w.kind === 'text' ? 1 : w.kind === 'map' ? 3 : w.kind === 'image' ? 2 : w.kind === 'table' ? 3 : 2,
  }));

  const onLayoutChange = (newLayout: any[]) => {
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === getId(w));
      if (!l) return w;
      return { ...w, layout: { ...w.layout, x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  // Convert grid positions to pixel positions for free mode
  const colWidth = containerWidth / COLS;
  const toFreeRect = (w: WidgetItem) => ({
    id: getId(w),
    x: w.layout.freeX ?? w.layout.x * colWidth,
    y: w.layout.freeY ?? w.layout.y * ROW_HEIGHT,
    w: w.layout.freeW ?? w.layout.w * colWidth,
    h: w.layout.freeH ?? w.layout.h * ROW_HEIGHT,
  });

  const onFreeLayoutChange = useCallback((id: string, rect: Partial<{ x: number; y: number; w: number; h: number }>) => {
    setWidgets(prev => prev.map(w => {
      if (getId(w) !== id) return w;
      const cur = toFreeRect(w);
      return {
        ...w,
        layout: {
          ...w.layout,
          freeX: rect.x ?? cur.x,
          freeY: rect.y ?? cur.y,
          freeW: rect.w ?? cur.w,
          freeH: rect.h ?? cur.h,
        },
      };
    }));
  }, [widgets, colWidth]);

  const toggleLayoutMode = () => {
    if (layoutMode === 'grid') {
      // Convert grid positions to free pixel positions
      setWidgets(prev => prev.map(w => ({
        ...w,
        layout: {
          ...w.layout,
          freeX: w.layout.freeX ?? w.layout.x * colWidth,
          freeY: w.layout.freeY ?? w.layout.y * ROW_HEIGHT,
          freeW: w.layout.freeW ?? w.layout.w * colWidth,
          freeH: w.layout.freeH ?? w.layout.h * ROW_HEIGHT,
        },
      })));
      setLayoutMode('free');
    } else {
      setLayoutMode('grid');
    }
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

  const addImage = () => {
    const id = `image_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'image', config: createDefaultImageWidget(id), layout: { x: 0, y: getMaxY(), w: 3, h: 3 } }]);
  };

  const addTable = () => {
    const id = `table_${Date.now()}`;
    setWidgets(prev => [...prev, { kind: 'table', config: createDefaultTableWidget(id), layout: { x: 0, y: getMaxY(), w: 8, h: 4 } }]);
  };

  const duplicateWidget = (id: string) => {
    const source = widgets.find(w => getId(w) === id);
    if (!source) return;
    const newId = `${source.kind}_${Date.now()}`;
    // Deep clone to preserve all nested settings (thresholds, milestones, metrics, filters, dataSource, etc.)
    const clonedConfig = JSON.parse(JSON.stringify(source.config));
    clonedConfig.id = newId;
    if ('title' in clonedConfig && clonedConfig.title) {
      clonedConfig.title = clonedConfig.title + ' (copy)';
    }
    setWidgets(prev => [...prev, {
      kind: source.kind,
      config: clonedConfig,
      layout: { ...source.layout, y: getMaxY() },
    } as WidgetItem]);
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

  const updateImageConfig = (id: string, config: ImageWidgetConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'image' ? { ...w, config } : w));
  };

  const updateTableConfig = (id: string, config: TableWidgetConfig) => {
    setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'table' ? { ...w, config } : w));
  };

  const editingChart = validWidgets.find(w => getId(w) === editingId && w.kind === 'chart');
  const chartCount = validWidgets.filter(w => w.kind === 'chart').length;
  const textCount = validWidgets.filter(w => w.kind === 'text').length;
  const mapCount = validWidgets.filter(w => w.kind === 'map').length;
  const imageCount = validWidgets.filter(w => w.kind === 'image').length;
  const tableCount = validWidgets.filter(w => w.kind === 'table').length;

  const widgetCountLabel = [
    `${chartCount} chart(s)`,
    textCount > 0 ? `${textCount} text(s)` : '',
    mapCount > 0 ? `${mapCount} map(s)` : '',
    imageCount > 0 ? `${imageCount} image(s)` : '',
    tableCount > 0 ? `${tableCount} table(s)` : '',
  ].filter(Boolean).join(' · ');

  const renderWidget = (w: WidgetItem) => {
    if (w.kind === 'chart') {
      return (
        <BIChartCard
          config={w.config as ChartConfig}
          onEdit={() => { setEditingId(getId(w)); setShowAI(false); }}
          onDuplicate={() => duplicateWidget(getId(w))}
          onDelete={() => deleteWidget(getId(w))}
        />
      );
    }
    if (w.kind === 'map') {
      return (
        <BIMapWidget
          config={w.config as MapWidgetConfig}
          onChange={cfg => updateMapConfig(getId(w), cfg)}
          onDelete={() => deleteWidget(getId(w))}
        />
      );
    }
    if (w.kind === 'image') {
      return (
        <BIImageWidget
          config={w.config as ImageWidgetConfig}
          onChange={cfg => updateImageConfig(getId(w), cfg)}
          onDelete={() => deleteWidget(getId(w))}
        />
      );
    }
    if (w.kind === 'table') {
      return (
        <BITableWidget
          config={w.config as TableWidgetConfig}
          onChange={cfg => updateTableConfig(getId(w), cfg)}
          onDelete={() => deleteWidget(getId(w))}
        />
      );
    }
    return (
      <BITextWidget
        config={w.config as TextWidgetConfig}
        onChange={cfg => updateTextConfig(getId(w), cfg)}
        onDelete={() => deleteWidget(getId(w))}
      />
    );
  };

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
          onSetColor={dm.setTabColor}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-foreground truncate max-w-[300px]">{dm.activeTab?.name}</span>
            </div>
            {/* Description inline edit */}
            <input
              type="text"
              placeholder="Ajouter une description..."
              value={dm.activeTab?.description || ''}
              onChange={e => dm.activeTab && dm.updateDescription(dm.activeTab.id, e.target.value)}
              className="text-[11px] text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none px-1 py-0.5 w-[200px] transition-colors"
            />
            {/* Shared/Private toggle */}
            <button
              onClick={() => dm.activeTab && dm.toggleShared(dm.activeTab.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:bg-muted"
              title={dm.activeTab?.isShared ? 'Cliquez pour rendre privé' : 'Cliquez pour rendre public'}
            >
              {dm.activeTab?.isShared ? (
                <><Globe className="w-3 h-3 text-green-600" /><span className="text-green-600">Public</span></>
              ) : (
                <><Lock className="w-3 h-3 text-orange-600" /><span className="text-orange-600">Privé</span></>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {layoutMode === 'grid' && (<>
              <button onClick={addChart} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" /> Chart
              </button>
              <button onClick={addMap} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
              <button onClick={addText} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                <Type className="w-3.5 h-3.5" /> Text
              </button>
              <button onClick={addImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                <ImageIcon className="w-3.5 h-3.5" /> Image
              </button>
              <button onClick={addTable} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                <Table2 className="w-3.5 h-3.5" /> Table
              </button>
              <div className="w-px h-5 bg-border mx-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                    <MoreHorizontal className="w-3.5 h-3.5" /> Actions
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={handleSave}><Save className="w-3.5 h-3.5 mr-2" /> Save</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}><Settings className="w-3.5 h-3.5 mr-2" /> Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { dm.duplicateDashboard(dm.activeTabId); toast({ title: 'Dashboard dupliqué', description: 'Une copie a été créée.' }); }}><Copy className="w-3.5 h-3.5 mr-2" /> Duplicate</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dm.setShowList(!dm.showList)}><FolderOpen className="w-3.5 h-3.5 mr-2" /> Load</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowPrintPreview(true)}><Eye className="w-3.5 h-3.5 mr-2" /> Preview</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportDashboardPDF}><FileDown className="w-3.5 h-3.5 mr-2" /> Export PDF</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setShowAI(!showAI); setEditingId(null); }}><Sparkles className="w-3.5 h-3.5 mr-2" /> AI Assistant</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setShowCSVPanel(!showCSVPanel); }}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Data {datasets.length > 0 && `(${datasets.length})`}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CSVUploadButton />
              <div className="w-px h-5 bg-border mx-1" />
              </>)}
              {/* Layout mode toggle — always visible */}
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                <button
                  onClick={() => layoutMode !== 'grid' && toggleLayoutMode()}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${layoutMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-card text-muted-foreground'}`}
                  title="Grid Layout"
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => layoutMode !== 'free' && toggleLayoutMode()}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${layoutMode === 'free' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-card text-muted-foreground'}`}
                  title="Free Layout"
                >
                  <Move className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard canvas */}
        <div ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }} className="flex-1 overflow-auto p-4" style={dashSettingsStore.getSettings(dm.activeTabId, dm.activeTab?.name).theme.backgroundColor ? { backgroundColor: dashSettingsStore.getSettings(dm.activeTabId, dm.activeTab?.name).theme.backgroundColor } : undefined}>
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Click <strong>Chart</strong>, <strong>Map</strong> or <strong>Text</strong> to start</p>
            </div>
          ) : layoutMode === 'grid' ? (
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
                  {renderWidget(w)}
                </div>
              ))}
            </GridLayout>
          ) : (
            <FreeLayoutCanvas
              items={widgets.map(toFreeRect)}
              onLayoutChange={onFreeLayoutChange}
            >
              {widgets.map(w => (
                <div key={getId(w)} className="w-full h-full">
                  {renderWidget(w)}
                </div>
              ))}
            </FreeLayoutCanvas>
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
          onDuplicate={dm.duplicateDashboard}
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
      {/* Print Preview Modal */}
      {showPrintPreview && (
        <PrintPreviewModal
          dashboardName={dm.activeTab?.name || 'Dashboard'}
          logoDataUrl={(() => {
            const iw = widgets.find(w => w.kind === 'image');
            return iw ? (iw.config as ImageWidgetConfig).src : undefined;
          })()}
          dashboardRef={dashboardRef}
          onClose={() => setShowPrintPreview(false)}
          onExport={handleExportDashboardPDF}
        />
      )}
      {/* Dashboard Settings Popup */}
      {dm.activeTab && (
        <DashboardSettingsPopup
          open={showSettings}
          onClose={() => setShowSettings(false)}
          dashboardId={dm.activeTabId}
          dashboardName={dm.activeTab.name}
          dashboardDescription={dm.activeTab.description}
          dashboardIsShared={dm.activeTab.isShared}
          onApply={(settings) => {
            dm.renameTab(dm.activeTabId, settings.name);
            dm.updateDescription(dm.activeTabId, settings.description);
            if ((settings.visibility === 'public') !== dm.activeTab!.isShared) {
              dm.toggleShared(dm.activeTabId);
            }
            toast({ title: 'Settings saved', description: `Dashboard "${settings.name}" updated.` });
          }}
        />
      )}
    </div>
  );
};

const AnalyticBIStudio: React.FC<{ filters: Filters }> = ({ filters }) => (
  <AnalyticBIStudioInner filters={filters} />
);

export default AnalyticBIStudio;
