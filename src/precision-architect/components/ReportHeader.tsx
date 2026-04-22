import { cn } from '@/lib/utils';
import { Calendar, MapPin, Clock, Filter } from 'lucide-react';
import { usePAGlobalToolbar } from '../stores/paGlobalToolbarStore';
import type { DashboardTheme } from '../types';

interface ReportHeaderProps {
  theme: DashboardTheme | undefined;
  projectName: string;
  pageName?: string;
  /** Visual scale: 'editor' | 'viewer' | 'presentation'. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Renders the report header with two independent blocks:
 *  - Report Name (left): controlled by `theme.showReportName`
 *  - Report Info (right): controlled by `theme.reportInfo.show` and per-field flags
 *
 * Both blocks are managed separately and rendered in a single flex row so they
 * sit on opposite sides of the page header.
 */
export default function ReportHeader({ theme, projectName, pageName, size = 'md' }: ReportHeaderProps) {
  const technos = usePAGlobalToolbar((s) => s.applied?.technos ?? s.technos);
  const from = usePAGlobalToolbar((s) => s.applied?.from ?? s.from);
  const to = usePAGlobalToolbar((s) => s.applied?.to ?? s.to);
  const grain = usePAGlobalToolbar((s) => s.applied?.grain ?? s.grain);
  const filters = usePAGlobalToolbar((s) => s.applied?.filters ?? s.filters);

  const showReportName = theme?.showReportName !== false;
  const reportInfo = theme?.reportInfo ?? { show: true, perimeter: true, date: true, granularity: true, filters: true };
  const showInfoBlock = reportInfo.show !== false;
  const showPhoto = !!theme?.showPhoto && !!theme?.photoUrl;

  const titleColor = theme?.titleColor || theme?.accentColor;
  const headerAlignClass = theme?.headerAlign === 'center' ? 'text-center' : theme?.headerAlign === 'right' ? 'text-right' : 'text-left';

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

  // If the user disabled ALL blocks, render nothing.
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

  return (
    <header className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {showPhoto && (
          <div className="shrink-0 rounded-xl overflow-hidden border border-outline-variant/20 shadow-sm bg-white">
            <img
              src={theme!.photoUrl!}
              alt="Report"
              className={cn(
                'object-cover',
                size === 'lg' ? 'w-32 h-32' : size === 'sm' ? 'w-12 h-12' : 'w-20 h-20',
              )}
            />
          </div>
        )}
        {showReportName ? (
          <div className={cn('min-w-0 flex-1', headerAlignClass)}>
            <h1 className={titleClass} style={{ color: titleColor }}>
              {titleText}
            </h1>
            {subtitleText && <p className="text-sm mt-2 opacity-80">{subtitleText}</p>}
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {showInfoBlock && infoItems.length > 0 && (
        <aside className="shrink-0 sm:max-w-sm w-full sm:w-auto">
          <div className="rounded-xl border border-outline-variant/20 bg-white/70 backdrop-blur-sm px-4 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">
              Report Info
            </p>
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
      )}
    </header>
  );
}
