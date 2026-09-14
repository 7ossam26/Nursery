# Current handoff

Updated: 2026-09-14 — Phase 18 COMPLETE.

## Next executable action

Stop after Phase 18. Phase 19 is next but has not started; begin it only on an explicit user request after reading its phase file and required references. The independently unresolved Phase 12 screenshot handoff remains unchanged. Do not use browser automation, subagents, model changes, or a live deployment as a side effect.

## Phase 18 delivered behavior

Migration `0018_bus_trips_activities.sql` adds shared `TRANSPORT`/`ACTIVITIES` module settings, delegable manage/read capabilities, bus subscriptions and append-only administrative permission events, activities/selected children, append-only external-consent and cancellation histories, and parent trip notification sources. BUS and TRIP fees use existing obligations/installments; paid/no-fee/eligibility/participation are canonical projections. A BUS charge has one installment and retains the existing exact-full-settlement rule. Explicit zero fee creates no receipt.

Current bus eligibility is active child + current service period + fully paid/no-fee + administrative permission. Activity participation is active event + selected child + fully paid/no-fee + latest recorded external guardian consent. Consent and payment remain independent. Parent invitations use the existing notification service and payment link; teachers see only selected children in their assigned scope. Module disable blocks new actions/reminders and ordinary parent notices while authorized staff history remains readable. Transfers do not enroll children or duplicate fees.

Migration `0019_trip_reduction_invariant.sql` adds only `TRIP` to the explicit reduction target check and replaces the validator's fixed TUITION predicate with exact `target_kind`/obligation-category matching. The reduction equation, origin traceability, nonnegative balances, historical receipt scope, no-correction-cash rule, and RECEIPT/EXPENSE/TRANSFER deferred branches remain unchanged. BUS reductions remain rejected.

`CorrectionService.reductionInTransaction(tx,p,id,input,due,resources)` is the transaction-neutral shared Phase16 reduction body. It does not begin/commit/rollback. Public tuition reduction retains its own operation/transaction and delegates to it. `TransportService.cancel` owns one operation/transaction, locks the activity and sorted participants before canonical financial resources, revalidates activity/finance authority, appends cancellation history and applies every TRIP reduction through that primitive. Failure rolls back both; same-operation retry replays; distinct concurrent cancellation serializes. Paid receipt value becomes source-linked noncash credit and cancellation moves no cash. TRIP reductions appear in immutable correction history.

Bilingual `/administration/transport` and `/teacher/activities` screens include management forms, operation-status recovery, bus/current eligibility, activity roster states, module-disabled history copy, and finance links only for finance readers. The child onboarding result links each new child to `/administration/transport?childId=...`. Manager options expose only existing transport/activity-manage scope without granting children or finance views. Event/service dates may be future; due dates cannot follow the activity/service end.

## Changed files

- Database/contracts: `packages/db/src/migrations/0018_bus_trips_activities.sql`, `0019_trip_reduction_invariant.sql`; `packages/db/src/reminders.ts`; `packages/contracts/src/{transport,children,communication,corrections,index,licensing,organization}.ts`.
- API: `apps/api/src/modules/finance/{transport,core,corrections,routes}.ts`; `apps/api/src/modules/{children,communication}/service.ts`.
- Web: `apps/web/src/App.tsx`; `features/finance/{transport-screen,transport-copy,spending-copy}.tsx/.ts`; `features/{auth,children}/screens.tsx`; `features/communication/copy.ts`; `i18n/catalogs.ts`.
- Tests: `tests/integration/{transport,corrections,organization-migration}.test.ts`; `tests/e2e/{transport,children}.test.tsx`.
- Docs: `FINANCE_RULES.md`, `API_AND_DATA_CONTRACTS.md`, `DECISIONS.md` (D46), `PROJECT_STATE.md`, `HANDOFF.md`.

## Actual verification

Disposable PostgreSQL18 UTF-8 cluster: `%TEMP%/nursery-phase18-pg-utf8`, loopback port55419. It was stopped after verification. No persistent/live database received migrations.

    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/transport.test.ts tests/integration/corrections.test.ts --maxWorkers=1

Final 2 files/11 tests passed in61.07s. Coverage includes A20 exact BUS settlement/idempotency/no extra cash; A32 paid-vs-consent and zero fee; A01/A02 scoped teacher/parent/finance separation; A31 disable/history/reminders; successful source-linked paid TRIP cancellation; rollback injection; same-key retry; concurrent cancellation; TUITION/TRIP/BUS and RECEIPT/EXPENSE/TRANSFER protections; finance reconciliation.

    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/organization-migration.test.ts --maxWorkers=1

Passed2/2 in11.77s. Actual Phase3/Phase5 baselines upgraded in filename order through0019, retained identity/reservations/edited role data, reported20 migrations, and reran with no new output.

    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/transport.test.tsx tests/e2e/children.test.tsx --maxWorkers=1

Passed2 files/5 tests in53.78s. English/Arabic real HTTP/DOM, live permission mutation, onboarding links/preselection, exact classroom roster, no finance link without permission, RTL/LTR and structural axe (color contrast excluded). Expected aborted polling requests were logged during test unmount/navigation; asserted operations and suites passed.

    node node_modules/vitest/vitest.mjs run --config vitest.unit.config.ts apps/web/src/i18n/catalogs.unit.test.ts packages/contracts/src/finance.unit.test.ts
    npm run lint
    npm run typecheck
    npm run build
    git diff --check

Final units4/4 passed874ms; lint/typecheck/build/diff passed. Production build transformed186 modules, 721.82kB/193.34kB gzip; the existing >500kB warning remains.

## Remaining limitations

No bus attendance, route/GPS, boarding/dropoff, parent approval form, online payment, live nursery deployment, or physical-device/performance check was added. Cancellation produces noncash credit; actual cash refund remains the separate authorized Phase16 workflow. The Phase12 screenshot handoff is still unresolved independently. Phase19 has not started.
