import React, { useMemo, useState } from 'react';
import { Filter, Calendar, Clock, Flag, ChevronDown, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFilterCatalog } from '@/components/kpi-monitor/api/kpiMonitorApi';
import DateRangePopover from './DateRangePopover';

type TechnoId = '2g' | '3g' | '4g' | '5g';
type PeriodPreset = '1j' | '3j' | '7j' | '14j' | '30j' | 'custom';
type GrainOption = '5min' | '15min' | '30min' | '1h' | '1d';

const TECHS: { id: TechnoId; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
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

// Fallback dimensions (when backend catalog is unreachable). Vendor is included.
const FALLBACK_DIMENSIONS = [
  'Plaque', 'DOR', 'DR', 'Vendor', 'Bande', 'Techno', 'Site', 'Cell', 'PCI', 'ECI',
];

interface ActiveFilter {
  id: string;
  dimension: string;
  value: string;
}

interface Props {
  onApply?: () => void;
}

function formatDateDisplay(iso: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, day] = d.split('-');
  return { date: `${day}/${m}/${y}`, time: t.slice(0, 5) };
}

const PAToolbar: React.FC<Props> = ({ onApply }) => {
  // Live filter dimensions from backend (Vendor, Plaque, DOR, DR, Bande, Techno, etc.)
  const { data: filterCatalog, isLoading: filtersLoading } = useFilterCatalog();
  const dimensionOptions = useMemo(() => {
    if (!filterCatalog || filterCatalog.length === 0) return FALLBACK_DIMENSIONS;
    const fromBackend = filterCatalog
      .filter(f => (f as any).is_active !== false)
      .map(f => f.display_name || f.dimension_key);
    // Ensure Vendor is always present even if backend forgot it
    if (!fromBackend.some(d => d.toLowerCase() === 'vendor')) {
      fromBackend.push('Vendor');
    }
    return fromBackend;
  }, [filterCatalog]);

  const [technos, setTechnos] = useState<TechnoId[]>(['2g', '3g', '4g', '5g']);
  const [from, setFrom] = useState('2026-04-13T00:00');
  const [to, setTo] = useState('2026-04-15T00:00');
  const [preset, setPreset] = useState<PeriodPreset>('3j');
  const [grain, setGrain] = useState<GrainOption>('15min');

  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: 'f-1', dimension: 'Plaque', value: 'NANTES' },
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDim, setDraftDim] = useState<string>('');
  const [draftVal, setDraftVal] = useState<string>('');

  const toggleTechno = (id: TechnoId) =>
    setTechnos(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    const cfg = PERIODS.find(x => x.id === p);
    if (p !== 'custom' && cfg?.days) {
      const toD = new Date(to || new Date().toISOString());
      const fromD = new Date(toD.getTime() - cfg.days * 86400000);
      setFrom(fromD.toISOString().slice(0, 16));
      setTo(toD.toISOString().slice(0, 16));
    }
  };

  const removeFilter = (id: string) => setFilters(prev => prev.filter(f => f.id !== id));
  const clearFilters = () => setFilters([]);
  const addFilter = () => {
    if (!draftDim || !draftVal.trim()) return;
    setFilters(prev => [...prev, { id: `f-${Date.now()}`, dimension: draftDim, value: draftVal.trim() }]);
    setDraftDim('');
    setDraftVal('');
    setPickerOpen(false);
  };

  const fromDisp = formatDateDisplay(from);
  const toDisp = formatDateDisplay(to);
  const periodLabel = PERIODS.find(p => p.id === preset)?.label
    .replace(' jours', 'j').replace(' jour', 'j').replace('Personnalisé', 'Custom') ?? '—';
  const grainLabel = GRAINS.find(g => g.id === grain)?.label ?? grain;

  return (
    <div className="bg-surface-container-low/40 border-b border-outline-variant/20">
      {/* Scope / date row */}
      <div className="px-6 py-3 flex flex-wrap items-center gap-3 border-b border-outline-variant/10">
        {/* Périmètre — interactive */}
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
                {technos.length === 0 && (
                  <span className="text-[10px] italic text-on-surface-variant">aucune</span>
                )}
              </div>
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">{technos.length}</span>
              <ChevronDown className="w-3 h-3 text-on-surface-variant" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-2 py-1.5">Sélectionner technologies</p>
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
          </PopoverContent>
        </Popover>

        {/* Date range — unified Investigator-style dual calendar */}
        <DateRangePopover
          from={from}
          to={to}
          onChange={(f, t) => { setFrom(f); setTo(t); setPreset('custom'); }}
        />

        {/* Période preset */}
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

        {/* Grain */}
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

        {/* Jalons (display only) */}
        <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface">
          <Flag className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">2</span>
        </div>

        <div className="ml-auto">
          <button
            onClick={onApply}
            className="h-9 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-[0_4px_14px_rgba(16,185,129,0.35)] active:scale-95 transition-all"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Filter chips row */}
      <div className="px-6 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtres</span>
        </div>

        {filters.map(f => (
          <div
            key={f.id}
            className="group flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-900"
          >
            <span className="opacity-70">{f.dimension}:</span>
            <span>{f.value}</span>
            <button
              onClick={() => removeFilter(f.id)}
              className="w-5 h-5 rounded-full hover:bg-amber-200/80 flex items-center justify-center text-amber-700"
              aria-label={`Remove ${f.dimension} filter`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-dashed border-outline-variant/60 text-[11px] font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Ajouter filtre</span>
          </button>

          {pickerOpen && (
            <div className="absolute z-50 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-outline-variant/20 p-3 space-y-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Dimension {!filtersLoading && `· ${dimensionOptions.length}`}
                </label>
                <select
                  value={draftDim}
                  onChange={(e) => setDraftDim(e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-outline-variant/30 bg-white text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">{filtersLoading ? 'Chargement…' : 'Choisir…'}</option>
                  {dimensionOptions.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Valeur</label>
                <input
                  value={draftVal}
                  onChange={(e) => setDraftVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFilter()}
                  placeholder="Ex. NANTES"
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-outline-variant/30 bg-white text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="h-7 px-3 rounded-lg text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-low"
                >
                  Annuler
                </button>
                <button
                  onClick={addFilter}
                  disabled={!draftDim || !draftVal.trim()}
                  className="h-7 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
                >
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </div>

        {filters.length > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Effacer filtres</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PAToolbar;
