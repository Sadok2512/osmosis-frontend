import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2, MessageSquare, Copy, Check, FileDown, MapPin, Plus, X, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportElementToPDF } from '@/lib/exportUtils';
import { SiteSummary } from '@/types';
import { parseVisualizationBlocks } from './chat-visualizations/parseVisualizationBlocks';
import InlineChart from './chat-visualizations/InlineChart';
import InlineKPICards from './chat-visualizations/InlineKPICards';
import { getApiUrl, getApiHeaders, isLocalMode } from '@/lib/apiConfig';
import { useChatSessionStore, type ChatMessage } from '@/stores/chatSessionStore';
const InlineMap = lazy(() => import('./chat-visualizations/InlineMap'));

type AgentId = 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'QOEBIT';
type Msg = ChatMessage;

const AGENT_META: Record<AgentId, { emoji: string; label: string; color: string }> = {
  PULSE: { emoji: '📡', label: 'PULSE', color: 'hsl(200, 80%, 50%)' },
  TRACE: { emoji: '🔧', label: 'TRACE', color: 'hsl(35, 90%, 50%)' },
  SENTINEL: { emoji: '🚨', label: 'SENTINEL', color: 'hsl(0, 80%, 55%)' },
  TOPO: { emoji: '🗼', label: 'TOPO', color: 'hsl(270, 70%, 55%)' },
  QOEBIT: { emoji: '🧠', label: 'QOEBIT', color: 'hsl(142, 60%, 45%)' },
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
  "Top 5 des plaques régionales en DMS DL 30M",
  "Quel est l'état du réseau en zone rurale ?",
];

interface AIAssistantPageProps {
  sites?: SiteSummary[];
  onShowWorstCells?: (cellIds: string[]) => void;
  initialPrompt?: string;
  onPromptConsumed?: () => void;
}

const AIAssistantPage: React.FC<AIAssistantPageProps> = ({ sites = [], onShowWorstCells, initialPrompt, onPromptConsumed }) => {
  const sessionStore = useChatSessionStore();
  const { sessions, activeSessionId } = sessionStore;
  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const messages = activeSession?.messages || [];

  // Use a ref to always have fresh messages in streaming callbacks
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

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const addDebugLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-50), `[${ts}] ${msg}`]);
  };

  // Create initial session if none exist
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

  // Auto-send initial prompt from Sites Monitor AI Diagnostic
  const initialPromptSentRef = useRef(false);
  useEffect(() => {
    if (initialPrompt && !initialPromptSentRef.current && !isLoading) {
      initialPromptSentRef.current = true;
      onPromptConsumed?.();
      // Small delay to ensure component is mounted
      setTimeout(() => send(initialPrompt), 300);
    }
  }, [initialPrompt]);

  // Build lightweight uiScope + filters for context-on-demand (no more giant cellContext)
  const uiScope = useMemo(() => ({
    selectedSiteName: null as string | null,
    selectedCellId: null as string | null,
    page: 'global' as const,
  }), []);

  const assistantFilters = useMemo(() => ({
    // Could be enriched from a global filter bar if available
  }), []);

  // All available cell IDs for extraction matching
  const allCellIds = useMemo(() => {
    return sites.flatMap(s => s.cells.map(c => c.cell_id));
  }, [sites]);

  const streamChat = async (allMessages: Msg[]): Promise<string> => {
    // Read LLM config from localStorage (set by BackendAdmin)
    let openrouterKey = '';
    let llmModel = '';
    try {
      const saved = localStorage.getItem('qoebit_llm_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        openrouterKey = cfg.apiKey || '';
        llmModel = cfg.model || '';
      }
    } catch { /* ignore */ }

    // ── Truncate old messages to avoid sending 1M+ tokens ──
    // Keep last 6 messages, truncate older assistant messages to 500 chars
    const MAX_RECENT = 6;
    const MAX_OLD_ASSISTANT_CHARS = 500;
    const trimmedMessages = allMessages.map((m, i) => {
      const isRecent = i >= allMessages.length - MAX_RECENT;
      if (isRecent || m.role === 'user') return { role: m.role, content: m.content };
      // Truncate old assistant messages
      if (m.content.length > MAX_OLD_ASSISTANT_CHARS) {
        return { role: m.role, content: m.content.slice(0, MAX_OLD_ASSISTANT_CHARS) + '\n[... réponse tronquée pour optimisation ...]' };
      }
      return { role: m.role, content: m.content };
    });

    // Context-on-demand: send uiScope + filters, NOT raw cellContext
    const payload = JSON.stringify({
      messages: trimmedMessages,
      uiScope,
      filters: assistantFilters,
      openrouter_key: openrouterKey,
      model: llmModel,
    });
    
    const url = getApiUrl('qoe-assistant');
    const headers = getApiHeaders();

    addDebugLog(`Mode: ${isLocalMode() ? 'LOCAL' : 'CLOUD'}`);
    addDebugLog(`URL: ${url}`);
    addDebugLog(`Headers: ${JSON.stringify(Object.keys(headers))}`);
    addDebugLog(`Payload size: ${(payload.length / 1024).toFixed(1)} KB`);
    addDebugLog(`Model: ${llmModel || '(default)'} | OpenRouter key: ${openrouterKey ? 'SET' : 'NONE'}`);

    console.log('[QOEBIT] streamChat called', { url, mode: isLocalMode() ? 'LOCAL' : 'CLOUD', payloadKB: (payload.length / 1024).toFixed(1) });

    // Timeout: 120s for the initial fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      addDebugLog('⏱️ Request timeout after 120s');
      console.error('[QOEBIT] Request timeout after 120s');
      controller.abort();
    }, 120000);

    let resp: Response;
    let usedCloud = false;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });
      addDebugLog(`Response status: ${resp.status} ${resp.statusText}`);
      console.log('[QOEBIT] Response:', resp.status, resp.statusText);
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      addDebugLog(`Fetch error: ${fetchErr.message}`);
      console.error('[QOEBIT] Fetch error:', fetchErr.message);
      // If local mode failed, try cloud fallback
      if (isLocalMode()) {
        addDebugLog('Falling back to Cloud...');
        usedCloud = true;
        const cloudUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qoe-assistant`;
        const cloudHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };
        resp = await fetch(cloudUrl, { method: 'POST', headers: cloudHeaders, body: payload });
        addDebugLog(`Cloud fallback status: ${resp.status} ${resp.statusText}`);
      } else {
        throw fetchErr;
      }
    }
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      addDebugLog(`Error body: ${errBody.slice(0, 200)}`);
      if (resp.status === 429) {
        toast({ title: 'Limite de requêtes atteinte', description: 'Veuillez réessayer dans quelques instants.', variant: 'destructive' });
        throw new Error('Rate limited');
      }
      if (resp.status === 402) {
        toast({ title: 'Crédits insuffisants', description: 'Ajoutez des crédits à votre workspace.', variant: 'destructive' });
        throw new Error('Payment required');
      }
      // Mark that cloud was used so error message is accurate
      if (usedCloud) {
        throw new Error(`Cloud fallback error (${resp.status}): ${errBody.slice(0, 100)}`);
      }
      throw new Error('Failed to start stream');
    }

    if (!resp.body) { addDebugLog('No response body!'); console.error('[QOEBIT] No response body'); throw new Error('No body'); }
    addDebugLog('Streaming started...');
    console.log('[QOEBIT] Streaming started');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';
    let assistantSoFar = '';
    let streamDone = false;

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
            const { agent, cleanContent } = extractAgent(assistantSoFar);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: cleanContent, agent: agent || m.agent } : m);
              }
              return [...prev, { role: 'assistant', content: cleanContent, agent: agent || undefined }];
            });
          }
        } catch {
          textBuffer = line + '\n' + textBuffer;
          break;
        }
      }
    }

    // Final flush
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
          if (content) {
            assistantSoFar += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
              }
              return [...prev, { role: 'assistant', content: assistantSoFar }];
            });
          }
        } catch { /* ignore */ }
      }
    }
    addDebugLog(`✅ Stream complete. Response length: ${assistantSoFar.length}`);
    console.log('[QOEBIT] Stream complete, length:', assistantSoFar.length);
    return assistantSoFar;
  };

  // Extract cell IDs from AI response by matching known cell IDs in the text
  const extractCellsFromResponse = (responseText: string) => {
    if (!sites.length || !onShowWorstCells) return;
    try {
      // Match cell IDs that appear in the response text
      const foundIds = allCellIds.filter(id => responseText.includes(id));
      // Deduplicate
      const uniqueIds = [...new Set(foundIds)];
      if (uniqueIds.length > 0) {
        setMessages(prev => {
          const newMsgs = [...prev];
          for (let i = newMsgs.length - 1; i >= 0; i--) {
            if (newMsgs[i].role === 'assistant') {
              newMsgs[i] = { ...newMsgs[i], mapCellIds: uniqueIds, mapDescription: `${uniqueIds.length} cellule(s) identifiée(s)` };
              break;
            }
          }
          return newMsgs;
        });
      }
    } catch (e) {
      console.error('Cell extraction failed:', e);
    }
  };

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    const userMsg: Msg = { role: 'user', content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const finalText = await streamChat(updatedMessages);
      extractCellsFromResponse(finalText);
    } catch (e: any) {
      console.error('QOEBIT stream error:', e);
      addDebugLog(`❌ Stream error: ${e?.message || String(e)}`);
      const errorDetail = e?.message || String(e);
      const isCloudFallbackError = errorDetail.includes('Cloud fallback');
      const isLocal = isLocalMode() && !isCloudFallbackError;
      const errorMsg = isLocal
        ? `⚠️ **Erreur de connexion au backend local**\n\nImpossible de joindre \`localhost:3001/api/qoe-assistant\`.\n\n**Vérifiez que :**\n1. Le serveur Express est démarré : \`cd server && node index.js\`\n2. Votre clé OpenRouter est configurée dans \`server/.env\` ou dans le panel Configuration LLM\n3. Le modèle sélectionné est valide\n\n\`Détail : ${errorDetail}\``
        : `⚠️ **Erreur** : ${errorDetail}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleShowWorstCells = (kpi: string = 'qoe_score_avg', count: number = 10) => {
    // Flatten all cells with their site info, sort by KPI ascending (worst first)
    const allCells = sites.flatMap(s => s.cells.map(c => ({ ...c, site_name: s.site_name })));
    const sorted = [...allCells].sort((a, b) => (a as any)[kpi] - (b as any)[kpi]);
    const worstCells = sorted.slice(0, count);
    const cellIds = worstCells.map(c => c.cell_id);
    
    // Add a message showing the worst cells
    const table = worstCells.map((c, i) => 
      `| ${i + 1} | ${c.cell_id} | ${(c as any).site_name} | ${c.techno} | ${((c as any)[kpi] as number).toFixed(1)} |`
    ).join('\n');
    const kpiLabel = kpi === 'qoe_score_avg' ? 'QoE Score' : kpi;
    const msg = `**🗺️ Top ${count} Worst Cells — ${kpiLabel}**\n\n| # | Cell ID | Site | Techno | ${kpiLabel} |\n|---|---------|------|--------|--------|\n${table}\n\n*→ Affichage sur la carte en cours...*`;
    
    setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
    
    if (onShowWorstCells) {
      onShowWorstCells(cellIds);
    }
  };

  const clearChat = () => {
    if (activeSessionId) {
      sessionStore.setMessages(activeSessionId, []);
    }
    setInput('');
  };

  const handleNewSession = () => {
    sessionStore.createSession();
  };

  const handleDeleteSession = (id: string) => {
    sessionStore.deleteSession(id);
  };

  const handleRenameSession = (id: string) => {
    if (editTitle.trim()) {
      sessionStore.renameSession(id, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle('');
  };

  return (
    <div className="flex-1 flex h-full bg-background overflow-hidden">
      {/* ── Sessions Sidebar ── */}
      <div className={`${showSidebar ? 'w-56' : 'w-0'} shrink-0 transition-all duration-200 overflow-hidden border-r border-border bg-card/50 flex flex-col`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-border/50">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sessions</span>
          <button onClick={handleNewSession} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Nouvelle session">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`group flex items-center gap-1.5 px-3 py-2 mx-1 my-0.5 rounded-lg cursor-pointer transition-all text-left ${
                s.id === activeSessionId
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted/60 border border-transparent'
              }`}
              onClick={() => { if (!isLoading) sessionStore.setActiveSession(s.id); }}
            >
              <MessageSquare className={`w-3 h-3 shrink-0 ${s.id === activeSessionId ? 'text-primary' : 'text-muted-foreground'}`} />
              {editingSessionId === s.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={() => handleRenameSession(s.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameSession(s.id); if (e.key === 'Escape') setEditingSessionId(null); }}
                  className="flex-1 text-[11px] bg-transparent border-b border-primary outline-none text-foreground min-w-0"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={`flex-1 text-[11px] truncate ${s.id === activeSessionId ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {s.title}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setEditingSessionId(s.id); setEditTitle(s.title); }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Renommer"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                {sessions.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Supprimer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 px-3 py-2">
          <span className="text-[9px] text-muted-foreground">{sessions.length} session{sessions.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSidebar(s => !s)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">QOEBIT</h1>
              <p className="text-[10px] text-muted-foreground">{activeSession?.title || 'Assistant IA réseau'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleNewSession} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-primary bg-primary/10 hover:bg-primary/20 transition-colors font-medium">
              <Plus className="w-3 h-3" /> Nouveau
            </button>
            <button onClick={() => setShowDebug(d => !d)} className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${showDebug ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              🐛
            </button>
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Effacer la session">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="border-b border-border bg-muted/50 px-4 py-3 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-foreground font-mono">🐛 DEBUG PANEL</span>
              <button onClick={() => setDebugLogs([])} className="text-[10px] text-muted-foreground hover:text-foreground font-mono">Clear</button>
            </div>
            <div className="space-y-0.5 text-[10px] font-mono">
              <div className="text-primary">Mode: <strong>{isLocalMode() ? 'LOCAL' : 'CLOUD'}</strong></div>
              <div className="text-muted-foreground">Session: {activeSessionId} | Messages: {messages.length}</div>
              <div className="text-muted-foreground">Resolved URL: {getApiUrl('qoe-assistant')}</div>
              <div className="text-muted-foreground">Sites: {sites.length} | Mode: context-on-demand</div>
              <hr className="border-border my-1" />
              {debugLogs.length === 0 ? (
                <div className="text-muted-foreground italic">No logs yet.</div>
              ) : debugLogs.map((log, i) => (
                <div key={i} className={`${log.includes('error') || log.includes('Error') ? 'text-destructive' : log.includes('✅') || log.includes('started') ? 'text-primary' : 'text-foreground/70'}`}>{log}</div>
              ))}
            </div>
          </div>
        )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Bonjour, je suis QOEBIT 👋</h2>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                Votre assistant IA réseau. Posez vos questions sur la qualité réseau : tableaux comparatifs, classements de sites, analyses par dimension.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all text-left group"
                >
                  <MessageSquare className="w-4 h-4 text-primary/60 mt-0.5 shrink-0 group-hover:text-primary transition-colors" />
                  <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors">{s}</span>
                </button>
              ))}
              {/* Worst Cells Map Action */}
              {sites.length > 0 && onShowWorstCells && (
                <button
                  onClick={() => handleShowWorstCells('qoe_score_avg', 10)}
                  className="flex items-start gap-2.5 px-4 py-3 rounded-xl border-2 border-destructive/30 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/50 transition-all text-left group col-span-1 sm:col-span-2"
                >
                  <MapPin className="w-4 h-4 text-destructive mt-0.5 shrink-0 group-hover:text-destructive transition-colors" />
                  <div>
                    <span className="text-xs font-bold text-foreground group-hover:text-foreground transition-colors">🗺️ Top 10 Worst Cells → Afficher sur la Carte</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">Identifie et localise les 10 pires cellules en QoE sur le Sites Monitor</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    {msg.agent && AGENT_META[msg.agent] ? (
                      <span className="text-base leading-none">{AGENT_META[msg.agent].emoji}</span>
                    ) : (
                      <Bot className="w-4 h-4 text-primary" />
                    )}
                  </div>
                )}
                <div className={`max-w-[85%] overflow-hidden relative group ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3'
                    : 'bg-card border border-border rounded-2xl rounded-bl-md px-5 py-4'
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
                        <div className="flex items-center gap-1.5 mb-2">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                            style={{ backgroundColor: AGENT_META[msg.agent].color }}
                          >
                            {AGENT_META[msg.agent].emoji} {AGENT_META[msg.agent].label}
                          </span>
                        </div>
                      )}
                      <AssistantMessage content={msg.content} />
                      {/* Map action button */}
                      {msg.mapCellIds && msg.mapCellIds.length > 0 && onShowWorstCells && (
                        <button
                          onClick={() => onShowWorstCells(msg.mapCellIds!)}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all text-xs font-semibold shadow-sm"
                        >
                          <MapPin className="w-4 h-4" />
                          Voir sur la carte ({msg.mapCellIds.length})
                        </button>
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <ExportPDFButton msgRef={msg.content} index={i} />
                        <CopyButton text={msg.content} />
                      </div>
                    </>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-5 py-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
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

      {/* Input */}
      <div className="border-t border-border bg-card/50 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question sur la QoE réseau..."
              rows={1}
              className="w-full resize-none bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all max-h-32 overflow-y-auto"
              style={{ minHeight: 44 }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 128) + 'px';
              }}
            />
          </div>
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          QOEBIT • Les données sont simulées à des fins de démonstration
        </p>
      </div>
      </div>{/* end main chat area */}
    </div>
  );
};

/**
 * ExportPDFButton: exports a specific assistant message to PDF
 */
const ExportPDFButton: React.FC<{ msgRef: string; index: number }> = ({ msgRef, index }) => {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    // Find the message container by traversing up from the button
    const msgElements = document.querySelectorAll('.ai-msg-content');
    const el = msgElements[index] as HTMLElement | null;
    if (!el) return;
    setExporting(true);
    try {
      await exportElementToPDF(el, `QOEBIT_response_${index + 1}`);
      toast({ title: 'PDF exporté', description: 'La réponse a été exportée en PDF.' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'exporter en PDF.", variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };
  return (
    <button onClick={handleExport} disabled={exporting}
      className="p-1.5 rounded-lg bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
      title="Exporter en PDF">
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
    </button>
  );
};

/**
 * CopyButton: copies the raw text content to clipboard
 */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy}
      className="p-1.5 rounded-lg bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
      title="Copier">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

/**
 * AssistantMessage: always renders via ReactMarkdown with GFM for proper formatting.
 */
const AssistantMessage: React.FC<{ content: string }> = ({ content }) => {
  // Strip any HTML tags the AI might still produce
  const cleaned = useMemo(() => {
    let text = content;
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<\/?(?:div|span|table|thead|tbody|tr|td|th|style|br|hr|img|p|ul|ol|li|h[1-6]|a|b|i|em|strong|code|pre)[^>]*>/gi, '');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    return text;
  }, [content]);

  const vizBlocks = useMemo(() => parseVisualizationBlocks(cleaned), [cleaned]);
  const hasViz = vizBlocks.some(b => b.type !== 'markdown');

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
          return <MarkdownBlock key={i} content={block.content} />;
        })
      ) : (
        <MarkdownBlock content={cleaned} />
      )}
    </div>
  );
};

// ─── KPI Color Map: header patterns → colors from kpi_catalog conventions ───
const KPI_HEADER_COLOR_MAP: { pattern: RegExp; color: string }[] = [
  { pattern: /qoe|qos|qualit/i, color: '#22c55e' },         // green
  { pattern: /rtt|latence|latency/i, color: '#f97316' },     // orange
  { pattern: /d[ée]bit\s*dl|throughput\s*dl|dl.*mbps/i, color: '#3b82f6' }, // blue
  { pattern: /d[ée]bit\s*ul|throughput\s*ul|ul.*mbps/i, color: '#8b5cf6' }, // purple
  { pattern: /loss|perte/i, color: '#ef4444' },               // red
  { pattern: /retr|retrans/i, color: '#ec4899' },             // pink
  { pattern: /session|dcr|drop|coupure/i, color: '#f59e0b' }, // amber
  { pattern: /dms|streaming/i, color: '#06b6d4' },            // cyan
  { pattern: /volume|traffic|trafic/i, color: '#14b8a6' },    // teal
  { pattern: /wind|window/i, color: '#a855f7' },              // violet
  { pattern: /fallback/i, color: '#d946ef' },                 // fuchsia
  { pattern: /instabil/i, color: '#e11d48' },                 // rose
  { pattern: /rat|techno/i, color: '#0ea5e9' },               // sky
  { pattern: /5g.*cap|attach/i, color: '#7c3aed' },           // violet dark
];

function getKpiColorForHeader(header: string): string | null {
  for (const { pattern, color } of KPI_HEADER_COLOR_MAP) {
    if (pattern.test(header)) return color;
  }
  return null;
}

// Context for passing column headers to td cells
const TableHeadersContext = React.createContext<string[]>([]);

const KpiColorTable: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const headersRef = React.useRef<string[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);

  // Extract headers from the table's thead
  React.useEffect(() => {
    // headers are set by KpiThead
  }, []);

  return (
    <TableHeadersContext.Provider value={headers}>
      <div className="my-4 rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" ref={(el) => {
            if (el) {
              const ths = el.querySelectorAll('thead th');
              const h = Array.from(ths).map(th => th.textContent || '');
              if (h.length > 0 && h.join('|') !== headersRef.current.join('|')) {
                headersRef.current = h;
                setHeaders(h);
              }
            }
          }}>{children}</table>
        </div>
      </div>
    </TableHeadersContext.Provider>
  );
};

const KpiTd: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const headers = React.useContext(TableHeadersContext);
  const text = String(children ?? '');
  const baseCls = "px-3 py-2.5 text-xs border-b border-border/30";

  // Try to determine column index from DOM position (using a ref)
  const tdRef = React.useRef<HTMLTableCellElement>(null);
  const [colIndex, setColIndex] = React.useState(-1);

  React.useEffect(() => {
    if (tdRef.current) {
      const row = tdRef.current.parentElement;
      if (row) {
        const cells = Array.from(row.children);
        setColIndex(cells.indexOf(tdRef.current));
      }
    }
  }, []);

  // Get KPI color from column header
  const headerText = colIndex >= 0 && colIndex < headers.length ? headers[colIndex] : '';
  const kpiColor = headerText ? getKpiColorForHeader(headerText) : null;

  // First column (label/name) — no color
  if (colIndex === 0) {
    return <td ref={tdRef} className={`${baseCls} font-medium text-foreground`}>{children}</td>;
  }

  // If we have a KPI color and value is numeric, apply it
  if (kpiColor) {
    const isNumeric = /^\s*-?\d/.test(text) || /\d+\.?\d*\s*(%|Mbps|ms|s)?\s*$/.test(text);
    if (isNumeric) {
      return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color: kpiColor }}>{children}</td>;
    }
  }

  // Fallback to existing conditional coloring logic
  // Emoji-based status
  if (text.includes('🔴') || /critique|critical/i.test(text)) {
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(0, 80%, 50%)' }}>{children}</td>;
  }
  if (text.includes('🟠') || /dégradé|bad|mauvais/i.test(text)) {
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(25, 90%, 50%)' }}>{children}</td>;
  }
  if (text.includes('🟡') || /moyen|warning|attention/i.test(text)) {
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(45, 90%, 45%)' }}>{children}</td>;
  }
  if (text.includes('🟢') || /excellent|good|bon/i.test(text)) {
    return <td ref={tdRef} className={`${baseCls} font-semibold`} style={{ color: 'hsl(142, 70%, 40%)' }}>{children}</td>;
  }

  // Delta values
  const deltaMatch = text.match(/^([+-])\s*(\d+\.?\d*)\s*(%|pts?|ms|s|Mbps)?$/);
  if (deltaMatch) {
    const sign = deltaMatch[1];
    const val = parseFloat(deltaMatch[2]);
    const unit = (deltaMatch[3] || '').toLowerCase();
    const isLatencyMetric = unit === 'ms' || unit === 's';
    const isGood = isLatencyMetric ? sign === '-' : sign === '+';
    const severity = val > 15 ? 'high' : val > 5 ? 'mid' : 'low';
    let color: string;
    if (isGood) {
      color = severity === 'high' ? 'hsl(142, 70%, 35%)' : severity === 'mid' ? 'hsl(142, 60%, 42%)' : 'hsl(142, 50%, 48%)';
    } else {
      color = severity === 'high' ? 'hsl(0, 80%, 48%)' : severity === 'mid' ? 'hsl(25, 90%, 50%)' : 'hsl(45, 85%, 45%)';
    }
    return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
  }

  // Signed numbers
  const signedNumMatch = text.match(/([+-])(\d+\.?\d*)/);
  if (signedNumMatch) {
    const sign = signedNumMatch[1];
    const val = parseFloat(signedNumMatch[2]);
    if (val > 0) {
      const color = sign === '+' ? 'hsl(142, 70%, 40%)' : 'hsl(0, 80%, 48%)';
      return <td ref={tdRef} className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
    }
  }

  // Plain numbers
  const numMatch = text.match(/^[\d\s.]+$/);
  if (numMatch) {
    return <td ref={tdRef} className={`${baseCls} font-medium text-foreground`}>{children}</td>;
  }

  return <td ref={tdRef} className={`${baseCls} text-foreground/85`}>{children}</td>;
};

const MarkdownBlock: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
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
          } catch { /* not JSON, fall through */ }
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
          } catch { /* fall through to normal code rendering */ }
        }
        if (isBlock) {
          return <code className="text-xs font-mono text-foreground">{children}</code>;
        }
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
      thead: ({ children }) => <thead className="bg-muted/80">{children}</thead>,
      th: ({ children }) => <th className="px-3 py-2.5 text-[11px] font-bold text-foreground text-left border-b-2 border-border tracking-wide">{children}</th>,
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
);

export default AIAssistantPage;
