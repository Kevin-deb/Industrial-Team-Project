import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuditEvent, AuditQuery } from '@doctor/contracts';
import type { RequestContext } from './access.js';
import type { PlatformRepository } from './repository.js';

const maxExportRows = 50_000;
const dateTime = {
  type: 'string',
  maxLength: 35,
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$',
};
const filterProperties = {
  q: { type: 'string', maxLength: 200 },
  action: { type: 'string', maxLength: 100 },
  domain: { type: 'string', minLength: 1, maxLength: 80 },
  outcome: { type: 'string', enum: ['success', 'denied', 'planned', 'failed'] },
  from: dateTime,
  to: dateTime,
};
const querySchema = (paged: boolean) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    ...filterProperties,
    ...(paged
      ? {
          page: { type: 'integer', minimum: 1, maximum: 1_000_000 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        }
      : {}),
  },
});
const fail = (
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) =>
  reply
    .code(status)
    .send({ error: { code, message }, meta: { requestId: request.id, mode: 'demo' } });

function validDate(value: string | undefined): boolean {
  if (!value) return true;
  if (!Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  );
}
function validRange(query: AuditQuery): boolean {
  return (
    validDate(query.from) &&
    validDate(query.to) &&
    (!query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to))
  );
}

/** RFC 4180 quoting and spreadsheet-formula neutralisation apply to every exported cell. */
export function auditCsv(events: AuditEvent[]): string {
  const cell = (value: string) => {
    const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const columns: (keyof AuditEvent)[] = [
    'id',
    'occurredAt',
    'actorId',
    'actorName',
    'action',
    'targetType',
    'targetId',
    'outcome',
    'description',
  ];
  return (
    '\uFEFF' +
    [
      columns.map(cell).join(','),
      ...events.map((event) => columns.map((key) => cell(event[key])).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}

export function registerAuditRoutes(
  app: FastifyInstance,
  deps: { platform: PlatformRepository; context: () => RequestContext },
) {
  app.get<{ Querystring: AuditQuery }>(
    '/api/v1/audit',
    {
      schema: { querystring: querySchema(true) },
    },
    async (request, reply) => {
      if (!validRange(request.query))
        return fail(
          request,
          reply,
          400,
          'INVALID_AUDIT_RANGE',
          '请填写有效的审计时间范围，开始时间不能晚于结束时间。',
        );
      // Identity comes only from the verified request context, never a query or caller header.
      const result = deps.platform.queryAudit(deps.context().actorId, request.query);
      const { items, ...page } = result;
      return { data: items, meta: { requestId: request.id, mode: 'demo', ...page } };
    },
  );
  app.get<{ Querystring: AuditQuery }>(
    '/api/v1/audit/export',
    {
      schema: { querystring: querySchema(false) },
    },
    async (request, reply) => {
      const context = deps.context();
      if (!validRange(request.query)) {
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'audit.export',
          targetType: 'audit',
          targetId: 'self',
          outcome: 'denied',
          description: 'Audit export rejected: invalid time range.',
        });
        return fail(
          request,
          reply,
          400,
          'INVALID_AUDIT_RANGE',
          '请填写有效的审计时间范围，开始时间不能晚于结束时间。',
        );
      }
      try {
        const events = deps.platform.exportAudit(context.actorId, request.query, maxExportRows);
        if (events.length > maxExportRows) {
          deps.platform.recordAccess({
            actorId: context.actorId,
            action: 'audit.export',
            targetType: 'audit',
            targetId: 'self',
            outcome: 'denied',
            description: 'Audit export rejected: row limit exceeded.',
          });
          return fail(
            request,
            reply,
            413,
            'AUDIT_EXPORT_TOO_LARGE',
            '导出记录超过五万条，请缩小时间范围。',
          );
        }
        const content = auditCsv(events);
        deps.platform.recordAccess({
          actorId: context.actorId,
          action: 'audit.export',
          targetType: 'audit',
          targetId: 'self',
          outcome: 'success',
          description: `Audit CSV prepared; rows=${events.length}; from=${request.query.from ?? 'all'}; to=${request.query.to ?? 'all'}.`,
        });
        const filename =
          'carelink-audit-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .header('Cache-Control', 'no-store')
          .header('X-Content-Type-Options', 'nosniff')
          .send(content);
      } catch (error) {
        try {
          deps.platform.recordAccess({
            actorId: context.actorId,
            action: 'audit.export',
            targetType: 'audit',
            targetId: 'self',
            outcome: 'failed',
            description: 'Audit CSV preparation failed.',
          });
        } catch {
          /* Preserve the original failure if the audit database is unavailable. */
        }
        throw error;
      }
    },
  );
}
