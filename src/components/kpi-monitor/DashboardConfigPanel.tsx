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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b border-border">
        {/* ── Header toggle ── */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-1 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dashboard Configuration
              </span>
              <span className="text-[9px] text-muted-foreground/70">
                • {seriesInfo.total} séries • {seriesInfo.granularity}
              </span>
              {seriesInfo.truncated && (
                <Badge variant="destructive" className="text-[8px] h-3.5 px-1.5 py-0">Tronqué</Badge>
              )}
            </div>
            {isOpen
              ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
              : <ChevronDown className="w-3 h-3 text-muted-foreground" />
            }
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mx-3 mb-2 rounded-xl bg-muted/20 border border-border/50 shadow-sm">
            {/* ═══════════ ROW 1 — SCOPE (Filters) ═══════════ */}
            <div className="flex items-center gap-3 px-4 h-11">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

              {/* Filter chips – scrollable */}
              <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none min-w-0">
                {gf.globalFilters.map(f => (
                  <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />
                ))}
                {gf.crossFilter && (
                  <button
                    onClick={() => gf.setCrossFilter(null)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/60 text-accent-foreground text-[10px] font-medium hover:bg-accent transition-colors shrink-0"
                  >
                    🔗 {gf.crossFilter.dimension}: {gf.crossFilter.value}
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
                <AddFilterButton />
              </div>

              {/* Right side: count + reset + apply */}
              <div className="flex items-center gap-2 shrink-0">
                {activeFilterCount > 0 && (
                  <span className="text-[9px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {activeFilterCount}
                  </span>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={gf.clearGlobalFilters}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
                    title="Reset filters"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => toast.success('Configuration appliquée')}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Check className="w-3 h-3" />
                  Appliquer
                </button>
              </div>
            </div>

            {/* Subtle divider */}
            <div className="mx-4 border-t border-border/40" />

            {/* ═══════════ ROW 2 — TIME & AXIS CONTROL ═══════════ */}
            <div className="flex items-center gap-4 px-4 h-11 flex-wrap">
              {/* ── Date range ── */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={gf.dateFrom}
                  onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                  className="px-1.5 py-0.5 rounded-md border border-border/60 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/40 w-[105px]"
                />
                <span className="text-[10px] text-muted-foreground/60">→</span>
                <input
                  type="date"
                  value={gf.dateTo}
                  onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                  className="px-1.5 py-0.5 rounded-md border border-border/60 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/40 w-[105px]"
                />
              </div>

              {/* ── Presets ── */}
              <div className="flex items-center gap-0.5 shrink-0">
                {[
                  { label: '7D', days: 7 },
                  { label: '14D', days: 14 },
                  { label: '30D', days: 30 },
                  { label: '90D', days: 90 },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      const to = new Date();
                      const from = new Date(to.getTime() - p.days * 86400000);
                      gf.setDateRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
                    }}
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    {p.label}
                  </button>
                ))}
                <div className="w-px h-3.5 bg-border/50 mx-1" />
                {[
                  { label: 'Sem.', offset: 0 },
                  { label: 'S-1', offset: 1 },
                  { label: 'S-2', offset: 2 },
                ].map(wp => (
                  <button
                    key={wp.label}
                    onClick={() => {
                      const now = new Date();
                      const dow = now.getDay() || 7;
                      const mon = new Date(now.getTime() - (dow - 1) * 86400000 - wp.offset * 7 * 86400000);
                      const sun = new Date(mon.getTime() + 6 * 86400000);
                      gf.setDateRange(
                        mon.toISOString().slice(0, 10),
                        wp.offset === 0 ? now.toISOString().slice(0, 10) : sun.toISOString().slice(0, 10),
                      );
                    }}
                    className="px-2 py-0.5 rounded-full text-[9px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    {wp.label}
                  </button>
                ))}
              </div>

              {/* ── Granularity ── */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex items-center rounded-full bg-muted/40 p-0.5">
                  {[
                    { value: 'auto', label: 'Auto' },
                    { value: '15m', label: '15m' },
                    { value: '1h', label: '1h' },
                    { value: '1d', label: '1j' },
                  ].map(g => (
                    <button
                      key={g.value}
                      onClick={() => gf.setGranularity(g.value as any)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                        gf.granularity === g.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Separator ── */}
              <div className="w-px h-4 bg-border/50 shrink-0" />

              {/* ── Milestones (inline with time controls) ── */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 h-6 px-2 rounded-full bg-muted/40 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                      <Flag className="w-3 h-3" />
                      <span>Jalons</span>
                      {store.milestones.length > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary/15 text-primary text-[9px] font-bold leading-none">
                          {store.milestones.length}
                        </span>
                      )}
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

                <Switch
                  checked={store.showMilestones}
                  onCheckedChange={store.setShowMilestones}
                  className="h-3.5 w-7 data-[state=checked]:bg-primary"
                />

                <button
                  onClick={addMilestone}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted/60 transition-all"
                  title="Ajouter un jalon"
                >
                  <Plus className="w-3 h-3" />
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
