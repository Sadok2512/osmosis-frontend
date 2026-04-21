import { useState } from 'react';
import {
  Trash2,
  Type,
  Palette,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Settings2,
} from 'lucide-react';
import { PASection, PASectionFontFamily, PASectionTextStyle, PASectionAlign } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  section: PASection;
  editable: boolean;
  isActive?: boolean;
  onChange?: (patch: Partial<PASection>) => void;
  onRemove?: () => void;
}

const STYLE_PRESETS: { id: PASectionTextStyle; label: string; titleSize: number; descSize: number }[] = [
  { id: 'heading', label: 'Heading', titleSize: 32, descSize: 14 },
  { id: 'subheading', label: 'Subheading', titleSize: 22, descSize: 13 },
  { id: 'body', label: 'Body', titleSize: 18, descSize: 14 },
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

/**
 * Editable text section. Displayed inline in the canvas and anchored
 * via id={`section-${section.id}`} so the sidebar can scroll to it.
 *
 * In edit mode it shows a contextual formatting toolbar (style, font,
 * size, color, alignment, weight). In view mode the formatting is
 * applied but the toolbar is hidden.
 */
export default function SectionBlock({ section, editable, isActive, onChange, onRemove }: Props) {
  const [openPanel, setOpenPanel] = useState<null | 'style' | 'font' | 'color' | 'bg' | 'size'>(null);

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

  const alignClass =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  const togglePanel = (p: typeof openPanel) => setOpenPanel((prev) => (prev === p ? null : p));

  const applyPreset = (preset: PASectionTextStyle) => {
    const p = STYLE_PRESETS.find((x) => x.id === preset)!;
    onChange?.({ textStyle: preset, titleSize: p.titleSize, descriptionSize: p.descSize });
    setOpenPanel(null);
  };

  return (
    <section
      id={`section-${section.id}`}
      className={cn(
        'scroll-mt-24 rounded-2xl border p-6 shadow-sm transition-colors relative group',
        isActive ? 'border-primary/40 ring-1 ring-primary/20' : 'border-outline-variant/10',
        !bgColor && 'bg-white',
        fontClass,
      )}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {/* Floating formatting toolbar (edit mode only) */}
      {editable && (
        <div
          className={cn(
            'absolute -top-3 left-4 flex items-center gap-0.5 bg-white border border-outline-variant/30 rounded-lg shadow-md px-1 py-1 transition-opacity z-10',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {/* Style preset */}
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
              <div className="absolute top-full left-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-1 min-w-[140px] z-20">
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

          {/* Bold / Italic */}
          <button
            onClick={() => onChange?.({ bold: !bold })}
            className={cn(
              'p-1 rounded hover:bg-primary/5',
              bold ? 'text-primary bg-primary/10' : 'text-on-surface-variant',
            )}
            title="Bold title"
          >
            <Bold className="w-3 h-3" />
          </button>
          <button
            onClick={() => onChange?.({ italic: !italic })}
            className={cn(
              'p-1 rounded hover:bg-primary/5',
              italic ? 'text-primary bg-primary/10' : 'text-on-surface-variant',
            )}
            title="Italic description"
          >
            <Italic className="w-3 h-3" />
          </button>

          <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

          {/* Alignment */}
          {(['left', 'center', 'right'] as PASectionAlign[]).map((a) => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
            return (
              <button
                key={a}
                onClick={() => onChange?.({ align: a })}
                className={cn(
                  'p-1 rounded hover:bg-primary/5',
                  align === a ? 'text-primary bg-primary/10' : 'text-on-surface-variant',
                )}
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
              <span
                className="w-3 h-3 rounded border border-outline-variant/40"
                style={{ backgroundColor: titleColor || '#0F172A' }}
              />
            </button>
            {openPanel === 'color' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-outline-variant/30 rounded-lg shadow-lg p-2 z-20 w-[180px]">
                <div className="text-[9px] uppercase text-on-surface-variant mb-1">Title color</div>
                <div className="grid grid-cols-6 gap-1 mb-2">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        onChange?.({ titleColor: c });
                      }}
                      className="w-5 h-5 rounded border border-outline-variant/30 hover:scale-110 transition"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={titleColor || '#0F172A'}
                  onChange={(e) => onChange?.({ titleColor: e.target.value })}
                  className="w-full h-6 rounded cursor-pointer"
                />
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
                <input
                  type="color"
                  value={descColor || '#475569'}
                  onChange={(e) => onChange?.({ descriptionColor: e.target.value })}
                  className="w-full h-6 rounded cursor-pointer"
                />
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
              <span
                className="w-4 h-4 rounded border border-outline-variant/40 flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: bgColor || '#FFFFFF' }}
              >
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
                      {!c && (
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] text-on-surface-variant">
                          ✕
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <input
                  type="color"
                  value={bgColor || '#FFFFFF'}
                  onChange={(e) => onChange?.({ backgroundColor: e.target.value })}
                  className="w-full h-6 rounded cursor-pointer"
                />
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
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
          {editable ? (
            <input
              value={section.name}
              onChange={(e) => onChange?.({ name: e.target.value })}
              placeholder="Section name"
              className={cn(
                'bg-transparent w-full border-none focus:outline-none focus:ring-0 p-0 text-[10px] font-black uppercase tracking-widest text-primary placeholder:text-primary/40',
                alignClass,
              )}
            />
          ) : (
            section.name
          )}
        </p>

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
            className={cn(
              'tracking-tight',
              bold ? 'font-black' : 'font-medium',
              alignClass,
            )}
            style={{ fontSize: `${titleSize}px`, lineHeight: 1.15, color: titleColor }}
          >
            {section.title || section.name}
          </h3>
        )}

        {editable ? (
          <textarea
            value={section.description}
            onChange={(e) => onChange?.({ description: e.target.value })}
            placeholder="Add description, message or notes…"
            rows={3}
            className={cn(
              'w-full bg-transparent rounded-xl border border-outline-variant/10 focus:border-primary/40 focus:outline-none focus:ring-0 p-3 placeholder:text-on-surface-variant/50 resize-y leading-relaxed mt-2',
              italic && 'italic',
              alignClass,
            )}
            style={{ fontSize: `${descriptionSize}px`, color: descColor }}
          />
        ) : section.description ? (
          <p
            className={cn(
              'whitespace-pre-wrap leading-relaxed mt-2',
              italic && 'italic',
              alignClass,
            )}
            style={{ fontSize: `${descriptionSize}px`, color: descColor }}
          >
            {section.description}
          </p>
        ) : null}
      </div>
    </section>
  );
}
