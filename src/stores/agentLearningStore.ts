import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { getStoredSession } from '@/services/adminAuth';

export interface AgentFeedback {
  sessionId: string;
  messageIndex: number;
  userQuestion: string;
  assistantResponse: string;
  agent: string;
  rating: 1 | -1;
  intent?: string;
  scopeLevel?: string;
}

export interface AgentMemoryEntry {
  id?: string;
  memoryType: 'preference' | 'few_shot' | 'correction' | 'session_summary';
  agent?: string;
  key: string;
  value: Record<string, any>;
  relevanceScore?: number;
}

function getUserSourceId(): string | null {
  const session = getStoredSession();
  return session?.id ? `user:${session.id}` : null;
}

interface AgentLearningState {
  preferences: Record<string, any>;
  ratedMessages: Record<string, 1 | -1>;

  submitFeedback: (feedback: AgentFeedback) => Promise<void>;
  savePreference: (key: string, value: any, agent?: string) => Promise<void>;
  getPreferences: () => Record<string, any>;
  getFeedbackKey: (sessionId: string, messageIndex: number) => 1 | -1 | undefined;
  fetchFewShots: (agent: string, limit?: number) => Promise<string>;
  fetchMemoryContext: (agent?: string) => Promise<string>;
}

export const useAgentLearningStore = create<AgentLearningState>()(
  persist(
    (set, get) => ({
      preferences: {},
      ratedMessages: {},

      submitFeedback: async (feedback) => {
        const ratingKey = `${feedback.sessionId}-${feedback.messageIndex}`;
        const sourceId = getUserSourceId();
        
        set(state => ({
          ratedMessages: { ...state.ratedMessages, [ratingKey]: feedback.rating },
        }));

        try {
          await (supabase as any).from('agent_feedback').insert({
            session_id: feedback.sessionId,
            message_index: feedback.messageIndex,
            user_question: feedback.userQuestion.slice(0, 2000),
            assistant_response: feedback.assistantResponse.slice(0, 5000),
            agent: feedback.agent,
            rating: feedback.rating,
            intent: feedback.intent || null,
            scope_level: feedback.scopeLevel || null,
          });

          if (feedback.rating === 1) {
            // Save as few-shot example
            await (supabase as any).from('agent_memory').insert({
              memory_type: 'few_shot',
              agent: feedback.agent,
              key: `fewshot_${Date.now()}`,
              value: {
                question: feedback.userQuestion.slice(0, 500),
                answer: feedback.assistantResponse.slice(0, 1500),
              },
              source_session_id: sourceId || feedback.sessionId,
              relevance_score: 1.0,
            });
          } else if (feedback.rating === -1) {
            // Save as correction to avoid
            await (supabase as any).from('agent_memory').insert({
              memory_type: 'correction',
              agent: feedback.agent,
              key: `correction_${Date.now()}`,
              value: {
                question: feedback.userQuestion.slice(0, 500),
                badAnswer: feedback.assistantResponse.slice(0, 500),
                reason: 'User marked as unhelpful',
              },
              source_session_id: sourceId || feedback.sessionId,
              relevance_score: 1.0,
            });
          }
        } catch (e) {
          console.warn('[AgentLearning] Failed to save feedback:', e);
        }
      },

      savePreference: async (key, value, agent) => {
        set(state => ({
          preferences: { ...state.preferences, [key]: value },
        }));

        const sourceId = getUserSourceId();

        try {
          const existing = await (supabase as any)
            .from('agent_memory')
            .select('id, relevance_score')
            .eq('memory_type', 'preference')
            .eq('key', key)
            .maybeSingle();

          if (existing.data?.id) {
            const newScore = Math.min(2.0, (existing.data.relevance_score || 1.0) + 0.2);
            await (supabase as any)
              .from('agent_memory')
              .update({
                value: { data: value },
                relevance_score: newScore,
                updated_at: new Date().toISOString(),
                source_session_id: sourceId,
                ...(agent ? { agent } : {}),
              })
              .eq('id', existing.data.id);
          } else {
            await (supabase as any).from('agent_memory').insert({
              memory_type: 'preference',
              key,
              value: { data: value },
              source_session_id: sourceId,
              ...(agent ? { agent } : {}),
            });
          }
        } catch (e) {
          console.warn('[AgentLearning] Failed to save preference:', e);
        }
      },

      getPreferences: () => get().preferences,

      getFeedbackKey: (sessionId, messageIndex) => {
        return get().ratedMessages[`${sessionId}-${messageIndex}`];
      },

      fetchFewShots: async (agent, limit = 3) => {
        try {
          const { data } = await (supabase as any)
            .from('agent_feedback')
            .select('user_question, assistant_response')
            .eq('agent', agent)
            .eq('rating', 1)
            .order('created_at', { ascending: false })
            .limit(limit);

          if (!data || data.length === 0) return '';

          const examples = data.map((d: any, i: number) =>
            `--- Exemple ${i + 1} ---\nQ: ${d.user_question}\nR: ${d.assistant_response.slice(0, 800)}`
          ).join('\n\n');

          return `\n\n🎓 EXEMPLES DE BONNES RÉPONSES (few-shot learning):\n${examples}`;
        } catch {
          return '';
        }
      },

      fetchMemoryContext: async (agent) => {
        try {
          const sourceId = getUserSourceId();
          let query = (supabase as any)
            .from('agent_memory')
            .select('key, value, agent, relevance_score')
            .eq('memory_type', 'preference')
            .order('updated_at', { ascending: false })
            .limit(15);

          if (sourceId) {
            query = query.or(`source_session_id.eq.${sourceId},source_session_id.is.null`);
          }

          const { data } = await query;
          if (!data || data.length === 0) return '';

          const prefs = data.map((d: any) => {
            const agentTag = d.agent ? ` [${d.agent}]` : '';
            return `- ${d.key}${agentTag}: ${JSON.stringify(d.value?.data || d.value)}`;
          }).join('\n');
          return `\n\n🧠 MÉMOIRE UTILISATEUR (préférences apprises):\n${prefs}`;
        } catch {
          return '';
        }
      },
    }),
    {
      name: 'osmosis-agent-learning',
      version: 2,
    }
  )
);
