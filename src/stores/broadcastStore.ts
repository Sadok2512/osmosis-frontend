import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BroadcastSeverity = 'info' | 'warning' | 'error';

interface BroadcastState {
  enabled: boolean;
  message: string;
  severity: BroadcastSeverity;
  setEnabled: (v: boolean) => void;
  setMessage: (v: string) => void;
  setSeverity: (v: BroadcastSeverity) => void;
}

// TODO: wire to backend (GET /api/broadcast). For now state is persisted locally
// so admins can author the message; later we'll replace with a server poll.
export const useBroadcastStore = create<BroadcastState>()(
  persist(
    (set) => ({
      enabled: false,
      message: '',
      severity: 'warning',
      setEnabled: (enabled) => set({ enabled }),
      setMessage: (message) => set({ message }),
      setSeverity: (severity) => set({ severity }),
    }),
    { name: 'osmosis-broadcast-message-v1' }
  )
);
