import React, { useState, useEffect } from 'react';
import { Shield, Eye, BarChart3, Clock, ChevronRight } from 'lucide-react';
import SentinelOverview from './pages/SentinelOverview';
import SentinelExplorer from './pages/SentinelExplorer';
import SentinelClustering from './pages/SentinelClustering';
import SentinelTemporal from './pages/SentinelTemporal';
import { fetchDates } from './sentinelApi';
import { cn } from '@/lib/utils';

type SentinelTab = 'overview' | 'explorer' | 'clustering' | 'temporal';

const tabs: { id: SentinelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: <Shield className="w-4 h-4" /> },
  { id: 'explorer', label: 'Anomalies', icon: <Eye className="w-4 h-4" /> },
  { id: 'clustering', label: 'Clustering', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'temporal', label: 'Analyse temporelle', icon: <Clock className="w-4 h-4" /> },
];

const SentinelPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SentinelTab>('overview');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDates()
      .then(dates => {
        setAvailableDates(dates);
        if (dates.length > 0) setSelectedDate(dates[dates.length - 1]);
      })
      .catch(() => {
        // API not available yet — use today
        const today = new Date().toISOString().split('T')[0];
        setAvailableDates([today]);
        setSelectedDate(today);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !selectedDate) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Connexion à l'Agent Sentinel...</p>
          <p className="text-xs text-muted-foreground/60"><p className="text-xs text-muted-foreground/60">FastAPI backend à localhost:1000</p></p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-destructive" />
          <span className="font-bold text-sm tracking-wide">SENTINEL</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Détection d'anomalies QoE</span>
        </div>

        <div className="flex-1" />

        {/* Date picker */}
        <select
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="text-xs border border-border rounded-md px-2 py-1 bg-card text-foreground"
        >
          {availableDates.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && <SentinelOverview date={selectedDate} />}
        {activeTab === 'explorer' && <SentinelExplorer date={selectedDate} />}
        {activeTab === 'clustering' && <SentinelClustering date={selectedDate} />}
        {activeTab === 'temporal' && <SentinelTemporal date={selectedDate} />}
      </div>
    </div>
  );
};

export default SentinelPage;
