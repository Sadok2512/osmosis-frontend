/**
 * CoverageProfile — antenna-to-ground cellular coverage view.
 *
 * Renders a side-elevation chart showing:
 *   • the tower at the left
 *   • the antenna's main beam axis and vertical 3 dB cone
 *   • the ground footprint where the beam meets terrain
 *   • near / main / far impact distances
 *
 * Distinct from ProfileChart, which draws a site-to-site microwave link
 * (LOS + Fresnel between two antennas). This view is for cellular sectors.
 *
 * Engineering model (simplified, side-view only, ignoring earth curvature):
 *   totalTilt           = mechanicalTilt + electricalTilt              [deg]
 *   mainBeamGroundDist  = antennaHeight / tan(totalTilt)               [m]
 *   farEdgeDist         = antennaHeight / tan(totalTilt - vbw/2)       [m]
 *   nearEdgeDist        = antennaHeight / tan(totalTilt + vbw/2)       [m]
 *
 * Each angle is clamped to a SAFE_MIN_DEG floor to avoid divide-by-zero
 * and the resulting distances are clamped to a band-aware max so a near-zero
 * tilt doesn't paint coverage off to infinity.
 */
import React, { useMemo } from 'react';
import type { ProfilePoint } from '@/utils/geodesicUtils';

export interface CoverageProfileProps {
  siteName: string;
  sectorName?: string;
  /** Antenna azimuth in degrees (0 = North, clockwise). Used in label only here. */
  azimut?: number;
  /** Antenna height above ground level in meters. */
  antennaHeight: number;
  mechanicalTilt: number;
  electricalTilt: number;
  /** e.g. "LTE1800", "NR3500", "GSM900". */
  band: string;
  /** "2G" / "3G" / "4G" / "5G" — drives color coding. */
  techno: string;
  /** Horizontal 3 dB beamwidth (deg). Default 65°. */
  hbw?: number;
  /** Vertical 3 dB beamwidth (deg). Default depends on band. */
  vbw?: number;
  /** Optional terrain profile sampled along the beam direction. */
  terrainProfile?: ProfilePoint[];
  /** Site altitude AMSL (m). Used as a Y baseline if no terrainProfile. */
  siteAltitudeAmsl?: number;
  /** Display toggles. */
  showBeam?: boolean;
  showFootprint?: boolean;
  showTiltLines?: boolean;
  showClutter?: boolean;
  clutterHeight?: number;
}

const SAFE_MIN_DEG = 0.5;
const TWO_PI = Math.PI * 2;
const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function technoColor(techno: string): string {
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G') || t.startsWith('NR')) return '#27AE60';
  if (t.includes('4G') || t.includes('LTE')) return '#F39C12';
  if (t.includes('3G') || t.includes('UMTS') || t.includes('WCDMA')) return '#3498DB';
  if (t.includes('2G') || t.includes('GSM')) return '#8E44AD';
  return '#94a3b8';
}

/** Band-aware ground-coverage cap (m). Low bands carry farther, high bands shorter. */
function bandMaxDistance(band: string, techno: string): number {
  const b = String(band || '').toUpperCase().replace(/\s+/g, '');
  // 5G mmWave / 3500
  if (b.includes('3500') || b.includes('NR3500') || b.includes('N78')) return 1500;
  // 2600 (4G B7)
  if (b.includes('2600') || b.includes('B7')) return 1800;
  // 2100 (LTE/UMTS/NR)
  if (b.includes('2100') || b === 'B1' || b.includes('NR2100')) return 2500;
  // 1800 (LTE/GSM)
  if (b.includes('1800') || b.includes('B3') || b.includes('DCS')) return 3000;
  // 900 / 800 / 700 — low bands, long reach
  if (b.includes('900') || b.includes('B8')) return 5000;
  if (b.includes('800') || b.includes('B20')) return 6500;
  if (b.includes('700') || b.includes('B28') || b.includes('NR700')) return 7000;
  // Fallback by techno
  const t = String(techno || '').toUpperCase();
  if (t.includes('5G')) return 1500;
  if (t.includes('4G')) return 3000;
  if (t.includes('3G')) return 4000;
  if (t.includes('2G')) return 6000;
  return 3000;
}

/** Default vertical beamwidth (deg) when not provided per cell. */
function defaultVbw(band: string, techno: string): number {
  const b = String(band || '').toUpperCase();
  if (b.includes('3500') || b.includes('NR3500')) return 6;
  if (String(techno).toUpperCase().includes('5G')) return 6;
  return 7;
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
  terrainProfile,
  siteAltitudeAmsl,
  showBeam = true,
  showFootprint = true,
  showTiltLines = true,
  showClutter = false,
  clutterHeight = 10,
}) => {
  const color = technoColor(techno);
  const vbwEff = vbw ?? defaultVbw(band, techno);

  const geom = useMemo(() => {
    const totalTilt = mechanicalTilt + electricalTilt;
    const mainAngle = Math.max(SAFE_MIN_DEG, totalTilt);
    const farAngle = Math.max(SAFE_MIN_DEG, totalTilt - vbwEff / 2);
    const nearAngle = Math.max(SAFE_MIN_DEG, totalTilt + vbwEff / 2);

    const cap = bandMaxDistance(band, techno);
    const mainDist = clamp(antennaHeight / tanDeg(mainAngle), 0, cap);
    const farDist = clamp(antennaHeight / tanDeg(farAngle), 0, cap);
    const nearDist = clamp(antennaHeight / tanDeg(nearAngle), 0, cap);

    return {
      totalTilt,
      mainAngle,
      farAngle,
      nearAngle,
      mainDist,
      farDist,
      nearDist,
      cap,
    };
  }, [mechanicalTilt, electricalTilt, antennaHeight, band, techno, vbwEff]);

  // ── Chart frame in SVG units ──
  const VIEW_W = 1100;
  const VIEW_H = 430;
  const M = { top: 30, right: 50, bottom: 50, left: 70 };
  const IW = VIEW_W - M.left - M.right;
  const IH = VIEW_H - M.top - M.bottom;

  // X domain: 0 .. xMax (slightly larger than far edge for headroom)
  const xMaxDomain = Math.max(1, geom.farDist) * 1.1;
  // Y domain: from (terrain min) up to (antenna AMSL + 20m headroom)
  const groundBaseAmsl = siteAltitudeAmsl ?? 0;
  const antennaAmsl = groundBaseAmsl + antennaHeight;

  const terrainSeries = useMemo<{ x: number; y: number }[]>(() => {
    // If a real terrain profile is provided, sample it; else fall back to a
    // flat ground at the site's base altitude. The flat fallback keeps the
    // chart readable without a terrain fetch.
    if (terrainProfile && terrainProfile.length >= 2) {
      return terrainProfile.map(p => ({ x: p.distance, y: p.elevation }));
    }
    return [
      { x: 0, y: groundBaseAmsl },
      { x: xMaxDomain, y: groundBaseAmsl },
    ];
  }, [terrainProfile, groundBaseAmsl, xMaxDomain]);

  const yMin = Math.min(groundBaseAmsl, ...terrainSeries.map(p => p.y));
  const yMaxRaw = Math.max(antennaAmsl + 20, ...terrainSeries.map(p => p.y));
  const yMax = yMaxRaw + 5;
  const ySpan = Math.max(1, yMax - yMin);

  const xScale = (d: number) => M.left + (d / xMaxDomain) * IW;
  const yScale = (a: number) => M.top + IH - ((a - yMin) / ySpan) * IH;

  const towerX = xScale(0);
  const groundY = yScale(groundBaseAmsl);
  const antennaY = yScale(antennaAmsl);

  // Beam impact points on the ground line. We use the ground baseline at the
  // tower's altitude here; with a real terrain series we'd intersect the beam
  // ray with the terrain — that lands in Phase 6 (terrain obstruction).
  const nearImpact = { x: xScale(geom.nearDist), y: yScale(groundBaseAmsl) };
  const mainImpact = { x: xScale(geom.mainDist), y: yScale(groundBaseAmsl) };
  const farImpact = { x: xScale(geom.farDist), y: yScale(groundBaseAmsl) };

  // Terrain area path
  const terrainPath = useMemo(() => {
    if (terrainSeries.length < 2) return '';
    const pts = terrainSeries.map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' L ');
    const first = `${xScale(terrainSeries[0].x)},${yScale(yMin)}`;
    const last = `${xScale(terrainSeries[terrainSeries.length - 1].x)},${yScale(yMin)}`;
    return `M ${first} L ${pts} L ${last} Z`;
  }, [terrainSeries, xScale, yScale, yMin]);

  // ── Y axis ticks ──
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
    for (let v = 0; v <= xMaxDomain; v += step) ticks.push(v);
    return ticks;
  }, [xMaxDomain]);

  // Coverage segments for legend strip
  const seg = {
    nearEnd: geom.nearDist,
    mainEnd: geom.mainDist,
    farEnd: geom.farDist,
  };

  return (
    <div className="w-full h-full flex flex-col">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full flex-1 min-h-0"
        style={{ background: 'transparent' }}
      >
        {/* ── Grid ── */}
        {yTicks.map(v => (
          <g key={`yt-${v}`}>
            <line
              x1={M.left}
              x2={M.left + IW}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="#24364c"
              strokeDasharray="3 4"
              strokeWidth={0.7}
            />
            <text x={M.left - 8} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {Math.round(v)}m
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
              stroke="#1d2f43"
              strokeDasharray="3 4"
              strokeWidth={0.7}
            />
            <text
              x={xScale(v)}
              y={M.top + IH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {(v / 1000).toFixed(v >= 1000 ? 2 : 2)}km
            </text>
          </g>
        ))}

        {/* Axes labels */}
        <text x={M.left} y={M.top - 12} fontSize="10" fontWeight="600" fill="#cbd5e1">
          Altitude (m AMSL)
        </text>
        <text x={M.left + IW / 2} y={VIEW_H - 8} fontSize="10" fontWeight="600" fill="#cbd5e1" textAnchor="middle">
          Distance from antenna (km)
        </text>

        {/* ── Terrain ── */}
        <path d={terrainPath} fill="rgba(54,116,181,0.3)" stroke="#7aaedf" strokeWidth={1.2} />

        {/* ── Clutter overlay (if enabled) ── */}
        {showClutter && clutterHeight > 0 && (
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

        {/* ── Beam cone (between far and near edges) ── */}
        {showBeam && (
          <path
            d={`M ${towerX} ${antennaY} L ${nearImpact.x} ${nearImpact.y} L ${farImpact.x} ${farImpact.y} Z`}
            fill={`${color}33`}
            stroke={`${color}88`}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        {/* ── Tilt edge lines (near & far) ── */}
        {showTiltLines && (
          <>
            <line
              x1={towerX}
              y1={antennaY}
              x2={nearImpact.x}
              y2={nearImpact.y}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.7}
            />
            <line
              x1={towerX}
              y1={antennaY}
              x2={farImpact.x}
              y2={farImpact.y}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.7}
            />
          </>
        )}

        {/* ── Main beam axis ── */}
        {showBeam && (
          <line
            x1={towerX}
            y1={antennaY}
            x2={mainImpact.x}
            y2={mainImpact.y}
            stroke={color}
            strokeWidth={2.4}
          />
        )}

        {/* ── Ground footprint segment ── */}
        {showFootprint && (
          <>
            <line
              x1={nearImpact.x}
              y1={groundY + 4}
              x2={farImpact.x}
              y2={groundY + 4}
              stroke={color}
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.55}
            />
          </>
        )}

        {/* ── Tower ── */}
        <line x1={towerX} y1={groundY} x2={towerX} y2={antennaY} stroke="#dbeafe" strokeWidth={2.5} />
        <path
          d={`M ${towerX - 10} ${groundY} L ${towerX} ${antennaY} L ${towerX + 10} ${groundY}`}
          fill="none"
          stroke="#dbeafe"
          strokeWidth={1.2}
          opacity={0.6}
        />
        <circle cx={towerX} cy={antennaY} r={6} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text
          x={towerX + 10}
          y={antennaY - 8}
          fontSize="11"
          fontWeight="700"
          fill={color}
        >
          {antennaHeight}m
        </text>

        {/* ── Main beam impact callout ── */}
        <line
          x1={mainImpact.x}
          y1={antennaY + 8}
          x2={mainImpact.x}
          y2={groundY}
          stroke="#22c55e"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <circle cx={mainImpact.x} cy={groundY} r={6} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
        <g transform={`translate(${Math.min(mainImpact.x - 60, M.left + IW - 130)}, ${Math.max(antennaY - 50, M.top + 4)})`}>
          <rect width="130" height="38" rx="6" fill="#0b1728" stroke="#14532d" />
          <text x="10" y="16" fontSize="11" fontWeight="700" fill="#22c55e">Main beam impact</text>
          <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.mainDist / 1000).toFixed(2)} km</text>
        </g>

        {/* ── Coverage end (far edge) callout ── */}
        <line
          x1={farImpact.x}
          y1={antennaY + 8}
          x2={farImpact.x}
          y2={groundY}
          stroke="#ef4444"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <circle cx={farImpact.x} cy={groundY} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
        <g transform={`translate(${Math.min(farImpact.x - 50, M.left + IW - 110)}, ${Math.max(antennaY + 4, M.top + 50)})`}>
          <rect width="110" height="38" rx="6" fill="#0b1728" stroke="#7f1d1d" />
          <text x="10" y="16" fontSize="11" fontWeight="700" fill="#ef4444">Coverage end</text>
          <text x="10" y="30" fontSize="11" fill="#dbeafe">{(geom.farDist / 1000).toFixed(2)} km</text>
        </g>
      </svg>

      {/* Coverage segment legend strip */}
      <div className="px-2 py-1.5 flex items-center justify-between text-[11px] shrink-0">
        <span className="text-cyan-400 font-semibold">
          Near 0 – {(seg.nearEnd / 1000).toFixed(2)} km
        </span>
        <span className="text-emerald-400 font-semibold">
          Main {(seg.nearEnd / 1000).toFixed(2)} – {(seg.mainEnd / 1000).toFixed(2)} km
        </span>
        <span className="text-orange-400 font-semibold">
          Far {(seg.mainEnd / 1000).toFixed(2)} – {(seg.farEnd / 1000).toFixed(2)} km
        </span>
        <span className="text-white/50 font-mono">
          {techno} {band} • {antennaHeight}m • tilt {geom.totalTilt.toFixed(1)}° • az {azimut ?? '—'}°{' '}
          {sectorName ? `• ${sectorName}` : ''}
        </span>
      </div>
    </div>
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
// (TWO_PI was reserved for future polar-beam sketches; safe to drop later.)
void TWO_PI;
