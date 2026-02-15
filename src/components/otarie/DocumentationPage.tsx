import React, { useState } from 'react';
import { AppTab } from '../../types';
import { Search, BookOpen, Database, BarChart3, Layers, Wifi, Cpu, Globe, Zap, ArrowDownUp, Timer, ShieldAlert, Activity, Signal, Gauge, Users } from 'lucide-react';

type DocTab = 'doc-topo' | 'doc-metrics' | 'doc-dimensions';

interface Props {
  activeDoc: DocTab;
}

/* ─── TOPO DATA ─── */
const topoFields = [
  { name: 'Code NIDT', desc: 'Unique internal network site identifier', usage: 'Site-level join key', icon: <Database className="w-4 h-4" /> },
  { name: 'Nom Site', desc: 'Official site name', usage: 'Site-level KPI aggregation', icon: <Globe className="w-4 h-4" /> },
  { name: 'Région', desc: 'Administrative or operational region', usage: 'Regional reporting & DOR mapping', icon: <Layers className="w-4 h-4" /> },
  { name: 'Longitude / Latitude', desc: 'Geographical coordinates', usage: 'Map visualization', icon: <Globe className="w-4 h-4" /> },
  { name: 'Nom Cellule', desc: 'Cell name', usage: 'Cell-level KPI aggregation', icon: <Signal className="w-4 h-4" /> },
  { name: 'Techno', desc: 'Radio technology (2G, 3G, 4G, 5G)', usage: 'RAT segmentation', icon: <Wifi className="w-4 h-4" /> },
  { name: 'Bande', desc: 'Frequency band (NR_3500, LTE800…)', usage: 'Band performance analysis', icon: <Zap className="w-4 h-4" /> },
  { name: 'Constructeur', desc: 'Equipment vendor (Ericsson, Nokia…)', usage: 'Vendor benchmarking', icon: <Cpu className="w-4 h-4" /> },
  { name: 'Azimut', desc: 'Antenna orientation (degrees)', usage: 'Coverage optimization', icon: <ArrowDownUp className="w-4 h-4" /> },
  { name: 'Date MES', desc: 'Date of service activation', usage: 'Rollout tracking', icon: <Timer className="w-4 h-4" /> },
  { name: 'Date FN8', desc: 'Technical milestone date', usage: 'Deployment tracking', icon: <Timer className="w-4 h-4" /> },
  { name: 'Plaque', desc: 'Operational area grouping', usage: 'Operational segmentation', icon: <Layers className="w-4 h-4" /> },
  { name: 'HBA', desc: 'High Band Area indicator', usage: 'Coverage classification', icon: <Signal className="w-4 h-4" /> },
  { name: 'TAC', desc: 'Tracking Area Code', usage: 'Mobility management', icon: <Activity className="w-4 h-4" /> },
  { name: 'LAC', desc: 'Location Area Code (legacy)', usage: '2G/3G mobility', icon: <Activity className="w-4 h-4" /> },
  { name: 'ECI', desc: 'E-UTRAN Cell Identifier', usage: 'LTE cell identification', icon: <Database className="w-4 h-4" /> },
  { name: 'LCID', desc: 'Logical Cell Identifier', usage: 'Internal radio reference', icon: <Database className="w-4 h-4" /> },
  { name: 'NCI', desc: 'NR Cell Identifier', usage: '5G cell identification', icon: <Database className="w-4 h-4" /> },
  { name: 'PCI', desc: 'Physical Cell Identifier', usage: 'Interference & neighbor analysis', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Remote Electrical Tilt', desc: 'Antenna tilt configuration', usage: 'Coverage optimization', icon: <ArrowDownUp className="w-4 h-4" /> },
  { name: 'Etat cellule', desc: 'Cell operational status', usage: 'Active/inactive monitoring', icon: <Activity className="w-4 h-4" /> },
  { name: 'Zone_ARCEP', desc: 'Regulatory zone classification', usage: 'Regulatory KPI segmentation', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Essentiel', desc: 'Strategic site indicator', usage: 'Priority monitoring', icon: <Gauge className="w-4 h-4" /> },
];

/* ─── METRICS / KPI DATA ─── */
interface KPIEntry { name: string; formula: string; usage: string; type: 'active' | 'distribution' }
interface KPISection { title: string; icon: React.ReactNode; kpis: KPIEntry[] }

const kpiSections: KPISection[] = [
  {
    title: 'Traffic & Throughput', icon: <BarChart3 className="w-5 h-5" />,
    kpis: [
      { name: 'volume_totale', formula: 'SUM(useful_dn + useful_up)', usage: 'Total traffic monitoring', type: 'active' },
      { name: 'debit_dl', formula: 'AVG((useful_dn×8)/xfer_time/1e6)', usage: 'Downlink performance', type: 'active' },
      { name: 'debit_ul', formula: 'AVG((useful_up×8)/xfer_time/1e6)', usage: 'Uplink performance', type: 'active' },
      { name: 'dl_ul_ratio', formula: 'SUM(useful_dn)/SUM(useful_up)', usage: 'Traffic behavior analysis', type: 'active' },
      { name: 'debit_dl_max', formula: 'MAX(…)', usage: 'Peak DL capacity', type: 'active' },
      { name: 'debit_ul_max', formula: 'MAX(…)', usage: 'Peak UL capacity', type: 'active' },
    ]
  },
  {
    title: 'RTT (Latency)', icon: <Timer className="w-5 h-5" />,
    kpis: [
      { name: 'rtt_setup_avg', formula: 'AVG(delay_syn_synack + delay_synack_ack)', usage: 'TCP setup performance', type: 'active' },
      { name: 'rtt_setup_40', formula: 'PCT(≤40ms)', usage: 'Excellent setup latency', type: 'distribution' },
      { name: 'rtt_setup_40_80', formula: 'PCT(40-80ms)', usage: 'Good setup latency', type: 'distribution' },
      { name: 'rtt_setup_80_150', formula: 'PCT(80-150ms)', usage: 'Moderate setup latency', type: 'distribution' },
      { name: 'rtt_setup_150_300', formula: 'PCT(150-300ms)', usage: 'High setup latency', type: 'distribution' },
      { name: 'rtt_data_avg', formula: 'AVG(downstream_hrtt_mean)', usage: 'QoE latency monitoring', type: 'active' },
      { name: 'rtt_data_40', formula: 'PCT(≤40ms)', usage: 'Excellent data latency', type: 'distribution' },
      { name: 'rtt_data_40_80', formula: 'PCT(40-80ms)', usage: 'Good data latency', type: 'distribution' },
    ]
  },
  {
    title: 'Packet Loss', icon: <ShieldAlert className="w-5 h-5" />,
    kpis: [
      { name: 'loss_dl_rate', formula: 'SUM(loss_dn)/SUM(n_packet_dn)', usage: 'DL loss monitoring', type: 'active' },
      { name: 'loss_ul_rate', formula: 'SUM(loss_up)/SUM(n_packet_up)', usage: 'UL loss monitoring', type: 'active' },
      { name: 'loss_dl_1', formula: 'PCT(loss_dl>1%)', usage: 'DL degradation detection', type: 'distribution' },
      { name: 'loss_dl_3 / 5 / 10', formula: 'PCT(loss_dl > N%)', usage: 'Degradation severity tiers', type: 'distribution' },
    ]
  },
  {
    title: 'TCP Quality', icon: <Activity className="w-5 h-5" />,
    kpis: [
      { name: 'out_of_order_rate', formula: 'SUM(nb_out_of_order_dn>0)/sessions', usage: 'Transport health', type: 'active' },
      { name: 'wind_full_rate', formula: 'SUM(nb_window_full_dn>0)/sessions', usage: 'Congestion detection', type: 'active' },
      { name: 'tcp_retr_rate_1/3/5/10', formula: 'PCT(retr > N%)', usage: 'Retransmission severity tiers', type: 'distribution' },
    ]
  },
  {
    title: 'Speed Compliance (DMS)', icon: <Gauge className="w-5 h-5" />,
    kpis: [
      { name: 'dms_dl_3', formula: 'SUM(debit_dl≥3)/sessions', usage: 'DL baseline compliance', type: 'active' },
      { name: 'dms_dl_8', formula: 'SUM(debit_dl≥8)/sessions', usage: 'DL mid compliance', type: 'active' },
      { name: 'dms_dl_30', formula: 'SUM(debit_dl≥30)/sessions', usage: 'DL high compliance', type: 'active' },
      { name: 'dms_ul_1 / 3 / 5', formula: 'SUM(debit_ul≥N)/sessions', usage: 'UL compliance tiers', type: 'active' },
    ]
  },
  {
    title: 'Sessions & Mobility', icon: <ArrowDownUp className="w-5 h-5" />,
    kpis: [
      { name: 'session_nbr', formula: 'COUNT(session_id)', usage: 'Session volume', type: 'active' },
      { name: 'session_dur_moy', formula: 'AVG(duration)', usage: 'Usage behavior', type: 'active' },
      { name: 'session_dcr', formula: 'Drop/session_nbr', usage: 'Service stability', type: 'active' },
      { name: 'fallback_5G_to_4G_rate', formula: 'nbr_fallback/session_5g', usage: '5G instability', type: 'active' },
      { name: 'instability_rate', formula: '(fallbacks)/sessions', usage: 'Global instability', type: 'active' },
      { name: 'time_rat_5g_%', formula: 'SUM(time_5g)/SUM(total)', usage: '5G time share', type: 'active' },
    ]
  },
  {
    title: 'QoE & Device', icon: <Users className="w-5 h-5" />,
    kpis: [
      { name: 'bad_session_rate', formula: 'SUM(bad_flag)/sessions', usage: 'QoE degradation', type: 'active' },
      { name: 'qoe_index', formula: '1 - bad_session_rate', usage: 'Global QoE', type: 'active' },
      { name: '5G_capable_rate', formula: 'SUM(5g_cap)/sessions', usage: '5G capable base', type: 'active' },
      { name: '5gue_attached_4G_rate', formula: '5G_capable & last_rat=4', usage: '5G coverage gap', type: 'active' },
    ]
  },
];

/* ─── DIMENSIONS DATA ─── */
interface DimEntry { dimension: string; values: string; description: string }
interface DimSection { title: string; icon: React.ReactNode; entries: DimEntry[] }

const dimSections: DimSection[] = [
  {
    title: 'Radio Structure', icon: <Signal className="w-5 h-5" />,
    entries: [
      { dimension: 'ORF_NETWORK', values: 'Orange France Network', description: 'Core and radio architecture (OFR routing domain)' },
      { dimension: 'Vendor', values: 'ericsson, nokia, ransharing, samsung', description: 'Radio equipment vendor' },
      { dimension: 'DOR', values: 'ILE_DE_FRANCE, NORD_EST, OUEST, SUD_EST, SUD_OUEST', description: 'Operational regional segmentation' },
      { dimension: 'Plaque', values: 'All operational plaques', description: 'Operational geographical grouping' },
      { dimension: 'Site', values: 'Site name', description: 'Physical site aggregation level' },
      { dimension: 'Cellule', values: 'Cell name', description: 'Cell-level aggregation' },
      { dimension: 'Bande', values: 'NR_3500, NR_700, LTE2600, LTE2100, LTE1800, LTE800, LTE700', description: 'Radio frequency band' },
    ]
  },
  {
    title: 'Device & Capability', icon: <Cpu className="w-5 h-5" />,
    entries: [
      { dimension: '5G_capability', values: '5G_capable, non_5G_capable', description: 'User Equipment 5G capability flag' },
      { dimension: 'device_brand', values: 'iphone, samsung, other', description: 'Device manufacturer category' },
      { dimension: 'os', values: 'android, ios, other', description: 'Operating system classification' },
      { dimension: 'client', values: 'FWA, Mobile', description: 'Access type (Fixed Wireless Access or Mobile)' },
    ]
  },
  {
    title: 'RAT (Radio Access Technology)', icon: <Wifi className="w-5 h-5" />,
    entries: [
      { dimension: 'RAT', values: '5G_SA, 5G_NSA, 4G, 3G, 2G, WiFi', description: 'Access technology used during the session' },
    ]
  },
  {
    title: 'ARCEP Zone', icon: <ShieldAlert className="w-5 h-5" />,
    entries: [
      { dimension: 'ARCEP', values: 'top15, Intermidiare, rural, AXE, TGV', description: 'Regulatory geographical classification' },
    ]
  },
  {
    title: 'Application Category', icon: <Layers className="w-5 h-5" />,
    entries: [
      { dimension: 'Application', values: 'Social, Streaming, WEB', description: 'Traffic classification by application type' },
    ]
  },
  {
    title: 'Service Provider / AS', icon: <Globe className="w-5 h-5" />,
    entries: [
      { dimension: 'Service_Provider', values: 'Google, Meta, Microsoft, Amazone, Other', description: 'Content provider / Autonomous System grouping' },
    ]
  },
  {
    title: 'POP (Core Entry Point)', icon: <Database className="w-5 h-5" />,
    entries: [
      { dimension: 'POP', values: 'CNM, CNL', description: 'Core Network Point of Presence segmentation' },
    ]
  },
];

/* ─── RENDER ─── */
const DocumentationPage: React.FC<Props> = ({ activeDoc }) => {
  const [search, setSearch] = useState('');

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {activeDoc === 'doc-topo' && 'Network Topology (TOPO)'}
              {activeDoc === 'doc-metrics' && 'KPI Metric Catalog'}
              {activeDoc === 'doc-dimensions' && 'Network Dimensions'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeDoc === 'doc-topo' && 'Radio & Site Configuration Data Model — Official Reference'}
              {activeDoc === 'doc-metrics' && 'Complete 60 KPI Catalog — Official Technical Reference'}
              {activeDoc === 'doc-dimensions' && 'Official Dimension Catalog — Segmentation Model'}
            </p>
          </div>
        </div>
        <div className="mt-4 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documentation…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="px-8 py-6 max-w-6xl">
        {activeDoc === 'doc-topo' && <TopoDoc search={search} />}
        {activeDoc === 'doc-metrics' && <MetricsDoc search={search} />}
        {activeDoc === 'doc-dimensions' && <DimensionsDoc search={search} />}
      </div>
    </div>
  );
};

/* ─── TOPO DOC ─── */
const TopoDoc: React.FC<{ search: string }> = ({ search }) => {
  const filtered = topoFields.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filtered.map((f, i) => (
        <div key={i} className="group rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              {f.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">{f.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
              <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-accent text-accent-foreground">
                {f.usage}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── METRICS DOC ─── */
const MetricsDoc: React.FC<{ search: string }> = ({ search }) => {
  return (
    <div className="space-y-8">
      {kpiSections.map((section, si) => {
        const filtered = section.kpis.filter(k =>
          !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.usage.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return null;
        return (
          <div key={si}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">{section.icon}</div>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">KPI</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Formula</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Usage</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((k, ki) => (
                    <tr key={ki} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-bold text-foreground">{k.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{k.formula}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{k.usage}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${k.type === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                          {k.type === 'active' ? 'Active' : 'Distribution'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── DIMENSIONS DOC ─── */
const DimensionsDoc: React.FC<{ search: string }> = ({ search }) => {
  return (
    <div className="space-y-8">
      {dimSections.map((section, si) => {
        const filtered = section.entries.filter(e =>
          !search || e.dimension.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return null;
        return (
          <div key={si}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">{section.icon}</div>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
            </div>
            <div className="grid gap-3">
              {filtered.map((e, ei) => (
                <div key={ei} className="rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-primary/20 transition-all">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-mono text-sm font-bold text-foreground">{e.dimension}</h3>
                    <p className="text-xs text-muted-foreground text-right">{e.description}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.values.split(', ').map((v, vi) => (
                      <span key={vi} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DocumentationPage;
