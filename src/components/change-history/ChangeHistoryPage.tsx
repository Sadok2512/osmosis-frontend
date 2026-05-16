import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search,
  Calendar,
  RefreshCw,
  Download,
  Filter as FilterIcon,
  Columns3,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  RotateCcw,
  Clock3,
  CircleDot,
  History,
  GitCompare,
  TrendingUp,
  MapPin,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { getStoredSession } from "@/services/adminAuth";

/* ------------------------------------------------------------------ */
/* Design tokens — aligned with Network Explorer / Parameter Hub      */
/* ------------------------------------------------------------------ */
const PAGE_BG = "bg-[#f6f8fb]";
const CARD =
  "bg-white rounded-2xl border border-[#e7edf5] shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]";
const SUBTLE_BORDER = "border-[#eef2f8]";

/* Severity palette */
const sevDot: Record<string, string> = {
  Low: "bg-emerald-500",
  Medium: "bg-amber-500",
  High: "bg-orange-500",
  Critical: "bg-rose-500",
};
const sevText: Record<string, string> = {
  Low: "text-emerald-600",
  Medium: "text-amber-600",
  High: "text-orange-600",
  Critical: "text-rose-600",
};
const sevPill: Record<string, string> = {
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Medium: "bg-amber-50 text-amber-700 ring-amber-100",
  High: "bg-orange-50 text-orange-700 ring-orange-100",
  Critical: "bg-rose-50 text-rose-700 ring-rose-100",
};
const statusPill: Record<string, string> = {
  Passed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Failed: "bg-rose-50 text-rose-700 ring-rose-100",
  Pending: "bg-amber-50 text-amber-700 ring-amber-100",
};

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */
type Sev = "Low" | "Medium" | "High" | "Critical";
type ValStatus = "Passed" | "Failed" | "Pending";
type Row = {
  id: string;
  ts: string;
  network: string;
  dr: string;
  plaque: string;
  site: string;
  cell: string;
  vendor: string;
  tech: string;
  param: string;
  oldVal: string;
  newVal: string;
  delta: string;
  changedBy: string;
  type: string;
  risk: Sev;
  status: ValStatus;
};

const KPIS = [
  { label: "Total Changes", value: "12,842", trend: "+18% vs last 7 days", trendColor: "text-emerald-600", icon: Activity, accent: "from-blue-500/10 to-indigo-500/10" },
  { label: "Changes Today", value: "1,248", trend: "+15% vs yesterday", trendColor: "text-emerald-600", icon: TrendingUp, accent: "from-sky-500/10 to-cyan-500/10" },
  
  { label: "Impacted Sites", value: "532", trend: "+8% vs yesterday", trendColor: "text-emerald-600", icon: CircleDot, accent: "from-amber-500/10 to-yellow-500/10" },
  { label: "Impacted Cells", value: "2,654", trend: "+9% vs yesterday", trendColor: "text-emerald-600", icon: LayoutGrid, accent: "from-violet-500/10 to-fuchsia-500/10" },
];

const ROWS: Row[] = [
  { id: "CHG-20260512-107685", ts: "12/05/2026 21:04:15", network: "RAN LTE", dr: "DR Nord", plaque: "REIMS", site: "SITE_008", cell: "CELL_LTE_01", vendor: "Ericsson", tech: "4G LTE", param: "electricalTilt", oldVal: "2.0°", newVal: "3.5°", delta: "+1.5°", changedBy: "SON", type: "Update", risk: "High", status: "Failed" },
  { id: "CHG-20260512-107684", ts: "11/05/2026 16:40:22", network: "RAN LTE", dr: "DR Paris Sud", plaque: "Nantes", site: "SITE_221", cell: "CELL_LTE_07", vendor: "Nokia", tech: "4G LTE", param: "pMax", oldVal: "460", newVal: "477", delta: "+17", changedBy: "OPTIMUS_AI", type: "Update", risk: "High", status: "Failed" },
  { id: "CHG-20260512-107683", ts: "11/05/2026 16:18:05", network: "RAN LTE", dr: "DR Ouest", plaque: "Nantes", site: "SITE_221", cell: "CELL_LTE_07", vendor: "Nokia", tech: "4G LTE", param: "qRxLevMin", oldVal: "−112", newVal: "−108", delta: "+4", changedBy: "NOC User", type: "Update", risk: "Medium", status: "Passed" },
  { id: "CHG-20260512-107682", ts: "11/05/2026 12:05:11", network: "RAN 5G", dr: "DR Sud", plaque: "Marseille", site: "SITE_338", cell: "NR_CELL_02", vendor: "Ericsson", tech: "5G NR", param: "txPower", oldVal: "30", newVal: "34", delta: "+4", changedBy: "SON", type: "Update", risk: "Medium", status: "Passed" },
  { id: "CHG-20260512-107681", ts: "10/05/2026 09:33:11", network: "RAN LTE", dr: "DR Nord", plaque: "Lille", site: "SITE_120", cell: "CELL_LTE_03", vendor: "Huawei", tech: "4G LTE", param: "pci", oldVal: "43", newVal: "46", delta: "+3", changedBy: "OPTIMUS_AI", type: "Update", risk: "High", status: "Failed" },
  { id: "CHG-20260512-107680", ts: "10/05/2026 22:19:43", network: "RAN LTE", dr: "DR Paris", plaque: "Paris North", site: "SITE_091", cell: "CELL_LTE_05", vendor: "Ericsson", tech: "4G LTE", param: "ssbPower", oldVal: "26", newVal: "28", delta: "+2", changedBy: "NOC User", type: "Update", risk: "Low", status: "Passed" },
  { id: "CHG-20260512-107679", ts: "10/05/2026 14:25:08", network: "RAN 5G", dr: "DR Ouest", plaque: "Rennes", site: "SITE_177", cell: "NR_CELL_01", vendor: "Nokia", tech: "5G NR", param: "handoverMargin", oldVal: "6", newVal: "8", delta: "+2", changedBy: "SON", type: "Update", risk: "Medium", status: "Passed" },
];

const FILTERS: { label: string; opts: string[] }[] = [
  { label: "Network", opts: ["All Networks", "NR", "LTE", "UMTS", "GSM"] },
  { label: "Region", opts: ["All Regions", "Île-de-France", "PACA", "Hauts-de-France", "Bretagne", "Occitanie"] },
  { label: "Vendor", opts: ["All Vendors", "Ericsson", "Nokia", "Huawei", "Samsung"] },
  { label: "Plaque", opts: ["All Plaques", "Reims", "Lille", "Paris", "Nantes", "Marseille", "Rennes"] },
  { label: "Site", opts: ["All Sites"] },
  { label: "Cells", opts: ["All Cells"] },
  { label: "Band", opts: ["All Bands", "GSM900", "GSM1800", "U900", "U2100", "L700", "L800", "L1800", "L2100", "L2600", "N700", "N2100", "N3500"] },
  { label: "MO", opts: ["All MO", "EUtranCellFDD", "EUtranCellTDD", "NRCellDU", "NRCellCU", "UtranCell", "GsmCell"] },
];

/* Deterministic sparkline generator for KPI cards */
const Sparkline: React.FC<{ seed: number; color: string }> = ({ seed, color }) => {
  const points = useMemo(() => {
    const arr: number[] = [];
    let v = 50;
    for (let i = 0; i < 22; i++) {
      v += ((Math.sin(seed + i * 0.7) + Math.cos(seed * 1.3 + i)) * 6);
      arr.push(Math.max(8, Math.min(54, v)));
    }
    return arr;
  }, [seed]);
  const w = 96;
  const h = 28;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / 60) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* Activity timeline — stacked bars */
const TimelineChart: React.FC<{ rows: Row[] }> = ({ rows }) => {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const { days, series, max } = useMemo(() => {
    // Parse ts "DD/MM/YYYY HH:mm:ss" → bucket per day per risk
    const buckets = new Map<string, { low: number; medium: number; high: number; critical: number; date: Date }>();
    rows.forEach((r) => {
      const [d] = r.ts.split(" ");
      const [dd, mm, yyyy] = d.split("/").map(Number);
      const key = `${yyyy}-${mm}-${dd}`;
      if (!buckets.has(key)) {
        buckets.set(key, { low: 0, medium: 0, high: 0, critical: 0, date: new Date(yyyy, mm - 1, dd) });
      }
      const b = buckets.get(key)!;
      const k = r.risk.toLowerCase() as "low" | "medium" | "high" | "critical";
      b[k] += 1;
    });
    // Build a continuous date range from min → max date
    const sorted = Array.from(buckets.values()).sort((a, b) => +a.date - +b.date);
    if (sorted.length === 0) return { days: [], series: [], max: 1 };
    const start = sorted[0].date;
    const end = sorted[sorted.length - 1].date;
    const days: string[] = [];
    const series: { low: number; medium: number; high: number; critical: number; total: number }[] = [];
    for (let t = +start; t <= +end; t += 86400000) {
      const dt = new Date(t);
      const key = `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
      const b = buckets.get(key) || { low: 0, medium: 0, high: 0, critical: 0 };
      days.push(`${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]}`);
      const total = b.low + b.medium + b.high + b.critical;
      series.push({ low: b.low, medium: b.medium, high: b.high, critical: b.critical, total });
    }
    const max = Math.max(1, ...series.map((s) => s.total));
    return { days, series, max };
  }, [rows]);

  return (
    <div className="px-2 pt-2">
      <div className="flex items-end gap-3 h-[180px]">
        {series.map((s, i) => {
          const scale = (v: number) => `${(v / max) * 100}%`;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group" title={`${days[i]} — ${s.total} change${s.total !== 1 ? "s" : ""}`}>
              <span className="text-[10px] font-semibold text-slate-600 tabular-nums">{s.total || ""}</span>
              <div className="w-full flex flex-col-reverse rounded-md overflow-hidden flex-1 bg-[#f6f8fb] ring-1 ring-[#eef2f8] transition-all group-hover:ring-blue-200">
                <div style={{ height: scale(s.low) }} className="bg-emerald-400/80" />
                <div style={{ height: scale(s.medium) }} className="bg-amber-400/80" />
                <div style={{ height: scale(s.high) }} className="bg-orange-500/80" />
                <div style={{ height: scale(s.critical) }} className="bg-rose-500/85" />
              </div>
              <span className="text-[10px] font-medium text-slate-500 tracking-tight">{days[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* Tiny line chart for parameter history detail panel */
const ParamLineChart: React.FC = () => {
  const w = 360, h = 130;
  const tilt = [2, 2, 2, 2.1, 2, 2, 2, 2, 2, 2, 2, 3.5, 3.5];
  const xs = (i: number) => (i / (tilt.length - 1)) * (w - 24) + 12;
  const ys1 = (v: number) => h - 16 - ((v - 1.5) / 3) * (h - 32);
  const path1 = tilt.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys1(v).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={12} x2={w - 12} y1={p * h} y2={p * h} stroke="#eef2f8" strokeWidth={1} />
      ))}
      <line x1={xs(11)} x2={xs(11)} y1={6} y2={h - 16} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />
      <text x={xs(11) + 4} y={14} className="fill-slate-500" fontSize="9">Change 21:04</text>
      <path d={path1} stroke="#2563eb" strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const riskColor: Record<Sev, string> = {
  Low: "#10b981",
  Medium: "#f59e0b",
  High: "#f97316",
  Critical: "#f43f5e",
};
const ChangeMap: React.FC<{ rows: Row[]; fullscreen: boolean }> = ({ rows, fullscreen }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.6, 2.5],
      zoom: 6,
      scrollWheelZoom: false,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) map.scrollWheelZoom.enable();
      else map.scrollWheelZoom.disable();
    };
    containerRef.current.addEventListener("wheel", onWheel);
    return () => {
      containerRef.current?.removeEventListener("wheel", onWheel);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const lg = layerRef.current;
    lg.clearLayers();
    // Bounding box ≈ France
    const minLat = 43.2, maxLat = 50.8, minLng = -4.5, maxLng = 7.5;
    const latlngs: L.LatLngExpression[] = [];
    rows.forEach((r) => {
      const h1 = hash(r.site);
      const h2 = hash(r.site + "_" + r.cell);
      const lat = minLat + ((h1 % 1000) / 1000) * (maxLat - minLat);
      const lng = minLng + ((h2 % 1000) / 1000) * (maxLng - minLng);
      const color = riskColor[r.risk];
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)"></div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:1px 5px;font-size:9px;font-weight:600;color:#334155;white-space:nowrap">${r.site}</div>
        </div>`,
        iconSize: [60, 30],
        iconAnchor: [30, 9],
      });
      L.marker([lat, lng], { icon })
        .bindTooltip(`<b>${r.site}</b> · ${r.cell}<br/>${r.param}: ${r.oldVal} → ${r.newVal}<br/>By ${r.changedBy} · ${r.risk}`, { direction: "top" })
        .addTo(lg);
      latlngs.push([lat, lng]);
    });
    if (latlngs.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 7 });
    }
  }, [rows]);

  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [fullscreen]);

  return (
    <div className={fullscreen ? "flex-1 min-h-0 relative" : "relative"}>
      <div ref={containerRef} className={`w-full ${fullscreen ? "h-full" : "h-[360px]"} rounded-xl overflow-hidden border border-[#eef2f8]`} />
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur rounded-full px-3 py-1.5 ring-1 ring-[#e7edf5] shadow-sm flex items-center gap-3 text-[11px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Critical</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" />High</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Medium</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Low</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
const ChangeHistoryPage: React.FC = () => {
  const [selected, setSelected] = useState<string>(ROWS[0].id);
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set([ROWS[0].id]));
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [paramFullscreen, setParamFullscreen] = useState(false);
  const [chartTab, setChartTab] = useState<"timeline" | "param" | "map">("map");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paramRange, setParamRange] = useState<"24H" | "7D" | "14D" | "30D">("7D");
  const currentUser = getStoredSession();
  const username = currentUser?.username || "Guest";
  const initials = username.slice(0, 2).toUpperCase();

  const toggleRow = (id: string) => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const detail = ROWS.find((r) => r.id === selected) || ROWS[0];

  return (
    <div className={`${PAGE_BG} min-h-full font-[Inter,'SF_Pro_Display',ui-sans-serif,system-ui] text-slate-800 antialiased`}>
      <div className="px-6 lg:px-8 py-6 space-y-5">
        {/* ----- Header ----- */}
        <header className={`${CARD} px-6 py-5 space-y-4`}>
          <div>
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900 leading-tight">
              Change History
            </h1>
            <p className="text-[13px] font-medium text-slate-500 mt-1">
              Track network parameter modifications and configuration evolution.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by site, cell, parameter, user…"
                className="h-10 w-full pl-10 pr-3 rounded-full border border-[#e7edf5] bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
              />
            </div>
            <button className="h-10 inline-flex items-center gap-2 px-4 rounded-full border border-[#e7edf5] bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition">
              <Calendar className="w-4 h-4 text-slate-500" />
              06/12/2026 00:00 – 12/05/2026 23:59
            </button>
            <button className="h-10 inline-flex items-center gap-2 px-4 rounded-full border border-[#e7edf5] bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition">
              <RefreshCw className="w-4 h-4 text-slate-500" /> Refresh
            </button>
            <button
              onClick={() => setChartTab("map")}
              className="h-10 inline-flex items-center gap-2 px-4 rounded-full text-[13px] font-medium transition ring-1 bg-white text-blue-600 ring-blue-200 hover:bg-blue-50"
            >
              <MapPin className="w-4 h-4" /> Map View
            </button>
            <button className="h-10 inline-flex items-center gap-2 px-4 rounded-full border border-[#e7edf5] bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition">
              <Download className="w-4 h-4 text-slate-500" /> Export
            </button>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 px-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
            <div className="flex items-center gap-2 pl-1">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shadow-sm">
                {initials}
              </div>
              <span className="text-[13px] font-medium text-slate-700">{username}</span>
            </div>
          </div>
        </header>

        {/* ----- KPI strip ----- */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KPIS.map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className={`${CARD} px-3 py-3 flex flex-col items-center text-center`}>
                <div className="flex items-center justify-center gap-2 w-full">
                  <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${k.accent} ring-1 ring-[#eef2f8] flex items-center justify-center`}>
                    <Icon className="w-3.5 h-3.5 text-slate-700" />
                  </div>
                  <Sparkline seed={i + 1} color={k.trendColor.includes("rose") ? "#f43f5e" : k.trendColor.includes("amber") ? "#f59e0b" : "#10b981"} />
                </div>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
                <div className="mt-0.5 text-[20px] font-bold tracking-tight text-slate-900 tabular-nums leading-none">{k.value}</div>
                <div className={`mt-1 text-[10px] font-medium ${k.trendColor}`}>{k.trend}</div>
              </div>
            );
          })}
        </section>

        {/* ----- Body grid ----- */}
        <section className="grid grid-cols-12 gap-4">
          {/* Filters — compact left rail */}
          <aside className={`${CARD} col-span-12 lg:col-span-2 px-4 py-4 self-start`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-slate-800">Filters</h3>
              <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700">Reset</button>
            </div>
            <div className="space-y-2.5">
              {FILTERS.map((f) => (
                <div key={f.label}>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">{f.label}</label>
                  <select className="w-full h-8 rounded-lg border border-[#e7edf5] bg-white text-[12px] text-slate-700 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition">
                    {f.opts.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="pt-1 flex gap-2">
                <button className="flex-1 h-8 rounded-full text-[12px] font-medium text-white bg-gradient-to-r from-[#2563eb] to-[#3b82f6] hover:from-[#1d4ed8] hover:to-[#2563eb] shadow-sm hover:shadow transition">
                  Apply Filters
                </button>
              </div>
            </div>
          </aside>

          {/* Center — main chart (tabbed) + table, full available width */}
          <div className="col-span-12 lg:col-span-10 space-y-4 min-w-0">
            {/* Main tabbed chart */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#eef2f8]">
                <div className="inline-flex rounded-full bg-[#f6f8fb] ring-1 ring-[#eef2f8] p-1 text-[12px] font-medium">
                  {[
                    { id: "timeline" as const, label: "Change Timeline", icon: TrendingUp },
                    { id: "param" as const, label: `Parameter History (${detail.param})`, icon: History },
                    { id: "map" as const, label: "Map", icon: MapPin },
                  ].map((t) => {
                    const Ic = t.icon;
                    const active = chartTab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setChartTab(t.id)}
                        className={`px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 transition ${
                          active ? "bg-white text-blue-600 shadow-sm ring-1 ring-[#e7edf5]" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Ic className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                  {chartTab === "timeline" && (
                    <>
                      {(["Low", "Medium", "High", "Critical"] as Sev[]).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-sm ${sevDot[s]}`} />
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                  {chartTab === "param" && (
                    <div className="inline-flex rounded-full bg-[#f6f8fb] ring-1 ring-[#eef2f8] p-0.5 text-[11px] font-medium">
                      {(["24H", "7D", "14D", "30D"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setParamRange(p)}
                          className={`px-2.5 py-1 rounded-full transition ${paramRange === p ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => (chartTab === "map" ? setMapFullscreen((v) => !v) : setParamFullscreen((v) => !v))}
                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full border border-[#e7edf5] bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Maximize2 className="w-3 h-3" /> Fullscreen
                  </button>
                </div>
              </div>

              {/* Mini KPIs contextual to chart */}
              {chartTab === "timeline" && (
                <div className="px-5 py-2.5 grid gap-3 border-b border-[#eef2f8]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Total Changes</div><div className="text-[15px] font-bold text-slate-900 tabular-nums">{ROWS.length.toLocaleString()}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Peak Activity</div><div className="text-[15px] font-bold text-slate-900 tabular-nums">11/05 — 3 chg</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Most Impacted Site</div><div className="text-[15px] font-bold text-slate-900">SITE_221</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Critical Risk</div><div className="text-[15px] font-bold text-rose-600 tabular-nums">{ROWS.filter(r => r.risk === "Critical" || r.risk === "High").length}</div></div>
                </div>
              )}
              {chartTab === "param" && (
                <div className="px-5 py-2.5 grid gap-3 border-b border-[#eef2f8]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Old Value</div><div className="text-[15px] font-bold text-slate-700 tabular-nums">{detail.oldVal}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">New Value</div><div className="text-[15px] font-bold text-rose-600 tabular-nums">{detail.newVal}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Delta</div><div className="text-[15px] font-bold text-blue-600 tabular-nums">{detail.delta}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Changed By</div><div className="text-[15px] font-bold text-slate-900">{detail.changedBy}</div></div>
                </div>
              )}

              <div className="px-3 sm:px-5 pt-2 pb-4">
                {chartTab === "timeline" && (
                  <div className="min-h-[320px]">
                    <TimelineChart rows={ROWS} />
                  </div>
                )}
                {chartTab === "param" && (
                  <div className="min-h-[320px] flex items-center justify-center">
                    <div className="w-full max-w-[1100px]">
                      <ParamLineChart />
                    </div>
                  </div>
                )}
                {chartTab === "map" && (
                  <div className="min-h-[420px]">
                    <ChangeMap rows={ROWS} fullscreen={false} />
                  </div>
                )}
              </div>
            </div>

            {/* Table — full width */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#eef2f8]">
                <div className="flex items-center gap-3">
                  <h3 className="text-[16px] font-semibold text-slate-800">Changes</h3>
                  <span className="text-[12px] text-slate-500">({ROWS.length.toLocaleString()})</span>
                  <span className="text-[11px] text-slate-400 hidden md:inline">— click a row for full details</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#e7edf5] bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                    Bulk Actions
                  </button>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input className="h-8 pl-8 pr-3 rounded-full border border-[#e7edf5] bg-white text-[12px] text-slate-700 placeholder:text-slate-400 w-[220px]" placeholder="Search in table" />
                  </div>
                  <button className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#e7edf5] bg-white text-slate-500 hover:bg-slate-50"><FilterIcon className="w-3.5 h-3.5" /></button>
                  <button className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#e7edf5] bg-white text-slate-500 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /></button>
                  <button className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#e7edf5] bg-white text-slate-500 hover:bg-slate-50"><Columns3 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-[1] bg-[#fafbfd]">
                    <tr className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      {["", "Date / Time", "Network", "DR", "Plaque", "Site", "Cell", "Vendor", "Tech", "Parameter", "Old", "New", "Δ", "Changed By", "Type", "Risk", "Validation"].map((h, i) => (
                        <th key={i} className="text-left font-medium px-3 py-2.5 whitespace-nowrap border-b border-[#eef2f8]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => {
                      const isSel = selected === r.id;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => { setSelected(r.id); setDetailsOpen(true); }}
                          className={`cursor-pointer border-b border-[#f1f5fb] transition-colors ${isSel ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={checkedRows.has(r.id)}
                              onChange={(e) => { e.stopPropagation(); toggleRow(r.id); }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 tabular-nums whitespace-nowrap">{r.ts}</td>
                          <td className="px-3 py-2.5"><span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-100">{r.network}</span></td>
                          <td className="px-3 py-2.5 text-slate-600">{r.dr}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.plaque}</td>
                          <td className="px-3 py-2.5 text-slate-700 font-medium">{r.site}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.cell}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.vendor}</td>
                          <td className="px-3 py-2.5"><span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset bg-sky-50 text-sky-700 ring-sky-100">{r.tech}</span></td>
                          <td className="px-3 py-2.5 text-slate-700 font-medium">{r.param}</td>
                          <td className="px-3 py-2.5 text-slate-500 tabular-nums">{r.oldVal}</td>
                          <td className="px-3 py-2.5 text-slate-700 tabular-nums font-medium">{r.newVal}</td>
                          <td className="px-3 py-2.5 tabular-nums font-medium text-blue-600">{r.delta}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.changedBy}</td>
                          <td className="px-3 py-2.5 text-slate-600">{r.type}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${sevPill[r.risk]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sevDot[r.risk]}`} />{r.risk}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${statusPill[r.status]}`}>{r.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 flex items-center justify-between text-[12px] text-slate-500 border-t border-[#eef2f8]">
                <span>Showing 1 to 7 of 12,842 entries</span>
                <div className="flex items-center gap-1">
                  <button className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button key={p} className={`h-7 min-w-[28px] px-2 rounded-md text-[12px] font-medium ${p === 1 ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{p}</button>
                  ))}
                  <span className="px-1 text-slate-400">…</span>
                  <button className="h-7 px-2 rounded-md text-[12px] font-medium text-slate-600 hover:bg-slate-100">1835</button>
                  <button className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100"><ChevronRight className="w-3.5 h-3.5" /></button>
                </div>
                <select className="h-7 rounded-md border border-[#e7edf5] bg-white text-[12px] text-slate-600 px-2">
                  <option>50 per page</option>
                  <option>100 per page</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ----- Change Details — slide-over drawer ----- */}
        {detailsOpen && (
          <>
            <div
              className="fixed inset-0 z-[999] bg-slate-900/30 backdrop-blur-sm transition-opacity animate-in fade-in"
              onClick={() => setDetailsOpen(false)}
            />
            <aside
              className="fixed top-0 right-0 z-[1000] h-full w-full sm:w-[440px] bg-white shadow-2xl border-l border-[#e7edf5] flex flex-col animate-in slide-in-from-right duration-200"
            >
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#eef2f8]">
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[15px] font-semibold text-slate-900">Change Details</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${sevPill[detail.risk]}`}>{detail.risk}</span>
                </div>
                <button
                  onClick={() => setDetailsOpen(false)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#e7edf5] bg-white text-slate-500 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-100 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-blue-700">Parameter</div>
                  <div className="mt-0.5 text-[16px] font-bold text-slate-900">{detail.param}</div>
                  <div className="mt-2 flex items-center gap-2 text-[13px] tabular-nums">
                    <span className="px-2 py-0.5 rounded-md bg-white ring-1 ring-slate-200 text-slate-600">{detail.oldVal}</span>
                    <span className="text-slate-400">→</span>
                    <span className="px-2 py-0.5 rounded-md bg-white ring-1 ring-rose-200 text-rose-700 font-semibold">{detail.newVal}</span>
                    <span className="ml-auto text-blue-600 font-semibold">{detail.delta}</span>
                  </div>
                </div>
                <dl className="space-y-1 text-[12px]">
                  {[
                    ["Change ID", detail.id],
                    ["Parameter Family", "RF"],
                    ["Site / Cell", `${detail.site} / ${detail.cell}`],
                    ["Vendor / Tech", `${detail.vendor} / ${detail.tech}`],
                    ["Changed By", detail.changedBy],
                    ["Source System", "SON Engine"],
                    ["Timestamp", detail.ts],
                    ["Risk Level", detail.risk],
                    ["Validation Status", detail.status],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-2 border-b border-[#f1f5fb] last:border-0">
                      <dt className="text-[11px] font-medium text-slate-500">{k}</dt>
                      <dd className={`text-[12px] font-medium tabular-nums text-right ${k === "Risk Level" ? sevText[detail.risk] : k === "Validation Status" ? (detail.status === "Failed" ? "text-rose-600" : "text-emerald-600") : "text-slate-700"}`}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  onClick={() => { setChartTab("param"); setDetailsOpen(false); }}
                  className="w-full h-9 rounded-full text-[12px] font-medium text-white bg-gradient-to-r from-[#2563eb] to-[#3b82f6] hover:from-[#1d4ed8] hover:to-[#2563eb] shadow-sm transition inline-flex items-center justify-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" /> View parameter history
                </button>
              </div>
            </aside>
          </>
        )}

        {/* Fullscreen overlays for chart tabs */}
        {paramFullscreen && (
          <div className="fixed inset-0 z-[1000] bg-white p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-semibold text-slate-900">Parameter History — {detail.param}</h3>
              <button onClick={() => setParamFullscreen(false)} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#e7edf5] bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                <Minimize2 className="w-3.5 h-3.5" /> Exit
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-[1400px]"><ParamLineChart /></div>
            </div>
          </div>
        )}
        {mapFullscreen && (
          <div className="fixed inset-0 z-[1000] bg-white p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="text-[14px] font-semibold text-slate-900">Network Change Map</span>
                <span className="text-[12px] text-slate-500">— {ROWS.length} changes</span>
              </div>
              <button onClick={() => setMapFullscreen(false)} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#e7edf5] bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                <Minimize2 className="w-3.5 h-3.5" /> Exit
              </button>
            </div>
            <ChangeMap rows={ROWS} fullscreen={true} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeHistoryPage;
