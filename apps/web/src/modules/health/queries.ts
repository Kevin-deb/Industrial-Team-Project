import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CarePlanDetail,
  CarePlanVersion,
  CreateAssessmentInput,
  CreateCarePlanInput,
  CreateObservationInput,
  CreateReminderInput,
  HealthAssessment,
  HealthPatientSummary,
  HealthOverview,
  Observation,
  ObservationTrendResponse,
  Paginated,
  ReminderTask,
  UpdateCarePlanInput,
} from '@doctor/contracts';
import { EApiError, requestEApi, useLocalizedEQuery } from '../e-shared';

export interface ObservationFilters {
  metric?: Observation['metric'];
  from?: string;
  to?: string;
  page?: number;
}

export const healthKeys = {
  all: ['health'] as const,
  overview: (patientId: string) => ['health', 'overview', patientId] as const,
  observations: (patientId: string, filters: ObservationFilters) =>
    ['health', 'observations', patientId, filters] as const,
  observationTrends: (patientId: string, filters: ObservationFilters) =>
    ['health', 'observation-trends', patientId, filters] as const,
  plans: (patientId: string) => ['health', 'plans', patientId] as const,
  assessments: (patientId: string) => ['health', 'assessments', patientId] as const,
  reminders: (patientId: string) => ['health', 'reminders', patientId] as const,
};

export function usePatientSearch(query: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: ['health', 'patient-search', query],
      queryFn: () =>
        requestEApi<HealthPatientSummary[]>(
          `/health/patients${query ? `?q=${encodeURIComponent(query)}` : ''}`,
        ),
      placeholderData: keepPreviousData,
    }),
  );
}

export function useHealthOverview(patientId: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.overview(patientId),
      queryFn: () =>
        requestEApi<HealthOverview>(`/health/overview?patientId=${encodeURIComponent(patientId)}`),
      enabled: Boolean(patientId),
    }),
  );
}

export function useObservations(patientId: string, filters: ObservationFilters) {
  const search = new URLSearchParams({ patientId, pageSize: '30' });
  if (filters.metric) search.set('metric', filters.metric);
  if (filters.from) search.set('from', filters.from);
  if (filters.to) search.set('to', filters.to);
  if (filters.page) search.set('page', String(filters.page));
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.observations(patientId, filters),
      queryFn: () => requestEApi<Paginated<Observation>>(`/health/observations?${search}`),
      enabled: Boolean(patientId),
      placeholderData: keepPreviousData,
    }),
  );
}

export function useObservationTrends(
  patientId: string,
  filters: ObservationFilters,
  enabled: boolean,
) {
  const search = new URLSearchParams({ patientId });
  if (filters.metric) search.set('metric', filters.metric);
  if (filters.from) search.set('from', filters.from);
  if (filters.to) search.set('to', filters.to);
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.observationTrends(patientId, filters),
      queryFn: () => requestEApi<ObservationTrendResponse>(`/health/observation-trends?${search}`),
      enabled: Boolean(patientId) && enabled,
      placeholderData: keepPreviousData,
    }),
  );
}

export function useCreateObservation(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateObservationInput) =>
      requestEApi<Observation>('/health/observations', { method: 'POST', body: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
        queryClient.invalidateQueries({ queryKey: ['health', 'observations', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['health', 'observation-trends', patientId] }),
      ]);
    },
  });
}

export function usePlans(patientId: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.plans(patientId),
      queryFn: () =>
        requestEApi<CarePlanDetail[]>(`/health/plans?patientId=${encodeURIComponent(patientId)}`),
      enabled: Boolean(patientId),
    }),
  );
}

export function usePlanVersions(planId: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: ['health', 'plan-versions', planId],
      queryFn: () =>
        requestEApi<CarePlanVersion[]>(`/health/plans/${encodeURIComponent(planId)}/versions`),
      enabled: Boolean(planId),
    }),
  );
}

export function useCreatePlan(patientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCarePlanInput) =>
      requestEApi<CarePlanDetail>('/health/plans', { method: 'POST', body: input }),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: healthKeys.plans(patientId) }),
        client.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
      ]),
  });
}

export function useUpdatePlan(patientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCarePlanInput }) =>
      requestEApi<CarePlanDetail>(`/health/plans/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: async (_, variables) =>
      Promise.all([
        client.invalidateQueries({ queryKey: healthKeys.plans(patientId) }),
        client.invalidateQueries({ queryKey: ['health', 'plan-versions', variables.id] }),
        client.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
      ]),
    onError: async (error, variables) => {
      if (!(error instanceof EApiError) || error.code !== 'STALE_VERSION') return;
      await Promise.all([
        client.invalidateQueries({ queryKey: healthKeys.plans(patientId) }),
        client.invalidateQueries({ queryKey: ['health', 'plan-versions', variables.id] }),
      ]);
    },
  });
}

export function useAssessments(patientId: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.assessments(patientId),
      queryFn: () =>
        requestEApi<HealthAssessment[]>(
          `/health/assessments?patientId=${encodeURIComponent(patientId)}`,
        ),
      enabled: Boolean(patientId),
    }),
  );
}

export function useCreateAssessment(patientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) =>
      requestEApi<HealthAssessment>('/health/assessments', { method: 'POST', body: input }),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: healthKeys.assessments(patientId) }),
  });
}

export function useReminders(patientId: string) {
  return useLocalizedEQuery(
    useQuery({
      queryKey: healthKeys.reminders(patientId),
      queryFn: () =>
        requestEApi<ReminderTask[]>(`/health/reminders?patientId=${encodeURIComponent(patientId)}`),
      enabled: Boolean(patientId),
    }),
  );
}

export function useCreateReminder(patientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReminderInput) =>
      requestEApi<ReminderTask>('/health/reminders', { method: 'POST', body: input }),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: healthKeys.reminders(patientId) }),
        client.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
      ]),
  });
}

function useReminderAction(patientId: string, action: 'cancel' | 'retry') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, commandId }: { id: string; commandId: string }) =>
      requestEApi<ReminderTask>(`/health/reminders/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: { commandId },
      }),
    onSuccess: async () =>
      Promise.all([
        client.invalidateQueries({ queryKey: healthKeys.reminders(patientId) }),
        client.invalidateQueries({ queryKey: healthKeys.overview(patientId) }),
      ]),
  });
}

export const useCancelReminder = (patientId: string) => useReminderAction(patientId, 'cancel');
export const useRetryReminder = (patientId: string) => useReminderAction(patientId, 'retry');
