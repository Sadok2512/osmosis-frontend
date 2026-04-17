import {
  X,
  ChevronDown,
  Maximize2 as FullWidth,
  RefreshCcw as Reset,
  Check as Apply,
  LineChart as LucideLine,
  AreaChart as LucideArea,
  BarChart3 as LucideBar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorSidebarProps {
  onClose: () => void;
}

export default function EditorSidebar({ onClose }: EditorSidebarProps) {
  return (
    <aside className="w-[400px] bg-white h-full shadow-2xl z-50 border-l border-outline-variant/20 flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/10">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Configuring</p>
          <h3 className="text-lg font-black font-headline text-on-surface">Traffic Load</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        <section>
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-3 block">Visualization</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: LucideLine, label: 'Line', active: true },
              { icon: LucideArea, label: 'Area' },
              { icon: LucideBar, label: 'Bar' },
            ].map((item) => (
              <button
                key={item.label}
                className={cn(
                  "flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all",
                  item.active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-3 block">Aggregation</label>
          <button className="w-full flex items-center justify-between bg-surface-container-low px-4 py-3 rounded-xl text-sm font-bold text-on-surface hover:bg-surface-container-high transition-colors">
            <span>Mean (Average)</span>
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          </button>
        </section>

        <section>
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-3 block">Width</label>
          <button className="w-full flex items-center justify-center gap-2 bg-surface-container-low px-4 py-3 rounded-xl text-sm font-bold text-on-surface hover:bg-surface-container-high transition-colors">
            <FullWidth className="w-4 h-4" />
            Full Width
          </button>
        </section>

        <section>
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-3 block">Threshold</label>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue="75"
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-2 font-bold">
            <span>0%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </section>
      </div>

      <div className="flex gap-2 p-4 border-t border-outline-variant/10 bg-surface-container-low">
        <button className="flex-1 py-4 text-xs font-black uppercase tracking-widest border-2 border-outline-variant/30 text-on-surface-variant rounded-2xl hover:bg-primary/5 transition-all active:scale-95 flex items-center justify-center gap-2">
          <Reset className="w-4 h-4" />
          Reset
        </button>
        <button className="flex-1 py-4 text-xs font-black uppercase tracking-widest bg-primary text-on-primary rounded-2xl transition-all active:scale-95 shadow-xl shadow-primary/30 flex items-center justify-center gap-2">
          <Apply className="w-4 h-4" />
          Apply
        </button>
      </div>
    </aside>
  );
}
