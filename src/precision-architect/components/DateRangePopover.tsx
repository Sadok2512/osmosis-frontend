import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface Props {
  /** ISO datetime "YYYY-MM-DDTHH:mm" */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Show time inputs alongside date pills (defaults true) */
  showTime?: boolean;
}

function parseISO(iso: string): { date: Date | undefined; time: string } {
  if (!iso) return { date: undefined, time: '00:00' };
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return { date: undefined, time: '00:00' };
  return { date: new Date(y, m - 1, day), time: t.slice(0, 5) };
}

function toISO(date: Date, time: string): string {
  return `${format(date, 'yyyy-MM-dd')}T${time}`;
}

/**
 * Unified date range picker mirroring the Investigator's Début/Fin dual-calendar UX.
 * Single popover containing two side-by-side calendars with inline time pickers.
 */
const DateRangePopover: React.FC<Props> = ({ from, to, onChange, showTime = true }) => {
  const { date: startDate, time: startTime } = parseISO(from);
  const { date: endDate, time: endTime } = parseISO(to);

  const handleStartDate = (d: Date | undefined) => {
    if (!d) return;
    const newFrom = toISO(d, startTime);
    // Keep end if it's after new start, otherwise snap to start
    const keepEnd = endDate && endDate >= d;
    const newTo = keepEnd ? to : toISO(d, endTime);
    onChange(newFrom, newTo);
  };

  const handleEndDate = (d: Date | undefined) => {
    if (!d) return;
    onChange(from, toISO(d, endTime));
  };

  const handleStartTime = (t: string) => {
    if (!startDate) return;
    onChange(toISO(startDate, t), to);
  };

  const handleEndTime = (t: string) => {
    if (!endDate) return;
    onChange(from, toISO(endDate, t));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1.5 cursor-pointer">
          {/* Start pill */}
          <div className="flex items-center h-9 rounded-full border border-outline-variant/30 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-primary transition-colors">
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 px-3 h-full text-xs font-bold text-on-surface',
                !startDate && 'text-on-surface-variant',
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-on-surface-variant" />
              {startDate ? format(startDate, 'dd/MM/yyyy') : 'Début'}
            </button>
            {showTime && startDate && (
              <>
                <div className="w-px h-4 bg-outline-variant/40" />
                <input
                  type="time"
                  value={startTime}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleStartTime(e.target.value)}
                  className="h-full w-[68px] px-1.5 text-xs font-medium bg-transparent text-on-surface border-none outline-none focus:bg-surface-container-low/50 transition-colors"
                />
              </>
            )}
          </div>
          <span className="text-on-surface-variant/60 font-bold select-none">—</span>
          {/* End pill */}
          <div className="flex items-center h-9 rounded-full border border-outline-variant/30 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-primary transition-colors">
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 px-3 h-full text-xs font-bold text-on-surface',
                !endDate && 'text-on-surface-variant',
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-on-surface-variant" />
              {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fin'}
            </button>
            {showTime && endDate && (
              <>
                <div className="w-px h-4 bg-outline-variant/40" />
                <input
                  type="time"
                  value={endTime}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleEndTime(e.target.value)}
                  className="h-full w-[68px] px-1.5 text-xs font-medium bg-transparent text-on-surface border-none outline-none focus:bg-surface-container-low/50 transition-colors"
                />
              </>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 origin-top-left scale-90" align="start">
        <div className="flex gap-0 divide-x divide-outline-variant/30">
          {/* Start calendar */}
          <div className="flex flex-col">
            <div className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              Début
            </div>
            <Calendar
              mode="single"
              selected={startDate}
              defaultMonth={startDate || new Date()}
              onSelect={handleStartDate}
              today={undefined}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </div>
          {/* End calendar */}
          <div className="flex flex-col">
            <div className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              Fin
            </div>
            <Calendar
              mode="single"
              selected={endDate}
              defaultMonth={endDate || startDate || new Date()}
              disabled={(date) => !!startDate && date < startDate}
              onSelect={handleEndDate}
              today={undefined}
              modifiers={startDate ? { rangeStart: startDate } : undefined}
              modifiersStyles={{
                rangeStart: {
                  border: '2px solid hsl(var(--primary))',
                  borderRadius: '6px',
                  fontWeight: 700,
                },
              }}
              className="p-3 pointer-events-auto"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePopover;
