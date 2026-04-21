import { useMemo } from 'react';
import { Eye, Edit3, Play, FileText } from 'lucide-react';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ViewMode, PAPage } from '../types';
import { cn } from '@/lib/utils';
import WidgetRenderer from './WidgetRenderer';
import SectionBlock from './SectionBlock';

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
  const widthClass = theme?.pageWidth === 'full' ? 'max-w-none' : 'max-w-7xl';
  const headerAlign = theme?.headerAlign === 'center' ? 'text-center' : theme?.headerAlign === 'right' ? 'text-right' : 'text-left';
  const showHeader = theme?.showPageHeader && (theme?.pageTitle || theme?.pageSubtitle);

  const layout = useMemo(() => widgets.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    static: true,
  })), [widgets]);

  return (
    <div className="h-screen flex flex-col bg-surface text-on-surface overflow-hidden">
      <header className="bg-white/80 backdrop-blur-xl flex-shrink-0 flex justify-between items-center w-full px-8 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-6">
          <span className="text-xl font-bold text-primary font-headline tracking-tight">Precision Architect</span>
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
          <div className="w-full flex items-center gap-1 overflow-x-auto">
            {pages.map(page => (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={cn(
                  "px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
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

      <div
        className="flex-grow overflow-y-auto custom-scrollbar"
        style={{ backgroundColor: pageBg, color: textColor, padding: `${padding}px` }}
      >
        <main className={cn('w-full min-w-0 mx-auto space-y-6', widthClass)}>
          {showHeader ? (
            <header className={cn('w-full', headerAlign)} style={{ color: textColor }}>
              {theme?.pageTitle && (
                <h1 className="text-3xl font-black font-headline" style={{ color: titleColor }}>{theme.pageTitle}</h1>
              )}
              {theme?.pageSubtitle && (
                <p className="text-sm mt-2 opacity-80">{theme.pageSubtitle}</p>
              )}
            </header>
          ) : (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: titleColor }}>Live Report</p>
              <h2 className="text-3xl sm:text-4xl font-black font-headline tracking-tighter" style={{ color: titleColor }}>{activePage?.name ?? 'Overview'}</h2>
            </div>
          )}

          {widgets.length === 0 && sections.length === 0 ? (
            <div className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-16 text-center">
              <h3 className="text-sm font-black uppercase tracking-widest mb-1" style={{ color: textColor }}>No content on this page</h3>
              <p className="text-xs font-bold opacity-70" style={{ color: textColor }}>Switch to Edit mode to start building.</p>
            </div>
          ) : widgets.length > 0 && (
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
              >
                {widgets.map(w => (
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

          {/* Sections render after widgets so they appear at the bottom of the page. */}
          {sections.length > 0 && (
            <div className="space-y-4">
              {sections.map((s) => (
                <SectionBlock key={s.id} section={s} editable={false} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
