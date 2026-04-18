import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Type, Palette,
} from 'lucide-react';
import { DynWidget } from '../types';
import PAEChart from './PAEChart';
import PAMapWidget from './PAMapWidget';
import PATableWidget from './PATableWidget';

interface Props {
  widget: DynWidget;
  editable?: boolean;
  onChange?: (patch: Partial<DynWidget>) => void;
}

/**
 * Renders a single widget body. Container (size, drag handles) is
 * managed by the grid layout in EditorView/ViewerView.
 */
export default function WidgetRenderer({ widget: w, editable = false, onChange }: Props) {
  if (w.kind === 'chart') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 widget-drag-handle cursor-move">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Chart'}</h3>
        </div>
        <div className="flex-1 min-h-0">
          <PAEChart variant="editor" height="100%" />
        </div>
      </div>
    );
  }
  if (w.kind === 'map') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 widget-drag-handle cursor-move">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Map'}</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Geo sites</span>
        </div>
        <div className="flex-1 min-h-0">
          <PAMapWidget height="100%" />
        </div>
      </div>
    );
  }
  if (w.kind === 'table') {
    return (
      <div className="h-full flex flex-col">
        <div className="widget-drag-handle cursor-move mb-2">
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Table'}</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PATableWidget height="100%" />
        </div>
      </div>
    );
  }
  if (w.kind === 'text') {
    return <TextWidgetBody widget={w} editable={editable} onChange={onChange} />;
  }
  if (w.kind === 'image') {
    return <ImageWidgetBody widget={w} editable={editable} onChange={onChange} />;
  }
  // kpi
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-start mb-6 widget-drag-handle cursor-move">
        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{w.title ?? 'KPI'}</h3>
        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/40" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black font-headline tracking-tighter text-on-surface">94.6%</span>
        <span className="text-xs font-bold text-emerald-600">+1.2%</span>
      </div>
    </div>
  );
}

/* ---------- Inline editable Text widget ---------- */
function TextWidgetBody({ widget: w, editable, onChange }: Props) {
  const [title, setTitle] = useState(w.title ?? 'Text');
  const [body, setBody] = useState(w.body ?? '');

  // Sync external updates (e.g. settings panel) without clobbering local typing
  useEffect(() => { setTitle(w.title ?? 'Text'); }, [w.title]);
  useEffect(() => { setBody(w.body ?? ''); }, [w.body]);

  const placeholder = 'Click here to add notes, commentary or a narrative for this report section.';

  return (
    <div className="h-full flex flex-col">
      <div className="widget-drag-handle cursor-move mb-2">
        {editable ? (
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); onChange?.({ title: e.target.value }); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-none outline-none text-sm font-black text-on-surface font-headline focus:bg-surface-container-low rounded px-1 -mx-1"
            placeholder="Title"
          />
        ) : (
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Text'}</h3>
        )}
      </div>
      {editable ? (
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); onChange?.({ body: e.target.value }); }}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={placeholder}
          className="flex-1 min-h-0 w-full resize-none bg-transparent border border-transparent hover:border-outline-variant/30 focus:border-primary/40 focus:bg-surface-container-low rounded-lg p-2 text-sm text-on-surface-variant leading-relaxed outline-none transition-colors"
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed p-2">
          {w.body || placeholder}
        </div>
      )}
    </div>
  );
}

/* ---------- Inline editable Image widget ---------- */
function ImageWidgetBody({ widget: w, editable, onChange }: Props) {
  const [title, setTitle] = useState(w.title ?? 'Image');
  const [url, setUrl] = useState(w.imageUrl ?? '');
  const [showUrlInput, setShowUrlInput] = useState(!w.imageUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitle(w.title ?? 'Image'); }, [w.title]);
  useEffect(() => { setUrl(w.imageUrl ?? ''); setShowUrlInput(!w.imageUrl); }, [w.imageUrl]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUrl(dataUrl);
      setShowUrlInput(false);
      onChange?.({ imageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="widget-drag-handle cursor-move mb-2 flex items-center gap-2">
        {editable ? (
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); onChange?.({ title: e.target.value }); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent border-none outline-none text-sm font-black text-on-surface font-headline focus:bg-surface-container-low rounded px-1 -mx-1"
            placeholder="Title"
          />
        ) : (
          <h3 className="text-sm font-black text-on-surface font-headline">{w.title ?? 'Image'}</h3>
        )}
        {editable && w.imageUrl && (
          <button
            onClick={() => setShowUrlInput(s => !s)}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
          >
            Change
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant/20 flex items-center justify-center relative">
        {url ? (
          <img src={url} alt={w.caption ?? w.title ?? 'Widget image'} className="w-full h-full object-contain" />
        ) : (
          <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center px-4">
            {editable ? 'Paste a URL or upload a file below' : 'No image'}
          </div>
        )}
      </div>

      {editable && showUrlInput && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="mt-2 flex items-center gap-2"
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => onChange?.({ imageUrl: url })}
            onKeyDown={(e) => { if (e.key === 'Enter') { onChange?.({ imageUrl: url }); setShowUrlInput(false); } }}
            placeholder="https://… or click upload"
            className="flex-1 px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-white text-xs text-on-surface outline-none focus:border-primary/40"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary-container transition-colors"
          >
            Upload
          </button>
        </div>
      )}
    </div>
  );
}
