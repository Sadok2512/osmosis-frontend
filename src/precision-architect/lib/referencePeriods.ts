import { getApiHeaders, getApiUrl } from '@/lib/apiConfig';
import type { ReferencePeriod, ReferencePeriodRule } from '../types';

export const DEFAULT_REFERENCE_PERIODS: ReferencePeriod[] = [
  {
    id: 'last_7_days',
    name: 'Last 7 days',
    rule: { type: 'relative', value: 7, unit: 'days', end: 'now' },
    description: 'Rolling 7-day period ending now.',
    order: 10,
    isDefault: true,
    enabled: true,
  },
  {
    id: 'last_30_days',
    name: 'Last 30 days',
    rule: { type: 'relative', value: 30, unit: 'days', end: 'now' },
    description: 'Rolling 30-day period ending now.',
    order: 20,
    enabled: true,
  },
  {
    id: 'month_to_date',
    name: 'Month to date',
    rule: { type: 'month_to_date' },
    description: 'From the first day of the current month up to now.',
    order: 30,
    enabled: true,
  },
  {
    id: 'previous_month',
    name: 'Previous month',
    rule: { type: 'previous_month' },
    description: 'Full previous calendar month.',
    order: 40,
    enabled: true,
  },
  {
    id: 'quarter_to_date',
    name: 'Quarter to date',
    rule: { type: 'quarter_to_date' },
    description: 'From the first day of the current quarter up to now.',
    order: 50,
    enabled: true,
  },
];

function normalizeReferencePeriod(raw: any): ReferencePeriod | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || raw.period_id || raw.key || '').trim();
  const name = String(raw.name || raw.display_name || raw.label || id).trim();
  const rule = raw.rule || raw.definition || raw.period_definition;
  if (!id || !name || !rule) return null;
  return {
    id,
    name,
    rule,
    description: raw.description || undefined,
    order: Number.isFinite(Number(raw.order ?? raw.sort_order)) ? Number(raw.order ?? raw.sort_order) : undefined,
    isDefault: Boolean(raw.isDefault ?? raw.is_default),
    enabled: raw.enabled ?? raw.is_active ?? true,
    color: raw.color || undefined,
    createdBy: raw.createdBy || raw.created_by || undefined,
    scope: raw.scope === 'global' || raw.scope === 'user' ? raw.scope : undefined,
    type: raw.type || (rule && typeof rule === 'object' ? rule.type : undefined) || undefined,
    compareMode: (() => {
      const v = raw.compareMode || raw.compare_mode;
      return v === 'overlay' || v === 'delta' || v === 'trend' || v === 'baseline' ? v : undefined;
    })(),
  };
}

export async function listReferencePeriods(): Promise<ReferencePeriod[]> {
  try {
    const res = await fetch(getApiUrl('config/reference-periods'), { headers: getApiHeaders() });
    if (!res.ok) throw new Error(`Reference periods API ${res.status}`);
    const json = await res.json();
    const raw = Array.isArray(json) ? json : (json.items || json.periods || json.reference_periods || []);
    const periods = raw.map(normalizeReferencePeriod).filter(Boolean) as ReferencePeriod[];
    return sortReferencePeriods(periods.length > 0 ? periods : DEFAULT_REFERENCE_PERIODS);
  } catch (err) {
    console.warn('[ReferencePeriods] Backend unavailable, using built-in defaults:', err);
    return sortReferencePeriods(DEFAULT_REFERENCE_PERIODS);
  }
}

export async function createReferencePeriod(period: ReferencePeriod): Promise<ReferencePeriod> {
  return writeReferencePeriod('POST', 'config/reference-periods', period);
}

export async function updateReferencePeriod(id: string, patch: Partial<ReferencePeriod>): Promise<ReferencePeriod> {
  return writeReferencePeriod('PUT', `config/reference-periods/${encodeURIComponent(id)}`, patch);
}

export async function disableReferencePeriod(id: string): Promise<void> {
  const res = await fetch(getApiUrl(`config/reference-periods/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`Reference period delete failed: ${res.status}`);
}

async function writeReferencePeriod(method: 'POST' | 'PUT', path: string, body: unknown): Promise<ReferencePeriod> {
  const res = await fetch(getApiUrl(path), {
    method,
    headers: getApiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Reference period write failed: ${res.status}`);
  const json = await res.json();
  return normalizeReferencePeriod(json) || (json as ReferencePeriod);
}

export function sortReferencePeriods(periods: ReferencePeriod[]): ReferencePeriod[] {
  return [...periods]
    .filter(p => p.enabled !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

export function resolveReferencePeriodRange(period: ReferencePeriod | undefined, now = new Date()): { from: string; to: string; label: string } {
  const selected = period || DEFAULT_REFERENCE_PERIODS.find(p => p.isDefault) || DEFAULT_REFERENCE_PERIODS[0];
  const to = now;
  let from = new Date(to);
  const rule: ReferencePeriodRule = selected.rule;

  if (rule.type === 'relative') {
    const multipliers: Record<typeof rule.unit, number> = {
      hours: 3_600_000,
      days: 86_400_000,
      weeks: 7 * 86_400_000,
      months: 30 * 86_400_000,
    };
    from = new Date(to.getTime() - rule.value * multipliers[rule.unit]);
  } else if (rule.type === 'month_to_date') {
    from = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0);
  } else if (rule.type === 'previous_month') {
    from = new Date(to.getFullYear(), to.getMonth() - 1, 1, 0, 0, 0, 0);
    const prevEnd = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0);
    return { from: toApiDate(from), to: toApiDate(prevEnd), label: selected.name };
  } else if (rule.type === 'quarter_to_date') {
    const quarterStartMonth = Math.floor(to.getMonth() / 3) * 3;
    from = new Date(to.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
  } else if (rule.type === 'custom') {
    return { from: normalizeApiDate(rule.from), to: normalizeApiDate(rule.to), label: selected.name };
  }

  return { from: toApiDate(from), to: toApiDate(to), label: selected.name };
}

function toApiDate(d: Date): string {
  return d.toISOString().slice(0, 19);
}

function normalizeApiDate(raw: string): string {
  if (!raw) return raw;
  if (/T\d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  if (/T\d{2}:\d{2}/.test(raw)) return `${raw}:00`;
  if (!raw.includes('T')) return `${raw}T00:00:00`;
  return raw;
}
