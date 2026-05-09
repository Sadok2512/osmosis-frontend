import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Activity, Trash2, Play, Loader2, Copy, Check } from 'lucide-react';
import {
  subscribeBackendRequests,
  clearBackendRequestLog,
  type BackendRequestLogEntry,
} from '@/lib/backendRequestLog';
import { getApiHeaders } from '@/lib/apiConfig';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional substring used to pre-filter entries (e.g. `slot ${slot.id}`). */
  widgetFilter?: string;
  /** Optional human label shown in the dialog title. */
  title?: string;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour12: false });

const prettyJson = (s: string | undefined): string => {
  if (!s) return '';
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
};

const BackendRequestDialog: React.FC<Props> = ({ open, onOpenChange, widgetFilter, title }) => {
  const [items, setItems] = useState<BackendRequestLogEntry[]>([]);
  const [responses, setResponses] = useState<Record<number, { status?: number; body: string; error?: string; loading?: boolean }>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    return subscribeBackendRequests(setItems);
  }, [open]);

  const visible = useMemo(() => {
    if (!widgetFilter) return items;
    return items.filter(it => it.widget.toLowerCase().includes(widgetFilter.toLowerCase()));
  }, [items, widgetFilter]);

  const replay = async (entry: BackendRequestLogEntry) => {
    setResponses(prev => ({ ...prev, [entry.id]: { body: '', loading: true } }));
    try {
      const init: RequestInit = {
        method: entry.method,
        headers: getApiHeaders(),
      };
      if (entry.body && entry.method !== 'GET') {
        init.body = entry.body;
      }
      const res = await fetch(entry.url, init);
      const text = await res.text();
      setResponses(prev => ({
        ...prev,
        [entry.id]: { status: res.status, body: text, loading: false },
      }));
    } catch (e: unknown) {
      setResponses(prev => ({
        ...prev,
        [entry.id]: { body: '', error: e instanceof Error ? e.message : String(e), loading: false },
      }));
    }
  };

  const copyToClipboard = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-primary" />
            Requêtes backend {title ? `— ${title}` : ''}
            <span className="text-[10px] font-normal text-muted-foreground">({visible.length})</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2 text-[10px]"
              onClick={() => clearBackendRequestLog()}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Vider
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-1">
          {visible.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-8 text-center">
              Aucune requête capturée. Cliquez sur « Appliquer » pour déclencher un appel VPS.
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map(it => {
                const replayResp = responses[it.id];
                // Prefer the auto-captured response (from fetch interceptor),
                // fall back to the manual replay response if user clicked Rejouer.
                const respStatus = it.responseStatus ?? replayResp?.status;
                const respBodyRaw = replayResp?.body || it.responseBody;
                const respError = replayResp?.error || it.responseError;
                const respPending = it.pendingResponse && !replayResp;
                const prettyBody = prettyJson(it.body);
                return (
                  <li key={it.id} className="border border-border rounded-md bg-card text-[11px]">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-muted-foreground font-mono">{fmtTime(it.ts)}</span>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[10px]">
                        {it.widget}
                      </span>
                      <span className="font-bold text-emerald-600">{it.method}</span>
                      {respStatus !== undefined && (
                        <span className={cn(
                          'px-1.5 py-0.5 rounded font-semibold text-[10px]',
                          respStatus >= 200 && respStatus < 300
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-destructive/10 text-destructive',
                        )}>
                          {respStatus}
                        </span>
                      )}
                      {respPending && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" /> en cours…
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-[10px]"
                        onClick={() => replay(it)}
                        disabled={replayResp?.loading}
                      >
                        {replayResp?.loading
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          : <Play className="w-3 h-3 mr-1" />}
                        Rejouer
                      </Button>
                    </div>

                    <div className="px-3 py-2 space-y-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">URL</span>
                          <button
                            onClick={() => copyToClipboard(it.id * 10 + 1, it.url)}
                            className="text-muted-foreground hover:text-primary"
                            title="Copier l'URL"
                          >
                            {copiedId === it.id * 10 + 1
                              ? <Check className="w-3 h-3" />
                              : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className="font-mono text-[10px] bg-muted/40 p-2 rounded break-all whitespace-pre-wrap">{it.url}</pre>
                      </div>

                      {prettyBody && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Payload</span>
                            <button
                              onClick={() => copyToClipboard(it.id * 10 + 2, prettyBody)}
                              className="text-muted-foreground hover:text-primary"
                              title="Copier le payload"
                            >
                              {copiedId === it.id * 10 + 2
                                ? <Check className="w-3 h-3" />
                                : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <pre className="font-mono text-[10px] bg-muted/40 p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap">{prettyBody}</pre>
                        </div>
                      )}

                      {(respBodyRaw || respError) && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Réponse {respStatus ? `· ${respStatus}` : ''}
                            </span>
                            {respBodyRaw && (
                              <button
                                onClick={() => copyToClipboard(it.id * 10 + 3, respBodyRaw)}
                                className="text-muted-foreground hover:text-primary"
                                title="Copier la réponse"
                              >
                                {copiedId === it.id * 10 + 3
                                  ? <Check className="w-3 h-3" />
                                  : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                          {respError ? (
                            <pre className="font-mono text-[10px] bg-destructive/10 text-destructive p-2 rounded whitespace-pre-wrap">{respError}</pre>
                          ) : (
                            <pre className="font-mono text-[10px] bg-muted/40 p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap">{prettyJson(respBodyRaw)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BackendRequestDialog;
