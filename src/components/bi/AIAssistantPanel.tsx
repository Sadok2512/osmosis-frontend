import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChartConfig } from './biTypes';

interface Props {
  charts: ChartConfig[];
  onClose: () => void;
  onApplySuggestion: (config: ChartConfig) => void;
}

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_ACTIONS = [
  { label: 'Best KPI for Vendor analysis', icon: '📊' },
  { label: 'Detect anomalies in QoE', icon: '🔍' },
  { label: 'Recommend visualization type', icon: '📈' },
  { label: 'Generate executive summary', icon: '📝' },
];

const STREAM_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bi-assistant`;

async function streamChat({
  messages,
  chartContext,
  onDelta,
  onDone,
  signal,
}: {
  messages: Msg[];
  chartContext: any;
  onDelta: (text: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}) {
  const resp = await fetch(STREAM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, chartContext }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done = false;

  while (!done) {
    const { done: rDone, value } = await reader.read();
    if (rDone) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buf = line + '\n' + buf;
        break;
      }
    }
  }

  // flush
  if (buf.trim()) {
    for (let raw of buf.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (!raw.startsWith('data: ')) continue;
      const json = raw.slice(6).trim();
      if (json === '[DONE]') continue;
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

const AIAssistantPanel: React.FC<Props> = ({ charts, onClose, onApplySuggestion }) => {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '👋 Bonjour ! Je suis **OSMOSIS**, votre assistant BI. Je peux analyser vos KPIs, recommander des visualisations et détecter des anomalies. Que souhaitez-vous explorer ?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const buildChartContext = () => ({
    chartCount: charts.length,
    charts: charts.map(c => ({
      title: c.title,
      type: c.yMetrics?.[0]?.chartType || 'line',
      kpis: c.yMetrics?.map(y => y.kpi) || [],
      xAxis: c.xAxis,
      groupBy: c.groupBy,
    })),
  });

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    abortRef.current = new AbortController();
    let assistantText = '';

    const upsert = (chunk: string) => {
      assistantText += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && prev.length === newMessages.length + 1) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
        }
        return [...prev, { role: 'assistant', content: assistantText }];
      });
    };

    try {
      await streamChat({
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        chartContext: buildChartContext(),
        onDelta: upsert,
        onDone: () => setLoading(false),
        signal: abortRef.current.signal,
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Erreur : ${e.message}` }]);
      }
      setLoading(false);
    }
  };

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">OSMOSIS</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
        {QUICK_ACTIONS.map(s => (
          <button key={s.label} onClick={() => sendMessage(s.label)}
            disabled={loading}
            className="px-2 py-1 rounded-md bg-muted hover:bg-primary/10 text-[10px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed ${m.role === 'user' ? 'bg-primary/10 text-foreground rounded-lg p-2 ml-6' : 'text-muted-foreground'}`}>
            {m.role === 'assistant' ? (
              <div className="prose prose-xs prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_table]:text-[10px]">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : m.content}
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex gap-1">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Posez une question sur vos données..."
            className="flex-1 bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
            className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPanel;
