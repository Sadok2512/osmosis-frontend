import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, Trash2, Copy, Check, TrendingDown, BarChart3, Zap, FileText, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from '@/hooks/use-toast';
import { getVpsProxyUrl, getAgentHeaders } from '@/lib/apiConfig';
import { useInvestigatorStore } from '@/stores/investigatorStore';
import { useChatSessionStore } from '@/stores/chatSessionStore';
import { parseVisualizationBlocks } from '../otarie/chat-visualizations/parseVisualizationBlocks';
import InlineChart from '../otarie/chat-visualizations/InlineChart';
import InlineKPICards from '../otarie/chat-visualizations/InlineKPICards';
import { parseKpiBlocks, KpiSummaryCards, SplitSectionCards } from '../kpi-monitor/AIKpiCards';
const InlineMap = lazy(() => import('../otarie/chat-visualizations/InlineMap'));

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_ACTIONS = [
  { icon: TrendingDown, label: 'Analyse des KPIs sélectionnés', prompt: 'Analyse en profondeur les KPIs sélectionnés dans l\'Investigator. Identifie les tendances, les anomalies et les cellules les plus dégradées avec des chiffres réels.' },
  { icon: BarChart3, label: 'Comparer worst cells', prompt: 'Compare les pires cellules identifiées. Analyse les KPIs par DOR, vendeur et technologie. Identifie les patterns communs de dégradation.' },
  { icon: Zap, label: 'Root Cause Analysis', prompt: 'Effectue une analyse de cause racine (RCA) sur les cellules dégradées. Vérifie les changements de paramètres récents, les alarmes actives et les corrélations entre KPIs.' },
  { icon: FileText, label: 'Rapport d\'investigation', prompt: 'Génère un rapport d\'investigation complet : résumé exécutif, pires cellules par DOR, corrélations KPI, changements CM récents et recommandations d\'actions.' },
];

interface InvestigatorAIPanelProps {
  onClose: () => void;
}

const InvestigatorAIPanel: React.FC<InvestigatorAIPanelProps> = ({ onClose }) => {
  const sessionStore = useChatSessionStore();
  const { state, tsData: rawTsData, worstElements: rawWorstElements } = useInvestigatorStore();
  const tsData = Array.isArray(rawTsData) ? rawTsData : [];
  const worstElements = Array.isArray(rawWorstElements) ? rawWorstElements : [];
  const graphSlots = Array.isArray(state?.graphSlots) ? state.graphSlots : [];

  const [sessionId] = useState(() => {
    const existing = sessionStore.sessions.find(s => s.title.startsWith('[RCAI]'));
    if (existing) {
      sessionStore.setActiveSession(existing.id);
      return existing.id;
    }
    return sessionStore.createSession('[RCAI] Investigation');
  });

  const activeSession = sessionStore.sessions.find(s => s.id === sessionId);
  const messages: Msg[] = (activeSession?.messages || []).map(m => ({ role: m.role, content: m.content }));

  const setMessages = useCallback((msgs: Msg[]) => {
    sessionStore.setMessages(sessionId, msgs.map(m => ({ role: m.role, content: m.content })));
  }, [sessionId, sessionStore]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Build investigation context
  const investigatorContext = useMemo(() => {
    const kpiIds = graphSlots.flatMap(s => s.kpiIds || []);
    const slotInfo = graphSlots.map(s =>
      `Slot "${s.name}": KPIs=[${s.kpiIds.join(', ')}] split=${s.splitBy} type=${s.widgetType || 'timeseries'}`
    ).join('\n');

    let worstInfo = '';
    if (worstElements.length > 0) {
      worstInfo = '\n--- WORST CELLS ---\n';
      worstElements.slice(0, 15).forEach(el => {
        const kpiStr = Object.entries(el.kpiValues).map(([k, v]) => `${k}=${v?.toFixed?.(2) ?? v}`).join(' | ');
        worstInfo += `  ${el.name} [${el.severity}] vendor=${el.vendor || '?'} dor=${el.dor || '?'} band=${el.band || '?'} — ${kpiStr}\n`;
        if (el.alarms) worstInfo += `    Alarms: total=${el.alarms.total} critical=${el.alarms.critical} major=${el.alarms.major}\n`;
      });
    }

    let tsInfo = '';
    if (tsData.length > 0) {
      const uniqueKpis = [...new Set(tsData.map(d => d.kpi))];
      tsInfo = '\n--- TIMESERIES SUMMARY ---\n';
      uniqueKpis.forEach(kpi => {
        const points = tsData.filter(d => d.kpi === kpi);
        const vals = points.map(p => p.value);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        tsInfo += `  ${kpi}: avg=${avg.toFixed(2)} min=${min.toFixed(2)} max=${max.toFixed(2)} points=${vals.length}\n`;
      });
    }

    return `Tu es RCAI, agent IA expert en investigation KPI réseau télécom (4G/5G).
Tu es spécialisé dans la détection d'anomalies, le diagnostic et l'analyse de cause racine (RCA — fusion ex-TRACE + ex-SENTINEL).

Contexte Investigator:
- Période: ${state.startDate} → ${state.endDate}
- Granularité: ${state.granularity}
- Layout: ${state.graphLayout} widgets
- Dimension: ${state.dimension}
- KPIs actifs: ${kpiIds.join(', ') || 'Aucun'}
- Split global: ${state.splitBy}
- Filtres: ${JSON.stringify(state.filters)}
- Top worst limit: ${state.topLimit}

Widgets configurés:
${slotInfo || 'Aucun widget'}
${worstInfo}${tsInfo}

Dimensions disponibles: CELL, SITE, DOR, DR, PLAQUE, ZONE_ARCEP, VENDOR, TECHNO, BAND
Tables backend: kpi.fact_kpi_cell_15min, fact_counters_15min, cm_history_nokia, fm_alarms_nokia, topo_data

Règles:
- Réponds toujours en français
- Base tes analyses sur les DONNÉES RÉELLES ci-dessus
- Utilise des tableaux markdown pour les comparaisons
- Propose des actions concrètes (optimisation, escalade, investigation)
- Pour les RCA, corrèle KPIs + alarmes + changements CM
- Identifie les patterns communs (même vendeur, même DOR, même bande)`;
  }, [state, tsData, worstElements, graphSlots]);

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
      uiScope: { page: 'investigator' },
      filters: {},
      kpiMonitorContext: investigatorContext,
      openrouter_key: openrouterKey,
      model: llmModel,
      user_id: userId,
    });

    const url = getVpsProxyUrl('agent', '/orchestrator/stream');
    const headers = getAgentHeaders();

    const resp = await fetch(url, { method: 'POST', headers, body: payload });

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
      <div className="relative px-4 py-3 border-b border-border bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center ring-1 ring-cyan-500/20">
              <Activity className="w-4 h-4 text-cyan-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">RCAI</h3>
              <p className="text-[9px] text-muted-foreground font-medium">Agent IA • Investigator</p>
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
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-cyan-500/40 via-cyan-500/20 to-transparent" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 gap-5">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center ring-1 ring-cyan-500/10">
              <Bot className="w-7 h-7 text-cyan-500" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-foreground">Investigation IA</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px]">
                Analysez vos KPIs, identifiez les causes racines et obtenez des recommandations d'actions.
              </p>
            </div>
            <div className="w-full space-y-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => send(action.prompt)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/60 hover:border-cyan-500/20 transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/8 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/15 transition-colors">
                    <action.icon className="w-3.5 h-3.5 text-cyan-500/70 group-hover:text-cyan-500 transition-colors" />
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
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-cyan-500" />
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
                    <AssistantMessage content={msg.content} />
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
                <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-cyan-500" />
                </div>
                <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />
                    <span className="text-[10px] text-muted-foreground">Investigation en cours...</span>
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
            placeholder="Posez votre question d'investigation..."
            rows={1}
            className="flex-1 resize-none bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-500/30 transition-all max-h-24 overflow-y-auto"
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
            className="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Assistant Message Renderer ──
const AssistantMessage: React.FC<{ content: string }> = React.memo(({ content }) => {
  const cleaned = useMemo(() => {
    let text = content;
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<\/?(?:div|span|table|thead|tbody|tr|td|th|style|br|hr|img|p|ul|ol|li|h[1-6]|a|b|i|em|strong|code|pre)[^>]*>/gi, '');
    text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return text;
  }, [content]);

  const vizBlocks = useMemo(() => parseVisualizationBlocks(cleaned), [cleaned]);
  const hasViz = vizBlocks.some(b => b.type !== 'markdown');

  const renderMarkdownWithKpiCards = useCallback((md: string) => {
    const kpiBlocks = parseKpiBlocks(md);
    const hasKpiBlocks = kpiBlocks.some(b => b.type !== 'markdown');
    if (!hasKpiBlocks) return <CompactMarkdown content={md} />;
    return (
      <>
        {kpiBlocks.map((block, j) => {
          if (block.type === 'kpi_summary' && block.summaries) return <KpiSummaryCards key={j} summaries={block.summaries} />;
          if (block.type === 'split_section' && block.splitEntries && block.splitDimension) return <SplitSectionCards key={j} dimension={block.splitDimension} entries={block.splitEntries} />;
          return <CompactMarkdown key={j} content={block.content || ''} />;
        })}
      </>
    );
  }, []);

  return (
    <div className="text-xs leading-relaxed text-foreground">
      {hasViz ? (
        vizBlocks.map((block, i) => {
          if (block.type === 'chart') return <InlineChart key={i} config={block.config} />;
          if (block.type === 'map') return (
            <Suspense key={i} fallback={<div className="h-[180px] bg-muted animate-pulse rounded-lg my-2" />}>
              <InlineMap config={block.config} />
            </Suspense>
          );
          if (block.type === 'kpi') return <InlineKPICards key={i} config={block.config} />;
          if (block.type === 'insights') return null;
          if (block.type === 'worst_cells') return null;
          return <React.Fragment key={i}>{renderMarkdownWithKpiCards(block.content)}</React.Fragment>;
        })
      ) : (
        renderMarkdownWithKpiCards(cleaned)
      )}
    </div>
  );
});

const CompactMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5">{children}</h1>,
      h2: ({ children }) => (
        <h2 className="text-xs font-bold text-foreground mt-3 mb-1 flex items-center gap-1.5 pb-1 border-b border-border/30">
          <span className="w-0.5 h-3.5 bg-cyan-500 rounded-full inline-block shrink-0" />
          {children}
        </h2>
      ),
      h3: ({ children }) => <h3 className="text-xs font-bold text-foreground mt-2 mb-1">{children}</h3>,
      p: ({ children }) => <p className="text-[11px] leading-[1.7] text-foreground/85 mb-2">{children}</p>,
      strong: ({ children }) => <strong className="font-bold text-cyan-500">{children}</strong>,
      em: ({ children }) => <em className="text-foreground/60 italic">{children}</em>,
      pre: ({ children }) => <pre className="bg-muted/50 border border-border/30 rounded-lg px-2.5 py-2 overflow-x-auto my-2 text-[10px] font-mono text-foreground">{children}</pre>,
      code: ({ children, className }) => {
        if (className?.includes('language-')) return <code className="text-[10px] font-mono text-foreground">{children}</code>;
        return <code className="bg-cyan-500/10 text-cyan-600 font-mono text-[10px] px-1 py-0.5 rounded font-semibold">{children}</code>;
      },
      ul: ({ children }) => <ul className="space-y-1 my-2 ml-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="space-y-1 my-2 ml-0.5">{children}</ol>,
      li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
          <li className="text-[11px] text-foreground/85 flex items-start gap-1.5 leading-[1.6]">
            {ordered ? (
              <span className="w-4 h-4 rounded bg-cyan-500/15 text-cyan-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{(index ?? 0) + 1}</span>
            ) : (
              <span className="w-1 h-1 rounded-full bg-cyan-500/50 mt-[7px] shrink-0" />
            )}
            <span className="flex-1">{children}</span>
          </li>
        );
      },
      table: ({ children }) => (
        <div className="my-2 rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px]">{children}</table>
          </div>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
      th: ({ children }) => <th className="px-2 py-1.5 text-[9px] font-bold text-foreground text-left border-b border-border tracking-wide">{children}</th>,
      td: ({ children }) => {
        const text = String(children ?? '');
        const baseCls = 'px-2 py-1.5 text-[10px] border-b border-border/20';
        if (text.includes('🔴') || /critique|critical/i.test(text)) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(0, 80%, 50%)' }}>{children}</td>;
        if (text.includes('🟠')) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(25, 90%, 50%)' }}>{children}</td>;
        if (text.includes('🟢')) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(142, 70%, 40%)' }}>{children}</td>;
        return <td className={`${baseCls} text-foreground/85`}>{children}</td>;
      },
      tr: ({ children }) => <tr className="hover:bg-muted/20 transition-colors even:bg-muted/5">{children}</tr>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-cyan-500 bg-cyan-500/5 rounded-r-lg px-3 py-2 my-2 text-[11px] text-foreground/75 italic">{children}</blockquote>
      ),
      hr: () => <hr className="border-border/30 my-3" />,
      a: ({ href, children }) => <a href={href} className="text-cyan-500 underline underline-offset-2 hover:text-cyan-400">{children}</a>,
    }}
  >
    {content}
  </ReactMarkdown>
);

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
      className="w-6 h-6 rounded-lg bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-cyan-500" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
    </button>
  );
};

export default InvestigatorAIPanel;
