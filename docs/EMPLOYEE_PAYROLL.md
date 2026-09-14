# Employee financials and monthly payroll

Phase19 gate satisfied on 2026-09-14. Defaults: D03/D11/D21/D27/D47. No live deployment, browser automation, subagents or model changes.

## Working behavior

- A financial profile has a stable code/name and agreed salary history; it does not need a login or reserve a slot. Optional STAFF login at creation or later reserves an EMPLOYEE slot through the existing LicensingService, atomically with the profile/link and financial operation. Existing-account reassignment is not exposed.
- Profile deactivate/reactivate is an append-only financial status event. It never changes account status, releases a seat or deletes unpaid months. Login lifecycle remains the existing licensing workflow.
- Explicit month preparation snapshots the applicable basic salary, employee identity and one paying branch/account. It creates no cash or manual expense. Future months cannot be prepared. Operational branch/classroom assignments never prorate salary or alter old periods.
- Salary changes append strictly future, monotonically effective terms. Existing periods keep their captured salary/account. Profile administration checks the latest agreed salary branch; period history/actions check their immutable monthly branch.
- Additions/bonuses, deductions/penalties and paid advances require reasons and actors. Only the current Cairo month can receive these actions, and none can be added after final settlement. Prior months do not carry adjustments automatically.
- The locked aggregate of advances plus deductions/penalties cannot exceed basic salary, even with bonuses. SQL also rejects additions that would overflow the supported final-entry amount.
- Advance source, immediate negative treasury leg, audit and operation commit together. Funding and counted-cash-date protection reuse SpendingService/FinancialCore and canonical treasury account locks.
- The sole payable projection is `payroll_period_balances`: basic salary + additions − deductions/penalties − advances. Final payout confirms exactly the locked full remainder once; an outdated amount is STALE_VERSION, not an automatic payout of a changed amount. Same actor/key retries return the committed result; distinct payouts serialize and cannot settle twice.
- Zero remainder creates an explicit reasoned final settlement with null cash account/method and no treasury leg. Old unpaid periods remain individually visible and payable, including after profile deactivation.
- `payroll_cash_sources` contains actual advances and positive final settlements only. Reserved SALARY/PAYROLL/ADVANCE manual-expense categories remain prohibited by the existing contracts/database; payroll has distinct immutable source references. Salary forecasts are not cash expenses.

## Authorization and recovery

Reads require finance.read plus branch-wide scope (SYSTEM identity or assigned BRANCH scope); no classroom or guardian fallback. SQL roster rows/totals and salary/month history share the authorized branch predicates. A forbidden branch filter is rejected; foreign detail/receipt IDs are denied. Revoked permissions/scope apply immediately to history, replay and actor-scoped operation-status lookup.

`payroll.manage` controls profiles, future salary, snapshots and adjustments. `payroll.pay` controls actual advances and full/zero final settlements. Optional account provisioning additionally requires users.manage_staff. These are stable delegable capabilities with no automatic role grants. PAYROLL and FINANCE gate every new payroll mutation; authorized staff keep scoped history when either is disabled.

FinancialCore's optional result-storage transform redacts generated credentials from audit and durable operation results; other services retain the default identity transform. Initial successful provisioning returns the temporary password once. Replay/status returns null password, so response loss requires the existing Superadmin password-reset workflow, not another account or reservation.

The bilingual screen uses existing controls, scoped fresh reads and the shared in-memory frozen-operation hook. Double clicks cannot submit another operation. A lost/uncertain response locks mutation controls and offers status lookup before identical retry. Detail/secret state clears on blur, visibility/scope changes or failed scoped reads. No financial records, credentials or offline mutation queue are persisted in browser storage. Technical audit timestamps are not exposed in payroll DTOs/UI.

## Contracts and routes

Amounts are canonical integer-string piastres bounded per entry to PostgreSQL BIGINT; aggregate projections stay exact strings. Month is YYYY-MM; business payment dates are explicit ISO date-only values no later than the current Cairo date. Strict schemas reject caller passwords, derived paid totals, arbitrary actors and settlement-account overrides.

All routes use `/api/v1`, existing cookie/CSRF handling and safe error envelopes:

| Method | Payroll route | Purpose |
|---|---|---|
| GET | `/payroll/options` | Scoped branches/accounts, module state and available actions |
| GET | `/payroll?month=YYYY-MM&branchId=…&limit=…&offset=…` | Bounded roster and same-filter exact totals |
| POST | `/payroll/employees` | Profile, initial salary and optional new login |
| GET | `/payroll/employees/:id` | Scoped employee/salary/month history |
| POST | `/payroll/employees/:id/status` | Reasoned financial deactivate/reactivate |
| POST | `/payroll/employees/:id/salary` | Future agreed salary/paying branch/account |
| POST | `/payroll/employees/:id/login` | Optional later slot-controlled new STAFF login |
| POST | `/payroll/periods` | Explicit immutable employee-month snapshot |
| GET | `/payroll/periods/:id` | Month totals, adjustments, advances and final settlement |
| POST | `/payroll/periods/:id/adjustments` | Current-month addition/deduction/penalty |
| POST | `/payroll/periods/:id/advances` | Actually paid current-month advance |
| POST | `/payroll/periods/:id/settlements` | Full expected remainder or explicit zero close |
| GET | `/payroll/periods/:id/receipt-data` | Real settled salary receipt/export DTO |

Mutations require operationId. Settlement also requires amount, settledOn, reason and externalReference; paying account/method come only from the snapshot. Roster limit is 1–100 (default50), offset0–100000, stable code/ID ordering. Page and filtered totals come from one SQL statement. Outstanding payroll includes only unpaid snapshotted periods; unsnapshotted basic salary is clearly labeled forecast, never debt or cash.

## Changed files and migration implications

- `packages/contracts/src/payroll.ts`, `index.ts`, `organization.ts`, `licensing.ts`: strict payroll inputs/DTOs, capabilities and PAYROLL dependency.
- `packages/db/src/migrations/0020_employee_payroll.sql`: profiles, immutable later-login links/status/salary/month/adjustment/advance/final settlement history, canonical balances/cash-source view, cap/snapshot/source guards and typed treasury legs. No historical salary or cash is fabricated. Existing treasury source/correction checks remain intact with exclusive payroll columns. Apply only after0019 using the existing migration runner; deployment/backup remains an explicitly authorized future workflow.
- `apps/api/src/modules/finance/payroll.ts`, `routes.ts`, `core.ts`: shared transactional service/routes and credential result redaction.
- `apps/web/src/features/finance/payroll-screen.tsx`, `payroll-copy.ts`, `use-operation.ts`, `apps/web/src/features/auth/screens.tsx`, `apps/web/src/i18n/catalogs.ts`, `apps/web/src/App.tsx`: real bilingual forms/history/receipt data, shared operation result callback and module-aware navigation. Direct authorized history remains accessible with modules disabled.
- `tests/integration/payroll.test.ts`, `organization-migration.test.ts`, `tests/helpers/finance.ts`: PostgreSQL acceptance/rollback/races/scopes/seats/SQL defenses, reusable independent reconciliation and actual Phase18 upgrade/rerun coverage.
- `tests/e2e/payroll.test.tsx`, `packages/contracts/src/payroll.unit.test.ts`, `apps/web/src/features/finance/payroll-copy.unit.test.ts`: repository HTTP/DOM and strict-contract/copy verification.
- `docs/DECISIONS.md`, `FINANCE_RULES.md`, `ACCESS_AND_LICENSING.md`, `API_AND_DATA_CONTRACTS.md`, `TESTING_AND_ACCEPTANCE.md`, this document and state/handoff: defaults, contracts and actual evidence.

Starting diff was clean; no unrelated user changes were overwritten.

## Actual verification

Host: Windows; PostgreSQL18.4 UTF8, disposable loopback55420 cluster at `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8`, owner jo. Each integration/HTTP fixture uses its own schema/private-files directory and cleans it up. No persistent/live nursery database was migrated. The disposable public schema0020 was an early intermediate version and is not final evidence; fresh isolated upgrade/rerun tests use the final migration. The cluster was stopped after verification; temporary cluster files remain recoverable/reusable.

Observed command runtime was Node25.2.1/npm11.6.2; repository pins remain Node24.19.0/npm11.1.0. These results are not certification on the pinned runtime or VPS.

Prerequisite check: disposable schema through0019 plus transport6/6 passed34.16s. Initial missing postgres-role attempt failed before migration; corrected owner URL passed. All PostgreSQL commands below used:

```powershell
$env:DATABASE_URL='postgresql://jo@127.0.0.1:55420/postgres'
```

| Command | Actual result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/payroll.test.ts --maxWorkers=1` | Expanded checkpoint10/10 passed55.08s; final suite is included below |
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/payroll.test.ts tests/integration/organization-migration.test.ts tests/integration/finance.test.ts tests/integration/spending.test.ts tests/integration/corrections.test.ts tests/integration/closing.test.ts --maxWorkers=1` | Financial regression checkpoint45/45 passed183.34s; concrete risk was shared FinancialCore/treasury source/closing changes |
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/payroll.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1` | Final12 payroll +3 actual migration upgrade/rerun =15/15 passed81.50s |
| `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/payroll.test.tsx tests/e2e/spending.test.tsx --maxWorkers=1` | Final4 payroll +4 shared-operation expense/transfer regression =8/8 passed64.07s; real HTTP/PostgreSQL, jsdom, not browser automation |
| `node node_modules/vitest/vitest.mjs run --config vitest.unit.config.ts packages/contracts/src/payroll.unit.test.ts packages/contracts/src/finance.unit.test.ts apps/web/src/features/finance/payroll-copy.unit.test.ts` | Final3/3 passed767ms |
| `npm run typecheck` | Final workspace pass, exit0 |
| `npm run build` | Final workspace pass, exit0; Vite748.30kB main-chunk warning remains |
| `npm run lint` | Final workspace pass, exit0 |
| `git diff --check` | Pass, exit0 |

A26: base500000, advance100000, deduction30000, final370000, actual cash470000; two treasury sources, no manual-expense duplication, reconciliation clean. A27: different actors race advance/penalty and two deductions; one winner per cap, bonuses never enlarge cap. A28: concurrent same-key retry returns one result, competing independent final payouts cannot duplicate settlement, response loss/double clicks recover once, and old unpaid month settles separately. A01/A05: branch/classroom/guardian restrictions and revocation deny history/receipt/replay/status; optional quota failure rolls back every profile/account/link, one-time credential replay is redacted, and financial deactivation keeps login ACTIVE and its reservation. Focused tests also cover funding/closing/stale amounts, zero cash, future salary snapshot retention, immutable records, wrong SQL salary snapshots, absent cash legs and mismatched method.

Independent reconciliation checks original financial equations plus payroll cap, advance/source cash, final/source cash and final salary equation. Every tested scenario remained consistent. Bilingual payroll workflows pass axe with color-contrast disabled and assert LTR/RTL; no screenshot/mobile visual/performance claim is made.

Earlier failures were fixed and rerun, not skipped: long treasury fixture codes; heterogeneous PostgreSQL trigger NEW field references; a test SQL unary-minus/cast expression; and a misplaced copy test importing web code from contracts rootDir. The copy test moved into web. The failed build's51 generated source-adjacent JS/map/declaration artifacts were identified as new, timestamp-verified, and removed; source/user files were untouched and artifacts are regenerable. Some PostgreSQL suites emitted pg client-query deprecation warnings; all final checks still exited0. Expected injected storage/response-loss failures are tested recovery cases, not fake success paths.

## Boundaries and next phase

No payroll PDF/Excel file exporter, employee attendance/HRM, taxation/social insurance, partial final payout, automatic carry-forward, offline mutation queue or live deployment. Receipt/export DTOs are implemented; Phase20 builds management reports and PDF/Excel exports from real scoped sources. No settled payroll correction endpoint is exposed; immutable paid history cannot be silently edited/reopened. Lost provisioning credentials use existing Superadmin reset.

Remaining limits: host runtime differs from repository pins; Vite bundle warning and pg deprecation warnings; no VPS performance/manual visual verification. Independently unresolved Phase12 screenshot handoff is unchanged. None was represented as a passed visual/deployment/pinned-runtime check.

Next: Phase20, only when explicitly requested. Its reports must reuse `payroll_cash_sources` and canonical scoped projections, counting already-paid advances exactly once. Phase20 has not been implemented or started by this phase.
