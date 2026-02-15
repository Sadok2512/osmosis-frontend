import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Bar, ComposedChart
} from 'recharts';
import { QoEChartPayload, KPIType } from '../../types';

interface QoEChartProps {
  payload: QoEChartPayload;
  selectedKpi?: KPIType | string;
  kpiLabel?: string;
  color?: string;
  type?: 'line' | 'bar' | 'area';
  showSessions?: boolean;
  showPoints?: boolean;
  height?: number | string;
  secondaryKpi?: string;
  backgroundOpacity?: number;
  threshold?: number;
  showAxisX?: boolean;
  showAxisY?: boolean;
}

const DATA_KEY_MAP: Record<string, string> = {
  [KPIType.QOE_SCORE]: 'qoe',
  [KPIType.DMS_DL_3]: 'dms_dl_3',
  [KPIType.DMS_DL_8]: 'dms_dl_8',
  [KPIType.DMS_DL_30]: 'dms_dl_30',
  [KPIType.DMS_UL_3]: 'dms_ul_3',
  [KPIType.THROUGHPUT]: 'throughput',
  [KPIType.THROUGHPUT_UP]: 'throughput_ul',
  [KPIType.LATENCY]: 'latency',
  'sessions': 'sessions',
  'v': 'v',
  'traffic': 'traffic',
  'traffic_ul': 'traffic_ul',
};

const QoEChart: React.FC<QoEChartProps> = ({
  payload,
  selectedKpi,
  kpiLabel,
  color = '#3b82f6',
  type = 'area',
  showSessions = false,
  showPoints = true,
  height = '100%',
  secondaryKpi,
  backgroundOpacity = 0.05,
  threshold,
  showAxisX = true,
  showAxisY = true,
}) => {
  const dataKey = useMemo(() => {
    if (selectedKpi) return DATA_KEY_MAP[selectedKpi] || selectedKpi;
    return 'v';
  }, [selectedKpi]);

  const bgKey = useMemo(() => {
    if (secondaryKpi) return DATA_KEY_MAP[secondaryKpi] || secondaryKpi;
    if (showSessions) return 'sessions';
    return null;
  }, [secondaryKpi, showSessions]);

  const data = useMemo(() => {
    return payload.series.map(s => ({
      ...s,
      date: s.t?.slice(5) || '',
    }));
  }, [payload.series]);

  const gradientId = `grad-${dataKey}`;

  return (
    <div style={{ width: '100%', height }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          {showAxisX && (
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
          )}
          {showAxisY && (
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} domain={[0, 100]} />
          )}
          {bgKey && showAxisY && (
            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={false} />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              fontSize: '10px',
              fontWeight: 'bold',
              color: '#fff',
            }}
          />
          {bgKey && (
            <Bar
              yAxisId="right"
              dataKey={bgKey}
              fill={`rgba(203, 213, 225, ${backgroundOpacity})`}
              barSize={12}
              radius={[4, 4, 0, 0]}
            />
          )}
          {type === 'area' ? (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={showPoints ? { r: 3, fill: '#fff', stroke: color, strokeWidth: 2 } : false}
              activeDot={{ r: 6 }}
            />
          ) : (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill="none"
              dot={showPoints ? { r: 3, fill: '#fff', stroke: color, strokeWidth: 2 } : false}
            />
          )}
          {threshold != null && (
            <ReferenceLine
              yAxisId="left"
              y={threshold}
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default QoEChart;
