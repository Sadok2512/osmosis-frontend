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
  RotateCcw, Search, Check, Pencil, EyeIcon, Settings, Calendar, Flag,
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

const MILESTONE_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
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
  onAddChart, onAddMap, onAddText, onAddImage, onAddTable,
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

  const addMilestone = () => {
    store.addMilestone({
      id: crypto.randomUUID(),
      date: gf.dateFrom,
      label: 'Jalon',
      color: MILESTONE_COLORS[store.milestones.length % MILESTONE_COLORS.length],
    });
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
          ROW 2: Time + Filter controls (wraps if needed)
         ══════════════════════════════════════════════ */}
      <div className="flex items-center gap-2.5 px-4 py-1.5 border-t border-border/30 flex-wrap">
        {/* Date range — both inputs visible */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium leading-tight">Début</span>
              <input type="date" value={gf.dateFrom}
                onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                className="h-[36px] px-3 rounded-md border border-border/50 bg-background text-[14px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 tabular-nums w-[160px]"
              />
            </div>
            <span className="text-muted-foreground/40 mt-4 text-base">→</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium leading-tight">Fin</span>
              <input type="date" value={gf.dateTo}
                onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                className="h-[36px] px-3 rounded-md border border-border/50 bg-background text-[14px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 tabular-nums w-[160px]"
              />
            </div>
          </div>
        </div>

        {/* Presets stacked: period + week + granularity */}
        <div className="flex flex-col gap-1 shrink-0">
          {/* Period presets row */}
          <div className="flex items-center rounded-md border border-border/40 bg-muted/30 overflow-hidden h-[30px]">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(p.days)}
                className={cn(
                  'px-3 text-[12px] font-semibold transition-all h-full',
                  i > 0 && 'border-l border-border/30',
                  'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                )}
              >{p.label}</button>
            ))}
            <div className="w-px h-3.5 bg-border/50" />
            {WEEK_PRESETS.map(wp => (
              <button key={wp.label} onClick={() => applyWeekPreset(wp.offset)}
                className="px-3 text-[12px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all h-full border-l border-border/30"
              >{wp.label}</button>
            ))}
          </div>
          {/* Granularity row */}
          <div className="flex items-center rounded-md border border-border/40 bg-muted/30 overflow-hidden h-[30px]">
            {GRANULARITIES.map((g, i) => (
              <button key={g.value} onClick={() => gf.setGranularity(g.value as any)}
                className={cn(
                  'px-3 text-[12px] font-semibold transition-all h-full flex-1 text-center',
                  i > 0 && 'border-l border-border/30',
                  gf.granularity === g.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >{g.label}</button>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(CTL_H, 'px-1.5 rounded-md border border-border/40 bg-muted/30 flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0')}>
              <Flag className="w-3 h-3" />
              {store.milestones.length > 0 && (
                <span className="text-[8px] font-bold text-primary">{store.milestones.length}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons</p>
                <Switch checked={store.showMilestones} onCheckedChange={store.setShowMilestones} className="h-3.5 w-7 data-[state=checked]:bg-primary" />
              </div>
              <button onClick={addMilestone}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold w-full justify-center"
              ><Plus className="w-3 h-3" /> Ajouter</button>
              {store.milestones.length === 0 ? (
                <p className="text-[9px] text-muted-foreground/50 italic text-center py-1">Aucun jalon</p>
              ) : (
                <div className="space-y-1 max-h-[160px] overflow-y-auto">
                  {store.milestones.map(m => (
                    <div key={m.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/30 group">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-3 h-3 rounded-full shrink-0 border border-border hover:scale-110 transition-transform" style={{ backgroundColor: m.color }} />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="flex gap-1">
                            {MILESTONE_COLORS.map(c => (
                              <button key={c} onClick={() => store.updateMilestone(m.id, { color: c })}
                                className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${m.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <input type="date" value={m.date} onChange={e => store.updateMilestone(m.id, { date: e.target.value })}
                        className="px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none w-[100px]" />
                      <input type="text" value={m.label} onChange={e => store.updateMilestone(m.id, { label: e.target.value })}
                        className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0" placeholder="Label..." />
                      <button onClick={() => store.removeMilestone(m.id)}
                        className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      ><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-4 bg-border/40 shrink-0" />

        {/* Filter controls */}
        <div className="flex items-center gap-1 shrink-0">
          <Filter className="w-3 h-3 text-muted-foreground/40" />
          <AddFilterButton />
          {filterCount > 0 && (
            <span className="text-[9px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0 leading-4">{filterCount}</span>
          )}
        </div>

        {/* Series info */}
        {seriesInfo && (
          <>
            <span className="text-[8px] text-muted-foreground/40 tabular-nums shrink-0">
              {seriesInfo.total}s • {seriesInfo.granularity}
            </span>
            {seriesInfo.truncated && (
              <Badge variant="destructive" className="text-[7px] h-3 px-1 py-0">Tronqué</Badge>
            )}
          </>
        )}

        <div className="flex-1 min-w-0" />

        {/* Reset + Apply aligned right */}
        {hasActiveFilters && (
          <button
            onClick={gf.clearGlobalFilters}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors font-medium shrink-0"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
        )}
        <button
          onClick={() => { onApplyConfig?.(); toast.success('Configuration appliquée'); }}
          className={cn(CTL_H, 'px-3 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-all flex items-center gap-1 shrink-0')}
        >
          <Check className="w-3 h-3" /> Appliquer
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          ROW 4: Active filter chips display
         ══════════════════════════════════════════════ */}
      {(gf.globalFilters.length > 0 || gf.crossFilter) && (
        <div className="flex items-center gap-1.5 px-4 py-1 border-t border-border/30 flex-wrap">
          {gf.globalFilters.map(f => (
            <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />
          ))}
          {gf.crossFilter && (
            <button
              onClick={() => gf.setCrossFilter(null)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/60 text-accent-foreground text-[9px] font-medium hover:bg-accent transition-colors shrink-0"
            >
              🔗 {gf.crossFilter.dimension}: {gf.crossFilter.value}
              <X className="w-2.5 h-2.5" />
            </button>
          )}
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
