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
import GlobalFilterBar from './GlobalFilterBar';
import FreeLayoutCanvas from '../bi/FreeLayoutCanvas';
import { ChartConfig, createDefaultChart } from '../bi/biTypes';
import { WidgetItem, MapWidgetConfig, createDefaultMapWidget, LayoutMode } from '../bi/dashboardTypes';
import BIChartCardECharts from '../bi/BIChartCardECharts';
import BITextWidget, { TextWidgetConfig, createDefaultTextWidget } from '../bi/BITextWidget';
import BIImageWidget, { ImageWidgetConfig, createDefaultImageWidget } from '../bi/BIImageWidget';
import BIMapWidget from '../bi/BIMapWidget';
import BITableWidget, { TableWidgetConfig, createDefaultTableWidget } from '../bi/BITableWidget';
import ChartConfigPanel from '../bi/ChartConfigPanel';
import AIAssistantPanel from '../bi/AIAssistantPanel';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { CSVDataProvider, CSVUploadButton, CSVDataPanel, useCSVData } from '../bi/CSVDataStore';
import { exportElementToPDF, PDFHeaderOptions } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';
import {
  BarChart3, Table2, Map as MapIcon, Plus, X,
  Filter, Layers, Settings2, Database, ChevronDown, ChevronUp,
  Save, FileDown, Sparkles, MoreHorizontal, LayoutGrid,
  FolderOpen, Copy, Eye, Grid3X3, Move, Type, ImageIcon, FileSpreadsheet, Globe, Lock,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const COLS = 12;
const ROW_HEIGHT = 80;

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

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
        <div className="bg-slate-900 px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {logoDataUrl && <img src={logoDataUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-white/10" />}
            <div>
              <h2 className="text-white font-bold text-lg">{dashboardName}</h2>
              <p className="text-slate-400 text-xs">{dateStr}</p>
            </div>
          </div>
          <div className="text-right"><span className="text-slate-300 text-sm font-semibold">PSN TEAM</span></div>
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
  const [showImport, setShowImport] = useState(false);
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

  // KPI helpers
  const addKpi = () => {
    const available = catalog.filter(k => !store.selectedKpis.some(s => s.kpi_key === k.kpi_key));
    if (available.length === 0) return;
    store.addKpi({ kpi_key: available[0].kpi_key, agg: available[0].default_agg, axis: 'left' });
  };

  // Filter is now handled by GlobalFilterBar

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
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* ── LEFT CONFIG PANEL ── */}
      <div className="w-[320px] shrink-0 border-r border-border bg-card overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-primary" />
              <div>
                <h2 className="text-base font-bold text-foreground">KPI Monitor</h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {catalog.length} KPIs •{' '}
                  <span className={catalogSource === 'db' ? 'text-emerald-500' : 'text-muted-foreground'}>
                    {catalogSource === 'db' ? 'Base de données' : 'Catalogue statique'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</label>
            <div className="flex gap-2">
              <input type="date" value={globalFilter.dateFrom} onChange={e => globalFilter.setDateRange(e.target.value, globalFilter.dateTo)} className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
              <input type="date" value={globalFilter.dateTo} onChange={e => globalFilter.setDateRange(globalFilter.dateFrom, e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {['7D', '14D', '30D', '90D'].map(preset => {
                const days = parseInt(preset);
                return (
                  <button key={preset} onClick={() => {
                    const to = new Date();
                    const from = new Date(to.getTime() - days * 86400000);
                    globalFilter.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                  }} className="flex-1 px-2 py-1.5 text-[10px] font-bold rounded-md hover:bg-primary hover:text-primary-foreground transition-colors">
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granularity */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Granularité</label>
            <Select value={globalFilter.granularity} onValueChange={(v) => globalFilter.setGranularity(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="1h">1 heure</SelectItem>
                <SelectItem value="1d">1 jour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* KPI Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPIs sélectionnés</label>
              <button onClick={addKpi} className="text-primary hover:text-primary/80"><Plus className="w-4 h-4" /></button>
            </div>
            {store.selectedKpis.map((kpi) => {
              const cat = catalogMap[kpi.kpi_key];
              return (
                <div key={kpi.kpi_key} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat?.color }} />
                  <Select value={kpi.kpi_key} onValueChange={(v) => {
                    store.removeKpi(kpi.kpi_key);
                    const newCat = catalogMap[v];
                    store.addKpi({ kpi_key: v, agg: newCat?.default_agg || 'avg', axis: kpi.axis });
                  }}>
                    <SelectTrigger className="h-7 text-[11px] flex-1 border-0 bg-transparent p-0"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {catalog.map(k => (
                        <SelectItem key={k.kpi_key} value={k.kpi_key}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: k.color }} />
                            {k.display_name}
                            <span className="text-[9px] text-muted-foreground">({k.unit})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={kpi.axis} onValueChange={(v) => store.updateKpi(kpi.kpi_key, { axis: v as any })}>
                    <SelectTrigger className="h-7 w-14 text-[10px] border-0 bg-transparent p-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">L</SelectItem>
                      <SelectItem value="right">R</SelectItem>
                    </SelectContent>
                  </Select>
                  {store.selectedKpis.length > 1 && (
                    <button onClick={() => store.removeKpi(kpi.kpi_key)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Split */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Split par</label>
            <Select value={store.splitBy || 'none'} onValueChange={(v) => store.setSplitBy(v === 'none' ? null : v as SplitDimension)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {store.splitBy && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-muted-foreground">Top</label>
                  <input type="number" min={1} max={20} value={store.topN}
                    onChange={e => store.setTopN(parseInt(e.target.value) || 5)}
                    className="w-12 px-1.5 py-1 rounded-md border border-border bg-background text-xs text-center" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={store.includeOthers} onCheckedChange={store.setIncludeOthers} />
                  <label className="text-[10px] text-muted-foreground">Others</label>
                </div>
              </div>
            )}
          </div>

          {/* Filters → see GlobalFilterBar above the toolbar */}
          <div className="p-2 rounded-lg bg-muted/30 border border-border">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              Filtres dynamiques disponibles dans la barre globale au-dessus du dashboard.
              {globalFilter.globalFilters.filter(f => f.values.length > 0).length > 0 && (
                <Badge variant="secondary" className="text-[8px]">
                  {globalFilter.globalFilters.filter(f => f.values.length > 0).length} actifs
                </Badge>
              )}
            </p>
          </div>

          {/* Info */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <p className="text-[10px] text-muted-foreground">
              <span className="font-bold text-primary">{tsResponse.total_series}</span> séries •{' '}
              <span className="font-bold">{tsResponse.granularity_used}</span> granularité
              {tsResponse.truncated && <Badge variant="destructive" className="ml-1 text-[8px]">Tronqué</Badge>}
            </p>
          </div>

          {/* KPI Catalog Import */}
          <Collapsible open={showImport} onOpenChange={setShowImport}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Catalogue KPI
              </span>
              {showImport ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <KPICatalogImport />
              <Button variant="outline" size="sm" className="w-full mt-2 text-[10px] gap-1" onClick={refreshCatalog}>
                Recharger catalogue depuis la DB
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
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

        {/* Global Filter Bar */}
        <GlobalFilterBar />

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
                  <DropdownMenuItem onClick={() => { dm.duplicateDashboard(dm.activeTabId); toast({ title: 'Dashboard dupliqué' }); }}><Copy className="w-3.5 h-3.5 mr-2" /> Duplicate</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dm.setShowList(!dm.showList)}><FolderOpen className="w-3.5 h-3.5 mr-2" /> Load</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowPrintPreview(true)}><Eye className="w-3.5 h-3.5 mr-2" /> Preview</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportDashboardPDF}><FileDown className="w-3.5 h-3.5 mr-2" /> Export PDF</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setShowAI(!showAI); setEditingId(null); }}><Sparkles className="w-3.5 h-3.5 mr-2" /> AI Assistant</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCSVPanel(!showCSVPanel)}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Data {datasets.length > 0 && `(${datasets.length})`}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CSVUploadButton />
              <div className="w-px h-5 bg-border mx-1" />
              {/* Layout mode toggle */}
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
      </div>

      {/* Side panels */}
      {editingChart && editingChart.kind === 'chart' && (
        <ChartConfigPanel config={editingChart.config as ChartConfig} onChange={cfg => updateChartConfig(getId(editingChart), cfg)} onClose={() => setEditingId(null)} />
      )}
      {showAI && (
        <AIAssistantPanel charts={widgets.filter(w => w.kind === 'chart').map(w => w.config as ChartConfig)} onClose={() => setShowAI(false)} onApplySuggestion={() => {}} />
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
