import { Granularity, normalizeGranularity } from './types';

function parseLocalTemporalInput(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/,
  );
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalDateTimeValue(date: Date): string {
  return `${formatLocalDateValue(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** Get step in milliseconds for a granularity */
export function getStepMs(gran: Granularity | string): number {
  const g = normalizeGranularity(gran);
  switch (g) {
    case '15min': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    case '1w': return 7 * 24 * 60 * 60 * 1000;
  }
}

/** Normalize a timestamp to match the granularity format */
export function normalizeTimestamp(ts: string, gran: Granularity | string): string {
  if (!ts) return ts;
  const g = normalizeGranularity(gran);
  if (g === '1d' || g === '1w') return ts.slice(0, 10);
  return ts.slice(0, 19);
}

/** Build a complete timeline from start to end with given step */
export function buildTimeline(startDate: string, endDate: string, gran: Granularity | string): string[] {
  const g = normalizeGranularity(gran);
  const step = getStepMs(g);
  const start = parseLocalTemporalInput(startDate);
  const end = parseLocalTemporalInput(endDate);
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const points: string[] = [];
  const maxPoints = 3000;
  let cur = start.getTime();
  const endMs = end.getTime();
  while (cur <= endMs && points.length < maxPoints) {
    const d = new Date(cur);
    if (g === '1d' || g === '1w') {
      points.push(formatLocalDateValue(d));
    } else {
      points.push(formatLocalDateTimeValue(d));
    }
    cur += step;
  }
  return points;
}

const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

/** Format datetime for display on X-axis based on granularity */
export function formatAxisLabel(ts: string, gran: Granularity | string): string {
  const g = normalizeGranularity(gran);
  if (!ts) return '';
  try {
    const d = parseLocalTemporalInput(ts);
    if (!d) return ts.slice(0, 10);
    if (g === '15min' || g === '1h') {
      const dd = d.getDate().toString().padStart(2, '0');
      const mon = MONTH_NAMES[d.getMonth()];
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      return `${dd} ${mon}\n${hh}:${mm}`;
    }
    if (g === '1w') {
      return `S${getWeekNumber(d)}\n${d.getFullYear()}`;
    }
    const dd = d.getDate().toString().padStart(2, '0');
    const mon = MONTH_NAMES[d.getMonth()];
    return `${dd}\n${mon}`;
  } catch { return ts.slice(0, 10); }
}

/** Compute smart x-axis interval based on point count and available width */
export function smartXInterval(totalPts: number, chartWidthPx: number = 800): number {
  if (totalPts <= 0) return 0;
  const maxLabels = Math.max(4, Math.floor(chartWidthPx / 90));
  if (totalPts <= maxLabels) return 0;
  return Math.ceil(totalPts / maxLabels) - 1;
}

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
}

/** Format ISO datetime for shortcuts */
export function formatDateTime(d: Date): string {
  return formatLocalDateTimeValue(d);
}

/** Format date-only */
export function formatDate(d: Date): string {
  return formatLocalDateValue(d);
}

/**
 * Build ECharts markArea data to highlight Saturday/Sunday on a timeseries chart.
 * - granularity weekly+ → returns [] (no point)
 * - granularity daily → one tiny band per Sat/Sun point (centered on the day)
 * - granularity sub-daily → contiguous bands extended to the next non-weekend timestamp
 *
 * Each entry follows ECharts markArea format: [{ xAxis, itemStyle? }, { xAxis }]
 */
export function buildWeekendMarkAreas(
  timestamps: string[],
  granularity: string,
  color: string = 'rgba(148,163,184,0.14)'
): Array<Array<{ xAxis: string; itemStyle?: { color: string } }>> {
  if (!timestamps || timestamps.length === 0) return [];
  const g = (granularity || '').toLowerCase();
  // Skip for weekly/monthly granularities
  if (g.endsWith('w') || g.endsWith('mo') || g === '1mo' || g === 'week' || g === 'month') return [];

  const isSubDaily = g.endsWith('min') || g.endsWith('h') || g === '15m' || g === '30m';
  const isDaily = g === '1d' || g === 'day' || g === 'd';

  const out: Array<Array<{ xAxis: string; itemStyle?: { color: string } }>> = [];

  if (isDaily) {
    // Highlight each weekend day as a single-day band (start=end=that day's ts).
    // ECharts will render a thin vertical band centered on the category.
    for (const ts of timestamps) {
      const day = new Date(ts).getDay();
      if (day === 0 || day === 6) {
        out.push([{ xAxis: ts, itemStyle: { color } }, { xAxis: ts }]);
      }
    }
    return out;
  }

  // Sub-daily (or unknown): build contiguous spans covering Sat 00:00 → Mon 00:00.
  // We extend the band to the FIRST non-weekend timestamp after the last weekend point
  // so that the visible Sunday slot is fully covered.
  let bandStart: string | null = null;
  let lastWeekendTs: string | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const day = new Date(ts).getDay();
    const isWE = day === 0 || day === 6;
    if (isWE) {
      if (bandStart === null) bandStart = ts;
      lastWeekendTs = ts;
    } else if (bandStart !== null) {
      // Extend band end to current (first non-weekend) timestamp for full Sunday cover.
      out.push([{ xAxis: bandStart, itemStyle: { color } }, { xAxis: ts }]);
      bandStart = null;
      lastWeekendTs = null;
    }
  }
  if (bandStart !== null && lastWeekendTs !== null) {
    // Trailing weekend at the end of the timeline — close band on last weekend ts.
    out.push([{ xAxis: bandStart, itemStyle: { color } }, { xAxis: lastWeekendTs }]);
  }
  return out;
}
