import React, { useState } from 'react';
import { WorstElement } from './types';
import { ArrowUp, ArrowDown, Minus, ChevronDown, AlertTriangle, Bell, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DrilldownContext {
  kpiIds: string[];
  startDate: string;
  endDate: string;
  granularity: string;
  filters: Record<string, string[]>;
}

interface Props {
  elements: WorstElement[];
  limit: number;
  onLimitChange: (limit: number) => void;
  onRowClick: (id: string) => void;
  drilldownContext?: DrilldownContext;
  onDrillDown?: (cellName: string, element: WorstElement) => void;
}

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

const AlarmBadge: React.FC<{ count: number; severity: string }> = ({ count, severity }) => {
  if (count === 0) return null;
  const colors: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-500 border-red-500/30',
    major: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
    minor: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    warning: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  };
  return (
    <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border', colors[severity] || 'bg-gray-500/15 text-gray-500')}>
      {count}
    </span>
  );
};

const WorstElementsTable: React.FC<Props> = ({ elements, limit, onLimitChange, onRowClick, drilldownContext, onDrillDown }) => {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleDrillDown = (e: React.MouseEvent, cellName: string, el: WorstElement) => {
    e.stopPropagation();
    if (onDrillDown) onDrillDown(cellName, el);
  };

  const handleRowSelect = (cellName: string, rowId: string) => {
    onRowClick(cellName);
    setExpandedRow(prev => prev === rowId ? null : rowId);
  };

  // Get all KPI keys from elements
  const allKpiKeys = Array.from(new Set(elements.flatMap(el => Object.keys(el.kpiValues))));

  const sorted = [...elements].sort((a, b) => {
    if (!sortCol) return 0;
    if (sortCol === 'alarms') {
      const aVal = a.alarms?.total ?? 0;
      const bVal = b.alarms?.total ?? 0;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aVal = a.kpiValues[sortCol] ?? 0;
    const bVal = b.kpiValues[sortCol] ?? 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-foreground uppercase">
            Top {limit} Worst Cells
          </span>
          <span className="text-[10px] text-muted-foreground">
            {elements.length} cell{elements.length !== 1 ? 's' : ''}
          </span>
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

      {elements.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune cellule dégradée trouvée pour les KPIs et filtres sélectionnés
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5 w-8">#</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Cell</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Vendor</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">DOR</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Plaque</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Band</th>
                <th className="text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Status</th>
                {allKpiKeys.map(kpi => (
                  <th
                    key={kpi}
                    className="text-right text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5 cursor-pointer hover:text-foreground"
                    onClick={() => handleSort(kpi)}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {kpi.replace(/_/g, ' ')}
                      {sortCol === kpi && <ChevronDown className={cn('w-2.5 h-2.5', sortDir === 'asc' && 'rotate-180')} />}
                    </div>
                  </th>
                ))}
                <th
                  className="text-center text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-2.5 cursor-pointer hover:text-foreground"
                  onClick={() => handleSort('alarms')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Bell className="w-3 h-3" /> Alarms
                    {sortCol === 'alarms' && <ChevronDown className={cn('w-2.5 h-2.5', sortDir === 'asc' && 'rotate-180')} />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((el, i) => (
                <React.Fragment key={el.id}>
                  <tr
                    className={cn(
                      'border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group',
                      expandedRow === el.id && 'bg-muted/10'
                    )}
                    onClick={() => handleRowSelect(el.name, el.id)}
                  >
                    <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div>
                        {onDrillDown ? (
                          <button
                            onClick={(e) => handleDrillDown(e, el.name, el)}
                            className="text-xs font-bold text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer text-left"
                            title={`Drill down into ${el.name}`}
                          >
                            {el.name}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-foreground">{el.name}</span>
                        )}
                        {el.site_name && <div className="text-[9px] text-muted-foreground">{el.site_name}</div>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {el.vendor ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">{el.vendor}</span>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] font-medium text-foreground">{el.dor || '—'}</td>
                    <td className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground">{el.plaque || '—'}</td>
                    <td className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground">{el.band || '—'}</td>
                    <td className="px-3 py-2.5"><SeverityBadge severity={el.severity} /></td>
                    {allKpiKeys.map(kpi => {
                      const val = el.kpiValues[kpi];
                      return (
                        <td key={kpi} className="px-3 py-2.5 text-right text-xs font-mono font-bold tabular-nums">
                          {val != null ? val.toFixed(2) : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center">
                      {el.alarms && el.alarms.total > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <AlarmBadge count={el.alarms.critical} severity="critical" />
                          <AlarmBadge count={el.alarms.major} severity="major" />
                          <AlarmBadge count={el.alarms.minor} severity="minor" />
                          <ChevronRight className={cn('w-3 h-3 text-muted-foreground transition-transform', expandedRow === el.id && 'rotate-90')} />
                        </div>
                      ) : (
                        <span className="text-[10px] text-green-500 font-medium">Clear</span>
                      )}
                    </td>
                  </tr>
                  {/* Expanded alarm details */}
                  {expandedRow === el.id && el.latest_alarms && el.latest_alarms.length > 0 && (
                    <tr className="bg-muted/5">
                      <td colSpan={7 + allKpiKeys.length + 1} className="px-6 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          <span className="text-[10px] font-bold text-foreground uppercase">Active Alarms ({el.alarms?.total || 0})</span>
                        </div>
                        <div className="space-y-1.5">
                          {el.latest_alarms.map((alarm, ai) => (
                            <div key={ai} className="flex items-start gap-2 text-[10px]">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0',
                                alarm.severity === 'CRITICAL' ? 'bg-red-500/15 text-red-500' :
                                alarm.severity === 'MAJOR' ? 'bg-orange-500/15 text-orange-500' :
                                'bg-yellow-500/15 text-yellow-600'
                              )}>
                                {alarm.severity}
                              </span>
                              <span className="text-foreground font-medium">{alarm.text}</span>
                              {alarm.time && (
                                <span className="text-muted-foreground ml-auto shrink-0">
                                  {alarm.time.slice(0, 16).replace('T', ' ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WorstElementsTable;
