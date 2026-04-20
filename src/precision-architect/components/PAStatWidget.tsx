import { DynWidget, DEFAULT_STAT_CONFIG } from '../types';

interface Props {
  widget: DynWidget;
}

/**
 * KPI Stat Card — premium card with label + big value + unit. Manually edited.
 * Inspired by the "PEAK RATE / 1.42 Tb/s" cards in the presentation view.
 */
export default function PAStatWidget({ widget }: Props) {
  const cfg = widget.statConfig ?? DEFAULT_STAT_CONFIG;
  const accent = cfg.accentColor || 'hsl(var(--primary))';

  const themeClasses =
    cfg.theme === 'dark'
      ? 'bg-zinc-900 text-white border-white/10'
      : cfg.theme === 'glass'
      ? 'bg-white/60 backdrop-blur-xl text-on-surface border-white/40'
      : 'bg-white text-on-surface border-outline-variant/20';

  return (
    <div
      className={`h-full w-full rounded-2xl border ${themeClasses} p-6 flex flex-col justify-center relative overflow-hidden shadow-sm`}
    >
      {cfg.showPulse && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Live</span>
        </div>
      )}

      <span
        className="text-[10px] font-black uppercase tracking-[0.25em] mb-3 opacity-70"
        style={{ color: cfg.theme === 'dark' ? accent : undefined }}
      >
        {cfg.label || 'Label'}
      </span>

      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black font-headline tracking-tighter leading-none">
          {cfg.value || '—'}
        </span>
        {cfg.unit && (
          <span className="text-base font-medium opacity-60">{cfg.unit}</span>
        )}
      </div>

      {/* subtle accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
    </div>
  );
}
