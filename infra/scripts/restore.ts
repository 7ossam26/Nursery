import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { assertSchemaCurrent, createDatabase, type Database } from '@nursery/db';
import { BACKUP_RUN_LOCK, BackupService } from '../../apps/api/src/modules/support/backup.js';
import { restoreArchive, RestoreFailure } from '../../apps/api/src/modules/support/restore.js';
import { sameDatabase } from '../../apps/api/src/config.js';
import { checkTools, fail, flag, log, requireBackupConfig, requireConfig } from './common.js';

// Fixed restore procedure (OPERATIONS.md). Validation mode restores into a disposable target; live mode is the
// destructive step and demands the exact target database name on the command line. No SQL or shell is accepted.
//   --archive <path> --mode validate|live --target-database-url <url> --target-files-dir <dir>
//   [--confirm-database <name>] [--allow-cross-installation] [--expected-installation <uuid>]
const archivePath = flag('archive'); const mode = flag('mode', 'validate'); const targetDatabaseUrl = flag('target-database-url'); const targetFilesDir = flag('target-files-dir');
if (!archivePath || !targetDatabaseUrl || !targetFilesDir || !['validate', 'live'].includes(mode!)) fail('Usage: --archive <path> --mode validate|live --target-database-url <url> --target-files-dir <dir> [--confirm-database <name>] [--allow-cross-installation]');
const key = process.env.BACKUP_ENCRYPTION_KEY; if (!key) fail('BACKUP_ENCRYPTION_KEY is required (the key the archive was written with).');
const expected = flag('expected-installation', process.env.INSTALLATION_ID); if (expected && !z.uuid().safeParse(expected).success) fail('--expected-installation must be a UUID');
if (mode === 'validate' && process.env.DATABASE_URL && sameDatabase(targetDatabaseUrl!, process.env.DATABASE_URL)) fail('Validation must target a different database than DATABASE_URL.');
if (mode === 'validate' && process.env.PRIVATE_FILES_DIR && resolve(targetFilesDir!) === resolve(process.env.PRIVATE_FILES_DIR)) fail('Validation must target a different directory than PRIVATE_FILES_DIR.');
const tools = await checkTools(); if (tools.length) fail(tools.join('; '));
let maintenanceDatabase: Database | null = null; let maintenanceClient: PoolClient | null = null; let maintenanceLocked = false;
try {
  if (mode === 'live') {
    const config = requireConfig(); const backup = requireBackupConfig(config);
    if (!sameDatabase(targetDatabaseUrl!, config.databaseUrl)) throw new Error('Live restore must target the exact DATABASE_URL from the validated deployment configuration.');
    if (resolve(targetFilesDir!) !== resolve(config.privateFilesDir)) throw new Error('Live restore must target the exact PRIVATE_FILES_DIR from the validated deployment configuration.');
    maintenanceDatabase = createDatabase(config.databaseUrl);
    await assertSchemaCurrent(maintenanceDatabase.pool, config.installationId);
    const service = new BackupService(maintenanceDatabase, { databaseUrl: config.databaseUrl, privateFilesDir: config.privateFilesDir, backupDir: backup.backupDir, encryptionKey: backup.encryptionKey, installationId: config.installationId, releaseVersion: config.releaseVersion ?? 'development', target: backup.target, retention: backup.retention, log: (level, message, data) => log(`[pre-restore:${level}] ${message} ${JSON.stringify(data ?? {})}`) });
    const preRestoreId = await service.request('PRE_RESTORE', null, `before restoring ${resolve(archivePath!).split(/[\\/]/).pop()}`);
    const preRestoreStatus = await service.execute(preRestoreId, false);
    const preRestore = (await maintenanceDatabase.pool.query<{ archive_name: string | null; error_code: string | null }>('select archive_name,error_code from backup_runs where id=$1', [preRestoreId])).rows[0];
    if (preRestoreStatus !== 'SUCCEEDED' || !preRestore?.archive_name || preRestore.error_code) throw new Error(`Pre-restore backup ${preRestoreId} is not a complete healthy recovery set (${preRestoreStatus}${preRestore?.error_code ? `/${preRestore.error_code}` : ''}); live restore was not started.`);
    log(`pre-restore recovery set ${preRestore.archive_name} succeeded`);
    maintenanceClient = await maintenanceDatabase.pool.connect();
    maintenanceLocked = (await maintenanceClient.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [BACKUP_RUN_LOCK])).rows[0].ok;
    if (!maintenanceLocked) throw new Error('Another backup or restore is active; live restore was not started.');
  }
  const report = await restoreArchive({ archivePath: archivePath!, encryptionKey: key!, targetDatabaseUrl: targetDatabaseUrl!, targetFilesDir: targetFilesDir!, mode: mode as 'validate' | 'live', expectedInstallationId: expected ?? null, allowCrossInstallation: flag('allow-cross-installation') === 'true', confirmDestructive: flag('confirm-database'), log: (level, message, data) => log(`[${level}] ${message} ${JSON.stringify(data ?? {})}`) });
  log(JSON.stringify(report, null, 1));
  if (mode === 'live') log('Live restore finished: every previous session is revoked. Verify sign-in, a private file, balances and the worker before reopening access.');
} catch (error) {
  process.stderr.write(error instanceof RestoreFailure ? `Restore failed: ${error.code} — ${error.message}\n` : `Restore failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
} finally {
  if (maintenanceLocked && maintenanceClient) await maintenanceClient.query('select pg_advisory_unlock($1)', [BACKUP_RUN_LOCK]).catch(() => undefined);
  maintenanceClient?.release();
  if (maintenanceDatabase) await maintenanceDatabase.close();
}
