import React, { useMemo, useState, useEffect } from 'react';
import { Filter, Clock, Flag, ChevronDown, Check, Globe, Loader2, Plus, X, Edit2, Save, Trash2 } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import DateRangePopover from './DateRangePopover';
import PAFilterChips from './PAFilterChips';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import { usePAReportStore } from '../stores/paReportStore';
import type { TechnoId, PeriodPreset, GrainOption, DynWidget, ChartJalon, AdvancedTimeFrameConfig, AdvancedTimeFrameMode, AdvancedTimeFrameProfile } from '../types';

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

const FALLBACK_DIMENSIONS = ['Cluster', 'DOR', 'DR', 'Vendor', 'Bande', 'Technology', 'Site', 'Cell', 'PCI', 'ECI', 'Zone ARCEP'];
const ADVANCED_TIMEFRAME_STORAGE_KEY = 'osmosis_pa_advanced_timeframe_profiles_v1';
const NONE_TIMEFRAME: AdvancedTimeFrameConfig = { mode: 'NONE' };

const normalizeTimeFrame = (tf?: AdvancedTimeFrameConfig | null): AdvancedTimeFrameConfig => {
  if (!tf || tf.mode === 'NONE') {
    return tf?.excludeWeekends ? { mode: 'NONE', excludeWeekends: true } : NONE_TIMEFRAME;
  }
  return {
    ...tf,
    startHour: tf.startHour || (tf.mode === 'BUSY_HOURS' ? '08:00' : ''),
    endHour: tf.endHour || (tf.mode === 'BUSY_HOURS' ? '20:00' : ''),
    excludeWeekends: !!tf.excludeWeekends,
  };
};

const describeTimeFrame = (tf?: AdvancedTimeFrameConfig | null) => {
  const normalized = normalizeTimeFrame(tf);
  if (normalized.mode === 'NONE') {
    return normalized.excludeWeekends ? 'Advanced TimeFrame: None, Weekends excluded' : 'Advanced TimeFrame: None';
  }
  const name = normalized.profileName || (normalized.mode === 'BUSY_HOURS' ? 'Busy Hours' : 'Custom Hours');
  return `Advanced TimeFrame: ${name} ${normalized.startHour}-${normalized.endHour}${normalized.excludeWeekends ? ', Weekends excluded' : ''}`;
};

const isAdvancedActive = (tf?: AdvancedTimeFrameConfig | null) => {
  const normalized = normalizeTimeFrame(tf);
  return normalized.mode !== 'NONE' || !!normalized.excludeWeekends;
};

const loadTimeFrameProfiles = (): AdvancedTimeFrameProfile[] => {
  try {
    const raw = localStorage.getItem(ADVANCED_TIMEFRAME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is AdvancedTimeFrameProfile => !!p?.id && !!p?.profileName && p.mode !== 'NONE')
      .map(p => normalizeTimeFrame(p) as AdvancedTimeFrameProfile);
  } catch {
    return [];
  }
};

const persistTimeFrameProfiles = (profiles: AdvancedTimeFrameProfile[]) => {
  localStorage.setItem(ADVANCED_TIMEFRAME_STORAGE_KEY, JSON.stringify(profiles));
};

const validateTimeFrame = (tf: AdvancedTimeFrameConfig, profiles: AdvancedTimeFrameProfile[], editingId?: string | null): string | null => {
  const normalized = normalizeTimeFrame(tf);
  const name = (normalized.profileName || '').trim();
  if (!name && normalized.mode !== 'NONE') return 'Profile name is required.';
  if (name && profiles.some(p => p.profileName.toLowerCase() === name.toLowerCase() && p.id !== editingId)) {
    return 'Profile name must be unique.';
  }
  if (normalized.mode !== 'NONE') {
    if (!normalized.startHour || !normalized.endHour) return 'Start hour and end hour are required.';
    if (!/^\d{2}:\d{2}$/.test(normalized.startHour) || !/^\d{2}:\d{2}$/.test(normalized.endHour)) {
      return 'Hours must use 24h HH:mm format.';
    }
    if (normalized.endHour <= normalized.startHour) return 'End hour must be after start hour.';
  }
  return null;
};

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
  const SCOPE_DIMENSIONS = new Set(['Vendor', 'Technology']);
  const dimensionOptions = useMemo(() => {
    const catalog = Array.isArray(filterCatalog) ? filterCatalog : [];
    const base = catalog.length === 0
      ? FALLBACK_DIMENSIONS
      : catalog
          .filter(f => (f as any).is_active !== false)
          .map(f => f.display_name || f.dimension_key);
    const filtered = base.filter(d => !SCOPE_DIMENSIONS.has(d));
    if (!filtered.includes('Cluster_B')) filtered.push('Cluster_B');
    return filtered;
  }, [filterCatalog]);

  // display_name → category (template section: COMMON / RF PARAMETERS /
  // 4G / 5G / 3G / 2G / OPERATIONS) and display_name → rat for
  // techno-aware hiding. Same source as the Investigator.
  const filterCategoriesMap = useMemo(() => {
    const cats: Record<string, string> = {};
    if (Array.isArray(filterCatalog)) {
      for (const f of filterCatalog) {
        const name = f.display_name || f.dimension_key;
        const cat = (f as any).category;
        if (name && cat) cats[name] = cat;
      }
    }
    if (!cats['Cluster_B']) cats['Cluster_B'] = 'Operations';
    return cats;
  }, [filterCatalog]);
  const filterRatsMap = useMemo(() => {
    const rats: Record<string, string> = {};
    if (Array.isArray(filterCatalog)) {
      for (const f of filterCatalog) {
        const name = f.display_name || f.dimension_key;
        const rat = (f as any).rat;
        if (name && rat) rats[name] = rat;
      }
    }
    return rats;
  }, [filterCatalog]);

  // Global report-level state — single source of truth for all widgets that inherit.
  const {
    technos, vendors, from, to, preset, grain, advancedTimeFrame, filters,
    setTechnos, setVendors, setRange, setPreset, setGrain, setAdvancedTimeFrame, setFilters, apply,
  } = usePAGlobalToolbar();
  const activeTimeFrame = normalizeTimeFrame(advancedTimeFrame);
  const [timeFrameProfiles, setTimeFrameProfiles] = useState<AdvancedTimeFrameProfile[]>(() => loadTimeFrameProfiles());
  const [timeFrameDraft, setTimeFrameDraft] = useState<AdvancedTimeFrameConfig>(() => activeTimeFrame);
  const [timeFrameEditingId, setTimeFrameEditingId] = useState<string | null>(activeTimeFrame.id || null);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  useEffect(() => {
    setTimeFrameDraft(activeTimeFrame);
    setTimeFrameEditingId(activeTimeFrame.id || null);
  }, [activeTimeFrame.id, activeTimeFrame.mode, activeTimeFrame.startHour, activeTimeFrame.endHour, activeTimeFrame.excludeWeekends, activeTimeFrame.profileName]);

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

  const updateTimeFrameDraft = (patch: Partial<AdvancedTimeFrameConfig>) => {
    setTimeFrameError(null);
    setTimeFrameDraft(prev => {
      const next = normalizeTimeFrame({ ...prev, ...patch } as AdvancedTimeFrameConfig);
      if (patch.mode === 'BUSY_HOURS') return { ...next, startHour: next.startHour || '08:00', endHour: next.endHour || '20:00' };
      if (patch.mode === 'NONE') return { mode: 'NONE', excludeWeekends: !!next.excludeWeekends };
      return next;
    });
  };

  const applyTimeFrameDraft = () => {
    const normalized = normalizeTimeFrame(timeFrameDraft);
    const error = validateTimeFrame(normalized, timeFrameProfiles, timeFrameEditingId);
    if (error && normalized.mode !== 'NONE') {
      setTimeFrameError(error);
      return;
    }
    setAdvancedTimeFrame(normalized);
  };

  const saveTimeFrameProfile = () => {
    const normalized = normalizeTimeFrame(timeFrameDraft);
    const error = validateTimeFrame(normalized, timeFrameProfiles, timeFrameEditingId);
    if (error) {
      setTimeFrameError(error);
      return;
    }
    if (normalized.mode === 'NONE') {
      setTimeFrameError('None is a system option and cannot be saved.');
      return;
    }
    const id = timeFrameEditingId || normalized.id || `pa-tf-${Date.now()}`;
    const profile = { ...normalized, id, profileName: (normalized.profileName || '').trim() } as AdvancedTimeFrameProfile;
    const nextProfiles = timeFrameProfiles.some(p => p.id === id)
      ? timeFrameProfiles.map(p => p.id === id ? profile : p)
      : [...timeFrameProfiles, profile];
    setTimeFrameProfiles(nextProfiles);
    persistTimeFrameProfiles(nextProfiles);
    setTimeFrameEditingId(id);
    setAdvancedTimeFrame(profile);
    setTimeFrameError(null);
  };

  const selectTimeFrameProfile = (profile: AdvancedTimeFrameProfile) => {
    setTimeFrameDraft(profile);
    setTimeFrameEditingId(profile.id);
    setAdvancedTimeFrame(profile);
    setTimeFrameError(null);
  };

  const deleteTimeFrameProfile = (id: string) => {
    const nextProfiles = timeFrameProfiles.filter(p => p.id !== id);
    setTimeFrameProfiles(nextProfiles);
    persistTimeFrameProfiles(nextProfiles);
    if (activeTimeFrame.id === id || timeFrameEditingId === id) {
      setAdvancedTimeFrame(NONE_TIMEFRAME);
      setTimeFrameDraft(NONE_TIMEFRAME);
      setTimeFrameEditingId(null);
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
          showTime={!['1d', '1w', '1S'].includes(grain as string)}
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

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={describeTimeFrame(activeTimeFrame)}
              className={cn(
                'flex items-center gap-2 h-9 px-3 rounded-full bg-white border text-xs font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors max-w-[360px]',
                isAdvancedActive(activeTimeFrame)
                  ? 'border-cyan-300 text-cyan-700 hover:bg-cyan-50'
                  : 'border-outline-variant/30 text-on-surface hover:border-primary hover:text-primary'
              )}
            >
              <Clock className={cn('w-3.5 h-3.5', isAdvancedActive(activeTimeFrame) ? 'text-cyan-600' : 'text-on-surface-variant')} />
              <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Advanced TimeFrame</span>
              <span className="font-black truncate max-w-[160px]">
                {activeTimeFrame.mode === 'NONE'
                  ? (activeTimeFrame.excludeWeekends ? 'None · weekdays' : 'None')
                  : `${activeTimeFrame.profileName || (activeTimeFrame.mode === 'BUSY_HOURS' ? 'Busy Hours' : 'Custom')} ${activeTimeFrame.startHour}-${activeTimeFrame.endHour}`}
              </span>
              {isAdvancedActive(activeTimeFrame) && (
                <button
                  type="button"
                  aria-label="Clear Advanced TimeFrame"
                  className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 hover:bg-cyan-200 inline-flex items-center justify-center"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAdvancedTimeFrame(NONE_TIMEFRAME);
                    setTimeFrameDraft(NONE_TIMEFRAME);
                    setTimeFrameEditingId(null);
                    setTimeFrameError(null);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-3 max-h-[520px] overflow-y-auto" align="start">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Advanced TimeFrame</div>
                <div className="text-xs font-semibold text-on-surface mt-0.5">{describeTimeFrame(activeTimeFrame)}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => {
                  setAdvancedTimeFrame(NONE_TIMEFRAME);
                  setTimeFrameDraft(NONE_TIMEFRAME);
                  setTimeFrameEditingId(null);
                  setTimeFrameError(null);
                }}
              >
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Saved profiles</label>
                <div className="mt-1.5 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFrameDraft(NONE_TIMEFRAME);
                      setTimeFrameEditingId(null);
                      setAdvancedTimeFrame(NONE_TIMEFRAME);
                      setTimeFrameError(null);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                      activeTimeFrame.mode === 'NONE' && !activeTimeFrame.excludeWeekends
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'text-on-surface hover:bg-surface-container-low'
                    )}
                  >
                    <span>None</span>
                    <span className="text-[9px] uppercase text-muted-foreground">system</span>
                  </button>
                  {timeFrameProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectTimeFrameProfile(profile)}
                        className={cn(
                          'flex-1 text-left px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                          activeTimeFrame.id === profile.id
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'text-on-surface hover:bg-surface-container-low'
                        )}
                      >
                        <span className="block truncate">{profile.profileName}</span>
                        <span className="block text-[9px] text-muted-foreground">
                          {profile.mode === 'BUSY_HOURS' ? 'Busy Hours' : 'Custom Hours'} {profile.startHour}-{profile.endHour}
                          {profile.excludeWeekends ? ' · weekdays' : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                        onClick={() => deleteTimeFrameProfile(profile.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px bg-outline-variant/20" />

              <div className="grid grid-cols-3 gap-1">
                {(['NONE', 'BUSY_HOURS', 'CUSTOM_HOURS'] as AdvancedTimeFrameMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateTimeFrameDraft({ mode, profileName: mode === 'NONE' ? undefined : timeFrameDraft.profileName })}
                    className={cn(
                      'h-8 rounded-md border text-[10px] font-black uppercase tracking-wide transition-colors',
                      timeFrameDraft.mode === mode
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                        : 'border-outline-variant/30 text-muted-foreground hover:bg-surface-container-low'
                    )}
                  >
                    {mode === 'BUSY_HOURS' ? 'Busy' : mode === 'CUSTOM_HOURS' ? 'Custom' : 'None'}
                  </button>
                ))}
              </div>

              {timeFrameDraft.mode !== 'NONE' && (
                <>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Profile name</label>
                    <input
                      value={timeFrameDraft.profileName || ''}
                      onChange={(e) => updateTimeFrameDraft({ profileName: e.target.value })}
                      className="mt-1 w-full h-8 px-2 rounded-md border border-outline-variant/30 bg-white text-xs font-semibold outline-none focus:border-cyan-400"
                      placeholder="Business Hours"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Start hour</label>
                      <input
                        type="time"
                        value={timeFrameDraft.startHour || ''}
                        onChange={(e) => updateTimeFrameDraft({ startHour: e.target.value })}
                        className="mt-1 w-full h-8 px-2 rounded-md border border-outline-variant/30 bg-white text-xs font-semibold outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">End hour</label>
                      <input
                        type="time"
                        value={timeFrameDraft.endHour || ''}
                        onChange={(e) => updateTimeFrameDraft({ endHour: e.target.value })}
                        className="mt-1 w-full h-8 px-2 rounded-md border border-outline-variant/30 bg-white text-xs font-semibold outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-outline-variant/20 bg-surface-container-low/40">
                <input
                  type="checkbox"
                  checked={!!timeFrameDraft.excludeWeekends}
                  onChange={(e) => updateTimeFrameDraft({ excludeWeekends: e.target.checked })}
                  className="w-3.5 h-3.5 accent-cyan-600"
                />
                <span className="text-xs font-semibold text-on-surface">Exclude weekends</span>
              </label>

              {timeFrameError && (
                <div className="px-2 py-1.5 rounded-md bg-destructive/10 text-destructive text-[11px] font-semibold">
                  {timeFrameError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={applyTimeFrameDraft}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Apply
                </Button>
                <Button type="button" size="sm" className="h-8 text-xs bg-cyan-600 hover:bg-cyan-700" onClick={saveTimeFrameProfile}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save profile
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <JalonsPill />

        <div className="ml-auto relative">
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
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-emerald-700 text-[8px] font-black uppercase tracking-widest border border-emerald-300 shadow-sm whitespace-nowrap pointer-events-none">
            <Globe className="w-2.5 h-2.5" /> Dashboard scope
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
          filterCategories={filterCategoriesMap}
          filterRats={filterRatsMap}
          activeTechnos={technos}
          chipsOnly
        />
        <PAFilterChips
          filters={filters}
          onChange={setFilters}
          filterDimensions={dimensionOptions}
          filtersLoading={filtersLoading}
          filterCategories={filterCategoriesMap}
          filterRats={filterRatsMap}
          activeTechnos={technos}
          addOnly
        />
      </div>
    </div>
  );
};

/* ───────────────────────── JALONS PILL ─────────────────────────
 * Investigator-parity Jalons manager. Manages a list of GLOBAL jalons
 * stored in paGlobalToolbarStore — they are merged into every chart
 * widget at render time (PAEChart) so a single edit propagates to the
 * whole dashboard.
 */
const JALON_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const JalonsPill: React.FC = () => {
  const jalons = usePAGlobalToolbar((s) => s.jalons);
  const setJalons = usePAGlobalToolbar((s) => s.setJalons);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // New jalon form state
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [color, setColor] = useState(JALON_COLORS[0]);
  const [opacity, setOpacity] = useState(80);
  const [endDateTouched, setEndDateTouched] = useState(false);

  useEffect(() => {
    if (!endDateTouched && startDate) setEndDate(startDate);
  }, [startDate, endDateTouched]);

  const resetForm = () => {
    setLabel(''); setStartDate(''); setEndDate(''); setColor(JALON_COLORS[0]);
    setOpacity(80); setEndDateTouched(false);
  };

  const handleAdd = () => {
    if (!startDate || !label) return;
    const newJ: ChartJalon = {
      id: `jalon-${Date.now()}`,
      date: startDate,
      endDate: endDate || startDate,
      label,
      color,
      opacity: opacity / 100,
    };
    setJalons([...jalons, newJ]);
    resetForm();
    setShowForm(false);
  };

  const updateJalon = (id: string, patch: Partial<ChartJalon>) =>
    setJalons(jalons.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const removeJalon = (id: string) => {
    setJalons(jalons.filter((j) => j.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const fmtDt = (dt: string) => dt?.replace('T', ' ').slice(0, 16) || '';
  const total = jalons.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 h-9 px-3 rounded-full bg-white border text-xs font-bold text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors',
            total > 0
              ? 'border-rose-300 hover:bg-rose-50 hover:border-rose-400'
              : 'border-outline-variant/30 hover:bg-surface-container-low'
          )}
        >
          <Flag className={cn('w-3.5 h-3.5', total > 0 ? 'text-rose-500' : 'text-on-surface-variant')} />
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className={cn(
            'ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md text-[10px] font-black',
            total > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
          )}>
            {total}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 max-h-[440px] overflow-hidden flex flex-col">
        <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Gestion des jalons
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
          {/* Existing jalons list */}
          {jalons.length > 0 && (
            <div className="space-y-1">
              {jalons.map((j) => {
                const isEditing = editingId === j.id;
                return (
                  <div
                    key={j.id}
                    className={cn(
                      'rounded-lg border transition-all',
                      isEditing ? 'border-primary/40 bg-primary/5 p-2' : 'border-border/30 bg-card p-1.5'
                    )}
                  >
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <input
                          value={j.label}
                          onChange={(e) => updateJalon(j.id, { label: e.target.value })}
                          className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[8px] text-muted-foreground uppercase">Début</label>
                            <input
                              type="datetime-local"
                              value={j.date}
                              onChange={(e) => updateJalon(j.id, { date: e.target.value })}
                              className="w-full px-1.5 py-1 rounded-md border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label className="text-[8px] text-muted-foreground uppercase">Fin</label>
                            <input
                              type="datetime-local"
                              value={j.endDate || j.date}
                              onChange={(e) => updateJalon(j.id, { endDate: e.target.value })}
                              min={j.date}
                              className="w-full px-1.5 py-1 rounded-md border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] text-muted-foreground uppercase shrink-0">Opacité</span>
                          <Slider
                            value={[Math.round((j.opacity ?? 0.8) * 100)]}
                            min={10}
                            max={100}
                            step={5}
                            onValueChange={([v]) => updateJalon(j.id, { opacity: v / 100 })}
                            className="flex-1"
                          />
                          <span className="text-[9px] text-muted-foreground w-8 text-right">
                            {Math.round((j.opacity ?? 0.8) * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {JALON_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => updateJalon(j.id, { color: c })}
                              className={cn(
                                'w-4 h-4 rounded-full border-2 transition-all',
                                j.color === c ? 'border-foreground scale-110' : 'border-transparent'
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[9px] px-2 ml-auto"
                            onClick={() => setEditingId(null)}
                          >
                            <Check className="w-3 h-3 mr-0.5" /> OK
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: j.color, opacity: j.opacity ?? 0.8 }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium text-foreground truncate block">{j.label}</span>
                          <span className="text-[8px] text-muted-foreground">
                            {fmtDt(j.date)}
                            {j.endDate && j.endDate !== j.date ? ` → ${fmtDt(j.endDate)}` : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingId(j.id)}
                          className="text-muted-foreground hover:text-primary shrink-0"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeJalon(j.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {jalons.length === 0 && !showForm && (
            <div className="text-[10px] text-muted-foreground/50 text-center py-3 italic">
              Aucun jalon créé
            </div>
          )}

          {/* New jalon form */}
          {showForm ? (
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2 space-y-1.5">
              <div className="text-[9px] font-bold text-primary uppercase tracking-wider">Nouveau jalon</div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Nom du jalon..."
                className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[8px] text-muted-foreground uppercase">Début</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-1.5 py-1 rounded-md border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-[8px] text-muted-foreground uppercase">Fin</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setEndDateTouched(true); }}
                    min={startDate}
                    className="w-full px-1.5 py-1 rounded-md border border-border bg-background text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-muted-foreground uppercase shrink-0">Opacité</span>
                <Slider
                  value={[opacity]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([v]) => setOpacity(v)}
                  className="flex-1"
                />
                <span className="text-[9px] text-muted-foreground w-8 text-right">{opacity}%</span>
              </div>
              <div className="flex items-center gap-1">
                {JALON_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-4 h-4 rounded-full border-2 transition-all',
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 text-[9px] px-2"
                    onClick={() => { resetForm(); setShowForm(false); }}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    className="h-5 text-[9px] px-2"
                    onClick={handleAdd}
                    disabled={!startDate || !label}
                  >
                    <Plus className="w-3 h-3 mr-0.5" /> Ajouter
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 transition-colors"
            >
              <Plus className="w-3 h-3" /> Ajouter un jalon
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PAToolbar;
