import React, { useState } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { KpiCatalogEntry, SplitDimension, GraphType } from './types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  ChevronUp, ChevronDown, Calendar, Layers, BarChart3, GitBranch,
  X, Plus, Settings2, Database, MoreHorizontal, Palette,
  TrendingUp, AreaChart, BarChart, Layers2, CircleDot,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import KPICatalogImport from './KPICatalogImport';
import { Button } from '../ui/button';

const SPLIT_OPTIONS: { value: SplitDimension; label: string }[] = [
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const GRAPH_TYPES: { value: GraphType; label: string; icon: React.ElementType }[] = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'bar', label: 'Bar', icon: BarChart },
  { value: 'stacked_area', label: 'Stacked', icon: Layers2 },
  { value: 'scatter', label: 'Scatter', icon: CircleDot },
];

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#22c55e',
];

/* ── KPI Row Component ── */
const KpiRow: React.FC<{
  kpiKey: string;
  catalogMap: Record<string, KpiCatalogEntry>;
}> = ({ kpiKey, catalogMap }) => {
  const store = useKpiMonitorStore();
  const kpi = store.selectedKpis.find(k => k.kpi_key === kpiKey);
  const cat = catalogMap[kpiKey];
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!kpi) return null;

  const displayColor = kpi.color || cat?.color || '#3b82f6';
  const displayName = cat?.display_name || kpiKey;
  const graphType = kpi.graphType || 'line';

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group">
      {/* Color dot */}
      <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
        <PopoverTrigger asChild>
          <button className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border hover:ring-primary transition-all cursor-pointer"
            style={{ backgroundColor: displayColor }} title="Changer la couleur" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => { store.updateKpi(kpiKey, { color: c }); setShowColorPicker(false); }}
                className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${displayColor === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* KPI Name */}
      <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0" title={cat?.description || displayName}>
        {displayName}
      </span>

      {/* Axis L/R toggle */}
      <div className="flex items-center rounded border border-border bg-background overflow-hidden shrink-0">
        <button onClick={() => store.updateKpi(kpiKey, { axis: 'left' })}
          className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${kpi.axis === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >L</button>
        <button onClick={() => store.updateKpi(kpiKey, { axis: 'right' })}
          className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${kpi.axis === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >R</button>
      </div>

      {/* Split per-KPI dropdown */}
      <div className="flex items-center gap-0.5 shrink-0">
        <GitBranch className="w-2.5 h-2.5 text-muted-foreground/60" />
        <Select value={kpi.splitOverride === null ? 'none' : kpi.splitOverride || 'none'} onValueChange={v => store.updateKpi(kpiKey, { splitOverride: v === 'none' ? null : v as SplitDimension })}>
          <SelectTrigger className="h-5 w-[78px] text-[9px] px-1.5 border-border bg-background">
            <SelectValue placeholder="Split" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-[10px]">Aucun</SelectItem>
            {SPLIT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-[10px]">{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Graph type dropdown */}
      <Select value={graphType} onValueChange={v => store.updateKpi(kpiKey, { graphType: v as GraphType })}>
        <SelectTrigger className="h-5 w-[68px] text-[9px] px-1.5 border-border bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRAPH_TYPES.map(g => (
            <SelectItem key={g.value} value={g.value} className="text-[10px]">
              <div className="flex items-center gap-1"><g.icon className="w-3 h-3" /> {g.label}</div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Remove button */}
      <button onClick={() => store.removeKpi(kpiKey)}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Retirer">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

/* ── Main Config Panel ── */
interface DashboardConfigPanelProps {
  catalogMap: Record<string, KpiCatalogEntry>;
  onOpenKpiSelector: () => void;
  seriesInfo: { total: number; granularity: string; truncated: boolean };
  catalog: KpiCatalogEntry[];
  catalogSource: 'static' | 'db';
  onRefreshCatalog: () => void;
}

const DashboardConfigPanel: React.FC<DashboardConfigPanelProps> = ({
  catalogMap, onOpenKpiSelector, seriesInfo, catalog, catalogSource, onRefreshCatalog,
}) => {
  const globalFilter = useGlobalFilterStore();
  const store = useKpiMonitorStore();
  const [isOpen, setIsOpen] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border bg-card/50">
        {/* Toggle header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-1 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Configuration</span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                {store.selectedKpis.length} KPI{store.selectedKpis.length > 1 ? 's' : ''}
              </Badge>
              <span className="text-[9px] text-muted-foreground">
                • {seriesInfo.total} séries • {seriesInfo.granularity}
              </span>
              {seriesInfo.truncated && <Badge variant="destructive" className="text-[8px] h-4">Tronqué</Badge>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground">
                {catalogSource === 'db' ? '✓ DB' : 'Statique'} • {catalog.length} KPIs
              </span>
              {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1">
            <div className="flex gap-3">
              {/* ── PÉRIODE ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 w-[200px] shrink-0">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</span>
                </div>
                <div className="flex gap-1">
                  <input type="date" value={globalFilter.dateFrom}
                    onChange={e => globalFilter.setDateRange(e.target.value, globalFilter.dateTo)}
                    className="flex-1 px-1.5 py-1 rounded border border-border bg-card text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 min-w-0"
                  />
                  <input type="date" value={globalFilter.dateTo}
                    onChange={e => globalFilter.setDateRange(globalFilter.dateFrom, e.target.value)}
                    className="flex-1 px-1.5 py-1 rounded border border-border bg-card text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 min-w-0"
                  />
                </div>
                <div className="flex gap-0.5 rounded border border-border bg-muted/30 p-0.5">
                  {['7D', '14D', '30D', '90D'].map(preset => {
                    const days = parseInt(preset);
                    return (
                      <button key={preset} onClick={() => {
                        const to = new Date();
                        const from = new Date(to.getTime() - days * 86400000);
                        globalFilter.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                      }}
                        className="flex-1 px-1 py-0.5 text-[9px] font-bold rounded hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                      >{preset}</button>
                    );
                  })}
                </div>
              </div>

              {/* ── GRANULARITÉ ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 w-[140px] shrink-0">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Granularité</span>
                </div>
                <div className="flex gap-0.5 rounded border border-border bg-muted/30 p-0.5">
                  {[
                    { value: 'auto', label: 'Auto' },
                    { value: '15m', label: '15m' },
                    { value: '1h', label: '1h' },
                    { value: '1d', label: '1j' },
                  ].map(g => (
                    <button key={g.value} onClick={() => globalFilter.setGranularity(g.value as any)}
                      className={`flex-1 px-1 py-1 rounded text-[9px] font-bold transition-all ${
                        globalFilter.granularity === g.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card'
                      }`}
                    >{g.label}</button>
                  ))}
                </div>
                <p className="text-[8px] text-muted-foreground">
                  {globalFilter.granularity === 'auto' ? 'Auto selon période' : `Fixé: ${globalFilter.granularity}`}
                </p>
              </div>

              {/* ── KPIs (MAIN – flexible) ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPIs</span>
                  </div>
                  <button onClick={onOpenKpiSelector}
                    className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
                  ><Plus className="w-3 h-3" /> Ajouter</button>
                </div>
                {store.selectedKpis.length === 0 ? (
                  <button onClick={onOpenKpiSelector}
                    className="w-full py-4 rounded-md border border-dashed border-border hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-primary text-[10px]"
                  ><BarChart3 className="w-3.5 h-3.5" /> Sélectionner des KPIs</button>
                ) : (
                  <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                    {store.selectedKpis.map(kpi => (
                      <KpiRow key={kpi.kpi_key} kpiKey={kpi.kpi_key} catalogMap={catalogMap} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default DashboardConfigPanel;
