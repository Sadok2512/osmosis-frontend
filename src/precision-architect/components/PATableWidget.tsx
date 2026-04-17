import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Row {
  cell: string;
  site: string;
  techno: '5G' | '4G' | '3G';
  throughput: number; // Mbps
  load: number; // %
  qoe: number; // 0-100
  trend: number; // %
  status: 'optimal' | 'warning' | 'critical';
}

const ROWS: Row[] = [
  { cell: 'PAR-NRT-01-A', site: 'Paris-Nord', techno: '5G', throughput: 845, load: 62, qoe: 94, trend: 3.2, status: 'optimal' },
  { cell: 'LYO-CTR-12-B', site: 'Lyon-Centre', techno: '5G', throughput: 712, load: 58, qoe: 91, trend: 1.4, status: 'optimal' },
  { cell: 'MRS-PRT-05-C', site: 'Marseille-Port', techno: '4G', throughput: 184, load: 81, qoe: 68, trend: -4.6, status: 'warning' },
  { cell: 'TLS-SUD-22-A', site: 'Toulouse-Sud', techno: '5G', throughput: 690, load: 54, qoe: 89, trend: 2.1, status: 'optimal' },
  { cell: 'STR-EST-09-B', site: 'Strasbourg-Est', techno: '4G', throughput: 92, load: 94, qoe: 41, trend: -12.4, status: 'critical' },
  { cell: 'BDX-OST-14-A', site: 'Bordeaux-Ouest', techno: '4G', throughput: 215, load: 76, qoe: 72, trend: -1.8, status: 'warning' },
  { cell: 'LIL-MTR-03-C', site: 'Lille-Métropole', techno: '5G', throughput: 798, load: 60, qoe: 92, trend: 4.0, status: 'optimal' },
  { cell: 'MTP-CTR-07-A', site: 'Montpellier', techno: '4G', throughput: 78, load: 96, qoe: 35, trend: -15.2, status: 'critical' },
];

const technoColor: Record<Row['techno'], string> = {
  '5G': 'bg-emerald-100 text-emerald-700',
  '4G': 'bg-orange-100 text-orange-700',
  '3G': 'bg-amber-100 text-amber-700',
};

const statusColor: Record<Row['status'], string> = {
  optimal: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-rose-500',
};

interface Props {
  height?: number | string;
}

const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="flex items-center gap-2 min-w-[80px]">
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
    <span className="text-[10px] font-black text-on-surface tabular-nums w-8 text-right">{value}</span>
  </div>
);

const PATableWidget: React.FC<Props> = ({ height = 360 }) => {
  return (
    <div style={{ height }} className="rounded-2xl border border-outline-variant/20 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 bg-surface-container-low/40">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">Cells inventory</span>
          <span className="text-xs font-black text-on-surface">Worst & Top performers</span>
        </div>
        <span className="text-[10px] font-bold text-on-surface-variant">{ROWS.length} cells</span>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/20">
              <th className="text-left px-4 py-2.5">Cell</th>
              <th className="text-left px-4 py-2.5">Site</th>
              <th className="text-left px-4 py-2.5">Tech</th>
              <th className="text-left px-4 py-2.5">Throughput</th>
              <th className="text-left px-4 py-2.5">Load</th>
              <th className="text-left px-4 py-2.5">QoE</th>
              <th className="text-right px-4 py-2.5">Trend 24h</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={r.cell} className={cn('border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors', i % 2 === 1 && 'bg-slate-50/30')}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', statusColor[r.status])} />
                    <span className="font-black text-on-surface tabular-nums">{r.cell}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-on-surface-variant font-medium">{r.site}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('inline-flex items-center justify-center px-2 h-5 rounded-md text-[10px] font-black', technoColor[r.techno])}>{r.techno}</span>
                </td>
                <td className="px-4 py-2.5 font-black text-on-surface tabular-nums">{r.throughput} <span className="text-[9px] font-bold text-on-surface-variant/70">Mbps</span></td>
                <td className="px-4 py-2.5">
                  <Bar value={r.load} color={r.load > 85 ? 'bg-rose-500' : r.load > 70 ? 'bg-amber-500' : 'bg-emerald-500'} />
                </td>
                <td className="px-4 py-2.5">
                  <Bar value={r.qoe} color={r.qoe > 80 ? 'bg-emerald-500' : r.qoe > 60 ? 'bg-amber-500' : 'bg-rose-500'} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={cn('inline-flex items-center gap-1 font-black tabular-nums', r.trend >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {r.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {r.trend > 0 ? '+' : ''}{r.trend}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PATableWidget;
