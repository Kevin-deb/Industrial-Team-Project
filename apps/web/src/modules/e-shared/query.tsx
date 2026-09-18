import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
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

const appQueryClient = createEQueryClient();

export function EQueryProvider({ children }: PropsWithChildren) {
  useEffect(() => connectPatientCache(appQueryClient), []);
  return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
}
