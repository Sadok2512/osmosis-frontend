import { useState } from 'react';
import {
  Layout,
  Edit3,
  Settings,
  ChevronDown,
  X,
  Plus,
  Trash2,
  GripHorizontal,
  Activity,
  BarChart3,
  Map as MapIcon,
  Table as TableIcon,
  CircleCheck,
  Radio,
  TowerControl as Tower,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ViewMode } from '../types';
import { cn } from '@/lib/utils';
import EditorSidebar from './EditorSidebar';
import PAEChart from './PAEChart';
import PAToolbar from './PAToolbar';
import PAMapWidget from './PAMapWidget';
import PATableWidget from './PATableWidget';

interface EditorViewProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

type WidgetKind = 'chart' | 'map' | 'kpi' | 'table';
interface DynWidget { id: string; kind: WidgetKind; }

export default function EditorView({ projectName, onProjectNameChange, onViewModeChange }: EditorViewProps) {
  const [activeWidget, setActiveWidget] = useState<string | null>('Traffic Load');
  const [showSettings, setShowSettings] = useState(true);
  const [widgets, setWidgets] = useState<DynWidget[]>([]);

  const addWidget = (kind: WidgetKind) => {
    setWidgets(w => [...w, { id: `${kind}-${Date.now()}`, kind }]);
  };
  const removeWidget = (id: string) => setWidgets(w => w.filter(x => x.id !== id));

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
            {[
              { icon: Activity, label: 'Network Health', active: true },
              { icon: BarChart3, label: 'Traffic' },
              { icon: ShieldAlert, label: 'Interference', color: 'text-tertiary' },
              { icon: Tower, label: 'Mobility' },
              { icon: CircleCheck, label: 'Accessibility' },
            ].map((item) => (
              <button
                key={item.label}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-headline text-sm font-bold transition-all",
                  item.active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-outline-variant/10">
          <button className="w-full flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-xl text-primary font-bold hover:bg-surface-container-highest transition-colors active:scale-95">
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
            <button className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary-container active:scale-95 transition-all">
              Save
            </button>
          </div>
        </header>

        <PAToolbar />

        <div className="flex-grow p-12 relative overflow-y-auto blueprint-grid custom-scrollbar">
          <div className="grid grid-cols-12 gap-6 relative z-10 max-w-7xl mx-auto">
            {widgets.length === 0 && (
              <div className="col-span-12">
                <div className="bg-white/40 border-2 border-dashed border-outline-variant/60 p-16 rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-primary">
                    <Plus className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-on-surface mb-1">Empty canvas</h3>
                    <p className="text-xs font-bold text-on-surface-variant max-w-md">
                      Use the floating toolbox on the right to add a Chart, Map, KPI Card or Table.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {widgets.map(w => (
              <div key={w.id} className={cn(
                w.kind === 'kpi' ? 'col-span-12 md:col-span-3' : 'col-span-12 md:col-span-6'
              )}>
                <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 p-4 group relative">
                  <button
                    onClick={() => removeWidget(w.id)}
                    className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-white shadow-md border border-outline-variant/20 flex items-center justify-center text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100 z-10"
                    aria-label="Remove widget"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {w.kind === 'chart' && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-on-surface font-headline">New Chart</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ECharts</span>
                      </div>
                      <div className="h-56"><PAEChart variant="editor" height="100%" /></div>
                    </>
                  )}
                  {w.kind === 'map' && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-on-surface font-headline">New Map</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Geo sites</span>
                      </div>
                      <div className="h-56"><PAMapWidget height="100%" /></div>
                    </>
                  )}
                  {w.kind === 'table' && <PATableWidget height={300} />}
                  {w.kind === 'kpi' && (
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">New KPI</h3>
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
        </div>

        <div className="h-80 bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0">
          <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
              <div className="h-4 w-px bg-outline-variant" />
              <h4 className="font-headline font-bold text-on-surface text-sm">{activeWidget}</h4>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors">Reset</button>
              <button
                onClick={() => setActiveWidget(null)}
                className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex h-full pb-10">
            <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1">
              {[
                { label: 'Data Source', active: true },
                { label: 'Appearance' },
                { label: 'Interactions' },
                { label: 'Alerting' },
              ].map((tab) => (
                <button
                  key={tab.label}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                    tab.active ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </aside>
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl">
                <div className="flex gap-8 mb-8 border-b border-outline-variant/20">
                  <button className="pb-4 border-b-2 border-primary text-primary text-xs font-bold uppercase tracking-widest">Table Data</button>
                  <button className="pb-4 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-on-surface transition-colors">KPI Breakdown</button>
                  <button className="pb-4 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-on-surface transition-colors">Source Logs</button>
                </div>

                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Metrics</label>
                      <div className="flex flex-wrap gap-2">
                        {['Avg Throughput', 'Peak User Count'].map((m) => (
                          <span key={m} className="px-3 py-1.5 rounded-xl bg-surface-container-high flex items-center gap-2 text-xs font-bold text-on-surface">
                            {m}
                            <X className="w-3 h-3 text-on-surface-variant cursor-pointer hover:text-error" />
                          </span>
                        ))}
                        <button className="px-3 py-1.5 rounded-xl border-2 border-dashed border-outline-variant text-primary text-xs font-bold hover:border-primary/50 transition-colors">+ Add Metric</button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Aggregation</label>
                      <select className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:outline-none transition-all text-xs font-bold p-2 cursor-pointer">
                        <option>Mean (Average)</option>
                        <option>Sum</option>
                        <option>95th Percentile</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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

      <div className="fixed right-8 bottom-48 z-[60] flex flex-col items-end gap-4 overflow-visible">
        <div className="bg-white rounded-2xl shadow-2xl border border-outline-variant/10 p-2 flex flex-col gap-1 w-12 hover:w-48 transition-all duration-300 group overflow-hidden">
          {([
            { icon: BarChart3, label: 'Chart', kind: 'chart' as const },
            { icon: MapIcon, label: 'Map', kind: 'map' as const },
            { icon: Layout, label: 'KPI Card', kind: 'kpi' as const },
            { icon: TableIcon, label: 'Table', kind: 'table' as const },
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
    </div>
  );
}
