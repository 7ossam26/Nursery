import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export type Database = ReturnType<typeof createDatabase>;
export type Transaction = PoolClient;

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return {
    pool,
    orm: drizzle({ client: pool }),
    async checkConnection(): Promise<void> { await pool.query('select 1'); },
    async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
      const transaction = await pool.connect();
      try { await transaction.query('begin'); const result = await work(transaction); await transaction.query('commit'); return result; }
      catch (error) { await transaction.query('rollback'); throw error; }
      finally { transaction.release(); }
    },
    async close(): Promise<void> { await pool.end(); }
  };
}

export async function queryOne<T extends QueryResultRow>(transaction: Transaction, sql: string, values: readonly unknown[] = []): Promise<T | undefined> {
  return (await transaction.query<T>(sql, [...values])).rows[0];
}
export * from './obligations.js';
export * from './billing.js';
