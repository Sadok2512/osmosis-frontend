import React from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { Badge } from '../ui/badge';
import {
  Calendar, Layers, Flag, Plus, X, Check, Filter, RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterChip, AddFilterButton } from './DashboardTopBar';
import { cn } from '@/lib/utils';

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
  { label: 'Sem', offset: 0 },
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

  const activeFilterCount = gf.globalFilters.filter(f => f.values.length > 0).length;
  const hasActiveFilters = activeFilterCount > 0 || gf.crossFilter !== null;
  const hasAnyFilters = gf.globalFilters.length > 0 || gf.crossFilter !== null;

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

  // Check which preset is currently active
  const getActivePreset = () => {
    const to = new Date(gf.dateTo + 'T00:00:00');
    const from = new Date(gf.dateFrom + 'T00:00:00');
    const diff = Math.round((to.getTime() - from.getTime()) / 86400000);
    const p = PRESETS.find(p => p.days === diff);
    return p?.label || null;
  };
  const activePreset = getActivePreset();

  return (
    <div className="border-b border-border/60 bg-muted/10">
      <div className="flex gap-3 px-3 py-2.5">

        {/* ── Block 1: Période ── */}
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Période</span>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={gf.dateFrom}
              onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
              className="h-[28px] px-1.5 rounded-md border border-border/50 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 w-[110px]"
            />
            <span className="text-[10px] text-muted-foreground/40">→</span>
            <input
              type="date"
              value={gf.dateTo}
              onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
              className="h-[28px] px-1.5 rounded-md border border-border/50 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/20 w-[110px]"
            />
          </div>

          {/* Presets vertical */}
          <div className="flex flex-col gap-0.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className={cn(
                  'h-[22px] px-2 rounded-md text-[10px] font-semibold transition-all text-left',
                  activePreset === p.label
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="h-px bg-border/30 my-0.5" />
            {WEEK_PRESETS.map(wp => (
              <button
                key={wp.label}
                onClick={() => applyWeekPreset(wp.offset)}
                className="h-[22px] px-2 rounded-md text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left"
              >
                {wp.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Separator ── */}
        <div className="w-px bg-border/40 self-stretch shrink-0" />

        {/* ── Block 2: Granularité ── */}
        <div className="flex flex-col gap-1.5 min-w-[80px]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Granularité</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {GRANULARITIES.map(g => (
              <button
                key={g.value}
                onClick={() => gf.setGranularity(g.value as any)}
                className={cn(
                  'h-[22px] px-2 rounded-md text-[10px] font-semibold transition-all text-left flex items-center gap-2',
                  gf.granularity === g.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className={cn(
                  'w-2.5 h-2.5 rounded-full border-2 flex items-center justify-center shrink-0',
                  gf.granularity === g.value ? 'border-primary-foreground' : 'border-muted-foreground/40'
                )}>
                  {gf.granularity === g.value && (
                    <div className="w-1 h-1 rounded-full bg-primary-foreground" />
                  )}
                </div>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Separator ── */}
        <div className="w-px bg-border/40 self-stretch shrink-0" />

        {/* ── Block 3: Jalons + Info + Apply ── */}
        <div className="flex flex-col gap-1.5 min-w-[100px]">
          <div className="flex items-center gap-1.5">
            <Flag className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Jalons</span>
            <Switch
              checked={store.showMilestones}
              onCheckedChange={store.setShowMilestones}
              className="h-3 w-6 data-[state=checked]:bg-primary ml-auto"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-[22px] px-2 rounded-md text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {store.milestones.length > 0 ? `${store.milestones.length} jalon(s)` : 'Ajouter'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons</p>
                <button
                  onClick={addMilestone}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-semibold w-full justify-center"
                >
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
                {store.milestones.length === 0 ? (
                  <p className="text-[9px] text-muted-foreground/50 italic text-center py-1">Aucun jalon</p>
                ) : (
                  <div className="space-y-1 max-h-[160px] overflow-y-auto">
                    {store.milestones.map(m => (
                      <div key={m.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/30 group">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className="w-3 h-3 rounded-full shrink-0 border border-border hover:scale-110 transition-transform"
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

          {/* Series info */}
          <div className="mt-auto pt-1">
            <span className="text-[9px] text-muted-foreground/50 tabular-nums block">
              {seriesInfo.total}s • {seriesInfo.granularity}
            </span>
            {seriesInfo.truncated && (
              <Badge variant="destructive" className="text-[8px] h-3.5 px-1 py-0 mt-0.5">Tronqué</Badge>
            )}
          </div>

          {/* Apply */}
          <button
            onClick={() => toast.success('Configuration appliquée')}
            className="h-[30px] px-3 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 justify-center mt-1"
          >
            <Check className="w-3.5 h-3.5" />
            Appliquer
          </button>
        </div>

        {/* ── Separator ── */}
        {hasAnyFilters && <div className="w-px bg-border/40 self-stretch shrink-0" />}

        {/* ── Block 4: Active Filters ── */}
        {hasAnyFilters && (
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Filtres actifs</span>
              {hasActiveFilters && (
                <button
                  onClick={gf.clearGlobalFilters}
                  className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors font-medium"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gf.globalFilters.map(f => (
                <FilterChip key={f.id} filter={f} allFilters={gf.globalFilters} />
              ))}
              {gf.crossFilter && (
                <button
                  onClick={() => gf.setCrossFilter(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/60 text-accent-foreground text-[9px] font-medium hover:bg-accent transition-colors shrink-0"
                >
                  🔗 {gf.crossFilter.dimension}: {gf.crossFilter.value}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardConfigPanel;
