import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
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

const VIEW_W = 1000;
const VIEW_H = 500;
const M = { top: 60, right: 60, bottom: 60, left: 70 };
const IW = VIEW_W - M.left - M.right;
const IH = VIEW_H - M.top - M.bottom;

const ProfileChart: React.FC<Props> = ({
  profilePoints,
  analysis,
  fresnel,
  showFresnel = false,
  clutterHeight = 0,
  remoteAntenna,
  siteName,
  onHoverPoint,
}) => {
  const ant = analysis?.antennaParams ?? null;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const derived = useMemo(() => {
    if (!profilePoints.length || !analysis) {
      return null;
    }

    const totalDistM = profilePoints[profilePoints.length - 1].distance;
    const totalDistKm = totalDistM / 1000;

    const terrainEff = analysis.effectiveTerrain;
    const beamAlts = analysis.beamAltitudes;

    const antennaAMSL = ant?.antennaAMSL ?? terrainEff[0];
    const rxAMSL = ant && ant.rxHeight > 0
      ? profilePoints[profilePoints.length - 1].elevation + ant.rxHeight
      : terrainEff[terrainEff.length - 1];

    const remoteAMSL = remoteAntenna && profilePoints.length > 1
      ? terrainEff[terrainEff.length - 1] + remoteAntenna.hba
      : null;

    const tMin = Math.min(...terrainEff);
    const tMax = Math.max(...terrainEff);
    const rfMax = Math.max(tMax, antennaAMSL, rxAMSL, remoteAMSL ?? -Infinity);
    const rfMin = Math.min(tMin, rxAMSL);
    const range = Math.max(20, rfMax - rfMin);
    // Y starts from 0 (per V2 spec) with headroom above
    const yDomainMax = Math.ceil(rfMax + Math.max(20, range * 0.25));

    // First Fresnel block index
    let firstFresnelBlockIndex: number | null = null;
    if (fresnel) {
      for (let i = 0; i < profilePoints.length; i++) {
        if (terrainEff[i] > fresnel.fresnelLowerBound[i]) {
          firstFresnelBlockIndex = i;
          break;
        }
      }
    }

    const hasLOS = analysis.obstructionIndex !== null;
    const fresnelBlocked = firstFresnelBlockIndex !== null;
    const linkState: LinkState = hasLOS
      ? 'NLOS'
      : fresnelBlocked
      ? 'LOS_FRESNEL_BLOCKED'
      : 'LOS_CLEAR';

    return {
      totalDistKm,
      terrainEff,
      beamAlts,
      antennaAMSL,
      rxAMSL,
      remoteAMSL,
      yDomainMax,
      firstFresnelBlockIndex,
      linkState,
    };
  }, [profilePoints, analysis, fresnel, ant, remoteAntenna]);

  // Hooks must run unconditionally — compute even when no data
  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, derived?.totalDistKm ?? 1]).range([0, IW]),
    [derived?.totalDistKm]
  );
  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, derived?.yDomainMax ?? 100]).range([IH, 0]).nice(),
    [derived?.yDomainMax]
  );

  const terrainPath = useMemo(() => {
    if (!derived) return '';
    const area = d3
      .area<number>()
      .x((_, i) => xScale(profilePoints[i].distance / 1000))
      .y0(IH)
      .y1((v) => yScale(v))
      .curve(d3.curveMonotoneX);
    return area(derived.terrainEff) ?? '';
  }, [derived, profilePoints, xScale, yScale]);

  const terrainTopPath = useMemo(() => {
    if (!derived) return '';
    const line = d3
      .line<number>()
      .x((_, i) => xScale(profilePoints[i].distance / 1000))
      .y((v) => yScale(v))
      .curve(d3.curveMonotoneX);
    return line(derived.terrainEff) ?? '';
  }, [derived, profilePoints, xScale, yScale]);

  const clutterPath = useMemo(() => {
    if (!derived || clutterHeight <= 0) return '';
    const area = d3
      .area<number>()
      .x((_, i) => xScale(profilePoints[i].distance / 1000))
      .y0((v) => yScale(v))
      .y1((v) => yScale(v + clutterHeight))
      .curve(d3.curveStepAfter);
    return area(derived.terrainEff) ?? '';
  }, [derived, profilePoints, xScale, yScale, clutterHeight]);

  const fresnelPath = useMemo(() => {
    if (!derived || !fresnel || !showFresnel) return '';
    const top: [number, number][] = profilePoints.map((p, i) => [
      xScale(p.distance / 1000),
      yScale(fresnel.fresnelUpperBound[i]),
    ]);
    const bottom: [number, number][] = profilePoints
      .map((p, i): [number, number] => [
        xScale(p.distance / 1000),
        yScale(fresnel.fresnelLowerBound[i]),
      ])
      .reverse();
    return (d3.line()([...top, ...bottom]) ?? '') + 'Z';
  }, [derived, fresnel, showFresnel, profilePoints, xScale, yScale]);

  if (!derived || !ant) {
    return (
      <div className="flex items-center justify-center w-full h-full rounded-xl bg-slate-900/50 border border-slate-700/50 text-slate-400 text-sm">
        Computing radio profile…
      </div>
    );
  }

  const yTicks = yScale.ticks(8);
  const xTicks = xScale.ticks(8);

  const losX1 = xScale(0);
  const losY1 = yScale(derived.antennaAMSL);
  const losX2 = xScale(derived.totalDistKm);
  const losY2 = yScale(derived.remoteAMSL ?? derived.rxAMSL);

  const obstructionPoint =
    analysis.obstructionIndex !== null && profilePoints[analysis.obstructionIndex]
      ? {
          x: xScale(profilePoints[analysis.obstructionIndex].distance / 1000),
          y: yScale(derived.terrainEff[analysis.obstructionIndex]),
        }
      : null;

  const fresnelBlockPoint =
    derived.firstFresnelBlockIndex !== null && profilePoints[derived.firstFresnelBlockIndex]
      ? {
          x: xScale(profilePoints[derived.firstFresnelBlockIndex].distance / 1000),
          y: yScale(derived.terrainEff[derived.firstFresnelBlockIndex]),
        }
      : null;

  const statusText =
    derived.linkState === 'LOS_CLEAR'
      ? 'LOS OK'
      : derived.linkState === 'LOS_FRESNEL_BLOCKED'
      ? 'LOS / Fresnel Blocked'
      : 'NLOS';
  const statusColor =
    derived.linkState === 'LOS_CLEAR'
      ? 'rgb(34,197,94)'
      : derived.linkState === 'LOS_FRESNEL_BLOCKED'
      ? 'rgb(56,189,248)'
      : 'rgb(239,68,68)';

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VIEW_W - M.left;
    const distKm = xScale.invert(Math.max(0, Math.min(IW, px)));
    const distM = distKm * 1000;
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < profilePoints.length; i++) {
      const d = Math.abs(profilePoints[i].distance - distM);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    setHoverIdx(idx);
    if (onHoverPoint) {
      const p = profilePoints[idx];
      onHoverPoint({
        distanceKm: p.distance / 1000,
        elevationM: p.elevation,
        lat: p.lat,
        lng: p.lng,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    onHoverPoint?.(null);
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900/50 backdrop-blur-md border border-slate-700/50 shadow-2xl">
      {/* Status badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-md"
        style={{
          background: 'rgba(15,23,42,0.7)',
          border: `1px solid ${statusColor}`,
          boxShadow: `0 0 16px ${statusColor}40`,
        }}>
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
        <span className="text-[11px] font-bold tracking-wider" style={{ color: statusColor }}>
          {statusText}
        </span>
      </div>

      {siteName && (
        <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/50">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">{siteName}</span>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="terrainGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="clutterGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${M.left}, ${M.top})`}>
          {/* Grid */}
          <g>
            {yTicks.map((t) => (
              <g key={`y-${t}`} transform={`translate(0, ${yScale(t)})`}>
                <line x2={IW} stroke="rgba(148,163,184,0.15)" strokeDasharray="4,4" />
                <text
                  x={-10}
                  alignmentBaseline="middle"
                  textAnchor="end"
                  fill="rgba(148,163,184,0.7)"
                  className="text-[10px] font-mono"
                >
                  {t}m
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <g key={`x-${t}`} transform={`translate(${xScale(t)}, ${IH})`}>
                <line y1={-IH} stroke="rgba(148,163,184,0.15)" strokeDasharray="4,4" />
                <text y={20} textAnchor="middle" fill="rgba(148,163,184,0.7)" className="text-[10px] font-mono">
                  {t}km
                </text>
              </g>
            ))}
          </g>

          {/* Clutter */}
          {clutterHeight > 0 && (
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              d={clutterPath}
              fill="url(#clutterGradient)"
              stroke="rgba(96,165,250,0.3)"
              strokeWidth={1}
            />
          )}

          {/* Terrain fill */}
          <path d={terrainPath} fill="url(#terrainGradient)" />
          <path d={terrainTopPath} fill="none" stroke="rgba(203,213,225,0.85)" strokeWidth={1.5} />

          {/* Fresnel zone */}
          <AnimatePresence>
            {showFresnel && fresnelPath && (
              <motion.path
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                d={fresnelPath}
                fill="rgba(234,179,8,0.13)"
                stroke="rgba(234,179,8,0.4)"
                strokeWidth={1}
                strokeDasharray="5,3"
              />
            )}
          </AnimatePresence>

          {/* LOS line */}
          <motion.line
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8 }}
            x1={losX1}
            y1={losY1}
            x2={losX2}
            y2={losY2}
            stroke="rgb(163,230,53)"
            strokeWidth={2}
            strokeDasharray="6,4"
            filter="url(#glow)"
          />

          {/* Obstruction marker */}
          {obstructionPoint && (
            <motion.g
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              transform={`translate(${obstructionPoint.x}, ${obstructionPoint.y})`}
            >
              <circle r={10} fill="rgba(239,68,68,0.25)" />
              <circle r={5} fill="rgb(239,68,68)" stroke="white" strokeWidth={1.5} />
            </motion.g>
          )}

          {/* Fresnel block marker */}
          {!obstructionPoint && fresnelBlockPoint && (
            <motion.g
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              transform={`translate(${fresnelBlockPoint.x}, ${fresnelBlockPoint.y})`}
            >
              <circle r={9} fill="rgba(249,115,22,0.25)" />
              <circle r={5} fill="rgb(249,115,22)" stroke="white" strokeWidth={1.5} />
            </motion.g>
          )}

          {/* TX site (left) */}
          <SiteTower
            x={xScale(0)}
            terrainY={yScale(derived.terrainEff[0])}
            antennaY={yScale(derived.antennaAMSL)}
            innerHeight={IH}
            align="left"
            label="TX"
            heightAGL={ant.hba}
            altitudeAMSL={Math.round(derived.antennaAMSL)}
          />

          {/* RX site (right) */}
          <SiteTower
            x={xScale(derived.totalDistKm)}
            terrainY={yScale(derived.terrainEff[derived.terrainEff.length - 1])}
            antennaY={yScale(derived.remoteAMSL ?? derived.rxAMSL)}
            innerHeight={IH}
            align="right"
            label="RX"
            heightAGL={remoteAntenna?.hba ?? ant.rxHeight ?? 1.5}
            altitudeAMSL={Math.round(derived.remoteAMSL ?? derived.rxAMSL)}
          />

          {/* Hover crosshair */}
          {hoverIdx !== null && profilePoints[hoverIdx] && (
            <g transform={`translate(${xScale(profilePoints[hoverIdx].distance / 1000)}, 0)`}>
              <line
                y1={0}
                y2={IH}
                stroke="rgba(56,189,248,0.5)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <circle
                cy={yScale(derived.terrainEff[hoverIdx])}
                r={4}
                fill="rgb(56,189,248)"
                stroke="white"
                strokeWidth={1.5}
              />
            </g>
          )}
        </g>
      </svg>

      {/* Axis labels */}
      <div className="absolute top-12 left-4 text-slate-400 text-[10px] font-semibold uppercase tracking-wider rotate-[-90deg] origin-top-left">
        Height (AMSL m)
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        Distance (km)
      </div>

      {/* Hover tooltip */}
      {hoverIdx !== null && profilePoints[hoverIdx] && (
        <div className="absolute bottom-3 right-3 z-10 px-3 py-2 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-[10px] font-mono text-slate-200 pointer-events-none">
          <div>D: <span className="text-cyan-400 font-bold">{(profilePoints[hoverIdx].distance / 1000).toFixed(2)} km</span></div>
          <div>Alt: <span className="text-emerald-400 font-bold">{Math.round(profilePoints[hoverIdx].elevation)} m</span></div>
        </div>
      )}
    </div>
  );
};

interface SiteTowerProps {
  x: number;
  terrainY: number;
  antennaY: number;
  innerHeight: number;
  align: 'left' | 'right';
  label: string;
  heightAGL: number;
  altitudeAMSL: number;
}

const SiteTower: React.FC<SiteTowerProps> = ({
  x, terrainY, antennaY, innerHeight, align, label, heightAGL, altitudeAMSL,
}) => {
  const textX = align === 'left' ? 12 : -12;
  const textAnchor = align === 'left' ? 'start' : 'end';
  const dishDx = align === 'left' ? 1 : -1;

  return (
    <g transform={`translate(${x}, 0)`}>
      {/* Foundation */}
      <path
        d={`M -5 ${terrainY} L -8 ${innerHeight} L 8 ${innerHeight} L 5 ${terrainY} Z`}
        fill="rgba(15,23,42,0.85)"
      />
      {/* Mast */}
      <line x1={0} y1={terrainY} x2={0} y2={antennaY} stroke="rgba(56,189,248,0.6)" strokeWidth={2} />
      {/* Lattice */}
      <path
        d={`M -8 ${terrainY} L 0 ${antennaY} L 8 ${terrainY}
            M -6 ${terrainY + (antennaY - terrainY) * 0.5} L 6 ${terrainY + (antennaY - terrainY) * 0.5}`}
        stroke="rgba(56,189,248,0.35)"
        strokeWidth={1}
        fill="none"
      />
      {/* Antenna */}
      <motion.circle
        initial={{ r: 0 }}
        animate={{ r: 5 }}
        cx={dishDx * 4}
        cy={antennaY}
        fill="rgb(45,212,191)"
        stroke="white"
        strokeWidth={1}
      />
      <path
        d={align === 'left'
          ? `M 0 ${antennaY - 7} Q 9 ${antennaY} 0 ${antennaY + 7} Z`
          : `M 0 ${antennaY - 7} Q -9 ${antennaY} 0 ${antennaY + 7} Z`}
        fill="rgba(20,184,166,0.5)"
        stroke="rgba(94,234,212,0.9)"
        strokeWidth={1}
      />
      {/* Vertical measurement */}
      <line
        x1={align === 'left' ? 16 : -16}
        y1={terrainY}
        x2={align === 'left' ? 16 : -16}
        y2={antennaY}
        stroke="rgba(52,211,153,0.45)"
        strokeDasharray="2,2"
      />
      {/* Labels */}
      <text x={textX} y={antennaY - 6} textAnchor={textAnchor} fill="white" className="text-[11px] font-bold uppercase">
        {label}
      </text>
      <text x={textX} y={antennaY + 6} textAnchor={textAnchor} fill="rgb(52,211,153)" className="text-[10px] font-bold">
        {heightAGL.toFixed(1)}m AGL
      </text>
      <text x={textX} y={antennaY + 18} textAnchor={textAnchor} fill="rgba(148,163,184,0.85)" className="text-[9px] font-mono">
        {altitudeAMSL}m AMSL
      </text>
    </g>
  );
};

export default ProfileChart;
