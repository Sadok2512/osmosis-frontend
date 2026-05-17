import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket as TicketIcon, AlertTriangle, Clock, UserCheck, CheckCircle2,
  Plus, Check, UserPlus, ArrowUpRight, CheckCheck,
  Search, Filter, Columns3, Download, RefreshCw, X,
  ChevronRight, Bell, Settings2
} from 'lucide-react';
import {
  listTickets,
  createTicket,
  assignTicket,
  claimTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  escalateTicket,
  listUsers,
  BackendUser,
  UiTicket,
  UiSeverity,
  UiStatus,
} from '@/services/ticketService';
import { getApiHeaders, getApiUrl } from '@/lib/apiConfig';
import { getStoredToken } from '@/services/adminAuth';

/* ─────────── UI types & helpers ───────────
 *
 * RCA has been removed from the ticket flow (party-mode arbitration
 * 2026-05-16) — it lives in SentinelRCA.tsx as a separate post-mortem
 * workflow. NOC operators acknowledge / assign / resolve / escalate;
 * deep root-cause analysis is a L3 task on a different timescale.
 */

const sevPill: Record<UiSeverity, string> = {
  Critical: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  Major:    'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  Minor:    'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  Warning:  'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
};

const statusPill: Record<UiStatus, string> = {
  Open:          'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Investigating: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Assigned:      'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  Escalated:     'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Resolved:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Closed:        'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  Cancelled:     'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
};

function slaText(t: UiTicket): { label: string; breached: boolean } {
  if (!t.slaDueAt) return { label: '—', breached: false };
  const now = Date.now();
  const due = new Date(t.slaDueAt).getTime();
  const diffMs = due - now;
  const sign = diffMs < 0 ? '-' : '';
  const abs = Math.abs(diffMs);
  const hh = Math.floor(abs / 3_600_000);
  const mm = Math.floor((abs % 3_600_000) / 60_000);
  const ss = Math.floor((abs % 60_000) / 1000);
  return {
    label: `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    breached: diffMs < 0,
  };
}

function formatCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { hour12: false });
  } catch {
    return iso;
  }
}

const initialsFromAssignee = (id: number | null): string =>
  id == null ? '—' : `U${id}`;

const assigneeColor = (id: number | null): string => {
  if (id == null) return 'bg-slate-300';
  const palette = ['bg-pink-500', 'bg-amber-500', 'bg-emerald-500',
                   'bg-violet-500', 'bg-cyan-500', 'bg-blue-500'];
  return palette[id % palette.length];
};

interface CreateTicketForm {
  title: string;
  severity: UiSeverity;
  targetKind: string;
  targetRef: string;
  fingerprint: string;
  description: string;
  assigneeId: string;
}

const emptyCreateForm = (): CreateTicketForm => ({
  title: '',
  severity: 'Major',
  targetKind: 'cell',
  targetRef: '',
  fingerprint: '',
  description: '',
  assigneeId: '',
});

interface TicketSourceAlarm {
  id: number | string;
  alarm_time?: string | null;
  alarm_severity?: string | null;
  alarm_text?: string | null;
  alarm_status?: string | null;
  specific_problem?: string | null;
  supplementary_info?: string | null;
  site_name?: string | null;
  cell_name?: string | null;
  vendor?: string | null;
  mo_dn?: string | null;
}

interface AlarmResponse {
  items?: TicketSourceAlarm[];
}

const normalizeTicketSeverity = (value?: string | null): UiSeverity => {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('crit')) return 'Critical';
  if (raw.includes('major')) return 'Major';
  if (raw.includes('minor')) return 'Minor';
  if (raw.includes('warn')) return 'Warning';
  return 'Minor';
};

const ticketBackendHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  return {
    ...getApiHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const userLabel = (user: BackendUser): string =>
  `${user.display_name || user.email} · ${user.team || 'NOC'} · #${user.id}`;

const filterUsers = (users: BackendUser[], query: string): BackendUser[] => {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((user) =>
    [user.display_name, user.email, user.team, String(user.id)]
      .some((value) => (value || '').toLowerCase().includes(q))
  );
};

/* ─────────── KPI computation (from live data) ─────────── */

interface KpiDef { label: string; value: string; delta: string; tone: string; icon: React.ReactNode; spark: string; }

function computeKpis(tickets: UiTicket[]): KpiDef[] {
  const open      = tickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed' && t.status !== 'Cancelled').length;
  const critical  = tickets.filter(t => t.severity === 'Critical' && t.status !== 'Resolved' && t.status !== 'Closed').length;
  const breached  = tickets.filter(t => t.slaBreached).length;
  const resolvedToday = tickets.filter(t => {
    if (t.status !== 'Resolved' && t.status !== 'Closed') return false;
    const today = new Date().toISOString().slice(0, 10);
    return (t.createdAt ?? '').startsWith(today);
  }).length;
  const escalated = tickets.filter(t => t.status === 'Escalated').length;

  return [
    { label: 'Open Tickets',     value: String(open),      delta: 'Live count', tone: 'text-blue-600',    icon: <TicketIcon className="w-4 h-4" />,    spark: 'M0 18 L10 12 L20 14 L30 6 L40 10 L50 4 L60 8 L70 2' },
    { label: 'Critical Tickets', value: String(critical),  delta: 'Live count', tone: 'text-rose-600',    icon: <AlertTriangle className="w-4 h-4" />, spark: 'M0 14 L10 10 L20 16 L30 6 L40 12 L50 8 L60 14 L70 4' },
    { label: 'SLA Breached',     value: String(breached),  delta: 'Live count', tone: 'text-orange-600',  icon: <Clock className="w-4 h-4" />,         spark: 'M0 6 L10 14 L20 8 L30 12 L40 4 L50 10 L60 6 L70 14' },
    { label: 'Escalated',        value: String(escalated), delta: 'Live count', tone: 'text-violet-600',  icon: <ArrowUpRight className="w-4 h-4" />,  spark: 'M0 10 L10 6 L20 12 L30 8 L40 14 L50 6 L60 10 L70 8' },
    { label: 'Resolved Today',   value: String(resolvedToday), delta: 'Live count', tone: 'text-emerald-600', icon: <CheckCircle2 className="w-4 h-4" />, spark: 'M0 14 L10 10 L20 12 L30 4 L40 8 L50 6 L60 4 L70 2' },
  ];
}

const KpiCard: React.FC<KpiDef> = ({ label, value, delta, tone, icon, spark }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`${tone}`}>{icon}</div>
    </div>
    <div className="mt-1 flex items-end justify-between">
      <div>
        <div className="text-2xl font-bold tracking-tight text-slate-900">{value}</div>
        <div className={`text-[10px] font-medium ${tone}`}>{delta}</div>
      </div>
      <svg viewBox="0 0 70 20" className="w-20 h-8">
        <path d={spark} fill="none" stroke="currentColor" strokeWidth="1.5" className={tone} />
      </svg>
    </div>
  </div>
);

/* ─────────── Action button ─────────── */

const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; tone: string; onClick?: () => void; disabled?: boolean }> = ({ icon, label, tone, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-y-0 ${tone}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

/* ─────────── Main page ─────────── */

const TicketManagementPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTicketForm>(() => emptyCreateForm());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createUserSearch, setCreateUserSearch] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignUserSearch, setAssignUserSearch] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateTargets, setEscalateTargets] = useState<UiTicket[]>([]);
  const [escalateUserId, setEscalateUserId] = useState('');
  const [escalateUserSearch, setEscalateUserSearch] = useState('');
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [sourceAlarms, setSourceAlarms] = useState<TicketSourceAlarm[]>([]);
  const [sourceAlarmId, setSourceAlarmId] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: tickets = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['noc-tickets', 'list'],
    queryFn: () => listTickets({ limit: 500 }),
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(t =>
      [t.id, t.alarmName, t.site, t.cell, t.vendor, t.status]
        .some(v => (v ?? '').toLowerCase().includes(q))
    );
  }, [tickets, search]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const drawer = drawerId != null ? tickets.find(t => t.numericId === drawerId) ?? null : null;
  const allChecked = pageRows.length > 0 && pageRows.every(r => selected.has(r.numericId));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) pageRows.forEach(r => next.delete(r.numericId));
      else pageRows.forEach(r => next.add(r.numericId));
      return next;
    });
  };
  const toggleOne = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const hasSelection = selected.size > 0;
  const selectedTickets = useMemo(
    () => tickets.filter((ticket) => selected.has(ticket.numericId)),
    [selected, tickets],
  );
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const createUsers = useMemo(() => filterUsers(users, createUserSearch), [createUserSearch, users]);
  const assignUsers = useMemo(() => filterUsers(users, assignUserSearch), [assignUserSearch, users]);
  const escalateUsers = useMemo(() => filterUsers(users, escalateUserSearch), [escalateUserSearch, users]);

  useEffect(() => {
    if (!createOpen && !assignOpen && !escalateOpen) return;
    let cancelled = false;

    const loadCreateSources = async () => {
      setSourceLoading(true);
      setSourceError(null);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '100',
          status: 'ACTIVE',
        });
        const [alarmResult, userRows] = await Promise.allSettled([
          createOpen
            ? fetch(getApiUrl(`alarms/nokia?${params.toString()}`), { headers: ticketBackendHeaders() })
            : Promise.resolve(null),
          listUsers(),
        ]);
        if (cancelled) return;
        if (alarmResult.status === 'fulfilled' && alarmResult.value) {
          const alarmResp = alarmResult.value;
          const alarmData = await alarmResp.json().catch(() => ({}));
          if (!alarmResp.ok) throw new Error(alarmData?.detail || alarmData?.error || `${alarmResp.status} ${alarmResp.statusText}`);
          setSourceAlarms(Array.isArray((alarmData as AlarmResponse).items) ? (alarmData as AlarmResponse).items! : []);
        }
        if (userRows.status === 'fulfilled') {
          setUsers(userRows.value.filter((u) => u.active));
        } else {
          setUsers([]);
          if (assignOpen || escalateOpen) throw userRows.reason;
        }
      } catch (err) {
        if (!cancelled) {
          setSourceAlarms([]);
          setSourceError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    };

    loadCreateSources();
    return () => { cancelled = true; };
  }, [assignOpen, createOpen, escalateOpen]);

  const applySourceAlarm = (alarmId: string) => {
    setSourceAlarmId(alarmId);
    const alarm = sourceAlarms.find((row) => String(row.id) === alarmId);
    if (!alarm) return;
    const targetRef = alarm.cell_name || alarm.site_name || alarm.mo_dn || String(alarm.id);
    const title = alarm.alarm_text || alarm.specific_problem || `Alarm ${alarm.id}`;
    const severity = normalizeTicketSeverity(alarm.alarm_severity);
    setCreateForm((form) => ({
      ...form,
      title,
      severity,
      targetKind: alarm.cell_name ? 'cell' : alarm.site_name ? 'site' : 'alarm',
      targetRef,
      fingerprint: `alarm:${alarm.id}:${targetRef}:${alarm.specific_problem || title}`,
      description: [
        `FM alarm from backend Alarm Center`,
        `Alarm id: ${alarm.id}`,
        `Severity: ${alarm.alarm_severity || severity}`,
        `Status: ${alarm.alarm_status || '-'}`,
        `Site: ${alarm.site_name || '-'}`,
        `Cell: ${alarm.cell_name || '-'}`,
        `Vendor: ${alarm.vendor || '-'}`,
        `Raised: ${alarm.alarm_time || '-'}`,
        `Specific problem: ${alarm.specific_problem || '-'}`,
        `MO DN: ${alarm.mo_dn || '-'}`,
        alarm.supplementary_info ? `Supplementary info: ${alarm.supplementary_info}` : '',
      ].filter(Boolean).join('\n'),
    }));
  };

  /* Mutations — workflow actions on the drawer ticket */
  const mutClaim = useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) => claimTicket(id, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noc-tickets'] }),
  });
  const mutResolve = useMutation({
    mutationFn: ({ id, version, comment }: { id: number; version: number; comment?: string }) =>
      resolveTicket(id, version, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noc-tickets'] }),
  });
  const mutClose = useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) => closeTicket(id, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noc-tickets'] }),
  });
  const mutReopen = useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) => reopenTicket(id, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noc-tickets'] }),
  });
  const mutEscalate = useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) => escalateTicket(id, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['noc-tickets'] }),
  });
  const mutAssign = useMutation({
    mutationFn: async ({ rows, assigneeId }: { rows: UiTicket[]; assigneeId: number | null }) => {
      return Promise.all(rows.map((row) => assignTicket(row.numericId, row.version, assigneeId)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noc-tickets'] });
      setAssignOpen(false);
      setAssignUserId('');
      setAssignError(null);
      setSelected(new Set());
    },
    onError: (err) => setAssignError(err instanceof Error ? err.message : String(err)),
  });
  const mutEscalateToUser = useMutation({
    mutationFn: async ({ rows, assigneeId }: { rows: UiTicket[]; assigneeId: number }) => {
      return Promise.all(rows.map(async (row) => {
        const assigned = await assignTicket(row.numericId, row.version, assigneeId);
        return escalateTicket(assigned.numericId, assigned.version, `Escalated to ${userById.get(assigneeId)?.display_name || `user #${assigneeId}`}`);
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noc-tickets'] });
      setEscalateOpen(false);
      setEscalateTargets([]);
      setEscalateUserId('');
      setEscalateUserSearch('');
      setEscalateError(null);
      setSelected(new Set());
    },
    onError: (err) => setEscalateError(err instanceof Error ? err.message : String(err)),
  });
  const mutCreate = useMutation({
    mutationFn: (form: CreateTicketForm) => createTicket({
      title: form.title.trim(),
      severity: form.severity.toLowerCase() as 'critical' | 'major' | 'minor' | 'warning',
      description: form.description.trim() || undefined,
      fingerprint: form.fingerprint.trim() || undefined,
      target_kind: form.targetKind.trim() || undefined,
      target_ref: form.targetRef.trim() || undefined,
      assignee_id: form.assigneeId ? Number(form.assigneeId) : undefined,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['noc-tickets'] });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm());
      setCreateError(null);
      setDrawerId(created.numericId);
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : String(err)),
  });

  const submitCreateTicket = (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    if (!createForm.title.trim()) {
      setCreateError('Title is required.');
      return;
    }
    mutCreate.mutate(createForm);
  };

  const submitAssignTickets = (event: React.FormEvent) => {
    event.preventDefault();
    setAssignError(null);
    if (selectedTickets.length === 0) {
      setAssignError('Select at least one ticket.');
      return;
    }
    mutAssign.mutate({
      rows: selectedTickets,
      assigneeId: assignUserId ? Number(assignUserId) : null,
    });
  };

  const openEscalateDialog = (rows: UiTicket[]) => {
    setEscalateTargets(rows);
    setEscalateError(null);
    setEscalateOpen(true);
  };

  const submitEscalateTickets = (event: React.FormEvent) => {
    event.preventDefault();
    setEscalateError(null);
    if (escalateTargets.length === 0) {
      setEscalateError('Select at least one ticket.');
      return;
    }
    if (!escalateUserId) {
      setEscalateError('Select a user to escalate to.');
      return;
    }
    mutEscalateToUser.mutate({
      rows: escalateTargets,
      assigneeId: Number(escalateUserId),
    });
  };

  const KPIS = useMemo(() => computeKpis(tickets), [tickets]);

  return (
    <div className="flex h-full w-full bg-slate-50">
      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-5 pt-4 pb-3 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Ticket Management</h1>
              <p className="text-[11px] text-slate-500">Manage network alarms and incidents</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search tickets, alarms, sites…"
                  className="h-8 w-[320px] rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                />
              </div>
              <button onClick={() => refetch()} title="Refresh" className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button className="relative h-8 w-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                <Bell className="w-4 h-4" />
              </button>
              <button className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* KPI grid */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {KPIS.map(k => <KpiCard key={k.label} {...k} />)}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <ActionBtn icon={<Plus className="w-3.5 h-3.5" />}         label="Create Ticket"   tone="bg-gradient-to-br from-blue-500 to-blue-600" onClick={() => { setCreateError(null); setCreateOpen(true); }} />
            <ActionBtn icon={<Check className="w-3.5 h-3.5" />}        label="Acknowledge"     tone="bg-gradient-to-br from-emerald-500 to-emerald-600" disabled={!hasSelection} />
            <ActionBtn icon={<UserPlus className="w-3.5 h-3.5" />}     label="Assign"          tone="bg-gradient-to-br from-cyan-500 to-cyan-600"       disabled={!hasSelection} onClick={() => { setAssignError(null); setAssignOpen(true); }} />
            <ActionBtn icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Escalate"        tone="bg-gradient-to-br from-orange-500 to-orange-600"   disabled={!hasSelection} onClick={() => openEscalateDialog(selectedTickets)} />
            <ActionBtn icon={<CheckCheck className="w-3.5 h-3.5" />}   label="Resolve"         tone="bg-gradient-to-br from-slate-500 to-slate-600"     disabled={!hasSelection} />
            <button className="ml-auto inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">
              More <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Table card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Table toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/60">
              <button className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Filter className="w-3.5 h-3.5" /> Filters
              </button>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search in table…"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <button className="ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Columns3 className="w-3.5 h-3.5" /> Columns
              </button>
              <button className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={() => refetch()} className="h-8 w-8 grid place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[calc(100vh-440px)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" className="accent-blue-600" checked={allChecked} onChange={toggleAll} />
                    </th>
                    {['Severity','Ticket ID','Alarm Name','Site/Cell','Status','Assignee','Created Time','SLA','Esc.'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-400">Loading tickets…</td></tr>
                  )}
                  {isError && (
                    <tr><td colSpan={10} className="px-3 py-12 text-center text-rose-600">
                      Failed to load tickets: {(error as Error)?.message ?? 'unknown error'}
                    </td></tr>
                  )}
                  {!isLoading && !isError && pageRows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-400">
                      {filtered.length === 0 && tickets.length > 0
                        ? 'No tickets match your search.'
                        : 'No tickets yet. Create one to get started.'}
                    </td></tr>
                  )}
                  {pageRows.map(t => {
                    const isActive = drawerId === t.numericId;
                    const sla = slaText(t);
                    return (
                      <tr
                        key={t.numericId}
                        onClick={() => setDrawerId(t.numericId)}
                        className={`group border-b border-slate-100 cursor-pointer transition-colors ${isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="accent-blue-600" checked={selected.has(t.numericId)} onChange={() => toggleOne(t.numericId)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${sevPill[t.severity]}`}>{t.severity}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{t.id}</td>
                        <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{t.alarmName}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{t.cell}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${statusPill[t.status]}`}>{t.status}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-5 h-5 grid place-items-center rounded-full text-white text-[9px] font-bold ${assigneeColor(t.assigneeId)}`}>
                              {initialsFromAssignee(t.assigneeId)}
                            </span>
                            <span className="text-slate-700">{t.assigneeId == null ? 'Unassigned' : userById.get(t.assigneeId)?.display_name || `User #${t.assigneeId}`}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatCreatedAt(t.createdAt)}</td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${sla.breached ? 'text-rose-600' : 'text-emerald-600'}`}>{sla.label}</td>
                        <td className="px-3 py-2.5 text-slate-600">{t.escalationLevel > 0 ? `L${t.escalationLevel}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-600">
              <div>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} className="h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50">‹</button>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  const p = i + 1;
                  const active = p === page;
                  return (
                    <button key={p} onClick={() => setPage(p)} className={`h-7 w-7 rounded font-semibold ${active ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-slate-50'}`}>{p}</button>
                  );
                })}
                {totalPages > 5 && <span className="px-1">…</span>}
                {totalPages > 5 && <button onClick={() => setPage(totalPages)} className="h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50">{totalPages}</button>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50">›</button>
              </div>
              <div className="flex items-center gap-1">
                <span>10 per page</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right drawer */}
      {drawer && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40" onClick={() => setDrawerId(null)} />
          <aside className="fixed right-0 top-0 h-full w-[440px] max-w-[92vw] z-50 bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${sevPill[drawer.severity]}`}>{drawer.severity}</span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${statusPill[drawer.status]}`}>{drawer.status}</span>
                  <button onClick={() => setDrawerId(null)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-slate-100 text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-base font-bold text-slate-900">{drawer.id}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">SLA</div>
                  <div className={`font-bold ${slaText(drawer).breached ? 'text-rose-600' : 'text-emerald-600'}`}>{slaText(drawer).label}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">Assignee</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-4 h-4 grid place-items-center rounded-full text-white text-[8px] font-bold ${assigneeColor(drawer.assigneeId)}`}>
                      {initialsFromAssignee(drawer.assigneeId)}
                    </span>
                    <span className="font-semibold text-slate-700">{drawer.assigneeId == null ? 'Unassigned' : userById.get(drawer.assigneeId)?.display_name || `User #${drawer.assigneeId}`}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 px-4 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
              {['Details', 'Timeline', 'Comments'].map((t, i) => (
                <button key={t} className={`py-2 border-b-2 ${i === 0 ? 'border-blue-600 text-blue-700' : 'border-transparent hover:text-slate-700'}`}>{t}</button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-[11px] text-slate-700">
              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Alarm Information</div>
                <dl className="space-y-1.5">
                  {[
                    ['Alarm Name', drawer.alarmName],
                    ['Site / Cell', drawer.cell],
                    ['Created', formatCreatedAt(drawer.createdAt)],
                    ['Escalation Level', drawer.escalationLevel > 0 ? `L${drawer.escalationLevel}` : 'None'],
                    ['Version', String(drawer.version)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-semibold text-slate-800 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {drawer.description && (
                <section>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</div>
                  <p className="text-slate-700 leading-relaxed">{drawer.description}</p>
                </section>
              )}

              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Quick Actions</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(drawer.status === 'Open' || drawer.status === 'Investigating') && (
                    <ActionBtn icon={<UserPlus className="w-3 h-3" />} label="Claim"
                      tone="bg-gradient-to-br from-cyan-500 to-cyan-600"
                      onClick={() => mutClaim.mutate({ id: drawer.numericId, version: drawer.version })} />
                  )}
                  {drawer.status !== 'Resolved' && drawer.status !== 'Closed' && drawer.status !== 'Cancelled' && (
                    <ActionBtn icon={<ArrowUpRight className="w-3 h-3" />} label="Escalate"
                      tone="bg-gradient-to-br from-orange-500 to-orange-600"
                      onClick={() => openEscalateDialog([drawer])} />
                  )}
                  {drawer.status !== 'Resolved' && drawer.status !== 'Closed' && drawer.status !== 'Cancelled' && (
                    <ActionBtn icon={<CheckCheck className="w-3 h-3" />} label="Resolve"
                      tone="bg-gradient-to-br from-emerald-500 to-emerald-600"
                      onClick={() => mutResolve.mutate({ id: drawer.numericId, version: drawer.version })} />
                  )}
                  {drawer.status === 'Resolved' && (
                    <ActionBtn icon={<Check className="w-3 h-3" />} label="Close"
                      tone="bg-gradient-to-br from-slate-500 to-slate-600"
                      onClick={() => mutClose.mutate({ id: drawer.numericId, version: drawer.version })} />
                  )}
                  {drawer.status === 'Resolved' && (
                    <ActionBtn icon={<RefreshCw className="w-3 h-3" />} label="Reopen"
                      tone="bg-gradient-to-br from-amber-500 to-amber-600"
                      onClick={() => mutReopen.mutate({ id: drawer.numericId, version: drawer.version })} />
                  )}
                </div>
              </section>
            </div>
          </aside>
        </>
      )}

      {createOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40" onClick={() => !mutCreate.isPending && setCreateOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={submitCreateTicket}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Create Ticket</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Open a backend NOC ticket with deduplication fingerprint support.</p>
                </div>
                <button type="button" disabled={mutCreate.isPending} onClick={() => setCreateOpen(false)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 px-5 py-4">
                {createError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {createError}
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Backend source alarm</span>
                  <select
                    value={sourceAlarmId}
                    onChange={(e) => applySourceAlarm(e.target.value)}
                    disabled={sourceLoading}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                  >
                    <option value="">{sourceLoading ? 'Loading active alarms...' : 'Select active backend alarm or keep manual'}</option>
                    {sourceAlarms.map((alarm) => {
                      const label = [
                        alarm.alarm_severity || 'alarm',
                        alarm.site_name || alarm.cell_name || alarm.mo_dn || alarm.id,
                        alarm.alarm_text || alarm.specific_problem || 'No label',
                      ].filter(Boolean).join(' · ');
                      return <option key={String(alarm.id)} value={String(alarm.id)}>{label}</option>;
                    })}
                  </select>
                  {sourceError && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">
                      Backend source unavailable: {sourceError}. Manual ticket creation remains available.
                    </p>
                  )}
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Title</span>
                  <input
                    value={createForm.title}
                    onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Cell availability degradation"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Severity</span>
                    <select value={createForm.severity} onChange={(e) => setCreateForm((f) => ({ ...f, severity: e.target.value as UiSeverity }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
                      <option>Critical</option>
                      <option>Major</option>
                      <option>Minor</option>
                      <option>Warning</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Target kind</span>
                    <input value={createForm.targetKind} onChange={(e) => setCreateForm((f) => ({ ...f, targetKind: e.target.value }))} placeholder="cell" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Target ref</span>
                    <input value={createForm.targetRef} onChange={(e) => setCreateForm((f) => ({ ...f, targetRef: e.target.value }))} placeholder="NE / cell / site" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fingerprint</span>
                  <input value={createForm.fingerprint} onChange={(e) => setCreateForm((f) => ({ ...f, fingerprint: e.target.value }))} placeholder="Optional duplicate key, e.g. alarm:site:kpi" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assignee</span>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={createUserSearch}
                      onChange={(e) => setCreateUserSearch(e.target.value)}
                      placeholder="Search users by name, email, team..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <select
                    value={createForm.assigneeId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, assigneeId: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Unassigned</option>
                    {createUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Description</span>
                  <textarea value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} rows={5} placeholder="Operational context, impact, first checks..." className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button type="button" disabled={mutCreate.isPending} onClick={() => setCreateOpen(false)} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={mutCreate.isPending} className="h-9 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  {mutCreate.isPending ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {assignOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40" onClick={() => !mutAssign.isPending && setAssignOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={submitAssignTickets}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Assign Ticket</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedTickets.length} selected ticket{selectedTickets.length > 1 ? 's' : ''}. Users are loaded from backend NOC users.
                  </p>
                </div>
                <button type="button" disabled={mutAssign.isPending} onClick={() => setAssignOpen(false)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 px-5 py-4">
                {assignError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {assignError}
                  </div>
                )}
                {sourceError && users.length === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Could not load users: {sourceError}
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assign to</span>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={assignUserSearch}
                      onChange={(e) => setAssignUserSearch(e.target.value)}
                      disabled={sourceLoading || mutAssign.isPending}
                      placeholder="Search users by name, email, team..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
                    />
                  </div>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    disabled={sourceLoading || mutAssign.isPending}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
                  >
                    <option value="">{sourceLoading ? 'Loading users...' : 'Unassigned'}</option>
                    {assignUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
                  {selectedTickets.map((ticket) => (
                    <div key={ticket.numericId} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-xs last:border-b-0">
                      <span className="font-semibold text-slate-800">{ticket.id}</span>
                      <span className="truncate text-slate-500">{ticket.alarmName}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button type="button" disabled={mutAssign.isPending} onClick={() => setAssignOpen(false)} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={mutAssign.isPending || sourceLoading} className="h-9 rounded-xl bg-cyan-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50">
                  {mutAssign.isPending ? 'Assigning...' : 'Apply Assignment'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {escalateOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40" onClick={() => !mutEscalateToUser.isPending && setEscalateOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={submitEscalateTickets}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Escalate Ticket</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Escalate {escalateTargets.length} ticket{escalateTargets.length > 1 ? 's' : ''} and assign ownership to a backend NOC user.
                  </p>
                </div>
                <button type="button" disabled={mutEscalateToUser.isPending} onClick={() => setEscalateOpen(false)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 px-5 py-4">
                {escalateError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {escalateError}
                  </div>
                )}
                {sourceError && users.length === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Could not load users: {sourceError}
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Escalate to user</span>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={escalateUserSearch}
                      onChange={(e) => setEscalateUserSearch(e.target.value)}
                      disabled={sourceLoading || mutEscalateToUser.isPending}
                      placeholder="Search users by name, email, team..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
                    />
                  </div>
                  <select
                    value={escalateUserId}
                    onChange={(e) => setEscalateUserId(e.target.value)}
                    disabled={sourceLoading || mutEscalateToUser.isPending}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
                  >
                    <option value="">{sourceLoading ? 'Loading users...' : 'Select user'}</option>
                    {escalateUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
                  {escalateTargets.map((ticket) => (
                    <div key={ticket.numericId} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-xs last:border-b-0">
                      <span className="font-semibold text-slate-800">{ticket.id}</span>
                      <span className="truncate text-slate-500">{ticket.alarmName}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button type="button" disabled={mutEscalateToUser.isPending} onClick={() => setEscalateOpen(false)} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={mutEscalateToUser.isPending || sourceLoading} className="h-9 rounded-xl bg-orange-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50">
                  {mutEscalateToUser.isPending ? 'Escalating...' : 'Escalate'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};


export default TicketManagementPage;
