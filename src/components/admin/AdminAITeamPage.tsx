import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Network, Database, Search, ShieldCheck, FileText,
  Send, RotateCcw, X, Bot, MessageSquare, Cpu, Plus, Users,
  UserCircle, CheckCircle2, Clock, Sparkles, Trash2, Edit2, Save, Settings2
} from 'lucide-react';
import AdminAgentsPage from '@/components/admin/AdminAgentsPage';
import { getStoredSession } from '@/services/adminAuth';
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
  // Path A spec rename (2026-05-11) — canonical 6 agents.
  // PULSE+TOPO absorbed into NEXUS layer (deterministic, not displayed here).
  // SENTINEL+TRACE fused into RCAI. PARMY→OPTIMUS, ANALYTIC→ECHO. AEGIS+EXA added.
  { id: 'OSMOSIS', name: 'OSMOSIS', emoji: '🧠', role: 'Supervisor & Talk-to-Network',     group: 'lead',       color: 'hsl(var(--primary))', textColor: 'text-primary',     status: 'active',  description: 'Orchestrateur central. Routage intelligent, planification de workflow, synthèse multi-agents.' },
  { id: 'RCAI',    name: 'RCAI',    emoji: '🔍', role: 'Diagnostic, Anomaly & RCA',        group: 'analyst',    color: '#a78bfa',             textColor: 'text-purple-400',  status: 'active',  description: 'Détection d\'anomalies + Root Cause Analysis (fusion ex-PULSE/SENTINEL/TRACE).' },
  { id: 'OPTIMUS', name: 'OPTIMUS', emoji: '⚙️', role: 'Recommendation & Optimization',    group: 'specialist', color: '#f59e0b',             textColor: 'text-amber-400',   status: 'active',  description: 'Audit et propositions d\'optimisation de paramètres radio. Propose-only.' },
  { id: 'AEGIS',   name: 'AEGIS',   emoji: '🛡️', role: 'Risk & Tier Classification',       group: 'monitor',    color: '#ef4444',             textColor: 'text-red-400',     status: 'active',  description: 'Classification T1/T2/T3 (réversibilité × blast_radius). Label d\'affichage, jamais une porte d\'exécution.' },
  { id: 'EXA',     name: 'EXA',     emoji: '📤', role: 'Export & Vendor Handoff',          group: 'specialist', color: '#06b6d4',             textColor: 'text-cyan-400',    status: 'standby', description: 'Export fichier vers SON vendor. Squelette v1, jamais d\'exécution directe.' },
  { id: 'ECHO',    name: 'ECHO',    emoji: '📑', role: 'Learning, Reporting & Synthesis',  group: 'analyst',    color: '#3dd68c',             textColor: 'text-emerald-400', status: 'active',  description: 'Boucle d\'apprentissage post-exécution + rapports hebdo/exécutifs (fusion ex-INSIGHT/ANALYTIC).' },
];

const agentMap = Object.fromEntries(qAgents.map(a => [a.id, a]));

const groupLabels: Record<string, string> = {
  lead: '🎯 Lead', analyst: '📈 Analystes', specialist: '🔧 Spécialistes', monitor: '🛡️ Monitoring',
};

const statusDot: Record<string, string> = {
  active: 'bg-emerald-500', standby: 'bg-amber-400', offline: 'bg-muted-foreground/40',
};

const PROFILE_KEY = 'osmosis_admin_profile';
const DISCUSSIONS_KEY = 'osmosis_discussions';

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

/* ── Real AI call to edge function ── */
async function callAgentAI(
  agentId: string,
  discussionName: string,
  messages: DiscussionMessage[],
  userProfile: UserProfile | null
): Promise<string> {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-discussion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          agentId,
          discussionName,
          messages: messages.map(m => ({ sender: m.sender, senderName: m.senderName, content: m.content })),
          userProfile: userProfile ? { name: userProfile.name, role: userProfile.role } : null,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Agent AI error:', err);
      return `[Erreur IA: ${err.error || res.status}]`;
    }
    const data = await res.json();
    return data.content || 'Je réfléchis…';
  } catch (e) {
    console.error('Agent AI call failed:', e);
    return '[Erreur de connexion IA]';
  }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ── Tab type ── */
type TabId = 'agents' | 'discussions' | 'config';

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

  const sendAgentChat = async () => {
    if (!chatInput.trim() || !selectedAgent) return;
    const agentId = selectedAgent.id;
    const userContent = chatInput.trim();
    setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), { role: 'user' as const, content: userContent }] }));
    setChatInput('');
    setTyping(true);

    // Build messages for AI context
    const prevMsgs = chatMessages[agentId] || [];
    const discMsgs: DiscussionMessage[] = [
      ...prevMsgs.map((m, i) => ({
        id: String(i), sender: m.role === 'user' ? 'USER' : agentId,
        senderEmoji: m.role === 'user' ? (profile?.emoji || '👤') : selectedAgent.emoji,
        senderName: m.role === 'user' ? (profile?.name || 'Admin') : selectedAgent.name,
        content: m.content, timestamp: Date.now(), color: m.role === 'user' ? '#e8572a' : selectedAgent.color,
      })),
      { id: 'new', sender: 'USER', senderEmoji: profile?.emoji || '👤', senderName: profile?.name || 'Admin', content: userContent, timestamp: Date.now(), color: '#e8572a' },
    ];

    const reply = await callAgentAI(agentId, `Chat 1:1 avec ${selectedAgent.name}`, discMsgs, profile);
    setChatMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), { role: 'agent' as const, content: reply }] }));
    setTyping(false);
  };

  /* ── Discussions ── */
  const createDiscussion = () => {
    if (!newDiscName.trim()) return;
    // Use quickStartDiscussion so the name becomes the first message too
    quickStartDiscussion(newDiscName.trim());
    setNewDiscName('');
    setNewDiscOpen(false);
  };

  const quickStartDiscussion = (message: string) => {
    const userMsg: DiscussionMessage = {
      id: genId(),
      sender: 'USER',
      senderEmoji: profile?.emoji || '👤',
      senderName: profile?.name || 'Admin',
      content: message,
      timestamp: Date.now(),
      color: profile?.color || '#e8572a',
    };
    const discName = message.length > 50 ? message.slice(0, 50) + '…' : message;
    const disc: Discussion = {
      id: genId(),
      name: discName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isEnded: false,
      startedBy: profile?.name || 'Admin',
      messages: [userMsg],
      participatingAgents: qAgents.map(a => a.id),
    };
    setDiscussions(prev => [disc, ...prev]);
    setActiveDiscId(disc.id);
    setDiscInput('');
    triggerAgentResponses(disc.id, discName, [userMsg]);
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
    const updatedMessages = [...activeDisc.messages, userMsg];
    setDiscussions(prev => prev.map(d => d.id === activeDiscId ? { ...d, messages: updatedMessages, updatedAt: Date.now() } : d));
    setDiscInput('');

    // During autonomous discussions, don't trigger separate agent responses — the auto loop will pick up user messages via syncWithLiveMessages
    if (!autoDiscRef.current[activeDiscId!]) {
      triggerAgentResponses(activeDiscId!, activeDisc.name, updatedMessages);
    }
  };

  const triggerAgentResponses = useCallback(async (discId: string, discName: string, currentMessages: DiscussionMessage[]) => {
    const respondingCount = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...qAgents].sort(() => Math.random() - 0.5).slice(0, respondingCount);

    setDiscTypingAgents(shuffled.map(a => a.id));

    let runningMessages = [...currentMessages];

    for (let idx = 0; idx < shuffled.length; idx++) {
      const agent = shuffled[idx];

      const content = await callAgentAI(agent.id, discName, runningMessages, profile);

      const msg: DiscussionMessage = {
        id: genId(),
        sender: agent.id,
        senderEmoji: agent.emoji,
        senderName: agent.name,
        content,
        timestamp: Date.now(),
        color: agent.color,
      };
      runningMessages = [...runningMessages, msg];
      setDiscussions(prev => prev.map(d => d.id === discId ? { ...d, messages: runningMessages, updatedAt: Date.now() } : d));
      setDiscTypingAgents(prev => prev.filter(id => id !== agent.id));
    }
  }, [profile]);

  const endDiscussion = (discId: string) => {
    setDiscussions(prev => prev.map(d => d.id === discId ? { ...d, isEnded: true, updatedAt: Date.now() } : d));
  };

  const deleteDiscussion = (discId: string) => {
    setDiscussions(prev => prev.filter(d => d.id !== discId));
    if (activeDiscId === discId) setActiveDiscId(null);
  };

  const autoDiscRef = useRef<Record<string, boolean>>({});
  const discussionsRef = useRef(discussions);
  useEffect(() => { discussionsRef.current = discussions; }, [discussions]);

  const startAutonomousDiscussion = async () => {
    const topics = [
      'Analyse de la dégradation QoE détectée sur la plaque Nord',
      'Revue hebdomadaire des KPIs critiques',
      'Investigation anomalie RTT sur cluster Est',
      'Coordination rollback paramètres site SIT_042',
      'Planification audit 5G zone dense',
      'Alerte : chute du QoE index sur le cluster Ouest',
      'Demande d\'information sur les paramètres LNCEL zone Sud',
      'Corrélation entre changement de tilt et dégradation débit DL',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const initiator = qAgents[Math.floor(Math.random() * qAgents.length)];
    const discId = genId();

    const initContent = await callAgentAI(initiator.id, topic, [], profile);

    const initMsg: DiscussionMessage = {
      id: genId(),
      sender: initiator.id,
      senderEmoji: initiator.emoji,
      senderName: initiator.name,
      content: initContent,
      timestamp: Date.now(),
      color: initiator.color,
    };

    const disc: Discussion = {
      id: discId,
      name: `🤖 ${topic}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isEnded: false,
      startedBy: `${initiator.emoji} ${initiator.name} (Auto)`,
      messages: [initMsg],
      participatingAgents: qAgents.map(a => a.id),
    };
    setDiscussions(prev => [disc, ...prev]);
    setActiveDiscId(discId);
    autoDiscRef.current[discId] = true;

    // Run fully autonomous rounds
    runAutonomousRounds(discId, topic, initiator, [initMsg]);
  };

  // Helper: sync runningMessages with any user messages injected during autonomous loop
  const syncWithLiveMessages = (discId: string, runningMessages: DiscussionMessage[]): DiscussionMessage[] => {
    const liveDisc = discussionsRef.current.find(d => d.id === discId);
    if (!liveDisc) return runningMessages;
    // Find user messages in live state that aren't in runningMessages
    const knownIds = new Set(runningMessages.map(m => m.id));
    const newUserMsgs = liveDisc.messages.filter(m => !knownIds.has(m.id) && m.sender === 'USER');
    if (newUserMsgs.length > 0) {
      return [...runningMessages, ...newUserMsgs];
    }
    return runningMessages;
  };

  const runAutonomousRounds = useCallback(async (
    discId: string, topic: string, initiator: QAgent, initialMessages: DiscussionMessage[]
  ) => {
    const MAX_ROUNDS = 3;
    let runningMessages = [...initialMessages];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!autoDiscRef.current[discId]) break;

      // Merge any user messages injected while agents were responding
      runningMessages = syncWithLiveMessages(discId, runningMessages);

      // Pick 2-3 random agents (not the initiator for variety, except last round)
      const otherAgents = qAgents.filter(a => a.id !== initiator.id);
      const respondingCount = 2 + Math.floor(Math.random() * 2);
      const shuffled = [...otherAgents].sort(() => Math.random() - 0.5).slice(0, respondingCount);

      setDiscTypingAgents(shuffled.map(a => a.id));

      for (const agent of shuffled) {
        if (!autoDiscRef.current[discId]) break;
        // Re-sync before each agent call to catch recent user messages
        runningMessages = syncWithLiveMessages(discId, runningMessages);
        const content = await callAgentAI(agent.id, topic, runningMessages, profile);
        const msg: DiscussionMessage = {
          id: genId(), sender: agent.id, senderEmoji: agent.emoji,
          senderName: agent.name, content, timestamp: Date.now(), color: agent.color,
        };
        runningMessages = [...runningMessages, msg];
        setDiscussions(prev => prev.map(d => d.id === discId ? { ...d, messages: runningMessages, updatedAt: Date.now() } : d));
        setDiscTypingAgents(prev => prev.filter(id => id !== agent.id));
      }

      if (!autoDiscRef.current[discId]) break;

      // Last round: initiator concludes
      if (round === MAX_ROUNDS - 1) {
        runningMessages = syncWithLiveMessages(discId, runningMessages);
        setDiscTypingAgents([initiator.id]);
        const closingContent = await callAgentAI(initiator.id, `${topic} — SYNTHÈSE FINALE`, runningMessages, profile);
        const closingMsg: DiscussionMessage = {
          id: genId(), sender: initiator.id, senderEmoji: initiator.emoji,
          senderName: initiator.name,
          content: `📋 **Synthèse** — ${closingContent}`,
          timestamp: Date.now(), color: initiator.color,
        };
        runningMessages = [...runningMessages, closingMsg];
        setDiscussions(prev => prev.map(d => d.id === discId ? {
          ...d, messages: runningMessages, updatedAt: Date.now(), isEnded: true
        } : d));
        setDiscTypingAgents([]);
        delete autoDiscRef.current[discId];
        return;
      }
    }

    setDiscTypingAgents([]);
    delete autoDiscRef.current[discId];
  }, [profile]);

  const stopAutonomousDiscussion = (discId: string) => {
    delete autoDiscRef.current[discId];
    setDiscTypingAgents([]);
  };

  const groups = ['lead', 'analyst', 'specialist', 'monitor'] as const;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top bar */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">AI Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Agents OSMOSIS — Architecture multi-agents spécialisés</p>
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
          { id: 'config' as TabId, label: 'Config Agents', icon: Settings2 },
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
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="space-y-4 w-full max-w-md">
                    <Users size={40} className="mx-auto text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Sélectionnez une discussion ou démarrez-en une</p>
                    <div className="flex gap-2">
                      <Input
                        value={discInput}
                        onChange={e => setDiscInput(e.target.value)}
                        placeholder="Tapez votre message pour démarrer une discussion…"
                        className="text-xs"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && discInput.trim()) {
                            quickStartDiscussion(discInput.trim());
                          }
                        }}
                      />
                      <Button size="icon" onClick={() => discInput.trim() && quickStartDiscussion(discInput.trim())} disabled={!discInput.trim()}>
                        <Send size={14} />
                      </Button>
                    </div>
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
                        {autoDiscRef.current[activeDisc.id] && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold animate-pulse">AUTONOME</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Démarrée par {activeDisc.startedBy} · {new Date(activeDisc.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {autoDiscRef.current[activeDisc.id] && (
                      <Button size="sm" variant="destructive" onClick={() => { stopAutonomousDiscussion(activeDisc.id); endDiscussion(activeDisc.id); }} className="text-xs">
                        <X size={12} className="mr-1" /> Stopper
                      </Button>
                    )}
                    {!activeDisc.isEnded && !autoDiscRef.current[activeDisc.id] && (
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
                          placeholder={autoDiscRef.current[activeDisc.id] ? "Intervenir dans la discussion autonome…" : "Donner un ordre ou participer…"}
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

        {tab === 'config' && (
          <div className="h-full overflow-auto">
            <AdminAgentsPage currentUser={getStoredSession() || { id: '', username: 'admin', role: 'admin', status: 'active', created_at: '', last_login: null }} />
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
