/**
 * API URL helper — switches between Lovable Cloud and local Express server.
 * 
 * Set VITE_LOCAL_API=http://localhost:3001 in .env.local to use local mode.
 */

const LOCAL_API = import.meta.env.VITE_LOCAL_API;

const isBrowserRunningLocally = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }

  if (host.endsWith('.local') || host.startsWith('192.168.') || host.startsWith('10.')) {
    return true;
  }

  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const octet = Number(private172[1]);
    return octet >= 16 && octet <= 31;
  }

  return false;
};

export const isLocalMode = (): boolean => !!LOCAL_API && isBrowserRunningLocally();

/**
 * Get the base URL for an edge function / API endpoint.
 * In cloud mode: https://xxx.supabase.co/functions/v1/{name}
 * In local mode: http://localhost:3001/api/{name}
 */
export function getApiUrl(functionName: string): string {
  if (isLocalMode()) {
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
  if (!isLocalMode()) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  return headers;
}
