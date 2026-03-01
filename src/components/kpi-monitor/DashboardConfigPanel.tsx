import React, { useState } from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { Badge } from '../ui/badge';
import {
  Calendar, Layers, Flag, Plus, X, Check, Filter, RotateCcw, Settings2,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterChip, AddFilterButton } from './DashboardTopBar';

const MILESTONE_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
];

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const WEEK_PRESETS = [
  { label: 'Sem.', offset: 0 },
  { label: 'S-1', offset: 1 },
  { label: 'S-2', offset: 2 },
];

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1j' },
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
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border">
        {/* Header toggle */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dashboard Configuration
              </span>
              <span className="text-[9px] text-muted-foreground/60">
                • {seriesInfo.total} séries • {seriesInfo.granularity}
              </span>
              {seriesInfo.truncated && (
                <Badge variant="destructive" className="text-[8px] h-3.5 px-1.5 py-0">Tronqué</Badge>
              )}
            </div>
            {isOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            }
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1 space-y-2.5">

            {/* ═══════════ ROW 1 — PERIOD + GRANULARITY + APPLY ═══════════ */}
            <div className="flex items-start gap-3">

              {/* ── BLOCK 1: PÉRIODE (largest) ── */}
              <div className="flex-1 min-w-0 rounded-2xl bg-muted/25 border border-border/40 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Période
                  </span>
                </div>

                {/* Date range picker */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                    <input
                      type="date"
                      value={gf.dateFrom}
                      onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                      className="w-full h-[44px] pl-8 pr-3 rounded-xl border border-border/60 bg-background text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/50 font-medium shrink-0">→</span>
                  <div className="relative flex-1">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                    <input
                      type="date"
                      value={gf.dateTo}
                      onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                      className="w-full h-[44px] pl-8 pr-3 rounded-xl border border-border/60 bg-background text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                    />
                  </div>
                </div>

                {/* Preset pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p.days)}
                      className="h-[34px] px-3.5 rounded-xl text-[11px] font-semibold transition-all border border-transparent
                        text-muted-foreground bg-muted/40 hover:bg-primary hover:text-primary-foreground hover:border-primary/30 hover:shadow-sm"
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className="w-px h-5 bg-border/40 mx-0.5" />
                  {WEEK_PRESETS.map(wp => (
                    <button
                      key={wp.label}
                      onClick={() => applyWeekPreset(wp.offset)}
                      className="h-[34px] px-3.5 rounded-xl text-[11px] font-semibold transition-all border border-transparent
                        text-muted-foreground bg-muted/40 hover:bg-primary hover:text-primary-foreground hover:border-primary/30 hover:shadow-sm"
                    >
                      {wp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── BLOCK 2: GRANULARITÉ ── */}
              <div className="w-[180px] shrink-0 rounded-2xl bg-muted/25 border border-border/40 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Granularité
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {GRANULARITIES.map(g => (
                    <button
                      key={g.value}
                      onClick={() => gf.setGranularity(g.value as any)}
                      className={`h-[34px] rounded-xl text-[11px] font-semibold transition-all border ${
                        gf.granularity === g.value
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Milestones mini-control */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/30">
                  <div className="flex items-center gap-1.5">
                    <Flag className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground">Jalons</span>
                    {store.milestones.length > 0 && (
                      <span className="h-4 min-w-[16px] px-1 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center">
                        {store.milestones.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={store.showMilestones}
                      onCheckedChange={store.setShowMilestones}
                      className="h-3.5 w-7 data-[state=checked]:bg-primary"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted/60 transition-all">
                          <Plus className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons X</p>
                          <button
                            onClick={addMilestone}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold w-full justify-center"
                          >
                            <Plus className="w-3 h-3" /> Ajouter un jalon
                          </button>
                          {store.milestones.length === 0 ? (
                            <p className="text-[9px] text-muted-foreground/50 italic text-center py-2">Aucun jalon</p>
                          ) : (
                            <div className="space-y-1 max-h-[160px] overflow-y-auto">
                              {store.milestones.map(m => (
                                <div key={m.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/30 group">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-border hover:scale-110 transition-transform"
                                        style={{ backgroundColor: m.color }}
                                      />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" align="start">
                                      <div className="flex gap-1">
                                        {MILESTONE_COLORS.map(c => (
                                          <button
                                            key={c}
                                            onClick={() => store.updateMilestone(m.id, { color: c })}
                                            className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${m.color === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                            style={{ backgroundColor: c }}
                                          />
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <input
                                    type="date"
                                    value={m.date}
                                    onChange={e => store.updateMilestone(m.id, { date: e.target.value })}
                                    className="px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none w-[100px]"
                                  />
                                  <input
                                    type="text"
                                    value={m.label}
                                    onChange={e => store.updateMilestone(m.id, { label: e.target.value })}
                                    className="flex-1 px-1 py-0.5 rounded border border-border bg-card text-[9px] text-foreground outline-none min-w-0"
                                    placeholder="Label..."
                                  />
                                  <button
                                    onClick={() => store.removeMilestone(m.id)}
                                    className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
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

              {/* ── BLOCK 3: APPLY ── */}
              <div className="w-[120px] shrink-0 rounded-2xl bg-muted/25 border border-border/40 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center justify-center">
                <button
                  onClick={() => toast.success('Configuration appliquée')}
                  className="w-full h-[44px] rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Appliquer
                </button>
                <span className="text-[9px] text-muted-foreground/50 mt-1.5 text-center">
                  {activeFilterCount > 0 ? `${activeFilterCount} filtre(s)` : 'Aucun changement'}
                </span>
              </div>
            </div>

            {/* ═══════════ ROW 2 — FILTERS (full width) ═══════════ */}
            <div className="rounded-2xl bg-muted/25 border border-border/40 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Filtres
                </span>
                {activeFilterCount > 0 && (
                  <span className="h-4 min-w-[18px] px-1.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
                <div className="flex-1" />
                {hasActiveFilters && (
                  <button
                    onClick={gf.clearGlobalFilters}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {/* Filter chips row */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {gf.globalFilters.map(f => (
                  <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />
                ))}
                {gf.crossFilter && (
                  <button
                    onClick={() => gf.setCrossFilter(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/60 text-accent-foreground text-[10px] font-medium hover:bg-accent transition-colors shrink-0"
                  >
                    🔗 {gf.crossFilter.dimension}: {gf.crossFilter.value}
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
                <AddFilterButton />
              </div>
            </div>

          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default DashboardConfigPanel;
