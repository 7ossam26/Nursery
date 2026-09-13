import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createDatabase } from '@nursery/db';
import { expect, it } from 'vitest';

loadDotenv({ quiet: true });
it('upgrades an actual Phase 03 schema once, preserves identity, and does not reseed edited roles on rerun',async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for real PostgreSQL migration verification');
  const admin = createDatabase(process.env.DATABASE_URL); const schema = `phase04_migration_${crypto.randomUUID().replaceAll('-','')}`;
  await admin.pool.query(`create schema ${schema}`);
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('options',`-c search_path=${schema}`); const database = createDatabase(url.toString());
  async function migrate() {
    return new Promise<{ code: number | null; output: string }>((resolve,reject) => {
      const child = spawn(process.execPath,['--import','tsx','packages/db/scripts/migrate.ts'],{ windowsHide: true,env: { ...process.env,DATABASE_URL: url.toString() },stdio: ['ignore','pipe','pipe'] });
      let output = ''; child.stdout.on('data',(c) => { output += String(c); }); child.stderr.on('data',(c) => { output += String(c); }); child.on('error',reject); child.on('close',(code) => resolve({ code,output }));
    });
  }
  try {
    await database.pool.query('create table schema_migrations(name text primary key,applied_at timestamptz not null default now())');
    for (const name of ['0000_installation_baseline.sql','0001_authentication.sql']) {
      await database.pool.query(await readFile(resolve('packages/db/src/migrations',name),'utf8'));
      await database.pool.query('insert into schema_migrations(name) values($1)',[name]);
    }
    const id = crypto.randomUUID();
    // No authentication is attempted with this schema-only identity fixture.
    await database.pool.query("insert into accounts(id,kind,username_normalized,password_hash) values($1,'STAFF','migration-staff','schema-fixture-no-login')",[id]);
    const oldAccount = (await database.pool.query('select id,kind,password_hash,version from accounts where id=$1',[id])).rows[0];
    const first = await migrate(); expect(first.code).toBe(0); expect(first.output).toBe('Applied 0002_organization_policy.sql\n');
    expect((await database.pool.query('select id,kind,password_hash,version from accounts where id=$1',[id])).rows[0]).toEqual(oldAccount);
    expect((await database.pool.query('select scope_mode,assignment_version from accounts where id=$1',[id])).rows[0]).toEqual({ scope_mode: 'CLASSROOM',assignment_version: 1 });
    expect((await database.pool.query('select count(*)::int as count from account_roles')).rows[0].count).toBe(0);
    await database.pool.query("update roles set name='Edited template' where name='Teacher'");
    const second = await migrate(); expect(second.code).toBe(0); expect(second.output).toBe('');
    expect((await database.pool.query("select count(*)::int as count from roles where name='Edited template'")).rows[0].count).toBe(1);
    expect((await database.pool.query('select count(*)::int as count from schema_migrations')).rows[0].count).toBe(3);
  } finally {
    await database.close();
    if (!/^phase04_migration_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid fixture schema');
    await admin.pool.query(`drop schema ${schema} cascade`); await admin.close();
  }
});
