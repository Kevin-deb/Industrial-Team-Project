import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SQLInputValue } from 'node:sqlite';
import { createApp } from '../apps/api/src/app.js';
import { openDatabase } from '../apps/api/src/database/connection.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const values = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (
    !name ||
    !['--seconds', '--concurrency', '--interval-ms', '--output'].includes(name) ||
    value === undefined ||
    values.has(name)
  )
    throw new Error('Invalid load-test arguments.');
  values.set(name, value);
}
const seconds = Number(values.get('--seconds') ?? 60);
const intervalMs = Number(values.get('--interval-ms') ?? 20);
const concurrencies = (values.get('--concurrency') ?? '1,5,10').split(',').map(Number);
if (
  !Number.isFinite(seconds) ||
  seconds < 0.2 ||
  seconds > 300 ||
  !Number.isInteger(intervalMs) ||
  intervalMs < 0 ||
  intervalMs > 1000 ||
  !concurrencies.length ||
  concurrencies.some((number) => !Number.isInteger(number) || number < 1 || number > 20)
)
  throw new Error('Use 0.2–300 seconds, 0–1000 ms intervals and concurrency values 1–20.');
const output = resolve(repository, values.get('--output') ?? 'runtime/platform-load-report.json');
const count = (database: ReturnType<typeof openDatabase>, table: string) =>
  Number(database.prepare('SELECT COUNT(*) n FROM ' + table).get()!.n);
const delay = (milliseconds: number) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const percentile = (numbers: number[], fraction: number) => {
  const ordered = [...numbers].sort((left, right) => left - right);
  return (
    Math.round((ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? 0) * 100) / 100
  );
};
const database = openDatabase(':memory:');
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  // Only this process's in-memory database is expanded. No daily profile or network listener is used.
  const template = database.prepare("SELECT * FROM patients WHERE id='PAT-001'").get() as Record<
    string,
    SQLInputValue
  >;
  const columns = Object.keys(template);
  const insertPatient = database.prepare(
    'INSERT INTO patients(' +
      columns.map((column) => '"' + column + '"').join(',') +
      ') VALUES(' +
      columns.map(() => '?').join(',') +
      ')',
  );
  const initialPatients = count(database, 'patients');
  const insertVersion = database.prepare(
    'INSERT INTO patient_archive_versions(id,patient_id,version,payload_json,authored_by,created_at,change_reason) VALUES(?,?,1,?,?,?,?)',
  );
  const firstSnapshot = JSON.parse(
    String(
      database
        .prepare(
          "SELECT payload_json FROM patient_archive_versions WHERE patient_id='PAT-001' ORDER BY version LIMIT 1",
        )
        .get()!.payload_json,
    ),
  );
  database.exec('BEGIN');
  try {
    for (let index = initialPatients; index < 1000; index++) {
      const id = 'LOAD-' + String(index).padStart(5, '0');
      const name = 'Synthetic load patient ' + index;
      const row = { ...template, id, name, assigned_doctor_id: 'doctor-demo-001' };
      insertPatient.run(
        ...columns.map((column) => row[column as keyof typeof row] as SQLInputValue),
      );
      insertVersion.run(
        'LOAD-V-' + index,
        id,
        JSON.stringify({ ...firstSnapshot, id, name, version: 1 }),
        'doctor-demo-001',
        '2026-09-28T00:00:00.000Z',
        'Synthetic load fixture',
      );
    }
    const insertAudit = database.prepare(
      'INSERT INTO audit_events(id,actor_id,action,target_type,target_id,occurred_at,outcome,description) VALUES(?,?,?,?,?,?,?,?)',
    );
    for (let index = count(database, 'audit_events'); index < 10000; index++)
      insertAudit.run(
        'LOAD-A-' + index,
        'doctor-demo-001',
        'load.baseline',
        'patient',
        'PAT-001',
        new Date(Date.UTC(2026, 8, 28, 0, 0, index)).toISOString(),
        'success',
        'Synthetic load baseline',
      );
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  for (const key of Object.keys(process.env))
    if (key.startsWith('CARELINK_SMTP_')) delete process.env[key];
  app = await createApp({ database, runtime: 'local-demo', reminderPollingMs: 0 });
  const initialData = {
    patients: count(database, 'patients'),
    auditEvents: count(database, 'audit_events'),
  };
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-login',
    payload: { account: 'lin.zhiyuan', password: '123456' },
  });
  if (login.statusCode !== 201) throw new Error('Real-session setup failed: ' + login.statusCode);
  const headers = { authorization: 'Bearer ' + login.json().data.token };
  const stages = [];
  let sequence = 0;
  const writeBodies = new Set<string>();
  let totalSuccessfulWrites = 0;
  for (const concurrency of concurrencies) {
    const start = performance.now();
    const until = start + seconds * 1000;
    const cpuStart = process.cpuUsage();
    const rssStart = process.memoryUsage().rss;
    let rssPeak = rssStart;
    const durations: number[] = [];
    const readDurations: number[] = [];
    const writeDurations: number[] = [];
    const statuses: Record<string, number> = {};
    const errors: Array<{ kind: string; status: number; code: string }> = [];
    let unexpectedErrors = 0;
    let writes = 0;
    let successfulWrites = 0;
    let reads = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (performance.now() < until) {
          const requestNumber = sequence++;
          const selection = requestNumber % 20;
          const kind =
            selection === 0 ? 'profile-write' : selection < 4 ? 'audit-read' : 'patient-read';
          const bio = 'Synthetic load write ' + requestNumber;
          const requestStart = performance.now();
          const result =
            kind === 'profile-write'
              ? await app!.inject({
                  method: 'PUT',
                  url: '/api/v1/settings/profile',
                  headers,
                  payload: {
                    phone: '13800009999',
                    specialty: 'Synthetic load testing',
                    outpatientLocation: 'Offline load test',
                    bio,
                  },
                })
              : await app!.inject({
                  method: 'GET',
                  headers,
                  url:
                    kind === 'audit-read'
                      ? '/api/v1/audit?page=1&pageSize=20'
                      : '/api/v1/patients?pageSize=20&page=' + (1 + (requestNumber % 40)),
                });
          const elapsed = performance.now() - requestStart;
          durations.push(elapsed);
          (kind === 'profile-write' ? writeDurations : readDurations).push(elapsed);
          statuses[String(result.statusCode)] = (statuses[String(result.statusCode)] ?? 0) + 1;
          if (kind === 'profile-write') writes++;
          else reads++;
          let response: { data?: any; error?: { code?: string } };
          try {
            response = result.json();
          } catch {
            response = { error: { code: 'NON_JSON_RESPONSE' } };
          }
          const responseValid =
            result.statusCode === 200 &&
            (kind === 'profile-write' ? response.data?.bio === bio : Array.isArray(response.data));
          if (!responseValid) {
            unexpectedErrors++;
            if (errors.length < 20)
              errors.push({
                kind,
                status: result.statusCode,
                code: response.error?.code ?? 'INVALID_RESULT',
              });
          } else if (kind === 'profile-write') {
            successfulWrites++;
            totalSuccessfulWrites++;
            writeBodies.add(bio);
          }
          rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
          if (intervalMs) await delay(intervalMs);
        }
      }),
    );
    const elapsedSeconds = (performance.now() - start) / 1000;
    const finalProfile = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/profile',
      headers,
    });
    const persistedProfileMatchesSuccessfulWrite =
      finalProfile.statusCode === 200 && writeBodies.has(finalProfile.json().data.bio);
    const persistedWriteAuditCount = Number(
      database
        .prepare("SELECT COUNT(*) n FROM audit_events WHERE action='settings.profile.update'")
        .get()!.n,
    );
    const cpu = process.cpuUsage(cpuStart);
    const stage = {
      concurrency,
      requestedSeconds: seconds,
      elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
      requests: durations.length,
      reads,
      writes,
      successfulWrites,
      unexpectedErrors,
      errors,
      statuses,
      completedRequestsPerSecond: Math.round((durations.length / elapsedSeconds) * 100) / 100,
      latencyMs: {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max:
          Math.round(durations.reduce((maximum, value) => Math.max(maximum, value), 0) * 100) / 100,
      },
      readLatencyMs: { p50: percentile(readDurations, 0.5), p95: percentile(readDurations, 0.95) },
      writeLatencyMs: {
        p50: percentile(writeDurations, 0.5),
        p95: percentile(writeDurations, 0.95),
      },
      memoryBytes: {
        rssStart,
        rssPeakSampled: rssPeak,
        rssEnd: process.memoryUsage().rss,
        heapUsedEnd: process.memoryUsage().heapUsed,
      },
      cpuMilliseconds: { user: cpu.user / 1000, system: cpu.system / 1000 },
      persistence: {
        persistedProfileMatchesSuccessfulWrite,
        persistedWriteAuditCount,
        expectedWriteAuditCount: totalSuccessfulWrites,
        allWritesAudited: persistedWriteAuditCount === totalSuccessfulWrites,
      },
      dataAfterStage: {
        patients: count(database, 'patients'),
        auditEvents: count(database, 'audit_events'),
      },
      proposedDemoGatePassed:
        unexpectedErrors === 0 &&
        percentile(readDurations, 0.95) <= 500 &&
        persistedProfileMatchesSuccessfulWrite &&
        persistedWriteAuditCount === totalSuccessfulWrites,
    };
    stages.push(stage);
    console.log(
      JSON.stringify({
        concurrency,
        requests: stage.requests,
        unexpectedErrors,
        readP95Ms: stage.readLatencyMs.p95,
        writes: successfulWrites,
        gatePassed: stage.proposedDemoGatePassed,
      }),
    );
  }
  let commit = 'unavailable';
  let dirtyWorkspace = true;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      windowsHide: true,
      encoding: 'utf8',
    }).trim();
    dirtyWorkspace = !!execFileSync('git', ['status', '--porcelain'], {
      cwd: repository,
      windowsHide: true,
      encoding: 'utf8',
    }).trim();
  } catch {
    /* Keep explicit unavailable provenance if Git is absent. */
  }
  const report = {
    createdAt: new Date().toISOString(),
    commit,
    dirtyWorkspace,
    methodology: {
      transport: 'Fastify app.inject in one Node.js process; no HTTP listener',
      storage: 'isolated in-memory SQLite; no daily profile',
      authentication: 'one real password-login session',
      workload: '80% patient pagination, 15% scoped audit pagination, 5% profile writes',
      pacingMillisecondsPerWorker: intervalMs,
      concurrencyStages: concurrencies,
      secondsPerStage: seconds,
      limitations:
        'Paced local service verification. Not maximum throughput, desktop UI timing, durable-disk throughput, or hospital multi-user capacity. Clinical concurrent-version behavior is covered by separate functional tests.',
      proposedDemoReadP95LimitMs: 500,
    },
    machine: {
      os: platform(),
      osRelease: release(),
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      node: process.version,
    },
    initialData,
    stages,
    foreignKeyViolations: database.prepare('PRAGMA foreign_key_check').all().length,
    allStagesPassed: stages.every((stage) => stage.proposedDemoGatePassed),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Report saved: ' + output);
  if (!report.allStagesPassed || report.foreignKeyViolations !== 0) process.exitCode = 1;
} finally {
  await app?.close();
  database.close();
}
