import React, { useState } from 'react';
import { WorstElement } from './types';
import { KPI_MAP, KPIS } from './mockData';
import { ArrowUp, ArrowDown, Minus, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  elements: WorstElement[];
  limit: number;
  onLimitChange: (limit: number) => void;
  onRowClick: (id: string) => void;
}

const TrendIcon: React.FC<{ trend: 'up' | 'down' | 'stable' }> = ({ trend }) => {
  if (trend === 'up') return <ArrowUp className="w-3 h-3 text-destructive" />;
  if (trend === 'down') return <ArrowDown className="w-3 h-3 text-green-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

const SeverityBadge: React.FC<{ severity: 'critical' | 'warning' | 'ok' }> = ({ severity }) => {
  const styles = {
    critical: 'bg-destructive/15 text-destructive border-destructive/30',
    warning: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    ok: 'bg-green-500/15 text-green-600 border-green-500/30',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', styles[severity])}>
      {severity}
    </span>
  );
};

const WorstElementsTable: React.FC<Props> = ({ elements, limit, onLimitChange, onRowClick }) => {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const visibleKpis = KPIS.slice(0, 5);

  const sorted = [...elements].sort((a, b) => {
    if (!sortCol) return 0;
    const aVal = a.kpiValues[sortCol] ?? 0;
    const bVal = b.kpiValues[sortCol] ?? 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-foreground uppercase">Top {limit} Worst Elements</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Show</span>
          <select
            value={limit}
            onChange={e => onLimitChange(Number(e.target.value))}
            className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-[10px] font-medium"
          >
            {[5, 10, 15, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">#</th>
              <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Name</th>
              <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Status</th>
              <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Region</th>
              <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Vendor</th>
              {visibleKpis.map(kpi => (
                <th
                  key={kpi.id}
                  className="text-right text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5 cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort(kpi.id)}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: kpi.color }} />
                    {kpi.label.split(' ').slice(-2).join(' ')}
                    {sortCol === kpi.id && <ChevronDown className={cn('w-2.5 h-2.5 transition-transform', sortDir === 'asc' && 'rotate-180')} />}
                  </div>
                </th>
              ))}
              <th className="text-center text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Trend</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((el, i) => (
              <tr
                key={el.id}
                className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group"
                onClick={() => onRowClick(el.name)}
              >
                <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-bold text-foreground">{el.name}</span>
                </td>
                <td className="px-4 py-2.5"><SeverityBadge severity={el.severity} /></td>
                <td className="px-4 py-2.5 text-[10px] text-muted-foreground font-medium">{el.region}</td>
                <td className="px-4 py-2.5 text-[10px] text-muted-foreground font-medium">{el.vendor}</td>
                {visibleKpis.map(kpi => {
                  const val = el.kpiValues[kpi.id];
                  const isBad = kpi.higherIsBetter
                    ? val < kpi.thresholds.critical
                    : val > kpi.thresholds.critical;
                  const isWarn = kpi.higherIsBetter
                    ? val < kpi.thresholds.warning
                    : val > kpi.thresholds.warning;
                  return (
                    <td key={kpi.id} className={cn(
                      'px-4 py-2.5 text-right text-xs font-mono font-bold tabular-nums',
                      isBad ? 'text-destructive' : isWarn ? 'text-yellow-600' : 'text-foreground'
                    )}>
                      {val?.toFixed(2)} <span className="text-[8px] text-muted-foreground font-normal">{kpi.unit}</span>
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center"><TrendIcon trend={el.trend} /></td>
                <td className="px-2 py-2.5">
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorstElementsTable;
