# Current handoff

Updated: 2026-09-14 — Phase17 COMPLETE. Phase18 NOT STARTED.

## Next executable action

Stop at the Phase17 gate. On a new explicit request, start Phase18 by reading AGENTS.md, PROJECT_STATE.md, this handoff, the Phase18 file and only its named references; verify actual prerequisites/code/diff. No browser automation, subagents, model changes or live deployment. Phase12 screenshot handoff remains unresolved independently.

## Completed scope and contracts

Migration0017 adds immutable child_branch_transfers, receivable_ownership and transferred_due_items, current receivable_obligations projection, receipt-allocation ownership snapshots and tuition-correction historical ownership snapshots. Original charges/installments/receipts/cash stay immutable. Only positive canonical remaining installments count as transferred debt; zero-balance ownership anchors let later entitled reversals restore debt at the current owner. Direct branch changes require an atomic transfer.

ChildTransferService reuses FinancialCore idempotency/audit and ChildService policy. children.manage, billing.manage and finance.read are required at both placements and every existing debt owner scope. Transfers take effect on the current Cairo date, require expected child version and valid classroom, reject archived children and report advisory capacity. Commit recalculates preview balances. Same actor/key/payload replay returns the original result after current authorization, even following another transfer.

Lock order: licensing, organization, exclusive guardian scope for transfer, authenticated account/session, operation identity, child, sorted relevant agreements, obligations and installments. Recurrence locks all agreement children before its agreement; transfer never acquires siblings after agreement locks. A real worker/API deadlock was reproduced: approving-account FK lock came after the worker's child lock. runBillingBatch now takes the approving account key-share lock before children, matching authenticated writers.

Existing issued occurrences retain identity/due dates/price/attribution; new generation including delayed catch-up uses committed child placement. Stored sibling shares are never re-split. Classroom history, child audit, ownership/items, financial audit/operation and child.branch_transferred outbox are atomic. Bus/event consumers receive REVIEW_REQUIRED/automaticEnrollment:false and preserve fee references; no trip/subscription enrollment or payroll action occurs. Unused credits retain original branch/origins and existing same-branch application restrictions.

Collections/outstanding/reminders/receipt-balance summaries use current receivable ownership. Historical receipts keep source scope. Paid tuition reclassification requires original receipt scopes; tuition correction history snapshots ownership. Refund history uses its recorded funding branch, preventing current child placement from exposing source refunds. Parent permitted-child finance history remains continuous.

Bilingual /administration/child-transfers uses established controls/scoped reads/frozen-operation recovery, with preview/open debt references/due dates/destination/today/capacity/no-cash confirmation and branch receivable-in/out history. Collections links to it; parent payments includes permitted transfer history. D45, FINANCE_RULES.md and API_AND_DATA_CONTRACTS.md are updated. Full semantics, failed attempts and evidence: [CHILD_BRANCH_TRANSFERS.md](CHILD_BRANCH_TRANSFERS.md).

## Changed files

- DB/contracts: packages/db/src/migrations/0017_child_branch_transfers.sql; packages/db/src/{billing,reminders}.ts; packages/contracts/src/{child-transfers,index}.ts.
- API: apps/api/src/modules/children/service.ts; apps/api/src/modules/finance/{child-transfers,routes,ledger,corrections,reminders,receipts}.ts.
- Web: apps/web/src/App.tsx; apps/web/src/features/finance/{child-transfer-screen,child-transfer-copy,collections-screen,parent-screen}.tsx/.ts; apps/web/src/i18n/catalogs.ts.
- Tests: tests/integration/child-transfers.test.ts; tests/e2e/child-transfers.test.tsx; tests/helpers/finance.ts; tests/integration/organization-migration.test.ts.
- Docs: CHILD_BRANCH_TRANSFERS.md, FINANCE_RULES.md, API_AND_DATA_CONTRACTS.md, DECISIONS.md, PROJECT_STATE.md, HANDOFF.md.

## Actual commands and results

Node24.19.0: %TEMP%/nursery-phase07-tools/node.exe. npm11.1.0: %TEMP%/nursery-phase16-tools/node_modules/npm/bin/npm-cli.js. Prepend the Node directory to process PATH. DATABASE_URL=postgresql://postgres@127.0.0.1:55417/postgres was process-only; fresh disposable PostgreSQL18 at %TEMP%/nursery-phase17-pg. Cluster was interrupted during session change and recovered; connection-failed attempt ran no checks. The cluster is now stopped. No persistent/live database received migration0017.

    npm run test:integration -- tests/integration/corrections.test.ts tests/integration/collections.test.ts tests/integration/billing.test.ts

Prerequisites16/16 passed22.96s before implementation. Failed fixture setup/assertion attempts and the real deadlock are documented in CHILD_BRANCH_TRANSFERS.md. Broad parallel gate timed out existing10-second fixture hooks (19 pass/1 fail/32 skipped) and was not accepted. No test timeout or assertion was relaxed; the correct reminder suite was rerun with one worker.

    npm run test:integration -- tests/integration/child-transfers.test.ts tests/integration/corrections.test.ts tests/integration/finance.test.ts tests/integration/collections.test.ts tests/integration/receipts.test.ts tests/integration/finance-reminders.test.ts tests/integration/billing.test.ts tests/integration/children.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1

Passed56/56 across9 files,141.10s. Upgrade/idempotent rerun through0017 passed (18 migrations). A pg client-query deprecation warning appeared; no failures.

    npm run test:integration -- tests/integration/child-transfers.test.ts tests/integration/corrections.test.ts --maxWorkers=1

Final refinement11/11 passed37.34s. Includes paid source reversal after zero-debt transfer, original-account refund and historical visibility, repeated transfer/retry, rollback, current teacher/manager/guardian scope, source/destination authorization and real payment/recurrence contention.

    npm run test:e2e -- tests/e2e/child-transfers.test.tsx --maxWorkers=1

Final2/2 passed37.25s, English/Arabic real HTTP/DOM, actual dropped post-commit response, exactly one transfer/no destination cash, RTL/LTR and structural axe (color contrast excluded).

    npm run lint
    npm run typecheck
    npm run test:unit -- apps/web/src/i18n/catalogs.unit.test.ts packages/contracts/src/finance.unit.test.ts
    npm run build
    git diff --check

Final lint/type/build/diff passed; units4/4 passed691ms. Lint's earlier unused import was removed. Production build183 modules701.31kB/189.15kB gzip; existing >500kB warning remains.

## Worked A21 evidence and remaining limits

One EGP4,000 charge; A collects EGP1,500; exactly EGP2,500 remaining debt moves to B with the original installment/obligation/due date retained. At transfer A cash stays1,500 and B cash0; nursery debt stays2,500. Retrying creates no second transfer. B later collects2,500; final A/B cash1,500/2,500, nursery receipts4,000 and debt0. Branch in/out histories both show2,500 without creating debt or cash. Original receipt DTO and obligation rows are unchanged.

Current-date-only placement; unused credits stay at source under existing restrictions. No scheduled/backdated move, historic repricing, automatic transport/event enrollment, treasury transfer or independent-nursery transfer. No physical browser/mobile/VPS performance checks or live migration/deployment. Phase12 screenshot evidence remains unresolved separately. Phase18 is next and has not started.