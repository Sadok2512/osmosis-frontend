/**
 * In-memory log of backend requests, with a tiny pub/sub so React panels
 * can subscribe and render the live stream.
 */

export interface BackendRequestLogEntry {
  id: number;
  ts: number;
  widget: string;
  method: string;
  url: string;
  /** Stringified request payload (JSON or raw string), if any. */
  body?: string;
}

const MAX_ENTRIES = 100;
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
): void {
  entries.unshift({ id: nextId++, ts: Date.now(), widget, method, url, body });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
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
