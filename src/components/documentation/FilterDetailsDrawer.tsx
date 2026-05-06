import React, { useMemo } from 'react';
import { X, Shield, Layers, Database, Clock, User, Hash, MapPin, Radio, Cpu, Copy, Pencil, Trash2, Lock, Unlock, Globe, ShieldAlert } from 'lucide-react';
import type { NetworkFilter } from './filterTypes';
import { FILTER_STATUS_CONFIG, FILTER_PERMISSION_CONFIG, FILTER_VISIBILITY_CONFIG } from './filterTypes';
import ClusterPreviewTable from './cluster-builder/ClusterPreviewTable';
import type { TopologyConditionState } from './cluster-builder/TopologyConditionCard';

interface FilterDetailsDrawerProps {
  filter: NetworkFilter;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 pb-2 border-b border-border/50">
      <span className="text-primary">{icon}</span>
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
    </div>
    {children}
  </div>
);

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  vendor: <Cpu className="w-3 h-3" />,
  dor: <MapPin className="w-3 h-3" />,
  plaque: <Layers className="w-3 h-3" />,
  band: <Radio className="w-3 h-3" />,
  sites: <Database className="w-3 h-3" />,
  cells: <Database className="w-3 h-3" />,
  pci: <Hash className="w-3 h-3" />,
  eci: <Hash className="w-3 h-3" />,
  nci: <Hash className="w-3 h-3" />,
};

const FilterDetailsDrawer: React.FC<FilterDetailsDrawerProps> = ({ filter, onClose, onEdit, onDuplicate, onDelete }) => {
  const fallbackCfg = { label: '—', color: 'text-muted-foreground', bg: 'bg-muted', icon: '' };
  const statusCfg = FILTER_STATUS_CONFIG[filter.status] ?? { ...fallbackCfg, label: filter.status || '—' };
  const permCfg = FILTER_PERMISSION_CONFIG[filter.permission] ?? { ...fallbackCfg, label: filter.permission || '—' };
  const visCfg = FILTER_VISIBILITY_CONFIG[filter.visibility] ?? { ...fallbackCfg, label: filter.visibility || '—' };
  const isLocked = filter.permission === 'locked';
  const previewConditions = useMemo<TopologyConditionState[]>(() => (
    (filter.topology || []).map((cond, index) => ({
      id: `${filter.id}-preview-${index}`,
      field: cond.dimension,
      operator: (cond.operator as string) === 'not_in' || (cond.operator as string) === 'NOT IN' ? 'NOT IN' : 'IN',
      inputMode: 'search',
      values: cond.values || [],
    }))
  ), [filter.id, filter.topology]);

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${permCfg.bg} ${permCfg.color}`}>
                {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {permCfg.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${visCfg.bg} ${visCfg.color}`}>
                {filter.visibility === 'public' ? <Globe className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {visCfg.label}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{filter.id}</span>
            </div>
            <h3 className="text-lg font-bold text-foreground leading-tight">{filter.name}</h3>
            {filter.description && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{filter.description}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors ml-3">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Overview */}
        <Section title="Overview" icon={<Shield className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Conditions</span>
              <p className="mt-0.5 text-2xl font-black text-foreground">{filter.condition_count}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sites</span>
              <p className="mt-0.5 text-2xl font-black text-primary">{(filter as any).site_count?.toLocaleString() ?? '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cells</span>
              <p className="mt-0.5 text-2xl font-black text-primary">{filter.matching_objects?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </Section>

        {/* Access & Ownership */}
        <Section title="Access & Ownership" icon={<User className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Created By</span>
              <p className="mt-0.5 text-sm text-foreground">{filter.created_by}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Permission</span>
              <p className={`mt-0.5 text-sm font-semibold inline-flex items-center gap-1 ${permCfg.color}`}>
                {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {permCfg.label}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Visibility</span>
              <p className={`mt-0.5 text-sm font-semibold inline-flex items-center gap-1 ${visCfg.color}`}>
                {filter.visibility === 'public' ? <Globe className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {visCfg.label}
              </p>
            </div>
          </div>
        </Section>

        {/* Topology */}
        {filter.topology.length > 0 && (
          <Section title="Topology Conditions" icon={<Layers className="w-4 h-4" />}>
            <div className="space-y-3">
              {filter.topology.map((cond, i) => (
                <div key={i} className="rounded-xl bg-muted/30 border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {DIMENSION_ICONS[cond.dimension] || <Database className="w-3 h-3" />}
                    <span className="text-xs font-bold text-foreground capitalize">{cond.dimension}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{cond.operator}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cond.values.map(v => (
                      <span key={v} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">{v}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {filter.topology.length > 0 && (
          <Section title="Filtered Elements" icon={<Database className="w-4 h-4" />}>
            <ClusterPreviewTable
              topoConditions={previewConditions}
              paramConditions={filter.parameters?.length > 0
                ? filter.parameters.map(p => ({ parameter: p.parameter, operator: p.operator, value: p.value, value2: (p as any).value2 }))
                : undefined}
              maxRows={60}
              title="Filtered elements preview"
            />
          </Section>
        )}

        {/* Parameters */}
        {filter.parameters.length > 0 && (
          <Section title="Parameter Conditions" icon={<Database className="w-4 h-4" />}>
            <div className="space-y-2">
              {filter.parameters.map(cond => (
                <div key={cond.id} className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border/50 px-4 py-2.5">
                  <span className="text-xs font-semibold text-foreground flex-1">{cond.parameter}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-accent text-accent-foreground font-mono font-bold">{cond.operator}</span>
                  <span className="text-xs font-mono text-primary font-bold">{cond.value}{cond.value2 ? ` — ${cond.value2}` : ''}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Audit */}
        <Section title="Audit Information" icon={<Clock className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Created</span>
              <p className="mt-0.5 text-sm text-foreground">{filter.created_at}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Modified By</span>
              <p className="mt-0.5 text-sm text-foreground">{filter.updated_by}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Modified</span>
              <p className="mt-0.5 text-sm text-foreground">{filter.updated_at}</p>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 px-6 py-4 border-t border-border flex items-center gap-2">
        <button
          onClick={onEdit}
          disabled={isLocked}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-opacity ${
            isLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
        >
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {isLocked ? 'Locked' : 'Edit'}
        </button>
        <button onClick={onDuplicate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <div className="flex-1" />
        <button onClick={onDelete} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
};

export default FilterDetailsDrawer;
