import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredSession, clearSession, AdminUser } from '@/services/adminAuth';
import {
  Users, Bot, Blocks, Settings2, Activity, LogOut,
  ChevronLeft, ChevronRight, ShieldCheck, Database, ArrowLeft,
  LayoutDashboard, Cpu, Brain
} from 'lucide-react';
import AdminUsersPage from '@/components/admin/AdminUsersPage';
import AdminModulesPage from '@/components/admin/AdminModulesPage';
import AdminModulesPage from '@/components/admin/AdminModulesPage';
import AdminLLMPage from '@/components/admin/AdminLLMPage';
import AdminHealthPage from '@/components/admin/AdminHealthPage';
import AdminMemoryPage from '@/components/admin/AdminMemoryPage';
import AdminDashboardPage from '@/components/admin/AdminDashboardPage';
import AdminAITeamPage from '@/components/admin/AdminAITeamPage';

const navSections = [
  {
    label: 'Général',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
      { id: 'ai-team', label: 'AI Team', icon: Cpu, adminOnly: false },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users', label: 'Users', icon: Users, adminOnly: true },
      { id: 'agents', label: 'Agents', icon: Bot, adminOnly: false },
      { id: 'modules', label: 'Modules', icon: Blocks, adminOnly: true },
      { id: 'llm', label: 'LLM Settings', icon: Settings2, adminOnly: true },
      { id: 'memory', label: 'Memory', icon: Brain, adminOnly: false },
      { id: 'health', label: 'DB Health', icon: Activity, adminOnly: true },
    ],
  },
];

export default function AdminPanel() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = getStoredSession();
    if (!session) { navigate('/admin/login'); return; }
    setUser(session);
  }, [navigate]);

  const handleLogout = () => {
    clearSession();
    navigate('/admin/login');
  };

  if (!user) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <AdminDashboardPage />;
      case 'ai-team': return <AdminAITeamPage />;
      case 'users': return user.role === 'admin' ? <AdminUsersPage /> : null;
      case 'agents': return <AdminAgentsPage currentUser={user} />;
      case 'modules': return user.role === 'admin' ? <AdminModulesPage /> : null;
      case 'llm': return user.role === 'admin' ? <AdminLLMPage /> : null;
      case 'memory': return <AdminMemoryPage currentUser={user} />;
      case 'health': return user.role === 'admin' ? <AdminHealthPage /> : null;
      default: return <AdminDashboardPage />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} transition-all duration-200 bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] flex flex-col border-r border-[hsl(var(--sidebar-border))]`}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-2 border-b border-[hsl(var(--sidebar-border))]">
          <ShieldCheck className="w-6 h-6 text-[hsl(var(--sidebar-primary))] shrink-0" />
          {!collapsed && <span className="font-bold text-lg">QOEBIT Admin</span>}
        </div>

        {/* Nav sections */}
        <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-4">
          {navSections.map(section => {
            const visibleItems = section.items.filter(i => !i.adminOnly || user.role === 'admin');
            if (!visibleItems.length) return null;
            return (
              <div key={section.label}>
                {!collapsed && (
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--sidebar-foreground))] opacity-40">
                    {section.label}
                  </div>
                )}
                <div className="space-y-0.5 mt-1">
                  {visibleItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        activeTab === item.id
                          ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]'
                          : 'hover:bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]'
                      }`}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-[hsl(var(--sidebar-border))] space-y-1">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Back to App</span>}
          </button>

          {/* Profile */}
          {!collapsed && (
            <div className="px-3 py-2 rounded-lg bg-[hsl(var(--sidebar-accent))]/30 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[hsl(var(--sidebar-primary))]/20 flex items-center justify-center text-sm">
                👤
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[hsl(var(--sidebar-foreground))] truncate">{user.username}</div>
                <div className="text-[10px] text-[hsl(var(--sidebar-foreground))] opacity-50 capitalize">{user.role}</div>
              </div>
            </div>
          )}

          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-[hsl(var(--sidebar-accent))] text-red-400">
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center py-1 text-[hsl(var(--sidebar-foreground))] opacity-50 hover:opacity-100">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        {renderContent()}
      </main>
    </div>
  );
}
