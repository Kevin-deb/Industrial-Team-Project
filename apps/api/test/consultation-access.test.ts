import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/connection.js';
import { SqliteEncounterRepository } from '../src/encounters/repository.js';
import { SqlitePatientAccess, type RequestContext } from '../src/platform/access.js';

const owner: RequestContext = { actorId: 'doctor-demo-001', now: '2026-09-28T08:00:00.000Z' };
const reviewer: RequestContext = { actorId: 'doctor-demo-002', now: '2026-09-28T09:00:00.000Z' };
const outsider: RequestContext = { actorId: 'doctor-demo-003', now: reviewer.now };
const expert: RequestContext = { actorId: 'audit-expert-test', now: reviewer.now };
const input = {
  patientId: 'PAT-001',
  title: 'Scope regression consultation',
  specialty: 'General medicine',
  scheduledAt: '2026-09-28T09:00:00.000Z',
  summary: 'Synthetic test',
  reviewerId: reviewer.actorId,
  participantIds: [reviewer.actorId, expert.actorId],
  materials: [],
};
function fixture() {
  const db = openDatabase(':memory:');
  db.prepare(
    `INSERT INTO identities(id,display_name,title,department,hospital,avatar_initials)
    VALUES(?,?,?,?,?,?)`,
  ).run(expert.actorId, 'Test expert', 'Clinician', 'General', 'Test', 'T');
  db.prepare(
    'INSERT INTO identity_roles(identity_id,role_id) SELECT ?,role_id FROM identity_roles WHERE identity_id=?',
  ).run(expert.actorId, reviewer.actorId);
  db.prepare("DELETE FROM access_grants WHERE patient_id='PAT-001'").run();
  const repository = new SqliteEncounterRepository(db);
  const access = new SqlitePatientAccess(db);
  const task = repository.createConsultation(input, owner)!;
  assert.ok(task);
  const permanentGrant = (id: string, actorId: string) =>
    db
      .prepare(
        `
    INSERT INTO access_grants(id,identity_id,patient_id,scope,task_id,expires_at,revoked_at,created_at)
    VALUES(?,?,'PAT-001','patient:read',NULL,NULL,NULL,?)
  `,
      )
      .run(id, actorId, owner.now);
  return { db, repository, access, task, permanentGrant };
}

test('consultation room opens at the scheduled start while patient access still expires', () => {
  const { db, repository, access, task } = fixture();
  try {
    assert.equal(access.canReadPatient(input.patientId, reviewer), true);
    assert.equal(repository.consultationContext(task.id, reviewer), undefined);
    assert.equal(
      repository.findConsultationTask(task.id, reviewer)!.status,
      'requested',
      'the reviewer can review the request before the room opens',
    );
    assert.equal(repository.acceptConsultation(task.id, reviewer)!.status, 'scheduled');
    assert.equal(
      repository.consultationContext(task.id, {
        ...reviewer,
        now: '2026-09-28T08:59:59.999Z',
      }),
      undefined,
      'the room opens only at the scheduled start',
    );
    assert.equal(
      repository.consultationContext(task.id, reviewer)!.accessUntil,
      '2026-09-28T13:00:00.000Z',
    );
    assert.equal(
      access.canReadPatient(input.patientId, { ...reviewer, now: '2026-09-28T12:59:59.999Z' }),
      true,
    );
    const expired = { ...reviewer, now: '2026-09-28T13:00:00.000Z' };
    assert.equal(access.canReadPatient(input.patientId, expired), false);
    assert.equal(
      repository.consultationContext(task.id, expired)!.consultation.id,
      task.id,
      'the room remains available after the scheduled start even when patient grants expire',
    );
  } finally {
    db.close();
  }
});

test('an invited expert confirms participation only after reviewer approval', () => {
  const { db, repository, task } = fixture();
  try {
    const listed = repository.listConsultations(expert).find((item) => item.id === task.id)!;
    assert.equal(listed.status, 'requested');
    assert.equal(listed.canAccept, false);
    assert.equal(listed.canReview, false);
    assert.equal(listed.canConfirm, false);
    assert.equal(repository.acceptConsultation(task.id, expert), undefined);

    assert.equal(repository.acceptConsultation(task.id, reviewer)!.status, 'scheduled');
    const approved = repository.listConsultations(expert).find((item) => item.id === task.id)!;
    assert.equal(approved.status, 'scheduled');
    assert.equal(approved.canAccept, false);
    assert.equal(approved.canReview, false);
    assert.equal(approved.canConfirm, true);
    assert.equal(repository.consultationContext(task.id, expert), undefined);

    const confirmed = repository.confirmConsultationParticipation(task.id, expert)!;
    assert.equal(confirmed.status, 'scheduled');
    assert.equal(confirmed.canConfirm, false);
    assert.ok(repository.consultationContext(task.id, expert));
    assert.ok(
      db
        .prepare(
          'SELECT joined_at FROM consultation_participants WHERE consultation_id=? AND identity_id=?',
        )
        .get(task.id, expert.actorId)!.joined_at,
    );
    assert.equal(repository.completeConsultation(task.id, expert), undefined);
  } finally {
    db.close();
  }
});

test('the requester sees their consultation without broad patient access', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new SqliteEncounterRepository(db);
    const access = new SqlitePatientAccess(db);
    const zhou: RequestContext = {
      actorId: 'doctor-demo-002',
      now: '2026-09-12T15:00:00.000Z',
    };
    assert.equal(access.canReadPatient('PAT-004', zhou), false);
    const item = repository.listConsultations(zhou).find((entry) => entry.id === 'CON-IN-001');
    assert.ok(item);
    assert.equal(item.direction, 'sent');
    assert.equal(repository.consultationContext('CON-IN-001', zhou), undefined);
    db.prepare("UPDATE consultations SET status='scheduled' WHERE id='CON-IN-001'").run();
    assert.ok(
      repository
        .listConsultations({ ...zhou, now: '2026-10-10T12:00:00+08:00' })
        .some((entry) => entry.id === 'CON-IN-001'),
      'the requester keeps consultation history without broad patient access',
    );
  } finally {
    db.close();
  }
});

test('the reviewer keeps an approved consultation in history without broad patient access', () => {
  const db = openDatabase(':memory:');
  try {
    const repository = new SqliteEncounterRepository(db);
    const access = new SqlitePatientAccess(db);
    const zhou: RequestContext = {
      actorId: 'doctor-demo-002',
      now: '2026-09-11T09:00:00.000Z',
    };
    assert.equal(access.canReadPatient('PAT-002', zhou), false);
    assert.ok(repository.listConsultations(zhou).some((entry) => entry.id === 'CON-002'));
    assert.equal(repository.acceptConsultation('CON-002', zhou)!.status, 'scheduled');
    assert.ok(
      repository
        .listConsultations({ ...zhou, now: '2026-10-10T12:00:00+08:00' })
        .some((entry) => entry.id === 'CON-002'),
      'the reviewer keeps approved consultation history without broad patient access',
    );
  } finally {
    db.close();
  }
});

test('a patient reader outside the consultation cannot access content or change the task', () => {
  const { db, repository, access, task, permanentGrant } = fixture();
  try {
    permanentGrant('outside-patient-read', outsider.actorId);
    assert.equal(access.canReadPatient(input.patientId, outsider), true);
    repository.acceptConsultation(task.id, reviewer);
    assert.equal(repository.consultationContext(task.id, outsider), undefined);
    assert.equal(repository.findConsultationTask(task.id, outsider), undefined);
    assert.ok(!repository.listConsultations(outsider).some((item) => item.id === task.id));
    assert.equal(
      repository.addConsultationMessage(task.id, { body: 'Must not persist' }, outsider),
      undefined,
    );
    assert.equal(
      repository.addConsultationMaterial(task.id, { title: 'Must not persist' }, outsider),
      undefined,
    );
    assert.equal(repository.completeConsultation(task.id, outsider), undefined);
    assert.equal(
      db.prepare('SELECT status FROM consultations WHERE id=?').get(task.id)!.status,
      'scheduled',
    );
  } finally {
    db.close();
  }
});

test('temporary patient access cannot be delegated by creating another consultation', () => {
  const { db, repository, access } = fixture();
  try {
    assert.equal(access.canReadPatient(input.patientId, reviewer), true);
    const count = db.prepare('SELECT COUNT(*) count FROM consultations').get()!.count;
    assert.equal(
      repository.createConsultation(
        {
          ...input,
          scheduledAt: '2026-10-28T09:00:00Z',
          reviewerId: outsider.actorId,
          participantIds: [outsider.actorId],
        },
        reviewer,
      ),
      undefined,
    );
    assert.equal(db.prepare('SELECT COUNT(*) count FROM consultations').get()!.count, count);
    db.prepare('DELETE FROM consultation_participants WHERE identity_id=?').run(reviewer.actorId);
    assert.equal(
      access.canReadPatient(input.patientId, reviewer),
      false,
      'removing the participant invalidates its task grant',
    );
  } finally {
    db.close();
  }
});

test('completion is owner/reviewer-only and report failure rolls back closure and revocation', () => {
  const { db, repository, access, task, permanentGrant } = fixture();
  try {
    repository.acceptConsultation(task.id, reviewer);
    assert.ok(repository.addConsultationMessage(task.id, { body: 'Test discussion' }, reviewer));
    assert.equal(repository.completeConsultation(task.id, expert), undefined);
    db.exec(`CREATE TRIGGER reject_report BEFORE INSERT ON consultation_reports
      BEGIN SELECT RAISE(ABORT, 'test report persistence failure'); END;`);
    assert.throws(
      () => repository.completeConsultation(task.id, reviewer),
      /test report persistence failure/,
    );
    assert.equal(
      db.prepare('SELECT status FROM consultations WHERE id=?').get(task.id)!.status,
      'scheduled',
    );
    assert.equal(
      db.prepare('SELECT completed_at FROM consultations WHERE id=?').get(task.id)!.completed_at,
      null,
    );
    assert.equal(
      db
        .prepare(
          'SELECT COUNT(*) count FROM access_grants WHERE task_id=? AND revoked_at IS NOT NULL',
        )
        .get(task.id)!.count,
      0,
    );
    assert.equal(access.canReadPatient(input.patientId, reviewer), true);
    db.exec('DROP TRIGGER reject_report');
    const completed = repository.completeConsultation(task.id, reviewer)!;
    assert.ok(completed.body.includes('Test discussion'));
    assert.equal(access.canReadPatient(input.patientId, reviewer), false);
    assert.equal(repository.consultationContext(task.id, reviewer), undefined);
    assert.equal(repository.consultationContext(task.id, owner), undefined);
    permanentGrant('reviewer-permanent', reviewer.actorId);
    assert.equal(access.canReadPatient(input.patientId, reviewer), true);
    assert.equal(
      repository.consultationContext(task.id, reviewer),
      undefined,
      'independent patient access does not reopen a closed task',
    );
    const completedHistory = repository
      .listConsultations(reviewer)
      .find((item) => item.id === task.id);
    assert.equal(completedHistory?.status, 'completed');
    assert.equal(completedHistory?.report?.id, completed.id);
    assert.ok(completedHistory?.report?.body.includes('Test discussion'));
    const originalCompletedAt = db
      .prepare('SELECT completed_at FROM consultations WHERE id=?')
      .get(task.id)!.completed_at;
    assert.equal(
      repository.completeConsultation(task.id, { ...owner, now: '2026-09-28T12:00:00Z' }),
      undefined,
    );
    assert.equal(
      db.prepare('SELECT completed_at FROM consultations WHERE id=?').get(task.id)!.completed_at,
      originalCompletedAt,
    );
  } finally {
    db.close();
  }
});

test('a participant who left loses task and reviewer access even while its grant row remains', () => {
  const { db, repository, access, task, permanentGrant } = fixture();
  try {
    repository.acceptConsultation(task.id, reviewer);
    db.prepare(
      'UPDATE consultation_participants SET left_at=? WHERE consultation_id=? AND identity_id=?',
    ).run(reviewer.now, task.id, reviewer.actorId);
    assert.ok(
      db
        .prepare(
          'SELECT 1 FROM access_grants WHERE task_id=? AND identity_id=? AND revoked_at IS NULL',
        )
        .get(task.id, reviewer.actorId),
      'the old grant is still stored for history',
    );
    assert.equal(access.canReadPatient(input.patientId, reviewer), false);
    assert.equal(repository.consultationContext(task.id, reviewer), undefined);
    assert.equal(repository.acceptConsultation(task.id, reviewer), undefined);
    assert.equal(repository.completeConsultation(task.id, reviewer), undefined);
    permanentGrant('departed-reviewer-patient-access', reviewer.actorId);
    assert.equal(
      access.canReadPatient(input.patientId, reviewer),
      true,
      'independent patient access remains intact',
    );
    assert.equal(repository.consultationContext(task.id, reviewer), undefined);
    assert.equal(repository.acceptConsultation(task.id, reviewer), undefined);
    assert.equal(repository.completeConsultation(task.id, reviewer), undefined);
    const ownerView = repository.consultationContext(task.id, {
      ...owner,
      now: '2026-09-28T09:00:00.000Z',
    })!;
    assert.ok(!ownerView.participants.some((person) => person.id === reviewer.actorId));
    assert.equal(ownerView.consultation.reviewerId, undefined);
    db.prepare(
      'UPDATE consultation_participants SET left_at=? WHERE consultation_id=? AND identity_id=?',
    ).run(owner.now, task.id, owner.actorId);
    assert.equal(access.canReadPatient(input.patientId, owner), true);
    assert.ok(
      repository.consultationContext(task.id, { ...owner, now: '2026-09-28T09:00:00.000Z' }),
      'the requester keeps its own authorized task access',
    );
    assert.ok(
      repository.completeConsultation(task.id, { ...owner, now: '2026-09-28T09:00:00.000Z' }),
    );
  } finally {
    db.close();
  }
});
