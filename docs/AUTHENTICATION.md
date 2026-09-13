# Authentication implementation and operation

Phase 03 implements R02/U03 using the defaults recorded as D29 in DECISIONS.md. General provisioning, roles/scopes, account seats, installation licensing, and parent-block UI are deliberately left to their assigned phases.

## Local bootstrap and SYSTEM recovery

Apply `npm run db:migrate` to the intended installation database first. Verify the private `.env` selects that database and installation ID. No real account or credential is seeded by this phase.

`npm run auth:bootstrap` consumes one JSON object from private standard input: `username` and `password`. The username must normalize to 3–64 letters/numbers or `.`, `_`, `-`; the password must contain 15–128 characters. Obtain this input from a password manager or an operator-owned, access-restricted temporary file outside the repository. Do not type credentials in command arguments, shell history, environment variables, source files, or chat. The command refuses interactive stdin and extra arguments. It prints only a success/failure classification.

For a pre-existing private file, PowerShell can supply its contents using `Get-Content -Raw -LiteralPath 'C:\private\bootstrap.json' | npm run auth:bootstrap`. The file contains the two required fields; this command does not print them. Remove the temporary file securely through the operator's normal secret-handling process after use. Never save it in the repository.

Bootstrap locks a fixed transaction key, creates one reserved SYSTEM account and a persistent bootstrap marker atomically, and refuses reuse. The database also enforces one SYSTEM account, immutable account kinds, and a foreign key preventing deletion of the marked root. Recovery does not run bootstrap again.

If the SYSTEM operator loses access, `npm run auth:recover-system` consumes private stdin JSON containing only `password`. It updates the account referenced by the existing installation's bootstrap marker, increments its version, revokes every session, and records a local recovery audit event. It cannot create another SYSTEM account or activate a disabled account. Access to the deployment machine/database is the trust boundary for this offline recovery procedure.

Bootstrap and recovery passwords permit one login within 24 hours. That login creates a restricted 15-minute setup session. The user must change the temporary password to a different permanent password. Leaving/expiring the setup requires a new reset. Never deliver credentials through application logs or ordinary shared reports.

## Assisted reset

The Account security screen exposes reset only to SYSTEM with `accounts.reset_password`. Enter the target account UUID supplied by nursery administration and the operator's current password. There is no account-directory or provisioning UI in Phase 03. The service verifies reserved kind and password again inside the mutation transaction. A staff member named “Superadmin” or holding an editable role cannot use it.

The generated random temporary password is returned once, marked no-store, shown until dismissed or the account screen is left, and retained only in component memory. Deliver it privately to the account owner. Reset revokes existing sessions and requires password change; it does not unblock, activate, release a slot, or alter the target's identity. Operators change their own password with Change password, or use local recovery if locked out. No public signup, email, or SMS recovery exists.

## HTTP and session contracts

All routes use `/api/v1/auth`. `GET /csrf` issues a signed 10-minute login CSRF nonce in an HttpOnly cookie and response. `POST /login` requires that cookie plus the identical `X-CSRF-Token`. All mutations require an exact `Origin: APP_ORIGIN`, same-origin Fetch Metadata when provided, and JSON content type. Authenticated mutations additionally require a session-bound HMAC CSRF token obtained from an auth response. CORS access is not enabled.

| Route | Behavior |
|---|---|
| `GET /me` | Fresh account/status/session resolution; returns account, capability list, absolute/idle deadlines and CSRF token. |
| `POST /logout` | Revokes the current session and expires its cookie. |
| `POST /rotate` | Issues a fresh token and invalidates the old token while preserving absolute expiry. |
| `POST /password` | Accepts `currentPassword`, `newPassword`; changes password, revokes all sessions and issues a new session atomically. |
| `PATCH /locale` | Saves only `locale: en` or `ar-EG` for the current account. |
| `POST /accounts/:id/reset-password` | Accepts `operatorPassword`; SYSTEM only; returns the one-time-displayed temporary password. |

Payload schemas are strict and reject mass assignment. Current-account DTOs expose no password hashes, status reasons, session IDs, or technical audit timestamps. `policyReady: false` makes the Phase 04 boundary explicit. Only the implemented SYSTEM reset capability is returned; staff/guardian business capability lists are empty. All API routes are authenticated by default unless explicitly marked public. Password-setup sessions can access only current account, password change, locale and logout. Protected production route groups require authentication and then show a denied view until later capability-aware modules exist.

Session tokens use 32 random bytes; PostgreSQL stores only SHA-256 token hashes. Passwords use salted scrypt. Sessions expire after 12 hours absolute or 30 minutes without an authenticated request; setup sessions expire after 15 minutes. Rotation is an explicit endpoint; password change always rotates. The UI clears its account view at the server-provided deadline and on safe authorization failures. There is no polling that silently keeps an idle session alive. Passwords and session tokens are never stored in browser storage; personal language is the only local preference.

HTTPS uses host-only `__Host-nursery_session` and `__Host-nursery_login_csrf` cookies, `Path=/`, `Secure`, `HttpOnly`, and `SameSite=Strict`. The session cookie has no persistent lifetime. HTTP is allowed only on loopback origins for local development and uses unprefixed cookies. Production configuration requires HTTPS. API responses send no-store, HSTS on HTTPS, nosniff, no-referrer, frame denial, restrictive API CSP and permissions policy. Phase 23 must configure the web document's CSP and HTTPS proxy. Proxy headers are currently untrusted; direct peer IP limits can group users behind a proxy until a narrow trusted-proxy configuration is added there. Vite forwards `/api` to the local API on port 3000.

Login limits are shared PostgreSQL counters: 10 per normalized identity and 30 per direct peer IP per 15 minutes; password/reset attempts use the actor ID and peer IP. Keys use HMAC rather than raw usernames/IPs. Limits expire without permanent account lockout. Invalid passwords and nonexistent accounts have identical safe responses and equivalent scrypt work. Only valid credentials or a known session can reveal an account's intended public contact message. Audit records contain event/actor/target IDs, never credentials, tokens, raw request bodies or login names; request errors log classification and request ID rather than raw exceptions.

## Revocation integration

`AuthService.authenticate` rechecks account status, version, session revocation, idle and absolute expiry on every protected request. Services recheck within transactions for consequential mutations. Accounts are locked before sessions; multi-account operations lock account IDs in sorted order. Password/status changes and their audits commit atomically with session revocation.

`AuthService.changeStatus` is an internal SYSTEM-authorized integration hook with required internal reason and separate public message. It records history and revokes sessions; no general status route is exposed yet. A temporary block's until-date is inclusive in Cairo; after it ends a fresh login is eligible, while old revoked sessions stay invalid. This service touches no seat, tuition, debt, or guardian-link records.

`auth_revoked` PostgreSQL NOTIFY carries only an account UUID after commit. Later SSE/download code must call `assertSessionActive(token)` before every dispatch/read and after notifications. That method does not extend idle lifetime. Notifications are wake-up hints, not durable authorization; missed notifications cannot grant continued access. Phase 04 must compose resource/capability/license checks with this hook and invalidate its scoped caches when assignments change.

## Verification scope

Final Phase 03 gate, 2026-09-13: all workspace `npm run typecheck`, `npm run lint`, and `npm run build` commands passed. `npm run test:unit -- apps/api/src/app.unit.test.ts packages/contracts/src/auth.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts` passed 8 tests; `npm run test:integration -- tests/integration/authentication.test.ts tests/integration/auth-command.test.ts` passed 12 tests; `npm run test:e2e -- tests/e2e/authentication.test.tsx tests/e2e/startup.test.ts` passed 5 tests. The final web stale-response change passed its workspace type/lint/build gate and a rerun of all 4 bilingual flow tests. `npm run db:migrate` applied the authentication migration and reran idempotently. Diff whitespace validation passed. Full command details, intermediate harness fixes, and file inventory are in [HANDOFF.md](HANDOFF.md).

Repository scripts exercise real PostgreSQL in disposable schemas, real Fastify requests, and bilingual React DOM flows over a real local HTTP listener. The DOM adapter supplies cookies/Origin for jsdom; it does not mock service or database responses. U24 prohibits browser automation, so actual browser rendering/cookie enforcement has not been claimed. Production-header assertions inspect server output; HTTPS deployment remains Phase 23. Local PostgreSQL 17.9 is the verification environment; PostgreSQL 18 remains the production target.
