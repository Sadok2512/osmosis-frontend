import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, Trash2, Copy, Check, Shield, AlertTriangle, Search, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from '@/hooks/use-toast';
import { getVpsProxyUrl, getAgentHeaders } from '@/lib/apiConfig';

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_ACTIONS = [
  { icon: AlertTriangle, label: 'Top anomalies critiques', prompt: 'Liste les anomalies critiques détectées aujourd\'hui avec leur impact réseau et les actions correctives recommandées.' },
  { icon: Search, label: 'Analyser un site', prompt: 'Analyse les anomalies détectées sur les sites les plus impactés. Donne le détail par KPI avec les écarts observés.' },
  { icon: Brain, label: 'Corrélations ML', prompt: 'Quelles corrélations multi-KPI ont été détectées par les modèles ML ? Identifie les patterns récurrents.' },
  { icon: Shield, label: 'Rapport Sentinel', prompt: 'Génère un rapport de synthèse Sentinel : nombre d\'anomalies par sévérité, KPIs les plus impactés, tendances et recommandations.' },
];

interface SentinelAIPanelProps {
  onClose: () => void;
  date: string;
  apiConnected: boolean;
}

const SentinelAIPanel: React.FC<SentinelAIPanelProps> = ({ onClose, date, apiConnected }) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sentinelContext = useMemo(() => {
    return `Contexte Sentinel (Détection d'anomalies QoE):
- Date d'analyse: ${date}
- Backend FastAPI: ${apiConnected ? 'Connecté' : 'Hors ligne (données de démonstration)'}
- Module: Sentinel — Détection d'anomalies réseau LTE/5G NR
- Détecteurs ML actifs: Isolation Forest, Trend Analysis, Corrélation multi-KPI, Seuils dynamiques
- KPIs surveillés: QoE Index, Débit DL/UL, RTT, Session DCR, TCP Retransmission, Loss Rate
- Tu es un expert NOC telecom spécialisé dans la détection d'anomalies QoE sur les réseaux mobiles.
- Réponds de manière concise et actionnable, comme un outil d'aide à la décision pour ingénieurs réseau.`;
  }, [date, apiConnected]);

  const streamChat = async (allMessages: Msg[]): Promise<string> => {
    let openrouterKey = '';
    let llmModel = '';
    try {
      const saved = localStorage.getItem('osmosis_llm_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        openrouterKey = cfg.apiKey || '';
        llmModel = cfg.model || '';
      }
    } catch { /* ignore */ }

    const MAX_RECENT = 6;
    const MAX_OLD_CHARS = 500;
    const trimmedMessages = allMessages.map((m, i) => {
      const isRecent = i >= allMessages.length - MAX_RECENT;
      if (isRecent || m.role === 'user') return { role: m.role, content: m.content };
      if (m.content.length > MAX_OLD_CHARS) {
        return { role: m.role, content: m.content.slice(0, MAX_OLD_CHARS) + '\n[... tronqué ...]' };
      }
      return { role: m.role, content: m.content };
    });

    const { getStoredSession } = await import('@/services/adminAuth');
    const session = getStoredSession();
    const userId = session?.id || null;

    const payload = JSON.stringify({
      messages: trimmedMessages,
      uiScope: { page: 'sentinel' },
      filters: {},
      kpiMonitorContext: sentinelContext,
      openrouter_key: openrouterKey,
      model: llmModel,
      user_id: userId,
    });

    const url = getVpsProxyUrl('agent', '/orchestrator/stream');
    const headers = getAgentHeaders();

    let resp: Response;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: payload });
    } catch (fetchErr: any) {
      throw new Error(`Impossible de contacter le serveur: ${fetchErr.message}`);
    }

    if (!resp.ok) {
      if (resp.status === 429) {
        toast({ title: 'Rate limited', description: 'Réessayez dans quelques instants.', variant: 'destructive' });
        throw new Error('Rate limited');
      }
      if (resp.status === 402) {
        toast({ title: 'Crédits insuffisants', variant: 'destructive' });
        throw new Error('Payment required');
      }
      throw new Error('Stream failed');
    }

    if (!resp.body) throw new Error('No body');

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
            const prev = messagesRef.current;
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              setMessages(prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
            } else {
              setMessages([...prev, { role: 'assistant', content: assistantSoFar }]);
            }
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
            const prev2 = messagesRef.current;
            const last2 = prev2[prev2.length - 1];
            if (last2?.role === 'assistant') {
              setMessages(prev2.map((m, i) => i === prev2.length - 1 ? { ...m, content: assistantSoFar } : m));
            } else {
              setMessages([...prev2, { role: 'assistant', content: assistantSoFar }]);
            }
          }
        } catch { /* ignore */ }
      }
    }
    return assistantSoFar;
  };

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    const userMsg: Msg = { role: 'user', content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);
    try {
      await streamChat(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => setMessages([]);

  return (
    <div className="w-full h-full bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative px-4 py-3 border-b border-border bg-gradient-to-r from-destructive/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20">
              <Shield className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">RCAI</h3>
              <p className="text-[9px] text-muted-foreground font-medium">Assistant IA • Détection d'anomalies & RCA</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Effacer">
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-destructive/40 via-destructive/20 to-transparent" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 gap-5">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/10">
              <Bot className="w-7 h-7 text-destructive" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-foreground">Sentinel AI Assistant</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px]">
                Analysez les anomalies réseau, identifiez les causes racines et obtenez des recommandations d'action.
              </p>
            </div>
            <div className="w-full space-y-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => send(action.prompt)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/60 hover:border-destructive/20 transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-destructive/8 flex items-center justify-center shrink-0 group-hover:bg-destructive/15 transition-colors">
                    <action.icon className="w-3.5 h-3.5 text-destructive/70 group-hover:text-destructive transition-colors" />
                  </div>
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors font-medium">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-destructive" />
                  </div>
                )}
                <div className={`max-w-[90%] relative group ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2'
                    : 'bg-muted/50 border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2.5'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="text-xs leading-relaxed text-foreground prose-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xs font-bold text-foreground mt-3 mb-1 flex items-center gap-1.5 pb-1 border-b border-border/30"><span className="w-0.5 h-3.5 bg-destructive rounded-full inline-block shrink-0" />{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-bold text-foreground mt-2 mb-1">{children}</h3>,
                        p: ({ children }) => <p className="text-[11px] leading-[1.7] text-foreground/85 mb-2">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-destructive">{children}</strong>,
                        ul: ({ children }) => <ul className="space-y-1 my-2 ml-0.5">{children}</ul>,
                        li: ({ children }) => <li className="text-[11px] text-foreground/85 flex items-start gap-1.5 leading-[1.6]"><span className="w-1 h-1 rounded-full bg-destructive/50 mt-[7px] shrink-0" /><span className="flex-1">{children}</span></li>,
                        code: ({ children, className }) => className?.includes('language-') ? <code className="text-[10px] font-mono text-foreground">{children}</code> : <code className="bg-destructive/10 text-destructive font-mono text-[10px] px-1 py-0.5 rounded font-semibold">{children}</code>,
                        pre: ({ children }) => <pre className="bg-muted/50 border border-border/30 rounded-lg px-2.5 py-2 overflow-x-auto my-2 text-[10px] font-mono text-foreground">{children}</pre>,
                        table: ({ children }) => <div className="my-2 rounded-lg border border-border/50 overflow-hidden"><div className="overflow-x-auto"><table className="w-full border-collapse text-[10px]">{children}</table></div></div>,
                        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                        th: ({ children }) => <th className="px-2 py-1.5 text-[9px] font-bold text-foreground text-left border-b border-border tracking-wide">{children}</th>,
                        td: ({ children }) => <td className="px-2 py-1.5 text-[10px] border-b border-border/20">{children}</td>,
                      }}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                  <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-all">
                    <CopyBtn text={msg.content} />
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-destructive" />
                </div>
                <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-destructive" />
                    <span className="text-[10px] text-muted-foreground">Analyse Sentinel en cours...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-3 py-2.5">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Posez votre question sur les anomalies..."
            rows={1}
            className="flex-1 resize-none bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-destructive/30 focus:border-destructive/30 transition-all max-h-24 overflow-y-auto"
            style={{ minHeight: 36 }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 96) + 'px';
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// Copy button
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch { return false; }
};

const CopyBtn: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { if (await copyToClipboard(text)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
      className="w-6 h-6 rounded-md bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
};

export default SentinelAIPanel;
