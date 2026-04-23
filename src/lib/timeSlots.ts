/**
 * Generate all expected time slots for a given date range and granularity.
 * Used to fill gaps in timeseries charts and tables so the full requested
 * period is always displayed — even when the backend returns no data for
 * some slots.
 */
export function generateTimeSlots(
  dateFrom: string,
  dateTo: string,
  granularity: string,
): string[] {
  const slots: string[] = [];
  const start = new Date(dateFrom + 'T00:00:00Z');
  const end = new Date(dateTo + 'T23:59:59Z');

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return slots;

  const gran = granularity?.toLowerCase() || '1d';
  const cursor = new Date(start);

  if (gran === '15min' || gran === '15m') {
    // Backend format: "2026-04-14T08:15:00" (Python datetime.isoformat())
    while (cursor <= end) {
      slots.push(cursor.toISOString().slice(0, 19));
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
    }
  } else if (gran === '1h' || gran === 'hour') {
    // Backend format: "2026-04-14T08:00:00"
    while (cursor <= end) {
      slots.push(cursor.toISOString().slice(0, 19));
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
  } else if (gran === '1w' || gran === 'week') {
    // Align to Monday
    const day = cursor.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setUTCDate(cursor.getUTCDate() + diff);
    while (cursor <= end) {
      slots.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else {
    // Default: 1d (daily)
    while (cursor <= end) {
      slots.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return slots;
}

/**
 * Merge generated time slots with data-derived timestamps.
 * Returns a sorted, deduplicated array that includes ALL generated slots
 * plus any data timestamps that might use a slightly different format.
 */
export function mergeTimeSlots(
  generated: string[],
  fromData: string[],
): string[] {
  const set = new Set(generated);
  for (const ts of fromData) set.add(ts);
  return [...set].sort();
}
