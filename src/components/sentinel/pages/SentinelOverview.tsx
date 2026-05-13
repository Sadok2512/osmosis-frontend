import React, { useMemo, useEffect, useRef, createContext, useContext } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { techHex } from '@/constants/brandColors';
import { useQuery } from '@tanstack/react-query';
import { fetchOverview } from '../sentinelApi';
import { ANOMALY_TYPE_LABELS, type DashboardOverviewData } from '../types';
import { MOCK_OVERVIEW, MOCK_ML_INSIGHTS, MOCK_QOE_SCORE, MOCK_QOE_YESTERDAY, MOCK_DELTAS, MOCK_REGION_HEAT, type MLInsightRow } from '../mockSentinelData';
import {
  Shield, AlertTriangle, AlertCircle, Info, TrendingUp, TrendingDown,
  Activity, Brain, MapPin, Cpu, Radio, Signal
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface Props { date: string; apiConnected?: boolean; theme?: 'light' | 'dark'; }

/* ── NOC Color Palettes ── */
const NOC_DARK = {
  bg: '#0a0e1a', cardBg: '#111827', cardBorder: '#1e293b', cardBgHover: '#1a2332',
  critical: '#ef4444', criticalBg: 'rgba(239,68,68,0.08)', criticalGlow: 'rgba(239,68,68,0.25)',
  major: '#f59e0b', majorBg: 'rgba(245,158,11,0.08)', majorGlow: 'rgba(245,158,11,0.25)',
  minor: '#3b82f6', minorBg: 'rgba(59,130,246,0.08)', minorGlow: 'rgba(59,130,246,0.25)',
  ok: '#10b981', okBg: 'rgba(16,185,129,0.08)',
  text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b',
  accent: '#06b6d4', accentBg: 'rgba(6,182,212,0.08)', purple: '#8b5cf6',
  grid: 'rgba(148,163,184,0.06)',
  chartColors: ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981'],
};

const NOC_LIGHT = {
  bg: '#f8fafc', cardBg: '#ffffff', cardBorder: '#e2e8f0', cardBgHover: '#f1f5f9',
  critical: '#dc2626', criticalBg: 'rgba(220,38,38,0.06)', criticalGlow: 'rgba(220,38,38,0.18)',
  major: '#d97706', majorBg: 'rgba(217,119,6,0.06)', majorGlow: 'rgba(217,119,6,0.18)',
  minor: '#2563eb', minorBg: 'rgba(37,99,235,0.06)', minorGlow: 'rgba(37,99,235,0.18)',
  ok: '#059669', okBg: 'rgba(5,150,105,0.06)',
  text: '#0f172a', textMuted: '#475569', textDim: '#94a3b8',
  accent: '#0891b2', accentBg: 'rgba(8,145,178,0.06)', purple: '#7c3aed',
  grid: 'rgba(148,163,184,0.12)',
  chartColors: ['#dc2626', '#d97706', '#7c3aed', '#2563eb', '#0891b2', '#059669'],
};

type NOCPalette = typeof NOC_DARK;
const NOCContext = createContext<NOCPalette>(NOC_LIGHT);
const useNOC = () => useContext(NOCContext);

const SentinelOverview: React.FC<Props> = ({ date, apiConnected = true, theme = 'light' }) => {
  const NOC = theme === 'dark' ? NOC_DARK : NOC_LIGHT;

  const { data: apiData, isLoading } = useQuery<DashboardOverviewData>({
    queryKey: ['sentinel-overview', date],
    queryFn: () => fetchOverview(date),
    staleTime: 5 * 60_000, gcTime: 10 * 60_000, retry: 0,
    refetchOnWindowFocus: false, refetchOnMount: false,
    enabled: apiConnected && !!date,
  });

  const data = apiData || (!apiConnected ? { ...MOCK_OVERVIEW, date } : null);
  const isMock = !apiData && !apiConnected;
  const deltas = MOCK_DELTAS;

  if (isLoading && apiConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8" style={{ background: NOC.bg }}>
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${NOC.accent} transparent ${NOC.accent} ${NOC.accent}` }} />
          <Activity className="w-6 h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: NOC.accent }} />
        </div>
        <p className="text-sm font-medium" style={{ color: NOC.textMuted }}>Loading Sentinel data…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: NOC.bg }}>
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto" style={{ color: NOC.critical }} />
          <p className="text-sm font-semibold" style={{ color: NOC.text }}>No Data Available</p>
          <p className="text-xs" style={{ color: NOC.textDim }}>Verify FastAPI backend connection</p>
        </div>
      </div>
    );
  }

  return (
    <NOCContext.Provider value={NOC}>
      <div className="min-h-full" style={{ background: NOC.bg }}>
        <div className="p-5 space-y-5 max-w-[1920px] mx-auto">
          {isMock && (
            <div className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2"
              style={{ background: NOC.majorBg, color: NOC.major, border: `1px solid ${NOC.majorGlow}` }}>
              <AlertTriangle className="w-4 h-4" /> Demo Data — FastAPI backend not connected
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard label="Total Anomalies" value={data.total_anomalies} delta={deltas.total_anomalies}
              icon={<Shield className="w-5 h-5" />} color={NOC.text} bgAccent={NOC.accentBg} iconColor={NOC.accent} />
            <KPICard label="Critical" value={data.critical} delta={deltas.critical}
              icon={<AlertTriangle className="w-5 h-5" />} color={NOC.critical} bgAccent={NOC.criticalBg} iconColor={NOC.critical} pulse={data.critical > 0} />
            <KPICard label="Major" value={data.major} delta={deltas.major}
              icon={<AlertCircle className="w-5 h-5" />} color={NOC.major} bgAccent={NOC.majorBg} iconColor={NOC.major} />
            <KPICard label="Minor" value={data.minor} delta={deltas.minor}
              icon={<Info className="w-5 h-5" />} color={NOC.minor} bgAccent={NOC.minorBg} iconColor={NOC.minor} />
            <QoEGaugeCard score={MOCK_QOE_SCORE} yesterday={MOCK_QOE_YESTERDAY} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NOCCard title="Anomalies by Type" icon={<Brain className="w-4 h-4" />}>
              <AnomalyTypeChart data={data.anomalies_by_type} />
            </NOCCard>
            <NOCCard title="Anomalies by Network Dimension" icon={<Radio className="w-4 h-4" />}>
              <DimensionChart data={data.anomalies_by_dimension} />
            </NOCCard>
          </div>

          <NOCCard title="Network QoE Heatmap" icon={<MapPin className="w-4 h-4" />} subtitle="Geographic anomaly density across France">
            <RegionHeatmap />
          </NOCCard>

          <NOCCard title="Anomaly Trend — Network Wide" icon={<Cpu className="w-4 h-4" />} subtitle="Daily anomaly volume by severity">
            <AnomalyTrendChart />
          </NOCCard>
        </div>
      </div>
    </NOCContext.Provider>
  );
};

/* ━━━ KPI Card ━━━ */
const KPICard: React.FC<{
  label: string; value: number; delta: number;
  icon: React.ReactNode; color: string; bgAccent: string; iconColor: string; pulse?: boolean;
}> = ({ label, value, delta, icon, color, bgAccent, iconColor, pulse }) => {
  const NOC = useNOC();
  const isUp = delta > 0;
  return (
    <div className="rounded-xl p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.02]"
      style={{ background: NOC.cardBg, border: `1px solid ${NOC.cardBorder}` }}>
      {pulse && <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: bgAccent }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: NOC.textDim }}>{label}</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</span>
            <span className="text-[11px] font-medium flex items-center gap-0.5" style={{ color: isUp ? NOC.critical : NOC.ok }}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{delta} vs yesterday
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ━━━ QoE Gauge ━━━ */
const QoEGaugeCard: React.FC<{ score: number; yesterday: number }> = ({ score, yesterday }) => {
  const NOC = useNOC();
  const delta = score - yesterday;
  const gaugeColor = score >= 75 ? NOC.ok : score >= 50 ? NOC.major : NOC.critical;
  const option = useMemo(() => ({
    series: [{
      type: 'gauge', center: ['50%', '65%'], radius: '90%', startAngle: 200, endAngle: -20, min: 0, max: 100,
      pointer: { show: false },
      progress: { show: true, width: 12, roundCap: true, itemStyle: { color: gaugeColor } },
      axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(148,163,184,0.1)']] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      detail: { valueAnimation: true, fontSize: 26, fontWeight: 700, color: gaugeColor, formatter: '{value}', offsetCenter: [0, '-5%'] },
      data: [{ value: score }],
    }],
  }), [score, gaugeColor]);

  return (
    <div className="rounded-xl p-4 relative overflow-hidden col-span-2 lg:col-span-1"
      style={{ background: NOC.cardBg, border: `1px solid ${NOC.cardBorder}` }}>
      <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: NOC.textDim }}>Network QoE Score</p>
      <ReactECharts option={option} style={{ height: 100 }} opts={{ renderer: 'canvas' }} />
      <div className="text-center -mt-2">
        <span className="text-[11px] font-medium flex items-center justify-center gap-1" style={{ color: delta >= 0 ? NOC.ok : NOC.critical }}>
          {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} vs yesterday
        </span>
      </div>
    </div>
  );
};

/* ━━━ Card Wrapper ━━━ */
const NOCCard: React.FC<{ title: string; icon?: React.ReactNode; subtitle?: string; children: React.ReactNode }> = ({ title, icon, subtitle, children }) => {
  const NOC = useNOC();
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: NOC.cardBg, border: `1px solid ${NOC.cardBorder}` }}>
      <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${NOC.cardBorder}` }}>
        {icon && <span style={{ color: NOC.accent }}>{icon}</span>}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: NOC.text }}>{title}</span>
        {subtitle && <span className="text-[10px] ml-2" style={{ color: NOC.textDim }}>— {subtitle}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
};

/* ━━━ Anomaly Type Chart ━━━ */
const AnomalyTypeChart: React.FC<{ data: Record<string, number> }> = ({ data }) => {
  const NOC = useNOC();
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([k]) => ANOMALY_TYPE_LABELS[k as keyof typeof ANOMALY_TYPE_LABELS] || k);
  const values = entries.map(([, v]) => v);
  const option = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: NOC.cardBg, borderColor: NOC.cardBorder, textStyle: { color: NOC.text, fontSize: 11 } },
    grid: { left: 180, right: 30, top: 10, bottom: 10 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: NOC.grid } }, axisLabel: { color: NOC.textDim, fontSize: 10 } },
    yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { color: NOC.textMuted, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', data: values, barWidth: 20,
      itemStyle: { borderRadius: [0, 4, 4, 0], color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: NOC.critical }, { offset: 1, color: NOC.major }] } },
      label: { show: true, position: 'right', color: NOC.textMuted, fontSize: 11, fontWeight: 600 },
    }],
  }), [labels, values, NOC]);
  return <ReactECharts option={option} style={{ height: 200 }} />;
};

/* ━━━ Dimension Chart ━━━ */
const DimensionChart: React.FC<{ data: { dimension: string; count: number }[] }> = ({ data }) => {
  const NOC = useNOC();
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const option = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: NOC.cardBg, borderColor: NOC.cardBorder, textStyle: { color: NOC.text, fontSize: 11 } },
    grid: { left: 80, right: 30, top: 10, bottom: 10 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: NOC.grid } }, axisLabel: { color: NOC.textDim, fontSize: 10 } },
    yAxis: { type: 'category', data: sorted.map(d => d.dimension), inverse: true, axisLabel: { color: NOC.textMuted, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', data: sorted.map((d, i) => ({ value: d.count, itemStyle: { color: NOC.chartColors[i % NOC.chartColors.length] } })),
      barWidth: 20, itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: NOC.textMuted, fontSize: 11, fontWeight: 600 },
    }],
  }), [sorted, NOC]);
  return <ReactECharts option={option} style={{ height: 200 }} />;
};

/* ━━━ Region Heatmap (Leaflet) ━━━ */
const RegionHeatmap: React.FC = () => {
  const NOC = useNOC();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.6, 2.5], zoom: 5, zoomControl: true, attributionControl: false,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    const tileUrl = NOC.bg === '#0a0e1a'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    const maxCount = Math.max(...MOCK_REGION_HEAT.map(r => r.anomalyCount));
    const heatPoints: [number, number, number][] = MOCK_REGION_HEAT.map(r => [r.lat, r.lng, r.anomalyCount / maxCount]);
    (L as any).heatLayer(heatPoints, {
      radius: 45, blur: 35, maxZoom: 8, minOpacity: 0.4,
      gradient: { 0.2: NOC.minor, 0.5: NOC.major, 0.8: NOC.critical, 1.0: NOC.critical },
    }).addTo(map);

    MOCK_REGION_HEAT.forEach(r => {
      const sevColor = r.severity === 'critical' ? NOC.critical : r.severity === 'major' ? NOC.major : r.severity === 'minor' ? NOC.minor : NOC.ok;
      L.circleMarker([r.lat, r.lng], {
        radius: Math.max(6, Math.sqrt(r.anomalyCount) * 2),
        color: sevColor, fillColor: sevColor, fillOpacity: 0.7, weight: 1.5,
      }).bindTooltip(
        `<b>${r.name}</b><br/>Anomalies: ${r.anomalyCount}<br/>QoE: ${r.qoe}<br/>Severity: ${r.severity}`,
        { direction: 'top', offset: [0, -4] }
      ).addTo(map);
    });

    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, [NOC]);

  return <div ref={containerRef} style={{ height: 380, borderRadius: 8, overflow: 'hidden' }} />;
};

/* ━━━ Anomaly Trend (Network Wide) ━━━ */
const TREND_RANGES: { key: string; label: string; days: number }[] = [
  { key: '7j', label: '7j', days: 7 },
  { key: '1m', label: '1m', days: 30 },
  { key: '3m', label: '3m', days: 90 },
  { key: '6m', label: '6m', days: 180 },
  { key: 'ALL', label: 'ALL', days: 365 },
];

const AnomalyTrendChart: React.FC = () => {
  const NOC = useNOC();
  const [rangeKey, setRangeKey] = React.useState<string>('1m');
  const days = TREND_RANGES.find(r => r.key === rangeKey)?.days ?? 30;

  const { dates, critical, major, minor } = useMemo(() => {
    const dates: string[] = [];
    const critical: number[] = [];
    const major: number[] = [];
    const minor: number[] = [];
    const today = new Date();
    const showYear = days > 90;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString('en-GB', showYear
        ? { day: '2-digit', month: 'short', year: '2-digit' }
        : { day: '2-digit', month: 'short' }));
      const seed = (i * 9301 + 49297) % 233280;
      const r = (n: number) => Math.floor(((seed * (n + 1)) % 233280) / 233280 * 100);
      critical.push(8 + (r(1) % 18));
      major.push(20 + (r(2) % 30));
      minor.push(35 + (r(3) % 45));
    }
    return { dates, critical, major, minor };
  }, [days]);

  const option = useMemo(() => ({
    tooltip: {
      trigger: 'axis', backgroundColor: NOC.cardBg, borderColor: NOC.cardBorder,
      textStyle: { color: NOC.text, fontSize: 11 },
    },
    legend: {
      data: ['Critical', 'Major', 'Minor'], top: 0, right: 10,
      textStyle: { color: NOC.textMuted, fontSize: 11 }, itemWidth: 12, itemHeight: 8,
    },
    grid: { left: 50, right: 30, top: 35, bottom: 30 },
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLine: { lineStyle: { color: NOC.cardBorder } },
      axisLabel: { color: NOC.textDim, fontSize: 10, hideOverlap: true, rotate: days > 30 ? 35 : 0 },
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: NOC.grid } },
      axisLabel: { color: NOC.textDim, fontSize: 10 },
    },
    series: [
      {
        name: 'Critical', type: 'line', smooth: true, stack: 'total', data: critical,
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: NOC.critical },
        lineStyle: { width: 2, color: NOC.critical },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: NOC.critical + 'cc' }, { offset: 1, color: NOC.critical + '10' }] },
        },
      },
      {
        name: 'Major', type: 'line', smooth: true, stack: 'total', data: major,
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: NOC.major },
        lineStyle: { width: 2, color: NOC.major },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: NOC.major + 'cc' }, { offset: 1, color: NOC.major + '10' }] },
        },
      },
      {
        name: 'Minor', type: 'line', smooth: true, stack: 'total', data: minor,
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: NOC.minor },
        lineStyle: { width: 2, color: NOC.minor },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: NOC.minor + 'cc' }, { offset: 1, color: NOC.minor + '10' }] },
        },
      },
    ],
  }), [dates, critical, major, minor, NOC]);

  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-2">
        {TREND_RANGES.map(r => {
          const active = rangeKey === r.key;
          return (
            <button key={r.key} onClick={() => setRangeKey(r.key)}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={{
                background: active ? NOC.accentBg : 'transparent',
                color: active ? NOC.accent : NOC.textMuted,
                border: `1px solid ${active ? NOC.accent : NOC.cardBorder}`,
              }}>
              {r.label}
            </button>
          );
        })}
      </div>
      <ReactECharts option={option} style={{ height: 320 }} notMerge />
    </div>
  );
};

/* ━━━ ML Insights Table ━━━ */
const MLInsightsTable: React.FC<{ rows: MLInsightRow[] }> = ({ rows }) => {
  const NOC = useNOC();
  const sevBadge = (s: string) => {
    const c = s === 'critical' ? { bg: NOC.criticalBg, color: NOC.critical, border: NOC.criticalGlow }
            : s === 'major' ? { bg: NOC.majorBg, color: NOC.major, border: NOC.majorGlow }
            : { bg: NOC.minorBg, color: NOC.minor, border: NOC.minorGlow };
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{s}</span>;
  };
  const confBar = (v: number) => (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.1)' }}>
        <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: v >= 0.9 ? NOC.ok : v >= 0.8 ? NOC.accent : NOC.major }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums" style={{ color: NOC.textMuted }}>{(v * 100).toFixed(0)}%</span>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ color: NOC.text }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${NOC.cardBorder}` }}>
            {['Entity Name', 'Tech', 'Dimension', 'Severity', 'QoE', 'DL Throughput', 'Problem Detected', 'Root Cause', 'ML Confidence'].map(h => (
              <th key={h} className="text-left py-3 px-3 font-semibold uppercase tracking-wider" style={{ color: NOC.textDim, fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors cursor-pointer"
              style={{ background: row.severity === 'critical' ? NOC.criticalBg : 'transparent', borderBottom: `1px solid ${NOC.cardBorder}` }}
              onMouseEnter={e => (e.currentTarget.style.background = NOC.cardBgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = row.severity === 'critical' ? NOC.criticalBg : 'transparent')}>
              <td className="py-2.5 px-3 font-mono font-medium" style={{ color: NOC.accent }}>{row.entity}</td>
              <td className="py-2.5 px-3">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: `${techHex(row.technology)}20`, color: techHex(row.technology) }}>
                  <Signal className="w-3 h-3" />{row.technology === 'NR' ? '5G NR' : row.technology === 'LTE' ? 'LTE' : (row.technology || 'Unknown')}
                </span>
              </td>
              <td className="py-2.5 px-3" style={{ color: NOC.textMuted }}>{row.dimension}</td>
              <td className="py-2.5 px-3">{sevBadge(row.severity)}</td>
              <td className="py-2.5 px-3 font-mono tabular-nums font-medium" style={{ color: row.qoe_index < 45 ? NOC.critical : row.qoe_index < 60 ? NOC.major : NOC.text }}>
                {row.qoe_index.toFixed(1)}
              </td>
              <td className="py-2.5 px-3 font-mono tabular-nums" style={{ color: NOC.textMuted }}>{row.dl_throughput.toFixed(1)} Mbps</td>
              <td className="py-2.5 px-3" style={{ color: NOC.textMuted }}>{row.problem}</td>
              <td className="py-2.5 px-3 text-[11px]" style={{ color: NOC.purple }}>{row.root_cause}</td>
              <td className="py-2.5 px-3">{confBar(row.ml_confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SentinelOverview;
