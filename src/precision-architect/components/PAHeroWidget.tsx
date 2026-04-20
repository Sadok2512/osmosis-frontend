import { DynWidget, DEFAULT_HERO_CONFIG, HeroSize } from '../types';

interface Props {
  widget: DynWidget;
}

const SIZE_CLASSES: Record<HeroSize, string> = {
  sm: 'text-3xl md:text-4xl',
  md: 'text-4xl md:text-5xl',
  lg: 'text-5xl md:text-6xl',
  xl: 'text-6xl md:text-7xl',
};

const SUBTITLE_SIZE: Record<HeroSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

/**
 * Hero Title widget — large editorial title + subtitle, manually edited.
 * Inspired by the "GLOBAL THROUGHPUT" header in the presentation view.
 */
export default function PAHeroWidget({ widget }: Props) {
  const cfg = widget.heroConfig ?? DEFAULT_HERO_CONFIG;
  const alignClass =
    cfg.align === 'center' ? 'items-center text-center'
    : cfg.align === 'right' ? 'items-end text-right'
    : 'items-start text-left';

  return (
    <div className={`h-full w-full flex flex-col justify-center ${alignClass} px-2`}>
      {cfg.eyebrow && (
        <span
          className="text-[10px] font-black uppercase tracking-[0.3em] mb-3 opacity-70"
          style={{ color: cfg.titleColor || undefined }}
        >
          {cfg.eyebrow}
        </span>
      )}
      <h2
        className={`${SIZE_CLASSES[cfg.size]} font-black tracking-tighter font-headline uppercase leading-[0.95]`}
        style={{ color: cfg.titleColor || undefined }}
      >
        {cfg.title || 'Untitled'}
      </h2>
      {cfg.subtitle && (
        <p
          className={`${SUBTITLE_SIZE[cfg.size]} font-medium mt-3 max-w-3xl opacity-80`}
          style={{ color: cfg.subtitleColor || undefined }}
        >
          {cfg.subtitle}
        </p>
      )}
    </div>
  );
}
