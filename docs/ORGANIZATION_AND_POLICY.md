# Phase 04 organization and policy

## Runtime contract

Migration `0002_organization_policy.sql` adds coded branches, classrooms (immutable branch ownership, advisory capacity, optional age group), shared age-group catalogs, editable roles, capability mappings, staff role/branch/classroom assignments, SYSTEM-owned delegation and sensitive grants, an installation-local policy revision, and append-only policy audit snapshots. Existing accounts receive no roles or branches and default to CLASSROOM scope. No accounts or slot reservations are created by this phase.

Stable keys: `organization.read`, `organization.manage`, `users.assign_roles`, `roles.define`, `grants.manage`, `accounts.reset_password`, `support.access`, `finance.correct`. The last key only configures permission for a future module; no financial action exists. Reserved keys cannot be attached to a role, including through the SYSTEM role editor; a database trigger reinforces this. SYSTEM identity is checked by immutable account kind. Template names are editable data, never authority. The three initial templates are Nursery administrator, Branch manager, Teacher. No template is automatically assigned and no delegation is seeded.

An account's explicit scope mode is BRANCH or CLASSROOM, independent of role names and capability union. Multiple roles combine capabilities; CLASSROOM mode still intersects assigned branches and classrooms, even when a manager role is also attached. Composite foreign keys enforce classroom-to-branch and account-to-branch assignment consistency. Account scope changes leave session tokens usable with their new permissions and leave original audit ownership intact.

Delegation is per account and role ID, controlled only by SYSTEM. An assigning staff administrator must have `users.assign_roles`, BRANCH scope, all the target's old branches and all requested new branches. Existing and requested target roles must be delegated and their capabilities must remain a subset of the actor's current capabilities. Staff cannot edit themselves, SYSTEM/guardian accounts, unassigned accounts, partly inaccessible targets, or sensitive-entitled targets. SYSTEM initially scopes unassigned staff. SYSTEM alone changes sensitive entitlement and delegation. These restrictions are rechecked inside the commit transaction; updating a delegated role cannot open an escalation path.

`organization.manage` plus BRANCH scope permits branch/classroom management within current assignments. Creating a branch also assigns that new branch to the creator, with an assignment version increment; it does not grant access to any existing foreign branch. Staff can add shared age-group options; only SYSTEM edits existing shared age groups. Classroom branch identity is immutable. Moving a teacher replaces current assignments. Capacity settings do not fabricate enrollment counts. `capacityWarnings` accepts a canonical occupancy count from a future placement transaction and returns an advisory warning without rejecting authorized placement.

## API

All routes are under `/api/v1/organization` and reuse global authentication, origin/CSRF, strict JSON schemas, no-store headers and safe errors. Mutations have a bounded 16 KB body limit to accommodate the contract's three multi-select arrays (at most 100 IDs each).

- `GET /context`: current account policy, permitted branch/classroom options, shared age groups, delegated assignable roles; SYSTEM also receives capability metadata.
- `GET /branches`, `/classrooms`, `/age-groups`, `/roles`, `/staff`: bounded `limit` (1–100), `offset`, optional `branchId`. Branch/classroom lists and totals use the same SQL scope predicate. Roles require SYSTEM. Staff options include only fully manageable targets. Age groups/roles are installation-global catalogs; branch selection does not change these catalogs.
- `GET /branches/:id`, `/classrooms/:id`: individual scoped records. Missing and inaccessible IDs both deny.
- `POST /branches`, `/classrooms`, `/age-groups`, `/roles`: strict input contracts in `packages/contracts/src/organization.ts`.
- `PUT /branches/:id`, `/classrooms/:id`, `/age-groups/:id`, `/roles/:id`: `{ expectedVersion, value }`; conflicts return `STALE_VERSION`.
- `PUT /staff/:id/assignments`: `{ expectedVersion, roleIds, branchIds, classroomIds, scopeMode }`.
- `PUT /staff/:id/delegation`: `{ expectedVersion, roleIds }`; `PUT /staff/:id/grant`: `{ expectedVersion, sensitiveFinancialEdit }`. Both SYSTEM-only.

Authentication responses now report `policyReady: true`, configured capabilities and current scope/revision. Forced-password-change and guardian responses have no business capabilities. Guardian resource authorization deliberately denies until link-level implementation in Phase 06. Licensing/module controls remain Phase 05; Phase 04 only implements core organization operations, not permissive stubs for unimplemented modules.

## Transaction and integration helpers

`OrganizationService.withPolicy` takes an installation-local shared PostgreSQL advisory lock, validates the live session while holding sorted account locks then session locks, and loads current policy. Policy/catalog/assignment mutations take the exclusive advisory lock first and commit the data, version change, audit snapshot, and `policy_changed` NOTIFY together. This intentionally simple lock serializes policy edits and prevents revocation racing with protected transactions. Auth password/status flows keep their existing account/session lock order.

`queryScope` emits fixed SQL identifiers and parameterized values for branch/classroom list and aggregate queries. The branch variant is for branch metadata; classroom-owned records and totals must use the classroom predicate. `requireRecord` checks capability, branch and classroom. `withResource` requires future file/export code to resolve stored ownership inside the same fresh transaction; never trust a client-supplied ownership tuple or a serialized old policy. `requireSensitiveCorrection` requires capability, explicit entitlement and resource scope. `requireGuardianLink` fails closed. `supportAccess` requires the reserved capability plus a reason and persists an audit event in the same transaction as its callback. No download/export/support business routes are fabricated in this phase.

Future streams/download delivery must re-enter the policy service before each delivery and on `auth_revoked`/`policy_changed` hints. NOTIFY is an invalidation hint, never authorization. Shared-role edits invalidate every projection via the revision. The organization UI retains scoped data only in memory, refreshes policy every five seconds, clears old records/forms on revision changes, on hidden/focus transitions, and on failed policy revalidation. Generation checks prevent stale responses from replacing newly scoped content. Role/assignment changes do not require re-login. No SSE, persistent business cache, or offline mutation queue is introduced.

## Final verification — 2026-09-13

Environment differs from prior handoff: the checkout initially had no dependencies or `.env`. System Node was 24.11.1/npm 11.6.2. `npm ci` restored pinned dependencies (0 reported vulnerabilities; engine warnings under system Node). Pinned Node 24.19.0/npm 11.1.0 were subsequently installed under `$env:TEMP/nursery-phase04-tools` without repository dependency changes. An isolated PostgreSQL 18 cluster was initialized at `$env:TEMP/nursery-phase04-pg`, listening only on 127.0.0.1:55404; the existing system PostgreSQL service was not modified.

Commands use this process-local setup in PowerShell:

```powershell
$env:PATH = "$env:TEMP/nursery-phase04-tools/node_modules/node/bin;$env:PATH"
$env:DATABASE_URL = 'postgresql://nursery_test@127.0.0.1:55404/postgres'
$phaseNode = "$env:TEMP/nursery-phase04-tools/node_modules/node/bin/node.exe"
$phaseNpm = "$env:TEMP/nursery-phase04-tools/node_modules/npm/bin/npm-cli.js"
& $phaseNode $phaseNpm run test:integration -- tests/integration/organization.test.ts
```

All required checks passed. Commands below used the pinned runtime invocation above (the usual `npm run` names are shown for readability).

| Command | Actual result |
|---|---|
| `npm run typecheck` | Passed all workspaces. |
| `npm run lint` | Passed all workspaces after removing an unsupported lint-rule comment. |
| `npm run build` | Passed all workspaces; Vite production build completed. |
| `npm run test:integration -- tests/integration/organization.test.ts` | Final run: 9 tests passed on real PostgreSQL. Includes the final body-limit and observed advisory-lock wait checks. |
| `npm run test:integration -- tests/integration/organization-migration.test.ts` | 1 test passed: actual Phase 03 schema upgraded by the repository migration runner, existing identity preserved, secure unassigned defaults, second run applied nothing and retained edited template names. |
| `npm run test:integration -- tests/integration/authentication.test.ts tests/integration/auth-command.test.ts` | 12 tests passed. |
| `npm run test:e2e -- tests/e2e/organization.test.tsx tests/e2e/authentication.test.tsx` | 7 tests passed: bilingual organization/role/multi-assignment workflows, existing teacher-session scope refresh, and authentication regression. Axe checks passed with color-contrast disabled because jsdom cannot measure rendered contrast. |
| `npm run test:unit -- apps/api/src/app.unit.test.ts packages/contracts/src/auth.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts` | 8 tests passed. |
| `npm run typecheck -w @nursery/api`; `npm run lint -w @nursery/api`; `npm run build -w @nursery/api` | Passed again after the final API body-limit correction. |

Migration implications: apply `0002_organization_policy.sql` before starting the updated API against an existing installation. It adds records/constraints and two defaulted account columns, without assigning staff permissions or changing authentication versions/passwords. The runner was executed twice through the repository migration test in a disposable schema containing the first two migrations. No configured nursery database or existing migration history was changed. The test schemas were cleaned by their fixtures. No real account bootstrap, deployment, backup/restore, or production performance claim is made.

Fixtures: `tests/helpers/organization.ts` creates SYSTEM, branches A/B/C, four classes (three A, one B), arbitrary staff roles/scopes, and synthetic temporary credentials using the existing auth fixture. A01 is exercised with manager A and foreign B detail/mutation/file/export callbacks; A02 uses a teacher assigned two of four classes, including a mixed teacher+manager role combination. Tests also cover delegated admins, partially accessible staff, privileged capability rejection, sensitive grants, renamed roles, live-session union/removal, append-only ownership, audit rollback, stale concurrent writers, protected work vs. revocation, and audited SYSTEM support. No child, financial, or file-storage module implementation is claimed.

Initial failures: missing `vitest`; then missing DATABASE_URL; then the old Phase 03 `policyReady: false` assertion and operator test's implicit `.env` dependency. The assertion was updated for the implemented contract; the operator fixture now supplies all required test configuration explicitly. An unsupported lint-rule comment was removed. The first English DOM run matched both branch selectors; the test now uses the exact accessible control name and both languages passed on rerun. Windows CRLF was normalized only in modified files for a clean diff check.

Final housekeeping: `git -c core.autocrlf=false diff --check` passed. The isolated cluster was stopped successfully with PostgreSQL `pg_ctl stop -m fast`; `pg_ctl --version` reported 18.6. Temporary tools and stopped cluster files remain outside the repository for reproducibility. Existing services were left running unchanged.

Limitations: U24 script-only evidence is DOM/HTTP/PostgreSQL, not actual-browser visual review or deployed HTTPS. Egyptian Arabic copy still needs the planned tech-lead review. Capacity placement integration, guardian-child links, files/exports, finance, licensing and seat-aware account provisioning remain their planned later phases. The global policy-edit lock favors simple correct revocation over maximum concurrency; production throughput has not been measured. Phase 04 is complete; Phase 05 is next and was not started.
