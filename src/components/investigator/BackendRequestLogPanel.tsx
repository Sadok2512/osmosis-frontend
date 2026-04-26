import React, { useEffect, useState } from 'react';
import { subscribeBackendRequests, clearBackendRequestLog, type BackendRequestLogEntry } from '@/lib/backendRequestLog';
import { Trash2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Live panel showing backend requests fired by Investigator widgets.
 * Each row shows: time · widget name · METHOD · URL.
 */
const BackendRequestLogPanel: React.FC = () => {
  const [items, setItems] = useState<BackendRequestLogEntry[]>([]);

  useEffect(() => subscribeBackendRequests(setItems), []);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
  };

  const shortUrl = (u: string) => {
    try {
      const url = new URL(u);
      const path = url.pathname + url.search;
      return path.length > 90 ? path.slice(0, 87) + '…' : path;
    } catch {
      return u.length > 90 ? u.slice(0, 87) + '…' : u;
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card flex flex-col h-full min-h-[300px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Backend Requests</span>
          <span className="text-[10px] text-muted-foreground">({items.length})</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => clearBackendRequestLog()}
        >
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
      <div className="flex-1 overflow-auto text-[10px] font-mono">
        {items.length === 0 ? (
          <div className="p-3 text-muted-foreground italic">No requests captured yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map(it => (
              <li key={it.id} className="px-3 py-1.5 hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{fmtTime(it.ts)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[9px]">
                    {it.widget}
                  </span>
                  <span className="text-[9px] font-bold text-emerald-600">{it.method}</span>
                </div>
                <div className="mt-0.5 text-foreground/80 break-all">{shortUrl(it.url)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BackendRequestLogPanel;
