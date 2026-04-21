import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { MapWidgetConfig, DEFAULT_MAP_CONFIG } from '../types';

interface Site {
  name: string;
  lon: number;
  lat: number;
  intensity: number; // 0-100
  status: 'optimal' | 'warning' | 'critical';
  vendor: 'Ericsson' | 'Huawei' | 'Nokia';
  techno: '4G' | '5G';
  bande: string;
  plaque: string;
  dor: string;
}

const FRANCE_SITES: Site[] = [
  { name: 'Paris-Nord',       lon: 2.3522,  lat: 48.8566, intensity: 92, status: 'optimal',  vendor: 'Ericsson', techno: '5G', bande: 'N78', plaque: 'Paris',     dor: 'DOR-IDF' },
  { name: 'Lyon-Centre',      lon: 4.8357,  lat: 45.7640, intensity: 78, status: 'optimal',  vendor: 'Huawei',   techno: '4G', bande: 'B7',  plaque: 'Lyon',      dor: 'DOR-EST' },
  { name: 'Marseille-Port',   lon: 5.3698,  lat: 43.2965, intensity: 54, status: 'warning',  vendor: 'Nokia',    techno: '4G', bande: 'B3',  plaque: 'Marseille', dor: 'DOR-SUD' },
  { name: 'Toulouse-Sud',     lon: 1.4442,  lat: 43.6047, intensity: 81, status: 'optimal',  vendor: 'Ericsson', techno: '5G', bande: 'N78', plaque: 'Toulouse',  dor: 'DOR-SUD' },
  { name: 'Bordeaux-Ouest',   lon: -0.5792, lat: 44.8378, intensity: 67, status: 'warning',  vendor: 'Huawei',   techno: '4G', bande: 'B20', plaque: 'Bordeaux',  dor: 'DOR-OUEST' },
  { name: 'Lille-Métropole',  lon: 3.0573,  lat: 50.6292, intensity: 88, status: 'optimal',  vendor: 'Nokia',    techno: '5G', bande: 'N78', plaque: 'Lille',     dor: 'DOR-NORD' },
  { name: 'Nantes-Atlantique',lon: -1.5536, lat: 47.2184, intensity: 73, status: 'optimal',  vendor: 'Ericsson', techno: '4G', bande: 'B7',  plaque: 'Nantes',    dor: 'DOR-OUEST' },
  { name: 'Strasbourg-Est',   lon: 7.7521,  lat: 48.5734, intensity: 41, status: 'critical', vendor: 'Huawei',   techno: '4G', bande: 'B3',  plaque: 'Lyon',      dor: 'DOR-EST' },
  { name: 'Nice-Côte',        lon: 7.2620,  lat: 43.7102, intensity: 62, status: 'warning',  vendor: 'Nokia',    techno: '4G', bande: 'B7',  plaque: 'Marseille', dor: 'DOR-SUD' },
  { name: 'Rennes-Centre',    lon: -1.6778, lat: 48.1173, intensity: 85, status: 'optimal',  vendor: 'Ericsson', techno: '5G', bande: 'N78', plaque: 'Nantes',    dor: 'DOR-OUEST' },
  { name: 'Montpellier',      lon: 3.8767,  lat: 43.6108, intensity: 35, status: 'critical', vendor: 'Huawei',   techno: '4G', bande: 'B20', plaque: 'Marseille', dor: 'DOR-SUD' },
  { name: 'Brest',            lon: -4.4860, lat: 48.3904, intensity: 70, status: 'optimal',  vendor: 'Nokia',    techno: '4G', bande: 'B8',  plaque: 'Nantes',    dor: 'DOR-OUEST' },
];

const colorFor = (status: Site['status']) =>
  status === 'optimal' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

interface Props {
  height?: number | string;
  config?: MapWidgetConfig;
}

const PAMapWidget: React.FC<Props> = ({ height = 360, config }) => {
  const cfg = config ?? DEFAULT_MAP_CONFIG;
  const isDark = cfg.theme === 'dark';
  const isSatellite = cfg.mapType === 'satellite';

  // ── Apply filters ──
  const filteredSites = useMemo(() => {
    return FRANCE_SITES.filter((s) => {
      for (const f of cfg.filters) {
        if (f.values.length === 0) continue;
        const dim = f.dimension.toUpperCase();
        let v: string | undefined;
        if (dim === 'VENDOR') v = s.vendor;
        else if (dim === 'TECHNO') v = s.techno;
        else if (dim === 'BANDE') v = s.bande;
        else if (dim === 'PLAQUE') v = s.plaque;
        else if (dim === 'DOR') v = s.dor;
        else if (dim === 'SITE') v = s.name;
        else if (dim === 'CELL') v = s.name;
        if (!v || !f.values.includes(v)) return false;
      }
      return true;
    });
  }, [cfg.filters]);

  // ── Background tones based on theme + map type ──
  const bgClass = isDark
    ? isSatellite
      ? 'from-slate-950 via-slate-900 to-slate-800'
      : 'from-slate-900 to-slate-800'
    : isSatellite
      ? 'from-emerald-50 via-stone-100 to-amber-50'
      : 'from-slate-50 to-emerald-50/30';

  const labelColor = isDark ? '#cbd5e1' : '#475569';
  const labelEmphasisColor = isDark ? '#f8fafc' : '#0f172a';
  const tooltipBg = isDark ? 'rgba(2,6,23,0.95)' : 'rgba(15,23,42,0.95)';

  const pointMultiplier = cfg.displayMode === 'cells' ? 3 : 1; // simulate denser cell view by adding sector ripples
  const seriesData = useMemo(() => {
    const base = filteredSites.map((s) => ({
      name: s.name,
      value: [s.lon, s.lat, s.intensity] as [number, number, number],
      itemStyle: {
        color: cfg.kpiOverlay ? colorFor(s.status) : (cfg.defaultColor || '#10b981'),
        shadowColor: cfg.kpiOverlay ? colorFor(s.status) : (cfg.defaultColor || '#10b981'),
        shadowBlur: cfg.heatmap ? 24 : 12,
      },
    }));
    if (pointMultiplier === 1) return base;
    // For "Cells" mode, add jittered satellite points to simulate sectors/beams.
    const out = [...base];
    filteredSites.forEach((s) => {
      const offsets = [[0.04, 0.02], [-0.03, 0.03], [0.02, -0.04]];
      offsets.forEach(([dx, dy], i) => {
        out.push({
          name: `${s.name}#${i + 1}`,
          value: [s.lon + dx, s.lat + dy, Math.max(20, s.intensity - 10)],
          itemStyle: {
            color: cfg.kpiOverlay ? colorFor(s.status) : (cfg.defaultColor || '#10b981'),
            shadowColor: cfg.kpiOverlay ? colorFor(s.status) : (cfg.defaultColor || '#10b981'),
            shadowBlur: 8,
          },
        });
      });
    });
    return out;
  }, [filteredSites, cfg.kpiOverlay, cfg.heatmap, cfg.defaultColor, pointMultiplier]);

  const linesData = useMemo(() => {
    if (!cfg.showLines) return [];
    const known = new Set(filteredSites.map((s) => s.name));
    const all: { coords: [number, number][] }[] = [
      { coords: [[2.3522, 48.8566], [4.8357, 45.7640]] },
      { coords: [[2.3522, 48.8566], [-1.5536, 47.2184]] },
      { coords: [[4.8357, 45.7640], [5.3698, 43.2965]] },
      { coords: [[4.8357, 45.7640], [3.8767, 43.6108]] },
      { coords: [[2.3522, 48.8566], [3.0573, 50.6292]] },
      { coords: [[2.3522, 48.8566], [7.7521, 48.5734]] },
      { coords: [[1.4442, 43.6047], [-0.5792, 44.8378]] },
    ];
    // Filter lines whose endpoints belong to filtered sites.
    const sitesByCoord = new Map(FRANCE_SITES.map((s) => [`${s.lon},${s.lat}`, s.name]));
    return all.filter((l) =>
      l.coords.every((c) => {
        const name = sitesByCoord.get(`${c[0]},${c[1]}`);
        return name ? known.has(name) : true;
      }),
    );
  }, [cfg.showLines, filteredSites]);

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: tooltipBg,
      borderColor: 'transparent',
      textStyle: { color: '#f8fafc', fontSize: 11, fontWeight: 600 },
      formatter: (p: any) => `<b>${p.data.name}</b><br/>Load: ${p.data.value[2]}%`,
    },
    grid: { top: 10, right: 10, bottom: 10, left: 10, containLabel: false },
    xAxis: { type: 'value' as const, min: -5.5, max: 9.5, show: false },
    yAxis: { type: 'value' as const, min: 41.5, max: 51.5, show: false },
    series: [
      {
        type: cfg.heatmap ? ('effectScatter' as const) : ('scatter' as const),
        data: seriesData,
        symbolSize: (val: number[]) => {
          const base = cfg.displayMode === 'cells' ? 5 : 8;
          const factor = cfg.displayMode === 'cells' ? 12 : 18;
          return base + (val[2] / 100) * factor;
        },
        rippleEffect: cfg.heatmap ? { brushType: 'stroke' as const, scale: 3.5 } : undefined,
        showEffectOn: 'render' as const,
        label: {
          show: cfg.showLabels && cfg.displayMode === 'sites',
          position: 'top' as const,
          formatter: (p: any) => p.data.name,
          fontSize: 9,
          fontWeight: 700,
          color: labelColor,
        },
        emphasis: {
          scale: 1.4,
          label: { fontSize: 11, color: labelEmphasisColor },
        },
        z: 3,
      },
      ...(cfg.showLines && linesData.length > 0 ? [{
        type: 'lines' as const,
        coordinateSystem: 'cartesian2d' as const,
        data: linesData,
        lineStyle: {
          color: cfg.defaultColor || '#10b981',
          opacity: isDark ? 0.4 : 0.25,
          width: 1,
          curveness: 0.2,
        },
        effect: {
          show: true,
          period: 6,
          trailLength: 0.6,
          color: cfg.defaultColor || '#10b981',
          symbolSize: 3,
        },
        z: 1,
      }] : []),
      ...(cfg.showSectors ? [{
        type: 'scatter' as const,
        data: filteredSites.flatMap((s) => {
          // Three sectors per site at 120° spacing — visual hint only.
          return [0, 120, 240].map((angle) => {
            const r = 0.06;
            const rad = (angle * Math.PI) / 180;
            return {
              name: `${s.name}·sector`,
              value: [s.lon + r * Math.cos(rad), s.lat + r * Math.sin(rad), s.intensity / 2],
              itemStyle: {
                color: cfg.defaultColor || colorFor(s.status),
                opacity: 0.35,
              },
            };
          });
        }),
        symbol: 'triangle',
        symbolSize: 8,
        z: 2,
        silent: true,
      }] : []),
    ],
  }), [seriesData, linesData, cfg, isDark, labelColor, labelEmphasisColor, tooltipBg, filteredSites]);

  return (
    <div
      style={{ width: '100%', height }}
      className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${bgClass} border ${isDark ? 'border-slate-700/50' : 'border-outline-variant/20'}`}
    >
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />

      {/* Legend */}
      {cfg.showLegend && cfg.kpiOverlay && (
        <div className={`absolute top-3 left-3 ${isDark ? 'bg-slate-900/85 border-slate-700/50' : 'bg-white/85 border-outline-variant/20'} backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border`}>
          <div className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-on-surface-variant/60'} mb-1`}>
            {cfg.displayMode === 'sites' ? 'Sites' : 'Cells'} · {filteredSites.length}
          </div>
          <div className={`flex items-center gap-3 text-[10px] font-bold ${isDark ? 'text-slate-200' : ''}`}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Optimal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Warning</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Critical</span>
          </div>
        </div>
      )}

      {/* Map type chip */}
      <div className={`absolute top-3 right-3 ${isDark ? 'bg-slate-900/85 text-slate-200 border-slate-700/50' : 'bg-white/85 text-on-surface-variant border-outline-variant/20'} backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border text-[9px] font-black uppercase tracking-widest`}>
        {cfg.mapType} · {cfg.theme}
      </div>
    </div>
  );
};

export default PAMapWidget;
