import React from 'react';
import { Filter, Calendar, Clock, Flag, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TECHS: { id: string; label: string; bg: string; text: string }[] = [
  { id: '2g', label: '2G', bg: 'bg-violet-500', text: 'text-white' },
  { id: '3g', label: '3G', bg: 'bg-amber-400', text: 'text-amber-950' },
  { id: '4g', label: '4G', bg: 'bg-orange-500', text: 'text-white' },
  { id: '5g', label: '5G', bg: 'bg-emerald-500', text: 'text-white' },
];

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
  return (
    <div className="bg-surface-container-low/40 border-b border-outline-variant/20 px-6 py-3 flex flex-wrap items-center gap-3">
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
  );
};

export default PAToolbar;
