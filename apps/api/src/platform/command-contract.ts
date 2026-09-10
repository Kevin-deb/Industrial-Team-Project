import type { Feature } from '@doctor/contracts';
import type { RouteHandlerMethod } from 'fastify';

export interface PlannedCommand {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  domain: Feature['domain'];
  capability: string;
  tables: readonly string[];
  providers: readonly string[];
  /** A domain may replace its planned handler after its acceptance checks pass. */
  handler?: RouteHandlerMethod;
}
