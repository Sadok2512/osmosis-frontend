import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X, Loader2 } from 'lucide-react';

interface ParameterSearchSelectProps {
  value: string;
  /** Local fallback options (used when no asyncSearch is provided, or before user types). */
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Optional live backend search. When provided, results from the backend are shown
   * — typically the full MO-prefixed names (e.g. `LNCEL.pMax`, `NRCELL.pMax`).
   * The same parameter name may exist on multiple MOs, so prefixes MUST be preserved.
   */
  asyncSearch?: (query: string) => Promise<string[]>;
}

const MAX_VISIBLE = 200;

const ParameterSearchSelect: React.FC<ParameterSearchSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select parameter…',
  asyncSearch,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<string[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounced backend search — when asyncSearch is available we ALWAYS use the backend,
  // even with empty query (to surface MO-prefixed names like LNCEL.pMax / NRCELL.pMax
  // immediately, without requiring the user to type).
  useEffect(() => {
    if (!asyncSearch) return;
    if (!open) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    setRemoteLoading(true);
    const delay = q.length === 0 ? 0 : 250;
    searchTimer.current = setTimeout(async () => {
      try {
        // Empty query → ask backend for a broad list (space matches most catalogs;
        // backend ignores tiny queries gracefully). Use '.' which appears in every MO-prefixed name.
        const effectiveQ = q.length === 0 ? '.' : q;
        const r = await asyncSearch(effectiveQ);
        setRemoteResults(Array.isArray(r) ? r : []);
      } catch {
        setRemoteResults([]);
      } finally {
        setRemoteLoading(false);
      }
    }, delay);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, asyncSearch, open]);

  // Source of truth for displayed list:
  // - if asyncSearch → ALWAYS use remote results (preserves MO. prefix)
  // - else → filter local options
  const filtered = useMemo(() => {
    if (asyncSearch) {
      return (remoteResults ?? []).slice(0, MAX_VISIBLE);
    }
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
  }, [query, options, asyncSearch, remoteResults]);

  const totalMatches = useMemo(() => {
    if (asyncSearch) return (remoteResults ?? []).length;
    const q = query.trim().toLowerCase();
    if (!q) return options.length;
    let n = 0;
    for (const o of options) if (o.toLowerCase().includes(q)) n++;
    return n;
  }, [query, options, asyncSearch, remoteResults]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 hover:border-primary/50 transition-colors"
      >
        <span className={`truncate text-left font-mono ${value ? 'text-foreground' : 'text-muted-foreground font-sans'}`}>
          {value || placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={asyncSearch ? 'Search parameter… (e.g. LNCEL.pMax)' : `Search ${options.length.toLocaleString('fr-FR')} parameters…`}
                className="w-full pl-7 pr-7 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {remoteLoading && (
                <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground animate-spin" />
              )}
              {query && !remoteLoading && (
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
                {asyncSearch && (
                  <span className="ml-1 italic">— from backend (MO.parameter)</span>
                )}
              </span>
              {totalMatches > MAX_VISIBLE && (
                <span className="italic">showing first {MAX_VISIBLE}</span>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {remoteLoading ? 'Searching…' : query ? `No parameter matches "${query}"` : 'Start typing to search'}
              </div>
            ) : (
              filtered.map(opt => {
                // Highlight MO prefix (e.g. LNCEL.) so the user clearly sees which MO they pick.
                const dotIdx = opt.indexOf('.');
                const mo = dotIdx > 0 ? opt.slice(0, dotIdx) : null;
                const rest = dotIdx > 0 ? opt.slice(dotIdx) : opt;
                return (
                  <button
                    key={opt}
                    onClick={() => { onChange(opt); setOpen(false); setQuery(''); }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/60 transition-colors ${
                      opt === value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                    }`}
                    title={opt}
                  >
                    {mo ? (
                      <>
                        <span className="text-primary/80 font-bold">{mo}</span>
                        <span className="text-foreground">{rest}</span>
                      </>
                    ) : (
                      opt
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterSearchSelect;
