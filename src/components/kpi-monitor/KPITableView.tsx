import React from 'react';
import { KpiSummaryRow } from './types';
import { KPI_CATALOG_MAP } from './kpiCatalog';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  rows: KpiSummaryRow[];
}

const KPITableView: React.FC<Props> = ({ rows }) => {
  if (rows.length === 0) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Aucune donnée</div>;

  return (
    <div className="overflow-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Split</th>
            <th className="text-left px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">KPI</th>
            <th className="text-right px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Avg</th>
            <th className="text-right px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Min</th>
            <th className="text-right px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Max</th>
            <th className="text-right px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Last</th>
            <th className="text-right px-3 py-2.5 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const cat = KPI_CATALOG_MAP[row.kpi_key];
            const deltaColor = row.delta_pct > 0 ? 'text-emerald-500' : row.delta_pct < 0 ? 'text-red-500' : 'text-muted-foreground';
            const DeltaIcon = row.delta_pct > 0 ? TrendingUp : row.delta_pct < 0 ? TrendingDown : Minus;
            return (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-semibold">{row.split_value}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat?.color || '#64748b' }} />
                    {cat?.display_name || row.kpi_key}
                    <span className="text-muted-foreground text-[9px]">({cat?.unit})</span>
                  </span>
                </td>
                <td className="text-right px-3 py-2 font-mono font-bold">{row.avg != null && row.avg !== 0 ? row.avg : <span className="text-muted-foreground/40">—</span>}</td>
                <td className="text-right px-3 py-2 font-mono text-muted-foreground">{row.min != null && row.min !== 0 ? row.min : <span className="text-muted-foreground/40">—</span>}</td>
                <td className="text-right px-3 py-2 font-mono text-muted-foreground">{row.max != null && row.max !== 0 ? row.max : <span className="text-muted-foreground/40">—</span>}</td>
                <td className="text-right px-3 py-2 font-mono font-bold">{row.last != null && row.last !== 0 ? row.last : <span className="text-muted-foreground/40">—</span>}</td>
                <td className={`text-right px-3 py-2 font-mono font-bold ${row.delta_pct != null && row.delta_pct !== 0 ? deltaColor : ''}`}>
                  {row.delta_pct != null && row.delta_pct !== 0 ? (
                    <span className="inline-flex items-center gap-0.5">
                      <DeltaIcon className="w-3 h-3" />
                      {row.delta_pct > 0 ? '+' : ''}{row.delta_pct}%
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default KPITableView;
