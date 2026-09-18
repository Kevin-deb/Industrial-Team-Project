import type { QueryClient } from '@tanstack/react-query';

export const patientChangedEvent = 'carelink:patient-changed';

/** Metadata-only, process-local invalidation; server responses remain authoritative. */
export function notifyPatientWrite(path: string, method: string, data: unknown): void {
  if (!['POST', 'PATCH'].includes(method.toUpperCase()) || !/^\/patients(?:\/|$)/.test(path))
    return;
  const item = data as { id?: string; results?: Array<{ id: string }> } | undefined;
  const ids = item?.id ? [item.id] : (item?.results?.map((value) => value.id) ?? []);
  window.dispatchEvent(new CustomEvent(patientChangedEvent, { detail: { ids } }));
}

export function connectPatientCache(client: QueryClient): () => void {
  const listener = (event: Event) => {
    const ids: string[] = (event as CustomEvent<{ ids: string[] }>).detail.ids;
    void client.invalidateQueries({
      predicate: (query) => {
        const [domain, kind, id] = query.queryKey;
        return (
          domain === 'health' &&
          (kind === 'patient-search' ||
            (kind === 'patient-summary' && (!ids.length || ids.includes(String(id)))))
        );
      },
    });
  };
  window.addEventListener(patientChangedEvent, listener);
  return () => window.removeEventListener(patientChangedEvent, listener);
}
