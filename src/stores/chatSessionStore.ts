import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Path A spec rename (2026-05-11). Canonical 6 agents.
// Legacy ids kept as aliases so cached sessions still resolve via backend
// AGENT_MAP — new code should only use the canonical 6.
type AgentId =
  | 'OSMOSIS' | 'RCAI' | 'OPTIMUS' | 'AEGIS' | 'EXA' | 'ECHO'
  // Backward-compat aliases (do not use in new code):
  | 'PULSE' | 'TRACE' | 'SENTINEL' | 'TOPO' | 'PARMY' | 'ANALYTIC';

export type ProgressEventType =
  | 'agent_selected'
  | 'tool_start'
  | 'tool_done'
  | 'generating'
  | 'orchestrator_plan'
  | 'agent_start'
  | 'agent_done'
  | 'synthesis_start'
  | 'skill_loading'
  | 'skill_executed';

export interface ProgressEvent {
  type: ProgressEventType;
  agent?: string;
  tool?: string;
  query?: string;
  plan?: string[];
  skill_id?: string;
  skill_name?: string;
  verdict?: string;
  ts: number; // client-side timestamp when parsed
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mapCellIds?: string[];
  mapDescription?: string;
  agent?: AgentId;
  progressEvents?: ProgressEvent[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatSessionStore {
  sessions: ChatSession[];
  activeSessionId: string | null;

  // Actions
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setMessages: (id: string, messages: ChatMessage[]) => void;
  getActiveSession: () => ChatSession | null;
  clearAllSessions: () => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function inferTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'Nouvelle session';
  const text = firstUser.content.slice(0, 40);
  return text.length < firstUser.content.length ? text + '…' : text;
}

export const useChatSessionStore = create<ChatSessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      createSession: (title?: string) => {
        const id = generateId();
        const session: ChatSession = {
          id,
          title: title || 'Nouvelle session',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set(state => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      deleteSession: (id: string) => {
        set(state => {
          const remaining = state.sessions.filter(s => s.id !== id);
          let nextActive = state.activeSessionId;
          if (nextActive === id) {
            nextActive = remaining[0]?.id || null;
          }
          return { sessions: remaining, activeSessionId: nextActive };
        });
      },

      setActiveSession: (id: string) => {
        set({ activeSessionId: id });
      },

      renameSession: (id: string, title: string) => {
        set(state => ({
          sessions: state.sessions.map(s => s.id === id ? { ...s, title } : s),
        }));
      },

      setMessages: (id: string, messages: ChatMessage[]) => {
        set(state => {
          const session = state.sessions.find(s => s.id === id);
          // Auto-rename if first user message and title is default
          let title = session?.title || 'Nouvelle session';
          if (title === 'Nouvelle session' && messages.length > 0) {
            title = inferTitle(messages);
          }
          return {
            sessions: state.sessions.map(s =>
              s.id === id ? { ...s, messages, title, updatedAt: Date.now() } : s
            ),
          };
        });
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find(s => s.id === activeSessionId) || null;
      },

      clearAllSessions: () => {
        set({ sessions: [], activeSessionId: null });
      },
    }),
    {
      name: 'osmosis-chat-sessions',
      version: 1,
      // Migrate from old single-history format
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || !persistedState) {
          // Try to import old single-session history
          try {
            const old = localStorage.getItem('osmosis_chat_history');
            if (old) {
              const messages = JSON.parse(old);
              if (Array.isArray(messages) && messages.length > 0) {
                const id = generateId();
                const session: ChatSession = {
                  id,
                  title: inferTitle(messages),
                  messages,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                localStorage.removeItem('osmosis_chat_history');
                return { sessions: [session], activeSessionId: id };
              }
            }
          } catch {}
          return { sessions: [], activeSessionId: null };
        }
        return persistedState as any;
      },
    }
  )
);
