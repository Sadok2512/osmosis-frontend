import React, { useState, useMemo } from 'react';
import { X, Search, Check, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CounterDef {
  counter_name: string;
  display_name: string;
  family: string;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: CounterDef[];
  selectedKeys: string[];
  onConfirm: (keys: string[]) => void;
}

const CounterSelectorModal: React.FC<Props> = ({ open, onClose, catalog, selectedKeys, onConfirm }) => {
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [localSelected, setLocalSelected] = useState<string[]>(selectedKeys);

  React.useEffect(() => {
    if (open) setLocalSelected(selectedKeys);
  }, [open, selectedKeys]);

  const families = useMemo(() => {
    const fmap: Record<string, number> = {};
    catalog.forEach(c => { fmap[c.family] = (fmap[c.family] || 0) + 1; });
    return Object.entries(fmap).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  }, [catalog]);

  const filtered = useMemo(() => {
    let items = catalog;
    if (familyFilter) items = items.filter(c => c.family === familyFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c => c.counter_name.toLowerCase().includes(q) || c.family.toLowerCase().includes(q));
    }
    return items;
  }, [catalog, familyFilter, search]);

  const grouped = useMemo(() => {
    const g: Record<string, CounterDef[]> = {};
    filtered.forEach(c => {
      if (!g[c.family]) g[c.family] = [];
      g[c.family].push(c);
    });
    return g;
  }, [filtered]);

  const toggle = (name: string) => {
    setLocalSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[640px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Select PM Counters</h2>
              <p className="text-[10px] text-muted-foreground">{catalog.length} counters available · {localSelected.length} selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Search + Family filter */}
        <div className="px-5 py-3 border-b border-border shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search counters..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFamilyFilter('')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                !familyFilter ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 border border-border/40'
              )}
            >
              All ({catalog.length})
            </button>
            {families.map(f => (
              <button
                key={f.name}
                onClick={() => setFamilyFilter(familyFilter === f.name ? '' : f.name)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                  familyFilter === f.name ? 'bg-emerald-500/10 text-emerald-600' : 'text-muted-foreground hover:bg-muted/50 border border-border/40'
                )}
              >
                {f.name.replace('LTE_', '')} ({f.count})
              </button>
            ))}
          </div>
        </div>

        {/* Counter list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {Object.entries(grouped).map(([family, counters]) => (
            <div key={family} className="mb-3">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{family}</div>
              <div className="grid grid-cols-2 gap-1">
                {counters.map(c => {
                  const selected = localSelected.includes(c.counter_name);
                  return (
                    <button
                      key={c.counter_name}
                      onClick={() => toggle(c.counter_name)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all text-left',
                        selected ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'hover:bg-muted/50 border border-transparent'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                        selected ? 'bg-emerald-500 border-emerald-500' : 'border-border'
                      )}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <><span className="font-mono font-bold">{c.counter_name}</span>{c.display_name !== c.counter_name && <span className="text-muted-foreground font-normal ml-1.5">({c.display_name})</span>}</>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">No counters match your search</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            {localSelected.length > 0 && (
              <button onClick={() => setLocalSelected([])} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear all</button>
            )}
            <span className="text-[10px] text-muted-foreground">{localSelected.length} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-all">Cancel</button>
            <button
              onClick={() => { onConfirm(localSelected); onClose(); }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
            >
              Apply ({localSelected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterSelectorModal;
