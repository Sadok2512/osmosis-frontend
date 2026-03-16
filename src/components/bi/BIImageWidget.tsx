import React, { useState, useRef } from 'react';
import { GripVertical, Trash2, ImageIcon, Upload, Maximize2, Minimize2 } from 'lucide-react';

export interface ImageWidgetConfig {
  id: string;
  type: 'image';
  src: string; // base64 data URL or external URL
  alt: string;
  objectFit: 'cover' | 'contain' | 'fill';
  borderRadius: number;
  bgColor: string;
}

interface Props {
  config: ImageWidgetConfig;
  onChange: (config: ImageWidgetConfig) => void;
  onDelete: () => void;
}

export function createDefaultImageWidget(id: string): ImageWidgetConfig {
  return {
    id,
    type: 'image',
    src: '',
    alt: 'Image',
    objectFit: 'contain',
    borderRadius: 12,
    bgColor: '',
  };
}

const BIImageWidget: React.FC<Props> = ({ config, onChange, onDelete }) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<ImageWidgetConfig>) => onChange({ ...config, ...partial });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image trop grande (max 5 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ src: reader.result as string, alt: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="h-full flex flex-col rounded-2xl border border-border bg-card shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)] group transition-shadow hover:shadow-[0_4px_24px_-6px_hsl(var(--foreground)/0.1)] overflow-hidden"
      style={{ backgroundColor: config.bgColor || undefined }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 drag-handle">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
          <ImageIcon className="w-3 h-3 text-primary" />
        </div>
        <div className={`flex items-center gap-0.5 transition-opacity ${showToolbar ? 'opacity-100' : 'opacity-0'}`} onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => fileRef.current?.click()}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Upload image">
            <Upload className="w-3 h-3" />
          </button>
          <select value={config.objectFit} onChange={e => update({ objectFit: e.target.value as any })}
            className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] text-foreground">
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
            <option value="fill">Fill</option>
          </select>
          <select value={config.borderRadius} onChange={e => update({ borderRadius: Number(e.target.value) })}
            className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] text-foreground w-14">
            <option value={0}>Sharp</option>
            <option value={8}>8px</option>
            <option value={12}>12px</option>
            <option value={16}>16px</option>
            <option value={24}>24px</option>
            <option value={9999}>Circle</option>
          </select>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 px-3 pb-3 min-h-0 flex items-center justify-center" onMouseDown={e => e.stopPropagation()}>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        {config.src ? (
          <img
            src={config.src}
            alt={config.alt}
            className="w-full h-full"
            style={{
              objectFit: config.objectFit,
              borderRadius: config.borderRadius,
            }}
          />
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Cliquer pour ajouter une image</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default BIImageWidget;
