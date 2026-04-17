import { Eye, Edit3, Play } from 'lucide-react';
import { ViewMode, PAPage } from '../types';
import { cn } from '@/lib/utils';
import PAEChart from './PAEChart';
import PAMapWidget from './PAMapWidget';
import PATableWidget from './PATableWidget';

interface ViewerProps {
  projectName: string;
  onViewModeChange: (mode: ViewMode) => void;
  pages: PAPage[];
  activePageId: string;
  setActivePageId: (id: string) => void;
}

export default function ViewerView({ projectName, onViewModeChange, pages, activePageId, setActivePageId }: ViewerProps) {
  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const widgets = activePage?.widgets ?? [];

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

      <main className="max-w-7xl mx-auto p-8 space-y-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Live Report</p>
          <h2 className="text-4xl font-black font-headline tracking-tighter">{activePage?.name ?? 'Overview'}</h2>
        </div>

        {widgets.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-16 text-center">
            <h3 className="text-sm font-black uppercase tracking-widest text-on-surface mb-1">No widgets on this page</h3>
            <p className="text-xs font-bold text-on-surface-variant">Switch to Edit mode to start building.</p>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {widgets.map(w => (
              <div key={w.id} className={cn(
                w.kind === 'kpi' ? 'col-span-12 md:col-span-3' : 'col-span-12 md:col-span-6'
              )}>
                <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 p-4">
                  {w.kind === 'chart' && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-on-surface font-headline">Chart</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ECharts</span>
                      </div>
                      <div className="h-56"><PAEChart variant="editor" height="100%" /></div>
                    </>
                  )}
                  {w.kind === 'map' && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-on-surface font-headline">Map</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Geo sites</span>
                      </div>
                      <div className="h-56"><PAMapWidget height="100%" /></div>
                    </>
                  )}
                  {w.kind === 'table' && <PATableWidget height={300} />}
                  {w.kind === 'kpi' && (
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">KPI</h3>
                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/40" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black font-headline tracking-tighter text-on-surface">94.6%</span>
                        <span className="text-xs font-bold text-emerald-600">+1.2%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
