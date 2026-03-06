import React, { useState, useMemo } from 'react';
import { GripVertical, Trash2, Plus, X, Table2, Settings, Filter } from 'lucide-react';
import { BI_KPI_CATALOG, BI_DIMENSIONS, BIDimension, BIKPI, KPI_UNITS, getKpiDisplayName } from './biTypes';
import { getDimensionValues } from './mockBIData';

export interface TableFilter {
  dimension: BIDimension;
  values: string[];
}

export interface TableWidgetConfig {
  id: string;
  type: 'table';
  title: string;
  kpis: BIKPI[];
  dimension: BIDimension;
  xAxisType: 'date' | 'dimension';
  dateFrom?: string;
  dateTo?: string;
  filters: TableFilter[];
  fontSize: number;
  showHeader: boolean;
  striped: boolean;
  compact: boolean;
}

interface Props {
  config: TableWidgetConfig;
  onChange: (config: TableWidgetConfig) => void;
  onDelete: () => void;
  onEdit?: () => void;
}

export function createDefaultTableWidget(id: string): TableWidgetConfig {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 14);
  return {
    id,
    type: 'table',
    title: 'KPI Table',
    kpis: ['qoe_index', 'debit_dl', 'debit_ul', 'dms_debit_dl_3', 'dms_debit_dl_8'],
    dimension: 'Vendor',
    xAxisType: 'dimension',
    dateFrom: start.toISOString().split('T')[0],
    dateTo: end.toISOString().split('T')[0],
    filters: [],
    fontSize: 11,
    showHeader: true,
    striped: true,
    compact: false,
  };
}

// Seeded random for stable table data
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function generateTableData(config: TableWidgetConfig) {
  const rng = seededRng(config.id.charCodeAt(0) * 100 + (config.kpis || []).length);
  const dimValues = getDimensionValues(config.dimension);

  const kpiRanges: Record<string, [number, number]> = {
    volume_totale: [50, 500], debit_dl: [10, 150], debit_ul: [5, 80],
    dl_ul_ratio: [40, 95], debit_dl_max: [50, 300], debit_ul_max: [20, 150],
    rtt_setup_avg: [10, 80], rtt_data_avg: [15, 100],
    loss_dl_rate: [0, 5], loss_ul_rate: [0, 5],
    tcp_retr_rate_1: [0, 10], tcp_retr_rate_3: [0, 8], tcp_retr_rate_5: [0, 6], tcp_retr_rate_10: [0, 4],
    dms_dl_3: [60, 99], dms_dl_8: [40, 95], dms_dl_30: [10, 70],
    dms_ul_1: [70, 99], dms_ul_3: [50, 95], dms_ul_5: [30, 85],
    session_nbr: [1000, 50000], session_dcr: [0, 5],
    fallback_5G_to_4G_rate: [0, 15], instability_rate: [0, 10],
    'time_rat_5g_%': [20, 80], bad_session_rate: [0, 10], qoe_index: [500, 900],
  };

  return dimValues.map(dim => {
    const row: Record<string, any> = { dimension: dim };
    for (const kpi of (config.kpis || [])) {
      const [min, max] = kpiRanges[kpi] || [0, 100];
      row[kpi] = +(min + rng() * (max - min)).toFixed(2);
    }
    return row;
  });
}

const getKpiColor = (kpi: string, value: number): string => {
  if (kpi.includes('dms_') || kpi === 'qoe_index') {
    if (kpi === 'qoe_index') {
      return value >= 750 ? 'text-emerald-600' : value >= 600 ? 'text-amber-600' : 'text-red-600';
    }
    return value >= 75 ? 'text-emerald-600' : value >= 50 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('loss') || kpi.includes('retr') || kpi.includes('bad_') || kpi.includes('dcr') || kpi.includes('instability') || kpi.includes('fallback')) {
    return value <= 2 ? 'text-emerald-600' : value <= 5 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('rtt')) {
    return value <= 30 ? 'text-emerald-600' : value <= 60 ? 'text-amber-600' : 'text-red-600';
  }
  if (kpi.includes('debit')) {
    return value >= 50 ? 'text-emerald-600' : value >= 20 ? 'text-amber-600' : 'text-red-600';
  }
  return 'text-foreground';
};

const BITableWidget: React.FC<Props> = ({ config: rawConfig, onChange, onDelete, onEdit }) => {
  const config = useMemo(() => ({
    ...rawConfig,
    filters: rawConfig.filters || [],
    xAxisType: rawConfig.xAxisType || 'dimension',
    kpis: rawConfig.kpis || [],
  }), [rawConfig]);

  const tableData = useMemo(() => generateTableData(config), [config]);
  const kpis = config.kpis || [];

  const removeKpi = (kpi: BIKPI) => {
    onChange({ ...config, kpis: kpis.filter(k => k !== kpi) });
  };

  return (
    <div className="w-full h-full flex flex-col bg-card rounded-xl border border-border overflow-hidden group">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <Table2 className="w-3.5 h-3.5 text-primary" />
        <input
          className="flex-1 text-xs font-semibold bg-transparent outline-none text-foreground min-w-0"
          value={config.title}
          onChange={e => onChange({ ...config, title: e.target.value })}
        />
        <button onClick={onEdit}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Settings">
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Active KPI tags */}
      {kpis.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-border bg-background/50 shrink-0">
          {kpis.map(kpi => (
            <span key={kpi} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-medium">
              {getKpiDisplayName(kpi)}
              <button onClick={() => removeKpi(kpi)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {(config.filters || []).filter(f => f.values.length > 0).map((f, i) => (
            <span key={`f-${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground text-[9px] font-medium">
              <Filter className="w-2.5 h-2.5" />
              {f.dimension}: {f.values.join(', ')}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-2">
            <Table2 className="w-6 h-6 text-muted-foreground/50" />
            <span>Cliquez <Settings className="w-3 h-3 mx-1 inline" /> pour configurer la table</span>
          </div>
        ) : (
          <table className="w-full text-left" style={{ fontSize: config.fontSize }}>
            {config.showHeader && (
              <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
                <tr>
                  <th className={`${config.compact ? 'px-2 py-1' : 'px-3 py-2'} font-bold text-foreground border-b border-border`}>
                    {config.xAxisType === 'date' ? 'Date' : config.dimension}
                  </th>
                  {kpis.map(kpi => (
                    <th key={kpi} className={`${config.compact ? 'px-2 py-1' : 'px-3 py-2'} font-bold text-foreground border-b border-border text-right`}>
                      <span className="whitespace-nowrap">{getKpiDisplayName(kpi)}</span>
                      {KPI_UNITS[kpi] && <span className="text-muted-foreground font-normal ml-1">({KPI_UNITS[kpi]})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className={`${config.striped && i % 2 === 1 ? 'bg-muted/20' : ''} hover:bg-muted/40 transition-colors`}>
                  <td className={`${config.compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} font-medium text-foreground border-b border-border/50`}>
                    {row.dimension}
                  </td>
                  {kpis.map(kpi => (
                    <td key={kpi} className={`${config.compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} text-right font-mono border-b border-border/50 ${getKpiColor(kpi, row[kpi])}`}>
                      {row[kpi]?.toLocaleString('fr-FR')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BITableWidget;
