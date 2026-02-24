import React from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, Legend
} from 'recharts';
import { ProfilePoint, LOSAnalysis } from '@/utils/geodesicUtils';

interface Props {
  profilePoints: ProfilePoint[];
  analysis: LOSAnalysis;
}

const ProfileChart: React.FC<Props> = ({ profilePoints, analysis }) => {
  const data = profilePoints.map((p, i) => ({
    distance: Math.round(p.distance) / 1000, // km
    terrain: Math.round(analysis.effectiveTerrain[i] * 10) / 10,
    beam: Math.round(analysis.beamAltitudes[i] * 10) / 10,
    rawTerrain: Math.round(p.elevation * 10) / 10,
  }));

  const obstructionPoint = analysis.obstructionIndex !== null ? {
    distance: data[analysis.obstructionIndex]?.distance,
    altitude: data[analysis.obstructionIndex]?.terrain,
  } : null;

  const maxAlt = Math.max(
    ...data.map(d => Math.max(d.terrain, d.beam, d.rawTerrain)),
    50
  );
  const minAlt = Math.min(
    ...data.map(d => Math.min(d.terrain, d.beam, d.rawTerrain)),
    0
  );

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="distance"
            tickFormatter={(v) => `${v.toFixed(1)}`}
            label={{ value: 'Distance (km)', position: 'insideBottomRight', offset: -5, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            domain={[Math.floor(minAlt - 10), Math.ceil(maxAlt + 20)]}
            label={{ value: 'Altitude (m)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = { terrain: 'Terrain eff.', beam: 'Faisceau', rawTerrain: 'Terrain brut' };
              return [`${value.toFixed(1)} m`, labels[name] || name];
            }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = { terrain: 'Terrain effectif', beam: 'Faisceau radio', rawTerrain: 'Terrain brut' };
              return labels[value] || value;
            }}
          />
          <Area
            type="monotone"
            dataKey="terrain"
            stroke="hsl(var(--primary))"
            fill="url(#terrainGrad)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="beam"
            stroke="hsl(0 84% 60%)"
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rawTerrain"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            opacity={0.5}
            isAnimationActive={false}
          />
          {obstructionPoint && (
            <ReferenceDot
              x={obstructionPoint.distance}
              y={obstructionPoint.altitude}
              r={6}
              fill="hsl(0 84% 60%)"
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfileChart;
