import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Network, Database, Search, ShieldCheck, FileText,
  Send, RotateCcw, X, Bot, MessageSquare, Cpu
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/* ── Agent definitions adapted to QOEBIT ── */
interface QAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  group: 'lead' | 'analyst' | 'specialist' | 'monitor';
  icon: React.ReactNode;
  color: string;
  status: 'active' | 'standby' | 'offline';
  description: string;
}

const qAgents: QAgent[] = [
  { id: 'ORCHESTRATOR', name: 'QOEBIT', emoji: '🧠', role: 'Orchestrateur', group: 'lead', icon: <Cpu size={18} />, color: 'border-primary/50', status: 'active', description: 'Routage intelligent et classification des requêtes vers les agents spécialisés.' },
  { id: 'PULSE', name: 'PULSE', emoji: '📊', role: 'KPI Analytics', group: 'analyst', icon: <Activity size={18} />, color: 'border-emerald-500/50', status: 'active', description: 'Analyse des KPIs QoE : débit, latence, DMS, RTT. Benchmarks et tendances.' },
  { id: 'TOPO', name: 'TOPO', emoji: '🗺️', role: 'Topology & Inventory', group: 'specialist', icon: <Network size={18} />, color: 'border-blue-500/50', status: 'active', description: 'Inventaire réseau, sites, cellules, paramètres d\'antennes.' },
  { id: 'PARMY', name: 'PARMY', emoji: '⚙️', role: 'Parameter Audit', group: 'specialist', icon: <Database size={18} />, color: 'border-amber-500/50', status: 'active', description: 'Audit et conformité des paramètres radio. SQL dynamique.' },
  { id: 'TRACE', name: 'TRACE', emoji: '🔍', role: 'Diagnostic & RCA', group: 'analyst', icon: <Search size={18} />, color: 'border-purple-500/50', status: 'active', description: 'Root Cause Analysis, corrélation croisée, recommandations.' },
  { id: 'SENTINEL', name: 'SENTINEL', emoji: '🛡️', role: 'Monitoring & Alerts', group: 'monitor', icon: <ShieldCheck size={18} />, color: 'border-red-500/50', status: 'standby', description: 'Surveillance proactive des seuils, alertes anomalies.' },
  { id: 'ANALYTIC', name: 'ANALYTIC', emoji: '📑', role: 'Reporting & Export', group: 'analyst', icon: <FileText size={18} />, color: 'border-cyan-500/50', status: 'active', description: 'Génération de rapports PPT/PDF et exports analytiques.' },
];

const groupLabels: Record<string, string> = {
  lead: '🎯 Lead',
  analyst: '📈 Analystes',
  specialist: '🔧 Spécialistes',
  monitor: '🛡️ Monitoring',
};

const statusDot: Record<string, string> = {
  active: 'bg-emerald-500',
  standby: 'bg-amber-400',
  offline: 'bg-muted-foreground/40',
};

interface ChatMsg { role: 'user' | 'agent'; content: string; }

export default function AdminAITeamPage() {
  const [selectedAgent, setSelectedAgent] = useState<QAgent | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [dbAgents, setDbAgents] = useState<Record<string, { is_active: boolean; base_prompt: string | null }>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('admin_agents').select('name, is_active, base_prompt').then(({ data }) => {
      if (data) {
        const map: typeof dbAgents = {};
        data.forEach(a => { map[a.name] = { is_active: a.is_active, base_prompt: a.base_prompt }; });
        setDbAgents(map);
      }
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, selectedAgent]);

  const agentMsgs = selectedAgent ? (chatMessages[selectedAgent.id] || []) : [];

  const sendMessage = () => {
    if (!input.trim() || !selectedAgent) return;
    const agentId = selectedAgent.id;
    const userMsg: ChatMsg = { role: 'user', content: input.trim() };
    setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg] }));
    setInput('');
    setTyping(true);

    // Simulate agent response
    setTimeout(() => {
      const responses: Record<string, string[]> = {
        ORCHESTRATOR: ['Requête classifiée. Routage vers l\'agent spécialisé…', 'Analyse en cours, je coordonne les agents.'],
        PULSE: ['Analyse KPI lancée. Débit DL moyen : 45.2 Mbps, RTT : 32ms.', 'Tendance positive sur les 7 derniers jours.'],
        TOPO: ['152 sites actifs dans la zone sélectionnée.', 'Couverture 5G : 78% sur la plaque Nord.'],
        PARMY: ['Audit paramètres : 3 anomalies détectées sur LNCEL.', 'Distribution conforme à 94%.'],
        TRACE: ['RCA initiée. Corrélation trouvée avec changement de tilt.', 'Impact estimé : -12% sur le débit DL.'],
        SENTINEL: ['Surveillance active. 2 alertes en attente de traitement.', 'Seuil critique dépassé sur RTT data.'],
        ANALYTIC: ['Rapport généré. Export PDF disponible.', 'Dashboard mis à jour avec les dernières données.'],
      };
      const pool = responses[agentId] || ['Traitement en cours…'];
      const reply: ChatMsg = { role: 'agent', content: pool[Math.floor(Math.random() * pool.length)] };
      setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), reply] }));
      setTyping(false);
    }, 1500);
  };

  const resetChat = () => {
    if (selectedAgent) {
      setChatMessages(prev => ({ ...prev, [selectedAgent.id]: [] }));
    }
  };

  const groups = ['lead', 'analyst', 'specialist', 'monitor'] as const;

  return (
    <div className="flex h-full gap-0 overflow-hidden -m-6">
      {/* Left: Agent cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">AI Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Agents QOEBIT — Architecture multi-agents spécialisés</p>
        </div>

        {groups.map(group => {
          const groupAgents = qAgents.filter(a => a.group === group);
          if (!groupAgents.length) return null;
          return (
            <div key={group}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{groupLabels[group]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupAgents.map(agent => {
                  const dbInfo = dbAgents[agent.name];
                  const isSelected = selectedAgent?.id === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className={`w-full text-left rounded-xl border ${agent.color} bg-card p-4 transition-all hover:shadow-md hover:shadow-primary/5 ${
                        isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{agent.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{agent.name}</span>
                            <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
                            {dbInfo && !dbInfo.is_active && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 font-semibold">OFF</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{agent.role}</p>
                        </div>
                        <MessageSquare size={14} className="text-muted-foreground" />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">{agent.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: Chat panel (slide-in) */}
      <div className={`transition-all duration-300 border-l border-border bg-card flex flex-col ${
        selectedAgent ? 'w-[380px]' : 'w-0 overflow-hidden'
      }`}>
        {selectedAgent && (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
              <span className="text-xl">{selectedAgent.emoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-foreground">{selectedAgent.name}</span>
                <p className="text-[10px] text-muted-foreground">{selectedAgent.role}</p>
              </div>
              <button onClick={resetChat} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Reset">
                <RotateCcw size={14} />
              </button>
              <button onClick={() => setSelectedAgent(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {agentMsgs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-50">
                  <Bot size={32} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Démarrez une conversation avec {selectedAgent.name}</p>
                </div>
              )}
              {agentMsgs.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-secondary text-secondary-foreground px-3 py-2 rounded-xl rounded-bl-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border shrink-0">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder={`Message ${selectedAgent.name}...`}
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="icon" onClick={sendMessage} disabled={!input.trim()} className="h-8 w-8">
                  <Send size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
