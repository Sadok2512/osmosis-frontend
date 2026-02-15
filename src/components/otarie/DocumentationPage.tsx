import React, { useState, useMemo } from 'react';
import {
  Search, BookOpen, Database, BarChart3, Layers, Wifi, Cpu, Globe, Zap,
  ArrowDownUp, Timer, ShieldAlert, Activity, Signal, Gauge, Users,
  Download, Filter, ChevronRight, Info
} from 'lucide-react';

type DocTab = 'topo' | 'kpi' | 'dimensions';

/* ─────────── TOPO DATA ─────────── */
const topoFields = [
  { name: 'Code NIDT', desc: 'Identifiant unique interne du site réseau.', usage: 'Clé de jointure site', icon: <Database className="w-4 h-4" /> },
  { name: 'Nom Site', desc: 'Nom officiel du site.', usage: 'Agrégation KPI site', icon: <Globe className="w-4 h-4" /> },
  { name: 'Région', desc: 'Région administrative ou opérationnelle.', usage: 'Reporting régional & DOR', icon: <Layers className="w-4 h-4" /> },
  { name: 'Longitude / Latitude', desc: 'Coordonnées géographiques.', usage: 'Visualisation cartographique', icon: <Globe className="w-4 h-4" /> },
  { name: 'Nom Cellule', desc: 'Nom de la cellule.', usage: 'Agrégation KPI cellule', icon: <Signal className="w-4 h-4" /> },
  { name: 'Techno', desc: 'Technologie radio (2G, 3G, 4G, 5G).', usage: 'Segmentation RAT', icon: <Wifi className="w-4 h-4" /> },
  { name: 'Bande', desc: 'Bande de fréquence (NR_3500, LTE800…).', usage: 'Analyse performance par bande', icon: <Zap className="w-4 h-4" /> },
  { name: 'Constructeur', desc: 'Fournisseur équipement (Ericsson, Nokia…).', usage: 'Benchmarking vendeur', icon: <Cpu className="w-4 h-4" /> },
  { name: 'Azimut', desc: "Orientation de l'antenne (degrés).", usage: 'Optimisation couverture', icon: <ArrowDownUp className="w-4 h-4" /> },
  { name: 'Date MES', desc: "Date d'activation du service.", usage: 'Suivi déploiement', icon: <Timer className="w-4 h-4" /> },
  { name: 'Date FN8', desc: 'Date jalon technique.', usage: 'Suivi déploiement', icon: <Timer className="w-4 h-4" /> },
  { name: 'Plaque', desc: 'Regroupement de zone opérationnelle.', usage: 'Segmentation opérationnelle', icon: <Layers className="w-4 h-4" /> },
  { name: 'HBA', desc: 'Indicateur High Band Area.', usage: 'Classification couverture', icon: <Signal className="w-4 h-4" /> },
  { name: 'TAC', desc: 'Tracking Area Code.', usage: 'Gestion mobilité', icon: <Activity className="w-4 h-4" /> },
  { name: 'ECI', desc: 'E-UTRAN Cell Identifier.', usage: 'Identification cellule LTE', icon: <Database className="w-4 h-4" /> },
  { name: 'NCI', desc: 'NR Cell Identifier.', usage: 'Identification cellule 5G', icon: <Database className="w-4 h-4" /> },
  { name: 'PCI', desc: 'Physical Cell Identifier.', usage: 'Analyse interférence', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Zone_ARCEP', desc: 'Classification zone réglementaire.', usage: 'Segmentation KPI réglementaire', icon: <ShieldAlert className="w-4 h-4" /> },
  { name: 'Essentiel', desc: 'Indicateur site stratégique.', usage: 'Monitoring prioritaire', icon: <Gauge className="w-4 h-4" /> },
];

/* ─────────── KPI DATA ─────────── */
interface KPIEntry {
  id: string; group: string; name: string; formula: string;
  desc: string; unit: string; usage: string; type: 'active' | 'distribution';
}

const kpiData: KPIEntry[] = [
  // Sessions
  { id: 'SESS_001', group: 'SESSIONS', name: 'session_nbr', formula: 'COUNT(session_id)', desc: 'Nombre total de sessions observées.', unit: 'COUNT', usage: 'Volumétrie/charge et dénominateur pour les taux.', type: 'active' },
  // Traffic
  { id: 'TRAF_001', group: 'TRAFFIC', name: 'volume_totale', formula: 'SUM(useful_dn + useful_up)', desc: 'Volume total data échangé (DL+UL).', unit: 'OCTETS', usage: 'Suivi charge réseau, dimensionnement capacité.', type: 'active' },
  { id: 'TRAF_002', group: 'TRAFFIC', name: 'volume_dl_moy', formula: 'SUM(useful_dn) / session_nbr', desc: 'Volume moyen DL par session (octets).', unit: 'OCTETS', usage: "Profil d'usage DL par zone/app/RAT.", type: 'active' },
  // Throughput
  { id: 'THRP_001', group: 'THROUGHPUT', name: 'debit_dl', formula: 'AVG((useful_dn * 8) / useful_xfer_time_dn / 1e6)', desc: 'Débit moyen descendant (Mbps).', unit: 'MBPS', usage: 'Performance perçue, congestion radio/transport, benchmark 4G/5G.', type: 'active' },
  { id: 'THRP_002', group: 'THROUGHPUT', name: 'debit_ul', formula: 'AVG((useful_up * 8) / useful_xfer_time_up / 1e6)', desc: 'Débit moyen montant (Mbps).', unit: 'MBPS', usage: 'Performance upload, visio/live, détection saturation UL.', type: 'active' },
  { id: 'THRP_003', group: 'THROUGHPUT', name: 'dl_ul_ratio', formula: 'SUM(useful_dn)/SUM(useful_up)', desc: 'Ratio DL/UL.', unit: 'RATIO', usage: 'Analyse comportement trafic.', type: 'active' },
  // RTT
  { id: 'RTT_001', group: 'RTT', name: 'rtt_setup_avg', formula: 'AVG(delay_syn_synack + delay_synack_ack)', desc: 'Latence moyenne setup TCP.', unit: 'MS', usage: 'Performance TCP setup.', type: 'active' },
  { id: 'RTT_002', group: 'RTT', name: 'rtt_setup_40', formula: 'PCT(rtt_setup_avg ≤ 40ms)', desc: 'Sessions avec latence setup excellente.', unit: '%', usage: 'Distribution latence setup.', type: 'distribution' },
  { id: 'RTT_003', group: 'RTT', name: 'rtt_data_avg', formula: 'AVG(downstream_hrtt_mean)', desc: 'Latence moyenne données.', unit: 'MS', usage: 'Monitoring latence QoE.', type: 'active' },
  { id: 'RTT_004', group: 'RTT', name: 'rtt_data_40', formula: 'PCT(rtt_data_avg ≤ 40ms)', desc: 'Sessions avec latence data excellente.', unit: '%', usage: 'Distribution latence data.', type: 'distribution' },
  // Loss
  { id: 'LOSS_001', group: 'LOSS', name: 'loss_dl_rate', formula: 'SUM(loss_dn)/SUM(n_packet_dn)', desc: 'Taux de perte DL.', unit: '%', usage: 'Monitoring perte DL.', type: 'active' },
  { id: 'LOSS_002', group: 'LOSS', name: 'loss_ul_rate', formula: 'SUM(loss_up)/SUM(n_packet_up)', desc: 'Taux de perte UL.', unit: '%', usage: 'Monitoring perte UL.', type: 'active' },
  { id: 'LOSS_003', group: 'LOSS', name: 'loss_dl_1', formula: 'PCT(loss_dl>1%)', desc: 'Sessions avec perte DL > 1%.', unit: '%', usage: 'Détection dégradation DL.', type: 'distribution' },
  // TCP
  { id: 'TCP_001', group: 'TCP', name: 'out_of_order_rate', formula: 'SUM(nb_out_of_order_dn>0)/session_nbr', desc: 'Taux de sessions avec paquets désordonnés.', unit: '%', usage: 'Santé transport.', type: 'active' },
  { id: 'TCP_002', group: 'TCP', name: 'wind_full_rate', formula: 'SUM(nb_window_full_dn>0)/session_nbr', desc: 'Taux de sessions avec buffer TCP plein.', unit: '%', usage: 'Détection congestion.', type: 'active' },
  { id: 'TCP_003', group: 'TCP', name: 'tcp_retr_rate_1', formula: 'PCT(retr>1%)', desc: 'Sessions avec retransmission > 1%.', unit: '%', usage: 'Retransmissions mineures.', type: 'distribution' },
  // DMS
  { id: 'DMS_001', group: 'DMS', name: 'dms_dl_3', formula: 'SUM(debit_dl≥3)/session_nbr', desc: 'Compliance débit DL ≥ 3 Mbps.', unit: '%', usage: 'Compliance baseline DL.', type: 'active' },
  { id: 'DMS_002', group: 'DMS', name: 'dms_dl_8', formula: 'SUM(debit_dl≥8)/session_nbr', desc: 'Compliance débit DL ≥ 8 Mbps.', unit: '%', usage: 'Compliance mid DL.', type: 'active' },
  { id: 'DMS_003', group: 'DMS', name: 'dms_dl_30', formula: 'SUM(debit_dl≥30)/session_nbr', desc: 'Compliance débit DL ≥ 30 Mbps.', unit: '%', usage: 'Compliance haute DL.', type: 'active' },
  { id: 'DMS_004', group: 'DMS', name: 'dms_ul_3', formula: 'SUM(debit_ul≥3)/session_nbr', desc: 'Compliance débit UL ≥ 3 Mbps.', unit: '%', usage: 'Compliance mid UL.', type: 'active' },
  // Mobility
  { id: 'MOB_001', group: 'MOBILITY', name: 'fallback_5G_to_4G_rate', formula: 'nbr_fallback_5g_4g/session_5g_nbr', desc: 'Taux de fallback 5G vers 4G.', unit: '%', usage: 'Instabilité 5G.', type: 'active' },
  { id: 'MOB_002', group: 'MOBILITY', name: 'instability_rate', formula: '(fallbacks)/session_nbr', desc: 'Taux instabilité globale.', unit: '%', usage: 'Instabilité globale.', type: 'active' },
  { id: 'MOB_003', group: 'MOBILITY', name: 'time_rat_5g_%', formula: 'SUM(time_rat_5g)/SUM(total_time)', desc: 'Part du temps en 5G.', unit: '%', usage: '5G time share.', type: 'active' },
  // QoE
  { id: 'QOE_001', group: 'QOE', name: 'qoe_index', formula: '1 - bad_session_rate', desc: 'Score QoE global.', unit: 'INDEX', usage: 'QoE globale.', type: 'active' },
  { id: 'QOE_002', group: 'QOE', name: 'bad_session_rate', formula: 'SUM(bad_session_flag)/session_nbr', desc: 'Taux de sessions dégradées.', unit: '%', usage: 'Dégradation QoE.', type: 'active' },
  { id: 'QOE_003', group: 'QOE', name: '5G_capable_rate', formula: 'SUM(imsi_5g_capability=1)/session_nbr', desc: 'Taux de terminaux 5G capables.', unit: '%', usage: 'Base 5G capable.', type: 'active' },
];

const KPI_GROUPS = [...new Set(kpiData.map(k => k.group))];

const groupColors: Record<string, string> = {
  SESSIONS: 'bg-blue-500', TRAFFIC: 'bg-emerald-500', THROUGHPUT: 'bg-violet-500',
  RTT: 'bg-amber-500', LOSS: 'bg-rose-500', TCP: 'bg-orange-500',
  DMS: 'bg-cyan-500', MOBILITY: 'bg-indigo-500', QOE: 'bg-teal-500',
};

/* ─────────── DIMENSIONS DATA ─────────── */
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
      { dimension: 'Site / Cellule', values: 'Site & Cell names', description: 'Physical site & cell aggregation' },
      { dimension: 'Bande', values: 'NR_3500, NR_700, LTE2600, LTE2100, LTE1800, LTE800, LTE700', description: 'Radio frequency band' },
    ]
  },
  {
    title: 'Device & Capability', icon: <Cpu className="w-5 h-5" />,
    entries: [
      { dimension: '5G_capability', values: '5G_capable, non_5G_capable', description: 'User Equipment 5G capability flag' },
      { dimension: 'device_brand', values: 'iphone, samsung, other', description: 'Device manufacturer category' },
      { dimension: 'os', values: 'android, ios, other', description: 'Operating system classification' },
      { dimension: 'client', values: 'FWA, Mobile', description: 'Access type' },
    ]
  },
  {
    title: 'RAT', icon: <Wifi className="w-5 h-5" />,
    entries: [{ dimension: 'RAT', values: '5G_SA, 5G_NSA, 4G, 3G, 2G, WiFi', description: 'Access technology used during the session' }]
  },
  {
    title: 'ARCEP Zone', icon: <ShieldAlert className="w-5 h-5" />,
    entries: [{ dimension: 'ARCEP', values: 'top15, Intermidiare, rural, AXE, TGV', description: 'Regulatory geographical classification' }]
  },
  {
    title: 'Application', icon: <Layers className="w-5 h-5" />,
    entries: [{ dimension: 'Application', values: 'Social, Streaming, WEB', description: 'Traffic classification by application type' }]
  },
  {
    title: 'Service Provider / AS', icon: <Globe className="w-5 h-5" />,
    entries: [{ dimension: 'Service_Provider', values: 'Google, Meta, Microsoft, Amazone, Other', description: 'Content provider / AS grouping' }]
  },
  {
    title: 'POP', icon: <Database className="w-5 h-5" />,
    entries: [{ dimension: 'POP', values: 'CNM, CNL', description: 'Core Network Point of Presence' }]
  },
];

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
const DocumentationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DocTab>('kpi');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');

  const tabs: { id: DocTab; label: string; icon: React.ReactNode }[] = [
    { id: 'topo', label: 'Topologie', icon: <Globe className="w-4 h-4" /> },
    { id: 'kpi', label: 'KPI Réseau', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'dimensions', label: 'Dimensions', icon: <Layers className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── HEADER ── */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="px-8 pt-6 pb-0">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">QOEBIT Catalogue Officiel</p>
                <h1 className="text-2xl font-black tracking-tight text-foreground">Référentiel KPI Réseau</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Nouveau Standard • Focus 4G/5G v2.5</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher (ID, groupe, nom, formule, usage…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-80 pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Group filter (KPI tab only) */}
              {activeTab === 'kpi' && (
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                    className="pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
                  >
                    <option value="ALL">Tous les groupes</option>
                    {KPI_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                <Download className="w-4 h-4" />
                Export PDF/CSV
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className="flex gap-1 mt-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearch(''); setGroupFilter('ALL'); }}
                className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'bg-background border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 max-w-7xl">
          {activeTab === 'topo' && <TopoSection search={search} />}
          {activeTab === 'kpi' && <KPISection search={search} groupFilter={groupFilter} />}
          {activeTab === 'dimensions' && <DimensionsSection search={search} />}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════ TOPO TAB ═══════════════════ */
const TopoSection: React.FC<{ search: string }> = ({ search }) => {
  const filtered = topoFields.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()) || f.usage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{filtered.length} champs topologiques</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((f, i) => (
          <div key={i} className="group rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {f.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground">{f.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                <span className="inline-block mt-2.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-accent text-accent-foreground">
                  {f.usage}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════ KPI TAB (inspired by screenshot) ═══════════════════ */
const KPISection: React.FC<{ search: string; groupFilter: string }> = ({ search, groupFilter }) => {
  const filtered = useMemo(() => kpiData.filter(k => {
    const matchSearch = !search ||
      k.id.toLowerCase().includes(search.toLowerCase()) ||
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      k.formula.toLowerCase().includes(search.toLowerCase()) ||
      k.group.toLowerCase().includes(search.toLowerCase()) ||
      k.usage.toLowerCase().includes(search.toLowerCase());
    const matchGroup = groupFilter === 'ALL' || k.group === groupFilter;
    return matchSearch && matchGroup;
  }), [search, groupFilter]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{filtered.length} KPIs</span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-4 px-5 pb-3 border-b border-border">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KPI ID</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Identity & Group</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Logical Formula</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Monitoring Usage</span>
      </div>

      {/* KPI Rows */}
      <div className="divide-y divide-border">
        {filtered.map((kpi) => (
          <div key={kpi.id} className="group grid grid-cols-[80px_1fr_1fr_1fr] gap-4 px-5 py-5 hover:bg-muted/30 transition-colors items-start">
            {/* ID */}
            <div>
              <span className="inline-block px-2.5 py-1 rounded-lg bg-muted text-[11px] font-mono font-bold text-muted-foreground">
                {kpi.id}
              </span>
            </div>

            {/* Identity & Group */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${groupColors[kpi.group] || 'bg-primary'}`} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{kpi.group}</span>
              </div>
              <h3 className="text-sm font-bold text-foreground font-mono underline decoration-dotted underline-offset-4">{kpi.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-bold uppercase">Unit: {kpi.unit}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-foreground text-background font-bold uppercase">Standard V2.5</span>
              </div>
            </div>

            {/* Formula */}
            <div className="flex items-start pt-1">
              <div className="px-4 py-2.5 rounded-xl bg-foreground text-background font-mono text-xs leading-relaxed max-w-full">
                {kpi.formula}
              </div>
            </div>

            {/* Usage */}
            <div className="flex items-start gap-3 pt-1">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed italic flex-1">{kpi.usage}</p>
              <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════ DIMENSIONS TAB ═══════════════════ */
const DimensionsSection: React.FC<{ search: string }> = ({ search }) => {
  return (
    <div className="space-y-8">
      {dimSections.map((section, si) => {
        const filtered = section.entries.filter(e =>
          !search || e.dimension.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase()) || e.values.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return null;
        return (
          <div key={si}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">{section.icon}</div>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground uppercase">{filtered.length} dimensions</span>
            </div>
            <div className="grid gap-3">
              {filtered.map((e, ei) => (
                <div key={ei} className="group rounded-xl border border-border bg-card p-5 hover:shadow-md hover:border-primary/20 transition-all">
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <h3 className="font-mono text-sm font-bold text-foreground">{e.dimension}</h3>
                    <p className="text-xs text-muted-foreground text-right">{e.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.values.split(', ').map((v, vi) => (
                      <span key={vi} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
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
