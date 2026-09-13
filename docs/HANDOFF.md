# Current handoff

Updated: 2026-09-13 — Phase 03 complete.

## Current task and next action

Phase 03 is complete through its acceptance gate under U24 script-only verification. Stop here. Begin Phase 04 (branches, classrooms, dynamic permissions) only when explicitly requested. Then read AGENTS.md, PROJECT_STATE.md, the Phase 04 file, and only its named references; inspect current code/diff again. No Phase 04 work was performed.

## Implemented behavior and defaults

Accounts have immutable SYSTEM/STAFF/GUARDIAN kinds, normalized unique usernames, salted scrypt hashes, status/version and locale. A persistent bootstrap marker, transaction lock and unique SYSTEM constraint prevent a second unrestricted root. Sessions store only hashed random tokens. Login/logout/rotation/expiry, temporary credentials, forced password change, assisted reset, local SYSTEM recovery and status-based denial are transactional behavior.

Defaults: 12-hour absolute and 30-minute idle sessions; rotation preserves the absolute deadline. Temporary credentials allow one login within 24 hours and create a restricted 15-minute setup session. Password change revokes every old session and issues a fresh one. Passwords contain 15–128 characters; username normalization is NFKC, outer trim and locale-independent lowercase, accepting 3–64 letters/numbers or `.`, `_`, `-`. Read D29 in DECISIONS.md and [AUTHENTICATION.md](AUTHENTICATION.md) for complete operation/security contracts.

Operator commands: `npm run auth:bootstrap` consumes private stdin JSON with `username`/`password`; `npm run auth:recover-system` consumes only `password`, updates the existing marked root and revokes its sessions. They never print credentials and reject extra arguments/interactive stdin. No default credentials and no actual installation account were created. Follow the private-input procedure in AUTHENTICATION.md; preserve `.env`.

API authentication is global and deny-by-default, with exact origin/JSON/CSRF checks for mutations, HttpOnly/SameSite cookies (Secure and __Host prefixes on HTTPS), no-store/security headers, shared PostgreSQL rate limits, strict payloads and redacted audits/errors. Current-account DTOs expose only implemented capabilities and `policyReady: false`. Authenticated business route groups show denial pending Phase 04; no permissive role fallback exists.

The UI reuses Phase 02 controls, locale provider, tokens and language switcher. `/login`, `/session-expired`, `/account`, `/change-password` support English/Egyptian Arabic. Saved account locale wins on login. SYSTEM can generate a target account's temporary password after entering its current password; the result disappears on dismissal or leaving the account screen. Credentials/session tokens are never saved in browser storage. Vite proxies `/api` to the local API on port 3000.

## Revocation integration for later phases

`AuthService.authenticate` checks account status/version and session validity for each protected request. Consequential services repeat checks under account/session locks; multiple account IDs are locked in sorted order. `changeStatus` is an internal SYSTEM-authorized hook with a required reason, separate public message/history and revocation; no block/provisioning/seat UI or route was added. Ended temporary blocks permit fresh login without reviving old sessions or releasing slots.

Password/status changes, revocations and audits commit atomically. The `auth_revoked` PostgreSQL channel sends an account UUID after commit. Future SSE/download code must call `assertSessionActive(token)` before each delivery and after revocation hints; it does not extend idle expiry. NOTIFY alone is not authorization. Phase 04 must compose capability/resource/installation checks and scoped cache invalidation with these hooks.

## Changed files

- API: `apps/api/src/app.ts`, `app.unit.test.ts`, `config.ts`, new `errors.ts`, `auth-command.ts`, and `modules/auth/{crypto,routes,service}.ts`.
- Schema/contracts: `packages/db/src/migrations/0001_authentication.sql`; `packages/contracts/src/index.ts`, `auth.unit.test.ts`.
- Web: `apps/web/src/App.tsx`, `styles.css`, `i18n/catalogs.ts`, `features/auth/{client.ts,AuthProvider.tsx,screens.tsx}` and `apps/web/vite.config.ts`.
- Tests/tooling: `tests/helpers/auth.ts`, `tests/integration/{authentication,auth-command}.test.ts`, `tests/e2e/authentication.test.tsx`, `vitest.e2e.config.ts`, root `package.json` (two operator commands). No dependency/lockfile change.
- Documentation: `README.md`, `docs/{AUTHENTICATION,API_AND_DATA_CONTRACTS,DECISIONS,PROJECT_STATE,HANDOFF}.md`.

## Commands and actual results

- `npm run db:migrate`: applied `0001_authentication.sql`; second run passed without reapplying. Local database only.
- `npm run typecheck`; `npm run lint`; `npm run build`: passed across all workspaces.
- `npm run test:unit -- apps/api/src/app.unit.test.ts packages/contracts/src/auth.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts`: 3 files / 8 tests passed.
- `npm run test:integration -- tests/integration/authentication.test.ts tests/integration/auth-command.test.ts`: 2 files / 12 tests passed against real PostgreSQL. Includes concurrent bootstrap, invalid credentials, secure headers/CSRF, rotation/expiry/logout, reset/login races, status enforcement, concurrent rate limits, audit-failure rollback, temporary expiry, private-stdin command execution and existing-root recovery.
- `npm run test:e2e -- tests/e2e/authentication.test.tsx tests/e2e/startup.test.ts`: 2 files / 5 tests passed. Four bilingual DOM flows use a real local TCP API and PostgreSQL, including reset, forced change, revoked sessions, safe blocked copy, expiry and axe; the fifth checks Vite fallback.
- Final stale-response protection: `npm run typecheck -w @nursery/web`; `npm run lint -w @nursery/web`; `npm run build -w @nursery/web`; `npm run test:e2e -- tests/e2e/authentication.test.tsx`: all passed, 4 bilingual tests.
- `git -c core.autocrlf=false diff --check`: passed. No unrelated suites, audit, deployment, backup or restore were run in Phase 03.

Interim failures were test-harness issues: jsdom file URL resolution, waiting for fields after loading, and a substring selector matching both new-password fields. They were corrected and rerun successfully. Four empty schemas from the initial fixture setup failure were explicitly inspected and removed without CASCADE; fixture failure cleanup now removes its own schema. All later test schemas were cleaned normally. Fastify's deprecated logging flag was replaced with its installed LogController API. Final review added stale-response protection so an older current-account request cannot replace a newer CSRF token.

## Remaining limitations

Local PostgreSQL is 17.9; PostgreSQL 18 remains the production target. U24 prohibits browser automation, so evidence is scripted DOM/HTTP with a cookie/origin adapter, not an actual-browser or deployed-HTTPS claim. No real account was bootstrapped and nothing was deployed. Nuanced Egyptian Arabic copy still needs the planned tech-lead review.

General provisioning, seat reservations, roles/scopes and installation licensing remain their planned phases. Proxy headers are intentionally untrusted; deployment must add a narrow trust configuration before relying on per-client IP limits behind a proxy, and must configure security headers for the served web document. Later streams/downloads must use the documented revalidation hook. No unresolved Phase 03 gate blocker remains.
