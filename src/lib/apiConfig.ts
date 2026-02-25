/**
 * API URL helper — switches between Lovable Cloud and local Express server.
 * 
 * Set VITE_LOCAL_API=http://localhost:3001 in .env.local to use local mode.
 */

const LOCAL_API = import.meta.env.VITE_LOCAL_API;

export const isLocalMode = (): boolean => !!LOCAL_API;

/**
 * Get the base URL for an edge function / API endpoint.
 * In cloud mode: https://xxx.supabase.co/functions/v1/{name}
 * In local mode: http://localhost:3001/api/{name}
 */
export function getApiUrl(functionName: string): string {
  if (LOCAL_API) {
    return `${LOCAL_API}/api/${functionName}`;
  }
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
}

/**
 * Get auth headers for API calls.
 * In cloud mode: includes Bearer token.
 * In local mode: no auth needed.
 */
export function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!LOCAL_API) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}
