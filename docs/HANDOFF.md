# Current handoff

Updated: 2026-09-14 — Phase 16 COMPLETE. Phase 17 NOT STARTED.

## Next executable action

Stop at the Phase 16 gate. On a new explicit request, start Phase17 by reading root AGENTS.md, PROJECT_STATE.md, this handoff, PHASE_17_child_branch_transfer.md and only its named references. Verify prerequisites from actual code/diff. Phase12's screenshot handoff remains unresolved independently; do not silently mark it complete. No browser automation, subagents, model changes or live deployment were authorized.

## Phase 16 completion

Expenses, private expense documents, paired internal transfers, counted cash closing, sensitive receipt/expense/transfer correction, paid tuition reduction, credit application, and actual refunds are implemented. D42/D43/D44 and [EXPENSES_AND_CLOSING.md](EXPENSES_AND_CLOSING.md) hold the detailed semantics and evidence.

Migration `0016_corrections_refunds.sql` appends immutable `financial_corrections` with typed detail rows, signed allocation/obligation adjustments, source-linked credit origins, refunds, and exact correction/refund treasury legs. `credit_balances` subtracts applications and refunds; origin balances prevent source overuse. Deferred PostgreSQL validators require complete sources/legs and reject excess reversal or negative credit. Migration count is17 and actual upgrade/rerun passed. No persistent/live database received this migration.

`CorrectionService` and strict contracts/routes implement:

- PAYMENT receipt full current-date reversal with optional replacement receipt/allocation/account; originals remain visible. Already corrected or tuition-credit-reclassified receipts are rejected instead of silently unwinding linked history.
- Settled expense full current-date reversal with optional replacement; planned expense stays immutable and effective operating outflow projects REVERSED/CORRECTED.
- Transfer full current-date reversal with optional replacement pair; all original/replacement accounts are scoped/locked and total cash remains conserved.
- Tuition reduction that consumes unpaid debt first, restores newest applied credit next, then turns newest actual paid allocations into a noncash credit with original receipt/account origins.
- Actual refund bounded by aggregate credit and selected-origin availability, from the original account or an explicitly confirmed/scoped/funded alternative. One REFUND outflow is posted; applying credit posts no cash.

Every mutation requires Finance enabled, `finance.correct`, explicit sensitive entitlement even for SYSTEM, every original/replacement resource scope, reason, actor operation idempotency/audit, canonical balances, stable locks, recorded funds for cash outflows, and the shared counted-date guard. Replay revalidates current entitlement and stored scope. `/administration/corrections` provides bilingual forms, current-date/cash warnings, original source selection, immutable history and lost-response status recovery.

## Changed files

- Database/contracts: `packages/db/src/migrations/0016_corrections_refunds.sql`; `packages/contracts/src/{corrections,finance,spending,index}.ts`.
- API: `apps/api/src/modules/finance/{corrections,payments,treasury,spending,routes}.ts`.
- Web: `apps/web/src/features/finance/{corrections-screen,spending-screen,spending-copy,screen}.tsx/.ts`; `apps/web/src/App.tsx`.
- Tests: `tests/integration/corrections.test.ts`, `tests/e2e/corrections.test.tsx`, `tests/helpers/finance.ts`, `tests/integration/organization-migration.test.ts`.
- Evidence/contracts: `docs/{DECISIONS,API_AND_DATA_CONTRACTS,EXPENSES_AND_CLOSING,PROJECT_STATE,HANDOFF}.md`.

## Commands and actual results

Runtime was recreated because prior `%TEMP%` paths had been cleaned: pinned Node24.19.0, npm11.1.0, fresh disposable PostgreSQL18 `%TEMP%/nursery-phase16-pg`, loopback127.0.0.1:55416, process-only DATABASE_URL. The first prerequisite command did not run tests due missing temporary paths. After recreation:

    npm run test:integration -- tests/integration/finance.test.ts tests/integration/collections.test.ts tests/integration/receipts.test.ts

Passed20/20,26.80s.

First new correction run0/4: deferred generic triggers referenced fields absent on some NEW record shapes; every operation rolled back. Fixed with table-agnostic JSON field lookup. Focused rerun passed4/4,21.13s.

    npm run test:integration -- tests/integration/corrections.test.ts tests/integration/spending.test.ts tests/integration/closing.test.ts tests/integration/finance.test.ts tests/integration/collections.test.ts tests/integration/receipts.test.ts tests/integration/organization-migration.test.ts

Passed36/36,44.52s. Covers refund/application race, exact availability and origins, sensitive/scope/current-date denial, active-count rollback/reopen, immutable originals, source/leg validation, expense projections, transfer conservation, idempotent retry and migration0016 upgrade/rerun.

Correction/refund UI attempts initially failed on premature/stale test references only. Final focused bilingual HTTP/DOM passed2/2,17.79s. Final combined gate:

    npm run test:e2e -- tests/e2e/corrections.test.tsx tests/e2e/spending.test.tsx tests/e2e/closing.test.tsx

Passed8/8,58.06s, including real post-commit refund response loss and one outflow, English/Arabic, RTL/LTR and structural axe (color contrast excluded).

    npm run test:unit -- apps/web/src/i18n/catalogs.unit.test.ts packages/contracts/src/finance.unit.test.ts
    npm run typecheck
    npm run lint
    npm run build
    git diff --check

Units4/4,2.73s. Typecheck passed. First lint found one unused import; removed and final lint passed. Build passed:180 modules,691.26kB/187.24kB gzip, existing >500kB warning. Final diff check passed.

Final review found the alternative-refund checkbox was automatically selected when a different funding account was chosen. It now resets to unchecked and requires deliberate confirmation. Affected web typecheck/lint and bilingual correction UI reran passed2/2,17.83s.

## Remaining limitations/risks

- No manual physical browser/mobile/VPS performance measurement or live migration/deployment was performed.
- Receipt correction deliberately rejects CREDIT receipts and PAYMENT receipts already reclassified by tuition reduction; those credit/refund chains remain explicit and cannot be silently rewritten.
- Reporting/export work beyond the canonical Phase16 projections remains Phase20. Payroll and branch transfer remain Phases19 and17 respectively.
- Phase15 printable receipt is still raster-embedded rather than searchable. Phase12 screenshot evidence remains unresolved separately.

The disposable PostgreSQL cluster was stopped after final verification.
