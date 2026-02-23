import React, { useState, useEffect, useRef } from 'react';
import { DetectorConfig } from '../../types';
import { fetchDetectorConfigs } from '../../services/mockData';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Shield, Settings, Play, History, Sliders, Activity, Plus, RefreshCw, Cpu,
  Bot, Send, Loader2, Database
} from 'lucide-react';

// --- AI Detector Analysis Panel ---
const AIDetectorPanel: React.FC = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [topoStats, setTopoStats] = useState<string>('');
  const [topoLoaded, setTopoLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load topo summary for AI context
  useEffect(() => {
    const loadTopo = async () => {
      const { data, error } = await supabase.from('topo').select('*');
      if (error || !data || data.length === 0) {
        setTopoStats('Aucune donnée topo disponible.');
        setTopoLoaded(true);
        return;
      }
      const sites = [...new Set(data.map(r => r.nom_site))];
      const technos = [...new Set(data.filter(r => r.techno).map(r => r.techno))];
      const bandes = [...new Set(data.filter(r => r.bande).map(r => r.bande))];
      const vendors = [...new Set(data.filter(r => r.constructeur).map(r => r.constructeur))];
      const regions = [...new Set(data.filter(r => r.region).map(r => r.region))];

      // Build a compact summary + sample of cells
      const sample = data.slice(0, 80).map(r =>
        `${r.nom_cellule} | site:${r.nom_site} | techno:${r.techno || '?'} | bande:${r.bande || '?'} | vendor:${r.constructeur || '?'} | region:${r.region || '?'} | azimut:${r.azimut ?? '?'} | lat:${r.latitude ?? '?'} | lon:${r.longitude ?? '?'}`
      ).join('\n');

      setTopoStats(
        `RÉSUMÉ TOPO:\n- ${data.length} cellules, ${sites.length} sites\n- Technos: ${technos.join(', ')}\n- Bandes: ${bandes.join(', ')}\n- Vendors: ${vendors.join(', ')}\n- Régions: ${regions.join(', ')}\n\nÉCHANTILLON (${Math.min(80, data.length)} cellules):\n${sample}`
      );
      setTopoLoaded(true);
    };
    loadTopo();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = { role: 'user' as const, content: input };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';
    const upsert = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qoe-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          cellContext: topoStats,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error('Stream error');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch { /* partial */ }
        }
      }
    } catch (e) {
      upsert('\n\n⚠️ Erreur de connexion à l\'IA.');
    }
    setIsLoading(false);
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col h-[500px]">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center text-white">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-black text-slate-800">AI Anomaly Analyzer</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Database className="w-3 h-3" />
            {topoLoaded ? `Topo chargée` : 'Chargement topo...'}
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Bot className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-xs text-slate-400 font-bold">Posez une question d'analyse ML sur vos données réseau</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['Analyse les anomalies de couverture', 'Détecte les sites avec des secteurs manquants', 'Quels sites ont des configs atypiques?'].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-bold text-slate-600 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs ${
              m.role === 'user'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-800 border border-slate-100'
            }`}>
              {m.role === 'assistant' ? (
                <div className="prose prose-xs prose-slate max-w-none [&_table]:text-[10px] [&_th]:px-2 [&_td]:px-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Analyser les anomalies réseau..."
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          <button onClick={sendMessage} disabled={isLoading || !input.trim()}
            className="px-4 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const DetectorConsole: React.FC = () => {
  const [configs, setConfigs] = useState<DetectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchDetectorConfigs();
      setConfigs(data);
      setLoading(false);
    };
    load();
  }, []);

  const triggerRun = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 3000);
  };

  if (loading) return <div className="p-20 text-center animate-pulse font-black text-slate-400">Loading configurations...</div>;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-8 space-y-8">
      {/* Run Control */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
            <Cpu className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Detection Engine Control</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Status: Operational • V2.4-ML</p>
          </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button className="px-6 py-3 bg-white text-slate-800 rounded-xl text-[10px] font-black uppercase shadow-sm">Daily</button>
            <button className="px-6 py-3 text-slate-400 rounded-xl text-[10px] font-black uppercase">15M Realtime</button>
          </div>
          <button onClick={triggerRun} disabled={isRunning}
            className="px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3">
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isRunning ? 'Running...' : 'Trigger Run'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Detectors */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Detector Pipeline
            </h3>
            <button className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
              <Plus className="w-3.5 h-3.5" /> New Detector
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {configs.map(det => (
              <div key={det.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative group hover:border-blue-400 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-2xl ${det.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <Shield className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${det.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{det.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>
                <h4 className="text-lg font-black text-slate-800 tracking-tight mb-2">{det.name}</h4>
                <div className="flex flex-wrap gap-2 mb-8">
                  {det.features.map(f => (
                    <span key={f} className="px-2.5 py-1 bg-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase">{f}</span>
                  ))}
                </div>
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Method</span>
                    <span className="text-slate-700">{det.method}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Scope</span>
                    <span className="text-slate-700">{det.level}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Last Run</span>
                    <span className="text-slate-700">{det.last_run || 'Never'}</span>
                  </div>
                </div>
                <div className="mt-8 flex gap-2">
                  <button className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase transition-colors">Tuning</button>
                  <button className="px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"><Settings className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Analysis Panel */}
        <div className="xl:col-span-4 space-y-6">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Bot className="w-4 h-4" /> AI Analysis
          </h3>
          <AIDetectorPanel />

          <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><History className="w-24 h-24" /></div>
            <h4 className="text-lg font-black mb-4">System Audit Log</h4>
            <div className="space-y-4">
              <AuditItem time="10:00" msg="Detector alt-001 run finished. 12 alerts." />
              <AuditItem time="09:12" msg="Threshold update by admin." />
              <AuditItem time="04:00" msg="Engine heartbeat: Nominal." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuditItem = ({ time, msg }: { time: string; msg: string }) => (
  <div className="flex gap-3 text-[10px] font-bold">
    <span className="text-white/40">{time}</span>
    <span className="text-white/80">{msg}</span>
  </div>
);

export default DetectorConsole;
