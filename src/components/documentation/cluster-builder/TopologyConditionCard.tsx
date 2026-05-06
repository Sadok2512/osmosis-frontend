import React from 'react';
import { Trash2, Search, ClipboardPaste, Upload } from 'lucide-react';
import SearchSelectInput from './SearchSelectInput';
import ManualListInput from './ManualListInput';
import CsvUploadInput from './CsvUploadInput';

export type InputMode = 'search' | 'paste' | 'csv';
export type TopoOperator = 'IN' | 'NOT IN';

export interface TopologyConditionState {
  id: string;
  field: string;
  operator: TopoOperator;
  inputMode: InputMode;
  values: string[];
}

interface TopologyConditionCardProps {
  condition: TopologyConditionState;
  /** Each option may carry a category — when present the field <select>
   *  groups options by template section (Common / RF Parameters / 4G /
   *  5G / 3G / 2G / Operations) using native <optgroup>. */
  fieldOptions: { key: string; label: string; category?: string }[];
  /** Returns the available values for the chosen field (cascade-aware). */
  getValuesForField: (field: string) => string[];
  /** Optional async search hook for very large dimensions. */
  asyncSearch?: (field: string, q: string) => Promise<string[]>;
  onChange: (next: TopologyConditionState) => void;
  onRemove: () => void;
}

const MODE_TABS: { id: InputMode; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'Search & Select', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'paste', label: 'Paste List', icon: <ClipboardPaste className="w-3.5 h-3.5" /> },
  { id: 'csv', label: 'Upload CSV', icon: <Upload className="w-3.5 h-3.5" /> },
];

const TopologyConditionCard: React.FC<TopologyConditionCardProps> = ({
  condition,
  fieldOptions,
  getValuesForField,
  asyncSearch,
  onChange,
  onRemove,
}) => {
  const valuesPool = getValuesForField(condition.field);

  const set = (patch: Partial<TopologyConditionState>) =>
    onChange({ ...condition, ...patch });

  // Group by category in stable first-appearance order. When no
  // category metadata is present, render the flat list as before.
  const grouped = (() => {
    if (!fieldOptions.some(o => o.category)) return null;
    const cats: Record<string, typeof fieldOptions> = {};
    const order: string[] = [];
    for (const o of fieldOptions) {
      const cat = o.category || 'Other';
      if (!cats[cat]) { cats[cat] = []; order.push(cat); }
      cats[cat].push(o);
    }
    return order.map(cat => ({ category: cat, items: cats[cat] }));
  })();

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
      {/* Top row: field / operator / remove */}
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Field</label>
          <select
            value={condition.field}
            onChange={e => set({ field: e.target.value, values: [] })}
            className="w-full mt-1 h-9 px-2.5 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {grouped ? (
              grouped.map(({ category, items }) => (
                <optgroup key={category} label={category}>
                  {items.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </optgroup>
              ))
            ) : (
              fieldOptions.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))
            )}
          </select>
        </div>
        <div className="w-28 shrink-0">
          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Operator</label>
          <select
            value={condition.operator}
            onChange={e => set({ operator: e.target.value as TopoOperator })}
            className="w-full mt-1 h-9 px-2.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="IN">IN</option>
            <option value="NOT IN">NOT IN</option>
          </select>
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Remove condition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40">
        {MODE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => set({ inputMode: t.id })}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
              condition.inputMode === t.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div>
        {condition.inputMode === 'search' && (
          <SearchSelectInput
            options={valuesPool}
            selected={condition.values}
            onChange={values => set({ values })}
            asyncSearch={asyncSearch ? q => asyncSearch(condition.field, q) : undefined}
            placeholder={`Search ${condition.field}…`}
          />
        )}
        {condition.inputMode === 'paste' && (
          <ManualListInput
            validValues={valuesPool.length > 0 ? valuesPool : undefined}
            selected={condition.values}
            onChange={values => set({ values })}
          />
        )}
        {condition.inputMode === 'csv' && (
          <CsvUploadInput
            validValues={valuesPool.length > 0 ? valuesPool : undefined}
            selected={condition.values}
            onChange={values => set({ values })}
          />
        )}
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[11px]">
        <span className="text-muted-foreground">
          {condition.values.length === 0 ? (
            <span className="italic">No values selected</span>
          ) : (
            <>
              <strong className="text-foreground">{condition.values.length}</strong> value{condition.values.length > 1 ? 's' : ''} matched
            </>
          )}
        </span>
        {condition.values.length > 0 && (
          <button
            onClick={() => set({ values: [] })}
            className="text-muted-foreground hover:text-destructive font-semibold"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

export default TopologyConditionCard;
