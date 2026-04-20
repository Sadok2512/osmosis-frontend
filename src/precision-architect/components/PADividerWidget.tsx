import { DynWidget, DEFAULT_DIVIDER_CONFIG } from '../types';

interface Props {
  widget: DynWidget;
}

/** Section divider — stylish horizontal separator with optional label. */
export default function PADividerWidget({ widget }: Props) {
  const cfg = widget.dividerConfig ?? DEFAULT_DIVIDER_CONFIG;
  const color = cfg.color || 'hsl(var(--primary))';

  const lineStyle: React.CSSProperties =
    cfg.style === 'gradient'
      ? {
          height: cfg.thickness,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }
      : {
          height: 0,
          borderTopWidth: cfg.thickness,
          borderTopStyle: cfg.style,
          borderTopColor: color,
        };

  const justify =
    cfg.align === 'left' ? 'justify-start'
    : cfg.align === 'right' ? 'justify-end'
    : 'justify-center';

  return (
    <div className="h-full w-full flex items-center px-2">
      <div className="w-full flex items-center gap-4">
        {cfg.align !== 'left' && <div className="flex-1" style={lineStyle} />}
        {cfg.label && (
          <span
            className={`text-[10px] font-black uppercase tracking-[0.3em] whitespace-nowrap shrink-0 ${justify}`}
            style={{ color }}
          >
            {cfg.label}
          </span>
        )}
        {cfg.align !== 'right' && <div className="flex-1" style={lineStyle} />}
      </div>
    </div>
  );
}
