import type { AgentResponseData } from '../components/AgentResponse';

/** Stub adapter: returns minimal kit-shaped object holding the raw markdown. */
export function parseToAgentResponse(
  cleaned: string,
  agentName?: string,
  meta?: Record<string, unknown>,
): AgentResponseData {
  return { markdown: cleaned, agent: agentName, meta };
}

export default parseToAgentResponse;
