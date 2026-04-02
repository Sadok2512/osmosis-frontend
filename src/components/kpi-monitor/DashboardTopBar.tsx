import React, { useState, useMemo } from 'react';
import { useDashboardManager } from '../bi/DashboardManager';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import {
  FILTER_DIMENSIONS,
  resolveAvailableValues,
  ActiveFilter,
  FilterOp,
} from '@/config/filterDimensions';
import {
  Plus, Save, FileDown, Copy, FolderOpen, Eye, Globe, Lock,
  MoreHorizontal, Sparkles, FileSpreadsheet, BarChart3, Map as MapIcon,
  Table2, Type, ImageIcon, Grid3X3, Move, ChevronDown, X, Filter,
  RotateCcw, Search, Check, Pencil, EyeIcon, Settings, Calendar,
  Activity,
} from 'lucide-react';
import DashboardSettingsPopup from './DashboardSettingsPopup';
import DateRangePicker from './DateRangePicker';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ── Filter Chip Popover Content (reusable) ── */
const FilterChipPopoverContent: React.FC<{ filter: ActiveFilter; allFilters: ActiveFilter[] }> = ({ filter, allFilters }) => {
  const { updateGlobalFilter, setGlobalFilterValues } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const staticValues = useMemo(() => resolveAvailableValues(filter.dimension, allFilters), [filter.dimension, allFilters]);

  const [backendValues, setBackendValues] = useState<string[]>([]);
  React.useEffect(() => {
    const dimMap: Record<string, string> = {
      dor: 'DOR', constructeur: 'Vendor', plaque: 'Plaque', site: 'Site', cell: 'Cell',
      zone_arcep: 'ARCEP', techno: 'TECHNO', vendor: 'Vendor', bande: 'BAND',
    };
    const dimKey = dimMap[filter.dimension] || filter.dimension;
    import('./api/kpiMonitorApi').then(mod => {
      mod.fetchDimensionValues(dimKey).then(d => { if (d.values) setBackendValues(d.values); }).catch(() => {});
    });
  }, [filter.dimension]);

  const availableValues = backendValues.length > 0 ? backendValues : staticValues;
  const [search, setSearch] = useState('');
  const filtered = availableValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const toggleValue = (val: string) => {
    const next = filter.values.includes(val) ? filter.values.filter(v => v !== val) : [...filter.values, val];
    setGlobalFilterValues(filter.id, next);
  };
  const label = dim?.label || filter.dimension;

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            {(['IN', 'NOT_IN', 'EQ'] as FilterOp[]).map(op => (
              <button key={op} onClick={() => updateGlobalFilter(filter.id, { op })}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${filter.op === op ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >{op.replace('_', ' ')}</button>
            ))}
          </div>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
          {filter.values.length}/{availableValues.length}
        </span>
      </div>
      <div className="p-2.5 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." autoFocus
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border/60 bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setGlobalFilterValues(filter.id, [...availableValues])}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 transition-colors">
            Tout sélectionner
          </button>
          <button onClick={() => setGlobalFilterValues(filter.id, [])}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors">
            Effacer
          </button>
        </div>
        <div className="max-h-52 overflow-y-auto space-y-0.5 rounded-lg border border-border/40 bg-muted/10 p-1">
          {filtered.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50 text-center py-4 italic">Aucun résultat</p>
          ) : filtered.map(val => {
            const selected = filter.values.includes(val);
            return (
              <button key={val} onClick={() => toggleValue(val)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] text-left transition-all ${
                  selected ? 'bg-primary/8 text-foreground font-medium' : 'hover:bg-muted/60 text-muted-foreground'
                }`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all border ${
                  selected ? 'bg-primary border-primary shadow-sm' : 'border-border/80 bg-background'
                }`}>
                  {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="truncate">{val}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

/* ── Filter Chip (inline version for ROW 2 add-filter) ── */
export const FilterChip: React.FC<{ filter: ActiveFilter; allFilters: ActiveFilter[] }> = ({ filter, allFilters }) => {
  const { removeGlobalFilter } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const [open, setOpen] = useState(false);
  const label = dim?.label || filter.dimension;
  const firstValue = filter.values[0];
  const extraCount = filter.values.length - 1;
  const isEmpty = filter.values.length === 0;
  const tooltipText = filter.values.join('\n');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group inline-flex items-center h-[26px] rounded-md border border-border/50 bg-background hover:bg-muted/30 hover:border-border transition-all text-[11px] shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden"
          title={tooltipText}
        >
          <span className="px-2 h-full flex items-center bg-muted/50 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide border-r border-border/40">
            {label}
          </span>
          <span className="px-1.5 text-[9px] text-muted-foreground/50 font-medium uppercase">
            {filter.op.replace('_', ' ')}
          </span>
          {isEmpty ? (
            <span className="text-muted-foreground/40 italic text-[10px] pr-1">Tous</span>
          ) : (
            <span className="flex items-center gap-1 pr-1">
              <span className="text-foreground font-medium max-w-[160px] truncate">{firstValue}</span>
              {extraCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-[18px] px-1 rounded-full bg-primary/10 text-primary text-[9px] font-bold">
                  +{extraCount}
                </span>
              )}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground/40 mr-1 shrink-0" />
          <span
            role="button"
            onClick={e => { e.stopPropagation(); removeGlobalFilter(filter.id); }}
            className="h-full px-1.5 flex items-center border-l border-border/30 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
        <FilterChipPopoverContent filter={filter} allFilters={allFilters} />
      </PopoverContent>
    </Popover>
  );
};

/* ── Add Filter Button ── */
export const AddFilterButton: React.FC = () => {
  const { addGlobalFilter } = useGlobalFilterStore();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-md border border-dashed border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/30 transition-all">
          <Plus className="w-3 h-3" /> Filtre
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Dimension</p>
        {FILTER_DIMENSIONS.map(dim => (
          <button key={dim.key} onClick={() => { addGlobalFilter(dim.key); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors font-medium text-foreground"
          >{dim.label}</button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

/* ── Constants ── */
const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1j' },
  { value: '1w', label: '1sem' },
  { value: '1M', label: '1mois' },
];

/* ── Props ── */
interface DashboardTopBarProps {
  dm: ReturnType<typeof useDashboardManager>;
  onSave: () => void;
  onExportPDF: () => void;
  onShowPrintPreview: () => void;
  onToggleAI: () => void;
  showAI: boolean;
  onToggleCSV: () => void;
  csvCount: number;
  onAddChart: () => void;
  onAddMap: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddTable: () => void;
  onAddKpiCard?: () => void;
  layoutMode: 'grid' | 'free';
  onToggleLayout: () => void;
  onCreateNew: () => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  seriesInfo?: { total: number; granularity: string; truncated: boolean };
  onApplyConfig?: () => void;
}

const DashboardTopBar: React.FC<DashboardTopBarProps> = ({
  dm, onSave, onExportPDF, onShowPrintPreview, onToggleAI, showAI,
  onToggleCSV, csvCount,
  onAddChart, onAddMap, onAddText, onAddImage, onAddTable, onAddKpiCard,
  layoutMode, onToggleLayout, onCreateNew,
  editMode, onToggleEditMode,
  seriesInfo, onApplyConfig,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const gf = useGlobalFilterStore();
  const store = useKpiMonitorStore();
  const dashSettings = useDashboardSettingsStore();
  const currentSettings = dashSettings.getSettings(dm.activeTabId, dm.activeTab?.name);
  const filterCount = gf.globalFilters.filter(f => f.values.length > 0).length + (gf.crossFilter ? 1 : 0);
  const hasActiveFilters = filterCount > 0;
  const activeFilterCount = gf.globalFilters.filter(f => f.values.length > 0).length;

  const startEditName = () => { setNameValue(dm.activeTab?.name || ''); setEditingName(true); };
  const commitName = () => { if (nameValue.trim() && dm.activeTab) dm.renameTab(dm.activeTab.id, nameValue.trim()); setEditingName(false); };

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    gf.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  };

  const applyWeekPreset = (offset: number) => {
    const now = new Date();
    const dow = now.getDay() || 7;
    const mon = new Date(now.getTime() - (dow - 1) * 86400000 - offset * 7 * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    gf.setDateRange(
      mon.toISOString().slice(0, 10),
      offset === 0 ? now.toISOString().slice(0, 10) : sun.toISOString().slice(0, 10),
    );
  };

  return (
    <div className="sticky top-0 z-40 mx-3 mt-2 mb-1 rounded-xl border border-border/40 bg-card/95 backdrop-blur-md shadow-[0_2px_12px_hsl(var(--foreground)/0.04)]">

      {/* ══════════════════════════════════════════════
          ROW 1: Dashboard Header
         ══════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-5 py-2.5">
        {/* LEFT: Identity */}
        <div className="flex items-center gap-3 min-w-0 shrink-0 rounded-lg border border-border/30 bg-muted/20 px-3 py-1.5">
          <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {editingName ? (
                <input
                  className="text-sm font-bold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0 w-[200px]"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                />
              ) : (
                <h1
                  className="text-base font-bold cursor-pointer hover:text-primary transition-colors truncate max-w-[280px]"
                  style={{ color: currentSettings.theme.titleTextColor || undefined }}
                  onClick={startEditName}
                  title="Cliquez pour renommer"
                >
                  {dm.activeTab?.name || 'KPI Monitor'}
                </h1>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Dashboard Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="text" placeholder="Description..." value={dm.activeTab?.description || ''}
                onChange={e => dm.activeTab && dm.updateDescription(dm.activeTab.id, e.target.value)}
                className="text-[10px] text-muted-foreground bg-transparent border-none outline-none w-[140px] placeholder:text-muted-foreground/40"
              />
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border cursor-default ${
                  dm.activeTab?.isShared
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-muted/50 text-muted-foreground border-border/50'
                }`}
                title="Configurable dans Settings"
              >
                {dm.activeTab?.isShared
                  ? <><Globe className="w-2.5 h-2.5" /> Public</>
                  : <><Lock className="w-2.5 h-2.5" /> Privé</>
                }
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            "flex items-center gap-0 rounded-lg border bg-muted/30 p-1 transition-opacity",
            editMode ? "border-primary/50 opacity-100" : "border-border opacity-50 pointer-events-none"
          )}>
            {[
              { icon: Plus, label: 'Chart', onClick: onAddChart },
              { icon: MapIcon, label: 'Map', onClick: onAddMap },
              { icon: Table2, label: 'Table', onClick: onAddTable },
              { icon: Activity, label: 'KPI', onClick: onAddKpiCard },
              { icon: Type, label: 'Txt', onClick: onAddText },
              { icon: ImageIcon, label: 'Img', onClick: onAddImage },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick}
                className="flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-all"
              ><btn.icon className="w-4 h-4" /> {btn.label}</button>
            ))}
          </div>
          <div className="w-[2px] h-7 bg-primary/70 rounded-full mx-2" />
          <button onClick={onToggleEditMode}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              editMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {editMode ? <><Pencil className="w-4 h-4" /> Edit</> : <><EyeIcon className="w-4 h-4" /> View</>}
          </button>
          <button onClick={onToggleAI}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              showAI ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          ><Sparkles className="w-4 h-4" /> AI</button>
          {editMode && (
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
              <button onClick={() => layoutMode !== 'grid' && onToggleLayout()}
                className={`p-1.5 rounded-md transition-all ${layoutMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              ><Grid3X3 className="w-4 h-4" /></button>
              <button onClick={() => layoutMode !== 'free' && onToggleLayout()}
                className={`p-1.5 rounded-md transition-all ${layoutMode === 'free' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              ><Move className="w-4 h-4" /></button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onSave}><Save className="w-3.5 h-3.5 mr-2" /> Sauvegarder</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dm.duplicateDashboard(dm.activeTabId)}><Copy className="w-3.5 h-3.5 mr-2" /> Dupliquer</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dm.setShowList(!dm.showList)}><FolderOpen className="w-3.5 h-3.5 mr-2" /> Charger</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onShowPrintPreview}><Eye className="w-3.5 h-3.5 mr-2" /> Aperçu</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPDF}><FileDown className="w-3.5 h-3.5 mr-2" /> Export PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleCSV}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Données {csvCount > 0 && `(${csvCount})`}</DropdownMenuItem>
              <DropdownMenuItem onClick={onCreateNew}><Plus className="w-3.5 h-3.5 mr-2" /> Nouveau</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          ROW 2: Grouped control sections (cards)
         ══════════════════════════════════════════════ */}
      <div className="flex items-stretch gap-2.5 px-5 py-2.5 border-t border-border/20 overflow-x-auto">

        {/* ── Section: Date Range ── */}
        <div className="rounded-xl border border-border/30 bg-card/80 px-3 py-2 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Calendar className="w-3 h-3 text-primary/60" />
            <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-widest">Plage de dates</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={gf.dateFrom}
              onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
              className="h-[30px] px-2.5 rounded-lg border border-border/40 bg-background text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 tabular-nums w-[135px] transition-all"
            />
            <span className="text-muted-foreground/30 text-xs font-medium">→</span>
            <input type="date" value={gf.dateTo}
              onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
              className="h-[30px] px-2.5 rounded-lg border border-border/40 bg-background text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 tabular-nums w-[135px] transition-all"
            />
          </div>
        </div>

        {/* ── Section: Time Settings ── */}
        <div className="rounded-xl border border-border/30 bg-card/80 px-3 py-2 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-3 h-3 text-primary/60" />
            <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-widest">Période & Granularité</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              onChange={e => { const v = e.target.value; if (v.startsWith('d')) applyPreset(parseInt(v.slice(1))); else if (v.startsWith('w')) applyWeekPreset(parseInt(v.slice(1))); }}
              className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[120px] transition-all"
              defaultValue=""
            >
              <option value="" disabled>Période...</option>
              <option value="d7">7 jours</option>
              <option value="d14">14 jours</option>
              <option value="d30">30 jours</option>
              <option value="d90">90 jours</option>
              <option disabled>─────</option>
              <option value="w0">Cette semaine</option>
              <option value="w1">Semaine -1</option>
              <option value="w2">Semaine -2</option>
            </select>
            <div className="w-px h-5 bg-border/30" />
            <select
              value={gf.granularity}
              onChange={e => gf.setGranularity(e.target.value as any)}
              className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[90px] transition-all"
            >
              {GRANULARITIES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── Section: Split ── */}
        <div className="rounded-xl border border-border/30 bg-card/80 px-3 py-2 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Grid3X3 className="w-3 h-3 text-primary/60" />
            <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-widest">Split</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={store.splitBy || ''}
              onChange={e => store.setSplitBy(e.target.value ? e.target.value as any : null)}
              className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[110px] transition-all"
            >
              <option value="">Aucun</option>
              <option value="SITE">Site</option>
              <option value="CELL">Cellule</option>
              <option value="PLAQUE">Plaque</option>
              <option value="DOR">DOR</option>
              <option value="VENDOR">Vendor</option>
              <option value="TECHNO">Techno</option>
              <option value="BAND">Bande</option>
              <option value="ARCEP">Zone ARCEP</option>
            </select>
            {store.splitBy && (
              <>
                <div className="w-px h-5 bg-border/30" />
                <select
                  value={store.topN}
                  onChange={e => store.setTopN(Number(e.target.value))}
                  className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[75px] transition-all"
                >
                  {[3, 5, 10, 15, 20, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        {/* ── Section: Filters ── */}
        <div className="rounded-xl border border-border/30 bg-card/80 px-3 py-2 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Filter className="w-3 h-3 text-primary/60" />
            <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-widest">Filtres</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[hsl(160_60%_40%/0.15)] text-[hsl(160_60%_35%)] text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <AddFilterButton />
            {hasActiveFilters && (
              <button
                onClick={gf.clearGlobalFilters}
                className="h-[26px] flex items-center gap-1 px-2 rounded-lg text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all font-medium border border-border/30"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1 min-w-0" />

        {/* ── Actions ── */}
        <div className="flex items-end gap-2 shrink-0">
          {seriesInfo && seriesInfo.total > 0 && (
            <span className="text-[9px] text-muted-foreground/50 tabular-nums px-2 py-1 rounded-lg bg-muted/30 border border-border/20 self-end mb-0.5">
              {seriesInfo.total}s · {seriesInfo.granularity}
            </span>
          )}
          <button
            onClick={() => { onApplyConfig?.(); toast.success('Configuration appliquée'); }}
            className="h-[34px] flex items-center gap-1.5 px-5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 self-end"
          >
            <Check className="w-3.5 h-3.5" /> Appliquer
          </button>
        </div>
      </div>

      {/* ── Visual separator ── */}
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      {/* ══════════════════════════════════════════════
          ROW 3: Active filter chips — green highlighted
         ══════════════════════════════════════════════ */}
      {(gf.globalFilters.length > 0 || gf.crossFilter) && (
        <div className="flex items-center gap-2.5 px-5 py-2 bg-[hsl(160_50%_50%/0.03)] rounded-b-xl">
          <span className="text-[9px] text-[hsl(160_50%_35%)] font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            Filtres actifs
          </span>
          <div className="w-px h-4 bg-[hsl(160_40%_50%/0.2)]" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {gf.globalFilters.map(f => {
              const dim = FILTER_DIMENSIONS.find(d => d.key === f.dimension);
              const hasValues = f.values.length > 0;
              return (
                <Popover key={f.id}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'group inline-flex items-center h-[28px] rounded-lg border text-[11px] shrink-0 overflow-hidden transition-all',
                        hasValues
                          ? 'border-[hsl(160_50%_45%/0.3)] bg-[hsl(160_50%_50%/0.06)] hover:bg-[hsl(160_50%_50%/0.12)] shadow-[0_1px_3px_hsl(160_50%_40%/0.08)]'
                          : 'border-border/50 bg-background hover:bg-muted/30'
                      )}
                      title={f.values.join('\n')}
                    >
                      <span className={cn(
                        'px-2 h-full flex items-center font-semibold text-[10px] uppercase tracking-wide border-r',
                        hasValues
                          ? 'bg-[hsl(160_50%_50%/0.08)] text-[hsl(160_50%_30%)] border-[hsl(160_50%_45%/0.2)]'
                          : 'bg-muted/50 text-muted-foreground border-border/40'
                      )}>
                        {dim?.label || f.dimension}
                      </span>
                      <span className={cn(
                        'px-1.5 text-[9px] font-medium uppercase',
                        hasValues ? 'text-[hsl(160_40%_40%/0.5)]' : 'text-muted-foreground/50'
                      )}>
                        {f.op.replace('_', ' ')}
                      </span>
                      {f.values.length === 0 ? (
                        <span className="text-muted-foreground/40 italic text-[10px] pr-1.5">Tous</span>
                      ) : (
                        <span className="flex items-center gap-1 pr-1.5">
                          <span className={cn(
                            'font-medium max-w-[160px] truncate',
                            'text-[hsl(160_40%_20%)]'
                          )}>{f.values[0]}</span>
                          {f.values.length > 1 && (
                            <span className="inline-flex items-center justify-center h-4 min-w-[18px] px-1 rounded-full bg-[hsl(160_50%_45%/0.15)] text-[hsl(160_50%_35%)] text-[9px] font-bold">
                              +{f.values.length - 1}
                            </span>
                          )}
                        </span>
                      )}
                      <ChevronDown className={cn(
                        'w-3 h-3 mr-1 shrink-0',
                        hasValues ? 'text-[hsl(160_40%_50%/0.4)]' : 'text-muted-foreground/40'
                      )} />
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); gf.removeGlobalFilter(f.id); }}
                        className="h-full px-1.5 flex items-center border-l border-border/20 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
                    <FilterChipPopoverContent filter={f} allFilters={gf.globalFilters} />
                  </PopoverContent>
                </Popover>
              );
            })}
            {gf.crossFilter && (
              <button
                onClick={() => gf.setCrossFilter(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[hsl(270_50%_55%/0.1)] border border-[hsl(270_50%_55%/0.2)] text-[hsl(270_50%_45%)] text-[10px] font-semibold hover:bg-[hsl(270_50%_55%/0.2)] transition-colors shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(270_50%_55%)]" />
                {gf.crossFilter.dimension}: {gf.crossFilter.value}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Settings Popup */}
      <DashboardSettingsPopup
        open={showSettings}
        onClose={() => setShowSettings(false)}
        dashboardId={dm.activeTabId}
        dashboardName={dm.activeTab?.name || 'Dashboard'}
        dashboardDescription={dm.activeTab?.description || ''}
        dashboardIsShared={dm.activeTab?.isShared ?? false}
        onApply={(settings) => {
          if (settings.name && settings.name !== dm.activeTab?.name) {
            dm.renameTab(dm.activeTabId, settings.name);
          }
          if (settings.description !== dm.activeTab?.description) {
            dm.updateDescription(dm.activeTabId, settings.description);
          }
          const isCurrentlyShared = dm.activeTab?.isShared ?? false;
          const shouldBeShared = settings.visibility === 'public';
          if (isCurrentlyShared !== shouldBeShared) {
            dm.toggleShared(dm.activeTabId);
          }
        }}
      />
    </div>
  );
};

export default DashboardTopBar;
