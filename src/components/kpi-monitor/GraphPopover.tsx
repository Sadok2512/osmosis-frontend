import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '../ui/switch';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetGraphConfig } from './GraphSettingsPanel';

const DEFAULT_GRAPH: WidgetGraphConfig = {
  smooth: true, lineWidth: 2.5, showSymbols: false,
  gridIntensity: 'light', showVerticalGrid: false,
  backgroundColor: 'transparent', transparentBg: true,
  showLegend: false, legendPosition: 'bottom',
};

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 min-h-[32px]">
    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const SmallSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className={cn('h-[30px] px-2 rounded-lg border border-border/50 bg-background text-[11px] text-foreground outline-none focus:border-primary/40 cursor-pointer transition-all appearance-none', className || 'w-[80px]')}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

interface GraphPopoverProps {
  graphConfig?: WidgetGraphConfig;
  onGraphConfigChange?: (c: WidgetGraphConfig) => void;
}

export const GraphCard: React.FC<GraphPopoverProps> = ({ graphConfig: ext, onGraphConfigChange }) => {
  const graph = ext || DEFAULT_GRAPH;
  const set = (u: Partial<WidgetGraphConfig>) => onGraphConfigChange?.({ ...graph, ...u });

  return (
    <div className="space-y-2 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Graph</span>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Ligne</p>
      <div className="flex items-center justify-between min-h-[32px]">
        <span className="text-[11px] text-muted-foreground">Lissage</span>
        <Switch checked={graph.smooth} onCheckedChange={v => set({ smooth: v })} className="h-4 w-7 data-[state=checked]:bg-primary" />
      </div>
      <FieldRow label="Épaisseur"><SmallSelect value={String(graph.lineWidth)} options={[{ value: '1', label: '1px' }, { value: '1.5', label: '1.5px' }, { value: '2', label: '2px' }, { value: '2.5', label: '2.5px' }, { value: '3', label: '3px' }]} onChange={v => set({ lineWidth: Number(v) })} /></FieldRow>
      <div className="flex items-center justify-between min-h-[32px]">
        <span className="text-[11px] text-muted-foreground">Symboles</span>
        <Switch checked={graph.showSymbols} onCheckedChange={v => set({ showSymbols: v })} className="h-4 w-7 data-[state=checked]:bg-primary" />
      </div>
      <div className="pt-2 border-t border-border/30">
        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-1.5">Grille</p>
        <FieldRow label="Intensité"><SmallSelect value={graph.gridIntensity} options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }]} onChange={v => set({ gridIntensity: v as any })} /></FieldRow>
        <div className="flex items-center justify-between min-h-[32px]">
          <span className="text-[11px] text-muted-foreground">Grille V</span>
          <Switch checked={graph.showVerticalGrid} onCheckedChange={v => set({ showVerticalGrid: v })} className="h-4 w-7 data-[state=checked]:bg-primary" />
        </div>
      </div>
      <div className="pt-2 border-t border-border/30">
        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-1.5">Fond</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Couleur</span>
          <div className="flex gap-1.5">
            {['transparent', '#f8fafc', '#0f172a'].map(c => (
              <button key={c} onClick={() => set({ backgroundColor: c, transparentBg: c === 'transparent' })}
                className={cn('w-6 h-6 rounded-md border transition-all', (graph.backgroundColor === c || (c === 'transparent' && graph.transparentBg)) ? 'border-primary ring-1 ring-primary/30' : 'border-border/40')}
                style={{ backgroundColor: c === 'transparent' ? undefined : c }}>
                {c === 'transparent' && <span className="text-[8px] text-muted-foreground">T</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="pt-2 border-t border-border/30">
        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-1.5">Légende</p>
        <div className="flex items-center justify-between min-h-[32px]">
          <span className="text-[11px] text-muted-foreground">Afficher</span>
          <Switch checked={graph.showLegend} onCheckedChange={v => set({ showLegend: v })} className="h-4 w-7 data-[state=checked]:bg-primary" />
        </div>
        {graph.showLegend && (
          <FieldRow label="Position"><SmallSelect value={graph.legendPosition} options={[{ value: 'top', label: 'Haut' }, { value: 'bottom', label: 'Bas' }]} onChange={v => set({ legendPosition: v as any })} /></FieldRow>
        )}
      </div>
    </div>
  );
};

const GraphPopover: React.FC<GraphPopoverProps> = (props) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
        <Settings2 className="w-3 h-3" />
        <span className="hidden sm:inline">Graph</span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-[240px] p-4" align="start" sideOffset={8}>
      <GraphCard {...props} />
    </PopoverContent>
  </Popover>
);

export default GraphPopover;
