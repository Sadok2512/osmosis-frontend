import React, { useState, useEffect, useMemo } from 'react';
import { Bell, AlertTriangle, Search, Filter, ChevronDown, Clock, MapPin, Radio, RotateCcw, ExternalLink } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-600', dot: 'bg-red-500', label: 'Critique' },
  major:    { bg: 'bg-orange-500/10', text: 'text-orange-600', dot: 'bg-orange-500', label: 'Majeure' },
  minor:    { bg: 'bg-yellow-500/10', text: 'text-yellow-600', dot: 'bg-yellow-500', label: 'Mineure' },
  warning:  { bg: 'bg-amber-500/10', text: 'text-amber-600', dot: 'bg-amber-500', label: 'Warning' },
  info:     { bg: 'bg-blue-500/10', text: 'text-blue-500', dot: 'bg-blue-500', label: 'Info' },
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

const AlarmsSection: React.FC<Props> = ({ filters, startDate, endDate }) => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cleared'>('all');

  // Fetch alarms from VPS
  useEffect(() => {
    const fetchAlarms = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (startDate) params.set('start_date', startDate.split('T')[0]);
        if (endDate) params.set('end_date', endDate.split('T')[0]);
        
        // Apply site/cell filters
        const siteFilter = filters.Site || filters.SITE || [];
        const cellFilter = filters.Cell || filters.CELL || [];
        if (siteFilter.length > 0) params.set('site', siteFilter.join(','));
        if (cellFilter.length > 0) params.set('cell', cellFilter.join(','));

        const res = await fetch(getApiUrl(`monitor/alarms?${params.toString()}`), { headers: getApiHeaders() });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        setAlarms(Array.isArray(data) ? data : data.alarms || data.data || []);
      } catch (err: any) {
        console.warn('[Alarms] Fetch failed, using mock data:', err.message);
        setError(err.message);
        // Generate contextual mock data based on filters
        setAlarms(generateMockAlarms(filters));
      } finally {
        setLoading(false);
      }
    };
    fetchAlarms();
  }, [filters, startDate, endDate]);

  // Filter alarms
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
    return items;
  }, [alarms, severityFilter, statusFilter, search]);

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of alarms) {
      counts[a.severity] = (counts[a.severity] || 0) + 1;
    }
    return counts;
  }, [alarms]);

  const activeCount = alarms.filter(a => !a.cleared_at).length;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-3">
          <Bell className="w-4 h-4 text-red-500" />
          <span className="text-[12px] font-bold text-foreground tracking-wide">Alarmes</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{alarms.length} total</span>
          {activeCount > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-bold tabular-nums">
              {activeCount} actives
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[9px] text-amber-500 font-medium">Mode démo</span>
          )}
        </div>
      </div>

      {/* Severity summary tiles */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/5">
        {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => {
          const count = severityCounts[sev] || 0;
          if (count === 0 && sev !== 'critical' && sev !== 'major') return null;
          return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(severityFilter === sev ? '' : sev)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border',
                severityFilter === sev
                  ? `${cfg.bg} ${cfg.text} border-current/20`
                  : 'border-transparent hover:bg-muted/40 text-muted-foreground'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
              {cfg.label}
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        {/* Status filter */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5">
          {(['all', 'active', 'cleared'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2 py-0.5 rounded text-[9px] font-semibold transition-colors',
                statusFilter === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? 'Tous' : s === 'active' ? 'Actives' : 'Résolues'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border/20">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une alarme, site, cellule..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-[11px] outline-none focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[500px] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
            <tr className="border-b border-border/30">
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[70px]">Sévérité</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px]">Alarme</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[120px]">Site / Cell</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[80px]">Catégorie</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[100px]">Début</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[70px]">Durée</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground text-[9px] w-[60px]">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] text-muted-foreground">Chargement des alarmes...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Bell className="w-6 h-6 text-muted-foreground/20" />
                    <span className="text-[11px] text-muted-foreground">Aucune alarme trouvée</span>
                    {(severityFilter || search) && (
                      <button
                        onClick={() => { setSeverityFilter(''); setSearch(''); }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
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
                return (
                  <tr
                    key={alarm.id || idx}
                    className={cn(
                      'border-b border-border/10 transition-colors hover:bg-muted/20 cursor-default',
                      isActive && alarm.severity === 'critical' && 'bg-red-500/[0.03]'
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold', sev.bg, sev.text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', sev.dot, isActive && 'animate-pulse')} />
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="leading-tight">
                        <p className="font-medium text-foreground">{alarm.alarm_name}</p>
                        {alarm.description && (
                          <p className="text-[9px] text-muted-foreground/60 truncate max-w-[300px]">{alarm.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="leading-tight">
                        {alarm.site && <p className="font-medium text-foreground flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-muted-foreground/40" />{alarm.site}</p>}
                        {alarm.cell && <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1"><Radio className="w-2.5 h-2.5" />{alarm.cell}</p>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{alarm.category || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-muted-foreground/40" />{formatTs(alarm.raised_at)}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums font-medium">{formatDuration(alarm.duration_min)}</td>
                    <td className="px-3 py-2">
                      {isActive ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-bold">Active</span>
                      ) : (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold">Résolue</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
      id: `alarm-${i}`,
      alarm_name: tpl.name,
      severity: tpl.severity,
      category: tpl.category,
      description: tpl.description,
      site,
      cell: `${site}_${['L800', 'L1800', 'L2100', 'NR3500'][i % 4]}_${(i % 3) + 1}`,
      raised_at: raisedAt.toISOString(),
      cleared_at: isCleared ? new Date(raisedAt.getTime() + durationMin * 60000).toISOString() : null,
      duration_min: isCleared ? durationMin : Math.round((now - raisedAt.getTime()) / 60000),
      vendor: i % 2 === 0 ? 'Nokia' : 'Ericsson',
      techno: ['4G', '5G', '4G', '5G'][i % 4],
    });
  }
  return result.sort((a, b) => {
    const sevOrder = { critical: 0, major: 1, minor: 2, warning: 3, info: 4 };
    return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
  });
}

export default AlarmsSection;
