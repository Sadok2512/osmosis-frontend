import React from 'react';
import { AlertTriangle, Info, AlertOctagon, X } from 'lucide-react';
import { useBroadcastStore } from '@/stores/broadcastStore';

const SEVERITY_STYLES = {
  info: {
    bg: 'bg-blue-500/95 text-white',
    icon: <Info className="h-4 w-4" />,
  },
  warning: {
    bg: 'bg-amber-500/95 text-black',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  error: {
    bg: 'bg-red-600/95 text-white',
    icon: <AlertOctagon className="h-4 w-4" />,
  },
} as const;

const BroadcastBanner: React.FC = () => {
  const { enabled, message, severity } = useBroadcastStore();
  const [dismissed, setDismissed] = React.useState(false);

  // Reset dismissal when message or enabled state changes
  React.useEffect(() => {
    setDismissed(false);
  }, [message, enabled, severity]);

  if (!enabled || !message.trim() || dismissed) return null;

  const style = SEVERITY_STYLES[severity];

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2 text-xs font-semibold shadow-lg ${style.bg}`}
      role="alert"
    >
      {style.icon}
      <span className="flex-1 text-center">{message}</span>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-full p-1 transition-colors hover:bg-black/10"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default BroadcastBanner;
