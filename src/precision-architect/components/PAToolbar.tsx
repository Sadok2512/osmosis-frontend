import React, { useMemo, useState } from 'react';
import { Filter, Clock, Flag, ChevronDown, Check, Globe, Loader2 } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import DateRangePopover from './DateRangePopover';
import PAFilterChips from './PAFilterChips';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { usePAReportStore } from '../stores/paReportStore';
import type { TechnoId, PeriodPreset, GrainOption, DynWidget } from '../types';

const TECHS: { id: TechnoId; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
];

const VENDORS: { id: string; label: string; bg: string; text: string }[] = [
  { id: 'Ericsson', label: 'ERI', bg: 'bg-[#60a5fa]', text: 'text-white' },
  { id: 'Nokia',    label: 'NOK', bg: 'bg-[#1e40af]', text: 'text-white' },
  { id: 'Huawei',   label: 'HUA', bg: 'bg-[#dc2626]', text: 'text-white' },
  { id: 'Samsung',  label: 'SAM', bg: 'bg-[#7c3aed]', text: 'text-white' },
  { id: 'Alcatel',  label: 'ALU', bg: 'bg-[#f97316]', text: 'text-white' },
];

const PERIODS: { id: PeriodPreset; label: string; days?: number }[] = [
  { id: '1j', label: '1 jour', days: 1 },
  { id: '3j', label: '3 jours', days: 3 },
  { id: '7j', label: '7 jours', days: 7 },
  { id: '14j', label: '14 jours', days: 14 },
  { id: '30j', label: '30 jours', days: 30 },
  { id: 'custom', label: 'Personnalisé' },
];

const GRAINS: { id: GrainOption; label: string }[] = [
  { id: '5min', label: '5 min' },
  { id: '15min', label: '15 min' },
  { id: '30min', label: '30 min' },
  { id: '1h', label: '1 h' },
  { id: '1d', label: '1 j' },
];

const FALLBACK_DIMENSIONS = ['Plaque', 'DOR', 'DR', 'Vendor', 'Bande', 'Techno', 'Site', 'Cell', 'PCI', 'ECI', 'BCluster', 'Zone ARCEP'];

interface Props {
  /** Optional callback fired AFTER the global Apply has been recorded. */
  onApply?: () => void;
}

const PAToolbar: React.FC<Props> = ({ onApply }) => {
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();
  // Track any in-flight react-query request (chart/table/map widgets) to show
  // a global "Loading…" state on the Apply to Dashboard button.
  const isAnyFetching = useIsFetching();
  // Mirror Investigator: Vendor/Technology are handled by the Périmètre popover
  // and must NOT appear in the chip-row dimension picker.
  const SCOPE_DIMENSIONS = new Set(['Vendor', 'Technology', 'Techno']);
  const dimensionOptions = useMemo(() => {
    const base = (!filterCatalog || filterCatalog.length === 0)
      ? FALLBACK_DIMENSIONS
      : filterCatalog
          .filter(f => (f as any).is_active !== false)
          .map(f => f.display_name || f.dimension_key);
    const filtered = base.filter(d => !SCOPE_DIMENSIONS.has(d));
    if (!filtered.includes('BCluster')) filtered.push('BCluster');
    return filtered;
  }, [filterCatalog]);

  // Global report-level state — single source of truth for all widgets that inherit.
  const {
    technos, vendors, from, to, preset, grain, filters,
    setTechnos, setVendors, setRange, setPreset, setGrain, setFilters, apply,
  } = usePAGlobalToolbar();

  const toggleTechno = (id: TechnoId) =>
    setTechnos(technos.includes(id) ? technos.filter(t => t !== id) : [...technos, id]);

  const toggleVendor = (id: string) =>
    setVendors(vendors.includes(id) ? vendors.filter(v => v !== id) : [...vendors, id]);

  const applyPreset = (p: PeriodPreset) => {
    const cfg = PERIODS.find(x => x.id === p);
    if (p !== 'custom' && cfg?.days) {
      const toD = new Date(to || new Date().toISOString());
      const fromD = new Date(toD.getTime() - cfg.days * 86400000);
      setRange(fromD.toISOString().slice(0, 16), toD.toISOString().slice(0, 16), p);
    } else {
      setPreset(p);
    }
  };

  const setPages = usePAReportStore((s) => s.setPages);

  const handleApply = () => {
    apply();
    // CRITICAL: "Apply to Dashboard" must apply to ALL widgets in the dashboard,
    // not only those individually applied. We snapshot config -> appliedConfig
    // (and tableConfig -> appliedTableConfig) and bump appliedRev for every
    // widget on every page so that brand-new charts also fetch immediately.
    setPages((prev) =>
      prev.map((page) => ({
        ...page,
        widgets: page.widgets.map((w: DynWidget) => {
          // Only widgets that actually fetch / render data need the snapshot bump.
          if (w.kind !== 'chart' && w.kind !== 'table' && w.kind !== 'map') return w;
          const next: DynWidget = { ...w, appliedRev: (w.appliedRev ?? 0) + 1 };
          if (w.kind === 'chart' && w.config) {
            next.appliedConfig = structuredClone(w.config);
          }
          if (w.kind === 'table' && w.tableConfig) {
            next.appliedTableConfig = structuredClone(w.tableConfig);
          }
          if (w.kind === 'map' && w.mapConfig) {
            next.appliedMapConfig = structuredClone(w.mapConfig);
          }
          return next;
        }),
      })),
    );
    onApply?.();
  };

  const periodLabel = PERIODS.find(p => p.id === preset)?.label
    .replace(' jours', 'j').replace(' jour', 'j').replace('Personnalisé', 'Custom') ?? '—';
  const grainLabel = GRAINS.find(g => g.id === grain)?.label ?? grain;

  return (
    <div className="bg-white sticky top-[60px] z-[65] border-b border-outline-variant/20 shadow-sm">
      {/* Scope / date row — flex-wrap so on narrow widths items wrap to a 2nd line instead of being clipped */}
      <div className="px-6 py-3 flex flex-wrap items-center gap-2 gap-y-2 border-b border-outline-variant/10">
        {/* Périmètre — combined Technologies + Vendors picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Périmètre</span>
              <div className="flex items-center gap-1 ml-1">
                {TECHS.filter(t => technos.includes(t.id)).map(t => (
                  <span key={t.id} className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                    {t.label}
                  </span>
                ))}
                {VENDORS.filter(v => vendors.includes(v.id)).map(v => (
                  <span key={v.id} className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', v.bg, v.text)}>
                    {v.label}
                  </span>
                ))}
                {technos.length === 0 && vendors.length === 0 && (
                  <span className="text-[10px] italic text-on-surface-variant">aucun</span>
                )}
              </div>
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">
                {technos.length + vendors.length}
              </span>
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-2 py-1.5">Technologies</p>
            <div className="space-y-0.5">
              {TECHS.map(t => {
                const active = technos.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTechno(t.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-bold transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                    )}
                  >
                    <span className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0', active ? 'border-primary bg-primary' : 'border-outline-variant/40 bg-white')}>
                      {active && <Check className="w-3 h-3 text-on-primary" />}
                    </span>
                    <span className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="h-px bg-outline-variant/20 my-2" />
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-2 py-1.5">Vendors</p>
            <div className="space-y-0.5">
              {VENDORS.map(v => {
                const active = vendors.includes(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleVendor(v.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-bold transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                    )}
                  >
                    <span className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0', active ? 'border-primary bg-primary' : 'border-outline-variant/40 bg-white')}>
                      {active && <Check className="w-3 h-3 text-on-primary" />}
                    </span>
                    <span className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', v.bg, v.text)}>
                      {v.label}
                    </span>
                    <span className="text-xs font-bold">{v.id}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <DateRangePopover
          from={from}
          to={to}
          onChange={(f, t) => setRange(f, t, 'custom')}
        />

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-colors">
              <Clock className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Période</span>
              <span className="font-black">{periodLabel}</span>
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="start">
            {PERIODS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                  preset === p.id ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container-low'
                )}
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface hover:border-primary transition-colors">
              <span className="text-emerald-600 uppercase tracking-wide text-[11px]">Grain :</span>
              <span className="text-emerald-700 font-black">{grainLabel}</span>
              <ChevronDown className="w-3 h-3 text-emerald-600" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {GRAINS.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGrain(g.id)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                  grain === g.id ? 'bg-emerald-50 text-emerald-700' : 'text-on-surface hover:bg-surface-container-low'
                )}
              >
                {g.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface">
          <Flag className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">2</span>
        </div>

        <div className="ml-auto flex flex-col items-end gap-1">
          <button
            onClick={handleApply}
            disabled={isAnyFetching > 0}
            title={isAnyFetching > 0 ? 'Fetching widget data…' : 'Apply changes to all widgets in the dashboard'}
            className="h-9 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-500 disabled:cursor-wait text-white text-xs font-black uppercase tracking-widest shadow-[0_4px_14px_rgba(16,185,129,0.35)] active:scale-95 transition-all flex items-center gap-2"
          >
            {isAnyFetching > 0 ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading… ({isAnyFetching})
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5" />
                Apply to Dashboard
              </>
            )}
          </button>
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest border border-emerald-200">
            <Globe className="w-3 h-3" /> Dashboard scope
          </span>
        </div>
      </div>

      {/* Filter row — separate line under the scope/date row */}
      <div className="px-6 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtres</span>
        </div>
        <PAFilterChips
          filters={filters}
          onChange={setFilters}
          filterDimensions={dimensionOptions}
          filtersLoading={filtersLoading}
          chipsOnly
        />
        <PAFilterChips
          filters={filters}
          onChange={setFilters}
          filterDimensions={dimensionOptions}
          filtersLoading={filtersLoading}
          addOnly
        />
      </div>
    </div>
  );
};

export default PAToolbar;
