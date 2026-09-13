import { randomUUID } from 'node:crypto';
import { type Database, type Transaction } from '@nursery/db';
import { type CurrentAccount, usernameSchema, passwordSchema } from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import { hashPassword, verifyPassword, randomToken, tokenHash, keyedHash } from './crypto.js';
import { loadPolicy } from '../organization/policy.js';

export const AUTH_DEFAULTS = { absoluteMs: 12 * 60 * 60_000, idleMs: 30 * 60_000, setupSessionMs: 15 * 60_000, temporaryMs: 24 * 60 * 60_000, rateWindowMs: 15 * 60_000 } as const;
type Status = 'ACTIVE' | 'BLOCKED' | 'DISABLED' | 'ARCHIVED' | 'RELEASED';
type Account = { id: string; kind: CurrentAccount['kind']; username_normalized: string; password_hash: string; status: Status; status_until: string | null; public_message: string | null; locale: CurrentAccount['locale']; version: number; must_change_password: boolean; temporary_expires_at: Date | null; temporary_used: boolean };
type Session = { id: string; account_id: string; account_version: number; expires_at: Date; idle_expires_at: Date; revoked_at: Date | null };
export type Authenticated = { account: CurrentAccount; sessionId: string; expiresAt: string; idleExpiresAt: string };
type IssuedSession = Authenticated & { token: string };
const invalidCredentials = () => new SafeError('INVALID_CREDENTIALS', 'auth.invalidCredentials', false, 401);
const expired = () => new SafeError('SESSION_EXPIRED', 'auth.sessionExpired', false, 401);

export class AuthService {
  constructor(readonly database: Database, private readonly installationId: string, private readonly secret: string) {}

  private async audit(tx: Transaction, event: string, actor?: string, target?: string) {
    await tx.query('insert into auth_audit_events(id,event,actor_id,target_id) values($1,$2,$3,$4)', [randomUUID(), event, actor ?? null, target ?? null]);
  }
  private async project(tx: Transaction, account: Account): Promise<CurrentAccount> {
    return (await loadPolicy(tx, { id: account.id, username: account.username_normalized, kind: account.kind, locale: account.locale, mustChangePassword: account.must_change_password,
      capabilities: [], policyReady: false })).account;
  }
  // Domain services hold their policy lock first, then sorted account locks, then session locks.
  async inTransaction(tx: Transaction, token: string, targetIds: string[] = []): Promise<CurrentAccount> {
    const found = (await tx.query<Session>('select * from sessions where token_hash=$1', [tokenHash(token)])).rows[0];
    if (!found) throw expired();
    await tx.query('select id from accounts where id=any($1::uuid[]) order by id for update', [[found.account_id, ...targetIds]]);
    return this.project(tx, (await this.checkSession(tx, token)).account);
  }
  private enforceStatus(account: Account) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const endedBlock = account.status === 'BLOCKED' && account.status_until !== null && account.status_until < today;
    if (account.status === 'ACTIVE' || endedBlock) return;
    throw new SafeError(account.status === 'BLOCKED' ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_DISABLED', 'auth.contactNursery', false, 403, account.public_message ?? undefined);
  }
  private async lockAccount(tx: Transaction, id: string): Promise<Account> {
    const account = (await tx.query<Account>('select *, status_until::text from accounts where id=$1 for update', [id])).rows[0];
    if (!account) throw expired();
    return account;
  }
  // Lock order is always accounts (sorted for multi-account operations), then sessions.
  private async checkSession(tx: Transaction, token: string, allowPasswordChange = false): Promise<{ account: Account; session: Session }> {
    const found = (await tx.query<Session>('select * from sessions where token_hash=$1', [tokenHash(token)])).rows[0];
    if (!found) throw expired();
    const account = await this.lockAccount(tx, found.account_id);
    const session = (await tx.query<Session>('select * from sessions where id=$1 for update', [found.id])).rows[0];
    // Check status before revocation to give an existing blocked session only the safe contact message.
    this.enforceStatus(account);
    if (!session || session.revoked_at || session.account_version !== account.version || session.expires_at.getTime() <= Date.now() || session.idle_expires_at.getTime() <= Date.now()) throw expired();
    if (account.must_change_password && !allowPasswordChange) throw new SafeError('PASSWORD_CHANGE_REQUIRED', 'auth.passwordRequired', false, 403);
    return { account, session };
  }
  private async issue(tx: Transaction, account: Account, absoluteExpiry?: Date): Promise<IssuedSession> {
    const token = randomToken(); const id = randomUUID(); const now = Date.now();
    const expiry = absoluteExpiry ?? new Date(now + (account.must_change_password ? AUTH_DEFAULTS.setupSessionMs : AUTH_DEFAULTS.absoluteMs));
    const idleExpiry = new Date(Math.min(expiry.getTime(), now + AUTH_DEFAULTS.idleMs));
    await tx.query('insert into sessions(id,account_id,token_hash,account_version,expires_at,idle_expires_at) values($1,$2,$3,$4,$5,$6)', [id, account.id, tokenHash(token), account.version, expiry, idleExpiry]);
    return { token, sessionId: id, expiresAt: expiry.toISOString(), idleExpiresAt: idleExpiry.toISOString(), account: await this.project(tx, account) };
  }
  private async revoke(tx: Transaction, accountId: string) {
    await tx.query('update sessions set revoked_at=coalesce(revoked_at,now()) where account_id=$1', [accountId]);
    // Delivered after commit. Later streams use this as a wake-up hint, and revalidate before every dispatch.
    await tx.query("select pg_notify('auth_revoked',$1)", [accountId]);
  }
  async bootstrap(username: string, password: string): Promise<void> {
    const normalized = usernameSchema.parse(username); passwordSchema.parse(password);
    const hash = await hashPassword(password);
    await this.database.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(7190301)');
      if ((await tx.query('select 1 from authentication_bootstrap')).rowCount || (await tx.query("select 1 from accounts where kind='SYSTEM'")).rowCount) throw new SafeError('BOOTSTRAP_COMPLETE', 'auth.bootstrapComplete', false, 409);
      await tx.query('insert into installation_baseline(id) values($1) on conflict do nothing', [this.installationId]);
      const id = randomUUID();
      await tx.query("insert into accounts(id,kind,username_normalized,password_hash,temporary_expires_at) values($1,'SYSTEM',$2,$3,$4)", [id, normalized, hash, new Date(Date.now() + AUTH_DEFAULTS.temporaryMs)]);
      await tx.query('insert into authentication_bootstrap(installation_id,account_id) values($1,$2)', [this.installationId, id]);
      await this.audit(tx, 'auth.bootstrap', id, id);
    });
  }
  async recoverSystem(password: string): Promise<void> {
    passwordSchema.parse(password); const hash = await hashPassword(password);
    await this.database.transaction(async (tx) => {
      const marker = (await tx.query<{ account_id: string }>('select account_id from authentication_bootstrap where installation_id=$1', [this.installationId])).rows[0];
      if (!marker) throw new SafeError('NOT_FOUND', 'auth.recoveryUnavailable', false, 404);
      const account = await this.lockAccount(tx, marker.account_id);
      await this.replacePassword(tx, account, hash, true);
      await this.audit(tx, 'auth.local_recovery', account.id, account.id);
    });
  }
  // Database counters make limits shared by all API processes; keys never contain raw identifiers.
  async rateLimit(ip: string, identity: string): Promise<void> {
    const blocked = await this.database.transaction(async (tx) => {
      await tx.query('delete from auth_rate_limits where expires_at <= now()');
      let exceeded = false;
      for (const [key, limit] of [[`ip:${ip}`, 30], [`identity:${identity}`, 10]] as const) {
        const result = await tx.query<{ attempts: number }>(`insert into auth_rate_limits(key_hash,attempts,expires_at) values($1,1,$2)
          on conflict(key_hash) do update set attempts=auth_rate_limits.attempts+1 returning attempts`, [keyedHash(this.secret, key), new Date(Date.now() + AUTH_DEFAULTS.rateWindowMs)]);
        exceeded ||= result.rows[0].attempts > limit;
      }
      return exceeded;
    });
    if (blocked) throw new SafeError('RATE_LIMITED', 'auth.rateLimited', true, 429);
  }
  async login(username: string, password: string, oldToken?: string): Promise<IssuedSession> {
    const normalized = usernameSchema.parse(username);
    const candidate = (await this.database.pool.query<Account>('select * from accounts where username_normalized=$1', [normalized])).rows[0];
    const valid = await verifyPassword(password, candidate?.password_hash);
    if (!candidate || !valid) {
      await this.database.transaction((tx) => this.audit(tx, 'auth.login_failed'));
      throw invalidCredentials();
    }
    return this.database.transaction(async (tx) => {
      const account = await this.lockAccount(tx, candidate.id);
      if (account.password_hash !== candidate.password_hash || (account.must_change_password && (account.temporary_used || !account.temporary_expires_at || account.temporary_expires_at.getTime() <= Date.now()))) throw invalidCredentials();
      this.enforceStatus(account);
      if (account.must_change_password) {
        await tx.query('update accounts set temporary_used=true where id=$1', [account.id]);
        await this.revoke(tx, account.id);
      }
      if (oldToken) await tx.query('update sessions set revoked_at=now() where token_hash=$1 and account_id=$2', [tokenHash(oldToken), account.id]);
      const issued = await this.issue(tx, account);
      await this.audit(tx, 'auth.login', account.id, account.id);
      return issued;
    });
  }
  async authenticate(token: string, allowPasswordChange = false): Promise<Authenticated> {
    return this.database.transaction(async (tx) => {
      const { account, session } = await this.checkSession(tx, token, allowPasswordChange);
      const idleExpiry = new Date(Math.min(session.expires_at.getTime(), Date.now() + AUTH_DEFAULTS.idleMs));
      await tx.query('update sessions set idle_expires_at=$2 where id=$1', [session.id, idleExpiry]);
      return { account: await this.project(tx, account), sessionId: session.id, expiresAt: session.expires_at.toISOString(), idleExpiresAt: idleExpiry.toISOString() };
    });
  }
  // Downloads/SSE must call this before delivering content; does not extend idle lifetime.
  async assertSessionActive(token: string): Promise<CurrentAccount> {
    return this.database.transaction(async (tx) => this.project(tx, (await this.checkSession(tx, token)).account));
  }
  async rotate(token: string): Promise<IssuedSession> {
    return this.database.transaction(async (tx) => {
      const { account, session } = await this.checkSession(tx, token);
      await tx.query('update sessions set revoked_at=now() where id=$1', [session.id]);
      await tx.query("select pg_notify('auth_revoked',$1)", [account.id]);
      await this.audit(tx, 'auth.rotate', account.id, account.id);
      return this.issue(tx, account, session.expires_at);
    });
  }
  async logout(token: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const { account, session } = await this.checkSession(tx, token, true);
      await tx.query('update sessions set revoked_at=now() where id=$1', [session.id]);
      await tx.query("select pg_notify('auth_revoked',$1)", [account.id]);
      await this.audit(tx, 'auth.logout', account.id, account.id);
    });
  }
  private async replacePassword(tx: Transaction, account: Account, hash: string, temporary: boolean) {
    await tx.query('update accounts set password_hash=$2,version=version+1,must_change_password=$3,temporary_used=false,temporary_expires_at=$4 where id=$1', [account.id, hash, temporary, temporary ? new Date(Date.now() + AUTH_DEFAULTS.temporaryMs) : null]);
    account.password_hash = hash; account.version++; account.must_change_password = temporary;
    await this.revoke(tx, account.id);
  }
  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<IssuedSession> {
    passwordSchema.parse(newPassword);
    if (currentPassword === newPassword) throw new SafeError('VALIDATION_ERROR', 'auth.differentPassword', false, 400);
    const hash = await hashPassword(newPassword);
    return this.database.transaction(async (tx) => {
      const { account } = await this.checkSession(tx, token, true);
      if (!await verifyPassword(currentPassword, account.password_hash)) throw invalidCredentials();
      await this.replacePassword(tx, account, hash, false);
      await this.audit(tx, 'auth.password_changed', account.id, account.id);
      return this.issue(tx, account);
    });
  }
  async resetPassword(token: string, targetId: string, operatorPassword: string): Promise<string> {
    const temporary = randomToken(); const hash = await hashPassword(temporary);
    return this.database.transaction(async (tx) => {
      const source = (await tx.query<Session>('select * from sessions where token_hash=$1', [tokenHash(token)])).rows[0];
      if (!source) throw expired();
      // Stable lock order prevents reset-vs-status/password-change races.
      await tx.query('select id from accounts where id=any($1::uuid[]) order by id for update', [[source.account_id, targetId]]);
      const { account } = await this.checkSession(tx, token);
      if (account.kind !== 'SYSTEM') throw new SafeError('FORBIDDEN', 'auth.forbidden', false, 403);
      if (!await verifyPassword(operatorPassword, account.password_hash)) throw invalidCredentials();
      if (account.id === targetId) throw new SafeError('VALIDATION_ERROR', 'auth.usePasswordChange', false, 400);
      const target = (await tx.query<Account>('select *,status_until::text from accounts where id=$1', [targetId])).rows[0];
      if (!target) throw new SafeError('NOT_FOUND', 'auth.accountNotFound', false, 404);
      await this.replacePassword(tx, target, hash, true);
      await this.audit(tx, 'auth.password_reset', account.id, target.id);
      return temporary;
    });
  }
  async setLocale(token: string, locale: CurrentAccount['locale']): Promise<void> {
    await this.database.transaction(async (tx) => {
      const { account } = await this.checkSession(tx, token, true);
      await tx.query('update accounts set locale=$2 where id=$1', [account.id, locale]);
    });
  }
  // Shared by the SYSTEM-only route below and by capability-gated licensing services (deactivate/block/release/restore).
  // Callers must already hold a stable lock order (accounts sorted, then this) inside their own transaction.
  async changeStatusInTransaction(tx: Transaction, actorId: string, targetId: string, input: { status: Status; reason: string; publicMessage?: string; untilDate?: string }): Promise<{ previousStatus: Status }> {
    if (!input.reason.trim()) throw new SafeError('VALIDATION_ERROR', 'auth.validation', false, 400);
    const target = await this.lockAccount(tx, targetId);
    await tx.query('update accounts set status=$2,status_until=$3,public_message=$4,version=version+1 where id=$1', [targetId, input.status, input.untilDate ?? null, input.publicMessage ?? null]);
    await tx.query('insert into account_status_history(id,account_id,actor_id,previous_status,new_status,internal_reason,public_message,until_date) values($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), targetId, actorId, target.status, input.status, input.reason, input.publicMessage ?? null, input.untilDate ?? null]);
    await this.revoke(tx, targetId);
    await this.audit(tx, 'auth.status_changed', actorId, targetId);
    return { previousStatus: target.status };
  }
  // Internal hook for later authorized block/release services. No general status mutation route in Phase 03.
  async changeStatus(token: string, targetId: string, input: { status: Status; reason: string; publicMessage?: string; untilDate?: string }): Promise<void> {
    await this.database.transaction(async (tx) => {
      const source = (await tx.query<Session>('select * from sessions where token_hash=$1', [tokenHash(token)])).rows[0];
      if (!source) throw expired();
      await tx.query('select id from accounts where id=any($1::uuid[]) order by id for update', [[source.account_id, targetId]]);
      const { account } = await this.checkSession(tx, token);
      if (account.kind !== 'SYSTEM' || account.id === targetId) throw new SafeError('FORBIDDEN', 'auth.forbidden', false, 403);
      await this.changeStatusInTransaction(tx, account.id, targetId, input);
    });
  }
  // Reused by Superadmin account restoration: a fresh one-time credential, never the account's prior password.
  async setTemporaryCredential(tx: Transaction, targetId: string): Promise<string> {
    const temporary = randomToken();
    const target = await this.lockAccount(tx, targetId);
    await this.replacePassword(tx, target, await hashPassword(temporary), true);
    return temporary;
  }
}
