import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  DatabaseZap,
  Filter,
  GitBranch,
  Globe2,
  History,
  Layers3,
  Map,
  Network,
  Radio,
  RefreshCw,
  Router,
  Search,
  Server,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  Table2,
  TowerControl,
  Zap,
} from "lucide-react";
import { getPreferredDataSource, getVpsProxyHeaders, getVpsProxyUrl } from "@/lib/apiConfig";
import ParameterHubPage from "@/components/parameter-hub/ParameterHubPage";

type Status = "Healthy" | "Warning" | "Critical";
type Tech = "2G" | "3G" | "4G" | "5G";

type SiteRow = {
  id: string;
  project: string;
  vendor: "Ericsson" | "Nokia" | "Huawei";
  upr: string;
  dr: string;
  plaque: string;
  site: string;
  cells: number;
  technologies: Tech[];
  bands: string[];
  status: Status;
  updated: string;
  alarms: number;
  load: number;
  lat: number;
  lng: number;
};

type TreeNode = {
  id: string;
  label: string;
  type: string;
  count: string;
  accent: string;
  children?: TreeNode[];
};

const navItems = [
  { label: "Topology", icon: Network },
  { label: "Parameter Hub", icon: SlidersHorizontal },
  { label: "Neighbors", icon: GitBranch },
  { label: "Change History", icon: History },
  { label: "Architecture View", icon: Layers3 },
];

const fallbackSiteRows: SiteRow[] = [
  { id: "PAR-5G-1001", project: "5G Modernization", vendor: "Ericsson", upr: "Ile-De-France", dr: "Paris-East", plaque: "P3", site: "PAR-EST-BERCY-01", cells: 36, technologies: ["3G", "4G", "5G"], bands: ["B1", "B3", "B7", "N78"], status: "Healthy", updated: "2 min ago", alarms: 0, load: 78, lat: 48.838, lng: 2.391 },
  { id: "PAR-5G-1002", project: "5G Modernization", vendor: "Ericsson", upr: "Ile-De-France", dr: "Paris-East", plaque: "P3", site: "PAR-EST-NATION-02", cells: 42, technologies: ["2G", "4G", "5G"], bands: ["G900", "B20", "B3", "N78"], status: "Warning", updated: "4 min ago", alarms: 3, load: 91, lat: 48.848, lng: 2.398 },
  { id: "LYO-LTE-2204", project: "LTE Capacity", vendor: "Nokia", upr: "Auvergne-Rhone", dr: "Lyon-North", plaque: "L1", site: "LYO-NORD-CROIX-04", cells: 27, technologies: ["3G", "4G"], bands: ["B1", "B3", "B20"], status: "Healthy", updated: "8 min ago", alarms: 1, load: 64, lat: 45.774, lng: 4.832 },
  { id: "MAR-5G-3108", project: "Coastal Coverage", vendor: "Huawei", upr: "PACA", dr: "Marseille-West", plaque: "M2", site: "MAR-OUEST-PORT-08", cells: 31, technologies: ["2G", "3G", "4G", "5G"], bands: ["G900", "B8", "B20", "N78"], status: "Critical", updated: "12 min ago", alarms: 9, load: 97, lat: 43.299, lng: 5.352 },
  { id: "LIL-5G-1405", project: "5G Modernization", vendor: "Nokia", upr: "Hauts-De-France", dr: "Lille-Center", plaque: "H4", site: "LIL-CENTRE-GARE-05", cells: 24, technologies: ["4G", "5G"], bands: ["B3", "B7", "N78"], status: "Healthy", updated: "15 min ago", alarms: 0, load: 58, lat: 50.636, lng: 3.071 },
  { id: "TLS-LTE-4450", project: "LTE Capacity", vendor: "Ericsson", upr: "Occitanie", dr: "Toulouse-South", plaque: "T7", site: "TLS-SUD-LABEGE-50", cells: 29, technologies: ["2G", "4G"], bands: ["G900", "B3", "B20"], status: "Warning", updated: "19 min ago", alarms: 2, load: 86, lat: 43.54, lng: 1.511 },
];

const hierarchy: TreeNode = {
  id: "project-5g",
  label: "5G Modernization",
  type: "Project",
  count: "1 project",
  accent: "bg-teal-500",
  children: [
    {
      id: "vendor-ericsson",
      label: "Ericsson",
      type: "Vendor",
      count: "2,148 cells",
      accent: "bg-emerald-500",
      children: [
        {
          id: "upr-idf",
          label: "Ile-De-France",
          type: "UPR",
          count: "8 DR",
          accent: "bg-cyan-500",
          children: [
            {
              id: "dr-paris-east",
              label: "Paris-East",
              type: "DR",
              count: "12 plaques",
              accent: "bg-sky-500",
              children: [
                {
                  id: "plaque-p3",
                  label: "P3",
                  type: "Plaque",
                  count: "500 sites",
                  accent: "bg-amber-500",
                  children: [
                    { id: "sites-p3", label: "Sites", type: "Sites", count: "500", accent: "bg-lime-500", children: [{ id: "cells-p3", label: "Cells", type: "Cells", count: "12,430", accent: "bg-green-600" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const statusStyles: Record<Status, string> = {
  Healthy: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Warning: "bg-amber-50 text-amber-700 ring-amber-200",
  Critical: "bg-rose-50 text-rose-700 ring-rose-200",
};

const techStyles: Record<Tech, string> = {
  "2G": "bg-purple-100 text-purple-700 ring-purple-200",
  "3G": "bg-blue-100 text-blue-700 ring-blue-200",
  "4G": "bg-orange-100 text-orange-700 ring-orange-200",
  "5G": "bg-green-100 text-green-700 ring-green-200",
};

const vendorMark: Record<SiteRow["vendor"], string> = {
  Ericsson: "ER",
  Nokia: "NO",
  Huawei: "HW",
};

const unique = (items: string[]) => ["All", ...Array.from(new Set(items))];

const parserUrl = (path: string, params?: Record<string, string>) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams(params || {});
  const qs = search.toString();
  if (getPreferredDataSource() === "local") {
    const base = import.meta.env.VITE_LOCAL_API || "http://localhost:8000";
    return `${base}/api/v1${cleanPath}${qs ? `?${qs}` : ""}`;
  }
  return getVpsProxyUrl("parser", `/api/v1${cleanPath}`, params);
};

const parserHeaders = () => (
  getPreferredDataSource() === "local"
    ? { "Content-Type": "application/json" }
    : getVpsProxyHeaders()
);

const fetchParserJson = async <T,>(path: string, params?: Record<string, string>): Promise<T> => {
  const response = await fetch(parserUrl(path, params), { headers: parserHeaders() });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const normalizeTech = (value: unknown): Tech | null => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.includes("5G") || raw === "NR") return "5G";
  if (raw.includes("4G") || raw === "LTE") return "4G";
  if (raw.includes("3G") || raw === "UMTS" || raw === "WCDMA") return "3G";
  if (raw.includes("2G") || raw === "GSM") return "2G";
  return null;
};

const splitBackendList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry || "").split(/[,;|]/))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const deriveStatus = (row: any): Status => {
  const raw = String(row.status || row.etat || row.etat_site || "").toLowerCase();
  if (raw.includes("crit") || raw.includes("down") || raw.includes("ko")) return "Critical";
  if (raw.includes("warn") || raw.includes("degrad") || raw.includes("alarm")) return "Warning";
  const qoe = Number(row.qoe_score_avg ?? row.qoe_index);
  if (Number.isFinite(qoe) && qoe < 55) return "Critical";
  if (Number.isFinite(qoe) && qoe < 72) return "Warning";
  return "Healthy";
};

const mapBackendSite = (row: any, index: number): SiteRow => {
  const technologies = splitBackendList(row.technos ?? row.techno ?? row.rat)
    .map(normalizeTech)
    .filter(Boolean) as Tech[];
  const normalizedTechs = technologies.length ? Array.from(new Set(technologies)) : ["4G"] as Tech[];
  const vendor = String(row.vendor || row.constructeur || "Nokia").trim();
  const safeVendor = /ericsson/i.test(vendor) ? "Ericsson" : /huawei/i.test(vendor) ? "Huawei" : "Nokia";
  const siteName = String(row.site_name || row.nom_site || row.code_nidt || `SITE-${index + 1}`);
  const dor = String(row.dor || row.region || "UPR Unknown");
  const plaque = String(row.plaque || row.cluster || "Unassigned");
  const lat = Number(row.latitude ?? row.lat ?? 46 + (index % 9) * 0.4);
  const lng = Number(row.longitude ?? row.lng ?? 2 + (index % 7) * 0.35);
  const cellCount = Number(row.cell_count ?? row.nb_cells ?? row.total_cells ?? row.cells?.length ?? 0);
  const status = deriveStatus(row);

  return {
    id: String(row.site_id || row.code_nidt || siteName),
    project: "OSMOSIS Topology",
    vendor: safeVendor,
    upr: dor,
    dr: String(row.dr || row.zone_arcep || dor.replace(/^UPR\s+/i, "DR ") || "DR National"),
    plaque,
    site: siteName,
    cells: Number.isFinite(cellCount) ? cellCount : 0,
    technologies: normalizedTechs,
    bands: splitBackendList(row.bandes ?? row.bands ?? row.bande).slice(0, 6),
    status,
    updated: "Live",
    alarms: status === "Critical" ? 4 : status === "Warning" ? 1 : 0,
    load: Math.min(99, Math.max(35, Number(row.qoe_score_avg ?? row.load ?? 74))),
    lat: Number.isFinite(lat) ? lat : 46,
    lng: Number.isFinite(lng) ? lng : 2,
  };
};

const buildArchitectureTree = (rows: SiteRow[]): TreeNode => {
  const projectName = rows[0]?.project || "OSMOSIS Topology";
  const root: TreeNode = {
    id: `project-${projectName}`,
    label: projectName,
    type: "Project",
    count: `${rows.length} sites`,
    accent: "bg-teal-500",
    children: [],
  };

  const vendors = Array.from(new Set(rows.map((row) => row.vendor))).sort();
  root.children = vendors.map((vendor) => {
    const vendorRows = rows.filter((row) => row.vendor === vendor);
    const uprs = Array.from(new Set(vendorRows.map((row) => row.upr))).sort();
    return {
      id: `vendor-${vendor}`,
      label: vendor,
      type: "Vendor",
      count: `${vendorRows.reduce((sum, row) => sum + row.cells, 0).toLocaleString()} cells`,
      accent: "bg-emerald-500",
      children: uprs.map((upr) => {
        const uprRows = vendorRows.filter((row) => row.upr === upr);
        const drs = Array.from(new Set(uprRows.map((row) => row.dr))).sort();
        return {
          id: `upr-${vendor}-${upr}`,
          label: upr,
          type: "UPR",
          count: `${drs.length} DR`,
          accent: "bg-cyan-500",
          children: drs.map((dr) => {
            const drRows = uprRows.filter((row) => row.dr === dr);
            const plaques = Array.from(new Set(drRows.map((row) => row.plaque))).sort();
            return {
              id: `dr-${vendor}-${upr}-${dr}`,
              label: dr,
              type: "DR",
              count: `${plaques.length} plaques`,
              accent: "bg-sky-500",
              children: plaques.map((plaque) => {
                const plaqueRows = drRows.filter((row) => row.plaque === plaque);
                const cellCount = plaqueRows.reduce((sum, row) => sum + row.cells, 0);
                return {
                  id: `plaque-${vendor}-${upr}-${dr}-${plaque}`,
                  label: plaque,
                  type: "Plaque",
                  count: `${plaqueRows.length} sites`,
                  accent: "bg-amber-500",
                  children: [{
                    id: `sites-${vendor}-${upr}-${dr}-${plaque}`,
                    label: "Sites",
                    type: "Sites",
                    count: String(plaqueRows.length),
                    accent: "bg-lime-500",
                    children: [{
                      id: `cells-${vendor}-${upr}-${dr}-${plaque}`,
                      label: "Cells",
                      type: "Cells",
                      count: cellCount.toLocaleString(),
                      accent: "bg-green-600",
                    }],
                  }],
                };
              }),
            };
          }),
        };
      }),
    };
  });
  return root;
};

const NetworkExplorer = () => {
  const [activeTab, setActiveTab] = useState("Topology");
  const [backendRows, setBackendRows] = useState<SiteRow[]>([]);
  const [backendFilters, setBackendFilters] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<string>("mock");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "project-5g": true,
    "vendor-ericsson": true,
    "upr-idf": true,
    "dr-paris-east": true,
    "plaque-p3": true,
    "sites-p3": true,
  });
  const [selectedNode, setSelectedNode] = useState<TreeNode>(hierarchy.children![0].children![0].children![0].children![0]);
  const [expandedSite, setExpandedSite] = useState<string | null>("PAR-5G-1001");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    project: "All",
    vendor: "All",
    upr: "All",
    dr: "All",
    plaque: "All",
    tech: "All",
    status: "All",
  });

  const loadBackendData = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const params: Record<string, string> = { limit: "250" };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.vendor !== "All") params.vendor = filters.vendor;
      if (filters.upr !== "All") params.dor = filters.upr;
      if (filters.plaque !== "All") params.plaque = filters.plaque;
      if (filters.tech !== "All") params.rat = filters.tech;

      const data = await fetchParserJson<any>("/topo/sites", params);
      const rows = Array.isArray(data) ? data : (data?.sites || data?.rows || []);
      const mapped = rows.map(mapBackendSite).filter((row) => row.site && row.cells >= 0);
      setBackendRows(mapped);
      setLastLoaded(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Backend unavailable");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchParserJson<{ filters: { id: string; label: string; values: string[] }[] }>("/topo/filters")
      .then((payload) => {
        if (cancelled) return;
        const next: Record<string, string[]> = {};
        payload.filters?.forEach((item) => {
          next[item.id] = item.values || [];
        });
        setBackendFilters(next);
      })
      .catch(() => {
        if (!cancelled) setBackendFilters({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadBackendData();
    }, filters.search ? 320 : 0);
    return () => window.clearTimeout(handle);
  }, [filters.search, filters.vendor, filters.upr, filters.plaque, filters.tech]);

  const siteRows = backendRows.length ? backendRows : fallbackSiteRows;
  const architectureTree = useMemo(() => buildArchitectureTree(siteRows), [siteRows]);

  const filteredRows = useMemo(() => {
    return siteRows.filter((row) => {
      const query = filters.search.trim().toLowerCase();
      return (
        (!query || row.site.toLowerCase().includes(query) || row.id.toLowerCase().includes(query)) &&
        (filters.project === "All" || row.project === filters.project) &&
        (filters.vendor === "All" || row.vendor === filters.vendor) &&
        (filters.upr === "All" || row.upr === filters.upr) &&
        (filters.dr === "All" || row.dr === filters.dr) &&
        (filters.plaque === "All" || row.plaque === filters.plaque) &&
        (filters.tech === "All" || row.technologies.includes(filters.tech as Tech)) &&
        (filters.status === "All" || row.status === filters.status)
      );
    });
  }, [filters, siteRows]);

  const pagedRows = filteredRows.slice((page - 1) * 4, page * 4);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 4));
  const alarms = siteRows.reduce((sum, site) => sum + site.alarms, 0);
  const backendActive = backendRows.length > 0 && !backendError;

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isOpen = expandedNodes[node.id] ?? depth < 2;
    const hasChildren = Boolean(node.children?.length);
    const isSelected = selectedNode.id === node.id;

    return (
      <div key={node.id} className="relative">
        {depth > 0 && <div className="absolute left-3 top-0 h-full w-px bg-slate-200" />}
        <button
          type="button"
          onClick={() => {
            setSelectedNode(node);
            if (hasChildren) setExpandedNodes((current) => ({ ...current, [node.id]: !current[node.id] }));
          }}
          className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${isSelected ? "bg-teal-50 shadow-sm ring-1 ring-teal-200" : "hover:bg-white/80 hover:shadow-sm"}`}
          style={{ marginLeft: depth * 18 }}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${node.accent} text-white shadow-sm`}>
            {hasChildren ? (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <CircleDot size={13} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{node.label}</span>
            <span className="text-xs font-medium text-slate-500">{node.type}</span>
          </span>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{node.count}</span>
        </button>
        {hasChildren && isOpen && <div className="mt-1 space-y-1">{node.children!.map((child) => renderNode(child, depth + 1))}</div>}
      </div>
    );
  };

  const SelectControl = ({ label, value, options, filterKey }: { label: string; value: string; options: string[]; filterKey: keyof typeof filters }) => (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => setFilter(filterKey, event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white/85 px-3 text-sm font-semibold text-slate-700 shadow-inner outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );

  const kpis = [
    { label: "Projects", value: String(new Set(siteRows.map((row) => row.project)).size).padStart(2, "0"), icon: DatabaseZap, hint: backendActive ? "backend" : "fallback" },
    { label: "Vendors", value: String(new Set(siteRows.map((row) => row.vendor)).size).padStart(2, "0"), icon: Building2, hint: "multi-RAN" },
    { label: "UPR", value: String(new Set(siteRows.map((row) => row.upr)).size).padStart(2, "0"), icon: Globe2, hint: "national" },
    { label: "DR", value: String(new Set(siteRows.map((row) => row.dr)).size).padStart(2, "0"), icon: Router, hint: "regional" },
    { label: "Plaques", value: String(new Set(siteRows.map((row) => row.plaque)).size).padStart(2, "0"), icon: Layers3, hint: "clustered" },
    { label: "Sites", value: Intl.NumberFormat().format(siteRows.length), icon: TowerControl, hint: "loaded" },
    { label: "Cells", value: Intl.NumberFormat().format(siteRows.reduce((sum, row) => sum + row.cells, 0)), icon: Radio, hint: "RAN objects" },
    { label: "Status", value: `${Math.round((siteRows.filter((row) => row.status === "Healthy").length / Math.max(siteRows.length, 1)) * 100)}%`, icon: ShieldCheck, hint: "healthy" },
    { label: "Last Loaded", value: lastLoaded, icon: Clock3, hint: isLoading ? "syncing" : "live sync" },
  ];

  const vendorOptions = unique([...(backendFilters.vendor || []), ...siteRows.map((r) => r.vendor)]);
  const uprOptions = unique([...(backendFilters.dor || []), ...siteRows.map((r) => r.upr)]);
  const plaqueOptions = unique([...(backendFilters.cluster || []), ...siteRows.map((r) => r.plaque)]);
  const techOptions = unique(
    [...(backendFilters.rat || []), "2G", "3G", "4G", "5G"]
      .map((value) => normalizeTech(value) || String(value))
      .filter((value) => value && value !== "All"),
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eefdfa_52%,#f7faf9_100%)] p-4 text-slate-900 sm:p-6">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5">
        <header className="rounded-xl border border-white/80 bg-white/78 p-4 shadow-[0_18px_60px_rgba(15,118,110,0.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20">
                <Network size={30} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Network Explorer</h1>
                <p className="text-sm font-medium text-slate-500">Explore, analyze, and monitor network data across topology.</p>
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/75 p-1">
              {navItems.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTab(label)}
                  className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${activeTab === label ? "bg-teal-600 text-white shadow-md shadow-teal-500/20" : "text-slate-600 hover:bg-white hover:text-teal-700"}`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {activeTab === "Parameter Hub" ? (
          <ParameterHubPage />
        ) : (
        <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
          {kpis.map(({ label, value, icon: Icon, hint }) => (
            <article key={label} className="rounded-xl border border-white/85 bg-white/80 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,118,110,0.12)]">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100"><Icon size={18} /></span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]" />
              </div>
              <div className="text-2xl font-extrabold text-slate-950">{value}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-2 text-xs font-semibold text-teal-700">{hint}</div>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-white/85 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">Architecture Explorer</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                  {["Project Name", "Vendor", "UPR", "DR", "Plaque", "Sites", "Cells"].map((crumb, index) => (
                    <React.Fragment key={crumb}>
                      <span className={index < 5 ? "text-teal-700" : ""}>{crumb}</span>
                      {index < 6 && <ChevronRight size={13} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="relative min-w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input className="h-10 w-full rounded-lg border border-slate-200 bg-white/90 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100" placeholder="Search hierarchy" />
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/60 to-white p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Hierarchy schema</div>
              <pre className="font-mono text-[12px] leading-6 text-slate-700 whitespace-pre">
{`Project Name
└── Vendor
    └── UPR
        └── DR
            └── Plaque
                └── Sites
                    └── Cells`}
              </pre>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">{renderNode(architectureTree)}</div>
              <aside className="rounded-xl border border-teal-100 bg-gradient-to-br from-white to-teal-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-teal-700">Selected node</div>
                <div className="mt-2 text-xl font-extrabold text-slate-950">{selectedNode.label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">{selectedNode.type} · {selectedNode.count}</div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-bold text-slate-500">Drill-down</div>
                    <div className="mt-1 text-lg font-extrabold text-teal-700">Active</div>
                  </div>
                  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-bold text-slate-500">Sync</div>
                    <div className="mt-1 text-lg font-extrabold text-emerald-700">Live</div>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <div className="rounded-xl border border-white/85 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">Live Network Map</h2>
                <p className="text-sm font-medium text-slate-500">Clusters, heat density, and real-time site status</p>
              </div>
              <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-200"><Activity size={14} /> Live</span>
            </div>
            <div className="relative min-h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_25%_20%,rgba(20,184,166,.16),transparent_28%),radial-gradient(circle_at_70%_55%,rgba(34,197,94,.20),transparent_26%),linear-gradient(135deg,#f8fafc,#eefcf7)]">
              <svg viewBox="0 0 720 380" className="absolute inset-0 h-full w-full">
                <defs>
                  <filter id="soft"><feGaussianBlur stdDeviation="18" /></filter>
                </defs>
                <g opacity=".5" stroke="#cbd5e1" strokeWidth="1">
                  {Array.from({ length: 11 }).map((_, i) => <line key={`v-${i}`} x1={i * 72} y1="0" x2={i * 72} y2="380" />)}
                  {Array.from({ length: 7 }).map((_, i) => <line key={`h-${i}`} x1="0" y1={i * 64} x2="720" y2={i * 64} />)}
                </g>
                <g filter="url(#soft)" opacity=".65">
                  <circle cx="180" cy="120" r="72" fill="#14b8a6" />
                  <circle cx="420" cy="220" r="96" fill="#22c55e" />
                  <circle cx="565" cy="145" r="60" fill="#f59e0b" />
                </g>
                <path d="M160 120 C 260 80, 330 260, 430 218 S 530 105, 585 145" fill="none" stroke="#0f766e" strokeWidth="3" strokeDasharray="8 8" opacity=".55" />
                {siteRows.map((site, index) => {
                  const x = 105 + index * 95 + (index % 2) * 24;
                  const y = 105 + (index % 3) * 70;
                  const fill = site.status === "Healthy" ? "#10b981" : site.status === "Warning" ? "#f59e0b" : "#ef4444";
                  return (
                    <g key={site.id}>
                      <circle cx={x} cy={y} r={18 + site.load / 18} fill={fill} opacity=".14" />
                      <circle cx={x} cy={y} r="9" fill={fill} stroke="white" strokeWidth="4" />
                      <text x={x + 16} y={y + 5} fontSize="11" fontWeight="800" fill="#334155">{site.site.split("-").slice(-2).join("-")}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="absolute bottom-4 left-4 right-4 grid gap-3 sm:grid-cols-3">
                {(["Healthy", "Warning", "Critical"] as Status[]).map((status) => (
                  <div key={status} className="rounded-lg bg-white/85 p-3 text-sm font-bold shadow-sm ring-1 ring-white/70 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <span>{status}</span>
                      <span className={`rounded-full px-2 py-1 text-xs ring-1 ${statusStyles[status]}`}>{siteRows.filter((s) => s.status === status).length}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/85 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
                <h2 className="text-lg font-extrabold text-slate-950">Sites And Data</h2>
                <p className="text-sm font-medium text-slate-500">{filteredRows.length} matching sites · {alarms} active alarms</p>
                {backendError && <p className="mt-1 text-xs font-bold text-amber-700">Backend unavailable: using fallback data ({backendError})</p>}
              </div>
            <button type="button" onClick={loadBackendData} className="flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70" disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> {isLoading ? "Loading" : "Refresh"}
            </button>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[1.2fr_repeat(7,minmax(0,1fr))_auto]">
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Search Site</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input value={filters.search} onChange={(event) => setFilter("search", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white/85 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100" placeholder="Site or cell id" />
              </div>
            </label>
            <SelectControl label="Project Name" value={filters.project} filterKey="project" options={unique(siteRows.map((r) => r.project))} />
            <SelectControl label="Vendor" value={filters.vendor} filterKey="vendor" options={vendorOptions} />
            <SelectControl label="UPR" value={filters.upr} filterKey="upr" options={uprOptions} />
            <SelectControl label="DR" value={filters.dr} filterKey="dr" options={unique(siteRows.map((r) => r.dr))} />
            <SelectControl label="Plaque" value={filters.plaque} filterKey="plaque" options={plaqueOptions} />
            <SelectControl label="Technology" value={filters.tech} filterKey="tech" options={techOptions} />
            <SelectControl label="Status" value={filters.status} filterKey="status" options={["All", "Healthy", "Warning", "Critical"]} />
            <button type="button" className="mt-5 flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-teal-700 shadow-sm transition hover:bg-teal-50" title="Advanced filters"><Filter size={17} /></button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1180px] border-collapse bg-white text-left">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-[11px] uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    {["Project Name", "Vendor", "UPR", "DR", "Plaque", "Site Name", "Cells", "Technologies", "Bands", "Status", "Last Updated"].map((header) => (
                      <th key={header} className="border-b border-slate-200 px-4 py-3 font-extrabold">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr onClick={() => setExpandedSite(expandedSite === row.id ? null : row.id)} className="cursor-pointer transition hover:bg-teal-50/45">
                        <td className="px-4 py-4 text-sm font-bold text-slate-800">{row.project}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[10px] text-white">{vendorMark[row.vendor]}</span>
                            {row.vendor}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-600">{row.upr}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-600">{row.dr}</td>
                        <td className="px-4 py-4 text-sm font-bold text-slate-700">{row.plaque}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                            {expandedSite === row.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            {row.site}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-400">{row.id}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-extrabold text-slate-900">{row.cells}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">{row.technologies.map((tech) => <span key={tech} className={`rounded-full px-2 py-1 text-xs font-extrabold ring-1 ${techStyles[tech]}`}>{tech}</span>)}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-600">{row.bands.join(", ")}</td>
                        <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${statusStyles[row.status]}`}>{row.status}</span></td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-500">{row.updated}</td>
                      </tr>
                      {expandedSite === row.id && (
                        <tr>
                          <td colSpan={11} className="bg-slate-50/80 px-4 py-4">
                            <div className="grid gap-3 md:grid-cols-4">
                              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><div className="text-xs font-bold text-slate-500">Cell Load</div><div className="mt-1 text-xl font-extrabold text-teal-700">{row.load}%</div></div>
                              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><div className="text-xs font-bold text-slate-500">Open Alarms</div><div className="mt-1 text-xl font-extrabold text-rose-600">{row.alarms}</div></div>
                              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><div className="text-xs font-bold text-slate-500">Coordinates</div><div className="mt-1 text-sm font-extrabold text-slate-800">{row.lat}, {row.lng}</div></div>
                              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200"><div className="text-xs font-bold text-slate-500">Monitoring</div><div className="mt-1 flex items-center gap-2 text-sm font-extrabold text-emerald-700"><Zap size={15} /> Streaming counters</div></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Table2 size={16} /> Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-teal-50">Previous</button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-teal-50">Next</button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-100 bg-white/82 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-700"><ShieldCheck size={18} /> Healthy</div>
            <div className="mt-3 text-3xl font-extrabold text-slate-950">4,823</div>
            <p className="mt-1 text-sm font-medium text-slate-500">Sites reporting nominal RAN counters</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/82 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold text-amber-700"><AlertTriangle size={18} /> Warning</div>
            <div className="mt-3 text-3xl font-extrabold text-slate-950">53</div>
            <p className="mt-1 text-sm font-medium text-slate-500">Capacity, latency, or neighbor anomalies</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white/82 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold text-rose-700"><Signal size={18} /> Critical</div>
            <div className="mt-3 text-3xl font-extrabold text-slate-950">16</div>
            <p className="mt-1 text-sm font-medium text-slate-500">Outage or severe service degradation</p>
          </div>
        </section>
        </>
        )}
      </div>
    </main>
  );
};

export default NetworkExplorer;
