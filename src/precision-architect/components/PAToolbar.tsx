import React, { useState } from 'react';
import { Filter, Calendar, Clock, Flag, ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TECHS: { id: string; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
];

const AVAILABLE_DIMENSIONS = [
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

const Pill: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ icon, children, className }) => (
  <div className={cn(
    'flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-xs font-bold text-on-surface',
    className
  )}>
    {icon}
    {children}
  </div>
);

const PAToolbar: React.FC<Props> = ({ onApply }) => {
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: 'f-1', dimension: 'Plaque', value: 'NANTES' },
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDim, setDraftDim] = useState<string>('');
  const [draftVal, setDraftVal] = useState<string>('');

  const removeFilter = (id: string) => setFilters(prev => prev.filter(f => f.id !== id));
  const clearFilters = () => setFilters([]);
  const addFilter = () => {
    if (!draftDim || !draftVal.trim()) return;
    setFilters(prev => [...prev, { id: `f-${Date.now()}`, dimension: draftDim, value: draftVal.trim() }]);
    setDraftDim('');
    setDraftVal('');
    setPickerOpen(false);
  };

  return (
    <div className="bg-surface-container-low/40 border-b border-outline-variant/20">
      {/* Filter chips row */}
      <div className="px-6 py-2.5 flex flex-wrap items-center gap-2 border-b border-outline-variant/10">
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
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Dimension</label>
                <select
                  value={draftDim}
                  onChange={(e) => setDraftDim(e.target.value)}
                  className="mt-1 w-full h-8 px-2 rounded-lg border border-outline-variant/30 bg-white text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Choisir…</option>
                  {AVAILABLE_DIMENSIONS.map(d => (
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

      {/* Existing scope/date row */}
      <div className="px-6 py-3 flex flex-wrap items-center gap-3">
        {/* Périmètre */}
        <Pill icon={<Filter className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Périmètre</span>
          <div className="flex items-center gap-1 ml-1">
            {TECHS.map(t => (
              <span key={t.id} className={cn('px-1.5 h-5 inline-flex items-center justify-center rounded-md text-[10px] font-black tracking-wide', t.bg, t.text)}>
                {t.label}
              </span>
            ))}
          </div>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">4</span>
        </Pill>

        {/* Date start */}
        <Pill icon={<Calendar className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span>13/04/2026</span>
          <span className="text-on-surface-variant/60 font-medium">00:00</span>
        </Pill>

        <span className="text-on-surface-variant/60 font-bold">—</span>

        {/* Date end */}
        <Pill icon={<Calendar className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span>15/04/2026</span>
          <span className="text-on-surface-variant/60 font-medium">00:00</span>
        </Pill>

        {/* Période */}
        <Pill icon={<Clock className="w-3.5 h-3.5 text-on-surface-variant" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Période</span>
          <span className="font-black">3j</span>
          <ChevronDown className="w-3 h-3 text-on-surface-variant" />
        </Pill>

        {/* Grain */}
        <Pill>
          <span className="text-emerald-600 uppercase tracking-wide text-[11px]">Grain :</span>
          <span className="text-emerald-700 font-black">15 min</span>
          <ChevronDown className="w-3 h-3 text-emerald-600" />
        </Pill>

        {/* Jalons */}
        <Pill icon={<Flag className="w-3.5 h-3.5 text-rose-500" />}>
          <span className="text-on-surface-variant uppercase tracking-wide text-[11px]">Jalons</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black">2</span>
        </Pill>

        <div className="ml-auto">
          <button
            onClick={onApply}
            className="h-9 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-[0_4px_14px_rgba(16,185,129,0.35)] active:scale-95 transition-all"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
};

export default PAToolbar;
