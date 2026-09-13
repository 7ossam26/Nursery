# Current handoff

Updated: 2026-09-13 — Phase 04 complete.

## Next action

Phase 04 passed its acceptance gate. Stop here. Begin Phase 05 (Superadmin, subscriptions, slots, and nursery settings) only when requested, reading its prerequisites and named references and inspecting the actual code/diff again. No Phase 05 behavior was implemented. No subagents, browser automation, or deployment were used.

## Delivered behavior and integration

[ORGANIZATION_AND_POLICY.md](ORGANIZATION_AND_POLICY.md) records capability names, D30 defaults, delegated assignment rules, query/resource/support helpers, lock order, UI invalidation, migration implications, fixtures and detailed evidence. Phase 03 operation remains in AUTHENTICATION.md; its former policyReady=false placeholder is explicitly superseded by the Phase 04 contract.

Stable keys: organization.read, organization.manage, users.assign_roles, roles.define, grants.manage, accounts.reset_password, support.access, finance.correct. Reserved keys cannot be attached to editable roles. finance.correct is configuration for a future module only. Role names never authorize. Scope mode is explicit account data (BRANCH/CLASSROOM), with capability union still restricted by branch/classroom assignments. Existing staff default to CLASSROOM with no roles/branches. No general account provisioning or seat bypass was added.

SYSTEM defines roles, per-account delegated role IDs and sensitive entitlement. Staff assignment admins need BRANCH scope, all target branches, and delegation for both existing/requested roles whose capabilities are a subset of their own. They cannot edit themselves, unassigned accounts, partially inaccessible staff or sensitive-entitled targets. SYSTEM performs initial staff scoping. Shared age-group edits and classroom branch immutability follow D30. Creating a branch assigns only that new branch to its creator.

OrganizationService.withPolicy revalidates sessions and current policy inside the transaction. Shared policy locks protect reads/business work; exclusive locks serialize policy edits with data, audit, revision and NOTIFY. queryScope shares predicates for lists/totals; classroom-owned data must use classroom filtering. withResource resolves stored ownership inside fresh authorization for future files/exports. supportAccess is SYSTEM-only and audited. requireSensitiveCorrection needs all three gates; requireGuardianLink denies pending Phase 06. Future delivery code must revalidate on every dispatch and revocation hint.

The bilingual screen at /administration/organization reuses existing controls, cards, language/theme and auth client. It offers branch/classroom multi-selection, role definitions, delegation and sensitive entitlement. It revalidates in-memory policy every five seconds and on focus/visibility transitions, clearing stale data/forms and rejecting superseded responses. Existing sessions use new scopes without re-login. Original audit ownership remains immutable. Capacity is advisory; canonical occupancy/placement integration belongs to Phase 06.

## Changed files

- API: apps/api/src/app.ts; modules/auth/service.ts; new modules/organization/{policy,service,routes}.ts.
- Schema/contracts: packages/db/src/migrations/0002_organization_policy.sql; packages/contracts/src/{index,organization}.ts.
- Web: apps/web/src/App.tsx; features/auth/{client,screens}; features/organization/{copy.ts,screen.tsx}; i18n/catalogs.ts; styles.css.
- Tests: new tests/helpers/{organization,http-client}.ts; tests/integration/{organization,organization-migration}.test.ts; tests/e2e/organization.test.tsx. Updated authentication integration assertions/command fixture and reused its HTTP adapter in both DOM suites.
- Docs: ORGANIZATION_AND_POLICY, DECISIONS (D30), API_AND_DATA_CONTRACTS, PROJECT_STATE, HANDOFF.
- No dependency/lockfile changes. Initial worktree was clean; all changes remain uncommitted. Modified text files use LF for focused diff review.

## Actual verification

Pinned Node 24.19.0/npm 11.1.0; real isolated PostgreSQL 18.6. Exact PowerShell runtime/database setup is in ORGANIZATION_AND_POLICY.md.

- npm run typecheck; npm run lint; npm run build: passed all workspaces.
- npm run test:integration -- tests/integration/organization.test.ts: final 9 tests passed (A01/A02 scope, aggregate/detail/mutation/file/export callbacks, mixed roles, delegation/escalation, live-session union/removal, audit rollback, concurrent stale writers, observed PostgreSQL lock wait, grants/support, new-branch scope and bounded request size).
- npm run test:integration -- tests/integration/organization-migration.test.ts: 1 passed; repository runner upgraded a real Phase 03 schema once, preserved identity/default-denial, and reran without applying or reseeding anything.
- npm run test:integration -- tests/integration/authentication.test.ts tests/integration/auth-command.test.ts: 12 passed.
- npm run test:e2e -- tests/e2e/organization.test.tsx tests/e2e/authentication.test.tsx: 7 passed, with real TCP/PostgreSQL and bilingual scripted DOM/axe checks.
- npm run test:unit -- apps/api/src/app.unit.test.ts packages/contracts/src/auth.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts: 8 passed.
- After the final API body-limit correction: npm run typecheck -w @nursery/api; npm run lint -w @nursery/api; npm run build -w @nursery/api: passed again.
- git -c core.autocrlf=false diff --check: passed. PostgreSQL pg_ctl stop -m fast completed successfully for the isolated test cluster; pg_ctl --version reported 18.6. Temporary tools/test-cluster files remain outside the repository, with the cluster stopped.

Interim failures were resolved: missing dependencies/database environment, historical policyReady assertion, operator test relying on .env, unsupported lint comment, and ambiguous English selector. No failed check was skipped to close the gate.

## Environment and limitations

This checkout had no .env and initially no dependencies. npm ci restored the lockfile dependencies (0 reported vulnerabilities; initial system Node caused engine warnings). Pinned tools were installed under $env:TEMP/nursery-phase04-tools. Verification cluster: $env:TEMP/nursery-phase04-pg on 127.0.0.1:55404, synthetic nursery_test account. Existing system PostgreSQL service and nursery databases were untouched. Tests clean up their own schemas. No real installation account was bootstrapped, no live database was migrated, and nothing was deployed.

Apply migration 0002 before starting the updated API on a configured installation. No production performance, backup/restore, actual-browser visual, or deployed-HTTPS result is claimed. U24 requires script-only verification; nuanced Arabic and visual review remain for the planned tech-lead review. Guardian links, files/exports, financial actions, licensing and seat-aware provisioning remain later phases. No Phase 04 gate blocker remains.
