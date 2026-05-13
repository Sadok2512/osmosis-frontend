import React from 'react';

export interface AgentResponseData {
  markdown?: string;
  [key: string]: unknown;
}

interface Props {
  data: AgentResponseData | null;
  onFollowUp?: (prompt: string) => void;
}

/** Stub: kit not bundled — render markdown text as fallback. */
export function AgentResponse({ data }: Props) {
  if (!data) return null;
  const md = typeof data.markdown === 'string' ? data.markdown : '';
  return <div className="prose prose-sm max-w-none whitespace-pre-wrap">{md}</div>;
}

export default AgentResponse;
