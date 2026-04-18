import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, ClipboardPaste, FileText, AlertCircle, Check, Search, Loader2 } from 'lucide-react';
import { searchDimensionValues, validateDimensionValues } from '@/services/filterService';

interface BulkListInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  validationRegex?: RegExp;
  /** Topology dimension key (pci, eci, nci, sites, cells) — enables DB search & validation */
  dimensionKey?: string;
}

const BulkListInput: React.FC<BulkListInputProps> = ({ label, values, onChange, placeholder, validationRegex, dimensionKey }) => {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search / autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validation state for paste/csv
  const [validating, setValidating] = useState(false);
  const [notFound, setNotFound] = useState<string[]>([]);

  const canSearch = !!dimensionKey;

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (!dimensionKey || q.trim().length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchLoading(true);
    searchTimer.current = setTimeout(() => {
      searchDimensionValues(dimensionKey, q.trim(), 30)
        .then(res => {
          setSuggestions(res.values.filter(v => !values.includes(v)));
          setShowDropdown(true);
          setHighlightIdx(-1);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setSearchLoading(false));
    }, 300);
  }, [dimensionKey, values]);

  useEffect(() => {
    if (canSearch && inputValue.trim().length > 0) {
      doSearch(inputValue);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  }, [inputValue, canSearch, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addValue = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    if (validationRegex && !validationRegex.test(trimmed)) return;
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
    setShowDropdown(false);
    setNotFound(prev => prev.filter(nf => nf !== trimmed));
  };

  const removeValue = (v: string) => {
    onChange(values.filter(x => x !== v));
    setNotFound(prev => prev.filter(nf => nf !== v));
  };

  const selectSuggestion = (v: string) => {
    addValue(v);
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && highlightIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightIdx]);
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputValue);
      setInputValue('');
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handlePasteApply = async () => {
    const newVals = pasteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (dimensionKey && newVals.length > 0) {
      setValidating(true);
      try {
        const result = await validateDimensionValues(dimensionKey, newVals);
        const unique = [...new Set([...values, ...result.found])];
        onChange(unique);
        setNotFound(result.not_found);
      } catch {
        // Fallback: accept all on validation error
        const unique = [...new Set([...values, ...newVals])];
        onChange(unique);
      } finally {
        setValidating(false);
      }
    } else {
      const unique = [...new Set([...values, ...newVals])];
      onChange(unique);
    }
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

  const applyCsv = async () => {
    if (dimensionKey && csvPreview.length > 0) {
      setValidating(true);
      try {
        const result = await validateDimensionValues(dimensionKey, csvPreview);
        const unique = [...new Set([...values, ...result.found])];
        onChange(unique);
        setNotFound(result.not_found);
      } catch {
        const unique = [...new Set([...values, ...csvPreview])];
        onChange(unique);
      } finally {
        setValidating(false);
      }
    } else {
      const unique = [...new Set([...values, ...csvPreview])];
      onChange(unique);
    }
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

      {/* Not-found warning */}
      {notFound.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20">
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-destructive">{notFound.length} value{notFound.length > 1 ? 's' : ''} not found in database</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {notFound.slice(0, 20).map(v => (
                <span key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">{v}</span>
              ))}
              {notFound.length > 20 && <span className="text-[9px] text-destructive">+{notFound.length - 20} more</span>}
            </div>
            <button onClick={() => setNotFound([])} className="text-[9px] text-muted-foreground hover:underline mt-1">Dismiss</button>
          </div>
        </div>
      )}

      {/* Input with autocomplete */}
      <div className="relative">
        <div className="relative">
          {canSearch && <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />}
          {searchLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            placeholder={placeholder || (canSearch ? `Search ${label.toLowerCase()} in database…` : 'Type and press Enter…')}
            className={`w-full ${canSearch ? 'pl-8' : 'px-3'} pr-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30`}
          />
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
          >
            {suggestions.length === 0 && !searchLoading ? (
              <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                No matching {label.toLowerCase()} found for &quot;{inputValue}&quot;
              </div>
            ) : (
              suggestions.map((s, i) => (
                <button
                  key={s}
                  onClick={() => selectSuggestion(s)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                    i === highlightIdx
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {values.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">{values.length} value{values.length > 1 ? 's' : ''}</span>
          <button onClick={() => { onChange([]); setNotFound([]); }} className="text-[9px] text-destructive hover:underline">Clear all</button>
        </div>
      )}

      {/* Validating indicator */}
      {validating && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Validating against database…
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
                  {canSearch && ' — will be validated against database'}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handlePasteApply} disabled={!pasteText.trim() || validating} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                {validating ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 inline mr-1" />}
                {canSearch ? 'Validate & Apply' : 'Apply'}
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
              <p className="text-xs text-muted-foreground">
                {csvPreview.length} values parsed from file
                {canSearch && ' — will be validated against database'}
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 flex flex-wrap gap-1.5">
                {csvPreview.slice(0, 100).map((v, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono">{v}</span>
                ))}
                {csvPreview.length > 100 && <span className="text-[10px] text-muted-foreground">… +{csvPreview.length - 100} more</span>}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setShowCsvModal(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={applyCsv} disabled={validating} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
                {validating ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 inline mr-1" />}
                {canSearch ? `Validate & Import ${csvPreview.length}` : `Import ${csvPreview.length} values`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkListInput;
