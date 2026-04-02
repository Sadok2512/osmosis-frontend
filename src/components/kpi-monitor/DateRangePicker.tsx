import React, { useState, useMemo, useCallback } from 'react';
import { format, parse, isAfter, isBefore, isSameDay, startOfMonth, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, RotateCcw, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/* ── Types ── */
interface DateRangePickerProps {
  dateFrom: string;       // YYYY-MM-DD
  dateTo: string;         // YYYY-MM-DD
  timeFrom: string;       // HH:mm
  timeTo: string;         // HH:mm
  granularity: string;
  activePreset: string | null;
  onDateChange: (from: string, to: string) => void;
  onTimeChange: (from: string, to: string) => void;
  onPresetChange: (preset: string | null) => void;
  minDate?: string;       // YYYY-MM-DD
}

/* ── Quick presets ── */
const PRESETS = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7j', days: 7 },
  { key: '14d', label: '14j', days: 14 },
  { key: '30d', label: '30j', days: 30 },
  { key: '90d', label: '90j', days: 90 },
];

const WEEK_PRESETS = [
  { key: 'w0', label: 'Cette sem.', offset: 0 },
  { key: 'w1', label: 'Sem. -1', offset: 1 },
  { key: 'w2', label: 'Sem. -2', offset: 2 },
];

/* ── Time options ── */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

/* ── Calendar Mini ── */
const WEEKDAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

const MiniCalendar: React.FC<{
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedStart: Date;
  selectedEnd: Date;
  selecting: 'start' | 'end';
  hoveredDate: Date | null;
  onHover: (d: Date | null) => void;
  onSelect: (d: Date) => void;
  minDate?: Date;
}> = ({ month, onMonthChange, selectedStart, selectedEnd, selecting, hoveredDate, onHover, onSelect, minDate }) => {
  const year = month.getFullYear();
  const mo = month.getMonth();

  const firstDay = new Date(year, mo, 1);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  startDow -= 1; // Monday=0

  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mo, d));

  const isInRange = (d: Date) => {
    const s = selecting === 'end' && hoveredDate ? selectedStart : selectedStart;
    const e = selecting === 'end' && hoveredDate ? hoveredDate : selectedEnd;
    return isAfter(d, s) && isBefore(d, e);
  };

  const isDisabled = (d: Date) => {
    if (minDate && isBefore(d, minDate)) return true;
    if (selecting === 'end' && isBefore(d, selectedStart)) return true;
    return false;
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={() => onMonthChange(subMonths(month, 1))} className="p-1 rounded-md hover:bg-muted transition-colors">
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <span className="text-xs font-semibold text-foreground capitalize">
          {format(month, 'MMMM yyyy', { locale: fr })}
        </span>
        <button onClick={() => onMonthChange(addMonths(month, 1))} className="p-1 rounded-md hover:bg-muted transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAY_LABELS.map(l => (
          <div key={l} className="h-6 flex items-center justify-center text-[9px] font-bold text-muted-foreground/60 uppercase">
            {l}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="h-7" />;
          const disabled = isDisabled(d);
          const isStart = isSameDay(d, selectedStart);
          const isEnd = isSameDay(d, selectedEnd);
          const inRange = isInRange(d);
          const isToday = isSameDay(d, new Date());
          const isHovered = hoveredDate && isSameDay(d, hoveredDate);

          return (
            <button
              key={d.toISOString()}
              disabled={disabled}
              onMouseEnter={() => !disabled && onHover(d)}
              onMouseLeave={() => onHover(null)}
              onClick={() => !disabled && onSelect(d)}
              className={cn(
                'h-7 w-full flex items-center justify-center text-[11px] transition-all rounded-md relative',
                disabled && 'text-muted-foreground/25 cursor-not-allowed',
                !disabled && !isStart && !isEnd && !inRange && 'hover:bg-muted cursor-pointer text-foreground',
                inRange && 'bg-primary/8 text-foreground',
                isStart && 'bg-primary text-primary-foreground font-bold rounded-r-none',
                isEnd && 'bg-primary text-primary-foreground font-bold rounded-l-none',
                isStart && isEnd && 'rounded-md',
                isToday && !isStart && !isEnd && 'ring-1 ring-primary/40 font-semibold',
                isHovered && !disabled && !isStart && !isEnd && 'bg-primary/15',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Time Picker ── */
const TimePicker: React.FC<{
  label: string;
  value: string; // HH:mm
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => {
  const [h, m] = value.split(':');
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase w-10">{label}</span>
      <select
        value={h}
        onChange={e => onChange(`${e.target.value}:${m}`)}
        className="h-7 w-14 rounded-md border border-border/40 bg-background text-[11px] text-foreground text-center outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
      >
        {HOURS.map(hr => <option key={hr} value={hr}>{hr}h</option>)}
      </select>
      <span className="text-muted-foreground/40 text-xs">:</span>
      <select
        value={m}
        onChange={e => onChange(`${h}:${e.target.value}`)}
        className="h-7 w-14 rounded-md border border-border/40 bg-background text-[11px] text-foreground text-center outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
      >
        {MINUTES.map(mi => <option key={mi} value={mi}>{mi}</option>)}
      </select>
    </div>
  );
};

/* ── Main DateRangePicker ── */
const DateRangePicker: React.FC<DateRangePickerProps> = ({
  dateFrom, dateTo, timeFrom, timeTo,
  granularity, activePreset,
  onDateChange, onTimeChange, onPresetChange,
  minDate,
}) => {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const startDate = useMemo(() => parse(dateFrom, 'yyyy-MM-dd', new Date()), [dateFrom]);
  const endDate = useMemo(() => parse(dateTo, 'yyyy-MM-dd', new Date()), [dateTo]);
  const minDateObj = useMemo(() => minDate ? parse(minDate, 'yyyy-MM-dd', new Date()) : undefined, [minDate]);

  // Calendar month — always derived fresh on open
  const [calMonth, setCalMonth] = useState(() => startOfMonth(startDate));

  // When opening, sync month to current selection
  const handleOpen = useCallback((isOpen: boolean) => {
    if (isOpen) {
      // Parse fresh from props to avoid stale closure
      const freshStart = parse(dateFrom, 'yyyy-MM-dd', new Date());
      const targetDate = freshStart && !isNaN(freshStart.getTime()) ? freshStart : new Date();
      setCalMonth(startOfMonth(targetDate));
      setSelecting('start');
      setHoveredDate(null);
    }
    setOpen(isOpen);
  }, [dateFrom]);

  // Sync calMonth when dates change externally (e.g. from other UI) while open
  React.useEffect(() => {
    if (open) {
      const target = selecting === 'end' ? endDate : startDate;
      setCalMonth(startOfMonth(target));
    }
  }, [dateFrom, dateTo]); // intentionally depend on string props for external changes

  const showTimePicker = ['15m', '1h'].includes(granularity);

  const handleDateSelect = useCallback((d: Date) => {
    const formatted = format(d, 'yyyy-MM-dd');
    if (selecting === 'start') {
      // If new start is after current end, reset end = start
      if (isAfter(d, endDate)) {
        onDateChange(formatted, formatted);
      } else {
        onDateChange(formatted, dateTo);
      }
      setSelecting('end');
      onPresetChange(null);
    } else {
      // end date — guaranteed >= start by disabled logic
      onDateChange(dateFrom, formatted);
      setSelecting('start');
      onPresetChange(null);
    }
  }, [selecting, dateFrom, dateTo, endDate, onDateChange, onPresetChange]);

  const applyPreset = useCallback((key: string, days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    onDateChange(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'));
    onTimeChange('00:00', '23:59');
    onPresetChange(key);
    setCalMonth(startOfMonth(from));
  }, [onDateChange, onTimeChange, onPresetChange]);

  const applyWeekPreset = useCallback((key: string, offset: number) => {
    const now = new Date();
    const dow = now.getDay() || 7;
    const mon = new Date(now.getTime() - (dow - 1) * 86400000 - offset * 7 * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    onDateChange(
      format(mon, 'yyyy-MM-dd'),
      offset === 0 ? format(now, 'yyyy-MM-dd') : format(sun, 'yyyy-MM-dd'),
    );
    onTimeChange('00:00', '23:59');
    onPresetChange(key);
    setCalMonth(startOfMonth(mon));
  }, [onDateChange, onTimeChange, onPresetChange]);

  const handleReset = useCallback(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    onDateChange(format(weekAgo, 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'));
    onTimeChange('00:00', '23:59');
    onPresetChange(null);
    setCalMonth(startOfMonth(weekAgo));
    setSelecting('start');
  }, [onDateChange, onTimeChange, onPresetChange]);

  // Summary text
  const summary = useMemo(() => {
    const fmtStart = format(startDate, 'dd MMM yyyy', { locale: fr });
    const fmtEnd = format(endDate, 'dd MMM yyyy', { locale: fr });
    const timePart = showTimePicker ? ` ${timeFrom} → ${timeTo}` : '';
    if (isSameDay(startDate, endDate)) return `${fmtStart}${timePart}`;
    return `${fmtStart} → ${fmtEnd}${timePart}`;
  }, [startDate, endDate, timeFrom, timeTo, showTimePicker]);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 h-[30px] px-3 rounded-lg border text-[11px] font-medium transition-all',
            'border-border/40 bg-background hover:bg-muted/30 hover:border-border text-foreground',
            activePreset && 'border-primary/30 bg-primary/5',
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          <span className="tabular-nums truncate max-w-[280px]">{summary}</span>
          {activePreset && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-bold uppercase">
              {activePreset}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 overflow-hidden" align="start" sideOffset={8}>
        <div className="flex">
          {/* Left: Presets */}
          <div className="w-[120px] border-r border-border/30 bg-muted/20 p-2 space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1 mb-2">Raccourcis</p>
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key, p.days)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all',
                  activePreset === p.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="h-px bg-border/30 my-1.5" />
            {WEEK_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyWeekPreset(p.key, p.offset)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all',
                  activePreset === p.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="h-px bg-border/30 my-1.5" />
            <button
              onClick={handleReset}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          {/* Right: Calendar + Time */}
          <div className="p-3 space-y-3">
            {/* Selection mode indicator */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelecting('start'); setCalMonth(startOfMonth(startDate)); }}
                className={cn(
                  'flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all',
                  selecting === 'start'
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/30'
                )}
              >
                <span className="text-[9px] uppercase font-bold">Début</span>
                <span className="tabular-nums">{format(startDate, 'dd/MM/yyyy')}</span>
              </button>
              <span className="text-muted-foreground/30 text-xs">→</span>
              <button
                onClick={() => { setSelecting('end'); setCalMonth(startOfMonth(endDate)); }}
                className={cn(
                  'flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all',
                  selecting === 'end'
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/30'
                )}
              >
                <span className="text-[9px] uppercase font-bold">Fin</span>
                <span className="tabular-nums">{format(endDate, 'dd/MM/yyyy')}</span>
              </button>
            </div>

            {/* Calendar */}
            <MiniCalendar
              month={calMonth}
              onMonthChange={setCalMonth}
              selectedStart={startDate}
              selectedEnd={endDate}
              selecting={selecting}
              hoveredDate={hoveredDate}
              onHover={setHoveredDate}
              onSelect={handleDateSelect}
              minDate={minDateObj}
            />

            {/* Time pickers (only for sub-day granularity) */}
            {showTimePicker && (
              <div className="border-t border-border/30 pt-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3 text-primary/60" />
                  <span className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-wider">Heure</span>
                </div>
                <TimePicker label="Début" value={timeFrom} onChange={v => onTimeChange(v, timeTo)} />
                <TimePicker label="Fin" value={timeTo} onChange={v => onTimeChange(timeFrom, v)} />
              </div>
            )}

            {/* Summary */}
            <div className="border-t border-border/30 pt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                {summary}
              </span>
              <span className={cn(
                'text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full',
                selecting === 'start'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-accent text-accent-foreground'
              )}>
                {selecting === 'start' ? '← Sélectionnez le début' : '← Sélectionnez la fin'}
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
