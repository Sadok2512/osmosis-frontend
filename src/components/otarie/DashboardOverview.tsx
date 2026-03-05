import React, { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, Clock, Eye, ChevronLeft, Table2, Search, User, BarChart2, Type, ImageIcon, Map as MapIcon, LayoutGrid, List, Copy, Globe, Lock, Users, Share2, X, Pencil, ExternalLink, Save } from 'lucide-react';
import { AppTab } from '../../types';
import { SavedDashboard } from '../bi/DashboardManager';
import { WidgetItem } from '../bi/dashboardTypes';
import { TableWidgetConfig } from '../bi/BITableWidget';
import { KPI_UNITS } from '../bi/biTypes';
import { getDimensionValues } from '../bi/mockBIData';
import BIChartRenderer from '../bi/BIChartRenderer';
import { dashboardsApi } from '@/lib/localDb';

type DashboardType = 'map' | 'analytic_qoe';
type Visibility = 'private' | 'public' | 'shared';

interface EnhancedDashboard extends SavedDashboard {
  dashboardType: DashboardType;
  visibility: Visibility;
  ownerUsername: string;
  sharedWith: string[];
}

async function loadAllDashboardsFromDB(): Promise<EnhancedDashboard[]> {
  try {
    const data = await dashboardsApi.list();
    if (!data || !Array.isArray(data)) return [];
    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      isShared: row.is_shared ?? true,
      widgets: row.widgets as WidgetItem[],
      updatedAt: row.updated_at,
      dashboardType: (row.dashboard_type as DashboardType) || 'analytic_qoe',
      visibility: (row.visibility as Visibility) || 'public',
      ownerUsername: row.owner_username || 'PSN TEAM',
      sharedWith: row.shared_with || [],
    }));
  } catch { return []; }
}

async function duplicateDashboardInDB(source: EnhancedDashboard, allDashboards: EnhancedDashboard[]): Promise<void> {
  const existingNames = new Set(allDashboards.map(d => d.name.toLowerCase()));
  let dupName = `${source.name} (copy)`;
  if (existingNames.has(dupName.toLowerCase())) {
    let counter = 2;
    while (existingNames.has(`${source.name} (copy ${counter})`.toLowerCase())) counter++;
    dupName = `${source.name} (copy ${counter})`;
  }
  await dashboardsApi.upsert({
    id: `db_${Date.now()}`,
    name: dupName,
    description: source.description,
    is_shared: source.isShared,
    widgets: JSON.parse(JSON.stringify(source.widgets)),
    dashboard_type: source.dashboardType,
    visibility: source.visibility,
    owner_username: source.ownerUsername,
    shared_with: source.sharedWith,
  });
}

// ─── Type badge ───
const TypeBadge: React.FC<{ type: DashboardType }> = ({ type }) => {
  if (type === 'map') {
    return (
      <span className="text-[9px] bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5">
        <MapIcon className="w-2.5 h-2.5" /> Map
      </span>
    );
  }
  return (
    <span className="text-[9px] bg-purple-500/15 text-purple-500 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5">
      <BarChart2 className="w-2.5 h-2.5" /> QOE
    </span>
  );
};

// ─── Visibility badge ───
const VisibilityBadge: React.FC<{ visibility: Visibility; sharedWith?: string[] }> = ({ visibility, sharedWith }) => {
  switch (visibility) {
    case 'public':
      return (
        <span className="text-[9px] bg-green-500/15 text-green-600 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5">
          <Globe className="w-2.5 h-2.5" /> Public
        </span>
      );
    case 'shared':
      return (
        <span className="text-[9px] bg-sky-500/15 text-sky-600 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5" title={sharedWith?.join(', ')}>
          <Users className="w-2.5 h-2.5" /> Partagé ({sharedWith?.length || 0})
        </span>
      );
    default:
      return (
        <span className="text-[9px] bg-orange-500/15 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5">
          <Lock className="w-2.5 h-2.5" /> Privé
        </span>
      );
  }
};

// ─── Share popover ───
const SharePopover: React.FC<{
  db: EnhancedDashboard;
  onUpdate: (id: string, visibility: Visibility, sharedWith: string[]) => void;
  onClose: () => void;
}> = ({ db, onUpdate, onClose }) => {
  const [vis, setVis] = useState<Visibility>(db.visibility);
  const [users, setUsers] = useState<string[]>(db.sharedWith);
  const [newUser, setNewUser] = useState('');

  const addUser = () => {
    const u = newUser.trim();
    if (u && !users.includes(u)) {
      setUsers([...users, u]);
      setNewUser('');
    }
  };

  const removeUser = (u: string) => setUsers(users.filter(x => x !== u));

  const save = () => {
    onUpdate(db.id, vis, users);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-popover border border-border rounded-xl shadow-xl p-4 w-[280px]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-primary" /> Partage
          </h4>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="w-3 h-3" /></button>
        </div>

        <div className="flex gap-1 mb-3">
          {(['private', 'public', 'shared'] as Visibility[]).map(v => (
            <button key={v} onClick={() => setVis(v)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all ${vis === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {v === 'private' ? 'Privé' : v === 'public' ? 'Public' : 'Partagé'}
            </button>
          ))}
        </div>

        {vis === 'shared' && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <input type="text" value={newUser} onChange={e => setNewUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUser()}
                placeholder="Username..."
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
              <button onClick={addUser}
                className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors">+</button>
            </div>
            {users.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {users.map(u => (
                  <span key={u} className="inline-flex items-center gap-1 text-[10px] bg-muted px-2 py-1 rounded-full text-foreground font-medium">
                    <User className="w-2.5 h-2.5" />{u}
                    <button onClick={() => removeUser(u)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={save}
          className="w-full mt-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
          Enregistrer
        </button>
      </div>
    </div>
  );
};

// ─── Edit metadata modal ───
const EditMetadataModal: React.FC<{
  db: EnhancedDashboard;
  onSave: (id: string, updates: { name: string; description: string; dashboard_type: DashboardType; visibility: Visibility; owner_username: string }) => void;
  onClose: () => void;
}> = ({ db, onSave, onClose }) => {
  const [name, setName] = useState(db.name);
  const [description, setDescription] = useState(db.description);
  const [type, setType] = useState<DashboardType>(db.dashboardType);
  const [vis, setVis] = useState<Visibility>(db.visibility);
  const [owner, setOwner] = useState(db.ownerUsername);

  const save = () => {
    onSave(db.id, { name, description, dashboard_type: type, visibility: vis, owner_username: owner });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-popover border border-border rounded-xl shadow-xl p-5 w-[360px] space-y-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5 text-primary" /> Modifier le dashboard
          </h4>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="w-3 h-3" /></button>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nom</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
          <div className="flex gap-1">
            {([['map', 'Map'], ['analytic_qoe', 'Analytic QOE']] as [DashboardType, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setType(k)}
                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all ${type === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Visibilité</label>
          <div className="flex gap-1">
            {(['private', 'public', 'shared'] as Visibility[]).map(v => (
              <button key={v} onClick={() => setVis(v)}
                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all ${vis === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {v === 'private' ? 'Privé' : v === 'public' ? 'Public' : 'Partagé'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Propriétaire</label>
          <input type="text" value={owner} onChange={e => setOwner(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30" />
        </div>

        <button onClick={save}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5">
          <Save className="w-3.5 h-3.5" /> Enregistrer
        </button>
      </div>
    </div>
  );
};

/** Read-only renderer for a single text widget */
const ReadOnlyText: React.FC<{ config: any }> = ({ config }) => (
  <div
    className="w-full h-full flex items-start p-3 overflow-auto rounded-xl"
    style={{
      backgroundColor: config.bgColor || 'transparent',
      color: config.color || 'hsl(var(--foreground))',
      fontSize: config.fontSize || 14,
      fontWeight: config.fontWeight || 'normal',
      fontStyle: config.fontStyle || 'normal',
      textAlign: config.textAlign || 'left',
    }}
  >
    <span className="whitespace-pre-wrap">{config.content}</span>
  </div>
);

/** Read-only renderer for image widget */
const ReadOnlyImage: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden"
    style={{ backgroundColor: config.bgColor || 'transparent' }}>
    {config.src ? (
      <img src={config.src} alt={config.alt || 'Image'}
        className="max-w-full max-h-full"
        style={{ objectFit: config.objectFit || 'contain', borderRadius: config.borderRadius || 0 }} />
    ) : (
      <span className="text-xs text-muted-foreground">No image</span>
    )}
  </div>
);

/** Read-only renderer for map widget */
const ReadOnlyMap: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-center justify-center rounded-xl bg-muted/30 border border-border">
    <div className="text-center text-muted-foreground">
      <LayoutDashboard className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-xs font-medium">{config.title || 'Map Widget'}</p>
      <p className="text-[10px] opacity-60">Carte interactive (lecture seule)</p>
    </div>
  </div>
);

/** Read-only table renderer */
const ReadOnlyTable: React.FC<{ config: TableWidgetConfig }> = ({ config }) => {
  const rng = (() => { let s = config.id.charCodeAt(0) * 100 + config.kpis.length; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const dimValues = getDimensionValues(config.dimension);
  const kpiRanges: Record<string, [number, number]> = {
    volume_totale: [50, 500], debit_dl: [10, 150], debit_ul: [5, 80], dms_dl_3: [60, 99], dms_dl_8: [40, 95], dms_dl_30: [10, 70],
    dms_ul_1: [70, 99], dms_ul_3: [50, 95], dms_ul_5: [30, 85], qoe_index: [500, 900], rtt_setup_avg: [10, 80], rtt_data_avg: [15, 100],
    loss_dl_rate: [0, 5], loss_ul_rate: [0, 5], session_nbr: [1000, 50000], session_dcr: [0, 5],
  };
  const data = dimValues.map(dim => {
    const row: Record<string, any> = { dimension: dim };
    for (const kpi of config.kpis) { const [min, max] = kpiRanges[kpi] || [0, 100]; row[kpi] = +(min + rng() * (max - min)).toFixed(2); }
    return row;
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Table2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">{config.title}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left" style={{ fontSize: config.fontSize || 11 }}>
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="px-3 py-1.5 font-bold text-foreground border-b border-border">{config.dimension}</th>
              {config.kpis.map(kpi => (
                <th key={kpi} className="px-3 py-1.5 font-bold text-foreground border-b border-border text-right whitespace-nowrap">
                  {kpi.replace(/_/g, ' ')}{KPI_UNITS[kpi] ? ` (${KPI_UNITS[kpi]})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={config.striped && i % 2 === 1 ? 'bg-muted/20' : ''}>
                <td className="px-3 py-1 font-medium text-foreground border-b border-border/50">{row.dimension}</td>
                {config.kpis.map(kpi => (
                  <td key={kpi} className="px-3 py-1 text-right font-mono border-b border-border/50">{row[kpi]?.toLocaleString('fr-FR')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Read-only widget renderer */
const ReadOnlyWidget: React.FC<{ widget: WidgetItem }> = ({ widget }) => {
  switch (widget.kind) {
    case 'chart': return <div className="w-full h-full"><BIChartRenderer config={widget.config} /></div>;
    case 'text': return <ReadOnlyText config={widget.config} />;
    case 'image': return <ReadOnlyImage config={widget.config} />;
    case 'map': return <ReadOnlyMap config={widget.config} />;
    case 'table': return <ReadOnlyTable config={widget.config as TableWidgetConfig} />;
    default: return null;
  }
};

const DashboardOverview: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [dashboards, setDashboards] = useState<EnhancedDashboard[]>([]);
  const [sharePopoverId, setSharePopoverId] = useState<string | null>(null);

  useEffect(() => {
    loadAllDashboardsFromDB().then(setDashboards);
  }, []);

  const duplicateDashboard = async (id: string) => {
    const source = dashboards.find(d => d.id === id);
    if (!source) return;
    await duplicateDashboardInDB(source, dashboards);
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
  };

  const updateSharing = async (id: string, visibility: Visibility, sharedWith: string[]) => {
    await dashboardsApi.update(id, {
      visibility,
      shared_with: sharedWith,
      is_shared: visibility === 'public',
    });
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return dashboards;
    const q = search.toLowerCase();
    return dashboards.filter(d => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
  }, [dashboards, search]);

  const selected = useMemo(() => dashboards.find(d => d.id === selectedId), [dashboards, selectedId]);

  if (selected) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedId(null)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <LayoutDashboard className="w-5 h-5 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">{selected.name}</h2>
                <TypeBadge type={selected.dashboardType} />
                <VisibilityBadge visibility={selected.visibility} sharedWith={selected.sharedWith} />
              </div>
              {selected.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{selected.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Dernière modification : {new Date(selected.updatedAt).toLocaleString('fr-FR')}
                <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[9px] font-semibold uppercase tracking-wider">Lecture seule</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span className="font-semibold text-foreground">{selected.ownerUsername}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-12 gap-4" style={{ gridAutoRows: '80px' }}>
            {selected.widgets.filter(w => w && w.layout).map((widget, idx) => {
              const w = Math.min(widget.layout.w || 6, 12);
              const h = widget.layout.h || 3;
              return (
                <div key={idx} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm min-w-0"
                  style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}>
                  <ReadOnlyWidget widget={widget} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Dashboard Overview</h1>
            <p className="text-[11px] text-muted-foreground">Consultation des dashboards • Lecture seule</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" placeholder="Rechercher un dashboard..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground w-[220px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all" />
          </div>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">PSN TEAM</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <LayoutDashboard className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {dashboards.length === 0 ? 'Aucun dashboard disponible' : 'Aucun résultat'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {dashboards.length === 0
                ? "Créez des dashboards dans l'Analytic QOE pour les retrouver ici en lecture seule."
                : 'Essayez un autre terme de recherche.'}
            </p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(db => (
                <button key={db.id} onClick={() => setSelectedId(db.id)}
                  className="group text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      {db.dashboardType === 'map' ? <MapIcon className="w-4 h-4 text-primary" /> : <BarChart2 className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex items-center gap-1">
                      <TypeBadge type={db.dashboardType} />
                      <VisibilityBadge visibility={db.visibility} sharedWith={db.sharedWith} />
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-0.5 truncate">{db.name}</h3>
                  {db.description && (
                    <p className="text-[10px] text-muted-foreground truncate mb-1">{db.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3" />
                    {new Date(db.updatedAt).toLocaleString('fr-FR')}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" /> {db.ownerUsername}
                    </p>
                    <div className="flex items-center gap-0.5">
                      <span onClick={(e) => { e.stopPropagation(); setSharePopoverId(sharePopoverId === db.id ? null : db.id); }}
                        className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Partager">
                        <Share2 className="w-3.5 h-3.5" />
                      </span>
                      <span onClick={(e) => { e.stopPropagation(); duplicateDashboard(db.id); }}
                        className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Dupliquer">
                        <Copy className="w-3.5 h-3.5" />
                      </span>
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  {sharePopoverId === db.id && (
                    <SharePopover db={db} onUpdate={updateSharing} onClose={() => setSharePopoverId(null)} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_200px_160px_120px_100px_80px] gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Nom</span>
                <span>Type</span>
                <span>Description</span>
                <span>Dernière modification</span>
                <span>Propriétaire</span>
                <span>Visibilité</span>
                <span className="text-center">Actions</span>
              </div>
              {filtered.map(db => (
                <div key={db.id} className="relative">
                  <button onClick={() => setSelectedId(db.id)}
                    className="w-full grid grid-cols-[1fr_80px_200px_160px_120px_100px_80px] gap-2 items-center px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {db.dashboardType === 'map' ? <MapIcon className="w-3.5 h-3.5 text-primary" /> : <BarChart2 className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{db.name}</span>
                    </div>
                    <span><TypeBadge type={db.dashboardType} /></span>
                    <span className="text-[10px] text-muted-foreground truncate">{db.description || '—'}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      {new Date(db.updatedAt).toLocaleString('fr-FR')}
                    </span>
                    <span className="text-[10px] text-foreground font-medium flex items-center gap-1 truncate">
                      <User className="w-3 h-3 shrink-0 text-muted-foreground" /> {db.ownerUsername}
                    </span>
                    <span><VisibilityBadge visibility={db.visibility} sharedWith={db.sharedWith} /></span>
                    <div className="flex justify-center gap-0.5">
                      <span onClick={(e) => { e.stopPropagation(); setSharePopoverId(sharePopoverId === db.id ? null : db.id); }}
                        className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Partager">
                        <Share2 className="w-3.5 h-3.5" />
                      </span>
                      <span onClick={(e) => { e.stopPropagation(); duplicateDashboard(db.id); }}
                        className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Dupliquer">
                        <Copy className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                  {sharePopoverId === db.id && (
                    <SharePopover db={db} onUpdate={updateSharing} onClose={() => setSharePopoverId(null)} />
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default DashboardOverview;
