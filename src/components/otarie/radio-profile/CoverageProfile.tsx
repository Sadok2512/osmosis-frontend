/**
 * CoverageProfile — antenna-to-ground cellular coverage view (premium UI).
 *
 * Side-elevation chart with a rich header (site/sector/band info chips),
 * a colored beam segmented by RSRP zone (Near / Main / Far), an RSRP legend,
 * tower with antenna marker, terrain (when available) and bottom summary
 * panels (Coverage Summary, Signal at Ground, Legend).
 *
 * Engineering model (simplified, side-view, ignores earth curvature):
 *   totalTilt           = mechanicalTilt + electricalTilt              [deg]
 *   mainBeamGroundDist  = antennaHeight / tan(totalTilt)               [m]
 *   farEdgeDist         = antennaHeight / tan(totalTilt - vbw/2)       [m]
 *   nearEdgeDist        = antennaHeight / tan(totalTilt + vbw/2)       [m]
 */
import React, { useMemo, useState } from 'react';
import { Antenna } from 'lucide-react';
import type { ProfilePoint } from '@/utils/geodesicUtils';

export interface CoverageProfileProps {
  siteName: string;
  sectorName?: string;
  azimut?: number;
  antennaHeight: number;
  mechanicalTilt: number;
  electricalTilt: number;
  band: string;
  techno: string;
  hbw?: number;
  vbw?: number;
  /** Channel bandwidth (MHz), e.g. 20. Optional, displayed in header. */
  bandwidthMhz?: number;
  /** Tx power in dBm (for free-space estimate). Defaults to 46 dBm (~40W). */
  txPowerDbm?: number;
  terrainProfile?: ProfilePoint[];
  siteAltitudeAmsl?: number;
  showBeam?: boolean;
  showFootprint?: boolean;
  showTiltLines?: boolean;
  showClutter?: boolean;
  clutterHeight?: number;
}

const SAFE_MIN_DEG = 0.5;
const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function technoColor(techno: string): string {
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G') || t.startsWith('NR')) return '#27AE60';
  if (t.includes('4G') || t.includes('LTE')) return '#F39C12';
  if (t.includes('3G') || t.includes('UMTS') || t.includes('WCDMA')) return '#3498DB';
  if (t.includes('2G') || t.includes('GSM')) return '#8E44AD';
  return '#94a3b8';
}

function bandFreqLabel(band: string): { label: string; freqMhz: number } {
  const b = String(band || '').toUpperCase().replace(/\s+/g, '');
  if (b.includes('3500') || b.includes('N78')) return { label: '3500 MHz (n78)', freqMhz: 3500 };
  if (b.includes('2600') || b.includes('B7')) return { label: '2600 MHz (B7)', freqMhz: 2600 };
  if (b.includes('2100') || b === 'B1') return { label: '2100 MHz (B1)', freqMhz: 2100 };
  if (b.includes('1800') || b.includes('B3') || b.includes('DCS')) return { label: '1800 MHz (B3)', freqMhz: 1800 };
  if (b.includes('900') || b.includes('B8')) return { label: '900 MHz (B8)', freqMhz: 900 };
  if (b.includes('800') || b.includes('B20')) return { label: '800 MHz (B20)', freqMhz: 800 };
  if (b.includes('700') || b.includes('B28')) return { label: '700 MHz (B28)', freqMhz: 700 };
  return { label: band || '—', freqMhz: 1800 };
}

function bandMaxDistance(band: string, techno: string): number {
  const b = String(band || '').toUpperCase().replace(/\s+/g, '');
  if (b.includes('3500') || b.includes('N78')) return 1500;
  if (b.includes('2600') || b.includes('B7')) return 1800;
  if (b.includes('2100')) return 2500;
  if (b.includes('1800')) return 3000;
  if (b.includes('900')) return 5000;
  if (b.includes('800')) return 6500;
  if (b.includes('700')) return 7000;
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G')) return 1500;
  if (t.includes('4G')) return 3000;
  if (t.includes('3G')) return 4000;
  if (t.includes('2G')) return 6000;
  return 3000;
}

function defaultVbw(band: string, techno: string): number {
  const b = String(band || '').toUpperCase();
  if (b.includes('3500')) return 6;
  if (String(techno).toUpperCase().includes('5G')) return 6;
  return 7;
}

/** Free-space path loss in dB. d in meters, f in MHz. */
function fspl(distM: number, freqMhz: number): number {
  if (distM <= 0 || freqMhz <= 0) return 0;
  return 32.45 + 20 * Math.log10(distM / 1000) + 20 * Math.log10(freqMhz);
}

/** Estimate received signal at a ground distance (very rough, side-lobe agnostic). */
function estimateRsrpDbm(distM: number, freqMhz: number, txPowerDbm: number, antennaGainDbi = 17): number {
  if (distM <= 1) return txPowerDbm + antennaGainDbi - 30;
  return txPowerDbm + antennaGainDbi - fspl(distM, freqMhz);
}

function rsrpClass(rsrp: number): { color: string; label: string } {
  if (rsrp >= -85) return { color: '#22c55e', label: '> -85 dBm' };
  if (rsrp >= -100) return { color: '#eab308', label: '-85 to -100 dBm' };
  if (rsrp >= -115) return { color: '#f97316', label: '-100 to -115 dBm' };
  return { color: '#ef4444', label: '< -115 dBm' };
}

export const CoverageProfile: React.FC<CoverageProfileProps> = ({
  siteName,
  sectorName,
  azimut,
  antennaHeight,
  mechanicalTilt,
  electricalTilt,
  band,
  techno,
  hbw = 65,
  vbw,
  bandwidthMhz = 20,
  txPowerDbm = 46,
  terrainProfile,
  siteAltitudeAmsl,
  showBeam: showBeamProp = true,
  showFootprint: showFootprintProp = true,
  showTiltLines: showTiltLinesProp = true,
  showClutter: showClutterProp = false,
  clutterHeight = 10,
}) => {
  // Local UI state — toggles inside the panel header strip
  const [showBeam, setShowBeam] = useState(showBeamProp);
  const [showFootprint, setShowFootprint] = useState(showFootprintProp);
  const [showTiltLines, setShowTiltLines] = useState(showTiltLinesProp);
  const [showClutter, setShowClutter] = useState(showClutterProp);
  const [autoScale, setAutoScale] = useState(true);

  const color = technoColor(techno);
  const vbwEff = vbw ?? defaultVbw(band, techno);
  const { label: bandLabel, freqMhz } = bandFreqLabel(band);

  const geom = useMemo(() => {
    const totalTilt = mechanicalTilt + electricalTilt;
    const mainAngle = Math.max(SAFE_MIN_DEG, totalTilt);
    const farAngle = Math.max(SAFE_MIN_DEG, totalTilt - vbwEff / 2);
    const nearAngle = Math.max(SAFE_MIN_DEG, totalTilt + vbwEff / 2);
    const cap = bandMaxDistance(band, techno);
    const mainDist = clamp(antennaHeight / tanDeg(mainAngle), 0, cap);
    const farDist = clamp(antennaHeight / tanDeg(farAngle), 0, cap);
    const nearDist = clamp(antennaHeight / tanDeg(nearAngle), 0, cap);
    const maxRange = clamp(antennaHeight / tanDeg(Math.max(SAFE_MIN_DEG, totalTilt - vbwEff)), 0, cap * 1.2);
    return { totalTilt, mainAngle, farAngle, nearAngle, mainDist, farDist, nearDist, cap, maxRange };
  }, [mechanicalTilt, electricalTilt, antennaHeight, band, techno, vbwEff]);

  // ── Chart frame ──
  const VIEW_W = 1100;
  const VIEW_H = 430;
  const M = { top: 26, right: 30, bottom: 60, left: 70 };
  const IW = VIEW_W - M.left - M.right;
  const IH = VIEW_H - M.top - M.bottom;

  const xMaxDomain = autoScale
    ? Math.max(1, geom.farDist) * 1.15
    : geom.cap;
  const groundBaseAmsl = siteAltitudeAmsl ?? 0;
  const antennaAmsl = groundBaseAmsl + antennaHeight;

  const terrainSeries = useMemo<{ x: number; y: number }[]>(() => {
    if (terrainProfile && terrainProfile.length >= 2) {
      return terrainProfile.map(p => ({ x: p.distance, y: p.elevation }));
    }
    return [
      { x: 0, y: groundBaseAmsl },
      { x: xMaxDomain, y: groundBaseAmsl },
    ];
  }, [terrainProfile, groundBaseAmsl, xMaxDomain]);

  const yMin = Math.min(groundBaseAmsl, ...terrainSeries.map(p => p.y)) - 10;
  const yMaxRaw = Math.max(antennaAmsl + 30, ...terrainSeries.map(p => p.y));
  const yMax = yMaxRaw + 10;
  const ySpan = Math.max(1, yMax - yMin);

  const xScale = (d: number) => M.left + (d / xMaxDomain) * IW;
  const yScale = (a: number) => M.top + IH - ((a - yMin) / ySpan) * IH;

  const towerX = xScale(0);
  const groundY = yScale(groundBaseAmsl);
  const antennaY = yScale(antennaAmsl);

  const nearImpact = { x: xScale(geom.nearDist), y: yScale(groundBaseAmsl) };
  const mainImpact = { x: xScale(geom.mainDist), y: yScale(groundBaseAmsl) };
  const farImpact = { x: xScale(geom.farDist), y: yScale(groundBaseAmsl) };

  const terrainPath = useMemo(() => {
    if (terrainSeries.length < 2) return '';
    const pts = terrainSeries.map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' L ');
    const first = `${xScale(terrainSeries[0].x)},${yScale(yMin)}`;
    const last = `${xScale(terrainSeries[terrainSeries.length - 1].x)},${yScale(yMin)}`;
    return `M ${first} L ${pts} L ${last} Z`;
  }, [terrainSeries, xMaxDomain, yMin, yMax]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep(ySpan / 6);
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMin, yMax, ySpan]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep(xMaxDomain / 8);
    for (let v = 0; v <= xMaxDomain + 1e-6; v += step) ticks.push(v);
    return ticks;
  }, [xMaxDomain]);

  // RSRP at landmark distances
  const rsrpNear = estimateRsrpDbm(100, freqMhz, txPowerDbm);
  const rsrpMid = estimateRsrpDbm(500, freqMhz, txPowerDbm);
  const rsrpFar = estimateRsrpDbm(1500, freqMhz, txPowerDbm);
  const rsrpEdge = estimateRsrpDbm(geom.farDist || 1, freqMhz, txPowerDbm);
  const coverageAreaKm2 = (Math.PI * Math.pow(geom.farDist / 1000, 2) * (hbw / 360));

  // Coverage zones (along the beam) — colored by RSRP class
  const zone = (d0: number, d1: number) => {
    const mid = (d0 + d1) / 2;
    return rsrpClass(estimateRsrpDbm(Math.max(50, mid), freqMhz, txPowerDbm));
  };
  const nearZone = zone(0, geom.nearDist);
  const mainZone = zone(geom.nearDist, geom.mainDist);
  const farZone = zone(geom.mainDist, geom.farDist);

  return (
    <div className="w-full h-full flex flex-col text-white">
      {/* ── Sub-header strip: toggles ── */}
      <div className="flex items-center justify-between px-3 py-2 mb-1 rounded-xl bg-white/[0.03] border border-white/5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 mr-2">Coverage Profile</span>
          <Toggle label="Show Beam" value={showBeam} onChange={setShowBeam} />
          <Toggle label="Show Footprint" value={showFootprint} onChange={setShowFootprint} />
          <Toggle label="Show Tilt Lines" value={showTiltLines} onChange={setShowTiltLines} />
          <Toggle label="Show Clutter" value={showClutter} onChange={setShowClutter} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 font-medium">Auto Scale</span>
          <button
            onClick={() => setAutoScale(v => !v)}
            className={`w-9 h-4 rounded-full transition-colors relative ${autoScale ? 'bg-emerald-500/70' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoScale ? 'left-[20px]' : 'left-0.5'}`} />
          </button>
          <button
            onClick={() => setAutoScale(true)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white/70 hover:text-white border border-white/10 hover:bg-white/5"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="flex-1 min-h-0 relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          style={{ background: 'transparent' }}
        >
          <defs>
            <linearGradient id="cp-terrain" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="cp-beam" x1="0" x2="1" y1="0" y2="0.2">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#eab308" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
            </linearGradient>
            <filter id="cp-beam-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid */}
          {yTicks.map(v => (
            <g key={`yt-${v}`}>
              <line
                x1={M.left}
                x2={M.left + IW}
                y1={yScale(v)}
                y2={yScale(v)}
                stroke="#1d2f43"
                strokeDasharray="3 5"
                strokeWidth={0.7}
              />
              <text x={M.left - 8} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {xTicks.map(v => (
            <g key={`xt-${v}`}>
              <line
                x1={xScale(v)}
                x2={xScale(v)}
                y1={M.top}
                y2={M.top + IH}
                stroke="#162638"
                strokeDasharray="3 5"
                strokeWidth={0.7}
              />
              <text
                x={xScale(v)}
                y={M.top + IH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {(v / 1000).toFixed(1)}
              </text>
            </g>
          ))}
          <text x={M.left} y={M.top - 10} fontSize="10" fontWeight="600" fill="#cbd5e1">
            Altitude (m AMSL)
          </text>
          <text x={M.left + IW / 2} y={VIEW_H - 6} fontSize="10" fontWeight="600" fill="#cbd5e1" textAnchor="middle">
            Distance (km)
          </text>

          {/* Terrain */}
          <path d={terrainPath} fill="url(#cp-terrain)" stroke="rgba(148,163,184,0.5)" strokeWidth={1.5} />

          {/* Clutter overlay */}
          {showClutter && clutterHeight > 0 && terrainSeries.length >= 2 && (
            <path
              d={terrainSeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y + clutterHeight)}`)
                .concat([
                  `L ${xScale(terrainSeries[terrainSeries.length - 1].x)} ${yScale(terrainSeries[terrainSeries.length - 1].y)}`,
                  `L ${xScale(terrainSeries[0].x)} ${yScale(terrainSeries[0].y)} Z`,
                ])
                .join(' ')}
              fill="rgba(251,146,60,0.18)"
              stroke="rgba(251,146,60,0.5)"
              strokeWidth={0.8}
            />
          )}

          {/* Beam cone — gradient with glow */}
          {showBeam && (
            <path
              d={`M ${towerX} ${antennaY} L ${nearImpact.x} ${nearImpact.y} L ${farImpact.x} ${farImpact.y} Z`}
              fill="url(#cp-beam)"
              filter="url(#cp-beam-glow)"
              stroke={`${color}aa`}
              strokeWidth={1}
              className="transition-all duration-700"
            />
          )}

          {/* Tilt edge lines */}
          {showTiltLines && (
            <>
              <line x1={towerX} y1={antennaY} x2={nearImpact.x} y2={nearImpact.y}
                stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
              <line x1={towerX} y1={antennaY} x2={farImpact.x} y2={farImpact.y}
                stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
            </>
          )}

          {/* Main beam axis */}
          {showBeam && (
            <line x1={towerX} y1={antennaY} x2={mainImpact.x} y2={mainImpact.y}
              stroke={color} strokeWidth={2.5} />
          )}

          {/* Ground footprint coloured by zone */}
          {showFootprint && (
            <>
              <line x1={towerX} y1={groundY + 5} x2={nearImpact.x} y2={groundY + 5}
                stroke={nearZone.color} strokeWidth={5} strokeLinecap="round" opacity={0.7} />
              <line x1={nearImpact.x} y1={groundY + 5} x2={mainImpact.x} y2={groundY + 5}
                stroke={mainZone.color} strokeWidth={5} strokeLinecap="round" opacity={0.7} />
              <line x1={mainImpact.x} y1={groundY + 5} x2={farImpact.x} y2={groundY + 5}
                stroke={farZone.color} strokeWidth={5} strokeLinecap="round" opacity={0.7} />
            </>
          )}

          {/* Pylon (lattice tower) */}
          <path
            d={`M ${towerX - 8} ${groundY} L ${towerX - 4} ${antennaY} L ${towerX + 4} ${antennaY} L ${towerX + 8} ${groundY} Z`}
            fill="rgba(15,23,42,0.8)"
            stroke="rgba(51,65,85,0.9)"
            strokeWidth={1}
          />
          <line x1={towerX} y1={groundY} x2={towerX} y2={antennaY} stroke="rgba(96,165,250,0.45)" strokeWidth={1.5} />
          {[0.2, 0.4, 0.6, 0.8].map(p => {
            const yy = groundY - (groundY - antennaY) * p;
            const xw = 8 - 4 * p;
            return (
              <line key={p}
                x1={towerX - xw} y1={yy} x2={towerX + xw} y2={yy}
                stroke="rgba(71,85,105,0.6)" strokeWidth={0.6} />
            );
          })}
          {/* Antenna head */}
          <circle cx={towerX} cy={antennaY} r={7} fill={`${color}33`} stroke={color} strokeWidth={1} />
          <path d={`M ${towerX} ${antennaY - 8} L ${towerX + 8} ${antennaY} L ${towerX} ${antennaY + 8} Z`}
            fill={color} />
          <line x1={towerX + 5} y1={antennaY - 3} x2={towerX + 5} y2={antennaY + 3} stroke="#fff" strokeWidth={1} />

          {/* Site info overlay inside chart */}
          <g transform={`translate(${M.left + 10}, ${M.top + 8})`}>
            <rect width="150" height="74" rx="8" fill="rgba(2,6,23,0.82)" stroke="rgba(51,65,85,0.6)" />
            <text x="10" y="20" fontSize="10" fontWeight="700" fill="#34d399">{siteName}{sectorName ? ` · ${sectorName}` : ''}</text>
            <text x="10" y="36" fontSize="9" fill="#94a3b8">
              Height (AGL): <tspan fill="#fff" fontWeight="700">{antennaHeight}m</tspan>
            </text>
            <text x="10" y="50" fontSize="9" fill="#94a3b8">
              Mech. Tilt: <tspan fill="#fff" fontWeight="700">{mechanicalTilt}°</tspan>
              {electricalTilt ? <tspan fill="#94a3b8"> · Elec: <tspan fill="#fff" fontWeight="700">{electricalTilt}°</tspan></tspan> : null}
            </text>
            <text x="10" y="64" fontSize="9" fill="#94a3b8">
              Azimuth: <tspan fill="#fff" fontWeight="700">{azimut ?? '—'}°</tspan>
            </text>
          </g>

          {/* Main beam impact callout */}
          <line x1={mainImpact.x} y1={antennaY + 8} x2={mainImpact.x} y2={groundY}
            stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
          <circle cx={mainImpact.x} cy={groundY} r={6} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${Math.min(mainImpact.x - 60, M.left + IW - 130)}, ${Math.max(antennaY - 50, M.top + 4)})`}>
            <rect width="130" height="38" rx="6" fill="#0b1728" stroke="#14532d" />
            <text x="10" y="16" fontSize="11" fontWeight="700" fill="#22c55e">Main Beam Impact</text>
            <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.mainDist / 1000).toFixed(2)} km</text>
          </g>

          {/* Coverage end callout */}
          <line x1={farImpact.x} y1={antennaY + 8} x2={farImpact.x} y2={groundY}
            stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
          <circle cx={farImpact.x} cy={groundY} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${Math.min(farImpact.x - 50, M.left + IW - 110)}, ${Math.max(antennaY + 4, M.top + 50)})`}>
            <rect width="110" height="38" rx="6" fill="#0b1728" stroke="#7f1d1d" />
            <text x="10" y="16" fontSize="11" fontWeight="700" fill="#ef4444">Coverage End</text>
            <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.farDist / 1000).toFixed(2)} km</text>
          </g>

          {/* RSRP legend top-right */}
          <g transform={`translate(${M.left + IW - 150}, ${M.top + 6})`}>
            <rect width="146" height="78" rx="8" fill="rgba(11,23,40,0.85)" stroke="rgba(255,255,255,0.08)" />
            <text x="10" y="16" fontSize="10" fontWeight="700" fill="#cbd5e1">Signal Level (RSRP)</text>
            {[
              { c: '#22c55e', l: '> -85 dBm' },
              { c: '#eab308', l: '-85 to -100 dBm' },
              { c: '#f97316', l: '-100 to -115 dBm' },
              { c: '#ef4444', l: '< -115 dBm' },
            ].map((r, i) => (
              <g key={r.l} transform={`translate(10, ${28 + i * 12})`}>
                <rect width="10" height="8" fill={r.c} rx="2" />
                <text x="16" y="7" fontSize="9" fill="#94a3b8">{r.l}</text>
              </g>
            ))}
          </g>
        </svg>

        {/* Coverage zone segmented bar (Near/Main/Far) under chart */}
        <div className="absolute left-[6.4%] right-[2.8%] bottom-0 flex text-[9px] font-bold uppercase tracking-wider pointer-events-none">
          {(() => {
            const total = Math.max(1, geom.farDist);
            const fNear = (geom.nearDist / total) * 100;
            const fMain = ((geom.mainDist - geom.nearDist) / total) * 100;
            const fFar = ((geom.farDist - geom.mainDist) / total) * 100;
            return (
              <>
                <div style={{ width: `${fNear}%` }} className="text-cyan-300 text-center">
                  ← Near Field<br /><span className="text-white/40 normal-case font-mono">0 – {(geom.nearDist / 1000).toFixed(2)} km</span>
                </div>
                <div style={{ width: `${fMain}%` }} className="text-emerald-300 text-center">
                  ← Main Coverage →<br /><span className="text-white/40 normal-case font-mono">{(geom.nearDist / 1000).toFixed(2)} – {(geom.mainDist / 1000).toFixed(2)} km</span>
                </div>
                <div style={{ width: `${fFar}%` }} className="text-orange-300 text-center">
                  Far Coverage →<br /><span className="text-white/40 normal-case font-mono">{(geom.mainDist / 1000).toFixed(2)} – {(geom.farDist / 1000).toFixed(2)} km</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Bottom summary panels removed per user request */}

    </div>
  );
};

// ── Sub-components ──
const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
      value ? 'text-white bg-white/10' : 'text-white/45 hover:text-white/70'
    }`}
  >
    <span className={`w-3 h-3 rounded-[3px] flex items-center justify-center text-[9px] font-bold ${
      value ? 'bg-emerald-500 text-white' : 'bg-white/10'
    }`}>{value ? '✓' : ''}</span>
    {label}
  </button>
);

const Row: React.FC<{ k: string; v: string; mono?: boolean; accent?: boolean; good?: boolean }> = ({ k, v, mono, accent, good }) => (
  <div className="flex items-baseline justify-between gap-2 truncate">
    <span className="text-white/45 truncate">{k}</span>
    <span className={`font-bold truncate ${mono ? 'font-mono' : ''} ${
      good ? 'text-emerald-300' : accent ? 'text-amber-300' : 'text-white/85'
    }`}>{v}</span>
  </div>
);

const SigRow: React.FC<{ label: string; rsrp: number }> = ({ label, rsrp }) => {
  const cls = rsrpClass(rsrp);
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className="font-mono font-bold" style={{ color: cls.color }}>{rsrp.toFixed(0)} dBm</span>
    </div>
  );
};

const LegendItem: React.FC<{ dot: string; color: string; label: string; dashed?: boolean }> = ({ dot, color, label, dashed }) => (
  <li className="flex items-center gap-1.5">
    <span className="w-3 text-center font-bold" style={{ color, opacity: dashed ? 0.7 : 1 }}>{dot}</span>
    <span className="text-white/70">{label}</span>
  </li>
);

const SectorIndicator: React.FC<{ azimuth: number; hbw: number; color: string }> = ({ azimuth, hbw, color }) => {
  const r = 28;
  const half = hbw / 2;
  const a1 = ((azimuth - half - 90) * Math.PI) / 180;
  const a2 = ((azimuth + half - 90) * Math.PI) / 180;
  const x1 = 30 + r * Math.cos(a1);
  const y1 = 30 + r * Math.sin(a1);
  const x2 = 30 + r * Math.cos(a2);
  const y2 = 30 + r * Math.sin(a2);
  const large = hbw > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 60 60" width="60" height="60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1="30" y1="2" x2="30" y2="6" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <text x="30" y="11" fontSize="6" fill="rgba(255,255,255,0.4)" textAnchor="middle">N</text>
      <path d={`M 30 30 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
        fill={`${color}55`} stroke={color} strokeWidth="1" />
      <circle cx="30" cy="30" r="2" fill={color} />
    </svg>
  );
};

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / Math.pow(10, exp);
  let nice: number;
  if (f < 1.5) nice = 1;
  else if (f < 3) nice = 2;
  else if (f < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

export default CoverageProfile;
