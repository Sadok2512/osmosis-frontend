import React from 'react';
import { AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';
import { useBroadcastStore } from '@/stores/broadcastStore';

const SEVERITY_STYLES = {
  info: {
    bg: 'bg-blue-500/60 text-white backdrop-blur-sm',
    icon: <Info className="h-4 w-4" />,
  },
  warning: {
    bg: 'bg-amber-500/60 text-black backdrop-blur-sm',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  error: {
    bg: 'bg-red-600/60 text-white backdrop-blur-sm',
    icon: <AlertOctagon className="h-4 w-4" />,
  },
} as const;

const DISMISS_KEY = 'osmosis-broadcast-dismissed-at';
const REAPPEAR_MS = 30 * 60 * 1000; // 30 minutes

const BroadcastBanner: React.FC = () => {
  const { enabled, message, severity } = useBroadcastStore();
  const [dismissedAt, setDismissedAt] = React.useState<number>(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  });
  const [now, setNow] = React.useState(() => Date.now());

  // Reset dismissal when message/enabled/severity changes
  React.useEffect(() => {
    localStorage.removeItem(DISMISS_KEY);
    setDismissedAt(0);
  }, [message, enabled, severity]);

  // Tick every minute to re-evaluate the 30-min window
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!enabled || !message.trim()) return null;
  const isDismissed = dismissedAt > 0 && now - dismissedAt < REAPPEAR_MS;
  if (isDismissed) return null;

  const style = SEVERITY_STYLES[severity];

  const handleDismiss = () => {
    const ts = Date.now();
    localStorage.setItem(DISMISS_KEY, String(ts));
    setDismissedAt(ts);
  };

  return (
    <div
      className={`fixed top-0 right-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2 text-xs font-semibold shadow-lg ${style.bg}`}
      style={{ left: 'var(--sidebar-width, 0px)' }}
      role="alert"
    >
      {style.icon}
      <span className="flex-1 text-center">{message}</span>
      <button
        onClick={handleDismiss}
        className="rounded-full p-1 transition-colors hover:bg-black/10"
        aria-label="Dismiss"
        title="Réapparaîtra dans 30 minutes"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default BroadcastBanner;
