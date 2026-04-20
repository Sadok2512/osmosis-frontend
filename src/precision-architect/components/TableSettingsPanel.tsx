import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Eye, EyeOff, Database, Filter, ChevronDown } from 'lucide-react';
import {
  DynWidget, TableWidgetConfig, TableColumn, DEFAULT_TABLE_CONFIG, ChartFilterChip,
} from '../types';
import { cn } from '@/lib/utils';
import { useKpiCatalog, useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import KpiSelectorModal from '@/components/kpi-monitor/KpiSelectorModal';
import { KpiCatalogEntry } from '@/components/kpi-monitor/types';
import PAFilterChips from './PAFilterChips';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';

interface Props {
  widget: DynWidget;
  onChange: (patch: Partial<DynWidget>) => void;
  onClose: () => void;
}

const FALLBACK_DIMENSIONS = ['Plaque', 'DOR', 'DR', 'Bande', 'Site', 'Cell', 'PCI', 'ECI'];
const SPLIT_OPTIONS = ['CELL', 'SITE', 'PLAQUE', 'DOR', 'DR', 'VENDOR', 'BANDE', 'TECHNOLOGY', '__none__'];
const TOP_N_OPTIONS = [10, 25, 50, 100, 250, 500];

export default function TableSettingsPanel({ widget, onChange, onClose }: Props) {
  const config: TableWidgetConfig = widget.tableConfig ?? DEFAULT_TABLE_CONFIG;
  const [tab, setTab] = useState<'data' | 'columns'>('columns');
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: kpiCatalog, isLoading: kpisLoading } = useKpiCatalog();
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();

  const kpiCatalogForSelector: KpiCatalogEntry[] = useMemo(() => {
    if (!kpiCatalog || kpiCatalog.length === 0) return [];
    return kpiCatalog.filter(k => k.is_active !== false).map((k: any) => ({
      kpi_id: k.kpi_key,
      kpi_key: k.kpi_key,
      display_name: k.display_name || k.kpi_key,
      description: k.description || '',
      techno_scope: 'both' as const,
      unit: k.unit || '',
      value_type: (k.value_type || 'gauge') as any,
      default_agg: 'avg' as const,
      allowed_aggs: ['avg' as const],
      is_map_supported: false,
      category: k.category || 'Other',
      color: '#3b82f6',
    } as any));
  }, [kpiCatalog]);

  const dimensionOptions = useMemo(() => {
    if (!filterCatalog || filterCatalog.length === 0) return FALLBACK_DIMENSIONS;
    return filterCatalog.filter(f => (f as any).is_active !== false).map(f => f.display_name || f.dimension_key);
  }, [filterCatalog]);

  const patch = (p: Partial<TableWidgetConfig>) => onChange({ tableConfig: { ...config, ...p } });
  const patchData = (p: Partial<TableWidgetConfig['data']>) => patch({ data: { ...config.data, ...p } });
  const setColumns = (cols: TableColumn[]) => patch({ columns: cols });

  const addColumnsFromKeys = (keys: string[]) => {
    const existing = new Set(config.columns.map(c => c.kpiKey));
    const toAdd = keys.filter(k => !existing.has(k));
    if (toAdd.length === 0) return;
    const next: TableColumn[] = toAdd.map((key, idx) => {
      const k = kpiCatalog?.find(x => x.kpi_key === key);
      return {
        id: `col-${Date.now()}-${idx}`,
        kpiKey: key,
        alias: k?.display_name || key,
        unit: k?.unit || '',
        visible: true,
      };
    });
    setColumns([...config.columns, ...next]);
  };

  const removeColumn = (id: string) => setColumns(config.columns.filter(c => c.id !== id));
  const toggleVisible = (id: string) => setColumns(config.columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  const renameColumn = (id: string, alias: string) => setColumns(config.columns.map(c => c.id === id ? { ...c, alias } : c));

  const commit = (closeAfter = false) => {
    onChange({
      tableConfig: config,
      appliedTableConfig: structuredClone(config),
      appliedRev: (widget.appliedRev ?? 0) + 1,
    });
    if (closeAfter) onClose();
  };

  const reset = () => onChange({ tableConfig: { ...DEFAULT_TABLE_CONFIG } });

  return (
    <div className="h-[clamp(20rem,50vh,38rem)] bg-white border-t border-outline-variant/20 shadow-2xl relative z-40 shrink-0">
      <div className="px-8 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Table Settings</span>
          <div className="h-4 w-px bg-outline-variant" />
          <h4 className="font-headline font-bold text-on-surface text-sm">TABLE · {widget.id.slice(0, 18)}</h4>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={reset} className="px-4 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors">Reset</button>
          <button onClick={() => commit(false)} className="px-4 py-1.5 rounded-lg bg-white border border-primary/40 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors">Appliquer</button>
          <button onClick={() => commit(true)} className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm">Save</button>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors" aria-label="Close settings"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex h-full pb-10">
        <aside className="w-48 border-r border-outline-variant/10 p-4 shrink-0 space-y-1">
          {([
            { key: 'columns' as const, label: 'KPI Columns', icon: Database },
            { key: 'data' as const, label: 'Time & Filters', icon: Filter },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn(
                'w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2',
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
              )}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl space-y-5">
            {tab === 'columns' && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-on-surface font-headline">KPI columns</h4>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">Add KPIs to display as columns. Toggle visibility or rename.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SplitByPicker value={config.splitBy} onChange={(v) => patch({ splitBy: v })} />
                    <TopNPicker value={config.topN} onChange={(v) => patch({ topN: v })} />
                    <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm">
                      <Plus className="w-3.5 h-3.5" /> Add KPI
                    </button>
                  </div>
                </div>

                {createPortal(
                  <KpiSelectorModal
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    catalog={kpiCatalogForSelector}
                    selectedKeys={config.columns.map(c => c.kpiKey)}
                    onConfirm={(keys) => { addColumnsFromKeys(keys); setPickerOpen(false); }}
                  />,
                  document.body
                )}

                {config.columns.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-outline-variant/40 p-8 text-center">
                    <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">No columns yet</p>
                    <p className="text-[11px] text-on-surface-variant">Click "Add KPI" to populate the table.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-container-low/40">
                        <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
                          <th className="text-left px-4 py-2.5">KPI key</th>
                          <th className="text-left px-4 py-2.5">Alias</th>
                          <th className="text-left px-4 py-2.5">Unit</th>
                          <th className="text-center px-4 py-2.5 w-16">Visible</th>
                          <th className="text-center px-4 py-2.5 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {config.columns.map((c) => (
                          <tr key={c.id} className="border-t border-outline-variant/10">
                            <td className="px-4 py-2 font-mono text-[11px] text-on-surface">{c.kpiKey}</td>
                            <td className="px-4 py-2">
                              <input
                                value={c.alias || ''}
                                onChange={(e) => renameColumn(c.id, e.target.value)}
                                className="bg-transparent w-full border-none outline-none text-xs font-bold text-on-surface focus:bg-surface-container-low rounded px-1 -mx-1"
                                placeholder={c.kpiKey}
                              />
                            </td>
                            <td className="px-4 py-2 text-[11px] text-on-surface-variant">{c.unit || '—'}</td>
                            <td className="px-4 py-2 text-center">
                              <button onClick={() => toggleVisible(c.id)} className="p-1 rounded hover:bg-surface-container-low transition-colors">
                                {c.visible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant/50" />}
                              </button>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button onClick={() => removeColumn(c.id)} className="p-1 rounded text-error hover:bg-error/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'data' && (
              <DataInheritOrOverride config={config} patchData={patchData} dimensionOptions={dimensionOptions} filtersLoading={filtersLoading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitByPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const display = value || 'Aggregate';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-outline-variant/30 text-[11px] font-bold text-on-surface hover:border-primary transition-colors">
          <span className="text-on-surface-variant uppercase tracking-wide text-[10px]">Split:</span>
          <span className="font-black">{display}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {SPLIT_OPTIONS.map(opt => {
          const v = opt === '__none__' ? null : opt;
          const label = opt === '__none__' ? 'Aggregate (no split)' : opt;
          return (
            <button key={opt} type="button" onClick={() => onChange(v)} className={cn(
              'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
              value === v ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
            )}>
              {label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function TopNPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-outline-variant/30 text-[11px] font-bold text-on-surface hover:border-primary transition-colors">
          <span className="text-on-surface-variant uppercase tracking-wide text-[10px]">Top N:</span>
          <span className="font-black">{value}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1" align="end">
        {TOP_N_OPTIONS.map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className={cn(
            'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
            value === n ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
          )}>
            {n}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DataInheritOrOverride({
  config, patchData, dimensionOptions, filtersLoading,
}: {
  config: TableWidgetConfig;
  patchData: (p: Partial<TableWidgetConfig['data']>) => void;
  dimensionOptions: string[];
  filtersLoading: boolean;
}) {
  const inherits = config.data.timeRange?.inherit !== false && config.data.inheritFromDashboard !== false;

  const technos = usePAGlobalToolbar(s => s.technos);
  const from = usePAGlobalToolbar(s => s.from);
  const to = usePAGlobalToolbar(s => s.to);
  const preset = usePAGlobalToolbar(s => s.preset);
  const grain = usePAGlobalToolbar(s => s.grain);
  const filters = usePAGlobalToolbar(s => s.filters);

  if (inherits) {
    return (
      <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h5 className="text-sm font-black text-on-surface font-headline">Hérite du rapport</h5>
            <p className="text-[11px] text-on-surface-variant mt-0.5 max-w-md">
              Cette table utilise la barre Time &amp; Filters globale. Cliquez sur Override pour la personnaliser.
            </p>
          </div>
          <button
            type="button"
            onClick={() => patchData({ inheritFromDashboard: false, timeRange: { ...config.data.timeRange, inherit: false } })}
            className="shrink-0 h-8 px-3 rounded-full bg-white border border-primary/40 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
          >
            Override
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-primary/10 text-[11px]">
          <div><span className="text-on-surface-variant/70">Périmètre:</span> <span className="font-black">{technos.join(', ').toUpperCase() || '—'}</span></div>
          <div><span className="text-on-surface-variant/70">Période:</span> <span className="font-black">{preset.toUpperCase()} · {grain}</span></div>
          <div className="col-span-2"><span className="text-on-surface-variant/70">Range:</span> <span className="font-bold">{from} → {to}</span></div>
          <div className="col-span-2"><span className="text-on-surface-variant/70">Filtres:</span> <span className="font-bold">{filters.length === 0 ? '—' : filters.map(f => `${f.dimension}=${f.value}`).join(', ')}</span></div>
        </div>
      </div>
    );
  }

  const setFilters = (next: ChartFilterChip[]) => patchData({ filters: next });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5">
        <span className="text-[11px] font-bold text-amber-900">Override actif — cette table ignore la barre du rapport.</span>
        <button
          type="button"
          onClick={() => patchData({ inheritFromDashboard: true, timeRange: { ...config.data.timeRange, inherit: true } })}
          className="text-[10px] font-black uppercase tracking-widest text-amber-900 hover:underline"
        >
          Revenir à l'héritage
        </button>
      </div>
      <PAFilterChips
        filters={config.data.filters}
        onChange={setFilters}
        filterDimensions={dimensionOptions}
        filtersLoading={filtersLoading}
      />
    </div>
  );
}
