import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Search, BookOpen, Database, BarChart3, Layers, Wifi, Cpu, Globe, Zap,
  ArrowDownUp, Timer, ShieldAlert, Activity, Signal, Gauge, Users,
  Download, Filter, ChevronRight, Info, Plus, Pencil, Trash2, X, Check, Save,
  Sliders, Loader2, Bell, History, CalendarRange
} from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BI_KPI_CATALOG } from '@/components/bi/biTypes';
const KpiCatalogView = lazy(() => import('@/components/documentation/KpiCatalogView'));
const FilterRepositoryView3 = lazy(() => import('@/components/documentation/FilterRepositoryView3'));
const QosNetworkView = lazy(() => import('@/components/documentation/QosNetworkView'));
const TopologiePage = lazy(() => import('@/components/otarie/TopologiePage'));
const ReferencePeriodManager = lazy(() => import('@/components/documentation/ReferencePeriodManager'));
const NetworkTopologyPage = lazy(() => import('@/components/otarie/NetworkTopologyPage'));
const KpiReferenceWorkspace2 = lazy(() => import('@/components/kpi-monitor/KpiReferenceWorkspace2'));

type DocTab = 'topo' | 'kpi' | 'kpi_reference' | 'kpi_reference2' | 'filters' | 'filter3' | 'dimensions' | 'qos_network' | 'parameters_hub' | 'alarms' | 'cm_history' | 'topology' | 'reference_periods';

/* ─────────── TOPO DATA ─────────── */
const topoFields = [
  { name: 'Code NIDT', desc: 'Identifiant unique interne du site réseau.', usage: 'Clé de jointure site', icon: <Database className="w-4 h-4" /> },
  { name: 'Nom Site', desc: 'Nom officiel du site.', usage: 'Agrégation KPI site', icon: <Globe className="w-4 h-4" /> },
  { name: 'Région', desc: 'Région administrative ou opérationnelle.', usage: 'Reporting régional & DOR', icon: <Layers className="w-4 h-4" /> },
  { name: 'Longitude / Latitude', desc: 'Coordonnées géographiques.', usage: 'Visualisation cartographique', icon: <Globe className="w-4 h-4" /> },
  { name: 'Nom Cellule', desc: 'Nom de la cellule.', usage: 'Agrégation KPI cellule', icon: <Signal className="w-4 h-4" /> },
  { name: 'Techno', desc: 'Technologie radio (2G, 3G, 4G, 5G).', usage: 'Segmentation RAT', icon: <Wifi className="w-4 h-4" /> },
  { name: 'Bande', desc: 'Bande de fréquence (NR_3500, LTE800…).', usage: 'Analyse performance par bande', icon: <Zap className="w-4 h-4" /> },
  { name: 'Constructeur', desc: 'Fournisseur équipement (Ericsson, Nokia…).', usage: 'Benchmarking vendeur', icon: <Cpu className="w-4 h-4" /> },
  { name: 'Azimut', desc: "Orientation de l'antenne (degrés).", usage: 'Optimisation couverture', icon: <ArrowDownUp className="w-4 h-4" /> },
  { name: 'Date MES', desc: "Date d'activation du service.", usage: 'Suivi déploiement', icon: <Timer className="w-4 h-4" /> },
  { name: 'Date FN8', desc: 'Date jalon technique.', usage: 'Suivi déploiement', icon: <Timer className="w-4 h-4" /> },
  { name: 'Plaque', desc: 'Regroupement de zone opérationnelle.', usage: 'Segmentation opérationnelle', icon: <Layers className="w-4 h-4" /> },
  { name: 'HBA', desc: 'Indicateur High Band Area.', usage: 'Classification couverture', icon: <Signal className="w-4 h-4" /> },
  { name: 'TAC', desc: 'Tracking Area Code.', usage: 'Gestion mobilité', icon: <Activity className="w-4 h-4" /> },
  { name: 'ECI', desc: 'E-UTRAN Cell Identifier.', usage: 'Identification cellule LTE', icon: <Database className="w-4 h-4" /> },
  { name: 'NCI', desc: 'NR Cell Identifier.', usage: 'Identification cellule 5G', icon: <Database className="w-4 h-4" /> },
  { name: 'PCI', desc: 'Physical Cell Identifier.', usage: 'Analyse interférence', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Zone_ARCEP', desc: 'Classification zone réglementaire.', usage: 'Segmentation KPI réglementaire', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Essentiel', desc: 'Indicateur site stratégique.', usage: 'Monitoring prioritaire', icon: <Gauge className="w-4 h-4" /> },
];

/* ─────────── KPI TYPE ─────────── */
interface KPIEntry {
  kpi_key: string;
  kpi_code: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  formula_type: string;
  vendor: string;
  techno: string;
  is_normalized: boolean;
  supported_levels: string[];
}

/* ─────────── MODULE-LEVEL CACHE ─────────── */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const apiCache: Record<string, { data: any; ts: number }> = {};

/* ─────────── API HELPERS ─────────── */
async function monitorGet<T>(path: string, skipCache = false): Promise<T> {
  const key = `monitor/${path}`;
  const cached = apiCache[key];
  if (!skipCache && cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data as T;
  }
  const url = getApiUrl(key);
  const res = await fetch(url, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  apiCache[key] = { data, ts: Date.now() };
  return data;
}

async function monitorPost(path: string, body: any) {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { method: 'POST', headers: getApiHeaders(), body: JSON.stringify(body) });
  return res.json();
}

async function monitorPut(path: string, body: any) {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { method: 'PUT', headers: getApiHeaders(), body: JSON.stringify(body) });
  return res.json();
}

async function monitorDelete(path: string) {
  const url = getApiUrl(`monitor/${path}`);
  const res = await fetch(url, { method: 'DELETE', headers: getApiHeaders() });
  return res.json();
}

const groupColors: Record<string, string> = {
  Accessibility: 'bg-blue-500', Retainability: 'bg-rose-500', Throughput: 'bg-violet-500',
  Traffic: 'bg-emerald-500', Mobility: 'bg-indigo-500', 'Radio Quality': 'bg-amber-500',
  VoLTE: 'bg-orange-500', Corporate: 'bg-teal-500', Other: 'bg-gray-500',
  'Carrier Aggregation': 'bg-cyan-500', NSA: 'bg-pink-500', VoNR: 'bg-fuchsia-500',
};

/* ─────────── DIMENSIONS DATA ─────────── */
interface DimEntry { dimension: string; values: string; description: string }
interface DimSection { title: string; icon: React.ReactNode; entries: DimEntry[] }

const dimSections: DimSection[] = [
  {
    title: 'Radio Structure', icon: <Signal className="w-5 h-5" />,
    entries: [
      { dimension: 'Vendor', values: 'ericsson, nokia, ransharing, samsung', description: 'Radio equipment vendor' },
      { dimension: 'DOR', values: 'ILE_DE_FRANCE, NORD_EST, OUEST, SUD_EST, SUD_OUEST', description: 'Operational regional segmentation' },
      { dimension: 'Plaque', values: 'All operational plaques', description: 'Operational geographical grouping' },
      { dimension: 'Site / Cellule', values: 'Site & Cell names', description: 'Physical site & cell aggregation' },
      { dimension: 'Bande', values: 'NR_3500, NR_700, LTE2600, LTE2100, LTE1800, LTE800, LTE700', description: 'Radio frequency band' },
    ]
  },
  { title: 'RAT', icon: <Wifi className="w-5 h-5" />, entries: [{ dimension: 'RAT', values: '5G_SA, 5G_NSA, 4G, 3G, 2G', description: 'Access technology' }] },
  { title: 'ARCEP Zone', icon: <ShieldAlert className="w-5 h-5" />, entries: [{ dimension: 'ARCEP', values: 'Top15, Intermidiare, rural, AXE, TGV', description: 'Regulatory classification' }] },
];

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
const DocumentationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DocTab>('filter3');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');

  // Load KPI catalog from backend
  const [kpiCatalog, setKpiCatalog] = useState<KPIEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCatalog = useCallback((forceRefresh = false) => {
    setLoading(true);
    const mapVps = (data: any[]): KPIEntry[] => data.map((k: any) => ({
      kpi_key: k.kpi_key,
      kpi_code: k.kpi_key,
      display_name: k.display_name || k.kpi_key,
      description: k.description || '',
      category: k.category || 'Other',
      unit: k.unit || '',
      formula_type: k.formula_type || 'ratio',
      vendor: k.vendor || '',
      techno: k.techno || '',
      is_normalized: k.is_normalized || false,
      supported_levels: k.supported_levels || [],
    }));

    const fallbackFromSupabase = async (): Promise<KPIEntry[]> => {
      const { data, error } = await supabase.from('kpi_catalog').select('*').limit(5000);
      if (!error && data && data.length) {
        return data.map((k: any) => ({
          kpi_key: k.kpi_key,
          kpi_code: k.kpi_key,
          display_name: k.display_name || k.kpi_key,
          description: k.definition || '',
          category: k.famille || 'Other',
          unit: k.unit || '',
          formula_type: k.value_type || 'ratio',
          vendor: '',
          techno: k.techno || '',
          is_normalized: false,
          supported_levels: [],
        }));
      }
      // Final fallback: BI static catalog
      return BI_KPI_CATALOG.map(k => ({
        kpi_key: k.key,
        kpi_code: k.key,
        display_name: k.display_name,
        description: '',
        category: k.category,
        unit: k.unit || '',
        formula_type: 'ratio',
        vendor: '',
        techno: '',
        is_normalized: false,
        supported_levels: [],
      }));
    };

    monitorGet<any[]>('catalog/kpis', forceRefresh)
      .then(data => setKpiCatalog(mapVps(data)))
      .catch(async () => {
        const fb = await fallbackFromSupabase();
        setKpiCatalog(fb);
        if (fb.length === 0) toast.error('Erreur chargement KPI catalog');
        else toast.message(`Backend indisponible — ${fb.length} KPIs chargés en local`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const kpiGroups = useMemo(() => [...new Set(kpiCatalog.map(k => k.category))].sort(), [kpiCatalog]);

  const tabs: { id: DocTab; label: string; icon: React.ReactNode }[] = [
    { id: 'filter3', label: 'Filters', icon: <Filter className="w-4 h-4" /> },
    { id: 'kpi_reference2', label: 'KPI Reference', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'reference_periods', label: 'Reference Periods', icon: <CalendarRange className="w-4 h-4" /> },
    { id: 'topo', label: 'Topologie', icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── HEADER ── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-8 pt-6 pb-0">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">OSMOSIS Catalogue Officiel</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">Cluster Builder</h1>
                <p className="mt-2 text-sm text-muted-foreground">{kpiCatalog.length} KPIs • Backend Synchronized</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher (code, groupe, nom, vendor…)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-80 h-9 pl-9 pr-4 rounded-full border border-border bg-muted/40 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-colors"
                />
              </div>
              {activeTab === 'kpi' && (
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                    className="pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
                  >
                    <option value="ALL">Tous les groupes</option>
                    {kpiGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-1 mt-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearch(''); setGroupFilter('ALL'); }}
                className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'bg-background border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'filter3' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <FilterRepositoryView3 />
          </Suspense>
        ) : activeTab === 'qos_network' ? (
          <QosNetworkView />
        ) : activeTab === 'kpi_reference2' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <KpiReferenceWorkspace2 />
          </Suspense>
        ) : activeTab === 'reference_periods' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <ReferencePeriodManager />
          </Suspense>
        ) : activeTab === 'topology' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <NetworkTopologyPage />
          </Suspense>
        ) : activeTab === 'parameters_hub' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            <TopologiePage />
          </Suspense>
        ) : (
          <div className="px-8 py-6 max-w-7xl overflow-y-auto h-full">
            {activeTab === 'topo' && <TopoSection search={search} />}
            {activeTab === 'kpi' && <KPISection kpis={kpiCatalog} search={search} groupFilter={groupFilter} loading={loading} onRefresh={() => loadCatalog(true)} />}
            {activeTab === 'dimensions' && <DimensionsSection search={search} />}
            {activeTab === 'alarms' && <AlarmsSection search={search} />}
            {activeTab === 'cm_history' && <CMHistorySection search={search} />}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════ TOPO TAB ═══════════════════ */
const TopoSection: React.FC<{ search: string }> = ({ search }) => {
  const filtered = topoFields.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()) || f.usage.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{filtered.length} champs topologiques</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((f, i) => (
          <div key={i} className="group rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {f.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground">{f.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                <span className="inline-block mt-2.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-accent text-accent-foreground">{f.usage}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════ KPI TAB — Connected to Backend ═══════════════════ */
const KPISection: React.FC<{
  kpis: KPIEntry[];
  search: string;
  groupFilter: string;
  loading: boolean;
  onRefresh: () => void;
}> = ({ kpis, search, groupFilter, loading, onRefresh }) => {
  const [editingKpi, setEditingKpi] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const filtered = useMemo(() => kpis.filter(k => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      k.kpi_key.toLowerCase().includes(q) ||
      k.kpi_code.toLowerCase().includes(q) ||
      k.display_name.toLowerCase().includes(q) ||
      k.category.toLowerCase().includes(q) ||
      k.vendor.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q);
    const matchGroup = groupFilter === 'ALL' || k.category === groupFilter;
    return matchSearch && matchGroup;
  }), [kpis, search, groupFilter]);

  const handleDelete = async (kpiCode: string) => {
    if (!confirm(`Supprimer ${kpiCode} ?`)) return;
    const r = await monitorDelete(`catalog/kpis/${kpiCode}`);
    if (r.status === 'deleted') { toast.success(`KPI ${kpiCode} supprimé`); onRefresh(); }
    else toast.error(r.message || 'Erreur suppression');
  };

  const handleUpdate = async (kpiCode: string, updates: Record<string, any>) => {
    const r = await monitorPut(`catalog/kpis/${kpiCode}`, updates);
    if (r.status === 'updated') { toast.success(`KPI ${kpiCode} mis à jour`); setEditingKpi(null); onRefresh(); }
    else toast.error(r.message || 'Erreur mise à jour');
  };

  const handleCreate = async (data: Record<string, any>) => {
    const r = await monitorPost('catalog/kpis', data);
    if (r.status === 'created') { toast.success(`KPI ${data.kpi_code} créé`); setShowAddForm(false); onRefresh(); }
    else toast.error(r.message || 'Erreur création');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {loading ? 'Chargement...' : `${filtered.length} / ${kpis.length} KPIs`}
        </span>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Ajouter KPI
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <KpiAddForm onSubmit={handleCreate} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-[100px_120px_1fr_1fr_1fr_80px] gap-3 px-5 pb-3 border-b border-border">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPI Code</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Identity</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Details</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Metadata</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</span>
      </div>

      {/* KPI Rows — capped at 200 */}
      <div className="divide-y divide-border">
        {filtered.length > 200 && !search && (
          <div className="py-4 text-center text-xs text-muted-foreground bg-muted/20">
            {filtered.length} KPIs — tapez pour rechercher ou filtrez par groupe
          </div>
        )}
        {(filtered.length > 200 && !search ? filtered.slice(0, 200) : filtered).map((kpi) => (
          editingKpi === kpi.kpi_key ? (
            <KpiEditRow key={kpi.kpi_key} kpi={kpi} onSave={handleUpdate} onCancel={() => setEditingKpi(null)} />
          ) : (
            <div key={kpi.kpi_key} className="group grid grid-cols-[100px_120px_1fr_1fr_1fr_80px] gap-3 px-5 py-4 hover:bg-muted/30 transition-colors items-start">
              {/* KPI Code */}
              <div>
                <span className="inline-block px-2 py-1 rounded-lg bg-muted text-[10px] font-mono font-bold text-muted-foreground break-all">
                  {kpi.kpi_code}
                </span>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${groupColors[kpi.category] || 'bg-gray-400'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary truncate">{kpi.category}</span>
                </div>
              </div>

              {/* Identity */}
              <div>
                <h3 className="text-sm font-bold text-foreground">{kpi.display_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{kpi.description || '—'}</p>
              </div>

              {/* Details */}
              <div className="flex flex-wrap gap-1.5">
                {kpi.unit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">{kpi.unit}</span>}
                {kpi.vendor && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">{kpi.vendor}</span>}
                {kpi.techno && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">{kpi.techno}</span>}
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{kpi.formula_type}</span>
                {kpi.is_normalized && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-bold">Normalized</span>}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-1">
                {kpi.supported_levels.slice(0, 3).map(l => (
                  <span key={l} className="text-[8px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground">{l}</span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingKpi(kpi.kpi_key)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(kpi.kpi_key)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        ))}
        {filtered.length > 200 && !search && (
          <div className="py-3 text-center text-[10px] text-muted-foreground">Affichage limité à 200 — utilisez la recherche</div>
        )}
      </div>
    </div>
  );
};

/* ── Inline Edit Row ── */
const KpiEditRow: React.FC<{
  kpi: KPIEntry;
  onSave: (code: string, updates: Record<string, any>) => void;
  onCancel: () => void;
}> = ({ kpi, onSave, onCancel }) => {
  const [nom, setNom] = useState(kpi.display_name);
  const [desc, setDesc] = useState(kpi.description);
  const [fam, setFam] = useState(kpi.category);
  const [unit, setUnit] = useState(kpi.unit);
  const [vendor, setVendor] = useState(kpi.vendor);
  const [techno, setTechno] = useState(kpi.techno);

  return (
    <div className="px-5 py-4 bg-primary/5 border-l-4 border-primary space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-primary">Modifier: {kpi.kpi_code}</span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
          <button onClick={() => onSave(kpi.kpi_key, { nom_ihm: nom, definition_courte: desc, famille: fam, unites: unit, vendor, techno })}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90">
            <Save className="w-3 h-3 inline mr-1" /> Sauvegarder
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Nom IHM</label><input value={nom} onChange={e => setNom(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Famille</label><input value={fam} onChange={e => setFam(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Unité</label><input value={unit} onChange={e => setUnit(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Vendor</label><input value={vendor} onChange={e => setVendor(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Techno</label><input value={techno} onChange={e => setTechno(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div className="col-span-1"><label className="text-[9px] font-bold text-muted-foreground uppercase">Description</label><input value={desc} onChange={e => setDesc(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
      </div>
    </div>
  );
};

/* ── Add KPI Form ── */
const KpiAddForm: React.FC<{
  onSubmit: (data: Record<string, any>) => void;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [fam, setFam] = useState('');
  const [unit, setUnit] = useState('');
  const [vendor, setVendor] = useState('');
  const [techno, setTechno] = useState('');
  const [num, setNum] = useState('');
  const [den, setDen] = useState('1');

  return (
    <div className="mb-6 p-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary">Nouveau KPI</span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
          <button onClick={() => onSubmit({ kpi_code: code, nom_ihm: nom, definition_courte: desc, famille: fam, unites: unit, vendor, techno, numerateur: num, denominateur: den })}
            disabled={!code || !nom}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-40">
            <Plus className="w-3 h-3 inline mr-1" /> Créer
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">KPI Code *</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="my_kpi_code" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Nom IHM *</label><input value={nom} onChange={e => setNom(e.target.value)} placeholder="Display Name" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Famille</label><input value={fam} onChange={e => setFam(e.target.value)} placeholder="Throughput" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Unité</label><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="%, Mbps" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Vendor</label><input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="nokia" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Techno</label><input value={techno} onChange={e => setTechno(e.target.value)} placeholder="LTE" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Numérateur</label><input value={num} onChange={e => setNum(e.target.value)} placeholder="`pmCounter1`" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Dénominateur</label><input value={den} onChange={e => setDen(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono" /></div>
        <div><label className="text-[9px] font-bold text-muted-foreground uppercase">Description</label><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" /></div>
      </div>
    </div>
  );
};

/* ═══════════════════ DIMENSIONS TAB ═══════════════════ */
const DimensionsSection: React.FC<{ search: string }> = ({ search }) => {
  return (
    <div className="space-y-8">
      {dimSections.map((section, si) => {
        const filtered = section.entries.filter(e =>
          !search || e.dimension.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase()) || e.values.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return null;
        return (
          <div key={si}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">{section.icon}</div>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground uppercase">{filtered.length} dimensions</span>
            </div>
            <div className="grid gap-3">
              {filtered.map((e, ei) => (
                <div key={ei} className="group rounded-xl border border-border bg-card p-5 hover:shadow-md hover:border-primary/20 transition-all">
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <h3 className="font-mono text-sm font-bold text-foreground">{e.dimension}</h3>
                    <p className="text-xs text-muted-foreground text-right">{e.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.values.split(', ').map((v, vi) => (
                      <span key={vi} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary">{v}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};


/* ═══════════════════ ALARMS TAB ═══════════════════ */
const AlarmsSection: React.FC<{ search: string }> = ({ search }) => {
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    monitorGet<any[]>('alarms')
      .then(data => setAlarms(Array.isArray(data) ? data : []))
      .catch(() => setAlarms([]))
      .finally(() => setLoading(false));
  }, []);

  const severityColors: Record<string, string> = {
    critical: 'bg-destructive/10 text-destructive border-destructive/30',
    major: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    minor: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    info: 'bg-primary/10 text-primary border-primary/30',
  };

  const filtered = alarms.filter(a => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (a.alarm_name || '').toLowerCase().includes(s) ||
           (a.site_name || '').toLowerCase().includes(s) ||
           (a.cell_name || '').toLowerCase().includes(s) ||
           (a.severity || '').toLowerCase().includes(s);
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Bell className="w-5 h-5 text-primary" />
        <span className="text-sm font-bold text-foreground">Alarmes Réseau</span>
        <span className="text-xs text-muted-foreground">({filtered.length} alarmes)</span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Bell className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Aucune alarme disponible</p>
          <p className="text-xs mt-1">Les alarmes seront affichées ici lorsque le backend sera connecté.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Sévérité</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Alarme</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Site</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cellule</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityColors[a.severity?.toLowerCase()] || severityColors.info}`}>
                      {a.severity || 'Info'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-medium text-foreground">{a.alarm_name || '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{a.site_name || '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{a.cell_name || '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{a.timestamp || a.raised_at || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
                      {a.status || 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════ CM HISTORY TAB ═══════════════════ */
const CMHistorySection: React.FC<{ search: string }> = ({ search }) => {
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    monitorGet<any[]>('cm/history')
      .then(data => setChanges(Array.isArray(data) ? data : []))
      .catch(() => setChanges([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = changes.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.parameter_name || '').toLowerCase().includes(s) ||
           (c.site_name || '').toLowerCase().includes(s) ||
           (c.cell_name || '').toLowerCase().includes(s) ||
           (c.old_value || '').toLowerCase().includes(s) ||
           (c.new_value || '').toLowerCase().includes(s);
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <History className="w-5 h-5 text-primary" />
        <span className="text-sm font-bold text-foreground">Historique CM (Configuration Management)</span>
        <span className="text-xs text-muted-foreground">({filtered.length} changements)</span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <History className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Aucun changement CM disponible</p>
          <p className="text-xs mt-1">L'historique des modifications de paramètres sera affiché ici.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Paramètre</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Site</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cellule</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Ancienne valeur</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Nouvelle valeur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.changed_at || c.timestamp || '-'}</td>
                  <td className="px-4 py-2 text-xs font-medium text-foreground">{c.parameter_name || '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.site_name || '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.cell_name || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-destructive/10 text-destructive">{c.old_value ?? '-'}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">{c.new_value ?? '-'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DocumentationPage;
