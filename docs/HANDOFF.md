# Current handoff

Updated: 2026-09-14 — Phase20 COMPLETE; final safe checkpoint.

## Phase20 final evidence

The disposable PostgreSQL18.4 UTF8 cluster at `127.0.0.1:55421` ran fresh isolated schemas and all migrations through `0021_reports_exports`; no live nursery was migrated or deployed. `npm run test:integration -- --maxWorkers=1` passed 30 files/173 tests in 693.26s. This includes the complete migration path, Phase19→0021 upgrade/rerun, all 24 report kinds, A21/A24/A26 financial/payroll reconciliation, real pg-boss queue startup/retry/restart/idempotency, row caps, creator/cross-user/branch/classroom scope isolation, expiry cleanup, private HTTP paths and current authorization.

`npm run test:e2e -- --maxWorkers=1` passed 20 files/51 real bilingual DOM/HTTP checks in 503.10s; `npm run test:unit` passed 22 files/67 tests in 8.50s. Full workspace `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` all exited zero. The only emitted warnings are existing pg client deprecation, Vite chunk size, and local Node/npm-versus-pinned version mismatch.

Actual render QA: regenerated ignored `output/phase20` files were reopened with ExcelJS to validate worksheet structure/localized headers/RTL/typed dates/numeric EGP/exact piastres/formula escaping; PDFDocument and `pdfinfo` validated PDF1.7 A4, unencrypted/no forms or JavaScript and exact report metadata. Poppler-rendered English/Arabic collection samples (one page) and 30-row long-text reports (six pages) were visually inspected with no truncated rows or footer. Query plans (`EXPLAIN ANALYZE BUFFERS FORMAT JSON`) are recorded in [MANAGEMENT_REPORTS.md](MANAGEMENT_REPORTS.md): populated cash4.524ms, collections2.509ms, outstanding4.340ms, accounts0.369ms, payroll0.806ms, unpaid0.220ms; selective 10,031-child fixture used `children_scope` at0.45ms.

## Next executable action

Phase20 is complete. The disposable PG cluster was safely stopped after final inspection. Stop here; do not begin Phase21 unless explicitly requested. Port55420 remains an environment-only bind failure, while55421 was the supported local disposable runtime.

## Completed Phase19 behavior and precise files

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
