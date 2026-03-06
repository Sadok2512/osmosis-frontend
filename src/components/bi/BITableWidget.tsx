import React, { useState, useMemo } from 'react';
import { GripVertical, Trash2, Plus, X, Table2, Settings, Filter, Calendar, LayoutGrid, Check, Search, ChevronDown } from 'lucide-react';
import { BI_KPI_CATALOG, BI_KPI_CATEGORIES, BI_DIMENSIONS, BIDimension, BIKPI, KPI_UNITS, getKpiDisplayName } from './biTypes';
import { getDimensionValues } from './mockBIData';

export interface TableFilter {
  dimension: BIDimension;
  values: string[];
}

export interface TableWidgetConfig {
  id: string;
  type: 'table';
  title: string;
  kpis: BIKPI[];
  dimension: BIDimension;
  xAxisType: 'date' | 'dimension';
  dateFrom?: string;
  dateTo?: string;
  filters: TableFilter[];
  fontSize: number;
  showHeader: boolean;
  striped: boolean;
  compact: boolean;
}

interface Props {
  config: TableWidgetConfig;
  onChange: (config: TableWidgetConfig) => void;
  onDelete: () => void;
}

export function createDefaultTableWidget(id: string): TableWidgetConfig {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 14);
  return {
    id,
    type: 'table',
    title: 'KPI Table',
    kpis: ['qoe_index', 'debit_dl', 'debit_ul', 'dms_debit_dl_3', 'dms_debit_dl_8'],
    dimension: 'Vendor',
    xAxisType: 'dimension',
    dateFrom: start.toISOString().split('T')[0],
    dateTo: end.toISOString().split('T')[0],
    filters: [],
    fontSize: 11,
    showHeader: true,
    striped: true,
    compact: false,
  };
}

// Seeded random for stable table data
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function generateTableData(config: TableWidgetConfig) {
  const rng = seededRng(config.id.charCodeAt(0) * 100 + config.kpis.length);
  const dimValues = getDimensionValues(config.dimension);

  const kpiRanges: Record<string, [number, number]> = {
    volume_totale: [50, 500], debit_dl: [10, 150], debit_ul: [5, 80],
    dl_ul_ratio: [40, 95], debit_dl_max: [50, 300], debit_ul_max: [20, 150],
    rtt_setup_avg: [10, 80], rtt_data_avg: [15, 100],
    loss_dl_rate: [0, 5], loss_ul_rate: [0, 5],
    tcp_retr_rate_1: [0, 10], tcp_retr_rate_3: [0, 8], tcp_retr_rate_5: [0, 6], tcp_retr_rate_10: [0, 4],
    dms_dl_3: [60, 99], dms_dl_8: [40, 95], dms_dl_30: [10, 70],
    dms_ul_1: [70, 99], dms_ul_3: [50, 95], dms_ul_5: [30, 85],
    session_nbr: [1000, 50000], session_dcr: [0, 5],
    fallback_5G_to_4G_rate: [0, 15], instability_rate: [0, 10],
    'time_rat_5g_%': [20, 80], bad_session_rate: [0, 10], qoe_index: [500, 900],
  };

  return dimValues.map(dim => {
    const row: Record<string, any> = { dimension: dim };
    for (const kpi of config.kpis) {
      const [min, max] = kpiRanges[kpi] || [0, 100];
      row[kpi] = +(min + rng() * (max - min)).toFixed(2);
    }
    return row;
  });
}

const getKpiColor = (kpi: string, value: number): string => {
  if (kpi.includes('dms_') || kpi === 'qoe_index') {
    if (kpi === 'qoe_index') {
      return value >= 750 ? 'text-emerald-600' : value >= 600 ? 'text-amber-600' : 'text-red-600';
    }
    return value >= 75 ? 'text-emerald-600' : value >= 50 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('loss') || kpi.includes('retr') || kpi.includes('bad_') || kpi.includes('dcr') || kpi.includes('instability') || kpi.includes('fallback')) {
    return value <= 2 ? 'text-emerald-600' : value <= 5 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('rtt')) {
    return value <= 30 ? 'text-emerald-600' : value <= 60 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('debit')) {
    return value >= 50 ? 'text-emerald-600' : value >= 20 ? 'text-amber-600' : 'text-red-600';
  }
  return 'text-foreground';
};

/* ─── KPI Selector Modal ─── */
const KpiSelectorModal: React.FC<{
  selected: BIKPI[];
  onConfirm: (kpis: BIKPI[]) => void;
  onClose: () => void;
}> = ({ selected, onConfirm, onClose }) => {
  const [draft, setDraft] = useState<BIKPI[]>([...selected]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toggle = (key: string) => {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filteredKpis = BI_KPI_CATALOG.filter(k => {
    const matchSearch = !search || k.display_name.toLowerCase().includes(search.toLowerCase()) || k.key.toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCategory || k.category === activeCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[560px] max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Select KPIs</span>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{draft.length} selected</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {/* Search */}
        <div className="px-5 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              placeholder="Search KPIs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-5 py-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
              !activeCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >All</button>
          {BI_KPI_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
                activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >{cat}</button>
          ))}
        </div>

        {/* KPI grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="grid grid-cols-2 gap-1.5">
            {filteredKpis.map(kpi => {
              const isSelected = draft.includes(kpi.key);
              return (
                <button key={kpi.key} onClick={() => toggle(kpi.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/30 ring-1 ring-primary/20'
                      : 'bg-muted/20 border border-transparent hover:bg-muted/40'
                  }`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-primary border-primary' : 'border-border'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-foreground truncate">{kpi.display_name}</div>
                    <div className="text-[9px] text-muted-foreground">{kpi.category}{kpi.unit ? ` • ${kpi.unit}` : ''}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
          <button onClick={() => setDraft([])} className="text-[10px] text-muted-foreground hover:text-foreground">Clear all</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={() => { onConfirm(draft); onClose(); }}
              className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">
              Confirm ({draft.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Filter Selector ─── */
const FilterRow: React.FC<{
  filter: TableFilter;
  onChange: (f: TableFilter) => void;
  onRemove: () => void;
}> = ({ filter, onChange, onRemove }) => {
  const dimValues = getDimensionValues(filter.dimension);
  const [open, setOpen] = useState(false);

  const toggleValue = (v: string) => {
    const values = filter.values.includes(v) ? filter.values.filter(x => x !== v) : [...filter.values, v];
    onChange({ ...filter, values });
  };

  return (
    <div className="flex items-center gap-2 bg-muted/20 rounded-lg px-2 py-1.5 border border-border/50">
      <select
        value={filter.dimension}
        onChange={e => onChange({ ...filter, dimension: e.target.value as BIDimension, values: [] })}
        className="text-[10px] bg-transparent border-none outline-none text-foreground font-semibold w-20"
      >
        {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <div className="relative flex-1">
        <button onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full px-2 py-0.5 text-[10px] bg-background border border-border rounded text-foreground">
          <span className="truncate">{filter.values.length ? `${filter.values.length} selected` : 'Select...'}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg max-h-[150px] overflow-auto p-1.5">
            {dimValues.map(v => (
              <label key={v} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] hover:bg-muted/40 rounded cursor-pointer">
                <input type="checkbox" checked={filter.values.includes(v)} onChange={() => toggleValue(v)} className="rounded w-3 h-3" />
                <span className="text-foreground">{v}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <button onClick={onRemove} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

const BITableWidget: React.FC<Props> = ({ config: rawConfig, onChange, onDelete }) => {
  // Backfill defaults for configs saved before new fields existed
  const config = useMemo(() => ({
    ...rawConfig,
    filters: rawConfig.filters || [],
    xAxisType: rawConfig.xAxisType || 'dimension',
    kpis: rawConfig.kpis || [],
  }), [rawConfig]);

  const [showSettings, setShowSettings] = useState(false);
  const [showKpiModal, setShowKpiModal] = useState(false);
  const tableData = useMemo(() => generateTableData(config), [config]);

  const removeKpi = (kpi: BIKPI) => {
    onChange({ ...config, kpis: config.kpis.filter(k => k !== kpi) });
  };

  const addFilter = () => {
    const used = config.filters.map(f => f.dimension);
    const next = BI_DIMENSIONS.find(d => !used.includes(d)) || BI_DIMENSIONS[0];
    onChange({ ...config, filters: [...config.filters, { dimension: next, values: [] }] });
  };

  return (
    <div className="w-full h-full flex flex-col bg-card rounded-xl border border-border overflow-hidden group">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <Table2 className="w-3.5 h-3.5 text-primary" />
        <input
          className="flex-1 text-xs font-semibold bg-transparent outline-none text-foreground min-w-0"
          value={config.title}
          onChange={e => onChange({ ...config, title: e.target.value })}
        />
        <button onClick={() => setShowKpiModal(true)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Select KPIs">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setShowSettings(!showSettings)}
          className={`p-1 rounded hover:bg-muted transition-colors ${showSettings ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`} title="Settings">
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Modal */}
      {showKpiModal && (
        <KpiSelectorModal
          selected={config.kpis}
          onConfirm={kpis => onChange({ ...config, kpis })}
          onClose={() => setShowKpiModal(false)}
        />
      )}

      {/* Settings: each section in its own box */}
      {showSettings && (
        <div className="p-2.5 space-y-2 border-b border-border bg-background/50 shrink-0 overflow-auto max-h-[50%]">
          {/* ── X AXIS Box ── */}
          <div className="rounded-lg border border-border bg-muted/10 p-2.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
              <LayoutGrid className="w-3 h-3" /> X Axis
            </label>
            <div className="flex gap-1 mb-2">
              <button onClick={() => onChange({ ...config, xAxisType: 'date' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  config.xAxisType === 'date' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}>
                <Calendar className="w-3 h-3" /> Date
              </button>
              <button onClick={() => onChange({ ...config, xAxisType: 'dimension' })}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  config.xAxisType === 'dimension' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}>
                <LayoutGrid className="w-3 h-3" /> Dimension
              </button>
            </div>
            {config.xAxisType === 'date' ? (
              <div className="flex items-center gap-2">
                <input type="date" value={config.dateFrom || ''} onChange={e => onChange({ ...config, dateFrom: e.target.value })}
                  className="text-[10px] bg-background border border-border rounded px-2 py-1 text-foreground outline-none flex-1" />
                <span className="text-[10px] text-muted-foreground">→</span>
                <input type="date" value={config.dateTo || ''} onChange={e => onChange({ ...config, dateTo: e.target.value })}
                  className="text-[10px] bg-background border border-border rounded px-2 py-1 text-foreground outline-none flex-1" />
              </div>
            ) : (
              <select value={config.dimension} onChange={e => onChange({ ...config, dimension: e.target.value as BIDimension })}
                className="text-[10px] bg-background border border-border rounded px-2 py-1.5 text-foreground outline-none w-full">
                {BI_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {/* ── FILTERS Box ── */}
          <div className="rounded-lg border border-border bg-muted/10 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filters
              </label>
              <button onClick={addFilter}
                className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-semibold">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {config.filters.map((f, i) => (
                <FilterRow key={i} filter={f}
                  onChange={nf => {
                    const filters = [...config.filters];
                    filters[i] = nf;
                    onChange({ ...config, filters });
                  }}
                  onRemove={() => onChange({ ...config, filters: config.filters.filter((_, j) => j !== i) })}
                />
              ))}
              {config.filters.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic px-1">No filters applied</div>
              )}
            </div>
          </div>

          {/* ── Display Options ── */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={config.striped} onChange={e => onChange({ ...config, striped: e.target.checked })} className="rounded w-3 h-3 accent-primary" />
              Striped
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={config.compact} onChange={e => onChange({ ...config, compact: e.target.checked })} className="rounded w-3 h-3 accent-primary" />
              Compact
            </label>
          </div>
        </div>
      )}

      {/* Active KPI tags */}
      {config.kpis.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-border bg-background/50 shrink-0">
          {config.kpis.map(kpi => (
            <span key={kpi} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-medium">
              {getKpiDisplayName(kpi)}
              <button onClick={() => removeKpi(kpi)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {config.filters.filter(f => f.values.length > 0).map((f, i) => (
            <span key={`f-${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground text-[9px] font-medium">
              <Filter className="w-2.5 h-2.5" />
              {f.dimension}: {f.values.join(', ')}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {config.kpis.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Click <Plus className="w-3 h-3 mx-1 inline" /> to add KPIs
          </div>
        ) : (
          <table className="w-full text-left" style={{ fontSize: config.fontSize }}>
            {config.showHeader && (
              <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
                <tr>
                  <th className={`${config.compact ? 'px-2 py-1' : 'px-3 py-2'} font-bold text-foreground border-b border-border`}>
                    {config.xAxisType === 'date' ? 'Date' : config.dimension}
                  </th>
                  {config.kpis.map(kpi => (
                    <th key={kpi} className={`${config.compact ? 'px-2 py-1' : 'px-3 py-2'} font-bold text-foreground border-b border-border text-right`}>
                      <span className="whitespace-nowrap">{getKpiDisplayName(kpi)}</span>
                      {KPI_UNITS[kpi] && <span className="text-muted-foreground font-normal ml-1">({KPI_UNITS[kpi]})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className={`${config.striped && i % 2 === 1 ? 'bg-muted/20' : ''} hover:bg-muted/40 transition-colors`}>
                  <td className={`${config.compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} font-medium text-foreground border-b border-border/50`}>
                    {row.dimension}
                  </td>
                  {config.kpis.map(kpi => (
                    <td key={kpi} className={`${config.compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} text-right font-mono border-b border-border/50 ${getKpiColor(kpi, row[kpi])}`}>
                      {row[kpi]?.toLocaleString('fr-FR')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BITableWidget;
