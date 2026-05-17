import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Clock, Download, Loader2, RefreshCw, Search, ShieldAlert, Ticket } from 'lucide-react';
import { getApiHeaders, getApiUrl, logBackendRequest } from '@/lib/apiConfig';
import { getStoredToken } from '@/services/adminAuth';
import { createTicket } from '@/services/ticketService';
import { cn } from '@/lib/utils';

type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning' | 'info';
type AlarmStatus = 'all' | 'active' | 'cleared';

interface AlarmRow {
  id: number | string;
  alarm_time?: string | null;
  cancel_time?: string | null;
  duration_min?: number | null;
  alarm_severity?: string | null;
  alarm_type?: string | null;
  alarm_text?: string | null;
  alarm_status?: string | null;
  specific_problem?: string | null;
  supplementary_info?: string | null;
  site_name?: string | null;
  cell_name?: string | null;
  vendor?: string | null;
  bande?: string | null;
  dor?: string | null;
  plaque?: string | null;
  zone_arcep?: string | null;
  mo_dn?: string | null;
}

interface AlarmResponse {
  items?: AlarmRow[];
  total?: number;
  page?: number;
  pages?: number;
}

const PAGE_SIZE = 100;

const severityTone: Record<AlarmSeverity, { label: string; chip: string; dot: string }> = {
  critical: { label: 'Critical', chip: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  major: { label: 'Major', chip: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  minor: { label: 'Minor', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  warning: { label: 'Warning', chip: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  info: { label: 'Info', chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
};

const normalizeSeverity = (value?: string | null): AlarmSeverity => {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('crit')) return 'critical';
  if (raw.includes('major')) return 'major';
  if (raw.includes('minor')) return 'minor';
  if (raw.includes('warn')) return 'warning';
  return 'info';
};

const formatDate = (value?: string | null): string => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const formatDuration = (value?: number | null): string => {
  if (!Number.isFinite(Number(value))) return '-';
  const min = Math.max(0, Number(value));
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
};

const authHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  return {
    ...getApiHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const AlarmCenter: React.FC = () => {
  const [items, setItems] = useState<AlarmRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [site, setSite] = useState('');
  const [vendor, setVendor] = useState('');
  const [severity, setSeverity] = useState<'' | AlarmSeverity>('');
  const [status, setStatus] = useState<AlarmStatus>('all');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketingId, setTicketingId] = useState<number | string | null>(null);
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (severity) params.set('severity', severity);
    if (status !== 'all') params.set('status', status === 'active' ? 'ACTIVE' : 'CLEARED');
    if (search.trim()) params.set('search', search.trim());
    if (site.trim()) params.set('site', site.trim());
    if (vendor.trim()) params.set('vendor', vendor.trim());

    const url = getApiUrl(`alarms/nokia?${params.toString()}`);
    logBackendRequest('AlarmCenter', 'GET', url);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || `${res.status} ${res.statusText}`);
      const payload = data as AlarmResponse;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTotal(Number(payload.total || 0));
      setPages(Math.max(1, Number(payload.pages || 1)));
    } catch (err) {
      setItems([]);
      setTotal(0);
      setPages(1);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fromDate, page, search, severity, site, status, toDate, vendor]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const next: Record<AlarmSeverity, number> = { critical: 0, major: 0, minor: 0, warning: 0, info: 0 };
    for (const item of items) next[normalizeSeverity(item.alarm_severity)] += 1;
    return next;
  }, [items]);

  const activeCount = useMemo(
    () => items.filter((item) => String(item.alarm_status || '').toUpperCase() === 'ACTIVE' || !item.cancel_time).length,
    [items],
  );

  const exportCsv = () => {
    const header = ['severity', 'status', 'site', 'cell', 'vendor', 'alarm', 'raised_at', 'duration_min'];
    const rows = items.map((item) => [
      item.alarm_severity || '',
      item.alarm_status || '',
      item.site_name || '',
      item.cell_name || '',
      item.vendor || '',
      (item.alarm_text || item.specific_problem || '').replaceAll('"', '""'),
      item.alarm_time || '',
      item.duration_min ?? '',
    ]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alarm-center-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createTicketFromAlarm = async (alarm: AlarmRow) => {
    const sev = normalizeSeverity(alarm.alarm_severity);
    const targetRef = alarm.cell_name || alarm.site_name || alarm.mo_dn || String(alarm.id);
    const title = alarm.alarm_text || alarm.specific_problem || `Alarm ${alarm.id}`;
    setTicketingId(alarm.id);
    setTicketMessage(null);
    try {
      const created = await createTicket({
        title,
        severity: sev === 'info' ? 'minor' : sev,
        target_kind: alarm.cell_name ? 'cell' : alarm.site_name ? 'site' : 'alarm',
        target_ref: targetRef,
        fingerprint: `alarm:${alarm.id}:${targetRef}:${alarm.specific_problem || title}`,
        description: [
          `FM alarm from Alarm Center`,
          `Severity: ${severityTone[sev].label}`,
          `Status: ${alarm.alarm_status || '-'}`,
          `Site: ${alarm.site_name || '-'}`,
          `Cell: ${alarm.cell_name || '-'}`,
          `Vendor: ${alarm.vendor || '-'}`,
          `Raised: ${alarm.alarm_time || '-'}`,
          `Specific problem: ${alarm.specific_problem || '-'}`,
          `MO DN: ${alarm.mo_dn || '-'}`,
          alarm.supplementary_info ? `Supplementary info: ${alarm.supplementary_info}` : '',
        ].filter(Boolean).join('\n'),
      });
      setTicketMessage(`Ticket ${created.id} created from alarm ${alarm.id}.`);
    } catch (err) {
      setTicketMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTicketingId(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
      <div className="px-7 pt-6 pb-5 border-b border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              <h2 className="text-base font-semibold text-slate-800">Alarm Center</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                backend
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Live FM alarms from parser backend, with severity, status, site and vendor filters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={items.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
            <p className="mt-1 text-xl font-black text-slate-900 tabular-nums">{total.toLocaleString('fr-FR')}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Active</p>
            <p className="mt-1 text-xl font-black text-red-700 tabular-nums">{activeCount}</p>
          </div>
          {(['critical', 'major', 'minor', 'warning'] as AlarmSeverity[]).map((sev) => (
            <div key={sev} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{severityTone[sev].label}</p>
              <p className={cn('mt-1 text-xl font-black tabular-nums', severityTone[sev].chip.split(' ')[1])}>{counts[sev]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/60 px-7 py-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search alarm text, MO, site..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <input value={site} onChange={(e) => { setSite(e.target.value); setPage(1); }} placeholder="Site" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          <input value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }} placeholder="Vendor" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          <select value={severity} onChange={(e) => { setSeverity(e.target.value as '' | AlarmSeverity); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100">
            <option value="">All severity</option>
            <option value="critical">Critical</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="warning">Warning</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value as AlarmStatus); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="cleared">Cleared</option>
          </select>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
        </div>
      </div>

      {error && (
        <div className="mx-7 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Backend alarm request failed: {error}. Check admin login token and parser auth.
        </div>
      )}

      {ticketMessage && (
        <div className="mx-7 mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
          {ticketMessage}
        </div>
      )}

      <div className="overflow-auto">
        <table className="w-full min-w-[1080px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left font-bold">Severity</th>
              <th className="px-4 py-3 text-left font-bold">Alarm</th>
              <th className="px-4 py-3 text-left font-bold">Site / Cell</th>
              <th className="px-4 py-3 text-left font-bold">Vendor</th>
              <th className="px-4 py-3 text-left font-bold">Scope</th>
              <th className="px-4 py-3 text-left font-bold">Raised</th>
              <th className="px-4 py-3 text-right font-bold">Duration</th>
              <th className="px-4 py-3 text-center font-bold">Status</th>
              <th className="px-4 py-3 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-20 text-center text-slate-500">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-teal-600" />
                  Loading alarms...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-20 text-center text-slate-500">
                  <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  No alarms found for current filters.
                </td>
              </tr>
            ) : items.map((alarm) => {
              const sev = normalizeSeverity(alarm.alarm_severity);
              const tone = severityTone[sev];
              const active = String(alarm.alarm_status || '').toUpperCase() === 'ACTIVE' || !alarm.cancel_time;
              return (
                <tr key={alarm.id} className="transition hover:bg-teal-50/30">
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold', tone.chip)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                      {tone.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[340px] truncate font-semibold text-slate-800" title={alarm.alarm_text || alarm.specific_problem || ''}>
                      {alarm.alarm_text || alarm.specific_problem || '-'}
                    </p>
                    <p className="mt-0.5 max-w-[340px] truncate text-[10px] text-slate-400" title={alarm.mo_dn || alarm.supplementary_info || ''}>
                      {alarm.specific_problem || alarm.mo_dn || '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-[11px] font-semibold text-slate-700">{alarm.site_name || '-'}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{alarm.cell_name || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{alarm.vendor || '-'}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">
                    {[alarm.dor, alarm.plaque, alarm.bande].filter(Boolean).join(' · ') || '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {formatDate(alarm.alarm_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{formatDuration(alarm.duration_min)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold',
                      active ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    )}>
                      {active ? 'ACTIVE' : 'CLEARED'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => createTicketFromAlarm(alarm)}
                      disabled={ticketingId === alarm.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                    >
                      {ticketingId === alarm.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ticket className="h-3 w-3" />}
                      Ticket
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-7 py-4 text-xs text-slate-500">
        <span>{items.length} loaded · {total.toLocaleString('fr-FR')} total</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            Previous
          </button>
          <span className="font-mono text-[11px]">Page {page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmCenter;
