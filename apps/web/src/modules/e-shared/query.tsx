import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { connectPatientCache } from '../../shared/patient-sync';

export function createEQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function EQueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(createEQueryClient);
  useEffect(() => connectPatientCache(client), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
