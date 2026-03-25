import React, { useState, useMemo } from 'react';
import { X, Search, Check, ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

interface CounterDef {
  counter_name: string;
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
  const [expandedFamilies, setExpandedFamilies] = useState<Record<string, boolean>>({});

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Select PM Counters</h2>
              <p className="text-[10px] text-muted-foreground">{catalog.length} counters · {localSelected.length} selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: Family filter */}
          <div className="w-48 border-r border-border overflow-y-auto bg-muted/20 py-2">
            <button
              onClick={() => setFamilyFilter('')}
              className={cn(
                'w-full text-left px-3 py-1.5 text-[10px] font-bold transition-all',
                !familyFilter ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              All Families ({catalog.length})
            </button>
            {families.map(f => (
              <button
                key={f.name}
                onClick={() => setFamilyFilter(familyFilter === f.name ? '' : f.name)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[10px] font-medium transition-all flex justify-between',
                  familyFilter === f.name ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
                )}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-[8px] text-muted-foreground shrink-0 ml-1">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Right: Counter list */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search */}
            <div className="px-4 py-2 border-b border-border">
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
            </div>

            {/* Counter list */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {Object.entries(grouped).map(([family, counters]) => (
                <div key={family} className="mb-2">
                  <button
                    onClick={() => setExpandedFamilies(prev => ({ ...prev, [family]: !prev[family] }))}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{family}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-muted-foreground">{counters.length}</span>
                      {expandedFamilies[family] === false
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        : <ChevronUp className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  </button>
                  {expandedFamilies[family] !== false && (
                    <div className="space-y-0.5 ml-1">
                      {counters.map(c => {
                        const selected = localSelected.includes(c.counter_name);
                        return (
                          <button
                            key={c.counter_name}
                            onClick={() => toggle(c.counter_name)}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-all',
                              selected ? 'bg-emerald-500/10 text-emerald-600' : 'hover:bg-muted/50 text-foreground'
                            )}
                          >
                            <div className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                              selected ? 'bg-emerald-500 border-emerald-500' : 'border-border'
                            )}>
                              {selected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className="font-mono font-bold">{c.counter_name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground">No counters match your search</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
          <span className="text-[10px] text-muted-foreground">{localSelected.length} selected</span>
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
