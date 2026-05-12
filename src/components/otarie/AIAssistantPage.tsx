import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import {
  Bot, User, Loader2, Sparkles, Trash2, MessageSquare, Copy, Check,
  FileDown, MapPin, Plus, X, PanelLeftClose, PanelLeftOpen, Pencil,
  ThumbsUp, ThumbsDown, Brain, Search, MoreHorizontal, Clock, ChevronRight,
  Cpu
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { exportElementToPDF } from '@/lib/exportUtils';
import { SiteSummary } from '@/types';
import { parseVisualizationBlocks } from './chat-visualizations/parseVisualizationBlocks';
import InlineChart from './chat-visualizations/InlineChart';
import InlineKPICards from './chat-visualizations/InlineKPICards';
// osmosis-ui-kit (Path A+B 2026-05-11) — kit-rendered final view of the
// agent message after streaming completes. The legacy block renderer below
// is kept for the in-stream phase (smoother typing perception) and as
// opt-out via ?ui=legacy URL param.
import { AgentResponse as KitAgentResponse } from '@/lib/osmosis-ui-kit/components/AgentResponse';
import { parseToAgentResponse } from '@/lib/osmosis-ui-kit/adapter/parseToAgentResponse';
import { WorstCellsView } from '@/components/WorstCellsView';
import type { WorstCellsResponse } from '@/components/WorstCellsView';
import { parseKpiBlocks, KpiSummaryCards, SplitSectionCards } from '../kpi-monitor/AIKpiCards';
import { getAgentHeaders, isLocalMode, getVpsProxyUrl, getApiUrl, getApiHeaders } from '@/lib/apiConfig';
import { useChatSessionStore, type ChatMessage, type ProgressEvent } from '@/stores/chatSessionStore';
import AgentTimeline from './chat-visualizations/AgentTimeline';
import ChatInput from './ChatInput';
import { useAgentLearningStore } from '@/stores/agentLearningStore';
import { dashboardsApi } from '@/lib/localDb';
import { createDefaultChart, CHART_COLORS } from '@/components/bi/biTypes';
import { getStoredSession } from '@/services/adminAuth';
const InlineMap = lazy(() => import('./chat-visualizations/InlineMap'));

// Path A spec rename (2026-05-11) — canonical 6 agents.
// Legacy ids kept in the type union + META so cached session messages still render.
// New code should only emit canonical ids; legacy ones display with an "(ex-X)" suffix.
type AgentId =
  | 'OSMOSIS' | 'RCAI' | 'OPTIMUS' | 'AEGIS' | 'EXA' | 'ECHO'
  // Backward-compat aliases (do not use in new code):
  | 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'PARMY' | 'ANALYTIC';
type Msg = ChatMessage;

const AGENT_META: Record<AgentId, { emoji: string; label: string; color: string }> = {
  // Canonical 6
  OSMOSIS: { emoji: '🧠', label: 'OSMOSIS', color: 'hsl(142, 60%, 45%)' },
  RCAI:    { emoji: '🔍', label: 'RCAI',    color: 'hsl(265, 70%, 60%)' },
  OPTIMUS: { emoji: '⚙️', label: 'OPTIMUS', color: 'hsl(35, 90%, 50%)' },
  AEGIS:   { emoji: '🛡️', label: 'AEGIS',   color: 'hsl(0, 80%, 55%)' },
  EXA:     { emoji: '📤', label: 'EXA',     color: 'hsl(190, 70%, 50%)' },
  ECHO:    { emoji: '📊', label: 'ECHO',    color: 'hsl(150, 65%, 50%)' },
  // Backward-compat aliases — legacy session messages render with their new canonical color/emoji
  PULSE:    { emoji: '🔍', label: 'RCAI (ex-PULSE)',    color: 'hsl(265, 70%, 60%)' },
  TRACE:    { emoji: '🔍', label: 'RCAI (ex-TRACE)',    color: 'hsl(265, 70%, 60%)' },
  SENTINEL: { emoji: '🔍', label: 'RCAI (ex-SENTINEL)', color: 'hsl(265, 70%, 60%)' },
  TOPO:     { emoji: '🔍', label: 'RCAI (ex-TOPO)',     color: 'hsl(265, 70%, 60%)' },
  PARMY:    { emoji: '⚙️', label: 'OPTIMUS (ex-PARMY)', color: 'hsl(35, 90%, 50%)' },
  ANALYTIC: { emoji: '📊', label: 'ECHO (ex-ANALYTIC)', color: 'hsl(150, 65%, 50%)' },
};

function extractAgent(content: string): { agent: AgentId | null; cleanContent: string } {
  const match = content.match(/<!--\s*AGENT:(\w+)\s*-->\n?/);
  if (match) {
    return { agent: match[1] as AgentId, cleanContent: content.replace(match[0], '') };
  }
  return { agent: null, cleanContent: content };
}

const SUGGESTIONS = [
  "Donne-moi les 10 pires sites en QoE",
  "Compare les vendors Ericsson vs Nokia sur le Débit DL",
  "Quels sont les sites avec le plus de retransmissions TCP ?",
  "Analyse la qualité par technologie (4G vs 5G)",
  "Crée un dashboard QoE avec débit DL, RTT et sessions par vendor",
  "Quel est l'état du réseau en zone rurale ?",
];

// ─── Session time grouping ───
function getSessionGroup(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  if (d >= today) return 'Aujourd\'hui';
  if (d >= yesterday) return 'Hier';
  if (d >= weekAgo) return '7 derniers jours';
  return 'Plus ancien';
}

function getSessionIcon(title: string): string {
  if (/worst|pire|ranking|top/i.test(title)) return '📊';
  if (/rtt|latence/i.test(title)) return '⏱️';
  if (/paris|lyon|région|zone|plaque/i.test(title)) return '📍';
  if (/compare|vs|versus/i.test(title)) return '⚖️';
  if (/5g|4g|techno/i.test(title)) return '📶';
  if (/retr|tcp|loss/i.test(title)) return '🔴';
  if (/débit|throughput/i.test(title)) return '📈';
  if (/kpi/i.test(title)) return '📋';
  return '💬';
}

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' – ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface AIAssistantPageProps {
  sites?: SiteSummary[];
  onShowWorstCells?: (cellIds: string[]) => void;
  initialPrompt?: string;
  onPromptConsumed?: () => void;
  onNavigate?: (tab: string) => void;
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ sites = [], onShowWorstCells, initialPrompt, onPromptConsumed, onNavigate }) => {
  const sessionStore = useChatSessionStore();
  const { sessions, activeSessionId } = sessionStore;
  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const messages = activeSession?.messages || [];

  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const setMessages = useCallback((updater: Msg[] | ((prev: Msg[]) => Msg[])) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const currentMsgs = messagesRef.current;
    const newMsgs = typeof updater === 'function' ? updater(currentMsgs) : updater;
    sessionStore.setMessages(sid, newMsgs);
  }, [sessionStore]);

  // input state moved to ChatInput component for performance
  const [forcedAgent, setForcedAgent] = useState<AgentId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [sidebarMode, setSidebarMode] = useState<'full' | 'collapsed' | 'hidden'>('full');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // inputRef moved to ChatInput component

  const addDebugLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-50), `[${ts}] ${msg}`]);
  };

  useEffect(() => {
    if (sessions.length === 0) {
      sessionStore.createSession();
    } else if (!activeSessionId) {
      sessionStore.setActiveSession(sessions[0].id);
    }
  }, [sessions.length, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendingRef = useRef(false);
  const lastSentPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialPrompt && !sendingRef.current && initialPrompt !== lastSentPromptRef.current) {
      sendingRef.current = true;
      lastSentPromptRef.current = initialPrompt;
      onPromptConsumed?.();
      setTimeout(() => {
        send(initialPrompt);
        sendingRef.current = false;
      }, 300);
    }
  }, [initialPrompt]);

  const uiScope = useMemo(() => ({
    selectedSiteName: null as string | null,
    selectedCellId: null as string | null,
    page: 'global' as const,
  }), []);

  const assistantFilters = useMemo(() => ({}), []);

  const allCellIds = useMemo(() => {
    return sites.flatMap(s => s.cells.map(c => c.cell_id));
  }, [sites]);

  // Filtered & grouped sessions
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(s => s.title.toLowerCase().includes(q) ||
      s.messages.some(m => m.content.toLowerCase().includes(q)));
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, typeof sessions> = {};
    const order = ['Aujourd\'hui', 'Hier', '7 derniers jours', 'Plus ancien'];
    for (const s of filteredSessions) {
      const group = getSessionGroup(s.updatedAt || s.createdAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(s);
    }
    return order.filter(g => groups[g]?.length).map(g => ({ label: g, sessions: groups[g] }));
  }, [filteredSessions]);

  // ─── Streaming logic (unchanged) ───
  const streamChat = async (allMessages: Msg[]): Promise<string> => {
    let openrouterKey = '';
    let configuredModel = '';
    try {
      const saved = localStorage.getItem('osmosis_llm_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        openrouterKey = cfg.apiKey || '';
        configuredModel = cfg.model || '';
      }
    } catch { /* ignore */ }

    const isOpenRouterModel = /^(deepseek|anthropic|meta-llama|qwen|mistralai|openai)\//.test(configuredModel);
    const effectiveModel = openrouterKey || !isOpenRouterModel
      ? configuredModel
      : 'google/gemini-3-flash-preview';

    const MAX_RECENT_MESSAGES = 4;
    const MAX_USER_CHARS = 1200;
    const MAX_ASSISTANT_CHARS = 320;
    const MAX_TOTAL_CHARS = 3500;

    const compactText = (text: string, maxChars: number) => {
      const normalized = text
        .replace(/```[\s\S]*?```/g, '[code block omitted]')
        .replace(/<!--\s*CREATE_DASHBOARD:[\s\S]*?-->/g, '[dashboard spec omitted]')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (normalized.length <= maxChars) return normalized;
      return `${normalized.slice(0, maxChars)}\n[... contexte tronqué ...]`;
    };

    const recentMessages = allMessages.slice(-MAX_RECENT_MESSAGES);
    const trimmedMessages = recentMessages
      .filter((message) => !(message.role === 'assistant' && /Server error \(500\): Internal Server Error/i.test(message.content)))
      .map((m) => ({
        role: m.role,
        content: compactText(
          m.content,
          m.role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS,
        ),
      }));

    let totalChars = trimmedMessages.reduce((sum, message) => sum + message.content.length, 0);
    while (trimmedMessages.length > 1 && totalChars > MAX_TOTAL_CHARS) {
      trimmedMessages.shift();
      totalChars = trimmedMessages.reduce((sum, message) => sum + message.content.length, 0);
    }

    // Get user_id from admin session
    const session = getStoredSession();
    const userId = session?.id || null;

    const payload = JSON.stringify({
      messages: trimmedMessages,
      uiScope,
      filters: assistantFilters,
      openrouter_key: openrouterKey,
      model: effectiveModel,
      user_id: userId,
      session_id: activeSessionId,
      ...(forcedAgent ? { forcedAgent } : {}),
      // Path A 2026-05-11: opt-in LLM router on the Talk-to-Network surface.
      // Only fires when regex routing falls through to the OSMOSIS fallback
      // (ambiguous questions). Page-specific panels keep regex routing because
      // their uiScope.page maps to a forced agent before this body is built.
      routerMode: 'llm',
    });

    // Route directly to Agent Layer :1000 via vps-proxy (service=agent)
    const url = getVpsProxyUrl('agent', '/orchestrator/stream');
    const headers = getAgentHeaders();

    addDebugLog(`Mode: ${isLocalMode() ? 'LOCAL' : 'CLOUD'}`);
    addDebugLog(`URL: ${url}`);
    addDebugLog(`Payload size: ${(payload.length / 1024).toFixed(1)} KB`);
    addDebugLog(`Model: ${effectiveModel || '(default)'}`);
    if (effectiveModel !== configuredModel) addDebugLog(`Model fallback: ${configuredModel || '(none)'} → ${effectiveModel}`);

    const controller = new AbortController();
    const timeoutMs = 300000; // 5 min for OPTIMUS fuzzy + SQL (ex-PARMY)
    const timeoutId = setTimeout(() => { addDebugLog(`⏱️ Timeout ${timeoutMs / 1000}s`); controller.abort(); }, timeoutMs);

    // Single offline-state message reused for every "service unreachable"
    // failure mode below (network drop, DNS, abort, 404 route gone, 502/503
    // upstream out). Keeps the UX consistent and points the operator at
    // the actionable next step instead of dumping HTTP details.
    const OFFLINE_MSG = "⚠️ **Service Agent hors-ligne.** L'orchestrateur OSMOSIS AI n'est pas joignable. Contactez l'administrateur — sur le VPS, exécuter `bash scripts/start-agent.sh` puis vérifier `curl http://127.0.0.1:8000/api/v1/agent/health`.";
    const surfaceOffline = (reason: string) => {
      addDebugLog(`AGENT OFFLINE: ${reason}`);
      toast.error('Service Agent hors-ligne', { description: reason });
      setMessages(prev => [...prev, { role: 'assistant', content: OFFLINE_MSG }]);
      setIsLoading(false);
    };

    let resp: Response;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: payload, signal: controller.signal });
      addDebugLog(`Response: ${resp.status} ${resp.statusText}`);
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      addDebugLog(`Fetch error: ${fetchErr.message}`);
      // AbortError (timeout) and TypeError("Failed to fetch") both land here.
      // Distinguish timeout from "can't reach the host at all" so the
      // admin sees which knob to pull.
      const isTimeout = fetchErr?.name === 'AbortError';
      surfaceOffline(isTimeout
        ? `Délai dépassé (${timeoutMs / 1000}s) — l'orchestrateur n'a pas répondu.`
        : `Impossible de contacter ${url} — ${fetchErr.message || 'connexion refusée'}.`);
      return;
    }
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      addDebugLog(`Error: ${errBody.slice(0, 200)}`);
      if (resp.status === 429) { toast.error('Limite atteinte — réessayez dans un instant.'); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error('Crédits insuffisants'); setIsLoading(false); return; }
      // 404 (route gone) / 502 (proxy can't reach upstream) / 503 (service
      // unavailable) — treat all three as "agent service offline" so the
      // operator knows it's an availability problem, not a payload bug.
      if (resp.status === 404 || resp.status === 502 || resp.status === 503) {
        surfaceOffline(`HTTP ${resp.status} sur ${url}`);
        return;
      }
      throw new Error(`Server error (${resp.status}): ${errBody.slice(0, 100)}`);
    }

    if (!resp.body) throw new Error('No body');

    // Check for proxy fallback (200 with unavailable: true)
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const jsonBody = await resp.text();
      try {
        const parsed = JSON.parse(jsonBody);
        if (parsed.unavailable) {
          const fallbackMsg = `⚠️ ${parsed.content || "Le service Agent est temporairement indisponible. Veuillez réessayer."}`;
          setMessages(prev => [...prev, { role: 'assistant', content: fallbackMsg }]);
          setIsLoading(false);
          return;
        }
      } catch { /* not JSON, continue with stream */ }
    }

    addDebugLog('Streaming started...');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';
    let assistantSoFar = '';
    let streamDone = false;
    let lastFlush = 0;
    const FLUSH_INTERVAL = 80; // ms — throttle UI updates

    let progressEvents: ProgressEvent[] = [];
    let lastProgressRaw = '';  // Track raw progress tags to avoid re-parsing

    const extractProgressEvents = (text: string): { cleanText: string; events: ProgressEvent[] } => {
      const regex = /<!--\s*PROGRESS:(.*?)\s*-->\n?/g;
      const cleanText = text.replace(regex, '');

      // Extract all raw progress tags
      const progressTags: string[] = [];
      let match: RegExpExecArray | null;
      const regex2 = /<!--\s*PROGRESS:(.*?)\s*-->/g;
      while ((match = regex2.exec(text)) !== null) {
        progressTags.push(match[1]);
      }

      // Only re-parse if new tags appeared
      const rawKey = progressTags.join('|');
      if (rawKey !== lastProgressRaw) {
        lastProgressRaw = rawKey;
        const events: ProgressEvent[] = [];
        for (const tag of progressTags) {
          try {
            const payload = JSON.parse(tag);
            events.push({
              type: payload.type,
              agent: payload.agent,
              tool: payload.tool,
              query: payload.query,
              plan: payload.agents || payload.plan,
              skill_id: payload.skill_id,
              skill_name: payload.skill_name,
              verdict: payload.verdict,
              ts: Date.now(),
            });
          } catch { /* ignore */ }
        }
        progressEvents = events;
      }

      return { cleanText, events: progressEvents };
    };

    const flushToUI = (force = false) => {
      const now = performance.now();
      if (!force && now - lastFlush < FLUSH_INTERVAL) return;
      lastFlush = now;
      const { agent, cleanContent: agentClean } = extractAgent(assistantSoFar);
      const { cleanText, events } = extractProgressEvents(agentClean);
      progressEvents = events;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: cleanText, agent: agent || last.agent, progressEvents: events.length > 0 ? events : last.progressEvents };
          return updated;
        }
        return [...prev, { role: 'assistant', content: cleanText, agent: agent || undefined, progressEvents: events.length > 0 ? events : undefined }];
      });
    };

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { streamDone = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantSoFar += content;
            flushToUI();
          }
        } catch { textBuffer = line + '\n' + textBuffer; break; }
      }
    }
    // Force final flush
    flushToUI(true);

    // Final flush remaining buffer
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (raw.startsWith(':') || raw.trim() === '') continue;
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) assistantSoFar += content;
        } catch { /* ignore */ }
      }
      flushToUI(true);
    }
    addDebugLog(`✅ Complete. ${assistantSoFar.length} chars`);
    return assistantSoFar;
  };

  const extractCellsFromResponse = (responseText?: string) => {
    if (!responseText || !sites.length || !onShowWorstCells) return;
    try {
      const foundIds = allCellIds.filter(id => responseText.includes(id));
      const uniqueIds = [...new Set(foundIds)];
      if (uniqueIds.length > 0) {
        setMessages(prev => {
          const newMsgs = [...prev];
          for (let i = newMsgs.length - 1; i >= 0; i--) {
            if (newMsgs[i].role === 'assistant') {
              newMsgs[i] = { ...newMsgs[i], mapCellIds: uniqueIds, mapDescription: `${uniqueIds.length} cellule(s)` };
              break;
            }
          }
          return newMsgs;
        });
      }
    } catch (e) { console.error('Cell extraction failed:', e); }
  };

  // ─── Dashboard creation from AI response ───
  const handleDashboardCreation = async (responseText?: string) => {
    if (!responseText) return;
    // Match CREATE_DASHBOARD whether raw or inside a code block
    const match = responseText.match(/<!--\s*CREATE_DASHBOARD:([\s\S]*?)-->/s);
    if (!match) return;
    try {
      const spec = JSON.parse(match[1].trim());
      const dashId = `ai_${Date.now()}`;
      const now = new Date();
      const dateEnd = now.toISOString().slice(0, 10);
      const dateStart = new Date(now.getTime() - (spec.charts?.[0]?.dateRange || 30) * 86400000).toISOString().slice(0, 10);
      const widgets = (spec.charts || []).map((chart: any, idx: number) => {
        const base = createDefaultChart(`chart_${Date.now()}_${idx}`);
        const kpis = chart.kpis || ['qoe_index'];
        base.title = chart.title || `Chart ${idx + 1}`;
        base.xAxis = { type: 'date', value: 'date', dateStart, dateEnd, granularity: 'day' };
        base.dataSource = { type: 'local' };
        if (chart.dimension1) base.dimension1 = chart.dimension1;
        base.yMetrics = kpis.map((kpi: string, ki: number) => ({
          kpi, axis: ki === 0 ? 'left' as const : 'right' as const,
          color: CHART_COLORS[ki % CHART_COLORS.length],
          chartType: (chart.chartTypes?.[ki]) || 'line',
          aggregation: 'AVG' as const, smoothCurve: true, showMovingAvg: false,
        }));
        base.advanced.showLegend = true;
        base.advanced.legendPosition = 'top';
        return { kind: 'chart' as const, config: base, layout: { x: 0, y: idx * 6, w: 12, h: 6 } };
      });
      const session = getStoredSession();
      await dashboardsApi.upsert({
        id: dashId, name: spec.name || 'AI Dashboard', description: spec.description || '',
        is_shared: true, widgets, dashboard_type: 'analytic_qoe',
        owner_username: session?.username || 'OSMOSIS AI',
      });
      toast.success(`📊 Dashboard "${spec.name}" créé !`);
      addDebugLog(`✅ Dashboard "${spec.name}" created with ${widgets.length} charts`);
    } catch (e) {
      console.error('Dashboard creation failed:', e);
      addDebugLog(`❌ Dashboard creation error: ${e}`);
    }
  };

  const send = useCallback(async (text?: string) => {
    const msg = text?.trim();
    if (!msg || isLoading) return;
    const userMsg: Msg = { role: 'user', content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    try {
      const finalText = (await streamChat(updatedMessages)) ?? '';
      extractCellsFromResponse(finalText);
      handleDashboardCreation(finalText);
    } catch (e: any) {
      console.error('OSMOSIS stream error:', e);
      addDebugLog(`❌ Error: ${e?.message}`);
      const errorDetail = e?.message || String(e);
      const isLocal = isLocalMode() && !errorDetail.includes('Cloud');
      const errorMsg = isLocal
        ? `⚠️ **Erreur backend local**\n\nVérifiez que \`cd server && node index.js\` est lancé.\n\n\`${errorDetail}\``
        : `⚠️ **Erreur** : ${errorDetail}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
      // Conversations are saved in localStorage (primary storage)
      // VPS backup endpoint /api/v1/ai/conversations is not available — skipped
    }
  }, [messages, isLoading, setMessages, streamChat, extractCellsFromResponse, handleDashboardCreation, addDebugLog, sessions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleShowWorstCells = (kpi: string = 'qoe_score_avg', count: number = 10) => {
    const allCells = sites.flatMap(s => s.cells.map(c => ({ ...c, site_name: s.site_name })));
    const sorted = [...allCells].sort((a, b) => (a as any)[kpi] - (b as any)[kpi]);
    const worstCells = sorted.slice(0, count);
    const cellIds = worstCells.map(c => c.cell_id);
    const table = worstCells.map((c, i) =>
      `| ${i + 1} | ${c.cell_id} | ${(c as any).site_name} | ${c.techno} | ${((c as any)[kpi] as number).toFixed(1)} |`
    ).join('\n');
    const kpiLabel = kpi === 'qoe_score_avg' ? 'QoE Score' : kpi;
    const msg = `**🗺️ Top ${count} Worst Cells — ${kpiLabel}**\n\n| # | Cell ID | Site | Techno | ${kpiLabel} |\n|---|---------|------|--------|--------|\n${table}\n\n*→ Affichage sur la carte...*`;
    setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
    if (onShowWorstCells) onShowWorstCells(cellIds);
  };

  const clearChat = () => {
    if (activeSessionId) sessionStore.setMessages(activeSessionId, []);
  };

  const handleNewSession = () => sessionStore.createSession();
  const handleDeleteSession = (id: string) => sessionStore.deleteSession(id);
  const handleDuplicateSession = (s: typeof sessions[0]) => {
    const newId = sessionStore.createSession(s.title + ' (copie)');
    sessionStore.setMessages(newId, [...s.messages]);
  };
  const handleRenameSession = (id: string) => {
    if (editTitle.trim()) sessionStore.renameSession(id, editTitle.trim());
    setEditingSessionId(null);
    setEditTitle('');
  };

  const sidebarWidth = sidebarMode === 'full' ? 'w-[280px]' : sidebarMode === 'collapsed' ? 'w-[52px]' : 'w-0';

  return (
    <div className="osmosis-theme flex-1 flex h-full bg-background overflow-hidden">
      {/* ══════════ LEFT SIDEBAR ══════════ */}
      <div className={`osmosis-sidebar ${sidebarWidth} shrink-0 transition-all duration-300 overflow-hidden border-r border-border bg-card flex flex-col`}>
        {sidebarMode === 'full' && (
          <>
            {/* Sidebar Header */}
            <div className="px-3 pt-4 pb-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-bold text-foreground tracking-tight">OSMOSIS</span>
                </div>
                <button
                  onClick={() => setSidebarMode('collapsed')}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Réduire"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              {/* New Session Button */}
              <button
                onClick={handleNewSession}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-semibold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nouvelle session
              </button>

              {/* Search */}
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-muted/60 border border-border/50 text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {groupedSessions.map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 px-2 pt-4 pb-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{group.label}</span>
                  </div>
                  {group.sessions.map(s => (
                    <div
                      key={s.id}
                      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        s.id === activeSessionId
                          ? 'bg-primary/10 border border-primary/20 shadow-sm'
                          : 'hover:bg-muted/60 border border-transparent'
                      }`}
                      onClick={() => { if (!isLoading) sessionStore.setActiveSession(s.id); }}
                      onMouseEnter={() => setHoveredSession(s.id)}
                      onMouseLeave={() => setHoveredSession(null)}
                    >
                      <span className="text-base mt-0.5 leading-none shrink-0">{getSessionIcon(s.title)}</span>
                      <div className="flex-1 min-w-0">
                        {editingSessionId === s.id ? (
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onBlur={() => handleRenameSession(s.id)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameSession(s.id); if (e.key === 'Escape') setEditingSessionId(null); }}
                            className="w-full text-xs bg-transparent border-b border-primary outline-none text-foreground"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span className={`block text-xs truncate leading-tight ${s.id === activeSessionId ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                              {s.title}
                            </span>
                            <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                              {formatSessionDate(s.updatedAt || s.createdAt)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Hover actions */}
                      {hoveredSession === s.id && editingSessionId !== s.id && (
                        <div className="absolute right-2 top-2 flex items-center gap-0.5 bg-card/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-sm p-0.5">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingSessionId(s.id); setEditTitle(s.title); }}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Renommer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDuplicateSession(s); }}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Dupliquer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {sessions.length > 1 && (
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                              className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground/50 text-xs">Aucune session trouvée</div>
              )}
            </div>

            {/* Agent Hub Button */}
            {onNavigate && (
              <div className="border-t border-border/50 px-3 py-2">
                <button
                  onClick={() => onNavigate('agent_hub')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary transition-all group"
                >
                  <Cpu className="w-4 h-4" />
                  <div className="text-left">
                    <span className="text-[11px] font-bold block leading-tight">OSMOSIS Agents</span>
                    <span className="text-[9px] text-primary/60">Hub & Architecture</span>
                  </div>
                  <ChevronRight className="w-3 h-3 ml-auto opacity-50 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            )}

            {/* Sidebar Footer */}
            <div className="border-t border-border/50 px-3 py-2.5 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/60">{sessions.length} session{sessions.length > 1 ? 's' : ''}</span>
              <button
                onClick={() => { if (confirm('Supprimer toutes les sessions ?')) sessionStore.clearAllSessions(); }}
                className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors"
              >
                Tout effacer
              </button>
            </div>
          </>
        )}

        {/* Collapsed mode: icon strip */}
        {sidebarMode === 'collapsed' && (
          <div className="flex flex-col items-center py-3 gap-2">
            <button
              onClick={() => setSidebarMode('full')}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Étendre la sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewSession}
              className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="Nouvelle session"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="w-6 h-px bg-border/50 my-1" />
            <div className="flex-1 overflow-y-auto flex flex-col gap-1 items-center px-1 w-full">
              {sessions.slice(0, 20).map(s => (
                <button
                  key={s.id}
                  onClick={() => { if (!isLoading) sessionStore.setActiveSession(s.id); }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-all ${
                    s.id === activeSessionId ? 'bg-primary/15 shadow-sm' : 'hover:bg-muted/60'
                  }`}
                  title={s.title}
                >
                  {getSessionIcon(s.title)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {sidebarMode === 'hidden' && (
              <button onClick={() => setSidebarMode('full')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
              <Sparkles className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">OSMOSIS — AI Network Analyst</h1>
              <p className="text-[11px] text-muted-foreground">{activeSession?.title || 'Prêt à analyser votre réseau'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowDebug(d => !d)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono transition-colors ${showDebug ? 'bg-destructive/15 text-destructive' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}>
              🐛 Debug
            </button>
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Effacer">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="border-b border-border bg-muted/30 px-5 py-3 max-h-40 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold font-mono text-foreground">DEBUG</span>
              <button onClick={() => setDebugLogs([])} className="text-[10px] text-muted-foreground hover:text-foreground font-mono">Clear</button>
            </div>
            <div className="space-y-0.5 text-[10px] font-mono">
              <div className="text-primary">Mode: <strong>{isLocalMode() ? 'LOCAL' : 'CLOUD'}</strong></div>
              <div className="text-muted-foreground">Session: {activeSessionId} | Msgs: {messages.length}</div>
              {debugLogs.map((log, i) => (
                <div key={i} className={log.includes('Error') || log.includes('error') ? 'text-destructive' : log.includes('✅') ? 'text-primary' : 'text-foreground/60'}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Messages / Welcome */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12 gap-8">
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center border border-primary/10 shadow-lg shadow-primary/5">
                  <Bot className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Bonjour, je suis OSMOSIS 👋</h2>
                <p className="text-sm text-muted-foreground text-center max-w-lg leading-relaxed">
                  Assistant IA pour l'analyse QoE réseau. Posez vos questions : classements, comparaisons, diagnostics, analyses par dimension.
                </p>
              </div>

              {/* Quick suggestion chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-border/80 bg-card hover:bg-muted/40 hover:border-primary/30 hover:shadow-md transition-all text-left group"
                  >
                    <MessageSquare className="w-4 h-4 text-primary/50 mt-0.5 shrink-0 group-hover:text-primary transition-colors" />
                    <span className="text-xs text-foreground/70 group-hover:text-foreground transition-colors leading-relaxed">{s}</span>
                  </button>
                ))}
                {sites.length > 0 && onShowWorstCells && (
                  <button
                    onClick={() => handleShowWorstCells('qoe_score_avg', 10)}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 border-destructive/20 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/40 transition-all text-left group col-span-1 sm:col-span-2"
                  >
                    <MapPin className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-foreground">🗺️ Top 10 Worst Cells → Carte</span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">Localise les 10 pires cellules en QoE sur la carte</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto px-5 py-6 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-1 border border-primary/10">
                      {msg.agent && AGENT_META[msg.agent] ? (
                        <span className="text-base leading-none">{AGENT_META[msg.agent].emoji}</span>
                      ) : (
                        <Bot className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  )}
                  <div className={`max-w-[85%] overflow-hidden relative group ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 shadow-sm'
                      : 'bg-card border border-border/80 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      <>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all">
                          <CopyButton text={msg.content} />
                        </div>
                      </>
                    ) : (
                      <>
                        {msg.agent && AGENT_META[msg.agent] && (
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-md"
                              style={{ backgroundColor: AGENT_META[msg.agent].color, boxShadow: `0 2px 8px ${AGENT_META[msg.agent].color}55` }}
                            >
                              {AGENT_META[msg.agent].emoji} {AGENT_META[msg.agent].label}
                            </span>
                          </div>
                        )}
                        {msg.progressEvents && msg.progressEvents.length > 0 && (
                          <AgentTimeline
                            events={msg.progressEvents}
                            isStreaming={isLoading && i === messages.length - 1}
                          />
                        )}
                        <AssistantMessage content={msg.content} isStreaming={isLoading && i === messages.length - 1} onSendPrompt={send} />
                        {msg.mapCellIds && msg.mapCellIds.length > 0 && onShowWorstCells && (
                          <button
                            onClick={() => onShowWorstCells(msg.mapCellIds!)}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all text-xs font-semibold shadow-sm"
                          >
                            <MapPin className="w-4 h-4" />
                            Voir sur la carte ({msg.mapCellIds.length})
                          </button>
                        )}
                        <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-border/30">
                          <FeedbackButtons
                            sessionId={activeSessionId || ''}
                            messageIndex={i}
                            agent={msg.agent || 'OSMOSIS'}
                            userQuestion={i > 0 ? messages[i - 1]?.content || '' : ''}
                            assistantResponse={msg.content}
                          />
                          <div className="flex-1" />
                          <ExportPDFButton msgRef={msg.content} index={i} />
                          <CopyButton text={msg.content} />
                        </div>
                      </>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-card border border-border/80 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Analyse en cours...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ══════════ BOTTOM CHAT INPUT ══════════ */}
        <ChatInput
          onSend={send}
          isLoading={isLoading}
          forcedAgent={forcedAgent}
          onForcedAgentChange={setForcedAgent}
          activeAgent={(() => {
            // Live agent ONLY during streaming. When idle, the pill is plain
            // "Auto" (no stale agent leaking from a prior conversation turn).
            if (!isLoading) return null;
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant' && last.agent) return last.agent as AgentId;
            // Loading but no agent identified yet → orchestrator is deciding.
            return 'OSMOSIS';
          })()}
        />
      </div>
    </div>
  );
};

// ─── Sub-components (unchanged logic, refined styles) ───

const FeedbackButtons: React.FC<{
  sessionId: string; messageIndex: number; agent: string; userQuestion: string; assistantResponse: string;
}> = ({ sessionId, messageIndex, agent, userQuestion, assistantResponse }) => {
  const { submitFeedback, getFeedbackKey } = useAgentLearningStore();
  const existing = getFeedbackKey(sessionId, messageIndex);
  const handleRate = (rating: 1 | -1) => {
    if (existing === rating) return;
    submitFeedback({ sessionId, messageIndex, userQuestion, assistantResponse, agent, rating });
    toast(rating === 1 ? '👍 Merci ! Réponse enregistrée.' : '👎 Noté, nous en tiendrons compte.');
  };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => handleRate(1)} className={`p-1 rounded-md transition-all ${existing === 1 ? 'bg-green-500/20 text-green-500' : 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10'}`} title="Bonne réponse">
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => handleRate(-1)} className={`p-1 rounded-md transition-all ${existing === -1 ? 'bg-red-500/20 text-red-500' : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'}`} title="Mauvaise réponse">
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      {existing && (
        <span className="text-[9px] text-muted-foreground ml-1 flex items-center gap-1">
          <Brain className="w-3 h-3" /> Apprentissage
        </span>
      )}
    </div>
  );
};

const ExportPDFButton: React.FC<{ msgRef: string; index: number }> = ({ msgRef, index }) => {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    const msgElements = document.querySelectorAll('.ai-msg-content');
    const el = msgElements[index] as HTMLElement | null;
    if (!el) return;
    setExporting(true);
    try {
      await exportElementToPDF(el, `OSMOSIS_response_${index + 1}`);
      toast.success('PDF exporté');
    } catch { toast.error('Erreur export'); }
    finally { setExporting(false); }
  };
  return (
    <button onClick={handleExport} disabled={exporting} className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-all" title="Exporter PDF">
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
    </button>
  );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-HTTPS contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-all" title="Copier">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const SITE_LEVEL_DESIGN_PATTERNS = [
  /coh[ée]rence\s+azimuts?/i,
  /tilt\s+vs\s+fr[ée]quence/i,
  /tilt\s+vs\s+isd/i,
  /delta\s+tilt\s+secteurs?/i,
  /distance\s+inter-?site/i,
  /d[ée]tail\s+tilt\s+intra-?site/i,
  /azimuth\s+spacing/i,
  /sector\s+configuration/i,
  /s\d+\s+azimuth\s+coherence/i,
  /s\d+\s+tilt\s+delta/i,
  /hba\s+consistency/i,
  /5g\/4g\s+co-?location/i,
  /cell\s+state/i,
  /\b\d+\s*sectors?\b/i,
  /\b\d+\s*secteurs?\b/i,
];

const CELL_LEVEL_DESIGN_HINTS = [
  /\bcell\b/i,
  /cellule/i,
  /cell id/i,
  /\bpci\b/i,
  /\beci\b/i,
  /\bnci\b/i,
  /\becgi\b/i,
  /earfcn/i,
];

function isSiteLevelDesignSection(text: string): boolean {
  if (!text) return false;
  const siteMatches = SITE_LEVEL_DESIGN_PATTERNS.filter((pattern) => pattern.test(text)).length;
  const cellMatches = CELL_LEVEL_DESIGN_HINTS.filter((pattern) => pattern.test(text)).length;
  return siteMatches >= 2 && cellMatches === 0;
}

function stripSiteLevelDesignSections(text: string): string {
  if (!/design\s*check/i.test(text)) return text;

  const lines = text.split('\n');
  const kept: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const isDesignHeading = /^\s{0,3}#{1,6}\s+.*design\s*check/i.test(line) || /^\s*\*\*.*design\s*check.*\*\*\s*$/i.test(line);

    if (!isDesignHeading) {
      kept.push(line);
      index += 1;
      continue;
    }

    const sectionLines = [line];
    index += 1;

    while (index < lines.length) {
      const current = lines[index];
      const nextIsHeading = /^\s{0,3}#{1,6}\s+/.test(current);
      const nextIsStrongTitle = /^\s*\*\*.*\*\*\s*$/.test(current) && !/^\s*\|/.test(current);
      if ((nextIsHeading || nextIsStrongTitle) && sectionLines.length > 1) break;
      sectionLines.push(current);
      index += 1;
    }

    const sectionText = sectionLines.join('\n');
    if (!isSiteLevelDesignSection(sectionText)) {
      kept.push(...sectionLines);
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}
/**
 * Converts inline design analysis lines (emoji + text + status) into a proper markdown table.
 * Matches patterns like: 🧭Cohérence azimuts secteursWARN3 secteursAzimuts: ...
 */
function convertDesignAnalysisToTable(text: string): string {
  // Match any leading emoji (including variation selectors like 🏗️)
  const emojiPrefix = /^([\p{Emoji}\p{Emoji_Presentation}][\uFE0E\uFE0F]?[\u200D\p{Emoji}\p{Emoji_Presentation}\uFE0E\uFE0F]*)\s*/u;
  // Match status keywords that follow a lowercase letter or closing paren (no word boundary needed)
  const statusRe = /(?<=[a-zéèêëàùûôîïç\)])(?:WARN|CRITICAL|CRIT|OK|KO|INFO)/;

  const lines = text.split('\n');
  const result: string[] = [];
  let analysisLines: { icon: string; check: string; status: string; details: string }[] = [];
  let siteSummaryLine: string | null = null;

  const flushAnalysis = () => {
    if (analysisLines.length === 0) {
      if (siteSummaryLine) {
        result.push('', siteSummaryLine, '');
        siteSummaryLine = null;
      }
      return;
    }

    if (siteSummaryLine) {
      result.push('', siteSummaryLine, '');
      siteSummaryLine = null;
    }

    result.push('| Vérification | Statut | Détails |');
    result.push('|:---|:---:|:---|');
    for (const al of analysisLines) {
      const details = al.details
        .replace(/(\d+)\s*(anomalies?|inversions?|secteurs?)/gi, '**$1** $2')
        .replace(/\|/g, '\\|');
      result.push(`| ${al.icon} ${al.check} | ${al.status} | ${details} |`);
    }
    result.push('');
    analysisLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushAnalysis(); result.push(line); continue; }

    // Check if line starts with an emoji
    const emojiMatch = trimmed.match(emojiPrefix);
    if (!emojiMatch) { flushAnalysis(); result.push(line); continue; }

    const icon = emojiMatch[1];
    const rest = trimmed.slice(emojiMatch[0].length);

    // Must contain a status keyword
    const statusMatch = rest.match(statusRe);
    if (!statusMatch) { flushAnalysis(); result.push(line); continue; }

    const statusIdx = statusMatch.index!;
    const status = statusMatch[0];
    const checkName = rest.slice(0, statusIdx).trim();
    const details = rest.slice(statusIdx + status.length).trim();

    // Summary line: 🏗️SITE_NAME 18 cells · 6 bands...
    if (/[\u{1F3D7}]/u.test(icon) && /\d+\s*cells/i.test(rest)) {
      const summaryParts = rest.match(/^(.+?)(\d+\s*cells.*)$/i);
      const sName = summaryParts ? summaryParts[1].trim() : checkName;
      const sCells = summaryParts ? summaryParts[2].replace(statusRe, '').trim() : '';
      siteSummaryLine = `**${sName}** — ${sCells} — **${status}**`;
      continue;
    }

    analysisLines.push({ icon, check: checkName, status, details });
  }
  flushAnalysis();

  return result.join('\n');
}

// Detect agent name from the embedded marker so the kit can pick the right badge.
function extractAgentMarker(content: string): string | undefined {
  const m = content.match(/<!--\s*AGENT:(\w+)\s*-->/);
  return m ? m[1] : undefined;
}

// Opt-out of the kit renderer via URL param `?ui=legacy`.
function isKitRendererEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get('ui') === 'legacy') return false;
    if (p.get('ui') === 'v2' || p.get('ui') === 'kit') return true;
  } catch { /* ignore */ }
  return true;
}

const AssistantMessage: React.FC<{ content: string; isStreaming?: boolean; onSendPrompt?: (text: string) => void }> = React.memo(({ content, isStreaming, onSendPrompt }) => {
  const agentName = useMemo(() => extractAgentMarker(content), [content]);
  const useKit = isKitRendererEnabled();

  const cleaned = useMemo(() => {
    let text = content;
    text = text.replace(/<!--\s*AGENT:\w+\s*-->\n?/g, '');
    text = text.replace(/<!--\s*PROGRESS:.*?-->\n?/g, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<\/?(?:div|span|table|thead|tbody|tr|td|th|style|br|hr|img|p|ul|ol|li|h[1-6]|a|b|i|em|strong|code|pre)[^>]*>/gi, '');
    text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    text = stripSiteLevelDesignSections(text);
    text = convertDesignAnalysisToTable(text);
    return text;
  }, [content]);

  // Kit-rendered final view: parse the streamed text into the kit's schema
  // and render via <AgentResponse>. Skipped during streaming to keep the
  // typing perception, and skipped entirely if the user opted out.
  const kitData = useMemo(() => {
    if (!useKit || isStreaming) return null;
    if (!cleaned || cleaned.length < 20) return null;
    try {
      return parseToAgentResponse(cleaned, agentName, { source: 'orchestrator/stream' });
    } catch (e) {
      console.warn('[AssistantMessage] kit adapter failed, falling back to legacy', e);
      return null;
    }
  }, [cleaned, agentName, isStreaming, useKit]);

  // ── Hooks must be called in the same order on every render — keep these
  //    above the early `if (kitData) return ...` to avoid React #300.
  const vizBlocks = useMemo(() => parseVisualizationBlocks(cleaned), [cleaned]);
  const hasViz = vizBlocks.some(b => b.type !== 'markdown');

  // Extract worst_cells blocks (rendered via WorstCellsView, both kit and legacy paths).
  const worstCellsBlocks = useMemo(
    () => vizBlocks
      .filter(b => b.type === 'worst_cells')
      .map(b => ((b as { type: 'worst_cells'; config: unknown }).config) as WorstCellsResponse),
    [vizBlocks],
  );

  const renderWithKpiCards = useCallback((md: string) => {
    const sanitizedMd = stripSiteLevelDesignSections(md);
    const kpiBlocks = parseKpiBlocks(sanitizedMd);
    const hasKpiBlocks = kpiBlocks.some(b => b.type !== 'markdown');
    if (!hasKpiBlocks) return <MarkdownBlock content={sanitizedMd} />;
    return (
      <>
        {kpiBlocks.map((block, j) => {
          if (block.type === 'kpi_summary' && block.summaries) return <KpiSummaryCards key={j} summaries={block.summaries} />;
          if (block.type === 'split_section' && block.splitEntries && block.splitDimension) return <SplitSectionCards key={j} dimension={block.splitDimension} entries={block.splitEntries} />;
          return <MarkdownBlock key={j} content={block.content || ''} />;
        })}
      </>
    );
  }, []);

  if (kitData) {
    // Scope the kit's CSS tokens locally so the kit components render with
    // their intended colors without polluting global app styles.
    const kitTokens: React.CSSProperties = {
      // @ts-expect-error — CSS custom properties on inline style.
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f7f7f5',
      '--bg-tertiary': '#f1efe8',
      '--text-primary': '#1a1a1a',
      '--text-secondary': '#5f5e5a',
      '--text-tertiary': '#888780',
      '--border-tertiary': 'rgba(0, 0, 0, 0.08)',
      '--border-secondary': 'rgba(0, 0, 0, 0.15)',
      '--border-primary': 'rgba(0, 0, 0, 0.25)',
      '--status-success-bg': '#e1f5ee',
      '--status-success-fg': '#0f6e56',
      '--status-success-border': '#1d9e75',
      '--status-warning-bg': '#faeeda',
      '--status-warning-fg': '#ba7517',
      '--status-warning-border': '#ef9f27',
      '--status-danger-bg': '#fcebeb',
      '--status-danger-fg': '#a32d2d',
      '--status-danger-border': '#e24b4a',
      '--status-info-bg': '#e6f1fb',
      '--status-info-fg': '#185fa5',
      '--status-info-border': '#378add',
      '--status-neutral-bg': '#f1efe8',
      '--status-neutral-fg': '#5f5e5a',
      '--status-neutral-border': '#b4b2a9',
      '--osmosis-primary': '#0f6e56',
      '--osmosis-primary-light': '#1d9e75',
    };
    return (
      <div className="ai-msg-content text-sm leading-relaxed" style={kitTokens}>
        {/* WorstCellsView rendered above the kit response when an agent
            emits a ```worst_cells JSON block — richer than the generic
            insights callout (carte SVG + tableau pro + drill-down). */}
        {worstCellsBlocks.map((cfg, i) => (
          <WorstCellsView key={`wc-${i}`} data={cfg} onSendPrompt={onSendPrompt} />
        ))}
        <KitAgentResponse data={kitData} onFollowUp={onSendPrompt} />
      </div>
    );
  }

  return (
    <div className="ai-msg-content text-sm leading-relaxed text-foreground">
      {hasViz ? (
        vizBlocks.map((block, i) => {
          if (block.type === 'chart') return <InlineChart key={i} config={block.config} />;
          if (block.type === 'map') return (
            <Suspense key={i} fallback={<div className="h-[250px] bg-muted animate-pulse rounded-xl my-4" />}>
              <InlineMap config={block.config} />
            </Suspense>
          );
          if (block.type === 'kpi') return <InlineKPICards key={i} config={block.config} />;
          if (block.type === 'insights') return null; /* legacy renderer skips structured insights — kit renderer handles them */
          if (block.type === 'worst_cells') return <WorstCellsView key={i} data={block.config as unknown as WorstCellsResponse} onSendPrompt={onSendPrompt} />;
          return <React.Fragment key={i}>{renderWithKpiCards(block.content)}</React.Fragment>;
        })
      ) : (
        renderWithKpiCards(cleaned)
      )}
    </div>
  );
});
AssistantMessage.displayName = 'AssistantMessage';

// ─── KPI Color Map ───
const KPI_HEADER_COLOR_MAP: { pattern: RegExp; color: string }[] = [
  { pattern: /qoe|qos|qualit/i, color: '#22c55e' },
  { pattern: /rtt|latence|latency/i, color: '#f97316' },
  { pattern: /d[ée]bit\s*dl|throughput\s*dl|dl.*mbps/i, color: '#3b82f6' },
  { pattern: /d[ée]bit\s*ul|throughput\s*ul|ul.*mbps/i, color: '#8b5cf6' },
  { pattern: /loss|perte/i, color: '#ef4444' },
  { pattern: /retr|retrans/i, color: '#ec4899' },
  { pattern: /session|dcr|drop|coupure/i, color: '#f59e0b' },
  { pattern: /dms|streaming/i, color: '#06b6d4' },
  { pattern: /volume|traffic|trafic/i, color: '#14b8a6' },
  { pattern: /wind|window/i, color: '#a855f7' },
  { pattern: /fallback/i, color: '#d946ef' },
  { pattern: /instabil/i, color: '#e11d48' },
  { pattern: /rat|techno/i, color: '#0ea5e9' },
  { pattern: /5g.*cap|attach/i, color: '#7c3aed' },
  { pattern: /tilt|inclinaison|e-tilt/i, color: '#0d9488' },
  { pattern: /azimut|azimuth/i, color: '#2563eb' },
  { pattern: /hba|hauteur/i, color: '#9333ea' },
  { pattern: /nb\s*site|nombre.*site|count.*site|sites/i, color: '#16a34a' },
  { pattern: /nb\s*cell|nombre.*cell|count.*cell|cellule/i, color: '#059669' },
  { pattern: /zone\s*arcep/i, color: '#ca8a04' },
  { pattern: /bande|band|fr[ée]q/i, color: '#ea580c' },
  { pattern: /dor|direction/i, color: '#4f46e5' },
  { pattern: /plaque|r[ée]gion/i, color: '#0891b2' },
  { pattern: /construct|vendor|fournisseur/i, color: '#be185d' },
];

function getKpiColorForHeader(header: string): string | null {
  for (const { pattern, color } of KPI_HEADER_COLOR_MAP) {
    if (pattern.test(header)) return color;
  }
  return null;
}

const TableHeadersContext = React.createContext<string[]>([]);

const KpiColorTable: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const headersRef = React.useRef<string[]>([]);
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [tableText, setTableText] = React.useState('');

  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const nextHeaders = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent || '').filter(Boolean);
    if (nextHeaders.length > 0 && nextHeaders.join('|') !== headersRef.current.join('|')) {
      headersRef.current = nextHeaders;
      setHeaders(nextHeaders);
    }

    const nextTableText = table.innerText || table.textContent || '';
    setTableText((prev) => prev === nextTableText ? prev : nextTableText);
  }, [children]);

  const isAnomalyTable = headers.some(h => /statut|status|état/i.test(h));
  const isSiteAnomalyTable = isAnomalyTable && isSiteLevelDesignSection(tableText);

  if (isSiteAnomalyTable) return null;

  return (
    <TableHeadersContext.Provider value={headers}>
      <div className={`my-4 rounded-xl border overflow-hidden shadow-sm ${isAnomalyTable ? 'border-primary/30' : 'border-border'}`}>
        {isAnomalyTable && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
            <span className="text-sm">🔍</span>
            <span className="text-xs font-bold text-primary tracking-wide">Analyse des Anomalies</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full border-collapse text-xs">{children}</table>
        </div>
      </div>
    </TableHeadersContext.Provider>
  );
};

const StatusBadge: React.FC<{ type: 'warn' | 'ok' | 'critical' | 'info'; label: string }> = ({ type, label }) => {
  const styles: Record<string, { bg: string; text: string; icon: string }> = {
    warn: { bg: 'hsl(38, 92%, 94%)', text: 'hsl(32, 95%, 40%)', icon: '⚠️' },
    critical: { bg: 'hsl(0, 80%, 95%)', text: 'hsl(0, 80%, 42%)', icon: '🔴' },
    ok: { bg: 'hsl(142, 60%, 93%)', text: 'hsl(142, 70%, 32%)', icon: '✅' },
    info: { bg: 'hsl(210, 70%, 94%)', text: 'hsl(210, 70%, 40%)', icon: 'ℹ️' },
  };
  const s = styles[type];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
      style={{ background: s.bg, color: s.text }}>
      <span className="text-[10px]">{s.icon}</span> {label}
    </span>
  );
};

function detectStatusBadge(text: string): React.ReactNode | null {
  const t = text.trim();
  if (/^⚠️?\s*WARN$/i.test(t) || /^WARN$/i.test(t))
    return <StatusBadge type="warn" label="WARN" />;
  if (/^🔴?\s*(CRITICAL|CRIT|KO)$/i.test(t) || /^(CRITICAL|CRIT|KO)$/i.test(t))
    return <StatusBadge type="critical" label={t.replace(/🔴\s*/, '')} />;
  if (/^✅?\s*OK$/i.test(t) || /^OK$/i.test(t))
    return <StatusBadge type="ok" label="OK" />;
  if (/^ℹ️?\s*INFO$/i.test(t) || /^INFO$/i.test(t))
    return <StatusBadge type="info" label="INFO" />;
  return null;
}

const KpiTd: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = React.memo(({ children, style }) => {
  const headers = React.useContext(TableHeadersContext);
  const text = String(children ?? '');
  const baseCls = "px-3 py-2.5 text-xs border-b border-border/30";
  const tdRef = React.useRef<HTMLTableCellElement>(null);
  const [colIndex, setColIndex] = React.useState(-1);

  React.useEffect(() => {
    if (tdRef.current) {
      const row = tdRef.current.parentElement;
      if (row) setColIndex(Array.from(row.children).indexOf(tdRef.current));
    }
  }, []);

  const headerText = colIndex >= 0 && colIndex < headers.length ? headers[colIndex] : '';
  const isStatusCol = /statut|status|état/i.test(headerText);
  const kpiColor = headerText ? getKpiColorForHeader(headerText) : null;

  // Status badge detection (for Statut columns or standalone WARN/OK/CRITICAL)
  const badge = detectStatusBadge(text);
  if (badge || isStatusCol) {
    const renderedBadge = badge || detectStatusBadge(text.replace(/[^\w\s]/g, '').trim());
    if (renderedBadge) return <td ref={tdRef} className={`${baseCls} text-center`}>{renderedBadge}</td>;
  }

  // First column = parameter name with accent color
  if (colIndex === 0) return <td ref={tdRef} className={`${baseCls} font-semibold text-primary whitespace-nowrap`}>{children}</td>;

  if (kpiColor) {
    const isNumeric = /^\s*-?\d/.test(text) || /\d+\.?\d*\s*(%|Mbps|ms|s)?\s*$/.test(text);
    if (isNumeric) return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color: kpiColor }}>{children}</td>;
  }

  if (text.includes('🔴') || /critique|critical/i.test(text))
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(0, 80%, 50%)' }}>{children}</td>;
  if (text.includes('🟠') || /dégradé|bad|mauvais/i.test(text))
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(25, 90%, 50%)' }}>{children}</td>;
  if (text.includes('🟡') || /moyen|warning|attention/i.test(text))
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(45, 90%, 45%)' }}>{children}</td>;
  if (text.includes('🟢') || /excellent|good|bon/i.test(text))
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(142, 70%, 40%)' }}>{children}</td>;

  // Italic style for warning details (Sur-tiltage, intrusion, etc.)
  if (/sur-tilt|intrusion|dégradation|fortement/i.test(text)) {
    return <td ref={tdRef} className={`${baseCls} italic`} style={{ color: 'hsl(32, 95%, 40%)' }}>{children}</td>;
  }

  const deltaMatch = text.match(/^([+-])\s*(\d+\.?\d*)\s*(%|pts?|ms|s|Mbps)?$/);
  if (deltaMatch) {
    const sign = deltaMatch[1];
    const val = parseFloat(deltaMatch[2]);
    const unit = (deltaMatch[3] || '').toLowerCase();
    const isLatencyMetric = unit === 'ms' || unit === 's';
    const isGood = isLatencyMetric ? sign === '-' : sign === '+';
    const severity = val > 15 ? 'high' : val > 5 ? 'mid' : 'low';
    let color: string;
    if (isGood) { color = severity === 'high' ? 'hsl(142, 70%, 35%)' : severity === 'mid' ? 'hsl(142, 60%, 42%)' : 'hsl(142, 50%, 48%)'; }
    else { color = severity === 'high' ? 'hsl(0, 80%, 48%)' : severity === 'mid' ? 'hsl(25, 90%, 50%)' : 'hsl(45, 85%, 45%)'; }
    return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
  }

  const signedNumMatch = text.match(/([+-])(\d+\.?\d*)/);
  if (signedNumMatch) {
    const sign = signedNumMatch[1];
    const val = parseFloat(signedNumMatch[2]);
    if (val > 0) {
      const color = sign === '+' ? 'hsl(142, 70%, 40%)' : 'hsl(0, 80%, 48%)';
      return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
    }
  }

  if (/^[\d\s.]+$/.test(text)) return <td ref={tdRef} className={`${baseCls} font-medium text-foreground`}>{children}</td>;

  return <td ref={tdRef} className={`${baseCls} text-foreground/85 leading-relaxed`}>{children}</td>;
});
KpiTd.displayName = 'KpiTd';

const MarkdownBlock: React.FC<{ content: string }> = React.memo(({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkBreaks]}
    components={{
      h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-5 mb-3">{children}</h1>,
      h2: ({ children }) => (
        <h2 className="text-[15px] font-bold text-foreground mt-5 mb-2.5 flex items-center gap-2 pb-1.5 border-b border-border/50">
          <span className="w-1 h-5 bg-primary rounded-full inline-block shrink-0" />
          {children}
        </h2>
      ),
      h3: ({ children }) => <h3 className="text-sm font-bold text-foreground mt-4 mb-2">{children}</h3>,
      p: ({ children }) => <p className="text-[13px] leading-[1.75] text-foreground/85 mb-3">{children}</p>,
      strong: ({ children }) => <strong className="font-bold text-primary">{children}</strong>,
      em: ({ children }) => <em className="text-foreground/60 italic">{children}</em>,
      pre: ({ children }) => {
        const raw = String(
          React.Children.toArray(
            React.isValidElement(children) ? (children.props as any).children : children
          ).join('')
        ).trim();
        if (raw.startsWith('{') || raw.startsWith('[')) {
          try {
            const config = JSON.parse(raw);
            if (config.cards && Array.isArray(config.cards)) return <InlineKPICards config={config} />;
            if (config.chartType || config.type === 'line' || config.type === 'bar' || config.type === 'area') return <InlineChart config={config} />;
            if (config.markers || config.center) return (
              <Suspense fallback={<div className="h-[250px] bg-muted animate-pulse rounded-xl my-4" />}>
                <InlineMap config={config} />
              </Suspense>
            );
          } catch { /* not JSON */ }
        }
        return <pre className="bg-muted/60 border border-border rounded-lg px-4 py-3 overflow-x-auto my-3 text-xs font-mono text-foreground">{children}</pre>;
      },
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        if (className?.includes('language-chart') || className?.includes('language-map') || className?.includes('language-kpi')) {
          const raw = String(children).trim();
          try {
            const config = JSON.parse(raw);
            const blockType = className.includes('language-chart') ? 'chart' : className.includes('language-map') ? 'map' : 'kpi';
            if (blockType === 'chart') return <InlineChart config={config} />;
            if (blockType === 'map') return (
              <Suspense fallback={<div className="h-[250px] bg-muted animate-pulse rounded-xl my-4" />}>
                <InlineMap config={config} />
              </Suspense>
            );
            if (blockType === 'kpi') return <InlineKPICards config={config} />;
          } catch { /* fall through */ }
        }
        if (isBlock) return <code className="text-xs font-mono text-foreground">{children}</code>;
        return <code className="bg-primary/10 text-primary font-mono text-[11px] px-1.5 py-0.5 rounded-md font-semibold">{children}</code>;
      },
      ul: ({ children }) => <ul className="space-y-2 my-3 ml-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="space-y-2 my-3 ml-0.5 counter-reset-item">{children}</ol>,
      li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
          <li className="text-[13px] text-foreground/85 flex items-start gap-2.5 leading-[1.7]">
            {ordered ? (
              <span className="w-5 h-5 rounded-md bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{(index ?? 0) + 1}</span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-[9px] shrink-0" />
            )}
            <span className="flex-1">{children}</span>
          </li>
        );
      },
      table: ({ children }) => <KpiColorTable>{children}</KpiColorTable>,
      thead: ({ children }) => <thead className="bg-muted/80 sticky top-0 z-10">{children}</thead>,
      th: ({ children }) => {
        const text = String(children ?? '');
        const isStatus = /statut|status|état/i.test(text);
        return <th className={`px-3 py-2.5 text-[11px] font-bold text-foreground border-b-2 border-border tracking-wide ${isStatus ? 'text-center w-20' : 'text-left'}`}>{children}</th>;
      },
      td: ({ children, style }) => <KpiTd style={style}>{children}</KpiTd>,
      tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors even:bg-muted/10">{children}</tr>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-[3px] border-primary bg-primary/5 rounded-r-lg px-4 py-3 my-3 text-[13px] text-foreground/75 italic">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="border-border/50 my-5" />,
      a: ({ href, children }) => <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">{children}</a>,
    }}
  >
    {content}
  </ReactMarkdown>
));
MarkdownBlock.displayName = 'MarkdownBlock';

export default AIAssistantPage;
// v1.8 redeploy 1777056207
