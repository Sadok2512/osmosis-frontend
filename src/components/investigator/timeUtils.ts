import { Granularity, normalizeGranularity } from './types';

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
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const points: string[] = [];
  const maxPoints = 3000;
  let cur = start.getTime();
  const endMs = end.getTime();
  while (cur <= endMs && points.length < maxPoints) {
    const d = new Date(cur);
    if (g === '1d' || g === '1w') {
      points.push(d.toISOString().slice(0, 10));
    } else {
      points.push(d.toISOString().slice(0, 19));
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
    const d = new Date(ts);
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
  return d.toISOString().slice(0, 19);
}

/** Format date-only */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
