import type { Patient } from './patients.js';
import type { Encounter } from './encounters.js';
import type { HealthAlert } from './health.js';

export const API_PREFIX = '/api/v1' as const;

export const DEMO_DATE = '2026-09-10' as const;

export type FeatureStatus = 'demo' | 'planned' | 'disabled';

export interface ApiMeta {
  requestId: string;
  mode: 'demo';
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: { code: string; message: string };
  meta: ApiMeta;
}

export interface Doctor {
  id: string;
  name: string;
  title: string;
  department: string;
  hospital: string;
  avatarInitials: string;
}

export interface Session {
  doctor: Doctor;
  mode: 'demo';
  demoDate: string;
  disclaimer: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  outcome: 'success' | 'denied' | 'planned';
  description: string;
}

export interface Feature {
  id: string;
  name: string;
  domain: 'platform' | 'patients' | 'encounters' | 'clinical' | 'health' | 'social';
  status: FeatureStatus;
  description: string;
  iteration: string;
}

export interface Dashboard {
  stats: {
    patients: number;
    pendingEncounters: number;
    pendingReviews: number;
    healthAlerts: number;
  };
  schedule: Encounter[];
  recentPatients: Patient[];
  healthAlerts: HealthAlert[];
  activity: AuditEvent[];
}

export interface ServiceHealth {
  status: 'ok';
  mode: 'demo';
  database: 'connected';
  demoDate: string;
}

/** Provider ports describe integrations; no live adapter is enabled in the scaffold. */

export type DoctorSession = Session;
export type DashboardData = Dashboard;
