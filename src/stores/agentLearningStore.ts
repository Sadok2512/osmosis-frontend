import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

export interface AgentFeedback {
  sessionId: string;
  messageIndex: number;
  userQuestion: string;
  assistantResponse: string;
  agent: string;
  rating: 1 | -1;
  intent?: string;
}

export interface AgentMemoryEntry {
  id?: string;
  memoryType: 'preference' | 'few_shot' | 'correction';
  agent?: string;
  key: string;
  value: Record<string, any>;
  relevanceScore?: number;
}

interface AgentLearningState {
  // Local cache of user preferences
  preferences: Record<string, any>;
  // Feedback tracking (which messages were rated)
  ratedMessages: Record<string, 1 | -1>; // key: `${sessionId}-${messageIndex}`

  // Actions
  submitFeedback: (feedback: AgentFeedback) => Promise<void>;
  savePreference: (key: string, value: any) => Promise<void>;
  getPreferences: () => Record<string, any>;
  getFeedbackKey: (sessionId: string, messageIndex: number) => 1 | -1 | undefined;
  fetchFewShots: (agent: string, limit?: number) => Promise<string>;
  fetchMemoryContext: () => Promise<string>;
}

export const useAgentLearningStore = create<AgentLearningState>()(
  persist(
    (set, get) => ({
      preferences: {},
      ratedMessages: {},

      submitFeedback: async (feedback) => {
        const ratingKey = `${feedback.sessionId}-${feedback.messageIndex}`;
        
        // Save locally
        set(state => ({
          ratedMessages: { ...state.ratedMessages, [ratingKey]: feedback.rating },
        }));

        // Save to DB
        try {
          await (supabase as any).from('agent_feedback').insert({
            session_id: feedback.sessionId,
            message_index: feedback.messageIndex,
            user_question: feedback.userQuestion.slice(0, 2000),
            assistant_response: feedback.assistantResponse.slice(0, 5000),
            agent: feedback.agent,
            rating: feedback.rating,
            intent: feedback.intent || null,
          });

          // If positive, also save as few-shot in agent_memory
          if (feedback.rating === 1) {
            await (supabase as any).from('agent_memory').insert({
              memory_type: 'few_shot',
              agent: feedback.agent,
              key: `fewshot_${Date.now()}`,
              value: {
                question: feedback.userQuestion.slice(0, 500),
                answer: feedback.assistantResponse.slice(0, 1500),
              },
              source_session_id: feedback.sessionId,
              relevance_score: 1.0,
            });
          }
        } catch (e) {
          console.warn('[AgentLearning] Failed to save feedback:', e);
        }
      },

      savePreference: async (key, value) => {
        set(state => ({
          preferences: { ...state.preferences, [key]: value },
        }));

        try {
          // Upsert in DB
          const existing = await (supabase as any)
            .from('agent_memory')
            .select('id')
            .eq('memory_type', 'preference')
            .eq('key', key)
            .maybeSingle();

          if (existing.data?.id) {
            await (supabase as any)
              .from('agent_memory')
              .update({ value: { data: value }, updated_at: new Date().toISOString() })
              .eq('id', existing.data.id);
          } else {
            await (supabase as any).from('agent_memory').insert({
              memory_type: 'preference',
              key,
              value: { data: value },
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

      fetchMemoryContext: async () => {
        try {
          const { data } = await (supabase as any)
            .from('agent_memory')
            .select('key, value')
            .eq('memory_type', 'preference')
            .order('updated_at', { ascending: false })
            .limit(10);

          if (!data || data.length === 0) return '';

          const prefs = data.map((d: any) => `- ${d.key}: ${JSON.stringify(d.value?.data || d.value)}`).join('\n');
          return `\n\n🧠 MÉMOIRE UTILISATEUR (préférences apprises):\n${prefs}`;
        } catch {
          return '';
        }
      },
    }),
    {
      name: 'qoebit-agent-learning',
      version: 1,
    }
  )
);
