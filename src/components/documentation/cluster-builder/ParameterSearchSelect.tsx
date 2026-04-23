import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface ParameterSearchSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const MAX_VISIBLE = 200;

const ParameterSearchSelect: React.FC<ParameterSearchSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select parameter…',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, MAX_VISIBLE);
    const out: string[] = [];
    for (const o of options) {
      if (o.toLowerCase().includes(q)) {
        out.push(o);
        if (out.length >= MAX_VISIBLE) break;
      }
    }
    return out;
  }, [query, options]);

  const totalMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.length;
    let n = 0;
    for (const o of options) if (o.toLowerCase().includes(q)) n++;
    return n;
  }, [query, options]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/50 transition-colors"
      >
        <span className={`truncate text-left ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value || placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${options.length.toLocaleString('fr-FR')} parameters…`}
                className="w-full pl-7 pr-7 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-muted-foreground">
              <span>
                {totalMatches.toLocaleString('fr-FR')} match{totalMatches !== 1 ? 'es' : ''}
              </span>
              {totalMatches > MAX_VISIBLE && (
                <span className="italic">showing first {MAX_VISIBLE}</span>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No parameter matches “{query}”
              </div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/60 transition-colors ${
                    opt === value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                  }`}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterSearchSelect;
