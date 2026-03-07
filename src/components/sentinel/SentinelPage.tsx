import React, { useState, useEffect } from 'react';
import { Shield, Eye, BarChart3, Bot, ChevronRight, Wifi, WifiOff, Loader2 } from 'lucide-react';
import SentinelOverview from './pages/SentinelOverview';
import SentinelExplorer from './pages/SentinelExplorer';
import SentinelClustering from './pages/SentinelClustering';
import SentinelAIPanel from './SentinelAIPanel';
import { fetchDates } from './sentinelApi';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type SentinelTab = 'overview' | 'explorer' | 'clustering';

const tabs: { id: SentinelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: <Shield className="w-4 h-4" /> },
  { id: 'explorer', label: 'Anomalies', icon: <Eye className="w-4 h-4" /> },
  { id: 'clustering', label: 'Clustering', icon: <BarChart3 className="w-4 h-4" /> },
];

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

const SentinelPage: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme = 'light' }) => {
  const [activeTab, setActiveTab] = useState<SentinelTab>('overview');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [apiResponse, setApiResponse] = useState<string>('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  useEffect(() => {
    setConnectionStatus('testing');
    fetchDates()
      .then(dates => {
        if (dates.length > 0) {
          setAvailableDates(dates);
          setSelectedDate(dates[dates.length - 1]);
          setConnectionStatus('connected');
        } else {
          const today = new Date().toISOString().split('T')[0];
          setSelectedDate(today);
          setAvailableDates([today]);
          setConnectionStatus('connected');
        }
      })
      .catch(() => {
        const today = new Date().toISOString().split('T')[0];
        setSelectedDate(today);
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
        setSelectedDate(dates[dates.length - 1]);
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setApiResponse(`✗ ${err.message || 'Connexion impossible'}`);
    }
  };

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'testing':
        return (
          <Badge variant="outline" className="text-[10px] gap-1 animate-pulse border-yellow-500/50 text-yellow-600">
            <Loader2 className="w-3 h-3 animate-spin" /> Test en cours...
          </Badge>
        );
      case 'connected':
        return (
          <Badge variant="outline" className="text-[10px] gap-1 border-green-500/50 text-green-600">
            <Wifi className="w-3 h-3" /> Connecté
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="text-[10px] gap-1 border-destructive/50 text-destructive">
            <WifiOff className="w-3 h-3" /> Hors ligne
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
            <WifiOff className="w-3 h-3" /> Non testé
          </Badge>
        );
    }
  };

  if (!selectedDate) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-destructive" />
          <span className="font-bold text-sm tracking-wide">ML DETECTOR</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Détection d'anomalies QoE</span>
        </div>

        <div className="flex-1" />

        {statusBadge()}
        <button
          onClick={testConnection}
          disabled={connectionStatus === 'testing'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
            connectionStatus === 'testing'
              ? 'bg-muted text-muted-foreground border-border cursor-wait'
              : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
          )}
        >
          {connectionStatus === 'testing' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wifi className="w-3.5 h-3.5" />
          )}
          Test FastAPI
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={e => {
            const v = e.target.value;
            if (v && v !== selectedDate) setSelectedDate(v);
          }}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-card text-foreground cursor-pointer"
        />

        {/* Tab nav */}
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Sentinel AI toggle button */}
        <button
          onClick={() => setAiPanelOpen(prev => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
            aiPanelOpen
              ? 'bg-destructive text-destructive-foreground border-destructive'
              : 'bg-card text-foreground border-border hover:bg-accent'
          )}
        >
          <Bot className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Sentinel AI</span>
        </button>
      </div>

      {/* API response toast */}
      {apiResponse && (
        <div className={cn(
          'mx-4 mt-2 px-3 py-2 rounded-md text-xs flex items-center justify-between',
          connectionStatus === 'connected'
            ? 'bg-green-500/10 text-green-700 border border-green-500/20'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        )}>
          <span>{apiResponse}</span>
          <button onClick={() => setApiResponse('')} className="ml-2 text-current hover:opacity-70">✕</button>
        </div>
      )}

      {/* Content + AI sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {activeTab === 'overview' && <SentinelOverview date={selectedDate} apiConnected={connectionStatus === 'connected'} theme={theme} />}
          {activeTab === 'explorer' && <SentinelExplorer date={selectedDate} apiConnected={connectionStatus === 'connected'} />}
          {activeTab === 'clustering' && <SentinelClustering date={selectedDate} apiConnected={connectionStatus === 'connected'} />}
        </div>

        {/* Sliding right AI panel */}
        <div
          className={cn(
            'border-l border-border bg-card transition-all duration-300 ease-in-out overflow-hidden shrink-0',
            aiPanelOpen ? 'w-[420px]' : 'w-0 border-l-0'
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
