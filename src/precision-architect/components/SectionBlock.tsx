import { useState } from 'react';
import {
  Trash2,
  Type,
  Palette,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Settings2,
  GripVertical,
} from 'lucide-react';
import { PASection, PASectionFontFamily, PASectionTextStyle, PASectionAlign } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  section: PASection;
  editable: boolean;
  isActive?: boolean;
  isNew?: boolean;
  onChange?: (patch: Partial<PASection>) => void;
  onRemove?: () => void;
  /** Drag-and-drop reordering (edit mode only). */
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}

const STYLE_PRESETS: { id: PASectionTextStyle; label: string; titleSize: number; descSize: number }[] = [
  { id: 'heading', label: 'H1 — Heading', titleSize: 32, descSize: 14 },
  { id: 'subheading', label: 'H2 — Subheading', titleSize: 24, descSize: 13 },
  { id: 'body', label: 'H3 — Body', titleSize: 18, descSize: 14 },
  { id: 'quote', label: 'Quote', titleSize: 20, descSize: 16 },
  { id: 'callout', label: 'Callout', titleSize: 18, descSize: 14 },
];

const FONT_OPTIONS: { id: PASectionFontFamily; label: string; className: string }[] = [
  { id: 'sans', label: 'Sans', className: 'font-sans' },
  { id: 'serif', label: 'Serif', className: 'font-serif' },
  { id: 'mono', label: 'Mono', className: 'font-mono' },
  { id: 'display', label: 'Display', className: 'font-headline' },
];

const COLOR_SWATCHES = [
  '#0F172A', '#1E293B', '#475569', '#64748B',
  '#00685F', '#0EA5E9', '#6366F1', '#8B5CF6',
  '#EC4899', '#EF4444', '#F59E0B', '#10B981',
];

const BG_SWATCHES = [
  '', '#FFFFFF', '#F8FAFC', '#F1F5F9',
  '#FEF3C7', '#DBEAFE', '#DCFCE7', '#FCE7F3',
  '#0F172A', '#1E293B',
];

const SHADOW_CLASS: Record<NonNullable<PASection['shadow']>, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-xl',
};

/**
 * Editable text section. Displayed inline in the canvas and anchored
 * via id={`section-${section.id}`} so the sidebar can scroll to it.
 *
 * In edit mode it shows a contextual formatting toolbar (style, font,
 * size, color, alignment, weight, list, layout). In view mode the
 * formatting is applied but the toolbar is hidden.
 */
export default function SectionBlock({ section, editable, isActive, isNew, onChange, onRemove, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver }: Props) {
  const [openPanel, setOpenPanel] = useState<null | 'style' | 'font' | 'color' | 'bg' | 'layout'>(null);

  const fontFamily = section.fontFamily ?? 'sans';
  const fontClass = FONT_OPTIONS.find((f) => f.id === fontFamily)?.className ?? 'font-sans';
  const align: PASectionAlign = section.align ?? 'left';
  const titleSize = section.titleSize ?? 24;
  const descriptionSize = section.descriptionSize ?? 14;
  const titleColor = section.titleColor || undefined;
  const descColor = section.descriptionColor || undefined;
  const bgColor = section.backgroundColor || undefined;
  const bold = section.bold ?? true;
  const italic = section.italic ?? false;
  const underline = section.underline ?? false;
  const listStyle = section.listStyle ?? 'none';
  const padding = section.padding ?? 24;
  const radius = section.radius ?? 16;
  const borderWidth = section.borderWidth ?? 1;
  const borderColor = section.borderColor || undefined;
  const shadow = section.shadow ?? 'sm';
  const fullWidth = section.fullWidth ?? false;

  const alignClass =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  const togglePanel = (p: typeof openPanel) => setOpenPanel((prev) => (prev === p ? null : p));

  const applyPreset = (preset: PASectionTextStyle) => {
    const p = STYLE_PRESETS.find((x) => x.id === preset)!;
    onChange?.({ textStyle: preset, titleSize: p.titleSize, descriptionSize: p.descSize });
    setOpenPanel(null);
  };

  // Render description: if listStyle is bullet/numbered, split lines into <li>.
  const renderDescription = () => {
    if (listStyle === 'none' || !section.description) {
      return (
        <p
          className={cn(
            'whitespace-pre-wrap leading-relaxed mt-2',
            italic && 'italic',
            underline && 'underline',
            alignClass,
          )}
          style={{ fontSize: `${descriptionSize}px`, color: descColor }}
        >
          {section.description}
        </p>
      );
    }
    const items = section.description.split('\n').filter(Boolean);
    const ListTag = listStyle === 'numbered' ? 'ol' : 'ul';
    return (
      <ListTag
        className={cn(
          'leading-relaxed mt-2 pl-6',
          listStyle === 'numbered' ? 'list-decimal' : 'list-disc',
          italic && 'italic',
          underline && 'underline',
          alignClass,
        )}
        style={{ fontSize: `${descriptionSize}px`, color: descColor }}
      >
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ListTag>
    );
  };

  return (
    <section
      id={`section-${section.id}`}
      onDragOver={editable ? onDragOver : undefined}
      onDrop={editable ? onDrop : undefined}
      onDragEnd={editable ? onDragEnd : undefined}
      className={cn(
        'scroll-mt-24 transition-all relative group',
        SHADOW_CLASS[shadow],
        isActive ? 'ring-2 ring-primary/40' : '',
        isNew && 'animate-pulse-once ring-2 ring-primary/60',
        isDragging && 'opacity-40',
        isDragOver && 'ring-2 ring-primary ring-offset-2',
        !bgColor && 'bg-white',
        fontClass,
        fullWidth && '-mx-8',
      )}
      style={{
        backgroundColor: bgColor,
        borderRadius: `${radius}px`,
        padding: `${padding}px`,
        borderWidth: `${borderWidth}px`,
        borderStyle: borderWidth > 0 ? 'solid' : 'none',
        borderColor: borderColor || (isActive ? undefined : 'rgba(0,0,0,0.06)'),
      }}
    >
      {/* Drag handle (edit mode only) — appears on hover, left side of the section */}
      {editable && onDragStart && (
        <div
          draggable
          onDragStart={onDragStart}
          className={cn(
            'absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-7 h-10 rounded-md bg-white border border-outline-variant/40 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-opacity',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          title="Drag to reorder"
          aria-label="Drag to reorder section"
          role="button"
        >
          <GripVertical className="w-4 h-4 text-on-surface-variant" />
        </div>
      )}

      {/* Floating formatting toolbar (edit mode only) */}
      {editable && (
        <div
          className={cn(
            'absolute -top-3 left-4 flex items-center gap-0.5 bg-white border border-outline-variant/30 rounded-lg shadow-md px-1 py-1 transition-opacity z-10 flex-wrap max-w-[calc(100%-2rem)]',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {/* Style preset (H1/H2/H3) */}
          <div className="relative">
            <button
              onClick={() => togglePanel('style')}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded flex items-center gap-1"
              title="Text style"
            >
              <Settings2 className="w-3 h-3" />
              {section.textStyle ?? 'style'}
            </button>
            {openPanel === 'style' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-1 min-w-[160px] z-20">
                {STYLE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-primary/5 rounded text-on-surface"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Font family */}
          <div className="relative">
            <button
              onClick={() => togglePanel('font')}
              className="px-2 py-1 text-[10px] font-semibold text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded flex items-center gap-1"
              title="Font family"
            >
              <Type className="w-3 h-3" />
              {fontFamily}
            </button>
            {openPanel === 'font' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-1 min-w-[120px] z-20">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onChange?.({ fontFamily: f.id });
                      setOpenPanel(null);
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 text-xs hover:bg-primary/5 rounded text-on-surface',
                      f.className,
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Title size */}
          <div className="relative flex items-center gap-1 px-1">
            <span className="text-[9px] uppercase text-on-surface-variant">T</span>
            <input
              type="number"
              min={10}
              max={96}
              value={titleSize}
              onChange={(e) => onChange?.({ titleSize: Number(e.target.value) || 12 })}
              className="w-10 text-[10px] bg-transparent border border-outline-variant/30 rounded px-1 py-0.5 focus:outline-none focus:border-primary/50"
              title="Title size (px)"
            />
          </div>

          {/* Description size */}
          <div className="relative flex items-center gap-1 px-1">
            <span className="text-[9px] uppercase text-on-surface-variant">D</span>
            <input
              type="number"
              min={8}
              max={48}
              value={descriptionSize}
              onChange={(e) => onChange?.({ descriptionSize: Number(e.target.value) || 12 })}
              className="w-10 text-[10px] bg-transparent border border-outline-variant/30 rounded px-1 py-0.5 focus:outline-none focus:border-primary/50"
              title="Description size (px)"
            />
          </div>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Bold / Italic / Underline */}
          <button
            onClick={() => onChange?.({ bold: !bold })}
            className={cn('p-1 rounded hover:bg-primary/5', bold ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
            title="Bold title"
          >
            <Bold className="w-3 h-3" />
          </button>
          <button
            onClick={() => onChange?.({ italic: !italic })}
            className={cn('p-1 rounded hover:bg-primary/5', italic ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
            title="Italic description"
          >
            <Italic className="w-3 h-3" />
          </button>
          <button
            onClick={() => onChange?.({ underline: !underline })}
            className={cn('p-1 rounded hover:bg-primary/5', underline ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
            title="Underline description"
          >
            <Underline className="w-3 h-3" />
          </button>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Lists */}
          <button
            onClick={() => onChange?.({ listStyle: listStyle === 'bullet' ? 'none' : 'bullet' })}
            className={cn('p-1 rounded hover:bg-primary/5', listStyle === 'bullet' ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
            title="Bullet list (one item per line)"
          >
            <List className="w-3 h-3" />
          </button>
          <button
            onClick={() => onChange?.({ listStyle: listStyle === 'numbered' ? 'none' : 'numbered' })}
            className={cn('p-1 rounded hover:bg-primary/5', listStyle === 'numbered' ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
            title="Numbered list (one item per line)"
          >
            <ListOrdered className="w-3 h-3" />
          </button>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Alignment */}
          {(['left', 'center', 'right'] as PASectionAlign[]).map((a) => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
            return (
              <button
                key={a}
                onClick={() => onChange?.({ align: a })}
                className={cn('p-1 rounded hover:bg-primary/5', align === a ? 'text-primary bg-primary/10' : 'text-on-surface-variant')}
                title={`Align ${a}`}
              >
                <Icon className="w-3 h-3" />
              </button>
            );
          })}

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Text color */}
          <div className="relative">
            <button
              onClick={() => togglePanel('color')}
              className="p-1 rounded hover:bg-primary/5 text-on-surface-variant flex items-center gap-1"
              title="Text color"
            >
              <Palette className="w-3 h-3" />
              <span className="w-3 h-3 rounded border border-outline-variant/40" style={{ backgroundColor: titleColor || '#0F172A' }} />
            </button>
            {openPanel === 'color' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-2 z-20 w-[180px]">
                <div className="text-[9px] uppercase text-on-surface-variant mb-1">Title color</div>
                <div className="grid grid-cols-6 gap-1 mb-2">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => onChange?.({ titleColor: c })}
                      className="w-5 h-5 rounded border border-outline-variant/30 hover:scale-110 transition"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input type="color" value={titleColor || '#0F172A'} onChange={(e) => onChange?.({ titleColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                <div className="text-[9px] uppercase text-on-surface-variant mt-2 mb-1">Description color</div>
                <div className="grid grid-cols-6 gap-1 mb-1">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={`d-${c}`}
                      onClick={() => onChange?.({ descriptionColor: c })}
                      className="w-5 h-5 rounded border border-outline-variant/30 hover:scale-110 transition"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input type="color" value={descColor || '#475569'} onChange={(e) => onChange?.({ descriptionColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
              </div>
            )}
          </div>

          {/* Background color */}
          <div className="relative">
            <button
              onClick={() => togglePanel('bg')}
              className="p-1 rounded hover:bg-primary/5 text-on-surface-variant"
              title="Background color"
            >
              <span className="w-4 h-4 rounded border border-outline-variant/40 flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: bgColor || '#FFFFFF' }}>
                BG
              </span>
            </button>
            {openPanel === 'bg' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-2 z-20 w-[160px]">
                <div className="text-[9px] uppercase text-on-surface-variant mb-1">Background</div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {BG_SWATCHES.map((c, i) => (
                    <button
                      key={`bg-${i}`}
                      onClick={() => onChange?.({ backgroundColor: c })}
                      className="w-6 h-6 rounded border border-outline-variant/30 hover:scale-110 transition relative overflow-hidden"
                      style={{ backgroundColor: c || '#FFFFFF' }}
                      title={c || 'None'}
                    >
                      {!c && <span className="absolute inset-0 flex items-center justify-center text-[8px] text-on-surface-variant">✕</span>}
                    </button>
                  ))}
                </div>
                <input type="color" value={bgColor || '#FFFFFF'} onChange={(e) => onChange?.({ backgroundColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Layout (padding/radius/border/shadow/full-width) */}
          <div className="relative">
            <button
              onClick={() => togglePanel('layout')}
              className="px-2 py-1 text-[10px] font-semibold text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded"
              title="Layout & spacing"
            >
              Layout
            </button>
            {openPanel === 'layout' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-3 z-20 w-[220px] space-y-2">
                <label className="block text-[9px] uppercase text-on-surface-variant">
                  Padding ({padding}px)
                  <input type="range" min={0} max={64} value={padding} onChange={(e) => onChange?.({ padding: Number(e.target.value) })} className="w-full" />
                </label>
                <label className="block text-[9px] uppercase text-on-surface-variant">
                  Radius ({radius}px)
                  <input type="range" min={0} max={32} value={radius} onChange={(e) => onChange?.({ radius: Number(e.target.value) })} className="w-full" />
                </label>
                <label className="block text-[9px] uppercase text-on-surface-variant">
                  Border ({borderWidth}px)
                  <input type="range" min={0} max={4} value={borderWidth} onChange={(e) => onChange?.({ borderWidth: Number(e.target.value) })} className="w-full" />
                </label>
                <div>
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Border color</div>
                  <input type="color" value={borderColor || '#e5e7eb'} onChange={(e) => onChange?.({ borderColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                </div>
                <div>
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Shadow</div>
                  <div className="flex gap-1">
                    {(['none', 'sm', 'md', 'lg'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => onChange?.({ shadow: s })}
                        className={cn('flex-1 text-[10px] py-1 rounded border', shadow === s ? 'bg-primary/10 border-primary/40 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:bg-primary/5')}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                  <input type="checkbox" checked={fullWidth} onChange={(e) => onChange?.({ fullWidth: e.target.checked })} />
                  Full width
                </label>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-on-surface-variant hover:text-error hover:bg-error/10 rounded"
              aria-label="Remove section"
              title="Remove section"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <div className={cn('flex flex-col gap-2', alignClass)}>
        {editable ? (
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            <input
              value={section.name}
              onChange={(e) => onChange?.({ name: e.target.value })}
              placeholder="Section name"
              className={cn(
                'bg-transparent w-full border-none focus:outline-none focus:ring-0 p-0 text-[10px] font-black uppercase tracking-widest text-primary placeholder:text-primary/40',
                alignClass,
              )}
            />
          </p>
        ) : section.name ? (
          <p className={cn('text-[11px] font-black uppercase tracking-widest text-primary', alignClass)}>
            {section.name}
          </p>
        ) : null}

        {editable ? (
          <input
            value={section.title}
            onChange={(e) => onChange?.({ title: e.target.value })}
            placeholder="Add title"
            className={cn(
              'bg-transparent w-full border-none focus:outline-none focus:ring-0 p-0 tracking-tight placeholder:text-on-surface-variant/40',
              bold ? 'font-black' : 'font-medium',
              alignClass,
            )}
            style={{
              fontSize: `${titleSize}px`,
              lineHeight: 1.15,
              color: titleColor,
            }}
          />
        ) : (
          <h3
            className={cn('tracking-tight', bold ? 'font-black' : 'font-medium', alignClass)}
            style={{ fontSize: `${titleSize}px`, lineHeight: 1.15, color: titleColor }}
          >
            {section.title || section.name}
          </h3>
        )}

        {editable ? (
          <textarea
            value={section.description}
            onChange={(e) => onChange?.({ description: e.target.value })}
            placeholder={listStyle !== 'none' ? 'One item per line…' : 'Add description, message or notes…'}
            rows={3}
            className={cn(
              'w-full bg-transparent rounded-xl border border-outline-variant/10 focus:border-primary/40 focus:outline-none focus:ring-0 p-3 placeholder:text-on-surface-variant/50 resize-y leading-relaxed mt-2',
              italic && 'italic',
              underline && 'underline',
              alignClass,
            )}
            style={{ fontSize: `${descriptionSize}px`, color: descColor }}
          />
        ) : section.description ? (
          renderDescription()
        ) : null}
      </div>
    </section>
  );
}
