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

const BITextWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  const update = (partial: Partial<TextWidgetConfig>) => onChange({ ...config, ...partial });

  return (
    <div
      className="h-full flex flex-col rounded-2xl border border-border shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] overflow-hidden group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)]"
      style={{ backgroundColor: config.bgColor || undefined }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
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
          <input type="color" value={config.color.startsWith('hsl') ? '#ffffff' : config.color}
            onChange={e => update({ color: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border-0 ml-0.5" title="Text color" />
          <input type="color" value={config.bgColor || '#ffffff'}
            onChange={e => update({ bgColor: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border-0" title="Background color" />
          {config.bgColor && (
            <button onClick={() => update({ bgColor: '' })} className="p-1 rounded hover:bg-muted text-muted-foreground text-[9px]" title="Remove background">✕</button>
          )}
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
