import React from 'react';
import { LOSAnalysis, FresnelAnalysis, AzimuthSector } from '@/utils/geodesicUtils';
import {
  CheckCircle, XCircle, Radio, Compass, ArrowUpDown, Ruler,
  Mountain, Signal, Target, CircleDot, AlertTriangle
} from 'lucide-react';

interface SiteInfo {
  name: string;
  techno: string;
  bande: string;
  azimuth: number;
  hba: number;
  tilt: number;
}

interface Props {
  site: SiteInfo;
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

const InfoPanel: React.FC<Props> = ({ site, analysis, totalDistance, enableCurvature, fresnel }) => {
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

      {/* Azimuth sector badge — glass */}
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

      {/* Fresnel status — glass */}
      {fresnel && (
        <div
          className="flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 hover:scale-[1.01]"
          style={{
            background: fresnel.isClearFresnel ? 'rgba(56,189,248,0.06)' : 'rgba(251,191,36,0.08)',
            borderColor: fresnel.isClearFresnel ? 'rgba(56,189,248,0.15)' : 'rgba(251,191,36,0.2)',
            backdropFilter: 'blur(8px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {fresnel.isClearFresnel
            ? <CircleDot className="w-4 h-4 text-sky-400 shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          }
          <div>
            <div className={`text-[11px] font-bold ${fresnel.isClearFresnel ? 'text-sky-400' : 'text-amber-400'}`}>
              {fresnel.isClearFresnel ? 'Fresnel F1 dégagé' : `Intrusion Fresnel: ${fresnel.maxIntrusionPercent}%`}
            </div>
            <div className="text-[10px] text-white/35">
              {fresnel.isClearFresnel
                ? `Intrusion max: ${fresnel.maxIntrusionPercent}% (<40%)`
                : `Seuil 40% dépassé — dégradation signal`
              }
            </div>
          </div>
        </div>
      )}

      {/* Site Info — glass card */}
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
          <Radio className="w-3 h-3 text-sky-400" /> Infos Site
        </h4>
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Site" value={site.name} accent />
        <InfoRow icon={<Signal className="w-3 h-3" />} label="Techno" value={`${site.techno} — ${site.bande}`} />
        <InfoRow icon={<Compass className="w-3 h-3" />} label="Azimuth antenne" value={`${site.azimuth}°`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="HBA" value={`${site.hba} m`} />
        <InfoRow icon={<ArrowUpDown className="w-3 h-3" />} label="Tilt" value={`${site.tilt}°`} />
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
