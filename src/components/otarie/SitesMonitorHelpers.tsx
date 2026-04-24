import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Signal, ChevronUp, ChevronDown, Settings2, RotateCcw, X, Activity, Play } from 'lucide-react';
import { SimulationParams, simulateCoverage, getDefaultParams, RSRP_LEGEND } from '@/services/propagationEngine';
import { Slider } from '@/components/ui/slider';
import { qoeMetricsApi } from '@/lib/localDb';

// ── Inline Simulation Tab (rendered inside cell detail panel) ──
const ENV_OPTS = [
  { value: 'urban', label: 'Urbain', icon: '🏙️' },
  { value: 'suburban', label: 'Suburbain', icon: '🏘️' },
  { value: 'rural', label: 'Rural', icon: '🌾' },
] as const;

export const InlineSimTab = ({ cell, siteDetail, simDefaults, simTechno, coverageSimulating, onSimulate, onClear }: any) => {
  const [params, setParams] = React.useState<Partial<SimulationParams>>({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);
  const [simulating, setSimulating] = React.useState(false);
  const [useTerrain, setUseTerrain] = React.useState(true);
  const [selectedCellIdx, setSelectedCellIdx] = React.useState(() => {
    return siteDetail.cells.findIndex((c: any) => c.cell_id === cell.cell_id) ?? 0;
  });

  const activeCell = siteDetail.cells[selectedCellIdx] ?? cell;
  const cellTech = (activeCell.techno || '').toUpperCase();
  const techno = cellTech.includes('5G') || cellTech.includes('NR') ? '5G'
    : cellTech.includes('3G') || cellTech.includes('UMTS') ? '3G'
    : cellTech.includes('2G') || cellTech.includes('GSM') ? '2G'
    : '4G';
  const defaults = React.useMemo(() => getDefaultParams(techno as any, activeCell.bande), [techno, activeCell.bande]);

  // Auto-populate from cell data (ref_cell_daily + param_dump)
  const cellPmax = (activeCell as any)?.pmax;
  const cellBw = (activeCell as any)?.dl_bandwidth;
  const cellTxAnt = (activeCell as any)?.num_tx_ant;
  const autoTxPower = cellPmax ? Math.round(cellPmax / 10) : null;
  const autoGain = cellTxAnt ? (cellTxAnt >= 32 ? 25 : cellTxAnt >= 8 ? 21 : cellTxAnt >= 4 ? 18 : 15) : null;

  const merged = React.useMemo(() => ({
    lat: siteDetail.coordinates[0],
    lng: siteDetail.coordinates[1],
    frequency: params.frequency ?? defaults.frequency ?? 1800,
    txPower: params.txPower ?? autoTxPower ?? defaults.txPower ?? 43,
    antennaHeight: params.antennaHeight ?? activeCell.hba ?? defaults.antennaHeight ?? 25,
    antennaGain: params.antennaGain ?? autoGain ?? defaults.antennaGain ?? 18,
    azimuth: params.azimuth ?? activeCell.azimut ?? (activeCell as any)?.azimuth ?? defaults.azimuth ?? 0,
    beamwidth: params.beamwidth ?? defaults.beamwidth ?? 65,
    tilt: params.tilt ?? (activeCell as any).tilt ?? defaults.tilt ?? 4,
    mechanicalTilt: params.mechanicalTilt ?? defaults.mechanicalTilt ?? 0,
    rxHeight: params.rxHeight ?? defaults.rxHeight ?? 1.5,
    radius: params.radius ?? defaults.radius ?? 5,
    gridSize: params.gridSize ?? defaults.gridSize ?? 80,
    environment: params.environment ?? defaults.environment ?? 'urban',
    techno,
    cableLoss: params.cableLoss ?? defaults.cableLoss ?? 2,
    bodyLoss: params.bodyLoss ?? defaults.bodyLoss ?? 3,
    bandwidth: params.bandwidth ?? cellBw ?? defaults.bandwidth ?? 20,
    shadowFading: params.shadowFading ?? defaults.shadowFading ?? true,
    clutterEnabled: params.clutterEnabled ?? defaults.clutterEnabled ?? true,
  }), [params, defaults, siteDetail, activeCell, techno, autoTxPower, autoGain, cellBw]);

  const upd = (k: keyof SimulationParams, v: any) => setParams(p => ({ ...p, [k]: v }));

  const handleSim = async () => {
    setSimulating(true);
    try {
      let terrainGrid: number[][] | undefined;
      if (useTerrain) {
        try {
          const resp = await fetch('http://localhost:3001/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...merged, useTerrain: true }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.terrainGrid) {
              terrainGrid = data.terrainGrid;
            }
          }
        } catch {
          console.log('[sim] Server unavailable, running client-side only');
        }
      }
      const grid = simulateCoverage({ ...merged, terrainGrid } as SimulationParams);
      onSimulate(grid);
    } finally {
      setSimulating(false);
    }
  };

  const isRunning = simulating || coverageSimulating;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Cell info header */}
      <div className="rounded-xl bg-muted/30 border border-border/50 p-3">
        <div className="text-[10px] font-bold text-foreground uppercase tracking-wider truncate">{activeCell.cell_id}</div>
        <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded text-white text-[8px] font-bold" style={{ backgroundColor: techno === '5G' ? '#27AE60' : techno === '3G' ? '#3498DB' : techno === '2G' ? '#8E44AD' : '#F39C12' }}>{techno}</span>
          <span className="font-semibold">{activeCell.bande}</span>
          <span>•</span>
          <span>Az {merged.azimuth}°</span>
        </div>
      </div>

      {/* Fixed parameters — read-only from cell config */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        {[
          { label: 'Fréquence', value: `${merged.frequency} MHz`, icon: '📡' },
          { label: `Puissance TX (${techno === '5G' ? 'SSB' : 'RS'})`, value: `${merged.txPower} dBm`, icon: '⚡' },
          { label: 'Hauteur Antenne (HBA)', value: `${merged.antennaHeight} m`, icon: '📏' },
          { label: 'Azimut', value: `${merged.azimuth}°`, icon: '🧭' },
          { label: 'Tilt', value: `${merged.tilt}°`, icon: '📐' },
          { label: 'Gain Antenne', value: `${merged.antennaGain} dBi`, icon: '📶' },
          { label: 'Bande passante', value: `${merged.bandwidth} MHz`, icon: '📊' },
          { label: 'Rayon', value: `${merged.radius} km`, icon: '🎯' },
        ].map((p, i) => (
          <div key={p.label} className={`flex items-center justify-between px-3 py-2 text-[11px] ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="text-[10px]">{p.icon}</span>
              {p.label}
            </span>
            <span className="font-bold font-mono text-foreground">{p.value}</span>
          </div>
        ))}
      </div>

      {/* Environment selector */}
      <div>
        <label className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Environnement</label>
        <div className="flex gap-1">
          {ENV_OPTS.map(env => (
            <button
              key={env.value}
              onClick={() => upd('environment', env.value)}
              className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-bold transition-all text-center ${
                merged.environment === env.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {env.icon} {env.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Settings2 size={11} />
        <span>Paramètres avancés</span>
        {showAdvanced ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-border">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Gain Antenne</label>
              <span className="text-[11px] font-bold text-foreground">{merged.antennaGain} dBi</span>
            </div>
            <Slider value={[merged.antennaGain]} min={0} max={30} step={0.5} onValueChange={v => upd('antennaGain', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Ouverture H</label>
              <span className="text-[11px] font-bold text-foreground">{merged.beamwidth}°</span>
            </div>
            <Slider value={[merged.beamwidth]} min={30} max={120} step={5} onValueChange={v => upd('beamwidth', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Tilt électrique</label>
              <span className="text-[11px] font-bold text-foreground">{merged.tilt}°</span>
            </div>
            <Slider value={[merged.tilt]} min={0} max={15} step={0.5} onValueChange={v => upd('tilt', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Tilt mécanique</label>
              <span className="text-[11px] font-bold text-foreground">{merged.mechanicalTilt}°</span>
            </div>
            <Slider value={[merged.mechanicalTilt]} min={0} max={15} step={0.5} onValueChange={v => upd('mechanicalTilt', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Perte câble (feeder)</label>
              <span className="text-[11px] font-bold text-foreground">{merged.cableLoss} dB</span>
            </div>
            <Slider value={[merged.cableLoss]} min={0} max={10} step={0.5} onValueChange={v => upd('cableLoss', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Perte corps (body loss)</label>
              <span className="text-[11px] font-bold text-foreground">{merged.bodyLoss} dB</span>
            </div>
            <Slider value={[merged.bodyLoss]} min={0} max={10} step={0.5} onValueChange={v => upd('bodyLoss', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Résolution grille</label>
              <span className="text-[11px] font-bold text-foreground">{merged.gridSize}×{merged.gridSize}</span>
            </div>
            <Slider value={[merged.gridSize]} min={40} max={200} step={10} onValueChange={v => upd('gridSize', v[0])} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-muted-foreground uppercase">Hauteur mobile</label>
              <span className="text-[11px] font-bold text-foreground">{merged.rxHeight} m</span>
            </div>
            <Slider value={[merged.rxHeight]} min={1} max={10} step={0.5} onValueChange={v => upd('rxHeight', v[0])} className="mt-1" />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setParams({})} className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5">
          <RotateCcw size={11} /> Reset
        </button>
        <button onClick={onClear} className="px-3 py-2.5 rounded-xl text-[10px] font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-all flex items-center gap-1.5">
          <X size={11} /> Effacer
        </button>
        <button
          onClick={handleSim}
          disabled={isRunning}
          className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          {isRunning ? (
            <><Activity size={13} className="animate-spin" /> Calcul...</>
          ) : (
            <><Play size={13} /> Simuler</>
          )}
        </button>
      </div>

      <div className="border-t border-border pt-2">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-full hover:text-foreground transition-colors"
        >
          <Signal size={10} /> Légende RSRP
          {showLegend ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
        </button>
        {showLegend && (
          <div className="mt-2 space-y-1">
            {RSRP_LEGEND.map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[10px]">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: item.color }} />
                <span className="font-mono text-muted-foreground">{item.label}</span>
                <span className="ml-auto font-semibold text-foreground">{item.quality}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const MiniStat = ({ label, value, icon, color }: any) => (
  <div className="bg-card p-6 rounded-[2rem] border border-border flex flex-col items-center justify-center shadow-sm">
    <div className={`p-3 bg-muted rounded-2xl mb-3 ${color}`}>{icon}</div>
    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">{label}</span>
    <span className="text-xl font-black text-foreground tracking-tighter">{value}</span>
  </div>
);

export const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest ml-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none focus:border-primary transition-all shadow-sm">
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

// Generate mock time-series data for a site's KPIs (seeded from site values)
export const generateSiteTimeSeries = (siteDetail: any) => {
  const days = 14;
  const baseDate = new Date('2026-02-09');
  const baseQoE = siteDetail.qoe_score_avg ?? 75;
  const baseDms3 = siteDetail.dms_dl_3 ?? 85;
  const baseDms8 = siteDetail.dms_dl_8 ?? 78;
  const baseDms30 = siteDetail.dms_dl_30 ?? 32;
  const baseDmsUl = siteDetail.dms_ul_3 ?? 70;

  const data = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const seed = Math.sin(i * 3.7 + (siteDetail.site_id?.charCodeAt(0) ?? 0)) * 0.5;
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      QoE: Math.max(0, Math.min(100, baseQoE + seed * 8 + Math.sin(i * 0.9) * 3)),
      'DMS 3M': Math.max(0, Math.min(100, baseDms3 + seed * 5 + Math.cos(i * 1.1) * 4)),
      'DMS 8M': Math.max(0, Math.min(100, baseDms8 + seed * 6 + Math.sin(i * 1.3) * 5)),
      'DMS 30M': Math.max(0, Math.min(100, baseDms30 + seed * 10 + Math.cos(i * 0.7) * 6)),
      'DMS UL': Math.max(0, Math.min(100, baseDmsUl + seed * 7 + Math.sin(i * 1.5) * 4)),
    });
  }
  return data;
};

// Fetch real QoE metrics from Cloud for a site's cells
export const useCloudQoeMetrics = (siteDetail: any) => {
  const [cloudData, setCloudData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'cloud' | 'mock'>('mock');

  useEffect(() => {
    if (!siteDetail?.cells?.length) { setCloudData(null); return; }
    let cancelled = false;
    const cellIds = siteDetail.cells.map((c: any) => c.cell_id);

    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await qoeMetricsApi.query({
          site_id: siteDetail.site_id,
          cell_ids: cellIds,
          limit: 500,
        });

        if (!data || data.length === 0) {
          if (!cancelled) { setCloudData(null); setSource('mock'); }
          return;
        }

        const byDate = new Map<string, any[]>();
        data.forEach((row: any) => {
          const d = row.dt;
          if (!byDate.has(d)) byDate.set(d, []);
          byDate.get(d)!.push(row);
        });

        const avgVal = (arr: any[], key: string) => {
          const vals = arr.map(r => r[key]).filter((v: any) => v != null);
          return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
        };

        const series = Array.from(byDate.entries()).map(([dt, rows]) => ({
          date: new Date(dt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
          QoE: avgVal(rows, 'qoe_score_avg'),
          'DMS 3M': avgVal(rows, 'dms_dl_3'),
          'DMS 8M': avgVal(rows, 'dms_dl_8'),
          'DMS 30M': avgVal(rows, 'dms_dl_30'),
          'DMS UL': avgVal(rows, 'dms_ul_3'),
          'Débit DL': avgVal(rows, 'p50_thr_dn_mbps'),
          'Débit UL': avgVal(rows, 'p50_thr_up_mbps'),
          'RTT P95': avgVal(rows, 'p95_rtt_ms'),
        }));

        if (!cancelled) { setCloudData(series); setSource('cloud'); }
      } catch {
        if (!cancelled) { setCloudData(null); setSource('mock'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [siteDetail?.site_id]);

  return { cloudData, loading, source };
};

export const KPI_SERIES = [
  { key: 'Avg Distance', color: '#3b82f6', label: 'Avg Distance' },
];

const RACH_BINS = ['0–500m', '500m–1km', '1–2km', '2–5km', '>5km'];
const RACH_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

const generateDistanceSeries = (siteDetail: any) => {
  const seed = siteDetail?.site_id || 'default';
  const days = 14;
  const now = new Date('2026-02-10');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const hash = [...(seed + i.toString())].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const v = 0.3 + (Math.abs(Math.sin(hash)) * 1.7);
    return { date: d.toISOString().slice(5, 10), 'Avg Distance': +v.toFixed(2) };
  });
};

const generateRachBins = (siteDetail: any) => {
  const seed = siteDetail?.site_id || 'default';
  const raw = RACH_BINS.map((_, i) => {
    const hash = [...(seed + 'rach' + i)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    return 5 + Math.abs(Math.sin(hash)) * 35;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return RACH_BINS.map((bin, i) => ({ bin, pct: +((raw[i] / total) * 100).toFixed(1) }));
};

export const SiteKpiChart = ({ siteDetail, fullHeight }: { siteDetail: any; fullHeight?: boolean }) => {
  const [chartMode, setChartMode] = useState<'distance' | 'rach'>('distance');

  const distData = useMemo(() => generateDistanceSeries(siteDetail), [siteDetail]);
  const rachData = useMemo(() => generateRachBins(siteDetail), [siteDetail]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setChartMode('distance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${
              chartMode === 'distance' ? 'text-white shadow-sm bg-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-primary" />
            Avg Distance
          </button>
          <button
            onClick={() => setChartMode('rach')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${
              chartMode === 'rach' ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground'
            }`}
            style={chartMode === 'rach' ? { background: '#8b5cf6' } : undefined}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
            RACH Bins
          </button>
        </div>
      </div>
      <div className={fullHeight ? "flex-1 min-h-[250px]" : "h-[200px]"}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'distance' ? (
            <LineChart data={distData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis unit=" km" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(v: number) => [`${v} km`, 'Avg Distance']}
              />
              <Line type="monotone" dataKey="Avg Distance" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          ) : (
            <BarChart data={rachData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bin" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis unit="%" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(v: number) => [`${v}%`, 'Users']}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {rachData.map((_, i) => (
                  <Cell key={i} fill={RACH_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
