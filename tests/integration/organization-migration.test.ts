import { spawn } from 'node:child_process';
import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createDatabase } from '@nursery/db';
import { expect, it } from 'vitest';

loadDotenv({ quiet: true });
it.each([3,5,18,19,20,22])('upgrades an actual Phase %i schema once, preserves identity/reservations, and does not reseed edited roles on rerun',async (phase) => {
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
    for (const name of phase>=18 ? (await readdir(resolve('packages/db/src/migrations'))).filter(name=>name.endsWith('.sql')&&name<(phase===22?'0023':phase===20?'0022':phase===19?'0021':'0020')).sort() : ['0000_installation_baseline.sql','0001_authentication.sql',...(phase>=5 ? ['0002_organization_policy.sql','0003_licensing_settings.sql'] : [])]) {
      await database.pool.query(await readFile(resolve('packages/db/src/migrations',name),'utf8'));
      await database.pool.query('insert into schema_migrations(name) values($1)',[name]);
    }
    const id = crypto.randomUUID();
    // No authentication is attempted with this schema-only identity fixture.
    await database.pool.query("insert into accounts(id,kind,username_normalized,password_hash) values($1,'STAFF','migration-staff','schema-fixture-no-login')",[id]);
    const oldAccount = (await database.pool.query('select id,kind,password_hash,version from accounts where id=$1',[id])).rows[0];
    if (phase>=5) {
      await database.pool.query("insert into seat_reservations(id,kind,account_id) values($1,'EMPLOYEE',$2)",[crypto.randomUUID(),id]);
      await database.pool.query("update roles set name='Before upgrade' where name='Teacher'");
    }
    const oldSeats = phase>=5 ? (await database.pool.query('select * from seat_reservations')).rows : [];
    const first = await migrate(); expect(first.code).toBe(0); expect(first.output).toBe((phase===22 ? '' : phase===20 ? 'Applied 0022_imports.sql\n' : phase===19 ? 'Applied 0021_reports_exports.sql\nApplied 0022_imports.sql\n' : phase===18 ? 'Applied 0020_employee_payroll.sql\nApplied 0021_reports_exports.sql\nApplied 0022_imports.sql\n' : (phase===3 ? 'Applied 0002_organization_policy.sql\nApplied 0003_licensing_settings.sql\n' : '')+'Applied 0004_children_guardians.sql\nApplied 0005_safety.sql\nApplied 0006_learning.sql\nApplied 0007_attendance.sql\nApplied 0008_exams.sql\nApplied 0009_homework.sql\nApplied 0010_communication.sql\nApplied 0011_financial_core.sql\nApplied 0012_billing.sql\nApplied 0013_collections.sql\nApplied 0014_spending.sql\nApplied 0015_closing.sql\nApplied 0016_corrections_refunds.sql\nApplied 0017_child_branch_transfers.sql\nApplied 0018_bus_trips_activities.sql\nApplied 0019_trip_reduction_invariant.sql\nApplied 0020_employee_payroll.sql\nApplied 0021_reports_exports.sql\nApplied 0022_imports.sql\n')+'Applied 0023_support_backups.sql\n');
    if (phase>=5) {
      expect((await database.pool.query('select * from seat_reservations')).rows).toEqual(oldSeats);
      expect((await database.pool.query("select count(*)::int as count from roles where name='Before upgrade'")).rows[0].count).toBe(1);
    }
    expect((await database.pool.query('select id,kind,password_hash,version from accounts where id=$1',[id])).rows[0]).toEqual(oldAccount);
    expect((await database.pool.query('select scope_mode,assignment_version from accounts where id=$1',[id])).rows[0]).toEqual({ scope_mode: 'CLASSROOM',assignment_version: 1 });
    expect((await database.pool.query('select count(*)::int as count from account_roles')).rows[0].count).toBe(0);
    await database.pool.query("update roles set name='Edited template' where name=any($1::text[])",[['Teacher','Before upgrade']]);
    const second = await migrate(); expect(second.code).toBe(0); expect(second.output).toBe('');
    expect((await database.pool.query("select count(*)::int as count from roles where name='Edited template'")).rows[0].count).toBe(1);
    expect((await database.pool.query('select count(*)::int as count from schema_migrations')).rows[0].count).toBe(24);
    expect((await database.pool.query("select reserved from capabilities where key='imports.commit'")).rows).toEqual([{ reserved: false }]);
    expect((await database.pool.query("select reserved from capabilities where key='support.restore'")).rows).toEqual([{ reserved: true }]);
    expect((await database.pool.query("select count(*)::int as count from backup_runs")).rows[0].count).toBe(0);
  } finally {
    await database.close();
    if (!/^phase04_migration_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid fixture schema');
    await admin.pool.query(`drop schema ${schema} cascade`); await admin.close();
  }
});
