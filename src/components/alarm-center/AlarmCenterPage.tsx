import React, { useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  Zap,
  TrendingUp,
  Activity,
  Radio,
  Server,
  X,
} from "lucide-react";

type Severity = "Critical" | "Major" | "Minor" | "Warning" | "Cleared";
type Status = "Active" | "Acknowledged" | "Cleared";
type Tech = "2G" | "3G" | "4G LTE" | "5G NR";
type Vendor = "Ericsson" | "Nokia" | "Huawei" | "ZTE";
type AlarmType =
  | "RF" | "Transmission" | "Power" | "VSWR" | "Hardware" | "Backhaul" | "Synchronization" | "Interference";

interface Alarm {
  id: string;
  name: string;
  severity: Severity;
  site: string;
  cell: string;
  vendor: Vendor;
  tech: Tech;
  type: AlarmType;
  region: string;
  startTime: string;
  duration: string;
  status: Status;
  kpis: string[];
  rca: boolean;
  probableCause: string;
  specificProblem: string;
  lastOccurrence: string;
  impactedUsers: number;
  aiScore: number;
}

const ALARM_NAMES: { name: string; type: AlarmType; cause: string; specific: string; kpis: string[] }[] = [
  { name: "VSWR Threshold Exceeded", type: "VSWR", cause: "Antenna/Feeder Issue", specific: "VSWR above threshold (1.8)", kpis: ["LINK", "PWR", "AVL"] },
  { name: "High Noise Floor", type: "Interference", cause: "External Interference", specific: "Noise floor > -95 dBm", kpis: ["SINR", "THP"] },
  { name: "RRU Link Failure", type: "Hardware", cause: "Fiber/Optical Module", specific: "CPRI link lost", kpis: ["THP", "CONN"] },
  { name: "GPS Synchronization Loss", type: "Synchronization", cause: "GNSS Receiver", specific: "GPS lock lost > 30s", kpis: ["SYNC"] },
  { name: "Backhaul Latency High", type: "Backhaul", cause: "Transport Network", specific: "Latency > 50ms sustained", kpis: ["LAT"] },
  { name: "External Interference Detected", type: "Interference", cause: "Co-channel Source", specific: "PUSCH IoT > -100 dBm", kpis: ["SINR"] },
  { name: "Neighbor Relation Failure", type: "RF", cause: "ANR Misconfig", specific: "HO failure rate > 5%", kpis: ["HO"] },
  { name: "PRB Congestion", type: "RF", cause: "Capacity Saturation", specific: "PRB util > 92%", kpis: ["THP"] },
  { name: "Power Supply Failure", type: "Power", cause: "Rectifier Module", specific: "DC voltage out of range", kpis: ["PWR"] },
  { name: "Fan Failure", type: "Hardware", cause: "Cooling Module", specific: "Fan RPM = 0", kpis: ["HW"] },
];

const SEVERITY_ORDER: Severity[] = ["Critical", "Major", "Minor", "Warning", "Cleared"];
const VENDORS: Vendor[] = ["Ericsson", "Nokia", "Huawei"];
const TECHS: Tech[] = ["4G LTE", "5G NR", "3G", "2G"];
const REGIONS = ["North", "South", "East", "West", "Central"];

const seedAlarms = (): Alarm[] => {
  const rows: Alarm[] = [];
  for (let i = 1; i <= 32; i++) {
    const tpl = ALARM_NAMES[i % ALARM_NAMES.length];
    const sev: Severity = i <= 3 ? "Critical" : i <= 9 ? "Major" : i <= 18 ? "Minor" : i <= 24 ? "Warning" : "Cleared";
    const status: Status = sev === "Cleared" ? "Cleared" : i % 7 === 0 ? "Acknowledged" : "Active";
    rows.push({
      id: `ALM-2024-${String(i).padStart(5, "0")}`,
      name: tpl.name,
      severity: sev,
      site: `SITE_${String((i * 13) % 200).padStart(4, "0")}`,
      cell: `CELL_${String((i * 7) % 500).padStart(4, "0")}`,
      vendor: VENDORS[i % VENDORS.length],
      tech: TECHS[i % TECHS.length],
      type: tpl.type,
      region: REGIONS[i % REGIONS.length],
      startTime: `10:${String(10 + (i % 50)).padStart(2, "0")}:${String((i * 3) % 60).padStart(2, "0")}`,
      duration: `00:${String((i % 5) + 1).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}`,
      status,
      kpis: tpl.kpis,
      rca: i % 4 === 0,
      probableCause: tpl.cause,
      specificProblem: tpl.specific,
      lastOccurrence: `10:${String(20 + (i % 30)).padStart(2, "0")}:${String((i * 5) % 60).padStart(2, "0")}`,
      impactedUsers: 100 + ((i * 137) % 1500),
      aiScore: 60 + ((i * 17) % 40),
    });
  }
  return rows;
};

const SEV_STYLES: Record<Severity, { dot: string; chip: string; text: string }> = {
  Critical: { dot: "bg-red-500", chip: "bg-red-50 text-red-700 ring-red-200", text: "text-red-600" },
  Major: { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 ring-orange-200", text: "text-orange-600" },
  Minor: { dot: "bg-amber-400", chip: "bg-amber-50 text-amber-700 ring-amber-200", text: "text-amber-600" },
  Warning: { dot: "bg-blue-400", chip: "bg-blue-50 text-blue-700 ring-blue-200", text: "text-blue-600" },
  Cleared: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", text: "text-emerald-600" },
};

const STATUS_STYLES: Record<Status, string> = {
  Active: "bg-red-50 text-red-700 ring-red-200",
  Acknowledged: "bg-amber-50 text-amber-700 ring-amber-200",
  Cleared: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const AlarmCenterPage: React.FC = () => {
  const [alarms] = useState<Alarm[]>(() => seedAlarms());
  const [aiOn, setAiOn] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(alarms[0]?.id);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    severity: new Set<Severity>(["Critical", "Major", "Minor", "Warning"]),
    tech: new Set<Tech>(["4G LTE", "5G NR"]),
    vendor: new Set<Vendor>(["Ericsson", "Nokia", "Huawei"]),
    region: "All",
    site: "All",
    type: "All" as "All" | AlarmType,
    status: new Set<Status>(["Active", "Acknowledged"]),
  });

  const toggleSet = <T,>(key: keyof typeof filters, value: T) => {
    setFilters((cur) => {
      const next = { ...cur } as any;
      const s: Set<T> = new Set(next[key]);
      if (s.has(value)) s.delete(value); else s.add(value);
      next[key] = s;
      return next;
    });
    setPage(1);
  };

  const filtered = useMemo(() => alarms.filter((a) => {
    if (search && !`${a.id} ${a.name} ${a.site} ${a.cell}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (!filters.severity.has(a.severity)) return false;
    if (!filters.tech.has(a.tech)) return false;
    if (!filters.vendor.has(a.vendor)) return false;
    if (filters.region !== "All" && a.region !== filters.region) return false;
    if (filters.type !== "All" && a.type !== filters.type) return false;
    if (!filters.status.has(a.status)) return false;
    return true;
  }), [alarms, filters, search]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { Critical: 0, Major: 0, Minor: 0, Warning: 0, Cleared: 0 };
    alarms.forEach((a) => { c[a.severity]++; });
    return c;
  }, [alarms]);

  const selected = alarms.find((a) => a.id === selectedId) || alarms[0];

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const kpis = [
    { label: "Total Active Alarms", value: "1,256", trend: "+12% from yesterday", color: "text-red-600", trendColor: "text-red-500" },
    { label: "Critical", value: String(counts.Critical * 30 + 215), trend: "↑ 8%", color: "text-red-600", trendColor: "text-red-500" },
    { label: "Major", value: String(counts.Major * 50 + 487), trend: "↑ 15%", color: "text-orange-600", trendColor: "text-orange-500" },
    { label: "Minor", value: String(counts.Minor * 30 + 401), trend: "↓ 5%", color: "text-amber-600", trendColor: "text-amber-500" },
    { label: "Warning", value: "153", trend: "↓ 3%", color: "text-blue-600", trendColor: "text-blue-500" },
    { label: "Cleared (Today)", value: "2,345", trend: "↑ 18%", color: "text-emerald-600", trendColor: "text-emerald-500" },
    { label: "Affected Sites", value: "312", trend: "↑ 10%", color: "text-slate-900", trendColor: "text-slate-500" },
    { label: "Affected Cells", value: "8,753", trend: "↑ 7%", color: "text-slate-900", trendColor: "text-slate-500" },
    ...(aiOn ? [{ label: "AI Correlated", value: "1,024", trend: "↑ 81%", color: "text-indigo-600", trendColor: "text-indigo-500" }] : []),
  ];

  const toggleAll = () => {
    if (checked.size === paged.length) setChecked(new Set());
    else setChecked(new Set(paged.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(checked);
    n.has(id) ? n.delete(id) : n.add(id);
    setChecked(n);
  };

  const topSites = useMemo(() => {
    const map = new Map<string, { region: string; count: number; critical: number }>();
    alarms.forEach((a) => {
      const cur = map.get(a.site) || { region: a.region, count: 0, critical: 0 };
      cur.count++;
      if (a.severity === "Critical") cur.critical++;
      map.set(a.site, cur);
    });
    return Array.from(map.entries())
      .map(([site, v]) => ({ site, ...v, score: (v.critical * 2 + v.count) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [alarms]);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Bell className="text-blue-600" size={22} /> Alarm Center
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Real-time telecom fault monitoring and intelligent correlation</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alarms, sites, cells, or alarm IDs..."
                className="h-9 w-72 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">Last 24h</button>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 h-9">
              <span className="text-xs font-semibold text-slate-700">AI Assistance</span>
              <button
                type="button"
                onClick={() => setAiOn(!aiOn)}
                className={`relative h-5 w-9 rounded-full transition ${aiOn ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${aiOn ? "left-4" : "left-0.5"}`} />
              </button>
            </label>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
            <span className="text-xs font-semibold text-slate-500">{new Date().toLocaleTimeString()}</span>
            <button className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center" title="Refresh"><RefreshCw size={14} /></button>
            <button className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center" title="Export"><Download size={14} /></button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className={`grid gap-3 ${aiOn ? "grid-cols-9" : "grid-cols-8"}`}>
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k.label}</div>
            <div className={`mt-1 text-2xl font-extrabold ${k.color}`}>{k.value}</div>
            <div className={`mt-1 text-[10px] font-semibold ${k.trendColor}`}>{k.trend}</div>
          </div>
        ))}
      </div>

      {/* MAIN 3-COL */}
      <div className="grid grid-cols-12 gap-4">
        {/* LEFT — FILTERS */}
        <aside className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-900">Filters</span>
            <button className="text-[10px] font-bold text-blue-600 hover:underline" onClick={() => {
              setFilters({
                severity: new Set(SEVERITY_ORDER),
                tech: new Set(TECHS),
                vendor: new Set(VENDORS),
                region: "All", site: "All", type: "All",
                status: new Set<Status>(["Active", "Acknowledged", "Cleared"]),
              });
            }}>Clear All</button>
          </div>

          <FilterGroup title="Severity">
            {SEVERITY_ORDER.map((s) => (
              <CheckRow key={s} label={s} count={counts[s]} checked={filters.severity.has(s)} onToggle={() => toggleSet("severity", s)} accent={SEV_STYLES[s].dot} />
            ))}
          </FilterGroup>

          <FilterGroup title="Technology">
            {TECHS.map((t) => (
              <CheckRow key={t} label={t} count={alarms.filter((a) => a.tech === t).length} checked={filters.tech.has(t)} onToggle={() => toggleSet("tech", t)} />
            ))}
          </FilterGroup>

          <FilterGroup title="Vendor">
            {VENDORS.map((v) => (
              <CheckRow key={v} label={v} count={alarms.filter((a) => a.vendor === v).length} checked={filters.vendor.has(v)} onToggle={() => toggleSet("vendor", v)} />
            ))}
          </FilterGroup>

          <FilterGroup title="Region">
            <select value={filters.region} onChange={(e) => { setFilters((f) => ({ ...f, region: e.target.value })); setPage(1); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
              <option>All</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </FilterGroup>

          <FilterGroup title="Alarm Type">
            <select value={filters.type} onChange={(e) => { setFilters((f) => ({ ...f, type: e.target.value as any })); setPage(1); }} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
              <option>All</option>
              {(["RF", "Transmission", "Power", "VSWR", "Hardware", "Backhaul", "Synchronization", "Interference"] as AlarmType[]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </FilterGroup>

          <FilterGroup title="Status">
            {(["Active", "Acknowledged", "Cleared"] as Status[]).map((s) => (
              <CheckRow key={s} label={s} count={alarms.filter((a) => a.status === s).length} checked={filters.status.has(s)} onToggle={() => toggleSet("status", s)} />
            ))}
          </FilterGroup>

          <div className="space-y-2 pt-2">
            <button className="w-full h-9 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">Apply Filters</button>
            <button className="w-full h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">Reset</button>
          </div>
        </aside>

        {/* CENTER */}
        <section className="col-span-7 space-y-4">
          {/* Density timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-extrabold text-slate-900">Alarm Density Timeline (Today)</span>
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" />Minor</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-500" />Major</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" />Critical</span>
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-20">
              {Array.from({ length: 96 }).map((_, i) => {
                const h = 20 + Math.abs(Math.sin(i * 0.4) * 60 + (i > 40 && i < 60 ? 20 : 0));
                const c = i > 50 && i < 65 ? "bg-red-500" : i > 35 && i < 70 ? "bg-orange-500" : "bg-amber-400";
                return <div key={i} className={`flex-1 rounded-sm ${c} hover:opacity-70 cursor-pointer`} style={{ height: `${h}%` }} />;
              })}
            </div>
            <div className="flex justify-between text-[9px] font-semibold text-slate-400 mt-1">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>

          {/* Alarm Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
              <span className="text-sm font-extrabold text-slate-900">Alarms ({filtered.length.toLocaleString()})</span>
              <div className="flex items-center gap-2">
                <button className="h-7 px-2 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                  Bulk Actions <ChevronDown size={11} />
                </button>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                  <input placeholder="Search in table" className="h-7 w-48 rounded-md border border-slate-200 bg-white pl-6 pr-2 text-[11px] outline-none focus:border-blue-400" />
                </div>
                <button className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="Filter"><Filter size={12} /></button>
              </div>
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2"><input type="checkbox" checked={paged.length > 0 && checked.size === paged.length} onChange={toggleAll} /></th>
                    <th className="px-2 py-2 font-bold">Severity</th>
                    <th className="px-2 py-2 font-bold">Alarm ID</th>
                    <th className="px-2 py-2 font-bold">Alarm Name</th>
                    <th className="px-2 py-2 font-bold">Site</th>
                    <th className="px-2 py-2 font-bold">Cell</th>
                    <th className="px-2 py-2 font-bold">Vendor</th>
                    <th className="px-2 py-2 font-bold">Tech</th>
                    <th className="px-2 py-2 font-bold">Start Time</th>
                    <th className="px-2 py-2 font-bold">Duration</th>
                    <th className="px-2 py-2 font-bold">Status</th>
                    <th className="px-2 py-2 font-bold">KPI Impact</th>
                    {aiOn && <th className="px-2 py-2 font-bold">RCA</th>}
                    <th className="px-2 py-2 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a) => (
                    <tr key={a.id} onClick={() => setSelectedId(a.id)} className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/40 ${selectedId === a.id ? "bg-blue-50" : ""}`}>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(a.id)} onChange={() => toggleOne(a.id)} /></td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${SEV_STYLES[a.severity].chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${SEV_STYLES[a.severity].dot}`} /> {a.severity}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-slate-600">{a.id}</td>
                      <td className="px-2 py-2 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-2 py-2 text-slate-700">{a.site}</td>
                      <td className="px-2 py-2 text-slate-700">{a.cell}</td>
                      <td className="px-2 py-2 text-slate-700">{a.vendor}</td>
                      <td className="px-2 py-2"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700">{a.tech}</span></td>
                      <td className="px-2 py-2 text-slate-600">{a.startTime}</td>
                      <td className="px-2 py-2 text-slate-600">{a.duration}</td>
                      <td className="px-2 py-2"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_STYLES[a.status]}`}>{a.status}</span></td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          {a.kpis.map((k) => <span key={k} className="rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-1 py-0.5 text-[9px] font-bold">{k}</span>)}
                        </div>
                      </td>
                      {aiOn && <td className="px-2 py-2">{a.rca ? <span className="text-[10px] font-bold text-indigo-600">●</span> : <span className="text-slate-300">—</span>}</td>}
                      <td className="px-2 py-2 text-slate-400">···</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200">
              <span className="text-[11px] text-slate-500">Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} alarms</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const p = i + 1;
                  return <button key={p} onClick={() => setPage(p)} className={`h-7 w-7 rounded-md text-[11px] font-bold ${page === p ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{p}</button>;
                })}
                <select className="ml-2 h-7 rounded-md border border-slate-200 text-[11px] px-1">
                  <option>10 / page</option><option>25 / page</option><option>50 / page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bottom analytics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-extrabold text-slate-900">Top Alarmed Sites</span>
                <a className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer">View all sites →</a>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                  <tr><th className="px-2 py-1.5 text-left font-bold">Site</th><th className="px-2 py-1.5 text-left font-bold">Region</th><th className="px-2 py-1.5 text-left font-bold">Alarm Count</th><th className="px-2 py-1.5 text-left font-bold">Critical</th><th className="px-2 py-1.5 text-left font-bold">Impact Score</th></tr>
                </thead>
                <tbody>
                  {topSites.map((s) => (
                    <tr key={s.site} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-semibold text-slate-800">{s.site}</td>
                      <td className="px-2 py-1.5 text-slate-600">{s.region}</td>
                      <td className="px-2 py-1.5 text-slate-700">{s.count}</td>
                      <td className="px-2 py-1.5 text-red-600 font-bold">{s.critical}</td>
                      <td className="px-2 py-1.5 text-slate-700">{s.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-sm font-extrabold text-slate-900">Alarm Distribution</span>
              <div className="flex items-center gap-4 mt-3">
                <Donut counts={counts} />
                <div className="space-y-1.5 flex-1">
                  {SEVERITY_ORDER.map((s) => {
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    const pct = Math.round((counts[s] / total) * 100);
                    return (
                      <div key={s} className="flex items-center gap-2 text-[11px]">
                        <span className={`h-2 w-2 rounded-full ${SEV_STYLES[s].dot}`} />
                        <span className="font-semibold text-slate-700 w-16">{s}</span>
                        <span className="font-bold text-slate-900 ml-auto">{counts[s]} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Global Actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 mr-2">Selected: {checked.size}</span>
            <button className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={12} /> Acknowledge Selected</button>
            <button className="h-8 px-3 rounded-md bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5"><Ticket size={12} /> Create Ticket</button>
            <button className="h-8 px-3 rounded-md bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 flex items-center gap-1.5"><TrendingUp size={12} /> Escalate</button>
            {aiOn && <button className="h-8 px-3 rounded-md bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5"><Sparkles size={12} /> Launch RCA</button>}
            <button className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download size={12} /> Export Selected</button>
          </div>
        </section>

        {/* RIGHT — Details + AI */}
        <aside className="col-span-3 space-y-4">
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">{selected.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{selected.id}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${SEV_STYLES[selected.severity].chip}`}>{selected.severity}</span>
                  <button className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <Field label="Site" value={selected.site} />
                <Field label="Start Time" value={selected.startTime} />
                <Field label="Cell" value={selected.cell} />
                <Field label="Duration" value={selected.duration} />
                <Field label="Vendor" value={selected.vendor} />
                <Field label="Status"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_STYLES[selected.status]}`}>{selected.status}</span></Field>
                <Field label="Technology" value={selected.tech} />
                <Field label="Last Occurrence" value={selected.lastOccurrence} />
                <Field label="Probable Cause" value={selected.probableCause} />
                <Field label="Impacted Users" value={selected.impactedUsers.toLocaleString()} />
                <div className="col-span-2"><Field label="Specific Problem" value={selected.specificProblem} /></div>
              </div>

              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Impacted KPIs</div>
                <div className="flex flex-wrap gap-1">
                  {selected.kpis.map((k) => <span key={k} className="rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[10px] font-bold">{k}</span>)}
                  <span className="rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[10px] font-bold">THROUGHPUT</span>
                  <span className="rounded bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[10px] font-bold">ACCESSIBILITY</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase text-slate-500 mb-2">Timeline</div>
                <ol className="space-y-2 border-l border-slate-200 pl-3">
                  {[
                    { time: selected.startTime, label: "Alarm Raised", color: "bg-red-500" },
                    { time: "10:22:45", label: "KPI Degradation Detected", color: "bg-orange-500" },
                    { time: "10:22:20", label: "Neighbor Impacted (3)", color: "bg-amber-500" },
                    ...(aiOn ? [{ time: "10:23:20", label: "RCA Triggered", color: "bg-indigo-500" }] : []),
                    { time: "—", label: "Ticket Not Created", color: "bg-slate-300" },
                  ].map((t, i) => (
                    <li key={i} className="relative flex items-start gap-2 text-[11px]">
                      <span className={`absolute -left-[17px] top-1 h-2 w-2 rounded-full ${t.color}`} />
                      <span className="font-mono text-slate-500 w-14">{t.time}</span>
                      <span className="text-slate-700">{t.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* AI panel */}
          {aiOn ? (
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="text-indigo-600" size={14} />
                  <span className="text-sm font-extrabold text-slate-900">AI Insights</span>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">{selected?.aiScore || 87}% Correlation Score</span>
              </div>

              <div className="space-y-3 text-[11px]">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Suspected Root Cause</div>
                  <div className="mt-1 rounded-md bg-white border border-slate-200 p-2 text-slate-700">High VSWR due to faulty feeder connection</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Correlated Alarms (2)</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded bg-orange-50 text-orange-700 ring-1 ring-orange-200 px-2 py-0.5 font-bold">High Noise Floor</span>
                    <span className="rounded bg-orange-50 text-orange-700 ring-1 ring-orange-200 px-2 py-0.5 font-bold">External Interference</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Related KPI Degradation</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded bg-red-50 text-red-700 ring-1 ring-red-200 px-2 py-0.5 font-bold">SINR ↓ 6.2 dB</span>
                    <span className="rounded bg-red-50 text-red-700 ring-1 ring-red-200 px-2 py-0.5 font-bold">Throughput ↓ 45%</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Recent Changes</div>
                  <div className="mt-1 text-slate-700">Antenna Tilt Change at 09:45</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Neighbor Impact</div>
                  <div className="mt-1 text-slate-700">3 cells impacted</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Recommended Action</div>
                  <div className="mt-1 rounded-md bg-indigo-50 border border-indigo-200 p-2 text-indigo-900">Inspect feeder connection and antenna system</div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500"><span>Confidence</span><span className="text-emerald-700">High (81%)</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: "81%" }} /></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Sparkles className="mx-auto text-slate-400 mb-2" size={20} />
              <div className="text-xs font-semibold text-slate-600">AI Assistance is disabled.</div>
              <div className="text-[11px] text-slate-500 mt-1">Enable it to view correlation insights and smart recommendations.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const FilterGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{title}</div>
    <div className="space-y-1">{children}</div>
  </div>
);

const CheckRow: React.FC<{ label: string; count: number; checked: boolean; onToggle: () => void; accent?: string }> = ({ label, count, checked, onToggle, accent }) => (
  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
    <input type="checkbox" checked={checked} onChange={onToggle} className="h-3.5 w-3.5 accent-blue-600" />
    {accent && <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />}
    <span className="text-slate-700 flex-1">{label}</span>
    <span className="text-slate-400 font-semibold">{count}</span>
  </label>
);

const Field: React.FC<{ label: string; value?: string; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div>
    <div className="text-[9px] font-bold uppercase text-slate-400">{label}</div>
    <div className="text-[11px] font-semibold text-slate-800 mt-0.5">{children || value}</div>
  </div>
);

const Donut: React.FC<{ counts: Record<Severity, number> }> = ({ counts }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors: Record<Severity, string> = { Critical: "#ef4444", Major: "#f97316", Minor: "#fbbf24", Warning: "#3b82f6", Cleared: "#10b981" };
  let acc = 0;
  const r = 32, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 90 90" width="90" height="90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
      {SEVERITY_ORDER.map((s) => {
        const frac = counts[s] / total;
        const len = frac * c;
        const dasharray = `${len} ${c - len}`;
        const dashoffset = -acc;
        acc += len;
        return <circle key={s} cx="45" cy="45" r={r} fill="none" stroke={colors[s]} strokeWidth="14" strokeDasharray={dasharray} strokeDashoffset={dashoffset} transform="rotate(-90 45 45)" />;
      })}
    </svg>
  );
};

export default AlarmCenterPage;
