import React, { useState } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { Badge } from '../ui/badge';
import {
  ChevronUp, ChevronDown, Settings2, Calendar, Layers, Flag,
  Plus, X, Check, Filter, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterChip, AddFilterButton } from './DashboardTopBar';

const MILESTONE_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface DashboardConfigPanelProps {
  seriesInfo: { total: number; granularity: string; truncated: boolean };
}

const DashboardConfigPanel: React.FC<DashboardConfigPanelProps> = ({ seriesInfo }) => {
  const gf = useGlobalFilterStore();
  const store = useKpiMonitorStore();
  const [isOpen, setIsOpen] = useState(true);

  const activeFilterCount = gf.globalFilters.filter(f => f.values.length > 0).length;
  const hasActiveFilters = activeFilterCount > 0 || gf.crossFilter !== null;

  const addMilestone = () => {
    store.addMilestone({
      id: crypto.randomUUID(),
      date: gf.dateFrom,
      label: 'Jalon',
      color: MILESTONE_COLORS[store.milestones.length % MILESTONE_COLORS.length],
    });
  };

  const formatDate = (d: string) => {
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border bg-card/50">
        {/* ── Collapse toggle header ── */}
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
          <div className="px-4 pb-2 pt-0.5 space-y-1">
            {/* ═══ ROW 1: Filters ═══ */}
            <div className="flex items-center gap-1.5 min-h-[28px]">
              <Filter className="w-3 h-3 text-primary shrink-0" />
              <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
                {gf.globalFilters.map(f => <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />)}
                {gf.crossFilter && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-medium cursor-pointer shrink-0" onClick={() => gf.setCrossFilter(null)}>
                    🔗 {gf.crossFilter.dimension}: {gf.crossFilter.value}
                    <X className="w-2.5 h-2.5" />
                  </Badge>
                )}
                <AddFilterButton />
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="text-[8px] h-4 px-1 shrink-0">{activeFilterCount}</Badge>
                )}
                {hasActiveFilters && (
                  <button onClick={gf.clearGlobalFilters} className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* ── Separator ── */}
              <div className="w-px h-5 bg-border shrink-0" />

              {/* ── Apply button ── */}
              <button
                onClick={() => toast.success('Configuration appliquée')}
                className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-colors shadow-sm shrink-0"
              >
                <Check className="w-3 h-3" />
                Appliquer
              </button>
            </div>

            {/* ═══ ROW 2: Date + Granularity + Milestones — all inline ═══ */}
            <div className="flex items-center gap-2 min-h-[28px]">
              {/* ── Date range ── */}
              <Calendar className="w-3 h-3 text-primary shrink-0" />
              <input type="date" value={gf.dateFrom}
                onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                className="px-1 py-0.5 rounded border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 w-[100px] shrink-0"
              />
              <span className="text-[9px] text-muted-foreground">→</span>
              <input type="date" value={gf.dateTo}
                onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                className="px-1 py-0.5 rounded border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30 w-[100px] shrink-0"
              />

              {/* Date presets */}
              <div className="flex items-center gap-0 rounded border border-border bg-muted/30 p-0.5 shrink-0">
                {['7D', '14D', '30D', '90D'].map(preset => {
                  const days = parseInt(preset);
                  return (
                    <button key={preset} onClick={() => {
                      const to = new Date();
                      const from = new Date(to.getTime() - days * 86400000);
                      gf.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                    }}
                      className="px-1.5 py-0.5 text-[9px] font-bold rounded hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                    >{preset}</button>
                  );
                })}
              </div>

              {/* Week presets */}
              <div className="flex items-center gap-0 rounded border border-border bg-muted/30 p-0.5 shrink-0">
                {[
                  { label: 'Sem.', offset: 0 },
                  { label: 'S-1', offset: 1 },
                  { label: 'S-2', offset: 2 },
                ].map(wp => (
                  <button key={wp.label} onClick={() => {
                    const now = new Date();
                    const dow = now.getDay() || 7;
                    const mon = new Date(now.getTime() - (dow - 1) * 86400000 - wp.offset * 7 * 86400000);
                    const sun = new Date(mon.getTime() + 6 * 86400000);
                    gf.setDateRange(mon.toISOString().slice(0, 10), wp.offset === 0 ? now.toISOString().slice(0, 10) : sun.toISOString().slice(0, 10));
                  }}
                    className="px-1.5 py-0.5 text-[9px] font-bold rounded hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                  >{wp.label}</button>
                ))}
              </div>

              {/* ── Separator ── */}
              <div className="w-px h-5 bg-border shrink-0" />

              {/* ── Granularity ── */}
              <Layers className="w-3 h-3 text-primary shrink-0" />
              <div className="flex items-center gap-0 rounded border border-border bg-muted/30 p-0.5 shrink-0">
                {[
                  { value: 'auto', label: 'Auto' },
                  { value: '15m', label: '15m' },
                  { value: '1h', label: '1h' },
                  { value: '1d', label: '1j' },
                ].map(g => (
                  <button key={g.value} onClick={() => gf.setGranularity(g.value as any)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                      gf.granularity === g.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-card'
                    }`}
                  >{g.label}</button>
                ))}
              </div>

              {/* ── Separator ── */}
              <div className="w-px h-5 bg-border shrink-0" />

              {/* ── Milestones compact ── */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Flag className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-muted-foreground">{store.milestones.length}</span>
                <Switch checked={store.showMilestones} onCheckedChange={store.setShowMilestones}
                  className="h-3 w-6 data-[state=checked]:bg-primary" />

                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[9px] font-semibold">
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons X</p>
                      <button onClick={addMilestone}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold w-full justify-center"
                      ><Plus className="w-3 h-3" /> Ajouter un jalon</button>
                      {store.milestones.length === 0 ? (
                        <p className="text-[9px] text-muted-foreground/60 italic text-center py-2">Aucun jalon</p>
                      ) : (
                        <div className="space-y-1 max-h-[160px] overflow-y-auto">
                          {store.milestones.map(m => (
                            <div key={m.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/30 group">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="w-3.5 h-3.5 rounded-full shrink-0 border border-border hover:scale-110 transition-transform" style={{ backgroundColor: m.color }} />
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
                              <input type="date" value={m.date}
                                onChange={e => store.updateMilestone(m.id, { date: e.target.value })}
                                className="px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none w-[100px]"
                              />
                              <input type="text" value={m.label}
                                onChange={e => store.updateMilestone(m.id, { label: e.target.value })}
                                className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0"
                                placeholder="Label..."
                              />
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
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default DashboardConfigPanel;
