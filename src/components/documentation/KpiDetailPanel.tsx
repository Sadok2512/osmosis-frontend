import React, { useState } from 'react';
import {
  X, BookOpen, FlaskConical, ArrowUp, ArrowDown, Info, Clock,
  User, Hash, Shield, Layers, ChevronRight, ExternalLink, Pencil
} from 'lucide-react';
import type { KpiCatalogEntry, CounterEntry, UserRole } from './kpiCatalogTypes';
import { STATUS_CONFIG, VENDOR_COLORS, TECH_COLORS } from './kpiCatalogTypes';
import CounterModal from './CounterModal';

interface KpiDetailPanelProps {
  kpi: KpiCatalogEntry;
  onClose: () => void;
  onEdit?: () => void;
  userRole: UserRole;
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

const Field: React.FC<{ label: string; value: string | React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    <p className={`mt-0.5 text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
  </div>
);

const CounterChip: React.FC<{ counter: CounterEntry; onClick: () => void }> = ({ counter, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-primary/10 hover:text-primary text-xs font-mono text-foreground transition-all group"
  >
    <Hash className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
    {counter.name}
    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
  </button>
);

const NumDenSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  data: KpiCatalogEntry['numerator'];
  onCounterClick: (c: CounterEntry) => void;
}> = ({ title, icon, data, onCounterClick }) => (
  <Section title={title} icon={icon}>
    <div className="space-y-3">
      <Field label="Name" value={data.name} />
      <Field label="Description" value={data.description} />
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Counters</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.counters.length > 0 ? data.counters.map(c => (
            <CounterChip key={c.id} counter={c} onClick={() => onCounterClick(c)} />
          )) : (
            <span className="text-xs text-muted-foreground italic">No counters defined</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source" value={data.source} />
        <Field label="Granularity" value={data.granularity} />
      </div>
    </div>
  </Section>
);

const KpiDetailPanel: React.FC<KpiDetailPanelProps> = ({ kpi, onClose, onEdit, userRole }) => {
  const [selectedCounter, setSelectedCounter] = useState<CounterEntry | null>(null);
  const statusCfg = STATUS_CONFIG[kpi.status];
  const vendorCfg = VENDOR_COLORS[kpi.vendor] || { bg: 'bg-muted', text: 'text-muted-foreground' };
  const techCfg = TECH_COLORS[kpi.technology] || TECH_COLORS.ALL;

  return (
    <>
      <div className="h-full flex flex-col bg-card border-l border-border">
        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${techCfg.bg} ${techCfg.text}`}>
                  {kpi.technology}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${vendorCfg.bg} ${vendorCfg.text}`}>
                  {kpi.vendor}
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground leading-tight">{kpi.display_name}</h3>
              <p className="text-xs font-mono text-muted-foreground mt-1">{kpi.kpi_code}</p>
            </div>
            <div className="flex items-center gap-1.5 ml-3">
              {(userRole === 'editor' || userRole === 'creator') && onEdit && (
                <button onClick={onEdit} className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Edit KPI">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* General Info */}
          <Section title="General Information" icon={<BookOpen className="w-4 h-4" />}>
            <div className="space-y-3">
              <Field label="Description" value={kpi.description} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" value={kpi.category} />
                <Field label="Unit" value={kpi.unit} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Technology" value={kpi.technology} />
                <Field label="Vendor" value={kpi.vendor} />
              </div>
            </div>
          </Section>

          {/* Formula */}
          <Section title="Formula" icon={<FlaskConical className="w-4 h-4" />}>
            <div className="px-4 py-4 rounded-xl bg-muted/40 border border-border/50">
              <p className="text-sm font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                {kpi.formula || `${kpi.display_name} = Numerator / Denominator`}
              </p>
            </div>
            <Field label="Formula Type" value={kpi.formula_type} />
          </Section>

          {/* Numerator */}
          <NumDenSection
            title="Numerator"
            icon={<ArrowUp className="w-4 h-4" />}
            data={kpi.numerator}
            onCounterClick={setSelectedCounter}
          />

          {/* Denominator */}
          <NumDenSection
            title="Denominator"
            icon={<ArrowDown className="w-4 h-4" />}
            data={kpi.denominator}
            onCounterClick={setSelectedCounter}
          />

          {/* Metadata */}
          <Section title="Metadata" icon={<Info className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Created By" value={
                  <span className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-muted-foreground" />
                    {kpi.created_by}
                  </span>
                } />
                <Field label="Last Updated" value={
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    {kpi.last_updated}
                  </span>
                } />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Backend ID" value={kpi.id} mono />
                <Field label="Validation Status" value={
                  <span className={`inline-flex items-center gap-1 ${statusCfg.color}`}>
                    <Shield className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                } />
              </div>
              <Field label="Scope" value={
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  {kpi.scope}
                </span>
              } />
              {kpi.supported_levels.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Supported Levels</span>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {kpi.supported_levels.map(l => (
                      <span key={l} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{l}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {selectedCounter && (
        <CounterModal counter={selectedCounter} onClose={() => setSelectedCounter(null)} />
      )}
    </>
  );
};

export default KpiDetailPanel;
