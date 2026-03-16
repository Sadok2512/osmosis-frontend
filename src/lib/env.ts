export const env = {
  parserApiBase: import.meta.env.VITE_PARSER_API_BASE || 'http://151.242.147.49:8000/api/v1',
  kpiApiBase: import.meta.env.VITE_KPI_API_BASE || 'http://151.242.147.49:8001',
  agentApiBase: import.meta.env.VITE_AGENT_API_BASE || 'http://151.242.147.49:1000',
  agentApiKey: import.meta.env.VITE_AGENT_API_KEY || '',
};
