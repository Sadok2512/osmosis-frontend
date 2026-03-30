import React, { useCallback } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, Legend, Label as RLabel
} from 'recharts';
import { ProfilePoint, LOSAnalysis, FresnelAnalysis } from '@/utils/geodesicUtils';

export interface ProfileHoverData {
  distanceKm: number;
  elevationM: number;
  lat: number;
  lng: number;
}

interface RemoteAntennaParams {
  hba: number;
  totalTilt: number;
  vbw: number;
  azimuth: number;
}

interface Props {
  profilePoints: ProfilePoint[];
  analysis: LOSAnalysis;
  fresnel?: FresnelAnalysis | null;
  showFresnel?: boolean;
  showCurvature?: boolean;
  clutterHeight?: number;
  showTilt?: boolean;
  remoteAntenna?: RemoteAntennaParams | null;
  onHoverPoint?: (data: ProfileHoverData | null) => void;
}

const ProfileChart: React.FC<Props> = ({
  profilePoints, analysis, fresnel, showFresnel = false, showCurvature = true, clutterHeight = 0, showTilt = false,
  remoteAntenna, onHoverPoint,
}) => {
  const ant = analysis.antennaParams;
  const data = profilePoints.map((p, i) => {
    const entry: Record<string, number> = {
      distance: Math.round(p.distance) / 1000,
      terrain: Math.round(analysis.effectiveTerrain[i] * 10) / 10,
      beam: Math.round(analysis.beamAltitudes[i] * 10) / 10,
      rawTerrain: Math.round(p.elevation * 10) / 10,
      _idx: i,
    };
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
    if (showTilt && ant) {
      const antennaAMSL = ant.antennaAMSL;
      const tiltRad = ant.totalTilt * Math.PI / 180;
      const tiltAlt = antennaAMSL - p.distance * Math.tan(tiltRad);
      if (tiltAlt >= analysis.effectiveTerrain[i]) {
        entry.tiltBeam = Math.round(tiltAlt * 10) / 10;
      }
      if (ant.vbw > 0) {
        const upperRad = (ant.totalTilt - ant.vbw / 2) * Math.PI / 180;
        const lowerRad = (ant.totalTilt + ant.vbw / 2) * Math.PI / 180;
        const upperAlt = antennaAMSL - p.distance * Math.tan(upperRad);
        const lowerAlt = antennaAMSL - p.distance * Math.tan(lowerRad);
        if (upperAlt >= analysis.effectiveTerrain[i]) {
          entry.tiltConeUpper = Math.round(upperAlt * 10) / 10;
        }
        if (lowerAlt >= analysis.effectiveTerrain[i]) {
          entry.tiltConeLower = Math.round(lowerAlt * 10) / 10;
        }
      }
    }
    // Remote antenna beam (link mode) — computed from the far end
    if (remoteAntenna && profilePoints.length > 1) {
      const totalDist = profilePoints[profilePoints.length - 1].distance;
      const remoteGroundAlt = analysis.effectiveTerrain[profilePoints.length - 1];
      const remoteAMSL = remoteGroundAlt + remoteAntenna.hba;
      const distFromRemote = totalDist - p.distance;
      const remoteTiltRad = remoteAntenna.totalTilt * Math.PI / 180;
      const remoteBeamAlt = remoteAMSL - distFromRemote * Math.tan(remoteTiltRad);
      if (remoteBeamAlt >= analysis.effectiveTerrain[i]) {
        entry.remoteTiltBeam = Math.round(remoteBeamAlt * 10) / 10;
      }
      if (remoteAntenna.vbw > 0) {
        const rUpperRad = (remoteAntenna.totalTilt - remoteAntenna.vbw / 2) * Math.PI / 180;
        const rLowerRad = (remoteAntenna.totalTilt + remoteAntenna.vbw / 2) * Math.PI / 180;
        const rUpperAlt = remoteAMSL - distFromRemote * Math.tan(rUpperRad);
        const rLowerAlt = remoteAMSL - distFromRemote * Math.tan(rLowerRad);
        if (rUpperAlt >= analysis.effectiveTerrain[i]) {
          entry.remoteConeUpper = Math.round(rUpperAlt * 10) / 10;
        }
        if (rLowerAlt >= analysis.effectiveTerrain[i]) {
          entry.remoteConeLower = Math.round(rLowerAlt * 10) / 10;
        }
      }
    }
    return entry;
  });

  // Find ground impact point
  let groundImpact: { distance: number; altitude: number } | null = null;
  if (showTilt && ant && ant.totalTilt > 0) {
    const antennaAMSL = ant.antennaAMSL;
    const tiltRad = ant.totalTilt * Math.PI / 180;
    for (let i = 1; i < profilePoints.length; i++) {
      const tiltAlt = antennaAMSL - profilePoints[i].distance * Math.tan(tiltRad);
      if (tiltAlt <= analysis.effectiveTerrain[i]) {
        const prevTilt = antennaAMSL - profilePoints[i - 1].distance * Math.tan(tiltRad);
        const prevTerrain = analysis.effectiveTerrain[i - 1];
        const currTerrain = analysis.effectiveTerrain[i];
        const t = (prevTilt - prevTerrain) / ((prevTilt - prevTerrain) - (tiltAlt - currTerrain));
        const impactDist = profilePoints[i - 1].distance + t * (profilePoints[i].distance - profilePoints[i - 1].distance);
        const impactAlt = prevTerrain + t * (currTerrain - prevTerrain);
        groundImpact = {
          distance: Math.round(impactDist) / 1000,
          altitude: Math.round(impactAlt * 10) / 10,
        };
        break;
      }
    }
  }

  // Find remote antenna ground impact
  let remoteGroundImpact: { distance: number; altitude: number } | null = null;
  if (remoteAntenna && remoteAntenna.totalTilt > 0 && profilePoints.length > 1) {
    const totalDist = profilePoints[profilePoints.length - 1].distance;
    const remoteGroundAlt = analysis.effectiveTerrain[profilePoints.length - 1];
    const remoteAMSL = remoteGroundAlt + remoteAntenna.hba;
    const remoteTiltRad = remoteAntenna.totalTilt * Math.PI / 180;
    for (let i = profilePoints.length - 2; i >= 0; i--) {
      const distFromRemote = totalDist - profilePoints[i].distance;
      const remoteBeamAlt = remoteAMSL - distFromRemote * Math.tan(remoteTiltRad);
      if (remoteBeamAlt <= analysis.effectiveTerrain[i]) {
        const nextDistFromRemote = totalDist - profilePoints[i + 1].distance;
        const prevBeam = remoteAMSL - nextDistFromRemote * Math.tan(remoteTiltRad);
        const prevTerrain = analysis.effectiveTerrain[i + 1];
        const currTerrain = analysis.effectiveTerrain[i];
        const t = (prevBeam - prevTerrain) / ((prevBeam - prevTerrain) - (remoteBeamAlt - currTerrain));
        const impactDist = profilePoints[i + 1].distance + t * (profilePoints[i].distance - profilePoints[i + 1].distance);
        const impactAlt = prevTerrain + t * (currTerrain - prevTerrain);
        remoteGroundImpact = {
          distance: Math.round(impactDist) / 1000,
          altitude: Math.round(impactAlt * 10) / 10,
        };
        break;
      }
    }
  }

  const obstructionPoint = analysis.obstructionIndex !== null ? {
    distance: data[analysis.obstructionIndex]?.distance,
    altitude: data[analysis.obstructionIndex]?.terrain,
  } : null;

  const allValues = data.flatMap(d => {
    const vals = [d.terrain, d.rawTerrain];
    if (d.beam != null) vals.push(d.beam);
    if (d.rxLine != null) vals.push(d.rxLine);
    if (d.clutter != null) vals.push(d.clutter);
    if (d.fresnelUpper != null) vals.push(d.fresnelUpper);
    if (d.fresnelLower != null) vals.push(d.fresnelLower);
    if (d.tiltBeam != null) vals.push(d.tiltBeam);
    if (d.tiltConeUpper != null) vals.push(d.tiltConeUpper);
    if (d.tiltConeLower != null) vals.push(d.tiltConeLower);
    if (d.remoteTiltBeam != null) vals.push(d.remoteTiltBeam);
    if (d.remoteConeUpper != null) vals.push(d.remoteConeUpper);
    if (d.remoteConeLower != null) vals.push(d.remoteConeLower);
    return vals;
  });
  // Include antenna AMSL heights
  if (ant) allValues.push(ant.antennaAMSL);
  if (remoteAntenna && profilePoints.length > 1) {
    const remoteGroundAlt2 = analysis.effectiveTerrain[profilePoints.length - 1];
    allValues.push(remoteGroundAlt2 + remoteAntenna.hba);
  }
  const rawMax = Math.max(...allValues);
  const rawMin = Math.min(...allValues);
  const range = rawMax - rawMin || 50;
  const padding = Math.max(15, range * 0.12);
  const maxAlt = rawMax + padding;
  const minAlt = Math.max(0, rawMin - padding);

  const handleMouseMove = useCallback((state: any) => {
    if (!onHoverPoint || !state?.activeTooltipIndex) return;
    const idx = state.activeTooltipIndex;
    if (idx >= 0 && idx < profilePoints.length) {
      const p = profilePoints[idx];
      onHoverPoint({
        distanceKm: Math.round(p.distance) / 1000,
        elevationM: Math.round(p.elevation * 10) / 10,
        lat: p.lat,
        lng: p.lng,
      });
    }
  }, [onHoverPoint, profilePoints]);

  const handleMouseLeave = useCallback(() => {
    onHoverPoint?.(null);
  }, [onHoverPoint]);

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
          onMouseMove={onHoverPoint ? handleMouseMove : undefined}
          onMouseLeave={onHoverPoint ? handleMouseLeave : undefined}
        >
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
            domain={[Math.floor(minAlt), Math.ceil(maxAlt)]}
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
              if (name === '_idx') return [null, null];
              const labels: Record<string, string> = {
                terrain: 'Terrain eff.',
                beam: 'LOS (Ant→UE)',
                rawTerrain: 'Terrain brut',
                rxLine: `UE (${ant?.rxHeight ?? 1.5}m)`,
                clutter: 'Terrain+Clutter',
                fresnelUpper: 'Fresnel F1 sup',
                fresnelLower: 'Fresnel F1 inf',
                tiltBeam: `Tilt ${ant?.totalTilt ?? 0}°`,
                tiltConeUpper: 'Beam sup',
                tiltConeLower: 'Beam inf',
                remoteTiltBeam: `Remote Tilt ${remoteAntenna?.totalTilt ?? 0}°`,
                remoteConeUpper: 'Remote Beam sup',
                remoteConeLower: 'Remote Beam inf',
              };
              return [`${value.toFixed(1)} m`, labels[name] || name];
            }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, opacity: 0.7 }}
            formatter={(value: string) => {
              if (value === '_idx') return null;
              const labels: Record<string, string> = {
                terrain: 'Terrain',
                beam: 'LOS (Ant→UE)',
                rawTerrain: 'Terrain brut',
                rxLine: `Hauteur UE`,
                clutter: 'Clutter',
                fresnelUpper: 'Fresnel F1',
                fresnelLower: 'Fresnel F1',
                tiltBeam: `Tilt ${ant?.totalTilt ?? 0}°`,
                tiltConeUpper: 'Beam cone',
                tiltConeLower: 'Beam cone',
                remoteTiltBeam: `Remote Tilt`,
                remoteConeUpper: 'Remote Beam',
                remoteConeLower: 'Remote Beam',
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

          {/* Tilt beam line + cone */}
          {showTilt && ant && (
            <>
              {ant.vbw > 0 && (
                <Area
                  type="monotone"
                  dataKey="tiltConeUpper"
                  stroke="none"
                  fill="rgba(251,146,60,0.08)"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )}
              {ant.vbw > 0 && (
                <>
                  <Line
                    type="monotone"
                    dataKey="tiltConeUpper"
                    stroke="rgba(251,146,60,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="tiltConeLower"
                    stroke="rgba(251,146,60,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="tiltBeam"
                stroke="rgba(251,146,60,0.9)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </>
          )}

          {/* Remote antenna beam (link mode) */}
          {remoteAntenna && (
            <>
              {remoteAntenna.vbw > 0 && (
                <Area
                  type="monotone"
                  dataKey="remoteConeUpper"
                  stroke="none"
                  fill="rgba(34,197,94,0.08)"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )}
              {remoteAntenna.vbw > 0 && (
                <>
                  <Line
                    type="monotone"
                    dataKey="remoteConeUpper"
                    stroke="rgba(34,197,94,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="remoteConeLower"
                    stroke="rgba(34,197,94,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="remoteTiltBeam"
                stroke="rgba(34,197,94,0.9)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </>
          )}

          <Line
            type="monotone"
            dataKey="beam"
            stroke="rgba(248,113,113,0.85)"
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            isAnimationActive={false}
          />

          {/* Hidden _idx field to carry index */}
          <Line type="monotone" dataKey="_idx" stroke="none" dot={false} isAnimationActive={false} legendType="none" />

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

          {/* Antenna tower marker */}
          {data.length > 0 && ant && (
            <ReferenceDot
              x={data[0].distance}
              y={ant.antennaAMSL}
              r={7}
              fill="rgba(56,189,248,0.9)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            >
              <RLabel
                value={`📡 Az:${ant.azimuth}° T:${ant.totalTilt}° H:${ant.hba}m`}
                position="top"
                style={{ fontSize: 9, fill: 'rgba(56,189,248,0.9)', fontWeight: 700 }}
                offset={10}
              />
            </ReferenceDot>
          )}

          {/* Ground impact marker */}
          {showTilt && groundImpact && (
            <ReferenceDot
              x={groundImpact.distance}
              y={groundImpact.altitude}
              r={7}
              fill="rgba(239,68,68,0.95)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            >
              <RLabel
                value={`🎯 Impact ${groundImpact.distance.toFixed(2)} km`}
                position="top"
                style={{ fontSize: 9, fill: 'rgba(239,68,68,0.9)', fontWeight: 700 }}
                offset={10}
              />
            </ReferenceDot>
          )}

          {/* Remote antenna marker (link mode) */}
          {remoteAntenna && data.length > 1 && (
            <ReferenceDot
              x={data[data.length - 1].distance}
              y={(analysis.effectiveTerrain[profilePoints.length - 1] ?? 0) + remoteAntenna.hba}
              r={7}
              fill="rgba(34,197,94,0.9)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            >
              <RLabel
                value={`📡 T:${remoteAntenna.totalTilt}° H:${remoteAntenna.hba}m`}
                position="top"
                style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }}
                offset={10}
              />
            </ReferenceDot>
          )}

          {/* Remote ground impact marker */}
          {remoteAntenna && remoteGroundImpact && (
            <ReferenceDot
              x={remoteGroundImpact.distance}
              y={remoteGroundImpact.altitude}
              r={7}
              fill="rgba(34,197,94,0.95)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            >
              <RLabel
                value={`🎯 Remote ${remoteGroundImpact.distance.toFixed(2)} km`}
                position="top"
                style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }}
                offset={10}
              />
            </ReferenceDot>
          )}

          {/* UE target point marker (only when no remote antenna) */}
          {!remoteAntenna && data.length > 1 && (
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
