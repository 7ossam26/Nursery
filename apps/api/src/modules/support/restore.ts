import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { applyMigrations, createDatabase, migrationFiles, schemaStatus, type Database } from '@nursery/db';
import { decryptFile, parseKey, sha256File } from './archive-crypto.js';
import { BACKUP_RUN_LOCK, FILE_NAMESPACES, MANIFEST_FORMAT, type BackupManifest } from './backup.js';
import { connectionArguments, redact, runTool, ToolError } from './pg-tools.js';
import { readTar } from './tar.js';

export const RESTORE_ERRORS = ['ARCHIVE_MISSING', 'ARCHIVE_INVALID', 'MANIFEST_INVALID', 'CROSS_INSTALLATION', 'SCHEMA_AHEAD', 'CONFIRMATION_REQUIRED', 'TARGET_NOT_CONFIGURED', 'TARGET_UNSAFE', 'PG_RESTORE_FAILED', 'MIGRATION_FAILED', 'FILES_FAILED', 'VERIFICATION_FAILED', 'OVERLAP', 'WORKER_RESTARTED'] as const;
export type RestoreErrorCode = typeof RESTORE_ERRORS[number];
export class RestoreFailure extends Error { constructor(readonly code: RestoreErrorCode, detail: string) { super(redact(detail)); } }
export type RestoreOptions = Readonly<{
  archivePath: string; encryptionKey: string; targetDatabaseUrl: string; targetFilesDir: string; mode: 'validate' | 'live';
  expectedInstallationId: string | null; allowCrossInstallation?: boolean; confirmDestructive?: string; environment?: NodeJS.ProcessEnv;
  log?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}>;
export type RestoreReport = {
  mode: 'validate' | 'live'; archive: { name: string; bytes: number; sha256: string };
  manifest: { runId: string; kind: string; installationId: string; releaseVersion: string; schemaVersion: string | null; createdAt: string; files: number; fileBytes: number };
  database: { name: string; schemaVersion: string | null; migrationsApplied: string[]; sessionsRevoked: number };
  files: { extracted: number; referenced: number; missing: number; mismatched: number };
  checks: { accounts: number; children: number; outstandingDebtPiastres: string; treasuryBalancePiastres: string; nurseryName: string | null; licenseValidUntil: string | null };
  durationMs: number;
};
type Referenced = { storage_key: string; sha256: string; namespace: string };

async function extractArchive(archivePath: string, key: Buffer, staging: string) {
  const files = new Map<string, { path: string; bytes: number; sha256: string }>(); let manifest: BackupManifest | null = null; let dump: { path: string; bytes: number; sha256: string } | null = null;
  for await (const entry of readTar(decryptFile(archivePath, key))) {
    const fileMatch = /^files\/(child-documents|expense-documents|report-exports)\/([0-9a-f-]{36}\.blob)$/.exec(entry.name);
    if (entry.name === 'manifest.json') {
      const chunks: Buffer[] = []; for await (const chunk of entry.body) chunks.push(chunk);
      manifest = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BackupManifest; continue;
    }
    if (!fileMatch && entry.name !== 'database.dump') throw new RestoreFailure('ARCHIVE_INVALID', `unexpected archive entry ${entry.name}`);
    const target = fileMatch ? join(staging, fileMatch[1], fileMatch[2]) : join(staging, 'database.dump');
    await mkdir(join(staging, fileMatch ? fileMatch[1] : ''), { recursive: true, mode: 0o700 });
    const out = createWriteStream(target, { mode: 0o600 }); const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of entry.body) { hash.update(chunk); bytes += chunk.length; if (!out.write(chunk)) await once(out, 'drain'); }
    out.end(); await once(out, 'finish');
    const record = { path: target, bytes, sha256: hash.digest('hex') };
    if (fileMatch) files.set(`${fileMatch[1]}/${fileMatch[2]}`, record); else dump = record;
  }
  if (!manifest || !dump) throw new RestoreFailure('ARCHIVE_INVALID', 'archive lacks manifest or database dump');
  return { files, manifest, dump };
}
function verifyManifest(manifest: BackupManifest, files: Map<string, { bytes: number; sha256: string }>, dump: { bytes: number; sha256: string }, known: string[], expectedInstallationId: string | null, allowCross: boolean) {
  if (manifest.format !== MANIFEST_FORMAT || !Array.isArray(manifest.files) || typeof manifest.installationId !== 'string') throw new RestoreFailure('MANIFEST_INVALID', 'manifest format unsupported');
  if (expectedInstallationId && manifest.installationId !== expectedInstallationId && !allowCross) throw new RestoreFailure('CROSS_INSTALLATION', 'archive belongs to a different installation');
  if (manifest.schemaVersion && !known.includes(manifest.schemaVersion)) throw new RestoreFailure('SCHEMA_AHEAD', `archive schema ${manifest.schemaVersion} is newer than this release`);
  if (manifest.database.bytes !== dump.bytes || manifest.database.sha256 !== dump.sha256) throw new RestoreFailure('ARCHIVE_INVALID', 'database dump checksum mismatch');
  if (manifest.files.length !== files.size) throw new RestoreFailure('ARCHIVE_INVALID', 'archive file count differs from manifest');
  for (const file of manifest.files) {
    const extracted = files.get(`${file.namespace}/${file.key}.blob`);
    if (!extracted || extracted.bytes !== file.bytes || extracted.sha256 !== file.sha256) throw new RestoreFailure('ARCHIVE_INVALID', `file ${file.entry} checksum mismatch`);
  }
}
async function resetTarget(target: Database) {
  const schemas = (await target.pool.query<{ nspname: string }>("select nspname from pg_namespace where nspname not in ('pg_catalog','information_schema') and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'")).rows;
  for (const { nspname } of schemas) { if (!/^[a-z_][a-z0-9_]*$/.test(nspname)) throw new RestoreFailure('TARGET_UNSAFE', 'target contains an unexpected schema name'); await target.pool.query(`drop schema "${nspname}" cascade`); }
  await target.pool.query('create schema public');
}
// Restores one recovery set into a target database + files directory. Validation mode targets an isolated,
// disposable pair; live mode additionally requires the exact target database name as destructive confirmation.
export async function restoreArchive(options: RestoreOptions): Promise<RestoreReport> {
  const started = Date.now(); const log = options.log ?? (() => undefined);
  const key = parseKey(options.encryptionKey);
  const connection = connectionArguments(options.targetDatabaseUrl);
  if (options.mode === 'live' && options.confirmDestructive !== connection.database) throw new RestoreFailure('CONFIRMATION_REQUIRED', 'live restore requires the exact target database name as confirmation');
  let archiveBytes: number; try { archiveBytes = (await stat(options.archivePath)).size; } catch { throw new RestoreFailure('ARCHIVE_MISSING', 'archive not found'); }
  const archiveSha256 = await sha256File(options.archivePath);
  await mkdir(options.targetFilesDir, { recursive: true, mode: 0o700 });
  const staging = join(resolve(options.targetFilesDir), `.restore-${randomUUID()}`);
  const target = createDatabase(options.targetDatabaseUrl);
  try {
    let extracted: Awaited<ReturnType<typeof extractArchive>>;
    try { extracted = await extractArchive(options.archivePath, key, staging); }
    catch (error) { if (error instanceof RestoreFailure) throw error; throw new RestoreFailure('ARCHIVE_INVALID', error instanceof Error ? error.message : String(error)); }
    verifyManifest(extracted.manifest, extracted.files, extracted.dump, await migrationFiles(), options.expectedInstallationId, options.allowCrossInstallation ?? false);
    // Target identity: an installation that already exists must be the same one, unless a deliberate migration says otherwise.
    const baselineTable = (await target.pool.query<{ ok: string | null }>("select to_regclass('installation_baseline')::text as ok")).rows[0].ok;
    if (baselineTable) {
      const existing = (await target.pool.query<{ id: string }>('select id from installation_baseline limit 1')).rows[0]?.id ?? null;
      if (existing && existing !== extracted.manifest.installationId && !options.allowCrossInstallation) throw new RestoreFailure('CROSS_INSTALLATION', 'target database belongs to a different installation');
    }
    log('info', 'archive verified; resetting target database', { database: connection.database, mode: options.mode });
    await resetTarget(target);
    try { await runTool('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', ...connection.args, extracted.dump.path], connection.env, options.environment); }
    catch (error) { throw new RestoreFailure('PG_RESTORE_FAILED', error instanceof ToolError ? `${error.message}: ${error.stderr}` : String(error)); }
    let migrationsApplied: string[];
    try { migrationsApplied = await applyMigrations(target.pool); } catch (error) { throw new RestoreFailure('MIGRATION_FAILED', error instanceof Error ? error.message : String(error)); }
    const schemaVersion = (await schemaStatus(target.pool)).version;
    // The dump includes the backup job's own RUNNING row at its exported snapshot. On a restored copy it is
    // necessarily historical, never active; reconcile it before any new backup or worker can claim the slot.
    await target.pool.query("update backup_runs set status='FAILED',error_code='WORKER_RESTARTED',finished_at=now() where status='RUNNING'");
    await target.pool.query("update restore_validations set status='FAILED',error_code='WORKER_RESTARTED',finished_at=now() where status='RUNNING'");
    // Restored sessions belong to the source moment; nobody may continue with them (fresh sign-in required).
    const sessionsRevoked = (await target.pool.query('update sessions set revoked_at=coalesce(revoked_at,now()) where revoked_at is null')).rowCount ?? 0;
    await target.pool.query("select pg_notify('auth_revoked','*')");
    try {
      for (const namespace of FILE_NAMESPACES) {
        const destination = resolve(options.targetFilesDir, namespace);
        // A recovery set is a complete snapshot. Remove stale blobs in both validation and live targets.
        await rm(destination, { recursive: true, force: true });
        await mkdir(destination, { recursive: true, mode: 0o700 });
        for (const [name, file] of extracted.files) if (name.startsWith(`${namespace}/`)) await rename(file.path, join(destination, name.slice(namespace.length + 1)));
      }
    } catch (error) { throw new RestoreFailure('FILES_FAILED', error instanceof Error ? error.message : String(error)); }
    const referenced = (await target.pool.query<Referenced>(`select storage_key,sha256,'child-documents' as namespace from child_documents
      union all select storage_key,sha256,'expense-documents' from expense_documents
      union all select storage_key,sha256,'report-exports' from report_exports where status='READY' and storage_key is not null`)).rows;
    let missing = 0, mismatched = 0;
    for (const row of referenced) {
      const path = resolve(options.targetFilesDir, row.namespace, `${row.storage_key}.blob`);
      let bytes: Buffer; try { bytes = await readFile(path); } catch { missing++; continue; }
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) mismatched++;
    }
    const checks = (await target.pool.query<{ accounts: number; children: number; debt: string; treasury: string; name: string | null; valid_until: string | null }>(`select
      (select count(*)::int from accounts) as accounts,(select count(*)::int from children) as children,
      (select coalesce(sum(remaining),0)::text from installment_balances) as debt,(select coalesce(sum(amount),0)::text from treasury_movements) as treasury,
      (select name from nursery_settings where singleton) as name,(select valid_until::text from license_limits where singleton) as valid_until`)).rows[0];
    const report: RestoreReport = {
      mode: options.mode, archive: { name: options.archivePath.split(/[\\/]/).pop()!, bytes: archiveBytes, sha256: archiveSha256 },
      manifest: { runId: extracted.manifest.runId, kind: extracted.manifest.kind, installationId: extracted.manifest.installationId, releaseVersion: extracted.manifest.releaseVersion, schemaVersion: extracted.manifest.schemaVersion, createdAt: extracted.manifest.createdAt, files: extracted.manifest.counts.files, fileBytes: extracted.manifest.counts.fileBytes },
      database: { name: connection.database, schemaVersion, migrationsApplied, sessionsRevoked }, files: { extracted: extracted.files.size, referenced: referenced.length, missing, mismatched },
      checks: { accounts: checks.accounts, children: checks.children, outstandingDebtPiastres: checks.debt, treasuryBalancePiastres: checks.treasury, nurseryName: checks.name, licenseValidUntil: checks.valid_until }, durationMs: Date.now() - started
    };
    if (missing || mismatched) throw new RestoreFailure('VERIFICATION_FAILED', `${missing} referenced files missing, ${mismatched} mismatched`);
    log('info', 'restore completed', { database: connection.database, mode: options.mode, files: report.files, checks: report.checks });
    return report;
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await target.close();
  }
}

export type ValidationOptions = Readonly<{ backupDir: string; encryptionKey: string; installationId: string; targetDatabaseUrl: string | null; targetFilesDir: string | null; environment?: NodeJS.ProcessEnv; log?: RestoreOptions['log'] }>;
// Worker job: validates a recorded recovery set by restoring it into the configured isolated target (support UI initiates it).
export class RestoreValidationService {
  constructor(readonly database: Database, readonly options: ValidationOptions) {}
  async request(backupRunId: string, requestedBy: string): Promise<string> {
    const id = randomUUID();
    await this.database.pool.query("insert into restore_validations(id,backup_run_id,requested_by,status,target_label) values($1,$2,$3,'REQUESTED',$4)", [id, backupRunId, requestedBy, this.options.targetDatabaseUrl ? connectionArguments(this.options.targetDatabaseUrl).database : null]);
    return id;
  }
  async runRequested(): Promise<{ id: string; status: string } | null> {
    const next = (await this.database.pool.query<{ id: string; archive_name: string | null; archive_sha256: string | null; run_status: string }>("select v.id,b.archive_name,b.archive_sha256,b.status as run_status from restore_validations v join backup_runs b on b.id=v.backup_run_id where v.status='REQUESTED' order by v.requested_at,v.id limit 1")).rows[0];
    if (!next) return null;
    const client = await this.database.pool.connect(); let locked = false;
    const finish = async (status: 'SUCCEEDED' | 'FAILED', report: RestoreReport | null, code: RestoreErrorCode | null, detail?: string) => {
      this.options.log?.(status === 'FAILED' ? 'error' : 'info', `restore validation ${status.toLowerCase()}`, { id: next.id, code, detail: detail ? redact(detail) : undefined });
      await this.database.pool.query("update restore_validations set status=$2,report=$3,error_code=$4,finished_at=now() where id=$1", [next.id, status, report ? JSON.stringify(report) : null, code]);
      return { id: next.id, status };
    };
    try {
      locked = (await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [BACKUP_RUN_LOCK])).rows[0].ok;
      if (!locked) return { id: next.id, status: 'REQUESTED' };
      const claimed = await this.database.pool.query("update restore_validations set status='RUNNING',started_at=now() where id=$1 and status='REQUESTED'", [next.id]);
      if (!claimed.rowCount) return { id: next.id, status: 'REQUESTED' };
      if (!this.options.targetDatabaseUrl || !this.options.targetFilesDir) return finish('FAILED', null, 'TARGET_NOT_CONFIGURED');
      if (next.run_status !== 'SUCCEEDED' || !next.archive_name || !next.archive_sha256) return finish('FAILED', null, 'ARCHIVE_MISSING');
      const archivePath = join(this.options.backupDir, next.archive_name);
      let actual: string; try { actual = await sha256File(archivePath); } catch { return finish('FAILED', null, 'ARCHIVE_MISSING'); }
      if (actual !== next.archive_sha256) return finish('FAILED', null, 'ARCHIVE_INVALID', 'stored checksum differs from the archive on disk');
      const report = await restoreArchive({ archivePath, encryptionKey: this.options.encryptionKey, targetDatabaseUrl: this.options.targetDatabaseUrl, targetFilesDir: this.options.targetFilesDir, mode: 'validate', expectedInstallationId: this.options.installationId, environment: this.options.environment, log: this.options.log });
      return finish('SUCCEEDED', report, null);
    } catch (error) {
      return finish('FAILED', null, error instanceof RestoreFailure ? error.code : 'VERIFICATION_FAILED', error instanceof Error ? error.message : String(error));
    } finally {
      if (locked) await client.query('select pg_advisory_unlock_all()').catch(() => undefined);
      client.release();
    }
  }
}
