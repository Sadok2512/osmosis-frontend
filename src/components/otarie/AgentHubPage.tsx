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
    id: 'PULSE',
    name: 'PULSE',
    role: 'Performance & KPI Analytics',
    icon: <Activity className="w-6 h-6" />,
    color: 'border-emerald-500/40 ring-emerald-500/20',
    gradient: 'from-emerald-500/15 to-emerald-600/5',
    status: 'active',
    tasks: [
      'Analyse des KPIs QoE (débit, latence, DMS, RTT)',
      'Benchmarks comparatifs inter-dimensions (Vendor, DOR, Plaque)',
      'Détection des top dégradations et meilleures performances',
      'Génération de rapports de tendances temporelles',
      'Calcul de z-scores et percentiles depuis ml_features',
    ],
    dataSources: ['kpi_qoe_aggregated', 'ml_features', 'kpi_catalog'],
    capabilities: ['Time-series analysis', 'Top-N ranking', 'Trend detection', 'Statistical scoring'],
  },
  {
    id: 'TOPO',
    name: 'TOPO',
    role: 'Network Topology & Inventory',
    icon: <Network className="w-6 h-6" />,
    color: 'border-blue-500/40 ring-blue-500/20',
    gradient: 'from-blue-500/15 to-blue-600/5',
    status: 'active',
    tasks: [
      'Inventaire structurel des sites et cellules',
      'Requêtes sur les paramètres d\'antennes (tilt, azimut, HBA)',
      'Statistiques de couverture par technologie et bande',
      'Analyse géographique et topologique du réseau',
      'Suivi des mises en service et états des cellules',
    ],
    dataSources: ['topo'],
    capabilities: ['SQL queries on topo', 'Inventory stats', 'Geo-analysis', 'Cell state tracking'],
  },
  {
    id: 'PARMY',
    name: 'PARMY',
    role: 'Parameter Audit & SQL Engine',
    icon: <Database className="w-6 h-6" />,
    color: 'border-amber-500/40 ring-amber-500/20',
    gradient: 'from-amber-500/15 to-amber-600/5',
    status: 'active',
    tasks: [
      'Audit et conformité des paramètres radio (LNCEL, NRCELL, LNBTS)',
      'Génération dynamique de requêtes SQL sur parameter_dump',
      'Distribution et cross-tabulation des valeurs de paramètres',
      'Détection d\'anomalies et d\'outliers dans les configurations',
      'Validation Check sur niveaux agrégés (Vendor, DOR, Plaque, Bande, Zone ARCEP)',
    ],
    dataSources: ['parameter_dump', 'parameter_changes'],
    capabilities: ['SQL generation', 'Distribution analysis', 'Cross-tab', 'Anomaly detection', 'Check validation'],
  },
  {
    id: 'TRACE',
    name: 'TRACE',
    role: 'Deep Diagnostic & RCA',
    icon: <Search className="w-6 h-6" />,
    color: 'border-purple-500/40 ring-purple-500/20',
    gradient: 'from-purple-500/15 to-purple-600/5',
    status: 'active',
    tasks: [
      'Root Cause Analysis (RCA) approfondie',
      'Corrélation croisée entre KPIs et changements de paramètres',
      'Analyse temporelle des incidents et dégradations',
      'Identification des causes racines via parameter_changes',
      'Recommandations d\'actions correctives contextuelles',
    ],
    dataSources: ['kpi_qoe_aggregated', 'parameter_changes', 'ml_features', 'rag_documents'],
    capabilities: ['Correlation analysis', 'Timeline reconstruction', 'Impact assessment', 'RAG-enhanced diagnosis'],
  },
  {
    id: 'SENTINEL',
    name: 'SENTINEL',
    role: 'Proactive Monitoring & Alerts',
    icon: <ShieldCheck className="w-6 h-6" />,
    color: 'border-red-500/40 ring-red-500/20',
    gradient: 'from-red-500/15 to-red-600/5',
    status: 'standby',
    tasks: [
      'Surveillance proactive des seuils critiques',
      'Détection précoce des dégradations de QoE',
      'Alertes automatiques sur anomalies statistiques',
      'Monitoring des tendances et prédiction de risques',
      'Escalade intelligente vers TRACE pour RCA',
    ],
    dataSources: ['kpi_qoe_aggregated', 'ml_features', 'kpi_catalog'],
    capabilities: ['Threshold monitoring', 'Anomaly detection', 'Predictive alerts', 'Auto-escalation'],
  },
];

/* ── Connection definitions ── */
interface Connection {
  from: string;
  to: string;
  label: string;
  type: 'data' | 'escalation' | 'validation';
}

const connections: Connection[] = [
  { from: 'PULSE', to: 'TRACE', label: 'Escalade dégradation', type: 'escalation' },
  { from: 'SENTINEL', to: 'TRACE', label: 'Auto-escalade RCA', type: 'escalation' },
  { from: 'PARMY', to: 'PULSE', label: 'Check validation', type: 'validation' },
  { from: 'TOPO', to: 'PARMY', label: 'Contexte réseau', type: 'data' },
  { from: 'TRACE', to: 'PARMY', label: 'Corrélation paramètres', type: 'data' },
  { from: 'SENTINEL', to: 'PULSE', label: 'Alerte KPI', type: 'escalation' },
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
  const [expandedId, setExpandedId] = useState<string | null>('PULSE');
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
        const { data } = await supabase
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
              Back to QOEBIT
            </button>
          )}
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
              <Cpu className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">QOEBIT Agent Hub</h1>
              <p className="text-sm text-muted-foreground mt-1">Architecture multi-agents — Routage intelligent et spécialisation métier</p>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 mt-6">
            {[
              { label: 'Agents actifs', value: agents.filter(a => a.status === 'active').length, icon: <Sparkles size={14} /> },
              { label: 'Connexions', value: connections.length, icon: <GitBranch size={14} /> },
              { label: 'Tables connectées', value: [...new Set(agents.flatMap(a => a.dataSources))].length, icon: <Database size={14} /> },
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
                <span className="text-xs font-bold text-foreground mt-2">QOEBIT Orchestrator</span>
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
                    <span className="text-xs font-bold text-foreground w-20">{conn.from}</span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <span className="text-xs font-bold text-foreground w-20">{conn.to}</span>
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
                { agent: 'PULSE', triggers: ['QoE, débit, latence, DMS, RTT', 'top/worst dégradations', 'comparaisons inter-dimensions', 'tendances et benchmarks'] },
                { agent: 'TOPO', triggers: ['inventaire sites/cellules', 'azimut, tilt, HBA', 'couverture par techno/bande', 'état cellules, mises en service'] },
                { agent: 'PARMY', triggers: ['paramètres radio (LNCEL, NRCELL)', 'audit conformité', 'distribution paramètres', 'SQL sur parameter_dump'] },
                { agent: 'TRACE', triggers: ['RCA, diagnostic', 'corrélation incidents', 'analyse causes racines', 'impact changements'] },
                { agent: 'SENTINEL', triggers: ['alertes proactives', 'surveillance seuils', 'anomalies statistiques', 'prédiction dégradations'] },
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
