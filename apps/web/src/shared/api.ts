import { useCallback, useEffect, useState } from 'react';
import type { ApiMeta } from '@doctor/contracts';

export type { ApiMeta } from '@doctor/contracts';
export async function getApi<T>(
  path: string,
  signal?: AbortSignal,
): Promise<{ data: T; meta: ApiMeta }> {
  const response = await fetch(`/api/v1${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || `服务暂时不可用（${response.status}）`);
  }
  return response.json();
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    getApi<T>(path, controller.signal)
      .then((body) => {
        setData(body.data);
        setMeta(body.meta);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '无法连接服务');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, meta, loading, error, reload };
}
