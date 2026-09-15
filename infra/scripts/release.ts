import 'dotenv/config';
import { applyMigrations, assertInstallationIdentity, createDatabase, schemaStatus } from '@nursery/db';
import { BackupService, type DetachedResult } from '../../apps/api/src/modules/support/backup.js';
import { checkTools, checkWritable, fail, flag, log, requireBackupConfig, requireConfig } from './common.js';

// Steps 1–4 of the start/upgrade sequence (OPERATIONS.md): validate, back up before a data migration, migrate once
// under the shared advisory lock. API and worker containers wait for this command to exit 0.
const config = requireConfig();
const skipBackup = flag('skip-backup') === 'true'; let detached: DetachedResult | null = null;
const storage = [...(await checkWritable(config.privateFilesDir, 'PRIVATE_FILES_DIR')), ...(config.backup?.backupDir ? await checkWritable(config.backup.backupDir, 'BACKUP_DIR') : []), ...(config.backup?.restoreValidationFilesDir ? await checkWritable(config.backup.restoreValidationFilesDir, 'RESTORE_VALIDATION_FILES_DIR') : [])];
if (config.backup?.target.startsWith('directory:')) storage.push(...await checkWritable(config.backup.target.slice('directory:'.length), 'BACKUP_TARGET directory'));
if (storage.length) { for (const problem of storage) process.stderr.write(`- ${problem}\n`); fail('Storage check failed.'); }
const database = createDatabase(config.databaseUrl);
try {
  try { await database.checkConnection(); } catch (error) { fail(`Database unreachable (${(error as { code?: string }).code ?? 'connection failed'}); check DATABASE_URL and the PostgreSQL service.`); }
  const before = await schemaStatus(database.pool);
  if (before.unknown.length) fail(`Database schema is ahead of this release (${before.unknown.join(', ')}); deploy a compatible release or restore a matching backup.`);
  await assertInstallationIdentity(database.pool, config.installationId).catch((error) => fail(error instanceof Error ? error.message : 'Installation identity check failed.'));
  log(`release ${config.releaseVersion}; schema ${before.version ?? 'empty'}; pending ${before.pending.length ? before.pending.join(', ') : 'none'}`);
  const dataMigration = before.pending.length > 0 && before.version !== null;
  if (dataMigration && !skipBackup) {
    if (!config.backup?.backupDir || !config.backup.encryptionKey) fail('Pending migrations need a pre-upgrade backup, but BACKUP_DIR/BACKUP_ENCRYPTION_KEY are not configured. Configure them or pass --skip-backup deliberately.');
    const backup = requireBackupConfig(config);
    const tools = await checkTools(); if (tools.length) fail(tools.join('; '));
    const backups = new BackupService(database, { databaseUrl: config.databaseUrl, privateFilesDir: config.privateFilesDir, backupDir: backup.backupDir, encryptionKey: backup.encryptionKey, installationId: config.installationId, releaseVersion: config.releaseVersion ?? 'development', target: backup.target, retention: backup.retention, log: (level, message, data) => log(`[backup:${level}] ${message} ${JSON.stringify(data ?? {})}`) });
    // Releases whose pending migrations create backup_runs (0023) cannot record the run first: back up detached, record after.
    const tableExists = (await database.pool.query<{ ok: string | null }>("select to_regclass('backup_runs')::text as ok")).rows[0].ok !== null;
    if (tableExists) {
      const id = await backups.request('PRE_UPGRADE', null, `before ${before.pending[0]}`);
      const status = await backups.execute(id, false);
      if (status !== 'SUCCEEDED') fail(`Pre-upgrade backup ${id} ended ${status}; migration not started. Inspect backup_runs.error_code and the worker/backup logs.`);
      log(`pre-upgrade backup ${id} succeeded`);
    } else {
      detached = await backups.executeDetached('PRE_UPGRADE');
      if (detached.status !== 'SUCCEEDED') fail(`Pre-upgrade backup ended ${detached.status} (${detached.errorCode ?? 'unknown'}); migration not started.`);
      log(`pre-upgrade backup ${detached.archiveName} succeeded (recorded after migration)`);
    }
  } else if (dataMigration) log('WARNING: --skip-backup given; migrating without a fresh recovery set.');
  let applied: string[] = [];
  try { applied = await applyMigrations(database.pool, { log }); }
  catch (error) { fail(`Migration failed (${(error as { code?: string }).code ?? 'error'}): ${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}. The database is unchanged for the failing file; API and worker stay on the previous release until this is resolved.`); }
  if (detached?.manifest) await database.pool.query("insert into backup_runs(id,kind,status,reason,requested_at,started_at,finished_at,installation_id,release_version,schema_version,archive_name,archive_bytes,archive_sha256,manifest,offsite_copied_at,error_code) values($1,'PRE_UPGRADE','SUCCEEDED',$2,$3,$3,now(),$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [detached.manifest.runId, `before ${before.pending[0]}`, detached.startedAt, config.installationId, config.releaseVersion ?? 'development', detached.schemaVersion, detached.archiveName, detached.archiveBytes, detached.archiveSha256, JSON.stringify({ ...detached.manifest, files: undefined }), detached.offsiteCopied ? new Date() : null, detached.errorCode]);
  const after = await schemaStatus(database.pool);
  log(`migration complete: applied ${applied.length}; schema ${after.version ?? 'empty'}; release ${config.releaseVersion}`);
} finally { await database.close(); }
