import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  Maximize2,
  Minimize2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  TrendingUp,
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

// Refined severity palette — softer pastel chips, modern enterprise SaaS feel.
const SEV_STYLES: Record<Severity, { dot: string; chip: string; text: string; bar: string }> = {
  Critical: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-600 ring-rose-100", text: "text-rose-600", bar: "bg-rose-500" },
  Major:    { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-600 ring-orange-100", text: "text-orange-600", bar: "bg-orange-500" },
  Minor:    { dot: "bg-amber-400", chip: "bg-amber-50 text-amber-600 ring-amber-100", text: "text-amber-600", bar: "bg-amber-400" },
  Warning:  { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-600 ring-blue-100", text: "text-blue-600", bar: "bg-blue-500" },
  Cleared:  { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600 ring-emerald-100", text: "text-emerald-600", bar: "bg-emerald-500" },
};

const STATUS_STYLES: Record<Status, string> = {
  Active: "bg-rose-50 text-rose-600 ring-rose-100",
  Acknowledged: "bg-amber-50 text-amber-600 ring-amber-100",
  Cleared: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

// Reusable card surface — pure white, soft border, very subtle elevation.
const CARD = "rounded-2xl border border-[#e8edf5] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]";

const AlarmCenterPage: React.FC = () => {
  const [alarms] = useState<Alarm[]>(() => seedAlarms());
  const [aiOn, setAiOn] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(alarms[0]?.id);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showMap, setShowMap] = useState(false);
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
    { label: "Total Active Alarms", value: "1,256", trend: "+12% from yesterday", color: "text-rose-600", trendColor: "text-rose-500", spark: "rose" },
    { label: "Critical", value: String(counts.Critical * 30 + 215), trend: "↑ 8%", color: "text-rose-600", trendColor: "text-rose-500", spark: "rose" },
    { label: "Major", value: String(counts.Major * 50 + 487), trend: "↑ 15%", color: "text-orange-600", trendColor: "text-orange-500", spark: "orange" },
    { label: "Minor", value: String(counts.Minor * 30 + 401), trend: "↓ 5%", color: "text-amber-600", trendColor: "text-amber-500", spark: "amber" },
    { label: "Warning", value: "153", trend: "↓ 3%", color: "text-blue-600", trendColor: "text-blue-500", spark: "blue" },
    { label: "Cleared (Today)", value: "2,345", trend: "↑ 18%", color: "text-emerald-600", trendColor: "text-emerald-500", spark: "emerald" },
    { label: "Affected Sites", value: "312", trend: "↑ 10%", color: "text-slate-900", trendColor: "text-slate-500", spark: "slate" },
    { label: "Affected Cells", value: "8,753", trend: "↑ 7%", color: "text-slate-900", trendColor: "text-slate-500", spark: "slate" },
    ...(aiOn ? [{ label: "AI Correlated", value: "1,024", trend: "↑ 81%", color: "text-indigo-600", trendColor: "text-indigo-500", spark: "indigo" }] : []),
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
    <div
      className="space-y-5 p-5 min-h-full"
      style={{ background: "#f6f8fb", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      {/* HEADER */}
      <div className={`${CARD} px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center">
              <Bell className="text-blue-600" size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 leading-tight">Alarm Center</h1>
              <p className="text-[12px] text-slate-500 mt-0.5 font-normal">Real-time telecom fault monitoring and intelligent correlation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} strokeWidth={1.75} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alarms, sites, cells, or alarm IDs..."
                className="h-9 w-80 rounded-full border border-[#e8edf5] bg-[#f9fafc] pl-9 pr-3 text-[12px] text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button className="h-9 px-3.5 rounded-full border border-[#e8edf5] bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5">
              Last 24h <ChevronDown size={12} strokeWidth={1.75} />
            </button>
            <label className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-white px-3 h-9">
              <span className="text-[12px] font-medium text-slate-600">AI Assistance</span>
              <button
                type="button"
                onClick={() => setAiOn(!aiOn)}
                className={`relative h-5 w-9 rounded-full transition-colors ${aiOn ? "bg-gradient-to-r from-blue-500 to-indigo-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${aiOn ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </label>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-100">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
            <span className="text-[12px] font-medium text-slate-500 tabular-nums">{new Date().toLocaleTimeString()}</span>
            <button
              onClick={() => setShowMap((v) => !v)}
              className={`h-9 px-3.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition ring-1 ${
                showMap
                  ? "bg-blue-600 text-white ring-blue-600 shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:bg-blue-700"
                  : "bg-white text-blue-600 ring-blue-200 hover:bg-blue-50"
              }`}
              title="Toggle map view"
            >
              <MapPin size={14} strokeWidth={2} />
              {showMap ? "Hide Map" : "Show Map"}
            </button>
            <button className="h-9 w-9 rounded-full border border-[#e8edf5] bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition flex items-center justify-center" title="Refresh"><RefreshCw size={14} strokeWidth={1.75} /></button>
            <button className="h-9 w-9 rounded-full border border-[#e8edf5] bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition flex items-center justify-center" title="Export"><Download size={14} strokeWidth={1.75} /></button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className={`grid gap-3 ${aiOn ? "grid-cols-9" : "grid-cols-8"}`}>
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`${CARD} px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(15,23,42,0.06)]`}
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">{k.label}</div>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <div className={`text-[26px] font-bold leading-none tracking-tight ${k.color} tabular-nums`}>{k.value}</div>
              <Sparkline color={k.spark} />
            </div>
            <div className={`mt-2 text-[11px] font-medium ${k.trendColor}`}>{k.trend}</div>
          </div>
        ))}
      </div>

      {/* MAP PANEL — visible when Show Map is toggled */}
      {showMap && (
        <div
          className={
            mapFullscreen
              ? "fixed inset-0 z-[1000] bg-white p-4 flex flex-col animate-in fade-in duration-200"
              : `${CARD} px-5 py-4 animate-in fade-in duration-300`
          }
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-blue-600" strokeWidth={2} />
              <span className="text-[14px] font-semibold text-slate-900">Network Alarm Map</span>
              <span className="text-[11px] text-slate-500 font-medium">— {topSites.length} impacted sites</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMapFullscreen((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition px-2 py-1 rounded ring-1 ring-slate-200"
                title={mapFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {mapFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                {mapFullscreen ? "Exit" : "Fullscreen"}
              </button>
              <button
                onClick={() => { setMapFullscreen(false); setShowMap(false); }}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-700 transition"
              >
                Close ✕
              </button>
            </div>
          </div>
          <div className={mapFullscreen ? "flex-1 min-h-0" : ""}>
            <SitesMiniMap sites={topSites} fullscreen={mapFullscreen} />
          </div>
        </div>
      )}

      {/* MAIN 3-COL */}
      <div className="grid grid-cols-12 gap-4">
        {/* LEFT — FILTERS */}
        <aside className={`col-span-2 ${CARD} p-4 space-y-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-slate-900">Filters</span>
            <button
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition"
              onClick={() => {
                setFilters({
                  severity: new Set(SEVERITY_ORDER),
                  tech: new Set(TECHS),
                  vendor: new Set(VENDORS),
                  region: "All", site: "All", type: "All",
                  status: new Set<Status>(["Active", "Acknowledged", "Cleared"]),
                });
              }}
            >
              Clear All
            </button>
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
            <select
              value={filters.region}
              onChange={(e) => { setFilters((f) => ({ ...f, region: e.target.value })); setPage(1); }}
              className="h-9 w-full rounded-lg border border-[#e8edf5] bg-[#f9fafc] px-2.5 text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              <option>All</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </FilterGroup>

          <FilterGroup title="Alarm Type">
            <select
              value={filters.type}
              onChange={(e) => { setFilters((f) => ({ ...f, type: e.target.value as any })); setPage(1); }}
              className="h-9 w-full rounded-lg border border-[#e8edf5] bg-[#f9fafc] px-2.5 text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
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
            <button className="w-full h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[12px] font-semibold shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition-all">
              Apply Filters
            </button>
            <button className="w-full h-10 rounded-full border border-[#e8edf5] bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition">
              Reset
            </button>
          </div>
        </aside>

        {/* CENTER */}
        <section className="col-span-7 space-y-4">
          {/* Density timeline */}
          <div className={`${CARD} px-5 py-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-semibold text-slate-900">Alarm Density Timeline (Today)</span>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-400" />Minor</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-orange-500" />Major</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" />Critical</span>
              </div>
            </div>
            <div className="flex items-end gap-[2px] h-24">
              {Array.from({ length: 96 }).map((_, i) => {
                const h = 20 + Math.abs(Math.sin(i * 0.4) * 60 + (i > 40 && i < 60 ? 20 : 0));
                const c = i > 50 && i < 65 ? "bg-rose-500" : i > 35 && i < 70 ? "bg-orange-500" : "bg-amber-400";
                return <div key={i} className={`flex-1 rounded-[2px] ${c} opacity-90 hover:opacity-100 hover:-translate-y-0.5 transition cursor-pointer`} style={{ height: `${h}%` }} />;
              })}
            </div>
            <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-2 tabular-nums">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>

          {/* Alarm Table */}
          <div className={CARD}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#eef2f8]">
              <span className="text-[14px] font-semibold text-slate-900">Alarms <span className="text-slate-400 font-medium">({filtered.length.toLocaleString()})</span></span>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 rounded-full border border-[#e8edf5] bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5">
                  Bulk Actions <ChevronDown size={11} strokeWidth={1.75} />
                </button>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} strokeWidth={1.75} />
                  <input placeholder="Search in table" className="h-8 w-52 rounded-full border border-[#e8edf5] bg-[#f9fafc] pl-7 pr-3 text-[11px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
                </div>
                <button className="h-8 w-8 rounded-full border border-[#e8edf5] bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center transition" title="Filter"><Filter size={12} strokeWidth={1.75} /></button>
              </div>
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-[#f9fafc] border-b border-[#eef2f8]">
                  <tr className="text-[10px] uppercase tracking-[0.06em] text-slate-400">
                    <th className="px-3 py-2.5"><input type="checkbox" checked={paged.length > 0 && checked.size === paged.length} onChange={toggleAll} className="h-3.5 w-3.5 rounded accent-blue-600" /></th>
                    <th className="px-3 py-2.5 font-medium">Severity</th>
                    <th className="px-3 py-2.5 font-medium">Alarm ID</th>
                    <th className="px-3 py-2.5 font-medium">Alarm Name</th>
                    <th className="px-3 py-2.5 font-medium">Site</th>
                    <th className="px-3 py-2.5 font-medium">Cell</th>
                    <th className="px-3 py-2.5 font-medium">Vendor</th>
                    <th className="px-3 py-2.5 font-medium">Tech</th>
                    <th className="px-3 py-2.5 font-medium">Start Time</th>
                    <th className="px-3 py-2.5 font-medium">Duration</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">KPI Impact</th>
                    {aiOn && <th className="px-3 py-2.5 font-medium">RCA</th>}
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {paged.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={`border-b border-[#f1f5fb] cursor-pointer transition-colors ${selectedId === a.id ? "bg-blue-50/60" : "hover:bg-[#f9fbfe]"}`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(a.id)} onChange={() => toggleOne(a.id)} className="h-3.5 w-3.5 rounded accent-blue-600" />
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEV_STYLES[a.severity].chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${SEV_STYLES[a.severity].dot}`} /> {a.severity}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-500">{a.id}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{a.name}</td>
                      <td className="px-3 py-3 text-slate-600 tabular-nums">{a.site}</td>
                      <td className="px-3 py-3 text-slate-600 tabular-nums">{a.cell}</td>
                      <td className="px-3 py-3 text-slate-600">{a.vendor}</td>
                      <td className="px-3 py-3"><span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">{a.tech}</span></td>
                      <td className="px-3 py-3 text-slate-500 tabular-nums">{a.startTime}</td>
                      <td className="px-3 py-3 text-slate-500 tabular-nums">{a.duration}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLES[a.status]}`}>{a.status}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {a.kpis.map((k) => <span key={k} className="rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100 px-1.5 py-0.5 text-[10px] font-semibold">{k}</span>)}
                        </div>
                      </td>
                      {aiOn && <td className="px-3 py-3">{a.rca ? <span className="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" /> : <span className="text-slate-300">—</span>}</td>}
                      <td className="px-3 py-3 text-slate-400">···</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#eef2f8]">
              <span className="text-[11px] text-slate-500">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} alarms
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-full text-[11px] font-semibold transition ${
                        page === p
                          ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
                          : "border border-[#e8edf5] text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <select className="ml-2 h-7 rounded-full border border-[#e8edf5] text-[11px] px-2 bg-white text-slate-600">
                  <option>10 / page</option><option>25 / page</option><option>50 / page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bottom analytics */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`${CARD} px-5 py-4`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[14px] font-semibold text-slate-900">Top Alarmed Sites</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMap((v) => !v)}
                    className={`h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition ring-1 ${
                      showMap
                        ? "bg-blue-600 text-white ring-blue-600 shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:bg-blue-700"
                        : "bg-white text-blue-600 ring-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <MapPin size={12} strokeWidth={2} />
                    {showMap ? "Hide Map" : "Display Map"}
                  </button>
                  <a className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition cursor-pointer">View all →</a>
                </div>
              </div>
              {showMap ? (
                <SitesMiniMap sites={topSites} />
              ) : (
              <table className="w-full">
                <thead className="text-[10px] uppercase tracking-[0.06em] text-slate-400 border-b border-[#eef2f8]">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Site</th>
                    <th className="px-2 py-2 text-left font-medium">Region</th>
                    <th className="px-2 py-2 text-left font-medium">Alarm Count</th>
                    <th className="px-2 py-2 text-left font-medium">Critical</th>
                    <th className="px-2 py-2 text-left font-medium">Impact Score</th>
                  </tr>
                </thead>
                <tbody className="text-[12px]">
                  {topSites.map((s) => (
                    <tr key={s.site} className="border-b border-[#f1f5fb] hover:bg-[#f9fbfe] transition">
                      <td className="px-2 py-2.5 font-medium text-slate-800 tabular-nums">{s.site}</td>
                      <td className="px-2 py-2.5 text-slate-500">{s.region}</td>
                      <td className="px-2 py-2.5 text-slate-700 tabular-nums">{s.count}</td>
                      <td className="px-2 py-2.5 text-rose-600 font-semibold tabular-nums">{s.critical}</td>
                      <td className="px-2 py-2.5 text-slate-700 tabular-nums">{s.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
            <div className={`${CARD} px-5 py-4`}>
              <span className="text-[14px] font-semibold text-slate-900">Alarm Distribution</span>
              <div className="flex items-center gap-5 mt-3">
                <Donut counts={counts} />
                <div className="space-y-2 flex-1">
                  {SEVERITY_ORDER.map((s) => {
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    const pct = Math.round((counts[s] / total) * 100);
                    return (
                      <div key={s} className="flex items-center gap-2 text-[12px]">
                        <span className={`h-2 w-2 rounded-full ${SEV_STYLES[s].dot}`} />
                        <span className="font-medium text-slate-600 w-16">{s}</span>
                        <span className="font-semibold text-slate-800 ml-auto tabular-nums">{counts[s]} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Global Actions — floating action bar */}
          <div className={`${CARD} px-4 py-3 flex flex-wrap items-center gap-2 sticky bottom-3`}>
            <span className="text-[12px] font-medium text-slate-600 mr-2">
              Selected: <span className="font-semibold text-slate-900 tabular-nums">{checked.size}</span>
            </span>
            <button className="h-9 px-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(16,185,129,0.25)] transition flex items-center gap-1.5">
              <CheckCircle2 size={13} strokeWidth={1.75} /> Acknowledge Selected
            </button>
            <button className="h-9 px-3.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(37,99,235,0.25)] transition flex items-center gap-1.5">
              <Ticket size={13} strokeWidth={1.75} /> Create Ticket
            </button>
            <button className="h-9 px-3.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(249,115,22,0.25)] transition flex items-center gap-1.5">
              <TrendingUp size={13} strokeWidth={1.75} /> Escalate
            </button>
            {aiOn && (
              <button className="h-9 px-3.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-700 hover:to-violet-600 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(99,102,241,0.3)] transition flex items-center gap-1.5">
                <Sparkles size={13} strokeWidth={1.75} /> Launch RCA
              </button>
            )}
            <button className="h-9 px-3.5 rounded-full border border-[#e8edf5] bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5">
              <Download size={13} strokeWidth={1.75} /> Export Selected
            </button>
          </div>
        </section>

        {/* RIGHT — Details + AI */}
        <aside className="col-span-3 space-y-4">
          {selected && (
            <div className={`${CARD} px-5 py-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-900 truncate">{selected.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{selected.id}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEV_STYLES[selected.severity].chip}`}>{selected.severity}</span>
                  <button className="text-slate-300 hover:text-slate-500 transition"><X size={14} strokeWidth={1.75} /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
                <Field label="Site" value={selected.site} />
                <Field label="Start Time" value={selected.startTime} />
                <Field label="Cell" value={selected.cell} />
                <Field label="Duration" value={selected.duration} />
                <Field label="Vendor" value={selected.vendor} />
                <Field label="Status">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLES[selected.status]}`}>{selected.status}</span>
                </Field>
                <Field label="Technology" value={selected.tech} />
                <Field label="Last Occurrence" value={selected.lastOccurrence} />
                <Field label="Probable Cause" value={selected.probableCause} />
                <Field label="Impacted Users" value={selected.impactedUsers.toLocaleString()} />
                <div className="col-span-2"><Field label="Specific Problem" value={selected.specificProblem} /></div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#eef2f8]">
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-2">Impacted KPIs</div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.kpis.map((k) => <span key={k} className="rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100 px-2 py-0.5 text-[10px] font-semibold">{k}</span>)}
                  <span className="rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100 px-2 py-0.5 text-[10px] font-semibold">THROUGHPUT</span>
                  <span className="rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100 px-2 py-0.5 text-[10px] font-semibold">ACCESSIBILITY</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#eef2f8]">
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-3">Timeline</div>
                <ol className="space-y-3 border-l border-[#eef2f8] pl-4 ml-1">
                  {[
                    { time: selected.startTime, label: "Alarm Raised", color: "bg-rose-500" },
                    { time: "10:22:45", label: "KPI Degradation Detected", color: "bg-orange-500" },
                    { time: "10:22:20", label: "Neighbor Impacted (3)", color: "bg-amber-400" },
                    ...(aiOn ? [{ time: "10:23:20", label: "RCA Triggered", color: "bg-indigo-500" }] : []),
                    { time: "—", label: "Ticket Not Created", color: "bg-slate-300" },
                  ].map((t, i) => (
                    <li key={i} className="relative flex items-start gap-3 text-[12px]">
                      <span className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${t.color} ring-4 ring-white`} />
                      <span className="font-mono text-slate-400 w-16 tabular-nums">{t.time}</span>
                      <span className="text-slate-700 font-medium">{t.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* AI panel */}
          {aiOn ? (
            <div
              className="rounded-2xl border border-indigo-100 p-5 shadow-[0_2px_8px_rgba(99,102,241,0.06)] backdrop-blur-sm relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, rgba(238,242,255,0.85) 0%, rgba(255,255,255,0.95) 50%, rgba(245,243,255,0.85) 100%)",
              }}
            >
              {/* subtle decorative glow */}
              <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-violet-200/30 blur-3xl pointer-events-none" />

              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-[0_2px_6px_rgba(99,102,241,0.4)]">
                    <Sparkles className="text-white" size={13} strokeWidth={2} />
                  </div>
                  <span className="text-[14px] font-semibold text-slate-900">AI Insights</span>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100">
                  {selected?.aiScore || 87}% Correlation
                </span>
              </div>

              <div className="relative space-y-4 text-[12px]">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1.5">Suspected Root Cause</div>
                  <div className="rounded-xl bg-white/80 border border-[#eef2f8] px-3 py-2.5 text-slate-700 font-medium leading-relaxed">
                    High VSWR due to faulty feeder connection
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1.5">Correlated Alarms (2)</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-100 px-2.5 py-0.5 font-semibold text-[11px]">High Noise Floor</span>
                    <span className="rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-100 px-2.5 py-0.5 font-semibold text-[11px]">External Interference</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1.5">Related KPI Degradation</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100 px-2.5 py-0.5 font-semibold text-[11px]">SINR ↓ 6.2 dB</span>
                    <span className="rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100 px-2.5 py-0.5 font-semibold text-[11px]">Throughput ↓ 45%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1">Recent Changes</div>
                    <div className="text-slate-700 font-medium">Antenna Tilt at 09:45</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1">Neighbor Impact</div>
                    <div className="text-slate-700 font-medium">3 cells impacted</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400 mb-1.5">Recommended Action</div>
                  <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 px-3 py-2.5 text-indigo-900 font-medium leading-relaxed">
                    Inspect feeder connection and antenna system
                  </div>
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.06em] mb-1.5">
                    <span className="text-slate-400">Confidence</span>
                    <span className="text-emerald-600">High (81%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: "81%" }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#e8edf5] bg-white px-6 py-8 text-center">
              <div className="mx-auto h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
                <Sparkles className="text-slate-400" size={18} strokeWidth={1.75} />
              </div>
              <div className="text-[13px] font-semibold text-slate-700">AI Assistance is disabled</div>
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
    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 mb-2">{title}</div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const CheckRow: React.FC<{ label: string; count: number; checked: boolean; onToggle: () => void; accent?: string }> = ({ label, count, checked, onToggle, accent }) => (
  <label className="flex items-center gap-2 cursor-pointer text-[12px] py-0.5 group">
    <input type="checkbox" checked={checked} onChange={onToggle} className="h-3.5 w-3.5 rounded accent-blue-600" />
    {accent && <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />}
    <span className="text-slate-600 group-hover:text-slate-900 transition flex-1">{label}</span>
    <span className="text-slate-400 font-medium tabular-nums">{count}</span>
  </label>
);

const Field: React.FC<{ label: string; value?: string; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div>
    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</div>
    <div className="text-[12px] font-semibold text-slate-800 mt-1">{children || value}</div>
  </div>
);

// Tiny inline sparkline for KPI cards.
const Sparkline: React.FC<{ color: string }> = ({ color }) => {
  const palette: Record<string, string> = {
    rose: "#f43f5e",
    orange: "#f97316",
    amber: "#f59e0b",
    blue: "#3b82f6",
    emerald: "#10b981",
    indigo: "#6366f1",
    slate: "#94a3b8",
  };
  const stroke = palette[color] || palette.slate;
  // deterministic-ish path
  const seed = stroke.charCodeAt(1);
  const pts = Array.from({ length: 12 }).map((_, i) => {
    const x = (i / 11) * 56;
    const y = 16 - (Math.sin(i * 0.9 + seed) * 6 + 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" className="opacity-80">
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts.join(" ")} />
    </svg>
  );
};

const Donut: React.FC<{ counts: Record<Severity, number> }> = ({ counts }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors: Record<Severity, string> = { Critical: "#f43f5e", Major: "#f97316", Minor: "#fbbf24", Warning: "#3b82f6", Cleared: "#10b981" };
  let acc = 0;
  const r = 32, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 90 90" width="100" height="100">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
      {SEVERITY_ORDER.map((s) => {
        const v = counts[s] / total;
        const dash = v * c;
        const off = -acc * c;
        acc += v;
        return (
          <circle
            key={s}
            cx="45" cy="45" r={r}
            fill="none"
            stroke={colors[s]}
            strokeWidth="12"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={off}
            transform="rotate(-90 45 45)"
            strokeLinecap="round"
          />
        );
      })}
      <text x="45" y="42" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 8, fontWeight: 500 }}>TOTAL</text>
      <text x="45" y="54" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 13, fontWeight: 700 }}>{total}</text>
    </svg>
  );
};

const SitesMiniMap: React.FC<{ sites: { site: string; region: string; count: number; critical: number; score: number }[] }> = ({ sites }) => {
  // Deterministic pseudo-positions per site name within a stylized France map box.
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  const W = 560, H = 240;
  return (
    <div className="relative rounded-xl overflow-hidden border border-[#e7edf5] bg-gradient-to-br from-[#f6f9fd] to-[#eef3fa]" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block">
        {/* grid */}
        <defs>
          <pattern id="grid-amap" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#e3eaf5" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid-amap)" />
        {/* stylized country blob */}
        <path
          d="M120,40 C200,20 360,28 460,70 C500,110 470,170 410,200 C320,225 200,220 140,180 C90,150 80,80 120,40 Z"
          fill="#ffffff" stroke="#dbe4f1" strokeWidth="1.2"
        />
        {sites.map((s) => {
          const h = hash(s.site);
          const x = 130 + (h % 320);
          const y = 55 + ((h >> 8) % 140);
          const color = s.critical >= 4 ? "#f43f5e" : s.critical >= 2 ? "#f97316" : "#fbbf24";
          const r = 6 + Math.min(8, s.score);
          return (
            <g key={s.site}>
              <circle cx={x} cy={y} r={r + 6} fill={color} opacity={0.18}>
                <animate attributeName="r" values={`${r + 6};${r + 12};${r + 6}`} dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.18;0.05;0.18" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth="1.6" />
              <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{s.critical}</text>
              <text x={x} y={y + r + 11} textAnchor="middle" fontSize="9" fontWeight="600" fill="#475569">{s.site}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-white/90 backdrop-blur px-2.5 py-1.5 ring-1 ring-[#e7edf5] text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Critical ≥4</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> ≥2</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Low</span>
      </div>
      <div className="absolute top-2 right-2 rounded-md bg-white/90 backdrop-blur px-2 py-1 ring-1 ring-[#e7edf5] text-[10px] font-semibold text-slate-700">
        {sites.length} impacted sites
      </div>
    </div>
  );
};

export default AlarmCenterPage;

