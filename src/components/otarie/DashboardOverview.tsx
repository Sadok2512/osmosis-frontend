import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LayoutDashboard, Clock, Eye, ChevronLeft, Table2, Search, User,
  BarChart2, ImageIcon, Map as MapIcon, LayoutGrid, List, Copy,
  Globe, Lock, Users, Share2, X, Pencil, ExternalLink, Save,
  Plus, MoreHorizontal, Download, Trash2, ArrowUpDown, Filter,
  ChevronDown, RotateCcw
} from 'lucide-react';
import { AppTab } from '../../types';
import { Wand2 } from 'lucide-react';
import { SavedDashboard } from '../bi/DashboardManager';
import { getStoredSession } from '@/services/adminAuth';
import { WidgetItem } from '../bi/dashboardTypes';
import { TableWidgetConfig } from '../bi/BITableWidget';
import { KPI_UNITS } from '../bi/biTypes';
import { getDimensionValues } from '../bi/mockBIData';
import BIChartCardECharts from '../bi/BIChartCardECharts';
import { dashboardsApi, mapViewsApi } from '@/lib/localDb';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip';
import operatorLogo from '@/assets/operator-logo.png';

type DashboardType = 'map' | 'analytic_qoe' | 'precision_architect';
type Visibility = 'private' | 'public' | 'shared';
type SortKey = 'updated' | 'name' | 'owner';

interface EnhancedDashboard extends SavedDashboard {
  dashboardType: DashboardType;
  visibility: Visibility;
  ownerUsername: string;
  sharedWith: string[];
  viewCount: number;
}

async function loadAllDashboardsFromDB(): Promise<EnhancedDashboard[]> {
  try {
    const data = await dashboardsApi.list();
    if (!data || !Array.isArray(data)) return [];

    // Enrich with Supabase metadata (visibility / owner / shared_with) since the
    // VPS endpoint may not return these columns. Supabase is the source of truth.
    let metaById = new Map<string, any>();
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const ids = data.map((r: any) => r.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: meta } = await supabase
          .from('dashboards')
          .select('id, visibility, owner_username, shared_with, dashboard_type, view_count')
          .in('id', ids);
        if (Array.isArray(meta)) meta.forEach((m: any) => metaById.set(m.id, m));
      }
    } catch { /* ignore — fall back to VPS values */ }

    return data.map((row: any) => {
      const meta = metaById.get(row.id) || {};
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        isShared: row.is_shared ?? true,
        widgets: row.widgets as WidgetItem[],
        updatedAt: row.updated_at,
        dashboardType: (meta.dashboard_type || row.dashboard_type) as DashboardType || 'analytic_qoe',
        visibility: (meta.visibility || row.visibility) as Visibility || 'public',
        ownerUsername: meta.owner_username || row.owner_username || getStoredSession()?.username || 'Inconnu',
        sharedWith: meta.shared_with || row.shared_with || [],
        viewCount: Number(meta.view_count ?? row.view_count ?? 0) || 0,
      };
    });
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
  const currentUser = getStoredSession()?.username || source.ownerUsername;
  await dashboardsApi.upsert({
    id: `db_${Date.now()}`,
    name: dupName,
    description: source.description,
    is_shared: source.isShared,
    widgets: JSON.parse(JSON.stringify(source.widgets)),
    dashboard_type: source.dashboardType,
    visibility: source.visibility,
    owner_username: currentUser,
    shared_with: source.sharedWith,
  });
}

/* ─── Dashboard type color mapping ─── */
interface DashboardTypeStyle {
  iconBg: string;
  iconBgHover: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  cardAccent: string;      // left border color
  hoverBg: string;         // subtle tinted hover
  ring: string;            // soft border / glow ring around card
  gradient: string;        // soft top gradient overlay
  label: string;
  icon: React.ReactNode;
}

const DASHBOARD_TYPE_STYLES: Record<string, DashboardTypeStyle> = {
  map: {
    iconBg: 'bg-sky-500/10',
    iconBgHover: 'group-hover:bg-sky-500/20',
    iconColor: 'text-sky-600',
    badgeBg: 'bg-sky-500/10',
    badgeText: 'text-sky-600',
    cardAccent: 'border-l-sky-400',
    hoverBg: 'hover:bg-sky-50/40 dark:hover:bg-sky-950/10',
    ring: 'hover:ring-sky-200/70 dark:hover:ring-sky-900/40 hover:border-sky-200/80 dark:hover:border-sky-900/40',
    gradient: 'from-sky-50/60 dark:from-sky-950/10',
    label: 'Map',
    icon: <MapIcon className="w-4 h-4" />,
  },
  analytic_qoe: {
    iconBg: 'bg-violet-500/10',
    iconBgHover: 'group-hover:bg-violet-500/20',
    iconColor: 'text-violet-600',
    badgeBg: 'bg-violet-500/10',
    badgeText: 'text-violet-600',
    cardAccent: 'border-l-violet-400',
    hoverBg: 'hover:bg-violet-50/40 dark:hover:bg-violet-950/10',
    ring: 'hover:ring-violet-200/70 dark:hover:ring-violet-900/40 hover:border-violet-200/80 dark:hover:border-violet-900/40',
    gradient: 'from-violet-50/60 dark:from-violet-950/10',
    label: 'QOE',
    icon: <BarChart2 className="w-4 h-4" />,
  },
  kpi: {
    iconBg: 'bg-emerald-500/10',
    iconBgHover: 'group-hover:bg-emerald-500/20',
    iconColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-600',
    cardAccent: 'border-l-emerald-400',
    hoverBg: 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10',
    ring: 'hover:ring-emerald-200/70 dark:hover:ring-emerald-900/40 hover:border-emerald-200/80 dark:hover:border-emerald-900/40',
    gradient: 'from-emerald-50/60 dark:from-emerald-950/10',
    label: 'KPI',
    icon: <BarChart2 className="w-4 h-4" />,
  },
  fm: {
    iconBg: 'bg-rose-500/10',
    iconBgHover: 'group-hover:bg-rose-500/20',
    iconColor: 'text-rose-600',
    badgeBg: 'bg-rose-500/10',
    badgeText: 'text-rose-600',
    cardAccent: 'border-l-rose-400',
    hoverBg: 'hover:bg-rose-50/40 dark:hover:bg-rose-950/10',
    ring: 'hover:ring-rose-200/70 dark:hover:ring-rose-900/40 hover:border-rose-200/80 dark:hover:border-rose-900/40',
    gradient: 'from-rose-50/60 dark:from-rose-950/10',
    label: 'FM',
    icon: <BarChart2 className="w-4 h-4" />,
  },
  cm: {
    iconBg: 'bg-amber-500/10',
    iconBgHover: 'group-hover:bg-amber-500/20',
    iconColor: 'text-amber-600',
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-600',
    cardAccent: 'border-l-amber-400',
    hoverBg: 'hover:bg-amber-50/40 dark:hover:bg-amber-950/10',
    ring: 'hover:ring-amber-200/70 dark:hover:ring-amber-900/40 hover:border-amber-200/80 dark:hover:border-amber-900/40',
    gradient: 'from-amber-50/60 dark:from-amber-950/10',
    label: 'CM',
    icon: <BarChart2 className="w-4 h-4" />,
  },
  pm: {
    iconBg: 'bg-teal-500/10',
    iconBgHover: 'group-hover:bg-teal-500/20',
    iconColor: 'text-teal-600',
    badgeBg: 'bg-teal-500/10',
    badgeText: 'text-teal-600',
    cardAccent: 'border-l-teal-400',
    hoverBg: 'hover:bg-teal-50/40 dark:hover:bg-teal-950/10',
    ring: 'hover:ring-teal-200/70 dark:hover:ring-teal-900/40 hover:border-teal-200/80 dark:hover:border-teal-900/40',
    gradient: 'from-teal-50/60 dark:from-teal-950/10',
    label: 'PM',
    icon: <BarChart2 className="w-4 h-4" />,
  },
  precision_architect: {
    iconBg: 'bg-pink-500/10',
    iconBgHover: 'group-hover:bg-pink-500/20',
    iconColor: 'text-pink-600',
    badgeBg: 'bg-pink-500/10',
    badgeText: 'text-pink-600',
    cardAccent: 'border-l-pink-400',
    hoverBg: 'hover:bg-pink-50/40 dark:hover:bg-pink-950/10',
    ring: 'hover:ring-pink-200/70 dark:hover:ring-pink-900/40 hover:border-pink-200/80 dark:hover:border-pink-900/40',
    gradient: 'from-pink-50/60 dark:from-pink-950/10',
    label: 'Netview',
    icon: <Wand2 className="w-4 h-4" />,
  },
};

const FALLBACK_STYLE: DashboardTypeStyle = {
  iconBg: 'bg-muted',
  iconBgHover: 'group-hover:bg-muted/80',
  iconColor: 'text-muted-foreground',
  badgeBg: 'bg-muted',
  badgeText: 'text-muted-foreground',
  cardAccent: 'border-l-border',
  hoverBg: 'hover:bg-muted/30',
  ring: 'hover:ring-border hover:border-border',
  gradient: 'from-muted/30',
  label: 'Other',
  icon: <BarChart2 className="w-4 h-4" />,
};

function getDashboardTypeStyle(type: string): DashboardTypeStyle {
  return DASHBOARD_TYPE_STYLES[type] || FALLBACK_STYLE;
}

/* ─── Type badge ─── */
const TypeBadge: React.FC<{ type: DashboardType }> = ({ type }) => {
  const s = getDashboardTypeStyle(type);
  return (
    <span className={`text-[11px] ${s.badgeBg} ${s.badgeText} px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1`}>
      {React.cloneElement(s.icon as React.ReactElement, { className: 'w-3 h-3' })} {s.label}
    </span>
  );
};

/* ─── Visibility badge ─── */
const VisibilityBadge: React.FC<{ visibility: Visibility; sharedWith?: string[] }> = ({ visibility, sharedWith }) => {
  switch (visibility) {
    case 'public':
      return (
        <span className="text-[11px] bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1">
          <Globe className="w-3 h-3" /> Public
        </span>
      );
    case 'shared':
      return (
        <span className="text-[11px] bg-sky-500/10 text-sky-600 px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1" title={sharedWith?.join(', ')}>
          <Users className="w-3 h-3" /> Partagé ({sharedWith?.length || 0})
        </span>
      );
    default:
      return (
        <span className="text-[11px] bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1">
          <Lock className="w-3 h-3" /> Privé
        </span>
      );
  }
};

/* ─── Kebab dropdown menu ─── */
const KebabMenu: React.FC<{
  onDuplicate: () => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
}> = ({ onDuplicate, onShare, onExport, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
              className="relative z-20 p-1.5 rounded-lg bg-card border border-border shadow-sm hover:bg-muted text-foreground transition-colors"
              aria-label="Plus d'actions"
            >
              <MoreHorizontal className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p className="text-xs">Plus d'actions</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[100] w-44 bg-popover border border-border rounded-xl shadow-xl py-1 animate-in fade-in-0 zoom-in-95">
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
            <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Dupliquer
          </button>
          <button onClick={(e) => { e.stopPropagation(); onShare(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
            <Share2 className="w-3.5 h-3.5 text-muted-foreground" /> Partager
          </button>
          <button onClick={(e) => { e.stopPropagation(); onExport(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
            <Download className="w-3.5 h-3.5 text-muted-foreground" /> Exporter
          </button>
          <div className="my-1 border-t border-border" />
          <button onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Delete confirmation modal ─── */
const DeleteConfirmModal: React.FC<{
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ name, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="bg-popover border border-border rounded-2xl shadow-2xl p-6 w-[380px] space-y-4" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Supprimer le dashboard</h4>
          <p className="text-xs text-muted-foreground">Cette action est irréversible.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Êtes-vous sûr de vouloir supprimer <span className="font-semibold text-foreground">"{name}"</span> ?
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors">
          Annuler
        </button>
        <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-xs font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors">
          Supprimer
        </button>
      </div>
    </div>
  </div>
);

/* ─── Share popover ─── */
const SharePopover: React.FC<{
  db: EnhancedDashboard;
  onUpdate: (id: string, visibility: Visibility, sharedWith: string[]) => void;
  onClose: () => void;
}> = ({ db, onUpdate, onClose }) => {
  const [vis, setVis] = useState<Visibility>(db.visibility);
  const [users, setUsers] = useState<string[]>(db.sharedWith);
  const [newUser, setNewUser] = useState('');
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data } = await supabase
          .from('admin_users')
          .select('username')
          .eq('status', 'active')
          .order('username');
        if (data) setAllUsers(data.map((r: any) => r.username).filter(Boolean));
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const addUser = (u?: string) => {
    const v = (u ?? newUser).trim();
    if (v && !users.includes(v)) { setUsers([...users, v]); setNewUser(''); setShowSuggest(false); }
  };

  const suggestions = useMemo(() => {
    const q = newUser.trim().toLowerCase();
    return allUsers
      .filter(u => !users.includes(u))
      .filter(u => !q || u.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allUsers, users, newUser]);

  const save = () => { onUpdate(db.id, vis, users); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl p-5 w-[340px] space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" /> Partage
          </h4>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1.5">
          {(['private', 'public', 'shared'] as Visibility[]).map(v => (
            <button key={v} onClick={() => setVis(v)}
              className={`flex-1 text-xs font-medium py-2 rounded-xl transition-all ${vis === v ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {v === 'private' ? 'Privé' : v === 'public' ? 'Public' : 'Partagé'}
            </button>
          ))}
        </div>

        {vis === 'shared' && (
          <div className="space-y-2">
            <div className="relative">
              <div className="flex gap-1.5">
                <input type="text" value={newUser}
                  onChange={e => { setNewUser(e.target.value); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onKeyDown={e => e.key === 'Enter' && addUser()}
                  placeholder="Username..."
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                <button onClick={() => addUser()}
                  className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">+</button>
              </div>
              {showSuggest && suggestions.length > 0 && (
                <div className="absolute left-0 right-10 top-full mt-1 z-10 bg-popover border border-border rounded-xl shadow-lg max-h-44 overflow-auto py-1">
                  {suggestions.map(u => (
                    <button key={u} type="button" onClick={() => addUser(u)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted text-left">
                      <User className="w-3 h-3 text-muted-foreground" />{u}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {users.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {users.map(u => (
                  <span key={u} className="inline-flex items-center gap-1 text-xs bg-muted px-2.5 py-1 rounded-full text-foreground font-medium">
                    <User className="w-3 h-3" />{u}
                    <button onClick={() => setUsers(users.filter(x => x !== u))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            {allUsers.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Aucun utilisateur trouvé — saisissez un username manuellement.</p>
            )}
          </div>
        )}

        <button onClick={save}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
          Enregistrer
        </button>
      </div>
    </div>
  );
};


/* ─── Edit metadata modal ─── */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl p-6 w-[400px] space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" /> Modifier le dashboard
          </h4>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nom</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <div className="flex gap-1.5">
            {([['map', 'Map'], ['analytic_qoe', 'Analytic QOE']] as [DashboardType, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setType(k)}
                className={`flex-1 text-xs font-medium py-2 rounded-xl transition-all ${type === k ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Visibilité</label>
          <div className="flex gap-1.5">
            {(['private', 'public', 'shared'] as Visibility[]).map(v => (
              <button key={v} onClick={() => setVis(v)}
                className={`flex-1 text-xs font-medium py-2 rounded-xl transition-all ${vis === v ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {v === 'private' ? 'Privé' : v === 'public' ? 'Public' : 'Partagé'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Propriétaire</label>
          <input type="text" value={owner} onChange={e => setOwner(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
        </div>

        <button onClick={save}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> Enregistrer
        </button>
      </div>
    </div>
  );
};

/* ─── Skeleton loading ─── */
const SkeletonListRows: React.FC = () => (
  <div className="space-y-0">
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border/30">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48 rounded-lg" />
          <Skeleton className="h-3 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-lg" />
      </div>
    ))}
  </div>
);

const SkeletonGridCards: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4 rounded-lg" />
        <Skeleton className="h-3 w-full rounded-lg" />
        <Skeleton className="h-3 w-1/2 rounded-lg" />
      </div>
    ))}
  </div>
);

/* ─── Filter dropdown ─── */
const FilterDropdown: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, icon, value, options, onChange }) => (
  <div className="relative">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
      {icon}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-muted/50 border border-border rounded-xl pl-2 pr-7 py-2 text-xs text-foreground font-medium outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all hover:bg-muted"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  </div>
);

/* ─── Read-only renderers (unchanged logic) ─── */
const ReadOnlyText: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-start p-3 overflow-auto rounded-xl"
    style={{ backgroundColor: config.bgColor || 'transparent', color: config.color || 'hsl(var(--foreground))', fontSize: config.fontSize || 14, fontWeight: config.fontWeight || 'normal', fontStyle: config.fontStyle || 'normal', textAlign: config.textAlign || 'left' }}>
    <span className="whitespace-pre-wrap">{config.content || 'Texte vide'}</span>
  </div>
);

const ReadOnlyImage: React.FC<{ config: any }> = ({ config }) => (
  <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden" style={{ backgroundColor: config.bgColor || 'transparent' }}>
    {config.src ? (
      <img src={config.src} alt={config.alt || 'Image'} className="max-w-full max-h-full" style={{ objectFit: config.objectFit || 'contain', borderRadius: config.borderRadius || 0 }} />
    ) : <span className="text-xs text-muted-foreground">No image</span>}
  </div>
);

const TILE_URLS_RO: Record<string, string> = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

const ReadOnlyMap: React.FC<{ config: any }> = ({ config }) => {
  const center = config.center || [46.6, 2.5];
  const zoom = config.zoom || 6;
  const tileUrl = TILE_URLS_RO[config.mapLayer] || TILE_URLS_RO.light;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <MapIcon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">{config.title || 'Map'}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">Lecture seule</span>
      </div>
      <div className="flex-1 min-h-0">
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}>
          <TileLayer url={tileUrl} />
        </MapContainer>
      </div>
    </div>
  );
};

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

  if (!config.kpis || config.kpis.length === 0) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          <Table2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">{config.title}</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Table2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-medium">Aucun KPI sélectionné</p>
            <p className="text-[10px] opacity-60">Ouvrir en édition pour configurer</p>
          </div>
        </div>
      </div>
    );
  }

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

const ReadOnlyWidget: React.FC<{ widget: any }> = ({ widget }) => {
  // Handle analytic_qoe widgets with 'kind'
  if (widget.kind) {
    switch (widget.kind) {
      case 'chart': return <div className="w-full h-full"><BIChartCardECharts config={widget.config} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} /></div>;
      case 'text': return <ReadOnlyText config={widget.config} />;
      case 'image': return <ReadOnlyImage config={widget.config} />;
      case 'map': return <ReadOnlyMap config={widget.config} />;
      case 'table': return <ReadOnlyTable config={widget.config as TableWidgetConfig} />;
      default: return null;
    }
  }
  // Handle map dashboard settings widgets (_type)
  if (widget._type === 'dashboard_settings') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4">
        <MapIcon className="w-8 h-8 text-primary/40" />
        <span className="text-xs font-medium">Map Dashboard</span>
        <span className="text-[10px] text-muted-foreground/60">Ouvrir en édition pour visualiser la carte</span>
      </div>
    );
  }
  return null;
};

/* ─── Precision Architect read-only preview ─── */
const PrecisionArchitectPreview: React.FC<{ widgets: any[]; onOpen: () => void }> = ({ widgets, onOpen }) => {
  const payload = (widgets || []).find((w: any) => w?._type === 'precision_architect_payload');
  const pages: any[] = Array.isArray(payload?.pages) ? payload.pages : [];
  const totalWidgets = pages.reduce((acc, p) => acc + (Array.isArray(p?.widgets) ? p.widgets.length : 0), 0);
  const totalSections = pages.reduce((acc, p) => acc + (Array.isArray(p?.sections) ? p.sections.length : 0), 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Rapport Netview</h3>
            <p className="text-xs text-muted-foreground">
              {pages.length} page{pages.length > 1 ? 's' : ''} · {totalSections} section{totalSections !== 1 ? 's' : ''} · {totalWidgets} widget{totalWidgets !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          L'aperçu interactif des rapports Netview n'est pas disponible ici. Ouvrez le rapport dans son éditeur dédié pour visualiser les pages, sections et widgets.
        </p>

        {pages.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pages.map((p: any, idx: number) => (
                <div key={p?.id ?? idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
                  <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground truncate">{p?.name || `Page ${idx + 1}`}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {(p?.widgets?.length || 0)} widget{(p?.widgets?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onOpen}
          className="mt-6 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir dans Netview
        </button>
      </div>
    </div>
  );
};
/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
const DashboardOverview: React.FC<{ setActiveTab?: (tab: AppTab) => void }> = ({ setActiveTab }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [dashboards, setDashboards] = useState<EnhancedDashboard[]>([]);
  const [sharePopoverId, setSharePopoverId] = useState<string | null>(null);
  const [editModalId, setEditModalId] = useState<string | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterVisibility, setFilterVisibility] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');

  const [mapViews, setMapViews] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    loadAllDashboardsFromDB().then(d => { setDashboards(d); setLoading(false); });
    mapViewsApi.list().then(v => { if (Array.isArray(v)) setMapViews(v); }).catch(() => {});
  }, []);

  const duplicateDashboard = async (id: string) => {
    const source = dashboards.find(d => d.id === id);
    if (!source) return;
    await duplicateDashboardInDB(source, dashboards);
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
  };

  const deleteDashboard = async (id: string) => {
    await dashboardsApi.remove(id);
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
    setDeleteModalId(null);
  };

  const updateSharing = async (id: string, visibility: Visibility, sharedWith: string[]) => {
    await dashboardsApi.update(id, { visibility, shared_with: sharedWith, is_shared: visibility === 'public' });
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
  };

  const updateMetadata = async (id: string, updates: { name: string; description: string; dashboard_type: DashboardType; visibility: Visibility; owner_username: string }) => {
    await dashboardsApi.update(id, {
      name: updates.name, description: updates.description,
      dashboard_type: updates.dashboard_type, visibility: updates.visibility,
      owner_username: updates.owner_username, is_shared: updates.visibility === 'public',
    });
    const refreshed = await loadAllDashboardsFromDB();
    setDashboards(refreshed);
  };

  const incrementViewCount = async (id: string) => {
    // Optimistic UI bump
    setDashboards(prev => prev.map(d => d.id === id ? { ...d, viewCount: (d.viewCount || 0) + 1 } : d));
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.rpc('increment_dashboard_view', { p_id: id });
    } catch { /* ignore — optimistic value remains until next reload */ }
  };

  const openInEditor = (id: string) => {
    const target = dashboards.find((d) => d.id === id);
    localStorage.setItem('osmosis_open_dashboard_id', id);
    incrementViewCount(id);
    // Precision Architect dashboards have their own editor — route there
    // instead of the BI Studio so the saved pages/widgets actually load.
    if (target?.dashboardType === 'precision_architect') {
      setActiveTab?.('precision_architect');
    } else {
      setActiveTab?.('traffic');
    }
  };

  // Click handler for a dashboard row/card.
  // PA dashboards bypass the in-page preview (which can't render PA widgets)
  // and open straight in the Precision Architect module.
  const openDashboard = (id: string) => {
    const target = dashboards.find((d) => d.id === id);
    if (target?.dashboardType === 'precision_architect') {
      openInEditor(id);
      return;
    }
    incrementViewCount(id);
    setSelectedId(id);
  };

  const exportDashboard = (db: EnhancedDashboard) => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${db.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = filterType !== 'all' || filterVisibility !== 'all' || search.trim() !== '';
  const resetFilters = () => { setFilterType('all'); setFilterVisibility('all'); setSearch(''); };

  const filtered = useMemo(() => {
    let list = [...dashboards];

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
    }

    // Filter by type
    if (filterType !== 'all') list = list.filter(d => d.dashboardType === filterType);

    // Filter by visibility
    if (filterVisibility !== 'all') list = list.filter(d => d.visibility === filterVisibility);

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'owner': return a.ownerUsername.localeCompare(b.ownerUsername);
        default: return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return list;
  }, [dashboards, search, filterType, filterVisibility, sortBy]);

  const selected = useMemo(() => dashboards.find(d => d.id === selectedId), [dashboards, selectedId]);

  /* ─── Detail View ─── */
  if (selected) {
    // Extract theme from widgets (saved as _type: 'theme_settings' or _type: 'dashboard_settings')
    const themeWidget = (selected.widgets as any[]).find((w: any) => w?._type === 'theme_settings');
    const dashSettingsWidget = (selected.widgets as any[]).find((w: any) => w?._type === 'dashboard_settings');
    const dashBgColor = themeWidget?.backgroundColor || dashSettingsWidget?.color || '';
    const dashTitleColor = themeWidget?.titleTextColor || '';
    // Filter out meta widgets for rendering
    const renderWidgets = (selected.widgets as any[]).filter((w: any) => w != null && w._type !== 'theme_settings');

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedId(null)}
              className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              {selected.dashboardType === 'map' ? <MapIcon className="w-4 h-4 text-primary" /> : <BarChart2 className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold"
                  style={dashTitleColor ? { color: dashTitleColor } : undefined}>
                  {selected.name}
                </h2>
                <TypeBadge type={selected.dashboardType} />
                <VisibilityBadge visibility={selected.visibility} sharedWith={selected.sharedWith} />
              </div>
              {selected.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(selected.updatedAt).toLocaleString('fr-FR')}
                <span className="ml-2 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium uppercase tracking-wider">Lecture seule</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openInEditor(selected.id)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm">
              <ExternalLink className="w-3.5 h-3.5" /> Ouvrir en édition
            </button>
            <button onClick={() => setEditModalId(selected.id)}
              className="px-4 py-2 rounded-xl bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
            <div className="flex items-center gap-1.5 ml-3 text-xs text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-medium text-foreground">{selected.ownerUsername}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6"
          style={dashBgColor ? { backgroundColor: dashBgColor } : undefined}>
          {selected.dashboardType === 'precision_architect' ? (
            <PrecisionArchitectPreview
              widgets={selected.widgets as any[]}
              onOpen={() => openInEditor(selected.id)}
            />
          ) : (
            <div className="grid grid-cols-12 gap-4" style={{ gridAutoRows: '80px' }}>
              {renderWidgets.map((widget: any, idx: number) => {
                const layout = widget.layout || { w: 12, h: 4 };
                const w = Math.min(layout.w || 6, 12);
                const h = layout.h || 3;
                return (
                  <div key={idx} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm min-w-0"
                    style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}>
                    <ReadOnlyWidget widget={widget} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Main Overview ─── */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* ── Operator header card ── */}
      <div className="px-6 pt-6">
        <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <img
                src={operatorLogo}
                alt="AEVO NETWORKS operator logo"
                width={48}
                height={48}
                loading="lazy"
                className="w-12 h-12 rounded-full object-contain bg-muted/30 ring-1 ring-border shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground leading-tight truncate">
                  AEVO NETWORKS
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  RAN Network — National Operator
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs font-medium tabular-nums">
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="px-6 pt-4 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">Dashboard Overview</h1>
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {dashboards.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Gérez et consultez vos dashboards</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-medium text-foreground">{getStoredSession()?.username || 'Utilisateur'}</span>
            </div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Rechercher un dashboard..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterDropdown
              label="Type" icon={<Filter className="w-3 h-3" />}
              value={filterType}
              options={[{ value: 'all', label: 'Tous types' }, { value: 'map', label: 'Map' }, { value: 'analytic_qoe', label: 'Analytic QOE' }]}
              onChange={setFilterType}
            />

            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-muted border border-border">
              {[
                { value: 'all', label: 'Tous', icon: <Globe className="w-3 h-3" /> },
                { value: 'public', label: 'Public', icon: <Globe className="w-3 h-3" /> },
                { value: 'private', label: 'Privé', icon: <Lock className="w-3 h-3" /> },
                { value: 'shared', label: 'Partagé', icon: <Users className="w-3 h-3" /> },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilterVisibility(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterVisibility === opt.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>


            <FilterDropdown
              label="Tri" icon={<ArrowUpDown className="w-3 h-3" />}
              value={sortBy}
              options={[{ value: 'updated', label: 'Dernière modif.' }, { value: 'name', label: 'Nom' }, { value: 'owner', label: 'Propriétaire' }]}
              onChange={v => setSortBy(v as SortKey)}
            />

            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <RotateCcw className="w-3 h-3" /> Réinitialiser
              </button>
            )}

            <div className="flex items-center rounded-xl border border-border overflow-hidden ml-auto">
              <button onClick={() => setViewMode('grid')}
                className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          viewMode === 'list' ? <div className="bg-card border border-border rounded-2xl overflow-hidden"><SkeletonListRows /></div> : <SkeletonGridCards />
        ) : filtered.length === 0 ? (
          /* ── Empty / No results state ── */
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-6">
              <LayoutDashboard className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1.5">
              {dashboards.length === 0 ? 'Aucun dashboard' : 'Aucun résultat'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              {dashboards.length === 0
                ? "Créez votre premier dashboard pour commencer à visualiser vos données."
                : 'Aucun dashboard ne correspond à vos filtres.'}
            </p>
            {dashboards.length === 0 ? null : (
              <button onClick={resetFilters}
                className="px-5 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* ── Grid View – Compact stat cards (matches reference design) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(db => {
              const s = getDashboardTypeStyle(db.dashboardType);
              // Extract stats + status from saved widgets meta
              const settings = (db.widgets as any[])?.find((w: any) => w?._type === 'dashboard_settings') || {};
              const scope = settings.siteScope || {};
              const sitesCount: number | null = (typeof scope.sitesInside === 'number' ? scope.sitesInside
                : Array.isArray(scope.siteIds) ? scope.siteIds.length
                : Array.isArray(scope.siteIdsInside) ? scope.siteIdsInside.length
                : null);
              const cellsCount: number | null = (typeof scope.cellsInside === 'number' ? scope.cellsInside : null);
              const fmtNum = (n: number) => n.toLocaleString('fr-FR').replace(/,/g, ' ');
              const sf = settings.siteFilters || {};
              const techList: string[] = Array.isArray(sf.techno) ? sf.techno : (sf.techno ? [sf.techno] : []);
              const techLabel = techList.length === 0 ? 'All' : techList.join(' / ');
              // Active = has real widgets or saved scope; Draft = empty meta only
              const realWidgets = (db.widgets as any[])?.filter((w: any) => w && !w._type) || [];
              const isActive = realWidgets.length > 0 || sitesCount !== null;
              return (
                <div key={db.id}
                  onClick={() => openDashboard(db.id)}
                  className={`group relative cursor-pointer overflow-hidden bg-card border border-border/70 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)] hover:-translate-y-[2px] ring-1 ring-transparent ${s.ring} transition-all duration-200 ease-out`}>
                  {/* Top accent bar (color varies by dashboard type) */}
                  <div className={`absolute inset-x-0 top-0 h-[3px] ${s.iconBg.replace('/10','/60')}`} />
                  {/* Soft tinted top gradient */}
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${s.gradient} to-transparent opacity-70`} />

                  <div className="relative p-4 space-y-3">
                    {/* Header: shield icon + title + kebab */}
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${s.iconBg} ${s.iconBgHover} flex items-center justify-center shrink-0 transition-colors`}>
                        {React.cloneElement(s.icon as React.ReactElement, { className: `w-4 h-4 ${s.iconColor}` })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[13px] font-bold text-foreground truncate leading-tight tracking-tight">{db.name}</h3>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {db.description || 'No description'}
                        </p>
                      </div>
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        <KebabMenu
                          onDuplicate={() => duplicateDashboard(db.id)}
                          onShare={() => setSharePopoverId(db.id)}
                          onExport={() => exportDashboard(db)}
                          onDelete={() => setDeleteModalId(db.id)}
                        />
                      </div>
                    </div>

                    {/* Date · owner */}
                    <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3 h-3" />
                        {new Date(db.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <span className="opacity-40">•</span>
                      <span className="inline-flex items-center gap-1 truncate">
                        <User className="w-3 h-3" />
                        <span className="truncate">{db.ownerUsername}</span>
                      </span>
                    </div>

                    {/* Views count */}
                    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 flex items-center justify-between">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Views</div>
                      <div className="text-[15px] font-bold text-foreground tabular-nums leading-tight">
                        {fmtNum(db.viewCount || 0)}
                      </div>
                    </div>

                    {/* Tech label */}
                    <div className={`text-[11px] font-semibold ${techList.length > 0 ? s.iconColor : 'text-muted-foreground'}`}>
                      {techLabel}
                    </div>

                    {/* Bottom badges row */}
                    <div className="flex items-center flex-wrap gap-1.5 pt-1">
                      <TypeBadge type={db.dashboardType} />
                      <VisibilityBadge visibility={db.visibility} sharedWith={db.sharedWith} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {isActive ? 'Active' : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List View – Modern SaaS rows ── */
          <div className="space-y-2.5">
            {/* Column header */}
            <div className="hidden md:grid grid-cols-[1fr_minmax(120px,1.2fr)_130px_100px_150px_110px] gap-4 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Dashboard</span>
              <span>Description</span>
              <span className="text-center">Créé par</span>
              <span className="text-center">Visibilité</span>
              <span className="text-right">Dernière modification</span>
              <span className="text-center">Actions</span>
            </div>

            {filtered.map(db => (
              <div key={db.id}
                onClick={() => openDashboard(db.id)}
                className={`group cursor-pointer bg-card border border-border border-l-[3px] ${getDashboardTypeStyle(db.dashboardType).cardAccent} rounded-xl grid grid-cols-1 md:grid-cols-[1fr_minmax(120px,1.2fr)_130px_100px_150px_110px] gap-2 md:gap-4 items-center px-5 py-4 hover:shadow-md hover:-translate-y-[1px] transition-all duration-150 ${getDashboardTypeStyle(db.dashboardType).hoverBg}`}>
                {/* Name + type badge */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg ${getDashboardTypeStyle(db.dashboardType).iconBg} ${getDashboardTypeStyle(db.dashboardType).iconBgHover} flex items-center justify-center shrink-0 transition-colors`}>
                    {React.cloneElement(getDashboardTypeStyle(db.dashboardType).icon as React.ReactElement, { className: `w-4 h-4 ${getDashboardTypeStyle(db.dashboardType).iconColor}` })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground truncate">{db.name}</span>
                      <TypeBadge type={db.dashboardType} />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="min-w-0">
                  <span className="text-xs text-muted-foreground truncate block leading-relaxed">{db.description || '—'}</span>
                </div>

                {/* Created by */}
                <div className="flex justify-center">
                  <span className="text-xs text-foreground font-medium flex items-center gap-1.5 truncate">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                    {db.ownerUsername}
                  </span>
                </div>

                {/* Visibility */}
                <div className="flex justify-center">
                  <VisibilityBadge visibility={db.visibility} sharedWith={db.sharedWith} />
                </div>

                {/* Date */}
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">
                    {new Date(db.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex justify-center items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip><TooltipTrigger asChild>
                      <button onClick={() => openDashboard(db.id)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Voir</p></TooltipContent></Tooltip>

                    <Tooltip><TooltipTrigger asChild>
                      <button onClick={() => setEditModalId(db.id)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Modifier</p></TooltipContent></Tooltip>
                  </TooltipProvider>

                  <KebabMenu
                    onDuplicate={() => duplicateDashboard(db.id)}
                    onShare={() => setSharePopoverId(db.id)}
                    onExport={() => exportDashboard(db)}
                    onDelete={() => setDeleteModalId(db.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {sharePopoverId && (() => {
        const db = dashboards.find(d => d.id === sharePopoverId);
        return db ? <SharePopover db={db} onUpdate={updateSharing} onClose={() => setSharePopoverId(null)} /> : null;
      })()}

      {editModalId && (() => {
        const db = dashboards.find(d => d.id === editModalId);
        return db ? <EditMetadataModal db={db} onSave={updateMetadata} onClose={() => setEditModalId(null)} /> : null;
      })()}

      {deleteModalId && (() => {
        const db = dashboards.find(d => d.id === deleteModalId);
        return db ? (
          <DeleteConfirmModal
            name={db.name}
            onConfirm={() => deleteDashboard(db.id)}
            onClose={() => setDeleteModalId(null)}
          />
        ) : null;
      })()}
    </div>
  );
};

export default DashboardOverview;
