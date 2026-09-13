import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateObservationInput, HealthOverview, Observation, Paginated, Patient } from '@doctor/contracts';
import { requestEApi } from '../e-shared/api';

export interface ObservationFilters { metric?: Observation['metric']; from?: string; to?: string; page?: number }

export const healthKeys = {
  all: ['health'] as const,
  overview: (patientId: string) => ['health', 'overview', patientId] as const,
  observations: (patientId: string, filters: ObservationFilters) => ['health', 'observations', patientId, filters] as const,
  plans: (patientId: string) => ['health', 'plans', patientId] as const,
  assessments: (patientId: string) => ['health', 'assessments', patientId] as const,
  reminders: (patientId: string) => ['health', 'reminders', patientId] as const,
};

export function usePatientSearch(query: string) {
  return useQuery({
    queryKey: ['health', 'patient-search', query],
    queryFn: () => requestEApi<Patient[]>(`/patients?${query ? `q=${encodeURIComponent(query)}&` : ''}pageSize=8`),
    placeholderData: keepPreviousData,
  });
}

export function useHealthOverview(patientId: string) {
  return useQuery({
    queryKey: healthKeys.overview(patientId),
    queryFn: () => requestEApi<HealthOverview>(`/health/overview?patientId=${encodeURIComponent(patientId)}`),
    enabled: Boolean(patientId),
  });
}

export function useObservations(patientId: string, filters: ObservationFilters) {
  const search = new URLSearchParams({ patientId, pageSize: '30' });
  if (filters.metric) search.set('metric', filters.metric);
  if (filters.from) search.set('from', filters.from);
  if (filters.to) search.set('to', filters.to);
  if (filters.page) search.set('page', String(filters.page));
  return useQuery({
    queryKey: healthKeys.observations(patientId, filters),
    queryFn: () => requestEApi<Paginated<Observation>>(`/health/observations?${search}`),
    enabled: Boolean(patientId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateObservation(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateObservationInput) => requestEApi<Observation>('/health/observations', { method: 'POST', body: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
        queryClient.invalidateQueries({ queryKey: ['health', 'observations', patientId] }),
      ]);
    },
  });
}
