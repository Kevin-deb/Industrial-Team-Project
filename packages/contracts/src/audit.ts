import type { ApiMeta, AuditEvent } from './platform.js';

export type AuditOutcome = 'success' | 'denied' | 'planned' | 'failed';
export interface AuditQuery {
  q?: string;
  action?: string;
  domain?: string;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export interface AuditSummary {
  success: number;
  denied: number;
  planned: number;
  failed: number;
}
export interface AuditPageMeta extends ApiMeta {
  page: number;
  pageSize: number;
  total: number;
  summary: AuditSummary;
  domains: string[];
}
export interface AuditPage {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  summary: AuditSummary;
  domains: string[];
}
