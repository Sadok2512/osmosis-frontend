import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useKpiMonitorStore } from '../../stores/kpiMonitorStore';
import { useGlobalFilterStore } from '../../stores/globalFilterStore';
import { useDashboardSettingsStore } from '../../stores/dashboardSettingsStore';
import { buildCatalogMap } from './kpiCatalog';
import { KpiCatalogEntry, SplitDimension } from './types';
import { useTimeseriesQuery, useSummaryQuery, useTableQuery, useKpiCatalog, useCounterCatalog, useDateRange, type TimeseriesRequest, type MonitorFilter, type MonitorKpiCatalogEntry } from './api/kpiMonitorApi';
import SummaryTilesRow from './SummaryTilesRow';
import KPIExplainPanel from './KPIExplainPanel';
import EChartsTimeSeries from './EChartsTimeSeries';
import KPITableView from './KPITableView';
import KPICatalogImport from './KPICatalogImport';
import KpiSelectorModal from './KpiSelectorModal';
import CounterSelectorModal from './CounterSelectorModal';
import FreeLayoutCanvas from '../bi/FreeLayoutCanvas';
import { ChartConfig, createDefaultChart } from '../bi/biTypes';
import { WidgetItem, MapWidgetConfig, createDefaultMapWidget, LayoutMode, WidgetLayout } from '../bi/dashboardTypes';
import BIChartCardECharts from '../bi/BIChartCardECharts';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import BIImageWidget, { ImageWidgetConfig, createDefaultImageWidget } from '../bi/BIImageWidget';
import BIMapWidget from '../bi/BIMapWidget';
import BITableWidget, { TableWidgetConfig, createDefaultTableWidget } from '../bi/BITableWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import TableConfigPanel from '../bi/TableConfigPanel';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { CSVDataProvider, CSVUploadButton, CSVDataPanel, useCSVData } from '../bi/CSVDataStore';
import { exportElementToPDF, PDFHeaderOptions } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';
import DashboardTopBar from './DashboardTopBar';
import DashboardConfigPanel from './DashboardConfigPanel';
import GraphSettingsPanel, { WidgetThreshold, WidgetStyleConfig, WidgetAxisConfig, WidgetGraphConfig } from './GraphSettingsPanel';
import { HorizontalConfigPanel, type QuickSettingsSection } from './InlineGraphConfig';
import AIFloatingModal from './AIFloatingModal';
import {
  LayoutGrid, FileDown, Plus, Settings2, X, Check, ArrowLeft, BarChart3,
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

const MAIN_CHART_ID = '__kpi_main__';
const DEFAULT_MAIN_CHART_LAYOUT = { x: 0, y: 0, w: 12, h: 6 };

const KPIMonitorInner: React.FC = () => {
  const store = useKpiMonitorStore();
  const globalFilter = useGlobalFilterStore();
  const dashSettingsStore = useDashboardSettingsStore();
  const dm = useDashboardManager();
  const { datasets } = useCSVData();
  const widgets = dm.activeTab?.widgets || [];
  const setWidgets = dm.updateActiveWidgets;

  // KPI catalog — from backend API only
  const queryClient = useQueryClient();
  const { data: backendCatalog } = useKpiCatalog();

  const catalog: KpiCatalogEntry[] = useMemo(() => {
    if (!backendCatalog || backendCatalog.length === 0) return [];
    return backendCatalog.map((e: any): KpiCatalogEntry => ({
      kpi_id: e.kpi_key,
      kpi_key: e.kpi_key,
      display_name: e.display_name,
      description: e.description || '',
      techno_scope: (e.techno === 'LTE' || e.techno === '4G') ? '4G' : (e.techno === 'NR' || e.techno === '5G') ? '5G' : 'both',
      unit: e.unit || '',
      value_type: (e.value_type as any) || 'gauge',
      default_agg: 'avg',
      allowed_aggs: ['avg', 'min', 'max', 'sum'],
      is_map_supported: false,
      thresholds: e.threshold_warning != null ? { warning: e.threshold_warning, critical: e.threshold_critical ?? e.threshold_warning * 0.8 } : undefined,
      category: e.category || 'Other',
      color: '#3b82f6',
      vendor: e.vendor || '',
      techno: e.techno || '',
      supported_levels: e.supported_levels || [],
      is_normalized: !!e.is_normalized,
    }));
  }, [backendCatalog]);
  const catalogMap = useMemo(() => buildCatalogMap(catalog), [catalog]);

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
  const [showCounterSelector, setShowCounterSelector] = useState(false);
  const [selectedCounters, setSelectedCounters] = useState<string[]>([]);

  // Counter catalog from backend
  const { data: counterCatalog } = useCounterCatalog();

  // Sync date range from backend — always set to available data range
  const { data: dateRange } = useDateRange();
  const [dateRangeSynced, setDateRangeSynced] = useState(false);
  useEffect(() => {
    if (dateRange?.min_date && dateRange?.max_date && !dateRangeSynced) {
      const backendMin = dateRange.min_date.replace(/[T ].*/,'');
      const backendMax = dateRange.max_date.replace(/[T ].*/,'');
      if (backendMin && backendMax) {
        // Check if current dates are outside backend range (stale/default)
        const curFrom = globalFilter.dateFrom;
        const curTo = globalFilter.dateTo;
        const isStale = curFrom < backendMin || curFrom > backendMax || curTo < backendMin || curTo > backendMax;
        if (isStale) {
          globalFilter.setDateRange(backendMin, backendMax);
          console.log(`[KPI Monitor] Date range synced: ${backendMin} → ${backendMax} (was stale: ${curFrom} → ${curTo})`);
        }
        setDateRangeSynced(true);
      }
    }
  }, [dateRange, dateRangeSynced]);
  const [editMode, setEditMode] = useState(false);
  const [quickSection, setQuickSection] = useState<QuickSettingsSection>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [widgetThresholds, setWidgetThresholds] = useState<Record<string, WidgetThreshold[]>>({});
  const [widgetThresholdsEnabled, setWidgetThresholdsEnabled] = useState<Record<string, boolean>>({});
  const [widgetStyles, setWidgetStyles] = useState<Record<string, WidgetStyleConfig>>({});
  const [widgetAxisConfigs, setWidgetAxisConfigs] = useState<Record<string, WidgetAxisConfig>>({});
  const [widgetGraphConfigs, setWidgetGraphConfigs] = useState<Record<string, WidgetGraphConfig>>({});

  // Build merged filters for API
  const mergedFilters: MonitorFilter[] = useMemo(() => [
    ...store.localFilters.filter(f => f.values.length > 0).map(f => ({
      dimension: f.dimension, op: f.op, values: f.values,
    })),
    ...globalFilter.globalFilters.filter(f => f.values.length > 0).map(f => ({
      dimension: f.dimension, op: f.op, values: f.values,
    })),
    ...(globalFilter.crossFilter ? [{ dimension: globalFilter.crossFilter.dimension, op: 'EQ' as const, values: [globalFilter.crossFilter.value] }] : []),
  ], [store.localFilters, globalFilter.globalFilters, globalFilter.crossFilter]);

  // Timeseries API request (gated on date sync)
  const tsRequest: TimeseriesRequest | null = useMemo(() => {
    if (store.selectedKpis.length === 0 || !dateRangeSynced) return null;
    return {
      date_from: globalFilter.dateFrom,
      date_to: globalFilter.dateTo,
      granularity: globalFilter.granularity,
      filters: mergedFilters,
      selections: store.selectedKpis.map(k => ({
        kpi_key: k.kpi_key,
        visualization: k.graphType || 'line',
        axis: k.axis,
      })),
      split_by: store.splitBy,
      top_n: store.topN,
    };
  }, [globalFilter.dateFrom, globalFilter.dateTo, globalFilter.granularity, mergedFilters, store.selectedKpis, store.splitBy, store.topN]);

  const { data: tsApiResponse, isLoading: tsLoading } = useTimeseriesQuery(tsRequest);
  const tsData = tsApiResponse?.series || [];
  const tsGranularity = tsApiResponse?.meta?.granularity_applied || (globalFilter.granularity === 'auto' ? '1d' : globalFilter.granularity);
  const tsTotalSeries = tsApiResponse?.meta?.total_series || 0;

  // Summary API request
  const summaryRequest = useMemo(() => {
    if (store.selectedKpis.length === 0 || !dateRangeSynced) return null;
    return {
      date_from: globalFilter.dateFrom,
      date_to: globalFilter.dateTo,
      filters: mergedFilters,
      kpi_keys: store.selectedKpis.map(k => k.kpi_key),
    };
  }, [globalFilter.dateFrom, globalFilter.dateTo, mergedFilters, store.selectedKpis]);

  const { data: summaryItems, isLoading: summaryLoading } = useSummaryQuery(summaryRequest);

  // Table API request
  const tableRequest = useMemo(() => {
    if (store.selectedKpis.length === 0 || store.viewMode !== 'table' || !dateRangeSynced) return null;
    return {
      date_from: globalFilter.dateFrom,
      date_to: globalFilter.dateTo,
      filters: mergedFilters,
      kpi_keys: store.selectedKpis.map(k => k.kpi_key),
      split_by: store.splitBy,
      top_n: store.topN,
      page: 1,
      page_size: 50,
    };
  }, [globalFilter.dateFrom, globalFilter.dateTo, mergedFilters, store.selectedKpis, store.splitBy, store.topN, store.viewMode]);

  const { data: tableResponse, isLoading: tableLoading } = useTableQuery(tableRequest);

  // Transform table response to KpiSummaryRow format for KPITableView
  const tableRows = useMemo(() => {
    if (!tableResponse?.rows) return [];
    const rows: any[] = [];
    for (const row of tableResponse.rows) {
      for (const kpiKey of store.selectedKpis.map(k => k.kpi_key)) {
        const kpiData = row[kpiKey];
        if (!kpiData) continue;
        rows.push({
          split_value: row.split_value,
          kpi_key: kpiKey,
          avg: kpiData.avg,
          min: kpiData.min,
          max: kpiData.max,
          last: kpiData.avg, // table endpoint doesn't return last separately
          delta_pct: 0,
        });
      }
    }
    return rows;
  }, [tableResponse, store.selectedKpis]);

  // Explain panel state
  const [explainKpiKey, setExplainKpiKey] = useState<string | null>(null);

  const refreshCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['monitor', 'catalog'] });
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

  const containerNodeRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNodeRef.current = node;
    if (!node) return;
    setContainerWidth(node.getBoundingClientRect().width);
  }, []);

  // Keep containerWidth in sync via ResizeObserver
  React.useEffect(() => {
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

  const getId = (w: WidgetItem) => w?.config?.id ?? 'unknown';
  const validWidgets = widgets.filter(w => w?.config?.id && w?.layout);
  const hasMainChart = store.selectedKpis.length > 0 && store.viewMode === 'graph';
  const mainChartLayout = store.mainChartLayout || DEFAULT_MAIN_CHART_LAYOUT;

  const layout = [
    ...(hasMainChart ? [{
      i: MAIN_CHART_ID,
      x: mainChartLayout.x,
      y: mainChartLayout.y,
      w: mainChartLayout.w,
      h: mainChartLayout.h,
      minW: 6,
      minH: 4,
    }] : []),
    ...validWidgets.map(w => ({
      i: getId(w),
      x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
      minW: w.kind === 'text' ? 2 : w.kind === 'map' ? 4 : w.kind === 'image' ? 2 : w.kind === 'table' ? 4 : 3,
      minH: w.kind === 'text' ? 1 : w.kind === 'map' ? 3 : w.kind === 'image' ? 2 : w.kind === 'table' ? 3 : 2,
    })),
  ];

  const onLayoutChange = (newLayout: any[]) => {
    const main = newLayout.find(n => n.i === MAIN_CHART_ID);
    if (main) {
      store.setMainChartLayout({
        ...mainChartLayout,
        x: main.x,
        y: main.y,
        w: main.w,
        h: main.h,
      });
    }

    setWidgets(prev => prev.map(w => {
      if (!w.layout) return w;
      const l = newLayout.find(n => n.i === getId(w));
      if (!l) return w;
      return { ...w, layout: { ...w.layout, x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  const colWidth = containerWidth / COLS;
  const toFreeRect = (w: WidgetItem) => {
    const layout = w.layout || { x: 0, y: 0, w: 6, h: 4, freeX: undefined, freeY: undefined, freeW: undefined, freeH: undefined };
    return {
      id: getId(w),
      x: layout.freeX ?? layout.x * colWidth,
      y: layout.freeY ?? layout.y * ROW_HEIGHT,
      w: layout.freeW ?? layout.w * colWidth,
      h: layout.freeH ?? layout.h * ROW_HEIGHT,
    };
  };

  const mainChartRect = hasMainChart ? {
    id: MAIN_CHART_ID,
    x: mainChartLayout.freeX ?? mainChartLayout.x * colWidth,
    y: mainChartLayout.freeY ?? mainChartLayout.y * ROW_HEIGHT,
    w: mainChartLayout.freeW ?? mainChartLayout.w * colWidth,
    h: mainChartLayout.freeH ?? mainChartLayout.h * ROW_HEIGHT,
  } : null;

  const onFreeLayoutChange = useCallback((id: string, rect: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (id === MAIN_CHART_ID) {
      const cur = mainChartRect || { x: 0, y: 0, w: colWidth * 12, h: ROW_HEIGHT * 6 };
      store.setMainChartLayout({
        ...mainChartLayout,
        freeX: rect.x ?? cur.x,
        freeY: rect.y ?? cur.y,
        freeW: rect.w ?? cur.w,
        freeH: rect.h ?? cur.h,
      });
      return;
    }

    setWidgets(prev => prev.map(w => {
      if (!w.layout) return w;
      if (getId(w) !== id) return w;
      const cur = toFreeRect(w);
      return { ...w, layout: { ...w.layout, freeX: rect.x ?? cur.x, freeY: rect.y ?? cur.y, freeW: rect.w ?? cur.w, freeH: rect.h ?? cur.h } };
    }));
  }, [setWidgets, mainChartRect, mainChartLayout, colWidth, store]);

  const toggleLayoutMode = () => {
    if (layoutMode === 'grid') {
      if (hasMainChart) {
        store.setMainChartLayout({
          ...mainChartLayout,
          freeX: mainChartLayout.freeX ?? mainChartLayout.x * colWidth,
          freeY: mainChartLayout.freeY ?? mainChartLayout.y * ROW_HEIGHT,
          freeW: mainChartLayout.freeW ?? mainChartLayout.w * colWidth,
          freeH: mainChartLayout.freeH ?? mainChartLayout.h * ROW_HEIGHT,
        });
      }

      setWidgets(prev => prev.map(w => {
        if (!w.layout) return w;
        return {
          ...w,
          layout: { ...w.layout, freeX: w.layout.freeX ?? w.layout.x * colWidth, freeY: w.layout.freeY ?? w.layout.y * ROW_HEIGHT, freeW: w.layout.freeW ?? w.layout.w * colWidth, freeH: w.layout.freeH ?? w.layout.h * ROW_HEIGHT },
        };
      }));
      setLayoutMode('free');
    } else {
      setLayoutMode('grid');
    }
  };

  const getMaxY = () => {
    const widgetsMax = widgets.reduce((max, w) => w.layout ? Math.max(max, w.layout.y + w.layout.h) : max, 0);
    return hasMainChart ? Math.max(widgetsMax, mainChartLayout.y + mainChartLayout.h) : widgetsMax;
  };

  const getChartPixelHeight = (gridHeight: number) => Math.max(280, gridHeight * ROW_HEIGHT + Math.max(0, gridHeight - 1) * 12 - 24);

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

  const editingTable = validWidgets.find(w => getId(w) === editingId && w.kind === 'table');

  const renderMainChart = (height: number, title?: string) => (
    <EChartsTimeSeries
      data={tsData}
      catalogMap={catalogMap}
      title={title || store.selectedKpis.map(k => catalogMap[k.kpi_key]?.display_name || k.kpi_key).join(' / ')}
      badge={tsLoading ? 'Loading...' : catalog.length > 0 ? 'Live' : 'Empty'}
      granularity={tsGranularity}
      height={height}
      onRefresh={() => { queryClient.invalidateQueries({ queryKey: ['monitor'] }); refreshCatalog(); }}
      onDelete={editMode ? () => store.selectedKpis.forEach(k => store.removeKpi(k.kpi_key)) : undefined}
      graphConfig={widgetGraphConfigs[MAIN_CHART_ID]}
      axisConfig={widgetAxisConfigs[MAIN_CHART_ID]}
      thresholds={widgetThresholds[MAIN_CHART_ID]}
      thresholdsEnabled={widgetThresholdsEnabled[MAIN_CHART_ID]}
      editMode={store.activeEditingWidgetId === MAIN_CHART_ID}
      onToggleEditMode={editMode ? () => store.setActiveEditingWidgetId(MAIN_CHART_ID) : undefined}
      onAxisConfigChange={c => setWidgetAxisConfigs(prev => ({ ...prev, [MAIN_CHART_ID]: c }))}
      onGraphConfigChange={c => setWidgetGraphConfigs(prev => ({ ...prev, [MAIN_CHART_ID]: c }))}
    />
  );

  const renderWidget = (w: WidgetItem) => {
    const wId = getId(w);
    if (w.kind === 'chart') return <BIChartCardECharts config={w.config as ChartConfig} onEdit={editMode ? () => { store.setActiveEditingWidgetId(wId); setShowAI(false); } : undefined} onDuplicate={editMode ? () => duplicateWidget(wId) : undefined} onDelete={editMode ? () => deleteWidget(wId) : undefined} />;
    if (w.kind === 'map') return <BIMapWidget config={w.config as MapWidgetConfig} onChange={editMode ? cfg => updateMapConfig(wId, cfg) : undefined} onDelete={editMode ? () => deleteWidget(wId) : undefined} />;
    if (w.kind === 'image') return <BIImageWidget config={w.config as ImageWidgetConfig} onChange={editMode ? cfg => updateImageConfig(wId, cfg) : undefined} onDelete={editMode ? () => deleteWidget(wId) : undefined} />;
    if (w.kind === 'table') return <BITableWidget config={w.config as TableWidgetConfig} onChange={editMode ? cfg => updateTableConfig(wId, cfg) : undefined} onDelete={editMode ? () => deleteWidget(wId) : undefined} onEdit={editMode ? () => { setEditingId(wId); } : undefined} />;
    return <BITextWidget config={w.config as TextWidgetConfig} onChange={editMode ? cfg => updateTextConfig(wId, cfg) : undefined} onDelete={editMode ? () => deleteWidget(wId) : undefined} />;
  };

  const canvasBg = dashSettingsStore.getSettings(dm.activeTabId, dm.activeTab?.name).theme.backgroundColor;

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

      {/* ── Sticky Top Bar (unified: header + time + filters) ── */}
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
        editMode={editMode}
        onToggleEditMode={() => setEditMode(!editMode)}
        onApplyConfig={() => queryClient.invalidateQueries({ queryKey: ['monitor'] })}
        seriesInfo={{
          total: tsTotalSeries,
          granularity: tsGranularity,
          truncated: false,
        }}
      />

      {/* Filter is now inside DashboardConfigPanel */}

      {/* GraphSettingsPanel removed — config is now in the right sidebar */}

      {/* ── Dashboard Canvas + Right Config Sidebar ── */}
      {(() => {
        const isEditingMain = store.activeEditingWidgetId === '__kpi_main__';
        const editingWidgetId = store.activeEditingWidgetId && store.activeEditingWidgetId !== '__kpi_main__' ? store.activeEditingWidgetId : null;
        const editingWidget = editingWidgetId ? widgets.find(w => getId(w) === editingWidgetId) : null;
        const isMonoView = !!(isEditingMain || editingWidget);

        const closeEdit = () => {
          store.setActiveEditingWidgetId(null);
          store.setSelectedWidgetId(null);
          toast({ title: 'Configuration appliquée', description: 'Retour au dashboard.' });
        };

        const monoTitle = isEditingMain
          ? store.selectedKpis.map(k => catalogMap[k.kpi_key]?.display_name || k.kpi_key).join(' / ')
          : editingWidget?.kind === 'chart'
            ? (editingWidget.config as ChartConfig).title || 'Chart'
            : editingWidgetId || 'Widget';

        const configKey = isEditingMain ? '__kpi_main__' : editingWidgetId!;

        return (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* ── Main content area ── */}
            <div className="flex-1 overflow-auto flex flex-col min-w-0">

              {/* Mono header bar — only visible during edit */}
              {isMonoView && (
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-muted/20 shrink-0">
                  <button onClick={closeEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Retour
                  </button>
                  <div className="h-4 w-px bg-border/50" />
                  <span className="text-[13px] font-semibold text-foreground truncate">{monoTitle}</span>
                </div>
              )}

              {/* Canvas area */}
              <div
                ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }}
                className="flex-1 overflow-auto p-4"
                style={canvasBg ? { backgroundColor: canvasBg } : undefined}
              >
                {/* ── Summary Tiles ── */}
                {store.selectedKpis.length > 0 && !isMonoView && (
                  <SummaryTilesRow
                    items={summaryItems || []}
                    loading={summaryLoading}
                    onKpiClick={(key) => setExplainKpiKey(key)}
                  />
                )}

                {/* ── Main KPI Chart (always mounted — never destroyed on view switch) ── */}
                {store.selectedKpis.length > 0 && store.viewMode === 'graph' && (isEditingMain || !isMonoView) && (
                  <MainChartResizable
                    isSelected={store.selectedWidgetId === '__kpi_main__'}
                    onSelect={() => {}}
                  >
                    {(chartHeight) => (
                      <EChartsTimeSeries
                        data={tsData}
                        catalogMap={catalogMap}
                        title={isMonoView ? monoTitle : store.selectedKpis.map(k => catalogMap[k.kpi_key]?.display_name || k.kpi_key).join(' / ')}
                        badge={tsLoading ? 'Loading...' : catalog.length > 0 ? 'Live' : 'Empty'}
                        granularity={tsGranularity}
                        height={isMonoView ? 600 : chartHeight}
                        onRefresh={() => { queryClient.invalidateQueries({ queryKey: ['monitor'] }); refreshCatalog(); }}
                        onDuplicate={() => {}}
                        onDelete={() => store.selectedKpis.forEach(k => store.removeKpi(k.kpi_key))}
                        graphConfig={widgetGraphConfigs['__kpi_main__']}
                        axisConfig={widgetAxisConfigs['__kpi_main__']}
                        thresholds={widgetThresholds['__kpi_main__']}
                        thresholdsEnabled={widgetThresholdsEnabled['__kpi_main__']}
                        editMode={isEditingMain}
                        onToggleEditMode={editMode ? () => store.setActiveEditingWidgetId('__kpi_main__') : undefined}
                        onAxisConfigChange={c => setWidgetAxisConfigs(prev => ({ ...prev, '__kpi_main__': c }))}
                        onGraphConfigChange={c => setWidgetGraphConfigs(prev => ({ ...prev, '__kpi_main__': c }))}
                      />
                    )}
                  </MainChartResizable>
                )}

                {/* Table view */}
                {store.selectedKpis.length > 0 && store.viewMode === 'table' && !isMonoView && (
                  <KPITableView rows={tableRows} />
                )}

                {/* Editing a BI widget (not main chart) */}
                {editingWidget && (
                  <div className="h-full min-h-[500px]">
                    {renderWidget(editingWidget)}
                  </div>
                )}

                {/* ── Dashboard grid/free widgets (hidden during mono edit) ── */}
                {!isMonoView && (
                  <>
                    {widgets.length === 0 && store.selectedKpis.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-6">
                        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <BarChart3 className="w-10 h-10 text-primary/60" />
                        </div>
                        <div className="text-center space-y-2">
                          <h3 className="text-lg font-bold text-foreground">Ajouter un KPI pour commencer</h3>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Sélectionnez un ou plusieurs KPIs pour visualiser les données dans le graphique.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowKpiSelector(true)}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                        >
                          <Plus className="w-5 h-5" /> Sélectionner des KPIs
                        </button>
                      </div>
                    ) : widgets.length > 0 && layoutMode === 'grid' ? (
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
                        margin={[12, 12]}
                      >
                        {validWidgets.map(w => (
                          <div key={getId(w)}
                            onClickCapture={() => {
                              const wId = getId(w);
                              store.setSelectedWidgetId(store.selectedWidgetId === wId ? null : wId);
                            }}
                            className={`cursor-pointer transition-all duration-200 rounded-xl ${
                              store.selectedWidgetId === getId(w) ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : ''
                            }`}
                          >{renderWidget(w)}</div>
                        ))}
                      </GridLayout>
                    ) : validWidgets.length > 0 ? (
                      <FreeLayoutCanvas items={validWidgets.map(toFreeRect)} onLayoutChange={onFreeLayoutChange}>
                        {validWidgets.map(w => (
                          <div key={getId(w)} className={`w-full h-full cursor-pointer transition-all duration-200 rounded-xl ${
                            store.selectedWidgetId === getId(w) ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : ''
                          }`}
                            onClickCapture={() => store.setSelectedWidgetId(store.selectedWidgetId === getId(w) ? null : getId(w))}
                          >{renderWidget(w)}</div>
                        ))}
                      </FreeLayoutCanvas>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* ── Right Config Sidebar — only visible during edit ── */}
            {isMonoView && (
              <HorizontalConfigPanel
                catalogMap={catalogMap}
                onOpenKpiSelector={() => setShowKpiSelector(true)}
                onOpenCounterSelector={() => setShowCounterSelector(true)}
                selectedCounterCount={selectedCounters.length}
                title={monoTitle}
                onClose={closeEdit}
                onSave={() => {
                  toast({ title: 'Configuration enregistrée', description: 'Cliquez Retour pour quitter le mode édition.' });
                }}
                axisConfig={widgetAxisConfigs[configKey]}
                onAxisConfigChange={c => setWidgetAxisConfigs(prev => ({ ...prev, [configKey]: c }))}
                graphConfig={widgetGraphConfigs[configKey]}
                onGraphConfigChange={c => setWidgetGraphConfigs(prev => ({ ...prev, [configKey]: c }))}
                thresholds={widgetThresholds[configKey] || []}
                onThresholdsChange={t => setWidgetThresholds(prev => ({ ...prev, [configKey]: t }))}
                thresholdsEnabled={widgetThresholdsEnabled[configKey] || false}
                onThresholdsEnabledChange={v => setWidgetThresholdsEnabled(prev => ({ ...prev, [configKey]: v }))}
              />
            )}
            {editingTable && editingTable.kind === 'table' && !isMonoView && (
              <TableConfigPanel
                config={editingTable.config as TableWidgetConfig}
                onChange={cfg => updateTableConfig(getId(editingTable), cfg)}
                onClose={() => setEditingId(null)}
              />
            )}
          </div>
        );
      })()}

      {/* ── Side panels (dashboard list, CSV) ── */}
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

      {/* ── KPI Explain Panel ── */}
      {explainKpiKey && (
        <KPIExplainPanel kpiKey={explainKpiKey} onClose={() => setExplainKpiKey(null)} />
      )}

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

      {/* ── Counter Selector Modal ── */}
      <CounterSelectorModal
        open={showCounterSelector}
        onClose={() => setShowCounterSelector(false)}
        counters={counterCatalog || []}
        selectedIds={selectedCounters}
        onConfirm={(ids) => setSelectedCounters(ids)}
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
