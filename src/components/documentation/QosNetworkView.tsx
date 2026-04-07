import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers, Filter, ChevronDown, ChevronRight, AlertTriangle,
  Phone, Video, Gamepad2, Shield, Globe, Radio, Wifi, Cpu,
  Signal, Smartphone, Users, Hash, Zap, Activity, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { vendorBadge, vendorHex } from '@/constants/brandColors';
import { getApiUrl, getApiHeaders } from '@/lib/apiConfig';

/* ═══════════════════ TYPES ═══════════════════ */
interface SliceRecord {
  id: number;
  vendor: string;
  rat: string;
  group_id: string;
  dimension_key: string;
  snssai?: string;
  sst?: number;
  sst_label?: string;
  sd_hex?: string | null;
  label: string;
  gbr_label?: string;
  fiveqi_values: number[];
  fiveqi_src: string;
  pm_activity_pct?: number | null;
  dominant?: boolean;
  is_fwa?: boolean;
}

type DisplayMode = 'full' | 'qos_only' | 'slicing_only' | 'gbr_only';

/* ═══════════════════ CONSTANTS ═══════════════════ */
const GBR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GBR:       { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/25' },
  'Non-GBR': { bg: 'bg-blue-400/10',    text: 'text-blue-600',    border: 'border-blue-400/25' },
  Operator:  { bg: 'bg-pink-400/10',    text: 'text-pink-700',    border: 'border-pink-400/25' },
  URLLC:     { bg: 'bg-amber-400/10',   text: 'text-amber-700',   border: 'border-amber-400/25' },
  'N/A':     { bg: 'bg-muted/60',       text: 'text-muted-foreground', border: 'border-border/50' },
};

const SST_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  eMBB:  { bg: 'bg-blue-500/10',    text: 'text-blue-600',    icon: <Globe className="w-3 h-3" /> },
  URLLC: { bg: 'bg-amber-400/10',   text: 'text-amber-700',   icon: <Zap className="w-3 h-3" /> },
  MIoT:  { bg: 'bg-emerald-500/10', text: 'text-emerald-700', icon: <Cpu className="w-3 h-3" /> },
  V2X:   { bg: 'bg-purple-500/10',  text: 'text-purple-600',  icon: <Radio className="w-3 h-3" /> },
};

const GROUP_META: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  FLEX_QCI:              { label: 'QCI + ARP priority',    bg: 'bg-amber-500/8',   text: 'text-amber-700',   border: 'border-amber-500/15',  icon: <Hash className="w-3 h-3" /> },
  FLEX_ENDC_CATEGORY:    { label: 'EN-DC NSA category',   bg: 'bg-violet-500/8',  text: 'text-violet-600',  border: 'border-violet-500/15', icon: <Signal className="w-3 h-3" /> },
  FLEX_SUBSCRIBER_GROUP: { label: 'Subscriber group',     bg: 'bg-blue-500/8',    text: 'text-blue-600',    border: 'border-blue-500/15',   icon: <Users className="w-3 h-3" /> },
  FLEX_UE_CATEGORY:      { label: 'UE category',          bg: 'bg-amber-500/8',   text: 'text-amber-700',   border: 'border-amber-500/15',  icon: <Smartphone className="w-3 h-3" /> },
  FLEX_SPID:             { label: 'Service provider ID',  bg: 'bg-pink-500/8',    text: 'text-pink-600',    border: 'border-pink-500/15',   icon: <Shield className="w-3 h-3" /> },
  NR_SNSSAI:             { label: 'NR slices (S-NSSAI)',  bg: 'bg-violet-500/8',  text: 'text-violet-600',  border: 'border-violet-500/15', icon: <Layers className="w-3 h-3" /> },
  PMQAP:                 { label: 'LTE PMQAP profiles',   bg: 'bg-emerald-500/8', text: 'text-emerald-600', border: 'border-emerald-500/15',icon: <Activity className="w-3 h-3" /> },
  NR_NSSAI:              { label: 'NR NSSAI slices',      bg: 'bg-violet-500/8',  text: 'text-violet-600',  border: 'border-violet-500/15', icon: <Layers className="w-3 h-3" /> },
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  cm_dump:    { bg: 'bg-amber-500/10',   text: 'text-amber-700',        label: 'CM' },
  pm_derived: { bg: 'bg-emerald-500/10', text: 'text-emerald-700',      label: 'PM' },
  inferred:   { bg: 'bg-muted/60',       text: 'text-muted-foreground', label: 'INF' },
};

const GBR_QCI = new Set([1, 2, 3, 4]);
const URLLC_QCI = new Set([82, 83, 84]);
const OPERATOR_QCI = new Set([13, 14, 19, 20, 130]);

const QI_LABELS: Record<number, string> = {
  1:'Voice',2:'Video Live',3:'Gaming',4:'Video Buf',5:'IMS Signalling',6:'Video TCP',
  7:'Interactive',8:'TCP Premium',9:'Default Bearer',13:'Oper.13',14:'Oper.14',
  19:'Oper.19',20:'Oper.20',82:'AR/VR',83:'Automation',84:'URLLC',130:'Operator',
};

const SERVICE_ICONS: Record<number, React.ReactNode> = {
  1: <Phone className="w-3 h-3" />,
  2: <Video className="w-3 h-3" />,
  3: <Gamepad2 className="w-3 h-3" />,
  4: <Video className="w-3 h-3" />,
  5: <Shield className="w-3 h-3" />,
  6: <Video className="w-3 h-3" />,
  7: <Gamepad2 className="w-3 h-3" />,
  8: <Globe className="w-3 h-3" />,
  9: <Wifi className="w-3 h-3" />,
  82: <Cpu className="w-3 h-3" />,
  83: <Cpu className="w-3 h-3" />,
  84: <Zap className="w-3 h-3" />,
};

/* ═══════════════════ MOCK DATA ═══════════════════ */
const MOCK_RECORDS: SliceRecord[] = [
  { id:1, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=1,Arp=5', label:'VoLTE', gbr_label:'GBR', fiveqi_values:[1], fiveqi_src:'cm_dump', pm_activity_pct:95, dominant:true },
  { id:2, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=2,Arp=4', label:'Video Live Streaming', gbr_label:'GBR', fiveqi_values:[2], fiveqi_src:'cm_dump', pm_activity_pct:72 },
  { id:3, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=5,Arp=1', label:'IMS Signalling', gbr_label:'Non-GBR', fiveqi_values:[5], fiveqi_src:'cm_dump', pm_activity_pct:88 },
  { id:4, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=9,Arp=9', label:'Default Bearer', gbr_label:'Non-GBR', fiveqi_values:[9], fiveqi_src:'cm_dump', pm_activity_pct:99, dominant:true },
  { id:5, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=7,Arp=7', label:'Interactive Gaming', gbr_label:'Non-GBR', fiveqi_values:[7], fiveqi_src:'pm_derived', pm_activity_pct:45 },
  { id:6, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=6,Arp=6', label:'Video TCP Buffered', gbr_label:'Non-GBR', fiveqi_values:[6], fiveqi_src:'cm_dump', pm_activity_pct:60 },
  { id:7, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=8,Arp=8', label:'TCP Premium', gbr_label:'Non-GBR', fiveqi_values:[8], fiveqi_src:'cm_dump', pm_activity_pct:30 },
  { id:8, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_ENDC_CATEGORY', dimension_key:'ENDC_CAT=SA', label:'Standalone 5G', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'cm_dump', pm_activity_pct:80 },
  { id:9, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_ENDC_CATEGORY', dimension_key:'ENDC_CAT=NSA', label:'EN-DC NSA', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'cm_dump', pm_activity_pct:92 },
  { id:10, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_SUBSCRIBER_GROUP', dimension_key:'SubGrp=Enterprise', label:'Enterprise', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'inferred', pm_activity_pct:55 },
  { id:11, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_SUBSCRIBER_GROUP', dimension_key:'SubGrp=Consumer', label:'Consumer', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'inferred', pm_activity_pct:98 },
  { id:12, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-000001', snssai:'1-000001', sst:1, sst_label:'eMBB', label:'Default eMBB', fiveqi_values:[9,5,1], fiveqi_src:'cm_dump', dominant:true },
  { id:13, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-000002', snssai:'1-000002', sst:1, sst_label:'eMBB', label:'Enhanced eMBB', fiveqi_values:[9,7,6], fiveqi_src:'pm_derived' },
  { id:14, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'2-000001', snssai:'2-000001', sst:2, sst_label:'URLLC', label:'URLLC Core', fiveqi_values:[82,83,84], fiveqi_src:'cm_dump' },
  { id:15, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-999900', snssai:'1-999900', sst:1, sst_label:'eMBB', label:'FWA Broadband', fiveqi_values:[9], fiveqi_src:'cm_dump', is_fwa:true },
  { id:16, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'3-000001', snssai:'3-000001', sst:3, sst_label:'MIoT', label:'Massive IoT', fiveqi_values:[9], fiveqi_src:'inferred' },
  { id:17, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI1', label:'VoLTE Voice', gbr_label:'GBR', fiveqi_values:[1], fiveqi_src:'cm_dump', pm_activity_pct:97, dominant:true },
  { id:18, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI5', label:'IMS Signalling', gbr_label:'Non-GBR', fiveqi_values:[5], fiveqi_src:'cm_dump', pm_activity_pct:90 },
  { id:19, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI9', label:'Default Best Effort', gbr_label:'Non-GBR', fiveqi_values:[9], fiveqi_src:'cm_dump', pm_activity_pct:99, dominant:true },
  { id:20, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI6', label:'Video TCP', gbr_label:'Non-GBR', fiveqi_values:[6], fiveqi_src:'cm_dump', pm_activity_pct:65 },
  { id:21, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI8', label:'TCP Premium', gbr_label:'Non-GBR', fiveqi_values:[8], fiveqi_src:'pm_derived', pm_activity_pct:22 },
  { id:22, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-000001', snssai:'1-000001', sst:1, sst_label:'eMBB', label:'Default eMBB', fiveqi_values:[9,5,1], fiveqi_src:'cm_dump', dominant:true },
  { id:23, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-000003', snssai:'1-000003', sst:1, sst_label:'eMBB', label:'Premium eMBB', fiveqi_values:[9,7], fiveqi_src:'cm_dump' },
  { id:24, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'2-000001', snssai:'2-000001', sst:2, sst_label:'URLLC', label:'URLLC Mission Critical', fiveqi_values:[82,83], fiveqi_src:'cm_dump' },
  { id:25, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-999900', snssai:'1-999900', sst:1, sst_label:'eMBB', label:'FWA Fixed Wireless', fiveqi_values:[9], fiveqi_src:'cm_dump', is_fwa:true },
];

/* ═══════════════════ SUB-COMPONENTS ═══════════════════ */

const GbrBadge: React.FC<{ label: string }> = ({ label }) => {
  const c = GBR_COLORS[label] || GBR_COLORS['N/A'];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold border', c.bg, c.text, c.border)}>
      {label}
    </span>
  );
};

const SstBadge: React.FC<{ label: string }> = ({ label }) => {
  const c = SST_COLORS[label] || { bg: 'bg-muted', text: 'text-muted-foreground', icon: null };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold', c.bg, c.text)}>
      {c.icon}
      {label}
    </span>
  );
};

const SourceBadge: React.FC<{ source: string }> = ({ source }) => {
  const c = SOURCE_COLORS[source] || SOURCE_COLORS.inferred;
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium', c.bg, c.text)}>
      {c.label}
    </span>
  );
};

const QiPills: React.FC<{ values: number[] }> = ({ values }) => {
  if (!values.length) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {values.map(qi => {
        const isGbr = GBR_QCI.has(qi);
        const isUrllc = URLLC_QCI.has(qi);
        const isOp = OPERATOR_QCI.has(qi);
        const cls = isGbr ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
          : isUrllc ? 'bg-amber-400/10 text-amber-700 border-amber-400/20'
          : isOp ? 'bg-pink-400/10 text-pink-700 border-pink-400/20'
          : 'bg-blue-400/10 text-blue-600 border-blue-400/20';
        const icon = SERVICE_ICONS[qi];
        return (
          <span key={qi} className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold border', cls)} title={QI_LABELS[qi] || ''}>
            {icon}
            {qi}
          </span>
        );
      })}
    </div>
  );
};

const PmBar: React.FC<{ pct: number | null | undefined }> = ({ pct }) => {
  if (pct == null || pct === 0) return (
    <span className="text-[10px] text-muted-foreground/60 italic">CM only</span>
  );
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 75 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-[10px] font-semibold font-mono tabular-nums', textColor)}>{pct}%</span>
    </div>
  );
};

const DominantBadge = () => (
  <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 font-bold font-mono ml-1.5 ring-1 ring-amber-500/20">★ DOMINANT</span>
);

const FwaBadge = () => (
  <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-600 font-bold font-mono ml-1.5 ring-1 ring-violet-500/20">⟐ FWA</span>
);

const NoPmBadge = () => (
  <span className="text-[9px] px-2 py-0.5 rounded-md bg-red-500/8 text-red-600 ring-1 ring-red-500/15 ml-auto font-medium">no PM dim</span>
);

/* ═══════════════════ FILTER CHIP ═══════════════════ */
const FilterChip: React.FC<{ label: string; active: boolean; onClick: () => void; color?: string }> = ({ label, active, onClick, color }) => (
  <button
    onClick={onClick}
    className={cn(
      'text-[10px] px-3 py-1 rounded-full font-semibold transition-all border',
      active
        ? 'bg-foreground text-background border-foreground shadow-sm'
        : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
    )}
  >
    {color && active && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: color }} />}
    {label}
  </button>
);

/* ═══════════════════ SUMMARY STAT ═══════════════════ */
const StatCard: React.FC<{ label: string; value: string | number; sub?: string; icon: React.ReactNode }> = ({ label, value, sub, icon }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 min-w-[140px]">
    <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">{icon}</div>
    <div>
      <div className="text-lg font-black text-foreground tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60">{sub}</div>}
    </div>
  </div>
);

/* ═══════════════════ TABLE RENDERERS ═══════════════════ */

const LteTable: React.FC<{ records: SliceRecord[] }> = ({ records }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10">
        <tr className="bg-muted/30 backdrop-blur-sm">
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[4%]">#</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[28%]">Dimension Key</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[22%]">Service</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[10%]">Type</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[24%]">QCI / 5QI</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[12%]">PM Activity</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => {
          const serviceIcon = r.fiveqi_values.length > 0 ? SERVICE_ICONS[r.fiveqi_values[0]] : null;
          return (
            <tr key={r.id} className={cn(
              'group transition-colors border-b border-border/10',
              i % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
              r.dominant && 'bg-amber-500/[0.03]',
              'hover:bg-primary/[0.04]'
            )}>
              <td className="px-4 py-2.5 text-muted-foreground/60 font-mono text-[10px]">{i + 1}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-foreground text-[11px]">{r.dimension_key}</span>
                  {r.dominant && <DominantBadge />}
                  {r.is_fwa && <FwaBadge />}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {serviceIcon && <span className="text-muted-foreground/50">{serviceIcon}</span>}
                  <span className="text-foreground/80 font-medium">{r.label}</span>
                </div>
              </td>
              <td className="px-4 py-2.5"><GbrBadge label={r.gbr_label || 'N/A'} /></td>
              <td className="px-4 py-2.5"><QiPills values={r.fiveqi_values} /></td>
              <td className="px-4 py-2.5"><PmBar pct={r.pm_activity_pct} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const NrTable: React.FC<{ records: SliceRecord[] }> = ({ records }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10">
        <tr className="bg-muted/30 backdrop-blur-sm">
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[4%]">#</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[16%]">S-NSSAI</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[24%]">Label</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[12%]">SST</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[32%]">5QI Assignés</th>
          <th className="px-4 py-2.5 text-left text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] w-[12%]">Source</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={r.id} className={cn(
            'group transition-colors border-b border-border/10',
            i % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
            r.dominant && 'bg-violet-500/[0.03]',
            'hover:bg-primary/[0.04]'
          )}>
            <td className="px-4 py-2.5 text-muted-foreground/60 font-mono text-[10px]">{i + 1}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-foreground text-[11px]">{r.snssai || r.dimension_key}</span>
                {r.is_fwa && <FwaBadge />}
                {r.dominant && <DominantBadge />}
              </div>
            </td>
            <td className="px-4 py-2.5">
              <span className="text-foreground/80 font-medium">{r.label}</span>
            </td>
            <td className="px-4 py-2.5"><SstBadge label={r.sst_label || 'eMBB'} /></td>
            <td className="px-4 py-2.5"><QiPills values={r.fiveqi_values} /></td>
            <td className="px-4 py-2.5"><SourceBadge source={r.fiveqi_src} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ═══════════════════ CROSS-VENDOR ANOMALIES ═══════════════════ */
function detectAnomalies(records: SliceRecord[]): string[] {
  const anomalies: string[] = [];
  const ericssonQcis = new Set(records.filter(r => r.vendor === 'Ericsson' && r.rat === 'LTE').flatMap(r => r.fiveqi_values));
  const nokiaQcis = new Set(records.filter(r => r.vendor === 'Nokia' && r.rat === 'LTE').flatMap(r => r.fiveqi_values));
  for (const q of [3, 4, 7]) {
    if (ericssonQcis.has(q) && !nokiaQcis.has(q)) anomalies.push(`QCI ${q} (${QI_LABELS[q] || ''}) présent Ericsson mais absent Nokia`);
    if (nokiaQcis.has(q) && !ericssonQcis.has(q)) anomalies.push(`QCI ${q} (${QI_LABELS[q] || ''}) présent Nokia mais absent Ericsson`);
  }
  const eriFwa = records.some(r => r.vendor === 'Ericsson' && r.rat === 'NR' && r.is_fwa);
  const nokFwa = records.some(r => r.vendor === 'Nokia' && r.rat === 'NR' && r.is_fwa);
  if (eriFwa && !nokFwa) anomalies.push('FWA slice présent Ericsson NR mais absent Nokia NR');
  if (nokFwa && !eriFwa) anomalies.push('FWA slice présent Nokia NR mais absent Ericsson NR');
  return anomalies;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
const QosNetworkView: React.FC = () => {
  const [records, setRecords] = useState<SliceRecord[]>(MOCK_RECORDS);
  const [loading, setLoading] = useState(false);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterRat, setFilterRat] = useState('');
  const [mode, setMode] = useState<DisplayMode>('full');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(getApiUrl('pm/slice-mapping'), { headers: getApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setRecords(data.map((d: any, i: number) => ({
            id: d.id || i,
            vendor: d.vendor || 'Unknown',
            rat: d.rat || 'LTE',
            group_id: d.group_id || (d.rat === 'NR' ? 'NR_SNSSAI' : 'FLEX_QCI'),
            dimension_key: d.dimension_key || d.snssai || '',
            snssai: d.snssai,
            sst: d.sst,
            sst_label: d.sst_name || d.sst_label,
            sd_hex: d.sd_hex,
            label: d.label || d.service || '',
            gbr_label: d.gbr_label,
            fiveqi_values: d.fiveqi_values || d['5qi_equivalent'] || [],
            fiveqi_src: d.fiveqi_src || d.source || 'inferred',
            pm_activity_pct: d.pm_activity_24h_pct ?? d.pm_activity_pct,
            dominant: d.dominant || false,
            is_fwa: d.is_fwa || (d.snssai && d.snssai.includes('999900')),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let items = records;
    if (filterVendor) items = items.filter(r => r.vendor === filterVendor);
    if (filterRat) items = items.filter(r => r.rat === filterRat);
    if (mode === 'qos_only') items = items.filter(r => !['FLEX_ENDC_CATEGORY','FLEX_SUBSCRIBER_GROUP','FLEX_UE_CATEGORY','FLEX_SPID'].includes(r.group_id));
    if (mode === 'slicing_only') items = items.filter(r => r.rat === 'NR');
    if (mode === 'gbr_only') items = items.filter(r => r.gbr_label === 'GBR');
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(r =>
        r.dimension_key.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        (r.snssai || '').toLowerCase().includes(q) ||
        r.group_id.toLowerCase().includes(q)
      );
    }
    return items;
  }, [records, filterVendor, filterRat, mode, searchQuery]);

  const vendors = useMemo(() => [...new Set(records.map(r => r.vendor))].sort(), [records]);
  const rats = useMemo(() => [...new Set(records.map(r => r.rat))].sort(), [records]);
  const anomalies = useMemo(() => detectAnomalies(filtered), [filtered]);

  // Summary stats
  const stats = useMemo(() => {
    const gbrCount = filtered.filter(r => r.gbr_label === 'GBR').length;
    const groups = new Set(filtered.map(r => r.group_id));
    const dominantCount = filtered.filter(r => r.dominant).length;
    return { gbrCount, groupCount: groups.size, dominantCount };
  }, [filtered]);

  // Group: vendor → rat → group_id
  const structure = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, SliceRecord[]>>>();
    for (const r of filtered) {
      if (!map.has(r.vendor)) map.set(r.vendor, new Map());
      const vendorMap = map.get(r.vendor)!;
      if (!vendorMap.has(r.rat)) vendorMap.set(r.rat, new Map());
      const ratMap = vendorMap.get(r.rat)!;
      if (!ratMap.has(r.group_id)) ratMap.set(r.group_id, []);
      ratMap.get(r.group_id)!.push(r);
    }
    return map;
  }, [filtered]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const RAT_MECHANISMS: Record<string, Record<string, string>> = {
    Ericsson: { LTE: 'FLEX counters', NR: 'S-NSSAI mapping' },
    Nokia:    { LTE: 'PMQAP profiles', NR: 'NRSPC NSSAI' },
  };

  const hasActiveFilters = filterVendor || filterRat || mode !== 'full' || searchQuery;

  const clearAllFilters = () => {
    setFilterVendor('');
    setFilterRat('');
    setMode('full');
    setSearchQuery('');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-6 max-w-[1400px] space-y-5">

        {/* ── SUMMARY STATS ── */}
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Total Profiles" value={filtered.length} sub={`of ${records.length}`} icon={<Layers className="w-4 h-4" />} />
          <StatCard label="Vendors" value={vendors.length} sub={vendors.join(' · ')} icon={<Cpu className="w-4 h-4" />} />
          <StatCard label="GBR Bearers" value={stats.gbrCount} icon={<Phone className="w-4 h-4" />} />
          <StatCard label="Groups" value={stats.groupCount} icon={<Hash className="w-4 h-4" />} />
          <StatCard label="Dominant" value={stats.dominantCount} icon={<Zap className="w-4 h-4" />} />
          {anomalies.length > 0 && (
            <StatCard label="Anomalies" value={anomalies.length} icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} />
          )}
        </div>

        {/* ── FILTER BAR ── */}
        <div className="flex items-center gap-3 flex-wrap rounded-xl bg-card border border-border/60 px-4 py-3">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search profiles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 w-44 px-2.5 rounded-lg border border-border bg-background text-foreground text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <span className="w-px h-5 bg-border/60" />

          {/* Mode chips */}
          <div className="flex gap-1.5">
            {([['full','Full View'],['qos_only','QoS Only'],['slicing_only','NR Slicing'],['gbr_only','GBR Only']] as const).map(([m, l]) => (
              <FilterChip key={m} label={l} active={mode === m} onClick={() => setMode(m)} />
            ))}
          </div>

          <span className="w-px h-5 bg-border/60" />

          {/* Vendor chips */}
          <div className="flex gap-1.5">
            <FilterChip label="All Vendors" active={!filterVendor} onClick={() => setFilterVendor('')} />
            {vendors.map(v => (
              <FilterChip key={v} label={v} active={filterVendor === v} onClick={() => setFilterVendor(filterVendor === v ? '' : v)} color={vendorHex(v)} />
            ))}
          </div>

          <span className="w-px h-5 bg-border/60" />

          {/* RAT chips */}
          <div className="flex gap-1.5">
            <FilterChip label="All RAT" active={!filterRat} onClick={() => setFilterRat('')} />
            {rats.map(r => (
              <FilterChip key={r} label={r} active={filterRat === r} onClick={() => setFilterRat(filterRat === r ? '' : r)} />
            ))}
          </div>

          {/* Clear all */}
          {hasActiveFilters && (
            <>
              <span className="w-px h-5 bg-border/60" />
              <button onClick={clearAllFilters} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <X className="w-3 h-3" /> Clear
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border/40 bg-card p-12 text-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Loading QoS configuration...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card p-12 text-center">
            <Layers className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No profiles match current filters</p>
            <button onClick={clearAllFilters} className="mt-2 text-xs text-primary hover:underline">Clear filters</button>
          </div>
        ) : (
          <>
            {/* ── VENDOR BLOCKS ── */}
            {Array.from(structure.entries()).map(([vendor, ratMap]) => {
              const vBadge = vendorBadge(vendor);
              const vHex = vendorHex(vendor);
              const lteCount = Array.from(ratMap.get('LTE')?.values() || []).flat().length;
              const nrCount = Array.from(ratMap.get('NR')?.values() || []).flat().length;
              const total = lteCount + nrCount;

              return (
                <div key={vendor} className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
                  {/* Vendor header */}
                  <div className="px-5 py-3 flex items-center gap-3 border-b border-border/30" style={{ background: `linear-gradient(135deg, ${vHex}06 0%, transparent 100%)` }}>
                    <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-card" style={{ background: vHex, boxShadow: `0 0 8px ${vHex}40` }} />
                    <span className={cn('text-[11px] px-2.5 py-0.5 rounded-md font-bold', vBadge.bg, vBadge.text)}>{vendor}</span>
                    <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
                        LTE: {lteCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500/50" />
                        NR: {nrCount}
                      </span>
                      <span className="font-semibold text-foreground/60">Total: {total}</span>
                    </div>
                  </div>

                  {/* RAT sections */}
                  {Array.from(ratMap.entries()).map(([rat, groupMap]) => {
                    const ratCount = Array.from(groupMap.values()).flat().length;
                    const mechanism = RAT_MECHANISMS[vendor]?.[rat] || '';
                    const hasNoPm = rat === 'NR';

                    return (
                      <div key={rat}>
                        {/* RAT header */}
                        <div className="flex items-center gap-2.5 px-5 py-2 border-b border-border/20 bg-muted/5">
                          <span className={cn(
                            'text-[10px] px-2.5 py-0.5 rounded-full font-bold font-mono border',
                            rat === 'NR' ? 'bg-violet-500/10 text-violet-600 border-violet-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                          )}>{rat}</span>
                          <span className="text-[10px] text-muted-foreground">{ratCount} profiles</span>
                          <span className="text-[10px] text-muted-foreground/50">·</span>
                          <span className="text-[10px] text-muted-foreground/70 italic">{mechanism}</span>
                          {hasNoPm && <NoPmBadge />}
                        </div>

                        {/* Group sections */}
                        {Array.from(groupMap.entries()).map(([groupId, groupRecords]) => {
                          const gMeta = GROUP_META[groupId] || { label: groupId, bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', icon: <Hash className="w-3 h-3" /> };
                          const groupKey = `${vendor}-${rat}-${groupId}`;
                          const isCollapsed = collapsedGroups.has(groupKey);

                          return (
                            <div key={groupId}>
                              {/* Group header */}
                              <button
                                onClick={() => toggleGroup(groupKey)}
                                className="w-full flex items-center gap-2 px-5 py-2 border-b border-border/15 bg-muted/3 hover:bg-muted/8 transition-colors group/gh"
                              >
                                <span className="text-muted-foreground/40 group-hover/gh:text-muted-foreground transition-colors">
                                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </span>
                                <span className={cn('flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md font-bold font-mono border', gMeta.bg, gMeta.text, gMeta.border)}>
                                  {gMeta.icon}
                                  {groupId}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{gMeta.label}</span>
                                <span className="text-[9px] text-muted-foreground/50 ml-auto tabular-nums">{groupRecords.length} profiles</span>
                              </button>

                              {/* Table */}
                              {!isCollapsed && (
                                rat === 'NR' ? <NrTable records={groupRecords} /> : <LteTable records={groupRecords} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* ── ANOMALIES ── */}
            {anomalies.length > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
                <div className="px-5 py-3 border-b border-amber-500/15 flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/10">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-xs font-bold text-amber-700">Cross-Vendor Anomalies Detected</span>
                  <span className="text-[10px] text-amber-600/60 ml-auto">{anomalies.length} issues</span>
                </div>
                <div className="px-5 py-3 space-y-2">
                  {anomalies.map((a, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-[11px] text-amber-800/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FOOTER ── */}
            <div className="rounded-xl bg-muted/20 px-5 py-3 flex items-center justify-between text-[10px] text-muted-foreground border border-border/30">
              <span>{filtered.length} profiles · {vendors.length} vendors · {rats.length} RATs · {stats.groupCount} groups</span>
              <span className="text-muted-foreground/50">Source: ref_slice_5qi_map + CM dump + PM derivation</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QosNetworkView;
