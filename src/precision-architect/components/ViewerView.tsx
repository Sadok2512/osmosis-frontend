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

  const focusSection = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const layout = useMemo(() => widgets.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    static: true,
  })), [widgets]);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-8 py-4 border-b border-outline-variant/10">
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
        <div className="border-b border-outline-variant/10 bg-white/60 px-8">
          <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto">
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

      <div className="max-w-7xl mx-auto p-8 flex gap-6">
        {sections.length > 0 && (
          <aside className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-2 mb-2">Sections</p>
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => focusSection(s.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-primary/5 hover:text-primary transition-colors text-left"
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{s.name || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Live Report</p>
            <h2 className="text-4xl font-black font-headline tracking-tighter">{activePage?.name ?? 'Overview'}</h2>
          </div>

          {sections.length > 0 && (
            <div className="space-y-4">
              {sections.map((s) => (
                <SectionBlock key={s.id} section={s} editable={false} />
              ))}
            </div>
          )}

          {widgets.length === 0 && sections.length === 0 ? (
            <div className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-16 text-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-on-surface mb-1">No content on this page</h3>
              <p className="text-xs font-bold text-on-surface-variant">Switch to Edit mode to start building.</p>
            </div>
          ) : widgets.length > 0 && (
            <div className="pa-grid-view">
              <GridLayout
                className="layout"
                layout={layout}
                cols={COLS}
                rowHeight={ROW_HEIGHT}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                isDraggable={false}
                isResizable={false}
              >
                {widgets.map(w => (
                  <div key={w.id} className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 p-4 overflow-hidden">
                    <WidgetRenderer widget={w} />
                  </div>
                ))}
              </GridLayout>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
