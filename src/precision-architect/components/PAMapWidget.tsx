import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface Site {
  name: string;
  value: [number, number, number]; // lon, lat, intensity 0-100
  status: 'optimal' | 'warning' | 'critical';
}

const FRANCE_SITES: Site[] = [
  { name: 'Paris-Nord', value: [2.3522, 48.8566, 92], status: 'optimal' },
  { name: 'Lyon-Centre', value: [4.8357, 45.7640, 78], status: 'optimal' },
  { name: 'Marseille-Port', value: [5.3698, 43.2965, 54], status: 'warning' },
  { name: 'Toulouse-Sud', value: [1.4442, 43.6047, 81], status: 'optimal' },
  { name: 'Bordeaux-Ouest', value: [-0.5792, 44.8378, 67], status: 'warning' },
  { name: 'Lille-Métropole', value: [3.0573, 50.6292, 88], status: 'optimal' },
  { name: 'Nantes-Atlantique', value: [-1.5536, 47.2184, 73], status: 'optimal' },
  { name: 'Strasbourg-Est', value: [7.7521, 48.5734, 41], status: 'critical' },
  { name: 'Nice-Côte', value: [7.2620, 43.7102, 62], status: 'warning' },
  { name: 'Rennes-Centre', value: [-1.6778, 48.1173, 85], status: 'optimal' },
  { name: 'Montpellier', value: [3.8767, 43.6108, 35], status: 'critical' },
  { name: 'Brest', value: [-4.4860, 48.3904, 70], status: 'optimal' },
];

const colorFor = (status: Site['status']) =>
  status === 'optimal' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

interface Props {
  height?: number | string;
}

const PAMapWidget: React.FC<Props> = ({ height = 360 }) => {
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: 'transparent',
      textStyle: { color: '#f8fafc', fontSize: 11, fontWeight: 600 },
      formatter: (p: any) => {
        if (p.seriesType === 'effectScatter') {
          return `<b>${p.data.name}</b><br/>Load: ${p.data.value[2]}%`;
        }
        return p.name;
      },
    },
    geo: {
      map: 'world',
      roam: true,
      center: [2.5, 46.5],
      zoom: 6,
      itemStyle: {
        areaColor: '#f1f5f9',
        borderColor: '#cbd5e1',
        borderWidth: 0.5,
      },
      emphasis: {
        itemStyle: { areaColor: '#e2e8f0' },
        label: { show: false },
      },
    },
    series: [
      {
        name: 'Sites',
        type: 'effectScatter' as const,
        coordinateSystem: 'geo' as const,
        data: FRANCE_SITES.map(s => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: colorFor(s.status) },
        })),
        symbolSize: (val: number[]) => 6 + (val[2] / 100) * 14,
        rippleEffect: { brushType: 'stroke' as const, scale: 3 },
        showEffectOn: 'render' as const,
        zlevel: 2,
      },
    ],
  }), []);

  // Fallback: register a minimal France geo if 'world' map isn't loaded
  // Use scatter on a blank geo by toggling a simple background.
  return (
    <div style={{ width: '100%', height }} className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-50 to-emerald-50/30 border border-outline-variant/20">
      <ReactECharts
        option={{
          ...option,
          geo: undefined,
          grid: { top: 10, right: 10, bottom: 10, left: 10, containLabel: false },
          xAxis: {
            type: 'value' as const,
            min: -5.5, max: 9.5,
            show: false,
          },
          yAxis: {
            type: 'value' as const,
            min: 41.5, max: 51.5,
            show: false,
          },
          series: [
            {
              type: 'scatter' as const,
              data: FRANCE_SITES.map(s => ({
                name: s.name,
                value: [s.value[0], s.value[1], s.value[2]],
                itemStyle: {
                  color: colorFor(s.status),
                  shadowColor: colorFor(s.status),
                  shadowBlur: 12,
                },
              })),
              symbolSize: (val: number[]) => 8 + (val[2] / 100) * 18,
              label: {
                show: true,
                position: 'top' as const,
                formatter: (p: any) => p.data.name,
                fontSize: 9,
                fontWeight: 700,
                color: '#475569',
              },
              emphasis: {
                scale: 1.4,
                label: { fontSize: 11, color: '#0f172a' },
              },
              z: 3,
            },
            {
              type: 'lines' as const,
              coordinateSystem: 'cartesian2d' as const,
              data: [
                { coords: [[2.3522, 48.8566], [4.8357, 45.7640]] },
                { coords: [[2.3522, 48.8566], [-1.5536, 47.2184]] },
                { coords: [[4.8357, 45.7640], [5.3698, 43.2965]] },
                { coords: [[4.8357, 45.7640], [3.8767, 43.6108]] },
                { coords: [[2.3522, 48.8566], [3.0573, 50.6292]] },
                { coords: [[2.3522, 48.8566], [7.7521, 48.5734]] },
                { coords: [[1.4442, 43.6047], [-0.5792, 44.8378]] },
              ],
              lineStyle: {
                color: '#10b981',
                opacity: 0.25,
                width: 1,
                curveness: 0.2,
              },
              effect: {
                show: true,
                period: 6,
                trailLength: 0.6,
                color: '#10b981',
                symbolSize: 3,
              },
              z: 1,
            },
          ],
        }}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      <div className="absolute top-3 left-3 bg-white/85 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-outline-variant/20">
        <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-1">Network Map</div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Optimal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Warning</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Critical</span>
        </div>
      </div>
    </div>
  );
};

export default PAMapWidget;
