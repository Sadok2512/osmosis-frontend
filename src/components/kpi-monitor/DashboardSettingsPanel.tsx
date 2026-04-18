import React, { useState } from 'react';
import {
  Calendar as CalendarIcon, Filter, GitBranch, LayoutGrid, Bell,
  ChevronDown, ChevronRight, X, Activity, Check, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SplitDimension } from './types';

const PERIODS = [
  { label: '24h', value: '24h' },
  { label: '7 jours', value: '7d' },
  { label: '14 jours', value: '14d' },
  { label: '30 jours', value: '30d' },
  { label: '90 jours', value: '90d' },
];

const GRANULARITIES = [
  { value: 'auto', label: 'Auto' },
  { value: '1h', label: 'Horaire' },
  { value: '1d', label: 'Jour' },
  { value: '1w', label: 'Semaine' },
];

const SPLIT_OPTIONS: { value: SplitDimension | 'none'; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'DR', label: 'DR' }, { value: 'DOR', label: 'DOR' },
  { value: 'ZONE_ARCEP', label: 'Zone ARCEP' }, { value: 'BAND', label: 'Bande' },
  { value: 'PLAQUE', label: 'Plaque' }, { value: 'SITE', label: 'Site' },
  { value: 'CELL', label: 'Cellule' }, { value: 'VENDOR', label: 'Vendor' },
  { value: 'TECHNO', label: 'Techno' },
];

const TOP_N_OPTIONS = [3, 5, 10, 15, 20];

export interface DashboardSettingsPanelProps {
  globalDateFrom: string;
  globalDateTo: string;
  setGlobalDateFrom: (v: string) => void;
  setGlobalDateTo: (v: string) => void;
  globalPeriod: string;
  applyPeriod: (v: string) => void;
  globalGranularity: string;
  setGlobalGranularity: (v: string) => void;
  globalSplitBy: SplitDimension | 'none';
  setGlobalSplitBy: (v: SplitDimension | 'none') => void;
  globalTopN: number;
  setGlobalTopN: (v: number) => void;
  globalFilters: Record<string, string[]>;
  removeGlobalFilter: (dim: string, val: string) => void;
  filterPicker: React.ReactNode;
  onApply: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon: Icon, defaultOpen = true, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground flex-1">{title}</span>
        {badge}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3 pt-1 space-y-2 animate-fade-in">{children}</div>}
    </div>
  );
};

const DashboardSettingsPanel: React.FC<DashboardSettingsPanelProps> = ({
  globalDateFrom, globalDateTo, setGlobalDateFrom, setGlobalDateTo,
  globalPeriod, applyPeriod, globalGranularity, setGlobalGranularity,
  globalSplitBy, setGlobalSplitBy, globalTopN, setGlobalTopN,
  globalFilters, removeGlobalFilter, filterPicker, onApply,
}) => {
  const startDate = globalDateFrom ? new Date(globalDateFrom) : undefined;
  const endDate = globalDateTo ? new Date(globalDateTo) : undefined;

  const filterEntries = Object.entries(globalFilters).flatMap(([dim, vals]) =>
    (vals || []).map(val => ({ dim, val }))
  );

  return (
    <aside className="w-[320px] border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gradient-to-br from-card to-muted/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-bold text-foreground leading-tight">Dashboard Settings</h2>
            <p className="text-[10px] text-muted-foreground">Configuration globale du rapport</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Time Range */}
        <Section title="Time Range" icon={CalendarIcon}>
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Période rapide</label>
            <Select value={globalPeriod} onValueChange={applyPeriod}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder="Choisir une période…" />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Début</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className={cn('h-8 w-full justify-start text-[11px] font-normal', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {startDate ? format(startDate, 'dd/MM/yy') : '—'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate}
                    onSelect={(d) => d && setGlobalDateFrom(format(d, 'yyyy-MM-dd'))}
                    initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Fin</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className={cn('h-8 w-full justify-start text-[11px] font-normal', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {endDate ? format(endDate, 'dd/MM/yy') : '—'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={endDate}
                    onSelect={(d) => d && setGlobalDateTo(format(d, 'yyyy-MM-dd'))}
                    initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Granularité</label>
            <Select value={globalGranularity} onValueChange={setGlobalGranularity}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANULARITIES.map(g => (
                  <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Filters */}
        <Section
          title="Filters"
          icon={Filter}
          badge={filterEntries.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {filterEntries.length}
            </span>
          )}
        >
          {filterEntries.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Aucun filtre appliqué.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {filterEntries.map(({ dim, val }) => (
                <span key={`${dim}-${val}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/8 text-primary border border-primary/20">
                  <span className="text-muted-foreground">{dim}:</span>
                  <span>{val}</span>
                  <button onClick={() => removeGlobalFilter(dim, val)}
                    className="ml-0.5 hover:text-destructive transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="pt-1">{filterPicker}</div>
        </Section>

        {/* Split (Layout) */}
        <Section title="Split & Layout" icon={GitBranch}>
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Dimension de split</label>
            <Select value={globalSplitBy} onValueChange={v => setGlobalSplitBy(v as any)}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPLIT_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {globalSplitBy !== 'none' && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-[10px] text-muted-foreground">Top N éléments</label>
              <Select value={String(globalTopN)} onValueChange={v => setGlobalTopN(Number(v))}>
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOP_N_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)} className="text-xs">Top {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </Section>

        {/* Alerts (placeholder) */}
        <Section title="Alerts" icon={Bell} defaultOpen={false}>
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-[11px] text-foreground font-medium">Notifier sur seuil</span>
              <span className="text-[9px] text-muted-foreground">Alerte quand un KPI dépasse son seuil critique</span>
            </div>
            <Switch className="scale-75" />
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-[11px] text-foreground font-medium">Anomalies IA</span>
              <span className="text-[9px] text-muted-foreground">Détection automatique des anomalies</span>
            </div>
            <Switch className="scale-75" />
          </div>
        </Section>
      </div>

      {/* Sticky Apply */}
      <div className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
        <Button onClick={onApply} className="w-full h-9 text-xs font-bold gap-2">
          <Check className="w-3.5 h-3.5" /> Appliquer au dashboard
        </Button>
        <p className="text-[9px] text-muted-foreground text-center mt-1.5">
          <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
          Sélectionnez un widget pour éditer ses propriétés
        </p>
      </div>
    </aside>
  );
};

export default DashboardSettingsPanel;
