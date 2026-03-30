import React, { useCallback, useMemo } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, Legend, ReferenceArea, Label as RLabel
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

type LinkState = 'LOS_CLEAR' | 'LOS_FRESNEL_BLOCKED' | 'NLOS';

const clampNumber = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ProfileChart: React.FC<Props> = ({
  profilePoints, analysis, fresnel, showFresnel = false, showCurvature = true, clutterHeight = 0, showTilt = false,
  remoteAntenna, onHoverPoint,
}) => {
  const ant = analysis.antennaParams;

  const derived = useMemo(() => {
    if (!profilePoints.length) {
      return {
        data: [] as Record<string, any>[],
        yMin: 0,
        yMax: 100,
        groundImpact: null as null | { index: number; distance: number; altitude: number },
        remoteGroundImpact: null as null | { index: number; distance: number; altitude: number },
        firstFresnelBlockIndex: null as number | null,
        linkState: 'LOS_CLEAR' as LinkState,
        beamColor: 'rgba(34,197,94,0.95)',
        beamConeStroke: 'rgba(34,197,94,0.35)',
        beamConeFill: 'rgba(34,197,94,0.08)',
      };
    }

    const terrainRaw = profilePoints.map((p) => p.elevation);
    const terrainEffective = analysis.effectiveTerrain;
    const beamAltitudes = analysis.beamAltitudes;

    // ─── Y-AXIS SCALING: terrain + antenna ONLY ───
    const terrainMin = Math.min(...terrainEffective);
    const terrainMax = Math.max(...terrainEffective);

    const antennaAMSL = ant?.antennaAMSL ?? terrainMax;
    const rxAMSL =
      ant && ant.rxHeight > 0
        ? profilePoints[profilePoints.length - 1].elevation + ant.rxHeight
        : terrainEffective[terrainEffective.length - 1];

    let remoteAlt = terrainMax;
    if (remoteAntenna && profilePoints.length > 1) {
      const remoteGroundAlt = terrainEffective[profilePoints.length - 1];
      remoteAlt = remoteGroundAlt + remoteAntenna.hba;
    }

    const rfMin = Math.min(terrainMin, rxAMSL);
    const rfMax = Math.max(terrainMax, antennaAMSL, remoteAlt);

    const range = Math.max(20, rfMax - rfMin);
    const bottomPadding = Math.max(5, range * 0.08);
    const topPadding = Math.max(15, range * 0.28);

    const yMin = Math.max(0, Math.floor(rfMin - bottomPadding));
    const yMax = Math.ceil(rfMax + topPadding);

    // ─── GROUND IMPACT: local antenna ───
    let groundImpact: { index: number; distance: number; altitude: number } | null = null;
    if (showTilt && ant) {
      const tiltRad = (ant.totalTilt * Math.PI) / 180;
      for (let i = 1; i < profilePoints.length; i++) {
        const tiltAltPrev = antennaAMSL - profilePoints[i - 1].distance * Math.tan(tiltRad);
        const tiltAltCurr = antennaAMSL - profilePoints[i].distance * Math.tan(tiltRad);
        const terrPrev = terrainEffective[i - 1];
        const terrCurr = terrainEffective[i];
        const prevDiff = tiltAltPrev - terrPrev;
        const currDiff = tiltAltCurr - terrCurr;
        if (prevDiff >= 0 && currDiff <= 0) {
          const denom = prevDiff - currDiff || 1e-6;
          const t = prevDiff / denom;
          const impactDist = profilePoints[i - 1].distance + t * (profilePoints[i].distance - profilePoints[i - 1].distance);
          const impactAltitude = terrPrev + t * (terrCurr - terrPrev);
          groundImpact = { index: i, distance: Math.round(impactDist) / 1000, altitude: Math.round(impactAltitude * 10) / 10 };
          break;
        }
      }
    }

    // ─── GROUND IMPACT: remote antenna ───
    let remoteGroundImpact: { index: number; distance: number; altitude: number } | null = null;
    if (remoteAntenna && remoteAntenna.totalTilt > 0 && profilePoints.length > 1) {
      const totalDist = profilePoints[profilePoints.length - 1].distance;
      const remoteGroundAltVal = terrainEffective[profilePoints.length - 1];
      const remoteAMSL = remoteGroundAltVal + remoteAntenna.hba;
      const remoteTiltRad = (remoteAntenna.totalTilt * Math.PI) / 180;
      for (let i = profilePoints.length - 2; i >= 0; i--) {
        const distFromRemote = totalDist - profilePoints[i].distance;
        const remoteBeamAlt = remoteAMSL - distFromRemote * Math.tan(remoteTiltRad);
        if (remoteBeamAlt <= terrainEffective[i]) {
          const nextDistFromRemote = totalDist - profilePoints[i + 1].distance;
          const prevBeam = remoteAMSL - nextDistFromRemote * Math.tan(remoteTiltRad);
          const prevTerrain = terrainEffective[i + 1];
          const currTerrain = terrainEffective[i];
          const t = (prevBeam - prevTerrain) / ((prevBeam - prevTerrain) - (remoteBeamAlt - currTerrain));
          const impactDist = profilePoints[i + 1].distance + t * (profilePoints[i].distance - profilePoints[i + 1].distance);
          const impactAlt = prevTerrain + t * (currTerrain - prevTerrain);
          remoteGroundImpact = { index: i, distance: Math.round(impactDist) / 1000, altitude: Math.round(impactAlt * 10) / 10 };
          break;
        }
      }
    }

    // ─── FRESNEL BLOCK ───
    let firstFresnelBlockIndex: number | null = null;
    if (showFresnel && fresnel) {
      for (let i = 0; i < profilePoints.length; i++) {
        if (terrainEffective[i] > fresnel.fresnelLowerBound[i]) {
          firstFresnelBlockIndex = i;
          break;
        }
      }
    }

    // ─── LINK STATE ───
    const hasLOSObstruction = analysis.obstructionIndex !== null;
    const fresnelBlocked = firstFresnelBlockIndex !== null;
    const linkState: LinkState = hasLOSObstruction ? 'NLOS' : fresnelBlocked ? 'LOS_FRESNEL_BLOCKED' : 'LOS_CLEAR';

    const beamColor = linkState === 'LOS_CLEAR' ? 'rgba(34,197,94,0.95)' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'rgba(251,146,60,0.95)' : 'rgba(239,68,68,0.95)';
    const beamConeStroke = linkState === 'LOS_CLEAR' ? 'rgba(34,197,94,0.35)' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'rgba(251,146,60,0.35)' : 'rgba(239,68,68,0.35)';
    const beamConeFill = linkState === 'LOS_CLEAR' ? 'rgba(34,197,94,0.08)' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'rgba(251,146,60,0.08)' : 'rgba(239,68,68,0.08)';

    // ─── BUILD DATA ───
    const data = profilePoints.map((p, i) => {
      const entry: Record<string, any> = {
        distance: Math.round(p.distance) / 1000,
        terrain: Math.round(terrainEffective[i] * 10) / 10,
        rawTerrain: Math.round(terrainRaw[i] * 10) / 10,
        _idx: i,
        beam: null,
        tiltBeam: null,
        tiltConeUpper: null,
        tiltConeLower: null,
        fresnelUpper: null,
        fresnelLower: null,
        clutter: null,
        rxLine: null,
        remoteTiltBeam: null,
        remoteConeUpper: null,
        remoteConeLower: null,
      };

      if (ant && ant.rxHeight > 0) {
        entry.rxLine = Math.round((p.elevation + ant.rxHeight) * 10) / 10;
      }
      if (clutterHeight > 0) {
        entry.clutter = Math.round((terrainEffective[i] + clutterHeight) * 10) / 10;
      }
      if (showFresnel && fresnel) {
        entry.fresnelUpper = clampNumber(Math.round(fresnel.fresnelUpperBound[i] * 10) / 10, yMin, yMax);
        entry.fresnelLower = clampNumber(Math.round(fresnel.fresnelLowerBound[i] * 10) / 10, yMin, yMax);
      }

      // LOS line — clamped to chart domain
      entry.beam = clampNumber(Math.round(beamAltitudes[i] * 10) / 10, yMin, yMax);

      // Local tilt beam + cone — stop at ground impact
      if (showTilt && ant) {
        const tiltRad = (ant.totalTilt * Math.PI) / 180;
        const tiltAlt = antennaAMSL - p.distance * Math.tan(tiltRad);
        const visibleUntilGround = !groundImpact || i <= groundImpact.index;

        if (visibleUntilGround && tiltAlt >= terrainEffective[i]) {
          entry.tiltBeam = clampNumber(Math.round(tiltAlt * 10) / 10, yMin, yMax);
        }

        if (ant.vbw > 0 && visibleUntilGround) {
          const upperRad = ((ant.totalTilt - ant.vbw / 2) * Math.PI) / 180;
          const lowerRad = ((ant.totalTilt + ant.vbw / 2) * Math.PI) / 180;
          const upperAlt = antennaAMSL - p.distance * Math.tan(upperRad);
          const lowerAlt = antennaAMSL - p.distance * Math.tan(lowerRad);
          if (upperAlt >= terrainEffective[i]) {
            entry.tiltConeUpper = clampNumber(Math.round(upperAlt * 10) / 10, yMin, yMax);
          }
          if (lowerAlt >= terrainEffective[i]) {
            entry.tiltConeLower = clampNumber(Math.round(lowerAlt * 10) / 10, yMin, yMax);
          }
        }
      }

      // Remote antenna beam (link mode) — stop at remote ground impact
      if (remoteAntenna && profilePoints.length > 1) {
        const totalDist = profilePoints[profilePoints.length - 1].distance;
        const remoteGroundAltVal = terrainEffective[profilePoints.length - 1];
        const remoteAMSL = remoteGroundAltVal + remoteAntenna.hba;
        const distFromRemote = totalDist - p.distance;
        const remoteTiltRad = (remoteAntenna.totalTilt * Math.PI) / 180;
        const remoteBeamAlt = remoteAMSL - distFromRemote * Math.tan(remoteTiltRad);
        const remoteVisible = !remoteGroundImpact || i >= remoteGroundImpact.index;

        if (remoteVisible && remoteBeamAlt >= terrainEffective[i]) {
          entry.remoteTiltBeam = clampNumber(Math.round(remoteBeamAlt * 10) / 10, yMin, yMax);
        }
        if (remoteAntenna.vbw > 0 && remoteVisible) {
          const rUpperRad = ((remoteAntenna.totalTilt - remoteAntenna.vbw / 2) * Math.PI) / 180;
          const rLowerRad = ((remoteAntenna.totalTilt + remoteAntenna.vbw / 2) * Math.PI) / 180;
          const rUpperAlt = remoteAMSL - distFromRemote * Math.tan(rUpperRad);
          const rLowerAlt = remoteAMSL - distFromRemote * Math.tan(rLowerRad);
          if (rUpperAlt >= terrainEffective[i]) {
            entry.remoteConeUpper = clampNumber(Math.round(rUpperAlt * 10) / 10, yMin, yMax);
          }
          if (rLowerAlt >= terrainEffective[i]) {
            entry.remoteConeLower = clampNumber(Math.round(rLowerAlt * 10) / 10, yMin, yMax);
          }
        }
      }

      return entry;
    });

    return { data, yMin, yMax, groundImpact, remoteGroundImpact, firstFresnelBlockIndex, linkState, beamColor, beamConeFill, beamConeStroke };
  }, [profilePoints, analysis, fresnel, showFresnel, clutterHeight, showTilt, ant, remoteAntenna]);

  const { data, yMin, yMax, groundImpact, remoteGroundImpact, firstFresnelBlockIndex, linkState, beamColor, beamConeFill, beamConeStroke } = derived;

  const obstructionPoint = analysis.obstructionIndex !== null ? {
    distance: data[analysis.obstructionIndex]?.distance,
    altitude: data[analysis.obstructionIndex]?.terrain,
  } : null;

  const handleMouseMove = useCallback((state: any) => {
    if (!onHoverPoint || state?.activeTooltipIndex == null) return;
    const idx = state.activeTooltipIndex;
    if (idx >= 0 && idx < profilePoints.length) {
      const p = profilePoints[idx];
      onHoverPoint({ distanceKm: Math.round(p.distance) / 1000, elevationM: Math.round(p.elevation * 10) / 10, lat: p.lat, lng: p.lng });
    }
  }, [onHoverPoint, profilePoints]);

  const handleMouseLeave = useCallback(() => { onHoverPoint?.(null); }, [onHoverPoint]);

  const statusText = linkState === 'LOS_CLEAR' ? 'LOS OK' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'LOS / Fresnel Blocked' : 'NLOS';
  const statusColor = linkState === 'LOS_CLEAR' ? 'rgba(34,197,94,0.95)' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'rgba(251,146,60,0.95)' : 'rgba(239,68,68,0.95)';

  return (
    <div className="w-full h-full relative">
      {/* Status badge */}
      <div className="absolute top-2 right-4 z-10 px-3 py-1 rounded-full text-[10px] font-bold tracking-wide" style={{ background: 'rgba(15,23,42,0.7)', border: `1px solid ${statusColor}`, color: statusColor, backdropFilter: 'blur(8px)' }}>
        {statusText}
      </div>

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

          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.08)" vertical={false} />

          <XAxis
            dataKey="distance"
            tickFormatter={(v) => `${Number(v).toFixed(1)}`}
            label={{ value: 'Distance (km)', position: 'insideBottomRight', offset: -2, style: { fontSize: 10, fill: 'rgba(255,255,255,0.55)', fontWeight: 600 } }}
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
            stroke="rgba(255,255,255,0.1)"
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />

          <YAxis
            domain={[yMin, yMax]}
            label={{ value: 'Alt (m)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontWeight: 600 } }}
            tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
            stroke="rgba(255,255,255,0.1)"
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />

          <Tooltip
            contentStyle={{
              background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
              fontSize: 11, color: 'rgba(255,255,255,0.9)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            formatter={(value: number, name: string) => {
              if (name === '_idx') return [null, null];
              const labels: Record<string, string> = {
                terrain: 'Terrain eff.', beam: 'LOS (TX→RX)', rawTerrain: 'Terrain brut',
                rxLine: `RX (${ant?.rxHeight ?? 1.5}m)`, clutter: 'Terrain+Clutter',
                fresnelUpper: 'Fresnel F1 sup', fresnelLower: 'Fresnel F1 inf',
                tiltBeam: `Centre beam ${ant?.totalTilt ?? 0}°`, tiltConeUpper: 'Beam sup', tiltConeLower: 'Beam inf',
                remoteTiltBeam: `Remote Tilt ${remoteAntenna?.totalTilt ?? 0}°`, remoteConeUpper: 'Remote Beam sup', remoteConeLower: 'Remote Beam inf',
              };
              return [`${Number(value).toFixed(1)} m`, labels[name] || name];
            }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
          />

          <Legend
            wrapperStyle={{ fontSize: 10, opacity: 0.7 }}
            formatter={(value: string) => {
              if (value === '_idx') return null;
              const labels: Record<string, string> = {
                terrain: 'Terrain', beam: 'LOS', rawTerrain: 'Terrain brut', rxLine: 'Hauteur RX',
                clutter: 'Clutter', fresnelUpper: 'Fresnel F1', fresnelLower: 'Fresnel F1',
                tiltBeam: 'Centre beam', tiltConeUpper: 'Beam cone', tiltConeLower: 'Beam cone',
                remoteTiltBeam: 'Remote Tilt', remoteConeUpper: 'Remote Beam', remoteConeLower: 'Remote Beam',
              };
              return labels[value] || value;
            }}
          />

          {/* Fresnel zone fill between upper and lower */}
          {showFresnel && fresnel && (
            <Area type="monotone" dataKey="fresnelUpper" stroke="none" fill="url(#fresnelGradGlass)" dot={false} isAnimationActive={false} />
          )}

          {/* Terrain fill */}
          <Area type="monotone" dataKey="terrain" stroke="rgba(56,189,248,0.7)" fill="url(#terrainGradGlass)" strokeWidth={1.5} dot={false} isAnimationActive={false} />

          {/* Raw terrain */}
          {showCurvature && (
            <Line type="monotone" dataKey="rawTerrain" stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" dot={false} opacity={0.6} isAnimationActive={false} />
          )}

          {/* RX line */}
          <Line type="monotone" dataKey="rxLine" stroke="rgba(168,85,247,0.7)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />

          {/* Clutter */}
          {clutterHeight > 0 && (
            <Line type="monotone" dataKey="clutter" stroke="rgba(251,146,60,0.7)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          )}

          {/* Fresnel boundaries */}
          {showFresnel && fresnel && (
            <>
              <Line type="monotone" dataKey="fresnelUpper" stroke="rgba(250,204,21,0.5)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="fresnelLower" stroke="rgba(250,204,21,0.5)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
            </>
          )}

          {/* Beam cone fill + lines */}
          {showTilt && ant && ant.vbw > 0 && (
            <>
              <Area type="monotone" dataKey="tiltConeUpper" stroke="none" fill={beamConeFill} dot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="tiltConeUpper" stroke={beamConeStroke} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="tiltConeLower" stroke={beamConeStroke} strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
            </>
          )}

          {/* Centre beam (tilt) */}
          {showTilt && (
            <Line type="monotone" dataKey="tiltBeam" stroke={beamColor} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
          )}

          {/* Remote antenna beam (link mode) */}
          {remoteAntenna && (
            <>
              {remoteAntenna.vbw > 0 && (
                <Area type="monotone" dataKey="remoteConeUpper" stroke="none" fill="rgba(34,197,94,0.08)" dot={false} isAnimationActive={false} connectNulls={false} />
              )}
              {remoteAntenna.vbw > 0 && (
                <>
                  <Line type="monotone" dataKey="remoteConeUpper" stroke="rgba(34,197,94,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
                  <Line type="monotone" dataKey="remoteConeLower" stroke="rgba(34,197,94,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
                </>
              )}
              <Line type="monotone" dataKey="remoteTiltBeam" stroke="rgba(34,197,94,0.9)" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
            </>
          )}

          {/* LOS line */}
          <Line type="monotone" dataKey="beam" stroke={beamColor} strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} />

          {/* Hidden _idx */}
          <Line type="monotone" dataKey="_idx" stroke="none" dot={false} isAnimationActive={false} legendType="none" />

          {/* LOS obstruction */}
          {obstructionPoint && (
            <ReferenceDot x={obstructionPoint.distance} y={obstructionPoint.altitude} r={7} fill="rgba(239,68,68,0.9)" stroke="rgba(255,255,255,0.6)" strokeWidth={2}>
              <RLabel value="⛔ NLOS" position="top" style={{ fontSize: 9, fill: 'rgba(239,68,68,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Fresnel obstruction (only if LOS is clear) */}
          {!obstructionPoint && firstFresnelBlockIndex !== null && (
            <ReferenceDot x={data[firstFresnelBlockIndex]?.distance} y={data[firstFresnelBlockIndex]?.terrain} r={6} fill="rgba(251,146,60,0.9)" stroke="rgba(255,255,255,0.6)" strokeWidth={2}>
              <RLabel value="⚠ Fresnel" position="top" style={{ fontSize: 9, fill: 'rgba(251,146,60,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* TX antenna marker */}
          {data.length > 0 && ant && (
            <ReferenceDot x={data[0].distance} y={ant.antennaAMSL} r={7} fill="rgba(56,189,248,0.9)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`📡 Az:${ant.azimuth}° T:${ant.totalTilt}° H:${ant.hba}m`} position="top" style={{ fontSize: 9, fill: 'rgba(56,189,248,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Ground impact marker */}
          {showTilt && groundImpact && (
            <ReferenceDot x={groundImpact.distance} y={groundImpact.altitude} r={7} fill="rgba(239,68,68,0.95)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`🎯 Impact ${groundImpact.distance.toFixed(2)} km`} position="top" style={{ fontSize: 9, fill: 'rgba(239,68,68,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Remote antenna marker (link mode) */}
          {remoteAntenna && data.length > 1 && (
            <ReferenceDot x={data[data.length - 1].distance} y={(analysis.effectiveTerrain[profilePoints.length - 1] ?? 0) + remoteAntenna.hba} r={7} fill="rgba(34,197,94,0.9)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`📡 T:${remoteAntenna.totalTilt}° H:${remoteAntenna.hba}m`} position="top" style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Remote ground impact */}
          {remoteAntenna && remoteGroundImpact && (
            <ReferenceDot x={remoteGroundImpact.distance} y={remoteGroundImpact.altitude} r={7} fill="rgba(34,197,94,0.95)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`🎯 Remote ${remoteGroundImpact.distance.toFixed(2)} km`} position="top" style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* RX target (non-link mode) */}
          {!remoteAntenna && data.length > 1 && ant && (
            <ReferenceDot x={data[data.length - 1].distance} y={data[data.length - 1].rxLine ?? data[data.length - 1].terrain} r={5} fill="rgba(168,85,247,0.9)" stroke="rgba(255,255,255,0.8)" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfileChart;
