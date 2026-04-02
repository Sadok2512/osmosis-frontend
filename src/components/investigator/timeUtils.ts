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
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return [];

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

/** Format datetime for display on X-axis based on granularity */
export function formatAxisLabel(ts: string, gran: Granularity | string): string {
  const g = normalizeGranularity(gran);
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (g === '15min' || g === '1h') {
      return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }
    if (g === '1w') {
      return `S${getWeekNumber(d)} ${d.getFullYear()}`;
    }
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
  } catch { return ts.slice(0, 10); }
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
