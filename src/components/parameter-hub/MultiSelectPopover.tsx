import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MultiSelectPopoverProps {
  trigger: React.ReactNode;
  title: string;
  options: string[];
  selected: string[];
  onConfirm: (next: string[]) => void;
  loading?: boolean;
  multi?: boolean;
  emptyHint?: string;
  align?: 'start' | 'center' | 'end';
}

export const MultiSelectPopover: React.FC<MultiSelectPopoverProps> = ({
  trigger,
  title,
  options,
  selected,
  onConfirm,
  loading,
  multi = true,
  emptyHint = 'No options available',
  align = 'start',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(selected);
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val: string) => {
    if (!multi) {
      setDraft([val]);
      return;
    }
    setDraft((d) => (d.includes(val) ? d.filter((x) => x !== val) : [...d, val]));
  };

  const handleConfirm = () => {
    onConfirm(draft);
    setOpen(false);
  };

  const handleReset = () => setDraft([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-[320px] p-0 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-[11px] text-muted-foreground">
            {draft.length} / {options.length}
          </span>
        </div>
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">{emptyHint}</div>
          ) : (
            filtered.map((opt) => {
              const checked = draft.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent/50 transition-colors',
                    checked && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      checked
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input bg-background',
                    )}
                  >
                    {checked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="truncate text-foreground">{opt}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Apply ({draft.length})
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectPopover;
