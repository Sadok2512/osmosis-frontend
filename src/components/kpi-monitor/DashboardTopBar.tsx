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
import { useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ── Filter Chip ── */
export const FilterChip: React.FC<{ filter: ActiveFilter; allFilters: ActiveFilter[] }> = ({ filter, allFilters }) => {
  const { removeGlobalFilter, updateGlobalFilter, setGlobalFilterValues } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const staticValues = useMemo(() => resolveAvailableValues(filter.dimension, allFilters), [filter.dimension, allFilters]);

  // Always fetch filter values from backend API
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
  const [open, setOpen] = useState(false);
  const filtered = availableValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const toggleValue = (val: string) => {
    const next = filter.values.includes(val) ? filter.values.filter(v => v !== val) : [...filter.values, val];
    setGlobalFilterValues(filter.id, next);
  };
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
const CTL_H = 'h-[26px]';

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const WEEK_PRESETS = [
  { label: 'Sem', offset: 0 },
  { label: 'S-1', offset: 1 },
  { label: 'S-2', offset: 2 },
];

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

  const startEditName = () => { setNameValue(dm.activeTab?.name || ''); setEditingName(true); };
  const commitName = () => { if (nameValue.trim() && dm.activeTab) dm.renameTab(dm.activeTab.id, nameValue.trim()); setEditingName(false); };

  const fmtShort = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

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
    <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">

      {/* ══════════════════════════════════════════════
          ROW 1: Dashboard Header
         ══════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 py-1.5">
        {/* LEFT: Identity */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
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
                  className="text-sm font-bold cursor-pointer hover:text-primary transition-colors truncate max-w-[240px]"
                  style={{ color: currentSettings.theme.titleTextColor || undefined }}
                  onClick={startEditName}
                  title="Cliquez pour renommer"
                >
                  {dm.activeTab?.name || 'KPI Monitor'}
                </h1>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Dashboard Settings"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="text" placeholder="Description..." value={dm.activeTab?.description || ''}
                onChange={e => dm.activeTab && dm.updateDescription(dm.activeTab.id, e.target.value)}
                className="text-[10px] text-muted-foreground bg-transparent border-none outline-none w-[140px] placeholder:text-muted-foreground/40"
              />
              <button onClick={() => dm.activeTab && dm.toggleShared(dm.activeTab.id)}
                className="flex items-center gap-0.5 text-[9px] font-semibold hover:bg-muted px-1 py-0.5 rounded transition-colors"
              >
                {dm.activeTab?.isShared
                  ? <><Globe className="w-2.5 h-2.5 text-primary" /><span className="text-primary">Public</span></>
                  : <><Lock className="w-2.5 h-2.5 text-muted-foreground" /><span className="text-muted-foreground">Privé</span></>
                }
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {editMode && (
            <div className="flex items-center gap-0 rounded-md border border-border bg-muted/30 p-0.5">
              {[
                { icon: Plus, label: 'Chart', onClick: onAddChart },
                { icon: MapIcon, label: 'Map', onClick: onAddMap },
                { icon: Table2, label: 'Table', onClick: onAddTable },
                { icon: Type, label: 'Txt', onClick: onAddText },
                { icon: ImageIcon, label: 'Img', onClick: onAddImage },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick}
                  className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-all"
                ><btn.icon className="w-3 h-3" /> {btn.label}</button>
              ))}
            </div>
          )}
          <button onClick={onToggleEditMode}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
              editMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {editMode ? <><Pencil className="w-3 h-3" /> Edit</> : <><EyeIcon className="w-3 h-3" /> View</>}
          </button>
          <button onClick={onToggleAI}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
              showAI ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          ><Sparkles className="w-3 h-3" /> AI</button>
          {editMode && (
            <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
              <button onClick={() => layoutMode !== 'grid' && onToggleLayout()}
                className={`p-1 rounded transition-all ${layoutMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              ><Grid3X3 className="w-3 h-3" /></button>
              <button onClick={() => layoutMode !== 'free' && onToggleLayout()}
                className={`p-1 rounded transition-all ${layoutMode === 'free' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              ><Move className="w-3 h-3" /></button>
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
          ROW 2: Time controls + Split + Actions
         ══════════════════════════════════════════════ */}
      <div className="flex items-end gap-3 px-4 py-2 border-t border-border/20 bg-muted/10">
        {/* ── A. Date Range ── */}
        <div className="flex items-end gap-2 shrink-0">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Début</span>
            <input type="date" value={gf.dateFrom}
              onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
              className="h-[34px] px-3 rounded-lg border border-border/40 bg-background text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 tabular-nums w-[148px] transition-all"
            />
          </div>
          <span className="text-muted-foreground/30 pb-1.5 text-sm font-medium">→</span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Fin</span>
            <input type="date" value={gf.dateTo}
              onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
              className="h-[34px] px-3 rounded-lg border border-border/40 bg-background text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 tabular-nums w-[148px] transition-all"
            />
          </div>
        </div>

        {/* ── B. Time Settings (grouped card) ── */}
        <div className="rounded-xl border border-border/30 bg-card/60 px-3 py-1.5 shrink-0">
          <div className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest mb-1">Time Settings</div>
          <div className="flex items-center gap-2">
            <select
              onChange={e => { const v = e.target.value; if (v.startsWith('d')) applyPreset(parseInt(v.slice(1))); else if (v.startsWith('w')) applyWeekPreset(parseInt(v.slice(1))); }}
              className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[130px] transition-all"
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
              className="h-[30px] px-2.5 rounded-lg border border-border/30 bg-background text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer w-[100px] transition-all"
            >
              {GRANULARITIES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── C. Split Settings (grouped card) ── */}
        <div className="rounded-xl border border-border/30 bg-card/60 px-3 py-1.5 shrink-0">
          <div className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest mb-1">Split</div>
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

        {/* ── D. Filters + Actions ── */}
        <div className="flex items-end gap-2 ml-auto shrink-0">
          {/* Filter trigger */}
          <div className="flex items-center gap-1.5">
            <AddFilterButton />
            {filterCount > 0 && (
              <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">{filterCount}</span>
            )}
          </div>

          {/* Series info badge */}
          {seriesInfo && seriesInfo.total > 0 && (
            <span className="text-[9px] text-muted-foreground/50 tabular-nums px-2 py-1 rounded-lg bg-muted/30 border border-border/20">
              {seriesInfo.total}s · {seriesInfo.granularity}
            </span>
          )}

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={gf.clearGlobalFilters}
              className="h-[34px] flex items-center gap-1.5 px-3 rounded-lg border border-border/40 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all font-medium"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}

          {/* Apply */}
          <button
            onClick={() => { onApplyConfig?.(); toast.success('Configuration appliquée'); }}
            className="h-[34px] flex items-center gap-1.5 px-4 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
          >
            <Check className="w-3.5 h-3.5" /> Appliquer
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          ROW 3: Active filter chips (dedicated strip)
         ══════════════════════════════════════════════ */}
      {(gf.globalFilters.length > 0 || gf.crossFilter) && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/15 bg-primary/[0.02]">
          <span className="text-[9px] text-muted-foreground/50 font-semibold uppercase tracking-wider shrink-0">Filtres actifs</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {gf.globalFilters.map(f => (
              <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />
            ))}
            {gf.crossFilter && (
              <button
                onClick={() => gf.setCrossFilter(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-semibold hover:bg-violet-500/20 transition-colors shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
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
          // Sync name
          if (settings.name && settings.name !== dm.activeTab?.name) {
            dm.renameTab(dm.activeTabId, settings.name);
          }
          // Sync description
          if (settings.description !== dm.activeTab?.description) {
            dm.updateDescription(dm.activeTabId, settings.description);
          }
          // Sync visibility
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
