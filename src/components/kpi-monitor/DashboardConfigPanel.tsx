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
      {/* ── Single compact toolbar ── */}
      <div className="flex items-center gap-2 px-3 h-[58px]">

        {/* ── Filters (left) ── */}
        <div className="flex items-center gap-1 shrink-0">
          <Filter className="w-3 h-3 text-muted-foreground/60" />
          {gf.globalFilters.filter(f => f.values.length > 0).map(f => (
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
          <AddFilterButton />
          {hasActiveFilters && (
            <button
              onClick={gf.clearGlobalFilters}
              className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
              title="Reset filtres"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1 min-w-0" />

        {/* ── Date range compact ── */}
        <div className="flex items-center gap-1 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-[32px] px-2.5 rounded-lg border border-border/50 bg-background text-[11px] font-medium text-foreground hover:border-primary/40 transition-all flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-muted-foreground/60" />
                <span className="tabular-nums">{fmtShort(gf.dateFrom)}</span>
                <span className="text-muted-foreground/40">→</span>
                <span className="tabular-nums">{fmtShort(gf.dateTo)}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end" sideOffset={6}>
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Période</p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={gf.dateFrom}
                    onChange={e => gf.setDateRange(e.target.value, gf.dateTo)}
                    className="h-[32px] px-2 rounded-lg border border-border/50 bg-background text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                  />
                  <span className="text-xs text-muted-foreground/40">→</span>
                  <input
                    type="date"
                    value={gf.dateTo}
                    onChange={e => gf.setDateRange(gf.dateFrom, e.target.value)}
                    className="h-[32px] px-2 rounded-lg border border-border/50 bg-background text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Presets segmented ── */}
        <div className="flex items-center rounded-lg border border-border/40 bg-muted/30 overflow-hidden shrink-0">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className={cn(
                'h-[26px] px-2 text-[10px] font-semibold transition-all',
                i > 0 && 'border-l border-border/30',
                'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
          <div className="w-px h-3.5 bg-border/50" />
          {WEEK_PRESETS.map((wp) => (
            <button
              key={wp.label}
              onClick={() => applyWeekPreset(wp.offset)}
              className="h-[26px] px-2 text-[10px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all border-l border-border/30"
            >
              {wp.label}
            </button>
          ))}
        </div>

        {/* ── Separator ── */}
        <div className="w-px h-5 bg-border/40 shrink-0" />

        {/* ── Granularity segmented ── */}
        <div className="flex items-center rounded-lg border border-border/40 bg-muted/30 overflow-hidden shrink-0">
          {GRANULARITIES.map((g, i) => (
            <button
              key={g.value}
              onClick={() => gf.setGranularity(g.value as any)}
              className={cn(
                'h-[26px] px-2.5 text-[10px] font-semibold transition-all',
                i > 0 && 'border-l border-border/30',
                gf.granularity === g.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* ── Milestones mini ── */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-[26px] px-1.5 rounded-lg border border-border/40 bg-muted/30 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shrink-0">
              <Flag className="w-3 h-3" />
              {store.milestones.length > 0 && (
                <span className="text-[9px] font-bold text-primary">{store.milestones.length}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jalons X</p>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={store.showMilestones}
                    onCheckedChange={store.setShowMilestones}
                    className="h-3.5 w-7 data-[state=checked]:bg-primary"
                  />
                </div>
              </div>
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

        {/* ── Separator ── */}
        <div className="w-px h-5 bg-border/40 shrink-0" />

        {/* ── Series info ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-muted-foreground/50 tabular-nums">
            {seriesInfo.total}s • {seriesInfo.granularity}
          </span>
          {seriesInfo.truncated && (
            <Badge variant="destructive" className="text-[8px] h-3.5 px-1 py-0">Tronqué</Badge>
          )}
        </div>

        {/* ── Apply ── */}
        <button
          onClick={() => toast.success('Configuration appliquée')}
          className="h-[34px] px-4 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          Appliquer
        </button>
      </div>
    </div>
  );
};

export default DashboardConfigPanel;
