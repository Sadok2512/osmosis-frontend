import React, { useCallback, useMemo, useState } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Legend, Label as RLabel,
  Customized,
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
  siteName?: string;
  onHoverPoint?: (data: ProfileHoverData | null) => void;
}

type LinkState = 'LOS_CLEAR' | 'LOS_FRESNEL_BLOCKED' | 'NLOS';

const clampNumber = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/* ── SVG antenna tower icon drawn at pixel coords ── */
const AntennaTowerSVG: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <g>
    {/* Mast */}
    <line x1={cx} y1={cy} x2={cx} y2={cy - 28} stroke="rgba(56,189,248,0.9)" strokeWidth={2} />
    {/* Cross bars */}
    <line x1={cx - 5} y1={cy - 10} x2={cx + 5} y2={cy - 10} stroke="rgba(56,189,248,0.7)" strokeWidth={1.5} />
    <line x1={cx - 3} y1={cy - 18} x2={cx + 3} y2={cy - 18} stroke="rgba(56,189,248,0.7)" strokeWidth={1.5} />
    {/* Base legs */}
    <line x1={cx} y1={cy} x2={cx - 6} y2={cy + 4} stroke="rgba(56,189,248,0.7)" strokeWidth={1.5} />
    <line x1={cx} y1={cy} x2={cx + 6} y2={cy + 4} stroke="rgba(56,189,248,0.7)" strokeWidth={1.5} />
    {/* Signal waves */}
    <path d={`M${cx + 4},${cy - 26} Q${cx + 8},${cy - 30} ${cx + 4},${cy - 34}`} fill="none" stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
    <path d={`M${cx + 7},${cy - 24} Q${cx + 12},${cy - 30} ${cx + 7},${cy - 36}`} fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth={1} />
    {/* Antenna tip dot */}
    <circle cx={cx} cy={cy - 28} r={2.5} fill="rgba(56,189,248,0.9)" stroke="white" strokeWidth={1} />
  </g>
);

const ProfileChart: React.FC<Props> = ({
  profilePoints, analysis, fresnel, showFresnel = false, showCurvature = true, clutterHeight = 0, showTilt = false,
  remoteAntenna, siteName, onHoverPoint,
}) => {
  const ant = analysis.antennaParams;
  const [hoverTx, setHoverTx] = useState(false);
  const [hoverRx, setHoverRx] = useState(false);
  const derived = useMemo(() => {
    if (!profilePoints.length) {
      return {
        data: [] as Record<string, any>[],
        yMin: 0, yMax: 100,
        groundImpact: null as null | { index: number; distance: number; altitude: number },
        remoteGroundImpact: null as null | { index: number; distance: number; altitude: number },
        firstFresnelBlockIndex: null as number | null,
        linkState: 'LOS_CLEAR' as LinkState,
      };
    }

    const terrainRaw = profilePoints.map((p) => p.elevation);
    const terrainEffective = analysis.effectiveTerrain;
    const beamAltitudes = analysis.beamAltitudes;

    // ─── Y-AXIS SCALING: terrain + antenna ONLY ───
    const terrainMin = Math.min(...terrainEffective);
    const terrainMax = Math.max(...terrainEffective);
    const antennaAMSL = ant?.antennaAMSL ?? terrainMax;
    const rxAMSL = ant && ant.rxHeight > 0
      ? profilePoints[profilePoints.length - 1].elevation + ant.rxHeight
      : terrainEffective[terrainEffective.length - 1];

    let remoteAlt = terrainMax;
    if (remoteAntenna && profilePoints.length > 1) {
      remoteAlt = terrainEffective[profilePoints.length - 1] + remoteAntenna.hba;
    }

    const rfMin = Math.min(terrainMin, rxAMSL);
    const rfMax = Math.max(terrainMax, antennaAMSL, remoteAlt);
    const range = Math.max(20, rfMax - rfMin);
    const yMin = Math.max(0, Math.floor(rfMin - Math.max(5, range * 0.08)));
    const yMax = Math.ceil(rfMax + Math.max(15, range * 0.28));

    // ─── GROUND IMPACT: local ───
    let groundImpact: { index: number; distance: number; altitude: number } | null = null;
    if (showTilt && ant) {
      const tiltRad = (ant.totalTilt * Math.PI) / 180;
      for (let i = 1; i < profilePoints.length; i++) {
        const prevDiff = (antennaAMSL - profilePoints[i - 1].distance * Math.tan(tiltRad)) - terrainEffective[i - 1];
        const currDiff = (antennaAMSL - profilePoints[i].distance * Math.tan(tiltRad)) - terrainEffective[i];
        if (prevDiff >= 0 && currDiff <= 0) {
          const denom = prevDiff - currDiff || 1e-6;
          const t = prevDiff / denom;
          const d = profilePoints[i - 1].distance + t * (profilePoints[i].distance - profilePoints[i - 1].distance);
          const a = terrainEffective[i - 1] + t * (terrainEffective[i] - terrainEffective[i - 1]);
          groundImpact = { index: i, distance: Math.round(d) / 1000, altitude: Math.round(a * 10) / 10 };
          break;
        }
      }
    }

    // ─── GROUND IMPACT: remote ───
    let remoteGroundImpact: { index: number; distance: number; altitude: number } | null = null;
    if (remoteAntenna && remoteAntenna.totalTilt > 0 && profilePoints.length > 1) {
      const totalDist = profilePoints[profilePoints.length - 1].distance;
      const remoteAMSL = terrainEffective[profilePoints.length - 1] + remoteAntenna.hba;
      const remoteTiltRad = (remoteAntenna.totalTilt * Math.PI) / 180;
      for (let i = profilePoints.length - 2; i >= 0; i--) {
        const d = totalDist - profilePoints[i].distance;
        const beam = remoteAMSL - d * Math.tan(remoteTiltRad);
        if (beam <= terrainEffective[i]) {
          const nd = totalDist - profilePoints[i + 1].distance;
          const pb = remoteAMSL - nd * Math.tan(remoteTiltRad);
          const pt = terrainEffective[i + 1];
          const ct = terrainEffective[i];
          const t = (pb - pt) / ((pb - pt) - (beam - ct));
          const impDist = profilePoints[i + 1].distance + t * (profilePoints[i].distance - profilePoints[i + 1].distance);
          const impAlt = pt + t * (ct - pt);
          remoteGroundImpact = { index: i, distance: Math.round(impDist) / 1000, altitude: Math.round(impAlt * 10) / 10 };
          break;
        }
      }
    }

    // ─── FRESNEL ─── (always compute for status, even if not visually shown)
    let firstFresnelBlockIndex: number | null = null;
    if (fresnel) {
      for (let i = 0; i < profilePoints.length; i++) {
        if (terrainEffective[i] > fresnel.fresnelLowerBound[i]) { firstFresnelBlockIndex = i; break; }
      }
    }

    // ─── LINK STATE ───
    const hasLOS = analysis.obstructionIndex !== null;
    const fresnelBlocked = firstFresnelBlockIndex !== null;
    const linkState: LinkState = hasLOS ? 'NLOS' : fresnelBlocked ? 'LOS_FRESNEL_BLOCKED' : 'LOS_CLEAR';

    // ─── BUILD DATA ───
    const data = profilePoints.map((p, i) => {
      const entry: Record<string, any> = {
        distance: Math.round(p.distance) / 1000,
        terrain: Math.round(terrainEffective[i] * 10) / 10,
        rawTerrain: Math.round(terrainRaw[i] * 10) / 10,
        _idx: i,
        beam: null, tiltBeam: null, tiltConeUpper: null, tiltConeLower: null,
        fresnelUpper: null, fresnelLower: null, clutter: null, rxLine: null,
        remoteTiltBeam: null, remoteConeUpper: null, remoteConeLower: null,
        antennaMast: null,
      };

      if (i === 0 && ant) {
        entry.antennaMast = clampNumber(antennaAMSL, yMin, yMax);
      }

      if (ant && ant.rxHeight > 0) entry.rxLine = Math.round((p.elevation + ant.rxHeight) * 10) / 10;
      if (clutterHeight > 0) entry.clutter = Math.round((terrainEffective[i] + clutterHeight) * 10) / 10;

      if (showFresnel && fresnel) {
        entry.fresnelUpper = clampNumber(Math.round(fresnel.fresnelUpperBound[i] * 10) / 10, yMin, yMax);
        entry.fresnelLower = clampNumber(Math.round(fresnel.fresnelLowerBound[i] * 10) / 10, yMin, yMax);
      }

      // LOS line (orange dashed like photo)
      entry.beam = clampNumber(Math.round(beamAltitudes[i] * 10) / 10, yMin, yMax);

      // Local tilt beam + cone
      if (showTilt && ant) {
        const tiltRad = (ant.totalTilt * Math.PI) / 180;
        const tiltAlt = antennaAMSL - p.distance * Math.tan(tiltRad);
        const vis = !groundImpact || i <= groundImpact.index;
        if (vis && tiltAlt >= terrainEffective[i]) {
          entry.tiltBeam = clampNumber(Math.round(tiltAlt * 10) / 10, yMin, yMax);
        }
        if (ant.vbw > 0 && vis) {
          const uRad = ((ant.totalTilt - ant.vbw / 2) * Math.PI) / 180;
          const lRad = ((ant.totalTilt + ant.vbw / 2) * Math.PI) / 180;
          const uAlt = antennaAMSL - p.distance * Math.tan(uRad);
          const lAlt = antennaAMSL - p.distance * Math.tan(lRad);
          if (uAlt >= terrainEffective[i]) entry.tiltConeUpper = clampNumber(Math.round(uAlt * 10) / 10, yMin, yMax);
          if (lAlt >= terrainEffective[i]) entry.tiltConeLower = clampNumber(Math.round(lAlt * 10) / 10, yMin, yMax);
        }
      }

      // Remote beam (link mode)
      if (remoteAntenna && profilePoints.length > 1) {
        const totalDist = profilePoints[profilePoints.length - 1].distance;
        const remoteAMSL = terrainEffective[profilePoints.length - 1] + remoteAntenna.hba;
        const dFR = totalDist - p.distance;
        const rTiltRad = (remoteAntenna.totalTilt * Math.PI) / 180;
        const rBeam = remoteAMSL - dFR * Math.tan(rTiltRad);
        const rVis = !remoteGroundImpact || i >= remoteGroundImpact.index;
        if (rVis && rBeam >= terrainEffective[i]) {
          entry.remoteTiltBeam = clampNumber(Math.round(rBeam * 10) / 10, yMin, yMax);
        }
        if (remoteAntenna.vbw > 0 && rVis) {
          const ruRad = ((remoteAntenna.totalTilt - remoteAntenna.vbw / 2) * Math.PI) / 180;
          const rlRad = ((remoteAntenna.totalTilt + remoteAntenna.vbw / 2) * Math.PI) / 180;
          const ruAlt = remoteAMSL - dFR * Math.tan(ruRad);
          const rlAlt = remoteAMSL - dFR * Math.tan(rlRad);
          if (ruAlt >= terrainEffective[i]) entry.remoteConeUpper = clampNumber(Math.round(ruAlt * 10) / 10, yMin, yMax);
          if (rlAlt >= terrainEffective[i]) entry.remoteConeLower = clampNumber(Math.round(rlAlt * 10) / 10, yMin, yMax);
        }
      }

      return entry;
    });

    return { data, yMin, yMax, groundImpact, remoteGroundImpact, firstFresnelBlockIndex, linkState };
  }, [profilePoints, analysis, fresnel, showFresnel, clutterHeight, showTilt, ant, remoteAntenna]);

  const { data, yMin, yMax, groundImpact, remoteGroundImpact, firstFresnelBlockIndex, linkState } = derived;

  // Colors matching the reference photo
  const losLineColor = 'rgba(249,115,22,0.9)'; // orange dashed LOS
  const beamConeBlue = 'rgba(56,130,220,0.12)';
  const beamConeStroke = 'rgba(180,220,80,0.5)'; // green-yellow cone lines like photo
  const beamCenterStroke = 'rgba(180,220,80,0.7)'; // green-yellow center beam

  const statusText = linkState === 'LOS_CLEAR' ? 'LOS OK' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'LOS / Fresnel Blocked' : 'NLOS';
  const statusColor = linkState === 'LOS_CLEAR' ? 'rgba(34,197,94,0.95)' : linkState === 'LOS_FRESNEL_BLOCKED' ? 'rgba(56,189,248,0.95)' : 'rgba(239,68,68,0.95)';

  const obstructionPoint = analysis.obstructionIndex !== null ? {
    distance: data[analysis.obstructionIndex]?.distance,
    altitude: data[analysis.obstructionIndex]?.terrain,
  } : null;

  const fresnelBlockPoint = firstFresnelBlockIndex !== null && data[firstFresnelBlockIndex] ? {
    distance: data[firstFresnelBlockIndex].distance,
    altitude: data[firstFresnelBlockIndex].terrain,
  } : null;

  const rxTerrainAlt = data.length > 1 ? data[data.length - 1].terrain : 0;
  const rxAlt = data.length > 1 ? (data[data.length - 1].rxLine ?? rxTerrainAlt) : 0;

  const handleMouseMove = useCallback((state: any) => {
    if (!onHoverPoint || state?.activeTooltipIndex == null) return;
    const idx = state.activeTooltipIndex;
    if (idx >= 0 && idx < profilePoints.length) {
      const p = profilePoints[idx];
      onHoverPoint({ distanceKm: Math.round(p.distance) / 1000, elevationM: Math.round(p.elevation * 10) / 10, lat: p.lat, lng: p.lng });
    }
  }, [onHoverPoint, profilePoints]);

  const handleMouseLeave = useCallback(() => { onHoverPoint?.(null); }, [onHoverPoint]);

  return (
    <div className="w-full h-full relative">
      {/* Status badge removed per user request */}

      {/* TX hover zone — invisible area near left edge */}
      {ant && data.length > 0 && ant.antennaAMSL > 0 && (
        <div
          className="absolute top-0 left-0 z-10 w-16 h-full"
          onMouseEnter={() => setHoverTx(true)}
          onMouseLeave={() => setHoverTx(false)}
        />
      )}

      {/* TX Site info panel — appears on antenna hover */}
      {hoverTx && ant && data.length > 0 && (
        <div className="absolute top-10 left-16 z-20 px-3.5 py-2.5 rounded-lg pointer-events-none animate-in fade-in zoom-in-95 duration-200"
          style={{
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(56,189,248,0.3)',
            backdropFilter: 'blur(12px)',
            color: 'rgba(255,255,255,0.9)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}>
          <div className="text-[12px] font-bold text-white mb-1.5">
            Site: <span className="text-sky-400">{siteName || 'TX'}</span>
          </div>
          <div className="text-[11px] leading-5">
            <div>HBA: <span className="font-bold">{ant.hba}m</span></div>
            <div>Tilt: <span className="font-bold">{ant.totalTilt}°</span></div>
            <div>Azimuth: <span className="font-bold">{ant.azimuth}°</span></div>
          </div>
        </div>
      )}

      {/* RX hover zone — invisible area near right edge */}
      {data.length > 1 && ant && (
        <div
          className="absolute top-0 right-0 z-10 w-16 h-full"
          onMouseEnter={() => setHoverRx(true)}
          onMouseLeave={() => setHoverRx(false)}
        />
      )}

      {/* RX Site info panel — appears on RX hover */}
      {hoverRx && data.length > 1 && ant && (
        <div className="absolute top-10 right-16 z-20 px-3 py-2 rounded-lg pointer-events-none animate-in fade-in zoom-in-95 duration-200"
          style={{
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(12px)',
            color: 'rgba(255,255,255,0.9)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}>
          <div className="text-[11px] font-bold text-white mb-0.5">
            Site: <span className="text-emerald-400">RX</span>
          </div>
          <div className="text-[10px]">
            H: <span className="font-bold">{ant.rxHeight ?? 1.5} m</span>
          </div>
        </div>
      )}

      {/* Fresnel blocked tooltip badge (like photo - dark badge with ⚠) */}
      {!obstructionPoint && fresnelBlockPoint && (
        <div className="absolute z-10 pointer-events-none animate-in fade-in zoom-in-95 duration-300"
          style={{
            left: '55%',
            top: '45%',
            transform: 'translate(-50%, -50%)',
          }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{
              background: 'rgba(15,23,42,0.85)',
              border: '1px solid rgba(251,146,60,0.5)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(251,146,60,0.15)',
            }}>
            <span className="text-amber-400 text-sm">⚠</span>
            <span className="text-amber-400 text-[11px] font-bold">Fresnel blocked</span>
          </div>
        </div>
      )}

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
            <linearGradient id="beamConeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(56,130,220,0.22)" />
              <stop offset="100%" stopColor="rgba(56,130,220,0.03)" />
            </linearGradient>
            <linearGradient id="fresnelGradGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(250,204,21,0.45)" />
              <stop offset="50%" stopColor="rgba(250,180,21,0.25)" />
              <stop offset="100%" stopColor="rgba(250,204,21,0.08)" />
            </linearGradient>
            {/* Orange glow radial gradient for Fresnel obstruction */}
            <radialGradient id="fresnelGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(249,115,22,0.5)" />
              <stop offset="50%" stopColor="rgba(249,115,22,0.2)" />
              <stop offset="100%" stopColor="rgba(249,115,22,0)" />
            </radialGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />

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
              if (name === '_idx' || name === 'antennaMast') return [null, null];
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
              if (value === '_idx' || value === 'antennaMast') return null;
              const labels: Record<string, string> = {
                terrain: 'Terrain', beam: 'LOS', rawTerrain: 'Terrain brut', rxLine: 'Hauteur RX',
                clutter: 'Clutter', fresnelUpper: 'Fresnel F1', fresnelLower: 'Fresnel F1',
                tiltBeam: 'Centre beam', tiltConeUpper: 'Beam cone', tiltConeLower: 'Beam cone',
                remoteTiltBeam: 'Remote Tilt', remoteConeUpper: 'Remote Beam', remoteConeLower: 'Remote Beam',
              };
              return labels[value] || value;
            }}
          />

          {/* Fresnel zone fill */}
          {showFresnel && fresnel && (
            <Area type="monotone" dataKey="fresnelUpper" stroke="none" fill="url(#fresnelGradGlass)" dot={false} isAnimationActive={false} />
          )}

          {/* Terrain fill */}
          <Area type="monotone" dataKey="terrain" stroke="rgba(255,255,255,0.85)" fill="url(#terrainGradGlass)" strokeWidth={1.5} dot={false} isAnimationActive={false} />

          {/* Raw terrain */}
          {showCurvature && (
            <Line type="monotone" dataKey="rawTerrain" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
          )}

          {/* RX line */}
          <Line type="monotone" dataKey="rxLine" stroke="rgba(168,85,247,0.7)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />

          {/* Clutter */}
          {clutterHeight > 0 && (
            <Line type="monotone" dataKey="clutter" stroke="rgba(251,146,60,0.7)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          )}

          {/* Fresnel boundaries - yellow dashed */}
          {showFresnel && fresnel && (
            <>
              <Line type="monotone" dataKey="fresnelUpper" stroke="rgba(250,204,21,0.5)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="fresnelLower" stroke="rgba(250,204,21,0.5)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
            </>
          )}

          {/* Beam cone fill — BLUE semi-transparent (Atoll photo style) */}
          {showTilt && ant && ant.vbw > 0 && (
            <>
              <Area type="monotone" dataKey="tiltConeUpper" stroke="none" fill="url(#beamConeGrad)" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="tiltConeUpper" stroke={beamConeStroke} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="tiltConeLower" stroke={beamConeStroke} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
            </>
          )}

          {/* Centre beam — green-yellow (like photo) */}
          {showTilt && (
            <Line type="monotone" dataKey="tiltBeam" stroke={beamCenterStroke} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          )}

          {/* Remote beam (link mode) */}
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

          {/* LOS line — ORANGE dashed (matching photo exactly) */}
          <Line type="monotone" dataKey="beam" stroke={losLineColor} strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} />

          {/* Hidden fields */}
          <Line type="monotone" dataKey="_idx" stroke="none" dot={false} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="antennaMast" stroke="none" dot={false} isAnimationActive={false} legendType="none" />

          {/* Antenna mast vertical line (terrain → antenna AMSL) — dashed gray like photo */}
          {data.length > 0 && ant && (
            <ReferenceLine
              segment={[
                { x: data[0].distance, y: data[0].terrain },
                { x: data[0].distance, y: ant.antennaAMSL },
              ]}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {/* TX antenna tower icon */}
          {data.length > 0 && ant && (
            <ReferenceDot x={data[0].distance} y={ant.antennaAMSL} r={0} fill="none" stroke="none">
              <Customized component={(props: any) => {
                const { viewBox } = props;
                if (!viewBox) return null;
                return <AntennaTowerSVG cx={viewBox.x} cy={viewBox.y} />;
              }} />
            </ReferenceDot>
          )}

          {/* TX base terrain dot */}
          {data.length > 0 && (
            <ReferenceDot x={data[0].distance} y={data[0].terrain} r={4} fill="rgba(56,189,248,0.8)" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
          )}

          {/* Orange glow at Fresnel obstruction (like photo) */}
          {!obstructionPoint && fresnelBlockPoint && (
            <ReferenceDot x={fresnelBlockPoint.distance} y={fresnelBlockPoint.altitude} r={10} fill="rgba(249,115,22,0.6)" stroke="none">
            </ReferenceDot>
          )}

          {/* LOS obstruction marker */}
          {obstructionPoint && (
            <ReferenceDot x={obstructionPoint.distance} y={obstructionPoint.altitude} r={7} fill="rgba(239,68,68,0.9)" stroke="rgba(255,255,255,0.6)" strokeWidth={2}>
              <RLabel value="⛔ NLOS" position="top" style={{ fontSize: 9, fill: 'rgba(239,68,68,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Fresnel obstruction dot — orange */}
          {!obstructionPoint && fresnelBlockPoint && (
            <ReferenceDot x={fresnelBlockPoint.distance} y={fresnelBlockPoint.altitude} r={6} fill="rgba(249,115,22,0.9)" stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
          )}

          {/* Ground impact marker */}
          {showTilt && groundImpact && (
            <ReferenceDot x={groundImpact.distance} y={groundImpact.altitude} r={7} fill="rgba(239,68,68,0.95)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`🎯 ${groundImpact.distance.toFixed(2)} km`} position="top" style={{ fontSize: 9, fill: 'rgba(239,68,68,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* Remote antenna (link mode) */}
          {remoteAntenna && data.length > 1 && (
            <>
              <ReferenceLine
                segment={[
                  { x: data[data.length - 1].distance, y: data[data.length - 1].terrain },
                  { x: data[data.length - 1].distance, y: (analysis.effectiveTerrain[profilePoints.length - 1] ?? 0) + remoteAntenna.hba },
                ]}
                stroke="rgba(34,197,94,0.8)"
                strokeWidth={2}
              />
              <ReferenceDot x={data[data.length - 1].distance} y={(analysis.effectiveTerrain[profilePoints.length - 1] ?? 0) + remoteAntenna.hba} r={7} fill="rgba(34,197,94,0.9)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
                <RLabel value={`📡 T:${remoteAntenna.totalTilt}° H:${remoteAntenna.hba}m`} position="top" style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }} offset={10} />
              </ReferenceDot>
            </>
          )}

          {/* Remote ground impact */}
          {remoteAntenna && remoteGroundImpact && (
            <ReferenceDot x={remoteGroundImpact.distance} y={remoteGroundImpact.altitude} r={7} fill="rgba(34,197,94,0.95)" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
              <RLabel value={`🎯 Remote ${remoteGroundImpact.distance.toFixed(2)} km`} position="top" style={{ fontSize: 9, fill: 'rgba(34,197,94,0.9)', fontWeight: 700 }} offset={10} />
            </ReferenceDot>
          )}

          {/* RX target — green circle with white border (like photo) */}
          {!remoteAntenna && data.length > 1 && ant && (
            <>
              <ReferenceDot x={data[data.length - 1].distance} y={rxAlt} r={7} fill="rgba(34,197,94,0.9)" stroke="rgba(255,255,255,0.9)" strokeWidth={2.5} />
              <ReferenceDot x={data[data.length - 1].distance} y={rxAlt} r={3} fill="white" stroke="none" />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfileChart;
