import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { ProfilePoint, LOSAnalysis, FresnelAnalysis } from '@/utils/geodesicUtils';

function formatBandLabel(band?: string): string {
  if (!band) return '—';
  const b = String(band).toUpperCase().replace(/\s+/g, '');
  if (b.includes('3500') || b.includes('N78')) return '3500 MHz (n78)';
  if (b.includes('2600') || b.includes('B7')) return '2600 MHz (B7)';
  if (b.includes('2100') || b === 'B1') return '2100 MHz (B1)';
  if (b.includes('1800') || b.includes('B3') || b.includes('DCS')) return '1800 MHz (B3)';
  if (b.includes('900') || b.includes('B8')) return '900 MHz (B8)';
  if (b.includes('800') || b.includes('B20')) return '800 MHz (B20)';
  if (b.includes('700') || b.includes('B28')) return '700 MHz (B28)';
  return band;
}

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
  autoScale?: boolean;
  manualMinHeight?: number | null;
  /** TX endpoint is a custom point (not a tower) — renders a 2 m pole. */
  txIsPoint?: boolean;
  /** RX endpoint is a custom point (not a tower) — renders a 2 m pole. */
  rxIsPoint?: boolean;
  /** Optional TX cell label (replaces "Site A (TX)" when present). */
  txCellName?: string;
  /** Optional RX cell label (replaces "Site B (RX)" when present). */
  rxCellName?: string;
  /** TX band (raw string like "LTE1800") for footer label. */
  txBand?: string;
  /** RX band (raw string like "LTE1800") for footer label. */
  rxBand?: string;
}

type LinkState = 'LOS_CLEAR' | 'LOS_FRESNEL_BLOCKED' | 'NLOS';

const VIEW_W = 1600;
const VIEW_H = 1200;
const M = { top: 40, right: 40, bottom: 80, left: 90 };
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
  autoScale = true,
  manualMinHeight = null,
  txIsPoint = false,
  rxIsPoint = false,
  txCellName,
  rxCellName,
  txBand,
  rxBand,
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

    // Smart adaptive Y-axis:
    // - autoScale ON  → start near rfMin (frame the RF area, kill empty space)
    // - manual override → use manualMinHeight
    // - autoScale OFF → start at 0 with axis-break compression
    const range = Math.max(20, rfMax - rfMin);
    let yDomainMin = 0;
    let useBreak = false;
    let breakLow = 0;

    if (manualMinHeight !== null && manualMinHeight >= 0 && manualMinHeight < rfMin) {
      yDomainMin = manualMinHeight;
    } else if (autoScale) {
      // Pad below by 10% of range, snapped to 10m
      yDomainMin = Math.max(0, Math.floor((rfMin - range * 0.10) / 10) * 10);
    } else {
      yDomainMin = 0;
      breakLow = Math.max(0, Math.floor(rfMin * 0.85 / 10) * 10);
      useBreak = breakLow > 30;
    }

    const yDomainMax = Math.ceil((rfMax + Math.max(15, range * 0.12)) / 25) * 25;

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
      yDomainMin,
      yDomainMax,
      breakLow,
      hasBreak: useBreak,
      firstFresnelBlockIndex,
      linkState,
    };
  }, [profilePoints, analysis, fresnel, ant, remoteAntenna, autoScale, manualMinHeight]);

  // Hooks must run unconditionally — compute even when no data
  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, derived?.totalDistKm ?? 1]).range([0, IW]),
    [derived?.totalDistKm]
  );
  // Piecewise Y scale: [0..breakLow] → bottom 12%, [breakLow..max] → top 88%
  const yScale = useMemo(() => {
    const dMin = derived?.yDomainMin ?? 0;
    const dMax = derived?.yDomainMax ?? 100;
    if (derived?.hasBreak) {
      const bl = derived.breakLow;
      const breakPx = IH * 0.88; // y-pixel where break sits (bottom band height = 12%)
      return d3.scaleLinear()
        .domain([dMin, bl, dMax])
        .range([IH, breakPx, 0]);
    }
    return d3.scaleLinear().domain([dMin, dMax]).range([IH, 0]).nice();
  }, [derived?.yDomainMin, derived?.yDomainMax, derived?.hasBreak, derived?.breakLow]);


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

  // Build Y ticks: include 0, breakLow, and evenly spaced upper-band ticks
  const yTicks = derived.hasBreak
    ? [0, ...d3.scaleLinear().domain([derived.breakLow, derived.yDomainMax]).ticks(6).filter(t => t > derived.breakLow)]
    : yScale.ticks(8);
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
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900/50 backdrop-blur-md border border-slate-700/50 shadow-2xl flex flex-col">
      {/* Status badge */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-md"
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
        <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/50">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">{siteName}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full"
        preserveAspectRatio="none"
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
                  x={-12}
                  alignmentBaseline="middle"
                  textAnchor="end"
                  fill="rgba(148,163,184,0.85)"
                  fontSize={26}
                  fontFamily="monospace"
                >
                  {t}m
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <g key={`x-${t}`} transform={`translate(${xScale(t)}, ${IH})`}>
                <line y1={-IH} stroke="rgba(148,163,184,0.15)" strokeDasharray="4,4" />
                <text y={36} textAnchor="middle" fill="rgba(148,163,184,0.85)" fontSize={26} fontFamily="monospace">
                  {t} km
                </text>
              </g>
            ))}

            {/* Axis break indicator */}
            {derived.hasBreak && (() => {
              const yBreak = yScale(derived.breakLow);
              const y0 = yScale(0);
              const yMid = (yBreak + y0) / 2;
              return (
                <g>
                  <line x1={0} x2={IW} y1={yBreak + 1} y2={yBreak + 1} stroke="rgba(148,163,184,0.4)" strokeDasharray="2,3" />
                  <path d={`M -14 ${yMid - 4} l 8 -4 l -16 -4 l 8 -4`} stroke="rgba(148,163,184,0.75)" strokeWidth={1.2} fill="none" />
                </g>
              );
            })()}
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

          {/* LOS line - solid bright */}
          <motion.line
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8 }}
            x1={losX1}
            y1={losY1}
            x2={losX2}
            y2={losY2}
            stroke="rgb(190,242,100)"
            strokeWidth={2}
            strokeLinecap="round"
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

          {/* Aim angles in screen-space (deg) so each dish points toward the other endpoint */}
          {(() => null)()}
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
            isPoint={txIsPoint}
            aimDeg={Math.atan2(losY2 - losY1, losX2 - losX1) * 180 / Math.PI}
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
            isPoint={rxIsPoint}
            aimDeg={Math.atan2(losY1 - losY2, losX1 - losX2) * 180 / Math.PI}
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
      <div className="absolute top-12 left-4 text-slate-400 text-[10px] font-semibold uppercase tracking-wider rotate-[-90deg] origin-top-left pointer-events-none">
        Height (AMSL m)
      </div>

      {/* Hover tooltip */}
      {hoverIdx !== null && profilePoints[hoverIdx] && (
        <div className="absolute bottom-16 right-3 z-10 px-3 py-2 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-[10px] font-mono text-slate-200 pointer-events-none">
          <div>D: <span className="text-cyan-400 font-bold">{(profilePoints[hoverIdx].distance / 1000).toFixed(2)} km</span></div>
          <div>Alt: <span className="text-emerald-400 font-bold">{Math.round(profilePoints[hoverIdx].elevation)} m</span></div>
        </div>
      )}
      </div>

      {/* Footer info bar: Site A · Link summary · Site B */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/60 border-t border-slate-700/50 text-[11px] font-mono">
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-slate-900/70 border border-emerald-500/30">
          <span className="text-emerald-400 font-bold uppercase tracking-wider truncate max-w-[260px]" title={txCellName || (txIsPoint ? 'Point (TX)' : 'Site A (TX)')}>
            {txCellName || (txIsPoint ? 'Point (TX)' : 'Site A (TX)')}
          </span>
          {!txIsPoint && (
            <>
              <span className="text-slate-300">HBA: <span className="text-emerald-300 font-bold">{ant.hba.toFixed(0)} m</span></span>
              <span className="text-slate-300">Tilt: <span className="text-emerald-300 font-bold">{(ant.totalTilt ?? 0).toFixed(1)}°</span></span>
            </>
          )}
          {txIsPoint && (
            <span className="text-slate-300">H: <span className="text-emerald-300 font-bold">2 m</span></span>
          )}
        </div>
        <div className="flex items-center gap-4 px-4 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/40 text-[12px]">
          <span className="flex items-baseline gap-1.5"><span className="text-cyan-300 font-bold uppercase tracking-wider text-[10px]">Dist</span><span className="text-white font-bold tabular-nums">{derived.totalDistKm.toFixed(2)} km</span></span>
          {fresnel && showFresnel && (
            <span className="flex items-baseline gap-1.5"><span className="text-yellow-300 font-bold uppercase tracking-wider text-[10px]">Fresnel</span><span className="text-white font-bold tabular-nums">{Math.max(0, Math.round(100 - (fresnel.maxIntrusionPercent ?? 0)))}%</span></span>
          )}
        </div>
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-slate-900/70 border border-emerald-500/30">
          <span className="text-emerald-400 font-bold uppercase tracking-wider truncate max-w-[260px]" title={rxCellName || (rxIsPoint ? 'Point (RX)' : 'Site B (RX)')}>
            {rxCellName || (rxIsPoint ? 'Point (RX)' : 'Site B (RX)')}
          </span>
          {!rxIsPoint && (
            <>
              <span className="text-slate-300">HBA: <span className="text-emerald-300 font-bold">{(remoteAntenna?.hba ?? ant.rxHeight ?? 1.5).toFixed(0)} m</span></span>
              <span className="text-slate-300">Tilt: <span className="text-emerald-300 font-bold">{(remoteAntenna?.totalTilt ?? 0).toFixed(1)}°</span></span>
            </>
          )}
          {rxIsPoint && (
            <span className="text-slate-300">H: <span className="text-emerald-300 font-bold">2 m</span></span>
          )}
        </div>
      </div>
    </div>
  );
};

export interface SiteTowerProps {
  x: number;
  terrainY: number;
  antennaY: number;
  innerHeight: number;
  align: 'left' | 'right';
  label: string;
  heightAGL: number;
  altitudeAMSL: number;
  isPoint?: boolean;
  aimDeg?: number;
}

export const SiteTower: React.FC<SiteTowerProps> = ({
  x, terrainY, antennaY, innerHeight, align, label, heightAGL, altitudeAMSL, isPoint = false, aimDeg = 0,
}) => {
  const sign = align === 'left' ? 1 : -1;
  const textAnchor = align === 'left' ? 'start' : 'end';

  // Custom point: not a tower — render a thin 2 m pole at terrain level.
  if (isPoint) {
    const POLE_PX = Math.max(6, Math.min(18, (terrainY - antennaY) || 10));
    const poleTopY = terrainY - POLE_PX;
    return (
      <g transform={`translate(${x}, 0)`}>
        <ellipse cx={0} cy={terrainY + 1.5} rx={3} ry={1.5} fill="rgba(0,0,0,0.5)" />
        <line x1={0} y1={terrainY} x2={0} y2={poleTopY} stroke="rgba(186,230,253,0.95)" strokeWidth={1.5} />
        <circle cx={0} cy={poleTopY} r={2.2} fill="rgb(94,234,212)" stroke="white" strokeWidth={0.8} />
        <g transform={`translate(${sign * 6}, ${poleTopY - 24})`}>
          <rect
            x={align === 'left' ? 0 : -78}
            y={0}
            width={78}
            height={28}
            rx={4}
            fill="rgba(15,23,42,0.85)"
            stroke="rgba(94,234,212,0.5)"
            strokeWidth={1}
          />
          <text x={align === 'left' ? 6 : -72} y={11} textAnchor="start" fill="rgb(94,234,212)" className="text-[10px] font-bold uppercase tracking-wider">
            {label} (POINT)
          </text>
          <text x={align === 'left' ? 6 : -72} y={23} textAnchor="start" fill="rgba(226,232,240,0.9)" className="text-[9px] font-mono">
            {altitudeAMSL} m AMSL
          </text>
        </g>
      </g>
    );
  }

  const towerHeightPx = Math.max(20, terrainY - antennaY);
  const baseHalf = Math.max(10, Math.min(22, towerHeightPx * 0.14));
  const topHalf = 3;

  // Lattice cross-bracing
  const segments = Math.max(4, Math.floor(towerHeightPx / 22));
  const braces: string[] = [];
  for (let i = 0; i < segments; i++) {
    const t1 = i / segments;
    const t2 = (i + 1) / segments;
    const y1 = terrainY - towerHeightPx * t1;
    const y2 = terrainY - towerHeightPx * t2;
    const w1 = baseHalf - (baseHalf - topHalf) * t1;
    const w2 = baseHalf - (baseHalf - topHalf) * t2;
    // X cross
    braces.push(`M ${-w1} ${y1} L ${w2} ${y2} M ${w1} ${y1} L ${-w2} ${y2}`);
    // horizontal
    braces.push(`M ${-w2} ${y2} L ${w2} ${y2}`);
  }

  return (
    <g transform={`translate(${x}, 0)`}>
      {/* Ground shadow */}
      <ellipse cx={0} cy={terrainY + 2} rx={baseHalf + 4} ry={2.5} fill="rgba(0,0,0,0.45)" />

      {/* Tower legs (trapezoid silhouette) */}
      <path
        d={`M ${-baseHalf} ${terrainY} L ${-topHalf} ${antennaY} L ${topHalf} ${antennaY} L ${baseHalf} ${terrainY} Z`}
        fill="rgba(148,163,184,0.08)"
        stroke="rgba(186,230,253,0.85)"
        strokeWidth={1.5}
      />

      {/* Lattice bracing */}
      <path d={braces.join(' ')} stroke="rgba(125,211,252,0.55)" strokeWidth={0.8} fill="none" />

      {/* Center mast highlight */}
      <line x1={0} y1={terrainY} x2={0} y2={antennaY} stroke="rgba(186,230,253,0.6)" strokeWidth={1} />

      {/* Antenna mounting platform */}
      <rect x={-topHalf - 2} y={antennaY - 2} width={(topHalf + 2) * 2} height={3} fill="rgba(186,230,253,0.9)" />

      {/* Parabolic dish antenna pointing toward link */}
      <g transform={`translate(${sign * (topHalf + 1)}, ${antennaY}) rotate(${aimDeg})`}>
        {/* dish body */}
        <path
          d={`M 0 -10 Q 14 0 0 10 L 0 -10 Z`}
          fill="rgba(45,212,191,0.35)"
          stroke="rgb(94,234,212)"
          strokeWidth={1.4}
        />
        {/* feed horn */}
        <line x1={0} y1={0} x2={10} y2={0} stroke="rgb(94,234,212)" strokeWidth={1.2} />
        <circle cx={10} cy={0} r={2} fill="rgb(45,212,191)" />
        {/* glow */}
        <circle cx={5} cy={0} r={3} fill="rgb(45,212,191)" opacity={0.5} filter="url(#glow)" />
      </g>

      {/* Vertical measurement (antenna height AGL) */}
      <g>
        <line
          x1={sign * (baseHalf + 14)}
          y1={terrainY}
          x2={sign * (baseHalf + 14)}
          y2={antennaY}
          stroke="rgba(52,211,153,0.7)"
          strokeWidth={1}
        />
        {/* end caps */}
        <line x1={sign * (baseHalf + 10)} y1={terrainY} x2={sign * (baseHalf + 18)} y2={terrainY} stroke="rgba(52,211,153,0.7)" strokeWidth={1} />
        <line x1={sign * (baseHalf + 10)} y1={antennaY} x2={sign * (baseHalf + 18)} y2={antennaY} stroke="rgba(52,211,153,0.7)" strokeWidth={1} />
        <text
          x={sign * (baseHalf + 22)}
          y={(terrainY + antennaY) / 2 + 3}
          textAnchor={textAnchor}
          fill="rgb(110,231,183)"
          className="text-[10px] font-bold font-mono"
        >
          {heightAGL.toFixed(0)} m
        </text>
      </g>

      {/* Site label box */}
      <g transform={`translate(${sign * (baseHalf + 6)}, ${antennaY - 38})`}>
        <rect
          x={align === 'left' ? 0 : -88}
          y={0}
          width={88}
          height={32}
          rx={4}
          fill="rgba(15,23,42,0.85)"
          stroke="rgba(94,234,212,0.5)"
          strokeWidth={1}
        />
        <text
          x={align === 'left' ? 6 : -82}
          y={13}
          textAnchor="start"
          fill="rgb(94,234,212)"
          className="text-[10px] font-bold uppercase tracking-wider"
        >
          {label}
        </text>
        <text
          x={align === 'left' ? 6 : -82}
          y={26}
          textAnchor="start"
          fill="rgba(226,232,240,0.9)"
          className="text-[9px] font-mono"
        >
          {altitudeAMSL} m AMSL
        </text>
      </g>
    </g>
  );
};

export default ProfileChart;
