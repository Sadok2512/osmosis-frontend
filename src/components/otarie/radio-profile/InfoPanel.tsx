import React from 'react';
import { LOSAnalysis, FresnelAnalysis, AzimuthSector } from '@/utils/geodesicUtils';
import {
  CheckCircle, XCircle, Radio, Compass, ArrowUpDown, Ruler,
  Mountain, Signal, Target, CircleDot, AlertTriangle, Antenna, User
} from 'lucide-react';

interface Props {
  analysis: LOSAnalysis;
  totalDistance: number;
  enableCurvature: boolean;
  fresnel?: FresnelAnalysis | null;
}

const azimuthSectorLabel: Record<AzimuthSector, { label: string; color: string; bg: string }> = {
  'in-sector': { label: 'Dans le secteur (<30°)', color: 'text-emerald-400', bg: 'rgba(52,211,153,0.1)' },
  'edge-sector': { label: 'Bord de secteur (30°–60°)', color: 'text-amber-400', bg: 'rgba(251,191,36,0.1)' },
  'outside-sector': { label: 'Hors secteur (>60°)', color: 'text-red-400', bg: 'rgba(248,113,113,0.1)' },
};

const InfoPanel: React.FC<Props> = ({ analysis, totalDistance, enableCurvature, fresnel }) => {
  const ant = analysis.antennaParams;

  const InfoRow = ({ icon, label, value, accent, warn }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; warn?: boolean }) => (
    <div className="flex items-center gap-2.5 py-1.5 group">
      <span className="text-white/30 group-hover:text-white/50 transition-colors">{icon}</span>
      <span className="text-[11px] text-white/50 flex-1">{label}</span>
      <span className={`text-[11px] font-semibold ${warn ? 'text-red-400' : accent ? 'text-sky-400' : 'text-white/80'}`}>{value}</span>
    </div>
  );

  const sectorInfo = azimuthSectorLabel[analysis.azimuthSector];

  return (
    <div className="space-y-3 text-sm">
      {/* LOS Status — glass card */}
      <div
        className="flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-300 hover:scale-[1.01]"
        style={{
          background: analysis.isLOS ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
          borderColor: analysis.isLOS ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
          backdropFilter: 'blur(8px)',
          boxShadow: analysis.isLOS
            ? '0 0 20px rgba(52,211,153,0.05), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 0 20px rgba(248,113,113,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {analysis.isLOS
          ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          : <XCircle className="w-5 h-5 text-red-400 shrink-0" />
        }
        <div>
          <div className={`text-[12px] font-bold ${analysis.isLOS ? 'text-emerald-400' : 'text-red-400'}`}>
            {analysis.isLOS ? 'LOS — Ligne de Vue Dégagée' : 'NLOS — Obstruction Détectée'}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {analysis.isLOS
              ? `Dégagement min: ${analysis.clearanceMin.toFixed(1)} m`
              : `Obstruction à ${(analysis.obstructionDistance! / 1000).toFixed(2)} km — alt. ${analysis.obstructionAltitude?.toFixed(0)} m`
            }
          </div>
        </div>
      </div>

      {/* Azimuth sector badge */}
      <div
        className="flex items-center gap-2.5 p-3 rounded-2xl border transition-all duration-300 hover:scale-[1.01]"
        style={{
          background: sectorInfo.bg,
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <Target className={`w-4 h-4 ${sectorInfo.color} shrink-0`} />
        <span className={`text-[11px] font-bold ${sectorInfo.color}`}>{sectorInfo.label}</span>
        <span className="ml-auto text-[10px] text-white/40 font-mono">ΔAz: {analysis.deltaAzimuth}°</span>
      </div>

      {/* Antenna Pattern Loss badge */}
      {analysis.patternLossTotal > 0 && (
        <div
          className="flex items-center gap-2.5 p-3 rounded-2xl border transition-all duration-300 hover:scale-[1.01]"
          style={{
            background: analysis.patternLossTotal > 10 ? 'rgba(248,113,113,0.08)' : 'rgba(56,189,248,0.06)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Signal className={`w-4 h-4 ${analysis.patternLossTotal > 10 ? 'text-red-400' : 'text-sky-400'} shrink-0`} />
          <div className="flex-1">
            <div className={`text-[11px] font-bold ${analysis.patternLossTotal > 10 ? 'text-red-400' : 'text-sky-400'}`}>
              Pattern Loss: {analysis.patternLossTotal} dB
            </div>
            <div className="text-[10px] text-white/35">
              H: {analysis.patternLossH} dB | V: {analysis.patternLossV} dB
            </div>
          </div>
        </div>
      )}

      {/* Fresnel status */}
      {fresnel && (() => {
        const pct = fresnel.maxIntrusionPercent;
        const isClear = fresnel.isClearFresnel;
        const isCritical = !isClear && pct > 100;
        const isWarning = !isClear && !isCritical;
        const bgColor = isClear ? 'rgba(56,189,248,0.06)' : isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.08)';
        const borderColor = isClear ? 'rgba(56,189,248,0.15)' : isCritical ? 'rgba(239,68,68,0.35)' : 'rgba(251,191,36,0.2)';
        const textColor = isClear ? 'text-sky-400' : isCritical ? 'text-red-400' : 'text-amber-400';
        const iconColor = isClear ? 'text-sky-400' : isCritical ? 'text-red-400' : 'text-amber-400';
        return (
          <div
            className="flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 hover:scale-[1.01]"
            style={{
              background: bgColor,
              borderColor,
              backdropFilter: 'blur(8px)',
              boxShadow: isCritical
                ? '0 0 16px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.04)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {isClear
              ? <CircleDot className={`w-4 h-4 ${iconColor} shrink-0`} />
              : <AlertTriangle className={`w-5 h-5 ${iconColor} shrink-0 ${isCritical ? 'animate-pulse' : ''}`} />
            }
            <div className="flex-1">
              <div className={`font-bold ${textColor} ${isCritical ? 'text-[13px]' : 'text-[11px]'}`}>
                {isClear ? 'Fresnel F1 dégagé' : `Intrusion Fresnel: ${pct}%`}
              </div>
              <div className="text-[10px] text-white/40">
                {isClear
                  ? `Intrusion max: ${pct}% (<40%)`
                  : isCritical
                    ? `⛔ Obstruction majeure — liaison fortement dégradée`
                    : `Seuil 40% dépassé — dégradation signal`
                }
              </div>
            </div>
          </div>
        );
      })()}

      {/* Antenna Info — glass card */}
      <div
        className="rounded-2xl p-3.5 space-y-0.5 border transition-all duration-300 hover:scale-[1.005]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <h4 className="text-[10px] font-bold text-white/60 mb-2 flex items-center gap-2 uppercase tracking-widest">
          <Radio className="w-3 h-3 text-sky-400" /> Antenne & Site
        </h4>
        <InfoRow icon={<Compass className="w-3 h-3" />} label="Azimuth antenne" value={`${ant.azimuth}°`} />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Alt. terrain site (DEM)" value={`${ant.siteAltitude.toFixed(0)} m`} accent />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="HBA (AGL)" value={`${ant.hba} m`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Alt. antenne (AMSL)" value={`${ant.antennaAMSL.toFixed(0)} m`} accent />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Tilt mécanique" value={`${ant.mechTilt}°`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Tilt électrique" value={`${ant.elecTilt}°`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Tilt total" value={`${ant.totalTilt}°`} accent />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="HBW" value={`${ant.hbw}°`} />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="VBW" value={`${ant.vbw}°`} />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Front-to-Back" value={`${ant.frontToBackRatio} dB`} />
        <InfoRow icon={<User className="w-3 h-3" />} label="Hauteur UE (Rx)" value={`${ant.rxHeight} m`} />
      </div>

      {/* Metrics — glass card */}
      <div
        className="rounded-2xl p-3.5 space-y-0.5 border transition-all duration-300 hover:scale-[1.005]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <h4 className="text-[10px] font-bold text-white/60 mb-2 flex items-center gap-2 uppercase tracking-widest">
          <Ruler className="w-3 h-3 text-sky-400" /> Métriques RF
        </h4>
        <InfoRow icon={<Ruler className="w-3 h-3" />} label="Distance" value={`${(totalDistance / 1000).toFixed(2)} km`} accent />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Alt. terrain max" value={`${analysis.maxTerrainAlt} m`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="Azimuth segment" value={`${analysis.segmentAzimuth}°`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="ΔAzimuth" value={`${analysis.deltaAzimuth}°`} />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Dégagement min" value={`${analysis.clearanceMin.toFixed(1)} m`} warn={analysis.clearanceMin < 0} />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Pattern Loss H" value={`${analysis.patternLossH} dB`} warn={analysis.patternLossH > 10} />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Pattern Loss V" value={`${analysis.patternLossV} dB`} warn={analysis.patternLossV > 10} />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Pattern Loss total" value={`${analysis.patternLossTotal} dB`} warn={analysis.patternLossTotal > 10} />
        <InfoRow icon={<Mountain className="w-3 h-3" />} label="Courbure terrestre" value={enableCurvature ? 'k=4/3' : 'Désactivée'} />
        {!analysis.isLOS && (
          <InfoRow icon={<XCircle className="w-3 h-3" />} label="Obstruction à" value={`${(analysis.obstructionDistance! / 1000).toFixed(2)} km`} warn />
        )}
        {fresnel && (
          <InfoRow icon={<CircleDot className="w-3 h-3" />} label="Intrusion Fresnel" value={`${fresnel.maxIntrusionPercent}%`} warn={!fresnel.isClearFresnel} />
        )}
      </div>
    </div>
  );
};

export default InfoPanel;
