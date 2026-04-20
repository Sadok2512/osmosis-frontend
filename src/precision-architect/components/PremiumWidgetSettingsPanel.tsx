import { useState, useEffect } from 'react';
import { X, Type as TypeIcon, Palette, AlignLeft, AlignCenter, AlignRight, Minus } from 'lucide-react';
import {
  DynWidget,
  HeroWidgetConfig,
  StatWidgetConfig,
  DividerWidgetConfig,
  HeroAlign,
  HeroSize,
  StatTheme,
  DEFAULT_HERO_CONFIG,
  DEFAULT_STAT_CONFIG,
  DEFAULT_DIVIDER_CONFIG,
} from '../types';
import { cn } from '@/lib/utils';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

/**
 * Unified settings panel for the manually-edited "premium" widgets:
 * Hero Title, KPI Stat Card, and Section Divider. All fields are local,
 * no backend, no Apply button — changes are reflected live.
 */
export default function PremiumWidgetSettingsPanel({ widget, onChange, onClose }: Props) {
  const kind = widget.kind;
  const widgetLabel = `${kind.toUpperCase()} · ${widget.id.slice(0, 18)}`;

  return (
    <div className="h-[clamp(20rem,50vh,38rem)] bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0 flex flex-col">
      {/* Header */}
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Widget Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">{widgetLabel}</h4>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (kind === 'hero') onChange({ heroConfig: { ...DEFAULT_HERO_CONFIG } });
              if (kind === 'stat') onChange({ statConfig: { ...DEFAULT_STAT_CONFIG } });
              if (kind === 'divider') onChange({ dividerConfig: { ...DEFAULT_DIVIDER_CONFIG } });
            }}
            className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-3xl mx-auto">
          {kind === 'hero' && (
            <HeroEditor
              cfg={widget.heroConfig ?? DEFAULT_HERO_CONFIG}
              onUpdate={(c) => onChange({ heroConfig: c })}
            />
          )}
          {kind === 'stat' && (
            <StatEditor
              cfg={widget.statConfig ?? DEFAULT_STAT_CONFIG}
              onUpdate={(c) => onChange({ statConfig: c })}
            />
          )}
          {kind === 'divider' && (
            <DividerEditor
              cfg={widget.dividerConfig ?? DEFAULT_DIVIDER_CONFIG}
              onUpdate={(c) => onChange({ dividerConfig: c })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ----- Hero editor ----- */
function HeroEditor({ cfg, onUpdate }: { cfg: HeroWidgetConfig; onUpdate: (c: HeroWidgetConfig) => void }) {
  return (
    <div className="space-y-6">
      <Section icon={<TypeIcon className="w-4 h-4" />} title="Content">
        <Field label="Eyebrow (small label above)">
          <input
            type="text"
            value={cfg.eyebrow ?? ''}
            placeholder="LIVE P+ VIEW"
            onChange={(e) => onUpdate({ ...cfg, eyebrow: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => onUpdate({ ...cfg, title: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-bold focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Subtitle">
          <textarea
            value={cfg.subtitle}
            rows={3}
            onChange={(e) => onUpdate({ ...cfg, subtitle: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary resize-none"
          />
        </Field>
      </Section>

      <Section icon={<Palette className="w-4 h-4" />} title="Appearance">
        <Field label="Size">
          <SegmentControl
            value={cfg.size}
            options={[
              { value: 'sm' as HeroSize, label: 'S' },
              { value: 'md' as HeroSize, label: 'M' },
              { value: 'lg' as HeroSize, label: 'L' },
              { value: 'xl' as HeroSize, label: 'XL' },
            ]}
            onChange={(size) => onUpdate({ ...cfg, size })}
          />
        </Field>
        <Field label="Alignment">
          <AlignControl value={cfg.align} onChange={(align) => onUpdate({ ...cfg, align })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title color">
            <ColorPicker value={cfg.titleColor || ''} onChange={(c) => onUpdate({ ...cfg, titleColor: c })} />
          </Field>
          <Field label="Subtitle color">
            <ColorPicker value={cfg.subtitleColor || ''} onChange={(c) => onUpdate({ ...cfg, subtitleColor: c })} />
          </Field>
        </div>
      </Section>
    </div>
  );
}

/* ----- Stat card editor ----- */
function StatEditor({ cfg, onUpdate }: { cfg: StatWidgetConfig; onUpdate: (c: StatWidgetConfig) => void }) {
  return (
    <div className="space-y-6">
      <Section icon={<TypeIcon className="w-4 h-4" />} title="Content">
        <Field label="Label">
          <input
            type="text"
            value={cfg.label}
            placeholder="PEAK RATE"
            onChange={(e) => onUpdate({ ...cfg, label: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
          />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Value">
            <input
              type="text"
              value={cfg.value}
              placeholder="1.42"
              onChange={(e) => onUpdate({ ...cfg, value: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm font-black focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Unit">
            <input
              type="text"
              value={cfg.unit}
              placeholder="Tb/s"
              onChange={(e) => onUpdate({ ...cfg, unit: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
        </div>
      </Section>

      <Section icon={<Palette className="w-4 h-4" />} title="Appearance">
        <Field label="Theme">
          <SegmentControl
            value={cfg.theme}
            options={[
              { value: 'light' as StatTheme, label: 'Light' },
              { value: 'dark' as StatTheme, label: 'Dark' },
              { value: 'glass' as StatTheme, label: 'Glass' },
            ]}
            onChange={(theme) => onUpdate({ ...cfg, theme })}
          />
        </Field>
        <Field label="Accent color">
          <ColorPicker value={cfg.accentColor || ''} onChange={(c) => onUpdate({ ...cfg, accentColor: c })} />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.showPulse}
            onChange={(e) => onUpdate({ ...cfg, showPulse: e.target.checked })}
            className="rounded border-outline-variant/40"
          />
          <span className="text-xs font-bold text-on-surface">Show pulse "Live" indicator</span>
        </label>
      </Section>
    </div>
  );
}

/* ----- Divider editor ----- */
function DividerEditor({ cfg, onUpdate }: { cfg: DividerWidgetConfig; onUpdate: (c: DividerWidgetConfig) => void }) {
  return (
    <div className="space-y-6">
      <Section icon={<TypeIcon className="w-4 h-4" />} title="Content">
        <Field label="Label (optional)">
          <input
            type="text"
            value={cfg.label ?? ''}
            placeholder="Section name"
            onChange={(e) => onUpdate({ ...cfg, label: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
          />
        </Field>
      </Section>

      <Section icon={<Minus className="w-4 h-4" />} title="Style">
        <Field label="Line style">
          <SegmentControl
            value={cfg.style}
            options={[
              { value: 'solid' as const, label: 'Solid' },
              { value: 'dashed' as const, label: 'Dashed' },
              { value: 'dotted' as const, label: 'Dotted' },
              { value: 'gradient' as const, label: 'Gradient' },
            ]}
            onChange={(style) => onUpdate({ ...cfg, style })}
          />
        </Field>
        <Field label={`Thickness · ${cfg.thickness}px`}>
          <input
            type="range"
            min={1}
            max={6}
            value={cfg.thickness}
            onChange={(e) => onUpdate({ ...cfg, thickness: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>
        <Field label="Alignment">
          <AlignControl value={cfg.align} onChange={(align) => onUpdate({ ...cfg, align })} />
        </Field>
        <Field label="Color">
          <ColorPicker value={cfg.color || ''} onChange={(c) => onUpdate({ ...cfg, color: c })} />
        </Field>
      </Section>
    </div>
  );
}

/* ----- Reusable form primitives ----- */
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h5 className="text-[10px] font-black uppercase tracking-widest text-on-surface">{title}</h5>
        <div className="flex-1 h-px bg-outline-variant/20" />
      </div>
      <div className="space-y-3 pl-1">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/20">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all',
            value === opt.value ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AlignControl({ value, onChange }: { value: HeroAlign; onChange: (v: HeroAlign) => void }) {
  const opts: { v: HeroAlign; icon: React.ReactNode }[] = [
    { v: 'left', icon: <AlignLeft className="w-3.5 h-3.5" /> },
    { v: 'center', icon: <AlignCenter className="w-3.5 h-3.5" /> },
    { v: 'right', icon: <AlignRight className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="inline-flex bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/20">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'p-2 rounded-md transition-all',
            value === o.v ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={local || '#00685f'}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        className="w-9 h-9 rounded-lg border border-outline-variant/30 cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={local}
        placeholder="auto (theme)"
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-xs font-mono focus:outline-none focus:border-primary"
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange(''); }}
          className="text-[10px] font-bold text-on-surface-variant hover:text-error transition-colors px-2"
        >
          Clear
        </button>
      )}
    </div>
  );
}
