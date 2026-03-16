import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bell, Bot, Database, Gauge, GitBranch, LayoutDashboard, LogOut, Radar, Route, Settings2, Siren, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/topology', label: 'Topology', icon: Radar },
  { to: '/alarms', label: 'FM Alarms', icon: Bell },
  { to: '/cm-history', label: 'CM History', icon: GitBranch },
  { to: '/pm-counters', label: 'PM Counters', icon: Table2 },
  { to: '/neighbors', label: 'HO Neighbors', icon: Route },
  { to: '/kpis', label: 'KPI Monitor', icon: Gauge },
  { to: '/anomalies', label: 'Anomalies', icon: Siren },
  { to: '/assistant', label: 'Agent Chat', icon: Bot },
  { to: '/config', label: 'Config', icon: Settings2 },
];

export default function AppLayout() {
  const { logout, userId } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-800 bg-slate-900/80">
          <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
            <div className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold tracking-wide">QOEBIT RAN</div>
              <div className="text-xs text-slate-400">Parser + KPI + Agents</div>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-64px)]">
            <nav className="space-y-1 p-3">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      isActive ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
              <div className="mb-3 flex items-center justify-between">
                <span>Signed in</span>
                <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">{userId}</span>
              </div>
              <Button variant="outline" className="w-full justify-start border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            </div>
          </ScrollArea>
        </aside>
        <main className="min-w-0 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
