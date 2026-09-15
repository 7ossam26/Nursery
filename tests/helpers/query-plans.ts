import type { Database, Transaction } from '@nursery/db';

// Instrument the real transaction; no query/result/authorization is replaced.
// Use only for a single isolated call with no concurrent fixture work.
export async function explainServiceReads<T>(database: Database, work: () => Promise<T>, include: (sql: string) => boolean) {
  const original = database.transaction;
  const plans: { sql: string; plan: unknown }[] = [];
  database.transaction = async function<R>(operation: (tx: Transaction) => Promise<R>): Promise<R> {
    return original(async tx => {
      const unbound = tx.query;
      const query = tx.query.bind(tx);
      const statements: { sql: string; values?: unknown[] }[] = [];
      tx.query = ((sql: string, values?: unknown[]) => {
        if (typeof sql === 'string' && /^\s*select\b/i.test(sql) && include(sql)) statements.push({ sql, values });
        return query(sql, values);
      }) as typeof tx.query;
      try {
        const result = await operation(tx);
        tx.query = unbound;
        for (const statement of statements) plans.push({ sql: statement.sql, plan: (await query(`explain (analyze,buffers,format json) ${statement.sql}`, statement.values)).rows[0]['QUERY PLAN'] });
        return result;
      } finally { tx.query = unbound; }
    });
  };
  try { await work(); return plans; } finally { database.transaction = original; }
}
