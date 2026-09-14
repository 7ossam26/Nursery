# Child branch transfer and debt ownership

Phase 17 COMPLETE, 2026-09-14. All required script gates passed; no live migration or deployment.

## Ownership and effective date

Migration `0017_child_branch_transfers.sql` adds immutable `child_branch_transfers`, `receivable_ownership`, and `transferred_due_items`. Each transfer records the child/code/name, source/destination branches and classrooms, Cairo effective date, exact outstanding total, itemized original installment IDs/due dates/balances, reason, actor, and financial operation identity. Deferred validation checks child/debt links, item totals and due dates. No charge, receipt, allocation, credit, or treasury movement is created by transferring a child.

`receivable_obligations` resolves the last committed ownership record separately from immutable `obligations.branch_id`. Canonical `installment_balances` remains the sole financial formula. Collections, outstanding totals, reminders, balance APIs, and printable receipt balance summaries use current receivable scope. Original receipt access and cash attribution retain receipt branch/classroom snapshots. New receipt allocation rows snapshot the ownership transfer, so historical reconciliation does not compare old receipts against today's owner. Tuition corrections also snapshot ownership for stable historical authorization.

Transfers take effect on the current Cairo date only. Scheduled/backdated moves are rejected rather than silently applying early or changing past rosters. Preview requires current permissions and expected child version; commit recomputes balances under locks. A concurrent collection may lower the previewed amount; the confirmation says the final balance is recalculated. Changed child placement/version requires a new preview. A lost-response retry with the same actor operation and identical payload returns the original result even after a subsequent transfer, subject to current capabilities and original scope authorization.

Issued occurrences retain their identity, due dates, original attribution and stored shares. Their outstanding ownership moves. A newly generated occurrence (including delayed catch-up issued after the move) uses the child's committed branch/classroom when generated; issued historical periods are never regenerated or repriced. Future agreement ownership derives from the authoritative child placement, not a second mutable branch setting on the agreement. Family allocation snapshots are not rewritten, including when only one sibling moves. Approval, price, pause and catch-up actions continue to require authority over all agreement children.

All original obligations receive an ownership anchor, including zero-balance obligations, but only positive remaining installments contribute transfer items or transferred amounts. This makes a later entitled receipt reversal restore debt at the current owner without inventing a transfer of paid money. A paid tuition reduction must authorize the current owner and the original receipts it reclassifies; source account/refund origin and closing rules remain intact. Existing unused credits keep their original branch and origins; this phase does not automatically move credits or relax the existing same-branch credit-application rule.

## Transaction and lock order

`ChildTransferService` reuses `ChildService.withPolicy` and `FinancialCore.operation`. Required capabilities are `children.manage`, `billing.manage`, and `finance.read`, with source/destination classroom scope and every existing receivable owner scope. Finance must be enabled and the child must not be archived. Classroom placement must belong to the destination; capacity remains advisory.

Lock order: shared installation licensing, shared organization policy, **exclusive guardian scope for transfer**, authenticated account/session, actor financial-operation lock, target child, sorted relevant agreements, sorted obligations, sorted installments. The exclusive guardian scope lock prevents parent block/link administration from authorizing against a stale branch. Transfer never takes sibling child locks after agreement locks. Recurrence takes every agreement child in ID order before the agreement; collections take their child IDs, obligations and installments in ID order before accounts. PostgreSQL transactions therefore define one committed transfer/collection/recurrence order.

The recurrence race exposed a prerequisite defect: a worker held a child while the approving account's foreign-key check waited for an API transaction holding that account and waiting for the child. `runBillingBatch` now obtains the approving account's key-share lock before child locks. Approved actor identity is immutable. The focused race reproduces contention using real PostgreSQL locks.

The transaction appends classroom history, child audit, ownership/items, and durable `child.branch_transferred` integration event together with child placement/version and the financial audit/idempotency result. Bus/event consumers receive `REVIEW_REQUIRED`, `automaticEnrollment: false`, and preservation of existing fee references. No transport/event enrollment, duplicate fee, or payroll action is performed.

## API and UI

- `POST /api/v1/finance/child-transfers/preview`: strict proposed source/destination/classroom/effective date and child version; returns current open dues and capacity warnings.
- `POST /api/v1/children/:id/branch-transfers`: same proposal plus operation ID and reason; atomic commit.
- `GET /api/v1/finance/child-transfers`: bounded scoped history and complete branch receivable-in/out totals. Transfers are movements of receivable ownership; totals are historical flows, not additional nursery debt.
- `GET /api/v1/parent/children/:id/branch-transfers`: continuous permitted-child history, revalidating active read/finance guardian links.
- Existing `GET /api/v1/finance/operations/:id` resolves uncertain outcomes.

`/administration/child-transfers` reuses controls, scoped reads, language switching, and frozen financial-operation recovery. It shows the child's current branch, destination classroom, today's effective date, original debt references/due dates, amount, capacity warnings, no-cash confirmation, and branch histories. The collections page links to it. Parent payments include the child's transfer history alongside continuous outstanding and permitted receipts. English and Egyptian Arabic use the established RTL/LTR system.

## Verification log

Runtime: Node24.19.0 from `%TEMP%/nursery-phase07-tools/node.exe`, npm11.1.0 from `%TEMP%/nursery-phase16-tools/node_modules/npm/bin/npm-cli.js`, disposable PostgreSQL18 cluster `%TEMP%/nursery-phase17-pg`, loopback55417. DATABASE_URL was process-only. No persistent/live nursery received migrations.

- Prerequisites: `npm run test:integration -- tests/integration/corrections.test.ts tests/integration/collections.test.ts tests/integration/billing.test.ts` —16/16 passed,22.96s.
- First captured transfer run:4/6; parent fixture reused a password-invalidated session and recurrence fixture did not schedule an eligible period. Corrected. Next5/6 reproduced the real account-FK/child deadlock above.
- Combined transfer/billing/correction/collection/migration run:23/24,41.66s after deadlock fix; remaining assertion compared all generated periods against the current-period snapshot. Corrected to filter original period.
- Focused transfer/correction:10/10 passed,24.65s before final source-refund/history refinements.
- `npm run test:e2e -- tests/e2e/child-transfers.test.tsx` —2/2 passed,50.10s. Real HTTP/PostgreSQL, both languages, actual dropped post-commit response, exactly one transfer, zero destination cash, RTL/LTR and structural axe (color contrast excluded). These are repository DOM scripts, not browser automation.
- PostgreSQL was interrupted at a session change. First continuation failed to connect and ran no tests; the same disposable cluster recovered and subsequent tests ran normally. Initial uncollected tool sessions are not counted as evidence.

The first broad gate attempt ran alongside type/lint and hit the existing 10-second fixture hook timeout:19 passed,1 failed,32 skipped across8 files (57.17s). It also named `reminders.test.ts`, which does not exist; the correct established suite is `finance-reminders.test.ts`. Those skipped/failed checks were not treated as passing. No timeout threshold or test assertion was relaxed. Final lint initially found one unused import; removed.

The same applicable regression suites, with the correct reminder filename and one worker, passed:

    npm run test:integration -- tests/integration/child-transfers.test.ts tests/integration/corrections.test.ts tests/integration/finance.test.ts tests/integration/collections.test.ts tests/integration/receipts.test.ts tests/integration/finance-reminders.test.ts tests/integration/billing.test.ts tests/integration/children.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1

56/56 passed across9 files,141.10s. Includes migration upgrade/idempotent rerun through0017 (18 migrations), child scope/document/lifecycle regression, exact collections/receipts, reminders, monthly workers, correction/refund and transfer contention. A pg client-query deprecation warning appeared during the run; no test failed. Final focused rerun includes the subsequent refund-history funding-branch restriction and regression assertion.

## Worked A21 evidence

The first focused transfer test creates one EGP4,000 obligation, receives EGP1,500 in A, previews/commits exactly EGP2,500 to B, verifies unchanged original obligation rows and receipt DTOs and unchanged treasury rows, replays the original transfer, then collects EGP2,500 in B.

| Checkpoint | A cash | B cash | A current debt | B current debt | Nursery debt |
|---|---:|---:|---:|---:|---:|
| Charge issued | 0 | 0 | 4,000 | 0 | 4,000 |
| First receipt | 1,500 | 0 | 2,500 | 0 | 2,500 |
| Transfer committed/replayed | 1,500 | 0 | 0 | 2,500 | 2,500 |
| Destination collection | 1,500 | 2,500 | 0 | 0 | 0 |

The installment ID, original obligation ID and due date remain unchanged. Transfer-out and transfer-in totals both show EGP2,500; they do not enter cash or duplicate nursery debt. Nursery actual collection is EGP4,000. Fully paid source reversals, multi-hop transfer identity, original-account refunds, branch-limited staff denial and parent continuous access are separately covered.

## Final gate

    npm run test:integration -- tests/integration/child-transfers.test.ts tests/integration/corrections.test.ts --maxWorkers=1

Final11/11 passed37.34s, including the last source-funded refund history restriction, paid reversal anchors, forbidden backdating, original receipt authority and stable tuition-correction visibility after a second transfer. Refund history follows its recorded funding branch rather than current child placement.

    npm run test:e2e -- tests/e2e/child-transfers.test.tsx --maxWorkers=1

Final2/2 passed37.25s, both languages and actual lost-response recovery.

    npm run lint
    npm run typecheck
    npm run test:unit -- apps/web/src/i18n/catalogs.unit.test.ts packages/contracts/src/finance.unit.test.ts
    npm run build
    git diff --check

Final lint, typecheck, build and diff check passed. Units4/4 passed691ms. Build183 modules,701.31kB/189.15kB gzip; existing >500kB bundle warning remains. The disposable PostgreSQL cluster was stopped after verification. No browser automation or live nursery migration/deployment was performed.

## Remaining limits and next phase

Current-date-only transfers; no scheduled/backdated placement, historic repricing, automatic trip enrollment, or treasury transfer. Existing unused credits retain source ownership and application restrictions. Published source records and private receipt permissions are not replaced by destination access. No physical browser/mobile/performance checks were performed; Phase12 screenshot evidence remains a separate unresolved handoff. Phase18 (bus subscriptions, trips, and participation) is next and has not started.
