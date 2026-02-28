import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';
import { KPI_CATALOG_STATIC, fetchKpiCatalogFromDB, buildCatalogMap } from './kpiCatalog';
import { KpiCatalogEntry, SplitDimension } from './types';
import { generateMockTimeSeries, generateMockSummary } from './mockKpiData';
import EChartsTimeSeries from './EChartsTimeSeries';
import KPITableView from './KPITableView';
import KPICatalogImport from './KPICatalogImport';
import KpiSelectorModal from './KpiSelectorModal';
import FreeLayoutCanvas from '../bi/FreeLayoutCanvas';
import { ChartConfig, createDefaultChart } from '../bi/biTypes';
import { WidgetItem, MapWidgetConfig, createDefaultMapWidget, LayoutMode } from '../bi/dashboardTypes';
import BIChartCardECharts from '../bi/BIChartCardECharts';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import BIImageWidget, { ImageWidgetConfig, createDefaultImageWidget } from '../bi/BIImageWidget';
import BIMapWidget from '../bi/BIMapWidget';
import BITableWidget, { TableWidgetConfig, createDefaultTableWidget } from '../bi/BITableWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { CSVDataProvider, CSVUploadButton, CSVDataPanel, useCSVData } from '../bi/CSVDataStore';
import { exportElementToPDF, PDFHeaderOptions } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';
import DashboardTopBar from './DashboardTopBar';
import DashboardConfigPanel from './DashboardConfigPanel';
import AIFloatingModal from './AIFloatingModal';
import {
  LayoutGrid, FileDown, Plus,
} from 'lucide-react';

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
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
      if (!cancelled) { setPreviewUrl(canvas.toDataURL('image/png')); setLoading(false); }
    };
    generate();
    return () => { cancelled = true; };
  }, [dashboardRef]);

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-[calc(100vw-80px)] max-w-[1200px] h-[calc(100vh-80px)] flex flex-col rounded-2xl bg-card shadow-2xl overflow-hidden">
        <div className="bg-sidebar-background px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {logoDataUrl && <img src={logoDataUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-muted/10" />}
            <div>
              <h2 className="text-sidebar-foreground font-bold text-lg">{dashboardName}</h2>
              <p className="text-muted-foreground text-xs">{dateStr}</p>
            </div>
          </div>
          <div className="text-right"><span className="text-sidebar-foreground text-sm font-semibold">PSN TEAM</span></div>
        </div>
        <div className="h-0.5 bg-primary" />
        <div className="flex-1 overflow-auto bg-muted p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full"><div className="text-sm text-muted-foreground animate-pulse font-semibold">Génération de l'aperçu...</div></div>
          ) : previewUrl ? <img src={previewUrl} alt="Dashboard preview" className="w-full rounded-lg shadow-md" /> : null}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-border bg-card shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors font-medium">Fermer</button>
          <button onClick={() => { onExport(); onClose(); }} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
            <FileDown className="w-3.5 h-3.5" /> Exporter PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const KPIMonitorInner: React.FC = () => {
  const store = useKpiMonitorStore();
  const globalFilter = useGlobalFilterStore();
  const dm = useDashboardManager();
  const { datasets } = useCSVData();
  const widgets = dm.activeTab?.widgets || [];
  const setWidgets = dm.updateActiveWidgets;

  // KPI catalog
  const [catalog, setCatalog] = useState<KpiCatalogEntry[]>(KPI_CATALOG_STATIC);
  const [catalogMap, setCatalogMap] = useState(buildCatalogMap(KPI_CATALOG_STATIC));
  const [catalogSource, setCatalogSource] = useState<'static' | 'db'>('static');

  // BI state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [showCSVPanel, setShowCSVPanel] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [showKpiSelector, setShowKpiSelector] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchKpiCatalogFromDB().then(entries => {
      setCatalog(entries);
      setCatalogMap(buildCatalogMap(entries));
      setCatalogSource(entries.length > KPI_CATALOG_STATIC.length ? 'db' : 'static');
    });
  }, []);

  const queryRequest = useMemo(() => ({
    date_from: globalFilter.dateFrom,
    date_to: globalFilter.dateTo,
    granularity: globalFilter.granularity,
    kpis: store.selectedKpis,
    filters: [
      ...store.localFilters,
      ...globalFilter.globalFilters.filter(f => f.values.length > 0).map(f => ({
        id: f.id, dimension: f.dimension, op: f.op, values: f.values,
      })),
      ...(globalFilter.crossFilter ? [{ id: 'cross', dimension: globalFilter.crossFilter.dimension, op: 'EQ' as const, values: [globalFilter.crossFilter.value] }] : []),
    ],
    split_by: store.splitBy,
    top_n: store.topN,
    include_others: store.includeOthers,
  }), [globalFilter.dateFrom, globalFilter.dateTo, globalFilter.granularity, globalFilter.globalFilters, globalFilter.crossFilter, store.selectedKpis, store.localFilters, store.splitBy, store.topN, store.includeOthers]);

  const tsResponse = useMemo(() => generateMockTimeSeries(queryRequest), [queryRequest]);
  const summaryRows = useMemo(() => generateMockSummary(queryRequest), [queryRequest]);

  const refreshCatalog = async () => {
    const entries = await fetchKpiCatalogFromDB();
    setCatalog(entries);
    setCatalogMap(buildCatalogMap(entries));
    setCatalogSource(entries.length > KPI_CATALOG_STATIC.length ? 'db' : 'static');
  };

  // BI helpers
  const handleExportDashboardPDF = async () => {
    if (!dashboardRef.current) return;
    try {
      const imageWidget = widgets.find(w => w.kind === 'image');
      const logoDataUrl = imageWidget ? (imageWidget.config as ImageWidgetConfig).src : undefined;
      const headerOptions: PDFHeaderOptions = {
        dashboardName: dm.activeTab?.name || 'KPI Monitor',
        logoDataUrl: logoDataUrl || undefined,
        userName: 'PSN TEAM',
      };
      await exportElementToPDF(dashboardRef.current, dm.activeTab?.name?.replace(/\s+/g, '_') || 'kpi_monitor', headerOptions);
      toast({ title: 'PDF exporté', description: 'Le dashboard a été exporté en PDF avec header.' });
    } catch {
      toast({ title: 'Erreur', description: "Export PDF échoué.", variant: 'destructive' });
    }
  };

  const handleCreateNew = () => { setNewDashName(''); setShowNameDialog(true); };
  const confirmCreate = () => { if (newDashName.trim()) { dm.createNew(newDashName.trim()); setShowNameDialog(false); } };

  const handleSave = async () => {
    const name = await dm.saveCurrent();
    if (name) toast({ title: `Dashboard "${name}" saved`, description: 'Sauvegardé avec succès.' });
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
    x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
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
      return { ...w, layout: { ...w.layout, freeX: rect.x ?? cur.x, freeY: rect.y ?? cur.y, freeW: rect.w ?? cur.w, freeH: rect.h ?? cur.h } };
    }));
  }, [widgets, colWidth]);

  const toggleLayoutMode = () => {
    if (layoutMode === 'grid') {
      setWidgets(prev => prev.map(w => ({
        ...w,
        layout: { ...w.layout, freeX: w.layout.freeX ?? w.layout.x * colWidth, freeY: w.layout.freeY ?? w.layout.y * ROW_HEIGHT, freeW: w.layout.freeW ?? w.layout.w * colWidth, freeH: w.layout.freeH ?? w.layout.h * ROW_HEIGHT },
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
    const clonedConfig = JSON.parse(JSON.stringify(source.config));
    clonedConfig.id = newId;
    if ('title' in clonedConfig && clonedConfig.title) clonedConfig.title += ' (copy)';
    setWidgets(prev => [...prev, { kind: source.kind, config: clonedConfig, layout: { ...source.layout, y: getMaxY() } } as WidgetItem]);
  };

  const deleteWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => getId(w) !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateChartConfig = (id: string, config: ChartConfig) => setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'chart' ? { ...w, config } : w));
  const updateTextConfig = (id: string, config: TextWidgetConfig) => setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'text' ? { ...w, config } : w));
  const updateMapConfig = (id: string, config: MapWidgetConfig) => setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'map' ? { ...w, config } : w));
  const updateImageConfig = (id: string, config: ImageWidgetConfig) => setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'image' ? { ...w, config } : w));
  const updateTableConfig = (id: string, config: TableWidgetConfig) => setWidgets(prev => prev.map(w => getId(w) === id && w.kind === 'table' ? { ...w, config } : w));

  const editingChart = validWidgets.find(w => getId(w) === editingId && w.kind === 'chart');

  const renderWidget = (w: WidgetItem) => {
    if (w.kind === 'chart') return <BIChartCardECharts config={w.config as ChartConfig} onEdit={() => { setEditingId(getId(w)); setShowAI(false); }} onDuplicate={() => duplicateWidget(getId(w))} onDelete={() => deleteWidget(getId(w))} />;
    if (w.kind === 'map') return <BIMapWidget config={w.config as MapWidgetConfig} onChange={cfg => updateMapConfig(getId(w), cfg)} onDelete={() => deleteWidget(getId(w))} />;
    if (w.kind === 'image') return <BIImageWidget config={w.config as ImageWidgetConfig} onChange={cfg => updateImageConfig(getId(w), cfg)} onDelete={() => deleteWidget(getId(w))} />;
    if (w.kind === 'table') return <BITableWidget config={w.config as TableWidgetConfig} onChange={cfg => updateTableConfig(getId(w), cfg)} onDelete={() => deleteWidget(getId(w))} />;
    return <BITextWidget config={w.config as TextWidgetConfig} onChange={cfg => updateTextConfig(getId(w), cfg)} onDelete={() => deleteWidget(getId(w))} />;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* ── Tab Bar ── */}
      <DashboardTabBar
        tabs={dm.tabs}
        activeId={dm.activeTabId}
        onSelect={dm.setActiveTabId}
        onClose={dm.closeTab}
        onRename={dm.renameTab}
        onCreate={handleCreateNew}
        onSetColor={dm.setTabColor}
      />

      {/* ── Sticky Top Bar (full-width) ── */}
      <DashboardTopBar
        dm={dm}
        onSave={handleSave}
        onExportPDF={handleExportDashboardPDF}
        onShowPrintPreview={() => setShowPrintPreview(true)}
        onToggleAI={() => { setShowAI(!showAI); setEditingId(null); }}
        showAI={showAI}
        onToggleCSV={() => setShowCSVPanel(!showCSVPanel)}
        csvCount={datasets.length}
        onAddChart={addChart}
        onAddMap={addMap}
        onAddText={addText}
        onAddImage={addImage}
        onAddTable={addTable}
        layoutMode={layoutMode}
        onToggleLayout={toggleLayoutMode}
        onCreateNew={handleCreateNew}
      />

      {/* ── Horizontal Config Panel ── */}
      <DashboardConfigPanel
        catalogMap={catalogMap}
        onOpenKpiSelector={() => setShowKpiSelector(true)}
        seriesInfo={{
          total: tsResponse.total_series,
          granularity: tsResponse.granularity_used,
          truncated: tsResponse.truncated,
        }}
        catalog={catalog}
        catalogSource={catalogSource}
        onRefreshCatalog={refreshCatalog}
      />

      {/* ── Dashboard Canvas (full-width) ── */}
      <div ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }} className="flex-1 overflow-auto p-4">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Cliquez <strong>Chart</strong>, <strong>Map</strong> ou <strong>Text</strong> pour commencer</p>
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
              <div key={getId(w)}>{renderWidget(w)}</div>
            ))}
          </GridLayout>
        ) : (
          <FreeLayoutCanvas items={widgets.map(toFreeRect)} onLayoutChange={onFreeLayoutChange}>
            {widgets.map(w => (
              <div key={getId(w)} className="w-full h-full">{renderWidget(w)}</div>
            ))}
          </FreeLayoutCanvas>
        )}
      </div>

      {/* ── Side panels (chart config, dashboard list, CSV) ── */}
      {editingChart && editingChart.kind === 'chart' && (
        <ChartConfigPanel config={editingChart.config as ChartConfig} onChange={cfg => updateChartConfig(getId(editingChart), cfg)} onClose={() => setEditingId(null)} />
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
      {showCSVPanel && <CSVDataPanel onClose={() => setShowCSVPanel(false)} />}

      {/* ── AI Floating Modal ── */}
      <AIFloatingModal open={showAI} onClose={() => setShowAI(false)} />

      {/* ── KPI Selector Modal ── */}
      <KpiSelectorModal
        open={showKpiSelector}
        onClose={() => setShowKpiSelector(false)}
        catalog={catalog}
        selectedKeys={store.selectedKpis.map(k => k.kpi_key)}
        onConfirm={(keys) => {
          const currentKeys = store.selectedKpis.map(k => k.kpi_key);
          for (const k of currentKeys) {
            if (!keys.includes(k)) store.removeKpi(k);
          }
          for (const k of keys) {
            if (!currentKeys.includes(k)) {
              const cat = catalogMap[k];
              store.addKpi({ kpi_key: k, agg: cat?.default_agg || 'avg', axis: 'left' });
            }
          }
        }}
      />

      {/* Name dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[360px] space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Nouveau Dashboard</h3>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              placeholder="Nom du dashboard..."
              value={newDashName}
              onChange={e => setNewDashName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') setShowNameDialog(false); }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNameDialog(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
              <button onClick={confirmCreate} disabled={!newDashName.trim()} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <PrintPreviewModal
          dashboardName={dm.activeTab?.name || 'KPI Monitor'}
          logoDataUrl={(() => { const iw = widgets.find(w => w.kind === 'image'); return iw ? (iw.config as ImageWidgetConfig).src : undefined; })()}
          dashboardRef={dashboardRef}
          onClose={() => setShowPrintPreview(false)}
          onExport={handleExportDashboardPDF}
        />
      )}
    </div>
  );
};

const KPIMonitorPage: React.FC = () => <KPIMonitorInner />;

export default KPIMonitorPage;
