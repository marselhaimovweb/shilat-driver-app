import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal data-loading hook: loading / error / data + reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const call = useRef(0);

  const run = useCallback(async (mode: 'load' | 'refresh' | 'silent' = 'load') => {
    const id = ++call.current;
    if (mode === 'load') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await fn();
      if (alive.current && id === call.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (alive.current && id === call.current) setError(e instanceof Error ? e.message : 'אירעה שגיאה');
    } finally {
      if (alive.current && id === call.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    run('load');
    return () => {
      alive.current = false;
    };
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    setData,
    reload: () => run('silent'),
    refresh: () => run('refresh'),
  };
}
