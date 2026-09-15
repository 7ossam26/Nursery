import 'dotenv/config';
import { statfs, writeFile } from 'node:fs/promises';
import { hostname, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { createDatabase, schemaStatus } from '@nursery/db';
import { describeConfigProblems, loadConfig } from '../../apps/api/src/config.js';
import { fail, flag, log } from './common.js';

// Redacted diagnostics for the tech lead: versions, schema state, queue/backup/restore status, disk usage.
// No secrets, child data, usernames, file contents or connection strings are included.
const problems = describeConfigProblems(process.env);
const config = problems.length ? null : loadConfig(process.env);
const usage = async (path: string | null | undefined) => { if (!path) return null; try { const s = await statfs(path); return { totalBytes: Number(s.blocks) * Number(s.bsize), freeBytes: Number(s.bavail) * Number(s.bsize) }; } catch { return null; } };
const bundle: Record<string, unknown> = {
  collectedAt: new Date().toISOString(), node: process.version, platform: `${platform()} ${release()}`, host: hostname(), totalMemoryBytes: totalmem(),
  configurationProblems: problems, releaseVersion: config?.releaseVersion ?? null, installationId: config?.installationId ?? null, origin: config?.appOrigin ?? null,
  backups: config?.backup ? { configured: Boolean(config.backup.backupDir && config.backup.encryptionKey), target: config.backup.target.startsWith('directory:') ? 'directory' : config.backup.target, schedule: config.backup.schedule, retention: config.backup.retention, restoreValidationConfigured: Boolean(config.backup.restoreValidationDatabaseUrl) } : null,
  storage: { privateFiles: await usage(config?.privateFilesDir), backups: await usage(config?.backup?.backupDir) }
};
if (config) {
  const database = createDatabase(config.databaseUrl);
  try {
    const schema = await schemaStatus(database.pool);
    bundle.schema = { version: schema.version, pending: schema.pending, unknown: schema.unknown };
    const q = async (sql: string) => { try { return (await database.pool.query(sql)).rows; } catch (error) { return { unavailable: (error as { code?: string }).code ?? 'error' }; } };
    bundle.workerHeartbeats = await q('select name,last_seen_at,release_version,details from worker_heartbeats');
    bundle.backupRuns = await q('select id,kind,status,requested_at,started_at,finished_at,release_version,schema_version,archive_name,archive_bytes,archive_sha256,offsite_copied_at,archive_deleted_at,error_code from backup_runs order by requested_at desc limit 20');
    bundle.restoreValidations = await q('select id,backup_run_id,status,requested_at,finished_at,target_label,error_code,report from restore_validations order by requested_at desc limit 10');
    bundle.queues = await q("select name,state,count(*)::int as count,min(created_on) as oldest from pgboss.job group by name,state order by name,state");
    bundle.failedJobs24h = await q("select name,count(*)::int as count from pgboss.job where state='failed' and completed_on>now()-interval '24 hours' group by name");
    bundle.licensing = await q('select subscription_period,starts_on,valid_until,grace_days,parent_capacity,employee_capacity,version from license_limits');
    bundle.modules = await q('select module_key,enabled,version from module_settings order by module_key');
    bundle.counts = await q("select (select count(*) from accounts) as accounts,(select count(*) from children) as children,(select count(*) from sessions where revoked_at is null and expires_at>now()) as live_sessions,(select count(*) from auth_audit_events where event='auth.login_failed' and created_at>now()-interval '24 hours') as failed_logins_24h");
  } catch (error) { bundle.database = { unavailable: (error as { code?: string }).code ?? 'error' }; } finally { await database.close(); }
}
const output = flag('output', join(config?.backup?.backupDir ?? process.cwd(), `support-bundle-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))!;
const text = JSON.stringify(bundle, null, 1);
for (const secret of [process.env.SESSION_SECRET, process.env.BACKUP_ENCRYPTION_KEY, process.env.DATABASE_URL, process.env.POSTGRES_PASSWORD]) if (secret && text.includes(secret)) fail('Refusing to write a bundle that would contain a secret value.');
await writeFile(output, text, { mode: 0o600 });
log(`Support bundle written to ${output}`);
