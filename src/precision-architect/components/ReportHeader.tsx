import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, MapPin, Clock, Filter, Move } from 'lucide-react';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import type { DashboardTheme } from '../types';

interface ReportHeaderProps {
  theme: DashboardTheme | undefined;
  projectName: string;
  pageName?: string;
  /** Visual scale: 'editor' | 'viewer' | 'presentation'. */
  size?: 'sm' | 'md' | 'lg';
  /** When true, the photo shows resize/position controls (edit mode only). */
  editable?: boolean;
  /** Live patch the page theme (used when editable=true). */
  onThemePatch?: (patch: Partial<DashboardTheme>) => void;
}

const PHOTO_MIN = 64;
const PHOTO_MAX = 480;

/**
 * Renders the report header with three independent blocks:
 *  - Photo (configurable position): controlled by `theme.showPhoto`
 *  - Report Name (left): controlled by `theme.showReportName`
 *  - Report Info (right): controlled by `theme.reportInfo.show`
 *
 * In edit mode, the photo gains a drag-to-resize handle and a quick position picker.
 */
export default function ReportHeader({
  theme,
  projectName,
  pageName,
  size = 'md',
  editable = false,
  onThemePatch,
}: ReportHeaderProps) {
  const technos = usePAGlobalToolbar((s) => s.applied?.technos ?? s.technos);
  const from = usePAGlobalToolbar((s) => s.applied?.from ?? s.from);
  const to = usePAGlobalToolbar((s) => s.applied?.to ?? s.to);
  const grain = usePAGlobalToolbar((s) => s.applied?.grain ?? s.grain);
  const filters = usePAGlobalToolbar((s) => s.applied?.filters ?? s.filters);

  const showReportName = theme?.showReportName !== false;
  const reportInfo = theme?.reportInfo ?? { show: true, perimeter: true, date: true, granularity: true, filters: true };
  const showInfoBlock = reportInfo.show !== false;
  const showPhoto = !!theme?.showPhoto && !!theme?.photoUrl;
  const photoPosition = theme?.photoPosition ?? 'left';
  const photoSize = Math.max(PHOTO_MIN, Math.min(PHOTO_MAX, theme?.photoSize ?? 128));

  const titleColor = theme?.titleColor || theme?.accentColor;
  const headerAlignClass =
    theme?.headerAlign === 'center' ? 'text-center' : theme?.headerAlign === 'right' ? 'text-right' : 'text-left';

  const titleText = theme?.pageTitle || pageName || projectName || 'Report';
  const subtitleText = theme?.pageSubtitle;

  const titleClass =
    size === 'lg'
      ? 'text-6xl font-black font-headline tracking-tight'
      : size === 'sm'
      ? 'text-2xl font-black font-headline tracking-tight'
      : 'text-3xl font-black font-headline tracking-tight';

  const fmtDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  // Bail early if nothing visible.
  if (!showReportName && !showInfoBlock && !showPhoto) return null;

  const infoItems: Array<{ key: string; icon: typeof Calendar; label: string; value: string }> = [];
  if (reportInfo.perimeter) {
    const perimeterLabel = (technos ?? []).map((t) => t.toUpperCase()).join(' · ') || 'All technos';
    infoItems.push({ key: 'perimeter', icon: MapPin, label: 'Perimeter', value: perimeterLabel });
  }
  if (reportInfo.date) {
    infoItems.push({ key: 'date', icon: Calendar, label: 'Date', value: `${fmtDate(from)} → ${fmtDate(to)}` });
  }
  if (reportInfo.granularity) {
    infoItems.push({ key: 'grain', icon: Clock, label: 'Granularity', value: String(grain ?? '—') });
  }
  if (reportInfo.filters) {
    const value = filters && filters.length > 0 ? `${filters.length} active` : 'No filters';
    infoItems.push({ key: 'filters', icon: Filter, label: 'Filters', value });
  }

  const titleBlock = showReportName ? (
    <div className={cn('min-w-0 flex-1', headerAlignClass)}>
      <h1 className={titleClass} style={{ color: titleColor }}>
        {titleText}
      </h1>
      {subtitleText && <p className="text-sm mt-2 opacity-80">{subtitleText}</p>}
    </div>
  ) : (
    <div className="flex-1" />
  );

  const infoBlock =
    showInfoBlock && infoItems.length > 0 ? (
      <aside className="shrink-0 sm:max-w-sm w-full sm:w-auto">
        <div className="rounded-xl border border-outline-variant/20 bg-white/70 backdrop-blur-sm px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">Report Info</p>
          <dl className="space-y-1.5">
            {infoItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="flex items-start gap-2 text-xs">
                  <Icon className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                      {item.label}
                    </dt>
                    <dd className="text-xs font-semibold text-on-surface truncate">{item.value}</dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      </aside>
    ) : null;

  const photoBlock = showPhoto ? (
    <PhotoBox
      url={theme!.photoUrl!}
      width={photoSize}
      position={photoPosition}
      editable={editable}
      onResize={(w) => onThemePatch?.({ photoSize: w })}
      onPositionChange={(p) => onThemePatch?.({ photoPosition: p })}
    />
  ) : null;

  // Layout depends on photo position.
  if (photoPosition === 'top' || photoPosition === 'full') {
    return (
      <header className="w-full flex flex-col gap-4">
        {photoBlock}
        <div className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {titleBlock}
          {infoBlock}
        </div>
      </header>
    );
  }

  // Left or right placement: photo sits inline with the title.
  return (
    <header className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {photoPosition === 'left' && photoBlock}
        {titleBlock}
        {photoPosition === 'right' && photoBlock}
      </div>
      {infoBlock}
    </header>
  );
}

interface PhotoBoxProps {
  url: string;
  width: number;
  position: 'left' | 'right' | 'top' | 'full';
  editable: boolean;
  onResize: (w: number) => void;
  onPositionChange: (p: 'left' | 'right' | 'top' | 'full') => void;
}

function PhotoBox({ url, width, position, editable, onResize, onPositionChange }: PhotoBoxProps) {
  const startRef = useRef<{ x: number; y: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      // For 'right' position, drag-left should grow the image; mirror delta.
      const factor = position === 'right' ? -1 : 1;
      const next = Math.max(PHOTO_MIN, Math.min(PHOTO_MAX, startRef.current.w + dx * factor));
      onResize(Math.round(next));
    },
    [onResize, position],
  );

  const onPointerUp = useCallback(() => {
    startRef.current = null;
    setDragging(false);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const beginDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, y: e.clientY, w: width };
    setDragging(true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // 'full' fills the row; explicit width is ignored for full-width.
  const wrapperStyle: React.CSSProperties =
    position === 'full' ? { width: '100%' } : { width };

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-xl overflow-hidden border bg-white shadow-sm group',
        editable ? 'border-primary/30' : 'border-outline-variant/20',
        dragging && 'ring-2 ring-primary',
      )}
      style={wrapperStyle}
    >
      <img
        src={url}
        alt="Report"
        className={cn('w-full object-cover', position === 'full' ? 'h-48' : 'h-auto')}
        style={position === 'full' ? undefined : { maxHeight: Math.max(96, width * 0.9) }}
        draggable={false}
      />

      {editable && (
        <>
          {/* Position picker (top-left) */}
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Move className="w-3 h-3 mx-1 opacity-70" />
            {(['left', 'right', 'top', 'full'] as const).map((p) => (
              <button
                key={p}
                onClick={() => onPositionChange(p)}
                className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded transition-colors',
                  position === p ? 'bg-primary text-white' : 'hover:bg-white/15 text-white/80',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Size badge (top-right) */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {position === 'full' ? '100%' : `${width}px`}
          </div>

          {/* Resize handle (bottom-right corner) — disabled for 'full' since width is constrained */}
          {position !== 'full' && (
            <div
              onPointerDown={beginDrag}
              className={cn(
                'absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize bg-primary/90 text-white rounded-tl-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
                dragging && 'opacity-100',
              )}
              title="Drag to resize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M0 10 L10 0 M4 10 L10 4 M8 10 L10 8" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}
