import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Network, Database, Search, ShieldCheck, FileText,
  Send, RotateCcw, X, Bot, MessageSquare, Cpu, Plus, Users,
  UserCircle, CheckCircle2, Clock, Sparkles, Trash2, Edit2, Save
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';

/* ── Types ── */
interface QAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  group: 'lead' | 'analyst' | 'specialist' | 'monitor';
  color: string;
  textColor: string;
  status: 'active' | 'standby' | 'offline';
  description: string;
}

interface UserProfile {
  name: string;
  role: string;
  description: string;
  emoji: string;
  color: string;
}

interface DiscussionMessage {
  id: string;
  sender: string; // agent id or 'USER'
  senderEmoji: string;
  senderName: string;
  content: string;
  timestamp: number;
  color: string;
}

interface Discussion {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isEnded: boolean;
  startedBy: string;
  messages: DiscussionMessage[];
  participatingAgents: string[];
}

/* ── Agent definitions ── */
const qAgents: QAgent[] = [
  { id: 'ORCHESTRATOR', name: 'QOEBIT', emoji: '🧠', role: 'Orchestrateur', group: 'lead', color: 'hsl(var(--primary))', textColor: 'text-primary', status: 'active', description: 'Routage intelligent et classification des requêtes vers les agents spécialisés.' },
  { id: 'PULSE', name: 'PULSE', emoji: '📊', role: 'KPI Analytics', group: 'analyst', color: '#3dd68c', textColor: 'text-emerald-400', status: 'active', description: 'Analyse des KPIs QoE : débit, latence, DMS, RTT.' },
  { id: 'TOPO', name: 'TOPO', emoji: '🗺️', role: 'Topology & Inventory', group: 'specialist', color: '#4ea8de', textColor: 'text-blue-400', status: 'active', description: 'Inventaire réseau, sites, cellules, paramètres d\'antennes.' },
  { id: 'PARMY', name: 'PARMY', emoji: '⚙️', role: 'Parameter Audit', group: 'specialist', color: '#f59e0b', textColor: 'text-amber-400', status: 'active', description: 'Audit et conformité des paramètres radio.' },
  { id: 'TRACE', name: 'TRACE', emoji: '🔍', role: 'Diagnostic & RCA', group: 'analyst', color: '#a78bfa', textColor: 'text-purple-400', status: 'active', description: 'Root Cause Analysis, corrélation croisée.' },
  { id: 'SENTINEL', name: 'SENTINEL', emoji: '🛡️', role: 'Monitoring & Alerts', group: 'monitor', color: '#ef4444', textColor: 'text-red-400', status: 'standby', description: 'Surveillance proactive des seuils, alertes anomalies.' },
  { id: 'ANALYTIC', name: 'ANALYTIC', emoji: '📑', role: 'Reporting & Export', group: 'analyst', color: '#06b6d4', textColor: 'text-cyan-400', status: 'active', description: 'Génération de rapports PPT/PDF et exports analytiques.' },
];

const agentMap = Object.fromEntries(qAgents.map(a => [a.id, a]));

const groupLabels: Record<string, string> = {
  lead: '🎯 Lead', analyst: '📈 Analystes', specialist: '🔧 Spécialistes', monitor: '🛡️ Monitoring',
};

const statusDot: Record<string, string> = {
  active: 'bg-emerald-500', standby: 'bg-amber-400', offline: 'bg-muted-foreground/40',
};

const PROFILE_KEY = 'qoebit_admin_profile';
const DISCUSSIONS_KEY = 'qoebit_discussions';

function loadProfile(): UserProfile | null {
  try { const r = localStorage.getItem(PROFILE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveProfile(p: UserProfile) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
function loadDiscussions(): Discussion[] {
  try { const r = localStorage.getItem(DISCUSSIONS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveDiscussions(d: Discussion[]) { localStorage.setItem(DISCUSSIONS_KEY, JSON.stringify(d)); }

const profileEmojis = ['👤','👨‍💼','👩‍💼','🧑‍💻','👨‍🔬','👩‍🔬','🦊','🐺','🦅','🐉','⚡','🎯','🚀','💎','🔥','🌟','👑','🎭','🧬','🏴‍☠️'];
const profileColors = ['#e8572a','#3dd68c','#4ea8de','#a78bfa','#f59e0b','#ef4444','#06b6d4','#ec4899','#10b981','#8b5cf6'];

const agentResponses: Record<string, string[]> = {
  ORCHESTRATOR: [
    'D\'après mon analyse, je recommande de vérifier les KPIs de latence sur cette zone.',
    'J\'ai coordonné les agents. PULSE et TRACE confirment une corrélation.',
    'Priorité : investigation sur les cellules à fort trafic dans le secteur Nord.',
  ],
  PULSE: [
    'Le débit DL moyen est de 45.2 Mbps, en hausse de 3% sur 7 jours.',
    'RTT data anormalement élevé : 128ms (seuil : 80ms). Zone impactée : Plaque Sud.',
    'QoE index à 7.2/10, stable. DMS 3s conforme à 92%.',
  ],
  TOPO: [
    '152 sites actifs dans cette zone. 12 cellules en état "dégradé".',
    'Le site SIT_042 a un tilt de 8° — supérieur à la référence (6°).',
    'Couverture 5G : 78% sur la plaque. 3 zones blanches identifiées.',
  ],
  PARMY: [
    'Audit terminé : 3 anomalies détectées sur le paramètre LNCEL.maxTxPower.',
    'Distribution des valeurs conforme à 94%. Écart sur la bande 2100.',
    'Paramètre qRxLevMin modifié sur 28 cellules hier — vérification en cours.',
  ],
  TRACE: [
    'RCA : corrélation trouvée entre changement de tilt (J-3) et dégradation RTT.',
    'Impact estimé : -12% sur le débit DL pour les cellules concernées.',
    'Recommandation : rollback du tilt sur SIT_042, SIT_087.',
  ],
  SENTINEL: [
    '2 alertes critiques en attente. Seuil RTT dépassé sur 5 cellules.',
    'Anomalie détectée : pic de session DCR à 4.2% (seuil : 2%).',
    'Cluster de 8 cellules avec QoE < 5/10 identifié dans la zone Est.',
  ],
  ANALYTIC: [
    'Rapport hebdomadaire généré. 24 pages, 15 graphiques.',
    'Export CSV des KPIs prêt. Période : 7 derniers jours.',
    'Dashboard mis à jour avec les données consolidées.',
  ],
};

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ── Tab type ── */
type TabId = 'agents' | 'discussions';

export default function AdminAITeamPage() {
  const [tab, setTab] = useState<TabId>('agents');
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfile>(profile || { name: '', role: '', description: '', emoji: '👤', color: '#e8572a' });

  // Agent chat state
  const [selectedAgent, setSelectedAgent] = useState<QAgent | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, { role: 'user' | 'agent'; content: string }[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [dbAgents, setDbAgents] = useState<Record<string, { is_active: boolean }>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Discussion state
  const [discussions, setDiscussions] = useState<Discussion[]>(loadDiscussions);
  const [activeDiscId, setActiveDiscId] = useState<string | null>(null);
  const [discInput, setDiscInput] = useState('');
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [discTypingAgents, setDiscTypingAgents] = useState<string[]>([]);
  const discEndRef = useRef<HTMLDivElement>(null);

  const activeDisc = discussions.find(d => d.id === activeDiscId) || null;

  // Load DB agents
  useEffect(() => {
    supabase.from('admin_agents').select('name, is_active').then(({ data }) => {
      if (data) {
        const map: Record<string, { is_active: boolean }> = {};
        data.forEach(a => { map[a.name] = { is_active: a.is_active }; });
        setDbAgents(map);
      }
    });
  }, []);

  // Scroll effects
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, selectedAgent]);
  useEffect(() => { discEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [discussions, activeDiscId, discTypingAgents]);

  // Persist discussions
  useEffect(() => { saveDiscussions(discussions); }, [discussions]);

  /* ── Profile ── */
  const handleSaveProfile = () => {
    if (!profileForm.name.trim()) return;
    setProfile(profileForm);
    saveProfile(profileForm);
    setProfileOpen(false);
  };

  /* ── Agent chat ── */
  const agentMsgs = selectedAgent ? (chatMessages[selectedAgent.id] || []) : [];

  const sendAgentChat = () => {
    if (!chatInput.trim() || !selectedAgent) return;
    const agentId = selectedAgent.id;
    setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), { role: 'user' as const, content: chatInput.trim() }] }));
    setChatInput('');
    setTyping(true);
    setTimeout(() => {
      const pool = agentResponses[agentId] || ['Traitement en cours…'];
      setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), { role: 'agent' as const, content: pool[Math.floor(Math.random() * pool.length)] }] }));
      setTyping(false);
    }, 1500);
  };

  /* ── Discussions ── */
  const createDiscussion = () => {
    if (!newDiscName.trim()) return;
    const disc: Discussion = {
      id: genId(),
      name: newDiscName.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isEnded: false,
      startedBy: profile?.name || 'Admin',
      messages: [],
      participatingAgents: qAgents.map(a => a.id),
    };
    setDiscussions(prev => [disc, ...prev]);
    setActiveDiscId(disc.id);
    setNewDiscName('');
    setNewDiscOpen(false);
  };

  const sendDiscussionMessage = () => {
    if (!discInput.trim() || !activeDisc || activeDisc.isEnded) return;
    const userMsg: DiscussionMessage = {
      id: genId(),
      sender: 'USER',
      senderEmoji: profile?.emoji || '👤',
      senderName: profile?.name || 'Admin',
      content: discInput.trim(),
      timestamp: Date.now(),
      color: profile?.color || '#e8572a',
    };
    setDiscussions(prev => prev.map(d => d.id === activeDiscId ? { ...d, messages: [...d.messages, userMsg], updatedAt: Date.now() } : d));
    setDiscInput('');

    // Agents auto-respond
    triggerAgentResponses(activeDiscId!);
  };

  const triggerAgentResponses = useCallback((discId: string) => {
    // Pick 2-4 random agents to respond
    const respondingCount = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...qAgents].sort(() => Math.random() - 0.5).slice(0, respondingCount);

    setDiscTypingAgents(shuffled.map(a => a.id));

    shuffled.forEach((agent, idx) => {
      setTimeout(() => {
        const pool = agentResponses[agent.id] || ['Compris, je travaille dessus.'];
        const msg: DiscussionMessage = {
          id: genId(),
          sender: agent.id,
          senderEmoji: agent.emoji,
          senderName: agent.name,
          content: pool[Math.floor(Math.random() * pool.length)],
          timestamp: Date.now(),
          color: agent.color,
        };
        setDiscussions(prev => prev.map(d => d.id === discId ? { ...d, messages: [...d.messages, msg], updatedAt: Date.now() } : d));
        setDiscTypingAgents(prev => prev.filter(id => id !== agent.id));
      }, 2000 + idx * 1500);
    });
  }, []);

  const endDiscussion = (discId: string) => {
    setDiscussions(prev => prev.map(d => d.id === discId ? { ...d, isEnded: true, updatedAt: Date.now() } : d));
  };

  const deleteDiscussion = (discId: string) => {
    setDiscussions(prev => prev.filter(d => d.id !== discId));
    if (activeDiscId === discId) setActiveDiscId(null);
  };

  const startAutonomousDiscussion = () => {
    const topics = [
      'Analyse de la dégradation QoE détectée sur la plaque Nord',
      'Revue hebdomadaire des KPIs critiques',
      'Investigation anomalie RTT sur cluster Est',
      'Coordination rollback paramètres site SIT_042',
      'Planification audit 5G zone dense',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const initiator = qAgents[Math.floor(Math.random() * qAgents.length)];
    const disc: Discussion = {
      id: genId(),
      name: topic,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isEnded: false,
      startedBy: initiator.name,
      messages: [{
        id: genId(),
        sender: initiator.id,
        senderEmoji: initiator.emoji,
        senderName: initiator.name,
        content: `Je lance cette discussion : "${topic}". J'ai détecté un point nécessitant une coordination inter-agents.`,
        timestamp: Date.now(),
        color: initiator.color,
      }],
      participatingAgents: qAgents.map(a => a.id),
    };
    setDiscussions(prev => [disc, ...prev]);
    setActiveDiscId(disc.id);

    // Other agents auto-respond after a delay
    setTimeout(() => triggerAgentResponses(disc.id), 2500);
  };

  const groups = ['lead', 'analyst', 'specialist', 'monitor'] as const;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top bar */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">AI Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Agents QOEBIT — Architecture multi-agents spécialisés</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Profile badge */}
          {profile ? (
            <button onClick={() => { setProfileForm(profile); setProfileOpen(true); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: profile.color + '20', color: profile.color }}>{profile.emoji}</span>
              <div className="text-left">
                <div className="text-xs font-bold text-foreground">{profile.name}</div>
                <div className="text-[10px] text-muted-foreground">{profile.role}</div>
              </div>
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
              <UserCircle size={14} className="mr-1.5" /> Setup Profile
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1 shrink-0">
        {[
          { id: 'agents' as TabId, label: 'Agents', icon: Bot },
          { id: 'discussions' as TabId, label: 'Discussions', icon: Users },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-colors ${
            tab === t.id ? 'bg-card text-foreground border-border' : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
          }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 bg-card border-t border-border overflow-hidden">
        {tab === 'agents' && (
          <div className="flex h-full">
            {/* Agent cards */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {groups.map(group => {
                const ga = qAgents.filter(a => a.group === group);
                if (!ga.length) return null;
                return (
                  <div key={group}>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{groupLabels[group]}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {ga.map(agent => {
                        const dbInfo = dbAgents[agent.name];
                        const isSelected = selectedAgent?.id === agent.id;
                        return (
                          <button key={agent.id} onClick={() => setSelectedAgent(agent)}
                            className={`w-full text-left rounded-xl border bg-background p-4 transition-all hover:shadow-md ${
                              isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10 border-primary/30' : 'border-border hover:border-primary/20'
                            }`}>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{agent.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-foreground">{agent.name}</span>
                                  <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
                                  {dbInfo && !dbInfo.is_active && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-semibold">OFF</span>
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

            {/* Agent chat panel */}
            <div className={`transition-all duration-300 border-l border-border bg-background flex flex-col ${selectedAgent ? 'w-[380px]' : 'w-0 overflow-hidden'}`}>
              {selectedAgent && (
                <>
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                    <span className="text-xl">{selectedAgent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-foreground">{selectedAgent.name}</span>
                      <p className="text-[10px] text-muted-foreground">{selectedAgent.role}</p>
                    </div>
                    <button onClick={() => setChatMessages(p => ({ ...p, [selectedAgent.id]: [] }))} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><RotateCcw size={14} /></button>
                    <button onClick={() => setSelectedAgent(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={14} /></button>
                  </div>
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
                          msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                        }`}>{msg.content}</div>
                      </div>
                    ))}
                    {typing && (
                      <div className="flex justify-start">
                        <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-sm flex gap-1">
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-3 border-t border-border shrink-0">
                    <div className="flex gap-2">
                      <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAgentChat()}
                        placeholder={`Message ${selectedAgent.name}...`}
                        className="flex-1 px-3 py-2 rounded-lg bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <Button size="icon" onClick={sendAgentChat} disabled={!chatInput.trim()} className="h-8 w-8"><Send size={14} /></Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'discussions' && (
          <div className="flex h-full">
            {/* Discussion list */}
            <div className="w-72 border-r border-border flex flex-col shrink-0">
              <div className="p-3 border-b border-border space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs" onClick={() => setNewDiscOpen(true)}>
                    <Plus size={12} className="mr-1" /> Nouvelle
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={startAutonomousDiscussion} title="Lancer une discussion autonome IA">
                    <Sparkles size={12} className="mr-1" /> Auto AI
                  </Button>
                </div>
                {newDiscOpen && (
                  <div className="flex gap-1.5">
                    <Input value={newDiscName} onChange={e => setNewDiscName(e.target.value)} placeholder="Nom de la discussion…" className="text-xs h-8"
                      onKeyDown={e => e.key === 'Enter' && createDiscussion()} />
                    <Button size="icon" className="h-8 w-8 shrink-0" onClick={createDiscussion} disabled={!newDiscName.trim()}><Send size={12} /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setNewDiscOpen(false)}><X size={12} /></Button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {discussions.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground opacity-60">
                    Aucune discussion. Créez-en une ou laissez l'IA démarrer.
                  </div>
                )}
                {discussions.map(d => (
                  <button key={d.id} onClick={() => setActiveDiscId(d.id)}
                    className={`w-full text-left px-3 py-3 border-b border-border transition-colors group ${
                      activeDiscId === d.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/50'
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                          {d.isEnded && <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />}
                          {d.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {d.messages.length} msg · Par {d.startedBy}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteDiscussion(d.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Discussion chat */}
            <div className="flex-1 flex flex-col">
              {!activeDisc ? (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div className="space-y-2 opacity-50">
                    <Users size={40} className="mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Sélectionnez ou créez une discussion</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Discussion header */}
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground flex items-center gap-2">
                        {activeDisc.name}
                        {activeDisc.isEnded && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold">TERMINÉE</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Démarrée par {activeDisc.startedBy} · {new Date(activeDisc.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {!activeDisc.isEnded && (
                      <Button size="sm" variant="outline" onClick={() => endDiscussion(activeDisc.id)} className="text-xs">
                        <CheckCircle2 size={12} className="mr-1" /> Terminer
                      </Button>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeDisc.messages.map(msg => {
                      const isUser = msg.sender === 'USER';
                      return (
                        <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ backgroundColor: msg.color + '20' }}>
                            {msg.senderEmoji}
                          </div>
                          <div className={`max-w-[75%] ${isUser ? 'text-right' : ''}`}>
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: msg.color }}>
                              {msg.senderName}
                            </div>
                            <div className={`px-3 py-2 rounded-xl text-xs text-foreground ${
                              isUser ? 'bg-primary/10 rounded-br-sm' : 'bg-secondary rounded-bl-sm'
                            }`}>
                              {msg.content}
                            </div>
                            <div className="text-[9px] text-muted-foreground mt-0.5">
                              {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {discTypingAgents.length > 0 && (
                      <div className="flex gap-2 items-center">
                        <div className="flex -space-x-2">
                          {discTypingAgents.map(id => {
                            const a = agentMap[id];
                            return a ? (
                              <span key={id} className="w-6 h-6 rounded-lg flex items-center justify-center text-xs border-2 border-card"
                                style={{ backgroundColor: a.color + '20' }}>
                                {a.emoji}
                              </span>
                            ) : null;
                          })}
                        </div>
                        <div className="flex gap-1 px-2">
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">répondent…</span>
                      </div>
                    )}
                    <div ref={discEndRef} />
                  </div>

                  {/* Input */}
                  {!activeDisc.isEnded && (
                    <div className="p-3 border-t border-border shrink-0">
                      <div className="flex gap-2">
                        {profile && (
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ backgroundColor: profile.color + '20' }}>
                            {profile.emoji}
                          </span>
                        )}
                        <input value={discInput} onChange={e => setDiscInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendDiscussionMessage()}
                          placeholder="Donner un ordre ou participer…"
                          className="flex-1 px-3 py-2 rounded-lg bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        <Button size="icon" onClick={sendDiscussionMessage} disabled={!discInput.trim()} className="h-8 w-8"><Send size={14} /></Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle size={18} /> Mon Profil
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{ backgroundColor: profileForm.color + '20', color: profileForm.color }}>
                {profileForm.emoji}
              </span>
              <div>
                <div className="text-sm font-bold text-foreground">{profileForm.name || 'Votre nom'}</div>
                <div className="text-xs text-muted-foreground">{profileForm.role || 'Votre rôle'}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Nom</label>
                <Input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="Nom complet…" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Rôle</label>
                <Input value={profileForm.role} onChange={e => setProfileForm(p => ({ ...p, role: e.target.value }))} placeholder="ex: Chef de projet, Ingénieur…" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Description</label>
                <Textarea value={profileForm.description} onChange={e => setProfileForm(p => ({ ...p, description: e.target.value }))} placeholder="Quelques mots…" rows={2} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Avatar</label>
                <div className="flex flex-wrap gap-1.5">
                  {profileEmojis.map(e => (
                    <button key={e} onClick={() => setProfileForm(p => ({ ...p, emoji: e }))}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-muted transition-colors ${
                        profileForm.emoji === e ? 'ring-2 ring-primary bg-primary/10' : 'bg-background border border-border'
                      }`}>{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Couleur</label>
                <div className="flex gap-2">
                  {profileColors.map(c => (
                    <button key={c} onClick={() => setProfileForm(p => ({ ...p, color: c }))}
                      className={`w-7 h-7 rounded-full transition-all ${profileForm.color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={handleSaveProfile} className="w-full" disabled={!profileForm.name.trim()}>
              <Save size={14} className="mr-1.5" /> Sauvegarder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
