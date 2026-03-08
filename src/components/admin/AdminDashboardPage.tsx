import React, { useState, useEffect } from 'react';
import {
  Activity, Bot, Users, MessageSquare, Cpu, CheckCircle2,
  AlertTriangle, Clock, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ActivityItem {
  id: string;
  agent: string;
  action: string;
  status: 'active' | 'pending' | 'error' | 'idle';
  time: string;
}

const statusDot: Record<string, string> = {
  active: 'bg-emerald-500',
  pending: 'bg-amber-400',
  error: 'bg-red-500',
  idle: 'bg-muted-foreground/40',
};

const statusLabel: Record<string, string> = {
  active: 'Actif',
  pending: 'En attente',
  error: 'Erreur',
  idle: 'Inactif',
};

export default function AdminDashboardPage() {
  const [agentCount, setAgentCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [runStats, setRunStats] = useState({ total: 0, success: 0, errors: 0, avgLatency: 0 });
  const [feed, setFeed] = useState<ActivityItem[]>([]);

  useEffect(() => {
    (async () => {
      // Agents count
      const { count: ac } = await supabase.from('admin_agents').select('*', { count: 'exact', head: true });
      setAgentCount(ac || 0);
      // Users count
      const { count: uc } = await supabase.from('admin_users').select('*', { count: 'exact', head: true });
      setUserCount(uc || 0);
      // Runs
      const { data: runs } = await supabase.from('agent_runs').select('status, latency_ms, started_at, agent_id, notes').order('started_at', { ascending: false }).limit(50);
      if (runs) {
        const success = runs.filter(r => r.status === 'success').length;
        const errors = runs.filter(r => r.status === 'error').length;
        const latencies = runs.filter(r => r.latency_ms).map(r => r.latency_ms!);
        const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
        setRunStats({ total: runs.length, success, errors, avgLatency });

        // Build feed from recent runs
        const { data: agentsData } = await supabase.from('admin_agents').select('id, name');
        const agentMap: Record<string, string> = {};
        agentsData?.forEach(a => { agentMap[a.id] = a.name; });

        const feedItems: ActivityItem[] = runs.slice(0, 15).map((r, i) => ({
          id: String(i),
          agent: agentMap[r.agent_id] || r.agent_id.slice(0, 8),
          action: r.notes || (r.status === 'success' ? 'Exécution terminée' : r.status === 'error' ? 'Échec d\'exécution' : 'Run en cours'),
          status: r.status === 'success' ? 'active' : r.status === 'error' ? 'error' : r.status === 'running' ? 'pending' : 'idle',
          time: new Date(r.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        }));
        setFeed(feedItems);
      }
    })();
  }, []);

  const cards = [
    { label: 'Agents actifs', value: agentCount, icon: <Bot size={20} />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Utilisateurs', value: userCount, icon: <Users size={20} />, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Runs récents', value: runStats.total, icon: <Activity size={20} />, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Taux succès', value: runStats.total ? `${Math.round((runStats.success / runStats.total) * 100)}%` : '—', icon: <CheckCircle2 size={20} />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Erreurs', value: runStats.errors, icon: <AlertTriangle size={20} />, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Latence moy.', value: runStats.avgLatency ? `${runStats.avgLatency}ms` : '—', icon: <Clock size={20} />, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble de la plateforme QOEBIT</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center ${c.color}`}>{c.icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{c.value}</span>
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Activité récente</h2>
        </div>
        <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
          {feed.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune activité récente</div>
          )}
          {feed.map(item => (
            <div key={item.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot[item.status]}`} />
              <span className="text-xs font-bold text-foreground w-20 shrink-0">{item.agent}</span>
              <span className="text-xs text-muted-foreground flex-1 truncate">{item.action}</span>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                item.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                item.status === 'error' ? 'bg-red-500/15 text-red-500' :
                item.status === 'pending' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                'bg-muted text-muted-foreground'
              }`}>{statusLabel[item.status]}</span>
              <span className="text-[10px] text-muted-foreground w-12 text-right">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
