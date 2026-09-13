import { config as loadDotenv } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/index.js';

loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations.');
const directory = join(dirname(fileURLToPath(import.meta.url)), '../src/migrations');
const database = createDatabase(databaseUrl);
try {
  await database.pool.query('select pg_advisory_lock(7190101)');
  await database.pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    const applied = await database.pool.query('select 1 from schema_migrations where name = $1', [name]);
    if (applied.rowCount) continue;
    await database.transaction(async (transaction) => {
      await transaction.query(await readFile(join(directory, name), 'utf8'));
      await transaction.query('insert into schema_migrations (name) values ($1)', [name]);
    });
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  await database.pool.query('select pg_advisory_unlock(7190101)').catch(() => undefined);
  await database.close();
}
