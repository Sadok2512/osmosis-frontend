import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Plus, Filter as FilterIcon, MoreVertical, Eye, Pencil, Copy,
  Trash2, Star, ChevronLeft, ChevronRight, BarChart3, Loader2, Globe,
  Lock, Users, FolderOpen, CheckCircle2, Network, Map as MapIcon,
  SlidersHorizontal, RotateCcw, ShieldCheck, LayoutGrid, List as ListIcon,
  Calendar, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { NetworkFilter, FilterVisibility } from './filterTypes';
import FilterDetailsDrawer from './FilterDetailsDrawer';
import ClusterBuilderWizard from './ClusterBuilderWizard';
import { fetchFilters, createFilter, updateFilter, deleteFilter, duplicateFilter, countFilterMatching } from '@/services/filterService';
import { reloadFilter } from '@/stores/investigatorFilterCache';

/* ─────────── Helpers (identical to filter2) ─────────── */
const TECH_BADGE: Record<string, { label: string; cls: string }> = {
  '2G': { label: '2G', cls: 'bg-amber-500/10 text-amber-600' },
  '3G': { label: '3G', cls: 'bg-orange-500/10 text-orange-600' },
  '4G': { label: '4G', cls: 'bg-blue-500/10 text-blue-600' },
  '5G': { label: '5G', cls: 'bg-emerald-500/10 text-emerald-600' },
};

const VENDOR_COLORS: Record<string, string> = {
  Nokia: 'text-blue-600',
  Ericsson: 'text-sky-600',
  Huawei: 'text-red-500',
  Samsung: 'text-indigo-600',
};

const ITEMS_PER_PAGE = 8;

function inferTech(filter: NetworkFilter): string[] {
  const bands = filter.topology.find(t => t.dimension === 'band')?.values || [];
  const techs = new Set<string>();
  bands.forEach(b => {
    if (b.startsWith('NR')) techs.add('5G');
    else if (b.startsWith('LTE')) techs.add('4G');
    else if (b.includes('UMTS') || b.includes('3G')) techs.add('3G');
    else if (b.includes('GSM') || b.includes('2G')) techs.add('2G');
  });
  return techs.size > 0 ? Array.from(techs) : ['All'];
}

function inferVendor(filter: NetworkFilter): string {
  const v = filter.topology.find(t => t.dimension === 'vendor')?.values;
  return v && v.length > 0 ? v.join(', ') : 'All';
}

function inferRegion(filter: NetworkFilter): string {
  const dor = filter.topology.find(t => t.dimension === 'dor')?.values;
  const plaque = filter.topology.find(t => t.dimension === 'plaque')?.values;
  if (dor && dor.length > 0) return dor[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/De /g, 'de ');
  if (plaque && plaque.length > 0) return plaque[0];
  return 'All';
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
const FilterRepositoryView3: React.FC = () => {
  const [filters, setFilters] = useState<NetworkFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState<string>('All');
  const [vendorFilter, setVendorFilter] = useState<string>('All');
  const [visibilityFilter, setVisibilityFilter] = useState<'All' | FilterVisibility>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'draft' | 'active' | 'archived'>('All');
  const [ownerFilter, setOwnerFilter] = useState<'All' | 'Me'>('All');
  const [selectedFilter, setSelectedFilter] = useState<NetworkFilter | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFilter, setEditFilter] = useState<NetworkFilter | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const currentUser = useMemo(() => {
    try { return localStorage.getItem('osmosis_username') || 'system'; } catch { return 'system'; }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetchFilters({ limit: 500 });
      setFilters(Array.isArray(resp?.filters) ? resp.filters : []);
    } catch (err) {
      console.warn('[FilterCatalog3] Failed to load filters:', err);
      toast.error('Impossible de charger les filtres');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFilters(); }, [loadFilters]);

  const allVendors = useMemo(() => {
    const s = new Set<string>();
    filters.forEach(f => { const v = inferVendor(f); if (v !== 'All') v.split(', ').forEach(x => s.add(x)); });
    return ['All', ...Array.from(s).sort()];
  }, [filters]);

  const allTechs = ['All', '2G', '3G', '4G', '5G'];

  const filtered = useMemo(() => {
    return filters.filter(f => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.created_by.toLowerCase().includes(q) ||
        inferRegion(f).toLowerCase().includes(q) ||
        inferVendor(f).toLowerCase().includes(q);
      const matchTech = techFilter === 'All' || inferTech(f).includes(techFilter);
      const matchVendor = vendorFilter === 'All' || inferVendor(f).includes(vendorFilter);
      const matchVisibility = visibilityFilter === 'All' || f.visibility === visibilityFilter;
      const matchStatus = statusFilter === 'All' || f.status === statusFilter;
      const matchOwner = ownerFilter === 'All' || f.created_by === currentUser;
      return matchSearch && matchTech && matchVendor && matchVisibility && matchStatus && matchOwner;
    });
  }, [filters, search, techFilter, vendorFilter, visibilityFilter, statusFilter, ownerFilter, currentUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, techFilter, vendorFilter, visibilityFilter, statusFilter, ownerFilter]);

  const stats = useMemo(() => ({
    total: filters.length,
    public: filters.filter(f => f.visibility === 'public').length,
    private: filters.filter(f => f.visibility === 'private').length,
    active: filters.filter(f => f.status === 'active').length,
  }), [filters]);

  const activeFilterCount = [
    search.trim(),
    techFilter !== 'All' ? techFilter : '',
    vendorFilter !== 'All' ? vendorFilter : '',
    visibilityFilter !== 'All' ? visibilityFilter : '',
    statusFilter !== 'All' ? statusFilter : '',
    ownerFilter !== 'All' ? ownerFilter : '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch(''); setTechFilter('All'); setVendorFilter('All');
    setVisibilityFilter('All'); setStatusFilter('All'); setOwnerFilter('All');
  };

  const handleCreate = async (data: any) => {
    try {
      const created = await createFilter({
        name: data.name, description: data.description, status: data.status,
        topology: data.topology, parameters: data.parameters, logic: data.logic,
      });
      if (created?.id && data.visibility) {
        try { await updateFilter(created.id, { visibility: data.visibility }); } catch {}
      }
      setShowCreate(false);
      toast.success(`Cluster "${data.name}" créé`);
      if (data.topology?.length > 0) countFilterMatching(created.id).catch(() => {});
      reloadFilter('CLUSTER');
      loadFilters();
    } catch { toast.error('Erreur lors de la création du cluster'); }
  };

  const handleEdit = async (data: any) => {
    if (!editFilter) return;
    try {
      await updateFilter(editFilter.id, {
        name: data.name, description: data.description, status: data.status,
        visibility: data.visibility, topology: data.topology,
        parameters: data.parameters, logic: data.logic,
      });
      setEditFilter(null); setSelectedFilter(null);
      toast.success(`Cluster "${data.name}" mis à jour`);
      reloadFilter('CLUSTER');
      loadFilters();
    } catch { toast.error('Erreur lors de la mise à jour'); }
  };

  const handleDuplicate = async (filter: NetworkFilter) => {
    try {
      await duplicateFilter(filter.id);
      toast.success('Cluster dupliqué');
      setActionMenuId(null);
      loadFilters();
    } catch { toast.error('Erreur lors de la duplication'); }
  };

  const handleDelete = async (filter: NetworkFilter) => {
    if (!confirm(`Supprimer le cluster "${filter.name}" ?`)) return;
    try {
      await deleteFilter(filter.id);
      if (selectedFilter?.id === filter.id) setSelectedFilter(null);
      toast.success('Cluster supprimé');
      setActionMenuId(null);
      loadFilters();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── SUB-HEADER (matches Network Explorer breadcrumb pattern) ── */}
      <div className="shrink-0 px-8 pt-5 pb-4 bg-background border-b border-border">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black tracking-tight text-foreground truncate">
                  Network References / filter3
                </h2>
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-black uppercase tracking-wider text-primary">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reusable RAN scope filters for dashboards, investigations and KPI reports.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Create filter3
          </button>
        </div>

        {/* ── Stat cards (Network Explorer style) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<FolderOpen className="w-4 h-4 text-muted-foreground" />} label="Total filter3" value={stats.total} tone="muted" />
          <StatCard icon={<Globe className="w-4 h-4 text-emerald-600" />} label="Public" value={stats.public} tone="emerald" />
          <StatCard icon={<Lock className="w-4 h-4 text-amber-600" />} label="Private" value={stats.private} tone="amber" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4 text-sky-600" />} label="Active" value={stats.active} tone="sky" />
        </div>
      </div>

      {/* ── Filter chips bar ── */}
      <div className="shrink-0 px-8 py-3 bg-card/50 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search filter3 by name, owner, region or vendor"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full rounded-full border border-border bg-muted/40 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-colors"
            />
          </div>

          <ChipGroup label="Tech" options={allTechs} value={techFilter} onChange={setTechFilter} />
          <ChipGroup label="Vendor" options={allVendors} value={vendorFilter} onChange={setVendorFilter} />
          <ChipGroup
            label="Visibility"
            options={['All', 'public', 'private']}
            value={visibilityFilter}
            onChange={v => setVisibilityFilter(v as any)}
            renderOption={o => o === 'public' ? 'Public' : o === 'private' ? 'Private' : 'All'}
          />
          <ChipGroup
            label="Status"
            options={['All', 'draft', 'active', 'archived']}
            value={statusFilter}
            onChange={v => setStatusFilter(v as any)}
            renderOption={o => o === 'All' ? 'All' : o.charAt(0).toUpperCase() + o.slice(1)}
          />
          <ChipGroup label="Owner" options={['All', 'Me']} value={ownerFilter} onChange={v => setOwnerFilter(v as any)} />

          <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-muted-foreground">
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            {filtered.length.toLocaleString('fr-FR')} shown
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 m-6 mt-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-semibold">Loading Network References / filter3…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
            <div className="mb-4 rounded-2xl bg-muted p-5">
              <FilterIcon className="w-10 h-10 opacity-40" />
            </div>
            <p className="text-base font-bold text-foreground">No filter3 matches this view</p>
            <p className="text-xs mt-1 opacity-70">Adjust criteria or create a reusable Network References / filter3 entry.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create filter3
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_0.7fr_0.7fr_0.7fr_0.9fr_1fr_0.85fr_0.8fr_88px] px-5 py-3 border-b border-border bg-muted/30">
              {['filter3', 'Sites', 'Cells', 'Tech', 'Vendor', 'State', 'Owner', 'Updated', 'Actions'].map(h => (
                <span key={h} className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{h}</span>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {paginated.map(filter => {
                const techs = inferTech(filter);
                const vendor = inferVendor(filter);
                const region = inferRegion(filter);
                const vendorParts = vendor.split(', ');
                const isPublic = filter.visibility === 'public';

                return (
                  <div
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className="grid grid-cols-[2fr_0.7fr_0.7fr_0.7fr_0.9fr_1fr_0.85fr_0.8fr_88px] px-5 py-4 items-center cursor-pointer group hover:bg-primary/[0.04] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-foreground ${
                          filter.status === 'active' ? 'bg-primary'
                          : filter.status === 'draft' ? 'bg-amber-500'
                          : 'bg-muted-foreground/60'
                        }`}>
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <span className="text-[13px] font-bold text-foreground truncate">{filter.name}</span>
                      </div>
                      {filter.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-1 ml-10">{filter.description}</p>
                      )}
                    </div>

                    <div className="text-xs tabular-nums">
                      {(filter as any).site_count != null
                        ? <span className="font-bold text-foreground">{((filter as any).site_count).toLocaleString('fr-FR')}</span>
                        : <span className="text-muted-foreground/50">—</span>}
                    </div>

                    <div className="text-xs tabular-nums">
                      {filter.matching_objects != null
                        ? <span className="font-bold text-foreground">{filter.matching_objects.toLocaleString('fr-FR')}</span>
                        : <span className="text-muted-foreground/50">—</span>}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {techs.map(t => {
                        const badge = TECH_BADGE[t];
                        return badge ? (
                          <span key={t} className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                        ) : (
                          <span key={t} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">All</span>
                        );
                      })}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {vendorParts.map(v => (
                          <span key={v} className={`text-xs font-semibold truncate ${VENDOR_COLORS[v] || 'text-foreground'}`}>{v}</span>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">{region}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPublic ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        filter.status === 'active' ? 'bg-primary/10 text-primary' :
                        filter.status === 'draft' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {filter.status.charAt(0).toUpperCase() + filter.status.slice(1)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium truncate">{filter.created_by}</span>
                    </div>

                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(filter.updated_at || filter.created_at)}</span>

                    <div className="relative flex justify-end gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedFilter(filter); }}
                        className="p-1.5 rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground transition-all"
                        title="Open"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === filter.id ? null : filter.id); }}
                        className="p-1.5 rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground transition-all"
                        title="More actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {actionMenuId === filter.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-card shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <ActionItem icon={<Eye className="w-3.5 h-3.5" />} label="Open" onClick={() => { setSelectedFilter(filter); setActionMenuId(null); }} />
                            <ActionItem
                              icon={<Pencil className="w-3.5 h-3.5" />}
                              label="Edit"
                              disabled={filter.permission === 'locked'}
                              onClick={() => { if (filter.permission !== 'locked') { setEditFilter(filter); setActionMenuId(null); } }}
                            />
                            <ActionItem icon={<Copy className="w-3.5 h-3.5" />} label="Duplicate" onClick={() => handleDuplicate(filter)} />
                            <ActionItem
                              icon={<BarChart3 className="w-3.5 h-3.5" />}
                              label="Recalculate scope"
                              onClick={async () => {
                                setActionMenuId(null);
                                try {
                                  const r = await countFilterMatching(filter.id);
                                  toast.success(`${r.cells.toLocaleString('fr-FR')} cells, ${r.sites.toLocaleString('fr-FR')} sites`);
                                  loadFilters();
                                } catch { toast.error('Erreur lors du calcul'); }
                              }}
                            />
                            <ActionItem icon={<Star className="w-3.5 h-3.5" />} label="Favorite" onClick={() => setActionMenuId(null)} />
                            <div className="border-t border-border my-1" />
                            <ActionItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" tone="destructive" onClick={() => handleDelete(filter)} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-[11px] text-muted-foreground">
                Showing {Math.min(filtered.length, (page - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(filtered.length, page * ITEMS_PER_PAGE)} of {filtered.length} filters
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    page === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
                  }`}>{p}</button>
                ))}
                {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">…</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-[2px]" onClick={() => setSelectedFilter(null)}>
          <div className="h-full w-[min(860px,92vw)] bg-card shadow-2xl animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
            <FilterDetailsDrawer
              filter={selectedFilter}
              onClose={() => setSelectedFilter(null)}
              onEdit={() => { if (selectedFilter.permission !== 'locked') { setEditFilter(selectedFilter); setSelectedFilter(null); } }}
              onDuplicate={() => handleDuplicate(selectedFilter)}
              onDelete={() => handleDelete(selectedFilter)}
            />
          </div>
        </div>
      )}

      {showCreate && <ClusterBuilderWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editFilter && <ClusterBuilderWizard onSubmit={handleEdit} onClose={() => setEditFilter(null)} initialData={editFilter} editMode />}
    </div>
  );
};

/* ─────────── Sub-components ─────────── */
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'muted' | 'emerald' | 'amber' | 'sky';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, tone }) => {
  const tones = {
    muted: { card: 'bg-card', iconBg: 'bg-muted', label: 'text-muted-foreground' },
    emerald: { card: 'bg-emerald-500/5 border-border', iconBg: 'bg-emerald-500/10', label: 'text-emerald-700' },
    amber: { card: 'bg-amber-500/5 border-border', iconBg: 'bg-amber-500/10', label: 'text-amber-700' },
    sky: { card: 'bg-sky-500/5 border-border', iconBg: 'bg-sky-500/10', label: 'text-sky-700' },
  }[tone];
  return (
    <div className={`rounded-xl border border-border p-3 flex items-center gap-3 ${tones.card}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones.iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${tones.label}`}>{label}</div>
        <div className="text-lg font-black text-foreground leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
};

interface ChipGroupProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  renderOption?: (o: string) => string;
}

const ChipGroup: React.FC<ChipGroupProps> = ({ label, options, value, onChange, renderOption }) => (
  <div className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-2">
    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">{label}</span>
    {options.map(o => (
      <button
        key={o}
        onClick={() => onChange(o)}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          value === o ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        {renderOption ? renderOption(o) : o}
      </button>
    ))}
  </div>
);

interface ActionItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'destructive';
}

const ActionItem: React.FC<ActionItemProps> = ({ icon, label, onClick, disabled, tone = 'default' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
      disabled ? 'text-muted-foreground/40 cursor-not-allowed' :
      tone === 'destructive' ? 'text-destructive hover:bg-destructive/5' :
      'text-foreground hover:bg-muted/40'
    }`}
  >
    {icon} {label}
  </button>
);

export default FilterRepositoryView3;
