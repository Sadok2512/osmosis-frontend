import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Plus, BarChart3, Save, FileDown, Sparkles, Pencil, EyeIcon,
  Activity, Filter, Calendar as CalendarIcon, X, Flag,
  Square, Columns2, LayoutGrid, LineChart as LineChartIcon,
  Table2, MapPin, ChevronDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';

import { useKpiCatalog, useDateRange, fetchDimensionValues } from './api/kpiMonitorApi';
import { buildCatalogMap } from './kpiCatalog';
import { KpiCatalogEntry, SplitDimension } from './types';
import { KpiWidgetItem, KpiWidgetConfig, createEmptyKpiWidget, duplicateKpiWidget } from './KpiWidgetTypes';
import KpiWidgetCard from './KpiWidgetCard';
import AIFloatingModal from './AIFloatingModal';
import { useDashboardManager, DashboardTabBar, DashboardListPanel } from '../bi/DashboardManager';
import { exportElementToPDF } from '@/lib/exportUtils';

const COLS = 12;
const ROW_HEIGHT = 80;

type ViewMode = 'graph' | 'table' | 'map';

const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
];

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
];

const FILTER_DIMENSIONS_LIST = ['Site', 'Vendor', 'Technology', 'Band', 'DOR', 'DR', 'Plaque', 'Zone ARCEP'];

interface Jalon {
  id: string;
  date: string;
  label: string;
  color: string;
}

const JALON_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/* ── Jalon Form ── */
const JalonForm: React.FC<{ onAdd: (j: Jalon) => void }> = ({ onAdd }) => {
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(JALON_COLORS[0]);

  const handleAdd = () => {
    if (!date || !label) return;
    onAdd({ id: `jalon-${Date.now()}`, date, label, color });
    setDate('');
    setLabel('');
  };

  return (
    <div className="space-y-2">
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom du jalon..."
        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
      <div className="flex items-center gap-1.5">
        {JALON_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={cn('w-5 h-5 rounded-full border-2 transition-all', color === c ? 'border-foreground scale-110' : 'border-transparent')}
            style={{ backgroundColor: c }} />
        ))}
        <Button size="sm" className="h-6 text-[10px] px-3 ml-auto" onClick={handleAdd} disabled={!date || !label}>
          <Plus className="w-3 h-3 mr-1" /> Ajouter
        </Button>
      </div>
    </div>
  );
};

/* ── Add Filter Dropdown ── */
const AddFilterDropdown: React.FC<{
  existingKeys: string[];
  onAdd: (dim: string, val: string) => void;
}> = ({ existingKeys, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedDim(null); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
          <Filter className="w-3 h-3" /> Add Filter
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[180px] p-1.5" align="start" sideOffset={4}>
        {!selectedDim ? (
          FILTER_DIMENSIONS_LIST.map(dim => (
            <button key={dim} onClick={() => setSelectedDim(dim)}
              className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
              {dim}
            </button>
          ))
        ) : (
          <FilterValuesList dim={selectedDim} onSelect={(val) => { onAdd(selectedDim, val); setOpen(false); setSelectedDim(null); }} onBack={() => setSelectedDim(null)} />
        )}
      </PopoverContent>
    </Popover>
  );
};

const FilterValuesList: React.FC<{ dim: string; onSelect: (val: string) => void; onBack: () => void }> = ({ dim, onSelect, onBack }) => {
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    const dimMap: Record<string, string> = { Site: 'Site', Vendor: 'Vendor', Technology: 'TECHNO', Band: 'BAND', DOR: 'DOR', DR: 'DOR', Plaque: 'Plaque', 'Zone ARCEP': 'ARCEP' };
    fetchDimensionValues(dimMap[dim] || dim).then(d => { if (d.values) setValues(d.values); }).catch(() => {});
  }, [dim]);

  return (
    <>
      <button onClick={onBack} className="w-full text-left px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground">← {dim}</button>
      <div className="border-t border-border/40 mt-1 pt-1 max-h-[200px] overflow-y-auto">
        {values.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Chargement...</div>
        ) : values.map(val => (
          <button key={val} onClick={() => onSelect(val)}
            className="w-full text-left px-3 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">{val}</button>
        ))}
      </div>
    </>
  );
};

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
const KPIMonitorPage: React.FC = () => {
  const queryClient = useQueryClient();
  const dm = useDashboardManager();

  // KPI catalog
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

  // Date range from backend
  const { data: dateRange } = useDateRange();

  // Widget state
  const [widgets, setWidgets] = useState<KpiWidgetItem[]>([]);
  const [editMode, setEditMode] = useState(true);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [graphLayout, setGraphLayout] = useState<1 | 2 | 4>(2);

  // Global filters (applied across all widgets)
  const [globalFilters, setGlobalFilters] = useState<Record<string, string[]>>({});
  
  // Global dates
  const [globalDateFrom, setGlobalDateFrom] = useState('');
  const [globalDateTo, setGlobalDateTo] = useState('');
  const [globalGranularity, setGlobalGranularity] = useState('auto');

  // Jalons
  const [jalons, setJalons] = useState<Jalon[]>([]);

  const [showAI, setShowAI] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Sync date range
  useEffect(() => {
    if (dateRange?.min_date && dateRange?.max_date && !globalDateFrom) {
      setGlobalDateFrom(dateRange.min_date.replace(/[T ].*/, ''));
      setGlobalDateTo(dateRange.max_date.replace(/[T ].*/, ''));
    }
  }, [dateRange, globalDateFrom]);

  const getDefaultDates = useCallback(() => {
    if (globalDateFrom && globalDateTo) return { dateFrom: globalDateFrom, dateTo: globalDateTo };
    if (dateRange?.min_date && dateRange?.max_date) {
      return { dateFrom: dateRange.min_date.replace(/[T ].*/, ''), dateTo: dateRange.max_date.replace(/[T ].*/, '') };
    }
    const now = new Date();
    return { dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
  }, [dateRange, globalDateFrom, globalDateTo]);

  // Container width
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
    newWidget.config.granularity = globalGranularity as any;
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    newWidget.layout.y = maxY;
    setWidgets(prev => [...prev, newWidget]);
    setSelectedWidgetId(newWidget.config.id);
  }, [widgets, getDefaultDates, globalGranularity]);

  const deleteWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.config.id !== id));
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  }, [selectedWidgetId]);

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

  // Period shortcut
  const applyPeriod = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const from = format(start, 'yyyy-MM-dd');
    const to = format(end, 'yyyy-MM-dd');
    setGlobalDateFrom(from);
    setGlobalDateTo(to);
  };

  // Apply global settings to all widgets
  const handleApplyGlobal = () => {
    setWidgets(prev => prev.map(w => ({
      ...w,
      config: {
        ...w.config,
        dateFrom: globalDateFrom || w.config.dateFrom,
        dateTo: globalDateTo || w.config.dateTo,
        granularity: globalGranularity as any,
      },
    })));
    toast({ title: 'Configuration appliquée à tous les widgets' });
  };

  // Global filter management
  const addGlobalFilter = (dim: string, val: string) => {
    setGlobalFilters(prev => {
      const existing = prev[dim] || [];
      if (existing.includes(val)) return prev;
      return { ...prev, [dim]: [...existing, val] };
    });
  };

  const removeGlobalFilter = (dim: string, val: string) => {
    setGlobalFilters(prev => {
      const existing = (prev[dim] || []).filter(v => v !== val);
      const next = { ...prev };
      if (existing.length === 0) delete next[dim];
      else next[dim] = existing;
      return next;
    });
  };

  const globalFilterChips = Object.entries(globalFilters).flatMap(([dim, vals]) =>
    vals.map(val => ({ dim, val }))
  );

  // Dashboard management
  const handleCreateNew = () => { setNewDashName(''); setShowNameDialog(true); };
  const confirmCreate = () => {
    if (newDashName.trim()) {
      setWidgets([]);
      setSelectedWidgetId(null);
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

  const startDate = globalDateFrom ? new Date(globalDateFrom) : undefined;
  const endDate = globalDateTo ? new Date(globalDateTo) : undefined;

  // Selected widget info
  const selectedWidget = widgets.find(w => w.config.id === selectedWidgetId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background text-foreground">
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

      {/* ── Header (Investigator style) ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground uppercase tracking-tight">
              {dm.activeTab?.name || 'KPI Monitor'}
            </h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
              Performance Monitoring & Analytics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditMode(!editMode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              editMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {editMode ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><EyeIcon className="w-3.5 h-3.5" /> View</>}
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => setShowAI(!showAI)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              showAI ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> AI
          </button>
          <div className="flex items-center gap-1 bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
          </div>
        </div>
      </div>

      {/* ── Control Panel (Investigator style) ── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        {/* Row 1: Main controls */}
        <div className="max-w-[1600px] mx-auto px-6 py-2.5">
          <div className="flex items-center gap-5 flex-wrap">
            {/* Date Start */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Début</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[130px] justify-start text-left text-xs font-medium h-[32px]', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setGlobalDateFrom(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date End */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Fin</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[130px] justify-start text-left text-xs font-medium h-[32px]', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => d && setGlobalDateTo(format(d, 'yyyy-MM-dd'))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="h-5 w-px bg-border/60 shrink-0" />

            {/* Period shortcuts */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Période</span>
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {PERIODS.map(p => (
                  <button key={p.label} onClick={() => applyPeriod(p.days)}
                    className="px-2.5 py-1 rounded-md text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-card transition-all">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-5 w-px bg-border/60 shrink-0" />

            {/* Granularity */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Granularité</span>
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {GRANULARITIES.map(g => (
                  <button key={g.value} onClick={() => setGlobalGranularity(g.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                      globalGranularity === g.value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-5 w-px bg-border/60 shrink-0" />

            {/* Jalons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jalons</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-[32px] text-xs gap-1.5 px-2.5">
                    <Flag className="w-3.5 h-3.5" />
                    {jalons.length > 0 ? `${jalons.length}` : '+'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3 space-y-2" align="start">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Ajouter un jalon</div>
                  <JalonForm onAdd={(j) => setJalons(prev => [...prev, j])} />
                  {jalons.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border/40">
                      {jalons.map(j => (
                        <div key={j.id} className="flex items-center gap-2 text-[10px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: j.color }} />
                          <span className="font-medium text-foreground truncate flex-1">{j.label}</span>
                          <span className="text-muted-foreground">{j.date}</span>
                          <button onClick={() => setJalons(prev => prev.filter(jj => jj.id !== j.id))} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {/* Jalon chips */}
              {jalons.map(j => (
                <span key={j.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-border/40 bg-muted/30 text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: j.color }} />
                  {j.label}
                  <button onClick={() => setJalons(prev => prev.filter(jj => jj.id !== j.id))} className="hover:text-destructive ml-0.5">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>

            {/* Apply */}
            <button onClick={handleApplyGlobal}
              className="shrink-0 ml-auto px-6 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-sm h-[32px]">
              Appliquer
            </button>
          </div>
        </div>

        {/* Row 2: Selected widget KPI context */}
        {selectedWidget && (
          <div className="max-w-[1600px] mx-auto px-6 pb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                📊 {selectedWidget.config.title}:
              </span>
              {selectedWidget.config.kpis.length === 0 ? (
                <span className="text-[10px] text-muted-foreground/60 italic">Aucun KPI</span>
              ) : (
                selectedWidget.config.kpis.map((k, i) => {
                  const entry = catalogMap[k.kpi_key];
                  return (
                    <span key={k.id || i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-primary/20 text-primary border-primary/40 ring-2 ring-primary/20 shadow-sm">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: k.color || '#3b82f6' }} />
                      <span className="truncate max-w-[140px]">{entry?.display_name || k.kpi_key}</span>
                    </span>
                  );
                })
              )}
              {selectedWidget.config.splitBy && (
                <>
                  <div className="w-px h-4 bg-border/40" />
                  <span className="text-[10px] text-muted-foreground">Split: <span className="font-semibold text-foreground">{selectedWidget.config.splitBy}</span></span>
                </>
              )}
              {selectedWidget.config.filters.length > 0 && (
                <>
                  <div className="w-px h-4 bg-border/40" />
                  <span className="text-[10px] text-muted-foreground">
                    {selectedWidget.config.filters.length} filtre{selectedWidget.config.filters.length > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Row 3: Global filter chips */}
        <div className="max-w-[1600px] mx-auto px-6 pb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Filter className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Filters:</span>
            </div>
            {globalFilterChips.map(({ dim, val }) => (
              <span key={`${dim}-${val}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
                <span className="text-muted-foreground">{dim}:</span>
                <span className="font-bold">{val}</span>
                <button onClick={() => removeGlobalFilter(dim, val)} className="ml-0.5 hover:text-destructive transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <AddFilterDropdown existingKeys={Object.keys(globalFilters)} onAdd={addGlobalFilter} />
          </div>
        </div>
      </div>

      {/* ── Section Header: Graph Analysis (Investigator style) ── */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <LayoutGrid className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-tight">KPI Widgets Dashboard</h2>
                <p className="text-[10px] text-muted-foreground">Independent widgets with dedicated config per graph</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* View mode tabs */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { key: 'graph' as ViewMode, icon: LineChartIcon, label: 'Graph' },
                  { key: 'table' as ViewMode, icon: Table2, label: 'Table' },
                  { key: 'map' as ViewMode, icon: MapPin, label: 'Map' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setViewMode(tab.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all',
                      viewMode === tab.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}>
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Layout switcher */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/40">
                {([
                  { val: 1 as const, icon: Square, title: 'Single' },
                  { val: 2 as const, icon: Columns2, title: 'Dual' },
                  { val: 4 as const, icon: LayoutGrid, title: 'Grid' },
                ]).map(l => (
                  <button key={l.val} onClick={() => setGraphLayout(l.val)} title={l.title}
                    className={cn(
                      'p-1.5 rounded-md transition-all',
                      graphLayout === l.val ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}>
                    <l.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>

              {/* Add widget */}
              {editMode && (
                <button onClick={addWidget}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm">
                  <Plus className="w-4 h-4" /> Ajouter Widget
                </button>
              )}
            </div>
          </div>

          {/* ── Canvas ── */}
          <div
            ref={(node) => { (dashboardRef as any).current = node; containerRef(node); }}
          >
            {widgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
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
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
                  <Plus className="w-5 h-5" /> Créer un Widget
                </button>
              </div>
            ) : viewMode === 'graph' ? (
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
                      jalons={jalons}
                    />
                  </div>
                ))}
              </GridLayout>
            ) : viewMode === 'table' ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Table2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase">Table View</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un widget et ouvrez sa configuration pour accéder aux données tabulaires individuelles.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase">Map View</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Vue cartographique disponible pour les KPIs supportant le mode map.
                </p>
              </div>
            )}
          </div>

          {/* Add more button below grid */}
          {widgets.length > 0 && editMode && viewMode === 'graph' && (
            <button onClick={addWidget}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all">
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          )}
        </div>
      </main>

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
