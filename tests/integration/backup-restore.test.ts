import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { config as loadDotenv } from 'dotenv';
import { afterEach, expect, it } from 'vitest';
import { createDatabase, schemaStatus } from '@nursery/db';
import { financeFixture, reconcileFinance } from '../helpers/finance.js';
import { buildApp } from '../../apps/api/src/app.js';
import { BackupService, BACKUP_RUN_LOCK } from '../../apps/api/src/modules/support/backup.js';
import { restoreArchive, RestoreFailure, RestoreValidationService } from '../../apps/api/src/modules/support/restore.js';
import { sha256File } from '../../apps/api/src/modules/support/archive-crypto.js';
import { FILE_LOCK } from '../../apps/api/src/modules/children/private-store.js';
import { createSupportJobs } from '../../apps/api/src/modules/support/worker.js';
import { startBillingWorker } from '../../apps/worker/src/billing.js';
import { installSupportWorker } from '../../apps/worker/src/support.js';

loadDotenv({ quiet: true });
const adminUrl = process.env.DATABASE_URL; if (!adminUrl) throw new Error('DATABASE_URL required: backup/restore checks need real PostgreSQL and pg_dump/pg_restore');
const admin = createDatabase(adminUrl); const databases: string[] = []; const directories: string[] = []; const closers: (() => Promise<void>)[] = [];
// Real databases (not schemas): pg_dump and pg_restore operate on whole databases, exactly like a deployment.
async function freshDatabase(label: string) {
  const name = `nursery_bk_${label}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`; await admin.pool.query(`create database ${name}`); databases.push(name);
  const url = new URL(adminUrl!); url.pathname = `/${name}`; return { name, url };
}
async function directory(label: string) { const path = await mkdtemp(join(tmpdir(), `nursery-${label}-`)); directories.push(path); return path; }
async function command(args: string[], environment: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: process.cwd(), env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); }); child.stderr.on('data', (chunk) => { stderr += String(chunk); }); child.once('error', reject); child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}
afterEach(async () => {
  for (const close of closers.splice(0)) await close().catch(() => undefined);
  for (const name of databases.splice(0)) {
    if (!/^nursery_bk_[a-z]+_[a-f0-9]{12}$/.test(name)) throw new Error('Invalid fixture database');
    // Closed pools may still be finishing their Terminate messages; wait for them before dropping (force only as a last resort).
    for (let i = 0; i < 50 && Number((await admin.pool.query('select count(*)::int as n from pg_stat_activity where datname=$1', [name])).rows[0].n) > 0; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    await admin.pool.query(`drop database if exists ${name} with (force)`);
  }
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
}, 60_000);
const KEY = 'ab'.repeat(32); const OTHER_KEY = 'cd'.repeat(32);
const sum = async (db: ReturnType<typeof createDatabase>, sql: string) => (await db.pool.query<{ v: string }>(sql)).rows[0].v;

it('A38: backs up a synthetic installation under the file barrier (overlap skipped, failure visible) and restores it into an isolated target with login, files, debt, treasury and settings intact', async () => {
  const source = await freshDatabase('src'); const originalUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = source.url.toString();
  let f: Awaited<ReturnType<typeof financeFixture>>; try { f = await financeFixture(); } finally { process.env.DATABASE_URL = originalUrl; }
  closers.push(() => f.close());
  // Synthetic installation: a child with a private document, a 10,000 charge with 4,000 collected, branded settings.
  const child = await f.child('BK1'); const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#ff88aa' } }).png().toBuffer();
  const document = await f.documents.upload(f.root.token, child.childId, { name: 'Birth certificate', expiresOn: null, mimeType: 'image/png', contentBase64: png.toString('base64') });
  const charge = await f.charge(child.childId, '10000'); await f.payments.collect(f.root.token, f.collect(charge.installmentIds[0], '4000'));
  const settings = await f.licensing.nurserySettings(f.root.token);
  await f.licensing.saveNurserySettings(f.root.token, { expectedVersion: settings.version, value: { name: 'Backup Nursery', logoPath: null, contactPhone: '01000000000', contactEmail: null, theme: settings.theme } });
  const sourceDebt = await sum(f.database, 'select coalesce(sum(remaining),0)::text as v from installment_balances'); const sourceCash = await sum(f.database, 'select coalesce(sum(amount),0)::text as v from treasury_movements');
  expect(sourceDebt).toBe('6000'); expect(sourceCash).toBe('4000');
  const backupDir = await directory('backups'); const offsite = await directory('offsite');
  const events: string[] = [];
  const service = new BackupService(f.database, { databaseUrl: f.config.databaseUrl, privateFilesDir: f.config.privateFilesDir, backupDir, encryptionKey: KEY, installationId: f.config.installationId, releaseVersion: 'test-release', target: `directory:${offsite}`, retention: { daily: 7, weekly: 4, manual: 1 }, log: (level, message, data) => events.push(`${level}:${message}:${JSON.stringify(data ?? {})}`) });
  // An in-flight upload transaction holds the shared file barrier: the backup must wait for it before exporting its snapshot.
  const holder = await f.database.pool.connect(); await holder.query('select pg_advisory_lock_shared($1)', [FILE_LOCK]);
  const first = await service.request('MANUAL', f.root.account.id, 'operator test');
  const running = service.execute(first, false);
  await expect.poll(async () => (await f.database.pool.query('select status from backup_runs where id=$1', [first])).rows[0].status, { timeout: 10_000 }).toBe('RUNNING');
  await new Promise((resolve) => setTimeout(resolve, 500)); expect(await readdir(backupDir)).toEqual([expect.stringMatching(/\.partial$/)]);
  // A scheduled run arriving while another run is active is recorded as SKIPPED/OVERLAP, never silently dropped or doubled.
  expect((await service.runScheduled()).status).toBe('SKIPPED');
  expect((await f.database.pool.query("select error_code from backup_runs where kind='SCHEDULED'")).rows).toEqual([{ error_code: 'OVERLAP' }]);
  await holder.query('select pg_advisory_unlock_all()'); holder.release();
  expect(await running).toBe('SUCCEEDED');
  const run = (await f.database.pool.query('select * from backup_runs where id=$1', [first])).rows[0];
  expect(run).toMatchObject({ status: 'SUCCEEDED', kind: 'MANUAL', release_version: 'test-release', schema_version: '0023_support_backups.sql', error_code: null }); expect(run.offsite_copied_at).not.toBeNull();
  expect(run.manifest.counts).toEqual({ files: 1, fileBytes: expect.any(Number) }); expect(run.manifest.files).toBeUndefined();
  const archivePath = join(backupDir, run.archive_name);
  expect(await sha256File(archivePath)).toBe(run.archive_sha256); expect(await sha256File(join(offsite, run.archive_name))).toBe(run.archive_sha256);
  const sidecar = JSON.parse(await readFile(`${archivePath}.manifest.json`, 'utf8'));
  expect(sidecar).toMatchObject({ format: 'nursery-backup/1', installationId: f.config.installationId, archiveSha256: run.archive_sha256, files: [{ namespace: 'child-documents', bytes: expect.any(Number) }] });
  expect(JSON.stringify(sidecar)).not.toContain('postgres'); expect(events.join('\n')).not.toContain(f.config.databaseUrl);
  // A broken pg_dump path fails visibly with a classification only; no partial archive or secret is left behind.
  const broken = new BackupService(f.database, { ...service.options, environment: { ...process.env, PG_BIN_DIR: join(backupDir, 'missing-bin') } });
  const failedId = await broken.request('MANUAL', f.root.account.id, 'broken tool'); expect(await broken.execute(failedId, false)).toBe('FAILED');
  const failed = (await f.database.pool.query('select status,error_code,archive_name from backup_runs where id=$1', [failedId])).rows[0]; expect(failed).toEqual({ status: 'FAILED', error_code: 'PG_DUMP_FAILED', archive_name: null });
  expect((await readdir(backupDir)).filter((name) => name.endsWith('.partial') || name.endsWith('.tmp'))).toEqual([]);
  // Restore into a fresh isolated database + directory (validation target), keeping the fixture's schema search path.
  const target = await freshDatabase('tgt'); target.url.search = new URL(f.config.databaseUrl).search; const targetFiles = await directory('restore-files');
  const staleDb = createDatabase(target.url.toString()); await staleDb.pool.query('create schema stale; create table stale.sentinel(id integer)'); await staleDb.close();
  const staleKey = crypto.randomUUID(); await mkdir(join(targetFiles, 'child-documents'), { recursive: true }); await writeFile(join(targetFiles, 'child-documents', `${staleKey}.blob`), 'stale');
  await expect(restoreArchive({ archivePath, encryptionKey: KEY, targetDatabaseUrl: target.url.toString(), targetFilesDir: targetFiles, mode: 'validate', expectedInstallationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'CROSS_INSTALLATION' });
  await expect(restoreArchive({ archivePath, encryptionKey: OTHER_KEY, targetDatabaseUrl: target.url.toString(), targetFilesDir: targetFiles, mode: 'validate', expectedInstallationId: f.config.installationId })).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' });
  await expect(restoreArchive({ archivePath, encryptionKey: KEY, targetDatabaseUrl: target.url.toString(), targetFilesDir: targetFiles, mode: 'live', expectedInstallationId: f.config.installationId })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  const report = await restoreArchive({ archivePath, encryptionKey: KEY, targetDatabaseUrl: target.url.toString(), targetFilesDir: targetFiles, mode: 'validate', expectedInstallationId: f.config.installationId });
  expect(report.files).toEqual({ extracted: 1, referenced: 1, missing: 0, mismatched: 0 }); expect(report.database.migrationsApplied).toEqual([]); expect(report.database.sessionsRevoked).toBeGreaterThan(0);
  expect(report.checks).toMatchObject({ children: 1, outstandingDebtPiastres: '6000', treasuryBalancePiastres: '4000', nurseryName: 'Backup Nursery', licenseValidUntil: '2026-12-31' }); expect(report.manifest.schemaVersion).toBe('0023_support_backups.sql');
  const targetInspection = createDatabase(target.url.toString()); expect((await targetInspection.pool.query("select count(*)::int as n from pg_namespace where nspname='stale'")).rows[0].n).toBe(0); await targetInspection.close();
  expect(await readdir(join(targetFiles, 'child-documents'))).not.toContain(`${staleKey}.blob`);
  const targetDb = createDatabase(target.url.toString()); const targetApp = buildApp({ ...f.config, databaseUrl: target.url.toString(), privateFilesDir: targetFiles }, targetDb); closers.push(async () => { await targetApp.close(); });
  expect((await schemaStatus(targetDb.pool)).pending).toEqual([]);
  // Old sessions are dead on the restored copy; the same credentials sign in afresh and reach the same data.
  await expect(targetApp.auth.authenticate(f.root.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  const login = await targetApp.auth.login('licensing-system', f.password); expect(login.account.kind).toBe('SYSTEM');
  const restored = await targetApp.childDocuments.download(login.token, document.id); expect(restored.mimeType).toBe('image/png');
  expect(restored.bytes.equals((await f.documents.download(f.root.token, document.id)).bytes)).toBe(true);
  expect(await sum(targetDb, 'select coalesce(sum(remaining),0)::text as v from installment_balances')).toBe(sourceDebt); expect(await sum(targetDb, 'select coalesce(sum(amount),0)::text as v from treasury_movements')).toBe(sourceCash);
  expect((await targetApp.licensing.nurserySettings(login.token)).name).toBe('Backup Nursery'); expect((await targetApp.licensing.context(login.token)).limits).toEqual((await f.licensing.context(f.root.token)).limits);
  expect(await reconcileFinance(targetDb)).toEqual([]);
  expect((await targetDb.pool.query("select count(*)::int as n from pg_namespace where nspname='pgboss'")).rows[0].n).toBe(0);
  // The operator CLI is the only live-restore path: it first writes and copies a healthy PRE_RESTORE set, then holds the maintenance lock through replacement.
  const preRestoreDir = await directory('pre-restore'); const preRestoreOffsite = await directory('pre-restore-offsite'); const liveStale = crypto.randomUUID(); await writeFile(join(targetFiles, 'child-documents', `${liveStale}.blob`), 'live stale');
  const live = await command(['infra/scripts/restore.ts', '--archive', archivePath, '--mode', 'live', '--target-database-url', target.url.toString(), '--target-files-dir', targetFiles, '--confirm-database', target.name], {
    ...process.env, NODE_ENV: 'test', DATABASE_URL: target.url.toString(), APP_ORIGIN: f.config.appOrigin, SESSION_SECRET: f.config.sessionSecret, INSTALLATION_ID: f.config.installationId,
    BUSINESS_TIMEZONE: f.config.businessTimezone, PRIVATE_FILES_DIR: targetFiles, SUPPORT_CONTACT: f.config.supportContact, BACKUP_TARGET: `directory:${preRestoreOffsite}`, BACKUP_DIR: preRestoreDir, BACKUP_ENCRYPTION_KEY: KEY, RELEASE_VERSION: 'test-release'
  });
  expect(live, `${live.stderr}\n${live.stdout}`).toMatchObject({ code: 0, stderr: '' }); expect(live.stdout).toContain('pre-restore recovery set');
  const preSidecars = (await readdir(preRestoreDir)).filter((name) => name.endsWith('.manifest.json')); expect(preSidecars).toHaveLength(1);
  const preSidecar = JSON.parse(await readFile(join(preRestoreDir, preSidecars[0]), 'utf8')); expect(preSidecar).toMatchObject({ kind: 'PRE_RESTORE', installationId: f.config.installationId });
  expect(await sha256File(join(preRestoreOffsite, preSidecar.archiveName))).toBe(preSidecar.archiveSha256); expect(await readdir(join(targetFiles, 'child-documents'))).not.toContain(`${liveStale}.blob`);
  // Starting the complete worker stack against the restored copy recreates its private queue schema and heartbeat safely.
  const workerErrors: Error[] = []; const boss = await startBillingWorker(target.url.toString(), targetDb, (error) => workerErrors.push(error));
  try {
    const workerJobs = await installSupportWorker(boss, targetDb, { ...f.config, databaseUrl: target.url.toString(), privateFilesDir: targetFiles, backup: { backupDir, encryptionKey: KEY, target: 'none', schedule: '0 2 * * *', retention: { daily: 7, weekly: 4, manual: 4 }, restoreValidationDatabaseUrl: null, restoreValidationFilesDir: null } }, () => undefined);
    await workerJobs.heartbeat({ restored: true });
    expect((await targetDb.pool.query("select details->>'restored' as restored from worker_heartbeats where name='worker'")).rows[0].restored).toBe('true');
  } finally { await boss.stop({ graceful: true }); }
  expect(workerErrors).toEqual([]);
  // A cryptographically valid archive whose database references an absent and a hash-mismatched blob is rejected after restore verification.
  const secondDocument = await f.documents.upload(f.root.token, child.childId, { name: 'Second document', expiresOn: null, mimeType: 'image/png', contentBase64: png.toString('base64') });
  const storage = (await f.database.pool.query<{ id: string; storage_key: string }>('select id,storage_key from child_documents where id=any($1::uuid[]) order by id', [[document.id, secondDocument.id]])).rows;
  const firstStorage = storage.find((row) => row.id === document.id)!; await rm(join(f.config.privateFilesDir, 'child-documents', `${firstStorage.storage_key}.blob`));
  await f.database.pool.query("update child_documents set sha256=repeat('0',64) where id=$1", [secondDocument.id]);
  const corrupt = await service.executeDetached('MANUAL'); expect(corrupt.status).toBe('SUCCEEDED');
  const corruptTarget = await freshDatabase('bad'); corruptTarget.url.search = target.url.search; const corruptFiles = await directory('corrupt-files');
  await expect(restoreArchive({ archivePath: join(backupDir, corrupt.archiveName!), encryptionKey: KEY, targetDatabaseUrl: corruptTarget.url.toString(), targetFilesDir: corruptFiles, mode: 'validate', expectedInstallationId: f.config.installationId })).rejects.toMatchObject({ code: 'VERIFICATION_FAILED', message: '1 referenced files missing, 1 mismatched' });
  // Worker-side validation job: fixed job type into the configured isolated target; unconfigured or tampered sets fail visibly.
  const validationDb = await freshDatabase('val'); validationDb.url.search = target.url.search; const validationFiles = await directory('validation-files');
  const validations = new RestoreValidationService(f.database, { backupDir, encryptionKey: KEY, installationId: f.config.installationId, targetDatabaseUrl: validationDb.url.toString(), targetFilesDir: validationFiles });
  const requested = await validations.request(first, f.root.account.id); expect(await validations.runRequested()).toEqual({ id: requested, status: 'SUCCEEDED' });
  const stored = (await f.database.pool.query('select status,error_code,report,target_label from restore_validations where id=$1', [requested])).rows[0];
  expect(stored.status).toBe('SUCCEEDED'); expect(stored.target_label).toBe(validationDb.name); expect(stored.report.checks.outstandingDebtPiastres).toBe('6000'); expect(stored.report.files.missing).toBe(0);
  expect(await readdir(join(validationFiles, 'child-documents'))).toHaveLength(1);
  const unconfigured = new RestoreValidationService(f.database, { ...validations.options, targetDatabaseUrl: null, targetFilesDir: null });
  const second = await unconfigured.request(first, f.root.account.id); expect((await unconfigured.runRequested())?.status).toBe('FAILED');
  expect((await f.database.pool.query('select error_code from restore_validations where id=$1', [second])).rows[0].error_code).toBe('TARGET_NOT_CONFIGURED');
  const bytes = await readFile(archivePath); bytes[bytes.length - 40] ^= 0x01; await writeFile(archivePath, bytes);
  const third = await validations.request(first, f.root.account.id); expect((await validations.runRequested())?.status).toBe('FAILED');
  expect((await f.database.pool.query('select error_code from restore_validations where id=$1', [third])).rows[0].error_code).toBe('ARCHIVE_INVALID');
  await expect(restoreArchive({ archivePath, encryptionKey: KEY, targetDatabaseUrl: validationDb.url.toString(), targetFilesDir: validationFiles, mode: 'validate', expectedInstallationId: f.config.installationId })).rejects.toBeInstanceOf(RestoreFailure);
  // Sweep entry used by the worker: heartbeat recorded and the run lock is free again after every path above.
  const jobs = createSupportJobs(f.database, { ...f.config, backup: { backupDir, encryptionKey: KEY, target: 'none', schedule: '0 2 * * *', retention: { daily: 7, weekly: 4, manual: 1 }, restoreValidationDatabaseUrl: null, restoreValidationFilesDir: null } }, () => undefined);
  expect(await jobs.sweep()).toEqual({ backup: null, restore: null });
  expect((await f.database.pool.query("select release_version from worker_heartbeats where name='worker'")).rows[0].release_version).toBe(f.config.releaseVersion ?? 'development');
  expect((await f.database.pool.query('select pg_try_advisory_lock($1) as ok', [BACKUP_RUN_LOCK])).rows[0].ok).toBe(true); await f.database.pool.query('select pg_advisory_unlock_all()');
}, 240_000);

it('retention removes the oldest manual set once the configured count is exceeded and records the deletion', async () => {
  const source = await freshDatabase('ret'); const originalUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = source.url.toString();
  let f: Awaited<ReturnType<typeof financeFixture>>; try { f = await financeFixture(); } finally { process.env.DATABASE_URL = originalUrl; }
  closers.push(() => f.close());
  const backupDir = await directory('retention');
  const service = new BackupService(f.database, { databaseUrl: f.config.databaseUrl, privateFilesDir: f.config.privateFilesDir, backupDir, encryptionKey: KEY, installationId: f.config.installationId, releaseVersion: 'test', target: 'none', retention: { daily: 7, weekly: 4, manual: 1 } });
  const a = await service.request('MANUAL', f.root.account.id, 'one'); expect(await service.execute(a, false)).toBe('SUCCEEDED');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const b = await service.request('MANUAL', f.root.account.id, 'two'); expect(await service.execute(b, false)).toBe('SUCCEEDED');
  const rows = (await f.database.pool.query('select id,archive_name,archive_deleted_at from backup_runs order by started_at')).rows;
  expect(rows.map((r) => [r.id, r.archive_deleted_at !== null])).toEqual([[a, true], [b, false]]);
  expect((await readdir(backupDir)).sort()).toEqual([rows[1].archive_name, `${rows[1].archive_name}.manifest.json`]);
}, 120_000);

it('restores a known older schema and applies only the remaining migration before verification', async () => {
  const source = await freshDatabase('old'); const originalUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = source.url.toString();
  let f: Awaited<ReturnType<typeof financeFixture>>; try { f = await financeFixture(); } finally { process.env.DATABASE_URL = originalUrl; }
  closers.push(() => f.close());
  await f.database.pool.query('drop table support_audit_events,worker_heartbeats,restore_validations,backup_runs cascade');
  await f.database.pool.query("delete from capabilities where key='support.restore'; delete from schema_migrations where name='0023_support_backups.sql'");
  expect((await schemaStatus(f.database.pool)).version).toBe('0022_imports.sql');
  const backupDir = await directory('older-backup'); const service = new BackupService(f.database, { databaseUrl: f.config.databaseUrl, privateFilesDir: f.config.privateFilesDir, backupDir, encryptionKey: KEY, installationId: f.config.installationId, releaseVersion: 'older-release', target: 'none', retention: { daily: 7, weekly: 4, manual: 4 } });
  const detached = await service.executeDetached('PRE_UPGRADE'); expect(detached).toMatchObject({ status: 'SUCCEEDED', schemaVersion: '0022_imports.sql' });
  const target = await freshDatabase('fwd'); target.url.search = new URL(f.config.databaseUrl).search; const targetFiles = await directory('older-restore');
  const report = await restoreArchive({ archivePath: join(backupDir, detached.archiveName!), encryptionKey: KEY, targetDatabaseUrl: target.url.toString(), targetFilesDir: targetFiles, mode: 'validate', expectedInstallationId: f.config.installationId });
  expect(report.database).toMatchObject({ schemaVersion: '0023_support_backups.sql', migrationsApplied: ['0023_support_backups.sql'] });
  const restored = createDatabase(target.url.toString()); expect((await schemaStatus(restored.pool)).pending).toEqual([]); expect((await restored.pool.query("select count(*)::int as n from capabilities where key='support.restore' and reserved")).rows[0].n).toBe(1); await restored.close();
}, 180_000);
