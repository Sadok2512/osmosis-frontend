import React, { useState } from 'react';
import { X, Sparkles, Send, Loader2 } from 'lucide-react';
import { ChartConfig, BI_KPIS, BI_DIMENSIONS } from './biTypes';

interface Props {
  charts: ChartConfig[];
  onClose: () => void;
  onApplySuggestion: (config: ChartConfig) => void;
}

// Mock AI suggestions - in production this would call the AI gateway
const AI_SUGGESTIONS = [
  { label: 'Best KPI for Vendor analysis', icon: '📊', action: 'suggest_kpi' },
  { label: 'Detect anomalies in QoE', icon: '🔍', action: 'detect_anomaly' },
  { label: 'Recommend visualization type', icon: '📈', action: 'recommend_viz' },
  { label: 'Generate executive summary', icon: '📝', action: 'exec_summary' },
];

const AIAssistantPanel: React.FC<Props> = ({ charts, onClose, onApplySuggestion }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '👋 Hello! I\'m your BI Assistant. I can help you analyze your KPIs, suggest the best visualizations, and detect anomalies. What would you like to explore?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuickAction = (action: string) => {
    const userMsg = AI_SUGGESTIONS.find(s => s.action === action)?.label || action;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    setTimeout(() => {
      let response = '';
      switch (action) {
        case 'suggest_kpi':
          response = '**Recommended KPIs for Vendor Analysis:**\n\n1. **qoe_index** — Overall quality comparison\n2. **debit_dl** — Download throughput per vendor\n3. **fallback_5G_to_4G_rate** — 5G stability indicator\n4. **bad_session_rate** — User experience quality\n\n💡 *Tip: Use a bar chart with Vendor on X-axis and group by RAT for deeper insights.*';
          break;
        case 'detect_anomaly':
          response = '**Anomaly Detection Results:**\n\n⚠️ **qoe_index** dropped by 12% on Feb 8-9\n⚠️ **loss_dl_rate** spike detected on Nokia sites (+35%)\n✅ **debit_dl** stable across all vendors\n\n🔍 *Root cause: Possible core network issue impacting Nokia cluster in ORF_IDF.*';
          break;
        case 'recommend_viz':
          response = '**Visualization Recommendations:**\n\n• Time trends → **Line chart** with smooth curves\n• Vendor comparison → **Stacked bar** chart\n• Distribution analysis → **Scatter plot** (debit vs rtt)\n• KPI monitoring → **KPI cards** for key metrics\n• Geo analysis → Consider adding a heatmap view';
          break;
        case 'exec_summary':
          response = `**Executive Summary — ${new Date().toLocaleDateString('fr-FR')}**\n\n📊 **Network Performance:**\n- Global QoE: **78.2** (+1.3 vs last week)\n- Avg DL throughput: **45.3 Mbps**\n- Session volume: **45K** sessions/day\n\n⚠️ **Attention Points:**\n- 5G fallback rate increasing on Nokia sites\n- RTT degradation in ORF_SE region\n\n✅ **Positive Trends:**\n- DMS DL 3s improved to 92%\n- Session DCR at record low 1.5%`;
          break;
        default:
          response = 'I can help with KPI suggestions, anomaly detection, visualization recommendations, and executive summaries. What would you like?';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      setLoading(false);
    }, 1200);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    setLoading(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Based on your dashboard with ${charts.length} chart(s), I'd recommend focusing on **qoe_index** and **debit_dl** as primary metrics. Would you like me to create a chart configuration for this analysis?`
      }]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">QOEBIT</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
        {AI_SUGGESTIONS.map(s => (
          <button key={s.action} onClick={() => handleQuickAction(s.action)}
            className="px-2 py-1 rounded-md bg-muted hover:bg-primary/10 text-[10px] text-muted-foreground hover:text-primary transition-colors">
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary/10 text-foreground rounded-lg p-2 ml-6' : 'text-muted-foreground'}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex gap-1">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your data..."
            className="flex-1 bg-muted border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={handleSend} className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPanel;
