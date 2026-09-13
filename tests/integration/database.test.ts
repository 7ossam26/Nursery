import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@nursery/db';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : undefined;

describe.skipIf(!database)('local PostgreSQL integration', () => {
  afterAll(async () => { await database?.close(); });

  it('connects and rolls back a real transaction', async () => {
    await database!.checkConnection();
    const table = `phase01_transaction_${crypto.randomUUID().replaceAll('-', '')}`;
    await database!.pool.query(`create table ${table} (id integer primary key)`);
    await expect(database!.transaction(async (transaction) => {
      await transaction.query(`insert into ${table} (id) values (1)`);
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    const result = await database!.pool.query(`select count(*)::integer as count from ${table}`);
    expect(result.rows[0]?.count).toBe(0);
    await database!.pool.query(`drop table ${table}`);
  });
});
