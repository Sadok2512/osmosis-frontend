// NOC Ticket service — wires TicketManagementPage to the real backend
// (osmosis-parser /api/v1/tickets/*).
//
// Mock → real mapping decided in the BMad roundtable (party-mode 2026-05-16):
//   - severity (critical|major|minor|warning) ↔ Title-case (Critical|Major|Minor|Warning)
//   - status   (open|in_progress|resolved|closed|cancelled) → UI 6-state with
//     `Investigating`/`Assigned`/`Escalated` derived from escalation_level + assignee_id
//   - RCA fields DROPPED entirely (V1 scope, will live in SentinelRCA.tsx)
//
// Auth in V1: pass X-User-Id header (admin auth wiring is V1.1).

import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

// ── Backend types (mirror app/schemas/ticket.py) ─────────────────

export type BackendSeverity = 'critical' | 'major' | 'minor' | 'warning';
export type BackendStatus   = 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';

export interface BackendTicket {
  id: number;
  ref: string | null;
  incident_id: number | null;
  fingerprint: string | null;
  title: string;
  description: string | null;
  severity: BackendSeverity;
  status: BackendStatus;
  reporter_id: number;
  assignee_id: number | null;
  assignee_role_id: number | null;
  target_kind: string | null;
  target_ref: string | null;
  sla_policy_id: number | null;
  sla_response_due_at: string | null;
  sla_resolve_due_at: string | null;
  escalation_level: number;
  last_escalated_at: string | null;
  acked_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BackendUser {
  id: number;
  email: string;
  display_name: string;
  role_id: number;
  team: string | null;
  active: boolean;
}

export interface BackendRole {
  id: number;
  code: string;
  label: string;
  level: number;
}

export interface BackendComment {
  id: number;
  ticket_id: number;
  author_id: number;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface BackendAuditEntry {
  id: number;
  ticket_id: number;
  actor_id: number | null;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
}

// ── UI types (match existing TicketManagementPage) ─────────────────

export type UiSeverity = 'Critical' | 'Major' | 'Minor' | 'Warning';
export type UiStatus   = 'Open' | 'Investigating' | 'Assigned' | 'Escalated'
                        | 'Resolved' | 'Closed' | 'Cancelled';

export interface UiTicket {
  id:           string;          // ref like TKT-2026-000007, falls back to "#id"
  numericId:    number;          // raw DB id (for PATCH/etc. URLs)
  severity:     UiSeverity;
  alarmName:    string;          // from title
  site:         string;          // from target_ref (cell parses out site, V1.1)
  cell:         string;          // target_ref
  vendor:       string;          // V1 unknown (target_kind=cell only)
  tech:         string;          // V1 unknown
  status:       UiStatus;
  assigneeId:   number | null;
  createdAt:    string;
  slaDueAt:     string | null;   // for countdown timer
  slaBreached:  boolean;
  escalationLevel: number;
  version:      number;          // for optimistic-lock mutations
  description?: string;
}

// ── Mapping helpers ─────────────────────────────────────────────────

const SEV_TITLE: Record<BackendSeverity, UiSeverity> = {
  critical: 'Critical',
  major:    'Major',
  minor:    'Minor',
  warning:  'Warning',
};

export const sevToBackend = (s: UiSeverity): BackendSeverity =>
  s.toLowerCase() as BackendSeverity;

export function mapStatus(t: BackendTicket): UiStatus {
  // Backend has 5 states; UI has 7. Derive Investigating/Assigned/Escalated:
  //   - escalation_level > 0  → Escalated
  //   - status='in_progress' + assignee_id     → Assigned (someone's on it)
  //   - status='in_progress' (no assignee yet) → Investigating
  if (t.escalation_level > 0 && t.status !== 'resolved'
      && t.status !== 'closed' && t.status !== 'cancelled') {
    return 'Escalated';
  }
  switch (t.status) {
    case 'open':        return 'Open';
    case 'in_progress': return t.assignee_id ? 'Assigned' : 'Investigating';
    case 'resolved':    return 'Resolved';
    case 'closed':      return 'Closed';
    case 'cancelled':   return 'Cancelled';
    default:            return 'Open';
  }
}

function slaBreached(t: BackendTicket): boolean {
  if (!t.sla_resolve_due_at) return false;
  if (t.status === 'resolved' || t.status === 'closed' || t.status === 'cancelled') return false;
  return new Date(t.sla_resolve_due_at).getTime() < Date.now();
}

export function mapTicket(t: BackendTicket): UiTicket {
  return {
    id:        t.ref ?? `#${t.id}`,
    numericId: t.id,
    severity:  SEV_TITLE[t.severity] ?? 'Minor',
    alarmName: t.title,
    site:      t.target_ref ?? '—',
    cell:      t.target_ref ?? '—',
    vendor:    '—',
    tech:      '—',
    status:    mapStatus(t),
    assigneeId: t.assignee_id,
    createdAt: t.created_at,
    slaDueAt:  t.sla_resolve_due_at,
    slaBreached: slaBreached(t),
    escalationLevel: t.escalation_level,
    version:   t.version,
    description: t.description ?? undefined,
  };
}

// ── HTTP layer ──────────────────────────────────────────────────────

// V1 actor — falls back to seeded NOC L1 user (id=4). V1.1 will read
// from admin auth session.
const DEFAULT_ACTOR_ID = '4';

function headersWithActor(extra?: HeadersInit): HeadersInit {
  const base = getApiHeaders();
  return {
    ...base,
    'X-User-Id': DEFAULT_ACTOR_ID,
    ...(extra ?? {}),
  };
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.json())?.detail ?? ''; } catch { /* swallow */ }
    throw new Error(`HTTP ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  return resp.json() as Promise<T>;
}

export async function listTickets(params?: {
  status?: BackendStatus;
  severity?: BackendSeverity;
  assignee_id?: number;
  limit?: number;
}): Promise<UiTicket[]> {
  const qs = new URLSearchParams();
  if (params?.status)      qs.set('status',      params.status);
  if (params?.severity)    qs.set('severity',    params.severity);
  if (params?.assignee_id) qs.set('assignee_id', String(params.assignee_id));
  if (params?.limit)       qs.set('limit',       String(params.limit));

  const url = getApiUrl(`tickets${qs.toString() ? '?' + qs.toString() : ''}`);
  const resp = await fetch(url, { headers: headersWithActor() });
  const rows = await jsonOrThrow<BackendTicket[]>(resp);
  return rows.map(mapTicket);
}

export async function getTicket(id: number): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}`), { headers: headersWithActor() });
  const row = await jsonOrThrow<BackendTicket>(resp);
  return mapTicket(row);
}

export async function createTicket(payload: {
  title: string;
  severity: BackendSeverity;
  description?: string;
  fingerprint?: string;
  target_kind?: string;
  target_ref?: string;
  assignee_id?: number;
}): Promise<UiTicket> {
  const resp = await fetch(getApiUrl('tickets'), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify(payload),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function claimTicket(id: number, version: number): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}/claim`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ version }),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function resolveTicket(id: number, version: number, comment?: string): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}/resolve`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ version, comment }),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function closeTicket(id: number, version: number): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}/close`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ version }),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function reopenTicket(id: number, version: number, reason?: string): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}/reopen`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ version, reason }),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function escalateTicket(id: number, version: number, reason?: string): Promise<UiTicket> {
  const resp = await fetch(getApiUrl(`tickets/${id}/escalate`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ version, reason }),
  });
  return mapTicket(await jsonOrThrow<BackendTicket>(resp));
}

export async function listComments(id: number): Promise<BackendComment[]> {
  const resp = await fetch(getApiUrl(`tickets/${id}/comments`), {
    headers: headersWithActor(),
  });
  return jsonOrThrow<BackendComment[]>(resp);
}

export async function addComment(id: number, body: string, isInternal = false): Promise<BackendComment> {
  const resp = await fetch(getApiUrl(`tickets/${id}/comments`), {
    method: 'POST',
    headers: headersWithActor(),
    body: JSON.stringify({ body, is_internal: isInternal }),
  });
  return jsonOrThrow<BackendComment>(resp);
}

export async function getAuditLog(id: number): Promise<BackendAuditEntry[]> {
  const resp = await fetch(getApiUrl(`tickets/${id}/audit-log`), {
    headers: headersWithActor(),
  });
  return jsonOrThrow<BackendAuditEntry[]>(resp);
}

// ── Meta (read-only V1) ─────────────────────────────────────────────

export async function listUsers(): Promise<BackendUser[]> {
  const resp = await fetch(getApiUrl('tickets/_meta/users'), { headers: headersWithActor() });
  return jsonOrThrow<BackendUser[]>(resp);
}

export async function listRoles(): Promise<BackendRole[]> {
  const resp = await fetch(getApiUrl('tickets/_meta/roles'), { headers: headersWithActor() });
  return jsonOrThrow<BackendRole[]>(resp);
}
