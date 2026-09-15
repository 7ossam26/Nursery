import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { once } from 'node:events';
import { schemaStatus, type Database } from '@nursery/db';
import { encryptingStream, parseKey, sha256File } from './archive-crypto.js';
import { connectionArguments, redact, runTool, ToolError } from './pg-tools.js';
import { selectExpired, type BackupKind, type RetentionPolicy } from './retention.js';
import { finishTar, writeTarEntry } from './tar.js';
import { FILE_LOCK } from '../children/private-store.js';

export const BACKUP_RUN_LOCK = 7192301;
export const FILE_NAMESPACES = ['child-documents', 'expense-documents', 'report-exports'] as const;
export const MANIFEST_FORMAT = 'nursery-backup/1';
export type ManifestFile = { entry: string; namespace: string; key: string; bytes: number; sha256: string };
export type BackupManifest = {
  format: typeof MANIFEST_FORMAT; runId: string; kind: BackupKind; installationId: string; releaseVersion: string; schemaVersion: string | null; createdAt: string;
  database: { entry: 'database.dump'; bytes: number; sha256: string; excludedSchemas: string[] }; files: ManifestFile[]; counts: { files: number; fileBytes: number };
};
export type BackupOptions = Readonly<{
  databaseUrl: string; privateFilesDir: string; backupDir: string; encryptionKey: string; installationId: string; releaseVersion: string; target: string; retention: RetentionPolicy;
  environment?: NodeJS.ProcessEnv; log?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}>;
type Run = { id: string; kind: BackupKind; status: string; archive_name: string | null; requested_at: Date };
export const BACKUP_ERRORS = ['OVERLAP', 'CONFIG_MISSING', 'FILES_FAILED', 'PG_DUMP_FAILED', 'ARCHIVE_FAILED', 'OFFSITE_FAILED', 'RETENTION_FAILED', 'WORKER_RESTARTED'] as const;
export type BackupErrorCode = typeof BACKUP_ERRORS[number];
class BackupFailure extends Error { constructor(readonly code: BackupErrorCode, detail: string) { super(detail); } }
export const archiveName = (installationId: string, kind: BackupKind, at: Date, runId: string) => `backup-${installationId.slice(0, 8)}-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${kind.toLowerCase()}-${runId.slice(0, 8)}.tar.enc`;
export function offsiteDirectory(target: string): string | null {
  if (!target.startsWith('directory:')) return null;
  const path = target.slice('directory:'.length); if (!isAbsolute(path)) throw new BackupFailure('CONFIG_MISSING', 'BACKUP_TARGET directory must be absolute');
  return path;
}

// One recovery set = private files copied under the exclusive file barrier + a pg_dump taken from a snapshot exported
// while that barrier was held, so every file referenced by the dumped rows is inside the archive (OPERATIONS.md).
export type DetachedResult = { status: string; archiveName: string | null; archiveBytes: number | null; archiveSha256: string | null; manifest: BackupManifest | null; schemaVersion: string | null; errorCode: BackupErrorCode | null; startedAt: Date; offsiteCopied: boolean };
export class BackupService {
  constructor(readonly database: Database, readonly options: BackupOptions) {}
  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) { this.options.log?.(level, message, data); }
  // Row writes are skipped for a detached run (the table may not exist yet); the caller records the result afterwards.
  private detached: DetachedResult | null = null;
  private async record(sql: string, values: unknown[]) { if (this.detached) return { rowCount: 1, rows: [] as { kind: string }[] }; return this.database.pool.query<{ kind: string }>(sql, values); }
  // Pre-upgrade backups for a release whose migrations introduce or change backup_runs: same barrier, snapshot,
  // encryption and offsite copy, but nothing is written to the database. The archive and sidecar manifest are the record.
  async executeDetached(kind: BackupKind): Promise<DetachedResult> {
    this.detached = { status: 'RUNNING', archiveName: null, archiveBytes: null, archiveSha256: null, manifest: null, schemaVersion: null, errorCode: null, startedAt: new Date(), offsiteCopied: false };
    try { this.detached.status = await this.execute(randomUUID(), false, kind); return this.detached; } finally { this.detached = null; }
  }

  async request(kind: BackupKind, requestedBy: string | null, reason: string | null): Promise<string> {
    const id = randomUUID();
    await this.database.pool.query("insert into backup_runs(id,kind,status,requested_by,reason,installation_id,release_version) values($1,$2,'REQUESTED',$3,$4,$5,$6)", [id, kind, requestedBy, reason, this.options.installationId, this.options.releaseVersion]);
    return id;
  }
  // Scheduled entry point: an overlapping run is recorded as SKIPPED so the gap is visible, never silently lost.
  async runScheduled(): Promise<{ id: string; status: string }> {
    const id = await this.request('SCHEDULED', null, null);
    return { id, status: await this.execute(id, true) };
  }
  // Sweep entry point: executes the oldest requested run when no other run holds the lock.
  async runRequested(): Promise<{ id: string; status: string } | null> {
    const next = (await this.database.pool.query<Run>("select id,kind,status,archive_name,requested_at from backup_runs where status='REQUESTED' order by requested_at,id limit 1")).rows[0];
    if (!next) return null;
    return { id: next.id, status: await this.execute(next.id, false) };
  }
  async execute(runId: string, skipOnOverlap: boolean, detachedKind?: BackupKind): Promise<string> {
    const client = await this.database.pool.connect(); let locked = false; let partial: string | null = null; let dumpPath: string | null = null;
    const fail = async (code: BackupErrorCode, detail: string, status: 'FAILED' | 'SKIPPED' = 'FAILED') => {
      this.log('error', 'backup run failed', { runId, code, detail: redact(detail) });
      if (this.detached) this.detached.errorCode = code;
      await this.record("update backup_runs set status=$2,error_code=$3,finished_at=now() where id=$1 and status in ('REQUESTED','RUNNING')", [runId, status, code]);
      return status;
    };
    try {
      locked = (await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [BACKUP_RUN_LOCK])).rows[0].ok;
      if (!locked) { if (skipOnOverlap) return fail('OVERLAP', 'another backup or restore holds the run lock', 'SKIPPED'); this.log('warn', 'backup run deferred: another run is active', { runId }); return 'REQUESTED'; }
      const claimed = await this.record("update backup_runs set status='RUNNING',started_at=now() where id=$1 and status='REQUESTED' returning kind", [runId]);
      if (!claimed.rowCount) return 'REQUESTED';
      const kind = detachedKind ?? (claimed.rows[0].kind as BackupKind); const startedAt = new Date(); const key = parseKey(this.options.encryptionKey);
      await mkdir(this.options.backupDir, { recursive: true, mode: 0o700 });
      const name = archiveName(this.options.installationId, kind, startedAt, runId); const finalPath = join(this.options.backupDir, name); partial = `${finalPath}.partial`;
      const out = createWriteStream(partial, { mode: 0o600 }); const cipher = encryptingStream(key); cipher.pipe(out);
      const files: ManifestFile[] = [];
      // Barrier: wait for in-flight uploads/removals, then export the snapshot the dump will use.
      await client.query('begin isolation level repeatable read read only');
      await client.query('select pg_advisory_lock($1)', [FILE_LOCK]);
      let snapshot: string; let schemaVersion: string | null;
      try {
        snapshot = (await client.query<{ id: string }>('select pg_export_snapshot() as id')).rows[0].id;
        schemaVersion = (await schemaStatus(client)).version;
        try {
          for (const namespace of FILE_NAMESPACES) {
            const directory = resolve(this.options.privateFilesDir, namespace);
            let entries: string[]; try { entries = (await readdir(directory)).filter((entry) => /^[0-9a-f-]{36}\.blob$/.test(entry)).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
            for (const entry of entries) {
              const path = join(directory, entry); const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) continue;
              const tarName = `files/${namespace}/${entry}`; const sha256 = await writeTarEntry(cipher, tarName, info.size, createReadStream(path));
              files.push({ entry: tarName, namespace, key: entry.slice(0, -5), bytes: info.size, sha256 });
            }
          }
        } catch (error) { throw new BackupFailure('FILES_FAILED', error instanceof Error ? error.message : String(error)); }
      } finally { await client.query('select pg_advisory_unlock($1)', [FILE_LOCK]).catch(() => undefined); }
      // Writers resume here; the dump still sees exactly the barrier moment through the exported snapshot.
      dumpPath = `${finalPath}.dump.tmp`;
      const connection = connectionArguments(this.options.databaseUrl);
      try { await runTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--exclude-schema=pgboss', `--snapshot=${snapshot}`, `--file=${dumpPath}`, ...connection.args], connection.env, this.options.environment); }
      catch (error) { throw new BackupFailure('PG_DUMP_FAILED', error instanceof ToolError ? `${error.message}: ${error.stderr}` : String(error)); }
      await client.query('commit');
      let manifest: BackupManifest;
      try {
        const dumpSize = (await stat(dumpPath)).size; const dumpSha = await writeTarEntry(cipher, 'database.dump', dumpSize, createReadStream(dumpPath));
        manifest = { format: MANIFEST_FORMAT, runId, kind, installationId: this.options.installationId, releaseVersion: this.options.releaseVersion, schemaVersion, createdAt: startedAt.toISOString(),
          database: { entry: 'database.dump', bytes: dumpSize, sha256: dumpSha, excludedSchemas: ['pgboss'] }, files, counts: { files: files.length, fileBytes: files.reduce((sum, file) => sum + file.bytes, 0) } };
        const manifestBytes = Buffer.from(JSON.stringify(manifest)); await writeTarEntry(cipher, 'manifest.json', manifestBytes.length, manifestBytes);
        await finishTar(cipher); cipher.end(); await once(out, 'finish');
        await rm(dumpPath, { force: true }); dumpPath = null;
        const archiveSha256 = await sha256File(partial); const archiveBytes = (await stat(partial)).size;
        await rename(partial, finalPath); partial = null;
        await writeFile(`${finalPath}.manifest.json`, JSON.stringify({ ...manifest, archiveName: name, archiveBytes, archiveSha256 }, null, 1), { mode: 0o600 });
        const summary = { ...manifest, files: undefined };
        if (this.detached) Object.assign(this.detached, { archiveName: name, archiveBytes, archiveSha256, manifest, schemaVersion });
        await this.record("update backup_runs set status='SUCCEEDED',finished_at=now(),schema_version=$2,archive_name=$3,archive_bytes=$4,archive_sha256=$5,manifest=$6,error_code=null where id=$1", [runId, schemaVersion, name, archiveBytes, archiveSha256, JSON.stringify(summary)]);
        this.log('info', 'backup run succeeded', { runId, archive: name, files: files.length, bytes: archiveBytes });
      } catch (error) { throw error instanceof BackupFailure ? error : new BackupFailure('ARCHIVE_FAILED', error instanceof Error ? error.message : String(error)); }
      try { await this.copyOffsite(finalPath, name); if (this.detached) this.detached.offsiteCopied = true; await this.record('update backup_runs set offsite_copied_at=now() where id=$1', [runId]); }
      catch (error) { this.log('error', 'offsite copy failed; archive is local only', { runId, detail: redact(error instanceof Error ? error.message : String(error)) }); if (this.detached) this.detached.errorCode = 'OFFSITE_FAILED'; await this.record("update backup_runs set error_code='OFFSITE_FAILED' where id=$1", [runId]); }
      if (!this.detached) try { await this.applyRetention(); } catch (error) { this.log('error', 'retention failed', { runId, detail: redact(error instanceof Error ? error.message : String(error)) }); await this.record("update backup_runs set error_code=coalesce(error_code,'RETENTION_FAILED') where id=$1", [runId]); }
      return 'SUCCEEDED';
    } catch (error) {
      if (partial) await rm(partial, { force: true }).catch(() => undefined);
      if (dumpPath) await rm(dumpPath, { force: true }).catch(() => undefined);
      await client.query('rollback').catch(() => undefined);
      return fail(error instanceof BackupFailure ? error.code : 'ARCHIVE_FAILED', error instanceof Error ? error.message : String(error));
    } finally {
      if (locked) await client.query('select pg_advisory_unlock_all()').catch(() => undefined);
      client.release();
    }
  }
  private async copyOffsite(archivePath: string, name: string): Promise<void> {
    const directory = offsiteDirectory(this.options.target); if (!directory) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = join(directory, name); await copyFile(archivePath, `${target}.partial`);
    if ((await sha256File(`${target}.partial`)) !== (await sha256File(archivePath))) { await rm(`${target}.partial`, { force: true }); throw new Error('offsite copy checksum mismatch'); }
    await rename(`${target}.partial`, target); await copyFile(`${archivePath}.manifest.json`, `${target}.manifest.json`);
  }
  // Deletes expired sets locally and in the offsite directory (when configured) and records the deletion.
  async applyRetention(): Promise<string[]> {
    const rows = (await this.database.pool.query<{ id: string; kind: BackupKind; started_at: Date; archive_name: string }>("select id,kind,started_at,archive_name from backup_runs where status='SUCCEEDED' and archive_deleted_at is null and archive_name is not null")).rows;
    const expired = selectExpired(rows.map((row) => ({ kind: row.kind, createdAt: row.started_at, ref: row })), this.options.retention);
    const offsite = offsiteDirectory(this.options.target); const deleted: string[] = [];
    for (const set of expired) {
      for (const directory of [this.options.backupDir, ...(offsite ? [offsite] : [])]) {
        await rm(join(directory, set.ref.archive_name), { force: true }); await rm(join(directory, `${set.ref.archive_name}.manifest.json`), { force: true });
      }
      await this.database.pool.query('update backup_runs set archive_deleted_at=now() where id=$1', [set.ref.id]); deleted.push(set.ref.archive_name);
    }
    if (deleted.length) this.log('info', 'expired recovery sets removed', { count: deleted.length });
    return deleted;
  }
}
