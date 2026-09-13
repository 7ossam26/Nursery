import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { authFixture } from '../helpers/auth.js';
import { tokenHash } from '../../apps/api/src/modules/auth/crypto.js';

describe('authentication API with real PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const rootPassword = 'Root permanent password 2026';
  let root: { cookie: string; csrf: string; token: string; id: string };
  beforeAll(async () => { fixture = await authFixture(); }, 30_000);
  afterAll(async () => { await fixture?.close(); });
  const session = (response: { cookies: { name: string; value: string }[]; json: () => { data: { csrfToken: string; account: { id: string } } } }) => {
    const cookie = response.cookies.find((item) => item.name === '__Host-nursery_session')!;
    return { cookie: `${cookie.name}=${cookie.value}`, token: cookie.value, csrf: response.json().data.csrfToken, id: response.json().data.account.id };
  };
  async function login(username: string, password: string) {
    const pre = await fixture.app.inject('/api/v1/auth/csrf');
    return fixture.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: fixture.config.appOrigin, 'content-type': 'application/json', cookie: `${pre.cookies[0].name}=${pre.cookies[0].value}`, 'x-csrf-token': pre.json().data.csrfToken }, payload: { username, password } });
  }
  function mutate(auth: typeof root, path: string, payload = {}, method: 'POST' | 'PATCH' = 'POST') {
    return fixture.app.inject({ method, url: `/api/v1/auth/${path}`, headers: { origin: fixture.config.appOrigin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, payload });
  }
  it('serializes concurrent bootstrap and enforces single SYSTEM plus immutable kinds', async () => {
    const results = await Promise.allSettled([fixture.app.auth.bootstrap(' SuperAdmin ', fixture.secret), fixture.app.auth.bootstrap('second-root', fixture.secret)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await fixture.database.pool.query("select count(*)::int as count from accounts where kind='SYSTEM'")).rows[0].count).toBe(1);
    const name = (await fixture.database.pool.query("select username_normalized from accounts where kind='SYSTEM'")).rows[0].username_normalized;
    const signed = await login(name.toUpperCase(), fixture.secret);
    expect(signed.statusCode).toBe(200);
    const setup = session(signed);
    expect(signed.json().data.account).toMatchObject({ mustChangePassword: true, capabilities: [], policyReady: false });
    expect((await mutate(setup, 'rotate')).json().code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await login(name, fixture.secret)).json().code).toBe('INVALID_CREDENTIALS');
    const changed = await mutate(setup, 'password', { currentPassword: fixture.secret, newPassword: rootPassword });
    expect(changed.statusCode).toBe(200); root = session(changed);
    expect((await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: setup.cookie } })).statusCode).toBe(401);
    const staff = await fixture.account();
    await expect(fixture.database.pool.query("update accounts set kind='SYSTEM' where id=$1", [staff.id])).rejects.toThrow('immutable');
    await expect(fixture.app.auth.bootstrap('third-root', fixture.secret)).rejects.toMatchObject({ code: 'BOOTSTRAP_COMPLETE' });
  });
  it('rejects invalid credentials without enumeration and never stores plaintext secrets', async () => {
    const staff = await fixture.account('STAFF', 'mixed.case');
    const known = await login(staff.username, 'wrong-password');
    const unknown = await login('unknown-account', 'wrong-password');
    expect(known.statusCode).toBe(401); expect(unknown.statusCode).toBe(401);
    expect({ ...known.json(), requestId: '' }).toEqual({ ...unknown.json(), requestId: '' });
    const good = await login('  ＭＩＸＥＤ.CASE  ', staff.password);
    expect(good.statusCode).toBe(200);
    expect(good.json().data.account.capabilities).toEqual([]);
    const auth = session(good);
    const row = (await fixture.database.pool.query('select a.password_hash,s.token_hash from accounts a join sessions s on s.account_id=a.id where s.token_hash=$1', [tokenHash(auth.token)])).rows[0];
    expect(row.password_hash).toMatch(/^scrypt\$131072\$8\$1\$/); expect(row.password_hash).not.toContain(staff.password); expect(row.token_hash).not.toBe(auth.token);
    expect(JSON.stringify((await fixture.database.pool.query('select * from auth_audit_events')).rows)).not.toContain(staff.password);
  });
  it('rejects CSRF, cross-origin, malformed and unauthorized mutations and sets HTTPS headers', async () => {
    expect((await fixture.app.inject('/api/v1/auth/me')).statusCode).toBe(401);
    for (const headers of [{}, { origin: 'https://evil.example', 'x-csrf-token': root.csrf }, { origin: fixture.config.appOrigin, 'x-csrf-token': 'wrong' }]) {
      const response = await fixture.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: root.cookie, 'content-type': 'application/json', ...headers }, payload: {} });
      expect(response.statusCode).toBe(403); expect(response.json().code).toBe('CSRF_REJECTED');
    }
    const pre = await fixture.app.inject('/api/v1/auth/csrf');
    const cookie = String(pre.headers['set-cookie']);
    expect(cookie).toContain('__Host-'); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).not.toContain('Domain=');
    expect(pre.headers['cache-control']).toBe('no-store'); expect(pre.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(pre.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    const malformed = await fixture.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: fixture.config.appOrigin, cookie: root.cookie, 'x-csrf-token': root.csrf, 'content-type': 'application/json' }, payload: '{"password":"NEVER_LOG_ME",' });
    expect(malformed.statusCode).toBe(400); expect(malformed.body).not.toContain('NEVER_LOG_ME');
    const massAssignment = await mutate(root, 'locale', { locale: 'ar-EG', kind: 'SYSTEM', capabilities: ['*'] }, 'PATCH');
    expect(massAssignment.statusCode).toBe(400);
  });
  it('rotates without extending absolute expiry, rejects old tokens, and revokes logout', async () => {
    const staff = await fixture.account(); const signed = await login(staff.username, staff.password); const old = session(signed);
    const rotated = await mutate(old, 'rotate'); expect(rotated.statusCode).toBe(200);
    expect(rotated.json().data.expiresAt).toBe(signed.json().data.expiresAt);
    const current = session(rotated); expect(current.token).not.toBe(old.token);
    await expect(fixture.app.auth.assertSessionActive(old.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const out = await mutate(current, 'logout'); expect(out.statusCode).toBe(204); expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: current.cookie } })).statusCode).toBe(401);
  });
  it('enforces absolute and idle expiry', async () => {
    for (const field of ['expires_at', 'idle_expires_at']) {
      const staff = await fixture.account(); const auth = session(await login(staff.username, staff.password));
      await fixture.database.pool.query(`update sessions set ${field}=now()-interval '1 second' where token_hash=$1`, [tokenHash(auth.token)]);
      expect((await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: auth.cookie } })).json().code).toBe('SESSION_EXPIRED');
    }
  });
  it('resets only through SYSTEM, revokes concurrent sessions, and forces a one-time password change', async () => {
    const staff = await fixture.account(); const auth = session(await login(staff.username, staff.password));
    expect((await mutate(auth, `accounts/${root.id}/reset-password`, { operatorPassword: staff.password })).statusCode).toBe(403);
    expect((await mutate(root, `accounts/${staff.id}/reset-password`, { operatorPassword: 'wrong' })).statusCode).toBe(401);
    const [reset, racedLogin] = await Promise.all([mutate(root, `accounts/${staff.id}/reset-password`, { operatorPassword: rootPassword }), login(staff.username, staff.password)]);
    expect(reset.statusCode).toBe(200);
    await expect(fixture.app.auth.assertSessionActive(auth.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    if (racedLogin.statusCode === 200) await expect(fixture.app.auth.assertSessionActive(session(racedLogin).token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await login(staff.username, staff.password)).statusCode).toBe(401);
    const temporary = reset.json().data.temporaryPassword;
    const setup = session(await login(staff.username, temporary));
    const changed = await mutate(setup, 'password', { currentPassword: temporary, newPassword: 'A fresh permanent password 2026' });
    expect(changed.statusCode).toBe(200); expect(changed.json().data.account.mustChangePassword).toBe(false);
    expect((await login(staff.username, temporary)).statusCode).toBe(401);
    expect((await login(staff.username, 'A fresh permanent password 2026')).statusCode).toBe(200);
  });
  it('enforces status on requests and exposes only public copy; an ended block permits a fresh login', async () => {
    const staff = await fixture.account('GUARDIAN'); const auth = session(await login(staff.username, staff.password));
    await fixture.app.auth.changeStatus(root.token, staff.id, { status: 'BLOCKED', reason: 'private reason NEVER_PUBLIC', publicMessage: 'Please contact reception.' });
    const response = await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: auth.cookie } });
    expect(response.statusCode).toBe(403); expect(response.json()).toMatchObject({ code: 'ACCOUNT_BLOCKED', publicMessage: 'Please contact reception.' }); expect(response.body).not.toContain('NEVER_PUBLIC');
    expect((await login(staff.username, 'wrong')).json().code).toBe('INVALID_CREDENTIALS');
    await fixture.app.auth.changeStatus(root.token, staff.id, { status: 'BLOCKED', reason: 'ended test block', untilDate: '2020-01-01' });
    expect((await login(staff.username, staff.password)).statusCode).toBe(200);
    expect((await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: auth.cookie } })).statusCode).toBe(401);
    for (const status of ['DISABLED', 'ARCHIVED', 'RELEASED'] as const) {
      await fixture.app.auth.changeStatus(root.token, staff.id, { status, reason: 'fixture transition' });
      expect((await login(staff.username, staff.password)).json().code).toBe('ACCOUNT_DISABLED');
    }
    expect((await fixture.database.pool.query('select count(*)::int as count from account_status_history where account_id=$1', [staff.id])).rows[0].count).toBe(5);
  });
  it('rolls back password replacement and revocation when audit persistence fails', async () => {
    const staff = await fixture.account(); const signed = await fixture.app.auth.login(staff.username, staff.password);
    await fixture.database.pool.query("alter table auth_audit_events add constraint test_audit_failure check(event <> 'auth.password_reset') not valid");
    try {
      await expect(fixture.app.auth.resetPassword(root.token, staff.id, rootPassword)).rejects.toThrow();
      expect((await fixture.app.auth.assertSessionActive(signed.token)).id).toBe(staff.id);
      expect((await fixture.app.auth.login(staff.username, staff.password)).account.mustChangePassword).toBe(false);
    } finally { await fixture.database.pool.query('alter table auth_audit_events drop constraint test_audit_failure'); }
  });
  it('rejects expired temporary credentials and expiry during password setup', async () => {
    const staff = await fixture.account();
    const temporary = await fixture.app.auth.resetPassword(root.token, staff.id, rootPassword);
    await fixture.database.pool.query("update accounts set temporary_expires_at=now()-interval '1 second' where id=$1", [staff.id]);
    await expect(fixture.app.auth.login(staff.username, temporary)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const replacement = await fixture.app.auth.resetPassword(root.token, staff.id, rootPassword);
    const setup = await fixture.app.auth.login(staff.username, replacement);
    await fixture.database.pool.query("update sessions set expires_at=now()-interval '1 second' where id=$1", [setup.sessionId]);
    await expect(fixture.app.auth.changePassword(setup.token, replacement, 'Permanent phrase after expiry')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('persists locale and rate-limits concurrent attempts across service instances', async () => {
    expect((await mutate(root, 'locale', { locale: 'ar-EG' }, 'PATCH')).statusCode).toBe(204);
    expect((await fixture.app.inject({ url: '/api/v1/auth/me', headers: { cookie: root.cookie } })).json().data.account.locale).toBe('ar-EG');
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => fixture.app.auth.rateLimit(`test-ip-${index}`, 'rate-test-user')));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    await fixture.app.auth.rateLimit('http-limit-ip', 'limited-account').catch(() => undefined);
    for (let index = 0; index < 10; index++) await fixture.app.auth.rateLimit(`ip-${index}`, 'limited-account').catch(() => undefined);
    const limited = await login('limited-account', 'invalid'); expect(limited.statusCode).toBe(429); expect(limited.headers['retry-after']).toBe('900');
  });
  it('local recovery updates the reserved account and revokes every old SYSTEM session', async () => {
    await fixture.app.auth.recoverSystem('Recovered root temporary phrase');
    await expect(fixture.app.auth.assertSessionActive(root.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await fixture.database.pool.query("select count(*)::int as count from accounts where kind='SYSTEM'")).rows[0].count).toBe(1);
  });
});
