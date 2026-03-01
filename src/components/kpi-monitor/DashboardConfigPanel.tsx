import React, { useState, useMemo } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import {
  FILTER_DIMENSIONS,
  resolveAvailableValues,
  ActiveFilter,
  FilterOp,
} from '@/config/filterDimensions';
import { Badge } from '../ui/badge';
import {
  ChevronUp, ChevronDown, Calendar, Layers, Settings2, Flag, Plus, X, Palette, Check,
  Filter, Search, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterChip, AddFilterButton } from './DashboardTopBar';

const PRESET_MILESTONE_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
];

/* ── Main Dashboard Config Panel (global level) ── */
interface DashboardConfigPanelProps {
  seriesInfo: { total: number; granularity: string; truncated: boolean };
}

const DashboardConfigPanel: React.FC<DashboardConfigPanelProps> = ({ seriesInfo }) => {
  const globalFilter = useGlobalFilterStore();
  const store = useKpiMonitorStore();
  const [isOpen, setIsOpen] = useState(true);

  const addMilestone = () => {
    store.addMilestone({
      id: crypto.randomUUID(),
      date: globalFilter.dateFrom,
      label: 'Jalon',
      color: PRESET_MILESTONE_COLORS[store.milestones.length % PRESET_MILESTONE_COLORS.length],
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border bg-card/50">
        {/* Toggle header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-1 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dashboard Configuration</span>
              <span className="text-[9px] text-muted-foreground">
                • {seriesInfo.total} séries • {seriesInfo.granularity}
              </span>
              {seriesInfo.truncated && <Badge variant="destructive" className="text-[8px] h-4">Tronqué</Badge>}
            </div>
            {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1">
            <div className="flex gap-3 flex-wrap">
              {/* ── PÉRIODE ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 w-[240px] shrink-0">
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
                {/* Week presets */}
                <div className="flex gap-0.5 rounded border border-border bg-muted/30 p-0.5">
                  {[
                    { label: 'Sem. en cours', offset: 0 },
                    { label: 'Sem. -1', offset: 1 },
                    { label: 'Sem. -2', offset: 2 },
                  ].map(wp => (
                    <button key={wp.label} onClick={() => {
                      const now = new Date();
                      const dayOfWeek = now.getDay() || 7;
                      const monday = new Date(now.getTime() - (dayOfWeek - 1) * 86400000 - wp.offset * 7 * 86400000);
                      const sunday = new Date(monday.getTime() + 6 * 86400000);
                      globalFilter.setDateRange(monday.toISOString().slice(0, 10), wp.offset === 0 ? now.toISOString().slice(0, 10) : sunday.toISOString().slice(0, 10));
                    }}
                      className="flex-1 px-1 py-0.5 text-[8px] font-bold rounded hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                    >{wp.label}</button>
                  ))}
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

              {/* ── JALONS X (MILESTONES) ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 flex-1 min-w-[260px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flag className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons X</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-pointer">
                      <Switch checked={store.showMilestones} onCheckedChange={store.setShowMilestones}
                        className="h-3.5 w-7 data-[state=checked]:bg-primary" />
                      Afficher
                    </label>
                    <button onClick={addMilestone}
                      className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold"
                    ><Plus className="w-3 h-3" /> Ajouter</button>
                  </div>
                </div>
                {store.milestones.length === 0 ? (
                  <p className="text-[9px] text-muted-foreground/60 italic">Aucun jalon configuré</p>
                ) : (
                  <div className="space-y-1 max-h-[100px] overflow-y-auto">
                    {store.milestones.map(m => (
                      <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 group">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <input type="date" value={m.date}
                          onChange={e => store.updateMilestone(m.id, { date: e.target.value })}
                          className="px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0 w-[110px]"
                        />
                        <input type="text" value={m.label}
                          onChange={e => store.updateMilestone(m.id, { label: e.target.value })}
                          className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0"
                          placeholder="Label..."
                        />
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="w-4 h-4 rounded shrink-0 border border-border" style={{ backgroundColor: m.color }} />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="start">
                            <div className="flex gap-1">
                              {PRESET_MILESTONE_COLORS.map(c => (
                                <button key={c} onClick={() => store.updateMilestone(m.id, { color: c })}
                                  className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${m.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                  style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button onClick={() => store.removeMilestone(m.id)}
                          className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── FILTRES ── */}
              <div className="rounded-lg border border-border bg-background p-2.5 space-y-1.5 flex-1 min-w-[260px]">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filtres</span>
                  {globalFilter.globalFilters.filter(f => f.values.length > 0).length > 0 && (
                    <Badge variant="secondary" className="text-[8px] h-4 px-1.5">
                      {globalFilter.globalFilters.filter(f => f.values.length > 0).length}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {globalFilter.globalFilters.map(f => (
                    <FilterChip key={f.id} filter={f} allFilters={globalFilter.globalFilters} />
                  ))}
                  {globalFilter.crossFilter && (
                    <Badge variant="outline" className="gap-1 text-[10px] font-medium cursor-pointer" onClick={() => globalFilter.setCrossFilter(null)}>
                      🔗 {globalFilter.crossFilter.dimension}: {globalFilter.crossFilter.value}
                      <X className="w-2.5 h-2.5" />
                    </Badge>
                  )}
                  <AddFilterButton />
                  {(globalFilter.globalFilters.some(f => f.values.length > 0) || globalFilter.crossFilter) && (
                    <button onClick={globalFilter.clearGlobalFilters} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                      <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                  )}
                </div>
                {globalFilter.globalFilters.length === 0 && (
                  <p className="text-[9px] text-muted-foreground/60 italic">Aucun filtre configuré</p>
                )}
              </div>

              {/* ── BOUTON APPLIQUER ── */}
              <div className="flex items-center shrink-0 self-end">
                <button
                  onClick={() => toast.success('Configuration dashboard appliquée')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default DashboardConfigPanel;
