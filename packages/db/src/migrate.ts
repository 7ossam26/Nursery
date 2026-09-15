import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

export const MIGRATION_LOCK = 7190101;
export const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
type Queryable = Pick<Pool, 'query'>;

export async function installationIdentity(db: Queryable): Promise<string | null> {
  const exists = (await db.query<{ ok: string | null }>("select to_regclass('installation_baseline')::text as ok")).rows[0]?.ok;
  if (!exists) return null;
  const rows = (await db.query<{ id: string }>('select id::text as id from installation_baseline order by id')).rows;
  if (rows.length > 1) throw new Error('Database has more than one installation identity; refuse to start until the baseline is repaired.');
  return rows[0]?.id ?? null;
}

export async function assertInstallationIdentity(db: Queryable, expectedInstallationId: string): Promise<void> {
  const actual = await installationIdentity(db);
  // An empty, current database is allowed so the first-run bootstrap can establish the immutable baseline.
  if (actual && actual !== expectedInstallationId) throw new Error(`Database belongs to installation ${actual}, but INSTALLATION_ID is ${expectedInstallationId}; refusing to start.`);
}

export async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
}
// The checked-in file list is the code's schema expectation; the table records what a database actually received.
export async function schemaStatus(db: Queryable): Promise<{ files: string[]; applied: string[]; pending: string[]; unknown: string[]; version: string | null }> {
  const files = await migrationFiles();
  const exists = (await db.query<{ ok: string | null }>("select to_regclass('schema_migrations')::text as ok")).rows[0]?.ok;
  const applied = exists ? (await db.query<{ name: string }>('select name from schema_migrations order by name')).rows.map((r) => r.name) : [];
  return { files, applied, pending: files.filter((name) => !applied.includes(name)), unknown: applied.filter((name) => !files.includes(name)), version: applied.at(-1) ?? null };
}
// Applies each pending file once inside its own transaction. Callers that share one database with other
// processes keep the advisory lock (default); isolated test fixtures may skip it.
export async function applyMigrations(pool: Pool, options: { lock?: boolean; log?: (line: string) => void } = {}): Promise<string[]> {
  const lock = options.lock ?? true; const applied: string[] = [];
  if (lock) await pool.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
  try {
    await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const status = await schemaStatus(pool);
    if (status.unknown.length) throw new Error(`Database records migrations this release does not know: ${status.unknown.join(', ')}`);
    for (const name of status.pending) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(await readFile(join(migrationsDirectory, name), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [name]);
        await client.query('commit');
      } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
      applied.push(name); options.log?.(`Applied ${name}`);
    }
    return applied;
  } finally {
    if (lock) await pool.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
  }
}
// API and worker refuse to serve against a database that is behind or ahead of their release.
export async function assertSchemaCurrent(db: Queryable, expectedInstallationId?: string): Promise<string> {
  const status = await schemaStatus(db);
  if (status.pending.length) throw new Error(`Database schema is behind this release; run the migration step first (pending: ${status.pending.join(', ')}).`);
  if (status.unknown.length) throw new Error(`Database schema is ahead of this release (unknown: ${status.unknown.join(', ')}); deploy a compatible release.`);
  if (expectedInstallationId) await assertInstallationIdentity(db, expectedInstallationId);
  return status.version ?? 'none';
}
