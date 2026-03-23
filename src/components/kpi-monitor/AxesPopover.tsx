import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '../ui/switch';
import { Axis3D } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetAxisConfig } from './GraphSettingsPanel';

const DEFAULT_AXIS: WidgetAxisConfig = {
  yTitle: '', yMin: 'auto', yMax: 'auto', yUnit: '', yDecimals: 2, yInvert: false,
  xMode: 'date', xFormat: 'short', xShowGrid: false,
};

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 min-h-[32px]">
    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input {...props} className={cn('h-[30px] px-2 rounded-lg border border-border/50 bg-background text-[11px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all', className || 'w-[72px]')} />
);

const SmallSelect: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }> = ({ value, options, onChange, className }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className={cn('h-[30px] px-2 rounded-lg border border-border/50 bg-background text-[11px] text-foreground outline-none focus:border-primary/40 cursor-pointer transition-all appearance-none', className || 'w-[80px]')}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

interface AxesPopoverProps {
  axisConfig?: WidgetAxisConfig;
  onAxisConfigChange?: (c: WidgetAxisConfig) => void;
}

export const AxesCard: React.FC<AxesPopoverProps> = ({ axisConfig: ext, onAxisConfigChange }) => {
  const axis = ext || DEFAULT_AXIS;
  const set = (u: Partial<WidgetAxisConfig>) => onAxisConfigChange?.({ ...axis, ...u });

  return (
    <div className="space-y-2 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <Axis3D className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Axes</span>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Axe Y</p>
      <FieldRow label="Titre"><SmallInput value={axis.yTitle} onChange={e => set({ yTitle: e.target.value })} className="w-[80px]" /></FieldRow>
      <FieldRow label="Min"><SmallInput type="number" value={axis.yMin === 'auto' ? '' : String(axis.yMin)} placeholder="Auto" onChange={e => set({ yMin: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[72px]" /></FieldRow>
      <FieldRow label="Max"><SmallInput type="number" value={axis.yMax === 'auto' ? '' : String(axis.yMax)} placeholder="Auto" onChange={e => set({ yMax: e.target.value === '' ? 'auto' : Number(e.target.value) })} className="w-[72px]" /></FieldRow>
      <FieldRow label="Unité"><SmallSelect value={axis.yUnit} options={[{ value: '', label: 'Auto' }, { value: '%', label: '%' }, { value: 'Mbps', label: 'Mbps' }, { value: 'ms', label: 'ms' }, { value: 'GB', label: 'GB' }, { value: 'k', label: 'k' }]} onChange={v => set({ yUnit: v })} /></FieldRow>
      <FieldRow label="Décimales"><SmallSelect value={String(axis.yDecimals)} options={[{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} onChange={v => set({ yDecimals: Number(v) })} /></FieldRow>
      <div className="flex items-center justify-between min-h-[32px]">
        <span className="text-[11px] text-muted-foreground">Inverser</span>
        <Switch checked={axis.yInvert} onCheckedChange={v => set({ yInvert: v })} className="h-4 w-7 data-[state=checked]:bg-primary" />
      </div>
      {/* Axe X removed — date controlled from top bar */}
    </div>
  );
};

const AxesPopover: React.FC<AxesPopoverProps> = (props) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
        <Axis3D className="w-3 h-3" />
        <span className="hidden sm:inline">Axes</span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-[240px] p-4" align="start" sideOffset={8}>
      <AxesCard {...props} />
    </PopoverContent>
  </Popover>
);

export default AxesPopover;
