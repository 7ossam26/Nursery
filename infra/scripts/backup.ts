import 'dotenv/config';
import { createDatabase } from '@nursery/db';
import { BackupService } from '../../apps/api/src/modules/support/backup.js';
import { checkTools, fail, flag, log, requireBackupConfig, requireConfig } from './common.js';

// Operator backup: `--kind MANUAL|PRE_UPGRADE|PRE_RESTORE` (default MANUAL). Uses the same barrier, snapshot,
// encryption, retention and offsite copy as the scheduled worker run and shares its overlap lock.
const config = requireConfig();
const kind = flag('kind', 'MANUAL');
if (!['MANUAL', 'PRE_UPGRADE', 'PRE_RESTORE'].includes(kind!)) fail('--kind must be MANUAL, PRE_UPGRADE or PRE_RESTORE');
const backup = requireBackupConfig(config);
const tools = await checkTools(); if (tools.length) fail(tools.join('; '));
const database = createDatabase(config.databaseUrl);
try {
  try { await database.checkConnection(); } catch (error) { fail(`Database unreachable (${(error as { code?: string }).code ?? 'connection failed'}).`); }
  const backups = new BackupService(database, { databaseUrl: config.databaseUrl, privateFilesDir: config.privateFilesDir, backupDir: backup.backupDir, encryptionKey: backup.encryptionKey, installationId: config.installationId, releaseVersion: config.releaseVersion ?? 'development', target: backup.target, retention: backup.retention, log: (level, message, data) => log(`[${level}] ${message} ${JSON.stringify(data ?? {})}`) });
  const id = await backups.request(kind as 'MANUAL' | 'PRE_UPGRADE' | 'PRE_RESTORE', null, flag('reason', 'operator command') ?? null);
  const status = await backups.execute(id, false);
  const row = (await database.pool.query<{ archive_name: string | null; archive_sha256: string | null; error_code: string | null; offsite_copied_at: Date | null }>('select archive_name,archive_sha256,error_code,offsite_copied_at from backup_runs where id=$1', [id])).rows[0];
  log(JSON.stringify({ id, kind, status, archiveName: row.archive_name, archiveSha256: row.archive_sha256, errorCode: row.error_code, offsiteCopied: row.offsite_copied_at !== null }, null, 1));
  if (status !== 'SUCCEEDED') fail(`Backup ${id} ended ${status}.`);
} finally { await database.close(); }
