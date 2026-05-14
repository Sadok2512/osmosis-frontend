import React, { useState, useEffect } from 'react';
import {
  Shield,
  Eye,
  BarChart3,
  Bot,
  Brain,
  ChevronRight,
  Wifi,
  WifiOff,
  Loader2,
  CalendarRange,
  Sparkles,
  Activity,
} from 'lucide-react';
import SentinelOverview from './pages/SentinelOverview';
import SentinelExplorer from './pages/SentinelExplorer';

import SentinelMLDetector from './pages/SentinelMLDetector';

import SentinelRCA from './pages/SentinelRCA';
import SentinelLiveMap from './pages/SentinelLiveMap';
import SentinelAIPanel from './SentinelAIPanel';
import { fetchDates } from './sentinelApi';
import type { MlAnomaly } from './mlDetectorApi';
import { cn } from '@/lib/utils';
import { MapPin } from 'lucide-react';

type SentinelTab = 'overview' | 'explorer' | 'ml-detector' | 'live-map' | 'rca';

const tabs: { id: SentinelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: "Vue d'ensemble", icon: <Shield className="w-4 h-4" /> },
  { id: 'ml-detector', label: 'ML Detector', icon: <Brain className="w-4 h-4" /> },
  { id: 'live-map', label: 'Live Map', icon: <MapPin className="w-4 h-4" /> },
  { id: 'rca', label: 'RCA', icon: <Sparkles className="w-4 h-4" /> },
];

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

const SentinelPage: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme = 'light' }) => {
  // Honour ?subtab=<id> so deep-links (e.g. from the parser admin sidebar
  // pointing to /?tab=sentinel&subtab=ml-detector) land on the right
  // sub-tab on first paint. We use `subtab`, not `tab`, because Index.tsx
  // already consumes `tab` for the top-level page routing — same param
  // name would collide and one would erase the other.
  const _initialTab: SentinelTab = (() => {
    if (typeof window === 'undefined') return 'overview';
    const t = new URLSearchParams(window.location.search).get('subtab');
    const valid: SentinelTab[] = ['overview', 'explorer', 'ml-detector', 'live-map', 'rca'];
    return (valid.includes(t as SentinelTab) ? t : 'overview') as SentinelTab;
  })();
  const [activeTab, setActiveTab] = useState<SentinelTab>(_initialTab);
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [, setAvailableDates] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [apiResponse, setApiResponse] = useState<string>('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // The anomaly the user clicked through to in the ML Detector list. The
  // RCA tab reads this; `null` means the user navigated to RCA directly
  // and we render an empty state with a Back button.
  const [rcaAnomaly, setRcaAnomaly] = useState<MlAnomaly | null>(null);

  useEffect(() => {
    setConnectionStatus('testing');
    fetchDates()
      .then(dates => {
        if (dates.length > 0) {
          setAvailableDates(dates);
          const end = dates[dates.length - 1];
          const startIdx = Math.max(0, dates.length - 7);
          const start = dates[startIdx];
          setDateEnd(end);
          setDateStart(start);
          setConnectionStatus('connected');
        } else {
          const today = new Date().toISOString().split('T')[0];
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
          setDateEnd(today);
          setDateStart(weekAgo);
          setAvailableDates([today]);
          setConnectionStatus('connected');
        }
      })
      .catch(() => {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        setDateEnd(today);
        setDateStart(weekAgo);
        setAvailableDates([today]);
        setConnectionStatus('error');
      });
  }, []);

  const testConnection = async () => {
    setConnectionStatus('testing');
    setApiResponse('');
    try {
      const start = Date.now();
      const dates = await fetchDates();
      const elapsed = Date.now() - start;
      setConnectionStatus('connected');
      setApiResponse(`✓ ${Array.isArray(dates) ? dates.length : 0} dates disponibles (${elapsed}ms)`);
      if (dates.length > 0) {
        setAvailableDates(dates);
        setDateEnd(dates[dates.length - 1]);
        const startIdx = Math.max(0, dates.length - 7);
        setDateStart(dates[startIdx]);
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setApiResponse(`✗ ${err.message || 'Connexion impossible'}`);
    }
  };

  const StatusPill = () => {
    const base =
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border backdrop-blur-sm';
    switch (connectionStatus) {
      case 'testing':
        return (
          <span className={cn(base, 'border-amber-300 bg-amber-50 text-amber-700 animate-pulse')}>
            <Loader2 className="w-3 h-3 animate-spin" /> Test…
          </span>
        );
      case 'connected':
        return (
          <span className={cn(base, 'border-emerald-300 bg-emerald-50 text-emerald-700')}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live
          </span>
        );
      case 'error':
        return (
          <span className={cn(base, 'border-red-300 bg-red-50 text-red-700')}>
            <WifiOff className="w-3 h-3" /> Hors ligne
          </span>
        );
      default:
        return (
          <span className={cn(base, 'border-slate-200 bg-white text-slate-500')}>
            <Wifi className="w-3 h-3" /> Idle
          </span>
        );
    }
  };

  if (!dateEnd) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F7F9FC]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const selectedDate = dateEnd;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F9FC]">
      {/* === MINIMAL HEADER === */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur border-b border-slate-200/80 flex items-center px-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 via-sky-500 to-indigo-600 shadow-[0_0_18px_-2px_rgba(14,165,233,0.6)]">
            <Shield className="w-4 h-4 text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] tracking-[0.18em] text-slate-900">
              ML&nbsp;DETECTOR
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-[12px] text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-sky-500" />
              Détection d'anomalies QoE
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Activity className="w-3.5 h-3.5" />
          AI-powered NOC
        </div>
      </header>

      {/* === FLOATING CONTROL PANEL === */}
      <div className="px-6 pt-5 pb-2 sticky top-14 z-20">
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 px-4 py-2.5',
            'rounded-2xl border border-white/60',
            'bg-white/70 backdrop-blur-xl',
            'shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18),0_2px_6px_-2px_rgba(15,23,42,0.06)]',
            'ring-1 ring-slate-900/5',
          )}
        >
          {/* LEFT: date range + tabs */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
              <CalendarRange className="w-3.5 h-3.5 text-sky-600" />
              <input
                type="date"
                value={dateStart}
                onChange={e => e.target.value && setDateStart(e.target.value)}
                className="text-[12px] bg-transparent text-slate-700 outline-none w-[112px] cursor-pointer"
              />
              <span className="text-slate-300">—</span>
              <input
                type="date"
                value={dateEnd}
                onChange={e => e.target.value && setDateEnd(e.target.value)}
                className="text-[12px] bg-transparent text-slate-700 outline-none w-[112px] cursor-pointer"
              />
            </div>

            <div className="h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100/80 border border-slate-200/60">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200',
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
                  )}
                >
                  {tab.icon}
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          {/* RIGHT: status + actions */}
          <div className="flex items-center gap-2">
            <StatusPill />

            <button
              onClick={() => setAiPanelOpen(prev => !prev)}
              className={cn(
                'relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-200',
                'bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600',
                'shadow-[0_4px_18px_-4px_rgba(14,165,233,0.55)]',
                'hover:shadow-[0_6px_24px_-4px_rgba(99,102,241,0.6)] hover:-translate-y-px',
                aiPanelOpen && 'ring-2 ring-sky-300/60',
              )}
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sentinel AI</span>
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
            </button>
          </div>
        </div>

        {apiResponse && (
          <div
            className={cn(
              'mt-2 px-3 py-2 rounded-xl text-[11px] flex items-center justify-between border backdrop-blur',
              connectionStatus === 'connected'
                ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200'
                : 'bg-red-50/80 text-red-700 border-red-200',
            )}
          >
            <span>{apiResponse}</span>
            <button onClick={() => setApiResponse('')} className="ml-2 hover:opacity-70">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* === CONTENT === */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
          {activeTab === 'overview' && (
            <SentinelOverview date={selectedDate} apiConnected={connectionStatus === 'connected'} theme={theme} />
          )}
          {activeTab === 'explorer' && (
            <SentinelExplorer
              date={selectedDate}
              dateStart={dateStart}
              dateEnd={dateEnd}
              apiConnected={connectionStatus === 'connected'}
            />
          )}
          {activeTab === 'ml-detector' && (
            <SentinelMLDetector onOpenRCA={(a) => { setRcaAnomaly(a); setActiveTab('rca'); }} />
          )}
          {activeTab === 'live-map' && (
            <SentinelLiveMap date={selectedDate} apiConnected={connectionStatus === 'connected'} />
          )}
          {activeTab === 'rca' && (
            <SentinelRCA anomaly={rcaAnomaly} onBack={() => setActiveTab('ml-detector')} />
          )}
        </div>

        <div
          className={cn(
            'border-l border-slate-200 bg-white transition-all duration-300 ease-in-out overflow-hidden shrink-0',
            aiPanelOpen ? 'w-[420px]' : 'w-0 border-l-0',
          )}
        >
          {aiPanelOpen && (
            <SentinelAIPanel
              onClose={() => setAiPanelOpen(false)}
              date={selectedDate}
              apiConnected={connectionStatus === 'connected'}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SentinelPage;
