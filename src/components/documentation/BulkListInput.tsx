import React, { useState, useRef } from 'react';
import { X, Upload, ClipboardPaste, FileText, AlertCircle, Check } from 'lucide-react';

interface BulkListInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  validationRegex?: RegExp;
}

const BulkListInput: React.FC<BulkListInputProps> = ({ label, values, onChange, placeholder, validationRegex }) => {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addValue = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    if (validationRegex && !validationRegex.test(trimmed)) return;
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
  };

  const removeValue = (v: string) => onChange(values.filter(x => x !== v));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputValue);
      setInputValue('');
    }
  };

  const handlePasteApply = () => {
    const newVals = pasteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const unique = [...new Set([...values, ...newVals])];
    onChange(unique);
    setPasteText('');
    setShowPasteModal(false);
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      setCsvPreview(parsed);
      setShowCsvModal(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyCsv = () => {
    const unique = [...new Set([...values, ...csvPreview])];
    onChange(unique);
    setCsvPreview([]);
    setShowCsvModal(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowPasteModal(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors">
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors">
            <Upload className="w-3 h-3" /> CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
        </div>
      </div>

      {/* Chips */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/30 border border-border/50 max-h-24 overflow-y-auto">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
              {v}
              <button onClick={() => removeValue(v)} className="hover:text-destructive transition-colors">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type and press Enter…'}
        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {values.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">{values.length} value{values.length > 1 ? 's' : ''}</span>
          <button onClick={() => onChange([])} className="text-[9px] text-destructive hover:underline">Clear all</button>
        </div>
      )}

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPasteModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl bg-card border border-border shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Paste Bulk Values</h3>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Paste values separated by commas, semicolons, or new lines.</p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Value1, Value2, Value3…"
                className="w-full h-32 px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              {pasteText && (
                <p className="text-[10px] text-muted-foreground">
                  {pasteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).length} values detected
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handlePasteApply} disabled={!pasteText.trim()} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                <Check className="w-3.5 h-3.5 inline mr-1" /> Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCsvModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl bg-card border border-border shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">CSV Import Preview</h3>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">{csvPreview.length} values parsed from file</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 flex flex-wrap gap-1.5">
                {csvPreview.slice(0, 100).map((v, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono">{v}</span>
                ))}
                {csvPreview.length > 100 && <span className="text-[10px] text-muted-foreground">… +{csvPreview.length - 100} more</span>}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowCsvModal(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={applyCsv} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-3.5 h-3.5 inline mr-1" /> Import {csvPreview.length} values
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkListInput;
