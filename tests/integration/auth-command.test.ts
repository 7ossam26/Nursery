import { spawn } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { authFixture } from '../helpers/auth.js';

describe('private-stdin authentication operator commands', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  beforeAll(async () => { fixture = await authFixture(); }, 30_000);
  afterAll(async () => { await fixture?.close(); });
  function run(mode: string, payload: unknown): Promise<{ code: number | null; output: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/auth-command.ts', mode], { windowsHide: true, env: { ...process.env, DATABASE_URL: fixture.config.databaseUrl, INSTALLATION_ID: fixture.config.installationId }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', (chunk) => { output += String(chunk); }); child.stderr.on('data', (chunk) => { output += String(chunk); });
      child.on('error', reject); child.on('close', (code) => resolve({ code, output }));
      child.stdin.end(JSON.stringify(payload));
    });
  }
  it('bootstraps once, rejects reuse, and recovers only the existing root without printing secrets', async () => {
    const password = 'Private stdin bootstrap phrase 2026';
    const first = await run('bootstrap', { username: 'local-operator', password });
    expect(first.code).toBe(0); expect(first.output).not.toContain(password);
    const accountId = (await fixture.database.pool.query('select account_id from authentication_bootstrap')).rows[0].account_id;
    const repeated = await run('bootstrap', { username: 'another-root', password });
    expect(repeated.code).toBe(1); expect(repeated.output).toContain('BOOTSTRAP_COMPLETE'); expect(repeated.output).not.toContain(password);
    const signed = await fixture.app.auth.login('local-operator', password);
    const recovery = await run('recover-system', { password: 'Private recovery replacement phrase' });
    expect(recovery.code).toBe(0); expect(recovery.output).not.toContain('Private recovery replacement phrase');
    await expect(fixture.app.auth.authenticate(signed.token, true)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const recovered = await fixture.app.auth.login('local-operator', 'Private recovery replacement phrase');
    expect(recovered.account.id).toBe(accountId); expect(recovered.account.mustChangePassword).toBe(true);
    const invalid = await run('bootstrap', { username: 'invalid', password: 'Secret marker in invalid payload', kind: 'SYSTEM' });
    expect(invalid.code).toBe(1); expect(invalid.output).not.toContain('Secret marker');
  });
});
