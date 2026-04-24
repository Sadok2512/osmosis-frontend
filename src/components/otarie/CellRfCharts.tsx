/**
 * CellRfCharts — RACH Bins, PRB UL/DL, Interference charts
 * Displayed as toggle buttons in cell KPI tab, inline bar charts when active.
 */
import React, { useState, useCallback } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

interface Bin { index: number; label: string; count: number; }
interface ChartData { name: string; unit: string; bins: Bin[]; }

const CHARTS = [
  { id: 'RACH', label: 'RACH Bins', color: '#f59e0b', histIds: ['NOKIA_LTE_RACH_MSG3', 'NOKIA_LTE_RACH_PREAMBLE_MSG1_CE0', 'ERICSSON_LTE_RACH_PREAMBLE_DIST'] },
  { id: 'PRB_DL', label: 'PRB DL', color: '#3b82f6', histIds: ['NOKIA_LTE_PRB_DL_UTIL', 'ERICSSON_LTE_PRB_UTIL_DL_DIST'] },
  { id: 'PRB_UL', label: 'PRB UL', color: '#06b6d4', histIds: ['NOKIA_LTE_PRB_AVAIL', 'ERICSSON_LTE_PRB_UTIL_UL_DIST'] },
  { id: 'INTERF', label: 'UL Interference', color: '#ef4444', histIds: ['NOKIA_LTE_UL_IOT_PUSCH_DIST', 'ERICSSON_LTE_INTERF_POWER_DIST'] },
];

interface Props {
  siteName: string;
  vendor?: string;
  techno?: string;
}

const CellRfCharts: React.FC<Props> = ({ siteName, vendor, techno }) => {
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, ChartData | null>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const fetchChart = useCallback(async (chartId: string) => {
    if (data[chartId] !== undefined) return; // already fetched
    const chart = CHARTS.find(c => c.id === chartId);
    if (!chart) return;

    setLoading(chartId);
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    // Try each histogram ID until one returns data
    for (const histId of chart.histIds) {
      try {
        const res = await fetch(getApiUrl('pm/histograms/data'), {
          method: 'POST',
          headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ histogram_id: histId, site_name: siteName, date_from: monthAgo, date_to: today }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.bins && d.bins.length > 0) {
            setData(prev => ({ ...prev, [chartId]: { name: d.name || chart.label, unit: d.unit || '', bins: d.bins } }));
            setLoading(null);
            return;
          }
        }
      } catch { /* try next */ }
    }
    setData(prev => ({ ...prev, [chartId]: null }));
    setLoading(null);
  }, [data, siteName]);

  const toggle = (id: string) => {
    if (active === id) { setActive(null); return; }
    setActive(id);
    fetchChart(id);
  };

  const chartData = active ? data[active] : null;
  const chartDef = active ? CHARTS.find(c => c.id === active) : null;
  const maxCount = chartData ? Math.max(...chartData.bins.map(b => b.count), 1) : 1;

  return (
    <div className="px-5 py-4">
      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CHARTS.map(c => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
              active === c.id
                ? 'border-current text-white shadow-sm'
                : 'border-border text-muted-foreground hover:border-current hover:text-foreground bg-muted/30'
            }`}
            style={active === c.id ? { backgroundColor: c.color, borderColor: c.color } : undefined}
          >
            <BarChart3 size={10} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 text-[10px] text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      )}

      {/* Chart */}
      {active && chartData && !loading && (
        <div className="rounded-xl border border-border bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-foreground">{chartData.name}</span>
            <span className="text-[9px] text-muted-foreground">{chartData.unit}</span>
          </div>
          <div className="space-y-1">
            {chartData.bins.map(bin => (
              <div key={bin.index} className="flex items-center gap-1.5 text-[9px]">
                <span className="w-20 truncate text-muted-foreground font-mono shrink-0 text-right">{bin.label}</span>
                <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all duration-300"
                    style={{
                      width: `${Math.max(2, (bin.count / maxCount) * 100)}%`,
                      backgroundColor: chartDef?.color || '#3b82f6',
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span className="w-16 text-right font-mono font-bold text-foreground shrink-0">
                  {bin.count >= 1e9 ? `${(bin.count / 1e9).toFixed(1)}G` :
                   bin.count >= 1e6 ? `${(bin.count / 1e6).toFixed(1)}M` :
                   bin.count >= 1e3 ? `${(bin.count / 1e3).toFixed(1)}K` :
                   bin.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data */}
      {active && data[active] === null && !loading && (
        <div className="text-[10px] text-muted-foreground italic py-3 text-center">
          No data for this site
        </div>
      )}
    </div>
  );
};

export default CellRfCharts;
