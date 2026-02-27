import React from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, Legend
} from 'recharts';
import { ProfilePoint, LOSAnalysis, FresnelAnalysis } from '@/utils/geodesicUtils';

interface Props {
  profilePoints: ProfilePoint[];
  analysis: LOSAnalysis;
  fresnel?: FresnelAnalysis | null;
  showFresnel?: boolean;
  showCurvature?: boolean;
  clutterHeight?: number;
}

const ProfileChart: React.FC<Props> = ({
  profilePoints, analysis, fresnel, showFresnel = false, showCurvature = true, clutterHeight = 0,
}) => {
  const ant = analysis.antennaParams;
  const data = profilePoints.map((p, i) => {
    const entry: Record<string, number> = {
      distance: Math.round(p.distance) / 1000,
      terrain: Math.round(analysis.effectiveTerrain[i] * 10) / 10,
      beam: Math.round(analysis.beamAltitudes[i] * 10) / 10,
      rawTerrain: Math.round(p.elevation * 10) / 10,
    };
    // Rx altitude line (terrain + UE height)
    if (ant && ant.rxHeight > 0) {
      entry.rxLine = Math.round((p.elevation + ant.rxHeight) * 10) / 10;
    }
    if (clutterHeight > 0) {
      entry.clutter = Math.round((analysis.effectiveTerrain[i] + clutterHeight) * 10) / 10;
    }
    if (showFresnel && fresnel) {
      entry.fresnelUpper = Math.round(fresnel.fresnelUpperBound[i] * 10) / 10;
      entry.fresnelLower = Math.round(fresnel.fresnelLowerBound[i] * 10) / 10;
    }
    return entry;
  });

  const obstructionPoint = analysis.obstructionIndex !== null ? {
    distance: data[analysis.obstructionIndex]?.distance,
    altitude: data[analysis.obstructionIndex]?.terrain,
  } : null;

  const allValues = data.flatMap(d => {
    const vals = [d.terrain, d.beam, d.rawTerrain];
    if (d.rxLine) vals.push(d.rxLine);
    if (d.clutter) vals.push(d.clutter);
    if (d.fresnelUpper) vals.push(d.fresnelUpper);
    if (d.fresnelLower) vals.push(d.fresnelLower);
    return vals;
  });
  const maxAlt = Math.max(...allValues, 50);
  const minAlt = Math.min(...allValues, 0);

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="terrainGradGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
              <stop offset="60%" stopColor="rgba(56,189,248,0.12)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
            </linearGradient>
            <linearGradient id="fresnelGradGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(250,204,21,0.18)" />
              <stop offset="100%" stopColor="rgba(250,204,21,0.03)" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 6"
            stroke="rgba(255,255,255,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="distance"
            tickFormatter={(v) => `${v.toFixed(1)}`}
            label={{ value: 'Distance (km)', position: 'insideBottomRight', offset: -5, style: { fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontWeight: 600 } }}
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
            stroke="rgba(255,255,255,0.1)"
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            domain={[Math.floor(minAlt - 10), Math.ceil(maxAlt + 20)]}
            label={{ value: 'Alt (m)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontWeight: 600 } }}
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
            stroke="rgba(255,255,255,0.1)"
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,23,42,0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              fontSize: 11,
              color: 'rgba(255,255,255,0.9)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                terrain: 'Terrain eff.',
                beam: 'LOS (Ant→UE)',
                rawTerrain: 'Terrain brut',
                rxLine: `UE (${ant?.rxHeight ?? 1.5}m)`,
                clutter: 'Terrain+Clutter',
                fresnelUpper: 'Fresnel F1 sup',
                fresnelLower: 'Fresnel F1 inf',
              };
              return [`${value.toFixed(1)} m`, labels[name] || name];
            }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, opacity: 0.7 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                terrain: 'Terrain',
                beam: 'LOS (Ant→UE)',
                rawTerrain: 'Terrain brut',
                rxLine: `Hauteur UE`,
                clutter: 'Clutter',
                fresnelUpper: 'Fresnel F1',
                fresnelLower: 'Fresnel F1',
              };
              return labels[value] || value;
            }}
          />

          {/* Terrain fill */}
          <Area
            type="monotone"
            dataKey="terrain"
            stroke="rgba(56,189,248,0.7)"
            fill="url(#terrainGradGlass)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />

          {/* Raw terrain */}
          {showCurvature && (
            <Line
              type="monotone"
              dataKey="rawTerrain"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              opacity={0.6}
              isAnimationActive={false}
            />
          )}

          {/* UE / Rx height line */}
          <Line
            type="monotone"
            dataKey="rxLine"
            stroke="rgba(168,85,247,0.7)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={false}
          />

          {/* Clutter */}
          {clutterHeight > 0 && (
            <Line
              type="monotone"
              dataKey="clutter"
              stroke="rgba(251,146,60,0.7)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          )}

          {/* Fresnel zone */}
          {showFresnel && fresnel && (
            <>
              <Line
                type="monotone"
                dataKey="fresnelUpper"
                stroke="rgba(250,204,21,0.5)"
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="fresnelLower"
                stroke="rgba(250,204,21,0.5)"
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}

          {/* LOS line (Antenna → UE) */}
          <Line
            type="monotone"
            dataKey="beam"
            stroke="rgba(248,113,113,0.85)"
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            isAnimationActive={false}
          />

          {/* Obstruction marker */}
          {obstructionPoint && (
            <ReferenceDot
              x={obstructionPoint.distance}
              y={obstructionPoint.altitude}
              r={7}
              fill="rgba(239,68,68,0.9)"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={2}
            />
          )}

          {/* Antenna point marker */}
          {data.length > 0 && (
            <ReferenceDot
              x={data[0].distance}
              y={ant?.antennaAMSL ?? data[0].beam}
              r={5}
              fill="rgba(56,189,248,0.9)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            />
          )}

          {/* UE target point marker */}
          {data.length > 1 && (
            <ReferenceDot
              x={data[data.length - 1].distance}
              y={data[data.length - 1].rxLine ?? data[data.length - 1].terrain}
              r={5}
              fill="rgba(168,85,247,0.9)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfileChart;
