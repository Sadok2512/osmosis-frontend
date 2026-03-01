import React, { useState, useMemo } from 'react';
import { useDashboardManager } from '../bi/DashboardManager';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
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
  RotateCcw, Search, Check, Share2, Pencil, EyeIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/* ── Filter Chip ── */
export const FilterChip: React.FC<{ filter: ActiveFilter; allFilters: ActiveFilter[] }> = ({ filter, allFilters }) => {
  const { removeGlobalFilter, updateGlobalFilter, setGlobalFilterValues } = useGlobalFilterStore();
  const dim = FILTER_DIMENSIONS.find(d => d.key === filter.dimension);
  const availableValues = useMemo(() => resolveAvailableValues(filter.dimension, allFilters), [filter.dimension, allFilters]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = availableValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const toggleValue = (val: string) => {
    const next = filter.values.includes(val) ? filter.values.filter(v => v !== val) : [...filter.values, val];
    setGlobalFilterValues(filter.id, next);
  };
  const label = dim?.label || filter.dimension;
  const valueLabel = filter.values.length === 0 ? 'Tous' : filter.values.length <= 2 ? filter.values.join(', ') : `${filter.values.length} sel.`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="group flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background hover:bg-muted/60 transition-all text-[11px] font-medium">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-[9px] text-muted-foreground/50">{filter.op}</span>
          <span className="text-foreground font-semibold max-w-[140px] truncate">{valueLabel}</span>
          <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
          <button onClick={e => { e.stopPropagation(); removeGlobalFilter(filter.id); }} className="ml-0.5 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="w-2.5 h-2.5" />
          </button>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-1">
            {(['IN', 'NOT_IN', 'EQ'] as FilterOp[]).map(op => (
              <button key={op} onClick={() => updateGlobalFilter(filter.id, { op })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${filter.op === op ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >{op.replace('_', ' ')}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." autoFocus
              className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <button onClick={() => setGlobalFilterValues(filter.id, [...availableValues])} className="text-primary hover:underline font-medium">Tout</button>
            <span className="text-muted-foreground/30">•</span>
            <button onClick={() => setGlobalFilterValues(filter.id, [])} className="text-muted-foreground hover:underline font-medium">Aucun</button>
            <span className="ml-auto text-muted-foreground">{filter.values.length}/{availableValues.length}</span>
          </div>
          <div className="max-h-44 overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">Aucun résultat</p>
            ) : filtered.map(val => {
              const selected = filter.values.includes(val);
              return (
                <button key={val} onClick={() => toggleValue(val)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors ${selected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-primary border-primary' : 'border-border'}`}>
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
        <button className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
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
}

const DashboardTopBar: React.FC<DashboardTopBarProps> = ({
  dm, onSave, onExportPDF, onShowPrintPreview, onToggleAI, showAI,
  onToggleCSV, csvCount,
  onAddChart, onAddMap, onAddText, onAddImage, onAddTable,
  layoutMode, onToggleLayout, onCreateNew,
  editMode, onToggleEditMode,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const { globalFilters, clearGlobalFilters, crossFilter, setCrossFilter } = useGlobalFilterStore();
  const hasActiveFilters = globalFilters.some(f => f.values.length > 0) || crossFilter !== null;
  const activeCount = globalFilters.filter(f => f.values.length > 0).length;

  const startEditName = () => { setNameValue(dm.activeTab?.name || ''); setEditingName(true); };
  const commitName = () => { if (nameValue.trim() && dm.activeTab) dm.renameTab(dm.activeTab.id, nameValue.trim()); setEditingName(false); };

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
      {/* ── Row 1: Dashboard identity + filters + actions ── */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* LEFT: Identity block */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
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
              <h1 className="text-sm font-bold text-foreground cursor-pointer hover:text-primary transition-colors truncate max-w-[240px]"
                onClick={startEditName} title="Cliquez pour renommer"
              >{dm.activeTab?.name || 'KPI Monitor'}</h1>
            )}
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

        {/* SEPARATOR */}
        <div className="w-px h-8 bg-border shrink-0" />

        {/* Spacer to push actions right */}
        <div className="flex-1" />

        {/* SEPARATOR */}
        <div className="w-px h-8 bg-border shrink-0" />

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Add widget (only in edit mode) */}
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

          {/* Edit/View toggle */}
          <button onClick={onToggleEditMode}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
              editMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {editMode ? <><Pencil className="w-3 h-3" /> Edit</> : <><EyeIcon className="w-3 h-3" /> View</>}
          </button>

          {/* AI */}
          <button onClick={onToggleAI}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
              showAI ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          ><Sparkles className="w-3 h-3" /> AI</button>

          {/* Layout toggle (edit mode only) */}
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

          {/* Actions menu */}
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
    </div>
  );
};

export default DashboardTopBar;
