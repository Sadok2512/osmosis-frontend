import React, { useState } from 'react';
import { GripVertical, Trash2, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Paintbrush } from 'lucide-react';

export interface TextWidgetConfig {
  id: string;
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: 'normal' | 'semibold' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  bgColor: string;
}

interface Props {
  config: TextWidgetConfig;
  onChange: (config: TextWidgetConfig) => void;
  onDelete: () => void;
}

export function createDefaultTextWidget(id: string): TextWidgetConfig {
  return {
    id,
    type: 'text',
    content: 'Double-click to edit',
    fontSize: 14,
    fontWeight: 'semibold',
    fontStyle: 'normal',
    textAlign: 'left',
    color: 'hsl(var(--foreground))',
    bgColor: '',
  };
}

const TEXT_COLORS = ['#ffffff', '#1e293b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
const BG_COLORS = ['', '#ffffff', '#1e293b', '#0f172a', '#fef2f2', '#fff7ed', '#fefce8', '#f0fdf4', '#eff6ff', '#f5f3ff', '#fdf2f8', '#ecfeff', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#8b5cf6'];

const BITextWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTextColors, setShowTextColors] = useState(false);
  const [showBgColors, setShowBgColors] = useState(false);

  const update = (partial: Partial<TextWidgetConfig>) => onChange({ ...config, ...partial });

  const palettesOpen = showTextColors || showBgColors;

  return (
    <div
      className="h-full flex flex-col rounded-2xl border border-border shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)]"
      style={{ backgroundColor: config.bgColor || undefined, overflow: palettesOpen ? 'visible' : 'hidden' }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => { if (!palettesOpen) { setShowToolbar(false); } }}
    >
      {/* Toolbar header */}
      <div className="flex items-center justify-between px-3 py-1.5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 drag-handle">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
          <Type className="w-3 h-3 text-primary" />
        </div>

        {/* Formatting toolbar */}
        <div className={`flex items-center gap-0.5 transition-opacity ${showToolbar ? 'opacity-100' : 'opacity-0'}`} onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => update({ fontWeight: config.fontWeight === 'bold' ? 'normal' : 'bold' })}
            className={`p-1 rounded hover:bg-muted transition-colors ${config.fontWeight === 'bold' ? 'text-primary' : 'text-muted-foreground'}`}>
            <Bold className="w-3 h-3" />
          </button>
          <button onClick={() => update({ fontStyle: config.fontStyle === 'italic' ? 'normal' : 'italic' })}
            className={`p-1 rounded hover:bg-muted transition-colors ${config.fontStyle === 'italic' ? 'text-primary' : 'text-muted-foreground'}`}>
            <Italic className="w-3 h-3" />
          </button>
          <div className="w-px h-3 bg-border mx-0.5" />
          {(['left', 'center', 'right'] as const).map(align => {
            const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
            return (
              <button key={align} onClick={() => update({ textAlign: align })}
                className={`p-1 rounded hover:bg-muted transition-colors ${config.textAlign === align ? 'text-primary' : 'text-muted-foreground'}`}>
                <Icon className="w-3 h-3" />
              </button>
            );
          })}
          <div className="w-px h-3 bg-border mx-0.5" />
          <select value={config.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })}
            className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] text-foreground w-12">
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
          {/* Text color palette */}
          <div className="relative">
            <button onClick={() => { setShowTextColors(!showTextColors); setShowBgColors(false); }}
              className="w-5 h-5 rounded-full border-2 border-border cursor-pointer ml-0.5 shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundColor: config.color.startsWith('hsl') ? 'hsl(var(--foreground))' : config.color }}
              title="Text color" />
            {showTextColors && (
              <div className="absolute top-8 right-0 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-3 z-[9999] animate-in fade-in zoom-in-95 duration-150"
                onMouseLeave={() => setShowTextColors(false)}>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-2 block">Texte</span>
                <div className="flex gap-1.5">
                  {TEXT_COLORS.map(c => (
                    <button key={c} onClick={() => { update({ color: c }); setShowTextColors(false); }}
                      className={`w-5 h-5 rounded-full border transition-all duration-150 hover:scale-[1.3] hover:shadow-lg ${config.color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover scale-110' : 'border-transparent shadow-sm'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Background color palette */}
          <div className="relative">
            <button onClick={() => { setShowBgColors(!showBgColors); setShowTextColors(false); }}
              className="w-5 h-5 rounded-full border-2 border-dashed border-border cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
              style={{ backgroundColor: config.bgColor || undefined }}
              title="Background color">
              {!config.bgColor && <Paintbrush className="w-2.5 h-2.5 text-muted-foreground mx-auto" />}
            </button>
            {showBgColors && (
              <div className="absolute top-8 right-0 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-3 z-[9999] animate-in fade-in zoom-in-95 duration-150"
                onMouseLeave={() => setShowBgColors(false)}>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mb-2 block">Fond</span>
                <div className="flex flex-wrap gap-1.5 max-w-[140px]">
                  {BG_COLORS.map((c, i) => (
                    <button key={i} onClick={() => { update({ bgColor: c }); setShowBgColors(false); }}
                      className={`w-5 h-5 rounded-full border transition-all duration-150 hover:scale-[1.3] hover:shadow-lg ${config.bgColor === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover scale-110' : 'border-transparent shadow-sm'}`}
                      style={{ backgroundColor: c || 'transparent', backgroundImage: !c ? 'linear-gradient(135deg, hsl(var(--muted)) 50%, hsl(var(--destructive)/0.3) 50%)' : undefined }}>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 px-4 pb-3 min-h-0 flex" onMouseDown={e => e.stopPropagation()}>
        {editing ? (
          <textarea
            autoFocus
            value={config.content}
            onChange={e => update({ content: e.target.value })}
            onBlur={() => setEditing(false)}
            className="w-full h-full bg-transparent border-none outline-none resize-none"
            style={{
              fontSize: config.fontSize,
              fontWeight: config.fontWeight === 'bold' ? 700 : config.fontWeight === 'semibold' ? 600 : 400,
              fontStyle: config.fontStyle,
              textAlign: config.textAlign,
              color: config.color.startsWith('hsl(var') ? undefined : config.color,
            }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center cursor-text whitespace-pre-wrap"
            onDoubleClick={() => setEditing(true)}
            style={{
              fontSize: config.fontSize,
              fontWeight: config.fontWeight === 'bold' ? 700 : config.fontWeight === 'semibold' ? 600 : 400,
              fontStyle: config.fontStyle,
              textAlign: config.textAlign,
              color: config.color.startsWith('hsl(var') ? undefined : config.color,
              justifyContent: config.textAlign === 'center' ? 'center' : config.textAlign === 'right' ? 'flex-end' : 'flex-start',
            }}
          >
            {config.content || 'Double-click to edit'}
          </div>
        )}
      </div>
    </div>
  );
};

export default BITextWidget;
