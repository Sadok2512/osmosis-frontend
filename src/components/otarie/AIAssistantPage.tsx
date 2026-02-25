import React, { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2, MessageSquare, Copy, Check, FileDown, MapPin } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportElementToPDF } from '@/lib/exportUtils';
import { SiteSummary } from '@/types';
import { parseVisualizationBlocks } from './chat-visualizations/parseVisualizationBlocks';
import InlineChart from './chat-visualizations/InlineChart';
import InlineKPICards from './chat-visualizations/InlineKPICards';
const InlineMap = lazy(() => import('./chat-visualizations/InlineMap'));

type Msg = { role: 'user' | 'assistant'; content: string; mapCellIds?: string[]; mapDescription?: string };

const SUPABASE_FUNCTIONS_BASE = `https://nmblfljpqiyxayaswmwn.supabase.co/functions/v1`;

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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Build cell context from real site data for the AI
  const cellContext = useMemo(() => {
    if (!sites.length) return '';
    // Send a summary of worst/best cells to the AI so it can reference real IDs
    const allCells = sites.flatMap(s => s.cells.map(c => ({
      cell_id: c.cell_id,
      site_name: s.site_name,
      site_id: s.site_id,
      lat: s.coordinates?.[0],
      lng: s.coordinates?.[1],
      techno: c.techno,
      bande: c.bande,
      vendor: s.vendor,
      dor: s.dor,
      plaque: s.plaque,
      qoe: c.qoe_score_avg,
      tput_dl: c.p50_thr_dn_mbps,
      rtt_p95: c.p95_rtt_ms,
      dms_dl_3: c.dms_dl_3,
      dms_dl_8: c.dms_dl_8,
      dms_dl_30: c.dms_dl_30,
      sessions: c.sessions,
      tcp_loss: c.tcp_loss_rate,
      retrans: c.retransmission_rate,
    })));
    // Sort by QoE and take worst 50 + best 20 for context
    const sorted = [...allCells].sort((a, b) => a.qoe - b.qoe);
    const subset = [...sorted.slice(0, 50), ...sorted.slice(-20)];
    const header = 'cell_id | site_name | lat | lng | techno | bande | vendor | plaque | qoe | tput_dl | rtt_p95 | dms_dl_3 | tcp_loss | sessions';
    const rows = subset.map(c => 
      `${c.cell_id} | ${c.site_name} | ${c.lat} | ${c.lng} | ${c.techno} | ${c.bande} | ${c.vendor} | ${c.plaque} | ${c.qoe.toFixed(1)} | ${c.tput_dl.toFixed(1)} | ${c.rtt_p95.toFixed(0)} | ${c.dms_dl_3.toFixed(1)} | ${c.tcp_loss.toFixed(2)} | ${c.sessions}`
    );
    return `Total: ${sites.length} sites, ${allCells.length} cellules\n${header}\n${rows.join('\n')}`;
  }, [sites]);

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

    const payload = JSON.stringify({ messages: allMessages, cellContext, openrouter_key: openrouterKey, model: llmModel });
    const url = `${SUPABASE_FUNCTIONS_BASE}/qoe-assistant`;

    let resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: payload,
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        toast({ title: 'Limite de requêtes atteinte', description: 'Veuillez réessayer dans quelques instants.', variant: 'destructive' });
        throw new Error('Rate limited');
      }
      if (resp.status === 402) {
        toast({ title: 'Crédits insuffisants', description: 'Ajoutez des crédits à votre workspace.', variant: 'destructive' });
        throw new Error('Payment required');
      }
      throw new Error('Failed to start stream');
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
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
              }
              return [...prev, { role: 'assistant', content: assistantSoFar }];
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
    } catch (e) {
      console.error(e);
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
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">QOEBIT</h1>
            <p className="text-[10px] text-muted-foreground">Assistant IA réseau • Analyse QoE intelligente</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Effacer
          </button>
        )}
      </div>

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
                    <Bot className="w-4 h-4 text-primary" />
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
        // Try to detect viz JSON blocks rendered inside <pre> that the parser missed
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
        // Intercept chart/map/kpi code blocks that the parser missed
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
      table: ({ children }) => (
        <div className="my-4 rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-muted/80">{children}</thead>,
      th: ({ children }) => <th className="px-3 py-2.5 text-[11px] font-bold text-foreground text-left border-b-2 border-border tracking-wide">{children}</th>,
      td: ({ children }) => {
        const text = String(children ?? '');
        const baseCls = "px-3 py-2.5 text-xs border-b border-border/30";
        
        if (text.includes('🔴') || /critique|critical/i.test(text)) {
          return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(0, 80%, 50%)' }}>{children}</td>;
        }
        if (text.includes('🟠') || /dégradé|bad|mauvais/i.test(text)) {
          return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(25, 90%, 50%)' }}>{children}</td>;
        }
        if (text.includes('🟡') || /moyen|warning|attention/i.test(text)) {
          return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(45, 90%, 45%)' }}>{children}</td>;
        }
        if (text.includes('🟢') || /excellent|good|bon/i.test(text)) {
          return <td className={`${baseCls} font-semibold`} style={{ color: 'hsl(142, 70%, 40%)' }}>{children}</td>;
        }
        
        const pctMatch = text.match(/(\d+\.?\d*)%/);
        if (pctMatch) {
          const val = parseFloat(pctMatch[1]);
          const isBadWhenHigh = val < 10;
          let color: string;
          if (isBadWhenHigh) {
            if (val > 3) color = 'hsl(0, 80%, 50%)';
            else if (val > 2) color = 'hsl(25, 90%, 50%)';
            else if (val > 1) color = 'hsl(45, 90%, 45%)';
            else color = 'hsl(142, 70%, 40%)';
          } else {
            if (val < 50) color = 'hsl(0, 80%, 50%)';
            else if (val < 65) color = 'hsl(25, 90%, 50%)';
            else if (val < 75) color = 'hsl(45, 90%, 45%)';
            else if (val < 85) color = 'hsl(142, 50%, 45%)';
            else color = 'hsl(142, 70%, 40%)';
          }
          return <td className={`${baseCls} font-bold`} style={{ color }}>{children}</td>;
        }
        
        const msMatch = text.match(/(\d+)\s*ms/i);
        if (msMatch) {
          const val = parseInt(msMatch[1]);
          let color = 'hsl(142, 70%, 40%)';
          if (val > 150) color = 'hsl(0, 80%, 50%)';
          else if (val > 100) color = 'hsl(25, 90%, 50%)';
          else if (val > 60) color = 'hsl(45, 90%, 45%)';
          return <td className={`${baseCls} font-semibold`} style={{ color }}>{children}</td>;
        }
        
        const mbpsMatch = text.match(/(\d+\.?\d*)\s*Mbps/i);
        if (mbpsMatch) {
          const val = parseFloat(mbpsMatch[1]);
          let color = 'hsl(142, 70%, 40%)';
          if (val < 10) color = 'hsl(0, 80%, 50%)';
          else if (val < 25) color = 'hsl(25, 90%, 50%)';
          else if (val < 50) color = 'hsl(45, 90%, 45%)';
          return <td className={`${baseCls} font-semibold`} style={{ color }}>{children}</td>;
        }
        
        return <td className={`${baseCls} text-foreground/85`}>{children}</td>;
      },
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
