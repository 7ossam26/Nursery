import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { createDatabase, applyMigrations } from '@nursery/db';
import { buildApp } from '../../apps/api/src/app.js';
import { hashPassword } from '../../apps/api/src/modules/auth/crypto.js';
import { drainHttpRequests } from './http-drain.js';

loadDotenv({ quiet: true });
export async function authFixture(https = true) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required: authentication checks must use real PostgreSQL.');
  const admin = createDatabase(process.env.DATABASE_URL);
  const schema = `auth_test_${crypto.randomUUID().replaceAll('-', '')}`;
  await admin.pool.query(`create schema ${schema}`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const database = createDatabase(url.toString());
  const privateFilesDir = await mkdtemp(join(tmpdir(),'nursery-auth-files-'));
  try {
  // Same runner as `db:migrate` so fixtures carry a real schema_migrations ledger; isolated schemas need no shared lock.
  await applyMigrations(database.pool, { lock: false });
  const config = { databaseUrl: url.toString(), appOrigin: https ? 'https://nursery.example' : 'http://localhost:5173', sessionSecret: 'test-only-not-for-deployment-secret-123456789', installationId: crypto.randomUUID(), businessTimezone: 'Africa/Cairo', privateFilesDir, supportContact: 'Support', backupTarget: 'none', production: https };
  const app = buildApp(config, database);
  const secret = 'Fixture password phrase 2026';
  const hash = await hashPassword(secret);
  async function account(kind: 'STAFF' | 'GUARDIAN' = 'STAFF', username = `user-${crypto.randomUUID()}`) {
    const id = crypto.randomUUID();
    await database.pool.query('insert into accounts(id,kind,username_normalized,password_hash,must_change_password) values($1,$2,$3,$4,false)', [id, kind, username, hash]);
    return { id, username, password: secret };
  }
  return { app, database, config, account, secret, async close() {
    const address = app.server.address();
    if (address && typeof address !== 'string') await drainHttpRequests(`http://127.0.0.1:${address.port}`);
    // Scripted DOM pollers can leave a keep-alive socket mid-request at teardown; Fastify's 'idle' force-close then waits the
    // full 72s keepAliveTimeout for it. Disposable fixtures destroy remaining sockets first; production shutdown is unchanged.
    app.server.closeAllConnections();
    await app.close();
    await rm(privateFilesDir,{ recursive: true,force: true });
    if (!/^auth_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
    await admin.pool.query(`drop schema ${schema} cascade`);
    await admin.close();
  } };
  } catch (error) {
    await database.close();
    await rm(privateFilesDir,{ recursive: true,force: true });
    try { await admin.pool.query(`drop schema ${schema} cascade`); } finally { await admin.close(); }
    throw error;
  }
}
