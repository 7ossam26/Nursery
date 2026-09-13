# Current handoff

Updated: 2026-09-13 — Phase 06 complete.

## Next executable action

Phase 06 acceptance gate is satisfied. Stop. Begin Phase 07 (Health notes, authorized pickup, and incidents) only when requested; read its required files/references and inspect actual code/diff. No Phase 07 behavior, browser automation, subagents or deployment was introduced.

[CHILDREN_AND_DOCUMENTS.md](CHILDREN_AND_DOCUMENTS.md) contains the required fields/onboarding contract, lifecycle behavior, document limits/cleanup, route/action contracts, concurrency locks, migration/defaults and detailed evidence. D32 and API_AND_DATA_CONTRACTS.md reference the implementation. Historical Phase 05 evidence and its earlier sandbox timing limitations remain in LICENSING_AND_SETTINGS.md.

## Changed files and integration

- API: apps/api/src/app.ts registers children; new modules/children/{policy,service,documents,routes}.ts. Licensing service reuses provisionInTransaction and requireUsable; block/unblock now validates all active linked-child scopes under guardian-scope lock, with common organization/license lock order. Existing account/session/seat services remain authoritative.
- Schema/contracts: packages/db/src/migrations/0004_children_guardians.sql; packages/contracts/src/children.ts, children.unit.test.ts, index.ts and organization.ts capability catalog. Child/contact/guardian-link/profile/lifecycle/classroom/audit/integration/operation/document tables; immutable histories/branch and seat-kind/ownership triggers. Four new capabilities require explicit role assignment, never hardcoded role names.
- Web: apps/web/src/features/children/{copy.ts,screens.tsx}; App.tsx routes; auth/client.ts generic business request; auth/screens.tsx account navigation; i18n/catalogs.ts bilingual capability/copy integration. Guided onboarding with existing parent reuse and one-time credentials; scoped administration, contact/profile/link editing, lifecycle/classroom/documents; guardian linked-child switch and minimal paused card. Current reads revalidate in memory; errors drop records/credentials.
- Tests: tests/helpers/children.ts; integration/children.test.ts (10); e2e/children.test.tsx (3); auth fixture isolated private storage; licensing test tightened unlinked-parent scope; organization-migration parameterized actual Phase 03/05 upgrade preservation (2).
- Dependencies: apps/api/package.json and package-lock.json add exact sharp 0.35.4/pdf-lib 1.17.1 for real parsing/re-encoding. Initial worktree substantive diff was empty (33 CRLF-only tracked changes), unrelated changes preserved. All implementation remains uncommitted.
- Docs: CHILDREN_AND_DOCUMENTS.md, DECISIONS D32, API_AND_DATA_CONTRACTS, PROJECT_STATE and HANDOFF.

## Actual final verification

Node 24.19.0/npm 11.1.0 reused from %TEMP%/nursery-phase04-tools; disposable real PostgreSQL 18.6 cluster %TEMP%/nursery-phase06-pg on loopback 127.0.0.1:55406, nursery_test/postgres. No .env present/created, existing service/databases untouched.

- Prerequisite npm run test:integration -- tests/integration/licensing.test.ts: 7/7 passed before editing.
- npm run test:integration -- tests/integration/children.test.ts tests/integration/licensing.test.ts tests/integration/organization-migration.test.ts tests/integration/organization.test.ts: 28/28 passed (10+7+2+9), including atomic distinct-actor final-seat race, over-quota/audit rollback, guessed resource/file/path/type denial, shared guardians/siblings, independent block/revocation, retained lifecycle/classroom history, profile scope/version concurrency and existing-only license suspension. Migration runner applied 0004 to actual Phase 05 schema preserving prior seat/identity/edited role, rerun applied nothing; Phase 03 upgrade also passed.
- npm run test:unit: 41/41 passed.
- npm run test:e2e -- tests/e2e/children.test.tsx: 3/3 passed on final code (bilingual guided onboarding/real HTTP upload/pause/sibling switch, RTL/axe structural checks, live guardian revocation). No Playwright/browser automation. jsdom native file validity ignores its FileList shim, so script verifies selected bytes/name then submits real handler; server validation remains real.
- npm run typecheck; npm run lint; npm run build: passed all workspaces. After final web-only credential policy-error clearing: npm run typecheck -w @nursery/web; npm run lint -w @nursery/web; npm run build -w @nursery/web; same DOM script 3/3, all passed.
- npm audit; npm audit --omit=dev: both 0 vulnerabilities.
- git -c core.whitespace=cr-at-eol diff --check: passed after documentation formatting. Existing CRLF configuration notices are not errors.
- pg_ctl -D %TEMP%/nursery-phase06-pg stop -m fast: stopped verification cluster. Temporary cluster/tooling retained outside repository; no persistent runtime service started.

Interim failures were corrected, never marked passed: duplicate fixture code, old unscoped licensing block assertion, credentials hidden during list refresh, jsdom file validity. An intermediate DOM failure also timed out in cleanup; final complete runs passed. Existing pg parallel-query deprecation warning from licensing context reads remains, unrelated to Phase 06 correctness. Prior Phase 05 authentication UI timing failures were not rerun or claimed fixed.

## Operational limits and future hooks

Apply 0004 and configure private storage before using updated API on an installation. Child code/name/birth date/branch and guardian name/mobile/relationship/permissions required; classroom nullable but mandatory for future daily operations. Existing parents reuse seats; new credentials generated once by provisioning. Pausing retains agreements/reservations and contact-only child card, active sibling unaffected; archive is final, retains all history, emits effective-date future billing stop event. Phase 14 must enforce that event/lifecycle in monthly generation without voiding issued obligations; Phase 15 collects independently and never derives parent blocks from overdue debt. Finance/transport steps report implemented:false and are not offered. Branch transfer rejected pending Phase 17.

Documents: staff administrative scope only, max 5 MiB PDF/JPEG/PNG, actual parsing/re-encoding, encrypted/interactive PDFs rejected, generated UUID private blobs, authorized attachment/integrity check. Optional expiry metadata, retirement retains history/bytes, conservative SYSTEM janitor removes old unreferenced generated blobs. No public files/guardian administrative downloads, antivirus or production backup/performance/browser-visual claim. No phase gate blocker remains.
