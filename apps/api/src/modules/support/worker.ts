import type { Database } from '@nursery/db';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../config.js';
import { BACKUP_RUN_LOCK, BackupService } from './backup.js';
import { RestoreValidationService } from './restore.js';

export type SupportLog = (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
export type SupportJobs = { recoverInterrupted: () => Promise<{ backups: number; restores: number; partials: number }>; sweep: () => Promise<{ backup: string | null; restore: string | null }>; scheduled: () => Promise<{ id: string; status: string }>; heartbeat: (details?: Record<string, unknown>) => Promise<void>; configured: boolean };
// Worker-side entry: one sweep executes at most one requested backup and one requested restore validation.
export function createSupportJobs(database: Database, config: AppConfig, log: SupportLog): SupportJobs {
  const backup = config.backup; const release = config.releaseVersion ?? 'development';
  const configured = Boolean(backup?.backupDir && backup.encryptionKey);
  const backups = configured ? new BackupService(database, { databaseUrl: config.databaseUrl, privateFilesDir: config.privateFilesDir, backupDir: backup!.backupDir!, encryptionKey: backup!.encryptionKey!, installationId: config.installationId, releaseVersion: release, target: backup!.target, retention: backup!.retention, log }) : null;
  const restores = configured ? new RestoreValidationService(database, { backupDir: backup!.backupDir!, encryptionKey: backup!.encryptionKey!, installationId: config.installationId, targetDatabaseUrl: backup!.restoreValidationDatabaseUrl, targetFilesDir: backup!.restoreValidationFilesDir, log }) : null;
  const heartbeat = async (details: Record<string, unknown> = {}) => { await database.pool.query("insert into worker_heartbeats(name,last_seen_at,release_version,details) values('worker',now(),$1,$2) on conflict(name) do update set last_seen_at=now(),release_version=excluded.release_version,details=excluded.details", [release, JSON.stringify(details)]); };
  return {
    configured, heartbeat,
    async recoverInterrupted() {
      const client = await database.pool.connect(); let locked = false;
      try {
        locked = (await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [BACKUP_RUN_LOCK])).rows[0].ok;
        // A surviving worker owns the lock, so its RUNNING row is not stale.
        if (!locked) return { backups: 0, restores: 0, partials: 0 };
        const backupResult = await client.query("update backup_runs set status='FAILED',error_code='WORKER_RESTARTED',finished_at=now() where status='RUNNING'");
        const restoreResult = await client.query("update restore_validations set status='FAILED',error_code='WORKER_RESTARTED',finished_at=now() where status='RUNNING'");
        let partials = 0;
        if (backup?.backupDir) {
          let names: string[] = []; try { names = await readdir(backup.backupDir); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          for (const name of names.filter((entry) => /^backup-[0-9a-z._-]+\.tar\.enc\.(partial|dump\.tmp)$/i.test(entry))) {
            await rm(join(backup.backupDir, name), { force: true }); partials++;
          }
        }
        const result = { backups: backupResult.rowCount ?? 0, restores: restoreResult.rowCount ?? 0, partials };
        if (result.backups || result.restores || result.partials) log('warn', 'recovered interrupted support work', result);
        return result;
      } finally {
        if (locked) await client.query('select pg_advisory_unlock($1)', [BACKUP_RUN_LOCK]).catch(() => undefined);
        client.release();
      }
    },
    async sweep() {
      await heartbeat({ backupsConfigured: configured });
      if (!backups || !restores) {
        // Requests made while backups are unconfigured fail visibly instead of waiting forever.
        await database.pool.query("update backup_runs set status='FAILED',error_code='CONFIG_MISSING',finished_at=now() where status='REQUESTED'");
        await database.pool.query("update restore_validations set status='FAILED',error_code='TARGET_NOT_CONFIGURED',finished_at=now() where status='REQUESTED'");
        return { backup: null, restore: null };
      }
      const run = await backups.runRequested(); const validation = await restores.runRequested();
      return { backup: run?.status ?? null, restore: validation?.status ?? null };
    },
    async scheduled() {
      if (!backups) { log('warn', 'scheduled backup skipped: BACKUP_DIR/BACKUP_ENCRYPTION_KEY not configured'); return { id: '', status: 'UNCONFIGURED' }; }
      return backups.runScheduled();
    }
  };
}
