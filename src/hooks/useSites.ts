import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { topoApi } from '@/lib/localDb';

export function useSites(queryParams: string) {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedParams = useDebounce(queryParams, 300);

  useEffect(() => {
    setLoading(true);
    topoApi
      .filteredSites(debouncedParams)
      .then(data => {
        setSites(data);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [debouncedParams]);

  return { sites, loading, error };
}
