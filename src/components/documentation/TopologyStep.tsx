import React, { useMemo, useState } from 'react';
import { Search, X, Check, Info, Sparkles, MapPin, Cpu, Layers, Radio, Building2, Loader2 } from 'lucide-react';
import { TOPOLOGY_DIMENSIONS } from './filterTypes';
import BulkListInput from './BulkListInput';

interface TopologyStepProps {
  topoConditions: Record<string, string[]>;
  setTopoValues: (dim: string, values: string[]) => void;
  toggleTopoOption: (dim: string, value: string) => void;
  getDynamicOptions: (key: string) => string[];
  filtersReady: boolean;
}

/* ────────────────────────────────────────────────────────────── */
/* Section meta                                                    */
/* ────────────────────────────────────────────────────────────── */
const DIM_META: Record<string, { icon: React.ReactNode; hint: string; accent: string }> = {
  vendor: {
    icon: <Cpu className="w-3.5 h-3.5" />,
    hint: 'Network equipment manufacturer (e.g. Nokia, Ericsson)',
    accent: 'from-violet-500/15 to-fuchsia-500/5',
  },
  dor: {
    icon: <MapPin className="w-3.5 h-3.5" />,
    hint: 'Operational region (UPR Île-de-France, Nord-Est, Ouest, …)',
    accent: 'from-sky-500/15 to-cyan-500/5',
  },
  plaque: {
    icon: <Building2 className="w-3.5 h-3.5" />,
    hint: 'Geographic cluster (city, agglomeration or department)',
    accent: 'from-emerald-500/15 to-teal-500/5',
  },
  band: {
    icon: <Radio className="w-3.5 h-3.5" />,
    hint: 'Frequency band (NR, LTE…)',
    accent: 'from-amber-500/15 to-orange-500/5',
  },
};

/* ────────────────────────────────────────────────────────────── */
/* Sub-component: chip list with search, select all, virt scroll  */
/* ────────────────────────────────────────────────────────────── */
const ChipPicker: React.FC<{
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onSetAll: (vals: string[]) => void;
  searchable?: boolean;
  maxHeight?: number;
}> = ({ options, selected, onToggle, onSetAll, searchable = false, maxHeight = 240 }) => {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(o => o.toLowerCase().includes(term));
  }, [options, q]);

  const allVisibleSelected = filtered.length > 0 && filtered.every(o => selected.includes(o));

  return (
    <div className="space-y-2.5">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Search in ${options.length} items…`}
            className="w-full pl-8 pr-8 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          {filtered.length} {filtered.length === options.length ? 'shown' : `of ${options.length}`}
          {selected.length > 0 && (
            <>
              {' • '}
              <span className="font-bold text-primary">{selected.length} selected</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const next = allVisibleSelected
                ? selected.filter(s => !filtered.includes(s))
                : Array.from(new Set([...selected, ...filtered]));
              onSetAll(next);
            }}
            className="px-2 py-0.5 rounded-md text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors"
          >
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => onSetAll([])}
              className="px-2 py-0.5 rounded-md text-[10px] font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Chip grid */}
      <div
        className="flex flex-wrap gap-1.5 overflow-y-auto pr-1 custom-scroll"
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <div className="w-full text-center py-6 text-xs text-muted-foreground italic">
            No matching items
          </div>
        ) : (
          filtered.map(opt => {
            const isSel = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 ${
                  isSel
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                    : 'bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                {isSel && <Check className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate max-w-[160px]">{opt}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────── */
/* Section card                                                    */
/* ────────────────────────────────────────────────────────────── */
const SectionCard: React.FC<{
  dimKey: string;
  label: string;
  count: number;
  selectedCount: number;
  children: React.ReactNode;
}> = ({ dimKey, label, count, selectedCount, children }) => {
  const meta = DIM_META[dimKey];
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm">
      {/* Soft accent header */}
      <div
        className={`px-4 py-3 border-b border-border/60 bg-gradient-to-r ${
          meta?.accent ?? 'from-muted/30 to-transparent'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground/80 shrink-0">
              {meta?.icon ?? <Layers className="w-3.5 h-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider truncate">
                  {label}
                </h4>
                <span className="text-[10px] font-semibold text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
                {selectedCount > 0 && (
                  <span className="text-[10px] font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-full">
                    {selectedCount}
                  </span>
                )}
              </div>
              {meta?.hint && (
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                  <Info className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{meta.hint}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">{children}</div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────── */
/* Main Step                                                       */
/* ────────────────────────────────────────────────────────────── */
const TopologyStep: React.FC<TopologyStepProps> = ({
  topoConditions,
  setTopoValues,
  toggleTopoOption,
  getDynamicOptions,
  filtersReady,
}) => {
  const totalSelected = useMemo(
    () => Object.values(topoConditions).reduce((sum, v) => sum + v.length, 0),
    [topoConditions],
  );
  const dimensionsWithSel = useMemo(
    () => Object.entries(topoConditions).filter(([, v]) => v.length > 0),
    [topoConditions],
  );

  return (
    <div className="space-y-4">
      {/* Hero / summary banner */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">Define topology scope</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pick the network entities to target. Selections cascade — each filter narrows the next.
            </p>
            {totalSelected > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Active:
                </span>
                {dimensionsWithSel.map(([dim, vals]) => (
                  <span
                    key={dim}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary"
                  >
                    <span className="capitalize">{dim}</span>
                    <span className="opacity-70">·</span>
                    <span>{vals.length}</span>
                    <button
                      onClick={() => setTopoValues(dim, [])}
                      className="ml-0.5 hover:bg-primary/20 rounded-full"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold text-primary leading-none">{totalSelected}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              selected
            </div>
          </div>
        </div>
      </div>

      {!filtersReady && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Loading filter options from backend…</span>
        </div>
      )}

      {/* Sections */}
      {TOPOLOGY_DIMENSIONS.map(dim => {
        const selected = topoConditions[dim.key] || [];

        if (dim.bulkSupport) {
          return (
            <SectionCard
              key={dim.key}
              dimKey={dim.key}
              label={dim.label}
              count={selected.length}
              selectedCount={selected.length}
            >
              <BulkListInput
                label={dim.label}
                values={selected}
                onChange={vals => setTopoValues(dim.key, vals)}
                placeholder={`Enter ${dim.label.toLowerCase()}…`}
                dimensionKey={dim.key}
              />
            </SectionCard>
          );
        }

        const dynamicOpts = getDynamicOptions(dim.key);
        const options = dynamicOpts.length > 0 ? dynamicOpts : dim.options;
        const isLarge = options.length > 20;

        return (
          <SectionCard
            key={dim.key}
            dimKey={dim.key}
            label={dim.label}
            count={options.length}
            selectedCount={selected.length}
          >
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic py-2">No options available</p>
            ) : (
              <ChipPicker
                options={options}
                selected={selected}
                onToggle={v => toggleTopoOption(dim.key, v)}
                onSetAll={vals => setTopoValues(dim.key, vals)}
                searchable={isLarge}
                maxHeight={isLarge ? 220 : 320}
              />
            )}
          </SectionCard>
        );
      })}
    </div>
  );
};

export default TopologyStep;
