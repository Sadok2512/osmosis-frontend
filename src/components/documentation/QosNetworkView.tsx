import React, { useState, useMemo, useEffect } from 'react';
import { Layers, Filter, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
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
  'N/A':     { bg: 'bg-muted',          text: 'text-muted-foreground', border: 'border-border' },
};

const SST_COLORS: Record<string, { bg: string; text: string }> = {
  eMBB:  { bg: 'bg-blue-500/12', text: 'text-blue-600' },
  URLLC: { bg: 'bg-amber-400/12', text: 'text-amber-700' },
  MIoT:  { bg: 'bg-emerald-500/12', text: 'text-emerald-700' },
  V2X:   { bg: 'bg-purple-500/12', text: 'text-purple-600' },
};

const GROUP_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  FLEX_QCI:              { label: 'QCI + ARP priority',      bg: 'bg-amber-500/10',  text: 'text-amber-800',  border: 'border-amber-500/20' },
  FLEX_ENDC_CATEGORY:    { label: 'EN-DC NSA category',     bg: 'bg-violet-500/10', text: 'text-violet-700', border: 'border-violet-500/20' },
  FLEX_SUBSCRIBER_GROUP: { label: 'Subscriber group',       bg: 'bg-blue-500/10',   text: 'text-blue-700',   border: 'border-blue-500/20' },
  FLEX_UE_CATEGORY:      { label: 'UE category',            bg: 'bg-amber-500/10',  text: 'text-amber-800',  border: 'border-amber-500/20' },
  FLEX_SPID:             { label: 'Service provider ID',    bg: 'bg-pink-500/10',   text: 'text-pink-700',   border: 'border-pink-500/20' },
  NR_SNSSAI:             { label: 'NR slices (S-NSSAI)',    bg: 'bg-violet-500/10', text: 'text-violet-700', border: 'border-violet-500/20' },
  PMQAP:                 { label: 'LTE PMQAP profiles',     bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/20' },
  NR_NSSAI:              { label: 'NR NSSAI slices',        bg: 'bg-violet-500/10', text: 'text-violet-700', border: 'border-violet-500/20' },
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  cm_dump:    { bg: 'bg-amber-500/10',   text: 'text-amber-700',         label: 'CM' },
  pm_derived: { bg: 'bg-emerald-500/10', text: 'text-emerald-700',       label: 'PM' },
  inferred:   { bg: 'bg-muted',          text: 'text-muted-foreground',  label: 'INF' },
};

const GBR_QCI = new Set([1, 2, 3, 4]);
const URLLC_QCI = new Set([82, 83, 84]);
const OPERATOR_QCI = new Set([13, 14, 19, 20, 130]);

const QI_LABELS: Record<number, string> = {
  1:'Voice',2:'Video Live',3:'Gaming',4:'Video Buf',5:'IMS',6:'Video TCP',
  7:'Interactive',8:'TCP Prem',9:'Default',13:'Oper.13',14:'Oper.14',
  19:'Oper.19',20:'Oper.20',82:'AR/VR',83:'Automation',84:'URLLC',130:'Operator',
};

/* ═══════════════════ MOCK DATA ═══════════════════ */
const MOCK_RECORDS: SliceRecord[] = [
  // Ericsson LTE — FLEX_QCI
  { id:1, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=1,Arp=5', label:'VoLTE', gbr_label:'GBR', fiveqi_values:[1], fiveqi_src:'cm_dump', pm_activity_pct:95, dominant:true },
  { id:2, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=2,Arp=4', label:'Video Live Streaming', gbr_label:'GBR', fiveqi_values:[2], fiveqi_src:'cm_dump', pm_activity_pct:72 },
  { id:3, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=5,Arp=1', label:'IMS Signalling', gbr_label:'Non-GBR', fiveqi_values:[5], fiveqi_src:'cm_dump', pm_activity_pct:88 },
  { id:4, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=9,Arp=9', label:'Default Bearer', gbr_label:'Non-GBR', fiveqi_values:[9], fiveqi_src:'cm_dump', pm_activity_pct:99, dominant:true },
  { id:5, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=7,Arp=7', label:'Interactive Gaming', gbr_label:'Non-GBR', fiveqi_values:[7], fiveqi_src:'pm_derived', pm_activity_pct:45 },
  { id:6, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=6,Arp=6', label:'Video TCP Buffered', gbr_label:'Non-GBR', fiveqi_values:[6], fiveqi_src:'cm_dump', pm_activity_pct:60 },
  { id:7, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_QCI', dimension_key:'QCI=8,Arp=8', label:'TCP Premium', gbr_label:'Non-GBR', fiveqi_values:[8], fiveqi_src:'cm_dump', pm_activity_pct:30 },
  // Ericsson LTE — FLEX_ENDC_CATEGORY
  { id:8, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_ENDC_CATEGORY', dimension_key:'ENDC_CAT=SA', label:'Standalone 5G', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'cm_dump', pm_activity_pct:80 },
  { id:9, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_ENDC_CATEGORY', dimension_key:'ENDC_CAT=NSA', label:'EN-DC NSA', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'cm_dump', pm_activity_pct:92 },
  // Ericsson LTE — FLEX_SUBSCRIBER_GROUP
  { id:10, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_SUBSCRIBER_GROUP', dimension_key:'SubGrp=Enterprise', label:'Enterprise', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'inferred', pm_activity_pct:55 },
  { id:11, vendor:'Ericsson', rat:'LTE', group_id:'FLEX_SUBSCRIBER_GROUP', dimension_key:'SubGrp=Consumer', label:'Consumer', gbr_label:'N/A', fiveqi_values:[], fiveqi_src:'inferred', pm_activity_pct:98 },
  // Ericsson NR — NR_SNSSAI
  { id:12, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-000001', snssai:'1-000001', sst:1, sst_label:'eMBB', label:'Default eMBB', fiveqi_values:[9,5,1], fiveqi_src:'cm_dump', dominant:true },
  { id:13, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-000002', snssai:'1-000002', sst:1, sst_label:'eMBB', label:'Enhanced eMBB', fiveqi_values:[9,7,6], fiveqi_src:'pm_derived' },
  { id:14, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'2-000001', snssai:'2-000001', sst:2, sst_label:'URLLC', label:'URLLC Core', fiveqi_values:[82,83,84], fiveqi_src:'cm_dump' },
  { id:15, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'1-999900', snssai:'1-999900', sst:1, sst_label:'eMBB', label:'FWA Broadband', fiveqi_values:[9], fiveqi_src:'cm_dump', is_fwa:true },
  { id:16, vendor:'Ericsson', rat:'NR', group_id:'NR_SNSSAI', dimension_key:'3-000001', snssai:'3-000001', sst:3, sst_label:'MIoT', label:'Massive IoT', fiveqi_values:[9], fiveqi_src:'inferred' },
  // Nokia LTE — PMQAP
  { id:17, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI1', label:'VoLTE Voice', gbr_label:'GBR', fiveqi_values:[1], fiveqi_src:'cm_dump', pm_activity_pct:97, dominant:true },
  { id:18, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI5', label:'IMS Signalling', gbr_label:'Non-GBR', fiveqi_values:[5], fiveqi_src:'cm_dump', pm_activity_pct:90 },
  { id:19, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI9', label:'Default Best Effort', gbr_label:'Non-GBR', fiveqi_values:[9], fiveqi_src:'cm_dump', pm_activity_pct:99, dominant:true },
  { id:20, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI6', label:'Video TCP', gbr_label:'Non-GBR', fiveqi_values:[6], fiveqi_src:'cm_dump', pm_activity_pct:65 },
  { id:21, vendor:'Nokia', rat:'LTE', group_id:'PMQAP', dimension_key:'PMQAP_QCI8', label:'TCP Premium', gbr_label:'Non-GBR', fiveqi_values:[8], fiveqi_src:'pm_derived', pm_activity_pct:22 },
  // Nokia NR — NR_NSSAI
  { id:22, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-000001', snssai:'1-000001', sst:1, sst_label:'eMBB', label:'Default eMBB', fiveqi_values:[9,5,1], fiveqi_src:'cm_dump', dominant:true },
  { id:23, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-000003', snssai:'1-000003', sst:1, sst_label:'eMBB', label:'Premium eMBB', fiveqi_values:[9,7], fiveqi_src:'cm_dump' },
  { id:24, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'2-000001', snssai:'2-000001', sst:2, sst_label:'URLLC', label:'URLLC Mission Critical', fiveqi_values:[82,83], fiveqi_src:'cm_dump' },
  { id:25, vendor:'Nokia', rat:'NR', group_id:'NR_NSSAI', dimension_key:'1-999900', snssai:'1-999900', sst:1, sst_label:'eMBB', label:'FWA Fixed Wireless', fiveqi_values:[9], fiveqi_src:'cm_dump', is_fwa:true },
];

/* ═══════════════════ SUB-COMPONENTS ═══════════════════ */

const GbrBadge: React.FC<{ label: string }> = ({ label }) => {
  const c = GBR_COLORS[label] || GBR_COLORS['N/A'];
  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold border', c.bg, c.text, c.border)}>
      {label}
    </span>
  );
};

const SstBadge: React.FC<{ label: string }> = ({ label }) => {
  const c = SST_COLORS[label] || { bg: 'bg-muted', text: 'text-muted-foreground' };
  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold', c.bg, c.text)}>
      {label}
    </span>
  );
};

const SourceBadge: React.FC<{ source: string }> = ({ source }) => {
  const c = SOURCE_COLORS[source] || SOURCE_COLORS.inferred;
  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', c.bg, c.text)}>
      {c.label}
    </span>
  );
};

const QiPills: React.FC<{ values: number[] }> = ({ values }) => {
  if (!values.length) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {values.map(qi => {
        const isGbr = GBR_QCI.has(qi);
        const isUrllc = URLLC_QCI.has(qi);
        const isOp = OPERATOR_QCI.has(qi);
        const cls = isGbr ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
          : isUrllc ? 'bg-amber-400/10 text-amber-700 border-amber-400/25'
          : isOp ? 'bg-pink-400/10 text-pink-700 border-pink-400/25'
          : 'bg-blue-400/10 text-blue-600 border-blue-400/25';
        return (
          <span key={qi} className={cn('text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border', cls)} title={QI_LABELS[qi] || ''}>
            {qi}
          </span>
        );
      })}
    </div>
  );
};

const PmBar: React.FC<{ pct: number | null | undefined }> = ({ pct }) => {
  if (pct == null || pct === 0) return <span className="text-[10px] text-muted-foreground">CM only</span>;
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-[3px] rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
};

const DominantBadge = () => (
  <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500 text-amber-950 font-bold font-mono ml-1">DOMINANT</span>
);

const FwaBadge = () => (
  <span className="text-[8px] px-1 py-0.5 rounded bg-violet-500 text-white font-bold font-mono ml-1">FWA</span>
);

const NoPmBadge = () => (
  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 border border-red-500/20 ml-auto font-medium">no PM dim</span>
);

/* ═══════════════════ TABLE RENDERERS ═══════════════════ */

const LteTable: React.FC<{ records: SliceRecord[] }> = ({ records }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-border/40 bg-muted/10">
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[5%]">#</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[30%]">Dimension Key</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[20%]">Service</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[10%]">Type</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[25%]">QCI / 5QI</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[10%]">PM Act.</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={r.id} className={cn(
            'border-b border-border/20 hover:bg-muted/10 transition-colors',
            r.dominant && 'bg-blue-500/[0.03]'
          )}>
            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
            <td className="px-3 py-1.5">
              <span className="font-mono font-bold text-foreground">{r.dimension_key}</span>
              {r.dominant && <DominantBadge />}
              {r.is_fwa && <FwaBadge />}
            </td>
            <td className="px-3 py-1.5 text-muted-foreground font-medium">{r.label}</td>
            <td className="px-3 py-1.5"><GbrBadge label={r.gbr_label || 'N/A'} /></td>
            <td className="px-3 py-1.5"><QiPills values={r.fiveqi_values} /></td>
            <td className="px-3 py-1.5"><PmBar pct={r.pm_activity_pct} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const NrTable: React.FC<{ records: SliceRecord[] }> = ({ records }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-border/40 bg-muted/10">
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[5%]">#</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[15%]">S-NSSAI</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[25%]">Label</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[10%]">SST</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[35%]">5QI Assignés</th>
          <th className="px-3 py-2 text-left font-bold text-muted-foreground uppercase tracking-wider w-[10%]">Source</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={r.id} className={cn(
            'border-b border-border/20 hover:bg-muted/10 transition-colors',
            r.dominant && 'bg-violet-500/[0.03]'
          )}>
            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
            <td className="px-3 py-1.5">
              <span className="font-mono font-bold text-foreground">{r.snssai || r.dimension_key}</span>
              {r.is_fwa && <FwaBadge />}
              {r.dominant && <DominantBadge />}
            </td>
            <td className="px-3 py-1.5 text-muted-foreground font-medium">{r.label}</td>
            <td className="px-3 py-1.5"><SstBadge label={r.sst_label || 'eMBB'} /></td>
            <td className="px-3 py-1.5"><QiPills values={r.fiveqi_values} /></td>
            <td className="px-3 py-1.5"><SourceBadge source={r.fiveqi_src} /></td>
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

  // Try to fetch from API, fallback to mock
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

  // Apply filters
  const filtered = useMemo(() => {
    let items = records;
    if (filterVendor) items = items.filter(r => r.vendor === filterVendor);
    if (filterRat) items = items.filter(r => r.rat === filterRat);
    if (mode === 'qos_only') items = items.filter(r => !['FLEX_ENDC_CATEGORY','FLEX_SUBSCRIBER_GROUP','FLEX_UE_CATEGORY','FLEX_SPID'].includes(r.group_id));
    if (mode === 'slicing_only') items = items.filter(r => r.rat === 'NR');
    if (mode === 'gbr_only') items = items.filter(r => r.gbr_label === 'GBR');
    return items;
  }, [records, filterVendor, filterRat, mode]);

  const vendors = useMemo(() => [...new Set(records.map(r => r.vendor))].sort(), [records]);
  const rats = useMemo(() => [...new Set(records.map(r => r.rat))].sort(), [records]);
  const anomalies = useMemo(() => detectAnomalies(filtered), [filtered]);

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-6 max-w-7xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-xl ring-1 ring-violet-500/20">
              <Layers className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground uppercase tracking-tight">QoS & Network Slicing Configuration</h2>
              <p className="text-[10px] text-muted-foreground">{filtered.length} profiles — Nokia PMQAP + Ericsson FLEX + 5G SNSSAI Slices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={mode} onChange={e => setMode(e.target.value as DisplayMode)}
              className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px] font-medium">
              <option value="full">Full View</option>
              <option value="qos_only">QoS Only</option>
              <option value="slicing_only">Slicing Only (NR)</option>
              <option value="gbr_only">GBR Only</option>
            </select>
            <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
              className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px] font-medium">
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filterRat} onChange={e => setFilterRat(e.target.value)}
              className="h-7 px-2 rounded-md border border-border bg-background text-foreground text-[10px] font-medium">
              <option value="">All RAT</option>
              {rats.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-xs text-muted-foreground animate-pulse">Loading QoS configuration...</div>
        ) : (
          <>
            {/* Vendor blocks */}
            {Array.from(structure.entries()).map(([vendor, ratMap]) => {
              const vBadge = vendorBadge(vendor);
              const vHex = vendorHex(vendor);
              const lteCount = Array.from(ratMap.get('LTE')?.values() || []).flat().length;
              const nrCount = Array.from(ratMap.get('NR')?.values() || []).flat().length;
              const total = lteCount + nrCount;

              return (
                <div key={vendor} className="rounded-xl border border-border bg-card overflow-hidden" style={{ borderColor: `${vHex}30` }}>
                  {/* Vendor header */}
                  <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-3" style={{ background: `${vHex}08` }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vHex }} />
                    <span className={cn('text-[10px] px-2 py-0.5 rounded font-bold', vBadge.bg, vBadge.text)}>{vendor}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      LTE: {lteCount} · NR: {nrCount} · total: {total}
                    </span>
                  </div>

                  {/* RAT sections */}
                  {Array.from(ratMap.entries()).map(([rat, groupMap]) => {
                    const ratCount = Array.from(groupMap.values()).flat().length;
                    const mechanism = RAT_MECHANISMS[vendor]?.[rat] || '';
                    const hasNoPm = rat === 'NR';

                    return (
                      <div key={rat}>
                        {/* RAT header */}
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-muted/5" style={{ borderTopColor: rat === 'NR' ? '#8B5CF630' : '#F59E0B30' }}>
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-bold font-mono border',
                            rat === 'NR' ? 'bg-violet-500/10 text-violet-600 border-violet-500/25' : 'bg-amber-500/10 text-amber-700 border-amber-500/25'
                          )}>{rat}</span>
                          <span className="text-[10px] text-muted-foreground">{ratCount} profiles · {mechanism}</span>
                          {hasNoPm && <NoPmBadge />}
                        </div>

                        {/* Group sections */}
                        {Array.from(groupMap.entries()).map(([groupId, groupRecords]) => {
                          const gMeta = GROUP_META[groupId] || { label: groupId, bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
                          const groupKey = `${vendor}-${rat}-${groupId}`;
                          const isCollapsed = collapsedGroups.has(groupKey);

                          return (
                            <div key={groupId}>
                              {/* Group header */}
                              <button
                                onClick={() => toggleGroup(groupKey)}
                                className="w-full flex items-center gap-2 px-4 py-1.5 border-b border-border/30 bg-muted/5 hover:bg-muted/10 transition-colors"
                              >
                                {isCollapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                                <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold font-mono border', gMeta.bg, gMeta.text, gMeta.border)}>
                                  {groupId}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{gMeta.label}</span>
                                <span className="text-[9px] text-muted-foreground ml-auto">{groupRecords.length} profiles</span>
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

            {/* Cross-vendor anomalies */}
            {anomalies.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-amber-500/20 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">Anomalies Cross-Vendor</span>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {anomalies.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-amber-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer summary */}
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{filtered.length} profiles affichés • {vendors.length} vendors • {rats.length} RATs</span>
              <span>Source: ref_slice_5qi_map + CM dump + PM derivation</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QosNetworkView;
