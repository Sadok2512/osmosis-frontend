import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '@/services/adminAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, Loader2, Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';

export default function UserLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await loginAdmin(username, password);
      if (user.status === 'inactive') {
        throw new Error('Your account has been deactivated. Contact an administrator.');
      }
      toast({ title: 'Welcome back', description: `Signed in as ${username}` });
      navigate('/');
    } catch (err: any) {
      const msg = err?.message || 'Invalid credentials';
      setErrorMsg(msg);
      toast({ title: 'Authentication failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-[45%] relative items-center justify-center"
        style={{ background: 'linear-gradient(135deg, hsl(220 50% 10%), hsl(220 40% 16%), hsl(170 70% 25%))' }}>
        {/* Floating geometric shapes */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[15%] left-[10%] w-32 h-32 rounded-full border border-white/5 animate-pulse" />
          <div className="absolute bottom-[20%] right-[15%] w-48 h-48 rounded-full border border-white/5" style={{ animationDelay: '1s' }} />
          <div className="absolute top-[50%] left-[50%] w-20 h-20 rotate-45 border border-[hsl(170,70%,35%)]/20" />
          <div className="absolute top-[30%] right-[25%] w-3 h-3 rounded-full bg-[hsl(170,70%,45%)]/30" />
          <div className="absolute bottom-[35%] left-[30%] w-2 h-2 rounded-full bg-[hsl(170,70%,45%)]/20" />
        </div>
        <div className="relative z-10 px-12 text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-[hsl(170,70%,35%)]/15 backdrop-blur-sm flex items-center justify-center border border-[hsl(170,70%,45%)]/20">
            <ShieldCheck className="w-10 h-10 text-[hsl(170,70%,55%)]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
            OSMOSIS
          </h2>
          <p className="text-white/50 text-sm max-w-xs mx-auto leading-relaxed">
            Centralized management for users, agents, models, memory sessions and system health monitoring.
          </p>
          <div className="mt-10 flex items-center justify-center gap-6 text-white/30 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />AI Powered</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400/60" />QOE Monitoring</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />Analytics</span>
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-sm mt-1.5">Enter your credentials to access the admin panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold leading-tight">Authentication failed</p>
                  <p className="text-destructive/80 text-xs mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="pl-10 h-11 bg-secondary/30 border-border/60 focus:bg-background transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-11 bg-secondary/30 border-border/60 focus:bg-background transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11 text-sm font-semibold mt-2" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            Protected access · OSMOSIS Platform
          </p>
        </div>
      </div>
    </div>
  );
}
