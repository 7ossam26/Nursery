# Current handoff

Updated: 2026-09-14 — Phase19 COMPLETE; Phase20 NOT STARTED.

## Next executable action

Stop here. When Phase20 is explicitly requested, read AGENTS.md, PROJECT_STATE.md, this handoff, its phase file and only its listed references; inspect actual diff/code. Reuse canonical scoped payroll balances and `payroll_cash_sources` for management reports/PDF/Excel. Advances plus positive final salary settlement are actual payroll outflows; basic salary/unsnapshotted forecast are not another expense. No live deployment, browser automation, subagents or model changes.

## Completed behavior and precise files

Detailed evidence and migration implications: [EMPLOYEE_PAYROLL.md](EMPLOYEE_PAYROLL.md). Defaults D47. Full changed-file list is there.

- `packages/contracts/src/payroll.ts`, exports, organization/licensing contracts: strict money/month/action DTOs, delegable payroll.manage/payroll.pay and PAYROLL dependency.
- `packages/db/src/migrations/0020_employee_payroll.sql`: independent financial profiles; immutable optional later-login links/status/salary/month/adjustment/advance/final history; one paying branch/account; SQL cap/snapshot/source/immutability guards; canonical balances and actual cash sources. Future salary rows never recalculate existing months.
- `apps/api/src/modules/finance/payroll.ts`, `routes.ts`, `core.ts`: real transactional scoped payroll endpoints using existing LicensingService, TreasuryService locks and SpendingService funding/closing guards. FinancialCore optional result redaction keeps original successful credentials out of persisted audit/operation results.
- `apps/web/src/features/finance/payroll-screen.tsx`, `payroll-copy.ts`, `payroll-copy.unit.test.ts`, `use-operation.ts`, App/account/catalog wiring: bilingual real profile/salary/login/status, roster/month history, advance/adjust/full-or-zero settlement and receipt DTO; module-aware navigation, scoped refresh and uncertain-response recovery. No offline queue/financial browser storage.
- `tests/integration/payroll.test.ts`, `organization-migration.test.ts`, `tests/helpers/finance.ts`, `tests/e2e/payroll.test.tsx`, `packages/contracts/src/payroll.unit.test.ts`: focused PostgreSQL/races/rollback/scope/seats/source and HTTP/DOM acceptance evidence.

Formula: snapshot basic salary + additions − deductions/penalties − already-paid advances. Adjustments/advances are original current-Cairo-month only and stop at final settlement. Advances+deductions/penalties cannot exceed basic salary even with bonuses. Final full expected remainder once; zero creates a reasoned no-cash settlement with no treasury leg. Old unpaid months remain separately payable. Profile status never changes login status/reservation. Optional creation/later login uses existing quota atomically; replay/status credentials are null, so a lost provisioning response needs existing Superadmin reset.

## Actual final commands/results

Disposable PostgreSQL18.4 UTF8: `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8`, owner jo, loopback55420. It is now STOPPED; files retained. No persistent/live database migrated. Public0020 was an early intermediate schema and is not final evidence; isolated schema upgrade tests read the final file.

To rerun disposable checks only, restart that exact cluster with pg_ctl; use:

    $env:DATABASE_URL='postgresql://jo@127.0.0.1:55420/postgres'
    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/payroll.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1

Final15/15 (12 payroll+3 upgrades/reruns) passed81.50s. Actual Phase18 schema upgrades only0020, rerun emits no migration; identities/reservations/custom role names retained. Prior combined payroll/migration/finance/spending/corrections/closing checkpoint45/45 passed183.34s; this regression was required by shared FinancialCore/treasury changes. Independent reconciliation checks salary cap, full final equation and each source/cash leg; clean in tested scenarios.

    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/payroll.test.tsx tests/e2e/spending.test.tsx --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.unit.config.ts packages/contracts/src/payroll.unit.test.ts packages/contracts/src/finance.unit.test.ts apps/web/src/features/finance/payroll-copy.unit.test.ts
    npm run typecheck
    npm run build
    npm run lint
    git diff --check

Final HTTP/DOM8/8 passed64.07s (4 payroll,4 shared-operation spending/transfer). Units3/3 passed767ms. Workspace final type/build/lint and diff check exit0. A26 final370000 and cash470000; different-actor A27 cap races; A28 retry/lost response/independent old-month payout; A01/A05 scope/revocation/no fallback/quota rollback/reserved seat retention verified.

Earlier failures were corrected and rerun, never skipped: long fixture code; heterogeneous trigger NEW access; test unary-minus/cast; contracts copy test crossing web rootDir (moved into web). Failed build generated51 source-adjacent artifacts, all new/timestamp-verified, removed; source/user files retained and outputs regenerable. Full commands/results are in the evidence document.

## Remaining limitations and unchanged work

Verification host Node25.2.1/npm11.6.2 differs from repository pins24.19.0/11.1.0; no pinned-runtime certification. Vite main-chunk warning and pg client-query deprecation warnings remain. No performance/manual mobile/screenshot/live deployment check claimed. Salary receipt/export DATA is implemented; PDF/Excel generation belongs to Phase20. No employee attendance/HRM, taxation, partial final payout, carry-forward or settled payroll correction/toggle endpoint. Independently unresolved Phase12 screenshot handoff is unchanged. No Phase19 gate work remains; do not start Phase20 automatically.
