import React, { useState, useMemo } from 'react';
import { ClipboardPaste, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ManualListInputProps {
  /** Optional list of known valid values to validate against. If omitted, all are accepted. */
  validValues?: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/**
 * Paste-friendly list input. Accepts comma, newline, tab, semicolon separated values.
 * Auto-deduplicates and validates against known values.
 */
const ManualListInput: React.FC<ManualListInputProps> = ({
  validValues,
  selected,
  onChange,
  placeholder = 'Paste values (one per line, or comma/tab separated)…',
}) => {
  const [text, setText] = useState(selected.join('\n'));

  const parsed = useMemo(() => {
    const tokens = text
      .split(/[\n,;\t]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    let dupCount = 0;
    for (const t of tokens) {
      if (seen.has(t)) { dupCount++; continue; }
      seen.add(t);
      unique.push(t);
    }
    if (validValues && validValues.length > 0) {
      const validSet = new Set(validValues.map(v => v.toLowerCase()));
      const valid: string[] = [];
      const invalid: string[] = [];
      for (const u of unique) {
        if (validSet.has(u.toLowerCase())) valid.push(u);
        else invalid.push(u);
      }
      return { valid, invalid, dupCount, total: tokens.length };
    }
    return { valid: unique, invalid: [], dupCount, total: tokens.length };
  }, [text, validValues]);

  const apply = () => onChange(parsed.valid);
  const isDirty = JSON.stringify(parsed.valid) !== JSON.stringify(selected);

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full h-28 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
      />

      {/* Summary */}
      {parsed.total > 0 && (
        <div className="flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> {parsed.valid.length} valid
          </span>
          {parsed.invalid.length > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-semibold" title={parsed.invalid.slice(0, 10).join(', ')}>
              <AlertCircle className="w-3.5 h-3.5" /> {parsed.invalid.length} unknown
            </span>
          )}
          {parsed.dupCount > 0 && (
            <span className="text-muted-foreground">{parsed.dupCount} duplicate{parsed.dupCount > 1 ? 's' : ''} removed</span>
          )}
          <button
            onClick={apply}
            disabled={!isDirty}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-bold disabled:opacity-40 hover:opacity-90"
          >
            <ClipboardPaste className="w-3 h-3" /> Apply ({parsed.valid.length})
          </button>
        </div>
      )}

      {parsed.invalid.length > 0 && parsed.invalid.length <= 10 && (
        <div className="text-[10px] text-amber-600/80 italic">
          Unknown: {parsed.invalid.join(', ')}
        </div>
      )}
    </div>
  );
};

export default ManualListInput;
