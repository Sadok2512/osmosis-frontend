import React, { useState, useEffect } from 'react';
import {
  Sparkles, Activity, Network, ShieldCheck, AlertTriangle, Cpu,
  ArrowRight, ChevronDown, ChevronUp, Zap, Database, Search,
  BarChart2, FileText, Target, Layers, GitBranch, Radio, ArrowLeft, Brain
} from 'lucide-react';
import { AppTab } from '../../types';
import { supabase } from '@/integrations/supabase/client';

/* ── Agent definitions ── */
interface SubAgent {
  id: string;
  name: string;
  role: string;
  icon: React.ReactNode;
  color: string;          // tailwind ring/border accent
  gradient: string;       // card header gradient
  status: 'active' | 'standby';
  tasks: string[];
  dataSources: string[];
  capabilities: string[];
}

const agents: SubAgent[] = [
  {
    // Path A spec rename (2026-05-11) — canonical 5 specialist agents.
    // PULSE+TOPO absorbed into NEXUS layer (deterministic helper, not displayed here).
    // SENTINEL+TRACE fused into RCAI. PARMY→OPTIMUS. ANALYTIC→ECHO (+ learning).
    // AEGIS + EXA added. OSMOSIS is the orchestrator above this hub, not a specialist.
    id: 'RCAI',
    name: 'RCAI',
    role: 'Diagnostic, Anomaly Detection & RCA',
    icon: <Search className="w-6 h-6" />,
    color: 'border-purple-500/40 ring-purple-500/20',
    gradient: 'from-purple-500/15 to-purple-600/5',
    status: 'active',
    tasks: [
      'Détection d\'anomalies (seuils CSSR/drop/throughput/PRB, tendances 7j)',
      'Analyse des KPIs QoE (débit, latence, DMS, RTT)',
      'Top dégradations et benchmarks inter-dimensions (Vendor, DOR, Plaque)',
      'Root Cause Analysis (RCA) approfondie — méthodologie 5 étapes',
      'Corrélation KPI ↔ changements CM ↔ alarmes ↔ topologie co-site',
      'Lecture prioritaire de ml_anomaly_15m et ml_rca_hypothesis (pipeline ML)',
    ],
    dataSources: ['kpi_qoe_aggregated', 'ml_features', 'ml_anomaly_15m', 'ml_rca_hypothesis', 'parameter_changes', 'fm_alarms_nokia', 'fm_alarms_ericsson'],
    capabilities: ['Threshold monitoring', 'Anomaly detection', 'Top-N ranking', 'Trend detection', 'Correlation analysis', 'Timeline reconstruction', 'RAG-enhanced diagnosis'],
  },
  {
    id: 'OPTIMUS',
    name: 'OPTIMUS',
    role: 'Recommendation & Optimization (Propose-Only)',
    icon: <Database className="w-6 h-6" />,
    color: 'border-amber-500/40 ring-amber-500/20',
    gradient: 'from-amber-500/15 to-amber-600/5',
    status: 'active',
    tasks: [
      'Audit et conformit\u00e9 des param\u00e8tres radio (pMax, qRxLevMin, MIMO, 256QAM)',
      'Configuration Network Slicing (S-NSSAI, 5QI mapping, coh\u00e9rence inter-vendor)',
      'Audit mobilit\u00e9 (A3/A5 offsets, TTT, hyst\u00e9r\u00e9sis HO)',
      'Contr\u00f4le puissance TX par bande (LTE pMax, NR maxTxPower)',
      'Coh\u00e9rence inter-secteurs (delta >20% = anomalie)',
      'G\u00e9n\u00e9ration de propositions d\'optimisation (ml_optimization_proposal)',
      'Propose-only : aucune \u00e9criture CM, aucun push vers le SON vendor',
    ],
    dataSources: ['param_dump', 'cm_history_nokia', 'ref_slice_5qi_map', 'ref_counters', 'ml_optimization_proposal'],
    capabilities: ['Param audit', 'Slice audit', 'Power audit', 'Mobility check', 'Recommendation generation', 'Sector consistency', 'Propose-only lock'],
  },
  {
    id: 'AEGIS',
    name: 'AEGIS',
    role: 'Risk & Tier Classification (T1/T2/T3)',
    icon: <ShieldCheck className="w-6 h-6" />,
    color: 'border-red-500/40 ring-red-500/20',
    gradient: 'from-red-500/15 to-red-600/5',
    status: 'active',
    tasks: [
      'Classification de chaque proposition en tier T1/T2/T3',
      'Matrice (réversibilité × blast_radius), max sur les deux axes',
      'Détection sites interdits (VIP, EXAM_CENTER, HOSPITAL) → escalade tier',
      'Validation du plan de rollback pour tier T3',
      'Évaluation des règles policy (change windows, capping)',
      'Label d\'affichage uniquement — jamais une porte d\'exécution',
    ],
    dataSources: ['ml_optimization_proposal', 'ml_rca_hypothesis', 'topo_data', 'ai_policy_rules'],
    capabilities: ['Tier classification', 'Risk scoring', 'Blast radius calc', 'Policy evaluation', 'Display-only safety'],
  },
  {
    id: 'EXA',
    name: 'EXA',
    role: 'Export & Vendor Handoff (Skeleton)',
    icon: <FileText className="w-6 h-6" />,
    color: 'border-cyan-500/40 ring-cyan-500/20',
    gradient: 'from-cyan-500/15 to-cyan-600/5',
    status: 'standby',
    tasks: [
      'Export proposition status=SHARED → fichier handoff structuré',
      'Dépôt du fichier à un emplacement défini (S3 ou disque)',
      'L\'ingénieur applique manuellement dans NetAct / ENM / U2020 / CognitiV',
      'Aucun push CM, aucun appel NetConf/MML/REST vers le NBI vendor',
      'CI guard tests/test_no_write_actuators.py couvre la zone',
      'Squelette v1 — format d\'export à figer en v1.1',
    ],
    dataSources: ['ml_optimization_proposal', 'ai_audit_log'],
    capabilities: ['Export skeleton', 'Vendor file handoff', 'Audit log emission', 'No-actuator lock'],
  },
  {
    id: 'ECHO',
    name: 'ECHO',
    role: 'Learning, Reporting & Synthesis',
    icon: <Brain className="w-6 h-6" />,
    color: 'border-emerald-500/40 ring-emerald-500/20',
    gradient: 'from-emerald-500/15 to-emerald-600/5',
    status: 'active',
    tasks: [
      'Boucle d\'apprentissage post-exécution : delta KPI réel vs prédit',
      'Mise à jour des scores de confiance des playbooks (Bayesian moving avg)',
      'Génération de rapports hebdomadaires et exécutifs',
      'Synthèse multi-agents avec traçabilité des sources',
      'Diagnostics cellule complets (KPIs + params + alarmes + RCA)',
      'Recommandations actionnables avec priorisation P1/P2/P3',
    ],
    dataSources: ['ml_optimization_proposal', 'ml_outcome_observation', 'ai_audit_log', 'pm_15m', 'kpi_definition'],
    capabilities: ['Post-execution learning', 'Confidence scoring', 'Weekly reports', 'Executive summary', 'Cross-agent synthesis'],
  },
];

/* ── Connection definitions ── */
interface Connection {
  from: string;
  to: string;
  label: string;
  type: 'data' | 'escalation' | 'validation';
}

// Path A canonical DAG (2026-05-11): NEXUS (layer) → RCAI → OPTIMUS → AEGIS → EXA → ECHO.
// Feedback edge ECHO → RCAI carries skill_confidence updates back to anomaly detection.
const connections: Connection[] = [
  { from: 'RCAI',    to: 'OPTIMUS', label: 'Hypothèse RCA → proposition',  type: 'data' },
  { from: 'OPTIMUS', to: 'AEGIS',   label: 'Proposition → classification', type: 'validation' },
  { from: 'AEGIS',   to: 'EXA',     label: 'Tier OK → export handoff',     type: 'data' },
  { from: 'EXA',     to: 'ECHO',    label: 'Export émis → observation',    type: 'data' },
  { from: 'ECHO',    to: 'RCAI',    label: 'Confidence ↑/↓ feedback',      type: 'escalation' },
  { from: 'ECHO',    to: 'OPTIMUS', label: 'Playbook score',               type: 'validation' },
];

const connectionColors: Record<Connection['type'], string> = {
  data: 'bg-blue-500/80',
  escalation: 'bg-red-500/80',
  validation: 'bg-amber-500/80',
};

const connectionLabels: Record<Connection['type'], string> = {
  data: 'Données',
  escalation: 'Escalade',
  validation: 'Validation',
};

/* ── Agent Card ── */
const AgentCard: React.FC<{ agent: SubAgent; isExpanded: boolean; onToggle: () => void }> = ({ agent, isExpanded, onToggle }) => (
  <div className={`rounded-2xl border ${agent.color} ring-1 bg-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5`}>
    {/* Header */}
    <div className={`bg-gradient-to-r ${agent.gradient} p-5 flex items-center justify-between`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-background/80 backdrop-blur-sm flex items-center justify-center border border-border/50 shadow-sm">
          {agent.icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-foreground">{agent.name}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              agent.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
              {agent.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{agent.role}</p>
        </div>
      </div>
      <button onClick={onToggle} className="p-2 rounded-lg hover:bg-background/50 transition-colors text-muted-foreground">
        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
    </div>

    {/* Capabilities chips */}
    <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-border/50">
      {agent.capabilities.map((cap) => (
        <span key={cap} className="px-2.5 py-1 rounded-md bg-muted/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {cap}
        </span>
      ))}
    </div>

    {/* Expanded: tasks + data sources */}
    {isExpanded && (
      <div className="p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">
        {/* Tasks */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Target size={14} className="text-primary" /> Missions
          </h4>
          <ul className="space-y-2">
            {agent.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <Zap size={14} className="text-primary mt-0.5 shrink-0" />
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Data sources */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Database size={14} className="text-primary" /> Sources de données
          </h4>
          <div className="flex flex-wrap gap-2">
            {agent.dataSources.map((ds) => (
              <span key={ds} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold border border-primary/20">
                <Layers size={12} />
                {ds}
              </span>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);

/* ── Main Page ── */
const AgentHubPage: React.FC<{ onNavigate?: (tab: AppTab) => void }> = ({ onNavigate }) => {
  const [expandedId, setExpandedId] = useState<string | null>('RCAI');
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [skillCounts, setSkillCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchMemory = async () => {
      try {
        const { data } = await (supabase as any)
          .from('agent_memory')
          .select('agent');
        if (data && Array.isArray(data)) {
          const counts: Record<string, number> = {};
          data.forEach((row: any) => {
            const a = row.agent || 'UNKNOWN';
            counts[a] = (counts[a] || 0) + 1;
          });
          setMemoryCounts(counts);
        }
      } catch { /* fallback: empty */ }
    };

    const fetchSkills = async () => {
      try {
        // Fetch skills with their agent name via admin_agents join
        const { data } = await (supabase as any)
          .from('agent_skills')
          .select('agent_id, admin_agents!inner(name)')
          .eq('is_active', true);
        if (data && Array.isArray(data)) {
          const counts: Record<string, number> = {};
          data.forEach((row: any) => {
            const agentName = row.admin_agents?.name || 'UNKNOWN';
            counts[agentName] = (counts[agentName] || 0) + 1;
          });
          setSkillCounts(counts);
        }
      } catch { /* fallback: empty */ }
    };

    fetchMemory();
    fetchSkills();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-6 py-10">
          {onNavigate && (
            <button
              onClick={() => onNavigate('ai_assistant')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors mb-4 border border-primary/20"
            >
              <ArrowLeft size={16} />
              Back to OSMOSIS
            </button>
          )}
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
              <Cpu className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">OSMOSIS Agent Hub</h1>
              <p className="text-sm text-muted-foreground mt-1">Architecture multi-agents — Routage intelligent et spécialisation métier</p>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 mt-6">
            {[
              { label: 'Agents actifs', value: agents.filter(a => a.status === 'active').length, icon: <Sparkles size={14} /> },
              { label: 'Connexions', value: connections.length, icon: <GitBranch size={14} /> },
              { label: 'Tables connectées', value: [...new Set(agents.flatMap(a => a.dataSources))].length, icon: <Database size={14} /> },
              { label: 'Skills', value: Object.values(skillCounts).reduce((s, c) => s + c, 0), icon: <Zap size={14} className="text-amber-500" /> },
              { label: 'Capacités', value: agents.reduce((s, a) => s + a.capabilities.length, 0), icon: <Zap size={14} /> },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border">
                <span className="text-primary">{stat.icon}</span>
                <span className="text-lg font-bold text-foreground">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* ── Connection Diagram ── */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <GitBranch size={18} className="text-primary" />
            Diagramme de Connexions
          </h2>

          {/* Visual flow diagram */}
          <div className="rounded-2xl border border-border bg-card p-8 overflow-x-auto">
            {/* Agent nodes in a hub-spoke layout */}
            <div className="min-w-[700px]">
              {/* Central orchestrator */}
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
                  <Radio className="w-8 h-8 text-primary" />
                </div>
                <span className="text-xs font-bold text-foreground mt-2">OSMOSIS Orchestrator</span>
                <span className="text-[10px] text-muted-foreground">Routage & Classification</span>
              </div>

              {/* Agent row */}
              <div className="grid grid-cols-5 gap-4 mb-8">
                {agents.map((agent) => {
                  const memCount = memoryCounts[agent.id] || 0;
                  const skillCount = skillCounts[agent.id] || 0;
                  return (
                    <div key={agent.id} className="flex flex-col items-center">
                      <div className="w-2 h-8 bg-gradient-to-b from-primary/30 to-transparent rounded-full mb-2" />
                      <div className={`w-16 h-16 rounded-xl border-2 ${agent.color} bg-background flex items-center justify-center shadow-md`}>
                        {agent.icon}
                      </div>
                      <span className="text-xs font-bold text-foreground mt-2">{agent.name}</span>
                      <span className="text-[9px] text-muted-foreground text-center leading-tight mt-0.5 max-w-[100px]">{agent.role}</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                          <Brain size={10} className="text-primary" />
                          <span className="text-[9px] font-bold text-primary">{memCount}</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                          <Zap size={10} className="text-amber-500" />
                          <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">{skillCount}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Connection lines as a table */}
              <div className="space-y-2">
                {connections.map((conn, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5 w-28">
                      <span className="text-xs font-bold text-foreground">{conn.from}</span>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <div className="flex items-center gap-1.5 w-28">
                      <span className="text-xs font-bold text-foreground">{conn.to}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white ${connectionColors[conn.type]}`}>
                      {connectionLabels[conn.type]}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{conn.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3">
            {Object.entries(connectionLabels).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full ${connectionColors[type as Connection['type']]}`} />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Agent Cards ── */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Layers size={18} className="text-primary" />
            Agents Spécialisés
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isExpanded={expandedId === agent.id}
                onToggle={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
              />
            ))}
          </div>
        </section>

        {/* ── Routing Logic ── */}
        <section className="pb-10">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <BarChart2 size={18} className="text-primary" />
            Logique de Routage
          </h2>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { agent: 'RCAI',    triggers: ['QoE, débit, latence, DMS, RTT', 'top/worst dégradations', 'alertes anomalies / seuils CSSR/drop/throughput', 'RCA, diagnostic, corrélation incidents', 'fusion ex-PULSE / ex-SENTINEL / ex-TRACE'] },
                { agent: 'OPTIMUS', triggers: ['slice configuration, 5QI, S-NSSAI', 'paramètres radio (pMax, HO, RACH)', 'audit conformité & cohérence secteurs', 'mobilité, puissance, admission control', 'génération propositions (propose-only)'] },
                { agent: 'AEGIS',   triggers: ['classification tier T1/T2/T3', 'blast radius + r\u00e9versibilit\u00e9', 'sites interdits (VIP/EXAM/HOSPITAL)', '\u00e9valuation policy & change windows', 'label d\'affichage uniquement'] },
                { agent: 'EXA',     triggers: ['export fichier handoff vendor', 'NetAct / ENM / U2020 / CognitiV', 'aucun push CM (propose-only)', 'squelette v1'] },
                { agent: 'ECHO',    triggers: ['apprentissage post-exécution', 'delta KPI réel vs prédit', 'rapports hebdo/exécutifs', 'synthèse multi-agents', 'recommandations P1/P2/P3'] },
              ].map((item) => (
                <div key={item.agent} className="p-4 rounded-xl bg-muted/30 border border-border/50">
                  <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    {item.agent}
                  </div>
                  <ul className="space-y-1">
                    {item.triggers.map((t, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ArrowRight size={10} className="shrink-0 text-primary/60" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AgentHubPage;
