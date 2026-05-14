// Snapshot badge for the Network Explorer header — Sally's UX call from
// the Parameter Hub roundtable (2026-05-14). Always tells the operator
// which dump they're looking at, so the audit conversation has a date
// to anchor on. Polls /dump/snapshot-info every 60s.
//
// Mount it wherever the page header lives (Lovable owns the page
// composition; this is a self-contained component you can drop in).
import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSnapshotInfo, type SnapshotInfo } from './dumpHistoryApi';

const POLL_MS = 60_000;

const fmt = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

interface Props {
  className?: string;
}

const SnapshotBadge: React.FC<Props> = ({ className }) => {
  const [info,    setInfo]    = useState<SnapshotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const tick = useCallback(async () => {
    try {
      const next = await getSnapshotInfo();
      setInfo(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void tick();
    const id = setInterval(() => { void tick(); }, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  if (loading && !info) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        'border border-slate-200 bg-white text-slate-500',
        className,
      )}>
        <Loader2 className="w-3 h-3 animate-spin" /> Snapshot…
      </span>
    );
  }

  if (error) {
    return (
      <span
        title={error}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
          'border border-red-300 bg-red-50 text-red-700',
          className,
        )}
      >
        <AlertTriangle className="w-3 h-3" /> Snapshot offline
      </span>
    );
  }

  const latest = info?.latest ? fmt(info.latest) : '—';
  const previous = info?.previous ? fmt(info.previous) : null;

  return (
    <span
      title={previous ? `Previous snapshot: ${previous}` : 'No previous snapshot'}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        'border border-sky-200 bg-sky-50 text-sky-700',
        className,
      )}
    >
      <Database className="w-3 h-3" />
      Snapshot: <span className="font-semibold tabular-nums">{latest}</span>
    </span>
  );
};

export default SnapshotBadge;
