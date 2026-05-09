/**
 * In-memory log of backend requests, with a tiny pub/sub so React panels
 * can subscribe and render the live stream.
 *
 * Each entry can be enriched after the fact with the actual HTTP response
 * (status + body) once the fetch resolves. A global fetch interceptor
 * (installed in apiConfig.ts) attaches the response to the most recent
 * matching pending entry.
 */

export interface BackendRequestLogEntry {
  id: number;
  ts: number;
  widget: string;
  method: string;
  url: string;
  /** Stringified request payload (JSON or raw string), if any. */
  body?: string;
  /** HTTP status code captured from the response. */
  responseStatus?: number;
  /** Raw response body (truncated to 50KB). */
  responseBody?: string;
  /** Network/parse error message if the fetch failed. */
  responseError?: string;
  /** True until the fetch resolves. */
  pendingResponse?: boolean;
}

const MAX_ENTRIES = 100;
const MAX_RESPONSE_BYTES = 50_000;
let nextId = 1;
const entries: BackendRequestLogEntry[] = [];
const listeners = new Set<(items: BackendRequestLogEntry[]) => void>();

function emit() {
  const snapshot = entries.slice();
  listeners.forEach((l) => {
    try { l(snapshot); } catch { /* ignore */ }
  });
}

export function pushBackendRequestEntry(
  widget: string,
  method: string,
  url: string,
  body?: string,
): number {
  const id = nextId++;
  entries.unshift({ id, ts: Date.now(), widget, method, url, body, pendingResponse: true });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  emit();
  return id;
}

/**
 * Attach a response to the most recent entry whose URL matches.
 * Used by the global fetch interceptor.
 */
export function attachResponseToLatest(
  url: string,
  status: number | undefined,
  body: string | undefined,
  error?: string,
): void {
  const target = entries.find(e => e.pendingResponse && e.url === url);
  if (!target) return;
  target.pendingResponse = false;
  target.responseStatus = status;
  target.responseBody = body && body.length > MAX_RESPONSE_BYTES
    ? body.slice(0, MAX_RESPONSE_BYTES) + '\n…[truncated]'
    : body;
  target.responseError = error;
  emit();
}

export function subscribeBackendRequests(
  cb: (items: BackendRequestLogEntry[]) => void,
): () => void {
  listeners.add(cb);
  cb(entries.slice());
  return () => { listeners.delete(cb); };
}

export function clearBackendRequestLog(): void {
  entries.length = 0;
  emit();
}

export function getBackendRequestEntries(): BackendRequestLogEntry[] {
  return entries.slice();
}
