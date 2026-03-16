import React from 'react';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { Badge } from '../ui/badge';
import {
  Calendar, Flag, Plus, X, Check, Filter, RotateCcw,
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

const CTL_H = 'h-[26px]';

const DashboardConfigPanel: React.FC<DashboardConfigPanelProps> = ({ seriesInfo }) => {
  const gf = useGlobalFilterStore();
  const store = useKpiMonitorStore();

  const hasActiveFilters = gf.globalFilters.some(f => f.values.length > 0) || gf.crossFilter !== null;
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

  const fmtShort = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="border-b border-border/60 bg-muted/10">

      {/* ── Row 1: Filters ── */}
      {hasAnyFilters && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/30 min-h-[30px] flex-wrap">
          <Filter className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          <AddFilterButton />
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
          {hasActiveFilters && (
            <button
              onClick={gf.clearGlobalFilters}
              className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors font-medium shrink-0"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          )}
        </div>
      )}

      {/* ── Row 2: Time controls ── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(CTL_H, 'px-2 rounded-md border border-border/50 bg-background text-[10px] font-medium text-foreground hover:border-primary/40 transition-all flex items-center gap-1')}>
              <Calendar className="w-3 h-3 text-muted-foreground/50" />
              <span className="tabular-nums">{fmtShort(gf.dateFrom)}</span>
              <span className="text-muted-foreground/30">→</span>
              <span className="tabular-nums">{fmtShort(gf.dateTo)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start" sideOffset={6}>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</p>
              <div className="flex items-center gap-2">
                <input type="date" value={gf.dateFrom}
                  onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                  className="h-[28px] px-2 rounded-md border border-border/50 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                />
                <span className="text-xs text-muted-foreground/40">→</span>
                <input type="date" value={gf.dateTo}
                  onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                  className="h-[28px] px-2 rounded-md border border-border/50 bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Presets segmented */}
        <div className={cn('flex items-center rounded-md border border-border/40 bg-muted/30 overflow-hidden shrink-0', CTL_H)}>
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => applyPreset(p.days)}
              className={cn(
                'px-1.5 text-[9px] font-semibold transition-all h-full',
                i > 0 && 'border-l border-border/30',
                'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >{p.label}</button>
          ))}
          <div className="w-px h-3 bg-border/50" />
          {WEEK_PRESETS.map(wp => (
            <button key={wp.label} onClick={() => applyWeekPreset(wp.offset)}
              className="px-1.5 text-[9px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all h-full border-l border-border/30"
            >{wp.label}</button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-border/40 shrink-0" />

        {/* Granularity segmented */}
        <div className={cn('flex items-center rounded-md border border-border/40 bg-muted/30 overflow-hidden shrink-0', CTL_H)}>
          {GRANULARITIES.map((g, i) => (
            <button key={g.value} onClick={() => gf.setGranularity(g.value as any)}
              className={cn(
                'px-2 text-[9px] font-semibold transition-all h-full',
                i > 0 && 'border-l border-border/30',
                gf.granularity === g.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >{g.label}</button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-border/40 shrink-0" />

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

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Series info */}
        <span className="text-[8px] text-muted-foreground/40 tabular-nums shrink-0">
          {seriesInfo.total}s • {seriesInfo.granularity}
        </span>
        {seriesInfo.truncated && (
          <Badge variant="destructive" className="text-[7px] h-3 px-1 py-0">Tronqué</Badge>
        )}

        {/* Apply */}
        <button
          onClick={() => toast.success('Configuration appliquée')}
          className={cn(CTL_H, 'px-3 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-all flex items-center gap-1 shrink-0')}
        >
          <Check className="w-3 h-3" />
          Appliquer
        </button>
      </div>
    </div>
  );
};

export default DashboardConfigPanel;
