import { useMemo } from 'react';
import { Eye, Edit3, Play, FileText } from 'lucide-react';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ViewMode, PAPage } from '../types';
import { cn } from '@/lib/utils';
import WidgetRenderer from './WidgetRenderer';
import SectionBlock from './SectionBlock';
import ReportHeader from './ReportHeader';

const GridLayout = WidthProvider(ReactGridLayout);

interface ViewerProps {
  projectName: string;
  onViewModeChange: (mode: ViewMode) => void;
  pages: PAPage[];
  activePageId: string;
  setActivePageId: (id: string) => void;
}

const COLS = 12;
const ROW_HEIGHT = 60;

export default function ViewerView({ projectName, onViewModeChange, pages, activePageId, setActivePageId }: ViewerProps) {
  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const widgets = activePage?.widgets ?? [];
  const sections = activePage?.sections ?? [];
  const theme = activePage?.theme;
  const pageBg = theme?.backgroundColor || (theme?.background === 'dark' ? '#0f172a' : theme?.background === 'gradient' ? '#1a1a2e' : undefined);
  const cardBg = theme?.cardColor || '#ffffff';
  const titleColor = theme?.titleColor || theme?.accentColor;
  const textColor = theme?.textColor;
  const radius = theme?.borderRadius ?? 16;
  const spacing = theme?.spacing ?? 16;
  const padding = theme?.pagePadding ?? 32;
  const widthClass = theme?.pageWidth === 'full' ? 'max-w-none' : 'max-w-[1760px]';
  const headerAlign = theme?.headerAlign === 'center' ? 'text-center' : theme?.headerAlign === 'right' ? 'text-right' : 'text-left';
  const showHeader = theme?.showPageHeader && (theme?.pageTitle || theme?.pageSubtitle);

  const unassignedWidgets = useMemo(() => widgets.filter(w => !w.sectionId), [widgets]);
  const widgetsBySection = useMemo(() => {
    const map = new Map<string, typeof widgets>();
    for (const w of widgets) {
      if (!w.sectionId) continue;
      if (!map.has(w.sectionId)) map.set(w.sectionId, []);
      map.get(w.sectionId)!.push(w);
    }
    return map;
  }, [widgets]);

  const buildLayout = (group: typeof widgets) => group.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    static: true,
  }));

  const layout = useMemo(() => buildLayout(unassignedWidgets), [unassignedWidgets]);

  return (
    <div className="h-screen flex flex-col bg-surface text-on-surface overflow-hidden">
      <header className="bg-white/80 backdrop-blur-xl flex-shrink-0 flex justify-between items-center w-full px-8 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-6">
          <span className="text-xl font-bold text-primary font-headline tracking-tight">Netview</span>
          <div className="h-6 w-px bg-outline-variant/30" />
          <h1 className="font-headline font-bold text-on-surface text-lg">{projectName}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface-container-high p-1 rounded-full flex items-center shadow-inner">
            <button
              onClick={() => onViewModeChange('edit')}
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
            <button className="px-4 py-1.5 text-sm font-bold bg-white shadow-sm rounded-full text-primary flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            <button
              onClick={() => onViewModeChange('presentation')}
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5" /> Present
            </button>
          </div>
        </div>
      </header>

      {pages.length > 1 && (
        <div className="border-b border-outline-variant/10 bg-white/60 px-4 sm:px-6 lg:px-10">
          <div className="w-full flex items-center gap-2 overflow-x-auto">
            {pages.map(page => (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={cn(
                  "px-6 py-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
                  page.id === activePageId
                    ? "border-primary text-primary"
                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                )}
              >
                {page.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-grow flex overflow-hidden">
        {/* Left sidebar: section navigation */}
        {sections.length > 0 && (
          <aside className="w-60 flex-shrink-0 border-r border-outline-variant/10 bg-white/60 backdrop-blur-sm overflow-y-auto custom-scrollbar">
            <div className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3 px-2">
                Sections
              </p>
              <nav className="flex flex-col gap-1">
                {sections.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const el = document.getElementById(`section-${s.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-left px-3 py-2 rounded-lg hover:bg-primary/5 group transition-colors flex items-start gap-2"
                  >
                    <span className="text-[10px] font-black text-on-surface-variant/50 mt-0.5 w-5 flex-shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      {s.name && (
                        <div className="text-[10px] font-black uppercase tracking-widest text-primary truncate">
                          {s.name}
                        </div>
                      )}
                      <div className="text-xs font-bold text-on-surface group-hover:text-primary truncate">
                        {s.title || s.name || 'Untitled section'}
                      </div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        )}

        <div
          className="flex-grow overflow-y-auto custom-scrollbar"
          style={{ backgroundColor: pageBg, color: textColor, padding: `${padding}px` }}
        >
          <main className={cn('w-full min-w-0 mx-auto space-y-6', widthClass)}>
            <ReportHeader theme={theme} projectName={projectName} pageName={activePage?.name} size="md" />

            {widgets.length === 0 && sections.length === 0 ? (
              <div className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-16 text-center">
                <h3 className="text-sm font-black uppercase tracking-widest mb-1" style={{ color: textColor }}>No content on this page</h3>
                <p className="text-xs font-bold opacity-70" style={{ color: textColor }}>Switch to Edit mode to start building.</p>
              </div>
            ) : (
              <>
                {/* Unassigned widgets render at the top (legacy widgets without a sectionId). */}
                {unassignedWidgets.length > 0 && (
                  <div className="pa-grid-view w-full">
                    <GridLayout
                      className="layout"
                      layout={layout}
                      cols={COLS}
                      rowHeight={ROW_HEIGHT}
                      margin={[spacing, spacing]}
                      containerPadding={[0, 0]}
                      isDraggable={false}
                      isResizable={false}
                      autoSize
                    >
                      {unassignedWidgets.map(w => (
                        <div
                          key={w.id}
                          className={cn(
                            'overflow-hidden p-4',
                            w.transparentBg ? 'border-0 shadow-none' : 'shadow-sm border border-outline-variant/10'
                          )}
                          style={{ backgroundColor: w.transparentBg ? 'transparent' : cardBg, borderRadius: radius }}
                        >
                          <WidgetRenderer widget={w} />
                        </div>
                      ))}
                    </GridLayout>
                  </div>
                )}

                {/* Sections with their owned widgets, rendered inline. */}
                {sections.length > 0 && (
                  <div className="space-y-6">
                    {sections.map((s) => {
                      const sectionWidgets = widgetsBySection.get(s.id) ?? [];
                      const sectionLayout = buildLayout(sectionWidgets);
                      return (
                        <div key={s.id} className="space-y-3">
                          <SectionBlock section={s} editable={false} />
                          {sectionWidgets.length > 0 && (
                            <div className="pa-grid-view w-full">
                              <GridLayout
                                className="layout"
                                layout={sectionLayout}
                                cols={COLS}
                                rowHeight={ROW_HEIGHT}
                                margin={[spacing, spacing]}
                                containerPadding={[0, 0]}
                                isDraggable={false}
                                isResizable={false}
                                autoSize
                              >
                                {sectionWidgets.map(w => (
                                  <div
                                    key={w.id}
                                    className={cn(
                                      'overflow-hidden p-4',
                                      w.transparentBg ? 'border-0 shadow-none' : 'shadow-sm border border-outline-variant/10'
                                    )}
                                    style={{ backgroundColor: w.transparentBg ? 'transparent' : cardBg, borderRadius: radius }}
                                  >
                                    <WidgetRenderer widget={w} />
                                  </div>
                                ))}
                              </GridLayout>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
