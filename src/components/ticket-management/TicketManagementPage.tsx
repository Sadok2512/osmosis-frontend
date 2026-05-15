import React, { useMemo, useState } from 'react';
import {
  Ticket as TicketIcon, AlertTriangle, Clock, UserCheck, CheckCircle2, Activity,
  Plus, Check, UserPlus, ArrowUpRight, Sparkles, CheckCheck,
  Search, Filter, Columns3, Download, RefreshCw, X,
  Bot, ChevronRight, Bell, Settings2
} from 'lucide-react';

/* ─────────── Types & mock data ─────────── */

type Severity = 'Critical' | 'Major' | 'Minor' | 'Warning';
type Status = 'Open' | 'Investigating' | 'Assigned' | 'Escalated' | 'Resolved' | 'Closed';
type RcaStatus = 'Not Started' | 'In Progress' | 'Completed';

interface Ticket {
  id: string;
  severity: Severity;
  alarmName: string;
  site: string;
  cell: string;
  vendor: string;
  tech: string;
  status: Status;
  assignee: { name: string; initials: string; color: string };
  createdAt: string;
  sla: string; // negative = breached
  slaBreached: boolean;
  rca: RcaStatus;
  description?: string;
}

const TEAM = [
  { name: 'Alice B.',  initials: 'AB', color: 'bg-pink-500' },
  { name: 'Marie S.',  initials: 'MS', color: 'bg-amber-500' },
  { name: 'John D.',   initials: 'JD', color: 'bg-emerald-500' },
  { name: 'Sophie M.', initials: 'SM', color: 'bg-violet-500' },
  { name: 'Operator',  initials: 'OP', color: 'bg-slate-500' },
  { name: 'Pierre L.', initials: 'PL', color: 'bg-cyan-500' },
];

const ALARMS: Array<Pick<Ticket, 'severity' | 'alarmName' | 'site' | 'cell' | 'vendor' | 'tech' | 'status' | 'rca' | 'sla' | 'slaBreached' | 'description'>> = [
  { severity: 'Critical', alarmName: 'CLOCK_SYNC_LOST',    site: 'REIMS_BU (REIMS)',         cell: '97492_E3', vendor: 'Ericsson', tech: '4G LTE', status: 'Open',          rca: 'Not Started', sla: '-00:43:12', slaBreached: true,  description: 'Clock synchronization lost between eNodeB and time source. Services may be impacted.' },
  { severity: 'Major',    alarmName: 'HIGH_PTWP',          site: 'REIMS_VO (REIMS)',         cell: '77615_E2', vendor: 'Ericsson', tech: '4G LTE', status: 'Investigating', rca: 'In Progress', sla: '00:28:12',  slaBreached: false, description: 'Power transmit warning above threshold on sector 2.' },
  { severity: 'Major',    alarmName: 'VOLTE_REG_FAIL',     site: 'NANTES_C (NANTES)',        cell: '22311_A1', vendor: 'Nokia',    tech: '4G LTE', status: 'Assigned',      rca: 'Not Started', sla: '01:12:02',  slaBreached: false, description: 'VoLTE registration failure spike detected on cluster.' },
  { severity: 'Minor',    alarmName: 'RSRP_DEGRADATION',   site: 'MARSEILLE (MARSEILLE)',    cell: '55223_B4', vendor: 'Huawei',   tech: '5G NR',  status: 'Escalated',     rca: 'In Progress', sla: '-00:10:05', slaBreached: true,  description: 'RSRP degradation observed across three neighbour cells.' },
  { severity: 'Warning',  alarmName: 'CELL_DOWNTIME',      site: 'LILLE_CENTRE (LILLE)',     cell: '33445_C2', vendor: 'Ericsson', tech: '4G LTE', status: 'Open',          rca: 'Not Started', sla: '02:49:18',  slaBreached: false, description: 'Cell offline since 02:47:10. Auto-recovery attempts running.' },
  { severity: 'Major',    alarmName: 'CQI_DEGRADATION',    site: 'LYON_PART (LYON)',         cell: '66778_D1', vendor: 'Nokia',    tech: '4G LTE', status: 'Investigating', rca: 'In Progress', sla: '00:56:22',  slaBreached: false, description: 'Channel quality degradation across PRBs.' },
  { severity: 'Major',    alarmName: 'HANDOVER_FAILURE',   site: 'BORDEAUX (BORDEAUX)',      cell: '88990_A7', vendor: 'Ericsson', tech: '5G NR',  status: 'Assigned',      rca: 'In Progress', sla: '01:32:09',  slaBreached: false, description: 'X2 handover failure ratio above 5%.' },
  { severity: 'Critical', alarmName: 'CORE_SWITCH_FAIL',   site: 'TOULOUSE (TOULOUSE)',      cell: '11223_E9', vendor: 'Huawei',   tech: '4G LTE', status: 'Open',          rca: 'Not Started', sla: '-00:20:33', slaBreached: true,  description: 'Core switch failure impacting backhaul ring.' },
  { severity: 'Minor',    alarmName: 'DL_THROUGHPUT_LOW',  site: 'STRASBOURG (STRASBOURG)',  cell: '64556_F3', vendor: 'Nokia',    tech: '4G LTE', status: 'Investigating', rca: 'In Progress', sla: '00:45:11',  slaBreached: false, description: 'Sustained low DL throughput on busy hour.' },
  { severity: 'Warning',  alarmName: 'PING_LATENCY_HIGH',  site: 'NICE_CENTRE (NICE)',       cell: '77889_G6', vendor: 'Ericsson', tech: '4G LTE', status: 'Open',          rca: 'Not Started', sla: '02:19:47',  slaBreached: false, description: 'Edge ping latency above 80ms threshold.' },
];

const TICKETS: Ticket[] = ALARMS.map((a, i) => ({
  id: `TKT-2026-${10587 - i}`,
  ...a,
  assignee: TEAM[i % TEAM.length],
  createdAt: `12/05/2026  ${String(2 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:00`,
}));

/* ─────────── Style helpers ─────────── */

const sevPill: Record<Severity, string> = {
  Critical: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  Major:    'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  Minor:    'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  Warning:  'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
};

const statusPill: Record<Status, string> = {
  Open:          'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  Investigating: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Assigned:      'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  Escalated:     'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Resolved:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Closed:        'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const rcaDot: Record<RcaStatus, string> = {
  'Not Started': 'bg-slate-300',
  'In Progress': 'bg-amber-400',
  'Completed':   'bg-emerald-500',
};

/* ─────────── KPI cards ─────────── */

interface KpiDef { label: string; value: string; delta: string; tone: string; icon: React.ReactNode; spark: string; }

const KPIS: KpiDef[] = [
  { label: 'Open Tickets',    value: '1,248', delta: '+12% vs yesterday', tone: 'text-blue-600',    icon: <TicketIcon className="w-4 h-4" />,        spark: 'M0 18 L10 12 L20 14 L30 6 L40 10 L50 4 L60 8 L70 2' },
  { label: 'Critical Tickets',value: '327',   delta: '+8% vs yesterday',  tone: 'text-rose-600',    icon: <AlertTriangle className="w-4 h-4" />, spark: 'M0 14 L10 10 L20 16 L30 6 L40 12 L50 8 L60 14 L70 4' },
  { label: 'SLA Breached',    value: '42',    delta: '+5% vs yesterday',  tone: 'text-orange-600',  icon: <Clock className="w-4 h-4" />,         spark: 'M0 6 L10 14 L20 8 L30 12 L40 4 L50 10 L60 6 L70 14' },
  { label: 'Assigned to Me',  value: '18',    delta: '-3% vs yesterday',  tone: 'text-amber-600',   icon: <UserCheck className="w-4 h-4" />,     spark: 'M0 10 L10 6 L20 12 L30 8 L40 14 L50 6 L60 10 L70 8' },
  { label: 'Resolved Today',  value: '96',    delta: '+15% vs yesterday', tone: 'text-emerald-600', icon: <CheckCircle2 className="w-4 h-4" />,  spark: 'M0 14 L10 10 L20 12 L30 4 L40 8 L50 6 L60 4 L70 2' },
  { label: 'RCA Running',     value: '7',     delta: '+2 vs yesterday',   tone: 'text-violet-600',  icon: <Activity className="w-4 h-4" />,      spark: 'M0 8 L10 12 L20 6 L30 10 L40 4 L50 14 L60 8 L70 12' },
];

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
  const [tickets] = useState<Ticket[]>(TICKETS);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(t =>
      [t.id, t.alarmName, t.site, t.cell, t.vendor, t.assignee.name, t.status]
        .some(v => v.toLowerCase().includes(q))
    );
  }, [tickets, search]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const drawer = drawerId ? tickets.find(t => t.id === drawerId) ?? null : null;
  const allChecked = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) pageRows.forEach(r => next.delete(r.id));
      else pageRows.forEach(r => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const hasSelection = selected.size > 0;

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
              <button className="relative h-8 w-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                <Bell className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold">7</span>
              </button>
              <button className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                <Settings2 className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="w-8 h-8 grid place-items-center rounded-full bg-slate-700 text-white text-[11px] font-bold">SG</div>
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold text-slate-900">SGKV0640</div>
                  <div className="text-slate-500">Operator</div>
                </div>
              </div>
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
            <ActionBtn icon={<Plus className="w-3.5 h-3.5" />}        label="Create Ticket"   tone="bg-gradient-to-br from-blue-500 to-blue-600" />
            <ActionBtn icon={<Check className="w-3.5 h-3.5" />}       label="Acknowledge"     tone="bg-gradient-to-br from-emerald-500 to-emerald-600" disabled={!hasSelection} />
            <ActionBtn icon={<UserPlus className="w-3.5 h-3.5" />}    label="Assign"          tone="bg-gradient-to-br from-cyan-500 to-cyan-600"       disabled={!hasSelection} />
            <ActionBtn icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Escalate"       tone="bg-gradient-to-br from-orange-500 to-orange-600"   disabled={!hasSelection} />
            <ActionBtn icon={<Sparkles className="w-3.5 h-3.5" />}    label="Launch RCA"      tone="bg-gradient-to-br from-violet-500 to-violet-600"   disabled={!hasSelection} />
            <ActionBtn icon={<CheckCheck className="w-3.5 h-3.5" />}  label="Resolve"        tone="bg-gradient-to-br from-slate-500 to-slate-600"     disabled={!hasSelection} />
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
              <button className="h-8 w-8 grid place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
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
                    {['Severity','Ticket ID','Alarm Name','Site','Cell','Vendor','Tech','Status','Assignee','Created Time','SLA','RCA Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(t => {
                    const isActive = drawerId === t.id;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setDrawerId(t.id)}
                        className={`group border-b border-slate-100 cursor-pointer transition-colors ${isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="accent-blue-600" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${sevPill[t.severity]}`}>{t.severity}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{t.id}</td>
                        <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{t.alarmName}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{t.site}</td>
                        <td className="px-3 py-2.5 text-slate-600">{t.cell}</td>
                        <td className="px-3 py-2.5 text-slate-600">{t.vendor}</td>
                        <td className="px-3 py-2.5 text-slate-600">{t.tech}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${statusPill[t.status]}`}>{t.status}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-5 h-5 grid place-items-center rounded-full text-white text-[9px] font-bold ${t.assignee.color}`}>{t.assignee.initials}</span>
                            <span className="text-slate-700">{t.assignee.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{t.createdAt}</td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${t.slaBreached ? 'text-rose-600' : 'text-emerald-600'}`}>{t.sla}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${rcaDot[t.rca]}`} />
                            <span className="text-slate-600">{t.rca}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-400">No tickets match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-600">
              <div>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries</div>
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
                  <select className="h-7 px-2 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700">
                    <option>{drawer.status}</option>
                  </select>
                  <button onClick={() => setDrawerId(null)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-slate-100 text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-base font-bold text-slate-900">{drawer.id}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">SLA</div>
                  <div className={`font-bold ${drawer.slaBreached ? 'text-rose-600' : 'text-emerald-600'}`}>{drawer.sla}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-slate-400 font-semibold uppercase tracking-wide">Assignee</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-4 h-4 grid place-items-center rounded-full text-white text-[8px] font-bold ${drawer.assignee.color}`}>{drawer.assignee.initials}</span>
                    <span className="font-semibold text-slate-700">{drawer.assignee.name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 px-4 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
              {['Details', 'Timeline', 'Comments (2)', 'RCA Insights'].map((t, i) => (
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
                    ['Site / Cell', `${drawer.site.split(' ')[0]} / ${drawer.cell}`],
                    ['Vendor / Tech', `${drawer.vendor} / ${drawer.tech}`],
                    ['Start Time', drawer.createdAt],
                    ['Last Occurrence', drawer.createdAt],
                    ['Impact', 'Voice, Data Services'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-semibold text-slate-800 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</div>
                <p className="text-slate-700 leading-relaxed">{drawer.description}</p>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {['Synchronization', 'Clock', 'Timing', 'Core'].map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">{tag}</span>
                  ))}
                </div>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">RCA Insights</div>
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-violet-700 font-bold text-[10px] uppercase tracking-wide mb-1">
                    <Bot className="w-3 h-3" /> AI Analysis
                  </div>
                  <p className="text-slate-700 leading-relaxed">Probable cause: GPS antenna degradation on co-located cells. 3 neighbours show correlated sync drift in last 4h.</p>
                </div>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Quick Actions</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionBtn icon={<Check className="w-3 h-3" />}        label="Acknowledge" tone="bg-gradient-to-br from-emerald-500 to-emerald-600" />
                  <ActionBtn icon={<UserPlus className="w-3 h-3" />}     label="Assign"      tone="bg-gradient-to-br from-cyan-500 to-cyan-600" />
                  <ActionBtn icon={<ArrowUpRight className="w-3 h-3" />} label="Escalate"    tone="bg-gradient-to-br from-orange-500 to-orange-600" />
                  <ActionBtn icon={<Sparkles className="w-3 h-3" />}     label="Launch RCA"  tone="bg-gradient-to-br from-violet-500 to-violet-600" />
                  <button className="col-span-2 inline-flex items-center justify-center gap-1.5 h-7 rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                    <Plus className="w-3 h-3" /> Add Note
                  </button>
                </div>
              </section>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};


export default TicketManagementPage;
