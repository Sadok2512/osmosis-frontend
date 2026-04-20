import { useMemo, useState } from 'react';
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
  Heading1,
  Hash,
  Minus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GridLayout = WidthProvider(ReactGridLayout);
import { ViewMode, PAPage, PASection, WidgetKind, DynWidget, WidgetLayout, DEFAULT_HERO_CONFIG, DEFAULT_STAT_CONFIG, DEFAULT_DIVIDER_CONFIG } from '../types';
import { cn } from '@/lib/utils';
import EditorSidebar from './EditorSidebar';
import PAToolbar from './PAToolbar';
import WidgetRenderer from './WidgetRenderer';
import SectionBlock from './SectionBlock';
import ChartSettingsPanel from './ChartSettingsPanel';
import TableSettingsPanel from './TableSettingsPanel';
import PremiumWidgetSettingsPanel from './PremiumWidgetSettingsPanel';
import { usePAReportStore } from '../stores/paReportStore';
import { toast } from 'sonner';

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
  const [settingsTab, setSettingsTab] = useState<'data' | 'appearance' | 'interactions' | 'alerting'>('data');
  const [settingsSubTab, setSettingsSubTab] = useState<'table' | 'breakdown' | 'logs'>('table');
  

  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const widgets = activePage?.widgets ?? [];
  const sections = activePage?.sections ?? [];

  const updateWidgets = (updater: (w: DynWidget[]) => DynWidget[]) => {
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, widgets: updater(p.widgets) } : p));
  };

  const updateSections = (updater: (s: PASection[]) => PASection[]) => {
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, sections: updater(p.sections ?? []) } : p));
  };

  const addSection = () => {
    const id = `section-${Date.now()}`;
    const idx = (activePage?.sections?.length ?? 0) + 1;
    const newSection: PASection = {
      id,
      name: `Section ${idx}`,
      title: 'Add title',
      description: 'Add description or message',
    };
    updateSections(s => [...s, newSection]);
    setActiveSectionId(id);
    setTimeout(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
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

  const addWidget = (kind: WidgetKind) => {
    const size = DEFAULT_SIZES[kind];
    const spot = findFreeSpot(widgets, size.w);
    const newWidget: DynWidget = {
      id: `${kind}-${Date.now()}`,
      kind,
      layout: { x: spot.x, y: spot.y, w: size.w, h: size.h },
    };
    if (kind === 'hero') newWidget.heroConfig = { ...DEFAULT_HERO_CONFIG };
    if (kind === 'stat') newWidget.statConfig = { ...DEFAULT_STAT_CONFIG };
    if (kind === 'divider') newWidget.dividerConfig = { ...DEFAULT_DIVIDER_CONFIG };
    updateWidgets(w => [...w, newWidget]);
    if (kind === 'hero' || kind === 'stat' || kind === 'divider') {
      setActiveWidget(newWidget.id);
    }
  };
  const removeWidget = (id: string) => updateWidgets(w => w.filter(x => x.id !== id));

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

  const layout = useMemo(() => widgets.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 2,
    minH: 2,
  })), [widgets]);

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
              <h2 className="text-lg font-black text-primary leading-tight">Network Manager</h2>
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
            <button className="w-full flex items-center gap-3 px-4 py-2 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-6 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-6">
            <span className="text-xl font-bold text-primary font-headline tracking-tight">Precision Architect</span>
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

          <div className="flex items-center gap-4">
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
            <button
              onClick={() => {
                usePAReportStore.getState().markSaved();
                toast.success('Report saved', { description: 'Your report is auto-persisted in this browser.' });
              }}
              className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary-container active:scale-95 transition-all"
            >
              Save
            </button>
          </div>
        </header>

        <PAToolbar />

        <div className="flex-grow p-8 relative overflow-y-auto blueprint-grid custom-scrollbar pa-grid-edit">
          <div className="max-w-7xl mx-auto space-y-6">
            {sections.length > 0 && (
              <div className="space-y-4">
                {sections.map((s) => (
                  <SectionBlock
                    key={s.id}
                    section={s}
                    editable
                    isActive={activeSectionId === s.id}
                    onChange={(patch) => updateSection(s.id, patch)}
                    onRemove={() => removeSection(s.id)}
                  />
                ))}
              </div>
            )}

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

            {widgets.length > 0 && (
              <GridLayout
                className="layout"
                layout={layout}
                cols={COLS}
                rowHeight={ROW_HEIGHT}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                draggableHandle=".widget-drag-handle"
                isDraggable
                isResizable
                compactType="vertical"
                preventCollision={false}
                onLayoutChange={handleLayoutChange}
              >
                {widgets.map(w => (
                  <div key={w.id} className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 p-4 group relative overflow-hidden">
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button
                        onClick={() => { setActiveWidget(w.id); setShowSettings(true); }}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white shadow-md border border-outline-variant/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors"
                        aria-label="Edit widget"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => removeWidget(w.id)}
                        className="w-7 h-7 rounded-full bg-white shadow-md border border-outline-variant/20 flex items-center justify-center text-error hover:bg-error/10 transition-colors"
                        aria-label="Remove widget"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <WidgetRenderer widget={w} editable onChange={(patch) => updateWidgets(ws => ws.map(x => x.id === w.id ? { ...x, ...patch } : x))} />
                  </div>
                ))}
              </GridLayout>
            )}
          </div>
        </div>


        {activeWidget && (() => {
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

          // Premium manually-edited widgets share a unified settings panel.
          if (w.kind === 'hero' || w.kind === 'stat' || w.kind === 'divider') {
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
            <div className="h-[clamp(20rem,50vh,38rem)] bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0">
              <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
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

              <div className="flex h-full pb-10">
                <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1">
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
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
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

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="flex-shrink-0"
          >
            <EditorSidebar onClose={() => setShowSettings(false)} />
          </motion.div>
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

      {!activeWidget && (
        <div className="fixed right-8 bottom-48 z-[60] flex flex-col items-end gap-4 overflow-visible">
          <div className="bg-white rounded-2xl shadow-2xl border border-outline-variant/10 p-2 flex flex-col gap-1 w-12 hover:w-48 transition-all duration-300 group overflow-hidden">
            {([
              { icon: BarChart3, label: 'Chart', kind: 'chart' as const },
              { icon: MapIcon, label: 'Map', kind: 'map' as const },
              { icon: LayoutIcon, label: 'KPI Card', kind: 'kpi' as const },
              { icon: TableIcon, label: 'Table', kind: 'table' as const },
              { icon: TypeIcon, label: 'Text', kind: 'text' as const },
              { icon: ImageIcon, label: 'Image', kind: 'image' as const },
            ]).map((tool) => (
              <button
                key={tool.label}
                onClick={() => addWidget(tool.kind)}
                className="flex items-center gap-4 p-3 hover:bg-primary/5 rounded-xl transition-all w-full text-left active:scale-95"
              >
                <tool.icon className="w-5 h-5 text-primary shrink-0" />
                <span className="font-bold text-xs uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">{tool.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => addWidget('chart')}
            className="w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-90 transition-transform"
            aria-label="Add chart"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
