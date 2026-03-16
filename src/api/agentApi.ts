import { request } from '@/api/httpClient';
import type {
  ChatMessageResponse,
  ChatSession,
  InvestigationResponse,
  MemoryCellResponse,
  MemoryProblemCell,
  MemoryStats,
} from '@/api/types';

export const agentApi = {
  createSession: (body: { user_id: string; language: string }) =>
    request<ChatSession>('agent', 'chat/session', { method: 'POST', body: JSON.stringify(body) }),
  sendMessage: (body: { session_id: string; message: string; user_id: string }) =>
    request<ChatMessageResponse>('agent', 'chat/message', { method: 'POST', body: JSON.stringify(body) }),
  getSessions: (params?: Record<string, unknown>) => request<ChatSession[]>('agent', 'chat/sessions', { params }),
  getInvestigation: (invId: string) => request<InvestigationResponse>('agent', `investigation/${invId}`),
  sendFeedback: (invId: string, body: { rca_correct: boolean; rating: number; comment?: string }) =>
    request('agent', `investigation/${invId}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
  getCellMemory: (cellName: string) => request<MemoryCellResponse>('agent', `memory/cell/${encodeURIComponent(cellName)}`),
  getProblemCells: () => request<MemoryProblemCell[]>('agent', 'memory/problem-cells'),
  getMemoryStats: () => request<MemoryStats>('agent', 'memory/stats'),
};
