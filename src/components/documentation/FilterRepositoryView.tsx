import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Filter as FilterIcon, SlidersHorizontal,
  MoreVertical, Eye, Pencil, Copy, Trash2, Archive,
  Lock, Unlock, Globe, ShieldAlert, ArrowUpDown, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
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
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
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
      let va: string, vb: string;
      if (sortBy === 'name') { va = a.name; vb = b.name; }
      else if (sortBy === 'updated_at') { va = a.updated_at; vb = b.updated_at; }
      else { va = a.created_at; vb = b.created_at; }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return result;
  }, [filters, search, statusFilter, sortBy, sortDir]);

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

  const toggleSort = () => {
    if (sortBy === 'name') { setSortBy('updated_at'); setSortDir('desc'); }
    else if (sortBy === 'updated_at') { setSortBy('created_at'); setSortDir('desc'); }
    else { setSortBy('name'); setSortDir('asc'); }
  };

  // Auto-select first filter
  React.useEffect(() => {
    if (!selectedFilter && filtered.length > 0) setSelectedFilter(filtered[0]);
  }, [filtered]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── HEADER ── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-foreground">Filter Repository</h1>
                <p className="text-[10px] text-muted-foreground mt-0.5">Create and manage reusable network filters • {filters.length} Filters</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search filters…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-56 pl-10 pr-4 py-2 rounded-full border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Create Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── WORKSPACE: Table + Detail ── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">

        {/* ── TABLE ── */}
        <ResizablePanel defaultSize={65} minSize={40} className="flex flex-col min-w-0 border-r border-border">
          {/* Table controls */}
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <button onClick={toggleSort}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors">
                <ArrowUpDown className="w-3 h-3" /> Sort: {sortBy === 'name' ? 'Name' : sortBy === 'updated_at' ? 'Modified' : 'Created'}
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{filtered.length} Filters</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <FilterIcon className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No filters found</p>
                <p className="text-xs mt-1">Create your first filter to get started</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-card border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Filter Name & Description
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Topology
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                      Cond.
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden xl:table-cell">
                      Author
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Permission
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(filter => {
                    const isSelected = selectedFilter?.id === filter.id;
                    const statusCfg = FILTER_STATUS_CONFIG[filter.status] ?? FILTER_STATUS_CONFIG.draft;
                    const permCfg = FILTER_PERMISSION_CONFIG[filter.permission ?? 'editable'];
                    const isLocked = filter.permission === 'locked';
                    const topoSummary = filter.topology.map(t => t.values.slice(0, 2).join(', ')).join(' • ');

                    return (
                      <tr key={filter.id}
                        onClick={() => setSelectedFilter(filter)}
                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                      >
                        {/* Name + Desc */}
                        <td className="px-5 py-3">
                          <p className="text-sm font-bold text-foreground truncate">{filter.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground truncate">{filter.description}</span>
                          </div>
                        </td>
                        {/* Topology */}
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-[10px] text-muted-foreground truncate block max-w-[120px]">{topoSummary || '—'}</span>
                        </td>
                        {/* Conditions */}
                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-[10px] font-bold text-foreground px-1.5 py-0.5 rounded bg-muted">{filter.condition_count}</span>
                        </td>
                        {/* Author */}
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <span className="text-xs text-foreground">{filter.created_by}</span>
                        </td>
                        {/* Permission */}
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${permCfg.bg} ${permCfg.color}`}>
                            {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            {permCfg.label}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${filter.status === 'active' ? 'bg-green-500' : filter.status === 'archived' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
                            <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-3 relative">
                          <button
                            onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === filter.id ? null : filter.id); }}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer stats */}
          <div className="shrink-0 px-5 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{filtered.length} / {filters.length} Filters</span>
            <div className="flex items-center gap-3">
              {(['active', 'draft', 'archived'] as FilterStatus[]).map(key => {
                const cfg = FILTER_STATUS_CONFIG[key];
                const count = filtered.filter(f => f.status === key).length;
                if (!count) return null;
                return (
                  <span key={key} className={`text-[10px] font-medium ${cfg.color}`}>
                    {cfg.label}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden md:flex" />

        {/* ── DETAIL PANEL ── */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={60} className="flex flex-col overflow-hidden bg-card hidden md:flex">
          {selectedFilter ? (
            <FilterDetailsDrawer
              filter={selectedFilter}
              onClose={() => setSelectedFilter(null)}
              onEdit={() => { if (selectedFilter.permission !== 'locked') { setEditFilter(selectedFilter); setSelectedFilter(null); } }}
              onDuplicate={() => handleDuplicate(selectedFilter)}
              onDelete={() => handleDelete(selectedFilter)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <SlidersHorizontal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a filter</p>
                <p className="text-xs mt-1 opacity-60">Click on a filter to view its details</p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

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
