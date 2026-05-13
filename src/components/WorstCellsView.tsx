import React from 'react';

export interface WorstCellsResponse {
  title?: string;
  rows?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface Props {
  data: WorstCellsResponse;
  onSendPrompt?: (prompt: string) => void;
}

/** Stub: renders a minimal table fallback when the full kit isn't bundled. */
export function WorstCellsView({ data }: Props) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return (
    <div className="my-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <div className="font-semibold text-slate-900">{data?.title ?? 'Worst cells'}</div>
      <div className="mt-1 text-slate-500">{rows.length} row(s)</div>
    </div>
  );
}

export default WorstCellsView;
