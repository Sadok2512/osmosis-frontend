// Alarm Center service — wires the AlarmCenterPage to the real
// fm_alarms backend (osmosis-parser /api/v1/alarms/*).
//
// Mock-to-real mapping decided in the BMad roundtable:
//   - alarm_severity (CRITICAL|MAJOR|MINOR|WARNING) → severity (Title-case)
//   - alarm_status (RAISED|CLEARED) + ack_status (UNACK|ACK) → status (Active|Acknowledged|Cleared)
//   - alarm_text + specific_problem  → name (with type as separate column)
//   - plaque                          → region (renamed at UI level)
//   - rca:bool / kpis[]               → DROPPED until backend exposes them
//
// All endpoints require auth — calls go through the same fetch helper as
// other admin services so the session cookie is forwarded automatically.

import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

// ── Backend row shape (mirrors fm_alarms columns) ─────────────────
export interface BackendAlarm {
  id:               number;
  alarm_id:         string | null;
  vendor:           string | null;
  alarm_severity:   'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | null;
  alarm_status:     'RAISED' | 'CLEARED' | null;
  ack_status:       'UNACK' | 'ACK' | null;
  alarm_type:       string | null;
  site_name:        string | null;
  cell_name:        string | null;
  plaque:           string | null;
  dor:              string | null;
  zone_arcep:       string | null;
  bande:            string | null;
  alarm_time:       string | null;
  cancel_time:      string | null;
  ack_time:         string | null;
  duration_min:     number | null;
  probable_cause:   string | null;
  specific_problem: string | null;
  alarm_text:       string | null;
  acked_by:         string | null;
  cancelled_by:     string | null;
  generation_time:  string | null;
}

// ── UI shape (matches the existing AlarmCenterPage Alarm interface) ─
export type Severity = 'Critical' | 'Major' | 'Minor' | 'Warning';
export type Status   = 'Active' | 'Acknowledged' | 'Cleared';

export interface UiAlarm {
  id:                string;
  backendId:         number;
  name:              string;
  type:              string;
  severity:          Severity;
  site:              string;
  cell:              string;
  vendor:            string;
  region:            string;       // = plaque (UI label kept for compat)
  startTime:         string;
  duration:          string;
  status:            Status;
  probableCause:     string;
  specificProblem:   string;
  alarmId:           string;
  ackedBy:           string;
  ackedAt:           string;
}

// ── Filters / pagination ──────────────────────────────────────────
export interface ListAlarmsParams {
  severity?:    Severity[];
  vendor?:      string[];
  status?:      Array<'RAISED' | 'CLEARED'>;
  ack_status?:  Array<'UNACK' | 'ACK'>;
  plaque?:      string[];
  site_name?:   string;
  cell_name?:   string;
  search?:      string;
  date_from?:   string;
  date_to?:     string;
  page?:        number;
  limit?:       number;
}

export interface ListAlarmsResponse {
  items:  BackendAlarm[];
  total:  number;
  page:   number;
  limit:  number;
  pages:  number;
}

const SEVERITY_MAP: Record<string, Severity> = {
  CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor', WARNING: 'Warning',
};

function deriveStatus(a: BackendAlarm): Status {
  if (a.alarm_status === 'CLEARED')   return 'Cleared';
  if (a.ack_status   === 'ACK')       return 'Acknowledged';
  return 'Active';
}

function fmtDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  // Show HH:MM:SS in user's locale; the date is implicit in the table grouping
  try {
    return new Date(iso).toLocaleTimeString('fr-FR');
  } catch { return iso; }
}

/** Backend → UI mapping. Honest: no fake `rca:bool`, no fake `kpis[]`,
 *  no fake `region` mismatch — `region` is just `plaque` renamed for the
 *  legacy UI label. */
export function toUiAlarm(a: BackendAlarm): UiAlarm {
  return {
    id:               String(a.id),
    backendId:        a.id,
    name:             a.specific_problem || a.alarm_text || a.alarm_type || '—',
    type:             a.alarm_type || '—',
    severity:         SEVERITY_MAP[a.alarm_severity || ''] || 'Warning',
    site:             a.site_name || '—',
    cell:             a.cell_name || '—',
    vendor:           a.vendor || '—',
    region:           a.plaque || '—',          // UI label = "Region", data = plaque
    startTime:        fmtTime(a.alarm_time),
    duration:         fmtDuration(a.duration_min),
    status:           deriveStatus(a),
    probableCause:    a.probable_cause || '—',
    specificProblem:  a.specific_problem || '—',
    alarmId:          a.alarm_id || '—',
    ackedBy:          a.acked_by || '',
    ackedAt:          a.ack_time || '',
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────
function buildQs(p: ListAlarmsParams): string {
  const qs = new URLSearchParams();
  if (p.severity?.length)
    qs.set('severity', p.severity.map(s => s.toUpperCase()).join(','));
  if (p.vendor?.length)     qs.set('vendor',     p.vendor.join(','));
  if (p.status?.length)     qs.set('status',     p.status.join(','));
  if (p.ack_status?.length) qs.set('ack_status', p.ack_status.join(','));
  if (p.plaque?.length)     qs.set('plaque',     p.plaque.join(','));
  if (p.site_name)          qs.set('site_name',  p.site_name);
  if (p.cell_name)          qs.set('cell_name',  p.cell_name);
  if (p.search)             qs.set('search',     p.search);
  if (p.date_from)          qs.set('date_from',  p.date_from);
  if (p.date_to)            qs.set('date_to',    p.date_to);
  qs.set('page',  String(p.page  ?? 1));
  qs.set('limit', String(p.limit ?? 100));
  return qs.toString();
}

async function _get<T>(path: string): Promise<T> {
  const url = getApiUrl(`alarms${path}`);
  const r = await fetch(url, { headers: getApiHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`GET ${url} failed (${r.status})`);
  return r.json() as Promise<T>;
}

async function _post<T>(path: string, body: unknown): Promise<T> {
  const url = getApiUrl(`alarms${path}`);
  const r = await fetch(url, {
    method:      'POST',
    headers:     getApiHeaders(),
    credentials: 'include',
    body:        JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} failed (${r.status})`);
  return r.json() as Promise<T>;
}

/** Fetch alarms — defaults match Sally's UX: RAISED + Critical/Major
 *  + last 24h (caller may override). */
export async function fetchAlarms(params: ListAlarmsParams = {}): Promise<UiAlarm[]> {
  const qs = buildQs(params);
  const resp = await _get<ListAlarmsResponse>(`?${qs}`);
  return (resp.items || []).map(toUiAlarm);
}

export async function fetchAlarmsRaw(params: ListAlarmsParams = {}): Promise<ListAlarmsResponse> {
  const qs = buildQs(params);
  return _get<ListAlarmsResponse>(`?${qs}`);
}

export interface AlarmsStats {
  by_severity: Record<string, number>;
  by_vendor:   Record<string, number>;
  by_status:   Record<string, number>;
  by_plaque:   Record<string, number>;
}

export async function fetchAlarmsStats(): Promise<AlarmsStats> {
  return _get<AlarmsStats>('/stats');
}

/** Acknowledge a single alarm (writes ack_status=ACK, acked_by, ack_time). */
export async function ackAlarm(id: number, opts?: { by?: string; comment?: string }): Promise<BackendAlarm> {
  return _post<BackendAlarm>(`/${id}/ack`, opts || {});
}

/** Manual clear — overrides vendor when no auto cancel arrived. Use sparingly. */
export async function clearAlarm(id: number, opts?: { by?: string }): Promise<BackendAlarm> {
  return _post<BackendAlarm>(`/${id}/clear`, opts || {});
}

export interface BulkAckResponse {
  acked:   number;
  failed:  number[];
  results: Array<{ id: number; status: 'ACK' | 'skipped' }>;
}

/** Atomic bulk ack — Sally's contract: never lie about partial success. */
export async function bulkAckAlarms(
  ids: number[],
  opts?: { by?: string; comment?: string },
): Promise<BulkAckResponse> {
  return _post<BulkAckResponse>('/bulk-ack', { ids, ...(opts || {}) });
}
