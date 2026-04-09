import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Search, Clock, MapPin, Radio, RotateCcw, ArrowUpDown, ChevronUp, ChevronDown, ShieldAlert } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';

interface Alarm {
  id: string;
  alarm_id?: string;
  site?: string;
  cell?: string;
  ne_name?: string;
  alarm_name: string;
  severity: 'critical' | 'major' | 'minor' | 'warning' | 'info';
  category?: string;
  raised_at: string;
  cleared_at?: string | null;
  duration_min?: number;
  vendor?: string;
  techno?: string;
  description?: string;
  probable_cause?: string;
}

interface Props {
  filters: Record<string, string[]>;
  startDate: string;
  endDate: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string; ring: string; rowTint: string }> = {
  critical: { bg: 'bg-red-500/8', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', label: 'Critique', ring: 'ring-red-500/20', rowTint: 'bg-red-500/[0.03]' },
  major:    { bg: 'bg-orange-500/8', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', label: 'Majeure', ring: 'ring-orange-500/20', rowTint: '' },
  minor:    { bg: 'bg-yellow-500/8', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500', label: 'Mineure', ring: 'ring-yellow-500/20', rowTint: '' },
  warning:  { bg: 'bg-amber-600/8', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-600', label: 'Warning', ring: 'ring-amber-600/20', rowTint: '' },
  info:     { bg: 'bg-blue-500/8', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', label: 'Info', ring: 'ring-blue-500/20', rowTint: '' },
};

function formatDuration(min?: number): string {
  if (!min) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
  return `${Math.floor(min / 1440)}j ${Math.floor((min % 1440) / 60)}h`;
}

function formatTs(ts?: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

type SortKey = 'severity' | 'alarm' | 'site' | 'category' | 'raised' | 'duration' | 'status';
type SortDir = 'asc' | 'desc';

const SEV_ORDER: Record<string, number> = { critical: 0, major: 1, minor: 2, warning: 3, info: 4 };

const AlarmsSection: React.FC<Props> = ({ filters, startDate, endDate }) => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cleared'>('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    const controller = new AbortController();
    const fetchAlarms = async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams();
        if (startDate) params.set('from_date', startDate.split('T')[0]);
        if (endDate) params.set('to_date', endDate.split('T')[0]);
        params.set('limit', '200');
        const siteFilter = filters.Site || filters.SITE || [];
        if (siteFilter.length > 0) params.set('site', siteFilter[0]);
        const res = await fetch(getApiUrl(`alarms/nokia?${params.toString()}`), {
          headers: getApiHeaders(), signal: controller.signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        const items: Alarm[] = (data.items || []).map((a: any) => ({
          id: String(a.id),
          alarm_name: a.alarm_text || a.specific_problem || 'Unknown alarm',
          severity: (a.alarm_severity || 'info').toLowerCase() as Alarm['severity'],
          category: a.alarm_type || '',
          site: a.site_name || '',
          cell: a.cell_name || '',
          ne_name: a.mo_dn || '',
          raised_at: a.alarm_time || '',
          cleared_at: a.cancel_time || null,
          duration_min: a.duration_min || undefined,
          vendor: a.vendor || '',
          description: a.supplementary_info || '',
          probable_cause: a.specific_problem || '',
        }));
        setAlarms(items);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.warn('[Alarms] Fetch failed:', err.message);
        setError(err.message); setAlarms([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchAlarms();
    return () => controller.abort();
  }, [filters, startDate, endDate]);

  const filtered = useMemo(() => {
    let items = alarms;
    if (severityFilter) items = items.filter(a => a.severity === severityFilter);
    if (statusFilter === 'active') items = items.filter(a => !a.cleared_at);
    if (statusFilter === 'cleared') items = items.filter(a => !!a.cleared_at);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(a =>
        a.alarm_name.toLowerCase().includes(q) ||
        (a.site || '').toLowerCase().includes(q) ||
        (a.cell || '').toLowerCase().includes(q) ||
        (a.ne_name || '').toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => {
        switch (sortKey) {
          case 'severity': return ((SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5)) * dir;
          case 'alarm': return a.alarm_name.localeCompare(b.alarm_name) * dir;
          case 'site': return (a.site || '').localeCompare(b.site || '') * dir;
          case 'category': return (a.category || '').localeCompare(b.category || '') * dir;
          case 'raised': return (new Date(a.raised_at).getTime() - new Date(b.raised_at).getTime()) * dir;
          case 'duration': return ((a.duration_min ?? 0) - (b.duration_min ?? 0)) * dir;
          case 'status': return (a.cleared_at ? 1 : 0) - (b.cleared_at ? 1 : 0) * dir;
          default: return 0;
        }
      });
    }
    return items;
  }, [alarms, severityFilter, statusFilter, search, sortKey, sortDir]);

  const severityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of alarms) c[a.severity] = (c[a.severity] || 0) + 1;
    return c;
  }, [alarms]);

  const activeCount = alarms.filter(a => !a.cleared_at).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-2.5 h-2.5 text-muted-foreground/30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-2.5 h-2.5 text-primary" />
      : <ChevronDown className="w-2.5 h-2.5 text-primary" />;
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card overflow-hidden shadow-sm">

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-muted/20 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-foreground tracking-wide">Alarmes</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground font-medium tabular-nums">
                  {alarms.length} total
                </span>
                {activeCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-bold tabular-nums animate-pulse">
                    {activeCount} active{activeCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Severity summary pills */}
          <div className="flex items-center gap-1.5">
            {(['critical', 'major', 'minor', 'warning', 'info'] as const).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = severityCounts[sev] || 0;
              if (count === 0 && sev !== 'critical' && sev !== 'major') return null;
              return (
                <div key={sev} className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-semibold',
                  cfg.bg, cfg.text
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                  <span className="hidden sm:inline">{cfg.label}</span>
                  <span className="tabular-nums font-bold">{count}</span>
                </div>
              );
            })}
            {error && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">Demo</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-4 py-2.5 border-b border-border/20 bg-muted/5">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher alarme, site, cellule..."
              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border/40 bg-background text-[10px] outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Severity filter chips */}
          <div className="flex items-center gap-1">
            {(['critical', 'major', 'minor', 'warning'] as const).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = severityCounts[sev] || 0;
              const active = severityFilter === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(active ? '' : sev)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all border',
                    active
                      ? `${cfg.bg} ${cfg.text} border-current/15 ring-1 ${cfg.ring}`
                      : 'border-transparent text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', active ? cfg.dot : 'bg-muted-foreground/20')} />
                  {cfg.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Status segmented control */}
          <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/20">
            {([
              { key: 'all' as const, label: 'Tous' },
              { key: 'active' as const, label: 'Actives' },
              { key: 'cleared' as const, label: 'Résolues' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[9px] font-semibold transition-all',
                  statusFilter === s.key
                    ? 'bg-card text-foreground shadow-sm border border-border/30'
                    : 'text-muted-foreground/60 hover:text-muted-foreground border border-transparent'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/50 backdrop-blur-md border-b border-border/30">
              {([
                { key: 'severity' as SortKey, label: 'Sévérité', align: 'left', w: 'w-[80px]' },
                { key: 'alarm' as SortKey, label: 'Alarme', align: 'left', w: '' },
                { key: 'site' as SortKey, label: 'Site / Cell', align: 'left', w: 'w-[130px]' },
                { key: 'category' as SortKey, label: 'Catégorie', align: 'left', w: 'w-[90px]' },
                { key: 'raised' as SortKey, label: 'Début', align: 'left', w: 'w-[100px]' },
                { key: 'duration' as SortKey, label: 'Durée', align: 'right', w: 'w-[70px]' },
                { key: 'status' as SortKey, label: 'Statut', align: 'center', w: 'w-[72px]' },
              ]).map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'px-3 py-2 font-bold uppercase tracking-wider text-[8px] cursor-pointer select-none transition-colors hover:text-foreground',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.w,
                    sortKey === col.key ? 'text-foreground' : 'text-muted-foreground/60'
                  )}
                >
                  <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-[10px] text-muted-foreground/60">Chargement des alarmes...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted/20">
                      <Bell className="w-5 h-5 text-muted-foreground/20" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">Aucune alarme trouvée</span>
                    {(severityFilter || search) && (
                      <button
                        onClick={() => { setSeverityFilter(''); setSearch(''); }}
                        className="text-[9px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((alarm, idx) => {
                const sev = SEVERITY_CONFIG[alarm.severity] || SEVERITY_CONFIG.info;
                const isActive = !alarm.cleared_at;
                const isLongDuration = (alarm.duration_min ?? 0) > 480;
                return (
                  <tr
                    key={alarm.id || idx}
                    className={cn(
                      'transition-colors hover:bg-muted/15 group',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/[0.03]',
                      isActive && alarm.severity === 'critical' && 'bg-red-500/[0.02]'
                    )}
                  >
                    {/* Severity */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[8px] font-bold ring-1',
                        sev.bg, sev.text, sev.ring
                      )}>
                        <span className={cn('w-[5px] h-[5px] rounded-full', sev.dot, isActive && alarm.severity === 'critical' && 'animate-pulse')} />
                        {sev.label}
                      </span>
                    </td>

                    {/* Alarm name + description */}
                    <td className="px-3 py-2.5">
                      <div className="leading-snug">
                        <p className="font-semibold text-foreground text-[10px]">{alarm.alarm_name}</p>
                        {alarm.description && (
                          <p className="text-[9px] text-muted-foreground/50 truncate max-w-[320px] mt-0.5">{alarm.description}</p>
                        )}
                      </div>
                    </td>

                    {/* Site / Cell */}
                    <td className="px-3 py-2.5">
                      <div className="leading-snug">
                        {alarm.site ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-foreground">
                            <MapPin className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" />
                            <span className="truncate max-w-[100px]">{alarm.site}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/25 text-[9px]">—</span>
                        )}
                        {alarm.cell && (
                          <p className="text-[9px] text-muted-foreground/50 flex items-center gap-1 mt-0.5 pl-4">
                            <Radio className="w-2 h-2 flex-shrink-0" />{alarm.cell}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-3 py-2.5">
                      {alarm.category ? (
                        <span className="text-[8px] px-1.5 py-[2px] rounded bg-muted/60 font-bold text-foreground/70 tracking-wide">
                          {alarm.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* Raised at */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[10px] tabular-nums">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0" />
                        {formatTs(alarm.raised_at)}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-2.5 text-right">
                      {alarm.duration_min ? (
                        <span className={cn(
                          'tabular-nums font-semibold text-[10px]',
                          isLongDuration ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/70'
                        )}>
                          {formatDuration(alarm.duration_min)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25 text-[9px]">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[8px] px-2 py-[3px] rounded-md bg-red-500/8 text-red-600 dark:text-red-400 font-bold ring-1 ring-red-500/20">
                          <span className="w-[5px] h-[5px] rounded-full bg-red-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[8px] px-2 py-[3px] rounded-md bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 font-bold ring-1 ring-emerald-500/20">
                          <span className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
                          Résolue
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      {!loading && filtered.length > 0 && (
        <div className="px-4 py-2 border-t border-border/20 bg-muted/5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/50">
              {filtered.length} / {alarms.length} alarmes affichées
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[8px] text-muted-foreground/40">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {activeCount} active{activeCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1 text-[8px] text-muted-foreground/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {alarms.length - activeCount} résolue{alarms.length - activeCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Mock data generator for demo mode ── */
function generateMockAlarms(filters: Record<string, string[]>): Alarm[] {
  const sites = filters.Site || filters.SITE || ['PAR_NORD_01', 'LYO_SUD_03', 'MAR_EST_12', 'TLS_CENTRE_07'];
  const alarmTemplates = [
    { name: 'VSWR Alarm', severity: 'major' as const, category: 'Equipment', description: 'VSWR exceeds threshold on antenna port' },
    { name: 'S1 Link Failure', severity: 'critical' as const, category: 'Transport', description: 'S1 interface connection lost' },
    { name: 'High CPU Load', severity: 'minor' as const, category: 'Processing', description: 'CPU utilization above 85%' },
    { name: 'Cell Unavailable', severity: 'critical' as const, category: 'Radio', description: 'Cell has been administratively locked or is out of service' },
    { name: 'License Capacity Warning', severity: 'warning' as const, category: 'License', description: 'License capacity usage above 90%' },
    { name: 'X2 Link Failure', severity: 'major' as const, category: 'Transport', description: 'X2 inter-eNB link failure detected' },
    { name: 'Temperature Alarm', severity: 'minor' as const, category: 'Environment', description: 'Cabinet temperature exceeds normal range' },
    { name: 'Power Supply Degraded', severity: 'major' as const, category: 'Power', description: 'Redundant power supply unit failure' },
    { name: 'RRU Communication Lost', severity: 'critical' as const, category: 'Equipment', description: 'Remote Radio Unit communication failure' },
    { name: 'Synchronization Lost', severity: 'major' as const, category: 'Timing', description: 'GPS/PTP synchronization reference lost' },
    { name: 'Backhaul Congestion', severity: 'warning' as const, category: 'Transport', description: 'Backhaul utilization above threshold' },
    { name: 'Interference Detected', severity: 'minor' as const, category: 'Radio', description: 'External interference detected on carrier' },
  ];
  const result: Alarm[] = [];
  const now = Date.now();
  for (let i = 0; i < 18; i++) {
    const tpl = alarmTemplates[i % alarmTemplates.length];
    const site = sites[i % sites.length];
    const raisedAt = new Date(now - Math.random() * 7 * 86400000);
    const isCleared = Math.random() > 0.4;
    const durationMin = Math.round(Math.random() * 2880 + 5);
    result.push({
      id: `alarm-${i}`, alarm_name: tpl.name, severity: tpl.severity, category: tpl.category,
      description: tpl.description, site,
      cell: `${site}_${['L800', 'L1800', 'L2100', 'NR3500'][i % 4]}_${(i % 3) + 1}`,
      raised_at: raisedAt.toISOString(),
      cleared_at: isCleared ? new Date(raisedAt.getTime() + durationMin * 60000).toISOString() : null,
      duration_min: isCleared ? durationMin : Math.round((now - raisedAt.getTime()) / 60000),
      vendor: i % 2 === 0 ? 'Nokia' : 'Ericsson', techno: ['4G', '5G', '4G', '5G'][i % 4],
    });
  }
  return result.sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4));
}

export default AlarmsSection;
