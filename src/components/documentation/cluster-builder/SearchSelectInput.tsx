import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Loader2, Check } from 'lucide-react';

interface SearchSelectInputProps {
  /** All available options for the dimension (cached) */
  options: string[];
  /** Currently selected values */
  selected: string[];
  onChange: (values: string[]) => void;
  /** Optional async search (for very large dimensions like cells/sites). Returns matching items. */
  asyncSearch?: (query: string) => Promise<string[]>;
  placeholder?: string;
}

/**
 * Type-ahead multi-select with chips. Supports both static (in-memory) and async (live) search.
 */
const SearchSelectInput: React.FC<SearchSelectInputProps> = ({
  options,
  selected,
  onChange,
  asyncSearch,
  placeholder = 'Search…',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [asyncResults, setAsyncResults] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced async search
  useEffect(() => {
    if (!asyncSearch || !query.trim()) {
      setAsyncResults(null);
      return;
    }
    if (debTimer.current) clearTimeout(debTimer.current);
    setLoading(true);
    debTimer.current = setTimeout(() => {
      asyncSearch(query.trim())
        .then(res => setAsyncResults(res))
        .catch(() => setAsyncResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
  }, [query, asyncSearch]);

  const matching = useMemo(() => {
    if (asyncResults != null) return asyncResults.slice(0, 50);
    if (!query.trim()) return options.slice(0, 50);
    const q = query.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 50);
  }, [query, options, asyncResults]);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const remove = (v: string) => onChange(selected.filter(x => x !== v));
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/40">
          {selected.slice(0, 20).map(v => (
            <span key={v} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
              {v}
              <button onClick={() => remove(v)} className="hover:bg-primary/20 rounded p-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selected.length > 20 && (
            <span className="text-[11px] text-muted-foreground self-center">+{selected.length - 20} more</span>
          )}
          <button onClick={clearAll} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive">
            Clear all
          </button>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
      </div>

      {/* Results dropdown */}
      {open && (matching.length > 0 || query.trim()) && (
        <div className="rounded-lg border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
          {matching.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              {loading ? 'Searching…' : 'No matches'}
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-muted/30 flex items-center justify-between">
                <span>{matching.length} result{matching.length > 1 ? 's' : ''}</span>
                {selected.length > 0 && <span>{selected.length} selected</span>}
              </div>
              {matching.map(opt => {
                const isSelected = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onMouseDown={e => { e.preventDefault(); toggle(opt); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40 text-foreground'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchSelectInput;
