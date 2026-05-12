import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, Trash2, Copy, Check, FileDown, BarChart3, Zap, TrendingDown, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from '@/hooks/use-toast';
import { getVpsProxyUrl, getAgentHeaders } from '@/lib/apiConfig';
import { useGlobalFilterStore } from '@/stores/globalFilterStore';
import { useKpiMonitorStore } from '@/stores/kpiMonitorStore';
import { useChatSessionStore } from '@/stores/chatSessionStore';
import { parseVisualizationBlocks } from '../otarie/chat-visualizations/parseVisualizationBlocks';
import InlineChart from '../otarie/chat-visualizations/InlineChart';
import InlineKPICards from '../otarie/chat-visualizations/InlineKPICards';
import AIClarifyingQuestions, { detectNeedsClarification, generateClarifyingQuestions, ClarifyQuestion } from './AIClarifyingQuestions';
import { fetchParameterChanges, changesToMilestones } from '@/services/parameterChangesService';
import { parseKpiBlocks, KpiSummaryCards, SplitSectionCards } from './AIKpiCards';
const InlineMap = lazy(() => import('../otarie/chat-visualizations/InlineMap'));

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_ACTIONS = [
  { icon: TrendingDown, label: 'Analyse des KPIs', prompt: 'Analyse les KPIs sélectionnés avec les données réelles. Identifie les tendances, les valeurs anormales et les sites/cellules les plus dégradés.' },
  { icon: BarChart3, label: 'Comparer dimensions', prompt: 'Compare les performances par dimension de split actuelle. Identifie les meilleures et pires valeurs avec des chiffres réels.' },
  { icon: Zap, label: 'Détecter anomalies', prompt: 'Détecte les anomalies dans les données réelles affichées. Identifie les dégradations soudaines, les valeurs hors seuils et les tendances préoccupantes.' },
  { icon: FileText, label: 'Résumé exécutif', prompt: 'Génère un résumé exécutif de la performance réseau basé sur les données réelles actuelles. Inclus un tableau avec avg/min/max par KPI et les recommandations.' },
];

interface KPIMonitorAIPanelProps {
  onClose: () => void;
}

const KPIMonitorAIPanel: React.FC<KPIMonitorAIPanelProps> = ({ onClose }) => {
  const sessionStore = useChatSessionStore();

  // Ensure a session exists for KPI Monitor
  const sessionId = useMemo(() => {
    const existing = sessionStore.sessions.find(s => s.title.startsWith('[KPI]'));
    if (existing) {
      sessionStore.setActiveSession(existing.id);
      return existing.id;
    }
    return sessionStore.createSession('[KPI] Nouvelle session');
  }, []);

  const activeSession = sessionStore.sessions.find(s => s.id === sessionId);
  const messages: Msg[] = (activeSession?.messages || []).map(m => ({ role: m.role, content: m.content }));

  const setMessages = useCallback((msgs: Msg[]) => {
    sessionStore.setMessages(sessionId, msgs.map(m => ({ role: m.role, content: m.content })));
  }, [sessionId, sessionStore]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[] | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;

  const globalFilter = useGlobalFilterStore();
  const kpiStore = useKpiMonitorStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Build KPI context for the AI — includes real data from backend
  const [dataContext, setDataContext] = useState<string>('');

  // Fetch real data summary when KPIs change
  useEffect(() => {
    if (kpiStore.selectedKpis.length === 0) { setDataContext(''); return; }
    const fetchDataContext = async () => {
      try {
        const { fetchSummary, fetchTimeseries } = await import('./api/kpiMonitorApi');
        const kpiKeys = kpiStore.selectedKpis.map(k => k.kpi_key);
        const filters = globalFilter.globalFilters
          .filter(f => f.values.length > 0)
          .map(f => ({ dimension: f.dimension, op: f.op, values: f.values }));

        // Fetch summary (avg/min/max)
        const summary = await fetchSummary({
          date_from: globalFilter.dateFrom,
          date_to: globalFilter.dateTo,
          filters,
          kpi_keys: kpiKeys,
        });

        // Fetch latest timeseries (last 10 points)
        const ts = await fetchTimeseries({
          date_from: globalFilter.dateFrom,
          date_to: globalFilter.dateTo,
          granularity: globalFilter.granularity === 'auto' ? '1d' : globalFilter.granularity,
          filters,
          selections: kpiKeys.map(k => ({ kpi_key: k })),
          split_by: kpiStore.splitBy,
          top_n: kpiStore.topN,
        });

        let ctx = '\n--- DONNÉES RÉELLES (Backend) ---\n';
        if (summary && summary.length > 0) {
          ctx += 'Résumé KPI:\n';
          summary.forEach((s: any) => {
            ctx += `  ${s.kpi_key}: avg=${s.value?.toFixed(2) ?? 'N/A'} min=${s.min?.toFixed(2) ?? 'N/A'} max=${s.max?.toFixed(2) ?? 'N/A'} trend=${s.trend_pct != null ? s.trend_pct.toFixed(1) + '%' : 'N/A'} state=${s.threshold_state}\n`;
          });
        }
        if (ts?.series && ts.series.length > 0) {
          const lastPoints = ts.series.slice(-20);
          ctx += `\nDerniers points (${ts.meta.granularity_applied}):\n`;
          lastPoints.forEach((p: any) => {
            ctx += `  ${p.ts} | ${p.kpi_key} | ${p.split_value} | ${p.value?.toFixed(2)}\n`;
          });
          ctx += `Total séries: ${ts.meta.total_series}\n`;
        }
        setDataContext(ctx);
      } catch (e) {
        setDataContext('\n[Données non disponibles — backend indisponible]\n');
      }
    };
    fetchDataContext();
  }, [kpiStore.selectedKpis, globalFilter.dateFrom, globalFilter.dateTo, globalFilter.granularity, globalFilter.globalFilters, kpiStore.splitBy, kpiStore.topN]);

  const kpiContext = useMemo(() => {
    const filters = globalFilter.globalFilters
      .filter(f => f.values.length > 0)
      .map(f => `${f.dimension} ${f.op} (${f.values.join(', ')})`)
      .join(' AND ');

    return `Tu es QORBIT, assistant IA expert en monitoring réseau télécom (4G/5G, Nokia, Ericsson).
Tu as accès aux données réelles du réseau via le backend KPI Engine.

Contexte KPI Monitor:
- Période: ${globalFilter.dateFrom} → ${globalFilter.dateTo}
- Granularité: ${globalFilter.granularity}
- KPIs sélectionnés: ${kpiStore.selectedKpis.map(k => k.kpi_key).join(', ') || 'Aucun'}
- Split by: ${kpiStore.splitBy || 'Aucun'}
- Top N: ${kpiStore.topN}
- Filtres actifs: ${filters || 'Aucun'}
${globalFilter.crossFilter ? `- Cross-filter: ${globalFilter.crossFilter.dimension} = ${globalFilter.crossFilter.value}` : ''}

Dimensions disponibles: REGION, DOR, Plaque, Site, Cell, Vendor, Techno, Band, ARCEP, Country
Tables backend: kpi.fact_kpi_cell_15min (4292 KPIs), fact_counters_15min (PM counters), cm_history_nokia, fm_alarms_nokia, topo_data

${dataContext}

Règles:
- Réponds toujours en français
- Base tes analyses sur les DONNÉES RÉELLES ci-dessus, pas des suppositions
- Si aucune donnée n'est disponible, indique-le clairement
- Utilise des tableaux markdown pour les comparaisons
- Propose des actions concrètes (optimisation, escalade, investigation)
- Si l'utilisateur demande un graphique, suggère les KPIs et filtres à appliquer`;
  }, [globalFilter, kpiStore.selectedKpis, kpiStore.splitBy, kpiStore.topN, dataContext]);

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

    // ── Truncate old messages to avoid massive payloads ──
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

    // Get user_id from admin session
    const { getStoredSession } = await import('@/services/adminAuth');
    const session = getStoredSession();
    const userId = session?.id || null;

    const payload = JSON.stringify({
      messages: trimmedMessages,
      uiScope: { page: 'kpi_monitor' },
      filters: {},
      kpiMonitorContext: kpiContext,
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
      throw new Error(`Impossible de contacter le serveur local: ${fetchErr.message}`);
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

    // Detect if prompt needs clarification (parameter changes, etc.)
    if (detectNeedsClarification(msg) && !clarifyQuestions) {
      setPendingPrompt(msg);
      setClarifyQuestions(generateClarifyingQuestions());
      // Show user message immediately
      setMessages([...messagesRef.current, { role: 'user', content: msg }]);
      setInput('');
      return;
    }

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

  const handleClarifySubmit = async (answers: Record<string, string[]>) => {
    setClarifyQuestions(null);

    // Build enriched prompt from answers
    const scopeStr = answers.change_scope?.join(', ') || 'all';
    const topoStr = answers.topo_level?.join(', ') || 'all';
    const rangeStr = answers.time_range?.[0] || '14';
    const typeStr = answers.change_type?.join(', ') || 'all';
    const displayStr = answers.display_mode?.[0] || 'milestones';

    const enrichedPrompt = `${pendingPrompt}

[Configuration assistée]
- Périmètre changements: ${scopeStr}
- Niveau topo: ${topoStr}
- Période: ${rangeStr === 'custom' ? 'période actuelle' : rangeStr + ' jours'}
- Types: ${typeStr}
- Affichage: ${displayStr}`;

    // Fetch parameter changes and inject as milestones
    const dateFrom = rangeStr === 'custom'
      ? globalFilter.dateFrom
      : new Date(Date.now() - parseInt(rangeStr) * 86400000).toISOString().split('T')[0];
    const dateTo = rangeStr === 'custom' ? globalFilter.dateTo : new Date().toISOString().split('T')[0];

    try {
      const changes = await fetchParameterChanges({
        change_scope: answers.change_scope,
        change_type: answers.change_type?.includes('all') ? undefined : answers.change_type,
        date_from: dateFrom,
        date_to: dateTo,
      });

      if (changes.length > 0) {
        const milestones = changesToMilestones(changes);
        milestones.forEach(m => kpiStore.addMilestone(m));
        if (!kpiStore.showMilestones) kpiStore.setShowMilestones(true);
        toast({ title: `${milestones.length} jalons ajoutés`, description: 'Les changements de paramètres sont affichés sur le graphe.' });
      }
    } catch (e) {
      console.error('Failed to fetch parameter changes:', e);
    }

    // Add system info and send to AI
    const systemMsg: Msg = { role: 'assistant', content: `✅ Configuration appliquée : périmètre **${scopeStr}**, types **${typeStr}**, affichage **${displayStr}**. Génération du dashboard en cours...` };
    const updated = [...messages, systemMsg, { role: 'user' as const, content: enrichedPrompt }];
    setMessages([...messagesRef.current, systemMsg]);
    setIsLoading(true);
    try {
      await streamChat(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarifySkip = () => {
    setClarifyQuestions(null);
    const msg = pendingPrompt;
    setPendingPrompt('');
    // Send original prompt without enrichment
    const updated = [...messages, { role: 'user' as const, content: msg }];
    setIsLoading(true);
    streamChat(updated).catch(console.error).finally(() => setIsLoading(false));
  };

  const clearChat = () => { setMessages([]); setClarifyQuestions(null); setPendingPrompt(''); };

  return (
    <div className="w-full h-full bg-card flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="relative px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">OSMOSIS</h3>
              <p className="text-[9px] text-muted-foreground font-medium">Assistant IA • KPI Monitor</p>
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
        {/* Decorative line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary/40 via-primary/20 to-transparent" />
      </div>

      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/10">
              <Bot className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-foreground">Analysez vos KPIs réseau</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px]">
                Posez des questions sur vos données de performance réseau, détectez des anomalies ou générez des rapports.
              </p>
            </div>
            {/* Quick actions */}
            <div className="w-full space-y-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => send(action.prompt)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/60 hover:border-primary/20 transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    <action.icon className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors" />
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
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-primary" />
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
                    <CompactAssistantMessage content={msg.content} />
                  )}
                  {/* Copy button on hover */}
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
            {/* Clarifying questions */}
            {clarifyQuestions && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-primary" />
                </div>
                <div className="max-w-[90%]">
                  <AIClarifyingQuestions
                    questions={clarifyQuestions}
                    onSubmit={handleClarifySubmit}
                    onSkip={handleClarifySkip}
                  />
                </div>
              </div>
            )}
            {isLoading && messages[messages.length - 1]?.role === 'user' && !clarifyQuestions && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span className="text-[10px] text-muted-foreground">Analyse en cours...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="border-t border-border bg-card px-3 py-2.5">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Posez votre question..."
            rows={1}
            className="flex-1 resize-none bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all max-h-24 overflow-y-auto"
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
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Compact Markdown Renderer ──
const CompactAssistantMessage: React.FC<{ content: string }> = ({ content }) => {
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
};

const CompactMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5">{children}</h1>,
      h2: ({ children }) => (
        <h2 className="text-xs font-bold text-foreground mt-3 mb-1 flex items-center gap-1.5 pb-1 border-b border-border/30">
          <span className="w-0.5 h-3.5 bg-primary rounded-full inline-block shrink-0" />
          {children}
        </h2>
      ),
      h3: ({ children }) => <h3 className="text-xs font-bold text-foreground mt-2 mb-1">{children}</h3>,
      p: ({ children }) => <p className="text-[11px] leading-[1.7] text-foreground/85 mb-2">{children}</p>,
      strong: ({ children }) => <strong className="font-bold text-primary">{children}</strong>,
      em: ({ children }) => <em className="text-foreground/60 italic">{children}</em>,
      pre: ({ children }) => <pre className="bg-muted/50 border border-border/30 rounded-lg px-2.5 py-2 overflow-x-auto my-2 text-[10px] font-mono text-foreground">{children}</pre>,
      code: ({ children, className }) => {
        if (className?.includes('language-')) {
          return <code className="text-[10px] font-mono text-foreground">{children}</code>;
        }
        return <code className="bg-primary/10 text-primary font-mono text-[10px] px-1 py-0.5 rounded font-semibold">{children}</code>;
      },
      ul: ({ children }) => <ul className="space-y-1 my-2 ml-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="space-y-1 my-2 ml-0.5">{children}</ol>,
      li: ({ children, ...props }) => {
        const ordered = (props as any).ordered;
        const index = (props as any).index;
        return (
          <li className="text-[11px] text-foreground/85 flex items-start gap-1.5 leading-[1.6]">
            {ordered ? (
              <span className="w-4 h-4 rounded bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{(index ?? 0) + 1}</span>
            ) : (
              <span className="w-1 h-1 rounded-full bg-primary/50 mt-[7px] shrink-0" />
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
        // Emoji/status
        if (text.includes('🔴') || /critique|critical/i.test(text)) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(0, 80%, 50%)' }}>{children}</td>;
        if (text.includes('🟠') || /dégradé/i.test(text)) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(25, 90%, 50%)' }}>{children}</td>;
        if (text.includes('🟡')) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(45, 90%, 45%)' }}>{children}</td>;
        if (text.includes('🟢')) return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(142, 70%, 40%)' }}>{children}</td>;
        // Delta values
        const deltaMatch = text.match(/^([+-])(\d+\.?\d*)\s*(%|pts?|ms|Mbps)?$/);
        if (deltaMatch) {
          const sign = deltaMatch[1];
          const val = parseFloat(deltaMatch[2]);
          const unit = (deltaMatch[3] || '').toLowerCase();
          const isLatency = unit === 'ms';
          const isGood = isLatency ? sign === '-' : sign === '+';
          const color = isGood ? 'hsl(142, 70%, 38%)' : val > 10 ? 'hsl(0, 80%, 48%)' : 'hsl(25, 90%, 50%)';
          return <td className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
        }
        // Percentage
        const pctMatch = text.match(/(\d+\.?\d*)%/);
        if (pctMatch) {
          const val = parseFloat(pctMatch[1]);
          const isBadHigh = /loss|retr|dcr|perte/i.test(text) || val < 10;
          let color: string;
          if (isBadHigh) {
            color = val > 3 ? 'hsl(0, 80%, 50%)' : val > 1 ? 'hsl(45, 90%, 45%)' : 'hsl(142, 70%, 40%)';
          } else {
            color = val < 50 ? 'hsl(0, 80%, 50%)' : val < 65 ? 'hsl(25, 90%, 50%)' : val < 75 ? 'hsl(45, 90%, 45%)' : 'hsl(142, 70%, 40%)';
          }
          return <td className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
        }
        // Mbps
        const mbps = text.match(/(\d+\.?\d*)\s*Mbps/i);
        if (mbps) {
          const v = parseFloat(mbps[1]);
          const color = v < 10 ? 'hsl(0, 80%, 50%)' : v < 25 ? 'hsl(25, 90%, 50%)' : v < 40 ? 'hsl(45, 90%, 45%)' : 'hsl(142, 70%, 40%)';
          return <td className={`${baseCls} font-semibold`} style={{ color }}>{children}</td>;
        }
        return <td className={`${baseCls} text-foreground/85`}>{children}</td>;
      },
      tr: ({ children }) => <tr className="hover:bg-muted/20 transition-colors even:bg-muted/5">{children}</tr>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-primary bg-primary/5 rounded-r-lg px-3 py-2 my-2 text-[11px] text-foreground/75 italic">{children}</blockquote>
      ),
      hr: () => <hr className="border-border/30 my-3" />,
      a: ({ href, children }) => <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80">{children}</a>,
    }}
  >
    {content}
  </ReactMarkdown>
);

// ── Copy Button ──
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
      {copied ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
    </button>
  );
};

export default KPIMonitorAIPanel;
