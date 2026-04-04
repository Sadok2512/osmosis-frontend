import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Filter as FilterIcon, SlidersHorizontal,
  MoreHorizontal, Eye, Pencil, Copy, Trash2, Archive,
  Lock, Unlock, Globe, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import type { NetworkFilter, FilterStatus } from './filterTypes';
import { MOCK_FILTERS, FILTER_STATUS_CONFIG, FILTER_PERMISSION_CONFIG, FILTER_VISIBILITY_CONFIG } from './filterTypes';
import FilterDetailsDrawer from './FilterDetailsDrawer';
import CreateFilterWizard from './CreateFilterWizard';

const FilterRepositoryView: React.FC = () => {
  const [filters, setFilters] = useState<NetworkFilter[]>(MOCK_FILTERS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus | 'all'>('all');
  const [selectedFilter, setSelectedFilter] = useState<NetworkFilter | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFilter, setEditFilter] = useState<NetworkFilter | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'updated_at' | 'created_at'>('updated_at');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = filters.filter(f => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.created_by.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || f.status === statusFilter;
      return matchSearch && matchStatus;
    });
    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'updated_at') return b.updated_at.localeCompare(a.updated_at);
      return b.created_at.localeCompare(a.created_at);
    });
    return result;
  }, [filters, search, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: filters.length,
    active: filters.filter(f => f.status === 'active').length,
    draft: filters.filter(f => f.status === 'draft').length,
    recent: filters.filter(f => {
      const d = new Date(f.updated_at);
      const week = new Date(); week.setDate(week.getDate() - 7);
      return d >= week;
    }).length,
  }), [filters]);

  const handleCreate = (data: any) => {
    const newFilter: NetworkFilter = {
      id: `f-${Date.now()}`, name: data.name, description: data.description, status: data.status,
      permission: 'editable', visibility: 'private',
      created_by: 'admin', created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10), updated_by: 'admin',
      topology: data.topology, parameters: data.parameters, logic: data.logic,
      condition_count: data.topology.length + data.parameters.length, matching_objects: Math.floor(Math.random() * 2000),
    };
    setFilters(prev => [newFilter, ...prev]);
    setShowCreate(false);
    toast.success(`Filter "${data.name}" created`);
  };

  const handleEdit = (data: any) => {
    if (!editFilter) return;
    setFilters(prev => prev.map(f => f.id === editFilter.id ? {
      ...f, ...data, updated_at: new Date().toISOString().slice(0, 10), updated_by: 'admin',
      condition_count: data.topology.length + data.parameters.length,
    } : f));
    setEditFilter(null);
    setSelectedFilter(null);
    toast.success(`Filter "${data.name}" updated`);
  };

  const handleDuplicate = (filter: NetworkFilter) => {
    const dup: NetworkFilter = {
      ...filter, id: `f-${Date.now()}`, name: `${filter.name} (Copy)`,
      status: 'draft', permission: 'editable', created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10),
    };
    setFilters(prev => [dup, ...prev]);
    toast.success(`Filter duplicated as "${dup.name}"`);
    setActionMenuId(null);
  };

  const handleDelete = (filter: NetworkFilter) => {
    if (!confirm(`Delete filter "${filter.name}"?`)) return;
    setFilters(prev => prev.filter(f => f.id !== filter.id));
    if (selectedFilter?.id === filter.id) setSelectedFilter(null);
    toast.success(`Filter "${filter.name}" deleted`);
    setActionMenuId(null);
  };

  const handleArchive = (filter: NetworkFilter) => {
    setFilters(prev => prev.map(f => f.id === filter.id ? { ...f, status: f.status === 'archived' ? 'active' : 'archived' as FilterStatus } : f));
    toast.success(`Filter "${filter.name}" ${filter.status === 'archived' ? 'unarchived' : 'archived'}`);
    setActionMenuId(null);
  };

  const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="rounded-xl border border-border bg-card p-4 flex-1 min-w-[120px]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
    </div>
  );

  // Grid template for the table
  const gridCols = 'grid-cols-[1fr_100px_50px_70px_70px_65px_60px_55px_36px]';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <SlidersHorizontal className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground">Filter Repository</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Create and manage reusable network filters</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search filters…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-56 pl-10 pr-4 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer">
                <option value="updated_at">Recent</option>
                <option value="name">Name</option>
                <option value="created_at">Created</option>
              </select>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Create Filter
              </button>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <StatCard label="Total Filters" value={stats.total} color="text-foreground" />
            <StatCard label="Active" value={stats.active} color="text-emerald-500" />
            <StatCard label="Draft" value={stats.draft} color="text-muted-foreground" />
            <StatCard label="Modified This Week" value={stats.recent} color="text-primary" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`${selectedFilter ? 'w-1/2 xl:w-3/5' : 'w-full'} flex flex-col overflow-hidden transition-all duration-300`}>
          {/* Column Header */}
          <div className={`shrink-0 grid ${gridCols} gap-1 px-4 py-1.5 border-b border-border bg-muted/30`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Filter</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Topology</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cond.</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Author</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Modified</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Perm.</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Visib.</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
            <span />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <FilterIcon className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No filters found</p>
                <p className="text-xs mt-1">Create your first filter to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map(filter => {
                  const isSelected = selectedFilter?.id === filter.id;
                  const statusCfg = FILTER_STATUS_CONFIG[filter.status];
                  const permCfg = FILTER_PERMISSION_CONFIG[filter.permission];
                  const visCfg = FILTER_VISIBILITY_CONFIG[filter.visibility];
                  const topoSummary = filter.topology.map(t => t.values.slice(0, 2).join(', ')).join(' • ');
                  const isLocked = filter.permission === 'locked';

                  return (
                    <div key={filter.id} className="relative">
                      <button
                        onClick={() => setSelectedFilter(isSelected ? null : filter)}
                        className={`w-full grid ${gridCols} gap-1 px-4 py-1.5 text-left transition-all hover:bg-muted/40 group ${
                          isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'
                        }`}
                      >
                        {/* Name + Desc */}
                        <div className="min-w-0 flex flex-col justify-center">
                          <h3 className="text-xs font-semibold text-foreground truncate leading-tight">{filter.name}</h3>
                          <p className="text-[9px] text-muted-foreground truncate leading-tight">{filter.description}</p>
                        </div>
                        {/* Topology */}
                        <div className="flex items-center">
                          <span className="text-[9px] text-muted-foreground truncate">{topoSummary || '—'}</span>
                        </div>
                        {/* Conditions */}
                        <div className="flex items-center">
                          <span className="text-[10px] font-bold text-foreground px-1.5 py-0 rounded bg-muted">{filter.condition_count}</span>
                        </div>
                        {/* Author */}
                        <div className="flex items-center">
                          <span className="text-[9px] text-muted-foreground truncate">{filter.created_by}</span>
                        </div>
                        {/* Modified */}
                        <div className="flex items-center">
                          <span className="text-[9px] text-muted-foreground">{filter.updated_at}</span>
                        </div>
                        {/* Permission */}
                        <div className="flex items-center">
                          <span className={`inline-flex items-center gap-0.5 text-[8px] font-semibold px-1.5 py-0 rounded ${permCfg.bg} ${permCfg.color}`} title={permCfg.label}>
                            {isLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                            {permCfg.label}
                          </span>
                        </div>
                        {/* Visibility */}
                        <div className="flex items-center">
                          <span className={`inline-flex items-center gap-0.5 text-[8px] font-semibold px-1.5 py-0 rounded ${visCfg.bg} ${visCfg.color}`} title={visCfg.label}>
                            {filter.visibility === 'public' ? <Globe className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                            {visCfg.label}
                          </span>
                        </div>
                        {/* Status */}
                        <div className="flex items-center">
                          <span className={`text-[8px] font-bold px-1.5 py-0 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                        {/* Spacer for actions */}
                        <div />
                      </button>

                      {/* Action Menu */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <button
                          onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === filter.id ? null : filter.id); }}
                          className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {actionMenuId === filter.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                            <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border bg-card shadow-xl py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                              <button onClick={() => { setSelectedFilter(filter); setActionMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
                                <Eye className="w-3.5 h-3.5" /> View Details
                              </button>
                              <button
                                onClick={() => { if (!isLocked) { setEditFilter(filter); setActionMenuId(null); } }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${isLocked ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-foreground hover:bg-muted'}`}
                                disabled={isLocked}
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit {isLocked && <Lock className="w-3 h-3 ml-auto" />}
                              </button>
                              <button onClick={() => handleDuplicate(filter)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
                                <Copy className="w-3.5 h-3.5" /> Duplicate
                              </button>
                              <button onClick={() => handleArchive(filter)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors">
                                <Archive className="w-3.5 h-3.5" /> {filter.status === 'archived' ? 'Unarchive' : 'Archive'}
                              </button>
                              <div className="border-t border-border my-1" />
                              <button onClick={() => handleDelete(filter)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 px-6 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{filtered.length} filter{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Detail Drawer */}
        {selectedFilter && (
          <div className="w-1/2 xl:w-2/5 overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <FilterDetailsDrawer
              filter={selectedFilter}
              onClose={() => setSelectedFilter(null)}
              onEdit={() => { if (selectedFilter.permission !== 'locked') { setEditFilter(selectedFilter); setSelectedFilter(null); } }}
              onDuplicate={() => handleDuplicate(selectedFilter)}
              onDelete={() => handleDelete(selectedFilter)}
            />
          </div>
        )}
      </div>

      {showCreate && <CreateFilterWizard onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editFilter && (
        <CreateFilterWizard
          onSubmit={handleEdit}
          onClose={() => setEditFilter(null)}
          initialData={editFilter}
          editMode
        />
      )}
    </div>
  );
};

export default FilterRepositoryView;