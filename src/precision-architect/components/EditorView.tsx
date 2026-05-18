import { useEffect, useMemo, useState } from 'react';
import {
  Layout as LayoutIcon,
  Edit3,
  Settings,
  X,
  Plus,
  Activity,
  BarChart3,
  Map as MapIcon,
  Table as TableIcon,
  Type as TypeIcon,
  Image as ImageIcon,
  Radio,
  ChevronRight,
  Trash2,
  FileText,
  MessageSquare,
  SlidersHorizontal,
  MoreVertical,
  Copy,
  Image as ImageDownIcon,
  Heading1,
  Hash,
  Minus,
  ChevronDown,
  Check,
  LayoutDashboard,
  FilePlus,
  Save,
  Globe,
  Lock,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'motion/react';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GridLayout = WidthProvider(ReactGridLayout);
import { ViewMode, PAPage, PASection, WidgetKind, DynWidget, WidgetLayout, DEFAULT_HERO_CONFIG, DEFAULT_STAT_CONFIG, DEFAULT_DIVIDER_CONFIG, DEFAULT_MAP_CONFIG, DEFAULT_CHART_CONFIG, DEFAULT_DASHBOARD_THEME, DashboardTheme } from '../types';
import { cn } from '@/lib/utils';
import EditorSidebar from './EditorSidebar';
import PAToolbar from './PAToolbar';
import WidgetRenderer from './WidgetRenderer';
import SectionBlock from './SectionBlock';
import ReportHeader from './ReportHeader';
import ChartSettingsPanel from './ChartSettingsPanel';
import TableSettingsPanel from './TableSettingsPanel';
import PremiumWidgetSettingsPanel from './PremiumWidgetSettingsPanel';

import MapSettingsPanel from './MapSettingsPanel';
import { usePAReportStore } from '../stores/paReportStore';
import { toast } from 'sonner';
import { exportReportToPDF, exportReportToPPTX } from '../lib/exportReport';
import { FileDown, Presentation } from 'lucide-react';

interface EditorViewProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  pages: PAPage[];
  setPages: React.Dispatch<React.SetStateAction<PAPage[]>>;
  activePageId: string;
  setActivePageId: (id: string) => void;
}

const COLS = 12;
const ROW_HEIGHT = 60;

const DEFAULT_SIZES: Record<WidgetKind, { w: number; h: number }> = {
  chart: { w: 6, h: 5 },
  map: { w: 6, h: 5 },
  table: { w: 8, h: 6 },
  kpi: { w: 3, h: 3 },
  text: { w: 6, h: 3 },
  image: { w: 4, h: 4 },
  hero: { w: 12, h: 3 },
  stat: { w: 3, h: 3 },
  divider: { w: 12, h: 1 },
};

function findFreeSpot(widgets: DynWidget[], w: number): { x: number; y: number } {
  if (widgets.length === 0) return { x: 0, y: 0 };
  const maxY = widgets.reduce((m, x) => Math.max(m, x.layout.y + x.layout.h), 0);
  return { x: 0, y: maxY };
}

export default function EditorView({
  projectName,
  onProjectNameChange,
  onViewModeChange,
  pages,
  setPages,
  activePageId,
  setActivePageId,
}: EditorViewProps) {
  const [activeWidget, setActiveWidget] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [newSectionId, setNewSectionId] = useState<string | null>(null);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'data' | 'appearance' | 'interactions' | 'alerting'>('data');
  const [settingsSubTab, setSettingsSubTab] = useState<'table' | 'breakdown' | 'logs'>('table');

  // Close the floating right sidebar with Escape, regardless of focus location.
  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings]);
  

  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const widgets = Array.isArray(activePage?.widgets) ? activePage!.widgets : [];
  const sections = Array.isArray(activePage?.sections) ? activePage!.sections : [];
  const theme = activePage?.theme;
  const pageBg = theme?.backgroundColor || (theme?.background === 'dark' ? '#0f172a' : theme?.background === 'gradient' ? '#1a1a2e' : undefined);
  const cardBg = theme?.cardColor || '#ffffff';
  const titleColor = theme?.titleColor || theme?.accentColor;
  const textColor = theme?.textColor;
  const radius = theme?.borderRadius ?? 16;
  const spacing = theme?.spacing ?? 16;
  const padding = theme?.pagePadding ?? 32;
  // Wider canvas: default constrained width is now ~1760px instead of 1280px (max-w-7xl)
  // so dashboards reclaim the side space that was previously wasted on large screens.
  const widthClass = theme?.pageWidth === 'full' ? 'max-w-none' : 'max-w-[1760px]';
  const headerAlign = theme?.headerAlign === 'center' ? 'text-center' : theme?.headerAlign === 'right' ? 'text-right' : 'text-left';
  const showHeader = theme?.showPageHeader && (theme?.pageTitle || theme?.pageSubtitle);

  const updateWidgets = (updater: (w: DynWidget[]) => DynWidget[]) => {
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, widgets: updater(p.widgets) } : p));
  };

  const updateSections = (updater: (s: PASection[]) => PASection[]) => {
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, sections: updater(p.sections ?? []) } : p));
  };

  const patchActivePageTheme = (patch: Partial<DashboardTheme>) => {
    setPages(prev => prev.map(p => p.id === activePageId
      ? { ...p, theme: { ...DEFAULT_DASHBOARD_THEME, ...(p.theme ?? {}), ...patch } }
      : p));
  };

  const addSection = () => {
    const id = `section-${Date.now()}`;
    const idx = (activePage?.sections?.length ?? 0) + 1;
    const newSection: PASection = {
      id,
      name: `Section ${idx}`,
      title: 'Add title',
      description: 'Add description or message',
      // Default brand green (matches --primary HSL 170 70% 35%)
      titleColor: 'hsl(170 70% 35%)',
    };
    // Always append at the very end of the sections list (which itself is rendered AFTER all widgets).
    // This guarantees the new section appears at the bottom of the page, never on top.
    updateSections(s => [...s, newSection]);
    setActiveSectionId(id);
    setNewSectionId(id);
    // Scroll the canvas all the way down so the user immediately sees the new section at the bottom.
    // Use multiple attempts with increasing delays to ensure DOM has rendered.
    const scrollToNew = () => {
      const el = document.getElementById(`section-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        return;
      }
      const scrollContainer = document.querySelector('.pa-grid-edit') as HTMLElement | null;
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    };
    setTimeout(scrollToNew, 100);
    setTimeout(scrollToNew, 300);
    setTimeout(scrollToNew, 600);
    // Remove the "new" highlight after the animation finishes.
    setTimeout(() => setNewSectionId((prev) => (prev === id ? null : prev)), 2500);
  };

  const updateSection = (id: string, patch: Partial<PASection>) => {
    updateSections(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  };

  const removeSection = (id: string) => {
    updateSections(s => s.filter(x => x.id !== id));
    if (activeSectionId === id) setActiveSectionId(null);
  };

  const focusSection = (id: string) => {
    setActiveSectionId(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const reorderSections = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateSections(s => {
      const list = [...s];
      const fromIdx = list.findIndex(x => x.id === fromId);
      const toIdx = list.findIndex(x => x.id === toId);
      if (fromIdx === -1 || toIdx === -1) return s;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
  };

  const addWidget = (kind: WidgetKind) => {
    const size = DEFAULT_SIZES[kind];
    // Determine target group: active section (if any) or unassigned (top grid).
    const targetSectionId = activeSectionId ?? undefined;
    const targetGroup = widgets.filter(w => (w.sectionId ?? undefined) === targetSectionId);
    const spot = findFreeSpot(targetGroup, size.w);
    const newWidget: DynWidget = {
      id: `${kind}-${Date.now()}`,
      kind,
      sectionId: targetSectionId,
      layout: { x: spot.x, y: spot.y, w: size.w, h: size.h },
    };
    if (kind === 'hero') newWidget.heroConfig = { ...DEFAULT_HERO_CONFIG };
    if (kind === 'stat') {
      newWidget.statConfig = { ...DEFAULT_STAT_CONFIG };
      // Stat reuses ChartSettingsPanel so it needs a Chart-shaped config for the Data Source UI.
      newWidget.config = structuredClone(DEFAULT_CHART_CONFIG);
    }
    if (kind === 'divider') newWidget.dividerConfig = { ...DEFAULT_DIVIDER_CONFIG };
    if (kind === 'map') {
      newWidget.mapConfig = { ...DEFAULT_MAP_CONFIG };
      newWidget.title = 'Network Map';
    }
    updateWidgets(w => [...w, newWidget]);
    if (kind === 'hero' || kind === 'stat' || kind === 'divider' || kind === 'map') {
      setActiveWidget(newWidget.id);
    }
    // Scroll to the section the widget was added into so the user sees it land in place.
    if (targetSectionId) {
      setTimeout(() => {
        document.getElementById(`section-${targetSectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  };
  const removeWidget = (id: string) => updateWidgets(w => w.filter(x => x.id !== id));

  const duplicateWidget = (id: string) => {
    const src = widgets.find(x => x.id === id);
    if (!src) return;
    const targetGroup = widgets.filter(w => (w.sectionId ?? undefined) === (src.sectionId ?? undefined));
    const spot = findFreeSpot(targetGroup, src.layout.w);
    const clone: DynWidget = structuredClone(src);
    clone.id = `${src.kind}-${Date.now()}`;
    clone.layout = { x: spot.x, y: spot.y, w: src.layout.w, h: src.layout.h };
    if (src.title) clone.title = `${src.title} (copy)`;
    updateWidgets(ws => [...ws, clone]);
    toast.success('Widget duplicated');
  };

  const exportWidgetToPNG = async (id: string) => {
    const el = document.querySelector(`[data-pa-widget-id="${id}"]`) as HTMLElement | null;
    if (!el) { toast.error('Widget not found'); return; }
    const w = widgets.find(x => x.id === id);
    const filename = (w?.title || w?.kind || 'widget').toString().replace(/\s+/g, '_');
    const t = toast.loading('Exporting PNG…');
    try {
      const { exportElementToPNG } = await import('@/lib/exportUtils');
      await exportElementToPNG(el, filename);
      toast.success('PNG exported', { id: t });
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message ?? 'unknown'}`, { id: t });
    }
  };

  const addPage = () => {
    const newId = `page-${Date.now()}`;
    setPages(prev => [...prev, { id: newId, name: `Page ${prev.length + 1}`, widgets: [], sections: [] }]);
    setActivePageId(newId);
  };

  const removePage = (id: string) => {
    if (pages.length <= 1) return;
    setPages(prev => prev.filter(p => p.id !== id));
    if (activePageId === id) {
      const remaining = pages.filter(p => p.id !== id);
      setActivePageId(remaining[0].id);
    }
  };

  // Group widgets: unassigned (top grid) + per-section (rendered with each section).
  const unassignedWidgets = useMemo(
    () => widgets.filter(w => !w.sectionId),
    [widgets]
  );
  const widgetsBySection = useMemo(() => {
    const map = new Map<string, DynWidget[]>();
    for (const w of widgets) {
      if (!w.sectionId) continue;
      if (!map.has(w.sectionId)) map.set(w.sectionId, []);
      map.get(w.sectionId)!.push(w);
    }
    return map;
  }, [widgets]);

  const buildLayout = (group: DynWidget[]) => group.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 2,
    minH: 2,
  }));

  const layout = useMemo(() => buildLayout(unassignedWidgets), [unassignedWidgets]);

  const handleLayoutChange = (next: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
    updateWidgets(prev => prev.map(w => {
      const l = next.find(n => n.i === w.id);
      if (!l) return w;
      const same = l.x === w.layout.x && l.y === w.layout.y && l.w === w.layout.w && l.h === w.layout.h;
      if (same) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } as WidgetLayout };
    }));
  };

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <aside className="w-64 bg-slate-50 border-r border-outline-variant/20 flex flex-col shrink-0 h-full relative z-40">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
              <Radio className="w-5 h-5 text-on-primary-container" />
            </div>
            <div>
              <h2 className="text-lg font-black text-primary leading-tight">Netview</h2>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Global Perimeter</p>
            </div>
          </div>

          <nav className="space-y-1">
            {pages.map((page) => {
              const isActive = page.id === activePageId;
              const pageSections = page.sections ?? [];
              return (
                <div key={page.id}>
                  <div className="group relative">
                    <button
                      onClick={() => setActivePageId(page.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-headline text-sm font-bold transition-all",
                        isActive ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                      )}
                    >
                      <Activity className="w-4 h-4" />
                      <span className="truncate flex-1 text-left">{page.name}</span>
                    </button>
                    {pages.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removePage(page.id); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-error hover:bg-error/10 rounded transition-opacity"
                        aria-label="Remove page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isActive && (
                    <div className="ml-4 mt-1 mb-2 pl-3 border-l border-outline-variant/30 space-y-0.5">
                      {pageSections.map((s) => (
                        <div key={s.id} className="group/sec relative flex items-center">
                          <button
                            onClick={() => focusSection(s.id)}
                            className={cn(
                              "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold transition-all text-left truncate",
                              activeSectionId === s.id
                                ? "bg-primary/10 text-primary"
                                : "text-on-surface-variant hover:bg-surface-container-low"
                            )}
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{s.name || 'Untitled'}</span>
                          </button>
                          <button
                            onClick={() => removeSection(s.id)}
                            className="opacity-0 group-hover/sec:opacity-100 p-1 text-error hover:bg-error/10 rounded transition-opacity"
                            aria-label="Remove section"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addSection}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-primary/80 hover:bg-primary/5 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add section</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-outline-variant/10">
          <button
            onClick={addPage}
            className="w-full flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-xl text-primary font-bold hover:bg-surface-container-highest transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Page</span>
          </button>
          <div className="mt-4 space-y-1">
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-3 px-4 py-2 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors">
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="end" className="w-64 p-2">
                <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Export report
                </div>
                <button
                  onClick={async () => {
                    const t = toast.loading('Generating PDF…');
                    try {
                      await exportReportToPDF(projectName);
                      toast.success('PDF exported', { id: t });
                    } catch (e: any) {
                      toast.error(`PDF export failed: ${e?.message ?? 'unknown'}`, { id: t });
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                >
                  <FileDown className="w-4 h-4 text-primary" />
                  Export as PDF
                </button>
                <button
                  onClick={async () => {
                    const t = toast.loading('Generating PowerPoint…');
                    try {
                      await exportReportToPPTX(projectName);
                      toast.success('PPTX exported', { id: t });
                    } catch (e: any) {
                      toast.error(`PPTX export failed: ${e?.message ?? 'unknown'}`, { id: t });
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                >
                  <Presentation className="w-4 h-4 text-primary" />
                  Export as PowerPoint
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-[70] flex justify-between items-center w-full px-6 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-6">
            {/* Dashboard switcher */}
            <DashboardSwitcher />

            <div className="h-6 w-px bg-outline-variant/30" />
            <div className="flex items-center gap-2 group">
              <input
                value={projectName}
                onChange={(e) => onProjectNameChange(e.target.value)}
                className="bg-transparent border-none focus:ring-0 font-headline font-bold text-on-surface text-lg p-0 w-auto min-w-[200px]"
              />
              <Edit3 className="w-4 h-4 text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-surface-container-high p-1 rounded-full flex items-center shadow-inner">
              <button className="px-4 py-1.5 text-sm font-bold bg-white shadow-sm rounded-full text-primary">Edit</button>
              <button
                onClick={() => onViewModeChange('view')}
                className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                View
              </button>
              <button
                onClick={() => onViewModeChange('presentation')}
                className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Present
              </button>
            </div>
          </div>
        </header>

        <PAToolbar />

        <div
          className="flex-grow relative overflow-y-auto custom-scrollbar pa-grid-edit"
          style={{
            backgroundColor: pageBg,
            color: textColor,
            padding: `${padding}px`,
          }}
        >
          <div className={cn(widthClass, 'mx-auto')} style={{ display: 'flex', flexDirection: 'column', gap: spacing }}>
            <ReportHeader
              theme={theme}
              projectName={projectName}
              pageName={activePage?.name}
              size="md"
              editable
              onThemePatch={patchActivePageTheme}
            />

            {widgets.length === 0 && sections.length === 0 && (
              <div className="bg-white/40 border-2 border-dashed border-outline-variant/60 p-16 rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-primary">
                  <Plus className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-on-surface mb-1">Empty canvas</h3>
                  <p className="text-xs font-bold text-on-surface-variant max-w-md">
                    Add a section from the sidebar to write notes, or use the floating toolbox to add a Chart, Map, KPI Card or Table.
                  </p>
                </div>
              </div>
            )}

            {(() => {
              // Helper to render a widget card (used by both unassigned grid and per-section grids).
              const renderWidgetCard = (w: DynWidget) => {
                const isChart = w.kind === 'chart';
                const padCls = isChart ? 'pt-3 pb-3 pl-3 pr-3' : 'p-4';
                const isActiveWidget = activeWidget === w.id;
                return (
                  <div
                    key={w.id}
                    data-pa-widget-id={w.id}
                    onMouseDownCapture={(e) => {
                      // Only activate on direct widget clicks, not when interacting with controls
                      // inside the widget (popovers, buttons, drag handles still work normally).
                      const target = e.target as HTMLElement;
                      if (target.closest('button, a, input, select, textarea, [role="menuitem"], [data-no-activate]')) return;
                      if (activeWidget !== w.id) setActiveWidget(w.id);
                    }}
                    className={cn(
                      `${padCls} group relative overflow-hidden cursor-pointer transition-all duration-200`,
                      w.transparentBg ? 'border-0 shadow-none' : 'shadow-sm border border-outline-variant/10',
                      isActiveWidget && 'ring-2 ring-primary ring-offset-2 ring-offset-surface shadow-lg scale-[1.005]'
                    )}
                    style={{ backgroundColor: w.transparentBg ? 'transparent' : cardBg, borderRadius: radius }}
                  >
                    {isActiveWidget && (
                      <div className="absolute top-2 left-2 z-30 pointer-events-none animate-fade-in">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-on-primary text-[9px] font-black uppercase tracking-widest shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-on-primary animate-pulse" />
                          Actif
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="w-7 h-7 rounded-full bg-white shadow-md border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                            aria-label="Widget actions"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          className="w-44 p-1 z-[80]"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { setActiveWidget(w.id); setShowSettings(true); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary/5 hover:text-primary rounded-md transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => duplicateWidget(w.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary/5 hover:text-primary rounded-md transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicate
                          </button>
                          <button
                            onClick={() => exportWidgetToPNG(w.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-on-surface hover:bg-primary/5 hover:text-primary rounded-md transition-colors"
                          >
                            <ImageDownIcon className="w-3.5 h-3.5" />
                            Export PNG
                          </button>
                          <div className="my-1 h-px bg-outline-variant/20" />
                          <button
                            onClick={() => removeWidget(w.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-error hover:bg-error/10 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <WidgetRenderer widget={w} editable onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))} />
                  </div>
                );
              };

              return (
                <>
                  {/* Unassigned widgets — top grid (legacy / pre-section widgets). */}
                  {unassignedWidgets.length > 0 && (
                    <GridLayout
                      className="layout"
                      layout={layout}
                      cols={COLS}
                      rowHeight={ROW_HEIGHT}
                      margin={[spacing, spacing]}
                      containerPadding={[0, 0]}
                      draggableHandle=".widget-drag-handle"
                      isDraggable
                      isResizable
                      compactType="vertical"
                      preventCollision={false}
                      onLayoutChange={handleLayoutChange}
                      autoSize
                    >
                      {unassignedWidgets.map(renderWidgetCard)}
                    </GridLayout>
                  )}

                  {sections.length > 0 && (
                    <div aria-hidden className="shrink-0" style={{ height: 24 }} />
                  )}

                  {/* Sections — each renders its header + its own grid of owned widgets. */}
                  {sections.length > 0 && (
                    <div className="space-y-6">
                      {sections.map((s) => {
                        const sectionWidgets = widgetsBySection.get(s.id) ?? [];
                        const sectionLayout = buildLayout(sectionWidgets);
                        return (
                          <div key={s.id} className="space-y-3">
                            <SectionBlock
                              section={s}
                              editable
                              isActive={activeSectionId === s.id}
                              isNew={newSectionId === s.id}
                              isDragging={draggingSectionId === s.id}
                              isDragOver={dragOverSectionId === s.id && draggingSectionId !== s.id}
                              onChange={(patch) => updateSection(s.id, patch)}
                              onRemove={() => removeSection(s.id)}
                              onDragStart={(e) => {
                                setDraggingSectionId(s.id);
                                e.dataTransfer.effectAllowed = 'move';
                                try { e.dataTransfer.setData('text/plain', s.id); } catch { /* noop */ }
                              }}
                              onDragOver={(e) => {
                                if (!draggingSectionId) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (dragOverSectionId !== s.id) setDragOverSectionId(s.id);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const fromId = draggingSectionId ?? e.dataTransfer.getData('text/plain');
                                if (fromId) reorderSections(fromId, s.id);
                                setDraggingSectionId(null);
                                setDragOverSectionId(null);
                              }}
                              onDragEnd={() => {
                                setDraggingSectionId(null);
                                setDragOverSectionId(null);
                              }}
                            />
                            {sectionWidgets.length > 0 ? (
                              <GridLayout
                                className="layout"
                                layout={sectionLayout}
                                cols={COLS}
                                rowHeight={ROW_HEIGHT}
                                margin={[spacing, spacing]}
                                containerPadding={[0, 0]}
                                draggableHandle=".widget-drag-handle"
                                isDraggable
                                isResizable
                                compactType="vertical"
                                preventCollision={false}
                                onLayoutChange={handleLayoutChange}
                                autoSize
                              >
                                {sectionWidgets.map(renderWidgetCard)}
                              </GridLayout>
                            ) : (
                              <button
                                onClick={() => setActiveSectionId(s.id)}
                                className={cn(
                                  "w-full border-2 border-dashed rounded-2xl p-6 text-xs font-bold uppercase tracking-widest transition-all",
                                  activeSectionId === s.id
                                    ? "border-primary/60 bg-primary/5 text-primary"
                                    : "border-outline-variant/40 text-on-surface-variant hover:border-primary/40 hover:text-primary"
                                )}
                              >
                                {activeSectionId === s.id
                                  ? "✓ Active section — new widgets land here"
                                  : "Click to activate · then add widgets from the toolbox"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
            <div aria-hidden className="shrink-0" style={{ height: 120 }} />
          </div>
        </div>


        {activeWidget && (
          <div
            className="fixed bottom-4 z-40 transition-all duration-300 pa-widget-settings-drawer"
            style={{
              left: 'calc(16rem + 16px)',
              right: showSettings ? 'calc(400px + 16px)' : '16px',
            }}
          >
        {(() => {
          const w = widgets.find(x => x.id === activeWidget);
          if (!w) return null;

          // Chart widgets get the new unified side panel.
          if (w.kind === 'chart') {
            return (
              <ChartSettingsPanel
                widget={w}
                onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))}
                onClose={() => setActiveWidget(null)}
              />
            );
          }

          // Table widgets — same dedicated panel pattern as chart.
          if (w.kind === 'table') {
            return (
              <TableSettingsPanel
                widget={w}
                onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))}
                onClose={() => setActiveWidget(null)}
              />
            );
          }

          // Map widgets — dedicated bottom panel (Data Source / Display / Appearance).
          if (w.kind === 'map') {
            return (
              <MapSettingsPanel
                widget={w}
                onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))}
                onClose={() => setActiveWidget(null)}
              />
            );
          }

          // STAT (KPI Card) reuses ChartSettingsPanel with isStat=true so the
          // settings UI matches Graph (KPI selector + filters + period +
          // advancedTimeFrame) minus granularity. Visual fields (theme,
          // accent, showPulse, label/value/unit) live in widget.statConfig
          // and are surfaced inside ChartSettingsPanel's appearance tab.
          //
          // The previous "Maximum update depth exceeded" on Override was
          // caused by an unstable zustand selector in ChartSettingsPanel's
          // DataTab returning a fresh object literal each render — fixed by
          // splitting it into primitive selectors + useMemo.
          if (w.kind === 'stat') {
            return (
              <ChartSettingsPanel
                widget={w}
                onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))}
                onClose={() => setActiveWidget(null)}
              />
            );
          }

          // Premium manually-edited widgets share a unified settings panel.
          if (w.kind === 'hero' || w.kind === 'divider') {
            return (
              <PremiumWidgetSettingsPanel
                widget={w}
                onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))}
                onClose={() => setActiveWidget(null)}
              />
            );
          }

          // Other widget kinds keep the legacy bottom panel.
          const widgetLabel = `${w.kind.toUpperCase()} · ${w.id.slice(0, 18)}`;
          return (
            <div className="h-[280px] max-h-[30vh] w-full bg-white border border-[hsl(165,12%,91%)] rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.06)] relative z-40 shrink-0 flex flex-col">
              <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0 sticky top-0 z-10 rounded-t-2xl">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
                  <div className="h-4 w-px bg-outline-variant" />
                  <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSettingsTab('data'); setSettingsSubTab('table'); }}
                    className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setActiveWidget(null)}
                    className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                    aria-label="Close settings"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 min-h-0">
                <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1 overflow-y-auto">
                  {([
                    { key: 'data', label: 'Data Source', icon: undefined as any },
                    { key: 'appearance', label: 'Appearance', icon: undefined as any },
                    { key: 'interactions', label: 'Interactions', icon: undefined as any },
                    { key: 'alerting', label: 'Alerting', icon: undefined as any },
                  ] as const).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setSettingsTab(tab.key)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                        settingsTab === tab.key ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                      )}
                    >
                      {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                      {tab.label}
                    </button>
                  ))}
                </aside>
                <div className="flex-1 p-8 pb-10 overflow-y-auto custom-scrollbar">
                  <div className="max-w-4xl">
                    {settingsTab === 'data' && (
                      <div className="space-y-3 text-xs text-on-surface-variant">
                        <p className="font-bold text-on-surface">Source dataset</p>
                        <p>Configure the dataset for this widget.</p>
                      </div>
                    )}
                    {settingsTab === 'appearance' && (
                      <p className="text-xs text-on-surface-variant">Color palette, axis, legend and density options.</p>
                    )}
                    {settingsTab === 'interactions' && (
                      <p className="text-xs text-on-surface-variant">Drill-down targets and tooltip actions.</p>
                    )}
                    {settingsTab === 'alerting' && (
                      <p className="text-xs text-on-surface-variant">Threshold rules and notifications.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
          </div>
        )}
      </div>

      {/* Floating right config sidebar — overlays canvas, never resizes the dashboard grid. */}
      <AnimatePresence>
        {showSettings && (
          <>
            {/* Light backdrop on small screens for focus; transparent on desktop so the dashboard stays readable. */}
            <motion.div
              key="pa-sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 z-[85] bg-black/20 lg:bg-transparent lg:pointer-events-none"
              aria-hidden
            />
            <motion.div
              key="pa-sidebar-floating"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="z-[90] w-full sm:w-[400px] max-w-full pointer-events-auto flex flex-col"
              style={{ position: 'fixed', top: 0, right: 0, bottom: 0, height: '100vh' }}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowSettings(false); }}
              tabIndex={-1}
            >
              <EditorSidebar onClose={() => setShowSettings(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {!showSettings && (
        <button
          onClick={() => setShowSettings(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-white shadow-2xl border-y border-l border-outline-variant/20 p-2 rounded-l-xl z-50 text-primary hover:bg-surface-container-low transition-colors"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
      )}

      <div className={`fixed ${showSettings ? 'right-[336px]' : 'right-16'} ${activeWidget ? 'bottom-[316px]' : 'bottom-8'} z-[60] flex flex-col items-end gap-3 overflow-visible transition-all duration-300`}>
        <AnimatePresence>
          {toolboxOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-2xl shadow-2xl border border-outline-variant/20 p-2 flex flex-col gap-1 w-56"
            >
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Add widget</div>
              {([
                { icon: Heading1, label: 'Hero Title', kind: 'hero' as const },
                { icon: Hash, label: 'Stat Card', kind: 'stat' as const },
                { icon: Minus, label: 'Divider', kind: 'divider' as const },
                { icon: BarChart3, label: 'Chart', kind: 'chart' as const },
                { icon: MapIcon, label: 'Map', kind: 'map' as const },
                { icon: TableIcon, label: 'Table', kind: 'table' as const },
                { icon: TypeIcon, label: 'Text', kind: 'text' as const },
                { icon: ImageIcon, label: 'Image', kind: 'image' as const },
              ]).map((tool) => (
                <button
                  key={tool.label}
                  onClick={() => { addWidget(tool.kind); setToolboxOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 rounded-xl transition-all w-full text-left active:scale-95"
                >
                  <tool.icon className="w-5 h-5 text-primary shrink-0" />
                  <span className="font-bold text-xs uppercase tracking-wider text-on-surface">{tool.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setToolboxOpen(v => !v)}
          className="w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-90 transition-transform"
          aria-label="Add widget"
          title="Add widget"
        >
          <Plus className={`w-6 h-6 transition-transform ${toolboxOpen ? 'rotate-45' : ''}`} />
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// DashboardSwitcher — popover listing all saved dashboards with switch / rename
// ----------------------------------------------------------------------------
function DashboardSwitcher() {
  const [open, setOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dashboards = usePAReportStore((s) => s.dashboards);
  const activeId = usePAReportStore((s) => s.activeDashboardId);
  const switchDashboard = usePAReportStore((s) => s.switchDashboard);
  const renameDashboard = usePAReportStore((s) => s.renameDashboard);
  const deleteDashboard = usePAReportStore((s) => s.deleteDashboard);
  const newDashboard = usePAReportStore((s) => s.newDashboard);
  const loadDashboardsFromCloud = usePAReportStore((s) => s.loadDashboardsFromCloud);

  // Hydrate the local list with PA dashboards stored in the central
  // Supabase `dashboards` table so previously-saved reports show up here.
  useEffect(() => {
    void loadDashboardsFromCloud();
  }, [loadDashboardsFromCloud]);

  const active = dashboards.find((d) => d.id === activeId);
  const pendingDashboard = dashboards.find((d) => d.id === pendingDeleteId);

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    if (dashboards.length <= 1) {
      toast.error('At least one dashboard must remain.');
      setPendingDeleteId(null);
      return;
    }
    deleteDashboard(pendingDeleteId);
    toast.success('Dashboard deleted');
    setPendingDeleteId(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/20 transition-colors">
          <LayoutDashboard className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-on-surface max-w-[180px] truncate">
            {active?.name || 'Untitled Dashboard'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 z-[80]">
        <div className="p-3 border-b border-outline-variant/15">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            My Dashboards · {dashboards.length}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {dashboards.map((d) => {
            const isActive = d.id === activeId;
            const isPublic = (d as any).visibility === 'public';
            const updatedLabel = d.updatedAt
              ? new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                ' · ' +
                new Date(d.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <div
                key={d.id}
                className={cn(
                  'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                  isActive ? 'bg-primary/10' : 'hover:bg-surface-container-low'
                )}
                onClick={() => {
                  if (!isActive) switchDashboard(d.id);
                  setOpen(false);
                }}
              >
                <div className="w-7 h-7 rounded-md bg-white border border-outline-variant/20 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-sm font-bold truncate', isActive ? 'text-primary' : 'text-on-surface')}>
                      {d.name}
                    </span>
                    {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    <span
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border shrink-0',
                        isPublic
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200',
                      )}
                      title={isPublic ? 'Visible to everyone' : 'Only visible to you'}
                    >
                      {isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      {isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant">
                    {d.pages.length} page{d.pages.length > 1 ? 's' : ''}
                    {updatedLabel ? ` · saved ${updatedLabel}` : ''}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dashboards.length <= 1) {
                      toast.error('At least one dashboard must remain.');
                      return;
                    }
                    setPendingDeleteId(d.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-error hover:bg-error/10 rounded transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-outline-variant/15 p-2 space-y-1.5">
          <button
            onClick={() => {
              newDashboard();
              setOpen(false);
              toast.success('New dashboard created');
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Dashboard</span>
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                usePAReportStore.getState().markSaved();
                toast.success('Dashboard saved');
              }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-container-low hover:bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            <button
              onClick={() => {
                if (dashboards.length <= 1) {
                  toast.error('At least one dashboard must remain.');
                  return;
                }
                setPendingDeleteId(activeId);
              }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-container-low hover:bg-error/10 text-error text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </PopoverContent>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => { if (!o) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete dashboard
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                "{pendingDashboard?.name ?? ''}"
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
