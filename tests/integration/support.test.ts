import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { childFixture } from '../helpers/children.js';
import { buildApp } from '../../apps/api/src/app.js';
import { assertSchemaCurrent, createDatabase } from '@nursery/db';
import { BACKUP_RUN_LOCK } from '../../apps/api/src/modules/support/backup.js';
import { createSupportJobs } from '../../apps/api/src/modules/support/worker.js';

let f: Awaited<ReturnType<typeof childFixture>>; afterEach(async () => { await f?.close(); });
const KEY = 'ef'.repeat(32);

it('Superadmin support tools: capability gating, reserved restore capability, reauthenticated restore initiation, audit and account search, archival preview', async () => {
  f = await childFixture(); const backupDir = await mkdtemp(join(tmpdir(), 'nursery-support-'));
  try {
    const database = createDatabase(f.config.databaseUrl);
    const app = buildApp({ ...f.config, backup: { backupDir, encryptionKey: KEY, target: 'none', schedule: '0 2 * * *', retention: { daily: 7, weekly: 4, manual: 4 }, restoreValidationDatabaseUrl: null, restoreValidationFilesDir: null } }, database);
    try {
      const support = app.support; const root = await app.auth.login('licensing-system', f.password);
      await expect(assertSchemaCurrent(database.pool, f.config.installationId)).resolves.toBe('0023_support_backups.sql');
      await expect(assertSchemaCurrent(database.pool, crypto.randomUUID())).rejects.toThrow('refusing to start');
      // support.restore is reserved: no editable role can carry it, and staff never receive the support tools.
      await expect(f.app.organization.save(root.token, 'roles', { name: 'Sneaky', capabilities: ['support.restore'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await database.pool.query("select count(*)::int as n from role_capabilities where capability_key='support.restore'")).rows[0].n).toBe(0);
      const staff = await f.staff([f.a.id]);
      for (const call of [() => support.status(staff.token), () => support.backups(staff.token), () => support.audit_(staff.token, {}), () => support.accounts(staff.token, { query: 'x' }), () => support.requestBackup(staff.token, { reason: 'no' }), () => support.restoreValidations(staff.token), () => support.requestRestoreValidation(staff.token, { backupRunId: crypto.randomUUID(), operatorPassword: staff.password, confirmArchiveName: 'x', reason: 'no' })]) await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const status = await support.status(root.token);
      expect(status.installation).toMatchObject({ id: f.config.installationId, schemaVersion: '0023_support_backups.sql', pendingMigrations: 0, licenseStatus: 'ACTIVE' });
      expect(status.worker).toEqual({ lastSeenAt: null, releaseVersion: null, ageSeconds: null, healthy: false }); expect(status.backups).toMatchObject({ configured: true, offsiteConfigured: false, last: null, lastSuccessfulAt: null, restoreValidationConfigured: false });
      // Manual backup request: recorded once, duplicate refused while pending, visible in the list.
      const requested = await support.requestBackup(root.token, { reason: 'before role change' }); expect(requested).toMatchObject({ kind: 'MANUAL', status: 'REQUESTED', requestedBy: root.account.id });
      await expect(support.requestBackup(root.token, { reason: 'again' })).rejects.toMatchObject({ messageKey: 'support.backupPending' });
      expect((await support.backups(root.token)).map((r) => r.id)).toEqual([requested.id]);
      // Restore initiation needs the SYSTEM password again and the exact archive name; a pending request is not restorable.
      await expect(support.requestRestoreValidation(root.token, { backupRunId: requested.id, operatorPassword: 'wrong password entirely', confirmArchiveName: 'x', reason: 'check' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(support.requestRestoreValidation(root.token, { backupRunId: requested.id, operatorPassword: f.password, confirmArchiveName: 'x', reason: 'check' })).rejects.toMatchObject({ messageKey: 'support.backupNotRestorable' });
      await database.pool.query("update backup_runs set status='SUCCEEDED',started_at=now(),finished_at=now(),archive_name='backup-test-20260915T000000Z-manual-abcdef12.tar.enc',archive_bytes=10,archive_sha256=repeat('0',64),manifest='{}'::jsonb where id=$1", [requested.id]);
      await expect(support.requestRestoreValidation(root.token, { backupRunId: requested.id, operatorPassword: f.password, confirmArchiveName: 'backup-other.tar.enc', reason: 'check' })).rejects.toMatchObject({ messageKey: 'support.confirmationMismatch' });
      const validation = await support.requestRestoreValidation(root.token, { backupRunId: requested.id, operatorPassword: f.password, confirmArchiveName: 'backup-test-20260915T000000Z-manual-abcdef12.tar.enc', reason: 'quarterly check' });
      expect(validation).toMatchObject({ status: 'REQUESTED', backupRunId: requested.id, targetLabel: null });
      await expect(support.requestRestoreValidation(root.token, { backupRunId: requested.id, operatorPassword: f.password, confirmArchiveName: 'backup-test-20260915T000000Z-manual-abcdef12.tar.enc', reason: 'twice' })).rejects.toMatchObject({ messageKey: 'support.restorePending' });
      expect((await support.restoreValidations(root.token))[0]).toMatchObject({ id: validation.id, status: 'REQUESTED' });
      // Audit search spans authentication, licensing and support events and never carries passwords.
      const audit = await support.audit_(root.token, { query: 'restore_validation', limit: 10 });
      expect(audit[0]).toMatchObject({ source: 'support', event: 'support.restore_validation_requested', actorUsername: 'licensing-system', targetId: validation.id }); expect(JSON.stringify(audit)).not.toContain(f.password);
      expect((await support.audit_(root.token, { query: 'auth.login' })).every((e) => e.source === 'auth')).toBe(true);
      expect((await support.audit_(root.token, { from: '2099-01-01' })).length).toBe(0);
      // Account lookup by username or ID with reservation and status facts.
      const family = await f.children.onboard(root.token, f.family('SUP'));
      const found = await support.accounts(root.token, { query: 'parent-sup' }); expect(found).toEqual([expect.objectContaining({ username: 'parent-sup', kind: 'GUARDIAN', status: 'ACTIVE', reservationActive: true, mustChangePassword: true })]);
      expect((await support.accounts(root.token, { query: found[0].id }))[0].id).toBe(found[0].id);
      // Archival preview counts dependents without deleting anything.
      const dependents = await support.childDependents(root.token, family.childIds[0]);
      expect(dependents).toMatchObject({ code: 'SUP', status: 'ACTIVE', guardianLinks: 1, obligations: 0, outstandingPiastres: '0', documents: 0, attendanceRecords: 0 });
      await expect(support.childDependents(root.token, crypto.randomUUID())).rejects.toMatchObject({ code: 'FORBIDDEN' });
      // A restart does not touch a genuinely locked run, then classifies abandoned rows and removes only bounded crash artifacts.
      const interruptedBackup = crypto.randomUUID(); const interruptedRestore = crypto.randomUUID();
      await database.pool.query("insert into backup_runs(id,kind,status,requested_by,started_at,installation_id,release_version) values($1,'MANUAL','RUNNING',$2,now(),$3,'test')", [interruptedBackup, root.account.id, f.config.installationId]);
      await database.pool.query("insert into restore_validations(id,backup_run_id,requested_by,status,started_at) values($1,$2,$3,'RUNNING',now())", [interruptedRestore, requested.id, root.account.id]);
      const partial = 'backup-restart-test.tar.enc.partial'; await writeFile(join(backupDir, partial), 'partial');
      const holder = await database.pool.connect(); await holder.query('select pg_advisory_lock($1)', [BACKUP_RUN_LOCK]);
      const jobs = createSupportJobs(database, { ...f.config, backup: { backupDir, encryptionKey: KEY, target: 'none', schedule: '0 2 * * *', retention: { daily: 7, weekly: 4, manual: 4 }, restoreValidationDatabaseUrl: null, restoreValidationFilesDir: null } }, () => undefined);
      expect(await jobs.recoverInterrupted()).toEqual({ backups: 0, restores: 0, partials: 0 });
      expect((await database.pool.query('select status from backup_runs where id=$1', [interruptedBackup])).rows[0].status).toBe('RUNNING');
      await holder.query('select pg_advisory_unlock_all()'); holder.release();
      expect(await jobs.recoverInterrupted()).toEqual({ backups: 1, restores: 1, partials: 1 });
      expect((await database.pool.query('select status,error_code from backup_runs where id=$1', [interruptedBackup])).rows[0]).toEqual({ status: 'FAILED', error_code: 'WORKER_RESTARTED' });
      expect((await database.pool.query('select status,error_code from restore_validations where id=$1', [interruptedRestore])).rows[0]).toEqual({ status: 'FAILED', error_code: 'WORKER_RESTARTED' });
      expect(await readdir(backupDir)).not.toContain(partial);
      expect((await database.pool.query("select event from support_audit_events order by created_at")).rows.map((r) => r.event)).toEqual(expect.arrayContaining(['support.status_viewed', 'support.backup_requested', 'support.restore_validation_requested', 'support.audit_searched', 'support.account_searched', 'support.child_dependents_viewed']));
    } finally { await app.close(); }
  } finally { await rm(backupDir, { recursive: true, force: true }); }
}, 60_000);
